// Image and video generation shared by chat, the Image / Video studios and AI Apps.
// Credits: images are charged after the gateway returns; videos reserve credits
// when the task starts and settle to the real cost (or refund) when it ends.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import db, { save, id, now, MEDIA_DIR } from './db.js';
import { findModel, estimateVideoCredits, paidUsd, imageUsd } from './catalog.js';
import { usdToCredits, centsToCredits, grant, charge, round2, needCredits, inPro } from './credits.js';
import { getFiles, dataUrl, filePath, fileMeta } from './files.js';
import { callJson, GatewayError, tidyProviderText } from './gateway.js';
import { recordFailure } from './monitor.js';
import { keys, put, exists, bucketUrl } from './storage.js';

export class UserError extends Error {
  constructor(message, status = 400, code) { super(message); this.status = status; this.code = code; }
}

// ---------- media storage ----------
export function saveMedia(user, buf, mime, ext, meta = {}) {
  const rec = { id: id('m_'), userId: user.id, kind: 'generated', mime, name: `${meta.type || 'media'}-${Date.now()}.${ext}`, size: buf.length, createdAt: now(), ...meta };
  // Stored as users/{userId}/generations/{genId}/{n}.{ext}
  const group = meta.generationId || meta.conversationId || 'single';
  const n = db.files.filter((f) => f.userId === user.id && f.kind === 'generated' && (f.generationId || f.conversationId || 'single') === group).length + 1;
  let key = keys.generation(user.id, group, n, ext);
  if (exists(key)) key = keys.generation(user.id, group, rec.id, ext);
  rec.key = put(key, buf);
  rec.n = n - 1;
  db.files.push(rec);
  save();
  if (mime.startsWith('video/')) mediaHooks.videoSaved?.(rec);
  return rec;
}
// Set by the app at startup: what to do after a video is stored (poster and preview copy).
export const mediaHooks = { videoSaved: null };

export async function downloadTo(user, url, mime, ext, meta) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return saveMedia(user, Buffer.from(await r.arrayBuffer()), mime, ext, meta);
  } catch (e) {
    console.warn('Could not download media, keeping remote URL:', e.message);
    const rec = { id: id('m_'), userId: user.id, kind: 'generated', mime, remoteUrl: url, createdAt: now(), ...meta };
    db.files.push(rec); save();
    return rec;
  }
}
export const mediaRef = (m) => ({ id: m.id, type: m.type, url: m.remoteUrl || `/api/media/${m.id}`, prompt: m.prompt, model: m.model, poster: m.posterKey ? `/api/media/${m.id}/poster` : undefined, duration: m.duration || undefined });

