#!/usr/bin/env python3
"""figma_capture.py — Figma whitelist frame extractor.

Reads a manifest JSON (node-id whitelist) and a manifest.json (output).
Actual MCP calls are made by Claude; this script handles:
  - node-id format conversion (: → -)
  - manifest.json generation / update
  - screens/ directory management
  - 화면정의.md generation from manifest
  - mockup/index.html generation from manifest + template

Usage:
    # Generate manifest skeleton from whitelist CSV
    python3 figma_capture.py init --whitelist "40010405:23928,40010405:24045" --out ./dev-spec/login-signup-approval/

    # Generate 화면정의.md from manifest.json
    python3 figma_capture.py gen-md --manifest ./dev-spec/login-signup-approval/manifest.json --out ./dev-spec/login-signup-approval/

    # Generate mockup/index.html from manifest.json
    python3 figma_capture.py gen-html --manifest ./dev-spec/login-signup-approval/manifest.json --template <path/to/mockup-template.html> --out ./dev-spec/login-signup-approval/

Exit codes:
    0 — success
    1 — error
"""
import json
import os
import sys
from pathlib import Path


def node_to_mcp(node_id: str) -> str:
    """Convert Figma node-id to MCP format (: → -)."""
    return node_id.replace(":", "-")


def node_to_figma(node_id: str) -> str:
    """Convert MCP node-id back to Figma format (- → :)."""
    return node_id.replace("-", ":")


def init_manifest(whitelist: list[dict], out_dir: Path) -> dict:
    """Generate initial manifest.json skeleton from whitelist.

    whitelist: list of {"name": str, "node_id": str, "section": str, "status": str}
    """
    screens_dir = out_dir / "screens"
    screens_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "version": "1.0",
        "file_key": "",
        "page_node": "",
        "screens": []
    }

    for item in whitelist:
        raw_id = item["node_id"]
        mcp_id = node_to_mcp(raw_id)
        safe_name = item["name"].replace(" ", "_").replace("/", "_")
        png_file = f"{safe_name}_{mcp_id}.png"

        manifest["screens"].append({
            "name": item["name"],
            "node_id": raw_id,
            "mcp_node_id": mcp_id,
            "section": item.get("section", ""),
            "png": f"screens/{png_file}",
            "status": item.get("status", "⚠️MCP추출"),
            "notes": item.get("notes", ""),
            "components": [],
            "interactions": [],
            "domain_diff": []
        })

    return manifest


def gen_md(manifest: dict, out_dir: Path, title: str = "화면정의서") -> str:
    """Generate 02-화면정의.md from manifest."""
    lines = [
        f"# {title}",
        "",
        f"> 생성: Figma file `{manifest.get('file_key', '')}` | page `{manifest.get('page_node', '')}`",
        "> 코드 추출 X — 스크린샷 + 구조정의 (개발 단계 React 재구현)",
        "",
        "## node-id 매핑표",
        "",
        "| 화면명 | node-id | MCP node-id | PNG | 상태 |",
        "|--------|---------|-------------|-----|------|",
    ]

    for s in manifest.get("screens", []):
        lines.append(
            f"| {s['name']} | `{s['node_id']}` | `{s['mcp_node_id']}` "
            f"| `{s['png']}` | {s['status']} |"
        )

    lines += ["", "---", ""]

    # Group by section
    sections: dict[str, list] = {}
    for s in manifest.get("screens", []):
        sec = s.get("section", "기타")
        sections.setdefault(sec, []).append(s)

    for sec, screens in sections.items():
        lines += [f"## {sec}", ""]
        for s in screens:
            lines += [
                f"### {s['name']}",
                "",
                f"- **node-id**: `{s['node_id']}`",
                f"- **상태**: {s['status']}",
                f"- **PNG**: `{s['png']}`",
                "",
            ]
            if s.get("notes"):
                lines += [f"> {s['notes']}", ""]

            if s.get("components"):
                lines += ["**컴포넌트**", ""]
                for c in s["components"]:
                    lines.append(f"- {c}")
                lines.append("")

            if s.get("interactions"):
                lines += ["**인터랙션**", ""]
                for i in s["interactions"]:
                    lines.append(f"- {i}")
                lines.append("")

            if s.get("domain_diff"):
                lines += ["**도메인별 차이**", ""]
                for d in s["domain_diff"]:
                    lines.append(f"- {d}")
                lines.append("")

            lines.append("---")
            lines.append("")

    return "\n".join(lines)


