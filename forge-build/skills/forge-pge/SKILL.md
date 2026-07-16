---
name: forge-pge
description: "Planner-Generator-Evaluator 하네스. Evaluator만 subagent로 격리해 독립 검수한다. spec 없이 개발할 때 사용한다. 버그 수정은 /forge-fix."
---

**역할**: 당신은 PGE 하네스를 **직접 실행**하는 에이전트입니다. Planner와 Generator를 메인 컨텍스트에서 수행하고, Evaluator만 subagent로 스폰합니다.
**컨텍스트**: 복잡한 구현/생성 작업에서 품질이 결과를 결정할 때 사용합니다.
**출력**: 최종 산출물 + PGE 실행 보고서 (`docs/pge/YYYY-MM-DD-{task-name}-pge-report.md`)

> **spec 없는 개발 전용** 하네스 — 버그 수정은 `/forge-fix` 사용.

# PGE — Planner-Generator-Evaluator 하네스

AI 출력 품질의 핵심 변수는 모델이 아니라 **구조(하네스)**다.

**Grader Isolation 원칙**: Evaluator subagent는 Generator 컨텍스트를 상속받지 않는다. 독립 판단 보장.

**아키텍처 원칙**:
- **Planner + Generator**: 메인 컨텍스트에서 직접 실행 → 이전 분석/실패 이력을 자연스럽게 참조
- **Evaluator**: subagent로 격리 → Generator의 의도/가정을 모른 채 코드 자체만 보고 독립 검수
- **자기평가 금지**: Generator가 만든 코드를 Generator가 평가하지 않는다

**forge-implement와의 관계 (oracle 가용성 분기 — 병합하지 않음)**: spec이 있는 구현은 `/forge-implement`가 담당하며 Evaluator 역할을 qa(Check 5.8)에 위임한다 — forge-pge는 spec이 없는 국면 전용이고, 여기서는 forge-pge 자체 Evaluator subagent가 그 독립-채점자 역할을 수행한다. 즉 둘은 하나의 구현 하네스 패밀리(oracle 가용성 분기)이며 병합하지 않는다. (라우팅 결정표: `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/harness-family-map.md` 참조.)

## 사용법

```
/forge-pge <task description>
/forge-pge --rubric custom  # 커스텀 Rubric 사용
/forge-pge --cycles 2       # maxCycles=2 (기본 3). max_cycles·same_issue 트리거가 이 값에 연동됨 (하드코딩 아님)
/forge-pge --coder codex:max  # Generator를 Codex로 라우팅(Evaluator는 독립 Claude 고정). claude:tier|codex:tier|sol|terra|luna|ab
/forge-pge --coder claude:high --advisor sol  # Opus 구현 + Codex sol advisor(무료·독립). --advisor sol|terra|opus|fable
```

## 적용 대상

| 적합 | 부적합 |
|------|--------|
| 코드 기능 구현 | 단순 정보 조회 |
| 기획서/문서 초안 작성 | 파일 탐색 |
| 에셋/이미지 생성 기획 | 1회성 수정 |
| — | 설정 변경 |

> **버그 수정은 여기 해당 없음** — `/forge-fix` 사용 (PGE = spec 없는 개발 전용).

### 진입 트리아지 (fast-path — P1/P2, WARN-우선)
PGE 기구(Rubric/Sprint Contract/Evaluator/Codex 2차)는 무겁다. 진입 시 아래를 먼저 판정한다:

- **P0 harness-family 강제 판별 (2026-07-10)**: 사용자가 "미구현 = pge"로 지목했어도 그대로 진입하지 않는다 — `harness-family-map.md` 3분기(spec有→`/forge-implement` / spec無 생성→pge / 버그·증상→`/forge-fix`)를 **실측**(`.specify/specs/` 존재, 증상 문구 여부)으로 먼저 판정하고, 불일치 시 올바른 하네스로 재라우팅 제안. 실증: 2026-07-09 optool 세션 2/2가 pge 부적합(정산 4메뉴=implement, 시드=직접) — "미구현처럼 보임"의 다수는 미연동·미머지·설정 드리프트다.
- **P0b 1회성 상태변경 차단**: QA 시드·데이터 백필 같은 1회성 작업은 PGE(반복 개선 루프) 부적합 — §적용 대상 표 기준으로 거부하고 직접 실행 or 스크립트를 제안한다.
- **P0c pre-work branch sweep**: 착수 전 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/pre-work-branch-sweep.md` 실행 — 대상 도메인의 미머지 완성물이 있으면 재작성 금지.
- **P1 사소 편집 fast-path**: 변경 예상 규모가 **1~2파일·수 줄**(콘텐츠 트윅·문구·상수 등)이면 → **"PGE 부적합 — 직접 외과 수정 권고" WARN** 후 경량 경로(직접 편집)로. 무거운 PGE를 돌리지 않는다(커맨드-행동 불일치 방지). 판정 모호·규모 초과 시 정상 PGE 진행(fail-open).
- **P2 조사/제안 요청 라우팅**: 사용자 의도어가 **"제안/체크/분석/확인/봐줘"류(구현 아님)**면 → PGE(구현 전용) 진입 대신 **조사 리포트 + 결정 게이트(AskUserQuestion — 질의 방식은 `rules-on-demand/grilling-protocol.md` 준수: 권고안+근거 동반, 사실은 조사해 `(detected)` 표기)**로 라우팅(`dev-workflow-rules §"리서치만/분석만/확인만 → 직접 응답"` 정합). PGE Phase 2 Generator는 코드를 생성하므로 "제안만" 요청에 부적합. "구현/만들어/추가해"류 명시 시에만 정상 PGE.

---

## 실행 워크플로우

**스타일 정합 pre-flight (P3, WARN — 증분 UI 셰이핑 마찰 방지)**: 착수 전 (a) prettier config 부재 + (b) eslint↔prettier 스타일 충돌(코드베이스 실제 스타일 vs prettier 기본값, 예: 작은따옴표 코드에 큰따옴표 기본 prettier)을 감지하면 WARN. 미정합 시 pre-commit `prettier --write`가 전파일 재포맷 → diff 부풀림 + 편집 워크트리 vs 커밋 브랜치 발산(증분 패치 깨짐·워크트리 재구성 반복)을 유발한다. 권고: 세션 시작 시 스타일 정합 1회 처리(prettier config 정렬 또는 `eslint-config-prettier` 정렬). non-blocking(감지·경고만, forge-fix에도 동일 적용).

### Phase -1: Design Source 확정 (신규 UI 화면 빌드 한정)

> **적용 조건**: 산출물이 **신규 UI 화면 빌드**(트랙 B — 웹/앱 화면을 처음 생성)일 때만 실행한다. 기존 화면 수정·버그수정·비-UI 산출물(서버 로직/문서/게임 연출 등)은 이 Phase를 **skip**하고 바로 Phase 0으로 진행한다(1줄 명시: "Phase -1 스킵 — 신규 UI 화면 아님").

**이유**: 사용자 규칙(`tool-rules.md`) — "모든 UI/UX 작업의 시작점은 Claude Design(claude.ai/design)". Design source 없이 Generator가 UI를 생성하면 rubric Phase 0의 anti-slop 축(G7·G10-b, 라인 62)이 사후 감점만 할 뿐 애초에 근거 없는 디자인이 만들어지는 것을 막지 못한다 — Phase -1은 그 사전 게이트다.

**절차**:
1. Design source 확정 순서 (먼저 매칭되는 것을 채택):
   a. **claude.ai/design 컴포넌트 라이브러리** — 사용자가 제공한 Claude Design 링크/export 또는 프로젝트에 이미 저장된 디자인 산출물(`{project_root}/DESIGN.md`, `05-design/` 등) 존재 확인
   b. 없으면 **레포 내 자매 화면(sibling-screen) 패턴** 탐색 — 동일 프로젝트의 유사 화면(레이아웃/컴포넌트/토큰)을 재사용 가능한지 확인 (Grep/Glob로 유사 라우트·컴포넌트 디렉토리 탐색)
   c. 둘 다 없으면 → **[STOP] DESIGN_SOURCE_ABSENT (WARN, GUIDE-STOP)**: "신규 UI 화면인데 확정된 design source가 없음 — Claude Design(claude.ai/design)에서 컴포넌트를 먼저 만들거나, 재사용할 자매 화면을 지정하라. 디자인 소스 없이 임의 생성 진행 시 AI 슬롭 위험." Human이 (i) Claude Design 산출물 제공, (ii) 자매 화면 명시적 지정, (iii) "임의 생성 승인"(명시적 override) 중 하나를 선택할 때까지 Generator(Phase 2) 진입 보류. AD-168 WARN-first — 자동 hard-BLOCK 아님, Human 확인 없이 침묵 진행도 아님.
2. 확정된 design source를 `PGE_SPEC.md` 상단 `## Design Source` 섹션에 기록 (경로 또는 링크 + 채택 사유 a/b/c). Phase 0 Rubric의 anti-slop 축·Phase 2 Generator가 이 섹션을 참조한다.

