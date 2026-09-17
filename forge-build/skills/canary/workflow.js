// root-cause: 헬스 메트릭 3종(에러율/응답시간/메모리) parallel() 수집 + 판정. 계획서 P1.
// 2026-09-16(계획서 §4 2단계): 판정·재검증이 LLM 에서 **결정론 스크립트**로 넘어갔다 —
//   Judge = shared/scripts/canary-judge.mjs(순수함수) · Evaluate = 그 스크립트 `--self-check` 재계산 diff.
//   LLM 이 남은 곳은 Monitor(실제 폴링·정성 이상 탐지)뿐이다.
// ⚠️ canaryEnabled + healthCheckUrl 미설정 시 스킵.
export const meta = {
  name: 'canary',
  description: '배포 후 헬스 모니터링 — 3종 메트릭 parallel() 수집 + 결정론 스크립트 판정',
  phases: [
    { title: 'Monitor', detail: '에러율·응답시간·메모리 parallel 수집 (+ 정성 이상 탐지)' },
    { title: 'Judge', detail: 'canary-judge.mjs 결정론 판정 → PASS/WARN/FAIL/INCONCLUSIVE' },
    { title: 'Evaluate', detail: '--self-check 재계산 diff (판정 재현 대조)' },
  ],
}

const METRIC_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    value: { type: 'number' },
    status: { type: 'string', enum: ['ok', 'warn', 'fail'] },
    detail: { type: 'string' },
  },
  required: ['type', 'value', 'status'],
}

// (구 VERDICT_SCHEMA 제거 — 판정 에이전트가 사라져 이 스키마를 쓰는 호출부가 0 이 됐다.
//  verdict 스키마의 정본은 이제 shared/scripts/canary-judge.mjs 의 반환값이다.)

const _a = (typeof args === 'string') ? (() => { try { return JSON.parse(args) } catch(e) { return null } })() : args
const healthUrl = _a?.healthCheckUrl || 'http://localhost:3000/api/health'
const duration = _a?.duration || 15
const env = _a?.env || 'develop'

// ── Phase 1: Monitor (3종 parallel) ───────────────────────────────────────────
// 여기가 LLM 이 남은 유일한 단계다 — 실제 폴링과 **정성 이상 탐지**(숫자로는 안 보이는 것)를 한다.
// 정성 이상은 detail 에 `qualitative:<사유>` 로 남기고, 그것을 FAIL 로 **분류**하는 일은
// Judge 단계 스크립트가 한다(탐지=LLM / 판정=기계).
const QUALITATIVE_HINT =
  ` 숫자와 별개로, 응답 내용이 명백히 신뢰할 수 없으면(DNS 오염으로 엉뚱한 서버 응답 · 배포 전 빌드 해시가 그대로 오는 stale 캐시 응답 등) ` +
  `detail 에 "qualitative:<무엇을 보고 그렇게 판단했는지>" 를 한 줄로 남겨라. 확신이 없으면 남기지 마라(추측 금지).`
phase('Monitor')
log(`모니터링 시작: ${env} ${duration}분 (${healthUrl})`)
const [errorRate, latency, memory] = await parallel([
  () => agent(
    `에러율 모니터링 ${duration}분. endpoint: ${healthUrl}. 1분 간격 폴링. ` +
    `에러율 >1% → status=warn, >5% → status=fail. 평균 에러율(%) value 반환. type="error-rate".` +
    QUALITATIVE_HINT,
    { label: 'error-rate', phase: 'Monitor', schema: METRIC_SCHEMA }
  ),
  () => agent(
    `응답 시간 모니터링 ${duration}분. endpoint: ${healthUrl}. 1분 간격 폴링. ` +
    `p95 >500ms → status=warn. p95 응답 시간(ms) value 반환. type="latency-p95".` +
    QUALITATIVE_HINT,
    { label: 'latency', phase: 'Monitor', schema: METRIC_SCHEMA }
  ),
  () => agent(
    `메모리 사용량 모니터링 ${duration}분. 1분 간격 프로세스 체크. ` +
    `>80% → status=warn. 평균 메모리 사용률(%) value 반환. type="memory-pct".`,
    { label: 'memory', phase: 'Monitor', schema: METRIC_SCHEMA }
  ),
])

