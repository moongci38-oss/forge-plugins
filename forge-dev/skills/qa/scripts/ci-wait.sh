#!/usr/bin/env bash
# ci-wait.sh — AD-93 W4 (plan §갭 18)
# GitHub CI 폴링 + FAIL 패턴 자동 분석
# Usage: bash ci-wait.sh [branch] [--timeout 900]
#
# 출력: CI PASS = exit 0 / CI FAIL = exit 2 + docs/qa/ci-trigger.jsonl append

set -euo pipefail

BRANCH="${1:-$(git branch --show-current 2>/dev/null || echo "")}"
TIMEOUT_SEC="${2:-900}"  # 15분
CI_TRIGGER_FILE="${CI_TRIGGER_FILE:-docs/qa/ci-trigger.jsonl}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ -z "$BRANCH" ]; then
  echo "ERROR: branch 미지정" >&2
  exit 1
fi

echo "[ci-wait] branch=${BRANCH} timeout=${TIMEOUT_SEC}s" >&2
mkdir -p docs/qa

# ─── PR 번호 탐색
PR_NUMBER=$(gh pr list --head "$BRANCH" --json number -q '.[0].number' 2>/dev/null || echo "")
if [ -z "$PR_NUMBER" ]; then
  echo "[WARN ci-wait] PR 없음 — gh pr checks 스킵 (CI 미설정 프로젝트)" >&2
  exit 0
fi

# ─── CI 폴링
CI_RESULT="pending"
ELAPSED=0
INTERVAL=30

while [ "$ELAPSED" -lt "$TIMEOUT_SEC" ]; do
  STATUS=$(gh pr checks "$PR_NUMBER" --json name,state,conclusion \
    2>/dev/null | jq -r '
    if length == 0 then "no-checks"
    elif all(.[]; .state == "COMPLETED") then
      if all(.[]; .conclusion == "SUCCESS" or .conclusion == "SKIPPED") then "PASS"
      else "FAIL"
      end
    else "PENDING"
    end' 2>/dev/null || echo "PENDING")

  case "$STATUS" in
    PASS)
      echo "[ci-wait] CI PASS (elapsed ${ELAPSED}s)" >&2
      CI_RESULT="PASS"
      break
      ;;
    FAIL)
      echo "[ci-wait] CI FAIL (elapsed ${ELAPSED}s)" >&2
      CI_RESULT="FAIL"
      break
      ;;
    no-checks)
      echo "[ci-wait] no CI checks — 통과" >&2
      CI_RESULT="PASS"
      break
      ;;
    PENDING)
      echo "[ci-wait] CI 진행 중 (${ELAPSED}/${TIMEOUT_SEC}s)..." >&2
      ;;
  esac

  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

# ─── Timeout 처리
if [ "$CI_RESULT" = "pending" ]; then
  echo "[WARN ci-wait] CI timeout (${TIMEOUT_SEC}s). cycle +1." >&2
  CI_RESULT="TIMEOUT"
fi

# ─── CI FAIL 패턴 분석 → ci-trigger.jsonl append
if [ "$CI_RESULT" = "FAIL" ]; then
  # 실패한 check 이름 추출
  FAILED_CHECKS=$(gh pr checks "$PR_NUMBER" --json name,state,conclusion \
    2>/dev/null | jq -r '.[] | select(.conclusion == "FAILURE") | .name' 2>/dev/null || echo "unknown")

  while IFS= read -r check_name; do
    SEQUENCE="unknown"
    case "${check_name,,}" in
      *lint*)    SEQUENCE="cr-code" ;;
      *test*)    SEQUENCE="healer-rerun" ;;
      *build*)   SEQUENCE="healer+cr-code" ;;
      *security*|*scan*)
        echo "[STOP ci-wait] 보안 CI FAIL: ${check_name} — Human 알림 필요" >&2
        SEQUENCE="STOP_SECURITY"
        ;;
      *) SEQUENCE="cr-code" ;;
    esac

    python3 -c "
import json
entry = {
    'timestamp': '${TS}',
    'pr': ${PR_NUMBER},
    'branch': '${BRANCH}',
    'failed_check': '${check_name}',
    'sequence': '${SEQUENCE}',
    'status': 'pending'
}
with open('${CI_TRIGGER_FILE}', 'a') as f:
    f.write(json.dumps(entry) + '\n')
" 2>/dev/null || true

    if [ "$SEQUENCE" = "STOP_SECURITY" ]; then
      exit 2
    fi
  done <<< "$FAILED_CHECKS"

  echo "[ci-wait] CI FAIL → ci-trigger.jsonl append. 메인 컨텍스트에서 시퀀스 처리 필요." >&2
  exit 2
fi

exit 0
