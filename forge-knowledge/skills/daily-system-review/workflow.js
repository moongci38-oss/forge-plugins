// root-cause: AD-121 bug — 기존 직렬 실행 → parallel() 재작성. 계획서 P0-3.
// daily-system-review workflow.js — parallel() 5 Teammate + cross-verify
export const meta = {
  name: 'daily-system-review',
  description: 'AI 시스템 일일 경량 스캔 — 6-Tier 병렬 수집 + adversarial cross-verify',
  phases: [
    { title: 'Collect', detail: '5 Teammate parallel() — Tier 1~6 동시 수집' },
    { title: 'CrossVerify', detail: 'tech/sys adversarial cross-verify' },
    { title: 'Synthesize', detail: 'Lead 종합 분석 + 리포트' },
    { title: 'Publish', detail: 'Notion 등록 + index.json' },
  ],
}

const TIER_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          source: { type: 'string' },
          tier: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL','BREAKING','DEPRECATED','INFO'] },
          summary: { type: 'string' },
        },
        required: ['title','source','tier','severity','summary'],
      },
    },
    tiers_covered: { type: 'array', items: { type: 'string' } },
  },
  required: ['items','tiers_covered'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['PASS','WARN','FAIL'] },
    issues: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
  required: ['verdict','confidence'],
}

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args
const date = _a?.date || new Date().toISOString().split('T')[0]

// ── Phase 1: Collect (parallel — 5 Teammate 동시) ─────────────────────────────
phase('Collect')
const [tierAB, tierCD, sysSnap, forge, constraint, stockBrief] = await parallel([
  () => agent(
    `Tier 1+2 수집 (${date}): Anthropic/OpenAI/Google 공식 발표 + GitHub 릴리즈·Trending. ` +
    `Critical/Breaking/Deprecated 변경만 추출. severity 분류 필수.`,
    { label: 'tier-AB', phase: 'Collect', schema: TIER_SCHEMA, model: 'haiku' }
  ),
  () => agent(
    `Tier 3+4 수집 (${date}): arXiv AI/ML 논문 + HN/Reddit/Twitter AI 커뮤니티. ` +
    `실용 적용 가능 내용 우선. severity 분류.`,
    { label: 'tier-CD', phase: 'Collect', schema: TIER_SCHEMA, model: 'haiku' }
  ),
  () => agent(
    `Tier 5+6 시스템 현황 (${date}): Claude Code 릴리즈 + MCP 생태계 변동. ` +
    `forge 시스템 영향도 직결 항목만.`,
    { label: 'sys-snap', phase: 'Collect', schema: TIER_SCHEMA, model: 'haiku' }
  ),
  () => agent(
    `forge 내부 현황 (${date}): git log 최근 5건 + override-rate.log + 활성 WARN 확인. ` +
    `실측값 기반 — 추측 금지.`,
    { label: 'forge-internal', phase: 'Collect', schema: TIER_SCHEMA }
  ),
  () => agent(
    `Constraint Drift 감사 (AD-120): $HOME/.claude/override-rate.log 읽어 5%+ WARN 감지. ` +
    `hook bypass 패턴 확인.`,
    { label: 'constraint-drift', phase: 'Collect', schema: TIER_SCHEMA }
  ),
  // root-cause: 주식 리서치 배선 — mode: daily(경량 1~2줄). fail-open(watchlist 없으면 stock-research-analyst가 자체 skip 반환; throw/빈결과여도 기존 워커 결과 불변).
  () => agent(
    `관심종목 리서치 (${date}, mode: daily): stock-watchlist.json 기반 종목별 1~2줄 경량 브리핑(최근 24~48h 핵심 뉴스만). 심층 분석 금지. 워치리스트 없으면 skip 사유만 반환.`,
    { label: 'stock-brief', phase: 'Collect', model: 'sonnet', agentType: 'stock-research-analyst' }
  ).catch((e) => { log(`[WARN] stock-brief 수집 실패(fail-open, 기존 수집 불변): ${e?.message || e}`); return null }),
])
const totalItems = [tierAB, tierCD, sysSnap, forge, constraint]
  .reduce((n, t) => n + (t?.items?.length||0), 0)
log(`Collect: ${totalItems}건 (Tier 1-6 + forge + drift)`)

