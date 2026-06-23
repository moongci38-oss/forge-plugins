export const meta = {
  name: 'external-harness-sweep',
  description: '외부 하네스 레포 전수 enumerate → 각 항목 Forge 1:1 소스대조 + 도입판정 + 적대 refute(non-SKIP) → 채택 매트릭스. yt/article 1차분석을 seed claim으로 가속하되 소스검증은 항상 fresh clone.',
  phases: [
    { title: 'Scout', detail: 'seed(yt/article 1차분석) 탐지 → claim 가설 추출(가속). 없으면 skip.' },
    { title: 'Inventory', detail: '외부 레포 fresh clone + 전체 항목 enumerate / Forge 자산 인벤토리' },
    { title: 'Compare', detail: '각 항목 Forge 1:1 소스대조 + 판정' },
    { title: 'Refute', detail: 'non-SKIP 결정 적대 검증' },
    { title: 'Synthesize', detail: '채택 매트릭스 + 로드맵 + 신규발견 + 내부버그 + seed 대비 변화' },
  ],
}

// root-cause: 2026-06-21 사용자 정정 — Forge는 3인 전용 아님(SME, 5인+ 확장). 고정 인원 절대기준 폐기.
// 중소규모 조직(SME) · 코어 현 3명, 5인 이상 확장 전제(탄력) · 멀티세션.
// 내부도구 ROI 관점(과대엔지니어링 경계 유지, 분산시스템 정답 ≠ SME 정답).
const ROI_CONTEXT = '중소규모 조직(SME, 5인+ 확장 전제) · 멀티세션 · 내부도구 ROI 관점(과대엔지니어링 경계 유지, 고정 인원 절대기준 아님)'

const URL = args?.target_url
if (!URL) throw new Error('args.target_url 필수 (git clone 대상 외부 레포 URL)')
const NAME = (args?.target_name || String(URL).replace(/\/+$/, '').split('/').pop() || 'external').replace(/[^A-Za-z0-9._-]/g, '-')
const SRC = `/tmp/ehs-${NAME}-src`
const SEED_PATH = args?.seed_path || ''
const DEPTH = 'exhaustive'

const SCOUT = {
  type: 'object', additionalProperties: false,
  properties: {
    seed_found: { type: 'boolean' },
    seed_source: { type: 'string', description: '사용한 seed 파일 경로 또는 "none"' },
    claims: { type: 'array', items: { type: 'string' }, description: '1차분석에서 추출한 검증대상 가설(확정사실 아님). 없으면 빈 배열.' },
  },
  required: ['seed_found', 'seed_source', 'claims'],
}

const INV = {
  type: 'object', additionalProperties: false,
  properties: {
    skills: { type: 'array', items: { type: 'string' }, description: 'SKILL.md 가진 모든 디렉토리명' },
    bin_tools: { type: 'array', items: { type: 'string' }, description: 'bin/ 의미있는 CLI 도구명' },
  },
  required: ['skills', 'bin_tools'],
}

const VERDICT = {
  type: 'object', additionalProperties: false,
  properties: {
    item: { type: 'string' },
    external_role: { type: 'string', description: '외부 항목 실제 기능 1-2줄 (file 근거)' },
    forge_match: { type: 'string', description: 'Forge 동등물 or 부재 (path 근거)' },
    mapping: { type: 'string', enum: ['accurate', 'imprecise', 'wrong', 'na'] },
    gap_type: { type: 'string', enum: ['forge-equivalent', 'forge-superior', 'forge-lacks', 'external-only', 'mac-only', 'phantom'] },
    decision: { type: 'string', enum: ['ADOPT', 'ADAPT', 'DEFER', 'SKIP'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence: { type: 'string' },
  },
  required: ['item', 'external_role', 'forge_match', 'mapping', 'gap_type', 'decision', 'confidence', 'evidence'],
}

const REFUTE = {
  type: 'object', additionalProperties: false,
  properties: {
    item: { type: 'string' }, holds: { type: 'boolean' }, note: { type: 'string' },
  },
  required: ['item', 'holds', 'note'],
}

const SYNTH = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    counts: { type: 'object', additionalProperties: false, properties: { adopt: { type: 'number' }, adapt: { type: 'number' }, defer: { type: 'number' }, skip: { type: 'number' }, total: { type: 'number' } }, required: ['adopt', 'adapt', 'defer', 'skip', 'total'] },
    adapt_roadmap: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { item: { type: 'string' }, rationale: { type: 'string' }, priority: { type: 'string' } }, required: ['item', 'rationale', 'priority'] } },
    notable_new_findings: { type: 'array', items: { type: 'string' }, description: 'seed/1차분석에 없던 신규 발견(전수에서만 드러난 것)' },
    forge_internal_findings: { type: 'array', items: { type: 'string' }, description: '검증 중 발견된 Forge 자체 버그/gap' },
    seed_delta: { type: 'string', description: 'seed claim 대비 무엇이 확인/뒤집힘. seed 없으면 "no-seed".' },
    low_conf: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'counts', 'adapt_roadmap', 'notable_new_findings', 'forge_internal_findings', 'seed_delta', 'low_conf'],
}

