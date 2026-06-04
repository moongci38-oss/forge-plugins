// root-cause: figma-design-sync Figma MCP → rate limit 시 Codex/Gemini Vision 자동 폴백. 계획서 P2-7.
// Figma MCP = approve-worker 불필요. Gemini/Codex = 외부 토큰 선발행 전제.
export const meta = {
  name: 'figma-design-sync',
  description: 'Figma MCP 토큰 추출 Workflow — rate limit 시 Codex/Gemini Vision 자동 폴백 + CLAUDE-DESIGN-PROMPTS.md 갱신',
  phases: [
    { title: 'Fetch', detail: 'Step 1~2: Figma URL 파싱 + MCP 병렬 3종 (get_design_context/get_metadata/get_variable_defs)' },
    { title: 'Fallback', detail: 'Step 3: rate limit 감지 → Codex Vision (즉시) → Gemini Vision (2차)' },
    { title: 'Map', detail: 'Step 4~6: 토큰 매핑 + variables.json 저장 + ANALYSIS-REPORT.md 갱신' },
    { title: 'Update', detail: 'Step 7~9: CLAUDE-DESIGN-PROMPTS.md 갱신 + Brand 정정 + 결과 보고' },
  ],
}

const figmaUrl = args?.figmaUrl || ''
const docPath = args?.docPath || '.'
const brandRules = args?.brandRules || ''  // 브랜드 정정 룰

if (!figmaUrl) {
  log('[STOP] figmaUrl 필수 (args.figmaUrl)')
  return { error: 'missing-figma-url' }
}

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    fileKey: { type: 'string' },
    nodeId: { type: 'string' },
    fileName: { type: 'string' },
    isValid: { type: 'boolean' },
  },
  required: ['fileKey', 'isValid'],
}

