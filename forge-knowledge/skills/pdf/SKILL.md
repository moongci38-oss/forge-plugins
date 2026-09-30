---
model: haiku
name: pdf
description: "Use for anything with PDF files: read/extract text/tables, merge/split/rotate/watermark, create new PDFs, fill forms, encrypt/decrypt, extract images, OCR scanned PDFs. Trigger: any .pdf file mentioned or requested."
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Processing Guide

PDF 읽기·추출·병합·분할·회전·워터마크·생성·양식 채우기·암호화·이미지 추출·OCR, 그리고 마크다운 → 출판품질 PDF.

- 기본 코드 예시(pypdf·pdfplumber·reportlab·OCR·워터마크·암호) → `reference/basics.md`
- 고급(pypdfium2·pdf-lib·pdfjs-dist·문제 해결) → `reference.md`
- 양식 채우기 → **`forms.md` 를 먼저 읽고 그 절차를 그대로 따른다**
- 출판품질 모드 상세(print CSS·표지·Paged.js) → `reference/publication.md`

## 어떤 도구를 쓰나

| 할 일 | 도구 | 호출 |
|------|------|------|
| 병합·분할·회전·메타데이터 | pypdf | `PdfReader`/`PdfWriter`, `page.rotate(90)` |
| 텍스트·표 추출 | pdfplumber | `page.extract_text()` · `page.extract_tables()` |
| 새 PDF 만들기 | reportlab | Canvas 또는 Platypus |
| 명령줄 병합 | qpdf | `qpdf --empty --pages ...` |
| 스캔본 OCR | pytesseract + pdf2image | 이미지로 바꾼 뒤 OCR |
| 워터마크 | pypdf | `page.merge_page(watermark)` |
| 암호 걸기 | pypdf | `writer.encrypt("user", "owner")` |
| 양식 채우기 | pypdf / pdf-lib | `forms.md` |
| 보고서·grants·인쇄 배포 | Playwright + markdown2 | `scripts/md_to_pdf.py` |

**금지**: reportlab 에 유니코드 첨자 글자(₀₁₂, ⁰¹²)를 쓰지 않는다 — 기본 폰트에 글리프가 없어 검은 네모가 된다. `Paragraph` 안에서 `<sub>`/`<super>` 태그를 쓴다.

## 명령줄 도구

```bash
# pdftotext (poppler-utils)
pdftotext input.pdf output.txt
pdftotext -layout input.pdf output.txt          # 레이아웃 유지
pdftotext -f 1 -l 5 input.pdf output.txt        # 1~5쪽

# qpdf
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf
qpdf input.pdf output.pdf --rotate=+90:1        # 1쪽 90도
qpdf --password=mypassword --decrypt encrypted.pdf decrypted.pdf

# pdftk (있을 때만)
pdftk file1.pdf file2.pdf cat output merged.pdf
pdftk input.pdf burst
pdftk input.pdf rotate 1east output rotated.pdf

# 이미지 추출 → output_prefix-000.jpg ...
pdfimages -j input.pdf output_prefix
```

OCR 전제: `pip install pytesseract pdf2image`.

## 양식 채우기 (scripts/ — 순서는 forms.md 가 정한다)

```bash
python scripts/check_fillable_fields.py <file.pdf>                    # 채울 수 있는 필드가 있나
python scripts/extract_form_field_info.py <input.pdf> <field_info.json>
python scripts/fill_fillable_fields.py <input.pdf> <field_values.json> <output.pdf>
python scripts/extract_form_structure.py <input.pdf> form_structure.json   # 필드 없는 양식
python scripts/convert_pdf_to_images.py <file.pdf> <output_dir/>
python scripts/check_bounding_boxes.py fields.json                   # 채우기 전 반드시 검증
python scripts/fill_pdf_form_with_annotations.py <input.pdf> fields.json <output.pdf>
```

## 출판품질 모드 (--publication)

마크다운 → 표지·목차·머리글/바닥글·쪽번호·워터마크가 있는 A4 PDF. 조립·렌더는 스크립트가 한다 — 제목·부제·워터마크·옵션만 정한다.

```bash
pip install playwright markdown2 && playwright install chromium       # 전제
python3 scripts/md_to_pdf.py report.md report.pdf --title "프로젝트 보고서" --subtitle "2026년 상반기"
#   --watermark DRAFT   워터마크      --no-cover / --no-toc   표지·목차 끄기
#   --pagedjs           @page 머리글/바닥글이 부족할 때 Paged.js(CDN)로 정밀 페이지네이션
#   --html-only         브라우저 없이 조립된 HTML 만 저장(미리보기용)
```

미리보기: `--html-only` 로 HTML 을 만든 뒤 `playwright-cli open file://<html>` → `playwright-cli screenshot --filename=preview.png` → `Read("preview.png")`.

테스트: `bash scripts/tests/md_to_pdf.test.sh`
