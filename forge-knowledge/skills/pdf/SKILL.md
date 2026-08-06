---
model: haiku
name: pdf
description: "Use for anything with PDF files: read/extract text/tables, merge/split/rotate/watermark, create new PDFs, fill forms, encrypt/decrypt, extract images, OCR scanned PDFs. Trigger: any .pdf file mentioned or requested."
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Processing Guide

<!-- root-cause(skills-3/S67-05, 2026-08-03 관측): 실제 파일은 소문자 reference.md/forms.md(ls 확인)인데 본문 6곳이 대문자 REFERENCE.md/FORMS.md를 가리켰다 — Linux(대소문자 구분 파일시스템)에서 죽은 참조. 파일명은 변경하지 않고 참조 표기만 소문자로 정정(전건 replace). -->

## Overview

This guide covers essential PDF processing operations using Python libraries and command-line tools. For advanced features, JavaScript libraries, and detailed examples, see reference.md. If you need to fill out a PDF form, read forms.md and follow its instructions.

## Quick Start

```python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract text
text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Python Libraries

### pypdf - Basic Operations

#### Merge PDFs
```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

#### Split PDF
```python
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
```

#### Extract Metadata
```python
reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}")
print(f"Author: {meta.author}")
print(f"Subject: {meta.subject}")
print(f"Creator: {meta.creator}")
```

#### Rotate Pages
```python
reader = PdfReader("input.pdf")
writer = PdfWriter()

page = reader.pages[0]
page.rotate(90)  # Rotate 90 degrees clockwise
writer.add_page(page)

with open("rotated.pdf", "wb") as output:
    writer.write(output)
```

### pdfplumber - Text and Table Extraction

#### Extract Text with Layout
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
```

#### Extract Tables
```python
with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            print(f"Table {j+1} on page {i+1}:")
            for row in table:
                print(row)
```

#### Advanced Table Extraction
```python
import pandas as pd

with pdfplumber.open("document.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:  # Check if table is not empty
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

# Combine all tables
if all_tables:
    combined_df = pd.concat(all_tables, ignore_index=True)
    combined_df.to_excel("extracted_tables.xlsx", index=False)
```

### reportlab - Create PDFs

#### Basic PDF Creation
```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter

# Add text
c.drawString(100, height - 100, "Hello World!")
c.drawString(100, height - 120, "This is a PDF created with reportlab")

# Add a line
c.line(100, height - 140, 400, height - 140)

# Save
c.save()
```

#### Create PDF with Multiple Pages
```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

# Add content
title = Paragraph("Report Title", styles['Title'])
story.append(title)
story.append(Spacer(1, 12))

body = Paragraph("This is the body of the report. " * 20, styles['Normal'])
story.append(body)
story.append(PageBreak())

# Page 2
story.append(Paragraph("Page 2", styles['Heading1']))
story.append(Paragraph("Content for page 2", styles['Normal']))

# Build PDF
doc.build(story)
```

#### Subscripts and Superscripts

**IMPORTANT**: Never use Unicode subscript/superscript characters (₀₁₂₃₄₅₆₇₈₉, ⁰¹²³⁴⁵⁶⁷⁸⁹) in ReportLab PDFs. The built-in fonts do not include these glyphs, causing them to render as solid black boxes.

Instead, use ReportLab's XML markup tags in Paragraph objects:
```python
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet

styles = getSampleStyleSheet()

# Subscripts: use <sub> tag
chemical = Paragraph("H<sub>2</sub>O", styles['Normal'])

# Superscripts: use <super> tag
squared = Paragraph("x<super>2</super> + y<super>2</super>", styles['Normal'])
```

For canvas-drawn text (not Paragraph objects), manually adjust font the size and position rather than using Unicode subscripts/superscripts.

## Command-Line Tools

### pdftotext (poppler-utils)
```bash
# Extract text
pdftotext input.pdf output.txt

# Extract text preserving layout
pdftotext -layout input.pdf output.txt

# Extract specific pages
pdftotext -f 1 -l 5 input.pdf output.txt  # Pages 1-5
```

### qpdf
```bash
# Merge PDFs
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# Split pages
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf
qpdf input.pdf --pages . 6-10 -- pages6-10.pdf

# Rotate pages
qpdf input.pdf output.pdf --rotate=+90:1  # Rotate page 1 by 90 degrees

# Remove password
qpdf --password=mypassword --decrypt encrypted.pdf decrypted.pdf
```

### pdftk (if available)
```bash
# Merge
pdftk file1.pdf file2.pdf cat output merged.pdf

# Split
pdftk input.pdf burst

# Rotate
pdftk input.pdf rotate 1east output rotated.pdf
```

## Common Tasks

### Extract Text from Scanned PDFs
```python
# Requires: pip install pytesseract pdf2image
import pytesseract
from pdf2image import convert_from_path

# Convert PDF to images
images = convert_from_path('scanned.pdf')

# OCR each page
text = ""
for i, image in enumerate(images):
    text += f"Page {i+1}:\n"
    text += pytesseract.image_to_string(image)
    text += "\n\n"

print(text)
```

### Add Watermark
```python
from pypdf import PdfReader, PdfWriter

# Create watermark (or load existing)
watermark = PdfReader("watermark.pdf").pages[0]

# Apply to all pages
reader = PdfReader("document.pdf")
writer = PdfWriter()

for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)

