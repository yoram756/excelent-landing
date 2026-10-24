# HANDOVER

History on main: TASK-01 282f73a, TASK-02 1e5143a, TASK-03 9d3cab7, TASK-04 b7fc051, TASK-05 5f50816, TASK-06 bba0efb, TASK-07 caaf845. Full overview: FINAL_HANDOVER.md. The deploy steps below replace section 4 of FINAL_HANDOVER.md.

## TASK-08 Production readiness and deployment package (2026-10-24)

| Requirement | Status | Evidence |
|---|---|---|
| src/deploy/package.js validates every campaign file | PASS | Checks per file: id equals file name, numeric board, all engine columns, template ids (numeric or PENDING), sequences and meeting codes point at existing templates, cascade and providers (WhatsApp = gambot), opt-out label, instant reply (1 to 60 seconds, category, enabled only with an approved id), temperature bands, Meta ids, identity profile and contact phone against config/business.json. Across files: one Meta campaign id per campaign. Any error stops the package (exit 1) |
| Builds the n8n workflow files | PASS (build only) | Test mode for every campaign: dist/ (refi) and dist/consolidation/, each engine-test, go, calendly, instant-reply-test. Every file parses, has nodes and connections, and keeps no placeholder except the secret `__TEST_PATH__` paths. Rebuild is byte-identical. No live build: that needs approval from יורם |
| .env.production.example | PASS | Generated from the list in package.js: LOCK_SERVER_HOST, LOCK_SERVER_PORT, LOCK_SERVER_TOKEN, LOCK_DB_PATH, LOCK_SERVER_URL, LOCK_CREDENTIAL_ID, INSTANT_REPLY_WORKFLOW_ID, CAMPAIGN, GAMBOT_API_KEY, META_VERIFY_TOKEN, META_APP_SECRET, META_ACCESS_TOKEN. All secrets empty. A test fails if src reads an env var missing from the file or if the file drifts from the list. .env.production is gitignored |
| Import into the real n8n and production run | BLOCKED | No n8n or VPS access here, and every live step needs approval from יורם |

Current output of `node src/deploy/package.js`: refi has 0 errors and is live ready (approved identity, all templates approved; instant reply off). consolidation has 0 errors and is not live ready: identity not approved, all 8 templates PENDING, no Meta campaign ids, no intake block, status draft.

GAMBOT_API_KEY is listed because the task asked for it, but no repo code reads it: n8n sends it from the Header Auth credential "Header Auth account" (id 6hr28GsvQQrGzjwx in the built files). Set it there, not in an env file.

### Test output
- Linux container (node v22.23.4, nginx 1.22.1): `npm run test:funnel` exit 0, 327/327; `npm run test:deploy` exit 0, 2/2. Windows: `npm run test:site` 55/55. Total 384/384, 0 failures.
- New: tests/funnel/deploy-package.test.js (4 tests). Mutation checks: turning off the id check, dropping an env var from the list, and allowing an enabled instant reply without an id each make tests fail.

### Step by step to go live (each step that touches n8n, Monday, Gambot or Meta needs approval from יורם)

A. Before anything
1. Export every current n8n workflow (intake, reminder, engine, go, Calendly) and keep the files outside git. They are the rollback.
2. On a clean checkout of main: `npm ci`, `npm test` (expect 0 failures), then `node src/deploy/package.js` (expect "ok": true).

B. Lock service on the n8n server (show the commands before running them, per AGENTS.md)
3. `cp .env.production.example .env.production` on the server only. Fill LOCK_SERVER_TOKEN (for example `openssl rand -hex 32`), LOCK_DB_PATH=/data/locks.sqlite, LOCK_SERVER_HOST=0.0.0.0 (inside a container that publishes no port), LOCK_SERVER_PORT=8787.
4. Run it on the n8n Docker network without publishing a port:
   `docker run -d --name lock-server --restart unless-stopped --network <n8n network> --env-file .env.production -v lock-data:/data -v "$PWD":/app:ro -w /app node:22-bookworm node src/services/lifecycle/lock-server.js`
5. Check from inside the n8n container: `wget -qO- http://lock-server:8787/health` returns {"ok":true}.

C. n8n credentials
6. Create a Header Auth credential "Lock server": name Authorization, value `Bearer <LOCK_SERVER_TOKEN>`. Note its id (LOCK_CREDENTIAL_ID).
7. Check that "Header Auth account" (Gambot API key), "Monday.com account" and "Gmail account" exist with the ids used in dist/.

