<!-- root-cause: forge-loop-maker scaffold 템플릿 — TRIGGER.md 생성용 -->
# dungeon-uiux-loop — Trigger Definition

---

## Verifiable goal

루프 종료 predicate:

> **verify-report.json .summary.pass==true (컴파일0/4버튼/4종Select헤더/리스트10+/일반1-1 인게임 입장/MapPanel off)**

---

## State file

```
${GODBLADE_ROOT}/client/loops/dungeon-uiux-loop/STATE.md
```

매 실행 시작 시 읽고 종료 전 씁니다.
파일 없으면 첫 실행으로 간주 → ledger 초기화 후 시작.

---

## Trigger: manual

### Claude Code

```
/goal "verify-report.json .summary.pass==true (컴파일0/4버튼/4종Select헤더/리스트10+/일반1-1 인게임 입장/MapPanel off)"
```

### 수동 실행 (모든 플랫폼)

```
${GODBLADE_ROOT}/client/loops/dungeon-uiux-loop/STATE.md 와 SKILL.md를 읽고 dungeon-uiux-loop 루프를 실행하세요.
```

---

## 실행 전 체크리스트

1. `${GODBLADE_ROOT}/client/loops/dungeon-uiux-loop/STATE.md` 존재 + 초기화 확인
2. HUMAN-GATES.md G1 gate 완료
3. verifier exit 0 확인
4. Budget: max-iter=6, call-budget=400, wall-clock=2시간