with open("watermarked.pdf", "wb") as output:
    writer.write(output)
```

### Extract Images
```bash
# Using pdfimages (poppler-utils)
pdfimages -j input.pdf output_prefix

# This extracts all images as output_prefix-000.jpg, output_prefix-001.jpg, etc.
```

### Password Protection
```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()

for page in reader.pages:
    writer.add_page(page)

# Add password
writer.encrypt("userpassword", "ownerpassword")

with open("encrypted.pdf", "wb") as output:
    writer.write(output)
```

## Quick Reference

| Task | Best Tool | Command/Code |
|------|-----------|--------------|
| Merge PDFs | pypdf | `writer.add_page(page)` |
| Split PDFs | pypdf | One page per file |
| Extract text | pdfplumber | `page.extract_text()` |
| Extract tables | pdfplumber | `page.extract_tables()` |
| Create PDFs | reportlab | Canvas or Platypus |
| Command line merge | qpdf | `qpdf --empty --pages ...` |
| OCR scanned PDFs | pytesseract | Convert to image first |
| Fill PDF forms | pdf-lib or pypdf (see forms.md) | See forms.md |

## 출판품질 모드 (--publication)

마크다운 → 출판품질 PDF 변환. grants 문서·리포트·보고서 등 인쇄 배포용.
gstack `make-pdf`(Bun 바이너리)를 Forge 환경(Playwright `page.pdf()` + print CSS)으로 이식.

### 전제 조건

```bash
pip install playwright markdown2
playwright install chromium
```

### 기본 사용 예시

```python
import asyncio
import markdown2
from playwright.async_api import async_playwright

PRINT_CSS = """
/* === Forge 출판품질 print CSS === */
@page {
    size: A4;
    margin: 25mm 20mm 30mm 20mm;    /* top right bottom left */

    @top-center {
        content: string(doc-title);
        font-family: Helvetica, Arial, sans-serif;
        font-size: 9pt;
        color: #555;
    }

    @bottom-center {
        content: counter(page) " / " counter(pages);
        font-family: Helvetica, Arial, sans-serif;
        font-size: 9pt;
        color: #555;
    }
}

@page :first {
    @top-center { content: none; }
}

/* 본문 타이포그래피 */
body {
    font-family: Helvetica Neue, Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #111;
}

h1 { string-set: doc-title content(); }

h1, h2, h3, h4 {
    page-break-after: avoid;
    orphans: 3; widows: 3;
}

/* 표 */
table {
    width: 100%;
    border-collapse: collapse;
    page-break-inside: avoid;
}
th, td {
    border: 1px solid #ccc;
    padding: 6px 10px;
    font-size: 10pt;
}
th { background: #f4f4f4; }

/* 코드 블록 */
pre, code {
    font-family: "Courier New", monospace;
    font-size: 9pt;
    background: #f8f8f8;
    page-break-inside: avoid;
}
pre { padding: 10px; border: 1px solid #ddd; white-space: pre-wrap; }

/* 페이지 나누기 제어 */
.page-break { page-break-before: always; }
p { orphans: 3; widows: 3; }
"""

