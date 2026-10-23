# HANDOVER TASK-01

Date: 2026-10-23. Branch: `task-01/modular-structure` (local, uncommitted, not pushed).

## Status per requirement

| Requirement | Status | Evidence |
|---|---|---|
| Merge release/lp1-funnel-hardening-20261020 (PR #2) into main | PASS (local only) | main was an ancestor of the branch, so the merge was `git merge --ff-only` with no conflicts. Local main is at ebb3bde. Not pushed: origin/main is still 919f3d5 |
| Layout src/ docs/ tests/ | PASS | automation/intake moved to src/webhooks/intake; automation/funnel to src/services/funnel; automation/lifecycle to src/services/lifecycle (git mv). See docs/decisions/0001-src-layout.md |
| AGENTS.md plus slim CLAUDE.md | PASS | AGENTS.md holds layout, commands, modularity principles and the binding rules moved word for word from the old CLAUDE.md. CLAUDE.md imports it with `@AGENTS.md` |
| .env.example without secrets | PASS | Lists only the variables the code reads: CAMPAIGN, NGINX_BINARY, PW_CHROMIUM. `.env` added to .gitignore |
| Unit and contract tests | PASS | `npm run test:funnel` 264/264; `npm run test:site` 55/55; `tests/deploy/routing.test.js` 2/2 in a node:22 container with nginx 1.22.1 (Windows has no nginx) |
| Production unaffected | PASS (by config reading) | docker-compose.yml mounts only site/ and deploy/; neither changed. Nothing deployed |

## Not done, needs a decision from יורם

1. 60 second response window: config/lead-service.json records an owner-approved SLA of 30 minutes (questionnaire done) and 60 minutes (without questionnaire), in business hours. That contradicts 60 seconds. Nothing changed. Also, 60 seconds would need an automatic first message, not a human callback.
2. Monday fields Niche_Segment, Lead_Temperature (HOT/WARM/COLD), Churn_Reason: no such columns exist in campaigns/*.json. Today there is `heat` (numeric). Adding them needs real column ids from the board, plus the rule mapping heat to HOT/WARM/COLD. Not invented.
3. src/integrations/: reserved but empty. The Monday and Calendly adapters stay inside their service modules. Splitting them is a separate refactor with tests.
4. Push: local main (fast-forward) and the branch have not been pushed. PR #2 on GitHub is still open.

## Not touched on purpose
docs/evidence/ and dated reports keep the old automation/ paths as a historical record. site/, deploy/, campaigns/, config/ unchanged apart from documentation.
