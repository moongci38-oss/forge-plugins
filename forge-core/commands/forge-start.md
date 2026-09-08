# /forge-start

**세션을 새로 열어 시작할 때** 실행한다(생명주기 3분법: 새로 연다=start / 계속 쓴다=checkpoint / 완전히 닫는다=end).

`/start-opus`·`/start-sonnet` 통합본. 모델은 **세션에서 자동 감지**해 역할 선언만 분기하고, 회수 로직은 분기하지 않는다 — 회수는 스캐너 1곳(`session-recall.sh`)의 출력을 **소비만** 한다(연속성 계약 ①).

> 연속성 계약 ①~⑦ 전문 → `rules-on-demand/handover-canon.md §연속성 계약` (③④는 결번 — 재사용 금지)
> **왜 이렇게 되어 있나(근거·실사고·정정 이력·폐기조건) → `rules-on-demand/forge-start-aux.md`**

## 실행

### 1. 회수 — 스캐너 1회 호출 (계약 ①②⑥)

```bash
RECALL_RC=0
RECALL_OUT="$(FORGE_RECALL_BUS_MAX=0 timeout "${FORGE_RECALL_TIMEOUT:-20}" bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" "$(pwd)")" || RECALL_RC=$?
if [ "$RECALL_RC" -eq 124 ]; then
  echo "⚠️ recall 타임아웃(${FORGE_RECALL_TIMEOUT:-20}s) — 기록 '부재'가 아니라 '판정 불가'다(느린 UNC/9p·대형 스캔 등). FORGE_RECALL_TIMEOUT=60 으로 1회 재시도를 권장."
fi
printf '%s\n' "$RECALL_OUT"
```

- **`timeout` 없이 돌리지 않는다** — 스크립트가 멎으면 세션 시작이 통째로 멎는다(G-1).
- **exit 124 = '판정 불가'이지 '기록 없음'이 아니다.** 위 스니펫이 경고를 먼저 내고 §1(c) 배너 경로로 합류한다(fail-open).

**(b) Windows+WSL 브리지 폴백** — exit **127**(스크립트 부재) 또는 **124**(타임아웃)이고 `wsl` 이 가용하면 WSL 쪽 forge 로 1회 브리지한다. 성공 시 그 출력을 소비하고, 실패·공백이면 (c) 배너로 합류한다:

```bash
if { [ "$RECALL_RC" -eq 127 ] || [ "$RECALL_RC" -eq 124 ]; } && command -v wsl >/dev/null 2>&1; then
  WSLPWD="$(MSYS2_ARG_CONV_EXCL='*' wsl -e wslpath -a "$(pwd -W 2>/dev/null || pwd)" 2>/dev/null | tr -d '\r')"
  RECALL_OUT="$(MSYS2_ARG_CONV_EXCL='*' wsl -e bash -c 'timeout "${FORGE_RECALL_TIMEOUT:-20}" bash "$HOME/forge/shared/scripts/session-recall.sh" "$1"' _ "$WSLPWD" 2>/dev/null)" \
    && [ -n "$RECALL_OUT" ] && RECALL_RC=0 \
    && { echo "ℹ️ 회수: WSL 브리지 경유(로컬 스캐너 부재)"; printf '%s\n' "$RECALL_OUT"; }
fi
```

- ⚠️ `MSYS2_ARG_CONV_EXCL='*'` **필수** — Git Bash 가 경로 인자를 조용히 변환해 깨뜨린다.
- 브리지 출력의 handover 목록은 WSL 전역이 섞인다 — `project` 필드로 현 프로젝트 항목을 우선 소비한다.

출력은 KEY=VALUE다. **직접 find/grep으로 handover를 다시 찾지 않는다**(재탐색 = 스캐너 이중화).

