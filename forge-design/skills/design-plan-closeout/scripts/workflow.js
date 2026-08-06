// design-plan-closeout/scripts/workflow.js
// 패턴: pev
// Goal: design-plan-verify.sh exit 0 — 디자인 품질 계획서 v3 의 완료 판정 측정명령 전량 PASS (P0.2/0.3/0.5 · P1.1~1.4 · P2 15축 · P3.1 SSoT · P4 지표하네스). Human 게이트 항목(P0.1/0.4 DesignSync write, P4 승격선 적용)은 예측에서 제외하되 DEFERRED 로 명시 출력한다.
// 생성: forge-loop-maker scaffold
//   골격  = templates/workflow.js.tmpl        (이 파일 — 전 패턴 공통부)
//   본문  = templates/workflow.body.pev.js.tmpl  (아래 "패턴 본문 시작" 자리에 주입)
// ⚠️ 골격 안에서 본문 자리표시자 토큰은 **단 한 번만** 등장해야 한다. 주석에라도 한 번 더
//    적으면 그 자리에도 본문이 통째로 주입된다(실측 — scaffold.py 가 개수를 검사한다).
// root-cause: Workflow sandbox = 외부 import 불가 → 커널 패턴을 인라인으로 복사
//
// ⚠️ 패턴마다 루프 본문이 다르다. 이 골격만 고치면 특정 패턴의 판정 방식은 바뀌지 않는다.
//    pev = 외부 verifier exit code / evaluator-optimizer = LLM 루브릭 점수 /
//    orchestrator-workers = 남은 subtask 수 / ralph = 고정 프롬프트 반복.
//    (단일 템플릿이라 --pattern 이 헤더 주석에만 남던 결함 = 백로그 P0-8)

export const meta = {
  name: 'design-plan-closeout',
  description: 'design-plan-verify.sh exit 0 — 디자인 품질 계획서 v3 의 완료 판정 측정명령 전량 PASS (P0.2/0.3/0.5 · P1.1~1.4 · P2 15축 · P3.1 SSoT · P4 지표하네스). Human 게이트 항목(P0.1/0.4 DesignSync write, P4 승격선 적용)은 예측에서 제외하되 DEFERRED 로 명시 출력한다.',
  phases: [
    { title: 'Init',   detail: 'Parse args, 초기 상태·predicate 확인' },
    { title: 'Loop',   detail: 'pev 사이클 — 실행 → 검증(실행자와 분리) → stop-check' },
    { title: 'Report', detail: 'Cycle summary + stop reason + 결과' },
  ],
}

// ── Constants (loop-kernel.js §Constants — 전 패턴 공통) ─────────────────────

const BUDGET_RESERVE      = 20000
const SAME_ISSUE_MAX      = 3
const PLATEAU_EPSILON     = 5
const PLATEAU_CONSECUTIVE = 2
const OSCILLATION_MAX     = 2

// ── Args (공통) ────────────────────────────────────────────────────────────────

const _a = (typeof args === 'string')
  ? (() => { try { return JSON.parse(args) } catch (e) { return {} } })()
  : (args || {})

const goal      = _a?.goal || 'design-plan-verify.sh exit 0 — 디자인 품질 계획서 v3 의 완료 판정 측정명령 전량 PASS (P0.2/0.3/0.5 · P1.1~1.4 · P2 15축 · P3.1 SSoT · P4 지표하네스). Human 게이트 항목(P0.1/0.4 DesignSync write, P4 승격선 적용)은 예측에서 제외하되 DEFERRED 로 명시 출력한다.'
const maxCycles = Number(_a?.maxCycles ?? 6)

log(`[design-plan-closeout] pattern=pev goal="${goal.slice(0,80)}" maxCycles=${maxCycles}`)

// ── 셸 실행 전용 에이전트 (결정론 검증 공통 헬퍼) ─────────────────────────────
// root-cause: Workflow 샌드박스는 fs/exec 접근이 없다 → 스크립트가 직접 명령을 못 돌린다.
//   그래서 **실행자와 분리된 별도 에이전트**가 명령을 돌리고 exit code 만 전달한다.
//   판정 로직은 그 명령(셸 스크립트·테스트 러너)이 소유한다 — 에이전트는 전달자다(S1 검증자 분리).

const SHELL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    exit_code: { type: 'number' },
    stdout:    { type: 'string' },
  },
  required: ['exit_code', 'stdout'],
}

// Windows 세션에서 WSL 레포를 다루면 shellWrap:"wsl" 로 호출한다(경로·git 실측 제약).
const SHELL_WRAP = _a?.shellWrap || ''
function wrapCmd(cmd) {
  return SHELL_WRAP === 'wsl'
    ? `wsl.exe -e bash -lc '${cmd.replace(/'/g, "'\\''")}'`
    : cmd
}

