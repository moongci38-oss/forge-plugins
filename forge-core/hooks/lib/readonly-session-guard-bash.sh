# lib/readonly-session-guard-bash.sh — readonly-session-guard.sh 의 Bash 명령 판정부 (#2941 PR-A2 · source 전용)
#
# 쉽게 말하면: 읽기 전용 세션 훅이 Bash 명령을 조각으로 나눠 '프로젝트를 바꾸는 8가지'(훅 머리말)에 걸리는지 보는 부분이다.
#   훅 본체가 이 파일을 source 하면 `_RO_BASH_PY` 에 Python 본문이 담기고, 본체 판정기가 그것을 자기 이름공간에서 exec 한다
#   (block·write_why·ti·HAS_CD 등 본체 이름을 그대로 쓴다). 이 파일이 없으면 본체가 표식 세션의 Bash 를 막는다(fail-closed).
# 놓이는 곳: 훅 형제 `lib/`(SSoT `.claude/hooks/lib/` · 미러 `~/.claude/hooks/lib/` — forge-sync HOOKS_ALLOWLIST 에 등재).
# 재현: bash shared/scripts/tests/readonly-session-guard.test.sh
export _RO_LIB="${BASH_SOURCE[0]%/*}"   # 판정부가 명령 해석 정본(이 폴더의 cmd_targets.py)을 읽는 자리(#3275 F) — source 할 때마다 덮어쓴다(바깥 값을 믿지 않는다)
read -r -d '' _RO_BASH_PY <<'PY' || true
SUBS, REDIRS = [], []
def split(s):
    """따옴표를 아는 조각 나누기 — 조각 목록. $(...)·백틱·<(...) 안은 SUBS 로, > 대상은 REDIRS 로."""
    segs, cur, q, i, n = [], [], None, 0, len(s)
    while i < n:
        c = s[i]
        if q == "'":
            cur.append(c); q = None if c == "'" else q; i += 1; continue
        if c == "\\" and i + 1 < n:
            cur.append(s[i:i + 2]); i += 2; continue
        if c == "`":
            j = s.find("`", i + 1); j = n if j < 0 else j
            SUBS.append(s[i + 1:j]); cur.append(" _SUB_ "); i = j + 1; continue
        if s.startswith("$(", i) or (q is None and s[i:i + 2] in ("<(", ">(")):
            depth, j = 1, i + 2
            while j < n and depth:
                depth += {"(": 1, ")": -1}.get(s[j], 0); j += 1
            SUBS.append(s[i + 2:j - 1]); cur.append(" _SUB_ "); i = j; continue
        if c == '"':
            q = None if q == '"' else '"'; cur.append(c); i += 1; continue
        if q is None and c == "'":
            q = "'"; cur.append(c); i += 1; continue
        if q is None and c == "<" and s.startswith("<<", i) and not s.startswith("<<<", i):
            m = re.match(r"<<-?\s*(['\"]?)(\w+)\1", s[i:])
            if m:
                tag = m.group(2); k = s.find("\n", i)
                end = re.search(r"(?m)^\s*" + re.escape(tag) + r"\s*$", s[k + 1:]) if k >= 0 else None
                body = s[k + 1:k + 1 + end.start()] if end else s[k + 1:] if k >= 0 else ""
                head = "".join(cur).split()
                if head and os.path.basename(head[0]) in ("bash", "sh", "zsh", "dash"):
                    SUBS.append(body)
                elif re.search(r"(?i)\b(psql|mysql|mariadb|sqlite3|mongosh|duckdb)\b", "".join(cur)):
                    SUBS.append("psql -c " + shlex.quote(body))
                cur.append(" "); rest = s[i + m.end():k] if k >= 0 else s[i + m.end():]
                s = s[:i] + " " + rest + "\n" + (s[k + 1 + end.end():] if end else ""); n = len(s); i += 1; continue
        if q is None and c == ">":
            _k = len(cur)   # #3664 — `2>…` 의 파일 번호는 낱말이 아니다(낱말 맨 앞에 붙은 숫자만 뗀다 · a2>x 의 2 는 그대로)
            while _k > 0 and cur[_k - 1].isdigit(): _k -= 1
            if _k < len(cur) and (_k == 0 or cur[_k - 1].isspace()): del cur[_k:]
            j = i + 1
            if j < n and s[j] in ">|": j += 1
            if j < n and s[j] == "&":
                cur.append(s[i:j + 1]); i = j + 1; continue
            m = re.match(r"\s*(\"[^\"]*\"|'[^']*'|[^\s;&|<>()]+)", s[j:])
            if m:
                REDIRS.append(m.group(1).strip("'\"")); cur.append(" "); i = j + m.end(); continue
        if q is None and c == "&" and (s[i - 1:i] == ">" or s[i + 1:i + 2] == ">"):
            cur.append(c); i += 1; continue
        if q is None and c in ";&|\n()":
            segs.append("".join(cur)); cur = []; i += 1; continue
        cur.append(c); i += 1
    segs.append("".join(cur))
    return [x for x in segs if x.strip()]

WRAP = {"sudo", "env", "command", "exec", "nohup", "time", "nice", "timeout", "xargs", "stdbuf", "builtin", "!", "{", "}", "then", "do", "else", "if", "while", "until"}
SHELLS = {"bash", "sh", "zsh", "dash"}
INTERP = SHELLS | {"python", "python3", "node", "perl", "ruby"}
OPTVAL = {**{s: {"--rcfile", "--init-file"} for s in SHELLS}, "python": {"-X", "-W"}, "python3": {"-X", "-W"}, "node": {"-r", "--require"}}   # 값을 따로 받는 인터프리터 옵션(#3692 · 셸 -o·-O 묶음은 아래에서)
DBC = {"psql", "mysql", "mariadb", "sqlite3", "mongosh", "duckdb", "clickhouse-client"}
SQL = re.compile(r"(?is)\b(insert\s+into|update\s+\S+\s+set|delete\s+from|alter\s+(table|database|schema|index)|drop\s+(table|database|schema|index|view)|truncate)\b")
GIT_W = {"commit", "push", "checkout", "switch", "stash", "reset", "merge", "rebase", "cherry-pick", "revert", "am", "apply", "pull",
         "add", "rm", "mv", "restore", "clean", "init", "clone", "update-ref", "notes", "filter-branch", "replace"}
