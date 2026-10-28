# WhatsApp deployment continuation, 28 October 2026

The isolated deployment passed. Client-facing operation remains BLOCKED. No WhatsApp message, provider mutation, model API request, customer subscription or new paid service was performed.

## Exact starting blocker and resolution

The preceding attempt could not complete server verification because the Hostinger web terminal reported `Lost connection to the server`. A replacement browser tab then timed out on CDP focus control, and a native application approval timed out. These were access-channel failures, not evidence that a Cosend endpoint, server route or HTTP request had failed. The local SSH directory also returned `Access is denied`; no key was read or bypass attempted.

The existing authorized Hostinger VPS console was recovered. A detached deployment driver now saves command arguments before execution, private logs and a checkpoint after each stage, so losing the browser does not interrupt deployment or lose its result. The operation completed at `2026-10-28T17:13:32.417465+00:00`.

## Source and actual deployment

Source commit: `b7d58be44d470457d6a190531e60324ba5358b55`, branch `codex/lock-service-20261025`. Its 31 added files are exclusively under `src/services/wa-assistant/`. LP1, lead intake, the refinance funnel and global configuration were not part of this release. The canonical provider binding now exists in the branch and specifies Cosend, phone ID `1138723472651617`, outbound disabled and model budget not approved. Manifest SHA256: `e3adb23d0652f76a65d0eb4a3bce6dd6872793c68c0e04a99926f1b329388d5d`.

During evidence preparation, concurrent funnel commit `19ae97cbc4cc33dc77a96cec4d765df8a22497d2` and release-report commit `4c26ed60aef9832b4c9b40bf5aa86cc6ed06674c` advanced the branch. Their changed paths do not include `src/services/wa-assistant/`. The evidence commit preserves the later commit as its parent; their funnel changes were not deployed by this task. A server-side read-only fetch verified the new remote tree while the deployed worktree remained at the exact source commit above. The first ref-update request returned an ambiguous GitHub GraphQL error; read-back showed the branch had advanced concurrently, so the evidence tree was rebuilt on the new head before retrying with a fresh expected-head lease.

The VPS driver created a separate Git worktree, ran `git pull --ff-only origin codex/lock-service-20261025`, asserted the exact commit, checked all manifest hashes and mounted only the WhatsApp package into the isolated service. It did not update the production LP checkout, which remains at `5305b5365dfffa547735b5b53f560f56753c3f89`.

| Requirement | Result | Actual evidence |
| --- | --- | --- |
| Isolated deployment | PASS | `excelent-wa-isolated-20261028-resume`, version `0.3.0-isolated.20261028`, healthy |
| Isolation | PASS | Docker network `none`, no published ports, read-only root, UID 1000, dropped capabilities, resource limits |
| Durable storage | PASS | Reused existing synthetic SQLite volume; no parallel store for live information |
| Existing intake | PASS | `excelent-wa-intake:8788` preserved; consistent SQLite backup verified |
| Existing production | PASS | Eight workflow configuration hashes unchanged; intake, production n8n and LP container IDs/start times unchanged |
| Source tests | PASS | 84/84 locally and again inside a server container |
| Negative controls | PASS | 15/15 local mutations detected |
| Deployed E2E before restart | PASS | 22 checks, 12 successful synthetic n8n executions |
| Deployed E2E after restart | PASS | 12 checks, 3 successful synthetic n8n executions |
| Backup and restore probe | PASS | SQLite backup API, integrity checks and restore into a separate probe file |
| Existing Nginx syntax | PASS | Throwaway `nginx -t` container with `traefik.enable=false`; no reload |
| Live model/provider handoff | BLOCKED | Required approved credentials, API representative ID and model budget unavailable |
| Real delivery and client activation | NOT TESTED | No permission for this exact test/cutover; existing Cosend receptionist remains ON |

Container image: `sha256:ffeb52485f78b1b06c9a832205853cf75da72a07a514c9a27724df85979d6c34`, reused from the installed n8n image. Source worktree: `/docker/excelent-wa-resume-20261028/source`. There is deliberately no public URL for this isolated service. The existing n8n UI remains https://n8n-qhxa.srv1604140.hstgr.cloud.

