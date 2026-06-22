#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
#  Forge 팀원 세팅 자동화 스크립트
#  실행: bash setup.sh
#  소요: 약 10~15분 (API 키 발급 시간 제외)
# ═══════════════════════════════════════════════════════

set -euo pipefail

# ── 출력 헬퍼 ──────────────────────────────────────────
GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' BLUE='\033[1;34m' GRAY='\033[0;90m' NC='\033[0m'
ok()    { echo -e "${GREEN}  ✔ ${NC}$1"; }
warn()  { echo -e "${YELLOW}  ⚠ ${NC}$1"; }
info()  { echo -e "${BLUE}  → ${NC}$1"; }
note()  { echo -e "${GRAY}    $1${NC}"; }
err()   { echo -e "${RED}  ✘ ${NC}$1"; }
banner(){ echo -e "\n${BLUE}━━━  $1  ━━━${NC}"; }

# ── 경로 상수 ──────────────────────────────────────────
HOME_DIR="${HOME}"
FORGE_ROOT="${HOME_DIR}/forge"
FORGE_OUTPUTS="${HOME_DIR}/forge-outputs"
CLAUDE_JSON="${HOME_DIR}/.claude.json"
# root-cause: 플러그인 사용자는 ~/forge 없음 — ~/.forge.env 폴백 (forge 있으면 우선)
if [ -d "${FORGE_ROOT}" ]; then ENV_FILE="${FORGE_ROOT}/.env"; else ENV_FILE="${HOME_DIR}/.forge.env"; fi
FORGE_SYNC="${FORGE_ROOT}/dev/scripts/forge-sync.mjs"
GEMINI_KEY_FILE="${HOME_DIR}/.gemini-api-key"

# ── 유틸 ──────────────────────────────────────────────
open_browser() {
  local url="$1"
  if command -v xdg-open &>/dev/null; then xdg-open "$url" 2>/dev/null &
  elif command -v open &>/dev/null; then open "$url" 2>/dev/null &
  else note "브라우저에서 직접 여세요: $url"; fi
}

install_npm_pkg() {
  local pkg="$1" bin="${2:-}"
  local check_bin="${bin:-$(echo "$pkg" | sed 's/@[^/]*\///' | sed 's/@.*//')}"
  if command -v "$check_bin" &>/dev/null; then
    ok "${check_bin} 이미 설치됨"
    return
  fi
  info "${pkg} 설치 중..."
  if npm install -g "$pkg" 2>&1; then
    ok "${check_bin} 설치 완료"
  else
    warn "${check_bin} 설치 실패 (수동: npm install -g ${pkg})"
  fi
}

# ══════════════════════════════════════════════════════
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🚀  Forge 팀원 세팅 자동화           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  이 스크립트가 자동으로 처리하는 것:"
echo "    • 필수 프로그램 설치 (Codex, GitNexus, hwpx 등)"
echo "    • ~/forge-outputs 폴더 구조 생성"
echo "    • AI 도구 연결 (MCP 서버 7종)"
echo "    • 플러그인 설치 및 활성화"
echo ""
echo "  사람이 직접 해야 하는 것 (스크립트 중간에 안내):"
echo "    • API 키 입력 (처음 한 번만)"
echo "    • 로그인 2회 (Codex, Notion — 브라우저 자동으로 열림)"
echo ""
read -rp "  계속하려면 Enter, 취소하려면 Ctrl+C: "

# ══════════════════════════════════════════════════════
banner "1단계: 기본 프로그램 확인"

# Node.js
if command -v node &>/dev/null; then
  NODE_MAJ=$(node --version | tr -d 'v' | cut -d. -f1)
  if [ "$NODE_MAJ" -ge 18 ]; then
    ok "Node.js $(node --version)"
  else
    err "Node.js 버전이 너무 낮습니다 ($(node --version) — v18 이상 필요)"
    echo ""
    echo "  해결 방법:"
    echo "  1. 터미널에 아래 명령어를 복붙하세요:"
    echo "     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    echo "  2. 터미널을 닫고 다시 열기"
    echo "  3. nvm install 22"
    echo "  4. 이 스크립트 다시 실행"
    exit 1
  fi
else
  err "Node.js가 없습니다"
  echo ""
  echo "  해결 방법:"
  echo "  1. 아래 명령어를 복붙하세요:"
  echo "     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
  echo "  2. 터미널을 닫고 다시 열기"
  echo "  3. nvm install 22"
  echo "  4. 이 스크립트 다시 실행"
  exit 1
fi

# Python
if command -v python3 &>/dev/null; then
  ok "Python $(python3 --version 2>&1 | awk '{print $2}')"
else
  err "Python3가 없습니다"
  echo "  해결: sudo apt install python3 python3-pip"
  exit 1
fi

# git
if command -v git &>/dev/null; then
  ok "git $(git --version | awk '{print $3}')"
else
  err "git이 없습니다"
  echo "  해결: sudo apt install git"
  exit 1
fi

# Claude Code CLI
if command -v claude &>/dev/null; then
  ok "Claude Code CLI"
else
  err "Claude Code가 설치되지 않았습니다"
  echo ""
  echo "  해결: https://claude.ai/code 에서 설치 후 재실행하세요"
  exit 1
fi

# ══════════════════════════════════════════════════════
banner "2단계: 작업 폴더 생성"

if [ -d "${FORGE_OUTPUTS}/01-research" ]; then
  ok "~/forge-outputs 폴더 이미 있음 — 스킵"
else
  # root-cause: 플러그인 사용자는 git repo 클론 불필요 — 로컬 폴더 구조만 생성
  info "~/forge-outputs 폴더 구조 생성 중..."
  mkdir -p "${FORGE_OUTPUTS}"/{01-research,02-product,03-marketing,04-content,05-design,09-grants,10-operations,11-platform,13-multiagent,20-wiki}
  ok "~/forge-outputs 준비됨"
fi

# ══════════════════════════════════════════════════════
banner "3단계: API 키 입력"

echo ""
if [ -f "${ENV_FILE}" ]; then
  warn "이미 저장된 API 키가 있습니다 (${ENV_FILE})"
  echo -n "  다시 입력하시겠습니까? (y/N): "
  read -r redo_env
  if [[ ! "$redo_env" =~ ^[Yy]$ ]]; then
    ok "기존 API 키 사용"
    set -a; source "${ENV_FILE}"; set +a
  else
    rm -f "${ENV_FILE}"
  fi
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "  API 키를 아래에 입력하세요."
  echo "  없는 항목은 Enter를 누르면 나중에 추가할 수 있습니다."
  echo ""

  touch "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"

  ask_key() {
    local var="$1" label="$2" url="$3"
    echo -n "  ${label}: "
    local val
    read -rs val; echo ""
    if [ -n "$val" ]; then
      echo "${var}=${val}" >> "${ENV_FILE}"
      ok "저장됨"
    else
      warn "입력 없음 (나중에 ${ENV_FILE}에 추가하세요)"
    fi
  }

  echo "  [필수 — 없으면 주요 기능 작동 안 함]"
  info "브라우저 열기: https://console.anthropic.com/keys"
  open_browser "https://console.anthropic.com/keys"
  ask_key "ANTHROPIC_API_KEY" "Anthropic API Key" ""

  echo ""
  info "브라우저 열기: https://aistudio.google.com/app/apikey"
  open_browser "https://aistudio.google.com/app/apikey"
  ask_key "GEMINI_API_KEY" "Gemini API Key" ""

  echo ""
  info "브라우저 열기: https://tavily.com"
  open_browser "https://tavily.com"
  ask_key "TAVILY_API_KEY" "Tavily API Key" ""

  echo ""
  info "브라우저 열기: https://api.search.brave.com/register"
  open_browser "https://api.search.brave.com/register"
  ask_key "BRAVE_API_KEY" "Brave Search API Key" ""

  echo ""
  echo "  [선택 — 필요한 경우에만]"
  ask_key "FIGMA_API_KEY"       "Figma API Key (디자인 작업 시, 없으면 Enter)" ""
  ask_key "GITHUB_TOKEN"        "GitHub Personal Token (PR 작업 시, 없으면 Enter)" ""
  ask_key "OPENAI_API_KEY"      "OpenAI API Key (GPT 리뷰 시, 없으면 Enter)" ""
  ask_key "REPLICATE_API_TOKEN" "Replicate Token (이미지 생성 시, 없으면 Enter)" ""

  ok "API 키 저장 완료 → ${ENV_FILE}"
fi

# .env 로드 (현재 쉘)
set -a; source "${ENV_FILE}" 2>/dev/null || true; set +a

# root-cause: Claude Code는 별도 프로세스 — .bashrc에 source 라인 없으면 MCP가 env var 못 받음
_SHELL_RC=""
if [ -f "${HOME_DIR}/.zshrc" ]; then _SHELL_RC="${HOME_DIR}/.zshrc"
elif [ -f "${HOME_DIR}/.bashrc" ]; then _SHELL_RC="${HOME_DIR}/.bashrc"
fi
if [ -n "${_SHELL_RC}" ]; then
  _SOURCE_LINE="[ -f \"${ENV_FILE}\" ] && set -a && source \"${ENV_FILE}\" && set +a"
  if ! grep -q "${ENV_FILE}" "${_SHELL_RC}" 2>/dev/null; then
    echo "" >> "${_SHELL_RC}"
    echo "# Forge API 키 (setup.sh 자동 추가)" >> "${_SHELL_RC}"
    echo "${_SOURCE_LINE}" >> "${_SHELL_RC}"
    ok "API 키 자동 로드 설정됨 (${_SHELL_RC})"
  else
    ok "API 키 로드 이미 설정됨"
  fi
fi

# Gemini 키 별도 파일
if [ -n "${GEMINI_API_KEY:-}" ] && [ ! -f "${GEMINI_KEY_FILE}" ]; then
  echo "${GEMINI_API_KEY}" > "${GEMINI_KEY_FILE}"
  chmod 600 "${GEMINI_KEY_FILE}"
  ok "~/.gemini-api-key 생성됨"
fi

# ══════════════════════════════════════════════════════
banner "4단계: 프로그램 설치"

echo "  (시간이 조금 걸릴 수 있습니다...)"
echo ""

# root-cause: playwright/jq/python 패키지 누락 추가, pip 설치를 헬퍼로 통합
install_pip_pkgs() {
  local to_install=()
  # root-cause: pip가 Python2를 가리킬 수 있음 — pip3 강제 사용
  local PIP_CMD
  if command -v pip3 &>/dev/null; then PIP_CMD="pip3"; else PIP_CMD="pip"; fi
  for pkg in "$@"; do
    local check="${pkg%%[=><\[]*}"
    if $PIP_CMD show "$check" &>/dev/null 2>&1; then ok "${check} 이미 설치됨"; else to_install+=("$pkg"); fi
  done
  if [ ${#to_install[@]} -gt 0 ]; then
    info "Python 패키지 설치 중: ${to_install[*]}"
    $PIP_CMD install -q "${to_install[@]}" && ok "Python 패키지 설치 완료" || warn "일부 패키지 설치 실패 (수동: pip3 install ${to_install[*]})"
  fi
}

# Codex
install_npm_pkg "@openai/codex" "codex"

# GitNexus
install_npm_pkg "gitnexus" "gitnexus"

# Lighthouse
install_npm_pkg "lighthouse" "lighthouse"

# Playwright CLI
if command -v playwright &>/dev/null; then
  ok "playwright 이미 설치됨"
else
  info "playwright 설치 중..."
  npm install -g @playwright/cli 2>/dev/null && ok "playwright 설치 완료" || warn "playwright 설치 실패 (수동: npm install -g @playwright/cli)"
fi
if [ -d "${HOME_DIR}/.cache/ms-playwright" ]; then
  ok "Playwright Chromium 이미 있음"
else
  info "Playwright Chromium 다운로드 중 (약 150MB, 한 번만)..."
  playwright install chromium 2>/dev/null && ok "Chromium 준비됨" || warn "Chromium 설치 실패 (수동: playwright install chromium)"
fi

# jq (JSON 파싱 — 훅·QA 필수)
if command -v jq &>/dev/null; then
  ok "jq 이미 설치됨"
elif command -v apt-get &>/dev/null; then
  info "jq 설치 중..."
  sudo apt-get install -y jq -q 2>/dev/null && ok "jq 설치 완료" || warn "jq 설치 실패 (수동: sudo apt install jq)"
elif command -v brew &>/dev/null; then
  brew install jq -q 2>/dev/null && ok "jq 설치 완료" || warn "jq 설치 실패 (수동: brew install jq)"
else
  warn "jq 자동 설치 불가 — 수동: sudo apt install jq"
fi

# Python 패키지 (pdf·이미지·브라우저 자동화 스킬용)
install_pip_pkgs hwpx-mcp-server Pillow pytesseract pdf2image playwright

# ══════════════════════════════════════════════════════
banner "5단계: 스킬·에이전트 동기화 (forge-sync)"

# root-cause: forge-sync는 forge 레포 클론한 코어 팀원용 — 플러그인 사용자는 스킵
if [ -f "${FORGE_SYNC}" ]; then
  info "forge 레포 감지됨 — forge-sync 실행 중..."
  node "${FORGE_SYNC}" sync 2>&1 | grep -E "✔|✘|→|Sync|완료|오류" | head -10 || true
  ok "동기화 완료 (플러그인 설치는 6단계에서 자동 스킵됨)"
else
  ok "플러그인 모드 — forge-sync 스킵 (스킬은 플러그인으로 설치됩니다)"
fi

# ══════════════════════════════════════════════════════
banner "6단계: AI 도구 연결 (MCP)"

info "AI 도구 7종 연결 중..."

node << MCPEOF
const fs = require('fs');
const os = require('os');
const HOME = os.homedir();
const CLAUDE_JSON = HOME + '/.claude.json';
const FORGE_ROOT = HOME + '/forge';

let config = {};
try { config = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8')); } catch(e) { config = {}; }
if (!config.mcpServers) config.mcpServers = {};

const servers = {
  "notion":       { type:"http", url:"https://mcp.notion.com/mcp" },
  "tavily":       { type:"stdio", command:"npx", args:["-y","tavily-mcp"], env:{"TAVILY_API_KEY":"\${TAVILY_API_KEY}"} },
  "gitnexus":     { type:"stdio", command:"gitnexus", args:["mcp"] },
  "figma":        { type:"stdio", command:"npx", args:["-y","@figma/figma-developer-mcp","--stdio"], env:{"FIGMA_API_KEY":"\${FIGMA_API_KEY}"} },
  "codex":        { type:"stdio", command:"codex", args:["mcp-server"] },
  // root-cause: 외부 사용자는 forge 레포 없음 — 경로 조건부 처리
  "gemini-text": require('fs').existsSync(FORGE_ROOT+"/dev/scripts/gemini-text-mcp/start.sh")
    ? { type:"stdio", command:"bash", args:[FORGE_ROOT+"/dev/scripts/gemini-text-mcp/start.sh"], env:{"GEMINI_API_KEY":"\${GEMINI_API_KEY}"} }
    : { type:"stdio", command:"npx", args:["-y","@google/gemini-cli-mcp"], env:{"GEMINI_API_KEY":"\${GEMINI_API_KEY}"} },
  "brave-search": { type:"stdio", command:"npx", args:["-y","@modelcontextprotocol/server-brave-search"], env:{"BRAVE_API_KEY":"\${BRAVE_API_KEY}"} }
};

let added=0;
for(const [name,cfg] of Object.entries(servers)){
  if(!config.mcpServers[name]){ config.mcpServers[name]=cfg; added++; }
}
fs.writeFileSync(CLAUDE_JSON, JSON.stringify(config,null,2)+'\n');
console.log('  → ' + added + '개 추가, ' + (Object.keys(servers).length-added) + '개 이미 있음');
MCPEOF

ok "AI 도구 연결 완료"

# ══════════════════════════════════════════════════════
banner "7단계: 플러그인 설치"

SKILL_COUNT=$(ls "${HOME_DIR}/.claude/skills" 2>/dev/null | wc -l)
if [ "$SKILL_COUNT" -gt 20 ]; then
  ok "스킬 mirror가 있습니다 (${SKILL_COUNT}개) — 플러그인 중복 설치 건너뜀"
else
  info "플러그인 마켓플레이스 등록 중..."
  claude plugin marketplace add forge-plugins github:moongci38-oss/forge-plugins 2>/dev/null || true

  for p in forge-core forge-dev forge-plan forge-research forge-design forge-game; do
    # root-cause: grep 패턴 대신 이름만 매칭 — 출력 형식(❯/공백) 무관
    if claude plugin list 2>/dev/null | grep -q "${p}"; then
      info "${p} 업데이트 중..."
      if claude plugin update "${p}@forge-plugins" 2>/dev/null; then
        ok "${p} 최신으로 업데이트됨"
      else
        warn "${p} 업데이트 실패 (수동: claude plugin update ${p}@forge-plugins)"
      fi
    else
      info "${p} 설치 중..."
      if claude plugin install "${p}@forge-plugins" 2>/dev/null; then
        ok "${p} 설치됨"
      else
        warn "${p} 설치 실패 (수동: claude plugin install ${p}@forge-plugins)"
      fi
    fi
    claude plugin enable "${p}" 2>/dev/null || true
  done
fi

# ══════════════════════════════════════════════════════
banner "8단계: 로그인"

echo ""
# Codex 로그인 상태 확인 (auth.json 존재 여부)
if [ -f "${HOME_DIR}/.codex/auth.json" ] && grep -q "token\|apiKey\|access" "${HOME_DIR}/.codex/auth.json" 2>/dev/null; then
  ok "Codex 이미 로그인됨 — 스킵"
else
  echo "  ① Codex (GPT-5.5 리뷰 기능용)"
  echo "     — 브라우저에서 ChatGPT 계정으로 로그인해 주세요"
  echo ""
  read -rp "  Codex 로그인 시작 (Enter): "
  codex login 2>/dev/null || warn "codex login 실패 — 나중에 터미널에서 'codex login' 실행하세요"
fi

echo ""
echo "  ② Notion 연결"
echo "     — Claude Code를 처음 실행하면 자동으로 브라우저가 열립니다"
echo "     — Notion 계정으로 로그인 후 팀 워크스페이스를 선택하세요"
echo "     — 워크스페이스 접근 권한이 없으면 관리자에게 요청하세요"
echo ""
read -rp "  확인했습니다 (Enter): "

# ══════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     🎉  세팅 완료!                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  지금 바로:"
echo "  1. Claude Code를 완전히 종료 후 다시 시작하세요"
echo "  2. 새 세션에서 아래를 입력하면 상태를 확인할 수 있어요:"
echo ""
echo -e "     ${BLUE}/forge-onboard${NC}"
echo ""

# 빠진 API 키 안내
MISSING=()
[ -z "${ANTHROPIC_API_KEY:-}" ] && MISSING+=("ANTHROPIC_API_KEY  →  https://console.anthropic.com/keys")
[ -z "${GEMINI_API_KEY:-}" ]    && MISSING+=("GEMINI_API_KEY     →  https://aistudio.google.com/app/apikey")
[ -z "${TAVILY_API_KEY:-}" ]    && MISSING+=("TAVILY_API_KEY     →  https://tavily.com")
[ -z "${BRAVE_API_KEY:-}" ]     && MISSING+=("BRAVE_API_KEY      →  https://api.search.brave.com/register")

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "  ⚠ 아직 입력 안 된 API 키:"
  for m in "${MISSING[@]}"; do echo "    - $m"; done
  echo ""
  echo "  → ${ENV_FILE} 파일을 열어서 추가하세요"
  echo "     nano ${ENV_FILE}"
  echo ""
fi

echo "  막히면: Claude Code에서 '세팅 도와줘' 라고 입력하세요"
echo ""
