---
description: Codex 2차 리뷰 단축 래퍼 — E2E 테스트 시나리오 리뷰
argument-hint: "<test-file or scenario-md> [--cr <on|cross|degrade|off>]"
group: verify
---

# /forge-test-review

> 구 이름 **"/cr-test"** — 2026-09-07 개명 · 헬퍼·증거 경로는 그대로(사유 정본 `codex-review.md §단축 래퍼 공통`).

`/codex-review --stage test` 단축 래퍼.

## 사용

```
/forge-test-review tests/e2e/checkout.spec.ts
/forge-test-review docs/qa/scenarios/login.md
```

## 동작

```bash
# --cr 파싱: $ARGUMENTS에서 --cr <mode> 추출 후 전달
CR_ARG=$(echo "$ARGUMENTS" | grep -oP '(?<=--cr )\S+' || true)
TARGET=$(echo "$ARGUMENTS" | sed 's/--cr[[:space:]]\+\S\+//g' | xargs)
/codex-review --stage test --target "$TARGET" ${CR_ARG:+--cr "$CR_ARG"}
```

- 모델·하향 스위치: `codex-review.md §단축 래퍼 공통` → §Step 2.
- Blocking: severity별 강제 — **단일 Codex 레인**이다 — 이 래퍼는 교차 검수를 주지 않는다(2벤더 교차는 `/forge-multi`).
  근거: 래퍼가 "2벤더 교차" 를 광고하면 사람이 이걸 돌리고 교차 검수를 받았다고 믿는다 — 실제로는 한 벤더만 봤다.
  폐기조건: 이 래퍼가 `forge-multi` 로 릴레이하게 바뀌면 그때 2벤더 교차로 다시 적는다.
  - Critical: hard block → 고치고 테스트·기계 검사로 확인(검수자를 다시 부르지 않는다) → 2회 고쳐도 테스트가 안 붙으면 [STOP] Human 에스컬레이션
  - High: [STOP] 1회 override 허용 (Human 사유 명시 시 통과, 사유를 `{domain}/_STATUS.md`에 `cr_override_rate`/High-override 사유 멱등 로깅)
  - Medium/Low: advisory (통과 가능)
  - Phase/PR 경계 1회 트리거 (파일 단위 호출 금지). typo/1-line/non-logic 변경 = skip
- 결과: `forge-outputs/docs/reviews/test/{date}-{slug}.{md,json}`

## 리뷰 포커스

- 커버리지 갭 (Spec FR 대비 누락 시나리오)
- Edge case 누락 (경계값, null, empty, race condition)
- 가짜 통과 (mock 의존, assertion 부재)
- 의도치 않은 통과 (false positive)

## 관련

- Forge Dev P6 Check 6-TX 의 통합 지점이지만 **수동 호출 전용**이다 — 자동 게이트는 없다.
