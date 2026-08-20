---
name: weekly-research
description: >
  매주 실행하는 주간 리서치 파이프라인. 기술 뉴스, 비즈니스 뉴스,
  사업 아이템 제안 3종을 Subagent 병렬로 생성한다.
argument-hint: "[YYYY-MM-DD]"
disable-model-invocation: true
context: fork
agent: general-purpose
allowed-tools: Agent, Bash, WebSearch, WebFetch, Write, Read, Glob, Grep, mcp__brave-search__brave_web_search, mcp__notion__notion-create-pages
model: sonnet
---

**역할**: 당신은 매주 기술·비즈니스 뉴스를 수집하고 사업 아이템을 제안하는 주간 리서치 전문가입니다.
**컨텍스트**: 매주 자동 실행되거나 `/weekly-research` 호출 시 실행됩니다.
<!-- root-cause(2026-08-10): 이 줄이 "파일 저장 불필요"라고 지시했으나, 아래 §산출물이 요구하는
     `01-research/weekly/{date}/` 파일 저장을 전제로 후속 단계(Wave 0.5 carryover 수집, 대시보드
     생성, 텔레그램 발송, 아티팩트 발행)가 전부 동작한다 — 지시대로 따르면 파이프라인이 끊긴다.
     같은 결함을 article·daily-system-review 는 2026-08-03 에 정정했고 yt·weekly-research 두 곳이
     남아 있었다(2026-08-10 실측 `grep -rn "파일 저장 불필요" ${FORGE_ROOT:-$HOME/forge}/.claude/skills/` → 2건,
     둘 다 이번에 함께 정정). "파일 저장=정본, Artifact=파생"으로 단일화.
     ⚠️ 아래 "Artifact XML"은 claude.ai 아티팩트가 **아니다** — stdout 표시용 `<artifact>` 태그일 뿐
     공유 URL이 생기지 않는다. 이름이 같아 "발행됐다"고 오독하기 쉽다. 실제 발행은 대화형 세션의
     `/forge-publish-report` 가 하며 헤드리스에서는 불가능하다(Artifact 도구 부재 — L-68). -->
**출력 형식**: §산출물대로 **파일 저장이 정본**입니다. Artifact XML 발행은 저장 후 선택적 파생 출력(stdout 표시용)이며 파일 저장을 대체하지 않습니다.
  - `report-formatter.mjs`의 `formatAsArtifact(title, content, 'markdown', id, true)` 사용
  - `stripFirstHeading: true` 옵션으로 첫 # 제목 자동 제거

# 주간 리서치 파이프라인

> Forge S1 정기 리서치 채널. 3개 산출물을 Subagent 병렬로 생성한다.

## ⛔ 우리 하네스 상태를 쓸 때 (CRITICAL — 2026-08-14 실사고)

**"우리 시스템은 지금 이렇다"고 쓰려면 `harness_probe()` 를 호출하고 그 출력을 인용한다.**

쉽게 말하면: **없는 폴더를 뒤져놓고 "양말이 없네"라고 말하지 않는다.**

- 이 스킬은 **Managed Agent(클라우드)** 로도 실행된다. 그때 우리 머신에 대해 쓸 수 있는 도구는
  `forge-outputs` 안 파일읽기 + 허용 스크립트 몇 개 + `harness_probe()` 뿐이다.
  **임의 셸 명령·`${FORGE_ROOT:-$HOME/forge}` 밖 파일읽기·프로세스 조회는 존재하지 않는다.**
- **실행하지 않은 명령을 근거로 적지 않는다.** 명령과 결과를 지어내면 리포트 전체가 무효다.
- `harness_probe()` 가 답하지 못하는 항목은 **`측정 불가(도구 없음)`** 로 적는다 —
  **못 본 것과 없는 것은 다르다.** "없음"·"미설정"으로 단정하지 않는다.
- 우리 시스템과의 비교(§코드/설정 레벨 대조)는 이 규약이 특히 강하게 적용된다.

근거: 2026-08-14 — 같은 계열 경로의 리포트가 `.env` 에 실재하는 DB 설정 6건을 "없음"으로,
정상 가동 중인 공용 DB(pages 13,546건)를 "미완성"으로 단정했다.
폐기조건: `harness_probe()` 가 임의 측정까지 대신하게 되면 이 절의 "측정 불가" 규약을 재검토한다.

## 인자

- `$ARGUMENTS` = 리포트 기준 날짜 (YYYY-MM-DD). 미입력 시 오늘 날짜 사용.

## 산출물 (6종)

| # | 문서 | 저장 위치 | 파일명 |
|:-:|------|----------|--------|
| 1 | 일반 기술 뉴스 | `01-research/weekly/{date}/` | `tech-trends.md` |
| 2 | 비즈니스 뉴스 | `01-research/weekly/{date}/` | `biz-trends.md` |
| 3 | 사업 아이템 제안 | `01-research/projects/{project}/` | `{date}-s1-research.md` |
| 4 | HTML 대시보드 | `01-research/weekly/{date}/` | `dashboard.html` (Wave 2.7) |
| 5 | 관심종목 브리핑 (weekly=심층) | `01-research/weekly/{date}/` | `stock-trends.md` (워치리스트 없으면 skip, fail-open) |
| 6 | 학습노트 | `01-research/weekly/{date}/` | `study-notes.md` (핵심 개념 0건이면 skip) |

### index.json `files` 스키마 (additive)

Publish 단계에서 갱신하는 `01-research/weekly/index.json`의 `files` 객체는 기존 키(`tech_trends`/`biz_trends`/`dashboard`/`s1_research` 등)를 유지한 채 아래 2키를 **추가**한다. 값이 없으면(skip) 키 자체를 생략한다 — null 채움 금지:

