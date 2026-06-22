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
  TRIPLE=<file_path:symbol:error_class>

NOTE: 무상태(stateless) fingerprint 계산 전용. same-issue 연속 카운트/STOP 판정은 goal-pev.py가
in-process state(same_issue_count)로 수행한다. 옛 /tmp/qa-same-issue-tracker.json 기반 --increment/
--reset 트래커는 producer-consumer 쌍이 모두 사라진 orphan이라 제거했다(2026-06-17 follow-up #2).
"""

# root-cause: json·os import 제거 — load_tracker/save_tracker(트래커 stateful, orphan)와 함께 삭제되며 미사용.
import argparse
import hashlib
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
    # root-cause: 2번째 패턴 `r"...\s*\()"` 의 트레일링 `)` 가 unbalanced paren → re.error.
    # "function/def" 키워드 있는 bug는 1번째 패턴에서 early-return해 가려졌던 latent 버그
    # (goal-pev in-process 배선이 노출). 백틱 함수호출 `name(` 매칭이 의도 → 잘못된 `)` 제거.
    fn_patterns = [
        r"(?:function|def|func|method|fn)\s+([a-zA-Z_]\w+)",
        r"`([a-zA-Z_]\w+)\s*\(",
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


# root-cause: load_tracker/save_tracker + --increment/--reset/--tracker(stateful /tmp 트래커) 제거 —
#   producer(이 CLI --increment)도 consumer(qa-event-router/goal-pev)도 모두 in-process 전환으로 사라진
#   orphan. main()은 무상태 fingerprint 계산·출력 전용으로 단순화(수동 디버그 + goal-pev import용 함수 유지).
def main():
    parser = argparse.ArgumentParser(
        description="same-issue-key.py — triple sha256 fingerprint (file:symbol:error_class). 무상태.")
    parser.add_argument("--report", required=True, help="Path to bug-report.md")
    parser.add_argument("--bug", type=int, required=True, help="Bug number")
    args = parser.parse_args()

    section = extract_bug_section(args.report, args.bug)
    file_path = extract_file_path(section)
    symbol = extract_symbol_or_line(section)
    error_class = extract_error_class(section)

    triple = f"{file_path}:{symbol}:{error_class}"
    print(f"PRIMARY_KEY={sha256(triple)}")
    print(f"BACKUP_KEY={sha256(error_class[:80])}")  # amendments §I.7 — false-negative 보완
    print(f"TRIPLE={triple}")


if __name__ == "__main__":
    main()
