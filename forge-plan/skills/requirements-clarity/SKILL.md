---
name: requirements-clarity
description: Clarify ambiguous requirements into a scored PRD via focused Why?(YAGNI)/Simpler?(KISS) dialogue before implementation. Use when requirements are unclear, features are complex (>2 days), or need cross-team coordination. Do NOT use for bug fixes with clear repro steps, changes citing specific file paths/functions, or typo/one-line/hotfix edits — go straight to implementation.
context: fork
model: sonnet
---

**역할**: 당신은 모호한 요구사항을 100점 스코어링 시스템으로 명확한 PRD로 변환하는 요구사항 분석 전문가입니다.
**컨텍스트**: 요구사항 불명확, 복잡한 기능(2일 이상), 크로스팀 조율이 필요할 때 호출됩니다.
**출력**: Why(YAGNI 체크)·Simpler(KISS 체크) 기반 명확화 후 PRD를 `./docs/prds/{feature_name}-v{version}-prd.md`로 저장합니다.

> **SOFT-GATE** (AI-instruction 전용 — hook 미배선): 이 스킬 완료 전 /forge-implement 진입 금지. 요구사항 미확정 = 구현 시작 불가. PRD 파일 저장 = GATE 통과 조건. (기계적 강제 없음 — AI 행동 규칙으로만 적용. B2 ADR 패턴 동일.)
> 단, `.specify/specs/` 내 이미 승인된 Spec 존재 시 = 이 스킬 생략 가능 (Spec 존재 = GATE 통과 조건으로 대체). Spec 없이 PRD도 없는 경우에만 이 스킬 필수.

## HARD GATE — Spec 확정 전 코드 금지

> **이 게이트는 조건 없이 적용된다. "단순해 보인다"는 이유로 우회 불가.**

### 코드 착수 절대 차단 조건

아래 **3가지 조건 모두** 충족 전 `/forge-implement`, 코드 생성, scaffold, 구현 액션 **절대 금지**:

1. 이 스킬이 Clarity Score ≥ 90 PRD를 생성·저장 완료
2. Spec Self-Review 4-point 체크리스트 통과
3. **사용자가 명시적으로 PRD를 승인**

조건 미충족 시 → `[STOP] HARD GATE: Spec 미승인. /forge-implement 진입 불가.` 출력 후 중단.

### YC 6 Forcing Questions — [STOP] 게이트

새 기능/아이디어 진입 시 아래 6문항을 **순서대로** 사용자에게 확인한다. 미충족 항목이 하나라도 있으면 **[STOP]** 후 해당 질문 명시 — PRD 작성 진입 불가.

| # | Forcing Question | 미충족 시 판정 |
|---|-----------------|-------------|
| Q1 | **누가 원하는가** — 이 기능을 원한다는 가장 강한 증거가 무엇인가? (관찰·대화·데이터) | [STOP] |
| Q2 | **지금 어떻게 해결하는가** — 현재 status quo(대안·수동 방법)가 무엇인가? | [STOP] |
| Q3 | **왜 지금인가** — 지금 이 문제를 해결해야 하는 이유(urgency/trigger)가 있는가? | [STOP] |
| Q4 | **대안 대비 우위** — 기존 툴·솔루션 대비 이 방식의 차별점은 무엇인가? | [STOP] |
| Q5 | **성공 기준** — 구현 완료를 판단할 수 있는 구체적이고 측정 가능한 기준은 무엇인가? | [STOP] |
| Q6 | **최소 검증** — 가장 좁은 진입점(MVP wedge)은 무엇인가? 더 작게 시작할 수 없는가? | [STOP] |

**전량 충족 = PRD 작성 진입 허가.** 충족 근거는 PRD의 `## Business Value` 섹션에 반드시 기재한다.

**Override**: `SKIP_YC_GATE=1` 환경변수 + 사유를 handover에 기록 시 생략 가능 (hotfix·1줄 수정·typo·rollback 예외와 동일 취급).

### Anti-Pattern: "이건 너무 단순해서 Spec이 필요 없다"

