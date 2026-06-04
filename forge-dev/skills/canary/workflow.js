// root-cause: 헬스 메트릭 3종(에러율/응답시간/메모리) parallel() 수집 + canary-judge 판정. 계획서 P1.
// ⚠️ canaryEnabled + healthCheckUrl 미설정 시 스킵.
export const meta = {
  name: 'canary',
  description: '배포 후 헬스 모니터링 — 3종 메트릭 parallel() 수집 + canary-judge 자동 판정',
  phases: [
    { title: 'Monitor', detail: '에러율·응답시간·메모리 parallel 수집' },
    { title: 'Judge', detail: 'canary-judge 에이전트 종합 판정 → PASS/WARN/FAIL' },
  ],
}

const METRIC_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    value: { type: 'number' },
    status: { type: 'string', enum: ['ok', 'warn', 'fail'] },
    detail: { type: 'string' },
  },
  required: ['type', 'value', 'status'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    summary: { type: 'string' },
    rollbackRecommended: { type: 'boolean' },
  },
  required: ['verdict'],
}

const healthUrl = args?.healthCheckUrl || 'http://localhost:3000/api/health'
const duration = args?.duration || 15
const env = args?.env || 'develop'

// ── Phase 1: Monitor (3종 parallel) ───────────────────────────────────────────
phase('Monitor')
log(`모니터링 시작: ${env} ${duration}분 (${healthUrl})`)
const [errorRate, latency, memory] = await parallel([
  () => agent(
    `에러율 모니터링 ${duration}분. endpoint: ${healthUrl}. 1분 간격 폴링. ` +
    `에러율 >1% → status=warn, >5% → status=fail. 평균 에러율(%) value 반환. type="error-rate".`,
    { label: 'error-rate', phase: 'Monitor', schema: METRIC_SCHEMA }
  ),
  () => agent(
    `응답 시간 모니터링 ${duration}분. endpoint: ${healthUrl}. 1분 간격 폴링. ` +
    `p95 >500ms → status=warn. p95 응답 시간(ms) value 반환. type="latency-p95".`,
    { label: 'latency', phase: 'Monitor', schema: METRIC_SCHEMA }
  ),
  () => agent(
    `메모리 사용량 모니터링 ${duration}분. 1분 간격 프로세스 체크. ` +
    `>80% → status=warn. 평균 메모리 사용률(%) value 반환. type="memory-pct".`,
    { label: 'memory', phase: 'Monitor', schema: METRIC_SCHEMA }
  ),
])

// ── Phase 2: Judge ─────────────────────────────────────────────────────────────
phase('Judge')
const metrics = [errorRate, latency, memory].filter(Boolean)
const verdict = await agent(
  `canary 모니터링 결과 종합 판정. ` +
  `에러율: ${JSON.stringify(errorRate)}. 응답시간: ${JSON.stringify(latency)}. 메모리: ${JSON.stringify(memory)}. ` +
  `FAIL 시 rollbackRecommended=true. verdict PASS/WARN/FAIL + summary 반환.`,
  { label: 'judge', phase: 'Judge', schema: VERDICT_SCHEMA, agentType: 'canary-judge' }
)
log(`canary ${verdict?.verdict} rollback=${verdict?.rollbackRecommended}`)
if (verdict?.verdict === 'FAIL') {
  log('[STOP] canary FAIL — 롤백 권고: /forge-rollback')
} else if (verdict?.verdict === 'WARN') {
  log('canary WARN — 모니터링 지속 권장')
} else {
  log('배포 안정. Phase 11 진행 가능.')
}

return { verdict: verdict?.verdict, summary: verdict?.summary, rollbackRecommended: verdict?.rollbackRecommended, metrics }
