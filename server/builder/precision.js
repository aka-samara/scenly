// Precision editing: one action on one stretch of time inside one scene.
// The scene is cut into pieces (before, the selected part, after). AI actions put a new version on the selected part only,
// and that part keeps the original footage as its first version, so the two can be compared and the length never changes.
// Everything here answers 404 while FEATURE_PRECISION_EDIT is off.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import db, { save, id, now } from '../db.js';
import { flags } from '../flags.js';
import { getCatalog } from '../catalog.js';
import { canAfford, round2 } from '../credits.js';
import { keys, put, putFile, locate, hasBytes } from '../storage.js';
import { ffmpeg, needFfmpeg } from '../ffmpeg.js';
import { UserError, publicFileUrl } from '../generate.js';
import { layout, curVersion, sceneSource, cleanCaptions, dims, MAX_SCENES, MAX_PROJECT_SEC } from './plan.js';
import { userProject, view, fileMap, startScenes } from './routes.js';

const r3 = (n) => Math.round(n * 1000) / 1000;
const text = (v, max) => String(v ?? '').replace(/\u0000/g, '').slice(0, max);
const MIN_PIECE = 0.3; // a piece shorter than this is not left behind: the cut moves to the edge of the scene
const ACTIONS = ['split', 'delete', 'mute', 'freeze', 'retake', 'fill', 'change', 'extend', 'card'];
const AI = ['retake', 'fill', 'change', 'extend'];