모든 신규 기능과 비자명한 변경은 이 프로세스를 거친다. 단순해 보이는 작업에서 검토되지 않은 가정이 가장 많은 낭비를 유발한다. PRD는 짧아도 되지만(진짜 단순한 기능은 몇 문장으로 충분), 반드시 작성하고 사용자 승인을 받아야 한다.

## Planner 핵심 원칙
- 야심차게 설계한다 (ambitious scope): 작게 생각하지 말고, 목표를 최대한 달성하는 계획을 수립한다
- AI 기능을 체계에 자연스럽게 녹여 넣는다: 기능 추가가 아닌 워크플로우에 통합된 형태로 설계한다

# Requirements Clarity Skill

## Description

Automatically transforms vague requirements into actionable PRDs through systematic clarification with a 100-point scoring system.


## Pre-Step: Dependency Resolution Interview (Grill Me)

> **스킵 불가 의무 단계** — 100질문 완주 = 코딩 시작 조건.
>
> **Scope**: PRD/Spec 신규작성 또는 ≥2일 기능.
> **예외**: hotfix · 1줄 수정 · typo · rollback (이 경우 즉시 스코어링으로 진입).
> **Override**: `SKIP_GRILL_ME=1` 환경변수 설정 + 사유를 handover에 반드시 기록.
> **100질문 판정**: 누적 응답 ≥100 OR ('AC 충족' AND 'Open Q = 0') — 둘 중 먼저 충족되는 조건으로 완료.

Before any clarification scoring, resolve structural dependencies through focused interview:

1. **공유된 이해 달성까지 끈질기게 인터뷰**: 요구사항이 명확히 합의될 때까지 질문을 멈추지 않는다. "충분히 이해했다"고 넘어가지 않는다.
2. **디자인 트리 각 가지의 의존성 해결**: 기능의 각 구성 요소가 무엇에 의존하는지 명확히 밝힌다. 미해결 의존성이 하나라도 있으면 인터뷰를 계속한다.
3. **코드베이스 직접 탐색**: 요구사항과 관련된 기존 코드, 패턴, 제약을 직접 읽어 컨텍스트를 확보한다. 추측하지 않는다.

이 3단계를 완료한 후에만 아래 스코어링을 시작한다.

## Two Core Questions (MANDATORY)

Every response MUST include these two checks before any other analysis:

1. **"Why?" (YAGNI Check)**: Ask why this feature is needed. What business problem does it solve? Is it truly necessary right now, or is it speculative?
   - Example: "Why do you need analytics tracking? What decision will this data inform?"

2. **"Simpler?" (KISS Check)**: Propose a simpler alternative or scope reduction. Always suggest at least one way to achieve the goal with less complexity.
   - Example: "Instead of building a full analytics dashboard, could you start with just event logging to a file and review it weekly?"

These two questions MUST appear explicitly in the output, labeled as **Why? (YAGNI)** and **Simpler? (KISS)**.

## Instructions

When invoked, detect vague requirements:

1. **Vague Feature Requests**
   - User says: "add login feature", "implement payment", "create dashboard"
   - Missing: How, with what technology, what constraints?

2. **Missing Technical Context**
   - No technology stack mentioned
   - No integration points identified
   - No performance/security constraints

3. **Incomplete Specifications**
   - No acceptance criteria
   - No success metrics
   - No edge cases considered
   - No error handling mentioned

4. **Ambiguous Scope**
   - Unclear boundaries ("user management" - what exactly?)
   - No distinction between MVP and future enhancements
   - Missing "what's NOT included"

**Do NOT activate when**:
- Specific file paths mentioned (e.g., "auth.go:45")
- Code snippets included
- Existing functions/classes referenced
- Bug fixes with clear reproduction steps

## Core Principles

1. **Systematic Questioning**
   - Ask focused, specific questions
   - One category at a time (2-3 questions per round)
   - Build on previous answers
   - Avoid overwhelming users

2. **Quality-Driven Iteration**
   - Continuously assess clarity score (0-100)
   - Identify gaps systematically
   - Iterate until ≥ 90 points
   - Document all clarification rounds

