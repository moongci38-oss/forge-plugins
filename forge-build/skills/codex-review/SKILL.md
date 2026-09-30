---
name: codex-review
description: "OpenAI Codex 경유 2차 리뷰 게이트 — Claude 1차 리뷰의 동일모델 맹점 보완. Stage 분기: plan/code/test/final/bugfix. P3~P7(spec/plan 작성 후, PR, E2E 시나리오, 머지 직전, 버그수정 patch 후)에서 쓰지만 **자동 호출은 기본 off** — `CODEX_REVIEW_AUTO_STAGES` 를 켜야 게이트가 돈다. 평소에는 명시 호출로 쓴다."
---

# Codex Review

> 이 SKILL = 파이프라인 인터페이스(P3~P7). 수동 슬래시·실제 호출 절차 정본 = `~/forge/.claude/commands/codex-review.md`. 이중 인터페이스 — 한쪽 삭제 금지, stage 분기·`CODEX_REVIEW_AUTO_STAGES` 규약 공유, 로직 변경 시 양쪽 동기.

**역할**: Claude 1차 리뷰의 동일 모델 맹점을 보완하는 OpenAI Codex(gpt-6-sol = registry `codex:high`) 2차 리뷰 게이트(대체 아닌 추가, stage별 차등 blocking).
**컨텍스트**: P3~P7 어느 단계에서도 호출 가능 — plan·final 은 blocking, code·test 는 권고, bugfix 는 수동. 자동 발동 stage 는 `.env` 의 `CODEX_REVIEW_AUTO_STAGES` 가 정한다(기본 off — 평소엔 명시 호출).
## 출력·차단 규칙
- ⛔ `mcp__codex__codex` 직접 호출로 대신하지 마라 — 산출물·INDEX 기록, 재호출 **cap=1**, stage별 rubric 이 빠진다(`commands/codex-review.md §직접 부르지 마라`).
- 이 레인은 단일 Codex. 2벤더 교차는 `/forge-multi`( 증거 `.claude/audit/cr-evidence/`). 한쪽만 보고 "검수 없음" 판정 금지.
- 차단선 `severity`: `verdict=FAIL` 이어도 critical/high 0건이면 WARN 강등 후 진행(이 레인 한정, forge-multi 는 `combined<60`). 정본 `commands/codex-review.md §Step 7`.
- 산출물 `docs/reviews/{stage}/{date}-{slug}.{md,json}` 표준 스키마(`delta_vs_claude` 포함) + INDEX 갱신 + blocking stage는 [STOP] 여부.

## Workflow 통합
단독 호출 = 현행. forge-multi Workflow 흡수 가능(mode='double'):
`Workflow({ script: Bash("cat ${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-multi/workflow.js"), args: { targetPath, mode: 'double', stage, repoRoot } })`
- ⚠️ `repoRoot`(검수 대상 레포 절대경로, 보통 `git rev-parse --show-toplevel` 또는 워크트리 절대경로) 필수 — 빠지면 레그가 CWD 기준으로 잘못된 파일을 본다.
- R2 러너(기본 new, 되돌리기 `FORGE_CR_ENGINE_RUNNER=legacy`): 정본 `forge-multi/reference/r2-runner.md`. `cr-run.sh pre --target <레포 상대경로>` `rc≠0` 이면 Workflow 호출 안 함 · 번들은 `bundlePath` 만(인라인 금지) · args 끝에 `...RUNNER_ARGS` · `runner=new` 면 Workflow 뒤 `cr-run.sh post --wf-run <runId>`(`rc≠0` = 결과 무효) · `runner=legacy`(자동 폴백 포함)·`shadow` 면 args 끝에 `runner` 한 키만, post 없음.
- `FORGE_CR_ENGINE_RUNNER=shadow` → `runner: 'shadow'` 만(판정 불변, 기록은 `/forge-pr` record, 정본 `forge-multi/reference/r2-runner.md §shadow`) · `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 방식.

## Quick Start
```
/codex-review --stage plan --target docs/spec/feature-x.md --blocking
/codex-review --stage code --target src/auth.ts   # test 도 동일 형식
/codex-review --stage final --target PR-1234 --effort xhigh --blocking
/codex-review --stage bugfix --target patches/fix-token-leak.diff
```
단축: `/forge-plan-review`, `/forge-code-review`, `/forge-test-review`, `/forge-final`, `/forge-bug-review`.

## Stage 분기 (effort 전부 xhigh)
| Stage | 호출 시점 (Forge Dev) | Blocking |
|---|---|:-:|
| `plan` | P3 계획서 / P4 Spec 작성 직후 | YES |
| `code` | P5 Check P5.7-X | NO |
| `test` | P6 Check 6-TX | NO |
| `final` | P7 Check 7-X (PR 직전, 통합 검증) | YES |
| `bugfix` | 버그 patch 후 (수동) | NO |

- `code` = 단위 변경 로직·보안·성능 / `final` = Spec 추적·롤백·UX·보안 통합·마이그레이션(동일 영역 재검증 효과 0). 호출 시 stage별 평가 기준 인입 의무. Blocking 은 발동 시 [STOP] 유발 여부일 뿐 — 발동은 AUTO_STAGES 로만.

## AUTO_STAGES (정본 `commands/codex-review.md` Step 1.5)
```bash
CODEX_REVIEW_AUTO_STAGES="${CODEX_REVIEW_AUTO_STAGES:-off}"   # ~/forge/.env, 미설정 = off
```
- `off`(기본) 자동 없음 · `"all"` 모든 stage · `"plan,final"` 핵심만 · 미매칭 stage 즉시 exit 0 · `--cr on` 호출당 override.
- 비용: OAuth 모드 $0. API key fallback 시 `$CODEX_REVIEW_MODEL` 종량 + daily/monthly 한도 적용. 정책 → `~/forge/dev/rules-on-demand/codex-review-policy.md`.
- 월별 통계: `~/forge/shared/scripts/codex-monthly-stats.sh` (agreement>90% 3개월 → AUTO OFF 권고 · extension>30% → ON 권고 · disagreement>10% → 재검토). 비교: `~/forge/shared/scripts/codex-delta-compute.py`.

## Codex-Probe (Step 2 전 필수)
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/codex-review-probe.sh" --stage "$STAGE" [--out <raw 파일> -- <codex 인자...>]` → `PROBE`·`CODEX_VERSION`·`EXIT_CODE`·`TELEMETRY_ERROR_CLASS`·`TELEMETRY_FAILED_STEP`. timeout 기본 120(final 240) · hang 은 `.claude/usage.log` 에 `codex_hang` 1줄.
- rc 0 `PROBE=ok` 진행 · rc 1 = 실패(fail-closed, `PROBE` = codex_missing|codex_hang|codex_auth_fail|codex_model_unavailable|codex_fail) · rc 2 = 판정 불가(인자 오류) → 중단·보고.
- version 실패 → `TELEMETRY_ERROR_CLASS=codex_missing` + Opus 단독 폴백 · hang 3회 연속 → 해당 stage AUTO 제거 + 경고 · auth/timeout/model_unavailable 구분 대응.

