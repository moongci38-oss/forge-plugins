# forge#4135 forge-core mutation

- 되돌림: `forge-core/commands/forge-analysis-review.md` 를 base(PR #113 head) 판으로 → `--verify` DRIFT_forge-core=1 (기대 1 · FAIL 재현)
- 복구 뒤: DRIFT_forge-core=0 (기대 0)

## 자기 적대
1. 다른 플러그인 폴더를 같이 바꿨나 → sync 뒤 다른 플러그인 3개는 `git checkout --` 로 되돌렸다(새 작업대 · 내 변경뿐) · `git diff --stat` 에 forge-core 와 marketplace.json 판 줄만.
2. 플러그인 전용 파일을 지웠나 → 지운 것은 forge 기록에 있었고 지금 forge develop 에 없는 것만(`git log --all -- .claude/<칸>/<이름>`) · 훅·README 는 손대지 않았다.
3. DRIFT 0 이 '완전 동기화'인가 → 아니다 — 플러그인이 아직 안 싣는 forge 항목(INBOUND_NOT_CARRIED)은 이 PR 범위 밖(#4135 할 일 6 · 담는 결정 필요).
