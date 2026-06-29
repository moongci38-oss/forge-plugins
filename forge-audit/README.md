# forge-audit

Forge AI 시스템 통합 감사 플러그인. **ACHCE 5축 평가 프레임워크** 기반으로 Agentic·Context·Harness·Cost·Human-AI 경계 전반을 단일 오케스트레이터로 감사하고, 레거시→신규 스택 마이그레이션 정합성을 검증합니다.

> **버전**: v0.1.0 | **의존성**: forge-core

---

## 설치

```bash
claude plugin marketplace add moongci38-oss/forge-plugins
claude plugin install forge-core      # 필수 (의존성)
claude plugin install forge-audit
```

---

## ACHCE 5축 감사 프레임워크

| 축 | 이름 | 측정 대상 |
|----|------|----------|
| A | **Agentic** | 컴포저블 패턴, ACI, Agent Evals, 멀티에이전트 조율 |
| C | **Context** | 7-레이어 컨텍스트 설계, RAG, 메모리 아키텍처 |
| H | **Harness** | 측정·제어·보안, OWASP ASI01-ASI09 커버리지 |
| C | **Cost** | 모델 라우팅, 프롬프트 캐싱, 비용 추적 |
| E | **Human-AI** | 5단계 자율성, 게이트 커버리지, 에스컬레이션 설계 |
| R | **Redundancy** (보조) | 중복 정의, 데드코드, 사용하지 않는 스킬 감지 |

---

## 언제 사용하나요?

| 상황 | 사용 스킬/커맨드 |
|------|----------------|
| 전체 AI 시스템 종합 감사 | `/system-audit` |
| Agentic 패턴 설계 검증 | `/audit-agentic` (독립 실행) |
| 컨텍스트 엔지니어링 점검 | `/audit-context` (독립 실행) |
| 비용 효율 분석 | `/audit-cost` (독립 실행) |
| 하네스·보안 검사 | `/audit-harness` (독립 실행) |
| Human-AI 경계 설계 검토 | `/audit-human-ai` (독립 실행) |
| 레거시→신규 스택 마이그레이션 검수 | `/migration-audit <legacy> <migrated>` |

---

## 스킬 목록

### system-audit

ACHCE 5축 + Redundancy 감지를 단일 오케스트레이터로 실행하는 **통합 감사** 스킬. 6개 audit-* 스킬을 병렬 스폰하고 결과를 종합합니다.

**실행 순서**

```
Phase 1: 병렬 감사 스폰
  ├── audit-agentic   → Agentic 패턴 평가
  ├── audit-context   → 컨텍스트 레이어 평가
  ├── audit-harness   → 하네스 보안 평가
  ├── audit-cost      → 비용 효율 평가
  ├── audit-human-ai  → Human-AI 경계 평가
  └── redundancy-scan → 중복 감지 (grep 기반)

Phase 2: 종합 리포트 생성
  ├── 6축 점수 집계 (0~100)
  ├── CRITICAL/HIGH/MEDIUM/LOW 이슈 분류
  └── 우선순위 개선 권고안

Phase 3: Evaluator 2차 검증 (자기평가 편향 방지)
```

**평가 판정**

| 점수 | 판정 | 의미 |
|------|------|------|
| 80+ | PASS | 배포 가능 |
| 60~79 | WARN | 개선 권고 후 배포 허용 |
| 40~59 | REVIEW | 주요 이슈 수정 후 재심 |
| 0~39 | FAIL | 즉시 수정 필요 |

**사용법**
```
/system-audit
/system-audit --scope=agentic,cost        # 특정 축만
/system-audit --budget=200000             # 토큰 예산 제한
/system-audit --fix=propose               # 이슈별 수정 제안 포함
```

**산출물**
```
docs/reviews/audit/{date}-system-audit/
├── system-audit-report.md              — 6축 종합 리포트
├── agentic-audit-{date}.md             — Agentic 세부
├── context-audit-{date}.md             — Context 세부
├── harness-audit-{date}.md             — Harness 세부
├── cost-audit-{date}.md                — Cost 세부
└── human-ai-audit-{date}.md            — Human-AI 세부
```