```json
{
  "files": {
    "stock_brief": "01-research/weekly/{date}/stock-trends.md",
    "study_notes": "01-research/weekly/{date}/study-notes.md"
  }
}
```

## 실행 흐름

### Wave 0 (raw-data.json 존재 확인 — 최우선)

```
# cr-final pr267-chunk4(MEDIUM): 종전 상대경로는 cwd 가 FORGE_OUTPUTS 가 아니면 Wave 1.2 가
# 절대경로로 저장한 파일을 못 찾았다(HG-3 미봉합 경로) — 저장측과 같은 절대경로로 정합.
RAW_JSON="${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/{date}/raw-data.json"
```

`Glob(RAW_JSON)` 으로 파일 존재 여부 확인:

- **존재 → 수집 스킵**: `/weekly-analyze {date}` 흐름으로 전환한다.
  Wave 1 수집 Subagent(A/B) 스폰을 건너뛰고,
  raw-data.json + Claude 검색 보강 → `weekly-research-analyst` 에이전트 스폰 순서로 진행한다.
  (상세: `.claude/skills/weekly-analyze/SKILL.md` 참조)

- **미존재 → 전체 파이프라인 실행**: 아래 Wave 1부터 정상 진행한다.

---

### Wave 0.5 (Daily 이관 항목 수집 — Wave 0 후, Wave 1 전)

> daily-system-analyst가 매일 `system-improvement-plan.md`에 남기는 `## Weekly 이관 항목`(P1/P2 개선기회, GTC-4 미통과 항목)을
> 결정론 Bash로 이번 주(기준일 D 직전 7일, D 포함) 범위만 흡수해 `carryover-items.md`로 canonical화한다.
> 산출물은 이후 Wave 1 Subagent A/B/C 스폰 프롬프트와 `weekly-research-analyst`(Step 1)가 읽는다.

```bash
# 기준일(D) 직전 7일간 daily 계획서의 "Weekly 이관 항목" 흡수 → carryover-items.md
DATE="$ARGUMENTS"                       # 기준 날짜 YYYY-MM-DD
OUT="${FORGE_OUTPUTS:-$HOME/forge-outputs}"
if [ -z "$DATE" ]; then
  echo "[weekly Wave0.5] DATE 미지정 — carryover 수집 스킵(fail-open)"
else
  WK="$OUT/01-research/weekly/$DATE"; mkdir -p "$WK"
  CARRY="$WK/carryover-items.md"
  # 윈도 시작(D-6). date 실패 시 START="" → 하한 필터 비활성(DATE 이하 전체 수집)으로 폴백한다.
  # (1일 윈도로 축소 = carryover 파일은 생기는데 거의 비어 analyst fallback도 막혀 '조용한 이관 소실'이 되므로 금지.)
  START="$(date -d "$DATE - 6 days" +%F 2>/dev/null || true)"
  [ -z "$START" ] && echo "[weekly Wave0.5] WARN: 날짜 계산 실패 — 하한 필터 없이 DATE 이하 전체 수집(누락 방지)"
  : > "$CARRY"; n=0
  for plan in "$OUT"/01-research/daily/*/system-improvement-plan.md; do
    [ -r "$plan" ] || continue
    d="$(basename "$(dirname "$plan")")"
    # 엄격 YYYY-MM-DD 디렉토리만(접미 붙은 dir 오포함 방지)
    printf '%s' "$d" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || continue
    # ISO 날짜 사전순 = 시간순. 미래(>DATE) 항상 제외 + START 있을 때만 하한(<START) 제외.
    [ "$DATE" \< "$d" ] && continue
    [ -n "$START" ] && [ "$d" \< "$START" ] && continue
    # 헤더(가변 suffix 허용, 단 "이관 항목" 뒤 경계=공백/괄호/EOL 요구 — 부정형 헤더 오매칭 방지)~다음 ## 까지
    sec="$(awk '/^## Weekly (심층 분석 )?이관 항목([ (]|$)/{c=1;print "### 출처: '"$d"'";next} c&&/^## /{c=0} c{print}' "$plan")"
    # 실제 항목(- / * / 숫자.)이 있을 때만 채택(빈 섹션 스킵)
    if printf '%s' "$sec" | grep -qE '^[[:space:]]*([-*]|[0-9]+\.)'; then
      printf '%s\n\n' "$sec" >> "$CARRY"; n=$((n+1))
    fi
  done
  echo "[weekly Wave0.5] carryover: ${n}개 daily에서 이관항목 수집 → $CARRY"
fi
```

- **fail-open**: DATE 미지정·carryover 0건·날짜계산 실패여도 파이프라인은 정상 진행(STOP 금지). 날짜계산 실패 시 윈도를 1일로 축소하지 않고 **전체 수집으로 확대**해 조용한 이관 소실을 막는다.
- **윈도(대략적 비중첩)**: 7일 윈도(`START`~`DATE`)는 **주간 실행을 가정한 근사 비중첩**이다 — weekly 실행 간격이 7일 미만이면 경계 daily가 인접 weekly에 중복 반영될 수 있다(불변식 아님, dedup 미구현). 정확한 1회 소비가 필요해지면 daily에 소비 마커를 남기는 방식으로 후속 강화.
- **단일 수집자**: 이 Wave가 `carryover-items.md`를 만드는 **유일한 결정론 수집 단계**다. Wave 1(전체 파이프라인 분기)과 analyst Step 1(raw-data 존재 분기)은 **상호 배타적 브랜치**이며, 각자 이 파일을 **읽기만** 하고 daily glob을 재실행하지 않는다(재수집 금지 — 단, md 지시 수준의 계약이며 코드 강제는 아님).

---

### Workflow 분기 (Wave 1 전 — 계획서 P0-2)

```bash
# CLAUDE_CODE_DISABLE_WORKFLOWS=1 이면 Agent Teams 모드(아래 Wave 1~3 직접 실행)
# 미설정(기본) 이면 Workflow 실행 → resume/격리/adversarial 2x 자동
```

