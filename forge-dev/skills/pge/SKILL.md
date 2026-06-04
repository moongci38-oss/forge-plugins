---
name: pge
description: Planner-Generator-Evaluator 하네스. Planner+Generator는 메인 컨텍스트에서 직접 실행하고, Evaluator만 subagent로 격리하여 독립 검수를 보장한다.
user-invocable: true
---

**역할**: 당신은 PGE 하네스를 **직접 실행**하는 에이전트입니다. Planner와 Generator를 메인 컨텍스트에서 수행하고, Evaluator만 subagent로 스폰합니다.
**컨텍스트**: 복잡한 구현/생성 작업에서 품질이 결과를 결정할 때 사용합니다.
**출력**: 최종 산출물 + PGE 실행 보고서 (`docs/pge/YYYY-MM-DD-{task-name}-pge-report.md`)

# PGE — Planner-Generator-Evaluator 하네스

AI 출력 품질의 핵심 변수는 모델이 아니라 **구조(하네스)**다.

**Grader Isolation 원칙**: Evaluator subagent는 Generator 컨텍스트를 상속받지 않는다. 독립 판단 보장.

**아키텍처 원칙**:
- **Planner + Generator**: 메인 컨텍스트에서 직접 실행 → 이전 분석/실패 이력을 자연스럽게 참조
- **Evaluator**: subagent로 격리 → Generator의 의도/가정을 모른 채 코드 자체만 보고 독립 검수
- **자기평가 금지**: Generator가 만든 코드를 Generator가 평가하지 않는다

## 사용법

```
/pge <task description>
/pge --rubric custom  # 커스텀 Rubric 사용
/pge --cycles 2       # 최대 2사이클 (기본 3)
```

## 적용 대상

| 적합 | 부적합 |
|------|--------|
| 코드 기능 구현 | 단순 정보 조회 |
| 버그 수정 | 파일 탐색 |
| 기획서/문서 초안 작성 | 1회성 수정 |
| 에셋/이미지 생성 기획 | 설정 변경 |

---

## 실행 워크플로우

### Phase 0: Rubric 확정

Evaluator가 사용할 평가 기준을 Generator 실행 **전**에 명시한다.

기본 Rubric (작업 유형에 따라 조정):

| 항목 | 가중치 | 불합격 기준 |
|------|:------:|-----------|
| 요구사항 충족도 | 40% | 핵심 요구사항 미충족 시 즉시 FAIL |
| 품질/완성도 | 30% | AI 슬롭(무의미 반복·복붙·미완성) 감지 시 0점 |
| 구조/아키텍처 | 20% | 설계 의도 위반 시 0점 |
| 문서/명확성 | 10% | 주요 내용 누락 시 5점 이하 |

**PASS 기준**: 합산 70점 이상 + 요구사항 즉시 FAIL 없음

## Sprint Contract (Generator ↔ Evaluator 합의 형식)

PGE Workflow 시작 시 Planner가 다음 contract를 작성. Generator·Evaluator 양쪽이 참조.

```yaml
sprint_contract:
  scope: "이번 반복에서 다룰 것 (구체적 기능 / 파일 / 출력)"
  out_of_scope: "명시적 제외 (다음 반복에서 다룸 또는 영구 제외)"
  done_criteria: "Evaluator가 PASS 판정하는 객관적 조건"
  rollback_trigger: "이 조건 충족 시 즉시 STOP + 사용자 에스컬레이션"
```

**예시**:
```yaml
sprint_contract:
  scope: "결제 API /payment/charge 엔드포인트 + 단위 테스트"
  out_of_scope: "환불 API, 결제 이력 조회 (별도 sprint)"
  done_criteria: "단위 테스트 PASS + Stripe sandbox 1회 전송 성공 응답"
  rollback_trigger: "민감정보 로그 노출 발견 시 즉시 STOP"
```

> 출처: 하네스 엔지니어링 백과사전 제9장 Generator-Evaluator 패턴 — Sprint Contract.
> 효과: Generator 범위 이탈 방지 + Evaluator 판정 기준 명확화 → codex-review FAIL 사이클 감소.

