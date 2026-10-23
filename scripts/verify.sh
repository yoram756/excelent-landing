#!/usr/bin/env bash
# Deterministic checks for this repo. Usage: scripts/verify.sh [--changed]
# --changed: run only the suites whose files changed since the last commit (used by the Stop hook).
set -u
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install --no-audit --no-fund >/dev/null 2>&1
changed=$( { git status --porcelain -uall 2>/dev/null | awk '{print $2}'; git diff --name-only @{u}..HEAD 2>/dev/null; } | sort -u )
run_funnel=1; run_site=1; run_deploy=1
if [ "${1:-}" = "--changed" ]; then
  run_funnel=0; run_site=0; run_deploy=0
  echo "$changed" | grep -qE '^(src/|tests/funnel/|config/|package.json)' && run_funnel=1
  echo "$changed" | grep -qE '^(site/|tests/site/)' && run_site=1
  echo "$changed" | grep -qE '^(deploy/|tests/deploy/|docker-compose.yml|package.json|scripts/verify.sh|.github/workflows/funnel-ci.yml)' && run_deploy=1
fi
fail=0
if [ $run_funnel = 1 ]; then
  if npm run -s test:funnel >/tmp/verify-funnel.log 2>&1; then echo "PASS funnel: $(grep -E '^# pass' /tmp/verify-funnel.log)"; else echo "FAIL funnel (log /tmp/verify-funnel.log):"; grep -E '^not ok' /tmp/verify-funnel.log | head -10; fail=1; fi
fi
if [ $run_site = 1 ]; then
  if timeout 600 npm run -s test:site >/tmp/verify-site.log 2>&1; then echo "PASS site: $(tail -1 /tmp/verify-site.log)"; else echo "FAIL site (log /tmp/verify-site.log):"; grep -E '^FAIL' /tmp/verify-site.log | head -10; tail -1 /tmp/verify-site.log; fail=1; fi
fi
if [ $run_deploy = 1 ]; then
  if npm run -s test:deploy >/tmp/verify-deploy.log 2>&1; then echo "PASS deploy: $(grep -E '^# pass' /tmp/verify-deploy.log)"; else echo "FAIL deploy (log /tmp/verify-deploy.log):"; tail -20 /tmp/verify-deploy.log; fail=1; fi
fi
[ $run_funnel = 0 ] && [ $run_site = 0 ] && [ $run_deploy = 0 ] && echo "SKIP no tested files changed"
exit $fail
