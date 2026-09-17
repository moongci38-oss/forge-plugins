# article — Reference

> `SKILL.md` 에서 분리된 산출물 형식·게이트 상세 정본.
> 2026-08-22(harness-diet SK-05)에 **출력 형식**이, 2026-08-28(500줄 규정 준수)에 **게이트 2절**이 여기로 왔다.
> 진입 로직은 `SKILL.md` 에, 출력 형식·게이트 상세는 여기 있다. 원문 그대로이며 내용 변경은 없다.

## 목차
- [§출력 형식 (analysis.md)](#출력-형식-analysismd) — 리포트를 쓰기 직전에 읽는다
- [§Step 4.7 적대적 검수](#step-47--적대적-검수-cr-triple-2레그-적용-계획서-전용) — 적용 계획서를 만들었을 때만 읽는다
- [§검증 게이트 합성 룰 + 독립 Evaluator](#검증-게이트-합성-룰--독립-evaluator) — 게이트를 돌릴 때 읽는다

---

## 출력 형식 (analysis.md)

```markdown
# {title}
> {domain} | {author} | {published}
> 원본: {url}
> 카테고리: {category} | 태그: #{tag1} #{tag2}

## TL;DR
(1-2문장)

## 핵심 포인트
1. **포인트 내용**
2. ...

## 비판적 분석

### 주장 1: "{핵심 주장}" [출처: URL] | [미검증] (검증 소스 없을 때)
- **제시된 근거**: ...
- **근거 유형**: 실증/경험/의견
- **한계**: ...
- **반론/대안**: ...

## 팩트체크 대상
- **주장**: "..." | **검증 필요 이유**: ... | **검증 방법**: ...

## 팩트체크 결과
| # | 주장 | 판정 | 근거 |
|:-:|------|:----:|------|
| 1 | "..." | ✅/⚠️/❌/❓ | 출처 + 요약 |

## 관련 링크 분석
| # | 링크 | 유형 | 핵심 내용 | 기사와의 관계 |
|:-:|------|:----:|---------|:-----------:|
| 1 | [제목](url) | 공식/블로그/논문/GitHub | ... | 보강/반박/확장 |

## 웹 리서치 결과
| 주제 | 출처 | 핵심 인사이트 | 기사와의 관계 |
|------|------|-------------|:-----------:|
| ... | [제목](url) | ... | 일치/보완/반박 |

## 시스템 비교 분석
| 기사 제안 | 우리 현황 | 갭 | 영향도 | 난이도 |
|----------|---------|:--:|:----:|:----:|
| ... | 이미 적용/부분/미적용 | 구체적 갭 | H/M/L | H/M/L |

## 필수 개선 제안

### P0 — 즉시 적용
- **[시스템]** 내용: 현황 → 제안 → 기대 효과

### P1 — 이번 주
- ...

### P2 — 이번 달
- ...

## 실행 가능 항목
- [ ] 항목 (담당: 프로젝트명)

## 관련성
- **Portfolio**: N/5 — 이유
- **GodBlade**: N/5 — 이유
- **비즈니스**: N/5 — 이유

## 핵심 인용
> "원문" — 출처

## 추가 리서치 필요
- 주제 (검색 키워드: `keyword1`, `keyword2`)
```

---

## Step 4.7 — 적대적 검수 (cr-triple 2레그, 적용 계획서 전용)


**적용 대상**: Step 4-2 의 개별 `-apply-plan.md`. 분석 리포트(`-analysis.md`)·비교 리포트
(`-comparison.md`) = **대상 X** (콘텐츠 분석 ≠ Spec/Plan).

> **2026-08-27 Human 지시로 `codex-review`(단일 Codex 레그) → `cr-triple`(당시 3레그)로 승격.**
> 한 벤더만 보면 그 벤더의 맹점을 그대로 통과시킨다. 서로 다른 벤더가 각각 읽고 교차하면
> 한 모델이 놓친 것을 다른 모델이 집는다.
> **현행(2026-09-17~) = 2벤더 교차 2레그**: Claude(Opus 5) + Codex(GPT-5.6 Sol), effort 는 `cr-risk-tier.sh` 등급별.
> ⚠️ 구 표기 "Claude(Fable 5.1) + Codex(GPT-6 Astra), effort=xhigh"(2026-09-07~09-16)는 2026-09-17 폐기 — 최고급은 advisor 전용(사람 지시).
> 구 3레그의 Gemini 레그는 전면 철수로 폐지됐다(정본 `model-routing.md §검수 2레그`).
> 위 "3레그" 는 승격 **당시**의 구성이다 — 경위 기록이라 지우지 않고 시점을 명시한다.
> ⚠️ 다만 이 구조는 **완화 장치이지 무편향 보장이 아니다**(`cr-multi/SKILL.md §self-referential bias`).

**Skip 조건**
- 인자: `/article <입력> --skip-cr-plan`
- apply-plan 부재 (비기술 카테고리 → Step 4 자체 skip → 이 절도 자동 skip)

⚠️ **게이트는 `--cr` 하나다.** 검수는 **2벤더 교차 2레그**(Claude Opus 5 + Codex GPT-5.6 Sol)인데,
팀 기본값 `FORGE_AUTO_CR=degrade` 때문에 그냥 부르면 **Codex 레그가 빠져 1레그가 된다** —
**`--cr on` 을 명시**해야 2레그가 온전히 뜬다. 전역 기본값은 건드리지 않는다
(정본 `model-routing.md §검수 2레그` — 2026-08-22 승인의 효력은 검수 기본값으로 한정된다).
⚠️ 2026-09-12 정정: 구 서술은 "3레그"였고 죽은 줄번호(`model-routing.md:27`)를 인용했다.
3레그·Gemini 레그는 2026-09-07 폐지됐고, 그 줄번호에는 해당 내용이 없다.
⚠️ 구 `CODEX_REVIEW_AUTO_STAGES` 게이트는 이 절에 **더 이상 관여하지 않는다**(codex-review 를 안
부른다). 그 env 는 다른 stage 용으로 남아 있다.

**호출**

```bash
[ "$SKIP_CR_PLAN" = "1" ] && exit 0
PLAN_FILE="docs/planning/active/plans/${date}-${title_slug}-apply-plan.md"
[ -f "$PLAN_FILE" ] || exit 0
```

```
/cr-triple "$PLAN_FILE" --stage plan --cr on
```

**판정 소비** — 결과는 **Workflow 반환값**(`verdict` / `issues[]` / `degraded`)에서 읽는다.
⚠️ 파일을 `jq` 로 파싱하지 마라 — 구 `docs/reviews/{stage}/{slug}-cr-multi.json` 발행은
2026-07-24 에 폐지됐고 지금 그 경로를 쓰는 코드는 없다.

| verdict | 행동 |
|---|---|
| `PASS` | 종결, 다음 단계 진행 |
| `WARN` (high·critical 0건) | 계획서에 지적 요약 1줄 기록 후 진행 |
| `WARN` (high·critical 1건 이상) | **[STOP]** 사용자 검토 — 자동 fix 금지 |
| `FAIL` | **[STOP]** 사용자 검토 |
| `INVALID_INPUT` | **판정이 아니다.** PASS/WARN/FAIL 어느 쪽으로도 집계하지 않는다. `issues[].code`(`too_large`·`not_found`·`content_mismatch`·`rate_limited`)대로 입력을 고쳐 **1회 재호출**하고(`rate_limited` 는 나누지 말고 한도가 풀린 뒤 같은 인자로), 그래도 실패하면 `검수 미판정` 으로 기록만 하고 진행한다. `score` 는 `null` 이니 인용하지 마라 |

`degraded: true` 로 돌아왔으면 **레그가 빠진 채 나온 판정**이다 — 어느 레그가 빠졌는지 함께 기록한다.
2레그가 아니면 "2벤더 교차검수를 했다"고 쓰지 않는다.

⚠️ **이 방어가 무력화되는 입력**: 비기술 영상·기사는 apply-plan 이 아예 없어 조용히 통과한다.
리포트 **본문**의 품질은 이 절이 아니라 Step 2.83(반박/대안 병렬 검증)·Step 2.88(추가 리서치
즉시 해소)·eval-rubric 이 맡는다.

---

## 검증 게이트 합성 룰 + 독립 Evaluator

### 호출 순서 합성 룰 (cr-triple + eval-rubric)

본 스킬은 두 개의 독립 검증 게이트를 모두 발화한다. 순서·결과 합성은 다음 룰을 따른다.

### 발화 순서 (강제)

```
1. analysis md 저장 (01-research/articles/{date}/{slug}-analysis.md)
2. /cr-triple "{apply-plan 경로}" --stage plan --cr on   (2레그 adversarial — Step 4.7)
3. /eval-rubric --target {analysis 경로} (다축 정량 채점)
4. 두 결과를 eval_cases.jsonl 별도 라인으로 append (skill 필드로 구분)
   - skill="article-codex" + skill="article-rubric"
```

순서 이유:
- cr-triple = blocking 잠재 (FAIL·WARN+high 시 사용자 게이트). 먼저 통과해야 후속 의미.
- eval-rubric = 정량 점수만 (자동 차단 X). 항상 마지막.

### 결과 합성 룰

| codex 결과 | eval-rubric 결과 | 종합 verdict | 처리 |
|-----------|----------------|------------|------|
| PASS | PASS | **PASS** | 종결 |
| PASS | WARN (≤1축 0점) | **WARN** | rationale 사용자 알림 |
| PASS | FAIL (≥2축 0점) | **WARN** | 사용자 결정 게이트 (적용 전) |
| WARN | * | **WARN** | codex WARN 우선 + rubric 보조 |
| FAIL (c=0,h=0) | * | **WARN** | L-31 적용. rubric으로 보강 |
| FAIL (c≥1 또는 h≥1) | * | **FAIL [STOP]** | 사용자 검토 의무 (자동 fix X) |

### 영역 차이 (왜 둘 다 필요한가)

| 검증 | 영역 | 강점 | 약점 |
|------|------|------|------|
| cr-triple | 2레그 adversarial | 벤더 교차로 단일 모델 맹점 보완 (Claude Opus 5 + Codex GPT-5.6 Sol) | 정량 점수 X |
| eval-rubric | 다축 정량 | clarity/consistency/completeness/safety 4축 점수 | 모델 동일 (자체 편향 가능) |

**상호 보완**: codex가 못 잡는 정량 측면 = eval-rubric 보강. eval-rubric이 못 잡는 적대적 견제 = codex 보강.

### 비활성 조건

- `EVAL_RUBRIC_AUTO=off` → eval-rubric만 스킵, cr-triple은 진행
- `--skip-cr-plan` 인자 → cr-triple만 스킵, eval-rubric은 진행
- 둘 다 스킵: `--skip-cr-plan` + `EVAL_RUBRIC_AUTO=off` 동시 적용

### eval_cases.jsonl 표기

두 결과 모두 누적 (별도 라인):

```json
{"case_id":"EC-article-codex-1","skill":"article-codex","target":"apply-plan.md","verdict":"PASS",...}
{"case_id":"EC-article-rubric-1","skill":"article-rubric","target":"analysis.md","verdict":"WARN","scores":{...},...}
```

> 출처: AD-19 (eval-rubric 시스템 통합) + AD-21 (warn 기본). 합성 룰 = 본 작업 (2026-05-11).

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
- 팩트체크 대상이 명시됐는가 (검증 필요 수치·주장)?
- 내부 링크 파고들기가 실행됐는가 (--deep 모드)?
- Forge 시스템 비교 분석이 구체적인가?
- 적용 계획서의 액션 아이템에 담당·기한·의존성이 있는가?

판정: PASS / FAIL
피드백: [파일명+섹션] — [이유] → [방법]
"""
)
```

피드백 루프:
- PASS → 파이프라인 계속 (저장/발행)
- FAIL → 지적 항목 보완 후 Evaluator 재실행 (1회 한도)
- 2회 연속 FAIL → [STOP] Human 에스컬레이션
