// root-cause: migration-audit Phase 7 PEV 루프 = while() 자동화. 사이클 캡 6 + plateau 감지. 계획서 P2-3.
export const meta = {
  name: 'migration-audit',
  description: '레거시→신규 스택 마이그레이션 검수 Workflow — Phase 0~5 + Phase 7 PEV while() 루프 자동화',
  phases: [
    { title: 'Inventory', detail: 'Phase 0: legacy/src 병렬 인벤토리 + Phase 0.5 Provenance Ledger' },
    { title: 'Audit', detail: 'Phase 1 이벤트 커버리지 + Phase 2 도메인별 병렬 로직 대조 + Phase 3 DB 대조' },
    { title: 'Review', detail: 'Phase 4: cr-triple 적대적 검수 (외부 토큰 선발행 필요)' },
    { title: 'Report', detail: 'Phase 5: 종합 리포트 + [STOP] M1 사용자 승인 게이트' },
    { title: 'Fix', detail: 'Phase 6: migration-fixer + Phase 7: PEV while() 루프 (--fix=auto 시만)' },
  ],
}

// args = { legacyPath, migratedPath, stack='node-nest', scope='full', fix='off'|'propose'|'auto', crMode='on'|'degrade'|'off' }
// root-cause: crMode gate — degrade/off skips codex-critic Phase 4 spawn to allow cost/availability fallback
const legacyPath = args?.legacyPath || ''
const migratedPath = args?.migratedPath || ''
const stack = args?.stack || 'node-nest'
const scope = args?.scope || 'full'
const fixMode = args?.fix || 'off'
// root-cause: crMode default flip 'on'→'degrade' (fail-safe Codex-off, 2026-06-15)
const crMode = args?.crMode || 'degrade'  // 기본 degrade (Codex-off fail-safe; --cr on 으로 강제)

if (!legacyPath || !migratedPath) {
  log('[STOP] legacyPath + migratedPath 필수 (args.legacyPath / args.migratedPath)')
  return { error: 'missing-args' }
}

const INVENTORY_SCHEMA = {
  type: 'object',
  properties: {
    side: { type: 'string', enum: ['legacy', 'src'] },
    entrypoints: { type: 'array', items: { type: 'string' } },
    domains: { type: 'array', items: { type: 'string' } },
    events: { type: 'array', items: { type: 'string' } },
    buildScriptExists: { type: 'boolean' },
    blockers: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['side', 'domains', 'events', 'summary'],
}

const LEDGER_SCHEMA = {
  type: 'object',
  properties: {
    ledgerPath: { type: 'string' },
    intentional: { type: 'array', items: { type: 'string' } },
    knownDivergence: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['ledgerPath', 'summary'],
}

const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    domains: { type: 'array', items: { type: 'string' } },
    covered: { type: 'number' },
    missing: { type: 'number' },
    extra: { type: 'number' },
    matrixPath: { type: 'string' },
    gatePass: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['domains', 'missing', 'gatePass', 'matrixPath', 'summary'],
}

const DRIFT_SCHEMA = {
  type: 'object',
  properties: {
    domain: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bucket: { type: 'string', enum: ['MIGRATION-DRIFT', 'KNOWN-DIVERGENCE', 'LEGACY-BUG-CANDIDATE', 'MISSING', 'UNVERIFIED'] },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          description: { type: 'string' },
          legacyExcerpt: { type: 'string' },
          srcExcerpt: { type: 'string' },
          blameCommit: { type: 'string' },
        },
        required: ['bucket', 'severity', 'description'],
      },
    },
    criticalCount: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['domain', 'findings', 'criticalCount', 'summary'],
}

const DB_SCHEMA = {
  type: 'object',
  properties: {
    spMismatches: { type: 'number' },
    columnOtaPreserved: { type: 'boolean' },
    gatePass: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    reportPath: { type: 'string' },
  },
  required: ['spMismatches', 'gatePass', 'summary'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    criticalCount: { type: 'number' },
    confirmedFindings: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'criticalCount', 'summary'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    reportPath: { type: 'string' },
    syncStatusPath: { type: 'string' },
    criticalCount: { type: 'number' },
    highCount: { type: 'number' },
    criticalFindings: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    summary: { type: 'string' },
  },
  required: ['reportPath', 'criticalCount', 'highCount', 'verdict', 'summary'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'number' },
    skipped: { type: 'number' },
    oraclePass: { type: 'boolean' },
    commitSha: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['fixed', 'oraclePass', 'summary'],
}

