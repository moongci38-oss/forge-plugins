#!/usr/bin/env bash
_HDL_D="${BASH_SOURCE[0]%/*}"; [ "$_HDL_D" = "${BASH_SOURCE[0]}" ] && _HDL_D=.; [ -f "$_HDL_D/lib/hook-deadline.sh" ] && . "$_HDL_D/lib/hook-deadline.sh" && hook_entry main-write-guard 60 "$@"   # #2483 판정 상한(fail-closed) · #3279 공통 입구 — lib/hook-deadline.sh
# main-write-guard.sh — PreToolUse: Bash
#
# 정책(사용자 결정 2026-08-02 · 전 프로젝트 공통): main 에 직접 작업하지 않는다 —
#   main 은 develop·staging·hotfix/* 로부터 **머지만** 된다.
#
# 막는 것:
#   §0 허용 출처가 아닌 main 머지(feature/* → main · MERGE-IRON-2 · #1390) — git merge·pull · gh pr merge
#   (1) main 체크아웃 상태의 쓰기 — commit·cherry-pick·rebase·revert·am·apply·reset
#   (2) main 으로 가는 push — 목적지가 main/master(브랜치 무관) · main 체크아웃 상태의 인자 없는 push
#
# 판정 기준
#   - target 이 main/master 인 쓰기 명령 → BLOCK(exit 2)
#   - main 으로의 머지는 출처가 develop·staging·hotfix/* 일 때만 허용(판정 불가는 fail-open)
#   - 읽기 명령(log/show/status/diff/fetch)은 통과
#   - 브랜치 판정 불가·git 레포 아님·kill-switch → fail-open(exit 0)
#
# kill-switch: FORGE_MAIN_GUARD=off  (사람이 세션 시작 전 export — 에이전트는 도달 불가)
#
# 왜: 규약을 문서가 아니라 집행으로 — main 정본 레포에서도 직접 커밋이 실제로 일어난다.
# 폐기조건: GitHub branch protection(서버측)이 전 레포에 걸려 로컬 훅이 잉여가 되면 폐기.

set -uo pipefail

. "$(dirname "${BASH_SOURCE[0]}")/lib/gap-telemetry.sh" 2>/dev/null || true

# stdin 배수 후 종료 — 미배수 exit 은 생산자에게 EPIPE 를 던진다(A4)
[ "${FORGE_MAIN_GUARD:-on}" = "off" ] && { cat >/dev/null 2>&1 || true; exit 0; }
# 플러그인 사본(#3604 · #2825 방식) — forge-core 플러그인이 `bash "${CLAUDE_PLUGIN_ROOT}/hooks/main-write-guard.sh" --via-plugin` 으로 건다.
#   전역·프로젝트 설정에 등록이 있으면 그쪽이 돌므로 플러그인 사본은 침묵한다(같은 훅이 두 번 돌지 않게 · 설정 쪽 판정은 그대로).
# ⚠️ 무력화되는 입력: 설정 파일에 `hooks/main-write-guard.sh` 글자만 있고 실제 훅 등록이 아니면(권한 줄 등) 플러그인 사본도 침묵한다.
if [ "${1:-}" = --via-plugin ]; then
  for _mw_s in "$HOME/.claude/settings.json" "$HOME/.claude/settings.local.json" \
               "${CLAUDE_PROJECT_DIR:-/nonexistent}/.claude/settings.json" "${CLAUDE_PROJECT_DIR:-/nonexistent}/.claude/settings.local.json"; do
    [ -f "$_mw_s" ] && grep -q 'hooks/main-write-guard\.sh' "$_mw_s" 2>/dev/null && { cat >/dev/null 2>&1 || true; exit 0; }
  done
fi

declare -F hook_read_input >/dev/null && hook_read_input || HOOK_INPUT="$(cat)"; INPUT="$HOOK_INPUT"   # #3279-2 공통 입구(lib 없으면 직접 읽기)
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
printf '%s' "$CMD" | grep -qE '(git|gh)(\s|$)' || exit 0   # 앞 글자 무관 — /usr/bin/git · \git · $(git … 도 본다(#3275 B ②)

# ── 현재 브랜치 판정 (실패 시 fail-open) ─────────────────────────────────────
CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

is_main() { case "$1" in main|master) return 0;; *) return 1;; esac; }

VIOLATION=""

