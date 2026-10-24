# FINAL HANDOVER excelent-landing (TASK-01 to TASK-05)

Date: 2026-10-23. Branch: main. Every status below is PASS, FAIL, BLOCKED or NOT TESTED, with its evidence.
Nothing in these five tasks was deployed to n8n, sent to a real lead, or written to the live Monday board.

## 1. What was done

| Task | Commit | Result |
|---|---|---|
| TASK-01 Git alignment and modular layout | 282f73a | PR #2 merged into main (fast-forward). automation/ moved to src/webhooks/intake, src/services/funnel and src/services/lifecycle. AGENTS.md is the single rule file; CLAUDE.md imports it. .env.example lists only the variables the code reads |
| TASK-02 Phones and Monday schema | 1e5143a | One phone normalizer in every intake, engine and lifecycle copy (00972, +972 0 and dotted formats were mis-normalized before). Board columns read back from the Monday API into tests/funnel/board-columns.json. Lead_Temperature mapped from heat (HOT >= 70, WARM 40 to 69, COLD < 40) |
| TASK-03 Omni-channel and multi-niche config | 9d3cab7 | campaigns/ moved to src/config/campaigns/. Intake Monday ids moved to config (output byte identical). Global opt-out across all items with the same phone. WhatsApp to SMS to Email fallback decision (SMS and email have no provider, so they are notified to Yoram, never sent). Instant reply workflow, off |
| TASK-04 SQLite and atomic dedup | b7fc051 | src/services/lifecycle/db.js: incoming_webhooks, lead_dedup_locks (60 seconds), lifecycle_events. Instant reply replaces the engine opener, never both. Reminder ids moved to config. Lead_Temperature written to color_mm88xpa8 as existing labels only |
| TASK-05 Synthetic E2E and audit | this commit | tests/funnel/e2e-synthetic.test.js. The CI workflow file, saved with CRLF line endings in TASK-03, is normalized back to LF |

## 2. Synthetic E2E (Meta Lead Ads style lead)

tests/funnel/e2e-synthetic.test.js runs one synthetic TEST lead through the actual sources, with no network:

| Step | Status | Evidence |
|---|---|---|
| Meta Lead Ads payload to the intake contract | SIMULATED | The repo has no Meta Lead Ads adapter. The test maps the leadgen field_data itself. Real Meta to intake routing is NOT TESTED |
| Atomic lock and raw event in SQLite before Monday or WhatsApp | PASS | admitLead on a real SQLite file; the phone `+972 50-000-0040` becomes 972500000040; the raw payload is stored unchanged |
| Intake validate and normalize | PASS | validate.js ok, WhatsApp consent receipt bound to the phone |
| Monday GraphQL create with the heat label | PASS (query built); Monday response SIMULATED | find-query on board 5106246268 by refi_phone; create_item in group topics with heat 65, label "חם", which matches Lead_Temperature WARM |
| Instant WhatsApp within 60 seconds | PASS (payload); Gambot send SIMULATED | Template payload from 972559881245 to 972500000040 with the first name. A test template id is used because the repo keeps the instant reply off |
| Duplicate Meta delivery 20 seconds later | PASS | Blocked by the lock; events are lead_received then duplicate_blocked |
| Engine does not repeat the opener | PASS | Plan enrolls the item at step M1 with no send, Lead_Temperature WARM, Niche_Segment refi |

Mutation check: removing the "instant reply replaces the opener" branch from plan.js makes the E2E test fail.

## 3. Test output (0 failures)

Linux container node v22.23.4, nginx 1.22.1, the same steps as .github/workflows/funnel-ci.yml:
```
npm run test:funnel   exit=0   # tests 300  # pass 300  # fail 0  # cancelled 0  # skipped 0  # todo 0
npm run test:deploy   exit=0   # tests 2    # pass 2    # fail 0  # skipped 0
```
Windows (Chromium from Playwright):
```
npm run test:site     exit=0   55/55
```
Total 357 of 357 passed, 0 failed, 0 skipped. (There is no pytest suite in this repo.)

Code cleanliness:
- `git diff --check 919f3d5..HEAD`: clean (no whitespace errors) after the CI file fix.
- Built n8n files in src/services/funnel/dist: no unreplaced placeholders and no carriage returns. They were rebuilt in Linux.
- The repo has no linter configured, so no lint result is claimed.
- Mutation checks were run in TASK-02 to TASK-05 (phone rule, global opt-out, lock condition, transaction, E2E opener). Each new test fails on broken code.

## 4. Deploy checklist for יורם

Superseded by the TASK-08 steps in HANDOVER.md. The two "not built yet" items below were built in TASK-06 and TASK-07.

Each step that reaches real leads, Monday or Gambot needs your explicit approval (AGENTS.md).

1. Decide and approve
   - [ ] Approve the WhatsApp instant reply template in Gambot (UTILITY category, variable: first name).
   - [ ] Approve the engine going live, and the go-live time.
   - [ ] Approve Monday writes of the temperature label (color_mm88xpa8, existing labels only).
2. Configure (in git, then `npm test` must stay at 0 failures)
   - [ ] src/config/campaigns/refi.json: `instantReply.template.id` = the approved id, `instantReply.enabled` = true.
   - [ ] `identity.approved` is true for the campaign you are building live.
3. Build
   - [ ] `node src/services/funnel/build-workflows.js test` and check src/services/funnel/dist/.
   - [ ] Pilot: `node src/services/funnel/build-workflows.js pilot <go-live ISO> 972502234052` (approved test phones only).
4. n8n (export the current workflows first and keep them privately, outside git, as the rollback)
   - [ ] Intake: `node src/webhooks/intake/patch-export.js <intake-export.json> <out.json>`, then import out.json.
   - [ ] Reminder: `node src/webhooks/intake/patch-reminder-export.js <reminder-export.json> <out.json>`, then import.
   - [ ] Import the engine and the instant reply workflows, both inactive. Fill the `__TEST_PATH__` webhook paths at deploy time; never commit them.
   - [ ] Not built yet: in the intake workflow, add an Execute Workflow node after "Check save" that calls the instant reply with {itemId, name, firstName, phone, receivedAt, grants, marketing}.
   - [ ] Not built yet: the SQLite lock runs locally only. Production needs a small service around db.js that n8n calls before "Find query". Until then, the existing 24 hour same-phone check in n8n stays the dedup.
5. Verify with TEST leads (names start with TEST, phones 0500000040 and up)
   - [ ] One form lead: Monday item, heat and label, instant reply or opener (exactly one), reminder after 30 or 60 business minutes.
   - [ ] A repeat within 60 seconds, a "הסר" reply (all items with that phone stop), and three Gambot refusals (fallback notification).
   - [ ] Delete the TEST items afterwards.
6. Go live
   - [ ] Pilot with internal phones, then `build-workflows.js live <go-live ISO>` and activate.
   - [ ] First 48 hours: watch Monday notifications and Gambot. Rollback: deactivate the workflows and re-import the saved exports.

The landing site (site/, deploy/) did not change in these tasks; no VPS deploy is needed for it.

## 5. Still open
- Real Meta Lead Ads to intake routing: no adapter in the repo (NOT TESTED).
- SMS and email providers: BLOCKED by owner decision.
- Niche_Segment has no Monday column (computed only).
- The two "not built yet" items in step 4.
