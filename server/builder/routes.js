// Video Builder: projects, uploads into scenes and sound tracks, AI scenes, export, music library.
// Everything here answers 404 while FEATURE_VIDEO_BUILDER is off.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import multer from 'multer';
import db, { save, id, now, DATA_DIR } from '../db.js';
import { flags } from '../flags.js';
import { getCatalog, findModel } from '../catalog.js';
import { reserve, usdToCredits, round2, canAfford, needCredits } from '../credits.js';
import { forget, keys, abs, put, putFile, locate, hasBytes, sizeOf, contentDisposition, looksLike, limits, MB, safeExt } from '../storage.js';
import { ffmpegInfo, needFfmpeg, probe, ffmpeg, FFMPEG_HELP, BURN_HELP, soundOnly } from '../ffmpeg.js';
import { defineJob, enqueue, getJob, publicJob, cancelJob } from '../jobs.js';
import { callJson } from '../gateway.js';
import { UserError, publicFileUrl, pictureLink } from '../generate.js';
import { storeImage } from '../files.js';
import { deriveLater } from '../downloads.js';
import { layout, estimate, allowedDuration, sceneCredits, editCredits, toSrt, cleanCaptions, CAPTION_POS, MAX_REVERSE_SEC, RATIOS, TRANSITIONS, CAPTION_STYLES, MAX_SCENES, MAX_PROJECT_SEC, IMAGE_SEC, SAMPLE_RATE } from './plan.js';
import { renderProject, cleanWork } from './render.js';

const RESOLUTIONS = ['480p', '720p', '1080p'];
const MOODS = ['Upbeat', 'Corporate', 'Cinematic', 'Chill', 'Emotional', 'Epic', 'Kids', 'Holiday'];
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const text = (v, max) => String(v ?? '').replace(/\u0000/g, '').slice(0, max);
const userProject = (userId, pid) => db.vprojects.find((p) => p.id === pid && p.userId === userId) || null;
const userFile = (userId, fid) => db.files.find((f) => f.id === fid && f.userId === userId) || null;
const trackFile = (track) => (track ? db.files.find((f) => f.id === track.fileId) || null : null);

// ---------- which files a project uses ----------
function fileMap(project) {
  const m = new Map(); const add = (fid) => { const f = fid && db.files.find((x) => x.id === fid && (x.userId === project.userId || x.library)); if (f) m.set(f.id, f); };
  for (const s of project.scenes) { add(s.fileId); add(s.refFileId); for (const v of s.versions || []) add(v.fileId); }
  add(project.voice?.fileId);
  if (project.music?.trackId) { const f = trackFile(db.tracks.find((t) => t.id === project.music.trackId)); if (f) { m.set(f.id, f); project.music.fileId = f.id; } } else add(project.music?.fileId);
  return m;
}
const fileView = (f) => {
  const gen = f.kind === 'generated'; const base = gen ? `/api/media/${f.id}` : `/api/files/${f.id}`;
  const kind = f.library ? 'audio' : gen ? 'video' : f.kind;
  return { id: f.id, kind, name: f.name || f.title || '', size: f.size, duration: f.duration || 0, w: f.w || 0, h: f.h || 0, hasAudio: f.hasAudio !== false,
    url: f.library ? `/api/builder/music/${f.trackId}/audio` : gen ? base : `${base}/raw`, play: kind === 'video' ? `${base}/proxy` : undefined, poster: f.posterKey ? `${base}/poster` : undefined };
};

function sceneView(s) { const { ...rest } = s; return rest; }
const projectView = (p) => { const { bin, ...rest } = p; return { ...rest, scenes: p.scenes.map(sceneView) }; };
async function view(project) {
  const files = fileMap(project); const lay = layout(project, files); const models = (await getCatalog()).filter((m) => m.type === 'video');
  const est = estimate(project, models);
  return {
    project: projectView(project),
    files: Object.fromEntries([...files].map(([k, f]) => [k, fileView(f)])),
    timeline: lay.rows.map((r) => ({ id: r.scene.id, start: r.start, seconds: r.seconds, ready: r.ready, xIn: r.xIn / 30, xOut: r.xOut / 30, volume: r.volume })),
    seconds: lay.seconds, estimate: est,
    jobs: db.jobs.filter((j) => j.userId === project.userId && j.ref === project.id && ['queued', 'running', 'retrying'].includes(j.status)).map(publicJob),
    picturing: db.jobs.filter((j) => j.userId === project.userId && j.ref === project.id && j.type === 'keyframe' && ['queued', 'running', 'retrying'].includes(j.status)).map((j) => j.payload.sceneId),
  };
}

