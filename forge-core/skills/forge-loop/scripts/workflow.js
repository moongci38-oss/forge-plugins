// forge-loop/workflow.js — generic goal-feedback refinement loop
// loop-kernel-standard §1–§5 inline (Workflow sandbox: no external imports, no fs)
// Greybox: NEW domains only — NOT QA/bug/migration (those have dedicated loops).

export const meta = {
  name: 'forge-loop',
  description: 'Generic worker→evaluator→stop-check refinement loop for doc/research/prompt tuning domains',
  phases: [
    { title: 'Init',  detail: 'Parse args, set state' },
    { title: 'Loop',  detail: 'Executor → Evaluator (isolated) → stop-check per cycle' },
    { title: 'Report', detail: 'Cycle summary + stop reason + final score' },
  ],
}

// ── Schemas ────────────────────────────────────────────────────────────────────

const EVAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score:          { type: 'number', description: '0–100 aggregate (e.g. sum of 4-axis 0-2 × 12.5)' },
    rubric_all_pass:{ type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          // kernel §2: structured id — NOT string-fuzzy (false-negative risk)
          id:       { type: 'string', description: 'Stable slug: {axis}:{criterion} or {file}:{rule}' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          axis:     { type: 'string' },
          detail:   { type: 'string' },
          passed:   { type: 'boolean' },
        },
        required: ['id', 'severity', 'passed', 'detail'],
      },
    },
    rationale:    { type: 'string' },
    stop_signal:  { type: 'string', enum: ['none', 'security_crit', 'regression'], description: 'Immediate stop signals from evaluator' },
  },
  required: ['score', 'rubric_all_pass', 'findings', 'rationale', 'stop_signal'],
}

const EXECUTOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    output:   { type: 'string', description: 'Produced artifact or path to it' },
    summary:  { type: 'string' },
  },
  required: ['output'],
}

// ── Constants ──────────────────────────────────────────────────────────────────

// kernel §3: BUDGET_RESERVE — advisory turn-budget early-stop (NOT per-skill hard cap)
const BUDGET_RESERVE = 20000

// same_issue threshold
const SAME_ISSUE_MAX = 3

// plateau: score delta threshold
const PLATEAU_EPSILON = 5
// plateau: consecutive count to trigger
const PLATEAU_CONSECUTIVE = 2

// oscillation: resolved-then-reappeared threshold
const OSCILLATION_MAX = 2

// ── Arg parsing ────────────────────────────────────────────────────────────────

// root-cause: Workflow inline args may arrive as JSON string → defensive parse
const _a = (typeof args === 'string')
  ? (() => { try { return JSON.parse(args) } catch (e) { return {} } })()
  : (args || {})

const goal           = _a?.goal          || ''
const feedbackSource = _a?.feedbackSource|| ''
const executor       = _a?.executor      || ''
const evaluator      = _a?.evaluator     || 'eval-rubric'
// kernel §1: max_cycles = deterministic primary bound
const maxCycles      = Number(_a?.maxCycles ?? 6)
// kernel §3: tokenCap = advisory hint forwarded to executor only
const tokenCap       = _a?.tokenCap      || null

if (!goal)           throw new Error('[forge-loop] arg `goal` is required')
if (!feedbackSource) throw new Error('[forge-loop] arg `feedbackSource` is required')
if (!executor)       throw new Error('[forge-loop] arg `executor` is required')

log(`[forge-loop] goal="${goal.slice(0,80)}..." executor=${executor} evaluator=${evaluator} maxCycles=${maxCycles}`)

// ── State ──────────────────────────────────────────────────────────────────────

