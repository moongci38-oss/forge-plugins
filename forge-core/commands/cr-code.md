---
description: Codex 2차 리뷰 단축 래퍼 — 코드 변경 리뷰 (권고)
argument-hint: "<file-path or PR-N> [--cr <on|degrade|off>]"
group: verify
---

# /cr-code

`/codex-review --stage code` 단축 래퍼.

## 사용

```
/cr-code src/auth/middleware.ts
/cr-code PR-1234
/cr-code         # 인자 없으면 git diff develop
```

## 동작

```bash
# --cr 파싱: $ARGUMENTS에서 --cr <mode> 추출 후 전달
CR_ARG=$(echo "$ARGUMENTS" | grep -oP '(?<=--cr )\S+' || true)
TARGET=$(echo "$ARGUMENTS" | sed 's/--cr[[:space:]]\+\S\+//g' | xargs)
/codex-review --stage code --target "$TARGET" ${CR_ARG:+--cr "$CR_ARG"}
```

- 모델: gpt-5.5 (medium effort) — ChatGPT OAuth 기본
- Blocking: severity별 강제 (Opus+Codex 2-leg 판정 기준; Gemini leg=advisory 0.2 가중, 차단 결정 미포함)
  - Critical: hard block → 자동수정 루프(최대 3회) → 3회 초과 → [STOP] Human 에스컬레이션
  - High: [STOP] 1회 override 허용 (Human 사유 명시 시 통과, 사유를 `{domain}/_STATUS.md`에 `cr_override_rate`/High-override 사유 멱등 로깅)
  - Medium/Low: advisory (통과 가능)
  - typo/1-line/non-logic 변경 = skip
- 결과: `forge-outputs/docs/reviews/code/{date}-{slug}.{md,json}`
- Claude 1차 결과 있으면 자동 diff: `delta/{date}-{slug}.md`

## 리뷰 포커스

- 로직 버그 (경계값, off-by-one, 타입 강제)
- 보안 (OWASP Top 10)
- 성능 (N+1, 불필요한 동기 호출)
- 컨벤션 (프로젝트 스타일)

## 비용

$0.00 (ChatGPT OAuth, gpt-5.5) / 비상 폴백(apikey 시): ~$0.02~0.05

## 관련

- 본명령: `/codex-review --stage code`
- Forge Dev P5 Check P5.7-X에서 자동 호출
