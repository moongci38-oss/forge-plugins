// root-cause: load-test VU 단계적 증가 = while() ramp 자동화. 결과 집계. 계획서 P2-5.
export const meta = {
  name: 'load-test',
  description: 'k6 부하 테스트 Workflow — VU 단계적 증가(ramp) + 각 단계 결과 집계 + 최종 리포트',
  phases: [
    { title: 'Setup', detail: 'Spec 분석 + k6 시나리오 생성' },
    { title: 'Ramp', detail: 'VU 단계별 증가 테스트 (3단계: base→mid→stress)' },
    { title: 'Report', detail: '단계별 결과 집계 + 임계값 판정' },
  ],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args

const specPath = _a?.specPath || ''
const baseUrl = _a?.baseUrl || 'http://localhost:3000'
const vuBase = _a?.vuBase || 10
const vuMid = _a?.vuMid || 50
const vuStress = _a?.vuStress || 100
const duration = _a?.duration || '30s'
const thresholdP95 = _a?.thresholdP95 || 500
const thresholdError = _a?.thresholdError || 0.01

const SCENARIO_SCHEMA = {
  type: 'object',
  properties: {
    k6ScriptPath: { type: 'string' },
    endpoints: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['k6ScriptPath', 'endpoints'],
}

const RUN_SCHEMA = {
  type: 'object',
  properties: {
    vus: { type: 'number' },
    p95ms: { type: 'number' },
    p99ms: { type: 'number' },
    errorRate: { type: 'number' },
    tps: { type: 'number' },
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    summary: { type: 'string' },
  },
  required: ['vus', 'p95ms', 'errorRate', 'verdict'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    reportPath: { type: 'string' },
    finalVerdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    maxSafeVus: { type: 'number' },
    breakingPoint: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['reportPath', 'finalVerdict', 'summary'],
}

// ── Setup: 시나리오 생성 ────────────────────────────────────────────────────────
phase('Setup')
const scenarioResult = await agent(
  `load-test Step 1 k6 시나리오 생성. specPath="${specPath}" baseUrl="${baseUrl}". ` +
  `Spec/OpenAPI에서 핵심 엔드포인트 최대 5개 추출. ` +
  `k6 스크립트 파일 생성(/tmp/k6-load-test.js): ` +
  `import http + check + sleep. options에 thresholds 미설정(ramp 단계별로 달리 설정). ` +
  `k6ScriptPath + endpoints[] 반환.`,
  { label: 'setup:scenario', phase: 'Setup', schema: SCENARIO_SCHEMA }
)
if (!scenarioResult?.k6ScriptPath) {
  log('[STOP] k6 시나리오 생성 실패')
  return { error: 'scenario-failed' }
}
log(`[Setup] endpoints=${scenarioResult?.endpoints?.length}개 script=${scenarioResult?.k6ScriptPath}`)

// ── Ramp: 3단계 VU 증가 ─────────────────────────────────────────────────────────
phase('Ramp')
const rampSteps = [
  { vus: vuBase, label: 'base', desc: '기본 동시성 검증' },
  { vus: vuMid, label: 'mid', desc: 'SLA 검증 구간' },
  { vus: vuStress, label: 'stress', desc: '한계점 탐색' },
]

const rampResults = []
let hitBreakingPoint = false

for (const step of rampSteps) {
  if (hitBreakingPoint) break
  const runResult = await agent(
    `load-test VU=${step.vus} 단계 실행. 목적: ${step.desc}. ` +
    `k6Script="${scenarioResult?.k6ScriptPath}" baseUrl="${baseUrl}". ` +
    `k6 run --vus ${step.vus} --duration ${duration} 실행. ` +
    `결과 파싱: p95ms / p99ms / errorRate / tps. ` +
    `판정: p95ms>${thresholdP95}ms 또는 errorRate>${thresholdError*100}% → FAIL. ` +
    `vus=${step.vus} + p95ms + errorRate + verdict 반환.`,
    { label: `ramp:${step.label}`, phase: 'Ramp', schema: RUN_SCHEMA }
  )
  rampResults.push(runResult)
  log(`[Ramp ${step.vus}VU] ${runResult?.verdict} p95=${runResult?.p95ms}ms err=${runResult?.errorRate}%`)

  if (runResult?.verdict === 'FAIL') {
    hitBreakingPoint = true
    log(`[BreakingPoint] VU=${step.vus}에서 임계값 초과 — 상위 단계 스킵`)
  }
}

// ── Report: 집계 + 최종 판정 ────────────────────────────────────────────────────
phase('Report')
const reportResult = await agent(
  `load-test 최종 리포트. ` +
  `ramp 단계별 결과: ${JSON.stringify(rampResults.filter(Boolean))}. ` +
  `임계값: p95<${thresholdP95}ms / errorRate<${thresholdError*100}%. ` +
  `분석: 1)단계별 PASS/FAIL/WARN 2)최대 안전 VU(maxSafeVus) 3)breaking point 식별. ` +
  `docs/load-test/ 하위에 리포트 저장. ` +
  `reportPath + finalVerdict + maxSafeVus + breakingPoint + summary 반환.`,
  { label: 'report:final', phase: 'Report', schema: REPORT_SCHEMA }
)
log(`[Report] ${reportResult?.finalVerdict} maxSafeVus=${reportResult?.maxSafeVus} breaking=${reportResult?.breakingPoint}`)

return {
  verdict: reportResult?.finalVerdict,
  maxSafeVus: reportResult?.maxSafeVus,
  breakingPoint: reportResult?.breakingPoint,
  reportPath: reportResult?.reportPath,
  stepsCompleted: rampResults.filter(Boolean).length,
}
