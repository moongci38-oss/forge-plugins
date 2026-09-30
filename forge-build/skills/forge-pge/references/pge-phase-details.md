# forge-pge — Phase 상세 (SKILL.md 에서 옮긴 참조 본문)

> `forge-pge/SKILL.md` 의 각 Phase 에서 **포인터가 가리킬 때만** 해당 절을 Read 한다.
> (2026-09-24 #1014 분리 — SKILL.md 500줄 규정. 문장은 한 글자도 바꾸지 않고 옮겼다.
>  ⛔/⚠️/금지 문구와 실행 순서의 뼈대는 SKILL.md 에 그대로 남아 있다.)

## 목차

- §스타일 정합 pre-flight
- §Phase -1 이유
- §UI rubric 보강 (G7·G10-b)
- §eval_ids 타이밍 (false-stop 방지)
- §Sprint Contract 출처·효과
- §Planner 2b — GitNexus 구조 탐색
- §Planner 3 — Unity 클라이언트 .cs 수정 절차
- §Generator — WORKTREE 정의 근거 (r3 L8·MED-7)
- §QA 에이전트 스폰 흐름도
- §트랙 C — 검증 3계층
- §보안 surface Codex 리뷰 — 결정론 enforcement 한계 (B2)
- §Phase 5 — 도달성·상호배타 (oscillation·same_issue 분기 없음의 이유)
- §Phase 5 STOP 메시지 형식
- §Phase 6 배경 (2026-07-12 실발화, Batch 4-1)
- §Phase 6 — 두 조건 확인의 근거 (2026-08-21 arborAI)
- §프로젝트 Reference 로딩 표
- §완료 보고 형식

## 스타일 정합 pre-flight

<!-- 원본: SKILL.md L61-61 (2026-09-24 이동) -->

**스타일 정합 pre-flight (P3, WARN — 증분 UI 셰이핑 마찰 방지)**: 착수 전 (a) prettier config 부재 + (b) eslint↔prettier 스타일 충돌(코드베이스 실제 스타일 vs prettier 기본값, 예: 작은따옴표 코드에 큰따옴표 기본 prettier)을 감지하면 WARN. 미정합 시 pre-commit `prettier --write`가 전파일 재포맷 → diff 부풀림 + 편집 워크트리 vs 커밋 브랜치 발산(증분 패치 깨짐·워크트리 재구성 반복)을 유발한다. 권고: 세션 시작 시 스타일 정합 1회 처리(prettier config 정렬 또는 `eslint-config-prettier` 정렬). non-blocking(감지·경고만, forge-fix에도 동일 적용).

## Phase -1 이유

<!-- 원본: SKILL.md L67-67 (2026-09-24 이동) -->

**이유**: 디자인 파이프라인(`DESIGN.md` 토큰)을 먼저 거친다(`tool-rules.md §UI/UX 작업`). Design source 없이 Generator가 UI를 생성하면 rubric Phase 0의 anti-slop 축(G7·G10-b, 라인 62)이 사후 감점만 할 뿐 애초에 근거 없는 디자인이 만들어지는 것을 막지 못한다 — Phase -1은 그 사전 게이트다.

## UI rubric 보강 (G7·G10-b)

<!-- 원본: SKILL.md L89-89 (2026-09-24 이동) -->

**UI 태스크(트랙 B) rubric 보강 (G7·G10-b)**: 산출물이 UI면 "품질/완성도" 축을 구체화한다 — (a)프로젝트 `{project-root}/DESIGN.md` 존재 시 committed direction·토큰 계층(primitive→semantic→component)·간격/타이포 스케일 준수 여부, (b)anti-slop = `forge-check-ui` 블랙리스트 위반(shadcn-gray/Inter방치/cardocalypse/획일 fade-in 등) 시 감점. "museum quality"를 이 기준으로 조작 가능하게(측정가능) 만든다. reference 표의 `design-tokens/design-rules.md`도 로드.

## eval_ids 타이밍 (false-stop 방지)

<!-- 원본: SKILL.md L122-122 (2026-09-24 이동) -->

> **타이밍 (false-stop 방지)**: 신규 id는 **발견 당-사이클 items[]에 즉시 포함**(보통 FAIL verdict)되므로 rubric_all_pass(순위2)의 당-사이클 커버리지 계산에 이미 들어간다. "다음 사이클부터 레지스트리 추가"는 **후속 사이클의 커버 floor 갱신용**일 뿐 — 당-사이클 items에 그 id가 존재하므로 "커버 누락"으로 오판되지 않는다. 즉 동적 append와 당-사이클 커버 요구는 충돌하지 않는다.

## Sprint Contract 출처·효과

<!-- 원본: SKILL.md L126-127 (2026-09-24 이동) -->

