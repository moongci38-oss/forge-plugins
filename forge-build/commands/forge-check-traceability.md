---
description: Forge Dev P5 Check P5.5 트레이서빌리티 검수 — 독립 실행
allowed-tools: Read, Grep, Glob, Bash, Write
model: sonnet
group: verify
---

# /forge-check-traceability — 트레이서빌리티 게이트

P5 Check P5.5 Spec 준수 검증. 판정 로직 SSoT = `spec-compliance-checker` 스킬(동명 SKILL.md 는 이 문서 포인터).
인자: `--spec <spec-name>` (선택) — 미입력 시 스킬 내부 자동 탐지.

## 실행

1. `spec-compliance-checker` 스킬 subagent 스폰 → P5 Check P5.5 결과 반환
1.5. 체커 결과 JSON 원문을 `docs/qa/check-8.5.json` 에 Write (`axisStatus` 는 지우지 말고 그대로 — 빠지면 축 FAIL 이 사라진다).
   그다음 판정을 스크립트로 재계산한다(단독 실행):

   ```bash
   python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/spec-compliance-verdict.py" --input docs/qa/check-8.5.json --root "$PWD" --in-place
   ```

   - 종료코드: `0`=PASS/WARN · `1`=FAIL(파일 갱신됨, 다음 명령 계속) · `2`=판정불가(`requirements` 없음·JSON 아님) → **[STOP]**, 체커 결과 확인
   - `status`·`frTotal`·`frByState`·`summary`·`requirements[].frState` 가 스크립트 값으로 덮이고 체커 값은 `llmStatus` 로 남는다. `statusChanged: true` 면 보고에 적는다.
   - `found` 경로가 `--root` 안 일반 파일로 없으면 `missing` 으로 강등(`pathCheck.overrides`). 재실행해도 `llmStatus`·`pathCheck.overrides`·`stateOverrides` 는 보존·누적.
   - 테스트: `bash shared/scripts/tests/spec-compliance-verdict.test.sh`

   이어서 `docs/qa/fr-verdict.json`(goal-pev oracle-manifest 게이트 소비)을 만든다(단독 실행):

   ```bash
   python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/fr-verdict-write.py" \
     --root "$PWD" --check85 docs/qa/check-8.5.json --spec .specify/specs/{spec_name}.md
   ```

   - 종료코드: `0`=기록 완료(stdout JSON = 기록값) · `1`=5-state 불변식 위반(기록 안 함 — 체커 집계 오류) **[STOP]** · `2`=입력 오류(1.5 Write 확인)
   - ⛔ 집계를 손으로 세어 JSON 을 직접 Write 하지 마라. 스키마 정본 = `shared/scripts/fr-verdict-write.py` (테스트: `bash shared/scripts/tests/fr-verdict-write.test.sh`)
   - 필드: `fr_total`·`fr_done`·`fr_unmapped`(NOT_DONE+UNVERIFIABLE)·`fr_partial`·`fr_changed`·`fr_by_state`(5-state 전수)·`spec`·`generated_at`
   - 불변식 `sum(fr_by_state.values()) == fr_total` — goal-pev 도 검사해 SUCCESS 차단.
   - 라우팅: NOT_DONE·UNVERIFIABLE > 0 → **[STOP]** / PARTIAL·CHANGED > 0 → **WARN** / 그 외 → **PASS**

2. P5.5 PASS/WARN 시 → **기계 축 먼저** → `test-quality-checker` agent 순차 스폰 → P5 Check P5.5T 결과 반환
   2-a. `docs/qa/check-8.5.json` 은 1.5 에서 이미 Write 했다 — 다시 쓰지 않는다.
   2-b. 기계 축(T-1·T-3·T-5·T-8·T-9) 판정 — 단독 실행, stdout JSON 그대로 받는다:
   ```bash
   python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/test-quality-mechanical.py" --root "$PWD" --check85 docs/qa/check-8.5.json --spec .specify/specs/{spec_name}.md
   ```
   exit≠0 이거나 JSON 아니면 `MECHANICAL_JSON` = `없음(스크립트 실패: <stderr 1줄>)` — 에이전트가 전 축 직접 판정(fail-open).
   **최상위 `status` 가 `SKIP` 이면 에이전트를 띄우지 않고 SKIP 으로 끝낸다.**
   2-c. 에이전트 스폰 — JSON 원문을 요약·재작성하지 말고 그대로 넣는다:

