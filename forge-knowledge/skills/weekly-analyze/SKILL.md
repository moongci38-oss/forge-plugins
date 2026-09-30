---
name: weekly-analyze
description: "그 주에 수집해 둔 weekly raw-data.json 으로 심층 분석만 다시 돌린다(수집 생략). 쓸 때: weekly-research 분석 단계가 실패했거나 분석만 새로 받고 싶을 때. SKIP: raw-data.json 이 없을 때(→ /weekly-research)."
argument-hint: "<YYYY-MM-DD>"
context: fork
model: sonnet
---

**역할**: Weekly Research JSON 을 심층 분석하는 AI 주간 동향 분석가. `raw-data.json` 이 있을 때 수집을 건너뛰고 분석만 재실행한다(실패·중단 후 재시작, 다른 관점 재분석).
**출력**: 기술 뉴스·비즈니스 뉴스·사업 아이템 제안 3종 → `forge-outputs/shared/01-research/weekly/`
**컨텍스트**: `raw-data.json`이 존재할 때 수집 단계를 스킵하고 재분석이 필요할 때 호출됩니다.

# Weekly Research — 재분석 (JSON → 분석)
- `$ARGUMENTS` = 기준 날짜(YYYY-MM-DD). 미입력 시 오늘.

## Step 1: raw-data.json 로드
`01-research/weekly/{date}/raw-data.json` 에서 확인:
- `stats` — 카테고리별 수집 건수
- `items` — 정형 데이터(tech 피드·GitHub 트렌딩·HN)
- `claude_search_needed` — Claude 가 추가 검색할 카테고리

파일이 없으면: **[STOP]** — `/weekly-research {date}` 를 먼저 실행해야 한다.

## Step 2: Claude 검색 보강 (`claude_search_needed` 항목)
- **비즈니스 뉴스(WebSearch)**: SaaS/스타트업 주간 동향 · Product Hunt AI 신규(지난 7일) · 인디해커/1인기업 사례·과금 모델 변화
- **사업 아이템(WebSearch + WebFetch)**: 시장 데이터+경쟁사 · Forge S1(경쟁 가설 3개 → TAM/SAM/SOM → JTBD → 1개 선정) · 1인 개발자 내달 1,000만원+ 가능성
- 도구 순서(정책 `rules-on-demand/web-search-policy.md`): `mcp__tavily__tavily_search` → `mcp__brave-search__brave_web_search`(fallback) → WebFetch

## Step 3: 산출물 생성 (3종)
`weekly-research-analyst` 에이전트를 스폰한다. 프롬프트에 raw-data.json 경로+수집 현황 요약, 검색 결과, 기준 날짜 `$ARGUMENTS`, 저장 위치를 넣는다.

| # | 문서 | 저장 위치 | 파일명 |
|:-:|------|----------|--------|
| 1 | 일반 기술 뉴스 | `01-research/weekly/{date}/` | `tech-trends.md` |
| 2 | 비즈니스 뉴스 | `01-research/weekly/{date}/` | `biz-trends.md` |
| 3 | 사업 아이템 제안 | `01-research/projects/{project}/` | `{date}-s1-research.md` |

## Step 4: 취합 검증 (서술형 확인 금지)
```bash
bash ~/forge/shared/scripts/verify-outputs.sh \
  "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/{date}/tech-trends.md" \
  "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/{date}/biz-trends.md" \
  "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/projects/{project}/{date}-s1-research.md"
```
- 인자는 절대경로. 조건부 산출물(stock-brief.md·개념 학습노트)은 생성했을 때만 추가한다.
- exit 2(MISSING/0바이트) → 해당 에이전트 재스폰 후 재검증. "완료" 선언 금지.
- exit 0 → 출력 표로 주간 요약 보고(파일 경로·사업 아이템 제목·신뢰도 분포) 후 Step 5.

## Step 5: 블로그 발행 + Notion 등록 (순차)
1. 블로그 자동 발행(tech-trends.md → `/api/v1/blog/auto-publish`, 선택적)
2. Notion "Weekly Research" DB 등록 — Data Source ID `d7ba2bc1-4c7b-400d-872f-8d78bfeea213` · MCP 미연결 시 경고 후 스킵

## 신뢰도 등급
`[신뢰도: High]` 다중 소스 일관 · `[신뢰도: Medium]` 단일 신뢰 소스 · `[신뢰도: Low]` AI 추정/비공식

## 독립 Evaluator (먼저 스크립트로 기계 판정 축을 거른다)
```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/skill-report-lint.py" \
  --skill weekly-analyze --report "<tech-trends.md 절대경로>" > /tmp/wk-lint.json
echo "lint rc=$?"
```
- `rc=0` → 구조 통과. `residual` 축만 Evaluator 가 본다.
- `rc=1` → `items[]` 중 `FAIL` 축만 보완(전체 재생성 금지).
- `rc=2` + stdout JSON 있음 → 판정 불가(PASS·FAIL 아님). 5축 전부 Evaluator 가 본다.
- `rc=2` + stdout JSON 없음 → 입력 경로 오류. 고쳐 재실행.

| # | 축 | 판정 주체 |
|---|---|---|
| 1 | ACHCE 태그 | 스크립트(`wk-1`, 있으면 PASS) + LLM(없으면 UNDECIDED) |
| 2 | 신뢰도 등급 | 스크립트(`wk-2`) |
| 3 | TAM/SAM/SOM | 스크립트(`wk-3`, 섹션 있을 때만) |
| 4 | 경쟁 가설 3개 | 스크립트(`wk-4`, 섹션 있을 때만) |
| 5 | Tier 1 공식 소스 3개 | 스크립트(개수 미달만 FAIL) + LLM('공식' 여부) |

⚠️ ①③④를 하드 FAIL 로 올리지 마라 — 못 잰 것은 위반이 아니라 판정 불가다.
```python
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="""
당신은 독립 분석 품질 검증자입니다. weekly-analyze (주간 분석 재실행) 결과물을 검토하세요.

검증 항목:
- 기술 뉴스·비즈니스 뉴스 각 항목에 ACHCE 태그가 있는가?
- 신뢰도 등급이 전체 항목에 표기됐는가?
- 사업 아이템 분석에 TAM/SAM/SOM이 포함됐는가?
- 경쟁 가설 3개가 제시됐는가?
- Tier 1 공식 소스 최소 3개가 인용됐는가?

판정: PASS / FAIL
피드백: [파일명+섹션] — [이유] → [방법]
"""
)
```

- PASS → 계속(저장/발행) · FAIL → 지적 항목 보완 후 재실행(1회 한도) · 2회 연속 FAIL → [STOP] Human 에스컬레이션
