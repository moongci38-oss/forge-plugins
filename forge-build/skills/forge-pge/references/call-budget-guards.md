# call-budget 캡 + stop-condition 가드 상세

> `forge-pge` SKILL.md 의 **Phase 5 피드백 루프를 돌릴 때** Read 한다.
> 사이클을 한 번도 돌지 않고 1회 통과하면(Evaluator 즉시 PASS) 읽을 필요가 없다.

## call-budget 캡 + stop-condition 가드 (P1 신규 / B2 배선 2026-06-17)

**call-budget 캡**: 각 사이클(Phase 1→2→3→4) 진입 **전** `loop-budget.sh` 로 tool-call 횟수(`.calls`)를 읽어 비교한다.
> ⚠️ **지금은 막지 않는다** — `.calls` 를 쓰던 PostToolUse 훅 `loop-call-accum.sh` 는 #1358(훅 94→16)에서 지워졌고 다른 생산자가 없다. 그래서 `loop-budget.sh` 는 늘 0 을 읽어 캡에 닿지 않는다. 사이클을 끝내는 것은 **max_cycles(1순위)** 뿐이다.

```
PGE_CALL_CAP = 환경변수 PGE_CALL_CAP (기본: 600 — orchestrator급)

사이클 진입 전 (bash, 메인 컨텍스트):
  used=$(bash ${FORGE_ROOT:-~/forge}/shared/scripts/loop-budget.sh "${PGE_CALL_CAP:-600}")
  rc=$?
  if [ "$rc" -ne 0 ]; then   # exit 1 = over cap (loop-budget.sh가 cap 비교)
    "[STOP] PGE_CALL_CAP={cap} 도달 (tool-call ${used}). 사이클 {N} 시작 취소."
    현재까지 산출물 경로 + Evaluator 마지막 판정 반환
```

- `loop-budget.sh <cap> [sid]` = `${PWD}/.claude/agent-budget/${SID}.calls` 를 읽어 cap과 비교 (exit 0=under / 1=over). `.calls` 부재 시 **0 반환=inert** — 생산자 훅(`loop-call-accum.sh`)이 #1358 에서 지워져 지금은 늘 이 경우다.
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

[루프 지시] 사이클 N 완료 후 게이트 G → 결정표를 순서대로 1회 평가 (PGE_EVAL_HISTORY.jsonl 참조). 먼저 매칭되는 행에서 즉시 행동·중단, 이후 행 미평가 (상호 배타):

  G. data_integrity (전제 게이트 — 평가 가능성): Evaluator append 직후 루프(메인)가 **반드시** 사이클 N의 **eval-record**(`type=eval`, cycle=N인 마지막 라인)를 읽어 파싱(N+1로 미루지 않음 — STOP 경로가 N+1을 막을 수 있어 당-사이클 검증 필수). eval-record 누락·JSON 파싱불가 → 즉시 [STOP] DATA_INTEGRITY. (security_event 라인은 별개 type — 같은 cycle 공존이 정상이라 '중복'으로 STOP하지 않음. 순위1이 별도로 스캔.)
    **Codex Evaluator 사이클이면**(`$EVAL_MODEL` 이 `gpt-*`) 파싱 직후 전사 무결성도 본다(#1170): `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/pge-eval-raw-check.sh" {project_root}/.claude/state N --eval-model "$EVAL_MODEL"` — rc≠0(원문에 없는 줄·RAW 없음·인자 누락) → 즉시 [STOP] DATA_INTEGRITY. Claude Evaluator 면 스크립트가 `SKIP`(rc 0)을 낸다 — 레인을 빼먹으면 rc 2 로 멈춘다(조용한 통과 방지).
    > **결정론 validator = B2 트랙 (정직성)**: 진짜 mechanical JSONL 검증(파서 exit-code 강제 + per-run 격리 + 동시성 lock)은 **B2 훅(Human 승인)** 영역. inline prose는 LLM이 읽어 STOP하는 **의도**만 규정 — 100% 기계 강제 보장 아님.

  1. security_crit / rollback_trigger:
     (a) Phase 4.5에서 Codex CRITICAL 발견 시 → 루프가 **별도 라인을 append**: `{"cycle": N, "security_event": [{"id":"<req:chk>","src":"codex"}]}`. 새 라인 = append-only 유지 + 중단/재개에도 보존(durable). (in-memory 휘발 금지 — fail-open 방지.)
     (b) JSONL의 사이클 N `security_crit[]` ∪ 전체 `security_event` 라인 중 하나라도 비어있지 않으면 → [STOP] SECURITY_CRIT.
     (c) Sprint Contract `rollback_trigger`(보안/비보안) 충족 → [STOP] (비보안은 `[ROLLBACK]` 메시지). rollback_trigger는 prose 조건이라 structured-id 비교의 명시적 예외(Human이 작성한 hard-STOP 트리거).

  2. rubric_all_pass:
     전제1 (커버리지) — 사이클 N items의 id 집합이 (Sprint Contract eval_ids 레지스트리 전체 ∪ 직전 사이클 PASS id 합집합)을 **커버**.
     전제2 (전항목 PASS) — 사이클 N **items[] 전체**에 verdict=FAIL이 하나도 없어야 함. 신규 발견(레지스트리 미등록) 결함이 items[]에 FAIL로 있으면 SUCCESS 불가 — all-PASS 집계는 covered 부분집합이 아니라 items[] 전수.
       전제1·2 중 하나라도 불충족 → SUCCESS 아님.
     커버 충족 + 커버된 전 items verdict=PASS → SUCCESS (산출물 저장 + 보고서).
       합산<70인데 전항목 PASS면 항목판정 authoritative — Evaluator 점수 재산정 1회. 재산정 후 일부 FAIL 전환 시 SUCCESS 취소 → 순위3~ 재평가.

```

**Evaluator 최종 FAIL 시 — pge-failure 후보 기록 (compounding)**: 3사이클 후에도 FAIL 잔존하면 (= 이 접근 방식이 막혔다는 신호), 그 실패 패턴을 종료 핸드오버에 `pge-failure 후보:` 1줄로 기록 (`current-analysis.md "## 이전 시도 실패 이력"` 섹션 + handover 모두). `/forge-end`가 그 후보를 `learnings.sh append --category pge-failure --summary "<무엇을 하려다> <왜 막혔나>" --apply "<향후 PGE에서 이 접근 회피 — 대안은>" --evidence "<PGE 보고서 경로 or 사이클 요약>"`로 learnings에 반영. (`/forge-end` 가 이미 learnings append 수행하므로 후보 큐만 넘기면 됨.)

---

## Phase 4.6: Advisor 에스컬레이션 (경계 케이스 + 모순 시)

> Evaluator 가 60~79점이거나 Codex 와 불일치했을 때만 읽는다. PASS(80+ 동의)면 스킵.

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
