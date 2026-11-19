// Downloads, storage usage, video posters and preview copies, and the job routes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import db, { save, id, now } from './db.js';
import { bucketUrl, forget, locate, hasBytes, signDownload, readDownloadToken, downloadName, contentDisposition, usage, limits, keys, abs, remove, sizeOf, DOWNLOAD_TTL, MB } from './storage.js';
import { ffmpegInfo, probe, makePoster, makeProxy } from './ffmpeg.js';
import { defineJob, enqueue, getJob, listJobs, cancelJob, publicJob, jobStats } from './jobs.js';
import { streamZip, zipSize, ZIP_MAX_BYTES, ZIP_MAX_FILES } from './zipstream.js';
import { mediaHooks, UserError } from './generate.js';

const userFile = (userId, fid) => db.files.find((f) => f.id === fid && f.userId === userId) || null;
const titleOf = (rec) => { const g = rec.generationId && db.generations.find((x) => x.id === rec.generationId); return g?.displayPrompt || g?.originalPrompt || rec.prompt || ''; };
export const nameFor = (rec) => downloadName(rec, rec.kind === 'generated' ? { title: titleOf(rec) } : {});

// ---------- poster + 480p preview copy for every stored video ----------
defineJob('derive', async (job, { signal, progress }) => {
  const rec = db.files.find((f) => f.id === job.payload.fileId);
  if (!rec || !hasBytes(rec)) return { skipped: 'file is gone' };
  const src = locate(rec);
  const info = await probe(src, { signal });
  if (!info) { rec.unreadable = true; save(); throw Object.assign(new Error('This file could not be read as a video or sound file.'), { retry: false }); }
  Object.assign(rec, { duration: info.duration, hasAudio: info.hasAudio });
  if (info.hasVideo) Object.assign(rec, { w: info.width, h: info.height, fps: info.fps });
  save(); progress(0.2, 'Reading the file');
  if (info.hasVideo) {
    const posterKey = keys.derived(rec.userId, rec.id, 'poster.jpg');
    await makePoster(src, abs(posterKey), { at: Math.min(0.5, info.duration / 2), signal });
    rec.posterKey = posterKey; save(); progress(0.4, 'Poster ready');
    if (job.payload.proxy !== false) {
      const proxyKey = keys.derived(rec.userId, rec.id, 'proxy.mp4');
      await makeProxy(src, abs(proxyKey), { signal });
      rec.proxyKey = proxyKey;
    }
    rec.derivedBytes = sizeOf(posterKey) + (rec.proxyKey ? sizeOf(rec.proxyKey) : 0); save();
  }
  return { duration: info.duration, poster: !!rec.posterKey, proxy: !!rec.proxyKey };
}, { maxAttempts: 2, timeoutMs: 20 * 60 * 1000, backoffMs: 3000 });

