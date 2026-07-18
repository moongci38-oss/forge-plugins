// root-cause: Planner+Evaluator 2 Phase → forge-pge와 동일 격리 패턴. Evaluator는 의도 미전달. 계획서 P1-2.
export const meta = {
  name: 'writing-plans',
  description: '계획 작성 + 독립 Evaluator 검증 — Evaluator는 작성 의도 없이 계획서만 판정',
  phases: [
    { title: 'Plan', detail: '요구사항 → 구현 계획서' },
    { title: 'Evaluate', detail: '의도 미전달 — 계획서 결과물만 독립 판정' },
  ],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    verify: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'steps', 'verify'],
}

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    score: { type: 'number' },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'score'],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args

const requirement = _a?.requirement || ''

// ── Phase 1: Plan ───────────────────────────────────────────────────────────
phase('Plan')
const plan = await agent(
  `구현 계획서 작성. 요구사항: ${requirement}. ` +
  `각 step에 verify 검증 방법 포함. risks 명시.`,
  { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA }
)
log(`Plan: "${plan?.title}" ${plan?.steps?.length || 0} steps`)

// ── Phase 2: Evaluate (작성 의도 미전달) ──────────────────────────────────────
phase('Evaluate')
const evaluation = await agent(
  `계획서 결과물만 독립 검증. 원본 요구사항·작성 의도 없음 — 계획 자체 완결성만 평가. ` +
  `title: ${plan?.title}. steps: ${JSON.stringify(plan?.steps)}. verify: ${JSON.stringify(plan?.verify)}. ` +
  `각 step이 실행 가능한가, verify가 측정 가능한가, 누락 gap이 있는가. verdict + score + gaps.`,
  { label: 'evaluate', phase: 'Evaluate', schema: EVAL_SCHEMA }
)
log(`Evaluate: ${evaluation?.verdict} score=${evaluation?.score}`)

return {
  verdict: evaluation?.verdict,
  score: evaluation?.score,
  plan: { title: plan?.title, steps: plan?.steps?.length || 0 },
  gaps: evaluation?.gaps || [],
}
