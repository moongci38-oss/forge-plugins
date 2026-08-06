// root-cause: AD-122 weekly-research Workflow PoC (read-only, 실행 X)
// log() = Workflow 내장 (console.log 아닌 Workflow runtime log)
export const meta = {
  name: 'weekly-research-workflow-poc',
  description: 'weekly-research Wave 1~3 Workflow 마이그레이션 PoC (AD-122)',
  phases: [
    { title: 'Collect', detail: '6-Tier 소스 병렬 수집 (haiku x2 + sonnet x1)' },
    { title: 'Evaluate', detail: '독립 Evaluator adversarial verify' },
    { title: 'Synthesize', detail: '취합 + 산출물 3종 생성' },
    { title: 'Publish', detail: 'Notion 등록 + index.json 갱신' },
  ],
}

const NEWS_SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'object',
      properties: { title:{type:'string'}, summary:{type:'string'}, relevance:{type:'string'} },
      required: ['title','summary','relevance'] } },
    source_tier: { type: 'string' },
  },
  required: ['items','source_tier'],
}
const BUSINESS_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'object',
      properties: { title:{type:'string'}, problem:{type:'string'}, solution:{type:'string'}, priority:{type:'string'} },
      required: ['title','problem','solution','priority'] } },
  },
  required: ['items'],
}
// root-cause: T1 — (c) promote adversarial to true refutation (research-verification-protocol.md #4)
const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS','WARN','FAIL'] },
    scores: { type: 'object', properties: { clarity:{type:'number'}, consistency:{type:'number'}, completeness:{type:'number'}, safety:{type:'number'} } },
    overall: { type: 'number' },
    issues: { type: 'array', items: { type:'string' } },
    // (c) 반증 탐색 결과 — research-verification-protocol.md #4 반증탐색
    claim_verdicts: { type: 'array', items: { type: 'object', properties: {
      claim: { type: 'string' },
      verdict: { type: 'string', enum: ['CONFIRMED','CONTESTED','UNVERIFIED'] },
      counter_source_url: { type: 'string' },
    }, required: ['claim','verdict'] } },
  },
  required: ['verdict','scores','overall'],
}

// root-cause: 인사이트 적용 — 단일출처 신뢰도 사전필터(기계적 카운터, additive/비파괴). 순수함수: 리포트 텍스트 → WARN 배열.
// SKILL.md Wave 1 규칙(단일출처 신뢰도 하향 서술)은 이미 반영됨 — 이 함수는 그 규칙 준수 여부를 사후 기계적으로 카운트하는 후처리 WARN 전용(판정 차단 아님).
function detectSingleSourceHighConfidence(text) {
  if (!text || typeof text !== 'string') return []
  const warnings = []
  const blockRe = /\*\*신뢰도\*\*:\s*High[\s\S]{0,500}?\*\*출처\*\*:\s*(.+)/g
  let m
  let idx = 0
  while ((m = blockRe.exec(text)) !== null) {
    idx += 1
    const sourceLine = m[1] || ''
    const linkCount = (sourceLine.match(/\[[^\]]*\]\([^)]*\)|https?:\/\/\S+/g) || []).length
    if (linkCount === 1) {
      warnings.push(`단일출처 High신뢰도 항목 #${idx}: 출처 링크 1개뿐 — 재검토 권장 (${sourceLine.trim().slice(0,80)})`)
    }
  }
  return warnings
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args

// ── Phase 0.5: Daily 이관 항목 (SKILL.md Wave 0.5 canonical 산출물 — Collect 직전 로드) ──
// root-cause: B6 — daily-system-analyst의 "## Weekly 이관 항목"을 결정론 Bash(SKILL.md Wave 0.5)가
// 이미 carryover-items.md로 흡수해둔다. 이 상수는 그 경로를 Collect agent 프롬프트에 전달만 한다
// (여기서 재수집 X — 이중 수집 방지, SKILL.md §Wave 0.5 참조).
const date0 = _a?.date || new Date().toISOString().split('T')[0]
const CARRY = `forge-outputs/01-research/weekly/${date0}/carryover-items.md`

// ── Phase 1: Collect (parallel — Wave 1 정합) ─────────────────────────────────
phase('Collect')
const date = date0

