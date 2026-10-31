import os, json, re

try:
    with open(os.environ.get("NFP_INPUT_FILE", ""), encoding="utf-8", errors="replace") as _fh:
        data = json.loads(_fh.read() or "{}")
    command = data.get('tool_input', {}).get('command', '') or ''
except Exception:
    print("ALLOW"); raise SystemExit(0)

if not command or 'push' not in command:
    print("ALLOW"); raise SystemExit(0)

CURRENT_BRANCH = os.environ.get("NFP_CURRENT_BRANCH", "") or ""
IS_LINKED_WORKTREE = os.environ.get("NFP_IS_LINKED_WORKTREE", "0") == "1"

# Command segments — a force flag / branch in another segment (commit message,
# chained command) is never attributed to the push. Newlines split too. (토막 내기는 아래 judge() 안에서 한다.)

# Force flag: long form as a prefix (--force, --force-with-lease, --force-w abbrev,
# --force=…) but NOT --force-if-includes (a safety check, not a force update); and
# short-option clusters containing f (-f, -fq, -qf, -4f). Quote chars count as token
# boundaries because git sees the unquoted argv.
FORCE = re.compile(r'''(?:^|[\s'"])(?:--force(?!-if-includes)|-[A-Za-z0-9]*f[A-Za-z0-9]*(?=[\s'"]|$))''')
# A '+'-prefixed refspec (+main, +HEAD:main, +refs/heads/main) is also a force update.
PLUS_REF = re.compile(r'''(?:^|[\s'"])\+\S''')
import sys
if os.environ.get("NFP_LIB"): sys.path.insert(0, os.environ["NFP_LIB"])
try:
    from git_global import parse_git_globals, GIT_GLOBAL_VAL   # 전역 옵션 풀기·값 옵션 집합 — lib/git_global.py (#2692 · #3031)
except Exception:
    # lib 못 읽음 → 판정 불가. force 꼴이 보이면 막는다(fail-closed · 이 가드 정책) · 아니면 통과
    if FORCE.search(command) or PLUS_REF.search(command):
        print("no-force-push: lib/git_global.py 를 못 읽어 판정 불가 — force push 꼴이라 막는다", file=sys.stderr)
        print("BLOCK_UNKNOWN"); print("[]"); raise SystemExit(0)
    print("ALLOW"); raise SystemExit(0)
try:
    import cmd_targets as CT   # 명령 해석 정본(#3275 · #3278-2) — 못 읽으면 옛 쪼개기만(종전과 같다)
except Exception:
    CT = None
ALLOWED_BRANCH = re.compile(r'^(feature|fix|hotfix|release|chore|docs)/')
# item6: worktree-* 접두는 "허용 브랜치"가 아니라 "자기 브랜치일 때만" 허용한다 — 접두만 보고
# 허용하면 A 세션이 B 세션의 worktree-* 브랜치를 force push 로 덮어쓸 수 있다.
# 세 조건이 모두 참이어야 ALLOW(하나라도 거짓이면 'unknown' → BLOCK_UNKNOWN):
#   (a) dest == CURRENT_BRANCH
#   (b) IS_LINKED_WORKTREE — 위 bash 단 판정(스크래치 `git init` 스푸핑을 거른다)
#   (c) 이 세그먼트에 -C/--git-dir/--work-tree 저장소 리다이렉트가 없다 — 있으면 CURRENT_BRANCH 가
#       실제 push 대상 저장소를 반영한다는 보장이 없어 예외를 미적용한다(has_redirect 인자).
# (c) 때문에 `-C` 로 자기 다른 워크트리를 가리키는 정당한 push 도 막힌다 — 안전 방향의 과차단.
OWN_WORKTREE_BRANCH = re.compile(r'^worktree-')

def is_own_worktree_force(dest, has_redirect):
    return (
        bool(CURRENT_BRANCH)
        and OWN_WORKTREE_BRANCH.match(dest) is not None
        and dest == CURRENT_BRANCH
        and IS_LINKED_WORKTREE
        and not has_redirect
    )

# Push options that take a SEPARATE-arg value (so the value isn't read as a refspec).
VALUE_OPTS = {'-o', '--push-option', '--repo', '--exec', '--receive-pack'}

