---
name: codex-review
description: OpenAI Codex (gpt-5.5)를 경유한 2차 리뷰 게이트. Claude 1차 리뷰는 그대로 유지하고 동일 모델 맹점을 보완. Stage 분기 (plan/code/test/final/bugfix) · AUTO_STAGES 환경변수 정책 · OAuth 모드 비용 0 · P3/P4/P5/P6/P7 자동 호출. 자동 트리거 시점 - Spec 또는 Plan 작성 후 (stage=plan, blocking), 코드 변경 PR (stage=code, 권고), E2E 시나리오 작성 후 (stage=test, 권고, P6 Check 6-TX), PR 머지 직전 통합 검수 (stage=final, blocking high-effort, P7 Check 7-X), 버그 수정 patch 후 (stage=bugfix, 수동). 본 절차 실행은 ${FORGE_ROOT:-$HOME/forge}/.claude/commands/codex-review.md를 참조한다.
---

# Codex Review

Claude 1차 리뷰의 동일 모델 맹점 보완용 2차 게이트. SDD·PGE·Forge Dev 모든 단계에서 사용 가능.

## 역할

Claude 1차 리뷰의 동일 모델 맹점을 보완하는 OpenAI Codex(gpt-5.5) 경유 2차 리뷰 게이트. 대체가 아니라 추가 검증이며 stage(plan/code/test/final/bugfix)별로 차등 blocking을 적용한다.

## 컨텍스트

SDD·PGE·Forge Dev 파이프라인 전 단계에서 호출 가능. Forge Dev 통합 지점은 P3/P4(plan, blocking) / P5 Check P5.7-X(code, 권고) / P6 Check 6-TX(test, 권고) / P7 Check 7-X(final, blocking high-effort) / 버그 patch 후(bugfix, 수동). `${FORGE_ROOT:-$HOME/forge}/.env`의 `CODEX_REVIEW_AUTO_STAGES`로 자동 발동 stage를 제어한다.

## 출력

`docs/reviews/{stage}/{date}-{slug}.{md,json}` 표준 스키마 리포트(Claude vs Codex `delta_vs_claude` 필드 포함) + INDEX 갱신 + blocking stage는 [STOP] 여부.

