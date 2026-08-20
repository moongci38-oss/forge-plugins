---
description: "세션 시작 통합 커맨드 — 최신 handover·미소비 체크포인트 회수 + 모델 자동 감지 역할 선언. 트리거: \"세션 시작\", \"start\", /forge-start (구 /start-opus·/start-sonnet 통합)."
group: ops
---

# /forge-start

**세션을 새로 열어 시작할 때** 실행한다(생명주기 3분법: 새로 연다=start / 계속 쓴다=checkpoint / 완전히 닫는다=end).

`/start-opus`·`/start-sonnet` 통합본. 모델은 **세션에서 자동 감지**해 역할 선언만 분기하고, 회수 로직은 분기하지 않는다 — 회수는 스캐너 1곳(`session-recall.sh`)의 출력을 **소비만** 한다(연속성 계약 ①).

> 연속성 계약 ①~⑦ 전문 → `rules-on-demand/handover-canon.md §연속성 계약`
> (③④는 결번 — 정의된 적 없다. 신규 계약에 재사용 금지)

## 실행

### 1. 회수 — 스캐너 1회 호출 (계약 ①②⑥)

```bash
RECALL_RC=0
RECALL_OUT="$(timeout "${FORGE_RECALL_TIMEOUT:-20}" bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" "$(pwd)")" || RECALL_RC=$?
if [ "$RECALL_RC" -eq 124 ]; then
  echo "⚠️ recall 타임아웃(${FORGE_RECALL_TIMEOUT:-20}s) — 기록 '부재'가 아니라 '판정 불가'다(느린 UNC/9p·대형 스캔 등). FORGE_RECALL_TIMEOUT=60 으로 1회 재시도를 권장."
fi
printf '%s\n' "$RECALL_OUT"
```

**hang 방지(G-1, 2026-07-31 실측)**: `timeout` 없이 이 스크립트가 멎으면 세션 시작 자체가 멎는다. 20s(기본값,
`FORGE_RECALL_TIMEOUT`으로 조정)를 넘기면 exit 124다.
⚠️ **타임아웃(124)은 '기록 없음'의 증거가 아니다**(cr-final pr267-chunk3 — learnings "타임아웃 만료 ≠ 부재" 원칙):
위 스니펫이 124를 감지해 '판정 불가' 경고를 먼저 출력한 뒤 §1(c) 무맥락 배너 경로로 합류한다(fail-open).
경고 없이 침묵 합류하면 느린 환경(UNC/9p)에서 매 세션이 "이전 기록 없음(신규)"으로 오판된다 — 재시도 안내가 그 오판을 끊는다.

**(b) Windows+WSL 브리지 폴백 (2026-08-16, 갭 G3 · 124 확장 2026-08-17)**: exit **127**(스크립트 부재 — forge 미설치 Windows 머신) **또는 exit 124**(타임아웃 — UNC 경유라 스크립트가 있어도 I/O 가 느려 제시간에 못 끝나는 머신)이고 `wsl` 이 가용하면 WSL 쪽 forge 로 1회 브리지한다. 성공 시 그 출력을 그대로 소비하고, 실패·공백이면 (c) 배너로 합류한다(fail-open — wsl 미가용 머신은 이 블록이 통째로 건너뛰어져 기존 경로 무손상):

```bash
if { [ "$RECALL_RC" -eq 127 ] || [ "$RECALL_RC" -eq 124 ]; } && command -v wsl >/dev/null 2>&1; then
  WSLPWD="$(MSYS2_ARG_CONV_EXCL='*' wsl -e wslpath -a "$(pwd -W 2>/dev/null || pwd)" 2>/dev/null | tr -d '\r')"
  RECALL_OUT="$(MSYS2_ARG_CONV_EXCL='*' wsl -e bash -c 'timeout "${FORGE_RECALL_TIMEOUT:-20}" bash "$HOME/forge/shared/scripts/session-recall.sh" "$1"' _ "$WSLPWD" 2>/dev/null)" \
    && [ -n "$RECALL_OUT" ] && RECALL_RC=0 \
    && { echo "ℹ️ 회수: WSL 브리지 경유(로컬 스캐너 부재)"; printf '%s\n' "$RECALL_OUT"; }
fi
```

