# forge-core

> Forge 시스템의 핵심 인프라 — 모든 forge 플러그인의 공통 기반

**버전**: v0.6.0 | **의존성**: 없음 (기반 플러그인) | **레포**: `moongci38-oss/forge-plugins`

---

## 개요

`forge-core`는 forge 플러그인 패키지의 **필수 기반 플러그인**입니다. 다른 모든 forge 플러그인(`forge-knowledge`, `forge-build`, `forge-design` 등)은 forge-core에 의존합니다.

v0.6.0에서 구 `forge-harness`(하네스 정리 4종)와 구 `forge-audit`(system-audit ACHCE 6축 + 단위 감사 5종 + migration-audit)를 흡수해, 시스템 감사·하네스 관리까지 기반 플러그인 하나로 제공합니다.

단독으로도 다음을 제공합니다:

- **멀티-LLM 코드 검수** — Codex + Gemini 병렬 적대적 리뷰 (cr-* 커맨드 9종)
- **세션 관리** — Opus/Sonnet 세션 시작·종료·체크포인트 (5종)
- **지식 검색** — forge-outputs 벡터+BM25 하이브리드 RAG
- **멀티에이전트 승인 게이트** — HMAC 기반 MAS worker 승인
- **하네스 정리** — 레거시 패턴 탐지·다이어트·외부 하네스 sweep·에이전트 드리프트 감사
- **AI 시스템 감사** — system-audit(ACHCE 6축) + 단위 감사 5종(agentic/context/cost/harness/human-ai) + migration-audit
- **자동 온보딩** — SessionStart 훅으로 rules·디렉토리 자동 설치

---

## 설치

```bash
# Step 1 — Marketplace 등록 (최초 1회)
claude plugin marketplace add moongci38-oss/forge-plugins

# Step 2 — 플러그인 설치
claude plugin install forge-core

# Step 3 — Claude Code 재시작
```

설치 후 Claude Code 세션을 시작하면 `forge-onboard.sh`가 자동 실행되어 환경을 구성합니다.

---

## 자동 온보딩 (SessionStart 훅)

최초 세션 시작 시 `forge-onboard.sh`가 자동 실행됩니다:

```
[forge-onboard] orch-token.key 생성: ~/.config/forge/orch-token.key
[forge-onboard] rules 설치: forge-core.md
[forge-onboard] rules 설치: behavior-core.md
[forge-onboard] rules 설치: tool-rules.md
[forge-onboard] 디렉토리 생성: ~/.claude/handover/sonnet/
[forge-onboard] 디렉토리 생성: ~/.claude/handover/opus/
[forge-onboard] 디렉토리 생성: ~/.claude/checkpoints/
```

이미 설치된 항목은 자동으로 스킵됩니다. **온보딩은 한 번만 실행**됩니다.

---

## 스킬 목록

