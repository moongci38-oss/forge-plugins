---
name: writing-plans
description: "Transforms a spec or requirements document into a comprehensive, bite-sized implementation plan before touching code. Produces TDD-oriented task sequences with exact file paths, step-by-step actions (2-5 minutes each), and explicit test verification steps. Use when starting multi-step implementations with a spec, but before any code changes begin."
context: fork
model: sonnet
---

**역할**: 당신은 Spec 또는 요구사항 문서를 TDD 기반 세분화 구현 계획으로 변환하는 기술 구현 계획 전문가입니다.
**컨텍스트**: 다단계 구현을 Spec 기반으로 시작하기 전, 코드 변경 직전에 호출됩니다.

## Planner 핵심 원칙
- 야심차게 설계한다 (ambitious scope): 작게 생각하지 말고, 목표를 최대한 달성하는 계획을 수립한다
- AI 기능을 체계에 자연스럽게 녹여 넣는다: 기능 추가가 아닌 워크플로우에 통합된 형태로 설계한다

# Writing Plans

## Output Requirements

Every plan MUST include ALL of the following — missing any one is a failure:

1. **Structured header**: Goal + Architecture + Tech Stack
2. **3+ Tasks**: Each task as a numbered `### Task N: [Name]` section
3. **File paths per task**: Every task MUST list at least 2 concrete file paths with extensions in a `**Files:**` block (e.g., `src/services/comment.service.ts`, `tests/comment.e2e-spec.ts`)
4. **Test steps**: Every task MUST include "Write the failing test" and "Run test" steps
5. **Ordered dependencies**: Tasks MUST be numbered in implementation order

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

## Multi-Source Audit (착수 전 4소스 교차확인 의무)

계획 작성 **전** 아래 4개 소스를 교차확인한다. 미확인 항목은 계획 헤더에 `[MISSING: <소스명>]`으로 명시하고, 발견사항은 반드시 플랜에 반영한다.

| 소스 | 확인 방법 | 플랜 반영 |
|------|----------|----------|
| 1. **GOAL** | 사용자가 요청한 최종 목표 (1문장 정의) | 계획 헤더 `Goal:` 필드 |
| 2. **SPEC** | `.specify/specs/*.md` 또는 제공된 Spec 문서 | Task별 FR-ID 추적 |
| 3. **RESEARCH** | `docs/plans/` / `RESEARCH.md` 등 선행 조사 + 기존 테스트 커버리지(`*.spec.ts`, `*.test.ts` 개수) | 미커버 영역을 별도 Task로 분리 |
| 4. **CONTEXT** | 기존 코드베이스 grep + `codebase-analysis.md` + 이슈/handover 문서(`.claude/handover/`) | 기존 패턴 재사용, 충돌 회피 |

**교차확인 의무**: 소스 간 모순(SPEC vs CONTEXT 충돌, RESEARCH vs 실제 코드 괴리) 발견 시 → 계획 헤더에 `[CONFLICT: <설명>]`으로 명시 후 Human 에스컬레이션.

낯선 기술 도메인 시 RESEARCH 확인 전 `phase-researcher` agent 수동 스폰 권장.

## 의존성-인지 분해 (P-1, opt-in — 멀티파일 병렬 계획 시)

> greybox opt-in. 기본 off → 미사용 시 계획 흐름 100% 불변. 멀티파일 변경을 **충돌 없는 병렬 작업 단위**로 쪼갤 때만 사용.

변경대상이 멀티파일이고 병렬 fan-out을 고려할 때, Task를 의존그래프 connected components로 분해해 disjoint work-list를 만든다:

1. **전제(강제, stale 방어)**: `mcp__gitnexus__detect_changes` + (그룹이면) `mcp__gitnexus__group_sync` 선행. 인덱스가 commits-behind면 재인덱싱 후 신뢰.
2. **edges fetch** (changeset 한정 scope):
   ```cypher
   MATCH (a)-[r:CodeRelation]->(b)
   WHERE r.type IN ['CALLS','IMPORTS','EXTENDS','IMPLEMENTS']
     AND a.filePath IN $changeset AND b.filePath IN $changeset AND a.filePath <> b.filePath
   RETURN DISTINCT a.filePath AS src, b.filePath AS dst
   ```
