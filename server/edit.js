// One-click image editing for pictures made in Scenly.
// AI tools (describe a change, add text, translate, mockup, background) run an image edit on the gateway.
// Free tools (cut-out of a plain background, 4K upscale, social sizes) run on this server with no model call.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import db, { save, id, now, MEDIA_DIR } from './db.js';
import { findModel, getCatalog } from './catalog.js';
import { saveMedia, mediaRef, UserError } from './generate.js';
import { filePath } from './files.js';
import { locate, mirror } from './storage.js';
import { publicUser } from './auth.js';
import { findStyle, styleLocked, applyStyle } from './styles.js';

export const MOCKUPS = [
  ['tshirt', 'T-shirt', 'printed on the chest of a plain t-shirt worn by a model, lifestyle fashion photo'],
  ['mug', 'Mug', 'printed on a ceramic coffee mug on a wooden desk, soft daylight'],
  ['packaging', 'Packaging', 'printed on a product packaging box standing on a clean studio surface'],
  ['signage', 'Shop sign', 'on a storefront sign above a shop entrance, street-level photo'],
  ['phone', 'Phone screen', 'displayed full-screen on a modern smartphone held in a hand'],
  ['laptop', 'Laptop screen', 'displayed on a laptop screen on a tidy desk'],
  ['billboard', 'Billboard', 'on a large outdoor billboard in a city, daytime'],
  ['tote', 'Tote bag', 'printed on a canvas tote bag carried on a shoulder'],
  ['poster', 'Framed poster', 'as a framed poster hanging on a living-room wall'],
];
export const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese (Simplified)', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Indonesian', 'Vietnamese', 'Thai', 'Turkish', 'Russian', 'Dutch'];
export const EXPORT_SIZES = [
  ['ig-post', 'Instagram post', 1080, 1080],
  ['ig-portrait', 'Instagram portrait', 1080, 1350],
  ['story', 'Story, Reel, TikTok', 1080, 1920],
  ['yt-thumb', 'YouTube thumbnail', 1280, 720],
  ['fb-post', 'Facebook, LinkedIn post', 1200, 630],
  ['x-header', 'X header', 1500, 500],
  ['yt-banner', 'YouTube banner', 2560, 1440],
  ['pinterest', 'Pinterest pin', 1000, 1500],
  ['web-banner', 'Website banner', 1920, 600],
];

