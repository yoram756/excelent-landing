# excelent-landing

Landing pages for אקסלנט (site/), the refinance lead funnel sources for n8n (automation/funnel/), and their tests (tests/).

## Language and style
- Replies to יורם in Hebrew only. The owner is יורם (also יורם פלד or יורם אקסלנט). Never call him by another name. No bold, no asterisks, no dashes between words.

## How work is reported (binding)
- Every requirement gets exactly one status: PASS, FAIL, BLOCKED or NOT TESTED.
- PASS only with evidence: file path, command with exit code, test output, execution id, or a value read back from the target system (Monday, n8n, Gambot, Meta).
- A mock or simulation is never PASS for a production requirement. Say which it was.
- Never claim the funnel works while any essential part failed or was not tested.
- Before declaring a complex task done, run the qa-reviewer agent (.claude/agents/qa-reviewer.md) with the requirements and your claims.

## Tests
- `npm test` runs everything. `npm run test:funnel` is fast (node:test on the n8n Code node sources). `npm run test:site` runs 43 browser and accessibility checks against site/lp1v2 with a mock API.
- `scripts/verify.sh --changed` runs only the suites whose files changed. The Stop hook in .claude/settings.json runs it and blocks the end of a turn on failure (once per turn).
- When changing tests, prove they still fail on a broken input. Never weaken or delete a test to get a pass.

## Funnel (n8n)
- Source of truth for the n8n Code nodes is automation/funnel/*.js. Build workflow JSON with `node automation/funnel/build-workflows.js test|live`. Do not edit the Code nodes only inside n8n.
- MODE test handles only Monday items whose name starts with TEST and never calls Gambot (simulated send). MODE live handles real leads and sends real WhatsApp templates.
- Switching the engine to live, sending real messages to leads, and activating Meta campaigns need explicit approval from יורם.
- Test webhook paths are secret and are filled in at deploy time. Never commit them.
- Test leads: names start with TEST, phones 0500000040 and up. Delete them after tests.

## Identity and phone numbers (binding)
- Single source: config/business.json holds the phone numbers, their roles and the business profiles. Each campaign file chooses its profile, name and contact phone explicitly in its identity block. Nothing is inherited from another campaign.
- Excelent mortgage and finance campaigns (profile excelent_finance): name יורם / יורם פלד / יורם אקסלנט, contact for clients 055-2783459.
- 054-8180280 is backup: copy of internal alerts and approved tests. Never a client facing number.
- 055-9881245 is the technical Gambot sending number. Do not change or disconnect it.
- 050-2234052 belongs to יורם: tests, backup, West Negev real estate (with the name יורם חדד) only when a campaign sets it explicitly, and personal use. Never block it globally, never use it as a contact number unless the campaign defines it.
- יורם חדד is a known identity of יורם. Never replace one name with another automatically. The two approved sellers templates in Gambot stay as they are.
- Private chats and family contacts never enter the lead system. A test number never becomes a published business number because it was used in a test.
- Pilot and live builds refuse a campaign without an approved identity or with a pilot phone outside its approved test phones. tests/funnel/identity.test.js enforces this.
- Fix a name or number only on an explicit instruction from יורם. Contradictions are reported, not guessed.

## Production rules
- Server changes: git pull on the VPS, nginx config test in a throwaway container, then restart. Show the command first.
- Do not touch excelentfinance.com (main site), n8n settings, OpenClaw or Hermes.
