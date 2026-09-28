---
skill: system-audit
version: 3
---

# Assessment: system-audit

## 테스트 입력

- input_1: "Run a full 5-axis ACHCE system audit on the Forge pipeline with quantitative metrics dashboard"
- input_2: "Execute unified audit covering Agentic, Context, Harness, Cost, and Human-AI axes with 0-3 rubric scoring"
- input_3: "Perform comprehensive AI system quality assessment with trend comparison against the previous audit"

## 평가 기준 (Yes/No)

1. Output MUST measure all 5 axes directly (single auditor — measure.sh and the Step 1 scripts, no axis sub-agents) and produce per-axis scores using the 0-3 rubric, each backed by a reproduce command.
2. Output MUST include a quantitative metrics dashboard table with all 10 indicators (tool coverage, gate approval, override rate and cache hit rate excluded — #1416 #1418), measured values, baselines, and PASS/FAIL judgments.
3. Output MUST apply system-stage-weighted scoring (초기/운영/스케일링 단계 자동 판별) and show the weighted total ACHCE score.
4. Output MUST include a trend comparison table against the most recent prior audit, or state "첫 감사 — 베이스라인 설정" if none exists.
5. Output MUST produce an integrated improvement roadmap (P0/P1/P2) and save the full report to docs/reviews/audit/.

## 채점

- 1건 pass = 5개 기준 모두 Yes
- pass_rate = pass 건수 / 전체 실행 수
- 목표: min_pass_rate 0.8 이상