// ---------- cleaning what the browser sends ----------
function cleanScene(input, old, userId, copy) {
  const type = old?.type || (['ai', 'video', 'image'].includes(input.type) ? input.type : 'ai');
  // The browser may name a new scene itself (so undo and selection keep working); anything odd gets a fresh id.
  const s = { id: old?.id || (typeof input.id === 'string' && /^sc_[\w-]{8,24}$/.test(input.id) ? input.id : id('sc_')), type };
  s.transition = TRANSITIONS.includes(input.transition) ? input.transition : 'cut';
  s.fit = input.fit === 'crop' ? 'crop' : 'pad';
  s.locked = !!input.locked;
  s.narration = text(input.narration, 600);
  if (input.volume != null && input.volume !== '') s.volume = num(input.volume, 0, 2, 1);
  // Precision editing: speed and playing backwards. While the switch is off, what a scene already has is kept as it is.
  if (type !== 'image') {
    const pe = flags().precisionEdit; const base = old || copy || {};
    const speed = pe && input.speed != null ? Math.round(num(input.speed, 0.5, 2, 1) * 20) / 20 : base.speed; if (speed && speed !== 1) s.speed = speed;
    if (pe ? !!input.reverse : !!base.reverse) s.reverse = true;
  }
  if (type === 'ai') {
    const rangeLen = old?.rangeLen ?? copy?.rangeLen; if (rangeLen) { s.rangeLen = rangeLen; s.rangeKind = old?.rangeKind ?? copy?.rangeKind; }
    s.prompt = text(input.prompt, 4000); s.duration = rangeLen ? Math.max(1, Math.round(rangeLen * 100) / 100) : num(input.duration, 1, 60, 5);
    s.modelId = input.modelId ? text(input.modelId, 80) : undefined; s.continuity = !!input.continuity;
    s.versions = old?.versions || (copy?.type === 'ai' ? JSON.parse(JSON.stringify(copy.versions || [])) : []); s.cur = s.versions.length ? Math.round(num(input.cur, 0, s.versions.length - 1, s.versions.length - 1)) : 0;
    s.status = old?.status || (s.versions.length ? 'done' : 'draft'); s.error = old?.error; s.jobId = old?.jobId; s.holdCredits = old?.holdCredits;
    const ref = input.refFileId && userFile(userId, input.refFileId); s.refFileId = ref?.kind === 'image' ? ref.id : undefined;
    s.trimIn = num(input.trimIn, 0, 600, 0); if (input.trimOut != null && Number(input.trimOut) > 0) s.trimOut = num(input.trimOut, 0, 600, 0);
  } else {
    const f = userFile(userId, old?.fileId || input.fileId);
    if (!f || f.kind !== type) return null; // the file must be this user's own upload of the right kind
    s.fileId = f.id;
    if (input.replaceFileId) { const nf = userFile(userId, input.replaceFileId); if (nf?.kind === type) s.fileId = nf.id; }
    if (type === 'image') s.duration = num(input.duration, 0.5, 60, IMAGE_SEC);
    else { s.trimIn = num(input.trimIn, 0, 3600, 0); if (input.trimOut != null && Number(input.trimOut) > 0) s.trimOut = num(input.trimOut, 0, 3600, 0); if (s.trimOut != null && s.trimOut <= s.trimIn + 0.1) delete s.trimOut; }
  }
  return s;
}
function applyDoc(project, body, userId) {
  if (body.title != null) project.title = text(body.title, 120).trim() || 'Untitled video';
  if (RATIOS[body.ratio]) project.ratio = body.ratio;
  if (RESOLUTIONS.includes(body.resolution)) project.resolution = body.resolution;
  if (body.modelId != null) project.modelId = text(body.modelId, 80);
  if (body.captionStyle && CAPTION_STYLES[body.captionStyle]) project.captionStyle = body.captionStyle;
  if (Array.isArray(body.captions)) project.captions = cleanCaptions(body.captions.slice(0, 2000), MAX_PROJECT_SEC);
  if (Array.isArray(body.scenes)) {
    if (body.scenes.length > MAX_SCENES) throw new UserError(`A project can hold up to ${MAX_SCENES} scenes.`);
    // Scenes that were removed stay in a small bin, so Undo brings back an AI scene together with the clips that were paid for.
    const bin = new Map((project.bin || []).map((s) => [s.id, s]));
    const old = new Map(project.scenes.map((s) => [s.id, s])); const seen = new Set();
    project.scenes = body.scenes.map((s) => {
      if (s?.id && seen.has(s.id)) return null;
      const o = s?.id ? old.get(s.id) || bin.get(s.id) : null; if (s?.id) seen.add(s.id);
      const copy = !o && s?.copyOf ? old.get(s.copyOf) || bin.get(s.copyOf) : null;
      return cleanScene(s || {}, o, userId, copy);
    }).filter(Boolean);
    const kept = new Set(project.scenes.map((s) => s.id));
    project.bin = [...[...old.values()].filter((s) => !kept.has(s.id) && s.type === 'ai' && s.versions?.length && s.status !== 'generating'), ...(project.bin || []).filter((s) => !kept.has(s.id))].slice(0, 40);
  }
  for (const k of ['voice', 'music']) {
    if (body[k] === null) { project[k] = null; continue; }
    if (!body[k]) continue;
    const t = body[k]; const cur = { ...(project[k] || {}) };
    if (k === 'music' && t.trackId) { const tr = db.tracks.find((x) => x.id === t.trackId); if (tr) { cur.trackId = tr.id; cur.fileId = tr.fileId; } }
    else if (t.fileId) { const f = userFile(userId, t.fileId); if (f?.kind === 'audio' || (f?.kind === 'video' && f.hasAudio)) { cur.fileId = f.id; delete cur.trackId; } }
    if (!cur.fileId) continue;
    cur.volume = num(t.volume, 0, 2, k === 'voice' ? 1 : 0.5);
    if (flags().precisionEdit) { cur.fadeIn = num(t.fadeIn, 0, 10, 0); cur.fadeOut = num(t.fadeOut, 0, 10, 0); }
    if (k === 'voice') cur.offset = num(t.offset, 0, 600, 0);
    else { cur.duck = t.duck !== false; cur.duckDb = num(t.duckDb, 3, 24, 12); cur.fit = t.fit !== false; }
    project[k] = cur;
  }
}

// ---------- reading a new upload right away, so its real length is known ----------
// A damaged picture can stall the export, so every picture is opened once before it becomes a scene.
async function pictureOk(rec) {
  if (rec.pictureOk != null) return rec.pictureOk;
  let good = true;
  try { await ffmpeg(['-v', 'error', '-xerror', '-err_detect', 'explode', '-i', locate(rec), '-frames:v', '1', '-f', 'null', '-'], { timeoutMs: 20000 }); } catch { good = false; }
  rec.pictureOk = good; save(); return good;
}
async function ensureProbed(rec) {
  // A "video" with a length but no picture size was read before sound-only videos were told apart: read it again.
  if (!rec || rec.kind === 'image' || (rec.duration && !(rec.kind === 'video' && !rec.w))) return rec;
  const info = await probe(locate(rec)); soundOnly(rec, info);
  if (!info || (rec.kind === 'video' && !info.hasVideo)) throw new UserError(`${rec.name}: this file could not be read. It may be damaged. Try saving it again as MP4 (video) or MP3 (sound).`, 422);
  Object.assign(rec, { duration: info.duration, hasAudio: info.hasAudio }); if (info.hasVideo) Object.assign(rec, { w: info.width, h: info.height, fps: info.fps });
  save(); return rec;
}

