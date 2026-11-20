// Phone shots of Image and Video: start page, Explore ideas (top and scrolled), history. node devtools/studio-shots.mjs <outDir> <width> [imgConvId]
import fs from 'node:fs'; import puppeteer from 'puppeteer';
const [out, w = 390, conv = ''] = process.argv.slice(2); const port = process.env.APP_PORT || 3000;
const db = JSON.parse(fs.readFileSync(new URL('../data/db.json', import.meta.url), 'utf8'));
const a = db.users.find((x) => x.email === 'adxlaiads@gmail.com');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === a.id && Number(v.expires) > Date.now())[0];
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ headless: true });
const shot = async (name, hash, pre) => {
  const p = await b.newPage(); await p.setViewport({ width: +w, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
  await p.goto(`http://localhost:${port}/${hash}`, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  if (pre) { await p.evaluate(pre); await new Promise((r) => setTimeout(r, 1200)); }
  await p.evaluate(() => document.activeElement?.blur());
  await p.screenshot({ path: `${out}/${name}-${w}.png` }); await p.close();
};
const explore = `document.querySelectorAll('.topbar .seg button')[1]?.click()`;
const down = `(${explore}, setTimeout(() => { const s = document.getElementById('studio-scroll'); if (s) s.scrollTop = 520; }, 700))`;
for (const m of ['image', 'video']) {
  await shot(`${m}-start`, `#/${m}`);
  await shot(`${m}-ideas`, `#/${m}`, explore);
  await shot(`${m}-ideas-scrolled`, `#/${m}`, down);
}
if (conv) await shot('image-history', `#/image/${conv}`);
await b.close();
