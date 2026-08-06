---
name: game-bug-runtime-loop
description: "game-bug-runtime-loop 루프 실행. 트리거: /game-bug-runtime-loop 호출 시만. 종료조건: STATE.md 백로그 전항목 COMMITTED(PENDING/REPRO/FIXED/VERIFIED 0건) OR 예산도달."
disable-model-invocation: true
---

# game-bug-runtime-loop

## Goal

**Exit predicate:** STATE.md 백로그 전 항목 status=COMMITTED (PENDING/REPRO/FIXED/VERIFIED 0건) OR 예산도달

루프는 이 조건이 충족될 때까지 실행됩니다. 매 이터레이션 후 verifier가 predicate를 검사합니다.

---

## Conventions

> **이 파일은 runtime read-only입니다. 상태(카운터·타임스탬프·진행 결과)를 여기에 쓰지 마세요.**

- 변경 상태는 모두 `loops/game-bug-runtime-loop/STATE.md`에 저장
- 이 파일은 cold-start 시 디스크에서 새로 로드됨 — 여기 쓴 상태는 다음 실행 시 초기화됨
- Durable 정보만: goal predicate, action 절차, verifier 호출, stop criteria

## Pattern: pev

| Step | 내용 |
|------|------|
| 1. Read state | `loops/game-bug-runtime-loop/STATE.md` 로드 → 이전 진행 상태 복원 |
| 2. Discover | 소스(디렉토리·API·qa-report 등) 스캔 → 처리할 항목 식별 |
| 3. Act | 이터레이션 핵심 액션 실행 |
| 4. Verify | verifier 실행 (binary exit code) — exit 0 = 통과, exit 1 = 중단 |
| 5. Write state | `loops/game-bug-runtime-loop/STATE.md` 갱신 (새 위치·카운터·타임스탬프) |
| 6. Check predicate | `STATE.md 백로그 전 항목 status=COMMITTED (PENDING/REPRO/FIXED/VERIFIED 0건) OR 예산도달` 충족 시 STOP, 아니면 반복 |

verifier exit 1 시 즉시 중단. 상태 파일에 실패 이유 기록 후 HUMAN-GATES.md G2 gate 대기.

---

## Stop Conditions (loop-kernel §1)

| 조건 | 결과 |
|------|------|
| rubric_all_pass | SUCCESS |
| max_cycles (≥ 6) | STOP |
| same_issue × 3 | STOP |
| plateau (net gain ≤ 5, 2연속) | STOP |
| oscillation (pass→fail × 2) | STOP |
| regression | STOP |
| security_crit | STOP |
| budget_advisory | advisory STOP |

---

## Budget

| 항목 | 상한 |
|------|------|
| max-iter | 6 |
| call-budget | 400 (hook WARN-only) |
| wall-clock | 2시간 |

---

## 프로젝트 컨텍스트 (boardGames matgo/baduggi 게임버그)

- **SSoT 위계**: 1차=`oldBoardGames` 코드(불변), 2차=기획서. forward(old와 diverge)는 PRODUCT-DECISION.
- **DB**: localhost 127.0.0.1:3306 전용(복구룰). dev DB(13306) 금지. 경계: **쓰기 금지**(마이그레이션·seed·UPDATE/DELETE 등 전부 dev DB 13306에서만). read-only 조사 조회(SELECT)는 3306에서 허용하되, **그 결과를 baseline으로 취급하지 않는다** — baseline은 항상 localhost 127.0.0.1:3306 자체다.
- **외과적 변경**: 요청 직결 변경만. 인접 리팩토 금지. CP949 주석 보존. DB 오타(take_poin) 보존.
- **dev-log-required hook**: 코드 편집에 `// root-cause:` 주석 또는 로그 필수(없으면 편집 차단).
- 버그 조사문서: `docs/bug_report/BUG-043-044-046-047-game-investigation-20260629.md`, `BUG-031-matgo-baduggi-game-bugs.md`. CLAUDE.md §게임버그.

## 라이브 하네스 (이터레이션 전 1회 기동, STATE.md에 PID/포트 기록)

