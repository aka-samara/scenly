// Screenshots of the Video Builder in both themes and at several sizes, for checking its look.
// Needs a test copy on 3111 with the mock gateway (see the notes in the pull request):
//   MAIL_OUTBOX=1 RATE_LIMITS=0 FEATURE_VIDEO_BUILDER=1 FEATURE_PRECISION_EDIT=1 FEATURE_MUSIC_LIBRARY=1 SCENE_POLL_MS=300 DATA_DIR=/tmp/pmdata PORT=3111
// Usage: node devtools/builder-polish-shots.mjs <out folder> [label]   (SCALE=2 for sharp pictures, ONLY=desk,phone to pick sizes)
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFileSync } from 'node:child_process';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const B = 'http://localhost:3111'; const DATA = process.env.DATA_DIR || '/tmp/pmdata';
const OUT = process.argv[2] || '/tmp/vbshots'; const LABEL = process.argv[3] || 'shot';
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-polish-')); const sh = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
sh(['-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', tmp + '/clip.mp4']);
sh(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=9', tmp + '/voice.mp3']);
sh(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=5', tmp + '/music.mp3']);
sh(['-f', 'lavfi', '-i', 'color=c=0x335577:s=800x1200', '-frames:v', '1', tmp + '/photo.png']);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1458, height: 888 }, deviceScaleFactor: Number(process.env.SCALE) || 1 });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR ' + e.message); });
const email = `polish${Date.now()}@example.com`;
await p.goto(B);
await p.evaluate(async (email) => (await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ada', email, password: 'secret123' }) })).status, email);
await p.goto(JSON.parse(fs.readFileSync(DATA + '/outbox.json', 'utf8')).filter((m) => m.to === email).pop().url.replace(/^https?:\/\/[^/]+/, B));
await p.waitForSelector('#main');
const J = (path, method = 'GET', body) => p.evaluate(async ([path, method, body]) => (await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })).json(), [path, method, body]);
await J('/api/billing/checkout', 'POST', { offerId: 'max20' });
const up = async (name, mimeType, q = '') => (await (await ctx.request.post(B + '/api/files' + q, { multipart: { files: { name, mimeType, buffer: fs.readFileSync(tmp + '/' + name) } } })).json()).files[0].id;
const proj = (pid) => J('/api/builder/projects/' + pid);
const idle = async (pid) => { for (let i = 0; i < 300; i++) { const x = await proj(pid); if (!x.jobs.length && !x.project.scenes.some((s) => s.status === 'generating')) return x; await p.waitForTimeout(300); } throw new Error('jobs did not finish'); };

// project A: four AI scenes with clips, like the person's screenshot
let v = await J('/api/builder/projects', 'POST', { title: 'Chocolate Under Pressure', ratio: '9:16', resolution: '720p' }); const A = v.project.id;
const PROMPTS = ['The same athletic Black woman sprints on a treadmill in a dark studio, hard side light', 'performance tank, and emerald shorts, close on her feet hitting the belt', 'The same athletic Black woman lifts a kettlebell, slow push in, sweat on her shoulders', 'The same DUBAI CHOCOLATE bar splits open in a beam of light, pistachio cream pours out'];
const NARR = ['Pressure reveals what you are made of.', '', 'Then reward the work.', 'DUBAI CHOCOLATE. Made under pressure.'];
for (let i = 0; i < 4; i++) v = await J(`/api/builder/projects/${A}/scenes`, 'POST', { prompt: PROMPTS[i], duration: 5, at: i });
v = await proj(A);
v = await J(`/api/builder/projects/${A}`, 'PUT', { rev: v.project.rev, scenes: v.project.scenes.map((s, i) => ({ ...s, narration: NARR[i], continuity: i === 1 })) });
const g = await J(`/api/builder/projects/${A}/generate`, 'POST', { idem: 'x' + Date.now() }); console.log('generate', g.started ?? g.error);
await idle(A);

// project B: every kind of thing at once (AI draft, failed-free draft, video, picture, voice, music, captions, a locked scene)
v = await J('/api/builder/projects', 'POST', { title: 'Everything at once', ratio: '16:9', resolution: '720p' }); const P2 = v.project.id;
v = await J(`/api/builder/projects/${P2}/add`, 'POST', { fileIds: [await up('clip.mp4', 'video/mp4'), await up('photo.png', 'image/png'), await up('voice.mp3', 'audio/mpeg', '?audio=1')] });
v = await J(`/api/builder/projects/${P2}/add`, 'POST', { fileIds: [await up('music.mp3', 'audio/mpeg', '?audio=1')], audioAs: 'music' });
v = await J(`/api/builder/projects/${P2}/scenes`, 'POST', { prompt: 'A long description of a scene that still has to be generated, with a slow camera move across a harbour at dawn', duration: 5, at: 0 });
v = await J(`/api/builder/projects/${P2}/scenes`, 'POST', { prompt: '', duration: 8, at: 3 });
v = await proj(P2);
v = await J(`/api/builder/projects/${P2}`, 'PUT', { rev: v.project.rev, scenes: v.project.scenes.map((s, i) => ({ ...s, locked: i === 1, transition: i === 1 ? 'crossfade' : s.transition })), captions: [{ start: 0.5, end: 3, text: 'Good morning from the harbour' }, { start: 6, end: 9, text: 'The boats are leaving' }, { start: 11, end: 14, text: 'Title card', pos: 'middle' }] });
console.log('project B scenes', v.project?.scenes?.length, v.error || '');

