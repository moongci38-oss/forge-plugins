// root-cause: 7-axis 병렬 테스트 → workflow.js 격리 + pipeline(). 계획서 P1-5.
export const meta = {
  name: 'api-e2e',
  description: 'REST API 엔드포인트 pipeline() — happy/인증실패/잘못된입력/경계값',
  phases: [
    { title: 'Extract', detail: 'Spec/OpenAPI에서 엔드포인트 목록 추출' },
    { title: 'Test', detail: 'pipeline() — 엔드포인트별 4-axis 테스트' },
    { title: 'Report', detail: 'PASS/FAIL 집계 + drift 감지' },
  ],
}

const EP_SCHEMA = {
  type: 'object',
  properties: {
    endpoints: { type: 'array', items: { type: 'object',
      properties: { method: { type: 'string' }, path: { type: 'string' }, auth: { type: 'boolean' } },
      required: ['method','path'] } },
  },
  required: ['endpoints'],
}

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    endpoint: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS','WARN','FAIL'] },
    failedAxes: { type: 'array', items: { type: 'string' } },
    driftDetected: { type: 'boolean' },
  },
  required: ['endpoint','verdict'],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args
const specPath = _a?.specPath || ''
const baseUrl = _a?.baseUrl || 'http://localhost:3000'

// ── Phase 1: Extract ──────────────────────────────────────────────────────────
phase('Extract')
const extracted = await agent(
  `Spec/OpenAPI에서 엔드포인트 추출. ` +
  (specPath ? `spec: ${specPath}` : `baseUrl: ${baseUrl} — swagger.json 또는 /api-docs 탐색`) +
  `. method + path + auth 필드 포함.`,
  { label: 'ep-extract', phase: 'Extract', schema: EP_SCHEMA }
)
const endpoints = extracted?.endpoints || []
log(`Extract: ${endpoints.length}개 엔드포인트`)

// ── Phase 2: Test (pipeline()) ────────────────────────────────────────────────
phase('Test')
const results = await pipeline(
  endpoints,
  ep => agent(
    `API 테스트: ${ep.method} ${ep.path}. baseUrl: ${baseUrl}. ` +
    `4-axis: happy path / 인증 실패(401/403) / 잘못된 입력(400) / 경계값. ` +
    `응답 스키마 vs OpenAPI 비교 — drift 감지.`,
    { label: `test-${ep.method}-${ep.path.replace(/\//g,'-')}`, phase: 'Test', schema: TEST_SCHEMA }
  )
)

// ── Phase 3: Report ───────────────────────────────────────────────────────────
phase('Report')
const passed = results.filter(Boolean).filter(r => r.verdict === 'PASS').length
const failed = results.filter(Boolean).filter(r => r.verdict === 'FAIL').length
const drifts = results.filter(Boolean).filter(r => r.driftDetected).length
log(`Test: ${passed}P/${failed}F drifts=${drifts}`)

await agent(
  `API E2E 리포트. total=${endpoints.length} pass=${passed} fail=${failed} drift=${drifts}. ` +
  `저장: docs/qa/api-e2e-${new Date().toISOString().split('T')[0]}.md`,
  { label: 'report', phase: 'Report' }
)

return { total: endpoints.length, passed, failed, drifts }