async function sh(cmd, label, phaseName) {
  const r = await agent(
    `아래 명령을 **그대로 1회 실행**하고 결과만 보고하십시오. 해석·수정·재시도 금지.

\`\`\`
${wrapCmd(cmd)}
\`\`\`

반환: { "exit_code": <정수 exit code>, "stdout": "<출력 앞부분 2000자>" }
⚠️ exit_code 를 추측하지 말 것 — 실제 종료 코드를 그대로 보고하십시오.`,
    { label, phase: phaseName, schema: SHELL_SCHEMA, effort: 'low' }
  )
  return r || { exit_code: -1, stdout: '(agent returned null)' }
}

// ── State (공통 — 패턴 본문이 갱신한다) ───────────────────────────────────────

let cycleCount    = 0
let stopReason    = null
let history       = []
let resultLine    = ''     // report 배너 1줄 — 패턴 본문이 채운다
let finalArtifact = ''     // report 첨부  — 패턴 본문이 채운다
let successPrefix = null   // 성공으로 인정할 stopReason 접두사.
                           // 본문이 설정하지 않으면 성공 판정을 하지 않는다(fail-closed).

phase('Init')

// ══ 패턴 본문 시작 — pev ═══════════════════════════════════════════════
// ── PEV (Plan → Execute → Verify) — 결정론 verifier 기반 ─────────────────────
//
// 이 패턴의 판정은 **LLM 점수가 아니라 외부 프로그램의 exit code** 다.
//   exit 0     = 통과 (SUCCESS)
//   exit 2     = 기계 판정 불가 → 사람 판정 필요(G2 게이트)
//   그 외 non-zero = 미충족 → 다음 사이클
// 루브릭·0~100 점·rubric_all_pass 는 이 패턴에 존재하지 않는다. 점수로 멈추고 싶으면
// --pattern evaluator-optimizer 를 쓸 것.
//
// S1(검증자 분리): verifier 는 executor 와 다른 에이전트(sh 헬퍼)가 돌리고 exit code 만 전달한다.
//   실행자가 자기 결과를 채점하지 않는다 — self-grading 금지.

const verifyCmd = _a?.verifyCmd || "bash /home/damools/forge/shared/scripts/design-plan-verify.sh"
const executor  = _a?.executor  || ''

if (!verifyCmd) {
  throw new Error('[design-plan-closeout] arg `verifyCmd` is required — PEV 는 결정론 verifier 없이는 돌지 않는다 (scaffold --verify-cmd 또는 실행 시 verifyCmd 인자)')
}
if (!executor) throw new Error('[design-plan-closeout] arg `executor` is required')

successPrefix = 'verify_pass'

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    step:      { type: 'string' },   // 이번 사이클에 할 조치 1건
    rationale: { type: 'string' },
  },
  required: ['step'],
}

const EXEC_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    changed_files: { type: 'array', items: { type: 'string' } },
    summary:       { type: 'string' },
  },
  required: ['summary'],
}

// ── Init: 착수 전 verifier 1회 실행 ──────────────────────────────────────────
// 이미 통과 상태면 할 일이 없다. 동시에 "지금은 red" 임을 실측해 공허한 검사를 걸러낸다.
const pre = await sh(verifyCmd, 'verify-init', 'Init')
log(`[Init] verify exit=${pre.exit_code} :: ${(pre.stdout || '').split('\n')[0]}`)

let lastExit   = pre.exit_code
let lastStdout = pre.stdout
let failSigs   = {}   // same_issue — 동일 실패 시그니처 반복 추적

if (pre.exit_code === 0) {
  stopReason = 'verify_pass (SUCCESS — 착수 시점에 이미 충족)'
  log(`[STOP] ${stopReason}`)
}

// ── Loop ──────────────────────────────────────────────────────────────────────
phase('Loop')