**Workflow 실행 (권장)**:
```js
Workflow({ script: Bash("cat $HOME/.claude/skills/weekly-research/workflow.js") })
```

**Agent Teams fallback** (`CLAUDE_CODE_DISABLE_WORKFLOWS=1` 또는 Workflow 실패 시): 아래 Wave 1~3 직접 실행.

---

### Wave 1 (Subagent 병렬 — 3개 동시 스폰)

Agent 도구로 3개 Subagent를 동시에 스폰한다. 의존성이 없으므로 단일 메시지에서 병렬 호출한다.

> **Wave 0.5 산출물 반영**: `${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/{date}/carryover-items.md`(Wave 0.5 결과, 있고 비어있지 않으면)를 스폰 프롬프트에 "지난주 daily 이관 항목을 이번 주 수집·심층분석에 우선 반영하라"는 지시와 함께 Read 대상으로 포함한다.

**Subagent A (model: haiku): 일반 기술 뉴스 수집**

프롬프트에 아래를 포함하여 스폰:
- 분석 기준 날짜: `$ARGUMENTS`
- WebSearch: 최근 7일 AI/게임/웹 개발 뉴스
- **Brave Search 활용**: 공식 소스 우선 검색 시 `brave_web_search` 사용 (도메인 필터 예: `site:anthropic.com`, `site:openai.com`)
- **필수 확인 소스** (WebFetch 직접 접속):
  - `https://www.anthropic.com/news` — Anthropic 공식 뉴스/블로그
  - `https://docs.anthropic.com/en/docs/changelog` — Claude API 변경 로그
  - `https://www.anthropic.com/engineering` — 엔지니어링 블로그
  - `https://semianalysis.com` — AI 하드웨어 인프라 심층 분석 (GPU/TPU/데이터센터, 유료 게이트 시 요약만)
  - `https://epochai.org/blog` — AI 역량 추세 + 컴퓨팅 인프라 연구 (오픈 리서치)
- 3개 카테고리별 뉴스 + 신뢰도 표기 + 출처 + 액션 아이템
- 파일 직접 저장: `01-research/weekly/{date}/tech-trends.md`
- 저장 완료 후 종료

**Subagent B (model: haiku): 비즈니스 뉴스 수집**

프롬프트에 아래를 포함하여 스폰:
- 분석 기준 날짜: `$ARGUMENTS`
- WebSearch: SaaS/스타트업, 인디해커/1인기업, Product Hunt
- **Brave Search 활용**: `brave_web_search`로 SaaS/스타트업 동향 검색. 예: `site:indiehackers.com`, `site:producthunt.com`, `site:techcrunch.com SaaS 2026`
- 시장 동향 + 과금 모델 변화 + 성공 사례 + 액션 아이템
- 파일 직접 저장: `01-research/weekly/{date}/biz-trends.md`
- 저장 완료 후 종료

**Subagent C (model: sonnet): 사업 아이템 조사 + 분석**

프롬프트에 아래를 포함하여 스폰:
- 분석 기준 날짜: `$ARGUMENTS`
- **거래 시장 우선 (2026-08-19 Human 지시 — `/forge-find-item §제1원칙` 이식)**: 아이템은 **실제 거래가 일어나는 시장**에서 찾는다. **마켓 표면 체크리스트**(Play·App Store·Chrome·Shopify·WordPress·AppSumo·Product Hunt·업무툴 마켓·각국 로컬 스토어) 중 카테고리 해당 **3개+ 실제 조회**하고, 못 뒤진 표면은 `미조회(사유)`로 적는다. **어느 국가 스토어를 봤는지 명시**. 정본 표 → `$HOME/.claude/commands/forge-find-item.md §마켓 표면 체크리스트`
- **거래 실증이 후보 입장권**: 가격 + 거래량 근사치(설치 수·리뷰 수·LTD 판매·랭킹) 중 **2개 이상을 마켓 리스팅에서 직접 실측(A등급)**하지 못한 아이템은 최종 선정 후보에 올리지 않는다.
- ⛔ **기사·뉴스·리스티클은 아이템 근거 불인정** — 배경 맥락까지만. 기사에서 힌트를 얻었으면 **그 제품의 마켓 리스팅·리뷰로 내려가** 1·2차 증거를 직접 확보한 뒤 후보로 세운다(`§소스 우선순위`).
- WebSearch/`brave_web_search`: 마켓 리스팅·리뷰 우선(`site:apps.shopify.com`, `site:play.google.com`, `site:appsumo.com`), 통증은 `site:reddit.com` 반복 스레드로 보완
- ⛔ **TAM/SAM/SOM 금지** — `/forge-find-item §금지 사항`("광고비 0에서 무의미")과 정면 충돌하던 구 지시를 2026-08-19 제거했다. 대신 **JTBD → 경쟁 3 비교 → Moat 4종 중 1+ → MVP wedge → 거래 실증 기반 매출 산술**(단가 × 필요 고객 수, 최소 조합 명시)로 쓴다.
- Forge S1 방법론 적용: 경쟁 가설 3개 → 위 항목들 → 최종 1개 선정
- 실행 로드맵 (MVP, 기술 스택, 타임라인)
- 선정 기준: **1인 개발자가 내달 1,000만원+ 수익 달성 가능성**
- 프로젝트명 자동 결정 → `forge-workspace.json` 등록 확인
- 파일 직접 저장: `01-research/projects/{project}/{date}-s1-research.md`
- `gate-log.md`에 S1 PASS 기록
- 저장 완료 후 종료

**Subagent D (model: sonnet, agentType: `stock-research-analyst`): 관심종목 리서치 (weekly=심층)**

