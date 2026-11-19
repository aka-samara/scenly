// Evaluate an expression on a page: node devtools/probe-once.mjs <hash> <width> <signed 0|1> <js>
import fs from 'node:fs'; import puppeteer from 'puppeteer';
const [hash, w, signed, js] = process.argv.slice(2);
const db = JSON.parse(fs.readFileSync(new URL('../data/db.json', import.meta.url), 'utf8'));
const a = db.users.find((x) => x.email === 'adxlaiads@gmail.com');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === a.id && Number(v.expires) > Date.now())[0];
const b = await puppeteer.launch({ headless: true }); const p = await b.newPage();
await p.setViewport({ width: +w, height: 844, isMobile: true, hasTouch: true });
if (signed === '1') await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
await p.goto(`http://localhost:${process.env.APP_PORT || 3000}/` + hash, { waitUntil: 'networkidle2' }); await new Promise((r) => setTimeout(r, 1500));
console.log(JSON.stringify(await p.evaluate(js), null, 1)); await b.close();