GH_W = {"create", "edit", "delete", "close", "reopen", "comment", "merge", "ready", "review", "checkout", "transfer", "pin", "unpin", "lock",
        "unlock", "develop", "add", "remove", "set", "rerun", "cancel", "run", "enable", "disable", "clone", "fork", "sync", "upload",
        "item-add", "item-edit", "item-delete", "item-archive", "field-create", "field-delete", "link", "unlink", "copy", "rename", "archive", "unarchive"}
FILE_W = {"touch", "mkdir", "chmod", "chown", "truncate", "tee"}
FILE_DEL = {"rm", "rmdir", "unlink", "shred"}
FILE_W_LAST = {"mv", "cp", "ln", "install", "rsync"}
# 덧붙임 6·8·9 — 프로그램 이름으로 고르는 쓰기(데이터 · 실제 도구 이름은 shared/scripts 에서 실측 2026-10-15)
BUS_W = {"spawn", "drain", "drop"}                     # 방 열기·대기열·닫기(send 는 따로 — 읽기 질의만)
HARNESS = {"forge-update.sh", "forge-update-auto.sh", "register-forge-hooks.sh", "stage-batch-apply.sh", "stage-autoapply.sh", "team-room-open.sh",
           "pr-merge.sh", "forge-checkpoint-resume.sh", "handover-archive.sh", "handover-hygiene.sh", "auto-compact-checkpoint.py"}
SYNC_W = {"sync", "init", "remove", "prune", "sync-staging", "build-plugin"}   # forge-sync.mjs — status·diff·list·audit 는 읽기
# #3589 하네스 스크립트의 **읽기 모드**만 통과(감사 M-9 "읽기 명령은 막고" 앞뒤 불일치) — 스크립트 머리말이 "아무것도 바꾸지 않는다" 고 적은 꼴만.
#   (읽기 낱말 집합, 값 1개를 받는 읽기 옵션 집합). 다른 낱말이 하나라도 섞이면(--apply·--auto·대상 경로 등) 종전대로 막는다.
HARNESS_READ = {"register-forge-hooks.sh": ({"--verify"}, {"--hook"}),   # --verify 읽기 전용 점검 · --hook <이름> 은 --verify 를 함의
                "forge-update.sh": ({"--check"}, set())}                  # --check = 아무것도 바꾸지 않고 상태만 진단
# #3664 읽기 낱말과 함께일 때만 읽기로 보는 꾸밈 낱말 — 단독이면 세지 않는다(register-forge-hooks.sh --strict 만 주면 등록이 돈다)
HARNESS_READ_MOD = {"register-forge-hooks.sh": {"--strict"}}
# #3664 출력 갈래만 바꾸는 꼴(파일에 쓰지 않는다) — 2>&1 · 1>&2 · 2>/dev/null · &>/dev/null · >/dev/null. 파일로 보내는 > 는 REDIRS 가 따로 막는다
FD_ONLY = re.compile(r"(\d*>&\d+|(\d*|&)>>?/dev/null)")
def harness_read_ok(prog, args):
    if prog not in HARNESS_READ or any("$" in x or "_SUB_" in x for x in args):
        return False
    flags, valued = HARNESS_READ[prog]
    mods = HARNESS_READ_MOD.get(prog, set())
    i, seen = 0, False
    while i < len(args):
        if args[i] in flags:
            seen, i = True, i + 1; continue
        if args[i] in mods or FD_ONLY.fullmatch(args[i]):   # #3664 — 꾸밈 낱말·출력 갈래는 지나가되 읽기 근거로 세지 않는다
            i += 1; continue
        if args[i] in valued and i + 1 < len(args) and re.fullmatch(r"[\w.-]+", args[i + 1]):
            seen, i = True, i + 2; continue
        return False
    return seen
LEDGER_R = {"list", "issue-gaps", "suggest-close", "carry-scan", "handover-verdict", "extract"}   # carry-ledger.py 읽기 동사 — 이 밖은 막는다(허용 목록 · #2941)
LEDGER_END = {"add-from-handover", "sync-closed", "add"}   # #3793 /forge-end 장부 반영 동사(총괄 결정) — close·snooze·import·merge-driver·--apply 는 그대로 막는다
LEDGER_PREVIEW = {"backfill-issues", "backfill-scope", "fix-duplicates"}   # 기본 미리보기 — --apply(줄임 포함)가 없을 때만 읽기
HANDOVER_W = {"write", "learn-append", "refresh-index", "refresh-index-dir"}         # handover-manager.sh — read-latest·read-cross 는 읽기
DEPLOY = {"systemctl": {"start", "stop", "restart", "reload", "enable", "disable", "mask", "daemon-reload"}, "service": {"start", "stop", "restart", "reload"},
          "pm2": {"start", "stop", "restart", "reload", "delete"}, "kubectl": {"apply", "delete", "patch", "scale", "rollout", "create", "replace", "edit", "set", "drain"},
          "helm": {"install", "upgrade", "uninstall", "rollback"}, "terraform": {"apply", "destroy", "import"}, "tofu": {"apply", "destroy", "import"},
          "wrangler": {"deploy", "publish"}, "vercel": {"deploy", "--prod"}, "fly": {"deploy"}, "flyctl": {"deploy"}, "twine": {"upload"}}
