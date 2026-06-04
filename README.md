# forge-plugins

Forge Claude Code Plugin Marketplace — 6개 플러그인 패키지.

> **레포**: `github.com/moongci38-oss/forge-plugins` (public)

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

## 신규 설치 (팀원용)

### Step 1 — Marketplace 등록 (최초 1회)

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
```

### Step 2 — 역할에 맞는 플러그인 설치

```bash
claude plugin install forge-core          # 필수 (모든 역할)

claude plugin install forge-dev           # 개발자
claude plugin install forge-plan          # 기획자/PM
claude plugin install forge-research      # 리서처
claude plugin install forge-design        # 디자이너
claude plugin install forge-game          # 게임 개발자 (forge-design도 함께)
```

### Step 3 — Claude Code 재시작

설치 후 Claude Code를 재시작해야 플러그인이 활성화됩니다.

```bash
# Claude Code 재시작 (IDE 익스텐션이면 창 닫고 다시 열기)
```

### Step 4 — 설치 확인

```bash
claude plugin list
```

`forge-core` 등 설치한 플러그인이 목록에 표시되면 완료.

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

온보딩은 한 번만 실행됩니다. 이미 파일이 있으면 자동으로 스킵.

---

## 업데이트 방법

**자동 업데이트 없음.** 개발자가 플러그인을 고도화하면 팀원이 수동으로 업데이트해야 합니다.

### 팀원 업데이트 절차

```bash
# 1. 업데이트 실행
claude plugin update forge-core
claude plugin update forge-dev       # 설치한 것만

# 2. Claude Code 재시작
```

### 업데이트 알림

팀 채널에서 업데이트 공지를 확인하세요. 버전 변경 내역은 아래 [Changelog](#changelog)에서 확인.

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

## 로컬 클론 방식 (대안)

Marketplace 방식 대신 직접 클론해서 사용할 수 있습니다.

```bash
# 레포 클론
git clone https://github.com/moongci38-oss/forge-plugins.git ~/forge-plugins-repo

# ~/.claude/settings.json 에 영구 등록
```

`~/.claude/settings.json`:
```json
{
  "plugins": [
    { "path": "~/forge-plugins-repo/forge-core" },
    { "path": "~/forge-plugins-repo/forge-dev" }
  ]
}
```

이 방식은 `git pull`로 업데이트 가능:
```bash
cd ~/forge-plugins-repo && git pull
# Claude Code 재시작 → 새 버전 자동 로드
```

---

## 설치 후 사용법

설치 완료 후 Claude Code 채팅창에서 `/` 입력하면 스킬 목록이 자동 표시됩니다.

### forge-core (모든 역할 공통)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/cr-multi` | `/cr-multi <파일경로>` | 멀티 모델 코드 검수 (Opus + Codex) |
| `/approve-worker` | `/approve-worker` | forge 승인 워커 실행 |

### forge-dev (개발자)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/qa` | `/qa` | QA 파이프라인 실행 |
| `/healer` | `/healer` | 버그 자동 수정 |
| `/investigate` | `/investigate <증상>` | 버그 원인 분석 |
| `/api-e2e` | `/api-e2e` | API E2E 테스트 |
| `/playwright` | `/playwright` | Playwright 브라우저 테스트 |
| `/forge-fix` | `/forge-fix <파일>` | 핫픽스 |
| `/forge-implement` | `/forge-implement` | Spec 기반 구현 (/spec-write → /forge-implement → /qa → /forge-pr 순서) |

### forge-plan (기획자/PM)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/spec-write` | `/spec-write <기능명>` | Spec 문서 작성 |
| `/writing-plans` | `/writing-plans` | 기획서 작성 |
| `/requirements-clarity` | `/requirements-clarity` | 요구사항 명확화 |
| `/autoplan` | `/autoplan <목표>` | 자동 플랜 생성 |
| `/forge-pr` | `/forge-pr` | PR 생성 |

### forge-research (리서처)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/article` | `/article <URL>` | 기사 분석 |
| `/yt` | `/yt <URL>` | YouTube 영상 분석 |
| `/rag-search` | `/rag-search <질문>` | 프로젝트 자료 검색 |
| `/site-deep-analyze` | `/site-deep-analyze <URL>` | 사이트 심층 분석 |
| `/weekly-research` | `/weekly-research` | 주간 리서치 파이프라인 |

