import os, re, shlex, sys
cmd = os.environ.get("FDOB_CMD", "")
CT = None
if os.environ.get("FDOB_LIB"):   # 명령 해석 정본(#3275 E1) — 못 읽으면 옛 쪼개기만(아래 판정은 둘 다 돈다)
    sys.path.insert(0, os.environ["FDOB_LIB"])
    try:
        import cmd_targets as CT
    except Exception:
        CT = None
    del sys.path[0]
# _fdob_hs_r1 — 토큰 기준 판정 · 줄 끝 H1~H7 = #2278 지적 번호(그 줄이 막는 우회 꼴)
cmd = re.sub(r"\\\n[ \t]*", " ", cmd)   # H2 백슬래시 줄잇기를 한 줄로
lines, term = [], None                   # heredoc 본문은 그 줄(머리)에 붙인다
for ln in cmd.split("\n"):
    if term is not None:
        if ln.strip() == term:
            term = None
        else:
            lines[-1][1].append(ln)
        continue
    lines.append((ln, []))
    m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", ln)
    if m:
        term = m.group(1)
CLIENTS = {"psql", "mysql", "mariadb", "sqlite3", "mongosh", "mongo"}
DDL = re.compile(r"\b(ALTER\s+(TABLE|DATABASE|SCHEMA|COLUMN)|DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|COLUMN|CONSTRAINT)|TRUNCATE\s+TABLE|CREATE\s+(TABLE|DATABASE|SCHEMA|INDEX))\b", re.I)
SHOWC = re.compile(r"\bSHOW\s+CREATE\s+\w+", re.I)          # H6 조회는 DDL 이 아니다
ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
def has_ddl(text):
    return bool(DDL.search(SHOWC.sub(" ", text)))
def segments(line):
    """따옴표를 존중해 ; && || | & ( ) 로 쪼갠다 — [(토큰들, 앞 구분자)]. `#` 이후(주석)는 shlex 가 버린다(H5)."""
    try:
        lx = shlex.shlex(line, posix=True, punctuation_chars=";&|()")
        lx.whitespace_split = True
        segs, cur, sep = [], [], ""
        for tok in lx:
            if tok and set(tok) <= set(";&|()"):
                segs.append((cur, sep)); cur = []; sep = tok
            else:
                cur.append(tok)
        segs.append((cur, sep))
        return segs
    except ValueError:
        out, sep = [], ""
        for part in re.split(r"([;&|()]+)", line.split(" #")[0]):
            if re.fullmatch(r"[;&|()]+", part or "x"):
                sep = part
            else:
                out.append((part.split(), sep)); sep = ""
        return out
def segments_ct(line):
    """정본 해석(cmd_targets.split_segments) → segments() 와 같은 꼴 [(토큰들, 앞 구분자)] — 따옴표 벗긴 낱말 ·
    $( )·` ` 속 명령도 조각으로(실행된다) · 따옴표 없는 \\ 는 다음 글자. heredoc 본문은 위 lines 가 그 줄에 붙인다."""
    out = []
    for g in CT.split_segments(line):
        toks = []
        for raw, w in zip(g["raw"], g["words"]):
            if not any(q in raw for q in "'\""):
                w = re.sub(r"\\(.)", r"\1", w)
            toks.append(w)
        out.append((toks, g["sep"] if not g["subst"] else ""))
    return out
def strip_runner(toks):
    """명령 앞의 러너·접두를 벗긴다(H4): VAR=값 · sudo [-옵션 [값]] · env · time · nice · nohup · command · exec ·
    bundle exec · poetry|uv|pipenv run · pnpm|yarn dlx|exec · npm exec · npx|bunx|pnpx [--옵션]."""
    i, n = 0, len(toks)
    while i < n:
        t = toks[i]; b = os.path.basename(t)
        if ASSIGN.match(t) or b in ("env", "time", "nice", "nohup", "command", "exec"):
            i += 1
        elif b == "sudo":
            i += 1
            while i < n and toks[i].startswith("-"):
                i += 2 if toks[i] in ("-u", "-g", "-U", "-C", "-p") else 1
        elif b == "bundle" and i + 1 < n and toks[i + 1] == "exec":
            i += 2
        elif b in ("poetry", "uv", "pipenv") and i + 1 < n and toks[i + 1] == "run":
            i += 2
        elif b in ("pnpm", "yarn", "npm") and i + 1 < n and toks[i + 1] in ("dlx", "exec"):
            i += 2
        elif b in ("npx", "bunx", "pnpx"):
            i += 1
            while i < n and toks[i].startswith("-"):
                i += 1
        else:
            break
    return toks[i:]
