// Screenshots + checks of the expand-whole-panel buttons (public/resize.js PANELS).
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
const go = async (hash) => { await p.goto('http://localhost:3000/' + hash, { waitUntil: 'networkidle2' }); await wait(2500); };
const w = (sel) => p.$eval(sel, (e) => Math.round(e.getBoundingClientRect().width));

await go('#/builder/' + vbId);
await p.evaluate(() => document.querySelector('.vb-row')?.click()); await wait(800);
await shot('p1-builder-button');
const before = await w('.vb-panel');
await p.click('.pn-btn[data-panel="vb-panel"]'); await wait(500);
console.log('builder panel', before, '->', await w('.vb-panel'));
await shot('p2-builder-panel-expanded');
// panel still works while expanded: switch scene from the other row is hidden, so change the length slider value through the panel
const prompt = await p.$eval('#vb-prompt', (t) => t.getBoundingClientRect().height);
console.log('prompt box height while expanded', Math.round(prompt));
await p.keyboard.press('Escape'); await wait(400);
console.log('after Esc', await w('.vb-panel'), '| maxed gone:', !(await p.$('.pn-max')));

await go('#/pro/image');
const t0 = await w('.pt-panel'); await shot('p3-pro-button');
await p.click('.pn-btn[data-panel="pt-panel"]'); await wait(500);
console.log('pro settings', t0, '->', await w('.pt-panel')); await shot('p4-pro-panel-expanded');
await p.click('.pn-btn[data-panel="pt-panel"]'); await wait(400);
console.log('after button', await w('.pt-panel'));
console.log('page errors:', errs);
await b.close();