D. Import (all workflows inactive)
8. Import src/services/funnel/dist/instant-reply-test.json. Note its workflow id (INSTANT_REPLY_WORKFLOW_ID).
9. Intake: `CAMPAIGN=refi LOCK_SERVER_URL=http://lock-server:8787 LOCK_CREDENTIAL_ID=<id> INSTANT_REPLY_WORKFLOW_ID=<id> node src/webhooks/intake/patch-export.js <intake-export.json> <intake-out.json>`, then import intake-out.json over the current intake. Keep both files out of git.
10. Reminder: `node src/webhooks/intake/patch-reminder-export.js <reminder-export.json> <reminder-out.json>`, then import.
11. Import dist/engine-test.json, go.json and calendly.json. Fill the `__TEST_PATH__` webhook paths in n8n only; never commit them.

E. Test with TEST leads (names start with TEST, phones 0500000040 and up)
12. One form lead: Monday item with heat and label, exactly one opener (simulated in test mode), callback reminder after 30 or 60 business minutes.
13. The same phone twice within 60 seconds: the second answers duplicate and pending, and no second Monday write happens. Stop lock-server and send a lead: the intake must fail, not save.
14. A "הסר" reply stops every item with that phone. Then delete all TEST items.

F. Go live (only after explicit approval from יורם)
15. Pilot: `node src/services/funnel/build-workflows.js pilot <go-live ISO> <phones>`. The phones must be in the campaign's identity.testPhones: for refi that is excelent_contact (972552783459), backup (972548180280) and yoram_050 (972502234052, added on request after TASK-08, see FINAL_EXECUTION_REPORT.md).
16. Live: `node src/services/funnel/build-workflows.js live <go-live ISO>`, import engine-live.json (gitignored) and activate the intake, reminder, engine, go and Calendly workflows.
17. Instant reply: after Gambot approves the template, set `instantReply.template.id` and `enabled: true` in src/config/campaigns/refi.json, run `npm test` and the package, build live, import instant-reply-live.json and activate it.
18. First 48 hours: watch Monday notifications and Gambot. Rollback: deactivate the workflows, re-import the exports from step 1, `docker stop lock-server`.

### Still open
- Meta Lead Ads: an HTTPS endpoint for the webhook is not built. The adapter is ready (TASK-06).
- consolidation: owner identity, templates, Meta campaign ids and an intake block are missing; only test builds are possible.
- SMS and email providers: BLOCKED by owner decision. Niche_Segment has no Monday column.

## TASK-07 Gambot HSM payload, consolidation config and intake wiring (2026-10-24)

| Requirement | Status | Evidence |
|---|---|---|
| src/config/campaigns/consolidation.json | PASS | The file already existed (draft, identity not approved). Added `meta: {campaignIds: [], adAccount: null}`: no Meta id was invented, so Meta leads still never map to consolidation. Test checks nothing is inherited from refi |
| src/services/funnel/gambot-hsm.js | PASS (Gambot SIMULATED) | `templatePayload` (recipient 9725XXXXXXXX, sender from config/business.json gambot_sender, numeric approved template id) and `instantPayload` (enabled, approved id, WhatsApp consent, UTILITY or marketing consent, receivedAt within 60 seconds, TEST names only in test mode). instant-reply.js now uses it, injected by build-workflows.js; behavior unchanged (existing tests pass) |
| HSM send node in dist | PASS (build) | dist/instant-reply-test.json and dist/consolidation/instant-reply-test.json rebuilt with the module; "Send WhatsApp" posts to send-template and stays disabled in test builds |
| Lock call before the Monday lookup | PASS (synthetic export) | The real intake workflow is a private n8n export, not in dist (it holds the webhook path), so the wiring lives in src/webhooks/intake/patch-export.js: Lock (POST LOCK_SERVER_URL/lock, Header Auth credential) then Locked? then Restore intake then Find query; a lost lock answers "Reply locked" (200, duplicate, pending) with no write. No continue on fail: if the service is down the request fails instead of saving without the lock |
| Instant reply call from the intake | PASS (synthetic export) | After "Reply saved", in parallel with the alert: "Instant reply input" (src/webhooks/intake/instant-reply-input.js, new items only, receivedAt = server receipt time) then Execute Workflow "Instant reply" (no wait, continue on error) |
| Real n8n import and run | BLOCKED | No n8n access; needs approval from יורם |

