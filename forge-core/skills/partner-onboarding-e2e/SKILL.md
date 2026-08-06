---
name: partner-onboarding-e2e
description: "partner-onboarding-e2e 루프 실행. 트리거: /partner-onboarding-e2e 호출 시만. 종료조건: 신청→심사→승인→수락→파트너메뉴 + 거절경로 DB/API 전부 PASS."
disable-model-invocation: true
---

# partner-onboarding-e2e

## Goal

**Exit predicate:** verify.sh: 파트너온보딩 신청→심사→승인→수락→파트너메뉴 + 거절경로 DB/API 전부 PASS → exit 0 (그후 G2 human OAuth E2E)

루프는 이 조건이 충족될 때까지 실행됩니다. 매 이터레이션 후 verifier가 predicate를 검사합니다.

> **상세 실행 로직 SSoT (필독)** = `docs/plans/operations-tool/dev-spec/login-signup-approval/E2E-AUTOTEST-PLAN.md`
> *(파이프라인 정본 SSoT=`.specify/specs/`. 본 스킬의 dev-spec 경로는 실행 참조(execution reference). 깊은 로직 변경은 별도 후속 — H5 영향평가 필요.)*
> 이 SKILL.md는 루프 골격입니다. 실제 로직은 계획서 참조:
> - **§10 G1 선결조건 7체크** (첫 실행 전 필수 — _env DI·고유 idem키·DB storybeginz:3306·reCAPTCHA 2키·이메일 ljw7555 pin·RBAC 시드·HS256 토큰)
> - **§3 Phase 0** 블로커 선결 (IHostEnvironment DI + rawToken dev노출[캐시제외] + JwtSecretKey HS256 토큰)
> - **§4 Phase 1** 자동검증 5단계 + 거절 / **§6** verify.sh 스펙 / **§5** Phase 2 G2 human OAuth E2E
> Discover = §1 흐름 EP + 로컬 DB 현 상태 · Act = Phase 0(최초 1회)→Phase 1(고유 Idempotency-Key) · Verify = verify.sh(binary exit, self-grade 금지)

---

## Conventions

> **이 파일은 runtime read-only입니다. 상태(카운터·타임스탬프·진행 결과)를 여기에 쓰지 마세요.**

- 변경 상태는 모두 `$HOME/mywsl_workspace/starbeginz-origin/loops/partner-onboarding-e2e/STATE.md`에 저장
- 이 파일은 cold-start 시 디스크에서 새로 로드됨 — 여기 쓴 상태는 다음 실행 시 초기화됨
- Durable 정보만: goal predicate, action 절차, verifier 호출, stop criteria

## Pattern: pev

| Step | 내용 |
|------|------|
| 1. Read state | `$HOME/mywsl_workspace/starbeginz-origin/loops/partner-onboarding-e2e/STATE.md` 로드 → 이전 진행 상태 복원 |
| 2. Discover | 소스(디렉토리·API·qa-report 등) 스캔 → 처리할 항목 식별 |
| 3. Act | 이터레이션 핵심 액션 실행 |
| 4. Verify | verifier 실행 (binary exit code) — exit 0 = 통과, exit 1 = 중단 |
| 5. Write state | `$HOME/mywsl_workspace/starbeginz-origin/loops/partner-onboarding-e2e/STATE.md` 갱신 (새 위치·카운터·타임스탬프) |
| 6. Check predicate | `verify.sh: 파트너온보딩 신청→심사→승인→수락→파트너메뉴 + 거절경로 DB/API 전부 PASS → exit 0 (그후 G2 human OAuth E2E)` 충족 시 STOP, 아니면 반복 |

verifier exit 1 시 즉시 중단. 상태 파일에 실패 이유 기록 후 HUMAN-GATES.md G2 gate 대기.

---

## Stop Conditions (loop-kernel §1)

| 조건 | 결과 |
|------|------|
| rubric_all_pass | SUCCESS |
| max_cycles (≥ 6) | STOP |
| same_issue × 3 | STOP |
| plateau (net gain ≤ 5, 2연속) | STOP |
| oscillation (pass→fail × 2) | STOP |
| regression | STOP |
| security_crit | STOP |
| budget_advisory | advisory STOP |

---

## Budget

| 항목 | 상한 |
|------|------|
| max-iter | 6 |
| call-budget | 100 (hook WARN-only) |
| wall-clock | 2h |

---

## How to run

```
/goal "verify.sh: 파트너온보딩 신청→심사→승인→수락→파트너메뉴 + 거절경로 DB/API 전부 PASS → exit 0 (그후 G2 human OAuth E2E)"
```

첫 실행 전 HUMAN-GATES.md G1 gate 완료 필수.
