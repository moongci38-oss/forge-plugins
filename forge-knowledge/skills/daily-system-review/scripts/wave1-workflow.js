// root-cause: AD-121 PoC — Workflow pipeline vs Agent Teams 비교 (daily-system-review Wave 1)
// STATUS: ARCHIVED (2026-05-30 Opus 결정) — AD-121 기각 + SKILL.md 미배선. dead code 보존 사유: AD-122 weekly-research PoC schema 패턴 참조용.
// DO NOT call from SKILL.md. 정본 verdict: ${FORGE_ROOT:-$HOME/forge}-outputs/11-platform/pipelines/reports/ad121-poc-2026-05-30.md
// supersedes_by: AD-122 (weekly-research Wave 1+2+3 PoC, 별도 baseline 의무)
export const meta = {
  name: 'dsr-wave1',
  description: 'Daily System Review Wave 1 — 6-Tier 수집을 Workflow pipeline으로 실행 (AD-121 PoC)',
  phases: [
    { title: 'Wave 1 Tier 수집', detail: '6-Tier 소스 fetch + 분석 pipeline' },
    { title: '수집 결과 집계', detail: '전체 Tier 결과 병합 + 포맷' },
  ],
}

// 6-Tier 정의 (SKILL.md §데이터 수집 소스 준거)
const TIERS = [
  {
    id: 'A',
    name: 'Tier1+2',
    prompt: `AI 기업 공식 소스(Anthropic/OpenAI/Google/Meta 블로그, GitHub trending) 전일 업데이트 수집.
결과: { tier: "Tier1+2", items: [{title, url, summary, category}], collected_at }`,
  },
  {
    id: 'B',
    name: 'Tier3+6',
    prompt: `개발자 커뮤니티(HN, Reddit r/MachineLearning, r/LocalLLaMA) + 산업 미디어(TechCrunch, VentureBeat) 전일 AI/Agentic 동향 수집.
결과: { tier: "Tier3+6", items: [{title, url, summary, category}], collected_at }`,
  },
  {
    id: 'C',
    name: 'Tier4',
    prompt: `YouTube AI/Agentic 채널(Andrej Karpathy, AI Explained, Two Minute Papers 등) 전일 업로드 확인.
결과: { tier: "Tier4", items: [{title, channel, url, summary}], collected_at }`,
    opts: { agentType: 'yt-video-analyst' },
  },
  {
    id: 'D',
    name: 'Tier5',
    prompt: `arXiv cs.AI/cs.LG 전일 논문 중 agentic/LLM/multiagent 핵심 논문 수집.
결과: { tier: "Tier5", items: [{title, authors, arxiv_id, abstract_summary}], collected_at }`,
    opts: { agentType: 'academic-researcher' },
  },
  {
    id: 'E',
    name: 'Tier1-verify',
    prompt: `Tier 1 공식 소스 상태 실측 검증 (AD-117 self-correction). grep/find 실측 결과 인용 필수. 추측 claim 금지.
결과: { tier: "Tier1-verify", verified_claims: [{claim, evidence, status}] }`,
  },
]

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    tier: { type: 'string' },
    items: { type: 'array' },
    collected_at: { type: 'string' },
  },
  required: ['tier'],
}

phase('Wave 1 Tier 수집')

// pipeline: 각 Tier의 fetch/analyze 오버랩 (barrier X)
// Agent Teams 대비 이점: 빠른 Tier 결과 즉시 집계 단계로 이동, 느린 Tier 대기 불필요
const results = await pipeline(
  TIERS,
  (tier) => agent(
    tier.prompt,
    {
      label: `wave1:${tier.id}`,
      phase: 'Wave 1 Tier 수집',
      schema: ITEM_SCHEMA,
      ...(tier.opts || {}),
    }
  )
)

phase('수집 결과 집계')

const valid = results.filter(Boolean)
log(`Wave 1 완료: ${valid.length}/${TIERS.length} Tier 수집`)

const merged = await agent(
  `다음 ${valid.length}개 Tier 수집 결과를 병합하여 일일 동향 요약 작성:
${JSON.stringify(valid, null, 2)}

출력: { summary: "전체 동향 1-2문장", top_items: [{tier, title, significance}], tier_coverage: N }`,
  { label: 'merge', phase: '수집 결과 집계' }
)

return { tiers: valid, merged }
