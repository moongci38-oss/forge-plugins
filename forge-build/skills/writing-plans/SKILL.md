---
name: writing-plans
description: "Transforms spec/requirements into bite-sized TDD implementation plan before touching code — exact file paths, 2-5min steps, test verification. Use before any code changes begin."
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

> **실행 레인은 여기서 선언하지 않는다 — 상류 Plan 이 한다.**
> 이 스킬이 만드는 것은 **Tasks** 다(아래 2026-08-31 재편 주석 참조). "어떤 그릇에 담아
> 실행하는가"는 3단계 **Plan** 의 `§11 실행 방식 (Execution Lane)` 이 선언하고
> `plan-checker` **Dim 14** 가 거기서 검사한다 — 정본은
> `dev/templates/plan-template-base.md §11` 하나다.
>
> Tasks 산출물에도 레인 선언을 요구할지는 **계획 레인 이원화(T-008)** 의 일부이고
> **사람 결정 대기**다(`plans/2026-09-12-agentic-engineering-wiring-plan.md §8-2`).
> ⚠️ 그 결정 전에 여기에 Plan 전용 섹션을 MUST 로 걸면 **Tasks 생성기에 Plan 계약을
> 거는 것**이 된다 — 2026-09-12 cr-final(Codex 레그)이 HIGH scope-drift 로 잡았다.

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

## Multi-Source Audit (착수 전 5소스 교차확인 의무)

계획 작성 **전** 아래 5개 소스를 교차확인한다. 미확인 항목은 계획 헤더에 `[MISSING: <소스명>]`으로 명시하고, 발견사항은 반드시 플랜에 반영한다.

| 소스 | 확인 방법 | 플랜 반영 |
|------|----------|----------|
| 1. **GOAL** | 사용자가 요청한 최종 목표 (1문장 정의) | 계획 헤더 `Goal:` 필드 |
| 2. **SPEC** | `.specify/specs/*.md` 또는 제공된 Spec 문서 | Task별 FR-ID 추적 |
| 3. **RESEARCH** | `docs/plans/` / `RESEARCH.md` 등 선행 조사 + 기존 테스트 커버리지(`*.spec.ts`, `*.test.ts` 개수) | 미커버 영역을 별도 Task로 분리 |
| 4. **CONTEXT** | 기존 코드베이스 grep + `codebase-analysis.md` + 이슈/handover 문서(`.claude/handover/`) | 기존 패턴 재사용, 충돌 회피 |
| 5. **LEARNINGS** | `.claude/learnings.jsonl` — 이 도메인·파일·실패 모드로 **이미 배운 것** (조회 명령 아래) | 같은 오판을 다시 하지 않도록 Task·리스크에 반영 |

**5. LEARNINGS 조회** (착수 전 — 권고 아님, 의무):

```bash
LEARN="${FORGE_ROOT:-$HOME/forge}/.claude/learnings.jsonl"
KW='<키워드1>|<키워드2>'          # 도메인·파일명·실패 모드. 넓게 잡는다.
if [ ! -r "$LEARN" ]; then
  echo "LEARNINGS: 조회 불가 — 파일 없음/읽기 실패 ($LEARN)"
else
  n=$(grep -icE "$KW" "$LEARN"); rc=$?
  case "$rc" in
    0|1) echo "LEARNINGS: ${n}건 (키워드: $KW)" ;;
    *)   echo "LEARNINGS: 조회 실패 (grep rc=$rc) — 0건으로 세지 마라" ;;
  esac
  [ "${n:-0}" -gt 0 ] && grep -iE "$KW" "$LEARN" | tail -20
fi
```

결과를 헤더에 `Learnings: <N>건 조회 (키워드: ...)` 로 남긴다.
**세 갈래를 구분한다** — `N건` / `0건` / `조회 실패`. ⛔ **조회 실패를 0건으로 적지 마라**:
안 본 것과 봤는데 없는 것과 못 본 것은 서로 다르다.

