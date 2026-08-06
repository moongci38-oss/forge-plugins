---
name: daily-system-review
description: >
  매일 실행하는 AI 시스템 경량 스캔. 6-Tier 소스에서 전일 AI/Agentic 동향을 수집하되,
  Critical/Breaking/Deprecated/보안만 상세 분석한다. 심층 분석은 weekly-research에서 수행.
argument-hint: "[YYYY-MM-DD]"
disable-model-invocation: true
context: fork
agent: general-purpose
allowed-tools: Agent, Bash, WebSearch, WebFetch, Write, Read, Glob, Grep, mcp__brave-search__brave_web_search
model: sonnet
---

## Dynamic Context (자동 주입)

Current date: !date +%Y-%m-%d
Recent commits: !git log --oneline -5

**역할**: 당신은 6-Tier 소스에서 AI/Agentic 동향을 매일 경량 스캔하고 핵심 변동만 분석하는 AI 동향 모니터링 전문가입니다.
**컨텍스트**: 매일 자동 실행되거나 `/daily-system-review` 호출 시 실행됩니다.
<!-- root-cause(skills-1/S1-07, 2026-08-03 관측): 이 줄이 "Artifact XML로 stdout 출력"만 말해 아래 §산출물(3종/5종, :33-43)의 파일 저장 요구와 충돌했다 — 그 표는 `01-research/daily/{date}/`에 실제 파일명(ai-system-analysis.md 등)을 저장하도록 명시하고, Wave 0 완결성 게이트(:53-57)도 저장된 `ai-system-analysis.md` 존재를 전제로 WARN을 판정한다. "파일 저장=정본, Artifact=파생 발행"으로 단일화. -->
**출력 형식**: §산출물(아래 표)대로 파일 저장이 정본이다. Artifact XML 발행은 저장 후 선택적 파생 출력(stdout 표시용)이며 파일 저장을 대체하지 않는다.
  - `report-formatter.mjs`의 `formatAsArtifact(title, content, 'markdown', id, true)` 사용
  - `stripFirstHeading: true` 옵션으로 첫 # 제목 자동 제거

# AI 시스템 일일 분석 파이프라인

> 전일 AI/Agentic 분야 전체 데이터를 6-Tier로 총망라 수집하여, 우리 시스템과 비교 분석한다.

## 인자

- `{date}` = `$ARGUMENTS` (분석 기준 날짜 YYYY-MM-DD). **반드시 이 인자 값을 그대로 사용한다.** 위 "Current date"(오늘)는 참고용일 뿐 — 리포트 날짜·파일명에 today를 쓰지 말 것. `$ARGUMENTS` 미입력 시에만 전날(`date -d yesterday`) 사용.

## 산출물 (3종)

| # | 문서 | 저장 위치 | 파일명 |
|:-:|------|----------|--------|
| 1 | AI 시스템 분석 리포트 | `01-research/daily/{date}/` | `ai-system-analysis.md` |
| 2 | 적용 계획서 | `01-research/daily/{date}/` | `system-improvement-plan.md` |
| 3 | HTML 대시보드 | `01-research/daily/{date}/` | `dashboard.html` (Wave 2.7) |
| 4 | 관심종목 브리핑 | `01-research/daily/{date}/` | `stock-brief.md` (daily 경량, watchlist 없으면 생략) |
| 5 | 학습노트 | `01-research/daily/{date}/` | `study-notes.md` (개념 후보 0개면 생략) |

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
  - 분석 리포트 완성 후 `concept-notes-writer`(agentType)를 스폰해
    `01-research/daily/{date}/study-notes.md` 생성(개념 0개면 skip, fail-open).
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
- **Brave Search 활용**: `brave_web_search`로 공식 소스 도메인 필터링 검색 (예: `site:anthropic.com`, `site:openai.com`). WebFetch 접근 실패 시 Brave Search를 fallback으로 사용하여 최신 발표 감지
- 출력: 구조화된 JSON 요약 → Lead에게 반환