### Phase 1: Planner (메인 컨텍스트에서 직접 실행)

> **subagent 스폰하지 않는다. 메인 대화에서 직접 수행한다.**
> 이유: subagent는 이전 분석/실패 이력을 참조하지 못해 동일 실수를 반복한다.

1. `{project_root}/.claude/reference/` 존재 확인 → 태스크 유형에 맞는 파일 Read (하단 Reference 로딩 표 참조)
1b. **과거 PGE 실패·버그 패턴 로드 (compounding — 필수)**:
   ```bash
   LEARN_BY=pge bash ~/.claude/scripts/learnings.sh load pge-failure 2>/dev/null
   LEARN_BY=pge bash ~/.claude/scripts/learnings.sh load bug-fix-pattern 2>/dev/null
   ```
   → `pge-failure` 항목의 `apply` = "이 방식은 이전 PGE에서 FAIL했음 — 피하라". 실행 계획에 반영. (access.log 자동 기록.)
2. 작업 요구사항 분석
2b. **GitNexus 구조 탐색 (인덱스된 프로젝트에서 추가 실행 — 계획서 P1-G3)**:
   ```
   1. mcp__gitnexus__list_repos → indexed_date 확인 (7일+ stale = 경고)
   2. mcp__gitnexus__query({query: "기능_요약"}) → 기존 구현 패턴 (재사용 가능?)
   3. mcp__gitnexus__context({name: "수정_대상_클래스"}) → breaking change 위험 callers
   4. mcp__gitnexus__impact({target: "수정_함수", maxDepth: 2})
      → d=1 심볼 = Generator에 "반드시 테스트" 전달
      → d=2 심볼 = 회귀테스트 범위
   → gitnexus 인덱스 없으면 skip
   ```
3. **Unity 클라이언트 .cs 수정이 포함된 경우** (필수 순서):
   1. `{project_root}/.claude/state/current-analysis.md` 존재 확인 — **있으면 먼저 Read**하여 이전 분석 재사용 판단
   2. `{project_root}/.claude/reference/key-file-map.md` **Read** — 기능별 파일 위치 + 쌍 수정 패턴
   3. `{project_root}/.claude/reference/code-snippets.md` **Read** — DOTween/UI/이벤트 표준 패턴
   4. `{project_root}/.claude/reference/pre-modification-analysis-detail.md` **Read** — Step 0~5 의존성 분석 지침 (핵심: Step 3 실행 흐름 추적)
   5. `{project_root}/.claude/reference/pge-game-evaluator-rubric-detail.md` **Read** — 평가 기준 숙지
   6. `pre-modification-analysis-detail.md`의 Step 0~4 지침을 순서대로 수행 (Step 3 실행 흐름 추적이 가장 중요)
   7. 분석 결과를 `{project_root}/.claude/state/current-analysis.md`에 **저장 (Write)** — Step 0~4 섹션 + 대상 파일명 필수 포함
      → Hook이 내용 검증함: Step 0~4 섹션 없거나 대상 파일명 없으면 .cs 수정이 차단됨
4. **이전 시도 실패 이력 확인**: 대화 컨텍스트에 이전 PGE 시도가 있으면 실패 원인을 current-analysis.md "## 이전 시도 실패 이력" 섹션에 기록하고, 같은 접근을 반복하지 않는다
5. 산출물 구조 설계 (목차, 컴포넌트, 인터페이스 등)
6. Phase 0에서 확정한 Rubric을 실행 계획에 포함

**출력**: `{project_root}/.claude/state/PGE_SPEC.md` + (Unity .cs 수정 시) `{project_root}/.claude/state/current-analysis.md`
- 상단에 "## 참조 컨텍스트" 섹션 — 로드한 reference 파일 목록 + 핵심 내용 요약
- 이후 실행 계획 본문

### Phase 1.5: Codex Plan Review (자동, blocking)

