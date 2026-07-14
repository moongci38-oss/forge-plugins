---
description: Codex + Gemini 2-worker 검수 (cr-multi --mode double 단축)
group: review
---

# /cr-double

`/cr-multi` `--mode double` 단축 래퍼.

```
/cr-double <target-file> [--stage plan|code|test|final] [--cr on|degrade|off] [--no-codex]
```

→ `/cr-multi <target-file> --mode double [--stage <stage>] [--cr <crMode>]`

**`--cr` / `--no-codex`**: codex-critic 워커 제어.
- `--cr on` (default): Codex + Gemini 2-worker
- `--cr degrade` 또는 `--no-codex`: Codex 제외 → Gemini 1-worker (rate-limit 보호 / Codex MCP 불가 환경 폴백)
- `--cr off`: 동일 (`degrade`와 동작 동일)

## Workflow 실행 (계획서 P0-4)

```js
// CR_MODE = (--no-codex 있으면 'degrade') || (--cr 값) || 'on'
Workflow({
  script: Bash("cat ~/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET_PATH, mode: 'double', stage: STAGE, crMode: CR_MODE }
})
```

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 cr-multi 직접 실행.
