// root-cause: AD-121 bug — 기존 직렬 실행 → parallel() 재작성. 계획서 P0-3.
// daily-system-review workflow.js — parallel() 5 Teammate + cross-verify
export const meta = {
  name: 'daily-system-review',
  description: 'AI 시스템 일일 경량 스캔 — 6-Tier 병렬 수집 + adversarial cross-verify',
  phases: [
    { title: 'Collect', detail: '5 Teammate parallel() — Tier 1~6 동시 수집' },
    { title: 'CrossVerify', detail: 'tech/sys adversarial cross-verify' },
    { title: 'Synthesize', detail: 'Lead 종합 분석 + 리포트' },
    // 근거: 2026-09-25 사람 결정(#1104) — Notion 연동 해제, 로컬 인덱스·리포트 사이트가 유일 경로.
    { title: 'Publish', detail: 'index.json 등록' },
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
// 주식 브리핑(Wave F, stock-research-analyst)은 뺐다 — 사람이 그 에이전트를 지정 삭제했다(#1374). 원본 삭제는
//   되돌리지 않는다(사람 원칙 2026-09-28) · 다시 필요하면 새로 설계한다(#1513).
const [tierAB, tierCD, sysSnap, forge, constraint] = await parallel([
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
    { model: 'sonnet', label: 'forge-internal', phase: 'Collect', schema: TIER_SCHEMA }
  ),
  () => agent(
    `Constraint Drift 감사 (AD-120): ~/.claude/override-rate.log 읽어 5%+ WARN 감지. ` +
    `hook bypass 패턴 확인.`,
    { model: 'sonnet', label: 'constraint-drift', phase: 'Collect', schema: TIER_SCHEMA }
  ),
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
    { model: 'opus', label: 'tech-verify', phase: 'CrossVerify', schema: VERIFY_SCHEMA }
  ),
  () => agent(
    `forge 시스템 현황 실측 재검증 (AD-117). forge-internal 결과 vs 실제 파일/git 불일치 감지. ` +
    `self-report 실측 의무 — subagent 추측 수용 금지. ` +
    // root-cause: P3-23 — 시크릿 가드가 SKILL.md 정책 문서에만 있고 **실제 호출 프롬프트에는
    //   없었다.** 워커는 SKILL.md 를 읽지 않고 이 문자열만 받으므로, 정책이 워커에게 전달되지
    //   않는다. 정책은 소비 지점에 인라인으로 있어야 발효된다.
    '⚠️ 시크릿 가드: .env·.claude.json·.mcp.json 의 **값을 출력하지 마라**. 키명(변수 이름)만 언급하고 값은 *** 로 마스킹한다. 파일 존재·키 목록까지가 보고 범위다.',
    { model: 'opus', label: 'sys-verify', phase: 'CrossVerify', schema: VERIFY_SCHEMA }
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
  `리포트 §2에 Bash(bash \${FORGE_ROOT:-$HOME/forge}/shared/scripts/warn-digest.sh) 출력 3줄을 '### 2.0 WARN 다이제스트'로 포함(실패 시 '생성 실패(비차단)' 1줄).`,
  { model: 'opus', label: 'synthesize', phase: 'Synthesize' }
)
log('Synthesize 완료')

// 학습노트 생성은 2026-09-03 폐지(Human 지시) — concept-notes-writer 를 스폰하지 않는다.
// 2026-09-24: SKILL.md 의 폐지 문구와 실제 배선이 어긋나 있어(폐지 표기 4곳 vs 스폰 3곳) 스폰 쪽을 지웠다.
// 근거: harness-gaps/2026-09-24-study-notes-abolished-but-still-spawned.md · 사람 결정 2026-09-24(스폰 중단).
// 되돌리려면 이 주석을 지우고 SKILL.md 의 폐지 문구도 함께 지운다(한쪽만 고치면 같은 불일치가 재발한다).

// ── Phase 4: Publish ──────────────────────────────────────────────────────────
phase('Publish')
await agent(
  `daily-system-review 발행 (${date}). 로컬 인덱스 등록과 리포트 사이트 발행 기준을 따른다. ` +
  `forge-outputs/01-research/daily/index.json 갱신 의무. ` +
  // 근거: 2026-09-25 사람 결정(#1104) — Notion 연동 해제, 로컬 인덱스·리포트 사이트가 유일 경로.
  `Notion 연동은 수행하지 않는다.`,
  { model: 'sonnet', label: 'publish', phase: 'Publish' }
)
log('Publish 완료')

return {
  date,
  collect: { total: totalItems },
  verify: { tech: techVerify?.verdict, sys: sysVerify?.verdict },
  studyNotes: studyNotes ? 'ok' : 'skip',
}
