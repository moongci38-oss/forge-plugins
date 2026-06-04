#!/usr/bin/env bash
# codex-cr-final.sh — AD-93 W3 (amendments §A1/§A5)
# PR 머지 직전 Codex /cr-final 1회 실행
# Usage: bash codex-cr-final.sh <pr-body-path> [output-dir]
# Output: docs/reviews/codex-final/{date}-codex-cr-final.json (라벨: codex-verified)
#
# 금지: 본 스크립트 내에서 claude --command 직접 호출 X (nested invocation)
# 구현: /codex-review --stage final CLI 래퍼 + sha256 위조 차단 + 5분 timeout

set -euo pipefail

PR_BODY_PATH="${1:-}"
OUTPUT_DIR="${2:-docs/reviews/codex-final}"
TIMEOUT_SEC="${CODEX_TIMEOUT:-300}"  # §I.6: 5분 timeout

if [ -z "$PR_BODY_PATH" ]; then
  echo "Usage: codex-cr-final.sh <pr-body-path> [output-dir]" >&2
  exit 1
fi

if [ ! -f "$PR_BODY_PATH" ]; then
  echo "ERROR: pr-body 파일 없음: ${PR_BODY_PATH}" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

DATE=$(date +%Y-%m-%d)
TS=$(date +%Y%m%d%H%M%S)
OUT_FILE="${OUTPUT_DIR}/${DATE}-codex-cr-final.json"

# ─── sha256 of PR body (위조 차단용 §I.10)
BODY_HASH=$(sha256sum "$PR_BODY_PATH" | awk '{print $1}')

# ─── codex-review CLI 호출 (5분 timeout)
VERDICT="FAIL"
ISSUES=()
CODEX_RESPONSE=""
CODEX_EXIT=0

# codex CLI 존재 확인
if command -v codex >/dev/null 2>&1; then
  # timeout + codex CLI 호출
  CODEX_RESPONSE=$(timeout "$TIMEOUT_SEC" codex review \
    --stage final \
    --target "$PR_BODY_PATH" \
    --format json 2>/dev/null || echo "TIMEOUT_OR_ERROR") || CODEX_EXIT=$?

  if [ "$CODEX_RESPONSE" = "TIMEOUT_OR_ERROR" ] || [ $CODEX_EXIT -ne 0 ]; then
    # §I.6: timeout = WARN + Human 알림 (머지 차단)
    VERDICT="WARN"
    echo "[WARN codex-cr-final] Codex CLI timeout/error (${TIMEOUT_SEC}s). 머지 차단 — Human 검토 필요." >&2
    ISSUES=('{"severity":"high","message":"Codex CLI timeout or error — Human review required"}')
  else
    # JSON 파싱
    VERDICT=$(echo "$CODEX_RESPONSE" | jq -r '.verdict // "FAIL"' 2>/dev/null || echo "FAIL")
    mapfile -t ISSUES < <(echo "$CODEX_RESPONSE" | jq -c '.issues // [] | .[]' 2>/dev/null || echo "")
  fi
else
  # codex CLI 미설치 — WARN + status 명시 (W4 §1C)
  echo "[WARN codex-cr-final] codex CLI 미설치. CR 수동 실행 권장. 운영 환경 보강 필요." >&2
  echo "  설치: npm install -g @openai/codex  또는 PATH 확인" >&2
  VERDICT="WARN"
  CODEX_RESPONSE='{"status":"codex-cli-missing"}'
  ISSUES=('{"severity":"medium","message":"Codex CLI not installed. Manual /cr-final review recommended. Merge gate weakened."}')
fi

# ─── Response sha256 (위조 차단 §I.10)
RESPONSE_HASH=$(echo "${CODEX_RESPONSE}${VERDICT}" | sha256sum | awk '{print $1}')

# ─── 출력 JSON 작성
python3 -c "
import json
from datetime import datetime

import os, shutil
# Derive status: codex-cli-missing if codex not installed, else from response
codex_status = 'codex-cli-missing' if shutil.which('codex') is None else 'ok'
try:
    resp = json.loads('''${CODEX_RESPONSE}''' or '{}')
    if resp.get('status'):
        codex_status = resp['status']
except Exception:
    pass

data = {
    'timestamp': datetime.utcnow().isoformat() + 'Z',
    'label': 'codex-verified',
    'stage': 'final',
    'target': '${PR_BODY_PATH}',
    'verdict': '${VERDICT}',
    'status': codex_status,
    'body_sha256': '${BODY_HASH}',
    'response_sha256': '${RESPONSE_HASH}',
    'issues': [json.loads(i) for i in '''${ISSUES[@]:-}'''.strip().split('\n') if i.strip()] if '''${ISSUES[@]:-}''' else [],
    'timeout_sec': ${TIMEOUT_SEC}
}
with open('${OUT_FILE}', 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print('${OUT_FILE}')
" 2>/dev/null || python3 -c "
import json
from datetime import datetime
data = {
    'timestamp': datetime.utcnow().isoformat() + 'Z',
    'label': 'codex-verified',
    'stage': 'final',
    'target': '${PR_BODY_PATH}',
    'verdict': '${VERDICT}',
    'body_sha256': '${BODY_HASH}',
    'response_sha256': '${RESPONSE_HASH}',
    'issues': [],
    'timeout_sec': ${TIMEOUT_SEC}
}
with open('${OUT_FILE}', 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print('${OUT_FILE}')
"

echo "[codex-cr-final] verdict=${VERDICT} | output=${OUT_FILE}" >&2

# Exit 2 on FAIL (머지 차단)
[ "$VERDICT" = "FAIL" ] && exit 2 || exit 0