프롬프트에 아래를 포함하여 스폰:
- 분석 기준 날짜: `$ARGUMENTS`, `mode: weekly`(종목당 3~5줄 + 섹터 시황 한 단락 — daily 1~2줄과 구분)
- 입력: `${FORGE_ROOT:-$HOME/forge}/.claude/config/stock-watchlist.json` (에이전트가 직접 Read — 절대경로. 상대경로는 cwd 에 따라 조용히 skip 된다). **워치리스트 없거나 빈 배열이면 탐색한 절대경로를 병기해 skip 반환 — fail-open, 파이프라인 중단 금지**
- 투자자문 아님 배너 최상단 고정 + 출처·일자 병기 + 상충 항목 별도 기록(에이전트 자체 가드레일, `agents/stock-research-analyst.md` 참조)
- 파일 직접 저장: `01-research/weekly/{date}/stock-trends.md` (skip 시 파일 생성 생략)
- 저장 완료 후 종료

### Wave 1.2 (raw-data.json 영속화 — Wave 1 완료 직후, Wave 1.5 이전)

> **HG-3(2026-07-23 cr-triple corpus review)**: weekly `raw-data.json`이 22개 폴더 중 21개에서
> 부재해 `/weekly-analyze` 재분석 진입점이 사실상 작동 불능이었다. Wave 0가 raw-data.json 존재를
> 전제로 재분석 분기를 타는데, Wave 1이 그 파일을 실제로 만든 적이 없었던 게 원인이다.
> 재현: `find ${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly -mindepth 2 -iname raw-data.json | wc -l`

Wave 1의 4개 Subagent(A/B/C/D) 프롬프트에 아래를 추가 지시한다 — 최종 리포트(md) 저장과 별도로,
**수집한 원시 소스 목록**(검색 쿼리, 방문 URL, 제목, 발행일, 신뢰도 판단 근거)을 반환값에 포함해 Lead에게
전달할 것.

Wave 1의 4개 Subagent가 모두 완료되면 Lead가 그 원시 소스 목록을 취합해 아래 스키마로 저장한다:

```json
{
  "schema_version": "1.0",
  "pipeline": "weekly-research",
  "source": "wave1-agent-collected",
  "target_date": "{date}",
  "collected_at": "{ISO8601 UTC}",
  "stats": { "tech_items": 0, "biz_items": 0, "s1_sources": 0, "stock_items": 0, "total": 0 },
  "items": [
    { "category": "tech|biz|s1|stock", "title": "...", "url": "...", "published": "YYYY-MM-DD|unknown", "confidence": "High|Medium|Low" }
  ],
  "claude_search_needed": []
}
```

저장 위치(절대경로 고정 — 상대경로 금지): `${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/{date}/raw-data.json`

> ⚠️ **생산자 2원화 주의(cr-final pr267-chunk4)**: 같은 경로에 `collector.py`(run.sh Step 1)도 쓰는데
> 그쪽 스키마는 stats 키·category 열거값·필드셋이 이것과 **다르다**(둘 다 "1.0" 자칭). 소비자는 버전이
> 아니라 **`source` 필드로 생산자를 구별**할 것(`wave1-agent-collected` = 이 스키마). collector.py 정비
> (스키마 통일 + 오착지 수정)는 별건 갭 SF-3(`2026-08-15-w1w2-apply-side-findings-harness-gaps.md`) 소관.

- **이미 존재하면 덮어쓰지 않는다** — `run.sh` Step 1(`collector.py`)이 먼저 저장했을 수 있다(Wave 0가
  이미 그 존재를 확인했을 것이므로, 이 Wave까지 왔다는 것은 대개 미존재를 뜻한다. 그래도 착수 직전에
  한 번 더 `Glob` 확인 후 존재하면 스킵).
- **fail-open**: 이 스텝 실패는 파이프라인을 막지 않는다(WARN 1줄 후 Wave 1.5로 계속 진행) — raw-data.json은
  재분석 편의를 위한 부산물이지 §산출물의 6종 필수 산출물이 아니다.
- 목적: `/weekly-analyze {date}`가 이 파일을 읽어 수집을 재실행하지 않고 분석만 재개할 수 있게 한다.

### Wave 1.5 (커버리지 게이트 — Wave 1 완료 후, Wave 2 이전)

> **(e) coverage loop** — deep-research 메커니즘. **cap 2라운드**, 무한루프 금지.
> 소스 카운트뿐 아니라 **소스 모달리티별 커버리지** 체크 추가: 논문/repo/news 각 최소 1건.

Wave 1 완료 후 각 토픽(`tech-trends.md`, `biz-trends.md`)을 Read하여 두 가지 기준을 확인한다.

**판정 기준 (completeness critic)**:

| 체크 | 조건 | 재검색 트리거 |
|------|------|-------------|
| 신뢰도 카운트 | High+Medium 소스 < 2건 | 해당 토픽 재검색 |
| 소스 모달리티 | 논문·연구보고서 0건 | arxiv·연구소 사이트 타겟 재검색 |
| 소스 모달리티 | 오픈소스 레포/GitHub 링크 0건 | GitHub·패키지 사이트 타겟 재검색 |
| 소스 모달리티 | 뉴스·블로그 기사 0건 | 뉴스 미디어 타겟 재검색 |
| **마켓 표면**(2026-08-19 신설 — **`biz-trends.md`·사업 아이템 산출물에만 적용**) | 마켓 리스팅(가격·리뷰수·설치수) 직접 실측 **0건** | 마켓 표면 체크리스트 3개+ 타겟 재검색 |

> ⚠️ **마켓 표면 행의 적용 범위**: `tech-trends.md`·논문·모델 뉴스에는 **적용하지 않는다**(그쪽은 뉴스가 정당한 소스다). **아이템·수익화 판단이 걸린 산출물에만** 건다 — 거기서만 "기사 말고 거래 시장" 원칙이 유효하기 때문이다. 근거: 2026-08-19 Human 지시 + idea-hunt 실측(앱마켓 미조회 상태로 타깃 발굴 완료 보고될 뻔함). 폐기조건: 아이템 산출물이 weekly 에서 분리되면 이 행을 그 파이프라인으로 옮긴다.

