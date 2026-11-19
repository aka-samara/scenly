// Screenshots + checks of the expand editor (public/expand.js). Uses the local test account's session.
import fs from 'node:fs';
import puppeteer from 'puppeteer';
const out = process.argv[2];
const db = JSON.parse(fs.readFileSync('/Users/akam1/Sites/polymind/data/db.json', 'utf8'));
const u = db.users.find((x) => x.email === 'studio-pro-test@polymind.test');
const token = Object.entries(db.sessions).find(([, v]) => v.userId === u.id && Number(v.expires) > Date.now())[0];
const b = await puppeteer.launch({ headless: true });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await p.setCookie({ name: 'pm_session', value: token, domain: 'localhost', path: '/' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const shot = async (n) => { await p.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n); };
const go = async (hash) => { await p.goto('http://localhost:3000/' + hash, { waitUntil: 'networkidle2' }); await wait(2500); };
const hover = async (sel) => { await p.hover(sel); await wait(400); };

// 1. Video Builder scene prompt
await go('#/builder/' + process.argv[3]);
await p.evaluate(() => document.querySelector('.vb-row')?.click()); await wait(800);
const before = await p.$eval('#vb-prompt', (t) => t.value);
await p.click('#vb-prompt'); await wait(400); await shot('1-builder-button');
await p.click('.xp-btn'); await wait(500); await shot('2-builder-editor');
console.log('title:', await p.$eval('#xp-title', (e) => e.textContent));
await p.keyboard.type(' Then the camera slowly pulls back to reveal the whole cafe.'); await wait(200);
await shot('3-builder-editing');
await p.keyboard.down('Meta'); await p.keyboard.press('Enter'); await p.keyboard.up('Meta'); await wait(800);
const after = await p.$eval('#vb-prompt', (t) => t.value);
console.log('saved ok:', after.endsWith('whole cafe.'), '| modal gone:', !(await p.$('.xp-bg')));
await shot('4-builder-saved');
// Cancel keeps the text
await p.click('#vb-prompt'); await wait(300); await p.click('.xp-btn'); await wait(300);
await p.keyboard.type(' JUNK'); await p.keyboard.press('Escape'); await wait(300);
console.log('cancel ok:', (await p.$eval('#vb-prompt', (t) => t.value)) === after, '| page still there:', !!(await p.$('#vb-prompt')));
// restore the original prompt through the editor
await p.click('#vb-prompt'); await wait(300); await p.click('.xp-btn'); await wait(300);
await p.$eval('.xp-ta', (t, v) => { t.value = v; }, before); await p.click('.xp-save'); await wait(4000);
console.log('restored:', (await p.$eval('#vb-prompt', (t) => t.value)) === before);

// 2. Studio Pro agent, 3. chat composer
for (const [name, hash] of [['5-pro-agent', '#/pro/agent'], ['6-chat', '#/chat'], ['7-image', '#/image']]) {
  await go(hash);
  const sel = await p.evaluate(() => { const t = [...document.querySelectorAll('textarea')].find((x) => x.offsetWidth > 60); if (!t) return null; t.id ||= 'xp-probe'; return '#' + t.id; });
  if (!sel) { console.log(name, 'no textarea'); continue; }
  await p.click(sel); await wait(400); await shot(name);
  await p.click('.xp-btn'); await wait(400); console.log(name, 'title:', await p.$eval('#xp-title', (e) => e.textContent)); await shot(name + '-editor');
  await p.keyboard.press('Escape'); await wait(200);
}
console.log('page errors:', errs);
await b.close();
