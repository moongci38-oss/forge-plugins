# call-budget 캡 + stop-condition 가드 상세

> `forge-pge` SKILL.md 의 **Phase 5 피드백 루프를 돌릴 때** Read 한다.
> 사이클을 한 번도 돌지 않고 1회 통과하면(Evaluator 즉시 PASS) 읽을 필요가 없다.
> (2026-08-28 분리 — SKILL.md 500줄 규정 준수. 캡 수치·가드 절차는 한 줄도 바꾸지 않고 옮겼다.)

## call-budget 캡 + stop-condition 가드 (P1 신규 / B2 배선 2026-06-17)

**call-budget 캡**: 각 사이클(Phase 1→2→3→4) 진입 **전** 확인 — **실측 tool-call 횟수**(`loop-call-accum.sh` PostToolUse 훅이 누적한 `.calls`)를 `loop-budget.sh`로 읽어 비교.

> 구 `PGE_TOKEN_CAP`(LLM 자가추정 토큰)은 **theater**였다 — PostToolUse payload에 `output_tokens` 필드가 없어 토큰 실측 불가(799세션 토큰파일 전부 0으로 실증). B2에서 **tool-call 횟수**(`tool_name` 존재로 실측 가능)로 전환. 이것이 line 363 "P4 agent-budget 훅 연동 예정"의 이행분.

```
PGE_CALL_CAP = 환경변수 PGE_CALL_CAP (기본: 600 — orchestrator급)

사이클 진입 전 (bash, 메인 컨텍스트):
  used=$(bash ${FORGE_ROOT:-~/forge}/shared/scripts/loop-budget.sh "${PGE_CALL_CAP:-600}")
  rc=$?
  if [ "$rc" -ne 0 ]; then   # exit 1 = over cap (loop-budget.sh가 cap 비교)
    "[STOP] PGE_CALL_CAP={cap} 도달 (tool-call ${used}). 사이클 {N} 시작 취소."
    현재까지 산출물 경로 + Evaluator 마지막 판정 반환
```

- `loop-budget.sh <cap> [sid]` = `loop-call-accum.sh`가 `${PWD}/.claude/agent-budget/${SID}.calls`에 누적한 실측 tool-call 횟수를 읽어 cap과 비교 (exit 0=under / 1=over). 훅 미등록 또는 `.calls` 부재 시 **0 반환=inert(안전)**.
- **SID best-effort**: loop-budget.sh는 `${CLAUDE_SESSION_ID:-unknown}`로 키잉. producer(훅)는 payload `.session_id`(= 세션 UUID)로 키잉하므로, 메인 컨텍스트에 `CLAUDE_SESSION_ID`(동일 UUID)가 set이면 정렬, 미set이면 `unknown` 버킷 → 0=inert(미정렬은 under-STOP=안전방향). 정확 정렬 필요 시 `loop-budget.sh <cap> <session-uuid>` 2번째 인자로 명시.
- ⚠️ **정직성**: call-count = 실측 mechanical 신호(LLM 자가추정 토큰 theater 대체). 단 **결정론 bound = max_cycles(1순위)**; call-budget은 보조 **2순위 advisory**. 토큰(output_tokens) 아닌 **tool-call 횟수**임(payload에 토큰 부재).

**stop-condition 가드**: 모든 판정은 `PGE_EVAL_HISTORY.jsonl`에 append된 사이클 레코드를 유일한 데이터 소스로 사용한다. 구조화 id 기반 비교만 허용 (string fuzzy 금지 — 루프-커널 표준 §2). Evaluator는 각 항목에 결정론적 id를 부여해야 한다: 형식 `{requirement}:{check}` (예: `payment-api:stripe-response-validation`, `ui-layout:responsive-breakpoint`). prose 요약 앞 N자 비교는 사이클 간 wording drift로 false-negative가 발생하므로 **사용 금지**.
> **파일명 규약**: 본문 전체는 canonical base명 `PGE_EVAL_HISTORY.jsonl`로 참조한다. **동시성 격리 (472-799 세션 환경)**: 실제 파일은 base명에 **per-run suffix**(`PGE_EVAL_HISTORY.{run_id}.jsonl`)를 붙여 생성한다.
> **run_id handshake (writer/reader 동일 경로 보장)**: `{run_id}`는 **Phase 0에서 1회 생성**(시작 시각+nonce)해 **`PGE_SPEC.md` 상단에 기록**한다. Evaluator(쓰기)·루프(읽기) 모두 매 사이클 PGE_SPEC.md의 `run_id`를 읽어 경로를 도출 → 양측이 동일 파일 참조 보장(reader가 fresh run_id 재계산해 빈 파일 읽는 fail-open 차단). 단일 런 내 순차 append라 런-내 race 없음. **진짜 atomic append + flock = B2 트랙(Human 승인)** — inline prose는 per-run 파일 분리·handshake까지만 보장.