const [techNews, bizNews, bizItems, stockBrief] = await parallel([
  () => agent(
    `기술 뉴스 수집 (${date}): Anthropic 블로그, GitHub Trending, arXiv AI/ML, HN 상위 10건. forge 관련 우선. ` +
    `지난주 이관항목(${CARRY} 있으면 Read)을 우선 반영하라.`,
    { label: 'tech-news', phase: 'Collect', schema: NEWS_SCHEMA, model: 'haiku' }
  ),
  () => agent(
    `비즈니스 뉴스 수집 (${date}): TechCrunch, Product Hunt, indie hacker 트렌드 10건. ` +
    `지난주 이관항목(${CARRY} 있으면 Read)을 우선 반영하라.`,
    { label: 'biz-news', phase: 'Collect', schema: NEWS_SCHEMA, model: 'haiku' }
  ),
  () => agent(
    `사업 아이템 조사 (${date}): forge로 구현 가능한 사업 아이템 3종. 문제/해결책/시장신호/우선순위 포함. ` +
    `지난주 이관항목(${CARRY} 있으면 Read)을 우선 반영하라.`,
    { label: 'biz-items', phase: 'Collect', schema: BUSINESS_ITEM_SCHEMA, model: 'sonnet' }
  ),
  // root-cause: 주식 리서치 배선 — mode: weekly(심층 3~5줄 + 섹터 분석). fail-open(watchlist 없으면 stock-research-analyst가 자체 skip 반환).
  () => agent(
    `관심종목 리서치 (${date}, mode: weekly): stock-watchlist.json 기반 종목별 3~5줄 심층 브리핑 + 섹터 시황 한 단락. 워치리스트 없으면 skip 사유만 반환.`,
    { label: 'stock-brief', phase: 'Collect', model: 'sonnet', agentType: 'stock-research-analyst' }
  ),
])
log(`Collect: tech=${techNews?.items?.length||0} biz=${bizNews?.items?.length||0} items=${bizItems?.items?.length||0} stock=${stockBrief ? 'ok' : 'skip'}`)

// ── Phase 2: Evaluate (adversarial 2x parallel — 계획서 P0-2) ────────────────
// root-cause: 단일 evaluator → 편향 공유. 2x parallel로 tech/biz 독립 검증
phase('Evaluate')
// root-cause: T1 — (c) 반증 탐색 의무화. 단순 품질채점 종료 금지 (research-verification-protocol.md #4)
const [techEval, bizEval] = await parallel([
  () => agent(
    `tech-news 교차검증 (${date}). 출처 신뢰도·날짜 정확성·중복 제거. ` +
    `tech_items=${techNews?.items?.length||0}건. clarity/consistency/completeness/safety 0-2점. ` +
    `[반증 탐색 의무 — research-verification-protocol.md #4] 각 top 주장(P0/P1)에 대해 반대·기각 증거를 능동 검색(WebSearch)하라. 단순 일관성·중복 확인으로 종료 금지. ` +
    `claim_verdicts 배열에 주장별 verdict(CONFIRMED|CONTESTED|UNVERIFIED)와 반박 소스 URL(counter_source_url)을 반환하라.`,
    { label: 'tech-adversarial', phase: 'Evaluate', schema: EVAL_SCHEMA }
  ),
  () => agent(
    // root-cause: SME 조직 규모 가정 정정 (1인 고정 → SME 가변)
    `biz-items adversarial 검증 (${date}). TAM/JTBD 반론·시장 신호 근거·SME 환경 적합성. ` +
    `biz_items=${bizItems?.items?.length||0}건. clarity/consistency/completeness/safety 0-2점. ` +
    `[반증 탐색 의무 — research-verification-protocol.md #4] 각 top 주장(P0/P1)에 대해 반대·기각 증거를 능동 검색(WebSearch)하라. 단순 일관성·중복 확인으로 종료 금지. ` +
    `claim_verdicts 배열에 주장별 verdict(CONFIRMED|CONTESTED|UNVERIFIED)와 반박 소스 URL(counter_source_url)을 반환하라.`,
    { label: 'biz-adversarial', phase: 'Evaluate', schema: EVAL_SCHEMA }
  ),
])
const overallScore = ((techEval?.overall||0) + (bizEval?.overall||0)) / 2
const verdict = overallScore >= 1.5 ? 'PASS' : overallScore >= 1.0 ? 'WARN' : 'FAIL'
const evalResult = { verdict, overall: overallScore }
log(`Evaluate: tech=${techEval?.verdict}(${techEval?.overall?.toFixed(1)}) biz=${bizEval?.verdict}(${bizEval?.overall?.toFixed(1)}) → ${verdict}`)
if (verdict === 'FAIL') log('[WARN] Evaluator FAIL — 품질 미흡. 이슈 명시 후 계속.')

