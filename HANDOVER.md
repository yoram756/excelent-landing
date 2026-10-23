# HANDOVER

History on main: TASK-01 282f73a, TASK-02 1e5143a, TASK-03 9d3cab7, TASK-04 b7fc051, TASK-05 5f50816. Full overview: FINAL_HANDOVER.md.

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
