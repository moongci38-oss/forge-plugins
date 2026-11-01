---
description: Codex 2차 리뷰 단축 래퍼 — Spec/Plan 리뷰 (권고, non-blocking — AD-50)
argument-hint: "<spec-or-plan-file-path> [--cr <on|degrade|off>]"
group: verify
---

# /forge-plan-review

> 구 이름 **"/cr-plan"** — 2026-09-07 개명 · 헬퍼·증거 경로는 그대로(사유 정본 `codex-review.md §단축 래퍼 공통`).

`/codex-review --stage plan` 단축 래퍼.

## 사용

```
/forge-plan-review docs/spec/feature-x.md
/forge-plan-review .specify/specs/2026-05-07-auth.md
```

## 동작

```bash
# --cr 파싱: $ARGUMENTS에서 --cr <mode> 추출 후 전달
CR_ARG=$(echo "$ARGUMENTS" | grep -oP '(?<=--cr )\S+' || true)
TARGET=$(echo "$ARGUMENTS" | sed 's/--cr[[:space:]]\+\S\+//g' | xargs)
/codex-review --stage plan --target "$TARGET" ${CR_ARG:+--cr "$CR_ARG"}
```

- 모델·하향 스위치: `codex-review.md §단축 래퍼 공통` → §Step 2.
- Blocking: NO (권고 — AD-50. FAIL 시 Human 판단으로 진행 가능)
- 결과: `forge-outputs/docs/reviews/plan/{date}-{slug}.{md,json}`

## 리뷰 포커스

- 요구 명확성, 누락된 요구사항
- 모순·중복
- YAGNI 위반 (불필요한 기능)
- 보안 갭 (Spec 단계에서 식별 가능한 것)

## 관련

- 정책: `~/forge/dev/rules-on-demand/codex-review-policy.md`
