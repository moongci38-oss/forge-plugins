---
name: prd-review
description: "옛 이름 — /forge-prd-review 를 쓴다(#3738 호환 입구)."
---

# prd-review → forge-prd-review (호환 입구)

> PRD 5관점 검토 스킬의 새 이름은 `forge-prd-review` 다(#3738). 이 입구는 **한 릴리스 동안만** 남는다 — 옛 호출이 0건이 되면 지운다.

- 절차 정본 = `${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-prd-review/SKILL.md` — 그 파일을 Read 해 받은 인자 그대로 따른다. 여기 다시 적지 않는다.
- 새로 쓰는 문서·호출은 `/forge-prd-review` 로 적는다.