// ── Phase 2: CrossVerify (adversarial — 계획서 P0-3) ─────────────────────────
phase('CrossVerify')
const [techVerify, sysVerify] = await parallel([
  () => agent(
    `Tier 1~4 주장 교차검증 (${date}). 출처 근거 없는 주장·날짜 불일치·중복 발견. ` +
    `totalItems=${tierAB?.items?.length||0 + tierCD?.items?.length||0}건.`,
    { label: 'tech-verify', phase: 'CrossVerify', schema: VERIFY_SCHEMA }
  ),
  () => agent(
    `forge 시스템 현황 실측 재검증 (AD-117). forge-internal 결과 vs 실제 파일/git 불일치 감지. ` +
    `self-report 실측 의무 — subagent 추측 수용 금지. ` +
    // root-cause: P3-23 — 시크릿 가드가 SKILL.md 정책 문서에만 있고 **실제 호출 프롬프트에는
    //   없었다.** 워커는 SKILL.md 를 읽지 않고 이 문자열만 받으므로, 정책이 워커에게 전달되지
    //   않는다. 정책은 소비 지점에 인라인으로 있어야 발효된다.
    '⚠️ 시크릿 가드: .env·.claude.json·.mcp.json 의 **값을 출력하지 마라**. 키명(변수 이름)만 언급하고 값은 *** 로 마스킹한다. 파일 존재·키 목록까지가 보고 범위다.',
    { label: 'sys-verify', phase: 'CrossVerify', schema: VERIFY_SCHEMA }
  ),
])
log(`CrossVerify: tech=${techVerify?.verdict}(${techVerify?.confidence?.toFixed(2)}) sys=${sysVerify?.verdict}(${sysVerify?.confidence?.toFixed(2)})`)

// ── Phase 3: Synthesize ───────────────────────────────────────────────────────
phase('Synthesize')
await agent(
  `daily-system-review 종합 리포트 (${date}). ` +
  `ai-system-analysis.md + system-improvement-plan.md 2종 생성. ` +
  `저장: forge-outputs/01-research/daily/${date}/. ` +
  `tech_verify=${techVerify?.verdict} sys_verify=${sysVerify?.verdict}. ` +
  `Critical/Breaking 항목 최상단 배치. ` +
  // M3 WARN 다이제스트 (2026-07-16): 리포트 §2 '우리 시스템 현황' 앞에 실행 결과 3줄 삽입, 실패 시 1줄 비차단
  `리포트 §2에 Bash(bash \${FORGE_ROOT:-$HOME/forge}/shared/scripts/warn-digest.sh) 출력 3줄을 '### 2.0 WARN 다이제스트'로 포함(실패 시 '생성 실패(비차단)' 1줄).` +
  // root-cause: P3-3 — weekly 는 stock-brief 를 stock-trends.md 로 저장하는데 daily 는 저장 지시가
  //   없어 수집만 되고 파일로 남지 않았다(다음 날 대조 불가). 비대칭을 해소한다.
  //   skip 이면 파일을 만들지 않는다 — 빈 파일은 '수집했는데 내용 없음'과 구분이 안 된다.
  `stock-brief 결과가 있으면 forge-outputs/01-research/daily/${date}/stock-brief.md 로 별도 저장(투자자문 아님 배너 유지). skip 사유만 왔으면 파일 생성 생략하고 그 사유를 리포트에 1줄로 남길 것.`,
  { label: 'synthesize', phase: 'Synthesize' }
)
log('Synthesize 완료')

// root-cause: 학습노트 배선 — 그날 리포트 md 경로들을 concept-notes-writer에 전달, study-notes.md 생성.
// fail-open: 실패/빈결과여도 기존 daily 산출(분석 리포트 2종)에는 영향 없음, 로그만 남김.
const DAILY_DIR = `forge-outputs/01-research/daily/${date}`
let studyNotes
try {
  studyNotes = await agent(
    `그날 daily-system-review 리포트에서 핵심 개념 노트 생성. 입력 경로(존재하는 것만 전량 Read): ` +
    `${DAILY_DIR}/ai-system-analysis.md, ${DAILY_DIR}/system-improvement-plan.md. ` +
    `개념 후보 0개면 파일 생성 생략. 저장 경로: ${DAILY_DIR}/study-notes.md.`,
    { label: 'study-notes', phase: 'Synthesize', model: 'sonnet', agentType: 'concept-notes-writer' }
  )
} catch (e) {
  log(`[WARN] study-notes 생성 실패(fail-open, 기존 산출 불변): ${e?.message || e}`)
}
log(`Study notes: ${studyNotes ? 'ok' : 'skip'}`)

// ── Phase 4: Publish ──────────────────────────────────────────────────────────
phase('Publish')
await agent(
  `daily-system-review 발행 (${date}). Notion 업로드 시도 (실패 시 로컬만). ` +
  `forge-outputs/01-research/daily/index.json 갱신 의무.`,
  { label: 'publish', phase: 'Publish' }
)
log('Publish 완료')

return {
  date,
  collect: { total: totalItems, stock: stockBrief ? 'ok' : 'skip' },
  verify: { tech: techVerify?.verdict, sys: sysVerify?.verdict },
  studyNotes: studyNotes ? 'ok' : 'skip',
}
