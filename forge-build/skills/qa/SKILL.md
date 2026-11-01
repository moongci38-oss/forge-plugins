---
name: qa
description: "옛 이름 — /forge-qa 를 쓴다(#3738 호환 입구)."
---

# qa → forge-qa (호환 입구)

> QA 스킬의 새 이름은 `forge-qa` 다(#3738). 이 입구는 **한 릴리스 동안만** 남는다 — 옛 호출이 0건이 되면 지운다.

- 절차 정본 = `${FORGE_ROOT:-$HOME/forge}/.claude/skills/forge-qa/SKILL.md` — 그 파일을 Read 해 받은 인자 그대로 따른다. 여기 다시 적지 않는다.
- 이 폴더의 `reference.md`·`scripts/`·`workflow.js`·`MVP-CONTRACT.md`·`eval_cases.jsonl` 은 정본이 쓰는 보조 파일이다 — 지우지 않는다.