const theme = async (t) => { await p.evaluate((t) => { localStorage.setItem('pm-theme', JSON.stringify(t)); }, t); };
const open = async (pid) => { await p.goto(B + '/#/builder'); await p.goto(B + '/#/builder/' + pid); await p.reload(); await p.waitForSelector('.vb-row'); await p.waitForTimeout(900); };
const shot = async (n) => { await p.screenshot({ path: `${OUT}/${LABEL}-${n}.png` }); console.log('shot', n); };
const SIZES = { desk: [1458, 888], wide: [1920, 1080], laptop: [1280, 720], tablet: [1024, 768], phone: [390, 844] };

for (const t of ['dark', 'light']) {
  await theme(t);
  for (const [name, [w, hh]] of Object.entries(SIZES).filter(([n]) => !process.env.ONLY || process.env.ONLY.split(',').includes(n))) {
    await p.setViewportSize({ width: w, height: hh });
    await open(A);
    if (name !== 'phone') { await p.locator('.vb-row').nth(1).click(); await p.waitForTimeout(500); }
    await shot(`${t}-${name}-A`);
    if (name === 'desk' || name === 'phone') {
      if (name === 'phone') { await p.locator('.vb-row').nth(1).click(); await p.waitForTimeout(500); await shot(`${t}-${name}-A-panel`); }
      await open(P2); if (name === 'desk') { await p.locator('.vb-row').nth(0).click(); await p.waitForTimeout(500); }
      await shot(`${t}-${name}-B`);
    }
    if (name === 'desk') {
      // a selected part, so the action bar shows all its buttons
      const r = await p.locator('#vb-ruler').boundingBox();
      await p.mouse.click(r.x + 250, r.y + 12); await p.keyboard.press('i'); await p.mouse.click(r.x + 330, r.y + 12); await p.keyboard.press('o'); await p.waitForTimeout(400);
      await shot(`${t}-${name}-B-range`);
      await p.keyboard.press('Escape');
      await p.locator('.vb-row').nth(2).click(); await p.waitForTimeout(400); await shot(`${t}-${name}-B-videoscene`);
      // expanded panels
      await open(A); await p.locator('.vb-row').nth(1).click(); await p.waitForTimeout(400);
      for (const id of ['vb-panel', 'vb-list', 'vb-tl']) { await p.click(`.pn-btn[data-panel="${id}"]`); await p.waitForTimeout(400); await shot(`${t}-${name}-A-max-${id}`); await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
    }
  }
}
// overlap report on the desktop size: text boxes that are cut off, in both projects
await theme('light'); await p.setViewportSize({ width: 1458, height: 888 });
for (const pid of [A, P2]) {
  await open(pid); await p.locator('.vb-row').nth(1).click(); await p.waitForTimeout(400);
  const rep = await p.evaluate(() => {
    const out = []; const vis = (r) => r.width > 0 && r.height > 0;
    // 1. floating expand buttons over a control
    for (const btn of document.querySelectorAll('.pn-btn:not([hidden])')) {
      const br = btn.getBoundingClientRect();
      for (const el of document.querySelectorAll('.vb button, .vb select, .vb input, .vb textarea, .vb .tick')) {
        const r = el.getBoundingClientRect(); if (!vis(r)) continue;
        if (r.left < br.right && r.right > br.left && r.top < br.bottom && r.bottom > br.top) out.push(`expand button "${btn.dataset.panel}" covers ${el.id || el.className}`);
      }
    }
    // 2. panel content cut by its own top edge when not scrolled
    const pn = document.querySelector('#vb-panel'); const first = pn?.children[0]?.getBoundingClientRect(); const pr = pn?.getBoundingClientRect();
    if (first && first.top < pr.top - 1) out.push('scene panel: first row starts above the panel');
    // 3. wrapping where one line is meant
    for (const el of document.querySelectorAll('.vb-row .l1 > *, .vb-th b, .vb-head > b, .vb .btn')) { const r = el.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(el).lineHeight) || 16; if (vis(r) && r.height > Math.max(lh * 1.8, 40)) out.push(`wraps: ${el.id || el.className} "${el.textContent.slice(0, 30)}"`); }
    // 4. things sticking out of the screen sideways
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways');
    return out;
  });
  console.log('report', pid === A ? 'A' : 'B', rep.length ? rep : 'clean');
}
console.log('page errors:', errs.length ? errs : 'none', '| projects', A, P2);
fs.writeFileSync(OUT + '/ids.json', JSON.stringify({ A, P2, email }));
await b.close();
