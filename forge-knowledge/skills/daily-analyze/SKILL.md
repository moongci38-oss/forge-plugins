---
name: daily-analyze
description: >
  Daily Review JSON → 심층 AI 분석. raw-data.json이 존재할 때
  수집 단계를 스킵하고 분석만 실행하는 재분석 진입점.
argument-hint: "<YYYY-MM-DD>"
context: fork
model: sonnet
---

**역할**: 당신은 Daily Review JSON 데이터를 심층 분석하는 AI 동향 분석 전문가입니다.
**컨텍스트**: `raw-data.json`이 존재할 때 수집 단계를 스킵하고 재분석이 필요할 때 호출됩니다.
**출력**: AI/Agentic 동향 심층 분석 보고서 2종(`daily-brief.md`, `raw-data.json`)을 `forge-outputs/shared/01-research/daily/`에 저장합니다.

# Daily System Review — 재분석 (JSON → 분석)

> raw-data.json이 이미 존재하는 날짜에 대해 수집 스킵 후 분석만 재실행한다.
> 분석 실패/중단 후 재시작, 또는 다른 관점으로 재분석할 때 사용.

## 인자

- `$ARGUMENTS` = 재분석 기준 날짜 (YYYY-MM-DD). 미입력 시 전날 날짜 사용.

## Step 1: raw-data.json 로드

```
01-research/daily/{date}/raw-data.json
```

파일 읽기 후:
- `stats` 섹션에서 수집 현황 확인 (Tier별 수집 건수)
- `items` 배열에서 수집된 정형 데이터 확인
- `claude_search_needed` 배열에서 Claude가 추가로 검색해야 할 카테고리 확인

파일이 없으면: **[STOP]** — `/daily-system-review {date}` 를 먼저 실행해야 한다.

## Step 2: Claude 검색 보강

raw-data.json의 `claude_search_needed` 항목에 대해 검색 수행:

**Tier 3 커뮤니티 (WebSearch):**
- Hacker News AI 탑 스토리: `site:news.ycombinator.com AI after:{date}`
- Reddit r/MachineLearning, r/LocalLLaMA, r/ClaudeAI 최신 글
- Dev.to AI 태그 최신 포스트

**Tier 4 YouTube (WebSearch):**
- 주요 채널 최신 업로드: Fireship, AI Jason, Matt Wolfe, Yannic Kilcher
- `"Claude Code" site:youtube.com`, `"MCP server" site:youtube.com`
- 비즈니스 관련성 4점+ 예상 영상 별도 목록화

**Tier 6 미디어 (WebSearch):**
- TechCrunch AI, VentureBeat, Product Hunt AI 카테고리
- a16z AI Blog

검색 도구 우선순위: `mcp__brave-search__brave_web_search` → WebSearch → WebFetch

## Step 3: 우리 시스템 현황 스냅샷

**인프라 레이어:**
- Read: `$HOME/.claude/forge/rules/` (최근 수정 파일)
- Read: `.claude/skills/`, `.claude/agents/`
- Read: `docs/planning/active/plans/` (미처리 액션 확인)

**Forge 파이프라인 현황 (필수):**
- Read: `forge-workspace.json` → 활성 프로젝트 목록 + folderMap 경로 확인
- 각 프로젝트의 `gate-log.md` Read → 현재 Gate 위치 (S1/S2/S3/S4) 확인
- Read: `02-product/todo.md` (있으면) → Forge 전체 프로젝트 진행 현황

**Forge Dev 파이프라인 현황 (필수):**
- Glob: `**/.claude/state/sessions/*.json` → 활성/미완료 세션 목록
- Glob: `docs/walkthroughs/` → 최근 작성된 walkthrough (완료 Spec 파악)

## Step 3.5: 주식 리서치 (analyst와 병렬 — 워치리스트 기반)

`stock-research-analyst` 에이전트(agentType, `mode: daily`)를 스폰한다. Step 4 analyst와 **병렬** 가능.

- 에이전트가 `${FORGE_ROOT:-$HOME/forge}/.claude/config/stock-watchlist.json`(절대경로 — 상대경로는 cwd 에 따라 조용히 skip 된다)를 read해 종목별 1~2줄 경량 브리핑(최근 24~48h 헤드라인)을 웹검색으로 생성한다. **skip 할 때는 탐색한 절대경로를 사유에 병기**한다.
- 반환 텍스트를 `01-research/daily/{date}/stock-brief.md`로 저장(워치리스트 없으면 skip, fail-open).
- 투자자문 아님 배너·출처+일자·상충 항목 기록은 에이전트 자체 가드레일(`agents/stock-research-analyst.md`).
- **fail-open**: 실패/빈결과여도 분석·나머지 산출에 영향 없음.

## Step 4: 분석 + 산출물 생성

`daily-system-analyst` 에이전트를 스폰하여 수집 데이터를 종합 분석한다.

에이전트 프롬프트에 포함:
- raw-data.json 경로 + 수집 현황 요약
- Claude 검색 결과 (Tier 3/4/6)
- 시스템 현황 스냅샷
- 분석 기준 날짜: `$ARGUMENTS`
- 산출물 저장 위치: `01-research/daily/{date}/`

산출물 (2종):
1. `ai-system-analysis.md` — AI 시스템 분석 리포트
2. `system-improvement-plan.md` — 적용 계획서

이전 날짜의 `system-improvement-plan.md`가 있으면 미처리 액션을 이월한다.

## Step 4.6: 학습노트 생성 (분석 리포트 완성 후)

`concept-notes-writer` 에이전트(agentType)를 스폰한다.

