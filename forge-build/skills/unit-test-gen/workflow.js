// root-cause: unit-test-gen = pipeline(파일) 병렬 + 뮤테이션 점수 집계. SDD Phase 3 트리거 대응. 계획서 P2-5.
export const meta = {
  name: 'unit-test-gen',
  description: '유닛 테스트 자동 생성 Workflow — pipeline(파일별 병렬) + 뮤테이션 점수 집계 + 커버리지 리포트',
  phases: [
    { title: 'Discover', detail: '프레임워크 감지 + 테스트 대상 파일 목록 추출' },
    { title: 'Generate', detail: 'pipeline(파일, 분석→생성→뮤테이션강화) 병렬' },
    { title: 'Report', detail: '커버리지 + 뮤테이션 점수 집계 + 리포트' },
  ],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args

const targetPath = _a?.targetPath || '.'
const framework = _a?.framework || ''  // 빈 값 시 자동 감지

const DISCOVER_SCHEMA = {
  type: 'object',
  properties: {
    framework: { type: 'string' },
    testFileExt: { type: 'string' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          isCritical: { type: 'boolean' },
          existingTest: { type: 'string' },
          mutationTarget: { type: 'number' },
        },
        required: ['path', 'isCritical'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['framework', 'files', 'summary'],
}

const GEN_SCHEMA = {
  type: 'object',
  properties: {
    sourceFile: { type: 'string' },
    testFilePath: { type: 'string' },
    casesGenerated: { type: 'number' },
    mutationScore: { type: 'number' },
    coverageEstimate: { type: 'number' },
    criticalPathCovered: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['sourceFile', 'testFilePath', 'casesGenerated'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    reportPath: { type: 'string' },
    totalFiles: { type: 'number' },
    avgMutationScore: { type: 'number' },
    avgCoverage: { type: 'number' },
    criticalPathCoverage: { type: 'number' },
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    summary: { type: 'string' },
  },
  required: ['reportPath', 'verdict', 'summary'],
}

// ── Discover ──────────────────────────────────────────────────────────────────
phase('Discover')
const discoverResult = await agent(
  `unit-test-gen Step 1 프레임워크 감지 + 대상 파일 탐색. targetPath="${targetPath}". ` +
  `${framework ? `프레임워크 지정: ${framework}` : '자동 감지: package.json(jest/vitest) / requirements.txt(pytest) / .csproj(xunit/nunit)'}. ` +
  `대상 파일: public 함수 존재 소스 파일 (테스트 파일 제외). ` +
  `각 파일: isCritical(결제/인증/권한/데이터무결성 관련) + existingTest(기존 테스트 경로 or null). ` +
  `isCritical=true → mutationTarget=70 / 일반=50 / 유틸=30. ` +
  `framework + testFileExt + files[] 반환.`,
  { label: 'discover:files', phase: 'Discover', schema: DISCOVER_SCHEMA, agentType: 'Explore' }
)
if (!discoverResult?.files?.length) {
  log('[INFO] 테스트 생성 대상 파일 없음')
  return { status: 'NO_FILES', targetPath }
}
log(`[Discover] framework=${discoverResult?.framework} files=${discoverResult?.files?.length}개`)

// ── Generate: pipeline(파일 병렬) ─────────────────────────────────────────────
phase('Generate')
const genResults = await pipeline(
  discoverResult.files,
  (file, _, idx) => agent(
    `unit-test-gen 파일 테스트 생성. sourceFile="${file.path}" framework="${discoverResult.framework}". ` +
    `isCritical=${file.isCritical} mutationTarget=${file.mutationTarget || 50}%. ` +
    `${file.existingTest ? `기존 테스트 Read: "${file.existingTest}" → 커버리지 갭만 추가.` : '신규 테스트 파일 생성.'} ` +
    `Step3 소스분석: public함수/의존성/에러경로/경계값. ` +
    `Step4 테스트생성: 함수당 최소 3케이스(happy/edge/error). ` +
    `Step5 저장: ${discoverResult.testFileExt} 패턴 준수. ` +
    `isCritical=true → 뮤테이션 강화(분기/조건/경계값 추가 케이스). ` +
    `testFilePath + casesGenerated + mutationScore + coverageEstimate + criticalPathCovered 반환.`,
    { label: `gen:file-${idx}`, phase: 'Generate', schema: GEN_SCHEMA }
  )
)

const successFiles = genResults.filter(Boolean).filter(r => r.testFilePath)
const avgMutation = successFiles.length > 0
  ? successFiles.reduce((s, r) => s + (r.mutationScore || 0), 0) / successFiles.length
  : 0
log(`[Generate] 성공=${successFiles.length}/${discoverResult.files.length} avgMutation=${avgMutation.toFixed(1)}%`)

// ── Report ────────────────────────────────────────────────────────────────────
phase('Report')
const criticalFiles = successFiles.filter(r => {
  const orig = discoverResult.files.find(f => f.path === r.sourceFile)
  return orig?.isCritical
})
const criticalCoverage = criticalFiles.length > 0
  ? criticalFiles.filter(r => r.criticalPathCovered).length / criticalFiles.length * 100
  : 100

const reportResult = await agent(
  `unit-test-gen 리포트. 생성 결과: ${JSON.stringify(genResults.filter(Boolean))}. ` +
  `avgMutation=${avgMutation.toFixed(1)}% criticalCoverage=${criticalCoverage.toFixed(1)}%. ` +
  `판정: critical 경로 mutationScore<70% → FAIL / avgMutation<50% → WARN / else PASS. ` +
  `docs/unit-test-gen-report.md 저장. ` +
  `reportPath + totalFiles + avgMutationScore + avgCoverage + criticalPathCoverage + verdict 반환.`,
  { label: 'report:final', phase: 'Report', schema: REPORT_SCHEMA }
)
log(`[Report] ${reportResult?.verdict} avgMutation=${reportResult?.avgMutationScore}% criticalCov=${reportResult?.criticalPathCoverage}%`)

return {
  verdict: reportResult?.verdict,
  totalFiles: successFiles.length,
  avgMutationScore: reportResult?.avgMutationScore,
  reportPath: reportResult?.reportPath,
}
