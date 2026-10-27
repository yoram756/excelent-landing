"""Bounded read-only ingress/readiness checks; never changes routing or creates leads."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import time
import urllib.error
import urllib.request

ORIGIN = 'https://refi.excelentfinance.com'
ROUTES = [('/', 'site/refi-cro/index.html'), ('/index', 'site/lp1v2/index.html')]

def observe(root):
    checks = []
    for route, file in ROUTES:
        expected = (root / file).read_bytes()
        item = {'url': ORIGIN + route, 'publicStatus': None, 'publicBytesMatch': False}
        try:
            with urllib.request.urlopen(ORIGIN + route, timeout=5) as response:
                body = response.read()
                item.update(publicStatus=response.status, publicBytesMatch=body == expected,
                            publicSha256=hashlib.sha256(body).hexdigest(), server=response.headers.get('Server'))
        except urllib.error.HTTPError as error:
            # Known public error only; no request headers, cookies or tokens.
            item.update(publicStatus=error.code, errorClass='HTTPError', server=error.headers.get('Server'))
            error.close()
        except (OSError, ValueError) as error:
            item['errorClass'] = type(error).__name__
        try:
            direct = subprocess.run(['docker', 'exec', 'lp-lp-1', 'wget', '-q', '-O', '-',
                                     'http://127.0.0.1' + route], capture_output=True, timeout=5)
            item.update(nginxExitCode=direct.returncode, nginxBytesMatch=direct.stdout == expected)
        except (OSError, subprocess.TimeoutExpired):
            item.update(nginxExitCode=None, nginxBytesMatch=False)
        item['ready'] = item['publicStatus'] == 200 and item['publicBytesMatch'] and item['nginxBytesMatch']
        item['component'] = ('healthy' if item['ready'] else 'probe_unavailable' if item['nginxExitCode'] is None
                             else 'public_ingress' if item['nginxBytesMatch'] else 'nginx_or_files')
        checks.append(item)
    return checks

def wait_ready(probe, max_attempts=6, consecutive=2, delay=1, sleep=time.sleep):
    if not 1 <= consecutive <= max_attempts <= 10 or not 0 <= delay <= 3:
        raise ValueError('Bounded readiness policy required')
    history, streak = [], 0
    for attempt in range(1, max_attempts + 1):
        checks = probe()
        ready = bool(checks) and all(check.get('ready') is True for check in checks)
        history.append({'attempt': attempt, 'checks': checks, 'ready': ready})
        streak = streak + 1 if ready else 0
        if streak >= consecutive:
            return {'status': 'PASS', 'attempts': history, 'consecutiveReady': streak}
        if attempt < max_attempts:
            sleep(delay)
    return {'status': 'FAIL', 'attempts': history, 'consecutiveReady': streak}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='/docker/lp')
    args = parser.parse_args()
    result = wait_ready(lambda: observe(pathlib.Path(args.root)))
    print(json.dumps(result), flush=True)
    raise SystemExit(0 if result['status'] == 'PASS' else 1)