PKG = {"npm", "pnpm", "yarn", "bun"}
PKG_R = {"ls", "list", "view", "outdated"}   # #3729 전역(-g)이어도 보기만 하는 하위 명령 — 맨 앞 낱말일 때만(옵션 값 자리에 숨긴 꼴은 막힘)
SYS_PKG = {"apt", "apt-get", "dnf", "yum", "brew", "snap", "pipx"}
FIX_OPTS = {"--fix", "--apply", "--prune", "--repair", "--autofix"}
DIAG = re.compile(r"(audit|doctor|scan|insights)")
WORK_RE = re.compile(r"(고쳐|수정해|구현해|만들어|추가해|바꿔|머지해|커밋해|푸시해|PR\s*(을|를)?\s*(만들|올려|열어)|적용해|삭제해|지워|배포해|착수해|진행해)")
OPTARG = {"-u", "--unset", "-C", "--chdir", "-s", "--signal", "-k", "--kill-after", "-n", "-I", "-L", "-P", "-d", "-a", "-E", "-g", "-o", "-i", "-e"}
READ_CMDS = {"grep", "rg", "cat", "ls", "find", "echo", "printf", "git", "gh", "less", "head", "tail", "sed", "awk", "wc", "sort", "diff"}
cmd = str(ti.get("command") or "")
ALL = cmd

def nocomment(s):
    """bash 처럼 낱말 **맨 앞**의 `#` 부터만 주석으로 버린다 — 낱말 중간 `a#b` 는 글자다(#2957 조건 2)."""
    q, i = None, 0
    while i < len(s):
        c = s[i]
        if c == "\\" and q != "'":
            i += 2; continue
        if q:
            q = None if c == q else q
        elif c in "'\"":
            q = c
        elif c == "#" and (i == 0 or s[i - 1].isspace()):
            return s[:i]
        i += 1
    return s

# #3579 닫기는 날 `gh issue close` 가 아니라 `issue-verify.sh <N> --repo o/r --post`(확인 방법 PASS 일 때만 스스로 닫는다)로만.
# #3782 읽기 세션도 이슈 수정은 언제든(사람 지시 2026-10-26 · 총괄 결정) — 모든 이슈의 고치기(본문·제목·라벨·마일스톤·담당자)·코멘트·다시 열기.
#   닫기 예외 1개 = 착수 전 확인(#3747) 무효 표식이 있는 이슈의 `--reason "not planned"`. 그 밖의 닫기는 issue-verify.sh --post 로만.
GH_OK = {"comment": {"-b", "--body", "-F", "--body-file"},
         "edit": {"-b", "--body", "-F", "--body-file", "-t", "--title", "--add-label", "--remove-label", "-m", "--milestone",
                  "--remove-milestone", "--add-assignee", "--remove-assignee"},
         "reopen": {"-c", "--comment"}, "close": {"-r", "--reason", "-c", "--comment"}}
def precheck_invalid(num, repo):
    """#3782 그 이슈의 마지막 착수 전 확인 표식(`<!-- precheck: result=… -->` · issue-precheck.py)이 invalid(무효)인가 — 코멘트를 못 읽으면 막는다(판정 불가 · 훅 마감 10초 안에 5초)."""
    try:
        r = subprocess.run(["gh", "issue", "view", num, "--json", "comments"] + (["-R", repo] if repo else []),
                           cwd=cwd, capture_output=True, text=True, timeout=5)
        cs = json.loads(r.stdout)["comments"] if r.returncode == 0 else None
        found = re.findall(r"<!-- precheck: result=(\w+) -->", "\n".join(c.get("body") or "" for c in cs)) if cs is not None else None
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError, AttributeError):
        found = None
    if found is None:
        block(f"gh issue close {num} — 코멘트를 못 읽어 착수 전 확인 무효인지 판정 불가(#3782)")
    return found[-1:] == ["invalid"]

def plain_call(args, wraps):
    """#3085 qa H1 · #3883 qa H1 — 쓰기 예외 세 길(gh issue·issue-verify --post·gh api)이 함께 쓰는 꼴 검사: 인자에 $·$(…) 없음 ·
    감싸기(xargs·timeout·env 등)·앞머리 할당·cd·레포 env 없음. 쓰는 레포·인자가 판정한 것과 달라질 수 있으면 False."""
    return not (any("$" in x or "_SUB_" in x for x in args) or wraps or re.search(r"(^|[;&|(`\s'\"])(cd|pushd)\s", ALL)
                or re.search(r"\b(GH_REPO|GH_HOST|GIT_DIR|GIT_WORK_TREE)\b", ALL))

def role_issue_ok(args, wraps):
    """#3026 · #3579 · #3782 — 읽기 세션의 이슈 수정 예외(한 규칙): 모든 이슈의 고치기(edit)·코멘트·다시 열기 · 닫기는 착수 전 확인 무효 표식이 있을 때
    `--reason "not planned"` 하나만. 꼴 = `gh issue <동사> <번호|이슈 URL> [-R r] [허용 옵션]` · 인자에 $·$(…) 없음.
    모르는 옵션·번호 2개·그 밖 동사(create·delete·transfer 등)·감싸기·cd·레포 env 는 False(막는다)."""
    if not plain_call(args, wraps):
        return False   # 라벨을 읽는 레포 ≠ 쓰는 레포일 수 있다(감싸기·앞머리 할당·cd·레포 env) — #3085 qa H1
    repo, opts, pos, i = "", [], [], 0
    while i < len(args):
        x = args[i]
        if x in ("-R", "--repo"):
            repo, i = (args[i + 1] if i + 1 < len(args) else ""), i + 2; continue
        if x.startswith("-"):
            k, eq, v = x.partition("=")
            if not eq:
                v, i = (args[i + 1] if i + 1 < len(args) else ""), i + 1
            opts.append((k, v)); i += 1; continue
        pos.append(x); i += 1
    if len(pos) != 3 or pos[0] != "issue" or pos[1] not in GH_OK or not re.fullmatch(r"\d+|https://github\.com/[\w.-]+/[\w.-]+/issues/\d+", pos[2]):
        return False
    if any(k not in GH_OK[pos[1]] for k, _ in opts) or (pos[1] == "edit" and not opts):
        return False
    if pos[1] == "close":
        return [v for k, v in opts if k in ("-r", "--reason")] == ["not planned"] and precheck_invalid(pos[2], repo)
    return True

