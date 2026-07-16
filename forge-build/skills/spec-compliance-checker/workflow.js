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

// frByState = 5-state 집계. 축 판정(status)과 직교한다 — verification-routing이 머지를 이 값으로
// 라우팅하므로(NOT_DONE/UNVERIFIABLE>0 → [STOP]) 산출물이 반드시 실어 날라야 한다.
// 도출 규칙 SSoT = SKILL.md §FR 상태(5-state) 도출 규칙.
const FR_BY_STATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    DONE: { type: 'integer' },
    PARTIAL: { type: 'integer' },
    NOT_DONE: { type: 'integer' },
    CHANGED: { type: 'integer' },
    UNVERIFIABLE: { type: 'integer' },
  },
  required: ['DONE', 'PARTIAL', 'NOT_DONE', 'CHANGED', 'UNVERIFIABLE'],
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    checkId: { type: 'string' },
    status: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    summary: { type: 'string' },
    frTotal: { type: 'integer' },
    frByState: FR_BY_STATE_SCHEMA,
  },
  required: ['status', 'summary', 'frTotal', 'frByState'],
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
  `checkId="check-8.5". summary에 전체N/구현N/테스트N/누락N 포함.\n` +
  `추가로 FR마다 5-state를 부여해 frByState로 집계하라(도출 규칙 = SKILL.md §FR 상태(5-state) 도출 규칙):\n` +
  `  DONE=impl+test+Wired확인 / PARTIAL=impl은 있으나 test없음 또는 stub의심 /\n` +
  `  NOT_DONE=impl없음 / CHANGED=spec과 범위·인터페이스 다름 / UNVERIFIABLE=검증수단 부재(판정불가).\n` +
  `frTotal=FR 총수. 불변식: sum(frByState) === frTotal. 눈으로 세지 말고 축 결과 항목에서 기계 도출하라.\n` +
  `이 값이 머지 라우팅을 결정한다(NOT_DONE/UNVERIFIABLE>0 → 머지 금지). 관대한 DONE 부여 금지.`,
  { label: 'aggregate', phase: 'Aggregate', schema: RESULT_SCHEMA }
)
log(`spec-compliance ${result?.status}: ${result?.summary}`)

// 불변식 검사 — 집계가 깨졌으면 결과를 신뢰할 수 없다. 조용히 통과시키지 않는다.
const byState = result?.frByState
const stateSum = byState ? Object.values(byState).reduce((a, b) => a + b, 0) : null
if (byState && stateSum !== result?.frTotal) {
  log(`[FAIL] 5-state 불변식 위반: sum(frByState)=${stateSum} !== frTotal=${result?.frTotal} — 집계 오류`)
  return {
    checkId: 'check-8.5', status: 'FAIL',
    summary: `5-state 집계 오류 (sum=${stateSum}, frTotal=${result?.frTotal})`,
    frTotal: result?.frTotal, frByState: byState, axes,
  }
}

return {
  checkId: 'check-8.5', status: result?.status, summary: result?.summary,
  frTotal: result?.frTotal, frByState: byState, axes,
}
