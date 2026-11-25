// Direct BytePlus services, outside the AICredit gateway:
//  - OmniHuman 2.0 (Vision AI): one photo + a voice track -> a talking, moving video (720p, 4 to 300 s).
//  - Seed TTS 3.0 (Seed Speech): a script -> spoken audio, preset voices that speak 100+ languages.
// Each service has its own API key, set on the server only. People never see the supplier: OmniHuman sits in the
// normal video model list and the voice tool is simply "AI voice".
// API facts checked against docs.byteplus.com on 2026-11-24 (see the project memory note byteplus-direct-api).
import crypto from 'node:crypto';
import { flags } from './flags.js';
import { userWords, gatewayLog } from './gateway.js';

const VISION_BASE = () => (process.env.BYTEPLUS_VISION_BASE_URL || 'https://openapi.cv.bytepluses.com').replace(/\/$/, '');
const SPEECH_BASE = () => (process.env.BYTEPLUS_SPEECH_BASE_URL || 'https://voice.ap-southeast-1.bytepluses.com').replace(/\/$/, '');
const visionKey = () => process.env.BYTEPLUS_VISION_API_KEY || '';
const speechKey = () => process.env.BYTEPLUS_SPEECH_API_KEY || '';

export const OMNI_REQ_KEY = 'realman_avatar_picture_omni20_cv';
export const OMNI_ID = 'omnihuman-2.0';
export const OMNI_API_VERSION = process.env.BYTEPLUS_VISION_API_VERSION || '2024-06-06';
export const TTS_MODEL = () => process.env.BYTEPLUS_TTS_MODEL || 'dola-seed-tts-3.0';

// Official prices (USD). OmniHuman 2.0: $0.07 per second of video. Seed TTS 3.0: $20 per million characters.
export const OMNI_USD_PER_SECOND = () => Number(process.env.OMNIHUMAN_USD_PER_SECOND) || 0.07;
export const TTS_USD_PER_MCHAR = () => Number(process.env.SEED_TTS_USD_PER_MCHAR) || 20;
export const OMNI_AUDIO = { min: 4, max: 300, maxMb: 15 };
export const TTS_MAX_CHARS = 10000;

export const avatarOn = () => flags().avatarVideo && !!visionAuthKind();
export const aiVoiceOn = () => flags().aiVoice && !!speechKey();

export class ProviderError extends Error {
  constructor(message, status = 502, code) { super(message); this.status = status; this.code = code; }
}

// ---------- OmniHuman (Vision AI) ----------
// Two ways in, whichever pair of settings is present:
//  - Access Key: the standard BytePlus cloud credential (AK + SK), each request signed. This is what the console's
//    sample code and most Vision AI accounts use, so it is tried first.
//  - API Key: a single Bearer token, where the account has one for Vision AI.
// Both speak the same JSON: success is code 10000, data holds the task.
const visionAk = () => process.env.BYTEPLUS_ACCESS_KEY_ID || '';
const visionSk = () => process.env.BYTEPLUS_SECRET_ACCESS_KEY || '';
const VISION_REGION = () => process.env.BYTEPLUS_VISION_REGION || 'ap-singapore-1';
const VISION_SIGNED_BASE = () => (process.env.BYTEPLUS_VISION_SIGNED_BASE_URL || process.env.BYTEPLUS_VISION_BASE_URL || 'https://cv.byteplusapi.com').replace(/\/$/, '');
const signedRoute = () => !!(visionAk() && visionSk()) && !visionKey();
export const visionAuthKind = () => (signedRoute() ? 'access-key' : visionKey() ? 'api-key' : null);

const hex = (b) => Buffer.from(b).toString('hex');
const sha256 = (s) => hex(crypto.createHash('sha256').update(s).digest());
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();

// The BytePlus cloud signature (the same shape as AWS SigV4, with its own names).
export function signedRequest(action, bodyText, date = new Date()) {
  const url = new URL(VISION_SIGNED_BASE() + '/');
  const query = `Action=${action}&Version=${encodeURIComponent(OMNI_API_VERSION)}`;
  const t = date.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = t.slice(0, 8);
  const payload = sha256(bodyText);
  const headers = { 'content-type': 'application/json', host: url.host, 'x-content-sha256': payload, 'x-date': t };
  const names = Object.keys(headers).sort();
  const canon = ['POST', '/', query, ...names.map((n) => `${n}:${headers[n]}`), '', names.join(';'), payload].join('\n');
  const scope = `${day}/${VISION_REGION()}/cv/request`;
  const toSign = ['HMAC-SHA256', t, scope, sha256(canon)].join('\n');
  const key = hmac(hmac(hmac(hmac(visionSk(), day), VISION_REGION()), 'cv'), 'request');
  const sig = hex(hmac(key, toSign));
  return {
    url: `${url.origin}/?${query}`,
    headers: { ...headers, Authorization: `HMAC-SHA256 Credential=${visionAk()}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}` },
  };
}