**재검색 절차 (cap 2라운드)**:

```
Round 1:
  - 신뢰도 < 2 → 해당 토픽 전체 재검색
  - 모달리티 미달 → 미달 모달리티 타겟 재검색 (예: "논문 0건이면 arxiv만 재검색")
  → 파일 추가 업데이트 후 Round 2 판정

Round 2:
  - 동일 기준 재확인
  - 미달 잔존 시 → [신뢰도 낮음] 플래그 추가 후 Wave 2 진행 (차단 X)
```

**[신뢰도 낮음] 플래그** (2라운드 후에도 모달리티 미달인 섹션에 삽입):
```markdown
> [신뢰도 낮음] 논문/repo/news 중 일부 모달리티 미수집 — 정보의 다양성이 제한될 수 있습니다.
```

**completeness critic 1줄 출력** (Wave 2 취합 보고에 포함):
```
커버리지 결과: tech-trends [논문:O/repo:X/news:O → round1재검색] biz-trends [논문:O/repo:O/news:O → OK]
```

> 이 게이트는 Wave 2.5 FAIL→retry 메커니즘의 수집 단계 확장판이다. research-verification-protocol.md §coverage-loop 참조.

---

### Wave 2 (Lead 취합 — Wave 1.5 완료 후)

3개 Subagent 완료 확인 후:
1. 3종 파일 존재 여부를 실행 커맨드로 확인 (서술형 확인 금지):
   ```bash
   bash ${FORGE_ROOT:-$HOME/forge}/shared/scripts/verify-outputs.sh \
     "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/{date}/tech-trends.md" \
     "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/{date}/biz-trends.md" \
     "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/projects/{project}/{date}-s1-research.md"
   # 인자는 **절대경로**여야 한다 — 상대경로는 cwd 기준으로 해석돼 실재하는 파일도 ❌MISSING 으로
   # 나오고, 그러면 3항(재스폰)이 발동해 멀쩡한 워커 3개를 매번 다시 돌린다(2026-08-10 실측).
   # 조건부 산출물(stock-trends.md · 학습노트)은 **생성했을 때만** 인자에 추가한다.
   ```
   출력 표를 그대로 취합 보고에 사용. exit 2(MISSING/0바이트)면 해당 항목을 "완료"로 보고하지 않는다.
2. 주간 요약 보고: 파일 경로, 사업 아이템 제목, 신뢰도 분포
3. 누락 파일 있으면 해당 Subagent 재스폰 후 재검증
4. `stock-trends.md`는 **선택 산출물**(fail-open) — 존재하면 요약에 포함, skip이면 "주식 섹션: 워치리스트 없음"만 1줄 기록하고 계속 진행(재스폰 X, Evaluator FAIL 사유 아님).

---

### Wave 2.5 (독립 Evaluator subagent — Wave 2 완료 후, Wave 3 이전)

> **핵심 원칙: Lead의 컨텍스트(의도, 가정)를 공유하지 않는 별도 에이전트가 검증한다.**
> Wave 2 Lead 취합 완료 직후, Wave 3(Notion 등록 + 블로그 발행) 진행 전에 반드시 실행한다.

```
subagent_type: general-purpose
model: sonnet
```

**입력 파일 (직접 Read)**:
- `01-research/weekly/{date}/tech-trends.md`
- `01-research/weekly/{date}/biz-trends.md`
- `01-research/projects/{project}/{date}-s1-research.md`

**Rubric (100점 만점)**:

| 항목 | 가중치 | 불합격 기준 |
|------|:------:|-----------|
| 소스 커버리지 | 40% | 3종 파일 중 누락 1개 이상이면 즉시 FAIL; 필수 소스(Anthropic, Brave) 미참조 시 0점 |
| 인사이트 품질 | 30% | 뉴스 나열만 있고 "우리에게 주는 시사점" 없으면 0점 |
| 사업 아이템 완성도 | 20% | **JTBD 누락 시 감점 · 거래 실증(가격 + 거래량 근사치 중 2개, 마켓 리스팅 직접 실측) 누락 시 감점 · 마켓 표면 조회 원장 누락 시 감점**. ⛔ TAM/SAM/SOM 은 채점 대상이 아니다(2026-08-19 제거 — 있으면 감점도 가점도 없음) |
| 액션 실현 가능성 | 10% | 액션 아이템 없거나 모호하면 감점 |

**PASS 기준**: 70점 이상.

**FAIL 처리**: Evaluator가 감점 항목별 위치 + 이유 + 개선 방법을 구체적으로 작성하여 Lead에 반환. Lead는 해당 Subagent 재스폰 후 Evaluator 재실행 (1회 한정).

**2회 연속 FAIL — 무인 실행 원칙 (CRITICAL, G-2 2026-08-10 실사고 정정)**: 이 스킬은 사람이 답할 수 없는
`claude -p` 헤드리스(cron)로도 실행된다. **선택지를 제시하고 사람의 답을 기다리지 않는다** — 답할 사람이
없으면 그 턴에서 그대로 끝나고 Evaluator 판정이 영구히 미완으로 남는다(2026-08-10 실관측: 로그 마지막 줄이
"A를 권합니다… 알려주시면 이어서 진행하겠습니다"였고, 산출물 존재 검증만 통과해 Exit 0을 냈다 — `/yt`의
L-56·L-61과 같은 narration-not-execution 계열).

