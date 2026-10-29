"""Independent, no-send-to-leads observer. Never modifies the CAPI dispatch ledger.

Only Monday bell notifications to the configured campaign assignee are written.
An ambiguous notification is reconciled by readback, never blindly repeated.
"""
import argparse
import datetime
import json
import math
import pathlib
import re
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request
import uuid


def connect(path):
    db = sqlite3.connect(path, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA busy_timeout=10000')
    db.execute('PRAGMA synchronous=FULL')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS health(id INTEGER PRIMARY KEY CHECK(id=1),
        incident TEXT, last_ok INTEGER, reason TEXT, observed INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS monitor_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notices(seq INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL,
        kind TEXT NOT NULL, text TEXT NOT NULL, state TEXT NOT NULL
        CHECK(state IN ('PENDING','SENDING','ACKED','FAILED','UNKNOWN')),
        at INTEGER NOT NULL, receipt TEXT);
    ''')
    return db


def bind(db, cfg):
    value = json.dumps([cfg['container'], cfg['board'], cfg['recipient']], separators=(',', ':'))
    db.execute('BEGIN IMMEDIATE')
    try:
        row = db.execute("SELECT value FROM monitor_meta WHERE key='binding'").fetchone()
        if row and row[0] != value:
            raise ValueError('monitor_target_changed_review_required')
        db.execute("INSERT INTO monitor_meta VALUES('binding',?) ON CONFLICT DO NOTHING", (value,))
        db.execute('COMMIT')
    except BaseException:
        db.execute('ROLLBACK')
        raise


def observe(db, ok, reason, now, prefix='[CAPI]'):
    if not isinstance(ok, bool) or not re.fullmatch(r'[a-z_]{2,60}', reason):
        raise ValueError('invalid_health_observation')
    db.execute('BEGIN IMMEDIATE')
    try:
        previous = db.execute('SELECT * FROM health WHERE id=1').fetchone()
        incident = previous['incident'] if previous else None
        kind = None
        if not ok and not incident:
            incident = 'CAPI-' + uuid.uuid4().hex[:16]
            kind = 'FAILURE'
        elif ok and incident:
            kind = 'RECOVERY'
        if kind:
            timestamp = datetime.datetime.fromtimestamp(now / 1000, datetime.timezone.utc).isoformat()
            message = 'נדרש טיפול בעובד CAPI' if kind == 'FAILURE' else 'עובד CAPI חזר לפעולה תקינה'
            text = f'{prefix} {kind}: {message}. incident={incident}; reason={reason}; UTC={timestamp}'
            db.execute('INSERT INTO notices(key,kind,text,state,at) VALUES(?,?,?,?,?)',
                       (incident + ':' + kind, kind, text, 'PENDING', now))
        db.execute('INSERT INTO health VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET '
                   'incident=excluded.incident,last_ok=excluded.last_ok,reason=excluded.reason,observed=excluded.observed',
                   (None if ok else incident, int(ok), reason, now))
        db.execute('COMMIT')
        return kind
    except BaseException:
        db.execute('ROLLBACK')
        raise


def health(ledger, container, now, max_scan_age=660000, startup_grace=90000):
    """Container state and read-only committed worker state, never fault text."""
    if container.get('Paused'):
        return False, 'worker_paused'
    if not container.get('Running'):
        return False, 'worker_not_running'
    status = container.get('Health', {}).get('Status')
    if status == 'starting':
        try:
            started = datetime.datetime.fromisoformat(container['StartedAt'].replace('Z', '+00:00'))
            if 0 <= now - started.timestamp() * 1000 <= startup_grace:
                return None, 'startup_grace'
        except (KeyError, ValueError):
            pass
    if status != 'healthy':
        return False, 'container_unhealthy'
    try:
        db = sqlite3.connect(pathlib.Path(ledger).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
        try:
            scan_row = db.execute("SELECT value FROM capi_meta WHERE key='scan'").fetchone()
            scan = json.loads(scan_row[0]) if scan_row else None
            if not isinstance(scan, dict) or type(scan.get('at')) not in (int, float) or not math.isfinite(scan['at']):
                return False, 'scan_missing'
            age = now - scan['at']
            if age < -300000 or age > max_scan_age:
                return False, 'scan_stale'
            if scan.get('error'):
                return False, 'scan_failed'
            if db.execute('SELECT count(*) FROM capi_issues').fetchone()[0]:
                return False, 'dispatch_issues'
            if db.execute("SELECT count(*) FROM capi_dispatch WHERE state IN ('FAILED','UNKNOWN') "
                          "OR (state='SENDING' AND at<?)", (now - 60000,)).fetchone()[0]:
                return False, 'dispatch_unsettled'
            return True, 'healthy'
        finally:
            db.close()
    except (OSError, sqlite3.Error, ValueError, TypeError):
        return False, 'ledger_unavailable'


class MondayNotifications:
    def __init__(self, token, api_version, recipient, board, opener=None):
        if not token or re.search(r'\s', token) or not re.fullmatch(r'202\d-(01|04|07|10)', api_version):
            raise ValueError('invalid_notification_configuration')
        if not all(re.fullmatch(r'\d{1,20}', str(x)) for x in [recipient, board]):
            raise ValueError('invalid_notification_target')
        self.token, self.version, self.recipient, self.board = token, api_version, str(recipient), str(board)
        self.opener = opener or urllib.request.build_opener(NoRedirect()).open

    def request(self, query, variables):
        req = urllib.request.Request('https://api.monday.com/v2',
            data=json.dumps({'query': query, 'variables': variables}).encode(),
            headers={'Content-Type': 'application/json', 'Authorization': self.token, 'API-Version': self.version}, method='POST')
        # Reject redirect responses instead of forwarding a credential elsewhere.
        with self.opener(req, timeout=15) as response:
            if response.geturl() != 'https://api.monday.com/v2':
                raise ValueError('notification_redirect_rejected')
            if response.status != 200:
                raise ValueError('notification_http_rejected')
            data = json.load(response)
        if data.get('errors') or not isinstance(data.get('data'), dict):
            raise ValueError('notification_graphql_rejected')
        return data['data']

    def send(self, text):
        data = self.request('mutation($user:ID!,$target:ID!,$text:String!){create_notification('
            'user_id:$user,target_id:$target,text:$text,target_type:Project){text}}',
            {'user': self.recipient, 'target': self.board, 'text': text})
        if data.get('create_notification', {}).get('text') != text:
            raise ValueError('notification_ack_missing')

    def find(self, text):
        # notifications queries are scoped to the signed-in user only.
        data = self.request('query{me{id} notifications(limit:100){id text}}', {})
        if str(data.get('me', {}).get('id')) != self.recipient:
            return False
        return any(n.get('text') == text for n in data.get('notifications', []))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def deliver(db, notifier, now):
    """One durable claim per tick; unknown sends are read-only reconciliation."""
    db.execute('BEGIN IMMEDIATE')
    try:
        row = db.execute("SELECT * FROM notices WHERE state!='ACKED' ORDER BY seq LIMIT 1").fetchone()
        if not row:
            db.execute('COMMIT')
            return 'idle'
        if row['state'] == 'PENDING':
            db.execute("UPDATE notices SET state='SENDING' WHERE key=? AND state='PENDING'", (row['key'],))
            claimed = True
        else:
            claimed = False
        db.execute('COMMIT')
    except BaseException:
        db.execute('ROLLBACK')
        raise
    if not claimed:
        # No second POST even if the first process died after the provider accepted.
        try:
            if notifier.find(row['text']):
                db.execute("UPDATE notices SET state='ACKED',receipt='readback_confirmed' WHERE key=?", (row['key'],))
                return 'reconciled'
        except Exception:
            pass
        return 'attention'
    try:
        notifier.send(row['text'])
        db.execute("UPDATE notices SET state='ACKED',receipt='api_accepted' WHERE key=?", (row['key'],))
        return 'acknowledged'
    except urllib.error.HTTPError as error:
        # Authentication and rate-limit rejection are known non-delivery, but
        # still require review instead of repeated notifications on every tick.
        state = 'FAILED' if error.code in [400, 401, 403, 429] else 'UNKNOWN'
    except Exception:
        state = 'UNKNOWN'
    db.execute('UPDATE notices SET state=?,receipt=? WHERE key=?', (state, 'review_required_no_retry', row['key']))
    return 'attention'


def load_config(file):
    cfg = json.loads(pathlib.Path(file).read_text())
    if not re.fullmatch(r'[a-z0-9-]{1,60}', cfg['campaign']) or not re.fullmatch(r'[a-z0-9_-]{1,100}', cfg['container']):
        raise ValueError('invalid_monitor_binding')
    root = pathlib.Path(cfg['root'])
    campaign = json.loads((root / 'src/config/campaigns' / (cfg['campaign'] + '.json')).read_text())
    assignees = campaign['intake']['assignees']
    if len(assignees) != 1 or assignees[0]['kind'] != 'person':
        raise ValueError('explicit_single_notification_owner_required')
    cfg['recipient'] = str(assignees[0]['id'])
    cfg['board'] = str(campaign['board'])
    if cfg['notificationPrefix'] != '[CAPI]' or cfg['maxScanAgeMs'] != 660000 or cfg['startupGraceMs'] != 90000:
        raise ValueError('unexpected_health_policy')
    return cfg


def run(file):
    cfg = load_config(file)
    now = int(time.time() * 1000)
    try:
        result = subprocess.run(['docker', 'inspect', '--format', '{{json .State}}', cfg['container']],
            capture_output=True, text=True, timeout=8, check=True)
        container = json.loads(result.stdout)
        ok, reason = health(cfg['ledger'], container, now, cfg['maxScanAgeMs'], cfg['startupGraceMs'])
    except Exception:
        ok, reason = False, 'container_unavailable'
    state_path = pathlib.Path(cfg['state'])
    state_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = connect(state_path)
    try:
        bind(db, cfg)
        kind = observe(db, ok, reason, now, cfg['notificationPrefix']) if ok is not None else None
        token = pathlib.Path(cfg['tokenFile']).read_text().strip()
        opener = urllib.request.build_opener(NoRedirect()).open
        notifier = MondayNotifications(token, cfg['apiVersion'], cfg['recipient'], cfg['board'], opener)
        delivery = deliver(db, notifier, now)
        states = dict(db.execute('SELECT state,count(*) FROM notices GROUP BY state').fetchall())
        result = {'service': 'capi-monitor', 'health': 'STARTING' if ok is None else 'PASS' if ok else 'FAIL',
                  'reason': reason, 'transition': kind, 'delivery': delivery, 'notificationStates': states,
                  'whatsapp': False, 'ledgerReadOnly': True}
        print(json.dumps(result))
        return 2 if delivery == 'attention' else 0
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    try:
        raise SystemExit(run(args.config))
    except Exception:
        print(json.dumps({'service': 'capi-monitor', 'status': 'BLOCKED', 'code': 'monitor_failure_no_secrets_logged'}))
        raise SystemExit(3)