def norm_dest(tok):
    dest = tok.split(':')[-1].strip('\'"').lstrip('+')   # refspec src:dst -> dst
    dest = re.sub(r'^refs/heads/', '', dest)
    dest = re.sub(r'^heads/', '', dest)
    return dest

def parse_dests(seg):
    """force-push 세그먼트에서 **목적지 refspec 목록**만 뽑는다.

    2026-08-09: 계측이 "무엇이 막혔나"를 기록하려면 판정(classify_push)과 **같은 파싱**을
    써야 한다. 따로 파싱하면 둘이 갈라져 원장이 판정과 다른 말을 하게 된다 — 그래서
    classify_push 가 이 함수를 호출하도록 뽑아냈다(단일 파서).
    파싱 불가('push' 토큰 없음)면 빈 목록 — 그 경우 판정은 fail-closed 로 'unknown' 이다.
    """
    toks = seg.split()
    if 'push' not in toks:
        return []
    args = toks[toks.index('push') + 1:]
    # When --repo/--repo=<x> supplies the remote, the first positional is already a
    # refspec (not the remote), so it must not be skipped.
    remote_from_opt = any(t == '--repo' or t.startswith('--repo=') for t in args)
    dests, positional, i = [], 0, 0
    while i < len(args):
        t = args[i]
        if t in VALUE_OPTS:
            i += 2; continue                   # skip option and its separate value
        if t.startswith('-'):
            i += 1; continue                   # flag
        positional += 1
        if positional == 1 and not remote_from_opt:
            i += 1; continue                   # first positional = remote
        dests.append(norm_dest(t))             # remaining positionals = refspecs
        i += 1
    return dests

def classify_push(seg, has_redirect):
    # 목적지는 parse_dests 하나로 읽는다(계측 원장이 판정과 같은 목적지를 적는다) ·
    #   has_redirect 를 받아야 자기-워크트리 예외가 fail-open 이 되지 않는다.
    """Return 'protected' | 'allowed' | 'unknown' for a force-push segment, judged
    from the parsed refspec destination(s) only."""
    if 'push' not in seg.split():
        return 'unknown'                       # forced git-push we can't parse → block
    dests = parse_dests(seg)
    if any(d in ('main', 'master') for d in dests):
        return 'protected'
    if any(ALLOWED_BRANCH.match(d) or d == 'staging' or is_own_worktree_force(d, has_redirect) for d in dests):
        return 'allowed'
    return 'unknown'

# git 글로벌 옵션 중 **값을 별도 인자로** 받는 것 — 서브커맨드를 찾을 때 값까지 건너뛴다.
GIT_GLOBAL_VALUE_OPTS = GIT_GLOBAL_VAL   # 값 옵션 집합은 lib 한 곳 — 여기에 --config-env 가 없어 force push 가 지나갔다(#3031)
# item6: 이 중 저장소 자체를 바꾸는 옵션만 "redirect" 로 표시한다
# (-c 는 config 값 하나를 override 할 뿐 저장소를 바꾸지 않으므로 제외). redirect 가 있으면
# 훅 프로세스 cwd 의 CURRENT_BRANCH/IS_LINKED_WORKTREE 가 실제 push 대상 저장소를
# 반영한다는 보장이 없다 — worktree 자기-예외를 fail-closed 로 미적용한다.
GIT_REDIRECT_OPTS = {'-C', '--git-dir', '--work-tree'}

def git_opt_slots(toks, start, opts):
    # → (전역 옵션이 놓인 자리 목록, 하위명령 자리). 걷기는 lib 한 곳(#2692) — 자리 j 는 lib 가 toks[:j] 를 걸어
    #   정확히 j 에서 멈출 때만 옵션 자리다(값 자리는 앞 옵션이 넘겨 j+1 에서 멈춘다).
    idx = parse_git_globals(toks, start, opts)[1]
    return [j for j in range(start, min(idx, len(toks))) if parse_git_globals(toks[:j], start, opts)[1] == j], idx

