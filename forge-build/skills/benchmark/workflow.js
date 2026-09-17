// root-cause: benchmark는 feature vs develop 순차 비교 필수 (git ops 직렬). 계획서 P1.
// git stash/checkout 공유 상태 → sequential. 컨텍스트 격리 + resume이 주 이점.
export const meta = {
  name: 'benchmark',
  description: 'feature vs develop 브랜치 성능 비교 — 번들/테스트/API 순차 측정 + PASS/WARN/FAIL 판정',
  phases: [
    { title: 'Measure', detail: 'feature 브랜치 메트릭 측정 후 develop baseline 측정' },
    { title: 'Compare', detail: '비교 리포트 생성 + 임계값 판정' },
  ],
}

const METRIC_SCHEMA = {
  type: 'object',
  properties: {
    bundleKb: { type: 'number' },
    testTimeSec: { type: 'number' },
    apiP95Ms: { type: 'number' },
    buildTimeSec: { type: 'number' },
  },
}

// ⚠️ 구 VERDICT_SCHEMA(LLM 이 verdict/maxDeltaPct/report 를 직접 채우던 스키마)는 2026-09-17 제거.
//    판정·표 생성이 benchmark-verdict.mjs 로 내려가면서 LLM 이 그 필드를 만들 일이 없어졌다.

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args
const branch = _a?.branch || 'HEAD'
const baseline = _a?.baseline || 'develop'

// ── Phase 1: Measure ───────────────────────────────────────────────────────────
phase('Measure')
const featureMetrics = await agent(
  `feature 브랜치(${branch}) 메트릭 측정. ` +
  `1) build 후 dist/ 크기(KB). 2) verify.sh code 실행 시간(sec). ` +
  `3) 주요 API 엔드포인트 p95 응답(ms, 없으면 null). 4) build 명령 시간(sec). ` +
  `측정 불가 항목은 null.`,
  { label: 'measure-feature', phase: 'Measure', schema: METRIC_SCHEMA }
)
log(`feature: bundle=${featureMetrics?.bundleKb}KB tests=${featureMetrics?.testTimeSec}s`)

const baselineMetrics = await agent(
  `git stash → ${baseline} 체크아웃 → 동일 메트릭 측정 → 원래 브랜치 복귀. ` +
  `순서: stash → checkout ${baseline} → 측정 → checkout - → stash pop.`,
  { label: 'measure-baseline', phase: 'Measure', schema: METRIC_SCHEMA }
)
log(`baseline: bundle=${baselineMetrics?.bundleKb}KB tests=${baselineMetrics?.testTimeSec}s`)