### Phase 0: Rubric 확정

Evaluator가 사용할 평가 기준을 Generator 실행 **전**에 명시한다.

기본 Rubric (작업 유형에 따라 조정):

| 항목 | 가중치 | 불합격 기준 |
|------|:------:|-----------|
| 요구사항 충족도 | 40% | 핵심 요구사항 미충족 시 즉시 FAIL |
| 품질/완성도 | 30% | AI 슬롭(무의미 반복·복붙·미완성) 감지 시 0점 |
| 구조/아키텍처 | 20% | 설계 의도 위반 시 0점 |
| 문서/명확성 | 10% | 주요 내용 누락 시 5점 이하 |

**UI 태스크(트랙 B) rubric 보강 (G7·G10-b)**: 산출물이 UI면 "품질/완성도" 축을 구체화한다 — (a)프로젝트 `{project-root}/DESIGN.md` 존재 시 committed direction·토큰 계층(primitive→semantic→component)·간격/타이포 스케일 준수 여부, (b)anti-slop = `forge-check-ui` 블랙리스트 위반(shadcn-gray/Inter방치/cardocalypse/획일 fade-in 등) 시 감점. "museum quality"를 이 기준으로 조작 가능하게(측정가능) 만든다. reference 표의 `design-tokens/design-rules.md`도 로드.
**rubric = 대리지표(G15)**: Evaluator는 점수를 좇지 말 것 — 점수 최적화·무한 폴리싱은 reward hacking. eval_ids 격리(이미 보유)에 더해, Evaluator는 목표 점수를 모른 채 결함 유무로 판정(score-blind).

**PASS 기준**: 합산 70점 이상 + 요구사항 즉시 FAIL 없음

## Sprint Contract (Generator ↔ Evaluator 합의 형식)

PGE Workflow 시작 시 Planner가 다음 contract를 작성. Generator·Evaluator 양쪽이 참조.

```yaml
sprint_contract:
  scope: "이번 반복에서 다룰 것 (구체적 기능 / 파일 / 출력)"
  out_of_scope: "명시적 제외 (다음 반복에서 다룸 또는 영구 제외)"
  done_criteria: "Evaluator가 PASS 판정하는 객관적 조건"
  eval_ids: "done_criteria별 canonical 평가 id 목록 ({requirement}:{check} kebab). Evaluator는 이 목록의 id만 사용 — 신규 wording 금지"
  rollback_trigger: "이 조건 충족 시 즉시 STOP + 사용자 에스컬레이션"
```

> **eval_ids = id 안정성 레지스트리 (필수)**: stop-condition 결정표(regression·same_issue·data_integrity)는 사이클 간 **byte-identical id**를 전제한다. Evaluator(비결정적 subagent)가 같은 결함에 사이클마다 다른 wording의 id를 붙이면(예: `payment-api:stripe-validation` ↔ `payment-api:stripe-response-validation`) regression이 조용히 누락된다(false-negative). 이를 막기 위해 Planner가 done_criteria마다 canonical id를 **여기 고정**하고, Evaluator는 이 목록에서만 id를 선택한다. 목록에 없는 신규 결함 발견 시 → Evaluator가 새 id를 제안하고 다음 사이클부터 레지스트리에 추가(append). id 변형·재명명 금지.
> **타이밍 (false-stop 방지)**: 신규 id는 **발견 당-사이클 items[]에 즉시 포함**(보통 FAIL verdict)되므로 rubric_all_pass(순위2)의 당-사이클 커버리지 계산에 이미 들어간다. "다음 사이클부터 레지스트리 추가"는 **후속 사이클의 커버 floor 갱신용**일 뿐 — 당-사이클 items에 그 id가 존재하므로 "커버 누락"으로 오판되지 않는다. 즉 동적 append와 당-사이클 커버 요구는 충돌하지 않는다.

> Sprint Contract 작성 예시(YAML, 결제 API 케이스) → `reference.md §Sprint Contract 예시` (필요 시 Read)

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

- **결과**: `forge-outputs/docs/reviews/plan/{date}-forge-pge-spec-{slug}.{md,json}`
- **PASS/WARN** → Phase 2 진입
- **FAIL** → Planner 재실행 (Codex issues[]를 PGE_SPEC.md `## 이전 시도 실패 이력` 섹션에 추가하여 같은 갭 반복 방지)
- **비용**: ChatGPT OAuth `gpt-5.5` = $0.00. API key + `gpt-5-mini` = ~$0.02

### Phase 2: Generator (메인 컨텍스트에서 직접 실행)

> **subagent 스폰하지 않는다. 메인 대화에서 직접 수행한다.**
> 이유: Planner 분석 결과와 이전 실패 맥락을 그대로 보유한 상태에서 구현해야 한다.

