# HANDOVER

History on main: TASK-01 (src/ layout, 282f73a), TASK-02 (phone rule and Monday mapping, 1e5143a), TASK-03 (omni-channel, opt-out, instant reply, intake config, 9d3cab7).

## TASK-04 SQLite engine, atomic dedup, reminder config, instant reply replaces the opener (2026-10-23)

| Requirement | Status | Evidence |
|---|---|---|
| Instant HSM replaces the engine's 5 minute opener | PASS (code and tests; still off) | After a confirmed send the instant workflow writes `fn_last` (`Sent?`, `Mark sent`, `Update item (instant)`). On enrollment the engine waits `graceMinutes` (2) for that mark, then starts after the opener (M1 counted as sent at the instant time). If the instant reply never went out, the regular opener goes out once. Never both |
| SMS and Email stay disabled | PASS | providers.sms and providers.email remain null |
| Hardcoded ids out of the reminder | PASS | pick-overdue.js and patch-reminder-export.js read board, group, columns, sources and open stages from `intake.reminder` and `columns` in src/config/campaigns/refi.json. There is no `work.js` in the repo; patch-reminder-export.js is the reminder's other hardcoded file. The query built from config is byte identical to the deployed one (tests/funnel/reminder-config.test.js) |
| Lead_Temperature in color_mm88xpa8 | PASS | The column holds Hebrew labels. HOT, WARM and COLD map to existing labels (HOT writes "חם מאוד", WARM "חם", COLD "מתעניין"), so no new label is created. A label that already fits (for example "רותח") is not downgraded. The engine writes only when heat changes (a reply, +10) |
| SQLite engine src/services/lifecycle/db.js | PASS (local) | Tables `incoming_webhooks` (raw text), `lead_dedup_locks` (normalized phone, 60 seconds) and `lifecycle_events` (lead_received, duplicate_blocked, status, heat) |
| Atomic lock before Monday or WhatsApp | PASS (mechanism); production wiring BLOCKED | `admitLead` records the raw webhook, takes the lock with one conditional UPSERT and logs the outcome in a single `BEGIN IMMEDIATE` transaction. Production intake runs in n8n Code nodes, which cannot open SQLite, so a service that n8n calls before "Find query" is needed, and deploying it needs approval |

### Test output
- Linux container (node 22.23, nginx 1.22.1), the same as CI: `npm run test:funnel` 299/299 pass; `npm run test:deploy` 2/2 pass.
- Windows: `npm run test:site` 55/55. Total: 356/356, 0 failures.
- Atomic dedup: 8 separate processes race on one SQLite file for the same phone in two formats. Exactly 1 is admitted, 8 raw webhooks are stored, and the events are 1 lead_received and 7 duplicate_blocked.
- Mutation checks: removing the lock's expiry condition fails 3 tests (including the race); removing the transaction fails the no-partial-record test. Removing the global opt-out (TASK-03) still fails its test.
- dist/*.json was rebuilt in Linux and contains no carriage returns.

## Open items
1. Deploy (n8n plus a small lock service): needs n8n access and approval from יורם.
2. The instant reply stays off until a Gambot template id is approved; then set `instantReply.enabled` and `template.id`.
3. The 60 second lock blocks rapid duplicates only. The existing 24 hour same-phone update in build-mutation.js is unchanged.
4. Niche_Segment still has no Monday column.
