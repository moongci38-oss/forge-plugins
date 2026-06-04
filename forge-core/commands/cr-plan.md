---
description: Codex 2차 리뷰 단축 래퍼 — Spec/Plan 리뷰 (권고, non-blocking — AD-50)
argument-hint: "<spec-or-plan-file-path>"
group: verify
---

# /cr-plan

`/codex-review --stage plan` 단축 래퍼.

## 사용

```
/cr-plan docs/spec/feature-x.md
/cr-plan .specify/specs/2026-05-07-auth.md
```

## 동작

```bash
/codex-review --stage plan --target $ARGUMENTS
```

- 모델: gpt-5.5 (medium effort) — ChatGPT OAuth 기본
- Blocking: NO (권고 — AD-50. FAIL 시 Human 판단으로 진행 가능)
- 결과: `forge-outputs/docs/reviews/plan/{date}-{slug}.{md,json}`

## 리뷰 포커스

- 요구 명확성, 누락된 요구사항
- 모순·중복
- YAGNI 위반 (불필요한 기능)
- 보안 갭 (Spec 단계에서 식별 가능한 것)

## 비용

$0.00 (OAuth) / ~$0.01~0.03 (API key + gpt-5-mini)

## 관련

- 본명령: `/codex-review --stage plan`
- 정책: `~/forge/dev/rules/codex-review-policy.md`
