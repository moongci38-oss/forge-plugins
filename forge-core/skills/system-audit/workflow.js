// root-cause: 5축 순차 → 6축(+Redundancy) parallel + 3-LLM adversarial verify
export const meta = {
  name: 'system-audit',
  description: 'Forge 6축(ACHCE+Redundancy) 통합 감사 + 3-LLM adversarial 검증',
  phases: [
    { title: 'Audit', detail: '6축 parallel() 동시 실행 (axis-* 5개 + Redundancy)' },
    { title: 'Synthesize', detail: 'Lead 종합 + 축간 트레이드오프 + 로드맵' },
    { title: 'Verify', detail: '3-LLM adversarial (Claude + Codex + Gemini) 2/3 합의' },
    { title: 'Report', detail: '검증 통과 발견 기반 최종 보고서 저장' },
  ],
}

const AXIS_SCHEMA = {
  type: 'object',
  properties: {
    axis: { type: 'string' },
    // root-cause: B-4 Codex LOW — score 0-100 범위 미강제 → 이상 점수 수용
    score: { type: 'number', minimum: 0, maximum: 100 },
    maturity: { type: 'string', enum: ['L1','L2','L3','L4','L5'] },
    findings: { type: 'array', items: { type: 'string' } },
    top_recommendation: { type: 'string' },
  },
  // root-cause: B-4 top_recommendation required 추가 (프롬프트 요구사항 스키마 반영)
  required: ['axis','score','maturity','findings','top_recommendation'],
}

const REDUNDANCY_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['skill_duplicate','orphan_agent','deprecated','hook_theater','rule_overlap'] },
          names: { type: 'array', items: { type: 'string' } },
          recommendation: { type: 'string', enum: ['merge','archive','remove','keep'] },
          risk: { type: 'string', enum: ['low','medium','high'] },
          reason: { type: 'string' },
        },
        required: ['type','names','recommendation','risk','reason'],
      },
    },
    summary: {
      type: 'object',
      properties: {
        duplicates: { type: 'number' },
        orphans: { type: 'number' },
        deprecated: { type: 'number' },
        theater_hooks: { type: 'number' },
        // root-cause: B-5 Codex LOW — items엔 rule_overlap type 존재하나 summary 누락 → 집계 불가
        rule_overlap: { type: 'number' },
      },
      required: ['duplicates','orphans','deprecated','theater_hooks','rule_overlap'],
    },
  },
  required: ['items','summary'],
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    overall: { type: 'number' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          axis: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL','HIGH','MEDIUM','LOW'] },
          message: { type: 'string' },
          recommendation: { type: 'string' },
          type: { type: 'string' },
        },
        required: ['id','axis','severity','message','recommendation'],
      },
    },
    tradeoffs: { type: 'array', items: { type: 'string' } },
    roadmap_p0: { type: 'array', items: { type: 'string' } },
    roadmap_p1: { type: 'array', items: { type: 'string' } },
    roadmap_p2: { type: 'array', items: { type: 'string' } },
  },
  required: ['overall','findings'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    confirmed_finding_ids: { type: 'array', items: { type: 'string' } },
    disputed: { type: 'array', items: { type: 'string' } },
    // root-cause: B-3 Codex MED — additions free-form string → 출처/심각도 없어 known-id 필터 불가
    additions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          finding_id: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL','HIGH','MEDIUM','LOW'] },
          source_verifier: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['severity','source_verifier','message'],
      },
    },
  },
  required: ['confirmed_finding_ids','disputed'],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args

const projectRoot = _a?.projectRoot || '.'
// root-cause: B-6 Codex LOW — 'today' 리터럴 → 보고서 경로 충돌
if (!_a?.date) log("[WARN] args.date 미전달 — 보고서 경로 'unknown-date' 사용. SKILL.md presign 블록에서 date 주입 권고.")
const auditDate = _a?.date || 'unknown-date'
// crMode gate: 기본 degrade (Codex-off fail-safe; --cr on 으로 강제); 'on' → Codex spawn; 'degrade'|'off' → skip Codex, degrade to 2-LLM
// root-cause: crMode default flip 'on'→'degrade' (fail-safe Codex-off, 2026-06-15)
const crMode = _a?.crMode ?? 'degrade'

