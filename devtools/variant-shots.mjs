// Screenshots of pages with extra CSS injected, to compare layout options: node devtools/variant-shots.mjs <outDir> <name> <css> <width> <hash...>
import fs from 'node:fs'; import puppeteer from 'puppeteer';
const [out, name, css, w, ...hashes] = process.argv.slice(2); const port = process.env.APP_PORT || 3000;
const db = JSON.parse(fs.readFileSync(new URL('../data/db.json', import.meta.url), 'utf8'));
const a = db.users.find((x) => x.email === 'adxlaiads@gmail.com');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === a.id && Number(v.expires) > Date.now())[0];
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ headless: true });
for (const hash of hashes) {
  const p = await b.newPage(); await p.setViewport({ width: +w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
  await p.goto(`http://localhost:${port}/${hash}`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  if (css) await p.addStyleTag({ content: css }); await new Promise((r) => setTimeout(r, 1800));
  await p.evaluate(() => document.activeElement?.blur());
  await p.screenshot({ path: `${out}/${hash.replace(/[#/]+/g, '_')}-${name}.png` }); await p.close();
}
await b.close();
