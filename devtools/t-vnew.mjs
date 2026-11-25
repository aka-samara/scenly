// Video (new) and Image (new): the whole fast journey in a browser, against the mock gateway and mock BytePlus.
//   node devtools/mockgw.mjs 3190 /tmp/vnd/gw.jsonl
//   node devtools/mock-byteplus.mjs 3291 /tmp/vnd/mbp.jsonl
//   start the app with every video flag, AI voice and avatar switches on, the mock URLs and DATA_DIR=/tmp/vnd/data PORT=3111
// Usage: DATA_DIR=/tmp/vnd/data node devtools/t-vnew.mjs <out folder>   (SCALE=2 for sharp pictures)
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = createRequire('/opt/node-tools/node_modules/')('playwright'); }
const { chromium } = pw;
const B = 'http://localhost:3111'; const DATA = process.env.DATA_DIR || '/tmp/vnd/data';
const OUT = process.argv[2] || '/tmp/vnew-shots'; fs.mkdirSync(OUT, { recursive: true });
const SCALE = Number(process.env.SCALE) || 1;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vnt-')); const sh = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
sh(['-f', 'lavfi', '-i', 'testsrc2=size=600x600', '-frames:v', '1', tmp + '/logo.png']);
sh(['-f', 'lavfi', '-i', 'testsrc2=size=720x960', '-frames:v', '1', tmp + '/face.png']);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR ' + e.message); });
p.on('dialog', (d) => d.accept());
const email = `vnew${Date.now()}@example.com`;
await p.goto(B);
await p.evaluate(async (email) => fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ada', email, password: 'secret123' }) }), email);
await p.goto(JSON.parse(fs.readFileSync(DATA + '/outbox.json', 'utf8')).filter((m) => m.to === email).pop().url.replace(/^https?:\/\/[^/]+/, B));
await p.waitForSelector('#main');
const J = (u, method = 'GET', body) => p.evaluate(async ([u, method, body]) => { const r = await fetch(u, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); return { ...j, _status: r.status }; }, [u, method, body]);
await J('/api/billing/checkout', 'POST', { offerId: 'max20' });
await p.reload(); await p.waitForSelector('#main');
const shot = async (name, full = false) => { await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }); };
const upload = async (file, mime) => (await (await ctx.request.post(B + '/api/files', { multipart: { files: { name: path.basename(file), mimeType: mime, buffer: fs.readFileSync(file) } } })).json()).files[0];

// ---------- the old sections are still there, the new ones beside them ----------
const nav = await p.$$eval('.sidebar a.nav', (as) => as.map((a) => a.textContent.trim()));
ok(['Image', 'Video Studio', 'Video Agent', 'Video Builder', 'Studio Pro', 'Ad Studio'].every((n) => nav.some((x) => x.startsWith(n))), 'old sections still in the menu: ' + nav.join(' | '));
ok(nav.some((x) => x.startsWith('Video (new)')) && nav.some((x) => x.startsWith('Image (new)')), 'Video (new) and Image (new) are in the menu');

// ---------- J1: start, every feature as a chip ----------
await p.goto(B + '/#/vnew'); await p.waitForSelector('#vn-prompt');
const chips = await p.$$eval('#vn-chips .vn-chip', (cs) => cs.map((c) => c.textContent));
ok(chips.length === 11, `11 chips on the start box: ${chips.join(' · ')}`);
await shot('01-start');
// pickers
await p.click('[data-chip="voice"]'); await p.waitForSelector('.vn-drawer');
ok(await p.$('.vn-drawer .vlist, .vn-drawer .vsearch') !== null, 'voice drawer lists AI voices');
await shot('02-voice-drawer');
await p.click('[data-dtab="skill"]'); await p.click('[data-skill="product"]');
await p.click('[data-dtab="effects"]'); await p.click('.vn-drawer .vn-crow:nth-of-type(1) .vn-chip:nth-child(2)');
await p.click('[data-dtab="more"]');
await p.click('[data-size="1x1"]'); await p.click('[data-size="16x9"]');
await shot('03-more-drawer');
await p.click('[data-dtab="all"]'); await shot('04-all-options');
await p.click('#vn-use');
ok((await p.textContent('#vn-chips')).includes('Product Ad') && (await p.textContent('#vn-chips')).includes('9:16, 1:1, 16:9'), 'chips show the choices');
// brand logo through the More tab
const logo = await upload(tmp + '/logo.png', 'image/png');
await p.evaluate((id) => { const s = JSON.parse(localStorage.getItem('pm-vn-set') || localStorage.getItem('vn-set') || '{}'); }, logo.id);