// ── P1 turn-budget-aware guard ────────────────────────────────────────────────
// root-cause: F2 — AUDIT_TOKEN_CAP renamed to BUDGET_RESERVE (no semantic collision with
// prose skill AUDIT_TOKEN_CAP usage-cap). budget.remaining() = turn-target remaining
// (Infinity when no turn-budget set), NOT per-skill consumption. Guard is only active
// when caller sets an explicit turn token target (budget.total is set). PRIMARY bound
// = wave/cycle structure already present; this is a supplementary turn-budget-aware stop.
// root-cause: Workflow 샌드박스는 process 전역 미접근(process is not defined) → 기동 즉시 throw.
//   이전 process.env.BUDGET_RESERVE는 Workflow 경유 실행을 항상 실패시켰다(가드 도입 후 전량 fork 폴백).
//   → args.budgetReserve 주입 방식으로 교체(미주입 시 기본 300000 동일).
const BUDGET_RESERVE = parseInt(_a?.budgetReserve || '300000')
function checkBudget(phase) {
  // Only trip when the user has actually set a turn token target (budget.total is set).
  if (budget.total && budget.remaining() < BUDGET_RESERVE) {
    log(`[STOP] turn-budget-aware early-stop: budget.remaining() < BUDGET_RESERVE=${BUDGET_RESERVE} at ${phase} — 재감사 중단. 현재 결과로 보고서 작성.`)
    return false
  }
  log(`[INFO] budget.remaining()=${budget.remaining()} (reserve=${BUDGET_RESERVE}, active=${!!budget.total}) — ${phase} 진행`)
  return true
}

const basePrompt = (axis) =>
  `${axis} 축 감사. 프로젝트: ${projectRoot}. ` +
  `점수 0-100, maturity L1~L5, findings 목록, top_recommendation 반환.`

// root-cause: P0-3 GitNexus 구조 분석 → harness 축 hook 커버리지 보강
const harnessPrompt =
  basePrompt('Harness (평가체계·가드레일·옵저버빌리티)') +
  ` 추가로 GitNexus 구조 분석 수행:
  1. READ gitnexus://repo/forge/context → 인덱스 신선도 확인
  2. gitnexus_query({query: "hook coverage audit"}) → Hook 관련 심볼 목록
  3. gitnexus_impact({target: "settings", direction: "upstream"}) → settings 의존성 체인
  GitNexus 미연결 시 스킵 (경고만). 결과를 findings에 포함.`

const redundancyPrompt =
  `Forge 시스템 중복/불필요 기능 탐지. Bash 도구 사용 가능.

1. 스킬 중복 탐지:
   ls ~/.claude/skills/ | sort → 전체 스킬 목록
   grep -rl "DEPRECATED\\|ARCHIVED\\|OOS" ~/.claude/skills/*/SKILL.md 2>/dev/null
   유사 목적 스킬 그룹핑 (이름/설명 기반)

2. Orphan 에이전트:
   ls ~/forge/.claude/agents/ → 정의된 에이전트
   각 에이전트명으로 스킬 내 실제 호출 grep
   호출 없음 = orphan

3. 미사용 스킬:
   find ~/.claude/skills -name "eval_cases.jsonl" -empty → 0건
   grep -r "eval_cases.jsonl" ~/.claude/skills 2>/dev/null | wc -l

4. Hook 중복/theater:
   grep -l "exit 0$" ~/.claude/hooks/*.sh 2>/dev/null → 항상 통과 hook
   동일 목적 hook 중복 확인 (asi-*.sh 개별 vs 메가훅)

5. 규칙 중복:
   ls ~/.claude/rules/ ~/.claude/rules-on-demand/ 2>/dev/null
   제목/목적 유사 파일 매칭

위 탐지 결과를 REDUNDANCY_SCHEMA 형식으로 반환.`