대신 아래를 **그 자리에서 자율 실행**한다(질문·대기 금지):
1. Evaluator 자신의 감점 사유를 근거로 **가장 타당한 기본안을 스스로 선정**한다 — Wave 2.5는 이미 독립
   판단 주체이므로 사람에게 다시 묻지 않는다.
2. `WR_EVAL.md`에 `## [STOP] 자동 선택 기록` 섹션을 추가해 ①선택한 안 ②선정 사유 ③기각한 대안을 남기고,
   **판정 필드를 `FAIL(AUTO-PROCEED)` 로 갱신**한다 — FAIL 을 PASS 로 바꾸는 것이 아니다(판정 위조 금지).
   자동 진행했다는 **사실**만 기록해, 아래 Wave 절들의 "PASS 후" 진입조건이 이 상태를 식별하게 한다
   (cr-final pr267-chunk4: 갱신 지시가 없어 판정이 FAIL 로만 남아 하위 Wave 가 진행을 주저하는 재정체 경로).
3. 선택안을 실행(필요 시 워커 재스폰으로 보강)한 뒤 Wave 2.6으로 계속 진행한다 — 실행을 멈추고 사람의
   답을 기다리지 않는다.
4. 그래도 사람 재검토가 필요한 결정(비가역·고위험)이라 판단되면, 실행 자체는 위 1~3대로 계속하되
   `WR_EVAL.md` 최상단에 `[STOP] 승인 대기` 마커 한 줄을 남긴다 — 이 마커는 **다음 Human 세션이 읽는
   표식**이지 이번 헤드리스 실행을 멈추는 신호가 아니다.

**출력**: `${FORGE_ROOT:-$HOME/forge}/.claude/state/WR_EVAL.md`(절대경로 — 상대경로는 cwd에 따라 조용히 다른 곳에 쓰인다. root-cause: 2026-08-03 하네스 위생 조사, 앵커 없는 상대경로가 `shared/.claude/state/`에 산개해 있던 걸 실측)

```markdown
## Weekly Research Evaluator 결과

**총점**: XX/100
**판정**: PASS / FAIL

### 항목별 점수
- 소스 커버리지 (40%): XX점 — [미참조 소스 목록]
- 인사이트 품질 (30%): XX점 — [사유]
- 사업 아이템 완성도 (20%): XX점 — [사유]
- 액션 실현 가능성 (10%): XX점 — [사유]

### 개선 지시 (FAIL 항목만)
- [파일명] [항목]: [위치] → [이유] → [개선 방법]
```

PASS 확인 후 Wave 2.6(학습노트) → Wave 2.7(HTML 대시보드) → Wave 3(Notion 자동 등록 + 블로그 발행)으로 진행한다.
⚠️ **진입조건 정합(cr-final pr267-chunk4)**: 이 문서에서 "PASS 후/PASS 확인 후"는 전부
**`PASS` 또는 `FAIL(AUTO-PROCEED)`**(위 §2회 연속 FAIL 무인 실행 원칙의 자동 선택 완료 상태)를 뜻한다.
순수 `FAIL`(자동 선택 미실행)만 진행 불가다 — 헤드리스 실행이 잔존 "PASS 후" 문구를 문자 그대로 읽고
멈추는 재정체(G-2 재발)를 막는 정의 조항.

---

### Wave 2.6 (학습노트 생성 — Evaluator PASS(또는 FAIL(AUTO-PROCEED)) 후, Wave 2.7 이전)

```
subagent_type: general-purpose (agentType: concept-notes-writer)
model: sonnet
```

그주 리포트(`tech-trends.md` / `biz-trends.md` / `stock-trends.md`(있으면))에서 핵심 개념 1~3개를 선별해
`01-research/weekly/{date}/study-notes.md`를 생성한다. 개념 후보 0개면 파일 생성을 생략한다(에이전트 자체 가드레일,
`agents/concept-notes-writer.md` 참조). **fail-open** — 실패해도 기존 3종 리포트·대시보드·Notion 발행은 그대로 진행한다.

---

### Wave 2.7 (HTML 대시보드 생성 — Evaluator PASS(또는 FAIL(AUTO-PROCEED)) 후)

주간 리포트 3종을 단일 HTML 대시보드로 변환한다 (조사 리포트 공통 — 시각적 가독성).

```bash
DATE={date}
WD="${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/weekly/${DATE}"
python3 ${FORGE_ROOT:-$HOME/forge}/shared/scripts/report_to_html.py \
  "${WD}/dashboard.html" --title "Weekly Research — ${DATE}" \
  --subtitle "기술 동향 + 비즈니스 동향 + 사업 아이템" \
  "${WD}/tech-trends.md" "${WD}/biz-trends.md"
```

- 산출물: `01-research/weekly/{date}/dashboard.html` (md 원본 유지 — HTML은 추가 뷰).
- 사업 아이템(`01-research/projects/`)은 프로젝트 경로라 별도. 필요 시 인자에 추가.

---

### Wave 3 (Notion 자동 등록 + 블로그 발행 — Wave 2.5 PASS(또는 FAIL(AUTO-PROCEED)) 후)

3종 파일 작성 완료 + Evaluator PASS(또는 FAIL(AUTO-PROCEED)) 확인 후, 아래 2개를 순차 실행한다.

**Step 1: 블로그 자동 발행** (선택적)

tech-trends.md 내용을 프로젝트 블로그에 자동 발행한다.

- 엔드포인트: `POST {BLOG_API_URL}/api/v1/blog/auto-publish`
- 인증: `X-API-Key` 헤더 (환경변수 `AUTO_PUBLISH_API_KEY`)
- DTO:
  - `title`: "{date} 주간 기술 트렌드"
  - `content`: tech-trends.md 전체 내용
  - `category`: "tech" (또는 블로그 카테고리에 맞게)
  - `tags`: ["weekly", "tech-trends", "AI"]
  - `excerpt`: tech-trends.md 첫 2-3문장 요약
