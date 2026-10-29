#!/usr/bin/env node
/**
 * Markdown → DOCX 고품질 변환 (Claude Desktop 동일 스타일)
 * 
 * 스타일 기준:
 * - 페이지: 19800×14040 DXA (13.75×9.75"), 여백 720 DXA (0.5")
 * - 폰트: Arial (eastAsia 포함)
 * - 테이블 헤더: 2E75B6 파란 배경, 흰 텍스트, CENTER 정렬
 * - P레벨 테이블: P0=E2EFDA, P1=FFF2CC, P2=E2F0D9, P3=EAE0F0 교번
 * - 일반 테이블: F5F5F5/FFFFFF 교번
 * - 셀 폰트: HDR_SZ=18 (9pt), BODY_SZ=16 (8pt) — 조정: --hdr-sz, --body-sz
 *
 * 사용법:
 *   NODE_PATH=$(npm root -g) node md2docx.js <input.md> <output.docx>
 *   NODE_PATH=$(npm root -g) node md2docx.js <input.md> <output.docx> --body-sz 18 --hdr-sz 20
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageOrientation, LevelFormat
} = require('docx');

// ── CLI args
const args = process.argv.slice(2);
const inp = args[0], out = args[1];
if (!inp || !out) { console.error('Usage: node md2docx.js <in.md> <out.docx>'); process.exit(1); }
let HDR_SZ = 18, BODY_SZ = 16;
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--hdr-sz') HDR_SZ = +args[++i];
  if (args[i] === '--body-sz') BODY_SZ = +args[++i];
}

// ── Style constants
const W = 18360;
const BD = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const BORDERS = { top: BD, bottom: BD, left: BD, right: BD };
const COLORS = {
  hdrBg: "2E75B6", hdrTxt: "FFFFFF",
  p0: "E2EFDA", p1: "FFF2CC", p2: "E2F0D9", p3: "EAE0F0",
  alt: "F5F5F5", white: "FFFFFF",
  h1: "2E75B6", h2: "1F5496", h3: "2E75B6",
};
const FIXED_COLS = {
  '☐':360,'id':500,'p':400,'p0':400,'p1':400,'p2':400,'p3':400,
  '담당자':1400,'검수자':1400,'시작일':1400,'종료일':1400,'상태':1800,
  '결정일':1400,'결정권자':1600,'prefix':1200,'method':1400,
  '카테고리':1600,'no':500,'구분':1200,'auth':1400,
};
const P_FILLS = { p0:COLORS.p0, p1:COLORS.p1, p2:COLORS.p2, p3:COLORS.p3 };

// ── Helpers
function hdrCell(text, width) {
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: COLORS.hdrBg, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: COLORS.hdrTxt, size: HDR_SZ, font: "Arial" })]
    })]
  });
}

function mkCell(text, width, { bold=false, center=false, bg=COLORS.white, color="000000", sz=BODY_SZ }={}) {
  // inline: **bold** + `code`
  const parts = text.split(/(\*\*[^*]+?\*\*|`[^`]+`)/);
  const runs = parts.map(p => {
    if (p.startsWith('**') && p.endsWith('**'))
      return new TextRun({ text: p.slice(2,-2), bold: true, color, size: sz, font: "Arial" });
    if (p.startsWith('`') && p.endsWith('`'))
      return new TextRun({ text: p.slice(1,-1), color: "374151", size: sz-2, font: "Courier New" });
    return new TextRun({ text: p, bold, color, size: sz, font: "Arial" });
  }).filter(r => r);
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: bg, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: runs
    })]
  });
}

function calcWidths(headers, body) {
  const n = headers.length;
  const fixed = {}, free = [];
  for (let i = 0; i < n; i++) {
    const k = headers[i].replace(/\*/g,'').trim().toLowerCase();
    if (FIXED_COLS[k]) fixed[i] = FIXED_COLS[k];
    else free.push(i);
  }
  const used = Object.values(fixed).reduce((a,b)=>a+b,0);
  const remaining = Math.max(W - used, free.length * 1000);
  if (free.length) {
    const wts = free.map(i => {
      const hw = headers[i].replace(/\*/g,'').trim().length;
      const bw = Math.max(...body.map(r => (r[i]||'').replace(/\*/g,'').trim().length), 0);
      return Math.min(Math.max(hw, bw, 4), 60);
    });
    const tot = wts.reduce((a,b)=>a+b,0);
    free.forEach((i,j) => fixed[i] = Math.max(Math.round(remaining*wts[j]/tot), 1000));
  }
  const ws = Array.from({length:n}, (_,i) => fixed[i]||1000);
  const scale = W / ws.reduce((a,b)=>a+b,0);
  const scaled = ws.map(w => Math.round(w*scale));
  scaled[scaled.length-1] += W - scaled.reduce((a,b)=>a+b,0);
  return scaled;
}

