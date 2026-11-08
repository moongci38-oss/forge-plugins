# article — Reference

> `SKILL.md` 에서 분리된 게이트 상세 정본.

## 목차
- [§검증 게이트 합성 룰 + 독립 Evaluator](#검증-게이트-합성-룰--독립-evaluator) — 게이트를 돌릴 때 읽는다

---

## 검증 게이트 합성 룰 + 독립 Evaluator

### 호출 순서 합성 룰 (Step 4.7 검수 + eval-rubric)

두 검증을 모두 돌린다. 순서·결과 합성은 다음 룰을 따른다 — 검수 호출·판정 처리의 정본은 SKILL.md Step 4.7.

### 발화 순서 (강제)

```
1. analysis md 저장 (01-research/articles/{date}/{slug}-analysis.md)
2. /forge-review --stage final --target <analysis.md 절대경로> --mode multi -- --allow-unbound-final   (적대적 검수 — Step 4.7 · 분석문 대상)
3. /eval-rubric --target {analysis 경로} (다축 정량 채점)
4. eval_cases.jsonl 에 EC-article-{N} 1줄 append
```

순서 이유:
- Step 4.7 검수 = 막을 수 있다(FAIL·`hasCrit` → [STOP]). 먼저 통과해야 뒤가 의미 있다.
- eval-rubric = 정량 점수만 (자동 차단 X). 항상 마지막.

### 결과 합성 룰

| Step 4.7 검수 | eval-rubric 결과 | 종합 verdict | 처리 |
|---|---|---|---|
| PASS | PASS | **PASS** | 종결 |
| PASS | WARN (≤1축 0점) | **WARN** | rationale 를 보고에 |
| PASS | FAIL (≥2축 0점) | **WARN** | 0점 축을 보고에 명시 (eval-rubric 은 자동 차단 X) |
| WARN | * | **WARN** | 검수 WARN 우선 + rubric 보조 |
| FAIL · `hasCrit=true` | * | **FAIL [STOP]** | 고치고 보고 — 다시 검수하지 않는다 |
| `INVALID_INPUT` · `content_integrity=lost` | * | 판정 아님 | 쪼개 재호출 ("통과" 금지) |

### 영역 차이 (왜 둘 다 필요한가)

| 검증 | 영역 | 강점 | 약점 |
|---|---|---|---|
| Step 4.7 검수 (`/forge-multi` 2레그) | 적대적 검수 | 벤더 교차(Claude·Codex)로 한 모델의 맹점 보완 | 정량 점수 X |
| eval-rubric | 다축 정량 | clarity/consistency/completeness/safety 4축 점수 | 모델 동일 (자체 편향 가능) |

**상호 보완**: 검수가 못 잡는 정량 측면 = eval-rubric 보강. eval-rubric 이 못 잡는 적대적 견제 = 검수 보강.

### 비활성 조건

- `EVAL_RUBRIC_AUTO=off` → eval-rubric 기록만 생략(fail-open), Step 4.7 검수는 진행
- Step 4.7 검수를 끄는 인자는 없다 (`--skip-cr-plan` 은 끌 대상이 없다)

### eval_cases.jsonl 표기

결과 1줄 — case_id `EC-article-{N}` (표기·split 정본 = `eval-rubric/references/skill-integration.md`).

```json
{"case_id":"EC-article-1","skill":"article","target":"<analysis.md>","verdict":"WARN","scores":{...},...}
```

---

### 독립 Evaluator (하네스)

기사 분석 리포트 완성 후 독립 Evaluator Subagent가 분석 품질을 검증한다.

```python
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 독립 분석 품질 검증자입니다. article (기사 심층 분석) 결과물을 검토하세요.

검증 항목:
- 본문 핵심 주장이 정확히 파악됐는가?
- 비판적 분석에 팩트체크 결과 표가 있는가 (검증 필요 수치·주장)?
- 내부 링크 파고들기가 실행됐는가 (--deep 모드)?
- Forge 시스템 비교 분석이 구체적인가?

판정: PASS / FAIL
피드백: [파일명+섹션] — [이유] → [방법]
"""
)
```

피드백 루프:
- PASS → 파이프라인 계속 (저장/발행)
- FAIL → 지적 항목 보완 후 Evaluator 재실행 (1회 한도)
- 2회 연속 FAIL → [STOP] Human 에스컬레이션