// ---------- waveform for the timeline ----------
async function peaksFor(rec) {
  const key = keys.derived(rec.userId || 'library', rec.id, 'peaks.json');
  if (sizeOf(key)) return JSON.parse(fs.readFileSync(abs(key), 'utf8'));
  const tmp = path.join(os.tmpdir(), `pk-${rec.id}-${Date.now()}.raw`);
  try {
    await ffmpeg(['-i', locate(rec), '-vn', '-ac', '1', '-ar', '4000', '-f', 's16le', tmp], { timeoutMs: 120000 });
    const buf = fs.readFileSync(tmp); const n = Math.floor(buf.length / 2); const perSec = n / 4000 > 600 ? 10 : 25; const bucket = Math.max(1, Math.round(4000 / perSec));
    const peaks = [];
    for (let i = 0; i < n; i += bucket) { let mx = 0; const end = Math.min(n, i + bucket); for (let k = i; k < end; k++) { const v = Math.abs(buf.readInt16LE(k * 2)); if (v > mx) mx = v; } peaks.push(Math.round((mx / 32768) * 100)); }
    const out = { perSec, peaks }; put(key, Buffer.from(JSON.stringify(out))); return out;
  } finally { fs.rmSync(tmp, { force: true }); }
}

// ---------- jobs ----------
const findScene = (pid, sid) => { const p = db.vprojects.find((x) => x.id === pid); return { p, s: p?.scenes.find((x) => x.id === sid) }; };
const sleep = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); }, { once: true }); });
const POLL_MS = () => Math.max(200, Number(process.env.SCENE_POLL_MS) || 6000);

async function lastFrameDataUrl(rec, signal) {
  const out = path.join(os.tmpdir(), `lf-${rec.id}-${Date.now()}.jpg`);
  try { await ffmpeg(['-sseof', '-0.25', '-i', locate(rec), '-frames:v', '1', '-update', '1', '-q:v', '3', out], { signal, timeoutMs: 60000 }); return `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`; } finally { fs.rmSync(out, { force: true }); }
}

