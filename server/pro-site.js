// Ad Studio's website reader. A site is opened in a real (headless) browser, so pages built with JavaScript read like any other,
// and a few key pages (pricing, products, features, about) are followed. Besides the words it collects what an ad needs:
// the logo, product pictures and the colours the site really uses.
// Safety: only http(s); every request the page makes is checked and refused when it points inside this network; video, fonts
// and sockets are not loaded; nothing is clicked, typed or submitted; the whole read has a time limit.
import dns from 'node:dns/promises';
import net from 'node:net';
import puppeteer from 'puppeteer';
import { createCanvas, loadImage } from '@napi-rs/canvas';

export const privateIp = (ip) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|f[cd]|fe80:|::ffff:(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.))/i.test(ip);
const hosts = new Map(); // host -> may it be reached (kept for one read only)
async function hostOk(host) {
  const h = String(host || '').replace(/^\[|\]$/g, '').toLowerCase(); if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (hosts.has(h)) return hosts.get(h);
  const ips = net.isIP(h) ? [h] : (await dns.lookup(h, { all: true }).catch(() => [])).map((a) => a.address);
  const ok = ips.length > 0 && !ips.some(privateIp); hosts.set(h, ok); return ok;
}
const KEY_PAGE = /(pric|plan|product|shop|store|collection|catalog|feature|service|solution|menu|about|why)/i;
const SKIP_PAGE = /(login|signin|sign-in|signup|sign-up|register|cart|checkout|account|privacy|terms|legal|cookie|blog|news|press|career|job|docs|support|help|contact|\.pdf$|#)/i;

// Runs inside the page: what a person would see, and what an ad could use.
function extract() {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return ''; } };
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() || '';
  const seen = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const inHead = (el) => !!el.closest('header, nav, [class*="header" i], [class*="navbar" i], [id*="header" i]') || el.getBoundingClientRect().top + scrollY < 140;
  const images = [];
  for (const img of document.images) {
    const url = abs(img.currentSrc || img.src); if (!/^https?:/.test(url)) continue;
    const w = img.naturalWidth, h = img.naturalHeight; if (w < 48 || h < 24) continue;
    const hint = `${url} ${img.alt} ${img.className} ${img.id} ${img.closest('a')?.className || ''} ${img.closest('a')?.getAttribute('aria-label') || ''}`;
    const box = img.getBoundingClientRect();
    images.push({ url, alt: (img.alt || img.title || img.closest('figure')?.querySelector('figcaption')?.textContent || img.closest('a, article, li, [class*="card" i], [class*="product" i]')?.querySelector('h1,h2,h3,h4,[class*="title" i],[class*="name" i]')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120), w, h,
      head: inHead(img), logo: /logo|brand|wordmark/i.test(hint), shown: seen(img), area: Math.round(box.width * box.height), product: !!img.closest('[class*="product" i], [class*="item" i], [class*="card" i], [itemtype*="Product"]') });
  }
  // A logo drawn as inline SVG in the header.
  let svgLogo = '';
  for (const s of document.querySelectorAll('header svg, nav svg, a[class*="logo" i] svg, [class*="logo" i] svg, a[href="/"] svg')) {
    const r = s.getBoundingClientRect(); if (r.width < 24 || r.height < 12 || r.width > 420) continue;
    const c = s.cloneNode(true); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); if (!c.getAttribute('viewBox') && r.width && r.height) c.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    c.setAttribute('width', String(Math.round(r.width * 4))); c.setAttribute('height', String(Math.round(r.height * 4))); c.style.color = getComputedStyle(s).color;
    svgLogo = new XMLSerializer().serializeToString(c); if (svgLogo.length < 200000) break; svgLogo = '';
  }
  const icons = [...document.querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="icon"]')].map((l) => ({ url: abs(l.href), size: parseInt(l.sizes?.value) || (/apple/.test(l.rel) ? 180 : 32) })).filter((x) => /^https?:/.test(x.url)).sort((a, b) => b.size - a.size);
  // Colours the site really uses: buttons and links first, then headings and bands.
  const tally = {}; const add = (c, weight) => { const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(c || ''); if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return; const k = '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase(); tally[k] = (tally[k] || 0) + weight; };
  for (const el of [...document.querySelectorAll('button, [role="button"], a[class*="btn" i], a[class*="button" i], input[type="submit"]')].slice(0, 80)) { if (!seen(el)) continue; const s = getComputedStyle(el); add(s.backgroundColor, 6); add(s.borderColor, 1); add(s.color, 1); }
  for (const el of [...document.querySelectorAll('a')].slice(0, 120)) if (seen(el)) add(getComputedStyle(el).color, 1);
  for (const el of [...document.querySelectorAll('h1, h2, header, footer, section, [class*="hero" i], [class*="banner" i]')].slice(0, 80)) { const s = getComputedStyle(el); add(s.backgroundColor, 2); add(s.color, 1); }
  const fonts = [...new Set([document.querySelector('h1, h2'), document.body].filter(Boolean).map((el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()))];
  return {
    url: location.href, title: document.title.trim(), description: meta('meta[name="description"]') || meta('meta[property="og:description"]'), site: meta('meta[property="og:site_name"]'),
    theme: meta('meta[name="theme-color"]'), ogImage: ((v) => (v ? abs(v) : ''))(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]')),
    headings: [...document.querySelectorAll('h1, h2, h3')].filter(seen).map((x) => x.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40),
    text: (document.body?.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, 9000),
    links: [...document.querySelectorAll('a[href]')].map((a) => ({ href: abs(a.getAttribute('href')), text: (a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60), nav: inHead(a) })).filter((l) => /^https?:/.test(l.href)).slice(0, 400),
    images, svgLogo, icons, colours: tally, fonts,
  };
}

const vivid = (c) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const hi = Math.max(r, g, b), lo = Math.min(r, g, b); return hi - lo >= 55 && hi >= 70 && lo <= 220; };
const fail = (m) => Object.assign(new Error(m), { user: true });

