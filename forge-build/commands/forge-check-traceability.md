---
description: Forge Dev P5 Check P5.5 트레이서빌리티 검수 — 독립 실행
allowed-tools: Read, Grep, Glob, Bash, Write
model: sonnet
group: verify
---

# /forge-check-traceability — 트레이서빌리티 게이트

P5 Check P5.5 Spec 준수 검증. 로직 SSoT = `spec-compliance-checker` 스킬.
판정 로직 SSoT = spec-compliance-checker. 동명 스킬(SKILL.md)은 이 문서를 가리키는 포인터일 뿐이다.

## 실행

1. `spec-compliance-checker` 스킬 subagent 스폰 → P5 Check P5.5 결과 반환
1.5. **체커 결과 JSON 원문을 `docs/qa/check-8.5.json` 에 Write 한 뒤, 스크립트로 `docs/qa/fr-verdict.json` 을 만든다**
   (machine-readable verdict — goal-pev oracle-manifest 게이트 소비). 아래 명령을 단독으로 실행한다:

   ```bash
   python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/fr-verdict-write.py" \
     --root "$PWD" --check85 docs/qa/check-8.5.json --spec .specify/specs/{spec_name}.md
   ```

   종료코드: `0`=기록 완료(stdout JSON 이 기록된 값) · `1`=5-state 불변식 위반(기록 안 함 — 체커 집계 오류다, **[STOP]**) ·
   `2`=입력 오류(체커 결과 JSON 이 없거나 형식이 다름 — 1단계 Write 를 확인하라).
   ⛔ **집계를 손으로 세어 JSON 을 직접 Write 하지 마라** — 옮기는 일은 스크립트가 한다.

   > **왜 스크립트인가(2026-09-17)**: 종전에는 이 절이 "에이전트가 Write 하라"는 지시문이었고, 실제로 쓰는
   > 코드가 없었다. 그 결과 이 파일은 forge·forge-outputs 어디에도 **0건**이었고(재현:
   > `find ~/forge ~/forge-outputs -name 'fr-verdict.json' -not -path '*/skills/*'`), 소비처 `goal-pev.py` 는
   > 매번 "fr-verdict.json 없음" warn 으로 coarse 폴백했다 — 게이트가 한 번도 판정한 적이 없었다.
   > 테스트: `bash shared/scripts/tests/fr-verdict-write.test.sh`

   스크립트가 만드는 스키마(변경 시 `shared/scripts/fr-verdict-write.py` 가 정본):
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
   `docs/qa/` 디렉토리는 스크립트가 없으면 만든다. **집계 값은 spec-compliance-checker 결과의
   `requirements[].frState` / `frByState`에서 그대로 옮긴다 — 추측 금지**
   (5-state 도출 규칙 SSoT = `spec-compliance-checker` §FR 상태(5-state) 도출 규칙). 아래 대응은
   스크립트가 그대로 구현한다:
   - `fr_total` = 전체 FR 항목 수 (`requirements` 길이)
   - `fr_by_state` = checker의 `frByState` 그대로
   - `fr_done` = `fr_by_state.DONE`
   - `fr_unmapped` = `fr_by_state.NOT_DONE + fr_by_state.UNVERIFIABLE`
   - `fr_partial` / `fr_changed` = `fr_by_state.PARTIAL` / `fr_by_state.CHANGED`
   - `fr_by_state` = **5-state 전수 분해.** `verification-routing.md`가 이 값으로 머지를 라우팅한다
     (NOT_DONE·UNVERIFIABLE > 0 → **[STOP]** / PARTIAL·CHANGED > 0 → **WARN** / 그 외 → **PASS**)
   - `spec` = 검증에 사용한 spec 파일 경로
   - `generated_at` = 현재 UTC 시각 (ISO8601, 예: `"2026-06-26T16:00:00Z"`)

   **불변식**: `sum(fr_by_state.values()) == fr_total`. 스크립트가 먼저 검사해 어긋나면 **기록하지 않고 rc=1** 로
   끝낸다(깨진 값을 goal-pev 가 fresh 로 읽는 것이 더 나쁘다). goal-pev 도 같은 불변식을 검사해 SUCCESS를 차단한다.

   > **왜 5-state 전수인가**: 이전 스키마는 3개 집계 필드뿐이라 **PARTIAL·CHANGED가 어느 쪽에도
   > 계상되지 않고 유실**됐다. 라우팅은 5-state를 요구하는데 산출물이 그 구분을 담지 못해
   > `/forge-pr`이 매번 산문 표에서 상태를 재도출해야 했다. (2026-07-15 해소)
2. P5 Check P5.5 PASS/WARN 시 → **기계 축 먼저** → `test-quality-checker` agent 순차 스폰 → P5 Check P5.5T 결과 반환
   2-a. P5.5 결과 JSON 은 **1.5 에서 이미 `docs/qa/check-8.5.json` 에 Write 했다** — 다시 쓰지 않는다(같은 파일을 두 스크립트가 입력으로 쓴다).
   2-b. 기계 축(T-1·T-3·T-5·T-8·T-9) 판정 — 단독 명령으로 실행하고 stdout JSON 을 그대로 받는다:
   ```bash
   python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/test-quality-mechanical.py" --root "$PWD" --check85 docs/qa/check-8.5.json --spec .specify/specs/{spec_name}.md
   ```
   exit 0 이 아니거나 JSON 이 아니면 `MECHANICAL_JSON` 자리에 `없음(스크립트 실패: <stderr 1줄>)` 을 넣는다 —
   에이전트가 전 축을 직접 판정한다(fail-open). **JSON 최상위 `status` 가 `SKIP` 이면 에이전트를 띄우지 않고 SKIP 으로 끝낸다.**
   2-c. 에이전트 스폰 — JSON 원문을 요약·재작성하지 말고 그대로 넣는다:

