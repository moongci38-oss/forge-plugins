---
name: forge-loop-maker
description: "반복 자동화 루프를 인터뷰→패턴→안전장치→승인([STOP])→scaffold 로 만들고, 루프 멈춤 조건 커널(scripts/loop-kernel.js)을 소유한다. 쓸 때: '자동으로 돌게 해줘'·'반복 작업 에이전트 만들어줘'·'루프 짜줘'. SKIP: 1회성 검사, DB 마이그레이션 감사."
---

# /forge-loop-maker — 루프 설계 + scaffold

자동화 루프를 설계하고 Forge 규약 파일로 생성한다. **blueprint 승인 전에는 아무것도 만들지 않는다.**
8종 stop-condition 커널(`scripts/loop-kernel.js`)의 SSoT 소유자다 — 단 함수는 3종뿐이다.

| 구분 | 조건 | 형태 |
|---|---|---|
| 3종은 재사용 함수 | `same_issue` · `oscillation` · `plateau` | `export function` |
| 5종은 inline 패턴 명세 | `rubric_all_pass` · `max_cycles` · `budget_advisory` · `security_crit` · `regression` | 주석 명세(§1-a~e) — workflow.js 에 직접 복사 |

- 실호출: `same_issue` 만(`healer`·`forge-implement`·`forge-pge`). 미배선 사유 → `healer-reference.md`·`forge-pge/reference.md`.
- 회귀 테스트: `bash shared/scripts/tests/loop-kernel.test.sh`
- SKIP: `/migration-audit`(DB 전용), 1회성 단순 검사.

**The one rule**: Durable knowledge → SKILL.md(read-only) · Changing state → STATE.md(read+write). 카운터·진행 상태를 SKILL.md 에 쓰지 않는다(cold-start 초기화).
흐름: `Phase 1 Elicit(7Q) → Phase 2 Pattern(4종) → Phase 3 Safety(9종) → Phase 4 Blueprint → [STOP] 승인 → scaffold`

## Phase 1 — 7Q 인터뷰
- detect-first: 기존 루프 파일/트리거/goal-loop-state.json 이 있으면 "(detected)" 출력 후 스킵.
- 질문 규약 = `${FORGE_ROOT:-$HOME/forge}/.claude/rules-on-demand/grilling-protocol.md` — 의존 결정은 하나씩, 독립 질문은 AskUserQuestion 다중(≤4) batch.

| Q | 질문 | 매핑 |
|---|---|---|
| Q1 | **Goal**: 프로그램으로 검사 가능한 종료 predicate(파일 존재·카운트·HTTP 200 등) | EXIT_PREDICATE |
| Q2 | **Trigger**: cron · event · manual · `/goal "..."` | TRIGGER.md |
| Q3 | **Discovery**: 매 실행 읽는 것(디렉토리·API·qa-report·DB) | SKILL.md action 절 |
| Q4 | **Action**: 호출할 skill/agent·대상 | executor |
| Q5 | **Verification**: **별도 프로그램(binary exit code)** 으로 판정 | verifier / evaluator |
| Q6 | **State**: 실행 간 기억(처리 항목·커서·사이클 수) | STATE.md |
| Q7 | **Human Gates**: 최소 G1(첫 실행 전) + G2(verifier 이상) | HUMAN-GATES.md |

Q7 직후 추가 캡처: durable 참조(rubric/schema/style-guide) + **Budget 3종 필수(미설정 시 scaffold 거부)** — max-iter(최대 사이클 수) · call-budget(tool-call 횟수 상한, Forge hook WARN-only 연동) · **wall-clock 상한**.

## Phase 2 — 패턴 선택 (선택 후 1줄 근거 출력)

- **PEV (goal형)** = ReAct + deterministic verifier — 단일 워크스트림·프로그램 predicate. **기본값**
- **Evaluator-optimizer (cr-triple형)** = 판단이 필요한 rubric 종료조건 · **Orchestrator-workers (healer 병렬형)** = 독립 병렬 하위 태스크 · **Ralph (healer형)** = crude baseline·단순 루프

실행 수단(별도 축): 세션 안 반복 = CLI `/loop`(간격)·`/goal`(조건 충족까지 — 조건 ≤4,000자, 평가자는 대화에 드러난 증거만 판정) · 세션 경계 넘는 반복 = `/schedule` · 결정론 제어가 필요하면 이 스킬의 scaffold(workflow.js).

