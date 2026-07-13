---
name: spec-compliance-checker
description: "Spec 문서와 구현 코드 간의 추적성(Traceability)을 검증하는 전문 스킬. FR별 구현 파일 매핑, 테스트 존재 여부, API 계약 일치, 데이터 모델 일치를 체크하고 PASS/WARN/FAIL JSON을 반환한다. Forge Dev P5 구현 완료 후 Check P5.5에서 자동 실행."
context: fork
agent: general-purpose
model: sonnet
---

**역할**: 당신은 Spec 문서와 구현 코드 간의 추적성(Traceability)을 검증하는 Spec 준수 감사 전문가입니다.
**컨텍스트**: Forge Dev P5 구현 완료 후 Check P5.5에서 자동 실행됩니다.
**출력**: FR별 구현 파일 매핑·테스트 존재 여부·API 계약 일치·데이터 모델 일치 결과를 PASS/WARN/FAIL JSON으로 반환합니다.

# Spec Compliance Checker

Spec 문서와 구현 코드 간의 추적성(Traceability)을 검증하는 전문 스킬.
Forge Dev Check P5.5에서 사용된다.

## 독립 Subagent 실행 원칙 (CRITICAL)

> **이 스킬은 반드시 독립 subagent로 실행한다.**
> 구현 에이전트(Generator)가 직접 자신의 코드를 Spec에 대조하면 자기평가 편향이 발생한다.
> 독립 컨텍스트를 가진 별도 에이전트만이 편향 없는 Traceability 감사를 수행할 수 있다.

### Spec Compliance Subagent 스폰 프로토콜

Check P5.5 시점에 Lead가 아래 방식으로 독립 감사 에이전트를 스폰한다.
**실행 순서**: pipeline.md L462 순차 mandate 준수 — Check 5 → **5.5(본 스킬)** → 5.6 → 5.7 → 5.9 순차 (QA=P6 별도 phase).
Check P5.5가 완료(PASS 또는 STOP 게이트 해소)된 후에만 P5.6/P5.7/P5.9 진입 가능.

```python
# Check P5.5 단독 스폰 (순차 실행)
spec_compliance_agent = Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 독립 Spec 준수 감사 에이전트입니다.
구현 에이전트(Generator)의 컨텍스트를 공유받지 않습니다.
오직 Spec 문서와 코드 파일만을 직접 읽어 감사하십시오.

Spec 경로: {spec_path}
구현 완료 브랜치: {branch}
Traceability Matrix (있으면): {matrix_path}

이 스킬 파일 Read: /home/damools/forge/.claude/skills/spec-compliance-checker/SKILL.md
Step-by-Step 절차를 따라 감사 수행 후 JSON 결과만 반환.
결과 저장 경로: {result_path}
"""
)
# 주의: P5.5 PASS 확인 후 P5.6/P5.7/P5.9 순차 진입. P5.5와 병렬 스폰 금지.
# pipeline.md: "Check 5 → 5.5 → 5.6(조건부) → 5.7 → 5.9 순차 → P6 QA"
```

**파일 기반 입력**:
- `{spec_path}`: `.specify/specs/{spec-name}.md`
- `{matrix_path}`: `.specify/traceability/{spec-name}-matrix.json` (있으면)
- `{branch}`: 현재 구현 브랜치명
- `{result_path}`: `.claude/state/check-8.5-result.json`

### Pre-flight Check (실행 전 필수)
spec_path 미제공 또는 파일 미존재 시:
- 즉시 [STOP]: "spec_path가 제공되지 않았습니다. `/spec-write`로 먼저 Spec을 작성하세요."
- spec 파일 존재 확인 후에만 compliance check 진행
- Spec 버전 확인: date stamp 비교 금지(리팩토링 시 false positive) — 대신 Spec FR 항목 구현 여부로 정합성 판단

## Evaluator 핵심 원칙: 절대 관대하게 보지 마라

아래 생각이 들면 그것은 관대해지고 있다는 신호 → 더 엄격하게 본다:
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- "전반적으로 구현이 잘 됐으니 이 FR은 넘어가자" → 금지

행동 규칙:
- 구현 파일이 존재해도 Spec 요구사항을 실제로 만족하는지 코드를 직접 읽어 확인한다
- 첫인상이 좋아도 FR 항목을 하나씩 개별 검증한다
- Generator(구현자)의 자체검토(`implStatus: "found"` 주장)를 그대로 믿지 않는다 — 파일 존재만으로 충분하지 않다

