---
description: "세션 완전 종료 — 서술형 handover 작성(단일 레인) + 기록 무누락 게이트. 트리거: \"세션 종료\", \"end\", /forge-end (구 /end-opus·/end-sonnet 통합)."
group: ops
---

# /forge-end

**세션을 완전히 종료할 때** 실행한다. 다음 세션(나 또는 팀원)이 `/forge-start`로 이어받는다.

`/end-opus`·`/end-sonnet` 통합본. 모델 구분은 디렉토리가 아니라 **frontmatter `model:` 필드**로만 한다(레인 단일화).

> 같은 세션을 계속 쓸 거면 여기가 아니라 `/forge-checkpoint`다(3분법: 새로 연다=start / 계속 쓴다=checkpoint / 완전히 닫는다=end).

> 연속성 계약 ①~⑦ 전문 · 경로 SSoT · handover 8절 → `rules-on-demand/handover-canon.md`

## 실행

### 1. 착지 경로 결정 (계약 ⑤ — 워크트리 우회)

```bash
eval "$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-landing.sh" "$(pwd)")"
mkdir -p "$HANDOVER_DIR"
echo "착지: $HANDOVER_DIR (worktree=$IS_WORKTREE, reason=$LANDING_REASON)"
```

워크트리 cwd면 `HANDOVER_DIR`은 **`$FORGE_OUTPUTS/.claude/handover`(논리 경로)** 로 강제된다 — 워크트리 안에 쓰면 회수 스캔이 워크트리를 배제하므로 구조적 고아가 된다(F6). 스크립트 부재 시 폴백 = `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/handover`.

### 2. **[게이트] 기록 무누락 — 저장 전 수집원 실측** (계약 ⑦, 필수)

먼저 기계로 훑는다. **기억으로 회상하지 않는다.**

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" collect "$(pwd)"
```

출력의 각 키를 아래 절에 **1:1로** 반영한다. `session-only`로 표시된 항목(백그라운드 작업·사용자 지시 미이행)은 스크립트가 알 수 없는 세션 내 사실이므로 **AI가 세션 이력을 훑어 직접 채운다**.

| 수집원 | 실측 근거 | handover 절 |
|---|---|---|
| 미완료 태스크 | `PLAN_TODO_FILES` + 세션 태스크 목록 | `## 미완료 태스크` |
| [STOP]·승인 대기 | `STOP_PENDING*` | `## 승인 대기([STOP])` |
| 미커밋 변경 | `UNCOMMITTED_COUNT`/`UNCOMMITTED_FILE` | `## 미커밋 변경` |
| 열린 PR·브랜치 | `OPEN_PR_COUNT`·`BRANCH`·`UNPUSHED_COMMITS`·**`UNPUSHED_REPO_N`·`UNPUSHED_TOTAL`**(다중 레포, 아래 §6b)·**`OPEN_PR_REPO_N`·`OPEN_PR_COUNT_SCOPE`·`OPEN_PR_COUNT_CWD`·`OPEN_PR_COUNT_PARTIAL`**(2026-09-03 신설) | `## 열린 PR·브랜치` |

> ⚠️ **`OPEN_PR_COUNT` 의 의미가 2026-09-03 에 바뀌었다** — 종전에는 cwd 레포 하나였고 지금은
> 워크스페이스 여러 레포의 **합계**다(cwd·FORGE_ROOT·FORGE_OUTPUTS·중첩 repo). 종전 의미의 값이
> 필요하면 `OPEN_PR_COUNT_CWD` 를 읽는다. 범위는 `OPEN_PR_COUNT_SCOPE` 가 밝힌다.
> 🔴 **`OPEN_PR_COUNT_PARTIAL=yes` 면 그 숫자를 전량으로 읽지 마라** — 일부 레포를 재지 못했다는
> 뜻이다(gh 실패·중첩 탐색 절단·타임아웃). 레포별 내역은 `OPEN_PR_REPO_N` 에 `경로|건수` 로 있고,
> 못 잰 레포는 건수가 `?` 이며 `_REASON` 이 사유를 적는다.
> 근거: 중첩 repo 를 못 봐서 PR 4건이 열려 있는데 `OPEN_PR_COUNT=0` 이 handover 에 실린 실사고.
| 진행 중 백그라운드 작업 | 세션 이력(도구 호출) | `## 진행 중 백그라운드 작업` |
| learnings 미기록 misfire | `LEARNINGS_LAST`·`LEARNINGS_PARSE_BAD` + 세션 misfire 회고 | `## learnings 미기록 misfire` |
| 사용자 지시 미이행 | 세션 이력(사용자 발화) | `## 사용자 지시 미이행` |
| **백그라운드 워커 생존** | `WORKER_BRIEF*`·`WORKER_WORKTREE*`·`RECENT_CHANGES_CWD` | `## 백그라운드 워커 생존` |
| **팀장 위임 기록** | 아래 §2 회수 블록의 `BUS_WORKER_N`(dormant)·`WORKER_WORKTREE`(live) | `## 팀장 위임 기록` |