> 출처: 하네스 엔지니어링 백과사전 제9장 Generator-Evaluator 패턴 — Sprint Contract.
> 효과: Generator 범위 이탈 방지 + Evaluator 판정 기준 명확화 → codex-review FAIL 사이클 감소.

## Planner 2b — GitNexus 구조 탐색

<!-- 원본: SKILL.md L142-151 (2026-09-24 이동) -->

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

## Planner 3 — Unity 클라이언트 .cs 수정 절차

<!-- 원본: SKILL.md L152-160 (2026-09-24 이동) -->

3. **Unity 클라이언트 .cs 수정이 포함된 경우** (필수 순서):
   1. `{project_root}/.claude/state/current-analysis.md` 존재 확인 — **있으면 먼저 Read**하여 이전 분석 재사용 판단
   2. `{project_root}/.claude/reference/key-file-map.md` **Read** — 기능별 파일 위치 + 쌍 수정 패턴
   3. `{project_root}/.claude/reference/code-snippets.md` **Read** — DOTween/UI/이벤트 표준 패턴
   4. `{project_root}/.claude/reference/pre-modification-analysis-detail.md` **Read** — Step 0~5 의존성 분석 지침 (핵심: Step 3 실행 흐름 추적)
   5. `{project_root}/.claude/reference/pge-game-evaluator-rubric-detail.md` **Read** — 평가 기준 숙지
   6. `pre-modification-analysis-detail.md`의 Step 0~4 지침을 순서대로 수행 (Step 3 실행 흐름 추적이 가장 중요)
   7. 분석 결과를 `{project_root}/.claude/state/current-analysis.md`에 **저장 (Write)** — Step 0~4 섹션 + 대상 파일명 필수 포함
      → Hook이 내용 검증함: Step 0~4 섹션 없거나 대상 파일명 없으면 .cs 수정이 차단됨

## Generator — WORKTREE 정의 근거 (r3 L8·MED-7)

<!-- 원본: SKILL.md L191-191 (2026-09-24 이동) -->

    인자는 `$WORKTREE` 다 — 이 문서에 정의가 없으므로 **여기서 정한다**(r3 L8): `WORKTREE="${WORKTREE:-$(git rev-parse --show-toplevel)}"` = Generator 가 쓰는 체크아웃의 루트(아래 `coder-attribution.sh write "$WORKTREE"` 와 같은 값). 종전 `$REPO_ROOT` 도 정의가 없어 **빈 문자열**로 넘어갔는데(MED-7), 빈 인자는 `coder-lane-detect.sh` 의 `ROOT="${1:-…}"` 폴백(`git rev-parse --show-toplevel || pwd`)으로 **CWD 의 toplevel** 을 판정한다 — 워크트리 안이면 워크트리, 워크트리를 만들고 cd 하지 않은 세션이면 메인 체크아웃이다(구 서술 "항상 메인 체크아웃" 은 실측과 다르다. 재현: `cd <워크트리> && bash shared/scripts/coder-lane-detect.sh ""`, 2026-09-16).

## QA 에이전트 스폰 흐름도

<!-- 원본: SKILL.md L227-235 (2026-09-24 이동) -->

```
Generator 완료 (메인 컨텍스트)
  ↓ subagent 스폰 — 전달: 변경 파일 목록 + PGE_SPEC.md 경로 (Generator의 의도/가정은 전달하지 않음)
  ↓
QA Agent (별도 subagent, 독립 컨텍스트)
  ↓ 변경 파일 확장자로 트랙 자동 감지
  ↓
트랙별 검증 실행
```

## 트랙 C — 검증 3계층

<!-- 원본: SKILL.md L277-280 (2026-09-24 이동) -->

검증 3계층:
1. **파라미터 검증**: 코드 수치 ↔ 기획서/레퍼런스 1:1 대조
2. **런타임 검증**: Unity MCP로 캡처 → 레퍼런스 비교
3. **Human 필요 항목 명시**: AI가 판단할 수 없는 퀄리티 항목을 리스트업

## 보안 surface Codex 리뷰 — 결정론 enforcement 한계 (B2)

<!-- 원본: SKILL.md L348-348 (2026-09-24 이동) -->

  > **결정론 enforcement = B2 트랙 (정직성)**: 변경 파일 경로를 git에서 결정론적으로 추출(stage/commit/working-tree 전부 + diff base 정확)해 자동 발동하는 것은 inline prose bash로는 신뢰 불가(diff base 누락·동시성·exit-code swallow). 진짜 mechanical 보안 게이트는 **B2 훅(Human 승인)** 영역 — `b2-token-enforcement-design.md` 패턴. 본 spec은 LLM 실행 **의도**만 규정.

## Phase 5 — 도달성·상호배타 (oscillation·same_issue 분기 없음의 이유)

<!-- 원본: SKILL.md L388-390 (2026-09-24 이동) -->