```python
Agent(subagent_type="test-quality-checker",
      prompt="P5 Check P5.5 출력을 입력으로 받아 테스트 품질 5축 검증 실행. --spec {spec_name}\n"
             "기계 축 판정 JSON(확정값 — PASS/WARN/FAIL/SKIP 축은 다시 판정하지 말고 옮겨 적는다. "
             "UNDECIDED 축은 residual 만 판정. 너의 몫은 T-2·T-4):\n{MECHANICAL_JSON}")
```

3. P5 Check P5.5 FAIL 시 → test-quality-checker 스킵 (트레이서빌리티 먼저 수정 필요)
4. 두 체크 결과 합산 출력

인자: `--spec <spec-name>` (선택) — 미입력 시 스킬 내부 자동 탐지.

## Advisor 자문 (advisory-only · non-blocking · 리졸버 기본 = **GPT-6 Astra**)

traceability gap이 구현미달(코드결함) vs 스펙노후 중 무엇인지 모호할 때 `advisor-strategist` 조언을 구한다(모델 = `advisor-model-resolve.sh` 출력, **기본 `gpt-6-astra`**). **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

> ⚠️ **아래 예시는 리졸버가 `claude-*` 를 냈을 때의 형태다.** 스폰 모델은 항상 `advisor-model-resolve.sh` 가 정한다 — `claude-fable-5-1`→`model:"fable"`, `claude-opus-5`→`model:"opus"`, **`gpt-6-astra`(대체 기본)·`gpt-5.6-sol` 같은 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)**. 분기표 → `agents/advisor-strategist.md §비용 특성`. 리졸버를 건너뛰면 kill-switch·일일캡·미가용 폴백이 전부 우회된다.
```python
Agent(subagent_type="advisor-strategist",
      prompt="gap 내용·spec-code-discriminate 결과(AMBIGUOUS/SPEC_STALE_CANDIDATE)·git provenance 맥락 3-5줄. 질문: 이 gap이 구현미달(코드수정) vs 스펙노후(스펙정정) 중 무엇인지 판단 근거는? 코드결함 자동단정 금지.")
```

- 트리거: spec-code-discriminate AMBIGUOUS / SPEC_STALE_CANDIDATE 판정 시
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드(및 Human [STOP] Reconciliation 게이트)가 수행.
- **advisor 모델 = `advisor-model-resolve.sh` 출력**(**기본 `gpt-6-astra`** · Fable 5.1 은 `FORGE_ADVISOR_MODEL=fable` 또는 `FORGE_ADVISOR_EXECUTOR=codex|gpt`(벤더 교차) 일 때만 · `FORGE_ADVISOR_MODEL=opus` 로 Opus 고정). 출력이 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)로 스폰한다.
  ⚠️ 2026-08-12 이전 문구 **"Fable 5 미배선 — Human 수동 에스컬레이션 전용 · `advisor-model-resolve` 호출 금지"는 폐기**했다 — 이 커맨드에 advisor 자문 레그가 실재하는데 리졸버 호출을 금지해 라우팅이 서로 어긋났다(cr-final HIGH). 정본 → `rules/model-routing.md §Advisor 전략 상시 가동`
- 모델 라우팅: 본 커맨드 작업=Sonnet · 탐색=Haiku · advisor=`advisor-model-resolve.sh` 출력(**기본 `gpt-6-astra`** · CLI<0.153.4 면 `gpt-5.6-sol` 로 하향).
  ⚠️ **구 표기 "기본 Fable 5.1 · 대체 gpt-6-astra" 는 2026-09-17 폐기** — 2026-09-07 Human 지시(advisor 기본 Fable→Astra)를 이 파일이 따라오지 못했다. 문서는 fable, 리졸버는 astra 를 내고 있었다.
  실측 재현: `bash shared/scripts/advisor-model-resolve.sh` → `gpt-6-astra` · `bash shared/scripts/advisor-spawn-guard.sh resolve` → `gpt-6-astra` (2026-09-17 관측).
  근거: 문서가 조언자 벤더를 틀리게 적으면 "실행자와 다른 벤더에게 묻는다" 는 교차 규율을 사람이 손으로 뒤집는다. 정본 → `rules/model-routing.md §세션 운영 모델`.
  폐기조건: 사람이 기본 조언자를 다시 정하면 이 줄을 갱신한다.

## Override 경로

NOT DONE/UNVERIFIABLE 항목의 override 선언·재검증(단일 FR 재탐색, override당 1회)은
`~/.claude/rules-on-demand/verification-overrides.md` 스키마(`must_have/reason/accepted_by/at`) 참조.

## 주의사항

- 읽기 전용 wrapper. 코드 수정은 Lead 수행
- Agent Drift 검사(삭제 agent 감지·외부발송 게이트) → **2026-08-11 스킬 제거됨**(미사용). 필요 시 `system-audit` 또는 수동 점검
> 실패 시 [[pev-self-correction]] 적용
