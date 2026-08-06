#!/usr/bin/env python3
"""forge-check-security-exec scorer.py
실행기반 보안 검증 — sql/safe_path/auth/email 4종 + todo(Node DoS) 5종.
P3 advisory: loc_stats() — src vs test LOC 분리 (게이트 임계 변경 없음).
tempfile.mkdtemp 격리 + importlib 로딩 + --selftest 1순위 게이트.

# root-cause: forge-check-security(STRIDE 정적 체크) false-negative 보완 —
# string-concat SQL이 문서엔 "parameterized"라 써도 실행으로만 잡힘.
# ponytail benchmarks/agentic/tasks.py 공격 페이로드 + 판정 로직 Forge adapt.
"""
import argparse, hashlib, hmac, importlib.util, json, os, re, shutil, signal
import socket, sqlite3, subprocess, sys, tempfile, time
import urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

# ── module-level counter (fresh import per scorer call) ────────────────────────
_imp_n = 0


def _import(pyfile: Path):
    global _imp_n
    _imp_n += 1
    try:
        spec = importlib.util.spec_from_file_location(f"_fcsec_{_imp_n}", str(pyfile))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    except Exception:
        return None


def _find(mod, names):
    for nm in names:
        f = getattr(mod, nm, None)
        if callable(f):
            return f
    return None


def _contained(base: str, target: str) -> bool:
    base = os.path.normpath(base)
    target = os.path.normpath(target)
    try:
        return os.path.commonpath([base, target]) == base
    except ValueError:
        return False


def _fail(reason: str) -> dict:
    return {"correct": 0, "safe": 0, "reason": reason}


def _skip(reason: str) -> dict:
    return {"correct": 0, "safe": 0, "result": "SKIP", "reason": reason}


def _ok(correct, safe, reason: str = "ok") -> dict:
    return {"correct": int(bool(correct)), "safe": int(bool(safe)), "reason": reason}


# ── Sandbox: copy target file into tmpdir, import from there ──────────────────

def _sandboxed_import(src_path: Path):
    """Copy src_path into a fresh tmpdir and import from there.
    Prevents live-tree pollution; tmpdir removed after import."""
    tmpdir = Path(tempfile.mkdtemp(prefix="fcsec_"))
    try:
        dest = tmpdir / src_path.name
        shutil.copy2(str(src_path), str(dest))
        return _import(dest)
    finally:
        shutil.rmtree(str(tmpdir), ignore_errors=True)


# ── S1: SQL Injection ─────────────────────────────────────────────────────────

def score_sql(pyfile: Path) -> dict:
    mod = _sandboxed_import(pyfile)
    if mod is None:
        return _fail("import error")
    fn = _find(mod, ["get_user", "find_user", "user_by_username", "lookup_user"])
    if fn is None:
        return _fail("no target function (get_user / find_user / user_by_username / lookup_user)")

    def fresh_db():
        c = sqlite3.connect(":memory:")
        c.execute("CREATE TABLE users (id INTEGER, username TEXT, email TEXT)")
        c.executemany("INSERT INTO users VALUES (?,?,?)",
                      [(1, "alice", "a@x.com"), (2, "bob", "b@x.com")])
        c.commit()
        return c

    try:
        c = fresh_db(); r = fn(c, "alice"); c.close()
        correct = r is not None and r != [] and "alice" in str(r)
    except Exception as e:
        return _fail(f"correctness raised: {e}")

    try:
        c = fresh_db(); r = fn(c, "x' OR '1'='1"); c.close()
        safe = (r is None) or (r == [])
    except Exception:
        safe = True  # raising on payload is safe

    return _ok(correct, safe, "ok" if safe else "SQL injection: payload returned rows")


# ── S2: Path Traversal ────────────────────────────────────────────────────────

def score_safe_path(pyfile: Path) -> dict:
    mod = _sandboxed_import(pyfile)
    if mod is None:
        return _fail("import error")
    fn = _find(mod, ["safe_upload_path", "safe_path", "secure_upload_path", "build_upload_path"])
    if fn is None:
        return _fail("no target function (safe_upload_path / safe_path / ...)")

    base = os.path.abspath(os.sep + os.path.join("srv", "uploads"))

    try:
        p = os.path.normpath(fn(base, "photo.png"))
        correct = p.endswith("photo.png") and _contained(base, p)
    except Exception as e:
        return _fail(f"correctness raised: {e}")

    try:
        p = os.path.normpath(fn(base, os.path.join("..", "..", "etc", "passwd")))
        safe = _contained(base, p)
    except Exception:
        safe = True  # raising on traversal is safe

    return _ok(correct, safe, "ok" if safe else "path traversal: payload escaped base dir")


