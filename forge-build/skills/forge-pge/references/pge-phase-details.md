# forge-pge — Phase 상세 (SKILL.md 에서 옮긴 참조 본문)

> `forge-pge/SKILL.md` 의 각 Phase 에서 **포인터가 가리킬 때만** 해당 절을 Read 한다.

## 목차

- §스타일 정합 pre-flight
- §UI rubric 보강 (G7·G10-b)
- §eval_ids 타이밍 (false-stop 방지)
- §Planner 2b — GitNexus 구조 탐색
- §Planner 3 — Unity 클라이언트 .cs 수정 절차
- §QA 에이전트 스폰 흐름도
- §트랙 C — 검증 3계층
- §보안 surface Codex 리뷰 — 결정론 enforcement 한계 (B2)
- §Phase 5 STOP 메시지 형식
- §Phase 6 — 두 조건 확인의 근거 (2026-08-21 arborAI)
- §프로젝트 Reference 로딩 표
- §완료 보고 형식

## 스타일 정합 pre-flight

**스타일 정합 pre-flight (P3, WARN — 증분 UI 셰이핑 마찰 방지)**: 착수 전 (a) prettier config 부재 + (b) eslint↔prettier 스타일 충돌(코드베이스 실제 스타일 vs prettier 기본값, 예: 작은따옴표 코드에 큰따옴표 기본 prettier)을 감지하면 WARN. 미정합 시 pre-commit `prettier --write`가 전파일 재포맷 → diff 부풀림 + 편집 워크트리 vs 커밋 브랜치 발산(증분 패치 깨짐·워크트리 재구성 반복)을 유발한다. 권고: 세션 시작 시 스타일 정합 1회 처리(prettier config 정렬 또는 `eslint-config-prettier` 정렬). non-blocking(감지·경고만, forge-fix에도 동일 적용).

## UI rubric 보강 (G7·G10-b)

**UI 태스크(트랙 B) rubric 보강 (G7·G10-b)**: 산출물이 UI면 "품질/완성도" 축을 구체화한다 — (a)프로젝트 `{project-root}/DESIGN.md` 존재 시 committed direction·토큰 계층(primitive→semantic→component)·간격/타이포 스케일 준수 여부, (b)anti-slop = `forge-check-ui` 블랙리스트 위반(shadcn-gray/Inter방치/cardocalypse/획일 fade-in 등) 시 감점. "museum quality"를 이 기준으로 조작 가능하게(측정가능) 만든다. reference 표의 `design-tokens/design-rules.md`도 로드.

## eval_ids 타이밍 (false-stop 방지)

> **타이밍 (false-stop 방지)**: 신규 id는 **발견 당-사이클 items[]에 즉시 포함**(보통 FAIL verdict)되므로 rubric_all_pass(순위2)의 당-사이클 커버리지 계산에 이미 들어간다. "다음 사이클부터 레지스트리 추가"는 **후속 사이클의 커버 floor 갱신용**일 뿐 — 당-사이클 items에 그 id가 존재하므로 "커버 누락"으로 오판되지 않는다. 즉 동적 append와 당-사이클 커버 요구는 충돌하지 않는다.

## Planner 2b — GitNexus 구조 탐색

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

3. **Unity 클라이언트 .cs 수정이 포함된 경우** (필수 순서):
   1. `{project_root}/.claude/state/current-analysis.md` 존재 확인 — **있으면 먼저 Read**하여 이전 분석 재사용 판단
   2. `{project_root}/.claude/reference/key-file-map.md` **Read** — 기능별 파일 위치 + 쌍 수정 패턴
   3. `{project_root}/.claude/reference/code-snippets.md` **Read** — DOTween/UI/이벤트 표준 패턴
   4. `{project_root}/.claude/reference/pre-modification-analysis-detail.md` **Read** — Step 0~5 의존성 분석 지침 (핵심: Step 3 실행 흐름 추적)
   5. `{project_root}/.claude/reference/pge-game-evaluator-rubric-detail.md` **Read** — 평가 기준 숙지
   6. `pre-modification-analysis-detail.md`의 Step 0~4 지침을 순서대로 수행 (Step 3 실행 흐름 추적이 가장 중요)
   7. 분석 결과를 `{project_root}/.claude/state/current-analysis.md`에 **저장 (Write)** — Step 0~4 섹션 + 대상 파일명 필수 포함
      → Hook이 내용 검증함: Step 0~4 섹션 없거나 대상 파일명 없으면 .cs 수정이 차단됨

## QA 에이전트 스폰 흐름도

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

검증 3계층:
1. **파라미터 검증**: 코드 수치 ↔ 기획서/레퍼런스 1:1 대조
2. **런타임 검증**: Unity MCP로 캡처 → 레퍼런스 비교
3. **Human 필요 항목 명시**: AI가 판단할 수 없는 퀄리티 항목을 리스트업

## 보안 surface Codex 리뷰 — 결정론 enforcement 한계 (B2)

  > **결정론 enforcement = B2 트랙 (정직성)**: 변경 파일 경로를 git에서 결정론적으로 추출(stage/commit/working-tree 전부 + diff base 정확)해 자동 발동하는 것은 inline prose bash로는 신뢰 불가(diff base 누락·동시성·exit-code swallow). 진짜 mechanical 보안 게이트는 **B2 훅(Human 승인)** 영역 — `b2-token-enforcement-design.md` 패턴. 본 spec은 LLM 실행 **의도**만 규정.

## Phase 5 STOP 메시지 형식

- security_crit: `"[SECURITY_CRIT] {finding}. 보안 CRITICAL — Human 에스컬레이션."` (Sprint Contract `rollback_trigger` 중복 시 동일)
- data_integrity: `"[DATA_INTEGRITY] 사이클 {N 또는 N-1} 레코드 누락/파싱불가 — 평가/regression 판정 불가. fail-safe STOP."`

## Phase 6 — 두 조건 확인의 근거 (2026-08-21 arborAI)

   > 근거: 2026-08-21 arborAI — `.specify/` 는 있는데 `.github/workflows/` 자체가 없어 spec 을
   > 요구하는 CI 가 0건이었다. 구 규칙대로면 임시 브랜치명(`worktree-arborai-0821-…`)으로
   > spec 을 발행할 뻔했다. **§P0 라우팅의 "폴더 존재 ≠ 이 작업의 spec"과 같은 계열의 결함**이다
   > — 폴더가 있다는 사실에서 그 폴더의 목적이 살아 있다고 추론하면 안 된다.
   > 폐기조건: Phase 6 이 CI 외의 이유(트레이서빌리티 자산 자체)로 재정의되면 이 항을 고쳐 쓴다.

## 프로젝트 Reference 로딩 표

| 태스크 유형 | 읽을 파일 |
|------------|---------|
| **Unity 클라이언트** | `key-file-map.md`, `code-snippets.md`, `pre-modification-analysis-detail.md` |
| **서버 / 웹 / 앱** | `codebase-analysis.md` (존재 시), `key-file-map.md`, `code-snippets.md`, `golden-rules.md` |
| **웹 / 앱 UI** | `~/forge/shared/design-tokens/design-rules.md` |
| 프로토콜 / 네트워크 | `key-file-map.md`, `protocol-ranges.md`, `tech-stack.md` |
| 빌드 / 배포 | `build-commands.md`, `dependency-order.md` |

## 완료 보고 형식

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