| 스킬 | 설명 | 트리거 |
|------|------|--------|
| `approve-worker` | HMAC 기반 MAS worker 승인 토큰 발행 | `/approve-worker` |
| `checkpoint` | Mid-session 컨텍스트 체크포인트 저장 | `/checkpoint`, 토큰 70%+ |
| `cr-multi` | Multi-LLM 병렬 코드 검수 오케스트레이터 | `/cr-multi`, `/cr-double`, `/cr-triple` |
| `end-opus` | Opus 전략 세션 종료 + handover 작성 | `/end-opus` |
| `end-sonnet` | Sonnet 구현 세션 종료 + handover 작성 | `/end-sonnet` |
| `forge-loop-maker` | Generic goal-feedback refinement loop scaffold | 반복 개선 태스크 |
| `rag-search` | forge-outputs 벡터+BM25 하이브리드 의미 검색 | `/rag-search` |
| `start-opus` | Opus 전략 세션 시작 + 컨텍스트 로드 | `/start-opus` |
| `start-sonnet` | Sonnet 구현 세션 시작 + 컨텍스트 로드 | `/start-sonnet` |
| `harness-legacy-scan` | 레거시 하네스 패턴·중복·과대 전역컨텍스트 읽기전용 감사 | `/harness-legacy-scan` |
| `harness-diet` | harness-legacy-scan low-risk 항목 정리 적용 | `/harness-diet` |
| `external-harness-sweep` | 외부 하네스 레포(gstack/gsd/superpowers/gbrain) 1:1 sweep | `/external-harness-sweep` |
| `agent-drift-auditor` | 에이전트 드리프트 감사 — 의도 vs 실행 괴리 감지 | `/agent-drift-auditor` |
| `system-audit` | Forge 전체 시스템 ACHCE 6축 통합 감사 | `/system-audit` |
| `audit-agentic` | 에이전틱 AI 역량 감사 (자율성·도구·MAS) | `/audit-agentic` |
| `audit-context` | 컨텍스트 엔지니어링 역량 감사 (RAG·메모리) | `/audit-context` |
| `audit-cost` | AI 비용 효율 감사 (모델 라우팅·캐싱) | `/audit-cost` |
| `audit-harness` | AI 하네스 엔지니어링 감사 (Check Chain·가드레일) | `/audit-harness` |
| `audit-human-ai` | Human-AI 경계 설계 감사 (자율성 레벨·게이트) | `/audit-human-ai` |
| `migration-audit` | 레거시→신규 스택 마이그레이션 검수 하네스 | `/migration-audit` |

### approve-worker

HMAC-SHA256 서명 토큰을 발행하여 멀티에이전트 시스템(MAS)의 worker 승인을 처리합니다.

```
/approve-worker {task_id} {worker} {allowed_tools} {target_paths}
```

- 승인 토큰 저장 경로: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/audit/approvals/{task_id}-{nonce}.yaml`
- MAS P0 approval gate에서 필수 선행 단계
- 사용자 TTY에서 직접 실행 (자동화 금지)

### checkpoint

컨텍스트 토큰이 70~90%에 도달하거나 `/compact` 전에 현재 세션 상태를 스냅샷으로 저장합니다.

```
/checkpoint
```

저장 내용: 진행 중 태스크, 완료 목록, 다음 스텝, 블로커, 열린 파일

저장 경로: `$HOME/.claude/checkpoints/YYYY-MM-DD-HH-MM.md`

`/compact` 후 '계속' 또는 'resume' 입력 시 체크포인트 자동 복원.

> **vs end-sonnet**: checkpoint는 세션 종료 없이 토큰만 관리하는 경량 도구입니다.

### cr-multi

Codex(GPT) + Gemini를 병렬로 실행하여 단일 모델 맹점을 보완하는 멀티-LLM 코드 검수입니다.

| 모드 | 모델 | 사용 시점 |
|------|------|---------|
| `double` | Codex + Gemini | 일반 검수 (기본) |
| `triple` | Opus + Codex + Gemini | 중요 Spec·PR, plateau 감지 시 |

특징:
- 가중 스코어 병합 (Opus 0.35 / Codex 0.35 / Gemini 0.3)
- 중복 제거 + confidence 스코어링
- plateau 3회 → 자동 triple 승격
- Completeness Critic 포함

**필수 조건**: `GEMINI_API_KEY` 환경변수 + Codex MCP 설정

### rag-search

forge-outputs 문서에서 키워드가 아닌 **의미(semantic)** 기반으로 검색합니다.

```
/rag-search <질문>
```

예시:
```
/rag-search 투자 유치 전략
# → "VC 라운드", "시드 펀딩", "민간투자" 등 동의어까지 검색