log(`sweep 시작 — target=${NAME} (${URL}), depth=${DEPTH}`)
phase('Scout')
const scout = await agent(
  `외부 하네스 "${NAME}" 분석을 위한 1차분석 seed(yt/article 결과)를 탐지하라(read-only).\n\n` +
  (SEED_PATH
    ? `1. **명시된 seed 경로 우선 사용**: \`${SEED_PATH}\` read. 존재하면 거기서 claim 추출.\n`
    : `1. **--seed 미지정 → 자동탐지(best-effort)**: 아래 위치에서 "${NAME}" 관련 1차분석 md를 glob:\n` +
      `   - \`forge-outputs/01-research/videos/analyses/*${NAME}*\`\n` +
      `   - \`forge-outputs/01-research/articles/*${NAME}*\`\n` +
      `   - \`forge-outputs/docs/reviews/**/*${NAME}*\`\n` +
      `   가장 관련 높은 1개를 read.\n`) +
  `2. 발견 시: 그 문서에서 "이 외부 도구가 Forge보다 낫다/없다/동등하다" 류의 **검증대상 가설(claim)** 목록을 추출. 이건 확정사실이 아니라 Phase 2/3에서 fresh source로 검증할 가설이다.\n` +
  `3. 자동탐지/지정 경로 모두 실패 = 정상. seed_found=false, claims=[], seed_source="none" 반환(에러 아님).`,
  { label: `scout:${NAME}`, phase: 'Scout', schema: SCOUT, model: 'sonnet' }
)
const seedClaims = scout?.claims || []
const seedLine = scout?.seed_found
  ? `seed 발견(${scout.seed_source}) — claim 가설 ${seedClaims.length}개. **가설일 뿐, fresh source로 검증.**`
  : 'seed 없음 — Inventory가 전수 enumerate.'
log(seedLine)

phase('Inventory')
const [inv, forgeInv] = await parallel([
  () => agent(
    `외부 레포 "${NAME}" 전체 항목을 enumerate하라. **fresh clone 필수**: \`rm -rf ${SRC} && git clone --depth 1 ${URL} ${SRC}\` (1차분석/seed를 정답으로 신뢰 금지 — 항상 최신 소스 대조).\n` +
    `1. SKILL.md(또는 동급 진입점: skill.md/README in skill dir) 가진 모든 최상위 디렉토리명 전부. **누락 없이 전부.**\n` +
    `2. bin/ 의미있는 CLI 도구명 (단순 헬퍼 제외, 기능 도구만). bin/ 없으면 빈 배열.\n` +
    `정확한 전체 목록 반환. 이게 fan-out 대상이므로 누락=치명적.`,
    { label: `inv:${NAME}-all`, phase: 'Inventory', schema: INV, model: 'sonnet' }
  ),
  () => agent(
    `Forge 자산 전체 인벤토리(read-only, 대조용). ~/.claude/skills/(전체 ls) + ~/forge/.claude/agents/ + ~/forge/.claude/commands/ + ~/.claude/hooks/ + ~/forge/pipeline.md + ~/.claude/rules-on-demand/(목록).\n` +
    `각 스킬/에이전트/훅의 이름 + 1줄 역할. 외부 항목과 매칭에 쓸 수 있게 도메인별 정리. 구조화 텍스트.`,
    { label: 'inv:forge-all', phase: 'Inventory', model: 'sonnet' }
  ),
])

const items = [...(inv?.skills || []), ...(inv?.bin_tools || []).map((t) => `bin:${t}`)]
log(`enumerate 완료 — ${NAME} 항목 ${items.length}개 (skills ${inv?.skills?.length || 0} + bin ${inv?.bin_tools?.length || 0})`)
if (!items.length) throw new Error(`Inventory 0건 — clone 실패 또는 SKILL.md 구조 아님(${URL}). Phase 중단.`)

