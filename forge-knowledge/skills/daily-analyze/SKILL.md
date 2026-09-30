---
name: daily-analyze
description: "그날 수집해 둔 daily raw-data.json 으로 분석만 다시 돌린다(수집 생략). 쓸 때: daily-system-review 분석 단계가 실패했거나 분석만 새로 받고 싶을 때. SKIP: raw-data.json 이 없을 때(→ /daily-system-review)."
argument-hint: "<YYYY-MM-DD>"
context: fork
model: sonnet
---

**역할**: Daily Review JSON 을 심층 분석하는 AI 동향 분석가. `raw-data.json` 이 있을 때 수집을 건너뛰고 분석만 재실행한다(실패 후 재시작·다른 관점 재분석).
**출력**: `forge-outputs/shared/01-research/daily/{date}/` 에 산출물 저장.
**컨텍스트**: `raw-data.json`이 존재할 때 수집 단계를 스킵하고 재분석이 필요할 때 호출됩니다.

## 인자
- `$ARGUMENTS` = 기준 날짜(YYYY-MM-DD). 없으면 전날.

## Step 1: raw-data.json 로드
- `01-research/daily/{date}/raw-data.json` 읽기 → `stats`(Tier별 건수) · `items` · `claude_search_needed` 확인.
- 파일이 없으면: **[STOP]** — `/daily-system-review {date}` 를 먼저 실행해야 한다.

## Step 2: Claude 검색 보강 (`claude_search_needed` 대상)
- **Tier 3 커뮤니티**: `site:news.ycombinator.com AI after:{date}` · Reddit r/MachineLearning·r/LocalLLaMA·r/ClaudeAI · Dev.to AI
- **Tier 4 YouTube**: Fireship·AI Jason·Matt Wolfe·Yannic Kilcher 최신 · `"Claude Code" site:youtube.com` · `"MCP server" site:youtube.com` · 비즈니스 관련성 4점+ 예상 영상 별도 목록
- **Tier 6 미디어**: TechCrunch AI · VentureBeat · Product Hunt AI · a16z AI Blog
- 도구 순서(정책 = `rules-on-demand/web-search-policy.md`): `mcp__tavily__tavily_search` → `mcp__brave-search__brave_web_search`(fallback) → WebFetch

## Step 3: 우리 시스템 현황 스냅샷
- 인프라: `~/.claude/forge/rules/`(최근 수정) · `.claude/skills/` · `.claude/agents/` · `docs/planning/active/plans/`(미처리 액션)
- Forge 파이프라인(필수): `forge-workspace.json`(활성 프로젝트·folderMap) → 각 `gate-log.md`(S1~S4 위치) · `02-product/todo.md`(있으면)
- Forge Dev(필수): Glob `**/.claude/state/sessions/*.json`(미완료 세션) · `docs/walkthroughs/`(최근 완료 Spec)