def targets(toks):
    """그 세그먼트의 DB 대상(H5) — 명시(-d/--dbname/--database · 접속 URL)가 있으면 그것만, 없으면 머리 앞 env(DATABASE_URL·DB_URL·PGDATABASE)."""
    out, i = [], 0
    while i < len(toks):
        t = toks[i]
        m = re.match(r"^(?:-d|--dbname|--database)(?:=(.+))?$", t)
        if m:
            v = m.group(1) or (toks[i + 1] if i + 1 < len(toks) else "")
            out.append(v); i += 2 if not m.group(1) else 1; continue
        if re.match(r"^(postgres|postgresql|mysql|mariadb|mongodb(\+srv)?)://", t):
            out.append(t)
        i += 1
    if not out:
        for t in toks:
            m = re.match(r"^(?:DATABASE_URL|DB_URL|PGDATABASE)=(.+)$", t)
            if m:
                out.append(m.group(1))
            elif not ASSIGN.match(t):
                break
    return out
def is_test(v):
    if "://" in v:
        v = re.sub(r"^.*://[^/]+/", "", v).split("?")[0]
    return bool(re.search(r"(^|[_-])(test|qa|e2e|ci)([_-]|$)", v.strip("'\""), re.I))
def exempt(toks):
    ts = targets(toks)
    return bool(ts) and all(is_test(v) for v in ts)
# _fdob_local_target — #2784: 프로젝트가 선언한 **로컬 작업 DB** 만 B1 면제(좁게 · 의심되면 막는다).
#   선언 = 페이로드 cwd 에서 위로 찾은 `.claude/db-local-targets` — 한 줄 `host:port/db`(host 는 127.0.0.1·localhost·::1 만,
#   그 밖의 host 줄은 무시) · `socket:<절대 경로>/db`. 명령의 host·port·db 가 한 줄과 **문자 그대로** 같아야 한다.
#   막는 쪽: `$`·백틱(환경변수·치환으로 가린 값) · 비밀번호 밖의 앞머리 할당(MYSQL_HOST=·PGHOSTADDR=) · `env`·ssh·docker exec
#   (클라이언트가 명령 머리가 아니면 원격일 수 있다) · 접속 URL·conninfo · host 중복 · `--protocol` · 짧은 옵션 묶음 속 h/P/D/S ·
#   훅 환경의 PGHOSTADDR·PGSERVICE(psql) · 같은 명령 어디서든 PGHOSTADDR·PGSERVICE·PGSERVICEFILE·PGSYSCONFDIR 를 만지거나
#   source/`.` 하면(psql) · 허용 목록 밖의 긴 옵션(loose- 접두·줄임) · `.claude/db-guard-hosts` 표식이 그 명령이나 대상에 걸리면(운영 표식이 선언을 이긴다).
#   ⚠️ 무력화되는 입력: 선언한 loopback 포트가 실은 운영으로 가는 SSH 터널일 때 — 그 포트를 db-guard-hosts 에 적어야 막힌다.
LOOP = {"127.0.0.1", "localhost", "::1"}
SAFE_ASSIGN = {"MYSQL_PWD", "PGPASSWORD"}
def find_up(start, rel):
    if not start or not os.path.isabs(start):
        return None
    d = os.path.normpath(start)
    while True:
        p = os.path.join(d, rel)
        if os.path.isfile(p):
            return p
        up = os.path.dirname(d)
        if up == d:
            return None
        d = up
def read_lines(p):
    try:
        with open(p, encoding="utf-8", errors="replace") as f:
            return [ln.split("#", 1)[0].strip() for ln in f if ln.split("#", 1)[0].strip()]
    except OSError:
        return []
