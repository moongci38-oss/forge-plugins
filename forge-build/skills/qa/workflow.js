// root-cause: qa Phase A~H = 8단계 순차 기반. Phase C(T1~T7) 독립병렬 + Phase E(healer) 복잡도 라우팅 병렬.
// 메인 컨텍스트 격리 + resume. 계획서 P2-1.
// root-cause(2026-07-06, qa-parallel-multiaccount-exhaustive plan): 4축 확장 — ① app(멀티레포 워크스페이스
//   앱 계층) ② domains(콤마 다중 + all 자동열거) ③ accounts(계정별 로그인 매트릭스) ④ exhaustive(요소 전수 크롤).
//   신규 인자 전부 optional — 미지정 시 기존 단일-scope 순차 경로(runOne 1회 호출)로 100% 동일하게 진행한다
//   (회귀 0). 실DB 검증·healer 자동수정 엔진은 무변경(기존 Phase C T1/T3, Phase E 그대로 재사용).
export const meta = {
  name: 'qa',
  description: 'QA 전 사이클 Workflow — Phase A~H (branch→scenarios→bug discovery→fix→cr-*→PR→knowledge). app/domains/accounts/exhaustive 4축 매트릭스 fan-out 지원.',
  phases: [
    { title: 'Setup', detail: 'Phase A0: 리소스 해석(app/domains/accounts) + Phase A: 브랜치 생성 + Phase B: 시나리오 작성' },
    { title: 'Discover', detail: 'Phase C: T1~T7 병렬 버그 발견 (accounts 매트릭스 시 T1/T2 계정별 fan-out)' },
    { title: 'Plan', detail: 'Phase D: 버그 수정 계획서 + evaluator-contract' },
    { title: 'Fix', detail: 'Phase E: healer 복잡도 라우팅 병렬 수정' },
    { title: 'Validate', detail: 'Phase F: cr-* 순차 검증 + Codex final' },
    { title: 'Ship', detail: 'Phase G: PR + CI + develop 머지 + Phase H: 지식 축적 (--report-only 시 PR/CI/머지 생략, 리포트만)' },
  ],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args

// ── 기존 인자 (무변경) ──────────────────────────────────────────────────────────
const scope = _a?.scope || 'full'
const mode = _a?.mode || 'full'  // 'full' | 'hotfix'
// root-cause: crMode gates Phase F Codex spawn. 'degrade'/'off' → skip codex-critic, not an error.
const crMode = _a?.crMode || 'degrade'  // 기본 degrade (Codex-off fail-safe; --cr on 으로 강제) | 'on' | 'off'
// root-cause: P-7 loop-until-dry opt-in greybox. loopUntilDry=false 기본 — 기존 Phase C 동작 100% 보존.
const loopUntilDry = _a?.loopUntilDry === true || _a?.loopUntilDry === 'on'
const dryK = Math.max(1, Math.min(5, parseInt(_a?.dryK) || 2))
// root-cause: P-3 prLanes opt-in greybox — 독립 bug(worktree 격리 = 의존0)을 배리어 없는 pipeline()
//   fix→verify 레인으로. 기본 off → 기존 Phase E parallel 배리어 + Phase F 순차 100% 보존.
//   독립 판정 SSoT = P-1 의존그래프(fr-lanes.py). worktree 격리가 머지충돌 0 보장(Phase E 기존 주석).
const prLanes = _a?.prLanes === true || _a?.prLanes === 'on'

// ── 신규 4축 인자 (2026-07-06, 전부 optional·fail-open) ─────────────────────────
// scope 콤마 파싱(plan §목표1) — 명시 --domains 없으면 --scope csv가 도메인 목록으로 쓰인다.
const scopeCsv = scope.split(',').map(s => s.trim()).filter(Boolean)
const appArg = _a?.app || null            // 'all' | 'portal' | 'opstool' | undefined(CWD 자동감지)
const domainsArg = _a?.domains || null    // 'all' | 'a,b,c' | undefined
const accountsArg = _a?.accounts || null  // 'admin,partner' | undefined
const exhaustiveMode = _a?.exhaustive === true || _a?.exhaustive === 'on'
// A5(2026-07-07): report-only — 발견+리포트만, PR/CI/머지 생략. admin-api류 dev머지=STG배포 위험 회피.
const reportOnly = _a?.reportOnly === true || _a?.reportOnly === 'on' || _a?.['report-only'] === true
// 4축 중 하나라도 명시되면 매트릭스 경로 진입 — 전부 미지정이면 기존 단일 scope 경로(신규 agent 호출 0건, 회귀0).
const useMatrix = Boolean(appArg || domainsArg || accountsArg || exhaustiveMode)

const BRANCH_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    logFile: { type: 'string' },
  },
  required: ['branch'],
}