> **왜 이 소스가 추가됐나**: `learnings.jsonl` 에 **2,198건**이 쌓여 있는데 **계획 단계에서
> 읽는 배선이 한 곳도 없었다**(2026-09-12 관측 — 기록처와 사용처가 갈라져 있었다).
> 같은 오판을 매번 새로 하는 비용이 조회 1회보다 크다.
> `behavior-core.md §완료선언 검증 게이트` 의 "같은 플래그가 반복됐으면 추정 전 learnings 를
> 먼저 조회한다" 와 같은 되먹임이다.
> 재현: `wc -l < "${FORGE_ROOT:-$HOME/forge}/.claude/learnings.jsonl"`
>
> ⚠️ **왜 `grep | tail` 이 아닌가 (2026-09-12 cr-final Codex MEDIUM)**: 파이프로 넘기면
> grep 의 종료코드가 `tail` 의 것으로 덮여 **파일이 없어도 출력이 비어 0건처럼 보인다**.
> grep 은 `0`=매치 · `1`=0건 · `2`=오류로 갈리므로 그 값을 직접 읽는다.
> 실측: 없는 키워드 `rc=1` · 있는 키워드 `rc=0` · 파일 부재 `rc=2`.
>
> ⚠️ **이 의무가 무력화되는 입력**: 키워드를 너무 좁게 잡으면 0건이 나오고 형식은 통과한다
> — 그래서 **키워드를 헤더에 함께** 남기게 했다(사후에 좁았는지 보인다).

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

**Save to:** `.specify/tasks/YYYY-MM-DD-<feature-name>.md`

> ⚠️ **2026-08-31 SDD 4단계 재편 — 이 스킬은 Plan 이 아니라 Tasks 를 만든다.**
> 이 스킬이 내는 것은 2~5분 단위 TDD 스텝(RED 테스트 코드·정확한 실행 명령)이고,
> 새 모델에서 그건 **4단계 Tasks** 다. 3단계 Plan(기술 스택·버전 핀·ADR·데이터 모델·
> API 설계)은 다른 산출물이다.
> 종전 `.specify/plans/` 로 저장하던 것이 **이름만 Plan 이고 내용은 Tasks 였다** —
> 그 이중 레인을 여기서 끊는다.
> ⚠️ 설계 계약(§4-6)은 이 스킬을 "Plan 정본 생산자로 승격"하라고 했으나 **실측이 반대였다.**
> 그대로 승격하면 이 산출물은 Plan 게이트(버전 핀·ADR·Spec 참조)를 원리적으로 통과할 수 없다 —
> 담고 있는 게 그런 내용이 아니기 때문이다. 계약보다 실측을 따랐다(2026-09-01 총괄 결정).
> 템플릿: `dev/templates/task-template-base.md` · 게이트: `forge-gate-check.sh <repo> SDD`

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

writing-plans는 Phase 1 Planner가 계획을 생성하면, Phase 2 독립 Evaluator subagent가 품질을 검증하는
**기본 2단계 + 조건부 3단계** 하네스를 실행한다. Phase 3(`plan-checker` 14차원 적대적 검수)은
**발동 조건을 충족할 때만** 붙는다 — 조건과 비용 근거는 아래 §Phase 3.

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

**감점 (위 4항목 가중 합계와 별도로 차감)**:

| 감점 항목 | 차감 | 판정 방법 |
|------|:----:|-----------|
| LEARNINGS 미조회 | −10 | 계획 헤더에 `Learnings:` 줄이 없다. `0건`·`조회 실패`라 적힌 것은 **조회한 것**이므로 감점하지 않는다 |

**PASS 기준**: 70점 이상.

> ⚠️ 위 4항목 **가중치와 PASS 70 은 건드리지 않았다** — 가중치를 조정하면 계산식 변경이라
> 판정 기준 변경과 같은 커밋에 들어가 `dev-workflow-rules.md §지표·기준 분리 게이트(E-3)` 에
> 저촉된다. 감점 행은 그 분모를 그대로 두고 붙는다.

**FAIL 처리**: Evaluator가 감점 항목별 위치 + 이유 + 개선 방법을 구체적으로 작성하여 Lead에 반환. Lead는 Planner에게 재작성 지시 후 재평가 (최대 1회).

**출력**: `.claude/state/WP_EVAL.md`

```markdown
## Writing Plans Evaluator 결과

**총점**: XX/100 (가중 XX − 감점 XX)
**판정**: PASS / FAIL

### 항목별 점수
- 파일 경로 구체성 (40%): XX점 — [사유]
- TDD 완성도 (30%): XX점 — [사유]
- 세분화 (20%): XX점 — [사유]
- 순서/의존성 (10%): XX점 — [사유]
- 감점: LEARNINGS 미조회 −XX — [해당 없으면 `없음`]

### 개선 지시 (FAIL 항목만)
- [Task N] [항목]: [위치] → [이유] → [개선 방법]
```

