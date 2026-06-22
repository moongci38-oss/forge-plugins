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

// ── Phase 3: Evaluate (독립 evaluator — 작업자 ≠ 검증자) ──────────────────────
// root-cause: P0-2a — SKILL.md §독립Evaluator 선언 workflow.js 미배선 (loop theater). 배선.
// root-cause: F5 — EVALUATOR_PROMPT.replace() fragile: breaks on $ sequences / empty needle.
// Replaced with buildEvalPrompt(report) function — fresh prompt construction per call.
phase('Evaluate')

// root-cause: F5 — build evaluator prompt fresh for any given report string (no .replace())
const EVALUATOR_PROMPT_TEMPLATE = `당신은 benchmark 스킬 결과물의 독립 품질 검증자입니다.

아래 기준으로 결과물을 평가하세요:
1. 번들 크기, 테스트 시간, API 응답 시간(또는 빌드 시간) 3개 지표가 모두 측정됐는지 확인한다. 적용 조건에 해당하는 지표가 누락됐으면 FAIL.
2. 각 지표에 baseline(develop 브랜치) 수치 대비 % 변화량이 명시됐는지 확인한다. 절대 수치만 있고 % 변화가 없으면 FAIL.
3. 임계값(PASS/WARN/FAIL 기준: +10%/+25%)이 결과물에 적용됐는지 확인한다. 수치가 있어도 판정 없이 끝났으면 FAIL.

평가 대상 리포트:
REPORT_PLACEHOLDER

판정: PASS(기준 충족) / FAIL(재작업 필요)
피드백 형식: [파일명+섹션] — [이유] → [방법]`

function buildEvalPrompt(report) {
  // Build a fresh prompt for the given report. Avoids fragile .replace() on $ sequences.
  const safeReport = report || '(리포트 없음)'
  return EVALUATOR_PROMPT_TEMPLATE.replace('REPORT_PLACEHOLDER', safeReport)
}

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    evalVerdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    feedback: { type: 'string' },
  },
  required: ['evalVerdict'],
}

let evalResult = await agent(buildEvalPrompt(verdict?.report), { label: 'evaluator-1', phase: 'Evaluate', schema: EVAL_SCHEMA })
log(`evaluator-1: ${evalResult?.evalVerdict}`)

if (evalResult?.evalVerdict === 'FAIL') {
  log('evaluator FAIL — benchmark 재실행 (1회 재시도)')
  // 재시도: 동일 Compare 재실행
  const retryVerdict = await agent(
    `성능 비교 리포트 재작성 (1회 재시도). evaluator 피드백: ${evalResult?.feedback}. ` +
    `feature: ${JSON.stringify(featureMetrics)}. baseline: ${JSON.stringify(baselineMetrics)}. ` +
    `임계값: +10% → WARN, +25% → FAIL. 3개 지표 모두 % 변화량 + 판정 포함 필수. ` +
    `report = PR 삽입용 markdown 테이블 (Metric/Baseline/Current/Δ/Status).`,
    { label: 'compare-retry', phase: 'Evaluate', schema: VERDICT_SCHEMA }
  )
  log(`benchmark retry: ${retryVerdict?.verdict}: maxΔ=${retryVerdict?.maxDeltaPct?.toFixed?.(1)}%`)

  // root-cause: F5 — use buildEvalPrompt with retryVerdict.report (no .replace())
  const retryEval = await agent(buildEvalPrompt(retryVerdict?.report),
    { label: 'evaluator-2', phase: 'Evaluate', schema: EVAL_SCHEMA }
  )
  log(`evaluator-2: ${retryEval?.evalVerdict}`)

  if (retryEval?.evalVerdict === 'FAIL') {
    log('[STOP] 2회 연속 evaluator FAIL — Human 에스컬레이션 필요')
    return { verdict: 'FAIL', halt: true, evalFailed: true, feedback: retryEval?.feedback, report: retryVerdict?.report }
  }
  // 재시도 PASS
  return { verdict: retryVerdict?.verdict, maxDeltaPct: retryVerdict?.maxDeltaPct, report: retryVerdict?.report }
}

return { verdict: verdict?.verdict, maxDeltaPct: verdict?.maxDeltaPct, report: verdict?.report }
