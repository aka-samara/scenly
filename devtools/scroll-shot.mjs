// Screenshot a page at a width after scrolling its main scroll area: node devtools/scroll-shot.mjs <out.png> <hash> <width> <scrollY>
import fs from 'node:fs'; import puppeteer from 'puppeteer';
const [out, hash, w, y = 0] = process.argv.slice(2);
const db = JSON.parse(fs.readFileSync(new URL('../data/db.json', import.meta.url), 'utf8'));
const a = db.users.find((x) => x.email === 'adxlaiads@gmail.com');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === a.id && Number(v.expires) > Date.now())[0];
const b = await puppeteer.launch({ headless: true }); const p = await b.newPage();
await p.setViewport({ width: +w, height: 844, isMobile: +w < 700, hasTouch: +w < 700 });
await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
await p.goto(`http://localhost:${process.env.APP_PORT || 3000}/` + hash, { waitUntil: 'networkidle2' }); await new Promise((r) => setTimeout(r, 1500));
await p.evaluate((y) => { document.querySelectorAll('.scroll, .page, .main *').forEach((e) => { if (e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = +y; }); }, y);
await new Promise((r) => setTimeout(r, 400)); await p.screenshot({ path: out }); await b.close();