while (!stopReason && cycleCount < maxCycles) {
  // §1-c budget_advisory
  if (budget && budget.total && budget.remaining && budget.remaining() < BUDGET_RESERVE) {
    stopReason = `budget_advisory (remaining=${budget.remaining()} < ${BUDGET_RESERVE})`
    log(`[STOP] ${stopReason}`); break
  }

  cycleCount++
  const ph = `Loop/c${cycleCount}`
  log(`\n── Cycle ${cycleCount}/${maxCycles} ──────────────`)

  // (1) Plan — verifier 의 실패 출력만 근거로 다음 조치 1건을 정한다.
  //     완료 판정은 하지 않는다(판정은 verifier 독점).
  const plan = await agent(
    `당신은 **플래너**입니다. 아래 verifier 실패 출력을 근거로 **다음 조치 1건만** 정하십시오.
완료 여부를 판정하지 마십시오 — 판정은 verifier 가 합니다.

GOAL / DONE-CRITERIA: ${goal}
VERIFIER: ${verifyCmd}
직전 exit code: ${lastExit}
직전 출력:
${(lastStdout || '(none)').slice(0, 1500)}
${history.length ? `\n이전 시도: ${history.map(h => `c${h.cycle}:${h.step}→exit ${h.verify_exit}`).join('; ')}` : ''}

반환: { "step": "<이번 사이클에 할 조치 1건>", "rationale": "<근거 1줄>" }`,
    { label: `planner-c${cycleCount}`, phase: ph, schema: PLAN_SCHEMA }
  )
  const step = plan?.step || '(planner returned nothing)'
  log(`[Plan] c=${cycleCount} step="${step.slice(0, 120)}"`)

  // (2) Execute
  let ex
  try {
    ex = await agent(
      `당신은 **실행자**입니다. 아래 조치를 실제로 수행하십시오. 설명만 하지 마십시오.

GOAL: ${goal}
이번 조치: ${step}
Executor: ${executor}

⚠️ verifier(\`${verifyCmd}\`) 와 그 판정 기준을 **수정하지 마십시오** — 검증을 구현에 맞추는 것은 self-grading 입니다.

반환: { "changed_files": [...], "summary": "<한 일 요약>" }`,
      { label: `executor-c${cycleCount}`, phase: ph, schema: EXEC_SCHEMA }
    )
  } catch (e) {
    log(`[WARN] Executor failed c${cycleCount}: ${e?.message || e}`)
    stopReason = `executor_error_c${cycleCount}`; break
  }
  log(`[Exec] c=${cycleCount} summary="${(ex?.summary || '').slice(0, 120)}"`)

  // (3) Verify — 실행자와 분리된 에이전트가 명령을 돌리고 exit code 만 소비한다.
  const v = await sh(verifyCmd, `verify-c${cycleCount}`, ph)
  lastExit   = v.exit_code
  lastStdout = v.stdout
  log(`[Verify] c=${cycleCount} exit=${lastExit} :: ${(lastStdout || '').split('\n')[0]}`)

  history.push({
    cycle: cycleCount,
    step,
    changed: (ex?.changed_files || []).length,
    verify_exit: lastExit,
  })

  // §1-a 성공 = exit 0. 그 외 어떤 신호도 성공으로 치지 않는다.
  if (lastExit === 0) { stopReason = 'verify_pass (SUCCESS)'; log(`[STOP] ${stopReason}`); break }

  // 기계 판정 불가 → 사람에게 넘긴다(G2). 성공 아님.
  if (lastExit === 2) { stopReason = 'manual_verify (G2 — 사람 판정 필요)'; log(`[STOP] ${stopReason}`); break }

  // §1-f same_issue — 동일 실패 시그니처가 SAME_ISSUE_MAX 회 반복되면 정지
  const sig = `${lastExit}:${(lastStdout || '').split('\n')[0].slice(0, 120)}`
  failSigs[sig] = (failSigs[sig] || 0) + 1
  if (failSigs[sig] >= SAME_ISSUE_MAX) {
    stopReason = `same_issue (sig="${sig.slice(0, 60)}" x${failSigs[sig]})`
    log(`[STOP] ${stopReason}`); break
  }
}

resultLine    = `verify_exit: ${lastExit} (0=pass, 2=manual, else=fail)`
finalArtifact = `verifier: ${verifyCmd}\nlast exit: ${lastExit}\nlast stdout:\n${(lastStdout || '').slice(0, 800)}`

// ══ 패턴 본문 끝 ═══════════════════════════════════════════════════════════════

// §1-b max_cycles (공통 — 본문이 다른 사유로 멈추지 않았을 때만 발화)
if (!stopReason && cycleCount >= maxCycles) {
  stopReason = `max_cycles (${maxCycles})`
  log(`[STOP] ${stopReason}`)
}

// ── Report ─────────────────────────────────────────────────────────────────────

phase('Report')
const isSuccess = !!successPrefix && (stopReason || '').startsWith(successPrefix)
log(`
╔══════════════════════════════════════════════════
║ /design-plan-closeout COMPLETE  (pattern: pev)
║ cycles: ${cycleCount}/${maxCycles}
║ stop_reason: ${stopReason}
║ ${resultLine}
║ result: ${isSuccess ? '✅ SUCCESS' : '⚠ STOP'}
╚══════════════════════════════════════════════════`)

await agent(
  `Produce the final loop report as Markdown.

RESULTS:
- pattern: pev
- cycles: ${cycleCount}/${maxCycles}, stop: ${stopReason}
- ${resultLine}, result: ${isSuccess ? 'SUCCESS' : 'STOP'}
- goal: ${goal}

HISTORY: ${JSON.stringify(history, null, 2)}
FINAL ARTIFACT: ${finalArtifact}

Format: ## Result / ### Status / ### Stop Reason / ### Cycle History (table) / ### Final Artifact / ### Next Steps`,
  { label: 'report', phase: 'Report' }
)

return {
  pattern:     'pev',
  cycles:      cycleCount,
  stop_reason: stopReason,
  success:     isSuccess,
  history,
}
