// forge-loop-maker/scripts/loop-kernel.js
// 이전 출처: forge-loop/scripts/workflow.js (inert standalone → 공유 커널로 흡수)
// loop-kernel-standard §1–§5 구현. 생성된 루프의 workflow.js.tmpl이 이 패턴을 상속한다.
// root-cause: forge-loop standalone(prод 0건)을 흡수해 단일 커널 SSoT로 통합 (forge-loop-maker Phase 2)

// ── Schemas ────────────────────────────────────────────────────────────────────

export const EVAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score:           { type: 'number', description: '0–100 aggregate (e.g. sum of 4-axis 0-2 × 12.5)' },
    rubric_all_pass: { type: 'boolean' },
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
    rationale:   { type: 'string' },
    stop_signal: { type: 'string', enum: ['none', 'security_crit', 'regression'], description: 'Immediate stop signals from evaluator' },
  },
  required: ['score', 'rubric_all_pass', 'findings', 'rationale', 'stop_signal'],
}

export const EXECUTOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    output:  { type: 'string', description: 'Produced artifact or path to it' },
    summary: { type: 'string' },
  },
  required: ['output'],
}

// ── Constants ──────────────────────────────────────────────────────────────────

// kernel §3: BUDGET_RESERVE — advisory turn-budget early-stop (NOT per-skill hard cap)
export const BUDGET_RESERVE = 20000

// same_issue threshold (§3c)
export const SAME_ISSUE_MAX = 3

// plateau: score delta threshold (§3e)
export const PLATEAU_EPSILON = 5
// plateau: consecutive count to trigger
export const PLATEAU_CONSECUTIVE = 2

// oscillation: resolved-then-reappeared threshold (§3d)
export const OSCILLATION_MAX = 2

// ── Stop-condition implementations ────────────────────────────────────────────
//
// 8 stop-conditions (kernel §1):
//
//  §1-a  rubric_all_pass  → SUCCESS (evaluator reports all criteria met)
//  §1-b  max_cycles       → STOP (deterministic primary bound — always fires)
//  §1-c  budget_advisory  → advisory STOP (turn-budget aware, only when budget.total set)
//  §1-d  security_crit    → STOP (evaluator stop_signal='security_crit')
//  §1-e  regression       → STOP (evaluator stop_signal='regression')
//  §1-f  same_issue       → STOP (finding id:severity appeared SAME_ISSUE_MAX times)
//  §1-g  oscillation      → STOP (genuine pass→fail transition OSCILLATION_MAX times)
//  §1-h  plateau          → STOP (net score gain ≤ PLATEAU_EPSILON over PLATEAU_CONSECUTIVE cycles)
//
// Usage: inline this pattern in a generated workflow.js. The Workflow sandbox
// does not support external imports, so copy the schema + constant declarations
// from this file directly. See templates/workflow.js.tmpl for the scaffold.

// ── §3c same_issue tracking ────────────────────────────────────────────────────
// Call each cycle with the current cycle's findings.
// Returns { tripped: bool, key?: string, count?: number }
export function checkSameIssue(findings, issueCounts) {
  for (const f of findings) {
    if (f.passed) continue
    const key = `${f.id}:${f.severity}`
    issueCounts[key] = (issueCounts[key] || 0) + 1
    if (issueCounts[key] >= SAME_ISSUE_MAX) {
      return { tripped: true, key, count: issueCounts[key] }
    }
  }
  return { tripped: false }
}

// ── §3d oscillation tracking ──────────────────────────────────────────────────
// Call each cycle with current findings + previous cycle's passed-id set.
// Returns { tripped: bool, id?: string, count?: number, newPassIds: Set }
// Root-cause GC3: only count genuine pass→fail transitions, not stuck-failing.
export function checkOscillation(findings, resolvedFindings, oscillationHits, priorPassedIds) {
  const currentFailIds = new Set(findings.filter(f => !f.passed).map(f => f.id))
  const currentPassIds = new Set(findings.filter(f =>  f.passed).map(f => f.id))

  for (const id of currentPassIds) {
    if (resolvedFindings[id] === undefined) resolvedFindings[id] = true
  }

  for (const id of currentFailIds) {
    if (resolvedFindings[id] !== undefined) {
      const wasPassLastCycle = (priorPassedIds || new Set()).has(id)
      if (wasPassLastCycle) {
        oscillationHits[id] = (oscillationHits[id] || 0) + 1
        if (oscillationHits[id] >= OSCILLATION_MAX) {
          return { tripped: true, id, count: oscillationHits[id], newPassIds: currentPassIds }
        }
      }
    }
  }
  return { tripped: false, newPassIds: currentPassIds }
}

// ── §3e plateau tracking ──────────────────────────────────────────────────────
// Call each cycle after pushing score to scores[].
// Returns { tripped: bool, netGain?: number }
// Root-cause GC5: net score over window (not per-pair abs-delta).
export function checkPlateau(scores) {
  if (scores.length < PLATEAU_CONSECUTIVE + 1) return { tripped: false }
  const window = scores.slice(-(PLATEAU_CONSECUTIVE + 1))
  const netGain = Math.max(...window) - window[0]
  return netGain <= PLATEAU_EPSILON
    ? { tripped: true, netGain }
    : { tripped: false }
}
