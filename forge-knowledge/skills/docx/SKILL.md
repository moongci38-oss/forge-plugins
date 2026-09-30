---
model: haiku
name: docx
description: "Use for creating, reading, editing, or manipulating Word documents (.docx): Word doc, tables of contents, headings, page numbers, letterheads, image insert/replace, find-and-replace, tracked changes, comments, report/memo/letter/template as .docx. NOT for PDFs, spreadsheets, Google Docs."
license: Proprietary. LICENSE.txt has complete terms
paths:
  - "**/*.docx"
  - "**/*.doc"
---

# DOCX creation, editing, and analysis

A .docx file is a ZIP archive containing XML files. Script paths are relative to this skill's directory.

## Quick Reference

| Task | Approach |
|------|----------|
| Read/analyze content | `pandoc --track-changes=all document.docx -o output.md` · raw XML: `python scripts/office/unpack.py document.docx unpacked/` |
| **MD → DOCX 변환** (한국어·표 포함) | `NODE_PATH=$(npm root -g) node scripts/md2docx.js input.md output.docx` |
| Create new document | `docx-js` script → validate (below) |
| Edit existing document | Unpack → edit XML → repack (below) |
| Legacy `.doc` → `.docx` (before editing) | `python scripts/office/soffice.py --headless --convert-to docx document.doc` |
| Render to images | `python scripts/office/soffice.py --headless --convert-to pdf document.docx` → `pdftoppm -jpeg -r 150 document.pdf page` |
| Accept all tracked changes (LibreOffice) | `python scripts/accept_changes.py input.docx output.docx` |

## Creating New Documents (docx-js)

Install: `npm install -g docx`. Write the script, then validate — if validation fails, unpack, fix the XML, and repack:
```bash
python scripts/office/validate.py doc.docx
```
상세(Setup·Page Size·Styles·Lists·Tables·Images·TOC·Headers/Footers 코드) → `reference/docx-js.md`

**Critical rules:**
- **Set page size explicitly** — docx-js defaults to A4; US Letter = 12240 x 15840 DXA (1440 DXA = 1 inch)
- **Landscape: pass portrait dimensions** (short edge = `width`) + `orientation: PageOrientation.LANDSCAPE`
- **Never use `\n`** — use separate Paragraph elements
- **Never use unicode bullets** — use `LevelFormat.BULLET` with numbering config
- **PageBreak must be in Paragraph** — standalone creates invalid XML
- **ImageRun requires `type`** (png/jpg/…) and `altText` (title, description, name)
- **Always set table `width` with DXA** — never `WidthType.PERCENTAGE` (breaks in Google Docs)
- **Tables need dual widths** — `columnWidths` AND cell `width`, both match; table width = sum of columnWidths
- **Always add cell margins** — `margins: { top: 80, bottom: 80, left: 120, right: 120 }`
- **Use `ShadingType.CLEAR`** — never SOLID for table shading
- **TOC requires HeadingLevel only** — no custom styles on heading paragraphs
- **Override built-in styles** with exact IDs ("Heading1", …) and include `outlineLevel` (0 for H1, 1 for H2)
- Arial as default font; keep titles black

## Editing Existing Documents

**Follow all 3 steps in order.** 단계 상세·XML 레퍼런스(schema 순서·tracked changes·comments·images) → `reference/xml-editing.md`

1. **Unpack**: `python scripts/office/unpack.py document.docx unpacked/` (pretty-print, run 병합, smart quote → entity. `--merge-runs false` 로 병합 생략)
2. **Edit XML** in `unpacked/word/`:
   - **Use "Claude" as the author** for tracked changes and comments, unless the user explicitly requests another name.
   - **Use the Edit tool directly for string replacement. Do not write Python scripts.**
   - **Use smart quotes for new content** via XML entities (`&#x2018;` `&#x2019;` `&#x201C;` `&#x201D;`).
   - **Comments**: `python scripts/comment.py unpacked/ 0 "Comment text with &amp; and &#x2019;"` (text pre-escaped; reply `--parent 0`; `--author "Name"`), then add markers to document.xml.
3. **Pack**: `python scripts/office/pack.py unpacked/ output.docx --original document.docx` (validates with auto-repair; `--validate false` to skip). Auto-repair fixes only `durableId` overflow and missing `xml:space="preserve"` — not malformed XML, nesting, relationships or schema violations.

**Pitfalls / rules:**
- Replace the entire `<w:r>` with `<w:del>`…`<w:ins>` siblings — never inject tracked-change tags inside a run; copy the original `<w:rPr>`.
- Only mark what changes (minimal edits). Deleting a whole paragraph → also put `<w:del/>` inside `<w:pPr><w:rPr>`.
- Inside `<w:del>`: `<w:delText>` / `<w:delInstrText>`. Reject another author's insertion by nesting `<w:del>` inside it; restore their deletion by adding `<w:ins>` after (don't modify it).
- `<w:commentRangeStart>`/`<w:commentRangeEnd>` are siblings of `<w:r>`, never inside `<w:r>`.
- `<w:pPr>` order: `pStyle`, `numPr`, `spacing`, `ind`, `jc`, `rPr` last · `xml:space="preserve"` on `<w:t>` with edge spaces · RSIDs 8-digit hex.

## Markdown → DOCX (한국어 문서)

**항상 이 스크립트 사용:**
```bash
NODE_PATH=$(npm root -g) node scripts/md2docx.js <input.md> <output.docx> [--body-sz 19 --hdr-sz 21]
# PLAN.md / OPEN-DECISIONS.md 등 운영툴 문서 (P레벨 색상 + 파란 헤더)
NODE_PATH=$(npm root -g) node scripts/generate_plan.js <input.md> <output.docx>
```
추가 문서 유형은 `scripts/generate_*.js` 로 별도 작성(`hdrCell`·`mkCell`·`buildTable`·`detectPLevel` 재사용). 레이아웃 값·P레벨 감지 규칙 → `reference/md2docx-korean.md`

## Dependencies

- **pandoc** (text extraction) · **docx** `npm install -g docx` · **LibreOffice** via `scripts/office/soffice.py` (PDF 변환) · **Poppler** `pdftoppm` (images)
