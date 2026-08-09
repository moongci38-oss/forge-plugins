---
description: Forge Dev P5 Check P5.5 트레이서빌리티 검수 — 독립 실행
allowed-tools: Read, Grep, Glob
model: sonnet
group: verify
---

# /forge-check-traceability — 트레이서빌리티 게이트

P5 Check P5.5 Spec 준수 검증. 로직 SSoT = `spec-compliance-checker` 스킬.
판정 로직 SSoT = spec-compliance-checker. 동명 스킬(SKILL.md)은 이 문서를 가리키는 포인터일 뿐이다.

## 실행

1. `spec-compliance-checker` 스킬 subagent 스폰 → P5 Check P5.5 결과 반환
1.5. **FR 결과를 `docs/qa/fr-verdict.json`에 Write** (machine-readable verdict — goal-pev oracle-manifest 게이트 소비):
   ```json
   {
     "fr_total": <FR 항목 총수(int)>,
     "fr_done": <DONE 상태 FR 수(int)>,
     "fr_unmapped": <NOT DONE + UNVERIFIABLE 수(int)>,
     "fr_partial": <PARTIAL 상태 FR 수(int)>,
     "fr_changed": <CHANGED 상태 FR 수(int)>,
     "fr_by_state": {
       "DONE": <int>, "PARTIAL": <int>, "NOT_DONE": <int>,
       "CHANGED": <int>, "UNVERIFIABLE": <int>
     },
     "spec": "<spec 파일 경로(문자열)>",
     "generated_at": "<ISO8601 타임스탬프>"
   }
   ```
   `docs/qa/` 디렉토리 없으면 생성 후 Write. **집계 값은 spec-compliance-checker 결과의
   `requirements[].frState` / `frByState`에서 그대로 옮긴다 — 추측 금지**
   (5-state 도출 규칙 SSoT = `spec-compliance-checker` §FR 상태(5-state) 도출 규칙):
   - `fr_total` = 전체 FR 항목 수 (`requirements` 길이)
   - `fr_by_state` = checker의 `frByState` 그대로
   - `fr_done` = `fr_by_state.DONE`
   - `fr_unmapped` = `fr_by_state.NOT_DONE + fr_by_state.UNVERIFIABLE`
   - `fr_partial` / `fr_changed` = `fr_by_state.PARTIAL` / `fr_by_state.CHANGED`
   - `fr_by_state` = **5-state 전수 분해.** `verification-routing.md`가 이 값으로 머지를 라우팅한다
     (NOT_DONE·UNVERIFIABLE > 0 → **[STOP]** / PARTIAL·CHANGED > 0 → **WARN** / 그 외 → **PASS**)
   - `spec` = 검증에 사용한 spec 파일 경로
   - `generated_at` = 현재 UTC 시각 (ISO8601, 예: `"2026-06-26T16:00:00Z"`)

   **불변식**: `sum(fr_by_state.values()) == fr_total`. 어긋나면 집계 오류다 — 눈으로 센 값을 쓰지 말고
   항목표에서 기계 도출할 것. goal-pev가 이 불변식을 검사해 SUCCESS를 차단한다.

   > **왜 5-state 전수인가**: 이전 스키마는 3개 집계 필드뿐이라 **PARTIAL·CHANGED가 어느 쪽에도
   > 계상되지 않고 유실**됐다. 라우팅은 5-state를 요구하는데 산출물이 그 구분을 담지 못해
   > `/forge-pr`이 매번 산문 표에서 상태를 재도출해야 했다. (2026-07-15 해소)
2. P5 Check P5.5 PASS/WARN 시 → `test-quality-checker` agent 순차 스폰 → P5 Check P5.5T 결과 반환

```python
Agent(subagent_type="test-quality-checker",
      prompt="P5 Check P5.5 출력을 입력으로 받아 테스트 품질 5축 검증 실행. --spec {spec_name}")
```

3. P5 Check P5.5 FAIL 시 → test-quality-checker 스킵 (트레이서빌리티 먼저 수정 필요)
4. 두 체크 결과 합산 출력

인자: `--spec <spec-name>` (선택) — 미입력 시 스킬 내부 자동 탐지.

## Advisor 자문 (advisory-only · non-blocking · Opus)

traceability gap이 구현미달(코드결함) vs 스펙노후 중 무엇인지 모호할 때 `advisor-strategist`(Opus) 조언을 구한다. **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

```python
Agent(subagent_type="advisor-strategist",
      prompt="gap 내용·spec-code-discriminate 결과(AMBIGUOUS/SPEC_STALE_CANDIDATE)·git provenance 맥락 3-5줄. 질문: 이 gap이 구현미달(코드수정) vs 스펙노후(스펙정정) 중 무엇인지 판단 근거는? 코드결함 자동단정 금지.")
```

- 트리거: spec-code-discriminate AMBIGUOUS / SPEC_STALE_CANDIDATE 판정 시
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드(및 Human [STOP] Reconciliation 게이트)가 수행.
- **Fable 5 미배선** — Human 수동 에스컬레이션 전용(자동분기는 forge-fix T4 한정). `advisor-model-resolve` 호출 금지.
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor/결정=Opus.

## Override 경로

NOT DONE/UNVERIFIABLE 항목의 override 선언·재검증(단일 FR 재탐색, override당 1회)은
`$HOME/.claude/rules-on-demand/verification-overrides.md` 스키마(`must_have/reason/accepted_by/at`) 참조.

## 주의사항

- 읽기 전용 wrapper. 코드 수정은 Lead 수행
- Agent Drift 검사(삭제 agent 감지·외부발송 게이트) → `agent-drift-auditor` 스킬 (P5 Check P5.9)
> 실패 시 [[pev-self-correction]] 적용