**도달성·상호배타 (검수 모순 해소)**:
- **oscillation 별도 분기 없음 (의도적)**: PGE는 regression이 **첫 PASS→FAIL에서 [STOP]** → flip-back(PASS→FAIL→PASS→FAIL) 관측 자체가 불가능. 따라서 oscillation은 regression(순위3)에 **포섭**된다. 루프-커널 §2-b oscillation 개념은 cap이 큰 루프(`/forge-loop-maker` maxCycles≥6, regression이 STOP 아닌 advisory)에서 별도 분기로 살아있고, PGE에서는 regression이 흡수하는 것이 정확한 구현. (이전 버전의 oscillation continue 분기 = dead code였음 — 제거.)
- **same_issue continue 없음 (의도적)**: same_issue는 3연속 FAIL 구조적 막힘을 **maxCycles 도달 전이라도 조기 [STOP]**(maxCycles>3 시) 또는 cap과 동시 [STOP](maxCycles=3 시)하는 종료 신호. 사이클 재진입(이전 버전 "사이클 종료하지 않음 재진입" = cap 모순)은 제거. 접근방식 전환은 N<maxCycles 정상 재진입(continue 행)이 담당.

## Phase 5 STOP 메시지 형식

<!-- 원본: SKILL.md L393-396 (2026-09-24 이동) -->

- regression: `"[REGRESSION] {req}:{check} — 사이클 {N-1} PASS → 사이클 {N} FAIL(또는 items 소멸). Human 에스컬레이션."`
- security_crit: `"[SECURITY_CRIT] {finding}. 보안 CRITICAL — Human 에스컬레이션."` (Sprint Contract `rollback_trigger` 중복 시 동일)
- same_issue: `"[SAME_ISSUE] {id} 3사이클 연속 FAIL = 구조적 막힘. 구현 방식 전환 권고(현 접근 회피)."` + current-analysis.md "## 이전 시도 실패 이력"에 id 기록
- data_integrity: `"[DATA_INTEGRITY] 사이클 {N 또는 N-1} 레코드 누락/파싱불가 — 평가/regression 판정 불가. fail-safe STOP."`

## Phase 6 배경 (2026-07-12 실발화, Batch 4-1)

<!-- 원본: SKILL.md L418-418 (2026-09-24 이동) -->

**배경 (2026-07-12 실발화, Batch 4-1)**: PGE는 spec 없는 개발 전용 하네스다. 그런데 SDD를 채택한 프로젝트(`.specify/specs/` 존재)에서는 CI `spec-validation` job이 `fix/*` 외 브랜치에 대해 `.specify/specs/{branch}.md` 존재를 요구한다 — PGE 산출물은 이 요구를 충족하지 못해 PR 단계에서 항상 FAIL한다. 라우팅(spec 無 = pge)과 프로젝트 CI(spec 요구)가 구조적으로 모순되므로, PGE 자신이 종료 시점에 트레이서빌리티 자산을 남겨 이 모순을 해소한다.

## Phase 6 — 두 조건 확인의 근거 (2026-08-21 arborAI)

<!-- 원본: SKILL.md L432-436 (2026-09-24 이동) -->

   > 근거: 2026-08-21 arborAI — `.specify/` 는 있는데 `.github/workflows/` 자체가 없어 spec 을
   > 요구하는 CI 가 0건이었다. 구 규칙대로면 임시 브랜치명(`worktree-arborai-0821-…`)으로
   > spec 을 발행할 뻔했다. **§P0 라우팅의 "폴더 존재 ≠ 이 작업의 spec"과 같은 계열의 결함**이다
   > — 폴더가 있다는 사실에서 그 폴더의 목적이 살아 있다고 추론하면 안 된다.
   > 폐기조건: Phase 6 이 CI 외의 이유(트레이서빌리티 자산 자체)로 재정의되면 이 항을 고쳐 쓴다.

## 프로젝트 Reference 로딩 표

<!-- 원본: SKILL.md L463-469 (2026-09-24 이동) -->

| 태스크 유형 | 읽을 파일 |
|------------|---------|
| **Unity 클라이언트** | `key-file-map.md`, `code-snippets.md`, `pre-modification-analysis-detail.md` |
| **서버 / 웹 / 앱** | `codebase-analysis.md` (존재 시), `key-file-map.md`, `code-snippets.md`, `golden-rules.md` |
| **웹 / 앱 UI** | `~/forge/shared/design-tokens/design-rules.md` |
| 프로토콜 / 네트워크 | `key-file-map.md`, `protocol-ranges.md`, `tech-stack.md` |
| 빌드 / 배포 | `build-commands.md`, `dependency-order.md` |

## 완료 보고 형식

<!-- 원본: SKILL.md L475-491 (2026-09-24 이동) -->

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