⚠️ **`FORGE_RECALL_BUS_MAX=0` 을 붙여 부른다** — 이 커맨드는 방 **상세를 쓰지 않고** §3 에
"열린 방 N개" 한 줄만 싣는다. 집계(`BUS_WORKER_COUNT`·`BUS_LANES`·`BUS_WORKER_OMITTED`)는
그대로 오므로 세는 데는 지장이 없다. 상세가 필요한 `/forge-end`·`/forge-checkpoint` 는 이
값을 안 주므로 **전량 그대로** 받는다(그쪽 계약 무변경).

| 키 | 소비 방법 |
|---|---|
| `HANDOVER_N=key\|kind\|model\|status\|project\|FRESH\|STALE\|owner\|path` | `STALE` 항목은 요약에서 **제외**(재판정 금지). `kind=auto` 는 후순위 |
| `owner` = `MINE\|OTHER\|UNKNOWN` | 소유 축은 **작업 폴더**(`worktree:`). `OTHER` = 내 상태로 읽지 않는다 · `UNKNOWN` = 구 handover(2026-08-24 이전) — **`OTHER` 로 접지 않는다** |
| `HANDOVER_MINE` / `HANDOVER_OTHER` / `HANDOVER_OWNER_UNKNOWN` | 전건 소유 집계(표시 5건이 아니라 스캔 전량). §3 블록에 그대로 싣는다 |
| `FRONTMATTER_LIB` = `ok\|missing` | `missing` = 소유 판정이 전건 UNKNOWN 으로 강등된 **측정 실패**다("소유 정보 없음"이 아니다). 미러 반쪽 배포 의심 → `forge-sync sync` 확인 |
| `CWD_WORKTREE` / `LATEST_WORKTREE` / `LATEST_OWNER` | 내 작업 폴더 · 최신 handover 소유 폴더 · 그 소유 라벨 |
| `LATEST_NARRATIVE_FALLBACK` = `none\|latest` | `latest` = 서술형이 하나도 없어 전체 최신값으로 대체 중 → 요약에 `(서술형 없음 — 최신 handover 로 대체)` 명시 |
| `LATEST_NARRATIVE_WORKTREE` / `LATEST_NARRATIVE_OWNER` | **최신 서술형 전용** 소유 정보. 서술형 옆에는 반드시 이 키를 쓴다(`LATEST_OWNER` 는 다른 파일의 소유자일 수 있다) |
| `LATEST_NARRATIVE` | **summary**(frontmatter + `^#+ ` 헤더만)로 read. 없으면 `LATEST` |
| `CHECKPOINT_UNCONSUMED=yes` | §2 로 |
| `UNWRITTEN_COMMITS` / `UNWRITTEN_REPO` | 커밋 목록을 요약에 포함 + "직전 세션 handover 미작성 — 커밋 기준 복원" 1줄 |
| `APPLY_PLAN_SCAN` = `ok\|off\|missing\|missing_script\|timeout\|error` | `ok` 가 아니면 **아래 숫자를 '적체 없음'으로 읽지 마라**(0 = "못 읽었다"일 수 있다). `missing_script` = 미러 반쪽 배포 의심 |
| `ITEMS_OPEN` / `CLOSURE_PCT` / `PLANS_TOTAL` / `AGE_OVER_30` | §3 에 **1줄**. ⛔ **판정하지 않는다** — 세기만 하고 임계는 사람이 정한다(E-3). 독촉·일괄 체크 금지 |
| `STOP_DUE_SCAN` = `ok\|missing\|timeout\|error` | `ok` 가 아니면 건수를 "없음"으로 읽지 마라. `missing` = `human-queue.md` 부재 |
| `STOP_DUE_COUNT` / `STOP_DUE_1..N` (`YYYY-MM-DD\|제목`) | 날짜가 **오늘 또는 그 이전**인 `[STOP]`. §3 에 1줄. ⛔ 판정하지 않는다. ⚠️ 헤딩 기준이라 본문에만 날짜가 있으면 안 잡힌다 |

