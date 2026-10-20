# excelent-landing

Landing pages for אקסלנט (site/), the refinance lead funnel sources for n8n (automation/funnel/), and their tests (tests/).

## Language and style
- Replies to נריה and יורם in Hebrew only. No bold, no asterisks, no dashes between words.

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

## Production rules
- Server changes: git pull on the VPS, nginx config test in a throwaway container, then restart. Show the command first.
- Business WhatsApp for leads is 055-2783459; automated messages go out from Gambot 055-9881245. Never use 050-2234052.
- Do not touch excelentfinance.com (main site), n8n settings, OpenClaw or Hermes.
