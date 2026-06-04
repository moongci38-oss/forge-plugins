---
description: Codex 적대적 최종 리뷰 — PR 머지 직전 (blocking, high effort)
argument-hint: "<PR-N or branch>"
group: verify
---

# /cr-final

`/codex-review --stage final --effort high` 단축 래퍼.

## 사용

```
/cr-final PR-1234
/cr-final feature/auth-refactor
```

## 동작

```bash
/codex-review --stage final --target $ARGUMENTS --effort high --blocking
```

- 모델: gpt-5.5 (HIGH effort, 적대적) — ChatGPT OAuth 기본
- Blocking: YES (FAIL → PR 차단)
- 결과: `forge-outputs/docs/reviews/final/{date}-{slug}.{md,json}`

## 리뷰 포커스

통합 검수 — PR 전체 관점:
- Spec 추적성 (FR ↔ 구현 ↔ 테스트 매핑)
- 롤백 가능성 (forward-only migration 등 비가역 변경 식별)
- UX 일관성 (디자인 토큰 위반, 3-state 누락)
- 보안 (인증·권한·시크릿)
- 성능 회귀 (벤치마크 +10% 초과)
- 마이그레이션 안전성 (다운타임, 데이터 손실)

## 비용

$0.00 (OAuth) / ~$0.10~0.30 (API key + gpt-5 high effort). 단순 변경은 자동 스킵.

## 관련

- 본명령: `/codex-review --stage final --effort high --blocking`
- Forge Dev Phase 9 Check 9-X에서 자동 호출
- 정책: `~/forge/dev/rules/codex-review-policy.md`