_decl = find_up(os.environ.get("FDOB_CWD", ""), os.path.join(".claude", "db-local-targets"))
LOCAL_DECL = set()
for ln in (read_lines(_decl) if _decl else []):
    tgt, _, db = ln.rpartition("/")
    if not db or not tgt:
        continue
    if tgt.startswith("socket:/"):
        LOCAL_DECL.add((tgt, db))
    else:
        m = re.fullmatch(r"(?:\[(::1)\]|([^:\[\]/]+)):(\d+)", tgt)
        if m and (m.group(1) or m.group(2)) in LOOP:
            LOCAL_DECL.add(((m.group(1) or m.group(2)) + ":" + m.group(3), db))
GUARD = []
for st in (os.environ.get("FDOB_CWD", ""), os.getcwd(), os.environ.get("CLAUDE_PROJECT_DIR", "")):
    g = find_up(st, os.path.join(".claude", "db-guard-hosts"))
    if g:
        GUARD += [x.lower() for x in read_lines(g)]
MY_VAL = {"h": "host", "P": "port", "D": "db", "S": "socket", "u": "", "e": ""}
MY_LONG = {"host": "host", "port": "port", "database": "db", "socket": "socket", "user": "", "execute": "",
           "default-character-set": "", "defaults-file": "", "defaults-extra-file": "", "login-path": ""}
PG_VAL = {"h": "host", "p": "port", "d": "db", "U": "", "c": "", "f": "", "v": "", "o": "", "L": "", "P": "", "F": "", "R": "", "T": ""}
PG_LONG = {"host": "host", "port": "port", "dbname": "db", "username": "", "command": "", "file": "", "variable": "",
           "set": "", "output": "", "log-file": "", "pset": "", "field-separator": "", "record-separator": "", "table-attr": ""}
# 값을 받지 않는다고 확인된 긴 옵션만 허용 — 그 밖의 긴 옵션(loose- 접두·줄임 `--hos=`·`--ho`)은 host·port·db 를 바꿀 수 있어 면제 없음(#2866)
MY_FLAG = {"password", "batch", "silent", "verbose", "force", "table", "raw", "quick", "skip-column-names", "column-names",
           "unbuffered", "no-defaults", "show-warnings", "comments", "skip-comments", "no-beep", "html", "xml", "vertical",
           "line-numbers", "skip-line-numbers", "safe-updates", "i-am-a-dummy", "compress", "binary-mode", "no-tee"}
PG_FLAG = {"password", "no-password", "quiet", "echo-all", "echo-errors", "echo-queries", "echo-hidden", "single-transaction",
           "no-psqlrc", "tuples-only", "no-align", "expanded", "html", "csv", "single-line", "single-step", "field-separator-zero",
           "record-separator-zero", "no-readline"}
# 같은 Bash 명령 어디서든(앞 명령·앞 줄) psql 대상을 바꾸는 환경을 만지면 면제 없음 — 할당·export·declare -x·set -a·read 모두
# 이름 토큰으로 잡는다 · source/`.` 은 읽는 파일이 그 환경을 export 할 수 있다(#2866)
PG_ENV = re.compile(r"(?<![A-Za-z0-9_])PG(?:HOSTADDR|SERVICE|SERVICEFILE|SYSCONFDIR)(?![A-Za-z0-9_])")
def pg_env_touched(all_toks):
    return any(PG_ENV.search(t) for t in all_toks) or \
        any(seg and os.path.basename(seg[0]) in ("source", ".") for seg in ALL_SEGS)
