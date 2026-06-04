---
description: Opus + Codex + Gemini 3-worker 검수 (cr-multi --mode triple 단축). plateau 자동 승격 또는 중요 spec에 사용.
group: review
---

# /cr-triple

`/cr-multi` `--mode triple` 단축 래퍼.

```
/cr-triple <target-file> [--stage plan|code|test|final]
```

→ `/cr-multi <target-file> --mode triple [--stage <stage>]`

## 트리거 조건

- `/cr-double` 3회 plateau 감지 후 자동 승격
- Phase 9 (PR 머지 직전) 중요 spec
- 사용자 명시 요청

## Workflow 실행 (계획서 P0-4)

```js
// 외부 토큰 선발행 후 Workflow 실행 (cr-multi workflow.js 위임)
Workflow({
  script: Bash("cat ~/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET_PATH, mode: 'triple', stage: STAGE }
})
```

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 cr-multi 직접 실행.