// root-cause: app/domains/accounts 해석 전용 스키마. guideStop=true = false-green 방지 강제 정지
// (매칭 0건인데도 조용히 빈 스코프로 진행 금지 — plan §2b CRITICAL).
const RESOLVE_SCHEMA = {
  type: 'object',
  properties: {
    guideStop: { type: 'boolean' },
    message: { type: 'string' },
    apps: { type: 'array', items: { type: 'string' } },
    domains: { type: 'array', items: { type: 'string' } },
    accounts: { type: 'array', items: { type: 'string' } },
    available: {
      type: 'object',
      properties: {
        apps: { type: 'array', items: { type: 'string' } },
        domains: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  required: ['guideStop', 'apps', 'domains', 'accounts'],
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
          // root-cause(2026-07-06): 계정 매트릭스 도입 — 어느 계정 실행에서 발견됐는지 optional 태깅.
          // 기존 소비자는 required 필드에 없으므로 무시해도 무방(회귀 0). 계정 미분기 실행은 항상 undefined.
          account: { type: 'string' },
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
          account: { type: 'string' },  // optional — 계정별 리포트 분리용 (2026-07-06)
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

// ── Phase A0: 리소스 해석 (app/domains/accounts, 2026-07-06 — useMatrix일 때만) ──
// root-cause: 실제 qa-config 열람·정규화·alias 매칭·자동열거는 파일시스템 접근이 필요한 판단이라
//   (기존 Phase A/B와 동일 패턴으로) agent()에 위임한다 — workflow.js 자체는 fs를 import하지 않고
//   agent() 자연어 위임 + 결과 스키마 검증만 수행하는 이 파일의 기존 아키텍처를 그대로 따른다.
let matrixApps = [null]
let matrixDomains = scopeCsv.length ? scopeCsv : ['full']
let matrixAccounts = []  // 빈 배열 = 계정 미분기(기존 단일 세션 동작)

if (useMatrix) {
  phase('Setup')
  const resolveResult = await agent(
    `Phase A0 — QA 리소스 해석. app="${appArg || ''}" domains="${domainsArg || ''}" accounts="${accountsArg || ''}". ` +
    `워크스페이스 루트의 qa-config(.claude/qa-config.json 또는 docs/qa/qa-config.json(qa-setup 생성 경로) ` +
    `또는 workspace 루트 동일 파일 — 이 우선순위로 탐색, 스키마: ` +
    `~/forge/.claude/skills/qa/reference.md §qa-config 스키마)가 있으면 그 apps/domains/accounts 블록을 사용하라. ` +
    `없으면 프로젝트 실측으로 도메인 자동열거(dev-spec 디렉토리 목록 또는 App Router 파일트리 apps/web/src/app/ 등)를 ` +
    `fallback으로 시도하되, 그마저 불가하면 domains=${JSON.stringify(scopeCsv.length ? scopeCsv : ['full'])} ` +
    `그대로 유지(graceful fallback, guideStop=false)하라. ` +
    `app/domains 입력값 매칭은 kebab-case·공백·대소문자 무시 정규화 + alias 테이블 허용. 'all'은 해당 축 전체 자동 열거. ` +
    `accounts는 qa-config accounts 블록 키만 사용(크레덴셜 평문 절대 금지 — env ref만), 명시 안 하면 accounts=[]. ` +
    `⚠️ CRITICAL(false-green 방지): app 또는 domains 입력이 있는데(비어있지 않은데) 정규화+alias 매칭 후에도 0건이면 ` +
    `절대 조용히 빈 스코프로 진행하지 말고 guideStop=true + message="매칭 도메인/앱 없음. 사용 가능: [...]" + ` +
    `available.apps/available.domains에 실제 열거된 전체 목록을 담아 반환하라 — 이것이 QA GUIDE-STOP 지점이다. ` +
    `app 입력이 비어있으면(미지정) apps=[](레이어 없음 판정, CWD 단일앱으로 처리)로 반환.`,
    { label: 'phase-a0:resolve', phase: 'Setup', schema: RESOLVE_SCHEMA }
  )
  if (!resolveResult) { log('[STOP] Phase A0 실패 — 리소스 해석 불가'); return { error: 'phase-a0-failed' } }
  if (resolveResult.guideStop) {
    log(`[GUIDE-STOP] ${resolveResult.message}`)
    return { error: 'guide-stop', message: resolveResult.message, available: resolveResult.available }
  }
  matrixApps = resolveResult.apps?.length ? resolveResult.apps : [null]
  matrixDomains = resolveResult.domains?.length ? resolveResult.domains : (scopeCsv.length ? scopeCsv : ['full'])
  matrixAccounts = resolveResult.accounts?.length ? resolveResult.accounts : []
  log(`[A0] apps=${JSON.stringify(matrixApps)} domains=${JSON.stringify(matrixDomains)} accounts=${JSON.stringify(matrixAccounts)} exhaustive=${exhaustiveMode}`)
}

// apps × domains = 독립 브랜치/PR 축(구조적 fan-out). accounts는 각 combo의 Phase C 내부에서
// T1/T2를 계정별로 추가 실행하는 "발견 배율" 축이다(별도 브랜치를 만들지 않음 — 동일 도메인을
// 여러 계정으로 검증해도 그 도메인의 수정·PR은 하나로 수렴시켜 중복 PR/머지충돌을 피한다).
const combos = []
for (const a of matrixApps) {
  for (const d of matrixDomains) {
    combos.push({ app: a, domain: d })
  }
}

// ── Phase A~H 본체 — 1 combo(=1 app×domain)당 1회 실행 (기존 로직 그대로, 함수로 추출) ──
async function runOne({ scope, appId, accounts, exhaustive, tag }) {
  const tagPrefix = tag ? `${tag}:` : ''
  const appNote = appId ? ` app="${appId}".` : ''

  // ── Phase A+B: Setup ───────────────────────────────────────────────────────────
  phase('Setup')
  const branchResult = await agent(
    `Phase A — QA 브랜치 생성. scope="${scope}" mode="${mode}".${appNote} ` +
    `qa SKILL.md Phase A 절차: develop 확인, ` +
    // root-cause(D2d, 2026-07-07): forge-implement preflight와 동일한 stale-base 확인(WARN-only, 비차단).
    //   base(develop)가 origin 대비 뒤처졌으면 낡은 base 위 QA 위험을 경고만 한다(fetch 실패=fail-open 무시).
    `stale-base preflight(WARN-only, 비차단): "git fetch origin develop 2>/dev/null && ` +
    `git rev-list --left-right --count origin/develop...HEAD" 실행 → behind(좌측 카운트) ≥ 10이면 ` +
    `"[stale-base WARN] 현재 브랜치가 origin/develop 대비 {behind}커밋 뒤처짐 — git rebase origin/develop 권장(비차단)" 출력 후 그대로 진행(fetch 실패/원격없음=silent skip). ` +
    `fix/qa-${appId ? appId + '-' : ''}${scope}-* idempotency 검사, ` +
    `신규 브랜치 생성(fix/qa-${appId ? appId + '-' : ''}${scope}-$(date +%Y-%m-%d)). ` +
    `LOG_HTTP=1 LOG_SOCKET=1 LOG_DB=1 export. ` +
    // root-cause(A6, 2026-07-07): 앱-특정 인프라(라이선스 env 미주입 광역 500 등)를 스킬이 몰라 수동 대처가 필요했다.
    //   qa-config.serverSetup(reference.md §qa-config 스키마)이 있으면 그 startCommand/licenseEnv/healthUrl로
    //   서버를 기동·판정한다 — 앱 특정값 하드코딩 없음, 전부 프로젝트 선언.
    `서버 기동(선택): qa-config에 serverSetup이 있으면 licenseEnv에 나열된 env 키를 .env/secret에서 주입 후 startCommand로 기동, healthUrl 있으면 그 URL이 응답할 때까지 readyTimeoutSec(기본 60초) 대기 후 진행. serverSetup 미선언·기동 실패 시 → 기존 스택 자동감지 fallback(WARN, 비차단). ` +
    `브랜치명 + log 경로 반환.`,
    { label: `${tagPrefix}phase-a:branch`, phase: 'Setup', schema: BRANCH_SCHEMA }
  )
  if (!branchResult) { log('[STOP] Phase A 실패 — 브랜치 생성 불가'); return { error: 'phase-a-failed' } }
  log(`[A] 브랜치: ${branchResult.branch}`)

  const scenariosResult = mode === 'hotfix' ? null : await agent(
    `Phase B — QA 시나리오 작성. 브랜치=${branchResult.branch}. ` +
    `qa-setup → gitnexus route_map → scenarios.md 8 카테고리 강제(모두 1개+). ` +
    // root-cause(C1, 2026-07-07): route-centric(route_map) 커버리지는 "메뉴가 존재하지 않는 화면을
    //   가리키는" 사각지대를 못 잡는다. qa-config가 menuSource(BE 메뉴 테이블 쿼리 또는 메뉴 API
    //   엔드포인트, reference.md §Coverage & Isolation)를 선언하면 menu-centric 커버리지를 추가한다.
    //   앱 특정값(테이블명/필드) 하드코딩 없음 — 전부 menuSource 설정에서만 온다.
    `menu-centric 커버리지(C1, optional): qa-config에 menuSource(type=db-query|api, query|endpoint, pathField, activeField[, roleField])가 있으면 ` +
    `그 소스로 ACTIVE 메뉴 항목을 열거 → (active_menu 경로 ∖ route_map 구현 라우트) = 미구현 메뉴 목록을 계산해 ` +
    `scenarios.md "미구현 메뉴(unimplemented-menu) 커버리지" 절에 surface(각 항목은 후속 BROKEN_LINK 후보). ` +
    `menuSource 미선언·조회 실패 시 → route_map 단독 fallback + "[WARN] menu-centric 커버리지 off — 존재하지 않는 화면을 가리키는 메뉴는 미탐지(route-centric 사각지대)" 1줄 명시(비차단). ` +
    `scope="${scope}" 필터 → scenarios-filtered.md. 면제 시 사유 명시. ` +
    (exhaustive ? `exhaustive 모드 — Phase C T2에서 수집될 clickable 요소 전수 크롤 결과가 이 시나리오 세트를 보강한다는 점을 scenarios.md에 1줄 명시. ` : '') +
    `scenariosPath + filteredCount 반환.`,
    { label: `${tagPrefix}phase-b:scenarios`, phase: 'Setup', schema: SCENARIOS_SCHEMA }
  )
  if (mode !== 'hotfix' && !scenariosResult) {
    log('[STOP] Phase B 실패 — 시나리오 미작성')
    return { error: 'phase-b-failed' }
  }
  log(`[B] 시나리오: ${scenariosResult?.filteredCount || 0}개`)

  // ── Phase C: Discover (T1~T7 병렬, accounts 매트릭스 시 T1/T2 계정별 fan-out) ──────
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

  // root-cause(2026-07-06): accounts 매트릭스 — T1(API)/T2(UI)는 로그인 상태에 따라 접근 가능한
  //   화면·권한이 달라져 계정별 반복 실행 가치가 있다. T3(DB)/T6(보안)/T7(성능)은 인프라·데이터
  //   레벨 검증이라 계정 무관 — 중복 실행하면 비용만 늘고 신호는 늘지 않아 combo당 1회만 유지한다.
  const accountBattery = (accounts && accounts.length) ? accounts : [null]

  do {
    round++
    const perAccountFns = accountBattery.flatMap(acct => {
      const acctNote = acct ? ` account="${acct}"(qa-config accounts["${acct}"] 크레덴셜 env ref로 선행 로그인, 평문 절대 금지).` : ''
      const acctSuffix = acct ? `-${acct}` : ''
      const acctTagInstr = acct ? ` bugs[]에 account="${acct}" 태깅.` : ''
      // root-cause(C2+C3, 2026-07-07): 접근/격리 판정 오탐 방지. 기대-접근 매트릭스는 qa-config에서만
      //   도출한다(앱 특정 역할·라우트 하드코딩 없음) — menuSource.roleField(메뉴별 접근 역할) 또는
      //   accounts["${acct}"].role/expectedRoutes. reference.md §Coverage & Isolation (C2/C3) 참조.
      const accessInstr = acct
        ? ` [C2 404 역참조] 라우트가 404면 무조건 isolation-OK로 흡수 금지 — 활성 메뉴 목록(C1 menuSource)에서 ` +
          `이 account 역할이 접근 가능해야 하는 메뉴가 그 라우트를 가리키면 BROKEN_LINK 버그로 승격(권한 있는데 404=항상 버그). ` +
          `isolation(정상 미노출) 판정은 이 역할이 실제로 grant가 없는 경우에만 유효. ` +
          `[C3 최소권한] 이 account가 도달한 라우트가 기대-접근 집합(menuSource roleField 또는 accounts["${acct}"].expectedRoutes)에 없으면(2xx인데 grant 없음) over-exposure/leak 버그로 파일링(403/redirect 기대). ` +
          `기대-접근 매트릭스 부재 시 "[WARN] 최소권한 검증 제한(기대-접근 매트릭스 없음)" 1줄 명시(비차단).`
        : ''
      return [
        () => agent(
          `Phase C T1 — API 전수 테스트. scenarios=${scenariosResult?.scenariosPath}.${acctNote} ` +
          `verify.sh 실행. 백엔드 7축(HTTP/스키마/로그/데이터무결성/FR/Latency/트랜잭션).${accessInstr} ` +
          `FAIL = flaky 2회 재시도. 버그 발견 시 artifacts/ 3종 로그 수집.${acctTagInstr} testType="T1".`,
          { label: `${tagPrefix}phase-c-r${round}:T1-api${acctSuffix}`, phase: 'Discover', schema: TEST_SCHEMA }
        ),
        () => agent(
          `Phase C T2 — UI 시각 검증. Playwright 3 viewport(mobile/tablet/desktop).${acctNote} ` +
          `프론트 7축(console/network/js/FR/visual-diff/a11y/interaction).${accessInstr} ` +
          (exhaustive
            ? `exhaustive 모드: playwright-devtools-capture.mjs --crawl 사용(계정 로그인 시 동일 헬퍼 --accounts <로그인시퀀스json>) — ` +
              `페이지 내 clickable 요소(button, a[href], input, select, textarea, [role=button], [onclick], [tabindex]) 전수 열거 후 ` +
              `개별 클릭/입력 + 캡처. 삭제·탈퇴·결제·환불·삭제확인 등 파괴적 액션은 헬퍼 내장 스킵리스트로 자동 제외되고 ` +
              `crawl-skipped.json에 사유 기록됨(silent skip 아님) — 그 결과를 bugs[]/리포트에 그대로 반영. ` +
              // root-cause(A6, 2026-07-07): 메뉴 path(/admin/x)가 FE 라우트와 불일치(FE는 cleanPath로 프리픽스 strip)해
              //   프리픽스 경로 직접 nav 시 catch-all placeholder 함정에 빠졌다. qa-config.pathTransform(reference.md §qa-config
              //   스키마)이 있으면 stripPrefix로 실제 FE 라우트를 얻어 nav — 앱 특정값 하드코딩 없음.
              `[pathTransform] 크롤/nav URL 구성 시 qa-config.pathTransform.stripPrefix가 있으면 메뉴 path에서 해당 프리픽스를 제거한 값으로 nav(FE cleanPath 단일트리 대응). 미선언 시 메뉴 path 그대로 사용(기존 동작, fail-open). ` +
              // root-cause(H1-3, 2026-07-07): crawl 결과 해석 시 오탐 방지. 헬퍼가 이미 필터링하지만 판정도 정합화.
              `[H1-3 오탐 방지] crawl-trace 판정: nextjs-portal/[data-nextjs-*] dev-overlay 요소는 crawl-skipped(reason=dev-overlay-excluded)로 제외됨(에러 아님) — 버그로 올리지 말 것. ` +
              `진짜 렌더 에러는 trace.renderError=true(에러페이지 TEXT 매칭)만 인정(portal 존재 자체는 에러 아님). ` +
              `trace.infraFail=true(ERR_CONNECTION_REFUSED 등 connection 실패)는 INFRA FAIL — 절대 PASS/isolation-OK로 채점 금지(INFRA 버그로 파일링). ` +
              `격리(isolation) 마커 사용 시 반드시 unique 비추측 토큰(예: qa-iso-<uuid>) — 200000 등 둥근/generic 값 금지(isGenericIsolationMarker 기준, C3). ` +
              `[C4 mock-unwired 탐지] 데이터를 표시하는 화면(테이블/목록/카드에 행이 렌더됨)인데 상호작용(클릭/필터제출/탭전환/상세오픈) 후 crawl-trace의 network_delta_since_prev=0(특히 /api·/api/proxy 백엔드 호출 0건)이면 → mock 미배선 의심으로 WARN 버그 파일링(false-green 방지). 근거: 실데이터 화면은 상호작용 시 백엔드를 최소 1회 친다. placeholder('준비중'/빈화면)와 구분 — mock은 그럴듯한 데이터 행을 렌더하지만 상호작용이 서버에 안 닿는다. 신호 부재·판정 모호 시 기존 PASS 유지(fail-open, 비차단). `
            : '') +
          `FAIL = 4종 로그 수집 + RED before 스크린샷×3.${acctTagInstr} testType="T2".`,
          { label: `${tagPrefix}phase-c-r${round}:T2-ui${acctSuffix}`, phase: 'Discover', schema: TEST_SCHEMA }
        ),
      ]
    })

    const testResults = mode === 'hotfix' ? [] : await parallel([
      ...perAccountFns,
      () => agent(
        `Phase C T3 — DB 데이터 검증. seed 기준 CRUD 결과 + 무결성(FK/nullable/타입). ` +
        `직접 SQL 쿼리로 실제 저장값 확인. testType="T3".`,
        { label: `${tagPrefix}phase-c-r${round}:T3-db`, phase: 'Discover', schema: TEST_SCHEMA }
      ),
      () => agent(
        // root-cause: B1 (Wave-4) — forge-check-security 구조화 신호 흡수. verdict/criticalCount/halt 명시 매핑.
        // GC7: MEDIUM/LOW handling reverted to report-only (B1 scope = observability only).
        // criticalCount/haltSignal = 의도적 inert (B2 forward-prep) — 현재 STOP은 status==='FAIL' verdict만.
        `Phase C T6 — 보안 스캔. forge-check-security 실행. ` +
        `결과 매핑: verdict=FAIL or criticalCount≥1 → status="FAIL" + haltSignal=true + criticalCount=<N>. ` +
        `HIGH → status="WARN". MEDIUM/LOW → report-only (status 변경 없음). testType="T6". ` +
        `bugs[]에 CRITICAL/HIGH 발견 항목 포함(title+type+complexity="HIGH").`,
        { label: `${tagPrefix}phase-c-r${round}:T6-security`, phase: 'Discover', schema: TEST_SCHEMA }
      ),
      () => agent(
        `Phase C T7 — 성능 기준선. scenarios.md GET 엔드포인트 최대 10개 5회 평균. ` +
        `>2000ms → WARN. >5000ms → FAIL. baseline.json 대비 +25% → WARN. testType="T7".`,
        { label: `${tagPrefix}phase-c-r${round}:T7-perf`, phase: 'Discover', schema: TEST_SCHEMA }
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

  log(`[C] 발견 버그: ${allBugs.length}건 (${accountBattery.filter(Boolean).length || 0}계정 매트릭스)`)

  // ── Phase D: Plan ───────────────────────────────────────────────────────────────
  phase('Plan')
  const planResult = await agent(
    `Phase D — 버그 수정 계획서. 버그: ${JSON.stringify(allBugs)}. ` +
    `docs/qa/$(date +%Y-%m-%d)-bug-fix-plan.md 생성. ` +
    `버그별 필수: 유형/cross_repo/5W1H(Why_hypothesis)/영향파일/복잡도(SIMPLE|MODERATE|HIGH|AMBIGUOUS)/healer분담. ` +
    `버그에 account 필드가 있으면 계획서에도 "발견 계정" 열로 보존(계정별 리포트 분리용, Phase H에서 사용). ` +
    `cross_repo 자동 감지(영향 리포≥2→true). evaluator-contract.json 생성. planPath + bugs[] 반환.`,
    { label: `${tagPrefix}phase-d:plan`, phase: 'Plan', schema: PLAN_SCHEMA }
  )
  if (!planResult?.bugs?.length) {
    log('[QA] 버그 없음 — PASS')
    return { status: 'PASS', bugsFound: 0, branch: branchResult.branch }
  }
  log(`[D] 수정 계획: ${planResult.bugs.length}건`)

  // ── Phase E: Fix — Lane A(`/forge-fix`) 위임 (plan v1.1, 2026-07-03) ───────────
  // root-cause(스테일 정리, 2026-07-05): qa 자체 "Phase E"는 plan v1.1로 폐지되었고 수정+검수 로직은
  //   Lane A(`/forge-fix` ①~④)로 이관됐다(SKILL.md §Phase E 복잡도 라우팅). 이 블록의 healer 직접 호출은
  //   여전히 유효한 실행 경로다 — Lane A가 ③④(수정/검수)에서 재사용하는 것과 동일한 healer 엔진이며,
  //   ①②(조사·재현/리포트)에 해당하는 RED 증거·bug-fix-plan은 위 Phase C/D에서 이미 산출돼 Lane A가
  //   그대로 재사용한다(forge-fix.md "① [Phase C 아티팩트 재사용 가능]"). 실행 로직은 불변 — 아래는
  //   명칭·주석만 Lane A 위임 프레이밍으로 정합화(qa Phase E raw parallel()이 아니라 Lane A 엔진 재사용).
  phase('Fix')
  // root-cause: 개수 자동 라우팅(AD-114, healer.md §개수 자동 라우팅) — 독립 버그 2~9개는 아래 parallel()
  //   배리어(Agent Teams 동등)로 병렬, 10개+/대량 스캔은 이 workflow.js 자체가 Workflow pipeline 경로다.
  //   도메인 충돌 버그는 Lane A/healer.md 내부 도메인 분류(worktree 격리 + seed 재주입 직렬 게이트)로 그룹핑된다.
  // root-cause: P-3 — healer 호출을 함수로 추출(parallel 배리어 / pipeline 레인 양쪽 재사용).
  //   기존 동작 보존: prLanes off → parallel 배리어(아래 분기). 프롬프트/스키마/worktree 격리 불변.
  const runHealer = (bug) => {
    const bugLabel = `${tagPrefix}phase-e:healer-bug-${bug.id}`
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
        { label: `${tagPrefix}phase-e:lane-verify-${bug.id}`, phase: 'Fix', schema: HEALER_SCHEMA }
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
      { label: `${tagPrefix}phase-f:${check}`, phase: 'Validate', schema: CR_SCHEMA }
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
      { label: `${tagPrefix}phase-f:codex-final`, phase: 'Validate', schema: CR_SCHEMA, agentType: 'codex-critic' }
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
  // A5(2026-07-07): reportOnly=true — PR/CI/머지 전부 생략, 리포트+메트릭만. false(기본) — 기존 동작 +
  //   develop-absent graceful degrade 1줄 추가(회귀 0, 기존 문장 그대로 유지).
  const shipPrompt = reportOnly
    ? `Phase G+H(report-only) — PR 생성 + CI +머지 전부 생략, 발견+리포트만. 브랜치: ${branchResult.branch}.${appNote} ` +
      `final-qa-report.md 생성. gh pr create/merge 절대 실행 금지. ` +
      `H: docs/qa/metrics.jsonl append (bugs_found=${allBugs.length}/fixed=${fixedBugs.length}). ` +
      (accountBattery.filter(Boolean).length
        ? `계정별 리포트 분리: final-qa-report.md에 "발견 계정" 열 포함해 계정별 섹션(${JSON.stringify(accountBattery.filter(Boolean))})으로 버그를 그룹핑. `
        : '') +
      `wiki-sync nohup background. prUrl="" + merged=false 반환.`
    : `Phase G+H — PR 생성 + CI + develop 머지 + 지식 축적. 브랜치: ${branchResult.branch}.${appNote} ` +
      `G: gh pr create --base develop --head ${branchResult.branch}. ` +
      `(develop 브랜치 부재 감지 시 — git show-ref --verify refs/heads/develop 실패 — PR/머지를 graceful하게 생략하고 ` +
      `report-only로 degrade + "[WARN] develop 없음 → report-only degrade" 로그. admin-api류 dev머지=STG배포 위험도 동일 degrade.) ` +
      `ci-wait.sh 15분 타임아웃. 9개 조건 충족 시 gh pr merge --squash --delete-branch. ` +
      `git checkout develop && git pull && git worktree prune. ` +
      `worktree prune 직후 누수 gitnexus MCP 정리(harness-gaps G1): bash "\${FORGE_ROOT:-$HOME/forge}/shared/scripts/kill-orphan-gitnexus-mcp.sh". ` +
      `H: docs/qa/metrics.jsonl append (bugs_found=${allBugs.length}/fixed=${fixedBugs.length}). ` +
      (accountBattery.filter(Boolean).length
        ? `계정별 리포트 분리: final-qa-report.md에 "발견 계정" 열 포함해 계정별 섹션(${JSON.stringify(accountBattery.filter(Boolean))})으로 버그를 그룹핑. `
        : '') +
      `wiki-sync nohup background. prUrl + merged 반환.`
  const shipResult = await agent(
    shipPrompt,
    { label: `${tagPrefix}phase-g-h:ship`, phase: 'Ship', schema: SHIP_SCHEMA }
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
}

// ── 최종 디스패치 — combos 1개(기존 무인자/단일-scope 호출) = runOne 1회, 그대로 반환(회귀 0) ──
if (combos.length <= 1) {
  const only = combos[0] || { app: null, domain: (scopeCsv[0] || 'full') }
  return await runOne({ scope: only.domain, appId: only.app, accounts: matrixAccounts, exhaustive: exhaustiveMode, tag: '' })
}

// combos 2개+ — apps×domains 매트릭스 fan-out (기존 parallel() 재사용, 신규 concurrency 로직 없음).
log(`[Matrix] app×domain ${combos.length}개 조합 병렬 fan-out — ${JSON.stringify(combos)}`)
const comboResults = await parallel(combos.map(c => () => runOne({
  scope: c.domain,
  appId: c.app,
  accounts: matrixAccounts,
  exhaustive: exhaustiveMode,
  tag: `${c.app ? c.app + '-' : ''}${c.domain}`,
})))

const allPassOrMerged = comboResults.every(r => r && !r.error)
return {
  status: allPassOrMerged ? 'MATRIX_DONE' : 'MATRIX_PARTIAL',
  combos: combos.map((c, i) => ({ app: c.app, domain: c.domain, result: comboResults[i] })),
  bugsFound: comboResults.reduce((sum, r) => sum + (r?.bugsFound || 0), 0),
  bugsFixed: comboResults.reduce((sum, r) => sum + (r?.bugsFixed || 0), 0),
}