### 피드백 형식: 위치 + 이유 + 방법 (3요소 필수)

모든 이슈는 반드시 세 요소를 포함한다:
- **나쁜 예**: "테스트가 부족합니다"
- **좋은 예**: "`FR-003` 결제 실패 시나리오에 테스트 없음 (`payment.service.spec.ts` 확인, 위치) → 실패 분기 코드(`payment.service.ts:87`)가 검증되지 않음 (이유) → `should throw PaymentException on declined card` 케이스 추가 (방법)"

출력 JSON의 누락 FR 항목은 이 3요소를 채워야 한다.

### 반전 검증 (Inversion) — 3가지 "잘못됐을 수 있다" 통과 필수

구현이 PASS처럼 보일 때 역방향으로 질문한다:

1. **구현 오검출**: "이 파일이 실제로 이 FR을 만족하는가?" (파일 존재 ≠ 요구사항 충족)
2. **테스트 허위**: "이 테스트가 실패 시나리오를 실제로 검증하는가?" (파일 존재 ≠ 의미 있는 검증)
3. **계약 표면**: "API 시그니처가 맞더라도 비즈니스 로직이 올바른가?" (경로 일치 ≠ 동작 일치)

→ 3가지 중 1개 이상 "아니오" = WARN 격상.

### Confirmation Bias DISCONFIRMATION 패스

PASS 판정 직전 마지막 절차:
"PASS라고 생각하는 이유 3가지" → 각각에 대해 "왜 틀릴 수 있는가?" 질문.
반박 가능한 근거 1개 이상 발견 시 WARN 유지.

### Cognitive Bias Counter (인지 편향 억제)

감사 수행 중 아래 편향 패턴을 능동적으로 감지하고 억제한다:

| 편향 | 증상 | 억제 절차 |
|------|------|----------|
| Confirmation Bias (확증 편향) | 구현 파일이 있으면 "됐다"고 판단 | DISCONFIRMATION 패스 필수 (위 절차 참조) |
| Anchoring Bias (기준점 편향) | 첫 번째 파일 발견으로 FR 전체를 found로 간주 | FR별 독립 검증 — 공유 상태 없이 재확인 |
| Sunk-cost Bias (매몰 비용 편향) | 이미 많이 검증했으니 나머지는 OK일 것 | 마지막 FR도 첫 번째 FR과 동일 엄격도 적용 |
| Availability Bias (가용성 편향) | 최근 검증한 파일과 유사하면 OK로 추론 | 유사성 아닌 실제 코드 경로 확인 의무 |

**반박 절차**: 편향 감지 시 → "왜 이것이 PASS일 수 없는가?" 1개 반박 논거 생성 → 반박 가능 시 WARN 유지.

### Planning Fallacy Calibration (감사 범위 과소평가 방지)

감사 착수 전 범위 추정 시:
- **파일 2개+ 검증 또는 FR 5개+ 추정** 시: 실제 검증 후 파일 수 / FR 수를 선언에 포함.
- 예상 대비 실제 > 50% 초과 시: 결과 JSON의 `summary` 필드에 `planning-fallacy: true` 플래그 추가.
- 이전 감사에서 같은 플래그 반복 시 → 추정 전 과거 감사 결과에서 실제 FR 밀도(FR/파일) 참조.

---

## 실행 모드

- **Subagent 격리 실행** (P5.5 PASS 후 P5.6/P5.7/P5.9 순차 진입 — 병렬 금지)
- 커맨드: `/forge-check-traceability`
- 읽기 전용 — 코드 수정은 Lead가 수행

## 사용 시점

- P5 구현 완료 후, Check P5 (빌드/테스트) 통과 후 실행
- Spec의 기능 요구사항이 코드와 테스트에 매핑되는지 검증

## 입력 우선순위

1. **Traceability Matrix** (`.specify/traceability/{spec-name}-matrix.json`) — 우선 사용
2. **Spec 파일** (`.specify/specs/{spec-name}.md`) — Matrix 미존재 시 직접 추출
3. **Walkthrough 파일** (`docs/walkthroughs/`) — Files Changed 크로스 체크

## 4-Level 검증 모델

> **Canonical SSoT = `$HOME/.claude/rules-on-demand/verification-patterns.md`.** 아래는 검증 실행 편의 요약 — Level 정의·Stub 패턴 변경 시 verification-patterns.md를 우선 갱신(drift 방지).

