#!/usr/bin/env python3
"""Parse Figma URL → extract fileKey + nodeId (Figma MCP format).

Usage:
    python3 parse_figma_url.py <figma_url>

Output (JSON to stdout):
    {"fileKey": "...", "nodeId": "...", "branchKey": null}

Exit codes:
    0 — success
    1 — invalid URL or missing node-id
"""
import json
import re
import sys
from urllib.parse import urlparse, parse_qs


def parse(url: str) -> dict:
    parsed = urlparse(url)
    if "figma.com" not in parsed.netloc:
        raise ValueError(f"Not a Figma URL: {url}")

    path = parsed.path
    # Patterns:
    #   /design/:fileKey/:fileName
    #   /design/:fileKey/branch/:branchKey/:fileName
    #   /make/:makeFileKey/:makeFileName
    m_branch = re.match(r"^/design/([^/]+)/branch/([^/]+)/", path)
    m_design = re.match(r"^/design/([^/]+)/", path)
    m_make = re.match(r"^/make/([^/]+)/", path)

    if m_branch:
        file_key = m_branch.group(2)  # branch key takes precedence
        branch_key = m_branch.group(2)
    elif m_design:
        file_key = m_design.group(1)
        branch_key = None
    elif m_make:
        file_key = m_make.group(1)
        branch_key = None
    else:
        raise ValueError(f"Cannot extract fileKey: {url}")

    qs = parse_qs(parsed.query)
    node_raw = qs.get("node-id", [None])[0]

    if m_make and not node_raw:
        # Figma Make default
        node_id = "0:1"
    elif node_raw:
        node_id = node_raw.replace("-", ":")
    else:
        raise ValueError("URL missing node-id parameter — ask user for node-specific URL")

    return {"fileKey": file_key, "nodeId": node_id, "branchKey": branch_key}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: parse_figma_url.py <figma_url>", file=sys.stderr)
        sys.exit(1)
    try:
        result = parse(sys.argv[1])
        print(json.dumps(result, ensure_ascii=False))
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
