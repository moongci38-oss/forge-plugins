---
description: 통합 검수 입구 — 받은 인자를 그대로 `/codex-review` 엔진에 넘긴다(#3638).
argument-hint: "--stage <plan|analysis|code|test|final|bugfix|yt-apply-plan|article-apply-plan|phase1-validate> --target <file|dir|PR#> [--mode single|multi] [--lens security|ui|perf|tests|traceability [--exec]] [-- <넘길 인자>] [--effort low|medium|high|xhigh] [--blocking] [--cr <on|degrade|off>] [--sol|--terra|--luna]"
group: verify
---

# /forge-review

통합 검수 입구(사람 결정 2026-10-26 · #3638). 지금은 **얇은 입구**다 — 받은 인자를 하나도 바꾸지 않고 `/codex-review` 에 넘긴다(동작 불변 — stage·mode·lens·blocking·AUTO_STAGES 모두 codex-review 그대로).
인자·stage·mode·lens 표 정본 = `skills/codex-review/SKILL.md §인자` · 절차(Step) = `commands/codex-review.md`(여기 다시 적지 않는다).
`/codex-review` 는 한 릴리스 동안 호환 입구로 남는다 — 본문을 이쪽으로 옮기는 일은 호환 기간이 끝날 때 한다(#3638 옛 입구 제거 조각).

## 동작

```bash
/codex-review $ARGUMENTS
```

## 사용

```
/forge-review --stage plan --target docs/spec/feature-x.md
/forge-review --stage code --target PR-1234 --mode multi -- --cr on
/forge-review --stage code --target src/auth/ --lens security --exec
```
