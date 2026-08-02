#!/usr/bin/env bash
# main-write-guard.test.sh — main 직접 작업 차단 훅의 판별력 검증
#
# 검증 대상:
#   (1) main 에서의 직접 쓰기(commit/push/cherry-pick/rebase/reset)를 실제로 막는가
#   (2) **허용 경로를 막지 않는가** — 이게 차단만큼 중요하다.
#       develop 에서의 작업, main 으로의 머지(MERGE-IRON-2 소관), 읽기 명령은 통과해야 한다.
#   (3) 역변조 — 판정 로직을 끄면 (1)이 통과해 버리는가(= 케이스가 공허하지 않은가)
#
# 실제 git 저장소를 임시로 만들어 브랜치 상태를 진짜로 바꿔가며 훅에 먹인다
# (브랜치 판정이 `git rev-parse --abbrev-ref HEAD` 라 CWD 가 실제로 그 브랜치여야 한다).
#
# 사용: bash forge-core/hooks/main-write-guard.test.sh
#
# ⚠️ 이 파일은 **플러그인 레인 사본**이다. forge SSoT 에도 형제 사본이 있다
#    (`~/forge/.claude/hooks/{,tests/}main-write-guard.sh`). 둘은 배포 경로가 달라
#    의도적으로 분리돼 있다 — `scripts/sync-from-forge.py` 는 hooks/ 를 동기화하지 않는다
#    (플러그인 훅의 SSoT 는 이 repo 다 — 그 스크립트 상단 주석 참조).
#    아래 §5 가 두 사본의 드리프트를 감시한다.

set -uo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 훅은 같은 디렉터리(플러그인 레이아웃) 또는 부모(forge SSoT 의 tests/ 레이아웃)에 있다.
if [ -f "$TEST_DIR/main-write-guard.sh" ]; then
  HOOK="$TEST_DIR/main-write-guard.sh"
else
  HOOK="$(cd "$TEST_DIR/.." && pwd)/main-write-guard.sh"
fi
PASS=0
FAIL=0

