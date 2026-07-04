---
description: Codex 2차 리뷰 단축 래퍼 — E2E 테스트 시나리오 리뷰
argument-hint: "<test-file or scenario-md> [--cr <on|degrade|off>]"
group: verify
---

# /cr-test

`/codex-review --stage test` 단축 래퍼.

## 사용

```
/cr-test tests/e2e/checkout.spec.ts
/cr-test docs/qa/scenarios/login.md
```

## 동작

```bash
# --cr 파싱: $ARGUMENTS에서 --cr <mode> 추출 후 전달
CR_ARG=$(echo "$ARGUMENTS" | grep -oP '(?<=--cr )\S+' || true)
TARGET=$(echo "$ARGUMENTS" | sed 's/--cr[[:space:]]\+\S\+//g' | xargs)
/codex-review --stage test --target "$TARGET" ${CR_ARG:+--cr "$CR_ARG"}
```

- 모델: gpt-5.5 (medium effort) — ChatGPT OAuth 기본
- Blocking: severity별 강제 (Opus+Codex 2-leg 판정 기준; Gemini leg=advisory 0.2 가중, 차단 결정 미포함)
  - Critical: hard block → 자동수정 루프(최대 3회) → 3회 초과 → [STOP] Human 에스컬레이션
  - High: [STOP] 1회 override 허용 (Human 사유 명시 시 통과, 사유를 `{domain}/_STATUS.md`에 `cr_override_rate`/High-override 사유 멱등 로깅)
  - Medium/Low: advisory (통과 가능)
  - Phase/PR 경계 1회 트리거 (파일 단위 호출 금지). typo/1-line/non-logic 변경 = skip
- 결과: `forge-outputs/docs/reviews/test/{date}-{slug}.{md,json}`

## 리뷰 포커스

- 커버리지 갭 (Spec FR 대비 누락 시나리오)
- Edge case 누락 (경계값, null, empty, race condition)
- 가짜 통과 (mock 의존, assertion 부재)
- 의도치 않은 통과 (false positive)

## 비용

$0.00 (ChatGPT OAuth, gpt-5.5) / 비상 폴백(apikey 시): ~$0.01~0.03

## 관련

- 본명령: `/codex-review --stage test`
- Forge Dev P6 Check 6-TX에서 자동 호출