- ⚠️ `MSYS2_ARG_CONV_EXCL='*'` 필수 — Git Bash 가 `/home/<user>/…`·`/mnt/<drive>/…` 인자를 `C:/Program Files/Git/…` 로 자동 변환해 **조용히** 깨뜨린다(2026-08-16 실측: 가드 없이 `wsl -e cat /home/<user>/…` → No such file). WSL 사용자 홈이 다른 머신도 `$HOME` 참조라 그대로 동작한다.
- 브리지 출력의 handover 목록은 WSL forge-outputs 전역이 섞인다 — `project` 필드로 현 프로젝트 항목을 우선 소비한다.
- 근거: 갭 G3(2026-08-16 boardGames Windows 세션 — 매 세션 수동 폴백 반복, 브리지 가용 실측 SCAN_STATUS=ok).
  **124 확장 근거(2026-08-17)**: forge-0817 세션 — CWD 가 UNC(`\\wsl.localhost\...\forge`)면 스크립트가 실존해도 20s→60s 두 번 다 타임아웃했고, 같은 스캔을 WSL 네이티브로 돌리면 즉시 끝났다(`harness-gaps/2026-08-17-session-recall-unc-timeout.md`). 127만 받던 구 조건은 이 케이스를 (c) 무맥락 배너로 흘려보냈다.
  폐기조건: 전 머신에 forge 로컬 설치가 완료되면 이 블록을 삭제한다.

출력은 KEY=VALUE다. **직접 find/grep으로 handover를 다시 찾지 않는다** — 재탐색이 곧 스캐너 이중화(F1/F2 재발)다.

| 키 | 소비 방법 |
|---|---|
| `HANDOVER_N=key\|kind\|model\|status\|project\|FRESH\|STALE\|path` | `STALE` 표기 항목은 **요약에서 제외**(판정은 코드가 이미 했다 — 재판정 금지). `kind=auto`는 후순위 |
| `LATEST_NARRATIVE` | 이 파일을 **summary**(frontmatter + `^#+ ` 헤더만)로 read. 없으면 `LATEST` |
| `CHECKPOINT_UNCONSUMED=yes` | §2 미소비 체크포인트 처리 |
| `UNWRITTEN_COMMITS` / `UNWRITTEN_REPO` | 미작성 구간 — 커밋 목록을 요약에 포함하고 "직전 세션 handover 미작성 — 커밋 기준 복원" 1줄 명시 |

**(c) 읽기 실패 = 조용히 진행 금지**: 스크립트 부재·비정상 종료·`SCAN_STATUS`가 `ok`가 아님·출력 공백 중 하나라도면 아래 배너를 출력한 뒤 **진행한다**(차단 아님 — fail-open):

```
⚠️ 이전 맥락 미회수 — 회수 스캐너 실패({사유}). 이 세션은 이전 세션 맥락 없이 시작합니다.
```

그리고 이 사실을 갭 리포트 채널에 1줄 기록한다(계약 ⑥(d)):
```bash
mkdir -p "${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/harness-gaps"
```
→ 세션 종료 시 harness-gaps 리포트에 "회수 실패 1건" 항목으로 편입.

### 2. 미소비 체크포인트 처리 (3분법 오용 방지 ①)

`CHECKPOINT_UNCONSUMED=yes`면 — 직전 세션이 `/forge-checkpoint`만 남기고 `/forge-end` 없이 죽었다는 뜻이다.

0. **소유 검증 (M-1/G-08, cr-final HIGH 반영 2026-08-15)** — 멀티세션에서 `CHECKPOINT_LATEST`는 남의 것일 수 있다. read·소비 전에 대조한다. ⚠️ 이 블록은 **자체완결**이다 — 경로를 블록 안에서 직접 유도한다(2차 정정: 유도 없이 `$CHECKPOINT_LATEST`를 참조하면 미설정 변수라 검증이 조용히 no-op 된다):
   ```bash
   # 타임아웃이면 CP_LATEST 가 공백이 된다 — 그것은 "미소비 체크포인트 없음"이 아니라 판정 불가다
   # (cr-final pr267-chunk3). 공백이면 §1 의 RECALL_RC 를 확인하고, 124 였다면 "없음" 단정 금지.
   CP_LATEST=$(timeout "${FORGE_RECALL_TIMEOUT:-20}" bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" | grep '^CHECKPOINT_LATEST=' | cut -d= -f2-)
   MY_SID="${CLAUDE_SESSION_ID:-}"
   if [ -n "$CP_LATEST" ] && [ -f "$CP_LATEST" ]; then
     CP_SID=$(grep -m1 '^session:' "$CP_LATEST" 2>/dev/null | sed -E 's/^session:[[:space:]]*"?([^"[:space:]]*)"?.*/\1/')
     if [ -n "$MY_SID" ] && [ -n "$CP_SID" ] && [ "$CP_SID" != "unknown" ] && [ "$CP_SID" != "$MY_SID" ]; then
       echo "OWNERSHIP=SKIP 타 세션 체크포인트 — 건너뜀 ($(basename "$CP_LATEST"), session=$CP_SID) — 소비 표시 안 함"
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
   출력이 `OWNERSHIP=SKIP` 이면 **아래 1~4 단계를 전부 생략**한다(복원도 `.consumed` 표시도 하지 않는다 — 그 체크포인트는 소유 세션이 회수한다).

1. `CHECKPOINT_LATEST` 파일을 read하고 "다음 스텝"부터 복원 제안.
2. 사용자에게 1줄: `미소비 체크포인트 발견: {경로} ({날짜}) — 이어서 진행할까요?`
3. **체크포인트에 `## 백그라운드 워커 생존` 로스터가 있으면 복원 전에 생존 실측부터** 한다(계약 ⑥ — 2026-07-26 compact 후 워커 6기 유실 실사고). "실행 중"이라 적혀 있어도 그것은 과거 시점의 텍스트다:
   ```bash
   bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" collect "$(pwd)" | grep -E '^WORKER_'
   ```
   `WORKER_WORKTREE=...|recent_changes=N|last_change=...`를 로스터와 대조 → **15분+ 무변화 & 핑(SendMessage) 무응답 = 사망 판정 → 영속 브리프 경로에서 재스폰**. 실측 전에 "워커가 돌고 있다"고 사용자에게 보고하지 않는다.