// ── Phase 1: Audit (6축 parallel()) ──────────────────────────────────────────
phase('Audit')
const [agentic, context, harness, cost, humanAi, redundancy] = await parallel([
  () => agent(basePrompt('Agentic (자율성·도구·멀티에이전트)'),
    { label: 'axis-agentic', phase: 'Audit', schema: AXIS_SCHEMA, agentType: 'axis-agentic' }),
  () => agent(basePrompt('Context (RAG·메모리·컨텍스트 윈도우)'),
    { label: 'axis-context', phase: 'Audit', schema: AXIS_SCHEMA, agentType: 'axis-context' }),
  // root-cause: P0-3 harnessPrompt로 교체 (GitNexus 통합)
  () => agent(harnessPrompt,
    { label: 'axis-harness', phase: 'Audit', schema: AXIS_SCHEMA, agentType: 'axis-harness' }),
  () => agent(basePrompt('Cost (토큰경제학·모델라우팅·캐싱)'),
    { label: 'axis-cost', phase: 'Audit', schema: AXIS_SCHEMA, agentType: 'axis-cost' }),
  () => agent(basePrompt('Human-AI (자율성 레벨·에스컬레이션·게이트)'),
    { label: 'axis-human-ai', phase: 'Audit', schema: AXIS_SCHEMA, agentType: 'axis-human-ai' }),
  () => agent(redundancyPrompt,
    { label: 'redundancy', phase: 'Audit', schema: REDUNDANCY_SCHEMA }),
])

const axes = [agentic, context, harness, cost, humanAi].filter(Boolean)
// root-cause: B-2 Codex MED — 전 axis 실패 시 avgScore=0으로 synthesize 진행 → 잘못된 보고서 생성
if (axes.length === 0) {
  log('[FAIL] 전 axis 실패 — 감사 중단')
  return { error: 'all_axes_failed' }
}
// root-cause: B-1 Codex MED — filter(Boolean) 분모 변동으로 부분 감사 은폐
if (axes.length < 5) log(`[WARN] axis ${axes.length}/5 — 부분 감사, 커버리지 저하`)
const scores = axes.map(a => a.score)
const avgScore = scores.reduce((s, n) => s + n, 0) / (scores.length || 1)
log(`Audit: scores=${JSON.stringify(scores)} avg=${avgScore.toFixed(1)}`)
if (redundancy) {
  const s = redundancy.summary
  log(`Redundancy: ${redundancy.items?.length || 0}건 (dup=${s.duplicates} orphan=${s.orphans} deprecated=${s.deprecated} theater=${s.theater_hooks})`)
}

// ── Phase 2: Synthesize ───────────────────────────────────────────────────────
phase('Synthesize')
const synthesis = await agent(
  `ACHCE 6축(+Redundancy) 종합. avg=${avgScore.toFixed(1)}. ` +
  `축간 트레이드오프 + 통합 개선 로드맵 P0/P1/P2 구분. ` +
  `scores: ${JSON.stringify(axes.map(a => ({ axis: a.axis, score: a.score, maturity: a.maturity })))}. ` +
  `redundancy_summary: ${JSON.stringify(redundancy?.summary)}. ` +
  `각 finding에 고유 id(예: A-01, C-01, R-01) 부여.`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTHESIS_SCHEMA }
)
// root-cause: Codex MED — synthesize 실패 시 null deref 크래시 방지 (감사 작업 후 controlled fail)
if (!synthesis || synthesis.overall == null) {
  log('[FAIL] Synthesize 실패 (null) — 감사 중단')
  return { error: 'synthesize_failed', avgScore: parseFloat(avgScore.toFixed(1)), axes: axes.map(a => ({ axis: a.axis, score: a.score })) }
}
log(`Synthesize: overall=${synthesis.overall} findings=${synthesis.findings?.length}`)

