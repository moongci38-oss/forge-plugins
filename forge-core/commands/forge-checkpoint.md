---
description: "같은 세션 계속 — /compact 전 경량 체크포인트 저장 + 기록 무누락 게이트. 트리거: /forge-checkpoint, 토큰 70~90% 경고 (구 /checkpoint 개명)."
group: ops
---

# /forge-checkpoint

같은 세션에서 컨텍스트 정리가 필요할 때: 저장 → `/compact` → **같은 세션에서 이어서 진행**. 3분법: 새로 연다 `/forge-start` · **계속 쓴다(정리만) `/forge-checkpoint` ↔ 짝 `/compact`** · 완전히 닫는다 `/forge-end`.
- `/clear` 는 짝이 아니다. 무관한 새 작업 전환만 `/forge-end` → `/clear` → `/forge-start`.
- 90%+ 또는 마일스톤 완료 → `/forge-end`. compact 없이 반복 호출되면: `"/compact를 잊으셨습니다 — checkpoint의 짝은 compact입니다."`
- **순수 state snapshot** — 코드 수정·파일 생성(체크포인트 파일 제외)·명령 실행 금지(아래 스크립트 제외). learnings append 도 안 한다(`## learnings 미기록 misfire` 절에 적는다).
- 연속성 계약 ①~⑦ · 경로 · 형식 → `rules-on-demand/handover-canon.md`

