---
description: Opus + Codex + Gemini 3-worker 검수 (cr-multi --mode triple 단축). plateau 자동 승격 또는 중요 spec에 사용.
group: review
---

# /cr-triple

`/cr-multi` `--mode triple` 단축 래퍼.

```
/cr-triple <target-file> [--stage plan|code|test|final] [--cr on|degrade|off] [--no-codex] [--fable]
```

→ `/cr-multi <target-file> --mode triple [--stage <stage>] [--cr <crMode>] [--fable]`

**`--cr` / `--no-codex`**: codex-critic 워커 제어.
- `--cr on` (default): Opus + Codex + Gemini 3-worker
- `--cr degrade` 또는 `--no-codex`: Codex 제외 → Opus + Gemini 2-worker (rate-limit 보호 / 대량루프 / Codex MCP 불가 환경 폴백)
- `--cr off`: 동일 (`degrade`와 동작 동일)

**`--fable`** (Human 수동 전용 — 비가역·최고위험 검수만): Claude 레그를 **Fable 5로 승격**(Codex·Gemini 불변). **자동 발동 없음 — 사용자가 명시할 때만.** 종량 $10/$50·org usage-credits 필수. forge-pr/자동 게이트 배선 금지. 상세 → `/cr-multi §--fable`.

## 트리거 조건

- `/cr-double` 3회 plateau 감지 후 자동 승격
- P7 (Merge 직전) 중요 spec
- 사용자 명시 요청

## Workflow 실행 (계획서 P0-4)

```js
// --cr 파싱: CR_ARG = args 중 '--cr <val>' 또는 '--no-codex' 감지
// CR_MODE = (--no-codex 있으면 'degrade') || (--cr 값) || 'on'
// --fable 파싱: FABLE = args에 '--fable' 있으면 true (Human 수동 전용 — Claude 레그 Fable 5 승격)
// 외부 토큰 선발행 후 Workflow 실행 (cr-multi workflow.js 위임)
Workflow({
  script: Bash("cat $HOME/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET_PATH, mode: 'triple', stage: STAGE, crMode: CR_MODE, fable: FABLE }
})
```
`FABLE`이 `true`이면 workflow.js가 Claude 레그(기본 Sonnet)를 `claude-fable-5`로 승격. 미지정(false)이면 기존 3-LLM 동작 100% 동일.

`crMode`가 `'on'`(default) 이면 workflow.js는 기존 3-LLM 동작 유지.
`crMode`가 `'degrade'`/`'off'` 이면 codex-critic 워커 및 ApproveWorker를 건너뛰고 Opus+Gemini만 실행.

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 cr-multi 직접 실행.