// ── Phase 3: Verify (3-LLM adversarial, 2/3 합의) ────────────────────────────
// root-cause: F2 updated comment — guard is turn-budget-aware (only active under explicit
// turn token target). PRIMARY bound = wave/cycle structure; this is supplementary.
if (!checkBudget('Verify')) {
  await agent(
    `감사 보고서 작성 후 저장. 경로: forge-outputs/docs/reviews/audit/${auditDate}-system-audit.md.
    ⚠️ 토큰 예산 소진으로 검증 단계(Verify) 스킵됨 (BUDGET_RESERVE=${BUDGET_RESERVE}, turn-budget-aware guard).
    데이터: overall=${synthesis.overall}, scores=${JSON.stringify(axes.map(a=>({axis:a.axis,score:a.score})))},
    findings=${JSON.stringify(synthesis.findings?.slice(0,20))}.
    보고서에 "검증 미수행 — 예산 초과 [STOP]" 경고를 Executive Summary 상단에 명시 필수.`,
    { label: 'report-budget-stop', phase: 'Report' }
  )
  return { status: 'BUDGET_STOP', avgScore: parseFloat(avgScore.toFixed(1)), budget_reserve: BUDGET_RESERVE }
}
phase('Verify')
const verifyCtx = JSON.stringify({
  overall: synthesis.overall,
  findings: synthesis.findings,
  redundancy: redundancy?.summary,
})

// root-cause: crMode gate — codex-critic spawn conditional on args.crMode ('on'|'degrade'|'off').
// 'degrade'/'off' → null slot returned; .filter(Boolean) below drops it to 2-LLM.
// Existing verifiers.length<2 fail-closed guard + threshold=2 renorm handle 2-LLM gracefully.
const spawnCodex = crMode === 'on'
if (!spawnCodex) log(`[INFO] crMode=${crMode} — codex-critic spawn SKIPPED. Verify degrades to Claude+Gemini (2-LLM).`)
const [claudeVerify, codexVerify, geminiVerify] = await parallel([
  () => agent(
    `audit 결과 meta-review. 검토: (1) 발견 이슈 실제 문제인가 (2) 권고사항 실행 가능한가 (3) 놓친 이슈. ` +
    `각 finding.id confirmed/disputed 판단. 결과: ${verifyCtx}`,
    { label: 'verify-claude', phase: 'Verify', schema: VERIFY_SCHEMA }
  ),
  () => spawnCodex
    ? agent(
        `adversarial 검증 (Codex). false positive 탐지. ` +
        `Redundancy 발견 중 실제 중복 아닌 것? 보안 이슈 오분류? ` +
        `각 finding.id confirmed/disputed 판단. 결과: ${verifyCtx}`,
        { label: 'verify-codex', phase: 'Verify', schema: VERIFY_SCHEMA, agentType: 'codex-critic' }
      )
    : null,
  () => agent(
    `구조 검증 (Gemini). 리포트 일관성·완전성·레이블 drift 체크. ` +
    `축간 점수 모순? 중복 분류 표 섹션 정합? ` +
    `각 finding.id confirmed/disputed 판단. 결과: ${verifyCtx}`,
    { label: 'verify-gemini', phase: 'Verify', schema: VERIFY_SCHEMA, agentType: 'gemini' }
  ),
])

