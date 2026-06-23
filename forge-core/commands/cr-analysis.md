---
description: Codex 2차 리뷰 단축 래퍼 — 분석노트·cross-repo·backlog·runbook 문서 리뷰 (비차단, 권고)
argument-hint: "<analysis-or-backlog-or-runbook-md-path>"
group: verify
---

# /cr-analysis

`/codex-review --stage analysis` 단축 래퍼.

## 사용

```
/cr-analysis docs/analysis/cross-repo/2026-05-05-payment-flow.md
/cr-analysis docs/security-backlog.md
/cr-analysis docs/operations/some-runbook.md
```

## 동작

```bash
/codex-review --stage analysis --target $ARGUMENTS
```

- 모델: gpt-5.5 (medium effort) — ChatGPT OAuth 기본
- Blocking: NO (권고 — 분석노트는 즉시 실행 가능 산출물이 아님)
- 결과: `forge-outputs/docs/reviews/analysis/{date}-{slug}.{md,json}`
- 프롬프트: `codex-review-analysis.md` (backlog/runbook frontmatter도 공용 — L-57)

## 리뷰 포커스

- 근거 충실도 (각 주장이 code/file/line으로 추적 가능한가)
- 추정 명시 (검증 안 된 추론이 `[추정]` / `[검증 전 구현 사용 금지]` 태그 달렸는가)
- 범위 명확성 (repo·branch·검사 시점 명시 여부)
- 내부 모순
- SSoT 주장 위험 (코드 검증 없이 "SSoT"·"canonical"·"must follow" 단정 → 태그 의무)

**plan stage 기준 적용 X**: AC·testability·YAGNI·롤백 = 분석노트엔 해당 없음.

## plan stage와 헷갈리지 말 것

- 즉시 실행 가능 task 시퀀스 (파일 path·정확 값·검증 명령 확정) = `/cr-plan`
- 현황 분석 노트 / 백로그 / runbook 초안 = `/cr-analysis`
- `--stage plan`으로 분석 doc(frontmatter `stage: analysis|backlog|runbook`)을 호출하면 `/codex-review` Step 1.6 auto-route가 analysis로 가로챔

## 비용

$0.00 (OAuth) / ~$0.01~0.03 (API key + gpt-5-mini)

## 관련

- 본명령: `/codex-review --stage analysis`
- 프롬프트: `${FORGE_ROOT:-$HOME/forge}/.claude/prompts/codex-review-analysis.md`
- 정책: `${FORGE_ROOT:-$HOME/forge}/dev/rules/codex-review-policy.md`
- 자매: `/cr-plan` (Spec/Plan, blocking)