```
[Evaluator 지시] 항목별 판정 출력 형식 (사이클마다 전항목 필수):
  PASS 항목: `PASS [{requirement}:{check}]`
  FAIL 항목: `FAIL [{requirement}:{check}] — {위치} / {이유} / {방법}`
  CRITICAL 보안: `SECURITY_CRIT [{requirement}:{check}] — {발견 내용}` (별도 섹션)
  규칙: 동일 결함은 사이클이 달라도 동일 id. 설명 wording 변경 금지. **id는 Sprint Contract `eval_ids` 레지스트리에서만 선택** — 목록에 없는 신규 결함만 새 id 제안(다음 사이클부터 레지스트리 append). 변형·재명명 금지(regression false-negative 방지).

[레코드 스키마 — 2종 (각 1줄 JSONL)]:
  · eval-record (Evaluator): `{"type":"eval", "cycle": <N>, "score": <합산>, "items": [{"id":"<req>:<chk>","verdict":"PASS|FAIL"}, ...], "security_crit": [<id>, ...]}`
  · security_event (루프, Codex CRITICAL 시): `{"type":"security_event", "cycle": <N>, "security_event": [{"id":"<req>:<chk>","src":"codex"}]}`
  **한 cycle에 eval-record 1줄 + security_event 0~N줄 공존 = valid** (`type`으로 판별). 같은 cycle 값의 복수 라인은 정상 — gate G는 'cycle 중복'을 오류로 보지 않는다.

[Evaluator 지시] 사이클 eval-record append (PGE_EVAL_HISTORY.jsonl):
  위 eval-record 스키마 1줄.
  ※ 파일이 없으면 새로 생성. 존재하면 마지막 줄 뒤에 newline + 새 JSON 객체 1줄. 덮어쓰기 금지.
  ※ **read-modify-write 금지** — 파일 전체를 읽고 재작성하면 이전 사이클 레코드 유실 위험. 반드시 끝에 한 줄만 추가(`>>` 의미).
     append 도구가 없으면 마지막 줄 1개만 읽어 형식 확인 후 newline+신규객체 추가. 1줄=1 JSON 객체(JSONL) 불변식 유지.
  ※ append 누락·malformed JSONL 발생 시 → 루프가 **당-사이클 N 게이트 G**(append 직후 즉시 읽기)에서 data_integrity로 감지해 [STOP] fail-safe (N+1로 미루지 않음 — 조용한 false-negative 방지).

[루프 지시] 사이클 N 완료 후 게이트 G → 결정표(순위1~5)를 순서대로 1회 평가 (PGE_EVAL_HISTORY.jsonl 참조). 먼저 매칭되는 행에서 즉시 행동·중단, 이후 행 미평가 (상호 배타). 단계 번호 = 결정표(G + 1~5)와 1:1:

  G. data_integrity (전제 게이트 — 평가 가능성): Evaluator append 직후 루프(메인)가 **반드시** 사이클 N의 **eval-record**(`type=eval`, cycle=N인 마지막 라인)를 읽어 파싱(N+1로 미루지 않음 — STOP 경로가 N+1을 막을 수 있어 당-사이클 검증 필수). **regression(순위3) 평가하는 N≥2 사이클에서는 N-1 eval-record도 함께 파싱**. eval-record 누락·JSON 파싱불가 → 즉시 [STOP] DATA_INTEGRITY. (security_event 라인은 별개 type — 같은 cycle 공존이 정상이라 '중복'으로 STOP하지 않음. 순위1이 별도로 스캔.)
    > **결정론 validator = B2 트랙 (정직성)**: 진짜 mechanical JSONL 검증(파서 exit-code 강제 + per-run 격리 + 동시성 lock)은 **B2 훅(Human 승인)** 영역. inline prose는 LLM이 읽어 STOP하는 **의도**만 규정 — 100% 기계 강제 보장 아님. (이전 인라인 python `-c`/heredoc은 diff base·exit-code·동시성 버그를 양산해 제거.)

  1. security_crit / rollback_trigger:
     (a) Phase 4.5에서 Codex CRITICAL 발견 시 → 루프가 **별도 라인을 append**: `{"cycle": N, "security_event": [{"id":"<req:chk>","src":"codex"}]}`. 새 라인 = append-only 유지 + 중단/재개에도 보존(durable). (in-memory 휘발 금지 — fail-open 방지.)
     (b) JSONL의 사이클 N `security_crit[]` ∪ 전체 `security_event` 라인 중 하나라도 비어있지 않으면 → [STOP] SECURITY_CRIT.
     (c) Sprint Contract `rollback_trigger`(보안/비보안) 충족 → [STOP] (비보안은 `[ROLLBACK]` 메시지). rollback_trigger는 prose 조건이라 structured-id 비교의 명시적 예외(Human이 작성한 hard-STOP 트리거).

  2. rubric_all_pass:
     전제1 (커버리지) — 사이클 N items의 id 집합이 (Sprint Contract eval_ids 레지스트리 전체 ∪ 직전 사이클 PASS id 합집합)을 **커버**.
     전제2 (전항목 PASS) — 사이클 N **items[] 전체**에 verdict=FAIL이 하나도 없어야 함. 신규 발견(레지스트리 미등록) 결함이 items[]에 FAIL로 있으면 SUCCESS 불가 — all-PASS 집계는 covered 부분집합이 아니라 items[] 전수.
       전제1·2 중 하나라도 불충족 → SUCCESS 아님. N≥2면 순위3(regression) re-emit 재확인. **N=1이면 regression(N≥2) 미도달 → continue(재시도)** — 이전 PASS 집합 없어 회귀 개념 미성립.
     커버 충족 + 커버된 전 items verdict=PASS → SUCCESS (산출물 저장 + 보고서).
       합산<70인데 전항목 PASS면 항목판정 authoritative — Evaluator 점수 재산정 1회. 재산정 후 일부 FAIL 전환 시 SUCCESS 취소 → 순위3~ 재평가.

  3. regression (N ≥ 2):
     (사이클 N-1 PASS id 집합) ∩ (사이클 N FAIL id 집합 ∪ {N items[]에서 사라진 N-1 PASS id, 단 아래 re-emit 후}) ≠ ∅
     → [STOP] REGRESSION (해당 id 보고). oscillation 첫 flip 포섭 — 별도 oscillation 체크 없음.
     ※ 전제: 사이클 N-1 레코드 필요. 누락/파싱불가 시 → 게이트 G로 [STOP] DATA_INTEGRITY (false-negative 방지).
     ※ item-set 축소 (열거 drift false-STOP 방지): N-1 PASS id가 N items[]에서 사라지면 **즉시 hard-STOP 금지** — 먼저 Evaluator에 **해당 id 1회 re-emit 요청**(verdict만 재확인). re-emit 결과: (i) PASS → 단순 열거 drift였음, regression 아님(계속) / (ii) FAIL 또는 재차 누락 → 진짜 regression = [STOP]. 1회 재확인으로 LLM 열거 drift에 의한 false Human-escalation 차단.

  4. same_issue (N ≥ 3, maxCycles≥3; maxCycles<3이면 dead row — 의도됨) — **kernel 실호출 (SSoT 단일화)**:
     PGE 메인 컨텍스트는 일반 Bash 프로세스이므로 `loop-kernel.js`의 `checkSameIssue`를 실제로 import한다(healer.md·forge-implement.md의 검증된 호출 패턴을 그대로 이식 — 재구현 금지):
     > 실행 스크립트 본문(node --input-type=module 호출 + KERNEL_OUT/STATE_FILE 처리) → `reference.md §same_issue kernel 실호출 스크립트 본문` (필요 시 Read)
     - `timeout 10` 래핑 = cr-final H2 수정(2026-07-05, healer.md/forge-implement.md 동일 적용) — kernel import가 hang해도 10초 후 강제종료로 `KERNEL_RC=124`를 돌려받아 폴백이 반드시 발동한다.
     - **정지 판정**: `KERNEL_OUT`의 `tripped==true`(동일 id가 kernel `SAME_ISSUE_MAX=3`회 누적) → [STOP] SAME_ISSUE.
     - **폴백(캡 소실 금지, fail-open)**: `KERNEL_RC≠0`(timeout exit 124 포함) 또는 `KERNEL_OUT` 빈 값이면 kernel을 무시하고 기존 로컬 판정(사이클 N-2·N-1·N 레코드 모두에서 동일 id가 FAIL)으로 즉시 폴백 — same_issue 캡이 어느 경로든 사라지지 않는다.
     → [STOP] SAME_ISSUE + "방식 전환 권고" (재진입 없음). current-analysis.md "## 이전 시도 실패 이력"에 id 기록.
     - 상세 근거·검증 이력은 `.claude/agents/healer.md §loop-kernel.js SSoT 연동`·`.claude/commands/forge-implement.md` 동 섹션 참조 — 새 script 파일 작성 금지, 동일 kernel 재사용.

  5. max_cycles (N ≥ maxCycles, PGE_CALL_CAP 초과 포함):
     → [STOP] 현재 상태 + 잔존 이슈 전달

  — 그 외 FAIL 잔존 (N < maxCycles):
     → continue: current-analysis.md "## 이전 시도 실패 이력"에 FAIL id 기록 후 Phase 2 재진입.
        Evaluator FAIL 피드백 = 접근방식 전환 입력. 재진입 시 기록된 id의 이전 접근방식 명시적 제외.
```

