---
description: "세션 완전 종료 — 서술형 handover 작성(단일 레인) + 기록 무누락 게이트. 트리거: \"세션 종료\", \"end\", /forge-end (구 /end-opus·/end-sonnet 통합)."
group: ops
---

# /forge-end

**세션을 완전히 종료할 때** 실행한다. 다음 세션(나 또는 팀원)이 `/forge-start`로 이어받는다.

`/end-opus`·`/end-sonnet` 통합본. 모델 구분은 디렉토리가 아니라 **frontmatter `model:` 필드**로만 한다(레인 단일화).

> 같은 세션을 계속 쓸 거면 여기가 아니라 `/forge-checkpoint`다(3분법: 새로 연다=start / 계속 쓴다=checkpoint / 완전히 닫는다=end).

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
| 열린 PR·브랜치 | `OPEN_PR_COUNT`·`BRANCH`·`UNPUSHED_COMMITS` | `## 열린 PR·브랜치` |
| 진행 중 백그라운드 작업 | 세션 이력(도구 호출) | `## 진행 중 백그라운드 작업` |
| learnings 미기록 misfire | `LEARNINGS_LAST` + 세션 misfire 회고 | `## learnings 미기록 misfire` |
| 사용자 지시 미이행 | 세션 이력(사용자 발화) | `## 사용자 지시 미이행` |
| **백그라운드 워커 생존** | `WORKER_BRIEF*`·`WORKER_WORKTREE*`·`RECENT_CHANGES_CWD` | `## 백그라운드 워커 생존` |

#### 백그라운드 워커 생존 절 규약 (2026-07-26 실사고 — compact 후 워커 6기 유실)

이 절은 **"실행 중"이라는 텍스트 단정을 금지**한다. 워커 1기당 아래 4개를 모두 적는다:

```
- {워커명} / 브리프: {영속 경로} / 산출: {워크트리·출력 경로}
  생존 실측: 최근 15분 변경 {N}건, 마지막 변경 {YYYY-MM-DD HH:MM} (collect의 WORKER_WORKTREE 행)
```

- **(b) 브리프 영속 확인이 게이트다** — `WORKER_BRIEF_PERSISTED`가 `yes`가 아닌데 활성 워커가 있으면 **저장 전에 브리프를 디스크에 영속화**하고(예: `$CLAUDE_JOB_DIR/tmp/worker-briefs/{name}.md` 또는 `$FORGE_OUTPUTS/11-platform/pipelines-2/worker-briefs/`) 그 경로를 기록한다. 미영속 상태로 저장하면 **게이트 FAIL** — 컨텍스트가 날아가면 재스폰 불가가 된다(실사고 원인).
- **(a) 생존 증거는 수치로만** — `recent_changes`·`last_change`는 collect가 실측한 값을 그대로 옮긴다. 값을 추정·반올림하지 않는다.
- **(c) 재개 절차 1줄 필수**: `재개: 생존 실측 → 15분+ 무변화 & 핑(SendMessage) 무응답이면 사망 판정 → 영속 브리프에서 재스폰`.
- 워커가 없으면 `없음`.

**(c) "없음"도 명시 기록** — 해당 없으면 그 절에 `없음`이라고 적는다. 침묵(안 봄)과 없음(봤는데 없음)은 다르다. 절을 통째로 빼면 게이트 FAIL이다.

### 3. handover 작성

`$HANDOVER_DIR/YYYY-MM-DD-HHMM-{slug}.md`, frontmatter 필수 5필드 고정:

```markdown
---
date: 2026-07-26
time: "1830"
model: opus            # 세션 모델 자동 감지 (opus|sonnet|fable|...)
slug: kebab-case-summary
status: open           # open | closed
project: forge         # repo 이름으로 정규화
---
```

본문 = §2의 8절 + 아래 서술형 필수 절:

