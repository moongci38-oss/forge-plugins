---
name: daily-system-review
description: >
  매일 실행하는 AI 시스템 경량 스캔. 6-Tier 소스에서 전일 AI/Agentic 동향을 수집하되,
  Critical/Breaking/Deprecated/보안만 상세 분석한다. 심층 분석은 weekly-research에서 수행.
argument-hint: "[YYYY-MM-DD]"
disable-model-invocation: true
context: fork
agent: general-purpose
allowed-tools: Agent, Bash, WebSearch, WebFetch, Write, Read, Glob, Grep, mcp__exa__web_search_exa, mcp__tavily__tavily_search, mcp__brave-search__brave_web_search
model: sonnet
---

## Dynamic Context (자동 주입)

Current date: !date +%Y-%m-%d
Recent commits: !git log --oneline -5

**역할**: 당신은 6-Tier 소스에서 AI/Agentic 동향을 매일 경량 스캔하고 핵심 변동만 분석하는 AI 동향 모니터링 전문가입니다.
**컨텍스트**: 매일 자동 실행되거나 `/daily-system-review` 호출 시 실행됩니다.
<!-- 2026-08-25 정정(Human 지시): claude.ai Artifact 발행을 **폐지**하고 발행 대상을
     https://forge-reports.pages.dev 하나로 단일화했다. 이유는 Artifact URL 이 **로그인 계정에
     묶이기** 때문이다 — 계정이 바뀌면 갱신도 공유도 못 한다(DHS 에서 그렇게 죽은 URL 이 4개 이상).
     구판이 말하던 "Artifact XML" 은 애초에 claude.ai 아티팩트가 **아니라** stdout 표시용 태그였고
     공유 URL 을 만들지 않았다 — 이름만 같아서 "이미 발행됐다" 는 오독을 낳았으므로 함께 걷어낸다.
     ⚠️ 파일 저장은 그대로 정본이다. 사이트 발행기가 저장된 파일을 훑어 올린다. -->
**출력 형식**: §산출물대로 **파일 저장이 정본**입니다. 저장만 하면 **발행은 자동**입니다 —
`report-site-publish.sh auto` 가 매시 :25 cron 으로 돌며 새 리포트를 사이트에 올리고
텔레그램으로 링크를 보냅니다. **이 스킬이 발행을 직접 하지 않습니다.**

- 지금 당장 올리려면: `/forge-publish-report`
- 발행 URL: `https://forge-reports.pages.dev/<kind>/<slug>/`
- ⚠️ Artifact 도구를 호출하지 마십시오(폐지됨).

저장 경로(정본): `01-research/daily/{date}/`(`ai-system-analysis.md` 등)
— Wave 0 완결성 게이트가 저장된 `ai-system-analysis.md` 존재를 전제로 WARN 을 판정합니다.

# AI 시스템 일일 분석 파이프라인

> 전일 AI/Agentic 분야 전체 데이터를 6-Tier로 총망라 수집하여, 우리 시스템과 비교 분석한다.

## ⛔ 우리 하네스 상태를 쓸 때 (CRITICAL — 2026-08-14 실사고)

**"우리 시스템은 지금 이렇다"고 쓰려면 `harness_probe()` 를 호출하고 그 출력을 인용한다.**

쉽게 말하면: **없는 폴더를 뒤져놓고 "양말이 없네"라고 말하지 않는다.**

- 이 스킬은 **Managed Agent(클라우드)** 로도 실행된다. 그때 우리 머신에 대해 쓸 수 있는 도구는
  `forge-outputs` 안 파일읽기 + 허용 스크립트 몇 개 + `harness_probe()` 뿐이다.
  **임의 셸 명령·`${FORGE_ROOT:-$HOME/forge}` 밖 파일읽기·프로세스 조회는 존재하지 않는다.**
- 따라서 **실행하지 않은 명령을 근거로 적지 않는다.** `grep ... (결과: 없음)` 처럼
  명령과 결과를 지어내는 것은 리포트 전체의 신뢰를 무너뜨린다.
- `harness_probe()` 가 답하지 못하는 항목은 **`측정 불가(도구 없음)`** 로 적는다.
  "없음"·"미설정"·"미실행" 으로 단정하지 않는다 — **못 본 것과 없는 것은 다르다.**
- 기존 규범과 동일 축: `dev-workflow-rules.md §부재 주장은 측정 명령 + 관측일 동반 필수`.
  측정 명령을 댈 수 없으면 그 문장은 리포트에 넣지 않는다.

근거: 2026-08-14 — 이 경로로 나온 리포트가 `.env` 에 실재하는 DB 설정 6건을 "없음"으로,
정상 가동 중인 공용 DB(pages 13,546건)를 "미완성"으로 단정했다. 근거로 제시된 셸 명령은
이 환경에서 **실행 자체가 불가능**했다.
폐기조건: `harness_probe()` 가 임의 측정까지 대신하게 되면 이 절의 "측정 불가" 규약을 재검토한다.

