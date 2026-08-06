#!/usr/bin/env node
// site-clone — computed-style + asset extractor (Forge-native)
// 元A(getComputedStyle walk) + 元F(layered assets) + 元B(multi-state diff)를 Playwright page.evaluate로 native 실행.
// 원본(ai-website-cloner MIT)의 "브라우저 MCP에 붙여넣기" 스니펫을 재현성 있는 스크립트로 재배선.
//
// 사용:
//   node extract-computed.mjs <url> --selector "<css>" [--state-label rest]
//   node extract-computed.mjs <url> --assets            # 페이지 전체 에셋 열거
//   node extract-computed.mjs <url> --selector "<css>" --hover "<css>"   # 다상태 diff(rest→hover)
//
// 출력: JSON(stdout). 절대경로만 사용(tool-rules). robots.txt/rate-limit는 호출측(SKILL.md Phase)에서 준수.
//
// 보안(§4.1): 이 스크립트는 getComputedStyle "계산값 read-only"만 반환한다.
//   페이지 <script>/이벤트 핸들러를 우리 컨텍스트에서 재실행하지 않는다(page.evaluate는 값만 반환).

import { chromium } from 'playwright';

// --- 元A: computed-style walk (depth<=4). 원본 L244-283 이식 ---
// depth<=4 상한 = 의도된 성능/토큰 절충(§10). 깊은 레이아웃은 셀렉터를 잘게 잡아 우회.
function walkFnSource() {
  return `(function(selector){
    const el = document.querySelector(selector);
    if (!el) return { error: 'Element not found: ' + selector };
    const props = ['fontSize','fontWeight','fontFamily','lineHeight','letterSpacing','color',
      'textTransform','textDecoration','backgroundColor','background',
      'padding','paddingTop','paddingRight','paddingBottom','paddingLeft',
      'margin','marginTop','marginRight','marginBottom','marginLeft',
      'width','height','maxWidth','minWidth','maxHeight','minHeight',
      'display','flexDirection','justifyContent','alignItems','gap',
      'gridTemplateColumns','gridTemplateRows',
      'borderRadius','border','borderTop','borderBottom','borderLeft','borderRight',
      'boxShadow','overflow','overflowX','overflowY',
      'position','top','right','bottom','left','zIndex',
      'opacity','transform','transition','cursor',
      'objectFit','objectPosition','mixBlendMode','filter','backdropFilter',
      'whiteSpace','textOverflow','WebkitLineClamp'];
    function extract(e){ const cs=getComputedStyle(e); const s={};
      props.forEach(p=>{ const v=cs[p]; if(v&&v!=='none'&&v!=='normal'&&v!=='auto'&&v!=='0px'&&v!=='rgba(0, 0, 0, 0)') s[p]=v; });
      return s; }
    function walk(e,d){ if(d>4) return null; const ch=[...e.children];
      return { tag:e.tagName.toLowerCase(),
        classes:e.className?.toString().split(' ').slice(0,5).join(' '),
        text:(e.childNodes.length===1&&e.childNodes[0].nodeType===3)?e.textContent.trim().slice(0,200):null,
        styles:extract(e),
        images:e.tagName==='IMG'?{src:e.src,alt:e.alt,naturalWidth:e.naturalWidth,naturalHeight:e.naturalHeight}:null,
        childCount:ch.length,
        children:ch.slice(0,20).map(c=>walk(c,d+1)).filter(Boolean) }; }
    return walk(el,0);
  })`;
}

// --- 元F: layered asset discovery. 원본 L193-224 이식 ---
function assetFnSource() {
  return `(function(){
    return {
      images:[...document.querySelectorAll('img')].map(img=>({
        src:img.src||img.currentSrc, alt:img.alt,
        width:img.naturalWidth, height:img.naturalHeight,
        parentClasses:img.parentElement?.className,
        siblings:img.parentElement?[...img.parentElement.querySelectorAll('img')].length:0,
        position:getComputedStyle(img).position, zIndex:getComputedStyle(img).zIndex })),
      videos:[...document.querySelectorAll('video')].map(v=>({
        src:v.src||v.querySelector('source')?.src, poster:v.poster,
        autoplay:v.autoplay, loop:v.loop, muted:v.muted })),
      backgroundImages:[...document.querySelectorAll('*')].filter(el=>{
        const bg=getComputedStyle(el).backgroundImage; return bg&&bg!=='none'; })
        .slice(0,300).map(el=>({ url:getComputedStyle(el).backgroundImage,
        element:el.tagName+'.'+(el.className?.toString().split(' ')[0]||'') })),
      svgCount:document.querySelectorAll('svg').length,
      fonts:[...new Set([...document.querySelectorAll('*')].slice(0,200).map(el=>getComputedStyle(el).fontFamily))],
      favicons:[...document.querySelectorAll('link[rel*="icon"]')].map(l=>({href:l.href,sizes:l.sizes?.toString()}))
    };
  })`;
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}

async function main() {
  const url = process.argv[2];
  if (!url || url.startsWith('--')) {
    console.error('usage: extract-computed.mjs <url> [--selector "<css>"] [--assets] [--hover "<css>"]');
    process.exit(1);
  }
  const selector = arg('--selector');
  const hover = arg('--hover');
  const wantAssets = process.argv.includes('--assets');

  const browser = await chromium.launch({ channel: 'chrome' }); // Forge 룰: 항상 Chrome
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    const out = { url };
    if (wantAssets) {
      out.assets = await page.evaluate(`(${assetFnSource()})()`);
    }
    if (selector) {
      // 元A: rest 상태
      out.rest = await page.evaluate(`(${walkFnSource()})(${JSON.stringify(selector)})`);
      // 元B: 다상태 diff(rest→hover). trigger 후 재추출, diff는 호출측에서 서술.
      if (hover) {
        await page.hover(hover).catch(() => {});
        await page.waitForTimeout(400); // debounce: transition 안정화 대기(WHY: hover 애니메이션 정착)
        out.hover = await page.evaluate(`(${walkFnSource()})(${JSON.stringify(selector)})`);
      }
    }
    process.stdout.write(JSON.stringify(out, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
