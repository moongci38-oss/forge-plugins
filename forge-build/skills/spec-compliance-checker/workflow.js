// root-cause: 4개 Traceability 검증(FR→코드/테스트, API계약, 데이터모델) parallel() 수행. 계획서 P1.
// 독립 subagent 원칙: 구현자(Generator) 컨텍스트 없이 Spec ↔ 코드 독립 대조.
export const meta = {
  name: 'spec-compliance-checker',
  description: 'Spec ↔ 구현 Traceability 4축 parallel() 감사 — FR→코드, FR→테스트, API계약, 데이터모델',
  phases: [
    { title: 'Audit', detail: 'FR→코드·FR→테스트·API계약·데이터모델 4축 병렬 독립 감사' },
    { title: 'Aggregate', detail: '4축 결과 집계 + check-8.5 PASS/WARN/FAIL JSON 반환' },
  ],
}

const AXIS_SCHEMA = {
  type: 'object',
  properties: {
    axis: { type: 'string' },
    status: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    findings: { type: 'array', items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        file: { type: 'string' },
        issue: { type: 'string' },
      },
      required: ['id', 'status'],
    }},
  },
  required: ['axis', 'status'],
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    checkId: { type: 'string' },
    status: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    summary: { type: 'string' },
  },
  required: ['status', 'summary'],
}

const specPath = args?.specPath || '.specify/specs/'
const branch = args?.branch || 'HEAD'

// ── Phase 1: Audit (4축 parallel) ─────────────────────────────────────────────
phase('Audit')
const [frCode, frTest, apiContract, dataModel] = await parallel([
  () => agent(
    `FR→코드 추적성 감사. Spec: ${specPath}. branch: ${branch}. ` +
    `각 FR(기능요구사항) → 구현 파일 실제 존재 확인. 누락 FR = implStatus:missing. axis="fr-code".`,
    { label: 'fr-code', phase: 'Audit', schema: AXIS_SCHEMA }
  ),
  () => agent(
    `FR→테스트 추적성 감사. Spec: ${specPath}. ` +
    `각 FR → 테스트 파일(*.spec.ts/*.test.ts) + describe/it 블록 존재 확인. 누락 = testStatus:missing. axis="fr-test".`,
    { label: 'fr-test', phase: 'Audit', schema: AXIS_SCHEMA }
  ),
  () => agent(
    `API 계약 일치 감사. Spec API 섹션 → Controller 엔드포인트(HTTP method+경로+인증) 비교. ` +
    `불일치 = status:FAIL. axis="api-contract".`,
    { label: 'api-contract', phase: 'Audit', schema: AXIS_SCHEMA }
  ),
  () => agent(
    `데이터 모델 일치 감사. Spec 데이터 모델 → Entity/*.entity.ts 필드/타입 비교. ` +
    `불일치 = status:FAIL. axis="data-model".`,
    { label: 'data-model', phase: 'Audit', schema: AXIS_SCHEMA }
  ),
])

// ── Phase 2: Aggregate ─────────────────────────────────────────────────────────
phase('Aggregate')
const axes = [frCode, frTest, apiContract, dataModel].filter(Boolean)
// root-cause: C-2 sweep — axes===0 → aggregate agent이 빈 배열 보고 false PASS 반환 위험
if (axes.length === 0) {
  log('[FAIL] 전 axis 실패 — spec-compliance 중단')
  return { checkId: 'check-8.5', status: 'FAIL', error: 'all_axes_failed' }
}
if (axes.length < 4) log(`[WARN] axis ${axes.length}/4 — 부분 감사, 커버리지 저하`)
const result = await agent(
  `Spec 준수 감사 4축 결과 집계. 결과: ${JSON.stringify(axes)}. ` +
  `High FR 누락 → FAIL, Medium/Low 누락 → WARN, 전체 PASS → PASS. ` +
  `checkId="check-8.5". summary에 전체N/구현N/테스트N/누락N 포함.`,
  { label: 'aggregate', phase: 'Aggregate', schema: RESULT_SCHEMA }
)
log(`spec-compliance ${result?.status}: ${result?.summary}`)

return { checkId: 'check-8.5', status: result?.status, summary: result?.summary, axes }
