// root-cause: Gemini 전면 철수(2026-09-07) — Vision 위임을 Codex(GPT-6 Astra)로 단일화.
//   구독이 Gemini API 를 안 덮어 유일한 종량 벤더였고, 키가 막혀 이 경로가 통째로 죽어 있었다.
//   계획서: ${FORGE_ROOT:-$HOME/forge}-outputs/11-platform/pipelines/plans/2026-09-06-gpt6-astra-pro-plan-proposal.md §W1-②
//   ⚠️ Astra 는 로컬 파일을 직접 읽는다 — 이미지 내용을 인라인할 필요 없이 **절대경로**만 주면 된다.
// ⚠️ Phase 0 전제: Vision 용 codex-critic approve-worker 토큰 외부 선발행 필수.
// crMode gate: args.crMode ∈ {'on','degrade','off'}, 기본 'on' (2026-09-07 flip — 구 기본값 'degrade').
//   'on'      → Codex(Astra) Vision (default)
//   'degrade' → Codex 레그 제외, Claude 자체 Vision 분석으로 축소
//   'off'     → 'degrade' 와 동일(호출부 호환용 별칭 — 이름은 유지, 의미만 재정의)
//   ⚠️ 구 의미("degrade/off → Gemini Vision 직행")는 폐기. Gemini 레그 자체가 사라졌다.
export const meta = {
  name: 'screenshot-analyze',
  description: '스크린샷 Vision 분석 — Codex(GPT-6 Astra) Vision, 실패 시 Claude 자체 분석 fallback',
  phases: [
    { title: 'Analyze', detail: 'Codex(Astra) Vision → (실패 시) Claude 자체 분석 fallback' },
  ],
}

const VISION_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } },
    elements: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
  },
  required: ['description'],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args

const imagePath = _a?.imagePath || ''
const intent = _a?.intent || 'UI 스크린샷 분석 — 요소 추출 + 이슈 탐지'
// root-cause: crMode default flip 'degrade'→'on' (2026-09-07 — fail-safe 대상이던 대체 벤더가 없어졌다)
const crMode = _a?.crMode || 'on'
const prompt = `${intent}. 이미지: ${imagePath}. description + elements + issues + verdict 반환.`

// root-cause: Workflow 샌드박스는 Bash 불가 → model-registry-resolve.sh 를 직접 못 부른다.
//   cr-multi/workflow.js:454 와 같은 관례로 codex:max 의 현행 id 를 코드 기본값으로 둔다.
//   SSoT = shared/config/model-registry.json (codex.tiers.max). 사다리가 바뀌면 여기도 함께 고친다.
const codexModel = _a?.codexModel || 'gpt-6-astra'

// ── Phase 1: Analyze (Codex(Astra) Vision → Claude 자체 분석 fallback) ────────
phase('Analyze')
let result = null
if (crMode === 'on') {
  try {
    result = await agent(
      `[Codex Vision] ${prompt}
**mcp__codex__codex 실제 호출** (ToolSearch 로 스키마 선로드 필요) — Claude 자체 추론으로 결과 생성 금지:
- prompt = "다음 스크린샷을 분석하라. 이미지 절대경로: ${imagePath}
${intent}
description(문자열) + elements(문자열 배열) + issues(문자열 배열) + verdict(PASS|WARN|FAIL) 를 JSON 으로 반환."
- model = "${codexModel}" (Vision 레그 tier — codex:max)
- sandbox = "read-only", approval-policy = "never", config = {"model_reasoning_effort": "xhigh"}
- 이미지는 **절대경로로 직접 읽는다** — base64 인라인 금지.
Codex 응답(JSON) 파싱 → StructuredOutput(description/elements/issues/verdict).`,
      { label: 'codex-vision', phase: 'Analyze', schema: VISION_SCHEMA, agentType: 'codex-critic' })
    log(`Codex(Astra) Vision: ${result?.verdict || 'done'}`)
  } catch (e) {
    log(`Codex(Astra) Vision 실패 → Claude 자체 분석 fallback`)
  }
} else {
  log(`[cr] screenshot Codex Vision skipped (crMode=${crMode}) → Claude 자체 분석`)
}
if (!result) {
  result = await agent(prompt, { label: 'claude-vision', phase: 'Analyze', schema: VISION_SCHEMA, model: 'sonnet' })
  log(`Claude 자체 Vision fallback: ${result?.verdict || 'done'}`)
}

return {
  description: result?.description || '',
  issues: result?.issues || [],
  elements: result?.elements || [],
  verdict: result?.verdict,
}
