import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const B = 'http://localhost:3111', OUT = '/tmp/claude-0/dev/shots';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
const email = 'admin@example.com';
await p.goto(B);
const reg = await p.evaluate(async (email) => (await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ada', email, password: 'secret123' }) })).status, email);
if (reg === 200) await p.goto(JSON.parse(fs.readFileSync('/tmp/pmd/outbox.json', 'utf8')).filter((m) => m.to === email).pop().url);
else { await p.evaluate(async (email) => fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123' }) }), email); await p.goto(B); }
await p.waitForSelector('#main');
await p.evaluate(() => fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offerId: 'pro' }) }));
const J = (path, method = 'GET', body) => p.evaluate(async ([path, method, body]) => { const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({ status: r.status })); }, [path, method, body]);
let lib = (await J('/api/library')).items;
if (lib.length < 4) {
  const models = (await J('/api/models')).models || [];
  const im = models.find((m) => m.type === 'image');
  for (const prompt of ['A red sports car on a mountain road', 'Matte black water bottle, pastel background', 'Golden retriever puppy in a garden', 'Neon city street at night']) {
    const r = await J('/api/generate', 'POST', { mode: 'image', model: im.id, prompt, params: {}, idem: Math.random().toString(36) });
    if (!r.media && !r.items) console.log('gen', JSON.stringify(r).slice(0, 200));
  }
  lib = (await J('/api/library')).items;
}
console.log('library', lib.length, lib.map((x) => x.type).join(','));
ok(lib.filter((x) => x.type === 'image').length >= 4, 'test pictures in Assets');

// 1. Video Builder: AI scene start picture -> From my assets
await p.goto(B + '/#/builder'); await p.waitForSelector('#vb-new');
await p.click('#vb-new'); await p.fill('#vb-new-title', 'Picker test'); await p.click('[data-ratio="16:9"]'); await p.click('#vb-create');
await p.waitForSelector('#vb-list');
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /AI scene/i.test(x.textContent))?.click());
await p.waitForSelector('#vb-ref', { timeout: 8000 });
await p.click('#vb-ref');
await p.waitForSelector('.ap-tile'); await p.waitForTimeout(600);
ok(await p.textContent('.ap-box .modal-head b') === 'Start picture', 'start picture opens the picker titled Start picture');
ok(await p.locator('#ap-device').isVisible(), 'Upload from device is offered');
await p.screenshot({ path: OUT + '/1-builder-start-picture.png' });
await p.fill('#ap-search', 'puppy'); await p.waitForTimeout(200);
ok(await p.locator('.ap-tile').count() === 1, 'search narrows to the matching asset');
await p.screenshot({ path: OUT + '/2-search.png' });
await p.click('.ap-tile');
await p.waitForFunction(() => !document.querySelector('.ap-box'));
await p.waitForTimeout(1500);
const pid = await p.evaluate(() => location.hash.split('/')[2]);
await p.waitForTimeout(1500);
const proj = await J('/api/builder/projects/' + pid);
const sc = (proj.project || proj).scenes?.find((s) => s.type === 'ai');
ok(!!sc?.refFileId, 'picked asset became the scene start picture: ' + sc?.refFileId);
await p.screenshot({ path: OUT + '/3-builder-picture-set.png' });

// 2. Device upload still works through the picker
await p.click('#vb-ref'); await p.waitForSelector('#ap-device');
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#ap-device')]);
ok(!!fc, 'Upload from device opens the file window');
await fc.setFiles([]);

// 3. Builder Add files: several kinds, multi-select
await p.click('#vb-add'); await p.waitForSelector('.ap-tile');
ok(await p.locator('#ap-tabs button').count() >= 2, 'type filter tabs shown for the kinds that exist');
await p.locator('.ap-tile').nth(0).click(); await p.locator('.ap-tile').nth(1).click();
ok((await p.textContent('#ap-use')) === 'Use 2', 'two picked');
await p.screenshot({ path: OUT + '/4-builder-add-files-multi.png' });
const before = (await J('/api/builder/projects/' + pid)).project?.scenes?.length ?? (await J('/api/builder/projects/' + pid)).scenes?.length;
await p.click('#ap-use'); await p.waitForTimeout(3500);
const after = (await J('/api/builder/projects/' + pid)); const n = (after.project || after).scenes.length;
ok(n === before + 2, `two scenes added from Assets (${before} -> ${n})`);

// 4. Video Studio material menu
await p.goto(B + '/#/video'); await p.waitForTimeout(1500);
const mat = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /mats|material/i.test(x.id + x.className) || /Add a picture|Image \/ Video/i.test(x.textContent)); return b ? (b.id || b.className || b.textContent) : null; });
console.log('mat button', mat);

// 5. chat attach in image mode / AI app drop box
await p.goto(B + '/#/apps'); await p.waitForTimeout(800);
await p.click('.appc'); await p.waitForTimeout(1000);
if (await p.locator('.drop').count()) {
  await p.locator('.drop').first().click(); await p.waitForSelector('.ap-tile');
  await p.screenshot({ path: OUT + '/5-ai-app.png' });
  await p.locator('.ap-tile').first().click(); await p.waitForTimeout(1500);
  ok(await p.locator('.drop img').count() >= 1, 'AI app input shows the picked asset');
}

// phone
const ph = await b.newContext({ ...(await import('/opt/node22/lib/node_modules/playwright/index.js').then(() => ({}))), viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
const q = await ph.newPage(); await q.goto(B + '/#/builder/' + pid); await q.waitForTimeout(2500);
await q.evaluate(() => { const s = document.querySelector('[data-scene], .vb-row'); });
await q.evaluate(() => document.querySelector('#vb-add')?.click()); await q.waitForSelector('.ap-tile', { timeout: 8000 }).catch(() => {});
await q.screenshot({ path: OUT + '/6-phone.png' });
await b.close();
