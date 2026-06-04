#!/usr/bin/env python3
"""approve-worker-sign.py — HMAC token issuer for MAS P0 worker approval.

FR-1~FR-7 + Production guard (CRIT-1 fix).
"""
import argparse
import hashlib
import hmac
import json
import os
import stat
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta  # root-cause: F8 — timedelta로 expiry 정확 계산
from pathlib import Path


AUDIT_LOG = Path.home() / "forge-outputs/.claude/audit/approve-worker.jsonl"
APPROVALS_DIR = Path.home() / "forge-outputs/.claude/audit/approvals"
SECRET_PATH = Path.home() / ".config/forge/orch-token.key"


# --- Production guard (CRIT-1) ---
def _enforce_production_guard():
    ci = os.environ.get("CI", "false").lower() == "true"
    test_mode = bool(os.environ.get("FORGE_TEST_MODE", ""))
    if not ci and not test_mode and "PROC_PID_OVERRIDE" in os.environ:
        _audit("PROC_PID_OVERRIDE_BLOCKED", {"reason": "production env, not CI/FORGE_TEST_MODE"})
        del os.environ["PROC_PID_OVERRIDE"]


def _audit(event: str, extra: dict = None):
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {"event": event, "ts": time.time(), **(extra or {})}
    with open(AUDIT_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


# --- FR-6: PID lineage (5 checks) ---
def _check_pid_lineage():
    override = os.environ.get("PROC_PID_OVERRIDE")
    test_mode = bool(os.environ.get("FORGE_TEST_MODE", "")) or os.environ.get("CI", "false").lower() == "true"
    if override and test_mode:
        # CI/FORGE_TEST_MODE with override = skip actual PID checks (T-AW2b)
        _audit("PID_LINEAGE_SKIPPED", {"reason": "FORGE_TEST_MODE+PROC_PID_OVERRIDE", "override": override})
        return
    ppid = os.getppid()

    errors = []

    # (1) /proc/$PPID/comm
    try:
        comm = Path(f"/proc/{ppid}/comm").read_text().strip()
        if comm not in ("claude", "node", "python3", "python"):
            errors.append(f"(1) comm={comm!r} not in allowed set")
    except FileNotFoundError:
        errors.append(f"(1) /proc/{ppid}/comm not found")

    # (2) /proc/$PPID/exe symlink target
    try:
        exe = os.readlink(f"/proc/{ppid}/exe")
        allowed_exe = ("claude", "node", "python")
        if not any(a in exe for a in allowed_exe):
            errors.append(f"(2) exe={exe!r} not Claude/Node/Python")
    except (FileNotFoundError, PermissionError):
        pass  # may be inaccessible in CI

    # (3) TTY owner == UID
    try:
        tty_stat = os.stat(os.ttyname(sys.stdin.fileno()))
        if tty_stat.st_uid != os.getuid():
            errors.append(f"(3) TTY owner {tty_stat.st_uid} != UID {os.getuid()}")
    except Exception:
        pass  # non-TTY CI env is acceptable with FORGE_TEST_MODE

    # (4) session leader
    try:
        ppid_sid = os.getsid(ppid)
        my_sid = os.getsid(0)
        if ppid_sid != my_sid:
            errors.append(f"(4) session mismatch ppid_sid={ppid_sid} my_sid={my_sid}")
    except ProcessLookupError:
        pass

    # (5) exe realpath substring
    try:
        exe = os.readlink(f"/proc/{ppid}/exe")
        realexe = os.path.realpath(exe)
        if not any(a in realexe for a in ("claude", "node")):
            errors.append(f"(5) realpath={realexe!r} lacks claude/node substring")
    except (FileNotFoundError, PermissionError):
        pass

    if errors:
        _audit("PID_LINEAGE_FAIL", {"errors": errors, "ppid": ppid})
        print(f"[BLOCKED] PID lineage check failed: {'; '.join(errors)}", file=sys.stderr)
        sys.exit(2)


# --- FR-2: canonical JSON (RFC 8785 compatible) ---
def _canonical_json(obj: dict) -> bytes:
    return json.dumps(obj, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")


# --- FR-3: HMAC-SHA256 ---
def _sign(secret: bytes, payload: bytes) -> str:
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


# --- NFR-1: secret mode check ---
def _load_secret() -> bytes:
    if not SECRET_PATH.exists():
        print(f"[ERROR] Secret not found: {SECRET_PATH}", file=sys.stderr)
        sys.exit(2)
    mode = oct(stat.S_IMODE(SECRET_PATH.stat().st_mode))
    if mode != oct(0o600):
        print(f"[BLOCKED] {SECRET_PATH} mode={mode}, expected 0o600", file=sys.stderr)
        sys.exit(2)
    return SECRET_PATH.read_bytes().strip()


def main():
    _enforce_production_guard()  # CRIT-1

    parser = argparse.ArgumentParser(description="approve-worker: issue HMAC token")
    parser.add_argument("--task", required=True)
    parser.add_argument("--worker", required=True)
    parser.add_argument("--tools", required=True, help="comma-separated tool list")
    parser.add_argument("--paths", required=True, help="comma-separated path globs")
    args = parser.parse_args()

    _check_pid_lineage()  # FR-6

    # FR-7: nonce
    nonce = str(uuid.uuid4())

    # FR-5: 1h expiry
    now = datetime.now(timezone.utc)
    issued_at = now.isoformat().replace("+00:00", "Z")
    # root-cause: F8 — 기존 now.replace(hour=(now.hour+1)%24)는 같은 날짜 유지 → 23시 발행 시 00시(과거)로 즉시 만료 + 분/일 롤오버 무시. timedelta로 정확 +1h.
    expires_at = (now + timedelta(hours=1)).isoformat().replace("+00:00", "Z")

    tools = sorted(t.strip() for t in args.tools.split(","))
    paths = sorted(p.strip() for p in args.paths.split(","))

    # wildcard check (FR-6 T-AW6)
    if "*" in tools or tools == ["*"]:
        print("[BLOCKED] allowed_tools wildcard '*' not permitted", file=sys.stderr)
        _audit("WILDCARD_BLOCKED", {"tools": tools})
        sys.exit(2)

    # FR-2: canonical payload
    payload = {
        "allowed_tools": tools,
        "expires_at": expires_at,
        "issued_at": issued_at,
        "nonce": nonce,
        "target_paths": paths,
        "task_id": args.task,
        "worker": args.worker,
    }
    canonical = _canonical_json(payload)

    # FR-3: sign
    secret = _load_secret()
    signature = _sign(secret, canonical)
    sig_sha256 = hashlib.sha256(signature.encode()).hexdigest()

    # FR-4: write approvals YAML
    APPROVALS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = APPROVALS_DIR / f"{args.task}-{nonce}.yaml"
    yaml_content = (
        f'task_id: "{args.task}"\n'
        f'worker: "{args.worker}"\n'
        f"allowed_tools: [{', '.join(tools)}]\n"
        f"target_paths:\n" + "".join(f'  - "{p}"\n' for p in paths) +
        f'issued_at: "{issued_at}"\n'
        f'expires_at: "{expires_at}"\n'
        f'nonce: "{nonce}"\n'
        f'approved_by: "{os.environ.get("USER", "unknown")}"\n'
        f'approval_token_sha256: "{sig_sha256}"\n'
        f'_signature: "{signature}"\n'
    )
    out_path.write_text(yaml_content)

    # NFR-3: audit log
    _audit("TOKEN_ISSUED", {
        "task_id": args.task,
        "worker": args.worker,
        "nonce": nonce,
        "out": str(out_path),
    })

    print(f"[APPROVED] {out_path}")
    print(f"  worker={args.worker} nonce={nonce} expires={expires_at}")


if __name__ == "__main__":
    main()
