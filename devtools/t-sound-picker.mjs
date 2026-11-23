// "From my assets" with a real song: upload once, then reuse it as voice-over, music, via Add files, in the Video Agent,
// from an audio-only export in Assets; export mixes it. Server: mock settings on 3111 with Builder, Agent and Music library on.
import { createRequire } from 'node:module';
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const B = 'http://localhost:3111', OUT = process.env.SHOTS || '/tmp/claude-0/dev/snd', SONG = process.env.SONG || '/tmp/claude-0/dev/song.mp3';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR ' + e.message); });
await p.goto(B); await p.evaluate(() => fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'secret123' }) })); await p.reload(); await p.waitForSelector('#main');
const J = (path, method = 'GET', body) => p.evaluate(async ([path, method, body]) => { const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return r.json().catch(() => ({ status: r.status })); }, [path, method, body]);
const newProject = async (title) => { await p.goto(B + '/#/builder'); await p.waitForSelector('#vb-new'); await p.click('#vb-new'); await p.fill('#vb-new-title', title); await p.click('[data-ratio="16:9"]'); await p.click('#vb-create'); await p.waitForSelector('#vb-list'); return p.evaluate(() => location.hash.split('/')[2]); };
const view = (pid) => J('/api/builder/projects/' + pid);
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await p.waitForTimeout(400); } return null; };
const songSec = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', SONG]).toString());

// 1. First time: Voice "Add" opens the picker, the song is uploaded from the device
const A = await newProject('Song first upload');
await p.click('#vb-vadd'); await p.waitForSelector('#ap-device');
ok(/sound/i.test(await p.textContent('.ap-box .modal-head b')), 'voice Add opens the picker for a sound: ' + await p.textContent('.ap-box .modal-head b'));
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#ap-device')]);
ok(/audio|mp3/.test(await fc.element().getAttribute('accept')), 'device window asks for sound files');
await fc.setFiles(SONG);
const va = await until(async () => { const v = await view(A); return v.project?.voice?.fileId && v; });
ok(!!va, 'uploaded song became the voice-over');
const upId = va.project.voice.fileId; const upFile = va.files[upId];
ok(Math.abs((upFile?.duration || 0) - songSec) < 0.6, `length read: ${upFile?.duration} s (song is ${songSec.toFixed(1)} s)`);

// 2. A new project: the song is offered under Your uploads, with its length, and plays
const P2 = await newProject('Song from my assets');
await p.click('#vb-vadd'); await p.waitForSelector('.ap-tile');
await p.waitForTimeout(500);
const tiles = await p.$$eval('.ap-tile', (t) => t.map((x) => x.textContent));
ok(tiles.some((t) => /174876596179218/.test(t) && /Your uploads/.test(t) && /0:3[56]/.test(t)), 'song listed as Your uploads with its length: ' + tiles[0]);
ok(await p.locator('.ap-tile audio').count() >= 1, 'each sound has a play control');
const audioOk = await p.evaluate(async () => { const a = document.querySelector('.ap-tile audio'); const r = await fetch(a.src); return r.ok && /audio/.test(r.headers.get('content-type')); });
ok(audioOk, 'the play control loads the sound');
ok(await p.locator('.ap-tile .ap-media img').count() === 0, 'only sounds are offered for the voice-over');
await p.fill('#ap-search', '1748765'); await p.waitForTimeout(200);
ok(await p.locator('.ap-tile').count() === 1, 'search by file name finds the song');
await p.fill('#ap-search', ''); await p.waitForTimeout(150);
await p.screenshot({ path: OUT + '/1-voice-from-assets.png' });
await p.locator('.ap-tile', { hasText: '174876596179218' }).first().locator('.ap-cap').click();
const v2 = await until(async () => { const v = await view(P2); return v.project?.voice?.fileId && v; });
ok(v2?.project.voice.fileId === upId, 'voice-over set from Assets, reusing the uploaded file (no second upload)');

// 3. Music: Add -> Upload my own -> picker -> song
await p.click('#vb-madd'); await p.waitForSelector('#vb-mupload'); await p.click('#vb-mupload'); await p.waitForSelector('.ap-tile');
await p.locator('.ap-tile', { hasText: '174876596179218' }).first().locator('.ap-cap').click();
const v3 = await until(async () => { const v = await view(P2); return v.project?.music?.fileId && v; });
ok(v3?.project.music.fileId === upId, 'music set from Assets too');

