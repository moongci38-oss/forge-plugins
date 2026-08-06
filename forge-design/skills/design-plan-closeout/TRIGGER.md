<!-- root-cause: forge-loop-maker scaffold 템플릿 — TRIGGER.md 생성용 -->
# design-plan-closeout — Trigger Definition

---

## Verifiable goal

루프 종료 predicate:

> **design-plan-verify.sh exit 0 — 디자인 품질 계획서 v3 의 완료 판정 측정명령 전량 PASS (P0.2/0.3/0.5 · P1.1~1.4 · P2 15축 · P3.1 SSoT · P4 지표하네스). Human 게이트 항목(P0.1/0.4 DesignSync write, P4 승격선 적용)은 예측에서 제외하되 DEFERRED 로 명시 출력한다.**

---

## State file

```
/home/damools/forge/.claude/worktrees/design-plan-closeout/loops/design-plan-closeout/STATE.md
```

매 실행 시작 시 읽고 종료 전 씁니다.
파일 없으면 첫 실행으로 간주 → ledger 초기화 후 시작.

---

## Trigger: manual

### Claude Code

```
/goal "design-plan-verify.sh exit 0 — 디자인 품질 계획서 v3 의 완료 판정 측정명령 전량 PASS (P0.2/0.3/0.5 · P1.1~1.4 · P2 15축 · P3.1 SSoT · P4 지표하네스). Human 게이트 항목(P0.1/0.4 DesignSync write, P4 승격선 적용)은 예측에서 제외하되 DEFERRED 로 명시 출력한다."
```

### 수동 실행 (모든 플랫폼)

```
/home/damools/forge/.claude/worktrees/design-plan-closeout/loops/design-plan-closeout/STATE.md 와 SKILL.md를 읽고 design-plan-closeout 루프를 실행하세요.
```

---

## 실행 전 체크리스트

1. `/home/damools/forge/.claude/worktrees/design-plan-closeout/loops/design-plan-closeout/STATE.md` 존재 + 초기화 확인
2. HUMAN-GATES.md G1 gate 완료
3. verifier exit 0 확인
4. Budget: max-iter=6, call-budget=1500, wall-clock=4시간