**(c) 읽기 실패 = 조용히 진행 금지** — 스크립트 부재·비정상 종료·`SCAN_STATUS≠ok`·출력 공백 중 하나라도면 아래를 출력한 뒤 **진행한다**(차단 아님):

```
⚠️ 이전 맥락 미회수 — 회수 스캐너 실패({사유}). 이 세션은 이전 세션 맥락 없이 시작합니다.
```

그리고 갭 리포트 채널에 1줄 기록한다(계약 ⑥(d)) → 세션 종료 시 harness-gaps 리포트에 "회수 실패 1건"으로 편입:

```bash
mkdir -p "${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/harness-gaps"
```

### 2. 미소비 체크포인트 처리 (3분법 오용 방지 ①)

`CHECKPOINT_UNCONSUMED=yes` = 직전 세션이 `/forge-checkpoint` 만 남기고 `/forge-end` 없이 죽었다는 뜻이다.

0. **소유 검증 (M-1/G-08)** — 멀티세션에서 `CHECKPOINT_LATEST` 는 남의 것일 수 있다. 이 블록은 **자체완결**이다(경로를 블록 안에서 직접 유도한다 — 유도 없이 `$CHECKPOINT_LATEST` 를 참조하면 미설정 변수라 검증이 조용히 no-op 된다):

```bash
   # 타임아웃이면 CP_LATEST 가 공백이 된다 — 그것은 "미소비 체크포인트 없음"이 아니라 판정 불가다
   # (cr-final pr267-chunk3). 공백이면 §1 의 RECALL_RC 를 확인하고, 124 였다면 "없음" 단정 금지.
   CP_LATEST=$(timeout "${FORGE_RECALL_TIMEOUT:-20}" bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" | grep '^CHECKPOINT_LATEST=' | cut -d= -f2-)
   MY_SID="${CLAUDE_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-}}"
   if [ -n "$CP_LATEST" ] && [ -f "$CP_LATEST" ]; then
     CP_SID=$(grep -m1 '^session:' "$CP_LATEST" 2>/dev/null | sed -E 's/^session:[[:space:]]*"?([^"[:space:]]*)"?.*/\1/')
     if [ -n "$MY_SID" ] && [ -n "$CP_SID" ] && [ "$CP_SID" != "unknown" ] && [ "$CP_SID" != "$MY_SID" ]; then
       echo "OWNERSHIP=OTHER 다른 세션이 쓴 체크포인트 ($(basename "$CP_LATEST"), session=$CP_SID) — 복원은 하되 소비 표시는 하지 않는다"
     elif [ -z "$MY_SID" ] || [ -z "$CP_SID" ] || [ "$CP_SID" = "unknown" ]; then
       # 2026-08-16 (P3-B): 판별 불가일 때 **읽기는 열고 쓰기는 닫는다.**
       #   구 동작은 전면 fail-open 이라 §4 가 남의 체크포인트에 .consumed 를 찍어
       #   그 세션의 복구 지점을 지웠다(실사고 L-20260815T054053).
       #   복원(읽기)은 무해하므로 계속 허용하고, **비가역인 소비 표시만** 막는다.
       echo "OWNERSHIP=WARN 소유 판별 불가(SID 미설정 또는 구형 체크포인트) — 복원은 하되 소비 표시는 하지 않는다"
     else
       echo "OWNERSHIP=OK 자기 소유 체크포인트"
     fi
   fi
   ```

   `OWNERSHIP` 값별 처리 — **읽기는 열고 쓰기는 닫는다**가 세 값의 공통 원칙이다:

   | 값 | 복원(1~3) | 소비 표시(4) |
   |---|---|---|
   | `OK`    | 한다 | **한다** |
   | `OTHER` | 한다 | 안 한다 |
   | `WARN`  | 한다 | 안 한다 |

   ⚠️ **`OTHER` 에서 복원까지 막지 않는다**(2026-08-29 정정 — 구 `SKIP` 동작 폐기). `/clear`·크래시로 죽은 세션은 돌아오지 않으므로, 복원까지 막으면 체크포인트 제도가 무의미해진다. 비가역인 것은 `.consumed` 뿐이고 **그것만** 계속 막는다.

