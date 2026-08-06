# eval-rubric 스킬 통합 패턴 (공유 정본)

> 이 문서 = 여러 스킬에 중복되던 "자동 평가 (eval-rubric 통합)" 보일러플레이트의 단일 정본
> (2026-07-30 harness-diet #3 dedup). 각 스킬은 이 패턴을 참조하고 **스킬 고유값만**(target 경로·
> 호출 시점·case_id prefix·eval_cases 경로) 자기 SKILL.md에 남긴다.

## 목적

스킬이 핵심 산출물을 낸 뒤 자동으로 `eval-rubric`을 호출해 4축 Rubric(clarity/consistency/
completeness/safety)로 채점하고 결과를 `eval_cases.jsonl`에 누적한다. 회귀 평가 데이터셋 구축용.

## 절차 (공통)

1. 스킬 산출물 저장 직후 호출:
   ```
   /eval-rubric --target {스킬별 산출물 경로}
   ```
2. eval-rubric의 verdict(PASS/WARN/FAIL) + 4축 점수 + rationale 수신.
3. `eval_cases.jsonl` append:
   - case_id: `EC-{skill-name}-{N}` (auto-increment)
   - split: holdout 결정 — `hash(case_id) % 100 < 20` → holdout, 그 외 sample
   - dedupe key: `sha256(skill + input.context + input.args)` 충돌 시 observed_count++

## 자동 비활성 조건 (공통)

- 환경변수 `EVAL_RUBRIC_AUTO=off`
- 스킬 frontmatter에 `eval_cases: off` (특수 케이스)

## 통합 효과 (공통)

- FAIL 케이스 자동 누적 → 회귀 평가 데이터셋
- WARN 시 사용자 알림(자동 차단 X — 본 스킬 verdict 우선)
- 분기별 Harness GC 사이클의 Quality Audit 입력

## 보안 / 데이터 보호 (공통)

- eval-rubric 입력 redaction 정책 자동 적용(`eval-rubric/SKILL.md` "보안 정책" 참조)
- 산출물에 secret/PII 의심 시 → eval-rubric STOP fail-safe → 본 스킬도 STOP

> 출처: 하네스 백과사전 제5장 평가 하네스, eval_cases.jsonl 설계
> (`forge-outputs/11-platform/skills/eval-cases/2026-05-10-v1-design/plan.md`). 실패 시 [[pev-self-correction]] 적용.