const clean = (s, n = 300) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const quote = (s) => clean(s).replace(/"/g, "'");

/** The instruction sent to the image model for each AI tool, and the short label shown to the person. */
export function toolPrompt(tool, input = {}) {
  if (tool === 'change') {
    const t = clean(input.text, 1500);
    if (!t) throw new UserError('Describe the change you want.');
    return { prompt: `Edit this image: ${t}. Keep everything else exactly as it is: same subject, composition, colours and style.`, label: t };
  }
  if (tool === 'text') {
    const head = quote(input.headline);
    if (!head) throw new UserError('Type the text to add.');
    const sub = quote(input.subline);
    const where = { top: 'at the top', center: 'in the centre', bottom: 'at the bottom' }[input.position] || 'where it fits the layout best';
    return {
      prompt: `Add the headline text "${head}" ${where} of this image${sub ? `, with the smaller line "${sub}" under it` : ''}. Spell every word exactly as written, letter for letter, with no extra words. Use bold, clean, highly readable typography that matches the design, with strong contrast against the background. Keep the rest of the image unchanged.`,
      label: `Add text: ${head}`,
    };
  }
  if (tool === 'translate') {
    const lang = clean(input.language, 40);
    if (!lang) throw new UserError('Pick a language.');
    return { prompt: `Translate all visible text in this image into ${lang}. Replace each piece of text in place, keeping the same fonts, sizes, colours, positions and layout. Use natural, correct ${lang}. Do not change anything else in the image.`, label: `Translate to ${lang}` };
  }
  if (tool === 'mockup') {
    const m = MOCKUPS.find((x) => x[0] === input.mockup);
    if (!m) throw new UserError('Pick a mockup.');
    return { prompt: `Create a realistic product mockup photo with this exact design ${m[2]}. Reproduce the design faithfully, with the same artwork, colours and any text unchanged, following the surface naturally with correct perspective, folds and lighting. Photorealistic, professional mockup photography.`, label: `Mockup: ${m[1]}`, square: true };
  }
  if (tool === 'background') {
    return { prompt: 'Cut out the main subject of this image. Show it completely unchanged, at the same size and position, on a perfectly flat, plain, pure white (#FFFFFF) background. No shadow, no reflection, no gradient, no floor line and no other objects.', label: 'Background removed' };
  }
  throw new UserError('Unknown editing tool.');
}

const userMedia = (user, mid) => db.files.find((x) => x.id === mid && x.userId === user.id && x.kind === 'generated' && x.type !== 'video');
const mediaPath = (m) => locate(m);
const stored = (m) => !!(m && (m.key || m.file));
function needFile(m) {
  if (!m) throw new UserError('That image no longer exists.', 404);
  if (!stored(m)) throw new UserError('This image is not stored in Scenly, so it cannot be edited. Download it and upload it as a reference instead.');
  return m;
}
/** A copy of a generated image in the uploads folder, so it can be sent to a model as a reference. */
function mediaToFile(user, m) {
  const rec = { id: id('f_'), userId: user.id, name: m.name || 'image.png', size: m.size, mime: m.mime, kind: 'image', fromMedia: m.id, createdAt: now() };
  fs.copyFileSync(mediaPath(m), filePath(rec)); mirror(filePath(rec));
  db.files.push(rec); save();
  return rec;
}
const rootOf = (m) => m.rootId || m.id;
/** A copy of a generated picture as an uploaded file, so it can be read by a model. */
export function mediaFileId(user, mediaId) { const m = userMedia(user, mediaId); return stored(m) ? mediaToFile(user, m).id : null; }
function versions(user, m) {
  const root = rootOf(m);
  return db.files.filter((x) => x.userId === user.id && x.kind === 'generated' && (x.id === root || x.rootId === root) && !x.removed)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((x) => ({ ...mediaRef(x), tool: x.tool || null, label: x.label || null, createdAt: x.createdAt, w: x.w, h: x.h }));
}

// ---------- picture maths ----------
async function pixels(file) {
  const img = await loadImage(fs.readFileSync(file));
  const c = createCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  return { img, c, x, w: img.width, h: img.height };
}
/** The colour of the picture's edge, and how much of the edge has that colour. */
function edgeColour(d, w, h) {
  const rs = [], gs = [], bs = [];
  const step = Math.max(1, Math.floor((w + h) / 400));
  const take = (px, py) => { const i = (py * w + px) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
  for (let px = 0; px < w; px += step) { take(px, 0); take(px, h - 1); take(px, 1); take(px, h - 2); }
  for (let py = 0; py < h; py += step) { take(0, py); take(w - 1, py); take(1, py); take(w - 2, py); }
  const med = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];
  const bg = [med(rs), med(gs), med(bs)];
  let same = 0;
  for (let i = 0; i < rs.length; i++) if (Math.abs(rs[i] - bg[0]) + Math.abs(gs[i] - bg[1]) + Math.abs(bs[i] - bg[2]) < 36) same++;
  return { bg, plain: same / rs.length };
}
/** Makes the plain background see-through, working inward from the edges so the subject's own light areas stay. */
export async function cutout(file, { tolerance = 60 } = {}) {
  const { c, x, w, h } = await pixels(file);
  const im = x.getImageData(0, 0, w, h); const d = im.data;
  const { bg, plain } = edgeColour(d, w, h);
  const dist = (i) => Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]);
  const mask = new Uint8Array(w * h);
  const stack = [];
  const push = (p) => { if (!mask[p] && dist(p * 4) < tolerance) { mask[p] = 1; stack.push(p); } };
  for (let px = 0; px < w; px++) { push(px); push((h - 1) * w + px); }
  for (let py = 0; py < h; py++) { push(py * w); push(py * w + w - 1); }
  while (stack.length) {
    const p = stack.pop(); const px = p % w;
    if (px > 0) push(p - 1);
    if (px < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  let cleared = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (mask[p]) { d[i + 3] = 0; cleared++; continue; }
    // Soften the pixels that touch the background, and take the background tint out of them.
    const px = p % w;
    const near = (px > 0 && mask[p - 1]) || (px < w - 1 && mask[p + 1]) || (p >= w && mask[p - w]) || (p < w * (h - 1) && mask[p + w]);
    if (!near) continue;
    const a = Math.max(0.35, Math.min(1, dist(i) / (tolerance * 2.2)));
    for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, Math.round((d[i + k] - bg[k] * (1 - a)) / a)));
    d[i + 3] = Math.round(a * 255);
  }
  x.putImageData(im, 0, 0);
  return { buf: await c.encode('png'), w, h, plain, cleared: cleared / (w * h) };
}
export async function edgePlainness(file) {
  const { x, w, h } = await pixels(file);
  return edgeColour(x.getImageData(0, 0, w, h).data, w, h).plain;
}