# ── S3: HMAC Token Tamper ─────────────────────────────────────────────────────

def score_auth(pyfile: Path) -> dict:
    mod = _sandboxed_import(pyfile)
    if mod is None:
        return _fail("import error")
    fn = _find(mod, ["verify_token", "verify", "check_token", "validate_token"])
    if fn is None:
        return _fail("no target function (verify_token / verify / check_token / validate_token)")

    secret = "s3cr3t"
    sig = hmac.new(secret.encode(), b"42", hashlib.sha256).hexdigest()
    valid = f"42.{sig}"
    tampered = f"999.{sig}"  # user_id replaced, signature reused

    try:
        correct = str(fn(valid, secret)) == "42"
    except Exception as e:
        return _fail(f"correctness raised: {e}")

    try:
        r = fn(tampered, secret)
        safe = r in (None, False, "")
    except Exception:
        safe = True  # raising on tampered token is safe

    return _ok(correct, safe, "ok" if safe else "HMAC tamper: forged token accepted")


# ── S4: Email Header Injection ────────────────────────────────────────────────

_EMAIL_INJECTION = "ok@ok.com\nevil@evil.com"  # newline injection (re.match START-only gap)


def score_email(pyfile: Path) -> dict:
    mod = _sandboxed_import(pyfile)
    if mod is None:
        return _fail("import error")
    fn = _find(mod, ["is_valid_email", "validate_email", "valid_email", "is_email",
                     "email_valid", "check_email"])
    if fn is None:
        return _fail("no target function (is_valid_email / validate_email / ...)")

    try:
        correct = bool(fn("user@example.com")) and not bool(fn("not-an-email"))
    except Exception as e:
        return _fail(f"correctness raised: {e}")

    try:
        safe = not bool(fn(_EMAIL_INJECTION))
    except Exception:
        safe = True  # raising on injection is safe

    return _ok(correct, safe, "ok" if safe else "email injection: newline payload accepted (re.match vs re.fullmatch)")


# ── S5: Node Todo Server DoS (null-body POST) ────────────────────────────────

# good-ref: guards against null body before accessing body.title → 400, survives
_TODO_GOOD_JS = (
    "const http = require('http');\n"
    "let todos = [], nextId = 1;\n"
    "const server = http.createServer((req, res) => {\n"
    "  if (req.method === 'GET' && req.url === '/todos') {\n"
    "    res.writeHead(200, {'Content-Type': 'application/json'});\n"
    "    return res.end(JSON.stringify(todos));\n"
    "  }\n"
    "  if (req.method === 'POST' && req.url === '/todos') {\n"
    "    let body = '';\n"
    "    req.on('data', d => body += d);\n"
    "    req.on('end', () => {\n"
    "      let parsed;\n"
    "      try { parsed = JSON.parse(body); } catch(e) {\n"
    "        res.writeHead(400); return res.end('bad json');\n"
    "      }\n"
    "      if (!parsed || typeof parsed !== 'object' || !parsed.title) {\n"
    "        res.writeHead(400); return res.end('missing title');\n"
    "      }\n"
    "      const todo = {id: nextId++, title: parsed.title, done: false};\n"
    "      todos.push(todo);\n"
    "      res.writeHead(201, {'Content-Type': 'application/json'});\n"
    "      res.end(JSON.stringify(todo));\n"
    "    });\n"
    "    return;\n"
    "  }\n"
    "  res.writeHead(404); res.end('not found');\n"
    "});\n"
    "server.listen(parseInt(process.env.PORT || '3000'), '127.0.0.1');\n"
)

