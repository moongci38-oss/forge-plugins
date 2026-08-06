#!/usr/bin/env python3
"""
Markdown → DOCX (Claude Desktop 동일 퀄리티)
페이지: 19800×14040 DXA, 0.5" 여백, Arial
테이블: 2E75B6 헤더, 우선순위 테이블=P레벨 색상, 나머지=흰색
사용: python3 md2docx.py <in.md> <out.docx> [--cell-font-pt 10]
"""
import sys, re, os, argparse
from docx import Document
from docx.shared import Pt, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

PAGE_W = 19800; PAGE_H = 14040; MARGIN = 720
CONTENT = PAGE_W - MARGIN * 2  # 18360 DXA

def dxa2emu(d): return int(d / 1440 * 914400)

FIXED_COLS = {
    '☐':360,'id':500,'p':400,'p0':400,'p1':400,'p2':400,'p3':400,
    '담당자':1400,'검수자':1400,'시작일':1400,'종료일':1400,'상태':1800,
    '결정일':1400,'결정권자':1600,'prefix':1200,'method':1400,
    '카테고리':1600,'no':500,'구분':1200,'auth':1400,
}
MIN_DXA = 1000

PRIORITY_FILLS = {'p0':'E2EFDA','p1':'FFF2CC','p2':'E2F0D9','p3':'EAE0F0'}

def calc_widths(headers, body, total=CONTENT):
    n = len(headers)
    fixed, free = {}, []
    for i,h in enumerate(headers):
        k = re.sub(r'\*','',h).strip().lower()
        if k in FIXED_COLS: fixed[i] = FIXED_COLS[k]
        else: free.append(i)
    remaining = max(total - sum(fixed.values()), len(free)*MIN_DXA)
    if free:
        wts = []
        for i in free:
            hw = len(re.sub(r'\*','',headers[i]).strip())
            bw = max((len(re.sub(r'\*','',r[i]).strip()) if i<len(r) else 0 for r in body),default=0)
            wts.append(min(max(hw,bw,4),60))
        s = sum(wts)
        for idx,w in zip(free,wts): fixed[idx] = max(int(remaining*w/s),MIN_DXA)
    ws = [fixed.get(i,MIN_DXA) for i in range(n)]
    scale = total/sum(ws)
    ws = [int(w*scale) for w in ws]
    ws[-1] += total-sum(ws)
    return ws

def xe(tag,**a):
    el = OxmlElement(tag)
    for k,v in a.items(): el.set(qn(k),str(v))
    return el

def set_shd(cell, fill):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr()
    for o in tcPr.findall(qn('w:shd')): tcPr.remove(o)
    tcPr.append(xe('w:shd',**{'w:fill':fill,'w:val':'clear'}))

def set_borders(cell, color='CCCCCC', sz='1'):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr()
    for o in tcPr.findall(qn('w:tcBorders')): tcPr.remove(o)
    b = OxmlElement('w:tcBorders')
    for s in ('top','left','bottom','right'):
        b.append(xe(f'w:{s}',**{'w:val':'single','w:color':color,'w:sz':sz}))
    tcPr.append(b)

def set_margins(cell,top=60,left=100,bottom=60,right=100):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr()
    for o in tcPr.findall(qn('w:tcMar')): tcPr.remove(o)
    m = OxmlElement('w:tcMar')
    for s,v in (('top',top),('left',left),('bottom',bottom),('right',right)):
        m.append(xe(f'w:{s}',**{'w:w':str(v),'w:type':'dxa'}))
    tcPr.append(m)

def set_width(cell, dxa):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr()
    for o in tcPr.findall(qn('w:tcW')): tcPr.remove(o)
    tcPr.append(xe('w:tcW',**{'w:w':str(dxa),'w:type':'dxa'}))

def set_valign(cell,val='center'):
    tc = cell._tc; tcPr = tc.get_or_add_tcPr()
    for o in tcPr.findall(qn('w:vAlign')): tcPr.remove(o)
    tcPr.append(xe('w:vAlign',**{'w:val':val}))

def set_grid(table, col_dxas):
    tbl = table._tbl
    tblPr = tbl.find(qn('w:tblPr'))
    if tblPr is None: tblPr = OxmlElement('w:tblPr'); tbl.insert(0,tblPr)
    for o in tblPr.findall(qn('w:tblW')): tblPr.remove(o)
    tblW = xe('w:tblW',**{'w:w':str(sum(col_dxas)),'w:type':'dxa'})
    ts = tblPr.find(qn('w:tblStyle'))
    tblPr.insert((list(tblPr).index(ts)+1 if ts is not None else 0), tblW)
    for o in tblPr.findall(qn('w:tblBorders')): tblPr.remove(o)
    bd = OxmlElement('w:tblBorders')
    for s in ('top','left','bottom','right','insideH','insideV'):
        bd.append(xe(f'w:{s}',**{'w:val':'single','w:color':'auto','w:sz':'4'}))
    tblPr.append(bd)
    for o in tbl.findall(qn('w:tblGrid')): tbl.remove(o)
    g = OxmlElement('w:tblGrid')
    for w in col_dxas: g.append(xe('w:gridCol',**{'w:w':str(w)}))
    tbl.insert(list(tbl).index(tblPr)+1, g)

