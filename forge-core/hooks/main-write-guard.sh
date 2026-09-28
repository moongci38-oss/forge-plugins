#!/usr/bin/env bash
# main-write-guard.sh — PreToolUse: Bash
#
# 정책(2026-08-02 사용자 명시, 전 프로젝트 공통):
#   "main 에 직접 작업하는 경우는 없게 해."
#   "main 은 develop, staging, 혹은 hotfix 브랜치로부터 머지만 되어야 한다."
#
# 즉 main 에 도달하는 유일한 경로는 **허용 소스로부터의 머지**뿐이다.
# 머지 순서 강제(feature/* → main 차단 · MERGE-IRON-2)도 이 훅이 한다(§0, #1390 — 원래 담당인 codex-gate-enforce.sh 가 미등록이었다).
# 이 훅은 그 사각지대인 **머지 외 쓰기 경로**를 막는다:
#   main 에서 직접 commit / main 으로 push / main 에 cherry-pick·rebase·reset·revert
#
# root-cause: 실측(2026-08-02) 결과 MERGE-IRON-2 는 `git merge`·`gh pr merge` 만 본다.
#   `git commit`(main 체크아웃 상태) · `git push origin main` · `git cherry-pick` 등은
#   전부 무방비로 통과했다. 규약은 "머지만 허용"인데 집행은 머지 경로에만 있었다.
#
# 판정 기준
#   - target 이 main/master 인 쓰기 명령 → BLOCK(exit 2)
#   - main 으로의 머지는 출처가 develop·staging·hotfix/* 일 때만 허용(판정 불가는 fail-open)
#   - 읽기 명령(log/show/status/diff/fetch)은 통과
#   - 브랜치 판정 불가·git 레포 아님·kill-switch → fail-open(exit 0)
#
# kill-switch: FORGE_MAIN_GUARD=off  (사람이 세션 시작 전 export — 에이전트는 도달 불가)
#
# 근거: main 정본 레포(forge-plugins 등)에서도 "직접 커밋"이 실제로 발생해 왔다.
#       규약을 문서가 아니라 집행으로 옮긴다.
# 폐기조건: GitHub branch protection(서버측)이 전 레포에 걸려 로컬 훅이 잉여가 되면 폐기.

set -uo pipefail

. "$(dirname "${BASH_SOURCE[0]}")/lib/gap-telemetry.sh" 2>/dev/null || true

# stdin 배수 후 종료 — 미배수 exit 은 생산자에게 EPIPE 를 던진다(A4, 2026-08-07 재현)
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

# git·gh 명령이 아니면 관심 없음
printf '%s' "$CMD" | grep -qE '(^|[;&|]|\s)(git|gh)\s' || exit 0

# ── 현재 브랜치 판정 (실패 시 fail-open) ─────────────────────────────────────
CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

is_main() { case "$1" in main|master) return 0;; *) return 1;; esac; }

VIOLATION=""

# ── (0) main 으로의 머지 — develop·staging·hotfix/* 에서만 (MERGE-IRON-2, #1390) ──
#   종전엔 "머지 계열은 codex-gate-enforce.sh MERGE-IRON-2 소관" 이라 여기서 건너뛰었는데,
#   그 훅은 어디에도 등록돼 있지 않아 feature→main 머지가 **무방비**였다(2026-09-27 실측).
#   판정 불가(대상·출처를 못 읽음 · gh 실패)는 fail-open.
#   명령은 shlex 로 토막 내어(; && || |) 순서대로 본다 — git 전역 옵션(-C·-c)·옵션 값(-m 등)·복수 출처·
#   같은 줄의 브랜치 이동(switch/checkout)·gh PR 번호/URL/--repo 를 반영한다(PR #1393 Codex r1).
#   통과해도 (1)(2) 검사로 계속 내려간다(같은 줄의 main push 를 놓치지 않게).
if printf '%s' "$CMD" | grep -qE '(git|gh)(\s|$)' && printf '%s' "$CMD" | grep -qE 'merge|pull'; then
  VIOLATION=$(printf '%s' "$CMD" | CUR="$CUR_BRANCH" timeout 10 python3 -c '
import os, re, shlex, subprocess, json, sys
ALLOWED = re.compile(r"^(develop|staging|main|master|hotfix/.+)$")
def is_main(b): return b in ("main", "master")
try:
    # posix=False: 따옴표를 남겨 따옴표 안 ; && 를 구분자로 오인하지 않는다 · commenters="": 주석이 개행을 삼키지 않게(PR #1393 Codex r2)
    lx = shlex.shlex(sys.stdin.read(), posix=False, punctuation_chars=";&|\n")
    lx.whitespace = " \t\r"                         # 개행도 명령 구분자(PR #1393 Fable r1)
    lx.commenters = ""
    lx.whitespace_split = True
    toks = list(lx)
except Exception:
    sys.exit(0)                                   # 파싱 불가 → fail-open
def uq(t):
    return t[1:-1] if len(t) >= 2 and t[0] == t[-1] and t[0] in (chr(34), chr(39)) else t
segs, cur = [], []
for t in toks:
    if t and set(t) <= set(";&|\n"):
        segs.append(cur); cur = []
    else:
        cur.append(uq(t))
segs.append(cur)
branch = {None: os.environ.get("CUR", "")}      # cwd 별 현재 브랜치 추적
def cur_branch(cdir):
    if cdir not in branch:
        try:
            branch[cdir] = subprocess.run(["git", "-C", cdir, "rev-parse", "--abbrev-ref", "HEAD"],
                                          capture_output=True, text=True, timeout=3).stdout.strip()
        except Exception:
            branch[cdir] = ""
    return branch[cdir]
GIT_GLOBAL_VAL = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}
# -S·--gpg-sign 은 값이 붙어서만 온다(-S<키>·--gpg-sign=<키>) — 값 옵션으로 보면 출처를 삼킨다(PR #1393 Codex r2)
MERGE_VAL = {"-m", "-F", "--file", "-s", "--strategy", "-X", "--strategy-option", "--into-name", "--cleanup"}
PULL_VAL = MERGE_VAL | {"--depth", "--deepen", "--shallow-since", "--shallow-exclude", "-o", "--server-option",
                        "--upload-pack", "--negotiation-tip", "-j", "--jobs"}
