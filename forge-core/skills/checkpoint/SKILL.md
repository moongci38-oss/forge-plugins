---
name: checkpoint
description: "Mid-session 경량 체크포인트. /compact 또는 새 세션 재개 전 세션 상태를 ~/.claude/checkpoints/YYYY-MM-DD-HH-MM.md에 저장. 트리거: '/checkpoint', '체크포인트', 토큰 70%+ 경고 시. 재개 트리거(compact 직후 최근 checkpoint 존재 시): '계속'·'resume'·'이어서'·'continue'. 새 세션 재개는 /forge-resume."
---

# checkpoint

중간 토큰 관리용 경량 체크포인트. 세션 종료(end-sonnet) X — 계속 작업 전제.

```
/checkpoint → 파일 저장 → [/compact → "계속"] 또는 [새 세션 → /forge-resume]
```

## Step 0: 세션 건강도 + 재개 경로 진단

- 🟢 토큰 <70% → /checkpoint 후 계속 · 🟡 70~90% ([STOP]/승인 대기 포함) → 저장 후 재개 · 🔴 90%+/마일스톤 완료 → `/end-sonnet` 전환
- **재개 경로 선택 (컨텍스트 경제 — 2026-07-20 실측 근거)**: `/compact` 후에도 세션 중 호출한 스킬 본문 전문이 컨텍스트에 재주입된다(예: forge-pge 57KB·forge-fix 38KB — compact로 안 줄어듦). 따라서 **무거운 스킬(forge-fix/forge-pge/qa/audit 계열)을 호출한 세션은 /compact+"계속" 대신 새 세션에서 `/forge-resume` 재개를 권장** — 재주입 0 + compact 요약 비용 0. 가벼운 대화형 세션만 /compact+"계속"이 적합(미요약 최근 맥락 보존 이점).
- `git status --short | wc -l` > `FORGE_CHECKPOINT_DIRTY_LIMIT`(기본 10) 시 🟡 + "WIP 커밋 권장" 안내 (자동 커밋 금지 — 권고만).

체크포인트 목적 타입(frontmatter `type:` 권장): `human-verify`(승인 대기) | `decision`(설계 분기) | `human-action`(인간 외부 작업) | `tdd-review`(red→green 중간).

## Step 1: 체크포인트 파일 작성

> **HARD GATE**: 상태(state)만 캡처. 코드 수정·파일 생성·명령 실행 금지 — 순수 snapshot.

경로: `~/.claude/checkpoints/YYYY-MM-DD-HH-MM.md` (없으면 `mkdir -p`). 파일 작성 전 상태 캡처: `git status --short` · `git diff --stat HEAD` · `git log --oneline -3` · `date +"%Y-%m-%d %H:%M"` → `files_modified`에 삽입.

**LN-02 보안**: 파일명은 항상 date 자동 생성(사용자 입력 삽입 금지 — 인젝션 방어) · append-only(기존 파일 덮어쓰기 금지) · `/checkpoint list` = `ls -lt ~/.claude/checkpoints/` 출력만.

**템플릿** (20~40줄 유지, 장황 금지):

```markdown
# Checkpoint YYYY-MM-DD HH:MM
type: decision

## 진행 중 태스크
- {1줄}
## 완료 (이번 세션)
- {항목들}
## 다음 스텝
1. {즉시} 2. {그 다음}
## 블로커
- {없으면 "없음"}
## 열린 파일 / 결정
- {주요 파일 경로 · 미결 결정}
## 컨텍스트 메모
- {compact 후 잊으면 안 되는 비자명 정보}
## Git 상태 (files_modified)
{git status --short 출력}
```

## Step 2: 사용자 안내

```
체크포인트 저장: ~/.claude/checkpoints/YYYY-MM-DD-HH-MM.md

재개 방법 (둘 중 택1):
① 이 세션 계속: /compact → "계속" 입력
② 새 세션 재개(권장 — 이번 세션에서 무거운 스킬을 썼다면): /clear 또는 새 세션 → /forge-resume
```

② 권장 조건(무거운 스킬 호출 이력)이 아니면 ①만 안내해도 된다.

## Step 3: compact 후 재개 ("계속"/"resume"/"이어서"/"continue" 감지 시)

1. `~/.claude/checkpoints/` 파일명 내림차순 최신 read
2. 상태 복원 — 브랜치 불일치면 "⚠️ 브랜치 불일치" 경고 후 계속 · 파일 없음/빈 파일이면 "체크포인트 없음 — 처음부터 시작합니다"
3. **HARD GATE**: 복원 전 git status 확인, uncommitted 있으면 경고 (강제 덮어쓰기 금지)
4. "다음 스텝" 첫 항목부터 재개 — 다음 스텝을 그대로 출력해 맥락 없이 재개 가능하게

## 주의사항

- handover·learnings·INDEX 갱신 X (세션 종료 아님) · 보안 정보(패스워드·토큰) 기록 절대 금지 · 체크포인트는 임시 파일(재개 후 삭제 무방)
