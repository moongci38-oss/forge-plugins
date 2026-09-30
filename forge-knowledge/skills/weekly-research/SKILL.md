---
name: weekly-research
description: "주간 리서치 — 기술 뉴스·비즈니스 뉴스·사업 아이템 제안 3종을 병렬 생성해 리포트로 낸다. 쓸 때: 사용자가 /weekly-research 를 부르거나 주간 스케줄이 돌 때. SKIP: 일일 알람(→ /daily-system-review), 수집 끝난 주 재분석(→ /weekly-analyze)."
argument-hint: "[YYYY-MM-DD]"
disable-model-invocation: true
context: fork
agent: general-purpose
# 근거: 2026-09-25 사람 결정(#1104) — Notion 연동 해제. 인덱스·블로그·리포트 사이트는 유지.
allowed-tools: Agent, Bash, WebSearch, WebFetch, Write, Read, Glob, Grep, mcp__exa__web_search_exa, mcp__tavily__tavily_search, mcp__brave-search__brave_web_search
model: sonnet
---

**역할**: 주간 기술·비즈니스 뉴스 수집 + 사업 아이템 제안 리서치 전문가. `/weekly-research` 또는 cron 실행. **출력**: §산출물 파일 저장이 정본. 발행은 `report-site-cron.sh`(매시 :25)가 자동 — 즉시 발행은 `/forge-publish-report`, URL `https://forge-reports.pages.dev/<kind>/<slug>/`. ⚠️ Artifact 도구 호출 금지.
**컨텍스트**: 매주 자동 실행되거나 `/weekly-research` 호출 시 실행됩니다.

## ⛔ 우리 하네스 상태를 쓸 때 (CRITICAL)
- "우리 시스템은 이렇다"는 `harness_probe()` 출력을 인용한다. 실행하지 않은 명령을 근거로 적지 않는다.
- 답 못 하는 항목은 `측정 불가(도구 없음)` — "없음"·"미설정" 단정 금지(못 본 것 ≠ 없는 것). 클라우드 실행 시 `~/forge` 밖 읽기·임의 셸 없음.

## 인자·산출물
`$ARGUMENTS` = 기준 날짜(YYYY-MM-DD, 미입력 시 오늘). `WK=${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/{date}`
`01-research/weekly/index.json` `files`: 기존 키 유지.

| # | 문서 | 경로 |
|:-:|---|---|
| 1 | 기술 뉴스 | `01-research/weekly/{date}/tech-trends.md` |
| 2 | 비즈니스 뉴스 | `01-research/weekly/{date}/biz-trends.md` |
| 3 | 사업 아이템 | `01-research/projects/{project}/{date}-s1-research.md` |
| 4 | HTML 대시보드 | `01-research/weekly/{date}/dashboard.html` |

