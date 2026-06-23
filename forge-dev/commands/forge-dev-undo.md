---
description: 마지막 개발 액션 롤백 — 파일 수정/커밋/스테이징 되돌리기 (AI-instruction 전용)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
argument-hint: "[--commit] [--files] [--staged] [--dry-run]"
group: implement
---

# /forge-dev-undo

마지막 개발 액션을 안전하게 롤백한다.

## 대상 & 모드

| 플래그 | 대상 | git 명령 |
|--------|------|----------|
| `--commit` | 마지막 커밋 취소 (staged 유지) | `git reset --soft HEAD~1` |
| `--files` | 미추적 변경 파일 되돌리기 | `git checkout -- <files>` |
| `--staged` | 스테이징 취소 | `git reset HEAD <files>` |
| `--dry-run` | 어떤 변경이 취소될지 확인 (실행 X) | diff only |

## 실행 흐름

### Step 1. 현재 상태 확인

```bash
git status
git log --oneline -5
git diff --stat HEAD
```

출력 → 사용자에게 "되돌릴 범위" 1줄 명시 후 진행.

### Step 2. 대상 결정 (인자 없을 때)

인자 없이 `/forge-dev-undo` 호출 시:

```
최근 변경:
  [staged]  src/auth/token.ts
  [staged]  src/auth/session.ts
  [commit]  feat: 세션 토큰 갱신 로직 구현 (HEAD)

롤백 대상을 선택하세요:
  A. 마지막 커밋만 취소 (--commit)
  B. 스테이징 취소 (--staged)
  C. 파일 변경 전부 취소 (--files + --staged)
```

사용자 선택 후 진행. "ㅇㅇ" = 가장 보수적인 옵션 (A 또는 B).

### Step 3. 롤백 실행

**커밋 취소** (`--commit`):
```bash
git reset --soft HEAD~1
# staged 상태로 되돌아감 — 코드 손실 없음
```

**파일 되돌리기** (`--files`):
```bash
git checkout -- <파일 목록>
# 주의: 저장되지 않은 변경 영구 삭제
```

**스테이징 취소** (`--staged`):
```bash
git reset HEAD <파일 목록>
# 변경은 유지, staged 해제만
```

### Step 4. 상태 확인

롤백 후 즉시:
```bash
git status
git log --oneline -3
```

결과 출력 → 의도한 상태와 일치하는지 확인.

## 안전 장치

- **`--dry-run` 우선 권장** — 실제 실행 전 영향 범위 확인
- **`--hard` 사용 금지** — `git reset --hard` = 코드 손실 위험. `--soft` 또는 `--mixed`만 허용
- **force push 금지** — push된 커밋 취소 시 → [STOP] Human 확인 (remote history 변경은 팀 영향)
- **merge commit 금지** — merge 커밋이 HEAD이면 자동 [STOP] (복잡도 높음, 수동 처리)

## force-push가 필요한 경우

push된 커밋 취소 요청 시:
```
[STOP] — push된 커밋 취소는 remote history 변경.
영향: 같은 브랜치를 사용하는 다른 세션이 있으면 conflict 발생.
대신 revert commit 생성 권장:
  git revert HEAD --no-edit
  git push
```

## 참조

- 선적 전 체크리스트 → `/forge-pr` (PR 생성 전 확인)
- 버그 수정 → `/forge-fix` (hotfix 흐름)
- 상태 확인 → `/investigate` (원인 분석 선행)