- 성공 시: 블로그 발행 = "발행완료"
- 실패 시: 경고 출력 후 블로그 발행 = "발행실패" (파이프라인 중단 안 함)

**⚠️ API 서버 미기동 시**: 경고만 출력하고 스킵. 블로그 발행 = "미발행".

**Step 2: Notion DB 자동 등록**

Notion "Weekly Research" DB에 페이지를 자동 생성한다.

**Notion DB 정보:**
- Data Source ID: `d7ba2bc1-4c7b-400d-872f-8d78bfeea213`
- DB URL: `https://www.notion.so/${NOTION_DB_ID}`

**실행 순서:**

1. `Read("01-research/weekly/{date}/tech-trends.md")` → 전체 내용 변수 저장
2. `Read("01-research/weekly/{date}/biz-trends.md")` → 전체 내용 변수 저장
3. `Read("01-research/weekly/{date}/stock-trends.md")` (존재하면) → 전체 내용 변수 저장. 미존재(skip) 시 이 단계 생략.
4. `Read("01-research/weekly/{date}/study-notes.md")` (존재하면) → 전체 내용 변수 저장. 미존재(skip) 시 이 단계 생략.
5. tech + biz + (stock, 있으면) + (study-notes, 있으면) 내용을 구분선(`---`)으로 이어 붙여 `content` 구성
6. `mcp__notion__notion-create-pages` 호출

**`mcp__notion__notion-create-pages` 호출:**

```json
{
  "parent": { "data_source_id": "d7ba2bc1-4c7b-400d-872f-8d78bfeea213" },
  "pages": [{
    "properties": {
      "제목": "{date} 주간 리서치 리포트",
      "요약": "{tech-trends 핵심 3줄 + biz-trends 핵심 3줄}",
      "date:날짜:start": "{date}",
      "상태": "완료",
      "기술 트렌드": "{tech-trends.md 핵심 뉴스 Top 3 요약}",
      "비즈니스 트렌드": "{biz-trends.md 핵심 뉴스 Top 3 요약}",
      "사업 아이템": "{선정된 사업 아이템 제목}",
      "블로그 발행": "{Step 1 결과: 발행완료/발행실패/미발행}",
      "tech-trends 경로": "01-research/weekly/{date}/tech-trends.md",
      "biz-trends 경로": "01-research/weekly/{date}/biz-trends.md",
      "s1-research 경로": "01-research/projects/{project}/{date}-s1-research.md",
      "stock-trends 경로": "01-research/weekly/{date}/stock-trends.md (있으면만)",
      "study-notes 경로": "01-research/weekly/{date}/study-notes.md (있으면만)"
    },
    "content": "{tech-trends.md 전체 내용}\n\n---\n\n{biz-trends.md 전체 내용}\n\n---\n\n{stock-trends.md 전체 내용, 있으면}\n\n---\n\n{study-notes.md 전체 내용, 있으면}"
  }]
}
```

**리포트 구성** (content 본문 섹션 순서, 있는 것만 포함 — additive):
- 기술/비즈니스 트렌드 (기존)
- 📈 주식 브리핑 (`stock-trends.md`, 워치리스트 없으면 섹션 생략)
- 🎓 학습노트 (`study-notes.md`, 핵심 개념 0건이면 섹션 생략)

**속성 값 추출 규칙:**
- 요약: tech-trends + biz-trends 각 핵심 3줄 합산
- 기술/비즈니스 트렌드: 각 파일의 Top 3 뉴스 항목 1줄씩
- 사업 아이템: s1-research에서 최종 선정된 아이템명
- 블로그 발행: Step 1 결과 반영
- content: **tech-trends.md 전체 + `---` 구분선 + biz-trends.md 전체** (Notion 페이지에서 스크롤하며 전체 내용 열람 가능)

**실패 처리:**
- Notion MCP 미연결 시 경고 출력 후 스킵 (리포트 파일은 이미 저장됨)
- 페이지 생성 실패 시 에러 로그 출력 후 스킵 (파이프라인 중단 안 함)

### Wave 3.5 (wiki-sync 자동 동기화 — Wave 3 완료 후)

Raw 레이어(`01-research/weekly/{date}/`)에 방금 저장된 산출물을 Wiki 레이어로 자동 반영한다. `wiki-sync` 스킬 자체 로직(스캔·매칭·신뢰도 평가)은 그대로 재사용 — 이 Wave는 호출자일 뿐이다.

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

**fail-open**: Skill 호출 실패·에러 시 → `[wiki-sync] 실패: {사유} — weekly 파이프라인은 계속 진행` 1줄 WARN만 남기고 계속 진행. weekly 파이프라인 전체 중단 금지.

## 신뢰도 등급

모든 뉴스/데이터에 신뢰도를 표기한다:
- `[신뢰도: High]` = 다중 소스에서 일관 확인
- `[신뢰도: Medium]` = 단일 신뢰 소스
- `[신뢰도: Low]` = AI 추정 또는 비공식 소스

### 직접 열람 축 (2026-08-19 신설 — 위 등급과 **독립된 두 번째 축**)

신뢰도가 "소스가 얼마나 믿을 만한가"라면, 이 축은 **"내가 직접 봤는가"**다. 둘은 따로 논다 — 공식 소스라도 워커 보고만 받았으면 직접 열람이 아니다.

- `[실측]` = 그 URL 을 **직접 열어** 수치·문장을 확인함(가격 페이지·마켓 리스팅·공식 문서)
- `[스니펫]` = 검색 결과 스니펫으로만 확인(원문 전문 미확인). ⚠️ `reddit.com` 은 이 세션류 환경에서 **WebFetch 직접 열람이 막혀 있어** 기본적으로 여기 해당(2026-08-19 실측)
- `[전언]` = 워커·타 문서 보고를 옮김 — **아래 spot-check 전까지 사실로 승격 금지**

