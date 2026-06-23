// root-cause: Gemini Vision 3 viewport 순차 → parallel() 동시. 계획서 P1-9.
// ⚠️ Phase 0 전제: Gemini Vision용 approve-worker 토큰 3개 외부 선발행 필수 (viewport별).
export const meta = {
  name: 'visual-loop',
  description: '디자인 시안 vs 구현 시각 비교 — 3 viewport Gemini Vision parallel() 동시 + 수렴 루프',
  phases: [
    { title: 'Compare', detail: '3 viewport(mobile/tablet/desktop) Gemini Vision 병렬 비교' },
    { title: 'Verdict', detail: 'diff 종합 + 수렴 여부 판정' },
  ],
}

const DIFF_SCHEMA = {
  type: 'object',
  properties: {
    viewport: { type: 'string' },
    matchScore: { type: 'number' },
    diffs: { type: 'array', items: { type: 'string' } },
    converged: { type: 'boolean' },
  },
  required: ['viewport', 'matchScore', 'converged'],
}

const designRef = args?.designRef || ''
const implUrl = args?.implUrl || 'http://localhost:3000'
const viewports = [
  { name: 'mobile', w: 375 },
  { name: 'tablet', w: 768 },
  { name: 'desktop', w: 1280 },
]

// ── Phase 1: Compare (3 viewport parallel()) ─────────────────────────────────
phase('Compare')
const results = await parallel(viewports.map(vp => () =>
  agent(
    `디자인 시안 vs 구현 시각 비교. viewport: ${vp.name}(${vp.w}px). ` +
    `시안: ${designRef}. 구현: ${implUrl}. matchScore(0-100) + diffs 목록 + converged(>=90).`,
    { label: `compare-${vp.name}`, phase: 'Compare', schema: DIFF_SCHEMA, agentType: 'gemini' }
  )
))

// ── Phase 2: Verdict ──────────────────────────────────────────────────────────
phase('Verdict')
const valid = results.filter(Boolean)
// root-cause: C-2 sweep — 부분 viewport 실패 시 silent degradation
if (valid.length < results.length) log(`[WARN] viewport ${valid.length}/${results.length} — 일부 비교 실패, 결과 신뢰도 저하`)
const avgMatch = valid.reduce((s, r) => s + (r.matchScore || 0), 0) / (valid.length || 1)
const allConverged = valid.length > 0 && valid.every(r => r.converged)
log(`Compare: avg match=${avgMatch.toFixed(1)} converged=${allConverged}`)

return {
  converged: allConverged,
  avgMatch: parseFloat(avgMatch.toFixed(1)),
  viewports: valid.map(r => ({ viewport: r.viewport, matchScore: r.matchScore, diffs: r.diffs || [] })),
}
