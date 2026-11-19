// Studio Pro: a second, separate image + video studio (FEATURE_STUDIO_PRO). The Image and Video pages, the Video Agent
// and the Video Builder are untouched; this section sits beside them and reuses the same generation, credit and asset code.
// What lives here: the catalogue of templates and camera presets, the creative agent's planner, saved agent sessions,
// the Enhancer's AI detail pass and the import of an uploaded picture into Assets.
import fs from 'node:fs';
import dns from 'node:dns/promises';
import net from 'node:net';
import db, { save, id, now } from './db.js';
import { flags } from './flags.js';
import { getCatalog, findModel, paidUsd } from './catalog.js';
import { charge, usdToCredits, round2 } from './credits.js';
import { complete, callJson } from './gateway.js';
import { UserError, saveMedia, mediaRef, imageSize, sizeForShape, pictureLink, publicBase, signFile } from './generate.js';
import { getFiles, filePath, dataUrl, fileMeta, storeImage } from './files.js';
import { browseSite, fetchPicture, toRaster } from './pro-site.js';
import { bucketOn } from './storage.js';
import { mediaFileId } from './edit.js';
import { parseJsonLoose } from './builder/audioplan.js';
import { userCharacter } from './projects.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { defaultModel, keyModel, userProject, touchProject } from './builder/routes.js';
import { PRO_TEMPLATES, PRO_CATEGORIES, CAMERAS, LENSES, MOVES, KINDS, RESTYLES, AD_TEMPLATES } from './pro-data.js';

const text = (v, max) => String(v ?? '').replace(/\u0000/g, '').slice(0, max).trim();
const list = (name, dflt) => String(process.env[name] || dflt).split(',').map((s) => s.trim()).filter(Boolean);
const PLANNERS = () => list('PRO_PLAN_MODEL', 'gpt-5.6-luna,gemini-3.1-flash-lite,deepseek-v4-flash')  // timed 2026-11-19: about 6 s each; gemini-3.5-flash took 20 to 60 s;
const RATIOS = ['9:16', '16:9', '1:1'];
async function planner(needEyes) {
  const all = (await getCatalog()).filter((m) => m.type === 'chat');
  const pool = needEyes ? all.filter((m) => m.vision) : all;
  for (const mid of PLANNERS()) { const m = pool.find((x) => x.id === mid); if (m) return m; }
  return pool[0] || all[0] || null;
}
const chatUsd = (model, usage, fallbackOut = 900) => paidUsd(usage, (((usage?.prompt_tokens || 900) * (model.price?.inPerM || 0)) + ((usage?.completion_tokens || fallbackOut) * (model.price?.outPerM || 0))) / 1e6);
const takesFrame = (model) => !!model?.video?.imageToVideo;
// Video models this API key may not call. The gateway only says so when a real request is made, so the list is learned
// from refusals ("Token is not allowed to call this model") and forgotten after a day, in case the key's project changes.
const blocked = () => { db.proBlocked ||= {}; for (const [k, at] of Object.entries(db.proBlocked)) if (Date.now() - Date.parse(at) > 24 * 3600000) delete db.proBlocked[k]; return db.proBlocked; };
// Models whose takes the provider keeps failing right now (reported by the agent after a refunded take). Forgotten after two hours.
const flaky = () => { db.proFlaky ||= {}; for (const [k, at] of Object.entries(db.proFlaky)) if (Date.now() - Date.parse(at) > 2 * 3600000) delete db.proFlaky[k]; return db.proFlaky; };
// ---------- Face lock ----------
// A saved character (a person, a product or a logo) is held the same across everything that is made: every picture and every
// opening frame is painted from the character's photos, and each video take is filmed from such a frame. The gateway has no
// frame-by-frame identity control, so the lock is exact where a take begins and is carried through it by the prompt.
// Seen 2026-11-19: Seedance 2.0 refuses a realistic face as a start picture ("invalid image"); Seedance 2.5 accepts it.
const FACE_UNSAFE = () => new RegExp(process.env.PRO_FACE_UNSAFE_MODELS || '^doubao-seedance-2\\.0', 'i');
const KEEP = { person: 'Keep this exact person: the same face and facial features, skin tone, hair and body type. Do not change who they are.', brand: 'Reproduce this logo exactly: the same shapes, colours, lettering and proportions.', product: 'Keep this product identical: the same shape, colours, materials, label text and logo.' };
const HOLD = { person: 'The person must stay the same person for the whole clip: the same face, hair and outfit.', brand: 'The logo must stay exactly the same for the whole clip.', product: 'The product must stay identical for the whole clip.' };
/** The reference pictures and the opening words that put a character into a picture prompt. `room` is how many references the model takes. */
function lockRefs(user, ch, room) {
  const photos = getFiles(user, ch.fileIds || []).filter((f) => f.kind === 'image'); if (!photos.length) return null;
  const what = ch.kind === 'person' ? 'person' : ch.kind === 'brand' ? 'logo' : 'product';
  const sheet = photos.length > 1 && ch.sheetId && getFiles(user, [ch.sheetId])[0];
  const refs = sheet ? [sheet] : photos.slice(0, Math.max(1, room));
  const lead = sheet ? `Reference image 1 is a reference sheet with ${photos.length} photos of the same ${what}, ${ch.name}. ${KEEP[ch.kind] || KEEP.person} Make one single new picture, never a grid, collage or copy of the sheet.` : `The reference image${refs.length > 1 ? 's show' : ' shows'} the ${what} ${ch.name}. ${KEEP[ch.kind] || KEEP.person}`;
  return { refs, lead: `${lead}${ch.notes ? ` Notes about ${ch.name}: ${text(ch.notes, 400)}.` : ''}` };
}
// The gateway account itself is out of balance. People are told plainly, because nothing will work until the owner tops it up.
const outOfQuota = (e) => e?.status === 402 && /quota|balance|top up/i.test(String(e?.raw || ''));
const QUOTA_WORDS = 'The AI service behind this app has run out of balance, so nothing can be generated right now. Nothing was charged. If you run this site, top up the AICredit account.';
// A reference photo as it is sent to the picture model: at most 1280 pixels on its long side, as a JPEG. A full-size phone
// photo sent as it is makes the request several megabytes and the edit then runs into the gateway's 60 second limit.
async function smallRef(f) {
  try { const im = await loadImage(fs.readFileSync(filePath(f))); const k = Math.min(1, 1280 / Math.max(im.width, im.height)); if (k === 1 && f.size < 600000) return dataUrl(f); const cv = createCanvas(Math.round(im.width * k), Math.round(im.height * k)); const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height); return `data:image/jpeg;base64,${cv.toBuffer('image/jpeg', 90).toString('base64')}`; }
  catch { return dataUrl(f); }
}
const notAllowed = (e) => /not allowed to call this model/i.test(String(e?.raw || ''));
const clipLimits = (model) => { const ds = (model?.video?.durations || []).filter((d) => d > 0); return { minSec: ds.length ? Math.min(...ds) : 4, maxSec: Math.min(15, ds.length ? Math.max(...ds) : 10) }; };

