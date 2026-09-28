---
description: Codex 2차 리뷰 단축 래퍼 — 버그 수정 patch 리뷰
argument-hint: "<patch-file or PR-N> [--cr <on|degrade|off>]"
group: verify
---

# /forge-bug-review

> ⚠️ 구 이름 **"/cr-bug"** 는 2026-09-07 개명했다. 헬퍼 스크립트 파일명·감사로그·증거
> 경로(`cr-evidence/`)는 **그대로 둔다** — 쌓인 증거가 그 이름으로 묶여 있어서다.
> 근거: 간판만 바꾸고 배달 주소를 바꾸면 옛 증거가 통째로 안 보이게 된다.
> 폐기조건: 옛 증거를 더 안 읽어도 되면 헬퍼 파일명까지 후속 개명한다.

`/codex-review --stage bugfix` 단축 래퍼.

## 사용

```
/forge-bug-review patches/fix-token-leak.diff
/forge-bug-review PR-5678
```

## 동작

```bash
# --cr 파싱: $ARGUMENTS에서 --cr <mode> 추출 후 전달
CR_ARG=$(echo "$ARGUMENTS" | grep -oP '(?<=--cr )\S+' || true)
TARGET=$(echo "$ARGUMENTS" | sed 's/--cr[[:space:]]\+\S\+//g' | xargs)
/codex-review --stage bugfix --target "$TARGET" ${CR_ARG:+--cr "$CR_ARG"}
```

- 모델: **`codex:high`** 티어(xhigh effort) — 이 단일 리뷰 레인은 astra 를 쓰지 않는다. id·하향 스위치(`--terra`/`--luna`)·구 CLI 동작(#745 — 이 레인은 자동 폴백 없음)·구 표기 이력의 정본 = `commands/codex-review.md §Step 2` (6개 래퍼에 복사하지 않는다 — #1139 C034).
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

$0.00 (ChatGPT 구독, gpt-6-sol — OAuth 호출 가능) / 비상 폴백(apikey 시): xhigh effort 는 종량

## 관련

- 본명령: `/codex-review --stage bugfix`
- 선행 스킬: `/investigate`
