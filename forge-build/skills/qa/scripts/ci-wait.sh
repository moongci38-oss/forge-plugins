#!/usr/bin/env bash
# ci-wait.sh — AD-93 W4 (plan §갭 18)
# GitHub CI 폴링 + FAIL 패턴 자동 분석
# Usage: bash ci-wait.sh [branch] [--timeout 900]
#
# 출력: CI PASS = exit 0 / CI FAIL = exit 2 + docs/qa/ci-trigger.jsonl append
#       판정 불가 = exit 3 — 체크 0개인데 local-ci 증거가 없거나 PR head 와 다르거나 FAIL 을 담음(#1286)

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
# #1465: 조회 **실패**(한도·인증·네트워크)와 **PR 없음**을 가른다. 종전 `2>/dev/null || echo ""` 는 한도 오류를
#   빈 값으로 바꿔 "PR 없음 → exit 0(통과)" 이 됐다(2026-09-28 #1463 — GraphQL 2차 제한, rate_limit 은 넉넉했다).
#   진짜 PR 없음 = gh rc 0 + 빈 출력 · 실패 = gh rc ≠ 0 → 판정 불가(rc 3, 이 스크립트의 기존 규약). 통과가 아니다.
# ⚠️ 무력화되는 입력: gh 가 오류인데 rc 0 을 내는 경우(현 gh 에서 관측 없음) — 그때는 종전처럼 'PR 없음' 으로 간다.
PR_LOOKUP_ERR="$(mktemp)"; PR_RC=0
PR_NUMBER=$(gh pr list --head "$BRANCH" --json number -q '.[0].number' 2>"$PR_LOOKUP_ERR") || PR_RC=$?
if [ -z "$PR_NUMBER" ]; then
  if [ "$PR_RC" -ne 0 ]; then
    if grep -qiE 'rate limit|secondary rate|abuse detection|unknown owner type' "$PR_LOOKUP_ERR" 2>/dev/null; then
      echo "[ci-wait] 판정 불가 — GitHub API 한도(2차 제한 포함)로 PR 을 조회하지 못했다. 'PR 없음' 이 아니다 — 통과 아님." >&2
      echo "[ci-wait]   → 한도가 풀린 뒤 다시 실행한다. 급하면 REST 로 확인: gh api repos/<owner>/<repo>/commits/<sha>/check-runs" >&2
    else
      echo "[ci-wait] 판정 불가 — PR 조회 실패(gh rc=$PR_RC): $(head -c 200 "$PR_LOOKUP_ERR" 2>/dev/null). 통과 아님." >&2
    fi
    rm -f "$PR_LOOKUP_ERR"
    exit 3
  fi
  rm -f "$PR_LOOKUP_ERR"
  echo "[WARN ci-wait] PR 없음 — gh pr checks 스킵 (CI 미설정 프로젝트)" >&2
  exit 0
fi
rm -f "$PR_LOOKUP_ERR"

# ─── CI 폴링
CI_RESULT="pending"
ELAPSED=0
NO_CHECKS_COUNT=0
INTERVAL="${CI_WAIT_INTERVAL:-30}"   # 테스트가 줄인다 — 운영 기본 30초
case "$INTERVAL" in ''|*[!0-9]*) INTERVAL=30 ;; esac
# 0 은 숫자지만 sleep 0 + ELAPSED+0 이라 타임아웃에 영원히 못 닿는다(#1266 r1 R1-3) — 양의 정수만 허용.
# ⚠️ 무력화되는 입력: 위 case 를 지나지 않은 값(비숫자)을 여기만 거치게 하면 `-gt` 가 오류를 내며 통과한다 — 순서를 바꾸지 마라.
if ! [ "$INTERVAL" -gt 0 ]; then
  echo "[WARN ci-wait] CI_WAIT_INTERVAL='${CI_WAIT_INTERVAL:-}' 무효(양의 정수 아님) — 30초로 대체" >&2
  INTERVAL=30