4. 복원했으면 소비 표시(재안내 루프 방지) — **`OWNERSHIP=OK` 일 때만**:
   ```bash
   touch "{CHECKPOINT_LATEST}.consumed"
   ```
   ⚠️ 이 `touch` 외의 파일 변이 금지(INDEX·handover 수정 금지 — TOCTOU 방지).

   ⚠️ **`OWNERSHIP=WARN` 이면 이 단계를 건너뛴다**(2026-08-16, P3-B). 소비 표시는 **비가역**이고,
   판별 불가 상태에서 찍으면 **남의 복구 지점을 지운다**(실사고 `L-20260815T054053`).
   대가는 같은 체크포인트가 **다음 세션에도 다시 안내되는 것**뿐이다 —
   **지워지는 것보다 두 번 물어보는 편이 낫다.**
   내 것이 확실해서 끊고 싶으면 사람이 직접 찍는다:
   ```bash
   touch "<그 체크포인트 경로>.consumed"
   ```

### 3. 읽은 것 명시 출력 (계약 ⑥(b) — **필수**)

요약 맨 앞에 아래 블록을 **항상** 출력한다. 안 읽은 것은 침묵이 아니라 목록으로 보인다.

```
📥 회수: handover {HANDOVER_SHOWN}건 표시 / 전체 {HANDOVER_COUNT}건 · STALE 제외 {n}건
   - 최신 서술형: {LATEST_NARRATIVE 파일명} ({date})
   - 미소비 체크포인트: {있음: 경로 | 없음}
   - 미작성 구간 커밋: {UNWRITTEN_COMMITS}건 ({repo별 내역})
```

"없음"도 반드시 적는다 — 안 봄(침묵)과 봤는데 없음을 구분해야 다음 세션이 재확인 비용을 안 치른다.

### 4. VITALS·연속성 점검 (read-only, 비차단)

- 프로젝트 루트 `CLAUDE.md`의 `## 핵심정보` 섹션 read-only 로드. 부재 시 차단 없이 1줄 advisory: "`## 핵심정보` 미설정 — `/forge-onboard` 권고".
- ⚠️ **변이 절대 금지**(§2의 `.consumed` touch만 예외).

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/check-continuity.sh" 2>/dev/null || true
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/index-refresh.sh" 2>/dev/null || true
git fetch --quiet 2>/dev/null; B=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)
[ "${B:-0}" -gt 0 ] && echo "⚠️ origin이 $B 커밋 앞섬 — learnings 최신화 위해 git pull 권고(강제 X)"
```

스크립트 부재 시 skip(fail-open). `.claude/MEMORY.md` 있으면 read.

### 5. 역할 선언 — **모델 자동 감지로 분기**

세션 모델명(`claude-opus-*` / `claude-sonnet-*` / 그 외)으로 판정한다. **회수는 분기하지 않는다 — 선언만 분기한다.**

**Opus 계열 → 오케스트레이터(advisor)**
> 이 세션 = 오케스트레이터 — 결정·계획·설계·검수·오케스트레이션 전담. 직접 구현하지 않고 작업 분해·위임·검증·종합에 집중.
> worker tier = 규모·난도별: 검색·탐색=haiku / 단순·명확 구현=sonnet / 복잡·고난도=opus worker.
> 병렬화 = subagent / Agent Teams(2~9 독립 병렬) / Workflow(3단계+ 결정론 루프) 중 선택.
> 판단 지점 조언 = `advisor-model-resolve.sh` 출력(기본 **Fable 5**, 대체 `gpt-5.6-sol`, 일일 캡 기본 0=무제한). Fable 은 구독 정액이라 2026-08-12 부터 기본값이며 Human opt-in 이 필요 없다 — 구 "AI 자율 호출 금지" 폐기.
> 위임 결과는 diff·테스트 실측 검증 후 채택.

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

`/start-opus`·`/start-sonnet`은 **2026-08-01 삭제됐다**(alias 아님 — 호출해도 존재하지 않는다). 이 커맨드가 유일한 세션 시작 경로다.
