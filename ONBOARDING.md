# Forge 팀원 온보딩 가이드

> 새 팀원이 Forge 개발 환경을 완전히 세팅하는 순서대로 정리한 문서.

---

## 전제조건 — Claude Code 설치 (1회만)

아래 링크에서 Claude Code를 먼저 설치하세요.

**https://claude.ai/code**

설치 후 터미널에서 확인:
```bash
claude --version
```

---

## ⚡ 자동 설치 (권장 — 비개발자도 OK)

Claude Code 세션에서 아래 한 줄을 입력하면 됩니다:

```
! bash setup.sh
```

또는 일반 터미널에서:

```bash
bash setup.sh
```

스크립트가 자동으로 처리하는 것:
- CLI 도구 설치: Codex, GitNexus, Lighthouse, **Playwright** (+ Chromium), **jq**
- Python 패키지: hwpx-mcp-server, Pillow, pytesseract, pdf2image, playwright
- API 키 입력 안내 (브라우저 자동 열기)
- MCP 서버 7종 `~/.claude.json` 등록
- 플러그인 7종 설치·활성화 (forge-core + forge-brain + forge-dev/plan/research/design/game)
- Codex 로그인 브라우저 열기

역할별 추가 설치 (setup.sh 이후 필요 시):

| 역할 | 추가 도구 | 설치 명령 |
|------|-----------|----------|
| 문서 (pptx/docx) | pandoc, LibreOffice | `sudo apt install pandoc libreoffice` |
| 이미지 처리 고급 | imagemagick, rembg | `sudo apt install imagemagick && pip install rembg` |
| 부하 테스트 | k6 | `sudo apt install k6` |
| RAG 로컬 임베딩 | sentence-transformers | `pip install sentence-transformers` |

> 아래는 **수동 설치 참고용**입니다. 문제가 생겼거나 세부 내용을 이해하고 싶을 때 참조하세요.

---

## 0. 전제조건 확인

```bash
node --version    # v18+ 필요 (권장: v22)
python3 --version # 3.10+ 필요
git --version
```

Node.js 미설치 시:
```bash
# nvm 방식 (권장)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

---

## 1. 레포 클론 (코어 팀원만)

> **플러그인 사용자**: 이 단계 스킵 — 폴더는 setup.sh가 자동 생성합니다.

```bash
# forge 시스템 (규칙·스킬·파이프라인) — 코어 팀원만
git clone git@github.com:moongci38-oss/forge.git ~/forge
```

> forge-outputs 저장소 클론은 별도 승인 필요 — 관리자에게 문의하세요.

---

## 2. 환경변수 설정

`${FORGE_ROOT:-$HOME/forge}/.env` 파일 생성:

```bash
cp ${FORGE_ROOT:-$HOME/forge}/forge-workspace.example.json ${FORGE_ROOT:-$HOME/forge}/forge-workspace.json
```

`.env`에 설정할 키 목록:

| 변수 | 용도 | 필수 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Claude API | ✅ |
| `GEMINI_API_KEY` | Gemini MCP (cr-triple) | ✅ |
| `TAVILY_API_KEY` | 웹 검색 MCP | ✅ |
| `BRAVE_API_KEY` | Brave Search MCP | ✅ |
| `FIGMA_API_KEY` | Figma MCP | 디자인 작업 시 |
| `OPENAI_API_KEY` | Codex (GPT-5.5, cr-triple) | cr-triple 사용 시 |
| `GITHUB_TOKEN` | GitHub API | PR/이슈 작업 시 |
| `REPLICATE_API_TOKEN` | 이미지 생성 | 게임/디자인 트랙 |
| `FORGE_DB_URL` | forge-brain pgvector | RAG 검색 사용 시 |

> **Notion 인증**: Notion MCP는 API 토큰이 아닌 **브라우저 OAuth** 방식입니다. Claude Code 첫 실행 시 자동으로 로그인 창이 열립니다.

Gemini API 키는 별도 파일에도 저장 (gemini-text MCP가 읽음):
```bash
echo "YOUR_GEMINI_API_KEY" > ~/.gemini-api-key
chmod 600 ~/.gemini-api-key
```

---

## 3. CLI 도구 설치

### 3-1. Codex (GPT-5.5 — cr-triple 필수)

```bash
npm install -g @openai/codex
codex login   # ChatGPT OAuth 로그인
```

확인:
```bash
codex --version   # codex-cli 0.128.0+
```

### 3-2. GitNexus (코드 그래프 분석)

```bash
npm install -g gitnexus
gitnexus setup   # Claude Code MCP 자동 등록
```

### 3-3. hwpx-mcp-server (한글 문서 — 정부과제 트랙)

```bash
pip install hwpx-mcp-server
```

### 3-4. Playwright CLI (브라우저 자동화)

```bash
npm install -g @playwright/cli
playwright install chromium
```

확인:
```bash
playwright --version
```

### 3-5. jq (JSON 처리 — 훅·QA 필수)

```bash
# Linux/WSL2
sudo apt-get install -y jq

