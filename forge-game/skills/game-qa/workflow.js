// root-cause: game-qa Unity MCP + 서버/봇 빌드 = 독립 병렬(parallel()). 계획서 P2-1.
export const meta = {
  name: 'game-qa',
  description: 'Unity 게임 QA Workflow — Unity MCP + 서버/봇 빌드 parallel() + 판정 집계',
  phases: [
    { title: 'Detect', detail: 'Unity MCP 가용성 + 프로젝트 스택 감지' },
    { title: 'Test', detail: 'Unity 테스트 + 서버/봇 빌드 병렬 실행' },
    { title: 'Report', detail: '결과 집계 + game-qa-report.md 생성' },
  ],
}

const project = args?.project || ''

const DETECT_SCHEMA = {
  type: 'object',
  properties: {
    project: { type: 'string' },
    mcpAvailable: { type: 'boolean' },
    unityPath: { type: 'string' },
    serverPath: { type: 'string' },
  },
  required: ['project', 'mcpAvailable'],
}

const TEST_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    testType: { type: 'string' },
    status: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    details: { type: 'string' },
    bugs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string' },
        },
        required: ['title', 'type'],
      },
    },
  },
  required: ['testType', 'status'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    reportPath: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    summary: { type: 'string' },
  },
  required: ['reportPath', 'verdict'],
}

// ── Phase 1: Detect ─────────────────────────────────────────────────────────────
phase('Detect')
const detectResult = await agent(
  `game-qa 프로젝트 감지. project="${project}". ` +
  `game-qa/references/project-stacks.md 읽어 Unity/서버/봇 경로 확인. ` +
  `Unity MCP 가용성 확인(ToolSearch("unity run_tests") 결과 존재 여부). ` +
  `project 이름 + mcpAvailable + unityPath + serverPath 반환.`,
  { label: 'detect:project', phase: 'Detect', schema: DETECT_SCHEMA }
)
if (!detectResult) {
  log('[STOP] 프로젝트 감지 실패')
  return { error: 'detect-failed' }
}
log(`[Detect] 프로젝트=${detectResult.project} MCP=${detectResult.mcpAvailable}`)

// ── Phase 2: Test (Unity + 서버/봇 병렬) ───────────────────────────────────────
phase('Test')
const testResults = await parallel([
  () => agent(
    `Unity 테스트. project=${detectResult.project} unityPath=${detectResult.unityPath}. ` +
    `mcpAvailable=${detectResult.mcpAvailable}. ` +
    `MCP 있을 때: run_tests(editmode) + get_console_logs(Error). UI 버그 시 capture_screenshot(). ` +
    `MCP 없을 때: Unity CLI -runTests -testPlatform editmode → unity-test-results.xml. ` +
    `FAIL > 0 → 테스트명+에러 수집. testType="unity-tests".`,
    { label: 'test:unity', phase: 'Test', schema: TEST_RESULT_SCHEMA }
  ),
  () => agent(
    `서버/봇 빌드 + 소켓 스모크. serverPath=${detectResult.serverPath}. ` +
    `game-qa/scripts/game-verify.sh 실행. ` +
    `T-BUILD(dotnet build) + T-CONNECT(HTTP헬스+Socket.IO핸드셰이크) + ` +
    `T-STATIC(null체크/TODO과다>10건/이벤트상수불일치) + T-BOT(BOT_SMOKE=1 시). ` +
    `testType="server-build".`,
    { label: 'test:server', phase: 'Test', schema: TEST_RESULT_SCHEMA }
  ),
])

const allBugs = testResults.filter(Boolean).flatMap(r => r.bugs || [])
const verdictRaw = testResults.filter(Boolean).some(r => r.status === 'FAIL') ? 'FAIL'
  : testResults.filter(Boolean).some(r => r.status === 'WARN') ? 'WARN' : 'PASS'
log(`[Test] Unity=${testResults[0]?.status} Server=${testResults[1]?.status} 버그=${allBugs.length}건`)

// ── Phase 3: Report ─────────────────────────────────────────────────────────────
phase('Report')
const reportResult = await agent(
  `game-qa 리포트 생성. 결과: ${JSON.stringify(testResults.filter(Boolean))}. ` +
  `docs/qa/game-qa-report.md 생성. ` +
  `형식: Unity테스트(passed/failed/errors) + 콘솔에러 + 서버빌드(T-BUILD/T-CONNECT/T-STATIC) + 판정근거. ` +
  `/eval-rubric --target docs/qa/game-qa-report.md 자동 호출. ` +
  `reportPath + verdict + summary 반환.`,
  { label: 'report:generate', phase: 'Report', schema: REPORT_SCHEMA }
)
log(`[Report] ${reportResult?.verdict}: ${reportResult?.summary}`)

return {
  project: detectResult.project,
  verdict: reportResult?.verdict || verdictRaw,
  reportPath: reportResult?.reportPath,
  bugsFound: allBugs.length,
}