- 입력(Read): `01-research/daily/{date}/ai-system-analysis.md` + (있으면) `stock-brief.md`.
- 핵심 개념 1~3개(cap 3, 0개면 skip)를 선별해 `01-research/daily/{date}/study-notes.md` 생성(상단 "🎓 오늘의 학습노트" + 생성일자, 투자 개념이면 투자자문 아님 배너 상속).
- **fail-open**: 실패/개념 0개여도 기존 산출은 그대로 진행한다.

## Step 4.9: 최종 완료 게이트 (필수, Notion 등록 이전)

**순서 원칙**: 파일검증 → (성공 시에만) Notion 등록. 검증 없이 Notion "완료"부터 기록하는 순서 금지.

1. 실행: `bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/verify-outputs.sh "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/daily/{date}/ai-system-analysis.md" "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/daily/{date}/system-improvement-plan.md"`
   - 인자는 **절대경로**여야 한다 — 상대경로는 cwd 에 따라 다른 곳을 보고, 없는 파일을 "없음"이 아니라 "다른 위치"로 오판하게 만든다.
   - **조건부 산출물은 생성했을 때만 인자에 추가**한다: `stock-brief.md`(관심종목 스킵 시 미생성), 개념 학습노트(미생성 가능). 생성해 놓고 인자에서 빠뜨리면 그 산출물은 **검증 없이 통과**한다.
2. 스크립트 출력 표를 완료 보고에 그대로 사용. 표 밖 임의 "완료" 서술 금지.
3. exit 2(MISSING/0바이트)면 Notion 등록 금지 — 누락 산출물 재생성 후 재검증(exit 0) 통과 시에만 Step 5로 진행한다.

## Step 5: Notion 자동 등록

분석 완료 후, 두 파일의 **전체 내용**을 Notion 페이지 본문에 직접 기록한다.

**Notion DB 정보:**
- Data Source ID: `43829f7b-8d3f-47f1-90a1-84f40d39239e`
- DB URL: `https://www.notion.so/${NOTION_DB_ID}`

**실행 순서:**

1. `Read("01-research/daily/{date}/ai-system-analysis.md")` → 전체 내용 변수 저장
2. `Read("01-research/daily/{date}/system-improvement-plan.md")` → 전체 내용 변수 저장
3. 두 파일 내용을 구분선(`---`)으로 이어 붙여 `content` 구성
4. `mcp__notion__notion-create-pages` 호출:

```json
{
  "parent": { "data_source_id": "43829f7b-8d3f-47f1-90a1-84f40d39239e" },
  "pages": [{
    "properties": {
      "제목": "{date} AI 시스템 분석",
      "Executive Summary": "{리포트의 ## Executive Summary 섹션 전문}",
      "date:날짜:start": "{date}",
      "상태": "완료",
      "Critical 갭": {Critical 갭 개수},
      "High 갭": {High 갭 개수},
      "Medium 갭": {Medium 갭 개수},
      "P0 액션": {P0 액션 개수},
      "P1 액션": {P1 액션 개수},
      "리포트 경로": "01-research/daily/{date}/ai-system-analysis.md",
      "적용계획 경로": "01-research/daily/{date}/system-improvement-plan.md"
    },
    "content": "{ai-system-analysis.md 전체 내용}\n\n---\n\n{system-improvement-plan.md 전체 내용}"
  }]
}
```

**실패 처리:**
- Notion MCP 미연결 시 경고 출력 후 스킵 (파이프라인 중단 안 함)
- 페이지 생성 실패 시 에러 로그 출력 후 스킵


## Step 5.5: index.json 갱신 (Publish — weekly index.json 생성 규율 미러)

Step 4/3.5/4.6/5에서 만든 산출물을 `01-research/daily/{date}/index.json`에 기록한다. **index.json은 절대 Write로 직접 수정 금지** — 반드시 아래 스크립트로 원자적 기록(파일 락 + additive 병합, 기존 키를 null로 덮어쓰지 않음).

1. 레코드 JSON 구성 (파일이 실제 생성된 것만 `files`에 포함 — skip된 파일은 키 자체를 생략, null 채움 금지):
   ```json
   {
     "date": "{date}",
     "title": "{date} AI 시스템 분석",
     "critical_gaps": <섹션4 Critical 항목 수>,
     "high_gaps": <High 항목 수>,
     "medium_gaps": <Medium 항목 수>,
     "p0_actions": <계획서 P0 항목 수>,
     "p1_actions": <계획서 P1 항목 수>,
     "files": {
       "ai_system_analysis": "01-research/daily/{date}/ai-system-analysis.md",
       "system_improvement_plan": "01-research/daily/{date}/system-improvement-plan.md",
       "stock_brief": "01-research/daily/{date}/stock-brief.md",
       "study_notes": "01-research/daily/{date}/study-notes.md"
     },
     "notion_upload": "{Step 5 결과 — 완료 | 미업로드 사유}"
   }
   ```
2. 원자적 기록:
   ```bash
   echo '<레코드 JSON>' | python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/daily-review/append_index_record.py
   ```
3. exit 0 확인. **fail-open**: 스크립트 실패해도 이미 생성된 2~4종 산출물은 그대로 유지 — index.json 갱신 실패만 로그하고 Step 6으로 진행한다(수동 Write 폴백 금지).

## Step 6: 대화창 전체 출력

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

- `[신뢰도: High]` = 공식 소스 (Tier 1) 또는 다중 소스 교차 확인
- `[신뢰도: Medium]` = 단일 신뢰 소스 (Tier 2-3) 또는 커뮤니티 합의
- `[신뢰도: Low]` = 단일 비공식 소스, 루머, AI 추정
