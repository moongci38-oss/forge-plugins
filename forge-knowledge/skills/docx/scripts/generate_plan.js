'use strict';
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, WidthType, ShadingType, BorderStyle,
  VerticalAlign, HeadingLevel, PageNumber
} = require('docx');

// ─── 레이아웃 상수 (SKILL.md 기준) ───────────────────────────────────────
const PAGE_W   = 19800;  // DXA
const PAGE_H   = 14040;
const MARGIN   = 720;    // 0.5인치
const CONTENT_W = PAGE_W - MARGIN * 2;  // 18360 DXA

const FONT = 'Arial';
const SZ_HDR  = 19;  // 9.5pt (half-points)
const SZ_BODY = 17;  // 8.5pt
const SZ_H1   = 26;  // 13pt
const SZ_H2   = 24;  // 12pt
const SZ_H3   = 22;  // 11pt

const COL_HDR_FILL = '2E75B6';
const COL_P0 = 'E2EFDA';
const COL_P1 = 'FFF2CC';
const COL_P2 = 'E2F0D9';
const COL_P3 = 'EAE0F0';
// root-cause: BP/PC 카테고리 행 색상 구분 (OPEN-DECISIONS.md 지원)
const COL_BP = 'FDEBD0';  // 비즈니스 정책 — 연한 주황
const COL_PC = 'D6EAF8';  // 기획서 정책 — 연한 파랑
const COL_ALT = 'F5F5F5';
const BORDER_COLOR = 'CCCCCC';

const bdr = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const borders = { top: bdr, bottom: bdr, left: bdr, right: bdr };

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────
function cleanMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function detectPLevel(row) {
  // root-cause: BP/PC 카테고리 감지 추가 (OPEN-DECISIONS 지원)
  const s = row.join(' ');
  if (/\bP0\b/.test(s)) return 'P0';
  if (/\bP3\b/.test(s)) return 'P3';
  if (/\bP2\b/.test(s)) return 'P2';
  if (/\bP1\b/.test(s)) return 'P1';
  if (/\bBP[-\d]/.test(s) || s.includes('| BP |') || s.trim() === 'BP') return 'BP';
  if (/\bPC[-\d]/.test(s) || s.includes('| PC |') || s.trim() === 'PC') return 'PC';
  return null;
}

function pFill(plevel, rowIdx) {
  if (plevel === 'P0') return COL_P0;
  if (plevel === 'P1') return COL_P1;
  if (plevel === 'P2') return COL_P2;
  if (plevel === 'P3') return COL_P3;
  if (plevel === 'BP') return COL_BP;
  if (plevel === 'PC') return COL_PC;
  return rowIdx % 2 === 0 ? COL_ALT : 'FFFFFF';
}

function hdrCell(text, widthDxa) {
  return new TableCell({
    borders,
    width: { size: widthDxa, type: WidthType.DXA },
    shading: { fill: COL_HDR_FILL, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: cleanMd(text), font: FONT, size: SZ_HDR, bold: true, color: 'FFFFFF' })]
    })]
  });
}

function mkCell(text, widthDxa, fill) {
  return new TableCell({
    borders,
    width: { size: widthDxa, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text: cleanMd(text), font: FONT, size: SZ_BODY })]
    })]
  });
}

function buildTable(headers, rows, colWidths) {
  const hdrRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => hdrCell(h, colWidths[i]))
  });
  const dataRows = rows.map((row, ri) => {
    const pl = detectPLevel(row);
    const fill = pFill(pl, ri);
    return new TableRow({
      children: row.map((cell, ci) => mkCell(cell, colWidths[ci] || 1000, fill))
    });
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [hdrRow, ...dataRows]
  });
}

// ─── MD 파싱 ──────────────────────────────────────────────────────────────
function parseMd(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 제목
    const hm = line.match(/^(#{1,4})\s+(.+)$/);
    if (hm) { blocks.push({ type: 'heading', level: hm[1].length, text: cleanMd(hm[2]) }); i++; continue; }

    // 표
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i+1])) {
      const headers = line.split('|').slice(1,-1).map(c => c.trim());
      i += 2; // skip separator
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1,-1).map(c => c.trim()));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // 인용
    if (/^>/.test(line)) {
      blocks.push({ type: 'blockquote', text: cleanMd(line.replace(/^>\s*/, '')) });
      i++; continue;
    }

    // 리스트
    if (/^[-*]\s/.test(line)) {
      blocks.push({ type: 'list', text: cleanMd(line.replace(/^[-*]\s+/, '')) });
      i++; continue;
    }

    // 구분선
    if (/^---+$/.test(line.trim())) { blocks.push({ type: 'hr' }); i++; continue; }

    // 일반 텍스트
    const t = line.trim();
    if (t) blocks.push({ type: 'para', text: cleanMd(t) });
    i++;
  }
  return blocks;
}

// ─── 컬럼 폭 자동 계산 ────────────────────────────────────────────────────
// 컬럼 수에 따라 CONTENT_W를 비율로 분배
function calcColWidths(headers) {
  const n = headers.length;
  // 첫 컬럼(☐): 좁게, ID: 중간, 나머지: 균등
  if (headers[0] === '☐' || headers[0] === '') {
    const checkW = 300;
    const idW    = 500;
    const remain = CONTENT_W - checkW - idW;
    const other  = n - 2;
    const eachW  = Math.floor(remain / other);
    return [checkW, idW, ...Array(other).fill(eachW)];
  }
  const each = Math.floor(CONTENT_W / n);
  return Array(n).fill(each);
}

// ─── 블록 → docx elements ─────────────────────────────────────────────────
function blockToElements(block) {
  if (block.type === 'heading') {
    const szMap = { 1: SZ_H1+4, 2: SZ_H1, 3: SZ_H2, 4: SZ_H3 };
    return [new Paragraph({
      heading: block.level <= 2 ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2][block.level-1] : undefined,
      spacing: { before: 160, after: 80 },
      children: [new TextRun({ text: block.text, font: FONT, size: szMap[block.level] || SZ_H3, bold: block.level <= 3 })]
    })];
  }
  if (block.type === 'table') {
    const widths = calcColWidths(block.headers);
    return [buildTable(block.headers, block.rows, widths), new Paragraph({ spacing: { after: 100 }, children: [] })];
  }
  if (block.type === 'blockquote') {
    return [new Paragraph({
      indent: { left: 360 },
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: block.text, font: FONT, size: SZ_BODY, color: '555555', italics: true })]
    })];
  }
  if (block.type === 'list') {
    return [new Paragraph({
      indent: { left: 360, hanging: 180 },
      spacing: { before: 20, after: 20 },
      children: [new TextRun({ text: '• ' + block.text, font: FONT, size: SZ_BODY })]
    })];
  }
  if (block.type === 'hr') {
    return [new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
      spacing: { before: 80, after: 80 },
      children: []
    })];
  }
  if (block.type === 'para') {
    return [new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: block.text, font: FONT, size: SZ_BODY })]
    })];
  }
  return [];
}

// ─── 메인 ─────────────────────────────────────────────────────────────────
async function main() {
  const inputPath  = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error('usage: node generate_plan.js <input.md> <output.docx>');
    process.exit(1);
  }

  const md = fs.readFileSync(inputPath, 'utf8');
  const blocks = parseMd(md);
  const children = blocks.flatMap(blockToElements);

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }
        }
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: path.basename(inputPath), font: FONT, size: 16, color: '888888' })]
        })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '888888' })]
        })] })
      },
      children
    }]
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buf);
  console.log(`✅ ${path.basename(inputPath)} → ${path.basename(outputPath)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
