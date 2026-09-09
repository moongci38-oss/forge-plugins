// root-cause: Vision 3 viewport 순차 → parallel() 동시. 계획서 P1-9.
// root-cause: Vision 벤더 전환(2026-09-07) — Gemini 전면 철수로 Vision 레그를 Codex(GPT-6 Astra)로 교체.
//   계획서: ${FORGE_ROOT:-$HOME/forge}-outputs/11-platform/pipelines/plans/2026-09-06-gpt6-astra-pro-plan-proposal.md §W1-②
//   ⚠️ Astra 는 시안·캡처를 **절대경로로 직접 읽는다** — 이미지 인라인 불필요.
// ⚠️ Phase 0 전제: Vision 용 codex-critic approve-worker 토큰 3개 외부 선발행 필수 (viewport별).
export const meta = {
  name: 'visual-loop',
  description: '디자인 시안 vs 구현 시각 비교 — 3 viewport Codex(Astra) Vision parallel() 동시 + 수렴 루프',
  phases: [
    { title: 'Compare', detail: '3 viewport(mobile/tablet/desktop) Codex(Astra) Vision 병렬 비교' },
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

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args

const designRef = _a?.designRef || ''
const implUrl = _a?.implUrl || 'http://localhost:3000'
const viewports = [
  { name: 'mobile', w: 375 },
  { name: 'tablet', w: 768 },
  { name: 'desktop', w: 1280 },
]
// root-cause: Workflow 샌드박스는 Bash 불가 → model-registry-resolve.sh 를 직접 못 부른다.
//   cr-multi/workflow.js:454 관례대로 codex:max 현행 id 를 코드 기본값으로 둔다.
//   SSoT = shared/config/model-registry.json (codex.tiers.max).
const codexVisionModel = _a?.codexModel || 'gpt-6-astra'

// ── Phase 1: Compare (3 viewport parallel()) ─────────────────────────────────
phase('Compare')
const results = await parallel(viewports.map(vp => () =>
  agent(
    `디자인 시안 vs 구현 시각 비교 (Codex Vision). viewport: ${vp.name}(${vp.w}px).\n` +
    `**mcp__codex__codex 실제 호출** (ToolSearch 로 스키마 선로드 필요) — Claude 자체 추론으로 점수 생성 금지:\n` +
    `- prompt = "디자인 시안과 구현 화면을 viewport ${vp.name}(${vp.w}px) 기준으로 시각 비교하라.\\n` +
    `시안(절대경로 또는 URL): ${designRef}\\n구현 URL: ${implUrl}\\n` +
    `viewport(문자열) + matchScore(0-100 숫자) + diffs(문자열 배열) + converged(matchScore>=90 이면 true) 를 JSON 으로 반환."\n` +
    `- model = "${codexVisionModel}" (Vision 레그 tier — codex:max)\n` +
    `- sandbox = "read-only", approval-policy = "never", config = {"model_reasoning_effort": "xhigh"}\n` +
    `- 시안·캡처 이미지는 **절대경로로 직접 읽는다** — base64 인라인 금지.\n` +
    `Codex 응답(JSON) 파싱 → StructuredOutput(viewport/matchScore/diffs/converged).`,
    { label: `compare-${vp.name}`, phase: 'Compare', schema: DIFF_SCHEMA, agentType: 'codex-critic' }
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