**[STOP] 해소 판정 + 마커 정리** — `STOP_PENDING*`는 마커를 **탐지만 하고 정리하지 않아**, 이미 해결된 게이트가 다음 세션까지 "대기 중"으로 남는다(누적되면 어느 것이 진짜 대기인지 구분 불가). 종료 시 각 마커에 대해 **STOP 해소** 여부를 판정한다 — 그 승인이 이뤄졌거나 해당 작업이 완료·기각됐으면 원 문서의 마커를 제거하거나 `[STOP-RESOLVED: {날짜} {사유}]`로 치환하고, handover `## 승인 대기([STOP])` 절에는 **미해소분만** 남긴다. 판정 근거 없이 지우지 않는다 — 애매하면 미해소로 둔다.

**learnings 무결성 WARN (P0-4)** — `LEARNINGS_PARSE_BAD`가 `0`이 아니면(깨진 줄 존재, 또는 `?` = 검사 불가) 완료 보고에 **WARN 1줄**을 남긴다: `learnings 무결성 WARN: 파싱 불가 {LEARNINGS_PARSE_BAD}줄 (line {LEARNINGS_PARSE_BAD_LINES})`. 깨진 줄은 회상(learnings 검색·자동 로드)에서 **조용히 유실**되므로, 5절의 misfire append 전에 확인한다. **WARN이지 게이트 FAIL이 아니다** — 종료를 막지 않는다.

#### 백그라운드 워커 생존 절 규약 (2026-07-26 실사고 — compact 후 워커 6기 유실)

이 절은 **"실행 중"이라는 텍스트 단정을 금지**한다. 워커 1기당 아래 4개를 모두 적는다:

```
- {워커명} / 브리프: {영속 경로} / 산출: {워크트리·출력 경로}
  생존 실측: 최근 15분 변경 {N}건, 마지막 변경 {YYYY-MM-DD HH:MM} (collect의 WORKER_WORKTREE 행)
```

- **(b) 브리프 영속 확인이 게이트다** — `WORKER_BRIEF_PERSISTED`가 `yes`가 아닌데 활성 워커가 있으면 **저장 전에 브리프를 디스크에 영속화**하고(예: `$CLAUDE_JOB_DIR/tmp/worker-briefs/{name}.md` 또는 `$FORGE_OUTPUTS/11-platform/pipelines/worker-briefs/`) 그 경로를 기록한다. 미영속 상태로 저장하면 **게이트 FAIL** — 컨텍스트가 날아가면 재스폰 불가가 된다(실사고 원인).
- **(a) 생존 증거는 수치로만** — `recent_changes`·`last_change`는 collect가 실측한 값을 그대로 옮긴다. 값을 추정·반올림하지 않는다.
- **(c) 재개 절차 1줄 필수**: `재개: 생존 실측 → 15분+ 무변화 & 핑(SendMessage) 무응답이면 사망 판정 → 영속 브리프에서 재스폰`.
- 워커가 없으면 `없음`.

**(c) "없음"도 명시 기록** — 해당 없으면 그 절에 `없음`이라고 적는다. 침묵(안 봄)과 없음(봤는데 없음)은 다르다. 절을 통째로 빼면 게이트 FAIL이다.

#### 세션 버스 워커 로스터 규약 (dormant — live 프로세스 아님)

버스 레지스트리 대조 스텝(위 (a)~(c) 로스터와 **별도로** 실행):

```bash
RECALL_OUT="$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" "$(pwd)" 2>&1)"; RECALL_RC=$?
if [ "$RECALL_RC" -ne 0 ]; then
  echo "BUS_WORKER_ERROR: session-recall.sh 실행 실패(exit $RECALL_RC) — 0건과 구분, 원인 확인 후 재시도"
else
  echo "$RECALL_OUT" | grep -E '^BUS_WORKER' || echo "BUS_WORKER_ERROR: 스크립트는 성공했으나 BUS_WORKER 라인이 전혀 없음(비정상 — 0건과 다름, 스크립트 버그 의심)"
fi
```

**핵심 구분**: 위 `WORKER_WORKTREE=` 로스터는 **실행 중인 백그라운드 프로세스**(live)를 가리킨다. 세션 버스 워커(`--resume` 방식)는 `$HOME/.claude/state/session-bus.jsonl`에 dormant 상태로 등록만 돼 있을 뿐 idle 프로세스가 존재하지 않는다 — **dormant 세션 수와 live 프로세스 수는 다른 개념**이다. 위 (c)의 "15분+ 무변화 & 핑 무응답 = 사망 판정" 로직을 버스 워커에는 적용하지 않는다(dormant가 정상 상태이지 사망 신호가 아니다).

