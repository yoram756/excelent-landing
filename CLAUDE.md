# excelent-landing

@AGENTS.md

All project rules, commands and the folder layout live in AGENTS.md. Claude Code specifics only:

- The Stop hook in .claude/settings.json runs `scripts/verify.sh --changed` and blocks the end of a turn on failure (once per turn).
- Before declaring a complex task done, run the qa-reviewer agent (.claude/agents/qa-reviewer.md) with the requirements and your claims.