def gen_html(manifest: dict, template_path: Path, out_dir: Path) -> str:
    """Generate mockup/index.html by injecting manifest into template."""
    template = template_path.read_text(encoding="utf-8")

    # Build sections list for filter tabs
    sections = list(dict.fromkeys(
        s.get("section", "기타") for s in manifest.get("screens", [])
    ))

    screens_json = json.dumps(manifest.get("screens", []), ensure_ascii=False, indent=2)
    sections_json = json.dumps(sections, ensure_ascii=False)

    html = template
    html = html.replace("__SCREENS_JSON__", screens_json)
    html = html.replace("__SECTIONS_JSON__", sections_json)
    html = html.replace("__FILE_KEY__", manifest.get("file_key", ""))
    html = html.replace("__PAGE_NODE__", manifest.get("page_node", ""))

    return html


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Figma screen capture helper")
    sub = parser.add_subparsers(dest="cmd")

    # init
    p_init = sub.add_parser("init", help="Generate manifest.json skeleton")
    p_init.add_argument("--whitelist", required=True,
                        help="Comma-separated node-ids OR path to whitelist JSON")
    p_init.add_argument("--names", help="Comma-separated names (parallel to --whitelist)")
    p_init.add_argument("--sections", help="Comma-separated sections")
    p_init.add_argument("--out", required=True, help="Output directory")
    p_init.add_argument("--file-key", default="", help="Figma file key")
    p_init.add_argument("--page-node", default="", help="Page node-id")

    # gen-md
    p_md = sub.add_parser("gen-md", help="Generate 화면정의.md from manifest.json")
    p_md.add_argument("--manifest", required=True)
    p_md.add_argument("--out", required=True)
    p_md.add_argument("--title", default="화면정의서")
    p_md.add_argument("--filename", default="02-화면정의.md")

    # gen-html
    p_html = sub.add_parser("gen-html", help="Generate mockup/index.html from manifest.json")
    p_html.add_argument("--manifest", required=True)
    p_html.add_argument("--template", required=True)
    p_html.add_argument("--out", required=True)

    args = parser.parse_args()

    if args.cmd == "init":
        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)

        # whitelist = node-ids
        node_ids = [n.strip() for n in args.whitelist.split(",") if n.strip()]
        names = [n.strip() for n in args.names.split(",")] if args.names else node_ids
        sections = [s.strip() for s in args.sections.split(",")] if args.sections else [""] * len(node_ids)

        whitelist = [
            {"name": names[i] if i < len(names) else node_ids[i],
             "node_id": node_ids[i],
             "section": sections[i] if i < len(sections) else ""}
            for i in range(len(node_ids))
        ]

        manifest = init_manifest(whitelist, out_dir)
        manifest["file_key"] = args.file_key
        manifest["page_node"] = args.page_node

        out_file = out_dir / "manifest.json"
        out_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✅ manifest.json → {out_file}")

    elif args.cmd == "gen-md":
        manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        md = gen_md(manifest, Path(args.out), args.title)
        out_file = Path(args.out) / args.filename
        out_file.write_text(md, encoding="utf-8")
        print(f"✅ {args.filename} → {out_file}")

    elif args.cmd == "gen-html":
        manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
        mockup_dir = Path(args.out) / "mockup"
        mockup_dir.mkdir(parents=True, exist_ok=True)
        html = gen_html(manifest, Path(args.template), Path(args.out))
        out_file = mockup_dir / "index.html"
        out_file.write_text(html, encoding="utf-8")
        print(f"✅ mockup/index.html → {out_file}")

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