3. **분해**: `echo '{"graph_synced":true,"changeset":[...],"edges":[[src,dst]...]}' | python3 ~/forge/shared/scripts/decompose.py`
   → `components`(=병렬 worktree 단위) + `cross_component_edges:0`(머지충돌 0 보장) + `serial_within`(공유심볼 컴포넌트 = 인터페이스 계약 먼저 직렬).
4. 계획에서 **다른 컴포넌트 Task = 병렬 레인**(P-3 연계), 같은 컴포넌트 = 직렬.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `.specify/plans/` or `docs/plans/YYYY-MM-DD-<feature-name>.md`

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file`
- Modify: `exact/path/to/existing`
- Test: `tests/exact/path/to/test`

**Step 1: Write the failing test**
**Step 2: Run test to verify it fails**
**Step 3: Write minimal implementation**
**Step 4: Run test to verify it passes**
**Step 5: Commit**
```

## Remember
- **Exact file paths always** — every task MUST reference at least 2 concrete file paths with extensions (e.g., `src/services/comment.service.ts`, `tests/comment.e2e-spec.ts`)
- Complete code in plan (not "add validation")
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits
- **No-Placeholders:** "TBD", "TODO", "later", "implement later", "to be defined", "placeholder" 등 모호 연기 표현 금지. 모든 항목은 구체적 내용(파일명, 함수 시그니처, 예상 출력)으로 작성한다. 위반 항목은 Evaluator 감점 대상.
- **Scope-reduction prohibition:** "simplified", "basic", "later", "minimal version", "phase 2로 미룸" 등 암묵적 범위 축소 표현 금지. 처음부터 제외한 항목은 반드시 `**Out of scope:** <이유>` 섹션에 명시적으로 분리 기록한다.

---

## Self-Review (Phase 1 완료 후 필수)

Phase 1 Planner는 Evaluator subagent 호출 전 아래 5개 질문을 자가 점검한다. 하나라도 NO이면 수정 후 진행한다.

1. **Scope creep**: 이 계획이 요청 범위를 초과하는 기능을 포함하는가? → NO여야 PASS
2. **Placeholder**: TBD/TODO/later 표현이 하나라도 있는가? → NO여야 PASS
3. **의존관계**: Task 순서가 실제 의존 방향과 일치하는가? → YES여야 PASS
4. **검증 방법**: 각 Task의 "테스트 실행 + 통과 확인" 스텝이 명령과 예상 출력까지 구체적인가? → YES여야 PASS
5. **Rollback**: 이 계획을 절반만 실행했을 때 시스템이 안전한 상태인가? → YES여야 PASS (아니면 위험 표시 추가 — `plan-checker.md`의 **Dim 7a Reversion** 차원 참조)

## 하네스 패턴 (Planner-Evaluator)

writing-plans는 Phase 1 Planner가 계획을 생성하면, Phase 2 독립 Evaluator subagent가 품질을 검증하는 2-Phase 하네스를 실행한다.

### Phase 1: Planner

위 Output Requirements + Task Structure 규칙에 따라 구현 계획을 생성한다.

**출력**: `.claude/state/WP_PLAN.md` (파일 통신 채널)

```markdown
# [Feature Name] Implementation Plan
<!-- 본문 전체 -->
```

### Phase 2: Evaluator subagent (독립 컨텍스트)

> **핵심 원칙: Planner의 컨텍스트(의도, 가정)를 공유하지 않는 별도 에이전트가 검증한다.**

```
subagent_type: general-purpose
model: sonnet
```

**입력**: `.claude/state/WP_PLAN.md` — 직접 Read 후 평가 시작.

**Rubric (100점 만점)**:

| 항목 | 가중치 | 불합격 기준 |
|------|:------:|-----------|
| 파일 경로 구체성 | 40% | Task당 구체 경로 2개 미만 시 즉시 0점 |
| TDD 완성도 | 30% | "실패 테스트 작성 → 실행 → 구현 → 통과 확인" 4스텝 누락 시 0점 |
| 세분화 | 20% | 스텝 하나가 2-5분을 초과하거나 모호하면 감점 |
| 순서/의존성 | 10% | 구현 순서가 의존성 역전이면 감점 |