function planAsk({ prompt, kind, ratio, seconds, lim, hasPicture, answers, revise, template, lock }) {
  const k = KINDS.find((x) => x.id === kind);
  return `You are the creative director inside a studio app that makes images and videos with AI models. A person describes what they want in one line; you turn it into a finished production plan so they have nothing else to do.

THE BRIEF: """${prompt}"""
${k && k.id !== 'auto' ? `TYPE OF WORK THEY PICKED: ${k.label}. ${k.guide}` : 'They did not pick a type of work: choose the best one yourself.'}
${template ? `THEY STARTED FROM THE TEMPLATE "${template.title}": ${template.blurb}` : ''}
${ratio !== 'auto' ? `SHAPE THEY PICKED: ${ratio}.` : 'Pick the shape yourself: 9:16 for phones, Reels, TikTok, Shorts and UGC; 16:9 for YouTube, TV-style ads and films; 1:1 for feeds.'}
${seconds ? `LENGTH THEY PICKED: about ${seconds} seconds of video.` : ''}
${hasPicture ? 'They attached a picture (shown to you). It is the real product, person or place: describe it faithfully and build the work around it. The first video shot starts from this picture.' : ''}
${lock ? `FACE LOCK IS ON for the ${lock.kind === 'person' ? 'person' : lock.kind === 'brand' ? 'logo' : 'product'} called "${lock.name}"${lock.notes ? ` (${lock.notes})` : ''}. The studio has photos of ${lock.name} and paints them into every picture and every opening frame. Put ${lock.name} in every picture and every shot as the ${lock.kind === 'person' ? 'main character' : 'hero'}, and refer to them by that name. Do not describe ${lock.kind === 'person' ? 'their face, hair, age or skin' : 'its design'}: the photos decide that. You may describe clothes, pose, action, place and light. Keep shots at ${lim.minSec} to 6 seconds, which holds a likeness best.` : ''}
${answers?.length ? `THEY ALREADY ANSWERED YOUR QUESTIONS:\n${answers.map((a) => `- ${a.q} -> ${a.a}`).join('\n')}\nDo not ask anything else.` : ''}
${revise ? `THIS IS A REVISION. Your previous plan was:\n${JSON.stringify(revise.plan).slice(0, 6000)}\nThey want this changed: """${revise.note}"""\nKeep everything they did not mention. Do not ask a question.` : ''}

WHAT THE STUDIO CAN MAKE
- "images": 1 to 6 still pictures (product shots, ad visuals, posters, thumbnails, a lookbook).
- "clip": ONE continuous video take of ${lim.minSec} to ${lim.maxSec} seconds, animated from one opening picture. Best for a single moment: a UGC bite, a product reveal, a loop.
- "film": 2 to 12 shots of ${lim.minSec} to ${lim.maxSec} seconds each, cut together into one video (ads with a story, short dramas, explainers, trailers). Use it whenever the idea needs more than one moment or more than ${lim.maxSec} seconds.
The video model makes its own natural sound. There is no lip-synced speech, so never rely on a character saying exact words on camera; carry words with "narration" (a voice-over script) and "onscreen" (short caption text added in the edit).

HOW TO WRITE
- "visual" and picture prompts are for an AI model: say what is seen, where, the action, the light and the camera, in one to three sentences of plain English. Never ask for captions, slogans, watermarks or invented logos inside the picture. The one exception: when the brief names a product or brand, its packaging may carry that exact name, written in double quotes in the prompt and spelled letter for letter.
- Keep one look, the same people and the same product in every shot; repeat their description in each shot because every shot is generated on its own.
- Ads: hook in the first 2 seconds, show the product in use, end on the product. UGC: handheld phone look, real rooms, natural light, one creator. Short drama: a clear turn in every shot and a cliffhanger ending.
- Ask a question ONLY if one choice would change the whole result and cannot be guessed (for example the product is not named). Otherwise set "question" to null and decide yourself.

Reply with JSON only, no Markdown:
{"title": "3 to 6 words", "deliverable": "images" | "clip" | "film", "ratio": "9:16" | "16:9" | "1:1", "look": "one sentence: the visual style every picture and shot shares", "summary": "two short sentences telling the person what you will make and why it fits",
 "question": null or {"text": "one question", "options": [{"label": "2 to 4 words", "detail": "one short line"}, {"label": "...", "detail": "..."}]},
 "stills": [{"title": "2 to 4 words", "prompt": "picture prompt"}],
 "keyframe": "for a clip: the prompt of its opening picture, otherwise empty",
 "shots": [{"title": "2 to 4 words", "visual": "what happens in this shot", "seconds": 5, "narration": "voice-over line or empty", "onscreen": "caption text of up to 6 words, or empty"}],
 "copy": {"hook": "the opening line", "caption": "a post caption of one or two sentences", "cta": "call to action of up to 5 words", "hashtags": ["5 to 8 tags without #"]}}
For "images" fill "stills" and leave "shots" empty. For "clip" give exactly one shot plus "keyframe". For "film" give the shots and leave "stills" empty.`;
}

async function pricing() {
  const all = await getCatalog();
  const videos = all.filter((m) => m.type === 'video' && m.video.textToVideo);
  // Picture models in the order the agent tries them (timed 2026-11-19: Seedream and Nano Banana answered in about 30 s, the others timed out).
  const images = list('PRO_IMAGE_MODEL', 'seedream-5.0-pro,nano-banana,nano-banana-2,gpt-image-2').map((x) => all.find((m) => m.type === 'image' && m.id === x)).filter(Boolean);
  const img = images[0] || await keyModel();
  const pick = (ratio) => defaultModel(videos, { ratio: ratio === '1:1' ? '16:9' : ratio, resolution: '720p' });
  // Draft: the cheapest second of video any model offers. Standard: the default model at 720p. High: the same at 1080p.
  // `ladder` is every choice in the order to try it; models the key may not call are left out.
  const ladder = (ratio, quality, needFrame = false, avoid = [], face = false) => {
    const usable = videos.filter((m) => !blocked()[m.id] && !avoid.includes(m.id) && (!needFrame || takesFrame(m)) && (!face || !FACE_UNSAFE().test(m.id)));
    // A model that failed a take lately is not left out, only tried after the ones that have not.
    const steadyFirst = (list) => [...list.filter((x) => !flaky()[x.model.id]), ...list.filter((x) => flaky()[x.model.id])];
    let res = quality === 'high' ? '1080p' : '720p';
    if (!usable.some((m) => m.video.resolutions.includes(res))) res = '720p';
    // Only models that really offer the resolution: one that does not would be refused, or priced at nothing.
    const fits = usable.filter((m) => m.video.resolutions.includes(res) && m.price.creditsPerSecond[res] > 0);
    const first = defaultModel(fits, { ratio: ratio === '1:1' ? '16:9' : ratio, resolution: res }); const std = fits.includes(first) ? first : fits[0];
    const others = fits.filter((m) => m !== std).sort((a, b) => a.price.creditsPerSecond[res] - b.price.creditsPerSecond[res]);
    const normal = steadyFirst((std ? [std, ...others] : []).map((m) => ({ model: m, resolution: res, perSecond: m.price.creditsPerSecond[res] })));
    if (quality !== 'draft') return normal;
    const cheap = []; for (const m of usable) for (const r of m.video.resolutions) { const c = m.price.creditsPerSecond[r]; if (c > 0) cheap.push({ model: m, resolution: r, perSecond: c }); }
    cheap.sort((a, b) => a.perSecond - b.perSecond);
    const seen = new Set(); const drafts = steadyFirst(cheap.filter((x) => !seen.has(x.model.id) && seen.add(x.model.id)));
    return [...drafts, ...normal.filter((x) => !drafts.some((d) => d.model === x.model && d.resolution === x.resolution))];
  };
  const grade = (ratio, quality, needFrame, face) => ladder(ratio, quality, needFrame, [], face)[0] || null;
  return { all, videos, img, images, pick, grade, ladder };
}
function cleanPlan(j, { lim, wantRatio, wantSeconds }) {
  const deliverable = ['images', 'clip', 'film'].includes(j?.deliverable) ? j.deliverable : (Array.isArray(j?.shots) && j.shots.length > 1 ? 'film' : Array.isArray(j?.shots) && j.shots.length === 1 ? 'clip' : 'images');
  const ratio = wantRatio !== 'auto' ? wantRatio : RATIOS.includes(j?.ratio) ? j.ratio : '9:16';
  const sec = (v) => Math.max(lim.minSec, Math.min(lim.maxSec, Math.round(Number(v) || 5)));
  let shots = (Array.isArray(j?.shots) ? j.shots : []).map((s) => ({ title: text(s?.title, 60) || 'Shot', visual: text(s?.visual, 900), seconds: sec(s?.seconds), narration: text(s?.narration, 400), onscreen: text(s?.onscreen, 80) })).filter((s) => s.visual.length > 8).slice(0, 12);
  let stills = (Array.isArray(j?.stills) ? j.stills : []).map((s) => ({ title: text(s?.title, 60) || 'Picture', prompt: text(s?.prompt, 900) })).filter((s) => s.prompt.length > 8).slice(0, 6);
  let kind = deliverable;
  if (kind === 'clip' && !shots.length) kind = stills.length ? 'images' : 'clip';
  if (kind === 'film' && shots.length < 2) kind = shots.length ? 'clip' : 'images';
  if (kind === 'clip') { shots = shots.slice(0, 1); if (wantSeconds) shots[0].seconds = sec(wantSeconds); stills = []; }
  if (kind === 'film') stills = [];
  if (kind === 'images') shots = [];
  const q = j?.question && typeof j.question === 'object' && text(j.question.text, 240) ? { text: text(j.question.text, 240), options: (Array.isArray(j.question.options) ? j.question.options : []).map((o) => ({ label: text(o?.label, 60), detail: text(o?.detail, 160) })).filter((o) => o.label).slice(0, 4) } : null;
  const c = j?.copy || {};
  return { title: text(j?.title, 80) || 'Untitled', deliverable: kind, ratio, look: text(j?.look, 300), summary: text(j?.summary, 500), question: q && q.options.length >= 2 ? q : null,
    stills, keyframe: kind === 'clip' ? text(j?.keyframe, 900) || shots[0]?.visual || '' : '', shots,
    copy: { hook: text(c.hook, 200), caption: text(c.caption, 500), cta: text(c.cta, 60), hashtags: (Array.isArray(c.hashtags) ? c.hashtags : []).map((t) => text(t, 40).replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 10) } };
}
async function estimate(plan, quality, hasPicture = false, face = false) {
  const { img, grade } = await pricing(); const g = grade(plan.ratio, quality, hasPicture || face, face); const vm = g?.model; const frame = takesFrame(vm);
  const perImage = img?.price?.creditsPerImage || 0; const perSec = g?.perSecond || 0;
  const images = plan.deliverable === 'images' ? plan.stills.length : plan.deliverable === 'clip' && frame ? 1 : plan.deliverable === 'film' && face ? plan.shots.length : 0; // with Face lock every shot of a film gets its own opening frame
  const seconds = plan.shots.reduce((n, s) => n + s.seconds, 0);
  return { credits: round2(images * perImage + seconds * perSec), images, seconds, imageModel: img ? { id: img.id, name: img.name } : null, videoModel: vm ? { id: vm.id, name: vm.name } : null, resolution: g?.resolution || '720p', perSecond: round2(perSec), frame, quality: ['draft', 'high'].includes(quality) ? quality : 'standard' };
}

