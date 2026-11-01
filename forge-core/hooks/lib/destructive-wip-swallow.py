import os, re, shlex, sys
if os.environ.get("FDOB_LIB"): sys.path.insert(0, os.environ["FDOB_LIB"])
try:
    from git_global import parse_git_globals, GIT_GLOBAL_VAL   # git 전역 옵션 걷기·값 옵션 집합 — lib/git_global.py (#2692 · #3014)
except Exception:
    parse_git_globals = None
cmd = os.environ.get("FDOB_CMD", "")
# heredoc 본문은 명령이 아니다 — `<<[-]['"]?TAG` 뒤 줄부터 TAG 줄까지 지운다.
lines, out, tag = cmd.split("\n"), [], None
for ln in lines:
    if tag is not None:
        if ln.strip() == tag:
            tag = None
        continue
    out.append(ln)
    m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", ln)
    if m:
        tag = m.group(1)
try:
    body = " ;\n".join(out)   # 줄바꿈도 명령 경계다(shlex 는 줄바꿈을 공백으로 본다) — 따옴표 안의 줄바꿈은 낱말 안에 남는다
    lex = shlex.shlex(body, posix=True, punctuation_chars=";&|()")
    lex.whitespace_split = True
    lex.commenters = "#"
    toks = list(lex)
except ValueError:
    print("PARSE")
    raise SystemExit(0)
SEP = {";", "&", "&&", "|", "||", "(", ")", ";;", "|&"}
cmds, cur = [], []
for t in toks:
    if t in SEP or set(t) <= set(";&|()"):
        if cur:
            cmds.append(cur)
        cur = []
    else:
        cur.append(t)
if cur:
    cmds.append(cur)
if parse_git_globals is None:   # lib 못 읽음 → 판정 불가 · 막는 꼴의 낱말이 보이면 막는다(fail-closed — 완화 금지)
    if any(t in ("stash", "checkout", "restore") or "autostash" in t.lower() for c in cmds for t in c):
        print("NOLIB lib/git_global.py 를 못 읽어 판정 불가(stash·checkout·restore·autostash 낱말)")
    raise SystemExit(0)
def git_opt_slots(toks, start, opts):
    # → (전역 옵션이 놓인 자리 목록, 하위명령 자리). 자리 j 는 lib 가 toks[:j] 를 걸어 정확히 j 에서 멈출 때만 옵션 자리(값 자리 제외).
    idx = parse_git_globals(toks, start, opts)[1]
    return [j for j in range(start, min(idx, len(toks))) if parse_git_globals(toks[:j], start, opts)[1] == j], idx
# git 앞에 올 수 있는 낱말: 셸 예약어 · 래퍼 명령 · 환경 대입. 래퍼의 옵션·숫자 인자도 건너뛴다.
PRE = {"do", "then", "else", "elif", "if", "while", "until", "{", "!",
       "command", "builtin", "exec", "nohup", "time", "sudo", "env", "timeout", "xargs", "nice", "ionice", "stdbuf"}
WRAP_OPT_ARG = {"-u", "-g", "-n", "-s", "-k", "-I", "-P", "-L", "-d", "-E", "-a", "-c", "--signal", "--kill-after", "--user", "--group"}
def is_ref(cwd, x):   # branch-base-develop.sh `_is_branch` 와 같은 축 — 실제 ref(브랜치·원격·태그·커밋)일 때만 전환으로 본다(검수 HIGH-1)
    import subprocess
    try:
        return subprocess.run(["git", "-C", cwd, "rev-parse", "--verify", "-q", x + "^{commit}"],
                              capture_output=True, timeout=5).returncode == 0
    except Exception:
        return False
for c in cmds:
    i, xargs = 0, False
    while i < len(c):
        t = c[i]
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", t) or t in PRE:
            xargs = xargs or t == "xargs"
        elif i > 0 and t.startswith("-"):
            if t in WRAP_OPT_ARG:
                i += 1
        elif i > 0 and re.fullmatch(r"[0-9.]+[smhd]?", t):   # timeout 60 · nice 의 값
            pass
        else:
            break
        i += 1
    if i >= len(c) or os.path.basename(c[i]) != "git":
        continue
    cfg, cwd = [], os.environ.get("FDOB_CWD") or os.getcwd()
    slots, i = git_opt_slots(c, i + 1, GIT_GLOBAL_VAL)   # 값 옵션 집합은 lib 한 곳(#3014) · -C 는 git 처럼 이어 붙인다(lib 의 cdir = 마지막 것만이라 안 쓴다)
    for j in slots:
        ce = c[j + 1] if c[j] == "--config-env" and j + 1 < len(c) else c[j][len("--config-env="):] if c[j].startswith("--config-env=") else None
        if ce is not None:   # --config-env <키>=<환경변수> — 값은 환경변수라 모른다 → 켜짐으로 본다(막는 쪽 · #3014)
            cfg.append(ce.split("=", 1)[0] + "=true")
        elif c[j] in ("-c", "-C") and j + 1 < len(c):
            if c[j] == "-c":
                cfg.append(c[j + 1])
            else:
                cwd = os.path.join(cwd, c[j + 1])
    if i >= len(c):
        continue
    sub, args = c[i], c[i + 1:]
    if any(re.fullmatch(r"(?i)(rebase|merge|pull)\.autostash=(true|1|yes|on)", x) for x in cfg) and sub in ("pull", "rebase", "merge"):
        print("AUTOSTASH git -c %s=true %s" % ("autostash", sub)); raise SystemExit(0)
    if sub == "stash" and not (args and args[0] in ("list", "show")):
        print("STASH git stash" + (" " + args[0] if args else "")); raise SystemExit(0)
    if sub in ("pull", "rebase", "merge") and "--autostash" in args:
        print("AUTOSTASH git %s --autostash" % sub); raise SystemExit(0)
    if sub == "config" and any(re.fullmatch(r"(?i)(rebase|merge)\.autostash", x) for x in args) and any(x.lower() in ("true", "1", "yes", "on") for x in args):
        print("AUTOSTASH git config *.autostash true"); raise SystemExit(0)
    if sub == "checkout" and "--" in args and (args.index("--") < len(args) - 1 or xargs):
        print("CHECKOUT git checkout -- <경로>"); raise SystemExit(0)
    if sub == "restore":   # 검수 HIGH-1 — 작업 트리를 되돌린다. `--staged`(-S) 단독은 색인만이라 통과
        staged = any(x in ("--staged", "-S") or (x.startswith("-") and not x.startswith("--") and "S" in x[1:]) for x in args)
        worktree = any(x in ("--worktree", "-W") or (x.startswith("-") and not x.startswith("--") and "W" in x[1:]) for x in args)
        if (args or xargs) and not (staged and not worktree):
            print("RESTORE git restore <경로>"); raise SystemExit(0)
    if sub == "checkout" and "--" not in args:   # 검수 HIGH-1 — `git checkout [<ref>] <경로>`(-- 없음)
        if any(x in ("-b", "-B", "--orphan") or x.startswith("--orphan=") for x in args):
            continue   # 새 가지 만들기
        pos, j = [], 0
        while j < len(args):
            x = args[j]
            if x in ("--conflict", "--pathspec-from-file"):
                j += 2; continue
            if not x.startswith("-") or x == "-":
                pos.append(x)
            j += 1
        if xargs or len(pos) >= 2 or (len(pos) == 1 and pos[0] != "-" and not is_ref(cwd, pos[0])):
            print("CHECKOUT git checkout <경로>"); raise SystemExit(0)
