// Crop for social: API and screen checks, plus screenshots on a computer and a phone.
// Needs a test copy on 3111 with the mock gateway and the Builder on:
//   MAIL_OUTBOX=1 RATE_LIMITS=0 FEATURE_VIDEO_BUILDER=1 DATA_DIR=/tmp/pmd PORT=3111 node server/index.js
// Usage: DATA_DIR=/tmp/pmd node devtools/t-crop.mjs <out folder>   (SCALE=2 for sharp pictures)
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const B = 'http://localhost:3111'; const DATA = process.env.DATA_DIR || '/tmp/pmd';
const OUT = process.argv[2] || '/tmp/crop-shots'; fs.mkdirSync(OUT, { recursive: true });
const SCALE = Number(process.env.SCALE) || 1;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-')); const sh = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
// A wide clip with something to look at: a test pattern with a moving ball, and sound.
sh(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', tmp + '/wide.mp4']);
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', f], { encoding: 'utf8' })).streams;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE, acceptDownloads: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR ' + e.message); });
const email = `crop${Date.now()}@example.com`;
await p.goto(B);
await p.evaluate(async (email) => fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ada', email, password: 'secret123' }) }), email);
await p.goto(JSON.parse(fs.readFileSync(DATA + '/outbox.json', 'utf8')).filter((m) => m.to === email).pop().url.replace(/^https?:\/\/[^/]+/, B));
await p.waitForSelector('#main');
const J = (u, method = 'GET', body) => p.evaluate(async ([u, method, body]) => { const r = await fetch(u, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); return { status: r.status, ...j }; }, [u, method, body]);
await J('/api/billing/checkout', 'POST', { offerId: 'max20' });
const up = (await (await ctx.request.post(B + '/api/files?proxy=1', { multipart: { files: { name: 'wide.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync(tmp + '/wide.mp4') } } })).json()).files[0].id;

// A Builder project made from the wide clip, exported once (the export also lands in Assets).
let v = await J('/api/builder/projects', 'POST', { title: 'Harbour morning', ratio: '16:9', resolution: '720p' }); const P = v.project.id;
v = await J(`/api/builder/projects/${P}/add`, 'POST', { fileIds: [up] });
v = await J(`/api/builder/projects/${P}/export`, 'POST', { resolution: '720p', idem: 'e' + Date.now() });
let ex = null;
for (let i = 0; i < 200 && !ex; i++) { await p.waitForTimeout(400); const x = await J('/api/builder/projects/' + P); ex = x.project.exports?.find((e) => e.status === 'done'); }
ok(!!ex?.fileId, 'test export finished: ' + ex?.width + 'x' + ex?.height);
const FID = ex.fileId;

// ---------- API ----------
const info = await J(`/api/media/${FID}/crop-info`);
ok(info.w === 1280 && info.h === 720 && info.hasAudio, `crop-info reads size and sound (${info.w}x${info.h}, sound ${info.hasAudio})`);
const t0 = Date.now();
let r = await J(`/api/media/${FID}/crop`, 'POST', { preset: 'tiktok', shape: '9x16', x: 0.2, y: 0.5 });
ok(r.job?.id, 'crop starts a job');
for (let i = 0; i < 100; i++) { const { job } = await J('/api/jobs/' + r.job.id); if (job.status === 'done' || job.status === 'failed') { ok(job.status === 'done', 'job done ' + (job.error || '')); break; } await p.waitForTimeout(250); }
r = await J(`/api/media/${FID}/crop`, 'POST', { preset: 'tiktok', shape: '9x16', x: 0.2, y: 0.5 });
ok(r.ready && /^\/api\/dlcrop\//.test(r.url), 'pressing again gives the link at once');
ok(/_tiktok-9x16\.mp4$/.test(r.name), 'file name says where it is for: ' + r.name);
console.log('crop took', Date.now() - t0, 'ms');
const res = await ctx.request.get(B + r.url); const buf = await res.body(); fs.writeFileSync(tmp + '/out.mp4', buf);
ok(/attachment/.test(res.headers()['content-disposition'] || ''), 'download comes as a file');
let s = probe(tmp + '/out.mp4'); const sv = s.find((x) => x.codec_type === 'video');
ok(sv.width === 720 && sv.height === 1280, `9:16 crop is ${sv.width}x${sv.height}`);
ok(s.some((x) => x.codec_type === 'audio'), 'sound is kept');
r = await J(`/api/media/${FID}/crop`, 'POST', { preset: 'ig-story', shape: '9x16', mode: 'fit' });
for (let i = 0; i < 100 && !r.ready; i++) { await p.waitForTimeout(300); r = await J(`/api/media/${FID}/crop`, 'POST', { preset: 'ig-story', shape: '9x16', mode: 'fit' }); }
s = probe(tmp + '/fit.mp4', fs.writeFileSync(tmp + '/fit.mp4', await (await ctx.request.get(B + r.url)).body())).find((x) => x.codec_type === 'video');
ok(s.width === 1080 && s.height === 1920, `fit with blurred edges is ${s.width}x${s.height}`);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-i', tmp + '/fit.mp4', '-frames:v', '1', OUT + '/api-fit-frame.png']);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-i', tmp + '/out.mp4', '-frames:v', '1', OUT + '/api-crop-frame.png']);
ok((await J(`/api/media/${FID}/crop`, 'POST', { shape: 'nope' })).status === 400, 'an unknown shape is refused');
ok((await J(`/api/media/m_nothere/crop-info`)).status === 404, 'a missing video is refused');
ok((await J(`/api/media/${up}/crop-info`)).w === 1280, 'uploaded videos can be cropped too');
const before = (await J('/api/me')).user?.credits ?? (await J('/api/me')).credits;
r = await J(`/api/media/${FID}/crop`, 'POST', { preset: 'youtube', shape: '1x1', x: 0.7 });
const after = (await J('/api/me')).user?.credits ?? (await J('/api/me')).credits;
ok(before === after, `no credits used (${before} -> ${after})`);

// ---------- screen: Builder export dialog ----------
const theme = (t) => p.evaluate((t) => localStorage.setItem('pm-theme', JSON.stringify(t)), t);
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
await theme('dark');
await p.goto(B + '/#/builder/' + P); await p.reload(); await p.waitForSelector('.vb-row');
await p.click('#vb-export'); await p.waitForSelector('#vb-exports');
ok(await p.locator('#vb-exports [data-crop]').count() >= 1, 'finished export has Crop for social');
await shot('1-builder-export-dialog');
await p.click('#vb-exports [data-crop]'); await p.waitForSelector('#cr-stage'); await p.waitForTimeout(1200);
const order = await p.$$eval('.cr-shape', (els) => els.map((e) => e.dataset.shape));
ok(order[0] !== '16x9' && order[order.length - 1] === '16x9', 'shapes unlike the video come first, its own last: ' + order.join(' '));
ok(await p.locator('.cr-shape.on[data-shape="9x16"]').count() === 1, '9:16 picked first');
ok((await p.$$eval('.cr-chip', (els) => els.map((e) => e.textContent))).join('|').includes('TikTok story'), 'TikTok story offered');
ok(await p.locator('#cr-warn').isVisible(), 'warns that a 9:16 cut of a wide 720p video is soft');
await shot('2-crop-dialog-dark');
// drag the video to the left side, then back to the centre (snap)
const st = await p.locator('#cr-stage').boundingBox(); const fr0 = await p.locator('.cr-vid').boundingBox();
await p.mouse.move(st.x + st.width / 2, st.y + st.height / 2); await p.mouse.down(); await p.mouse.move(st.x + st.width / 2 + 160, st.y + st.height / 2, { steps: 8 });
await shot('3-dragging'); await p.mouse.up();
const fr1 = await p.locator('.cr-vid').boundingBox();
ok(fr1.x > fr0.x + 100, `dragging right moves the video right (${Math.round(fr0.x)} -> ${Math.round(fr1.x)})`);
await p.mouse.move(st.x + st.width / 2, st.y + st.height / 2); await p.mouse.down(); await p.mouse.move(st.x + st.width / 2 - 158, st.y + st.height / 2, { steps: 8 });
ok(await p.locator('.cr-frame.snap-x').count() === 1, 'snaps to the centre with a guide line');
await p.mouse.up();
const fr2 = await p.locator('.cr-vid').boundingBox();
ok(Math.abs(fr2.x - fr0.x) < 1.5, 'back exactly in the middle');
// a few drags past the edge stay inside the video
await p.mouse.move(st.x + 20, st.y + 20); await p.mouse.down(); await p.mouse.move(st.x + st.width - 5, st.y + 20, { steps: 5 }); await p.mouse.up();
const fb = await p.locator('.cr-frame').boundingBox(); const vb = await p.locator('.cr-vid').boundingBox();
ok(vb.x <= fb.x + 1 && vb.x + vb.width >= fb.x + fb.width - 1, 'the frame never leaves the picture');
// download from the dialog
await p.click('[data-shape="4x5"]'); await p.click('[data-preset="ig-portrait"]');
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('#cr-dl')]);
ok(/ig-portrait-4x5\.mp4$/.test(dl.suggestedFilename()), 'Download gives the cropped file: ' + dl.suggestedFilename());
await dl.saveAs(tmp + '/dl.mp4'); s = probe(tmp + '/dl.mp4').find((x) => x.codec_type === 'video');
ok(s.width === 720 && s.height === 900, `4:5 download is ${s.width}x${s.height}`);
await p.waitForTimeout(600); await shot('4-after-download');
await p.click('.cr-mode [data-mode="fit"]'); await p.waitForTimeout(300);
ok(await p.locator('#cr-zoom').isHidden(), 'zoom hides when fitting the whole video');
await p.click('[data-shape="1x1"]'); await p.waitForTimeout(300); await shot('5-fit-square');
await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelectorAll('.modal-bg').forEach((x) => x.remove()));

// ---------- screen: Assets and lightbox ----------
await theme('light');
await p.goto(B + '/#/assets'); await p.reload(); await p.waitForSelector('.tile[data-id]', { timeout: 15000 });
const tile = p.locator(`.tile[data-id="${FID}"]`); await tile.hover();
ok(await tile.locator('[data-crop]').isVisible(), 'Assets tile shows the crop button on a video');
await shot('6-assets-hover');
await tile.locator('video').click(); await p.waitForSelector('.lightbox [data-crop]');
ok(true, 'video lightbox has Crop for social');
await shot('7-lightbox');
await p.click('.lightbox [data-crop]'); await p.waitForSelector('#cr-stage'); await p.waitForTimeout(1200);
await p.click('[data-shape="1x1"]'); await p.waitForTimeout(300);
await shot('8-crop-dialog-light');
const z = await p.evaluate(() => getComputedStyle(document.querySelector('.crop-bg')).zIndex);
ok(Number(z) > 120, 'crop dialog sits above the lightbox');

// ---------- phone: touch drag ----------
const ph = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SCALE === 1 ? 1 : 3, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
const q = await ph.newPage(); q.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR phone ' + e.message); });
await q.goto(B + '/#/assets'); await q.evaluate(() => localStorage.setItem('pm-theme', JSON.stringify('dark'))); await q.reload();
await q.waitForSelector(`.tile[data-id="${FID}"]`);
await q.screenshot({ path: OUT + '/9-phone-assets.png' });
await q.locator(`.tile[data-id="${FID}"] video`).tap(); await q.waitForSelector('.lightbox [data-crop]');
await q.screenshot({ path: OUT + '/10-phone-lightbox.png' });
await q.locator('.lightbox [data-crop]').tap(); await q.waitForSelector('#cr-stage'); await q.waitForTimeout(1200);
await q.screenshot({ path: OUT + '/11-phone-crop.png' });
const cdp = await ph.newCDPSession(q); const qs = await q.locator('#cr-stage').boundingBox(); const q0 = await q.locator('.cr-vid').boundingBox();
const cx = qs.x + qs.width / 2, cy = qs.y + qs.height / 2;
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - i * 10, y: cy }] });
await q.screenshot({ path: OUT + '/12-phone-touch-drag.png' });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const q1 = await q.locator('.cr-vid').boundingBox();
ok(q1.x < q0.x - 40, `a finger drag moves the video on a phone (${Math.round(q0.x)} -> ${Math.round(q1.x)})`);
const scrollY = await q.evaluate(() => window.scrollY); ok(scrollY === 0, 'the page does not scroll while dragging');
const dlb = await q.locator('#cr-dl').boundingBox(); ok(dlb && dlb.y + dlb.height <= 844 && dlb.width > 150, 'Download is on screen and wide on a phone');
const ow = await q.evaluate(() => document.documentElement.scrollWidth); ok(ow <= 390, 'no sideways scroll on a phone');
await q.locator('[data-shape="4x5"]').tap(); await q.waitForTimeout(300);
await q.screenshot({ path: OUT + '/13-phone-feed.png' });
const [qd] = await Promise.all([q.waitForEvent('download', { timeout: 30000 }), q.locator('#cr-dl').tap()]);
ok(/4x5\.mp4$/.test(qd.suggestedFilename()), 'phone download works: ' + qd.suggestedFilename());

ok(!errs.length, 'no page errors');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await b.close();