export function mountPro(app, { requireUser, wrap, createGeneration, studioSession, convSummary, genView, publicUser, markSession }) {
  // Pictures and videos made here are tagged Studio Pro or Ad Studio, so Assets can filter by the app that made them.
  const originOf = (req) => (req.body?.origin === 'ads' ? 'ads' : 'pro');
  // Work made before these tags existed is tagged from what the saved agent sessions and brands point at (runs once; tagged items are skipped).
  {
    const gens = new Map(db.generations.map((g) => [g.id, g])); const files = new Map(db.files.map((f) => [f.id, f])); let n = 0;
    const quiet = (cid, o) => { const c = db.conversations.find((x) => x.id === cid); if (c && !c.origin && (c.kind === 'image' || c.kind === 'video')) { c.origin = o; c.hideInRecents = true; n++; } };
    const tag = (g, o) => { if (!g || g.origin || g.appId) return; g.origin = o; n++; if (g.sessionId) quiet(g.sessionId, o); };
    const ids = (v, out = new Set()) => { if (typeof v === 'string') (v.match(/\b(?:m|g|vp|c)_[\w-]{6,}/g) || []).forEach((x) => out.add(x)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => ids(x, out)); return out; };
    for (const ps of (db.prosessions || [])) for (const x of ids(ps.state)) {
      if (x.startsWith('m_')) tag(gens.get(files.get(x)?.generationId), 'pro');
      else if (x.startsWith('g_')) tag(gens.get(x), 'pro');
      else if (x.startsWith('c_')) quiet(x, 'pro');
      else { const p = (db.vprojects || []).find((y) => y.id === x && !y.origin); if (p) { p.origin = 'pro'; n++; } }
    }
    for (const b of db.probrands || []) for (const a of b.ads || []) if (a.media?.id) tag(gens.get(files.get(a.media.id)?.generationId), 'ads');
    // Agent clips used to open a video session named after the plan; those sessions are the agent session's, so they go under it.
    const named = new Set((db.prosessions || []).map((ps) => ps.userId + ':' + ps.title));
    for (const c of db.conversations) if ((c.kind === 'image' || c.kind === 'video') && !c.origin && named.has(c.userId + ':' + c.title)) { quiet(c.id, 'pro'); for (const g of db.generations) if (g.sessionId === c.id) tag(g, 'pro'); }
    if (n) { save(); console.log(`[pro] tagged ${n} earlier Studio Pro and Ad Studio items for Assets and Recents`); }
  }
  db.prosessions ||= [];
  const gate = (req, res, next) => (flags().studioPro ? next() : res.status(404).json({ error: 'Studio Pro is switched off.', code: 'feature_off' }));
  // Everything the Enhancer makes goes into one "Enhancer" session, so Recents is not filled with one entry per picture.
  const enhSession = (user) => db.conversations.find((c) => c.userId === user.id && c.proTool === 'enhancer') || Object.assign(studioSession(user, 'image', null, 'Enhancer'), { proTool: 'enhancer', origin: 'pro' });
  const mine = (req) => { const s = db.prosessions.find((x) => x.id === req.params.id && x.userId === req.user.id); if (!s) throw new UserError('That session no longer exists.', 404); return s; };

  app.get('/api/pro/info', requireUser, gate, wrap(async (_req, res) => {
    const { videos, img, images, grade } = await pricing(); const vm = grade('9:16', 'standard')?.model; const chat = await planner(false);
    const q = (k) => { const g = grade('9:16', k); return g ? { id: k, model: g.model.name, resolution: g.resolution, perSecond: round2(g.perSecond) } : null; };
    res.json({ categories: PRO_CATEGORIES, templates: PRO_TEMPLATES, adTemplates: AD_TEMPLATES.map(({ still, video, ...t }) => ({ ...t, video })), kinds: KINDS.map(({ guide, ...k }) => k), cameras: CAMERAS, lenses: LENSES, moves: MOVES, restyles: RESTYLES, ratios: RATIOS,
      clip: clipLimits(vm), imageModel: img ? { id: img.id, name: img.name, credits: round2(img.price.creditsPerImage) } : null,
      videoModel: vm ? { id: vm.id, name: vm.name, perSecond: vm.price.creditsPerSecond['720p'] } : null, canVideo: videos.length > 0,
      planCredits: chat ? round2(usdToCredits((1400 * (chat.price?.inPerM || 0) + 1300 * (chat.price?.outPerM || 0)) / 1e6, chat)) : 0,
      imageOrder: images.map((m) => m.id), qualities: ['draft', 'standard', 'high'].map(q).filter(Boolean), builder: flags().videoBuilder, hosting: bucketOn() || !!publicBase() });
  }));

  // ---------- the agent's planner: one brief in, one production plan out ----------
  app.post('/api/pro/agent/plan', requireUser, gate, wrap(async (req, res) => {
    const prompt = text(req.body.prompt, 3000); if (prompt.length < 3) throw new UserError('Describe what you want to make in a sentence.');
    if (!((req.user.credits || 0) > 0)) throw new UserError('You are out of credits. Top up to plan and create.', 402, 'insufficient_credits');
    const kind = KINDS.some((k) => k.id === req.body.kind) ? req.body.kind : 'auto';
    const ratio = RATIOS.includes(req.body.ratio) ? req.body.ratio : 'auto';
    const seconds = Number(req.body.seconds) > 0 ? Math.min(180, Math.round(Number(req.body.seconds))) : 0;
    const pics = getFiles(req.user, Array.isArray(req.body.fileIds) ? req.body.fileIds.slice(0, 2) : []).filter((f) => f.kind === 'image');
    const chat = await planner(pics.length > 0); if (!chat) throw new UserError('No writing model is available right now. Please try again later.', 503);
    const quality = ['draft', 'high'].includes(req.body.quality) ? req.body.quality : 'standard';
    const { grade } = await pricing(); const lim = clipLimits(grade(ratio === 'auto' ? '9:16' : ratio, quality)?.model);
    const answers = (Array.isArray(req.body.answers) ? req.body.answers : []).map((a) => ({ q: text(a?.q, 240), a: text(a?.a, 300) })).filter((a) => a.q && a.a).slice(0, 4);
    const revise = req.body.revise && typeof req.body.revise === 'object' && text(req.body.revise.note, 1000) ? { plan: req.body.revise.plan, note: text(req.body.revise.note, 1000) } : null;
    const template = PRO_TEMPLATES.find((t) => t.id === req.body.templateId);
    const lock = req.body.characterId ? userCharacter(req.user, String(req.body.characterId)) : null;
    if (req.body.characterId && !lock) throw new UserError('That character no longer exists. Pick another one for Face lock.', 404);
    const ask = planAsk({ prompt, kind, ratio, seconds, lim, hasPicture: pics.length > 0 && chat.vision, answers, revise, template, lock: lock && { name: lock.name, kind: lock.kind, notes: text(lock.notes, 300) } });
    const ctl = new AbortController(); res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    const content = pics.length && chat.vision ? [{ type: 'text', text: ask }, ...pics.map((f) => ({ type: 'image_url', image_url: { url: dataUrl(f) } }))] : ask;
    let r;
    try { r = await complete(chat, [{ role: 'user', content }], { maxTokens: 6000, signal: ctl.signal }); }
    catch (e) { if (ctl.signal.aborted) return; throw new UserError('The plan could not be written this time. Nothing was charged. Please try again.', 502, 'plan_failed'); }
    const j = parseJsonLoose(r.text);
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new UserError('The plan came back unreadable. Nothing was charged. Please try again.', 502, 'plan_failed');
    const plan = cleanPlan(j, { lim, wantRatio: ratio, wantSeconds: seconds });
    if (answers.length || revise) plan.question = null;
    if (!plan.stills.length && !plan.shots.length) throw new UserError('The plan came back empty. Nothing was charged. Please try again with a little more detail.', 502, 'plan_failed');
    const credits = charge(req.user, usdToCredits(chatUsd(chat, r.usage), chat), `Studio Pro · plan · ${chat.name}`, { model: chat.id });
    res.json({ plan, estimate: await estimate(plan, quality, pics.length > 0, !!lock), credits, balance: round2(req.user.credits), sawPicture: pics.length > 0 && !!chat.vision });
  }));

  // ---------- saved agent sessions (the thread and its results, as the browser keeps them) ----------
  const sessionView = (s, full) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt, createdAt: s.createdAt, cover: s.cover || null, ...(full ? { state: s.state } : {}) });
  app.get('/api/pro/sessions', requireUser, gate, (req, res) => res.json({ sessions: db.prosessions.filter((s) => s.userId === req.user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100).map((s) => sessionView(s)) }));
  app.get('/api/pro/sessions/:id', requireUser, gate, wrap(async (req, res) => res.json({ session: sessionView(mine(req), true) })));
  app.put('/api/pro/sessions/:id', requireUser, gate, wrap(async (req, res) => {
    const raw = JSON.stringify(req.body.state ?? {}); if (raw.length > 300000) throw new UserError('This session has grown too large to save. Start a new one.', 413);
    let s = db.prosessions.find((x) => x.id === req.params.id && x.userId === req.user.id);
    if (!s) {
      if (!/^ps_[\w-]{8,40}$/.test(req.params.id) || db.prosessions.some((x) => x.id === req.params.id)) throw new UserError('That session cannot be saved.', 400);
      if (db.prosessions.filter((x) => x.userId === req.user.id).length >= 300) throw new UserError('You have 300 saved sessions. Delete some you no longer need first.');
      s = { id: req.params.id, userId: req.user.id, createdAt: now() }; db.prosessions.push(s);
    }
    Object.assign(s, { title: text(req.body.title, 120) || s.title || 'Untitled', cover: text(req.body.cover, 300) || s.cover || null, state: JSON.parse(raw), updatedAt: now() });
    save(); res.json({ session: sessionView(s) });
  }));
  app.delete('/api/pro/sessions/:id', requireUser, gate, (req, res) => { const i = db.prosessions.findIndex((x) => x.id === req.params.id && x.userId === req.user.id); if (i >= 0) { db.prosessions.splice(i, 1); save(); } res.json({ ok: true }); });

  // ---------- pictures the video models can start from ----------
  // The public address of an uploaded or generated picture, for the video provider to fetch (see pictureLink in generate.js).
  app.get('/pp/:fid/:name', (req, res) => {
    const f = db.files.find((x) => x.id === req.params.fid && x.kind === 'image');
    if (!f || signFile(f.id) !== String(req.params.name).replace(/\.\w+$/, '')) return res.status(404).end();
    res.type(f.mime).sendFile(filePath(f));
  });
  app.post('/api/pro/link-check', requireUser, gate, (req, res) => res.json({ ok: getFiles(req.user, Array.isArray(req.body.fileIds) ? req.body.fileIds.slice(0, 4) : []).filter((f) => f.kind === 'image').every((f) => !!pictureLink(f)) }));

  // One picture made so that it can also open a video: the model is asked for a web link, and the link is kept with the picture.
  const linkUntil = (u) => { try { const q = new URL(u).searchParams; const d = q.get('X-Tos-Date') || q.get('X-Amz-Date'); const ex = Number(q.get('X-Tos-Expires') || q.get('X-Amz-Expires')); const from = d ? Date.parse(d.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, '$1-$2-$3T$4:$5:$6Z')) : NaN; if (from && ex) return new Date(from + ex * 1000).toISOString(); } catch { /* fall through */ } return new Date(Date.now() + 6 * 3600000).toISOString(); };
  app.post('/api/pro/frame', requireUser, gate, wrap(async (req, res) => {
    const user = req.user; const prompt = text(req.body.prompt, 4000); if (prompt.length < 3) throw new UserError('Describe the picture.');
    let refs = getFiles(user, Array.isArray(req.body.fileIds) ? req.body.fileIds.slice(0, 2) : []).filter((f) => f.kind === 'image');
    const ch = req.body.characterId ? userCharacter(user, String(req.body.characterId)) : null;
    if (req.body.characterId && !ch) throw new UserError('That character no longer exists. Pick another one for Face lock.', 404);
    const face = ch && lockRefs(user, ch, 2);
    if (ch && !face) throw new UserError(`${ch.name} has no photos any more. Add photos to the character, or pick another one.`);
    // Face lock: the character's photos go first; a picture the person attached keeps the second place when there is room.
    if (face) refs = [...face.refs, ...refs.filter((f) => !face.refs.includes(f))];
    const { all } = await pricing();
    // Models that can answer with a link; with a reference picture, only those that take it as JSON.
    const order = list('PRO_FRAME_MODEL', 'seedream-5.0-pro,gpt-image-2').map((x) => all.find((m) => m.type === 'image' && m.id === x)).filter((m) => m && (m.constraints.allowed_response_formats || []).includes('url') && (!refs.length || (m.image.edit && m.image.edit.content_type !== 'multipart/form-data')));
    if (!order.length) throw new UserError('No picture model that can open a video is available right now.', 503);
    const shape = ['9:16', '16:9', '4:3', '3:4', '1:1'].includes(req.body.ratio) ? req.body.ratio : '1:1';
    let err = null;
    for (const model of order) {
      if (user.credits < model.price.creditsPerImage * 1.5) throw new UserError(`Not enough credits. This needs about ${Math.ceil(model.price.creditsPerImage * 1.5)} credits.`, 402, 'insufficient_credits');
      try {
        const body = { model: model.id, prompt: face ? `${face.lead}\n\n${prompt}` : prompt, size: sizeForShape(model, shape) || model.image.sizes[0], response_format: 'url', n: 1, watermark: false }; // without this Seedream stamps "AI generated" in a corner
        if (refs.length) body.image = await Promise.all(refs.slice(0, model.image.edit?.max_images || 1).map(smallRef));
        // With reference pictures the gateway wants /images/edits, whatever its model list says (seen 2026-11-19); the listed address is the second try.
        let j;
        if (!refs.length) j = await callJson('/images/generations', { json: body });
        else { try { j = await callJson('/images/edits', { json: body }); } catch (e) { if (![400, 404, 405, 415, 422].includes(e?.status) || /quota|balance|not allowed|policy|safety|moderat/i.test(String(e?.raw || ''))) throw e; j = await callJson('/' + (model.image.edit.endpoint || 'images/generations'), { json: body }); } }
        const d = j.data?.[0]; if (!d?.url && !d?.b64_json) throw new Error('empty');
        const buf = d.url ? Buffer.from(await (await fetch(d.url, { signal: AbortSignal.timeout(90000) })).arrayBuffer()) : Buffer.from(d.b64_json, 'base64');
        const dim = imageSize(buf) || {}; const gid = id('g_');
        const media = saveMedia(user, buf, 'image/png', 'png', { type: 'image', prompt, model: model.id, generationId: gid, w: dim.w, h: dim.h, ...(d.url ? { linkUrl: d.url, linkUntil: linkUntil(d.url) } : {}) });
        const paid = charge(user, usdToCredits(paidUsd(j.usage, model.price.usdPerImage), model), `Image · ${model.name}`, { model: model.id, generationId: gid });
        const session = studioSession(user, 'image', req.body.sessionId, text(req.body.title, 80) || prompt); markSession(session, originOf(req), req.body.quiet === true);
        const g = { id: gid, userId: user.id, mode: 'image', origin: originOf(req), prompt, displayPrompt: text(req.body.title, 80) || undefined, model: model.id, params: { size: body.size, count: 1 }, refs: refs.map(fileMeta), status: 'done', media: [mediaRef(media)], credits: round2(paid), sessionId: session.id, characterId: ch?.id, characterName: ch?.name, createdAt: now() };
        db.generations.push(g); session.updatedAt = now(); session.lastModel = model.id; save();
        // A copy in uploads, which is what the video models are handed. It points back at the picture, so it finds the link.
        const fid = mediaFileId(user, media.id);
        return res.json({ generation: genView(g), media: g.media[0], fileId: fid, canFilm: !!fid && !!pictureLink(db.files.find((x) => x.id === fid)), session: convSummary(session), credits: publicUser(user).credits });
      } catch (e) { if (e instanceof UserError) throw e; if (outOfQuota(e)) throw new UserError(QUOTA_WORDS, 503, 'gateway_quota'); err = e; }
    }
    throw err?.status ? err : new UserError('The picture could not be made this time. Nothing was charged. Please try again.', 502);
  }));

  // One video take. The models are tried in order of price for the chosen quality; one this key may not call is skipped and remembered.
  app.post('/api/pro/clip', requireUser, gate, wrap(async (req, res) => {
    const user = req.user; const prompt = text(req.body.prompt, 4000); if (prompt.length < 3) throw new UserError('Describe the video.');
    const quality = ['draft', 'high'].includes(req.body.quality) ? req.body.quality : 'standard';
    const fileIds = getFiles(user, Array.isArray(req.body.fileIds) ? req.body.fileIds.slice(0, 1) : []).filter((f) => f.kind === 'image').map((f) => f.id);
    const start = fileIds.length ? db.files.find((x) => x.id === fileIds[0]) : null;
    if (start && !pictureLink(start)) throw new UserError('This picture has no public web address, which the video models need to start from it. Make the picture in Studio Pro (its pictures carry one for a few hours), or run Scenly on a public address or with file storage connected.', 400, 'no_picture_link');
    const want = RATIOS.includes(req.body.ratio) ? req.body.ratio : '9:16'; let err = null;
    const avoid = (Array.isArray(req.body.avoid) ? req.body.avoid : []).map((x) => text(x, 80)).slice(0, 8);
    const ch = req.body.characterId ? userCharacter(user, String(req.body.characterId)) : null;
    if (ch && !start) throw new UserError(`Face lock needs an opening frame of ${ch.name} to film from, and none could be made. Please try again.`, 400, 'no_face_frame');
    const held = ch ? `The ${ch.kind === 'person' ? 'person' : ch.kind === 'brand' ? 'logo' : 'product'} in the first frame is ${ch.name}. ${HOLD[ch.kind] || HOLD.person}\n\n${prompt}` : prompt;
    for (let n = 0; n < 4; n++) {
      const c = (await pricing()).ladder(want, quality, !!start, avoid, !!ch && ch.kind === 'person')[0]; if (!c) break;
      const v = c.model.video; const ratio = v.ratios.includes(want) ? want : v.ratios.includes('9:16') ? '9:16' : v.ratios[0];
      const ds = v.durations.filter((d) => d > 0); const sec = Number(req.body.seconds) || 5; const duration = ds.reduce((a, b) => (Math.abs(b - sec) < Math.abs(a - sec) ? b : a), ds[0]);
      try {
        const g = await createGeneration(user, { mode: 'video', modelId: c.model.id, prompt: held, fileIds, params: { ratio, resolution: c.resolution, duration }, count: 1, task: 'create', origin: originOf(req), displayPrompt: text(req.body.title, 80) || (ch ? prompt.slice(0, 200) : undefined), extra: ch ? { characterId: ch.id, characterName: ch.name } : {} });
        const session = studioSession(user, 'video', req.body.sessionId, text(req.body.title, 80) || prompt); markSession(session, originOf(req), req.body.quiet === true);
        g.sessionId = session.id; session.updatedAt = now(); session.lastModel = g.model; save();
        return res.json({ generation: genView(g), session: convSummary(session), credits: publicUser(user).credits, model: { id: c.model.id, name: c.model.name }, resolution: c.resolution });
      } catch (e) { err = e; if (outOfQuota(e)) throw new UserError(QUOTA_WORDS, 503, 'gateway_quota'); if (!notAllowed(e)) throw e; blocked()[c.model.id] = now(); save(); console.warn(`[pro] ${c.model.id} is not enabled for this API key; trying the next model`); }
    }
    throw err ? new UserError('None of the video models for this quality are enabled on this server\'s API key. Pick another quality, or enable more models in the AICredit project.', 503, 'no_video_model') : new UserError('No video model is available right now.', 503);
  }));

  // The agent reports a model whose take the provider failed (and refunded). The next model for the same quality is returned,
  // and a film that was being made with the failed model is moved to it.
  app.post('/api/pro/avoid', requireUser, gate, wrap(async (req, res) => {
    const mid = text(req.body.modelId, 80); const all = await getCatalog();
    if (all.some((m) => m.id === mid && m.type === 'video')) { flaky()[mid] = now(); save(); console.warn(`[pro] ${mid} failed a take; other models are tried first for two hours`); }
    const quality = ['draft', 'high'].includes(req.body.quality) ? req.body.quality : 'standard'; const ratio = RATIOS.includes(req.body.ratio) ? req.body.ratio : '9:16';
    const c = (await pricing()).ladder(ratio, quality, false, [mid], !!req.body.face)[0];
    if (!c) throw new UserError('No other video model is available right now. Please try again later.', 503, 'no_video_model');
    const p = req.body.projectId ? userProject(req.user.id, String(req.body.projectId)) : null;
    if (p) { p.modelId = c.model.id; if (!c.model.video.resolutions.includes(p.resolution)) p.resolution = c.resolution; if (!c.model.video.ratios.includes(p.ratio)) p.ratio = c.model.video.ratios.includes('9:16') ? '9:16' : c.model.video.ratios[0]; for (const sc of p.scenes) if (sc.type === 'ai' && !sc.versions?.length) { sc.modelId = undefined; if (sc.status === 'failed') { sc.status = 'draft'; sc.error = undefined; } } touchProject(p); }
    res.json({ model: { id: c.model.id, name: c.model.name }, resolution: c.resolution, perSecond: round2(c.perSecond) });
  }));

  // ---------- Ad Studio: a website becomes a brand kit, the kit becomes ads ----------
  db.probrands ||= [];
  const brandOf = (req) => { const b = db.probrands.find((x) => x.id === req.params.id && x.userId === req.user.id); if (!b) throw new UserError('That brand no longer exists.', 404); return b; };
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim().toUpperCase() : d);
  const cleanKit = (j = {}, old = {}) => ({
    name: text(j.name, 80) || old.name || 'My brand', website: text(j.website, 300) || old.website || '', tagline: text(j.tagline, 160), description: text(j.description, 700),
    primary: hex(j.primary, old.primary || '#2F6BF2'), secondary: hex(j.secondary, old.secondary || '#6D4AFF'), aesthetics: text(j.aesthetics, 400), tone: text(j.tone, 300), audience: text(j.audience, 300),
    points: (Array.isArray(j.points) ? j.points : []).map((x) => text(x, 160)).filter(Boolean).slice(0, 8),
    products: (Array.isArray(j.products) ? j.products : []).map((x) => ({ name: text(x?.name, 80), blurb: text(x?.blurb, 240), imageId: /^f_[\w-]{6,40}$/.test(String(x?.imageId || '')) ? String(x.imageId) : undefined })).filter((x) => x.name).slice(0, 12),
  });
  const brandView = (b) => ({ id: b.id, ...b.kit, ads: b.ads || [], assets: (b.assets || []).filter((a) => db.files.some((f) => f.id === a.fileId && f.userId === b.userId)), read: b.read || null, logoFileId: b.logoFileId || null, createdAt: b.createdAt, updatedAt: b.updatedAt });
  // A public web page, read safely: only http(s), never an address inside this network, a short wait and a size limit.
  const privateIp = (ip) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|f[cd]|fe80:|::ffff:(10\.|127\.|192\.168\.|169\.254\.))/i.test(ip);
  const vivid = (c) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const hi = Math.max(r, g, b), lo = Math.min(r, g, b); return hi - lo >= 60 && hi >= 70 && lo <= 215; };
  const extraText = async (url) => { try { const r = await fetch(new URL('/llms.txt', url), { redirect: 'error', signal: AbortSignal.timeout(6000) }); if (!r.ok || /html/i.test(r.headers.get('content-type') || '')) return ''; return 'FROM ITS llms.txt: ' + (await r.text()).replace(/\s+/g, ' ').slice(0, 4000); } catch { return ''; } };
  async function readSite(link) {
    const bad = (m) => new UserError(m, 400, 'bad_link');
    let url; try { url = new URL(/^https?:\/\//i.test(link) ? link : 'https://' + link); } catch { throw bad('That is not a web address. Type it like yourbrand.com'); }
    for (let hop = 0; hop < 4; hop++) {
      if (!/^https?:$/.test(url.protocol)) throw bad('The address must start with https://');
      const host = url.hostname.replace(/^\[|\]$/g, ''); const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
      if (!ips.length || ips.some(privateIp)) throw bad('That website cannot be reached from here. Check the address, or set the brand up by hand.');
      const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrandKitReader/1.0)', Accept: 'text/html' }, signal: AbortSignal.timeout(12000) }).catch(() => null);
      if (!r) throw bad('That website did not answer. Check the address, or set the brand up by hand.');
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url); continue; }
      if (!r.ok) throw bad(`That website answered with an error (${r.status}). Set the brand up by hand instead.`);
      let html = ''; for await (const chunk of r.body) { html += Buffer.from(chunk).toString('utf8'); if (html.length > 700000) break; }
      const meta = (re) => (html.match(re)?.[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      // Colours that can be a brand colour: counted by how often they appear, greys and near-whites left out.
      const seen = new Map(); for (const c of html.match(/#[0-9a-f]{6}\b/gi) || []) { const k = c.toUpperCase(); if (vivid(k)) seen.set(k, (seen.get(k) || 0) + 1); }
      const colors = [...seen].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 10);
      // Sites built as JavaScript apps have almost no text in the page itself: their structured data and llms.txt say what they are.
      const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].replace(/\s+/g, ' ')).join(' ').slice(0, 3000);
      const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      return { url: url.href, title: meta(/<title[^>]*>([^<]{1,200})/i), description: meta(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})/i) || meta(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})/i),
        theme: meta(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-f]{6})/i), colors, text: [body.slice(0, 6000), ld && `STRUCTURED DATA: ${ld}`, body.length < 1500 ? await extraText(url) : ''].filter(Boolean).join('\n').slice(0, 11000) };
    }
    throw bad('That website redirects too many times. Set the brand up by hand instead.');
  }
  // ---------- a website becomes a brand kit with its pictures ----------
  // The site is opened in a real browser (server/pro-site.js); if that cannot start or the site will not open in it, the plain
  // download above is used instead. Then one writing request builds the kit, and the logo and product pictures are saved.
  async function kitFromSite(user, link) {
    if (!((user.credits || 0) > 0)) throw new UserError('You are out of credits. Top up to read a website.', 402, 'insufficient_credits');
    const chat = await planner(false); if (!chat) throw new UserError('No writing model is available right now. Please try again later.', 503);
    let site = null; let how = 'browser';
    try { site = await browseSite(link); } catch (e) { if (!e.user) console.warn('[pro] browser read failed, using the plain download:', e.message); how = 'plain'; try { const s = await readSite(link); site = { url: s.url, title: s.title, description: s.description, colors: s.colors, neutrals: [], fonts: [], pages: [{ kind: 'home', url: s.url, title: s.title, headings: [], text: s.text }], logos: [], svgLogo: '', icon: '', ogImage: '', pictures: [] }; } catch (e2) { throw e.user ? new UserError(e.message, 400, 'bad_link') : e2; } }
    const room = { home: 5000, pricing: 4000, products: 3500, features: 2500, about: 2000 };
    const words = site.pages.map((p) => `--- ${p.kind.toUpperCase()} PAGE (${p.url}) ---\n${p.text.slice(0, room[p.kind] || 2000)}`).join('\n');
    const pics = site.pictures.slice(0, 10);
    const ask = `Build a brand kit for advertising from this website. Use only what the pages say; never invent facts, prices or claims.\nADDRESS: ${site.url}\nTITLE: ${site.title}\nDESCRIPTION: ${site.description}\nCOLOURS ITS BUTTONS, LINKS AND HEADINGS USE, most used first: ${site.colors.join(', ') || 'none that are vivid'}${site.neutrals?.length ? `\nITS DARK NEUTRAL TONES: ${site.neutrals.join(', ')}` : ''}\nFONTS: ${site.fonts.join(', ') || 'unknown'}\n${pics.length ? `PICTURES FOUND ON THE SITE (number, size, caption):\n${pics.map((p, i) => `${i + 1}. ${p.w}x${p.h} "${p.alt || 'no caption'}" (${p.from} page)`).join('\n')}\n` : ''}\n${words}\n\nReply with JSON only:\n{"name": "the brand name", "tagline": "its tagline, or a faithful one-line summary", "description": "two or three sentences on what it offers", "primary": "#RRGGBB main brand colour, taken from the colours listed${site.colors.length ? '' : ' (a dark neutral is right for a black-and-white brand)'}", "secondary": "#RRGGBB a second brand colour from the list, different from the first", "aesthetics": "one sentence on the visual style", "tone": "one sentence on the tone of voice", "audience": "who it is for", "points": ["4 to 7 selling points, each one short line"], "products": [{"name": "a product, plan or service named on the pages", "blurb": "one line about it, with its price if the page gives one", "picture": 0}]}\nGive up to 8 products. For "picture" give the number of the picture that shows that product, judged by its caption, or 0 when none clearly does. If the pages name no product, give the main offer as one product.`;
    let r; try { r = await complete(chat, [{ role: 'user', content: ask }], { maxTokens: 3500 }); } catch { throw new UserError('The brand kit could not be written this time. Nothing was charged. Please try again.', 502); }
    const j = parseJsonLoose(r.text); if (!j || typeof j !== 'object') throw new UserError('The brand kit came back unreadable. Nothing was charged. Please try again.', 502);
    const credits = charge(user, usdToCredits(chatUsd(chat, r.usage), chat), `Studio Pro · brand kit · ${chat.name}`, { model: chat.id });
    // Pictures: the logo first, then the ones the kit's products point at, then the best of the rest. Eight at most.
    const assets = []; const keep = async (pic, role, alt) => { if (!pic) return null; const f = storeImage(user, `${role}-${Date.now()}.${pic.ext}`, pic.mime, pic.buf); f.w = pic.w; f.h = pic.h; assets.push({ fileId: f.id, role, alt: text(alt, 120), w: pic.w, h: pic.h }); return f.id; };
    let logoFileId = null;
    for (const src of [site.logos[0]?.url, site.svgLogo ? 'svg' : '', /logo/i.test(site.ogImage) ? site.ogImage : '', site.icon]) {
      if (!src || logoFileId) continue;
      const pic = src === 'svg' ? await toRaster(Buffer.from(site.svgLogo), 1024) : await fetchPicture(src, { maxSide: 1024 });
      if (pic && pic.w >= 64) logoFileId = await keep(pic, 'logo', `${text(j.name, 60) || site.title} logo`);
    }
    const wanted = (Array.isArray(j.products) ? j.products : []).map((p) => Number(p?.picture) - 1).filter((n) => n >= 0 && n < pics.length);
    const order = [...new Set([...wanted, ...pics.map((_, i) => i)])].slice(0, 7); const fileOf = new Map();
    await Promise.all(order.map(async (n) => { const pic = await fetchPicture(pics[n].url); if (pic && pic.w >= 200 && pic.h >= 200) fileOf.set(n, await keep(pic, wanted.includes(n) || pics[n].role === 'product' ? 'product' : 'image', pics[n].alt)); }));
    const kit = cleanKit({ ...j, website: site.url, products: (Array.isArray(j.products) ? j.products : []).map((p) => ({ ...p, imageId: fileOf.get(Number(p?.picture) - 1) })) });
    save();
    return { kit, credits, assets, logoFileId, read: { how, at: now(), pages: site.pages.map((p) => ({ kind: p.kind, url: p.url })), fonts: site.fonts } };
  }
  app.post('/api/pro/brands/:id/reread', requireUser, gate, wrap(async (req, res) => {
    const b = brandOf(req); if (!b.kit.website) throw new UserError('This brand has no website address. Add one in the kit first.');
    const got = await kitFromSite(req.user, b.kit.website);
    Object.assign(b, { kit: got.kit, assets: got.assets, logoFileId: got.logoFileId || b.logoFileId || null, read: got.read, updatedAt: now() }); save();
    res.json({ brand: brandView(b), credits: got.credits, balance: round2(req.user.credits) });
  }));
  app.get('/api/pro/brands', requireUser, gate, (req, res) => res.json({ brands: db.probrands.filter((b) => b.userId === req.user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(brandView) }));
  app.post('/api/pro/brands', requireUser, gate, wrap(async (req, res) => {
    if (db.probrands.filter((b) => b.userId === req.user.id).length >= 50) throw new UserError('You have 50 brands. Delete one you no longer need first.');
    let kit = cleanKit(req.body.kit || {}); let credits = 0;
    let got = null;
    if (req.body.url) { got = await kitFromSite(req.user, text(req.body.url, 300)); kit = got.kit; credits = got.credits; }
    const b = { id: id('pb_'), userId: req.user.id, kit, assets: got?.assets || [], logoFileId: got?.logoFileId || null, read: got?.read || null, createdAt: now(), updatedAt: now() }; db.probrands.push(b); save();
    res.json({ brand: brandView(b), credits, balance: round2(req.user.credits) });
  }));
  app.put('/api/pro/brands/:id', requireUser, gate, wrap(async (req, res) => {
    const b = brandOf(req); b.kit = cleanKit(req.body.kit || {}, b.kit);
    // The brand's pictures as the person arranged them: which is the logo, which shows a product, which were removed or added.
    if (Array.isArray(req.body.assets)) { const mine = new Map(getFiles(req.user, req.body.assets.map((a) => String(a?.fileId || '')).slice(0, 24)).filter((f) => f.kind === 'image').map((f) => [f.id, f])); b.assets = req.body.assets.filter((a) => mine.has(a?.fileId)).slice(0, 24).map((a) => ({ fileId: a.fileId, role: ['logo', 'product', 'image'].includes(a.role) ? a.role : 'image', alt: text(a.alt, 120), w: mine.get(a.fileId).w, h: mine.get(a.fileId).h })); }
    if ('logoFileId' in req.body) b.logoFileId = getFiles(req.user, [String(req.body.logoFileId || '')]).find((f) => f.kind === 'image')?.id || null;
    // The ads made for this brand, so they are still there when the page is opened again.
    if (Array.isArray(req.body.ads)) b.ads = req.body.ads.slice(0, 40).map((a) => ({ product: text(a?.product, 80), angle: text(a?.angle, 40), headline: text(a?.headline, 90), sub: text(a?.sub, 140), cta: text(a?.cta, 40), visual: text(a?.visual, 1200), place: text(a?.place, 10), template: text(a?.template, 20) || undefined, state: ['done', 'idea'].includes(a?.state) ? a.state : 'fail', media: a?.media?.id ? { id: text(a.media.id, 40), type: 'image', url: `/api/media/${text(a.media.id, 40)}` } : undefined })).filter((a) => a.headline && (a.state !== 'done' || a.media));
    b.updatedAt = now(); save(); res.json({ brand: brandView(b) });
  }));
  app.delete('/api/pro/brands/:id', requireUser, gate, (req, res) => { const i = db.probrands.findIndex((x) => x.id === req.params.id && x.userId === req.user.id); if (i >= 0) { db.probrands.splice(i, 1); save(); } res.json({ ok: true }); });
  // Ad concepts: one request writes every ad (headline, supporting line, call to action and the picture to make).
  app.post('/api/pro/brands/:id/concepts', requireUser, gate, wrap(async (req, res) => {
    const b = brandOf(req); const k = b.kit; const chat = await planner(false); if (!chat) throw new UserError('No writing model is available right now. Please try again later.', 503);
    if (!((req.user.credits || 0) > 0)) throw new UserError('You are out of credits. Top up to make ads.', 402, 'insufficient_credits');
    const products = (Array.isArray(req.body.products) ? req.body.products : []).map((x) => text(x, 80)).filter(Boolean).slice(0, 6);
    const per = Math.max(1, Math.min(4, Number(req.body.per) || 1)); const total = Math.min(8, Math.max(1, (products.length || 1) * per));
    const video = req.body.format === 'video';
    const tpl = AD_TEMPLATES.find((t) => t.id === req.body.template && t.id !== 'auto');
    const shape = tpl ? `\nAD FORMAT TO USE FOR EVERY ONE: "${tpl.label}". ${video ? tpl.video : tpl.still} Vary the wording, the scene and the selling point between the ads, but keep this format in all of them.` : '';
    const ask = `You are an advertising art director. Write ${total} different ${video ? 'short video ad ideas' : 'static ad concepts'} for this brand${products.length ? `, ${per} for each of these: ${products.join('; ')}` : ''}.\nBRAND: ${k.name}. ${k.tagline}\nWHAT IT IS: ${k.description}\nAUDIENCE: ${k.audience}\nTONE OF VOICE: ${k.tone}\nVISUAL STYLE: ${k.aesthetics}\nBRAND COLOURS: ${k.primary} and ${k.secondary}\nSELLING POINTS: ${k.points.join(' | ')}\n${k.products.length ? `PRODUCTS: ${k.products.map((p) => `${p.name}: ${p.blurb}${p.imageId ? ' [a real photo of it is supplied]' : ''}`).join(' | ')}` : ''}${shape}\n\nRules: use only facts from above, never invent prices, numbers or claims. For a product marked [a real photo of it is supplied], the image model is handed that photo: write the \"visual\" as the scene, light and layout around \"the product from the reference photo\", and do not describe the product's own design. ${tpl ? 'Each concept keeps the format above and uses a different selling point.' : 'Each concept uses a different angle (a benefit, a problem solved, proof, a bold statement, a lifestyle moment).'} Headlines are at most 7 words. ${video ? 'The "visual" is a one-sentence brief for a short vertical video ad.' : `The "visual" is a prompt for an AI image model: describe the whole ad picture, its composition, the brand colours ${k.primary} and ${k.secondary} as the palette, and where the text sits. The picture must show the headline as large, clean, correctly spelled text, written in the prompt inside double quotes, and nothing else as text except the brand name "${k.name}".`}\nReply with JSON only: {"ads": [{"product": "which product, or empty", "angle": "2 or 3 words", "headline": "", "sub": "one supporting line of up to 12 words", "cta": "up to 4 words", "visual": ""}]}`;
    let r; try { r = await complete(chat, [{ role: 'user', content: ask }], { maxTokens: 4000 }); } catch { throw new UserError('The ads could not be written this time. Nothing was charged. Please try again.', 502); }
    const j = parseJsonLoose(r.text); const ads = (Array.isArray(j) ? j : j?.ads || []).map((a) => ({ product: text(a?.product, 80), angle: text(a?.angle, 40), headline: text(a?.headline, 90), sub: text(a?.sub, 140), cta: text(a?.cta, 40), visual: text(a?.visual, 1200) })).filter((a) => a.headline && a.visual.length > 10).slice(0, total);
    if (!ads.length) throw new UserError('The ads came back unreadable. Nothing was charged. Please try again.', 502);
    const credits = charge(req.user, usdToCredits(chatUsd(chat, r.usage), chat), `Studio Pro · ad concepts · ${chat.name}`, { model: chat.id });
    const { img } = await pricing();
    res.json({ ads, credits, balance: round2(req.user.credits), perImage: img ? round2(img.price.creditsPerImage) : 0 });
  }));

  // ---------- Enhancer ----------
  // An uploaded picture becomes an asset, so the Enhancer (and every other tool) can work on it.
  app.post('/api/pro/import', requireUser, gate, wrap(async (req, res) => {
    const f = getFiles(req.user, [String(req.body.fileId || '')]).find((x) => x.kind === 'image');
    if (!f) throw new UserError('Upload a picture first (PNG, JPG or WebP).');
    const buf = fs.readFileSync(filePath(f)); const dim = imageSize(buf) || {}; const gid = id('g_');
    const ext = /png/i.test(f.mime) ? 'png' : /webp/i.test(f.mime) ? 'webp' : 'jpg';
    const media = saveMedia(req.user, buf, f.mime, ext, { type: 'image', prompt: f.name || 'Uploaded picture', generationId: gid, tool: 'upload', label: 'Uploaded picture', w: dim.w || dim.width, h: dim.h || dim.height });
    const session = enhSession(req.user);
    const g = { id: gid, userId: req.user.id, mode: 'image', prompt: f.name || 'Uploaded picture', displayPrompt: 'Uploaded picture', tool: 'upload', model: null, params: { count: 1 }, refs: [], status: 'done', media: [mediaRef(media)], credits: 0, sessionId: session.id, createdAt: now() };
    db.generations.push(g); session.updatedAt = now(); save();
    res.json({ media: mediaRef(media), generation: genView(g), session: convSummary(session) });
  }));
  // AI detail: the picture is redrawn by an image model with finer texture, keeping what is in it.
  const STRENGTH = {
    subtle: 'Change nothing about the content. Only clean it up: remove blur, noise and compression marks, and sharpen edges and fine texture.',
    balanced: 'Keep the same subject, composition, colours and framing. Redraw it with crisp focus and richer fine detail: skin texture, fabric weave, hair strands, surface grain, clean edges and natural light.',
    strong: 'Keep the same subject, pose and composition, and rebuild the picture as a high-end professional photograph: add realistic fine detail everywhere, improve the light and depth, fix soft, smeared or malformed areas such as hands, eyes and text-free surfaces.',
  };
  app.post('/api/pro/enhance', requireUser, gate, wrap(async (req, res) => {
    const fid = mediaFileId(req.user, String(req.body.mediaId || ''));
    if (!fid) throw new UserError('That picture is not stored in Scenly. Upload it again.', 404);
    const src = db.files.find((x) => x.id === req.body.mediaId && x.userId === req.user.id);
    const all = (await getCatalog()).filter((m) => m.type === 'image' && m.image.edit);
    const model = all.find((m) => m.id === req.body.model) || ['seedream-5.0-pro', 'nano-banana-2', 'gpt-image-2', 'nano-banana'].map((x) => all.find((m) => m.id === x)).find(Boolean) || all[0];
    if (!model) throw new UserError('No image model that can enhance pictures is available right now.');
    const level = STRENGTH[req.body.strength] ? req.body.strength : 'balanced'; const extra = text(req.body.prompt, 400);
    const size = (src?.w && src?.h && sizeForShape(model, `${src.w}:${src.h}`)) || model.image.sizes[0];
    const label = `Enhanced (${level})`;
    const g = await createGeneration(req.user, { mode: 'image', modelId: model.id, prompt: `Enhance this image. ${STRENGTH[level]}${extra ? ` Also: ${extra}.` : ''} Do not add text, borders or watermarks.`, fileIds: [fid], count: 1, displayPrompt: label, params: { size },
      mediaMeta: { rootId: src?.rootId || src?.id, editOf: src?.id, tool: 'enhance', label }, extra: { tool: 'enhance', editOf: src?.id, rootId: src?.rootId || src?.id } });
    const session = enhSession(req.user); g.sessionId = session.id; session.updatedAt = now(); session.lastModel = g.model; save();
    res.json({ generation: genView(g), media: g.media[0] || null, credits: publicUser(req.user).credits });
  }));
}
