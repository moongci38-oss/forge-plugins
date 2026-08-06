<!-- root-cause: forge-loop-maker scaffold 템플릿 — TRIGGER.md 생성용 -->
# dungeon-play-loop — Trigger Definition

---

## Verifiable goal

루프 종료 predicate:

> **4던전(일반/균열/초월/레이드) 각각 입장→플레이→클리어→보상 E2E 4/4 PASS + 콘솔 예외 0 + 스펙 FR 체크리스트 전항목 충족 (verifier exit 0)**

---

## State file

```
${GODBLADE_ROOT}/loops/dungeon-play-loop/STATE.md
```

매 실행 시작 시 읽고 종료 전 씁니다.
파일 없으면 첫 실행으로 간주 → ledger 초기화 후 시작.

---

## Trigger: manual — /dungeon-play-loop 명시 호출 (싱글런)

### Claude Code

```
/goal "4던전(일반/균열/초월/레이드) 각각 입장→플레이→클리어→보상 E2E 4/4 PASS + 콘솔 예외 0 + 스펙 FR 체크리스트 전항목 충족 (verifier exit 0)"
```

### 수동 실행 (모든 플랫폼)

```
${GODBLADE_ROOT}/loops/dungeon-play-loop/STATE.md 와 SKILL.md를 읽고 dungeon-play-loop 루프를 실행하세요.
```

---

## 실행 전 체크리스트

1. `${GODBLADE_ROOT}/loops/dungeon-play-loop/STATE.md` 존재 + 초기화 확인
2. HUMAN-GATES.md G1 gate 완료
3. verifier exit 0 확인
4. Budget: max-iter=12, call-budget=2000, wall-clock=6시간
