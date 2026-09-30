---
name: forge-pge
description: "Planner-Generator-Evaluator 하네스. Evaluator만 subagent로 격리해 독립 검수한다. spec 없이 개발할 때 사용한다. 버그 수정은 /forge-fix."
---

**역할**: PGE 하네스를 **직접 실행**한다 — Planner·Generator 는 메인 컨텍스트, Evaluator 만 독립 실행체(자기평가 금지, Generator 컨텍스트 미상속).
**출력**: 산출물 + `docs/pge/YYYY-MM-DD-{task-name}-pge-report.md`. **spec 없는 개발 전용** — spec 有 = `/forge-implement`, 버그 = `/forge-fix` (결정표 `.claude/rules-on-demand/harness-family-map.md`).
**컨텍스트**: 복잡한 구현/생성 작업에서 품질이 결과를 결정할 때 사용합니다.
## 사용법
```
/forge-pge <task> [--rubric custom] [--cycles N(기본 3)] [--coder claude:tier|codex:tier|sol|terra|luna|ab] [--advisor sol|terra|opus|fable]
```
## 진입 트리아지 (먼저 판정)
- **P0**: harness-family 3분기를 실측 — `ls .specify/specs/` 를 열어 **이 작업을 다루는 spec** 이 있으면 `/forge-implement`, 버그·증상이면 `/forge-fix` 로 재라우팅 제안. **P0b**: 1회성 상태변경(시드·백필)·단순 조회·설정 변경 → PGE 거부, 직접 실행/스크립트 제안.
- **P0c**: `.claude/rules-on-demand/pre-work-branch-sweep.md` 실행 — 미머지 완성물 있으면 재작성 금지. **P1**: 1~2파일·수 줄 → "PGE 부적합 — 직접 외과 수정 권고" WARN 후 직접 편집(모호하면 PGE).
- **P2**: "제안/체크/분석/확인/봐줘"류 → 조사 리포트 + AskUserQuestion 결정 게이트(`rules-on-demand/grilling-protocol.md`). 구현 명시 시에만 PGE. pre-flight(WARN): prettier/eslint 충돌 → `references/pge-phase-details.md §스타일 정합 pre-flight`.
## Phase -1: Design Source (신규 UI 화면 빌드 한정, 아니면 "Phase -1 스킵" 1줄)
a) Claude Design 산출물/`DESIGN.md`/`05-design/` → b) 레포 자매 화면 패턴 → c) 둘 다 없으면 **[STOP] DESIGN_SOURCE_ABSENT** (GUIDE-STOP): Human 이 산출물 제공·자매 화면 지정·"임의 생성 승인" 중 택1 전까지 Phase 2 보류. 결과를 `PGE_SPEC.md` `## Design Source` 에 기록.
## Phase 0: Rubric (Generator 전 확정)
| 항목 | 가중 | 불합격 |
|---|:-:|---|
| 요구사항 충족도 | 40 | 핵심 미충족 → 즉시 FAIL |
| 품질/완성도 | 30 | AI 슬롭 → 0 (UI 는 `references/pge-phase-details.md §UI rubric 보강 (G7·G10-b)`) |
| 구조/아키텍처 | 20 | 설계 의도 위반 → 0 |
| 문서/명확성 | 10 | 주요 누락 → 5 이하 |
PASS = 70+ & 즉시 FAIL 없음. Evaluator 는 score-blind(점수 최적화 금지). 판정은 스크립트:
`python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/rubric-weighted-score.py" --file <축점수.json>` → rc 0 PASS · 1 FAIL · 2 UNDECIDED(통과 아님). JSON `{"threshold":70,"axes":[{"name","weight","score"}]}`, 미응답 축 `{"state":"missing","reason":...}`(0점 아님), 즉시 FAIL `"immediate_fail": true`.
**Sprint Contract**(Planner 작성, 예시 → `reference.md §Sprint Contract 예시`): `scope` · `out_of_scope` · `done_criteria` · `eval_ids`(done_criteria 별 canonical `{requirement}:{check}` id — Evaluator 는 이 목록에서만 선택, 신규 결함만 새 id 제안 후 다음 사이클 append, 재명명 금지; 타이밍 → `references/pge-phase-details.md §eval_ids 타이밍 (false-stop 방지)`) · `rollback_trigger`.