**Generator 실행자 라우팅 (--coder, DMC 트랙C — 2026-07-15)**: `--coder` 지정 시 **Generator(코드 생성)만** Claude/Codex/ab로 라우팅한다. **Phase 3 Evaluator는 항상 독립 Claude subagent 고정**(무변경) — Grader Isolation 원칙(자기평가 금지)은 어느 모델이 생성했든 유지된다. 즉 Codex가 Generator여도 Evaluator는 Codex를 상속·검수하지 않는다(구현자≠검증자).
  - CODER_SPEC 파싱 → `MODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$CODER_SPEC")`. **미지정 = 기존 메인 컨텍스트 직접 생성(무변경, no-op)**.
  - **codex:tier** → `mcp__codex__codex`(sandbox=workspace-write, approval-policy=on-request, cwd=현재 워크트리, model=$MODEL). PGE_SPEC.md·Sprint Contract·Rubric·Planner 분석을 프롬프트에 주입(Codex 재탐색 방지). Codex 산출물은 표시·커밋 전 `secret-content-scan.sh` 경유(LN-03 마스킹). Codex는 메인 컨텍스트를 상속하지 못하므로 Planner 결과를 명시 주입해야 한다(위 no-op 경로의 "맥락 보유" 이점은 Codex 라우팅 시 프롬프트 주입으로 대체).
  - **Unity/게임 프로젝트 감지(`ProjectSettings/ProjectVersion.txt` 또는 Unity .cs 수정 포함) → Claude 폴백**. Codex Linux 샌드박스는 Unity batchmode 불가(실측 확정 2026-07-15). PGE의 Unity .cs 경로(Phase 2 항목 2·6)는 Codex로 라우팅하지 않는다.
  - **advisor tier-gate (2026-07-16)**: `GATE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-tier-gate.sh" "$CODER_SPEC")`. **`skip`**(Generator≥Opus: sol/terra/opus/fable) → Phase 1.5 Codex Plan Review의 strategic 조언 성격은 유지하되 Opus advisor 접근조언은 **생략**(tier 역전 방지). **`advise`**(Generator<Opus) → advisor 조언을 Generator 프롬프트에 주입. ⚠️ **bounding/STOP·T4는 tier 무관 유지**. (Phase 3 Evaluator 독립은 별개 — 무변경.)
  - **--advisor 오버라이드 (2026-07-16)**: `--advisor <spec>`(sol/terra/opus/fable)로 advisor 모델을 경우별 선택. `AMODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$ADVISOR_SPEC")` → 결과가 gpt/codex면 **`mcp__codex__codex`(sandbox=read-only)로 advisor 스폰**(sol/terra, Plus 정액=무료·독립 관점), claude면 `Agent(subagent_type="advisor-strategist", model=$AMODEL)`(opus/fable). 미지정=현행(Opus + tier-gate). ⚠️ **독립성: advisor 벤더 ≠ 구현자 벤더 권고**(같은 벤더=자기훈수 무의미 → Codex 구현엔 opus/fable advisor, Claude 구현엔 sol/terra advisor). fable은 **현재 구독 정액(종량 아님, 2026-07-16 사용자 확인)**이라 sol과 동급으로 자유 선택 가능(advisor-model-resolve 가드=kill-switch·가용성 폴백만 유지).
  - **coder-attribution (기계 강제)**: Generator 직후 `coder-attribution.sh write "$WORKTREE" "$MODEL"` → Phase 1.5 Codex Plan Review 및 후속 cr-* 진입 시 `MODE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-attribution.sh" review-mode "$WORKTREE")`를 `--cr $MODE`로 전달(codex Generator→`degrade`=codex 레그 배제 / 그 외→`on` / 무마커→`on` fail-open). Phase 3 Evaluator(Claude subagent)는 원래 독립이라 별개. 자기검수 방지 = 스크립트 강제.
  - kill-switch `FORGE_DUAL_CODE=off` → codex 요청도 Claude(메인) 대체. Codex 미가용 = Claude 폴백(로그+경고, fail-open). 모델 id = `model-registry.json` SSoT(버전무관).

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

> **변경 파일 목록 = 기계적 산출 (필수)**: `git diff --name-only {base}...HEAD`(또는 `git status --porcelain`)로 산출한다. Generator나 사람이 손으로 골라 전달하지 않는다 — principal-agent 갭(Generator가 자신에게 유리한 파일만 선별해 넘기는 위험) 차단.

#### 트랙 라우팅 (변경 파일 기반 자동 감지)

| 트랙 | 감지 조건 | 호출 대상 | 비고 |
|------|----------|----------|------|
| **A. 기능** | 서버/로직 코드 변경 (.cs service, .ts service, .py) | `verify.sh code` + 데이터 흐름 트레이싱 | 항상 실행 |
| **B. 웹/앱 UI** | .tsx/.jsx/.css/.html 변경 | `/visual-loop` + `/playwright-parallel-test` | 해당 시만 |
| **C. 게임 연출/UI** | Unity .cs + .prefab + .anim 변경 | `/game-qa` | 해당 시만 |

트랙은 **중복 가능** — 서버+클라이언트 동시 변경이면 A+C 모두 실행.

#### 프로젝트-로컬 도구 부재 처리 (fail-open, WARN — Node-Repair 패턴 준용)

트랙 A의 `verify.sh`, 트랙 B의 `/visual-loop`는 프로젝트마다 존재 여부가 다른 **프로젝트-로컬 도구**다. 부재를 브릭(무한 실패·정지)이 아니라 WARN + 대체 경로로 처리한다(`forge-implement.md §Node-Repair` — 진단→대체 절차→재시도의 fail-open 정신을 도구-부재 케이스에 적용):

1. **진단 먼저**: 호출 직전 존재 확인 — `test -f "{project_root}/verify.sh"` / `/visual-loop` 스킬 설치 여부(`claude plugin list` 또는 `.claude/skills/visual-loop/` 존재).
2. **verify.sh 부재 시 (트랙 A)**: `WARN: verify.sh 없음 — {project_root}/package.json의 test/build 스크립트(`npm test`, `npm run build`) 또는 언어별 표준 명령(pytest, dotnet test 등)으로 대체`. 대체 명령도 없으면 "**빌드**" 단계만으로 축소하고 QA_RESULT에 `verify.sh: SKIPPED (not found, no fallback)` 명시 — 트랙 A 전체를 실패 처리하지 않는다.
3. **`/visual-loop` 부재 시 (트랙 B)**: `WARN: /visual-loop 미설치 — /playwright-parallel-test 단독으로 진행`(트랙 B는 이미 2개 도구를 병기하므로 하나만 남아도 검증 자체는 유지). 둘 다 없으면 트랙 B를 `PGE_QA_RESULT.md`에 `SKIPPED (no UI test tool available)`로 기록하고 Phase 4 Evaluator에 그 사실을 전달(Evaluator가 UI 검증 부재를 감안해 판정, 침묵 PASS 금지).
4. **fail-open 원칙**: 도구 부재로 PGE 전체를 중단시키지 않는다(AD-168 WARN-first + 전역 무블로킹 롤아웃 §fail-open). 단 SKIPPED 사실은 반드시 QA_RESULT·Evaluator 전달 정보에 명시 — 검증 없이 조용히 PASS 처리되는 것을 방지.