## Actual request, response and state evidence

Synthetic requests entered a newly created isolated n8n instance at `http://127.0.0.1:5689/webhook/<random-synthetic-path>`. The random paths are omitted. The imported ingress forwards the original raw bytes and signature to `POST http://127.0.0.1:8789/ingest`. A separate worker invokes `POST http://127.0.0.1:8789/simulate-one` with a synthetic-only service credential.

| Test | HTTP | Response body / state assertion |
| --- | --- | --- |
| Invalid signature | 401 | `{"code":"invalid_signature"}`; no event inserted |
| Valid raw signed event | 202 | `{"code":"durably_stored"}`; committed message exists before worker invocation |
| Same event | 200 | `{"code":"duplicate_event"}` |
| New event ID, same provider message | 200 | `{"code":"duplicate_message"}` |
| Worker decision | 200 | `prepared.route=reply`, `reason=hours`, `simulated.state=SIMULATED`, `network=false`, `live=false` |
| Representative request | 200 | `prepared.id=null`, `route=handoff`, local OPEN handoff and human control flag |
| Follow-up under human control | 200 | `reason=human_controls_conversation`, no reply outbox entry |
| Injected SQLite insert failure | 503 | `{"code":"durable_storage_or_processing_failure"}`; no commit and no success ACK |
| Storage restored | 202 | `{"code":"durably_stored"}`; worker subsequently processes the event |
| Replay after container restart | 200 | `{"code":"duplicate_event"}`; same SIMULATED outbox ID retained |
| Human control after restart | 200 | Human flag retained and reply remains suppressed |
| `POST /send` | 404 expected | `{"code":"not_found"}`; no send endpoint exists in this service |

These are deployed synthetic tests, not production customer or provider-delivery executions. Their workflow IDs are `waDeployTest0001` and `waDeployWork0001`. Before restart, execution IDs `1–12` completed successfully; worker executions were `5, 7, 9, 12`. After restart, a separate fresh synthetic n8n database recorded successful IDs `1–3`, with worker ID `3`. The IDs are local to their respective databases and must not be looked up in production n8n.

The existing production drafts `0nesgH42OpyQdncL`, `90jZAb9ZFDOnEQ0e`, and `wyMfdiAAyfhtDyrP` were neither reimported nor activated. Existing intake `HNvsmdIDsvrHkZuw` and actual CRM worker `StS89G1uHOBX2znO` were preserved. `QEGe2prEvnA4i47J` belongs to the refinance flow; it is not the CRM worker.

Raw reports are retained privately at `/docker/excelent-wa-resume-20261028/{deployment-report.json,preflight.json,evidence/before.json,evidence/after.json}`. Their SHA256 values and observed results are in [the machine-readable continuation report](wa-deployment-resume-20261028.json). The repository contains unmodified terminal screenshots and a clearly labelled observation record, not a claimed byte-for-byte export of those raw server reports. A compressed export attempt through the terminal clipboard was unsupported; no public file server or new transfer credential was created.

Evidence: [deployment](../evidence/20261028-wa-deploy-resume/deployment-pass.png), [version and hashes](../evidence/20261028-wa-deploy-resume/deployment-summary.png), [actual HTTP bodies and executions](../evidence/20261028-wa-deploy-resume/deployed-http-results.png). The exact command-recording deployment driver is [preserved here](../evidence/20261028-wa-deploy-resume/deploy-isolated.py).

## Fresh real Cosend verification

The existing read-only workflow `AwCquhPHa4OgjkEo` ran once as production execution `60620`, succeeded in 880 ms, verified at `2026-10-28T17:01:37.280Z`. `GET https://api.cosend.app/v1/me` and `GET https://api.cosend.app/v1/connections/conn_01M5YC386Q2N9973TJG1M8H4DQ` both returned HTTP 200. The safe response identified:

* Workspace `org_01M5WPXWKXTYNDCHAJ6YTMWZ5Z`.
* Connection `conn_01M5YC386Q2N9973TJG1M8H4DQ`, active, coexistence.
* Phone `+972559881245`, phone ID `1138723472651617`, WABA `848287037598986`.
* Granted scope `connections:read` only; this does not establish message, sending, assignment, locking or webhook-management permissions.

The Cosend UI shows AI receptionist ON and answering, custom initial-response automation OFF, and a pending display-name approval warning. Members shows Yoram Peled, `office@kho.org.il`, Owner, Active; 1/1 seats. Neria is not a member of this workspace. No invitation, subscription change or upgrade was made. Blueticks reported connected/synced in a read-only status call but did not disclose its number; its number must not be assumed to be the Cosend number.

Evidence: [safe identity output](../evidence/20261028-wa-deploy-resume/cosend-identity.txt), [execution 60620](../evidence/20261028-wa-deploy-resume/cosend-execution-60620.txt), [response ownership](../evidence/20261028-wa-deploy-resume/cosend-response-owner.txt), [members](../evidence/20261028-wa-deploy-resume/cosend-members.txt).

The implementation follows the native [Cosend webhook signature format](https://cosend.app/docs/webhooks). Required API capabilities must be checked against the [native API reference](https://cosend.app/docs/reference), then verified with the actual scoped credential; installed connectors alone are insufficient evidence.

## Concrete remaining blockers and next actions

1. Real message state and provider handoff: the only verified n8n credential has `connections:read`. The owner must install a connection-scoped Cosend credential through secure n8n Credentials, with the native message/contact/assignment/locking capabilities required for the chosen flow, and confirm Yoram's API representative ID. `messages:write` can permit sending, so the send gate must remain disabled while verifying capabilities. A local OPEN queue is not evidence that a real Cosend representative sees or owns a conversation.
2. Real model: no approved API credential, selected model or spend cap is available. `modelBudgetApproved=false`. The deployed HTTP broker is simulation-only; the tested model-worker library is not yet wired into its runtime. Select an existing approved API account and explicit budget, enter its secret securely, then wire and verify a gated runtime worker. No ChatGPT subscription entitlement was assumed to include API use.
3. Client activation: Cosend receptionist is still ON. Approve a single-owner cutover and a real-data retention/deletion policy before subscribing customer events. Do not enable both responders, change Blueticks, or expand existing draft-only agent powers.
4. Real pilot: exact approval is still required. Proposed recipient Yoram `+972502234052`, sender `+972559881245`, one outbound message: “שלום יורם, זו הודעת בדיקה יחידה של העוזר הדיגיטלי של אקסלנט דרך Cosend. אין צורך למסור פרטים אישיים.” Current incremental cost has not been verified. Run only after verifying an open service window and zero incremental cost and receiving approval for this exact test; otherwise present a current quote first. No paid template fallback.

No secret should be entered into chat or committed. Unexpected process-crash recovery beyond the controlled restart, real operational alert delivery, real provider locks/assignment, real model output and WhatsApp delivery remain NOT TESTED. Meta CAPI was outside this release and remains unverified.

## Rollback and continuation

Consistent backups are at `/docker/excelent-wa-resume-20261028/backup`. `/docker/excelent-wa-resume-20261028/rollback.sh` stops the new isolated container and starts preserved `excelent-wa-isolated-20261028-v2`. It deliberately retains the shared synthetic database to preserve deduplication and human-control facts. Do not restore an old database over newer sending/uncertain-send records. The driver would execute rollback on a post-replacement failure; this successful run did not need rollback. A separate backup restore probe passed.

The server has no configured Git write identity/helper/header/SSH agent, so evidence publication uses the already authenticated GitHub connector. The local dirty checkout is preserved at its existing HEAD; it is not falsely represented as a clean checkout of the published source. A follow-up evidence commit is published only after reviewing its explicit WhatsApp paths and scanning for secrets, with an expected-head lease and no force push.