**Evaluator 최종 FAIL 시 — pge-failure 후보 기록 (compounding)**: 3사이클 후에도 FAIL 잔존하면 (= 이 접근 방식이 막혔다는 신호), 그 실패 패턴을 종료 핸드오버에 `pge-failure 후보:` 1줄로 기록 (`current-analysis.md "## 이전 시도 실패 이력"` 섹션 + handover 모두). `/forge-end`가 그 후보를 `learnings.sh append --category pge-failure --summary "<무엇을 하려다> <왜 막혔나>" --apply "<향후 PGE에서 이 접근 회피 — 대안은>" --evidence "<PGE 보고서 경로 or 사이클 요약>"`로 learnings에 반영. (`/forge-end` 가 이미 learnings append 수행하므로 후보 큐만 넘기면 됨.)

---

## Phase 4.6: Advisor 에스컬레이션 (경계 케이스 + 모순 시)

> Evaluator 가 60~79점이거나 Codex 와 불일치했을 때만 읽는다. PASS(80+ 동의)면 스킵.
> (2026-08-28 SKILL.md 에서 이동 — 트리거·프롬프트 원문 그대로.)


다음 조건 중 하나일 때 실행. PASS(80+ + Codex agreement)는 스킵.

**트리거**:
- Evaluator 점수 60~79점 (경계)
- Phase 4.5에서 Evaluator-Codex `disagreement` 발생

`FORGE_ADVISOR_AUTO` 환경변수가 `"off"`가 아닌 경우 `advisor-strategist` 호출:

```
Agent(
  subagent_type="advisor-strategist",
  prompt="""
<판정 맥락 (500토큰 이내)>
- Rubric 항목별 점수 + 감점 사유 요약
- Codex 리뷰 결과 (있으면)
- 산출물 핵심 부분

질문:
1. 이 판정의 놓치기 쉬운 맹점 1~2개.
2. PASS/FAIL 의견 + 핵심 근거 1~2개만 답하라.
"""
)
```

Advisor 응답 기준:
- Advisor가 PASS 의견 → **[STOP] Human 승인 게이트** 필수. Evaluator·Codex 2판정을 뒤집는 오버라이드이므로 advisor 단독 자동 확정 금지 — advisor 의견 + 근거를 Human에게 제시하고 승인 후에만 최종 PASS로 확정(advisor는 조언자, 최종 판정권자는 Human)
- Advisor가 FAIL 동의 → FAIL로 Phase 2 재실행 (기존 판정과 일치 — 오버라이드가 아니므로 자동 진행)
- 응답은 400~600토큰 이내로 제한
