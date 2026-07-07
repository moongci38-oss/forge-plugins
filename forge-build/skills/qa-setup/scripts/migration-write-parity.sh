#!/usr/bin/env bash
# AD-92 P1-C R6 — write parity 하네스
# Usage: migration-write-parity.sh <write-cases.json> [case_id_filter]
# 직렬화: flock /tmp/migration-write.lock
# 출력: /tmp/qa-write-parity-{case_id}.json
set -euo pipefail

CASES_FILE="${1:-}"
CASE_FILTER="${2:-}"
AUTH_FILE="/tmp/qa-migration-auth.json"
LOCK_FILE="/tmp/migration-write.lock"
SEED_SCRIPT="$(dirname "$0")/seed-snapshot.sh"
SNAP_DIR="${QA_SNAP_DIR:-/tmp/qa-seeds}"

log()  { echo "[write-parity] $*"; }
fail() { echo "[write-parity] ERROR: $*" >&2; exit 1; }

[ -z "${CASES_FILE}" ] && fail "Usage: migration-write-parity.sh <cases.json> [case_id]"
[ -f "${CASES_FILE}" ] || fail "cases 파일 없음: ${CASES_FILE}"
[ -f "${AUTH_FILE}" ] || fail "auth 컨텍스트 없음: ${AUTH_FILE}. migration-auth.sh 먼저 실행."

# --- auth ---
LEGACY_COOKIE=$(python3 -c "import json; d=json.load(open('${AUTH_FILE}')); print(d['legacyCookie'])")
NEW_COOKIE=$(python3 -c "import json; d=json.load(open('${AUTH_FILE}')); print(d['newCookie'])")
LEGACY_BASE=$(python3 -c "import json; d=json.load(open('${AUTH_FILE}')); print(d['legacyUrl'])")
ADMIN_BASE=$(python3 -c "import json; d=json.load(open('${AUTH_FILE}')); print(d['adminUrl'])")

# --- flock 직렬화 진입 ---
exec 200>"${LOCK_FILE}"
flock -w 30 200 || fail "lock 획득 실패 (다른 write-parity 실행 중?)"
log "Lock 획득 (${LOCK_FILE})"