**Teammate B (Haiku): 개발자 커뮤니티 + 미디어**
- Tier 3 전체 (HN, Reddit, Twitter, Discord)
- Tier 6 전체 (TechCrunch, VentureBeat, Product Hunt)
- WebSearch 날짜 필터: 전날~오늘
- **Brave Search 활용**: `brave_web_search`로 커뮤니티/미디어 검색 (HN, Reddit, TechCrunch 등). WebSearch 실패 시 Brave Search를 fallback으로 사용
- 출력: 구조화된 JSON 요약 → Lead에게 반환

**Teammate C (Haiku): YouTube 영상 탐색**
- Tier 4 전체
- WebSearch: 채널별 최신 업로드 + 키워드 검색
- **Brave Search 활용**: `brave_web_search`로 채널별 최신 업로드 검색. 예: `site:youtube.com "Fireship" AI 2026`
- 영상 제목, URL, 예상 내용 요약, 조회수/반응
- 심층 분석 필요 영상은 "추천 시청" 목록으로 분리
- 출력: 영상 목록 + 요약 → Lead에게 반환

**Teammate D (Haiku): 학술 논문 탐색**
- Tier 5 전체 — academic-researcher 에이전트 타입 활용
- arXiv 전날 신규 제출 (cs.AI, cs.CL, cs.SE, cs.MA)
- Papers With Code 트렌딩
- **Brave Search 활용**: `brave_web_search`로 arXiv 최신 논문 검색. 예: `site:arxiv.org cs.AI 2026` + `site:paperswithcode.com trending`
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
- Read: `docs/planning/active/forge/todo.md` → Spec별 진행 상태 (⬜/🔄/🧪/✅)
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
- **산출물 2**: 적용 계획서 (`01-research/daily/{date}/system-improvement-plan.md`) — P0/P1/P2 액션 아이템. 각 액션 = 액션명·영향범위·예상작업량·의존성·참조소스·`verify_cmd`·`verify_out`·`owner`(ai\|human)·`carry_count`.
  - **규칙**: `verify_cmd` 없이 또는 `verify_out`이 빈 채로 제안을 생성하지 않는다. 실측 없는 제안은 오탐이다.

> 정확한 마크다운 구조(섹션 헤딩·표 스켈레톤): `reference/wave2-templates.md` Read 후 그대로 따를 것.

이전 날짜의 계획서가 있으면 미처리 액션을 이월한다.

- **`carry_count >= 2`**: 재게시 전 `${FORGE_ROOT:-$HOME/forge}/shared/scripts/dsr-verify-run.sh "<verify_cmd>"`로 verify_cmd를 재실행한다. 결과가 바뀌었으면(문제 해소) **자동 종결**하고 "해소됨"으로 기록한다(재게시하지 않음).
- **`carry_count >= 3`**: 삭제·추적종료 금지. `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/human-queue.md`에 append + `[STOP]` 표기 후 이 계획서에서는 제외한다.
- **`owner: human`** 항목도 동일하게 `human-queue.md`로 라우팅한다(AI가 처리할 수 없는 항목을 P0로 반복 재게시하지 않는다).

---

### Wave 2.5 (독립 Evaluator subagent — Wave 2 완료 후, Wave 3 이전)

> **핵심 원칙: Lead의 컨텍스트(의도, 가정)를 공유하지 않는 별도 에이전트가 검증한다.**
> Wave 2 Lead 리포트 완성 직후, Wave 3(Notion 등록) 진행 전에 반드시 실행한다.

```
subagent_type: gemini  # 교차모델 — 동일모델(Claude) 평가는 편향 전파(arXiv 2606.20493 Contagion Networks). 미가용 시 general-purpose로 fail-open 폴백.
```

**입력 파일 (직접 Read)**:
- `01-research/daily/{date}/ai-system-analysis.md`
- `01-research/daily/{date}/system-improvement-plan.md`

**Rubric (100점 만점)**:

| 항목 | 가중치 | 불합격 기준 |
|------|:------:|-----------|
| 6-Tier 커버리지 | 40% | Tier 1~6 중 2개 이상 미참조 시 즉시 FAIL |
| 증거 검증 | 20% | `verify_out`이 비어 있는 제안이 1건이라도 있으면 감점, 3건 이상이면 0점 |
| 인사이트 품질 | 20% | 갭 분석이 단순 나열(불릿만)이고 인과 설명 없으면 0점 |
| 갭 정확도 | 10% | Critical/High/Medium 분류 근거가 없으면 감점 |
| 액션 실현 가능성 | 10% | P0 항목에 담당자·예상 작업량 누락 시 감점 |

**PASS 기준**: 70점 이상.

**FAIL 처리**: Evaluator가 감점 항목별 위치 + 이유 + 개선 방법을 구체적으로 작성하여 Lead에 반환. Lead는 리포트 보완 재작성 후 Evaluator 재실행 (1회 한정). 2회 연속 FAIL 시 [STOP] Human 에스컬레이션.

**출력**: `${FORGE_ROOT:-$HOME/forge}/.claude/state/DSR_EVAL.md`(절대경로 — 상대경로는 cwd에 따라 조용히 다른 곳에 쓰인다. root-cause: 2026-08-03 하네스 위생 조사, 앵커 없는 상대경로가 `shared/.claude/state/`에 산개해 있던 걸 실측)

```markdown
## Daily System Review Evaluator 결과

**총점**: XX/100
**판정**: PASS / FAIL

### 항목별 점수
- 6-Tier 커버리지 (40%): XX점 — [미참조 Tier 목록]
- 증거 검증 (20%): XX점 — [verify_out 비어있는 제안 수]
- 인사이트 품질 (20%): XX점 — [사유]
- 갭 정확도 (10%): XX점 — [사유]
- 액션 실현 가능성 (10%): XX점 — [사유]

### 개선 지시 (FAIL 항목만)
- [섹션 N] [항목]: [위치] → [이유] → [개선 방법]
```

PASS 확인 후 Wave 2.7(HTML 대시보드) → Wave 3(Notion 자동 등록)으로 진행한다.

---

### Wave 2.6 (학습노트 생성 — Evaluator PASS 후, Wave 2.7 이전)

그날 리포트에서 핵심 개념을 뽑아 학습노트를 생성한다.

```
subagent_type: general-purpose (agentType: concept-notes-writer)
```

- 입력(Read): `01-research/daily/{date}/ai-system-analysis.md` + (있으면) `01-research/daily/{date}/stock-brief.md`.
- `concept-notes-writer`가 핵심 개념 1~3개(cap 3, 0개면 skip)를 선별해 `01-research/daily/{date}/study-notes.md`로 생성한다(상단 "🎓 오늘의 학습노트" + 생성일자, 투자 개념이면 투자자문 아님 배너 상속 — `agents/concept-notes-writer.md` 참조).
- 리포트 본문 "## 6. 🎓 학습노트" 섹션에 요약 포함.
- **fail-open** — 실패/개념 0개여도 기존 2종 리포트·대시보드·Notion 등록은 그대로 진행한다.

---

### Wave 2.7 (HTML 대시보드 생성 — Evaluator PASS 후)

2개 md 리포트를 단일 HTML 대시보드로 변환한다 (조사 리포트 공통 — 시각적 가독성).

```bash
DATE={date}
BASE="${FORGE_OUTPUTS:-$HOME/forge-outputs}"
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/report_to_html.py \
  "${BASE}/01-research/daily/${DATE}/dashboard.html" --title "Daily System Review — ${DATE}" \
  --subtitle "AI 시스템 분석 + 적용 계획" \
  "${BASE}/01-research/daily/${DATE}/ai-system-analysis.md" \
  "${BASE}/01-research/daily/${DATE}/system-improvement-plan.md"
```

- 산출물: `01-research/daily/{date}/dashboard.html` (md 원본 유지 — HTML은 추가 뷰).
- 라이트테마 + TOC + 카드 섹션. self-contained (인라인 CSS).

---

### Wave 2.9 (최종 완료 게이트 — 필수, Notion "완료" 기록 이전)