/rag-search ADR-174 통합 두뇌 설계 근거
# → 관련 ADR 문서, 회의록, 기획서 반환
```

`FORGE_DB_URL` 설정 시 ADR-174 pgvector unified_search (e5-small 384d) 자동 연동. 미설정 시 로컬 FAISS 폴백.

### forge-loop-maker

QA/버그/마이그레이션 전용 루프 이외의 **새 도메인**에서 worker-evaluator 분리로 iterative 개선을 수행합니다.

사용 사례:
- 문서 정제 (목표 rubric까지 반복 개선)
- 리서치 수렴 (다각도 탐색 → 합의)
- 프롬프트 튜닝 (평가자 격리로 self-grade 방지)

### 하네스 정리 4종 (v0.6.0 흡수, 구 forge-harness)

| 스킬 | 설명 |
|------|------|
| `harness-legacy-scan` | 낡은 룰·중복·과대 전역컨텍스트·넓은 Skill·불필요 Hook/MCP를 읽기전용으로 분류 |
| `harness-diet` | harness-legacy-scan low-risk 항목만 적용(CLAUDE.md 축소·절차→Skill 이동·삭제후보 archive) |
| `external-harness-sweep` | 외부 하네스/스킬 레포(gstack/gsd/superpowers/gbrain)를 Forge와 1:1 대조해 adoption matrix 생성 |
| `agent-drift-auditor` | 에이전트/스킬의 의도 vs 실제 실행 괴리를 감지 |

### AI 감사 시스템 7종 (v0.6.0 흡수, 구 forge-audit)

| 스킬 | 설명 |
|------|------|
| `system-audit` | ACHCE(Agentic/Context/Harness/Cost/Human-AI) 5개 축 + Redundancy 병렬 감사, 3-LLM adversarial 검증 |
| `audit-agentic` | 에이전틱 AI 역량 감사 — 자율성·도구 사용·멀티에이전트 조정 |
| `audit-context` | 컨텍스트 엔지니어링 역량 감사 — 7-layer 체크리스트·RAG 성숙도·메모리 시스템 |
| `audit-cost` | AI 비용 효율 감사 — 모델 라우팅·프롬프트 캐싱·배치 처리·토큰 예산 |
| `audit-harness` | AI 하네스 엔지니어링 감사 — Check Chain·OWASP Agentic Top 10·가드레일·Hook 커버리지 |
| `audit-human-ai` | Human-AI 경계 설계 감사 — 5-Level Autonomy·에스컬레이션 트리거·게이트 설계 |
| `migration-audit` | 레거시→신규 스택 마이그레이션 검수 — legacy=SSoT 원칙, audit→fix→re-audit 자율 반복 |

---

## 에이전트 목록

`forge-core` 설치 시 다음 전문 에이전트들이 번들됩니다.

| 에이전트 | 역할 |
|---------|------|
| `advisor-strategist` | Opus 기반 전용 조언자 — 실행자 판단 지점에서 400~700 토큰 핵심 전략 조언 |
| `axis-agentic` | 에이전틱 AI 역량 감사 (자율성·도구 사용·MAS 조정) — CLEAR/Sema4.ai 프레임워크 |
| `axis-context` | 컨텍스트 엔지니어링 감사 (RAG·메모리·컨텍스트 윈도우) — 7-Layer/RAGAS/ACE-FCA |
| `axis-cost` | AI 비용 효율 감사 (토큰 경제·모델 라우팅·캐싱) — RouteLLM/CEBench/Epoch AI |
| `axis-harness` | AI 하네스 엔지니어링 감사 (평가 체계·가드레일·옵저버빌리티) — CLEAR/OTel/OWASP |
| `axis-human-ai` | Human-AI 경계 설계 감사 (자율성 레벨·에스컬레이션·게이트) — 5-Level Autonomy/TCMM |

> `system-audit`은 위 axis-* 5종 + `advisor-strategist`를 병렬 스폰해 종합 리포트를 생성합니다.

---

## 커맨드 목록

### cr-* 검수 커맨드

> **필수 조건**: `GEMINI_API_KEY` + Codex MCP 없으면 cr-* 동작 안 됩니다.

| 커맨드 | 설명 | Blocking |
|--------|------|----------|
| `/cr-triple` | Opus + Codex + Gemini 3-worker 검수 | 선택 |
| `/cr-double` | Codex + Gemini 2-worker 검수 | 선택 |
| `/cr-multi <파일>` | double/triple 통합 오케스트레이터 | 선택 |
| `/cr-code <파일>` | 코드 변경 전용 검수 | 권고 |
| `/cr-plan <파일>` | 계획서/Spec/ADR 검수 | non-blocking (AD-50) |
| `/cr-bug <파일>` | 버그 수정 patch 검수 | 권고 |
| `/cr-test <파일>` | E2E 테스트 시나리오 검수 | 권고 |
| `/cr-analysis <파일>` | 분석 문서·backlog 검수 | 비차단 |
| `/cr-final <PR번호>` | PR 머지 직전 최종 검수 | **blocking** |

```bash
# 예시
/cr-double src/auth/login.ts
/cr-triple docs/specs/auth-spec.md
/cr-final 42
```

### 세션 관리 커맨드

| 커맨드 | 설명 |
|--------|------|
| `/start-sonnet` | Sonnet 구현 세션 시작 — handover 읽기 + 태스크 목록 출력 |
| `/end-sonnet` | Sonnet 세션 종료 — handover 작성 + learnings 기록 |
| `/start-opus` | Opus 전략 세션 시작 — handover 읽기 + 전략 큐 요약 |
| `/end-opus` | Opus 세션 종료 — ADR 인수인계 + 장기기억 업데이트 |
| `/checkpoint` | Mid-session 체크포인트 저장 (/compact 전 사용) |
| `/forge-resume` | 마지막 체크포인트에서 세션 재개 |

**세션 흐름**:
```
Opus 전략 세션
  → /end-opus (ADR + handover 저장)

