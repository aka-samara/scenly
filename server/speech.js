// AI voice: a typed script becomes a spoken voice-over (Seed TTS 3.0, direct from BytePlus, see byteplus.js).
// The result is the person's own sound file (kind 'audio'), so it works everywhere a sound file does: the Video
// Builder voice track, the talking-avatar model in Video Studio, the asset picker and downloads.
// Credits: charged when the audio arrives, from the characters spoken (nothing is charged when it fails).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db, { save, id, now } from './db.js';
import { keys, put, putFile, locate, checkQuota, abs, exists } from './storage.js';
import { usdToCredits, charge, needCredits, round2 } from './credits.js';
import { ffmpegInfo, ffmpeg, probe } from './ffmpeg.js';
import { speak, voiceSettings, aiVoiceOn, VOICES, DEFAULT_VOICE, findVoice, TTS_USD_PER_MCHAR, TTS_MAX_CHARS, estimateSeconds, ProviderError } from './byteplus.js';
import { UserError } from './generate.js';

export const TTS_ID = 'seed-tts-3.0';
const round4 = (n) => Math.round(n * 1e4) / 1e4;
/** Credits for speaking this many characters. */
export const speechCredits = (chars) => round4(usdToCredits((Number(chars) || 0) * TTS_USD_PER_MCHAR() / 1e6, { direct: true, id: TTS_ID }));
export const publicVoices = () => VOICES.map(({ id: vid, name, gender, accent, style }) => ({ id: vid, name, gender, accent, style }));

// The reading settings kept with the file (only the ones that differ from normal, speed always).
const readingOf = (o) => { const vs = voiceSettings(o) || {}; return { speed: vs.speed || 1, ...(vs.volume ? { volume: vs.volume } : {}), ...(vs.pitch ? { pitch: vs.pitch } : {}), ...(vs.instructions ? { style: vs.instructions[0] } : {}) }; };