### forge-design (디자이너)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/figma-design-sync` | `/figma-design-sync` | Figma 디자인 동기화 |
| `/image-orchestrate` | `/image-orchestrate` | 이미지 생성 오케스트레이션 |
| `/multiformat-image` | `/multiformat-image <이미지>` | 이미지 포맷 변환 |

### forge-game (게임 개발자)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/gdd` | `/gdd <게임명>` | GDD(게임 디자인 문서) 작성 |
| `/game-qa` | `/game-qa` | 게임 QA 파이프라인 |
| `/game-asset-pipeline` | `/game-asset-pipeline` | 게임 에셋 파이프라인 |
| `/asset-extract` | `/asset-extract` | Unity 에셋 추출 |

### 빠른 시작 예시

```
# 코드 검수
/cr-multi src/auth/login.ts

# 버그 분석
/investigate 로그인 시 토큰이 만료됨

# 기사 분석
/article https://techcrunch.com/...

# 유튜브 요약
/yt https://youtube.com/watch?v=...

# Spec 작성 후 구현
/spec-write 사용자 알림 기능
/forge-implement
```

---

## 문제 해결

### 설치 후 스킬이 안 보임

```bash
# 1. 설치 확인
claude plugin list

# 2. Claude Code 재시작 (필수)

# 3. 여전히 안 보이면 재설치
claude plugin remove forge-core
claude plugin install forge-core
```

### 온보딩 훅이 실행 안 됨

```bash
# 수동으로 온보딩 실행
bash ~/.claude/plugins/forge-core/hooks/forge-onboard.sh
```

### Marketplace 등록 오류

```bash
# 등록 해제 후 재등록
claude plugin marketplace remove moongci38-oss/forge-plugins
claude plugin marketplace add moongci38-oss/forge-plugins
```

---

## 파일 구조

```
forge-plugins-repo/
├── .claude-plugin/marketplace.json    — 마켓플레이스 인덱스
├── forge-core/
│   ├── .claude-plugin/plugin.json     — 플러그인 매니페스트
│   ├── skills/
│   │   ├── approve-worker/            — forge 승인 워커
│   │   └── cr-multi/                  — 멀티 검수 오케스트레이터
│   ├── hooks/
│   │   └── forge-onboard.sh           — SessionStart 자동 실행
│   └── rules/
│       ├── forge-core.md              — forge 전역 규칙
│       ├── behavior-core.md           — 자율실행·외과적변경·존댓말 등
│       └── tool-rules.md              — 도구 사용 정책
├── forge-dev/
│   ├── .claude-plugin/plugin.json
│   ├── skills/                        — 21개 (qa/healer/investigate/api-e2e 등)
│   └── agents/                        — 10개 (code-reviewer/performance-checker 등)
├── forge-plan/
│   ├── skills/                        — spec-write/writing-plans/requirements-clarity/autoplan
│   ├── commands/                      — forge-plan/forge-pr/sdd
│   └── agents/                        — spec-writer/technical-writer
├── forge-research/
│   ├── skills/                        — article/yt/rag-search/site-deep-analyze
│   ├── commands/                      — weekly-research
│   └── agents/                        — 7개 (yt-video-analyst/fact-checker 등)
├── forge-design/
│   ├── skills/                        — figma-design-sync/image-orchestrate/multiformat-image
│   └── agents/                        — 2개 (screenshot-business-analyzer 등)
└── forge-game/
    ├── skills/                        — gdd/game-qa/game-asset-pipeline/asset-extract
    └── agents/                        — gdd-writer
```

---

## Changelog

### v0.1.0 (2026-06-02)
- forge-core / forge-dev / forge-plan / forge-research / forge-design / forge-game 최초 패키징
- Marketplace 지원 (`.claude-plugin/marketplace.json`)
- forge-core 규칙 3종 번들: forge-core.md / behavior-core.md / tool-rules.md
- SessionStart 온보딩 훅: orch-token 자동 생성 + 규칙 설치
