# HANDOVER

History on main: TASK-01 282f73a, TASK-02 1e5143a, TASK-03 9d3cab7, TASK-04 b7fc051, TASK-05 5f50816, TASK-06 bba0efb. Full overview: FINAL_HANDOVER.md.

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