## 인자

- `{date}` = `$ARGUMENTS` (분석 기준 날짜 YYYY-MM-DD). **반드시 이 인자 값을 그대로 사용한다.** 위 "Current date"(오늘)는 참고용일 뿐 — 리포트 날짜·파일명에 today를 쓰지 말 것. `$ARGUMENTS` 미입력 시에만 전날(`date -d yesterday`) 사용.

## 산출물 (3종)

| # | 문서 | 저장 위치 | 파일명 |
|:-:|------|----------|--------|
| 1 | AI 시스템 분석 리포트 | `01-research/daily/{date}/` | `ai-system-analysis.md` |
| 3 | HTML 대시보드 | `01-research/daily/{date}/` | `dashboard.html` (Wave 2.7) |
| 4 | 관심종목 브리핑 | `01-research/daily/{date}/` | `stock-brief.md` (daily 경량, watchlist 없으면 생략) |

> **canonical 경로 = `01-research/daily/{date}/`** (daily-analyze 프로덕션 경로와 동일, weekly와 동형). `docs/reviews/`·`docs/planning/active/plans/`는 **deprecated** — 기존 레거시 3파일(2026-03-09·05-21·07-15)은 보존하되 신규 생성 금지.

## 데이터 수집 소스 (6-Tier)

Tier 1(AI 기업 공식) / Tier 2(GitHub 생태계) / Tier 3(개발자 커뮤니티) / Tier 4(YouTube) / Tier 5(학술) / Tier 6(산업·미디어, 주식 워치리스트 포함)로 구성.

> 각 Tier 소스 목록·URL·수집 대상 전체: `reference/source-tiers.md` Read. Wave 1 Teammate A~D가 담당 Tier를 수집할 때 참조.

## 실행 흐름

**완결성 게이트 (P3-22, WARN·emit-only)**: 착수 전 `01-research/daily/` 를 훑어
**raw-data.json 은 있는데 분석 산출물(ai-system-analysis.md)이 없는 날짜**를 찾아 WARN 1줄로 알린다.
수집만 되고 분석이 끊긴 날은 조용히 사라져 다음 날 리포트가 그 공백 위에 쌓인다.
판정 명령 예: `for d in 01-research/daily/*/; do [ -f "$d/raw-data.json" ] && [ ! -f "$d/ai-system-analysis.md" ] && echo "WARN 미분석: $d"; done`
**진행을 막지 않는다** — 알리기만 하고 그날 작업은 계속한다(emit-only).

### Wave 0 (raw-data.json 존재 확인 — 최우선)

```
RAW_JSON="01-research/daily/{date}/raw-data.json"
```

`Glob(RAW_JSON)` 으로 파일 존재 여부 확인:

- **존재 → 수집 스킵**: `/daily-analyze {date}` 흐름으로 전환한다.
  Wave 1 수집 Teammate(A/B/C/D) 스폰을 건너뛰고,
  raw-data.json + Claude 검색 보강 → `daily-system-analyst` 에이전트 스폰 순서로 진행한다.
  (상세: `.claude/skills/daily-analyze/SKILL.md` 참조)

  **⚠️ 재분석 경로에서도 주식·학습노트는 반드시 실행한다** (아래 Teammate F·Wave 2.6은 Wave 1 수집과
  무관 — 주식 뉴스는 일간 최신이고 학습노트는 완성 리포트만 필요하다). 구체적으로:
  - `daily-system-analyst` 스폰과 **병렬로** `stock-research-analyst`(agentType, `mode: daily`)를 스폰해
    `01-research/daily/{date}/stock-brief.md` 생성(워치리스트 없으면 skip, fail-open).
  - **run.sh가 Step 1 collector로 raw-data.json을 먼저 만들므로 cron의 정상 경로는 항상 이 재분석 분기다.**
    따라서 이 두 스폰이 없으면 주식·학습노트는 프로덕션에서 영영 생성되지 않는다.

- **미존재 → 전체 파이프라인 실행**: 아래 Wave 1(Teammate F 포함)부터 정상 진행한다.

---

### Workflow 분기 (Wave 1 전 — 계획서 P0-3)

**Workflow 실행 (권장)** — parallel() 5 Teammate + cross-verify 자동:
```js
Workflow({ script: Bash("cat $HOME/.claude/skills/daily-system-review/workflow.js") })
```

