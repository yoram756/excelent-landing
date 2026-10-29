"""Deploy only the public landing container; never writes to n8n or sends a lead."""
import datetime
import hashlib
import json
import os
import pathlib
import sqlite3
import subprocess
import sys
import time
import urllib.request
import urllib.parse

ROOT = pathlib.Path('/docker/lp')
BASE = pathlib.Path('/docker/campaign-pages-20261029')
ORIGIN = 'https://refi.excelentfinance.com'
COMPOSE = ['docker', 'compose', '-f', 'docker-compose.yml']
RESTART = COMPOSE + ['up', '-d', '--no-deps', '--force-recreate', '--pull', 'never', 'lp']
NGINX_TEST = COMPOSE + ['run', '--rm', '--no-deps', '--label', 'traefik.enable=false', 'lp', 'nginx', '-t']

def command(args):
    return subprocess.check_output(args, cwd=ROOT, text=True, stderr=subprocess.STDOUT, timeout=90).strip()

def save(name, value):
    target = BASE / name
    with target.open('x') as handle:
        json.dump(value, handle, indent=2)
    target.chmod(0o600)

def snapshot():
    db = sqlite3.connect('file:/var/lib/docker/volumes/n8n-qhxa_n8n_data/_data/database.sqlite?mode=ro', uri=True)
    workflows = {row[0]: hashlib.sha256(json.dumps(row[1:], separators=(',', ':')).encode()).hexdigest()
                 for row in db.execute('SELECT id,active,nodes,connections,settings FROM workflow_entity ORDER BY id')}
    db.close()
    services = ['excelent-lock-lock-server-1', 'excelent-wa-intake', 'excelent-wa-isolated-20261028-resume', 'n8n-qhxa-n8n-1', 'excelent-capi-worker-1']
    return {'workflows': workflows, 'services': {name: command(['docker', 'inspect', '--format', '{{.Id}} {{.State.StartedAt}} {{.State.Running}}', name]) for name in services},
            'monitorTimers': {name: command(['systemctl', 'is-active', name]) for name in ['excelent-capi-monitor.timer', 'excelent-vps-heartbeat.timer']}}

def observe(pages):
    checks = []
    for route in ['/', '/thank-you'] + [route for page in pages for route in [page['route'], page['route'] + '/thank-you']]:
        file = ROOT / 'site/refi-cro' / ('index.html' if route == '/' else route.strip('/') + '/index.html')
        expected = file.read_bytes()
        item = {'route': route, 'status': None, 'bytesMatch': False, 'directMatch': False}
        try:
            with urllib.request.urlopen(ORIGIN + route, timeout=5) as response:
                data = response.read()
                item.update(status=response.status, bytesMatch=data == expected, sha256=hashlib.sha256(data).hexdigest())
        except (OSError, ValueError) as error:
            item['errorClass'] = type(error).__name__
        direct = subprocess.run(['docker', 'exec', 'lp-lp-1', 'wget', '-q', '-O', '-', 'http://127.0.0.1' + route], capture_output=True, timeout=6)
        item['directMatch'] = direct.returncode == 0 and direct.stdout == expected
        checks.append(item)
    return checks

def main():
    expected_commit = sys.argv[1]
    if len(expected_commit) != 40 or any(char not in '0123456789abcdef' for char in expected_commit):
        raise ValueError('Expected a complete source commit')
    if command(['git', 'diff', '--name-only']) or command(['git', 'diff', '--cached', '--name-only']):
        raise RuntimeError('Preserve tracked server changes')
    BASE.mkdir(mode=0o700)
    old = command(['git', 'rev-parse', 'HEAD'])
    before = snapshot()
    save('before.json', {'commit': old, 'snapshot': before})
    archive = BASE / 'public-site-before.tar'
    with archive.open('xb') as handle:
        subprocess.run(['git', 'archive', '--format=tar', 'HEAD', 'site/refi-cro'], cwd=ROOT, stdout=handle, check=True, timeout=30)
    archive.chmod(0o600)
    os.umask(0o022)
    pulled = False
    try:
        command(['git', 'pull', '--ff-only', 'origin', 'codex/lock-service-20261025'])
        pulled = True
        if command(['git', 'rev-parse', 'HEAD']) != expected_commit:
            raise RuntimeError('Unexpected deployment revision')
        nginx = command(NGINX_TEST)
        save('nginx-test.json', {'status': 'PASS', 'output': nginx})
        command(RESTART)
        command(['docker', 'exec', 'lp-lp-1', 'nginx', '-t'])
        pages = [json.loads(file.read_text()) for file in sorted((ROOT / 'config/landing/campaigns').glob('*.json'))]
        if len(pages) != 3:
            raise RuntimeError('Expected three campaign pages')
        rounds, streak = [], 0
        for attempt in range(6):
            checks = observe(pages)
            ok = all(item['status'] == 200 and item['bytesMatch'] and item['directMatch'] for item in checks)
            rounds.append({'attempt': attempt + 1, 'checks': checks})
            streak = streak + 1 if ok else 0
            if streak == 2:
                break
            time.sleep(1)
        save('readiness.json', {'status': 'PASS' if streak == 2 else 'FAIL', 'rounds': rounds})
        if streak != 2:
            raise RuntimeError('Public or direct readiness failed')
        redirects = []
        for page in pages:
            with urllib.request.urlopen(ORIGIN + '/?utm_campaign=' + page['attributionCampaign'] + '&utm_source=synthetic_deployment_readonly', timeout=5) as response:
                ok = response.status == 200 and urllib.parse.urlsplit(response.url).path == page['route']
                redirects.append({'campaign': page['attributionCampaign'], 'target': urllib.parse.urlsplit(response.url).path, 'status': 'PASS' if ok else 'FAIL'})
        if not all(item['status'] == 'PASS' for item in redirects):
            raise RuntimeError('Legacy campaign redirect failed')
        after = snapshot()
        preserved = before == after
        save('after.json', {'snapshot': after, 'preserved': preserved})
        result = {'status': 'PASS' if preserved else 'FAIL', 'commit': expected_commit, 'previousCommit': old, 'publicPages': 8, 'consecutiveReady': streak,
                  'legacyRedirects': redirects, 'otherServicesAndN8nPreserved': preserved, 'leadPosts': 0, 'whatsappSends': 0,
                  'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        save('result.json', result)
        if not preserved:
            raise RuntimeError('Concurrent protected runtime change detected')
        print(json.dumps(result), flush=True)
    except Exception as error:
        if pulled:
            command(['git', 'restore', '--source=' + old, '--staged', '--worktree', '--', 'site/refi-cro'])
            command(NGINX_TEST)
            command(RESTART)
        save('failure.json', {'status': 'FAIL', 'errorClass': type(error).__name__, 'rollbackAttempted': pulled, 'previousCommit': old})
        raise

if __name__ == '__main__':
    main()