### 피드백 루프

<!-- contract:plan-checker-wiring:start -->

- **PASS**: 아래 Phase 3 **발동 조건에 해당하면** Phase 3 을 거친 뒤 확정한다.
  **해당하지 않으면 여기서 확정** — `.claude/state/WP_PLAN.md` 내용을 최종 계획 저장 경로에 복사 후 종료.
  ⚠️ 2026-09-13 cr-final HIGH 반영: 종전 문구는 "Phase 3 으로 간다"만 남겨, **조건 미충족 계획서(대다수)가
  PASS 후 갈 곳을 잃었다.** 복사·종료 지시를 되살린다.
- **FAIL (1회)**: WP_EVAL.md를 Planner에 전달 → 재작성 → Evaluator 재실행.
- **FAIL (2회 연속)**: [STOP] Human 에스컬레이션. 현재 계획 + 평가 결과 전달.
<!-- contract:plan-checker-wiring:end -->

<!-- contract:plan-checker-wiring:start -->
### Phase 3: 14차원 적대적 검수 (plan-checker) — WARN 전용, 비차단

> **왜 있나 (2026-09-13 신설, T-003 배선분)**: `plan-checker` 는 14차원 적대적 검수기인데
> **레포 전체에서 부르는 곳이 0곳이었다**(실측: `subagent_type` 32종 중 `plan-checker` 0건).
> 위 Phase 2 Evaluator 는 **다른 자**다 — `general-purpose` + 4항목 100점 rubric 이라,
> plan-checker 의 Dim 1~14 는 **계획서를 한 장도 채점한 적이 없었다.**
> 규격서를 만들어 놓고 검사관을 부르지 않은 셈이고, 이 Phase 가 그 호출부다.

```
subagent_type: plan-checker
model: opus
```

**입력**: `.claude/state/WP_PLAN.md` 경로를 그대로 넘긴다(plan-checker 가 직접 Read 한다).

**언제 부르나 — 무조건이 아니다.** 아래 **두 조건을 모두** 충족할 때만 부른다:

1. Phase 2 Evaluator 가 **PASS** 한 계획서다 (FAIL 계획서에 적대적 검수를 또 돌리는 것은 낭비다 —
   어차피 재작성한다)
2. 다음 중 **하나라도** 해당: Task 5개 이상 · 변경 대상 파일 10개 이상 · 비가역 변경 포함
   (`BOUNDARY.md` B1~B6) · 사용자가 명시 요청

⚠️ **비용 근거**: subagent 1명의 고정비가 **약 9만 토큰**이다(2026-09-13 실측 —
`harness-gaps/2026-09-13-fanout-slower-and-costlier-than-sequential-2-measurements.md`).
모든 계획서에 무조건 붙이면 작은 계획 하나에 검수 비용이 작성 비용을 넘는다.
위 조건은 **그 실측을 근거로 한 것이지 임의 임계가 아니다.**

**판정 처리** — 이 Phase 는 **막지 않는다**(AD-168 WARN-first, 신규 hard-block 신설 아님):

| plan-checker 최종 판정 | 그 라벨이 나오는 조건 (정본 `plan-checker.md` §최종 판정) | 행동 |
|---|---|---|
| **PASS** | FAIL 차원 0개 + WARN **3개 이하** | 계획 확정. ⚠️ **PASS 에도 WARN 이 1~3개 딸려 올 수 있다** — 그 WARN 도 계획서 말미에 그대로 싣는다 |
| **WARN** | FAIL 차원 0개 + WARN **4개 이상** | 계획 확정하되 **WARN 내용을 계획서 말미에 그대로 싣는다** |
| **FAIL** | FAIL 차원 **1개 이상** | **차단하지 않는다 — 계획은 확정하고 진행한다.** FAIL 차원과 근거를 계획서 말미에 싣고 `[STOP]` 으로 사람에게 **통보**한다 |
| 스폰 실패·미응답 | — (판정 자체가 없다) | 계획 확정하되 보고에 `plan-checker 미수행` 1줄 (fail-open — 없음을 PASS 로 읽지 않는다) |