**Agent Teams fallback** (`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 또는 Workflow 실패 시): 아래 Wave 1~3 직접 실행.

---

### Wave 1 (병렬 — 5개 동시 스폰)

**Teammate A (Sonnet): AI 공식 소스 + GitHub 생태계**
- Tier 1 전체 (13개 공식 소스) — WebFetch로 직접 확인
- Tier 2 전체 (GitHub 릴리즈, 트렌딩)
- 전날 날짜 기준 신규 콘텐츠만 필터
- **웹 검색 활용**(1순위 `tavily_search` · 실패 시 `brave_web_search`): `tavily_search`(또는 fallback `brave_web_search`)로 공식 소스 도메인 필터링 검색 (예: `site:anthropic.com`, `site:openai.com`). WebFetch 접근 실패 시 Brave Search를 fallback으로 사용하여 최신 발표 감지
- 출력: 구조화된 JSON 요약 → Lead에게 반환

**Teammate B (Haiku): 개발자 커뮤니티 + 미디어**
- Tier 3 전체 (HN, Reddit, Twitter, Discord)
- Tier 6 전체 (TechCrunch, VentureBeat, Product Hunt)
- WebSearch 날짜 필터: 전날~오늘
- **웹 검색 활용**(1순위 `tavily_search` · 실패 시 `brave_web_search`): `tavily_search`(또는 fallback `brave_web_search`)로 커뮤니티/미디어 검색 (HN, Reddit, TechCrunch 등). WebSearch 실패 시 Brave Search를 fallback으로 사용
- 출력: 구조화된 JSON 요약 → Lead에게 반환

**Teammate C (Haiku): YouTube 영상 탐색**
- Tier 4 전체
- WebSearch: 채널별 최신 업로드 + 키워드 검색
- **웹 검색 활용**(1순위 `tavily_search` · 실패 시 `brave_web_search`): `tavily_search`(또는 fallback `brave_web_search`)로 채널별 최신 업로드 검색. 예: `site:youtube.com "Fireship" AI 2026`
- 영상 제목, URL, 예상 내용 요약, 조회수/반응
- 심층 분석 필요 영상은 "추천 시청" 목록으로 분리
- 출력: 영상 목록 + 요약 → Lead에게 반환

**Teammate D (Haiku): 학술 논문 탐색**
- Tier 5 전체 — academic-researcher 에이전트 타입 활용
- arXiv 전날 신규 제출 (cs.AI, cs.CL, cs.SE, cs.MA)
- Papers With Code 트렌딩
- **웹 검색 활용**(1순위 `tavily_search` · 실패 시 `brave_web_search`): `tavily_search`(또는 fallback `brave_web_search`)로 arXiv 최신 논문 검색. 예: `site:arxiv.org cs.AI 2026` + `site:paperswithcode.com trending`
- 실무 적용 가능성 높은 논문 Top 5 선별
- 출력: 논문 목록 + 핵심 요약 → Lead에게 반환

**Teammate E (Sonnet): 우리 시스템 현황 스냅샷**

> **AD-117 self-correction 의무 (L-38)**: 시스템 상태 claim 작성 시 grep/find 실측 결과 인용 필수.
> 추측 claim 금지. 실재 확인 패턴:
> - hook 존재 → `ls $HOME/.claude/hooks/ | grep {name}` 실행 결과 인용
> - skill 활성화 → `ls $HOME/.claude/skills/{name}/SKILL.md` 존재 확인
> - settings.json 배선 → `grep {hook-name} $HOME/.claude/settings.json` 결과 인용
> - rule 변경 → `grep {pattern} ${FORGE_ROOT:-$HOME/forge}/.claude/rules/` 실측 결과 인용
> - **handover snapshot 수치** → 직전 handover 인용 X = 실측 (`find ... -name "eval_cases.jsonl" | wc -l` 등) 의무
> 실측 없는 claim = `⚠️ [미확인]` 표기 의무
>
> **L-20260530T053939 학습 정합**: handover의 audit 수치는 시간 의존적 = snapshot 인용 신뢰 X. 세션 시작 시 find 실측 재확인 의무.

인프라 레이어:
- Read: `$HOME/.claude/forge/rules/`, `$HOME/.claude/rules/`
- Read: `.claude/skills/`, `.claude/agents/`, `.claude/rules/`
- Read: 최근 improvement plan (있으면)

**Forge 파이프라인 현황 (필수):**
- Read: `forge-workspace.json` → 활성 프로젝트 목록 + folderMap 경로 확인
- 각 프로젝트의 `gate-log.md` Read → 현재 Gate 위치 (S1/S2/S3/S4) 확인
- Read: `02-product/todo.md` (있으면) → Forge 전체 프로젝트 진행 현황

**Forge Dev 파이프라인 현황 (필수):**
- Glob: `**/.claude/state/sessions/*.json` → 활성/미완료 세션 목록
- Glob: `docs/walkthroughs/` → 최근 작성된 walkthrough (완료 Spec 파악)
- Read: 각 프로젝트의 `.specify/config.json` (있으면) → autoMerge, 프로젝트 설정

출력: Forge 게이트 현황 + Forge Dev 세션 현황 + 인프라 현황 JSON → Lead에게 반환
> Teammate E의 수집 결과는 Lead의 **GTC-3 (핵심 커버리지)** 검증 입력으로 사용된다. (`daily-system-analyst.md` Step 3.5 참조)

**Teammate F (model: sonnet, agentType: `stock-research-analyst`): 관심종목 리서치 (daily=경량)**

- Wave 1에서 A~E와 **함께 병렬 스폰**한다. 스폰 프롬프트에 `mode: daily`를 전달.
- `stock-research-analyst`가 `${FORGE_ROOT:-$HOME/forge}/.claude/config/stock-watchlist.json`(절대경로 — 상대경로는 cwd 에 따라 조용히 skip 된다)를 read해 종목별 1~2줄 경량 브리핑(최근 24~48h 헤드라인)을 웹검색으로 생성한다. 워치리스트 없으면 **탐색한 절대경로를 병기한** skip 사유만 반환(fail-open).
- 반환 텍스트를 `01-research/daily/{date}/stock-brief.md`로 저장(skip이면 파일 생성 생략).
- 투자자문 아님 배너·출처+일자·상충 항목 기록은 에이전트 자체 가드레일(`agents/stock-research-analyst.md` 참조).
- **fail-open**: 실패/빈결과여도 A~E 종합과 나머지 산출에 영향 없음.

### Wave 2 (Lead Opus 종합 — A~E 결과 의존)

Lead가 5개 Teammate 결과를 종합하여 2개 문서 직접 작성:

- **산출물 1**: AI 시스템 분석 리포트 (`01-research/daily/{date}/ai-system-analysis.md`) — Executive Summary, 업계 변화(6개 하위), 우리 시스템 현황(WARN 다이제스트 포함), 1:1 비교 분석, 갭 분석, 추천 목록, 학습노트, 출처.
  - **ACHCE 축 분류 필수**: 각 갭 항목을 A(Agentic)/C(Context)/H(Harness)/C(Cost)/E(Human-AI Escalation) 5축 중 하나로 분류한다.
> ⚠️ **적용 계획서(`system-improvement-plan.md`)는 2026-09-03 폐지**(Human 지시).
> 분석에서 나온 갭은 `ai-system-analysis.md` 본문에 사실로만 적고, 조치는 사람이 판단한다.
> 폐지 근거: 계획서가 쌓이기만 하고 종결되지 않았다 — `docs/planning/active/` 327건 · 종결률 8.3%.
  - **규칙**: `verify_cmd` 없이 또는 `verify_out`이 빈 채로 제안을 생성하지 않는다. 실측 없는 제안은 오탐이다.

> 정확한 마크다운 구조(섹션 헤딩·표 스켈레톤): `reference/wave2-templates.md` Read 후 그대로 따를 것.

이전 날짜의 계획서가 있으면 미처리 액션을 이월한다.

- **`carry_count >= 2`**: 재게시 전 `${FORGE_ROOT:-$HOME/forge}/shared/scripts/dsr-verify-run.sh "<verify_cmd>"`로 verify_cmd를 재실행한다. 결과가 바뀌었으면(문제 해소) **자동 종결**하고 "해소됨"으로 기록한다(재게시하지 않음).
- **`carry_count >= 3`**: 삭제·추적종료 금지. `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/human-queue.md`에 append + `[STOP]` 표기 후 이 계획서에서는 제외한다.
- **`owner: human`** 항목도 동일하게 `human-queue.md`로 라우팅한다(AI가 처리할 수 없는 항목을 P0로 반복 재게시하지 않는다).

---

> ⚠️ **Wave 2.4(미적용 백로그) 는 2026-09-06 폐지**(Human 지시). `apply-plan-backlog.py` 를
> 호출하지 않고, `backlog-all-open.md` 도 만들지 않으며, 리포트에 `## 미적용 백로그` 절을
> 붙이지 않는다.
>
> 왜: 이 절은 **적용계획서 더미를 읽어** 미반영 P0/P1/P2 를 세던 것이다. 그런데 계획서 생산
> 자체가 2026-09-03 에 폐지됐다(위 §산출물 주석) — **더 안 만드는 서류의 잔량을 매일 세는**
> 절만 남은 셈이었다. 쉽게 말하면 **폐업한 가게의 재고를 매일 방송하고 있었다.**
>
> 실측(2026-09-06 폐지 시점): 계획서 182건 · 미적용 **P0 52 / P1 92 / P2 149 = 293건**.
> 이 목록은 사람이 닫지 않으면 줄지 않아(폐지 후 2026-09-06 점검까지 신규 생성 0건 —
> 미래를 단정하는 말이 아니라 그 구간의 관측치다),
> **매일 같은 293건이 반복 게시**돼 리포트 말미가 늑대소년이 돼 있었다.
>
> ⚠️ **함께 안 보이게 되는 것 3가지**(cr-final 2026-09-06 지적 — 293건만 적었던 것을 보완):
>   ①`판정불가`(체크박스 0개인 계획서) ②`미측정 섹션` ③**계획서 생산이 실수로 재개되는 것**.
>   ③이 특히 아프다 — 이 절이 그 재개를 **간접적으로 감지**하던 유일한 창구였다.
>   지금은 총량이 늘어도 아무도 모른다. 저소음 카나리(신규 파일이 생기거나 총량이 늘 때만
>   알림)는 **후속 과제**로 남긴다.
>
> ⚠️ **293건이 사라진 것은 아니다 — 안 보일 뿐이다.** 언제든 아래로 확인한다:
> `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/apply-plan-backlog.py" "$(date +%F)" --all-open --summary`
> 스크립트·검증기(`apply-plan-backlog.py` · `verify-apply-plan-backlog.sh`)는 **남겨 둔다**
> — 나중에 서랍을 정리할 때 쓸 도구다.
>
> ⚠️ **세션 시작 배너는 별개 레인이다.** `/forge-start` 의 `session-recall.sh` 가 여전히
> `ITEMS_OPEN`·`P0_OPEN` 을 센다(daily 리포트와 다른 경로). 그쪽도 끄려면 따로 정해야 한다.
>
> **복구 절차**(적용계획서 레인을 다시 쓰기로 한 경우): 이 블록을 지우고 **PR #501 의
> 삭제분**을 되돌린다 — `git show <PR#501 머지커밋> -- <이 파일>` 로 원문(Wave 2.4 전체
> 115줄)을 꺼내 붙이면 된다. 스크립트(`apply-plan-backlog.py`)와 검증기는 지우지 않았으므로
> 그대로 동작한다. ⚠️ '조건'만 적고 '방법'을 안 적으면 되살릴 때 다시 설계하게 된다.

### Wave 2.5~2.55 (독립 검증 + 적대적 검수 — Wave 2 완료 후, Wave 2.6 이전)

두 겹으로 검증하는데 **성격이 다르다.**

- **Wave 2.5(차단)** — Lead 의 컨텍스트를 공유하지 않는 별도 Evaluator 가 채점한다
  (생성자 ≠ 평가자 — 자기평가 편향 방지). PASS 기준 70점, FAIL 이면 보완 후 재실행 1회,
  **2회 연속 FAIL 시 [STOP] Human 에스컬레이션.** 여기를 통과해야 Wave 2.6 으로 넘어간다.
- **Wave 2.55(비차단, WARN-first)** — **분석 리포트**(`ai-system-analysis.md`)에 cr-triple 3레그로 적대적 검수를 건다
  > ⚠️ 2026-09-03 변경: 종전엔 계획서만 검수했고 계획서가 없으면 건너뛰었다 — 계획서를
  > 폐지하면 검수가 **영영 안 돈다.** `content_integrity=lost`·`INVALID_INPUT` 은 판정이 아니라
  > **검수 미수행**이니 대상을 쪼개 재호출한다(로더 ~15KB 상한, 2026-09-02 실측).
  (2026-08-27 Human 지시). **WARN/FAIL 이어도 진행한다** — 지적을 **분석 리포트 말미** `## 검수 지적`
  에 적고 넘어가며 [STOP] 을 걸지 않는다. cron 이 무인으로 도는 파이프라인이라 사람 없는
  자리에서 멈추면 그날 리포트가 통째로 안 나오기 때문이다. 쉽게 말하면 **문을 잠그는 대신
  쪽지를 붙인다.**

> **이 두 Wave 를 돌릴 때 Read**: `reference/wave25-adversarial.md`
> — Evaluator 프롬프트 전문·항목별 배점·개선 지시 형식·cr-triple 호출 규약이 거기 있다.

> ⚠️ **학습노트 생성은 2026-09-03 폐지**(Human 지시) — `concept-notes-writer` 를 스폰하지 않는다.

### Wave 2.7 (HTML 대시보드 생성 — Evaluator PASS 후)

2개 md 리포트를 단일 HTML 대시보드로 변환한다 (조사 리포트 공통 — 시각적 가독성).

```bash
DATE={date}
BASE="${FORGE_OUTPUTS:-$HOME/forge-outputs}"
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/report_to_html.py \
  "${BASE}/01-research/daily/${DATE}/dashboard.html" --title "Daily System Review — ${DATE}" \
  --subtitle "AI 시스템 분석 + 적용 계획" \
  "${BASE}/01-research/daily/${DATE}/ai-system-analysis.md" \
```

- 산출물: `01-research/daily/{date}/dashboard.html` (md 원본 유지 — HTML은 추가 뷰).
- 라이트테마 + TOC + 카드 섹션. self-contained (인라인 CSS).

---

### Wave 2.9 (최종 완료 게이트 — 필수, Notion "완료" 기록 이전)

**순서 원칙**: 파일검증 → (성공 시에만) Notion 등록/완료. Notion에 "완료"를 먼저 찍고 그 뒤 파일을 Read하는 순서는 저장 실패를 은폐한다 — 반드시 아래 게이트가 Wave 3보다 먼저 실행된다.

1. 실행: `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/verify-outputs.sh "${BASE}/01-research/daily/${DATE}/ai-system-analysis.md" "${BASE}/01-research/daily/${DATE}/dashboard.html"`
2. 스크립트 출력 표를 완료 보고에 그대로 사용. 표 밖 임의 "완료" 서술 금지.
3. exit 2(MISSING/0바이트)면 Notion "완료" 기록 금지 — 누락 산출물을 재생성한 뒤 재검증(exit 0) 통과 후에만 Wave 3으로 진행한다.

### Wave 3 (Notion 자동 등록 — Wave 2.9 검증 통과 후)

2개 문서 작성 완료 + Evaluator PASS 확인 후, Notion "Daily System Review" DB에 페이지를 자동 생성한다.

**Notion DB 정보:**
- Data Source ID: `43829f7b-8d3f-47f1-90a1-84f40d39239e`
- DB URL: `https://www.notion.so/${NOTION_DB_ID}`

**`mcp__notion__notion-create-pages` 호출**: 위 Data Source ID로 페이지 생성. 정확한 JSON 페이로드 구조(properties 필드명·속성 값 추출 규칙): `reference/notion-templates.md` Read 후 그대로 따를 것.

**실패 처리:**
- Notion MCP 미연결 시 경고 출력 후 스킵 (리포트 파일은 이미 저장됨)
- 페이지 생성 실패 시 에러 로그 출력 후 스킵 (파이프라인 중단 안 함)

### Wave 3.5 (index.json 갱신 — daily-analyze Step 5.5와 동일 절차)

`01-research/daily/{date}/index.json`을 원자적으로 기록한다. **Write 직접 수정 금지**:

```bash
echo '{"date":"{date}","title":"{date} AI 시스템 분석","critical_gaps":<N>,"high_gaps":<N>,"medium_gaps":<N>,"p0_actions":<N>,"p1_actions":<N>,"files":{"ai_system_analysis":"01-research/daily/{date}/ai-system-analysis.md","stock_brief":"01-research/daily/{date}/stock-brief.md"},"notion_upload":"{Wave 3 결과}"}' \
  | python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/daily-review/append_index_record.py
```

값이 없는 파일(skip)은 `files`에서 키 자체를 생략(null 채움 금지). **fail-open**: 실패해도 이미 저장된 산출물엔 영향 없음 — 로그만 남기고 Wave 4로 진행.

### Wave 3.6 (wiki-sync 자동 동기화 — Wave 3.5 완료 후, Wave 4 이전)

Raw 레이어(`01-research/daily/{date}/`)에 방금 저장된 산출물을 Wiki 레이어로 자동 반영한다. `wiki-sync` 스킬 자체 로직(스캔·매칭·신뢰도 평가)은 그대로 재사용 — 이 Wave는 호출자일 뿐이다.

```bash
# kill-switch — off면 완전히 스킵
if [ "${FORGE_WIKI_AUTOSYNC:-on}" = "off" ]; then
  echo "[wiki-sync] FORGE_WIKI_AUTOSYNC=off — 스킵"
fi
```

kill-switch가 `off`가 아니면 아래 Skill 도구를 호출한다 (`--auto` = 신뢰도 HIGH 항목만 [STOP] 없이 처리, MEDIUM/LOW는 `_meta/pending-review.md`로):

```
Skill(skill="wiki-sync", args="--auto")
```

**결과 보고 (필수)**: 처리 건수를 항상 출력한다 — 0건이어도 명시(침묵 금지):

```
[wiki-sync] N건 wiki화 (신규 M / 업데이트 K, pending-review P건)
```

**fail-open**: Skill 호출 실패·에러 시 → `[wiki-sync] 실패: {사유} — daily 파이프라인은 계속 진행` 1줄 WARN만 남기고 Wave 4로 진행. daily 파이프라인 전체 중단 금지.

### Wave 4 (대화창 전체 출력 — Wave 3 완료 후)

분석 리포트를 Read하여 전체 내용을 대화창에 출력한다.

```
Read("01-research/daily/{date}/ai-system-analysis.md") → 전체 내용 출력
```

출력 형식:
```
===== AI 시스템 분석 리포트 ({date}) =====
{ai-system-analysis.md 전체 내용}
```

> ⚠️ 2026-09-03: 계획서 출력은 폐지됐다(그 산출물을 더는 만들지 않는다).

## 신뢰도 등급

모든 데이터에 신뢰도를 표기한다:
- `[신뢰도: High]` = 공식 소스 (Tier 1) 또는 다중 소스 교차 확인
- `[신뢰도: Medium]` = 단일 신뢰 소스 (Tier 2-3) 또는 커뮤니티 합의
- `[신뢰도: Low]` = 단일 비공식 소스, 루머, AI 추정

### 직접 열람 축 + spot-check 의무 (2026-08-19 신설)

신뢰도가 "소스가 얼마나 믿을 만한가"라면 이 축은 **"내가 직접 봤는가"**다 — 둘은 독립이다(공식 소스라도 워커 보고만 받았으면 직접 열람이 아니다).

- `[실측]` 그 URL 을 직접 열어 확인 / `[스니펫]` 검색 스니펫만(원문 미확인 — `reddit.com` 은 WebFetch 차단 환경에서 기본 여기, 2026-08-19 실측) / `[전언]` 워커·타 문서 보고를 옮김
- **spot-check**: Wave 2 취합 시 **Critical/Breaking 판정을 좌우하는 주장은 표본 3건+ 원출처를 Lead 가 직접 재확인**한다. 특히 **"Deprecated 됐다"·"지원 중단됐다" 같은 부재·중단 주장**은 공식 changelog 를 직접 열어 확인한다 — 알람 스킬에서 오탐 1건은 그 뒤 모든 알람의 신뢰를 깎는다.
- ⛔ **워커의 판정 라벨을 그대로 옮기지 않는다**(라벨은 관측이지 사실이 아니다).
- 근거: `learnings` **L-20260819T081207** + 2026-08-19 idea-hunt 실측 — 워커 라벨·수치 오보고 4건이 전부 spot-check 로만 잡혔고 그중 3건은 cr-triple 3레그도 통과했다.
- ⚠️ **이 스킬에는 `/forge-find-item §제1원칙`(거래 시장 우선·기사 불인정)을 이식하지 않는다** — daily 는 AI 생태계 변화 감지가 목적이라 **뉴스가 정당한 1차 입력**이다. 그 원칙은 *아이템 발굴* 맥락에서만 유효하다(weekly 의 사업 아이템 산출물에는 이식됨). 두 스킬을 같은 규칙으로 덮지 말 것.
- 폐기조건: 2분기 연속 spot-check 적발 0건이면 표본 수 하향을 재검토한다.

## Constraint Drift 감사 (AD-120, 주간)

daily 실행 시 override-rate.log 추세 체크: 5% 초과 → WARN (단, **total ≥ 10 표본 시만** — total < 10 = "표본 부족, 추세 보류"), hook bypass 3회+ → ADR 검토, 면제 weekly 1회+ → enforcement-theater 신호. 상세: `$HOME/.claude/rules-on-demand/constraint-drift-audit.md`

## Redundancy 스캔 (P2-1, 주간)

매주 1회(weekly 실행 시) 3개 체크(신규 deprecated/orphan 스킬 감지 / Hook theater 신규 감지 / 규칙 파일 수 추세) 수행 → `01-research/daily/{date}/redundancy-scan.json`에 저장. 이상 감지 시 **분석 리포트**(`ai-system-analysis.md`)에 "Redundancy 섹션" 추가.
⚠️ 2026-09-06 정정: 종전엔 "적용계획서에 추가"였는데 그 계획서는 2026-09-03 에 폐지됐다 — **없는 문서에 쓰라는 지시라 그 정보가 갈 곳이 없었다**(조용한 유실). 붙일 곳을 분석문으로 옮긴다.

> 실제 명령어(find/grep/ls 3종): `reference/redundancy-scan.md` Read.

## 스킬 description 예산 감사 (2026-08-27 신설 — Redundancy 스캔의 토큰 축)

매 실행 시 1줄 돌린다. description 은 스킬 본문과 달리 **매 세션 전량 주입**돼서, 하나가 길어지면 모든 세션이 그 비용을 나눠 문다(간판을 크게 달아 옆 가게를 가리는 격).

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/skill-desc-budget.sh"
```

- 초과가 있으면 `<이름>\t<자수>` 목록 + `OVER=n/m` 이 나온다 → **분석 리포트**의 Redundancy 섹션에 그대로 싣는다(2026-09-06 정정 — 위 각주 참조).
- 0건이면 `OK: … 0건` 1줄. 대상 폴더·python3 가 없으면 `SKIP:` 을 낸다 — **SKIP 을 0건으로 적지 않는다.**
- 종료코드는 항상 0(감사 도구, AD-168 WARN-first) — 이 스텝이 daily 를 막지 않는다.

## 지난 달 사용 0회 스킬 (2026-08-27 신설 — Redundancy 스캔의 사용량 축)

**무엇을 내나**: 설치된 스킬 중 **지난 30일 동안 한 번도 안 불린 것**의 이름 목록. 위 Redundancy 스캔이 "선언이 낡았나"(deprecated·orphan)를 본다면, 이 스텝은 **"선언은 멀쩡한데 아무도 안 쓰나"**를 본다 — 서랍은 잘 정리돼 있는데 그 안의 물건을 1년째 안 꺼낸 상태다.

**신호원(하나로 고정)**: `$HOME/.claude/projects/**/*.jsonl` 세션 로그의 `"skill":"<이름>"` 호출 기록.
(왜 이것인가: 실측상 30일 내 12,718개 파일이 존재하고 스킬명이 그대로 찍힌다. `learnings-access.log` 는 **이 머신에 없어서** 신호원으로 쓰지 않는다 — 2026-08-27 확인.)

```bash
# 신호원 부재 분기 — 아래 출력 규약의 '측정 불가'를 코드로 구현한다(산문만으로는 안 지켜진다).
if [ ! -d $HOME/.claude/projects ] || ! find $HOME/.claude/projects -name '*.jsonl' -mtime -30 -print -quit 2>/dev/null | grep -q .; then
  echo '지난 달 사용 0회: 측정 불가 — 신호원($HOME/.claude/projects/**/*.jsonl) 없음'
else
  # 사용된 스킬(30일) — 결정론. 문자클래스에 대문자·점·슬래시 포함(경로 스코프 스킬명).
  find $HOME/.claude/projects -name '*.jsonl' -mtime -30 -print0 \
    | xargs -0 grep -hoa '"skill":"[A-Za-z0-9:/._-]*"' 2>/dev/null \
    | sed 's/.*:"//;s/"//' | sort -u > /tmp/dsr-skills-used.txt
  # 설치된 스킬 (comm 은 정렬 입력 필수 — 명시 sort)
  ls -1 "${FORGE_ROOT:-$HOME/forge}/.claude/skills" | sort > /tmp/dsr-skills-all.txt
  # 0회 = 차집합
  comm -23 /tmp/dsr-skills-all.txt /tmp/dsr-skills-used.txt
fi
```

**출력 규약 (침묵 금지)**
- 0회 스킬이 있으면 → `지난 달 사용 0회: <이름1>, <이름2>, …` (N개)
- 하나도 없으면 → `지난 달 사용 0회: 0건`
- **신호원 자체가 없으면**(`$HOME/.claude/projects` 부재·로그 0개) → `지난 달 사용 0회: 측정 불가 — 신호원($HOME/.claude/projects/**/*.jsonl) 없음`
  ⚠️ **"측정 불가"를 "0건"으로 적지 않는다.** 못 센 것과 세어 보니 없는 것은 다르다 — 없는 폴더를 뒤져놓고 "양말이 없네"라고 하면 안 된다.

⚠️ **이 측정이 무력화되는 입력**: ①세션 로그 보존기간이 30일 미만이면 오래 안 쓴 스킬이 아니라 **로그가 지워진 스킬**이 잡힌다 ②`Skill` 툴이 아니라 슬래시 커맨드 경로로만 불리는 스킬은 `"skill":` 로 안 찍힐 수 있다 ③0회 = 삭제 근거가 **아니다**(분기 1회짜리 스킬이 있다) ④세션 로그에는 대화 내용도 찍힌다 — 이 문서를 읽거나 편집한 세션의 로그 속 `"skill":"이름"` 리터럴이 실호출로 오집계된다(사용량이 **과대** 방향으로 틀린다 = 0회 목록이 실제보다 짧아진다). 이 목록은 **검토 후보**이지 판결이 아니다.

## Gotchas (흔한 실패 패턴 — 실증만, 증거 링크 의무)

- **`claude -p` 하위 호출의 침묵 실패를 성공으로 오보고** — run.sh Step2가 실패 시그널을 감지 못 해 tg-report가 "완료"를 발신한 사고. 파이프라인 스텝의 exit·출력 검사를 신뢰 기반으로 삼을 것. (증거: `${FORGE_ROOT:-$HOME/forge}` 커밋 `22faf98`·`f0e34cf` 경위)
- **산출물은 canonical 경로(`01-research/daily/{date}/`)에만** — docs/reviews 등으로 산개시키면 index.json·후속 소비가 깨진다. (증거: `${FORGE_ROOT:-$HOME/forge}` 커밋 `aad844a`·`73978b8` 계열 수렴 작업)
- **텔레메트리 표본이 0이면 "미사용"이 아니라 emit 지점 부재부터 의심** — phase-e-entry 50회 반복의 근본원인 미규명 상태로 데이터 축적만 신뢰하지 말 것. (증거: MEMORY §협업보완 프로토콜, P-9 교훈)
