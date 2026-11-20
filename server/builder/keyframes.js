// Preview pictures: a quick, cheap still for an AI scene that has no clip yet.
// The picture becomes the start picture of the scene, so the look can be checked before any video credits are spent,
// and Generate then animates from that picture. Charged like any picture: only when it arrives.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import db, { save, id, now } from '../db.js';
import { flags } from '../flags.js';
import { canAfford, round2, needCredits } from '../credits.js';
import { keys, put, locate } from '../storage.js';
import { ffmpeg, ffmpegInfo } from '../ffmpeg.js';
import { defineJob, enqueue } from '../jobs.js';
import { UserError, runImage } from '../generate.js';
import { RATIOS } from './plan.js';
import { userProject, view, touchProject, keyModel } from './routes.js';

const ACTIVE = ['queued', 'running', 'retrying'];
// The picture size closest to the shape of the video. What does not fit is cut away afterwards.
const sizeFor = (model, ratio) => { const [w, h] = RATIOS[ratio] || [16, 9]; const sizes = model.image?.sizes || []; const want = w > h ? '1536x1024' : w < h ? '1024x1536' : '1024x1024'; return sizes.includes(want) ? want : sizes.includes('1024x1024') ? '1024x1024' : sizes[0]; };
const ask = (prompt, ratio) => `${String(prompt).trim()}\n\nOne still frame: the opening moment of this shot, composed for a ${ratio} frame with the main subject in the middle. No text, no captions, no borders.`;

// Cut the picture to the shape of the video. If that is not possible the picture is used as it came.
async function toShape(buf, ratio) {
  if (!ffmpegInfo().ok) return { buf, mime: 'image/png', ext: 'png' };
  const [w, h] = RATIOS[ratio] || [16, 9]; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-key-')); const src = path.join(dir, 'in.png'), out = path.join(dir, 'out.jpg');
  try {
    fs.writeFileSync(src, buf);
    await ffmpeg(['-i', src, '-vf', `crop='min(iw,ih*${w}/${h})':'min(ih,iw*${h}/${w})'`, '-frames:v', '1', '-update', '1', '-q:v', '2', out], { timeoutMs: 30000 });
    return { buf: fs.readFileSync(out), mime: 'image/jpeg', ext: 'jpg' };
  } catch { return { buf, mime: 'image/png', ext: 'png' }; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

defineJob('keyframe', async (job, { progress }) => {
  const find = () => { const p = db.vprojects.find((x) => x.id === job.payload.projectId); return { p, s: p?.scenes.find((x) => x.id === job.payload.sceneId) }; };
  const { p, s } = find(); const user = db.users.find((u) => u.id === job.userId);
  if (!p || !s || !user) throw Object.assign(new Error('That scene was removed.'), { retry: false });
  progress(0.2, 'Drawing the picture');
  const r = await runImage(user, { modelId: job.payload.modelId, prompt: job.payload.prompt, size: job.payload.size, meta: { builderId: p.id, sceneId: s.id, title: p.title, hiddenFromAssets: true } });
  // From here on the picture is paid for, so nothing below may fail the job.
  const shaped = await toShape(fs.readFileSync(locate(r.media[0])), p.ratio);
  const { p: p2, s: s2 } = find(); const n = p2 && s2 ? p2.scenes.indexOf(s2) + 1 : 0;
  const rec = { id: id('f_'), userId: user.id, name: `Preview of scene ${n || ''}.${shaped.ext}`.replace(' .', '.'), size: shaped.buf.length, mime: shaped.mime, kind: 'image', derived: true, pictureOk: true, builderMade: true, createdAt: now() };
  rec.key = put(keys.upload(user.id, 'image', rec.id, shaped.ext), shaped.buf); db.files.push(rec);
  if (s2 && !s2.versions?.length) { s2.refFileId = rec.id; s2.continuity = false; p2.updatedAt = now(); p2.rev = (p2.rev || 0) + 1; }
  save();
  return { credits: r.credits, fileId: rec.id };
}, { maxAttempts: 2, timeoutMs: 3 * 60 * 1000, backoffMs: 2000, maxPerUser: 3 });

export function mountKeyframes(app, { requireUser, wrap }) {
  const gate = (_req, res, next) => (flags().videoBuilder ? next() : res.status(404).json({ error: 'Not found.' }));
  // { sceneIds?: [...], dryRun?: true }. Without sceneIds: every AI scene that has no clip and no start picture yet.
  app.post('/api/builder/projects/:id/keyframes', requireUser, gate, wrap(async (req, res) => {
    const p = userProject(req.user.id, req.params.id); if (!p) throw new UserError('That video project no longer exists.', 404);
    const model = await keyModel(); if (!model) throw new UserError('No picture model is available right now. Please try again later.', 503);
    const all = !Array.isArray(req.body.sceneIds);
    const busy = new Set(db.jobs.filter((j) => j.userId === req.user.id && j.ref === p.id && j.type === 'keyframe' && ACTIVE.includes(j.status)).map((j) => j.payload.sceneId));
    const open = (s) => s.type === 'ai' && !s.versions?.length && !s.locked && s.status !== 'generating' && !s.rangeLen && !busy.has(s.id);
    const targets = p.scenes.filter((s) => open(s) && (all ? !s.refFileId && String(s.prompt || '').trim() : req.body.sceneIds.includes(s.id)));
    if (!targets.length) throw new UserError(all ? 'Every AI scene already has a clip or a start picture. To draw a picture again, open the scene and press Preview picture.' : 'This scene cannot get a preview picture right now. It works for AI scenes that have no clip yet.');
    const blank = targets.find((s) => !String(s.prompt || '').trim()); if (blank) throw new UserError(`Scene ${p.scenes.indexOf(blank) + 1} has no description yet. Write what should happen in it.`);
    const per = round2(model.price.creditsPerImage); const total = round2(per * targets.length);
    if (req.body.dryRun) return res.json({ count: targets.length, per, total, model: model.name, estimated: !!model.price.estimated });
    needCredits(req.user, total);
    const idem = typeof req.body.idem === 'string' && req.body.idem.length >= 8 ? req.body.idem.slice(0, 80) : id('i_'); let started = 0;
    for (const s of targets) {
      const key = `${idem}:${s.id}`; if (db.jobs.some((j) => j.userId === req.user.id && j.type === 'keyframe' && j.idempotencyKey === key)) continue;
      enqueue({ type: 'keyframe', userId: req.user.id, ref: p.id, idempotencyKey: key, payload: { projectId: p.id, sceneId: s.id, modelId: model.id, prompt: ask(s.prompt, p.ratio), size: sizeFor(model, p.ratio) } }); started++;
    }
    touchProject(p);
    res.json({ ...(await view(p)), started, per, total });
  }));
}
