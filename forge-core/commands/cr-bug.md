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

- 모델: gpt-5.5 (medium effort) — ChatGPT OAuth 기본
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

$0.00 (ChatGPT OAuth, gpt-5.5) / 비상 폴백(apikey 시): ~$0.02~0.05

## 관련

- 본명령: `/codex-review --stage bugfix`
- 선행 스킬: `/investigate`
