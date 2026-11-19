// When a sign-in ends while the app is open, every page goes to the sign-in page (no dead "Please sign in." box)
// and signing in again returns to that page. Run the app with:
//   FEATURE_STUDIO_PRO=1 FEATURE_VIDEO_AGENT=1 FEATURE_VIDEO_BUILDER=1 ADMIN_EMAILS=so@t.local RATE_LIMITS=0 DATA_DIR=/tmp/t-so PORT=3311 node server/index.js
// then: node devtools/t-signout.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // the globally installed copy works too (NODE_PATH)
const BASE = process.env.BASE || 'http://localhost:3311';
const EMAIL = 'so@t.local', PASS = 'password123';
await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASS, name: 'SO' }) });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const signIn = async () => {
  await page.waitForSelector('input[name=email]');
  await page.fill('input[name=email]', EMAIL); await page.fill('input[name=password]', PASS);
  await page.locator('form button[type=submit]').first().click();
};
await page.goto(BASE + '/#/login'); await signIn(); await page.waitForSelector('#main');
let fails = 0;
for (const p of ['pro', 'ads', 'agent', 'builder', 'chat', 'image', 'video', 'apps', 'assets', 'projects', 'characters', 'billing']) {
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForTimeout(400);
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST' }); }); // the sign-in ends behind the app's back
  await page.evaluate((h) => { location.hash = h; }, '#/' + p);
  let ok = true; let why = '';
  try { await page.waitForFunction(() => location.hash === '#/login' && document.querySelector('input[name=email]'), null, { timeout: 8000 }); }
  catch { ok = false; why = 'did not go to sign-in; page says: ' + (await page.locator('#main').innerText().catch(() => '')).slice(0, 80).replace(/\n/g, ' '); }
  if (ok) {
    const toast = await page.locator('#toasts').innerText().catch(() => '');
    if (!/sign-in has ended/.test(toast)) { await page.waitForTimeout(600); }
    await signIn();
    try { await page.waitForFunction((h) => location.hash === h && document.querySelector('#main'), '#/' + p, { timeout: 8000 }); } catch { ok = false; why = 'not back on the page after sign in: ' + (await page.evaluate(() => location.hash)); }
  }
  console.log(ok ? 'ok  ' : 'FAIL', '#/' + p, why); if (!ok) fails++;
}
await page.goto(BASE + '/#/pro'); await page.waitForTimeout(2500);
await page.screenshot({ path: process.env.SHOT || '/tmp/t-so-pro.png' });
await browser.close();
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
