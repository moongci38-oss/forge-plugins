---
description: "세션 완전 종료 — 서술형 handover 작성(단일 레인) + 기록 무누락 게이트. 트리거: \"세션 종료\", \"end\", /forge-end (구 /end-opus·/end-sonnet 통합)."
group: ops
---
# /forge-end
세션을 **완전히 닫을 때** 실행한다(계속 쓰면 `/forge-checkpoint`). 다음 세션은 `/forge-start` 로 잇는다. 모델 구분은 frontmatter `model:` 로만. 연속성 계약·절 구성 정본 → `rules-on-demand/handover-canon.md`
## 1. 착지 경로 (워크트리면 `$FORGE_OUTPUTS/.claude/handover` 논리 경로로 강제)
```bash
HL_OUT="$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-landing.sh" "$(pwd)" 2>/dev/null)"; HL_RC=$?
if [ "$HL_RC" -ne 0 ] || [ -z "$HL_OUT" ]; then   # UNC 머신 무출력 rc=124 → WSL 브리지 재시도
  HL_OUT="$(MSYS2_ARG_CONV_EXCL='*' wsl -e bash -lc 'bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-landing.sh" "$(pwd)"' 2>/dev/null)"; HL_RC=$?; fi
if [ "$HL_RC" -ne 0 ] || [ -z "$HL_OUT" ]; then
  HL_OUT='HANDOVER_DIR="${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/handover"; IS_WORKTREE=unknown; LANDING_REASON=landing-script-unavailable'; fi
eval "$HL_OUT"; mkdir -p "$HANDOVER_DIR"; echo "착지: $HANDOVER_DIR (worktree=$IS_WORKTREE, reason=$LANDING_REASON)"
```
## 2. [게이트] 기록 무누락 — 수집원 실측 (기억으로 회상 금지)
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" collect "$(pwd)"
RECALL_OUT="$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" "$(pwd)" 2>&1)"; RECALL_RC=$?
if [ "$RECALL_RC" -ne 0 ]; then echo "BUS_WORKER_ERROR: session-recall.sh 실행 실패(exit $RECALL_RC) — 0건과 구분"; else echo "$RECALL_OUT" | grep -E '^BUS_WORKER' || echo "BUS_WORKER_ERROR: BUS_WORKER 라인 없음(0건과 다름)"; fi
```
출력 키를 절에 **1:1** 반영. `session-only` 항목은 AI 가 세션 이력에서 채운다. 해당 없으면 `없음` 명시(절 누락 = 게이트 FAIL).
| 수집원 | 근거 키 | handover 절 |
|---|---|---|
| 미완료 태스크 · [STOP] · 미커밋 | `PLAN_TODO_FILES`+세션 태스크 · `STOP_PENDING*` · `UNCOMMITTED_COUNT`/`UNCOMMITTED_FILE` | `## 미완료 태스크` · `## 승인 대기([STOP])` · `## 미커밋 변경` |
| 열린 PR·브랜치 | `OPEN_PR_COUNT`(우리 레포 합계)·`OPEN_PR_REPO_N`·`OPEN_PR_COUNT_CWD`·`OPEN_PR_EXTERNAL_*`·`UNPUSHED_*`·`BRANCH` | `## 열린 PR·브랜치` |
| 백그라운드 작업 · 사용자 지시 미이행 | 세션 이력 | `## 진행 중 백그라운드 작업` · `## 사용자 지시 미이행` |
| learnings misfire | `LEARNINGS_LAST`·`LEARNINGS_PARSE_BAD` | `## learnings 미기록 misfire` |
| 워커 생존 · 팀장 위임 | `WORKER_BRIEF*`·`WORKER_WORKTREE*`(live)·`BUS_WORKER_N`(dormant) | `## 백그라운드 워커 생존` · `## 팀장 위임 기록` |
| 이름·경로 개명 | session-only | `### 바뀐 것` (`## 다음 세션이 이어받을 것` 안) |
- `*_PARTIAL=yes` 면 전량으로 읽지 않는다(`?` 건수는 0 아님, `_REASON` 병기). 우리 레포가 `(외부)` 로 빠지면 `FORGE_OUR_GIT_OWNERS`·`FORGE_VENDOR_DIR_RE` 조정, 되돌리기 `FORGE_EXTERNAL_SPLIT=off`.
- **STOP 해소**: 각 마커가 승인·완료·기각됐으면 원문을 `[STOP-RESOLVED: {날짜} {사유}]` 로 치환, `## 승인 대기([STOP])` 에는 미해소분만(근거 없으면 미해소). `LEARNINGS_PARSE_BAD`≠0 → 보고에 `learnings 무결성 WARN: 파싱 불가 {N}줄 (line {LEARNINGS_PARSE_BAD_LINES})`.
- **워커 생존**(워커당): `- {워커명} / 브리프: {영속 경로} / 산출: {경로}` + `생존 실측: 최근 15분 변경 {N}건, 마지막 변경 {시각}`(collect 값 그대로) + `재개: 생존 실측 → 15분+ 무변화 & 핑 무응답이면 사망 판정 → 영속 브리프에서 재스폰`. `WORKER_BRIEF_PERSISTED`≠yes 인데 활성 워커 → 브리프를 디스크(`$FORGE_OUTPUTS/11-platform/pipelines/worker-briefs/`)에 먼저 영속화, 아니면 **게이트 FAIL**.
- **버스 워커**(dormant = 정상, 사망 판정 미적용): 같은 절에 `### 세션 버스 워커 (dormant — live 프로세스 아님)` 표 `| name | sid8 | cwd | 최종응답 | 인계 지시 |`, 0기면 `없음`.
## 3. handover 작성 — `$HANDOVER_DIR/YYYY-MM-DD-HHMM-{slug}.md` (`-auto` 접미 금지)
frontmatter **8필드**: `date` · `time: "HHMM"` · `model` · `slug` · `status: open|closed` · `project`(주 체크아웃 이름) · `worktree` · `session`. 뒤 둘은 기계 산출(소유 축 = worktree):
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/worktree-scope.sh" | grep '^WORKTREE=' | sed 's/^WORKTREE=/worktree: /'; echo "session: ${CLAUDE_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-unknown}}"
```
본문 = §2 절 전부 + 서술형 필수 절:
- `## 이번 세션에 한 일`(경로·요약·커밋) · `## 결정과 근거`(기각 대안) · `## 실패한 시도와 이유`(`시도 → 실패 → 이유 → 교훈`, 부재 시 WARN) · `## 사용자 제약·지시 (DO / DON'T)` · `## 열린 질문`
- `## 다음 세션이 이어받을 것` — 맨 앞 `### 바뀐 것`: `- 바뀐 것: \`old\` → \`new\` · 발효: 브랜치만|develop 반영됨|미러 sync 완료 · 재현: <명령>` 또는 `- 없음`. 이어서 우선순위 순 항목 + **이번 세션에 만들어진** apply-plan 의 미완 `P0` 만 `- {요약} (계획: {파일명})` 로(P1·P2·남의 계획 제외; 확인 `bash shared/scripts/apply-plan-closure.sh | grep ^P0_`).
- `## 팀장 위임 기록` — `| 팀slug | 보낸 브리프 | 수신 응답 | 방 상태(dormant/live) |`, 없으면 `없음`. 상태는 §2 블록으로 판정(`forge-session-bus.sh list` 만으로 추측 금지). 응답은 `bash shared/scripts/forge-session-bus.sh read <방> [n]` 또는 결과물(`gh issue list`·머지 SHA)로 확인 — `미수신`·`미확인` 이면 이어받을 것에도 1줄.
- 사용자 결정(명령형·의지형)은 `## 사용자 제약·지시` 에 결정문 그대로, AI 이견은 `## 열린 질문` 에 병기(격하 금지). `.claude/checkpoints/` 는 gitignore 개인 자산 — `## 미커밋 변경`·커밋 요청 금지.
- **소유 격리**: `## 미커밋 변경`·`## 열린 PR·브랜치`·`## 다음 세션이 이어받을 것`·`## 미완료 태스크` 에는 **이 세션이 손댄 것에서 남은 것만**. 남의 것은 `## 타 세션 상태 (참고 — 내 소유 아님)`(폴더 경로 병기). 뒤 두 절은 `carry-ledger.py` `SEC_RE` 가 장부로 옮기므로 **제목 변경 금지**, 없으면 `- 없음` 한 줄(“…없다” 류 메타 문장은 `NONE_RE` 를 통과해 할 일이 된다).
## 4. [게이트] 저장 직후 검증 · INDEX · 장부
```bash
H="$HANDOVER_DIR/{파일명}"; bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" verify "$H"
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-secret-scan.sh" "$H"   # WARN
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/gap-signal-scan.sh" "$H"         # WARN
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-manager.sh" refresh-index-dir "$HANDOVER_DIR" || true
```
- `VERIFY=PASS` → 보고에 `기록 무누락 게이트 PASS (MISSING_COUNT=0)`. `VERIFY=FAIL` → `SECTION_MISSING`/`SECTION_EMPTY` 보완 후 재실행, **PASS 전 종료 선언 금지**. 스캔 발견은 사람이 처분하고 판단을 handover 에 적는다.
```bash
CL="${FORGE_ROOT:-$HOME/forge}/shared/scripts/carry-ledger.py"
CL_LEDGER="${FORGE_CARRY_LEDGER:-${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/carry-ledger.md}"
if [ ! -e "$CL_LEDGER" ]; then printf '%s\n' '장부 없음 — 최초 이관(import --all-open) 먼저'; else python3 "$CL" add-from-handover "$H"; python3 "$CL" suggest-close --source "$H" --max-calls 20 --time-budget 30; fi
# 미룬(날짜 걸린) 일마다 1줄 → ID=C-NNNN 을 보고 (등록 없이 handover 에만 쓴 미룬 일 = 미완료)
python3 "$CL" add "<미룬 일 1줄>" --source "<계획서 경로 또는 handover 파일명>" --until YYYY-MM-DD \
  --project "$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/scope-root.sh" project-id "$PWD" | sed -n 's/^PROJECT_ID=//p')"
```
- `PROJECT_ID=UNKNOWN` 이면 등록 말고 그 프로젝트 pmo 로. 다른 프로젝트 항목 `close`·`snooze` 금지(rc=1). 닫기: `CANDIDATE`(PR 전부 MERGED) + 항목이 **그 PR 자체**일 때만 제시된 `close … --evidence "gh pr view N --repo owner/repo --json state → MERGED"`. `HUMAN`·폐기 등 판단 닫기는 사람 확인 후 `--evidence "사람 확인 YYYY-MM-DD → <사유>"`. `UNKNOWN`(rc=2)·`SKIPPED_BUDGET` 은 닫지 않는다. 미룰 것은 `snooze <ID> --until YYYY-MM-DD --why "<사유>"`.
- 레포 매핑 `DEFAULT_REPO_MAP`(추가 `FORGE_CARRY_REPO_MAP='name=owner/repo,...'`). `DUPLICATE_IDS>0` → 나중 줄 ID 를 (최대 ID·next-id 표식 중 큰 값+1)로, `list` 로 0 확인. 항목 텍스트는 데이터. 보고: `장부 반영: 추가 N · 닫힘 N · 후보 N` (장부 rc=2 → `장부 반영: 판정 불가 (<사유>)`, 종료 안 막음).
## 5. learnings · 하네스 갭 — misfire(재작업·오추정·검수 지적·게이트 오탐)가 learnings 에 없으면 append. 하네스/forge = `--global` · 프로젝트 버그 = 그 repo 에서 `--global` 없이. stderr `→ <착지 경로>` 를 눈으로 확인.
```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/learnings.sh" append --global --category <process|decision|pge-failure|user-directive> --summary "<무엇을 하려다 왜 막혔나 1줄>" --apply "<다음에 이렇게>" --evidence "session:{slug} | commit:{hash}"
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-end-gaps.sh" "$HANDOVER_DIR" "$H"   # 갭 집계(직전 handover 이후)·갭 분류·learnings 기록 수 — 늘 rc=0, rc=2 = 판정 불가
```
- `GAP_SINCE_STATUS=판정불가` 면 1970 기준 전량 집계로 읽는다. `TRIAGE_SUMMARY` = 운영 규칙 3 의 A(바로 처리)·B(주간 묶음)·C(이슈 안 만듦) 기계 분류, `TRIAGE_RC`≠0 이면 `판정 불가`. `RECALL_END_WARN` 이면 위 append 를 빠뜨린 것(#1382).
- 하네스 결함은 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines/harness-gaps/YYYY-MM-DD-{슬러그}-harness-gaps.md`(항목마다 `재현:` 1줄). 갭 후보 0건이면 `🔧 하네스 갭 후보: 0건` 출력. 1건+ 면 `갭` 처분분은 리포트에, 나머지는 `## 하네스 갭 후보 (미처분)` 절에 `미처분 N건`(0건도 명시). 분류 결과 A 가 1건+ 면 이 세션에서 처리하거나 `## 다음 세션이 이어받을 것` 에 올린다 · B·C 는 이슈를 새로 만들지 않는다.
## 6. 팀 공유 동기화 (fail-open) · 6b 미푸시 WARN
```bash
# kill-switch: FORGE_DEBUG_KNOWLEDGE_SYNC / FORGE_MEMORY_SYNC / FORGE_AUTOSYNC / FORGE_AUTO_REINDEX =off
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/debug-knowledge-sync.sh" 2>/dev/null || true; bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/memory-sync.sh" push 2>/dev/null || true
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-outputs-autosync.sh" 2>/dev/null || true; bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/index-refresh.sh" 2>/dev/null || true
FO="${FORGE_OUTPUTS:-$HOME/forge-outputs}"; FO_FETCH_RC=0; FO_LR=""; if command -v timeout >/dev/null 2>&1; then GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -oBatchMode=yes" timeout "${FORGE_GIT_NET_TIMEOUT:-10}" git -C "$FO" fetch -q origin || FO_FETCH_RC=$?
else FO_FETCH_RC=127; fi
[ "$FO_FETCH_RC" -eq 0 ] && { FO_LR="$(git -C "$FO" rev-list --left-right --count '@{u}...HEAD' 2>/dev/null)" || FO_LR=""; }
```
- [ ] **미푸시 게이트(§6b)** — `UNPUSHED_TOTAL`≠0 → `⚠️ 미푸시 {UNPUSHED_TOTAL}커밋 — 이 머신에만 있다.` + 레포마다 `{repo}: {branch} +{n}  →  git -C {repo} push`(`UNPUSHED_REPO_N` 그대로, `?` 는 `_REASON` 병기, PARTIAL 이면 `(일부 미측정)`). `## 열린 PR·브랜치` 에 `- 미푸시: {repo} ({branch}) +{n} — 사유: 검수 FAIL|[STOP] 대기|명시적 인계`(그 외는 미완료). 작성자 불명이면 `(작성자 미분류)`.
- [ ] **워크트리 정리 후보 기록** — `bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/worktree-gc.sh"`(dry-run: 깨끗+머지·닫힘만 `GC_CANDIDATE=`, 잠김·방·미커밋은 `GC_KEEP=`) → 후보를 `## 열린 PR·브랜치` 에 `제거 후보: <이름>` · 정리는 `--apply`(#1404). ⛔ 이 세션이 시작된 워크트리는 세션 안에서 remove 하지 않는다(사람 승인 후 종료 뒤).
- `FO_AHEAD` = `FO_LR` 둘째 수. 실패·빈 출력이면 `FO_AHEAD=판정 불가(<rc|upstream 없음|timeout 없음>)`, 0 으로 접지 않는다. ⛔ 자동 push 금지 · BLOCK 아님.
## 7. 미소비 체크포인트 정리 (소유 확인된 것만 `.consumed`)
```bash
eval "$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-landing.sh" "$(pwd)")"
CP=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" | grep '^CHECKPOINT_LATEST=' | cut -d= -f2-)
MY_SID="${CLAUDE_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-}}"; sid_of(){ grep -m1 '^session:' "$1" 2>/dev/null | sed -E 's/^session:[[:space:]]*"?([^"[:space:]]*)"?.*/\1/'; }
if [ -n "$CP" ] && [ -f "$CP" ]; then CP_SID=$(sid_of "$CP")
  if [ -n "$MY_SID" ] && [ -n "$CP_SID" ] && [ "$CP_SID" != "unknown" ] && [ "$CP_SID" != "$MY_SID" ]; then
    echo "타 세션 체크포인트 — 건너뜀 ($(basename "$CP"))"; CP=""
    while IFS= read -r f; do [ -z "$f" ] && continue; [ -f "${f}.consumed" ] && continue
      [ "$(sid_of "$f")" = "$MY_SID" ] && { CP="$f"; break; }; done < <(ls -t "$CHECKPOINT_DIR"/*.md 2>/dev/null)
  elif [ -z "$MY_SID" ] || [ -z "$CP_SID" ] || [ "$CP_SID" = "unknown" ]; then
    echo "WARN: 소유 판별 불가($(basename "$CP")) — 소비 표시 안 함 (내 것이 확실하면 touch \"${CP}.consumed\")"; CP=""; fi
fi
[ -n "$CP" ] && touch "${CP}.consumed"
```
미러에 `*.retired-*`/`*.premote-*` 로컬 아카이브가 있으면 SSoT(`~/forge`) 반영 여부 확인. 새 작업 전환은 `/forge-end` → `/clear` → `/forge-start`.