### Test output
- Linux container (node v22.23.4, nginx 1.22.1): `npm run test:funnel` exit 0, 323/323; `npm run test:deploy` exit 0, 2/2. Windows: `npm run test:site` 55/55. Total 380/380, 0 failures.
- New: tests/funnel/gambot-hsm.test.js (7 tests).
- Mutation checks: routing a lost lock to Find query, adding continue on fail to the Lock node, and removing the 60 second window each make tests fail.

### Deploy steps (need approval from יורם)
1. Run lock-server.js where n8n can reach it (LOCK_SERVER_HOST on the internal Docker network, not 127.0.0.1 of the host). In n8n create a Header Auth credential "Lock server": Authorization = Bearer <LOCK_SERVER_TOKEN>.
2. Import dist/instant-reply-<mode>.json and note its workflow id.
3. Export the intake workflow, then: `LOCK_SERVER_URL=http://<host>:8787 LOCK_CREDENTIAL_ID=<id> INSTANT_REPLY_WORKFLOW_ID=<id> node src/webhooks/intake/patch-export.js in.json out.json`. Keep both files out of git.
4. The instant reply sends nothing until a Gambot template is approved and `instantReply.template.id` and `enabled` are set.

## TASK-06 HTTP lock service and Meta Lead Ads adapter (2026-10-23)

| Requirement | Status | Evidence |
|---|---|---|
| src/services/lifecycle/lock-server.js over db.js | PASS (local) | `POST /lock` {phone, source} returns {locked, phone, lockedUntil}; locked=true means this caller won the 60 second lock. `GET /health` returns {ok:true}. Every call is stored raw in incoming_webhooks and logged in lifecycle_events |
| Lock service security | PASS | Bearer token required (LOCK_SERVER_TOKEN, at least 32 characters, compared in constant time); the service refuses to start without it or without an absolute .sqlite path. Binds to 127.0.0.1 by default. Body capped at 16 KB (413), 10 second request timeout. Unauthorized calls leave no record |
| src/webhooks/intake/meta-adapter.js signature | PASS | X-Hub-Signature-256 (HMAC-SHA256 of the exact raw body with META_APP_SECRET), constant-time compare; rejects a tampered body, wrong secret, missing or malformed header. Also handles the GET subscription challenge (META_VERIFY_TOKEN) |
| Graph API fetch and normalization | PASS (Graph SIMULATED) | GET /v21.0/{leadgen_id}?fields=field_data,created_time,ad_id,adset_id,campaign_id,form_id with the token in the Authorization header, never in the URL; fails closed on Graph errors or a mismatched id. Normalizes the name, phone (same rule as intake), email and Meta ids (leadgen, form, ad, adset, campaign) to the intake shape. The campaign is resolved by `meta.campaignIds` in the campaign config; an unknown campaign is rejected. A lead form is a service request; marketing consent is never assumed |
| No secret in code | PASS | Secrets only from env (.env.example lists them empty). tests/funnel/secrets.test.js scans every text file for Meta, AWS, Google, Slack and private key shapes, and for tokens in URLs. Proven: a planted fake Meta token made it fail |

### Test output
- Linux container (node v22.23.4, nginx 1.22.1), the same as CI: `npm run test:funnel` exit 0, 316/316 pass, 0 fail, 0 skipped; `npm run test:deploy` exit 0, 2/2.
- Windows: `npm run test:site` exit 0, 55/55. Total: 373/373, 0 failures.
- New: lock-server.test.js (6 tests, including 12 parallel HTTP requests where exactly 1 gets the lock), meta-adapter.test.js (7 tests, including the chain signed webhook, Graph lead, normalized intake, HTTP lock, where a redelivery is blocked), secrets.test.js (3 tests).
- Mutation checks: a signature check that always passes fails the adapter test; an auth check that always passes fails the lock test.

## Still open (deploy, needs approval from יורם)
1. Run lock-server.js on the n8n host (env LOCK_SERVER_TOKEN and LOCK_DB_PATH, port 8787 on 127.0.0.1 or the internal Docker network). In the intake workflow, call `POST /lock` before "Find query"; on locked=false, answer as a duplicate without writing.
2. Meta: an HTTPS endpoint that receives the webhook with the raw body, calls verifySignature, then leadgenEvents, fetchLead and normalizeLead, then the lock and the intake. Register it in the Meta app (leadgen field) with META_VERIFY_TOKEN, and grant the page access token leads_retrieval. The hosting endpoint itself is not built.
3. Meta leads currently map only to refi (meta.campaignIds); consolidation has no Meta campaign ids, so its leads are rejected until they are added.
