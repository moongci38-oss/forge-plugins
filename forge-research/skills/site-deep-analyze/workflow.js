// root-cause: site-deep-analyze Phase 2(정적) + Phase 3(Gemini Vision) = 독립 → parallel() 병렬화. 계획서 P2-6.
// Gemini Vision: 외부 토큰 선발행 전제 (mcp__gemini__ HMAC approve-worker).
export const meta = {
  name: 'site-deep-analyze',
  description: '사이트 정밀 분석 Workflow — Phase 1 크롤 후 Phase 2(정적)+Phase 3(Gemini Vision) 병렬화',
  phases: [
    { title: 'Gate', detail: 'Phase 0: 윤리 게이트 + robots.txt 확인', model: 'haiku' },
    { title: 'Crawl', detail: 'Phase 1: Playwright 크롤 (depth=2, 3 viewport)' },
    { title: 'Analyze', detail: 'Phase 2+3: 정적분석(DOM/CSS/HAR) + Gemini Vision 병렬' },
    { title: 'Semantic', detail: 'Phase 4: Tavily 시맨틱 추출' },
    { title: 'Output', detail: 'Phase 5+6: 산출물 생성 + 다음 액션 안내' },
  ],
}

const url = args?.url || ''
const depth = args?.depth || 2
const pages = args?.pages || 20
const task = args?.task || 'full'  // 'ui-audit' | 'api-discovery' | 'full'
const viewport = args?.viewport || 'desktop,tablet,mobile'
const skipGemini = args?.skipGemini || false  // Gemini 토큰 선발행 없는 경우

if (!url) {
  log('[STOP] url 필수 (args.url)')
  return { error: 'missing-url' }
}

// root-cause: Codex HIGH — SSRF 게이트가 LLM에만 의존. 코드레벨 allowlist 선행 차단 필수.
try {
  const _parsed = new URL(url)
  const _host = _parsed.hostname.toLowerCase()
  const _blocked = [/^localhost$/, /^127\./, /^10\./, /^172\.(1[6-9]|2[0-9]|3[01])\./, /^192\.168\./, /^::1$/, /^169\.254\./, /^0\.0\.0\.0$/]
  if (_blocked.some(p => p.test(_host)) || _parsed.protocol === 'file:') {
    log(`[STOP] SSRF 코드레벨 차단: ${_host}`)
    return { error: 'ssrf-blocked', hostname: _host }
  }
} catch (_) {
  log(`[STOP] URL 파싱 실패: ${url}`)
  return { error: 'invalid-url', url }
}

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    allowed: { type: 'boolean' },
    robotsBlocked: { type: 'boolean' },
    slug: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['allowed', 'slug'],
}

