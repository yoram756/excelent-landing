"""Empty HTTPS heartbeat; no CRM, WhatsApp, n8n or Meta access.

The secret capability URL is supplied by systemd LoadCredential. Nothing from
the URL or provider response is ever returned in process output or exceptions.
"""
import argparse
import datetime
import json
import os
import pathlib
import re
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate_config(config):
    if config.get('provider') != 'healthchecks.io' or config.get('pingHost') != 'hc-ping.com':
        raise ValueError('unsupported_heartbeat_provider')
    if config.get('intervalSeconds') != 60 or config.get('externalPeriodSeconds') != 60 or config.get('externalGraceSeconds') != 120:
        raise ValueError('unexpected_heartbeat_schedule')
    if type(config.get('timeoutSeconds')) is not int or not 1 <= config['timeoutSeconds'] <= 15:
        raise ValueError('invalid_heartbeat_timeout')
    if config.get('notificationChannel') != 'email' or config.get('plan') != 'Hobbyist free only':
        raise ValueError('unexpected_heartbeat_delivery')
    return config


def validate_url(value, host):
    if not isinstance(value, str) or re.search(r'\s', value):
        raise ValueError('invalid_heartbeat_credential')
    try:
        url = urllib.parse.urlsplit(value)
        valid = (url.scheme == 'https' and url.netloc == host and url.hostname == host
                 and url.username is None and url.password is None and url.port is None
                 and not url.query and not url.fragment
                 and re.fullmatch(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', url.path))
        if not valid:
            raise ValueError('invalid_heartbeat_credential')
    except Exception:
        raise ValueError('invalid_heartbeat_credential') from None
    return value


def send(config, secret_file, opener=None):
    validate_config(config)
    try:
        secret_path = pathlib.Path(secret_file)
        if secret_path.stat().st_size > 512:
            raise ValueError('invalid_heartbeat_credential')
        value = secret_path.read_text(encoding='utf-8').strip()
        url = validate_url(value, config['pingHost'])
        request = urllib.request.Request(url, headers={'User-Agent': 'excelent-vps-heartbeat/1'}, method='GET')
        open_request = opener or urllib.request.build_opener(NoRedirect()).open
        with open_request(request, timeout=config['timeoutSeconds']) as response:
            if response.geturl() != url or response.status != 200 or response.read(64).strip() != b'OK':
                raise ValueError('heartbeat_not_accepted')
        return {'service': 'vps-heartbeat', 'status': 'PASS', 'httpStatus': 200,
                'payloadBytes': 0, 'credentialLogged': False}
    except Exception:
        return {'service': 'vps-heartbeat', 'status': 'FAIL', 'code': 'heartbeat_not_confirmed',
                'credentialLogged': False}


def run(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--secret-file', help='Operator-only file path, never a URL')
    args = parser.parse_args(argv)
    try:
        config = json.loads(pathlib.Path(args.config).read_text(encoding='utf-8'))
        secret = args.secret_file or str(pathlib.Path(os.environ['CREDENTIALS_DIRECTORY']) / 'healthchecks_url')
        result = send(config, secret)
    except Exception:
        result = {'service': 'vps-heartbeat', 'status': 'BLOCKED', 'code': 'heartbeat_configuration_unavailable',
                  'credentialLogged': False}
    result['observedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    print(json.dumps(result))
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(run())
