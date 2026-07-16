#!/usr/bin/env python3
"""fr-verdict 5-state 스키마 (fr_by_state) TDD fixture.

배경: 구 스키마는 fr_total/fr_done/fr_unmapped 3필드뿐이라 PARTIAL·CHANGED가 어느 쪽에도
계상되지 않고 유실됐다. verification-routing은 5-state를 요구하는데 산출물이 그 구분을 못 담았다.

케이스:
  T1: fr_by_state 합계 != fr_total → "기준1b 5-state 불변식 위반" 차단
  T2: fr_by_state 합계 == fr_total (PARTIAL 존재) → 불변식 위반 없음 + 기준1 메시지에 breakdown 표기
  T3 (회귀): fr_by_state 필드 없음(구 스키마) → 불변식 검사 미발동, 기존 동작 그대로

실행: python3 test_fr_5state.py   (exit 0 = ALL PASS)
"""
import glob
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PEV = str(Path(__file__).resolve().parent / "goal-pev.py")


def run_pev(workdir):
    env = dict(os.environ)
    env["QA_PLATEAU_EPSILON"] = "999"
    env["CLAUDE_SESSION_ID"] = "fr-5state-test"
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


def setup(workdir, fr_total, fr_done, fr_unmapped, by_state):
    qa = Path(workdir, "docs/qa")
    qa.mkdir(parents=True, exist_ok=True)
    specify = Path(workdir, ".specify")
    specify.mkdir(exist_ok=True)

    spec_name = "dummy-spec.md"
    spec_path = Path(workdir, spec_name)
    spec_path.write_text("# Spec\n- FR-001: 기능 A\n")
    past = time.time() - 100
    os.utime(spec_path, (past, past))

    verdict = {
        "fr_total": fr_total,
        "fr_done": fr_done,
        "fr_unmapped": fr_unmapped,
        "spec": spec_name,
        "generated_at": "2026-07-15T00:00:00Z",
    }
    if by_state is not None:
        verdict["fr_by_state"] = by_state
    (qa / "fr-verdict.json").write_text(json.dumps(verdict))
    (specify / "oracle-manifest.json").write_text(
        json.dumps({"spec": spec_name, "uiux": []})
    )


def case(name, fr_total, fr_done, fr_unmapped, by_state, expect_invariant, expect_breakdown):
    with tempfile.TemporaryDirectory() as wd:
        setup(wd, fr_total, fr_done, fr_unmapped, by_state)
        run_pev(wd)
        log = read_latest_log(wd)
    has_invariant = "5-state 불변식 위반" in log
    has_breakdown = "PARTIAL=" in log
    ok = has_invariant == expect_invariant and has_breakdown == expect_breakdown
    print(
        f"[{'PASS' if ok else 'FAIL'}] {name}: "
        f"invariant={has_invariant}(기대 {expect_invariant}) "
        f"breakdown={has_breakdown}(기대 {expect_breakdown})"
    )
    return ok


def main():
    results = [
        # T1: 합계 4 != fr_total 5 → 불변식 위반 차단
        case("T1 합계 불일치→차단", 5, 3, 0,
             {"DONE": 3, "PARTIAL": 1, "NOT_DONE": 0, "CHANGED": 0, "UNVERIFIABLE": 0},
             expect_invariant=True, expect_breakdown=True),
        # T2: 합계 일치 + PARTIAL 존재 → 불변식 OK, 기준1 메시지에 breakdown 표기
        case("T2 합계 일치+PARTIAL→breakdown 표기", 5, 3, 0,
             {"DONE": 3, "PARTIAL": 2, "NOT_DONE": 0, "CHANGED": 0, "UNVERIFIABLE": 0},
             expect_invariant=False, expect_breakdown=True),
        # T3 회귀: 구 스키마(fr_by_state 없음) → 불변식 검사 미발동
        case("T3 회귀 구스키마→검사 미발동", 5, 3, 0, None,
             expect_invariant=False, expect_breakdown=False),
    ]
    print()
    if all(results):
        print("ALL PASS")
        return 0
    print("FAIL")
    return 1


if __name__ == "__main__":
    sys.exit(main())