// ── Phase 2: Compare (결정론 스크립트 — LLM 아님) ──────────────────────────────
// root-cause: 2026-09-17 스킬 LLM→프로그램 전수조사(G2). 이 자리가 하던 일은 전부
//   "두 JSON 의 숫자로 delta% 를 구해 고정 임계값표(+10/+25)와 비교하고 마크다운 표를 그리는 것"
//   이었다 — 빼기와 대소 비교에 LLM 을 쓰면 같은 입력에 같은 답이 보장되지 않는다.
//   판정·표 생성은 shared/scripts/benchmark-verdict.mjs(순수함수)로 옮겼다 — **임계값은 한 글자도
//   안 바뀌었다**(SKILL.md §임계값 표와 동일). 측정(Phase 1)은 그대로 LLM 이 한다.
//   선례 = canary(2026-09-16 `canary-judge.mjs`) — 같은 패턴·같은 실행기 구조.
// ⚠️ 이 배선이 무력화되는 입력: 실행기 에이전트가 stdout 을 지어내면 기계 판정이 무력화된다.
//   스키마가 원문 1줄만 받게 강제하는 것이 유일한 방어다(canary 와 동일한 정직 명시).
// ⚠️ [CMD] 문자열은 평평하게 유지한다 — `{ }`·`if`·중첩 치환을 넣으면 워크트리 격리 가드가 거부한다.
const _forgeRoot = (typeof _a?.forgeRoot === 'string' && /^\/[^\s'"]+$/.test(_a.forgeRoot)) ? _a.forgeRoot.replace(/\/+$/, '') : null
const VERDICT_SCRIPT_SH = _forgeRoot
  ? `${_forgeRoot}/shared/scripts/benchmark-verdict.mjs`
  : `${'${FORGE_ROOT:-$HOME/forge}'}/shared/scripts/benchmark-verdict.mjs`

const _shq = (s) => String(s).split("'").join(`'\\''`)   // 셸 single-quote 안전 이스케이프

async function runVerdictScript(payload, selfCheck = false) {
  const json = JSON.stringify(payload)
  const flag = selfCheck ? ' --self-check' : ''
  const proxy = await agent(
    `Bash 도구로 아래 [CMD] 와 [/CMD] 사이 명령을 **문자열 그대로, 한 번** 실행하고 stdout 의 JSON 한 줄을 그대로 반환하라.\n` +
    `⛔ 너는 판정자가 아니다 — 내용을 해석·요약·수정·재판정하지 마라. 실행기일 뿐이다.\n` +
    `[CMD]\nprintf '%s' '${_shq(json)}' | node "${VERDICT_SCRIPT_SH}"${flag}\n[/CMD]\n` +
    `종료코드와 무관하게 stdout 을 그대로 옮겨라. ` +
    `반환 스키마: {"stdout": "<그 JSON 줄 전체를 그대로>"}. stdout 이 비었으면 stdout="".`,
    { label: selfCheck ? 'verdict-selfcheck-exec' : 'verdict-exec', phase: selfCheck ? 'Evaluate' : 'Compare',
      schema: { type: 'object', properties: { stdout: { type: 'string' } }, required: ['stdout'] } }
  )
  try {
    return JSON.parse(String(proxy?.stdout || '').trim())
  } catch (e) {
    return null
  }
}

phase('Compare')
const judgeInput = { feature: featureMetrics || {}, baseline: baselineMetrics || {} }
let verdict = await runVerdictScript(judgeInput)
if (!verdict || typeof verdict.verdict !== 'string') {
  // 판정을 못 돌렸다 = 성능을 판정할 근거가 없다. PASS 로 추정하지 않는다(fail-closed).
  log('[STOP] 판정 스크립트 실행 불가 — benchmark-verdict.mjs 경로/실행 확인 필요')
  verdict = {
    verdict: 'INCONCLUSIVE',
    maxDeltaPct: null,
    report: `판정 스크립트(${VERDICT_SCRIPT_SH}) 실행 불가 — 성능 미판정`,
    evaluator: { evalVerdict: 'FAIL' },
  }
}
log(`benchmark ${verdict?.verdict}: maxΔ=${verdict?.maxDeltaPct ?? 'n/a'}%`)
if (verdict?.unmeasured?.length) log(`[WARN] 미측정 지표: ${verdict.unmeasured.join(', ')}`)

// ── Phase 3: Evaluate (독립 검증 — 재계산 diff) ────────────────────────────────
// root-cause: 종전에는 **LLM 판정을 또 LLM(sonnet)으로 재검증**했고, 그 3기준은 전부
//   "3개 지표가 있나 / % 가 있나 / 판정이 붙었나"(존재·산술)였다. 판정이 스크립트가 된 뒤로
//   그 일은 `재계산 결과 == 기록된 결과` 대조 한 줄이 된다 — 원본 3기준은
//   benchmark-verdict.mjs §evaluator 에 그대로 옮겨져 있다(무손실).
// ⚠️ 재시도 루프를 없앴다: 판정이 결정론이라 같은 입력으로 다시 돌리면 반드시 같은 답이 나온다 —
//   "재측정 1회 재시도"는 loop theater 다. 미측정은 측정 단계(Phase 1)로 돌아가야 할 일이지
//   같은 숫자를 다시 비교할 일이 아니다.
// ⚠️ 이 검증이 무력화되는 입력: 워크플로 안에서는 verdict 가 방금 그 스크립트의 출력이라 대조가
//   구조적으로 항상 일치한다(= 여기서는 evaluator 3기준만 실효). 판별력은 **저장된 리포트**를
//   대상으로 `--self-check` 를 돌릴 때 나온다 — SKILL.md §독립 Evaluator 가 그 경로다.
phase('Evaluate')
const evalResult = await runVerdictScript(
  { ...judgeInput, recorded: { verdict: verdict?.verdict, maxDeltaPct: verdict?.maxDeltaPct } },
  true
)
const evalVerdict = evalResult?.evaluator?.evalVerdict || verdict?.evaluator?.evalVerdict || 'FAIL'
const evalMatch = evalResult?.selfCheck?.match
log(`evaluator: ${evalVerdict} (재계산 대조 match=${evalMatch ?? 'n/a'})`)
if (evalVerdict === 'FAIL') {
  log(`[STOP] 측정 자체가 불충분하다 — ${evalResult?.evaluator?.c1_detail ?? verdict?.evaluator?.c1_detail ?? ''}`)
  return { verdict: verdict?.verdict, halt: true, evalFailed: true, feedback: evalResult?.evaluator, report: verdict?.report }
}
if (evalMatch === false) {
  log(`[STOP] 기록된 판정과 재계산이 다르다 — ${JSON.stringify(evalResult?.selfCheck?.mismatches || [])}`)
  return { verdict: verdict?.verdict, halt: true, evalFailed: true, feedback: evalResult?.selfCheck, report: verdict?.report }
}

return { verdict: verdict?.verdict, maxDeltaPct: verdict?.maxDeltaPct, report: verdict?.report }
