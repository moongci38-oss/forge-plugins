#!/usr/bin/env python3
"""oracle advisory (backlog b) TDD fixture.

옵션 A: unmapped FR 발견 시 advisory 로그 출력 + 자동 실행 X.

케이스:
  T1 (RED→GREEN): fr_unmapped>0 → [ORACLE-ADVISORY] 로그 포함
  T2 (회귀): manifest 없음 → advisory 없음 (coarse 폴백 동일)
  T3 (회귀): fr_unmapped=0 → advisory 없음 (FR 100% 충족 시 advisory 불필요)

실행: python3 test_oracle_advisory.py   (exit 0 = ALL PASS)
"""
import glob
import json
import os
import subprocess
import sys
import time
import tempfile
from pathlib import Path

PEV = str(Path(__file__).resolve().parent / "goal-pev.py")


def run_pev(workdir):
    env = dict(os.environ)
    env["QA_PLATEAU_EPSILON"] = "999"
    env["CLAUDE_SESSION_ID"] = "advisory-test"
    p = subprocess.run(
        [sys.executable, PEV, "--condition", "test", "--scope", "full"],
        cwd=workdir, env=env, capture_output=True, text=True, timeout=60,
    )
    if "Traceback" in p.stderr:
        raise RuntimeError(f"goal-pev CRASHED:\n{p.stderr[-600:]}")
    return p


def read_latest_log(workdir):
    logs = sorted(glob.glob(str(Path(workdir, "docs/qa/goal-loop-*.log"))), reverse=True)
    return Path(logs[0]).read_text(encoding="utf-8") if logs else ""


def setup_oracle_fixture(workdir, fr_unmapped, fr_total=5, fr_done=None, uiux=None):
    """oracle-manifest + fr-verdict fixture. fr-verdict mtime > spec mtime → fresh."""
    if fr_done is None:
        fr_done = fr_total - fr_unmapped
    qa = Path(workdir, "docs/qa")
    qa.mkdir(parents=True, exist_ok=True)
    specify = Path(workdir, ".specify")
    specify.mkdir(exist_ok=True)

    spec_name = "dummy-spec.md"
    spec_path = Path(workdir, spec_name)
    spec_path.write_text("# Spec\n- FR-001: 기능 A\n- FR-002: 기능 B\n")
    past = time.time() - 100
    os.utime(spec_path, (past, past))

    (qa / "fr-verdict.json").write_text(json.dumps({
        "fr_total": fr_total,
        "fr_done": fr_done,
        "fr_unmapped": fr_unmapped,
        "spec": spec_name,
        "generated_at": "2026-06-26T00:00:00Z",
    }))

    (specify / "oracle-manifest.json").write_text(json.dumps({
        "spec": spec_name,
        "uiux": uiux or [],
    }))

    # goal-loop-state.json (fresh start)
    (qa / "goal-loop-state.json").write_text(json.dumps(
        {"cycle": 0, "same_issue_count": {}, "history": []}
    ))


results = {}

# ── T1: fr_unmapped>0 → [ORACLE-ADVISORY] 로그 포함 ──
with tempfile.TemporaryDirectory() as d:
    setup_oracle_fixture(d, fr_unmapped=2, fr_total=5)
    run_pev(d)
    log = read_latest_log(d)
    has_advisory = "[ORACLE-ADVISORY]" in log
    has_forge_impl = "/forge-implement --spec" in log
    no_auto_exec = "forge-implement" not in log.split("[ORACLE-ADVISORY]")[-1].split("\n")[0].split(" auto")[0] if has_advisory else True
    # advisory 있고, --spec 포함, 자동실행 아님(ORACLE-ADVISORY 줄에 "자동 실행 X" 포함)
    advisory_safe = "자동 실행 X" in log if has_advisory else False
    results["T1 unmapped→advisory 출력"] = (
        has_advisory and has_forge_impl and advisory_safe,
        {"advisory": has_advisory, "spec": has_forge_impl, "safe": advisory_safe},
    )

# ── T2 (회귀): manifest 없음 → advisory 없음 ──
with tempfile.TemporaryDirectory() as d:
    qa = Path(d, "docs/qa")
    qa.mkdir(parents=True, exist_ok=True)
    (qa / "goal-loop-state.json").write_text(json.dumps(
        {"cycle": 0, "same_issue_count": {}, "history": []}
    ))
    run_pev(d)
    log = read_latest_log(d)
    results["T2 manifest없음→advisory없음"] = (
        "[ORACLE-ADVISORY]" not in log,
        {"advisory_absent": "[ORACLE-ADVISORY]" not in log},
    )

# ── T3 (회귀): fr_unmapped=0 (FR 100% 충족) → advisory 없음 ──
with tempfile.TemporaryDirectory() as d:
    setup_oracle_fixture(d, fr_unmapped=0, fr_total=5, fr_done=5)
    run_pev(d)
    log = read_latest_log(d)
    results["T3 fr_unmapped=0→advisory없음"] = (
        "[ORACLE-ADVISORY]" not in log,
        {"advisory_absent": "[ORACLE-ADVISORY]" not in log},
    )

# ── 결과 출력 ──
all_pass = True
for name, (ok, detail) in results.items():
    status = "PASS" if ok else "FAIL"
    if not ok:
        all_pass = False
    print(f"[{status}] {name}: {detail}")

if all_pass:
    print("\nALL PASS")
    sys.exit(0)
else:
    print("\nFAIL")
    sys.exit(1)