// ---------- public links for reference videos ----------
// Video-to-video needs a URL the provider can download. When the app runs at a
// public address (PUBLIC_URL), uploads get a signed, unguessable link.
// Old fallback value kept after the rename to Scenly so links already handed out stay valid.
const secret = () => process.env.LINK_SECRET || process.env.AICREDIT_API_KEY || 'polymind-local';
export const signFile = (fid) => crypto.createHmac('sha256', secret()).update(fid).digest('base64url').slice(0, 32);
export function publicFileUrl(f) {
  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  if (!/^https:\/\//.test(base) || /localhost|127\.0\.0\.1/.test(base)) return null;
  return `${base}/p/${f.id}/${signFile(f.id)}`;
}

// ---------- public links for start pictures ----------
// The gateway takes a start picture for a video only as a public web link whose path ends in an image extension
// (checked 2026-11-19: a picture sent inline is refused with a 400). A link comes from, in this order: the file bucket,
// this server's public address (/pp/...), or the image provider's own link when the picture was made with one.
const IMG_EXT = /\.(jpe?g|png|webp|bmp|tiff?|gif|heic)$/i;
export const pictureExt = (f) => (/png/i.test(f.mime) ? 'png' : /webp/i.test(f.mime) ? 'webp' : /gif/i.test(f.mime) ? 'gif' : 'jpg');
export const publicBase = () => { const b = (process.env.PUBLIC_URL || '').replace(/\/$/, ''); return /^https:\/\//.test(b) && !/localhost|127\.0\.0\.1/.test(b) ? b : null; };
export function pictureLink(f) {
  const ok = (u) => { try { return u && IMG_EXT.test(new URL(u).pathname) ? u : null; } catch { return null; } };
  let b = null; try { b = ok(bucketUrl(filePath(f), { mime: f.mime, inline: true })); } catch { /* no bucket copy */ }
  if (b) return b;
  if (publicBase()) return `${publicBase()}/pp/${f.id}/${signFile(f.id)}.${pictureExt(f)}`;
  const src = f.fromMedia ? db.files.find((x) => x.id === f.fromMedia) : f;
  return src?.linkUrl && Date.parse(src.linkUntil || 0) > Date.now() + 10 * 60000 ? ok(src.linkUrl) : null;
}

// ---------- images ----------
/** Width and height of a PNG, JPEG, GIF or WebP file, read from its header. Null when it cannot be told. */
export function imageSize(buf) {
  try {
    if (buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf.toString('latin1', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
      const kind = buf.toString('latin1', 12, 16);
      if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let rotated = false;
      for (let i = 2; i + 9 < buf.length;) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
        // Phone photos are often stored sideways with a note to turn them (EXIF orientation 5 to 8).
        if (m === 0xe1 && buf.toString('latin1', i + 4, i + 8) === 'Exif') {
          const t = i + 10, le = buf.toString('latin1', t, t + 2) === 'II';
          const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
          const ifd = t + (le ? buf.readUInt32LE(t + 4) : buf.readUInt32BE(t + 4));
          for (let k = 0, n = u16(ifd); k < n; k++) if (u16(ifd + 2 + k * 12) === 0x0112) rotated = u16(ifd + 2 + k * 12 + 8) >= 5;
        }
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { const h = buf.readUInt16BE(i + 5), w = buf.readUInt16BE(i + 7); return rotated ? { w: h, h: w } : { w, h }; }
        i += 2 + len;
      }
    }
  } catch {}
  return null;
}
/** The size to ask for so the result keeps the shape of a source picture as far as the model allows. */
export function sizeLike(model, file) {
  let d = null; try { d = imageSize(fs.readFileSync(filePath(file))); } catch {}
  if (!d || !d.w || !d.h) return undefined;
  return sizeForShape(model, `${d.w}:${d.h}`);
}
/** The model's size closest in shape to "W:H" (or "WxH"), the smallest such when several fit. "2K"-style sizes are skipped. */
export function sizeForShape(model, want) {
  const m = /^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/.exec(String(want || ''));
  if (!m || !Number(m[1]) || !Number(m[2])) return undefined;
  const r = Number(m[2]) / Number(m[1]);
  return (model?.image?.sizes || [])
    .map((x) => { const d = /^(\d+)x(\d+)$/.exec(x); return d && [x, Math.abs(Math.log((Number(d[2]) / Number(d[1])) / r)), Number(d[1]) * Number(d[2])]; })
    .filter(Boolean).sort((a, b) => a[1] - b[1] || a[2] - b[2])[0]?.[0];
}
// How many pictures one request may ask for: the model's own limit when it makes sets in one call, otherwise up to 4 in parallel.
export const maxImageCount = (model) => Math.max(4, Math.min(15, model?.image?.maxN || 1));
const editRoute = new Map(); // model id -> the way of sending reference images that worked
// Every picture is asked for without the provider's "AI generated" stamp (Seedream adds one in a corner unless told not to).
// Should a model ever refuse the setting itself, the same request is sent once more without it, so nothing stops working.
async function oneImageCall(model, prompt, refs, size, quality, n) {
  try { return await imageCall(model, prompt, refs, size, quality, n, true); }
  catch (e) { if (e?.status === 400 && /watermark/i.test(String(e?.raw || e?.message))) return imageCall(model, prompt, refs, size, quality, n, false); throw e; }
}
async function imageCall(model, prompt, refs, size, quality, n, plain) {
  const fmt = model.image.responseFormat;
  if (refs.length && model.image.edit) {
    const ed = model.image.edit;
    const use = refs.slice(0, ed.max_images || 1);
    const viaForm = (withSize) => {
      const form = new FormData();
      form.append('model', model.id);
      form.append('prompt', prompt);
      if (n > 1) form.append('n', String(n));
      if (withSize && size) form.append('size', size);
      if (quality && model.image.qualities?.includes(quality)) form.append('quality', quality);
      if (plain) form.append('watermark', 'false');
      for (const f of use) form.append('image', new Blob([fs.readFileSync(filePath(f))], { type: f.mime }), f.name);
      return callJson('/images/edits', { form });
    };
    // The gateway checks the size on edits too. Without one the result is always square, whatever the source.
    if (ed.content_type === 'multipart/form-data') {
      try { return await viaForm(true); }
      catch (e) { if (e?.status === 400 && /size/i.test(String(e?.raw || e?.message) + (e?.code || ''))) return viaForm(false); throw e; }
    }
    // JSON-style models: the gateway's model list and its real behaviour disagree about the address,
    // so try each accepted shape in turn. A refused attempt costs nothing.
    const urls = use.map(dataUrl);
    const viaJson = (endpoint, image) => callJson('/' + endpoint, { json: { model: model.id, prompt, size, response_format: fmt, image, ...(n > 1 ? { n } : {}), ...(quality && model.image.qualities?.includes(quality) ? { quality } : {}), ...(plain ? { watermark: false } : {}) } });
    const routes = {
      'edits-json': () => viaJson('images/edits', urls),
      'generations-json': () => viaJson(ed.endpoint || 'images/generations', urls),
      'edits-json-single': () => viaJson('images/edits', urls[0]),
      'edits-form': () => viaForm(true),
    };
    const order = Object.keys(routes).filter((k) => k !== 'edits-json-single' || urls.length === 1);
    const known = editRoute.get(model.id);
    if (known) order.unshift(...order.splice(order.indexOf(known), 1));
    let lastErr;
    for (const k of order) {
      try { const r = await routes[k](); editRoute.set(model.id, k); return r; }
      catch (e) {
        lastErr = e;
        if (![400, 404, 405, 415, 422].includes(e?.status) || /quota|balance|not allowed|content policy|safety|moderat/i.test(String(e?.raw || e?.message) + (e?.code || ''))) throw e;
        console.warn(`Image reference route ${k} refused for ${model.id}:`, e?.raw || e?.message);
      }
    }
    throw lastErr;
  }
  const body = { model: model.id, prompt, size, response_format: fmt, n };
  if (plain) body.watermark = false;
  if (quality && model.image.qualities?.includes(quality)) body.quality = quality;
  return callJson('/images/generations', { json: body });
}

/** Generate `count` images. Returns { media, credits } or throws (nothing charged). */
export async function runImage(user, { modelId, prompt, fileIds = [], size, quality, count = 1, meta = {}, strict = false }) {
  const model = await findModel(modelId);
  if (!model || model.type !== 'image') throw new UserError('Pick an image model.');
  if (!String(prompt).trim()) throw new UserError('Describe the image you want.');
  count = Math.max(1, Math.min(maxImageCount(model), Number(count) || 1));
  const refs = getFiles(user, fileIds).filter((f) => f.kind === 'image');
  // A shape such as "9:16" (Studio Pro, one-click apps) becomes the model's nearest real size.
  const shaped = size && !model.image.sizes.includes(size) && /:/.test(String(size)) ? sizeForShape(model, size) : null;
  if (shaped) size = shaped;
  if (strict && size && !model.image.sizes.includes(size)) throw new UserError(`${model.name} does not make ${String(size).replace('x', ' × ')} images. Choose one of: ${model.image.sizes.map((x) => x.replace('x', ' × ')).join(', ')}.`);
  if (strict && quality && model.image.qualities?.length && !model.image.qualities.includes(quality)) throw new UserError(`${model.name} does not have the quality "${quality}". Choose one of: ${model.image.qualities.join(', ')}.`);
  // With no size asked for, an edit keeps the shape of the picture it edits.
  const chosenSize = model.image.sizes.includes(size) ? size : (refs[0] && sizeLike(model, refs[0])) || model.image.sizes[0];
  const usdEach = imageUsd(model, chosenSize, quality);
  const est = usdToCredits(usdEach, model) * 1.5 * count;
  needCredits(user, est);

  // Ask for several images in one call when the model allows it, otherwise run calls in parallel.
  // Seedream counts reference pictures and results together: at most 15 per request.
  const roomWithRefs = refs.length ? Math.max(1, 15 - Math.min(refs.length, model.image.edit?.max_images || 1)) : Infinity;
  // GPT Image is slow (about 25 to 60 s a picture) and the gateway's proxy gives up at about 60 s, so it gets one picture per request.
  const perCall = /gpt-image/i.test(model.id) ? 1 : Math.min(count, model.image.maxN || 1, roomWithRefs);
  const calls = [];
  for (let left = count; left > 0; left -= perCall) calls.push(Math.min(perCall, left));
  const results = await Promise.allSettled(calls.map((n) => oneImageCall(model, prompt, refs, chosenSize, quality, n)));

  const media = [];
  let usd = 0, firstErr = null;
  for (const r of results) {
    if (r.status === 'rejected') { firstErr ??= r.reason; continue; }
    const j = r.value;
    const got = [];
    for (const d of j.data || []) {
      const m = { type: 'image', prompt, model: model.id, ...meta };
      if (d.b64_json) got.push(saveMedia(user, Buffer.from(d.b64_json, 'base64'), 'image/png', 'png', m));
      else if (d.url) got.push(await downloadTo(user, d.url, 'image/png', 'png', m));
    }
    media.push(...got);
    usd += got.length ? paidUsd(j.usage, usdEach * got.length) : 0;
  }
  if (!media.length) throw firstErr || new GatewayError('The model returned no image. No credits were charged.', 502);
  const credits = charge(user, usdToCredits(usd, model), `Image${media.length > 1 ? ' ×' + media.length : ''} · ${model.name}`, { model: model.id, usd, ...meta });
  return { model, media, credits, partialError: firstErr && media.length < count ? firstErr.message : null, params: { size: chosenSize, quality, count } };
}

// ---------- video ----------
export function videoParams(model, q, { strict = false } = {}) {
  const v = model.video;
  // From the prompt bar every value is checked against the capability table and refused with a clear message.
  // One-click apps send looser values, which are moved to the nearest supported one.
  const bad = (what, got, list, show = (x) => x) => new UserError(`${model.name} does not support ${what} ${show(got)}. Choose one of: ${list.map(show).join(', ')}.`);
  const has = (x) => x != null && x !== '';
  if (strict) {
    if (has(q.resolution) && !v.resolutions.includes(q.resolution)) throw bad('the resolution', q.resolution, v.resolutions);
    if (has(q.ratio) && !v.ratios.includes(q.ratio)) throw bad('the aspect ratio', q.ratio, v.ratios);
    if (has(q.duration) && !v.durations.includes(Number(q.duration))) throw bad('a length of', Number(q.duration), v.durations.filter((d) => d > 0), (d) => d + 's');
  }
  const pick = (list, want, pref) => (list.includes(want) ? want : list.includes(pref) ? pref : list[0]);
  const resolution = pick(v.resolutions, q.resolution, '720p');
  const ratio = pick(v.ratios, q.ratio, '16:9');
  const d = Number(q.duration);
  const duration = v.durations.includes(d) ? d : v.durations.includes(5) ? 5 : v.durations[0];
  return { resolution, ratio, duration };
}

/** Start `count` video tasks. target = { conversationId, messageId } | { generationId }. */
export async function startVideo(user, { modelId, prompt, fileIds = [], videoUrl, count = 1, params: q = {}, target, strict = false, task }) {
  const model = await findModel(modelId);
  if (!model || model.type !== 'video') throw new UserError('Pick a video model.');
  if (!String(prompt).trim()) throw new UserError('Describe the video you want.');
  const v = model.video;
  count = Math.max(1, Math.min(4, Number(count) || 1));
  if (String(prompt).length > 20000) throw new UserError('That prompt is too long. Keep it under 20,000 characters.');
  if (task && !v.tasks.includes(task)) throw new UserError(`${model.name} cannot do that. Pick another model, or another task for this model.`);
  const params = videoParams(model, q, { strict });
  const reserveEach = round2(estimateVideoCredits(model, params.resolution, params.duration) * 1.15);

  const files = getFiles(user, fileIds);
  const images = files.filter((f) => f.kind === 'image');
  const videos = files.filter((f) => f.kind === 'video');
  if (strict) {
    if (images.length && !v.imageToVideo) throw new UserError(`${model.name} does not take a reference image. Remove it, or pick a model that does.`);
    if ((videos.length || videoUrl) && !v.videoToVideo) throw new UserError(`${model.name} does not take a reference video. Remove it, or pick a model that edits video.`);
    if (images.length > (v.maxImages || 1)) throw new UserError(`${model.name} takes ${v.maxImages || 1} reference image at most.`);
    if (videos.length + (videoUrl ? 1 : 0) > (v.maxVideos || 1)) throw new UserError(`${model.name} takes ${v.maxVideos || 1} reference video at most.`);
    if (task === 'edit' && !videos.length && !videoUrl) throw new UserError('Add the video you want to edit first.');
  }
  // Checked last, so a wrong setting is explained before the balance is.
  needCredits(user, reserveEach * count);
  const body = { model: model.id, prompt, duration: params.duration, ratio: params.ratio, resolution: params.resolution, watermark: false };
  if (images.length && v.imageToVideo) body.image_urls = images.slice(0, v.maxImages || 1).map((f) => pictureLink(f) || dataUrl(f));
  if (v.videoToVideo && (videos.length || videoUrl)) {
    const urls = [];
    if (videoUrl) {
      if (!/^https?:\/\/\S+$/i.test(videoUrl)) throw new UserError('The reference video link must start with http:// or https://.');
      urls.push(videoUrl);
    }
    for (const f of videos) {
      const u = publicFileUrl(f);
      if (!u) throw new UserError('Uploaded reference videos need the app to run at a public https address (set PUBLIC_URL). For now, paste a public link to the video instead.');
      urls.push(u);
    }
    body.video_urls = urls.slice(0, v.maxVideos || 1);
  }
  if (!v.textToVideo && !body.image_urls && !body.video_urls) throw new UserError(v.videoToVideo ? `${model.name} edits an existing video. Add a reference video first.` : `${model.name} needs a reference image.`);

  const started = await Promise.allSettled(Array.from({ length: count }, () => callJson('/videos/generations', { json: body })));
  const taskIds = [];
  let firstErr = null;
  for (const r of started) {
    if (r.status === 'fulfilled' && r.value?.task_id) taskIds.push(r.value.task_id);
    else firstErr ??= r.reason || new GatewayError('The video provider did not start a task.', 502);
  }
  if (!taskIds.length) throw firstErr;
  for (const tid of taskIds) {
    charge(user, reserveEach, `Video (reserved) · ${model.name}`, { model: model.id, taskId: tid, ...target });
    db.tasks.push({ taskId: tid, userId: user.id, ...target, model: model.id, prompt, reserved: reserveEach, status: 'pending', createdAt: now(), ...(inPro() ? { pro: true } : {}) });
  }
  save();
  return { model, taskIds, params, reserved: round2(reserveEach * taskIds.length), refs: files.map(fileMeta), partialError: firstErr && taskIds.length < count ? firstErr.message : null };
}

function settleTarget(t) {
  if (t.generationId) return db.generations.find((g) => g.id === t.generationId);
  const conv = db.conversations.find((c) => c.id === t.conversationId);
  return conv?.messages.find((m) => m.id === t.messageId);
}

export async function pollTask(t) {
  if (t.status !== 'pending' || t.polling) return;
  t.polling = true;
  try {
    const j = await callJson('/videos/generations/' + encodeURIComponent(t.taskId), { method: 'GET' });
    const user = db.users.find((u) => u.id === t.userId);
    const rec = settleTarget(t);
    if (rec) rec.progress = j.status;
    if (['succeeded', 'failed', 'cancelled', 'expired'].includes(j.status)) {
      t.status = j.status;
      const model = await findModel(t.model);
      const name = model?.name || t.model;
      if (j.status === 'succeeded' && j.content?.video_url) {
        const media = await downloadTo(user, j.content.video_url, 'video/mp4', 'mp4', { type: 'video', prompt: t.prompt || rec?.prompt, model: t.model, conversationId: t.conversationId, generationId: t.generationId });
        const actual = Number(j.usage?.charge_amount) > 0 ? round2(usdToCredits(j.usage.charge_amount, t.model)) : t.reserved;
        const diff = round2(t.reserved - actual);
        if (diff > 0) grant(user, diff, 'refund', `Video settle refund · ${name}`, { taskId: t.taskId });
        else if (diff < 0) charge(user, -diff, `Video settle · ${name}`, { taskId: t.taskId, pro: !!t.pro });
        t.credits = actual;
        if (rec) { rec.media = [...(rec.media || []), mediaRef(media)]; }
      } else {
        grant(user, t.reserved, 'refund', `Video ${j.status}, refunded · ${name}`, { taskId: t.taskId });
        t.credits = 0;
        const why = j.error?.message || j.fail_reason; // the gateway reports a failed task's reason as fail_reason
        recordFailure({ kind: 'video_task', model: t.model, path: 'video task', reason: why || `Task ${j.status}`, code: j.status, userId: t.userId });
        t.error = why ? `${tidyProviderText(why)} Your credits were refunded.` : `Video generation ${j.status}. Your credits were refunded.`;
      }
      if (rec) {
        const all = db.tasks.filter((x) => (t.generationId ? x.generationId === t.generationId : x.messageId === t.messageId));
        rec.credits = round2(all.reduce((n, x) => n + (x.status === 'pending' ? x.reserved : x.credits || 0), 0));
        if (all.every((x) => x.status !== 'pending')) {
          rec.status = rec.media?.length ? 'done' : 'error';
          if (!rec.media?.length) rec.error = t.error;
          else if (all.some((x) => x.error)) rec.note = `${all.filter((x) => x.error).length} of ${all.length} clips failed and were refunded.`;
        }
      }
      save();
    }
  } catch (e) {
    console.warn('poll', t.taskId, e.message);
  } finally {
    t.polling = false;
  }
}

// ---------- prompt enhancer ----------
// Short on purpose: a few clear points beat a long paragraph, and people can still read and tweak the result.
const ENHANCE_SYSTEM = {
  image: `You improve a short idea into a brief prompt for an AI image model.
Rules:
- Reply with 4 to 6 short lines, each starting with "- " and a 1 or 2 word label, for example "- Subject:", "- Setting:", "- Lighting:", "- Style:", "- Composition:".
- Each line is under 14 words. The whole reply is under 70 words.
- Keep every detail the user gave, including any text in quotes, word for word. Do not invent a different subject.
- Reply with the lines only. No intro, no closing sentence.`,
  imageEdit: `The user attached a picture and wants to edit it or use it as a reference for an AI image model. Look at the picture, understand what is in it, then improve their request into a brief prompt.
Rules:
- Reply with 3 to 5 short lines, each starting with "- " and a 1 or 2 word label, for example "- Change:", "- Keep:", "- Lighting:", "- Style:".
- The first line says the change the user asked for. One line starts with "- Keep:" and names what must stay the same, using what you see in the picture (the subject, pose, colours, text).
- Each line is under 14 words. The whole reply is under 60 words.
- Do not describe the whole picture. Do not add changes the user did not ask for.
- Reply with the lines only. No intro, no closing sentence.`,
  video: 'You rewrite short ideas into one prompt for an AI video model (Seedance). Describe the subject, action over time, camera movement, lighting, mood and sound in one paragraph under 110 words. Keep every detail the user gave. Reply with the prompt only.',
  // The ones below serve the enhancer button on every prompt box (public/enhance.js); each adapts to where it is used.
  chat: `You improve a message a person is about to send to an AI assistant, so the assistant understands it better. Do not answer it.
Rules:
- Keep their goal, every detail, names and numbers, and any text in quotes word for word. Do not invent facts.
- Make the ask clear and specific: what they want, the useful context they gave, and the form of the answer if that helps (a list, a table, a short email).
- Write as the person, in their language, in plain words. Under 90 words.
- Reply with the improved message only. No intro, no quotes around it.`,
  scene: `You improve the description of ONE scene in a multi-scene video, for an AI video model (Seedance).
Rules:
- One paragraph under 70 words: the subject, what happens in the few seconds of the scene, the camera (framing and movement) and the light.
- Keep every detail the user gave, including names of characters and products. Do not add new characters, text on screen, narration or music.
- Reply with the scene description only.`,
  agent: `You improve a brief for an AI video and ad agent that plans and makes ads, UGC clips, short dramas and product shots.
Rules:
- Keep every detail the user gave (product, brand, people, length, platform). Never invent prices, numbers or claims.
- Make it a clear brief in under 100 words: what to make and for which platform, who it is for, the hook in the first seconds, the story beats, the look and mood, and the call to action if it is an ad.
- Write as the person ("my product", "our brand"), in their language, plain sentences, no headings.
- Reply with the brief only.`,
  brand: `You tidy one field of a brand kit used to write ads. The field name is given.
Rules:
- Keep it factual: use only what the user wrote. Never invent prices, numbers, awards or claims.
- Make it clear, specific and useful for an ad writer. Keep the same language. Under 60 words.
- If the field is a list of selling points, reply with one short point per line, no bullets.
- Reply with the new text for the field only.`,
};
const ENHANCE_MODES = new Set(['image', 'video', 'chat', 'scene', 'agent', 'brand']);
async function firstModel(ids, test) {
  for (const p of ids.filter(Boolean)) { const m = await findModel(p); if (m?.type === 'chat' && (!test || test(m))) return m; }
  return null;
}
export async function enhancePrompt(user, prompt, mode, fileIds = [], opts = {}) {
  mode = ENHANCE_MODES.has(mode) ? mode : 'image';
  const images = mode === 'image' ? getFiles(user, fileIds || []).filter((f) => f.kind === 'image').slice(0, 2) : [];
  const typed = String(prompt || '').trim().slice(0, 4000);
  if (!typed && !images.length) throw new UserError('Type an idea first.');
  needCredits(user, centsToCredits(0.5));
  // A photo with no words: suggest the most useful polish for what is in the picture.
  const text = typed || 'No request was typed. Suggest a tasteful improvement of this picture: better light, cleaner background, sharper detail.';
  const tries = [];
  if (images.length) {
    // A model that can see reads the picture first. If it fails, fall back to the words alone.
    const vm = await firstModel([process.env.ENHANCE_VISION_MODEL, 'qwen3.8-flash', 'gemini-3.1-flash-lite', 'qwen3.6-flash', 'gpt-5.6-luna', 'mimo-v2.6-flash'], (m) => m.vision);
    if (vm) tries.push({ model: vm, messages: [{ role: 'system', content: ENHANCE_SYSTEM.imageEdit }, { role: 'user', content: [{ type: 'text', text }, ...images.map((f) => ({ type: 'image_url', image_url: { url: dataUrl(f) } }))] }] });
  }
  const tm = await firstModel([process.env.ENHANCE_MODEL, 'deepseek-v4-flash', 'qwen3.8-flash', 'glm-5.3-flash', 'gpt-5.6-luna']);
  if (tm && typed) tries.push({ model: tm, messages: [{ role: 'system', content: ENHANCE_SYSTEM[mode] || ENHANCE_SYSTEM.image }, { role: 'user', content: (images.length ? 'A picture is attached that will be edited or used as a reference. Request: ' : '') + (mode === 'brand' && opts.field ? `Field: ${String(opts.field).slice(0, 60)}\nText: ` : '') + text }] });
  if (!tries.length) throw new UserError('No prompt helper model is available.');
  let lastErr;
  for (const t of tries) {
    try {
      const j = await callJson('/chat/completions', { json: { model: t.model.id, max_tokens: 1200, messages: t.messages } });
      let out = (j.choices?.[0]?.message?.content || '').trim().replace(/^```\w*\n?|```$/g, '').replace(/^"|"$/g, '').trim();
      if (mode === 'image') out = out.split('\n').map((l) => l.replace(/^\s*[*•·]\s+/, '- ').replace(/\*\*/g, '').trimEnd()).filter((l) => l.trim()).slice(0, 7).join('\n');
      if (!out) throw new GatewayError('The prompt helper returned nothing. No credits were charged.', 502);
      const usd = paidUsd(j.usage, ((j.usage?.prompt_tokens || 300) * t.model.price.inPerM + (j.usage?.completion_tokens || 150) * t.model.price.outPerM) / 1e6);
      const credits = charge(user, usdToCredits(usd, t.model), `Prompt enhance · ${t.model.name}`, { model: t.model.id, usd });
      return { prompt: out, credits, sawImage: t.messages[1].content instanceof Array };
    } catch (e) { lastErr = e; console.warn(`Prompt enhance with ${t.model.id} failed:`, e.message); }
  }
  throw lastErr;
}
