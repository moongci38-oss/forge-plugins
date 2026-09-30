---
name: daily-system-review
description: "매일 AI·에이전트 업계 변화를 가볍게 훑어 Critical·Breaking·Deprecated·보안만 골라 알린다. 쓸 때: 사용자가 /daily-system-review 를 부르거나 일일 스케줄이 돌 때. SKIP: 심층 분석(→ /weekly-research), 수집만 끝난 날 재분석(→ /daily-analyze)."
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

**역할**: 6-Tier 소스에서 AI/Agentic 동향을 매일 경량 스캔하고 핵심 변동만 분석하는 모니터링 전문가. `/daily-system-review` 또는 cron 실행. **출력**: §산출물 파일 저장이 정본. 발행은 `report-site-cron.sh`(매시 :25)가 자동 — 즉시 발행은 `/forge-publish-report`, URL `https://forge-reports.pages.dev/<kind>/<slug>/`. ⚠️ Artifact 도구 호출 금지.
**컨텍스트**: 매일 자동 실행되거나 `/daily-system-review` 호출 시 실행됩니다.

## ⛔ 우리 하네스 상태를 쓸 때 (CRITICAL)
- "우리 시스템은 이렇다"는 `harness_probe()` 출력을 인용한다. 실행하지 않은 명령·결과를 지어내지 않는다(클라우드 실행 시 `~/forge` 밖 읽기·임의 셸 없음).
- 답 못 하는 항목은 `측정 불가(도구 없음)` — "없음"·"미설정" 단정 금지. 부재 주장은 측정 명령 동반(`dev-workflow-rules.md`), 못 대면 넣지 않는다.

## 인자·산출물
`{date}` = `$ARGUMENTS` 그대로(Current date는 참고용 — 파일명에 today 금지). 미입력 시 `date -d yesterday`. `BASE=${FORGE_OUTPUTS:-$HOME/forge-outputs}`, 경로는 `01-research/daily/{date}/`만(`docs/reviews/` 등 신규 생성 금지).
- `ai-system-analysis.md`(분석 리포트) · `dashboard.html`(Wave 2.7)
- 소스 6-Tier(공식·GitHub·커뮤니티·YouTube·학술·산업/미디어) 목록 → `reference/source-tiers.md` Read.

## 실행 흐름
**완결성 게이트(WARN, 진행 안 막음)**: `for d in 01-research/daily/*/; do [ -f "$d/raw-data.json" ] && [ ! -f "$d/ai-system-analysis.md" ] && echo "WARN 미분석: $d"; done`
**Wave 0** — `Glob("01-research/daily/{date}/raw-data.json")`.
- 존재(cron 정상 경로) → 수집 스킵, `/daily-analyze {date}` 흐름(raw-data + 검색 보강 → `daily-system-analyst` 스폰, `.claude/skills/daily-analyze/SKILL.md`).
- 미존재 → Wave 1부터.

**Workflow 분기** — 기본: `Workflow({ script: Bash("cat ~/.claude/skills/daily-system-review/workflow.js") })`. `CLAUDE_CODE_DISABLE_WORKFLOWS=1` 또는 실패 시 아래 Wave 1~4 직접 실행.
**Wave 1 (병렬 5 스폰)** — 검색은 `tavily_search` 1순위 · 실패 시 `brave_web_search`. 각자 구조화 요약을 Lead에 반환.
- **A (Sonnet)** Tier 1(공식 13곳, WebFetch 직접) + Tier 2(GitHub 릴리즈·트렌딩), 전날 신규만, `site:anthropic.com` 등 도메인 필터.
- **B (Haiku)** Tier 3(HN·Reddit·X·Discord) + Tier 6(TechCrunch·VentureBeat·Product Hunt), 날짜 전날~오늘.
- **C (Haiku)** Tier 4 YouTube: 채널별 최신·키워드, 제목·URL·요약·반응, 심층 필요 영상은 "추천 시청".
- **D (Haiku)** Tier 5(academic-researcher): arXiv 전날(cs.AI·CL·SE·MA) + Papers With Code 트렌딩 → Top 5.
- **E (Sonnet) 우리 시스템 스냅샷** — 모든 상태 claim은 실측 인용(`ls ~/.claude/hooks/ | grep {name}`·`ls ~/.claude/skills/{name}/SKILL.md`·`grep {hook-name} ~/.claude/settings.json`·`grep {pattern} ~/forge/.claude/rules/`·`find ... | wc -l`), handover 수치 인용 금지, 실측 없으면 `⚠️ [미확인]`.
  - Read: `~/.claude/forge/rules/`·`~/.claude/rules/`·`.claude/skills/`·`.claude/agents/`·`.claude/rules/`·최근 improvement plan
  - Forge: `forge-workspace.json`(활성 프로젝트·folderMap) → 각 `gate-log.md`(S1~S4) · `02-product/todo.md`
  - Dev: Glob `**/.claude/state/sessions/*.json` · `docs/walkthroughs/` · `.specify/config.json`
  - 출력 JSON(게이트·세션·인프라) → Lead의 GTC-3 입력(`daily-system-analyst.md` Step 3.5).