def verify_post_ok(args, wraps):
    """#3579 닫기 — `issue-verify.sh <번호> --repo <o/r> --post` 꼴 하나만 · 모든 이슈(#3782 · 확인 방법 PASS 면 그 스크립트가 닫는다).
    --repo 필수(라벨을 읽는 레포 = 쓰는 레포) · 다른 옵션·번호 2개·$·감싸기·cd·레포 env 는 False."""
    if not plain_call(args, wraps):
        return False
    repo, pos, i = "", [], 0
    while i < len(args):
        if args[i] == "--repo" and i + 1 < len(args):
            repo, i = args[i + 1], i + 2; continue
        if args[i] == "--post":
            i += 1; continue
        if args[i].startswith("-"):
            return False
        pos.append(args[i]); i += 1
    if len(pos) != 1 or not re.fullmatch(r"\d+", pos[0]) or not re.fullmatch(r"[\w.-]+/[\w.-]+", repo):
        return False
    return True

API_W = ((r"issues/\d+", {"PATCH"}), (r"issues/\d+/comments", {"POST"}), (r"issues/\d+/labels(/[^/?#\s]+)?", {"POST", "PUT", "DELETE"}),
         (r"milestones", {"POST"}), (r"milestones/\d+", {"PATCH"}))   # #3782 열린 gh api 쓰기(총괄 결정) — pulls·merges·git refs·contents·graphql mutation 은 그대로 막는다
API_VAL = {"-X", "--method", "-f", "-F", "--field", "--raw-field", "-H", "--header", "-q", "--jq", "-t", "--template", "--cache"}
API_BOOL = {"--paginate", "--slurp", "-i", "--include", "--silent", "--verbose"}
def issue_not_pr(ep):
    """#3883 qa H3 — `issues/<N>` 끝점은 PR 번호에도 통한다. 그 번호가 이슈인지 1회 조회 — PR 이거나 못 읽으면 막는다(판정 불가 · 훅 마감 10초 안에 5초)."""
    try:
        r = subprocess.run(["gh", "api", ep, "--jq", 'has("pull_request")'], cwd=cwd, capture_output=True, text=True, timeout=5)
        ok = r.returncode == 0 and r.stdout.strip() == "false"
    except (OSError, subprocess.SubprocessError):
        ok = False
    if not ok:
        block(f"gh api {ep} — PR 번호이거나 이슈인지 못 읽음(issues/<N> 끝점은 PR 에도 통한다 · 읽기 세션은 이슈만 · #3782)")
    return True

def api_issue_ok(args, meth, wraps):
    """#3782 `gh api repos/<o>/<r>/<끝점> [-X 메서드] [-f/-F 키=값]…` 가 API_W 의 (끝점, 메서드) 하나에 맞는가 · issues/<N> 은 이슈 번호일 때만(issue_not_pr).
    이슈 PATCH 의 state·state_reason(닫기·다시 열기는 위 길로)·--input(본문을 못 본다)·--hostname·메서드를 바꾸는 머리말·모르는 옵션·끝점 2개·
    값 없는 옵션(마지막 토큰)·$·$(…)·..·감싸기·cd·레포 env(plain_call) 는 False."""
    if not plain_call(args, wraps):
        return False
    a, ep, keys, i = (args[args.index("api") + 1:] if "api" in args else []), [], [], 0
    while i < len(a):
        x = a[i]; k, eq, v = x.partition("=")
        if (x.startswith("-X") and len(x) > 2) or x.startswith("--method="):
            i += 1; continue
        if x.startswith("--") and eq and k in API_VAL:
            val = v
        elif x in API_VAL:
            if i + 1 >= len(a):
                return False   # #3883 qa H1 — 값 자리가 비면 셸(xargs 등)이 뒤에 무엇을 붙일지 모른다
            val, i = a[i + 1], i + 1
        elif x in API_BOOL:
            i += 1; continue
        elif x.startswith("-"):
            return False
        else:
            ep.append(x); i += 1; continue
        if k in ("-f", "-F", "--field", "--raw-field"):
            keys.append(val.split("=", 1)[0].split("[", 1)[0])
        elif k in ("-H", "--header") and re.search(r"(?i)override", val):
            return False
        i += 1
    if len(ep) != 1 or ".." in ep[0] or any("$" in x or "_SUB_" in x for x in ep + keys):
        return False
    m = re.fullmatch(r"/?(repos/(?:[\w.-]+|\{owner\})/(?:[\w.-]+|\{repo\}))/(.+)", ep[0])
    for pat, meths in API_W if m else ():
        if re.fullmatch(pat, m.group(2)) and meth in meths:
            if pat == r"issues/\d+" and set(keys) & {"state", "state_reason"}:
                return False
            n = re.match(r"issues/(\d+)", m.group(2))
            return not n or issue_not_pr(f"{m.group(1)}/issues/{n.group(1)}")
    return False

def room_mode(name):
    """#3726 방 기록(session-bus.jsonl)의 mode 칸 — 버스 `_reg_get_mode`(lib/bus-registry.sh)와 같은 규칙(첫 같은 이름 줄) · 없거나 못 읽으면 ''(막는다)."""
    reg = os.path.join(os.environ.get("FORGE_BUS_STATE_DIR") or os.path.join(home, ".claude", "state"), "session-bus.jsonl")
    try:
        with open(reg, encoding="utf-8") as f:
            for ln in f:
                try:
                    d = json.loads(ln)
                except ValueError:
                    continue
                if isinstance(d, dict) and d.get("name") == name:
                    return str(d.get("mode", ""))
    except OSError:
        pass
    return ""

def bus_plain(args, wraps):
    """#3726 방 기록·방 권한을 바꿀 수 있는 꼴이 없는가 — plain_call(감싸기·앞머리 할당·cd·$·레포 env) + FORGE_BUS_*·FORGE_ROOM_*·HOME 대입."""
    return plain_call(args, wraps) and not re.search(r"\b(FORGE_BUS_\w*|FORGE_ROOM_\w*)\b|\bHOME\s*=", ALL)