fi
GH_ERR="$(mktemp)"; trap 'rm -f "$GH_ERR"' EXIT

while [ "$ELAPSED" -lt "$TIMEOUT_SEC" ]; do
  # ⚠️ `conclusion` 은 `gh pr checks` 에 없는 필드였다(2026-07-31 실측: 유효 필드는
  #    bucket/completedAt/description/event/link/name/startedAt/state/workflow).
  #    gh 가 `Unknown JSON field` 로 죽고 stderr 는 2>/dev/null 로 삼켜져 **stdout 이 빈 채**
  #    jq 로 들어갔다. jq 는 빈 입력에 아무것도 출력하지 않고 rc=0 이라 `|| echo PENDING`
  #    도 안 걸리고 STATUS 가 빈 문자열이 됐다 → 아래 case 4분기 어디에도 안 걸려
  #    **CI PASS/FAIL 을 한 번도 판정하지 못한 채 15분 타임아웃만 소진**했다.
  #    판정은 `bucket`(pass/fail/pending/skipping/cancel)으로 한다 — state 보다 정규화돼 있다.
  # ⚠️ 체크가 0개인 PR 에서 `gh pr checks` 는 `[]` 가 아니라 **rc=1 + 빈 stdout** 을 내고
  #    stderr 에 "no checks reported on the '<branch>' branch" 를 쓴다(#1258 실측: `gh pr checks 1243`).
  #    종전엔 stderr 를 버려 이 경우가 아래 ERROR 로 떨어졌고, `no-checks` 분기에 한 번도 못 가
  #    **15분 타임아웃을 통째로 태웠다**. develop 대상 PR 에서 Actions 를 끈 뒤(#1258)로는 이게 기본 경로다.
  #    그래서 stderr 를 따로 받아 그 문구면 no-checks 로 판정한다.
  #    ⚠️ 무력화되는 입력: gh 가 이 문구를 바꾸거나 현지화하면 다시 ERROR(→타임아웃)로 떨어진다 — 문구는 gh 2.x 기준.
  GH_OUT=$(gh pr checks "$PR_NUMBER" --json name,state,bucket 2>"$GH_ERR") || true
  if [ -z "$GH_OUT" ] && grep -qi 'no checks reported' "$GH_ERR" 2>/dev/null; then
    STATUS="no-checks"
  else
    STATUS=$(printf '%s' "$GH_OUT" | jq -r '
    if length == 0 then "no-checks"
    elif any(.[]; .bucket == "pending") then "PENDING"
    elif all(.[]; .bucket == "pass" or .bucket == "skipping") then "PASS"
    else "FAIL"
    end' 2>/dev/null || echo "PENDING")
  fi
  # 빈 문자열 = gh 호출 자체가 실패(미인증·필드 오타·네트워크). 조용히 타임아웃을 태우지 말고
  # 매 회차 눈에 보이게 알린다. 폴링은 계속한다(fail-open — 새 BLOCK 을 만들지 않는다, AD-168).
  [ -n "$STATUS" ] || STATUS="ERROR"
  if [ "$STATUS" != "no-checks" ]; then
    NO_CHECKS_COUNT=0
  fi

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
      # PR 직후 체크 등록이 늦을 수 있어 INTERVAL 을 사이에 두고 연속 2회 확인한다.
      # ⚠️ 무력화되는 입력: 두 번째 관측 뒤에야 등록되는 체크는 이 유예로 잡지 못한다.
      NO_CHECKS_COUNT=$((NO_CHECKS_COUNT + 1))
      if [ "$NO_CHECKS_COUNT" -ge 2 ]; then
        # 체크 0개는 #1272 이후 정상 상태라 "통과"가 아무것도 확인하지 않는다 — 정본 게이트인 local-ci 증거가
        # **이 PR head 의 것**이고 FAIL 0 인지 대조한 뒤에만 통과시킨다(#1286). 없음·불일치·FAIL = 판정 불가(rc 3).
        # ci-wait 가 local-ci 를 직접 돌리지 않는 이유: `/forge-pr` §2.5 가 바로 앞 줄에서 이미 돌린다(중복 실행 방지).
        # ⚠️ 무력화되는 입력: 누군가 증거 파일을 손으로 써서 full_sha 를 맞추는 경우 — 내용 위조까지는 못 막는다.
        # git 최상위는 따로 구한다 — `${…:-$(git …)}` 안의 치환이 실패하면 set -e 로 rc 128 이 새어
        # 판정 불가(rc 3)·안내문 없이 죽었다(#1302 ①: git 레포 밖 + CI_WAIT_EVIDENCE 미지정).
        # ⚠️ 무력화되는 입력: 이 줄을 다시 `${CI_WAIT_EVIDENCE:-$(git …)}` 한 줄로 합치는 편집 — 테스트 8j 가 잡는다.
        TOP=$(git rev-parse --show-toplevel 2>/dev/null) || TOP=""
        if [ -z "${CI_WAIT_EVIDENCE:-}" ] && [ -z "$TOP" ]; then
          echo "[ci-wait] 판정 불가 — git 레포 밖이라 local-ci 증거 경로를 못 정한다(CI_WAIT_EVIDENCE 미지정). 통과 아님." >&2
          echo "[ci-wait]   → 레포 안에서 다시 실행하거나 CI_WAIT_EVIDENCE=<증거 파일 절대경로> 를 준다." >&2
          exit 3
        fi
        EVID="${CI_WAIT_EVIDENCE:-$TOP/.claude/state/local-ci-latest.txt}"
        HEAD_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid -q .headRefOid 2>/dev/null || true)
        # 파일이 없으면 sed 가 rc 2 — pipefail·set -e 로 CI FAIL(rc 2)과 같은 번호가 새지 않게 막는다.
        EV_SHA=$(sed -n 's/^full_sha=//p' "$EVID" 2>/dev/null | head -1) || EV_SHA=""
        EV_SUM=$(sed -n 's/^summary=//p' "$EVID" 2>/dev/null | head -1) || EV_SUM=""
        if ! [[ "$HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]; then
          echo "[ci-wait] 판정 불가 — PR #$PR_NUMBER head sha 를 못 읽었다. 통과 아님." >&2
          exit 3
        elif [ "$EV_SHA" != "$HEAD_SHA" ]; then
          echo "[ci-wait] 판정 불가 — 체크 0개인데 local-ci 증거가 이 PR head(${HEAD_SHA:0:9})의 것이 아니다(증거: ${EV_SHA:-없음} · $EVID)." >&2
          # 증거가 PR head 의 후손(로컬 커밋 미푸시)이면 local-ci 를 다시 돌려도 같은 rc 3 이다 — push 가 먼저다(#1302 ②).
          # ⚠️ 무력화되는 입력: PR head 커밋이 로컬에 없으면(fetch 전) 조상 판정이 실패해 재실행 안내로 떨어진다(안전한 쪽).
          if [ -n "$EV_SHA" ] && git merge-base --is-ancestor "$HEAD_SHA" "$EV_SHA" 2>/dev/null; then
            echo "[ci-wait]   → 증거(${EV_SHA:0:9})가 PR head 보다 앞선 커밋이다 — 로컬 커밋을 push 했는지 먼저 확인하라(재실행만으로는 안 풀린다)." >&2
          else
            echo "[ci-wait]   → bash shared/scripts/local-ci.sh --base origin/<base> 를 이 HEAD 에서 다시 돌린 뒤 재시도하라." >&2
          fi
          exit 3
        elif ! [[ "$EV_SUM" =~ (^|[[:space:]])FAIL=0([[:space:]]|$) ]]; then
          echo "[ci-wait] 판정 불가 — local-ci 증거가 실패를 담고 있다(${EV_SUM:-summary 없음}). 통과 아님." >&2
          exit 3
        fi
        echo "[ci-wait] no CI checks — 연속 2회 확인 · local-ci 증거 head(${HEAD_SHA:0:9}) 일치·${EV_SUM}, 통과" >&2
        CI_RESULT="PASS"
        break
      fi
      echo "[ci-wait] CI 체크 없음 — ${INTERVAL}초 뒤 재확인" >&2
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
  # 실패 체크가 있으면 gh 는 rc=1 이다 — 응답을 먼저 받아 가짜 unknown 기록을 막는다.
  # ⚠️ 무력화되는 입력: JSON 자체가 깨지면 jq 실패로 기존 unknown 폴백이 남는다.
  GH_OUT=$(gh pr checks "$PR_NUMBER" --json name,state,bucket 2>/dev/null) || true
  FAILED_CHECKS=$(printf '%s' "$GH_OUT" | jq -r '.[] | select(.bucket == "fail") | .name' 2>/dev/null || echo "unknown")

  while IFS= read -r check_name; do
    SEQUENCE="unknown"
    # 검수 다이어트 §A2(사람 결정 2026-09-16, 계획서 ~/forge-outputs/11-platform/pipelines/plans/2026-09-16-review-diet-plan.md):
    #   후속 시퀀스 힌트에서 Codex 래퍼(cr-code)를 뺐다 — 수정 검수는 Claude code-reviewer 1회, 교차 검수는 /forge-pr cr-final 1회.
    #   구 표기 SEQUENCE="cr-code"·"healer+cr-code" 는 2026-09-16 폐기.
    #   ⚠️ 무력화되는 입력: 이 jsonl 을 읽은 메인 컨텍스트가 힌트를 무시하고 /cr-code 를 수동 호출하면 Codex 가 다시 불린다(힌트일 뿐 강제 아님).
    #   폐기조건: 버그 수정 단계 교차 검수가 사람 결정으로 복원되면 되돌린다.
    case "${check_name,,}" in
      *lint*)    SEQUENCE="code-reviewer" ;;
      *test*)    SEQUENCE="healer-rerun" ;;
      *build*)   SEQUENCE="healer+code-reviewer" ;;
      *security*|*scan*)
        echo "[STOP ci-wait] 보안 CI FAIL: ${check_name} — Human 알림 필요" >&2
        SEQUENCE="STOP_SECURITY"
        ;;
      *) SEQUENCE="code-reviewer" ;;
    esac

    # 체크 이름·브랜치명은 GitHub 에서 온 외부 문자열이다 — 파이썬 코드에 보간하지 않고 argv 로 넘겨
    # 데이터로만 읽는다(#1266 r1 R1-1: 따옴표+식이 든 체크 이름이 로컬에서 실행됐다. 이 PR 로 FAIL 분기가 처음 도달 가능해졌다).
    # ⚠️ 무력화되는 입력: 이 블록을 다시 "…${var}…" 보간형 -c 문자열로 되돌리는 편집 — 인용 검사기가 없다(테스트 6 이 그 회귀를 잡는다).
    python3 -c '
import json, sys
ts, pr, branch, check, seq, out = sys.argv[1:7]
entry = {
    "timestamp": ts,
    "pr": int(pr) if pr.isdigit() else pr,
    "branch": branch,
    "failed_check": check,
    "sequence": seq,
    "status": "pending",
}
with open(out, "a") as f:
    f.write(json.dumps(entry) + "\n")
' "$TS" "$PR_NUMBER" "$BRANCH" "$check_name" "$SEQUENCE" "$CI_TRIGGER_FILE" 2>/dev/null || true

    if [ "$SEQUENCE" = "STOP_SECURITY" ]; then
      exit 2
    fi
  done <<< "$FAILED_CHECKS"

  echo "[ci-wait] CI FAIL → ci-trigger.jsonl append. 메인 컨텍스트에서 시퀀스 처리 필요." >&2
  exit 2
fi

exit 0
