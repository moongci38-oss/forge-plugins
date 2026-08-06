#!/usr/bin/env bash
# harness-backlog-loop — 항목 단위 검증자 (executor 와 분리된 별도 프로그램)
#
# root-cause: 완료 판정을 적용 주체가 하면 self-grading 이 된다. 원 감사에서 문서의
#   "조치완료" 표기가 실물과 어긋난 사례(DOC_CLAIM_FALSE 5건 / MIS_APPLIED 1건)가 실적발됐다.
#   따라서 판정은 이 스크립트의 exit code 로만 한다.
#
# usage: verify-item.sh <item-id> [--backlog <path>]
#
# exit 0 : PASS
# exit 1 : FAIL            (verify_cmd 가 non-zero)
# exit 2 : MANUAL_VERIFY   (기계 판정 불가 — G2 게이트로 라우팅)
# exit 3 : NO_VERIFY_CMD   (verify_cmd 미작성 — 적용 착수 전에 먼저 작성해야 함)
# exit 4 : NOT_FOUND       (항목 없음)
# exit 5 : BAD_BACKLOG     (백로그 파싱 실패)

set -uo pipefail

FORGE_ROOT="${FORGE_ROOT:-$HOME/forge}"
FORGE_OUTPUTS="${FORGE_OUTPUTS:-$HOME/forge-outputs}"
DEFAULT_BACKLOG="$FORGE_OUTPUTS/11-platform/pipelines/backlog/2026-07-30-reviews-backlog.jsonl"

ID="${1:-}"
BACKLOG="$DEFAULT_BACKLOG"
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --backlog) BACKLOG="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ -z "$ID" ]; then
  echo "usage: verify-item.sh <item-id> [--backlog <path>]" >&2
  exit 4
fi
if [ ! -f "$BACKLOG" ]; then
  echo "[verify-item] BAD_BACKLOG: 파일 없음 — $BACKLOG" >&2
  exit 5
fi

# ── 항목 조회 ────────────────────────────────────────────────────────────────
# root-cause: NUL 구분은 쓸 수 없다 — bash 의 $(...) 가 null byte 를 제거해 전 필드가
#   한 덩어리로 뭉개지고, 그 결과 모든 항목이 MANUAL_VERIFY 로 오판정된다(2026-07-30 실측).
#   필드마다 base64 1줄로 내보내 개행·탭·따옴표를 모두 안전하게 통과시킨다.
FIELDS="$(python3 - "$BACKLOG" "$ID" <<'PY'
import json, sys, base64
path, want = sys.argv[1], sys.argv[2]
def b(s): return base64.b64encode(s.encode("utf-8")).decode("ascii")
try:
    for line in open(path, encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        if r.get("id") == want:
            for k, d in (("verify_cmd", ""), ("gate", "none"), ("tier", ""), ("status", "")):
                print(b(str(r.get(k, d))))
            sys.exit(0)
except Exception as e:
    print(f"PARSE_ERROR {type(e).__name__}: {e}", file=sys.stderr)
    sys.exit(5)
sys.exit(4)
PY
)"
RC=$?
[ "$RC" -eq 4 ] && { echo "[verify-item] NOT_FOUND: $ID" >&2; exit 4; }
[ "$RC" -ne 0 ] && { echo "[verify-item] BAD_BACKLOG (rc=$RC)" >&2; exit 5; }

mapfile -t _B64 <<< "$FIELDS"
[ "${#_B64[@]}" -ge 4 ] || { echo "[verify-item] BAD_BACKLOG: 필드 부족(${#_B64[@]})" >&2; exit 5; }
_dec() { printf '%s' "$1" | base64 -d; }
VCMD="$(_dec "${_B64[0]}")"
GATE="$(_dec "${_B64[1]}")"
TIER="$(_dec "${_B64[2]}")"
STATUS="$(_dec "${_B64[3]}")"

# ── 게이트 항목은 자동 판정 대상이 아니다 ────────────────────────────────────
if [ "$GATE" != "none" ]; then
  echo "[verify-item] MANUAL_VERIFY: $ID — gate=$GATE (자동 적용·판정 금지, HUMAN-GATES G3)"
  exit 2
fi

# ── verify_cmd 부재 = 아직 검증을 못 쓴 상태. 적용 착수 전에 먼저 써야 한다 ──
if [ -z "${VCMD// /}" ]; then
  echo "[verify-item] NO_VERIFY_CMD: $ID — 적용 전에 verify_cmd 를 먼저 작성·커밋할 것" >&2
  exit 3
fi

# 사람 판정 전용 마커
case "$VCMD" in
  MANUAL|manual|MANUAL:*)
    echo "[verify-item] MANUAL_VERIFY: $ID — $VCMD"
    exit 2 ;;
esac

# ── 실행 (forge SSoT 를 cwd 로) ───────────────────────────────────────────────
cd "$FORGE_ROOT" || { echo "[verify-item] FORGE_ROOT 접근 불가: $FORGE_ROOT" >&2; exit 5; }

OUT="$(bash -c "$VCMD" 2>&1)"
VRC=$?

if [ "$VRC" -eq 0 ]; then
  echo "[verify-item] PASS: $ID (tier=$TIER status=$STATUS)"
  [ -n "$OUT" ] && echo "  out: $(printf '%s' "$OUT" | head -c 300)"
  exit 0
else
  echo "[verify-item] FAIL: $ID (rc=$VRC, tier=$TIER)" >&2
  [ -n "$OUT" ] && echo "  out: $(printf '%s' "$OUT" | head -c 500)" >&2
  echo "  cmd: $VCMD" >&2
  exit 1
fi
