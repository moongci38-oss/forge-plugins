#!/usr/bin/env python3
"""
bug-fix-plan-gen.py — AD-93 W2 (plan §갭 4 + §갭 16)
bug-report.md → bug-fix-plan.md + bug-fix-plan-diff.md 자동 생성.

Usage:
  python3 bug-fix-plan-gen.py --report docs/qa/2026-05-23-bug-report.md
  python3 bug-fix-plan-gen.py --report <path> [--output-dir docs/qa]
"""

import argparse
import os
import re
import sys
from datetime import datetime
from pathlib import Path


def extract_bugs(report_path: str) -> list[dict]:
    """Parse bug-report.md → list of bug dicts."""
    with open(report_path, encoding="utf-8") as f:
        content = f.read()

    bugs = []
    # Match ## Bug-N: {title} blocks
    pattern = re.compile(
        r"(?m)^##\s+Bug-(\d+)[:\s]+(.+?)$"
        r"(.*?)(?=^##\s+Bug-\d+[:\s]|\Z)",
        re.DOTALL | re.MULTILINE,
    )

    for m in pattern.finditer(content):
        bug_num = int(m.group(1))
        title = m.group(2).strip()
        body = m.group(3)

        # Extract fields
        what = _extract_field(body, r"\*\*What\*\*[:\s]+(.+)")
        where = _extract_field(body, r"\*\*Where\*\*[:\s]+(.+)")
        why = _extract_field(body, r"\*\*Why\*\*[:\s]+(.+)")
        how = _extract_field(body, r"\*\*How\*\*[:\s]+(.+)")  # reproducibility

        # File paths from Where
        files = _extract_file_paths(where or "")

        # Complexity heuristic
        complexity = _heuristic_complexity(files, how or "", body)

        # Regression risk
        regression = _heuristic_regression(body, complexity)

        # Healer strategy
        strategy = "병렬" if len(files) >= 2 or complexity in ("MODERATE", "HIGH") else "순차"

        bugs.append({
            "num": bug_num,
            "title": title,
            "cause": why or "(미특정 — Why 항목 확인 필요)",
            "files": files,
            "fix_direction": "(bug-fix-plan-gen.py 자동 생성 — 수동 보완 필요)",
            "regression": regression,
            "strategy": strategy,
            "complexity": complexity,
            "raw_where": where or "",
            "raw_how": how or "",
        })

    return bugs


def _extract_field(body: str, pattern: str) -> str:
    m = re.search(pattern, body, re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _extract_file_paths(where_text: str) -> list[str]:
    """Extract file paths from Where field."""
    paths = re.findall(r"[a-zA-Z0-9_\-/]+\.[a-zA-Z]{1,5}(?::[LlL]\d+)?", where_text)
    # Filter out common non-file words
    return [p for p in paths if "/" in p or "." in p.split("/")[-1]]


def _heuristic_complexity(files: list, how_text: str, body: str) -> str:
    """Heuristic complexity: SIMPLE/MODERATE/HIGH/AMBIGUOUS."""
    n_files = len(files)
    reproducibility = "3/3"
    m = re.search(r"(\d)/3", how_text)
    if m:
        reproducibility = m.group(0)

    has_cross = any(kw in body.lower() for kw in ["cross", "cascade", "downstream", "multiple", "api+db", "api+ui"])
    is_critical = "CRITICAL" in body.upper()

    if reproducibility in ("0/3",) or ("UNKNOWN" in body):
        return "AMBIGUOUS"
    if is_critical or has_cross or n_files >= 3:
        return "HIGH"
    if n_files >= 2 or reproducibility == "1/3":
        return "MODERATE"
    return "SIMPLE"


def _heuristic_regression(body: str, complexity: str) -> str:
    if complexity == "HIGH":
        return "HIGH"
    if complexity == "MODERATE" or any(kw in body.lower() for kw in ["auth", "session", "token", "db", "migration"]):
        return "MEDIUM"
    return "LOW"


def generate_fix_plan(bugs: list, report_path: str, output_dir: str) -> str:
    """Generate bug-fix-plan.md."""
    date = datetime.now().strftime("%Y-%m-%d")
    report_name = Path(report_path).stem

    lines = [
        f"# Bug Fix Plan — {report_name}",
        f"> 자동 생성: bug-fix-plan-gen.py | 날짜: {date}",
        f"> 소스: {report_path}",
        "",
    ]

    for bug in bugs:
        files_str = ", ".join(bug["files"]) if bug["files"] else "(미특정)"
        lines += [
            f"## Fix-{bug['num']}: {bug['title']}",
            "",
            f"- **원인 가설 (확정)**: {bug['cause']}",
            f"- **영향 파일**: {files_str}",
            f"- **수정 방향**: {bug['fix_direction']}",
            f"- **회귀 위험**: {bug['regression']}",
            f"- **healer 분담**: {bug['strategy']}",
            f"- **복잡도**: {bug['complexity']}",
            "",
        ]

    out_path = os.path.join(output_dir, f"{date}-bug-fix-plan.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return out_path


def generate_diff_plan(bugs: list, report_path: str, output_dir: str) -> str:
    """Generate bug-fix-plan-diff.md — healer worktree scope guard."""
    date = datetime.now().strftime("%Y-%m-%d")

    lines = [
        "# Bug Fix Plan Diff — Healer Worktree Scope Guard",
        f"> 소스: {report_path} | 생성: {date}",
        "> healer worktree는 이 파일에 열거된 경로만 수정 가능.",
        "",
        "## 허용 수정 파일 (healer worktree 범위)",
        "",
    ]

    all_files = []
    for bug in bugs:
        if bug["files"]:
            lines.append(f"### Bug-{bug['num']}: {bug['title']}")
            for fp in bug["files"]:
                lines.append(f"- `{fp}`")
                all_files.append(fp)
            lines.append("")

    if not all_files:
        lines.append("_(파일 경로 미특정 — bug-report.md Where 필드 보완 필요)_")
        lines.append("")

    lines += [
        "## 범위 외 수정 차단",
        "",
        "phase-gate hook: healer가 위 목록 외 파일 수정 시도 = exit 2 차단.",
        "BYPASS: `BYPASS_QA_PHASE_GATE=1`",
    ]

    out_path = os.path.join(output_dir, f"{date}-bug-fix-plan-diff.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return out_path


def main():
    parser = argparse.ArgumentParser(description="bug-fix-plan-gen.py")
    parser.add_argument("--report", required=True, help="Path to bug-report.md")
    parser.add_argument("--output-dir", default="docs/qa", help="Output directory")
    args = parser.parse_args()

    if not os.path.exists(args.report):
        sys.stderr.write(f"ERROR: {args.report} not found\n")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    bugs = extract_bugs(args.report)
    if not bugs:
        sys.stderr.write(f"WARN: Bug-N 섹션 미발견. {args.report} 형식 확인.\n")
        sys.exit(0)

    plan_path = generate_fix_plan(bugs, args.report, args.output_dir)
    diff_path = generate_diff_plan(bugs, args.report, args.output_dir)

    print(f"Generated: {plan_path}")
    print(f"Generated: {diff_path}")
    print(f"Bugs processed: {len(bugs)}")


if __name__ == "__main__":
    main()