`## 백그라운드 워커 생존` 절 안에 아래 표를 **분리된 표**로 추가한다. `BUS_WORKER_N=name|sid8|cwd|age|dormant`를 그대로 옮기고, "인계 지시"는 AI가 판단해 채운다(다음 세션이 이 워커에 무엇을 시켜야 하는지 1줄, 없으면 `-`):

```markdown
### 세션 버스 워커 (dormant — live 프로세스 아님)
| name | sid8 | cwd | 최종응답 | 인계 지시 |
|---|---|---|---|---|
| {name} | {sid8} | {cwd} | {age}분 전 | {인계 지시 또는 -} |
```

워커 0기(`BUS_WORKER_COUNT=0`)면 표 대신 **`없음`** 이라고 명시한다(침묵 금지 — 안 봄과 봤는데 없음을 구분).

### 3. handover 작성

`$HANDOVER_DIR/YYYY-MM-DD-HHMM-{slug}.md`, frontmatter 필수 **8필드** 고정:

```markdown
---
date: 2026-07-26
time: "1830"
model: opus            # 세션 모델 자동 감지 (opus|sonnet|fable|...)
slug: kebab-case-summary
status: open           # open | closed
project: forge         # repo 이름으로 정규화 (워크트리도 **주 체크아웃** 이름으로)
worktree: ${FORGE_ROOT:-$HOME/forge}/.claude/worktrees/foo   # 소유 축 — 이 세션의 작업 폴더 절대경로
session: 561052-b1c2d3e4                              # 추적용 sid (소유 판정에는 안 씀)
---
```

**`worktree`·`session` 은 2026-08-24 신설 — 소유권 필드다.** 아래 명령으로 **기계 산출**한다
(손으로 적지 않는다 — 손으로 적으면 그게 곧 오기다):

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/worktree-scope.sh" | grep '^WORKTREE=' | sed 's/^WORKTREE=/worktree: /'
echo "session: ${CLAUDE_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-unknown}}"
```

> 구 표기 "필수 5필드"는 실제로 6개(`date·time·model·slug·status·project`)를 나열한
> **오기**였다(2026-08-24 정정). 신설 2개를 더해 지금은 8개다.

왜 두 개인가: **소유 판정 축은 `worktree`(작업 폴더) 하나**다. 같은 폴더를 이어받은 다음
세션은 그 작업의 정당한 상속자라서 sid 로 끊으면 오히려 연속성이 깨진다. `session` 은
"누가 썼나"를 되짚기 위한 추적용이다.

⛔ **공유 체크아웃에서는 이 필드의 판별력이 없다** — `${FORGE_ROOT:-$HOME/forge}` 본체에서 도는 모든 세션이
같은 값을 적으므로 서로를 `MINE` 으로 본다. 승계(같은 폴더를 이어받는 다음 세션)에는 맞지만
**동시 세션에는 적용되지 않는다.** 소유를 실제로 가르려면 `EnterWorktree` 로 자기 폴더에서
일해야 한다(2026-08-24 cr-final 지적 — 알려진 잔여 한계).

⚠️ **`project` 로는 부족하다.** `${FORGE_ROOT:-$HOME/forge}` 를 만지는 모든 세션이 똑같이 `project: forge` 라고
적으므로, 그것만으로는 **내 작업과 남의 작업이 구분되지 않는다.** 이 필드가 없던 시절에는
사람이 매 세션 눈으로 판정해 handover 본문에 적었고, 다음 세션은 그 판정을 그대로 믿었다.

본문 = §2의 8절 + 아래 서술형 필수 절:

- `## 이번 세션에 한 일` — 파일 경로 + 변경 요약(+커밋 해시)
- `## 결정과 근거` — 결정 + 기각한 대안(AD-N)
- `## 실패한 시도와 이유` — `시도: {무엇} → 실패: {증상} → 이유: {원인} → 교훈: {다음 세션 지침}` (**부재 시 WARN** — 암묵지 표면화 카논)
- `## 사용자 제약·지시 (DO / DON'T)` — `- [DON'T] {내용} (근거)` / `- [DO] {내용}`
- `## 다음 세션이 이어받을 것` — 우선순위 순. ⚠️ **이번 세션에 만들어진 적용계획의 미완 `P0` 항목을 여기 옮겨 적는다**(아래 절).
- `## 열린 질문` — 미결 트레이드오프
- `## 팀장 위임 기록` — 이번 세션이 팀장에게 보낸 일과 받은 답. 없으면 **`없음`** 이라고 적는다(침묵 금지)