---

### audit-agentic

**Anthropic Composable Patterns** 기준 Agentic AI 설계 감사.

**감사 항목**

| 카테고리 | 세부 항목 |
|---------|---------|
| 컴포저블 패턴 | Prompt Chaining / Routing / Parallelization / Orchestrator-Workers / Evaluator-Optimizer |
| ACI 설계 | Tool 커버리지, 사용 가능 인터페이스, 부재 Tool 탐지 |
| Agent Evals | Evaluator subagent 존재 여부, evals.json fixture |
| 멀티에이전트 조율 | Wave 의존 설계, 충돌 방지 패턴, 고아 Agent 탐지 |
| 메모리 아키텍처 | 단기 메모리(컨텍스트), 장기 메모리(learnings.jsonl/MEMORY.md) |
| AgentOps | 모니터링, trace ID, TTFT 기록 |

**반환 형식**
```json
{
  "score": 78,
  "patterns": {
    "detected": ["Orchestrator-Workers", "Evaluator-Optimizer"],
    "missing": ["Parallelization"]
  },
  "tool_coverage_rate": 0.82,
  "orphan_agents": ["old-spec-writer"],
  "issues": [
    {"severity": "HIGH", "item": "Evaluator-Optimizer 미구현 스킬 3개"}
  ]
}
```

**사용법**
```
/audit-agentic
/audit-agentic --scope=patterns           # 컴포저블 패턴만
/audit-agentic --scope=aci                # ACI 설계만
```

---

### audit-context

**7-레이어 컨텍스트 엔지니어링** 감사. 컨텍스트 포화 갭, 메모리 분류, 룰 중복을 측정합니다.

**감사 10개 체크포인트**

| # | 체크포인트 | 측정 기준 |
|---|-----------|---------|
| 1 | System Prompt Design | CLAUDE.md + rules 적재 최적화 |
| 2 | Short-Term Memory | 컨텍스트 활용 효율 |
| 3 | Long-Term Memory | learnings.jsonl / MEMORY.md 분류 정확도 |
| 4 | RAG (Just-in-Time Retrieval) | 적재 타이밍 최적화 |
| 5 | Tool Definition 최적화 | .mcp.json 경량화 여부 |
| 6 | Context Compaction | `/compact` 트리거 적절성 |
| 7 | Sub-Agent 아키텍처 | 격리 패턴, 컨텍스트 오염 방지 |
| 8 | Progressive Disclosure | 3단계(Passive/Active/Deep) 구현 여부 |
| 9 | Structured Note-Taking | 세션 상태 관리 패턴 |
| 10 | Prompt Structure | Role/Context/Output 3요소 포함율 |

**사용법**
```
/audit-context
/audit-context --layer=memory             # 메모리 레이어만
/audit-context --layer=rag                # RAG만
```

---

### audit-cost

**AI 비용 효율** 감사. RouteLLM/CEBench 기준 모델 라우팅, 캐싱, 낭비 패턴을 측정합니다.

**측정 항목**

| 항목 | 기준 |
|------|------|
| 모델 라우팅 | Opus/Sonnet/Haiku 3계층 분담 준수율 |
| 프롬프트 캐싱 | 80~90% 절감 가능 지점 탐지 |
| 조건부 로딩 | Progressive Disclosure 효율 (불필요 cascade 부담) |
| MCP vs CLI 전환 | MCP 대비 CLI 전환 가능 비율 |
| 비용 추적 | CPT, P95 토큰 플래그, 배치 비율 |
| 낭비 패턴 | 전체 파일 불필요 Read, 중복 쿼리, 과도한 checkpoint |
| 미사용 스킬 비용 | 등록만 되고 미사용 스킬 추정 비용 |

> **모델**: Haiku 우선(비용 감사 경량화). FAIL 시 자동으로 Sonnet으로 업그레이드 재시도.

**사용법**
```
/audit-cost
/audit-cost --scope=routing               # 모델 라우팅만
/audit-cost --scope=caching               # 캐싱만
```