1. `CHECKPOINT_LATEST` 를 read 하고 "다음 스텝"부터 복원 제안.
2. 사용자에게 1줄: `미소비 체크포인트 발견: {경로} ({날짜}) — 이어서 진행할까요?`
3. **`## 백그라운드 워커 생존` 로스터가 있으면 복원 전에 생존 실측부터**(계약 ⑥). "실행 중"이라 적혀 있어도 그것은 과거 시점의 텍스트다:

```bash
   bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" collect "$(pwd)" | grep -E '^WORKER_'
   ```

   `WORKER_WORKTREE=...|recent_changes=N|last_change=...` 를 로스터와 대조 → **15분+ 무변화 & 핑(SendMessage) 무응답 = 사망 판정 → 영속 브리프 경로에서 재스폰**. 실측 전에 "워커가 돌고 있다"고 보고하지 않는다.

4. 복원했으면 소비 표시(재안내 루프 방지) — **`OWNERSHIP=OK` 일 때만**:

```bash
   touch "{CHECKPOINT_LATEST}.consumed"
   ```

   ⚠️ 이 `touch` 외의 파일 변이 금지(INDEX·handover 수정 금지 — TOCTOU 방지).
   ⚠️ `OK` 가 아니면(`OTHER`·`WARN`) 이 단계를 **건너뛴다**. 소비 표시는 비가역이고, 판별 불가 상태에서 찍으면 **남의 복구 지점을 지운다**. 대가는 다음 세션에 한 번 더 안내되는 것뿐 — **지워지는 것보다 두 번 물어보는 편이 낫다.** 내 것이 확실하면 사람이 직접 찍는다:

```bash
   touch "<그 체크포인트 경로>.consumed"
   ```

### 3. 읽은 것 명시 출력 (계약 ⑥(b) — **필수**)

요약 맨 앞에 아래 블록을 **항상** 출력한다. 안 읽은 것은 침묵이 아니라 목록으로 보인다.

```
📥 회수: handover {HANDOVER_SHOWN}건 표시 / 전체 {HANDOVER_COUNT}건 · STALE 제외 {n}건
   - 소유: 내 폴더 {HANDOVER_MINE}건 · 타 폴더 {HANDOVER_OTHER}건 · 판정불가 {HANDOVER_OWNER_UNKNOWN}건
     (내 작업 폴더 = {CWD_WORKTREE})
   - 최신 서술형: {LATEST_NARRATIVE 파일명} ({date}) — 소유 {LATEST_NARRATIVE_OWNER}
   - 미소비 체크포인트: {있음: 경로 | 없음}
   - 미작성 구간 커밋: {UNWRITTEN_COMMITS}건 ({repo별 내역})
   - 팀장 로스터: {열린 방 N개 (팀 slug 나열) | 없음}
   - 적용계획 적체: 미완 {ITEMS_OPEN}건 / 종결률 {CLOSURE_PCT}% (계획 {PLANS_TOTAL}건 · 30일↑ {AGE_OVER_30}건)
   - 적용계획 P0(지금 할 것) {P0_OPEN}건 — 최신 {P0_SHOWN}건:
     {P0_ITEM_1..N 을 `- {텍스트} (계획: {파일명})` 로 한 줄씩}
   - 날짜 도달 [STOP]: {STOP_DUE_COUNT}건 — {STOP_DUE_1 의 `날짜 제목`} | 0건이면 `없음` | STOP_DUE_SCAN≠ok 면 `판정 불가`
```

**"없음"도 반드시 적는다** — 안 봄(침묵)과 봤는데 없음을 구분해야 다음 세션이 재확인 비용을 안 치른다.

**소유 라벨 소비 규칙**

