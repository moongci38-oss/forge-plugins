---
description: Codex 2차 리뷰 단축 래퍼 — 코드 변경 리뷰 (권고)
argument-hint: "<file-path or PR-N>"
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
/codex-review --stage code --target $ARGUMENTS
```

- 모델: gpt-5.5 (medium effort) — ChatGPT OAuth 기본
- Blocking: NO (WARN/FAIL → 사용자 컨펌 후 진행)
- 결과: `forge-outputs/docs/reviews/code/{date}-{slug}.{md,json}`
- Claude 1차 결과 있으면 자동 diff: `delta/{date}-{slug}.md`

## 리뷰 포커스

- 로직 버그 (경계값, off-by-one, 타입 강제)
- 보안 (OWASP Top 10)
- 성능 (N+1, 불필요한 동기 호출)
- 컨벤션 (프로젝트 스타일)

## 비용

$0.00 (OAuth) / ~$0.02~0.05 (API key + gpt-5-mini)

## 관련

- 본명령: `/codex-review --stage code`
- Forge Dev Phase 8 Check 8.7-X에서 자동 호출
