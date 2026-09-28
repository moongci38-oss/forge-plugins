---
description: Codex 2차 리뷰 단축 래퍼 — Spec/Plan 리뷰 (권고, non-blocking — AD-50)
argument-hint: "<spec-or-plan-file-path> [--cr <on|degrade|off>]"
group: verify
---

# /forge-plan-review

> ⚠️ 구 이름 **"/cr-plan"** 는 2026-09-07 개명했다. 헬퍼 스크립트 파일명·감사로그·증거
> 경로(`cr-evidence/`)는 **그대로 둔다** — 쌓인 증거가 그 이름으로 묶여 있어서다.
> 근거: 간판만 바꾸고 배달 주소를 바꾸면 옛 증거가 통째로 안 보이게 된다.
> 폐기조건: 옛 증거를 더 안 읽어도 되면 헬퍼 파일명까지 후속 개명한다.

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

- 모델: **`codex:high`** 티어(xhigh effort) — 이 단일 리뷰 레인은 astra 를 쓰지 않는다. id·하향 스위치(`--terra`/`--luna`)·구 CLI 동작(#745 — 이 레인은 자동 폴백 없음)·구 표기 이력의 정본 = `commands/codex-review.md §Step 2` (6개 래퍼에 복사하지 않는다 — #1139 C034).
- Blocking: NO (권고 — AD-50. FAIL 시 Human 판단으로 진행 가능)
- 결과: `forge-outputs/docs/reviews/plan/{date}-{slug}.{md,json}`

## 리뷰 포커스

- 요구 명확성, 누락된 요구사항
- 모순·중복
- YAGNI 위반 (불필요한 기능)
- 보안 갭 (Spec 단계에서 식별 가능한 것)

## 비용

$0.00 (ChatGPT 구독, gpt-6-sol — OAuth 호출 가능) / 비상 폴백(apikey 시): xhigh effort 는 종량

## 관련

- 본명령: `/codex-review --stage plan`
- 정책: `~/forge/dev/rules-on-demand/codex-review-policy.md`
