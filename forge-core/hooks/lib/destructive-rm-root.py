import os, posixpath, re, shlex, sys
CT = None
if os.environ.get("FDOB_LIB"):   # 명령 해석 정본(#3275 E2) — 못 읽으면 옛 쪼개기만(아래 판정은 둘 다 돈다)
    sys.path.insert(0, os.environ["FDOB_LIB"])
    try:
        import cmd_targets as CT
    except Exception:
        CT = None
    del sys.path[0]

cmd  = os.environ.get("FDOB_CMD", "")
home = os.environ["FDOB_HOME"].rstrip("/") or "/"
froot = posixpath.normpath(os.environ["FDOB_FROOT"])
fout  = posixpath.normpath(os.environ["FDOB_FOUT"])
cwd0  = os.environ.get("FDOB_CWD") or None

def expand(tok):
    """변수·틸드를 펼친다. 펼칠 수 없는 조각이 남으면 None(추측하지 않는다)."""
    t = tok
    for pat, val in ((r"\$\{FORGE_ROOT(?::-[^}]*)?\}", froot), (r"\$FORGE_ROOT\b", froot),
                     (r"\$\{FORGE_OUTPUTS(?::-[^}]*)?\}", fout), (r"\$FORGE_OUTPUTS\b", fout),
                     (r"\$\{HOME\}", home), (r"\$HOME\b", home)):
        t = re.sub(pat, lambda _m, v=val: v, t)
    if t == "~" or t.startswith("~/"):
        t = home + t[1:]
    if "$" in t or "`" in t:
        return None
    return t

SYS = ["/etc", "/usr", "/var", "/bin", "/sbin", "/lib", "/lib64", "/boot", "/opt",
       "/srv", "/root", "/sys", "/proc", "/dev"]
ROOTS = {"/", "/home", home, home + "/.claude", froot, froot + "/.claude", froot + "/.git",
         home + "/forge", fout, home + "/forge-outputs"} | set(SYS)

def is_root_or_ancestor(p):
    p = posixpath.normpath(p)
    for r in ROOTS:
        r = posixpath.normpath(r)
        if p == r or p == "/" or r.startswith(p.rstrip("/") + "/"):
            return True
    return False

def is_protected_abs(p):   # 3번 `_fdob_is_protected` 와 같은 목록 + L-53 예외
    if p == "/":
        return True
    p = p.rstrip("/")
    if not p:
        return False
    pre = home + "/forge/.claude/"
    for kind in ("skills/", "agents/", "commands/"):
        if p.startswith(pre + kind):
            rest = p[len(pre + kind):]
            if rest and "/" not in rest:
                return False            # L-53: 폴더 하나 삭제는 허용
    if p == home or p.startswith(home + "/.claude") or p == home + "/forge" \
       or p.startswith(home + "/forge/") or p == "/home" or p.startswith("/home/"):
        return True
    return any(p == s or p.startswith(s + "/") for s in SYS)

# 줄바꿈도 구분자다(heredoc 본문도 명령 줄로 본다 — 3번과 같은 보수적 방향).
src = cmd.replace("\n", " ; ")
try:
    lex = shlex.shlex(src, posix=True, punctuation_chars=True)
    lex.whitespace_split = True
    toks = list(lex)
except ValueError:
    toks = re.findall(r"&&|\|\||[;|&()]|[^\s;|&()]+", src)   # 따옴표 불균형 — 거칠게라도 본다

SEP = {"&&", "||", ";", "|", "&", "(", ")", ";;", "|&"}
segs, cur = [], []
for t in toks:
    if t in SEP:
        if cur: segs.append(cur)
        cur = []
    else:
        cur.append(t)
if cur: segs.append(cur)

SKIP_PREFIX = {"sudo", "command", "builtin", "nice", "nohup", "time", "exec"}
FIND_SCOPE = {"-name", "-iname", "-path", "-ipath", "-wholename", "-iwholename", "-regex",
              "-iregex", "-newer", "-mtime", "-mmin", "-atime", "-amin", "-ctime", "-cmin",
              "-size", "-empty", "-user", "-group", "-perm", "-inum", "-samefile", "-links",
              "-maxdepth"}

