// root-cause: qa Phase A~H = 8단계 순차 기반. Phase C(T1~T7) 독립병렬 + Phase E(healer) 복잡도 라우팅 병렬.
// 메인 컨텍스트 격리 + resume. 계획서 P2-1.
export const meta = {
  name: 'qa',
  description: 'QA 전 사이클 Workflow — Phase A~H (branch→scenarios→bug discovery→fix→cr-*→PR→knowledge)',
  phases: [
    { title: 'Setup', detail: 'Phase A: 브랜치 생성 + Phase B: 시나리오 작성' },
    { title: 'Discover', detail: 'Phase C: T1~T7 병렬 버그 발견' },
    { title: 'Plan', detail: 'Phase D: 버그 수정 계획서 + evaluator-contract' },
    { title: 'Fix', detail: 'Phase E: healer 복잡도 라우팅 병렬 수정' },
    { title: 'Validate', detail: 'Phase F: cr-* 순차 검증 + Codex final' },
    { title: 'Ship', detail: 'Phase G: PR + CI + develop 머지 + Phase H: 지식 축적' },
  ],
}

const scope = args?.scope || 'full'
const mode = args?.mode || 'full'  // 'full' | 'hotfix'
// root-cause: crMode gates Phase F Codex spawn. 'degrade'/'off' → skip codex-critic, not an error.
const crMode = args?.crMode || 'degrade'  // 기본 degrade (Codex-off fail-safe; --cr on 으로 강제) | 'on' | 'off'
// root-cause: P-7 loop-until-dry opt-in greybox. loopUntilDry=false 기본 — 기존 Phase C 동작 100% 보존.
const loopUntilDry = args?.loopUntilDry === true || args?.loopUntilDry === 'on'
const dryK = Math.max(1, Math.min(5, parseInt(args?.dryK) || 2))
// root-cause: P-3 prLanes opt-in greybox — 독립 bug(worktree 격리 = 의존0)을 배리어 없는 pipeline()
//   fix→verify 레인으로. 기본 off → 기존 Phase E parallel 배리어 + Phase F 순차 100% 보존.
//   독립 판정 SSoT = P-1 의존그래프(fr-lanes.py). worktree 격리가 머지충돌 0 보장(Phase E 기존 주석).
const prLanes = args?.prLanes === true || args?.prLanes === 'on'

const BRANCH_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    logFile: { type: 'string' },
  },
  required: ['branch'],
}

const SCENARIOS_SCHEMA = {
  type: 'object',
  properties: {
    scenariosPath: { type: 'string' },
    filteredCount: { type: 'number' },
  },
  required: ['scenariosPath', 'filteredCount'],
}

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    testType: { type: 'string' },
    status: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    bugs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          title: { type: 'string' },
          file: { type: 'string' },
          type: { type: 'string' },
          complexity: { type: 'string', enum: ['SIMPLE', 'MODERATE', 'HIGH', 'AMBIGUOUS'] },
        },
        required: ['title', 'type', 'complexity'],
      },
    },
    // root-cause: B1 (Wave-4) — T6 전용 구조화 신호 흡수. forge-check-security는 {verdict,halt,criticalCount}를 반환하지만
    // TEST_SCHEMA에 매핑 필드가 없어 criticalCount 관측성 손실. optional 추가 → T1/T2/T3/T7 영향 없음.
    // 실제 STOP 경로(securityCritical → return {error:'security-critical'} 블록)는 변경 없음.
    criticalCount: { type: 'number' },  // forge-check-security verdict.criticalCount 직접 매핑 (T6 전용)
    haltSignal: { type: 'boolean' },    // forge-check-security halt:true 흐름 추적용 (T6 전용; STOP은 verdict 기반)
  },
  required: ['testType', 'status', 'bugs'],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    planPath: { type: 'string' },
    bugs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          title: { type: 'string' },
          file: { type: 'string' },
          type: { type: 'string' },
          complexity: { type: 'string', enum: ['SIMPLE', 'MODERATE', 'HIGH', 'AMBIGUOUS'] },
        },
        required: ['id', 'title', 'complexity'],
      },
    },
  },
  required: ['planPath', 'bugs'],
}

