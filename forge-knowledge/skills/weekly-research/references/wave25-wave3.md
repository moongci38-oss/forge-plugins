# Wave 2.5 Evaluator · Wave 3 발행 — 상세

> `weekly-research` SKILL.md 의 **해당 Wave 를 실제로 실행할 때** Read 한다.
> (2026-08-28 분리 — SKILL.md 500줄 규정 준수. 프롬프트·명령·판정 기준은 원문 그대로다.)

## 목차
- Wave 2.5 — 독립 Evaluator subagent
- Wave 2.55 — 적대적 검수 (cr-triple **2벤더 교차 2레그**, 계획서 전용 · **비차단**)
- Wave 3 — Notion 자동 등록 + 블로그 발행

---

## Wave 2.5 — 독립 Evaluator subagent


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

## Wave 2.55 (적대적 검수 — cr-triple **2벤더 교차 2레그**, 계획서 전용 · 2026-08-27 Human 지시)

**대상**: `01-research/projects/{project}/{date}-s1-research.md`
**대상 아님**: `tech-trends.md`·`biz-trends.md`(뉴스 리포트)·`stock-trends.md` — 이건 리포트 **본문**이고, 본문 품질은 Wave 2.5 Evaluator 와
커버리지 게이트가 맡는다. cr-triple 은 코드·계획서용 루브릭이라 본문에 걸면 오탐이 는다.

왜 벤더를 가르나: 한 벤더만 보면 그 벤더의 맹점을 그대로 통과시킨다.
Claude(Opus 5)와 Codex(**gpt-5.6-sol**)가 각각 읽고 교차하면 한 모델이 놓친 것을 다른 모델이 집는다.
⚠️ 구 표기 "Claude(Fable 5.1)·Codex(gpt-6-astra)" 는 2026-09-17 폐기 — 사람 지시 "advisor 에서만 최고급 모델 사용해"(레그 모델은 `cr-risk-tier.sh` 등급이 정한다).
⚠️ 완화 장치이지 무편향 보장이 아니다(`cr-multi/SKILL.md §self-referential bias`).
⚠️ **구 표기 "3레그 — Claude·Codex(gpt-5.6-sol)·Gemini" 는 2026-09-12 폐기.** 2026-09-07 Gemini
전면 철수로 3레그 구성 자체가 없고, Codex 레그 기본값은 그 뒤 astra 를 거쳐 2026-09-17 `gpt-5.6-sol` 이 됐다(astra 폐기 — advisor 전용)
(정본 `model-routing.md §검수 2레그`). 3레그를 기대하고 결과를 읽으면 레그 수를 오독한다.

**호출**

```
/cr-triple "01-research/projects/{project}/{date}-s1-research.md" --stage plan --cr on
```

⚠️ **`--cr on` 을 빼면 교차 검증이 성립하지 않는다.** 팀 기본값 `FORGE_AUTO_CR=degrade` 가
Codex 레그를 통째로 빼는데, 레그가 2개뿐이라 하나를 빼면 **Claude 단독**이 되어 자기검토가 된다
(`forge-multi` 가 `quorumFail` → `verdict=FAIL` 로 받는다). **전역 기본값은 건드리지 않는다** —
이 Wave 안에서만 `--cr on` 을 명시한다.
⚠️ 구 표기 "(`model-routing.md:27` 범위 제한)" 은 2026-09-12 폐기 — **그 줄에 그런 내용이 없다.**
실측: `sed -n '27p' dev/global-rules/model-routing.md` → `## Advisor/Worker 위임 규율` 헤더 ·
`grep -c 'FORGE_AUTO_CR' dev/global-rules/model-routing.md` → **0**.
daily 형제 파일에서 복사돼 온 낡은 줄번호였다. 줄번호 포인터는 위쪽에 줄이 끼면 조용히 어긋난다.

**판정 소비 — 이 Wave 는 비차단(WARN-first)이다**

| verdict | 행동 |
|---|---|
| `PASS` | 계획서 말미에 `검수: cr-triple PASS` 1줄 기록 |
| `WARN` / `FAIL` | 지적 항목(severity·요지)을 계획서 말미 `## 검수 지적` 섹션에 적고 **진행한다** |
| `INVALID_INPUT` | 판정이 아니다 — 집계 금지. 입력 고쳐 1회 재호출, 실패하면 `검수 미판정` 기록 후 진행 |

⛔ **[STOP] 게이트를 걸지 않는다.** 이 파이프라인은 cron 이 무인으로 돌린다(daily 화~일 09:00 ·
weekly 월요일). 사람이 없는 자리에서 멈추면 그날 리포트가 통째로 안 나온다 — 검수 결과를
**리포트에 실어 보내는 것**이 무인 환경에서 실효가 있는 유일한 형태다.
쉽게 말하면 **문을 잠그는 대신 쪽지를 붙인다.**

⚠️ **이 방어가 무력화되는 입력**: 계획서가 생성되지 않은 날 — 대상이 없어 조용히 통과한다.
그때는 Wave 2.9 최종 완료 게이트가 산출물 부재로 잡는다.

폐기조건: WARN/FAIL 이 2분기 연속 0건이면 이 Wave 를 on-demand 로 내린다.

---

## Wave 3 — Notion 자동 등록 + 블로그 발행


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
- DB URL: `https://www.notion.so/8023d8cc603d48e3b6f99e95739457fd`

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
