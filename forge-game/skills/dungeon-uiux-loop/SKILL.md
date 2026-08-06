---
name: dungeon-uiux-loop
description: "dungeon-uiux-loop 루프 실행. 트리거: /dungeon-uiux-loop 호출 시만. 종료조건: verify-report.json summary.pass==true(컴파일0/4버튼/4종Select헤더/리스트10+/일반1-1 입장/MapPanel off)."
disable-model-invocation: true
---

# dungeon-uiux-loop

## Goal

**Exit predicate:** verify-report.json .summary.pass==true (컴파일0/4버튼/4종Select헤더/리스트10+/일반1-1 인게임 입장/MapPanel off)

루프는 이 조건이 충족될 때까지 실행됩니다. 매 이터레이션 후 verifier가 predicate를 검사합니다.

---

## Conventions

> **이 파일은 runtime read-only입니다. 상태(카운터·타임스탬프·진행 결과)를 여기에 쓰지 마세요.**

- 변경 상태는 모두 `${GODBLADE_ROOT}/client/loops/dungeon-uiux-loop/STATE.md`에 저장
- 이 파일은 cold-start 시 디스크에서 새로 로드됨 — 여기 쓴 상태는 다음 실행 시 초기화됨
- Durable 정보만: goal predicate, action 절차, verifier 호출, stop criteria

## Pattern: pev

| Step | 내용 |
|------|------|
| 1. Read state | `${GODBLADE_ROOT}/client/loops/dungeon-uiux-loop/STATE.md` 로드 → 이전 진행 상태 복원 |
| 2. Discover | 소스(디렉토리·API·qa-report 등) 스캔 → 처리할 항목 식별 |
| 3. Act | 이터레이션 핵심 액션 실행 |
| 4. Verify | verifier 실행 (binary exit code) — exit 0 = 통과, exit 1 = 중단 |
| 5. Write state | `${GODBLADE_ROOT}/client/loops/dungeon-uiux-loop/STATE.md` 갱신 (새 위치·카운터·타임스탬프) |
| 6. Check predicate | `verify-report.json .summary.pass==true (컴파일0/4버튼/4종Select헤더/리스트10+/일반1-1 인게임 입장/MapPanel off)` 충족 시 STOP, 아니면 반복 |

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
| call-budget | 400 (hook WARN-only) |
| wall-clock | 2시간 |

---

## How to run

```
/goal "verify-report.json .summary.pass==true (컴파일0/4버튼/4종Select헤더/리스트10+/일반1-1 인게임 입장/MapPanel off)"
```

첫 실행 전 HUMAN-GATES.md G1 gate 완료 필수.