Planner 산출 직후 Codex 2차 게이트 실행. PGE_SPEC.md의 요구 명확성·누락·모순·YAGNI 위반 검증.

```bash
/codex-review --stage plan --target {project_root}/.claude/state/PGE_SPEC.md --blocking
```

- **결과**: `forge-outputs/docs/reviews/plan/{date}-pge-spec-{slug}.{md,json}`
- **PASS/WARN** → Phase 2 진입
- **FAIL** → Planner 재실행 (Codex issues[]를 PGE_SPEC.md `## 이전 시도 실패 이력` 섹션에 추가하여 같은 갭 반복 방지)
- **비용**: ChatGPT OAuth `gpt-5.5` = $0.00. API key + `gpt-5-mini` = ~$0.02

### Phase 2: Generator (메인 컨텍스트에서 직접 실행)

> **subagent 스폰하지 않는다. 메인 대화에서 직접 수행한다.**
> 이유: Planner 분석 결과와 이전 실패 맥락을 그대로 보유한 상태에서 구현해야 한다.

1. `{project_root}/.claude/state/PGE_SPEC.md` 읽기 (Phase 1에서 이미 작성했으므로 컨텍스트에 있음)
2. **Unity .cs 수정이 포함된 경우 필수**: `{project_root}/.claude/state/current-analysis.md` 재확인
3. 계획에 따라 산출물 생성/구현 — **반드시 reference의 패턴/규칙을 준수**
4. Rubric 기준을 의식하며 생성. 목표: **"museum quality"** (라이브러리 기본값·AI 슬롭 패턴 금지)
5. **QA 핸드오프 전 자기검토**:
   - [ ] Rubric 불합격 조건 직접 확인
   - [ ] key-file-map의 쌍 수정 패턴 준수 여부
   - [ ] code-snippets의 대상 파일 애니메이션 방식 준수 여부
   - [ ] 이전 시도에서 실패한 접근을 반복하지 않았는지 확인
6. **Unity .cs 수정 완료 후**: `{project_root}/.claude/state/current-analysis.md`의 Step 4에 수정 결과 추가 (수정된 파일:라인, 수정 전/후 동작 차이, 잔존 이슈)

**출력**: `{project_root}/.claude/state/PGE_SELF_CHECK.md` + 산출물(코드/파일) + (Unity .cs 수정 시) 갱신된 `current-analysis.md`

### Phase 3: QA — 독립 에이전트 검증 (subagent)

> **핵심 원칙: 개발자 ≠ 테스터**
> Generator(메인)의 컨텍스트(의도, 시도, 가정)를 공유하지 않는 **별도 subagent**가 검증한다.

#### QA 에이전트 스폰

```
Generator 완료 (메인 컨텍스트)
  ↓ subagent 스폰 — 전달: 변경 파일 목록 + PGE_SPEC.md 경로 (Generator의 의도/가정은 전달하지 않음)
  ↓
QA Agent (별도 subagent, 독립 컨텍스트)
  ↓ 변경 파일 확장자로 트랙 자동 감지
  ↓
트랙별 검증 실행
```

#### 트랙 라우팅 (변경 파일 기반 자동 감지)

| 트랙 | 감지 조건 | 호출 대상 | 비고 |
|------|----------|----------|------|
| **A. 기능** | 서버/로직 코드 변경 (.cs service, .ts service, .py) | `verify.sh code` + 데이터 흐름 트레이싱 | 항상 실행 |
| **B. 웹/앱 UI** | .tsx/.jsx/.css/.html 변경 | `/visual-loop` + `/playwright-parallel-test` | 해당 시만 |
| **C. 게임 연출/UI** | Unity .cs + .prefab + .anim 변경 | `/game-qa` | 해당 시만 |

트랙은 **중복 가능** — 서버+클라이언트 동시 변경이면 A+C 모두 실행.

#### 트랙 A: 기능 테스트

1. **빌드**: 프로젝트 빌드 실행 → Error 0건 확인
2. **데이터 흐름 트레이싱** (버그 수정 시 필수):
   - 수정한 코드의 전체 호출 경로를 추적
   - 각 단계에서 값 유효성 확인
