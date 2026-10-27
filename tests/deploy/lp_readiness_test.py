import importlib.util
import pathlib
import unittest
from unittest import mock
from types import SimpleNamespace

source = pathlib.Path(__file__).resolve().parents[2] / 'scripts/lp-release-readiness.py'
spec = importlib.util.spec_from_file_location('lp_readiness', source)
readiness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readiness)

class ReadinessTest(unittest.TestCase):
    def test_single_200_cannot_hide_a_later_502(self):
        samples = iter([[{'ready': True}], [{'ready': False, 'publicStatus': 502}],
                        [{'ready': True}], [{'ready': True}]])
        result = readiness.wait_ready(lambda: next(samples), max_attempts=4, sleep=lambda _: None)
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(len(result['attempts']), 4)
        self.assertEqual(result['attempts'][1]['checks'][0]['publicStatus'], 502)

    def test_bounded_failure_and_no_false_pass_for_partial_routes(self):
        result = readiness.wait_ready(lambda: [{'ready': True}, {'ready': False}], max_attempts=3, sleep=lambda _: None)
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual(len(result['attempts']), 3)

    def test_empty_probe_is_not_readiness(self):
        result = readiness.wait_ready(lambda: [], max_attempts=2, sleep=lambda _: None)
        self.assertEqual(result['status'], 'FAIL')

    def test_invalid_retry_policy_is_refused(self):
        with self.assertRaises(ValueError):
            readiness.wait_ready(lambda: [], max_attempts=100)

    def test_public_502_with_good_nginx_is_attributed_to_ingress(self):
        error = readiness.urllib.error.HTTPError('https://example.invalid', 502, 'Bad Gateway', {}, None)
        with mock.patch.object(pathlib.Path, 'read_bytes', return_value=b'asset'), \
             mock.patch.object(readiness.urllib.request, 'urlopen', side_effect=error), \
             mock.patch.object(readiness.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=b'asset')):
            checks = readiness.observe(pathlib.Path('/unit'))
        self.assertTrue(all(c['component'] == 'public_ingress' and not c['ready'] for c in checks))

    def test_failed_component_probe_does_not_claim_nginx_is_broken(self):
        error = readiness.urllib.error.HTTPError('https://example.invalid', 502, 'Bad Gateway', {}, None)
        with mock.patch.object(pathlib.Path, 'read_bytes', return_value=b'asset'), \
             mock.patch.object(readiness.urllib.request, 'urlopen', side_effect=error), \
             mock.patch.object(readiness.subprocess, 'run', side_effect=OSError('unavailable')):
            checks = readiness.observe(pathlib.Path('/unit'))
        self.assertTrue(all(c['component'] == 'probe_unavailable' for c in checks))

if __name__ == '__main__':
    unittest.main()
