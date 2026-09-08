---
description: Codex 2차 리뷰 단축 래퍼 — 버그 수정 patch 리뷰
argument-hint: "<patch-file or PR-N> [--cr <on|degrade|off>]"
group: verify
---

# /cr-bug

`/codex-review --stage bugfix` 단축 래퍼.

## 사용

```
/cr-bug patches/fix-token-leak.diff
/cr-bug PR-5678
```

## 동작

```bash
# --cr 파싱: $ARGUMENTS에서 --cr <mode> 추출 후 전달
CR_ARG=$(echo "$ARGUMENTS" | grep -oP '(?<=--cr )\S+' || true)
TARGET=$(echo "$ARGUMENTS" | sed 's/--cr[[:space:]]\+\S\+//g' | xargs)
/codex-review --stage bugfix --target "$TARGET" ${CR_ARG:+--cr "$CR_ARG"}
```

- 모델: gpt-6-astra (xhigh effort) — 2026-09-06 상향(구: gpt-5.6-sol / xhigh)
  ⚠️ 구 표기 "모델: gpt-5.6-sol (2026-08-22 상향)" 은 2026-09-06 폐기 — 현행 `gpt-6-astra`.
  ⚠️ `--sol`/`--terra`/`--luna` 는 이제 **전부 하향 스위치**다. 구 표기 "`--sol` 은 no-op(이미 기본)" 폐기 —
     사다리 재지정으로 sol 은 astra 한 칸 아래(codex:high)가 됐다. sol/terra/luna 는 **정식 지원 중**이다(폐지 아님).
  ⚠️ 로컬 codex CLI **0.153.4 이상** 필요 — 그 아래는 astra 를 HTTP 400 으로 거부한다.
     재현: `codex --version` → `0.153.4` (2026-09-06 관측)
- Blocking: NO (수동 호출, 결과 검토 후 사용자 판단)
- 결과: `forge-outputs/docs/reviews/bugfix/{date}-{slug}.{md,json}`

## 리뷰 포커스

- **근본 원인 vs 우회**: 증상만 가린 patch인지 판별
- 회귀 가능성 (수정으로 다른 경로 깨짐)
- 재현 케이스 적정성 (테스트가 실제 버그를 재현하는지)
- 동일 패턴 잠재 위치 (코드베이스 다른 곳에서 같은 버그 가능성)

## 사용 시점

- `/investigate` 스킬로 근본 원인 분석 후
- 수정 patch 작성 직후
- PR 생성 전 (선택)

## 비용

$0.00 (ChatGPT 구독, gpt-6-astra — OAuth 호출 가능) / 비상 폴백(apikey 시): xhigh effort 는 종량

## 관련

- 본명령: `/codex-review --stage bugfix`
- 선행 스킬: `/investigate`