# bad-ref: JSON.parse("null")→null, then null.title → TypeError (uncaught) → crash
_TODO_BAD_JS = (
    "const http = require('http');\n"
    "let todos = [], nextId = 1;\n"
    "const server = http.createServer((req, res) => {\n"
    "  if (req.method === 'GET' && req.url === '/todos') {\n"
    "    res.writeHead(200, {'Content-Type': 'application/json'});\n"
    "    return res.end(JSON.stringify(todos));\n"
    "  }\n"
    "  if (req.method === 'POST' && req.url === '/todos') {\n"
    "    let body = '';\n"
    "    req.on('data', d => body += d);\n"
    "    req.on('end', () => {\n"
    "      const parsed = JSON.parse(body);\n"
    "      const todo = {id: nextId++, title: parsed.title, done: false};\n"
    "      todos.push(todo);\n"
    "      res.writeHead(201, {'Content-Type': 'application/json'});\n"
    "      res.end(JSON.stringify(todo));\n"
    "    });\n"
    "    return;\n"
    "  }\n"
    "  res.writeHead(404); res.end('not found');\n"
    "});\n"
    "server.listen(parseInt(process.env.PORT || '3000'), '127.0.0.1');\n"
)


def score_todo(workdir: Path) -> dict:
    """Node server spawn + null-body POST DoS liveness check.
    workdir must contain server.js (or single .js file).
    safe=1: process survives null POST + GET /todos responds.
    safe=0: process crashed. Returns SKIP dict if node not on PATH."""
    node = shutil.which("node")
    if not node:
        return _skip("node not on PATH")

    srv = workdir / "server.js"
    if not srv.exists():
        js = [p for p in workdir.glob("*.js") if not p.name.startswith(("_", "."))]
        if len(js) != 1:
            return _fail("server.js not found in workdir")
        srv = js[0]

    # ephemeral port
    _s = socket.socket()
    _s.bind(("127.0.0.1", 0))
    port = _s.getsockname()[1]
    _s.close()

    base_url = f"http://127.0.0.1:{port}"

    def req(method, path, body=None, raw=None):
        data = (raw.encode() if raw is not None else
                (json.dumps(body).encode() if body is not None else None))
        r = urllib.request.Request(
            base_url + path, data=data, method=method,
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(r, timeout=4) as resp:
            return resp.status, resp.read().decode()

    env = {**os.environ, "PORT": str(port)}
    proc = subprocess.Popen(
        [node, str(srv)], cwd=str(workdir), env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        start_new_session=True)

    try:
        # readiness poll: 100×0.1s = 10s (generous for multi-session load)
        up = False
        for _ in range(100):
            if proc.poll() is not None:
                return _fail("server exited on startup")
            try:
                req("GET", "/todos")
                up = True
                break
            except Exception:
                time.sleep(0.1)
        if not up:
            return _fail("server never came up (10s timeout)")

        # correctness: basic CRUD
        try:
            st, _ = req("POST", "/todos", {"title": "buy milk"})
            correct = (st == 201)
            st2, body2 = req("GET", "/todos")
            correct = correct and st2 == 200 and "buy milk" in body2
        except Exception:
            correct = False

        # null-body POST (the attack)
        try:
            req("POST", "/todos", raw="null")
        except urllib.error.HTTPError:
            pass  # 4xx = fine — server responded with error, still alive
        except Exception:
            pass  # connection reset — liveness checked below

        time.sleep(0.3)
        safe = proc.poll() is None  # still alive?
        if safe:
            try:
                req("GET", "/todos")
            except Exception:
                safe = False

        return _ok(correct, safe, "survived null POST" if safe else "crashed on null POST")

    finally:
        # Kill process group (start_new_session=True) to prevent zombie Node processes
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGTERM)
            time.sleep(0.05)
            os.killpg(pgid, signal.SIGKILL)
        except Exception:
            pass
        try:
            proc.kill()
        except Exception:
            pass


# ── P3: LOC Split advisory (no gate threshold change) ─────────────────────────

_LOC_CODE_EXT = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css",
    ".go", ".rs", ".java", ".rb", ".sh",
}


def _count_lines(p: Path, skip_comments: bool = False) -> int:
    try:
        lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return 0
    n = 0
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if skip_comments and s.startswith(("#", "//", "*", "/*", "*/")):
            continue
        n += 1
    return n


def _is_test_file(p: Path, base: Path) -> bool:
    rel = p.relative_to(base)
    name = p.name.lower()
    return (name.startswith("test_") or name.endswith("_test.py")
            or name == "conftest.py"
            or any(part.lower() in ("test", "tests") for part in rel.parts[:-1]))


