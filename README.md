# forge-plugins

Forge Claude Code Plugin Marketplace — 5개 플러그인 패키지(통합 4 + forge-game).

> **레포**: `github.com/moongci38-oss/forge-plugins` (public)

---

## 역할별 설치 추천

| 역할 | 설치 플러그인 |
|------|------------|
| 백엔드/풀스택 개발자 | forge-core + forge-build |
| 기획자 / PM | forge-core + forge-build + forge-knowledge |
| 리서처 | forge-core + forge-knowledge |
| 디자이너 | forge-core + forge-design |
| 게임 개발자 | forge-core + forge-design + forge-game |
| 시스템 감사자 | forge-core (감사·하네스 내장) |
| 전체 설치 | forge-core + forge-knowledge + forge-build + forge-design (+ forge-game) |

---

## 플러그인 목록

| 플러그인 | 버전 | 설명 | 의존성 |
|---------|------|------|--------|
| **forge-core** | v0.6.0 | 핵심 인프라 — cr-multi/approve-worker/rag-search + **세션관리 5종** + 하네스 정리(harness-legacy-scan/diet/external-sweep/agent-drift) + 감사(system-audit 6축·ACHCE 5축·migration-audit) | 없음 (기반) |
| **forge-build** | v0.2.0 | 제품 생성 파이프라인 — 기획(spec-write/writing-plans/requirements-clarity/autoplan) + 구현·검증(qa/healer/investigate/api-e2e/forge-fix/보안·성능·UI 검수) | forge-core |
| **forge-knowledge** | v0.2.0 | 지식·리서치 — learn/memory-manage/wiki-sync + article/yt/site-deep-analyze/weekly-research/forge-find-item, forge-tools MCP(ADR-174 unified_search) | forge-core |
| **forge-design** | v0.1.5 | 디자인·에셋 — figma-sync/image-orchestrate/visual-loop | forge-core |
| **forge-game** | v0.1.2 | 게임팩 — gdd/game-qa/game-asset-pipeline/asset-extract (Unity 전용) | forge-core, forge-design |

---

## 신규 설치 (팀원용)

### Step 1 — Marketplace 등록 (최초 1회)

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
```

### Step 2 — 역할에 맞는 플러그인 설치

```bash
claude plugin install forge-core          # 필수 (모든 역할)
claude plugin install forge-knowledge     # 지식·리서치 (권장 — 모든 역할)

claude plugin install forge-build         # 개발자/기획자 (구현+기획 파이프라인)
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
[forge-onboard] handover dirs: $HOME/.claude/handover/sonnet/, $HOME/.claude/handover/opus/
[forge-onboard] checkpoints dir: $HOME/.claude/checkpoints/
```

- **orch-token.key** — forge approve-worker 인증 토큰 (없으면 자동 생성, 이후 스킵)
- **rules** — `$HOME/.claude/rules/`에 forge 규칙 3종 설치 (이미 있으면 스킵)
- **handover/checkpoints** — 세션관리용 디렉토리 자동 생성

온보딩은 한 번만 실행됩니다. 이미 파일이 있으면 자동으로 스킵.

---

## 업데이트 방법

**자동 업데이트 없음.** 개발자가 플러그인을 고도화하면 팀원이 수동으로 업데이트해야 합니다.

### 팀원 업데이트 절차

```bash
# 1. 업데이트 실행
claude plugin update forge-core
claude plugin update forge-knowledge    # 설치한 것만
claude plugin update forge-build

# 2. Claude Code 재시작
```

### 업데이트 알림

팀 채널에서 업데이트 공지를 확인하세요. 버전 변경 내역은 아래 [Changelog](#changelog)에서 확인.

---

## cr-* 커맨드 사전 조건

`/cr-triple`, `/cr-double` 등 cr-* 계열은 **Codex MCP + Gemini MCP** 필수.
MCP 없으면 cr-* 커맨드 동작 X.

### Step 1 — API 키 환경변수 설정

```bash
# ~/.bashrc 또는 ~/.zshrc 에 추가
export OPENAI_API_KEY="sk-..."       # Codex MCP용
export GEMINI_API_KEY="AIza..."      # Gemini MCP용
```

### Step 2 — MCP 서버 설치

```bash
# Codex MCP (npm 전역 설치)
npm install -g @openai/codex

