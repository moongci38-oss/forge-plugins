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

// <judge-health:start> — E3·E4(2026-09-07) 리뷰어 건강 + 이견 신호. 순수함수만 둔다.
//   ⚠️ 이 블록은 `.claude/skills/autoplan/tests/reviewer-health.test.mjs` 가 **통째로 추출해
//   실행**한다. 바깥 변수(log·agent·args)를 참조하면 그 테스트가 깨진다.
//
// 왜 필요한가(쉽게): 지금은 리뷰어가 죽어도(`null` 반환) `ceoResult?.killSignal` 이 undefined 라
//   그냥 "Kill Signal 없음"으로 흘러간다. **아무 말도 안 한 사람을 '찬성했다'로 세는 것**과 같다.
//   그 다음 Wave 에는 `null` 이 "CEO 리뷰 결과"라며 주입되고, Synthesizer 는 그 관점의 점수를
//   상상해서 채운 뒤 가중합 70점을 넘기면 PASS 를 낸다 — 아무도 안 본 축이 합격에 기여한다.
// 무엇을 바꾸나: 판정 산식(가중합·70점 선·ESCALATE 3분법)은 **건드리지 않는다**. 죽음을
//   구조화 필드로 드러내고, 전멸일 때만 fail-closed 로 멈춘다(종전엔 전멸해도 판정을 만들어냈다).
// ⚠️ 무력화되는 입력: 리뷰어가 스키마는 맞췄는데 **내용이 빈 껍데기**(items 0건 + summary 한 줄)면
//   status=MALFORMED 로만 잡히고, items 가 1건이라도 있으면 OK 로 통과한다 — 건강은
//   "말을 했나"만 재지 "제대로 봤나"는 못 잰다(그건 Wave 5 Evaluator 의 관대함 체크 몫).
const REVIEW_DISSENT_SPREAD = 30 // Rubric 축 점수(0~100) 척도. 통과선 70 을 사이에 두고 갈릴 만한 폭.

// 리뷰어 하나의 상태. 'OK' | 'SKIPPED' | 'MISSING' | 'MALFORMED'
//   SKIPPED   = 사람이 일부러 뺐다(--skip ceo). **결측이 아니다** — 의도와 사고를 섞지 않는다.
//   MISSING   = 아무것도 안 돌려줬다(죽음·미응답).
//   MALFORMED = 응답은 왔는데 필수 필드가 없다(스키마 위반·파싱 실패). 0점이 아니라 "모름"이다.
function classifyReviewer(result, skipped, requiredFields) {
  if (skipped) return 'SKIPPED'
  if (result == null || typeof result !== 'object') return 'MISSING'
  const req = requiredFields || ['summary', 'items']
  return req.every(f => result[f] != null) ? 'OK' : 'MALFORMED'
}

// entries = [{ wave, reviewer, result, skipped, required }]
// 반환: [{ wave, reviewer, status, missingFields }]
function buildReviewerHealth(entries) {
  return entries.map(e => {
    const status = classifyReviewer(e.result, e.skipped, e.required)
    const req = e.required || ['summary', 'items']
    const missingFields = (status === 'MALFORMED')
      ? req.filter(f => e.result?.[f] == null)
      : []
    return { wave: e.wave, reviewer: e.reviewer, status, missingFields }
  })
}

// 이견 신호 — **표시 전용. 판정을 바꾸지 않는다**(dev-workflow-rules.md §E-3).
// 왜: 55점과 95점의 가중평균도 통과선을 넘길 수 있다. 평균 하나로는 "한 축이 무너졌다"와
//   "고르게 괜찮다"가 같은 숫자로 보인다.
function computeDissent(values, threshold) {
  const nums = (values || []).filter(v => Number.isFinite(v))
  if (nums.length < 2) return { dissent: false, spread: null, min: null, max: null, threshold, n: nums.length }
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const spread = max - min
  return { dissent: spread >= threshold, spread, min, max, threshold, n: nums.length }
}
// <judge-health:end>

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

