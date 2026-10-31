import os, posixpath, re, shlex, subprocess, sys, time
CT = None
if os.environ.get("FDOB_LIB"):   # 명령 해석 정본(#3275 E3) — 못 읽으면 옛 쪼개기만(아래 판정은 둘 다 본다)
    sys.path.insert(0, os.environ["FDOB_LIB"])
    try:
        import cmd_targets as CT
    except Exception:
        CT = None
    del sys.path[0]

T0 = time.monotonic()

def block(why):
    sys.stdout.write(why + "\n")
    raise SystemExit(0)

def main():
    cmd = os.environ.get("FDOB_CMD", "")
    home = (os.environ.get("FDOB_HOME") or "").rstrip("/")
    subs = ((r"\$\{FORGE_ROOT(?::-[^}]*)?\}", os.environ.get("FDOB_FROOT", "")), (r"\$FORGE_ROOT\b", os.environ.get("FDOB_FROOT", "")),
            (r"\$\{FORGE_OUTPUTS(?::-[^}]*)?\}", os.environ.get("FDOB_FOUT", "")), (r"\$FORGE_OUTPUTS\b", os.environ.get("FDOB_FOUT", "")),
            (r"\$\{HOME\}", home), (r"\$HOME\b", home))
    ACTIONS = {"set", "add", "init", "reapply"}
    SAFE_FLAGS = {"--no-pager", "-P", "-p", "--paginate", "--no-replace-objects", "--literal-pathspecs",
                  "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs", "--no-optional-locks"}

    def expand(tok):
        t = tok
        for pat, val in subs:
            if val:
                t = re.sub(pat, lambda _m, v=val: v, t)
        if home and (t == "~" or t.startswith("~/")):
            t = home + t[1:]
        return None if ("$" in t or "`" in t) else t

    # 전처리 = bash 가 읽는 순서를 따르는 **스캐너 하나**(#1630). 따로따로·차례로 처리하면 서로 먹는다
    #   (줄 연결을 먼저 지우면 `# 주석 \⏎` 이 다음 줄 명령까지 주석이 되고, `${x:- #}` 의 # 를 주석으로 본다).
    #   한 글자씩 따옴표 상태를 들고 간다:
    #   · `\⏎` = 줄 연결(작은따옴표 안·주석 안에서는 아님) → 없앤다   · 따옴표 밖, 낱말 첫머리 `#` = 줄 끝까지 주석
    #   · `${…}` 안의 # 는 주석 아님   · heredoc 은 아래에서 fail-closed(본문을 해석하지 않는다 — `<<<` here-string 은 해당 없음).
    def preprocess(s):
        out, q, i, n, brace = [], None, 0, len(s), 0
        while i < n:
            c = s[i]
            if q == "'":
                out.append(c)
                if c == "'":
                    q = None
                i += 1; continue
            if c == "\\" and i + 1 < n:
                if s[i + 1] == "\n":
                    i += 2; continue
                if s[i + 1] == "\r" and i + 2 < n and s[i + 2] == "\n":
                    i += 3; continue
                out.append(s[i:i + 2]); i += 2; continue
            if q == '"':
                out.append(c)
                if c == '"':
                    q = None
                i += 1; continue
            if c in "'\"":
                out.append(c); q = c; i += 1; continue
            if s.startswith("${", i):
                brace += 1; out.append("${"); i += 2; continue
            if c == "}" and brace:
                brace -= 1; out.append(c); i += 1; continue
            if c == "#" and not brace and (not out or out[-1] in " \t\n;&|()"):
                while i < n and s[i] != "\n":
                    i += 1
                continue
            out.append(c); i += 1
        return "".join(out)

    # heredoc·명령 치환·프로세스 치환은 **흉내 내지 않는다**(#1630): 본문 건너뛰기·괄호 세기는 구분자 오독(`EOF-END`)·
    #   본문 속 실행되는 `$(…)`·인용된 괄호·중첩 큰따옴표에서 틀린다. 명령에 `sparse-checkout <동작>` 이
    #   보이고 이 구문이 하나라도 있으면 판정하지 않고 막는다(fail-closed). 커밋 메시지·본문에 그 낱말을 쓸 땐 `-F <파일>` 로.
    norm = re.sub(r"[\\'\"\r\n]", "", cmd)
    if re.search(r"sparse-checkout.*\b(set|add|init|reapply)\b", norm, re.S) \
            and re.search(r"(?<!<)<<(?!<)|[<>]\(|`|\$\(", cmd):
        block("heredoc·명령 치환·프로세스 치환과 함께 쓴 sparse-checkout 은 판정하지 않는다 — 별도 Bash 호출로")

    src = preprocess(cmd).replace("\r\n", "\n").replace("\n", " ; ")
    try:
        lx = shlex.shlex(src, posix=True, punctuation_chars=True)
        lx.whitespace_split = True
        lx.commenters = ""
        toks = list(lx)
    except ValueError:
        if re.search(r"sparse.{0,4}checkout", cmd):
            block("명령을 해석할 수 없다(따옴표 불균형) — sparse-checkout 대상 판정 불가")
        return

    # 리다이렉트(`<` `>` `>>` `>|` `2>` `&>` `>&` …)는 세그먼트를 끊지 않고 연산자와 그 대상을 건너뛴다 — `sparse-checkout </dev/null set`
    #   이 둘로 갈라져 동작 낱말을 놓치지 않게(#1630). fd 숫자(`2>` 의 2)는 바로 앞 토큰이면 함께 지운다.
    #   (프로세스 치환이 섞인 명령은 위 fail-closed 검사에서 이미 막혔다.)
    segs, cur, skip_target, i = [], [], False, 0
    while i < len(toks):
        t = toks[i]
        if skip_target:
            skip_target = False; i += 1; continue
        if t and set(t) <= set("<>&|") and ("<" in t or ">" in t):
            if cur and cur[-1].isdigit():
                cur.pop()
            skip_target = True
        elif t and set(t) <= set(";&|()"):
            segs.append(cur); cur = []
        else:
            cur.append(t)
        i += 1
    segs.append(cur)
    # 정본 조각을 더한다(#3275 E3) — 아래 판정은 조각마다 따로 돌고 하나라도 막으면 막는다 = 옛·정본의 합집합(결정 ㉰ ① 호환층).
    #   정본 낱말은 따옴표를 벗기고 따옴표 없는 \ 를 풀며, 리다이렉트(연산자와 그 대상)는 옛 쪼개기처럼 건너뛴다. 못 읽으면 더하지 않는다.
    if CT is not None:
        redir = re.compile(r"^(\d*(?:&>>?|>>|>\||>&?|<<<|<>|<&?))(.*)$", re.S)
        try:
            for g in CT.split_segments(cmd):
                seg, skip = [], False
                for raw, w in zip(g["raw"], g["words"]):
                    if skip:
                        skip = False
                        continue
                    m = None if raw[:1] in "'\"" else redir.match(raw)
                    if m:
                        skip = m.group(2) == ""
                        continue
                    if not any(q in raw for q in "'\""):
                        w = re.sub(r"\\(.)", r"\1", w)
                    seg.append(w)
                segs.append(seg)
        except Exception:
            pass

    hits = [(s, k) for s in segs for k, t in enumerate(s) if t == "sparse-checkout"]
    hits = [(s, k) for s, k in hits
            if next((a for a in s[k + 1:] if not a.startswith("-")), None) in ACTIONS]
    if not hits:
        return
    if re.search(r"\bGIT_(DIR|WORK_TREE|COMMON_DIR)\b", cmd):
        block("GIT_DIR/GIT_WORK_TREE/GIT_COMMON_DIR 가 보인다 — 대상 판정 불가")
    # 명령 문자열이 아니라 **물려받은 환경**에 있어도 git 은 그쪽을 본다 — 아래 조회에서 GIT_* 를 지우기 전에 막는다(#1610).
    inherited = [v for v in ("GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR") if os.environ.get(v)]
    if inherited:
        block("환경에 %s 가 설정돼 있다 — git 이 cwd/-C 가 아닌 곳을 볼 수 있어 판정하지 않는다" % "/".join(inherited))
    moves = any(t in ("cd", "pushd", "popd") for s in segs for t in s)
    base = os.environ.get("FDOB_CWD") or os.environ.get("FDOB_PWD") or None
    cache = {}
    for seg, k in hits:
        if not seg or posixpath.basename(seg[0]) != "git":
            block("허용 형태가 아니다(`%s …`) — sparse 는 세그먼트 맨 앞 `git -C <절대경로> sparse-checkout …` 로만" % (seg[0] if seg else ""))
        j, tdir, rel_first = 1, None, None
        while j < k:
            t = seg[j]
            if t == "-C" or (t.startswith("-C") and len(t) > 2):
                v = seg[j + 1] if t == "-C" else t[2:]
                if t == "-C" and j + 1 >= k:
                    block("`-C` 값이 없다")
                e = expand(v)
                if e is None:
                    block("대상 경로를 펼칠 수 없다(`%s`) — 리터럴 절대경로로 쓴다" % v)
                if rel_first is None:
                    rel_first = not e.startswith("/")
                start = tdir if tdir is not None else base
                if not e.startswith("/") and start is None:
                    block("상대경로 `-C %s` 의 기준 폴더를 모른다" % v)
                tdir = os.path.realpath(e if e.startswith("/") else posixpath.join(os.path.realpath(start), e))
                j += 2 if t == "-C" else 1
            elif t == "-c":
                j += 2
            elif t.startswith("--git-dir") or t.startswith("--work-tree") or t in ("--namespace", "--exec-path") \
                    or t.startswith("--namespace=") or t.startswith("--exec-path=") or t.startswith("--config-env"):
                block("`%s` 가 있으면 대상을 판정하지 않는다" % t)
            elif t in SAFE_FLAGS:
                j += 1
            else:
                block("`git` 과 `sparse-checkout` 사이에 모르는 토큰(`%s`) — 허용 형태가 아니다" % t)
        if tdir is None or rel_first:
            if moves:
                block("명령에 cd/pushd/popd 가 있어 현재 폴더를 믿지 않는다 — `git -C <절대경로> sparse-checkout …` 로")
            if tdir is None:
                if base is None:
                    block("현재 폴더를 모른다")
                tdir = os.path.realpath(base)
        if tdir in cache:
            ok = cache[tdir]
        else:
            if len(cache) >= 16:
                block("대상이 너무 많다 — 판정하지 않는다")
            env = {kk: vv for kk, vv in os.environ.items() if not kk.startswith("GIT_")}
            # 전체 상한 6초 — 대상마다 5초씩 16개면 훅 등록 timeout(10초)을 넘는다(#1630). 넘으면 막는다
            #   (그 전에 lib/hook-deadline.sh 상한 — 등록 timeout 의 절반 − 흐른 시간 — 이 먼저 막을 수 있다).
            left = 6.0 - (time.monotonic() - T0)
            if left <= 0:
                block("대상 확인 시간 초과 — 판정하지 않는다")
            try:
                r = subprocess.run(["git", "-C", tdir, "rev-parse", "--git-dir", "--git-common-dir"],
                                   capture_output=True, text=True, timeout=min(5.0, left), env=env)
            except Exception:
                block("대상 확인 실패(%s) — 판정 불가" % tdir)
            lines = r.stdout.split("\n")
            if r.returncode != 0 or len(lines) < 2 or not lines[0] or not lines[1]:
                block("대상이 없거나 git 레포가 아니다(%s) — 워크트리를 먼저 만들고 별도 명령으로 건다" % tdir)
            gd = os.path.realpath(posixpath.join(tdir, lines[0]))
            cdir = os.path.realpath(posixpath.join(tdir, lines[1]))
            ok = gd != cdir
            cache[tdir] = ok
        if not ok:
            block("%s 는 linked worktree 가 아니다(본 체크아웃) — 여기에 sparse 를 걸면 추적 파일이 워킹트리에서 사라진다" % tdir)

try:
    main()
except SystemExit:
    raise
except Exception as ex:
    block("판정 중 오류(%s) — fail-closed" % type(ex).__name__)