/** A sharpened enlargement, 4096 pixels on the long side. */
export async function upscale(file, long = 4096) {
  const { img, x: sx, w, h } = await pixels(file);
  const k = long / Math.max(w, h);
  if (k <= 1.01) throw new UserError('This image is already 4K or larger.');
  const W = Math.round(w * k), H = Math.round(h * k);
  const sample = sx.getImageData(0, 0, w, h).data;
  let alpha = false;
  for (let i = 3; i < sample.length; i += 4 * 97) if (sample[i] < 250) { alpha = true; break; }
  // Enlarge in two steps: it keeps edges cleaner than one big jump.
  let src = img, cw = w, ch = h;
  if (k > 2) {
    const mid = createCanvas(w * 2, h * 2); const mx = mid.getContext('2d');
    mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high'; mx.drawImage(img, 0, 0, w * 2, h * 2);
    src = mid; cw = w * 2; ch = h * 2;
  }
  const out = createCanvas(W, H); const ox = out.getContext('2d');
  ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
  ox.drawImage(src, 0, 0, cw, ch, 0, 0, W, H);
  // Unsharp mask: add back the difference between the picture and a blurred copy.
  const soft = createCanvas(W, H); const fx = soft.getContext('2d');
  fx.filter = `blur(${Math.max(1, Math.round(k * 0.6))}px)`; fx.drawImage(out, 0, 0);
  const a = ox.getImageData(0, 0, W, H), b = fx.getImageData(0, 0, W, H).data, d = a.data;
  const amount = 0.55;
  for (let i = 0; i < d.length; i += 4) {
    for (let j = 0; j < 3; j++) { const v = d[i + j] + (d[i + j] - b[i + j]) * amount; d[i + j] = v < 0 ? 0 : v > 255 ? 255 : v; }
  }
  ox.putImageData(a, 0, 0);
  return alpha ? { buf: await out.encode('png'), mime: 'image/png', ext: 'png', w: W, h: H } : { buf: await out.encode('jpeg', 93), mime: 'image/jpeg', ext: 'jpg', w: W, h: H };
}

/** The whole picture inside a new shape, on a soft blurred copy of itself, so nothing is cropped. */
export async function fitTo(file, W, H) {
  const img = await loadImage(fs.readFileSync(file));
  const c = createCanvas(W, H); const x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, W, H);
  const cover = Math.max(W / img.width, H / img.height);
  const same = Math.abs(W / H - img.width / img.height) < 0.01;
  if (!same) {
    x.filter = `blur(${Math.round(Math.max(W, H) / 28)}px) brightness(0.82) saturate(1.1)`;
    const bw = img.width * cover * 1.15, bh = img.height * cover * 1.15;
    x.drawImage(img, (W - bw) / 2, (H - bh) / 2, bw, bh);
    x.filter = 'none';
  }
  const fit = Math.min(W / img.width, H / img.height);
  const fw = img.width * fit, fh = img.height * fit;
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(img, (W - fw) / 2, (H - fh) / 2, fw, fh);
  return c.encode('jpeg', 92);
}

