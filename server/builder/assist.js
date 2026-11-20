// Help with building a video: scenes planned from a voice-over, cuts moved to the beat, and the Video Agent's storyboard.
// Each part has its own switch (FEATURE_AUDIO_FIRST, FEATURE_BEAT_SYNC, FEATURE_VIDEO_AGENT) and needs the Video Builder.
// Nothing here generates video: it only writes drafts that the person reviews before paying for scenes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dns from 'node:dns/promises';
import net from 'node:net';
import db, { save, id } from '../db.js';
import { flags } from '../flags.js';
import { getCatalog, findModel, paidUsd } from '../catalog.js';
import { reserve, charge, usdToCredits, centsToCredits, round2, canAfford, needCredits } from '../credits.js';
import { locate, hasBytes, keys, abs, put, sizeOf } from '../storage.js';
import { needFfmpeg, ffmpeg, ffmpegInfo, probe } from '../ffmpeg.js';
import { defineJob, enqueue, publicJob } from '../jobs.js';
import { complete } from '../gateway.js';
import { UserError } from '../generate.js';
import { transcribe } from '../voice.js';
import { parseSilences, speechRuns, chunkRuns, planScenes, beatGrid, parseJsonLoose, fitDurations, wavSlice } from './audioplan.js';
import { userProject, userFile, ensureProbed, view, createProject, defaultModel, MOODS } from './routes.js';
import { RATIOS, MAX_SCENES } from './plan.js';
import { TABS, TEMPLATES, STYLES, LANGUAGES, LENGTHS } from './agent-data.js';

const list = (name, dflt) => String(process.env[name] || dflt).split(',').map((s) => s.trim()).filter(Boolean);
const STT_MODELS = () => list('PLAN_STT_MODELS', 'mimo-v2.6-flash,gemini-3.1-flash-lite');
const WRITER_MODELS = () => list('PLAN_MODEL', 'gemini-3.5-flash,deepseek-v4-flash');
const text = (v, max) => String(v ?? '').replace(/\u0000/g, '').slice(0, max).trim();
const clipLimits = (model) => { const ds = (model?.video?.durations || []).filter((d) => d > 0); return { maxSec: Math.min(15, ds.length ? Math.max(...ds) : 10), minSec: 2 }; };
async function writer() { for (const mid of WRITER_MODELS()) { const m = await findModel(mid); if (m?.type === 'chat') return m; } return (await getCatalog()).find((m) => m.type === 'chat') || null; }
const chatUsd = (model, usage, fallbackOut = 800) => paidUsd(usage, (((usage?.prompt_tokens || 600) * (model.price?.inPerM || 0)) + ((usage?.completion_tokens || fallbackOut) * (model.price?.outPerM || 0))) / 1e6);

// ---------- pictures for words: one short chat request per batch of scenes ----------
async function writeVisuals(scenes, { style, signal }) {
  const model = await writer(); let usd = 0; const out = scenes.map((s) => (s.narration ? `A scene that fits these words: "${s.narration.slice(0, 300)}"` : 'A calm scene that fits the mood of the video.'));
  if (!model) return { prompts: out, usd, written: false };
  let written = false;
  for (let i = 0; i < scenes.length; i += 25) {
    const part = scenes.slice(i, i + 25);
    const ask = `You plan the pictures for a video that is built around a voice-over. For each numbered scene below, write one visual description for an AI video model: what is seen, where, the action and the camera, in one or two sentences, in English. Do not put any written text, captions or logos in the picture. Keep one consistent look across all scenes${style ? ` (${style})` : ''}.\nReply with only JSON: {"scenes":[{"n":1,"visual":"..."}]}\n\n` + part.map((s, k) => `${i + k + 1}. (${s.duration} s) ${s.narration ? `Words spoken: "${s.narration.slice(0, 400)}"` : 'No words here: use a fitting picture that connects the scenes around it.'}`).join('\n');
    try {
      const r = await complete(model, [{ role: 'user', content: ask }], { maxTokens: 4000, signal }); usd += chatUsd(model, r.usage);
      const j = parseJsonLoose(r.text); const rows = Array.isArray(j) ? j : j?.scenes;
      for (const row of rows || []) { const n = Number(row?.n) - 1; const v = text(row?.visual, 900); if (n >= i && n < i + part.length && v.length > 8) { out[n] = v; written = true; } }
    } catch (e) { if (signal?.aborted) throw e; /* this batch keeps its simple descriptions */ }
  }
  return { prompts: out, usd, written, model: model.id };
}

