#!/usr/bin/env python3
"""
contract-gen.py — AD-93 W3 (plan §갭 15 PGE Sprint Contract)
bug-fix-plan.md + scenarios-filtered.md → evaluator-contract.json 생성.

Usage:
  python3 contract-gen.py --plan docs/qa/2026-05-23-bug-fix-plan.md \
                           --scenarios docs/qa/scenarios-filtered.md \
                           [--output-dir docs/qa] [--scope auth]
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta


def extract_fr_list(scenarios_path: str) -> list[str]:
    """Extract FR IDs from scenarios-filtered.md."""
    if not os.path.exists(scenarios_path):
        return []
    frs = []
    with open(scenarios_path, encoding="utf-8") as f:
        for line in f:
            m = re.findall(r"FR-[A-Z0-9]+[-_][0-9]+|FR-[0-9]+", line, re.IGNORECASE)
            frs.extend(m)
    # Deduplicate preserving order
    seen = set()
    return [x for x in frs if not (x in seen or seen.add(x))]


def extract_scope(plan_path: str, scenarios_path: str) -> str:
    """Infer scope from file names or plan content."""
    for path in [plan_path, scenarios_path]:
        if path:
            m = re.search(r"(auth|payment|member|order|customer|admin|game)", path, re.IGNORECASE)
            if m:
                return m.group(1).lower()
    return "full"


def extract_bugs(plan_path: str) -> list[dict]:
    """Extract bug entries from bug-fix-plan.md."""
    if not os.path.exists(plan_path):
        return []
    bugs = []
    with open(plan_path, encoding="utf-8") as f:
        content = f.read()
    for m in re.finditer(r"## Fix-(\d+):(.*?)(?=^##|\Z)", content, re.DOTALL | re.MULTILINE):
        num = int(m.group(1))
        body = m.group(2)
        regression_m = re.search(r"\*\*회귀 위험\*\*:\s*(LOW|MEDIUM|HIGH)", body, re.IGNORECASE)
        complexity_m = re.search(r"\*\*복잡도\*\*:\s*(SIMPLE|MODERATE|HIGH|AMBIGUOUS)", body, re.IGNORECASE)
        bugs.append({
            "num": num,
            "regression": regression_m.group(1) if regression_m else "MEDIUM",
            "complexity": complexity_m.group(1) if complexity_m else "SIMPLE",
        })
    return bugs


def main():
    parser = argparse.ArgumentParser(description="contract-gen.py — PGE Sprint Contract")
    parser.add_argument("--plan", required=True, help="Path to bug-fix-plan.md")
    parser.add_argument("--scenarios", default="", help="Path to scenarios-filtered.md")
    parser.add_argument("--output-dir", default="docs/qa")
    parser.add_argument("--scope", default="", help="Scope override (auth/full/...)")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    fr_list = extract_fr_list(args.scenarios) if args.scenarios else []
    scope = args.scope or extract_scope(args.plan, args.scenarios)
    bugs = extract_bugs(args.plan)

    # High regression risk bug count
    high_regression = sum(1 for b in bugs if b["regression"] == "HIGH")
    rubric_threshold = 70

    deadline = (datetime.utcnow() + timedelta(hours=4)).isoformat() + "Z"

    contract = {
        "scope": scope,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "deadline": deadline,
        "criteria": {
            "FR_list": fr_list,
            "rubric_threshold": rubric_threshold,
            "regression_count": 0,
            "security_warn_delta": 0,
            "high_regression_bugs": high_regression,
        },
        "bugs": [{"num": b["num"], "regression": b["regression"], "complexity": b["complexity"]} for b in bugs],
        "evaluator_subagent": "general-purpose",
        "evaluator_model": "sonnet",
        "healer_model": "sonnet",
    }

    date = datetime.now().strftime("%Y-%m-%d")
    out_path = os.path.join(args.output_dir, f"{date}-evaluator-contract.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(contract, f, indent=2, ensure_ascii=False)

    print(f"Generated: {out_path}")
    print(f"FR count: {len(fr_list)}, Bugs: {len(bugs)}, Scope: {scope}")


if __name__ == "__main__":
    main()
