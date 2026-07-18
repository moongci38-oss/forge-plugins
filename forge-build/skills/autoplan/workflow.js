// root-cause: autoplan 5-Wave 순차 = 파일통신 대신 JS 변수 전달. 컨텍스트 격리. 계획서 P2-2.
export const meta = {
  name: 'autoplan',
  description: '기획서 3관점 순차 리뷰 Workflow — CEO→Design→Eng→Synthesizer→Evaluator (파일통신 없음)',
  phases: [
    { title: 'CEO', detail: 'Wave 1: 비즈니스 관점 리뷰' },
    { title: 'Design', detail: 'Wave 2: UX/UI 리뷰 (CEO 결과 주입)' },
    { title: 'Engineering', detail: 'Wave 3: 기술 리뷰 (CEO+Design 결과 주입)' },
    { title: 'Synthesize', detail: 'Wave 4: 3관점 종합 + Rubric PASS/FAIL' },
    { title: 'Evaluate', detail: 'Wave 5: 독립 검증 → CONFIRM_PASS/CONFIRM_FAIL/ESCALATE' },
  ],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args
const docPath = _a?.docPath || ''
const skipCeo = _a?.skip === 'ceo'

const VERDICT3 = { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] }

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    verdict: VERDICT3,
    note: { type: 'string' },
  },
  required: ['label', 'verdict'],
}

const CEO_SCHEMA = {
  type: 'object',
  properties: {
    killSignal: { type: 'boolean' },
    summary: { type: 'string' },
    items: { type: 'array', items: ITEM_SCHEMA },
  },
  required: ['killSignal', 'summary', 'items'],
}

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    killSignal: { type: 'boolean' },
    summary: { type: 'string' },
    items: { type: 'array', items: ITEM_SCHEMA },
    designReferenceUrls: { type: 'array', items: { type: 'string' } },
    ceoConflicts: { type: 'array', items: { type: 'string' } },
  },
  required: ['killSignal', 'summary', 'items'],
}

const ENG_SCHEMA = {
  type: 'object',
  properties: {
    killSignal: { type: 'boolean' },
    summary: { type: 'string' },
    items: { type: 'array', items: ITEM_SCHEMA },
    designConflicts: { type: 'array', items: { type: 'string' } },
  },
  required: ['killSignal', 'summary', 'items'],
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    bizScore: { type: 'number' },
    uxScore: { type: 'number' },
    techScore: { type: 'number' },
    designRefScore: { type: 'number' },
    weightedTotal: { type: 'number' },
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    killSignal: { type: 'boolean' },
    conflicts: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    reportPath: { type: 'string' },
  },
  required: ['weightedTotal', 'verdict', 'killSignal', 'summary', 'reportPath'],
}

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    killSignalConfirmed: { type: 'boolean' },
    leniencyIssues: { type: 'array', items: { type: 'string' } },
    conflictResolutionOk: { type: 'boolean' },
    independentScore: { type: 'number' },
    verdict: { type: 'string', enum: ['CONFIRM_PASS', 'CONFIRM_FAIL', 'ESCALATE'] },
    escalationItems: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'summary'],
}

const docRef = docPath || 'docs/planning/active/ 최신 기획서'

// ── Wave 1: CEO ──────────────────────────────────────────────────────────────
phase('CEO')
const ceoResult = skipCeo ? null : await agent(
  `autoplan Wave 1 CEO 비즈니스 리뷰. ` +
  `기획서 Read: "${docRef}". ` +
  `검증 4항목: 비즈니스 모델(수익화 경로·단가·마진) / 시장 적합성(TAM/SAM/SOM) / ` +
  `ROI(개발비 대비 기대수익) / 경쟁 우위(진입장벽·MOAT). ` +
  `Kill Signal: 시장 없음·수익 모델 없음·경쟁 불가 중 1개 이상. ` +
  `절대 관대 금지 — "나쁘지 않은데" X / "이 정도면 괜찮지 않나" X. ` +
  `killSignal + items(label/verdict/note) + summary 반환.`,
  { label: 'wave-1:ceo', phase: 'CEO', schema: CEO_SCHEMA }
)
if (ceoResult?.killSignal) {
  log(`[STOP] CEO Kill Signal: ${ceoResult.summary}`)
  return { error: 'ceo-kill-signal', summary: ceoResult.summary }
}
log(`[W1 CEO] kill=${ceoResult?.killSignal} items=${ceoResult?.items?.length}개`)

// ── Wave 2: Design ───────────────────────────────────────────────────────────
phase('Design')
const designResult = await agent(
  `autoplan Wave 2 Design UX/UI 리뷰. ` +
  `기획서 Read: "${docRef}". ` +
  `CEO 리뷰 결과(파일 없음 — JS 변수): ${JSON.stringify(ceoResult)}. ` +
  `검증 4항목: UX 플로우(핵심 3클릭 이내) / UI 일관성(디자인 시스템·토큰) / ` +
  `접근성(WCAG 2.1 AA) / 정보 구조(내비게이션 직관성). ` +
  `CEO 리뷰와 우선순위 충돌 → ceoConflicts에 열거. ` +
  `기획서 내 디자인 레퍼런스 URL 반드시 수집 → designReferenceUrls. ` +
  `Kill Signal: UX 복잡도 과다·학습곡선 급경사. ` +
  `killSignal + items + ceoConflicts + designReferenceUrls + summary 반환.`,
  { label: 'wave-2:design', phase: 'Design', schema: DESIGN_SCHEMA }
)
if (designResult?.killSignal) {
  log(`[STOP] Design Kill Signal: ${designResult.summary}`)
  return { error: 'design-kill-signal', summary: designResult.summary }
}
log(`[W2 Design] kill=${designResult?.killSignal} refs=${designResult?.designReferenceUrls?.length}개 conflicts=${designResult?.ceoConflicts?.length}건`)

