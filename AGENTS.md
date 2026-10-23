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
| `src/config/campaigns/<id>.json` | One file per campaign or niche: identity, Monday board and columns, intake mapping, channels and opt-out, instant reply, stages, messages |
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
- Build workflow JSON: `node src/services/funnel/build-workflows.js test|live` (`CAMPAIGN=<id>` picks `src/config/campaigns/<id>.json`, default `refi`).
- Environment variables are listed in `.env.example`. Real secrets never enter the repo.

## Modularity principles (multi-niche)

- Everything campaign or niche specific comes from `src/config/campaigns/<id>.json` (or `config/`). Engine code in `src/` never hardcodes a niche name, board id, column id, phone, message or price.
- A new niche is a new campaign file plus tests, not a code fork. If the engine cannot express it, extend the engine generically for all campaigns.
- Monday.com is the single source of truth for lead state. Board, group and column ids live only in the campaign file (`board`, `columns`, `intake`, `crmFields`). Intake Code nodes get them as `__INTAKE__` through `src/webhooks/intake/source.js`; engine nodes get `__CONFIG__`, `__CRM_FIELDS__` and `__CHANNELS__` from build-workflows.js. Every harness that loads these sources must inject the same placeholders.
- Global opt-out: `channels.optOut.label` (today "הסר" on the funnel status) on any item stops every item with that phone on every channel. Fallback order is `channels.cascade`; a channel is used only with explicit consent and a configured provider. SMS and email have no provider (owner decision: deferred in config/lead-service.json).
- Instant reply (`instantReply`, src/services/funnel/instant-reply.js) is a first WhatsApp template within 60 seconds, called only from the intake workflow. It stays off until the owner approves a Gambot template id and enables it. When on, it replaces the engine's entry message: it marks `fn_last` after a confirmed send, the engine waits `graceMinutes` for that mark and then starts after the opener, or sends the opener itself if the instant reply never went out.
- Lead_Temperature is written to `color_mm88xpa8` only as an existing board label (`crmFields.leadTemperature.labels`) and only when heat changes; a label that already fits the tier (for example "רותח") is kept.
- `src/services/lifecycle/db.js` (local SQLite): `incoming_webhooks` (raw), `lead_dedup_locks` (atomic 60 second lock per normalized phone) and `lifecycle_events`. `admitLead` must succeed before any Monday write or WhatsApp send for that lead; n8n reaches it through `src/services/lifecycle/lock-server.js` (`POST /lock` with a bearer token, `GET /health`, bound to 127.0.0.1 by default); `tests/funnel/dedup.test.js` races separate processes on one file. `tests/funnel/board-columns.json` is a read-back of the real board; `tests/funnel/crm-fields.test.js` fails when a configured column is missing from it.
- Meta Lead Ads: `src/webhooks/intake/meta-adapter.js` verifies X-Hub-Signature-256 on the raw body, fetches the lead from the Graph API (token in the Authorization header, never the URL), and maps it to a campaign by `meta.campaignIds`; an unknown campaign is rejected. A lead form is a service request, never marketing consent.
- Secrets (lock token, Meta app secret, verify and access tokens) come only from env; `tests/funnel/secrets.test.js` scans the repo for known token shapes.
- Logical fields Lead_Temperature (HOT/WARM/COLD from heat), Niche_Segment and Churn_Reason are computed by `src/services/funnel/crm-fields.js`. A field with `"column": null` is never written.
- One phone rule: the single-line `norm` in validate.js, build-mutation.js, plan.js and calendly.js must stay identical (`tests/funnel/phone.test.js`). The WhatsApp sender comes only from `config/business.json` phones.gambot_sender.
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