## 실행 흐름
**Wave 0** — `Glob("${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/{date}/raw-data.json")`. 존재 → 수집 스킵, `/weekly-analyze {date}` 흐름(raw-data + 검색 보강 → `weekly-research-analyst` 스폰, `.claude/skills/weekly-analyze/SKILL.md`). 미존재 → Wave 0.5부터.
**Wave 0.5** — 직전 7일 daily 계획서의 `## Weekly 이관 항목`을 `carryover-items.md`로 수집(유일한 수집자, 이후 단계는 읽기만). fail-open. 헤더 계약 `/^## Weekly (심층 분석 )?이관 항목([ (]|$)/`(daily-triage-lint.py 와 공유)은 스크립트 안에 있다.
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/weekly-research-carryover.sh" "$ARGUMENTS"` → `STATUS=ok|skipped|error`·`COUNT`·`CARRY`. rc 0 = 수집(0건 포함)·DATE 미지정 스킵 · rc 2 = 파일 못 씀(판정 불가). 어느 쪽이든 멈추지 않고 Wave 1로 — `[weekly Wave0.5] carryover: {COUNT}개 daily` 1줄 보고.
**Workflow 분기** — 기본: `Workflow({ script: Bash("cat ~/.claude/skills/weekly-research/workflow.js") })`. `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 또는 Workflow 실패 시 아래 Wave 1~3 직접 실행.
**Wave 1 (Agent 병렬, 단일 메시지)** — carryover-items.md가 비어있지 않으면 "지난주 daily 이관 항목 우선 반영" 지시와 함께 Read 대상으로 포함. 모든 워커는 리포트 저장 외에 **원시 소스 목록**(쿼리·URL·제목·발행일·신뢰도 근거)을 반환한다.
- **A (haiku) 기술 뉴스** / **B (haiku) 비즈니스 뉴스**: `references/wave1-collect-detail.md §Subagent A`·`§Subagent B` 프롬프트 항목을 Read해 그대로 넣는다 → `tech-trends.md`·`biz-trends.md`.
- **C (sonnet) 사업 아이템**: 기준 날짜 `$ARGUMENTS` +
  - 거래 시장 우선: 마켓 표면(Play·App Store·Chrome·Shopify·WordPress·AppSumo·Product Hunt·로컬 스토어) 3개+ 실조회, 못 본 곳 `미조회(사유)`, 국가 명시. 정본 `~/.claude/commands/forge-find-item.md §마켓 표면 체크리스트`
  - 후보 입장권 = 가격·거래량 근사(설치·리뷰·LTD·랭킹) 중 2개+ 마켓 리스팅 직접 실측. ⛔ 기사·리스티클은 근거 불인정(배경만)
  - 검색: `site:apps.shopify.com`·`site:play.google.com`·`site:appsumo.com` 우선, 통증은 `site:reddit.com` 보완
  - ⛔ TAM/SAM/SOM 금지 → JTBD → 경쟁 3 비교 → Moat 4종 중 1+ → MVP wedge → 매출 산술(단가×고객 수). 가설 3개 → 1개 선정 + 로드맵(MVP·스택·타임라인). 기준: 1인 개발자 내달 1,000만원+
  - 프로젝트명 결정 → `forge-workspace.json` 등록 확인 → `01-research/projects/{project}/{date}-s1-research.md` 저장 → `gate-log.md`에 S1 PASS 기록
- ~~D 관심종목~~ — 주식 브리핑 단계는 뺐다 — 사람이 `stock-research-analyst` 를 지정 삭제했다(#1374 · #1513, 원본 삭제는 되돌리지 않는다).

**Wave 1.2** — Lead가 원시 소스를 취합해 `$WK/raw-data.json`에 저장(스키마 `references/wave1-collect-detail.md §Wave 1.2 raw-data.json 스키마`, `source: "wave1-agent-collected"`). 착수 직전 Glob으로 이미 있으면 덮어쓰지 않음(`run.sh` Step 1 `collector.py` 산출과 `source`로 구별). fail-open.
**Wave 1.5 커버리지 게이트 (cap 2라운드)** — 세는 것은 스크립트:
```bash
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/source-modality-critic.py" "$WK/tech-trends.md"
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/source-modality-critic.py" --market-surface "$WK/biz-trends.md"
# rc 0 = gap 없음 · 1 = gap(재검색) · 2 = 판정 불가(gap 0으로 적지 말 것)
```
마켓 표면 행은 아이템·수익화 산출물에만(tech-trends 제외). rc 1이면 `references/wave1-collect-detail.md §Wave 1.5 재검색 절차 · [신뢰도 낮음] 플래그 · critic 1줄 출력`(판정표 `§Wave 1.5 판정 기준 표`)을 Read해 2라운드 재검색, 미달이면 `[신뢰도 낮음]` 플래그 후 진행(차단 X). 결과 1줄은 Wave 2 보고에.
**Wave 2 (Lead 취합)**
```bash
bash ~/forge/shared/scripts/verify-outputs.sh "$WK/tech-trends.md" "$WK/biz-trends.md" \
  "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/projects/{project}/{date}-s1-research.md"   # 절대경로만
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/gtc_check.py" --report "$WK/tech-trends.md" --report "$WK/biz-trends.md"
```
- verify-outputs exit 2(MISSING/0바이트) → 해당 항목 "완료" 금지, 해당 Subagent 재스폰 후 재검증. 출력 표를 보고에 그대로 사용.
- gtc_check rc 0 통과 · 1 = `violations[]` 고친 뒤 재실행 · 2 = 판정 불가(통과 아님, `reasons` 기재).
- 요약 보고: 파일 경로·아이템 제목·신뢰도 분포.
- **spot-check**: 결론·순위를 좌우하는 주장은 표본 3건+ 원출처를 Lead가 직접 재확인(가격·수치·부재 주장 우선). 워커 판정 라벨을 그대로 옮기지 않는다. 어긋나면 정정 이력 기록.

**Wave 2.5~2.55** — `references/wave25-wave3.md §Wave 2.5`·`§Wave 2.55`를 Read해 실행(검수 대상 SSoT도 거기).
- 2.5: Lead 컨텍스트를 공유하지 않는 독립 Evaluator 필수 → PASS / FAIL(AUTO-PROCEED).
- 2.55: cr-triple 2벤더 교차 2레그(`--cr on`). **비차단** — 지적은 리포트 말미 `## 검수 지적`에 적고 진행([STOP] 없음). `content_integrity=lost`·`INVALID_INPUT` = 검수 미수행 → 대상 쪼개 재호출. `concept-notes-writer`(학습노트)는 스폰하지 않는다.