// ── E3: 리뷰어 건강 판정 (종합 직전) ──────────────────────────────────────────
// 침묵한 리뷰어를 "이견 없음"으로 세지 않기 위한 최소 장치. 판정 산식은 그대로 둔다.
const reviewerHealth = buildReviewerHealth([
  { wave: 1, reviewer: 'ceo', result: ceoResult, skipped: skipCeo },
  { wave: 2, reviewer: 'design', result: designResult, skipped: false },
  { wave: 3, reviewer: 'eng', result: engResult, skipped: false },
])
const deadReviewers = reviewerHealth.filter(h => h.status === 'MISSING' || h.status === 'MALFORMED')
const liveReviewers = reviewerHealth.filter(h => h.status === 'OK')
if (deadReviewers.length) {
  log(`[WARN] 리뷰어 결측 ${deadReviewers.length}건 — `
    + `${deadReviewers.map(h => `W${h.wave}:${h.reviewer}=${h.status}${h.missingFields.length ? `(${h.missingFields.join(',')} 없음)` : ''}`).join(' ')} `
    + `| 침묵은 찬성이 아니다 — 그 관점은 "미측정"으로 다뤄야 한다`)
}
// fail-closed: 살아 있는 관점이 하나도 없으면 종합할 것이 없다. 종전에는 이 상태에서도
//   Synthesizer 가 점수를 만들어내 PASS/FAIL 을 냈다 — 아무도 안 본 기획서에 판정이 붙었다.
//   ⚠️ 판정 완화가 아니라 **없는 판정을 만들지 않는 것**이다(system-audit 의 axes.length===0 과 동형).
if (liveReviewers.length === 0) {
  log('[FAIL] 3관점 전멸 — 종합할 리뷰가 없다. 판정을 만들지 않고 중단(fail-closed)')
  return { error: 'all-reviewers-missing', reviewerHealth }
}

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
  `리뷰어 건강(E3): ${JSON.stringify(reviewerHealth)}. ` +
  `⚠️ status 가 OK 가 아닌 관점은 "이견 없음"이 아니라 **"안 물어봤다"** 이다. ` +
  `그 관점의 Rubric 축 점수를 상상해서 채우지 말고 null 로 두고, 리포트 표에 "미측정(사유)"으로 적어라 ` +
  `— 0점("나쁘다")과 결측("모른다")은 다르다. ` +
  `절대 관대 금지. weightedTotal + verdict + killSignal + conflicts + recommendations + reportPath 반환.`,
  { label: 'wave-4:synthesize', phase: 'Synthesize', schema: SYNTHESIS_SCHEMA }
)
log(`[W4 Synthesize] ${synthesisResult?.verdict} score=${synthesisResult?.weightedTotal?.toFixed(1)} kill=${synthesisResult?.killSignal}`)

// E4: 이견 신호 — Rubric 4축이 얼마나 갈렸나. **표시 전용, 판정 무변경.**
const rubricDissent = computeDissent([
  synthesisResult?.bizScore, synthesisResult?.uxScore,
  synthesisResult?.techScore, synthesisResult?.designRefScore,
], REVIEW_DISSENT_SPREAD)
if (rubricDissent.dissent) {
  log(`[DISSENT] Rubric 축 편차 ${rubricDissent.spread}점 (min=${rubricDissent.min} max=${rubricDissent.max}, 임계 ${rubricDissent.threshold}) `
    + `— 가중합 ${synthesisResult?.weightedTotal?.toFixed?.(1)} 하나로 읽지 말 것. 판정에는 반영하지 않는다(표시 전용)`)
}
if (rubricDissent.n < 4) {
  log(`[WARN] Rubric 축 점수 ${rubricDissent.n}/4 만 숫자 — 나머지는 결측(모름)이다. 0점으로 세지 말 것`)
}

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
  `리뷰어 건강(E3): ${JSON.stringify(reviewerHealth)} — OK 가 아닌 관점이 있으면 ` +
  `Lead 가 그 침묵을 '이견 없음'으로 읽고 점수를 채우지 않았는지 반드시 확인하고, ` +
  `채웠으면 escalationItems 에 적어라(관대함 체크의 일부다). ` +
  `축 이견 신호(E4, 표시 전용): ${JSON.stringify(rubricDissent)}. ` +
  `리포트 하단 "## Wave 5 독립 Evaluator 검증" 섹션 append. ` +
  `verdict(CONFIRM_PASS/CONFIRM_FAIL/ESCALATE) + independentScore + escalationItems + summary 반환.`,
  { label: 'wave-5:evaluate', phase: 'Evaluate', schema: EVAL_SCHEMA }
)
log(`[W5 Eval] ${evalResult?.verdict} indScore=${evalResult?.independentScore} leadScore=${synthesisResult?.weightedTotal?.toFixed(1)}`)

if (evalResult?.verdict === 'ESCALATE') {
  log(`[ESCALATE] ${evalResult?.escalationItems?.length || 0}건 → Human 확인 필요`)
}
// E3: 검증자(Wave 5)도 죽을 수 있다. verdict 부재를 "이의 없음"으로 읽지 않게 명시한다.
//   ⚠️ 판정 무변경 — verdict 는 종전처럼 `evalResult?.verdict`(부재 시 undefined)를 그대로 낸다.
const evaluatorStatus = classifyReviewer(evalResult, false, ['verdict', 'summary'])
if (evaluatorStatus !== 'OK') {
  log(`[WARN] Wave5 Evaluator ${evaluatorStatus} — 독립 검증이 없다. `
    + `verdict 부재를 CONFIRM_PASS 로 읽지 말 것(무판정이지 합격이 아니다)`)
}

return {
  verdict: evalResult?.verdict,
  leadScore: synthesisResult?.weightedTotal,
  independentScore: evalResult?.independentScore,
  reportPath: synthesisResult?.reportPath,
  killSignal: synthesisResult?.killSignal,
  escalationItems: evalResult?.escalationItems,
  // ⚠️ 기존 필드는 이름·타입 그대로. 아래 3개만 **추가**한다(상위 소비자 무영향).
  reviewerHealth,   // E3: 3관점 OK/SKIPPED/MISSING/MALFORMED
  evaluatorStatus,  // E3: Wave 5 검증자 자신의 생존 여부
  rubricDissent,    // E4: 축 간 이견 신호(표시 전용, 판정 미반영)
}