- `LATEST_OWNER=OTHER` 면 읽는 것은 허용하되, 거기 적힌 브랜치·미커밋·워커 상태를 **내 세션 상태로 요약하지 않는다.** 넣으려면 `(타 세션 소유: {LATEST_WORKTREE})` 라벨을 붙인다.
- `HANDOVER_OWNER_UNKNOWN` 이 대부분인 것은 **정상**이다(소유 필드는 2026-08-24 신설). "타 세션 것"으로 읽지 않는다.
- 소유 라벨은 **읽기 우선순위를 바꿀 뿐 차단이 아니다** — `OTHER` 라도 이어받을 일이 적혀 있을 수 있다. 판단은 사람·오케스트레이터가 한다.
- ⛔ **공유 체크아웃 동시 세션끼리는 소유 라벨에 판별력이 없다** — 같은 `worktree:` 값을 적으므로 서로를 **전부 `MINE`** 으로 본다. `SHARED_CHECKOUT=yes` 면 `MINE` 라벨을 과신하지 말고 아래 §작업 상태 규칙을 따른다. 없애는 유일한 방법 = 세션마다 `EnterWorktree`.

### 4. VITALS·연속성 점검 (read-only, 비차단)

- 프로젝트 루트 `CLAUDE.md` `## 핵심정보` read-only 로드. 부재 시 차단 없이 1줄: "`## 핵심정보` 미설정 — `/forge-onboard` 권고".
- ⚠️ **변이 절대 금지**(§2 의 `.consumed` touch 만 예외).

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/check-continuity.sh" 2>/dev/null || true
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/index-refresh.sh" 2>/dev/null || true
git fetch --quiet 2>/dev/null; B=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)
[ "${B:-0}" -gt 0 ] && echo "⚠️ origin이 $B 커밋 앞섬 — learnings 최신화 위해 git pull 권고(강제 X)"
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/stale-dirty-check.sh" 2>&1 || true
```

⚠️ **위 `git pull` 권고와 `stale-dirty-check` 는 짝이다.** pull 해도 **dirty 파일은 덮이지 않아** 그 파일만 계속 건너뛰고 작업 트리가 그 시점에 동결된다. `WARN[stale-dirty]` 줄이 나오면 §3 요약에 **그대로 1줄** 싣는다. 0건이면 침묵한다.
목록: `bash shared/scripts/stale-dirty-check.sh --list` · 끄기: `FORGE_STALE_DIRTY=off`

**팀장 로스터 점검** — 지금 어느 팀장 방에 불이 켜져 있는지 한 번 본다:

```bash
# ⚠️ 전문(`list`)은 60방 기준 9KB(≈2,700 tok)다 — 여기서 필요한 것은 **이름과 개수**뿐이라
#    첫 열만 뽑는다. 상세가 필요하면 그때 `… list` 를 그대로 부른다.
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-session-bus.sh" list 2>/dev/null \
  | awk 'NR>1{print $1}' | paste -sd" " - || true
```

- 스크립트 부재·비정상 종료면 **조용히 넘어간다**(fail-open).
- §3 에 **1줄**: `- 팀장 로스터: {열린 방 N개 (팀 slug 나열) | 없음}`. 0개여도 `없음`이라고 적는다.
- ⚠️ **폴더가 있다고 방이 열린 것이 아니다.** 정본은 이 명령 하나다 — 문서의 조직도 표를 보고 단정하지 않는다.
- ⛔ **로스터가 비어 있다고 메인이 직접 처리하지 않는다.** 정본 `team-routing.md §1` A-1 — **방이 닫혀 있어도 그냥 `send` 하면** 이름표를 확인하고 개설한 뒤 전달한다. 이 점검은 **위임 게이트가 아니라 현황 파악**이고, 0개는 정상 출발점이다. 직접 하는 것은 `team-routing.md §6` 제외 목록뿐(검수 3레그·advisor·검색).

**작업 상태는 내 폴더 범위로만 읽는다**

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/worktree-scope.sh"
```

