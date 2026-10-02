#!/usr/bin/env bash
# install-plugins.sh — Forge 플러그인 5종 원클릭 설치 (비개발자용, 멱등).
# 실행: Claude Code 세션에서 "이 스크립트 실행해줘" 또는 터미널에서 `bash install-plugins.sh`
set -uo pipefail

MARKET="moongci38-oss/forge-plugins"
PLUGINS=(forge-core forge-knowledge forge-build forge-design)

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()  { printf '  \033[1;32m✓\033[0m %s\n' "$*"; }
warn(){ printf '  \033[1;33m!\033[0m %s\n' "$*"; }

# 0. claude CLI 확인
if ! command -v claude >/dev/null 2>&1; then
  echo "❌ Claude Code(claude)가 설치돼 있지 않습니다. https://claude.ai/code 에서 먼저 설치하세요."
  exit 1
fi
ok "Claude Code 확인: $(claude --version 2>/dev/null | head -1)"

# 0-1. Forge 본체(~/forge) — 플러그인 커맨드·스크립트가 이 폴더를 부른다(forge #1544).
#      비공개 저장소 — gh 로그인(https 자격 증명)으로 SSH 키 없이 받는다. 실패해도 설치는 계속한다.
FORGE_DIR="${FORGE_ROOT:-$HOME/forge}"
say "Forge 본체 확인 ($FORGE_DIR)"
if [ -d "$FORGE_DIR" ]; then
  ok "이미 있음: $FORGE_DIR (최신으로 받으려면: cd \"$FORGE_DIR\" && git pull)"
else
  if ! command -v gh >/dev/null 2>&1; then
    warn "gh(GitHub CLI) 가 없습니다 — https://cli.github.com 에서 설치 후 gh auth login 하세요"
  elif ! gh auth status >/dev/null 2>&1; then
    warn "권한이 없거나 로그인 안 됨 — gh auth login 후 다시 실행하세요 (forge 접근 권한은 관리자에게 요청)"
  else
    gh auth setup-git >/dev/null 2>&1 || true   # git 이 gh 로그인으로 https 인증하게
  fi
  # GIT_TERMINAL_PROMPT=0 — 로그인 안 됐을 때 아이디·비밀번호 입력창에서 멈추지 않게
  if GIT_TERMINAL_PROMPT=0 git clone https://github.com/moongci38-oss/forge.git "$FORGE_DIR"; then
    ok "받기 완료: $FORGE_DIR"
  else
    warn "Forge 본체 받기 실패 — 권한이 없거나 로그인 안 됨 — gh auth login 후 다시 실행하세요 (forge 접근 권한은 관리자에게 요청)"
  fi
fi

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