## 0. 세션 건강도 1줄 — 🟢 <70% 저장 후 계속 / 🟡 70~90%·Phase 전환·승인 대기 → 저장 → compact / 🔴 90%+ → `/forge-end`. `git status --short | wc -l` > `FORGE_CHECKPOINT_DIRTY_LIMIT`(기본 10) → 🟡 + "WIP 커밋 권장" 1줄(자동 커밋 금지).
## 1. [게이트] 기록 무누락 — 수집원 실측 (계약 ⑦) · §2 착지 · §2-b 갭 후보까지 한 번에
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-checkpoint-collect.sh" "$(pwd)"` — 항상 exit 0(fail-open). `*_ERROR:` 줄은 실패이지 0건이 아니다.
- `session-record-audit.sh collect` 수집원 → 본문 각 절 1:1 반영(개수 정본 = `CHECKLIST_SECTIONS` 출력). 해당 없으면 `없음` 명시(절 생략 = FAIL).
- **백그라운드 워커(live, `WORKER_WORKTREE=`)**: 1기당 브리프 영속 경로 + 생존 실측(`recent_changes`·`last_change`) + 재개 1줄. `WORKER_BRIEF_PERSISTED` ≠ `yes` 인 활성 워커 → 영속화 후에만 저장.
- **세션 버스 워커(dormant, `~/.claude/state/session-bus.jsonl`)**: live 와 별개 · 사망 판정 미적용. `## 백그라운드 워커 생존` 안에 분리 표 `### 세션 버스 워커 (dormant — live 프로세스 아님)` — `| name | sid8 | cwd | 최종응답 | 인계 지시 |`(인계 지시 없으면 `-`). `BUS_WORKER_COUNT=0` → `없음`.
## 2. 착지 경로 (계약 ⑤)
위 출력 `CHECKPOINT_DIR=` = `$FORGE_OUTPUTS/.claude/checkpoints`(워크트리여도 동일, mkdir 완료) · `HANDOVER_DIR=` 는 §4 에 쓴다. `LANDING=fallback` = handover-landing.sh 부재/무응답 → 논리 경로.
## 2-b. 하네스 갭 후보(신규) — 직전 체크포인트(`CP_PREV`·`CP_SINCE`) 이후 미판정분만 표시(리포트 파일 안 씀)
0건 출력도 그대로 보여준다. 1건+ 이면 id 있는 항목마다 `갭 — <한 줄> (재현: <명령>)` / `정상동작 — <사유>` 판정 후 같은 jsonl 에 DISPOSED append(id 없는 항목은 표시만). `갭` 판정 = harness-gaps 리포트 대상(`재현:` 1줄 필수):
```bash
python3 -c "
import json, os, sys, datetime
path = os.path.join(os.environ.get('FORGE_OUTPUTS', os.path.expanduser('~/forge-outputs')), '.claude', 'audit', 'hook-fp-telemetry.jsonl')
hook = None
for line in (open(path, encoding='utf-8', errors='replace') if os.path.isfile(path) else []):
    try: d = json.loads(line)
    except Exception: continue
    if isinstance(d, dict) and d.get('id') == sys.argv[1] and d.get('event') in ('BLOCK', 'WARN', 'BYPASS') and isinstance(d.get('hook'), str): hook = d.get('hook')
rec = {'ts': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'event': 'DISPOSED', 'id': sys.argv[1], 'verdict': sys.argv[2], 'note': sys.argv[3][:80], 'hook': hook}
with open(path, 'a', encoding='utf-8') as f: f.write(json.dumps(rec, ensure_ascii=False) + chr(10))
" "<id>" "gap|normal" "<한 줄 사유>"
```
## 3. 파일 작성
경로: `$CHECKPOINT_DIR/$(date +%Y-%m-%d-%H%M)-$(printf '%s' "${CLAUDE_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-$$}}" | tr -cd 'A-Za-z0-9-' | cut -c1-8).md` — 자동 생성만(사용자 입력 금지) · append-only. 사전 캡처: `git status --short` / `git diff --stat HEAD` / `git log --oneline -3`.
```markdown
---
date: YYYY-MM-DD
time: "HHMM"
model: opus
slug: checkpoint-{요약}
status: open
project: forge
session: "{실값}"   # ${CLAUDE_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-unknown}} 를 치환 — 리터럴 금지
type: human-verify        # human-verify | decision | human-action | tdd-review
---
# Checkpoint YYYY-MM-DD HH:MM
branch: {브랜치} ({repo 경로})
## 진행 중 태스크
## 다음 스텝 (번호)
## 블로커
## 컨텍스트 메모 (compact 후 잊으면 안 되는 비자명 정보만)
### 바뀐 것
- 바뀐 것: {옛 이름} → {새 이름} · 발효: {develop 반영됨 | PR #N 브랜치만 | 미러 sync 필요} · 재현: {명령}
```
- 이어서 각 절도 `## ` 제목으로(해당 없으면 "없음"): 팀장 위임 기록 (팀slug | 보낸 브리프 | 수신 응답 | 방 상태 dormant/live — 없으면 "없음") · 날짜 걸린 할 일 (미룬 일 — `YYYY-MM-DD | 1줄 | 출처`, 없으면 "없음") · 미완료 태스크 · 승인 대기([STOP]) · 미커밋 변경 · 열린 PR·브랜치 · 진행 중 백그라운드 작업 · learnings 미기록 misfire · 사용자 지시 미이행 · 백그라운드 워커 생존.
- `### 바뀐 것`: 없으면 `- 바뀐 것: 없음` 한 줄(비우면 verify FAIL). `## 날짜 걸린 할 일`: 여기선 장부(`carry-ledger.md`)에 쓰지 않는다 — 등록은 §6 재개 또는 `/forge-end` §4.
- `## 미완료 태스크`: **이 세션이 손댄 것만**(장부 `carry-ledger.py` `SEC_RE` 가 읽어 승격). 타 세션·타 프로젝트 항목은 `## 타 세션 상태 (참고 — 내 소유 아님)` 에 격리. 없으면 `- 없음` 한 줄(메타 문장 금지 — `NONE_RE` 통과해 할 일로 등록됨). ⛔ 절 제목 변경 금지. 정본 → `/forge-end` §3.
- `session:` 실값 확인 `echo "${CLAUDE_SESSION_ID:-${CLAUDE_CODE_SESSION_ID:-}}"` · 둘 다 비면 `unknown`. 토큰·패스워드 기록 금지. 20~50줄.
- `## 팀장 위임 기록`: 수신 응답을 `미확인` 으로 두고 끝내지 않는다 — `bash shared/scripts/forge-session-bus.sh read <방> [n]` 로 읽고, 등록·커밋 위임은 결과물(이슈 번호·머지 SHA)로 확인. 끝내 미확인이면 다음 스텝에 1줄. 방 상태 출처 = §1 (`BUS_WORKER_N=…|dormant` / `WORKER_WORKTREE=`), `forge-session-bus.sh list` 로 추측 금지. 팀 목록 → `rules-on-demand/team-routing.md`
## 4. [게이트] 자가 대조 (계약 ⑦(b))
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" verify "{체크포인트 경로}"`
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-manager.sh" refresh-index-dir "$HANDOVER_DIR" || true`
`VERIFY=FAIL` → 지목 절 보완 후 재실행. **PASS 전 `/compact` 안내 금지.** (INDEX 는 기계 생성 — 수동 편집 금지)
## 5. 안내 출력 — `체크포인트 저장: {경로} (기록 무누락 게이트 PASS 8/8)` / `이제 /compact 실행하세요. compact 후 "계속"/"resume" 입력하면 이어갑니다.` · 이 세션에서 대형 스킬(15KB+) 2개+ 호출 시 대신: "세션을 닫고 새 세션에서 /forge-start 하세요 — 미소비 체크포인트를 자동 감지·복원합니다."
## 6. 재개 ("계속"/"resume"/"이어서")
1. **[소유 검증]** `CHECKPOINT_LATEST` 는 전역 최신일 뿐 — 대조 없이 복원하면 남의 것을 오복원한다.
`bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-checkpoint-resume.sh" "$(pwd)"` → `CP=` 가 복원 대상(빈값 = "체크포인트 없음 — 처음부터"). `CP_OWNERSHIP`: `own` 내 것 · `switched` 타 세션 것 건너뛰고 미소비 내 것으로 교체 · `nosid`/`nofield` fail-open(WARN 줄 그대로 보고) · `none` 없음. 항상 exit 0.
2. 브랜치 불일치 → "⚠️ 브랜치 불일치" 경고 후 계속. uncommitted 변경은 경고만(덮어쓰기 금지).
3. "다음 스텝" 1번부터 그대로 출력 후 실행. `## 날짜 걸린 할 일` 이 "없음"이 아니면 항목마다 장부 등록 → 나온 `ID=C-NNNN` 을 보고(`PROJECT_ID=UNKNOWN` 이면 등록 말고 pmo 로):
   `python3 "${FORGE_ROOT:-$HOME/forge}/shared/scripts/carry-ledger.py" add "<1줄>" --source "<출처>" --until <날짜> --project "$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/scope-root.sh" project-id "$PWD" | sed -n 's/^PROJECT_ID=//p')"`
4. 복원 완료 시 `touch "${CP}.consumed"`.