# --- cases 파싱 ---
DOMAIN=$(python3 -c "import json; print(json.load(open('${CASES_FILE}'))['domain'])")
TARGET_TABLES=$(python3 -c "
import json
d = json.load(open('${CASES_FILE}'))
print(' '.join(d['targetTables']))
")
DB=$(python3 -c "import json; d=json.load(open('${CASES_FILE}')); print(d.get('db','board_game'))")

log "도메인: ${DOMAIN} | 테이블: ${TARGET_TABLES} | DB: ${DB}"

# --- 케이스 반복 ---
python3 -c "
import json, sys
cases = json.load(open('${CASES_FILE}'))['cases']
for c in cases:
    cid = c['id']
    filt = '${CASE_FILTER}'
    if filt and cid != filt:
        continue
    print(json.dumps(c))
" | while IFS= read -r case_json; do

  CASE_ID=$(echo "${case_json}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  SNAP_NAME="before-${CASE_ID}"
  OUT_FILE="/tmp/qa-write-parity-${CASE_ID}.json"

  log "======= 케이스: ${CASE_ID} ======="

  # trap: 어떤 경우라도 DB 원복
  restore_on_exit() {
    log "EXIT trap → DB 원복: ${SNAP_NAME}"
    bash "${SEED_SCRIPT}" restore "${SNAP_NAME}" "${DB}" 2>/dev/null || true
  }
  trap restore_on_exit EXIT

  # 1. Before snapshot
  log "Step 1: DB 스냅샷 캡처 (${SNAP_NAME})"
  # shellcheck disable=SC2086
  bash "${SEED_SCRIPT}" capture "${SNAP_NAME}" "${DB}" ${TARGET_TABLES}

  # 2. Legacy write
  log "Step 2: Legacy write"
  LEGACY_URL=$(echo "${case_json}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['legacyForm']['url'])")
  LEGACY_METHOD=$(echo "${case_json}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['legacyForm']['method'])")
  LEGACY_CT=$(echo "${case_json}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['legacyForm']['contentType'])")
  LEGACY_PAYLOAD=$(echo "${case_json}" | python3 -c "
import sys, json, urllib.parse
d = json.load(sys.stdin)
p = d['legacyForm']['payload']
ct = d['legacyForm']['contentType']
if 'form-urlencoded' in ct:
    print(urllib.parse.urlencode(p))
else:
    print(json.dumps(p))
")

  LEGACY_WRITE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X "${LEGACY_METHOD}" "${LEGACY_BASE}${LEGACY_URL}" \
    -H "Cookie: ${LEGACY_COOKIE}" \
    -H "Content-Type: ${LEGACY_CT}" \
    --data "${LEGACY_PAYLOAD}" \
    -L 2>/dev/null || echo "000")
  log "  legacy write HTTP=${LEGACY_WRITE_CODE}"

  if ! echo "${LEGACY_WRITE_CODE}" | grep -qE "^[23]"; then
    log "WARN: legacy write HTTP ${LEGACY_WRITE_CODE} — state_A 캡처 스킵"
    STATE_A="null"
  else
    # 3. Legacy state_A
    LIST_LEGACY=$(echo "${case_json}" | python3 -c "import sys,json; print(json.load(sys.stdin)['listLegacy'])")
    STATE_A=$(curl -s "${LEGACY_BASE}${LIST_LEGACY}" \
      -H "Cookie: ${LEGACY_COOKIE}" 2>/dev/null || echo "null")
    log "  state_A captured (${#STATE_A} chars)"
  fi

  # 4. DB 원복
  log "Step 4: DB 원복 (state_A 캡처 후)"
  bash "${SEED_SCRIPT}" restore "${SNAP_NAME}" "${DB}"

  # 5. Admin write
  log "Step 5: Admin write"
  ADMIN_URL=$(echo "${case_json}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['adminApi']['url'])")
  ADMIN_METHOD=$(echo "${case_json}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['adminApi']['method'])")
  ADMIN_CT=$(echo "${case_json}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['adminApi']['contentType'])")
  ADMIN_PAYLOAD=$(echo "${case_json}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(json.dumps(d['adminApi']['payload']))
")

  # ADMIN_ORIGIN: WSL IP 자동감지 (ORIGIN_DENY 방지)
  _WSL_IP=$(ip -4 addr show eth0 2>/dev/null | grep -oP '(?<=inet )\d+\.\d+\.\d+\.\d+' | head -1 || echo "localhost")
  ADMIN_ORIGIN_HDR="${ADMIN_ORIGIN:-http://${_WSL_IP}:3000}"

  ADMIN_WRITE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X "${ADMIN_METHOD}" "${ADMIN_BASE}${ADMIN_URL}" \
    -H "Cookie: ${NEW_COOKIE}" \
    -H "Content-Type: ${ADMIN_CT}" \
    -H "Origin: ${ADMIN_ORIGIN_HDR}" \
    -H "Referer: ${ADMIN_ORIGIN_HDR}" \
    -d "${ADMIN_PAYLOAD}" 2>/dev/null || echo "000")
  log "  admin write HTTP=${ADMIN_WRITE_CODE}"

  # 6. Admin state_B
  LIST_ADMIN=$(echo "${case_json}" | python3 -c "import sys,json; print(json.load(sys.stdin)['listAdmin'])")
  STATE_B=$(curl -s "${ADMIN_BASE}${LIST_ADMIN}" \
    -H "Cookie: ${NEW_COOKIE}" 2>/dev/null || echo "null")
  log "  state_B captured (${#STATE_B} chars)"

  # 7. Compare
  log "Step 7: 비교 (compareFields)"
  COMPARE_RESULT=$(python3 - <<PYEOF
import json, sys

state_a_raw = '''${STATE_A}'''
state_b_raw = '''${STATE_B}'''
case_raw = '''${case_json}'''

try:
    state_a = json.loads(state_a_raw) if state_a_raw != 'null' else None
    state_b = json.loads(state_b_raw) if state_b_raw != 'null' else None
    case = json.loads(case_raw)
    compare_fields = case.get('compareFields', [])
except Exception as e:
    print(json.dumps({"verdict":"ERROR","reason":str(e)}))
    sys.exit(0)

diffs = []
verdict = "PASS"
reason = ""

if state_a is None and state_b is None:
    verdict = "WARN"
    reason = "Both states null"
elif state_a is None:
    verdict = "WARN"
    reason = "Legacy write failed — state_A null"
elif state_b is None:
    verdict = "FAIL"
    reason = "Admin state_B null"
else:
    # Extract items from both
    def get_items(d):
        if d is None: return []
        if isinstance(d, list): return d
        data = d.get('data', d)
        if isinstance(data, list): return data
        for k in ('list','items','rows'):
            if k in data and isinstance(data[k], list):
                return data[k]
        return []

    items_a = get_items(state_a)
    items_b = get_items(state_b)

    if len(items_a) != len(items_b):
        diffs.append(f"row_count: legacy={len(items_a)} admin={len(items_b)}")

    for f in compare_fields:
        v_a = items_a[0].get(f) if items_a else "MISSING"
        v_b = items_b[0].get(f) if items_b else "MISSING"
        if str(v_a) != str(v_b):
            diffs.append(f"{f}: legacy={v_a!r} admin={v_b!r}")

    if diffs:
        verdict = "FAIL"
        reason = "; ".join(diffs)
    else:
        reason = f"Fields match: {compare_fields}"

result = {
    "case_id": case.get('id'),
    "verdict": verdict,
    "reason": reason,
    "diffs": diffs,
    "legacy_write_code": "${LEGACY_WRITE_CODE}",
    "admin_write_code": "${ADMIN_WRITE_CODE}",
    "state_a_rows": len(get_items(state_a)) if state_a else None,
    "state_b_rows": len(get_items(state_b)) if state_b else None,
}
print(json.dumps(result, indent=2, ensure_ascii=False))
PYEOF
)
  echo "${COMPARE_RESULT}" > "${OUT_FILE}"
  log "결과 저장: ${OUT_FILE}"
  echo "${COMPARE_RESULT}"

  # 8. 최종 원복
  log "Step 8: 최종 DB 원복"
  bash "${SEED_SCRIPT}" restore "${SNAP_NAME}" "${DB}"
  trap - EXIT  # trap 해제 (정상 완료)
  log "  원복 완료. trap 해제."

done

log "write parity 완료"
flock -u 200
