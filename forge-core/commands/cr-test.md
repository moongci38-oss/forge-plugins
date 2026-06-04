---
description: Codex 2차 리뷰 단축 래퍼 — E2E 테스트 시나리오 리뷰
argument-hint: "<test-file or scenario-md>"
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
/codex-review --stage test --target $ARGUMENTS
```

- 모델: gpt-5.5 (medium effort) — ChatGPT OAuth 기본
- Blocking: NO (권고)
- 결과: `forge-outputs/docs/reviews/test/{date}-{slug}.{md,json}`

## 리뷰 포커스

- 커버리지 갭 (Spec FR 대비 누락 시나리오)
- Edge case 누락 (경계값, null, empty, race condition)
- 가짜 통과 (mock 의존, assertion 부재)
- 의도치 않은 통과 (false positive)

## 비용

$0.00 (OAuth) / ~$0.01~0.03 (API key + gpt-5-mini)

## 관련

- 본명령: `/codex-review --stage test`
- Forge Dev Phase 8 Check 8.8-X에서 자동 호출