// ── Phase 2: Judge (결정론 스크립트 — LLM 아님) ───────────────────────────────
// root-cause: 계획서 §2 B1(2026-09-16) — canary-judge(model: opus) 가 하던 일이 전부
//   "숫자를 고정 임계값표와 비교" 였다. 배포 판정이라 가장 결정론적이어야 할 자리인데 LLM 이라
//   같은 입력에 같은 출력이 보장되지 않았다(비용·지연도 컸다).
//   판정은 shared/scripts/canary-judge.mjs(순수함수)로 옮겼다 — **임계값은 한 글자도 안 바뀌었다**.
//   정성 판단(DNS 오염·stale 캐시 탐지)만 Monitor 단계 LLM 에 남고, 이 단계는 전부 기계다.
// 절대경로 화이트리스트(forge-multi 선례) — 호출층이 forgeRoot 를 주면 그 레포의 스크립트를 실행한다.
const _forgeRoot = (typeof _a?.forgeRoot === 'string' && /^\/[^\s'"]+$/.test(_a.forgeRoot)) ? _a.forgeRoot.replace(/\/+$/, '') : null
const JUDGE_SCRIPT_SH = _forgeRoot
  ? `${_forgeRoot}/shared/scripts/canary-judge.mjs`
  : `${'${FORGE_ROOT:-$HOME/forge}'}/shared/scripts/canary-judge.mjs`

const _shq = (s) => String(s).split("'").join(`'\\''`)   // 셸 single-quote 안전 이스케이프

// 판정 스크립트를 돌리는 **유일한** 경로 = Bash 실행기 에이전트 1개 — 판정하지 않고 stdout 원문만 실어 나른다.
// root-cause(2026-09-17 P19): 종전 코드는 "경로 A = 동적 import(file://…/canary-judge.mjs)" 를 먼저 시도하고
//   실패하면 이 실행기(구 경로 B)로 폴백했다. 그러나 Workflow 런타임은 스크립트를 **띄우기 전 구문 단계**에서
//   `SyntaxError: import() is not available in workflow scripts.` 로 통째로 거부한다(try/catch 안이어도 같다).
//   그래서 경로 A 는 물론 경로 B 도 **한 번도 돌지 못했다** — 스크립트 전체가 시작 전에 죽었다(이 스킬의
//   Workflow 실행 기록 0건). 실제로 판정이 돈 곳은 SKILL.md 의 직접 실행 흐름(Workflow 비경유)뿐이었다.
//   import 를 걷어내고 실행기 하나로 통일했다. 워크플로 스크립트에는 import()/require() 를 넣지 않는다
//   (정적 가드: shared/scripts/tests/workflow-no-dynamic-import.test.sh).
// ⚠️ 이 배선이 무력화되는 입력: 실행기 에이전트가 stdout 을 지어내면 기계 판정이 무력화된다.
//   스키마가 원문 1줄만 받게 강제하는 것이 유일한 방어이고, 그마저 뚫리면 탐지 수단이 없다(정직 명시).
// ⚠️ [CMD] 문자열은 평평하게 유지한다 — `{ }`·`if`·중첩 치환을 넣으면 워크트리 격리 가드가 통째로 거부한다(PR #578).
async function runJudgeScript(payload, selfCheck = false) {
  const json = JSON.stringify(payload)
  const flag = selfCheck ? ' --self-check' : ''
  const proxy = await agent(
    `Bash 도구로 아래 [CMD] 와 [/CMD] 사이 명령을 **문자열 그대로, 한 번** 실행하고 stdout 의 JSON 한 줄을 그대로 반환하라.\n` +
    `⛔ 너는 판정자가 아니다 — 내용을 해석·요약·수정·재판정하지 마라. 실행기일 뿐이다.\n` +
    `[CMD]\nprintf '%s' '${_shq(json)}' | node "${JUDGE_SCRIPT_SH}"${flag}\n[/CMD]\n` +
    `종료코드와 무관하게 stdout 을 그대로 옮겨라(--self-check 는 불일치 시 exit 1 이어도 stdout 에 JSON 을 낸다). ` +
    `반환 스키마: {"stdout": "<그 JSON 줄 전체를 그대로>"}. stdout 이 비었으면 stdout="".`,
    { label: selfCheck ? 'judge-selfcheck-exec' : 'judge-exec', phase: selfCheck ? 'Evaluate' : 'Judge',
      schema: { type: 'object', properties: { stdout: { type: 'string' } }, required: ['stdout'] } }
  )
  try {
    return JSON.parse(String(proxy?.stdout || '').trim())
  } catch (e) {
    return null
  }
}

phase('Judge')
const metrics = [errorRate, latency, memory].filter(Boolean)
const _mv = (m) => (m && typeof m.value === 'number' && Number.isFinite(m.value)) ? m.value : null
// 정성 신호 회수 — Monitor 프롬프트가 detail 에 `qualitative:<사유>` 로 남기게 돼 있다.
// 탐지는 LLM(응답 내용을 읽어야 안다), 그 신호를 FAIL 로 **분류**하는 것은 스크립트가 한다.
const qualitativeFlags = [errorRate, latency, memory]
  .map((m) => String(m?.detail || ''))
  .flatMap((d) => (d.match(/qualitative:[^\n;]+/g) || []))
const judgeInput = {
  healthCheckUrl: healthUrl,
  errorRate: _mv(errorRate),
  p95Latency: _mv(latency),
  memoryPercent: _mv(memory),
  httpStatus: (typeof _a?.httpStatus === 'number' && Number.isFinite(_a.httpStatus)) ? _a.httpStatus : null,
  baseline: (_a?.baseline && typeof _a.baseline === 'object') ? _a.baseline : null,
  qualitativeFlags,
}
let verdict = await runJudgeScript(judgeInput)
if (!verdict || typeof verdict.verdict !== 'string') {
  // 판정 자체를 못 돌렸다 = 헬스를 판정할 근거가 없다. PASS/WARN 으로 추정하지 않는다(fail-closed).
  log('[STOP] 판정 스크립트 실행 불가 — canary-judge.mjs 경로/실행 확인 필요')
  verdict = {
    verdict: 'INCONCLUSIVE',
    summary: `판정 스크립트(${JUDGE_SCRIPT_SH}) 실행 불가 — 헬스 미판정`,
    rollbackRecommended: false,
    inconclusiveReasons: ['판정 스크립트 실행 불가'],
  }
}
log(`canary ${verdict?.verdict} (${verdict?.mode ?? 'n/a'}) rollback=${verdict?.rollbackRecommended}`)
if (verdict?.specGaps?.length) log(`[WARN] 원본 판정표 미규정 경계값: ${verdict.specGaps.join(' / ')}`)
if (verdict?.unverified?.length) log(`[WARN] 미검증 항목(수집 안 됨): ${verdict.unverified.join(', ')}`)

// ── Phase 3: Evaluate (독립 검증 — 재계산 diff) ───────────────────────────────
// root-cause: 계획서 §2 B2(2026-09-16) — 종전에는 **LLM 판정을 또 LLM(sonnet)으로 재검증**했다.
//   판정이 스크립트가 된 뒤로 그 일은 `재계산 결과 == 기록된 결과` 대조 한 줄이 된다.
//   원본 Evaluator 3기준(C1 메트릭 3종 존재 / C2 임계 초과인데 PASS 아닌가 / C3 모니터링 시간 충족)은
//   canary-judge.mjs §selfCheckRecord 에 그대로 옮겨져 있다.
// ⚠️ 재시도 루프를 **없앴다**: 판정이 결정론이라 같은 입력으로 다시 돌리면 반드시 같은 답이 나온다 —
//   "재판정 1회 재시도"는 이제 loop theater 다. 불일치는 입력·기록이 틀렸다는 뜻이라 사람이 봐야 한다.
// ⚠️ 이 검증이 무력화되는 입력: 워크플로 안에서는 verdict 가 방금 그 스크립트의 출력이라 C2 가
//   구조적으로 항상 일치한다(= 여기서는 C1·C3 만 실효). C2 의 판별력은 **저장된 리포트**를 대상으로
//   `--self-check` 를 돌릴 때 나온다 — SKILL.md 워크플로 6단계가 그 경로다.
phase('Evaluate')
const _observedMin = (typeof _a?.observedDurationMin === 'number' && Number.isFinite(_a.observedDurationMin)) ? _a.observedDurationMin : null
if (_observedMin === null) log('[WARN] 실제 모니터링 소요시간 미기록 — Evaluator C3(조기 종료) 미검증')
const evalRecord = {
  input: judgeInput,
  verdict: verdict?.verdict,
  durationRequestedMin: duration,
  ...(_observedMin === null ? {} : { durationObservedMin: _observedMin }),
}
let evalResult = await runJudgeScript(evalRecord, true)
if (!evalResult || typeof evalResult.evalVerdict !== 'string') {
  // 자체검증을 못 돌렸다 = 검증 안 된 것이다. 통과로 세지 않는다(fail-closed).
  evalResult = { evalVerdict: 'FAIL', mismatches: ['자체검증(--self-check) 실행 불가'], feedback: '[canary/workflow.js §Evaluate] — 재계산 diff 를 돌리지 못했다 → canary-judge.mjs 경로/실행 확인' }
}
log(`evaluator(재계산 diff): ${evalResult.evalVerdict}${evalResult.mismatches?.length ? ` — ${evalResult.mismatches.join(' / ')}` : ''}`)

// INCONCLUSIVE 는 예외다: 그때의 eval FAIL 은 C1(메트릭 결측)이고 그건 판정이 이미 말한 사실과
// 같다. 여기서 FAIL 로 승격하면 **측정도 못 한 배포에 롤백을 권고**하게 되고,
// "INCONCLUSIVE = 미검증(PASS 도 FAIL 도 아님)"(cr-final MERGE-BLOCK PR#99) 규약과 어긋난다.
if (evalResult.evalVerdict === 'FAIL' && verdict?.verdict !== 'INCONCLUSIVE') {
  log('[STOP] 재계산 diff 불일치 — Human 에스컬레이션 필요 (결정론 판정이므로 재시도는 무의미)')
  log('[ROLLBACK] /forge-rollback 즉시 실행 권고 — 배포 안정성 미검증')
  return {
    verdict: 'FAIL',
    halt: true,
    evalFailed: true,
    rollbackRecommended: true,
    rollbackTrigger: '/forge-rollback',
    feedback: evalResult.feedback,
    mismatches: evalResult.mismatches,
    summary: verdict?.summary,
    metrics,
  }
}

// evaluator PASS — judge 결과 사용
if (verdict?.verdict === 'FAIL') {
  log('[STOP] canary FAIL — 롤백 권고: /forge-rollback')
  // root-cause: P0-2b — final FAIL 시 rollback 명시적 트리거 (기존 prose only)
  log('[ROLLBACK] /forge-rollback 즉시 실행 권고')
  return { verdict: 'FAIL', rollbackRecommended: true, rollbackTrigger: '/forge-rollback', summary: verdict?.summary, metrics }
} else if (verdict?.verdict === 'INCONCLUSIVE') {
  // root-cause: cr-final MERGE-BLOCK PR#99 — INCONCLUSIVE = 헬스 미검증(PASS 아님). 자동 진행 금지, halt.
  log('canary INCONCLUSIVE — 헬스 미검증: healthCheckUrl/인프라/네트워크 확인 후 재판정 필요. 자동 진행 중단')
  log('[STOP] canary INCONCLUSIVE — platform층(Release) 자동 진행 금지, Human 재판정 필요')
  return { verdict: 'INCONCLUSIVE', halt: true, rollbackRecommended: false, summary: verdict?.summary, metrics }
} else if (verdict?.verdict === 'WARN') {
  log('canary WARN — 모니터링 지속 권장')
} else {
  log('배포 안정. platform층(Release) 진행 가능.')
}

return { verdict: verdict?.verdict, summary: verdict?.summary, rollbackRecommended: verdict?.rollbackRecommended ?? false, metrics }
