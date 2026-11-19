// Help centre check: screenshots the help pages (desktop, phone, signed out, light mode), tests search,
// checks every help link points at a real article and section, and that each page's "?" opens a real article.
// Usage: node devtools/help-shots.mjs <outDir>
import fs from 'node:fs';
import puppeteer from 'puppeteer';
import { ARTICLES } from '../public/help-content.js';

const out = process.argv[2] || 'data/help-shots';
fs.mkdirSync(out, { recursive: true });
const db = JSON.parse(fs.readFileSync(new URL('../data/db.json', import.meta.url), 'utf8'));
const admin = db.users.find((x) => x.email === 'adxlaiads@gmail.com');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === admin.id && Number(v.expires) > Date.now())?.[0];
const BASE = 'http://localhost:3000/';
const problems = [];

// 1. Every #/help link inside the articles points at an article (and section) that exists.
const ids = new Set(ARTICLES.map((a) => a.id));
const secs = Object.fromEntries(ARTICLES.map((a) => [a.id, new Set([...a.body.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1]))]));
for (const a of ARTICLES) {
  for (const [, id, sec] of a.body.matchAll(/href="#\/help\/([\w-]+)(?:\/([\w-]+))?"/g)) {
    if (!ids.has(id)) problems.push(`${a.id}: link to missing article ${id}`);
    else if (sec && !secs[id].has(sec)) problems.push(`${a.id}: link to missing section ${id}/${sec}`);
  }
  if (a.sum.length > 120) problems.push(`${a.id}: summary is long`);
}

const b = await puppeteer.launch({ headless: true });
async function page({ w = 1440, hgt = 900, signed = true, light = false, paid = true } = {}) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage();
  await p.setViewport({ width: w, height: hgt, deviceScaleFactor: w < 700 ? 2 : 1, isMobile: w < 700, hasTouch: w < 700 });
  if (paid) await p.evaluateOnNewDocument(() => { const f = window.fetch; window.fetch = async (...a) => { const r = await f(...a); if (String(a[0]).endsWith('/api/me')) { const j = await r.clone().json().catch(() => null); if (j?.user) { j.user.paidPlan = true; return new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } }); } } return r; }; });
  if (light) await p.evaluateOnNewDocument(() => localStorage.setItem('pm-theme', JSON.stringify('light')));
  if (signed) await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
  p.on('pageerror', (e) => problems.push('page error: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|401/.test(m.text())) problems.push('console: ' + m.text()); });
  return { p, ctx };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const go = async (p, hash) => { await p.goto(BASE + hash, { waitUntil: 'networkidle2', timeout: 30000 }); await wait(1200); };
const overflow = (p, name) => p.evaluate(() => document.documentElement.scrollWidth - innerWidth).then((o) => { if (o > 1) problems.push(`${name}: page wider than screen by ${o}px`); });

// 2. Desktop, signed in.
{
  const { p, ctx } = await page();
  await go(p, '#/help'); await p.screenshot({ path: `${out}/01-help-home.png` });
  await p.type('.hp-search input', 'refund');
  await wait(300); await p.screenshot({ path: `${out}/02-search-refund.png` });
  const n = await p.$$eval('.hp-result', (x) => x.length); if (!n) problems.push('search "refund" found nothing');
  await go(p, '#/help/credits'); await p.screenshot({ path: `${out}/03-article-credits.png` });
  await go(p, '#/help/studio-pro/face-lock'); await p.screenshot({ path: `${out}/04-article-section.png` });
  // The "?" on each page opens a real article.
  for (const hash of ['#/chat', '#/image', '#/video', '#/agent', '#/builder', '#/pro', '#/pro/agent', '#/ads', '#/code', '#/apps', '#/assets', '#/billing', '#/projects', '#/characters', '#/home']) {
    await go(p, hash);
    const href = await p.$eval('.topbar .help-btn', (a) => a.getAttribute('href')).catch(() => null);
    const [, , id, sec] = (href || '').split('/');
    if (!href || !ids.has(id) || (sec && !secs[id].has(sec))) problems.push(`${hash}: help button goes to ${href}`);
    if (hash === '#/image') await p.screenshot({ path: `${out}/05-image-page-help-button.png` });
  }
  await go(p, '#/chat');
  const side = await p.$('.sidebar a[href="#/help"]'); if (!side) problems.push('no Help in the sidebar');
  await ctx.close();
}
// 3. Light mode.
{ const { p, ctx } = await page({ light: true }); await go(p, '#/help/plans'); await p.screenshot({ path: `${out}/06-light-plans.png` }); await ctx.close(); }
// 4. Phone.
{
  const { p, ctx } = await page({ w: 390, hgt: 844 });
  await go(p, '#/help'); await overflow(p, 'phone help'); await p.screenshot({ path: `${out}/07-phone-help.png` });
  await go(p, '#/help/video-builder'); await overflow(p, 'phone article'); await p.screenshot({ path: `${out}/08-phone-article.png` });
  await go(p, '#/image'); await overflow(p, 'phone image'); await p.screenshot({ path: `${out}/08b-phone-image-help-button.png` });
  await go(p, '#/chat'); await p.evaluate(() => document.querySelector('.mtab-more')?.click()); await wait(600);
  await p.screenshot({ path: `${out}/09-phone-menu.png` });
  await ctx.close();
}
// 5. Signed out: public help and the landing footer link.
{
  const { p, ctx } = await page({ signed: false, paid: false });
  await go(p, '#/help/welcome'); await p.screenshot({ path: `${out}/10-public-article.png` });
  await go(p, '#/'); const link = await p.$('.lp-footer a[href="#/help"]'); if (!link) problems.push('no help link in the landing footer');
  await p.evaluate(() => document.querySelector('.lp-footer')?.scrollIntoView()); await wait(500);
  await p.screenshot({ path: `${out}/11-landing-footer.png` });
  await ctx.close();
}
await b.close();
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'All checks passed.');
