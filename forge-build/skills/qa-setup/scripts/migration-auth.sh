#!/usr/bin/env bash
# AD-92 P1-A R2 — 병렬 인증 하네스
# 실행: migration-auth.sh [LEGACY_URL] [ADMIN_URL]
# 출력: /tmp/qa-migration-auth.json { legacyCookie, newCookie }
set -euo pipefail

# BUG-1 fix: legacy는 WSL IP 필수 (localhost는 CI base_url 불일치로 세션 무효)
# WSL_IP 자동 감지 → 환경변수 LEGACY_URL로 오버라이드 가능
_WSL_IP=$(ip -4 addr show eth0 2>/dev/null | grep -oP '(?<=inet )\d+\.\d+\.\d+\.\d+' | head -1 || echo "localhost")
LEGACY_URL="${LEGACY_URL:-http://${_WSL_IP}:8081}"
ADMIN_URL="${ADMIN_URL:-http://localhost:3001}"
CREDS_ENV="${TEST_CREDENTIALS:-}"
LEGACY_COOKIE_JAR="/tmp/qa-legacy-cookies-$$.txt"
ADMIN_COOKIE_JAR="/tmp/qa-admin-cookies-$$.txt"
AUTH_OUT="/tmp/qa-migration-auth.json"

log()  { echo "[migration-auth] $*"; }
fail() { echo "[migration-auth] ERROR: $*" >&2; rm -f "${LEGACY_COOKIE_JAR}" "${ADMIN_COOKIE_JAR}"; exit 1; }

# 자격증명 파싱
parse_creds() {
  if [ -n "${CREDS_ENV}" ]; then
    LEGACY_USER=$(echo "${CREDS_ENV}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('mem_userid',''))" 2>/dev/null || echo "")
    LEGACY_PASS=$(echo "${CREDS_ENV}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('mem_password',''))" 2>/dev/null || echo "")
    ADMIN_USER="${LEGACY_USER}"
    ADMIN_PASS="${LEGACY_PASS}"
  fi

  # env 변수 직접 지원
  LEGACY_USER="${LEGACY_USER:-${QA_LEGACY_USER:-}}"
  LEGACY_PASS="${LEGACY_PASS:-${QA_LEGACY_PASS:-}}"
  ADMIN_USER="${ADMIN_USER:-${QA_ADMIN_USER:-${LEGACY_USER}}}"
  ADMIN_PASS="${ADMIN_PASS:-${QA_ADMIN_PASS:-${LEGACY_PASS}}}"

  if [ -z "${LEGACY_USER}" ] || [ -z "${LEGACY_PASS}" ]; then
    fail "자격증명 없음. 환경변수 QA_LEGACY_USER / QA_LEGACY_PASS 또는 TEST_CREDENTIALS JSON 설정 필요"
  fi
}

# R2-1: legacy 인증 — form POST → ci_session 캡처
auth_legacy() {
  log "legacy 로그인 시도: ${LEGACY_URL}/login"

  local resp_code
  resp_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -c "${LEGACY_COOKIE_JAR}" \
    -b "${LEGACY_COOKIE_JAR}" \
    -X POST "${LEGACY_URL}/login" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "mem_userid=${LEGACY_USER}" \
    --data-urlencode "mem_password=${LEGACY_PASS}" \
    -L \
    2>/dev/null || echo "000")

  if [ "${resp_code}" = "000" ]; then
    fail "legacy 서버 연결 실패"
  fi

  # ci_session 쿠키 추출 (awk 컬럼 매칭 — H5 보너스 M1)
  local ci_session_val
  ci_session_val=$(awk -F'\t' 'tolower($6)=="ci_session" {print $7}' \
    "${LEGACY_COOKIE_JAR}" 2>/dev/null | head -1 || echo "")

  if [ -z "${ci_session_val}" ]; then
    fail "legacy ci_session 쿠키 획득 실패 (code=${resp_code}). 자격증명 또는 admin 권한 확인 필요"
  fi

  LEGACY_COOKIE="ci_session=${ci_session_val}"
  log "legacy ci_session 획득 OK"
}

# R2-2: admin 인증 — JSON POST → admin_token 쿠키 캡처 (H5: admin_token | access_token 모두 지원)
auth_admin() {
  log "admin 로그인 시도: ${ADMIN_URL}/api/v1/auth/login"

  # ADMIN_ORIGIN: WSL IP or localhost (환경변수 우선)
  local admin_origin="${ADMIN_ORIGIN:-http://localhost:3001}"

  local resp_code
  resp_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -c "${ADMIN_COOKIE_JAR}" \
    -b "${ADMIN_COOKIE_JAR}" \
    -X POST "${ADMIN_URL}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -H "Origin: ${admin_origin}" \
    -H "Referer: ${admin_origin}/login" \
    -d "{\"mem_userid\":\"${ADMIN_USER}\",\"mem_password\":\"${ADMIN_PASS}\"}" \
    2>/dev/null || echo "000")

  if [ "${resp_code}" = "000" ]; then
    fail "admin 서버 연결 실패"
  fi

  # admin_token 또는 access_token 쿠키 추출 (H5)
  local token_val
  token_val=$(awk -F'\t' 'tolower($6)=="admin_token" || tolower($6)=="access_token" {print $7}' \
    "${ADMIN_COOKIE_JAR}" 2>/dev/null | head -1 || echo "")
  local token_name
  token_name=$(awk -F'\t' 'tolower($6)=="admin_token" || tolower($6)=="access_token" {print $6}' \
    "${ADMIN_COOKIE_JAR}" 2>/dev/null | head -1 || echo "admin_token")

  if [ -z "${token_val}" ]; then
    fail "admin 쿠키 획득 실패 (code=${resp_code}). NestJS 로그인 실패."
  fi

  NEW_COOKIE="${token_name}=${token_val}"
  log "admin ${token_name} 획득 OK"
}

# 결과 저장 — MigrationAuthContext (H3: cookieJar 제거 / H4: env 인젝션 + chmod 600)
write_auth_context() {
  LEGACY_COOKIE_VAL="${LEGACY_COOKIE}" \
  NEW_COOKIE_VAL="${NEW_COOKIE}" \
  LEGACY_URL_VAL="${LEGACY_URL}" \
  ADMIN_URL_VAL="${ADMIN_URL}" \
  AUTH_OUT_VAL="${AUTH_OUT}" \
  python3 - <<'PYEOF'
import os, json
data = {
    "legacyCookie": os.environ["LEGACY_COOKIE_VAL"],
    "newCookie":    os.environ["NEW_COOKIE_VAL"],
    "legacyUrl":    os.environ["LEGACY_URL_VAL"],
    "adminUrl":     os.environ["ADMIN_URL_VAL"],
}
out = os.environ["AUTH_OUT_VAL"]
with open(out, "w") as f:
    json.dump(data, f, indent=2)
os.chmod(out, 0o600)
print(json.dumps(data, indent=2, ensure_ascii=False))
PYEOF
  log "인증 컨텍스트 저장: ${AUTH_OUT} (mode 600)"
}

cleanup() {
  rm -f "${LEGACY_COOKIE_JAR}" "${ADMIN_COOKIE_JAR}" 2>/dev/null || true
}
trap cleanup EXIT

parse_creds
auth_legacy
auth_admin
write_auth_context

log "병렬 인증 완료 — legacy + admin 양쪽 세션 확보"
echo "AUTH_CONTEXT=${AUTH_OUT}"
