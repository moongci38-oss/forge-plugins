#!/usr/bin/env python3
"""
goal-pev.py — AD-93 §갭 9 (PEV 자율 루프)
Usage: python3 goal-pev.py --condition "scope=auth 모든 시나리오 PASS" [--scope auth] [--max-cycles 6]

PEV (Plan → Execute → Verify) 루프 오케스트레이터.
종료 조건 5종 중 하나 충족 시 즉시 종료.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


MAX_CYCLES = int(os.environ.get("QA_MAX_CYCLES", "6"))
TOKEN_CAP = int(os.environ.get("QA_TOKEN_CAP", "500000"))
STATE_FILE = "docs/qa/goal-loop-state.json"
SAME_ISSUE_FILE = "/tmp/qa-same-issue-tracker.json"


def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            return json.loads(Path(STATE_FILE).read_text())
        except Exception:
            pass
    return {"cycle": 0, "same_issue_count": {}, "token_usage": 0, "history": []}


def save_state(state: dict) -> None:
    os.makedirs("docs/qa", exist_ok=True)
    Path(STATE_FILE).write_text(json.dumps(state, indent=2))


def log(msg: str, log_file: str) -> None:
    ts = datetime.utcnow().isoformat() + "Z"
    line = f"[{ts}] {msg}"
    print(line)
    with open(log_file, "a") as f:
        f.write(line + "\n")


def check_qa_report(scope: str) -> dict:
    """Parse qa-report for PASS/FAIL summary."""
    import glob
    reports = sorted(glob.glob(f"docs/qa/*qa-report*.md"), reverse=True)
    if not reports:
        return {"status": "no-report", "pass": 0, "fail": 0}
    report = Path(reports[0]).read_text(encoding="utf-8")
    fail_count = report.count("FAIL") + report.count("❌")
    pass_count = report.count("PASS") + report.count("✅")
    return {
        "status": "pass" if fail_count == 0 else "fail",
        "pass": pass_count,
        "fail": fail_count,
        "report": reports[0],
    }


def check_regression(baseline_path: str = "docs/qa/baseline.json") -> bool:
    """True if regression detected."""
    if not os.path.exists(baseline_path):
        return False
    try:
        baseline = json.loads(Path(baseline_path).read_text())
        fails = [s for s in baseline.get("scenarios", []) if s.get("status") == "FAIL"]
        return len(fails) > 0
    except Exception:
        return False


def check_security_critical(report_path: str = "docs/qa/security-report.md") -> bool:
    """True if security CRITICAL found."""
    if not os.path.exists(report_path):
        return False
    content = Path(report_path).read_text(encoding="utf-8")
    import re
    return bool(re.search(r"^\*\*CRITICAL\*\*|^CRITICAL", content, re.MULTILINE))


def sha256_issue(file_path: str, symbol: str, error_class: str) -> str:
    return hashlib.sha256(f"{file_path}:{symbol}:{error_class}".encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description="goal-pev.py — PEV 자율 루프")
    parser.add_argument("--condition", required=True, help="종료 조건 문자열")
    parser.add_argument("--scope", default="full", help="QA 스코프")
    parser.add_argument("--max-cycles", type=int, default=MAX_CYCLES)
    args = parser.parse_args()

    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    log_file = f"docs/qa/goal-loop-{ts}.log"
    os.makedirs("docs/qa", exist_ok=True)

    log(f"[/goal] 시작. 종료 조건: {args.condition} | scope={args.scope}", log_file)

    state = load_state()

    while True:
        cycle = state["cycle"] + 1
        state["cycle"] = cycle
        log(f"[PEV 사이클 {cycle}/{args.max_cycles}]", log_file)

        # ─── 종료 조건 1: 사이클 초과
        if cycle > args.max_cycles:
            log(f"[END STOP] 6사이클 초과. Human 개입 필요.", log_file)
            state["result"] = "STOP_CYCLES"
            save_state(state)
            sys.exit(1)

        # ─── 종료 조건 2: 회귀 감지
        if check_regression():
            log("[END STOP] 회귀 감지. 즉시 종료.", log_file)
            state["result"] = "STOP_REGRESSION"
            save_state(state)
            sys.exit(1)

        # ─── 종료 조건 3: 보안 CRITICAL
        if check_security_critical():
            log("[END STOP] 보안 CRITICAL. 즉시 종료.", log_file)
            state["result"] = "STOP_SECURITY"
            save_state(state)
            sys.exit(1)

        # ─── Plan: qa-report 현황 확인
        result = check_qa_report(args.scope)
        log(f"[Plan] qa-report: status={result['status']} pass={result['pass']} fail={result['fail']}", log_file)

        # ─── 종료 조건 4: 모든 시나리오 PASS
        if result["status"] == "pass" and result["fail"] == 0:
            log(f"[END SUCCESS] 모든 시나리오 PASS. 종료 조건 충족: {args.condition}", log_file)
            state["result"] = "SUCCESS"
            save_state(state)
            sys.exit(0)

        # ─── Execute: 다음 액션 결정 (healer 재주입 큐 확인)
        queue_file = "docs/qa/cr-trigger-queue.jsonl"
        if os.path.exists(queue_file):
            with open(queue_file) as f:
                pending = [json.loads(l) for l in f if l.strip() and json.loads(l).get("status") == "pending"]
            log(f"[Execute] cr-trigger-queue: {len(pending)} pending entries", log_file)

        # ─── Verify: 토큰 캡 확인 (§A12)
        if state.get("token_usage", 0) >= TOKEN_CAP:
            log(f"[END STOP] QA_TOKEN_CAP={TOKEN_CAP} 도달.", log_file)
            state["result"] = "STOP_TOKEN_CAP"
            save_state(state)
            sys.exit(1)

        state["history"].append({"cycle": cycle, "result": result["status"], "ts": datetime.utcnow().isoformat()})
        save_state(state)
        log(f"[PEV 사이클 {cycle}] 완료. qa-report 재확인 필요 (fail={result['fail']}건 잔존).", log_file)

        # PEV 루프 계속 (메인 컨텍스트가 다음 액션 실행 후 재호출)
        # 실제 재주입은 check_ralph_loop (SubagentStop hook) 담당
        log("[/goal] 다음 사이클 대기. ralph-loop 또는 메인 컨텍스트 재호출 필요.", log_file)
        break  # 단일 실행 후 종료 (hook이 재주입)


if __name__ == "__main__":
    main()