### spot-check 의무 (워커 보고 → 산출물 반영 전)

Wave 1 워커 산출물을 Wave 2 에서 취합할 때, **결론·순위를 좌우하는 주장은 표본 3건+ 원출처를 Lead 가 직접 재확인**한다(가격·수치·"없다/미기재" 류 부재 주장 우선). 재확인 결과는 위 축으로 표기하고, 어긋나면 정정 이력을 산출물에 남긴다.

- ⛔ **워커의 판정 라벨을 그대로 옮기지 않는다** — "KILL 이다"·"근거 미기재다" 같은 라벨은 관측이지 사실이 아니다.
- 근거: `learnings` **L-20260819T081207** + 2026-08-19 idea-hunt 실측 — 워커 라벨 오보고 2건(Kill 근거 "미기재"·조건부 PASS 를 KILL 로 오분류)과 수치 오보고 2건(Dubsado 가격·InvoiceHome 유저수)이 **전부 spot-check 로만** 잡혔다. 4건 중 3건은 cr-triple 3레그도 통과했다.
- 폐기조건: 2분기 연속 spot-check 적발 0건이면 표본 수 하향을 재검토한다.

## Forge 연동

- 사업 아이템은 Forge S1 형식으로 저장
- `forge-workspace.json`에 프로젝트 등록 확인
- gate-log.md에 S1 게이트 기록
- Human 승인 시 S2(린 캔버스)로 진행 가능

## 후속 처리

완료 후 결과 전달:
- Notion 업로드: `mcp__claude_ai_Notion__notion-create-pages` (Notion MCP)
- Telegram 알림: `plugin:telegram:telegram` MCP (설정된 경우)
- RAG 검색: `/rag-search` 스킬 (과거 주간 리포트 대비 중복/트렌드 체크)

## Workflow 통합 (AD-122, 권고)

Wave 1~4 병렬 실행 = Workflow 도구 사용 가능. `workflow.js` 진입점 (PoC PASS, 시간 ~20% 단축 + resume 지원).

실행: `Workflow({ script: Bash("cat $HOME/.claude/skills/weekly-research/workflow.js") })`

Agent Teams 방식(현행)과 병행 운용. 중단 복구 필요 시 Workflow 우선.

## Cache Stats 로깅 (AD-105 H2, forge orchestrator wiring)

Workflow 실행 완료 후 usage 데이터 기록:
```bash
bash $HOME/.claude/scripts/cache-stats-logger.sh weekly-research "$MODEL" "$CACHE_READ" "$CACHE_CREATION" "$RAW_INPUT" wave-orchestrator
```
usage 필드는 Workflow agent() 반환값에서 추출. 미지원 시 0 기본값 사용.

## Wave 3: Evaluator (신뢰도 검증)

Wave 1-2 산출물이 완성된 후 독립 Evaluator Subagent가 검증한다.

```python
Agent(
  subagent_type="general-purpose", 
  prompt="""
당신은 주간 리서치 품질 검증자입니다. Wave 1-2 산출물을 검증하세요.

검증 항목:
1. 출처 신뢰도 — 1차 출처(공식 블로그, 논문, 공식 발표) 비율 ≥ 60%
   (보조 규칙) 각 뉴스 항목의 출처 링크가 1개뿐이면 신뢰도를 자동 Medium 이하로 강등하고, 위반 시 WARN 처리한다. 단 링크 개수는 대리변수일 뿐 최종 판정 근거가 아니다 — 독립성(동일 보도자료 재인용은 링크가 여러 개여도 사실상 단일 출처로 취급해 과대평가하지 말 것)·출처 유형(공식 1차 vs 2차 요약)·주장별 entailment(링크가 실제로 해당 주장을 뒷받침하는지)를 함께 확인해 최종 신뢰도를 판정하라. 단일 1차 출처라는 이유만으로 기계적으로 Low까지 과소평가하지도 말 것.
   (방향 판단 가드·GTC-4 출처강제) 각 항목의 적용/보류/기각 방향 판단은 출처(공식문서 URL 또는 실측)가 인용됐을 때만 확정한다. 근거 없이 방향을 단정한 항목은 [보류-데이터필요]로 표기하고, 그 상태로는 우선순위·영향도 강등 사유에서 제외한다.

2. 날짜 정확성 — 지난 7일 이내 정보인지 확인
3. 중복 제거 — 동일 내용이 여러 섹션에 반복되지 않는지
4. Forge 적용 가능성 — "Forge 적용 인사이트" 섹션이 구체적인지 (추상적 제안 금지)
5. 누락 주제 — 주요 AI 플랫폼(Anthropic, OpenAI, Google) 중 빠진 것 없는지

판정:
- PASS: 5개 항목 모두 충족
- WARN: 1-2개 미충족 → 해당 섹션만 보완
- FAIL: 3개 이상 미충족 → Wave 1 재실행
"""
)
```

## Gotchas (흔한 실패 패턴 — 실증만, 증거 링크 의무)

- **weekly full run은 라이브 미검증 상태** — daily만 3회 실증, weekly 전체 완주는 1회 필요하며 **텔레그램 실발신은 Human 승인 후**. 완주 전 "동작한다" 단정 금지. (증거: MEMORY §주식리서치+학습노트 — 관측성 후속)
- **raw-data.json이 이미 있으면 수집 단계를 재실행하지 말 것** — `/weekly-analyze` 재분석 진입점이 그 낭비를 막으려고 존재한다. (증거: `weekly-analyze` 스킬 description 경위)
- **대용량 수집 결과를 메인 컨텍스트에서 직접 분석 금지** — weekly-research-analyst subagent로 격리(수집 출력이 메인 오염 시 후속 품질 저하). (증거: `$HOME/.claude/rules/context-engineering.md §도구 응답 관리`)
