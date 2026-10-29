# Monday to Meta CAPI worker

This independent service reads the configured campaign board, sends `Lead` for new LP1 items and never calls a WhatsApp provider or changes n8n. A normal scan runs every five minutes. It reads the whole active board with bounded pagination, then independently reads each new candidate before dispatch. At most ten new conversions are attempted per scan. The baseline cost is 288 small board reads per day, plus pagination and one independent read per new candidate.

Board, event column, source column, allowed source labels, dataset and versions come from the campaign file. Only leads created at or after the persisted activation time qualify. Activation is stored at second precision, matching Monday timestamps. Test and live modes have separate activation times. Historical items are excluded; opt-out items and WhatsApp sources are excluded. Mode `test` handles only TEST names and TEST event IDs, requires a current Test Events code, uses synthetic matching data and `opt_out=true`, and expires after five minutes without further provider calls. Mode `live` excludes TEST items and emits no test code or synthetic email. Live user data contains only a hash of the internal board/item binding; names, phone numbers, emails and financial answers are not exported. This does not verify advertising attribution or event match quality.

The stored Monday event ID is copied exactly to `event_id`. Durable SQLite uniqueness protects both `(dataset, event_name, event_id)` and `(dataset, event_name, board, item)`. A claim is committed as SENDING before the HTTP POST. A valid acknowledgement records ACKED. Timeouts, process crashes and malformed responses never release a claim or trigger another automatic POST. FAILED and UNKNOWN require operator review, and a stale SENDING state requires checking Meta before any manual recovery. Never delete a deduplication record or restore an older database over newer dispatch attempts.

The worker has no listening port or public route. It does not mount the existing 8788/8789 services or their databases. Its Docker volume is dedicated to CAPI and survives container recreation. The Docker build context includes only the adapter, public campaign files and Dockerfile, never credentials or tests/out. Secrets are files under `/docker/capi-secrets`, each owned by UID 1000 with mode 0400 inside a root-owned 0700 directory. Do not put values in Compose, command arguments, shell history or Git. A secure operator-completed terminal input is required when provisioning these files.

Deploy only after showing the commands and reviewing the source commit. On the VPS, pull the approved branch with `git pull --ff-only`, test the existing nginx in a disposable container and build the independent image. Then provision `monday_token`, `meta_token` and `test_code` securely. Start the test worker before creating one synthetic lead. Read the resulting ledger and Meta receipt, repeat the scan and restart the worker against the same database to verify no second dispatch. Delete only the owned TEST item and independently verify its state. After the controlled gate passes, restart only this service with `CAPI_MODE=live`. The existing n8n, LP, lock, CRM worker, Cosend, OpenClaw and Hermes services are not restarted.

```sh
cd /docker/lp
git pull --ff-only origin codex/lock-service-20261025
docker compose -f docker-compose.yml run --rm --no-deps --label traefik.enable=false lp nginx -t
CAPI_MODE=test docker compose -f deploy/capi/compose.json build
CAPI_MODE=test docker compose -f deploy/capi/compose.json up -d --no-deps --pull never worker
# Only after the controlled conversion, restart/deduplication checks and cleanup:
CAPI_MODE=live docker compose -f deploy/capi/compose.json up -d --no-deps --pull never worker
```

Use `docker compose -f deploy/capi/compose.json logs` to inspect sanitized outcomes. The health check reads the dedicated database and fails on stale scans, source failure, blocked issues, FAILED/UNKNOWN or a SENDING claim older than one minute. Docker restart-on-exit does not itself prove alert delivery. Existing intake central-error routing is preserved. Rollback stops only the new worker and preserves its volume; do not modify existing services or remove its ledger.

## Independent observer and notifications

`monitor.py` is a separate host oneshot service, scheduled every minute by `excelent-capi-monitor.timer`. It does not run inside the worker, call Meta, create leads, send WhatsApp, change n8n or restart the worker automatically. It checks only the configured Docker container state and a read-only CAPI ledger. A paused/stopped/unhealthy container, source failure, stale scan (11 minutes), blocked issues or unsettled dispatch triggers a failure notification. Initial startup has a bounded 90 second grace period. Recovery produces a separate notification after the real health checks pass.

Notifications go to the configured campaign's single intake assignee and link to its board. No board or user ID is hardcoded in the monitor. The existing Monday credential must actually permit `notifications:write`; read access alone is not proof. Notification readback is scoped to the signed-in user, whose identity must match the recipient. The current acceptance target is the previously configured office account. Email is controlled by Monday preferences and is not promised by a bell notification receipt.

The observer keeps its own durable database under `/var/lib/excelent-capi-monitor`, mode 0700. It claims each incident's failure/recovery notification before the API call. Repeated unhealthy checks and observer restarts do not post again. Ambiguous sends are reconciled by a read-only notification lookup, never blindly retried. FAILED/UNKNOWN notices require review and may block later notices until reconciled; inspect `journalctl -u excelent-capi-monitor.service` and the monitor database. Do not delete its state to force a resend. It never writes or restores the dispatch ledger. Its credential is read directly from the existing protected file, never copied into unit files or a command line.

Install only the two named units after pulling the approved source and a disposable nginx test:

```sh
install -m 644 deploy/capi/excelent-capi-monitor.service deploy/capi/excelent-capi-monitor.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start excelent-capi-monitor.service
systemctl enable --now excelent-capi-monitor.timer
```

Validate a real worker pause only with a pre-scheduled automatic unpause and a finally-block restoration; verify one failure notification, suppression while still paused, one recovery notification and unchanged dispatch rows/activation/core services. A controlled pause is a real process fault; local unit tests alone do not prove notification delivery. Rollback disables only `excelent-capi-monitor.timer`, preserving both databases and the worker. Since this observer shares the VPS, total host/network failure also prevents its alert transmission. Independent hosted missing-heartbeat coverage is now documented in [the off-host setup](../offhost/README.md); this local observer alone does not provide it.

Local contracts: `python3 tests/deploy/capi_monitor_test.py`. Deliberately replacing health evaluation with an always-healthy result must fail the negative control.