const seedHint = seedClaims.length ? `\nseed 가설(검증대상, 확정아님):\n- ${seedClaims.slice(0, 20).join('\n- ')}` : ''
phase('Compare')
const results = await pipeline(
  items,
  (it) => agent(
    `외부 항목 "${it}"을 Forge와 1:1 소스 대조하라(read-only).\n\n` +
    `1. 외부측: ${SRC}/${it.startsWith('bin:') ? 'bin/' + it.slice(4) : it + '/SKILL.md'} read (+관련 소스). 실제 기능 파악(file 근거). **fresh clone된 ${SRC} 사용 — seed/1차분석 신뢰 금지.**\n` +
    `2. Forge측: ~/.claude/skills/ ~/forge/.claude/{agents,commands,hooks} grep/read로 동등물 탐색. 있으면 path, 없으면 부재 확정.\n` +
    `3. 판정: mapping / gap_type(forge-equivalent=Forge 동등 / forge-superior=Forge가 더 강함 / forge-lacks=진짜 부재 / external-only=외부제품 / mac-only / phantom) / decision(${ROI_CONTEXT}: ADOPT 통째도입 / ADAPT 경량차용 / DEFER 보류 / SKIP) / confidence / evidence(양측 path:line).${seedHint}\n` +
    `Forge 인벤토리 참고:\n${String(forgeInv).slice(0, 2200)}`,
    { label: `cmp:${it}`, phase: 'Compare', schema: VERDICT, model: 'sonnet' }
  ),
  (v, it) => {
    if (!v) return null
    if (v.decision === 'SKIP') return { ...v, refute: { item: it, holds: true, note: 'SKIP(forge-equivalent/superior/external) — refute 생략' } }
    return agent(
      `적대 검증: "${it}" 결정이 ${ROI_CONTEXT}에 타당한가. 기본가정=틀림.\n` +
      `외부: ${v.external_role}\nForge: ${v.forge_match}\n결정: ${v.decision}(gap=${v.gap_type})\n` +
      `(1) ADOPT/ADAPT면 기존 Forge 자산과 중복(over-engineering)? (2) DEFER가 실은 SKIP이어야? (3) ROI(${ROI_CONTEXT}) 맞나? holds=유지타당 / false=뒤집기.`,
      { label: `ref:${it}`, phase: 'Refute', schema: REFUTE, model: 'sonnet' }
    ).then((r) => ({ ...v, refute: r }))
  }
)

phase('Synthesize')
const clean = results.filter(Boolean)
const compact = clean.map((v) => ({
  item: v.item, mapping: v.mapping, gap: v.gap_type, decision: v.decision, conf: v.confidence,
  g: String(v.external_role || '').slice(0, 160), f: String(v.forge_match || '').slice(0, 160),
  rh: v.refute && v.refute.holds, rn: String((v.refute && v.refute.note) || '').slice(0, 140),
}))
const synthesis = await agent(
  `외부 하네스 "${NAME}" **전체 ${clean.length}개 항목** 전수 Forge 대조 결과(compact JSON 전부)를 종합하라.\n\n` +
  `${JSON.stringify(compact, null, 0).slice(0, 40000)}\n\n` +
  (seedClaims.length ? `seed 가설(검증대상이었음):\n- ${seedClaims.slice(0, 20).join('\n- ')}\n\n` : 'seed 없음(전수 enumerate).\n\n') +
  `산출(전 항목 반영):\n` +
  `1. summary: 전수 결론.\n` +
  `2. counts: adopt/adapt/defer/skip/total.\n` +
  `3. adapt_roadmap: ADOPT+ADAPT 항목만(item/rationale/priority). refute holds=false면 조정.\n` +
  `4. notable_new_findings: seed/1차분석에 **없던** 신규 발견(전수에서만 드러난 항목).\n` +
  `5. forge_internal_findings: 검증 중 발견된 Forge 자체 버그/gap.\n` +
  `6. seed_delta: seed claim 대비 무엇이 확인/뒤집혔나(seed 없으면 "no-seed").\n` +
  `7. low_conf: 저신뢰/미검증.\n` +
  `증거기반·냉정·YAGNI(${ROI_CONTEXT}).`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTH, model: 'opus' }
)

return {
  target: { name: NAME, url: URL, depth: DEPTH },
  seed: { found: !!scout?.seed_found, source: scout?.seed_source || 'none', claims: seedClaims },
  total_items: clean.length,
  all_verdicts: compact,
  synthesis,
}