COVER_TEMPLATE = """
<div class="cover" style="
    display:flex; flex-direction:column; justify-content:center;
    align-items:center; height:100vh; text-align:center;
    page-break-after:always;">
  <h1 style="font-size:28pt; margin-bottom:12pt;">{title}</h1>
  <p style="font-size:14pt; color:#555;">{subtitle}</p>
  <p style="font-size:11pt; color:#888; margin-top:40pt;">{date}</p>
</div>
"""

async def markdown_to_publication_pdf(
    md_path: str,
    out_pdf: str,
    title: str = "",
    subtitle: str = "",
    date: str = "",
    cover: bool = True,
    toc: bool = True,
):
    """마크다운 파일 → 출판품질 PDF (Playwright page.pdf + print CSS)"""
    from datetime import datetime

    with open(md_path, encoding="utf-8") as f:
        md_text = f.read()

    # 마크다운 → HTML 변환 (표·코드펜스·footnotes 지원)
    body_html = markdown2.markdown(
        md_text,
        extras=["tables", "fenced-code-blocks", "footnotes", "header-ids"],
    )

    # 표지
    cover_html = ""
    if cover and title:
        cover_html = COVER_TEMPLATE.format(
            title=title,
            subtitle=subtitle,
            date=date or datetime.today().strftime("%Y년 %m월 %d일"),
        )

    # 목차 자리표시자 (Paged.js 없이는 단순 앵커 목록)
    toc_html = ""
    if toc:
        import re
        headings = re.findall(r'^(#{1,3})\s+(.+)', md_text, re.MULTILINE)
        if headings:
            items = []
            for level, text in headings:
                indent = (len(level) - 1) * 20
                anchor = re.sub(r'[^a-z0-9가-힣]+', '-', text.lower()).strip('-')
                items.append(
                    f'<li style="margin-left:{indent}px">'
                    f'<a href="#{anchor}">{text}</a></li>'
                )
            toc_html = (
                '<div class="page-break"></div>'
                '<h2>목차</h2><ul style="list-style:none;padding:0">'
                + "\n".join(items) + "</ul>"
                '<div class="page-break"></div>'
            )

    full_html = f"""<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="utf-8">
<style>{PRINT_CSS}</style>
</head><body>
{cover_html}
{toc_html}
{body_html}
</body></html>"""

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page()
        await page.set_content(full_html, wait_until="networkidle")
        await page.pdf(
            path=out_pdf,
            format="A4",
            print_background=True,
            margin={"top": "25mm", "right": "20mm", "bottom": "30mm", "left": "20mm"},
        )
        await browser.close()

    print(f"출판품질 PDF 저장 완료: {out_pdf}")

# 실행 예시
asyncio.run(markdown_to_publication_pdf(
    md_path="report.md",
    out_pdf="report-publication.pdf",
    title="프로젝트 보고서",
    subtitle="2026년 상반기",
    cover=True,
    toc=True,
))
```

### Paged.js 폴백 옵션

Playwright 단독 `page.pdf()`는 CSS `@page` 머리글/바닥글을 일부만 지원합니다.
**더 정밀한 페이지네이션이 필요한 경우** Paged.js를 함께 사용합니다.

```python
PAGEDJS_CDN = "https://unpkg.com/pagedjs/dist/paged.polyfill.js"

# full_html의 <head>에 추가:
pagedjs_tag = f'<script src="{PAGEDJS_CDN}"></script>'