```python
Agent(subagent_type="test-quality-checker",
      prompt="P5 Check P5.5 출력을 입력으로 받아 테스트 품질 5축 검증 실행. --spec {spec_name}\n"
             "기계 축 판정 JSON(확정값 — PASS/WARN/FAIL/SKIP 축은 다시 판정하지 말고 옮겨 적는다. "
             "UNDECIDED 축은 residual 만 판정. 너의 몫은 T-2·T-4):\n{MECHANICAL_JSON}")
```

3. P5.5 FAIL 시 → test-quality-checker 스킵 (트레이서빌리티 먼저 수정)
4. 두 체크 결과 합산 출력

## Advisor 자문 (advisory-only · non-blocking · fail-open)

트리거: spec-code-discriminate AMBIGUOUS / SPEC_STALE_CANDIDATE — gap 이 구현미달(코드결함) vs 스펙노후인지 모호할 때 `advisor-strategist` 조언.
- 모델 = `bash shared/scripts/advisor-spawn-guard.sh resolve` 출력(기본 `gpt-6-astra`). 리졸버(`advisor-spawn-guard.sh resolve`)를 건너뛰지 않는다(kill-switch·일일캡·폴백 우회됨).
- 출력 `gpt-*` → `mcp__codex__codex`(sandbox=read-only) · `claude-fable-5-1`→`model:"fable"` · `claude-opus-5-5`→`model:"opus"`. 분기표 → `agents/advisor-strategist.md §비용 특성`

```python
Agent(subagent_type="advisor-strategist",
      prompt="gap 내용·spec-code-discriminate 결과(AMBIGUOUS/SPEC_STALE_CANDIDATE)·git provenance 맥락 3-5줄. 질문: 이 gap이 구현미달(코드수정) vs 스펙노후(스펙정정) 중 무엇인지 판단 근거는? 코드결함 자동단정 금지.")
```

- 조언은 참고만 — 최종 판단·실행은 커맨드(및 Human [STOP] Reconciliation 게이트). 미가용·실패 시 기본 흐름 진행.
- 라우팅: 본 커맨드=Sonnet · 탐색=Haiku · 정본 → `rules/model-routing.md`

## Override 경로

NOT DONE/UNVERIFIABLE override 선언·재검증(단일 FR 재탐색, override당 1회) → YAML 4필드(`must_have`·`reason`·`accepted_by`·`at`)로 기록 — 기록 없는 override 는 무효.

**기록은 형식이고 아래가 조건이다** — 4필드를 채웠다고 면제되지 않는다(#1435 검수 HIGH).

| 항목 | override 허용 조건 | 완화책 |
|---|---|---|
| Spec FR 미충족 | FR 이 삭제됐거나 범위 축소가 승인된 경우만 | spec 변경 커밋 선행 |
| TEST_PROOF 없음 | 테스트 인프라 미구축(신규 프로젝트 초기)만 | TODO 이슈 등록 필수 |
| 보안 CRITICAL | 재판정 결과 실제 Severity 가 MEDIUM 이하일 때만 | 재판정 근거로 `cr-code` 출력 인용 |

- ⛔ **AI 단독 승인 금지.** `accepted_by: "AI-instruction"` 은 `at` 자동 삽입까지만 허용하고, 같은 항목을 반복 override 하면 `learnings.jsonl` append 를 강제한다.
- ⛔ **override 할 수 없는 것**: 재확인 결과 실제 CRITICAL 인 보안 지적 · 기존 테스트가 있는데 없는 TEST_PROOF · `.env*` 자격증명 노출. 이건 면제가 아니라 **수정** 대상이다.

## 주의사항

- 읽기 전용 wrapper. 코드 수정은 Lead 수행
> 실패 시 [[pev-self-correction]] 적용