**PASS 기준**: 70점 이상.

**FAIL 처리**: Evaluator가 감점 항목별 위치 + 이유 + 개선 방법을 구체적으로 작성하여 Lead에 반환. Lead는 Planner에게 재작성 지시 후 재평가 (최대 1회).

**출력**: `.claude/state/WP_EVAL.md`

```markdown
## Writing Plans Evaluator 결과

**총점**: XX/100
**판정**: PASS / FAIL

### 항목별 점수
- 파일 경로 구체성 (40%): XX점 — [사유]
- TDD 완성도 (30%): XX점 — [사유]
- 세분화 (20%): XX점 — [사유]
- 순서/의존성 (10%): XX점 — [사유]

### 개선 지시 (FAIL 항목만)
- [Task N] [항목]: [위치] → [이유] → [개선 방법]
```

### 피드백 루프

- **PASS**: 계획 확정 → `.claude/state/WP_PLAN.md` 내용을 최종 계획 저장 경로에 복사 후 종료.
- **FAIL (1회)**: WP_EVAL.md를 Planner에 전달 → 재작성 → Evaluator 재실행.
- **FAIL (2회 연속)**: [STOP] Human 에스컬레이션. 현재 계획 + 평가 결과 전달.

## Security Threats (STRIDE — 보안 관련 계획 필수)

다음 조건 중 1개 이상 해당 시 계획 마지막에 `## Security Threats` 섹션 추가:
- auth 라이브러리, 세션 처리, 사용자 입력 폼, DB 쓰기, 외부 API 호출, 파일 업로드, 결제

**STRIDE 위협 표 (계획 파일 내 마크다운, XML 금지):**

```markdown
## Security Threats

| Threat ID | STRIDE | Component | Disposition | Mitigation |
|-----------|--------|-----------|-------------|------------|
| T-{slug}-01 | T (Tampering) | POST /api/data | mitigate | zod 스키마 검증 route 진입점 |
| T-{slug}-02 | I (Information Disclosure) | Error 응답 | mitigate | 프로덕션 stack trace 제거 |
```

- **Threat ID**: `T-{plan-slug}-NN`
- **Disposition**: `mitigate` (grep 가능 코드 패턴) / `accept` (근거 명시) / `transfer` (라이브러리·벤더 위임)
- **관계**: forge-check-security OWASP scan 대체 X — STRIDE는 사전 선언, forge-check-security는 사후 패턴 검증. phase-security-auditor가 STRIDE 선언 대비 구현 대조 검증.

---

## Execution Wave Schedule (멀티 플랜 파일 시 필수)

2개 이상 plan 파일 생성 시, 파일 소유권 기반 wave 번호 할당 후 계획 문서 상단에 스케줄 표 삽입:

```markdown
## Execution Wave Schedule

| Plan | Wave | Depends On | Files (wave 내 겹침 금지) |
|------|------|------------|--------------------------|
| Plan 1 | 1 | — | src/models/user.ts |
| Plan 2 | 1 | — | src/models/product.ts |
| Plan 3 | 2 | Plan 1, Plan 2 | src/api/checkout.ts |
```

**Wave 할당 알고리즘:**
- Wave 1: 의존성 없는 플랜
- Wave N: `max(deps wave) + 1`
- **암묵적 의존성**: plan B의 `Files:` 목록에 plan A와 겹치는 파일 있으면 → `B.wave >= A.wave + 1`
- **같은 wave 내 파일 겹침 = 즉시 오류** — 직렬 순서로 재배치

단일 플랜 파일 내 같은 파일 수정 Task 2개 이상 → 해당 Task는 병렬 실행 불가, 순서 명시 필수.

---

## Workflow 통합 (계획서 P1)

병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원. 패턴: Plan→Evaluate (작성 의도 미전달 격리).

실행: `Workflow({ script: Bash("cat ~/.claude/skills/writing-plans/workflow.js") })`

`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 방식 fallback.

