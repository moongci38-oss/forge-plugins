<!-- root-cause: forge-loop-maker scaffold 템플릿 — TRIGGER.md 생성용 -->
# partner-onboarding-e2e — Trigger Definition

---

## Verifiable goal

루프 종료 predicate:

> **verify.sh: 파트너온보딩 신청→심사→승인→수락→파트너메뉴 + 거절경로 DB/API 전부 PASS → exit 0 (그후 G2 human OAuth E2E)**

---

## State file

```
$HOME/mywsl_workspace/starbeginz-origin/loops/partner-onboarding-e2e/STATE.md
```

매 실행 시작 시 읽고 종료 전 씁니다.
파일 없으면 첫 실행으로 간주 → ledger 초기화 후 시작.

---

## Trigger: manual

### Claude Code

```
/goal "verify.sh: 파트너온보딩 신청→심사→승인→수락→파트너메뉴 + 거절경로 DB/API 전부 PASS → exit 0 (그후 G2 human OAuth E2E)"
```

### 수동 실행 (모든 플랫폼)

```
$HOME/mywsl_workspace/starbeginz-origin/loops/partner-onboarding-e2e/STATE.md 와 SKILL.md를 읽고 partner-onboarding-e2e 루프를 실행하세요.
```

---

## 실행 전 체크리스트

1. `$HOME/mywsl_workspace/starbeginz-origin/loops/partner-onboarding-e2e/STATE.md` 존재 + 초기화 확인
2. HUMAN-GATES.md G1 gate 완료
3. verifier exit 0 확인
4. Budget: max-iter=6, call-budget=100, wall-clock=2h