#### 적용계획 P0 를 인계 목록에 올린다 (2026-09-01 신설)

**이번 세션에 적용계획(`apply-plan`)이 만들어졌으면, 그 안의 미완 `P0` 항목을
`## 다음 세션이 이어받을 것` 에 그대로 옮겨 적는다.**

쉽게 말하면 **계획서를 서랍에 넣고 끝내지 말고, 할 일 쪽지를 문에 붙여 두는 것**이다.
계획서는 계획서 폴더에 남고 다음 세션은 그 폴더를 열어 보지 않는다.

- **왜 생겼나(2026-09-01 실측)**: 2026-08-30 영상 3건의 적용 항목 6개 중 **착지 0건**.
  그중 하나는 계획서가 스스로 *"5분 작업"* 이라 적고 검증 명령까지 써 둔 README 1줄이었다.
  그런데 그날부터 09-01 까지 handover **5건 어디에도 실리지 않았다** — 이월된 게 아니라
  **애초에 인계 목록에 오르지 못했다.** 실행 능력이 아니라 **배선의 부재**였다.
  같은 날 README 3개를 실제로 최신화한 세션조차 이 1줄은 몰랐다.
- **무엇을 적나**: `- {한 줄 요약} (계획: {파일명})`. 계획서 경로를 함께 적어야
  다음 세션이 맥락을 찾아간다.
- **P1·P2 는 옮기지 않는다.** 그건 세션 시작 회수의 숫자(`ITEMS_OPEN`)로 보이면 된다 —
  전부 옮기면 인계 목록이 곧 계획서 사본이 되고, 그러면 아무도 안 읽는다.
- **이번 세션에 만든 계획이 없으면 이 절은 건너뛴다.** 남의 계획을 끌어오지 않는다.
- 재현(지금 미완 P0 이 몇 건인지): `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/apply-plan-closure.sh" | grep ^P0_`
- ⚠️ **이것은 독촉 장치가 아니다.** 옮겨 적는 것까지가 이 절의 일이고, 하라고 재촉하거나
  일괄 체크하지 않는다(계측기 설계 §5 — 일괄 체크는 종결이 아니라 증거 위조다).
- 폐기조건: 적용계획 P0 의 세션 간 착지율이 2분기 연속 80% 를 넘으면 이 절을 재검토한다.

#### `## 팀장 위임 기록` 작성법 (2026-08-26 신설 — 팀 라우팅)

총괄 세션이 팀장에게 무엇을 시켰고 무엇을 돌려받았는지를 **다음 세션이 이어받을 수 있게** 남긴다.
쉽게 말하면 **부서에 넘긴 일의 인수인계 쪽지**다 — 이게 없으면 다음 세션은 그 일이 진행 중인지
끝났는지 몰라서 **처음부터 다시 시킨다**.

방 상태는 저장 직전에 실측한다(문서 기억으로 적지 않는다). **출처는 위 §2 회수 블록이다** —
`BUS_WORKER_N=name|sid8|cwd|age|dormant` 가 dormant 방을, `WORKER_WORKTREE=` 가 live 프로세스를
가리킨다. 두 목록을 겹쳐 보고 그 방이 어느 쪽인지 적는다.

⚠️ **`forge-session-bus.sh list` 만 보고 적지 마라.** 그 출력에는 STATE 열이 없다 —
등록된 방과 마지막 응답 시각만 보여 주므로, 거기서 dormant/live 를 읽으면 **추측**이다
(버스 방은 등록만 돼 있고 프로세스가 없는 것이 정상이라 전부 dormant 로 보인다).

```markdown
## 팀장 위임 기록
| 팀slug | 보낸 브리프(요약) | 수신 응답(요약) | 방 상태 |
|---|---|---|---|
| {slug} | {한 줄 요약} | {한 줄 요약 또는 미수신} | dormant / live |
```

- **방 상태**: `dormant` = 버스에 등록만 돼 있고 실행 중 프로세스가 없는 정상 상태 ·
  `live` = 지금 돌고 있는 프로세스가 있다. **dormant 를 사망으로 읽지 않는다**(위 §2 핵심 구분과 같은 축).
- 응답을 못 받은 위임은 `미수신` 으로 적고 `## 다음 세션이 이어받을 것` 에도 1줄 올린다 —
  표에만 적히면 다음 세션이 안 본다.
- 위임 규약·팀 목록 전문 → `rules-on-demand/team-routing.md`

#### 결정과 의문을 같은 절에 섞지 않는다 (2026-08-24 신설)

**사용자가 내린 결정은 `## 사용자 제약·지시` 에 결정문 그대로 적는다.** AI 쪽 유보·의문은
`## 열린 질문` 에만 적는다. 둘을 섞으면 **결정이 질문으로 녹아 사라진다.**

