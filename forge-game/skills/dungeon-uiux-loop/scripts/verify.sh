#!/usr/bin/env bash
# dungeon-uiux-loop verifier — probe가 남긴 JSON을 binary 판정 (S1: 에이전트 자기채점 금지)
set -euo pipefail
REPORT="${GODBLADE_ROOT}/client/loops/dungeon-uiux-loop/verify-report.json"
[ -f "$REPORT" ] || { echo "FAIL: report 없음 ($REPORT)"; exit 1; }
# 5분 이상 낡은 리포트 = stale (fresh 검증 강제)
if [ $(( $(date +%s) - $(stat -c %Y "$REPORT") )) -gt 300 ]; then echo "FAIL: report stale(>5분)"; exit 1; fi
PASS=$(jq -r '.summary.pass' "$REPORT")
jq -r 'to_entries[] | select(.key!="summary") | "\(.key): \(if .value.pass then "PASS" else "FAIL" end) — \(.value.detail)"' "$REPORT"
if [ "$PASS" = "true" ]; then echo "VERDICT: PASS"; exit 0; else echo "VERDICT: FAIL ($(jq -r '.summary.failCount' "$REPORT")건)"; exit 1; fi
