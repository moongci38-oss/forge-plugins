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

- 모델: gpt-6-astra (xhigh effort) — 2026-09-06 상향(구: gpt-5.6-sol / xhigh)
  ⚠️ 구 표기 "모델: gpt-5.6-sol (2026-08-22 상향)" 은 2026-09-06 폐기 — 현행 `gpt-6-astra`.
  ⚠️ `--sol`/`--terra`/`--luna` 는 이제 **전부 하향 스위치**다. 구 표기 "`--sol` 은 no-op(이미 기본)" 폐기 —
     사다리 재지정으로 sol 은 astra 한 칸 아래(codex:high)가 됐다. sol/terra/luna 는 **정식 지원 중**이다(폐지 아님).
  ⚠️ 로컬 codex CLI **0.153.4 이상** 필요 — 그 아래는 astra 를 HTTP 400 으로 거부한다.
     재현: `codex --version` → `0.153.4` (2026-09-06 관측)
- Blocking: NO (권고 — AD-50. FAIL 시 Human 판단으로 진행 가능)
- 결과: `forge-outputs/docs/reviews/plan/{date}-{slug}.{md,json}`

## 리뷰 포커스

- 요구 명확성, 누락된 요구사항
- 모순·중복
- YAGNI 위반 (불필요한 기능)
- 보안 갭 (Spec 단계에서 식별 가능한 것)

## 비용

$0.00 (ChatGPT 구독, gpt-6-astra — OAuth 호출 가능) / 비상 폴백(apikey 시): xhigh effort 는 종량

## 관련

- 본명령: `/codex-review --stage plan`
- 정책: `~/forge/dev/rules/codex-review-policy.md`
