# yt — Reference

> SKILL.md 본문에서 분리된 상세 템플릿·기준표. 해당 Step 실행 시에만 Read.

## 목차

**필요한 절만 골라 읽는다** — 408줄이라 통째로 열면 그 세션 예산을 그만큼 먹는다.

| 절 | 언제 읽나 |
|---|---|
| [§Step 4.5 종합 적용 계획 보고서 형식](#step-45-종합-적용-계획-보고서-형식) | 여러 영상의 적용 계획서를 쓸 때 |
| [§출력 형식 전체 템플릿](#출력-형식-전체-템플릿) | 개별 영상 분석 리포트를 쓰기 직전 |
| [§Step 2.85 — Ground Truth Check (GTC)](#step-285--ground-truth-check-gtc) | 시스템 비교분석 **직전** |
| [§Step 4.7 — 적대적 검수 (cr-triple 3레그)](#step-47--적대적-검수-cr-triple-3레그) | 적용 계획서를 만들었을 때만 |
| [§검증 게이트 합성 룰 + 독립 Evaluator](#검증-게이트-합성-룰--독립-evaluator) | 게이트를 돌릴 때 |
| [§Step 3.5 — 타임스탬프 검증 게이트](#step-35--타임스탬프-검증-게이트) | 분석 저장 직후 |
| [§Step 4.9 — HTML 대시보드 생성](#step-49--html-대시보드-생성) | 대시보드를 만들 때 |

> 근거: `skill-creator` SKILL.md — 100줄 초과 reference 에는 목차를 둔다.
> 폐기조건: 이 파일이 100줄 이하로 줄면 목차를 뺀다.

---

## §Step 4.5 종합 적용 계획 보고서 형식

```markdown
# 종합 적용 계획 보고서
> 분석 영상: {영상 제목 목록} | 작성일: {date}

## 핵심 요약
{2-3문장: 이번 영상들에서 공통적으로 도출된 우리 시스템 개선 방향}

## 영상별 주요 인사이트 종합
| 영상 | 핵심 제안 | 우리 시스템 적용 여부 |
|------|---------|:-----------------:|
| 영상1 제목 | 핵심 제안 요약 | 적용/부분/미적용 |

## 현재 시스템 대비 갭 분석
| 기능/패턴 | 영상 출처 | 우리 현황 | 갭 | 영향도 | 난이도 |
|----------|---------|---------|:--:|:----:|:----:|

## 꼭 필요한 적용 항목 (선별 기준: 영향도 High + 실현 가능)

### P0 — 즉시 적용 (이번 주)
- **[시스템]** 기능명: 현황 → 변경 내용 → 기대 효과

### P1 — 단기 (이번 달)
- **[시스템]** 기능명: 현황 → 변경 내용 → 기대 효과

### P2 — 중기 (다음 분기)
- **[시스템]** 기능명: 현황 → 변경 내용 → 기대 효과

## 제외 항목 (이유 포함)
| 항목 | 제외 이유 |
|------|---------|
| ... | 이미 적용됨 / 영향도 낮음 / 리소스 대비 효과 낮음 |

## 실행 체크리스트
- [ ] P0 항목 (담당: Business/Portfolio/GodBlade)
- [ ] P1 항목

## 참고 영상
{각 영상 URL 및 분석 파일 경로}
```

## §출력 형식 전체 템플릿

```markdown
# {title}
> {channel} | {published} | {view_count} views | {duration}
> 원본: https://youtu.be/{video_id}
> 자막: {자막 유형} (신뢰도 {등급})

## TL;DR
(1-2문장)

## 카테고리
{category} | #{tags}

## 핵심 포인트
1. **포인트** [🕐 MM:SS](url?t=seconds)
...

## 댓글 인사이트
> 상위 댓글 {N}개 분석 (총 {총댓글수})

### 커뮤니티 반응 패턴
- **동의/확인**: ...
- **이견/반론**: ...
- **보충 정보**: ...

### 주목할 댓글
> "댓글 내용" — 작성자 👍 N

## 설명란 자료 요약
| # | 링크 | 유형 | 핵심 내용 |
|:-:|------|:----:|---------|
| 1 | [제목](url) | 공식문서/블로그/논문 | ... |

## 비판적 분석

### 주장 1: "{핵심 주장}"
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

## 웹 리서치 결과
| 주제 | 출처 | 핵심 인사이트 | 영상과의 관계 |
|------|------|-------------|:-----------:|
| ... | [제목](url) | ... | 일치/보완/반박 |

## 시스템 비교 분석
| 제안/발견 | 우리 현황 | 갭 | 영향도 | 난이도 |
|----------|---------|:--:|:----:|:----:|
| ... | 이미 적용/부분/미적용 | 구체적 갭 | H/M/L | H/M/L |

## 필수 개선 제안

### P0 — 즉시 적용 가능
- **[시스템]** [개선 내용]: [현재 문제] → [제안] → [기대 효과]

### P1 — 이번 주
- ...

### P2 — 이번 달
- ...

## 실행 가능 항목
- [ ] 항목 (적용 대상: Portfolio/GodBlade/Business 명시)

## 관련성
- **Portfolio**: N/5 — 이유
- **GodBlade**: N/5 — 이유
- **비즈니스**: N/5 — 이유

## 핵심 인용
> "원문" — 발표자

## 추가 리서치 필요
- 주제 (검색 키워드: `keyword1`, `keyword2`)
```

## §Step 2.85 — Ground Truth Check (GTC)

> SKILL.md 의 해당 Step 을 **실제로 돌릴 때** Read 한다.
> (2026-08-28 이동 — 절차 원문 그대로.)


시스템 비교분석 **직전에** 아래 4단계 검증을 수행하여 Step 2.9의 입력을 정확하게 만든다.

**GTC-1: 관련성 필터** — 영상에서 언급된 도구/서비스가 우리 시스템에서 실제 사용 중인지 확인
- Read: `.mcp.json`, `$HOME/.claude.json` (MCP 서버 목록)
- Read: `forge-workspace.json` (활성 프로젝트)
- Glob: `.claude/skills/*/SKILL.md`, `.claude/agents/*.md`
- 영상의 도구/서비스 언급을 위 파일에서 검색
- **미사용 도구에 대한 High+ 개선 제안** → 영향도를 Low로 강제 하향 + "우리 시스템 미사용" 표기

**GTC-2: 기구현 확인** — 영상의 제안/패턴이 이미 우리 시스템에 존재하는지 확인
- Glob: `.github/workflows/*.yml` (GitHub Actions)
- **Grep(내용 검색) 필수 — Glob(파일명 목록)만으로 "미적용" 단정 금지**: 각 제안 역량의 키워드로 `.claude/skills/*/SKILL.md`, `.claude/agents/*.md`, `.claude/scripts/**`, `${FORGE_ROOT:-$HOME/forge}/shared/scripts/**`, `$HOME/.claude/rules*/*.md` **내용**을 Grep한다. (근본원인: 스킬명만 보고 역량을 놓치는 false gap — 실사례 2026-07-03 playwright-parallel-test/visual-loop/healer, promote-learnings.sh 누락)
- **증거 원장(evidence ledger) 강제**: 비교 매트릭스의 어떤 행을 `미적용/부재/갭`으로 라벨하려면 그 행마다 기록 — `검색 위치` / `grep 쿼리` / `검토한 히트` / `왜 불충분` / `최종 라벨`. 원장 없는 `미적용` 행 금지. grep 히트 있으면 `기구현` 또는 `부분적용(차이 명시)`로 라벨.
- **`미적용` 라벨은 3축 중 2축 이상을 통과해야 한다 (2026-08-18 추가)**: 원장 5칸이 다 차 있어도 **쿼리가 상류 어휘 하나뿐이면 결론이 틀릴 수 있다.** 우리가 그 역량을 **다른 이름으로 부르고 있으면** 그 이름으로는 아무것도 안 잡히기 때문이다. 그래서 아래 셋 중 **둘 이상**에서 0건일 때만 `미적용`으로 라벨한다.
  | 축 | 무엇을 찾나 | 이름을 몰라도 되나 |
  |---|---|---|
  | ① 상류·영상 어휘 | 그쪽이 쓰는 용어 그대로 | ✅ |
  | ② **행동 계약 문구** | 그 역량이 *하는 일*의 서술로 검색(예: "결정만 묻는다"·"합의 전 실행 금지") | ✅ **이름 불필요** |
  | ③ **레지스트리·소비처 역인덱스** | `.claude/brain/registry/` 분류 · `rules-on-demand/` 목록 · 커맨드가 참조하는 룰 파일 전량 | ✅ **이름 불필요** |
  - **②③이 핵심**이다 — 우리 이름을 몰라도 역량에 도달하는 경로이기 때문이다. ⚠️ *"우리 명칭으로도 grep 한다"* 같은 규칙은 **순환이라 쓰지 않는다**: 이름을 모르는 것이 바로 실패 원인인데 그 이름을 입력으로 요구하면 다음 사례에서 똑같이 실패한다.
  - 우리 이름을 모르겠으면 **그것부터가 조사 대상**이지 `미적용`의 근거가 아니다.
  - 근거: 2026-08-18 — 한 분석이 `grill` 패턴을 "미도입"으로 판정했으나 `grilling-protocol.md` 가 **2026-07-10 에 이미 흡수돼 소비처 7곳**에 배선돼 있었다. 상류 어휘(`fog|answer.key|decision.ticket`)로만 검색해서 놓쳤고, ③이었으면 `brain/registry/behavior/grilling-protocol.json` 실존으로 즉시 잡혔다.
  - 재현(**`git grep` 을 쓴다 — `grep -r` 은 흔들린다**): `git -C "${FORGE_ROOT:-$HOME/forge}" grep -lie grill -- '.claude/*.md' '.claude/**/*.md' 'dev/global-rules/*.md' | wc -l` → **12건**(이 규칙 문서 자신 포함 — 이 항 추가 전엔 11건. 2026-08-19 관측).
    ⚠️ **`grep -rli ... --include='*.md'` 를 쓰면 안 된다.** `.claude/worktrees/` 안에 워크트리가 하나라도 있으면 **같은 파일을 중복으로 세서** 수가 부풀고(2026-08-19 실측: 워크트리 안 12 · 메인 체크아웃 **25** · `--exclude-dir=worktrees` **11** — 한 명령이 세 값을 낸다), 그 불일치가 다음 세션에 갭으로 오판된다. `git grep` 은 **추적 파일만** 보므로 워크트리 유무와 무관하게 같은 값을 낸다.
    이 규칙이 경고하는 것이 바로 "검색 범위가 달라 결론이 흔들린다"인데 **1차 재현 명령 자신이 그 병을 앓고 있었다**(PR #296 cr-final Codex 지적, 실측 확인 후 교체).
  - 폐기조건: 이 3축을 적용한 뒤에도 false gap 이 2건 이상 나오면 축 구성을 재설계한다.
- **[자가검증 게이트]** 시스템 비교 테이블 출력 직전, 각 갭 행에 grep 증거가 첨부됐는지 자가 확인. 누락 시 테이블 생성 중단 후 grep 선행(인라인 자동 수정 — Human [STOP] 아님).
- **이미 구현된 기능을 개선 제안하는 경우** → 비교 매트릭스에서 "기구현" 표기, 제안 목록에서 제거

**GTC-3: 핵심 커버리지** — Forge/Forge Dev 파이프라인 현황을 실제 파일에서 확인
- Read: `forge-workspace.json` → 활성 프로젝트 + gate-log.md 위치
- Read: 각 프로젝트의 `gate-log.md` → 현재 Gate 위치
- **"컨텍스트에서 자동 참조" 대신 실제 파일 Read 결과를 Step 2.9의 입력으로 사용**

**GTC-4: 영향도 검증 (P1 승격 게이트)** — P1 이상 항목이 아래 기준 중 하나 이상 충족하는지 확인
- 현재 장애/에러를 유발하고 있는가?
- 이번 주 작업에 직접 blocking인가?
- 비용이 측정 가능하게 증가하고 있는가?
- deprecated/breaking change로 기한이 있는가?
- **미충족 시**: P1 금지 → P2 또는 모니터링으로 강제 하향
- **출처 필수**: 비용·영향도 방향 판단은 반드시 출처(공식문서 URL 또는 실측 로그) 인용이 필요하다. 근거 없이 방향을 단정한 항목은 `[보류-데이터필요]`로만 표기하고, 그 상태로는 우선순위 강등(P2) 사유에서 제외한다.


> GTC 실패는 모두 인라인 자동 수정이다. [STOP] 없이 수정 후 Step 2.9로 진행한다.

---

## §Step 4.7 — 적대적 검수 (cr-triple 3레그)

> **적용 계획서를 만든 경우에만** Read 한다. 계획서가 없으면 이 Step 자체를 건너뛴다.
> (2026-08-28 이동 — 절차 원문 그대로.)


**적용 대상**: Step 4-2 의 개별 `-apply-plan.md`. 분석 리포트(`-analysis.md`)·비교 리포트
(`-comparison.md`) = **대상 X** (콘텐츠 분석 ≠ Spec/Plan).

> **2026-08-27 Human 지시로 `codex-review`(단일 Codex 레그) → `cr-triple`(3레그)로 승격.**
> 한 벤더만 보면 그 벤더의 맹점을 그대로 통과시킨다. Claude(Fable 5)·Codex(gpt-5.6-sol)·
> Gemini 셋이 각각 읽고 교차하면 한 모델이 놓친 것을 다른 모델이 집는다.
> ⚠️ 다만 이 구조는 **완화 장치이지 무편향 보장이 아니다**(`cr-multi/SKILL.md §self-referential bias`).

**Skip 조건**
- 인자: `/yt <입력> --skip-cr-plan`
- apply-plan 부재 (비기술 카테고리 → Step 4 자체 skip → 이 절도 자동 skip)

⚠️ **게이트는 `--cr` 하나다.** 팀 기본값 `FORGE_AUTO_CR=degrade` 때문에 그냥 부르면 Codex 레그가
빠져 2레그가 된다 — **`--cr on` 을 명시**해야 3레그가 온전히 뜬다. 전역 기본값은 건드리지 않는다
(`model-routing.md:27` — 2026-08-22 승인의 효력은 검수 3레그 기본값으로 한정된다).
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
| `INVALID_INPUT` | **판정이 아니다.** PASS/WARN/FAIL 어느 쪽으로도 집계하지 않는다. `issues[].code`(`too_large`·`not_found`·`content_mismatch`)대로 입력을 고쳐 **1회 재호출**하고, 그래도 실패하면 `검수 미판정` 으로 기록만 하고 진행한다. `score` 는 `null` 이니 인용하지 마라 |

`degraded: true` 로 돌아왔으면 **레그가 빠진 채 나온 판정**이다 — 어느 레그가 빠졌는지 함께 기록한다.
3레그가 아니면 "3레그 교차검수를 했다"고 쓰지 않는다.

⚠️ **이 방어가 무력화되는 입력**: 비기술 영상·기사는 apply-plan 이 아예 없어 조용히 통과한다.
리포트 **본문**의 품질은 이 절이 아니라 Step 2.83(반박/대안 병렬 검증)·Step 2.88(추가 리서치
즉시 해소)·eval-rubric 이 맡는다.

---

## §검증 게이트 합성 룰 + 독립 Evaluator

> 게이트를 **돌릴 때** Read 한다.
> (2026-08-28 이동 — 발화 순서·프롬프트 원문 그대로.)

### 호출 순서 합성 룰 (cr-triple + eval-rubric)

본 스킬은 두 개의 독립 검증 게이트를 모두 발화한다. 순서·결과 합성은 다음 룰을 따른다.

### 발화 순서 (강제)

```
1. analysis md 저장 (01-research/videos/analyses/{slug}-analysis.md)
2. /cr-triple "{apply-plan 경로}" --stage plan --cr on   (3레그 adversarial — Step 4.7)
3. /eval-rubric --target {analysis 경로} (다축 정량 채점)
4. 두 결과를 eval_cases.jsonl 별도 라인으로 append (skill 필드로 구분)
   - skill="yt-codex" + skill="yt-rubric"
```

순서 이유:
- cr-triple = blocking 잠재 (FAIL·WARN+high 시 사용자 게이트). 먼저 통과해야 후속 의미.
- eval-rubric = 정량 점수만 (자동 차단 X). 항상 마지막.

### 결과 합성 룰

두 게이트 결과를 조합해 종합 verdict 를 정한다.

| cr-triple 결과 | eval-rubric 결과 | 종합 verdict | 처리 |
|-----------|----------------|------------|------|
| PASS | PASS | **PASS** | 종결 |
| PASS | WARN (≤1축 0점) | **WARN** | rationale 사용자 알림 |
| PASS | FAIL (≥2축 0점) | **WARN** | 사용자 결정 게이트 (적용 전) |
| WARN | * | **WARN** | cr-triple WARN 우선 + rubric 보조 |
| FAIL (c=0,h=0) | * | **WARN** | L-31 적용. rubric 으로 보강 |
| FAIL (c≥1 또는 h≥1) | * | **FAIL [STOP]** | 사용자 검토 의무 (자동 fix X) |

### 영역 차이 (왜 둘 다 필요한가)

| 검증 | 영역 | 강점 | 약점 |
|------|------|------|------|
| cr-triple (3레그) | adversarial extension | 벤더 교차로 동일 모델 맹점 보완 (Claude Fable 5 · Codex gpt-5.6-sol · Gemini) | 정량 점수 X |
| eval-rubric | 다축 정량 | clarity/consistency/completeness/safety 4축 점수 | 모델 동일 (자체 편향 가능) |

**상호 보완**: cr-triple 이 못 잡는 정량 측면 = eval-rubric 보강. eval-rubric 이 못 잡는 적대적 견제 = cr-triple 보강.

⚠️ 2026-08-28 정정: 이 두 표는 구 `§호출 순서 합성 룰 상세` 절에서 흡수했다. 그 절은
`codex-review | 단일 레그` 로 남아 있어 Step 4.7 의 3레그 cr-triple 과 모순이었고, 헤딩도
이 절과 중복이었다(`### 결과 합성 룰` · `### eval_cases.jsonl 표기`).
재현: `grep -E '^#{2,4} ' .claude/skills/yt/reference.md | sort | uniq -d` → 0건.

### 비활성 조건

- `EVAL_RUBRIC_AUTO=off` → eval-rubric만 스킵, cr-triple은 진행
- `--skip-cr-plan` 인자 → cr-triple만 스킵, eval-rubric은 진행
- 둘 다 스킵: `--skip-cr-plan` + `EVAL_RUBRIC_AUTO=off` 동시 적용

### eval_cases.jsonl 표기

두 결과 모두 누적 (별도 라인, skill 필드로 구분: `yt-codex` / `yt-rubric`).

```json
{"case_id":"EC-yt-codex-1","skill":"yt-codex","target":"apply-plan.md","verdict":"PASS",...}
{"case_id":"EC-yt-rubric-1","skill":"yt-rubric","target":"analysis.md","verdict":"WARN","scores":{...},...}
```

> 출처: AD-19 (eval-rubric 시스템 통합) + AD-21 (warn 기본). 합성 룰 = 본 작업 (2026-05-11).

---

### 독립 Evaluator (하네스)

yt 스킬 결과물 완성 후 독립 Evaluator Subagent가 품질을 2차 검증한다.

> **원칙**: 생성자 ≠ 평가자. 자기평가 편향 방지.

```python
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 yt 스킬 결과물의 독립 품질 검증자입니다.

아래 기준으로 결과물을 평가하세요:
1. 핵심 인사이트(핵심 포인트)가 5개 이상 도출됐는지 확인한다. 5개 미만이면 FAIL.
2. 요약(TL;DR 및 핵심 포인트)이 원본 영상 내용을 왜곡 없이 정확하게 반영하는지 확인한다. 사실 오류·과장·생략이 있으면 FAIL.
3. 결과물에 ACHCE 축 태그(Agentic/Context/Harness/Cost/Human-AI) 중 하나 이상이 부여됐는지 확인한다. 태그 없으면 FAIL.
4. Notion 업로드 완료 여부(Step 5 실행 기록)가 결과물에 명시됐는지 확인한다. 미실행이면 FAIL.

판정: PASS(기준 충족) / FAIL(재작업 필요)
피드백 형식: [파일명+섹션] — [이유] → [방법]
"""
)
```

피드백 루프:
- PASS → 파이프라인 계속
- FAIL → 재작업 후 1회 재실행. 2회 연속 FAIL 시 [STOP] Human 에스컬레이션

---

## §Step 3.5 — 타임스탬프 검증 게이트

> 리포트 저장 직후, 파생물(대시보드·학습노트)을 만들기 **전에** Read 한다.
> (2026-08-28 이동 — 검증 명령 원문 그대로.)


쉽게 말하면 **책 인용에 적은 페이지 번호를 책을 펴서 맞춰보는 단계**다. 이 스킬은 오래
`[🕐 MM:SS](…?t=N)` 링크를 붙이면서 그 숫자를 트랜스크립트와 한 번도 대조하지 않았다.
실측 오차 최대 **-5573초(92분)** — 드리프트가 아니라 그냥 깨진 인용이다.

```bash
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/yt-timestamp-verify.py \
  "{outputsRoot}/01-research/videos/analyses/{date}-{video_id}-{slug}-analysis.md" --apply
```

- 필요한 데이터는 이미 로컬에 있다(같은 접두어 `.json` 의 `segments`) — **외부 호출 0회**.
- **여기서 돌리는 이유**: 대시보드·학습노트 같은 파생물이 아직 안 만들어졌기 때문이다.
  정본을 먼저 고쳐야 파생물이 맞는 값을 물려받는다. 순서가 바뀌면 정본만 고치고
  사용자가 보는 화면은 옛 값으로 남는다(2026-08-18 실사고).
- 도구는 **인용으로 시작하는 줄만 자동 정정**한다. 한국어 의역 요약은 문자열 매칭이 안 되므로
  `unverified-paraphrase` 로 남기고 손대지 않는다 — 억지로 고치는 것보다 안 고치는 쪽이 안전하다.
- 의역 줄 **안에** 원어 인용이 박혀 있으면 `quote-in-paraphrase` 로 **후보만 알려 주고 고치지 않는다.**
  그 링크는 인용이 아니라 항목 전체를 가리키므로, 인용 위치로 옮기면 링크의 의미가 조용히 바뀐다.
  옮길지는 사람이 판단한다.
- `out-of-range`(영상 길이를 넘는 링크)가 나오면 **자동 정정 대상이 아니다.** 정답을 알 수 없으니
  사람이 그 링크를 지우거나 다시 찾아야 한다.
- `label-mismatch` = 링크(`?t=`)가 **자막 대조로 맞다고 확인됐는데** 보이는 글자(MM:SS)만 다른 경우.
  이때만 라벨을 고친다 — 링크가 정답이라는 근거가 있기 때문이다.
  ⚠️ **확인되지 않은 레인(의역 등)에서는 고치지 않는다.** 링크가 오타이고 라벨이 옳았을 수도 있어서,
  라벨을 링크에 맞추면 **맞는 정보를 지우는 것**이 된다. 그런 건 `label_discrepancy_secs` 로
  기록만 하고 사람에게 넘긴다(2026-08-18 실사고 — 12건을 자동으로 고쳤다가 되돌렸다).
  자릿수 표기 차이(`0:42` vs `00:42`)나 1~2초 반올림은 결함이 아니라서 잡지 않는다(허용오차 적용).
- `unverified-multi-t` = URL 에 `t=` 가 둘 이상. **건드리지 않는다** — 브라우저는 마지막 것을 쓰는데
  어느 쪽이 의도인지 알 수 없다.
- **종료코드로 판정한다** — `0`=정상 · `1`=사용법·대상 경로 오류 · `2`=대상을 못 읽었거나 계약 위반.
  ⚠️ `2` 를 "고칠 게 없었다"로 읽지 말 것. **안 본 것과 통과한 것은 다르다.**
  `2` 가 나오면 타임스탬프를 그대로 두되 완료 보고에 `타임스탬프 미검증` 을 적는다 — 침묵 금지.

재현(도구 자체 회귀): `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/yt-timestamp-verify.test.sh` → PASS 99 / FAIL 0

---

## §Step 4.9 — HTML 대시보드 생성

> 대시보드를 **만들 때** Read 한다.
> (2026-08-28 이동 — 생성 절차·템플릿 경로 원문 그대로.)


analysis md(+ comparison + apply-plan, 존재 시)를 단일 HTML 대시보드로 변환한다.

```bash
ANALYSIS="01-research/videos/analyses/{date}-{video_id}-{slug}-analysis.md"
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/report_to_html.py \
  "${ANALYSIS%-analysis.md}-dashboard.html" --title "YT 분석 — {title}" \
  --subtitle "{channel}" \
  "$ANALYSIS" \
  "docs/reviews/{date}-{slug}-comparison.md" \
  "docs/planning/active/plans/{date}-{slug}-apply-plan.md"
```

- 존재하지 않는 입력(비기술 영상의 comparison/apply-plan)은 변환기가 자동 skip.
- 산출물: `{analysis 경로}-dashboard.html` (md 원본 유지).

**산출물 사후 정정 시**: .md 수정 후 반드시 위 `report_to_html.py` 명령으로 HTML 재생성할 것.
md만 고치면 `dashboard.html` 이 silent stale 상태가 됨(false fact 잔존).
stale 여부 확인: `python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/yt-analyzer/yt-sync-check.py {date} {video_id}` (exit 1 = stale, exit 0 = OK).
