#!/usr/bin/env bash
# harness-backlog-loop — 종료조건 판정 + 회귀 감지 (executor 와 분리된 별도 프로그램)
#
# 두 가지 용도:
#   1) exit predicate — 자동 대상(gate==none && tier!=LOCAL)이 전부 done 이고 verify 전건 PASS
#   2) regression 검사 — 이미 done 인 항목의 verify 가 FAIL 로 전환됐는지 (--regression-only)
#
# usage: verify-all.sh [--backlog <path>] [--regression-only]
#
# exit 0 : predicate 충족 (또는 --regression-only 에서 회귀 0건)
# exit 1 : 미충족 (pending 잔존 또는 FAIL 존재)
# exit 2 : REGRESSION 감지 — 루프는 즉시 STOP 해야 한다
# exit 5 : 백로그 파싱 실패

set -uo pipefail

FORGE_OUTPUTS="${FORGE_OUTPUTS:-$HOME/forge-outputs}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BACKLOG="$FORGE_OUTPUTS/11-platform/pipelines/backlog/2026-07-30-reviews-backlog.jsonl"

BACKLOG="$DEFAULT_BACKLOG"
REGRESSION_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --backlog)         BACKLOG="$2"; shift 2 ;;
    --regression-only) REGRESSION_ONLY=1; shift ;;
    *) shift ;;
  esac
done

[ -f "$BACKLOG" ] || { echo "[verify-all] BAD_BACKLOG: $BACKLOG" >&2; exit 5; }

# 자동 대상 목록 (gate==none && tier!=LOCAL) — id<TAB>status
ROWS="$(python3 - "$BACKLOG" <<'PY'
import json, sys
try:
    for line in open(sys.argv[1], encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        if r.get("gate") == "none" and r.get("tier") != "LOCAL":
            print(f"{r.get('id')}\t{r.get('status','')}")
except Exception as e:
    print(f"PARSE_ERROR {type(e).__name__}: {e}", file=sys.stderr)
    sys.exit(5)
PY
)" || { echo "[verify-all] 백로그 파싱 실패" >&2; exit 5; }

TOTAL=0; DONE=0; PENDING=0; GATED=0; FAILED=0; MANUAL=0; NOCMD=0; REGRESSION=0
FAIL_IDS=""; REG_IDS=""; NOCMD_IDS=""; GATED_IDS=""

while IFS=$'\t' read -r id status; do
  [ -z "$id" ] && continue
  TOTAL=$((TOTAL+1))

  case "$status" in
    done)
      DONE=$((DONE+1))
      # done 항목은 항상 재검증 — FAIL 이면 회귀다
      "$HERE/verify-item.sh" "$id" --backlog "$BACKLOG" >/dev/null 2>&1
      rc=$?
      case $rc in
        0) : ;;
        2) MANUAL=$((MANUAL+1)) ;;
        3) NOCMD=$((NOCMD+1)); NOCMD_IDS="$NOCMD_IDS $id" ;;
        *) REGRESSION=$((REGRESSION+1)); REG_IDS="$REG_IDS $id" ;;
      esac
      ;;
    mutation-pending|manual-verify|no-verify-cmd|skipped)
      # pending 을 벗어났지만 done 도 아니다 — 사람 판정(G2/G3) 대기.
      # 진행 지표에는 포함하되 predicate 는 충족시키지 않는다.
      GATED=$((GATED+1)); GATED_IDS="$GATED_IDS $id:$status"
      ;;
    *)
      PENDING=$((PENDING+1))
      if [ "$REGRESSION_ONLY" -eq 0 ]; then
        FAILED=$((FAILED+1)); FAIL_IDS="$FAIL_IDS $id"
      fi
      ;;
  esac
done <<< "$ROWS"

# resolved = done + gated. 루프의 **진행 지표(plateau 판정용)** 다.
# root-cause: plateau 를 done 만으로 재면 게이트로 빠지는 항목이 진행으로 안 잡혀
#   루프가 실제로 일을 하고 있는데도 조기 정지한다(2026-07-30 2차 실행 wf_2ed0fe31-901 실측 —
#   P0-3·P0-4 를 적용·커밋했는데 done 순증 0 이라 plateau 로 멈췄다).
#   predicate 는 여전히 done 기준이다 — gated 는 사람 판정 전까지 완료가 아니다.
RESOLVED=$((DONE + GATED))
echo "SUMMARY total=$TOTAL done=$DONE gated=$GATED resolved=$RESOLVED pending=$PENDING regression=$REGRESSION manual=$MANUAL no_verify_cmd=$NOCMD"
[ -n "$REG_IDS" ]   && echo "REGRESSION_IDS:$REG_IDS"
[ -n "$NOCMD_IDS" ] && echo "NO_VERIFY_CMD_IDS:$NOCMD_IDS"
[ -n "$GATED_IDS" ] && echo "GATED_IDS:$GATED_IDS"

# 회귀는 최우선 — pending 이 남아 있어도 즉시 STOP 신호
if [ "$REGRESSION" -gt 0 ]; then
  echo "[verify-all] REGRESSION $REGRESSION 건 — 루프 즉시 STOP" >&2
  exit 2
fi

if [ "$REGRESSION_ONLY" -eq 1 ]; then
  exit 0
fi

# predicate = 자동 대상 전부 done. gated(사람 판정 대기)는 완료로 치지 않는다.
if [ "$PENDING" -eq 0 ] && [ "$FAILED" -eq 0 ] && [ "$GATED" -eq 0 ]; then
  echo "[verify-all] PREDICATE MET — 자동 대상 $TOTAL 건 전부 done + verify PASS"
  exit 0
fi

if [ "$PENDING" -eq 0 ] && [ "$GATED" -gt 0 ]; then
  echo "[verify-all] 미충족 — pending 0 이나 사람 판정 대기 $GATED 건(G2/G3):$GATED_IDS" >&2
else
  echo "[verify-all] 미충족 — pending=$PENDING gated=$GATED${FAIL_IDS:+ (}${FAIL_IDS}${FAIL_IDS:+ )}" >&2
fi
exit 1
