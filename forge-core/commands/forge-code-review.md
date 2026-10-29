---
description: Codex 2차 리뷰 단축 래퍼 — 코드 변경 리뷰 (권고)
argument-hint: "<file-path or PR-N> [--cr <on|cross|degrade|off>]"
group: verify
---

# /forge-code-review

> 구 이름 **"/cr-code"** — 2026-09-07 개명 · 헬퍼·증거 경로는 그대로(사유 정본 `codex-review.md §단축 래퍼 공통`).

`/codex-review --stage code` 단축 래퍼.

## 사용

```
/forge-code-review src/auth/middleware.ts
/forge-code-review PR-1234
/forge-code-review         # 인자 없으면 git diff develop
```

## 동작

```bash
# --cr 파싱: $ARGUMENTS에서 --cr <mode> 추출 후 전달
CR_ARG=$(echo "$ARGUMENTS" | grep -oP '(?<=--cr )\S+' || true)
TARGET=$(echo "$ARGUMENTS" | sed 's/--cr[[:space:]]\+\S\+//g' | xargs)
/codex-review --stage code --target "$TARGET" ${CR_ARG:+--cr "$CR_ARG"}
```

- 모델·하향 스위치: `codex-review.md §단축 래퍼 공통` → §Step 2.
- Blocking: severity별 강제 — **단일 Codex 레인**이다 — 이 래퍼는 교차 검수를 주지 않는다(2벤더 교차는 `/forge-multi`).
  근거: 래퍼가 "2벤더 교차" 를 광고하면 사람이 이걸 돌리고 교차 검수를 받았다고 믿는다 — 실제로는 한 벤더만 봤다.
  폐기조건: 이 래퍼가 `forge-multi` 로 릴레이하게 바뀌면 그때 2벤더 교차로 다시 적는다.
  - Critical: hard block → 고치고 테스트·기계 검사로 확인(검수자를 다시 부르지 않는다) → 2회 고쳐도 테스트가 안 붙으면 [STOP] Human 에스컬레이션
  - High: [STOP] 1회 override 허용 (Human 사유 명시 시 통과, 사유를 `{domain}/_STATUS.md`에 `cr_override_rate`/High-override 사유 멱등 로깅)
  - Medium/Low: advisory (통과 가능)
  - typo/1-line/non-logic 변경 = skip
- 결과: `forge-outputs/docs/reviews/code/{date}-{slug}.{md,json}`
- Claude 1차 결과 있으면 자동 diff: `delta/{date}-{slug}.md`

## 리뷰 포커스

- 로직 버그 (경계값, off-by-one, 타입 강제)
- 보안 (OWASP Top 10)
- 성능 (N+1, 불필요한 동기 호출)
- 컨벤션 (프로젝트 스타일)
- **모듈 깊이** — 얕은 모듈이 늘었는가(인터페이스가 구현만큼 복잡), I/O 를 정적 결합해
  테스트가 모듈 모킹을 요구하는가. 어휘·판정도구 → `rules-on-demand/codebase-design.md`,
  **리팩토링 PR 이면 리뷰 전에 `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/refactoring-slice.md` 를 읽고**, 그 ①의
  폭 지표(prop·훅·외부 API 수)가 before/after 로 줄었는지 확인한다(파일 수 증가는 성과가 아니다)

## 관련

- Forge Dev P5 Check P5.7-X 의 통합 지점이지만 **수동 호출 전용**이다 — 자동 게이트는 없다.
