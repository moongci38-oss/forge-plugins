---
description: Codex 2차 리뷰 단축 래퍼 — E2E 테스트 시나리오 리뷰
argument-hint: "<test-file or scenario-md> [--cr <on|degrade|off>]"
group: verify
---

# /forge-test-review

> ⚠️ 구 이름 **"/cr-test"** 는 2026-09-07 개명했다. 헬퍼 스크립트 파일명·감사로그·증거
> 경로(`cr-evidence/`)는 **그대로 둔다** — 쌓인 증거가 그 이름으로 묶여 있어서다.
> 근거: 간판만 바꾸고 배달 주소를 바꾸면 옛 증거가 통째로 안 보이게 된다.
> 폐기조건: 옛 증거를 더 안 읽어도 되면 헬퍼 파일명까지 후속 개명한다.

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

- 모델: gpt-6-astra (xhigh effort) — 2026-09-06 상향(구: gpt-5.6-sol / xhigh)
  ⚠️ 구 표기 "모델: gpt-5.6-sol (2026-08-22 상향)" 은 2026-09-06 폐기 — 현행 `gpt-6-astra`.
  ⚠️ `--sol`/`--terra`/`--luna` 는 이제 **전부 하향 스위치**다. 구 표기 "`--sol` 은 no-op(이미 기본)" 폐기 —
     사다리 재지정으로 sol 은 astra 한 칸 아래(codex:high)가 됐다. sol/terra/luna 는 **정식 지원 중**이다(폐지 아님).
  ⚠️ 로컬 codex CLI **0.153.4 이상** 필요 — 그 아래는 astra 를 HTTP 400 으로 거부한다.
     재현: `codex --version` → `0.153.4` (2026-09-06 관측)
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

$0.00 (ChatGPT 구독, gpt-6-astra — OAuth 호출 가능) / 비상 폴백(apikey 시): xhigh effort 는 종량

## 관련

- 본명령: `/codex-review --stage test`
- Forge Dev P6 Check 6-TX에서 자동 호출