def add_run(p, text, bold=False, sz=10, color='000000'):
    r = p.add_run(text); r.bold=bold
    r.font.size=Pt(sz); r.font.color.rgb=RGBColor.from_string(color)
    r.font.name='Arial'
    rpr = r._element.get_or_add_rPr()
    fn = rpr.find(qn('w:rFonts'))
    if fn is None: fn=OxmlElement('w:rFonts'); rpr.insert(0,fn)
    for a in ('w:ascii','w:hAnsi','w:eastAsia','w:cs'): fn.set(qn(a),'Arial')
    return r

def write_cell(cell, text, bold=False, sz=10, color='000000'):
    p = cell.paragraphs[0]
    p.paragraph_format.space_before=Pt(1); p.paragraph_format.space_after=Pt(1)
    for part in re.split(r'(\*\*[^*]+?\*\*|`[^`]+`)', text):
        if not part: continue
        if part.startswith('**') and part.endswith('**'):
            add_run(p,part[2:-2],bold=True,sz=sz,color=color)
        elif part.startswith('`') and part.endswith('`'):
            r=p.add_run(part[1:-1]); r.font.name='Courier New'; r.font.size=Pt(sz-1); r.font.color.rgb=RGBColor(0x37,0x41,0x51)
        else:
            add_run(p,part,bold=bold,sz=sz,color=color)

def build_table(doc, headers, body, sz=10):
    n=len(headers)
    col_dxas=calc_widths(headers,body)
    table=doc.add_table(rows=0,cols=n)
    table.style='Normal Table'
    set_grid(table,col_dxas)

    # 헤더행
    hr=table.add_row()
    for j,h in enumerate(headers):
        c=hr.cells[j]; set_width(c,col_dxas[j]); set_shd(c,'2E75B6')
        set_borders(c); set_margins(c); set_valign(c,'center')
        write_cell(c,re.sub(r'\*','',h).strip(),bold=True,sz=sz,color='FFFFFF')

    # P레벨 색상 적용 여부: 첫 헤더가 "P"인 테이블만
    is_p_table = re.sub(r'\*','',headers[0]).strip().lower()=='p' if headers else False

    for ri,row_cells in enumerate(body):
        row=table.add_row()
        if is_p_table and row_cells:
            pk=re.sub(r'\*','',row_cells[0]).strip().lower()
            fill=PRIORITY_FILLS.get(pk,'FFFFFF')
        else:
            fill='FFFFFF'
        for j in range(n):
            c=row.cells[j]; set_width(c,col_dxas[j]); set_shd(c,fill)
            set_borders(c); set_margins(c); set_valign(c,'top')
            txt=row_cells[j] if j<len(row_cells) else ''
            write_cell(c,txt,sz=sz)

def parse_pipe(line):
    return [c.strip() for c in re.sub(r'^\||\|$','',line).split('|')]

def is_sep(line):
    return bool(re.match(r'^\|[\s\-:|]+\|',line.strip()))

def para_inline(p, text, sz=10.5):
    for part in re.split(r'(\*\*[^*]+?\*\*|`[^`]+`)',text):
        if not part: continue
        if part.startswith('**') and part.endswith('**'):
            add_run(p,part[2:-2],bold=True,sz=sz)
        elif part.startswith('`') and part.endswith('`'):
            r=p.add_run(part[1:-1]); r.font.name='Courier New'; r.font.size=Pt(sz-1); r.font.color.rgb=RGBColor(0x37,0x41,0x51)
        else:
            add_run(p,part,sz=sz)