ROOM_OPEN_VAL = {"--room", "--project", "--task-file"}
ROOM_OPEN_BOOL = {"--detach", "--dry-run"}
def room_open_read_ok(args, wraps):
    """#3726 `team-room-open.sh <slug> --room <방> --mode read [--project p] [--task-file f] [--detach] [--dry-run]` 하나만 —
    읽기 방은 쓰기 권한·쓰기 도구를 스스로 거부한다(team-room-open.sh --mode read 절). --mode write·없음·--cwd·--worktree·모르는 옵션·bus_plain 밖은 False."""
    if not bus_plain(args, wraps):
        return False
    pos, mode, room, i = [], "", "", 0
    while i < len(args):
        x = args[i]
        if x == "--mode" and i + 1 < len(args):
            mode, i = args[i + 1], i + 2; continue
        if x in ROOM_OPEN_VAL and i + 1 < len(args) and re.fullmatch(r"[\w./~-]+", args[i + 1]):
            room, i = (args[i + 1] if x == "--room" else room), i + 2; continue
        if x in ROOM_OPEN_BOOL or FD_ONLY.fullmatch(x):
            i += 1; continue
        if x.startswith("-"):
            return False
        pos.append(x); i += 1
    return mode == "read" and bool(room) and len(pos) == 1 and re.fullmatch(r"[\w.-]+", pos[0]) is not None

def read_room_brief(args, wraps):
    """#3726 `forge-session-bus.sh send <방> "<브리프>"`·`send <방> - < 파일`(--ask 없음) — 대상 방의 방 기록 mode 가 read 이고 bus_plain 일 때만 True.
    쓰기 방·mode 없음(옛 기록·방 없음)·방 이름 꼴 밖은 False(아래 읽기 질의 판정대로 막는다)."""
    q = [x for x in args[args.index("send") + 1:] if not x.startswith("-")]
    return "--ask" not in args and bool(q) and re.fullmatch(r"[\w.-]+", q[0]) is not None and bus_plain(args, wraps) \
        and room_mode(q[0]) == "read"   # MUT-ROOM-MODE

def _var(x):   # #3730 토큰이 `$이름`·`${이름}` 이고 그 이름이 VARS(맨 앞 글자 그대로 대입)에 있으면 값으로 — 아니면 그대로
    m = re.fullmatch(r"\$(?:(\w+)|\{(\w+)\})", x)
    return VARS.get(m.group(1) or m.group(2), x) if m else x