let cycleCount      = 0
let stopReason      = null   // set when loop ends early
let lastOutput      = feedbackSource
let history         = []     // [{cycle, score, findings_ids}]
let scores          = []     // for plateau detection (net-improvement window)
// root-cause: GC2 — lastScore tracks the terminal cycle's score independently of scores[].
// scores[] only grows up to the plateau check; stop-conditions (same_issue/oscillation) can break
// before scores.push(), so scores[last] would be stale. lastScore is set right after eval returns.
let lastScore       = null   // always the most-recent evaluator score (including terminal cycle)
let issueCounts     = {}     // sha256-like key → count (same_issue)
let resolvedFindings= {}     // id → resolved_at_cycle (oscillation tracking)
let oscillationHits = {}     // id → genuine pass→fail transition count (GC3)
// root-cause: GC3 — priorPassedIds tracks which finding ids were passing last cycle,
// enabling pass→fail edge detection (oscillation) vs. stuck-failing (same_issue).
let priorPassedIds  = null   // Set<string> | null (null = no prior cycle yet)
// root-cause: GC6 — baselinePassed removed (was declared but never assigned; regression detection
// relies solely on evaluator stop_signal="regression". Programmatic baseline = v2 scope.)
// Honest comment per GC6 simple option: regression v1 = evaluator stop_signal only (no programmatic baseline).

phase('Init')
log(`[Init] feedbackSource="${feedbackSource}" tokenCap=${tokenCap||'(none)'}`)

// ── Main Loop ──────────────────────────────────────────────────────────────────

phase('Loop')

