# Development Workflow Rules (요약)

> 원문 → `rules-on-demand/dev-workflow-rules-full.md` · 절차 상세 → `rules-on-demand/dev-workflow-detail.md`

## 운영 규칙 (사람 결정 2026-09-27, #1342 — 이 절이 다른 규칙보다 우선)
1. **완료 = 테스트 통과 + blocking 0.** 검수는 훅·권한·보안·머지 규칙을 바꿀 때만, **1라운드**.
2. **작업당 예산**: 에이전트 최대 2개 · 수정·재검수 1회. 넘으면 멈추고 보고한다.
   - 읽기 전용 탐색 에이전트는 개수에 넣지 않는다 — **쓰기 도구(Edit·Write·NotebookEdit)가 없는 타입**(Explore·Plan)에 브리프로 쓰기 금지를 명시한 것만. 쓰기 도구를 가진 에이전트는 안 썼어도 센다(#1408).
   - 재검수 뒤 남은 지적이 **이번 수정이 만든 회귀**뿐이면 그것만 고치고 머지한다(3차 검수 없음). 회귀 증명 = 같은 테스트가 수정 직전 커밋 PASS → 수정 커밋 FAIL → 복구 후 PASS. 그 밖(기존 결함·새 HIGH)은 멈추고 보고(#1409).
3. **LOW·비차단 지적은 버린다.** 하네스 갭은 입구 1개(라벨 `harness-gap` · `재현:` · `막힌 것:`)로만 받고 기계가 3칸으로 나눈다 — A 막힘(재현 실행 실패 확인 + 작업 정지·데이터·보안) = AI 가 바로 처리 · B 불편 = 주간 묶음 1장 사람 승인 · C 나머지 = 이슈 만들지 않음(#1350).
4. **하네스 변경 = A칸 + 승인된 B칸 + 사람 요청.** 동시 진행 최대 3.
5. **방(room)은 제품 작업에만.**
근거: 검수→지적→새 이슈→새 PR 이 끝없이 이어져 일이 끝나지 않았다(2026-09-27 하루 신규 이슈 18건). 폐기조건: 사람이 다시 정한다.

## Git
- develop 에 먼저 커밋/푸시 · 배포 브랜치(main·production) 직접 커밋 금지. 신규 브랜치는 develop 분기(hotfix/* 예외).
- develop 머지는 AI 가 한다(squash · 머지 전 판정 코멘트 1줄). 브랜치는 그 세션에서 머지 또는 아카이브로 끝낸다.
- 머지마다 구문 검증(`bash -n`·`py_compile`·`node --check`·JSON). "충돌 없음" ≠ 안전.
- 병행 세션 dirty tree 가 push 를 막으면 임시 워크트리 cherry-pick(D-2) · ⛔ `git stash`/`--autostash` 금지(남의 미커밋 흡수) · ⛔ 남의 파일 커밋 금지. 근거 → `rules-on-demand/dev-workflow-rules-full.md`

## 세션 경계
- 플랫폼 세션(forge·forge-outputs)은 제품 코드를 고치지 않는다 — 제품 repo 일은 위임 브리프로.