export function deriveLater(rec, opts = {}) {
  if (!rec || !ffmpegInfo().ok || rec.remoteUrl) return null;
  if (!/^(video|audio)\//.test(rec.mime || '')) return null;
  return enqueue({ type: 'derive', userId: rec.userId, payload: { fileId: rec.id, ...opts }, idempotencyKey: 'derive:' + rec.id, priority: -1 }).job;
}
mediaHooks.videoSaved = (rec) => { try { deriveLater(rec); } catch (e) { console.warn('[derive]', e.message); } };

// ---------- removing a stored file with everything made from it ----------
export function removeStored(rec) {
  if (rec.key) remove(rec.key); else { const p = locate(rec); if (p) { fs.rmSync(p, { force: true }); forget(p); } }
  if (rec.posterKey) remove(rec.posterKey);
  if (rec.proxyKey) remove(rec.proxyKey);
}
// Optional clean-up, off unless RETENTION_DAYS is set: generated files older than that are removed from storage and Assets.
export function sweepRetention() {
  const days = limits().retentionDays; if (!days) return 0;
  const cut = new Date(Date.now() - days * 86400000).toISOString(); let n = 0;
  const gone = new Set();
  db.files = db.files.filter((f) => { if (f.kind !== 'generated' || f.keep || f.createdAt > cut) return true; removeStored(f); gone.add(f.id); n++; return false; });
  if (n) { for (const g of db.generations) if (g.media?.length && g.media.every((m) => gone.has(m.id))) g.hidden = true; save(); console.log(`[storage] retention: removed ${n} file(s) older than ${days} days`); }
  return n;
}

const zipSets = new Map(); // short-lived "download selected" sets

export function mountDownloads(app, { requireUser, wrap }) {
  const send = (res, req, file, { name, mime, inline = false }) => {
    const remote = bucketUrl(file, { name, mime, inline }); // served by the bucket when it holds a copy
    if (remote) { res.setHeader('Cache-Control', 'private, max-age=600'); return res.redirect(302, remote); }
    res.setHeader('Content-Disposition', contentDisposition(name, inline));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.type(mime).sendFile(file, { acceptRanges: true, dotfiles: 'allow' }, (err) => { if (err && !res.headersSent) res.status(err.status || 404).end(); });
  };

  // Poster and preview copy (signed-in owner only).
  app.get(['/api/media/:id/poster', '/api/files/:id/poster'], requireUser, (req, res) => {
    const rec = userFile(req.user.id, req.params.id);
    if (!rec?.posterKey) return res.status(404).end();
    send(res, req, abs(rec.posterKey), { name: 'poster.jpg', mime: 'image/jpeg', inline: true });
  });
  app.get(['/api/media/:id/proxy', '/api/files/:id/proxy'], requireUser, (req, res) => {
    const rec = userFile(req.user.id, req.params.id);
    if (!rec) return res.status(404).end();
    if (rec.proxyKey) return send(res, req, abs(rec.proxyKey), { name: 'preview.mp4', mime: 'video/mp4', inline: true });
    if (!hasBytes(rec)) return rec.remoteUrl ? res.redirect(rec.remoteUrl) : res.status(404).end();
    send(res, req, locate(rec), { name: nameFor(rec), mime: rec.mime, inline: true }); // no preview copy yet: the file itself
  });

  // Signed links: each works for a limited time and downloads with a readable name.
  app.post('/api/downloads/link', requireUser, wrap(async (req, res) => {
    const ids = [].concat(req.body.ids || req.body.id || []).map(String).slice(0, 200);
    const links = [];
    for (const fid of ids) {
      const rec = userFile(req.user.id, fid); if (!rec) continue;
      if (!hasBytes(rec)) { if (rec.remoteUrl) links.push({ id: fid, url: rec.remoteUrl, name: nameFor(rec), remote: true }); continue; }
      links.push({ id: fid, url: `/api/dl/${signDownload(fid)}`, name: nameFor(rec), size: rec.size, expiresIn: DOWNLOAD_TTL() });
    }
    if (!links.length) throw new UserError('That file is no longer available.', 404);
    res.json({ links });
  }));
  app.get('/api/dl/:token', (req, res) => {
    const t = readDownloadToken(req.params.token);
    if (!t) return res.status(410).type('text/plain').send('This download link has expired. Go back to Scenly and press Download again.');
    const rec = db.files.find((f) => f.id === t.fileId);
    if (!rec || !hasBytes(rec)) return res.status(404).type('text/plain').send('This file is no longer available.');
    send(res, req, locate(rec), { name: nameFor(rec), mime: rec.mime || 'application/octet-stream', inline: req.query.inline === '1' });
  });

  // Download selected: one ZIP, written as a stream.
  app.post('/api/downloads/zip', requireUser, wrap(async (req, res) => {
    const ids = [...new Set([].concat(req.body.ids || []).map(String))];
    if (!ids.length) throw new UserError('Pick at least one file first.');
    if (ids.length > ZIP_MAX_FILES) throw new UserError(`You can download up to ${ZIP_MAX_FILES} files at once.`);
    const entries = []; const used = new Set(); let skipped = 0;
    for (const fid of ids) {
      const rec = userFile(req.user.id, fid);
      if (!rec || !hasBytes(rec)) { skipped++; continue; }
      let name = nameFor(rec); const ext = path.extname(name); const stem = name.slice(0, name.length - ext.length);
      for (let i = 2; used.has(name.toLowerCase()); i++) name = `${stem}-${i}${ext}`;
      used.add(name.toLowerCase());
      const p = locate(rec); entries.push({ name, path: p, size: fs.statSync(p).size });
    }
    if (!entries.length) throw new UserError('None of those files are stored in Scenly any more.', 404);
    const size = zipSize(entries);
    if (size > ZIP_MAX_BYTES) throw new UserError('That is more than 4 GB in one go. Please download it in two or more parts.');
    const zid = id('z_'); const name = `scenly-${entries.length}-files-${new Date().toISOString().slice(0, 10)}.zip`;
    zipSets.set(zid, { userId: req.user.id, entries, name, size, expires: Date.now() + DOWNLOAD_TTL() * 1000 });
    for (const [k, v] of zipSets) if (v.expires < Date.now()) zipSets.delete(k);
    res.json({ url: `/api/dlzip/${signDownload(zid)}`, name, size, count: entries.length, skipped, expiresIn: DOWNLOAD_TTL() });
  }));
  app.get('/api/dlzip/:token', async (req, res) => {
    const t = readDownloadToken(req.params.token); const set = t && zipSets.get(t.fileId);
    if (!set || set.expires < Date.now()) return res.status(410).type('text/plain').send('This download link has expired. Go back to Scenly and press Download selected again.');
    res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', contentDisposition(set.name)); res.setHeader('Content-Length', String(set.size)); res.setHeader('Cache-Control', 'no-store');
    const ac = new AbortController(); res.on('close', () => ac.abort());
    try { await streamZip(res, set.entries, { signal: ac.signal }); res.end(); } catch (e) { if (e.message !== 'aborted') console.warn('[zip]', e.message); res.destroy(); }
  });

  app.get('/api/storage/usage', requireUser, (req, res) => {
    const L = limits();
    res.json({ ...usage(req.user.id), limits: { imageMb: L.imageMb, videoMb: L.videoMb, audioMb: L.audioMb, fileMb: L.fileMb }, retentionDays: L.retentionDays });
  });

  // Jobs: status, list of what is still working, stop.
  app.get('/api/jobs', requireUser, (req, res) => res.json({ jobs: listJobs(req.user.id, (j) => j.type !== 'derive' && (['queued', 'running', 'retrying'].includes(j.status) || Date.parse(j.endedAt || 0) > Date.now() - 3600000)).map(publicJob) }));
  app.get('/api/jobs/:id', requireUser, (req, res) => { const j = getJob(req.params.id, req.user.id); if (!j) return res.status(404).json({ error: 'That job no longer exists.' }); res.json({ job: publicJob(j) }); });
  app.post('/api/jobs/:id/cancel', requireUser, (req, res) => { const j = cancelJob(req.params.id, req.user.id); if (!j) return res.status(404).json({ error: 'That job no longer exists.' }); res.json({ job: publicJob(j) }); });

  if (limits().retentionDays) { setTimeout(sweepRetention, 30000).unref?.(); setInterval(sweepRetention, 12 * 3600000).unref?.(); }
}
export { jobStats, MB };
