#!/usr/bin/env python3
"""
same-issue-key.py — AD-93 W1 (amendments §A2)
bug-report.md에서 버그 N번의 트리플 키를 추출하여 sha256 반환.

Usage:
  python3 same-issue-key.py --report docs/qa/2026-05-23-bug-report.md --bug 1
  python3 same-issue-key.py --report <path> --bug <N>

Output:
  PRIMARY_KEY=<sha256(file_path:symbol:error_class)>
  BACKUP_KEY=<sha256(error_message[:80])>
  MATCH=true  # if PRIMARY_KEY already in same-issue tracker
"""

import argparse
import hashlib
import json
import os
import re
import sys


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def extract_bug_section(report_path: str, bug_num: int) -> str:
    """Extract text block for Bug #N from bug-report.md."""
    try:
        with open(report_path, encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        sys.stderr.write(f"ERROR: {report_path} not found\n")
        sys.exit(1)

    # Match "Bug #N" or "## Bug N" section
    patterns = [
        rf"(?:^|\n)(?:##?\s*)?Bug\s+#{bug_num}\b(.*?)(?=(?:\n##?\s*Bug\s+#|\Z))",
        rf"(?:^|\n)(?:##?\s*)?버그\s+#{bug_num}\b(.*?)(?=(?:\n##?\s*버그\s+#|\Z))",
    ]
    for pattern in patterns:
        m = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
        if m:
            return m.group(0)

    # Fallback: return entire content
    sys.stderr.write(f"WARN: Bug #{bug_num} section not found — using full report\n")
    return content


def extract_file_path(section: str) -> str:
    """Extract file path from 'Where' / '영향 파일' / 'file:' markers."""
    patterns = [
        r"(?:Where|어디|영향\s*파일|file)[:\s]+([^\s\n]+\.[a-zA-Z]{1,5})",
        r"(?:^|\n)\s*[-*]\s*([^\s\n]+\.[a-zA-Z]{1,5})\s*(?::|—)",
        r"`([^`\n]+\.[a-zA-Z]{1,5})`",
    ]
    for p in patterns:
        m = re.search(p, section, re.IGNORECASE)
        if m:
            path = m.group(1).strip()
            # Normalize to relative path
            if path.startswith("/"):
                path = re.sub(r"^/[^/]+/[^/]+/", "", path)
            return path
    return "unknown_file"


def extract_symbol_or_line(section: str) -> str:
    """Extract function/method name or line:N from section."""
    # Function/method name
    fn_patterns = [
        r"(?:function|def|func|method|fn)\s+([a-zA-Z_]\w+)",
        r"`([a-zA-Z_]\w+)\s*\()",
        r"([a-zA-Z_]\w+)\s*\(\s*\)\s*(?:throws|returns|→)",
    ]
    for p in fn_patterns:
        m = re.search(p, section, re.IGNORECASE)
        if m:
            return m.group(1)

    # Line number with ±5 window
    line_m = re.search(r"(?:line|L)[\s#:]?\s*(\d+)", section, re.IGNORECASE)
    if line_m:
        line_num = int(line_m.group(1))
        # Return range window
        return f"line:{max(1, line_num - 5)}-{line_num + 5}"

    return "unknown_symbol"


def extract_error_class(section: str) -> str:
    """Extract exception type / HTTP status / assert message (first 80 chars)."""
    # HTTP status code
    http_m = re.search(r"\b([45]\d{2})\b", section)
    if http_m:
        return f"HTTP_{http_m.group(1)}"

    # Exception type
    exc_patterns = [
        r"([A-Z][a-zA-Z]+(?:Error|Exception|Fault|Panic|Failure))",
        r"(?:Exception|Error):\s*([^\n]{1,60})",
        r"(?:assert|AssertionError)[:\s]+([^\n]{1,60})",
    ]
    for p in exc_patterns:
        m = re.search(p, section)
        if m:
            return m.group(1).strip()[:80]

    # First error-ish line
    err_lines = [
        line.strip() for line in section.split("\n")
        if any(kw in line.lower() for kw in ["error", "fail", "exception", "assert", "실패", "오류"])
        and len(line.strip()) > 5
    ]
    if err_lines:
        return err_lines[0][:80]

    return "unknown_error"


def load_tracker(tracker_path: str) -> dict:
    if os.path.exists(tracker_path):
        try:
            with open(tracker_path) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_tracker(tracker_path: str, tracker: dict) -> None:
    os.makedirs(os.path.dirname(tracker_path), exist_ok=True)
    with open(tracker_path, "w") as f:
        json.dump(tracker, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="same-issue-key.py — triple sha256 key")
    parser.add_argument("--report", required=True, help="Path to bug-report.md")
    parser.add_argument("--bug", type=int, required=True, help="Bug number")
    parser.add_argument(
        "--tracker",
        default="/tmp/qa-same-issue-tracker.json",
        help="Path to same-issue tracker JSON (default: /tmp/qa-same-issue-tracker.json)",
    )
    parser.add_argument("--increment", action="store_true", help="Increment count in tracker")
    parser.add_argument("--reset", action="store_true", help="Reset tracker")
    args = parser.parse_args()

    if args.reset:
        save_tracker(args.tracker, {})
        print("RESET")
        return

    section = extract_bug_section(args.report, args.bug)

    file_path = extract_file_path(section)
    symbol = extract_symbol_or_line(section)
    error_class = extract_error_class(section)

    triple = f"{file_path}:{symbol}:{error_class}"
    primary_key = sha256(triple)

    # Backup key (amendments §I.7 — false-negative 보완)
    error_msg_raw = error_class[:80]
    backup_key = sha256(error_msg_raw)

    tracker = load_tracker(args.tracker)
    current_count = tracker.get(primary_key, {}).get("count", 0)

    match = current_count > 0

    if args.increment:
        tracker[primary_key] = {
            "count": current_count + 1,
            "triple": triple,
            "file_path": file_path,
            "symbol": symbol,
            "error_class": error_class,
        }
        save_tracker(args.tracker, tracker)
        current_count = tracker[primary_key]["count"]

    print(f"PRIMARY_KEY={primary_key}")
    print(f"BACKUP_KEY={backup_key}")
    print(f"TRIPLE={triple}")
    print(f"COUNT={current_count}")
    print(f"MATCH={'true' if match else 'false'}")

    # Check same-issue threshold (3회)
    if current_count >= 3:
        sys.stderr.write(
            f"[STOP same-issue-key] same-issue {current_count}회 초과 "
            f"(key={primary_key[:12]}...). Human 검토 필요.\n"
        )
        sys.exit(3)


if __name__ == "__main__":
    main()