3. **결과**: `PGE_QA_RESULT.md`에 PASS/FAIL 기록

#### 트랙 B: 웹/앱 UI/UX 테스트

2. `/playwright-parallel-test` → 3-Agent 병렬 브라우저 테스트
3. **결과**: `PGE_QA_RESULT.md`에 병합

#### 트랙 C: 게임 연출/UI 테스트

`/game-qa` 스킬을 호출한다.

검증 3계층:
1. **파라미터 검증**: 코드 수치 ↔ 기획서/레퍼런스 1:1 대조
2. **런타임 검증**: Unity MCP로 캡처 → 레퍼런스 비교
3. **Human 필요 항목 명시**: AI가 판단할 수 없는 퀄리티 항목을 리스트업

**QA FAIL 시**: `PGE_QA_RESULT.md`를 메인 컨텍스트의 Generator에 전달 → Phase 2 재실행

### Phase 4: Evaluator (subagent — 독립 검수)

> **반드시 subagent로 스폰한다. 메인 컨텍스트에서 실행하지 않는다.**
> 이유: Generator와 같은 컨텍스트에서 평가하면 자기평가 편향이 발생한다.

```
subagent_type: general-purpose
model: sonnet
```

subagent에 전달하는 정보:
- `{project_root}/.claude/state/current-analysis.md` (분석 기준)
- `{project_root}/.claude/state/PGE_SPEC.md` (요구사항)
- `{project_root}/.claude/state/PGE_QA_RESULT.md` (QA 결과)
- 코드 diff (변경된 파일 목록 + git diff)
- `.claude/rules/pge-game-evaluator-rubric.md` + `.claude/reference/pge-game-evaluator-rubric-detail.md`

**전달하지 않는 정보**: Generator의 의도, 시도 과정, 실패 이력 (독립 판정을 위해)

Evaluator 수행:
1. 루브릭 파일 읽기
2. PGE_SPEC.md 읽기 (참조 컨텍스트 확인)
3. Phase 0의 Rubric으로 항목별 점수 산정
4. QA 결과 반영 — 잔존 이슈가 있으면 감점
5. PASS/FAIL 판정
6. FAIL 항목에 대한 구체적 개선 지시 — **위치 + 이유 + 방법** 3요소 필수
7. **절대 관대하게 보지 마라**: Generator 자체검토(SELF_CHECK.md)를 그대로 믿지 않는다

**출력**: `{project_root}/.claude/state/PGE_QA_REPORT.md`

### Phase 4.5: Codex 2차 리뷰 (자동, 이중 게이트)

Evaluator 산출 직후 Codex 코드 리뷰 자동 실행. Evaluator(Claude) 동일-모델 맹점 보완.

```bash
/codex-review --stage code --target <PGE diff>
```

**Evaluator 점수별 정책**:
- **80점+ (PASS)**: Codex 일반 리뷰 (`--effort medium`) — 확인 차원
- **60~79점 (경계)**: Codex 적대적 리뷰 (`--effort high`) — 추가 검증
- **60점 미만 (FAIL)**: Codex 호출 생략 — 이미 명백한 실패

**Evaluator vs Codex diff 처리** (Plan v2-C2 spec 기반):
- `agreement` → Evaluator 점수 확정
- `disagreement` → Phase 4.6 (Opus Advisor) 호출
- `extension` (Codex가 추가 이슈 발견) → Codex issues PGE_QA_REPORT.md에 추가, 사용자 컨펌 후 진행 (자동 재평가 X — code stage = blocking NO per v2-C1)

**출력**: `PGE_QA_REPORT.md`에 Codex 섹션 추가 (`forge-outputs/docs/reviews/code/{date}-pge-{slug}.md` 링크).

### Phase 4.6: Opus Advisor (경계 케이스 + 모순 시)

다음 조건 중 하나일 때 실행. PASS(80+ + Codex agreement)는 스킵.

