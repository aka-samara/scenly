// Screenshots of Studio Pro for the report. Signs in with the local test account's existing session.
import fs from 'node:fs';
import puppeteer from 'puppeteer';
const [out, cookieName, ...pages] = process.argv.slice(2);
const db = JSON.parse(fs.readFileSync('/Users/akam1/Sites/polymind/data/db.json', 'utf8'));
const u = db.users.find((x) => x.email === 'studio-pro-test@polymind.test');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === u.id && Number(v.expires) > Date.now())[0];
const b = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.setCookie({ name: cookieName, value: token, domain: 'localhost', path: '/' });
for (const spec of pages) {
  const [name, hash, pre] = spec.split('|');
  await p.goto('http://localhost:3000/' + hash, { waitUntil: 'networkidle2' }); await p.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2500));
  if (pre) { await p.evaluate(pre); await new Promise((r) => setTimeout(r, 1500)); }
  await p.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name);
}
await b.close();