3. **Actionable Output**
   - Generate concrete specifications
   - Include measurable acceptance criteria
   - Provide executable phases
   - Enable direct implementation

## Clarification Process

### Step 1: Initial Requirement Analysis

#### Scope Pre-Check
요구사항이 2개+ 서브시스템에 걸치는 경우 (예: auth + DB + API 동시): 이 단계에서 사용자에게 "범위 분할 권고" 플래그. 각 서브시스템별 별도 PRD 작성 권장. 단일 시스템 범위가 확인될 때까지 Step 2 진입 보류.

**Input**: User's requirement description

**Tasks**:
1. Parse and understand core requirement
2. Generate feature name (kebab-case format)
3. Determine document version (default `1.0` unless user specifies otherwise)
4. Ensure `./docs/prds/` exists for PRD output
5. Perform initial clarity assessment (0-100)

**Assessment Rubric (8-Axis, 100 points)**:
```
1. Functional Scope: /14 points
- Core functionality clear: 5 pts
- Boundaries defined (in/out of scope): 5 pts
- AI integration touchpoint identified: 4 pts

2. User Interaction: /12 points
- Inputs/outputs specified: 4 pts
- Interaction flow described: 4 pts
- Success/failure scenarios defined: 4 pts

3. Technical Constraints: /13 points
- Tech stack mentioned: 4 pts
- Integration points identified: 4 pts
- Performance budget (latency/throughput) stated: 5 pts

4. Business Value: /11 points
- Problem statement clear: 4 pts
- Target users + segment identified: 4 pts
- Success metric (measurable KPI) defined: 3 pts

5. UX/Design Constraints: /12 points
- Design system / token alignment: 4 pts
- Accessibility (WCAG level) specified: 4 pts
- Responsive / device coverage stated: 4 pts

6. Data & Privacy: /14 points
- Data lifecycle (collect/store/delete) defined: 5 pts
- PII / sensitive data classified: 5 pts
- Regulatory compliance (GDPR/PIPA) checked: 4 pts

7. Observability: /12 points
- Logging requirements (events, level) specified: 4 pts
- Metrics / alerts thresholds defined: 4 pts
- Tracing / debug surfaces identified: 4 pts

8. AI Integration: /12 points
- AI feature scope (model selection, prompt design): 5 pts
- Eval criteria / hallucination guardrails: 4 pts
- Cost / token budget bounded: 3 pts
```

**Initial Response Format**:
```markdown
I understand your requirement. Let me help you refine this specification.

**Current Clarity Score**: X/100

**Clear Aspects**:
- [List what's clear]

**Needs Clarification**:
- [List gaps]

Let me systematically clarify these points...
```

### Step 2: Gap Analysis (8-Axis)

Identify missing information across **8 dimensions** (4 core + 4 modern extensions):

**1. Functional Scope** (core)
- What is the core functionality?
- What are the boundaries (in / out of scope)?
- What are edge cases?
- **AI integration touchpoint**: Where does AI live inside the workflow (not bolted on)?

**2. User Interaction** (core)
- How do users interact (UI / CLI / API)?
- What are the inputs / outputs (formats, validation)?
- What are success / failure scenarios?
- What is the recovery / undo / retry behavior?

**3. Technical Constraints** (core)
- **Performance budget**: p95 latency, throughput, concurrency targets?
- Compatibility: browsers, runtimes, library versions?
- Security: auth model, threat surface, rate limits?
- Scalability: expected load growth + bottleneck assumptions?

**4. Business Value** (core)
- What problem does this solve (measurable pain)?
- Target users + segment (persona, ACV, retention impact)?
- Success metric (KPI with target number + measurement window)?
- Priority + opportunity cost vs alternatives?

**5. UX / Design Constraints** (extension)
- Design system / token alignment (color, typography, spacing)?
- Accessibility level (WCAG 2.2 AA minimum) + screen reader, keyboard nav?
- Responsive breakpoints + device coverage (mobile / tablet / desktop)?
- Motion / animation policy + reduced-motion support?