// One call to Vision AI, by whichever route the settings ask for.
function visionCall(action, path, body) {
  const text = JSON.stringify(body);
  if (signedRoute()) {
    const s = signedRequest(action, text);
    return fetch(s.url, { method: 'POST', headers: s.headers, body: text, signal: AbortSignal.timeout(30000) });
  }
  return fetch(VISION_BASE() + path, { method: 'POST', headers: { Authorization: `Bearer ${visionKey()}`, 'Content-Type': 'application/json' }, body: text, signal: AbortSignal.timeout(30000) });
}

// Success is code 10000. 50429/50430 are rate limits, 50500/50501 are worth one retry, 50510 is the content filter.
function visionError(j, status) {
  const code = Number(j?.code) || status;
  const refused = status === 401 || status === 403 || code === 50400 || code === 100004;
  gatewayLog(refused ? `BytePlus Vision credentials refused (${visionAuthKind() === 'access-key' ? 'BYTEPLUS_ACCESS_KEY_ID / BYTEPLUS_SECRET_ACCESS_KEY' : 'BYTEPLUS_VISION_API_KEY'})` : 'BytePlus Vision said', code, j?.message || JSON.stringify(j || '').slice(0, 300));
  const kind = code === 50429 || code === 50430 ? 'crowded' : code === 50510 ? 'blocked' : 'busy';
  return new ProviderError(userWords(kind), code === 50429 || code === 50430 ? 429 : 502, String(code));
}
async function vision(action, path, body, { tries = 2 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    let r, j;
    try {
      r = await visionCall(action, path, body);
      j = await r.json().catch(() => null);
    } catch (e) { gatewayLog('BytePlus Vision network', '', e.message); last = new ProviderError(userWords('busy'), 502, 'network'); continue; }
    if (r.ok && Number(j?.code) === 10000) return j.data || {};
    last = visionError(j, r.status);
    if (![50500, 50501].includes(Number(j?.code)) && r.status < 500) break;
  }
  throw last;
}

/** Start a talking-video task. Returns the provider's task id. */
export async function omniSubmit({ imageUrl, audioUrl, prompt }) {
  const body = { req_key: OMNI_REQ_KEY, image_urls: [imageUrl], audio_url: audioUrl, enable_watermark: false };
  if (prompt && String(prompt).trim()) body.prompt = String(prompt).trim().slice(0, 2000);
  const d = await vision('CVSync2AsyncSubmitTask', '/api/common/v3/submit_task_v2', body);
  if (!d.task_id) throw new ProviderError(userWords('busy'), 502, 'no_task');
  return String(d.task_id);
}

/** Where a task is: { status: 'pending' | 'succeeded' | 'failed', videoUrl?, reason? }. */
export async function omniResult(taskId) {
  let r, j;
  try {
    r = await visionCall('CVSync2AsyncGetResult', '/api/common/v3/get_result_v2', { req_key: OMNI_REQ_KEY, task_id: String(taskId) });
    j = await r.json().catch(() => null);
  } catch (e) { return { status: 'pending', note: e.message }; }
  const code = Number(j?.code);
  if (code === 10000) {
    const s = j.data?.status;
    if (s === 'done' && j.data?.video_url) return { status: 'succeeded', videoUrl: j.data.video_url };
    if (['in_queue', 'generating'].includes(s) || (s === 'done' && !j.data?.video_url)) return { status: 'pending', progress: s };
    return { status: 'failed', reason: `Task ${s || 'unknown'}` };
  }
  // A rate limit or a passing server error while asking: ask again on the next round.
  if ([50429, 50430, 50500, 50501].includes(code) || !j) return { status: 'pending', note: String(code || r?.status) };
  return { status: 'failed', reason: j?.message || `code ${code}`, blocked: code === 50510 };
}

