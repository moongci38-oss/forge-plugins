# forge-plugins

Forge Claude Code Plugin Marketplace — 6개 플러그인 패키지.

> **레포**: `github.com/moongci38-oss/forge-plugins` (private)

---

## 플러그인 목록

| 플러그인 | 버전 | 설명 | 의존성 |
|---------|------|------|--------|
| **forge-core** | v0.1.0 | 핵심 인프라 — cr-multi/approve-worker + 온보딩 훅 + 규칙 3종 | 없음 (기반) |
| **forge-dev** | v0.1.0 | 개발 파이프라인 — qa/healer/investigate/api-e2e/playwright (21 skills, 10 agents) | forge-core |
| **forge-plan** | v0.1.0 | 기획 파이프라인 — spec-write/writing-plans/requirements-clarity/autoplan | forge-core |
| **forge-research** | v0.1.0 | 리서치 — article/yt/rag-search/site-deep-analyze | forge-core |
| **forge-design** | v0.1.0 | 디자인 — figma-sync/image-orchestrate/multiformat-image | forge-core |
| **forge-game** | v0.1.0 | 게임팩 — gdd/game-qa/game-asset-pipeline/asset-extract (Unity 전용) | forge-core, forge-design |

---

## 팀원 신규 설치

### 방법 A — Marketplace (권장)

```bash
# 1. forge marketplace 등록 (최초 1회)
claude plugin marketplace add moongci38-oss/forge-plugins

# 2. 플러그인 설치
claude plugin install forge-core
claude plugin install forge-dev       # 개발자
claude plugin install forge-plan      # 기획자/PM
claude plugin install forge-research  # 리서처
claude plugin install forge-design    # 디자이너
claude plugin install forge-game      # 게임 개발자 (forge-design도 설치됨)
```

### 방법 B — 로컬 클론

```bash
# 1. 레포 클론
git clone git@github.com:moongci38-oss/forge-plugins.git ~/forge-plugins-repo

# 2. Claude Code 실행 시 직접 로드
claude --plugin-dir ~/forge-plugins-repo/forge-core \
       --plugin-dir ~/forge-plugins-repo/forge-dev
```

또는 `~/.claude/settings.json` 에 영구 등록:
```json
{
  "plugins": [
    { "path": "~/forge-plugins-repo/forge-core" },
    { "path": "~/forge-plugins-repo/forge-dev" }
  ]
}
```

---

## 첫 세션 자동 온보딩

Claude Code 세션 시작 시 `forge-core`의 SessionStart 훅이 자동 실행:

```
[forge-onboard] orch-token.key created: ~/.config/forge/orch-token.key
[forge-onboard] rules installed: forge-core.md
[forge-onboard] rules installed: behavior-core.md
[forge-onboard] rules installed: tool-rules.md
```

- **orch-token.key** — forge approve-worker 인증 토큰 (없으면 자동 생성, 이후 스킵)
- **rules** — `~/.claude/rules/`에 forge 규칙 3종 설치 (이미 있으면 스킵)

---

## MCP API 키 설정 (선택)

`forge-core`는 Codex/Gemini MCP를 포함. 사용하려면 환경변수 설정:

```bash
# ~/.bashrc 또는 ~/.zshrc 에 추가
export OPENAI_API_KEY="sk-..."       # Codex MCP (cr-triple 2차 검수)
export GEMINI_API_KEY="AIza..."      # Gemini MCP (vision 분석)
```

> MCP 없이도 forge-core/forge-dev 기본 스킬 정상 동작.

---

## 파일 구조

```
forge-plugins-repo/
├── marketplace.json               — 플러그인 인덱스 (버전 관리)
├── forge-core/
│   ├── .claude-plugin/plugin.json — 플러그인 매니페스트
│   ├── skills/
│   │   ├── approve-worker/        — forge 승인 워커
│   │   └── cr-multi/              — 멀티 검수 오케스트레이터
│   ├── hooks/
│   │   └── forge-onboard.sh       — SessionStart 자동 실행 (orch-token + rules 설치)
│   └── rules/
│       ├── forge-core.md          — forge 전역 규칙
│       ├── behavior-core.md       — 자율실행·외과적변경·존댓말 등
│       └── tool-rules.md          — 도구 사용 정책
├── forge-dev/
│   ├── .claude-plugin/plugin.json
│   ├── skills/                    — 21개 (qa/healer/investigate/api-e2e 등)
│   └── agents/                    — 10개 (code-reviewer/performance-checker 등)
├── forge-plan/
│   ├── skills/                    — spec-write/writing-plans/requirements-clarity/autoplan
│   ├── commands/                  — forge-plan/forge-pr/sdd
│   └── agents/                    — spec-writer/technical-writer
├── forge-research/
│   ├── skills/                    — article/yt/rag-search/site-deep-analyze
│   ├── commands/                  — weekly-research
│   └── agents/                    — 7개 (yt-video-analyst/fact-checker 등)
├── forge-design/
│   ├── skills/                    — figma-design-sync/image-orchestrate/multiformat-image
│   └── agents/                    — 2개 (screenshot-business-analyzer 등)
└── forge-game/
    ├── skills/                    — gdd/game-qa/game-asset-pipeline/asset-extract
    └── agents/                    — gdd-writer
```

---

## 업데이트

```bash
# Marketplace 경유 설치한 경우
claude plugin update forge-core
claude plugin update forge-dev

# 로컬 클론 경우
cd ~/forge-plugins-repo && git pull
# Claude Code 재시작 → 새 버전 자동 로드
```

---

## 역할별 설치 추천

| 역할 | 설치 플러그인 |
|------|------------|
| 백엔드/풀스택 개발자 | forge-core + forge-dev |
| 기획자 / PM | forge-core + forge-plan |
| 리서처 | forge-core + forge-research |
| 디자이너 | forge-core + forge-design |
| 게임 개발자 | forge-core + forge-design + forge-game |
| 전체 설치 | 위 6개 모두 |