- `## 이번 세션에 한 일` — 파일 경로 + 변경 요약(+커밋 해시)
- `## 결정과 근거` — 결정 + 기각한 대안(AD-N)
- `## 실패한 시도와 이유` — `시도: {무엇} → 실패: {증상} → 이유: {원인} → 교훈: {다음 세션 지침}` (**부재 시 WARN** — 암묵지 표면화 카논)
- `## 사용자 제약·지시 (DO / DON'T)` — `- [DON'T] {내용} (근거)` / `- [DO] {내용}`
- `## 다음 세션이 이어받을 것` — 우선순위 순
- `## 열린 질문` — 미결 트레이드오프

> `*-auto.md`(훅 자동생성 스텁)와 구분되도록 파일명에 `-auto` 접미를 쓰지 않는다 — 회수 시 서술형/auto는 파일명·헤더 수로 판정된다.

### 4. **[게이트] 자가 대조 — 저장 직후 검증** (계약 ⑦(b))

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" verify "$HANDOVER_DIR/{파일명}"
```

- `VERIFY=PASS` → 통과. 완료 보고에 `기록 무누락 게이트 PASS (8/8절)` 1줄 포함.
- `VERIFY=FAIL` → `SECTION_MISSING`/`SECTION_EMPTY`로 지목된 절을 **보완한 뒤 재실행**. PASS 전에는 세션 종료 선언 금지.

### 5. learnings·misfire 반영

이번 세션 misfire(재작업·오추정·스킬 오작동·검수 지적·게이트 오탐)가 있었는데 learnings에 없으면 **지금 append**한다:

```bash
bash $HOME/.claude/scripts/learnings.sh append --category <process|decision|pge-failure|user-directive> \
  --summary "<무엇을 하려다 왜 막혔나 1줄>" --apply "<다음에 이렇게>" \
  --evidence "session:{slug} | commit:{hash}"
```

라우팅 — **하네스/forge misfire = `${FORGE_ROOT:-$HOME/forge}/.claude/learnings.jsonl`**(git 추적 = 전 PC 전파) / **프로젝트 고유 버그 = 해당 repo**. 없으면 skip(WARN-first, 강제 아님).

하네스 결함·개선점은 별도로 `${FORGE_OUTPUTS:-$HOME/forge-outputs}/11-platform/pipelines-2/reviews/{main|local}/YYYY-MM-DD-{슬러그}-harness-gaps.md`에 저장한다(main=git 전파 조치 / local=이 PC 한정 조치).

### 6. 팀 공유 동기화 (advisory·fail-open)

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/debug-knowledge-sync.sh" 2>/dev/null || true
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/memory-sync.sh" push 2>/dev/null || true
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/forge-outputs-autosync.sh" 2>/dev/null || true
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/index-refresh.sh" 2>/dev/null || true
```

kill-switch: `FORGE_DEBUG_KNOWLEDGE_SYNC=off` / `FORGE_MEMORY_SYNC=off` / `FORGE_AUTOSYNC=off` / `FORGE_AUTO_REINDEX=off`. 실패해도 세션 종료를 막지 않는다.

### 7. 미소비 체크포인트 정리

이번 세션이 `/forge-checkpoint`를 남겼다면 handover가 그것을 대체하므로 소비 표시:
```bash
CP=$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-recall.sh" | grep '^CHECKPOINT_LATEST=' | cut -d= -f2-)
[ -n "$CP" ] && touch "${CP}.consumed"
```

## 체크리스트

- [ ] 착지 경로 확인 (워크트리면 FORGE_OUTPUTS 논리 경로)
- [ ] `session-record-audit.sh collect` 실행 → 8 수집원 실측
- [ ] frontmatter 5필드(`date·time·model·slug·status·project`) 기입
- [ ] 8절 + 서술형 필수 절 작성 ("없음"도 명기) — 백그라운드 워커 절은 생존 실측 수치·브리프 경로·재개 1줄 포함
- [ ] `session-record-audit.sh verify` **PASS** (FAIL이면 종료 선언 금지)
- [ ] learnings misfire 반영 (해당 시)
- [ ] 팀 공유 동기화 (advisory)
- [ ] 미소비 체크포인트 `.consumed` 표시

## 경계

`/end-opus`·`/end-sonnet`은 이 커맨드의 alias(1사이클 유지 후 제거).
관련 없는 새 작업으로 전환할 때는 `/forge-end` → `/clear` → `/forge-start`가 정석이다.