// ── Phase 3: Synthesize ───────────────────────────────────────────────────────
phase('Synthesize')
const WEEKLY_DIR = `forge-outputs/01-research/weekly/${date}`
await agent(
  `weekly-research 취합 보고서 작성 (${date}). ` +
  `tech-news.md + biz-news.md + business-items.md 3종 생성. ` +
  `stock-brief 결과(있으면)를 stock-trends.md로 별도 저장(투자자문 아님 배너 유지, skip이면 파일 생성 생략). ` +
  `저장: ${WEEKLY_DIR}/ 하위. eval: ${evalResult?.verdict}.`,
  { label: 'synthesize', phase: 'Synthesize' }
)
log('Synthesize 완료')

// root-cause: 인사이트 적용 — 단일출처 신뢰도 사전필터 후처리(기계적 카운터). fail-open: 파일 없음/읽기실패 시 skip, 기존 산출 불변. 로그만 append(판정 차단 아님).
try {
  const fs = await import('node:fs/promises')
  const reportFiles = ['tech-news.md', 'biz-news.md', 'business-items.md', 'stock-trends.md']
  let combinedText = ''
  for (const f of reportFiles) {
    try {
      combinedText += await fs.readFile(`${WEEKLY_DIR}/${f}`, 'utf-8') + '\n'
    } catch (e) { /* 파일 없으면 skip — fail-open */ }
  }
  const singleSourceWarnings = detectSingleSourceHighConfidence(combinedText)
  for (const w of singleSourceWarnings) log(`[WARN] ${w}`)
} catch (e) {
  log(`[WARN] 단일출처 신뢰도 사전필터 skip(fail-open): ${e?.message || e}`)
}

// root-cause: 학습노트 배선 — 그주 리포트 md 경로들을 concept-notes-writer에 전달, study-notes.md 생성.
// fail-open: 실패/빈결과여도 기존 weekly 산출(3종 리포트)에는 영향 없음, 로그만 남김.
let studyNotes
try {
  studyNotes = await agent(
    `그주 weekly-research 리포트에서 핵심 개념 노트 생성. 입력 경로(존재하는 것만 전량 Read): ` +
    `${WEEKLY_DIR}/tech-trends.md, ${WEEKLY_DIR}/biz-trends.md, ${WEEKLY_DIR}/stock-trends.md(있으면). ` +
    `개념 후보 0개면 파일 생성 생략. 저장 경로: ${WEEKLY_DIR}/study-notes.md.`,
    { label: 'study-notes', phase: 'Synthesize', model: 'sonnet', agentType: 'concept-notes-writer' }
  )
} catch (e) {
  log(`[WARN] study-notes 생성 실패(fail-open, 기존 산출 불변): ${e?.message || e}`)
}
log(`Study notes: ${studyNotes ? 'ok' : 'skip'}`)

// ── Phase 4: Publish ──────────────────────────────────────────────────────────
phase('Publish')
await agent(
  `weekly-research 발행 (${date}). Notion 업로드 시도 (실패 시 로컬 index.json만 갱신). ` +
  `forge-outputs/01-research/weekly/index.json 갱신 의무.`,
  { label: 'publish', phase: 'Publish' }
)
log('Publish 완료')

return {
  date,
  collect: { tech: techNews?.items?.length||0, biz: bizNews?.items?.length||0, items: bizItems?.items?.length||0, stock: stockBrief ? 'ok' : 'skip' },
  evaluate: { verdict: evalResult?.verdict, score: evalResult?.overall },
  studyNotes: studyNotes ? 'ok' : 'skip',
}
