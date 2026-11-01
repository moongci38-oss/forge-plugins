# #4135 재동기화 mutation

파일 하나(forge-build/agents/cto-advisor.md)를 옛 판으로 되돌림:
```
DRIFT_REMAINING=1
  DRIFT: forge-build/agents/cto-advisor.md
```

시험 변이 — 동기화본에서 새 이름 스킬 `forge-qa` 를 빼고 `scripts/compat-stub-targets.test.sh` 를 돌림:
```
PASS 입구 prd-review → forge-prd-review 실림
PASS 입구 work-plan → forge-work-plan 실림
FAIL 입구 qa → forge-qa 없음(<임시>/forge-build/skills/forge-qa)
입구 3개 · 끊긴 입구 1개
```

## 자기 적대
1. 공개 레포에 샌 값이 있나 → plugin-release-gate GATE PASS · --scan-repo LEAK_FILES=0.
2. 지우면 안 될 파일을 지우나 → 이 PR 은 덮어쓰기만 하고 지운 파일이 없다(STALE_REMAINING=0).
3. 호환 입구가 끊기나 → compat-stub-targets 시험이 잰다.
