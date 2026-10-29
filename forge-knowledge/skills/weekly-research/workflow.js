// root-cause: AD-122 weekly-research Workflow PoC (read-only, 실행 X)
// log() = Workflow 내장 (console.log 아닌 Workflow runtime log)
export const meta = {
  name: 'weekly-research-workflow-poc',
  description: 'weekly-research Wave 1~3 Workflow 마이그레이션 PoC (AD-122)',
  phases: [
    { title: 'Collect', detail: '6-Tier 소스 병렬 수집 (haiku x2 + sonnet x1)' },
    { title: 'Evaluate', detail: '독립 Evaluator adversarial verify' },
    { title: 'Synthesize', detail: '취합 + 산출물 3종 생성' },
    { title: 'Publish', detail: 'index.json 갱신 + 블로그 발행' },
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
// root-cause: T1 — (c) promote adversarial to true refutation
const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS','WARN','FAIL'] },
    scores: { type: 'object', properties: { clarity:{type:'number'}, consistency:{type:'number'}, completeness:{type:'number'}, safety:{type:'number'} } },
    overall: { type: 'number' },
    issues: { type: 'array', items: { type:'string' } },
    // (c) 반증 탐색 결과
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

// 주식 브리핑(Wave D, stock-research-analyst)은 뺐다 — 사람이 그 에이전트를 지정 삭제했다(#1374). 원본 삭제는
//   되돌리지 않는다(사람 원칙 2026-09-28) · 다시 필요하면 새로 설계한다(#1513).
const [techNews, bizNews, bizItems] = await parallel([
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
])
log(`Collect: tech=${techNews?.items?.length||0} biz=${bizNews?.items?.length||0} items=${bizItems?.items?.length||0}`)

// ── Phase 2: Evaluate (adversarial 2x parallel — 계획서 P0-2) ────────────────
// root-cause: 단일 evaluator → 편향 공유. 2x parallel로 tech/biz 독립 검증
phase('Evaluate')
// root-cause: T1 — (c) 반증 탐색 의무화. 단순 품질채점 종료 금지
const [techEval, bizEval] = await parallel([
  () => agent(
    `tech-news 교차검증 (${date}). 출처 신뢰도·날짜 정확성·중복 제거. ` +
    `tech_items=${techNews?.items?.length||0}건. clarity/consistency/completeness/safety 0-2점. ` +
    `[반증 탐색 의무] 각 top 주장(P0/P1)에 대해 반대·기각 증거를 능동 검색(WebSearch)하라. 단순 일관성·중복 확인으로 종료 금지. ` +
    `claim_verdicts 배열에 주장별 verdict(CONFIRMED|CONTESTED|UNVERIFIED)와 반박 소스 URL(counter_source_url)을 반환하라.`,
    { model: 'opus', label: 'tech-adversarial', phase: 'Evaluate', schema: EVAL_SCHEMA }
  ),
  () => agent(
    // root-cause: SME 조직 규모 가정 정정 (1인 고정 → SME 가변)
    `biz-items adversarial 검증 (${date}). TAM/JTBD 반론·시장 신호 근거·SME 환경 적합성. ` +
    `biz_items=${bizItems?.items?.length||0}건. clarity/consistency/completeness/safety 0-2점. ` +
    `[반증 탐색 의무] 각 top 주장(P0/P1)에 대해 반대·기각 증거를 능동 검색(WebSearch)하라. 단순 일관성·중복 확인으로 종료 금지. ` +
    `claim_verdicts 배열에 주장별 verdict(CONFIRMED|CONTESTED|UNVERIFIED)와 반박 소스 URL(counter_source_url)을 반환하라.`,
    { model: 'opus', label: 'biz-adversarial', phase: 'Evaluate', schema: EVAL_SCHEMA }
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
  `저장: ${WEEKLY_DIR}/ 하위. eval: ${evalResult?.verdict}.`,
  { model: 'opus', label: 'synthesize', phase: 'Synthesize' }
)
log('Synthesize 완료')

// root-cause: 인사이트 적용 — 단일출처 신뢰도 사전필터 후처리(기계적 카운터). fail-open: 파일 없음/읽기실패 시 skip, 기존 산출 불변. 로그만 append(판정 차단 아님).
// root-cause(2026-09-17 P19): 종전에는 `await import('node:fs/promises')` + `fs.readFile` 로 읽었다. Workflow 런타임은
//   import() 를 **구문 단계에서** 거부해(`SyntaxError: import() is not available in workflow scripts.`) 이 try 에
//   닿기도 전에 스크립트 전체가 죽었다 — 이 스킬의 Workflow 실행 기록 0건, 실제로 돈 것은 SKILL.md 의
//   Agent Teams fallback(Wave 1~3 직접 실행)뿐이었다. 파일·셸에 닿는 유일한 수단은 agent() 가 Bash 를 돌리는 것이다.
// 왜 args 로 받지 않나: 대상 파일은 바로 위 Synthesize 단계가 **이 워크플로 안에서** 만든다 — 호출 시점엔 없다.
// 왜 파일 전문을 반환받지 않나: 실측(2026-09-14 회차) tech-trends 34KB + biz 12KB + stock 12KB ≈ 58KB 라 에이전트
//   응답 한도에 잘린다. 그래서 판정에 필요한 두 종류 줄(`**신뢰도**:`·`**출처**:`)만 grep 으로 뽑아 순서대로 받는다.
// ⚠️ 이 축약이 무력화되는 입력: 원문에서 `신뢰도: High` 와 `출처:` 사이가 500자를 넘던 항목도 필터된 텍스트에서는
//   가까워져 WARN 이 날 수 있다(과탐 방향). WARN 전용·비차단 카운터라 허용한다.
// 파일명: 이전 목록(tech-news/biz-news/business-items)은 실제 산출명(tech-trends/biz-trends, study-notes 단계 참조)과
//   어긋나 늘 0건을 읽었다 — 두 이름을 모두 넘긴다(없는 파일은 grep 이 2>/dev/null 로 조용히 건너뛴다).
// ⚠️ [CMD] 는 평평한 한 줄로 유지한다 — `{ }`·`if`·중첩 치환을 넣으면 워크트리 격리 가드가 통째로 거부한다(PR #578).
try {
  const reportFiles = ['tech-trends.md', 'biz-trends.md', 'tech-news.md', 'biz-news.md', 'business-items.md']
  const weeklyAbs = `${'${FORGE_OUTPUTS:-$HOME/forge-outputs}'}/01-research/weekly/${date}`
  const fileArgs = reportFiles.map((f) => `"${weeklyAbs}/${f}"`).join(' ')
  const grepOut = await agent(
    `Bash 도구로 아래 [CMD] 와 [/CMD] 사이 명령을 **문자열 그대로, 한 번** 실행하고 stdout 을 그대로 반환하라.\n` +
    `⛔ 해석·요약·수정·추가 명령 금지 — 실행기일 뿐이다. grep 이 아무것도 못 찾아 비어도 정상이다.\n` +
    `[CMD]\ngrep -h -E '\\*\\*(신뢰도|출처)\\*\\*:' ${fileArgs} 2>/dev/null | head -c 40000\n[/CMD]\n` +
    `반환 스키마: {"stdout": "<출력 전체 그대로>"}. 출력이 없으면 stdout="".`,
    { label: 'single-source-grep', phase: 'Synthesize', model: 'haiku',
      schema: { type: 'object', properties: { stdout: { type: 'string' } }, required: ['stdout'] } }
  )
  const combinedText = String(grepOut?.stdout || '')
  const singleSourceWarnings = detectSingleSourceHighConfidence(combinedText)
  for (const w of singleSourceWarnings) log(`[WARN] ${w}`)
} catch (e) {
  log(`[WARN] 단일출처 신뢰도 사전필터 skip(fail-open): ${e?.message || e}`)
}

// 학습노트 생성은 2026-09-03 폐지(Human 지시) — concept-notes-writer 를 스폰하지 않는다.
// 2026-09-24: SKILL.md 의 폐지 문구와 실제 배선이 어긋나 있어(폐지 표기 4곳 vs 스폰 3곳) 스폰 쪽을 지웠다.
// 근거: harness-gaps/2026-09-24-study-notes-abolished-but-still-spawned.md · 사람 결정 2026-09-24(스폰 중단).
// 되돌리려면 이 주석을 지우고 SKILL.md 의 폐지 문구도 함께 지운다(한쪽만 고치면 같은 불일치가 재발한다).

// ── Phase 4: Publish ──────────────────────────────────────────────────────────
phase('Publish')
await agent(
  `weekly-research 발행 (${date}). forge-outputs/01-research/weekly/index.json 갱신 의무. ` +
  `블로그 발행은 실패해도 경고 후 스킵. ` +
  `근거: 2026-09-25 사람 결정(#1104) — Notion 연동 해제. 인덱스·블로그·리포트 사이트는 유지.`,
  { model: 'sonnet', label: 'publish', phase: 'Publish' }
)
log('Publish 완료')

return {
  date,
  collect: { tech: techNews?.items?.length||0, biz: bizNews?.items?.length||0, items: bizItems?.items?.length||0 },
  evaluate: { verdict: evalResult?.verdict, score: evalResult?.overall },
  studyNotes: studyNotes ? 'ok' : 'skip',
}