while (cycleCount < maxCycles) {
  // kernel §3: advisory budget early-stop (only when budget object present)
  if (budget && budget.total && budget.remaining && budget.remaining() < BUDGET_RESERVE) {
    stopReason = `budget_advisory (remaining=${budget.remaining()} < BUDGET_RESERVE=${BUDGET_RESERVE})`
    log(`[STOP] ${stopReason}`)
    break
  }

  cycleCount++
  log(`\n── Cycle ${cycleCount}/${maxCycles} ──────────────`)

  // ── Step 1: Executor ──────────────────────────────────────────────────────────
  // kernel §4: action loop — executor produces REAL new output each cycle (valid retry)
  const historyNote = history.length > 0
    ? `\nPrevious cycles: ${history.map(h => `cycle ${h.cycle} score=${h.score} issues=${h.issues_count}`).join('; ')}\nLast evaluator feedback: ${history[history.length-1]?.rationale || '(none)'}`
    : ''

  const tokenHint = tokenCap ? `\n[Advisory token hint: aim for <${tokenCap} tokens in output]` : ''

  let executorResult
  try {
    executorResult = await agent(
      `You are the executor for a refinement task. Produce a REAL improved output — do NOT just explain what you would change.

GOAL: ${goal}

CURRENT ARTIFACT / FEEDBACK SOURCE:
${lastOutput}
${historyNote}${tokenHint}

Executor skill/agent: ${executor}

Instructions:
1. Read the current artifact carefully
2. Apply concrete improvements toward the goal
3. Produce the full updated artifact (not a diff)
4. Return: { "output": "<full updated artifact or path>", "summary": "<1-2 sentences on key changes>" }`,
      { label: `executor-c${cycleCount}`, phase: `Loop/c${cycleCount}`, schema: EXECUTOR_SCHEMA }
    )
  } catch (e) {
    log(`[WARN] Executor failed cycle ${cycleCount}: ${e?.message || e}`)
    stopReason = `executor_error_c${cycleCount}`
    break
  }

  const currentOutput = executorResult?.output || lastOutput
  log(`[Executor] cycle=${cycleCount} summary="${(executorResult?.summary||'').slice(0,120)}"`)

  // ── Step 2: Evaluator (kernel §5 — prompt-enforced separation) ──────────────────
  // root-cause: GC4 — separation is prompt-enforced (separate agent() + only goal/rubric/output
  // passed), NOT runtime-structural. This mitigates self-grade risk but does not make it
  // structurally impossible. Evaluator receives ONLY {goal, rubric, output} — no executor
  // reasoning, history, or prior context forwarded.
  let evalResult
  try {
    evalResult = await agent(
      `You are an independent evaluator. You have NO knowledge of how the output was produced.
Evaluate ONLY based on the rubric and the artifact provided.

GOAL / DONE-CRITERIA (rubric):
${goal}

ARTIFACT TO EVALUATE:
${currentOutput}

Evaluator: ${evaluator}

Instructions:
1. Score each criterion in the done-criteria (0–2 per axis if using eval-rubric 4-axis)
2. Compute aggregate score 0–100
3. For each finding: assign a STABLE structured id (format: {axis}:{criterion_slug} or {file}:{rule_slug}) — NOT free text
4. Set rubric_all_pass=true ONLY if ALL criteria are met
5. Set stop_signal="security_crit" if any CRITICAL security issue is found
6. Set stop_signal="regression" if a previously-passing criterion now fails (compare vs baseline if available)
7. Return structured JSON per schema`,
      { label: `evaluator-c${cycleCount}`, phase: `Loop/c${cycleCount}`, schema: EVAL_SCHEMA }
    )
  } catch (e) {
    log(`[WARN] Evaluator failed cycle ${cycleCount}: ${e?.message || e}`)
    stopReason = `evaluator_error_c${cycleCount}`
    break
  }

  const score        = evalResult?.score ?? 0
  const allPass      = evalResult?.rubric_all_pass ?? false
  const findings     = evalResult?.findings || []
  const rationale    = evalResult?.rationale || ''
  const stopSignal   = evalResult?.stop_signal || 'none'

  log(`[Evaluator] cycle=${cycleCount} score=${score} allPass=${allPass} findings=${findings.length} stop_signal=${stopSignal}`)

  // root-cause: GC2 — capture lastScore immediately after evaluator; independent of plateau scores[]
  // so terminal-cycle score is always accurate regardless of which stop-condition fires.
  lastScore = score

  // Update output for next cycle
  lastOutput = currentOutput

  // root-cause: GC1 — record history BEFORE any stop-check so the terminal cycle is always captured.
  // stopReason is not yet known here; it is reported separately in the final report.
  history.push({
    cycle:       cycleCount,
    score,
    issues_count: findings.filter(f => !f.passed).length,
    rationale,
  })

  // ── Step 3: Stop-condition checks (kernel §1) ─────────────────────────────────

  // 3a. rubric_all_pass → SUCCESS
  if (allPass) {
    stopReason = 'rubric_all_pass (SUCCESS)'
    log(`[STOP] ${stopReason}`)
    break
  }

  // 3b. Immediate evaluator signals
  if (stopSignal === 'security_crit') {
    stopReason = 'security_crit (evaluator flagged CRITICAL security)'
    log(`[STOP] ${stopReason}`)
    break
  }
  if (stopSignal === 'regression') {
    stopReason = 'regression (evaluator: baseline PASS → FAIL)'
    log(`[STOP] ${stopReason}`)
    break
  }

  // 3c. same_issue: track findings by stable id × severity (sha-like triple key)
  let sameIssueTripped = false
  for (const f of findings) {
    if (f.passed) continue
    // kernel §2: structured id key — NOT string fuzzy
    const key = `${f.id}:${f.severity}`
    issueCounts[key] = (issueCounts[key] || 0) + 1
    if (issueCounts[key] >= SAME_ISSUE_MAX) {
      stopReason = `same_issue (key="${key}" appeared ${issueCounts[key]}x ≥ ${SAME_ISSUE_MAX})`
      log(`[STOP] ${stopReason}`)
      sameIssueTripped = true
      break
    }
  }
  if (sameIssueTripped) break

  // 3d. oscillation: genuine pass→fail TRANSITION only (kernel §2: id-based, NOT string-fuzzy)
  // root-cause: GC3 — old code incremented oscillationHits on every failing cycle where the id
  // was ever resolved. A persistently-failing finding (resolved once, then fail-fail-fail) would
  // trip 'oscillation' at count 2, but that's really same_issue (stuck), not oscillation.
  // Fix: only count a transition when prior cycle state was resolved/pass AND current is fail.
  // priorPassIds tracks which finding ids were passing last cycle.
  const currentFailIds = new Set(findings.filter(f => !f.passed).map(f => f.id))
  const currentPassIds = new Set(findings.filter(f => f.passed).map(f => f.id))

  // Mark newly resolved (pass state recorded)
  for (const id of currentPassIds) {
    if (resolvedFindings[id] === undefined) {
      resolvedFindings[id] = cycleCount
    }
  }
  // Check genuine pass→fail transition: was passing last cycle AND is now failing
  let oscillationTripped = false
  for (const id of currentFailIds) {
    if (resolvedFindings[id] !== undefined) {
      // Only count if prior recorded state was 'resolved/pass' (not already counted as re-fail)
      // We use a per-id priorState map to detect the edge precisely.
      const wasPassLastCycle = (priorPassedIds || new Set()).has(id)
      if (wasPassLastCycle) {
        oscillationHits[id] = (oscillationHits[id] || 0) + 1
        log(`[oscillation-track] id="${id}" pass→fail transition #${oscillationHits[id]}`)
        if (oscillationHits[id] >= OSCILLATION_MAX) {
          stopReason = `oscillation (finding id="${id}" resolved at c${resolvedFindings[id]} → genuine pass→fail ${oscillationHits[id]}x)`
          log(`[STOP] ${stopReason}`)
          oscillationTripped = true
          break
        }
      }
      // If it was already failing last cycle (stuck): same_issue handles it, not oscillation
    }
  }
  // Update priorPassedIds for next cycle comparison (hoisted to outer scope below)
  priorPassedIds = currentPassIds
  if (oscillationTripped) break

  // 3e. plateau: no NET improvement over window (GC5 fix — net score gain, not per-pair abs-delta)
  // root-cause: GC5 — old logic fired on |recent[i]-prev| < ε which wrongly trips a steady +4/cycle
  // climb (70→74→78). Fixed: plateau only when windowMax - windowStart <= ε (no net improvement).
  scores.push(score)
  if (scores.length >= PLATEAU_CONSECUTIVE + 1) {
    const windowScores = scores.slice(-(PLATEAU_CONSECUTIVE + 1))
    const windowStart  = windowScores[0]
    const windowMax    = Math.max(...windowScores)
    const netGain      = windowMax - windowStart
    if (netGain <= PLATEAU_EPSILON) {
      stopReason = `plateau (net gain=${netGain} ≤ ε=${PLATEAU_EPSILON} over ${PLATEAU_CONSECUTIVE} cycles, scores=[${scores.slice(-4).join(',')}])`
      log(`[STOP] ${stopReason}`)
      break
    }
  }
}

