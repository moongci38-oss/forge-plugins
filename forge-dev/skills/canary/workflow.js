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

// ── Phase 3: Evaluate (독립 evaluator — 작업자 ≠ 검증자) ──────────────────────
// root-cause: P0-2b — SKILL.md §독립Evaluator 선언 workflow.js 미배선 (loop theater). 배선.
phase('Evaluate')
const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    evalVerdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    feedback: { type: 'string' },
  },
  required: ['evalVerdict'],
}

const buildEvalPrompt = (judgeVerdict, metricsData) => `당신은 canary 스킬 결과물의 독립 품질 검증자입니다.

아래 기준으로 결과물을 평가하세요:
1. 에러율, 응답 시간(p95), 메모리 사용량 3개 메트릭이 모두 모니터링 리포트에 포함됐는지 확인한다. 하나라도 누락됐으면 FAIL.
2. 임계값(에러율 >1%/5%, 응답 시간 >500ms, 메모리 >80%) 초과 항목이 발생했을 때 WARN 또는 FAIL 판정이 명시됐는지 확인한다. 임계값 초과가 있음에도 PASS 처리됐으면 FAIL.
3. 모니터링이 설정된 전체 시간(기본 ${duration}분) 동안 실행됐는지 확인한다. 설정 시간 미달로 조기 종료됐으면 FAIL.

판정 결과: ${JSON.stringify(judgeVerdict)}
메트릭: ${JSON.stringify(metricsData)}

판정: PASS(기준 충족) / FAIL(재작업 필요)
피드백 형식: [파일명+섹션] — [이유] → [방법]`

let evalResult = await agent(buildEvalPrompt(verdict, metrics), { label: 'evaluator-1', phase: 'Evaluate', schema: EVAL_SCHEMA })
log(`evaluator-1: ${evalResult?.evalVerdict}`)

if (evalResult?.evalVerdict === 'FAIL') {
  log('evaluator FAIL — canary 판정 재실행 (1회 재시도)')
  // 재시도: canary-judge 재판정
  const retryVerdict = await agent(
    `canary 모니터링 결과 재판정 (1회 재시도). evaluator 피드백: ${evalResult?.feedback}. ` +
    `에러율: ${JSON.stringify(errorRate)}. 응답시간: ${JSON.stringify(latency)}. 메모리: ${JSON.stringify(memory)}. ` +
    `3개 메트릭 모두 포함 + 임계값 판정 + 모니터링 ${duration}분 완료 여부 명시. ` +
    `FAIL 시 rollbackRecommended=true. verdict PASS/WARN/FAIL + summary 반환.`,
    { label: 'judge-retry', phase: 'Evaluate', schema: VERDICT_SCHEMA, agentType: 'canary-judge' }
  )
  log(`canary retry: ${retryVerdict?.verdict} rollback=${retryVerdict?.rollbackRecommended}`)

  const retryEval = await agent(buildEvalPrompt(retryVerdict, metrics), { label: 'evaluator-2', phase: 'Evaluate', schema: EVAL_SCHEMA })
  log(`evaluator-2: ${retryEval?.evalVerdict}`)

  if (retryEval?.evalVerdict === 'FAIL') {
    log('[STOP] 2회 연속 evaluator FAIL — Human 에스컬레이션 필요')
    // root-cause: P0-2b — final FAIL 시 rollback 명시적 트리거 (기존 prose only)
    log('[ROLLBACK] /forge-rollback 즉시 실행 권고 — 배포 안정성 미검증')
    return {
      verdict: 'FAIL',
      halt: true,
      evalFailed: true,
      rollbackRecommended: true,
      rollbackTrigger: '/forge-rollback',
      feedback: retryEval?.feedback,
      summary: retryVerdict?.summary,
      metrics,
    }
  }
  // 재시도 PASS
  if (retryVerdict?.verdict === 'FAIL') {
    log('[STOP] canary FAIL — 롤백 권고: /forge-rollback')
    log('[ROLLBACK] /forge-rollback 즉시 실행 권고')
    return { verdict: 'FAIL', rollbackRecommended: true, rollbackTrigger: '/forge-rollback', summary: retryVerdict?.summary, metrics }
  }
  if (retryVerdict?.verdict === 'WARN') log('canary WARN — 모니터링 지속 권장')
  else log('배포 안정. Phase 11 진행 가능.')
  return { verdict: retryVerdict?.verdict, summary: retryVerdict?.summary, rollbackRecommended: retryVerdict?.rollbackRecommended ?? false, metrics }
}

// evaluator PASS — 원래 judge 결과 사용
if (verdict?.verdict === 'FAIL') {
  log('[STOP] canary FAIL — 롤백 권고: /forge-rollback')
  // root-cause: P0-2b — final FAIL 시 rollback 명시적 트리거 (기존 prose only)
  log('[ROLLBACK] /forge-rollback 즉시 실행 권고')
  return { verdict: 'FAIL', rollbackRecommended: true, rollbackTrigger: '/forge-rollback', summary: verdict?.summary, metrics }
} else if (verdict?.verdict === 'WARN') {
  log('canary WARN — 모니터링 지속 권장')
} else {
  log('배포 안정. Phase 11 진행 가능.')
}

return { verdict: verdict?.verdict, summary: verdict?.summary, rollbackRecommended: verdict?.rollbackRecommended ?? false, metrics }
