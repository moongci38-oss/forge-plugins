#!/usr/bin/env python3
"""Markdown -> publication-quality PDF (print CSS + cover + TOC + watermark, optional Paged.js).

Usage:
  python3 md_to_pdf.py IN.md OUT.pdf [--title T] [--subtitle S] [--date D]
                       [--no-cover] [--no-toc] [--watermark TEXT] [--pagedjs] [--html-only]

--html-only writes the assembled HTML to OUT (no browser) — for preview/tests.
Requires: markdown2 (or python-markdown as fallback); for PDF: playwright + `playwright install chromium`.
Details of the CSS/cover/Paged.js choices: ../reference/publication.md
"""
import argparse
import asyncio
import html
import re
import sys
from datetime import datetime

PRINT_CSS = """
@page {
    size: A4;
    margin: 25mm 20mm 30mm 20mm;
    @top-center { content: string(doc-title); font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: #555; }
    @bottom-center { content: counter(page) " / " counter(pages); font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: #555; }
}
@page :first { @top-center { content: none; } }
body { font-family: "Helvetica Neue", Helvetica, Arial, "Noto Sans KR", sans-serif; font-size: 11pt; line-height: 1.7; color: #111; }
h1 { string-set: doc-title content(); }
h1, h2, h3, h4 { page-break-after: avoid; orphans: 3; widows: 3; }
table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 6px 10px; font-size: 10pt; }
th { background: #f4f4f4; }
pre, code { font-family: "Courier New", monospace; font-size: 9pt; background: #f8f8f8; page-break-inside: avoid; }
pre { padding: 10px; border: 1px solid #ddd; white-space: pre-wrap; }
.page-break { page-break-before: always; }
p { orphans: 3; widows: 3; }
"""

COVER_TEMPLATE = """<div class="cover" style="display:flex; flex-direction:column; justify-content:center;
  align-items:center; height:100vh; text-align:center; page-break-after:always;">
  <h1 style="font-size:28pt; margin-bottom:12pt;">{title}</h1>
  <p style="font-size:14pt; color:#555;">{subtitle}</p>
  <p style="font-size:11pt; color:#888; margin-top:40pt;">{date}</p>
</div>"""

WATERMARK_CSS = """body::before {{ content: "{text}"; position: fixed; top: 50%; left: 50%;
  transform: translate(-50%,-50%) rotate(-30deg); font-size: 80px; opacity: 0.08;
  color: #999; z-index: 9999; pointer-events: none; }}"""

PAGEDJS_CDN = "https://unpkg.com/pagedjs/dist/paged.polyfill.js"


def slug(text):
    return re.sub(r"[^a-z0-9가-힣]+", "-", text.lower()).strip("-")


def md_to_html_body(md_text):
    try:
        import markdown2
        return markdown2.markdown(md_text, extras=["tables", "fenced-code-blocks", "footnotes", "header-ids"])
    except ImportError:
        import markdown
        return markdown.markdown(md_text, extensions=["tables", "fenced_code", "footnotes", "toc"],
                                 extension_configs={"toc": {"slugify": lambda v, sep: slug(v)}})


def build_html(md_text, title="", subtitle="", date="", cover=True, toc=True, watermark="", pagedjs=False):
    body = md_to_html_body(md_text)
    cover_html = ""
    if cover and title:
        cover_html = COVER_TEMPLATE.format(title=html.escape(title), subtitle=html.escape(subtitle),
                                           date=html.escape(date or datetime.today().strftime("%Y년 %m월 %d일")))
    toc_html = ""
    if toc:
        heads = re.findall(r"^(#{1,3})\s+(.+)", md_text, re.MULTILINE)
        if heads:
            items = [f'<li style="margin-left:{(len(l) - 1) * 20}px"><a href="#{slug(t)}">{html.escape(t)}</a></li>'
                     for l, t in heads]
            toc_html = ('<div class="page-break"></div><h2>목차</h2><ul class="toc" style="list-style:none;padding:0">'
                        + "\n".join(items) + '</ul><div class="page-break"></div>')
    css = PRINT_CSS + (WATERMARK_CSS.format(text=watermark.replace('"', '\\"')) if watermark else "")
    script = f'<script src="{PAGEDJS_CDN}"></script>' if pagedjs else ""
    return (f'<!DOCTYPE html>\n<html lang="ko"><head><meta charset="utf-8"><style>{css}</style>{script}</head>'
            f"<body>\n{cover_html}\n{toc_html}\n{body}\n</body></html>")


async def render_pdf(full_html, out_pdf, pagedjs=False):
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page()
        await page.set_content(full_html, wait_until="networkidle")
        if pagedjs:
            await page.wait_for_function("window.PagedPolyfill !== undefined")
            await page.evaluate("() => window.PagedPolyfill.preview()")
            await page.wait_for_function("document.querySelectorAll('.pagedjs_page').length > 0", timeout=30000)
        await page.pdf(path=out_pdf, format="A4", print_background=True,
                       margin={"top": "25mm", "right": "20mm", "bottom": "30mm", "left": "20mm"})
        await browser.close()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("md")
    ap.add_argument("out")
    ap.add_argument("--title", default="")
    ap.add_argument("--subtitle", default="")
    ap.add_argument("--date", default="")
    ap.add_argument("--no-cover", action="store_true")
    ap.add_argument("--no-toc", action="store_true")
    ap.add_argument("--watermark", default="")
    ap.add_argument("--pagedjs", action="store_true", help="precise pagination via Paged.js CDN")
    ap.add_argument("--html-only", action="store_true", help="write assembled HTML to OUT, skip browser")
    a = ap.parse_args(argv)
    with open(a.md, encoding="utf-8") as f:
        md_text = f.read()
    full = build_html(md_text, a.title, a.subtitle, a.date, not a.no_cover, not a.no_toc, a.watermark, a.pagedjs)
    if a.html_only:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(full)
    else:
        asyncio.run(render_pdf(full, a.out, a.pagedjs))
    print(f"saved: {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
