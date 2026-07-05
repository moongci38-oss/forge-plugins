// root-cause: investigate Stage 0~3 = RAG→조사→분석→가설 pipeline() 컨텍스트 격리. 계획서 P2-7.
// Stage 4+5(재현+수정)는 human gate 후 별도 실행 (healer/forge-pge로 위임).
export const meta = {
  name: 'investigate',
  description: '버그 근본 원인 분석 Workflow — RAG 선검색→조사→분석→가설 검증 (컨텍스트 격리, [STOP] human gate)',
  phases: [
    { title: 'RAG', detail: 'Stage 0: learnings.jsonl + git blame 선검색' },
    { title: 'Investigate', detail: 'Stage 1: 소스 탐색 + gitnexus 그래프 분석' },
    { title: 'Analyze', detail: 'Stage 2: 가설 2개+ 수립 + 영향 범위 분석' },
    { title: 'Verify', detail: 'Stage 3: 우선순위 가설 검증 [STOP] before Stage 4' },
  ],
}

const issue = args?.issue || ''
const target = args?.target || '.'
const skipVerify = args?.skipVerify || false  // Stage 3 skip → human이 직접 verify 선택

const RAG_SCHEMA = {
  type: 'object',
  properties: {
    existingCases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          pattern: { type: 'string' },
          fixSummary: { type: 'string' },
        },
        required: ['source', 'pattern'],
      },
    },
    gitChanges: { type: 'array', items: { type: 'string' } },
    ragStatus: { type: 'string', enum: ['FOUND', 'NOT_FOUND', 'GIT_UNAVAILABLE'] },
    summary: { type: 'string' },
  },
  required: ['ragStatus', 'summary'],
}

const INVESTIGATE_SCHEMA = {
  type: 'object',
  properties: {
    suspectFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          reason: { type: 'string' },
          relevantLines: { type: 'string' },
        },
        required: ['file', 'reason'],
      },
    },
    graphAnalysis: {
      type: 'object',
      properties: {
        changedSymbols: { type: 'array', items: { type: 'string' } },
        riskLevel: { type: 'string' },
        affectedProcesses: { type: 'array', items: { type: 'string' } },
      },
    },
    errorMessages: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['suspectFiles', 'summary'],
}

const ANALYZE_SCHEMA = {
  type: 'object',
  properties: {
    hypotheses: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          rootCause: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          impactFiles: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'rootCause', 'confidence'],
      },
    },
    primaryHypothesis: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['hypotheses', 'primaryHypothesis', 'summary'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verifiedHypothesis: { type: 'string' },
    reproduced: { type: 'boolean' },
    rootCauseConfirmed: { type: 'string' },
    fixPlan: { type: 'array', items: { type: 'string' } },
    reportPath: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['verifiedHypothesis', 'reproduced', 'summary'],
}

// ── Stage 0: RAG ──────────────────────────────────────────────────────────────
phase('RAG')
const ragResult = await agent(
  `investigate Stage 0 RAG 선검색. issue="${issue}" target="${target}". ` +
  `1)learnings.jsonl grep 키워드(${issue.split(' ').slice(0, 3).join('/')}). ` +
  `2)git log -- <target> --oneline (최근 10커밋) → 관련 변경 식별. ` +
  `3)bug_report/ 디렉토리 grep 유사 버그. ` +
  `existingCases[] + gitChanges[] + ragStatus 반환.`,
  { label: 'rag:search', phase: 'RAG', schema: RAG_SCHEMA, agentType: 'Explore' }
)
log(`[RAG] status=${ragResult?.ragStatus} cases=${ragResult?.existingCases?.length || 0}개 gitChanges=${ragResult?.gitChanges?.length || 0}개`)