def is_git_push(seg):
    """세그먼트의 git **서브커맨드가 실제로 `push`** 인지, 그리고 저장소 리다이렉트
    옵션(-C/--git-dir/--work-tree)이 있는지를 (is_push, has_redirect) 로 반환한다.

    2026-08-05 갭 G-10: 옛 판정은 `\\bgit\\b.*\\bpush\\b` 였는데 `-` 가 단어경계라서
      `git worktree remove --force /tmp/fo-push`
    처럼 **경로 이름에 push 가 든 비-push 명령**이 통과했다. 그 뒤 classify_push() 는
    토큰에 'push' 가 없으니 fail-closed 로 'unknown' → 차단으로 갔다. 결과적으로
    D-2 런북(임시 워크트리 cherry-pick)의 정리 단계가 가드에 막혔다 — 규율이 정한
    안전 경로를 가드가 차단하면 사람은 가드를 끄는 쪽으로 움직인다.
    같은 이유로 `git stash push -f`(서브커맨드는 stash) 도 오탐이었다.

    탐지력 손실 없음: force push 는 언제나 `git … push` 다. 좁히는 방향만이다.

    인용부호는 공백으로 치환해 토큰화한다 — 훅 헤더 규약대로 따옴표 안의
    `git push --force` 도 명령으로 취급(fail-closed)하기 위해서다. 이 규약을 바꾸지 않는다.
    """
    toks = seg.replace('"', ' ').replace("'", ' ').split()
    if 'git' not in toks:
        return False, False
    slots, i = git_opt_slots(toks, toks.index('git') + 1, GIT_GLOBAL_VALUE_OPTS)
    has_redirect = any(toks[j] in GIT_REDIRECT_OPTS or toks[j].startswith(('--git-dir=', '--work-tree=')) for j in slots)
    return (i < len(toks) and toks[i] == 'push'), has_redirect   # 첫 비-옵션 토큰 = 서브커맨드

def judge(text):
    # 글자 판정 — 토막마다 `git … push` 이고 force 표시가 있으면 목적지로 가른다. → (판정, 막힌 목적지)
    for seg in re.split(r'&&|\|\||;|\||\n', text):
        # 서브커맨드가 `push` 인 세그먼트만 판정 대상(글로벌 옵션 허용: git -C x push, git -c k=v push).
        is_push, has_redirect = is_git_push(seg)
        if not is_push:
            continue
        if not (FORCE.search(seg) or PLUS_REF.search(seg)):
            continue
        cls = classify_push(seg, has_redirect)
        if cls in ('protected', 'unknown'):
            # 계측용(#201): 실제로 막힌 **목적지 브랜치**를 판정과 함께 내보낸다 —
            #   현재 체크아웃 브랜치만 적으면 "무엇이 막혔나"가 아니라 "어디에 서 있었나"를 센다.
            return ("BLOCK_PROTECTED" if cls == 'protected' else "BLOCK_UNKNOWN"), parse_dests(seg)
        # 'allowed' → this segment is fine; keep scanning others.
    return "ALLOW", []

def hit(text):
    return judge(text)[0] != "ALLOW"

# ── 실행되는 자리인가 (#2265) — 글자 판정이 막는다고 할 때만 부른다. True = 실행된다(막는다) · False = 글자뿐(통과) ──
#   방법은 forge-destructive-op-block.sh 와 같다: 따옴표를 지키며 토막 내 **명령 머리**를 보고, 머리가 무엇이냐로 그 토막의 글자를 읽을지 정한다.
#   토막 읽기(낱말·래퍼·예약어)는 위 `--no-verify` 절과 같은 규칙이다.
import shlex
RESERVED = {"if", "then", "else", "elif", "do", "while", "until", "!", "{", "("}
WRAP_VAL = {"env": {"-u", "--unset", "-C", "--chdir", "-S", "--split-string"}, "sudo": {"-u", "-g", "-C"},
            "nice": {"-n", "--adjustment"}, "time": {"-f", "--format", "-o", "--output"}, "timeout": {"-s", "--signal", "-k", "--kill-after"},
            "ionice": {"-c", "-n", "-p"}}