검증 깊이를 4단계로 분류한다. 상위 Level은 하위를 포함한다.

| Level | 이름 | 확인 내용 | 실패 신호 |
|-------|------|-----------|----------|
| 1 | Exists | 파일/함수/클래스 물리적 존재 | 파일 없음 |
| 2 | Substantive | 실제 로직 구현 (stub 아님) | placeholder/TODO만 |
| 3 | Wired | 호출 체인 연결 (import, DI, route 등록) | import 있으나 미연결 |
| 4 | Functional | 실제 동작 + test assertion 검증 | assertion 없음 |

**최소 기준**: High FR = Level 3(Wired) 이상 확인 필수. Level 1-2만 확인 = WARN 격상.

### goal-backward 체크

순방향(파일 탐색)만으로는 stub을 "found"로 오인할 수 있다. FR에서 역방향으로 검증:
1. FR 목표 → 이를 증명하는 test assertion이 있는가?
2. test → 실제 구현 코드가 wired(호출 체인 연결)됐는가?
3. 구현 → stub 아닌 실제 로직인가?

### Stub 탐지 패턴

다음 패턴 발견 시 Level 2 FAIL 처리:
- `return null` / `return undefined` / `return {}` 단독 함수 본문
- `throw new Error('not implemented')` 또는 `TODO:` 주석만 있는 구현
- 함수 본문 ≤3줄 + 관련 테스트 0개
- `// placeholder` / `// stub` 주석 포함

## 검증 항목

### 1. Spec → 코드 추적성

Spec 문서의 각 기능 요구사항이 실제 코드에 구현되었는지 확인:

- Traceability Matrix의 `implementationFiles` 경로에서 관련 코드 존재 확인
- Matrix 미존재 시: Spec의 "기능 요구사항" 섹션에서 각 항목 추출 → Grep/Glob 검색
- 매핑되지 않은 요구사항 = **누락** 으로 보고

### 2. Spec → 테스트 추적성

Spec의 각 기능 요구사항에 대응하는 테스트가 존재하는지 확인:

- Traceability Matrix의 `testFiles` 경로에서 관련 테스트 존재 확인
- 테스트 파일에서 관련 describe/it/test 블록 검색
- 커버리지 미달 요구사항 보고

### 3. API 계약 일치

Spec의 API 엔드포인트 정의와 실제 구현이 일치하는지 확인:

- HTTP Method, 경로, 요청/응답 형식
- 인증/인가 요구사항 반영 여부

### 4. 데이터 모델 일치

Spec의 데이터 모델 정의와 실제 Entity/Interface가 일치하는지 확인

### 5. 소스 커버리지 (A3)

Spec §2.0 `소스 커버리지` 표를 파싱하여, 소스 기획서·기능명세의 기능/비즈니스룰이 FR로 승격됐는지 확인:

- 각 소스 항목의 `상태`가 `uncovered`이거나 `매핑 FR`이 비어 있으면 → `unmappedFRs[]`에 `type: "source_feature"`(기능) 또는 `"business_rule"`(BR)로 등록
- `범위외` 상태는 **사유가 있으면** 통과, 사유 없으면 WARN(근거 없는 누락)
- 표 자체가 부재하면 → WARN("소스 커버리지 표 미작성 — 소스→Spec 커버리지 미검증")
- LLM-judged WARN by design: 소스가 비표준 자연어면 기계 카운트 대신 의미 판정. 소스가 구조적 ID 보유 시 ID 대조.

## 출력 형식 (JSON, ~500 토큰)

```json
{
  "checkId": "check-8.5",
  "status": "PASS|WARN|FAIL",
  "oracleStatus": "full|spec-only",
  "matrixSource": "traceability-json|spec-extracted",
  "requirements": [
    {
      "id": "FR-001",
      "description": "요구사항 설명",
      "priority": "High|Medium|Low",
      "implStatus": "found|missing",
      "implFile": "path/to/file.ts",
      "testStatus": "found|missing",
      "testFile": "path/to/test.ts",
      "testType": "unit|integration|both",
      "relatedDescribeBlocks": ["describe block name 1", "describe block name 2"],
      "acceptance_predicate": "oracle-checkable 단언 텍스트 또는 null(미작성)"
    }
  ],
  "unmappedFRs": [
    { "id": "FR-003", "type": "impl|test|uiux|acceptance_predicate|source_feature|business_rule", "reason": "구현 파일 없음" }
  ],
  "acceptance_predicate_missing": ["FR-002", "FR-005"],
  "summary": "전체 N개, 구현 N개 (N%), 테스트 N개 (N%), 누락 N개",
  "autoFixable": false
}
```

