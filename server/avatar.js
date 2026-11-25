// Talking videos with OmniHuman 2.0 (direct from BytePlus, see byteplus.js). In the app it is one more video model:
// one photo of a person plus a voice. The voice is either the person's own sound file, or the typed prompt read
// aloud by an AI voice first (speech.js). The video is as long as the voice (4 to 300 seconds) at 720p.
// Credits follow the video rules: the length is known before it starts, so that amount is reserved, kept when the
// video arrives and refunded in full when it fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db, { save, now, id } from './db.js';
import { charge, round2, needCredits, inPro } from './credits.js';
import { getFiles, fileMeta, filePath } from './files.js';
import { putFile, locate, bucketUrl, abs } from './storage.js';
import { ffmpegInfo, ffmpeg, probe } from './ffmpeg.js';
import { omniSubmit, omniResult, OMNI_AUDIO, aiVoiceOn, estimateSeconds, DEFAULT_VOICE, findVoice, ProviderError } from './byteplus.js';
import { makeSpeech, speechCredits } from './speech.js';
import { UserError, pictureLink, publicBase, signFile } from './generate.js';

// A public link the provider can download the voice from: the file bucket first, then this server (/pa/...).
export function audioLink(f) {
  try { const b = bucketUrl(filePath(f), { mime: f.mime, inline: true }); if (b) return b; } catch { /* no bucket copy */ }
  const base = publicBase();
  return base ? `${base}/pa/${f.id}/${signFile(f.id)}.${/wav/.test(f.mime) ? 'wav' : 'mp3'}` : null;
}