// ---------- Seed TTS 3.0 (Seed Speech) ----------
/** Speak a script. Returns { audio: Buffer (mp3), chars }. Throws ProviderError with a calm wording. */
export async function speak({ text, voiceId, speed, language }) {
  const t = String(text || '').trim();
  if (!t) throw new ProviderError('Type what the voice should say.', 400);
  if (t.length > TTS_MAX_CHARS) throw new ProviderError(`That script is too long. Keep it under ${TTS_MAX_CHARS.toLocaleString('en-US')} characters.`, 400);
  const body = { text: t, model_id: TTS_MODEL(), output_format: { format: 'mp3', sample_rate: 24000 } };
  if (language) body.language_code = language;
  const sp = Number(speed);
  if (Number.isFinite(sp) && sp > 0 && Math.abs(sp - 1) > 0.01) body.voice_settings = { speed: Math.min(2, Math.max(0.5, sp)) };
  let r;
  try {
    r = await fetch(`${SPEECH_BASE()}/api/v3/text-to-speech/${encodeURIComponent(voiceId)}/streaming`, { method: 'POST', headers: { 'X-Api-Key': speechKey(), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  } catch (e) { gatewayLog('BytePlus Speech network', '', e.message); throw new ProviderError(userWords('slow'), 504, 'network'); }
  const raw = await r.text();
  const chunks = []; let err = null; let done = false;
  for (const line of raw.split('\n')) {
    const s = line.trim(); if (!s) continue;
    let ev; try { ev = JSON.parse(s); } catch { continue; }
    if (ev.event === 'audio' && ev.audio) chunks.push(Buffer.from(ev.audio, 'base64'));
    else if (ev.event === 'error') err = ev.error || ev;
    else if (ev.event === 'final') done = true;
  }
  if (!r.ok || err || !chunks.length) {
    const msg = err?.message || err?.code || raw.slice(0, 300);
    gatewayLog(r.status === 401 || r.status === 403 ? 'BytePlus Speech key refused (check BYTEPLUS_SPEECH_API_KEY)' : 'BytePlus Speech said', r.status, typeof msg === 'string' ? msg : JSON.stringify(msg));
    throw new ProviderError(userWords(r.status === 429 ? 'crowded' : 'busy'), r.status === 429 ? 429 : 502, 'tts_failed');
  }
  if (!done) gatewayLog('BytePlus Speech', r.status, 'stream ended without a final event; keeping the audio that arrived');
  return { audio: Buffer.concat(chunks), chars: t.length };
}

// ---------- preset voices ----------
// A short, plain list picked from the Voice List 3.0 page. Every preset voice speaks every supported language
// (the language follows the script), so the list is grouped by accent and style, not language.
// Voices named after real people or famous characters are left out on purpose.
export const VOICES = [
  // American English
  { id: 'multi_female_sarah_v3_uranus_bigtts', name: 'Sarah', gender: 'female', accent: 'American', style: 'Soft and bright' },
  { id: 'multi_female_wens_v3_uranus_bigtts', name: 'Nora', gender: 'female', accent: 'American', style: 'Polished, for ads' },
  { id: 'multi_female_skye_v3_uranus_bigtts', name: 'Skye', gender: 'female', accent: 'American', style: 'Warm and heartfelt' },
  { id: 'multi_female_myra_cmb_v3_uranus_bigtts', name: 'Sunny', gender: 'female', accent: 'American', style: 'Lively and upbeat' },
  { id: 'multi_female_kate_v3_uranus_bigtts', name: 'Kate', gender: 'female', accent: 'American', style: 'Natural, conversational' },
  { id: 'multi_female_xinwenjieshuonv_v3_uranus_bigtts', name: 'Kayla', gender: 'female', accent: 'American', style: 'Young and outgoing, for UGC' },
  { id: 'multi_female_allison_v3_uranus_bigtts', name: 'Allison', gender: 'female', accent: 'American', style: 'Clear narrator' },
  { id: 'multi_male_livesteve_v3_uranus_bigtts', name: 'Mason', gender: 'male', accent: 'American', style: 'Bright, for product promos' },
  { id: 'multi_male_valentino_corey_v3_uranus_bigtts', name: 'Clark', gender: 'male', accent: 'American', style: 'Confident narrator' },
  { id: 'multi_male_ryan_v3_uranus_bigtts', name: 'Ryan', gender: 'male', accent: 'American', style: 'Deep and calm' },
  { id: 'multi_male_marcus_v3_uranus_bigtts', name: 'Marcus', gender: 'male', accent: 'American', style: 'Rich storyteller' },
  { id: 'multi_male_russell_v3_uranus_bigtts', name: 'Russell', gender: 'male', accent: 'American', style: 'Warm and friendly' },
  { id: 'multi_male_motivational-coach_v3_uranus_bigtts', name: 'Rory', gender: 'male', accent: 'American', style: 'Energetic, for UGC' },
  { id: 'multi_male_assistantrobertclinton_v3_uranus_bigtts', name: 'Elliot', gender: 'male', accent: 'American', style: 'Brisk explainer' },
  // British English
  { id: 'multi_female_authoritative-british_v3_uranus_bigtts', name: 'Charlotte', gender: 'female', accent: 'British', style: 'Clear and trusted' },
  { id: 'multi_female_authoritative_britishukaudiobook_v3_uranus_bigtts', name: 'Harriet', gender: 'female', accent: 'British', style: 'Storyteller' },
  { id: 'multi_male_ronald_v3_uranus_bigtts', name: 'Ronald', gender: 'male', accent: 'British', style: 'Deep and dignified' },
  { id: 'multi_male_benukaudiobook_v3_uranus_bigtts', name: 'Tobias', gender: 'male', accent: 'British', style: 'Storyteller' },
  // Other accents (they speak any language too)
  { id: 'multi_female_dina_v3_uranus_bigtts', name: 'Dina', gender: 'female', accent: 'Arabic', style: 'Friendly' },
  { id: 'multi_male_youssef_v3_uranus_bigtts', name: 'Youssef', gender: 'male', accent: 'Arabic', style: 'Calm' },
  { id: 'multi_female_romina_v3_uranus_bigtts', name: 'Romina', gender: 'female', accent: 'Spanish', style: 'Bright' },
  { id: 'multi_male_mariano_v3_uranus_bigtts', name: 'Mariano', gender: 'male', accent: 'Spanish', style: 'Warm' },
  { id: 'multi_female_fr_bv078_v3_uranus_bigtts', name: 'Simone', gender: 'female', accent: 'French', style: 'Natural' },
  { id: 'multi_male_nicolas_v3_uranus_bigtts', name: 'Antoine', gender: 'male', accent: 'French', style: 'Narrator' },
  { id: 'multi_female_annie_v3_uranus_bigtts', name: 'Annie', gender: 'female', accent: 'German', style: 'Clear' },
  { id: 'multi_male_sven_v3_uranus_bigtts', name: 'Sven', gender: 'male', accent: 'German', style: 'Natural' },
  { id: 'multi_female_ana_v3_uranus_bigtts', name: 'Ana', gender: 'female', accent: 'Portuguese (Brazil)', style: 'Lively' },
  { id: 'multi_male_bv531_v3_uranus_bigtts', name: 'Arthur', gender: 'male', accent: 'Portuguese (Brazil)', style: 'Natural' },
  { id: 'multi_female_bv522_v3_uranus_bigtts', name: 'Hana', gender: 'female', accent: 'Japanese', style: 'Gentle' },
  { id: 'multi_male_bv524_v3_uranus_bigtts', name: 'Ken', gender: 'male', accent: 'Japanese', style: 'Natural' },
  { id: 'multi_female_son_v3_uranus_bigtts', name: 'Minji', gender: 'female', accent: 'Korean', style: 'Friendly' },
  { id: 'multi_male_bv545_v3_uranus_bigtts', name: 'Jay', gender: 'male', accent: 'Korean', style: 'Natural' },
  { id: 'multi_female_zhixingnv_v3_uranus_bigtts', name: 'Lin', gender: 'female', accent: 'Chinese', style: 'Clear' },
  { id: 'multi_male_wenrouxiaoge_v3_uranus_bigtts', name: 'Chen', gender: 'male', accent: 'Chinese', style: 'Gentle' },
  { id: 'multi_female_cesna_v3_uranus_bigtts', name: 'Cesna', gender: 'female', accent: 'Indonesian', style: 'Natural' },
  { id: 'multi_male_naim_v3_uranus_bigtts', name: 'Naim', gender: 'male', accent: 'Malay', style: 'Natural' },
  { id: 'multi_female_elle_v3_uranus_bigtts', name: 'Elle', gender: 'female', accent: 'Thai', style: 'Natural' },
  { id: 'multi_female_linh_v3_uranus_bigtts', name: 'Linh', gender: 'female', accent: 'Vietnamese', style: 'Natural' },
  { id: 'multi_female_irinae_v3_uranus_bigtts', name: 'Irina', gender: 'female', accent: 'Russian', style: 'Storyteller' },
  { id: 'multi_male_luca_v3_uranus_bigtts', name: 'Luca', gender: 'male', accent: 'Italian', style: 'Storyteller' },
];
export const DEFAULT_VOICE = VOICES[0].id;
export const findVoice = (vid) => VOICES.find((v) => v.id === vid) || null;

// Speaking speed for estimates before the audio exists: about 15 characters a second at normal speed.
export const CHARS_PER_SECOND = 15;
export const estimateSeconds = (text, speed = 1) => Math.max(1, String(text || '').trim().length / CHARS_PER_SECOND / (Number(speed) > 0 ? Number(speed) : 1));