// root-cause: B3 structured finding IDs — items changed from string to object with stable `id` field.
// `id` must be a deterministic slug (e.g. `${file}:${rule}`) so oscillation detection is wording-drift-immune.
const REAUDIT_FINDING_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
    file: { type: 'string' },
    rule: { type: 'string' },
    desc: { type: 'string' },
  },
  required: ['id'],
}

const REAUDIT_SCHEMA = {
  type: 'object',
  properties: {
    criticalCount: { type: 'number' },
    highCount: { type: 'number' },
    newFindings: { type: 'array', items: REAUDIT_FINDING_SCHEMA },
    resolvedFindings: { type: 'array', items: REAUDIT_FINDING_SCHEMA },
    syncPercent: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['criticalCount', 'highCount', 'syncPercent', 'summary'],
}

// ── Phase 0: Inventory ────────────────────────────────────────────────────────
phase('Inventory')
const [legacyInv, srcInv] = await parallel([
  () => agent(
    `Phase 0 legacy 인벤토리. legacy-path="${legacyPath}" stack="${stack}" scope="${scope}". ` +
    `파일 목록+엔트리포인트+이벤트+도메인 추출. migration-audit/references/stack-mappings.md 참조. ` +
    `side="legacy". blockers 있으면 열거. buildScriptExists 확인.`,
    { label: 'phase-0:legacy-inv', phase: 'Inventory', schema: INVENTORY_SCHEMA, agentType: 'Explore' }
  ),
  () => agent(
    `Phase 0 src 인벤토리. migrated-path="${migratedPath}" stack="${stack}" scope="${scope}". ` +
    `파일 목록+엔트리포인트+이벤트+도메인 추출. migration-audit/references/stack-mappings.md 참조. ` +
    `side="src". blockers 있으면 열거. buildScriptExists 확인.`,
    { label: 'phase-0:src-inv', phase: 'Inventory', schema: INVENTORY_SCHEMA, agentType: 'Explore' }
  ),
])

const blockers = [...(legacyInv?.blockers || []), ...(srcInv?.blockers || [])]
if (blockers.length > 0) {
  log(`[STOP] Phase 0 BLOCKER — 구조 매핑 미해결: ${blockers.join(' | ')}`)
  return { error: 'phase-0-blocker', blockers }
}
log(`[Phase0] legacy 도메인=${legacyInv?.domains?.length} src 도메인=${srcInv?.domains?.length}`)

const ledgerResult = await agent(
  `Phase 0.5 Provenance Ledger. legacy="${legacyPath}" src="${migratedPath}". ` +
  `git log 커밋 분류: MIGRATION(마이그/port/본문) / INTENTIONAL(fix/feat 행위변경) / CHORE(코스메틱/deps). ` +
  `intent-ledger.md 생성. known-divergence 후보 등록. ledgerPath + intentional[] + knownDivergence[] 반환.`,
  { label: 'phase-0.5:ledger', phase: 'Inventory', schema: LEDGER_SCHEMA }
)
log(`[Phase0.5] INTENTIONAL=${ledgerResult?.intentional?.length} KNOWN-DIV=${ledgerResult?.knownDivergence?.length}`)

// ── Phase 1+2+3: Audit ────────────────────────────────────────────────────────
phase('Audit')
const coverageResult = await agent(
  `Phase 1 이벤트 커버리지 매트릭스 [게이트 1]. ` +
  `legacy 이벤트: ${JSON.stringify(legacyInv?.events)}. src 이벤트: ${JSON.stringify(srcInv?.events)}. ` +
  `이름 단위 매핑 — COVERED/MISSING/RENAMED/EXTRA. MISSING=CRITICAL. ` +
  `01-event-coverage-matrix.md 저장. domains[] + covered/missing/extra + gatePass 반환.`,
  { label: 'phase-1:coverage', phase: 'Audit', schema: COVERAGE_SCHEMA }
)
if (!coverageResult?.gatePass) {
  log(`[GATE1] FAIL — MISSING ${coverageResult?.missing}건 (CRITICAL)`)
}
log(`[Phase1] covered=${coverageResult?.covered} missing=${coverageResult?.missing} extra=${coverageResult?.extra}`)

const domains = coverageResult?.domains || legacyInv?.domains || []
const domainAudits = await pipeline(
  domains,
  (domain, _, idx) => agent(
    `Phase 2 도메인 deep 대조. domain="${domain}" ` +
    `legacy="${legacyPath}" src="${migratedPath}" stack="${stack}". ` +
    `read-only + git blame. ledger: ${ledgerResult?.ledgerPath}. ` +
    `차이 발견 시 3-bucket: MIGRATION-DRIFT(마이그커밋)/KNOWN-DIVERGENCE(fix/feat커밋)/LEGACY-BUG-CANDIDATE(대기). ` +
    `MISSING(legacy有src無)=CRITICAL. UNVERIFIED(대조불가)=BLOCKING. ` +
    `페이로드 형식: [도메인][판정] legacy함수원문/src함수원문/판정근거/git-blame SHA. ` +
    `findings[] + criticalCount 반환.`,
    { label: `phase-2:audit-${idx}`, phase: 'Audit', schema: DRIFT_SCHEMA }
  )
)
const allFindings = domainAudits.filter(Boolean).flatMap(r => r.findings || [])
const phase2Critical = domainAudits.filter(Boolean).reduce((s, r) => s + (r.criticalCount || 0), 0)
log(`[Phase2] 도메인=${domains.length} findings=${allFindings.length} CRITICAL=${phase2Critical}`)

const dbResult = await agent(
  `Phase 3 DB/외부계약 대조 [게이트 2]. legacy="${legacyPath}" src="${migratedPath}". ` +
  `SP명/파라미터/반환/호출순서 대조. IRON Rule 4: 컬럼 오타 보존 확인("고쳐졌으면" CRITICAL). ` +
  `relay 프로토콜 미확보 시 relay 도메인 PASS 금지. ` +
  `03-sp-db-mapping.md 저장. spMismatches + columnOtaPreserved + gatePass 반환.`,
  { label: 'phase-3:db', phase: 'Audit', schema: DB_SCHEMA }
)
if (!dbResult?.gatePass) { log(`[GATE2] DB 게이트 FAIL — SP불일치 ${dbResult?.spMismatches}건`) }
log(`[Phase3] spMismatch=${dbResult?.spMismatches} oataPreserved=${dbResult?.columnOtaPreserved}`)

// ── Phase 4: Review ───────────────────────────────────────────────────────────
phase('Review')
// root-cause: crMode gate — degrade/off bypasses codex-critic; aggregation uses reviewResult fallback
let reviewResult
if (crMode === 'on' || !crMode) {
  // 외부 토큰 선발행 전제 (codex-critic mcp__codex__ HMAC)
  reviewResult = await agent(
    `Phase 4 멀티 적대적 검수 [게이트 3 — BLOCKING]. ` +
    `Phase 2 findings(${allFindings.length}건): ${JSON.stringify(allFindings.slice(0, 20))}. ` +
    `cr-triple 기준: 각 finding 동의편향 없이 재검. 요약 금지(원문 excerpt 필수). ` +
    `확정 finding만 통과. verdict(PASS/WARN/FAIL) + criticalCount + confirmedFindings 반환.`,
    { label: 'phase-4:review', phase: 'Review', schema: REVIEW_SCHEMA, agentType: 'codex-critic' }
  )
} else {
  // crMode='degrade'|'off' — codex-critic spawn skipped; pass Phase 2 findings through unreviewed
  log(`[Phase4] codex-critic SKIPPED (crMode=${crMode}) — Phase 2 findings passed through as-is`)
  reviewResult = {
    verdict: 'WARN',
    criticalCount: allFindings.filter(f => f?.severity === 'CRITICAL').length,
    confirmedFindings: allFindings,
    note: `codex-critic skipped: crMode=${crMode}`,
  }
}
if (reviewResult?.verdict === 'FAIL') {
  log(`[GATE3] cr-triple FAIL — CRITICAL ${reviewResult?.criticalCount}건`)
}
log(`[Phase4] ${reviewResult?.verdict} critical=${reviewResult?.criticalCount} confirmed=${reviewResult?.confirmedFindings?.length}`)

// ── Phase 5: Report ([STOP] M1 사용자 승인) ────────────────────────────────────
phase('Report')
const reportResult = await agent(
  `Phase 5 종합 리포트 + 버그 등록. ` +
  `확정 findings: ${JSON.stringify(reviewResult?.confirmedFindings)}. ` +
  `DB 결과: ${JSON.stringify(dbResult)}. coverage: ${JSON.stringify(coverageResult)}. ` +
  `MIGRATION-AUDIT-REPORT.md + SYNC-STATUS.md 생성. ` +
  `CRITICAL/HIGH → docs/bug_report/BUG-NNN-*.md (healer형식 + legacy=SSoT 대조근거). ` +
  `/eval-rubric --target MIGRATION-AUDIT-REPORT.md 자동 호출. ` +
  `reportPath + syncStatusPath + criticalCount + highCount + criticalFindings + verdict 반환.`,
  { label: 'phase-5:report', phase: 'Report', schema: REPORT_SCHEMA }
)
log(`[Phase5] ${reportResult?.verdict} CRITICAL=${reportResult?.criticalCount} HIGH=${reportResult?.highCount}`)

if (fixMode === 'off' || !fixMode) {
  log(`[STOP] M1 사용자 승인 게이트. 리포트: ${reportResult?.reportPath}`)
  log(`계속하려면: Workflow({ args: { ...prevArgs, fix: 'auto' }, resumeFromRunId: '<this-run-id>' })`)
  return {
    status: 'PENDING_APPROVAL',
    verdict: reportResult?.verdict,
    reportPath: reportResult?.reportPath,
    criticalCount: reportResult?.criticalCount,
    highCount: reportResult?.highCount,
  }
}

// root-cause: Codex CRIT — propose도 Phase6/7 write 진입 → dry-run 계약 위반. propose는 계획만 반환.
if (fixMode === 'propose') {
  log(`[STOP] propose 모드 — 수정 계획만 반환. 실제 쓰기 없음.`)
  return {
    status: 'PLAN_READY',
    verdict: reportResult?.verdict,
    reportPath: reportResult?.reportPath,
    criticalCount: reportResult?.criticalCount,
    highCount: reportResult?.highCount,
    proposedFixes: reportResult?.criticalFindings || [],
    note: 'propose 모드: 계획만. 실행하려면 fix="auto"로 재호출',
  }
}

// ── Phase 6+7: Fix + PEV 루프 (--fix=auto 전용) ──────────────────────────────
phase('Fix')
const fixResult = await agent(
  `Phase 6 migration-fixer. fix-mode="${fixMode}". ` +
  `criticalFindings: ${JSON.stringify(reportResult?.criticalFindings)}. ` +
  `게이트 순서: 1)forbidden-diff 스캐너(denylist 차단: legacy/**·mysql_info.js·env/secret/config·IRON Rule 4/5/6) ` +
  `2)oracle PASS(golden-test + npm run build) 3)patch 멀티검수(cr-triple 실코드 전달). ` +
  `commit: "fix(migration): BUG-NNN". ` +
  `fixed + skipped + oraclePass + commitSha 반환.`,
  { label: 'phase-6:fix', phase: 'Fix', schema: FIX_SCHEMA }
)
log(`[Phase6] fixed=${fixResult?.fixed} skipped=${fixResult?.skipped} oraclePass=${fixResult?.oraclePass}`)

// ── Phase 7: PEV 루프 (while) ─────────────────────────────────────────────────
let criticalCount = reportResult?.criticalCount || 0
let cycles = 0
const recentCounts = [criticalCount]
log(`[Phase7 PEV] 시작 CRITICAL=${criticalCount} cap=6`)

// root-cause: SKILL.md §oscillation 조건(동일 finding 2회) 선언 미구현 — seenFindings Set으로 추적. (앵커: 섹션명 — label-rot 방지)
// B3: REAUDIT_SCHEMA now declares newFindings/resolvedFindings as arrays of OBJECTS with stable `id` field.
// Fingerprint keys on finding.id (deterministic slug e.g. `${file}:${rule}`) — NOT free-prose string — so wording drift cannot cause false-negatives.
// root-cause: cr-double LOW — id-less object가 String(obj)='[object Object]'로 붕괴 → distinct findings 병합 → false-positive oscillation. file:rule:desc concat로 하드닝.
const _fingerprintFinding = (f) => {
  if (f && typeof f === 'object') {
    if (typeof f.id === 'string' && f.id.trim()) return f.id.trim()
    const parts = [f.file, f.rule, f.desc].filter(Boolean).join(':')
    if (parts) return parts.toLowerCase().trim().slice(0, 120)
  }
  // Fallback: stray string finding
  return String(f || '').toLowerCase().trim().slice(0, 120)
}
// seenFindings: Map<fingerprint, { count: number, lastSeenCycle: number, resolvedCycles: number[], consecutiveCount: number }>
// 판정 ①oscillation: fingerprint가 "seen → gone(resolvedCycles에 기록) → seen again" 패턴
// 판정 ②same_issue: 동일 fingerprint가 resolvedCycles 기록 없이 consecutiveCount ≥ 3 연속 (GC-b)
const seenFindings = new Map()

// root-cause: GC-a regression — track baseline syncPercent + per-cycle criticalCount to detect regressions.
// Regression signal: syncPercent ACTUALLY drops (only when present) OR criticalCount increases vs prior cycle.
// root-cause: F1 — prevSyncPercent init comment corrected: cycle 1 has no prior syncPercent, so only criticalCount branch is live.
let prevSyncPercent = 0        // GC-a: prior-cycle syncPercent; only compared when current cycle emits a number
let prevCycleCritical = criticalCount  // GC-a: prior-cycle criticalCount; decrease = progress, increase = regression

// root-cause: GC-c budget advisory — loop-kernel-standard §3: turn-budget-aware early-stop (honest: cycle-cap=primary, budget=advisory).
// BUDGET_RESERVE named per standard (not *_TOKEN_CAP). Guard is total-gated so no-budget callers pass through unaffected.
// root-cause: F2 — align with system-audit default (300000); env-overridable so operators can tune without code change.
const BUDGET_RESERVE = parseInt(process.env.BUDGET_RESERVE || '300000')  // advisory turn-budget reserve (tokens); primary bound remains max_cycles(6)

// root-cause: F4 — track why the PEV loop stopped so callers can distinguish budget-curtailed from real FAIL.
let stopReason = 'max_cycles'  // default: loop ran to max_cycles bound

// root-cause: F3 — crash-safe budget guard (match forge-loop defensive form): budget may be undefined on fallback harness paths.
if (budget && budget.total && typeof budget.remaining === 'function' && budget.remaining() < BUDGET_RESERVE) {
  log(`[BUDGET] turn-budget remaining=${budget.remaining()} < BUDGET_RESERVE=${BUDGET_RESERVE} → Phase 7 PEV 스킵 (advisory)`)
  stopReason = 'budget_skip'
} else {

while (criticalCount > 0 && cycles < 6) {
  // root-cause: GC-c budget advisory — re-check each cycle so mid-loop depletion also exits cleanly.
  // root-cause: F3 — crash-safe guard (matches forge-loop): budget may be undefined on fallback harness paths.
  if (budget && budget.total && typeof budget.remaining === 'function' && budget.remaining() < BUDGET_RESERVE) {
    log(`[BUDGET] turn-budget 소진 임박 (remaining=${budget.remaining()}) — PEV 루프 조기 종료 (advisory)`)
    stopReason = 'budget_skip'
    break
  }

  cycles++
  const reAudit = await agent(
    // root-cause: B3 structured finding IDs — instruct re-audit agent to emit stable id per finding so oscillation detection is wording-drift-immune.
    // root-cause: P4c-1 followup — re-list persistent unresolved findings each cycle so GC-b same_issue consecutiveCount is reliable (else false-negative).
    `Phase 7 PEV 재검 사이클 ${cycles}/6. ` +
    `재검 범위: 변경 도메인 + 의존/호출 연결 도메인. ` +
    `legacy="${legacyPath}" src="${migratedPath}" stack="${stack}". ` +
    `SYNC-STATUS.md 갱신: 사이클=${cycles}/6 | 신규=? | 해결=? | CRITICAL=? | HIGH=? | plateau=?. ` +
    `newFindings/resolvedFindings 각 항목은 반드시 구조화 객체로 반환: { id, severity, file, rule, desc }. ` +
    `id는 안정적 결정론적 슬러그 필수 (예: "src/payment/service.ts:missing-null-check"). ` +
    `사이클 간 동일 이슈는 반드시 동일 id 사용 — 표현(desc)이 바뀌어도 id 고정. ` +
    // root-cause: P4c-1 followup — same_issue 신뢰성: 지속 finding 재나열 지시
    `**미해결 지속 finding도 매 사이클 newFindings에 재나열** (해결 전까지 계속 — same_issue 연속카운트가 의존). ` +
    `criticalCount + highCount + newFindings + resolvedFindings + syncPercent 반환.`,
    { label: `phase-7:pev-cycle-${cycles}`, phase: 'Fix', schema: REAUDIT_SCHEMA }
  )
  recentCounts.push(reAudit?.criticalCount || 0)
  const newCritical = reAudit?.criticalCount || 0
  // root-cause: F1 — do NOT collapse missing syncPercent to 0 via `?? 0`.
  // When agent omits syncPercent (legitimate: not all cycles report it), `?? 0` turns an absent field into 0,
  // causing a false REGRESSION vs any prior non-zero prevSyncPercent. Only treat it as a regression signal
  // when it is actually a number in the response.
  const hasSyncPercent = typeof reAudit?.syncPercent === 'number'
  const newSyncPercent = hasSyncPercent ? reAudit.syncPercent : prevSyncPercent  // keep prev for log display when absent
  log(`[Phase7 C${cycles}] CRITICAL=${newCritical} HIGH=${reAudit?.highCount} sync=${hasSyncPercent ? newSyncPercent + '%' : '(not reported)'}`)

  // ── GC-a: regression 감지 ────────────────────────────────────────────────────
  // root-cause: GC-a — fixer can silently break passing tests. Detect by syncPercent drop (only when present) OR criticalCount increase.
  // root-cause: F1 — syncRegressed only fires when hasSyncPercent; missing field is NOT a regression signal.
  const syncRegressed = hasSyncPercent && reAudit.syncPercent < prevSyncPercent
  const critRegressed = newCritical > prevCycleCritical
  if (syncRegressed || critRegressed) {
    log(
      `[REGRESSION] 회귀 감지: ` +
      `sync ${prevSyncPercent}%→${hasSyncPercent ? reAudit.syncPercent + '%' : '(absent)'} | critical ${prevCycleCritical}→${newCritical} ` +
      `→ PEV 루프 중단`
    )
    criticalCount = newCritical
    stopReason = 'regression'
    break
  }
  // root-cause: F1 — only advance prevSyncPercent when the agent actually reported it; absent = no evidence of change.
  if (hasSyncPercent) prevSyncPercent = reAudit.syncPercent
  prevCycleCritical = newCritical
  criticalCount = newCritical

  // ── oscillation 감지 (SKILL.md 선언 조건 배선) ──────────────────────────────
  // 현 사이클 active findings 지문 수집
  const currentFingerprints = new Set(
    (reAudit?.newFindings || []).map(_fingerprintFinding).filter(Boolean)
  )
  // 이전 사이클에서 해결됐다고 보고된 findings 지문
  const resolvedFingerprints = new Set(
    (reAudit?.resolvedFindings || []).map(_fingerprintFinding).filter(Boolean)
  )

  // 해결됐던 finding 지문 기록
  for (const fp of resolvedFingerprints) {
    if (seenFindings.has(fp)) {
      seenFindings.get(fp).resolvedCycles.push(cycles)
      // resolved this cycle — reset consecutive counter (no longer consecutive)
      seenFindings.get(fp).consecutiveCount = 0
    }
  }
  // 현 사이클 active findings 업데이트 + oscillation 감지 + same_issue 감지 (GC-b)
  let oscillationDetected = false
  let sameIssueDetected = false
  for (const fp of currentFingerprints) {
    if (!seenFindings.has(fp)) {
      seenFindings.set(fp, { count: 1, lastSeenCycle: cycles, resolvedCycles: [], consecutiveCount: 1 })
    } else {
      const entry = seenFindings.get(fp)
      entry.count++
      entry.lastSeenCycle = cycles
      // root-cause: GC-b same_issue — same finding id persists ≥3 cycles consecutively (never resolved).
      // DISTINCT from oscillation (which requires resolved→reappeared). consecutive = unbroken run with no resolvedCycles entry.
      // Reuses _fingerprintFinding (structured id) per standard §2 — string fuzzy forbidden.
      // root-cause: F5 — no resolvedFingerprints guard needed here: currentFingerprints ∩ resolvedFingerprints = ∅
      // (a finding cannot be both active AND resolved in the same cycle), so unconditional increment is correct.
      // The consecutive-counter reset for resolved findings happens in the resolvedFingerprints loop above.
      entry.consecutiveCount = (entry.consecutiveCount || 0) + 1
      if (entry.consecutiveCount >= 3) {
        log(`[SAME_ISSUE] finding ${entry.consecutiveCount}회 연속 미해결 (stuck): "${fp.slice(0, 60)}..." → PEV 루프 중단`)
        sameIssueDetected = true
        stopReason = 'same_issue'  // root-cause: F4 — attributable stop reason
        break
      }
      // oscillation = 이전에 resolved로 보고된 적 있고, 지금 다시 나타남
      if (entry.resolvedCycles.length >= 1) {
        log(`[OSCILLATION] finding 재출현 감지 (2회+): "${fp.slice(0, 60)}..." → PEV 루프 중단`)
        oscillationDetected = true
        stopReason = 'oscillation'  // root-cause: F4 — attributable stop reason
        break
      }
    }
  }
  if (oscillationDetected || sameIssueDetected) break

  // plateau 감지: 2연속 동일
  if (recentCounts.length >= 3) {
    const last2 = recentCounts.slice(-2)
    if (last2[0] === last2[1] && last2[0] > 0) {
      log(`[PLATEAU] 2연속 CRITICAL=${criticalCount} → PEV 루프 중단`)
      stopReason = 'plateau'  // root-cause: F4 — attributable stop reason
      break
    }
  }

  if (criticalCount > 0) {
    await agent(
      `Phase 7 PEV 수정. 사이클 ${cycles}. ` +
      `CRITICAL findings 수정. oracle 통과 필수(golden-test + npm build). fix-mode="${fixMode}".`,
      { label: `phase-7:fix-cycle-${cycles}`, phase: 'Fix', schema: FIX_SCHEMA }
    )
  }
}

} // end budget.total gate

// root-cause: F4 — if criticalCount reached 0 the loop exited via while-condition (all resolved), override stopReason.
if (criticalCount === 0 && stopReason === 'max_cycles') stopReason = 'resolved'

const finalVerdict = criticalCount === 0 ? 'PASS' : 'FAIL'
log(`[Phase7 완료] ${finalVerdict} cycles=${cycles} CRITICAL=${criticalCount} stopReason=${stopReason}`)

return {
  status: finalVerdict,
  reportPath: reportResult?.reportPath,
  criticalCount,
  cycles,
  syncComplete: criticalCount === 0,
  stopReason,  // root-cause: F4 — caller can distinguish budget_skip / regression / same_issue / oscillation / plateau / max_cycles / resolved
}