function buildTable(headers, body) {
  const cols = calcWidths(headers, body);
  // Detect P-level table
  const firstHdr = headers[0] ? headers[0].replace(/\*/g,'').trim().toLowerCase() : '';
  const isPTable = firstHdr === 'p';
  // Detect table's dominant P-level (for large work tables)
  let domPLevel = null;
  if (!isPTable && headers.includes('P') || headers.includes('☐')) {
    const pIdx = headers.findIndex(h => h.replace(/\*/g,'').trim() === 'P');
    if (pIdx >= 0) {
      const pVals = body.map(r => (r[pIdx]||'').trim().toLowerCase());
      const counts = {};
      pVals.forEach(v => counts[v] = (counts[v]||0)+1);
      domPLevel = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
    }
  }
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: cols,
    rows: [
      new TableRow({ children: headers.map((h,i) => hdrCell(h.replace(/\*/g,'').trim(), cols[i])) }),
      ...body.map((row, ri) => {
        let bg;
        if (isPTable) {
          const pk = (row[0]||'').replace(/\*/g,'').trim().toLowerCase();
          bg = P_FILLS[pk] || COLORS.white;
        } else if (domPLevel && P_FILLS[domPLevel]) {
          bg = ri%2===0 ? P_FILLS[domPLevel] : COLORS.white;
        } else {
          bg = ri%2===0 ? COLORS.alt : COLORS.white;
        }
        const padded = [...row];
        while (padded.length < headers.length) padded.push('');
        return new TableRow({
          children: padded.slice(0,headers.length).map((c,ci) => mkCell(c, cols[ci], { bg }))
        });
      })
    ]
  });
}

// ── Markdown parser
function parsePipe(line) {
  return line.replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
}
function isSep(line) {
  return /^\|[\s\-:|]+\|/.test(line.trim());
}