## Phase 3 — 안전장치 9종 (미충족 시 blueprint 거부 + 보완 요청)

- S1 검증자 분리: verifier = SKILL.md 와 별도 프로그램(self-grade 금지)
- S2 same_issue dedup: loop-kernel.js §3c (동일 id:severity × 3 → STOP) · S3 plateau: §3e (net gain ≤ ε 연속 2회 → STOP)
- S4 cycle-cap: max_cycles 명시(기본 6, 결정론적 1순위 bound) · S5 max-iter 설정 · S6 call-budget(Forge hook WARN-only 연동 명시)
- S7 wall-clock: HUMAN-GATES.md 에 구체 시간 필수 · S8 SKILL.md = logic / STATE.md = 상태 · S9 HUMAN-GATES 에 G1 + G2

## Phase 4 — Blueprint → [STOP] → scaffold

4a. 승인 전 파일 쓰기 금지. 아래 블록 렌더:
```
forge-loop-maker BLUEPRINT
LOOP_NAME {LOOP_NAME} · PATTERN {PATTERN} · GOAL {EXIT_PREDICATE} · TRIGGER {TRIGGER}
VERIFY {VERIFIER_CMD} · STATE {STATE_PATH} · GATES {GATE_LIST}
BUDGET max-iter={MAX_ITER} · call-budget={CALL_BUDGET} · wall-clock={WALL_CLOCK}
[STOP] 승인 후 scaffold 실행
```

4b. 승인 후 실행 → 완료 시 파일 트리 출력:
`scripts/scaffold.py --name {LOOP_NAME} --goal "{GOAL}" --pattern {PATTERN} --state {STATE_PATH} --max-iter {MAX_ITER} --wall-clock "{WALL_CLOCK}" --verify-cmd "{VERIFIER_CMD}"`

- Durable `~/forge/.claude/skills/{LOOP_NAME}/`: `SKILL.md`←`templates/loop-SKILL.md.tmpl` · `HUMAN-GATES.md`←`templates/HUMAN-GATES.md.tmpl` · `TRIGGER.md`←`templates/TRIGGER.md.tmpl`
- Durable `scripts/workflow.js`←`templates/workflow.js.tmpl`(골격) + `templates/workflow.body.{PATTERN}.js.tmpl`(본문)
- Changing `{PROJECT_CWD}/loops/{LOOP_NAME}/STATE.md`←`templates/STATE.md.tmpl`

workflow.js = 골격 1 + 패턴 본문 4 조합(`--pattern` 이 본문 선택 — 골격만 고치면 판정은 안 바뀐다):

| 패턴 | 종료 판정 | 성공 신호 |
|---|---|---|
| `pev` | 외부 verifier exit code (0=pass / 2=사람 판정 / else=fail) | `verify_pass` |
| `evaluator-optimizer` | LLM 루브릭 0~100 + `rubric_all_pass` | `rubric_all_pass` |
| `orchestrator-workers` | 남은 subtask(`remaining`) — verifier 있으면 exit code 우선 | `all_done` |
| `ralph` | 외부 verifier exit code. **verifier 없으면 성공 선언 안 함** | `verify_pass` |

4c. 완료 체크: Q1–Q7 반영 · verifier 별도 파일(또는 evaluator 스펙) · STATE.md 생성·초기화 · HUMAN-GATES.md 에 G1+G2+wall-clock · workflow.js 가 loop-kernel.js 종료조건 패턴 참조.

## 커널 참조
- 8종: `rubric_all_pass / max_cycles / same_issue / plateau / oscillation / regression / security_crit / budget_advisory` — workflow.js 는 `templates/workflow.js.tmpl` 에서 inline 상속.
- 비-Workflow 소비자(healer 등 Bash 에이전트)는 `node --input-type=module -e "const {...} = await import('<kernel경로>'); ..."` 로 실호출 — 실패 시 호출자 하드코딩 캡으로 fallback 필수. 선례 `agents/healer.md §loop-kernel.js SSoT 연동`.

## forge-sync 필수 — scaffold 후 `node ~/forge/dev/scripts/forge-sync.mjs sync`