// ---------- job: scenes planned from the voice-over ----------
defineJob('plan', async (job, { signal, progress }) => {
  const p = db.vprojects.find((x) => x.id === job.payload.projectId); const rec = p && db.files.find((f) => f.id === p.voice?.fileId && f.userId === p.userId);
  if (!rec || !hasBytes(rec)) throw Object.assign(new Error('The voice-over is no longer there.'), { retry: false, userMessage: 'The voice-over is no longer in this project. Add it again and plan once more.' });
  const total = rec.duration || 0; const wav = path.join(os.tmpdir(), `plan-${job.id}.wav`);
  try {
    progress(0.05, 'Listening for pauses');
    const err = await ffmpeg(['-i', locate(rec), '-vn', '-ac', '1', '-ar', '16000', '-af', 'silencedetect=noise=-34dB:d=0.3', '-c:a', 'pcm_s16le', wav], { signal, timeoutMs: 5 * 60 * 1000, wantErr: true });
    const runs = speechRuns(parseSilences(err, total), total);
    if (!runs.length) throw Object.assign(new Error('no sound'), { retry: false, userMessage: 'This recording seems to be silent, so no scenes could be planned from it.' });
    const chunks = chunkRuns(runs, 12); const buf = fs.readFileSync(wav); let usd = 0; let done = 0; let heard = 0;
    const lang = String(job.payload.lang || '').toLowerCase().split('-')[0];
    const next = (() => { let i = 0; return () => (i < chunks.length ? chunks[i++] : null); })();
    await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, async () => {
      for (let c = next(); c; c = next()) {
        const slice = wavSlice(buf, Math.max(0, c.start - 0.1), c.end + 0.15);
        try { if (slice) { const r = await transcribe(slice, lang, signal, STT_MODELS()); usd += r.usd || 0; c.text = r.text || ''; if (c.text) heard++; } } catch (e) { if (signal.aborted) throw e; c.text = ''; }
        progress(0.1 + 0.6 * (++done / chunks.length), `Writing down the words (${done} of ${chunks.length})`);
      }
    }));
    const model = await findModel(p.modelId); const lim = clipLimits(model);
    const scenes = planScenes(heard ? chunks : runs, total, { ...lim, target: Math.min(6, lim.maxSec) }).slice(0, MAX_SCENES);
    progress(0.75, 'Describing the pictures');
    const v = await writeVisuals(scenes, { style: text(job.payload.style, 200), signal }); usd += v.usd;
    const plan = { seconds: total, noWords: !heard, described: v.written, scenes: scenes.map((s, i) => ({ start: s.start, duration: s.duration, narration: s.narration, prompt: v.prompts[i] })),
      captions: chunks.filter((c) => c.text).map((c) => ({ start: c.start, end: c.end, text: c.text.slice(0, 200) })) };
    p.audioPlan = { at: new Date().toISOString(), plan }; save(); // kept with the project, so it is still there after the tab was closed
    return { credits: Math.min(job.payload.cap, round2(usdToCredits(usd))), plan };
  } finally { fs.rmSync(wav, { force: true }); }
}, { maxAttempts: 2, timeoutMs: 20 * 60 * 1000, backoffMs: 3000, maxPerUser: 1 });

// ---------- beats of a music file ----------
async function beatsFor(rec) {
  const key = keys.derived(rec.userId || 'library', rec.id, 'beats.json');
  if (sizeOf(key)) return JSON.parse(fs.readFileSync(abs(key), 'utf8'));
  const tmp = path.join(os.tmpdir(), `bt-${rec.id}-${Date.now()}.raw`);
  try {
    await ffmpeg(['-i', locate(rec), '-vn', '-ac', '1', '-ar', '11025', '-t', '600', '-f', 's16le', tmp], { timeoutMs: 120000 });
    const b = fs.readFileSync(tmp); const samples = new Int16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2));
    const out = beatGrid(samples, 11025) || { bpm: 0, beats: [] }; put(key, Buffer.from(JSON.stringify(out))); return out;
  } finally { fs.rmSync(tmp, { force: true }); }
}

