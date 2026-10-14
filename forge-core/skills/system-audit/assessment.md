---
skill: system-audit
version: 3
---

# Assessment: system-audit

## 테스트 입력

- input_1: "Run a full 12-axis system audit on the Forge pipeline with quantitative metrics dashboard"
- input_2: "Execute unified audit covering Agentic, Context, Harness, Cost, Human-AI, Prompt, Loop, Graph, Compound and Distribution axes with 0-3 rubric scoring, plus the Security and Bloat verdict axes"
- input_3: "Perform comprehensive AI system quality assessment with trend comparison against the previous audit"

## 평가 기준 (Yes/No)

1. Output MUST measure all 10 scored axes directly (single auditor — measure.sh and the Step 1 scripts, no axis sub-agents) and produce per-axis scores using the 0-3 rubric, each backed by a reproduce command.
2. Output MUST include a quantitative metrics dashboard table with all 10 indicators (tool coverage, gate approval, override rate and cache hit rate excluded — #1416 #1418), measured values, baselines, and PASS/FAIL judgments.
3. Output MUST apply system-stage-weighted scoring (초기/운영/스케일링 단계 자동 판별) and show the weighted total score across the 10 scored axes.
4. Output MUST include a trend comparison table against the most recent prior audit, or state "첫 감사 — 베이스라인 설정" if none exists.
5. Output MUST produce an integrated improvement roadmap (P0/P1/P2) and save the full report to docs/reviews/audit/.
6. Output MUST include the 12 Security axis as a separate verdict (ASI01~ASI10 rows, never averaged into the score) — any CRITICAL/HIGH makes the overall verdict not-pass — and the 13 Bloat axis verdict.
7. Output MUST fill all 13 mandatory checks with measured values from measure.sh (`BLOAT_*`·`SEC_*`); an `NA` value is never a pass.

## 채점

- 1건 pass = 7개 기준 모두 Yes
- pass_rate = pass 건수 / 전체 실행 수
- 목표: min_pass_rate 0.8 이상
