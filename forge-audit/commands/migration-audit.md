---
description: 레거시→신규 스택 마이그레이션 검수 하네스. legacy=SSoT, 7 Phase, 100% sync 목표.
group: audit
---

# /migration-audit

**→ skill 로드**: `$HOME/.claude/skills/migration-audit/SKILL.md`

```
/migration-audit <legacy-path> <migrated-path> [--stack=node-nest|php-nest] [--scope=full|domain|events] [--fix=off|propose|auto]
```

예:
- `/migration-audit matgo/server/legacy matgo/server/src --stack=node-nest`
- `/migration-audit baduggi/server/legacy baduggi/server/src --stack=node-nest --fix=propose`
- `/migration-audit matgo/server/legacy matgo/server/src --scope=events`

Subagents:
- `.claude/agents/migration-auditor.md` — read-only 탐지
- `.claude/agents/migration-fixer.md` — write 수정

산출물: `<migrated-path>/../docs/migration-audit/<name>/`

Milestone 게이트: M1(탐지리포트) → [STOP] → M2(golden) → M3(trace) → M4+(fix루프)
