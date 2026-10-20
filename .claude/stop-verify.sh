#!/usr/bin/env bash
# Stop hook: blocks the end of a turn when changed files fail their tests.
input=$(cat)
active=$(printf '%s' "$input" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("stop_hook_active",False))' 2>/dev/null)
out=$("$CLAUDE_PROJECT_DIR/scripts/verify.sh" --changed 2>&1); code=$?
if [ $code -ne 0 ]; then
  if [ "$active" = "True" ]; then exit 0; fi   # already blocked once this turn; avoid an endless loop
  printf 'Tests fail on the changed files. Fix them, rerun scripts/verify.sh, or report FAIL with this output:\n%s\n' "$out" >&2
  exit 2
fi
exit 0
