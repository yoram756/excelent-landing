# HANDOVER

History: TASK-01 (src/ layout, 282f73a) and TASK-02 (phone rule and Monday field mapping, 1e5143a) are on main.
Architect decisions: the 60 second window is a first automatic WhatsApp template (HSM); the human SLA stays 30 to 60 minutes.

## TASK-03 n8n build, omni-channel and multi-niche config (2026-10-23)

| Requirement | Status | Evidence |
|---|---|---|
| crm-fields.js wired into build-workflows.js | PASS | Injected into the Plan node as `__CRM_FIELDS__`; each planned item carries `leadTemperature` and `nicheSegment`. Nothing is written to Monday while those columns are null |
| Deploy or update the workflows in n8n | BLOCKED | This environment has no n8n API access, and AGENTS.md requires explicit approval from יורם for anything that reaches real leads. The built files are ready in src/services/funnel/dist/ |
| Column ids out of build-mutation.js | PASS | Board, group, new stage and 21 column ids moved to `intake` in src/config/campaigns/refi.json and are injected as `__INTAKE__` by src/webhooks/intake/source.js (also find-query.js). Golden check: find-query, create and update output is byte identical before and after for two leads |
| Per-niche config in src/config/campaigns/ | PASS | campaigns/ moved with git mv; every reference updated |
| Fallback WhatsApp to SMS to Email | PASS (decision and notification); sending BLOCKED | src/services/funnel/channels.js picks the next channel that has explicit consent and a configured provider. After the third WhatsApp failure, After send passes the decision to Yoram as a Monday notification (`Fallback?` and `Notify fallback` nodes). SMS and email have no provider (owner decision: deferred), so nothing is sent on them |
| Global opt-out | PASS | `channels.optOut.label` ("הסר", the existing funnel status, so no new Monday label) on any item stops every item with the same phone and blocks re-enrollment |
| Instant WhatsApp HSM within 60 seconds | PASS (prepared, off) | src/services/funnel/instant-reply.js and dist/instant-reply-test.json. It can only be called by the intake workflow (Execute Workflow Trigger, no public webhook), sends from 972559881245 once per lead, only with WhatsApp consent and within 60 seconds. Off until a Gambot template id is approved and `instantReply.enabled` is set |

### Test output
- Linux container (node 22, nginx 1.22.1), the same as CI: `npm run test:funnel` 286/286 pass; `npm run test:deploy` 2/2 pass.
- Windows: `npm run test:site` 55/55.
- Total: 343/343.
- New tests: tests/funnel/omni-channel.test.js (10 tests) and 4 structure tests in tests/funnel/build.test.js (placeholders replaced in every Code node, fallback wiring, no SMS or email HTTP node, instant reply trigger and disabled send).
- Mutation check: removing the global opt-out from plan.js makes the opt-out test fail.
- dist/*.json was rebuilt in Linux and contains no carriage returns.

## Open items, need a decision
1. Deploy: n8n access (an API key, or importing the dist files) plus approval from יורם to replace the live intake and engine workflows. Importing the intake workflow goes through src/webhooks/intake/patch-export.js.
2. Instant reply and the engine first message: the engine already sends its first template within 5 minutes. When the instant reply is enabled, choose whether it replaces the engine's first message or both are sent. Otherwise a lead gets two openers.
3. SMS and email providers: none chosen. They are deferred in config/lead-service.json. A provider plus consent wording is required before `providers.sms` or `providers.email` is set.
4. The fallback reacts to Gambot refusals (send failures), not to delivery status callbacks, which are not tracked today.
5. Out of scope, still hardcoded: pick-overdue.js and patch-reminder-export.js (the SLA reminder workflow) use refi column ids and the board id.
6. Lead_Temperature and Niche_Segment still have no Monday column. Creating one is a Monday write that needs approval.