# ── (0) main 으로의 머지 — develop·staging·hotfix/* 에서만 (MERGE-IRON-2, #1390) ──
#   판정 불가(대상·출처를 못 읽음 · gh 실패 · lib 못 읽음)는 fail-open.
#   명령은 shlex 로 토막 내어(; && || | 개행) 순서대로 본다 — git 전역 옵션(-C·-c 등 · lib/git_global.py)·옵션 값(-m 등)·
#   복수 출처·같은 줄의 브랜치 이동(switch/checkout)·gh PR 번호/URL/--repo 를 반영한다.
#   통과해도 (1)(2) 검사로 계속 내려간다(같은 줄의 main push 를 놓치지 않게).
CMDJ="${CMD//$'\\\n'/}"   # 거름망만 줄이음을 붙여 본다(git mer\⏎ge · #3275 B ②) — 판정은 아래 정본 해석
if printf '%s' "$CMDJ" | grep -qE '(git|gh)(\s|$)' && printf '%s' "$CMDJ" | grep -qE 'merge|pull'; then
  VIOLATION=$(printf '%s' "$CMD" | CUR="$CUR_BRANCH" MWG_LIB="$(dirname "${BASH_SOURCE[0]}")/lib" timeout 10 python3 -c '
import os, re, shlex, subprocess, json, sys
if os.environ.get("MWG_LIB"): sys.path.insert(0, os.environ["MWG_LIB"])
try:
    from git_global import parse_git_globals     # git 전역 옵션(-C·-c·--git-dir …) 풀기 — lib/git_global.py (#2692)
    import cmd_targets                            # 명령 해석 정본 — lib/cmd_targets.py split_segments (#3275 B)
except Exception:
    sys.exit(0)                                   # lib 못 읽음 → 판정 불가 fail-open(§0 정책)
ALLOWED = re.compile(r"^(develop|staging|main|master|hotfix/.+)$")
def is_main(b): return b in ("main", "master")
RAW = sys.stdin.read()
def new_segs(raw):
    # 정본 해석: 조각마다 실행 낱말부터의 낱말(따옴표 벗김 · 줄이음 붙임 · 치환 속 조각 포함 · heredoc 본문·주석 제외)
    return [[g["head"]] + g["args"] for g in cmd_targets.split_segments(raw) if g["head"]]
def old_segs(raw):
    # 옛 쪼개기 — 정본 해석이 예외로 실패할 때만 쓴다. 정본이 통과시킨 줄(heredoc·주석 글자·\;·2>&1·낱말 중간 따옴표)을
    #   다시 막던 호환층은 #3326 결정(B1~B5 풀기)으로 뺐다.
    lx = shlex.shlex(raw, posix=False, punctuation_chars=";&|\n")
    lx.whitespace, lx.commenters, lx.whitespace_split = " \t\r", "", True
    uq = lambda t: t[1:-1] if len(t) >= 2 and t[0] == t[-1] and t[0] in (chr(34), chr(39)) else t
    segs, cur = [], []
    for t in lx:
        if t and set(t) <= set(";&|\n"):
            segs.append(cur); cur = []
        else:
            cur.append(uq(t))
    return segs + [cur]
_HD_Q = chr(34) + chr(39)
_HD = re.compile(r"(?<!<)<<(?!<)-?[ \t]*([" + _HD_Q + r"]?)([^\s;&|<>()" + _HD_Q + r"]*)\1")
def bash_differs(raw, groups):
    # 정본 해석(cmd_targets)이 bash 와 다르게 읽는 꼴(#3435 qa H1·H2) — 참이면 옛 해석으로도 본다(#3326 B1~B5·C1~C2 는 이 꼴이 아니다)
    if any(g["heredoc"] and "exec-string" in g["uncertain"] for g in groups):
        return True                                # H1 셸에 넣는 heredoc — 본문을 셸이 실행한다
    if re.search(r"(?m)(^|[\s;&|()])#[^\n]*\\$", raw):
        return True                                # H2a 주석 끝 \ — bash 는 줄이음으로 보지 않아 다음 줄이 따로 돈다
    for m in _HD.finditer(raw):
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", m.group(2)):
            return True                            # H2b 끝말에 낱말 밖 글자(<<EOF-1) — 정본이 끝말을 못 만나 뒷줄을 삼킨다
        if not m.group(1) and ("$(" in raw or "`" in raw):
            return True                            # H2c 따옴표 없는 heredoc 본문 속 치환 — bash 가 실행한다
    return False
def heredoc_segs(raw, groups):
    # bash 가 실제로 실행하는 heredoc 본문 — 셸에 넣는 본문은 전부 · 따옴표 없는 본문은 치환 속만(옛 해석도 이것은 못 본다 · #3435 qa H2c)
    unq = any(not m.group(1) for m in _HD.finditer(raw))
    out = []
    for g in groups:
        if not g["heredoc"]:
            continue
        ex = "exec-string" in g["uncertain"]
        for s in cmd_targets.split_segments("\n".join(g["heredoc"])):
            if s["head"] and (ex or (unq and s["subst"])):
                out.append([s["head"]] + s["args"])
    return out
branch = {}
def cur_branch(cdir):
    if cdir not in branch:
        try:
            branch[cdir] = subprocess.run(["git", "-C", cdir, "rev-parse", "--abbrev-ref", "HEAD"],
                                          capture_output=True, text=True, timeout=3).stdout.strip()
        except Exception:
            branch[cdir] = ""
    return branch[cdir]
# -S·--gpg-sign 은 값이 붙어서만 온다(-S<키>·--gpg-sign=<키>) — 값 옵션으로 보면 출처를 삼킨다
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
def judge(segs):
  branch.clear(); branch[None] = os.environ.get("CUR", "")   # cwd 별 현재 브랜치 추적
  for seg in segs:
    # 래퍼 접두(env·command·exec·time·timeout N·nice·nohup·sudo·VAR=x)를 넘기고 처음 나오는 git/gh 부터 해석
    first = next((j for j, t in enumerate(seg) if t in ("git", "gh")), None)
    if first is None: continue
    seg = seg[first:]
    if seg[0] == "git":
        cdir, i = parse_git_globals(seg)
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
                return "develop 경유 없는 main 머지(출처: %s)" % ",".join(bad)
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
            return "develop 경유 없는 main 머지(출처: %s)" % head
  return None
try:
    v = judge(new_segs(RAW))
    if v is None:                                 # 정본이 bash 와 다르게 읽는 꼴만 다시 본다(#3435 qa H1·H2)
        G = cmd_targets.split_segments(RAW)
        if bash_differs(RAW, G):
            v = judge(heredoc_segs(RAW, G)) or judge(old_segs(RAW))
except Exception:
    try:
        v = judge(old_segs(RAW))                  # 정본 해석 실패 → 옛 해석만(#3326 B1~B5 풀기 — 정본이 낸 판정은 다시 보지 않는다)
    except Exception:
        v = None                                  # 판정 불가는 fail-open
if v:
    print(v)
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