def check(seg, whole):
    try:
        t = shlex.split(nocomment(seg))
    except ValueError:
        block("명령을 읽지 못함(따옴표)")
    t = [_var(x) for x in t]
    wrapped, last, wraps = False, "", set()
    while t:
        if t[0] in WRAP or re.fullmatch(r"\w+=.*", t[0]):
            wrapped = wrapped or t[0] in WRAP; last = t[0] if t[0] in WRAP else last; wraps.add(t[0]); t = t[1:]
        elif wrapped and t[0].startswith("-"):
            t = t[2:] if t[0] in OPTARG else t[1:]
        elif last == "timeout" and re.fullmatch(r"[\d.]+[smhd]?", t[0]):
            t, last = t[1:], ""
        else:
            break
    if not t:
        return
    name = os.path.basename(os.path.expandvars(t[0]))
    if "$" in name or "_SUB_" in name:
        block(f"셸이 만드는 명령 이름({t[0]})")
    if name in SHELLS:
        a, cf = t[1:], False
        while a and a[0][:1] in "-+" and a[0] not in ("-", "--"):
            x, a = a[0], a[1:]
            cf = cf or (x[:1] == "-" and x[1:2] != "-" and "c" in x[1:])
            if x in ("--rcfile", "--init-file") or (x[1:2] != "-" and set(x[1:]) & {"o", "O"}):
                a = a[1:]
        if cf:
            a = a[1:] if a[:1] == ["--"] else a
            return SUBS.append(a[0]) if a else None
    if name == "eval":   # #3355 B H2 — 문서 그대로의 `eval "$HL_OUT"` 는 착지 대입으로 판정(_HL_EVAL · 아래 펼침 조건일 때만)
        return SUBS.append(_HL_EVAL if _HL_EVAL is not None and t[1:] == ["$HL_OUT"] else " ".join(t[1:]))
    prog, args = name, t[1:]
    if name in ("source", ".") and args:
        prog, args = os.path.basename(args[0]), args[1:]
    if name in INTERP:
        stop = ("-c",) if name in SHELLS else ("-c", "-e", "-m")   # #3700 qa H2 — 셸 -e·-m 은 옵션이다(코드 문자열이 아니다 · `bash -e <쓰기 스크립트>` 가 지나갔다)
        while args and args[0].startswith("-") and args[0] not in stop:
            x, args = args[0], args[1:]
            if x in OPTVAL.get(name, ()) or (name in SHELLS and x[1:2] not in ("-", "") and set(x[1:]) & {"o", "O"}):   # #3692 값까지 건너뛴다(값이 이름이 되던 길)
                args = args[1:]
        if args and args[0] == "-m":   # #3621 qa H1 — 모듈 실행은 파일 실행과 같은 이름으로 판정(`-m issue_verify` 가 `issue_verify.py` 검사를 지나갔다)
            args = args[1:]
            if args[:1] == ["runpy"]:   # `-m runpy <파일|모듈>` — 그 대상이 프로그램
                args = args[1:]
            if args and not args[0].startswith("-"):
                m = args[0]
                prog = os.path.basename(m) if (m.endswith(".py") or "/" in m) else m.rsplit(".", 1)[-1] + ".py"   # MUT-MODULE-PY
                args = args[1:]
        elif args and not args[0].startswith("-"):
            prog, args = os.path.basename(args[0]), args[1:]
    if prog in ("npx", "pnpx", "bunx") or (prog in PKG and args[:1] in (["exec"], ["dlx"])):
        args = args[1:] if prog in PKG else args
        while args and args[0].startswith("-"):
            args = args[1:]
        if args:
            prog, args = os.path.basename(args[0]), args[1:]
    if prog != name and ("$" in prog or "_SUB_" in prog):
        block(f"셸이 만드는 실행 파일 이름({prog})")
    full = " ".join(t)
    if prog in DBC and SQL.search(ALL):
        block(f"DB 쓰기 SQL ({prog})")
    if (prog not in READ_CMDS and any(re.fullmatch(r"(db:)?migrat(e|ion)(:[\w-]+)?", a) for a in [prog] + args)) or re.search(r"migrat\w*\.sh$", prog) \
            or (prog == "alembic" and set(args) & {"upgrade", "downgrade"}) or (prog == "prisma" and "push" in args):
        block("DB 마이그레이션")
    if re.fullmatch(r"db-patch.*\.sh", prog) and "apply" in args:
        block(prog + " apply")
    if prog == "git":
        a = list(args)
        while a and a[0].startswith("-"):
            a = a[2:] if a[0] in ("-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--attr-source") else a[1:]   # #3723 qa H1 띄어 쓴 값
        sub, rest = (a[0] if a else ""), a[1:]
        flags = {x for x in rest if x.startswith("-")}
        pos = [x for x in rest if not x.startswith("-")]
        cfg = any(x in ("-c", "--config-env") or x.startswith(("--config-env=", "--exec-path")) for x in args[:len(args) - len(a)])
        ffo = sub == "pull" and "--ff-only" in flags and flags <= {"--ff-only", "-q", "--quiet", "-v", "--verbose"} \
            and len(pos) <= 2 and not any(":" in p or p.startswith("+") for p in pos) and not cfg   # #3721 fast-forward 전용 pull 만(작업 파일을 덮지 않는다)
        if (sub in GIT_W and not ffo) or (sub == "worktree" and rest[:1] and rest[0] != "list") \
                or (sub == "branch" and (flags & {"-d", "-D", "-m", "-M", "-c", "-C", "-f", "--delete", "--move", "--copy", "--force", "-u", "--set-upstream-to", "--unset-upstream", "--edit-description"} or (pos and not flags & {"-l", "--list", "--contains", "--merged", "--no-merged", "--points-at"}))) \
                or (sub == "tag" and pos and not flags & {"-l", "--list"}) or (sub == "config" and pos[1:] and not flags & {"--get", "--get-all", "-l", "--list", "--get-regexp"}):
            block(f"git {sub}")
    if prog in ("gh", "gh-q.sh"):
        g, i = [], 0
        while i < len(args):
            if args[i] in ("-R", "--repo"):
                i += 2; continue
            if not args[i].startswith("-"):
                g.append(args[i])
            i += 1
        if g[:1] == ["api"]:
            meth, fields, i = "", False, 0
            while i < len(args):
                x = args[i]
                if x in ("-X", "--method") and i + 1 < len(args):
                    meth = args[i + 1].upper(); i += 1
                elif x.startswith("-X") and len(x) > 2:
                    meth = x[2:].upper()
                elif x.startswith("--method="):
                    meth = x.split("=", 1)[1].upper()
                elif x in ("-f", "-F", "--field", "--raw-field", "--input") or x.startswith(("--field=", "--raw-field=", "--input=")):
                    fields = True
                i += 1
            gql = "graphql" in g[1:2]
            if not gql and api_issue_ok(args, meth or ("POST" if fields else ""), wraps):   # #3782 이슈·라벨·마일스톤 끝점만
                return
            if meth in ("POST", "PATCH", "PUT", "DELETE") and not (gql and not re.search(r"(?i)\bmutation\b", full)):
                block(f"gh api {meth}")
            if not meth and fields and not gql:
                block("gh api 필드 → POST")
            if gql and re.search(r"(?i)\bmutation\b", full):
                block("gh api graphql mutation")
        elif len(g) >= 2 and g[1] in GH_W:
            if prog == "gh" and role_issue_ok(args, wraps):
                return
            block(f"gh {g[0]} {g[1]} — 읽기 세션은 이슈 고치기·코멘트·다시 열기만 · 닫기는 issue-verify.sh <N> --repo o/r --post(착수 전 확인 무효면 --reason \"not planned\" · #3579·#3782)")
    if prog == "issue-verify.sh" and "--post" in args and not verify_post_ok(args, wraps):
        block("issue-verify.sh --post — 읽기 세션은 꼴 `issue-verify.sh <N> --repo o/r --post` 하나만(#3579·#3782)")
    if prog == "forge-session-bus.sh":   # 덧붙임 7 — 방에는 읽기 질의만(send --ask <방> "질문" 하나로)
        if set(args) & BUS_W:
            block("방 열기·닫기·대기열(" + "·".join(sorted(set(args) & BUS_W)) + ")")
        if "send" in args and not read_room_brief(args, wraps):   # #3726 읽기 방엔 브리프 — 그 밖은 읽기 질의만
            q = [x for x in args[args.index("send") + 1:] if not x.startswith("-")]
            if "--ask" not in args:
                block("방 send — 읽기 세션은 읽기 질의만(send --ask <방> \"질문\")")
            if "-" in args or len(q) != 2 or not whole:
                block("읽기 질의는 질문을 명령 줄에 그대로 하나로(send --ask <방> \"질문\") — stdin·이어붙임·$(...) 안 됨")
            if WORK_RE.search(q[1]):
                block(f"읽기 질의에 일 시키는 말({WORK_RE.search(q[1]).group(0)}) — 고칠 일은 issue-new.sh 로 등록")
    if prog in ("bundle-report.sh", "bundle_report.py") and set(args) & {"--post", "--sync", "--qa-status"}:   # #3663 — 본체 직접 호출도 래퍼와 같은 판정
        block(prog + " " + " ".join(sorted(set(args) & {"--post", "--sync", "--qa-status"})))
    # #3782 bundle-report.sh·bundle-init.py --init(마일스톤·허브 만들기)은 읽기 세션도 한다 — 종전 #3692 막음을 걷었다
    verb = next((x for x in args if not x.startswith("-")), "")   # 첫 위치 인자 = 서브커맨드(없으면 --help 등)
    if prog == "carry-ledger.py" and verb and verb not in LEDGER_R | LEDGER_END and not (   # MUT-LEDGER-ALLOW
            verb in LEDGER_PREVIEW and not any(len(x.split("=")[0]) > 2 and "--apply".startswith(x.split("=")[0]) for x in args)):
        block("carry-ledger.py 쓰기(작업 세션 장부)")
    _hpos = [x for x in args if not x.startswith("-")]   # #3355 B — 착지 폴더(절대경로) refresh-index-dir 만 통과
    if prog == "handover-manager.sh" and set(args) & HANDOVER_W and not (
            _hpos[:1] == ["refresh-index-dir"] and len(_hpos) == 2 and os.path.isabs(_hdir := os.path.expandvars(os.path.expanduser(_hpos[1]))) and landing(RP(_hdir))):   # #3732 `~/…` 도 셸처럼 푼다
        block("handover-manager.sh 쓰기(작업 세션 handover)")
    if (prog in HARNESS and not harness_read_ok(prog, args) and not (prog == "team-room-open.sh" and room_open_read_ok(args, wraps))) or (prog == "forge-sync.mjs" and set(args) & SYNC_W) or (prog == "apply.py" and "--apply" in args):
        block(f"{prog} — 하네스·세션 설정을 바꾼다")
    if prog == "issue_verify.py":   # #3589(PR #3581 검수 지적) — 본체를 직접 부르면 issue-verify.sh --post 꼴 검사(verify_post_ok)를 지나 남의 이슈도 닫는다
        block("issue_verify.py 직접 호출 — 읽기 세션은 issue-verify.sh <N> --repo o/r [--post] 로만(#3589)")
    if prog == "session-mode.sh":
        a = args[1:] if args[:1] == ["get"] else args[2:] if args[:2] == ["set", "readonly"] else None
        if a is None or not (a == [] or (len(a) == 2 and a[0] == "--session")) or "xargs" in wraps or any("$" in x or "_SUB_" in x for x in args):
            block("읽기 전용 표식 지우기·다른 모드로 바꾸기(#3026) — 읽기 세션은 get · set readonly 만")
    if prog.startswith("forge-deploy") or (prog in DEPLOY and set(args) & DEPLOY[prog]) or (prog in PKG and "publish" in args[:1]):
        block(f"배포·릴리스·인프라({prog})")
    if (prog in PKG and set(args) & {"-g", "--global"} and args[0] not in PKG_R) or (prog == "yarn" and args[:1] == ["global"]) or (prog in SYS_PKG and set(args) & {"install", "remove", "uninstall", "upgrade"}) \
            or (prog == "cargo" and args[:1] == ["install"]) or (prog == "dotnet" and args[:2] == ["tool", "install"] and set(args) & {"-g", "--global"}):
        block(f"전역 설치({prog}) — 테스트용 프로젝트 설치만 된다")
    if set(args) & FIX_OPTS or (DIAG.search(prog) and set(args) & {"--auto", "--write"}) or (prog in PKG and args[:2] == ["audit", "fix"]) \
            or (prog == "prettier" and set(args) & {"--write", "-w"}):
        block(f"{prog} 의 고치는 옵션 — 찾은 것은 이슈 등록으로")
    if prog == "issue-new.sh":
        kind = args[args.index("--kind") + 1] if "--kind" in args[:-1] else ""
        if ("--doing" in args or any(re.search(r"status:doing", x) for x in args)) and not (kind in ("조사", "테스트") and "--bug" not in args):
            block("issue-new.sh --doing(등록만 된다 · 착수는 작업 세션 · 읽기 세션은 --kind 조사·테스트만 · #3023)")
    if prog in ("issue-new.sh", "engine-report.sh") and not whole:
        block(f"{prog} 를 다른 명령과 이어붙임 — 명령 하나로만")
    if name in ("sed", "perl") and any(x.startswith("--in-place") or re.fullmatch(r"-[a-zA-Z]*i\S*", x) for x in t[1:] if x.startswith("-") and not x.startswith("-e")):
        block(f"{name} -i")
    if name == "patch":
        block("patch — 파일 고치기")
    opts = [x for x in args if not x.startswith("-")]
    for x in opts if name in FILE_W else []:
        if write_why(x):
            block(f"{name} {x} — {write_why(x)}")
    for x in opts if name in FILE_DEL else []:
        if write_why(x, delete=True):
            block(f"{name} {x} — {write_why(x, delete=True)}")
    if name in FILE_W_LAST and opts:
        for x in opts[:-1] if name == "mv" else []:
            if write_why(x, delete=True):
                block(f"mv {x} — {write_why(x, delete=True)}")
        if write_why(opts[-1]):
            block(f"{name} → {opts[-1]} — {write_why(opts[-1])}")
    if name == "dd" and any(x.startswith("of=") and write_why(x[3:]) for x in args):
        block("dd of=")