## Step 3.5: (삭제) 주식 리서치
- 주식 브리핑 단계는 뺐다 — 사람이 `stock-research-analyst` 를 지정 삭제했다(#1374 · #1513, 원본 삭제는 되돌리지 않는다).

## Step 4: 분석 + 산출물 생성
`daily-system-analyst` 스폰. 프롬프트에 raw-data.json 경로+수집 요약 · Tier 3/4/6 검색 결과 · 시스템 스냅샷 · 기준 날짜 `$ARGUMENTS` · 저장 위치 `01-research/daily/{date}/` 포함.
- 산출물: `ai-system-analysis.md`(분석 리포트) · `system-improvement-plan.md`(적용 계획서)
- 이전 날짜 `system-improvement-plan.md` 의 미처리 액션은 이월한다.
- 학습노트(`concept-notes-writer`)는 스폰하지 않는다(폐지).

## Step 4.9: 최종 완료 게이트 (인덱스 등록 전 필수)
1. 실행(인자는 절대경로):
   `bash ~/forge/shared/scripts/verify-outputs.sh "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/daily/{date}/ai-system-analysis.md" "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/daily/{date}/system-improvement-plan.md"`
   - 조건부 산출물은 생성했을 때만 인자에 추가한다 — 빠뜨리면 검증 없이 통과한다.
2. 스크립트 출력 표를 완료 보고에 그대로 쓴다. 표 밖 "완료" 서술 금지.
3. exit 2(MISSING/0바이트)면 인덱스 등록 금지 → 재생성 후 exit 0 일 때만 Step 5.5.

## Step 4.95: 갭·액션 개수 = 스크립트가 센다
```bash
D="${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/daily/{date}"
python3 ~/forge/shared/scripts/daily-triage-lint.py --analysis "$D/ai-system-analysis.md" --plan "$D/system-improvement-plan.md" --contract > /tmp/daily-triage-{date}.json
```
**rc 가 아니라 출력 JSON 으로 판정한다**(rc 1 인데 `counts` null · rc 2 인데 `counts` 유효 가능).

| 칸 | 값 | 할 일 |
|---|---|---|
| `contract.violations` | 비어 있지 않음 | 위반(5축 논문이 `## Weekly 심층 분석 이관 항목` 에 없음 · 계획서 `## Weekly 이관 항목` 헤더 없음 · GTC-2 `이미 완료` 경로 부재 · GTC-1 미사용 모순)대로 리포트 수정 |
| `counts` | null | 리포트 `## 4. 갭 분석` 의 `### Critical|High|Medium|Low` 소제목·계획서 P0 절을 맞춘다 |
| `contract.reasons` | 비어 있지 않음 | 계약 검사 미실행 — 재실행하지 않고 완료 보고에 `계약 검사 미완료: <reasons>` |

- 앞 두 행 중 해당하는 행을 **모두** 고친 뒤 1회 재실행.
- `counts` 가 null 이 아니면 rc 무관하게 `counts.{critical_gaps,high_gaps,medium_gaps,p0_actions,p1_actions}` 를 Step 5.5 에 그대로 옮긴다(손 수정 금지).
- 그래도 null 이거나 출력이 JSON 이 아니면 개수 키를 생략한다(0 채움 금지).
- 마지막 실행의 `contract.violations`·`contract.reasons`·최상위 `reasons` 는 `counts` 와 무관하게 전부 완료 보고에 적는다.
- 재분석으로 index 를 덮기 전 대조: `--check-index "$D/index.json"`(불일치 rc 1).
- Notion 등록은 없다 — 아래 index 가 유일 경로.

## Step 5.5: index.json 갱신
**index.json 을 Write 로 직접 수정 금지** — 스크립트로 원자적 기록(락 + additive 병합).
1. 레코드(실제 생성된 파일만 `files` 에 — skip 파일은 키 생략, null 금지):
   ```json
   {"date": "{date}", "title": "{date} AI 시스템 분석",
    "critical_gaps": <counts.critical_gaps>, "high_gaps": <counts.high_gaps>, "medium_gaps": <counts.medium_gaps>,
    "p0_actions": <counts.p0_actions>, "p1_actions": <counts.p1_actions>,
    "files": {"ai_system_analysis": "01-research/daily/{date}/ai-system-analysis.md",
              "system_improvement_plan": "01-research/daily/{date}/system-improvement-plan.md",
              "study_notes": "01-research/daily/{date}/study-notes.md"}}
   ```
2. `echo '<레코드 JSON>' | python3 ~/forge/shared/scripts/daily-review/append_index_record.py`
3. exit 0 확인. 실패해도 산출물은 유지 — 실패만 로그하고 Step 6 진행(수동 Write 폴백 금지).

## Step 6: 대화창 전체 출력
`01-research/daily/{date}/ai-system-analysis.md` · `system-improvement-plan.md` 를 Read 해 전체 출력:
```
===== AI 시스템 분석 리포트 ({date}) =====
{ai-system-analysis.md 전체 내용}

===== 시스템 개선 계획서 ({date}) =====
{system-improvement-plan.md 전체 내용}
```

## 신뢰도 등급
- `[신뢰도: High]` = 공식 소스(Tier 1) 또는 다중 소스 교차 확인
- `[신뢰도: Medium]` = 단일 신뢰 소스(Tier 2-3) 또는 커뮤니티 합의
- `[신뢰도: Low]` = 단일 비공식 소스, 루머, AI 추정