const imageRec = (userId, name, buf, mime = 'image/jpeg') => {
  const rec = { id: id('f_'), userId, name, size: buf.length, mime, kind: 'image', derived: true, pictureOk: true, builderMade: true, createdAt: now() };
  rec.key = put(keys.upload(userId, 'image', rec.id, mime === 'image/png' ? 'png' : 'jpg'), buf); db.files.push(rec); return rec;
};
// One frame of a video, kept as a picture of the user's own.
async function frameFile(userId, src, at, name) {
  if (src.kind === 'image') return src;
  const out = path.join(os.tmpdir(), `fr-${id()}.jpg`); const t = Math.max(0, Math.min(at, (src.duration || at) - 0.12));
  try {
    await ffmpeg(['-ss', String(r3(t)), '-i', locate(src), '-frames:v', '1', '-update', '1', '-q:v', '2', out], { timeoutMs: 60000 });
    if (!fs.existsSync(out) || !fs.statSync(out).size) throw new Error('no frame');
    return imageRec(userId, name, fs.readFileSync(out));
  } catch { throw new UserError('That moment of the video could not be read. Move the selection a little and try again.', 422); } finally { fs.rmSync(out, { force: true }); }
}
// A stretch of a video as its own small file, for a model that edits video.
async function cutFile(userId, src, from, len) {
  const out = path.join(os.tmpdir(), `cut-${id()}.mp4`);
  try {
    await ffmpeg(['-ss', String(r3(from)), '-t', String(r3(len)), '-i', locate(src), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', out], { timeoutMs: 180000 });
    const rec = { id: id('f_'), userId, name: 'part.mp4', size: fs.statSync(out).size, mime: 'video/mp4', kind: 'video', derived: true, builderMade: true, duration: len, hasAudio: src.hasAudio !== false, createdAt: now() };
    rec.key = putFile(keys.upload(userId, 'video', rec.id, 'mp4'), out, { move: true }); db.files.push(rec); return rec;
  } catch (e) { if (e instanceof UserError) throw e; throw new UserError('That part of the video could not be cut out. Try a slightly different selection.', 422); } finally { fs.rmSync(out, { force: true }); }
}
async function cardFile(userId, ratio, resolution) {
  const { w, h } = dims(ratio, resolution); const out = path.join(os.tmpdir(), `card-${id()}.png`);
  try { await ffmpeg(['-f', 'lavfi', '-i', `color=c=0x101014:s=${w}x${h}`, '-frames:v', '1', '-update', '1', out], { timeoutMs: 30000 }); return imageRec(userId, 'End card.png', fs.readFileSync(out), 'image/png'); } finally { fs.rmSync(out, { force: true }); }
}

export function mountPrecision(app, { requireUser, wrap }) {
  const gate = (req, res, next) => (flags().videoBuilder && flags().precisionEdit ? next() : res.status(404).json({ error: 'Precision editing is switched off.', code: 'feature_off' }));

  app.post('/api/builder/projects/:id/range', requireUser, gate, wrap(async (req, res) => {
    const p = userProject(req.user.id, req.params.id); if (!p) throw new UserError('That video project no longer exists.', 404);
    const b = req.body || {}; const action = ACTIONS.includes(b.action) ? b.action : null; if (!action) throw new UserError('That action is not known.');
    if (b.rev != null && Number(b.rev) !== p.rev) return res.status(409).json({ error: 'This project changed a moment ago (a scene just finished, or it is open in another tab). The newest version is shown now. Please try again.', code: 'stale', ...(await view(p)) });
    needFfmpeg();
    const files = fileMap(p); const lay = layout(p, files); const userId = req.user.id;
    const finish = async (extra = {}) => { p.updatedAt = now(); p.rev = (p.rev || 0) + 1; save(); res.json({ ...(await view(p)), credits: round2(req.user.credits), ...extra }); };

    // An end card is a new last scene: a plain dark picture with a title in the middle.
    if (action === 'card') {
      const words = text(b.text, 200).trim(); if (!words) throw new UserError('Write the words for the end card.');
      if (p.scenes.length >= MAX_SCENES) throw new UserError(`A project can hold up to ${MAX_SCENES} scenes.`);
      const seconds = Math.max(1, Math.min(15, Number(b.seconds) || 3)); const pic = await cardFile(userId, p.ratio, p.resolution);
      const sc = { id: id('sc_'), type: 'image', fileId: pic.id, duration: seconds, transition: 'cut', fit: 'pad' }; p.scenes.push(sc);
      const row = layout(p, fileMap(p)).rows.at(-1);
      p.captions = cleanCaptions([...(p.captions || []), { start: r3(row.start + 0.2), end: r3(row.start + row.seconds), text: words, pos: 'middle' }], MAX_PROJECT_SEC);
      return finish({ sceneId: sc.id });
    }

    const i = p.scenes.findIndex((s) => s.id === b.sceneId); const s = p.scenes[i]; const row = lay.rows[i];
    if (!s) throw new UserError('That scene is no longer there. Select the part again.');
    if (s.locked) throw new UserError(`Scene ${i + 1} is locked. Unlock it first.`);
    if (s.status === 'generating') throw new UserError('This scene is being generated. Wait until it is ready, or stop it first.');
    if (s.reverse) throw new UserError('This scene plays backwards. Switch "Play backwards" off before doing this.');
    const src = sceneSource(s, files); const timed = s.type !== 'image' && src && src.kind !== 'image' && hasBytes(src); // a scene with real footage
    if (!timed && AI.includes(action) && !(action === 'extend' && s.type === 'image' && src)) throw new UserError(s.type === 'ai' ? 'Generate this scene first. After that you can change a part of it.' : 'This works on video scenes.');
    if (!timed && (action === 'freeze' || action === 'mute')) throw new UserError('This works on video scenes.');

    // where the selection lies inside the scene, in seconds as seen on the timeline
    const sec = row.seconds; let a = Math.max(0, Math.min(sec, (Number(b.from) || 0) - row.start)); let z = Math.max(0, Math.min(sec, (b.to != null ? Number(b.to) : Number(b.from) || 0) - row.start));
    const point = ['split', 'freeze', 'extend'].includes(action); if (point) a = z = action === 'extend' ? z : a;
    if (a < MIN_PIECE) a = 0; if (sec - z < MIN_PIECE) z = sec; if (point) { if (action === 'extend') a = z; else z = a; }
    if (action === 'split' && (a <= 0 || a >= sec)) throw new UserError('Move the playhead further inside the scene, then split.');
    if (!point && z - a < (AI.includes(action) ? 0.5 : 0.2)) throw new UserError(AI.includes(action) ? 'Select at least half a second.' : 'Select a longer part.');
    const speed = row.speed || 1; const at = (t) => r3(row.trimIn + t * speed); // timeline seconds inside the scene -> seconds of the source file
    const count = p.scenes.length - 1 + (a > 0 ? 1 : 0) + (z < sec ? 1 : 0) + (point && action !== 'split' ? 1 : 0) + (!point && action !== 'delete' ? 1 : 0);
    if (count > MAX_SCENES) throw new UserError(`A project can hold up to ${MAX_SCENES} scenes.`);

    // a piece of the scene: the same scene, showing only its stretch
    const piece = (t0, t1) => {
      const c = { ...JSON.parse(JSON.stringify(s)), id: id('sc_'), locked: false, transition: 'cut', jobId: undefined, error: undefined, holdCredits: undefined };
      if (!timed) { c.duration = Math.max(0.5, r3(t1 - t0)); return c; }
      const v = curVersion(s);
      if (v && v.tin != null) { c.versions = [{ ...v, tin: at(t0), tout: at(t1) }]; c.cur = 0; c.rangeLen = r3(at(t1) - at(t0)); c.duration = Math.max(1, c.rangeLen); delete c.trimIn; delete c.trimOut; }
      else { c.trimIn = at(t0); c.trimOut = at(t1); }
      return c;
    };
    const left = a > 0 ? piece(0, a) : null; const right = z < sec ? piece(z, sec) : null; let mid = null; let edit = null; let start = null;
    const prompt = text(b.prompt, 4000).trim();
    if (action === 'mute') { mid = piece(a, z); mid.volume = 0; }
    else if (action === 'freeze') {
      const pic = await frameFile(userId, src, at(a), `Still from scene ${i + 1}.jpg`);
      mid = { id: id('sc_'), type: 'image', fileId: pic.id, duration: Math.max(0.5, Math.min(10, Number(b.seconds) || 2)), transition: 'cut', fit: s.fit === 'crop' ? 'crop' : 'pad' };
    } else if (action === 'extend') {
      const pic = await frameFile(userId, src, at(a), `Frame from scene ${i + 1}.jpg`);
      mid = { id: id('sc_'), type: 'ai', prompt, duration: Math.max(1, Math.min(60, Math.round(Number(b.seconds) || 5))), modelId: b.modelId ? text(b.modelId, 80) : s.modelId, continuity: false, refFileId: pic.id, versions: [], cur: 0, status: 'draft', transition: 'cut', fit: s.fit === 'crop' ? 'crop' : 'pad', narration: '', trimIn: 0 };
      start = { scene: mid };
    } else if (['retake', 'fill', 'change'].includes(action)) {
      const from = at(a), to = at(z); const len = r3(to - from);
      mid = { id: id('sc_'), type: 'ai', prompt, duration: Math.max(1, Math.round(len * 100) / 100), rangeLen: len, rangeKind: action, modelId: action === 'change' ? undefined : b.modelId ? text(b.modelId, 80) : s.type === 'ai' ? s.modelId : undefined, continuity: false,
        versions: [{ fileId: src.id, at: now(), tin: from, tout: to, original: true }], cur: 0, status: 'done', transition: 'cut', fit: s.fit === 'crop' ? 'crop' : 'pad', narration: '', trimIn: 0 };
      if (s.volume != null) mid.volume = s.volume; if (s.speed) mid.speed = s.speed;
      if (action === 'change') {
        if (!publicFileUrl({ id: 'x' })) throw new UserError('"Change it" sends this part of your video to the video service, which has to download it. That needs the app to run at a public https address, so it works once the app is published. Until then, use Retake.');
        const models = (await getCatalog()).filter((m) => m.type === 'video' && m.video.tasks.includes('edit'));
        const model = models.find((m) => m.id === b.modelId) || models.find((m) => m.video.resolutions.includes(p.resolution)) || models[0];
        if (!model) throw new UserError('No model that can change an existing video is available right now. Use Retake instead.');
        edit = { modelId: model.id };
      }
      start = { scene: mid };
    }
    const parts = [left, mid, right].filter(Boolean);
    if (parts.length) parts[parts.length - 1].transition = s.transition || 'cut';
    const scenes = [...p.scenes.slice(0, i), ...parts, ...p.scenes.slice(i + 1)];

    // AI actions: everything is checked and priced before the project is touched
    if (start) {
      const dry = await startScenes(req.user, { ...p, scenes }, [start.scene], { edit, dryRun: true });
      if (!canAfford(req.user, dry.total)) throw new UserError(`Not enough credits. This needs about ${Math.ceil(dry.total)} credits and you have ${Math.floor(req.user.credits)}.`, 402, 'insufficient_credits');
      if (action === 'retake') mid.refFileId = (await frameFile(userId, src, at(a), `Frame from scene ${i + 1}.jpg`)).id; // the retake starts from the picture at the start of the selection
      if (action === 'change') edit.fileId = (await cutFile(userId, src, at(a), mid.rangeLen)).id;
    }
    p.scenes = scenes;
    // the scene as it was stays in the bin, so Undo brings it back with every clip that was paid for
    if (s.type === 'ai' && s.versions?.length) p.bin = [s, ...(p.bin || []).filter((x) => x.id !== s.id)].slice(0, 40);
    let started = 0;
    if (start) { const r = await startScenes(req.user, p, [start.scene], { idem: typeof b.idem === 'string' && b.idem.length >= 8 ? b.idem.slice(0, 80) : undefined, edit }); started = r.jobs.length; }
    return finish({ sceneId: (mid || right || left || p.scenes[Math.min(i, p.scenes.length - 1)])?.id || null, started });
  }));
}
