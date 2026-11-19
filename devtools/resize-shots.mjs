// Screenshots + checks of resizable panels and movable pop-ups (public/resize.js).
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
const box = (sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
async function drag(area, dx, dy = 0) {
  const h = await box(`.rz-h[data-area="${area}"]:not([hidden])`);
  const x = h.x + h.w / 2; const y = h.y + h.h / 2;
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx / 2, y + dy, { steps: 5 }); await p.mouse.move(x + dx, y + dy, { steps: 5 }); await p.mouse.up(); await wait(400);
}
const clearer = await p.evaluateOnNewDocument(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('pm-size-') || k === 'pm-xp-size') localStorage.removeItem(k); });

// Video Builder: widen the scene panel
await go('#/builder/' + vbId);
await p.evaluate(() => document.querySelector('.vb-row')?.click()); await wait(800);
const w0 = (await box('.vb-panel')).w;
await p.hover('.rz-h[data-area="vb-panel"]'); await wait(400); await shot('r1-builder-divider');
await drag('vb-panel', 240);
const w1 = (await box('.vb-panel')).w; console.log('builder panel', Math.round(w0), '->', Math.round(w1));
await shot('r2-builder-wider');
const saved = await p.evaluate(() => localStorage.getItem('pm-size-vb-panel'));
await p.removeScriptToEvaluateOnNewDocument(clearer.identifier); // keep saved sizes from here on
await p.reload({ waitUntil: 'networkidle2' }); await wait(2500);
console.log('remembered after reload:', saved, Math.round((await box('.vb-panel')).w));
// sidebar
const s0 = (await box('.shell > :first-child')).w; await drag('side', 80); console.log('sidebar', Math.round(s0), '->', Math.round((await box('.shell > :first-child')).w));
await p.$eval('.rz-h[data-area="side"]', (e) => e.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await wait(300);
console.log('sidebar after double-click reset', Math.round((await box('.shell > :first-child')).w));

// Chat with a side preview panel (built the way openCanvas does)
await go('#/chat');
await p.evaluate(() => { const c = document.querySelector('.chat'); const a = document.createElement('aside'); a.className = 'canvas'; a.innerHTML = '<div class="canvas-head"><b>2-Step Verification OTP</b></div><div class="canvas-body"><iframe class="pv-frame" srcdoc="<h1 style=\'font-family:sans-serif;padding:40px\'>Your code is 482 913</h1>"></iframe></div>'; c.append(a); c.classList.add('canvas-open'); });
await wait(600);
const c0 = (await box('.canvas')).w; await drag('canvas', -220); const c1 = (await box('.canvas')).w;
console.log('preview panel', Math.round(c0), '->', Math.round(c1)); await shot('r3-chat-preview-wider');

// Studio Pro image tool settings panel
await go('#/pro/image');
if (await p.$('.rz-h[data-area="pt"]:not([hidden])')) { const t0 = (await box('.pt-split > :last-child')).w; await drag('pt', -120); console.log('pro settings', Math.round(t0), '->', Math.round((await box('.pt-split > :last-child')).w)); await shot('r4-pro-tool'); } else console.log('no pt divider');

// Pop-up: move and resize the expand editor
await go('#/pro/agent');
const ta = await p.evaluate(() => { const t = [...document.querySelectorAll('textarea')].find((x) => x.offsetWidth > 60); t.id ||= 'probe'; return '#' + t.id; });
await p.click(ta); await wait(300); await p.click('.xp-btn'); await wait(400);
const m0 = await box('.xp-modal');
await p.mouse.move(m0.x + 200, m0.y + 25); await p.mouse.down(); await p.mouse.move(m0.x + 80, m0.y - 40, { steps: 8 }); await p.mouse.up(); await wait(200);
const m1 = await box('.xp-modal'); console.log('editor moved by', Math.round(m1.x - m0.x), Math.round(m1.y - m0.y));
await p.mouse.move(m1.x + m1.w - 4, m1.y + m1.h - 4); await p.mouse.down(); await p.mouse.move(m1.x + m1.w - 200, m1.y + m1.h - 150, { steps: 8 }); await p.mouse.up(); await wait(200);
const m2 = await box('.xp-modal'); console.log('editor resized', Math.round(m1.w), 'x', Math.round(m1.h), '->', Math.round(m2.w), 'x', Math.round(m2.h));
await shot('r5-editor-moved-resized');
await p.keyboard.press('Escape');
console.log('page errors:', errs);
await b.close();