- ~~F 주식 브리핑~~ — 주식 브리핑 단계는 뺐다 — 사람이 `stock-research-analyst` 를 지정 삭제했다(#1374 · #1513, 원본 삭제는 되돌리지 않는다).

**Wave 2 (Lead 종합)** — `ai-system-analysis.md` 작성(Executive Summary·업계 변화·우리 시스템 현황·1:1 비교·갭·추천·출처). 구조는 `reference/wave2-templates.md` 그대로.
- 갭마다 ACHCE 5축(A/C/H/C/E) 분류. `verify_cmd` 없거나 `verify_out` 빈 제안 금지. 갭은 사실만(적용 계획서 작성 안 함).
- spot-check: Critical/Breaking 판정 주장은 표본 3건+ 원출처 직접 재확인, "Deprecated·지원 중단" 주장은 공식 changelog 직접 확인. 워커 판정 라벨 그대로 옮기지 않음.
- 이월: `carry_count >= 2` → `~/forge/shared/scripts/dsr-verify-run.sh "<verify_cmd>"` 재실행, 해소됐으면 자동 종결("해소됨"). `carry_count >= 3` 또는 `owner: human` → `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/human-queue.md`에 append + `[STOP]` 표기 후 제외(삭제 금지).

**Wave 2.5~2.55** — `reference/wave25-adversarial.md` Read(Evaluator 프롬프트·배점·cr-triple 규약).
- 2.5(차단): 독립 Evaluator 70점 PASS. FAIL → 보완 후 1회 재실행, **2회 연속 FAIL 시 [STOP] Human 에스컬레이션**. `codex-critic` 미가용 = SKIP(FAIL 아님) → 진행하되 리포트 말미·대시보드 상단·index.json에 `교차 검증 미실시(Evaluator SKIP)` 표기, ⛔ PASS로 기록 금지.
- 2.55(비차단): `ai-system-analysis.md`에 cr-triple 2벤더 2레그. 지적은 말미 `## 검수 지적`, [STOP] 없음. `content_integrity=lost`·`INVALID_INPUT` = 미수행 → 쪼개 재호출. `concept-notes-writer` 스폰 금지.

**Wave 2.7 대시보드** (PASS 또는 SKIP 후)
```bash
DATE={date}; BASE="${FORGE_OUTPUTS:-$HOME/forge-outputs}"
python3 ~/forge/shared/scripts/report_to_html.py "${BASE}/01-research/daily/${DATE}/dashboard.html" \
  --title "Daily System Review — ${DATE}" --subtitle "AI 시스템 분석 + 적용 계획" "${BASE}/01-research/daily/${DATE}/ai-system-analysis.md"
```
**Wave 2.9 완료 게이트 (인덱스·완료 선언 이전 필수)**
`bash ~/forge/shared/scripts/verify-outputs.sh "${BASE}/01-research/daily/${DATE}/ai-system-analysis.md" "${BASE}/01-research/daily/${DATE}/dashboard.html"` — 출력 표를 보고에 그대로. exit 2면 인덱스·완료 선언 금지, 재생성 후 exit 0 확인.
**Wave 2.95 갭·액션 개수 (스크립트가 센다)**
```bash
python3 ~/forge/shared/scripts/daily-triage-lint.py --analysis "${BASE}/01-research/daily/${DATE}/ai-system-analysis.md" --plan "${BASE}/01-research/daily/${DATE}/system-improvement-plan.md" --contract
```
판정은 출력 JSON `counts`·`contract.violations`로(판정표 정본 `daily-analyze/SKILL.md` Step 4.95). 본문을 고쳤으면 Wave 2.7·2.9 재실행 후 진행.
**Wave 3.5 index.json** (Write 직접 수정 금지, 값 없는 파일 키 생략, fail-open)
```bash
echo '{"date":"{date}","title":"{date} AI 시스템 분석","critical_gaps":<counts.critical_gaps>,"high_gaps":<counts.high_gaps>,"medium_gaps":<counts.medium_gaps>,"p0_actions":<counts.p0_actions>,"p1_actions":<counts.p1_actions>,"files":{"ai_system_analysis":"01-research/daily/{date}/ai-system-analysis.md"},"notion_upload":"{Wave 3 결과}"}' \
  | python3 ~/forge/shared/scripts/daily-review/append_index_record.py
```
`notion_upload` 키는 `shared/scripts/weekly-index-register.py` 호환용으로 유지.
**Wave 3.6 wiki-sync** — `FORGE_WIKI_AUTOSYNC=off`면 스킵, 아니면 `Skill(skill="wiki-sync", args="--auto")`. 항상 `[wiki-sync] N건 wiki화 (신규 M / 업데이트 K, pending-review P건)` 출력. 실패 시 `[wiki-sync] 실패: {사유} — daily 파이프라인은 계속 진행` 후 Wave 4.
**Wave 4** — `Read("01-research/daily/{date}/ai-system-analysis.md")` → `===== AI 시스템 분석 리포트 ({date}) =====` 머리 뒤 전체 출력.

## 신뢰도 표기 (두 축)
- 소스: `[신뢰도: High]` Tier 1·다중 교차 · `[신뢰도: Medium]` 단일 신뢰(Tier 2-3)·커뮤니티 합의 · `[신뢰도: Low]` 비공식·루머·AI 추정 / 직접 열람: `[실측]` · `[스니펫]`(reddit 기본) · `[전언]`. daily는 뉴스가 정당한 1차 입력(`/forge-find-item` 거래 시장 원칙 미적용).

## 주간·상시 감사 (WARN-only, daily를 막지 않음)
- Constraint drift: `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/override-rate-trend.py"` → rc 0 OK · 1 WARN · 3 표본 부족 · 2 판정 불가. 신 형식(total_gates·rubber_stamps)만 지표, 구 형식 줄은 `skipped_legacy=N` 으로만 보고. 상세 `~/.claude/rules-on-demand/constraint-drift-audit.md`.
- Redundancy(주 1회): `reference/redundancy-scan.md` 명령 → `01-research/daily/{date}/redundancy-scan.json`, 이상 시 분석 리포트에 "Redundancy 섹션".
- description 예산: `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/skill-desc-budget.sh"` → 초과 목록을 Redundancy 섹션에. `SKIP:`을 0건으로 적지 않는다.
- 지난 달 사용 0회 스킬(검토 후보, 삭제 근거 아님):
```bash
if [ ! -d ~/.claude/projects ] || ! find ~/.claude/projects -name '*.jsonl' -mtime -30 -print -quit 2>/dev/null | grep -q .; then
  echo '지난 달 사용 0회: 측정 불가 — 신호원(~/.claude/projects/**/*.jsonl) 없음'
else
  find ~/.claude/projects -name '*.jsonl' -mtime -30 -print0 | xargs -0 grep -hoa '"skill":"[A-Za-z0-9:/._-]*"' 2>/dev/null \
    | sed 's/.*:"//;s/"//' | sort -u > /tmp/dsr-skills-used.txt
  ls -1 "${FORGE_ROOT:-$HOME/forge}/.claude/skills" | sort > /tmp/dsr-skills-all.txt
  comm -23 /tmp/dsr-skills-all.txt /tmp/dsr-skills-used.txt
fi
```
  출력: `지난 달 사용 0회: <이름1>, <이름2>, …` (N개) / `지난 달 사용 0회: 0건` / 신호원 없음은 위 `측정 불가` 줄 — 측정 불가를 0건으로 적지 않는다.

## Gotchas
- `claude -p` 하위 호출의 침묵 실패를 성공으로 보고하지 말 것 — 스텝 exit·출력을 검사한다. 텔레메트리 표본 0 = "미사용"이 아니라 emit 지점 부재부터 의심.
