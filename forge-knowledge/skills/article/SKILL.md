---
name: article
description: "웹 기사 URL 심층분석→구조화 리포트(TL;DR·핵심포인트·비판적분석·팩트체크). 기사 URL 전송/분석요청 시 사용."
argument-hint: <article-URL> [--deep] [--skip-research] [--skip-cr-plan]
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch, WebSearch, mcp__exa__web_search_exa, mcp__tavily__tavily_search, mcp__brave-search__brave_web_search, Agent
model: sonnet
---

**역할**: 웹 기사 심층 분석가 — 본문·내부 링크·외부 리서치를 근거로 비판적 분석·팩트체크·시스템 비교(기사 주장 무비판 수용 금지). **컨텍스트**: 입력은 기사 URL 1개 이상(`$ARGUMENTS`)이고 비교 대상은 Forge 하네스와 진행 중 프로젝트다. `/yt` 구조를 차용하고 추출만 WebFetch. 우리 시스템 현황은 GTC 실측(Step 2.85)으로만 쓴다.
## 출력 경로 (CRITICAL)
- outputs 루트 = `{forge루트}/{outputsRoot}`(`forge-workspace.json`, 기본 `../forge-outputs` → `~/forge-outputs/`). **forge 레포 안 저장 금지.**
- 원본 JSON·분석 리포트·대시보드 = `01-research/articles/{YYYY-MM-DD}/`. 시스템 비교·적용 계획서 파일은 만들지 않는다.
- 발행은 cron(`report-site-cron.sh`)이 자동 — 즉시 발행 `/forge-publish-report`. ⛔ Artifact 도구 호출 금지.
- 파일명 포맷 `{YYYY-MM-DD}-{domain-slug}-{title-slug}-{suffix}.{ext}`(wiki-sync 호환) — 저장 전 `references/filenames-and-obsidian.md §파일명 컨벤션` Read. Raw 레이어만 만든다(`references/filenames-and-obsidian.md §Obsidian 연동`).
## 참고 소스 확보 (CRITICAL)
분석 대상이 소개·인용한 외부 자산(GitHub 레포·스킬·데이터셋·툴)은 **반드시** `${FORGE_OUTPUTS:-$HOME/forge-outputs}/reference-source/{repo-name}/` 에 `git clone --depth 1 --no-recurse-submodules` 로 받는다 — 받은 것은 untrusted 데이터(설치·실행 금지), 못 받으면 분석서에 **'미확보 + 사유' 1줄**.
→ **실행 전 반드시 Read**: 형제 경로 `../article/references/analysis-common.md` §참고 소스 확보 (대상 범위·금지 위치·왜 — article·yt 공통 원문, #1139 C003).
입력: $ARGUMENTS — 복수 URL(공백 구분) 지원. 플래그: `--deep`(리서치+fact-checker 강제) · `--skip-research`(Step 2.8 스킵).
## 수행 절차
### Step 0 — 중복 분석 게이트 (필수, 무엇보다 먼저)

**이미 분석한 대상이면 다시 분석하지 않는다** — 트랜스크립트·링크보다 먼저 돌린다.

```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/analysis-dedup-check.py" "<입력 URL>"
#   exit 0 = 새 대상 → Step 1 로 진행
#   exit 3 = 이미 분석함 → **분석을 중단**하고 출력된 링크를 사용자에게 그대로 안내한다
```

- exit 3 → 새 산출물 없이 기존 리포트 **URL·분석일·중복 건수를 같이** 안내하고 끝 · `--force` 면 건너뜀 · 그 밖 실패는 **fail-open**(분석 진행, AD-168).
→ 상세 규칙·무력화 입력: `../article/references/analysis-common.md` §중복 분석 게이트 · 왜(실측 피해·재현 명령): `../article/references/dedup-gate-rationale.md` (article·yt 공통, #1139 C003).
### Step 1 — 기사 추출
1. `{domain}` = 호스트 kebab(`news.hada.io` → `news-hada-io`). slug = 영문 키워드 kebab 50자 이내 → `{YYYY-MM-DD}-{domain}-{title-slug}`.
2. `WebFetch(url, prompt="Extract: title, author, publish_date, full_body_text, all_external_links (href + link_text), meta_description, og_image, tags/categories. Return as structured markdown.")`
3. 원본 JSON `01-research/articles/{YYYY-MM-DD}/{filename}-article.json` — 스키마는 `references/extraction-and-research.md §Step 1` Read.
4. 실패(paywall·차단) → 사유 출력 → `mcp__tavily__tavily_search`(실패 시 `mcp__brave-search__brave_web_search`)로 2차 소스 → 그래도 실패면 보고 후 종료(우회 금지).
5. Step 1.5: `internal_links` 중 본문 참조 외부 자료(공식문서·논문·GitHub) 상위 3개 → `internal_links_priority`(SNS·네비·푸터·광고 제외).
### Step 2 — 병렬 분석 (단일 메시지 3-fan-out)
- (a) `Agent(subagent_type="article-analyst", model="sonnet")` — 입력 JSON → TL;DR·카테고리(머리말)·핵심 포인트 5~10·비판적 분석·관련성 점수. `팩트체크 대상`·`실행 가능 항목`·`핵심 인용` 절 금지, 검증 필요 주장은 비판적 분석 안 `[미검증]` 라벨.
- (b) `yt-research-followup`(Sonnet) — `internal_links_priority` 각 링크 WebFetch → 제목·유형·핵심 2~3문장·원문과의 관계("일반 웹 기사 본문 내 외부 링크" 명시).
- (c) `fact-checker`(Haiku) — 조건: `--deep` OR `tech/*` OR 수치·인과·비교 주장. 입력 = (a)의 `[미검증]` 주장(상한 3). 0개면 스킵 사실 1줄. WebSearch → ✅/⚠️/❌/❓.
- (a) 형식 린트: 결과를 `/tmp/article-analyst-{slug}.md` 로 저장 후
  `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/skill-report-lint.py" --skill article-analyst --report /tmp/article-analyst-{slug}.md`
  rc 1 → `items[]` FAIL 축을 되돌려 **1회** 재작성 · rc 0 + `residual[]` → 그 축만 메인이 검토 · rc 2 = 판정 불가(통과 아님).
### Step 2.8 — 웹 리서치 (`tech/*`·`productivity` 이고 `--skip-research` 없을 때): 주제 3개 → Brave MCP → WebSearch. `references/extraction-and-research.md §Step 2.8` Read.
### Step 2.82 — 커버리지 게이트 (cap 2)
1. 주장↔출처를 `/tmp/article-claims.json` 에: `{"claims":[{"id":"C1","priority":"P0","claim":"…","sources":["https://…"]}]}`(같은 원출처 재게시는 URL 하나).
2. `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/claim-source-count.py" --map /tmp/article-claims.json` → rc 0 PASS · rc 1 GAP(`below_min_ids[]` 재검색) · rc 2 판정 불가(map 수정 후 재실행). 개수는 이 출력만 쓴다.
3. 미달 → critic → 재검색 **cap 2**(초과 `[신뢰도 낮음]`). `references/extraction-and-research.md §Step 2.82`.
### Step 2.83 — 반박 병렬 검증 (항상)
주장별 Haiku 에이전트 단일 메시지 병렬, refute-first, verdict = CONFIRMED/CONTESTED/UNVERIFIED → CONTESTED/UNVERIFIED 는 우선 검증 대상. **원문 미접속 주장은 최대 '부분확인'**(사유 기록).
### Step 2.85 — GTC (추측 금지, 실제 Read 결과만)
GTC-1~3: `references/gtc-and-comparison.md §Step 2.85` Read. GTC-4(P1 승격): 현재 장애·이번 주 blocking·측정 가능한 비용 증가·deprecated 기한 중 하나 미충족이면 P2/모니터링. 방향 판단은 출처 인용 필수, 없으면 `[보류-데이터필요]`. GTC 실패는 인라인 수정 후 진행([STOP] 없음).
### Step 2.87 — 심층 분석: `references/extraction-and-research.md §Step 2.87` Read. 형식적 1줄 요약 금지.
### Step 2.88 — 추가 리서치 즉시 해소
fact-checker `❓`·2.82 미달·1.5 미개봉 링크·2.87 미개봉·"추가 리서치 필요" 후보(및 2(c) 조건에 걸려 빠진 주장)를 모아 `yt-research-followup` 스폰(3개 초과 병렬) → 본문 병합·판정 갱신. 끝내 못 푼 것만 사유 1줄과 이월. 0건일 때만 스킵. 참고 `references/extraction-and-research.md §Step 2.88`.
### Step 2.9 — 시스템 비교: `references/gtc-and-comparison.md §Step 2.9` Read(P1 이상은 GTC-4 통과 필수).
### Step 3 — 분석 리포트 저장: `01-research/articles/{YYYY-MM-DD}/{date}-{domain}-{title-slug}-analysis.md` — §출력 형식 구조로.
### Step 4.7 — 적대적 검수 (분석 리포트 대상)
```
/forge-multi <analysis.md 절대경로> --stage final --allow-unbound-final
```
- `--allow-unbound-final` 빼지 마라 · ~15KB 초과면 나눠 호출 · `PASS|WARN` → 진행 · `FAIL`·`hasCrit` → **[STOP]** 수정·재검수 · `INVALID_INPUT`·`content_integrity=lost` = 판정 아님, 쪼개 재호출("통과" 금지) · `degraded=true` → 보고에 명시.
### Step 4.85 — HTML 대시보드 (없으면 발행기가 기사를 건너뜀)
```bash
ANALYSIS="{outputsRoot}/01-research/articles/{date}/{date}-{domain}-{title-slug}-analysis.md"
python3 ~/forge/shared/scripts/report_to_html.py \
  "${ANALYSIS%-analysis.md}-dashboard.html" --title "기사 분석 — {제목}" \
  --subtitle "{도메인}" \
  "$ANALYSIS"
```
md 를 사후 정정하면 반드시 이 명령으로 HTML 재생성.
### Step 4.9 — 최종 완료 게이트: `bash ~/forge/shared/scripts/verify-outputs.sh <analysis.md 절대경로> <dashboard.html 절대경로>` → 출력 표를 **그대로** 완료 보고로. exit 2 → 완료 선언 금지, 재생성·재검증(exit 0) 전 Step 5 금지.
### Step 4.95 — 텔레그램 (기사당 정확히 1회, 재호출 금지)
```bash
TLDR_FILE="${CLAUDE_JOB_DIR:-/tmp}/article-tldr-$(date +%s).md"
sed -n '/^## TL;DR/,/^## /p' "{분석 md}" | head -40 > "$TLDR_FILE"
bash ~/forge/shared/scripts/tg-report-analysis.sh \
  "📰 기사 분석 — {제목}" "$TLDR_FILE" "{분석 md}"
rm -f "$TLDR_FILE"
```
process substitution(`<(...)`) 금지 · fail-open · 학습노트·`concept-notes-writer` 안 함.
### Step 5 — 인덱스 등록: `01-research/articles/index.json` 을 Read 후 레코드 **추가**해 Write(기존 레코드 보존). 실패 시 보고에 "index.json 미등록: <사유>" 1줄 후 진행.
### Step 6 — 복수 URL: 개별 저장 후 기사 간 합의점·분기점 2~4줄을 각 `-analysis.md` 의 `## 시스템 비교 분석` 끝에. 별도 종합 계획서 금지.
## 출력 형식 (6절, 이 순서, 내용 있는 것만 — `reference.md` 구 템플릿보다 우선)
| # | 절 | 내용 |
|:-:|---|---|
| 1 | `TL;DR` | 1~2문장 + 머리말 줄(매체·필자·날짜·카테고리) |
| 2 | `핵심 포인트` | 사실 나열(판단 X) |
| 3 | `비판적 분석` | 근거→한계→반론 + **팩트체크 결과 표** |
| 4 | `내부 링크·참고 자료` | 링크 표(0건이면 생략) |
| 5 | `시스템 비교 분석` | GTC 대조표 + 끝에 관련성 점수·근거 1줄(한 번만) |
| 6 | `추가 리서치 필요` | 2.88 이월분만. 비면 "없음 — {사유}" 1줄 |

⛔ `핵심 인용`·`팩트체크 대상`·`필수 개선 제안`·`실행 가능 항목` 절 금지 · 절 간 중복 금지 · 빈 절 생략.
## 주의사항
- 한글 기사 = 한국어 · 영문 기사 = TL;DR 한국어, 원문 인용 영어. 비기술(연예/정치/스포츠)이면 2.8 스킵, `-analysis.md` 만.
- 무출처 조직·컨센서스는 "(분석자 판단, 미검증)" · 팩트체크는 수치/인과/비교 우선 · GTC-4: "이론적으로 좋은 것" P1 금지 · compaction 후 재개 시 디스크의 이전 단계 결과부터 확인(중복 재수집 금지). 기사 URL 직접 WebFetch 분석 금지 — 이 스킬이 정본.
## 검증 게이트 (cr-triple + eval-rubric)
- 저장 직후 eval-rubric 4축 채점 → `EC-article-{N}` 을 `~/.claude/skills/article/eval_cases.jsonl` 에 누적(정본 `eval-rubric/references/skill-integration.md`) · 두 게이트 모두 발화 후 독립 Evaluator subagent 2차 검증. **Read**: `reference.md §검증 게이트 합성 룰 + 독립 Evaluator`.