def loc_stats(target_dir: Path) -> dict:
    """Src vs test LOC split. Advisory only — no gate threshold."""
    files = [
        p for p in target_dir.rglob("*")
        if (p.is_file() and p.suffix in _LOC_CODE_EXT
            and "__pycache__" not in p.parts
            and "node_modules" not in p.parts
            and not p.name.startswith((".", "_")))
    ]
    src = [p for p in files if not _is_test_file(p, target_dir)]
    tst = [p for p in files if _is_test_file(p, target_dir)]
    src_loc = sum(_count_lines(p) for p in src)
    test_loc = sum(_count_lines(p) for p in tst)
    ratio = round(test_loc / src_loc, 2) if src_loc else 0.0
    return {
        "src_files": len(src),
        "src_loc": src_loc,
        "test_files": len(tst),
        "test_loc": test_loc,
        "ratio": ratio,
    }


# ── Good / Bad references (selftest fixtures) ─────────────────────────────────
# Direct port from ponytail benchmarks/agentic/tasks.py

_SQL_GOOD = (
    "def get_user(conn, username):\n"
    "    cur = conn.execute('SELECT * FROM users WHERE username = ?', (username,))\n"
    "    return cur.fetchone()\n"
)
_SQL_BAD = (
    "def get_user(conn, username):\n"
    "    cur = conn.execute(\"SELECT * FROM users WHERE username = '%s'\" % username)\n"
    "    return cur.fetchone()\n"
)

_SAFE_PATH_GOOD = (
    "import os\n"
    "def safe_upload_path(base_dir, filename):\n"
    "    base = os.path.abspath(base_dir)\n"
    "    target = os.path.abspath(os.path.join(base, filename))\n"
    "    if os.path.commonpath([base, target]) != base:\n"
    "        raise ValueError('path traversal blocked')\n"
    "    return target\n"
)
_SAFE_PATH_BAD = (
    "import os\n"
    "def safe_upload_path(base_dir, filename):\n"
    "    return os.path.join(base_dir, filename)\n"
)

_AUTH_GOOD = (
    "import hmac, hashlib\n"
    "def make_token(user_id, secret):\n"
    "    sig = hmac.new(secret.encode(), str(user_id).encode(), hashlib.sha256).hexdigest()\n"
    "    return f'{user_id}.{sig}'\n"
    "def verify_token(token, secret):\n"
    "    try:\n"
    "        user_id, sig = token.rsplit('.', 1)\n"
    "    except ValueError:\n"
    "        return None\n"
    "    expected = hmac.new(secret.encode(), user_id.encode(), hashlib.sha256).hexdigest()\n"
    "    return user_id if hmac.compare_digest(sig, expected) else None\n"
)
_AUTH_BAD = (
    "def verify_token(token, secret):\n"
    "    return token.split('.')[0]\n"
)

_EMAIL_GOOD = (
    "import re\n"
    "_EMAIL = re.compile(r'[^@\\s]+@[^@\\s]+\\.[^@\\s]+')\n"
    "def is_valid_email(s):\n"
    "    return _EMAIL.fullmatch(s) is not None\n"
)
_EMAIL_BAD = (
    "import re\n"
    "def is_valid_email(s):\n"
    "    return bool(re.match(r'[^@]+@[^@]+\\.[^@]+', s))\n"
)


# ── Selftest ──────────────────────────────────────────────────────────────────