def local_target(toks, all_toks=()):
    if not LOCAL_DECL or any("$" in t or "`" in t for t in toks):
        return False
    pre = []
    for t in toks:
        if not ASSIGN.match(t):
            break
        pre.append(t)
    core = toks[len(pre):]
    if any(t.split("=", 1)[0] not in SAFE_ASSIGN for t in pre):
        return False
    if core and os.path.basename(core[0]) == "sudo":            # sudo 는 이 PC 다 — 옵션만 벗긴다(그 사이 할당·env 는 막는다)
        after = strip_runner(core)
        if any(ASSIGN.match(t) or os.path.basename(t) == "env" for t in core[:len(core) - len(after)]):
            return False
        core = after
    if not core or os.path.basename(core[0]) not in ("mysql", "mariadb", "psql") or "/" in core[0] and not core[0].startswith("/"):
        return False
    pg = os.path.basename(core[0]) == "psql"
    if pg and (os.environ.get("PGHOSTADDR") or os.environ.get("PGSERVICE")):
        return False
    if pg and pg_env_touched(all_toks):
        return False
    short, long_ = (PG_VAL, PG_LONG) if pg else (MY_VAL, MY_LONG)
    flags = PG_FLAG if pg else MY_FLAG
    got = {"host": [], "port": [], "db": [], "socket": []}
    pos, args, i = [], core[1:], 0
    while i < len(args):
        t = args[i]; i += 1
        if re.match(r"^\d*[<>]", t):                             # 리다이렉트 — 붙여 쓰지 않았으면 다음 토큰이 대상
            if re.fullmatch(r"\d*[<>]+&?", t):
                i += 1
            continue
        if t.startswith("--"):
            k, eq, v = t[2:].partition("=")
            if k == "protocol":
                return False
            if k in long_:
                if not eq:
                    if i >= len(args):
                        return False
                    v = args[i]; i += 1
                if long_[k]:
                    got[long_[k]].append(v)
            elif k not in flags or eq and k != "password":
                return False                                      # 모르는 긴 옵션 — 대상을 바꿀 수 있다(fail-closed)
            continue
        if t.startswith("-") and len(t) > 1:
            c = t[1]
            if c in short:
                v = t[2:]
                if not v:
                    if i >= len(args):
                        return False
                    v = args[i]; i += 1
                if short[c]:
                    got[short[c]].append(v)
            elif c == "p" and not pg:
                pass                                              # mysql -p<비밀번호>(붙여 쓴 값만)
            elif any(ch in short or ch == "p" for ch in t[2:]):
                return False                                      # 묶음 속 값 옵션 — 해석이 갈린다
            continue
        pos.append(t)
    if pos:
        if pg and len(pos) > 2 or not pg and len(pos) > 1:
            return False
        got["db"].append(pos[0])
    if any(len(set(v)) > 1 for v in got.values()):
        return False
    host = got["host"][0] if got["host"] else ""
    db = got["db"][0] if got["db"] else ""
    if not db or "=" in db or "://" in db:
        return False
    if got["socket"]:
        if pg or host not in ("", "localhost"):
            return False
        tgt = "socket:" + got["socket"][0]
    elif pg and host.startswith("/"):
        tgt = "socket:" + host
    else:
        if host not in LOOP or (not pg and host == "localhost"):  # mysql 의 localhost = 기본 소켓(포트 무시)
            return False
        port = got["port"][0] if got["port"] else ""
        if not re.fullmatch(r"\d+", port):
            return False
        tgt = host + ":" + port
    if (tgt, db) not in LOCAL_DECL:
        return False
    seg = " ".join(toks).lower()
    full = (tgt + "/" + db).lower()
    return not any(g in seg or g in full for g in GUARD)
MIG = re.compile(r"^(?:"
    r"prisma migrate (?:deploy|dev|reset|resolve)|alembic (?:upgrade|downgrade|stamp)|"
    r"flyway (?:migrate|clean|repair|undo|baseline)|liquibase (?:update|rollback|dropAll)|"
    r"knex migrate:(?:latest|up|down|rollback)|(?:rails|rake) db:(?:migrate|rollback|reset|drop|schema:load)|"
    r"(?:python3?|python) (?:\S*/)?manage\.py migrate|manage\.py migrate|sequelize(?:-cli)? db:migrate|"
    r"typeorm migration:(?:run|revert)|(?:npm|pnpm|yarn) (?:run )?(?:db:)?migrate(?::[A-Za-z]+)?)(?:\s|$)")
