#!/usr/bin/env bash
# main-write-guard.sh — PreToolUse: Bash
#
# 정책(2026-08-02 사용자 명시, 전 프로젝트 공통):
#   "main 에 직접 작업하는 경우는 없게 해."
#   "main 은 develop, staging, 혹은 hotfix 브랜치로부터 머지만 되어야 한다."
#
# 즉 main 에 도달하는 유일한 경로는 **허용 소스로부터의 머지**뿐이다.
# 머지 순서 강제(feature/* → main 차단)는 이미 codex-gate-enforce.sh §MERGE-IRON-2 가 한다.
# 이 훅은 그 사각지대인 **머지 외 쓰기 경로**를 막는다:
#   main 에서 직접 commit / main 으로 push / main 에 cherry-pick·rebase·reset·revert
#
# root-cause: 실측(2026-08-02) 결과 MERGE-IRON-2 는 `git merge`·`gh pr merge` 만 본다.
#   `git commit`(main 체크아웃 상태) · `git push origin main` · `git cherry-pick` 등은
#   전부 무방비로 통과했다. 규약은 "머지만 허용"인데 집행은 머지 경로에만 있었다.
#
# 판정 기준
#   - target 이 main/master 인 쓰기 명령 → BLOCK(exit 2)
#   - 단 **머지 계열은 이 훅이 판정하지 않는다** — MERGE-IRON-2 소관(중복 차단 방지)
#   - 읽기 명령(log/show/status/diff/fetch)은 통과
#   - 브랜치 판정 불가·git 레포 아님·kill-switch → fail-open(exit 0)
#
# kill-switch: FORGE_MAIN_GUARD=off  (사람이 세션 시작 전 export — 에이전트는 도달 불가)
#
# 근거: main 정본 레포(forge-plugins 등)에서도 "직접 커밋"이 실제로 발생해 왔다.
#       규약을 문서가 아니라 집행으로 옮긴다.
# 폐기조건: GitHub branch protection(서버측)이 전 레포에 걸려 로컬 훅이 잉여가 되면 폐기.

set -uo pipefail

# stdin 배수 후 종료 — 미배수 exit 은 생산자에게 EPIPE 를 던진다(A4, 2026-08-07 재현).
#   ⚠️ 이 한 줄은 forge 사본(~/forge/.claude/hooks/main-write-guard.sh)에 2026-08-07 들어갔는데
#   이 플러그인 사본에는 오지 않았다. 훅의 SSoT 가 서로 다른 레포라(플러그인 훅 = 이 repo,
#   forge-sync 는 훅을 밀지 않는다) 같은 이름의 두 구현이 조용히 갈라진 것이다.
#   같은 세션에서 두 등록이 **모두** 발화하므로, 갈라진 채로 두면 킬스위치를 켰을 때
#   한쪽만 안전하게 빠져나가고 다른 쪽은 EPIPE 를 던지는 비대칭이 생긴다.
[ "${FORGE_MAIN_GUARD:-on}" = "off" ] && { cat >/dev/null 2>&1 || true; exit 0; }

INPUT=$(cat 2>/dev/null)
[ -z "$INPUT" ] && exit 0

command -v python3 >/dev/null 2>&1 || exit 0

TOOL=$(printf '%s' "$INPUT" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('tool_name',''))
except Exception: print('')
" 2>/dev/null)
[ "$TOOL" = "Bash" ] || exit 0

CMD=$(printf '%s' "$INPUT" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('tool_input',{}).get('command',''))
except Exception: print('')
" 2>/dev/null)
[ -z "$CMD" ] && exit 0

# git 명령이 아니면 관심 없음
printf '%s' "$CMD" | grep -qE '(^|[;&|]|\s)git\s' || exit 0

# ── 머지 계열은 MERGE-IRON-2 소관 — 여기서 판정하지 않는다(중복 차단 방지) ────
printf '%s' "$CMD" | grep -qE '(^|[;&|]|\s)(git\s+merge|gh\s+pr\s+merge)' && exit 0

# ── 현재 브랜치 판정 (실패 시 fail-open) ─────────────────────────────────────
CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

is_main() { case "$1" in main|master) return 0;; *) return 1;; esac; }

VIOLATION=""

# (1) main 체크아웃 상태에서의 쓰기 명령
if is_main "$CUR_BRANCH"; then
  if printf '%s' "$CMD" | grep -qE '(^|[;&|]|\s)git\s+(commit|cherry-pick|rebase|revert|am|apply)\b'; then
    VIOLATION="현재 브랜치가 $CUR_BRANCH 인 상태에서 쓰기 명령"
  elif printf '%s' "$CMD" | grep -qE '(^|[;&|]|\s)git\s+reset\s+(--hard|--mixed|--soft)'; then
    VIOLATION="현재 브랜치가 $CUR_BRANCH 인 상태에서 reset"
  fi
fi

# (2) main 을 목적지로 하는 push (브랜치 무관)
#     `git push origin main` / `git push origin HEAD:main` / `git push origin dev:main`
if [ -z "$VIOLATION" ]; then
  if printf '%s' "$CMD" | grep -qE '(^|[;&|]|\s)git\s+push\b'; then
    if printf '%s' "$CMD" | grep -qE 'git\s+push\b[^;&|]*\s(main|master)(\s|$)' \
       || printf '%s' "$CMD" | grep -qE 'git\s+push\b[^;&|]*:(main|master)(\s|$)'; then
      VIOLATION="main/master 로 직접 push"
    elif is_main "$CUR_BRANCH" \
         && printf '%s' "$CMD" | grep -qE 'git\s+push($|\s+(-[^\s]+\s+)*(origin|upstream)?\s*$)'; then
      # 인자 없는 `git push` 를 main 체크아웃 상태에서 실행 = 현재 브랜치(main) push
      VIOLATION="main 체크아웃 상태에서 인자 없는 push"
    fi
  fi
fi

[ -z "$VIOLATION" ] && exit 0

cat >&2 <<EOF
⛔ [main-write-guard] main 직접 작업 차단 — $VIOLATION

  정책: main 은 **develop / staging / hotfix/* 로부터 머지만** 되어야 한다.
        직접 커밋·push·cherry-pick·rebase·reset 은 허용되지 않는다.

  올바른 경로:
    1. develop 에서 작업 → PR → develop 머지
    2. 릴리스 시점에 develop(또는 staging) → main 머지
    3. 긴급 수정은 hotfix/* → main 머지

  현재 브랜치: ${CUR_BRANCH:-(판정 불가)}
  명령: $(printf '%s' "$CMD" | head -c 120)

  우회(비권장, 사람만 — 세션 시작 전 export 필요):
    export FORGE_MAIN_GUARD=off
EOF
exit 2
