// Voice input: turns a short spoken clip from the prompt bar into text.
// The gateway has no speech-to-text endpoint, so the clip goes to a chat model that can hear audio.
// Browsers send 16 kHz mono WAV parts of at most about 20 seconds, which keeps every request far
// from the gateway's 60 second cut; a second model is started when the first is slow.
import express from 'express';
import db, { save, id, now } from './db.js';
import { callJson } from './gateway.js';
import { UserError } from './generate.js';
import { usdToCredits } from './credits.js';

const MODELS = () => String(process.env.VOICE_MODELS || 'mimo-v2.6-flash,gemini-3.1-flash-lite').split(',').map((s) => s.trim()).filter(Boolean);
const LANGS = { en: 'English', ar: 'Arabic', ckb: 'Kurdish (Sorani)', ku: 'Kurdish (Kurmanji)', tr: 'Turkish', fa: 'Persian', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', ru: 'Russian', hi: 'Hindi', ur: 'Urdu', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', nl: 'Dutch', sv: 'Swedish', pl: 'Polish', id: 'Indonesian' };
const HEDGE_MS = 2500, LIMIT_MS = 52000, MAX_BYTES = 2 * 1024 * 1024;

// Models sometimes wrap the words in quotes or a label, or describe silence instead of staying quiet.
function tidy(t) {
  let s = String(t || '').replace(/\r/g, '').trim();
  s = s.replace(/^```\w*\n?|\n?```$/g, '').replace(/^(transcript(ion)?|text)\s*[:：]\s*/i, '').trim();
  if (/^["“'«].*["”'»]$/s.test(s) && s.length > 1) s = s.slice(1, -1).trim();
  if (/^\[?\(?(silence|no speech|no audio|inaudible|blank audio|music|noise)\)?\]?[.!]?$/i.test(s)) return '';
  if (/^(there is|i (can|could)(n'?t| not)|sorry|the audio (is|contains|does)|no (speech|audible))/i.test(s) && /\b(no speech|silen|inaudible|not (hear|detect)|unable to|cannot transcribe|no audible)/i.test(s)) return '';
  // A description of the clip instead of its words ("A man is heard saying…") is not a transcript.
  if (/\b(is|are|can be) heard (speaking|saying|talking)|\bin this (audio|recording|clip)\b|^the (speaker|audio|recording|clip) (says|is|contains|features)/i.test(s)) return '';
  return s.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');
}

async function ask(model, b64, lang, signal) {
  const hint = LANGS[lang] ? ` The speaker is probably speaking ${LANGS[lang]}.` : '';
  const j = await callJson('/chat/completions', { signal, json: { model, max_tokens: 700, temperature: 0, messages: [{ role: 'user', content: [
    { type: 'text', text: `Transcribe the speech in this audio word for word, in the language that is spoken, with normal punctuation and capital letters.${hint} Do not translate, answer, summarise or add anything. Reply with only the transcript. If nobody speaks, reply with exactly [silence].` },
    { type: 'input_audio', input_audio: { data: b64, format: 'wav' } }] }] } });
  return { text: tidy(j?.choices?.[0]?.message?.content), usd: Number(j?.usage?.charge_amount) || 0, model };
}

// The first model to answer with words wins. A slow or failing first model gets company instead of a long wait.
export async function transcribe(buf, lang, signal, models = MODELS()) {
  const b64 = buf.toString('base64'); const ctl = new AbortController();
  const stop = () => ctl.abort(); signal?.addEventListener('abort', stop, { once: true });
  const limit = setTimeout(stop, LIMIT_MS);
  let usd = 0, pending = 0, next = 0, lastError = null, sawEmpty = false, timer = null;
  try {
    return await new Promise((resolve, reject) => {
      const launch = () => {
        if (next >= models.length || ctl.signal.aborted) return;
        const m = models[next++]; pending++;
        clearTimeout(timer); if (next < models.length) timer = setTimeout(launch, HEDGE_MS);
        ask(m, b64, lang, ctl.signal).then((r) => { usd += r.usd; if (r.text) return resolve({ text: r.text, usd, model: r.model }); sawEmpty = true; }, (e) => { lastError = e; })
          .finally(() => { pending--; if (ctl.signal.aborted && !pending) return reject(lastError || new Error('timeout')); if (!pending) { if (next < models.length && !sawEmpty) launch(); else if (sawEmpty) resolve({ text: '', usd }); else reject(lastError || new Error('failed')); } });
      };
      launch();
    });
  } finally { clearTimeout(limit); clearTimeout(timer); ctl.abort(); signal?.removeEventListener('abort', stop); }
}

// Voice input costs a fraction of a credit per clip, so the ledger keeps one line per session, not one per clip.
function chargeVoice(user, usd) {
  const c = Math.round(usdToCredits(usd) * 10000) / 10000; if (!(c > 0)) return 0;
  user.credits = Math.round(((user.credits || 0) - c) * 10000) / 10000;
  const last = [...db.ledger].reverse().find((l) => l.userId === user.id);
  if (last && last.kind === 'voice' && Date.now() - new Date(last.at).getTime() < 15 * 60 * 1000) { last.credits = Math.round((last.credits - c) * 10000) / 10000; last.balance = user.credits; }
  else db.ledger.push({ id: id('l_'), userId: user.id, type: 'usage', kind: 'voice', credits: -c, balance: user.credits, desc: 'Voice input', at: now() });
  save();
  return c;
}

export function mountVoice(app, { requireUser, wrap }) {
  app.post('/api/voice/transcribe', requireUser, express.raw({ type: () => true, limit: MAX_BYTES }), wrap(async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buf || buf.length < 2000 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') throw new UserError('That recording could not be read. Please try again.');
    if ((req.user.credits || 0) <= 0) throw new UserError('You are out of credits, so voice input is paused. Top up to keep using it.', 402, 'insufficient_credits');
    const ctl = new AbortController(); res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
    let r;
    try { r = await transcribe(buf, String(req.query.lang || '').toLowerCase().split('-')[0], ctl.signal); }
    catch (e) { if (ctl.signal.aborted) return; throw new UserError('The speech service did not answer in time. This part was skipped; please say it again.', 504, 'voice_timeout'); }
    if (process.env.VOICE_DEBUG) console.log(`voice: ${(buf.length / 32000).toFixed(1)}s clip -> ${r.model || 'nobody'}: ${JSON.stringify(r.text)}`);
    const credits = chargeVoice(req.user, r.usd);
    res.json({ text: r.text, credits });
  }));
}