# Gemini MCP (npx 자동 설치 — 별도 설치 불필요)
```

### Step 3 — ~/.claude.json MCP 서버 등록

`~/.claude.json` 파일에 아래 추가:

```json
{
  "mcpServers": {
    "codex": {
      "type": "stdio",
      "command": "codex",
      "args": ["mcp-server"],
      "env": {}
    },
    "gemini": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@fre4x/gemini"],
      "env": {
        "GEMINI_API_KEY": "<your-gemini-api-key>"
      }
    }
  }
}
```

### Step 4 — Claude Code 재시작

MCP 등록 후 재시작해야 적용됩니다.

> MCP 없이도 forge-core 나머지 스킬과 forge-build/forge-knowledge/forge-design/forge-game 정상 동작.

---

## MCP API 키 설정 (선택)

`forge-core`는 Codex/Gemini MCP를 포함. 사용하려면 환경변수 설정:

```bash
# ~/.bashrc 또는 ~/.zshrc 에 추가
export OPENAI_API_KEY="sk-..."       # Codex MCP (cr-triple 2차 검수)
export GEMINI_API_KEY="AIza..."      # Gemini MCP (vision 분석)
```

> MCP 없이도 forge-core/forge-build 기본 스킬 정상 동작.

---

## 로컬 클론 방식 (대안)

Marketplace 방식 대신 직접 클론해서 사용할 수 있습니다.

```bash
# 레포 클론
git clone https://github.com/moongci38-oss/forge-plugins.git ~/forge-plugins-repo