쉽게 말하면: 사장이 "이 방향으로 간다"고 정한 걸 회의록에 *"이 방향이 맞을까요?"* 라고 적으면,
다음 회의는 실행이 아니라 **재논의**로 시작한다.

- ✅ `- [DO] 에이전트를 팀원 구성으로 전환한다 (사용자 결정 2026-08-24)`
  + `## 열린 질문` 에 따로: `팀 전환 시 결과 자동 반환 문제를 어떻게 푸나`
- ❌ `## 열린 질문` 에만: `팀 전환의 실익이 무엇인가 — 저울이 아직 없다`
  ← 결정이 통째로 증발했다. 다음 세션은 **할지 말지부터** 다시 묻는다.

판정: 사용자가 **명령형·의지형**으로 말했으면(“~하겠다/~해줘/~로 간다”) 그것은 결정이다.
AI 가 그 결정에 이견이 있으면 **결정을 지우지 말고** `## 열린 질문` 에 이견을 병기한다.

근거: 2026-08-24 실사고 — 사용자의 "에이전트를 팀원으로 구성하겠다"가 handover 에서
"팀 전환의 실익이 무엇인가"로 격하돼, 다음 세션이 그것을 **열린 판단**으로 읽고 재논의를 제안했다.
폐기조건: 결정→질문 격하가 2분기 연속 0건이면 이 항을 재검토한다.

#### 남의 작업 상태를 내 handover 본문에 적지 않는다 (2026-08-24 신설)

`## 미커밋 변경`·`## 열린 PR·브랜치` 에는 **이 작업 폴더(`worktree:`) 소유분만** 적는다.
공유 체크아웃의 dirty 파일 수·타 세션 브랜치를 본문에 섞으면 다음 세션이 그것을 **자기 상태로**
읽는다. 굳이 남겨야 하면 별도 절 `## 타 세션 상태 (참고 — 내 소유 아님)` 에 격리하고,
**판정 근거(폴더 경로)를 함께 적는다.**

- ✅ `## 타 세션 상태 (참고 — 내 소유 아님)` / `- ${FORGE_ROOT:-$HOME/forge} (공유 체크아웃): dirty 81건, 브랜치 feat/x`
- ❌ `## 미커밋 변경` / `- ⚠️ ${FORGE_ROOT:-$HOME/forge} dirty 85건 = 타 세션 작업, 손대지 않음`

근거: 2026-08-24 — 직전 handover 가 타 세션의 dirty 85건을 `## 미커밋 변경` 에 적었고,
다음 세션이 그 브랜치를 자기 오리엔테이션에 포함해 보고했다.
폐기조건: 회수기 소유 라벨(`HANDOVER_MINE`/`OTHER`)이 안정화돼 본문 서술이 불필요해지면 삭제.

> `*-auto.md`(훅 자동생성 스텁)와 구분되도록 파일명에 `-auto` 접미를 쓰지 않는다 — 회수 시 서술형/auto는 파일명·헤더 수로 판정된다.

### 4. **[게이트] 자가 대조 — 저장 직후 검증** (계약 ⑦(b))

```bash
H="$HANDOVER_DIR/{파일명}"
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" verify "$H"

# 민감정보 스캔 — handover 는 git 추적되어 팀 레포에 push 된다 (WARN, 저장을 막지 않음)
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-secret-scan.sh" "$H"

# 미보고 갭 대조 — 실패는 적었는데 갭 리포트가 없으면 표면화한다 (WARN)
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/gap-signal-scan.sh" "$H"
```

두 스캔은 **WARN 이지 BLOCK 이 아니다**(AD-168). 발견 항목은 지울지 남길지 사람이 정하고,
남기기로 했으면 그 판단을 handover 에 적는다 — 판단을 남기는 것이 요점이다.
규약 → `rules-on-demand/handover-canon.md §팀 공유 vs 개인`

- `VERIFY=PASS` → 통과. 완료 보고에 `기록 무누락 게이트 PASS (8/8절)` 1줄 포함.
- `VERIFY=FAIL` → `SECTION_MISSING`/`SECTION_EMPTY`로 지목된 절을 **보완한 뒤 재실행**. PASS 전에는 세션 종료 선언 금지.