# #3355 B H2 — 문서(forge-end §1·§4 · forge-checkpoint §4) 착지 줄 그대로면 $HL_OUT·$HANDOVER_DIR·$CHECKPOINT_DIR 를 착지 정본(hl)으로 펼친다.
#   그 이름을 따로 만지는 꼴(다른 대입·eval·source·declare·read·export·printf -v·${!…}·`. 파일`)이 하나라도 있으면 펼치지 않는다 — 종전대로 막힘.
_HL_EVAL, _rest = None, cmd
for _x in ('HL_OUT="$(bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-landing.sh" "$(pwd)" 2>/dev/null)"',
           'HL_OUT="$(MSYS2_ARG_CONV_EXCL=\'*\' wsl -e bash -lc \'bash "${FORGE_ROOT:-$HOME/forge}/shared/scripts/handover-landing.sh" "$(pwd)"\' 2>/dev/null)"',
           'HL_OUT=\'HANDOVER_DIR="${FORGE_OUTPUTS:-$HOME/forge-outputs}/.claude/handover"; IS_WORKTREE=unknown; LANDING_REASON=landing-script-unavailable\'',
           'eval "$HL_OUT"'):
    _rest = _rest.replace(_x, " ")
if re.search(r"HL_OUT|HANDOVER_DIR|CHECKPOINT_DIR", cmd) and hl() and not re.search(
        r"(HL_OUT|HANDOVER_DIR|CHECKPOINT_DIR|IS_WORKTREE|LANDING_REASON)\s*\+?=|\beval\b|\$\{!|(^|[^\w./-])(source|declare|typeset|export|local|"
        r"readonly|read|mapfile|readarray|printf|let|getopts|unset|set|alias|function|trap)\b|(^|[;&|(\s])\.\s", _rest):
    for _k, _v in hl().items():
        os.environ[_k] = _v
    _HL_EVAL = "; ".join(f"{_k}={shlex.quote(_v)}" for _k, _v in hl().items())
