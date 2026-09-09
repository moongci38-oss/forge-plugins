# /forge-start

**세션을 새로 열 때** 실행한다(3분법: 새로 연다=start / 계속=checkpoint / 닫는다=end).
모델은 자동 감지해 **§5 역할 선언만** 분기한다 — 회수는 스캐너 1곳(`session-recall.sh`) 출력을 **소비만** 한다(계약 ①).

> 계약 ①~⑦(③④ 결번) → `rules-on-demand/handover-canon.md §연속성 계약`
> **왜 이렇게 되어 있나 + 전체 키 사전 → `rules-on-demand/forge-start-aux.md`**

## 실행

### 1. 회수 — 수집기 1회 호출 (계약 ①②⑥)

```bash
C="${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-start-collect.sh"
OUT="$(bash "$C" 2>/dev/null)"; RC=$?
if [ "$RC" -ne 0 ] || [ -z "$OUT" ]; then
  printf '%s\n' "$OUT"   # 죽기 전에 뱉은 것이 있으면 버리지 않는다(그 안에 GAP_TODO 가 있을 수 있다)
  echo "⚠️ 이전 맥락 미회수 — 수집기 실행 실패(rc=$RC, path=$C). 이 세션은 이전 세션 맥락 없이 시작합니다."
  echo "📥 회수: 판정 불가 — 수집기 부재·실패. §3 전 항목을 '판정 불가'로 적는다(부재로 읽지 마라)."
  printf '%s\n' "$OUT" | grep -q '^RECALL_GAP_TODO=' \
    || echo "RECALL_GAP_TODO=회수 실패 1건(수집기 rc=$RC, path=$C) — 계약 ⑥(d): harness-gaps 에 1줄 기록한다."
else
  printf '%s\n' "$OUT"
fi
```

⛔ **이 바깥 방어를 스크립트로 밀지 마라** — 수집기가 없는 배포에서는 그 안의 배너 코드도 실행되지 않는다(순환 의존). 실패해도 **차단하지 않고 계속 진행**한다.

수집기가 하는 일 = 회수(`FORGE_RECALL_BUS_MAX=0`+`timeout`)·WSL 브리지 폴백·실패 배너·체크포인트 소유검증·연속성/로스터/작업범위 점검·§3 블록 조립. 읽기 전용·fail-open·항상 exit 0.

- 출력은 KEY=VALUE. **직접 find/grep 으로 handover 를 다시 찾지 않는다**(재탐색 = 스캐너 이중화).
- `RECALL_BANNER=…` 과 `⚠️`·`ℹ️` 줄(`WARN[stale-dirty]` 포함)은 **그대로** §3 뒤에 싣는다 — 읽기 실패를 조용히 넘기지 않는다. 0건이면 침묵.
- `RECALL_GAP_TODO=…` 이 오면 그 문장을 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/harness-gaps/` 에 **1줄 기록**한다(계약 ⑥(d)) — 디렉터리 생성은 기록이 아니다. 수집기가 아예 못 돌아도 위 바깥 분기가 이 키를 대신 만든다.
  ⚠️ **이 기록은 §2·§4 "파일 변이 금지"의 명시적 예외다**(예외는 이것과 `.consumed` touch 둘뿐). 회수 실패를 남기지 않으면 다음 세션이 같은 실패를 처음 보는 일로 다시 조사한다.
- **`RECALL_OK=no` 면 §3 수치는 부재가 아니라 `판정 불가`다.** "없음·0건"으로 요약하지 마라.

| 키 | 소비 방법 |
|---|---|
| `HANDOVER_N=…\|STALE\|owner` | `STALE` 은 요약에서 **제외**(재판정 금지) · `kind=auto` 후순위. `owner` 축은 **작업 폴더**(`worktree:`) |
| `LATEST_NARRATIVE`(+`_OWNER`) | **summary**(frontmatter + `^#+ ` 헤더)만 read, 없으면 `LATEST`. 소유는 반드시 이 키로 |
| `CHECKPOINT_UNCONSUMED=yes` | §2 로 |
| 집계(`ITEMS_OPEN`·`P0_*`·`STOP_DUE_*`·`BUS_ROSTER`) | **세기만** 한다. ⛔ 판정 금지 — 임계는 사람이 정한다(E-3) |

### 2. 미소비 체크포인트 처리

`CHECKPOINT_UNCONSUMED=yes` = 직전 세션이 `/forge-checkpoint` 만 남기고 `/forge-end` 없이 죽었다. 수집기의 `OWNERSHIP` 3-상태(`OK`·`OTHER`·`WARN`)로 처리한다 — **읽기는 열고 쓰기는 닫는다**: 셋 다 복원(1~3)은 하고, 소비 표시(4)는 **`OK` 만** 한다.

