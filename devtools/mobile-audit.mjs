// Layout audit: screenshots every area at several widths and lists overflow, clipped labels and small tap targets.
// Usage: node devtools/mobile-audit.mjs <outDir> [widths=375,390,430,1440] [only=name,name]
import fs from 'node:fs';
import puppeteer from 'puppeteer';
const [out, widthsArg = '375,390,430,1440', onlyArg = ''] = process.argv.slice(2);
const widths = widthsArg.split(',').map(Number);
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
fs.mkdirSync(out, { recursive: true });
const db = JSON.parse(fs.readFileSync(new URL('../data/db.json', import.meta.url), 'utf8'));
const admin = db.users.find((x) => x.email === 'adxlaiads@gmail.com');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === admin.id && Number(v.expires) > Date.now())?.[0];
const open = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); b && b.click(); })()`;
const PAGES = [
  ['landing', '#/', null, false], ['login', '#/login', null, false], ['signup', '#/signup', null, false],
  ['chat', '#/chat'], ['image', '#/image'], ['image-settings', '#/image', open('#set-chip')],
  ['video', '#/video'], ['video-settings', '#/video', open('#set-chip')],
  ['pro', '#/pro'], ['pro-agent', '#/pro/agent'], ['pro-video', '#/pro/video'], ['pro-image', '#/pro/image'],
  ['ads', '#/ads'], ['agent', '#/agent'], ['builder', '#/builder'], ['assets', '#/assets'], ['billing', '#/billing'],
  ['apps', '#/apps'], ['projects', '#/projects'], ['characters', '#/characters'], ['code', '#/code'], ['home', '#/home'],
  ['admin', '#/admin'], ['admin-users', '#/admin/users'], ['menu', '#/chat', `(() => { const b = document.querySelector('.menu-btn, .hamburger, [aria-label="Menu"], .mob-menu, #menu-btn'); b && b.click(); })()`],
];
const probe = () => {
  const W = innerWidth; const res = { docOverflow: document.documentElement.scrollWidth - W, wide: [], clipped: [], small: [], wrapped: [] };
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; };
  const name = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')) + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40) + '"';
  const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && (r.right > W + 1 || r.left < -1) && !inScroller(el) && res.wide.length < 12) res.wide.push(name(el) + ` [${Math.round(r.left)}..${Math.round(r.right)}]`);
    const ctl = el.matches('button, .btn, .opt, .chip, a.btn, [role=button], select, .tab, label.chip, .pill');
    if (ctl) {
      if ((el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible') || (el.scrollHeight > el.clientHeight + 2 && cs.overflowY !== 'visible' && el.tagName !== 'SELECT')) res.clipped.push(name(el));
      // text spilling out of a fixed-height control
      else if (el.tagName !== 'SELECT' && cs.height !== 'auto' && el.scrollHeight > el.clientHeight + 2) res.clipped.push(name(el) + ' (spills)');
      if (W < 700 && (r.height < 32 || r.width < 32) && !el.closest('.hljs, pre')) res.small.push(name(el) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  res.clipped = [...new Set(res.clipped)].slice(0, 20); res.small = [...new Set(res.small)].slice(0, 25);
  return res;
};
const b = await puppeteer.launch({ headless: true });
const report = {};
for (const [name, hash, pre, signed = true] of PAGES) {
  if (only && !only.has(name)) continue;
  for (const w of widths) {
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
    await p.setViewport({ width: w, height: w < 700 ? 844 : 900, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
    // Show the paid studios themselves (the admin account is exempt on the server, the client still checks paidPlan).
    await p.evaluateOnNewDocument(() => { const f = window.fetch; window.fetch = async (...a) => { const r = await f(...a); if (String(a[0]).endsWith('/api/me')) { const j = await r.clone().json().catch(() => null); if (j?.user) { j.user.paidPlan = true; return new Response(JSON.stringify(j), { status: r.status, headers: { 'Content-Type': 'application/json' } }); } } return r; }; });
    if (signed) await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
    try {
      await p.goto('http://localhost:3000/' + hash, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1800));
      if (pre) { await p.evaluate(pre); await new Promise((r) => setTimeout(r, 900)); }
      const res = await p.evaluate(probe);
      report[`${name}@${w}`] = res;
      await p.screenshot({ path: `${out}/${name}-${w}.png` });
    } catch (e) { report[`${name}@${w}`] = { error: String(e.message || e) }; }
    await ctx.close();
  }
  process.stdout.write('.');
}
await b.close();
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
for (const [k, r] of Object.entries(report)) {
  if (r.error) { console.log(k, 'ERROR', r.error); continue; }
  const bad = r.docOverflow > 0 || r.wide.length || r.clipped.length;
  console.log(`${k}: overflow=${r.docOverflow} wide=${r.wide.length} clipped=${r.clipped.length} small=${r.small.length}${bad ? ' <<' : ''}`);
}