// One AI scene: start the provider task once, wait for it, keep the clip in our own storage.
defineJob('scene', async (job, { signal, progress, log }) => {
  const { p, s } = findScene(job.payload.projectId, job.payload.sceneId);
  if (!p || !s) throw Object.assign(new Error('That scene was removed.'), { retry: false });
  const model = await findModel(job.payload.modelId);
  if (!model) throw Object.assign(new Error('That video model is no longer available. Pick another model for this scene.'), { retry: false });
  if (!job.payload.taskId) {
    const body = { model: model.id, prompt: job.payload.prompt, duration: job.payload.duration, ratio: job.payload.ratio, resolution: job.payload.resolution, watermark: false };
    if (job.payload.editFileId) { // "Change it": the cut of the video goes to a model that edits video
      const cut = db.files.find((f) => f.id === job.payload.editFileId && f.userId === p.userId); const url = cut && publicFileUrl(cut);
      if (!url) throw Object.assign(new Error('The cut of the video is not reachable from the internet.'), { retry: false, userMessage: 'The cut of the video could not be sent to the video service.' });
      body.video_urls = [url]; if (body.duration == null) delete body.duration;
    } else if (model.video.imageToVideo) {
      const i = p.scenes.indexOf(s); const prev = i > 0 ? p.scenes[i - 1] : null;
      // A chained scene starts from the last frame of the scene before, so it waits until that one is made (for at most 40 minutes).
      if (s.continuity && !s.refFileId && prev?.type === 'ai' && prev.status === 'generating' && (job.payload.waited = (job.payload.waited || 0) + 1) < 600) throw Object.assign(new Error('waiting for the scene before'), { defer: 4000, note: 'Waiting for the scene before' });
      const ref = s.refFileId && db.files.find((f) => f.id === s.refFileId && f.userId === p.userId);
      const prevFile = s.continuity && prev ? db.files.find((f) => f.id === (prev.type === 'ai' ? prev.versions?.[prev.cur ?? 0]?.fileId : prev.fileId)) : null;
      // The gateway takes a start picture only as a public web link ending in an image extension; a picture sent inline is
      // refused with a 400 and the scene fails (found 2026-11-19, see pictureLink in generate.js). So the picture goes as a link.
      // Where this server has no way to give one (no bucket, no public address), the scene is made from its description instead of failing.
      if (ref && hasBytes(ref)) { const link = pictureLink(ref); if (link) body.image_urls = [link]; else log('reference picture skipped: this server has no public address for pictures'); }
      else if (prevFile && hasBytes(prevFile) && ffmpegInfo().ok) {
        try {
          // The last frame of the scene before is stored as a picture, so it can be handed over as a link.
          let pic = prevFile;
          if (prevFile.kind !== 'image') { const m = /^data:([^;]+);base64,(.+)$/s.exec(await lastFrameDataUrl(prevFile, signal)); const owner = db.users.find((u) => u.id === p.userId); pic = m && owner ? storeImage(owner, `frame-${s.id}.${/png/.test(m[1]) ? 'png' : 'jpg'}`, m[1], Buffer.from(m[2], 'base64')) : null; }
          const link = pic && pictureLink(pic);
          if (link) body.image_urls = [link]; else log('continuity frame skipped: this server has no public address for pictures');
        } catch (e) { log('continuity frame skipped: ' + e.message); }
      }
    }
    const started = await callJson('/videos/generations', { json: body, signal });
    if (!started?.task_id) throw new Error('The video service did not start the task.');
    job.payload.taskId = started.task_id; save(); // saved at once: a retry or a restart waits for this task instead of starting (and paying for) another
  }
  progress(0.1, 'Generating');
  for (let n = 0; ; n++) {
    const j = await callJson('/videos/generations/' + encodeURIComponent(job.payload.taskId), { method: 'GET', signal });
    if (j.status === 'succeeded' && j.content?.video_url) {
      progress(0.85, 'Saving the clip');
      const r = await fetch(j.content.video_url, { signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]) });
      if (!r.ok) throw new Error('download failed: HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const { p: p2, s: s2 } = findScene(job.payload.projectId, job.payload.sceneId);
      if (!p2 || !s2) throw Object.assign(new Error('That scene was removed.'), { retry: false });
      const version = (s2.versions?.length || 0) + 1;
      const rec = { id: id('m_'), userId: p2.userId, kind: 'generated', type: 'video', mime: 'video/mp4', name: `scene-${version}.mp4`, size: buf.length, prompt: job.payload.prompt, model: model.id, title: p2.title, builderId: p2.id, sceneId: s2.id, sceneNumber: p2.scenes.indexOf(s2) + 1, hiddenFromAssets: true, createdAt: now() };
      rec.key = put(keys.scene(p2.userId, p2.id, s2.id, version), buf);
      db.files.push(rec);
      try { await ensureProbed(rec); } catch { rec.duration = job.payload.duration; }
      const credits = Number(j.usage?.charge_amount) > 0 ? round2(usdToCredits(j.usage.charge_amount, model)) : job.payload.credits;
      // A scene made from a time range keeps the length of that range, whatever length the model returns.
      s2.versions = [...(s2.versions || []), { fileId: rec.id, at: now(), credits, prompt: job.payload.prompt, model: model.id, ...(s2.rangeLen ? { tin: 0, tout: s2.rangeLen } : {}), ...(job.payload.editFileId ? { edit: true } : {}) }]; s2.cur = s2.versions.length - 1;
      s2.status = 'done'; s2.error = undefined; s2.jobId = undefined; p2.updatedAt = now(); p2.rev = (p2.rev || 0) + 1; save();
      deriveLater(rec);
      return { credits, fileId: rec.id };
    }
    if (['failed', 'cancelled', 'expired'].includes(j.status)) throw Object.assign(new Error(j.error?.message || `The video service reported "${j.status}".`), { retry: false, userMessage: 'The video service could not make this scene.' });
    progress(Math.min(0.8, 0.1 + n * 0.02), j.status === 'processing' ? 'Generating' : 'Waiting in line');
    await sleep(POLL_MS(), signal);
  }
}, { maxAttempts: 3, timeoutMs: 25 * 60 * 1000, backoffMs: 4000, maxPerUser: Math.max(1, Number(process.env.SCENES_PER_USER) || 3),
  onEnd: (job) => {
    const { p, s } = findScene(job.payload.projectId, job.payload.sceneId); if (!s || job.status === 'done') return;
    s.jobId = undefined; s.status = s.versions?.length ? 'done' : job.status === 'cancelled' ? 'draft' : 'failed';
    const refunded = round2(job.payload.reserved || 0);
    s.error = job.status === 'cancelled' ? undefined : `This scene failed and your ${Math.round(refunded).toLocaleString('en-US')} credits were refunded. Try again?`;
    p.rev = (p.rev || 0) + 1; save();
  } });

// Export: free, one at a time for each user.
defineJob('export', async (job, { signal, progress }) => {
  const p = db.vprojects.find((x) => x.id === job.payload.projectId);
  if (!p) throw Object.assign(new Error('That project was removed.'), { retry: false });
  const ex = (p.exports || []).find((e) => e.id === job.payload.exportId);
  const snapshot = job.payload.snapshot || p; // exported exactly as it was when Export was pressed
  const r = await renderProject({ ...snapshot, id: p.id, userId: p.userId }, fileMap({ ...snapshot, userId: p.userId }), { resolution: job.payload.resolution, burnCaptions: job.payload.burnCaptions, audioOnly: job.payload.audioOnly, signal, progress });
  try {
    const ext = job.payload.audioOnly ? 'm4a' : 'mp4';
    const rec = { id: id('m_'), userId: p.userId, kind: 'generated', type: job.payload.audioOnly ? 'audio' : 'video', mime: job.payload.audioOnly ? 'audio/mp4' : 'video/mp4', name: `${p.title}.${ext}`, title: p.title + (job.payload.audioOnly ? ' audio' : ''), prompt: p.title, size: r.bytes, duration: r.measured, w: r.width, h: r.height, hasAudio: true, builderId: p.id, exportId: job.payload.exportId, hiddenFromAssets: job.payload.audioOnly || undefined, createdAt: now() };
    rec.key = putFile(keys.exportFile(p.userId, p.id, job.payload.exportId, ext), r.file, { move: true });
    db.files.push(rec);
    if (ex) Object.assign(ex, { status: 'done', fileId: rec.id, seconds: r.seconds, bytes: r.bytes, width: r.width, height: r.height, burned: r.burned, endedAt: now() });
    save(); if (!job.payload.audioOnly) deriveLater(rec, { proxy: false });
    return { fileId: rec.id, seconds: r.seconds, bytes: r.bytes };
  } finally { cleanWork(r.work); }
}, { maxAttempts: 2, timeoutMs: 90 * 60 * 1000, backoffMs: 3000, maxPerUser: 1,
  onEnd: (job) => { if (job.status === 'done') return; const p = db.vprojects.find((x) => x.id === job.payload.projectId); const ex = p?.exports?.find((e) => e.id === job.payload.exportId); if (ex) { ex.status = job.status === 'cancelled' ? 'stopped' : 'failed'; ex.error = job.error; ex.endedAt = now(); save(); } } });