1. `CHECKPOINT_LATEST` read → "다음 스텝"부터 복원 제안.
2. 1줄 안내: `미소비 체크포인트 발견: {경로} ({날짜}) — 이어서 진행할까요?`
3. `## 백그라운드 워커 생존` 로스터가 있으면 **복원 전에 생존 실측부터**(계약 ⑥) — "실행 중"도 과거 시점 텍스트다. `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" collect "$(pwd)" | grep -E '^WORKER_'` → 15분+ 무변화 & 핑 무응답 = **사망 → 영속 브리프 경로에서 재스폰**. 실측 전에 "워커가 돌고 있다"고 보고하지 않는다.
4. **`OWNERSHIP=OK` 일 때만** 소비 표시: `touch "{CHECKPOINT_LATEST}.consumed"`

⚠️ 이 `touch` 외 파일 변이 금지(INDEX·handover 수정 금지 — TOCTOU). 유일한 다른 예외는 §1 의 `RECALL_GAP_TODO` 기록이다. ⚠️ `OTHER`·`WARN` 에서 **복원까지 막지 않는다**(구 `SKIP` 은 2026-08-29 폐기 — 되살리지 마라) — 비가역인 `.consumed` 만 막는다.

### 3. 읽은 것 명시 출력 (계약 ⑥(b) — **필수**)

수집기가 **마지막에 낸 `📥 회수:` 블록을 요약 맨 앞에 그대로** 싣는다. **값이 `없음`·`판정 불가`여도 그 줄을 지우지 않는다** — 안 봄(침묵)과 봤는데 없음을 구분해야 다음 세션이 재확인 비용을 안 치른다.

**소유 라벨** = 읽기 우선순위만 바꾼다(차단 아님). `OTHER` 는 읽되 그 브랜치·미커밋·워커 상태를 **내 상태로 요약하지 않는다**(`(타 세션 소유: {LATEST_WORKTREE})` 라벨 필수). `UNKNOWN` 다수는 **정상**(필드가 2026-08-24 신설). ⛔ 공유 체크아웃 동시 세션끼리는 **판별력이 없다**(서로 전부 `MINE`).

### 4. VITALS·작업 범위 (read-only, 비차단)

- 루트 `CLAUDE.md` `## 핵심정보` + `.claude/MEMORY.md` read-only 로드(부재 시 "`## 핵심정보` 미설정 — `/forge-onboard` 권고" 1줄, 차단 X).
- ⚠️ **변이 절대 금지** — 예외는 둘뿐이다: §2 의 `.consumed` touch, §1 의 `RECALL_GAP_TODO` 기록.
- `SHARED_CHECKOUT=yes` 면 그 폴더의 **브랜치명·dirty 수를 내 세션 상태로 요약하지 않는다**(언급 시 `(공유 체크아웃 — 소유 불명, 타 세션 작업 포함)` 라벨 필수). `DIRTY_COUNT=unknown` 은 고장이 아니라 **설계**다. 세션 시작 시 붙는 `gitStatus` 블록도 같은 함정이라 **옮겨 적지 않는다.**
- 코드를 고칠 예정이면 `EnterWorktree` 로 자기 폴더 확보(공유 체크아웃 직접 편집 = `WARN[K4]`).
- ⛔ **로스터 0개는 직접 처리할 근거가 아니다** — 닫힌 방도 `send` 가 열고 넣는다(`team-routing.md §1` A-1).

### 5. 역할 선언 — 모델 자동 감지로 분기

세션 모델명(`claude-opus-*` / `claude-sonnet-*` / 그 외)으로 판정한다. **회수는 분기하지 않는다.**

**Opus 계열 → 오케스트레이터**
> 결정·계획·설계·검수·오케스트레이션 전담. 직접 구현하지 않고 분해·위임·검증·종합에 집중.
> worker tier = **기본 Opus**. 내릴 때만 조정: 검색·탐색=haiku|sonnet / **기계적·단일파일 편집=sonnet**.
> 판단 지점 조언 = `advisor-model-resolve.sh` 출력(직접 스폰 금지 — 가드가 통째로 우회된다).
> 위임 결과는 diff·테스트 실측 후 채택.
> **도메인 작업은 팀장 경유**(`forge-session-bus.sh send <팀slug>`).

**Sonnet 계열 → 구현 실행**
> 구현 실행. 설계 판단 필요 시 즉시 사용자 보고(독단 금지). 종료 전 `/forge-end` 필수.

**감지 실패** → Opus 선언 기본값 + "모델 감지 실패 — 오케스트레이터 기본값 적용" 1줄.

### 6. 요약 출력 (≤150 단어)

§3 블록 + 최신 handover slug·날짜 + 미결 결정 + 오늘 우선순위. 디테일은 사용자가 "full handover"·"AD-N" 을 명시할 때만 부분 read.

## 경계

| 다음 행동 | 커맨드 |
|---|---|
| **같은 세션** 계속 | `/forge-checkpoint` → `/compact` |
| **완전 종료** | `/forge-end` |
| 무관한 새 작업 | `/forge-end` → `/clear` → `/forge-start` |

`/start-opus`·`/start-sonnet` 은 2026-08-01 삭제됐다 — 이 커맨드가 유일한 세션 시작 경로다.