⚠️ **라벨 축을 checker 와 맞춰 둔다** — 위 표의 키는 plan-checker 가 실제로 내는 **최종 판정 3값**이다.
"전 차원 PASS / WARN 있음" 같은 **차원 단위**로 읽으면 WARN 1개짜리 계획서를 PASS 가 아닌 것으로
오분류한다(임계는 `WARN ≤3`). `N/A` 차원은 어느 쪽으로도 세지 않는다.

⚠️ **`[STOP]` 은 승인 대기가 아니다 — 통보다.** Phase 2 의 `[STOP]`(FAIL 2회 연속 에스컬레이션)과
**다른 뜻으로 쓴다**: 여기서는 사람의 응답을 **기다리지 않고** 계획을 확정한 뒤 진행한다.
⚠️ **정본과 의도적으로 다른 점**: `plan-checker.md §최종 판정` 은 FAIL 에 *"계획 수정 후 재검수 필수"* 를
요구한다. **이 호출부는 그 요구를 따르지 않는다** — AD-168(신규 hard-block 신설 금지)에 따라
WARN-first 로 내린 것이고, 되돌리면 조건 충족 계획서마다 사람 승인이 끼는 차단 게이트가 새로 생긴다.
정본의 재검수 요구는 **Plan 레인(`plan-writer` 산출물)이 살아날 때** 그 호출부가 지킬 몫이다.
재검수를 돌릴지는 계획서 말미의 FAIL 기록을 보고 **사람이 정한다.**

**Phase 3 이후 공통 종결(판정 3종 + 미수행 = 네 분기 모두 동일)**: ①판정과 WARN·FAIL 내용을
**계획서 말미에 기록**(미수행이면 판정이 없으므로 `plan-checker 미수행` 을 기록) →
②`.claude/state/WP_PLAN.md` 를 최종 계획 저장 경로에 **복사** → ③**종료**. 어느 분기도 여기서
다시 Phase 1·2 로 돌아가지 않는다.

⚠️ **이 배선이 무력화되는 입력**: 방 `allowedTools` 에 `Agent` 가 없으면 스폰이 **도구 거부**로
죽는데 종료코드는 0 이라 조용히 건너뛴다. 위 표의 마지막 행이 그 경우를 "미수행"으로 드러낸다 —
보고에 그 줄이 없으면 돌았다고 읽지 마라.

근거: 14차원이 선언만 있고 호출부가 0곳이라 아무 계획서도 채점한 적 없는 검사였다
(계획서 §6-1 "배선 N=0 이면 미완료"). 이 Phase 로 **Dim 1~13 이 호출부를 얻는다.**

⚠️ **이 호출부로도 Dim 14(Execution-Lane)는 여전히 아무것도 채점하지 않는다 — 과장하지 마라.**
이 Phase 가 넘기는 것은 `writing-plans` 의 **Tasks 형식** 산출물이고, `plan-checker.md` 의 Dim 14
N/A 기준이 **Tasks 형식 문서 = N/A** 로 규정한다(재현: `grep -n 'Tasks 형식 문서' .claude/agents/plan-checker.md`).
Dim 14 가 채점하는 **Plan 형식**(`§11 실행 방식`)의 생산자는 `plan-writer`(`.specify/plans/`)인데
호출부도 산출물도 0건이라, Dim 14 는 **배선이 없어서가 아니라 지킬 레인이 비어서** 채점하지 못한다
(**구조적 휴면**). 이건 T-003 범위로 닫을 수 없고 **계획 레인 이원화(T-008) 사람 결정**에 묶여 있다.

폐기조건: Phase 2 Evaluator 가 14차원을 흡수하면 이 Phase 를 지운다.
<!-- contract:plan-checker-wiring:end -->

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
- **관계**: forge-check-security OWASP scan 대체 X — STRIDE는 사전 선언, forge-check-security는 사후 패턴 검증. STRIDE 선언 대비 구현 대조는 `shared/scripts/stride-defense-check.py`(2026-09-17, 구 phase-security-auditor 에이전트 이관)가 한다.

---

## Execution Wave Schedule (멀티 플랜 파일 시 필수)

> ⚠️ **여기서 `Wave` 는 파일 소유권 충돌을 피하는 작업 순서다 — 실행 컨테이너가 아니다.**
> 컨테이너(Wave subagent · Agent Teams · Workflow · session-bus · 단독)는
> Plan `§11 실행 방식` 이 선언하고 `plan-checker` Dim 14 가 검사한다. 다중 의미 대조표 →
> `rules-on-demand/forge-core-workflow-aux.md`

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

