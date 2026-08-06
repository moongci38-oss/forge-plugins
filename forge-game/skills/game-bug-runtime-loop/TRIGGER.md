<!-- root-cause: forge-loop-maker scaffold 템플릿 — TRIGGER.md 생성용 -->
# game-bug-runtime-loop — Trigger Definition

---

## Verifiable goal

루프 종료 predicate:

> **STATE.md 백로그 전 항목 status=COMMITTED (PENDING/REPRO/FIXED/VERIFIED 0건) OR 예산도달**

---

## State file

```
loops/game-bug-runtime-loop/STATE.md
```

매 실행 시작 시 읽고 종료 전 씁니다.
파일 없으면 첫 실행으로 간주 → ledger 초기화 후 시작.

---

## Trigger: manual — Sonnet 세션에서 /game-bug-runtime-loop 또는 /goal

### Claude Code

```
/goal "STATE.md 백로그 전 항목 status=COMMITTED (PENDING/REPRO/FIXED/VERIFIED 0건) OR 예산도달"
```

### 수동 실행 (모든 플랫폼)

```
loops/game-bug-runtime-loop/STATE.md 와 SKILL.md를 읽고 game-bug-runtime-loop 루프를 실행하세요.
```

---

## 실행 전 체크리스트

1. `loops/game-bug-runtime-loop/STATE.md` 존재 + 초기화 확인
2. HUMAN-GATES.md G1 gate 완료
3. verifier exit 0 확인
4. Budget: max-iter=6, call-budget=400, wall-clock=2시간