---

### audit-harness

**AI 하네스 엔지니어링** 감사. 측정·제어·보안 3축을 OWASP ASI01-ASI09 기준으로 평가합니다.

**감사 영역**

| 영역 | 세부 항목 |
|------|---------|
| 위험 기반 하네스 두께 | 고위험=thick / 중위험=standard / 저위험=thin 적용 여부 |
| Check Chain | 4+ 스테이지, autoFix 한계, Brain-Hands 아키텍처 |
| Guardrails (5종) | Input / Output / Execution / Dialog / Retrieval |
| OWASP Agentic Top 10 | ASI01~ASI09 커버리지 측정 |
| Hook 커버리지 | 8종 위험 이벤트 타입 훅 존재 여부 |
| AI Evals 커버리지 | Evaluator subagent 존재, PGE 패턴 |
| 관찰 가능성 | 로깅, trace ID, TTFT 모니터링 |
| 롤백 아키텍처 | 3단계 롤백 설계 |
| 유지보수 에이전트 | 주기적 검토, 자동화 에스컬레이션 |

**탐지 패턴**

| 패턴명 | 설명 |
|--------|------|
| Hook Theater | 항상 exit 0 반환하는 무의미 훅 |
| Enforcement 갭 | WARN만 있고 metrics 없는 강제 없는 룰 |
| 하네스 없는 CRITICAL 스킬 | 높은 위험 스킬에 Evaluator/PGE 미적용 |

**사용법**
```
/audit-harness
/audit-harness --scope=owasp              # OWASP 커버리지만
/audit-harness --scope=hooks              # Hook 감사만
```

---

### audit-human-ai

**Human-AI 경계 설계** 감사. 자율성 과잉/부족, [STOP] 게이트 누락, 에스컬레이션 설계를 평가합니다.

**5단계 자율성 레벨**

| 레벨 | 이름 | 설명 |
|------|------|------|
| L1 | Operator | 모든 액션 사전 승인 |
| L2 | Supervised | 고위험만 승인 |
| L3 | Collaborative | AI 주도, Human 검토 |
| L4 | Automated | 예외 상황만 에스컬레이션 |
| L5 | Observer | Human = 모니터링만 |

**감사 항목**

| 항목 | 기준 |
|------|------|
| 게이트 커버리지 | [STOP] Hard Stop 존재, AUTO-PASS 게이트 적절성 |
| 에스컬레이션 트리거 5종 | 신뢰도 기반 / 가역성 기반 / 위험 도메인 / 이상 감지 / 감정 |
| 안티패턴 탐지 | 형식적 HITL / 가짜 주도권 / 고무도장 / 알람 피로 |
| 메트릭 추적 | Override Rate / Rubber-Stamp Rate / Gate Bypass Rate |

**사용법**
```
/audit-human-ai
/audit-human-ai --scope=gates             # 게이트 커버리지만
/audit-human-ai --scope=escalation        # 에스컬레이션만
```

---

### migration-audit

레거시 스택 → 신규 스택 **100% 마이그레이션 정합성** 검증. **Legacy = SSoT** 원칙 기반 7 Phase 하네스.

**7 Phase 실행 흐름**

| Phase | 이름 | 설명 |
|-------|------|------|
| 1 | Inventory | 레거시 전체 기능 목록화 |
| 2 | Event Coverage | 이벤트 커버리지 갭 탐지 |
| 3 | Logic Diff | 비즈니스 로직 1:1 대조 |
| 4 | DB/Contract 검증 | 데이터베이스 스키마 + API 계약 일치 여부 |
| 5 | 멀티 적대적 리뷰 | 독립 검수 에이전트 3종 병렬 검토 |
| 6 | 리포트 + Bug 등록 | MIGRATION-DRIFT 자동 버그 등록 |
| 7 | PEV 루프 | fix → re-audit 100% sync까지 반복 |

**3-Bucket 분류**

