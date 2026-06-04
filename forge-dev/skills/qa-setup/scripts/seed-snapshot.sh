#!/usr/bin/env bash
# AD-92 P1-C R6 — seed-snapshot: DB 상태 캡처/복원/검증
# Usage:
#   seed-snapshot.sh capture <name> <db> <table1> [table2...]
#   seed-snapshot.sh restore <name> [db]
#   seed-snapshot.sh verify  <name> [db]
set -euo pipefail

SNAP_DIR="${QA_SNAP_DIR:-/tmp/qa-seeds}"
mkdir -p "${SNAP_DIR}"

DB_HOST="${QA_DB_HOST:-127.0.0.1}"
DB_PORT="${QA_DB_PORT:-13306}"
DB_USER="${QA_DB_USER:-boardGames}"
DB_PASS="${QA_DB_PASS:-boardGames2026!@#}"

log()  { echo "[seed-snapshot] $*"; }
fail() { echo "[seed-snapshot] ERROR: $*" >&2; exit 1; }

mysql_cmd() {
  mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASS}" \
    --silent --skip-column-names "$@" 2>/dev/null
}

mysqldump_cmd() {
  mysqldump -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASS}" \
    --no-create-info --skip-extended-insert --compact \
    "$@" 2>/dev/null
}

cmd="${1:-}"
name="${2:-}"
db="${3:-board_game}"

[ -z "${cmd}" ] && fail "Usage: seed-snapshot.sh <capture|restore|verify|list|clean> <name> [db] [tables...]"
[[ "${cmd}" != "list" && -z "${name}" ]] && fail "name 필수"

SQL_FILE="${SNAP_DIR}/qa-seed-${name}.sql"
SHA_FILE="${SNAP_DIR}/qa-seed-${name}.sha256"

case "${cmd}" in

  capture)
    shift 3 || true
    tables=("$@")
    [ ${#tables[@]} -eq 0 ] && fail "capture: 테이블 1개 이상 필요"

    log "캡처: db=${db} tables=${tables[*]} → ${SQL_FILE}"
    mysqldump_cmd "${db}" "${tables[@]}" > "${SQL_FILE}"
    sha256sum "${SQL_FILE}" | awk '{print $1}' > "${SHA_FILE}"
    log "캡처 완료 ($(wc -l < "${SQL_FILE}") lines, sha256=$(cat "${SHA_FILE}" | head -c 16)...)"
    ;;

  restore)
    [ -f "${SQL_FILE}" ] || fail "스냅샷 없음: ${SQL_FILE}"
    log "복원: ${SQL_FILE} → db=${db}"
    mysql_cmd "${db}" < "${SQL_FILE}"
    log "복원 완료"
    ;;

  verify)
    [ -f "${SQL_FILE}" ] || fail "스냅샷 없음: ${SQL_FILE}"
    [ -f "${SHA_FILE}" ] || fail "SHA 없음: ${SHA_FILE}"
    saved=$(cat "${SHA_FILE}")
    current=$(sha256sum "${SQL_FILE}" | awk '{print $1}')
    if [ "${saved}" = "${current}" ]; then
      log "검증 OK (sha256 일치)"
    else
      fail "검증 FAIL — 파일 변조 의심: saved=${saved:0:16}... current=${current:0:16}..."
    fi
    ;;

  list)
    log "스냅샷 목록 (${SNAP_DIR}):"
    ls "${SNAP_DIR}"/qa-seed-*.sql 2>/dev/null | while read -r f; do
      n=$(basename "${f}" .sql | sed 's/qa-seed-//')
      echo "  ${n} ($(wc -l < "${f}") lines)"
    done || echo "  (없음)"
    ;;

  clean)
    rm -f "${SNAP_DIR}"/qa-seed-"${name}".{sql,sha256} 2>/dev/null || true
    log "삭제: ${name}"
    ;;

  *)
    fail "Unknown command: ${cmd}. Use: capture|restore|verify|list|clean"
    ;;
esac
