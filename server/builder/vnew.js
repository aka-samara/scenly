// Video (new): the server side of the shorter, chip-based video section (public/vnew.js), built beside the old tools.
// It only adds what the existing Builder and Agent routes could not do; everything else reuses them as they are.
//  - POST /api/builder/projects/:id/revise              change the plan in words ("make it funnier", "swap scene 3")
//  - POST /api/builder/projects/:id/voice-from-script   AI voice made first, one line per scene; its length sets the scene
// Both live under /api/builder, so the paid-tools rule and the Pro credit buckets apply exactly as in the Builder.
// The look (colour filter) and the brand logo (corner mark) are applied at export in render.js from project.vnew.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db, { save, id, now } from '../db.js';
import { flags } from '../flags.js';
import { getCatalog, paidUsd, findModel } from '../catalog.js';
import { charge, usdToCredits, needCredits, round2 } from '../credits.js';
import { putFile, keys, locate, abs } from '../storage.js';
import { ffmpeg, ffmpegInfo, needFfmpeg } from '../ffmpeg.js';
import { complete } from '../gateway.js';
import { UserError } from '../generate.js';
import { parseJsonLoose } from './audioplan.js';
import { userProject, userFile, view, fileMap, touchProject } from './routes.js';
import { layout, MAX_SCENES } from './plan.js';
import { STYLES } from './agent-data.js';
export { LOOKS, CORNERS, cleanVnew, finishArgs } from './vnewdoc.js';
import { aiVoiceOn } from '../byteplus.js';
import { makeSpeech } from '../speech.js';

const text = (v, max) => String(v ?? '').replace(/\u0000/g, '').slice(0, max).trim();
const list = (name, dflt) => String(process.env[name] || dflt).split(',').map((s) => s.trim()).filter(Boolean);
async function writer() { for (const mid of list('PLAN_MODEL', 'gemini-3.5-flash,deepseek-v4-flash')) { const m = await findModel(mid); if (m?.type === 'chat') return m; } return (await getCatalog()).find((m) => m.type === 'chat') || null; }
const chatUsd = (model, usage, out = 900) => paidUsd(usage, (((usage?.prompt_tokens || 900) * (model.price?.inPerM || 0)) + ((usage?.completion_tokens || out) * (model.price?.outPerM || 0))) / 1e6);

