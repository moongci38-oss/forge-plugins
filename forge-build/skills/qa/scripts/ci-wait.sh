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
  # ⚠️ `conclusion` 은 `gh pr checks` 에 없는 필드였다(2026-07-31 실측: 유효 필드는
  #    bucket/completedAt/description/event/link/name/startedAt/state/workflow).
  #    gh 가 `Unknown JSON field` 로 죽고 stderr 는 2>/dev/null 로 삼켜져 **stdout 이 빈 채**
  #    jq 로 들어갔다. jq 는 빈 입력에 아무것도 출력하지 않고 rc=0 이라 `|| echo PENDING`
  #    도 안 걸리고 STATUS 가 빈 문자열이 됐다 → 아래 case 4분기 어디에도 안 걸려
  #    **CI PASS/FAIL 을 한 번도 판정하지 못한 채 15분 타임아웃만 소진**했다.
  #    판정은 `bucket`(pass/fail/pending/skipping/cancel)으로 한다 — state 보다 정규화돼 있다.
  STATUS=$(gh pr checks "$PR_NUMBER" --json name,state,bucket \
    2>/dev/null | jq -r '
    if length == 0 then "no-checks"
    elif any(.[]; .bucket == "pending") then "PENDING"
    elif all(.[]; .bucket == "pass" or .bucket == "skipping") then "PASS"
    else "FAIL"
    end' 2>/dev/null || echo "PENDING")
  # 빈 문자열 = gh 호출 자체가 실패(미인증·필드 오타·네트워크). 조용히 타임아웃을 태우지 말고
  # 매 회차 눈에 보이게 알린다. 폴링은 계속한다(fail-open — 새 BLOCK 을 만들지 않는다, AD-168).
  [ -n "$STATUS" ] || STATUS="ERROR"

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
    ERROR)
      echo "[WARN ci-wait] gh pr checks 응답 없음 — 판정 불가 (${ELAPSED}/${TIMEOUT_SEC}s). gh 인증·필드 확인." >&2
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
  # 위와 같은 이유로 conclusion → bucket. 이 블록은 CI_RESULT=FAIL 일 때만 도는데, 그 FAIL
  # 자체가 도달 불가였으므로 이 경로는 여태 한 번도 실행되지 않았다(ci-trigger.jsonl 이 빈 이유).
  FAILED_CHECKS=$(gh pr checks "$PR_NUMBER" --json name,state,bucket \
    2>/dev/null | jq -r '.[] | select(.bucket == "fail") | .name' 2>/dev/null || echo "unknown")

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