새 Sonnet 세션
  → /start-sonnet (handover 로드)
  → 구현 작업
  → (토큰 70%+) /checkpoint → /compact → /forge-resume
  → /end-sonnet (handover + learnings 저장)
```

### 하네스 관리 커맨드 (v0.6.0 흡수)

| 커맨드 | 설명 |
|--------|------|
| `/harness-legacy-scan` | Forge 하네스 읽기전용 레거시 감사 |
| `/harness-diet` | low-risk 항목만 정리 적용 |
| `/external-harness-sweep` | 외부 하네스 레포 1:1 source sweep |

### AI 감사 커맨드 (v0.6.0 흡수)

| 커맨드 | 설명 |
|--------|------|
| `/migration-audit` | 레거시→신규 스택 마이그레이션 감사 |

> `/system-audit`, `/audit-agentic`, `/audit-context`, `/audit-cost`, `/audit-harness`, `/audit-human-ai`, `/agent-drift-auditor`는 스킬 트리거로 호출됩니다(전용 커맨드 없음, `/system-audit` 등 스킬명으로 자동 인식).

### 기타 커맨드

| 커맨드 | 설명 |
|--------|------|
| `/approve-worker` | MAS P0 worker 승인 토큰 발행 |
| `/advisor` | Opus advisor + Sonnet/Haiku 실행자 결합 (MAS P1) |
| `/rag-search <질문>` | forge-outputs 지식 베이스 하이브리드 검색 |
| `/forge-fast` | 소규모(≤3파일) 변경 즉시 실행·커밋 |
| `/forge-sync` | Forge 중앙 저장소 → 프로젝트 동기화 |
| `/forge-milestone-close` | 마일스톤 종료 — 회고 7섹션 + handover 생성 |
| `/forge` | Forge Dev 워크플로우 Part B 진입 (P4→P7) |

---

## MCP 설정 (cr-* 사용 시 필수)

### Step 1 — API 키 설정

```bash
# ~/.bashrc 또는 ~/.zshrc
export GEMINI_API_KEY="AIza..."
export OPENAI_API_KEY="sk-..."   # Codex MCP용
```

### Step 2 — ~/.claude.json MCP 등록

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
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  }
}
```

### Step 3 — Claude Code 재시작

MCP 등록 후 재시작해야 cr-* 커맨드가 활성화됩니다.

> MCP 없이도 세션 관리·checkpoint·rag-search·forge-loop는 정상 동작합니다.

