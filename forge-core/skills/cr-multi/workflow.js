// root-cause: approve-worker 수동 발행 + 컨텍스트 누적 → Workflow 격리. 계획서 P0-4.
// cr-multi workflow.js — GitNexus StructuralContext + 3-LLM parallel()
// ⚠️ mcp__codex__/mcp__gemini__ 토큰 = Workflow 외부 선발행 필수 (SKILL.md Phase 0 참조)
export const meta = {
  name: 'cr-multi',
  description: 'Claude(Opus)+Codex(GPT-5.5)+Gemini 3-LLM 병렬 검수 + GitNexus 구조 컨텍스트',
  phases: [
    { title: 'StructuralContext', detail: 'GitNexus 변경 심볼 + 영향도 분석 (approve-worker 불필요)' },
    { title: 'Review', detail: '3-LLM parallel() — 외부 토큰 선발행 전제' },
    { title: 'Triage', detail: 'opus×0.3 + codex×0.4 + gemini×0.3 + plateau 감지' },
  ],
}

const REVIEW_SCHEMA = {
  type: 'object',
  // root-cause: A-2 Codex MED — additionalProperties:false 미선언 시 미선언 필드 수용 → 스키마 오염
  additionalProperties: false,
  properties: {
    score: { type: 'number' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        // root-cause: A-2 additionalProperties:false (item 레벨)
        additionalProperties: false,
        properties: {
          category: { type: 'string' },
          severity: { type: 'string', enum: ['critical','high','medium','low'] },
          description: { type: 'string' },
          // root-cause: A-1 Codex MED — location-grounded finding 없어 downstream dedup 약화
          file: { type: 'string' },
          line: { type: 'number' },
          evidence: { type: 'string' },
        },
        required: ['category','severity','description'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['score','issues','summary'],
}

const STRUCTURAL_SCHEMA = {
  type: 'object',
  properties: {
    changed_symbols: { type: 'array', items: { type: 'string' } },
    risk_level: { type: 'string', enum: ['LOW','MEDIUM','HIGH','CRITICAL'] },
    // root-cause: A-3 Codex LOW — affected_processes optional 유지 (gitnexus 미연결 허용, best-effort)
    affected_processes: { type: 'array', items: { type: 'string' } },
    stale_warning: { type: 'boolean' },
    error: { type: 'string' },  // gitnexus 오류 메시지 캡처
  },
  required: ['changed_symbols','risk_level'],
}

// args = { slug, targetPath, mode: 'triple'|'double', prevScore, stage }
const stage = args?.stage || 'code'
const reqMode = args?.mode || 'triple'
// root-cause: C-1 b2-corrected — Gemini analyze_media=미디어전용, 코드/텍스트 리뷰 불가.
//   기존 b2 버그: 'double'(=Codex+Gemini)로 강등 → 쓸모없는 Gemini 유지 + 유용한 Opus 드롭 (정반대).
//   정정: 텍스트 stage = Opus+Codex 2-worker (Gemini만 드롭). 'double'과 다른 'code-pair' 모드.
const TEXT_STAGES = ['code', 'test', 'plan', 'final', 'bugfix']
const codeReview = (reqMode === 'triple' && TEXT_STAGES.includes(stage))
const mode = codeReview ? 'code-pair' : reqMode
if (codeReview) log(`[INFO] stage=${stage} → Gemini 코드리뷰 불가 → Opus+Codex 2-worker (Gemini 드롭)`)
const slug = args?.slug || 'cr'
const targetPath = args?.targetPath || ''

// ── Phase 0: StructuralContext (GitNexus — approve-worker 불필요) ─────────────
phase('StructuralContext')
// root-cause: Codex MED — Phase 0는 보조 컨텍스트. agent 실패가 전체 워크플로 abort 금지 → try/catch best-effort.
let structuralCtx = null
try {
  structuralCtx = await agent(
    `gitnexus-pr-review 스킬 실행 (approve-worker 불필요 — LLM worker 아님).
     1. mcp__gitnexus__list_repos 로 인덱스 신선도 확인 (7일+ stale = 경고)
     2. mcp__gitnexus__detect_changes({scope: "unstaged"}) → 변경 심볼 목록
     3. 변경 심볼 각각 mcp__gitnexus__impact({direction: "upstream", maxDepth: 2})
     대상: ${targetPath || '현재 staged/unstaged 변경'}
     결과: changed_symbols, risk_level (LOW/MEDIUM/HIGH/CRITICAL), affected_processes 반환.`,
    { label: 'gitnexus-ctx', phase: 'StructuralContext', schema: STRUCTURAL_SCHEMA }
  )
} catch (e) {
  log(`[WARN] GitNexus 구조 분석 실패 (보조 컨텍스트 — 리뷰 계속): ${e?.message || e}`)
}
log(`GitNexus: risk=${structuralCtx?.risk_level || 'N/A'} symbols=${structuralCtx?.changed_symbols?.length||0}`)
if (structuralCtx?.stale_warning) log('[WARN] GitNexus 인덱스 7일+ stale — 결과 신뢰도 낮음')

const structuralNote = structuralCtx
  ? `\n\n[GitNexus 구조 분석 (stage=${stage})]\n` +
    `risk=${structuralCtx.risk_level} changed_symbols=${JSON.stringify(structuralCtx.changed_symbols||[])}\n` +
    `affected_processes=${JSON.stringify(structuralCtx.affected_processes||[])}`
  : ''

// ── Phase 1: Review (3-LLM parallel — 외부 토큰 선발행 전제) ─────────────────
phase('Review')
const basePrompt = `코드 리뷰 대상: ${targetPath}. stage=${stage}. ` +
  `점수 0-100, issues(category/severity/description 배열), summary 반환.` + structuralNote

// root-cause: C-1 b2-corrected — worker 구성 3분기. opus/codex/gemini 함수 재사용.
const wOpus = () => agent(`[Opus] intent/architecture/goal-coverage 중점. ${basePrompt}`,
  { label: 'opus-review', phase: 'Review', schema: REVIEW_SCHEMA })
const wCodex = () => agent(`[Codex] security/logic/test/YAGNI 중점. adversarial. ${basePrompt}`,
  { label: 'codex-review', phase: 'Review', schema: REVIEW_SCHEMA, agentType: 'codex-critic' })
const wGemini = () => agent(`[Gemini] label-drift/cross-ref/naming 중점. ${basePrompt}`,
  { label: 'gemini-review', phase: 'Review', schema: REVIEW_SCHEMA, agentType: 'gemini' })
const workers = mode === 'triple' ? [wOpus, wCodex, wGemini]
  : mode === 'code-pair' ? [wOpus, wCodex]   // 텍스트 stage: Gemini 드롭, Opus+Codex
  : [wCodex, wGemini]                          // double: Codex+Gemini

const results = (await parallel(workers)).filter(Boolean)

// ── Phase 2: Triage ───────────────────────────────────────────────────────────
phase('Triage')
// root-cause: Codex HIGH — score 무경계 → clamp 0-100 (threshold 왜곡 방지)
const clamp = s => Math.max(0, Math.min(100, Number(s) || 0))
const scores = results.map(r => clamp(r.score))
const expected = mode === 'triple' ? 3 : 2

// root-cause: Codex HIGH — triple→2 생존 시 double 가중 오적용(opus가 codex 몫) + silent degradation.
//   degraded(생존<expected) 시 가중합산 금지 → identity 소실이므로 균등 평균 + WARN. quorum<2 = FAIL.
let combined, degraded = false
if (mode === 'triple' && results.length === 3) {
  combined = scores[0] * 0.3 + scores[1] * 0.4 + scores[2] * 0.3
} else if (mode === 'code-pair' && results.length === 2) {
  // root-cause: C-1 b2-corrected — Opus+Codex 코드검수. codex adversarial 가중 (opus0.4 + codex0.6)
  combined = scores[0] * 0.4 + scores[1] * 0.6
} else if (mode === 'double' && results.length === 2) {
  combined = scores[0] * 0.6 + scores[1] * 0.4
} else if (results.length >= 2) {
  degraded = true
  combined = scores.reduce((a, b) => a + b, 0) / scores.length  // identity 소실 → 균등 평균
  log(`[WARN] ${mode} degraded: ${results.length}/${expected} worker 생존 (Gemini 코드리뷰 제약 등) — 가중합산 대신 균등평균`)
} else {
  degraded = true
  combined = scores[0] || 0
  log(`[WARN] 정족수 미달: ${results.length}/${expected} worker — 검증 신뢰도 낮음`)
}

// root-cause: Codex MED — high severity도 verdict 반영 (adversarial 게이트 일관성). quorum<2=FAIL.
const hasCrit = results.some(r => r.issues?.some(i => i.severity === 'critical'))
const hasHigh = results.some(r => r.issues?.some(i => i.severity === 'high'))
const quorumFail = results.length < 2
let verdict
if (hasCrit || quorumFail) verdict = 'FAIL'
else if (combined >= 80 && !hasHigh) verdict = 'PASS'  // high 잔존 시 PASS 차단 → WARN
else if (combined >= 60) verdict = 'WARN'
else verdict = 'FAIL'
log(`Triage: ${mode} scores=${JSON.stringify(scores)} combined=${combined.toFixed(1)}${degraded ? ' (degraded)' : ''} → ${verdict}`)

// Plateau 감지 (AD-118 SkillOps) — root-cause: Codex LOW, regression(음수)은 별도 표기
if (args?.prevScore !== undefined) {
  const delta = combined - args.prevScore
  if (delta < 0) log(`[REGRESSION] ${delta.toFixed(1)}pt 역행 — oscillation 의심, AD-50 override 검토`)
  else if (delta < 5) log(`[PLATEAU] +${delta.toFixed(1)}pt — 옵션: A 추가라운드 / B AD-50 override / C 폐기 / D 극단 단순화`)
}

return {
  slug, mode,
  combined: parseFloat(combined.toFixed(1)),
  verdict, scores, hasCrit, hasHigh, degraded, quorumFail,
  structuralRisk: structuralCtx?.risk_level,
  results,
}