const verifiers = [claudeVerify, codexVerify, geminiVerify].filter(Boolean)
// root-cause: Codex HIGH — verifier < 2명 시 감사 계속으로 2/3 합의 요건 미충족. fail-closed 필수.
if (verifiers.length < 2) {
  log(`[FAIL] verifier ${verifiers.length}/3 — 최소 2명 미충족, 감사 중단 (fail-closed)`)
  return { status: 'FAIL', reason: 'insufficient-verifiers', verifierCount: verifiers.length }
}
const allFindings = synthesis.findings || []
// root-cause: cr-triple Codex CRIT — ceil(2/2)=1 버그 수정. 3·2 verifier=2표 필수(fail-closed), 1=solo(WARN).
const threshold = verifiers.length >= 2 ? 2 : 1
if (verifiers.length < 3) log(`[WARN] verifier ${verifiers.length}/3 (codex/gemini 누락) — 임계 ${threshold} (2 verifier도 2표 필수), 신뢰도 저하`)
const verified = allFindings.filter(f =>
  verifiers.filter(v => v.confirmed_finding_ids?.includes(f.id)).length >= threshold
)
// C-2: 검증자 추가 발견(additions) + 분쟁(disputed). disputed에서 verified 제외 (양쪽 중복 방지 — Codex HIGH).
// root-cause: B-3 additions = 객체 배열 → Set dedup 불가, flatMap으로 수집
const additions = verifiers.flatMap(v => v.additions || [])
const verifiedIds = new Set(verified.map(f => f.id))
const disputed = [...new Set(verifiers.flatMap(v => v.disputed || []))].filter(id => !verifiedIds.has(id))
log(`검증: ${verified.length}/${allFindings.length} 통과 (임계 ${threshold}/${verifiers.length}) | additions=${additions.length} disputed=${disputed.length}`)

// ── Phase 4: Report ───────────────────────────────────────────────────────────
phase('Report')
const reportPath = `forge-outputs/docs/reviews/audit/${auditDate}-system-audit.md`
await agent(
  `최종 감사 보고서 작성 후 저장. 경로: ${reportPath}.
  데이터:
  - overall=${synthesis.overall}
  - scores=${JSON.stringify(axes.map(a => ({ axis: a.axis, score: a.score })))}
  - redundancy=${JSON.stringify(redundancy?.summary)}
  - redundancy_items=${JSON.stringify(redundancy?.items || [])}  // root-cause: Codex HIGH — §4 표용 item 디테일 전달 (summary만이던 것)
  - verified_findings=${JSON.stringify(verified)}
  - verifier_additions=${JSON.stringify(additions)}
  - disputed_ids=${JSON.stringify(disputed)}
  - verifier_count=${verifiers.length} (3 미만이면 검증 신뢰도 저하 명시)
  - tradeoffs=${JSON.stringify(synthesis.tradeoffs)}
  - roadmap_p0=${JSON.stringify(synthesis.roadmap_p0)}
  - roadmap_p1=${JSON.stringify(synthesis.roadmap_p1)}
  - roadmap_p2=${JSON.stringify(synthesis.roadmap_p2)}

  필수 섹션:
  1. Executive Summary (점수 표 + Redundancy 요약 + verifier_count<3 시 신뢰도 경고)
  2. 축별 감사 결과 (1.1~1.5 + 1.6 Redundancy)
  3. 축간 트레이드오프 분석
  4. Redundancy 리포트 (redundancy_items의 type/names/recommendation/risk/reason 표 — summary 아닌 item별 행)
  5. 정량 지표 대시보드
  6. 트렌드 (이전 감사 대비 Δ)
  7. 통합 이슈 목록 (CRITICAL→LOW) + 7.1 검증자 추가 발견(additions) + 7.2 분쟁 항목(disputed, 임계 미달)
  8. 통합 개선 로드맵 (P0/P1/P2)

  ⚠️ 반드시 Write 도구로 ${reportPath}에 실제 저장 후, Read로 파일 존재 확인. 마지막 줄에 "SAVED: ${reportPath}" 반환. 저장 실패 시 "WRITE_FAILED" 반환.`,
  // root-cause: C-2 additions/disputed + Codex HIGH redundancy item 표 + Report 영속화 검증(Write+Read 확인)
  { label: 'report', phase: 'Report' }
)
log(`Report 완료 → ${reportPath}`)

return {
  avgScore: parseFloat(avgScore.toFixed(1)),
  axes: axes.map(a => ({ axis: a.axis, score: a.score, maturity: a.maturity })),
  redundancy: redundancy?.summary,
  verified_count: verified.length,
  total_findings: allFindings.length,
}