## 리뷰 프롬프트 고정 원칙
1. Claude 1차(`~/.claude/agents/code-reviewer/agent.md`) 항상 유지, Codex 는 추가.
2. **검증 근거 역질문**: "통과"한 테스트·검증이 커버하지 않는 실패 시나리오 최소 1개(없으면 "없음") — 프롬프트에 고정 포함. 이것이 "근거 명시" 축(중복 신설 금지).
3. **중복검사 축**: 이전 지적이 프롬프트에 제공된 경우만 교차 대조, 같으면 `기존 지적 재발(미수정)`. 단독 호출은 보고서 내 중복만 대조하고 적용 범위를 1줄 명시. 대조는 결함 위치(파일·함수) 기준.
4. **AI 생성 코드 재검증**: ①없는 API·플래그 ②구현을 베낀 테스트 ③주석·커밋과 어긋난 코드 — 각각 확인하고 결과에 1줄 남긴다.
5. Claude 결과 있으면 `delta_vs_claude` 자동 기록.
커맨드 절차: Step 1 대상+diff → 1.5 AUTO 게이트 → 2 Codex exec → 3 JSON 정규화 → 4 저장(`forge-outputs/docs/reviews/{stage}/{date}-{slug}.{md,json}`) → 5 Delta → 6 INDEX → 7 Blocking. 게이트 위치 → `~/forge/pipeline.md`.

## Evaluator (산출물 저장 직후)
```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/codex-review-lint.py" \
  --report "${OUT_DIR}/${DATE}-${SLUG}.json" --stage "$STAGE" > /tmp/cr-lint.json
LINT_RC=$?
```
| rc | verdict | 다음 |
|---|---|---|
| 0 | `PASS` / `WARN`(발견 0건) | 진행 |
| 1 | `FAIL`(필수 필드·JSON 파싱·차단등급 근거 없음) | 산출물 고쳐 재저장 |
| 2 | `UNDECIDED`(stdout JSON 있음) | 아래 LLM 잔여 |
| 2 | stdout JSON 없음 = 경로 오류 | 경로 고쳐 재실행 |

`llm_needed=true` 일 때만(상시 호출 금지):
```python
lint = json.load(open("/tmp/cr-lint.json"))
if lint["llm_needed"]:
  Agent(subagent_type="general-purpose", model="haiku",
    prompt=f"""아래 codex-review 산출물에서 **기계가 확정하지 못한 축만** 보고 PASS/WARN/FAIL 과 근거 1줄만 답하라.
파일: {output_json_path}
남은 축(residual): {json.dumps(lint["residual"], ensure_ascii=False)}
⚠️ 이미 기계가 본 축(필드 존재·배열 여부·근거 텍스트 유무)은 다시 보지 마라 — `machine-vs-llm-boundary.md`.""")
```
- 스키마: 배열 `issues`(`findings` 레거시 별칭), `blocking` 은 CLI 플래그(출력 필드 아님). 테스트 `bash shared/scripts/tests/codex-review-lint.test.sh`.
- 결과를 `~/.claude/skills/codex-review/eval_cases.jsonl` 에 직접 append: `{"case_id":"EC-codex-review-{N}", "verdict":"PASS|WARN|FAIL|UNDECIDED", "note":"..."}` (⛔ `UNDECIDED` 를 PASS·FAIL 로 접지 마라). 패턴 정본 → `eval-rubric/references/skill-integration.md`.
