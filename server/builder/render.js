// Video Builder: assembly and export. Every clip is first made into parts of one exact format
// (H.264, yuv420p, 30 fps, same size; sound as 48 kHz WAV), so joining them can never fail.
// Parts are kept in a cache, so exporting again after a small change only redoes what changed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '../db.js';
import { abs, locate } from '../storage.js';
import { ffmpeg, probe, needFfmpeg } from '../ffmpeg.js';
import { finishArgs } from './vnewdoc.js';
import { layout, pieces, dims, pieceArgs, xfadeArgs, concatList, concatArgs, loopMusicArgs, mixArgs, toSrt, burnArgs, cleanCaptions, MAX_PROJECT_SEC, MAX_REVERSE_SEC } from './plan.js';

const TMP = path.join(DATA_DIR, 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const sha = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 24);
export class RenderError extends Error { constructor(message, status = 400) { super(message); this.status = status; this.retry = false; this.expose = true; } }

async function pool(items, size, fn) {
  let i = 0; const out = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const fileSig = (p) => { const st = fs.statSync(p); return `${p}:${st.size}:${Math.round(st.mtimeMs)}`; };

// Removes cached parts that have not been used for a week.
function pruneCache(dir) {
  try { const cut = Date.now() - 7 * 86400000; for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).atimeMs < cut && fs.statSync(p).mtimeMs < cut) fs.rmSync(p, { force: true }); } } catch { /* nothing to clean */ }
}

