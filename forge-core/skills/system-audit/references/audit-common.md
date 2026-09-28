# 감사 스킬 공통 원문 (audit-common)

> **소비처 2곳**: `system-audit`(전 절) · `external-harness-sweep`(§저장 경로 앵커만 — #1185 r2 에서 분리해 옮겼다)
> (각 `SKILL.md` 가 이 파일의 절을 가리키며 **실행 전 Read** 를 지시한다).
> 이력: 원래 개별 감사 스킬 5종(`audit-*`)과 축 에이전트 5종이 함께 쓰던 공통 원문이었다(#1139 C001 — drift 방지).
> 둘 다 삭제됐고(#1374) system-audit 은 단독 실측으로 바뀌었다(#1415, 2026-09-28) — 개별 스킬 전용이던 §AUDIT_TOKEN_CAP 도 그때 뺐다.
> ⚠️ **스킬마다 다른 것은 여기 없다** — 판정 기준 원문·축별 점검 항목·보고서 형식·2단계 Evaluator 프롬프트는 각 SKILL.md 에 있다.
> 폐기조건: 소비처가 system-audit 하나로 줄면 이 파일의 절을 그 SKILL.md 로 합친다.

## 저장 경로 앵커

> **저장 경로 앵커 (2026-08-04 정정)**: 아래 경로는 반드시 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/`
> 로 시작한다. 앵커 없이 `docs/reviews/...` 로 쓰면 **cwd 에 따라 착지 레포가 갈린다** —
> `~/forge/docs/reviews` 와 `~/forge-outputs/docs/reviews` 가 **둘 다 실재**하기 때문이다.
> 실사고(2026-08-03): cwd 가 `~/forge` 인 세션이 감사 리포트를 프로젝트 repo 안에 떨궈
> `forge-core.md §경로`("하네스 개선 리포트는 프로젝트 repo 안 금지")를 위반했다.
> 실측 근거: 정본 레인 `~/forge-outputs/docs/reviews/audit/` 16건 vs 오착지 `~/forge/…` 1건
> (2026-08-04 관측).

## Evaluator 핵심 원칙

아래 생각이 들면 더 엄격하게 본다:
- "나쁘지 않은데..." → 감점
- "이 정도면 괜찮지 않나?" → 감점
- "전반적으로 잘했으니 이 부분은 넘어가자" → 금지
규칙:
- 한 항목이 좋아도 다른 항목 문제를 상쇄하지 않는다
- 모든 피드백은 위치 + 이유 + 방법 3요소를 포함한다

## 독립 Evaluator 공통

> **원칙**: Generator(감사 수행자) ≠ Evaluator. 감사자가 자신의 감사를 평가하면 자기평가 편향이 발생한다.

### 1단계 — 구조 린트: 분담 원칙

형식·개수·존재·산술은 스크립트가 판정한다 — 기계가 이미 본 축을 LLM 이 다시 보지 않는다
(`rules-on-demand/machine-vs-llm-boundary.md`). 스크립트는 **확실할 때만** PASS/FAIL 을 확정하고,
표기가 달라 판단이 필요한 항목과 질적 항목은 `residual` 로 넘긴다.

(실행 명령 `audit-report-structure-lint.py --skill <스킬명>` 은 스킬명이 달라 각 SKILL.md 에 남아 있다.)

### 1단계 — `rc` 해석

- `rc=1`(구조 FAIL) → **LLM Evaluator 를 띄우지 않고 FAIL 확정.** 피드백 = JSON `items[].checks` 중 `FAIL` 의 `check`·`detail`.
- `rc=2`(입력 오류) → 판정이 아니다. 보고서 경로를 고쳐 재실행한다.
- `rc=0` + `residual` 비어 있음 → **PASS 확정**(LLM Evaluator 생략).
- `rc=0` + `residual` 있음 → 2단계.