**6. Data & Privacy** (extension)
- Data lifecycle: what is collected, where stored, when deleted?
- PII / sensitive classification (level + masking strategy)?
- Regulatory compliance: GDPR / PIPA / HIPAA applicability?
- Cross-border transfer, retention policy, user export / delete rights?

**7. Observability** (extension)
- Logging: event types, log level policy, structured vs unstructured?
- Metrics: SLI / SLO + alert thresholds + on-call routing?
- Tracing: span boundaries, trace ID propagation, debug surfaces?
- Audit log: who-did-what-when for security-sensitive actions?

**8. AI Integration** (extension)
- AI scope: which Claude model, prompt design, context window strategy?
- Eval criteria: rubric, golden set, regression guard, hallucination policy?
- Cost / token budget: per-request cap + monthly budget + cache strategy?
- Failure modes: model down, rate limit, refusal, low-confidence path?

### Step 3: Interactive Clarification

**Question Strategy**:
1. Start with highest-impact gaps
2. Ask 2-3 questions per round
3. Build context progressively
4. Use user's language
5. Provide examples when helpful
6. **Multiple choice 우선**: 선택지가 명확한 결정은 자유응답 대신 A/B/C 선택지 형식 제공 — 응답 속도와 정확도 향상

**Question Format**:
```markdown
I need to clarify the following points to complete the requirements document:

1. **[Category]**: [Specific question]?
   - For example: [Example if helpful]

2. **[Category]**: [Specific question]?

3. **[Category]**: [Specific question]?

Please provide your answers, and I'll continue refining the PRD.
```

**After Each User Response**:
1. Update clarity score
2. Capture new information in the working PRD outline
3. Identify remaining gaps
4. If score < 90: Continue with next round of questions
5. If score ≥ 90: Proceed to PRD generation

**Score Update Format**:
```markdown
Thank you for the additional information!

**Clarity Score Update**: X/100 → Y/100

**New Clarified Content**:
- [Summarize new information]

**Remaining Points to Clarify**:
- [List remaining gaps if score < 90]

[If score < 90: Continue with next round of questions]
[If score ≥ 90: "Perfect! I will now generate the complete PRD document..."]
```

### Advisor 발화 (경계 케이스)

다음 조건 중 하나일 때 AND `FORGE_ADVISOR_AUTO` ≠ `"off"`:
- 업데이트 점수 **80~89점** (PRD 생성 임계값 직전 경계)
- **YAGNI Check와 KISS Check 충돌**: YAGNI("Why?") 판정이 부정("필요 없을 수 있다")인데 사용자가 계속 진행 의사 표명 → 요구사항 의도 불명확 신호

```
Agent(
  subagent_type="advisor-strategist",
  prompt="""
<맥락 (500토큰 이내)>
- 현재 Clarity Score: {score}/100
- 주요 감점 항목: {gaps}
- YAGNI 판정 요약: {yagni_result}
- KISS 제안: {kiss_suggestion}
- 충돌 내용: {conflict_description}

질문:
1. 이 요구사항의 놓치기 쉬운 모호성 1~2개.
2. PRD 생성으로 진행해야 하는지, 추가 라운드가 필요한지 의견 + 핵심 근거 1~2개만.
"""
)
```

Advisor 응답 → PRD의 `## Advisor 조언` 섹션에 첨부.

### Step 4: PRD Generation

Once clarity score ≥ 90, generate comprehensive PRD.

**Output File**:

1. **Final PRD**: `./docs/prds/{feature_name}-v{version}-prd.md`

Use the `Write` tool to create or update this file. Derive `{version}` from the document version recorded in the PRD (default `1.0`).

**[REVIEW GATE]**: PRD 저장 완료. 사용자에게 반드시 보고:
"PRD가 저장되었습니다: {path}. 구현 진행 전 검토해주세요. 승인 후 /forge-implement 진행 가능합니다."
승인 없이 자동 /forge-implement 진입 금지.

## PRD Document Structure