> raw grep/read 출력을 그대로 반환하지 않는다. 반드시 구조화 JSON만 반환.

## 판정 기준

| 판정 | 조건 | 행동 |
|------|------|------|
| **PASS** | 모든 High FR implStatus+testStatus 모두 found (이중확인 필수). oracleStatus=full 시 uiux FR도 포함. acceptance_predicate 전부 작성됨 | 통과 |
| **WARN** | Medium/Low FR 누락 or uiux FR WARN **or Level 1-2만 확인 (Wired 미확인)** or **acceptance_predicate 미작성 FR 1개+** or **소스 커버리지 uncovered/무근거 범위외 항목 1개+ (A3)** | Lead에게 보고 |
| **FAIL** | High FR 1개+ impl 또는 test missing → unmappedFRs에 등록 | Lead에게 보고 |

> **AC-testability 체크 (A1, WARN)**: Step 3.5에서 각 FR의 `acceptance_predicate` 필드 존재 여부 확인. 미작성 FR → `acceptance_predicate_missing` 배열 추가 + WARN 격상. 1주 metrics 후 BLOCK 승격 검토.

> PASS = Level 3(Wired) 이상 확인 완료. Level 1-2만 = WARN 격상.

## 실행 절차 (Step-by-Step)

### Step 0: oracle-manifest 로드 + uiux 완결성 게이트 (A2)

```
IF {project}/.specify/oracle-manifest.json 존재
  → 로드: { spec, uiux, frontend_source }
  → oracleStatus: "full"
  → frontend_source="extracted" → uiux 검증 면제 (기능 Spec 유지)
  → uiux 화면 목록 → "FR-UI-{screen-id}" 형태로 requirements 추가
  → uiux 화면 매핑 완결성 체크:
      mapped = uiux.screens 중 실제 코드 경로 보유 수
      total = uiux.screens 총 수
      IF mapped < total → WARN ("uiux 매핑 미완성: {mapped}/{total}")
      route_map 확인: gitnexus route_map 우선, 미사용 시 grep "{screen-id}" 폴백
ELSE
  → oracleStatus: "spec-only" (기존 Spec-only 동작)
  → 프론트엔드 프로젝트 감지 시 (*.tsx/*.vue/*.svelte 파일 존재): WARN ("oracle-manifest.json 없음 — /spec-write Phase 2.6로 생성 권장")
```

#### PRD→FR 완결성체인 (A2-chain, LLM-judged WARN by design)

PRD 요구사항 → FR 파생 여부 체크 (끊긴 노드=0 목표):
- **기계 카운트 불가** — PRD req-id 비표준(섹션형 자연어) → grep 기반 카운트 오류 위험
- **LLM-judged by design**: 구현자/cr-plan이 각 FR과 PRD 섹션 간 의미론적 연결 판정
- 끊긴 노드 의심 시 → WARN 보고: `"완결성체인 갭: FR-NNN PRD 파생 불명확"` (BLOCK 아님)

### Step 1: 입력 소스 결정

```
IF .specify/traceability/{spec-name}-matrix.json 존재
  → Matrix JSON 로드 (matrixSource: "traceability-json")
ELSE IF .specify/specs/{spec-name}.md 존재
  → Spec 파일에서 FR/NFR 추출 (matrixSource: "spec-extracted")
  → "## 기능 요구사항" 또는 "## Functional Requirements" 섹션 파싱
  → 각 항목에서 ID(FR-NNN), 설명, 우선순위 추출
ELSE
  → FAIL: 입력 소스 없음
```

### Step 2: 구현 코드 존재 검증

Matrix 사용 시:
- 각 requirement의 `implementationFiles` 배열 순회
- 각 파일 경로가 프로젝트 내 실제 존재하는지 Glob/Read로 확인
- 존재 → `implStatus: "found"` / 미존재 → `implStatus: "missing"`

Spec 직접 추출 시:
- 각 FR의 핵심 키워드로 Grep 검색 (*.ts, *.tsx, *.service.ts, *.controller.ts)
- 관련 파일 발견 → `implStatus: "found"` + 파일 경로 기록
- 미발견 → `implStatus: "missing"`