const FIGMA_MCP_SCHEMA = {
  type: 'object',
  properties: {
    rateLimitHit: { type: 'boolean' },
    designContext: { type: 'object' },
    metadata: { type: 'object' },
    variables: { type: 'object' },
    availableImages: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['rateLimitHit', 'summary'],
}

const VISION_FALLBACK_SCHEMA = {
  type: 'object',
  properties: {
    source: { type: 'string', enum: ['figma-mcp', 'codex-vision', 'gemini-vision'] },
    colorPalette: { type: 'array', items: { type: 'string' } },
    typography: { type: 'object' },
    spacing: { type: 'string' },
    borderRadius: { type: 'string' },
    components: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['source', 'summary'],
}

const UPDATE_SCHEMA = {
  type: 'object',
  properties: {
    variablesJsonPath: { type: 'string' },
    analysisReportPath: { type: 'string' },
    designPromptsPath: { type: 'string' },
    changesCount: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['analysisReportPath', 'designPromptsPath', 'summary'],
}

// ── Step 1: URL 파싱 ──────────────────────────────────────────────────────────
phase('Fetch')
const parseResult = await agent(
  `figma-design-sync Step 1 URL 파싱. figmaUrl="${figmaUrl}". ` +
  `figma.com/design/:fileKey/:fileName?node-id=:nodeId 형식 파싱. nodeId "-"→":" 변환. ` +
  `fileKey + nodeId + fileName + isValid 반환.`,
  { label: 'fetch:parse', phase: 'Fetch', schema: PARSE_SCHEMA }
)
if (!parseResult?.isValid) {
  log(`[STOP] Figma URL 파싱 실패: ${figmaUrl}`)
  return { error: 'invalid-figma-url' }
}
log(`[Fetch] fileKey=${parseResult?.fileKey} node=${parseResult?.nodeId}`)

// Step 2: Figma MCP 병렬 3종 호출
const figmaMcpResult = await agent(
  `figma-design-sync Step 2 Figma MCP 병렬 호출. fileKey="${parseResult?.fileKey}" nodeId="${parseResult?.nodeId}". ` +
  `1)get_design_context({fileKey, nodeId}) → 레이아웃·컴포넌트 구조. ` +
  `2)get_metadata({fileKey}) → 프레임·페이지 목록. ` +
  `3)get_variable_defs({fileKey}) → 디자인 토큰 변수. ` +
  `rate limit(429) 발생 시 rateLimitHit=true. ` +
  `availableImages=기존 figma-export/images/*.png 목록. ` +
  `rateLimitHit + designContext + metadata + variables + availableImages[] 반환.`,
  { label: 'fetch:mcp', phase: 'Fetch', schema: FIGMA_MCP_SCHEMA }
)
log(`[Fetch MCP] rateLimitHit=${figmaMcpResult?.rateLimitHit} images=${figmaMcpResult?.availableImages?.length}개`)

// ── Step 3: Fallback ──────────────────────────────────────────────────────────
let tokenSource
if (!figmaMcpResult?.rateLimitHit) {
  tokenSource = { ...figmaMcpResult, source: 'figma-mcp' }
  log('[Fallback] Figma MCP 성공 — Vision 폴백 불필요')
} else {
  phase('Fallback')
  log('[Fallback] Figma MCP rate limit → Codex Vision 시도')
  const codexFallback = await agent(
    `figma-design-sync Step 3A Codex Vision 폴백. ` +
    `기존 PNG: ${JSON.stringify(figmaMcpResult?.availableImages?.slice(0, 5))}. ` +
    `Codex Vision으로 PNG 재분석: colorPalette[] + typography{} + spacing + borderRadius + components[]. ` +
    `references/fallback-vision.md 참조. source="codex-vision" + 토큰 값들 반환.`,
    { label: 'fallback:codex', phase: 'Fallback', schema: VISION_FALLBACK_SCHEMA, agentType: 'codex-critic' }
  )
  if (codexFallback && codexFallback.colorPalette?.length > 0) {
    tokenSource = codexFallback
    log(`[Fallback] Codex Vision 성공 — source=codex-vision`)
  } else {
    log('[Fallback] Codex Vision 실패 → Gemini Vision 2차 폴백')
    // Gemini Vision 2차 폴백 (외부 토큰 선발행 전제)
    const geminiFallback = await agent(
      `figma-design-sync Step 3B Gemini Vision 2차 폴백. ` +
      `PNG: ${JSON.stringify(figmaMcpResult?.availableImages?.slice(0, 5))}. ` +
      `Gemini Vision으로 PNG 재분석: colorPalette[] + typography{} + spacing + borderRadius + components[]. ` +
      `source="gemini-vision" + 토큰 값들 반환.`,
      { label: 'fallback:gemini', phase: 'Fallback', schema: VISION_FALLBACK_SCHEMA, agentType: 'gemini' }
    )
    tokenSource = geminiFallback || { source: 'fallback-failed', summary: 'All fallbacks failed', colorPalette: [] }
    log(`[Fallback] Gemini Vision ${tokenSource?.colorPalette?.length > 0 ? '성공' : '실패'}`)
  }
}

// root-cause: Codex HIGH — 외부 토큰 없을 때 fallback 실패 후 빈 결과로 계속 진행. fail-closed 필수.
if (tokenSource?.source === 'fallback-failed') {
  log('[STOP] Figma MCP rate limit + Codex/Gemini 폴백 실패. 외부 토큰 선발행 없이 진행 불가.')
  return {
    error: 'all-fallbacks-failed',
    note: 'Figma MCP 한도 초과. approve-worker로 Codex/Gemini 토큰 선발행 필요. ~/forge/.claude/prompts/approve-worker-presign.md 참조',
  }
}

// ── Step 4~6: Map + Save ──────────────────────────────────────────────────────
phase('Map')
const updateResult = await agent(
  `figma-design-sync Step 4~6 토큰 매핑 + 저장. ` +
  `소스: ${tokenSource?.source}. docPath="${docPath}". brandRules="${brandRules}". ` +
  `토큰 데이터: ${JSON.stringify(tokenSource)}. ` +
  `Step4 토큰 매핑(Figma변수명→CSS변수/tailwind/MD 형식). ` +
  `Step5 figma-export/variables.json 저장(원본 variables: ${JSON.stringify(figmaMcpResult?.variables || {})}). ` +
  `Step6 figma-export/ANALYSIS-REPORT.md 갱신(실측+diff). ` +
  `variablesJsonPath + analysisReportPath 반환.`,
  { label: 'map:tokens', phase: 'Map', schema: UPDATE_SCHEMA }
)

// ── Step 7~9: Update ──────────────────────────────────────────────────────────
phase('Update')
const finalResult = await agent(
  `figma-design-sync Step 7~9 CLAUDE-DESIGN-PROMPTS.md 갱신. ` +
  `tokenSource=${tokenSource?.source}. docPath="${docPath}". ` +
  `ANALYSIS-REPORT: ${updateResult?.analysisReportPath}. ` +
  `Step7 CLAUDE-DESIGN-PROMPTS.md 토큰 갱신(colorPalette/typography/spacing/borderRadius). ` +
  `Step8 brandRules="${brandRules}" 적용(색상명 정정·폰트 교체). ` +
  `Step9 변경 요약 보고(변경 전/후 diff + source 명시). ` +
  `designPromptsPath + changesCount + summary 반환.`,
  { label: 'update:prompts', phase: 'Update', schema: UPDATE_SCHEMA }
)
log(`[Update] changes=${finalResult?.changesCount}건 source=${tokenSource?.source}`)

return {
  source: tokenSource?.source,
  rateLimitHit: figmaMcpResult?.rateLimitHit,
  variablesJsonPath: updateResult?.variablesJsonPath,
  analysisReportPath: updateResult?.analysisReportPath,
  designPromptsPath: finalResult?.designPromptsPath,
  changesCount: finalResult?.changesCount,
}
