#!/usr/bin/env bash
set -u

# Usage: ./run-signups.sh 3
COUNT="${1:-1}"

echo "🚀 Will attempt up to ${COUNT} signup(s)"
echo

PASS=0
FAIL=0

for i in $(seq 1 "$COUNT"); do
  echo "──────────────────────────────────────────────"
  echo "▶️  Run ${i} of ${COUNT}"
  echo "──────────────────────────────────────────────"

  if npx playwright test --reporter=line; then
    PASS=$((PASS + 1))
    echo "✅ Run ${i} succeeded"
  else
    FAIL=$((FAIL + 1))
    echo "❌ Run ${i} failed — leaving row in CSV, moving on"
  fi
  echo
done

echo "══════════════════════════════════════════════"
echo "Summary:  ${PASS} passed, ${FAIL} failed, out of ${COUNT} attempted"
echo "══════════════════════════════════════════════"