def is_branch(cdir, name):
    base = ["git"] + (["-C", cdir] if cdir else [])
    for ref in ("refs/heads/" + name, "refs/remotes/origin/" + name):
        try:
            if subprocess.run(base + ["show-ref", "--verify", "--quiet", ref], timeout=3).returncode == 0:
                return True
        except Exception:
            pass
    return False
def src_norm(s):
    for p in ("refs/heads/", "refs/remotes/origin/", "origin/", "upstream/"):
        if s.startswith(p): s = s[len(p):]
    return s
for seg in segs:
    # 래퍼 접두(env·command·exec·time·timeout N·nice·nohup·sudo·VAR=x)를 넘기고 처음 나오는 git/gh 부터 해석(PR #1393 r2)
    first = next((j for j, t in enumerate(seg) if t in ("git", "gh")), None)
    if first is None: continue
    seg = seg[first:]
    if seg[0] == "git":
        i, cdir = 1, None
        while i < len(seg) and seg[i].startswith("-"):
            o = seg[i]
            if o in GIT_GLOBAL_VAL:
                if o == "-C" and i + 1 < len(seg): cdir = seg[i + 1]
                i += 2
            else:
                i += 1
        if i >= len(seg): continue
        sub, args = seg[i], seg[i + 1:]
        if sub in ("switch", "checkout"):
            pos = [a for a in args if not a.startswith("-")]
            if "--" in args: continue              # 파일 복원
            nb = [args[k + 1] for k, a in enumerate(args[:-1]) if a in ("-b", "-B", "-c", "-C")]
            if nb:
                branch[cdir] = src_norm(nb[0])
            elif pos and is_branch(cdir, src_norm(pos[0])):  # 파일 복원(checkout README.md)은 브랜치 이동 아님(PR #1393 Codex r2)
                branch[cdir] = src_norm(pos[0])
            continue
        if sub not in ("merge", "pull"): continue    # pull = fetch + merge — 같은 규칙(PR #1393 Fable r1)
        if any(a in ("--abort", "--continue", "--quit") for a in args): continue
        srcs, k = [], 0
        while k < len(args):
            a = args[k]
            if a in (PULL_VAL if sub == "pull" else MERGE_VAL): k += 2; continue
            if a.startswith("-"): k += 1; continue
            srcs.append(src_norm(a)); k += 1
        if sub == "pull":
            srcs = [s.split(":")[0] for s in srcs[1:]]   # 첫 위치 인자는 원격 이름
            srcs = [src_norm(s) for s in srcs]
        if is_main(cur_branch(cdir)):
            bad = [s for s in srcs if not ALLOWED.match(s)]
            if bad:
                print("develop 경유 없는 main 머지(출처: %s)" % ",".join(bad)); sys.exit(0)
    elif seg[0] == "gh" and seg[1:3] == ["pr", "merge"]:
        args, sel, repo, k = seg[3:], None, None, 0
        while k < len(args):
            a = args[k]
            if a in ("-R", "--repo"):
                repo = args[k + 1] if k + 1 < len(args) else None; k += 2; continue
            if a.startswith("--repo="): repo = a.split("=", 1)[1]; k += 1; continue
            if a in ("-b", "--body", "-F", "--body-file", "-t", "--subject", "-A", "--author-email", "--match-head-commit"):
                k += 2; continue
            if a.startswith("-"): k += 1; continue
            if sel is None: sel = a
            k += 1
        cmd = ["gh", "pr", "view"] + ([sel] if sel else []) + (["--repo", repo] if repo else []) + ["--json", "baseRefName,headRefName"]
        try:
            d = json.loads(subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout or "{}")
        except Exception:
            continue                               # 판정 불가 → fail-open
        head = d.get("headRefName", "")
        if is_main(d.get("baseRefName", "")) and head and not ALLOWED.match(head):
            print("develop 경유 없는 main 머지(출처: %s)" % head); sys.exit(0)
' 2>/dev/null)
fi

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
type gap_log >/dev/null 2>&1 && gap_log BLOCK "main-write-guard" "main 브랜치 직접 쓰기 시도" || true
exit 2
