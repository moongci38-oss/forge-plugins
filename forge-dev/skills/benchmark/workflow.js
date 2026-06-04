// root-cause: benchmark는 feature vs develop 순차 비교 필수 (git ops 직렬). 계획서 P1.
// git stash/checkout 공유 상태 → sequential. 컨텍스트 격리 + resume이 주 이점.
export const meta = {
  name: 'benchmark',
  description: 'feature vs develop 브랜치 성능 비교 — 번들/테스트/API 순차 측정 + PASS/WARN/FAIL 판정',
  phases: [
    { title: 'Measure', detail: 'feature 브랜치 메트릭 측정 후 develop baseline 측정' },
    { title: 'Compare', detail: '비교 리포트 생성 + 임계값 판정' },
  ],
}

const METRIC_SCHEMA = {
  type: 'object',
  properties: {
    bundleKb: { type: 'number' },
    testTimeSec: { type: 'number' },
    apiP95Ms: { type: 'number' },
    buildTimeSec: { type: 'number' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    maxDeltaPct: { type: 'number' },
    report: { type: 'string' },
  },
  required: ['verdict', 'report'],
}

const branch = args?.branch || 'HEAD'
const baseline = args?.baseline || 'develop'

// ── Phase 1: Measure ───────────────────────────────────────────────────────────
phase('Measure')
const featureMetrics = await agent(
  `feature 브랜치(${branch}) 메트릭 측정. ` +
  `1) build 후 dist/ 크기(KB). 2) verify.sh code 실행 시간(sec). ` +
  `3) 주요 API 엔드포인트 p95 응답(ms, 없으면 null). 4) build 명령 시간(sec). ` +
  `측정 불가 항목은 null.`,
  { label: 'measure-feature', phase: 'Measure', schema: METRIC_SCHEMA }
)
log(`feature: bundle=${featureMetrics?.bundleKb}KB tests=${featureMetrics?.testTimeSec}s`)

const baselineMetrics = await agent(
  `git stash → ${baseline} 체크아웃 → 동일 메트릭 측정 → 원래 브랜치 복귀. ` +
  `순서: stash → checkout ${baseline} → 측정 → checkout - → stash pop.`,
  { label: 'measure-baseline', phase: 'Measure', schema: METRIC_SCHEMA }
)
log(`baseline: bundle=${baselineMetrics?.bundleKb}KB tests=${baselineMetrics?.testTimeSec}s`)

// ── Phase 2: Compare ───────────────────────────────────────────────────────────
phase('Compare')
const verdict = await agent(
  `성능 비교 리포트 생성. feature: ${JSON.stringify(featureMetrics)}. ` +
  `baseline: ${JSON.stringify(baselineMetrics)}. ` +
  `임계값: +10% → WARN, +25% → FAIL. 가장 큰 delta% 기준 판정. ` +
  `report = PR 삽입용 markdown 테이블 (Metric/Baseline/Current/Δ/Status).`,
  { label: 'compare', phase: 'Compare', schema: VERDICT_SCHEMA }
)
log(`benchmark ${verdict?.verdict}: maxΔ=${verdict?.maxDeltaPct?.toFixed?.(1)}%`)

return { verdict: verdict?.verdict, maxDeltaPct: verdict?.maxDeltaPct, report: verdict?.report }
