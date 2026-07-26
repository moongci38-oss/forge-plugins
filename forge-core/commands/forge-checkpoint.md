---
description: "같은 세션 계속 — /compact 전 경량 체크포인트 저장 + 기록 무누락 게이트. 트리거: /forge-checkpoint, 토큰 70~90% 경고 (구 /checkpoint 개명)."
group: ops
---

# /forge-checkpoint

**같은 세션에서 작업 중, 컨텍스트 사용량이 많아 정리가 필요할 때** 실행한다. 저장 → `/compact` → **같은 세션에서 이어서 진행**.

## 3분법 경계 (먼저 확인)

| 상황 | 커맨드 | 짝 |
|---|---|---|
| 세션을 **새로 연다** | `/forge-start` | — |
| **계속 쓴다**(정리만) | **`/forge-checkpoint`** | **`/compact`와 한 쌍** |
| **완전히 닫는다** | `/forge-end` | `/forge-start` |

⚠️ **`/clear`는 checkpoint의 짝이 아니다.** checkpoint의 짝은 `/compact`뿐이다. 관련 없는 새 작업으로 전환할 때만 `/forge-end` → `/clear` → `/forge-start`가 정석이다(이전 맥락이 남으면 새 작업을 오염시키므로 그때는 오히려 지워야 한다 — 단 end가 선행돼 인계 가치가 handover에 영속화된 뒤에만).

- 90%+ 또는 마일스톤 완료 → checkpoint가 아니라 `/forge-end`.
- **compact 없이 checkpoint만 반복 호출**되면 안내 1줄: `"/compact를 잊으셨습니다 — checkpoint의 짝은 compact입니다."`
- 이 커맨드는 **순수 state snapshot**이다. 코드 수정·파일 생성(체크포인트 파일 제외)·명령 실행 금지.

## 실행

### 0. 세션 건강도 1줄

🟢 <70% → 저장 후 계속 / 🟡 70~90%·Phase 전환·승인 대기 → 저장 → compact / 🔴 90%+·마일스톤 완료 → `/forge-end`로 전환.
`git status --short | wc -l` > `FORGE_CHECKPOINT_DIRTY_LIMIT`(기본 10) → 🟡 + "WIP 커밋 권장" 1줄(자동 커밋 금지).

### 1. **[게이트] 기록 무누락 — 저장 전 수집원 실측** (계약 ⑦)

`/forge-end`와 **동일한 게이트**를 적용한다. compact는 대화 이력을 압축하므로, 지금 안 적은 것은 재개 시 존재하지 않는다.

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" collect "$(pwd)"
```

8 수집원 → 체크포인트 본문 8절에 1:1 반영. **해당 없으면 `없음` 명시**(절 생략 = 게이트 FAIL).

**백그라운드 워커 생존 절은 checkpoint에서 특히 중요하다** — compact가 대화 이력을 압축하면 워커 로스터(누가 무엇을 하고 있었는지)가 소실돼 재스폰이 불가능해진다(2026-07-26 워커 6기 유실 실사고). 워커 1기당 **브리프 영속 경로 + 생존 실측(`recent_changes`·`last_change` 수치) + 재개 1줄**을 적는다. "실행 중" 텍스트 단정 금지. `WORKER_BRIEF_PERSISTED`가 `yes`가 아닌 활성 워커가 있으면 **영속화 후에만 저장**(미영속 = 게이트 FAIL).

> checkpoint는 순수 snapshot이라 여기서 learnings를 **append하지 않는다** — 미기록 misfire는 `## learnings 미기록 misfire` 절에 적어 compact 유실을 막고, 재개 세션 또는 `/forge-end`가 append한다.

### 2. 착지 경로 (계약 ⑤)

```bash
eval "$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-landing.sh" "$(pwd)")"
mkdir -p "$CHECKPOINT_DIR"
```

`CHECKPOINT_DIR`은 워크트리 여부와 무관하게 **`$FORGE_OUTPUTS/.claude/checkpoints`(논리 단일 위치)** 다 — 새 세션·다른 워크트리에서도 `/forge-start`가 회수할 수 있어야 하기 때문이다. 스크립트 부재 시 폴백 = `${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/checkpoints`.

