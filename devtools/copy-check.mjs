// Clicks the copy icon on the last chat answer and prints what the clipboard holds: node devtools/copy-check.mjs <convId>
import fs from 'node:fs'; import puppeteer from 'puppeteer';
const [cid] = process.argv.slice(2); const port = process.env.APP_PORT || 3000;
const db = JSON.parse(fs.readFileSync(new URL('../data/db.json', import.meta.url), 'utf8'));
const a = db.users.find((x) => x.email === 'adxlaiads@gmail.com');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === a.id && Number(v.expires) > Date.now())[0];
const b = await puppeteer.launch({ headless: true });
const ctx = b.defaultBrowserContext(); await ctx.overridePermissions(`http://localhost:${port}`, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 900 });
await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
await p.goto(`http://localhost:${port}/#/c/${cid}`, { waitUntil: 'networkidle2' }); await new Promise((r) => setTimeout(r, 1500));
await p.evaluate(() => { const btns = [...document.querySelectorAll('.msg:not(.user) button[title="Copy"]')]; btns.pop().click(); });
await new Promise((r) => setTimeout(r, 800));
console.log(JSON.stringify(await p.evaluate(async () => { const items = await navigator.clipboard.read(); const out = {}; for (const it of items) for (const t of it.types) out[t] = (await (await it.getType(t)).text()).slice(0, 400); return out; }), null, 1));
await b.close();