```markdown
# {Feature Name} - Product Requirements Document (PRD)

## Requirements Description

### Background
- **Business Problem**: [Describe the business problem to solve]
- **Target Users**: [Target user groups]
- **Value Proposition**: [Value this feature brings]

### Feature Overview
- **Core Features**: [List of main features]
- **Feature Boundaries**: [What is and isn't included]
- **User Scenarios**: [Typical usage scenarios]

### Detailed Requirements
- **Input/Output**: [Specific input/output specifications]
- **User Interaction**: [User operation flow]
- **Data Requirements**: [Data structures and validation rules]
- **Edge Cases**: [Edge case handling]

## Design Decisions

### Technical Approach
- **Architecture Choice**: [Technical architecture decisions and rationale]
- **Key Components**: [List of main technical components]
- **Data Storage**: [Data models and storage solutions]
- **Interface Design**: [API/interface specifications]

### Constraints
- **Performance Requirements**: [Response time, throughput, etc.]
- **Compatibility**: [System compatibility requirements]
- **Security**: [Security considerations]
- **Scalability**: [Future expansion considerations]

### Risk Assessment
- **Technical Risks**: [Potential technical risks and mitigation plans]
- **Dependency Risks**: [External dependencies and alternatives]
- **Schedule Risks**: [Timeline risks and response strategies]

## Acceptance Criteria

### Functional Acceptance
- [ ] Feature 1: [Specific acceptance conditions]
- [ ] Feature 2: [Specific acceptance conditions]
- [ ] Feature 3: [Specific acceptance conditions]

### Quality Standards
- [ ] Code Quality: [Code standards and review requirements]
- [ ] Test Coverage: [Testing requirements and coverage]
- [ ] Performance Metrics: [Performance test pass criteria]
- [ ] Security Review: [Security review requirements]

### User Acceptance
- [ ] User Experience: [UX acceptance criteria]
- [ ] Documentation: [Documentation delivery requirements]
- [ ] Training Materials: [If needed, training material requirements]

## Execution Phases

### Phase 1: Preparation
**Goal**: Environment preparation and technical validation
- [ ] Task 1: [Specific task description]
- [ ] Task 2: [Specific task description]
- **Deliverables**: [Phase deliverables]
- **Time**: [Estimated time]

### Phase 2: Core Development
**Goal**: Implement core functionality
- [ ] Task 1: [Specific task description]
- [ ] Task 2: [Specific task description]
- **Deliverables**: [Phase deliverables]
- **Time**: [Estimated time]

### Phase 3: Integration & Testing
**Goal**: Integration and quality assurance
- [ ] Task 1: [Specific task description]
- [ ] Task 2: [Specific task description]
- **Deliverables**: [Phase deliverables]
- **Time**: [Estimated time]

### Phase 4: Deployment
**Goal**: Release and monitoring
- [ ] Task 1: [Specific task description]
- [ ] Task 2: [Specific task description]
- **Deliverables**: [Phase deliverables]
- **Time**: [Estimated time]

---

**Document Version**: 1.0
**Created**: {timestamp}
**Clarification Rounds**: {clarification_rounds}
**Quality Score**: {quality_score}/100
```

### PRD Self-Review (저장 전 자가검토)
- [ ] FR(기능 요구사항) 각 항목 = 검증 가능한 완료 조건 포함
- [ ] 범위 외 기능 암묵적 포함 여부 확인 (scope creep 제거)
- [ ] 기술 제약사항(non-FR) 명시 완료
- [ ] 모호한 표현("적절한", "빠른", "좋은") 구체적 기준으로 교체

## Behavioral Guidelines

### DO
- Ask specific, targeted questions
- Build on previous answers
- Provide examples to guide users
- Maintain conversational tone
- Summarize clarification rounds within the PRD
- Use clear, professional English
- Generate concrete specifications
- Stay in clarification mode until score ≥ 90

### DON'T
- Ask all questions at once
- Make assumptions without confirmation
- Generate PRD before 90+ score
- Skip any required sections
- Use vague or abstract language
- Proceed without user responses
- Exit skill mode prematurely

## Success Criteria