// max_cycles natural exit (kernel §1 — deterministic primary bound)
if (!stopReason && cycleCount >= maxCycles) {
  stopReason = `max_cycles (${maxCycles})`
  log(`[STOP] ${stopReason}`)
}

// ── Phase: Report ──────────────────────────────────────────────────────────────

phase('Report')

// root-cause: GC2 — use lastScore (set immediately after every eval) not scores[last] which is
// stale when same_issue/oscillation breaks before scores.push() in 3e.
const finalScore = lastScore
const isSuccess  = (stopReason || '').startsWith('rubric_all_pass')

log(`
╔══════════════════════════════════════════════════
║ /forge-loop COMPLETE
║ cycles: ${cycleCount}/${maxCycles}
║ stop_reason: ${stopReason}
║ final_score: ${finalScore !== null ? finalScore : 'N/A'}
║ result: ${isSuccess ? '✅ SUCCESS' : '⚠ STOP'}
╚══════════════════════════════════════════════════`)

await agent(
  `Produce the final forge-loop report as a clean Markdown summary.

LOOP RESULTS:
- Cycles run: ${cycleCount} / max ${maxCycles}
- Stop reason: ${stopReason}
- Final score: ${finalScore !== null ? finalScore : 'N/A'}
- Result: ${isSuccess ? 'SUCCESS (rubric all pass)' : 'STOP (not all criteria met)'}
- Goal: ${goal}

CYCLE HISTORY:
${JSON.stringify(history, null, 2)}

FINAL ARTIFACT:
${lastOutput}

Format:
## forge-loop Result
### Status: SUCCESS / STOP
### Stop Reason
### Final Score
### Cycle History (table: cycle | score | issues | rationale)
### Final Artifact
[paste or reference lastOutput]
### Recommendations
[what to do next if STOP and not SUCCESS]`,
  { label: 'report', phase: 'Report' }
)
