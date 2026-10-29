# forge#4135 forge-core mutation

- 되돌림: `forge-core/commands/forge-analysis-review.md` 를 base(PR #113 head) 판으로 → `--verify` DRIFT_forge-core=1 (기대 1 · FAIL 재현)
- 복구 뒤: DRIFT_forge-core=0 (기대 0)

## 자기 적대
1. 다른 플러그인 폴더를 같이 바꿨나 → sync 뒤 다른 플러그인 3개는 `git checkout --` 로 되돌렸다(새 작업대 · 내 변경뿐) · `git diff --stat` 에 forge-core 와 marketplace.json 판 줄만.
2. 플러그인 전용 파일을 지웠나 → **이 PR 의 커밋은** forge 기록에 있던 것만 지웠다(`git log -- .claude/<칸>/<이름>`). 그러나 아래에 깔린 PR #113(dfd0b74)이 플러그인 전용 시험 `forge-core/hooks/plugin-hook-timeout.test.sh` 를 지웠고 이 PR diff 에 같이 실렸다(qa BLOCKING H1) — 되살리고 정규식을 `hook_entry` 까지 넓혔다(아래 H1 절).
3. DRIFT 0 이 '완전 동기화'인가 → 아니다 — 플러그인이 아직 안 싣는 forge 항목(INBOUND_NOT_CARRIED)은 이 PR 범위 밖(#4135 할 일 6 · 담는 결정 필요).

## qa BLOCKING H1 — plugin-hook-timeout.test.sh
- 되살린 시험 + 넓힌 정규식 → PASS=1 FAIL=0 (main-write-guard 등록 60 ≥ 상한 60)
- mutation ① plugin.json main-write-guard 등록 timeout 60 → 30:
```
  FAIL  main-write-guard.sh — 등록 timeout 30 < 상한 인자 60
결과: PASS=0 FAIL=1
```
- mutation ② 정규식을 옛 `hook_deadline_guard` 로:
```
  FAIL  상한을 쓰는 등록 훅 0개 — 이 검사가 헛돈다
결과: PASS=0 FAIL=1
```

## finding-tests 짝 — forge-core/tests/plugin-hook-timeout.test.sh
- hooks/plugin-hook-timeout.test.sh 를 치우면: `  FAIL  plugin-hook-timeout 시험 실재·통과 — /tmp/h4-fp-forge-core/forge-core/tests/../hooks/plugin-hook-timeout.test.sh 없음(지워졌다)` rc=1
- 되돌리면 PASS(rc=0)
