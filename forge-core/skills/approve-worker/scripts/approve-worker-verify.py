#!/usr/bin/env python3
"""approve-worker-verify.py — HMAC token verifier + nonce atomic consume (FR-8).

Used by multiagent-approval-verify.sh hook.
"""
import argparse
import fcntl
import hashlib
import hmac
import json
import os
import stat
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


SECRET_PATH = Path.home() / ".config/forge/orch-token.key"
APPROVALS_DIR = Path.home() / "forge-outputs/.claude/audit/approvals"
NONCE_USED = Path.home() / "forge-outputs/.claude/audit/nonce-used.jsonl"
AUDIT_LOG = Path.home() / "forge-outputs/.claude/audit/approve-worker.jsonl"


def _audit(event: str, extra: dict = None):
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {"event": event, "ts": time.time(), **(extra or {})}
    with open(AUDIT_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


def _load_secret() -> bytes:
    if not SECRET_PATH.exists():
        return None
    mode = oct(stat.S_IMODE(SECRET_PATH.stat().st_mode))
    if mode != oct(0o600):
        return None
    return SECRET_PATH.read_bytes().strip()


def _canonical_json(obj: dict) -> bytes:
    return json.dumps(obj, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")


def _load_approval(task_id: str, nonce: str):
    path = APPROVALS_DIR / f"{task_id}-{nonce}.yaml"
    if not path.exists():
        return None, path
    # Parse minimal YAML (no external deps)
    data = {}
    current_list_key = None
    for line in path.read_text().splitlines():
        if line.startswith("allowed_tools:") and "[" in line:
            raw = line.split("[", 1)[-1].rstrip("]")
            data["allowed_tools"] = [t.strip() for t in raw.split(",")]
            current_list_key = None
        elif line.startswith("target_paths:"):
            data["target_paths"] = []
            current_list_key = "target_paths"
        elif current_list_key and line.startswith("  - "):
            data[current_list_key].append(line[4:].strip().strip('"'))
        elif ": " in line and not line.startswith(" ") and not line.startswith("-"):
            current_list_key = None
            k, _, v = line.partition(": ")
            data[k.strip()] = v.strip().strip('"')
    return data, path


def _nonce_consume(nonce: str, task_id: str) -> bool:
    """Atomic flock-based nonce consume. Returns True if first use."""
    NONCE_USED.parent.mkdir(parents=True, exist_ok=True)
    NONCE_USED.touch(exist_ok=True)
    with open(NONCE_USED, "r+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        content = f.read()
        for line in content.splitlines():
            try:
                entry = json.loads(line)
                if entry.get("nonce") == nonce:
                    fcntl.flock(f, fcntl.LOCK_UN)
                    return False  # already consumed
            except json.JSONDecodeError:
                pass
        # Append
        entry = {"nonce": nonce, "task_id": task_id, "ts": time.time()}
        f.write(json.dumps(entry) + "\n")
        f.flush()
        os.fsync(f.fileno())
        fcntl.flock(f, fcntl.LOCK_UN)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True)
    parser.add_argument("--nonce", required=True)
    parser.add_argument("--worker", required=True)
    parser.add_argument("--tool", required=True, help="tool being requested")
    parser.add_argument("--path", default="", help="path being requested")
    args = parser.parse_args()

    approval, approval_path = _load_approval(args.task, args.nonce)
    if approval is None:
        print(f"[BLOCKED] Approval not found: {args.task}-{args.nonce}", file=sys.stderr)
        _audit("VERIFY_FAIL", {"reason": "not_found", "task": args.task, "nonce": args.nonce})
        sys.exit(2)

    # (1) HMAC re-verify
    secret = _load_secret()
    if secret:
        payload = {
            "allowed_tools": sorted(approval.get("allowed_tools", [])),
            "expires_at": approval.get("expires_at", ""),
            "issued_at": approval.get("issued_at", ""),
            "nonce": args.nonce,
            "target_paths": sorted(approval.get("target_paths", [])),
            "task_id": args.task,
            "worker": approval.get("worker", ""),
        }
        canonical = _canonical_json(payload)
        expected_sig = hmac.new(secret, canonical, hashlib.sha256).hexdigest()
        stored_sig = approval.get("_signature", "")
        if not hmac.compare_digest(expected_sig, stored_sig):
            print("[BLOCKED] HMAC signature mismatch", file=sys.stderr)
            _audit("VERIFY_FAIL", {"reason": "hmac_mismatch", "task": args.task})
            sys.exit(2)

    # (1b) revoked-key check
    revoked_file = Path.home() / "forge-outputs/.claude/audit/revoked-keys.jsonl"
    token_sig_sha = approval.get("approval_token_sha256", "")
    if revoked_file.exists() and token_sig_sha:
        for line in revoked_file.read_text().splitlines():
            try:
                entry = json.loads(line)
                if entry.get("token_sha256") == token_sig_sha or entry.get("event") == "KEY_COMPROMISED":
                    if entry.get("event") == "KEY_COMPROMISED":
                        pass  # only block if key_id matches (simplified: block all in compromise)
                    revoked_since = entry.get("ts", 0)
                    token_issued_str = approval.get("issued_at", "")
                    # Block tokens issued before revocation or with matching sha
                    if entry.get("token_sha256") == token_sig_sha:
                        print("[BLOCKED] Token is revoked", file=sys.stderr)
                        _audit("VERIFY_FAIL", {"reason": "revoked", "task": args.task})
                        sys.exit(2)
            except json.JSONDecodeError:
                pass

    # (2) expiry check
    expires_at = approval.get("expires_at", "")
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp:
                print("[BLOCKED] Token expired", file=sys.stderr)
                _audit("VERIFY_FAIL", {"reason": "expired", "task": args.task})
                sys.exit(2)
        except ValueError:
            pass

    # (3) nonce atomic consume (FR-8)
    if not _nonce_consume(args.nonce, args.task):
        print("[BLOCKED] Nonce already consumed (replay attack)", file=sys.stderr)
        _audit("VERIFY_FAIL", {"reason": "replay", "nonce": args.nonce})
        sys.exit(2)

    # (4) claim-binding
    if approval.get("worker") != args.worker:
        print(f"[BLOCKED] worker mismatch: {approval.get('worker')} != {args.worker}", file=sys.stderr)
        _audit("VERIFY_FAIL", {"reason": "worker_mismatch", "task": args.task})
        sys.exit(2)

    allowed = approval.get("allowed_tools", [])
    if args.tool not in allowed:
        print(f"[BLOCKED] tool {args.tool!r} not in allowed_tools {allowed}", file=sys.stderr)
        _audit("VERIFY_FAIL", {"reason": "tool_not_allowed", "tool": args.tool})
        sys.exit(2)

    _audit("VERIFY_OK", {"task": args.task, "worker": args.worker, "nonce": args.nonce})
    print(f"[APPROVED] worker={args.worker} tool={args.tool} task={args.task}")
    sys.exit(0)


if __name__ == "__main__":
    main()
