# Independent VPS availability monitoring

Production acceptance completed on 2026-10-29: a real missing-heartbeat DOWN and subsequent UP were confirmed in the hosted UI and in the office inbox. Automatic timer-originated pings continued after recovery. See [acceptance report](../../docs/runtime/VPS_OFFHOST_MONITORING_20261029.md). The VPS itself was not shut down during this test.

Prepared integration: hosted Healthchecks.io Hobbyist plan, no paid subscription or card. Recipient comes from `config/error-handler.json`. Proposed check name and schedule are in `heartbeat.json`: a simple 60 second period, 120 second grace and email-only notifications. A missing heartbeat is due after one minute; the external service declares DOWN after the additional two minute grace. Provider processing and email latency are additional. This is an estimate, not a delivery SLA.

## Approval and secure setup

Create or use an owner-approved Healthchecks.io account for the office address. Account creation requires owner acceptance of https://healthchecks.io/terms/ and https://healthchecks.io/privacy/. Verify the free plan and office email integration; do not add a card, WhatsApp, phone or SMS integration. Do not activate unrelated checks or change existing account notifications. Check UUIDs and ping URLs are secrets that can spoof liveness; never print them, put them in Git, a command line, shell history, screenshots or reports. Do not provision an API management key: this sender needs only one ping URL.

Store the generated HTTPS UUID ping URL in `/docker/offhost-secrets/healthchecks_url`: directory 0700 root, file 0400 root. Use masked operator input or a previously authorized protected transfer, never a command argument. `LoadCredential` makes only this credential available to the dynamically allocated service user. The unit has no CRM credentials, database, Docker socket or n8n configuration access. The provider sees the VPS public IP and ping timings; requests have no lead data or body.

Source files stay in this repository; install the reviewed Python script and public configuration as root-owned read-only files in `/usr/local/lib/excelent-monitor` and `/etc/excelent-monitor`. Verify their SHA256 against the committed source. The sender requires Python 3 and systemd `LoadCredential` support. Existing CAPI/n8n/LP services are not restarted.

```sh
cd /docker/lp
git pull --ff-only origin codex/lock-service-20261025
docker compose -f docker-compose.yml run --rm --no-deps --label traefik.enable=false lp nginx -t
install -d -m 755 /usr/local/lib/excelent-monitor /etc/excelent-monitor
install -m 644 src/services/monitoring/offhost-heartbeat.py /usr/local/lib/excelent-monitor/offhost-heartbeat.py
install -m 644 deploy/offhost/heartbeat.json /etc/excelent-monitor/heartbeat.json
install -m 644 deploy/offhost/excelent-vps-heartbeat.service deploy/offhost/excelent-vps-heartbeat.timer /etc/systemd/system/
systemctl daemon-reload
# Only after the protected URL, free check schedule and office email are verified:
systemctl start excelent-vps-heartbeat.service
systemctl enable --now excelent-vps-heartbeat.timer
```

## Controlled acceptance without a server outage

1. Confirm a real VPS-originated ping is accepted and the hosted check is UP. A local mock is not this production gate.
2. Arm a persistent automatic restart of only `excelent-vps-heartbeat.timer` for five minutes later. Verify the restore timer before stopping the heartbeat timer. Do not pause or reboot the VPS, change a firewall, stop Docker, modify an ingress or pause provider-side monitoring.
3. Stop only the heartbeat timer. Keep the hosted check active with the final production period/grace. Wait for the hosted check to become DOWN because real pings are missing. Do not use the `/fail` endpoint as a substitute for this acceptance.
4. Independently verify the DOWN email in the office Gmail account without changing labels or read state. Restart the heartbeat timer in a finally block, even if verification fails. Confirm a new real ping, hosted UP and a separate recovery email. Cancel the fallback restore only after restoration is confirmed.
5. Check that worker/core identities, CAPI dispatch rows/activation, nginx and n8n definitions are unchanged. Verify later timer-originated pings continue after the acceptance. Retain receipts without the check UUID, secret URL or login token.

This validates the same missing-signal path used if the VPS powers off or loses outbound connectivity; an actual whole-server shutdown is not performed and must not be claimed. This does not prove that every public ingress route responds while the OS remains alive. A periodic external HTTP probe can complement this check if required.

## Operations and rollback

Use `systemctl status excelent-vps-heartbeat.timer` and sanitized `journalctl -u excelent-vps-heartbeat.service`. Do not run commands that display systemd credentials or the ping URL. A network/API failure returns a generic nonzero result without credential-bearing exception text. No redirects, auto-provisioning, arbitrary hosts, retries or diagnostic request bodies are allowed.

Rollback must coordinate the hosted check first so intentionally stopping heartbeats does not produce an unnoticed alert. Preserve the owner-approved hosted configuration and its history. Stop only the heartbeat timer; leave the CAPI observer and its state, application containers and n8n unchanged. Do not delete or rotate the ping URL without owner authorization.

Local contracts: `python3 tests/deploy/offhost_heartbeat_test.py`. Negative control: bypass URL validation and confirm tests fail. `node --test tests/funnel/secrets.test.js` also rejects committed Healthchecks ping URLs; prove it with a disposable synthetic probe, then remove only that owned probe. No real ping credential is needed for local tests.

Setup and deployment instructions are not evidence of an activated external monitor. Keep the production requirement BLOCKED until the account/credential are approved and both real alert emails are independently verified.
