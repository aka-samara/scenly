// Talking videos (OmniHuman 2.0) and AI Voice (Seed TTS 3.0): API checks, credits, failures, and screen shots.
// Needs the mock BytePlus and a test copy:
//   node devtools/mock-byteplus.mjs 3291 /tmp/pmd/mbp.jsonl
//   MAIL_OUTBOX=1 RATE_LIMITS=0 FEATURE_VIDEO_BUILDER=1 FEATURE_AVATAR_VIDEO=1 FEATURE_AI_VOICE=1 \
//   BYTEPLUS_VISION_API_KEY=test-vision-key BYTEPLUS_SPEECH_API_KEY=test-speech-key \
//   BYTEPLUS_VISION_BASE_URL=http://localhost:3291 BYTEPLUS_SPEECH_BASE_URL=http://localhost:3291 \
//   PUBLIC_URL=https://scenly.test DATA_DIR=/tmp/pmd PORT=3111 node server/index.js
// Usage: DATA_DIR=/tmp/pmd node devtools/t-avatar.mjs <out folder>   (SCALE=2 for sharp pictures)
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = createRequire('/opt/node-tools/node_modules/')('playwright'); }
const { chromium } = pw;
const B = 'http://localhost:3111'; const DATA = process.env.DATA_DIR || '/tmp/pmd';
const OUT = process.argv[2] || '/tmp/avatar-shots'; fs.mkdirSync(OUT, { recursive: true });
const SCALE = Number(process.env.SCALE) || 1;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) { fails++; process.exitCode = 1; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avt-')); const sh = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
sh(['-f', 'lavfi', '-i', 'testsrc2=size=720x960', '-frames:v', '1', tmp + '/face.png']);
sh(['-f', 'lavfi', '-i', 'sine=frequency=300:duration=6', '-c:a', 'pcm_s16le', tmp + '/voice.wav']);
sh(['-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-c:a', 'libmp3lame', tmp + '/short.mp3']);
sh(['-f', 'lavfi', '-i', 'sine=frequency=300:duration=7', '-c:a', 'aac', tmp + '/voice.m4a']);
const MLOG = DATA + '/mbp.jsonl';
const mockLog = () => (fs.existsSync(MLOG) ? fs.readFileSync(MLOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR ' + e.message); });
const email = `avatar${Date.now()}@example.com`;
await p.goto(B);
await p.evaluate(async (email) => fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ada', email, password: 'secret123' }) }), email);
await p.goto(JSON.parse(fs.readFileSync(DATA + '/outbox.json', 'utf8')).filter((m) => m.to === email).pop().url.replace(/^https?:\/\/[^/]+/, B));
await p.waitForSelector('#main');
const J = (u, method = 'GET', body) => p.evaluate(async ([u, method, body]) => { const r = await fetch(u, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); return { status: r.status, ...j }; }, [u, method, body]);
await J('/api/billing/checkout', 'POST', { offerId: 'max20' });
const upload = async (file, mime, q = '') => (await (await ctx.request.post(B + '/api/files' + q, { multipart: { files: { name: path.basename(file), mimeType: mime, buffer: fs.readFileSync(file) } } })).json()).files[0];
const balance = async () => (await J('/api/me')).user.credits;
const ledger = async () => (await J('/api/billing')).ledger;
const waitGen = async (gid) => { for (let i = 0; i < 60; i++) { const g = (await J('/api/generations/' + gid)).generation; if (g.status !== 'pending') return g; await p.waitForTimeout(500); } return null; };

// ---------- catalog and voices ----------
const models = (await J('/api/models')).models || [];
const omni = models.find((m) => m.id === 'omnihuman-2.0');
ok(!!omni, 'OmniHuman 2.0 is in the normal model list');
ok(omni && omni.provider === 'ByteDance' && !/byteplus/i.test(JSON.stringify(omni)), 'it shows as a ByteDance model, with no separate supplier name');
ok(Math.abs((omni?.price.creditsPerSecond['720p'] || 0) - 73.5) < 0.01, `priced from the official $0.07/s plus 5%: ${omni?.price.creditsPerSecond['720p']} credits/s`);
ok(omni?.video.avatar && omni.video.tasks.join() === 'create' && !omni.video.textToVideo, 'it is a photo-plus-voice model');
const vv = await J('/api/voice/voices');
ok(vv.on && vv.voices.length >= 30, `AI voices listed: ${vv.voices.length}`);
ok(!vv.voices.some((v) => /pitt|hiddleston|lana|zendaya|peppa|gollum|joker/i.test(v.id + v.name)), 'no voices named after famous people or characters');
ok(Math.abs(vv.creditsPerChar - 0.021) < 1e-9, `voice price: ${vv.creditsPerChar} credits a character ($20 per million + 5%)`);
const sample = await ctx.request.get(B + '/api/voice/sample/' + vv.voices[3].id);
ok(sample.status() === 200 && /audio\/mpeg/.test(sample.headers()['content-type']), 'a voice sample plays');

// ---------- AI voice on its own ----------
let bal0 = await balance();
const script = 'Hi there! [happy] I am so glad you found us. This is a short voice-over made with AI.';
let r = await J('/api/voice/speak', 'POST', { text: script, voiceId: vv.voices[1].id, speed: 1.15 });
ok(r.file?.id && r.file.kind === 'audio' && r.file.duration > 3, `voice-over made: ${r.file?.name}, ${r.file?.duration}s`);
ok(Math.abs(r.credits - script.length * 0.021) < 0.001, `charged ${r.credits} credits for ${script.length} characters`);
ok(Math.abs((bal0 - (await balance())) - r.credits) < 0.01, 'the balance went down by that amount');
const tts = mockLog().filter((x) => x.kind === 'tts').pop();
ok(tts.key === 'test-speech-key' && tts.body.model_id === 'dola-seed-tts-3.0' && tts.body.voice_settings?.speed === 1.15 && tts.voice === vv.voices[1].id, 'the speech request uses the key, model, voice and speed');
const VOICEFILE = r.file;
const raw = await ctx.request.get(B + r.file.url); ok(raw.status() === 200 && (await raw.body()).length > 1000, 'the voice-over can be played and downloaded');
const ups = (await J('/api/uploads')).items; ok(ups.some((x) => x.id === VOICEFILE.id && x.aiVoice?.voiceName), 'it is in my files (the asset picker) with its voice name');
bal0 = await balance();
r = await J('/api/voice/speak', 'POST', { text: 'This one FAILVOICE fails.', voiceId: vv.voices[0].id });
ok(r.status >= 400 && /No credits were charged/.test(r.error || ''), 'a failed voice-over says so calmly: ' + r.error);
ok(Math.abs((await balance()) - bal0) < 1e-6, 'and charges nothing');
r = await J('/api/voice/speak', 'POST', { text: 'x'.repeat(10001) });
ok(r.status === 400 && /too long/.test(r.error), 'a script over 10,000 characters is refused before anything is made');

// ---------- talking video from a script ----------
const face = await upload(tmp + '/face.png', 'image/png');
bal0 = await balance();
const words = 'Hello, I am Ada. Welcome to my channel, today I will show you three tricks for better video ads.';
r = await J('/api/generate', 'POST', { idem: 'a1' + Date.now(), mode: 'video', model: 'omnihuman-2.0', prompt: words, fileIds: [face.id], enhance: true, params: { voiceId: vv.voices[2].id, speed: 1 } });
ok(r.generation?.status === 'pending', 'a talking video starts from a photo and a script');
const secs = r.generation?.params?.duration;
const sub = mockLog().filter((x) => x.kind === 'vision' && x.path.endsWith('submit_task_v2')).pop();
ok(sub?.auth === 'Bearer test-vision-key' && sub.body.req_key === 'realman_avatar_picture_omni20_cv' && sub.body.enable_watermark === false, 'the video request uses the key, the OmniHuman 2.0 service and no watermark');
ok(/^https:\/\/scenly\.test\/pp\/.+\.png$/.test(sub?.body.image_urls?.[0] || ''), 'the photo goes as a public link: ' + sub?.body.image_urls?.[0]);
ok(/^https:\/\/scenly\.test\/pa\/.+\.mp3$/.test(sub?.body.audio_url || ''), 'the voice goes as a public link: ' + sub?.body.audio_url);
ok(!sub?.body.prompt, 'the script is spoken, not sent as a movement note');
const lastTts = mockLog().filter((x) => x.kind === 'tts').pop(); ok(lastTts.body.text === words, 'the script was read word for word (auto-enhance never rewrites it)');
const pa = new URL(sub.body.audio_url); const paRes = await ctx.request.get(B + pa.pathname);
ok(paRes.status() === 200 && /audio/.test(paRes.headers()['content-type']), 'the voice link serves the sound file');
ok((await ctx.request.get(B + pa.pathname.replace(/\/[^/]+\.mp3$/, '/wrongsig.mp3'))).status() === 404, 'a wrong link signature is refused');
let g = await waitGen(r.generation.id);
ok(g?.status === 'done' && g.media?.[0]?.type === 'video', 'the talking video arrives');
const spent = bal0 - (await balance());
const want = words.length * 0.021 + secs * 73.5;
ok(Math.abs(spent - want) < 0.05, `charged ${spent.toFixed(2)} = voice ${(words.length * 0.021).toFixed(2)} + ${secs}s × 73.5`);
let L = await ledger(); ok(L.some((l) => /AI voice/.test(l.desc)) && L.some((l) => /Video \(reserved\) · OmniHuman 2\.0/.test(l.desc)), 'the bill shows the voice-over and the video');

// ---------- talking video from my own voice (wav, then m4a converted) ----------
const wav = await upload(tmp + '/voice.wav', 'audio/wav', '?audio=1');
bal0 = await balance();
r = await J('/api/generate', 'POST', { idem: 'a2' + Date.now(), mode: 'video', model: 'omnihuman-2.0', prompt: 'smiles and talks to the camera', fileIds: [face.id, wav.id], params: {} });
ok(r.generation?.status === 'pending' && r.generation.params.duration === 6, 'my own 6 second voice makes a 6 second video');
const sub2 = mockLog().filter((x) => x.kind === 'vision' && x.path.endsWith('submit_task_v2')).pop();
ok(sub2.body.prompt === 'smiles and talks to the camera' && /\.wav$/.test(sub2.body.audio_url), 'with my own voice the words are a movement note, and the wav is sent as it is');
g = await waitGen(r.generation.id); ok(g?.status === 'done', 'it arrives');
ok(Math.abs((bal0 - (await balance())) - 6 * 73.5) < 0.05, 'charged 6 × 73.5 = 441 credits');
const m4a = await upload(tmp + '/voice.m4a', 'audio/mp4', '?audio=1');
r = await J('/api/generate', 'POST', { idem: 'a3' + Date.now(), mode: 'video', model: 'omnihuman-2.0', prompt: '', fileIds: [face.id, m4a.id], params: {} });
ok(r.generation?.status === 'pending', 'an m4a voice works with no words typed at all');
ok(/\.mp3$/.test(mockLog().filter((x) => x.kind === 'vision' && x.path.endsWith('submit_task_v2')).pop().body.audio_url), 'the m4a is turned into an mp3 first');
await waitGen(r.generation.id);

// ---------- failures and refusals ----------
bal0 = await balance();
r = await J('/api/generate', 'POST', { idem: 'a4' + Date.now(), mode: 'video', model: 'omnihuman-2.0', prompt: 'FAILVIDEO', fileIds: [face.id, wav.id], params: {} });
g = await waitGen(r.generation.id);
ok(g?.status === 'error' && /refunded/.test(g.error || ''), 'a blocked video is refunded: ' + g?.error);
ok(Math.abs((await balance()) - bal0) < 0.01, 'and the balance is back where it was');
const short = await upload(tmp + '/short.mp3', 'audio/mpeg', '?audio=1');
r = await J('/api/generate', 'POST', { idem: 'a5' + Date.now(), mode: 'video', model: 'omnihuman-2.0', prompt: '', fileIds: [face.id, short.id], params: {} });
ok(r.status === 400 && /at least 4 seconds/.test(r.error), 'a 2 second voice is refused: ' + r.error);
r = await J('/api/generate', 'POST', { idem: 'a6' + Date.now(), mode: 'video', model: 'omnihuman-2.0', prompt: 'Hello there, nice to meet you.', fileIds: [], params: {} });
ok(r.status === 400 && /photo/.test(r.error), 'no photo is refused: ' + r.error);
r = await J('/api/generate', 'POST', { idem: 'a7' + Date.now(), mode: 'video', model: 'omnihuman-2.0', prompt: 'Hi.', fileIds: [face.id], params: {} });
g = r.generation && await waitGen(r.generation.id);
ok(g?.status === 'done' && g.params.duration >= 4, `a very short script is padded to the 4 second minimum (${g?.params?.duration}s)`);

// ---------- Video Builder voice-over from AI voice ----------
let v = await J('/api/builder/projects', 'POST', { title: 'Voice test', ratio: '9:16', resolution: '720p' });
v = await J(`/api/builder/projects/${v.project.id}/add`, 'POST', { fileIds: [VOICEFILE.id], audioAs: 'voice' });
ok(v.project?.voice?.fileId === VOICEFILE.id, 'an AI voice-over becomes the Builder voice track');
const BP = v.project.id;

// ---------- screens ----------
const shot = async (name, el) => { await p.waitForTimeout(350); await (el ? p.locator(el).screenshot({ path: `${OUT}/${name}.png` }) : p.screenshot({ path: `${OUT}/${name}.png` })); };
await p.reload(); await p.goto(B + '/#/video'); await p.waitForSelector('#model-chip');
await p.click('#model-chip'); await p.waitForSelector('[data-model="omnihuman-2.0"]');
ok(await p.locator('[data-model="omnihuman-2.0"] .mtag').count() === 1, 'the model menu shows OmniHuman with its tag');
await shot('1-model-menu');
await p.click('[data-model="omnihuman-2.0"] .mopt');
await p.waitForSelector('#voice-chip');
ok(await p.locator('#enh-split').count() === 0, 'the prompt enhancer is hidden for talking videos');
ok(/Type what the person says/.test(await p.getAttribute('#prompt', 'placeholder')), 'the box asks for what the person says');
ok(await p.locator('#go').isDisabled(), 'Generate waits for a photo');
await p.fill('#prompt', words);
await p.click('#mat-add'); await p.waitForSelector('#mat-assets');
await shot('2-add-menu');
await p.keyboard.press('Escape'); await p.mouse.click(5, 5);
await p.evaluate(() => document.querySelector('.popover')?.remove());
const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#mat-add').then(() => p.click('text=Upload a photo of the person'))]);
await fc.setFiles(tmp + '/face.png');
await p.waitForFunction(() => !document.querySelector('.mat.loading') && document.querySelector('.mat img'));
ok(!(await p.locator('#go').isDisabled()), 'Generate is ready with a photo and a script');
const cost = Number((await p.textContent('#cost')).replace(/,/g, ''));
ok(Math.abs(cost - (Math.max(4, Math.ceil(words.length / 15)) * 73.5 + words.length * 0.021)) < 2, `the price shown matches the estimate: ${cost}`);
await shot('3-studio-ready');
await p.click('#voice-chip'); await p.waitForSelector('.vrow');
await shot('4-voice-menu');
await p.click('.vrow:nth-of-type(3) .vpick');
await p.click('#set-chip'); await p.waitForSelector('.settings'); await shot('5-settings'); await p.mouse.click(700, 200);
await p.click('#go');
await p.waitForSelector('.gen video', { timeout: 30000 });
await shot('6-result');
// own voice from the asset picker
await p.click('#mat-add'); await p.click('#mat-assets'); await p.waitForSelector('.modal-bg');
await shot('7-asset-picker-voice');
await p.locator('.modal-bg >> text=voice.wav').first().click();
await p.locator('.modal-bg button:has-text("Add")').last().click().catch(() => {});
await p.waitForSelector('.mat.voice:not(.loading)', { timeout: 10000 }).catch(() => {});
ok(/Voice · 6s/.test(await p.locator('.mat.voice .lbl').textContent().catch(() => '')), 'a voice picked from my assets shows with its length');
ok(await p.locator('#voice-chip').count() === 0, 'with my own voice the AI voice chip steps aside');
ok(/how they move/.test(await p.getAttribute('#prompt', 'placeholder')), 'and the box asks for movement instead');
await shot('7b-own-voice');
await p.evaluate(() => document.querySelectorAll('.modal-bg').forEach((d) => d.remove()));
// tablet
const tb = await b.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: SCALE, storageState: await ctx.storageState() });
const tp = await tb.newPage(); tp.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR(tablet) ' + e.message); });
await tp.goto(B + '/#/video'); await tp.waitForSelector('#model-chip'); await tp.waitForTimeout(600);
await tp.screenshot({ path: `${OUT}/7c-tablet-studio.png` });
ok(!(await tp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'no sideways scroll on a tablet');
await tb.close();

// AI Voice page
await p.goto(B + '/#/voice'); await p.waitForSelector('#av-script');
ok(await p.locator('.av-item').count() >= 1, 'the AI Voice page lists my voice-overs');
await p.fill('#av-script', 'Welcome to Scenly. [excited] Let us make something great today!');
await shot('8-voice-page');
await p.click('#av-go'); await p.waitForFunction(() => document.querySelectorAll('.av-item').length >= 2 || document.body.innerText.includes('ready'), null, { timeout: 20000 });
ok(await p.locator('.av-item').count() >= 2, 'a new voice-over appears at the top of the list');
await p.click('.av-item >> text=Make a photo talk');
await p.waitForSelector('.mat.voice');
ok(/#\/video/.test(p.url()), '"Make a photo talk" opens Video Studio with the voice ready');
await shot('9-make-it-talk');

// Builder voice track
await p.goto(B + '/#/builder/' + BP); await p.waitForSelector('#vb-vmenu, #vb-vadd');
if (await p.locator('#vb-vmenu').count()) { await p.click('#vb-vmenu'); await p.waitForSelector('text=Make a new one with AI voice'); await shot('10-builder-voice-menu'); await p.click('text=Make a new one with AI voice'); }
await p.waitForSelector('#av-script'); await p.fill('#av-script', 'Here is our new product. It is light, strong and made to last.');
await shot('11-builder-dialog');
await p.click('#av-go'); await p.waitForSelector('#av-script', { state: 'detached', timeout: 20000 });
const pj = (await J('/api/builder/projects/' + BP)).project;
ok(pj.voice?.fileId && pj.voice.fileId !== VOICEFILE.id, 'the Builder dialog replaced the voice-over with the new one');

// phone
const ph = await b.newContext({ ...pw.devices['iPhone 13'], storageState: await ctx.storageState() });
const pp = await ph.newPage(); pp.on('pageerror', (e) => { errs.push(e.message); console.log('PAGEERR(phone) ' + e.message); });
await pp.goto(B + '/#/video'); await pp.waitForSelector('#model-chip'); await pp.waitForTimeout(600);
await pp.screenshot({ path: `${OUT}/12-phone-studio.png` });
const over = await pp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); ok(!over, 'no sideways scroll on a phone (studio)');
await pp.click('#voice-chip').catch(() => {}); await pp.waitForTimeout(400); await pp.screenshot({ path: `${OUT}/13-phone-voice-menu.png` });
await pp.goto(B + '/#/voice'); await pp.waitForSelector('#av-script'); await pp.waitForTimeout(500);
await pp.screenshot({ path: `${OUT}/14-phone-voice-page.png`, fullPage: true });
ok(!(await pp.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'no sideways scroll on a phone (AI Voice)');

// flags off: nothing shows
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