# $HOME/.claude/settings.json 에 영구 등록
```

`$HOME/.claude/settings.json`:
```json
{
  "plugins": [
    { "path": "~/forge-plugins-repo/forge-core" },
    { "path": "~/forge-plugins-repo/forge-knowledge" },
    { "path": "~/forge-plugins-repo/forge-build" }
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

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/cr-triple` | `/cr-triple <파일>` | Opus+Codex+Gemini 3중 검수 (중요 Spec/PR) |
| `/cr-double` | `/cr-double <파일>` | Codex+Gemini 2중 검수 (기본) |
| `/cr-multi` | `/cr-multi <파일>` | 멀티 검수 오케스트레이터 (double/triple 통합) |
| `/cr-code` | `/cr-code <파일>` | 코드 전용 검수 |
| `/cr-plan` | `/cr-plan <파일>` | 계획서/ADR 검수 |
| `/cr-bug` | `/cr-bug <파일>` | 버그 리포트 검수 |
| `/cr-test` | `/cr-test <파일>` | 테스트 코드 검수 |
| `/cr-analysis` | `/cr-analysis <파일>` | 분석 문서 검수 |
| `/cr-final` | `/cr-final <PR번호>` | PR 머지 직전 최종 검수 (blocking) |
| `/approve-worker` | `/approve-worker` | forge 승인 워커 실행 |

### forge-core — 세션관리

| 커맨드 | 사용법 | 설명 |
|--------|--------|------|
| `/start-sonnet` | `/start-sonnet` | Sonnet 구현 세션 시작 — handover 읽기·컨텍스트 로드 |
| `/end-sonnet` | `/end-sonnet` | Sonnet 세션 종료 — handover 작성 + learnings 추가 |
| `/start-opus` | `/start-opus` | Opus 전략 세션 시작 |
| `/end-opus` | `/end-opus` | Opus 세션 종료 — ADR 인수인계 + 장기기억 업데이트 |
| `/checkpoint` | `/checkpoint` | Mid-session 체크포인트 — /compact 전 상태 스냅샷 저장 |

> **세션 흐름**: Opus(전략) → `/end-opus` → Sonnet 세션에서 `/start-sonnet` → 구현 → `/end-sonnet` → 다음 세션

### forge-core — 하네스 관리 (v0.6.0 흡수)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/harness-legacy-scan` | `/harness-legacy-scan <경로>` | 레거시 하네스 패턴 탐지 |
| `/harness-diet` | `/harness-diet <경로>` | 불필요한 하네스 코드 정리 |
| `/external-harness-sweep` | `/external-harness-sweep <레포>` | 외부 하네스 레포 1:1 sweep (gstack/gsd/superpowers/gbrain) |
| `/agent-drift-auditor` | `/agent-drift-auditor` | 에이전트 드리프트 감사 — 의도 vs 실행 괴리 감지 |

### forge-core — AI 감사 시스템 (v0.6.0 흡수)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/system-audit` | `/system-audit` | Forge 전체 시스템 ACHCE 6축 감사 |
| `/audit-agentic` | `/audit-agentic <경로>` | 에이전틱 AI 역량 감사 (자율성·도구·MAS·성숙도) |
| `/audit-context` | `/audit-context <경로>` | 컨텍스트 엔지니어링 감사 (RAG·메모리·윈도우·지식 아키텍처) |
| `/audit-cost` | `/audit-cost <경로>` | AI 비용 효율 감사 (토큰 경제·라우팅·캐싱·추론 최적화) |
| `/audit-harness` | `/audit-harness <경로>` | AI 하네스 엔지니어링 감사 (평가·가드레일·옵저버빌리티) |
| `/audit-human-ai` | `/audit-human-ai <경로>` | Human-AI 경계 설계 감사 (자율성 레벨·에스컬레이션·게이트) |
| `/migration-audit` | `/migration-audit <경로>` | DB 마이그레이션 감사 |

`system-audit`이 스폰하는 6축 감사 에이전트(`advisor-strategist` + `axis-agentic`/`axis-context`/`axis-cost`/`axis-harness`/`axis-human-ai`)도 forge-core에 번들되어 있습니다.

### forge-build (개발자)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/qa` | `/qa` | QA 파이프라인 실행 |
| `/qa-setup` | `/qa-setup` | QA 환경 초기 설정 |
| `/healer` | `/healer` | 버그 자동 수정 |
| `/investigate` | `/investigate <증상>` | 버그 원인 분석 |
| `/api-e2e` | `/api-e2e` | API E2E 테스트 |
| `/playwright-cli` | `/playwright-cli` | Playwright 브라우저 테스트 |
| `/playwright-parallel-test` | `/playwright-parallel-test` | Playwright 병렬 테스트 |
| `/bug-report` | `/bug-report` | 버그 리포트 생성 |
| `/benchmark` | `/benchmark` | 성능 벤치마크 |
| `/canary` | `/canary` | 카나리 배포 모니터링 |
| `/forge-check-security` | `/forge-check-security` | 보안 체크 |
| `/spec-compliance-checker` | `/spec-compliance-checker` | Spec 준수 여부 검증 |
| `/inspection-checklist` | `/inspection-checklist` | 코드 인스펙션 체크리스트 |
| `/screenshot-analyze` | `/screenshot-analyze <이미지>` | 스크린샷 UI 분석 |
| `/codex-review` | `/codex-review <파일>` | Codex 단독 코드 리뷰 |
| `/forge-pge` | `/forge-pge <목표>` | Plan-Generate-Execute — 복잡한 구현 자동화 |
| `/forge-fix` | `/forge-fix <이슈설명>` | Hotfix 흐름으로 빠른 버그 처리 |
| `/forge-implement` | `/forge-implement` | Spec 기반 구현 (/spec-write → /forge-implement → /qa 순서) |
| `/forge-pr` | `/forge-pr` | PR 자동 생성 (Check 9 기준 검증 + gh pr create) |
| `/forge-check-traceability` | `/forge-check-traceability` | 추적성 체크 (Spec → 코드 → 테스트 연결 검증) |
| `/forge-check-ui` | `/forge-check-ui` | UI 품질 체크 (Lighthouse/a11y 기준) |

> **참고**: `/agent-drift-auditor`·`/migration-audit`는 `forge-core`(하네스/감사 흡수)에 있습니다.

### forge-build — 기획 (PM/기획자, v0.2.0 흡수)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/spec-write` | `/spec-write <기능명>` | Spec 문서 작성 |
| `/forge-spec` | `/forge-spec <기능 설명>` | Spec 작성 단독 실행 (옛 /sdd Phase 0~2) |
| `/prd` | `/prd <제품명>` | PRD 작성 |
| `/forge-plan` | `/forge-plan` | 기획 파이프라인 실행 |
| `/writing-plans` | `/writing-plans` | 기획서 작성 |
| `/requirements-clarity` | `/requirements-clarity` | 요구사항 명확화 |
| `/autoplan` | `/autoplan <목표>` | 자동 플랜 생성 |

### forge-knowledge (리서처)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/article` | `/article <URL>` | 기사 분석 |
| `/yt` | `/yt <URL>` | YouTube 영상 분석 |
| `/site-deep-analyze` | `/site-deep-analyze <URL>` | 사이트 심층 분석 |
| `/weekly-research` | `/weekly-research <주제>` | 주간 심층 리서치 파이프라인 |
| `/forge-find-item` | `/forge-find-item <아이템>` | 특정 항목 탐색 |

### forge-knowledge — 지식·메모리 (구 forge-brain)

| 스킬/커맨드 | 사용법 | 설명 |
|------------|--------|------|
| `/learn` | `/learn` | 세션 학습 내용을 learnings.jsonl에 기록 |
| `/wiki-sync` | `/wiki-sync` | Obsidian vault ↔ forge-outputs 양방향 동기화 |
| `/memory-manage` | `/memory-manage` | MEMORY.md 항목 추가·수정·삭제·GC |

> **참고**: RAG 검색(`/rag-search`)은 `forge-core`에 있습니다. `forge-knowledge`는 `forge-tools` MCP로 ADR-174 pgvector `unified_search`를 함께 제공합니다. `FORGE_DB_URL` 설정 시 자동 연동.

### forge-design (디자이너)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/figma-design-sync` | `/figma-design-sync` | Figma 디자인 동기화 |
| `/image-orchestrate` | `/image-orchestrate` | 이미지 생성 오케스트레이션 |

### forge-game (게임 개발자)

| 스킬 | 사용법 | 설명 |
|------|--------|------|
| `/game-qa` | `/game-qa` | 게임 QA 파이프라인 |
| `/game-asset-pipeline` | `/game-asset-pipeline` | 게임 에셋 파이프라인 |
| `/game-asset-generate` | `/game-asset-generate` | 게임 에셋 생성 |
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
/forge-spec 사용자 알림 기능
/forge-implement

# 세션 시작/종료
/start-sonnet
/end-sonnet

# 지식 검색
/rag-search ADR-174 통합 두뇌 설계 근거
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
bash $HOME/.claude/plugins/forge-core/hooks/forge-onboard.sh
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
├── .claude-plugin/marketplace.json    — 마켓플레이스 인덱스 (5개 플러그인)
├── forge-core/                        — (v0.6.0) 기반 + 하네스 정리 + AI 감사 흡수
│   ├── .claude-plugin/plugin.json
│   ├── skills/                        — 20개
│   │   ├── approve-worker/            — forge 승인 워커
│   │   ├── cr-multi/                  — 멀티 검수 오케스트레이터
│   │   ├── start-sonnet/ end-sonnet/ start-opus/ end-opus/ checkpoint/  — 세션관리 5종
│   │   ├── rag-search/                — 하이브리드 RAG 검색
│   │   ├── forge-loop-maker/          — Generic refinement loop
│   │   ├── harness-legacy-scan/ harness-diet/ external-harness-sweep/ agent-drift-auditor/  — 하네스 정리 4종
│   │   └── system-audit/ audit-agentic/ audit-context/ audit-cost/ audit-harness/ audit-human-ai/ migration-audit/  — 감사 7종
│   ├── agents/                        — 6개 (advisor-strategist + axis-agentic/context/cost/harness/human-ai)
│   ├── commands/                      — 25개 슬래시 커맨드
│   ├── hooks/
│   │   ├── forge-onboard.sh           — SessionStart 자동 실행
│   │   └── handover-manager.sh        — 핸드오버 원자적 쓰기 (flock)
│   └── rules/
│       ├── forge-core.md              — forge 전역 규칙
│       ├── behavior-core.md           — 자율실행·외과적변경·존댓말 등
│       └── tool-rules.md              — 도구 사용 정책
├── forge-build/                       — (v0.2.0) 구 forge-dev + forge-plan 통합
│   ├── .claude-plugin/plugin.json
│   ├── skills/                        — 19개 (qa/healer/investigate/api-e2e + spec-write계열/writing-plans/requirements-clarity/autoplan 등)
│   ├── commands/                      — 21개 (forge-implement/forge-qa/forge-fix/forge-pr + spec-write/forge-spec/prd/forge-plan 등)
│   └── agents/                        — 7개 (canary-judge/code-reviewer/cto-advisor/healer/performance-checker/spec-writer-base/ui-quality-checker)
├── forge-knowledge/                   — (v0.2.0) 구 forge-brain 개명 + forge-research 통합
│   ├── .claude-plugin/plugin.json
│   ├── skills/                        — learn/memory-manage/wiki-sync/site-deep-analyze/yt
│   ├── commands/                      — article/yt/site-deep-analyze/weekly-research/forge-find-item/learn/memory-manage/wiki-sync
│   ├── agents/                        — 7개 (academic-researcher/article-analyst/fact-checker/weekly-research-analyst/yt-cross-analyst/yt-research-followup/yt-video-analyst)
│   └── mcp/                           — forge-tools-server.py (ADR-174 unified_search)
├── forge-design/                      — (v0.1.5)
│   ├── skills/                        — figma-design-sync/image-orchestrate/visual-loop
│   └── agents/                        — doc-writer/gemini
└── forge-game/                        — (v0.1.2)
    ├── skills/                        — gdd/game-qa/game-asset-pipeline/asset-extract
    └── agents/                        — gdd-writer
```

---

## Changelog

### v0.3.0 (2026-07-07) — 플러그인 통합 9→5
- **forge-core v0.6.0**: 구 `forge-harness`(harness-legacy-scan/diet/external-sweep/agent-drift-auditor) + 구 `forge-audit`(system-audit/audit-agentic/context/cost/harness/human-ai/migration-audit) 흡수. axis-* 에이전트 6종(advisor-strategist 포함) 번들.
- **forge-build v0.2.0** 신규 (구 `forge-dev` 개명 + 구 `forge-plan` 흡수): 기획(spec-write/writing-plans/requirements-clarity/autoplan) + 구현·검증 파이프라인 통합. axis-* 에이전트는 forge-core로 이동, cto-advisor/spec-writer-base 신규 편입.
- **forge-knowledge v0.2.0** 신규 (구 `forge-brain` 개명 + 구 `forge-research` 흡수): brain(learn/memory-manage/wiki-sync) + research(article/yt/site-deep-analyze/weekly-research/forge-find-item) 통합. forge-tools MCP(ADR-174 unified_search) 유지.
- **forge-design v0.1.5**, **forge-game v0.1.2**: 통합 대상 제외, 현행 유지.
- 구 플러그인명(`forge-dev`/`forge-plan`/`forge-brain`/`forge-harness`/`forge-audit`/`forge-research`)은 더 이상 설치 대상이 아님 — 각 커맨드 슬래시(`/forge-plan` 등)는 새 플러그인 하위에서 그대로 유효.

### v0.2.1 (2026-07-04)
- **forge-research v0.1.6**: DEPRECATED orphan 스킬 `yt-analyze` 제거 (`/yt`·`daily-analyze`/`weekly-analyze`로 완전 대체, SSoT 없음)

### v0.2.0 (2026-06-29)
- **forge-harness v0.1.0** 신규: harness-legacy-scan/harness-diet/external-harness-sweep/agent-drift-auditor
- **forge-audit v0.1.0** 신규: system-audit(ACHCE 6축) + 단위 감사 5종(agentic/context/cost/harness/human-ai) + migration-audit
- **플러그인 패키지 7개 → 9개** 확장

### v0.1.4 / forge-brain v0.1.0 (2026-06-23)
- **forge-core v0.2.0**: 세션관리 5종 추가 (start/end-sonnet, checkpoint, start/end-opus), handover-manager.sh 번들
- **forge-dev v0.1.4**: workflow.js 동기화 확인 완료
- **forge-plan v0.1.2**: forge-spec 커맨드 추가 (옛 /sdd Phase 0~2 단독 실행)
- **forge-brain v0.1.0** 신규: learn/wiki-sync/memory-manage + ADR-174 pgvector 연동 (rag-search는 forge-core)

### v0.1.2 (2026-06-05)
- forge-core: B2 게이트 + gemini-text 레그 변경분 반영
- forge-dev: gemini-text MCP 정합 업데이트
- forge-research: `yt-analyze` 제거 (Tier C 개인 워크플로우, 팀 공용 아님)
- SHA-256 테스트 증명(AD-161) + MCP 파라미터 검증 반영

### v0.1.1 (2026-06-04)
- forge-plan / forge-design / forge-game: SSoT refresh (81개 항목 갱신)
- forge-design: `multiformat-image` 제거 (Tier D, image-orchestrate와 중복)
- forge-dev / forge-plan: 버전 bump (v0.1.0 → v0.1.1)

### v0.1.0 (2026-06-02)
- forge-core / forge-dev / forge-plan / forge-research / forge-design / forge-game 최초 패키징
- Marketplace 지원 (`.claude-plugin/marketplace.json`)
- forge-core 규칙 3종 번들: forge-core.md / behavior-core.md / tool-rules.md
- SessionStart 온보딩 훅: orch-token 자동 생성 + 규칙 설치