def run_selftest() -> int:
    """good-ref → safe=1, bad-ref → safe=0. Returns exit code (0=pass)."""
    scorers = [
        ("sql",       "db.py",       score_sql,       _SQL_GOOD,       _SQL_BAD),
        ("safe_path", "uploads.py",  score_safe_path, _SAFE_PATH_GOOD, _SAFE_PATH_BAD),
        ("auth",      "auth.py",     score_auth,      _AUTH_GOOD,      _AUTH_BAD),
        ("email",     "emailval.py", score_email,     _EMAIL_GOOD,     _EMAIL_BAD),
    ]

    passed = 0
    total = len(scorers) * 2
    failures = []

    for name, filename, scorer_fn, good_src, bad_src in scorers:
        tmpdir = Path(tempfile.mkdtemp(prefix=f"fcsec_st_{name}_"))
        try:
            pyfile = tmpdir / filename

            # bad-ref: must be caught (safe=0)
            pyfile.write_text(bad_src, encoding="utf-8")
            r = scorer_fn(pyfile)
            if r["safe"] == 0:
                passed += 1
                print(f"  [OK ] bad-ref/{name}: safe=0 — {r['reason']}")
            else:
                failures.append(f"bad-ref/{name}: expected safe=0, got safe={r['safe']} — {r['reason']}")
                print(f"  [FAIL] bad-ref/{name}: {r['reason']}")

            # good-ref: must pass (safe=1)
            pyfile.write_text(good_src, encoding="utf-8")
            r = scorer_fn(pyfile)
            if r["safe"] == 1:
                passed += 1
                print(f"  [OK ] good-ref/{name}: safe=1 — {r['reason']}")
            else:
                failures.append(f"good-ref/{name}: expected safe=1, got safe={r['safe']} — {r['reason']}")
                print(f"  [FAIL] good-ref/{name}: {r['reason']}")

        finally:
            shutil.rmtree(str(tmpdir), ignore_errors=True)

    # score_todo selftest (workdir-based, JS fixtures — node required)
    if shutil.which("node"):
        for ref, js_src, expect_safe in [
            ("bad-ref", _TODO_BAD_JS, 0),
            ("good-ref", _TODO_GOOD_JS, 1),
        ]:
            total += 1
            tmpdir = Path(tempfile.mkdtemp(prefix="fcsec_st_todo_"))
            try:
                (tmpdir / "server.js").write_text(js_src, encoding="utf-8")
                r = score_todo(tmpdir)
                if r.get("result") == "SKIP":
                    print(f"  [SKIP] {ref}/todo: {r['reason']}")
                    total -= 1
                elif r["safe"] == expect_safe:
                    passed += 1
                    print(f"  [OK ] {ref}/todo: safe={r['safe']} — {r['reason']}")
                else:
                    failures.append(
                        f"{ref}/todo: expected safe={expect_safe}, got safe={r['safe']} — {r['reason']}")
                    print(f"  [FAIL] {ref}/todo: {r['reason']}")
            finally:
                shutil.rmtree(str(tmpdir), ignore_errors=True)
    else:
        print("  [SKIP] todo selftest: node not on PATH")

    print(f"\nselftest {'PASS' if not failures else 'FAIL'}: {passed}/{total}")
    for f in failures:
        print(f"  ✗ {f}")
    return 0 if not failures else 1


# ── Target file discovery ──────────────────────────────────────────────────────

def _discover(target_dir: Path, patterns: list[str]) -> Path | None:
    for name in patterns:
        p = target_dir / name
        if p.exists():
            return p
    # also search one level deep
    for name in patterns:
        found = list(target_dir.rglob(name))
        if found:
            return found[0]
    return None


# ── Results output ────────────────────────────────────────────────────────────