**트리거**:
- Evaluator 점수 60~79점 (경계)
- Phase 4.5에서 Evaluator-Codex `disagreement` 발생

`FORGE_ADVISOR_AUTO` 환경변수가 `"off"`가 아닌 경우 `advisor-strategist` 호출:

```
Agent(
  subagent_type="advisor-strategist",
  prompt="""
<판정 맥락 (500토큰 이내)>
- Rubric 항목별 점수 + 감점 사유 요약
- Codex 리뷰 결과 (있으면)
- 산출물 핵심 부분

질문:
1. 이 판정의 놓치기 쉬운 맹점 1~2개.
2. PASS/FAIL 의견 + 핵심 근거 1~2개만 답하라.
"""
)
```

Advisor 응답 기준:
- Advisor가 PASS → 최종 PASS (Evaluator·Codex 판정 오버라이드)
- Advisor가 FAIL 동의 → FAIL로 Phase 2 재실행
- 응답은 400~600토큰 이내로 제한

### Phase 5: 피드백 루프

- **PASS**: 종료 → 최종 산출물 저장 → 보고서 작성
- **FAIL (사이클 1~2)**: `PGE_QA_REPORT.md`를 메인 컨텍스트에서 읽고 → Phase 2 재실행 (이전 실패 원인을 알고 있으므로 같은 실수 반복 방지)
- **3회 연속 같은 항목 FAIL**: 구현 방식 자체 변경 (단순 수정 불가)
- **FAIL (사이클 3 이후)**: [STOP] Human 에스컬레이션

최대 3사이클. 3사이클 후 FAIL 잔존 시 현재 상태로 전달 + 이슈 보고.

**Evaluator 최종 FAIL 시 — pge-failure 후보 기록 (compounding)**: 3사이클 후에도 FAIL 잔존하면 (= 이 접근 방식이 막혔다는 신호), 그 실패 패턴을 종료 핸드오버에 `pge-failure 후보:` 1줄로 기록 (`current-analysis.md "## 이전 시도 실패 이력"` 섹션 + handover 모두). `/end-sonnet` 또는 `/end-opus`가 그 후보를 `learnings.sh append --category pge-failure --summary "<무엇을 하려다> <왜 막혔나>" --apply "<향후 PGE에서 이 접근 회피 — 대안은>" --evidence "<PGE 보고서 경로 or 사이클 요약>"`로 learnings에 반영. (end-* 가 이미 learnings append 수행하므로 후보 큐만 넘기면 됨.)

---

## 파일 기반 통신 프로토콜

모든 PGE 중간 파일은 `{project_root}/.claude/state/`에 저장한다.

| 파일 | 작성자 | 읽는 자 | 내용 |
|------|--------|---------|------|
| `PGE_SPEC.md` | Planner (메인) | Generator (메인), QA (subagent), Evaluator (subagent) | 설계서 + reference 목록 |
| `current-analysis.md` | Planner (메인) | Generator (메인), Evaluator (subagent) | 4단계 의존성 분석 + 이전 시도 실패 이력 |
| `PGE_SELF_CHECK.md` | Generator (메인) | QA (subagent), Evaluator (subagent) | 자체 점검 결과 |
| `PGE_QA_RESULT.md` | QA (subagent) | Evaluator (subagent), Generator (메인, 피드백 시) | 트랙별 검증 결과 |
| `PGE_QA_REPORT.md` | Evaluator (subagent) | Generator (메인, 피드백 시) | Rubric 판정 + 개선 지시 |

### 프로젝트 Reference 로딩 (Planner 필수)

| 태스크 유형 | 읽을 파일 |
|------------|---------|
| **Unity 클라이언트** | `key-file-map.md`, `code-snippets.md`, `pre-modification-analysis-detail.md` |
| **서버 / 웹 / 앱** | `codebase-analysis.md` (존재 시), `key-file-map.md`, `code-snippets.md`, `golden-rules.md` |
| **웹 / 앱 UI** | `~/forge/shared/design-tokens/design-rules.md` |
| 프로토콜 / 네트워크 | `key-file-map.md`, `protocol-ranges.md`, `tech-stack.md` |
| 빌드 / 배포 | `build-commands.md`, `dependency-order.md` |