def resolve(tok, cwd):
    t = expand(tok.strip("\"'"))
    if t is None or t == "":
        return None, None
    if t.startswith("/"):
        return posixpath.normpath(t), "abs"
    if cwd is None:
        return None, None
    return posixpath.normpath(posixpath.join(cwd, t)), "rel"

def segs_ct():
    """정본 해석(cmd_targets.split_segments) → 위 segs 와 같은 꼴(조각마다 따옴표 벗긴 낱말) — $( )·` ` 속 명령도 조각으로(실행된다) ·
    따옴표 없는 \\ 는 다음 글자 · heredoc 본문은 명령으로 다시 쪼갠다(위 "줄바꿈도 구분자"와 같은 보수 쪽). 못 읽으면 [](옛 쪼개기만)."""
    out = []
    def walk(s, depth):
        for g in CT.split_segments(s):
            toks = []
            for raw, w in zip(g["raw"], g["words"]):
                if not any(q in raw for q in "'\""):
                    w = re.sub(r"\\(.)", r"\1", w)
                toks.append(w)
            if toks:
                out.append(toks)
            if g.get("heredoc") and depth < 3:
                walk("\n".join(g["heredoc"]), depth + 1)
    if CT is None:
        return []
    try:
        walk(cmd, 0)
    except Exception:
        return []
    return out

# 옛 쪼개기 조각을 다 본 뒤 통과면 정본 조각을 처음 cwd 부터 다시 본다(#3275 E2) — 둘 중 하나라도 막으면 막는다
#   (결정 ㉰ ① 호환층 · #3326 승인 뒤 옛 쪼개기를 지운다). None = 두 판정 사이의 경계(cwd 를 처음으로 되돌린다).
cwd = cwd0
for seg in segs + [None] + segs_ct():
    if seg is None:
        cwd = cwd0
        continue
    i = 0
    while i < len(seg) and (seg[i] in SKIP_PREFIX or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", seg[i])):
        i += 1
    if i >= len(seg):
        continue
    head, args = seg[i], seg[i + 1:]

    if head == "cd":
        if not args or args[0] == "~":
            cwd = home
        elif args[0] == "-":
            cwd = None                      # 이전 cwd 를 모른다 — 추측하지 않는다
        else:
            p, _ = resolve(args[0], cwd)
            cwd = p                         # 펼칠 수 없으면 None
        continue

    if head == "rm":
        rec = force = False
        targets, opts_done = [], False
        for a in args:
            if not opts_done and a == "--":
                opts_done = True; continue
            if not opts_done and a.startswith("--"):
                if a == "--recursive": rec = True
                elif a == "--force": force = True
                continue
            if not opts_done and a.startswith("-") and len(a) > 1:
                if re.search(r"[rR]", a): rec = True
                if "f" in a: force = True
                continue
            targets.append(a)
        if not (rec and force):
            continue                        # 재귀+강제만 본다 — 범위를 넓히지 않는다
        for t in targets:
            p, kind = resolve(t, cwd)
            if p is None:
                continue
            if (kind == "abs" and is_protected_abs(p)) or (kind == "rel" and is_root_or_ancestor(p)):
                print(f"BLOCK|rm 재귀+강제 — 대상: {p}  (원문 조각: {t})")
                raise SystemExit(0)
        continue

    if head == "find":
        destructive = "-delete" in args
        for k, a in enumerate(args):
            if a in ("-exec", "-execdir", "-ok", "-okdir") and k + 1 < len(args) \
               and posixpath.basename(args[k + 1]) == "rm":
                destructive = True
        if not destructive or any(a in FIND_SCOPE for a in args):
            continue                        # 범위를 좁히는 조건이 있으면 부분 삭제로 본다
        starts = []
        for a in args:
            if a in ("-L", "-H", "-P"): continue
            if a.startswith("-") or a in ("(", "!"): break
            starts.append(a)
        for s in starts or ["."]:
            p, _ = resolve(s, cwd)
            if p is not None and is_root_or_ancestor(p):
                print(f"BLOCK|find 전체 삭제 — 시작 경로: {p}  (원문 조각: {s})")
                raise SystemExit(0)
