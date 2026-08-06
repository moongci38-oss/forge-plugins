---
name: design-plan-closeout
description: "design-plan-closeout 루프를 실행한다. 트리거: 사용자가 /design-plan-closeout 를 호출할 때만. 종료조건 — design-plan-verify.sh exit 0 — 디자인 품질 계획서 v3 의 완료 판정 측정명령 전량 PASS (P0.2/0.3/0.5 · P1.1~1.4 · P2 15축 · P3.1 SSoT · P4 지표하네스). Human 게이트 항목(P0.1/0.4 DesignSync write, P4 승격선 적용)은 예측에서 제외하되 DEFERRED 로 명시 출력한다."
disable-model-invocation: true
---

<!-- 생성: forge-loop-maker scaffold (2026-08-06).
     계획서: forge-outputs/11-platform/pipelines/plans/2026-08-05-design-expert-quality-plan.md (v3) -->

# design-plan-closeout

## Goal

**Exit predicate:** design-plan-verify.sh exit 0 — 디자인 품질 계획서 v3 의 완료 판정 측정명령 전량 PASS (P0.2/0.3/0.5 · P1.1~1.4 · P2 15축 · P3.1 SSoT · P4 지표하네스). Human 게이트 항목(P0.1/0.4 DesignSync write, P4 승격선 적용)은 예측에서 제외하되 DEFERRED 로 명시 출력한다.

루프는 이 조건이 충족될 때까지 실행됩니다. 매 이터레이션 후 verifier가 predicate를 검사합니다.

---

## Conventions

> **이 파일은 runtime read-only입니다. 상태(카운터·타임스탬프·진행 결과)를 여기에 쓰지 마세요.**

- 변경 상태는 모두 `/home/damools/forge/.claude/worktrees/design-plan-closeout/loops/design-plan-closeout/STATE.md`에 저장
- 이 파일은 cold-start 시 디스크에서 새로 로드됨 — 여기 쓴 상태는 다음 실행 시 초기화됨
- Durable 정보만: goal predicate, action 절차, verifier 호출, stop criteria

## Pattern: pev

| Step | 내용 |
|------|------|
| 1. Read state | `/home/damools/forge/.claude/worktrees/design-plan-closeout/loops/design-plan-closeout/STATE.md` 로드 → 이전 진행 상태 복원 |
| 2. Discover | 소스(디렉토리·API·qa-report 등) 스캔 → 처리할 항목 식별 |
| 3. Act | 이터레이션 핵심 액션 실행 |
| 4. Verify | **선행: 의존 MCP liveness pre-check** — verifier 의존 MCP 도구 1회 ping, 실패 시 G2 게이트 라우팅 + "재연결 필요" 명시(무감지 disconnect 실증 2026-07-10). 이후 verifier 실행 (binary exit code) — exit 0 = 통과, exit 1 = 중단 |
| 5. Write state | `/home/damools/forge/.claude/worktrees/design-plan-closeout/loops/design-plan-closeout/STATE.md` 갱신 (새 위치·카운터·타임스탬프) |
| 6. Check predicate | `design-plan-verify.sh exit 0 — 디자인 품질 계획서 v3 의 완료 판정 측정명령 전량 PASS (P0.2/0.3/0.5 · P1.1~1.4 · P2 15축 · P3.1 SSoT · P4 지표하네스). Human 게이트 항목(P0.1/0.4 DesignSync write, P4 승격선 적용)은 예측에서 제외하되 DEFERRED 로 명시 출력한다.` 충족 시 STOP, 아니면 반복 |

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
| call-budget | 1500 (hook WARN-only) |
| wall-clock | 4시간 |

---

## How to run

```
/goal "design-plan-verify.sh exit 0 — 디자인 품질 계획서 v3 의 완료 판정 측정명령 전량 PASS (P0.2/0.3/0.5 · P1.1~1.4 · P2 15축 · P3.1 SSoT · P4 지표하네스). Human 게이트 항목(P0.1/0.4 DesignSync write, P4 승격선 적용)은 예측에서 제외하되 DEFERRED 로 명시 출력한다."
```

첫 실행 전 HUMAN-GATES.md G1 gate 완료 필수.
