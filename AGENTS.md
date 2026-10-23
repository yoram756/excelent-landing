# AGENTS.md

Single instruction file for every coding agent (Claude Code, Codex, others) working in excelent-landing.
CLAUDE.md only points here. Change rules here, not there.

Landing pages for אקסלנט (site/), the lead funnel sources for n8n (src/), and their tests (tests/).

## Layout

| Path | Holds |
|---|---|
| `src/webhooks/intake/` | n8n Code nodes behind the `lead-intake` webhook: validate, dedupe, Monday mutation, save check, callback SLA reminder |
| `src/services/funnel/` | Shared multi-campaign funnel engine (plan, send, reconcile, personal links, Calendly match) and `build-workflows.js`; built n8n JSON in `dist/` |
| `src/services/lifecycle/` | Isolated lifecycle orchestration, consent, voluntary feedback, CRM sandbox projection, metrics |
| `src/integrations/` | Reserved for new provider adapters (Monday, Gambot, Calendly, Meta). Existing adapters still live inside their service module; move them only together with their tests |
| `campaigns/<id>.json` | One file per campaign or niche: identity, Monday board and columns, stages, messages |
| `config/` | Cross-campaign data: `business.json` (phones, people, profiles), `lead-service.json` (owner-approved response SLA), `lifecycle/` |
| `site/` | Static landing pages served by nginx (`site/lp1v2` is live) |
| `deploy/`, `docker-compose.yml` | nginx config and the VPS container. Production mounts only `site/` and `deploy/` |
| `docs/` | Release reports, audits and `docs/decisions/` (decision records). `docs/evidence/` is a historical record: never rewrite it |
| `tests/` | `funnel/` (node:test, unit and contract), `site/` (Playwright and axe), `deploy/` (real nginx routing) |

## Commands

- `npm ci` installs dependencies (Node >= 22.13). `npx playwright install chromium` once for site tests.
- `npm test` runs everything.
- `npm run test:funnel` is fast (node:test on the n8n Code node sources, unit and contract tests).
- `npm run test:site` runs browser and accessibility checks against site/lp1v2 with a mock API.
- `npm run test:deploy` needs nginx on PATH or `NGINX_BINARY`. CI installs it.
- `scripts/verify.sh --changed` runs only the suites whose files changed.
- Build workflow JSON: `node src/services/funnel/build-workflows.js test|live` (`CAMPAIGN=<id>` picks `campaigns/<id>.json`, default `refi`).
- Environment variables are listed in `.env.example`. Real secrets never enter the repo.

## Modularity principles (multi-niche)

- Everything campaign or niche specific comes from `campaigns/<id>.json` (or `config/`). Engine code in `src/` never hardcodes a niche name, board id, column id, phone, message or price.
- A new niche is a new campaign file plus tests, not a code fork. If the engine cannot express it, extend the engine generically for all campaigns.
- Monday.com is the single source of truth for lead state. Column ids live only in the campaign file under `columns`.
- Response time targets come from `config/lead-service.json`, which records owner decisions. Do not change them without an explicit owner instruction.
- Provider calls (Monday, Gambot, Calendly, Meta) stay behind one module each, so they can be tested with an injected transport.

## Language and style
- Replies to יורם in Hebrew only. The owner is יורם (also יורם פלד or יורם אקסלנט). Never call him by another name. No bold, no asterisks, no dashes between words.

## How work is reported (binding)
- Every requirement gets exactly one status: PASS, FAIL, BLOCKED or NOT TESTED.
- PASS only with evidence: file path, command with exit code, test output, execution id, or a value read back from the target system (Monday, n8n, Gambot, Meta).
- A mock or simulation is never PASS for a production requirement. Say which it was.
- Never claim the funnel works while any essential part failed or was not tested.

## Tests
- When changing tests, prove they still fail on a broken input. Never weaken or delete a test to get a pass.

## Funnel (n8n)
- Source of truth for the n8n Code nodes is src/services/funnel/*.js and src/webhooks/intake/*.js. Do not edit the Code nodes only inside n8n.
- MODE test handles only Monday items whose name starts with TEST and never calls Gambot (simulated send). MODE live handles real leads and sends real WhatsApp templates.
- Switching the engine to live, sending real messages to leads, and activating Meta campaigns need explicit approval from יורם.
- Test webhook paths are secret and are filled in at deploy time. Never commit them.
- Test leads: names start with TEST, phones 0500000040 and up. Delete them after tests.

## Identity and phone numbers (binding)
- Single source: config/business.json holds the phone numbers, their roles and the business profiles. Each campaign file chooses its profile, name and contact phone explicitly in its identity block. Nothing is inherited from another campaign.
- Excelent mortgage and finance campaigns (profile excelent_finance): name יורם / יורם פלד / יורם אקסלנט, contact for clients 055-2783459.
- 054-8180280 belongs to נריה חדד, a separate person and business partner: copy of internal alerts and approved tests. Never a client facing number. Addressing נריה by name on his own number is correct. People and their phones are listed under people in config/business.json; a test message uses the name of the person who owns the test phone.
- 055-9881245 is the technical Gambot sending number. Do not change or disconnect it.
- 050-2234052 belongs to יורם: tests, backup, West Negev real estate (with the name יורם חדד) only when a campaign sets it explicitly, and personal use. Never block it globally, never use it as a contact number unless the campaign defines it.
- יורם חדד is a known identity of יורם. Never replace one name with another automatically. The two approved sellers templates in Gambot stay as they are.
- Private chats and family contacts never enter the lead system. A test number never becomes a published business number because it was used in a test.
- Pilot and live builds refuse a campaign without an approved identity or with a pilot phone outside its approved test phones. tests/funnel/identity.test.js enforces this.
- Fix a name or number only on an explicit instruction from יורם. Contradictions are reported, not guessed.

## Production rules
- Server changes: git pull on the VPS, nginx config test in a throwaway container, then restart. Show the command first.
- Do not touch excelentfinance.com (main site), n8n settings, OpenClaw or Hermes.
