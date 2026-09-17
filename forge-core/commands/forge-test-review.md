---
description: Codex 2차 리뷰 단축 래퍼 — E2E 테스트 시나리오 리뷰
argument-hint: "<test-file or scenario-md> [--cr <on|cross|degrade|off>]"
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

- 모델: gpt-5.6-sol (codex:high, xhigh effort) — 2026-09-17 하향(구: gpt-6-astra). 최고급 astra 는 advisor 전용(사람 지시). effort 는 실행 경로 기본값(xhigh) 그대로.
  ⚠️ 구 표기 "모델: gpt-6-astra (2026-09-06 상향) · `--sol` 도 하향 스위치" 는 2026-09-17 폐기 —
     이제 `--sol` 은 no-op(이미 기본), `--terra`/`--luna` 가 하향 스위치다. 실행 경로 정본 = `commands/codex-review.md §Step 2`.
- Blocking: severity별 강제 — **단일 Codex 레인**(gpt-5.6-sol 1레그)이다.
  ⚠️ **구 표기 "Claude(Opus 5) + Codex(...) 2벤더 교차, 가중 0.5/0.5" 는 2026-09-17 폐기 — 이 래퍼는 교차 검수를 주지 않는다.**
  `/codex-review` 본명령이 스스로 못 박아 둔 그대로다: *"이 커맨드는 단일 Codex 레인이다 — '2벤더 교차' 를 준다고 적지 마라"*(`codex-review.md §⛔ 직접 호출 금지`, 2026-09-13 cr-final HIGH 로 정정된 문장).
  2벤더 교차(Claude Opus 5 + Codex GPT-6 Astra)는 `/cr-triple`·`/cr-double`(= `forge-multi`)이고 `/forge-pr §Step 3` 이 부르는 것도 그쪽이다. **두 레인은 증거를 다른 곳에 쓴다** — 여기는 `docs/reviews/`, 저기는 `.claude/audit/cr-evidence/`.
  근거: 래퍼가 "2벤더 교차" 를 광고하면 사람이 이걸 돌리고 교차 검수를 받았다고 믿는다 — 실제로는 한 벤더만 봤다.
  재현: `grep -n "단일 Codex 레인" .claude/commands/codex-review.md`
  폐기조건: 이 래퍼가 `forge-multi` 로 릴레이하게 바뀌면 그때 2벤더 교차로 다시 적는다.
  <!-- 2026-09-09: 구 표기 "Opus+Codex 2-leg; Gemini leg=advisory 0.2 가중" 폐기 — PR #511(Gemini 전면
       철수)이 이 두 파일을 놓쳤다. 번들 쪽에서 고치면 forge-sync 가 되돌리므로 상류(여기)가 정본이다. -->
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

$0.00 (ChatGPT 구독, gpt-5.6-sol — OAuth 호출 가능) / 비상 폴백(apikey 시): xhigh effort 는 종량

## 관련

- 본명령: `/codex-review --stage test`
- Forge Dev P6 Check 6-TX 의 통합 지점이지만 **자동 호출은 기본 off** — `CODEX_REVIEW_AUTO_STAGES` 에 `test` 를 넣거나 `all` 로 켜야 게이트가 돈다. 평소에는 **수동 호출 전용**이다.
  ⚠️ 구 표기 "Forge Dev P6 Check 6-TX에서 **자동 호출**" 은 2026-09-17 폐기 — 스위치가 꺼진 채로 "자동으로 돈다" 고 광고하고 있었다.
  근거: `.claude/hooks/codex-gate-enforce.sh:117` 이 `[ "${CODEX_REVIEW_AUTO_STAGES:-off}" = "off" ] && exit 0` 로 미설정=off 처리한다(팀 비용 절감). 실측 2026-09-17 — 이 머신 env·양쪽 settings.json `env` 모두 미설정.
  재현: `echo "[${CODEX_REVIEW_AUTO_STAGES:-미설정}]"` → `[미설정]`
  폐기조건: 이 stage 가 기본 on 으로 승격되면 이 두 줄을 지운다.