# page.pdf() 호출 전 Paged.js 렌더 완료 대기:
await page.set_content(full_html_with_pagedjs, wait_until="networkidle")
await page.wait_for_function("window.PagedPolyfill !== undefined")
await page.evaluate("() => window.PagedPolyfill.preview()")
await page.wait_for_function(
    "document.querySelectorAll('.pagedjs_page').length > 0",
    timeout=30000,
)
await page.pdf(path=out_pdf, format="A4", print_background=True)
```

### 빠른 참조

| 기능 | 기본 모드 | 출판품질 모드 |
|------|-----------|--------------|
| 라이브러리 | reportlab / pypdf | Playwright + markdown2 |
| 표지 | X | O (COVER_TEMPLATE) |
| 목차 | X | O (앵커 자동 생성) |
| 머리글/바닥글 | X | O (`@page` CSS) |
| 페이지번호 | X | O (`counter(page)`) |
| 타이포그래피 제어 | 제한적 | print CSS 완전 제어 |
| Paged.js 정밀 렌더 | X | 폴백 옵션 |
| 용도 | 추출·변환·병합 | 보고서·grants·인쇄 배포 |

## 마크다운→출판품질 PDF 파이프라인 (GS-B12)

표지+목차+워터마크가 있는 출판 수준 PDF 생성 워크플로우:

```python
# markdown_to_pdf.py — 4단계 파이프라인
# 1. MD → HTML (markdown2 + 코드 하이라이팅)
import markdown2, re, subprocess, tempfile, os

def md_to_pdf(md_path: str, out_pdf: str, *,
              title: str = "", watermark: str = "",
              cover_html: str = "", toc: bool = True) -> None:
    md_text = open(md_path).read()
    body = markdown2.markdown(md_text, extras=["fenced-code-blocks", "tables", "header-ids"])

    # 2. HTML 조립 (cover + TOC anchor + watermark CSS)
    wm_css = f"""
    body::before {{
        content: "{watermark}";
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%,-50%) rotate(-30deg);
        font-size: 80px; opacity: 0.08;
        color: #999; z-index: 9999; pointer-events: none;
    }}""" if watermark else ""

    cover = cover_html or (f"<div class='cover'><h1>{title}</h1></div>" if title else "")
    toc_js = "<script>/* auto TOC from h2/h3 */</script>" if toc else ""

    full_html = f"""<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <style>
    body {{ font-family: 'Noto Serif', serif; margin: 0; }}
    .cover {{ page-break-after: always; text-align: center; padding: 30vh 0; }}
    @page {{ margin: 2cm; @bottom-center {{ content: "- " counter(page) " -"; }} }}
    pre {{ background: #f5f5f5; padding: 1em; border-radius: 4px; overflow-x: auto; }}
    table {{ border-collapse: collapse; width: 100%; }}
    td, th {{ border: 1px solid #ccc; padding: 6px 10px; }}
    {wm_css}
    </style>{toc_js}</head>
    <body>{cover}{body}</body></html>"""

    # 3. Playwright 렌더 (Paged.js 포함)
    PAGEDJS = "https://unpkg.com/pagedjs/dist/paged.polyfill.js"
    full_html = full_html.replace("</head>", f'<script src="{PAGEDJS}"></script></head>')

    with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w") as f:
        f.write(full_html); tmp = f.name

    # 4. Chromium headless PDF
    subprocess.run([
        "playwright-cli", "pdf", f"file://{tmp}", out_pdf,
        "--format=A4", "--print-background"
    ], check=True)
    os.unlink(tmp)
```

**미리보기**: `playwright-cli screenshot file://{tmp} --filename=preview.png` 후 `Read("preview.png")`

| 기능 | 지원 |
|------|------|
| 표지 (Cover) | `cover_html` 파라미터 |
| 목차 (TOC) | `toc=True` (h2/h3 자동 앵커) |
| 워터마크 | `watermark="DRAFT"` |
| 페이지 번호 | CSS `counter(page)` |
| Paged.js 렌더 | CDN 자동 삽입 |

## Next Steps

- For advanced pypdfium2 usage, see reference.md
- For JavaScript libraries (pdf-lib), see reference.md
- If you need to fill out a PDF form, follow the instructions in forms.md
- For troubleshooting guides, see reference.md