**Wave 2.7 대시보드** (PASS 또는 FAIL(AUTO-PROCEED) 후)
```bash
python3 ~/forge/shared/scripts/report_to_html.py "$WK/dashboard.html" --title "Weekly Research — {date}" \
  --subtitle "기술 동향 + 비즈니스 동향 + 사업 아이템" "$WK/tech-trends.md" "$WK/biz-trends.md"
```
**Wave 3 (인덱스 + 블로그)** — `references/wave25-wave3.md §Wave 3` Read. Step 0(무조건, 블로그보다 먼저) `index.json`에 회차 등록 → 블로그 발행(실패해도 경고 후 스킵). 완료 게이트: `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/weekly-index-gate.sh" "{date}"` rc=0이어야 완료(1=등록 누락·2=판정 불가).
**Wave 3.5 wiki-sync** — `FORGE_WIKI_AUTOSYNC=off`면 스킵, 아니면 `Skill(skill="wiki-sync", args="--auto")`. 항상 `[wiki-sync] N건 wiki화 (신규 M / 업데이트 K, pending-review P건)` 출력(0건도). 실패 시 `[wiki-sync] 실패: {사유} — weekly 파이프라인은 계속 진행` 1줄 후 계속.

## 신뢰도 표기 (두 축)
- 소스: `[신뢰도: High]` 다중 소스 일관 · `[신뢰도: Medium]` 단일 신뢰 소스 · `[신뢰도: Low]` AI 추정·비공식 / 직접 열람: `[실측]` URL 직접 확인 · `[스니펫]` 검색 스니펫만(reddit은 기본 여기) · `[전언]` 워커 보고 옮김(spot-check 전 사실 승격 금지)

## Evaluator 검증 항목 (Wave 2.5 보조 — `Agent(subagent_type="general-purpose")`)
①1차 출처 비율 ≥60%(링크 1개뿐이면 Medium 이하·WARN. 링크 수는 대리변수 — 독립성(동일 보도자료 재인용=단일 출처)·출처 유형·entailment로 최종 판정, 단일 1차 출처라고 Low까지 기계 강등 금지. 적용/보류/기각 방향은 출처(공식 URL·실측) 인용 시에만 확정, 근거 없는 단정은 `[보류-데이터필요]` — 이 상태는 우선순위·영향도 강등 사유에서 제외) ②지난 7일 이내 ③중복 없음 ④"Forge 적용 인사이트" 구체성 ⑤Anthropic·OpenAI·Google 누락 없음. PASS=5개 충족 · WARN=1~2 미충족 → 해당 섹션 보완 · FAIL=3+ → Wave 1 재실행.

## 후속·Gotchas
- 사업 아이템은 Forge S1 형식, Human 승인 시 S2(린 캔버스). Telegram 알림 `plugin:telegram:telegram`(설정 시), 중복·트렌드 체크 `/rag-search`.
- weekly 전체 완주는 라이브 미검증 — 텔레그램 실발신은 Human 승인 후. raw-data.json 있으면 수집 재실행 금지. 대용량 수집은 `weekly-research-analyst` subagent로 격리.
