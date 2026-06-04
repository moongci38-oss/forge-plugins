// root-cause: Codex Vision primary → Gemini fallback 내재화. 계획서 P1-9.
// ⚠️ Phase 0 전제: cr-final/Vision용 codex-critic + gemini approve-worker 토큰 외부 선발행 필수.
export const meta = {
  name: 'screenshot-analyze',
  description: '스크린샷 Vision 분석 — Codex Vision primary, 실패 시 Gemini fallback 자동 전환',
  phases: [
    { title: 'Analyze', detail: 'Codex Vision → (실패 시) Gemini Vision fallback' },
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

const imagePath = args?.imagePath || ''
const intent = args?.intent || 'UI 스크린샷 분석 — 요소 추출 + 이슈 탐지'
const prompt = `${intent}. 이미지: ${imagePath}. description + elements + issues + verdict 반환.`

// ── Phase 1: Analyze (Codex Vision → Gemini fallback) ────────────────────────
phase('Analyze')
let result = null
try {
  result = await agent(prompt, { label: 'codex-vision', phase: 'Analyze', schema: VISION_SCHEMA, agentType: 'codex-critic' })
  log(`Codex Vision: ${result?.verdict || 'done'}`)
} catch (e) {
  log(`Codex Vision 실패 → Gemini fallback`)
}
if (!result) {
  result = await agent(prompt, { label: 'gemini-vision', phase: 'Analyze', schema: VISION_SCHEMA, agentType: 'gemini' })
  log(`Gemini Vision fallback: ${result?.verdict || 'done'}`)
}

return {
  description: result?.description || '',
  issues: result?.issues || [],
  elements: result?.elements || [],
  verdict: result?.verdict,
}
