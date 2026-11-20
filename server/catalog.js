// Loads the AICredit model list (with official prices and discounts) and turns
// it into the app's catalog: model type, capabilities and credit prices.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { usdToCredits, setDiscounts, markupFor } from './credits.js';
import { blurbFor, useTagFor } from './blurbs.js';
import { refusedModels } from './gateway.js';

import { flags } from './flags.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = () => process.env.AICREDIT_BASE_URL || 'https://aicreditapi.com/api/v1';
let cache = { at: 0, models: [] };

// Pixel sizes used to estimate Seedance video tokens (16:9).
export const RES_PIXELS = { '480p': [854, 480], '720p': [1280, 720], '1080p': [1920, 1080], '4K': [3840, 2160] };
const VIDEO_FPS = 24;
const TYPICAL_IMAGE_TOKENS = 1300; // token-billed image models, one 1024px image
// A typical chat reply, measured on real Scenly chats (2026-11-20, 119 replies: median 3,229 tokens in, 1,345 out).
// Input grows as a chat goes on because the earlier messages are sent again. The model menus and plan guides use it.
export const TYPICAL_MSG = { input: 3000, output: 1300 };

const num = (v) => (v == null ? null : Number(v));

function rate(tier, type) {
  const r = tier?.rates?.find((x) => x.type === type);
  return r ? Number(r.price) : null;
}

