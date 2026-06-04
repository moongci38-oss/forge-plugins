// root-cause: 3개 병렬 이미 구조 → workflow.js 격리로 컨텍스트 오염 방지. 계획서 P1-4.
export const meta = {
  name: 'playwright-parallel-test',
  description: '폼/네비게이션/레이아웃 3개 병렬 UI 테스트 — Playwright',
  phases: [
    { title: 'Test', detail: '3개 병렬 Playwright 테스트 동시 실행' },
    { title: 'Report', detail: '결과 합산 + PASS/FAIL 판정' },
  ],
}

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS','WARN','FAIL'] },
    failCount: { type: 'number' },
    details: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict','failCount'],
}

const baseUrl = args?.baseUrl || 'http://localhost:3000'

// ── Phase 1: Test (3개 parallel()) ───────────────────────────────────────────
phase('Test')
const [formTests, navTests, layoutTests] = await parallel([
  () => agent(
    `폼 검증 테스트. URL: ${baseUrl}. Playwright: 필수 필드 빈값 제출·유효성 메시지·성공 플로우.`,
    { label: 'form-test', phase: 'Test', schema: TEST_SCHEMA }
  ),
  () => agent(
    `네비게이션/라우팅 테스트. URL: ${baseUrl}. Playwright: 메뉴 클릭·URL 변경·뒤로가기·브레드크럼.`,
    { label: 'nav-test', phase: 'Test', schema: TEST_SCHEMA }
  ),
  () => agent(
    `반응형 레이아웃 테스트. URL: ${baseUrl}. Playwright: mobile(375)/tablet(768)/desktop(1280) 3뷰포트.`,
    { label: 'layout-test', phase: 'Test', schema: TEST_SCHEMA }
  ),
])

// ── Phase 2: Report ───────────────────────────────────────────────────────────
phase('Report')
const results = [
  { name: 'form', ...formTests },
  { name: 'nav', ...navTests },
  { name: 'layout', ...layoutTests },
].filter(Boolean)

const failCount = results.reduce((n, r) => n + (r.failCount || 0), 0)
const verdict = results.some(r => r.verdict === 'FAIL') ? 'FAIL'
  : results.some(r => r.verdict === 'WARN') ? 'WARN' : 'PASS'

log(`Test: form=${formTests?.verdict} nav=${navTests?.verdict} layout=${layoutTests?.verdict} → ${verdict}`)
await agent(
  `테스트 리포트 생성. verdict=${verdict} failCount=${failCount}. ` +
  `저장: docs/qa/ui-test-${new Date().toISOString().split('T')[0]}.md`,
  { label: 'report', phase: 'Report' }
)

return { verdict, failCount, results }