export function mountVnew(app, { requireUser, wrap }) {
  const gate = (_req, res, next) => (flags().videoBuilder && flags().videoNew ? next() : res.status(404).json({ error: 'Video (new) is switched off.', code: 'feature_off' }));
  const own = (req) => { const p = userProject(req.user.id, req.params.id); if (!p) throw new UserError('That video no longer exists.', 404); return p; };

  // ---------- change the plan in words ----------
  app.post('/api/builder/projects/:id/revise', requireUser, gate, wrap(async (req, res) => {
    const p = own(req); const ask = text(req.body.ask, 1000);
    if (ask.length < 2) throw new UserError('Say what to change, for example: make it funnier, or use a close up in scene 3.');
    const chat = await writer(); if (!chat) throw new UserError('No writing model is available right now. Please try again later.', 503);
    needCredits(req.user, 0, 'You are out of credits. Top up to change the plan.');
    const models = (await getCatalog()).filter((m) => m.type === 'video'); const model = models.find((m) => m.id === p.modelId);
    const ds = (model?.video?.durations || []).filter((d) => d > 0); const maxSec = Math.min(15, ds.length ? Math.max(...ds) : 10);
    const cur = p.scenes.map((s, i) => ({ n: i + 1, kind: s.type === 'ai' ? 'ai' : s.type, visual: s.type === 'ai' ? s.prompt : `(${s.type} the person added, keep as it is)`, narration: s.narration || '', seconds: s.duration || 5, made: !!s.versions?.length }));
    const prompt = `You edit the plan of a short video. Here is the current plan as JSON:\n${JSON.stringify({ title: p.title, scenes: cur })}\n\nThe person asks: "${ask}"\n\nReturn the whole new plan as JSON only: {"title": "...", "scenes": [{"from": <number of the scene it comes from, or null for a new scene>, "visual": "...", "narration": "...", "seconds": <2 to ${maxSec}>}]}.\nRules: change only what the request needs; copy every other scene exactly, with its "from". Visual descriptions are in English, one or two sentences for an AI video model, no written text or logos in the picture. Narration stays in the language it is in. Scenes of kind image or video cannot be rewritten: copy them unchanged. At most ${MAX_SCENES} scenes.`;
    let r;
    try { r = await complete(chat, [{ role: 'user', content: prompt }], { maxTokens: 8000 }); }
    catch { throw new UserError('The plan could not be changed this time. Nothing was charged. Please try again.', 502); }
    const j = parseJsonLoose(r.text); const rows = Array.isArray(j?.scenes) ? j.scenes.slice(0, MAX_SCENES) : null;
    if (!rows?.length) throw new UserError('The new plan came back unreadable. Nothing was charged. Please try again.', 502);
    const used = new Set(); const changed = [];
    const scenes = rows.map((row) => {
      const from = Number(row?.from); const old = from >= 1 && from <= p.scenes.length && !used.has(from) ? p.scenes[from - 1] : null;
      if (old) used.add(from);
      if (old && old.type !== 'ai') return old;
      const visual = text(row?.visual, 900); const narration = text(row?.narration, 600);
      const seconds = Math.max(2, Math.min(maxSec, Number(row?.seconds) || old?.duration || 5));
      if (old) {
        const same = visual === old.prompt && narration === (old.narration || '') && Math.abs(seconds - (old.duration || 5)) < 0.01;
        if (same) return old;
        if (visual && visual !== old.prompt && old.versions?.length) changed.push(old.id);
        return { ...old, prompt: visual || old.prompt, narration, duration: seconds, ...(visual && visual !== old.prompt && !old.versions?.length ? { refFileId: undefined } : {}) };
      }
      if (!visual) return null;
      const s = { id: id('sc_'), type: 'ai', prompt: visual, narration, duration: seconds, transition: 'cut', fit: 'pad', versions: [], cur: 0, status: 'draft', continuity: false };
      changed.push(s.id); return s;
    }).filter(Boolean);
    if (!scenes.length) throw new UserError('The new plan had no scenes. Nothing was charged. Please try again.', 502);
    // A scene that was left out goes to the bin, so its paid clips can still be brought back in the Timeline.
    const kept = new Set(scenes.map((s) => s.id));
    p.bin = [...p.scenes.filter((s) => !kept.has(s.id) && s.type === 'ai' && s.versions?.length && s.status !== 'generating'), ...(p.bin || [])].slice(0, 40);
    p.scenes = scenes; if (text(j?.title, 120)) p.title = text(j.title, 120);
    touchProject(p);
    const credits = charge(req.user, usdToCredits(chatUsd(chat, r.usage), chat), `Video · change the plan · ${chat.name}`, { model: chat.id, builderId: p.id });
    res.json({ ...(await view(p)), changed, credits, balance: round2(req.user.credits) });
  }));

  // ---------- voice first: one AI voice line per scene, scene length follows the voice ----------
  app.post('/api/builder/projects/:id/voice-from-script', requireUser, gate, wrap(async (req, res) => {
    const p = own(req); needFfmpeg();
    if (!aiVoiceOn()) throw new UserError('AI voice is not switched on yet. Upload or record a voice instead.', 503, 'voice_off');
    const voiceId = text(req.body.voiceId, 120); const speed = Math.max(0.7, Math.min(1.5, Number(req.body.speed) || 1));
    const lines = p.scenes.map((s) => ({ s, line: text(s.narration, 600).replace(/^["“]|["”]$/g, '') })).filter((x) => x.line);
    if (!lines.length) throw new UserError('No scene has words to speak yet. Add a voice line to a scene first.');
    const models = (await getCatalog()).filter((m) => m.type === 'video');
    const made = []; let credits = 0;
    for (const { s, line } of lines) {
      const r = await makeSpeech(req.user, { text: line, voiceId, speed, desc: 'Video · AI voice line', extra: { hiddenFromAssets: true, builderId: p.id } });
      made.push({ s, file: r.file }); credits += r.credits || 0;
      // The scene is made long enough for its line (plus a short breath), within what the scene's model can make.
      if (s.type === 'ai' && !s.versions?.length) {
        const m = models.find((x) => x.id === (s.modelId || p.modelId));
        const want = Math.ceil((r.file.duration || 3) + 0.4);
        const ds = (m?.video?.durations || []).filter((d) => d > 0); const top = Math.min(15, ds.length ? Math.max(...ds) : 10);
        const least = ds.length ? Math.min(...ds) : 4; // never shorter than the shortest clip the model makes
        s.duration = Math.max(2, least, Math.min(top, want));
      }
    }
    // One voice track: each line placed where its scene starts.
    const files = fileMap(p); const lay = layout(p, files);
    const start = new Map(lay.rows.map((r) => [r.scene.id, r.start]));
    const tmp = path.join(os.tmpdir(), `vn-voice-${p.id}-${Date.now()}.mp3`);
    const inputs = made.flatMap((x) => ['-i', locate(x.file)]);
    const fc = made.map((x, i) => `[${i}:a]aresample=48000,adelay=${Math.round((start.get(x.s.id) || 0) * 1000)}:all=1[a${i}]`).join(';') + ';' + made.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${made.length}:normalize=0:dropout_transition=0,apad=whole_dur=${Math.max(1, lay.seconds).toFixed(2)}[out]`;
    try { await ffmpeg([...inputs, '-filter_complex', fc, '-map', '[out]', '-t', Math.max(1, lay.seconds).toFixed(2), '-c:a', 'libmp3lame', '-b:a', '160k', tmp], { timeoutMs: 120000 }); }
    catch (e) { fs.rmSync(tmp, { force: true }); throw new UserError('The voice lines were made but could not be joined. Please try again.', 500); }
    const rec = { id: id('f_'), userId: req.user.id, kind: 'audio', mime: 'audio/mpeg', name: `${p.title} - voice.mp3`, createdAt: now(), duration: round2(lay.seconds), aiVoice: { voiceId, lines: made.length } };
    rec.key = putFile(keys.upload(req.user.id, 'audio', rec.id, 'mp3'), tmp, { move: true }); rec.size = fs.statSync(abs(rec.key)).size;
    db.files.push(rec);
    p.voice = { fileId: rec.id, volume: 1, offset: 0 };
    p.vnew = { ...(p.vnew || {}), voiceId, voiceLines: Object.fromEntries(made.map((x) => [x.s.id, { fileId: x.file.id, seconds: x.file.duration }])) };
    // Captions follow the voice lines when captions are on.
    if (p.vnew.captions !== false) p.captions = made.map((x) => { const st = start.get(x.s.id) || 0; return { start: round2(st), end: round2(st + Math.min(x.file.duration || 3, lay.rows.find((r) => r.scene.id === x.s.id)?.seconds || 5)), text: text(x.s.narration, 300).replace(/^["“]|["”]$/g, '') }; });
    touchProject(p); save();
    res.json({ ...(await view(p)), credits: round2(credits), balance: round2(req.user.credits) });
  }));
}
export { STYLES };