## Phase 1: Planner (메인 — subagent X)
1. `{project_root}/.claude/reference/` 에서 유형별 파일 Read(`references/pge-phase-details.md §프로젝트 Reference 로딩 표`). 과거 실패 로드: `LEARN_BY=pge bash ~/.claude/scripts/learnings.sh load pge-failure 2>/dev/null` · `LEARN_BY=pge bash ~/.claude/scripts/learnings.sh load bug-fix-pattern 2>/dev/null` → 실패 접근 회피.
2. 요구 분석 · GitNexus 인덱스 있으면 `§Planner 2b — GitNexus 구조 탐색`(list_repos→query→context→impact).
3. Unity .cs 포함 시 `§Planner 3 — Unity 클라이언트 .cs 수정 절차` 7단계 필수(`current-analysis.md` Step 0~4 + 대상 파일 없으면 Hook 이 .cs 수정 차단). 이전 시도 실패 → `current-analysis.md` `## 이전 시도 실패 이력` append. 산출물 구조 설계 + Rubric 포함.
**출력**: `{project_root}/.claude/state/PGE_SPEC.md`(상단 `## 참조 컨텍스트`) + (Unity) `current-analysis.md`.
## Phase 1.5: Codex Plan Review (blocking)
`/codex-review --stage plan --target {project_root}/.claude/state/PGE_SPEC.md --blocking` → PASS/WARN = Phase 2 · FAIL = issues[] 를 실패 이력에 추가 후 Planner 재실행.
## Phase 2: Generator (메인 — subagent X)
```bash
WORKTREE="${WORKTREE:-$(git rev-parse --show-toplevel)}"   # 별도 워크트리 Generator 면 앞에서 WORKTREE 지정
CODER_SPEC=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-lane-detect.sh" "$WORKTREE" --coder "$CODER_SPEC" ${FRONT_TASK:+--task "$FRONT_TASK"} ${ESCALATE:+--escalate "$ESCALATE"})
MODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$CODER_SPEC")   # 순서 계약: 레인 먼저, 모델 다음
GATE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/advisor-tier-gate.sh" "$CODER_SPEC")      # skip=advisor 생략 · advise=조언 주입
```
- Evaluator FAIL 같은 실패 2회 → `ESCALATE=2` 재판정(상한 max). 판정표 정본 `forge-implement.md §3.6`.
- **codex:*** → `mcp__codex__codex`(sandbox=workspace-write, approval-policy=on-request, cwd=$WORKTREE, model=$MODEL) + PGE_SPEC·Contract·Rubric·Planner 분석 주입, 산출물은 `secret-content-scan.sh` 경유. **Unity**(`ProjectSettings/ProjectVersion.txt` 또는 .cs) → Claude 폴백. `FORGE_DUAL_CODE=off`·Codex 미가용 → Claude(경고).
- `--advisor`: `AMODEL=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$ADVISOR_SPEC")` → gpt 면 `mcp__codex__codex`(read-only), claude 면 `Agent(subagent_type="advisor-strategist", model=$AMODEL)`. 권고: advisor 벤더 ≠ 구현 벤더.
- **attribution(필수)**: 폴백 시 `$MODEL` 을 실제 모델로 갱신 후 `coder-attribution.sh write "$WORKTREE" "$MODEL"`. 후속 cr-* 는 `MODE=$("${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-attribution.sh" review-mode "$WORKTREE")` → `--cr $MODE`(codex Generator=`cross`, `author-vendor` → `authorVendor`).
- 절차: PGE_SPEC(·current-analysis) 재확인 → reference 패턴 준수 구현("museum quality") → 자기검토(Rubric 불합격 조건·key-file-map 쌍 수정·code-snippets 방식·실패 접근 반복 여부) → Unity 면 current-analysis Step 4 갱신.
**출력**: `PGE_SELF_CHECK.md` + 산출물.
## Phase 3: QA (별도 subagent — 변경 파일 목록 + PGE_SPEC 경로만 전달)
변경 파일 = `git diff --name-only {base}...HEAD`(또는 `git status --porcelain`) **기계 산출**. 흐름도 → `§QA 에이전트 스폰 흐름도`.
| 트랙 | 감지 | 실행 |
|---|---|---|
| A 기능 | 서버/로직(.cs service·.ts service·.py) | 선행 `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/assert-db-isolation.sh"`(WARN 시 격리 DB 지정, `FORGE_DB_ISOLATION_ENFORCE=1` 시 BLOCK) → 빌드 Error 0 → `verify.sh code` + 데이터 흐름 트레이싱 |
| B 웹/앱 UI | .tsx/.jsx/.css/.html | `/visual-loop` + `/playwright-parallel-test` |
| C 게임 | Unity .cs+.prefab+.anim | `/game-qa`(3계층 → `§트랙 C — 검증 3계층`) |
- 중복 가능. 도구 부재(fail-open): verify.sh 없음 → npm test/build·pytest 등 대체, 그것도 없으면 빌드만 + `verify.sh: SKIPPED (not found, no fallback)` · UI 도구 둘 다 없음 → `SKIPPED (no UI test tool available)` 를 Evaluator 에 전달(침묵 PASS 금지).
- 결과 `PGE_QA_RESULT.md`. FAIL → Generator 로 되돌려 Phase 2 재실행.
## Phase 4: Evaluator (독립 실행체 — Generator 반대 벤더·같은 등급)
```bash
IMPL_MODEL="$(cat "$WORKTREE/.coder-attribution" 2>/dev/null)"   # 실제 구현 모델(요청 레인 아님)
EVAL_SPEC="$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/evaluator-lane.sh" "$IMPL_MODEL")"
EVAL_MODEL="$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/coder-model-resolve.sh" "$EVAL_SPEC")"
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/evaluator-lane.sh" --verify "$IMPL_MODEL" "$EVAL_MODEL" || echo "⛔ 교차 불성립 — 판정 보류"  # rc 3 같은 벤더 · 2 판정 불가
```
- `gpt-*` → `mcp__codex__codex`(model=$EVAL_MODEL, sandbox=read-only, cwd=$WORKTREE) · 그 외 → `Agent(subagent_type="general-purpose", model=$EVAL_MODEL)`. 호출자가 넘긴 `--coder`/`model` 무시.
- ⛔ `--verify` rc≠0·Codex 호출 실패 → Claude 로 갈아타지 말고 **이 사이클 판정 보류** + 사람 알림(PASS 넘기지 않음).
- Codex 전사 규약: 프롬프트에 "끝에 사이클 레코드 JSON 1줄" 요구 → 원문 전체 `{project_root}/.claude/state/PGE_EVAL_RAW.txt` 덮어쓰기 → JSON 줄을 바이트 그대로 JSONL append, 나머지를 QA_REPORT 로 · JSON 없음/파싱불가 = 지어내지 말고 `data_integrity` STOP. 메인은 판정·점수 수정 금지.
- 전달: `current-analysis.md` · `PGE_SPEC.md` · `PGE_QA_RESULT.md` · 기계 산출 diff · (트랙 C, 존재 시) `.claude/reference/pge-game-evaluator-rubric-detail.md`. **미전달**: Generator 의도·시도·실패 이력.
- 수행: Rubric 채점 → QA 잔존 이슈 감점 → 항목별 `PASS [{req}:{check}]` / `FAIL [{req}:{check}] — {위치} / {이유} / {방법}` / `SECURITY_CRIT [{req}:{check}] — {내용}`(별도 섹션) → SELF_CHECK 불신 → 레코드 append:
  `{"cycle": N, "score": S, "items": [{"id": "<req>:<check>", "verdict": "PASS|FAIL"}], "security_crit": [<id>]}`
