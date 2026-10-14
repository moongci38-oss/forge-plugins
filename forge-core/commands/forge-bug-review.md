---
description: Codex 2차 리뷰 단축 래퍼 — 버그 수정 patch 리뷰
argument-hint: "<patch-file or PR-N> [--cr <on|degrade|off>]"
group: verify
---

# /forge-bug-review

> 구 이름 **"/cr-bug"** — 2026-09-07 개명 · 헬퍼·증거 경로는 그대로(사유 정본 `codex-review.md §단축 래퍼 공통`).

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

- 모델·하향 스위치: `codex-review.md §단축 래퍼 공통` → §Step 2.
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

`codex-review.md §단축 래퍼 공통` 정본.

## 관련

- 본명령: `/codex-review --stage bugfix`
- 선행 스킬: `/investigate`