---

## 산출물 및 완료 보고

완료 시 아래 형식으로 보고:

```
## PGE 실행 완료

**결과물**: [산출물 경로]
**QA 반복 횟수**: X회
**최종 점수**: [항목별]

**실행 흐름**:
1. Planner (메인): [분석 내용 한 줄]
2. Generator R1 (메인): [구현 결과 한 줄]
3. QA (subagent): [검증 결과 한 줄]
4. Evaluator (subagent): [판정 + 핵심 피드백 한 줄]
5. Generator R2 (메인): [수정 내용 한 줄] (해당 시)
...
```

---

## 하네스 원칙 요약

| 원칙 | 적용 |
|------|------|
| **컨텍스트 연속성** | Planner+Generator는 메인에서 실행 → 이전 분석/실패 이력 자동 참조 |
| **독립 검수** | Evaluator는 subagent → Generator의 맥락 오염 없이 코드만 보고 판정 |
| **자기평가 금지** | Generator(메인) ≠ Evaluator(subagent), 같은 에이전트가 생성+평가하지 않음 |
| **실패 이력 영속화** | current-analysis.md에 "이전 시도 실패 이력" 섹션 → 같은 실수 반복 방지 |
| **분석 프로토콜 강제** | PreToolUse hook이 current-analysis.md 내용 검증 → 분석 없이 코드 수정 차단 |

## 자동 평가 (eval-rubric 통합)

본 스킬 결과 산출 후 자동으로 `eval-rubric` 호출 → 4축 Rubric 채점 (clarity/consistency/completeness/safety) → `eval_cases.jsonl` 누적.

### 호출 시점
- 본 스킬 핵심 산출물 저장 직후 — Evaluator subagent 결과 (PGE Phase 4 종료)

### 절차
1. 스킬 산출물 저장 후 다음 호출:
   ```
   /eval-rubric --target {산출물 경로}
   ```
2. eval-rubric의 verdict (PASS/WARN/FAIL) + 4축 점수 + rationale 수신
3. `eval_cases.jsonl` append:
   - 위치: `~/.claude/skills/pge/eval_cases.jsonl`
   - case_id: `EC-pge-{N}` (auto-increment)
   - split: holdout 결정 (`hash(case_id) % 100 < 20` → holdout, 그 외 sample)
   - dedupe key: `sha256(skill+input.context+input.args)` 충돌 시 observed_count++

### 자동 비활성 조건
- 환경변수 `EVAL_RUBRIC_AUTO=off` 설정 시 스킵
- 본 스킬 frontmatter에 `eval_cases: off` 명시 시 스킵 (특수 케이스)

### 통합 효과
- FAIL 케이스 자동 누적 → 회귀 평가 데이터셋 구축
- WARN 시 사용자 알림 (자동 차단 X — 본 스킬 verdict 우선)
- 분기별 Harness GC 사이클의 Quality Audit 입력으로 활용

### 보안 / 데이터 보호
- eval-rubric의 입력 redaction 정책 자동 적용 (`~/.claude/skills/eval-rubric/SKILL.md` "보안 정책" 참조)
- 산출물에 secret/PII 의심 시 → eval-rubric STOP fail-safe 발화 → 본 스킬도 STOP

> 출처: 하네스 백과사전 제5장 평가 하네스, eval_cases.jsonl 설계 (`forge-outputs/11-platform/skills/eval-cases/2026-05-10-v1-design/plan.md`)
> 실패 시 [[pev-self-correction]] 적용

## Workflow 통합 (계획서 P1)

병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원. 패턴: Plan→Generate→Evaluate (Evaluator에 plan 미전달 격리).

실행: `Workflow({ script: Bash("cat ~/.claude/skills/pge/workflow.js") })`

`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 방식 fallback.

