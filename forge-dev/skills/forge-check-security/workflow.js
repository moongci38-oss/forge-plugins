// root-cause: S1~S6 보안 스캔 6종 parallel() 수행 → CRITICAL 즉시 차단. 계획서 P1.
export const meta = {
  name: 'forge-check-security',
  description: 'OWASP Top 10 보안 스캔 — S1~S6 6종 parallel() + CRITICAL/HIGH/MEDIUM 등급 리포트',
  phases: [
    { title: 'Scan', detail: 'S1(시크릿)~S6(취약의존성) 6종 병렬 정적 분석' },
    { title: 'Report', detail: '등급 집계 + PASS/WARN/FAIL 판정 + docs/qa/security-report.md 생성' },
  ],
}

const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'PASS'] },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'severity'],
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] },
    criticalCount: { type: 'number' },
    highCount: { type: 'number' },
    report: { type: 'string' },
  },
  required: ['verdict', 'report'],
}

const target = args?.target || '.'

const SCANS = [
  { id: 'S1', name: '하드코딩 시크릿', desc: 'password/secret/api_key 하드코딩 grep (CRITICAL)' },
  { id: 'S2', name: 'SQL 인젝션', desc: '문자열 concat SQL 패턴 검출 (HIGH)' },
  { id: 'S3', name: '인증 누락', desc: 'auth 미들웨어 없는 보호 라우트 확인 (HIGH)' },
  { id: 'S4', name: '민감 데이터 로그', desc: 'console.log + password/token 패턴 (MEDIUM)' },
  { id: 'S5', name: 'XSS 위험', desc: 'innerHTML 미검증 입력 패턴 (MEDIUM)' },
  { id: 'S6', name: '취약 의존성', desc: 'npm audit CRITICAL/HIGH 결과 (HIGH)' },
]

// ── Phase 1: Scan (S1~S6 parallel) ────────────────────────────────────────────
phase('Scan')
const results = await parallel(SCANS.map(s => () =>
  agent(
    `보안 스캔 ${s.id}: ${s.name}. 대상 경로: ${target}. ` +
    `${s.desc}. 발견 항목(파일:라인 + 설명) 목록과 실제 severity 반환. id="${s.id}".`,
    { label: `scan-${s.id}`, phase: 'Scan', schema: SCAN_SCHEMA }
  )
))

// ── Phase 2: Report ────────────────────────────────────────────────────────────
phase('Report')
const valid = results.filter(Boolean)
// root-cause: C-2 sweep — valid===0 → report agent이 스캔 없음을 PASS로 오판 위험
if (valid.length === 0) {
  log('[FAIL] 전 스캔 실패 — 보안 감사 불가')
  return { verdict: 'FAIL', error: 'all_scans_failed' }
}
if (valid.length < SCANS.length) log(`[WARN] 스캔 ${valid.length}/${SCANS.length} — 부분 보안 감사`)
const report = await agent(
  `보안 스캔 결과 집계 + docs/qa/security-report.md 생성. ` +
  `스캔 결과: ${JSON.stringify(valid)}. ` +
  `판정 기준: CRITICAL≥1 → FAIL, HIGH≥1 → WARN, 없음 → PASS. ` +
  `report = 마크다운 (CRITICAL/HIGH/MEDIUM/LOW 섹션 + 판정 근거).`,
  { label: 'report', phase: 'Report', schema: REPORT_SCHEMA }
)
log(`security ${report?.verdict}: critical=${report?.criticalCount} high=${report?.highCount}`)
if (report?.verdict === 'FAIL') log('[STOP] CRITICAL 발견 — Phase 1 즉시 차단')

return { verdict: report?.verdict, criticalCount: report?.criticalCount, highCount: report?.highCount }