// ---------- music library: sample tracks on first start ----------
function seedTracks() {
  if (db.tracks.length) return;
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'seed', 'music');
  let list = []; try { list = JSON.parse(fs.readFileSync(path.join(dir, 'tracks.json'), 'utf8')); } catch { return; }
  for (const t of list) { try { addTrack(fs.readFileSync(path.join(dir, t.file)), t.file, t); } catch (e) { console.warn('[music] seed skipped', t.file, e.message); } }
}
function addTrack(buf, fileName, meta) {
  const tid = id('trk_'); const ext = safeExt(fileName, 'mp3');
  const rec = { id: id('f_'), userId: null, library: true, trackId: tid, kind: 'audio', mime: { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' }[ext] || 'audio/mpeg', name: fileName, title: meta.title, size: buf.length, duration: Number(meta.duration) || 0, createdAt: now() };
  rec.key = put(`library/music/${tid}.${ext}`, buf); db.files.push(rec);
  const track = { id: tid, fileId: rec.id, title: text(meta.title, 100) || fileName, mood: MOODS.includes(meta.mood) ? meta.mood : 'Chill', genre: text(meta.genre, 40), bpm: num(meta.bpm, 0, 300, 0), duration: rec.duration, licence: text(meta.licence, 300), source: text(meta.source, 200), createdAt: now() };
  db.tracks.push(track); save(); return { track, rec };
}
const trackView = (t) => ({ id: t.id, title: t.title, mood: t.mood, genre: t.genre, bpm: t.bpm, duration: t.duration, licence: t.licence, audio: `/api/builder/music/${t.id}/audio` });

// The model a new video starts with: BUILDER_DEFAULT_MODEL when it is set, else Seedance 2.5 (the cheapest of that family),
// else Dreamina, else the fast draft model. It must be able to make the shape and quality of the project.
export function defaultModel(models, { ratio = '16:9', resolution = '720p' } = {}) {
  const fits = models.filter((m) => m.video.textToVideo && m.video.ratios.includes(ratio) && m.video.resolutions.includes(resolution));
  const per = (m) => m.price.creditsPerSecond[resolution] ?? Infinity;
  return fits.find((m) => m.id === process.env.BUILDER_DEFAULT_MODEL) || fits.filter((m) => /seedance-2-5|seed-2\.5/i.test(m.id)).sort((a, b) => per(a) - per(b))[0]
    || fits.find((m) => /dreamina/i.test(m.id)) || fits.find((m) => /fast/i.test(m.id)) || fits[0] || models.find((m) => /fast/i.test(m.id)) || models[0] || null;
}
// The picture model for preview pictures: cheap and quick. KEYFRAME_MODEL overrides it.
export async function keyModel() {
  const list = (await getCatalog()).filter((m) => m.type === 'image');
  return list.find((m) => m.id === process.env.KEYFRAME_MODEL) || list.find((m) => m.id === 'nano-banana-2') || list.find((m) => /seedream-5\.0-pro/i.test(m.id)) || list.sort((a, b) => a.price.creditsPerImage - b.price.creditsPerImage)[0] || null;
}

export async function createProject(user, body = {}) {
  if (db.vprojects.filter((p) => p.userId === user.id).length >= 200) throw new UserError('You have reached 200 video projects. Delete one you no longer need first.');
  const models = (await getCatalog()).filter((m) => m.type === 'video' && m.video.textToVideo);
  const ratio = RATIOS[body.ratio] ? body.ratio : '16:9', resolution = RESOLUTIONS.includes(body.resolution) ? body.resolution : '720p';
  const p = { id: id('vp_'), userId: user.id, title: text(body.title, 120).trim() || 'Untitled video', ratio, resolution,
    modelId: models.find((m) => m.id === body.modelId)?.id || defaultModel(models, { ratio, resolution })?.id || '', scenes: [], voice: null, music: null, captions: [], captionStyle: 'clean', exports: [], rev: 1, createdAt: now(), updatedAt: now() };
  if (Array.isArray(body.scenes)) p.scenes = body.scenes.slice(0, MAX_SCENES).map((s) => cleanScene({ ...s, type: 'ai' }, null, user.id)).filter(Boolean);
  if (body.trackId) { const t = db.tracks.find((x) => x.id === body.trackId); if (t) p.music = { trackId: t.id, fileId: t.fileId, volume: 0.5, duck: true, duckDb: 12, fit: true }; }
  if (body.agent) p.agent = body.agent;
  if (body.origin === 'pro') p.origin = 'pro'; // a Studio Pro film, cut here
  db.vprojects.push(p); save(); return p;
}
export const touchProject = (p) => { p.updatedAt = now(); p.rev = (p.rev || 0) + 1; save(); };

// Check, price, reserve and start AI scenes. With edit = { fileId, modelId, seconds } one scene is made by a model that edits a cut of the video.
export async function startScenes(user, p, targets, { idem = id('i_'), edit = null, dryRun = false } = {}) {
  const plan = [];
  for (const s of targets) {
    const n = p.scenes.indexOf(s) + 1; const model = await findModel(edit?.modelId || s.modelId || p.modelId); const want = Number(s.duration) || 5;
    if (!model || model.type !== 'video') throw new UserError(`Scene ${n}: pick a video model first.`);
    if (!String(s.prompt || '').trim()) throw new UserError(edit ? 'Write what should change in this part of the video.' : s.rangeLen ? 'Write what should happen in this part of the video.' : `Scene ${n} has no description yet. Write what should happen in it.`);
    if (!model.video.tasks.includes(edit ? 'edit' : 'create')) throw new UserError(edit ? `${model.name} cannot change an existing video. Pick a model that can.` : `Scene ${n}: ${model.name} only edits existing videos. Pick a model that can create.`);
    if (!model.video.ratios.includes(p.ratio) && !(edit && model.video.ratios.includes('adaptive'))) throw new UserError(`Scene ${n}: ${model.name} cannot make ${p.ratio} videos. It offers ${model.video.ratios.filter((r) => r !== 'adaptive').join(', ')}. Change the model or the project shape.`);
    if (!model.video.resolutions.includes(p.resolution)) throw new UserError(`Scene ${n}: ${model.name} cannot make ${p.resolution} videos. It offers ${model.video.resolutions.join(', ')}.`);
    if (!edit && !model.video.textToVideo && !s.refFileId && !s.continuity) throw new UserError(`Scene ${n}: ${model.name} needs a reference picture.`);
    const duration = allowedDuration(model, want); if (duration == null && !edit) throw new UserError(`Scene ${n}: ${model.name} cannot be used for scenes.`);
    if (s.rangeLen && duration != null && duration < s.rangeLen - 0.05) throw new UserError(`${model.name} makes clips of up to ${duration} seconds and this part is ${Math.round(s.rangeLen * 10) / 10} seconds long. Select a shorter part, or pick another model.`);
    const credits = edit ? editCredits(model, p.resolution, want) : sceneCredits(model, p.resolution, want);
    plan.push({ s, model, duration, credits, reserved: round2(credits * 1.15) });
  }
  const total = round2(plan.reduce((n, x) => n + x.reserved, 0));
  if (dryRun) return { jobs: [], total, credits: round2(plan.reduce((n, x) => n + x.credits, 0)), plan };
  needCredits(user, total);
  const jobs = [];
  for (const x of plan) {
    const key = `${idem}:${x.s.id}`;
    if (db.jobs.some((j) => j.userId === user.id && j.type === 'scene' && j.idempotencyKey === key)) continue; // the same press arrived twice
    const hold = reserve(user, x.reserved, `Video Builder scene · ${x.model.name}`, { builderId: p.id, sceneId: x.s.id });
    const { job } = enqueue({ type: 'scene', userId: user.id, ref: p.id, holdId: hold.id, idempotencyKey: key, payload: { projectId: p.id, sceneId: x.s.id, modelId: x.model.id, prompt: String(x.s.prompt).trim(), duration: x.duration ?? undefined, ratio: p.ratio, resolution: p.resolution, credits: x.credits, reserved: x.reserved, editFileId: edit?.fileId } });
    x.s.status = 'generating'; x.s.error = undefined; x.s.jobId = job.id; jobs.push(job);
  }
  return { jobs, total, plan };
}

export function mountBuilder(app, { requireUser, requireAdmin, wrap }) {
  const gate = (req, res, next) => (flags().videoBuilder ? next() : res.status(404).json({ error: 'Video Builder is switched off.', code: 'feature_off' }));
  const musicGate = (req, res, next) => (flags().videoBuilder && flags().musicLibrary ? next() : res.status(404).json({ error: 'The music library is switched off.', code: 'feature_off' }));
  const own = (req) => { const p = userProject(req.user.id, req.params.id); if (!p) throw new UserError('That video project no longer exists.', 404); return p; };
  const touch = (p) => { p.updatedAt = now(); p.rev = (p.rev || 0) + 1; save(); };
  if (flags().videoBuilder && flags().musicLibrary) seedTracks();

  app.get('/api/builder/info', requireUser, gate, wrap(async (_req, res) => res.json({ keyframe: await keyModel().then((m) => m && { name: m.name, credits: round2(m.price.creditsPerImage) }), ffmpeg: ffmpegInfo().ok, ffmpegHelp: FFMPEG_HELP, canBurnCaptions: !!ffmpegInfo().canBurn, audioFirst: flags().audioFirst, beatSync: flags().beatSync, videoAgent: flags().videoAgent, precision: flags().precisionEdit, canSendVideo: !!publicFileUrl({ id: 'x' }), maxReverseSec: MAX_REVERSE_SEC, captionPos: Object.entries(CAPTION_POS).map(([k, v]) => ({ id: k, label: v.label })), burnHelp: BURN_HELP, ratios: Object.keys(RATIOS), resolutions: RESOLUTIONS, transitions: TRANSITIONS, captionStyles: Object.entries(CAPTION_STYLES).map(([k, v]) => ({ id: k, label: v.label })), moods: MOODS, maxScenes: MAX_SCENES, maxMinutes: MAX_PROJECT_SEC / 60, limits: limits(), musicLibrary: flags().musicLibrary })));

  app.get('/api/builder/projects', requireUser, gate, (req, res) => {
    res.json({ projects: db.vprojects.filter((p) => p.userId === req.user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((p) => {
      const files = fileMap(p); const lay = layout(p, files); const first = lay.rows.find((r) => r.src); const fv = first && fileView(first.src);
      return { id: p.id, title: p.title, ratio: p.ratio, scenes: p.scenes.length, seconds: lay.seconds, updatedAt: p.updatedAt, poster: fv?.poster || (fv?.kind === 'image' ? fv.url : undefined), exports: (p.exports || []).filter((e) => e.status === 'done').length, origin: p.origin || (p.agent?.from === 'studio-pro' ? 'pro' : p.agent ? 'agent' : 'builder') };
    }) });
  });
  app.post('/api/builder/projects', requireUser, gate, wrap(async (req, res) => {
    res.json(await view(await createProject(req.user, req.body)));
  }));
  app.get('/api/builder/projects/:id', requireUser, gate, wrap(async (req, res) => res.json(await view(own(req)))));
  app.put('/api/builder/projects/:id', requireUser, gate, wrap(async (req, res) => {
    const p = own(req);
    if (req.body.rev != null && Number(req.body.rev) !== p.rev) return res.status(409).json({ error: 'This project changed somewhere else (another tab, or a scene just finished). The newest version is shown now.', code: 'stale', ...(await view(p)) });
    applyDoc(p, req.body, req.user.id); touch(p); res.json(await view(p));
  }));
  app.delete('/api/builder/projects/:id', requireUser, gate, wrap(async (req, res) => {
    const p = own(req);
    for (const j of db.jobs.filter((x) => x.ref === p.id && ['queued', 'running', 'retrying'].includes(x.status))) cancelJob(j.id, req.user.id);
    db.vprojects = db.vprojects.filter((x) => x !== p); save(); res.json({ ok: true });
  }));

  // Uploaded files become scenes (videos, pictures) or go on a sound track, in the order they were given.
  app.post('/api/builder/projects/:id/add', requireUser, gate, wrap(async (req, res) => {
    const p = own(req); needFfmpeg();
    const ids = [].concat(req.body.fileIds || []).map(String).slice(0, 60); const notes = [];
    const before = JSON.stringify([p.scenes.map((x) => x.id), p.voice, p.music]);
    let at = req.body.at != null ? Math.max(0, Math.min(p.scenes.length, Number(req.body.at) || 0)) : p.scenes.length;
    for (const fid of ids) {
      const f = userFile(req.user.id, fid); if (!f) continue;
      try {
        if (f.kind === 'video' || f.kind === 'audio') await ensureProbed(f);
        if (f.kind === 'image' && !(await pictureOk(f))) { notes.push(`${f.name}: this picture could not be read. It may be damaged. Save it again as PNG or JPG and add it again.`); continue; }
        // Picked with the Add button of the Voice or Music row: a video gives its sound to that track instead of becoming a scene.
        const asSound = f.kind === 'video' && (req.body.audioAs === 'music' || req.body.audioAs === 'voice');
        if (asSound && !f.hasAudio) { notes.push(`${f.name} has no sound, so it could not be used as ${req.body.audioAs === 'voice' ? 'the voice-over' : 'the music'}.`); continue; }
        if ((f.kind === 'video' && !asSound) || f.kind === 'image') {
          if (p.scenes.length >= MAX_SCENES) { notes.push(`${f.name}: left out, a project can hold up to ${MAX_SCENES} scenes.`); continue; }
          p.scenes.splice(at++, 0, f.kind === 'video' ? { id: id('sc_'), type: 'video', fileId: f.id, trimIn: 0, transition: 'cut', fit: 'pad' } : { id: id('sc_'), type: 'image', fileId: f.id, duration: IMAGE_SEC, transition: 'cut', fit: 'pad' });
          if (f.kind === 'video') deriveLater(f, { proxy: true });
        } else if (f.kind === 'audio' || asSound) {
          if (f.duration > 20 * 60 + 1) { notes.push(`${f.name}: this sound file is ${Math.round(f.duration / 60)} minutes long. The limit is 20 minutes.`); continue; }
          const want = req.body.audioAs === 'music' || req.body.audioAs === 'voice' ? req.body.audioAs : !p.voice ? 'voice' : 'music';
          const slot = want === 'voice' && p.voice && !p.music && !req.body.audioAs ? 'music' : want;
          p[slot] = slot === 'voice' ? { fileId: f.id, volume: 1, offset: 0 } : { fileId: f.id, volume: 0.5, duck: true, duckDb: 12, fit: true };
          notes.push(`${f.name} was added as ${slot === 'voice' ? 'the voice-over' : 'the music'}${asSound ? ' (its sound only)' : ''}.`);
        } else notes.push(`${f.name}: only videos, pictures and sound files can be added here.`);
      } catch (e) { notes.push(e.message); }
    }
    if (JSON.stringify([p.scenes.map((x) => x.id), p.voice, p.music]) !== before) touch(p);
    res.json({ ...(await view(p)), notes });
  }));
  app.post('/api/builder/projects/:id/scenes', requireUser, gate, wrap(async (req, res) => {
    const p = own(req); if (p.scenes.length >= MAX_SCENES) throw new UserError(`A project can hold up to ${MAX_SCENES} scenes.`);
    const s = cleanScene({ type: 'ai', prompt: req.body.prompt, duration: req.body.duration || 5 }, null, req.user.id);
    const at = req.body.at != null ? Math.max(0, Math.min(p.scenes.length, Number(req.body.at) || 0)) : p.scenes.length; p.scenes.splice(at, 0, s);
    touch(p); res.json({ ...(await view(p)), sceneId: s.id });
  }));

  app.get('/api/builder/peaks/:fileId', requireUser, gate, wrap(async (req, res) => {
    const f = db.files.find((x) => x.id === req.params.fileId && (x.userId === req.user.id || x.library)); if (!f || !hasBytes(f)) return res.status(404).json({ error: 'That file is no longer available.' });
    needFfmpeg(); res.setHeader('Cache-Control', 'private, max-age=86400'); res.json(await peaksFor(f));
  }));

  // AI scenes: price shown, credits reserved, each scene charged when it succeeds and refunded when it fails.
  app.post('/api/builder/projects/:id/generate', requireUser, gate, wrap(async (req, res) => {
    const p = own(req); const all = !Array.isArray(req.body.sceneIds);
    const targets = p.scenes.filter((s) => s.type === 'ai' && (all ? !s.versions?.length && !s.locked : req.body.sceneIds.includes(s.id)) && s.status !== 'generating');
    if (!targets.length) throw new UserError(all ? 'Every AI scene already has a clip. Open a scene and press Regenerate to make it again.' : 'That scene is already being generated.');
    const locked = targets.find((s) => s.locked); if (locked) throw new UserError(`Scene ${p.scenes.indexOf(locked) + 1} is locked. Unlock it before generating it again.`);
    const idem = typeof req.body.idem === 'string' && req.body.idem.length >= 8 ? req.body.idem.slice(0, 80) : id('i_');
    const { jobs, total } = await startScenes(req.user, p, targets, { idem });
    touch(p); res.json({ ...(await view(p)), started: jobs.length, reserved: total, credits: round2(req.user.credits) });
  }));
  app.post('/api/builder/projects/:id/scenes/:sid/stop', requireUser, gate, wrap(async (req, res) => {
    const p = own(req); const s = p.scenes.find((x) => x.id === req.params.sid); if (s?.jobId) cancelJob(s.jobId, req.user.id);
    res.json(await view(p));
  }));

  // Export (free). The project is exported as it is at this moment.
  app.post('/api/builder/projects/:id/export', requireUser, gate, wrap(async (req, res) => {
    const p = own(req); needFfmpeg();
    if (!p.scenes.length) throw new UserError('Add at least one scene first.');
    const lay = layout(p, fileMap(p)); const miss = lay.rows.findIndex((r) => !r.ready);
    if (miss >= 0) throw new UserError(`Scene ${miss + 1} has no video yet. Generate it, replace it or remove it, then export again.`);
    const running = db.jobs.find((j) => j.userId === req.user.id && j.type === 'export' && j.ref === p.id && ['queued', 'running', 'retrying'].includes(j.status));
    if (running) return res.json({ ...(await view(p)), job: publicJob(running), already: true });
    const resolution = RESOLUTIONS.includes(req.body.resolution) ? req.body.resolution : p.resolution; const audioOnly = !!req.body.audioOnly;
    const ex = { id: id('ex_'), status: 'working', resolution, audioOnly, burnCaptions: !!req.body.burnCaptions && !audioOnly && !!ffmpegInfo().canBurn, note: req.body.burnCaptions && !audioOnly && !ffmpegInfo().canBurn ? BURN_HELP : undefined, createdAt: now() };
    const { scenes, voice, music, captions, captionStyle, ratio, title } = p;
    const { job } = enqueue({ type: 'export', userId: req.user.id, ref: p.id, idempotencyKey: typeof req.body.idem === 'string' ? req.body.idem.slice(0, 80) : undefined,
      payload: { projectId: p.id, exportId: ex.id, resolution, audioOnly, burnCaptions: ex.burnCaptions, snapshot: JSON.parse(JSON.stringify({ scenes, voice, music, captions, captionStyle, ratio, resolution, title })) } });
    ex.jobId = job.id; p.exports = [ex, ...(p.exports || [])].slice(0, 30); save();
    res.json({ ...(await view(p)), job: publicJob(job) });
  }));
  app.get('/api/builder/projects/:id/captions.srt', requireUser, gate, wrap(async (req, res) => {
    const p = own(req); const srt = toSrt(p.captions, layout(p, fileMap(p)).seconds);
    if (!srt) throw new UserError('This project has no captions yet.', 404);
    res.setHeader('Content-Disposition', contentDisposition(`${(p.title || 'captions').replace(/[\\/:*?"<>|]/g, '_')}.srt`)); res.type('application/x-subrip').send(srt);
  }));

  // ---------- music library ----------
  app.get('/api/builder/music', requireUser, musicGate, (_req, res) => res.json({ moods: MOODS, tracks: db.tracks.map(trackView) }));
  app.get('/api/builder/music/:tid/audio', requireUser, musicGate, (req, res) => {
    const f = trackFile(db.tracks.find((t) => t.id === req.params.tid)); if (!f || !hasBytes(f)) return res.status(404).end();
    res.setHeader('Accept-Ranges', 'bytes'); res.type(f.mime).sendFile(locate(f), { dotfiles: 'allow' }, (err) => { if (err && !res.headersSent) res.status(404).end(); });
  });
  const up = multer({ dest: os.tmpdir(), limits: { fileSize: limits().audioMb * MB, files: 1 } });
  app.post('/api/admin/music', requireUser, requireAdmin, musicGate, (req, res, next) => up.single('file')(req, res, (err) => (err ? res.status(400).json({ error: `That file is too large. The limit is ${limits().audioMb} MB.` }) : next())), wrap(async (req, res) => {
    const f = req.file; if (!f) throw new UserError('Choose a sound file to upload.');
    try {
      if (!looksLike('audio', f.path)) throw new UserError('That does not look like a sound file. Use MP3, WAV or M4A.');
      if (!text(req.body.licence, 300).trim()) throw new UserError('Add the licence for this track (where it comes from and what it allows).');
      needFfmpeg(); const info = await probe(f.path); if (!info?.hasAudio) throw new UserError('That sound file could not be read.');
      if (info.duration > 20 * 60) throw new UserError('Tracks can be up to 20 minutes long.');
      const { track } = addTrack(fs.readFileSync(f.path), f.originalname, { ...req.body, duration: info.duration });
      res.json({ track: trackView(track) });
    } finally { fs.rmSync(f.path, { force: true }); }
  }));
  app.delete('/api/admin/music/:tid', requireUser, requireAdmin, musicGate, (req, res) => {
    const t = db.tracks.find((x) => x.id === req.params.tid); if (!t) return res.status(404).json({ error: 'That track no longer exists.' });
    const used = db.vprojects.filter((p) => p.music?.trackId === t.id).length;
    if (used && req.query.force !== '1') return res.status(409).json({ error: `${used} project${used > 1 ? 's use' : ' uses'} this track. Delete it anyway?`, code: 'in_use', used });
    for (const p of db.vprojects) if (p.music?.trackId === t.id) p.music = null;
    const f = trackFile(t); if (f) { try { fs.rmSync(locate(f), { force: true }); forget(locate(f)); } catch { /* gone */ } db.files = db.files.filter((x) => x !== f); }
    db.tracks = db.tracks.filter((x) => x !== t); save(); res.json({ ok: true });
  });
}
export { SAMPLE_RATE, DATA_DIR, userProject, userFile, ensureProbed, view, MOODS, fileMap };
