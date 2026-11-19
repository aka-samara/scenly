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
const click = (sel, n = 0) => `(() => { const b = document.querySelectorAll(${JSON.stringify(sel)})[${n}]; b && b.click(); })()`;
const ids = JSON.parse(process.env.AUDIT_IDS || '{}');
const PAGES = [
  ['landing', '#/', null, false], ['login', '#/login', null, false], ['signup', '#/signup', null, false], ['terms', '#/terms', null, false],
  ['home', '#/home'], ['chat', '#/chat'], ['chat-thread', '#/c/' + ids.conv], ['chat-models', '#/chat', click('.bar-row .chipbtn')],
  ['image', '#/image'], ['image-settings', '#/image', open('#set-chip')], ['image-models', '#/image', click('.bar-row .chipbtn', 1)], ['image-history', '#/image/' + ids.img],
  ['video', '#/video'], ['video-settings', '#/video', open('#set-chip')], ['video-history', '#/video/' + ids.vid],
  ['code', '#/code'], ['code-thread', '#/code/' + ids.code],
  ['pro', '#/pro'], ['pro-agent', '#/pro/agent'], ['pro-agent-session', '#/pro/agent/' + ids.pro], ['pro-video', '#/pro/video'], ['pro-image', '#/pro/image'], ['pro-enhance', '#/pro/enhance'],
  ['ads', '#/ads'], ['ads-brand', '#/ads/' + ids.brand], ['agent', '#/agent'], ['builder', '#/builder'], ['builder-project', '#/builder/' + ids.vp], ['builder-agent-project', '#/builder/' + ids.vpAgent],
  ['assets', '#/assets'], ['billing', '#/billing'], ['apps', '#/apps'], ['app-open', '#/apps/product-photoshoot'], ['projects', '#/projects'], ['project-open', '#/projects/' + ids.project],
  ['characters', '#/characters'], ['help', '#/help'], ['admin', '#/admin'], ['admin-users', '#/admin/users'], ['admin-user', '#/admin/users/' + ids.user], ['admin-usage', '#/admin/usage'], ['admin-errors', '#/admin/errors'], ['admin-system', '#/admin/system'],
  ['menu', '#/chat', `(() => { const b = document.querySelector('.menu-btn, .mtab-more'); b && b.click(); })()`],
  ['user-menu', '#/chat', `(() => { document.querySelector('.menu-btn')?.click(); setTimeout(() => document.querySelector('.user-chip')?.click(), 300); })()`],
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
  document.querySelectorAll('.topbar > *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && r.right > W + 1) res.wide.push('topbar item cut off: ' + name(el)); });
  res.clipped = [...new Set(res.clipped)].slice(0, 20); res.small = [...new Set(res.small)].slice(0, 25);
  return res;
};
let b = await puppeteer.launch({ headless: true });
const report = {};
for (const [name, hash, pre, signed = true] of PAGES) {
  if (only && !only.has(name)) continue;
  for (const w of widths) {
    if (!b.connected) b = await puppeteer.launch({ headless: true });
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
    await p.setViewport({ width: w, height: w < 700 ? 844 : 900, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
    // Show the paid studios themselves (the admin account is exempt on the server, the client still checks paidPlan).
    await p.evaluateOnNewDocument(() => { const f = window.fetch; window.fetch = async (...a) => { const r = await f(...a); if (String(a[0]).endsWith('/api/me')) { const j = await r.clone().json().catch(() => null); if (j?.user) { j.user.paidPlan = true; return new Response(JSON.stringify(j), { status: r.status, headers: { 'Content-Type': 'application/json' } }); } } return r; }; });
    if (signed) await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
    try {
      await p.goto(`http://localhost:${process.env.APP_PORT || 3000}/` + hash, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise((r) => setTimeout(r, 1800));
      if (pre) { await p.evaluate(pre); await new Promise((r) => setTimeout(r, 900)); }
      const res = await p.evaluate(probe);
      report[`${name}@${w}`] = res;
      await p.screenshot({ path: `${out}/${name}-${w}.png` });
      if (!pre) {
        const moved = await p.evaluate(() => { let n = 0; document.querySelectorAll('body *').forEach((e) => { const o = getComputedStyle(e).overflowY; if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 200) { e.scrollTop = e.scrollHeight; n++; } }); if (document.scrollingElement.scrollHeight > innerHeight + 40) { scrollTo(0, 1e6); n++; } return n; });
        if (moved) { await new Promise((r) => setTimeout(r, 700)); report[`${name}-end@${w}`] = await p.evaluate(probe); await p.screenshot({ path: `${out}/${name}-end-${w}.png` }); }
      }
    } catch (e) { report[`${name}@${w}`] = { error: String(e.message || e) }; }
    await ctx.close().catch(() => {});
  }
  process.stdout.write('.'); fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
}
await b.close();
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
for (const [k, r] of Object.entries(report)) {
  if (r.error) { console.log(k, 'ERROR', r.error); continue; }
  const bad = r.docOverflow > 0 || r.wide.length || r.clipped.length;
  console.log(`${k}: overflow=${r.docOverflow} wide=${r.wide.length} clipped=${r.clipped.length} small=${r.small.length}${bad ? ' <<' : ''}`);
}