// ── Wave 3: Engineering ──────────────────────────────────────────────────────
phase('Engineering')
const engResult = await agent(
  `autoplan Wave 3 Engineering 기술 리뷰(CTO 7축). ` +
  `기획서 Read: "${docRef}". ` +
  `CEO 리뷰(JS 변수): ${JSON.stringify(ceoResult)}. ` +
  `Design 리뷰(JS 변수): ${JSON.stringify(designResult)}. ` +
  `검증 4항목: 기술 실현성 / 아키텍처(확장성·유지보수·성능) / ` +
  `보안(OWASP Top10) / 일정(SP 추정 현실성). ` +
  `Design 범위 변경에 따른 기술 영향도 명시 → designConflicts. ` +
  `Kill Signal: 기술 불가·일정 3배+ 초과. ` +
  `killSignal + items + designConflicts + summary 반환.`,
  { label: 'wave-3:eng', phase: 'Engineering', schema: ENG_SCHEMA, agentType: 'cto-advisor' }
)
if (engResult?.killSignal) {
  log(`[STOP] Eng Kill Signal: ${engResult.summary}`)
  return { error: 'eng-kill-signal', summary: engResult.summary }
}
log(`[W3 Eng] kill=${engResult?.killSignal} conflicts=${engResult?.designConflicts?.length}건`)

// ── Wave 4: Synthesize ───────────────────────────────────────────────────────
phase('Synthesize')
const synthesisResult = await agent(
  `autoplan Wave 4 Lead Synthesizer — 3관점 종합. ` +
  `CEO(JS 변수): ${JSON.stringify(ceoResult)}. ` +
  `Design(JS 변수): ${JSON.stringify(designResult)}. ` +
  `Eng(JS 변수): ${JSON.stringify(engResult)}. ` +
  `절차: 1)모든 FAIL 수집 2)관점 간 충돌 정리(CEO vs Design / CEO vs Eng / Design vs Eng) ` +
  `3)Kill Signal 최종 확인(1개라도→즉시FAIL) ` +
  `4)Rubric: 비즈니스타당성×0.30 + UX실현성×0.25 + 기술실현성×0.25 + 디자인레퍼런스×0.20 (70이상 PASS) ` +
  `5)충돌 2건+|고위험(1억+·신규시장·아키텍처대전환) → advisor-strategist 호출(선택) ` +
  `6)"${docRef}-autoplan-review.md" 생성(CEO/Design/Eng 섹션+Rubric표+판정+권고). ` +
  `절대 관대 금지. weightedTotal + verdict + killSignal + conflicts + recommendations + reportPath 반환.`,
  { label: 'wave-4:synthesize', phase: 'Synthesize', schema: SYNTHESIS_SCHEMA }
)
log(`[W4 Synthesize] ${synthesisResult?.verdict} score=${synthesisResult?.weightedTotal?.toFixed(1)} kill=${synthesisResult?.killSignal}`)

// ── Wave 5: Evaluate ─────────────────────────────────────────────────────────
phase('Evaluate')
const evalResult = await agent(
  `autoplan Wave 5 독립 Evaluator — Lead 판정 검증(Lead와 무관하게 독자 판정). ` +
  `기획서 원본 Read: "${docRef}". ` +
  `리뷰 파일 Read: "${synthesisResult?.reportPath}". ` +
  `CEO(JS 변수): ${JSON.stringify(ceoResult)}. ` +
  `Design(JS 변수): ${JSON.stringify(designResult)}. ` +
  `Eng(JS 변수): ${JSON.stringify(engResult)}. ` +
  `검증 5항목: 1)Kill Signal 재확인(Lead가 무시했나?) 2)관대함 체크("나쁘지 않은데" PASS?) ` +
  `3)충돌 해소 검증(근거 없이 넘어갔나?) 4)Rubric 독자 산정(Lead ${synthesisResult?.weightedTotal?.toFixed(1)}점 vs 독자 점수, 10점+ 차이→ESCALATE) ` +
  `5)디자인 레퍼런스 완성도(URL 포함?). ` +
  `리포트 하단 "## Wave 5 독립 Evaluator 검증" 섹션 append. ` +
  `verdict(CONFIRM_PASS/CONFIRM_FAIL/ESCALATE) + independentScore + escalationItems + summary 반환.`,
  { label: 'wave-5:evaluate', phase: 'Evaluate', schema: EVAL_SCHEMA }
)
log(`[W5 Eval] ${evalResult?.verdict} indScore=${evalResult?.independentScore} leadScore=${synthesisResult?.weightedTotal?.toFixed(1)}`)

if (evalResult?.verdict === 'ESCALATE') {
  log(`[ESCALATE] ${evalResult?.escalationItems?.length || 0}건 → Human 확인 필요`)
}

return {
  verdict: evalResult?.verdict,
  leadScore: synthesisResult?.weightedTotal,
  independentScore: evalResult?.independentScore,
  reportPath: synthesisResult?.reportPath,
  killSignal: synthesisResult?.killSignal,
  escalationItems: evalResult?.escalationItems,
}
