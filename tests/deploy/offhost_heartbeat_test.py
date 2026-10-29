import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('offhost_heartbeat', ROOT / 'src/services/monitoring/offhost-heartbeat.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class HeartbeatTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self.temp.name)
        self.config = json.loads((ROOT / 'deploy/offhost/heartbeat.json').read_text())
        self.url = 'https://' + self.config['pingHost'] + '/' + str(uuid.UUID(int=0))
        self.secret = self.dir / 'secret'
        self.secret.write_text(self.url)
        self.calls = []

    def tearDown(self):self.temp.cleanup()

    def opener(self, req, timeout):
        self.calls.append((req, timeout))
        url = self.url
        class Response(io.BytesIO):
            status = 200
            def geturl(self):return url
        return Response(b'OK')

    def test_empty_authenticated_ping_without_other_provider_access(self):
        result = m.send(self.config, self.secret, self.opener)
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(len(self.calls), 1)
        request, timeout = self.calls[0]
        self.assertEqual(request.full_url, self.url)
        self.assertEqual(request.method, 'GET')
        self.assertIsNone(request.data)
        self.assertEqual(timeout, 10)
        self.assertNotIn('Authorization', request.headers)
        self.assertNotIn(self.url, json.dumps(result))

    def test_unsafe_url_rejected_before_network(self):
        invalid = [self.url.replace('https:', 'http:'), self.url.replace('hc-ping.com', 'hc-ping.com.attacker.invalid'),
                   self.url.replace('hc-ping.com', 'user:password@hc-ping.com'), self.url + '/fail',
                   self.url + '?create=1', self.url + '#fragment', self.url.replace('hc-ping.com', 'hc-ping.com:443'),
                   self.url + '\nnext', self.url.replace('hc-ping.com', 'localhost'), self.url.replace('hc-ping.com', '127.0.0.1')]
        for url in invalid:
            with self.subTest(urlKind=invalid.index(url)):
                self.secret.write_text(url)
                self.assertEqual(m.send(self.config, self.secret, self.opener)['status'], 'FAIL')
        self.assertEqual(self.calls, [])

    def test_secret_response_and_exception_never_logged(self):
        def fail(req, timeout):raise RuntimeError(self.url + ' private-provider-error')
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            result = m.send(self.config, self.secret, fail)
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual(output.getvalue(), '')
        self.assertNotIn(self.url, json.dumps(result))
        self.assertNotIn('private-provider-error', json.dumps(result))

    def test_provider_failure_is_not_success(self):
        def fail(req, timeout):
            class Response(io.BytesIO):
                status = 503
                def geturl(inner):return self.url
            return Response(b'OK')
        self.assertEqual(m.send(self.config, self.secret, fail)['status'], 'FAIL')

    def test_unexpected_body_not_success(self):
        def bad(req, timeout):
            class Response(io.BytesIO):
                status = 200
                def geturl(inner):return self.url
            return Response(b'error: private body')
        self.assertEqual(m.send(self.config, self.secret, bad)['status'], 'FAIL')

    def test_redirect_not_followed(self):
        self.assertIsNone(m.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.invalid'))
        def redirect(req, timeout):
            class Response(io.BytesIO):
                status = 200
                def geturl(inner):return 'https://elsewhere.invalid'
            return Response(b'OK')
        self.assertEqual(m.send(self.config, self.secret, redirect)['status'], 'FAIL')

    def test_missing_or_oversized_credential_is_no_send(self):
        self.assertEqual(m.send(self.config, self.dir / 'absent', self.opener)['status'], 'FAIL')
        self.secret.write_text('x' * 513)
        self.assertEqual(m.send(self.config, self.secret, self.opener)['status'], 'FAIL')
        self.assertEqual(self.calls, [])

    def test_changed_delivery_or_policy_rejected_before_send(self):
        for change in [{'pingHost': 'elsewhere.invalid'}, {'timeoutSeconds': 0}, {'timeoutSeconds': True},
                       {'intervalSeconds': 1}, {'externalGraceSeconds': 0}, {'notificationChannel': 'whatsapp'}, {'plan': 'paid'}]:
            with self.assertRaises(ValueError):m.send({**self.config, **change}, self.secret, self.opener)
        self.assertEqual(self.calls, [])

    def test_cli_missing_credentials_logs_no_secret(self):
        config = self.dir / 'config.json';config.write_text(json.dumps(self.config))
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = m.run(['--config', str(config), '--secret-file', str(self.dir / 'absent')])
        self.assertEqual(code, 1)
        self.assertNotIn(self.url, output.getvalue())

    def test_units_only_start_the_isolated_sender_and_load_protected_credential(self):
        unit = (ROOT / 'deploy/offhost/excelent-vps-heartbeat.service').read_text()
        timer = (ROOT / 'deploy/offhost/excelent-vps-heartbeat.timer').read_text()
        self.assertIn('DynamicUser=yes', unit)
        self.assertIn('LoadCredential=healthchecks_url:', unit)
        self.assertIn('ProtectSystem=strict', unit)
        self.assertIn('OnUnitActiveSec=60s', timer)
        self.assertNotIn('docker', unit.split('ExecStart=')[1].split('\n')[0])
        self.assertNotIn(self.url, unit + timer)


if __name__ == '__main__':unittest.main(verbosity=2)