// ---------- Video Agent: a storyboard from one prompt ----------
// ---------- what comes with the prompt: pictures, a logo, a video, sound ----------
// The writing model reads pictures. A video is shown to it as a few frames in time order, which works with every model and stays small.
const MAX_LINK_MB = 200;
const privateIp = (ip) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) || /^(::1$|::$|f[cd]|fe80|::ffff:(10\.|127\.|192\.168\.|169\.254\.))/i.test(ip);
// Download a video from a public link into a temporary file. Only https, never an address inside this computer or its network.
export async function fetchVideoLink(link, signal) {
  const bad = (m) => new UserError(m, 400, 'bad_link');
  let url; try { url = new URL(String(link).trim()); } catch { throw bad('That video link is not a web address. Paste a link that starts with https://'); }
  const local = process.env.ALLOW_LOCAL_LINKS === '1'; // for tests only
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== 'https:' && !local) throw bad('The video link must start with https://');
    if (!local) { const host = url.hostname.replace(/^\[|\]$/g, ''); const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address); if (!ips.length || ips.some(privateIp)) throw bad('That video link cannot be reached from here. Use a public link, or upload the video.'); }
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(40000)].filter(Boolean)) }).catch(() => null);
    if (!r) throw bad('The video link did not answer. Check it, or upload the video instead.');
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url); continue; }
    if (!r.ok) throw bad(`The video link answered with an error (${r.status}). Check it, or upload the video instead.`);
    const type = r.headers.get('content-type') || ''; if (/text\/html/i.test(type)) throw bad('That link opens a web page, not a video file. Use a direct link to the video (it usually ends in .mp4), or upload the video.');
    if (Number(r.headers.get('content-length')) > MAX_LINK_MB * 1024 * 1024) throw bad(`The video behind that link is larger than ${MAX_LINK_MB} MB. Upload a shorter cut instead.`);
    const out = path.join(os.tmpdir(), `va-link-${id('t_')}.bin`); const w = fs.createWriteStream(out); let n = 0;
    try { for await (const chunk of r.body) { n += chunk.length; if (n > MAX_LINK_MB * 1024 * 1024) throw bad(`The video behind that link is larger than ${MAX_LINK_MB} MB. Upload a shorter cut instead.`); if (!w.write(chunk)) await new Promise((res) => w.once('drain', res)); } await new Promise((res, rej) => w.end((e) => (e ? rej(e) : res()))); }
    catch (e) { w.destroy(); fs.rmSync(out, { force: true }); throw e instanceof UserError ? e : bad('The video could not be downloaded from that link. Upload it instead.'); }
    return out;
  }
  throw bad('That video link redirects too many times.');
}
const shot = async (src, at, signal) => { // one small picture of a file (a picture itself, or a moment of a video)
  const out = path.join(os.tmpdir(), `va-shot-${id('t_')}.jpg`);
  try { await ffmpeg([...(at != null ? ['-ss', String(at)] : []), '-i', src, '-frames:v', '1', '-update', '1', '-vf', "scale='min(768,iw)':-2", '-q:v', '4', out], { signal, timeoutMs: 30000 }); return `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`; } finally { fs.rmSync(out, { force: true }); }
};
const FRAMES = 6;
async function videoFrames(src, signal) {
  const info = await probe(src).catch(() => null); const dur = Number(info?.duration) || 0; if (!(dur > 0) || !info?.hasVideo) throw new UserError('This does not look like a video that can be read.');
  const n = dur < 3 ? 2 : FRAMES; const out = [];
  for (let k = 0; k < n; k++) { try { out.push(await shot(src, Math.max(0, (dur * (k + 0.5)) / n), signal)); } catch { /* skip a frame that cannot be read */ } }
  if (!out.length) throw new UserError('No picture could be read from this video.');
  return { frames: out, seconds: Math.round(dur) };
}
// Turns what the user added into parts for the writing model, plus the words that tell it what each part is.
async function studyMaterial(user, files, link, notes, signal) {
  const parts = []; const brief = []; const got = {}; const can = ffmpegInfo().ok;
  const pic = async (key, label, rule) => {
    const f = files[key] && userFile(user.id, String(files[key])); if (!f || f.kind !== 'image' || !hasBytes(f)) return;
    try { const url = can ? await shot(locate(f), null, signal) : `data:${f.mime};base64,${fs.readFileSync(locate(f)).toString('base64')}`; parts.push({ type: 'text', text: `${label}:` }, { type: 'image_url', image_url: { url } }); brief.push(`- ${label}: ${rule}`); got[key] = f; }
    catch { notes.push(`${f.name}: this picture could not be read, so it was left out. Save it again as PNG or JPG.`); }
  };
  await pic('image', 'START PICTURE', 'the video begins with exactly this picture. Scene 1 must show the same subject, place, colours and light, and start moving from there. Keep that subject looking the same in later scenes.');
  await pic('end', 'END PICTURE', 'the video ends on this picture. The last scene must arrive at what it shows. It is also shown as a still at the end, so do not describe a separate closing shot after it.');
  await pic('logo', 'LOGO', 'the brand behind this video. Take the brand colours and the mood from it. Do NOT draw the logo or any writing inside the scenes: the real logo is added as a closing card after your last scene.');
  const video = async (src, name) => { const v = await videoFrames(src, signal); parts.push({ type: 'text', text: `REFERENCE VIDEO "${name}" (${v.seconds} seconds), ${v.frames.length} frames in time order:` }, ...v.frames.map((url) => ({ type: 'image_url', image_url: { url } }))); brief.push(`- REFERENCE VIDEO: study its subject, style, colours, camera and pacing, and plan scenes that match it or continue it.`); got.videoSeconds = v.seconds; };
  const vf = files.video && userFile(user.id, String(files.video));
  if (vf && vf.kind === 'video' && hasBytes(vf)) { if (!can) notes.push('The video could not be studied because the video tools (ffmpeg) are not installed.'); else { try { await video(locate(vf), vf.name); got.video = vf; } catch (e) { notes.push(`${vf.name}: ${e.message}`); } } }
  if (link) {
    if (!can) notes.push('The video link could not be studied because the video tools (ffmpeg) are not installed.');
    else { let tmp = null; try { tmp = await fetchVideoLink(link, signal); await video(tmp, 'from the link'); got.link = true; } catch (e) { if (signal?.aborted) throw e; notes.push(e instanceof UserError ? e.message : 'The video behind that link could not be read. Upload it instead.'); } finally { if (tmp) fs.rmSync(tmp, { force: true }); } }
  }
  for (const key of ['voice', 'music']) {
    const f = files[key] && userFile(user.id, String(files[key])); if (!f || f.kind !== 'audio') continue;
    try { await ensureProbed(f); } catch { continue; }
    got[key] = f;
    brief.push(key === 'voice' ? `- VOICE-OVER: the user recorded their own voice-over of ${Math.round(f.duration)} seconds. Plan the video for that length. Still write a narration line for each scene as a guide.` : `- MUSIC: the user's own song of ${Math.round(f.duration)} seconds is the soundtrack. Let the pictures follow the energy of a song.`);
  }
  return { parts, brief, got, pictures: parts.filter((x) => x.type === 'image_url').length };
}

