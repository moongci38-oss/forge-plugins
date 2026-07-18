// root-cause: LNB 순회 시 컨텍스트 폭발 → Workflow 격리 + 4개씩 배치. 계획서 P1-3.
export const meta = {
  name: 'bug-report',
  description: 'LNB 전체 메뉴 병렬 순회 + 버그 탐지 — Playwright 배치 실행',
  phases: [
    { title: 'Navigate', detail: 'LNB 메뉴 목록 추출' },
    { title: 'Detect', detail: '4개씩 배치 parallel() Playwright 버그 탐지' },
    { title: 'Report', detail: 'BUG-NNN 형식 리포트 + INDEX.md' },
  ],
}

const MENU_SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'object',
      properties: { name: { type: 'string' }, url: { type: 'string' } },
      required: ['name','url'] } },
  },
  required: ['items'],
}

const BUG_SCHEMA = {
  type: 'object',
  properties: {
    hasBug: { type: 'boolean' },
    menuName: { type: 'string' },
    severity: { type: 'string', enum: ['CRITICAL','HIGH','MEDIUM','LOW'] },
    who: { type: 'string' }, what: { type: 'string' }, when_cond: { type: 'string' },
    where: { type: 'string' }, why: { type: 'string' }, how_repro: { type: 'string' },
  },
  required: ['hasBug','menuName'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    bugCount: { type: 'number' },
    reportPaths: { type: 'array', items: { type: 'string' } },
  },
  required: ['bugCount'],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args
const baseUrl = _a?.baseUrl || 'http://localhost:3000'
// root-cause: P-7 loop-until-dry opt-in greybox. loopUntilDry=false 기본 — 기존 Phase 2 동작 100% 보존.
const loopUntilDry = _a?.loopUntilDry === true || _a?.loopUntilDry === 'on'
const dryK = Math.max(1, Math.min(5, parseInt(_a?.dryK) || 2))

// ── Phase 1: Navigate ─────────────────────────────────────────────────────────
phase('Navigate')
const menuResult = await agent(
  `LNB 메뉴 목록 추출. URL: ${baseUrl}. Playwright로 메인 페이지 접속 후 좌측 네비게이션 메뉴 전체 추출. name + url 형식.`,
  { label: 'menu-extract', phase: 'Navigate', schema: MENU_SCHEMA }
)
const menus = menuResult?.items || []
log(`Navigate: ${menus.length}개 메뉴 발견`)

// ── Phase 2: Detect (4개씩 배치 — chunk() 미지원 → 직접 슬라이싱) ─────────────
// root-cause: P-7 do...while — loopUntilDry=false 시 1회만 실행(기존 동작 동일).
phase('Detect')
const BATCH = 4
const seenBugs = new Set()
const bugs = []
// root-cause: severity 제외 — LLM이 라운드별 severity를 다르게 보고 시 동일 버그 중복 삽입 방지.
const _bugKey = b => `${(b.menuName||'').toLowerCase()}|${(b.what||'').toLowerCase().slice(0, 60)}`
let consecEmpty = 0
// root-cause: P-7 라운드 카운터 — 라운드별 고유 라벨 보장 (캐시 히트 방지).
let roundNum = 0

do {
  roundNum++
  const roundResults = []
  for (let i = 0; i < menus.length; i += BATCH) {
    const batch = menus.slice(i, i + BATCH)
    const batchResults = await parallel(batch.map(menu => () =>
      agent(
        // root-cause: menu.url is required by MENU_SCHEMA — no fallback needed.
        `메뉴 버그 탐지: ${menu.name} (${menu.url}). ` +
        `Playwright로 클릭 후 콘솔 에러·레이아웃 이슈·기능 오작동 탐지. 6하원칙 작성.`,
        { label: `detect-r${roundNum}-${menu.name}`, phase: 'Detect', schema: BUG_SCHEMA }
      )
    ))
    roundResults.push(...batchResults.filter(Boolean))
    log(`[r${roundNum}] Detect: ${i + batch.length}/${menus.length} 완료`)
  }

  const roundBugs = roundResults.filter(r => r.hasBug)
  const freshBugs = roundBugs.filter(b => !seenBugs.has(_bugKey(b)))
  roundBugs.forEach(b => seenBugs.add(_bugKey(b)))
  bugs.push(...freshBugs)

  if (loopUntilDry) {
    if (freshBugs.length === 0) {
      consecEmpty++
      log(`[Detect-dry] 신규 없음 (${consecEmpty}/${dryK})`)
    } else {
      consecEmpty = 0
      log(`[Detect-dry] 신규 버그: ${freshBugs.length}건 (누적 ${bugs.length}건)`)
    }
  }
} while (loopUntilDry && consecEmpty < dryK)

log(`Detect 완료: ${bugs.length}건 버그 발견`)

// ── Phase 3: Report ───────────────────────────────────────────────────────────
phase('Report')
const report = await agent(
  `BUG-NNN 형식 리포트 ${bugs.length}건 생성. ` +
  `저장: docs/bug_report/ + INDEX.md 갱신. ` +
  `bugs: ${JSON.stringify(bugs.map(b => ({ menu: b.menuName, sev: b.severity, what: b.what })))}`,
  { label: 'report-gen', phase: 'Report', schema: REPORT_SCHEMA }
)
log(`Report: ${report?.bugCount || bugs.length}건 리포트 생성`)

return { menus: menus.length, bugs: bugs.length, reports: report?.reportPaths || [] }