# #3730 — 맨 앞 `이름=글자그대로 ;`(또는 && · 줄바꿈) 대입만 VARS 로 펼친다. 앞에서 두 번 대입했거나, 뒤에서 그 이름을 다시 대입·for/select·
#   read·export·eval·${!…}·source 류로 만지면 펼치지 않는다 — 종전대로 '셸이 만드는 명령 이름'으로 막힘.
VARS = {}
_vm = re.match(r"\s*((?:[A-Za-z_]\w*=[\w./+-]+\s*(?:;|&&|\n)\s*)+)", cmd)
if _vm:
    _vrest = cmd[_vm.end():]
    for _k, _v in re.findall(r"([A-Za-z_]\w*)=([\w./+-]+)", _vm.group(1)):
        VARS[_k] = None if _k in VARS else _v
    for _k in list(VARS):
        if VARS[_k] is None or re.search(r"\b%s\s*(\[|\+?=)|\b(for|select)\s+%s\b|\beval\b|\$\{!|(^|[^\w./-])(source|declare|typeset|export|local|"
                                         r"readonly|read|mapfile|readarray|printf|let|getopts|unset|set|alias|function|trap)\b|(^|[;&|(\s])\.\s" % (_k, _k), _vrest):
            del VARS[_k]
if re.search(r"\bIFS\b", cmd):   # #3730 qa — IFS 를 만지면 펼친 값이 셸에서 여러 낱말로 쪼개진다(`A=git.push; IFS=.; $A`) → 아무것도 펼치지 않는다
    VARS = {}
queue = split(cmd)
whole = len(queue) == 1 and not SUBS
ALL = cmd + "\n" + "\n".join(SUBS)
k = done = 0
while k < len(queue) and k < 200:   # 조각을 판정하며 $(...)·bash -c·eval 속을 이어 붙여 판정한다
    check(queue[k], whole and k == 0); k += 1
    while done < len(SUBS):
        queue += split(SUBS[done]); done += 1; ALL = cmd + "\n" + "\n".join(SUBS)
if k < len(queue):
    block("명령이 너무 깊게 겹침")
# #3275 F — 명령 해석 정본(lib/cmd_targets.py)으로 한 번 더 판정한다. 위 split() 판정을 통과한 명령만 여기 온다 —
#   둘 중 하나라도 막으면 막는다(결정 ㉰ ① 호환층 · #3326 승인 뒤 split() 을 지운다). 정본은 $( )·백틱·<( ) 속 명령도 조각으로 꺼내고,
#   heredoc 본문은 셸 머리(bash·sh…)일 때만 명령으로 다시 쪼갠다(위 split() 과 같은 범위). 출력 리다이렉트는 낱말에서 빼고 대상만 REDIRS 로.
#   못 읽으면(lib 없음·예외) 위 판정만 남는다(종전과 같다).
CT = None
if os.environ.get("_RO_LIB"):
    sys.path.insert(0, os.environ["_RO_LIB"])
    try:
        import cmd_targets as CT
    except Exception:
        CT = None
    del sys.path[0]
if CT is not None:
    _OUTR = re.compile(r"^\d*(&>>?|>>?|>\||>&)$")
    def _ct_segs(src, depth):
        out = []
        for g in CT.split_segments(src):
            ws, skip = [], False
            for raw, w in zip(g["raw"], g["words"]):
                if skip:
                    skip = False
                    continue
                if raw[:1] not in "'\"" and _OUTR.match(raw):
                    skip = True
                    continue
                if raw[:1] not in "'\"" and re.match(r"^\d*(&>>?|>>?|>\|)", raw):
                    continue
                if not any(q in raw for q in "'\""):
                    w = re.sub(r"\\(.)", r"\1", w)
                ws.append(w.replace(CT._SUBST, " _SUB_ "))
            # 리다이렉트·tee 대상만 — writes 의 cp·mv·dd 인자(원본 포함)는 check() 가 목적지·of= 로 본다(#3430 H1)
            REDIRS.extend(CT.targets(" ".join("".join("\\" + CT._UNESC[ch] if ch in CT._UNESC else ch for ch in t) for t in g["raw"])))
            if ws:
                out.append(ws)
            if g.get("heredoc") and depth < 3 and os.path.basename(g.get("head") or "") in SHELLS:
                out += _ct_segs("\n".join(g["heredoc"]), depth + 1)
        return out
    try:
        _top = CT.split_segments(cmd)
        _cq = _ct_segs(cmd, 0)
    except Exception:
        _top, _cq = [], []
    _cwhole = len(_top) == 1 and not _top[0]["subst"] and not _top[0]["heredoc"]
    _ck, _cdone = 0, len(SUBS)
    while _ck < len(_cq) and _ck < 200:   # check() 가 bash -c·eval 속을 SUBS 에 더하면 그것도 정본으로 쪼개 이어 판정한다
        check(" ".join(shlex.quote(x) for x in _cq[_ck]), _cwhole and _ck == 0); _ck += 1   # 낱말 하나 = 토큰 하나(`HL_OUT=$(…)` 대입이 쪼개지지 않게)
        while _cdone < len(SUBS):
            try:
                _cq += _ct_segs(SUBS[_cdone], 0)
            except Exception:
                pass
            _cdone += 1; ALL = cmd + "\n" + "\n".join(SUBS)
    if _ck < len(_cq):
        block("명령이 너무 깊게 겹침")
for r in REDIRS:
    if write_why(r):
        block(f"> {r} — {write_why(r)}")
sys.exit(0)
PY
