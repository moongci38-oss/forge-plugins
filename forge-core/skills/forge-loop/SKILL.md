---
name: forge-loop
description: |
  Generic goal-feedback refinement loop for NEW domains — doc refinement, research convergence, prompt tuning, etc.
  Use when: (1) iterative improvement toward a rubric/goal is needed, (2) task is NOT QA/bug/migration (those have dedicated loops), (3) worker-evaluator separation required to avoid self-grade.
  Input: args {goal, feedbackSource, executor, evaluator?, maxCycles?, tokenCap?} + feedbackSource artifact. Output: refined artifact + cycle summary with stop reason and final score.
  Invoke: /forge-loop with goal, feedbackSource, executor args. Optional: evaluator (default eval-rubric), maxCycles (default 6).
  SKIP when: QA (/qa), bug fix (/healer), DB migration (/migration-audit), single-shot checks, or deterministic verdict-only gates.
---

# /forge-loop — Generic Refinement Loop

Generic `worker → evaluator → stop-check` loop for non-QA domains.
Implements loop-kernel-standard §1–§5 inline (Workflow sandbox = no shared modules).

## Args

| arg | required | default | notes |
|-----|----------|---------|-------|
| `goal` | ✅ | — | plain-language goal + done-criteria |
| `feedbackSource` | ✅ | — | path or description of artifact to refine |
| `executor` | ✅ | — | skill/agent name that produces output |
| `evaluator` | | `eval-rubric` | evaluator agent (receives ONLY rubric+output) |
| `maxCycles` | | `6` | deterministic bound — primary stop |
| `tokenCap` | | (omit) | advisory hint forwarded to executor; NOT a hard cap |

## Kernel §1 Stop-Conditions (all implemented inline in workflow.js)

| condition | trigger | result |
|-----------|---------|--------|
| `rubric_all_pass` | all done-criteria met | SUCCESS |
| `max_cycles` | cycle counter ≥ maxCycles | STOP |
| `same_issue` | finding key `id:severity` × 3 (no hash — 코드 일치) | STOP |
| `plateau` | net gain ≤ 5 over 2 cycles (단조 미개선; 코드 GC5) | STOP |
| `oscillation` | structured id pass→fail 전환 × 2 (regression≠oscillation; 코드 GC3) | STOP |
| `regression` | evaluator stop_signal='regression' (v1 = evaluator-reported, programmatic baseline 없음) | STOP |
| `security_crit` | CRITICAL security finding | STOP |
| `budget` | remaining < BUDGET_RESERVE | **advisory** STOP (turn-budget 설정 시만) |

## Kernel §5 Worker-Evaluator Separation (prompt-enforced)

작업자-검증자 분리 = prompt-enforced (별도 agent 호출 + rubric/산출물만 전달) — self-grade 위험 *완화*이지 런타임 구조적 격리(불가능 보장) 아님.
Evaluator receives ONLY `{goal, rubric, output}` — executor reasoning context is never passed.
This is a strong mitigation against the self-grade trap, not a runtime structural guarantee.

## Kernel §3 Token Honesty

- **Primary bound** = `max_cycles` (deterministic — always the true stopper)
- **Advisory** = `if (budget.total && budget.remaining() < BUDGET_RESERVE)` — turn-budget aware, NOT per-skill cap
- `tokenCap` arg = forwarded to executor as advisory hint; no hard enforcement here (B2 hook = future P4)

## Workflow Script

See `scripts/workflow.js`. Invoke via Forge Workflow runner.

## 자동 평가 (eval-rubric 통합)

본 스킬 결과 산출 후 자동으로 `eval-rubric` 호출 → 4축 Rubric 채점 → `eval_cases.jsonl` 누적.

### 호출 시점
- 루프 종료 후 최종 artifact + cycle summary

### 절차
1. 루프 종료 후: `/eval-rubric --target <final_output_path>`
2. verdict + 4축 점수 + rationale 수신
3. eval_cases.jsonl append (helper: `$HOME/.claude/scripts/eval-cases-append.py`)
   - case_id: EC-forge-loop-{N} auto-increment
   - split: hash 결정적 (sample 80% / holdout 20%)
   - dedupe: sha256(skill+input)

### 자동 비활성
- `EVAL_RUBRIC_AUTO=off`
- frontmatter `eval_cases: off`

### 보안
- redaction 정책 자동 적용
- secret/PII 의심 시 STOP fail-safe
