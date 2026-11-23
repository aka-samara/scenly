import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const B = 'http://localhost:3111', OUT = '/tmp/claude-0/dev/shots';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('PAGEERR ' + e.message));
await p.goto(B); await p.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'secret123' }) })); await p.reload(); await p.waitForSelector('#main');
for (const mode of ['image', 'video']) {
  await p.goto(B + '/#/' + mode); await p.waitForTimeout(1500);
  if (!(await p.locator('#mat-add').count())) { console.log('no mat-add on', mode); continue; }
  await p.click('#mat-add'); await p.waitForSelector('#mat-assets');
  await p.screenshot({ path: `${OUT}/7-${mode}-menu.png` });
  await p.click('#mat-assets'); await p.waitForSelector('.ap-tile');
  await p.locator('.ap-tile').first().click();
  if (await p.locator('#ap-use').count()) await p.click('#ap-use');
  await p.waitForTimeout(1500);
  ok(await p.locator('.mat img, .mats img, [class*=mat] img').count() >= 1, mode + ' studio: asset added as a reference');
  await p.screenshot({ path: `${OUT}/8-${mode}-ref.png` });
}
// chat attach in chat mode
await p.goto(B + '/#/'); await p.waitForTimeout(1200);
await p.click('.icon-btn[title^="Attach"]'); await p.waitForSelector('.ap-box');
ok(await p.locator('#ap-device').count() === 1, 'chat attach shows the picker');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
ok(await p.locator('.ap-box').count() === 0, 'Escape closes it');
// agent
await p.goto(B + '/#/agent'); await p.waitForTimeout(1500);
if (await p.locator('#va-add').count()) { await p.click('#va-add'); await p.click('[data-role=image]'); await p.waitForSelector('.ap-tile'); await p.screenshot({ path: `${OUT}/9-agent.png` }); await p.locator('.ap-tile').first().click(); await p.waitForTimeout(1500); ok(await p.locator('[data-file=image]').count() === 1 && !(await p.locator('[data-file=image] .spin').count()), 'Video Agent start picture from Assets'); }
const q = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })).newPage();
await q.goto(B + '/#/agent'); await q.waitForTimeout(1500); await q.click('#va-add'); await q.click('[data-role=image]'); await q.waitForSelector('.ap-tile'); await q.waitForTimeout(400);
await q.screenshot({ path: `${OUT}/10-phone.png` });
ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: no sideways scroll');
await b.close();