function buildDoc(md) {
  const lines = md.split('\n');
  const children = [];
  let i = 0;

  const sp = (b=80,a=60) => { children.push(new Paragraph({spacing:{before:b,after:a},children:[]})); };
  const addRuns = (p, text, baseSz=18) => {
    text.split(/(\*\*[^*]+?\*\*|`[^`]+`)/).forEach(p2 => {
      if (!p2) return;
      if (p2.startsWith('**') && p2.endsWith('**'))
        p.addChildElement ? null : p.children?.push(new TextRun({text:p2.slice(2,-2),bold:true,size:baseSz,font:"Arial"}));
      // Use TextRun directly
    });
  };

  function inlineRuns(text, sz=18, bold=false, color="000000") {
    return text.split(/(\*\*[^*]+?\*\*|`[^`]+`)/).filter(Boolean).map(p => {
      if (p.startsWith('**') && p.endsWith('**')) return new TextRun({text:p.slice(2,-2),bold:true,size:sz,font:"Arial",color});
      if (p.startsWith('`') && p.endsWith('`')) return new TextRun({text:p.slice(1,-1),size:sz-2,font:"Courier New",color:"374151"});
      return new TextRun({text:p,bold,size:sz,font:"Arial",color});
    });
  }

  while (i < lines.length) {
    const line = lines[i];

    // H1/H2/H3
    const hm = line.match(/^(#{1,3})\s+(.*)/);
    if (hm) {
      const lv = hm[1].length;
      const txt = hm[2].replace(/\*\*([^*]+)\*\*/g,'$1');
      const hLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
      const hSz = [36, 28, 24];
      const hColors = [COLORS.h1, COLORS.h2, COLORS.h3];
      children.push(new Paragraph({
        heading: hLevels[lv-1],
        spacing: { before: [360,240,200][lv-1], after: [180,120,80][lv-1] },
        alignment: lv===1 ? AlignmentType.LEFT : undefined,
        children: [new TextRun({ text: txt, bold: true, size: hSz[lv-1], font: "Arial", color: hColors[lv-1] })]
      }));
      i++; continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.h1, space: 1 } },
        children: []
      }));
      i++; continue;
    }

    // Blockquote → italic small gray (no border)
    if (line.startsWith('>')) {
      const bq = [];
      while (i < lines.length && (lines[i].startsWith('>') || lines[i].trim()==='')) {
        if (lines[i].startsWith('>')) bq.push(lines[i].replace(/^>\s?/,''));
        i++;
      }
      bq.filter(l=>l.trim()).forEach(l => {
        const txt = l.replace(/\*\*([^*]+)\*\*/g,'$1');
        children.push(new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: 360 },
          children: [new TextRun({ text: txt, italic: true, size: 16, color: "555555", font: "Arial" })]
        }));
      });
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const code = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
      i++;
      code.forEach(cl => {
        children.push(new Paragraph({
          spacing: { before: 0, after: 0 },
          indent: { left: 360 },
          shading: { fill: "F2F2F2" },
          children: [new TextRun({ text: cl || ' ', font: "Courier New", size: 16, color: "1F2937" })]
        }));
      });
      continue;
    }

    // Table
    if (line.trim().startsWith('|') && i+1 < lines.length && isSep(lines[i+1])) {
      const hdr = parsePipe(line); i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        body.push(parsePipe(lines[i])); i++;
      }
      children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [] }));
      children.push(buildTable(hdr, body));
      children.push(new Paragraph({ spacing: { before: 60, after: 120 }, children: [] }));
      continue;
    }

    // Bullet list
    if (/^\s*-\s+/.test(line)) {
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const ind = lines[i].match(/^(\s*)/)[1].length;
        const txt = lines[i].replace(/^\s*-\s+/,'');
        children.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          indent: { left: 360 + ind*180, hanging: 240 },
          children: [new TextRun({text:'• ',size:18,font:"Arial"}), ...inlineRuns(txt,18)]
        }));
        i++;
      }
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      let n = 1;
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const txt = lines[i].replace(/^\d+\.\s+/,'');
        children.push(new Paragraph({
          spacing: { before: 40, after: 40 },
          indent: { left: 360, hanging: 240 },
          children: [new TextRun({text:`${n++}. `,size:18,font:"Arial"}), ...inlineRuns(txt,18)]
        }));
        i++;
      }
      continue;
    }

    // Empty
    if (line.trim() === '') { children.push(new Paragraph({spacing:{before:60,after:0},children:[]})); i++; continue; }

    // Normal paragraph
    children.push(new Paragraph({
      spacing: { before: 60, after: 60 },
      children: inlineRuns(line, 18)
    }));
    i++;
  }

  return new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20 } } },
      paragraphStyles: [
        { id:"Heading1", name:"Heading 1", basedOn:"Normal", next:"Normal", quickFormat:true,
          run:{size:36,bold:true,font:"Arial",color:COLORS.h1}, paragraph:{spacing:{before:360,after:180},outlineLevel:0} },
        { id:"Heading2", name:"Heading 2", basedOn:"Normal", next:"Normal", quickFormat:true,
          run:{size:28,bold:true,font:"Arial",color:COLORS.h2}, paragraph:{spacing:{before:240,after:120},outlineLevel:1} },
        { id:"Heading3", name:"Heading 3", basedOn:"Normal", next:"Normal", quickFormat:true,
          run:{size:24,bold:true,font:"Arial",color:COLORS.h3}, paragraph:{spacing:{before:200,after:80},outlineLevel:2} },
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 19800, height: 14040 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
          orientation: PageOrientation.LANDSCAPE
        }
      },
      children
    }]
  });
}

// ── Main
const md = fs.readFileSync(inp, 'utf-8');
const doc = buildDoc(md);
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(out, buf);
  console.log(`done: ${path.basename(out)} (${Math.round(buf.length/1024)}KB)`);
});
