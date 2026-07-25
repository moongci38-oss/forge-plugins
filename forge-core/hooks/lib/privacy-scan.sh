#!/usr/bin/env bash
# privacy-scan.sh — FR-006 L1: Loop B 기능 소스 트리에 네트워크 호출 코드가 없음을 검사.
#
# ⚠️ 이 스캔이 증명하는 것과 못 하는 것 (스펙 §1.1 — 과장 금지)
#   증명함  : **결정론적 스크립트 경로**(store 라이브러리, Stop 훅, SessionStart 훅)에
#             전송 목적 코드가 없다.
#   증명 못함: `/forge-learn-sweep` **실행 세션 전체**의 무네트워크. sweep 은 LLM 주도
#             대화형 흐름이라, 그 세션에 켜져 있는 ambient 도구(WebFetch·WebSearch·MCP)를
#             이 소스 grep 으로 배제할 수 없다. 그건 커맨드의 allowed-tools 선언(L3)이
#             완화할 뿐 증명하지 않는다.
#
# 사용: bash privacy-scan.sh            (기본: 이 스크립트 기준 상위 hooks/ + commands/)
#       bash privacy-scan.sh <dir>...
# exit: 0 = 매치 0건 / 1 = 네트워크 호출 후보 발견

set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_TARGETS=(
  "$SELF_DIR/plugin_learn.py"
  "$SELF_DIR/../forge-plugin-learn-inject.sh"
  "$SELF_DIR/../forge-plugin-learn-reminder.sh"
  "$SELF_DIR/../../commands/forge-learn-sweep.md"
)

if [ "$#" -gt 0 ]; then
  TARGETS=("$@")
else
  TARGETS=("${DEFAULT_TARGETS[@]}")
fi

# FR-006 L1 확장 정규식 — 단일 'curl' 검사로는 못 잡는 경로까지 포함
PATTERN='curl|wget|\bnc\b|\bncat\b|telnet|fetch\(|axios|XMLHttpRequest|WebSocket|undici'
PATTERN="$PATTERN"'|node:https?|require\(['"'"'"]https?['"'"'"]\)|from ['"'"'"]node:?https?['"'"'"]'
PATTERN="$PATTERN"'|http\.request|https\.request|net\.(connect|createConnection)|dgram'
PATTERN="$PATTERN"'|requests\.(get|post|put|patch|delete)|urllib|httpx|aiohttp'
PATTERN="$PATTERN"'|socket\.(socket|create_connection)|/dev/tcp/|/dev/udp/'
PATTERN="$PATTERN"'|\bssh \|\bscp \|\brsync \|git (push|clone|fetch)'

FOUND=0
echo "=== FR-006 L1 network-call scan ==="
for t in "${TARGETS[@]}"; do
  [ -e "$t" ] || { echo "  SKIP (없음): $t"; continue; }
  # 이 스크립트 자신의 패턴 정의는 제외 대상이 아니다(대상 목록에 자신을 넣지 않음).
  if hits=$(grep -nE "$PATTERN" "$t" 2>/dev/null); then
    echo "  ❌ MATCH: $t"
    echo "$hits" | sed 's/^/      /'
    FOUND=1
  else
    echo "  ✅ clean: $(basename "$t")"
  fi
done

echo
echo "=== FR-006 L2 dependency check ==="
# 이 기능이 추가하는 런타임 의존성은 0개여야 한다 — 텔레메트리 SDK 가 전이 의존으로
# 들어올 경로를 애초에 만들지 않는다(표준 라이브러리만 사용).
if grep -nE '^\s*(import|from)\s+' "$SELF_DIR/plugin_learn.py" \
   | grep -vE '\b(hashlib|json|math|os|re|shutil|subprocess|sys|time|datetime|argparse|fcntl)\b' >/dev/null 2>&1; then
  echo "  ❌ 비표준 라이브러리 import 발견 — 신규 의존성 0 위반"
  grep -nE '^\s*(import|from)\s+' "$SELF_DIR/plugin_learn.py" \
    | grep -vE '\b(hashlib|json|math|os|re|shutil|subprocess|sys|time|datetime|argparse|fcntl)\b' | sed 's/^/      /'
  FOUND=1
else
  echo "  ✅ 표준 라이브러리만 사용 (신규 런타임 의존성 0)"
fi

echo
echo "=== FR-006 L3 tool whitelist check ==="
CMD="$SELF_DIR/../../commands/forge-learn-sweep.md"
if [ -f "$CMD" ]; then
  if grep -q '^allowed-tools:' "$CMD"; then
    AT_LINE=$(grep '^allowed-tools:' "$CMD")
    if echo "$AT_LINE" | grep -qiE 'webfetch|websearch|mcp__'; then
      echo "  ❌ allowed-tools 에 네트워크 도구가 선언됨"
      FOUND=1
    # 광범위 Bash 허용은 네트워크 도구를 빼도 무의미하다 — `Bash(python3:*)` 하나면
    # urllib·소켓으로 뭐든 보낼 수 있다(cr-final HIGH). 인터프리터·셸 와일드카드 차단.
    elif echo "$AT_LINE" | grep -qE 'Bash\((python3?|node|ruby|perl|sh|bash|env|curl|[^)"]*)\s*:\s*\*\)'; then
      echo "  ❌ allowed-tools 에 광범위 Bash 허용(임의 실행 가능) — 네트워크 미선언 주장이 무효"
      echo "$AT_LINE" | sed 's/^/      /'
      FOUND=1
    else
      echo "  ✅ allowed-tools 선언 존재, 네트워크 도구·광범위 Bash 미포함"
      echo "$AT_LINE" | sed 's/^/      /'
    fi
  else
    echo "  ❌ allowed-tools 선언 없음 (L3 미충족)"
    FOUND=1
  fi
else
  echo "  SKIP: 커맨드 파일 없음"
fi

echo
if [ "$FOUND" = "0" ]; then
  echo "RESULT: PASS — 결정론적 스크립트 경로에 네트워크 호출 없음"
  exit 0
fi
echo "RESULT: FAIL — 위 항목 확인 필요"
exit 1
