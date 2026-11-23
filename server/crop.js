// Crop and download for social sizes. The person places the video in a frame (TikTok, Reels, Shorts, feed ...)
// and this cuts it with ffmpeg on the server. No AI model is used, so it costs no credits.
//   GET  /api/media/:id/crop-info   size, length and a light preview of a stored video
//   POST /api/media/:id/crop        { preset, shape, mode: 'crop'|'fit', x, y, zoom } -> { ready, url, name } or { job }
//   GET  /api/dlcrop/:token         the cropped file, with a readable name
// Results are kept for a day next to the poster and preview copy, so pressing Download again is instant.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import db, { save } from './db.js';
import { locate, hasBytes, keys, abs, signDownload, readDownloadToken, contentDisposition, DOWNLOAD_TTL } from './storage.js';
import { ffmpeg, ffmpegInfo, probe, FFMPEG_HELP } from './ffmpeg.js';
import { defineJob, enqueue } from './jobs.js';
import { UserError } from './generate.js';
import { plan, filterFor, presetById, shapeById } from './cropplan.js';
import { nameFor } from './downloads.js';

const KEEP_MS = 24 * 3600 * 1000;
const userVideo = (userId, fid) => db.files.find((f) => f.id === fid && f.userId === userId && (f.type === 'video' || /^video\//.test(f.mime || ''))) || null;

async function measure(rec) {
  if (rec.w && rec.h && rec.duration != null && rec.hasAudio != null && rec.cropCodec !== undefined) return rec;
  const info = await probe(locate(rec));
  if (!info?.hasVideo) throw new UserError('This file has no picture to crop.');
  Object.assign(rec, { w: info.width, h: info.height, duration: info.duration, hasAudio: info.hasAudio, cropCodec: info.audioCodec || null }); save();
  return rec;
}
function settings(body) {
  const preset = presetById(String(body.preset || '')); const shape = shapeById(String(body.shape || preset?.shape || ''));
  if (!shape) throw new UserError('Pick a size first.');
  const mode = body.mode === 'fit' ? 'fit' : 'crop';
  const r3 = (v, d) => Math.round((Number.isFinite(Number(v)) ? Number(v) : d) * 1000) / 1000;
  return { preset: preset && preset.shape === shape.id ? preset.id : null, shape: shape.id, mode, x: r3(body.x, 0.5), y: r3(body.y, 0.5), zoom: mode === 'fit' ? 1 : r3(body.zoom, 1) };
}
const hashOf = (rec, s) => crypto.createHash('sha1').update(JSON.stringify([rec.id, rec.size || 0, s.shape, s.mode, s.x, s.y, s.zoom])).digest('hex').slice(0, 16);
const outKey = (rec, hash) => keys.derived(rec.userId, rec.id, `crop-${hash}.mp4`);
function cropName(rec, s) {
  const base = nameFor(rec).replace(/\.[a-z0-9]+$/i, '');
  const tag = (s.preset || 'crop') + '-' + s.shape;
  return `${base}_${tag}${s.mode === 'fit' ? '-fit' : ''}.mp4`;
}
// Old crops of this video are removed, so they never pile up.
function tidy(rec, keepFile) {
  try {
    const dir = path.dirname(abs(keys.derived(rec.userId, rec.id, 'x')));
    for (const f of fs.readdirSync(dir)) {
      if (!/^crop-.*\.mp4(\.part)?$/.test(f)) continue; const p = path.join(dir, f);
      if (p !== keepFile && Date.now() - fs.statSync(p).mtimeMs > KEEP_MS) fs.rmSync(p, { force: true });
    }
  } catch { /* nothing stored yet */ }
}
const linkFor = (rec, s, hash) => {
  const file = abs(outKey(rec, hash));
  return { ready: true, url: `/api/dlcrop/${signDownload(rec.id, { variant: hash + '.' + (s.preset || '') + '.' + s.shape + '.' + s.mode })}`, name: cropName(rec, s), size: fs.statSync(file).size, expiresIn: DOWNLOAD_TTL() };
};

defineJob('crop', async (job, { signal, progress }) => {
  const rec = db.files.find((f) => f.id === job.payload.fileId);
  if (!rec || !hasBytes(rec)) throw Object.assign(new Error('This video is no longer available.'), { retry: false });
  const s = job.payload.settings; const hash = job.payload.hash;
  const p = plan({ srcW: rec.w, srcH: rec.h, ...s }); const f = filterFor(p);
  const out = abs(outKey(rec, hash)); fs.mkdirSync(path.dirname(out), { recursive: true });
  const dur = Number(rec.duration) || 0;
  const onStderr = (t) => { const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t); if (m && dur) progress(Math.min(0.99, (+m[1] * 3600 + +m[2] * 60 + +m[3]) / dur), 'Cropping'); };
  const audio = rec.hasAudio ? ['-map', '0:a:0?', ...(rec.cropCodec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000'])] : ['-an'];
  const video = f.complex ? ['-filter_complex', f.complex, '-map', '[v]'] : ['-vf', f.vf, '-map', '0:v:0'];
  await ffmpeg(['-i', locate(rec), ...video, ...audio, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-f', 'mp4', out + '.part'], { timeoutMs: 20 * 60 * 1000, signal, onStderr });
  fs.renameSync(out + '.part', out);
  tidy(rec, out);
  return { hash, width: p.outW, height: p.outH, bytes: fs.statSync(out).size };
}, { maxAttempts: 1, timeoutMs: 25 * 60 * 1000, maxPerUser: 2 });

export function mountCrop(app, { requireUser, wrap }) {
  app.get('/api/media/:id/crop-info', requireUser, wrap(async (req, res) => {
    const rec = userVideo(req.user.id, req.params.id);
    if (!rec) throw new UserError('That video is not available.', 404);
    if (!hasBytes(rec)) throw new UserError('This video is not stored in Scenly, so it cannot be cropped here. Download it instead.', 409);
    if (!ffmpegInfo().ok) throw Object.assign(new UserError(FFMPEG_HELP, 503), { code: 'ffmpeg_missing' });
    await measure(rec);
    const base = rec.kind === 'generated' ? '/api/media/' : '/api/files/';
    res.json({ id: rec.id, w: rec.w, h: rec.h, duration: rec.duration, hasAudio: !!rec.hasAudio, poster: rec.posterKey ? `${base}${rec.id}/poster` : null, preview: `${base}${rec.id}/proxy`, name: nameFor(rec) });
  }));

  app.post('/api/media/:id/crop', requireUser, wrap(async (req, res) => {
    const rec = userVideo(req.user.id, req.params.id);
    if (!rec) throw new UserError('That video is not available.', 404);
    if (!hasBytes(rec)) throw new UserError('This video is not stored in Scenly, so it cannot be cropped here.', 409);
    if (!ffmpegInfo().ok) throw Object.assign(new UserError(FFMPEG_HELP, 503), { code: 'ffmpeg_missing' });
    await measure(rec);
    const s = settings(req.body || {}); const hash = hashOf(rec, s);
    if (fs.existsSync(abs(outKey(rec, hash)))) return res.json(linkFor(rec, s, hash)); // the same crop was made already
    // One running crop per setting: a second press joins it. A crop that failed or was stopped starts again.
    const running = db.jobs.find((j) => j.userId === req.user.id && j.type === 'crop' && j.payload?.hash === hash && ['queued', 'running', 'retrying'].includes(j.status));
    const job = running || enqueue({ type: 'crop', userId: req.user.id, payload: { fileId: rec.id, settings: s, hash }, priority: 1 }).job;
    res.json({ job: { id: job.id, status: job.status, progress: job.progress || 0 }, plan: plan({ srcW: rec.w, srcH: rec.h, ...s }) });
  }));

  app.get('/api/dlcrop/:token', (req, res) => {
    const t = readDownloadToken(req.params.token);
    if (!t) return res.status(410).type('text/plain').send('This download link has expired. Go back to Scenly and press Download again.');
    const [hash, preset, shape, mode] = String(t.variant || '').split('.');
    const rec = db.files.find((f) => f.id === t.fileId);
    if (!rec || !/^[a-f0-9]{16}$/.test(hash || '')) return res.status(404).type('text/plain').send('This file is no longer available.');
    const file = abs(outKey(rec, hash));
    if (!fs.existsSync(file)) return res.status(404).type('text/plain').send('This crop is no longer stored. Go back to Scenly and press Download again.');
    res.setHeader('Content-Disposition', contentDisposition(cropName(rec, { preset: preset || null, shape, mode }), req.query.inline === '1'));
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.type('video/mp4').sendFile(file, { acceptRanges: true, dotfiles: 'allow' }, (err) => { if (err && !res.headersSent) res.status(err.status || 404).end(); });
  });
}
