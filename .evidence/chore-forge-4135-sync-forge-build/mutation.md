# forge#4135 forge-build mutation

- 되돌림: `forge-build/agents/cto-advisor.md` 를 base(PR #113 head) 판으로 → `--verify` DRIFT_forge-build=1 (기대 1 · FAIL 재현)
- 복구 뒤: DRIFT_forge-build=0 (기대 0)

## 자기 적대
1. 다른 플러그인 폴더를 같이 바꿨나 → sync 뒤 다른 플러그인 3개는 `git checkout --` 로 되돌렸다(새 작업대 · 내 변경뿐) · `git diff --stat` 에 forge-build 와 marketplace.json 판 줄만.
2. 플러그인 전용 파일을 지웠나 → 지운 것은 forge 기록에 있었고 지금 forge develop 에 없는 것만(`git log --all -- .claude/<칸>/<이름>`) · 훅·README 는 손대지 않았다.
3. DRIFT 0 이 '완전 동기화'인가 → 아니다 — 플러그인이 아직 안 싣는 forge 항목(INBOUND_NOT_CARRIED)은 이 PR 범위 밖(#4135 할 일 6 · 담는 결정 필요).

# 호환 입구 시험 변이 — 되돌려 FAIL

- 새 스킬 3개를 모두 뺌: rc 1 · 끊긴 입구 3개
- forge-prd-review 하나만 뺌: rc 1 · 끊긴 입구 1개
- 입구가 하나도 없는 폴더: rc 1 · 재는 대상 없음(빈 통과 방지)

## 자기 적대 — 재동기화
1. 호환 입구만 받아 스킬이 사라지나 → 새 이름 스킬 3개를 함께 싣고, 끊기면 CI 가 실패한다.
2. 공개 레포에 샌 값이 있나 → plugin-release-gate GATE PASS · --scan-repo LEAK_FILES=0.
3. 남의 플러그인을 건드리나 → 바뀐 파일은 forge-build 와 시험·CI 한 줄뿐이다.