// OmniHuman takes mp3 or wav under 15 MB. Anything else (m4a, aac, ogg, a video with sound) becomes an mp3 copy.
async function readyAudio(f) {
  if (!f.duration && ffmpegInfo().ok) { try { const info = await probe(locate(f)); if (info?.duration) { f.duration = info.duration; save(); } } catch { /* checked below */ } }
  const ok = /audio\/(mpeg|mp3|wav|x-wav|wave)/.test(f.mime || '') && (f.size || 0) < OMNI_AUDIO.maxMb * 1024 * 1024;
  if (ok) return f;
  if (!ffmpegInfo().ok) throw new UserError('This sound file needs to be an MP3 or WAV under 15 MB. Save it as MP3 and try again.');
  const tmp = path.join(os.tmpdir(), `omni-${f.id}-${Date.now()}.mp3`);
  try { await ffmpeg(['-i', locate(f), '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '96k', tmp], { timeoutMs: 120000 }); }
  catch { fs.rmSync(tmp, { force: true }); throw new UserError(`${f.name}: this sound could not be read. Try saving it again as MP3.`); }
  const copy = { ...f, id: id('f_'), key: undefined, mime: 'audio/mpeg', name: f.name.replace(/\.[^.]+$/, '') + '.mp3', fromUpload: f.id, createdAt: now() };
  copy.key = putFile(`users/${f.userId}/uploads/audio/${copy.id}.mp3`, tmp, { move: true }); copy.size = fs.statSync(abs(copy.key)).size;
  db.files.push(copy); save();
  return copy;
}

const secondsLabel = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} seconds`);

/** Start one talking video. Same answer shape as startVideo. */
export async function startAvatar(user, { model, prompt, fileIds = [], params: q = {}, target }) {
  const files = getFiles(user, fileIds);
  const photo = files.find((f) => f.kind === 'image');
  let voice = files.find((f) => f.kind === 'audio' || (f.kind === 'video' && f.hasAudio));
  const per = model.price.creditsPerSecond['720p'];
  if (!photo) throw new UserError(`${model.name} needs a photo of the person who talks. Add one first.`);
  if (files.some((f) => f.kind === 'video' && f !== voice)) throw new UserError(`${model.name} starts from a photo, not a video. Remove the video.`);
  const link = pictureLink(photo);
  if (!link) throw new UserError('Talking videos need the app to run at a public https address (set PUBLIC_URL), or the file bucket.', 503);
  const script = String(prompt || '').trim();
  // With the person's own voice the typed words are a note on movement and setting. Without it they are the script.
  let direction = voice ? script : String(q.direction || '').trim();
  let voiceCredits = 0;
  if (!voice) {
    if (!aiVoiceOn()) throw new UserError(`${model.name} needs a voice. Add a sound file of the person speaking.`);
    if (!script) throw new UserError('Type what the person says, or add a sound file of them speaking.');
    const est = estimateSeconds(script, q.speed);
    if (est > OMNI_AUDIO.max + 15) throw new UserError(`That script would take about ${secondsLabel(est)} to say. ${model.name} makes videos up to 5 minutes, so please shorten it.`);
    // Checked before anything is made, so nobody pays for a voice-over without the video.
    needCredits(user, speechCredits(script.length) + per * Math.max(OMNI_AUDIO.min, Math.ceil(est)) * 1.1);
    const v = findVoice(q.voiceId) || findVoice(DEFAULT_VOICE);
    const r = await makeSpeech(user, { text: script, voiceId: v.id, speed: q.speed, volume: q.volume, pitch: q.pitch, style: q.style, minSeconds: OMNI_AUDIO.min, desc: `AI voice · ${v.name} (for ${model.name})`, extra: { forAvatar: true, ...(target?.generationId ? { generationId: target.generationId } : {}) } });
    voice = r.file; voiceCredits = r.credits;
  }
  voice = await readyAudio(voice);
  const secs = Number(voice.duration) || 0;
  if (!secs) throw new UserError(`${voice.name}: the length of this sound could not be read. Try saving it again as MP3.`);
  if (secs < OMNI_AUDIO.min - 0.05) throw new UserError(`The voice is ${secs.toFixed(1)} seconds long. ${model.name} needs at least ${OMNI_AUDIO.min} seconds.`);
  if (secs > OMNI_AUDIO.max + 0.5) throw new UserError(`The voice is ${secondsLabel(secs)} long. ${model.name} makes videos up to 5 minutes, so please use a shorter one.`);
  const aLink = audioLink(voice);
  if (!aLink) throw new UserError('Talking videos need the app to run at a public https address (set PUBLIC_URL), or the file bucket.', 503);
  const seconds = Math.ceil(secs);
  const reserve = round2(per * seconds);
  needCredits(user, reserve);
  let taskId;
  try { taskId = await omniSubmit({ imageUrl: link, audioUrl: aLink, prompt: direction }); }
  catch (e) {
    if (e instanceof ProviderError) throw new UserError(e.message + (voiceCredits ? ' Your voice-over was kept in your files.' : ''), e.status, e.code);
    throw e;
  }
  charge(user, reserve, `Video (reserved) · ${model.name}`, { model: model.id, taskId, ...target });
  db.tasks.push({ taskId, provider: 'omnihuman', userId: user.id, ...target, model: model.id, prompt: script, reserved: reserve, seconds, voiceFileId: voice.id, status: 'pending', createdAt: now(), ...(inPro() ? { pro: true } : {}) });
  save();
  return {
    model, taskIds: [taskId],
    params: { resolution: '720p', ratio: 'adaptive', duration: seconds, voiceId: voice.aiVoice?.voiceId, voiceFileId: voice.id },
    reserved: round2(reserve + voiceCredits),
    refs: [photo, voice].map(fileMeta), partialError: null,
  };
}

// What the provider says about a task, in the gateway's shape so pollTask can settle it the same way.
export async function avatarStatus(t) {
  const r = await omniResult(t.taskId);
  if (r.status === 'pending') {
    // OmniHuman forgets tasks after 12 hours. Six hours without an answer counts as failed and is refunded.
    if (Date.now() - Date.parse(t.createdAt) > 6 * 3600e3) return { status: 'expired', fail_reason: 'The video took too long and was stopped.' };
    return { status: r.progress === 'generating' ? 'running' : 'queued' };
  }
  if (r.status === 'succeeded') return { status: 'succeeded', content: { video_url: r.videoUrl } };
  return { status: 'failed', fail_reason: r.blocked ? 'Blocked by the content safety filter.' : r.reason };
}