#### INDEX 갱신 (F9 — 기계 생성, 수동 편집 금지)

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-manager.sh" refresh-index-dir "$HANDOVER_DIR" || true
```

### 5. learnings·misfire 반영

이번 세션 misfire(재작업·오추정·스킬 오작동·검수 지적·게이트 오탐)가 있었는데 learnings에 없으면 **지금 append**한다:

```bash
# 하네스/forge misfire → 전역 레인. `--global` 을 빼면 cwd 의 repo 루트 기준 PROJECT 레인으로
# 조용히 떨어진다. /forge-end 는 거의 항상 프로젝트 repo 안에서 실행되므로 생략 = 오라우팅이 기본값이다.
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/learnings.sh" append --global --category <process|decision|pge-failure|user-directive> \
  --summary "<무엇을 하려다 왜 막혔나 1줄>" --apply "<다음에 이렇게>" \
  --evidence "session:{slug} | commit:{hash}"

# 프로젝트 고유 버그 → 해당 repo 레인. 그 repo 안에서 `--global` **없이** 실행한다.
```

라우팅 — **하네스/forge misfire = `${FORGE_ROOT:-$HOME/forge}/.claude/learnings.jsonl`**(git 추적 = 전 PC 전파, `--global`) / **프로젝트 고유 버그 = 해당 repo**(`--global` 생략). 없으면 skip(WARN-first, 강제 아님).

⚠️ append 는 성공 시 stderr 에 `→ <착지 파일 경로>` 를 찍는다. **rc=0 과 id 출력은 레인을 증명하지 않으므로** 그 경로를 눈으로 확인할 것(2026-08-04 실사고: 하네스 misfire 2건이 `forge-outputs` 레인으로 조용히 떨어졌다).

하네스 결함·개선점은 별도로 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/harness-gaps/YYYY-MM-DD-{슬러그}-harness-gaps.md`에 저장한다 — **단일 폴더**다. 구 `main/`·`local/` 2분류는 2026-08-04 폐지됐고(`b24920ff`), 적용 범위는 폴더가 아니라 항목표의 **`적용` 열**(main=git 전파 / local=그 PC 한정)로 표현한다. 항목마다 **`재현:` 명령 1줄 필수** — 착수 전 `still-real.sh --plan` 게이트의 입력이 된다. 규약 SSoT → `rules-on-demand/forge-core-workflow-aux.md §하네스 갭 리포트 규약`

#### 하네스 갭 후보 집계 (W10, 2026-08-10)

세션 동안 훅이 BLOCK/WARN/BYPASS 로 조용히 막았던 것 전체를 집계한다. `since` 기준은 **직전 handover 파일의 mtime**이다 — checkpoint 파일이 아니다: `/forge-checkpoint`만 남기고 `/forge-end` 없이 죽은 세션은 handover 를 안 남기므로, 그 세션의 미처분 후보도 이 집계가 자동으로 소급해 잡는다(죽은 세션 회수 — 별도 배선 불필요, `/forge-start`는 handover 를 쓰지 않으므로 이 기준을 앞당기지 않는다).

```bash
HG_PREV=$(ls -t "$HANDOVER_DIR"/*.md 2>/dev/null | grep -v '\.consumed$' | head -1 || true)
if [ -n "$HG_PREV" ] && [ -f "$HG_PREV" ]; then
  HG_SINCE=$(date -u -r "$HG_PREV" +%Y-%m-%dT%H:%M:%SZ)
else
  HG_SINCE="1970-01-01T00:00:00Z"
fi
python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/warn-digest.py" --gap-total-since "$HG_SINCE"
```

0건이면 그대로 `🔧 하네스 갭 후보: 0건`을 출력한다(안 봄과 봤는데 없음을 구분 — 침묵 금지). 1건+ 이면:
- `갭`으로 처분된 항목 → 위 harness-gaps 리포트에 `재현:` 명령과 함께 나열.
- 판정이 안 남은 나머지("미처분") → handover 본문에 `## 하네스 갭 후보 (미처분)` 절을 만들어 **`미처분 N건`**만 박는다(0건이면 그 절에도 `0건`이라고 명시). 개별 항목을 여기서 강제로 지금 판정하지 않는다 — 종료를 막지 않는다(WARN-first, AD-168).

### 6. 팀 공유 동기화 (advisory·fail-open)

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/debug-knowledge-sync.sh" 2>/dev/null || true
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/memory-sync.sh" push 2>/dev/null || true
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-outputs-autosync.sh" 2>/dev/null || true
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/index-refresh.sh" 2>/dev/null || true
```

kill-switch: `FORGE_DEBUG_KNOWLEDGE_SYNC=off` / `FORGE_MEMORY_SYNC=off` / `FORGE_AUTOSYNC=off` / `FORGE_AUTO_REINDEX=off`. 실패해도 세션 종료를 막지 않는다.

### 6b. 미푸시 커밋 게이트 (WARN — 2026-09-02 신설)

§2 `collect` 출력의 **`UNPUSHED_TOTAL`이 `0`이 아니면** 아래를 그대로 출력한다. 레포마다 1줄:

```
⚠️ 미푸시 {UNPUSHED_TOTAL}커밋 — 이 머신에만 있다.
   {repo}: {branch} +{n}  →  git -C {repo} push