- Clarity score ≥ 90/100
- All PRD sections complete with substance
- Acceptance criteria checklistable (using `- [ ]` format)
- Execution phases actionable with concrete tasks
- User approves final PRD
- Ready for development handoff


---

## Spec Ambiguity Scan & Auto-Clear (doc-oracle-pev C3)

forge-implement 진입 전 C3 hook(`spec-ambiguity-gate`) 선결조건 충족용 모드.
`.specify/specs/*.md` 대상으로 호출 시 ambiguity scan → 마커 자동 생성 또는 Human 명확화 요청.

### 호출 패턴
```
/requirements-clarity --spec .specify/specs/{feature}.spec.md
```

### Ambiguity Scan 절차

1. **FR 전수 스캔**: Spec 파일의 모든 Functional Requirement 항목 검사
   - 불명확: "빠르게", "충분히", "적절히" 등 측정 불가 표현
   - 상충: 동일 기능에 두 FR이 서로 다른 동작 정의
   - 미정의: 에러 케이스·경계값·예외 처리 누락
   - **AI 임의해석·코드역산 금지** (AD-92-2)

2. **판정 및 마커 처리**:
   - **모호 항목 0** → `.specify/ambiguity-cleared.json` 자동 생성:
     ```json
     {"status": "cleared", "ambiguous": 0, "timestamp": "YYYY-MM-DDTHH:MM:SSZ"}
     ```
     → C3 hook 자동 통과, forge-implement 진입 가능
   - **모호 ≥ 1** → 마커 생성 X. 모호 항목 목록 출력 (FR-ID + 유형 + 명확화 제안).
     Human 수정 완료 후 `/requirements-clarity --spec ...` 재실행.

3. **마커 경로**: `{project_root}/.specify/ambiguity-cleared.json`
   - 절대경로 사용 금지 — 현재 프로젝트 루트 기준 상대경로로 Write

---

## 독립 Evaluator (하네스)

requirements-clarity 결과물 완성 후 독립 Evaluator Subagent가 품질을 2차 검증한다.

> **원칙**: 생성자 ≠ 평가자. 자기평가 편향 방지.

```python
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 requirements-clarity 결과물의 독립 품질 검증자입니다.

다음 3가지 기준으로 검증하십시오:

1. **모호성 완전 식별 여부**: 원본 요구사항과 최종 PRD를 비교하여, 원본에 있던 모든 모호한 표현("사용자 관리", "빠른 응답" 등)이 PRD에서 구체적으로 정의됐는지 확인. Clarity Score가 90점 이상으로 기록됐는지 확인. 미해결 모호성이 하나라도 남아 있으면 FAIL.

2. **구현 가능한 수준의 구체성**: Acceptance Criteria 항목이 `- [ ]` 형식이고, 체크 여부를 개발자가 명확히 판단 가능한 수준인지 확인. "잘 동작해야 한다", "사용하기 편해야 한다" 같은 주관적 기준만 있으면 FAIL. 수치·조건·파일명·API 응답 형식 등 객관적 기준이 포함돼야 함.

3. **엣지케이스 처리 여부**: PRD의 Detailed Requirements 또는 Acceptance Criteria에 엣지케이스(빈 입력, 실패 시나리오, 경계값, 권한 오류 등) 항목이 최소 2개 이상 포함됐는지 확인. 엣지케이스 섹션이 비어 있거나 누락됐으면 FAIL.

4. **YAGNI 체크 (과잉 기능 감지)**: PRD에 사용자가 명시적으로 요청하지 않은 기능·추상화 레이어·유연성이 포함됐는지 확인. "나중에 확장을 위해", "범용적으로 설계", "플러그인 구조" 등 미요청 확장성 설계가 있으면 WARN. 3개 이상이면 FAIL. 요청 범위만 포함하는 것이 올바른 PRD.

판정: PASS(기준 충족) / FAIL(재작업 필요)
피드백 형식: [PRD 섹션명] — [이유] → [추가/수정 방법]
"""
)
```

피드백 루프:
- PASS → 파이프라인 계속
- FAIL → 재작업 후 1회 재실행. 2회 연속 FAIL 시 [STOP] Human 에스컬레이션