// ---------- create with the agent ----------
await p.fill('#vn-prompt', 'A 30 second ad for my Glow Lab face cream. A young woman talks to the camera in warm morning light.');
await p.click('#vn-create');
await p.waitForURL(/#\/vnew\/v\//, { timeout: 60000 });
await p.waitForSelector('.vn-plan', { timeout: 30000 });
const pid = p.url().split('/v/')[1];
let v = await J('/api/builder/projects/' + pid);
ok(v.project.scenes.length >= 4, `the plan has ${v.project.scenes.length} scenes`);
ok(!!v.project.voice && !!v.project.vnew?.voiceLines, 'the AI voice was made first, one line per scene');
ok(v.project.captions.length > 0, `captions follow the voice lines (${v.project.captions.length})`);
ok(v.project.vnew?.skill === 'product' && v.project.vnew?.sizes?.join() === '9x16,1x1,16x9', 'skill and sizes are kept with the video');
ok(v.project.scenes.filter((s) => s.type === 'ai').every((s) => /Handheld/.test(s.prompt)), 'camera words went into every AI scene');
for (let i = 0; i < 40 && (v.picturing?.length || v.project.scenes.some((s) => s.type === 'ai' && !s.refFileId)); i++) { await p.waitForTimeout(500); v = await J('/api/builder/projects/' + pid); }
ok(v.project.scenes.filter((s) => s.type === 'ai').every((s) => s.refFileId), 'every scene got a preview picture');
await p.reload(); await p.waitForSelector('.vn-plan'); await shot('05-plan');

// change the plan in words
await p.fill('.vn-ask textarea', 'Make scene 1 a close up of the jar with steam');
await p.click('.vn-ask .btn.primary');
await p.waitForFunction((n) => document.querySelectorAll('.vn-tile').length === n + 1, v.project.scenes.length, { timeout: 30000 });
v = await J('/api/builder/projects/' + pid);
ok(/close up of the jar/.test(v.project.scenes[0].prompt) && /revised/.test(v.project.title), 'the plan changed in words (scene 1 rewritten, one scene added)');

// edit one scene before it is made
await p.click('.vn-tile >> nth=1'); await p.waitForSelector('.vn-scene');
await shot('06-scene-before');
await p.click('.vn-sright .vn-dtabs button:has-text("Voice")'); await shot('07-scene-voice');
await p.click('.vn-ptop a:has-text("Agent")'); await p.waitForSelector('.vn-plan');

// ---------- J4: make, preview while scenes are made ----------
await p.click('#vn-make');
await p.waitForSelector('.vn-make', { timeout: 20000 });
await shot('08-making');
for (let i = 0; i < 80; i++) { v = await J('/api/builder/projects/' + pid); if (v.project.scenes.every((s) => s.type !== 'ai' || s.versions?.length)) break; await p.waitForTimeout(500); }
ok(v.project.scenes.every((s) => s.type !== 'ai' || s.versions?.length), 'every scene was made');
await p.waitForSelector('.vn-make.done', { timeout: 20000 });
await shot('09-done');

// look and logo corner, then export and the other sizes
await J('/api/builder/projects/' + pid, 'PUT', { rev: v.project.rev, vnew: { look: 'warm', brand: { name: 'Glow Lab', logoFileId: logo.id, corner: true, cornerAt: 'top-right', endCard: true } } });
v = await J('/api/builder/projects/' + pid);
ok(v.project.vnew.look === 'warm' && v.project.vnew.brand.corner, 'look and corner logo saved');
let ex = await J(`/api/builder/projects/${pid}/export`, 'POST', { resolution: '720p', burnCaptions: true });
ok(ex._status === 200, 'export started');
for (let i = 0; i < 120; i++) { v = await J('/api/builder/projects/' + pid); if (v.project.exports[0].status !== 'working') break; await p.waitForTimeout(1000); }
ok(v.project.exports[0].status === 'done', 'export finished with the look and the corner logo: ' + (v.project.exports[0].error || ''));
const fid = v.project.exports[0].fileId;
let c = await J(`/api/media/${fid}/crop`, 'POST', { preset: 'ig-square', shape: '1x1', mode: 'fit' });
for (let i = 0; i < 60 && c.job; i++) { await p.waitForTimeout(1000); const j = await J('/api/jobs/' + c.job.id); if (j.job.status === 'done') c = await J(`/api/media/${fid}/crop`, 'POST', { preset: 'ig-square', shape: '1x1', mode: 'fit' }); }
ok(!!c.url, 'the 1:1 size was made from the export');
await p.reload(); await p.waitForSelector('.vn-make.done'); await shot('10-done-exported');

// edit one scene after: versions and redo only this scene
await p.click('.vn-tiles .vn-tile >> nth=0'); await p.waitForSelector('.vn-scene'); await shot('11-scene-after');
const before = (await J('/api/me')).user.credits;
await p.click('#vn-redo');
for (let i = 0; i < 60; i++) { v = await J('/api/builder/projects/' + pid); if (v.project.scenes[0].versions.length === 2) break; await p.waitForTimeout(500); }
ok(v.project.scenes[0].versions.length === 2 && v.project.scenes.slice(1).every((s) => s.type !== 'ai' || s.versions.length === 1), 'redo made a second version of that scene only');
ok((await J('/api/me')).user.credits < before, 'only that scene was charged');

// ---------- Quick clip ----------
await p.goto(B + '/#/vnew/quick'); await p.waitForSelector('#vn-qprompt');
await p.fill('#vn-qprompt', 'A golden retriever runs along a beach at sunset');
await shot('12-quick');
await p.click('#vn-qgo');
await p.waitForSelector('.vn-qcard video', { timeout: 60000 });
ok(true, 'quick clip made');
await shot('13-quick-result');

// ---------- Build it myself ----------
await p.goto(B + '/#/vnew/build'); await p.waitForSelector('#vn-bgo');
await p.fill('#vn-btitle', 'Bakery reel'); await p.click('#vn-bgo');
await p.waitForSelector('.vn-build'); await shot('14-build');
ok(await p.$('[data-add="Talking photo"]') !== null && await p.$('[data-add="Text card"]') !== null, 'build offers talking photo and text card');
await p.click('[data-add="Text card"]'); await p.fill('.dlg-body .vn-input', 'Grand opening, Saturday'); await p.click('.dlg-foot .btn.primary');
await p.waitForSelector('.vn-build .vn-mrow');
ok((await p.$$('.vn-build .vn-mrow')).length === 1, 'a text card became a scene');

// ---------- My videos and other tabs ----------
for (const t of ['videos', 'characters', 'voices', 'music', 'skills']) { await p.goto(B + '/#/vnew/' + t); await p.waitForSelector('.vn-wrap'); await shot('15-tab-' + t); }
ok((await p.$$('.vn-vcard')).length > 3, 'skills tab lists the other tools');

// ---------- Image (new) ----------
await p.goto(B + '/#/inew'); await p.waitForSelector('#in-prompt');
await p.fill('#in-prompt', 'A jar of face cream on a marble sink');
await p.click('#in-go');
await p.waitForSelector('.in-card img', { timeout: 30000 });
await shot('16-image-new');
ok((await p.$$('.in-card img')).length >= 2, 'Image (new) made two pictures');

// ---------- phone ----------
const ph = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SCALE, storageState: await ctx.storageState(), isMobile: true, hasTouch: true });
const pp = await ph.newPage(); pp.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR phone ' + e.message); });
for (const [n, u] of [['17-phone-start', '/#/vnew'], ['18-phone-plan', '/#/vnew/v/' + pid], ['19-phone-scene', `/#/vnew/v/${pid}/s/${v.project.scenes[0].id}`], ['20-phone-quick', '/#/vnew/quick'], ['21-phone-image', '/#/inew']]) {
  await pp.goto(B + u); await pp.waitForTimeout(1500);
  const over = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 1, `${n}: no sideways scroll (${over}px)`);
  await pp.screenshot({ path: path.join(OUT, n + '.png') });
}
ok(!errs.length, 'no page errors: ' + errs.join(' | '));
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