def build_doc(md, sz=10):
    doc=Document()
    s=doc.sections[0]
    s.page_width=Emu(dxa2emu(PAGE_W)); s.page_height=Emu(dxa2emu(PAGE_H))
    for a in ('left_margin','right_margin','top_margin','bottom_margin'):
        setattr(s,a,Emu(dxa2emu(MARGIN)))
    normal=doc.styles['Normal']
    normal.font.name='Arial'; normal.font.size=Pt(10.5)
    if hasattr(normal._element,'rPr') and normal._element.rPr is not None:
        fn=normal._element.rPr.find(qn('w:rFonts'))
        if fn is None: fn=OxmlElement('w:rFonts'); normal._element.rPr.insert(0,fn)
        for a in ('w:ascii','w:hAnsi','w:eastAsia','w:cs'): fn.set(qn(a),'Arial')

    lines=md.split('\n'); i=0
    while i<len(lines):
        line=lines[i]

        # 제목
        hm=re.match(r'^(#{1,3})\s+(.*)',line)
        if hm:
            lv=len(hm.group(1))
            txt=re.sub(r'\*\*([^*]+)\*\*',r'\1',hm.group(2))
            fsz=[20,15,13][lv-1]; cl=['2E74B5','2E74B5','1F4D78'][lv-1]
            p=doc.add_paragraph()
            p.paragraph_format.space_before=Pt([20,14,10][lv-1])
            p.paragraph_format.space_after=Pt(4)
            if lv==1:
                p.paragraph_format.alignment=WD_ALIGN_PARAGRAPH.CENTER
                pPr=p._p.get_or_add_pPr(); bd=OxmlElement('w:pBdr')
                bd.append(xe('w:bottom',**{'w:val':'single','w:sz':'6','w:space':'4','w:color':'BDD7EE'}))
                pPr.insert(0,bd)
            add_run(p,txt,bold=True,sz=fsz,color=cl)
            i+=1; continue

        # 구분선
        if re.match(r'^---+$',line.strip()):
            p=doc.add_paragraph()
            pPr=p._p.get_or_add_pPr(); bd=OxmlElement('w:pBdr')
            bd.append(xe('w:bottom',**{'w:val':'single','w:sz':'2','w:space':'4','w:color':'D9D9D9'}))
            pPr.insert(0,bd)
            p.paragraph_format.space_before=Pt(6); p.paragraph_format.space_after=Pt(6)
            i+=1; continue

        # blockquote → 보더 없이 소형 회색 (PC 버전과 동일)
        if line.startswith('>'):
            bq=[]
            while i<len(lines) and (lines[i].startswith('>') or lines[i].strip()==''):
                if lines[i].startswith('>'): bq.append(re.sub(r'^>\s?','',lines[i]))
                i+=1
            for bl in bq:
                if not bl.strip(): continue
                p=doc.add_paragraph()
                p.paragraph_format.left_indent=Emu(dxa2emu(360))
                p.paragraph_format.space_before=Pt(1); p.paragraph_format.space_after=Pt(1)
                txt=re.sub(r'\*\*([^*]+)\*\*',r'\1',bl)
                add_run(p,txt,sz=9,color='595959')
            continue

        # 코드블록
        if line.startswith('```'):
            code=[]; i+=1
            while i<len(lines) and not lines[i].startswith('```'):
                code.append(lines[i]); i+=1
            i+=1
            for cl in code:
                p=doc.add_paragraph()
                p.paragraph_format.left_indent=Emu(dxa2emu(360))
                p.paragraph_format.space_before=Pt(0); p.paragraph_format.space_after=Pt(0)
                pPr=p._p.get_or_add_pPr()
                pPr.append(xe('w:shd',**{'w:val':'clear','w:color':'auto','w:fill':'F2F2F2'}))
                r=p.add_run(cl or ' '); r.font.name='Courier New'; r.font.size=Pt(8.5)
                r.font.color.rgb=RGBColor(0x1F,0x29,0x37)
            continue

        # 테이블
        if line.strip().startswith('|') and i+1<len(lines) and is_sep(lines[i+1]):
            hdr=parse_pipe(line); i+=2
            body=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                body.append(parse_pipe(lines[i])); i+=1
            build_table(doc,hdr,body,sz)
            p=doc.add_paragraph(); p.paragraph_format.space_before=Pt(6)
            continue

        # 불릿
        if re.match(r'^\s*-\s+',line):
            items=[]
            while i<len(lines) and re.match(r'^\s*-\s+',lines[i]):
                ind=len(re.match(r'^(\s*)',lines[i]).group(1))
                items.append((re.sub(r'^\s*-\s+','',lines[i]),ind//2)); i+=1
            for txt,lv in items:
                p=doc.add_paragraph()
                p.paragraph_format.left_indent=Emu(dxa2emu(360+lv*360))
                p.paragraph_format.first_line_indent=Emu(dxa2emu(-240))
                p.paragraph_format.space_before=Pt(2); p.paragraph_format.space_after=Pt(2)
                add_run(p,'• ',sz=10.5)
                para_inline(p,re.sub(r'\*\*([^*]+)\*\*',r'\1',txt))
            continue

        if line.strip()=='': i+=1; continue

        p=doc.add_paragraph()
        p.paragraph_format.space_before=Pt(3); p.paragraph_format.space_after=Pt(3)
        para_inline(p,line)
        i+=1

    return doc

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--cell-font-pt',type=float,default=10)
    args=ap.parse_args()
    md=open(args.src,encoding='utf-8').read()
    doc=build_doc(md,sz=args.cell_font_pt)
    doc.save(args.dst)
    print(f'done: {os.path.basename(args.dst)} ({os.path.getsize(args.dst)//1024}KB)')
