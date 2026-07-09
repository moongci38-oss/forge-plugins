---
name: forge-loop-maker
description: |
  루프 설계 마법사 + scaffold. "자동으로 실행되게 해줘", "반복 작업 에이전트 만들어줘", "루프 짜줘" 등 루프 자동화 의도 감지 시 발동.
  4단계: 7Q 인터뷰 → 패턴 매핑 → 안전장치 검증 → [STOP] blueprint 승인 → scaffold.
  산출물: 루프 SKILL.md + workflow.js + HUMAN-GATES.md + STATE.md + TRIGGER.md.
  커널(same_issue/plateau/oscillation/max_cycles 등 8 stop-condition)을 소유 — scripts/loop-kernel.js.
  SKIP: /qa(QA 전용), /healer(버그 전용), /migration-audit(DB 전용), 1회성 단순 검사.
---

# /forge-loop-maker — 루프 설계 + scaffold

자동화 루프를 설계하고 Forge 규약 파일로 생성합니다.
**Nothing runs until you approve the blueprint.**

---

## The one rule

> **Durable knowledge → SKILL.md (매 실행 read-only).  
> Changing state → STATE.md (매 실행 read+write).**

실행 간 기억해야 하는 것(카운터·타임스탬프·진행 상태)은 SKILL.md에 쓰면 안 됩니다.
SKILL.md는 cold-start 시 디스크에서 새로 로드되므로 저장한 상태가 초기화됩니다.

---

## 4단계 흐름

```
Phase 1: Elicit   — 7Q 인터뷰 (one at a time)
Phase 2: Pattern  — 4패턴 중 선택
Phase 3: Safety   — 안전장치 9종 검증
Phase 4: Blueprint → [STOP] 승인 → scaffold
```

---

## Phase 1 — 7Q 인터뷰

환경 detect-first: 기존 루프 파일/트리거/goal-loop-state.json 존재 시 "(detected)" 출력 후 해당 질문 스킵.

질문은 **반드시 한 번에 하나씩**. 답변 수신 후 다음 질문.

| Q | 질문 | 산출물 매핑 |
|---|------|-----------|
| Q1 | **Goal**: 루프 종료 조건은? (프로그램으로 검사 가능한 predicate — 파일 존재·카운트·HTTP 200 등. "좋아 보인다"는 X) | EXIT_PREDICATE |
| Q2 | **Trigger**: 어떻게 시작? (cron · event · manual · `/goal "..."`) | TRIGGER.md |
| Q3 | **Discovery**: 매 실행 무엇을 읽나? (디렉토리·API·qa-report·DB) | SKILL.md action 절 |
| Q4 | **Action**: 무엇을 하나? (어떤 skill/agent 호출, 어떤 대상에) | executor |
| Q5 | **Verification**: 이터레이션 성공을 어떻게 판정? — **반드시 별도 프로그램 (binary exit code)** | verifier / evaluator |
| Q6 | **State**: 실행 간 기억해야 하는 것? (처리된 항목·마지막 커서·사이클 수) | STATE.md |
| Q7 | **Human Gates**: 언제 Human 승인이 필요한가? (최소: 첫 실행 전 G1, verifier 이상 G2) | HUMAN-GATES.md |

**추가 캡처 (Q7 직후)**:
- Durable knowledge: 변하지 않는 참조 자료 (rubric/schema/style-guide)
- **Budget 3종 (필수 — 미설정 시 scaffold 거부)**:
  - max-iter (최대 사이클 수)
  - call-budget (tool-call 횟수 상한, Forge hook WARN-only 연동)
  - **wall-clock 상한** (최대 경과 시간 — 예: "2시간")

---

## Phase 2 — 패턴 선택

| 패턴 | Forge 이름 | 선택 기준 |
|------|-----------|---------|
| ReAct + deterministic verifier | **PEV (goal형)** | 단일 워크스트림, 프로그램 검사 predicate. **기본값** |
| Evaluator–optimizer | **Evaluator-optimizer (cr-triple형)** | 판단이 필요한 rubric 기반 종료조건 |
| Orchestrator–workers | **Orchestrator-workers (healer 병렬형)** | 독립 병렬 하위 태스크 |
| Ralph | **Ralph (healer형)** | crude baseline / 교육·단순 루프 |

패턴 선택 후 1줄 근거 출력.

---

## Phase 3 — 안전장치 검증 (9종)

아래 항목 미충족 시 blueprint 거부 + 보완 요청:

