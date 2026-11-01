# #4135 재동기화 mutation

파일 하나(forge-build/agents/cto-advisor.md)를 옛 판으로 되돌림:
```
DRIFT_REMAINING=1
  DRIFT: forge-build/agents/cto-advisor.md
```

## 자기 적대
1. 공개 레포에 샌 값이 있나 → plugin-release-gate GATE PASS · --scan-repo LEAK_FILES=0.
2. 지우면 안 될 파일을 지우나 → 이 PR 은 덮어쓰기만 하고 지운 파일이 없다(STALE_REMAINING=0).
3. 호환 입구가 끊기나 → compat-stub-targets 시험이 잰다.
