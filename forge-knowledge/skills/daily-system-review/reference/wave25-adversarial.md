# Wave 2.5 독립 Evaluator · Wave 2.55 적대적 검수 — 상세

> `daily-system-review` SKILL.md 의 **Wave 2.5 / 2.55 를 실제로 돌릴 때** Read 한다.
> (2026-08-28 분리 — SKILL.md 500줄 규정 준수. 프롬프트·배점·판정 기준은 원문 그대로다.)

### Wave 2.5 (독립 Evaluator subagent — Wave 2 완료 후, Wave 3 이전)

> **핵심 원칙: Lead의 컨텍스트(의도, 가정)를 공유하지 않는 별도 에이전트가 검증한다.**
> Wave 2 Lead 리포트 완성 직후, Wave 3(Notion 등록) 진행 전에 반드시 실행한다.

```
subagent_type: codex-critic  # 교차모델(OpenAI) — 동일모델(Claude) 평가는 편향 전파(arXiv 2606.20493 Contagion Networks).
```

⚠️ **구 표기 `subagent_type: gemini` 는 2026-09-11 폐기** — 2026-09-07 Gemini 전면 철수로 그 워커가 없다.
⛔ **`general-purpose` 로 fail-open 폴백하지 마라(구 지시 폐기).** `general-purpose` 는 Claude 라
**교차모델이 아니다** — 폴백하는 순간 이 절이 막으려던 편향 전파가 그대로 일어나고,
리포트에는 "교차 검증 통과"로 남는다. `codex-critic` 이 미가용이면 **Wave 2.5 를 SKIP 하고
"교차 검증 미실시"를 리포트에 명시한다.** 미실시는 PASS 도 FAIL 도 아니다.

**입력 파일**: `codex-critic` 은 `Read`·`Grep` 을 갖고 있어(`agents/codex-critic.md:4`) **경로를 넘겨도 된다.**
⚠️ 구 지시 "전문을 프롬프트에 인라인하라"는 `gemini` 가 `Read`/`Bash`/`Glob` 이 **없어서** 생긴 제약이었다
(D6, 반복 재발 — 2026-08-07 daily 세션 실측: 경로만 넘겼다면 FAIL 35/100 이 나와야 할 리포트가
근거 없이 통과했을 것). 그 제약은 `codex-critic` 에는 해당하지 않는다.
⛔ **경로는 반드시 절대경로로 넘긴다.** `codex-critic` 은 `mcp__codex__codex` 를 거치므로
**자기 cwd 가 따로 있다** — 상대경로를 주면 cwd 가 `forge-outputs` 가 아닐 때 Read 가 조용히
실패하고, 바로 위 문단이 말한 D6("빈 근거 위 채점")가 **다른 경로로 재발**한다.
인라인 시절에는 경로가 라벨이라 상대경로여도 무해했지만 이제는 실제로 열어야 한다
(LN-03 도 MCP 전달 경로에 절대경로를 요구한다 · `SKILL.md §Wave 2.7 HTML 대시보드` 의
`BASE="${FORGE_OUTPUTS:-$HOME/forge-outputs}"` 가 같은 방식이다).
⚠️ 줄번호로 가리키지 않는다 — 같은 PR 의 후속 커밋이 위쪽에 줄을 넣으면 포인터가 조용히 어긋난다(2026-09-11 실측: 277 → 290 으로 밀렸다).
호출자가 **두 파일의 존재를 먼저 확인**하고 스폰한다:

```bash
BASE="${FORGE_OUTPUTS:-$HOME/forge-outputs}"
ls -l "${BASE}/01-research/daily/{date}/ai-system-analysis.md" \
      "${BASE}/01-research/daily/{date}/system-improvement-plan.md"
```

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

### Wave 2.55 (적대적 검수 — cr-triple **2벤더 교차 2레그**, 계획서 전용 · 2026-08-27 Human 지시)

**대상**: `01-research/daily/{date}/system-improvement-plan.md`
**대상 아님**: `ai-system-analysis.md`(분석 리포트)·`stock-brief.md`(종목 브리핑) — 이건 리포트 **본문**이고, 본문 품질은 Wave 2.5 Evaluator 와
커버리지 게이트가 맡는다. cr-triple 은 코드·계획서용 루브릭이라 본문에 걸면 오탐이 는다.

왜 벤더를 가르나: 한 벤더만 보면 그 벤더의 맹점을 그대로 통과시킨다.
Claude(Opus 5)와 Codex(**gpt-5.6-sol**)가 각각 읽고 교차하면 한 모델이 놓친 것을 다른 모델이 집는다.
⚠️ 구 표기 "Claude(Fable 5.1)·Codex(gpt-6-astra)" 는 2026-09-17 폐기 — 사람 지시 "advisor 에서만 최고급 모델 사용해"(레그 모델은 `cr-risk-tier.sh` 등급이 정한다).
⚠️ 완화 장치이지 무편향 보장이 아니다(`cr-multi/SKILL.md §self-referential bias`).
⚠️ **구 표기 "3레그 — Claude·Codex(gpt-5.6-sol)·Gemini" 는 2026-09-11 폐기.** 2026-09-07 Gemini
전면 철수로 3레그 구성 자체가 없고, Codex 레그 기본값은 그 뒤 astra 를 거쳐 2026-09-17 `gpt-5.6-sol` 이 됐다(astra 폐기 — advisor 전용)
(정본 `model-routing.md §검수 2레그`). 3레그를 기대하고 결과를 읽으면 레그 수를 오독한다.

**호출**

```
/cr-triple "${FORGE_OUTPUTS:-$HOME/forge-outputs}/01-research/daily/{date}/system-improvement-plan.md" --stage plan --cr on
```

⚠️ **`--cr on` 을 빼면 교차 검증이 성립하지 않는다.** 팀 기본값 `FORGE_AUTO_CR=degrade` 가
Codex 레그를 통째로 빼는데, 레그가 2개뿐이라 하나를 빼면 **Claude 단독**이 되어 자기검토가 된다
(`forge-multi` 가 `quorumFail` → `verdict=FAIL` 로 받는다). 전역 기본값은 건드리지 않는다
(`model-routing.md:27` 범위 제한).

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
