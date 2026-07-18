#!/usr/bin/env bash
# install-plugins.sh — Forge 플러그인 5종 원클릭 설치 (비개발자용, 멱등).
# 실행: Claude Code 세션에서 "이 스크립트 실행해줘" 또는 터미널에서 `bash install-plugins.sh`
set -uo pipefail

MARKET="moongci38-oss/forge-plugins"
PLUGINS=(forge-core forge-knowledge forge-build forge-design forge-game)

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()  { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
warn(){ printf '  \033[1;33m!\033[0m %s\n' "$*"; }

# 0. claude CLI 확인
if ! command -v claude >/dev/null 2>&1; then
  echo "❌ Claude Code(claude)가 설치돼 있지 않습니다. https://claude.ai/code 에서 먼저 설치하세요."
  exit 1
fi
ok "Claude Code 확인: $(claude --version 2>/dev/null | head -1)"

# 1. 마켓플레이스 등록 (이미 있으면 통과)
say "마켓플레이스 등록"
if claude plugin marketplace add "$MARKET" 2>/dev/null; then
  ok "마켓플레이스 추가: $MARKET"
else
  warn "이미 등록돼 있거나 갱신 불필요 — 계속 진행"
fi

# 2. 플러그인 5종 설치 (멱등 — 이미 설치면 통과)
say "플러그인 설치 (5종)"
for p in "${PLUGINS[@]}"; do
  if claude plugin install "${p}@forge-plugins" 2>/dev/null; then
    ok "설치: $p"
  else
    warn "$p — 이미 설치됨 또는 최신 (계속)"
  fi
done

# 3. 활성화
say "플러그인 활성화"
for p in "${PLUGINS[@]}"; do
  claude plugin enable "$p" 2>/dev/null && ok "활성화: $p" || warn "$p enable 스킵(이미 활성/불필요)"
done

# 4. 완료 안내
cat <<'DONE'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 설치 완료!

마지막 한 단계 — Claude Code를 완전히 껐다가 다시 켜세요.
(재시작해야 새 플러그인이 로드됩니다.)

재시작 후 확인: 세션에서  /forge  라고 입력했을 때
명령이 뜨면 정상 설치된 것입니다.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DONE
