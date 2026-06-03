# forge-plugins

Forge Claude Code Plugin Marketplace.

## 설치

```bash
# Claude Code 설정에서:
/plugin marketplace add moongci38-oss/forge-plugins

# 플러그인 설치:
/plugin install forge-core
/plugin install forge-dev
```

또는 로컬 직접 로드:
```bash
claude --plugin-dir ./forge-core
```

## 플러그인 목록

| 플러그인 | 상태 | 설명 |
|---------|------|------|
| **forge-core** | ✅ v0.1.0 | 핵심 인프라 — cr-multi/approve-worker + MCP(codex/gemini) |
| **forge-dev** | ✅ v0.1.0 | 개발 파이프라인 — qa/healer/investigate/api-e2e/playwright (21 skills, 10 agents) |
| forge-plan | 🔜 P2 | 기획 — spec-write/writing-plans/requirements-clarity |
| forge-research | 🔜 P2 | 리서치 — article/yt/rag-search |
| forge-design | 🔜 P2 | 디자인 — figma-sync/screenshot-analyze |
| forge-game | 🔜 P2 | 게임팩 — gdd/game-qa (Unity 전용) |

## 신규 머신 온보딩

```bash
# 1. forge-core 설치 (최초 1회)
/plugin install forge-core
# → ~/.config/forge/orch-token.key 자동 생성
# → ~/.claude/rules/ 규칙 설치

# 2. 도메인 플러그인 추가
/plugin install forge-dev
```

## MCP 설정 (forge-core)

`forge-core`는 codex/gemini/nano-banana MCP 서버를 번들. 첫 설치 시 API 키 입력 필요:
- `OPENAI_API_KEY` — Codex MCP용
- `GEMINI_API_KEY` — Gemini/nano-banana MCP용