**순서 원칙**: 파일검증 → (성공 시에만) Notion 등록/완료. Notion에 "완료"를 먼저 찍고 그 뒤 파일을 Read하는 순서는 저장 실패를 은폐한다 — 반드시 아래 게이트가 Wave 3보다 먼저 실행된다.

1. 실행: `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/verify-outputs.sh "${BASE}/01-research/daily/${DATE}/ai-system-analysis.md" "${BASE}/01-research/daily/${DATE}/system-improvement-plan.md"`
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
echo '{"date":"{date}","title":"{date} AI 시스템 분석","critical_gaps":<N>,"high_gaps":<N>,"medium_gaps":<N>,"p0_actions":<N>,"p1_actions":<N>,"files":{"ai_system_analysis":"01-research/daily/{date}/ai-system-analysis.md","system_improvement_plan":"01-research/daily/{date}/system-improvement-plan.md","stock_brief":"01-research/daily/{date}/stock-brief.md","study_notes":"01-research/daily/{date}/study-notes.md"},"notion_upload":"{Wave 3 결과}"}' \
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

두 산출물 파일을 Read하여 전체 내용을 대화창에 출력한다.

```
Read("01-research/daily/{date}/ai-system-analysis.md") → 전체 내용 출력
Read("01-research/daily/{date}/system-improvement-plan.md") → 전체 내용 출력
```

출력 형식:
```
===== AI 시스템 분석 리포트 ({date}) =====
{ai-system-analysis.md 전체 내용}

===== 시스템 개선 계획서 ({date}) =====
{system-improvement-plan.md 전체 내용}
```

## 신뢰도 등급

모든 데이터에 신뢰도를 표기한다:
- `[신뢰도: High]` = 공식 소스 (Tier 1) 또는 다중 소스 교차 확인
- `[신뢰도: Medium]` = 단일 신뢰 소스 (Tier 2-3) 또는 커뮤니티 합의
- `[신뢰도: Low]` = 단일 비공식 소스, 루머, AI 추정

## Constraint Drift 감사 (AD-120, 주간)

daily 실행 시 override-rate.log 추세 체크: 5% 초과 → WARN (단, **total ≥ 10 표본 시만** — total < 10 = "표본 부족, 추세 보류"), hook bypass 3회+ → ADR 검토, 면제 weekly 1회+ → enforcement-theater 신호. 상세: `$HOME/.claude/rules-on-demand/constraint-drift-audit.md`

## Redundancy 스캔 (P2-1, 주간)

매주 1회(weekly 실행 시) 3개 체크(신규 deprecated/orphan 스킬 감지 / Hook theater 신규 감지 / 규칙 파일 수 추세) 수행 → `01-research/daily/{date}/redundancy-scan.json`에 저장. 이상 감지 시 적용계획서에 "Redundancy 섹션" 추가.

> 실제 명령어(find/grep/ls 3종): `reference/redundancy-scan.md` Read.

## Gotchas (흔한 실패 패턴 — 실증만, 증거 링크 의무)

- **`claude -p` 하위 호출의 침묵 실패를 성공으로 오보고** — run.sh Step2가 실패 시그널을 감지 못 해 tg-report가 "완료"를 발신한 사고. 파이프라인 스텝의 exit·출력 검사를 신뢰 기반으로 삼을 것. (증거: `${FORGE_ROOT:-$HOME/forge}` 커밋 `22faf98`·`f0e34cf` 경위)
- **산출물은 canonical 경로(`01-research/daily/{date}/`)에만** — docs/reviews 등으로 산개시키면 index.json·후속 소비가 깨진다. (증거: `${FORGE_ROOT:-$HOME/forge}` 커밋 `aad844a`·`73978b8` 계열 수렴 작업)
- **텔레메트리 표본이 0이면 "미사용"이 아니라 emit 지점 부재부터 의심** — phase-e-entry 50회 반복의 근본원인 미규명 상태로 데이터 축적만 신뢰하지 말 것. (증거: MEMORY §협업보완 프로토콜, P-9 교훈)
