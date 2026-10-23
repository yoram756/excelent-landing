# HANDOVER

## TASK-01 closed
- Commit 282f73a "refactor: complete TASK-01 modular folder structure and build tests" was merged into main (fast-forward) and pushed. origin/main moved 919f3d5..282f73a, which also contains PR #2 (ebb3bde).
- Architect decisions recorded: the 60 second window is a first automatic WhatsApp message; the human SLA stays 30 to 60 minutes (config/lead-service.json). Monday fields are mapped in TASK-02.

## TASK-02 Monday and phone alignment (2026-10-23)

| Requirement | Status | Evidence |
|---|---|---|
| Phone gap found and closed | PASS (code and tests) | Four normalizers disagreed. `00972501234567` became `9720972501234567` in the engine, `+972-0501234567` became `9720501234567`, and intake rejected both plus `050.123.4567`. One canonical `norm` now lives in validate.js, build-mutation.js, plan.js and calendly.js |
| WhatsApp sender is the active number | PASS | plan.js sends `from: BIZ.phones.gambot_sender.e164` = 972559881245 from config/business.json. The test fails if `9881245` is hardcoded in any src JS file |
| Monday column ids from the API | PASS | get_board_info on board 5106246268 (read only), saved as tests/funnel/board-columns.json (52 columns) |
| Field mapping in src/services/funnel | PASS (computed, not written) | `crmFields` in campaigns/refi.json and consolidation.json plus src/services/funnel/crm-fields.js |
| Tests | PASS | See below |

### Mapping

| Logical field | Source | Monday column | Written now |
|---|---|---|---|
| Lead_Temperature | heat `numeric_mm883h9v`: HOT >= 70, WARM 40 to 69, COLD < 40 | none (column null) | no |
| Niche_Segment | campaign value (`refi`, `consolidation`) | none, the board has no such column | no |
| Churn_Reason | close reason | `refi_close_reason` (text, "סיבת סגירה") | only when the code is wired in |

The thresholds are not new: they match the existing intake bands (>= 85 רותח and >= 70 חם מאוד = HOT, >= 40 חם = WARM, below = מתעניין = COLD) and handoff.heatAtLeast 70. A test checks this for every heat value from 0 to 120.

### Test output
- Linux container (node 22, nginx 1.22.1), the same as CI: `npm run test:funnel` 272/272 pass (264 before plus 8 new); `npm run test:deploy` 2/2 pass.
- Windows: `npm run test:site` 55/55.
- The new tests fail on the previous code: run against HEAD sources with PHONE_SOURCE_ROOT, 2 of the 4 phone tests fail (`every copy of norm...`, `intake accepts every common mobile format...`).
- dist/*.json was rebuilt in Linux. All 27 changed lines are the new norm or the crmFields block.

## Open items, need a decision
1. Not deployed: the n8n intake and engine workflows still run the old code. Applying the new phone rule live needs the approved deploy path (patch-export / build-workflows) and an owner decision.
2. No .env override for the sender number was added. AGENTS.md binds phones to a single source (config/business.json), and n8n Code nodes do not read the repo .env.
3. Lead_Temperature and Niche_Segment have no Monday column. Choose: a new status column (a Monday write that needs approval), or reuse the Hebrew label column `color_mm88xpa8`, which has five tiers.
4. crm-fields.js is a Node module and is not yet called from an n8n Code node. Wiring it in means injecting it in build-workflows.js.
5. Found, not in scope: build-mutation.js hardcodes refi column ids (refi_phone, color_mm88..., etc.), which breaks the multi-niche rule. It should move to the campaign config in a separate task.
6. The 60 second automatic WhatsApp is decided but not built.