# macOS
brew install jq
```

### 3-6. Lighthouse + Sentry CLI (QA 트랙)

```bash
bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/setup-cli.sh
```

---

## 4. forge-sync mirror 동기화

forge-sync는 `${FORGE_ROOT:-$HOME/forge}/`의 스킬·에이전트·커맨드를 `$HOME/.claude/`에 미러링합니다.

```bash
node ${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs sync
```

완료 후 `$HOME/.claude/skills/`, `$HOME/.claude/agents/`, `$HOME/.claude/commands/` 생성 확인.

> 이 단계를 완료했다면 **6. 플러그인 설치는 스킵**해도 됩니다 (이중 로딩 방지).

---

## 5. MCP 서버 등록

### 5-1. 자동 등록 (기본 MCP)

```bash
cd ~/forge && bash shared/scripts/setup-mcp.sh
```

### 5-2. 핵심 MCP 수동 확인 (`~/.claude.json`)

| MCP 서버 | 용도 | 인증 방식 |
|---------|------|---------|
| `notion` | Notion DB/페이지 | 브라우저 OAuth (첫 사용 시) |
| `tavily` | 웹 검색 | `TAVILY_API_KEY` |
| `gitnexus` | 코드 그래프 | 없음 (로컬) |
| `figma` | Figma 컴포넌트 | `FIGMA_API_KEY` |
| `codex` | GPT-5.5 리뷰 | `codex login` |
| `gemini-text` | Gemini 리뷰 | `~/.gemini-api-key` |
| `brave-search` | 웹 검색 (보조) | `BRAVE_API_KEY` |

`~/.claude.json` → `mcpServers`에 없는 항목 수동 추가:

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    },
    "tavily": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tavily-mcp"],
      "env": { "TAVILY_API_KEY": "${TAVILY_API_KEY}" }
    },
    "gitnexus": {
      "type": "stdio",
      "command": "gitnexus",
      "args": ["mcp"]
    },
    "figma": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@figma/figma-developer-mcp", "--stdio"],
      "env": { "FIGMA_API_KEY": "${FIGMA_API_KEY}" }
    },
    "codex": {
      "type": "stdio",
      "command": "codex",
      "args": ["mcp-server"]
    },
    "gemini-text": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@google/gemini-cli-mcp"],
      "env": { "GEMINI_API_KEY": "${GEMINI_API_KEY}" }
    },
    "brave-search": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": { "BRAVE_API_KEY": "${BRAVE_API_KEY}" }
    }
  }
}
```

> `gemini-text`는 공개 npm 패키지를 사용합니다. forge 레포가 있는 코어 팀원은 start.sh 경로로 교체하세요.

### 5-3. 프로젝트 MCP (`${FORGE_ROOT:-$HOME/forge}/.mcp.json`)

forge-sync가 자동 관리. 별도 설정 불필요.

| MCP 서버 | 용도 |
|---------|------|
| `forge-tools` | 로컬 forge 리소스 (RAG·스크립트) |
| `hwpx` | 한글 문서 생성 |

---

## 6. 플러그인 설치

> **forge-sync mirror 사용자**: 4단계 완료 시 스킵. 이중 등재 방지.

### 6-1. 마켓플레이스 등록

```bash
claude plugin marketplace add forge-plugins github:moongci38-oss/forge-plugins
```

### 6-2. 역할별 설치

| 역할 | 설치할 플러그인 |
|------|--------------|
| 개발자 | forge-core + forge-brain + forge-dev |
| 기획자 / PM | forge-core + forge-brain + forge-plan |
| 리서처 | forge-core + forge-brain + forge-research |
| 디자이너 | forge-core + forge-brain + forge-design |
| 게임 개발자 | forge-core + forge-brain + forge-design + forge-game |
| 전체 | 7개 모두 |

```bash
# 공통 필수
claude plugin install forge-core@forge-plugins
claude plugin install forge-brain@forge-plugins    # 지식·메모리 (모든 역할 권장)

# 역할에 맞게 선택
claude plugin install forge-dev@forge-plugins
claude plugin install forge-plan@forge-plugins
claude plugin install forge-research@forge-plugins
claude plugin install forge-design@forge-plugins
claude plugin install forge-game@forge-plugins
```

### 6-3. 활성화 및 재시작

```bash
for p in forge-core forge-brain forge-dev forge-plan forge-research forge-design forge-game; do
  claude plugin enable ${p}
done
# Claude Code 재시작 필요
```

### 6-4. 이후 업데이트

```bash
for p in forge-core forge-brain forge-dev forge-plan forge-research forge-design forge-game; do
  claude plugin update ${p}@forge-plugins
done
```

---

## 7. forge-workspace.json 설정 (코어 팀원만)

> **플러그인 사용자**: 이 단계 스킵 — forge-outputs는 setup.sh가 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/`에 자동 생성합니다.

```json
// ${FORGE_ROOT:-$HOME/forge}/forge-workspace.json
{
  "version": "2.0.0",
  "name": "내-워크스페이스",
  "outputsRoot": "/home/유저명/forge-outputs"
}
```

---

## 8. Notion 인증

Notion MCP는 HTTP OAuth 방식입니다.
- Claude Code에서 Notion 도구 첫 호출 시 브라우저 창이 열림
- Notion 계정 로그인 → 팀 워크스페이스 연결 허용
- 팀 워크스페이스 접근 권한은 관리자에게 요청

---

## 8-B. 세션관리 흐름 (forge-core v0.2.0)

Forge는 멀티세션 환경입니다. 세션 전환 시 handover로 컨텍스트를 이어받습니다.

| 커맨드 | 시점 | 역할 |
|--------|------|------|
| `/start-sonnet` | 구현 세션 시작 | 직전 handover 읽기 + 오늘 작업 목록 출력 |
| `/checkpoint` | 작업 중간 (토큰 70~90%) | 현재 상태 스냅샷 저장 → /compact 후 맥락 복원 |
| `/end-sonnet` | 구현 세션 종료 | handover 작성 + learnings 추출 + memory 업데이트 |
| `/start-opus` | 전략 세션 시작 | Sonnet handover 읽기 + 전략 컨텍스트 로드 |
| `/end-opus` | 전략 세션 종료 | ADR 인수인계 + 장기기억 업데이트 |

**핸드오버 경로**: `{프로젝트}/.claude/handover/sonnet/{날짜}-{slug}.md`

> 온보딩 훅(forge-onboard.sh)이 `$HOME/.claude/handover/sonnet/`, `$HOME/.claude/handover/opus/`, `$HOME/.claude/checkpoints/` 디렉토리를 자동 생성합니다.

---

## 8-C. forge-brain 설정 (선택)

forge-brain은 `FORGE_DB_URL` 없이도 로컬 FAISS 모드로 동작합니다.

ADR-174 unified_search pgvector 연동 시 환경변수 추가:

```bash
# ~/.bashrc 또는 ~/.zshrc 에 추가
export FORGE_DB_URL="postgresql://user:pass@localhost/forge"
```

주요 커맨드:

```
/rag-search ADR-174 통합 두뇌 설계 근거    ← 프로젝트 자료 검색
/learn                                    ← 세션 학습 내용 기록
/wiki-sync                                ← Obsidian vault 동기화
/memory-manage                            ← MEMORY.md 항목 관리
```

---

## 9. 최종 검증

Claude Code 재시작 후:

```bash
claude plugin list   # enabled 항목 확인
```

Claude Code 대화에서:
```
/forge-onboard    ← 온보딩 상태 자동 점검
```

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `codex mcp-server` 오류 | 로그인 만료 | `codex login` 재실행 |
| gemini-text 연결 실패 | 키 미설정 | `cat ~/.gemini-api-key` 확인 |
| `claude plugin update` 락 오류 | 병렬 git 충돌 | `find $HOME/.claude/plugins/marketplaces -name "*.lock" -delete` 후 재시도 |
| forge-sync 스킬 미반영 | sync 미실행 | `node ${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs sync` |
| Notion MCP 인증 루프 | 워크스페이스 권한 없음 | 관리자에게 권한 요청 |
| gitnexus MCP 없음 | setup 미실행 | `gitnexus setup` |
| forge-brain rag-search 오류 | FORGE_DB_URL 미설정 | FAISS 모드 자동 폴백 (정상) |
| `/start-sonnet` handover 없음 | 첫 세션 | 경고 없이 빈 컨텍스트로 시작 (정상) |