| Bucket | 의미 | 조치 |
|--------|------|------|
| `MIGRATION-DRIFT` | 신규 스택이 레거시를 누락/변형 | 즉시 수정 |
| `KNOWN-DIVERGENCE` | 의도된 설계 변경 (문서화 필요) | 문서화 후 승인 |
| `LEGACY-BUG-CANDIDATE` | 레거시 자체 버그 (수정 불필요) | 레거시 버그 로그 |

**Oracle 검증 2종**

| 유형 | 설명 | 대상 |
|------|------|------|
| Golden Test | 순수 함수 단위 비교 | 계산 로직, 변환 함수 |
| Black-box Trace | 실제 요청/응답 추적 비교 | 사이드 이펙트, DB 쓰기 |

**종료 조건 (PEV 루프)**

모든 조건 동시 충족 시 루프 종료:
- `CRITICAL + HIGH == 0`
- `Golden Test 100% PASS`
- `Regression Test 0건`
- `UNVERIFIED == 0`

**사용법**
```
/migration-audit <legacy-path> <migrated-path> [옵션]

# 예시
/migration-audit matgo/server/legacy matgo/server/src --stack=node-nest
/migration-audit baduggi/server/legacy baduggi/server/src --stack=node-nest --fix=propose
/migration-audit matgo/server/legacy matgo/server/src --scope=events
```

**옵션**

| 옵션 | 값 | 설명 |
|------|-----|------|
| `--stack` | `node-nest`, `php-nest` | 마이그레이션 스택 |
| `--scope` | `full`, `domain`, `events` | 감사 범위 |
| `--fix` | `off`, `propose`, `auto` | 수정 모드 |

**마일스톤 게이트**
```
M1 (탐지 리포트 완료) → [STOP] 사용자 확인
M2 (Golden Test 작성)
M3 (Black-box Trace 검증)
M4+ (PEV 루프 — fix & re-audit)
```

**산출물**
```
<migrated-path>/../docs/migration-audit/<name>/
├── drift-report.md          — MIGRATION-DRIFT 목록
├── known-divergence.md      — 의도된 차이 문서
├── legacy-bugs.md           — 레거시 버그 후보
├── golden-tests/            — 순수 함수 golden test
└── trace-log/               — black-box 추적 로그
```

---

## 커맨드

| 커맨드 | 사용법 | 설명 |
|--------|--------|------|
| `/system-audit` | `/system-audit [--scope] [--budget] [--fix]` | ACHCE 6축 통합 감사 |
| `/migration-audit` | `/migration-audit <legacy> <migrated> [--stack] [--scope] [--fix]` | 마이그레이션 정합성 검수 |

---

## 산출물 경로

```
docs/reviews/audit/
├── {date}-system-audit/
│   ├── system-audit-report.md
│   ├── agentic-audit-{date}.md
│   ├── context-audit-{date}.md
│   ├── harness-audit-{date}.md
│   ├── cost-audit-{date}.md
│   └── human-ai-audit-{date}.md
└── migration-audit/
    └── <project-name>/
        ├── drift-report.md
        ├── known-divergence.md
        └── legacy-bugs.md

docs/bug_report/
└── BUG-NNN-migration-drift-*.md   — 자동 등록된 버그
```

---

## 빠른 시작

```bash
# 전체 시스템 감사 (권장 월간 실행)
/system-audit

# 특정 축만 감사
/audit-cost                    # 비용 점검
/audit-harness --scope=owasp   # 보안 점검

# 마이그레이션 검수
/migration-audit legacy/ src/ --stack=node-nest --fix=propose
```

---

## Changelog

### v0.1.0
- 초기 릴리스
- system-audit: ACHCE 6축 통합 오케스트레이터
- audit-agentic: Composable Patterns + ACI + Agent Evals
- audit-context: 7-레이어 컨텍스트 설계 + RAG + 메모리
- audit-cost: RouteLLM/CEBench 기준 비용 효율
- audit-harness: OWASP ASI01-ASI09 + Hook 커버리지
- audit-human-ai: 5단계 자율성 + 에스컬레이션 설계
- migration-audit: Legacy↔Src 100% sync 검증 (7 Phase PEV)