---

## 자동 로드 규칙 (Rules)

설치 후 모든 세션에 자동 로드되는 행동 규칙입니다:

| 파일 | 내용 |
|------|------|
| `forge-core.md` | Git 규칙·보안·산출물 경로·병렬 실행 전략 |
| `behavior-core.md` | 자율실행·7단계 재사용 사다리·외과적 변경·Anti-Sycophancy |
| `tool-rules.md` | 스킬 발동 1% 임계값·도구 사용 정책 |

---

## 빠른 시작

```bash
# 설치
claude plugin marketplace add moongci38-oss/forge-plugins
claude plugin install forge-core

# 세션 시작
/start-sonnet

# 코드 검수
/cr-double src/auth/login.ts

# 지식 검색
/rag-search 인증 토큰 만료 이슈

# 체크포인트 (토큰 절약)
/checkpoint

# 세션 종료
/end-sonnet
```

---

## 파일 구조

```
forge-core/
├── .claude-plugin/
│   └── plugin.json          — 플러그인 매니페스트 (v0.6.0)
├── skills/                  — 20개
│   ├── approve-worker/      — MAS P0 승인 게이트
│   ├── checkpoint/          — Mid-session 체크포인트
│   ├── cr-multi/            — Multi-LLM 검수 오케스트레이터
│   ├── end-opus/            — Opus 세션 종료
│   ├── end-sonnet/          — Sonnet 세션 종료
│   ├── forge-loop-maker/    — Generic refinement loop scaffold
│   ├── rag-search/          — 하이브리드 RAG 검색
│   ├── start-opus/          — Opus 세션 시작
│   ├── start-sonnet/        — Sonnet 세션 시작
│   ├── harness-legacy-scan/ — 레거시 하네스 감사 (구 forge-harness)
│   ├── harness-diet/        — low-risk 하네스 정리 적용
│   ├── external-harness-sweep/ — 외부 하네스 레포 1:1 sweep
│   ├── agent-drift-auditor/ — 에이전트 드리프트 감사
│   ├── system-audit/        — ACHCE 6축 통합 감사 (구 forge-audit)
│   ├── audit-agentic/       — 에이전틱 AI 역량 감사
│   ├── audit-context/       — 컨텍스트 엔지니어링 감사
│   ├── audit-cost/          — AI 비용 효율 감사
│   ├── audit-harness/       — AI 하네스 엔지니어링 감사
│   ├── audit-human-ai/      — Human-AI 경계 설계 감사
│   └── migration-audit/     — 마이그레이션 검수 하네스
├── agents/                  — 6개 (advisor-strategist + axis-agentic/context/cost/harness/human-ai)
├── commands/                — 25개 슬래시 커맨드
├── hooks/
│   ├── forge-onboard.sh     — SessionStart 자동 온보딩
│   └── handover-manager.sh  — 핸드오버 원자적 쓰기 (flock)
└── rules/
    ├── forge-core.md
    ├── behavior-core.md
    └── tool-rules.md
```

---

## Changelog

### v0.6.0 (2026-07-07)
- 구 `forge-harness`(harness-legacy-scan/diet/external-sweep/agent-drift-auditor) 흡수
- 구 `forge-audit`(system-audit ACHCE 6축 + 단위 감사 5종 + migration-audit) 흡수
- `advisor-strategist` + `axis-agentic`/`axis-context`/`axis-cost`/`axis-harness`/`axis-human-ai` 에이전트 6종 번들 추가

### v0.2.0 (2026-06-23)
- 세션 관리 5종 추가: start/end-sonnet, start/end-opus, checkpoint
- `handover-manager.sh` 번들 (flock 기반 원자적 쓰기)
- forge-loop 스킬 추가 (Generic refinement loop)

### v0.1.0 (2026-06-02)
- forge-core 최초 패키징
- cr-multi / approve-worker / rag-search 번들
- SessionStart 온보딩 훅 + 규칙 3종 자동 설치