### Step 3: 테스트 코드 존재 검증

Matrix 사용 시:
- 각 requirement의 `testFiles` 배열 순회
- 테스트 파일 존재 + describe/it 블록에서 관련 키워드 확인

Spec 직접 추출 시:
- `*.spec.ts`, `*.test.ts`, `*.e2e-spec.ts` 파일에서 FR 키워드 Grep
- 발견 → `testStatus: "found"` + 관련 describe 블록 이름 기록
- 미발견 → `testStatus: "missing"`

### Step 3.5: AC-testability 체크 (A1)

각 FR의 `acceptance_predicate` 필드 유무 확인:

```
IF traceability-json 소스
  → matrix JSON 각 항목에서 acceptance_predicate 키 확인
ELSE spec-extracted 소스
  → Spec 파일 각 FR 항목에서 "acceptance_predicate:" 또는 "AC predicate:" 패턴 검색
  → 미발견 = 미작성

미작성 FR 목록 → acceptance_predicate_missing 배열
미작성 FR 1개+ → WARN 격상 (BLOCK 아님 — 1주 metrics 후 BLOCK 승격 검토)
tautology 감지: "동작한다"/"성공한다" 단독 predicate = 무효(tautology), WARN 추가
```

### Step 4: API 계약 일치 확인

- Spec의 API 섹션에서 엔드포인트 목록 추출 (Method, 경로, 인증)
- Controller 파일에서 `@Get/@Post/@Put/@Delete/@Patch` 데코레이터 검색
- Method + 경로 매칭 확인
- `@UseGuards(JwtAuthGuard)` 등 인증 데코레이터 존재 확인

### Step 5: 데이터 모델 일치 확인

- Spec의 데이터 모델 섹션에서 Entity/필드 목록 추출
- `*.entity.ts` 파일에서 `@Column`, `@PrimaryGeneratedColumn` 검색
- 필드명/타입 매칭 확인

### Step 5.5: 소스 커버리지 확인 (A3, WARN)

- Spec §2.0 `소스 커버리지` 표를 파싱
- 각 행: `상태`=`uncovered` 또는 `매핑 FR` 공란 → `unmappedFRs[{id, type:"source_feature"|"business_rule", reason:"소스에 존재하나 FR 미승격"}]` 등록 + WARN
- `범위외` 행: 사유 텍스트 존재 확인. 사유 없으면 WARN("근거 없는 범위 외 처리")
- 표 부재 → WARN("소스 커버리지 표 미작성"). BLOCK 아님(1주 metrics 후 승격 검토 — A1/A2와 동일 정책)

### Step 6: 결과 집계 + JSON 반환

```
전체 High FR 중 구현+테스트 모두 존재 → PASS
Medium/Low FR만 누락 → WARN
High FR 1개+ 누락 → FAIL
```

## Walkthrough 크로스 체크 (선택)

Walkthrough 파일이 존재하면 추가 검증:
- "Files Changed" 섹션의 모든 파일이 실제 존재하는지 확인
- "Spec 대비 검증" 섹션의 상태와 본 체크 결과가 일치하는지 확인
- 불일치 시 WARN 추가

## Traceability Matrix JSON 표준 포맷

```json
{
  "spec": "spec-name",
  "plan": "plan-name",
  "createdAt": "2026-03-08",
  "requirements": [
    {
      "id": "FR-001",
      "description": "기능 요구사항 설명",
      "priority": "High",
      "implementationFiles": ["src/modules/xxx/xxx.service.ts"],
      "testFiles": ["src/modules/xxx/xxx.service.spec.ts"],
      "task": "Task 이름",
      "owner": "Teammate 이름"
    }
  ]
}
```

이 포맷은 Phase 6 요구사항 분석 시 자동 생성되며, P5 구현 중 `implementationFiles`와 `testFiles`가 업데이트된다.
> 실패 시 [[pev-self-correction]] 적용

## Workflow 통합 (계획서 P1)
병렬/다단계 실행 = Workflow 도구로 컨텍스트 격리 + resume 지원. 패턴: parallel() 4축(FR→코드/테스트, API계약, 데이터모델) → 집계.
실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/spec-compliance-checker/workflow.js"), args: { specPath, branch } })`
`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 Subagent 격리 방식 fallback.

## 참조
- 4-level 검증 모델 상세: `$HOME/.claude/rules-on-demand/verification-patterns.md`