// ---------- routes ----------
export function mountEdit(app, { requireUser, wrap, createGeneration, studioSession, convSummary, genView, userConv }) {
  async function editModel(wanted) {
    const all = (await getCatalog()).filter((m) => m.type === 'image' && m.image.edit);
    return all.find((m) => m.id === wanted) || ['seedream-5.0-pro', 'nano-banana-2', 'gpt-image-2', 'nano-banana'].map((x) => all.find((m) => m.id === x)).find(Boolean) || all[0];
  }
  /** The session the result belongs in: where the source was made, or one "Edits" session per source picture. */
  function sessionFor(user, src, label) {
    const root = rootOf(src);
    const gens = db.generations.filter((g) => g.userId === user.id && !g.hidden && g.sessionId && (g.id === src.generationId || g.rootId === root));
    const known = gens.map((g) => userConv(user, g.sessionId)).find((c) => c && c.kind === 'image');
    return known || studioSession(user, 'image', null, src.prompt || label);
  }
  function fileGeneration(user, src, media, { tool, label, w, h }) {
    const session = sessionFor(user, src, label);
    const g = { id: media.generationId, userId: user.id, mode: 'image', prompt: label, displayPrompt: label, tool, editOf: src.id, rootId: rootOf(src), model: null, params: { size: `${w}x${h}`, count: 1 }, refs: [], status: 'done', media: [mediaRef(media)], credits: 0, sessionId: session.id, projectId: session.projectId || undefined, createdAt: now() };
    db.generations.push(g);
    session.updatedAt = now(); save();
    return { g, session };
  }
  function reply(res, user, src, g, session) {
    res.json({ generation: genView(g), session: convSummary(session), versions: versions(user, src), credits: publicUser(user).credits });
  }

  app.get('/api/edit/options', requireUser, wrap(async (_req, res) => {
    res.json({ mockups: MOCKUPS.map(([k, name]) => ({ id: k, name })), languages: LANGUAGES, sizes: EXPORT_SIZES.map(([k, name, w, h]) => ({ id: k, name, w, h })) });
  }));

  app.get('/api/media/:id/versions', requireUser, (req, res) => {
    const m = userMedia(req.user, req.params.id);
    if (!m) return res.status(404).json({ error: 'That image no longer exists.' });
    res.json({ versions: versions(req.user, m) });
  });

  // AI edits. `background` first tries the free cut-out, and only calls a model when the background is busy.
  app.post('/api/edit', requireUser, wrap(async (req, res) => {
    const user = req.user;
    const src = needFile(userMedia(user, req.body.mediaId));
    const tool = String(req.body.tool || '');
    let spec;
    if (tool === 'style') {
      // A Design Library look applied to a finished picture.
      const style = findStyle(req.body.input?.styleId);
      if (!style) throw new UserError('Pick a style.');
      if (styleLocked(user, style)) throw new UserError(`${style.name} is part of the full Design Library, which comes with any paid plan or top-up pack.`, 402, 'style_locked');
      spec = { prompt: style.needsImage ? applyStyle(style, '', req.body.input?.styleVar) : `Redraw this image in a new style, keeping the same subject and composition. Style: ${applyStyle(style, '', req.body.input?.styleVar).replace(/^\. Style: /, '')}`, label: `Style: ${style.name}` };
    } else spec = toolPrompt(tool, req.body.input || {});
    const meta = { rootId: rootOf(src), editOf: src.id, tool, label: spec.label };

    if (tool === 'background' && (await edgePlainness(mediaPath(src))) >= 0.9) {
      const out = await cutout(mediaPath(src));
      if (out.cleared > 0.04) {
        const gid = id('g_');
        const media = saveMedia(user, out.buf, 'image/png', 'png', { type: 'image', prompt: src.prompt, model: src.model, generationId: gid, w: out.w, h: out.h, ...meta });
        const { g, session } = fileGeneration(user, src, media, { tool, label: spec.label, w: out.w, h: out.h });
        return reply(res, user, src, g, session);
      }
    }

    const model = await editModel(req.body.model);
    if (!model) throw new UserError('No image model that can edit pictures is available right now.');
    const ref = mediaToFile(user, src);
    const session = sessionFor(user, src, spec.label);
    const g = await createGeneration(user, {
      mode: 'image', modelId: model.id, prompt: spec.prompt, fileIds: [ref.id], count: 1, displayPrompt: spec.label,
      params: spec.square ? { size: model.image.sizes[0] } : {}, projectId: session.projectId,
      mediaMeta: meta, extra: { tool, editOf: src.id, rootId: rootOf(src) },
    });
    if (tool === 'background') {
      // Second step: the model has put the subject on plain white, now make the white see-through.
      const made = db.files.find((f) => f.id === g.media[0]?.id);
      if (stored(made)) {
        try {
          const out = await cutout(mediaPath(made));
          if (out.cleared > 0.04) {
            fs.writeFileSync(mediaPath(made), out.buf); mirror(mediaPath(made)); // the bucket copy must follow the change
            made.mime = 'image/png'; made.size = out.buf.length; made.w = out.w; made.h = out.h;
          }
        } catch (e) { console.warn('cut-out failed, keeping the white background:', e.message); g.note = 'The background was replaced with white, but could not be made see-through.'; }
      }
    }
    g.sessionId = session.id;
    session.updatedAt = now(); session.lastModel = g.model;
    save();
    reply(res, user, src, g, session);
  }));

  app.post('/api/media/:id/upscale', requireUser, wrap(async (req, res) => {
    const user = req.user;
    const src = needFile(userMedia(user, req.params.id));
    const out = await upscale(mediaPath(src));
    const label = `Upscaled to ${out.w} × ${out.h}`;
    const gid = id('g_');
    const media = saveMedia(user, out.buf, out.mime, out.ext, { type: 'image', prompt: src.prompt, model: src.model, generationId: gid, rootId: rootOf(src), editOf: src.id, tool: 'upscale', label, w: out.w, h: out.h });
    const { g, session } = fileGeneration(user, src, media, { tool: 'upscale', label, w: out.w, h: out.h });
    reply(res, user, src, g, session);
  }));

  app.post('/api/media/:id/export', requireUser, wrap(async (req, res) => {
    const src = needFile(userMedia(req.user, req.params.id));
    const want = EXPORT_SIZES.filter(([k]) => (req.body.sizes || []).includes(k));
    if (!want.length) throw new UserError('Pick at least one size.');
    const made = [];
    for (const [k, , w, h] of want) made.push([`scenly-${k}-${w}x${h}.jpg`, await fitTo(mediaPath(src), w, h)]);
    if (made.length === 1) return res.set({ 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent(made[0][0]) }).send(made[0][1]);
    const zip = new JSZip();
    for (const [name, buf] of made) zip.file(name, buf);
    res.set({ 'Content-Type': 'application/zip', 'X-File-Name': encodeURIComponent('scenly-sizes.zip') }).send(await zip.generateAsync({ type: 'nodebuffer' }));
  }));
}