| # | 항목 | 검증 기준 |
|---|------|---------|
| S1 | 검증자 분리 | verifier = SKILL.md와 별도 프로그램 (self-grade 금지) |
| S2 | same_issue dedup | loop-kernel.js §3c 참조 (동일 id:severity × 3 → STOP) |
| S3 | plateau 검사 | loop-kernel.js §3e 참조 (net gain ≤ ε 연속 2회 → STOP) |
| S4 | cycle-cap | max_cycles 명시 (기본 6, 결정론적 1순위 bound) |
| S5 | max-iter 예산 | Q budget max-iter 설정 완료 |
| S6 | call-budget | Forge hook WARN-only 연동 경고 명시 |
| S7 | wall-clock 상한 | HUMAN-GATES.md에 구체적 시간 명시 필수 |
| S8 | durable/changing 분리 | SKILL.md = logic only, STATE.md = 변경 상태 |
| S9 | HUMAN-GATES 존재 | G1(첫 실행 전) + G2(verifier 이상) 최소 포함 |

---

## Phase 4 — Blueprint 승인 → scaffold

### 4a. Blueprint 렌더링 (승인 전 파일 쓰기 금지)

```
╔══════════════════════════════════════════════════
║ forge-loop-maker BLUEPRINT
╠══════════════════════════════════════════════════
║ LOOP_NAME  : {LOOP_NAME}
║ PATTERN    : {PATTERN}
║ GOAL       : {EXIT_PREDICATE}
║ TRIGGER    : {TRIGGER}
║ VERIFY     : {VERIFIER_CMD}
║ STATE      : {STATE_PATH}
║ GATES      : {GATE_LIST}
║ BUDGET     :
║   max-iter   = {MAX_ITER}
║   call-budget = {CALL_BUDGET}
║   wall-clock  = {WALL_CLOCK}
╠══════════════════════════════════════════════════
║ [STOP] 승인 후 scaffold 실행
╚══════════════════════════════════════════════════
```

사용자 승인 후 → `scripts/scaffold.py` 실행.

### 4b. scaffold 산출 (6 building blocks)

`scripts/scaffold.py --name {LOOP_NAME} --goal "{GOAL}" --pattern {PATTERN} --state {STATE_PATH} --max-iter {MAX_ITER} --wall-clock "{WALL_CLOCK}"`

| 분류 | 경로 | 템플릿 |
|------|------|-------|
| Durable | `${FORGE_ROOT:-$HOME/forge}/.claude/skills/{LOOP_NAME}/SKILL.md` | `templates/loop-SKILL.md.tmpl` |
| Durable | `${FORGE_ROOT:-$HOME/forge}/.claude/skills/{LOOP_NAME}/HUMAN-GATES.md` | `templates/HUMAN-GATES.md.tmpl` |
| Durable | `${FORGE_ROOT:-$HOME/forge}/.claude/skills/{LOOP_NAME}/TRIGGER.md` | `templates/TRIGGER.md.tmpl` |
| Durable | `${FORGE_ROOT:-$HOME/forge}/.claude/skills/{LOOP_NAME}/scripts/workflow.js` | `templates/workflow.js.tmpl` |
| Changing | `{PROJECT_CWD}/loops/{LOOP_NAME}/STATE.md` | `templates/STATE.md.tmpl` |

scaffold 완료 후 파일 트리 출력.

### 4c. 완료 체크리스트

- [ ] Q1–Q7 전부 답변 + blueprint에 반영
- [ ] verifier 별도 파일 존재 (또는 evaluator agent 스펙 포함)
- [ ] STATE.md 경로에 파일 생성, 초기화됨
- [ ] HUMAN-GATES.md: G1 + G2 + wall-clock 상한 포함
- [ ] workflow.js: loop-kernel.js 종료조건 패턴 참조

---

## 커널 참조

`scripts/loop-kernel.js` — 8 stop-condition 표준 구현:
`rubric_all_pass / max_cycles / same_issue / plateau / oscillation / regression / security_crit / budget_advisory`

생성된 루프의 workflow.js는 이 커널 패턴을 `templates/workflow.js.tmpl`에서 상속합니다.

---

## forge-sync 필수

`${FORGE_ROOT:-$HOME/forge}` SSoT → `~/.claude/` 미러. scaffold 후 반드시:
```bash
node ${FORGE_ROOT:-$HOME/forge}/dev/scripts/forge-sync.mjs sync
```
