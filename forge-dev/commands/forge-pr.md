---
description: PR 생성 + Codex /cr-final 적대적 리뷰 + 머지 (옛 /sdd Phase 5)
argument-hint: "[--no-cr-final] [--auto-merge]"
group: deploy
---

# /forge-pr

PR 생성 단독 실행. `/sdd` Phase 5 분리 명령 (AD-46).

## 실행 단계

1. **브랜치 diff 확인** — develop ↔ feature 브랜치 변경 내역 요약
2. **`gh pr create`** — 자동 제목 + body (handover 요약 기반)
3. **`/cr-final` 자동 호출** (blocking, Codex 적대적 리뷰)
   - PASS → 머지 (`--auto-merge` 시 자동 / 기본 Human 확인)
   - FAIL → [STOP] Human 에스컬레이션
4. **`--no-cr-final`** — `/cr-final` 생략 (긴급 머지 시만)

## 선행 조건

- `/qa` PASS 완료 후 호출
- Check 9 기준 충족 (Pre-PR benchmark + Codex 리뷰)

## Exit 코드

| 코드 | 의미 |
|:---:|------|
| 0 | 머지 완료 |
| 1 | PR 생성 실패 |
| 2 | /cr-final FAIL |
| 3 | 머지 거부 (Human [STOP]) |
