# 0001 Source layout under src/

Date: 2026-10-23
Status: accepted (TASK-01)

## Context
Funnel code lived in automation/{funnel,intake,lifecycle}. The target standard is src/ (webhooks, integrations, services), docs/ and tests/, with one config file per campaign or niche.

## Decision
- automation/intake moved to src/webhooks/intake (Code nodes behind the lead-intake webhook).
- automation/funnel moved to src/services/funnel, including dist/.
- automation/lifecycle moved to src/services/lifecycle.
- Modules moved whole with git mv, so history follows each file. Files were not split. Monday and Calendly adapters stay inside their service for now; src/integrations/ is the place for new provider adapters.
- Only path references changed: relative requires in src/, tests, CI path filters, scripts/verify.sh, .gitignore and operational docs. Dated reports and docs/evidence keep the old paths as a historical record.

## Consequences
- Production is not affected: docker-compose mounts only site/ and deploy/.
- Older reports mention automation/...; read them through the mapping above.