// project: the saved project. files: Map of file id -> db row. Returns { file, seconds, width, height, bytes } (file is in a temp folder; the caller stores it).
export async function renderProject(project, files, { resolution, burnCaptions = false, audioOnly = false, signal, progress = () => {}, parallel = 2 } = {}) {
  needFfmpeg();
  if (!project.scenes.length) throw new RenderError('Add at least one scene first.');
  const lay = layout(project, files);
  const missing = lay.rows.findIndex((r) => !r.ready || !locate(r.src) || !fs.existsSync(locate(r.src)));
  if (missing >= 0) throw new RenderError(`Scene ${missing + 1} has no video yet. Generate it, replace it or remove it, then export again.`);
  if (lay.seconds > MAX_PROJECT_SEC) throw new RenderError(`This video is ${Math.round(lay.seconds / 60)} minutes long. The limit is ${MAX_PROJECT_SEC / 60} minutes.`);
  const { w, h } = dims(project.ratio, resolution || project.resolution);
  const cacheDir = abs(`users/${project.userId}/projects/${project.id}/cache/x`).slice(0, -2); fs.mkdirSync(cacheDir, { recursive: true }); pruneCache(cacheDir);
  const work = path.join(TMP, 'render-' + crypto.randomBytes(6).toString('hex')); fs.mkdirSync(work, { recursive: true });
  const step = (() => { let done = 0; let total = 1; return { total: (n) => { total = n; }, tick: (note) => { done++; progress(Math.min(0.9, (done / total) * 0.9), note); } }; })();

  const makePart = async (row, part) => {
    const srcPath = locate(row.src);
    const spec = { src: srcPath, type: row.scene.type === 'image' ? 'image' : 'video', hasAudio: row.src.hasAudio !== false && row.scene.type !== 'image', trimIn: row.trimIn, volume: row.volume, fit: row.scene.fit === 'crop' ? 'crop' : 'pad', w, h, speed: row.speed || 1, reverse: !!row.reverse, rowFrames: row.frames };
    if (spec.reverse && row.seconds * spec.speed > MAX_REVERSE_SEC + 0.05) throw new RenderError(`Scene ${lay.rows.indexOf(row) + 1} plays backwards and is longer than ${MAX_REVERSE_SEC} seconds. Shorten it or switch "Play backwards" off.`);
    const key = sha({ v: 5, sig: fileSig(srcPath), ...spec, src: undefined, part });
    const video = path.join(cacheDir, key + '.mp4'); const audio = path.join(cacheDir, key + '.wav');
    if (!(fs.existsSync(video) && fs.existsSync(audio))) {
      const tv = path.join(work, key + '.mp4'); const ta = path.join(work, key + '.wav');
      const n = lay.rows.indexOf(row) + 1; const limit = Math.max(3 * 60 * 1000, (row.seconds || 5) * 20000); // a piece that takes this long is stuck, not slow
      try { await ffmpeg(pieceArgs(spec, part, tv, ta), { signal, timeoutMs: limit }); } catch (e) {
        if (e.detail === 'aborted') throw e;
        if (e.detail === 'timeout') throw new RenderError(`Scene ${n} could not be read (the file seems damaged). Replace it and export again.`);
        // A clip that says it has sound but does not: make the part again with silence.
        if (spec.hasAudio) await ffmpeg(pieceArgs({ ...spec, hasAudio: false }, part, tv, ta), { signal, timeoutMs: 10 * 60 * 1000 }); else throw new RenderError(`Scene ${lay.rows.indexOf(row) + 1} could not be read. Replace that clip and export again.`, 422);
      }
      fs.renameSync(tv, video); fs.renameSync(ta, audio);
    } else { const t = new Date(); try { fs.utimesSync(video, t, t); fs.utimesSync(audio, t, t); } catch { /* cache time is only a hint */ } }
    return { video, audio };
  };

  try {
    const list = pieces(lay).filter((p) => p.frames > 0);
    step.total(list.length + 3);
    const made = await pool(list, parallel, async (p) => {
      let out;
      if (p.kind === 'body') out = await makePart(lay.rows[p.row], { from: p.from, frames: p.frames, fadeIn: p.fadeIn, fadeOut: p.fadeOut });
      else {
        const a = await makePart(lay.rows[p.a.row], { from: p.a.from, frames: p.a.frames, fadeIn: 0, fadeOut: 0 });
        const b = await makePart(lay.rows[p.b.row], { from: p.b.from, frames: p.b.frames, fadeIn: 0, fadeOut: 0 });
        const key = sha({ v: 3, x: [a.video, b.video, fileSig(a.video), fileSig(b.video)], f: p.frames });
        out = { video: path.join(cacheDir, key + '.mp4'), audio: path.join(cacheDir, key + '.wav') };
        if (!(fs.existsSync(out.video) && fs.existsSync(out.audio))) { const tv = path.join(work, key + '.mp4'); const ta = path.join(work, key + '.wav'); await ffmpeg(xfadeArgs(a, b, p.frames, tv, ta), { signal }); fs.renameSync(tv, out.video); fs.renameSync(ta, out.audio); }
      }
      step.tick(`Preparing scene ${p.row + 1} of ${lay.rows.length}`);
      return out;
    });
    // Join: the parts are identical in format, so this is a plain copy.
    const vlist = path.join(work, 'v.txt'); const alist = path.join(work, 'a.txt');
    fs.writeFileSync(vlist, concatList(made.map((m) => m.video))); fs.writeFileSync(alist, concatList(made.map((m) => m.audio)));
    const joined = path.join(work, 'joined.mp4'); const scenesWav = path.join(work, 'scenes.wav');
    if (!audioOnly) await ffmpeg(concatArgs(vlist, joined), { signal });
    await ffmpeg(concatArgs(alist, scenesWav, { audio: true }), { signal });
    step.tick('Joining the scenes');
    // Voice-over and music
    const tracks = { scenes: scenesWav };
    const track = (t) => { const rec = t?.fileId && files.get(t.fileId); const p = rec && locate(rec); return p && fs.existsSync(p) ? { rec, path: p } : null; };
    const voice = track(project.voice); if (voice) tracks.voice = { path: voice.path, volume: project.voice.volume ?? 1, offset: project.voice.offset || 0, fadeIn: project.voice.fadeIn, fadeOut: project.voice.fadeOut, duration: files.get(project.voice.fileId)?.duration || 0 };
    const music = track(project.music);
    if (music) {
      let mpath = music.path; const msec = Number(music.rec.duration) || (await probe(music.path, { signal }))?.duration || 0;
      if (project.music.fit !== false && msec > 1 && msec < lay.seconds - 0.25) {
        const key = sha({ v: 1, loop: fileSig(music.path), total: Math.ceil(lay.seconds) }); mpath = path.join(cacheDir, key + '.wav');
        if (!fs.existsSync(mpath)) { const t = path.join(work, key + '.wav'); await ffmpeg(loopMusicArgs(music.path, msec, lay.seconds, t).args, { signal }); fs.renameSync(t, mpath); }
      }
      tracks.music = { path: mpath, volume: project.music.volume ?? 0.5, duck: project.music.duck !== false, duckDb: project.music.duckDb || 12, fadeIn: project.music.fadeIn, fadeOut: project.music.fadeOut };
    }
    let out = path.join(work, audioOnly ? 'audio.m4a' : 'final.mp4');
    await ffmpeg(mixArgs(joined, tracks, lay.seconds, out, { audioOnly }), { signal, timeoutMs: 20 * 60 * 1000 });
    step.tick('Mixing the sound');
    const caps = cleanCaptions(project.captions, lay.seconds);
    if (!audioOnly && burnCaptions && caps.length) {
      fs.writeFileSync(path.join(work, 'subs.srt'), toSrt(caps, lay.seconds, { overlays: true }));
      const burned = path.join(work, 'final-captions.mp4');
      await ffmpeg(burnArgs('final.mp4', 'subs.srt', project.captionStyle, 'final-captions.mp4'), { signal, cwd: work, timeoutMs: 30 * 60 * 1000 });
      out = burned;
    }
    // Video (new): the look and the logo in a corner, added last so changing them never remakes a scene.
    if (!audioOnly && project.vnew) {
      const lf = project.vnew.brand?.logoFileId && files.get(project.vnew.brand.logoFileId); const logoPath = lf && locate(lf);
      const fin = path.join(work, 'final-finish.mp4'); const args = finishArgs(project, out, fin, logoPath && fs.existsSync(logoPath) ? logoPath : null);
      if (args) { await ffmpeg(args, { signal, timeoutMs: 30 * 60 * 1000 }); out = fin; }
    }
    step.tick('Finishing');
    const info = await probe(out, { signal });
    if (!info || Math.abs(info.duration - lay.seconds) > 0.35) throw Object.assign(new Error(`export length check failed: got ${info?.duration}, expected ${lay.seconds}`), { retry: true });
    return { file: out, work, seconds: lay.seconds, measured: info.duration, width: audioOnly ? 0 : info.width, height: audioOnly ? 0 : info.height, bytes: fs.statSync(out).size, scenes: lay.rows.length, burned: fs.existsSync(path.join(work, 'final-captions.mp4')) };
  } catch (e) { fs.rmSync(work, { recursive: true, force: true }); throw e; }
}
export const cleanWork = (dir) => { if (dir && dir.startsWith(TMP + path.sep)) fs.rmSync(dir, { recursive: true, force: true }); };
