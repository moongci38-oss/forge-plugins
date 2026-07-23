---
name: checkpoint
description: "Mid-session 경량 체크포인트 — /compact 전 상태저장, '계속'/'resume'으로 복원. 트리거: /checkpoint, 토큰 70~90% 경고. 세션종료는 end-sonnet/end-opus."
---

# checkpoint

/compact 전 세션 상태만 저장하는 경량 스냅샷. 세션 종료(end-sonnet) 아님 — handover·learnings·INDEX 갱신 안 함. **코드 수정·파일 생성·명령 실행 금지, 순수 state snapshot만.**

## Step 0: 세션 건강도 1줄 진단

- 🟢 <70% 토큰·블로커 없음 → checkpoint 후 계속 / 🟡 70~90%·Phase 전환·승인 대기 → checkpoint → 재개 경로는 Step 1.5 판정 따름 / 🔴 90%+·마일스톤 완료 → `/end-sonnet` 전환.
- [STOP] 게이트·외부 승인 대기 중 = 🟡 처리.
- `git status --short | wc -l` > `FORGE_CHECKPOINT_DIRTY_LIMIT`(기본 10) → 🟡 + "WIP 커밋 권장" 1줄 (자동 커밋 금지).

## Step 1: 파일 작성

경로: `~/.claude/checkpoints/$(date +%Y-%m-%d-%H-%M).md` (파일명 = date 자동 생성만 — 사용자 입력 삽입 금지. append-only: 기존 파일 덮어쓰기 금지). `mkdir -p` 선행. `/checkpoint list` = `ls -lt ~/.claude/checkpoints/` 출력만.

사전 캡처: `git status --short` / `git diff --stat HEAD` / `git log --oneline -3`.

템플릿 (20~40줄 유지, frontmatter `type:` = human-verify | decision | human-action | tdd-review):

```markdown
# Checkpoint YYYY-MM-DD HH:MM
type: {위 4택1}
branch: {브랜치} ({repo 경로})

## 진행 중 태스크 / ## 완료 (이번 세션) / ## 다음 스텝(번호) / ## 블로커
## 열린 파일·미결 결정 / ## 컨텍스트 메모(compact 후 잊으면 안 되는 비자명 정보만)
## Git 상태
```{git status --short 출력}```
```

보안 정보(토큰·패스워드) 기록 절대 금지.

## Step 1.5: 재개 경로 판정 — /compact vs 새 세션 (2026-07-21 실측 반영)

**`/compact`는 대화 이력만 압축하고, 이번 세션에서 호출한 스킬 전문(SKILL.md/커맨드 본문)은 재개 시 전량 재주입된다** — 실측: 대형 스킬(15KB+, 예: qa/forge-implement/autoplan) 2개 이상 호출된 세션은 재주입만 40~60K 토큰(재개 시점 rules 고정비 합산 ~170K까지 상승), `/compact`의 캐시 절감 이득을 역전시킨다.

- 이번 세션에서 **15KB+ 스킬을 2개 이상 Skill 도구로 호출**했다면(자신의 tool-call 이력으로 판단) → **`/compact` 권장하지 않음**. Step 2 안내를 "compact 후 계속" 대신 "**`/clear`로 새 세션을 열고 이 체크포인트 파일을 read**"로 출력.
- 그 외(대형 스킬 미호출 또는 1개 이하) → 기존대로 `/compact` → "계속" 재개 정상 권장.
- 상세 실측 근거: `~/forge/dev/rules/forge-context-management.md §/compact 한계`.

## Step 2: 안내 출력

Step 1.5 판정에 따라 둘 중 하나만 출력(둘 다 X):

- **대형 스킬 2개+ 호출됨** → `체크포인트 저장: {경로} — 이번 세션은 대형 스킬을 2개 이상 호출해 /compact 재주입 비용이 큽니다. /compact 대신 /clear로 새 세션을 연 뒤 "계속"이라고 입력해주세요(체크포인트 자동 read).`
- **그 외(기존 경로)** → `체크포인트 저장: {경로} — 이제 /compact 실행하세요. compact 후 "계속"/"resume" 입력하면 이어갑니다.`

## Step 3: 재개 ("계속"/"resume"/"이어서"/"continue")

같은 세션에서 compact 직후든, `/clear`로 연 새 세션의 첫 메시지든 동일하게 동작한다(새 세션은 직전 대화 이력이 없으므로 아래 1번 read가 유일한 컨텍스트 소스).

1. `~/.claude/checkpoints/` 최신 파일(파일명 역순) read. 없거나 빈 파일 → "체크포인트 없음 — 처음부터 시작" 출력.
2. 브랜치 불일치 시 "⚠️ 브랜치 불일치" 경고 후 계속. uncommitted 변경 있으면 경고만(강제 덮어쓰기 금지).
3. "다음 스텝" 1번부터 재개 — 항목을 그대로 출력 후 실행.