### 3. 파일 작성

경로: `$CHECKPOINT_DIR/$(date +%Y-%m-%d-%H%M).md` — 파일명은 date 자동 생성만(사용자 입력 삽입 금지), append-only(덮어쓰기 금지).

사전 캡처: `git status --short` / `git diff --stat HEAD` / `git log --oneline -3`.

```markdown
---
date: 2026-07-26
time: "1830"
model: opus
slug: checkpoint-{요약}
status: open
project: forge
type: human-verify        # human-verify | decision | human-action | tdd-review
---

# Checkpoint YYYY-MM-DD HH:MM
branch: {브랜치} ({repo 경로})

## 진행 중 태스크
## 다음 스텝 (번호)
## 블로커
## 컨텍스트 메모 (compact 후 잊으면 안 되는 비자명 정보만)

<!-- 이하 계약 ⑦ 8절 — 해당 없으면 "없음" -->
## 미완료 태스크
## 승인 대기([STOP])
## 미커밋 변경
## 열린 PR·브랜치
## 진행 중 백그라운드 작업
## learnings 미기록 misfire
## 사용자 지시 미이행
## 백그라운드 워커 생존
```

frontmatter는 handover와 같은 스키마를 쓴다 — 스캐너가 date로 최신성을 판정하기 때문이다(파일명 mtime 아님). 보안 정보(토큰·패스워드) 기록 절대 금지. 20~50줄 유지.

### 4. **[게이트] 자가 대조** (계약 ⑦(b))

```bash
bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/session-record-audit.sh" verify "{체크포인트 경로}"
```

`VERIFY=FAIL`이면 지목된 절을 보완 후 재실행. PASS 전에 `/compact` 안내 금지.

### 5. 안내 출력

```
체크포인트 저장: {경로} (기록 무누락 게이트 PASS 8/8)
이제 /compact 실행하세요. compact 후 "계속"/"resume" 입력하면 이어갑니다.
```

**대형 스킬(15KB+) 2개 이상을 이 세션에서 호출했다면** compact 재주입 비용(실측 40~60K 토큰)이 절감을 역전하므로 대신 이렇게 안내한다:

```
체크포인트 저장: {경로} — 이 세션은 대형 스킬 2개+ 호출로 /compact 재주입 비용이 큽니다.
세션을 닫고 새 세션에서 /forge-start 하세요 — 미소비 체크포인트를 자동 감지·복원합니다.
```

(이 경로가 성립하는 이유 = `/forge-start`의 미소비 체크포인트 감지. 과거엔 이 배선 없이 `/clear`만 권고돼 맥락이 유실됐다 — F7.)

### 6. 재개 ("계속"/"resume"/"이어서")

같은 세션 compact 직후든 새 세션 첫 메시지든 동일하게 동작한다.

1. `session-recall.sh` 출력의 `CHECKPOINT_LATEST` read (`CHECKPOINT_UNCONSUMED=yes`면 미소비). 없으면 "체크포인트 없음 — 처음부터 시작".
2. 브랜치 불일치 시 "⚠️ 브랜치 불일치" 경고 후 계속. uncommitted 변경 있으면 경고만(강제 덮어쓰기 금지).
3. "다음 스텝" 1번부터 재개 — 항목 그대로 출력 후 실행.
4. 복원 완료 시 `touch "{경로}.consumed"` (재안내 루프 방지).

## 체크리스트

- [ ] 3분법 판정 (계속 쓴다 = checkpoint가 맞나)
- [ ] `session-record-audit.sh collect` → 8 수집원 실측
- [ ] 착지 = `$FORGE_OUTPUTS/.claude/checkpoints` (워크트리여도 동일)
- [ ] frontmatter 5필드 + 8절 작성 ("없음" 명기)
- [ ] 백그라운드 워커: 브리프 영속 경로 + 생존 실측 수치 + 재개 1줄 (미영속이면 영속화 후 저장)
- [ ] `verify` PASS 후에만 compact 안내
