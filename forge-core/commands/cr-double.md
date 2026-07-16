---
description: Codex + Gemini 2-worker 검수 (cr-multi --mode double 단축)
group: review
---

# /cr-double

`/cr-multi` `--mode double` 단축 래퍼.

```
/cr-double <target-file> [--stage plan|code|test|final] [--cr on|degrade|off] [--no-codex] [--sol|--terra|--luna]
```

→ `/cr-multi <target-file> --mode double [--stage <stage>] [--cr <crMode>] [--sol|--terra|--luna]`

**`--cr` / `--no-codex`**: codex-critic 워커 제어.
- `--cr on` (default): Codex + Gemini 2-worker
- `--cr degrade` 또는 `--no-codex`: Codex 제외 → Gemini 1-worker (rate-limit 보호 / Codex MCP 불가 환경 폴백)
- `--cr off`: 동일 (`degrade`와 동작 동일)

**`--sol`/`--terra`/`--luna`** (Human opt-in, 2026-07-15): Codex 검수 레그 승격. `--sol`→gpt-5.6-sol · `--terra`→gpt-5.6-terra · `--luna`→gpt-5.6-luna. 미지정 시 기본(gpt-5-mini) no-op. ChatGPT Plus 정액이라 추가 비용 0. 상세 → `/cr-triple §--sol`.

## Workflow 실행 (계획서 P0-4)

```js
// CR_MODE = (--no-codex 있으면 'degrade') || (--cr 값) || 'on'
// --sol/--terra/--luna 파싱: CODEX_TIER = sol→max·terra→high·luna→low.
//   CODEX_MODEL = CODEX_TIER 설정 시 Bash(`${FORGE_ROOT:-$HOME/forge}/shared/scripts/model-registry-resolve.sh codex:$CODEX_TIER`), 없으면 null (fail-open).
Workflow({
  script: Bash("cat $HOME/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET_PATH, mode: 'double', stage: STAGE, crMode: CR_MODE, codexModel: CODEX_MODEL }
})
```

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 cr-multi 직접 실행.