WRAP = {"env", "command", "exec", "time", "nohup", "sudo", "nice", "timeout", "builtin", "stdbuf", "setsid", "ionice"}
GIT_GVAL = GIT_GLOBAL_VAL   # 값 옵션 집합은 lib 한 곳(#3031)
SHELLS = {"bash", "sh", "zsh", "dash", "ksh", "ash", "fish", "csh", "tcsh"}
INTERP = re.compile(r"^(python[0-9.]*|node|nodejs|deno|bun|perl|ruby|php|lua)$")
INTERP_EVAL = {"-c", "-e", "-p", "-r", "--eval", "--print", "-"}
# 인자를 명령으로 실행하는 것들 — 이 머리가 있으면 그 명령 전체의 글자를 글자 판정으로 본다(따옴표 안 포함).
EXEC_ALWAYS = {"eval", "source", ".", "ssh", "su", "doas", "awk", "gawk", "watch", "parallel", "expect", "script", "make", "at", "batch", "crontab",
               "tmux", "screen", "docker", "podman", "kubectl", "wsl", "wsl.exe", "cmd.exe", "powershell", "powershell.exe", "pwsh", "osascript",
               "systemd-run", "flock", "strace", "alias", "export", "declare", "local", "readonly", "typeset", "trap", "function"}
DATA = {"echo", "printf"}   # 인자를 찍기만 한다

def tokenize(c):
    lx = shlex.shlex(c, posix=False, punctuation_chars=";&|\n"); lx.whitespace = " \t\r"; lx.whitespace_split = True
    lx.commenters = ""
    return list(lx)

def uq(t):
    if t.startswith("$'") and t.endswith("'") and len(t) >= 3: return t[2:-1]
    return t[1:-1] if len(t) >= 2 and t[0] == t[-1] and t[0] in "\"'" else t

def flat(s):   # 종전 판정이 보던 꼴 — 따옴표를 공백으로
    return s.replace('"', ' ').replace("'", ' ')

def unquoted(t):   # 낱말에서 따옴표 안을 지운다
    return re.sub(r"\$?'[^']*'|\"(?:[^\"\\]|\\.)*\"", " ", t)

def head_rest(toks):
    # 명령 머리를 찾는다 — ( { ! · 예약어 · VAR= · 리다이렉션 · 래퍼(값 인자 포함) · xargs 를 넘긴 첫 낱말. → (머리 이름, 그 뒤 낱말 시작 위치)
    #   VAR=<값> 의 값에 글자 판정이 걸리면 "=" 를 돌려준다(변수에 담아 나중에 실행하는 꼴 — 막는다).
    i = 0
    while i < len(toks):
        w = toks[i].lstrip("({!")
        if not w or w in RESERVED: i += 1; continue
        if w == "xargs":
            i += 1
            while i < len(toks) and toks[i].startswith("-"):
                i += 2 if toks[i] in ("-n", "-L", "-P", "-I", "-d", "-E", "-s", "-a") else 1
            continue
        m = re.match(r"^[A-Za-z_][A-Za-z0-9_]*\+?=(.*)$", w, re.S)
        if m:
            if hit(flat(" ".join([m.group(1)] + toks[i + 1:]))): return "=", i   # 값의 따옴표는 낱말을 나누지 못한다 — 그 뒤 낱말까지 본다
            i += 1; continue
        if re.match(r"^\d*(<<?|>>?)", w):
            i += 1 if re.match(r"^\d*(<<?|>>?)\S", w) else 2; continue
        if w in WRAP:
            vals = WRAP_VAL.get(w, set()); i += 1
            if w == "timeout":
                while i < len(toks) and toks[i].startswith("-"): i += 2 if toks[i] in vals else 1
                i += 1   # DURATION
            while i < len(toks) and toks[i].startswith("-"): i += 2 if toks[i] in vals else 1
            continue
        return os.path.basename(w), i
    return None, len(toks)

def is_exec(head, rest):
    # 이 토막이 인자·표준입력을 **명령으로 실행**하는가
    if head in EXEC_ALWAYS: return True
    if head in SHELLS:
        # -c 는 옵션 묶음 어디에 있든(-euo pipefail -c · -xc · 값 자리 포함) 찾는다 — 판단이 안 서면 막는다
        if any(a == "-s" or (a.startswith("-") and not a.startswith("--") and "c" in a) for a in rest): return True
        k = 0
        while k < len(rest) and rest[k].startswith("-") and rest[k] != "-":
            k += 2 if rest[k] in ("-o", "-O", "+o", "+O", "--rcfile", "--init-file") or (not rest[k].startswith("--") and rest[k][-1] in "oO") else 1   # -euo pipefail
        return k >= len(rest) or rest[k] == "-" or rest[k].startswith("<")   # 스크립트 파일이 없다 = 표준입력을 실행한다
    if INTERP.match(head):
        # -c · -e · -pe · -ne 는 인자 전체에서 찾는다(-W ignore -c … 처럼 값 있는 옵션 뒤도)
        if any(a in INTERP_EVAL or (a.startswith("-") and not a.startswith("--") and set(a[1:]) & set("ce")) for a in rest): return True
        k = 0
        while k < len(rest) and rest[k].startswith("-"):
            k += 2 if rest[k] in ("-W", "-X") else 1
        return k >= len(rest) or rest[k].startswith("<")
    if head == "find":
        return any(a in ("-exec", "-execdir", "-ok", "-okdir") for a in rest)
    return False