const CRAWL_SCHEMA = {
  type: 'object',
  properties: {
    pagesFound: { type: 'number' },
    screenshotPaths: { type: 'array', items: { type: 'string' } },
    domPaths: { type: 'array', items: { type: 'string' } },
    harPath: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['pagesFound', 'screenshotPaths', 'summary'],
}

const STATIC_SCHEMA = {
  type: 'object',
  properties: {
    components: { type: 'array', items: { type: 'string' } },
    colorPalette: { type: 'array', items: { type: 'string' } },
    typography: { type: 'object' },
    spacing: { type: 'string' },
    apiEndpoints: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['components', 'summary'],
}

const VISION_SCHEMA = {
  type: 'object',
  properties: {
    layoutPattern: { type: 'string' },
    uxPatterns: { type: 'array', items: { type: 'string' } },
    interactionHints: { type: 'array', items: { type: 'string' } },
    componentsCatalog: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['layoutPattern', 'summary'],
}

const SEMANTIC_SCHEMA = {
  type: 'object',
  properties: {
    mainContent: { type: 'string' },
    ogTags: { type: 'object' },
    jsonLd: { type: 'string' },
    languages: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['summary'],
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    outputDir: { type: 'string' },
    analysisReportPath: { type: 'string' },
    styleGuidePath: { type: 'string' },
    componentsPath: { type: 'string' },
    apiSchemaPath: { type: 'string' },
    reconstructionSpecPath: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['outputDir', 'analysisReportPath', 'summary'],
}

// ── Phase 0: Gate ─────────────────────────────────────────────────────────────
phase('Gate')
const gateResult = await agent(
  `site-deep-analyze Phase 0 윤리 게이트. url="${url}". ` +
  `차단 목록: localhost/127.0.0.1/RFC1918 사설망/IPv6 loopback/169.254.169.254/file://. ` +
  `WebFetch "${url}/robots.txt" → Disallow: / 시 robotsBlocked=true. ` +
  `ToS 확인 권고 (FORGE_SELF_SITES 매핑 시 skip). ` +
  `slug = hostname kebab-case ≤30자. allowed + slug 반환.`,
  { label: 'gate:ethics', phase: 'Gate', schema: GATE_SCHEMA }
)
// root-cause: Codex HIGH — robotsBlocked LLM 판단에만 의존. LLM이 allowed=true 오판 가능. 코드레벨 명시적 차단 필수.
if (gateResult?.robotsBlocked) {
  log('[STOP] robots.txt Disallow:/ 코드레벨 차단')
  return { error: 'gate-blocked', reason: 'robots-disallow-code-level' }
}
if (!gateResult?.allowed) {
  log(`[STOP] Phase 0 게이트 차단: ${gateResult?.reason}`)
  return { error: 'gate-blocked', reason: gateResult?.reason }
}
log(`[Gate] slug=${gateResult?.slug}`)

// ── Phase 1: Crawl ────────────────────────────────────────────────────────────
phase('Crawl')
const crawlResult = await agent(
  `site-deep-analyze Phase 1 Playwright 크롤. url="${url}" depth=${depth} pages=${pages}. ` +
  `User-Agent: "Forge Site Analyzer/1.0". Delay: 1s/req. ` +
  `각 페이지: 스크린샷 3 viewport(${viewport}) + DOM HTML + HAR. ` +
  `playwright-cli 스킬 참조. ` +
  `pagesFound + screenshotPaths[] + domPaths[] + harPath 반환.`,
  { label: 'crawl:playwright', phase: 'Crawl', schema: CRAWL_SCHEMA }
)
log(`[Crawl] pages=${crawlResult?.pagesFound} screenshots=${crawlResult?.screenshotPaths?.length}개`)

// ── Phase 2+3: Analyze (정적 + Gemini Vision 병렬) ────────────────────────────
phase('Analyze')
// 외부 Gemini 토큰 선발행 전제 (Phase 3 agentType: 'gemini')
const analyzeAgents = [
  () => agent(
    `site-deep-analyze Phase 2 정적 분석. ` +
    `DOM paths: ${JSON.stringify(crawlResult?.domPaths?.slice(0, 5))}. ` +
    `HAR: ${crawlResult?.harPath}. ` +
    `DOM→컴포넌트 패턴(버튼·폼·카드·내비·모달·테이블 빈도). ` +
    `CSS→style-forge Mode A 호환(colorPalette/typography/spacing/border-radius). ` +
    `HAR→API 엔드포인트(URL pattern + HTTP method + status + 인증방식). ` +
    `components[] + colorPalette[] + apiEndpoints[] 반환.`,
    { label: 'analyze:static', phase: 'Analyze', schema: STATIC_SCHEMA }
  ),
]
if (!skipGemini) {
  analyzeAgents.push(() => agent(
    `site-deep-analyze Phase 3 시각 분석 (Gemini Vision). 외부 토큰 선발행 전제. ` +
    `핵심 화면 5-10개: ${JSON.stringify(crawlResult?.screenshotPaths?.slice(0, 8))}. ` +
    `Gemini Vision: 레이아웃 grid/flex + UX 패턴 분류 + 인터랙션 단서. ` +
    `layoutPattern + uxPatterns[] + interactionHints[] + componentsCatalog[] 반환.`,
    { label: 'analyze:vision', phase: 'Analyze', schema: VISION_SCHEMA, agentType: 'gemini' }
  ))
}
const [staticResult, visionResult] = await parallel(analyzeAgents)
log(`[Analyze] components=${staticResult?.components?.length} apis=${staticResult?.apiEndpoints?.length} vision=${visionResult ? 'OK' : 'skip'}`)

// ── Phase 4: Semantic ─────────────────────────────────────────────────────────
phase('Semantic')
const semanticResult = await agent(
  `site-deep-analyze Phase 4 시맨틱 추출. url="${url}". ` +
  `Tavily tavily_extract 호출(JS 렌더링 처리). ` +
  `본문 텍스트 + OG tags + JSON-LD + 다국어 감지. ` +
  `mainContent + ogTags + jsonLd + languages[] 반환.`,
  { label: 'semantic:tavily', phase: 'Semantic', schema: SEMANTIC_SCHEMA }
)
log(`[Semantic] languages=${semanticResult?.languages?.join(',')}`)

// ── Phase 5+6: Output ─────────────────────────────────────────────────────────
phase('Output')
const outputResult = await agent(
  `site-deep-analyze Phase 5 산출물 생성. slug="${gateResult?.slug}". ` +
  `저장 경로: ~/forge-outputs/05-design/site-analysis/${gateResult?.slug}/. ` +
  `정적 분석: ${JSON.stringify(staticResult)}. ` +
  `시각 분석: ${JSON.stringify(visionResult)}. ` +
  `시맨틱: ${JSON.stringify(semanticResult)}. ` +
  `생성 파일: analysis-report.md(첫줄 영감 재구현 고지 필수) + style-guide.md + components.md + api-schema.json + reconstruction-spec.md. ` +
  `Phase 6: 다음 액션 안내(forge-plan --from-site-analysis / wiki-sync). ` +
  `outputDir + analysisReportPath + styleGuidePath + componentsPath + reconstructionSpecPath 반환.`,
  { label: 'output:generate', phase: 'Output', schema: OUTPUT_SCHEMA }
)
log(`[Output] ${outputResult?.outputDir} report=${outputResult?.analysisReportPath}`)

return {
  slug: gateResult?.slug,
  outputDir: outputResult?.outputDir,
  analysisReportPath: outputResult?.analysisReportPath,
  pagesAnalyzed: crawlResult?.pagesFound,
  componentsFound: staticResult?.components?.length,
  apisFound: staticResult?.apiEndpoints?.length,
}