```

`{repo}·{branch}·{n}` 은 `UNPUSHED_REPO_N={경로}|{브랜치}|{개수}` 를 그대로 옮긴다(추정·반올림 금지). 개수가 `?` 인 레포는 같은 줄에 `_REASON` 을 붙여 적고 **0으로 세지 않는다** — `UNPUSHED_TOTAL_PARTIAL=yes` 면 합계 뒤에 `(일부 미측정)` 을 붙인다.

그리고 handover **`## 열린 PR·브랜치` 절에 레포별로 1줄씩** 적는다. 여기 안 적으면 다음 세션이 또 못 본다.

```markdown
- 미푸시: ${FORGE_ROOT:-$HOME/forge}-outputs (develop) +35 — 사유: {아래 셋 중 하나}
```

**push 하지 않고 끝낼 거면 그 사유를 반드시 함께 적는다.** 이 레포 규범은 *"작업은 머지까지가 완료다"* 이고 보류가 정당한 경우를 셋으로 못박아 뒀다 — ①검수 FAIL 로 고쳐야 함 ②`[STOP]` 승인 대기 ③명시적 인계. **이 셋이 아니면 보류가 아니라 미완료**이므로 그렇게 적는다.

- ⛔ **자동으로 push 하지 않는다.** push 는 외부로 나가는 행위다 — 게이트는 **보여주고 명령을 주는 것**까지다. 실행은 사람이 한다.
- ⛔ **BLOCK 이 아니다**(AD-168 WARN-first). 미푸시가 있어도 세션 종료를 막지 않는다.
- ⛔ **새 독촉 알림을 만들지 않는다.** 세션 종료 시 1회 출력이고, 훅·배너에 배선하지 않는다.
- ⚠️ **공유 체크아웃이면 미푸시 커밋에 다른 세션이 만든 것이 섞일 수 있다.** 같은 사람의 커밋이라 push 대상인 것은 맞지만, **내가 만든 것인 양 보고하지 않는다** — 애매하면 `(작성자 미분류)` 를 붙인다.
- ⚠️ 이 수치는 `git fetch` 없이 로컬 원격추적 ref 로 잰다. 낡았으면 **과대보고**될 수 있다(있는 걸 없다고 하지는 않는다). 정확한 수가 필요하면 `git -C {repo} fetch` 후 재측정한다.

근거: 2026-09-02 실사고 — `${FORGE_ROOT:-$HOME/forge}-outputs` 가 로컬 35 / 원격 44 커밋으로 **4일간(08-29~09-02) 갈라져** 있었는데, 계측기가 cwd 레포(`${FORGE_ROOT:-$HOME/forge}`)만 봐서 `UNPUSHED_COMMITS=0` 을 냈고 그 0 이 handover 에 "미푸시 없음"으로 적혔다. 쉽게 말하면 **집 안 거실만 보고 "집에 쓰레기 없다"고 한 것**이다 — 쓰레기는 부엌에 있었다. 사람이 물어보고 나서야 발견됐다. 틀린 안심은 측정 없음보다 나쁘다.
재현: `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" collect "$(pwd)" | grep -E '^UNPUSHED_(REPO|TOTAL|REPOS)'`
폐기조건: 미푸시 적체가 2분기 연속 0건이거나, push 를 강제하는 별도 훅이 배선되면 이 절을 재검토한다.

### 7. 미소비 체크포인트 정리

