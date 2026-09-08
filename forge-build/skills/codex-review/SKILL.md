---
name: codex-review
description: "OpenAI Codex(gpt-6-astra, xhigh effort) 경유 2차 리뷰 게이트 — Claude 1차 리뷰의 동일모델 맹점 보완. Stage 분기: plan/code/test/final/bugfix. P3~P7 자동 호출(spec/plan 작성 후, PR, E2E 시나리오, 머지 직전, 버그수정 patch 후)."
---

# Codex Review

> **인터페이스 구분(harness #3 2026-07-30)**: 이 SKILL = **자동/파이프라인 인터페이스**(P3~P7 Forge Dev 단계 자동 호출). 수동 `/codex-review` 슬래시는 `commands/codex-review.md`. 의도적 이중 인터페이스 — 한쪽 삭제 금지, stage 분기·`CODEX_REVIEW_AUTO_STAGES` 규약 공유, 로직 변경 시 양쪽 동기.

Claude 1차 리뷰의 동일 모델 맹점 보완용 2차 게이트. SDD·PGE·Forge Dev 모든 단계에서 사용 가능.

## 역할

Claude 1차 리뷰의 동일 모델 맹점을 보완하는 OpenAI Codex(gpt-6-astra) 경유 2차 리뷰 게이트. 대체가 아니라 추가 검증이며 stage(plan/code/test/final/bugfix)별로 차등 blocking을 적용한다.

## 컨텍스트

SDD·PGE·Forge Dev 파이프라인 전 단계에서 호출 가능. Forge Dev 통합 지점은 P3/P4(plan, blocking) / P5 Check P5.7-X(code, 권고) / P6 Check 6-TX(test, 권고) / P7 Check 7-X(final, blocking · effort=xhigh) / 버그 patch 후(bugfix, 수동). `${FORGE_ROOT:-$HOME/forge}/.env`의 `CODEX_REVIEW_AUTO_STAGES`로 자동 발동 stage를 제어한다.

## 출력

`docs/reviews/{stage}/{date}-{slug}.{md,json}` 표준 스키마 리포트(Claude vs Codex `delta_vs_claude` 필드 포함) + INDEX 갱신 + blocking stage는 [STOP] 여부.

## Workflow 통합 (계획서 P2-8)
단독 호출 = 현행 유지. cr-multi Workflow에 흡수 가능 (mode='double' — Claude+Codex).
실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/cr-multi/workflow.js"), args: { targetPath, mode: 'double', stage, repoRoot } })`

⚠️ **`repoRoot`(검수 대상 레포 절대경로)를 반드시 함께 넘긴다.** 빠뜨리면 레그가 자기 CWD
(=세션 시작 디렉터리)에서 파일을 찾는다 — 그게 같은 레포의 낡은 워크트리면 경로가 전부
해석돼 **확신을 갖고 정반대 결론**을 낸다(2026-08-07 PR #53 실사례). 값은 보통
`git rev-parse --show-toplevel` 또는 워크트리 작업 시 그 워크트리의 절대경로다.
단독 Codex만 필요 시 → 기존 /codex-review 그대로 사용. `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 방식.

## Quick Start

```
/codex-review --stage plan --target docs/spec/feature-x.md --blocking
/codex-review --stage code --target src/auth.ts
/codex-review --stage test --target tests/e2e/login.spec.ts
/codex-review --stage final --target PR-1234 --effort xhigh --blocking
/codex-review --stage bugfix --target patches/fix-token-leak.diff
```

단축 래퍼: `/cr-plan`, `/cr-code`, `/cr-test`, `/cr-final`, `/cr-bug`.

상세 호출 절차·JSON 스키마·diff 처리는 `${FORGE_ROOT:-$HOME/forge}/.claude/commands/codex-review.md` 참조.

## Stage 분기

| Stage | 호출 시점 | Effort | Blocking |
|-------|---------|:------:|:-------:|
| `plan` | Spec/PRD 작성 직후 | xhigh | YES |
| `code` | P5 Check P5.7-X | xhigh | NO |
| `test` | P6 Check 6-TX | xhigh | NO |
| `final` | P7 Check 7-X (PR 직전) | **xhigh** | YES |
| `bugfix` | 버그 patch 작성 후 (수동) | xhigh | NO |

> **AUTO 발동 여부는 이 표에 없다** — `CODEX_REVIEW_AUTO_STAGES`(정본 = `commands/codex-review.md` Step 1.5, 기본값 **off**)로만 결정된다. Blocking 열은 "그 stage가 auto/수동으로 발동됐을 때" 결과가 [STOP]을 유발하는지를 뜻하며, 발동 자체를 보장하지 않는다.

`code` vs `final` 영역 차이:
- `code` = 단위 변경의 로직·보안·성능 (함수·클래스 수준)
- `final` = 통합 검증 (Spec 추적·롤백·UX·보안 통합·마이그레이션, 변경 전체)

동일 영역 재검증 시 `final` 효과 0. 호출 시 stage별 평가 기준 인입 의무.

## AUTO_STAGES 정책

> **정본 = `.claude/commands/codex-review.md` (Step 1.5 게이트).** 이 절은 요약이며,
> 값이 어긋나면 커맨드를 따른다. 2026-07-14 실측에서 두 문서의 **기본값이 서로 달랐다**
> (커맨드 `off` vs 스킬 `plan,final`) — 리뷰 게이트가 돌기도 하고 조용히 안 돌기도 했다.

`${FORGE_ROOT:-$HOME/forge}/.env` 환경변수:

```bash
CODEX_REVIEW_AUTO_STAGES="${CODEX_REVIEW_AUTO_STAGES:-off}"   # 미설정 = off (팀 비용절감)
```

- **미설정 → `off`** (기본). 자동 호출 없음 — 명시적으로 켜야 돈다.
- `"all"` → 모든 stage 자동 (비용 주의)
- `"plan,final"` → 핵심만 자동, code/test는 수동 권고
- 매칭 stage만 자동 호출. 미매칭은 즉시 exit 0
- `--cr on` 인자로 호출당 override 가능

## 비용 (OAuth 모드 — 현재)

ChatGPT OAuth (Plus/Pro 한도) → 모든 stage `$0.00`. API key fallback 시만 비용 발생 (`$CODEX_REVIEW_MODEL` 설정).

| Stage | OAuth | API key fallback |
|-------|:-----:|----------------|
| plan | $0.00 | gpt-6-astra (xhigh) — 종량 시 상승 |
| code | $0.00 | gpt-6-astra (xhigh) — 종량 시 상승 |
| test | $0.00 | gpt-6-astra (xhigh) — 종량 시 상승 |
| final | $0.00 | gpt-6-astra (xhigh) — 종량 시 상승 |
| bugfix | $0.00 | gpt-6-astra (xhigh) — 종량 시 상승 |

상세 정책 (스킵 패턴·다운그레이드·diff 처리): `${FORGE_ROOT:-$HOME/forge}/dev/rules/codex-review-policy.md`.

## 효과 측정 (OAuth 모드)

비용 0이므로 일치율·발견 가치 측정이 핵심. 매 호출 JSON에 `delta_vs_claude` 자동 기록 (commands/codex-review.md Step 5).

월별 통계:

```bash
${FORGE_ROOT:-$HOME/forge}/shared/scripts/codex-monthly-stats.sh
```

임계값:
- `agreement_rate > 90%` 3개월 연속 → 해당 stage AUTO OFF 권고 (중복)
- `extension_rate > 30%` → AUTO ON 권고 (효과 입증)
- `disagreement_rate > 10%` → 정책 재검토

## Codex-Probe 하드닝 (LN-09)

Codex CLI 호출 전 4단계 probe 필수 (commands/codex-review.md Step 2에 앞서 실행):

### 1. Version Check
```bash
codex --version 2>&1 | grep -E "^[0-9]+\.[0-9]+" || { echo "[CODEX-PROBE] version check failed"; exit 1; }
```
버전 확인 실패 = CLI 미설치 또는 PATH 문제 → TELEMETRY_ERROR_CLASS=codex_missing 기록 후 Opus 단독 폴백.

### 2. Timeout Wrapper
```bash
timeout 120 codex "$@"
EXIT_CODE=$?
[ $EXIT_CODE -eq 124 ] && { _record_hang; exit 1; }
```
타임아웃: 120초 (final stage는 240초). 초과 시 → hang 기록 + 폴백.

### 3. Hang Recording
타임아웃(exit 124) 또는 행(≥120s 무응답) 발생 시:
```bash
_record_hang() {
  export TELEMETRY_OUTCOME=FAIL TELEMETRY_ERROR_CLASS=codex_hang TELEMETRY_FAILED_STEP=codex_cli_exec
  echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"codex_hang\",\"stage\":\"$STAGE\"}" >> .claude/usage.log
}
```
hang 3회 연속 → AUTO_STAGES에서 해당 stage 자동 제거 + 사용자 경고.

### 4. Auth Detection
Codex CLI 응답에서 인증 오류 분류:
```bash
if echo "$CODEX_OUTPUT" | grep -qiE "unauthorized|invalid.*api.*key|auth.*fail|401|forbidden"; then
  TELEMETRY_ERROR_CLASS=codex_auth_fail
  echo "[CODEX-PROBE] auth failure detected — check OPENAI_API_KEY or OAuth session"
  # OAuth 모드: re-login 안내. API key 모드: key 교체 안내
  exit 1
fi
```
auth fail vs timeout vs model_unavailable 구분 → 오류별 대응 경로 분기.

## Forge Dev 통합 지점

| Phase | Stage | Blocking |
|-------|-------|:-------:|
| P4 (Spec 작성) | `plan` | YES |
| P3 (계획서) | `plan` | YES |
| P5 Check P5.7-X (코드 리뷰 1차 후) | `code` | NO (default OFF) |
| P6 Check 6-TX (QA Loop 후) | `test` | NO (default OFF) |
| P7 Check 7-X (PR 직전 통합) | `final` | YES (effort=xhigh) |

## 핵심 원칙

1. **이중 게이트**: Claude 1차는 항상 유지. Codex는 추가 (대체 X).
2. **단계별 차등**: 2026-08-22 부로 **effort 는 전 단계 `xhigh` 로 통일**(구: final=high / code·test=medium).
   차등이 남는 축은 **blocking 여부 하나**다 — `plan`·`final` 이 blocking, `code`·`test`·`bugfix` 는 권고.
   (구 문장 "final만 blocking" 은 같은 파일의 stage 표·통합 표와 모순돼 2026-08-22 정정.)
3. **비용 통제**: OAuth 모드 무빌링. API key 모드만 daily/monthly 한도 적용.
4. **diff 자동 기록**: Claude 결과 존재 시 `delta_vs_claude` 자동 채움. 월별 통계 의사결정 입력.
5. **검증 근거 역질문 (적대적 리뷰 고정 질문)**: 리뷰 대상에 "통과했다"고 보고된 테스트·검증이 있으면, 그 검증이 커버하지 않는 실패 시나리오를 최소 1개 명시하도록 요구한다(없으면 "없음"이라고 명시). 리뷰어 역할은 버그를 찾는 데 그치지 않고 검증 근거 자체에 되묻는 데까지 확장된다 — Codex 호출 프롬프트에 이 질문을 고정 포함한다.
   ↳ **이 항목이 "근거 명시" 축이다** — 지적마다 근거를 대라는 요구는 이 역질문이 이미 커버한다. 같은 취지의 체크 항목을 새로 만들지 않는다(중복 신설 금지).
6. **중복검사 축**: 이번 리뷰의 지적이 **직전 라운드·다른 레그가 이미 낸 지적과 같은 것인지** 먼저 대조하고, 같으면 새 지적으로 세지 말고 `기존 지적 재발(미수정)` 으로 표시한다. ⚠️ **적용 범위 = 프롬프트에 이전 지적이 실제로 제공된 호출만이다** — 현행 단독 호출 경로(`commands/codex-review.md`)는 diff·프롬프트만 넘기므로 그 경우 이 축은 **이번 보고서 안의 지적 간 중복**만 대조하고, 축을 어느 범위로 적용했는지 결과에 1줄 명시한다(안 적으면 안 본 것). 교차 레그·라운드 대조는 이전 지적을 컨텍스트로 넘기는 소비처(cr-multi dedup 단계·재검수 라운드 프롬프트) 몫이다 — 문서가 배선에 없는 입력을 약속하지 않는다(cr-final 2026-08-27 HIGH 정정). 왜: 같은 말을 다시 세면 지적 수가 부풀어 plateau 판정(3회 동일 = 승격)이 오작동하고, 사람은 "리뷰가 일하고 있다"고 착각한다. ⚠️ 무력화되는 입력: 같은 결함을 다른 문장으로 적으면 문자열로는 안 겹친다 — **결함의 위치(파일·함수)로 대조**한다.
7. **AI 생성 코드 재검증 축**: 리뷰 대상 중 **AI 가 생성한 부분을 무비판 수용하지 않는다.** 특히 ①존재하지 않는 API·플래그·옵션을 그럴듯하게 부르는 곳 ②테스트가 구현을 그대로 베껴 항상 통과하는 곳 ③주석·커밋 메시지가 주장하는 동작과 코드가 갈리는 곳을 각각 확인하고, 확인했다는 사실을 결과에 1줄로 남긴다(확인 흔적이 없으면 안 본 것으로 친다). 왜: 생성 코드는 문법·형식이 항상 그럴듯해서 **읽는 사람의 경계심이 먼저 풀린다**.


## 호출처는 commands에 있음

본 스킬은 의미 트리거·정책 요약 전용. **실제 호출 절차는 `${FORGE_ROOT:-$HOME/forge}/.claude/commands/codex-review.md`**:
- Step 1: 대상 + diff 추출
- Step 1.5: AUTO_STAGES 게이트
- Step 2: Codex 호출 (codex CLI exec)
- Step 3: JSON 표준 스키마 정규화
- Step 4: 저장 (`forge-outputs/docs/reviews/{stage}/{date}-{slug}.{md,json}`)
- Step 5: Claude vs Codex Delta 자동 기록 (`delta_vs_claude` 필드)
- Step 6: INDEX 갱신
- Step 7: Blocking 처리

## 관련

- 정책: `${FORGE_ROOT:-$HOME/forge}/dev/rules/codex-review-policy.md`
- Claude 1차: `$HOME/.claude/agents/code-reviewer/agent.md`
- 비교 스크립트: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/codex-delta-compute.py`
- 월별 통계: `${FORGE_ROOT:-$HOME/forge}/shared/scripts/codex-monthly-stats.sh`
- Forge Dev 게이트: `${FORGE_ROOT:-$HOME/forge}/pipeline.md` (Check P5.7-X / P6-TX / P7-X)

## Evaluator (독립 검증 — 실제 호출)

<!-- root-cause(skills-1/S1-06, 2026-08-03 관측): 원래 있던 "자동 평가(eval-rubric 통합)"·"Evaluator (Wave 2.5)" 두 절은 8개 SKILL.md에 동일 문구로 복제된 산문이었고 "자동 누적"이라 썼지만 실행하는 hook/Agent() 호출이 0건이었다(재현: `grep -rn "eval-rubric\|eval_cases" .claude/hooks .claude/settings.json` → 무관 hit뿐). codex-review는 그 자체가 2차 검토 게이트라 산출물의 자기검증 편향(review-of-review)이 특히 우려되므로, 이 스킬만 실제 Agent() 호출로 승격했다(나머지 6개는 제거만 — asset-extract/SKILL.md 등 참조). -->

codex-review 산출물(`docs/reviews/{stage}/{date}-{slug}.json`) 저장 직후, 독립 Evaluator subagent로 구조적 완결성을 확인한다:

```python
Agent(
  subagent_type="general-purpose",
  model="haiku",  # 탐색·기계적 검증 tier — model-routing.md §워커 tier
  prompt=f"""아래 codex-review 산출물 JSON 하나만 읽고 PASS/WARN/FAIL 중 하나와 근거 1줄만 답하라.
파일: {output_json_path}
PASS: stage별 필수 필드(verdict/findings/blocking) 모두 존재 + JSON 파싱 가능 + blocking=true 항목에 근거 텍스트 존재
WARN: 필드는 있으나 findings 배열이 비어 있거나 근거가 사실상 없음
FAIL: 파일 부재 / JSON 파싱 실패 / 필수 필드 누락
"""
)
```

판정 결과를 `$HOME/.claude/skills/codex-review/eval_cases.jsonl`에 `{"case_id":"EC-codex-review-{N}", "verdict":"PASS|WARN|FAIL", "note":"..."}` 형태로 이어서 기록한다(자동 훅 없음 — 이 스텝에서 직접 append). 통합 패턴(절차·holdout·dedupe) 정본 → `eval-rubric/references/skill-integration.md`.