/** Open a site and a few of its key pages. Returns words, colours and picture candidates. Throws { user: true } errors a person can read. */
export async function browseSite(link, { maxPages = 3, budgetMs = 50000 } = {}) {
  hosts.clear();
  let start; try { start = new URL(/^https?:\/\//i.test(link) ? link : 'https://' + String(link).trim()); } catch { throw fail('That is not a web address. Type it like yourbrand.com'); }
  if (!/^https?:$/.test(start.protocol) || !(await hostOk(start.hostname))) throw fail('That website cannot be reached from here. Check the address, or set the brand up by hand.');
  const until = Date.now() + budgetMs; const left = () => Math.max(1500, until - Date.now());
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      try {
        const u = new URL(req.url());
        if (u.protocol === 'data:' || u.protocol === 'blob:') return req.continue();
        if (!/^https?:$/.test(u.protocol) || ['media', 'font', 'websocket', 'eventsource', 'manifest'].includes(req.resourceType()) || !(await hostOk(u.hostname))) return req.abort();
        return req.continue();
      } catch { try { await req.abort(); } catch { /* already handled */ } }
    });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    const open = async (url, wait) => {
      const r = await page.goto(url, { waitUntil: 'networkidle2', timeout: Math.min(wait, left()) }).catch(async (e) => { if (/timeout/i.test(e.message)) return 'slow'; throw e; });
      if (r && r !== 'slow' && r.status() >= 400) throw fail(`That website answered with an error (${r.status()}). Set the brand up by hand instead.`);
      // Scroll once through the page so pictures that load late are there, then come back to the top.
      await page.evaluate(async () => { const step = innerHeight; for (let y = 0; y < Math.min(document.body.scrollHeight, 9000); y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
      return page.evaluate(extract);
    };
    let home;
    try { home = await open(start.href, 22000); } catch (e) { if (e.user) throw e; throw fail('That website did not open. Check the address, or set the brand up by hand.'); }
    if (!(await hostOk(new URL(home.url).hostname))) throw fail('That website cannot be reached from here.');
    const origin = new URL(home.url).origin; const pages = [{ ...home, kind: 'home' }];
    // Key pages on the same site, best first: named in the navigation, and a short path.
    const cand = new Map();
    for (const l of home.links) {
      let u; try { u = new URL(l.href); } catch { continue; }
      if (u.origin !== origin || u.pathname === '/' || u.pathname === new URL(home.url).pathname) continue;
      const key = u.pathname.replace(/\/$/, ''); const label = `${key} ${l.text}`;
      if (!KEY_PAGE.test(label) || SKIP_PAGE.test(key) || cand.has(key)) continue;
      const score = (l.nav ? 3 : 0) + (/pric|plan/i.test(label) ? 4 : /product|shop|store|collection|catalog|menu/i.test(label) ? 4 : /feature|service|solution/i.test(label) ? 2 : 1) - key.split('/').length;
      cand.set(key, { href: u.origin + u.pathname + u.search, score, kind: /pric|plan/i.test(label) ? 'pricing' : /product|shop|store|collection|catalog|menu/i.test(label) ? 'products' : /feature|service|solution/i.test(label) ? 'features' : 'about' });
    }
    const picks = []; for (const c of [...cand.values()].sort((a, b) => b.score - a.score)) { if (picks.length >= maxPages) break; if (!picks.some((p) => p.kind === c.kind) || picks.length >= 2) picks.push(c); }
    for (const c of picks) { if (until - Date.now() < 6000) break; try { pages.push({ ...(await open(c.href, 13000)), kind: c.kind }); } catch { /* a page that will not open is left out */ } }

    // Colours, counted across the pages.
    const tally = {}; for (const p of pages) for (const [k, n] of Object.entries(p.colours || {})) if (vivid(k)) tally[k] = (tally[k] || 0) + n;
    if (/^#[0-9a-f]{6}$/i.test(home.theme) && vivid(home.theme.toUpperCase())) tally[home.theme.toUpperCase()] = (tally[home.theme.toUpperCase()] || 0) + 8;
    const colors = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 8);
    // Brands that are black, white and grey have no vivid colour: their darkest much-used tone stands in.
    const plain = {}; for (const p of pages) for (const [k, n] of Object.entries(p.colours || {})) { const v = [1, 3, 5].map((i) => parseInt(k.slice(i, i + 2), 16)); if (!vivid(k) && Math.max(...v) < 200) plain[k] = (plain[k] || 0) + n; }
    const neutrals = Object.entries(plain).sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 3);
    // Pictures: one list without repeats, each with what it probably is.
    const pics = new Map();
    for (const p of pages) for (const im of p.images) {
      const role = im.logo || (im.head && im.w <= 520 && im.h <= 220) ? 'logo' : im.w >= 280 && im.h >= 280 ? (im.product || p.kind === 'products' ? 'product' : 'image') : null;
      if (!role || pics.has(im.url)) continue; if (/sprite|pixel|tracking|avatar|gravatar|flag|badge|payment|icon-/i.test(im.url)) continue;
      pics.set(im.url, { url: im.url, alt: im.alt, w: im.w, h: im.h, role, from: p.kind, score: (role === 'logo' ? (im.logo ? 50 : 20) + (im.head ? 20 : 0) : (im.product ? 30 : 0) + (im.alt ? 15 : 0) + Math.min(40, im.area / 20000) + (p.kind === 'products' ? 15 : 0)) });
    }
    const all = [...pics.values()]; const logos = all.filter((x) => x.role === 'logo').sort((a, b) => b.score - a.score).slice(0, 2);
    const shots = all.filter((x) => x.role !== 'logo').sort((a, b) => b.score - a.score).slice(0, 10);
    return {
      url: home.url, title: home.title, site: home.site, description: home.description, colors, neutrals, fonts: home.fonts || [],
      pages: pages.map((p) => ({ kind: p.kind, url: p.url, title: p.title, headings: p.headings, text: p.text })),
      logos, svgLogo: home.svgLogo || pages.find((p) => p.svgLogo)?.svgLogo || '', icon: home.icons?.[0]?.url || '', ogImage: home.ogImage || '', pictures: shots,
    };
  } finally { await browser.close().catch(() => {}); }
}

/** Download one picture found on the site and return it as PNG or JPEG bytes the image models accept. Null when it cannot be used. */
export async function fetchPicture(url, { maxBytes = 8 * 1024 * 1024, maxSide = 1600 } = {}) {
  try {
    let u = new URL(url); let buf = null;
    for (let hop = 0; hop < 4 && !buf; hop++) {
      if (!/^https?:$/.test(u.protocol) || !(await hostOk(u.hostname))) return null;
      const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrandKitReader/1.0)', Accept: 'image/*' }, signal: AbortSignal.timeout(12000) });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue; }
      if (!r.ok || Number(r.headers.get('content-length')) > maxBytes) return null;
      const chunks = []; let n = 0; for await (const c of r.body) { n += c.length; if (n > maxBytes) return null; chunks.push(Buffer.from(c)); }
      buf = Buffer.concat(chunks);
    }
    return buf ? toRaster(buf, maxSide) : null;
  } catch { return null; }
}
/** Any picture format the canvas can read (PNG, JPEG, WebP, GIF, SVG, AVIF) as PNG when it has see-through parts, otherwise JPEG. */
export async function toRaster(buf, maxSide = 1600) {
  try {
    const im = await loadImage(buf); if (!im.width || !im.height) return null;
    const k = Math.min(1, maxSide / Math.max(im.width, im.height)); const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
    const cv = createCanvas(w, h); const g = cv.getContext('2d'); g.drawImage(im, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data; let clear = false; for (let i = 3; i < px.length; i += 4 * 97) if (px[i] < 250) { clear = true; break; }
    return clear ? { buf: cv.toBuffer('image/png'), mime: 'image/png', ext: 'png', w, h, clear } : { buf: cv.toBuffer('image/jpeg', 90), mime: 'image/jpeg', ext: 'jpg', w, h, clear };
  } catch { return null; }
}