def segments_of(text):
    # → 토막 목록(따옴표가 남은 낱말들). 낱말 머리의 # 부터 개행까지는 주석. 닫히지 않은 따옴표면 ValueError.
    text = text.replace("\\\n", " ")
    text = re.sub(r"\d*>&\d*-?|&>>?", " ", text)
    text = re.sub(r"\\([ \t;&|#])", "\x01", text)
    out, seg, in_comment = [], [], False
    for t in tokenize(text) + [";"]:
        if in_comment:
            if "\n" in t: in_comment = False   # ";\n"·"\n\n" 처럼 개행이 묶인 토막도 주석의 끝이다
            continue
        if t and set(t) <= set(";&|\n"):
            if seg: out.append(seg)
            seg = []
        elif t.startswith("#"):
            if seg: out.append(seg)
            seg = []; in_comment = True
        else:
            seg.append(t)
    return out

def segments_ct(text):
    # 정본 조각 → 옛 segments_of 와 같은 꼴(따옴표가 남은 낱말 목록) · 이스케이프 표식은 `\글자` 로 되돌린다(#3278-2)
    return [["".join("\\" + CT._UNESC[ch] if ch in CT._UNESC else ch for ch in t) for t in g["raw"]]
            for g in CT.split_segments(text) if g["raw"]]

def seg_info(raw):
    toks = [uq(t) for t in raw]
    head, at = head_rest(toks)
    return head, toks[at + 1:], raw

def seg_live(head, rest, raw):
    if head is None: return False
    if head == "=": return True
    if head == "git":
        slots, k = git_opt_slots(rest, 0, GIT_GVAL)
        if any(rest[j] == "-c" and j + 1 < len(rest) and rest[j + 1].startswith("alias.") for j in slots): return hit(flat(" ".join(raw)))
        if k >= len(rest) or rest[k] != "push": return False     # 다른 하위 명령의 값(-m "…") 은 실행되지 않는다
        return hit(" ".join(raw))                                 # 진짜 git push — 종전 판정 그대로
    if head in DATA: return False
    return hit(unquoted(" ".join(raw)))                          # 그 밖의 도구 — 따옴표 밖 글자만(--body="…" 처럼 낱말 중간의 따옴표도 지운다)