**출력**: `PGE_QA_REPORT.md`(덮어쓰기) + `PGE_EVAL_HISTORY.jsonl`(append 전용).
## Phase 4.5: Codex 2차 리뷰 — `/codex-review --stage code --target <PGE diff>`
80+ = `--effort medium` · 60~79 = `--effort high` · <60 = 생략, 단 보안 민감 surface(auth/session/token/password/crypt/payment/secret/credential · api/routes/controllers/handlers/middleware · .env/.pem/.key) 면 "보안 관점 우선" 1회.
- SECURITY_CRIT → 점수 무관 Phase 5 순위1. Codex CRITICAL → JSONL 에 별도 `security_event` 라인 append(in-memory 보유 금지). 보안 STOP 은 best-effort.
- `agreement` → 점수 확정 · `disagreement` → 4.6 · `extension` → 이슈를 QA_REPORT 에 추가, 사용자 컨펌 후 진행. 링크 `forge-outputs/docs/reviews/code/{date}-forge-pge-{slug}.md`.
## Phase 4.6: Advisor (60~79 또는 disagreement 일 때만, `FORGE_ADVISOR_AUTO=off` 면 끔) → `references/call-budget-guards.md §Phase 4.6` Read.
## Phase 5: 결정표 (`maxCycles`=`--cycles`, 위에서부터 첫 매칭 1회, 구조화 id 만 — `rollback_trigger` 만 prose)
- **게이트 G**: 사이클 N(regression 시 N-1) 레코드 누락·파싱불가 또는 `shared/scripts/pge-eval-raw-check.sh` 원문 대조 불일치 → **[STOP] DATA_INTEGRITY**.
| 순위 | 조건 | 트리거 | 행동 |
|:-:|---|---|---|
| 1 | security_crit / rollback | `security_crit[]`≠∅ 또는 `security_event` 라인 또는 rollback_trigger 충족 | **[STOP]** `[SECURITY_CRIT]`/`[ROLLBACK]` |
| 2 | rubric_all_pass | eval_ids ∪ 이전 PASS id 커버 AND items[] 전부 PASS | SUCCESS (아니면 N≥2 → 순위3, N=1 → continue) |
| 3 | regression (N≥2) | (N-1 PASS) ∩ (N FAIL 또는 사라진 id, 1회 re-emit 재확인) ≠ ∅ | **[STOP]** 이전 통과 깨짐 |
| 4 | same_issue (N≥3, kernel) | 동일 id 3사이클 연속 FAIL | **[STOP]** + 구현 방식 전환 권고 |
| 5 | max_cycles | N≥maxCycles 또는 PGE_CALL_CAP 초과 | **[STOP]** 현상태+잔존 이슈 |
| — | 그 외 FAIL | N<maxCycles | continue → Phase 2 (FAIL = 접근 전환 입력) |
- STOP 메시지 형식 → `references/pge-phase-details.md §Phase 5 STOP 메시지 형식`. 사이클 진입 전 call-budget·stop-condition 확인(`loop-budget.sh`·`loop-call-accum.sh`) → `references/call-budget-guards.md`(1회 PASS 면 불필요). 3사이클 후 FAIL → 핸드오버에 `pge-failure 후보:` 1줄.
## Phase 6: 사후 Spec (SUCCESS 직후, WARN-first)
① `test -d "{project_root}/.specify"` ② `grep -rl 'spec-validation\|specify/specs' {project_root}/.github/` ≥1 — 둘 다일 때만 `.specify/specs/$(git rev-parse --abbrev-ref HEAD).md` 발행(있으면 append): `## 구현된 FR` · `## 변경 범위` · `## 검증 결과` · `## 산출 근거`. 아니면 스킵 사유 1줄. 실패해도 PGE FAIL 아님.
## 파일 (`{project_root}/.claude/state/`)
`PGE_SPEC.md`(Planner, 덮어쓰기) · `current-analysis.md`(본체 덮어쓰기 + 실패 이력 append) · `PGE_SELF_CHECK.md` · `PGE_QA_RESULT.md` · `PGE_QA_REPORT.md` · `PGE_EVAL_RAW.txt` · `PGE_EVAL_HISTORY.jsonl`(append 전용, 유일한 판정 소스).
## 완료·통합
- 보고 형식 → `references/pge-phase-details.md §완료 보고 형식`.
- eval-rubric(`eval-rubric/references/skill-integration.md`): Phase 4 후 target=산출물, case_id `EC-forge-pge-{N}` → `~/.claude/skills/forge-pge/eval_cases.jsonl`.
- Workflow: `Workflow({ script: Bash("cat ~/.claude/skills/forge-pge/workflow.js") })` (`CLAUDE_CODE_DISABLE_WORKFLOWS=1` → fallback).