function build(raw) {
  const out = [];
  for (const m of raw) {
    if (!m.is_active) continue;
    const gt = (m.generation_types || [])[0];
    const type = gt === 'text' ? 'chat' : gt;
    if (!['chat', 'image', 'video'].includes(type)) continue;
    const rc = m.request_constraints || {};
    const disc = 1 - Number(m.discount_percentage || 0) / 100;
    const sc = m.showcase || {};
    const inputs = String(sc.specs?.inputs || 'Text');
    const tier = (m.pricing || []).find((p) => !p.conditions?.has_video_input) || m.pricing?.[0];
    const model = {
      id: m.id,
      name: m.name,
      type,
      provider: sc.provider || m.parent_provider,
      parent: m.parent_provider || '',
      description: sc.description || '',
      short: sc.short || '',
      blurb: blurbFor(m, type),
      useTag: useTagFor(m, type),
      caps: sc.caps || [],
      vision: /image/i.test(inputs) && type === 'chat',
      pdfInput: /pdf/i.test(inputs),
      context: sc.specs?.context || null,
      discountPct: Number(m.discount_percentage || 0),
      markup: markupFor(m.discount_percentage),
      constraints: rc,
      price: {},
    };
    if (type === 'chat') {
      const inUsd = rate(tier, 'input_tokens') ?? rate(tier, 'cached_input_tokens') ?? 0;
      const outUsd = rate(tier, 'output_tokens') ?? 0;
      model.price = {
        officialInPerM: inUsd, officialOutPerM: outUsd,
        inPerM: inUsd * disc, outPerM: outUsd * disc,
        creditsInPerM: usdToCredits(inUsd * disc, model), creditsOutPerM: usdToCredits(outUsd * disc, model),
      };
      model.price.creditsPerMessage = usdToCredits(((TYPICAL_MSG.input * inUsd + TYPICAL_MSG.output * outUsd) / 1e6) * disc, model);
    } else if (type === 'image') {
      const per = rate(tier, 'image');
      const outTok = rate(tier, 'image_output_tokens') ?? rate(tier, 'output_tokens');
      const usd = per != null ? per * disc : ((outTok || 0) * TYPICAL_IMAGE_TOKENS / 1e6) * disc;
      model.price = { usdPerImage: usd, officialUsdPerImage: disc > 0 ? usd / disc : usd, creditsPerImage: usdToCredits(usd, model), estimated: per == null };
    } else if (type === 'video') {
      const specs = sc.specs || {};
      const modes = rc.input_modes || ['text_to_video', 'image_to_video'];
      // Prefer the gateway's hard limits; fall back to the model's published specs.
      const specRes = String(specs.resolutions || '').match(/480p|720p|1080p|4K/g);
      const resolutions = rc.allowed_resolutions || (specRes?.length ? [...new Set(specRes)] : ['480p', '720p', '1080p']);
      const specRatios = String(specs.aspectRatios || '').match(/\d+:\d+|adaptive/g);
      const ratios = rc.allowed_ratios || (specRatios?.length ? [...new Set(specRatios)] : ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']);
      let durations = rc.allowed_durations;
      if (!durations) {
        const mm = String(specs.maxDuration || '').match(/(\d+)\s*[–-]\s*(\d+)\s*s/);
        let [lo, hi] = mm ? [Number(mm[1]), Number(mm[2])] : [4, 15];
        // The API docs give 4 to 15 seconds for every model, while some model pages say 30.
        // Longer clips stay off until a real call has proved them: set VIDEO_MAX_SECONDS to raise the cap.
        hi = Math.min(hi, Math.max(lo, Number(process.env.VIDEO_MAX_SECONDS) || 15));
        durations = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      }
      const perSecond = {}, usdPerSecond = {};
      for (const r of resolutions) {
        const t = (m.pricing || []).find((p) => (!p.conditions?.resolution || p.conditions.resolution.includes(r)) && !!p.conditions?.has_video_input === (modes.length === 1 && modes[0] === 'video_to_video')) || tier;
        const perM = rate(t, 'video_output_tokens') || 0;
        const [w, h] = RES_PIXELS[r] || RES_PIXELS['720p'];
        perSecond[r] = usdToCredits(((w * h * VIDEO_FPS) / 1024 / 1e6) * perM * disc, model);
        usdPerSecond[r] = ((w * h * VIDEO_FPS) / 1024 / 1e6) * perM * disc;
      }
      model.price = { creditsPerSecond: perSecond, usdPerSecond };
      model.video = {
        resolutions, ratios, durations,
        textToVideo: modes.includes('text_to_video'),
        imageToVideo: modes.includes('image_to_video'),
        videoToVideo: modes.includes('video_to_video'),
        maxImages: rc.max_image_urls ?? (modes.includes('image_to_video') ? 1 : 0),
        maxVideos: rc.max_video_urls ?? (modes.includes('video_to_video') ? 1 : 0),
        audio: (sc.caps || []).includes('audio'),
      };
      // What this model can be asked to do. The prompt bar and the server checks both read this list.
      model.video.tasks = [
        (model.video.textToVideo || model.video.imageToVideo) && 'create',
        model.video.videoToVideo && 'edit',
        model.video.imageToVideo && flags().videoExtend && 'extend',
      ].filter(Boolean);
      if (model.video.tasks.includes('create')) model.tag = videoTag(model.id) || undefined;
    }
    if (type === 'image') {
      model.image = {
        sizes: rc.allowed_sizes || ['1024x1024'],
        edit: rc.image_edit || null,
        responseFormat: (rc.allowed_response_formats || ['b64_json']).includes('b64_json') ? 'b64_json' : 'url',
        maxN: Math.max(...(rc.allowed_n || [1])),
        // The gateway documents a quality setting for the GPT Image family only.
        qualities: rc.allowed_qualities || (/gpt-image/i.test(m.id) ? ['low', 'medium', 'high'] : []),
        // Token-billed models: the price of one picture grows with its size (and, for GPT Image, its quality).
        outUsdPerM: model.price.estimated ? (rate(tier, 'image_output_tokens') ?? rate(tier, 'output_tokens') ?? 0) * disc : null,
        tokenStyle: /gpt-image/i.test(m.id) ? 'gpt' : 'gemini',
      };
      // Credits for one picture at each size (and quality), so pickers can show the real price of the choice.
      if (model.image.outUsdPerM) {
        model.price.creditsBySize = {};
        for (const sz of model.image.sizes) {
          const row = {};
          for (const q of model.image.qualities.length ? model.image.qualities : ['']) row[q] = imageCredits(model, sz, q || undefined);
          model.price.creditsBySize[sz] = row;
        }
      }
    }
    out.push(model);
  }
  setDiscounts(out);
  const order = { chat: 0, image: 1, video: 2 };
  return out.sort((a, b) => order[a.type] - order[b.type] || a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
}

// A model the gateway refused for this account stays hidden for 30 minutes, then is offered again.
const REFUSED_FOR_MS = () => (Number(process.env.REFUSED_MODEL_MINUTES) || 30) * 60000;
const usable = (list) => { if (!refusedModels.size) return list; const cut = Date.now() - REFUSED_FOR_MS(); for (const [k, t] of refusedModels) if (t < cut) refusedModels.delete(k); return refusedModels.size ? list.filter((m) => !refusedModels.has(m.id)) : list; };
export async function getCatalog() { return usable(await loadCatalog()); }
async function loadCatalog() {
  if (Date.now() - cache.at < 60 * 60 * 1000 && cache.models.length) return cache.models;
  try {
    const r = await fetch(BASE() + '/models', { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (!Array.isArray(j.results)) throw new Error('bad model list');
    cache = { at: Date.now(), models: build(j.results) };
  } catch (e) {
    if (!cache.models.length) {
      const snap = JSON.parse(fs.readFileSync(path.join(here, 'models-snapshot.json'), 'utf8'));
      cache = { at: Date.now() - 55 * 60 * 1000, models: build(snap.results) };
      console.warn('Using bundled model snapshot:', e.message);
    }
  }
  return cache.models;
}

// Friendly labels for the video models that create clips, shown next to their names in the Builder and in Video Studio.
const VIDEO_TAGS = [
  [/seedance-2-5(?!-vision)|seed-2\.5(?!-vision)/i, '🎬 Best Quality · Long Story Chain'],
  [/dreamina/i, '✨ Cinematic · Music & Drama'],
  [/seedance-2\.0-fast/i, '⚡ Fast Draft · Lowest Credits'],
  [/doubao-seedance-2\.0$/i, '🎥 Balanced · Social & Ads'],
];
export const videoTag = (mid) => VIDEO_TAGS.find(([re]) => re.test(mid))?.[1] || '';

// Output tokens per megapixel for GPT Image (OpenAI's published table for a 1024 × 1024 picture, which scales with area).
const GPT_TOKENS_PER_MP = { low: 272, medium: 1056, high: 4160, auto: 4160 };
const MP = 1024 * 1024;
/** Pixels of a size the gateway accepts: "2048x1152", or a "2K"/"3K"/"4K" class (taken as square). */
export function sizePixels(size) {
  const m = /^(\d+)x(\d+)$/.exec(String(size || ''));
  if (m) return Number(m[1]) * Number(m[2]);
  const k = /^(\d)K$/i.exec(String(size || ''));
  return k ? (Number(k[1]) * 1024) ** 2 : MP;
}
/** Estimated provider cost (after the AICredit discount) of one picture at this size and quality. */
export function imageUsd(model, size, quality) {
  const im = model?.image;
  if (!im?.outUsdPerM) return model?.price?.usdPerImage || 0;
  const mp = Math.max(0.25, sizePixels(size || im.sizes?.[0]) / MP);
  // Gemini image models bill a flat ~1,290 tokens up to about 1 megapixel and more for 2K and 4K pictures.
  const tokens = im.tokenStyle === 'gpt' ? (GPT_TOKENS_PER_MP[quality] || GPT_TOKENS_PER_MP.medium) * mp : mp <= 1.1 ? TYPICAL_IMAGE_TOKENS : mp <= 4.5 ? 1800 : 2500;
  return (tokens * im.outUsdPerM) / 1e6;
}
export function imageCredits(model, size, quality) { return usdToCredits(imageUsd(model, size, quality), model); }

export async function findModel(mid) {
  return (await getCatalog()).find((m) => m.id === mid);
}

export function estimateVideoCredits(model, resolution, duration) {
  const per = model.price.creditsPerSecond[resolution] ?? Object.values(model.price.creditsPerSecond)[0] ?? 0;
  return per * (duration > 0 ? duration : 10);
}

// The gateway's own cost for a call. Since 2026-11-17 it sometimes reports 0 for calls that did run and were
// billed, which made answers free in the app; a zero (or missing) amount for real work uses the price list.
export function paidUsd(usage, fallbackUsd) {
  const n = Number(usage?.charge_amount);
  return Number.isFinite(n) && n > 0 ? n : Number(fallbackUsd) || 0;
}

// Fallback cost when the gateway does not return charge_amount.
export function estimateChatUsd(model, inTokens, outTokens) {
  return (inTokens * model.price.inPerM + outTokens * model.price.outPerM) / 1e6;
}