출력 = `WORKTREE` / `MAIN_CHECKOUT` / `REPO` / `SHARED_CHECKOUT` / `DIRTY_COUNT` / `BRANCH`.

- `SHARED_CHECKOUT=yes` 면 그 폴더의 **브랜치명·dirty 수를 내 세션 상태로 요약하지 않는다.** 언급 시 `(공유 체크아웃 — 소유 불명, 타 세션 작업 포함)` 라벨 필수. 이때 `DIRTY_COUNT=unknown` 은 **고장이 아니라 설계**다 — 숫자를 내주면 그대로 "내 변경"으로 읽힌다.
- ⚠️ **세션 시작 시 하네스가 붙여주는 `gitStatus` 블록도 같은 함정이다** — 공유 체크아웃 스냅샷이지 내 작업이 아니다. 옮겨 적지 않는다.
- 코드를 고칠 예정이면 `EnterWorktree` 로 자기 폴더를 확보한다(공유 체크아웃 직접 편집 = `WARN[K4]`, 차단 아님).

쉽게 말하면 **공용 작업대에 올려진 남의 연장을 세어놓고 "내 연장이 81개"라고 적지 않는다**는 뜻이다.

스크립트 부재 시 skip(fail-open). `.claude/MEMORY.md` 있으면 read.

### 5. 역할 선언 — **모델 자동 감지로 분기**

세션 모델명(`claude-opus-*` / `claude-sonnet-*` / 그 외)으로 판정한다. **회수는 분기하지 않는다 — 선언만 분기한다.**

**Opus 계열 → 오케스트레이터(advisor)**
> 이 세션 = 오케스트레이터 — 결정·계획·설계·검수·오케스트레이션 전담. 직접 구현하지 않고 작업 분해·위임·검증·종합에 집중.
> worker tier = **기본 Opus**. 내릴 때만 조정: 검색·탐색=haiku|sonnet / 기계적·단일파일 편집=sonnet.
> 병렬화 = subagent / Agent Teams(2~9 독립 병렬) / Workflow(3단계+ 결정론 루프) 중 선택.
> 판단 지점 조언 = `advisor-model-resolve.sh` 출력(기본 **Fable 5.1**, 대체 `gpt-6-astra`, 일일 캡 기본 0=무제한).
> 위임 결과는 diff·테스트 실측 검증 후 채택.
> **이 세션 = 총괄 — 도메인 작업은 팀장 경유**(`forge-session-bus.sh send <팀slug>`). **방이 없어도 `send` 가 열고 넣는다(A-1)** — 로스터 0개는 직접 처리할 근거가 아니다. 직접 하는 것은 `team-routing.md §6` 제외 목록뿐.

**Sonnet 계열 → 구현 실행**
> 이 세션 역할: 구현 실행. 설계 판단 필요 시 즉시 사용자 보고(독단 결정 금지).
> 세션 종료 전 `/forge-end` 필수.

**감지 실패** → Opus 선언을 기본값으로 쓰고 "모델 감지 실패 — 오케스트레이터 기본값 적용" 1줄.

### 6. 요약 출력 (≤150 단어)

§3 회수 블록 + 최신 handover slug·날짜 + 미결 결정(요약 명시분만) + 오늘 태스크 우선순위. 디테일은 사용자가 "full handover" / "AD-N" 명시할 때만 부분 read.

## 경계

| 다음 행동 | 커맨드 |
|---|---|
| 컨텍스트 정리하고 **같은 세션** 계속 | `/forge-checkpoint` → `/compact` |
| 세션 **완전 종료** | `/forge-end` |
| 관련 없는 새 작업으로 전환 | `/forge-end` → `/clear` → `/forge-start` |

`/start-opus`·`/start-sonnet` 은 **2026-08-01 삭제**됐다(alias 아님 — 호출해도 존재하지 않는다). 이 커맨드가 유일한 세션 시작 경로다.