// 4. Two pictures from Assets as scenes, then export: the song is in the film
await p.click('#vb-add'); await p.waitForSelector('.ap-tile');
const pics = p.locator('.ap-tile').filter({ has: p.locator('.ap-media img') });
await pics.nth(0).click(); await pics.nth(1).click(); await p.click('#ap-use');
const v4 = await until(async () => { const v = await view(P2); return v.project.scenes.length >= 2 && v; });
ok(!!v4, 'two picture scenes added from Assets');
await p.waitForTimeout(800);
await p.screenshot({ path: OUT + '/2-builder-voice-music-set.png' });
const ex = await J(`/api/builder/projects/${P2}/export`, 'POST', { resolution: '720p' });
ok(!ex.error, 'export started ' + (ex.error || ''));
const done = await until(async () => { const v = await view(P2); const e = v.project.exports?.[0]; return e && e.status !== 'working' && e; }, 120000);
ok(done?.status === 'done', 'export finished: ' + (done?.status || 'timeout') + ' ' + (done?.error || ''));
if (done?.fileId) {
  const buf = await p.evaluate(async (id) => { const r = await fetch('/api/media/' + id); const a = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); }, done.fileId);
  fs.writeFileSync(OUT + '/export.mp4', Buffer.from(buf, 'base64'));
  const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', OUT + '/export.mp4']).toString());
  const aud = pr.streams.find((s) => s.codec_type === 'audio');
  ok(!!aud, 'exported video has a sound track (' + aud?.codec_name + ')');
  const planned = done.seconds; ok(Math.abs(Number(pr.format.duration) - planned) < 1, `film is as long as its scenes (${planned} s, the song is cut to fit): ${Number(pr.format.duration).toFixed(1)} s`);
  const vd = execFileSync('ffmpeg', ['-v', 'info', '-i', OUT + '/export.mp4', '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString() || '';
  const log = execFileSync('bash', ['-c', `ffmpeg -i ${OUT}/export.mp4 -map 0:a -af volumedetect -f null - 2>&1 | grep -E 'mean_volume|max_volume'`]).toString();
  const mean = Number((log.match(/mean_volume: (-?[\d.]+)/) || [])[1]);
  ok(mean > -40, 'the sound is really there, not silence: ' + log.replace(/\n/g, ' ').replace(/\[Parsed[^\]]*\]/g, '').trim());
  // 5. Audio-only export lands in Assets as a sound, and can be picked from there (copied on the server)
  const ax = await J(`/api/builder/projects/${P2}/export`, 'POST', { audioOnly: true });
  const ad = await until(async () => { const v = await view(P2); const e = v.project.exports?.find((x) => x.audioOnly); return e && e.status !== 'working' && e; }, 120000);
  ok(ad?.status === 'done', 'audio-only export finished');
}
const P3 = await newProject('Sound made in Scenly');
await p.click('#vb-madd'); await p.waitForSelector('#vb-mupload'); await p.click('#vb-mupload'); await p.waitForSelector('.ap-tile');
const fromBuilder = p.locator('.ap-tile', { hasText: 'Video Builder' });
ok(await fromBuilder.count() >= 1, 'the audio-only export is offered as a sound made in Video Builder');
await p.selectOption('#ap-from', 'builder'); await p.waitForTimeout(150);
ok(await p.locator('.ap-tile').count() === await fromBuilder.count(), '"Made in" filter shows only Video Builder sounds');
await p.screenshot({ path: OUT + '/3-sound-made-in-builder.png' });
await fromBuilder.first().locator('.ap-cap').click();
const v5 = await until(async () => { const v = await view(P3); return v.project?.music?.fileId && v; });
ok(v5 && v5.project.music.fileId !== upId && v5.files[v5.project.music.fileId]?.duration > 7, 'music from an Assets sound: copied as a new file with its length (' + v5?.files[v5?.project.music.fileId]?.duration + ' s)');
ok(/\.m4a$/.test(v5?.files[v5?.project.music.fileId]?.name || ''), 'copied sound is named .m4a: ' + v5?.files[v5?.project.music.fileId]?.name);

// 6. Add files with the song: becomes the voice-over of a project that has none
await p.click('#vb-add'); await p.waitForSelector('.ap-tile');
await p.click('#ap-tabs [data-tab=audio]'); await p.waitForTimeout(150);
ok(await p.locator('.ap-tile .ap-media img').count() === 0, 'Sounds tab shows only sounds');
await p.screenshot({ path: OUT + '/4-add-files-sounds-tab.png' });
await p.locator('.ap-tile', { hasText: '174876596179218' }).first().click(); await p.click('#ap-use');
const v6 = await until(async () => { const v = await view(P3); return v.project?.voice?.fileId && v; });
ok(v6?.project.voice.fileId === upId, 'Add files with the song made it the voice-over');

// 7. Video Agent: voice-over and music from Assets
await p.goto(B + '/#/agent'); await p.waitForSelector('#va-add');
for (const role of ['voice', 'music']) {
  await p.click('#va-add'); await p.click(`[data-role=${role}]`); await p.waitForSelector('.ap-tile');
  if (role === 'voice') await p.screenshot({ path: OUT + '/5-agent-voice.png' });
  await p.locator('.ap-tile', { hasText: '174876596179218' }).first().locator('.ap-cap').click();
  await until(async () => (await p.locator(`[data-file=${role}]`).count()) && !(await p.locator(`[data-file=${role}] .spin`).count()));
  const slot = await p.textContent(`[data-file=${role}]`);
  ok(/174876596179218\.mp3$/.test(slot.trim()) && !/\.mp3\.mp3/.test(slot), `Agent ${role} slot holds the song, name kept: ${slot.trim()}`);
}
await p.screenshot({ path: OUT + '/6-agent-both.png' });
// 8. Places that do not take sounds never offer them
await p.goto(B + '/#/'); await p.waitForTimeout(800); await p.click('.icon-btn[title^="Attach"]'); await p.waitForSelector('.ap-box'); await p.waitForTimeout(500);
ok(await p.locator('.ap-tile audio').count() === 0, 'chat attach offers no sounds');
await p.keyboard.press('Escape');
// 9. Phone
const q = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })).newPage();
await q.goto(B + '/#/agent'); await q.waitForSelector('#va-add'); await q.click('#va-add'); await q.click('[data-role=music]'); await q.waitForSelector('.ap-tile'); await q.waitForTimeout(500);
await q.screenshot({ path: OUT + '/7-phone-music.png' });
ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: no sideways scroll');
ok(!errs.length, 'no page errors');
await b.close();