const titleFrom = (text) => String(text || '').replace(/\[[^\]]{1,40}\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48).replace(/[\\/:*?"<>|]+/g, '').trim();

/**
 * Make a voice-over from a script and keep it as the person's sound file.
 * opts.minSeconds pads the end with silence (OmniHuman needs at least 4 seconds of sound).
 * Returns { file, credits, chars }.
 */
export async function makeSpeech(user, { text, voiceId, speed, volume, pitch, style, language, minSeconds = 0, desc, extra = {} }) {
  if (!aiVoiceOn()) throw new UserError('AI voice is not available right now.', 503, 'voice_off');
  const script = String(text || '').trim();
  if (!script) throw new UserError('Type what the voice should say.');
  if (script.length > TTS_MAX_CHARS) throw new UserError(`That script is too long. Keep it under ${TTS_MAX_CHARS.toLocaleString('en-US')} characters.`);
  const voice = findVoice(voiceId) || findVoice(DEFAULT_VOICE);
  needCredits(user, speechCredits(script.length));
  checkQuota(user.id, 64 * 1024);
  let r;
  try { r = await speak({ text: script, voiceId: voice.id, speed, volume, pitch, style, language }); }
  catch (e) { if (e instanceof ProviderError) throw new UserError(e.message + (e.status === 400 || /No credits/.test(e.message) ? '' : ' No credits were charged.'), e.status, e.code); throw e; }
  const rec = { id: id('f_'), userId: user.id, kind: 'audio', mime: 'audio/mpeg', name: `${voice.name} - ${titleFrom(script) || 'voice-over'}.mp3`, size: r.audio.length, createdAt: now(), aiVoice: { voiceId: voice.id, voiceName: voice.name, chars: r.chars, ...readingOf({ speed, volume, pitch, style }) }, ...extra };
  rec.key = put(keys.upload(user.id, 'audio', rec.id, 'mp3'), r.audio);
  // Length from the file itself when ffmpeg is here; otherwise from the script at normal speaking speed.
  let info = null; if (ffmpegInfo().ok) { try { info = await probe(locate(rec)); } catch { /* estimate below */ } }
  rec.duration = info?.duration || round2(estimateSeconds(script, speed));
  if (minSeconds && rec.duration < minSeconds && ffmpegInfo().ok) {
    const tmp = path.join(os.tmpdir(), `tts-${rec.id}.mp3`);
    try {
      await ffmpeg(['-i', locate(rec), '-af', `apad=whole_dur=${minSeconds + 0.3}`, '-c:a', 'libmp3lame', '-b:a', '128k', tmp], { timeoutMs: 60000 });
      rec.key = putFile(rec.key, tmp, { move: true }); rec.size = fs.statSync(abs(rec.key)).size; rec.duration = round2(minSeconds + 0.3);
    } catch (e) { console.warn('voice pad:', e.message); fs.rmSync(tmp, { force: true }); }
  }
  db.files.push(rec);
  const credits = charge(user, speechCredits(r.chars), desc || `AI voice · ${voice.name}`, { model: TTS_ID, fileId: rec.id, chars: r.chars, usd: round4(r.chars * TTS_USD_PER_MCHAR() / 1e6) });
  save();
  return { file: rec, credits: typeof credits === 'number' ? credits : speechCredits(r.chars), chars: r.chars };
}

export const speechView = (f) => ({ id: f.id, name: f.name, kind: 'audio', mime: f.mime, size: f.size, duration: f.duration, url: `/api/files/${f.id}/raw`, aiVoice: f.aiVoice });

// A short sample of each voice, made once and kept on disk for everyone (it costs a fraction of a cent, paid by Scenly).
// Native voices introduce themselves in their own language, so you hear the real accent.
const SAMPLE_LINES = {
  en: (n) => `Hi, I'm ${n}. This is how I sound when I read your script.`,
  ar: (n) => `مرحباً، أنا ${n}. هكذا يبدو صوتي عندما أقرأ نصك.`,
  zh: (n) => `你好，我是${n}。这就是我朗读你的脚本时的声音。`,
  fr: (n) => `Bonjour, je suis ${n}. Voici ma voix quand je lis votre texte.`,
  de: (n) => `Hallo, ich bin ${n}. So klinge ich, wenn ich Ihren Text vorlese.`,
  it: (n) => `Ciao, sono ${n}. Ecco come suono quando leggo il tuo testo.`,
  ja: (n) => `こんにちは、${n}です。あなたの台本を読むと、こんな声になります。`,
  ko: (n) => `안녕하세요, ${n}입니다. 대본을 읽을 때 제 목소리는 이렇습니다.`,
  pt: (n) => `Olá, eu sou ${n}. É assim que eu soo quando leio o seu roteiro.`,
  ru: (n) => `Привет, я ${n}. Вот так звучит мой голос, когда я читаю ваш текст.`,
  es: (n) => `Hola, soy ${n}. Así sueno cuando leo tu guion.`,
  id: (n) => `Halo, saya ${n}. Beginilah suara saya saat membaca naskah Anda.`,
  ms: (n) => `Hai, saya ${n}. Beginilah bunyi suara saya apabila membaca skrip anda.`,
  th: (n) => `สวัสดีค่ะ ฉันชื่อ${n} นี่คือเสียงของฉันเวลาอ่านสคริปต์ของคุณ`,
  tr: (n) => `Merhaba, ben ${n}. Metninizi okurken sesim böyle duyulur.`,
  vi: (n) => `Xin chào, tôi là ${n}. Đây là giọng của tôi khi đọc kịch bản của bạn.`,
};
const SAMPLE_TEXT = (v) => (SAMPLE_LINES[v.lang] || SAMPLE_LINES.en)(v.name);
// Samples in a voice's own language are kept under their own name, so older English samples are not reused.
const sampleKey = (v) => `library/voice-samples/${v.id.replace(/[^a-z0-9_-]/gi, '')}${v.lang && v.lang !== 'en' ? '-' + v.lang : ''}.mp3`;
const making = new Map();
async function sample(vid) {
  const v = findVoice(vid); if (!v) throw new UserError('That voice is not available.', 404);
  const key = sampleKey(v);
  if (exists(key)) return abs(key);
  if (!making.has(key)) making.set(key, speak({ text: SAMPLE_TEXT(v), voiceId: v.id }).then((r) => abs(put(key, r.audio))).finally(() => making.delete(key)));
  return making.get(key);
}

export function mountSpeech(app, { requireUser, wrap }) {
  app.get('/api/voice/voices', requireUser, (req, res) => res.json({ on: aiVoiceOn(), voices: aiVoiceOn() ? publicVoices() : [], defaultVoice: DEFAULT_VOICE, creditsPerChar: speechCredits(1), maxChars: TTS_MAX_CHARS }));
  app.get('/api/voice/sample/:vid', requireUser, wrap(async (req, res) => {
    if (!aiVoiceOn()) return res.status(404).end();
    let p; try { p = await sample(req.params.vid); } catch (e) { if (e instanceof UserError) throw e; throw new UserError('This sample could not be played right now. Please try again shortly.', 502); }
    res.set('Cache-Control', 'private, max-age=86400').type('audio/mpeg').sendFile(p);
  }));
  app.post('/api/voice/speak', requireUser, wrap(async (req, res) => {
    const { text, voiceId, speed, volume, pitch, style, language } = req.body || {};
    const r = await makeSpeech(req.user, { text, voiceId, speed, volume, pitch, style, language });
    res.json({ file: speechView(r.file), credits: r.credits, chars: r.chars, balance: req.user.credits });
  }));
}