function storyboardAsk({ prompt, tab, seconds, count, lim, style, language, voiceover, brief = [] }) {
  const kind = TABS.find((t) => t.id === tab) || TABS[0];
  return `You are a director planning a short video. Write a storyboard.\n\nThe idea: ${prompt}\nKind of video: ${kind.label}. ${kind.guide}\nTotal length: about ${seconds} seconds, in about ${count} scenes. Each scene lasts between ${lim.minSec} and ${lim.maxSec} seconds.\nLook: ${style || 'choose one fitting look and keep it in every scene'}.\n${voiceover ? `Narration: write what the voice says during each scene, in ${language}, about 2 words per second of the scene.` : 'Narration: none, leave it empty.'}${brief.length ? `\n\nThe user added material, shown ${'below'}. Study it closely and build the storyboard around it:\n${brief.join('\n')}` : ''}\n\nFor each scene write "visual": what is seen, where, the action and the camera, in one or two sentences, in English, with no written text or logos in the picture. Describe people and products the same way every time they appear so they look the same.\n${brief.length ? 'Also give "seen": one plain sentence on what you saw in the material and how the storyboard uses it. ' : ''}Reply with only JSON: {"title":"a short title${language && language !== 'English' ? ' in ' + language : ''}","look":"the look in one sentence",${brief.length ? '"seen":"what you saw in the material, in one sentence",' : ''}"scenes":[{"seconds":5,"visual":"...","narration":"..."}]}`;
}

