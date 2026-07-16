---
description: Opus + Codex + Gemini 3-worker 검수 (cr-multi --mode triple 단축). plateau 자동 승격 또는 중요 spec에 사용.
group: review
---

# /cr-triple

`/cr-multi` `--mode triple` 단축 래퍼.

```
/cr-triple <target-file> [--stage plan|code|test|final] [--cr on|degrade|off] [--no-codex] [--fable] [--sol|--terra|--luna]
```

→ `/cr-multi <target-file> --mode triple [--stage <stage>] [--cr <crMode>] [--fable] [--sol|--terra|--luna]`

**`--cr` / `--no-codex`**: codex-critic 워커 제어.
- `--cr on` (default): Opus + Codex + Gemini 3-worker
- `--cr degrade` 또는 `--no-codex`: Codex 제외 → Opus + Gemini 2-worker (rate-limit 보호 / 대량루프 / Codex MCP 불가 환경 폴백)
- `--cr off`: 동일 (`degrade`와 동작 동일)

**`--fable`** (Human 수동 전용 — 비가역·최고위험 검수만): Claude 레그를 **Fable 5로 승격**(Codex·Gemini 불변). **자동 발동 없음 — 사용자가 명시할 때만.** 종량 $10/$50·org usage-credits 필수. forge-pr/자동 게이트 배선 금지. 상세 → `/cr-multi §--fable`.

**`--sol`/`--terra`/`--luna`** (Human opt-in — 2026-07-15): **Codex 검수 레그 모델 승격**(Claude·Gemini 불변). `--sol`→codex:max(gpt-5.6-sol, 프런티어) · `--terra`→codex:high(gpt-5.6-terra, 균형) · `--luna`→codex:low(gpt-5.6-luna, 효율). 미지정 시 기본(gpt-5-mini) 유지 = no-op. **ChatGPT Plus 정액이라 추가 비용 0** (Fable과 달리 종량 아님). `--fable --sol` 동시 = 최상위 검수(claude:max + codex:max + gemini). 모델 id는 `model-registry.json` SSoT 소유(버전무관).

## 트리거 조건

- `/cr-double` 3회 plateau 감지 후 자동 승격
- P7 (Merge 직전) 중요 spec
- 사용자 명시 요청

## Workflow 실행 (계획서 P0-4)

```js
// --cr 파싱: CR_ARG = args 중 '--cr <val>' 또는 '--no-codex' 감지
// CR_MODE = (--no-codex 있으면 'degrade') || (--cr 값) || 'on'
// --fable 파싱: FABLE = args에 '--fable' 있으면 true (Human 수동 전용 — Claude 레그 Fable 5 승격)
// --sol/--terra/--luna 파싱 (Codex 검수 레그 tier 승격, model-registry SSoT):
//   CODEX_TIER = --sol→'max' · --terra→'high' · --luna→'low' · (없으면 미설정)
//   CODEX_MODEL = CODEX_TIER 설정 시 Bash(`~/forge/shared/scripts/model-registry-resolve.sh codex:$CODEX_TIER`) 결과, 없으면 null
//     → registry가 버전무관 해석(codex:max→gpt-5.6-sol 등). resolve 실패 시 null(기본 gpt-5-mini 유지, fail-open).
// 외부 토큰 선발행 후 Workflow 실행 (cr-multi workflow.js 위임)
Workflow({
  script: Bash("cat ~/.claude/skills/cr-multi/workflow.js"),
  args: { slug: SLUG, targetPath: TARGET_PATH, mode: 'triple', stage: STAGE, crMode: CR_MODE, fable: FABLE, codexModel: CODEX_MODEL }
})
```
`FABLE`이 `true`이면 workflow.js가 Claude 레그(기본 Sonnet)를 `claude-fable-5`로 승격. 미지정(false)이면 기존 3-LLM 동작 100% 동일.
`CODEX_MODEL`이 설정되면(--sol/terra/luna) workflow.js가 codex-critic에 model override directive를 주입해 Codex 레그를 승격. 미지정(null)이면 기본 gpt-5-mini 유지.

`crMode`가 `'on'`(default) 이면 workflow.js는 기존 3-LLM 동작 유지.
`crMode`가 `'degrade'`/`'off'` 이면 codex-critic 워커 및 ApproveWorker를 건너뛰고 Opus+Gemini만 실행.

Agent Teams fallback: `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 시 cr-multi 직접 실행.
