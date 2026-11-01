---
name: forge-review
description: "통합 검수 입구(stage·mode·lens · 파일/폴더/PR) — 검수를 명시 호출할 때 사용한다. 엔진은 codex-review 그대로."
---

# Forge Review

> 통합 검수 입구(사람 결정 2026-10-26 · #3638). 지금은 **얇은 입구**다 — 받은 인자를 그대로 `codex-review` 스킬에 넘기고, 그 절차를 그대로 따른다(동작 불변). 이중 인터페이스 — 수동 슬래시 = `commands/forge-review.md` · 한쪽 삭제 금지.

- 인자·stage·mode·lens 표 정본 = `${FORGE_ROOT:-$HOME/forge}/.claude/skills/codex-review/SKILL.md §인자` · 절차(Step) = `${FORGE_ROOT:-$HOME/forge}/.claude/commands/codex-review.md`. 여기 다시 적지 않는다.
- 부르는 꼴: `/forge-review --stage <stage> --target <파일|폴더|PR-N> [--mode multi | --lens <관점> [--exec]] [-- <엔진에 넘길 인자>]` = `/codex-review` 와 같은 인자.
- `codex-review` 는 한 릴리스 동안 호환 입구로 남는다 — 본문을 이쪽으로 옮기는 일은 호환 기간이 끝날 때 한다(#3638 옛 입구 제거 조각).