[ -f "$HOOK" ] || { echo "훅 없음: $HOOK"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── 실제 git 저장소 구성 (main + develop) ────────────────────────────────────
REPO="$TMP/repo"
mkdir -p "$REPO"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.email t@t.t
git -C "$REPO" config user.name t
echo x > "$REPO/f"
git -C "$REPO" add f
git -C "$REPO" commit -qm init
git -C "$REPO" branch develop

run_hook() {  # $1=브랜치  $2=명령 → exit code 반환
  local br="$1" cmd="$2"
  git -C "$REPO" checkout -q "$br" 2>/dev/null
  ( cd "$REPO" && python3 -c "
import json,sys
print(json.dumps({'tool_name':'Bash','tool_input':{'command':sys.argv[1]}}))
" "$cmd" | bash "$3" >/dev/null 2>&1 )
  echo $?
}

expect_block() {  # $1=이름 $2=브랜치 $3=명령 [$4=훅]
  local rc; rc=$(run_hook "$2" "$3" "${4:-$HOOK}")
  if [ "$rc" -eq 2 ]; then PASS=$((PASS+1)); echo "  PASS  BLOCK: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL  $1 — 차단됐어야 하는데 exit=$rc"; fi
}

expect_allow() {  # $1=이름 $2=브랜치 $3=명령
  local rc; rc=$(run_hook "$2" "$3" "$HOOK")
  if [ "$rc" -eq 0 ]; then PASS=$((PASS+1)); echo "  PASS  ALLOW: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL  $1 — 통과했어야 하는데 exit=$rc"; fi
}

echo "== 1. main 직접 쓰기 = 차단 =="
expect_block "main 에서 commit"        main "git commit -m x"
expect_block "main 에서 cherry-pick"   main "git cherry-pick abc123"
expect_block "main 에서 rebase"        main "git rebase develop"
expect_block "main 에서 revert"        main "git revert HEAD"
expect_block "main 에서 reset --hard"  main "git reset --hard origin/main"
expect_block "main 으로 push"          develop "git push origin main"
expect_block "main 으로 refspec push"  develop "git push origin HEAD:main"
expect_block "master 로 push"          develop "git push origin master"

echo
echo "== 2. 허용 경로는 막지 않는다(오탐 방지 — 차단만큼 중요) =="
expect_allow "develop 에서 commit"     develop "git commit -m x"
expect_allow "develop 로 push"         develop "git push origin develop"
expect_allow "main 에서 읽기(log)"     main    "git log --oneline -5"
expect_allow "main 에서 읽기(status)"  main    "git status --short"
expect_allow "main 에서 fetch"         main    "git fetch origin"
expect_allow "main 으로 머지(IRON-2)"  main    "git merge develop"
expect_allow "gh pr merge (IRON-2)"    main    "gh pr merge 1 --squash"
expect_allow "git 아닌 명령"           main    "ls -la"
expect_allow "develop 체크아웃"        main    "git checkout develop"

echo
echo "== 3. kill-switch 동작 =="
# 훅이 조기 exit 하면 stdin 을 안 읽어 파이프가 깨진다(BrokenPipe) — 입력을 파일로 준다.
git -C "$REPO" checkout -q main 2>/dev/null
python3 -c "
import json;print(json.dumps({'tool_name':'Bash','tool_input':{'command':'git commit -m x'}}))
" > "$TMP/ks.json"
( cd "$REPO" && FORGE_MAIN_GUARD=off bash "$HOOK" < "$TMP/ks.json" >/dev/null 2>&1 )
rc=$?
if [ "$rc" -eq 0 ]; then PASS=$((PASS+1)); echo "  PASS  FORGE_MAIN_GUARD=off 시 통과"
else FAIL=$((FAIL+1)); echo "  FAIL  kill-switch 미작동 exit=$rc"; fi

echo
echo "== 4. 역변조 — 판정을 끄면 차단이 사라져야 한다(판별력 실증) =="
MUT="$TMP/mut.sh"
# `$CUR_BRANCH` 가 sed 패턴에서 확장되지 않도록 고정 문자열 치환을 쓴다(python).
python3 - "$HOOK" "$MUT" <<'PY'
import sys
src = open(sys.argv[1], encoding="utf-8").read()
old = 'VIOLATION="현재 브랜치가 $CUR_BRANCH 인 상태에서 쓰기 명령"'
new = 'VIOLATION=""'
if old not in src:
    sys.exit(3)
open(sys.argv[2], "w", encoding="utf-8").write(src.replace(old, new))
PY
[ $? -eq 0 ] || { echo "  FAIL  역변조 지점 없음"; FAIL=$((FAIL+1)); MUT=""; }
[ -n "$MUT" ] && chmod +x "$MUT"
if [ -z "$MUT" ] || diff -q "$HOOK" "$MUT" >/dev/null 2>&1; then
  FAIL=$((FAIL+1)); echo "  FAIL  역변조 지점을 못 찾음 — 테스트가 소스와 어긋남"
else
  rc=$(run_hook main "git commit -m x" "$MUT")
  if [ "$rc" -eq 0 ]; then
    PASS=$((PASS+1)); echo "  PASS  역변조 시 commit 통과 — 판정이 실제로 일한다"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  판정을 꺼도 여전히 차단 exit=$rc — 케이스가 공허하다"
  fi
fi

echo
echo "== 5. 배포 배선 — 매니페스트 등록 + forge 사본 드리프트 =="
MANIFEST="$(cd "$TEST_DIR/.." && pwd)/.claude-plugin/plugin.json"
if [ ! -f "$MANIFEST" ]; then
  echo "  SKIP  플러그인 매니페스트 없음(forge SSoT 레이아웃에서 실행 중) — 배선 검사 생략"
else
  # (5-1) 매니페스트가 이 훅을 실제로 등록했는가.
  #       파일만 있고 등록이 없으면 아무 세션에서도 실행되지 않는다 — 그게 이 PR 의 원인 사고다.
  if grep -q 'main-write-guard.sh' "$MANIFEST"; then
    PASS=$((PASS+1)); echo "  PASS  plugin.json 이 main-write-guard.sh 를 등록함"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  plugin.json 미등록 — 파일만 있고 발효되지 않는다"
  fi

  # (5-2) PreToolUse/Bash 매처인가. SessionStart 에 잘못 달리면 Bash 를 못 본다.
  if python3 - "$MANIFEST" <<'PY' 2>/dev/null
import json, sys
m = json.load(open(sys.argv[1], encoding="utf-8"))
for g in (m.get("hooks") or {}).get("PreToolUse", []):
    if "Bash" in (g.get("matcher") or ""):
        for h in g.get("hooks", []):
            if "main-write-guard.sh" in h.get("command", ""):
                sys.exit(0)
sys.exit(1)
PY
  then
    PASS=$((PASS+1)); echo "  PASS  PreToolUse + Bash 매처로 등록됨"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  PreToolUse/Bash 매처가 아니다 — Bash 명령을 못 본다"
  fi

  # (5-3) forge SSoT 사본과 내용이 갈라졌는가.
  #       두 레인은 배포 경로가 달라 사본이 둘이다 — 손으로 관리하면 조용히 갈라진다.
  #       forge 가 이 머신에 없으면(플러그인 사용자) 검사할 대상이 없으니 SKIP.
  SIBLING="${FORGE_ROOT:-$HOME/forge}/.claude/hooks/main-write-guard.sh"
  if [ ! -f "$SIBLING" ]; then
    echo "  SKIP  forge SSoT 사본 없음($SIBLING) — 드리프트 검사 생략"
  elif diff -q "$HOOK" "$SIBLING" >/dev/null 2>&1; then
    PASS=$((PASS+1)); echo "  PASS  forge SSoT 사본과 동일(드리프트 없음)"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  forge SSoT 사본과 내용이 다르다 — 드리프트"
    diff "$SIBLING" "$HOOK" | head -20 | sed 's/^/        /'
  fi
fi

echo
echo "================================"
echo "PASS=$PASS  FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