## Workflow 통합 (계획서 P2-8)
단독 호출 = 현행 유지. cr-multi Workflow에 흡수 가능 (mode='double' — Claude+Codex).
실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/cr-multi/workflow.js"), args: { targetPath, mode: 'double', stage } })`
단독 Codex만 필요 시 → 기존 /codex-review 그대로 사용. `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 기존 방식.

## Quick Start

```
/codex-review --stage plan --target docs/spec/feature-x.md --blocking
/codex-review --stage code --target src/auth.ts
/codex-review --stage test --target tests/e2e/login.spec.ts
/codex-review --stage final --target PR-1234 --effort high --blocking
/codex-review --stage bugfix --target patches/fix-token-leak.diff
```

단축 래퍼: `/cr-plan`, `/cr-code`, `/cr-test`, `/cr-final`, `/cr-bug`.

상세 호출 절차·JSON 스키마·diff 처리는 `${FORGE_ROOT:-$HOME/forge}/.claude/commands/codex-review.md` 참조.

## Stage 분기

| Stage | 호출 시점 | Effort | Blocking | AUTO 기본값 |
|-------|---------|:------:|:-------:|:---------:|
| `plan` | Spec/PRD 작성 직후 | medium | YES | ON |
| `code` | P5 Check P5.7-X | medium | NO | OFF (수동 권고) |
| `test` | P6 Check 6-TX | medium | NO | OFF (수동 권고) |
| `final` | P7 Check 7-X (PR 직전) | **high** | YES | ON |
| `bugfix` | 버그 patch 작성 후 (수동) | medium | NO | 수동 only |

`code` vs `final` 영역 차이:
- `code` = 단위 변경의 로직·보안·성능 (함수·클래스 수준)
- `final` = 통합 검증 (Spec 추적·롤백·UX·보안 통합·마이그레이션, 변경 전체)

동일 영역 재검증 시 `final` 효과 0. 호출 시 stage별 평가 기준 인입 의무.

## AUTO_STAGES 정책

`${FORGE_ROOT:-$HOME/forge}/.env` 환경변수:

```bash
CODEX_REVIEW_AUTO_STAGES="plan,final"   # default: code/test OFF
```

- `"all"` 또는 미설정 → 모든 stage 자동 (사용 신중)
- `"off"` → 즉시 종료
- `"plan,final"` (default) → 핵심만 자동, code/test는 수동 권고
- 매칭 stage만 자동 호출. 미매칭은 즉시 exit 0

## 비용 (OAuth 모드 — 현재)

ChatGPT OAuth (Plus/Pro 한도) → 모든 stage `$0.00`. API key fallback 시만 비용 발생 (`$CODEX_REVIEW_MODEL` 설정).

| Stage | OAuth | API key fallback |
|-------|:-----:|----------------|
| plan | $0.00 | gpt-5.5 ~$0.01~0.03 |
| code | $0.00 | gpt-5.5 ~$0.02~0.05 |
| test | $0.00 | gpt-5.5 ~$0.01~0.03 |
| final | $0.00 | gpt-5.5 high ~$0.10~0.30 |
| bugfix | $0.00 | gpt-5.5 ~$0.02~0.05 |

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
| P7 Check 7-X (PR 직전 통합) | `final` | YES (effort=high) |

## 핵심 원칙

1. **이중 게이트**: Claude 1차는 항상 유지. Codex는 추가 (대체 X).
2. **단계별 차등**: `final`은 high effort + blocking. `code`/`test`는 medium + 권고.
3. **비용 통제**: OAuth 모드 무빌링. API key 모드만 daily/monthly 한도 적용.
4. **diff 자동 기록**: Claude 결과 존재 시 `delta_vs_claude` 자동 채움. 월별 통계 의사결정 입력.

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

## 자동 평가 (eval-rubric 통합)

본 스킬 결과 산출 후 자동으로 `eval-rubric` 호출 → 4축 Rubric 채점 (clarity/consistency/completeness/safety) → `eval_cases.jsonl` 누적.

### 호출 시점
- 본 스킬 핵심 산출물 저장 직후 — codex-review JSON (`docs/reviews/{stage}/{date}-{slug}.json`)

### 절차
1. 스킬 산출물 저장 후 다음 호출:
   ```
   /eval-rubric --target {산출물 경로}
   ```
2. eval-rubric의 verdict (PASS/WARN/FAIL) + 4축 점수 + rationale 수신
3. `eval_cases.jsonl` append:
   - 위치: `$HOME/.claude/skills/codex-review/eval_cases.jsonl`
   - case_id: `EC-codex-review-{N}` (auto-increment)
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
- eval-rubric의 입력 redaction 정책 자동 적용 (`$HOME/.claude/skills/eval-rubric/SKILL.md` "보안 정책" 참조)
- 산출물에 secret/PII 의심 시 → eval-rubric STOP fail-safe 발화 → 본 스킬도 STOP

> 출처: 하네스 백과사전 제5장 평가 하네스, eval_cases.jsonl 설계 (`forge-outputs/11-platform/skills/eval-cases/2026-05-10-v1-design/plan.md`)

## Evaluator (Wave 2.5)

독립 Evaluator subagent가 산출물 품질을 검증합니다.

```
Evaluator 역할: 산출물 독립 검증
모델: claude-haiku-4-5 (경량, 편향 최소화)
격리: 메인 컨텍스트 오염 방지
```

판정 기준:
- PASS: 모든 핵심 기준 충족, 즉시 사용 가능
- WARN: 사용 가능하나 개선 권장, 사용자 확인 후 진행
- FAIL: 핵심 기준 미충족, 재실행 필요

eval_cases.jsonl에 결과 자동 누적.