const HEALER_SCHEMA = {
  type: 'object',
  properties: {
    bugId: { type: 'number' },
    status: { type: 'string', enum: ['FIXED', 'SKIPPED', 'FAILED'] },
    fixed: { type: 'boolean' },
    branch: { type: 'string' },
  },
  required: ['bugId', 'status', 'fixed'],
}

const CR_SCHEMA = {
  type: 'object',
  properties: {
    check: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    criticalCount: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['check', 'verdict'],
}

const SHIP_SCHEMA = {
  type: 'object',
  properties: {
    prUrl: { type: 'string' },
    merged: { type: 'boolean' },
    metricsAppended: { type: 'boolean' },
  },
  required: ['merged'],
}

// ── Phase A+B: Setup ───────────────────────────────────────────────────────────
phase('Setup')
const branchResult = await agent(
  `Phase A — QA 브랜치 생성. scope="${scope}" mode="${mode}". ` +
  `qa SKILL.md Phase A 절차: develop 확인, fix/qa-${scope}-* idempotency 검사, ` +
  `신규 브랜치 생성(fix/qa-${scope}-$(date +%Y-%m-%d)). ` +
  `LOG_HTTP=1 LOG_SOCKET=1 LOG_DB=1 export. 브랜치명 + log 경로 반환.`,
  { label: 'phase-a:branch', phase: 'Setup', schema: BRANCH_SCHEMA }
)
if (!branchResult) { log('[STOP] Phase A 실패 — 브랜치 생성 불가'); return { error: 'phase-a-failed' } }
log(`[A] 브랜치: ${branchResult.branch}`)

const scenariosResult = mode === 'hotfix' ? null : await agent(
  `Phase B — QA 시나리오 작성. 브랜치=${branchResult.branch}. ` +
  `qa-setup → gitnexus route_map → scenarios.md 8 카테고리 강제(모두 1개+). ` +
  `scope="${scope}" 필터 → scenarios-filtered.md. 면제 시 사유 명시. ` +
  `scenariosPath + filteredCount 반환.`,
  { label: 'phase-b:scenarios', phase: 'Setup', schema: SCENARIOS_SCHEMA }
)
if (mode !== 'hotfix' && !scenariosResult) {
  log('[STOP] Phase B 실패 — 시나리오 미작성')
  return { error: 'phase-b-failed' }
}
log(`[B] 시나리오: ${scenariosResult?.filteredCount || 0}개`)

// ── Phase C: Discover (T1~T7 병렬) ─────────────────────────────────────────────
// root-cause: T4(통합 flow 테스트)/T5(E2E 시나리오 재실행)는 T1·T2와 커버리지 중복
//   → Phase B 시나리오 전수 실행이 T4/T5 역할 대체. 명시적 면제 (waiver 2026-05-31).
// root-cause: P-7 do...while — loopUntilDry=false 시 루프 1회만 실행(기존 동작 동일).
//   T6 보안 FAIL = 루프 내 즉시 STOP (라운드 무관).
phase('Discover')
const seenBugs = new Set()
const allBugs = []
const _bugKey = b => `${(b.file||'').toLowerCase()}|${(b.type||'').toLowerCase()}|${(b.title||'').toLowerCase().slice(0, 80)}`
let consecEmpty = 0
// root-cause: P-7 라운드 카운터 — 라운드별 고유 라벨 보장 (캐시 히트 방지).
let round = 0

do {
  round++
  const testResults = mode === 'hotfix' ? [] : await parallel([
    () => agent(
      `Phase C T1 — API 전수 테스트. scenarios=${scenariosResult?.scenariosPath}. ` +
      `verify.sh 실행. 백엔드 7축(HTTP/스키마/로그/데이터무결성/FR/Latency/트랜잭션). ` +
      `FAIL = flaky 2회 재시도. 버그 발견 시 artifacts/ 3종 로그 수집. testType="T1".`,
      { label: `phase-c-r${round}:T1-api`, phase: 'Discover', schema: TEST_SCHEMA }
    ),
    () => agent(
      `Phase C T2 — UI 시각 검증. Playwright 3 viewport(mobile/tablet/desktop). ` +
      `프론트 7축(console/network/js/FR/visual-diff/a11y/interaction). ` +
      `FAIL = 4종 로그 수집 + RED before 스크린샷×3. testType="T2".`,
      { label: `phase-c-r${round}:T2-ui`, phase: 'Discover', schema: TEST_SCHEMA }
    ),
    () => agent(
      `Phase C T3 — DB 데이터 검증. seed 기준 CRUD 결과 + 무결성(FK/nullable/타입). ` +
      `직접 SQL 쿼리로 실제 저장값 확인. testType="T3".`,
      { label: `phase-c-r${round}:T3-db`, phase: 'Discover', schema: TEST_SCHEMA }
    ),
    () => agent(
      // root-cause: B1 (Wave-4) — forge-check-security 구조화 신호 흡수. verdict/criticalCount/halt 명시 매핑.
      // GC7: MEDIUM/LOW handling reverted to report-only (B1 scope = observability only).
      // criticalCount/haltSignal = 의도적 inert (B2 forward-prep) — 현재 STOP은 status==='FAIL' verdict만.
      `Phase C T6 — 보안 스캔. forge-check-security 실행. ` +
      `결과 매핑: verdict=FAIL or criticalCount≥1 → status="FAIL" + haltSignal=true + criticalCount=<N>. ` +
      `HIGH → status="WARN". MEDIUM/LOW → report-only (status 변경 없음). testType="T6". ` +
      `bugs[]에 CRITICAL/HIGH 발견 항목 포함(title+type+complexity="HIGH").`,
      { label: `phase-c-r${round}:T6-security`, phase: 'Discover', schema: TEST_SCHEMA }
    ),
    () => agent(
      `Phase C T7 — 성능 기준선. scenarios.md GET 엔드포인트 최대 10개 5회 평균. ` +
      `>2000ms → WARN. >5000ms → FAIL. baseline.json 대비 +25% → WARN. testType="T7".`,
      { label: `phase-c-r${round}:T7-perf`, phase: 'Discover', schema: TEST_SCHEMA }
    ),
  ])

  const securityCritical = testResults.filter(Boolean).find(r => r.testType === 'T6' && r.status === 'FAIL')
  if (securityCritical) {
    log('[STOP] T6 보안 CRITICAL — 수정 후 재실행 필요')
    return { error: 'security-critical', bugs: securityCritical.bugs }
  }
  const roundBugs = testResults.filter(Boolean).flatMap(r => r.bugs || [])
  const freshBugs = roundBugs.filter(b => !seenBugs.has(_bugKey(b)))
  roundBugs.forEach(b => seenBugs.add(_bugKey(b)))
  allBugs.push(...freshBugs)

  if (loopUntilDry) {
    if (freshBugs.length === 0) {
      consecEmpty++
      log(`[C-dry] 신규 없음 (${consecEmpty}/${dryK})`)
    } else {
      consecEmpty = 0
      log(`[C-dry] 신규 버그: ${freshBugs.length}건 (누적 ${allBugs.length}건)`)
    }
  }
// root-cause: hotfix 모드에서 loopUntilDry 루프 낭비 방지 — hotfix는 단일 패스.
} while (loopUntilDry && mode !== 'hotfix' && consecEmpty < dryK)

log(`[C] 발견 버그: ${allBugs.length}건`)

// ── Phase D: Plan ───────────────────────────────────────────────────────────────
phase('Plan')
const planResult = await agent(
  `Phase D — 버그 수정 계획서. 버그: ${JSON.stringify(allBugs)}. ` +
  `docs/qa/$(date +%Y-%m-%d)-bug-fix-plan.md 생성. ` +
  `버그별 필수: 유형/cross_repo/5W1H(Why_hypothesis)/영향파일/복잡도(SIMPLE|MODERATE|HIGH|AMBIGUOUS)/healer분담. ` +
  `cross_repo 자동 감지(영향 리포≥2→true). evaluator-contract.json 생성. planPath + bugs[] 반환.`,
  { label: 'phase-d:plan', phase: 'Plan', schema: PLAN_SCHEMA }
)
if (!planResult?.bugs?.length) {
  log('[QA] 버그 없음 — PASS')
  return { status: 'PASS', bugsFound: 0, branch: branchResult.branch }
}
log(`[D] 수정 계획: ${planResult.bugs.length}건`)

// ── Phase E: Fix (healer 복잡도 라우팅 병렬) ────────────────────────────────────
phase('Fix')
// root-cause: P-3 — healer 호출을 함수로 추출(parallel 배리어 / pipeline 레인 양쪽 재사용).
//   기존 동작 보존: prLanes off → parallel 배리어(아래 분기). 프롬프트/스키마/worktree 격리 불변.
const runHealer = (bug) => {
  const bugLabel = `phase-e:healer-bug-${bug.id}`
  const common = { label: bugLabel, phase: 'Fix', schema: HEALER_SCHEMA, agentType: 'healer', isolation: 'worktree' }
  if (bug.complexity === 'HIGH') {
    return agent(
      `Phase E HIGH — Bug #${bug.id}: ${bug.title}. ` +
      `cross-repo PGE+5specialist. bug-fix-plan: ${planResult.planPath}. ` +
      `절대경로 의무(worktree). a0→a1(Why_root_cause)→수정→a4(GREEN×3). bugId=${bug.id}.`,
      common
    )
  }
  if (bug.complexity === 'MODERATE') {
    return agent(
      `Phase E MODERATE — Bug #${bug.id}: ${bug.title}. ` +
      `worktree 격리. bug-fix-plan: ${planResult.planPath}. ` +
      `a0→a1(Why_root_cause)→수정→a4(GREEN×3). bugId=${bug.id}.`,
      common
    )
  }
  if (bug.complexity === 'AMBIGUOUS') {
    // root-cause: Codex HIGH — AMBIGUOUS도 공유 파일 수정 가능. worktree 격리 필수.
    return agent(
      `Phase E AMBIGUOUS — Bug #${bug.id}: ${bug.title}. ` +
      `/investigate 4단계 선행 → 재분류 → 수정. bugId=${bug.id}.`,
      common
    )
  }
  // root-cause: Codex HIGH — SIMPLE 버그도 공유 파일 충돌 가능. worktree 격리 필수.
  return agent(
    `Phase E SIMPLE — Bug #${bug.id}: ${bug.title}. ` +
    `단일 파일 수정. bug-fix-plan: ${planResult.planPath}. ` +
    `a0→a1(Why_root_cause)→수정→a4(GREEN×3). bugId=${bug.id}.`,
    common
  )
}

let healerResults
if (prLanes) {
  // root-cause: P-3 pipeline 레인 — 독립 bug(worktree 격리 = 의존0)을 fix→verify 무배리어 레인으로.
  //   bug A의 검증이 bug B의 수정과 겹침(배리어 제거). 독립성 = worktree 격리 + (선행)P-1 fr-lanes.py.
  //   최종 배치 cr-* 게이트(Phase F)는 불변 — 레인 검증은 조기 per-bug 신호.
  log(`[E/P-3] prLanes ON — ${planResult.bugs.length} bug pipeline 레인(fix→verify 겹침). 최종 cr-* = Phase F 유지`)
  healerResults = await pipeline(
    planResult.bugs,
    (bug) => runHealer(bug),
    (fixRes, bug) => agent(
      `Phase E/P-3 레인 검증 — Bug #${bug.id}: ${bug.title}. ` +
      `해당 fix(worktree)에 cr-bug 조기 검증. fixed=${fixRes?.fixed}. 한 줄 verdict(PASS/WARN/FAIL) + bugId=${bug.id}.`,
      { label: `phase-e:lane-verify-${bug.id}`, phase: 'Fix', schema: HEALER_SCHEMA }
    ).then(v => ({ ...(fixRes || {}), laneVerify: v })).catch((e) => {
      // root-cause: cr-code HIGH — 레인 검증 실패를 침묵 삼키지 말 것. 로그로 표면화(최종 게이트는 Phase F 불변).
      log(`[E/P-3 WARN] lane-verify 실패 bug#${bug.id} (${e?.message || e}) — fix 보존, 최종 cr-* Phase F가 판정`)
      return fixRes
    })
  )
} else {
  // 기본(off): 기존 parallel 배리어 — 동작 100% 동일.
  healerResults = await parallel(planResult.bugs.map(bug => () => runHealer(bug)))
}
const fixedBugs = healerResults.filter(Boolean).filter(r => r.fixed)
log(`[E] 수정: ${fixedBugs.length}/${planResult.bugs.length}건`)
// root-cause: 각 healer isolation:'worktree' = 독립 fix 브랜치 생성. Phase G ship 에이전트가
//   branchResult.branch 기준으로 각 fix 브랜치 git merge --no-ff 수행.
//   충돌 전략: SIMPLE/MODERATE = 자동(--strategy=recursive), HIGH = 수동 검토 요청.
//   HEALER_SCHEMA.branch 필드로 머지 대상 식별. worktree prune = Phase G 종료 후.

// ── Phase F: Validate (cr-* 순차) ──────────────────────────────────────────────
phase('Validate')
const CR_CHECKS = ['cr-bug', 'cr-code', 'cr-test', 'cr-final']
for (const check of CR_CHECKS) {
  const result = await agent(
    `Phase F ${check} 검수. bug-fix-plan: ${planResult.planPath}. ` +
    `${check} 스킬 기준 PASS/WARN/FAIL 판정.`,
    { label: `phase-f:${check}`, phase: 'Validate', schema: CR_SCHEMA }
  )
  if (result?.verdict === 'FAIL') {
    log(`[STOP] ${check} FAIL — ${result?.criticalCount || 0}건 CRITICAL`)
    return { error: `${check}-fail`, summary: result?.summary }
  }
  log(`[F] ${check}: ${result?.verdict}`)
}
// root-cause: crMode gate — 'degrade'/'off' skips codex-critic intentionally (not an error).
let codexFinal = null
if (crMode === 'on') {
  codexFinal = await agent(
    `Phase F Codex cr-final — PR 머지 직전 최종 적대적 검수. ` +
    `bug-fix-plan: ${planResult.planPath}. PASS/WARN/FAIL 판정. check="codex-cr-final".`,
    { label: 'phase-f:codex-final', phase: 'Validate', schema: CR_SCHEMA, agentType: 'codex-critic' }
  )
  // root-cause: Codex HIGH — agent() null 반환(user skip) 시 cr-final 우회. fail-closed 필수.
  // NOTE: null here = unintentional skip (user aborted), not crMode gate → still STOP.
  if (!codexFinal) {
    log('[STOP] Codex cr-final null(skip 감지) — fail-closed. 재실행 필요.')
    return { error: 'codex-cr-final-null' }
  }
  if (codexFinal?.verdict === 'FAIL') {
    log(`[STOP] Codex cr-final FAIL — ${codexFinal?.criticalCount || 0}건 CRITICAL`)
    return { error: 'codex-cr-final-fail', summary: codexFinal?.summary }
  }
  log(`[F] Codex cr-final: ${codexFinal?.verdict}`)
} else {
  log(`[cr] qa Phase F codex-critic skipped (crMode=${crMode})`)
}

// ── Phase G+H: Ship ─────────────────────────────────────────────────────────────
phase('Ship')
const shipResult = await agent(
  `Phase G+H — PR 생성 + CI + develop 머지 + 지식 축적. 브랜치: ${branchResult.branch}. ` +
  `G: gh pr create --base develop --head ${branchResult.branch}. ` +
  `ci-wait.sh 15분 타임아웃. 9개 조건 충족 시 gh pr merge --squash --delete-branch. ` +
  `git checkout develop && git pull && git worktree prune. ` +
  `H: docs/qa/metrics.jsonl append (bugs_found=${allBugs.length}/fixed=${fixedBugs.length}). ` +
  `wiki-sync nohup background. prUrl + merged 반환.`,
  { label: 'phase-g-h:ship', phase: 'Ship', schema: SHIP_SCHEMA }
)
log(`[G] PR: ${shipResult?.prUrl} merged=${shipResult?.merged}`)
log('[H] 지식 축적 완료')

return {
  status: shipResult?.merged ? 'MERGED' : 'PR_OPEN',
  branch: branchResult.branch,
  prUrl: shipResult?.prUrl,
  bugsFound: allBugs.length,
  bugsFixed: fixedBugs.length,
}