#### 트랙 A: 기능 테스트

- **DB 격리 실증 게이트 (P0)**: 트랙 A가 실DB에 접촉(db_query/seed/E2E write)하기 전 필수 — `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/assert-db-isolation.sh"`. `DB_ISOLATION: WARN`(격리 미증명) 시 격리 DB(*_test/*_qa) 지정 후 재확인. WARN-first(non-blocking, `FORGE_DB_ISOLATION_ENFORCE=1` opt-in BLOCK, fail-open).

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
- 코드 diff (변경된 파일 목록 — `git diff --name-only {base}...HEAD`(또는 `git status --porcelain`)로 **기계적 산출**, Generator/사람이 손으로 고르지 않음 + git diff 본문)
- (게임/Unity 트랙[트랙 C] 한정) `{project_root}/.claude/reference/pge-game-evaluator-rubric-detail.md` — **파일 존재 시에만** 전달. 부재 시 WARN + Phase 0 기본 Rubric(요구사항충족도/품질완성도/구조아키텍처/문서명확성)만으로 진행(fail-open). 비-게임/비-Unity 트랙(A/B)은 이 항목 자체를 스킵.

**전달하지 않는 정보**: Generator의 의도, 시도 과정, 실패 이력 (독립 판정을 위해)

Evaluator 수행:
1. 루브릭 파일 읽기 (게임/Unity 트랙 한정 — 파일 존재 시. 부재하거나 비-게임 트랙이면 Phase 0 기본 Rubric 사용)
2. PGE_SPEC.md 읽기 (참조 컨텍스트 확인)
3. Phase 0의 Rubric으로 항목별 점수 산정
4. QA 결과 반영 — 잔존 이슈가 있으면 감점
5. **항목별 PASS/FAIL 판정 + 구조화 id 부여 (필수)**:
   - 모든 평가 항목(`{requirement}:{check}` kebab-case)에 대해 PASS 또는 FAIL을 개별 선언한다.
   - FAIL 항목 형식: `FAIL [{requirement}:{check}] — {위치} / {이유} / {방법}` (위치+이유+방법 3요소 필수)
   - PASS 항목 형식: `PASS [{requirement}:{check}]`
   - **CRITICAL 보안 발견 시**: 점수·등급 무관하게 `SECURITY_CRIT [{requirement}:{check}] — {발견 내용}` 을 별도 섹션에 명시한다.
   - id 규칙: 동일 결함은 사이클이 달라도 동일 id. 설명 wording 변경 금지. **id는 Sprint Contract `eval_ids` 레지스트리에서만 선택** — 목록에 없는 신규 결함만 새 id 제안(다음 사이클부터 레지스트리 append). 변형·재명명 금지(regression false-negative 방지).
6. **절대 관대하게 보지 마라**: Generator 자체검토(SELF_CHECK.md)를 그대로 믿지 않는다
7. **사이클 레코드를 `PGE_EVAL_HISTORY.jsonl`에 append** (덮어쓰기 금지):
   ```json
   {"cycle": <N>, "score": <합산 점수>, "items": [{"id": "<requirement>:<check>", "verdict": "PASS|FAIL"}, ...], "security_crit": [<id>, ...]}
   ```
   이 레코드가 regression(oscillation 포섭)·same_issue·security_crit·data_integrity 판정의 유일한 데이터 소스다.

**출력**:
- `{project_root}/.claude/state/PGE_QA_REPORT.md` (Rubric 판정 전문 — 사이클마다 덮어씀)
- `{project_root}/.claude/state/PGE_EVAL_HISTORY.jsonl` (사이클별 누적 레코드 — append 전용, 절대 덮어쓰지 않음)

### Phase 4.5: Codex 2차 리뷰 (자동, 이중 게이트)

Evaluator 산출 직후 Codex 코드 리뷰 자동 실행. Evaluator(Claude) 동일-모델 맹점 보완.

```bash
/codex-review --stage code --target <PGE diff>
```

**Evaluator 점수별 정책**:
- **80점+ (PASS)**: Codex 일반 리뷰 (`--effort medium`) — 확인 차원
- **60~79점 (경계)**: Codex 적대적 리뷰 (`--effort high`) — 추가 검증
- **60점 미만 (FAIL)**: Codex 일반 리뷰 생략 — 이미 명백한 실패. **단 변경 파일이 보안 민감 경로/확장자에 해당하면 → Codex 보안 관점 리뷰 1회 실행**(`/codex-review --stage code --target <PGE diff>`, 프롬프트에 "보안 관점 우선" 명시). 점수·Evaluator 분류 무관 — under-report 보완. 보안 민감 surface(가이드): `auth/login/session/token/password/crypt/payment/billing/checkout/secret/credential` 키워드, `api·routes·controllers·handlers·middleware` 경로, `.env/.pem/.key` 확장자.
  > **결정론 enforcement = B2 트랙 (정직성)**: 변경 파일 경로를 git에서 결정론적으로 추출(stage/commit/working-tree 전부 + diff base 정확)해 자동 발동하는 것은 inline prose bash로는 신뢰 불가(diff base 누락·동시성·exit-code swallow). 진짜 mechanical 보안 게이트는 **B2 훅(Human 승인)** 영역 — `b2-token-enforcement-design.md` 패턴. 본 spec은 LLM 실행 **의도**만 규정.

> ⚠️ **security STOP = best-effort advisory (B2까지)**: 본 보안 게이트(gate G·security_crit·security_event)는 전부 비결정적 LLM의 "의도" 실행이다. Evaluator가 SECURITY_CRIT를 미방출하거나 루프가 append/STOP를 누락하면 또 다른 비결정 단계가 잡지 못해 CRITICAL이 조용히 누락(fail-open)될 수 있다. **운영자·리뷰어는 이 보안 STOP을 hard gate가 아니라 best-effort로 취급**하라 — 진짜 mechanical 강제는 B2 훅(Human 승인). 이하는 그 전제 위의 의도 규정:
> ⚠️ **security_crit 예외 (양방향)**: (a) Evaluator가 `SECURITY_CRIT`를 보고하면 점수 정책 무관 Phase 5 `security_crit` 중단 즉시 발화 — Codex 생략 여부 무관, Evaluator 단독으로 **STOP 보장**(best-effort). (b) 역으로 Evaluator 누락 위험은 위 보안 민감 surface Codex 리뷰로 *완화*. Codex가 CRITICAL을 발견하면 루프(메인)가 그 finding을 **별도 `security_event` 라인으로 JSONL에 append**(새 라인 = append-only 유지 + 중단/재개에도 보존, durable) → Phase 5 순위1에서 사이클 `security_crit[]` ∪ `security_event`로 [STOP]. **in-memory 휘발 보유 금지** — 보안 신호 소실(fail-open) 방지.

**Evaluator vs Codex diff 처리** (Plan v2-C2 spec 기반):
- `agreement` → Evaluator 점수 확정
- `disagreement` → Phase 4.6 (Opus Advisor) 호출
- `extension` (Codex가 추가 이슈 발견) → Codex issues PGE_QA_REPORT.md에 추가, 사용자 컨펌 후 진행 (자동 재평가 X — code stage = blocking NO per v2-C1)

**출력**: `PGE_QA_REPORT.md`에 Codex 섹션 추가 (`forge-outputs/docs/reviews/code/{date}-forge-pge-{slug}.md` 링크).

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
- Advisor가 PASS 의견 → **[STOP] Human 승인 게이트** 필수. Evaluator·Codex 2판정을 뒤집는 오버라이드이므로 advisor 단독 자동 확정 금지 — advisor 의견 + 근거를 Human에게 제시하고 승인 후에만 최종 PASS로 확정(advisor는 조언자, 최종 판정권자는 Human)
- Advisor가 FAIL 동의 → FAIL로 Phase 2 재실행 (기존 판정과 일치 — 오버라이드가 아니므로 자동 진행)
- 응답은 400~600토큰 이내로 제한

### Phase 5: 피드백 루프 (stop-condition 결정표)

사이클 N 완료(Evaluator + Codex + EVAL_HISTORY append) 후, **아래 결정표를 우선순위 순으로 1회 평가**한다. 먼저 매칭되는 행에서 즉시 행동하고 이후 행은 평가하지 않는다(상호 배타 보장). 모든 판정은 `PGE_EVAL_HISTORY.jsonl` 누적 레코드의 **구조화 id**만 사용 (string fuzzy 금지 — 루프-커널 표준 §2). **유일한 예외 = `rollback_trigger`**(순위1) — Human이 작성한 prose hard-STOP 조건이라 structured-id가 없고 자연어 판정을 허용한다(명시적 carve-out, 그 외 전 조건은 id-only).

**`maxCycles` = `--cycles` 인자 (기본 3).** 아래 표의 N=maxCycles·N<maxCycles는 이 값에 연동(하드코딩 아님). same_issue는 3사이클 연속 FAIL 휴리스틱이라 `maxCycles≥3`에서만 도달 가능. ⚠️ **`--cycles 1~2`면 regression(N≥2)·same_issue(N≥3) 가드가 모두 비활성** = 회귀 보호 없는 단발/이중 모드(명시적 선택 시에만 권장 — 기본 3 유지 권고).

**전제 게이트 G (평가 가능성 — 번호 없음)**: `data_integrity`. 사이클 N 레코드(regression 평가 시 N-1 포함) 누락·JSON 파싱불가면 결정표 평가 자체가 불가 → 즉시 **[STOP] DATA_INTEGRITY**. 아래 [루프 지시] 게이트 G가 규정(검증 = LLM 실행 의도; 진짜 mechanical 파서 = B2 트랙). ("우선순위"가 아니라 "평가 가능 여부" 게이트라 번호를 빼 1↔2 순위 모순 제거.)

| 순위 | 조건 | 트리거 (EVAL_HISTORY 기반) | 발화 사이클 | 행동 |
|:---:|------|---------------------------|:----------:|------|
| 1 | `security_crit` / `rollback_trigger` | 사이클 N 레코드 `security_crit[]` ≠ ∅ **OR** JSONL에 `security_event` 라인 존재(Codex CRITICAL을 별도 라인 append — durable, append-only) 또는 Sprint Contract `rollback_trigger` 충족(prose 조건 — structured-id 예외, 아래 주) | N≥1 | **[STOP]** Human (메시지 `[SECURITY_CRIT]` / 비보안은 `[ROLLBACK]`) |
| 2 | `rubric_all_pass` | 사이클 N items가 **eval_ids 레지스트리 ∪ 이전 PASS id 합집합을 커버** AND **items[] 전체**(커버 집합 + 신규 발견 id 포함) verdict=PASS (FAIL이 단 1개라도 items[]에 있으면 — 신규 비등록 결함이라도 — SUCCESS 아님. 항목판정 authoritative; 합산<70이면 재산정 1회) | N≥1 | **SUCCESS** → 산출물 저장 + 보고서. **커버 누락 OR items[] 내 FAIL 존재 시 SUCCESS 아님** → N≥2면 순위3(regression) 재확인, **N=1이면 continue(재시도)** |
| 3 | `regression` | (N-1 PASS id) ∩ (N FAIL id **또는 N items에서 사라진 id — 1회 re-emit 재확인 후**) ≠ ∅. ※N-1 레코드 누락/파싱불가 시 게이트 G로 [STOP] DATA_INTEGRITY | N≥2 | **[STOP]** Human — 이전 통과 깨짐(위험). *oscillation 첫 flip 포섭* |
| 4 | `same_issue` (kernel 실호출, 아래 [루프 지시] 4번) | 동일 id가 3사이클 연속(N-2·N-1·N) 모두 FAIL — 구조적 막힘 (maxCycles>3: cap 전 조기 STOP / 기본 maxCycles=3: cap과 동시 발화 = STOP **메시지 구분만**, 조기종료 효과 X) | N≥3 (maxCycles<3이면 dead row — 의도됨) | **[STOP]** + "구현 방식 전환 권고" |
| 5 | `max_cycles` | N ≥ maxCycles **또는** PGE_CALL_CAP(tool-call 횟수) 초과 | N=maxCycles | **[STOP]** 현재 상태 + 잔존 이슈 전달 |
| — | (그 외 FAIL 잔존) | 게이트 G·순위 1~5 미해당 | N<maxCycles | **continue** → Phase 2 재진입. Evaluator FAIL 피드백 = **접근방식 전환 입력** (정상 루프 본체) |

> **id 표기**: 사람용 라벨 `SECURITY_CRIT`(대문자) = JSONL 필드 `security_crit`(소문자) = 동일 개념(verdict PASS/FAIL은 라벨·필드 모두 대문자). 결정표(게이트 G + 순위1~5)와 아래 [루프 지시] 단계(G + 1~5)는 **1:1 정렬**.

**도달성·상호배타 (검수 모순 해소)**:
- **oscillation 별도 분기 없음 (의도적)**: PGE는 regression이 **첫 PASS→FAIL에서 [STOP]** → flip-back(PASS→FAIL→PASS→FAIL) 관측 자체가 불가능. 따라서 oscillation은 regression(순위3)에 **포섭**된다. 루프-커널 §2-b oscillation 개념은 cap이 큰 루프(`/forge-loop-maker` maxCycles≥6, regression이 STOP 아닌 advisory)에서 별도 분기로 살아있고, PGE에서는 regression이 흡수하는 것이 정확한 구현. (이전 버전의 oscillation continue 분기 = dead code였음 — 제거.)
- **same_issue continue 없음 (의도적)**: same_issue는 3연속 FAIL 구조적 막힘을 **maxCycles 도달 전이라도 조기 [STOP]**(maxCycles>3 시) 또는 cap과 동시 [STOP](maxCycles=3 시)하는 종료 신호. 사이클 재진입(이전 버전 "사이클 종료하지 않음 재진입" = cap 모순)은 제거. 접근방식 전환은 N<maxCycles 정상 재진입(continue 행)이 담당.

**STOP 메시지 형식**:
- regression: `"[REGRESSION] {req}:{check} — 사이클 {N-1} PASS → 사이클 {N} FAIL(또는 items 소멸). Human 에스컬레이션."`
- security_crit: `"[SECURITY_CRIT] {finding}. 보안 CRITICAL — Human 에스컬레이션."` (Sprint Contract `rollback_trigger` 중복 시 동일)
- same_issue: `"[SAME_ISSUE] {id} 3사이클 연속 FAIL = 구조적 막힘. 구현 방식 전환 권고(현 접근 회피)."` + current-analysis.md "## 이전 시도 실패 이력"에 id 기록
- data_integrity: `"[DATA_INTEGRITY] 사이클 {N 또는 N-1} 레코드 누락/파싱불가 — 평가/regression 판정 불가. fail-safe STOP."`

최대 maxCycles 사이클(결정표 순위5, 기본 3). 도달 후 FAIL 잔존 시 현재 상태로 전달 + 이슈 보고.

> Phase 5 결정표 Acceptance trace(C1~C3 워크스루) + SSoT 단일화 현황 rationale(same_issue kernel 실호출 vs 나머지 4종 정직한 경계) → `reference.md §Phase 5 결정표 Acceptance trace` / `§SSoT 단일화 현황` (필요 시 Read)

### call-budget 캡 + stop-condition 가드 (P1 신규 / B2 배선 2026-06-17)

**call-budget 캡**: 각 사이클(Phase 1→2→3→4) 진입 **전** 확인 — **실측 tool-call 횟수**(`loop-call-accum.sh` PostToolUse 훅이 누적한 `.calls`)를 `loop-budget.sh`로 읽어 비교.

> 구 `PGE_TOKEN_CAP`(LLM 자가추정 토큰)은 **theater**였다 — PostToolUse payload에 `output_tokens` 필드가 없어 토큰 실측 불가(799세션 토큰파일 전부 0으로 실증). B2에서 **tool-call 횟수**(`tool_name` 존재로 실측 가능)로 전환. 이것이 line 363 "P4 agent-budget 훅 연동 예정"의 이행분.

```
PGE_CALL_CAP = 환경변수 PGE_CALL_CAP (기본: 600 — orchestrator급)

사이클 진입 전 (bash, 메인 컨텍스트):
  used=$(bash ${FORGE_ROOT:-~/forge}/shared/scripts/loop-budget.sh "${PGE_CALL_CAP:-600}")
  rc=$?
  if [ "$rc" -ne 0 ]; then   # exit 1 = over cap (loop-budget.sh가 cap 비교)
    "[STOP] PGE_CALL_CAP={cap} 도달 (tool-call ${used}). 사이클 {N} 시작 취소."
    현재까지 산출물 경로 + Evaluator 마지막 판정 반환
```

- `loop-budget.sh <cap> [sid]` = `loop-call-accum.sh`가 `${PWD}/.claude/agent-budget/${SID}.calls`에 누적한 실측 tool-call 횟수를 읽어 cap과 비교 (exit 0=under / 1=over). 훅 미등록 또는 `.calls` 부재 시 **0 반환=inert(안전)**.
- **SID best-effort**: loop-budget.sh는 `${CLAUDE_SESSION_ID:-unknown}`로 키잉. producer(훅)는 payload `.session_id`(= 세션 UUID)로 키잉하므로, 메인 컨텍스트에 `CLAUDE_SESSION_ID`(동일 UUID)가 set이면 정렬, 미set이면 `unknown` 버킷 → 0=inert(미정렬은 under-STOP=안전방향). 정확 정렬 필요 시 `loop-budget.sh <cap> <session-uuid>` 2번째 인자로 명시.
- ⚠️ **정직성**: call-count = 실측 mechanical 신호(LLM 자가추정 토큰 theater 대체). 단 **결정론 bound = max_cycles(1순위)**; call-budget은 보조 **2순위 advisory**. 토큰(output_tokens) 아닌 **tool-call 횟수**임(payload에 토큰 부재).

**stop-condition 가드**: 모든 판정은 `PGE_EVAL_HISTORY.jsonl`에 append된 사이클 레코드를 유일한 데이터 소스로 사용한다. 구조화 id 기반 비교만 허용 (string fuzzy 금지 — 루프-커널 표준 §2). Evaluator는 각 항목에 결정론적 id를 부여해야 한다: 형식 `{requirement}:{check}` (예: `payment-api:stripe-response-validation`, `ui-layout:responsive-breakpoint`). prose 요약 앞 N자 비교는 사이클 간 wording drift로 false-negative가 발생하므로 **사용 금지**.
> **파일명 규약**: 본문 전체는 canonical base명 `PGE_EVAL_HISTORY.jsonl`로 참조한다. **동시성 격리 (472-799 세션 환경)**: 실제 파일은 base명에 **per-run suffix**(`PGE_EVAL_HISTORY.{run_id}.jsonl`)를 붙여 생성한다.
> **run_id handshake (writer/reader 동일 경로 보장)**: `{run_id}`는 **Phase 0에서 1회 생성**(시작 시각+nonce)해 **`PGE_SPEC.md` 상단에 기록**한다. Evaluator(쓰기)·루프(읽기) 모두 매 사이클 PGE_SPEC.md의 `run_id`를 읽어 경로를 도출 → 양측이 동일 파일 참조 보장(reader가 fresh run_id 재계산해 빈 파일 읽는 fail-open 차단). 단일 런 내 순차 append라 런-내 race 없음. **진짜 atomic append + flock = B2 트랙(Human 승인)** — inline prose는 per-run 파일 분리·handshake까지만 보장.

```
[Evaluator 지시] 항목별 판정 출력 형식 (사이클마다 전항목 필수):
  PASS 항목: `PASS [{requirement}:{check}]`
  FAIL 항목: `FAIL [{requirement}:{check}] — {위치} / {이유} / {방법}`
  CRITICAL 보안: `SECURITY_CRIT [{requirement}:{check}] — {발견 내용}` (별도 섹션)
  규칙: 동일 결함은 사이클이 달라도 동일 id. 설명 wording 변경 금지. **id는 Sprint Contract `eval_ids` 레지스트리에서만 선택** — 목록에 없는 신규 결함만 새 id 제안(다음 사이클부터 레지스트리 append). 변형·재명명 금지(regression false-negative 방지).

[레코드 스키마 — 2종 (각 1줄 JSONL)]:
  · eval-record (Evaluator): `{"type":"eval", "cycle": <N>, "score": <합산>, "items": [{"id":"<req>:<chk>","verdict":"PASS|FAIL"}, ...], "security_crit": [<id>, ...]}`
  · security_event (루프, Codex CRITICAL 시): `{"type":"security_event", "cycle": <N>, "security_event": [{"id":"<req>:<chk>","src":"codex"}]}`
  **한 cycle에 eval-record 1줄 + security_event 0~N줄 공존 = valid** (`type`으로 판별). 같은 cycle 값의 복수 라인은 정상 — gate G는 'cycle 중복'을 오류로 보지 않는다.

[Evaluator 지시] 사이클 eval-record append (PGE_EVAL_HISTORY.jsonl):
  위 eval-record 스키마 1줄.
  ※ 파일이 없으면 새로 생성. 존재하면 마지막 줄 뒤에 newline + 새 JSON 객체 1줄. 덮어쓰기 금지.
  ※ **read-modify-write 금지** — 파일 전체를 읽고 재작성하면 이전 사이클 레코드 유실 위험. 반드시 끝에 한 줄만 추가(`>>` 의미).
     append 도구가 없으면 마지막 줄 1개만 읽어 형식 확인 후 newline+신규객체 추가. 1줄=1 JSON 객체(JSONL) 불변식 유지.
  ※ append 누락·malformed JSONL 발생 시 → 루프가 **당-사이클 N 게이트 G**(append 직후 즉시 읽기)에서 data_integrity로 감지해 [STOP] fail-safe (N+1로 미루지 않음 — 조용한 false-negative 방지).

[루프 지시] 사이클 N 완료 후 게이트 G → 결정표(순위1~5)를 순서대로 1회 평가 (PGE_EVAL_HISTORY.jsonl 참조). 먼저 매칭되는 행에서 즉시 행동·중단, 이후 행 미평가 (상호 배타). 단계 번호 = 결정표(G + 1~5)와 1:1:

  G. data_integrity (전제 게이트 — 평가 가능성): Evaluator append 직후 루프(메인)가 **반드시** 사이클 N의 **eval-record**(`type=eval`, cycle=N인 마지막 라인)를 읽어 파싱(N+1로 미루지 않음 — STOP 경로가 N+1을 막을 수 있어 당-사이클 검증 필수). **regression(순위3) 평가하는 N≥2 사이클에서는 N-1 eval-record도 함께 파싱**. eval-record 누락·JSON 파싱불가 → 즉시 [STOP] DATA_INTEGRITY. (security_event 라인은 별개 type — 같은 cycle 공존이 정상이라 '중복'으로 STOP하지 않음. 순위1이 별도로 스캔.)
    > **결정론 validator = B2 트랙 (정직성)**: 진짜 mechanical JSONL 검증(파서 exit-code 강제 + per-run 격리 + 동시성 lock)은 **B2 훅(Human 승인)** 영역. inline prose는 LLM이 읽어 STOP하는 **의도**만 규정 — 100% 기계 강제 보장 아님. (이전 인라인 python `-c`/heredoc은 diff base·exit-code·동시성 버그를 양산해 제거.)

  1. security_crit / rollback_trigger:
     (a) Phase 4.5에서 Codex CRITICAL 발견 시 → 루프가 **별도 라인을 append**: `{"cycle": N, "security_event": [{"id":"<req:chk>","src":"codex"}]}`. 새 라인 = append-only 유지 + 중단/재개에도 보존(durable). (in-memory 휘발 금지 — fail-open 방지.)
     (b) JSONL의 사이클 N `security_crit[]` ∪ 전체 `security_event` 라인 중 하나라도 비어있지 않으면 → [STOP] SECURITY_CRIT.
     (c) Sprint Contract `rollback_trigger`(보안/비보안) 충족 → [STOP] (비보안은 `[ROLLBACK]` 메시지). rollback_trigger는 prose 조건이라 structured-id 비교의 명시적 예외(Human이 작성한 hard-STOP 트리거).

  2. rubric_all_pass:
     전제1 (커버리지) — 사이클 N items의 id 집합이 (Sprint Contract eval_ids 레지스트리 전체 ∪ 직전 사이클 PASS id 합집합)을 **커버**.
     전제2 (전항목 PASS) — 사이클 N **items[] 전체**에 verdict=FAIL이 하나도 없어야 함. 신규 발견(레지스트리 미등록) 결함이 items[]에 FAIL로 있으면 SUCCESS 불가 — all-PASS 집계는 covered 부분집합이 아니라 items[] 전수.
       전제1·2 중 하나라도 불충족 → SUCCESS 아님. N≥2면 순위3(regression) re-emit 재확인. **N=1이면 regression(N≥2) 미도달 → continue(재시도)** — 이전 PASS 집합 없어 회귀 개념 미성립.
     커버 충족 + 커버된 전 items verdict=PASS → SUCCESS (산출물 저장 + 보고서).
       합산<70인데 전항목 PASS면 항목판정 authoritative — Evaluator 점수 재산정 1회. 재산정 후 일부 FAIL 전환 시 SUCCESS 취소 → 순위3~ 재평가.

  3. regression (N ≥ 2):
     (사이클 N-1 PASS id 집합) ∩ (사이클 N FAIL id 집합 ∪ {N items[]에서 사라진 N-1 PASS id, 단 아래 re-emit 후}) ≠ ∅
     → [STOP] REGRESSION (해당 id 보고). oscillation 첫 flip 포섭 — 별도 oscillation 체크 없음.
     ※ 전제: 사이클 N-1 레코드 필요. 누락/파싱불가 시 → 게이트 G로 [STOP] DATA_INTEGRITY (false-negative 방지).
     ※ item-set 축소 (열거 drift false-STOP 방지): N-1 PASS id가 N items[]에서 사라지면 **즉시 hard-STOP 금지** — 먼저 Evaluator에 **해당 id 1회 re-emit 요청**(verdict만 재확인). re-emit 결과: (i) PASS → 단순 열거 drift였음, regression 아님(계속) / (ii) FAIL 또는 재차 누락 → 진짜 regression = [STOP]. 1회 재확인으로 LLM 열거 drift에 의한 false Human-escalation 차단.

  4. same_issue (N ≥ 3, maxCycles≥3; maxCycles<3이면 dead row — 의도됨) — **kernel 실호출 (SSoT 단일화)**:
     PGE 메인 컨텍스트는 일반 Bash 프로세스이므로 `loop-kernel.js`의 `checkSameIssue`를 실제로 import한다(healer.md·forge-implement.md의 검증된 호출 패턴을 그대로 이식 — 재구현 금지):
     > 실행 스크립트 본문(node --input-type=module 호출 + KERNEL_OUT/STATE_FILE 처리) → `reference.md §same_issue kernel 실호출 스크립트 본문` (필요 시 Read)
     - `timeout 10` 래핑 = cr-final H2 수정(2026-07-05, healer.md/forge-implement.md 동일 적용) — kernel import가 hang해도 10초 후 강제종료로 `KERNEL_RC=124`를 돌려받아 폴백이 반드시 발동한다.
     - **정지 판정**: `KERNEL_OUT`의 `tripped==true`(동일 id가 kernel `SAME_ISSUE_MAX=3`회 누적) → [STOP] SAME_ISSUE.
     - **폴백(캡 소실 금지, fail-open)**: `KERNEL_RC≠0`(timeout exit 124 포함) 또는 `KERNEL_OUT` 빈 값이면 kernel을 무시하고 기존 로컬 판정(사이클 N-2·N-1·N 레코드 모두에서 동일 id가 FAIL)으로 즉시 폴백 — same_issue 캡이 어느 경로든 사라지지 않는다.
     → [STOP] SAME_ISSUE + "방식 전환 권고" (재진입 없음). current-analysis.md "## 이전 시도 실패 이력"에 id 기록.
     - 상세 근거·검증 이력은 `.claude/agents/healer.md §loop-kernel.js SSoT 연동`·`.claude/commands/forge-implement.md` 동 섹션 참조 — 새 script 파일 작성 금지, 동일 kernel 재사용.

  5. max_cycles (N ≥ maxCycles, PGE_CALL_CAP 초과 포함):
     → [STOP] 현재 상태 + 잔존 이슈 전달

  — 그 외 FAIL 잔존 (N < maxCycles):
     → continue: current-analysis.md "## 이전 시도 실패 이력"에 FAIL id 기록 후 Phase 2 재진입.
        Evaluator FAIL 피드백 = 접근방식 전환 입력. 재진입 시 기록된 id의 이전 접근방식 명시적 제외.
```

**Evaluator 최종 FAIL 시 — pge-failure 후보 기록 (compounding)**: 3사이클 후에도 FAIL 잔존하면 (= 이 접근 방식이 막혔다는 신호), 그 실패 패턴을 종료 핸드오버에 `pge-failure 후보:` 1줄로 기록 (`current-analysis.md "## 이전 시도 실패 이력"` 섹션 + handover 모두). `/end-sonnet` 또는 `/end-opus`가 그 후보를 `learnings.sh append --category pge-failure --summary "<무엇을 하려다> <왜 막혔나>" --apply "<향후 PGE에서 이 접근 회피 — 대안은>" --evidence "<PGE 보고서 경로 or 사이클 요약>"`로 learnings에 반영. (end-* 가 이미 learnings append 수행하므로 후보 큐만 넘기면 됨.)

### Phase 6: 사후 Spec 발행 (`.specify/` 프로젝트 한정, WARN-first)

**배경 (2026-07-12 실발화, Batch 4-1)**: PGE는 spec 없는 개발 전용 하네스다. 그런데 SDD를 채택한 프로젝트(`.specify/specs/` 존재)에서는 CI `spec-validation` job이 `fix/*` 외 브랜치에 대해 `.specify/specs/{branch}.md` 존재를 요구한다 — PGE 산출물은 이 요구를 충족하지 못해 PR 단계에서 항상 FAIL한다. 라우팅(spec 無 = pge)과 프로젝트 CI(spec 요구)가 구조적으로 모순되므로, PGE 자신이 종료 시점에 트레이서빌리티 자산을 남겨 이 모순을 해소한다.

**절차** (Phase 5 `SUCCESS` 판정 직후, PR 단계 진입 전):

1. `test -d "{project_root}/.specify"` 확인.
   - **부재 시**: "Phase 6 스킵 — 이 프로젝트는 SDD(.specify/)를 채택하지 않음" 1줄 명시 후 종료(fail-open — 모든 프로젝트가 SDD를 쓰는 건 아니다).
   - **존재 시**: 아래 2~3 진행.
2. `.specify/specs/{branch-name}.md` 사후 Spec 발행 (현재 브랜치명 = `git rev-parse --abbrev-ref HEAD`로 기계적 산출). 기존 파일 있으면 덮어쓰지 않고 append 섹션 추가. 최소 포함 항목:
   - `## 구현된 FR` — Sprint Contract `done_criteria`/`eval_ids`를 FR 형태로 역변환
   - `## 변경 범위` — `git diff --name-only {base}...HEAD` 산출 파일 목록
   - `## 검증 결과` — Phase 4 Evaluator 최종 점수 + PGE_EVAL_HISTORY.jsonl 최종 사이클 items[] 요약
   - `## 산출 근거` — PGE_SPEC.md·PGE_QA_REPORT.md 경로 링크 (사후 검토 가능하도록)
3. 발행 완료 후 완료 보고에 "Phase 6: `.specify/specs/{branch}.md` 발행 완료" 1줄 추가.

> **WARN-first**: 발행 실패(쓰기 권한·경로 오류 등)해도 PGE 전체를 FAIL 처리하지 않는다 — WARN 후 완료 보고에 "spec 발행 실패, 수동 보완 필요" 명시(AD-168 준수, 신규 hard-BLOCK 아님).

---

## 파일 기반 통신 프로토콜

모든 PGE 중간 파일은 `{project_root}/.claude/state/`에 저장한다.

| 파일 | 작성자 | 읽는 자 | 쓰기 방식 | 내용 |
|------|--------|---------|---------|------|
| `PGE_SPEC.md` | Planner (메인) | Generator (메인), QA (subagent), Evaluator (subagent) | 덮어쓰기 | 설계서 + reference 목록 |
| `current-analysis.md` | Planner (메인) | Generator (메인), Evaluator (subagent) | 본체 덮어쓰기 + `## 이전 시도 실패 이력` 섹션은 **append**(사이클 간 누적) | 4단계 의존성 분석(덮어쓰기) + 이전 시도 실패 이력(append — same_issue 추적 입력, 덮어써 유실 금지) |
| `PGE_SELF_CHECK.md` | Generator (메인) | QA (subagent), Evaluator (subagent) | 덮어쓰기 | 자체 점검 결과 |
| `PGE_QA_RESULT.md` | QA (subagent) | Evaluator (subagent), Generator (메인, 피드백 시) | 덮어쓰기 | 트랙별 검증 결과 |
| `PGE_QA_REPORT.md` | Evaluator (subagent) | Generator (메인, 피드백 시) | 덮어쓰기 | Rubric 판정 + 개선 지시 (사이클별 최신 상태) |
| `PGE_EVAL_HISTORY.jsonl` | Evaluator (subagent) + 루프(security_event 라인) | Phase 5 루프 (메인) | **append 전용** (절대 덮어쓰기 금지) | 사이클별 누적 레코드(cycle 레코드) + Codex CRITICAL `security_event` 라인 — regression(oscillation 포섭)·same_issue·security_crit·data_integrity 판정의 유일한 데이터 소스. 누락/손상 시 data_integrity STOP |

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
   - 위치: `~/.claude/skills/forge-pge/eval_cases.jsonl`
   - case_id: `EC-forge-pge-{N}` (auto-increment)
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

실행: `Workflow({ script: Bash("cat ~/.claude/skills/forge-pge/workflow.js") })`

`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 방식 fallback.

