// root-cause: forge-pge 7 Phase 직렬 + Evaluator에 plan 미전달 → 진짜 독립 검증. 계획서 P1-2.
export const meta = {
  name: 'forge-pge',
  description: 'Plan-Generate-Evaluate 파이프라인 — Evaluator는 plan 정보 없이 코드만 판정 (편향 격리)',
  phases: [
    { title: 'Plan', detail: '요구사항 + Sprint Contract → 구현 계획' },
    { title: 'Generate', detail: 'plan 기반 구현' },
    { title: 'Evaluate', detail: 'plan 미전달 — 코드 결과물만 독립 판정' },
  ],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    steps: { type: 'array', items: { type: 'string' } },
    acceptance: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['steps', 'acceptance'],
}

const CODE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    diff: { type: 'string' },
  },
  required: ['summary', 'filesChanged'],
}

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    score: { type: 'number' },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'score'],
}

const requirement = args?.requirement || ''
const contract = args?.sprintContract || ''

// ── Phase 1: Plan ───────────────────────────────────────────────────────────
phase('Plan')
const plan = await agent(
  `구현 계획 수립. 요구사항: ${requirement}. Sprint Contract: ${contract}. ` +
  `steps + acceptance criteria + risks 반환.`,
  { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA }
)
log(`Plan: ${plan?.steps?.length || 0} steps, ${plan?.acceptance?.length || 0} acceptance`)

// ── Phase 2: Generate ─────────────────────────────────────────────────────────
phase('Generate')
const code = await agent(
  `구현 실행. plan: ${JSON.stringify(plan)}. ` +
  `summary + filesChanged + diff 반환.`,
  { label: 'generate', phase: 'Generate', schema: CODE_SCHEMA }
)
log(`Generate: ${code?.filesChanged?.length || 0} files`)

// ── Phase 3: Evaluate (plan 미전달 — 핵심 격리) ────────────────────────────────
phase('Evaluate')
const evaluation = await agent(
  `코드 결과물만 독립 판정. 원본 계획 정보 없음 — 구현 자체 품질만 평가. ` +
  `summary: ${code?.summary}. filesChanged: ${JSON.stringify(code?.filesChanged)}. ` +
  `diff: ${(code?.diff || '').slice(0, 4000)}. ` +
  `acceptance 기준 충족 여부를 코드만으로 역추론. verdict PASS/WARN/FAIL + score + issues.`,
  { label: 'evaluate', phase: 'Evaluate', schema: EVAL_SCHEMA }
)
log(`Evaluate: ${evaluation?.verdict} score=${evaluation?.score}`)

return {
  verdict: evaluation?.verdict,
  score: evaluation?.score,
  filesChanged: code?.filesChanged || [],
  issues: evaluation?.issues || [],
}