// ── Stage 1: Investigate ──────────────────────────────────────────────────────
phase('Investigate')
const investigateResult = await agent(
  `investigate Stage 1 소스 탐색. issue="${issue}" target="${target}". ` +
  `RAG 결과: ${JSON.stringify(ragResult)}. ` +
  `0.gitnexus_query: "${issue.slice(0, 50)}" → 관련 Process + Symbol. ` +
  `1.에러 재현: 에러 메시지·스택 추출 (로그/스크린샷/테스트 실행). ` +
  `2.의심 파일 탐색: grep 에러 메시지 + git blame 최근 변경 파일. ` +
  `3.경계 식별: 어떤 컴포넌트 책임 경계에서 버그 발생? ` +
  `suspectFiles[] + graphAnalysis + errorMessages[] 반환.`,
  { label: 'investigate:source', phase: 'Investigate', schema: INVESTIGATE_SCHEMA }
)
log(`[Investigate] suspectFiles=${investigateResult?.suspectFiles?.length}개 risk=${investigateResult?.graphAnalysis?.riskLevel}`)

// ── Stage 2: Analyze ──────────────────────────────────────────────────────────
phase('Analyze')
const analyzeResult = await agent(
  `investigate Stage 2 가설 수립. issue="${issue}". ` +
  `RAG: ${JSON.stringify(ragResult?.existingCases)}. ` +
  `조사 결과: ${JSON.stringify(investigateResult)}. ` +
  `철칙: 가설 최소 2개 이상 수립 (1개뿐이면 의심). ` +
  `각 가설: id + title + rootCause(5W1H) + evidence[] + confidence(HIGH/MEDIUM/LOW) + impactFiles[]. ` +
  `gitnexus_impact({target: 최의심 함수, direction: upstream, maxDepth: 2}) 호출 → 영향 범위. ` +
  `primaryHypothesis(가장 높은 confidence id) + hypotheses[] 반환.`,
  { label: 'analyze:hypotheses', phase: 'Analyze', schema: ANALYZE_SCHEMA }
)
log(`[Analyze] 가설=${analyzeResult?.hypotheses?.length}개 primary=${analyzeResult?.primaryHypothesis}`)

if (skipVerify) {
  log('[STOP] skipVerify=true → Stage 3 skip. 가설 목록 반환.')
  return {
    status: 'HYPOTHESES_READY',
    hypotheses: analyzeResult?.hypotheses,
    primaryHypothesis: analyzeResult?.primaryHypothesis,
    ragCases: ragResult?.existingCases?.length,
  }
}

// ── Stage 3: Verify ───────────────────────────────────────────────────────────
phase('Verify')
const verifyResult = await agent(
  `investigate Stage 3 가설 검증. ` +
  `primaryHypothesis="${analyzeResult?.primaryHypothesis}". ` +
  `가설 목록: ${JSON.stringify(analyzeResult?.hypotheses)}. ` +
  `1)재현 테스트 코드 작성 (FAIL 먼저 확인). ` +
  `2)의심 코드 라인 직접 점검. ` +
  `3)gitnexus_detect_changes 호출 → 예상 vs 실제 변경 범위 확인. ` +
  `4)수정 계획 수립(Stage 5 진행용). ` +
  `5)investigate-report.md 생성. ` +
  `verifiedHypothesis + reproduced + rootCauseConfirmed + fixPlan[] + reportPath 반환.` +
  `\n\n[STOP] Stage 3 완료 후 Stage 4+5(재현+수정)는 /healer 또는 /forge-pge로 위임.`,
  { label: 'verify:hypothesis', phase: 'Verify', schema: VERIFY_SCHEMA }
)
log(`[Verify] reproduced=${verifyResult?.reproduced} confirmed="${verifyResult?.rootCauseConfirmed?.slice(0, 60)}"`)
log(`[STOP] Stage 4+5 = /healer 또는 직접 수정 (Workflow 범위 외)`)

return {
  status: verifyResult?.reproduced ? 'ROOT_CAUSE_CONFIRMED' : 'HYPOTHESIS_UNVERIFIED',
  verifiedHypothesis: verifyResult?.verifiedHypothesis,
  rootCause: verifyResult?.rootCauseConfirmed,
  fixPlan: verifyResult?.fixPlan,
  reportPath: verifyResult?.reportPath,
  ragCasesFound: ragResult?.existingCases?.length,
}
