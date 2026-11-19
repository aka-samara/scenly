// HTML → PDF with headless Chrome (Puppeteer). One browser is kept open and reused; every job gets
// a fresh page with the network switched off, so a document can never load anything from outside.
import puppeteer from 'puppeteer';

let browserP = null, idleTimer = null, active = 0;
const queue = []; const MAX = 2;

async function browser() {
  if (browserP) { const b = await browserP.catch(() => null); if (b?.connected) return b; browserP = null; }
  browserP = puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
  try { return await browserP; }
  catch (e) { browserP = null; throw Object.assign(new Error('The PDF engine (Chrome) could not start. Run "npx puppeteer browsers install chrome" in the Scenly folder and restart.'), { user: true, cause: e }); }
}
function release() {
  active--; const next = queue.shift(); if (next) next();
  clearTimeout(idleTimer);
  // Chrome is closed after five quiet minutes to give the memory back.
  if (!active) idleTimer = setTimeout(async () => { if (active || !browserP) return; const b = await browserP.catch(() => null); browserP = null; await b?.close().catch(() => {}); }, 5 * 60 * 1000).unref();
}
async function withPage(fn, { width = 794, height = 1123 } = {}) {
  if (active >= MAX) await new Promise((r) => queue.push(r));
  active++;
  let page;
  try {
    const b = await browser();
    page = await b.newPage();
    await page.setViewport({ width: Math.round(width), height: Math.round(height), deviceScaleFactor: 1 });
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (r) => { const u = r.url(); if (u.startsWith('data:') || u === 'about:blank') r.continue(); else r.abort(); });
    return await fn(page);
  } finally { await page?.close().catch(() => {}); release(); }
}
const mmPx = (mm) => (mm / 25.4) * 96;

// html: a whole document whose CSS sets @page. Returns the PDF bytes.
export function htmlToPdf(html, { widthMm = 210, heightMm = 297, header = '', footer = '', margin = null } = {}) {
  return withPage(async (page) => {
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    const buf = await page.pdf({
      printBackground: true, preferCSSPageSize: true, width: `${widthMm}mm`, height: `${heightMm}mm`, timeout: 60000,
      displayHeaderFooter: !!(header || footer), headerTemplate: header || '<span></span>', footerTemplate: footer || '<span></span>',
      margin: margin || undefined,
    });
    return Buffer.from(buf);
  }, { width: mmPx(widthMm), height: mmPx(heightMm) });
}