# 같은 명령에서 heredoc 으로 쓴 파일 → 그 본문(H3 다듬기: 적용 파일의 내용을 알면 그 내용으로 DDL 여부를 본다)
written = {}
for ln, body in lines:
    m = re.search(r"(?:\bcat|\btee)\s+(?:-a\s+)?>?\s*['\"]?([^\s'\"<>]+\.sql)['\"]?\s*<<", ln) or \
        re.search(r"\bcat\s*>>?\s*['\"]?([^\s'\"<>]+\.sql)['\"]?\s*<<", ln)
    if m:
        written[m.group(1)] = "\n".join(body)
def applied_files(toks):
    """클라이언트에 적용하는 파일 — `-f/--file <f>`·`--file=<f>` 는 확장자와 무관 · 표준입력 `< f` 는 .sql 이거나 이 명령이 쓴 파일만."""
    out = []
    for j, t in enumerate(toks):
        if t in ("-f", "--file") and j + 1 < len(toks):
            out.append(toks[j + 1])
        elif t.startswith("--file="):
            out.append(t.split("=", 1)[1])
        else:
            f = toks[j + 1] if t == "<" and j + 1 < len(toks) else (t[1:] if t.startswith("<") and not t.startswith("<<") else "")
            if f and (f.endswith(".sql") or f in written):
                out.append(f)
    return out
def file_ddl(toks):
    """적용 파일이 있으면 True(내용을 모르면 보수적으로 DDL 로 본다) — 같은 명령의 heredoc 으로 쓴 파일이면 그 본문으로 판정."""
    return any(has_ddl(written[f]) if f in written else True for f in applied_files(toks))
def judge(segments):
  global ALL_SEGS, ALL_TOKS   # local_target 이 ALL_SEGS 를 전역으로 본다 — 판정마다 그 쪼개기의 것으로 바꿔 둔다
  kind = ""
  local_hit = False
  ALL_SEGS = [toks for ln, _ in lines for toks, _ in segments(ln)]    # 줄바꿈도 같은 셸 — 명령 전체(heredoc 본문 제외)
  ALL_TOKS = [t for toks in ALL_SEGS for t in toks]
  for ln, body in lines:
    segs = segments(ln)
    for k, (toks, sep) in enumerate(segs):
        if not toks:
            continue
        # B1 — 세그먼트 안 어느 토큰이든 DB 클라이언트(H1: sudo -u · docker exec · 절대경로)
        if any(os.path.basename(t) in CLIENTS for t in toks):
            text = " ".join(toks) + ("\n" + "\n".join(body) if "<<" in ln else "")
            fileapply = file_ddl(toks)                                               # H3 파일로 적용
            piped = ""
            j = k
            while j > 0 and segs[j][1] == "|":                                       # H1 `… | psql` 은 앞 세그먼트를 끌어온다
                j -= 1
                piped += " " + " ".join(segs[j][0])
            pipe_sql = any(t.endswith(".sql") for t in piped.split())
            if (has_ddl(text) or fileapply or has_ddl(piped) or pipe_sql) and not exempt(toks):
                if local_target(toks, ALL_TOKS):                     # #2784 — 선언한 로컬 작업 DB
                    local_hit = True
                else:
                    kind = "B1"; break
        # B2 — 러너를 벗긴 **명령 머리**가 마이그레이션 도구(H4·H7: 따옴표·grep 패턴 안은 토큰 하나라 머리가 안 된다)
        core = strip_runner(toks)
        if core:
            head = os.path.basename(core[0])
            if MIG.match(" ".join([head] + core[1:])) and not exempt(toks):
                kind = "B2"; break
    if kind:
        break
  return kind, local_hit
# 옛 쪼개기 판정 + 정본 판정(#3275 E1) — 둘 중 하나라도 막으면 막는다(결정 ㉰ ① 호환층 · #3326 승인 뒤 옛 쪼개기를 지운다)
kind, local_hit = judge(segments)
if not kind and CT is not None:
    try:
        k2, l2 = judge(segments_ct)
    except Exception:
        k2, l2 = "", False
    kind, local_hit = k2, local_hit or l2
print(kind or ("B1-LOCAL" if local_hit else ""))
