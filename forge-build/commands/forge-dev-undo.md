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
| `--files` | **내가 넣은** 파일 변경만 되돌리기 | ⛔ `git checkout --` **금지** — Step 3 의 3단 절차(dry-run → 백업 커밋 → hunk 역적용) |
| `--staged` | 스테이징 취소 | `git reset HEAD <files>` |
| `--dry-run` | 어떤 변경이 취소될지 확인 (실행 X) | diff only |

> ⛔ **`--files` 는 "파일을 통째로 되돌리는" 모드가 아니다.** 이 레포는 공유 체크아웃에 병행 세션이 붙는다 —
> 파일 전체를 원복하면 **다른 세션이 편집 중인 미커밋 변경이 함께 사라지고, 커밋 전이라 git 에 복구본도 없다.**
> 정본 → `rules/model-routing.md §역변조 검증 2종 (G8·G9)` — *"`git checkout --` 로 파일 전체 원복 무조건 금지, 내가 넣은 것만 되돌린다"*.

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
  C. 내가 넣은 파일 변경 취소 (--files + --staged) — Step 3 의 3단 절차로만
```

사용자 선택 후 진행. "ㅇㅇ" = 가장 보수적인 옵션 (A 또는 B).

## Advisor 자문 (advisory-only · non-blocking · 리졸버 기본 = Fable 5.1)

undo(파일/커밋/스테이징 되돌림) 실행 직전에 `advisor-strategist` 조언을 구한다(모델 = `advisor-model-resolve.sh` 출력, 기본 Fable 5.1). **advisory-only — 게이트 차단 아님. 미가용·실패 시 기본 흐름 진행(fail-open).**

> ⚠️ **아래 예시는 리졸버가 `claude-*` 를 냈을 때의 형태다.** 스폰 모델은 항상 `advisor-model-resolve.sh` 가 정한다 — `claude-fable-5-1`→`model:"fable"`, `claude-opus-5`→`model:"opus"`, **`gpt-6-astra`(대체 기본)·`gpt-5.6-sol` 같은 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)**. 분기표 → `agents/advisor-strategist.md §비용 특성`. 리졸버를 건너뛰면 kill-switch·일일캡·미가용 폴백이 전부 우회된다.
```
Agent(subagent_type="advisor-strategist", prompt="되돌릴 대상(파일/커밋/스테이징)·현재 워킹트리 상태(공유트리·타세션 dirty 여부) 맥락 3-5줄. 질문: 이 undo가 유실·손상시킬 수 있는 것(타세션 작업·미커밋 변경)과 안전 확인 2-3개는?")
```

- 트리거: 파일/커밋/스테이징 되돌림 실행 직전(공유트리·타세션 영향 가능). `--dry-run`은 호출 대상 아님.
- 반환 조언은 참고만 — 최종 판단·실행은 커맨드(및 기존 Human 승인 게이트)가 수행.
- **advisor 모델 = `advisor-model-resolve.sh` 출력**(기본 Fable 5.1 · 대체 `gpt-6-astra` · `FORGE_ADVISOR_MODEL=opus` 로 Opus 고정). 출력이 `gpt-*` 면 Agent 가 아니라 `mcp__codex__codex`(sandbox=read-only)로 스폰한다.
  ⚠️ 2026-08-12 이전 문구 **"Fable 5 미배선 — Human 수동 에스컬레이션 전용 · `advisor-model-resolve` 호출 금지"는 폐기**했다 — 이 커맨드에 advisor 자문 레그가 실재하는데 리졸버 호출을 금지해 라우팅이 서로 어긋났다(cr-final HIGH). 정본 → `rules/model-routing.md §Advisor 전략 상시 가동`
- 모델 라우팅: 본 커맨드 작업=**Opus**(기본값) · 탐색=Haiku · advisor=`advisor-model-resolve.sh` 출력(기본 Fable 5.1 · 대체 `gpt-6-astra`).
  ⚠️ **구 표기 "본 커맨드 작업=Sonnet" 은 2026-09-17 폐기** — `model-routing.md §워커 tier` 기본값은 Opus 다. 이 커맨드는 **비가역 되돌리기**를 다루므로 오히려 내릴 자리가 아니다(남의 미커밋 유실 판정이 걸린다).

### Step 3. 롤백 실행

**커밋 취소** (`--commit`):
```bash
git reset --soft HEAD~1
# staged 상태로 되돌아감 — 코드 손실 없음
```

**파일 되돌리기** (`--files`) — ⛔ `git checkout -- <파일>` 금지. 아래 3단을 **순서대로** 밟는다:

**3-①. dry-run 선행(생략 불가)** — 되돌려질 줄을 눈으로 본다. 여기서 **내가 넣지 않은 줄**이 보이면 = 다른 세션의 미커밋 변경이다:
```bash
git status --short -- <파일 목록>
git diff --stat -- <파일 목록>
git diff -U0 -- <파일 목록>     # 되돌려질 +/- 줄 전량. 내가 넣은 것만 있는지 확인
```
→ 내 것이 아닌 줄이 하나라도 있으면 **3-③(hunk 역적용)** 으로 간다. 전부 내 것이라도 3-② 백업은 한다.

**3-②. 백업 커밋(복구 지점 확보)** — 되돌리기 **전에** 현재 워킹트리를 커밋으로 고정한다. 유실이 원천 차단된다:
```bash
git add -- <파일 목록>                      # ⛔ git add -A 금지(남의 미커밋까지 빨아들인다)
git commit -m "WIP-BACKUP: undo 전 백업 <고유태그>"
git rev-parse HEAD                          # ← 이 SHA 가 복구 지점. 보고에 남긴다
```
⛔ **`git stash` 는 대안이 아니다** — 스택이 워크트리 간 공유라 다른 세션 것을 덮는다.
⚠️ 이 WIP 커밋은 **push 하지 않는다.** 되돌리기가 끝나면 `git reset --mixed HEAD~1` 로 커밋만 푼다(변경은 워킹트리에 남는다).

**3-③. 내가 넣은 hunk 만 역적용** — 파일 전체를 건드리지 않는다:
```bash
git diff -- <파일> > .undo-all.patch
# .undo-all.patch 를 열어 "내가 넣은 hunk" 만 남기고 나머지 @@ 블록은 지운다 → .undo-mine.patch
git apply -R --check .undo-mine.patch       # 먼저 --check (실패하면 실행하지 않는다)
git apply -R .undo-mine.patch
```
내 hunk 가 파일 전체일 때만(= 3-① 에서 남의 줄이 0건) 파일 단위 원복을 쓸 수 있고, 그때도 **백업 커밋 이후**여야 한다:
```bash
git restore --source=HEAD~1 -- <파일 목록>   # HEAD~1 = 3-② 백업 직전 커밋
```
**복구 방법**(되돌린 게 남의 것이었다면): `git restore --source=<3-② 의 SHA> -- <파일 목록>`

> **검증 증거** (샌드박스 실측, 2026-09-17): `git checkout -- f.txt` → 다른 세션 변경 생존 0건 · dangling blob **0건(복구 불가)**.
> 3-② 백업 커밋 경로 → 같은 상황에서 `git restore --source=<WIP SHA>` 로 **복구 성공(B-OTHER=1, G-MINE=1)**.
> 3-③ hunk 역적용 → 내 변경만 제거되고 **다른 세션 변경은 워킹트리에 그대로 생존(1건)**.
> 재현: `bash shared/scripts/tests/undo-safety.test.sh` → `undo-safety: ALL PASS` (10/10)

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

- **`--dry-run` 은 권장이 아니라 필수 선행 단계** — `--files` 는 Step 3-① 없이 실행하지 않는다(되돌려질 줄에 남의 변경이 섞였는지 확인하는 유일한 수단)
- ⛔ **`git checkout -- <파일>` 로 파일 전체 원복 금지** — 공유 체크아웃의 다른 세션 미커밋 변경을 **복구 불가로** 날린다(실측: dangling blob 0건). 내가 넣은 hunk 만 되돌린다 → Step 3-③ · 정본 `rules/model-routing.md §역변조 검증 2종 (G8·G9)`
- ⛔ **`git stash` 금지** — stash 스택은 워크트리·세션 간 **공유**라 남의 것을 덮거나 남이 내 것을 pop 한다. 물러설 곳이 필요하면 **WIP 백업 커밋**(Step 3-②)
- ⛔ **`git add -A` 금지** — 되돌릴 파일만 명시한다(남의 미커밋까지 백업 커밋에 빨려 들어간다)
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