// Measures a document laid out for the screen: for each element matching `pageSel`, how far its
// content runs past the page, and where the elements matching `boxSel` sit (in mm from the page's top left).
export function measure(html, { widthMm = 210, heightMm = 297, pageSel = '.pg', boxSel = '[data-field]' } = {}) {
  return withPage(async (page) => {
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    // Scripts are off in the page itself; evaluate still runs in an isolated world.
    return page.evaluate((pageSel, boxSel) => {
      const px = 25.4 / 96;
      return [...document.querySelectorAll(pageSel)].map((pg) => {
        const r = pg.getBoundingClientRect();
        const inner = pg.querySelector(':scope > .pg-in') || pg;
        let bottom = 0, right = 0;
        for (const el of inner.querySelectorAll('*')) {
          const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
          if (el.closest('[data-bleed]')) continue;
          const b = el.getBoundingClientRect(); if (!b.width && !b.height) continue;
          // Only things that carry content count: text, pictures, boxes with a background or border.
          const leaf = !el.children.length || ['IMG', 'SVG', 'TABLE'].includes(el.tagName.toUpperCase());
          if (!leaf) continue;
          bottom = Math.max(bottom, b.bottom - r.top); right = Math.max(right, b.right - r.left);
        }
        // Text whose colour is (nearly) the colour behind it.
        const rgba = (v) => { const m = /rgba?\(([^)]+)\)/.exec(v || ''); if (!m) return null; const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [n[0], n[1], n[2], n[3] == null || Number.isNaN(n[3]) ? 1 : n[3]]; };
        const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const over = (top, under) => [0, 1, 2].map((k) => top[k] * top[3] + under[k] * (1 - top[3])).concat(1);
        const behind = (el) => {
          const layers = [];
          for (let e = el; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.backgroundImage && cs.backgroundImage !== 'none') {
              if (/url\(/.test(cs.backgroundImage)) return null;
              const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((x) => rgba(x[0])).filter((c) => c && c[3] > 0.5);
              if (stops.length) { layers.push([0, 1, 2].map((k) => stops.reduce((a, c) => a + c[k], 0) / stops.length).concat(1)); break; }
            }
            const c = rgba(cs.backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
            if (e === pg) break;
          }
          let bg = [255, 255, 255, 1]; for (const c of layers.reverse()) bg = over(c, bg);
          return bg;
        };
        const low = [];
        for (const el of inner.querySelectorAll('*')) {
          if (low.length >= 40) break;
          if (el.closest('svg') || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 1)) continue;
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.15) continue;
          if ((cs.webkitBackgroundClip || cs.backgroundClip) === 'text') continue;
          // Text lying over a picture or a drawing cannot be judged.
          const eb = el.getBoundingClientRect(); const cx = eb.left + eb.width / 2, cy = eb.top + eb.height / 2;
          const holds = (x) => { const b = x.getBoundingClientRect(); return b.width > 0 && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom; };
          const covers = (x) => {
            const tag = x.tagName.toLowerCase();
            if (tag === 'svg') return [...x.querySelectorAll('rect,path,circle,ellipse,polygon,image')].some((sh) => (sh.tagName.toLowerCase() === 'image' || getComputedStyle(sh).fill !== 'none') && holds(sh));
            if (!holds(x)) return false;
            const xs = getComputedStyle(x);
            return tag === 'img' || xs.backgroundImage !== 'none' || rgba(xs.backgroundColor)?.[3] > 0 || !!x.querySelector('img,svg');
          };
          let unsure = false;
          for (let e = el; e && e !== inner; e = e.parentElement) {
            const es = getComputedStyle(e); const own = rgba(es.backgroundColor);
            if ((own && own[3] >= 0.99) || /gradient/.test(es.backgroundImage)) break;
            const lifted = es.position === 'absolute' || es.position === 'relative' && es.zIndex !== 'auto';
            if ([...e.parentElement.children].some((x) => x !== e && (lifted || getComputedStyle(x).position === 'absolute') && covers(x))) { unsure = true; break; }
          }
          if (unsure) continue;
          const bg = behind(el); const fg0 = rgba(cs.color); if (!bg || !fg0) continue;
          const fg = over(fg0, bg); const a = lum(fg), b = lum(bg);
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio >= 1.45) continue;
          const path = []; let e = el; while (e && e !== inner) { path.unshift([...e.parentElement.children].indexOf(e) + 1); e = e.parentElement; }
          low.push({ path: path.join('/'), dark: b < 0.4 });
        }
        const boxes = [...pg.querySelectorAll(boxSel)].map((el) => { const b = el.getBoundingClientRect(); return { name: el.getAttribute('data-field'), type: el.getAttribute('data-type') || 'text', options: el.getAttribute('data-options') || '', x: (b.left - r.left) * px, y: (b.top - r.top) * px, w: b.width * px, h: b.height * px }; });
        return { flow: pg.hasAttribute('data-flow'), height: r.height * px, width: r.width * px, overY: Math.max(0, (bottom - r.height) * px), overX: Math.max(0, (right - r.width) * px), contentH: bottom * px, boxes, low };
      });
    }, pageSel, boxSel);
  }, { width: mmPx(widthMm), height: mmPx(heightMm) });
}

export async function closeBrowser() { if (!browserP) return; const b = await browserP.catch(() => null); browserP = null; await b?.close().catch(() => {}); }
