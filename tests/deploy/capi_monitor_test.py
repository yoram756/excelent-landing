"""Local monitor contracts. Production delivery is a separate acceptance gate."""
import contextlib
import importlib.util
import io
import json
import pathlib
import sqlite3
import tempfile
import unittest
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('capi_monitor', ROOT / 'src/integrations/meta-capi/monitor.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Notifier:
    def __init__(self):
        self.calls = []
        self.received = []
        self.error = None

    def send(self, text):
        self.calls.append(text)
        if self.error:
            raise self.error
        self.received.append(text)

    def find(self, text):
        return text in self.received


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self.temp.name)
        self.db_path = self.base / 'monitor.sqlite'
        self.db = m.connect(self.db_path)
        self.notifier = Notifier()
        self.now = 1793290000000
        self.ledger = self.base / 'capi.sqlite'
        db = sqlite3.connect(self.ledger)
        db.executescript('CREATE TABLE capi_meta(key TEXT,value TEXT);CREATE TABLE capi_issues(code TEXT);'
                         'CREATE TABLE capi_dispatch(state TEXT,at INTEGER);')
        db.execute('INSERT INTO capi_meta VALUES(?,?)', ('scan', json.dumps({'at': self.now, 'error': None})))
        db.commit()
        db.close()
        self.container = {'Running': True, 'Paused': False, 'Health': {'Status': 'healthy'}}

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_initial_health_is_silent(self):
        self.assertIsNone(m.observe(self.db, True, 'healthy', self.now))
        self.assertEqual(m.deliver(self.db, self.notifier, self.now), 'idle')
        self.assertEqual(self.notifier.calls, [])

    def test_failure_repetition_and_restart_send_once(self):
        m.observe(self.db, False, 'worker_not_running', self.now)
        self.assertEqual(m.deliver(self.db, self.notifier, self.now), 'acknowledged')
        self.db.close()
        self.db = m.connect(self.db_path)
        for _ in range(3):
            m.observe(self.db, False, 'scan_stale', self.now + 1)
            self.assertEqual(m.deliver(self.db, self.notifier, self.now), 'idle')
        self.assertEqual(len(self.notifier.calls), 1)

    def test_recovery_once_then_new_incident(self):
        for ok, reason in [(False, 'scan_failed'), (False, 'scan_failed'), (True, 'healthy'), (True, 'healthy')]:
            m.observe(self.db, ok, reason, self.now)
            m.deliver(self.db, self.notifier, self.now)
        self.assertEqual(len(self.notifier.calls), 2)
        self.assertIn('FAILURE', self.notifier.calls[0])
        self.assertIn('RECOVERY', self.notifier.calls[1])
        m.observe(self.db, False, 'scan_stale', self.now)
        m.deliver(self.db, self.notifier, self.now)
        self.assertEqual(len(self.notifier.calls), 3)
        self.assertNotEqual(self.notifier.calls[0], self.notifier.calls[2])

    def test_ambiguous_send_never_repeated_and_readback_reconciles(self):
        m.observe(self.db, False, 'scan_failed', self.now)
        self.notifier.error = TimeoutError('secret fake-provider-body must never enter state')
        self.assertEqual(m.deliver(self.db, self.notifier, self.now), 'attention')
        self.assertEqual(m.deliver(self.db, self.notifier, self.now), 'attention')
        self.assertEqual(len(self.notifier.calls), 1)
        self.notifier.received.append(self.notifier.calls[0])
        self.assertEqual(m.deliver(self.db, self.notifier, self.now), 'reconciled')
        self.assertNotIn('fake-provider', str([tuple(r) for r in self.db.execute('SELECT * FROM notices')]))

    def test_crash_after_reservation_reconciles_without_second_post(self):
        m.observe(self.db, False, 'scan_failed', self.now)
        row = self.db.execute('SELECT * FROM notices').fetchone()
        self.db.execute("UPDATE notices SET state='SENDING'")
        self.notifier.received.append(row['text'])
        self.assertEqual(m.deliver(self.db, self.notifier, self.now), 'reconciled')
        self.assertEqual(self.notifier.calls, [])

    def test_rejected_send_is_recorded_without_retry(self):
        m.observe(self.db, False, 'scan_failed', self.now)
        self.notifier.error = urllib.error.HTTPError('https://api.monday.com/v2', 403, 'denied', {}, None)
        m.deliver(self.db, self.notifier, self.now)
        self.assertEqual(self.db.execute('SELECT state FROM notices').fetchone()[0], 'FAILED')
        m.deliver(self.db, self.notifier, self.now)
        self.assertEqual(len(self.notifier.calls), 1)

    def test_health_is_read_only_and_pause_detected_immediately(self):
        before = self.ledger.read_bytes()
        self.assertEqual(m.health(self.ledger, self.container, self.now), (True, 'healthy'))
        self.container['Paused'] = True
        self.assertEqual(m.health(self.ledger, self.container, self.now), (False, 'worker_paused'))
        self.assertEqual(self.ledger.read_bytes(), before)

    def test_stale_scan_and_failure_and_unsettled_dispatch(self):
        self.assertEqual(m.health(self.ledger, self.container, self.now + 660001), (False, 'scan_stale'))
        with contextlib.closing(sqlite3.connect(self.ledger)) as db:
            db.execute('UPDATE capi_meta SET value=?', (json.dumps({'at': self.now, 'error': 'private detail'}),))
            db.commit()
        self.assertEqual(m.health(self.ledger, self.container, self.now), (False, 'scan_failed'))
        with contextlib.closing(sqlite3.connect(self.ledger)) as db:
            db.execute('UPDATE capi_meta SET value=?', (json.dumps({'at': self.now}),))
            db.execute('INSERT INTO capi_dispatch VALUES(?,?)', ('UNKNOWN', self.now))
            db.commit()
        self.assertEqual(m.health(self.ledger, self.container, self.now), (False, 'dispatch_unsettled'))

    def test_missing_ledger_never_created(self):
        missing = self.base / 'missing.sqlite'
        self.assertEqual(m.health(missing, self.container, self.now), (False, 'ledger_unavailable'))
        self.assertFalse(missing.exists())

    def test_startup_grace_is_bounded(self):
        self.container['Health']['Status'] = 'starting'
        self.container['StartedAt'] = m.datetime.datetime.fromtimestamp(self.now / 1000, m.datetime.timezone.utc).isoformat()
        self.assertEqual(m.health(self.ledger, self.container, self.now), (None, 'startup_grace'))
        self.assertEqual(m.health(self.ledger, self.container, self.now + 90001), (False, 'container_unhealthy'))

    def test_adapter_uses_configured_target_and_no_secret_in_payload(self):
        seen = []
        class Response(io.StringIO):
            status = 200
            def geturl(self):return 'https://api.monday.com/v2'
        def opener(req, timeout):
            seen.append(req)
            return Response(json.dumps({'data': {'create_notification': {'text': 'safe alert'}}}))
        client = m.MondayNotifications('synthetic-monitor-credential', '2026-10', '123', '456', opener)
        client.send('safe alert')
        body = json.loads(seen[0].data)
        self.assertEqual(body['variables'], {'user': '123', 'target': '456', 'text': 'safe alert'})
        self.assertNotIn('synthetic-monitor-credential', seen[0].data.decode())
        self.assertEqual(seen[0].get_header('Authorization'), 'synthetic-monitor-credential')
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.invalid'))

    def test_wrong_recipient_readback_never_confirms(self):
        class Client(m.MondayNotifications):
            def request(self, q, v):return {'me': {'id': '999'}, 'notifications': [{'text': 'alert'}]}
        self.assertFalse(Client('synthetic', '2026-10', '123', '456').find('alert'))

    def test_persistent_target_binding_rejects_changed_recipient(self):
        cfg = {'container': 'configured-worker', 'board': '456', 'recipient': '123'}
        m.bind(self.db, cfg)
        m.bind(self.db, cfg)
        with self.assertRaises(ValueError):m.bind(self.db, {**cfg, 'recipient': '789'})

    def test_invalid_scan_time_and_recent_or_stale_inflight(self):
        with contextlib.closing(sqlite3.connect(self.ledger)) as db:
            db.execute('UPDATE capi_meta SET value=?', ('{"at":NaN}',))
            db.commit()
        self.assertEqual(m.health(self.ledger, self.container, self.now), (False, 'scan_missing'))
        with contextlib.closing(sqlite3.connect(self.ledger)) as db:
            db.execute('UPDATE capi_meta SET value=?', (json.dumps({'at': self.now}),))
            db.execute("INSERT INTO capi_dispatch VALUES('SENDING',?)", (self.now,))
            db.commit()
        self.assertEqual(m.health(self.ledger, self.container, self.now), (True, 'healthy'))
        self.assertEqual(m.health(self.ledger, self.container, self.now + 60001), (False, 'dispatch_unsettled'))


if __name__ == '__main__':unittest.main(verbosity=2)