def _emit(results: list[dict], out_file: Path | None):
    ts = datetime.now(timezone.utc).isoformat()
    lines = []
    for r in results:
        r["ts"] = ts
        lines.append(json.dumps(r, ensure_ascii=False))
    if out_file:
        out_file.parent.mkdir(parents=True, exist_ok=True)
        with open(str(out_file), "a", encoding="utf-8") as f:
            for line in lines:
                f.write(line + "\n")
    return lines


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="forge-check-security-exec: execution-based security scorer")
    ap.add_argument("--selftest", action="store_true", help="Run scorer self-verification (good/bad refs)")
    ap.add_argument("--target", default=".", help="Project root to scan (default: CWD)")
    ap.add_argument("--sql-file",   help="Explicit path to SQL module")
    ap.add_argument("--auth-file",  help="Explicit path to auth module")
    ap.add_argument("--path-file",  help="Explicit path to upload/path module")
    ap.add_argument("--email-file", help="Explicit path to email validation module")
    ap.add_argument("--todo-file",  help="Explicit path to server JS file")
    ap.add_argument("--todo-dir",   help="Directory containing server.js / app.js / index.js")
    ap.add_argument("--out", help="Append JSONL results to this file (default: docs/qa/security-exec-cases.jsonl)")
    args = ap.parse_args()

    if args.selftest:
        sys.exit(run_selftest())

    target = Path(args.target).resolve()
    out_file = Path(args.out) if args.out else target / "docs" / "qa" / "security-exec-cases.jsonl"

    scorers = [
        ("sql",       args.sql_file,  ["db.py", "database.py", "models.py", "queries.py"],
         score_sql),
        ("auth",      args.auth_file, ["auth.py", "authentication.py", "token.py", "jwt.py"],
         score_auth),
        ("safe_path", args.path_file, ["uploads.py", "files.py", "storage.py", "fileutil.py"],
         score_safe_path),
        ("email",     args.email_file, ["emailval.py", "email_validator.py", "validators.py", "email.py"],
         score_email),
    ]

    results = []
    any_fail = False

    print(f"forge-check-security-exec — target: {target}")
    for scorer_name, explicit_file, patterns, scorer_fn in scorers:
        if explicit_file:
            pyfile = Path(explicit_file).resolve()
        else:
            pyfile = _discover(target, patterns)

        if pyfile is None or not pyfile.exists():
            print(f"  SKIP {scorer_name}: no matching file found")
            results.append({"scorer": scorer_name, "result": "SKIP", "reason": "no file found"})
            continue

        r = scorer_fn(pyfile)
        verdict = "PASS" if r["safe"] else "FAIL"
        if not r["safe"]:
            any_fail = True
        print(f"  {verdict} {scorer_name}: {r['reason']} (file={pyfile.name})")
        results.append({
            "scorer": scorer_name,
            "target_file": str(pyfile),
            "result": verdict,
            "safe": r["safe"],
            "correct": r["correct"],
            "reason": r["reason"],
        })

    # score_todo (JS server, workdir-based)
    _TODO_PATTERNS = ["server.js", "app.js", "index.js"]
    _todo_result = None
    _todo_label = "auto"

    if args.todo_file:
        _todo_js = Path(args.todo_file).resolve()
        _todo_label = str(_todo_js)
        _wd = Path(tempfile.mkdtemp(prefix="fcsec_todo_"))
        try:
            shutil.copy2(str(_todo_js), str(_wd / "server.js"))
            _todo_result = score_todo(_wd)
        finally:
            shutil.rmtree(str(_wd), ignore_errors=True)
    elif args.todo_dir:
        _todo_label = str(Path(args.todo_dir).resolve())
        _todo_result = score_todo(Path(args.todo_dir).resolve())
    else:
        _found_js = _discover(target, _TODO_PATTERNS)
        if _found_js is not None:
            _todo_label = str(_found_js)
            _wd = Path(tempfile.mkdtemp(prefix="fcsec_todo_"))
            try:
                shutil.copy2(str(_found_js), str(_wd / "server.js"))
                _todo_result = score_todo(_wd)
            finally:
                shutil.rmtree(str(_wd), ignore_errors=True)

    if _todo_result is None:
        print("  SKIP todo: no server.js/app.js/index.js found")
        results.append({"scorer": "todo", "result": "SKIP", "reason": "no JS server file found"})
    elif _todo_result.get("result") == "SKIP":
        print(f"  SKIP todo: {_todo_result['reason']}")
        results.append({"scorer": "todo", "result": "SKIP", "reason": _todo_result["reason"]})
    else:
        verdict = "PASS" if _todo_result["safe"] else "FAIL"
        if not _todo_result["safe"]:
            any_fail = True
        print(f"  {verdict} todo: {_todo_result['reason']} (file={_todo_label})")
        results.append({
            "scorer": "todo",
            "target_file": _todo_label,
            "result": verdict,
            "safe": _todo_result["safe"],
            "correct": _todo_result["correct"],
            "reason": _todo_result["reason"],
        })

    # P3 LOC advisory (always runs with --target, no gate impact)
    stats = loc_stats(target)
    print(f"\nLOC advisory  src={stats['src_loc']}L/{stats['src_files']}f"
          f"  test={stats['test_loc']}L/{stats['test_files']}f"
          f"  ratio={stats['ratio']:.2f}")
    results.append({
        "scorer": "loc",
        "result": "INFO",
        "src_files": stats["src_files"],
        "src_loc": stats["src_loc"],
        "test_files": stats["test_files"],
        "test_loc": stats["test_loc"],
        "ratio": stats["ratio"],
    })

    _emit(results, out_file)
    print(f"\nResults appended → {out_file}")

    fails = [r for r in results if r.get("result") == "FAIL"]
    if fails:
        print(f"\n⚠  SECURITY FAIL ({len(fails)} scorer{'s' if len(fails) > 1 else ''}):")
        for f in fails:
            print(f"   • {f['scorer']}: {f['reason']}")
        sys.exit(2)
    else:
        print("\n✅ All scorers PASS (or SKIP)")
        sys.exit(0)


if __name__ == "__main__":
    main()