export function mountAssist(app, { requireUser, wrap }) {
  const need = (name) => (req, res, next) => (flags().videoBuilder && flags()[name] ? next() : res.status(404).json({ error: 'This feature is switched off.', code: 'feature_off' }));
  const own = (req) => { const p = userProject(req.user.id, req.params.id); if (!p) throw new UserError('That video project no longer exists.', 404); return p; };

  // What planning from the voice-over may cost at most. Only what is really used is charged.
  const planCap = (seconds) => round2(centsToCredits(1 + Math.ceil(seconds / 60) * 1.5)); // at most 1 cent plus 1.5 cents a minute
  app.post('/api/builder/projects/:id/plan-audio', requireUser, need('audioFirst'), wrap(async (req, res) => {
    const p = own(req); needFfmpeg();
    const rec = db.files.find((f) => f.id === p.voice?.fileId && f.userId === req.user.id);
    if (!rec || !hasBytes(rec)) throw new UserError('Add a voice-over first. The scenes are planned from what is said in it.');
    if (!(rec.duration > 1)) throw new UserError('This voice-over is too short to plan scenes from.');
    const running = db.jobs.find((j) => j.userId === req.user.id && j.type === 'plan' && j.ref === p.id && ['queued', 'running', 'retrying'].includes(j.status));
    if (running) return res.json({ job: publicJob(running), cap: running.payload.cap, already: true });
    const cap = planCap(rec.duration);
    if (req.body.dryRun) return res.json({ cap, seconds: rec.duration });
    needCredits(req.user, cap);
    const hold = reserve(req.user, cap, 'Video Builder · scenes planned from the voice-over', { builderId: p.id });
    const { job } = enqueue({ type: 'plan', userId: req.user.id, ref: p.id, holdId: hold.id, idempotencyKey: typeof req.body.idem === 'string' ? req.body.idem.slice(0, 80) : undefined, payload: { projectId: p.id, cap, lang: text(req.body.lang, 12), style: text(req.body.style, 200) } });
    res.json({ job: publicJob(job), cap });
  }));

  app.get('/api/builder/projects/:id/beats', requireUser, need('beatSync'), wrap(async (req, res) => {
    const p = own(req); needFfmpeg();
    const rec = db.files.find((f) => f.id === p.music?.fileId && (f.userId === req.user.id || f.library));
    if (!rec || !hasBytes(rec)) throw new UserError('Add music first. The cuts are moved to its beat.');
    const b = await beatsFor(rec);
    if (!b.beats.length) throw new UserError('No steady beat was found in this music, so the cuts were left where they are.', 422, 'no_beat');
    res.json(b);
  }));

  // ---------- Video Agent ----------
  const agentOn = need('videoAgent');
  const storyCredits = async (count) => { const m = await writer(); return m ? round2(usdToCredits(((900 * (m.price?.inPerM || 0)) + (count * 110 + 150) * (m.price?.outPerM || 0)) / 1e6, m)) : 0; };
  app.get('/api/agent/info', requireUser, agentOn, wrap(async (_req, res) => {
    const models = (await getCatalog()).filter((m) => m.type === 'video' && m.video.textToVideo);
    const model = defaultModel(models); const lim = clipLimits(model);
    res.json({ tabs: TABS.map(({ guide, ...t }) => t), templates: TEMPLATES, styles: STYLES, languages: LANGUAGES, lengths: LENGTHS, ratios: Object.keys(RATIOS), moods: flags().musicLibrary ? MOODS.filter((m) => db.tracks.some((t) => t.mood === m)) : [],
      audioFirst: flags().audioFirst, model: model ? { id: model.id, name: model.name } : null, clip: lim, storyboardCredits: await storyCredits(12), canSpeak: false });
  }));
  app.post('/api/agent/storyboard', requireUser, agentOn, wrap(async (req, res) => {
    const prompt = text(req.body.prompt, 2000); if (prompt.length < 3) throw new UserError('Describe the video you want in a sentence or two.');
    let seconds = Math.max(5, Math.min(300, Number(req.body.seconds) || 30));
    const models = (await getCatalog()).filter((m) => m.type === 'video' && m.video.textToVideo);
    const model = models.find((m) => m.id === req.body.modelId) || defaultModel(models, { ratio: RATIOS[req.body.ratio] ? req.body.ratio : '16:9', resolution: req.body.resolution || '720p' });
    if (!model) throw new UserError('No video model is available right now. Please try again later.', 503);
    const lim = clipLimits(model);
    let chat = await writer(); if (!chat) throw new UserError('No writing model is available right now. Please try again later.', 503);
    needCredits(req.user, 0, 'You are out of credits. Top up to write a storyboard.');
    const language = LANGUAGES.includes(req.body.language) ? req.body.language : 'English'; const style = STYLES.find((s) => s.id === req.body.style);
    const ctl = new AbortController(); res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    // What came with the prompt is studied first: pictures and video frames go to the writing model together with the idea.
    const notes = []; const files = req.body.files && typeof req.body.files === 'object' ? req.body.files : {};
    const mat = await studyMaterial(req.user, files, text(req.body.videoUrl, 1000), notes, ctl.signal); if (ctl.signal.aborted) return;
    if (mat.pictures && !chat.vision) { const eye = (await getCatalog()).find((m) => m.type === 'chat' && m.vision && WRITER_MODELS().includes(m.id)) || (await getCatalog()).find((m) => m.type === 'chat' && m.vision); if (eye) chat = eye; else { mat.parts.length = 0; notes.push('The writing model cannot look at pictures right now, so the storyboard was written from your words only.'); } }
    if (mat.got.voice?.duration > 4) seconds = Math.max(5, Math.min(300, Math.round(mat.got.voice.duration)));
    const count = Math.max(1, Math.min(60, Math.round(seconds / Math.min(5, lim.maxSec))));
    const ask = storyboardAsk({ prompt, tab: req.body.tab, seconds, count, lim, style: style?.prompt || '', language, voiceover: !!req.body.voiceover, brief: mat.brief });
    let r;
    try { r = await complete(chat, [{ role: 'user', content: mat.parts.length ? [{ type: 'text', text: ask }, ...mat.parts] : ask }], { maxTokens: 9000, signal: ctl.signal }); }
    catch (e) { if (ctl.signal.aborted) return; throw new UserError('The storyboard could not be written this time. Nothing was charged. Please try again.', 502, 'storyboard_failed'); }
    const j = parseJsonLoose(r.text); const rows = (Array.isArray(j) ? j : j?.scenes || []).filter((s) => text(s?.visual, 900).length > 8).slice(0, 60);
    if (!rows.length) throw new UserError('The storyboard came back unreadable. Nothing was charged. Please try again.', 502, 'storyboard_failed');
    const look = text(j?.look, 240) || style?.prompt || '';
    const durs = fitDurations(rows.map((s) => s.seconds), seconds, lim);
    const track = req.body.music && req.body.music !== 'none' && flags().musicLibrary ? db.tracks.find((t) => t.mood === req.body.music) : null;
    const p = await createProject(req.user, { title: text(j?.title, 120) || prompt.slice(0, 60), ratio: req.body.ratio, resolution: req.body.resolution, modelId: model.id, trackId: track?.id,
      scenes: rows.map((s, i) => ({ prompt: text(s.visual, 900) + (look ? ` Look: ${look}` : ''), duration: durs[i], narration: req.body.voiceover ? text(s.narration, 600) : '', continuity: !!req.body.chain && i > 0 })),
      agent: { prompt, tab: text(req.body.tab, 20), look, language, seconds, chain: !!req.body.chain, seen: text(j?.seen, 400) || undefined, studied: mat.pictures || undefined } });
    // Files that came with the prompt: a picture starts the first scene, sound goes on its track,
    // the end picture and the logo close the video as stills (the video models take one start picture and no end picture).
    if (mat.got.image && p.scenes[0]) { p.scenes[0].refFileId = mat.got.image.id; p.scenes[0].continuity = false; }
    const still = (f, seconds) => { if (p.scenes.length >= MAX_SCENES) return; const last = p.scenes[p.scenes.length - 1]; if (last) last.transition = 'crossfade'; p.scenes.push({ id: id('sc_'), type: 'image', fileId: f.id, duration: seconds, transition: 'cut', fit: 'pad' }); };
    if (mat.got.end) still(mat.got.end, 3);
    if (mat.got.logo) still(mat.got.logo, 2.5);
    for (const key of ['voice', 'music']) {
      const f = mat.got[key]; if (!f) continue;
      if (f.duration > 20 * 60 + 1) { notes.push(`${f.name} is longer than 20 minutes and was left out.`); continue; }
      p[key] = key === 'voice' ? { fileId: f.id, volume: 1, offset: 0 } : { fileId: f.id, volume: 0.5, duck: true, duckDb: 12, fit: true };
    }
    save();
    const credits = charge(req.user, usdToCredits(chatUsd(chat, r.usage, rows.length * 110), chat), `Video Agent · storyboard · ${chat.name}`, { model: chat.id, builderId: p.id });
    res.json({ projectId: p.id, scenes: p.scenes.length, credits, notes, seen: p.agent.seen || '', studied: mat.pictures, balance: round2(req.user.credits), ...(await view(p)) });
  }));
}
export { planScenes };