| 요소 | 기동/사용 |
|------|----------|
| matgo 서버 | `$CLAUDE_JOB_DIR/tmp/serve-matgo.sh`(DB_HOST=127.0.0.1 DB_PORT=3306 SKIP_BOOT_RESET MATGO_PORT=18370, `npm run start`=nest 재컴파일). `run_in_background`. 부팅~3분 → `curl --retry-connrefused` 폴링. 로그=matgo-server*.log |
| Unity 클라 | `mcp__unity-mcp-matgo`. `Unity_RunCommand`(C# IRunCommand→`SocketManager.Instance.Request*` 런타임구동) / `Unity_ReadConsole`(클라로그) / `Unity_ManageEditor`(Play/Stop/GetState). LOCAL=ws://172.28.220.45:18370(WSL IP). Stop→.cs 재컴파일→Play. ljw755 자동로그인. |
| node 클라 | `$CLAUDE_JOB_DIR/tmp/join2.js`(2번째사람 qa_member_a), `bot10.js`(level10봇 computer001: broadCastPracticeInfo→requestJoinRoom). socket.io-client=matgo/server/node_modules. login=`{account_id,password,room_type}` join=`{str_uuid,room_type,stakes}`. |
| 테스트계정 | ljw755·qa_member_a(parents 다름)·computer001(level10) — 로컬DB 평문비번 세팅됨. spLogin=평문비교. |

> ⚠️ 매 fix 후 검증: 서버변경→서버 재시작(~3분 재컴파일), 클라변경→Unity Stop/Play(재컴파일, ReadConsole 에러0 확인).

## Action 절차 (현재 백로그 1순위 PENDING/FIXED 항목, pev 1 cycle)

1. **STATE.md 로드** → 다음 처리 항목(status≠COMMITTED, 우선순위 최상) 선택. 하네스 미기동이면 기동.
2. **RED 재현**(repro): 하네스로 버그 증상 재현. 서버버그=서버로그 assert, 클라버그=Unity_RunCommand 시나리오+ReadConsole. 증상 확인 못하면 → `/investigate` 또는 Explore agent로 근본원인 재조사 → STATE.md repro_notes 기록.
3. **근본원인 + 분류**: old SSoT 대조(migration-auditor agent 또는 직접 grep). recovery(old 1:1) vs forward(diverge) 판정.
4. **FIX**: 외과적 수정. forward면 `// FORWARD:` 주석 + STATE.md forward_list 추가(G2 일괄승인 대상). recovery면 `// root-cause:` 주석.
5. **GREEN 검증**(verifier — actor와 분리된 고정 아티팩트):
   - server: `loops/game-bug-runtime-loop/verify/<bug>.sh` — 서버 재시작 후 로그 assert + `cd matgo/server && npx tsc --noEmit` exit0. binary exit.
   - unity: `loops/game-bug-runtime-loop/verify/<bug>.cs` — Unity Stop/Play 후 **무수정** RunCommand로 단언(예: 043 봇게임 MoveRoom→`b_is_move_room===false`). PASS/FAIL 문자열 → 세션이 판정.
   - red→green 순서 엄수(수정 전 RED 확인 → 수정 후 GREEN). 게이트=behavior-core verification-before-completion.
6. **COMMIT**: GREEN이면 해당 repo develop에 외과적 커밋(딱 변경 파일만, Unity 자동생성분=packages-lock/PackageManagerSettings/client.slnx/.meta **제외**). Haiku subagent 위임. `Co-Authored-By: Claude ...`.
7. **STATE.md 갱신**: 항목 status=COMMITTED, cycle++, elapsed 기록. predicate 검사.

## Verifier 분리 (S1)

- verifier는 fix와 **별개 고정 아티팩트**(`verify/<bug>.{sh,cs}`). 한번 작성 후 fix가 그걸 수정 금지(self-grade 방지).
- 첫 처리 시 해당 bug의 verify 아티팩트가 없으면 작성 → 이후 무수정 재사용.
- exit 0/PASS = 통과, exit 1/FAIL = 해당 bug BLOCKED 표시(same_issue×3 시) 후 다음 항목.

## same_issue / plateau (loop-kernel)

- 같은 bug verify FAIL ×3 → 그 항목 status=BLOCKED + STATE.md blocked_reason → 다음 우선순위로(STOP 아님, skip).
- 한 cycle net COMMITTED 증가 0이 2연속 → plateau STOP(G2 보고).

## How to run

```
/goal "STATE.md 백로그 전 항목 status=COMMITTED (PENDING/REPRO/FIXED/VERIFIED 0건) OR 예산도달"
```
또는 Sonnet 세션에서 이 SKILL 직접 트리거. 첫 실행 전 HUMAN-GATES.md **G1** 완료 필수.

## 종료 시 (G2)

- forward_list 비어있지 않으면 → 일괄 제시 후 Human 승인(개별 revert 가능). 미승인 forward는 revert 후보.
- 미처리/BLOCKED 항목 + 다음 세션 핸드오버 1줄.
