// Expand-whole-area checks for the Builder scene list, Builder timeline and the image edit panel.
import fs from 'node:fs';
import puppeteer from 'puppeteer';
const [out, vbId] = process.argv.slice(2);
const db = JSON.parse(fs.readFileSync('/Users/akam1/Sites/polymind/data/db.json', 'utf8'));
const u = db.users.find((x) => x.email === 'studio-pro-test@polymind.test');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === u.id && Number(v.expires) > Date.now())[0];
const b = await puppeteer.launch({ headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
const size = (sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
await p.goto('http://localhost:3000/#/builder/' + vbId, { waitUntil: 'networkidle2' }); await wait(2500);
for (const [id, sel] of [['vb-list', '.vb-list'], ['vb-tl', '.vb-tl']]) {
  const a = await size(sel); await p.click(`.pn-btn[data-panel="${id}"]`); await wait(600);
  console.log(id, a, '->', await size(sel)); await shot(`q-${id}`);
  await p.keyboard.press('Escape'); await wait(400); console.log(id, 'after Esc', await size(sel));
}
await shot('q-builder-buttons');
await p.goto('http://localhost:3000/#/image/c_9ApgYBTNTvE3', { waitUntil: 'networkidle2' }); await wait(2500);
const opened = await p.evaluate(() => { const b = [...document.querySelectorAll('button[title^="Edit: change it"]')][0]; if (b) { b.click(); return true; } const i = document.querySelector('.gen-media img, .media-grid img'); i?.click(); return !!i; });
await wait(1500); console.log('editor opened', opened, !!(await p.$('.lightbox.editor')));
if (await p.$('.lightbox.editor')) {
  await shot('q-img-edit-button');
  const a = await size('.lightbox.editor > aside'); await p.click('.pn-btn[data-panel="img-edit"]'); await wait(600);
  console.log('img-edit', a, '->', await size('.lightbox.editor > aside')); await shot('q-img-edit');
  await p.keyboard.press('Escape'); await wait(400); console.log('after Esc', await size('.lightbox.editor > aside'), '| viewer still open:', !!(await p.$('.lightbox.editor')));
}
console.log('page errors:', errs); await b.close();
