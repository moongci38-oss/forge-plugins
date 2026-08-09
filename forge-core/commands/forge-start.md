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
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" "$(pwd)"
```

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

1. `CHECKPOINT_LATEST` 파일을 read하고 "다음 스텝"부터 복원 제안.
2. 사용자에게 1줄: `미소비 체크포인트 발견: {경로} ({날짜}) — 이어서 진행할까요?`
3. **체크포인트에 `## 백그라운드 워커 생존` 로스터가 있으면 복원 전에 생존 실측부터** 한다(계약 ⑥ — 2026-07-26 compact 후 워커 6기 유실 실사고). "실행 중"이라 적혀 있어도 그것은 과거 시점의 텍스트다:
   ```bash
   bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" collect "$(pwd)" | grep -E '^WORKER_'
   ```
   `WORKER_WORKTREE=...|recent_changes=N|last_change=...`를 로스터와 대조 → **15분+ 무변화 & 핑(SendMessage) 무응답 = 사망 판정 → 영속 브리프 경로에서 재스폰**. 실측 전에 "워커가 돌고 있다"고 사용자에게 보고하지 않는다.

4. 복원했으면 소비 표시(재안내 루프 방지):
   ```bash
   touch "{CHECKPOINT_LATEST}.consumed"
   ```
   ⚠️ 이 `touch` 외의 파일 변이 금지(INDEX·handover 수정 금지 — TOCTOU 방지).

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
> 비가역·고위험 = fable-5 조언자 승격(Human opt-in — AI 자율 호출 금지).
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