이번 세션이 `/forge-checkpoint`를 남겼다면 handover가 그것을 대체하므로 소비 표시한다. 단, `CHECKPOINT_LATEST`는 **전체에서 mtime 최신**일 뿐 소유 세션을 가리지 않으므로(M-1/G-08, 2026-08-15 — 멀티세션 환경에서 남의 체크포인트에 `.consumed`를 찍어 그 세션의 복구 지점을 지우는 실사고가 있었다) **소유 검증 후에만** 소비 표시한다:
```bash
eval "$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-landing.sh" "$(pwd)")"
CP=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" | grep '^CHECKPOINT_LATEST=' | cut -d= -f2-)
MY_SID="${CLAUDE_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-}}"
if [ -n "$CP" ] && [ -f "$CP" ]; then
  CP_SID=$(grep -m1 '^session:' "$CP" 2>/dev/null | sed -E 's/^session:[[:space:]]*"?([^"[:space:]]*)"?.*/\1/')
  if [ -n "$MY_SID" ] && [ -n "$CP_SID" ] && [ "$CP_SID" != "unknown" ] && [ "$CP_SID" != "$MY_SID" ]; then
    echo "타 세션 체크포인트 — 건너뜀 ($(basename "$CP"), session=$CP_SID) — 소비 표시 안 함"
    CP=""
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      # cr-final MEDIUM 반영(2026-08-15): 구 `grep -v '\.consumed$'` 는 죽은 필터였다 —
      # 마커는 `X.md.consumed` 라 `*.md` glob 에 애초에 안 걸린다. 기소비 여부는 마커
      # **존재**로 판정한다. (fallback 정렬은 mtime(ls -t) 근사 — 정본 최신성은
      # session-recall 의 frontmatter 기준이지만, 자기 소유 후보 간 근사로 충분)
      [ -f "${f}.consumed" ] && continue
      fsid=$(grep -m1 '^session:' "$f" 2>/dev/null | sed -E 's/^session:[[:space:]]*"?([^"[:space:]]*)"?.*/\1/')
      [ "$fsid" = "$MY_SID" ] && { CP="$f"; break; }
    done < <(ls -t "$CHECKPOINT_DIR"/*.md 2>/dev/null)
  elif [ -z "$MY_SID" ] || [ -z "$CP_SID" ] || [ "$CP_SID" = "unknown" ]; then
    # 2026-08-16 (P3-B): 판별 불가면 **소비 표시를 하지 않는다.**
    #   구 동작은 fail-open 소비였고, 그래서 남의 체크포인트에 .consumed 를 찍어
    #   그 세션의 복구 지점을 지웠다(실사고 L-20260815T054053).
    #   소비 표시는 비가역이고, 안 찍었을 때의 대가는 "다음 세션에 다시 안내됨"뿐이다 —
    #   **지워지는 것보다 두 번 물어보는 편이 낫다.**
    echo "WARN: 소유 판별 불가(SID 미설정 또는 구형 체크포인트: $(basename "$CP")) — 소비 표시 안 함"
    echo "  → 내 것이 확실하면 직접: touch \"${CP}.consumed\""
    CP=""
  fi
fi
[ -n "$CP" ] && touch "${CP}.consumed"
```
불일치로 건너뛴 경우 남의 체크포인트는 그대로 미소비 상태로 남는다 — 그 세션이 `/forge-start`·`/forge-checkpoint` §6에서 정상 회수한다.

## 체크리스트

- [ ] 착지 경로 확인 (워크트리면 FORGE_OUTPUTS 논리 경로)
- [ ] `session-record-audit.sh collect` 실행 → 8 수집원 실측
- [ ] frontmatter **8필드**(`date·time·model·slug·status·project·worktree·session`) 기입 — `worktree`·`session` 은 위 명령으로 **기계 산출**
- [ ] 8절 + 서술형 필수 절 작성 ("없음"도 명기) — 백그라운드 워커 절은 생존 실측 수치·브리프 경로·재개 1줄 포함
- [ ] 세션 버스 워커 로스터 대조 실행 (0기/실행실패도 각각 명시 — 침묵 금지)
- [ ] `session-record-audit.sh verify` **PASS** (FAIL이면 종료 선언 금지)
- [ ] `handover-manager.sh refresh-index-dir` 실행 (INDEX 기계 갱신, 수동 편집 금지)
- [ ] learnings misfire 반영 (해당 시)
- [ ] 하네스 갭 후보 집계 실행 — 0건도 명시, `## 하네스 갭 후보 (미처분)` 절에 `미처분 N건` 기입
- [ ] **미푸시 게이트(§6b)** — `UNPUSHED_TOTAL`≠0 이면 WARN 출력 + `## 열린 PR·브랜치` 에 레포별 1줄 + 미push 사유 기입 (자동 push 금지, 종료는 막지 않음)
- [ ] 팀 공유 동기화 (advisory)
- [ ] 미소비 체크포인트 `.consumed` 표시 (**소유가 확인된 경우에만** — 타 세션 것이거나 **판별 불가면 건너뜀**, 2026-08-16 P3-B)
- [ ] 미러(`$HOME/.claude/`)에 `*.retired-*`/`*.premote-*` 명명 규약으로 로컬 아카이브한 것이 있으면 → SSoT(`${FORGE_ROOT:-$HOME/forge}`)에도 반영됐는지 확인 (근거: `2026-08-01-mirror-orphan-triage.md` 권고-B — 로컬 아카이브만 하고 SSoT에 반영 안 하면 다음 세션이 다시 orphan으로 탐지)

## 경계

`/end-opus`·`/end-sonnet`은 **2026-08-01 삭제됐다**(alias 아님 — 호출해도 존재하지 않는다). 이 커맨드가 유일한 세션 종료 경로다.
관련 없는 새 작업으로 전환할 때는 `/forge-end` → `/clear` → `/forge-start`가 정석이다.
