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

// root-cause: T2 — static analysis infers apiEndpoints/components without HAR/DOM verification, emitting inferences as facts. VERIFY_SCHEMA adds adversarial phase 2.5 to surface evidence gaps before output. (deep-research c+d, research-verification-protocol.md #4)
const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verifiedApis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          endpoint: { type: 'string' },
          evidence_har_url: { type: 'string' },
          method: { type: 'string' },
        },
        required: ['endpoint'],
      },
    },
    unverifiedApis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          endpoint: { type: 'string' },
          confidence: { type: 'string', enum: ['low'] },
          unverified: { type: 'boolean' },
        },
        required: ['endpoint', 'confidence', 'unverified'],
      },
    },
    verifiedComponents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          selector_evidence: { type: 'string' },
        },
        required: ['name', 'selector_evidence'],
      },
    },
    unverifiedComponents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          unverified: { type: 'boolean' },
        },
        required: ['name', 'unverified'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['verifiedApis', 'unverifiedApis', 'verifiedComponents', 'unverifiedComponents', 'summary'],
}

// root-cause: fan-out 5각도 스키마 추가 — multi-modal sweep(deep-research a) + coverage-loop(deep-research e) 배선
const PAGE_TYPE_SCHEMA = {
  type: 'object',
  properties: {
    pageTypes: { type: 'array', items: { type: 'string' } },
    routePatterns: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['pageTypes', 'summary'],
}

const INTERACTION_SCHEMA = {
  type: 'object',
  properties: {
    eventPatterns: { type: 'array', items: { type: 'string' } },
    formPatterns: { type: 'array', items: { type: 'string' } },
    navigationPatterns: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['eventPatterns', 'summary'],
}

const CSS_TOKEN_SCHEMA = {
  type: 'object',
  properties: {
    cssVariables: { type: 'array', items: { type: 'string' } },
    colorSystem: { type: 'object' },
    spacingScale: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['cssVariables', 'summary'],
}

const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['category', 'description'],
      },
    },
    hasGaps: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['gaps', 'hasGaps', 'summary'],
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

// ── Phase 2+3: Analyze (multi-modal fan-out 5각도 병렬) ───────────────────────
// root-cause: (a) fan-out 심화 — 기존 2각(static+vision) → 5각 독립 parallel(). research-verification-protocol.md §multi-modal sweep.
// 각도: by-component(DOM) / by-API(HAR) / by-CSS-token / by-page-type / by-interaction + Gemini Vision
phase('Analyze')
const analyzeAgents = [
  () => agent(
    `site-deep-analyze Phase 2 정적 분석 (by-component + by-API 각도). ` +
    `DOM paths: ${JSON.stringify(crawlResult?.domPaths?.slice(0, 5))}. HAR: ${crawlResult?.harPath}. ` +
    `DOM→컴포넌트 패턴(버튼·폼·카드·내비·모달·테이블 빈도). ` +
    `CSS→style-forge Mode A 호환(colorPalette/typography/spacing/border-radius). ` +
    `HAR→API 엔드포인트(URL pattern + HTTP method + status + 인증방식). ` +
    `components[] + colorPalette[] + apiEndpoints[] 반환.`,
    { label: 'analyze:static', phase: 'Analyze', schema: STATIC_SCHEMA }
  ),
  () => agent(
    `site-deep-analyze fan-out: by-page-type 각도. DOM paths: ${JSON.stringify(crawlResult?.domPaths?.slice(0, 5))}. ` +
    `각 페이지 URL·DOM 구조를 분석하여 페이지 유형 분류: auth(로그인/회원가입)/list(목록/검색)/detail(상세)/dashboard(대시보드)/landing(랜딩)/form(폼). ` +
    `라우트 패턴과 페이지 유형 매핑. pageTypes[] + routePatterns[] 반환.`,
    { label: 'analyze:by-page-type', phase: 'Analyze', schema: PAGE_TYPE_SCHEMA }
  ),
  () => agent(
    `site-deep-analyze fan-out: by-interaction 각도. DOM paths: ${JSON.stringify(crawlResult?.domPaths?.slice(0, 5))}. ` +
    `DOM 이벤트 핸들러 패턴(click/hover/focus/submit/scroll/drag) 추출. ` +
    `폼 패턴(validation/multi-step/auto-save). 내비게이션 패턴(SPA/MPA/tabs/modal). ` +
    `eventPatterns[] + formPatterns[] + navigationPatterns[] 반환.`,
    { label: 'analyze:by-interaction', phase: 'Analyze', schema: INTERACTION_SCHEMA }
  ),
  () => agent(
    `site-deep-analyze fan-out: by-css-token 각도. DOM paths: ${JSON.stringify(crawlResult?.domPaths?.slice(0, 5))}. ` +
    `CSS 변수(:root var(--*)) 추출. 컬러 시스템(primary/secondary/neutral/semantic 토큰). ` +
    `스페이싱 스케일(4px/8px base 확인). cssVariables[] + colorSystem{} + spacingScale[] 반환.`,
    { label: 'analyze:by-css-token', phase: 'Analyze', schema: CSS_TOKEN_SCHEMA }
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
const analyzeResults = await parallel(analyzeAgents)
const staticResult = analyzeResults[0]
const pageTypeResult = analyzeResults[1]
const interactionResult = analyzeResults[2]
const cssTokenResult = analyzeResults[3]
const visionResult = skipGemini ? null : analyzeResults[4]
log(`[Analyze] components=${staticResult?.components?.length} apis=${staticResult?.apiEndpoints?.length} pageTypes=${pageTypeResult?.pageTypes?.length} interactions=${interactionResult?.eventPatterns?.length} cssVars=${cssTokenResult?.cssVariables?.length} vision=${visionResult ? 'OK' : 'skip'}`)

// ── Phase 2.x: Coverage Loop (completeness critic, cap 2라운드) ──────────────
// root-cause: (e) coverage-loop — Analyze 후 미탐색 항목 식별 → 타겟 재분석(cap 2). research-verification-protocol.md §coverage-loop.
let _cvComponents = [...(staticResult?.components || [])]
let _cvApis = [...(staticResult?.apiEndpoints || [])]
for (let _cr = 0; _cr < 2; _cr++) {
  const _critic = await agent(
    `site-deep-analyze 커버리지 비평 (completeness critic, round ${_cr + 1}/2). ` +
    `분석 완료 각도: static(컴포넌트/API/CSS) / by-page-type / by-interaction / by-css-token / vision. ` +
    `현재 발견 컴포넌트: ${JSON.stringify(_cvComponents)}. ` +
    `현재 발견 API: ${JSON.stringify(_cvApis)}. ` +
    `현재 페이지 유형: ${JSON.stringify(pageTypeResult?.pageTypes)}. ` +
    `현재 이벤트 패턴: ${JSON.stringify(interactionResult?.eventPatterns)}. ` +
    `미탐색 항목 식별 — DOM·HAR에 존재하지만 아직 미분류:\n` +
    `1. 미분류 컴포넌트 유형\n2. 미크롤 페이지 카테고리\n3. 미매핑 API 패턴\n` +
    `gap 있으면 hasGaps=true + gaps[] 반환. 없으면 hasGaps=false.`,
    { label: `coverage:critic:r${_cr + 1}`, phase: 'Analyze', schema: COVERAGE_SCHEMA }
  )
  if (!_critic?.hasGaps || !_critic.gaps?.length) {
    log(`[Coverage] round ${_cr + 1}: gap 없음 — coverage 완료`)
    break
  }
  log(`[Coverage] round ${_cr + 1}: ${_critic.gaps.length}개 gap 발견 → 타겟 재분석`)
  const _gapDesc = (_critic.gaps || []).map((g, i) => `${i + 1}. [${g.category}] ${g.description}`).join('\n')
  const _supplement = await agent(
    `site-deep-analyze 커버리지 보완 (round ${_cr + 1}/2). ` +
    `DOM paths: ${JSON.stringify(crawlResult?.domPaths?.slice(0, 5))}. HAR: ${crawlResult?.harPath}. ` +
    `보완 대상 gap:\n${_gapDesc}\n각 gap에 대해 추가 분석 후 components[], apiEndpoints[] 보완.`,
    { label: `coverage:supplement:r${_cr + 1}`, phase: 'Analyze', schema: STATIC_SCHEMA }
  )
  _cvComponents = [...new Set([..._cvComponents, ...(_supplement?.components || [])])]
  _cvApis = [...new Set([..._cvApis, ...(_supplement?.apiEndpoints || [])])]
  if (_cr === 1) {
    log(`[Coverage] cap 도달 (2라운드). 잔여 gap ${_critic.gaps.length}건 드롭 — Phase 2.5 진행.`)
  }
}
const finalStaticResult = { ...staticResult, components: _cvComponents, apiEndpoints: _cvApis }

// ── Phase 2.5: 추론검증 (adversarial inference verification) ─────────────────
// root-cause: staticResult infers apiEndpoints via HAR pattern-matching and components via DOM frequency,
// then emits them as facts. This phase adversarially checks each inference against actual HAR requests
// and real DOM selectors before they reach the output. Ref: research-verification-protocol.md #4 반증탐색.
phase('Verify')
const verifyResult = await agent(
  `site-deep-analyze Phase 2.5 추론검증 (adversarial inference verification). ` +
  `NO new network or crawl calls — use only already-collected artefacts. ` +
  `HAR 경로: ${crawlResult?.harPath}. ` +
  `DOM 경로: ${JSON.stringify(crawlResult?.domPaths?.slice(0, 5))}. ` +
  // root-cause: coverage-loop 보완 후 finalStaticResult 사용 (deep-research a+e)
  `정적분석 추론 결과 (coverage-loop 보완 후) — API 엔드포인트: ${JSON.stringify(finalStaticResult?.apiEndpoints)}. ` +
  `정적분석 추론 결과 (coverage-loop 보완 후) — 컴포넌트: ${JSON.stringify(finalStaticResult?.components)}. ` +
  `\n검증 절차:\n` +
  `1. 각 apiEndpoint에 대해: HAR 파일에서 동일 URL 패턴의 실제 요청이 존재하는지 확인. ` +
  `   존재하면 → verifiedApis[]에 {endpoint, evidence_har_url, method} 추가. ` +
  `   없으면 → unverifiedApis[]에 {endpoint, confidence:"low", unverified:true} 추가.\n` +
  `2. 각 component에 대해: DOM HTML에서 해당 컴포넌트를 뒷받침하는 CSS class/selector가 실재하는지 확인. ` +
  `   근거 selector 존재 → verifiedComponents[]에 {name, selector_evidence} 추가. ` +
  `   근거 없음 → unverifiedComponents[]에 {name, unverified:true} 추가.\n` +
  `3. summary: 검증 비율 요약 (예: "APIs 8/12 verified, Components 5/7 verified").\n` +
  `참조 표준: ~/.claude/rules-on-demand/research-verification-protocol.md #4 반증탐색.`,
  { label: 'verify:adversarial', phase: 'Verify', schema: VERIFY_SCHEMA }
)
log(`[Verify] verifiedApis=${verifyResult?.verifiedApis?.length} unverifiedApis=${verifyResult?.unverifiedApis?.length} verifiedComponents=${verifyResult?.verifiedComponents?.length} unverifiedComponents=${verifyResult?.unverifiedComponents?.length}`)

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

// root-cause: T2-d — output agent must receive verifyResult and apply [INFERRED] labels to all
// unverified apiEndpoints in api-schema.json and unverified components in reconstruction-spec.md.
// Adds confidence/evidence fields per deep-research (d) labeling convention.
// ── Phase 5+6: Output ─────────────────────────────────────────────────────────
phase('Output')
const outputResult = await agent(
  `site-deep-analyze Phase 5 산출물 생성. slug="${gateResult?.slug}". ` +
  `저장 경로: ~/forge-outputs/05-design/site-analysis/${gateResult?.slug}/. ` +
  // root-cause: finalStaticResult(coverage-loop 보완) + 신규 fan-out 결과 포함 (deep-research a+e)
  `정적 분석 (coverage-loop 보완): ${JSON.stringify(finalStaticResult)}. ` +
  `페이지 유형 분석: ${JSON.stringify(pageTypeResult)}. ` +
  `인터랙션 분석: ${JSON.stringify(interactionResult)}. ` +
  `CSS 토큰 분석: ${JSON.stringify(cssTokenResult)}. ` +
  `시각 분석: ${JSON.stringify(visionResult)}. ` +
  `시맨틱: ${JSON.stringify(semanticResult)}. ` +
  `추론검증 결과 (Phase 2.5): ${JSON.stringify(verifyResult)}. ` +
  `\n[INFERRED 라벨링 규칙 — 필수 준수]:\n` +
  `- api-schema.json의 각 엔드포인트: verifyResult.unverifiedApis에 포함된 항목은 반드시 ` +
  `"x-inference-label": "[INFERRED — no direct evidence]", "confidence": "low" 필드를 추가. ` +
  `verifyResult.verifiedApis 항목은 "confidence": "high", "evidence": "<evidence_har_url>" 필드 추가.\n` +
  `- reconstruction-spec.md의 각 컴포넌트: verifyResult.unverifiedComponents에 포함된 항목은 ` +
  `컴포넌트명 뒤에 **[INFERRED — no direct evidence]** 라벨 표기. ` +
  `verifyResult.verifiedComponents 항목은 (selector: <selector_evidence>) 증거 표기.\n` +
  `- analysis-report.md 상단(영감 고지 직후): 추론검증 요약 섹션 추가 — verifyResult.summary 내용 인용.\n` +
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
  // root-cause: coverage-loop 보완 후 최종 카운트
  componentsFound: finalStaticResult?.components?.length,
  apisFound: finalStaticResult?.apiEndpoints?.length,
}
