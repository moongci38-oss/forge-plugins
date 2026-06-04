#!/usr/bin/env bash
# AD-92 P1-A R1 — 듀얼 서버 부트스트랩
# 실행: migration-bootstrap.sh <PROJECT_ROOT> [LEGACY_PATH] [LEGACY_PORT]
# 출력: 양쪽 서버 UP 확인 후 exit 0, 실패 시 exit 1
set -euo pipefail

PROJECT_ROOT="${1:-.}"
LEGACY_PATH="${LEGACY_PATH:-${2:-${PROJECT_ROOT}/admin-legacy}}"
LEGACY_PORT="${LEGACY_PORT:-${3:-8081}}"
ADMIN_BE_PORT="${ADMIN_BE_PORT:-3001}"
ADMIN_FE_PORT="${ADMIN_FE_PORT:-3000}"
LEGACY_DB_PORT="${LEGACY_DB_PORT:-13306}"

log() { echo "[migration-bootstrap] $*"; }
fail() { echo "[migration-bootstrap] ERROR: $*" >&2; exit 1; }

# C2 — PHP 세션 경로 선행 생성
mkdir -p /tmp/ci_sessions
log "세션 경로 /tmp/ci_sessions 확인"

# C3 — SSH 터널 13306 헬스체크
if ! nc -z 127.0.0.1 "${LEGACY_DB_PORT}" 2>/dev/null; then
  fail "SSH 터널 ${LEGACY_DB_PORT} 미열림. autossh 터널 선행 필요.
  설정: \$QA_SSH_TUNNEL_CMD 또는 admin/CLAUDE.md 'SSH 터널' 섹션 참조"
fi
log "SSH 터널 ${LEGACY_DB_PORT} OK"

# R1-1: legacy PHP 서버 기동
start_legacy() {
  local abs_legacy_path
  abs_legacy_path=$(realpath "${LEGACY_PATH}" 2>/dev/null) || fail "LEGACY_PATH 없음: ${LEGACY_PATH}"

  # 이미 기동 중이면 재사용
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${LEGACY_PORT}/login" 2>/dev/null | grep -qE "^[23]"; then
    log "legacy 서버 이미 UP :${LEGACY_PORT} — 재사용"
    return 0
  fi

  log "legacy PHP 서버 기동 (${abs_legacy_path} → :${LEGACY_PORT})"
  php -S "0.0.0.0:${LEGACY_PORT}" -t "${abs_legacy_path}" \
    > "/tmp/qa-legacy.log" 2>&1 &
  echo $! > /tmp/qa-legacy.pid

  # 최대 30초 대기
  for i in $(seq 1 15); do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${LEGACY_PORT}/login" 2>/dev/null | grep -qE "^[23]"; then
      log "legacy UP :${LEGACY_PORT}"
      return 0
    fi
    sleep 2
  done
  fail "legacy 서버 기동 실패 — /tmp/qa-legacy.log 확인"
}

# R1-2: admin 서버 기동 (qa-config.json servers[] 재사용)
start_admin() {
  local qa_config="${PROJECT_ROOT}/docs/qa/qa-config.json"
  if [ ! -f "${qa_config}" ]; then
    fail "qa-config.json 없음. qa-setup 먼저 실행 필요."
  fi

  jq -c '.servers[]' "${qa_config}" | while IFS= read -r server; do
    local role cmd cwd port health
    role=$(echo "${server}" | jq -r '.role')
    cmd=$(echo "${server}" | jq -r '.cmd')
    cwd=$(echo "${server}" | jq -r '.cwd')
    port=$(echo "${server}" | jq -r '.port')
    health=$(echo "${server}" | jq -r '.health // "/api/health"')

    local full_cwd="${PROJECT_ROOT}/${cwd}"
    [ "${cwd}" = "." ] && full_cwd="${PROJECT_ROOT}"

    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}${health}" 2>/dev/null | grep -qE "^[23]"; then
      log "admin ${role} 이미 UP :${port} — 재사용"
      continue
    fi

    log "admin ${role} 기동 (${full_cwd} → :${port})"
    ( cd "${full_cwd}" && nohup ${cmd} > "/tmp/qa-admin-${role}.log" 2>&1 & echo $! > "/tmp/qa-admin-${role}.pid" )

    for i in $(seq 1 30); do
      if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}${health}" 2>/dev/null | grep -qE "^[23]"; then
        log "admin ${role} UP :${port}"
        break
      fi
      if [ "$i" -eq 30 ]; then
        fail "admin ${role} 기동 실패 — /tmp/qa-admin-${role}.log 확인"
      fi
      sleep 2
    done
  done
}

# 헬스 최종 확인
health_check() {
  local ok=0

  # legacy health
  local legacy_code
  legacy_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${LEGACY_PORT}/login" 2>/dev/null || echo "000")
  if echo "${legacy_code}" | grep -qE "^[23]"; then
    log "HEALTH legacy :${LEGACY_PORT} OK (${legacy_code})"
    ((ok++)) || true
  else
    fail "legacy 헬스 FAIL — code=${legacy_code}"
  fi

  # admin backend health
  local be_code
  be_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${ADMIN_BE_PORT}/api/v1/health" 2>/dev/null || echo "000")
  if echo "${be_code}" | grep -qE "^[23]"; then
    log "HEALTH admin-backend :${ADMIN_BE_PORT} OK (${be_code})"
    ((ok++)) || true
  else
    log "WARN: admin-backend 헬스 응답 ${be_code} (서버 미기동 상태일 수 있음)"
  fi

  [ "${ok}" -ge 1 ] || fail "헬스체크 전부 실패"
}

start_legacy
start_admin
health_check

log "듀얼 서버 부트스트랩 완료"
echo "LEGACY_URL=http://localhost:${LEGACY_PORT}"
echo "ADMIN_BE_URL=http://localhost:${ADMIN_BE_PORT}"
