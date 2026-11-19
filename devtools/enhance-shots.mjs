// Screenshots + checks of the prompt enhancer (public/enhance.js) on every prompt box. Uses the local test account.
// node devtools/enhance-shots.mjs <outDir> [mobile]   — makes real /api/enhance calls (well under 1 credit each).
import fs from 'node:fs';
import puppeteer from 'puppeteer';
const out = process.argv[2]; const mobile = process.argv[3] === 'mobile';
const db = JSON.parse(fs.readFileSync('/Users/akam1/Sites/polymind/data/db.json', 'utf8'));
const u = db.users.find((x) => x.email === 'studio-pro-test@polymind.test');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === u.id && Number(v.expires) > Date.now())[0];
const vp = db.vprojects.find((x) => x.userId === u.id && x.title === 'Builder link fix test');
const brand = db.probrands.find((x) => x.userId === u.id);
const b = await puppeteer.launch({ headless: true });
const p = await b.newPage();
await p.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 2 });
await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const tag = mobile ? 'm-' : '';
const shot = async (n, clip) => { await p.screenshot({ path: `${out}/${tag}${n}.png`, ...(clip ? { clip } : {}) }); };
const go = async (hash) => { await p.goto('http://localhost:3000/' + hash, { waitUntil: 'networkidle2' }); await wait(2200); };
const around = async (sel) => p.evaluate((s) => { const t = document.querySelector(s); const box = (t.closest('.bar') || t.closest('.pt-panel') || t.closest('.ad-field') || t.parentElement).getBoundingClientRect(); const x = Math.max(0, box.left - 12), y = Math.max(0, box.top - 60); return { x, y, width: Math.min(innerWidth - x, box.width + 24), height: Math.min(innerHeight - y, box.height + 80) }; }, sel);

const cases = [
  ['chat', '#/chat', '#composer textarea', 'what to see in lisbon 2 days cheap'],
  ['home', '#/home', '.quick .bar textarea', 'cat surfing'],
  ['image', '#/image', '#prompt', 'red sneaker on a rock'],
  ['agent', '#/agent', '#va-prompt', 'ad for my cold brew coffee'],
  ['builder', `#/builder/${vp?.id}`, '#vb-prompt', null],
  ['pro-agent', '#/pro/agent', '#pa-prompt', 'ugc clip of a girl trying our face cream'],
  ['pro-video', '#/pro/video', '#pt-prompt', 'a dog running on the beach'],
  ['pro-image', '#/pro/image', '#pt-prompt', 'a chocolate bar on marble'],
  ['ads', `#/ads/${brand?.id}`, '.ad-field textarea', null],
];
const only = process.argv[4]?.split(',');
for (const [name, hash, sel, text] of cases) {
  if (only && !only.includes(name)) continue;
  await go(hash);
  if (name === 'builder') { await p.evaluate(() => document.querySelector('.vb-row')?.click()); await wait(800); }
  if (name === 'builder' && process.env.VB_RESET) { await p.$eval('#vb-prompt', (t, v) => { t.focus(); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); }, process.env.VB_RESET); await wait(2500); }
  if (!(await p.$(sel))) { console.log(name, 'NO BOX'); continue; }
  await p.$eval(sel, (t) => t.scrollIntoView({ block: 'center' })); await wait(300);
  const before = await p.$eval(sel, (t) => t.value);
  if (text) { await p.$eval(sel, (t) => { t.focus(); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); }); await p.type(sel, text); }
  const btnSel = name === 'image' ? '#enh-now' : null;
  const hasBtn = btnSel ? !!(await p.$(btnSel)) : await p.$eval(sel, (t) => t.dataset.enh === '1');
  console.log(name, 'button:', hasBtn);
  await shot(`${name}-1-idle`, await around(sel));
  // press it
  if (btnSel) await p.click(btnSel); else await p.evaluate((s) => { const t = document.querySelector(s); const bar = t.closest('.bar'); const b2 = (bar && bar.querySelector('.enh-btn')) || t.parentElement.querySelector('.enh-btn'); b2.click(); }, sel);
  await wait(500); await shot(`${name}-2-busy`, await around(sel));
  for (let i = 0; i < 60 && (await p.$('.enh-strip.busy')); i++) await wait(500);
  await wait(300);
  const after = await p.$eval(sel, (t) => t.value);
  console.log(name, 'changed:', after !== (text ?? before), '|', after.replace(/\s+/g, ' ').slice(0, 110));
  await shot(`${name}-3-done`, await around(sel));
  // undo from the status line
  const undo = await p.$('.enh-strip .enh-link');
  if (undo) { await undo.click(); await wait(text ? 300 : 3000); }
  const back = await p.$eval(sel, (t) => t.value);
  console.log(name, 'undo restores:', back === (text ?? before), '| strip gone:', !(await p.$('.enh-strip')));
  if (name === 'builder') { await wait(2500); const saved = await p.evaluate(async (id) => { const r = await fetch('/api/builder/projects/' + id); const j = await r.json(); return (j.project || j).scenes[0].prompt; }, vp.id); console.log('builder saved original:', saved === before); }
  if (name === 'ads') { await wait(1500); }
}
console.log('page errors:', errs);
await b.close();
