---
description: Codex + Gemini 2-worker 검수 (cr-multi --mode double 단축)
group: review
---

# /cr-double

`/cr-multi` `--mode double` 단축 래퍼.

```
/cr-double <target-file> [--stage plan|code|test|final]
```

→ `/cr-multi <target-file> --mode double [--stage <stage>]`

## Workflow 실행 (계획서 P0-4)

```js
Workflow({
  script: Bash("cat ~/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET_PATH, mode: 'double', stage: STAGE }
})
```

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 cr-multi 직접 실행.