def carve(text, quotes=True):
    # 명령 글자에서 ①명령 치환·프로세스 치환의 속(실행된다) ②heredoc 본문(데이터)을 떼어 낸다.
    #   → (남은 글자, [치환 속], [(heredoc 을 연 줄, 본문, 태그에 따옴표가 있었나)]) · 짝이 안 맞으면 None(해석 불가 → 막는다)
    #   quotes=False 는 heredoc 본문용 — 본문에서는 따옴표가 글자라 치환을 막지 못한다.
    out, subs, docs, pend = [], [], [], []
    i, n, q, line0, olen = 0, len(text), None, 0, [0]
    def put(x): out.append(x); olen[0] += len(x)
    def grab(j, close):   # j = 속의 시작. 괄호 깊이를 세며(따옴표 안은 건너뛴다) 닫는 자리까지 → (속, 다음 위치) | None
        if close == "`":
            e = text.find("`", j)
            return (text[j:e], e + 1) if e >= 0 else None
        depth, k, qq = 1, j, None
        while k < n:
            c = text[k]
            if qq:
                if c == "\\" and qq == '"': k += 2; continue
                if c == qq: qq = None
            elif c in "\"'": qq = c
            elif c == "\\": k += 2; continue
            elif c == "(": depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0: return text[j:k], k + 1
            k += 1
        return None
    while i < n:
        c = text[i]
        if q == "'" and quotes:
            put(c)
            if c == "'": q = None
            i += 1; continue
        if c == "\\" and i + 1 < n and (quotes or text[i + 1] in "$`"):
            put(text[i:i + 2]); i += 2; continue
        if quotes and c in "\"'" and (q is None or q == c):
            q = None if q else c; put(c); i += 1; continue
        opener = None
        if c == "`": opener = (i + 1, "`")
        elif text.startswith("$((", i): pass                          # 산술 — 명령이 아니다
        elif text.startswith("$(", i): opener = (i + 2, ")")
        elif q is None and quotes and text.startswith(("<(", ">("), i): opener = (i + 2, ")")
        if opener:
            got = grab(*opener)
            if got is None: return None
            subs.append(got[0]); put(" _SUB_ "); i = got[1]; continue
        if q is None and quotes and text.startswith("<<", i) and not text.startswith("<<<", i) and (i == 0 or text[i - 1] != "<"):
            m = re.match(r"<<(-?)[ \t]*(\\?)(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\3", text[i:])
            if m:
                pend.append((m.group(4), bool(m.group(1)), bool(m.group(2) or m.group(3))))
                put(" "); i += m.end(); continue
        if c == "\n" and q is None and pend:
            line = "".join(out)[-(olen[0] - line0):] if olen[0] > line0 else ""
            put("\n"); i += 1
            for tag, dash, quoted in pend:
                body = []
                while True:
                    if i >= n: return None                           # 닫는 태그가 없다
                    e = text.find("\n", i); e = n if e < 0 else e
                    ln = text[i:e]; i = min(e + 1, n)
                    if (ln.lstrip("\t") if dash else ln) == tag: break
                    body.append(ln)
                    if e >= n: return None
                docs.append((line, "\n".join(body), quoted))
            pend = []; line0 = olen[0]; continue
        if c == "\n" and q is None: line0 = olen[0] + 1
        put(c); i += 1
    if (q and quotes) or pend: return None
    return "".join(out), subs, docs

def live(text, depth=0, seg=segments_of):
    if depth > 4: return True
    cv = carve(text)
    if cv is None: return True
    rest, subs, docs = cv
    if any(hit(s) and live(s, depth + 1, seg) for s in subs): return True     # $(…)·백틱 속은 실행된다
    try:
        infos = [seg_info(s) for s in seg(rest)]
    except ValueError:
        return True
    for line, body, quoted in docs:
        if not quoted:                                                        # 따옴표 없는 태그 — 본문의 치환이 실행된다
            bc = carve(body, quotes=False)
            if bc is None or any(hit(s) and live(s, depth + 1, seg) for s in bc[1]): return True
        if hit(body):
            try:
                if any(is_exec(h, r) for h, r, _ in (seg_info(s) for s in seg(line)) if h not in (None, "=")): return True
            except ValueError:
                return True
    if any(is_exec(h, r) for h, r, _ in infos if h not in (None, "=", "git")) and hit(flat(rest)):
        return True                                                            # 실행기가 있다 — 종전대로 전부 본다(echo "…" | bash 포함)
    return any(seg_live(h, r, raw) for h, r, raw in infos)

verdict, blocked_dests = judge(command)
def live_ct(text):   # 정본 쪼개기로 본 실행 자리 — 정본을 못 읽거나 해석이 죽으면 False(옛 판정만 남는다)
    if CT is None: return False
    try:
        return live(text, seg=segments_ct)
    except Exception:
        return False

if verdict != "ALLOW" and not (live(command) or live_ct(command)):   # MUT-LIVE-ONLY · 옛·정본 합집합(결정 ㉰ · #3278-2)
    verdict, blocked_dests = "ALLOW", []

print(verdict)
# ⚠️ CSV 로 이어붙이지 않는다: git refname 에는 쉼표가
#   허용되므로 `",".join()` → `split(",")` 왕복에서 브랜치 하나가 둘로 쪼개진다
#   (예: 목적지 `foo,worktree-x` → dest_is_worktree 가 거짓 1). JSON 배열로 넘긴다.
print(json.dumps(blocked_dests))
