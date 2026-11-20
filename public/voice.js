// Voice input for the prompt bars: click the microphone, speak, and the words appear in the prompt.
//
// Two engines, chosen automatically:
//   1. The browser's own speech recognition (Chrome, Edge, Safari): words appear while you speak.
//   2. A recorder (Firefox and anywhere the first engine is missing or refuses): the microphone is
//      recorded as 16 kHz mono WAV, cut into short parts at pauses, and each part is sent to
//      /api/voice/transcribe. Parts keep their order, so long dictation works.
// Both stop by themselves after a minute without speech. Only one recording runs at a time.
import { h, icon, toast } from './app.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SILENCE_MS = 60_000;          // no speech for this long ends the recording
const MAX_MS = 30 * 60_000;         // a forgotten microphone does not record for ever
const RATE = 16000;
const LANGS = [['auto', 'Auto language'], ['en-US', 'English'], ['ar-IQ', 'Arabic'], ['ckb', 'Kurdish (Sorani)'], ['ku', 'Kurdish (Kurmanji)'], ['tr-TR', 'Turkish'], ['fa-IR', 'Persian'], ['fr-FR', 'French'], ['de-DE', 'German'], ['es-ES', 'Spanish'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese'], ['ru-RU', 'Russian'], ['hi-IN', 'Hindi'], ['ur-PK', 'Urdu'], ['zh-CN', 'Chinese'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['nl-NL', 'Dutch'], ['id-ID', 'Indonesian']];
const RECORD_ONLY = new Set(['ckb', 'ku']);   // languages the browsers' own engines do not offer
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const session = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } } };
const getLang = () => { const v = store.get('pm-voice-lang'); return LANGS.some(([c]) => c === v) ? v : 'auto'; };

const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

let active = null;

// The microphone button for a prompt textarea.
export function micButton(ta) {
  const btn = h('button', { class: 'icon-btn mic', type: 'button', title: 'Speak your prompt', 'aria-label': 'Voice input' }, icon('mic'));
  btn.addEventListener('click', () => {
    if (active && active.btn === btn) return active.finishing ? null : stop(active, 'user');
    if (active) stop(active, 'user');
    start(ta, btn);
  });
  return btn;
}
export const voiceActive = () => !!active;

// ---------- one recording ----------
function start(ta, btn) {
  const lang = getLang();
  const s = { ta, btn, lang, startedAt: Date.now(), lastVoice: Date.now(), parts: [], live: '', liveSkip: 0, interim: '', base: ta.value, lastSet: ta.value, pending: 0, failed: 0, level: 0, finishing: false, ended: false, heard: false };
  active = s;
  const wantRecorder = !SR || RECORD_ONLY.has(lang) || session.get('pm-voice-engine2') === 'record' || Date.now() < Number(session.get('pm-voice-nolive') || 0);
  // Safari only lets audio start inside the click, so the recorder's audio context is made right here.
  if (wantRecorder) { const AC = window.AudioContext || window.webkitAudioContext; try { s.ctx = AC ? new AC() : null; s.ctx?.resume?.().catch(() => {}); } catch { s.ctx = null; } }
  buildStrip(s);
  btn.classList.add('rec'); btn.title = 'Stop listening'; btn.replaceChildren(icon('stop'));
  s.tick = setInterval(() => tick(s), 250);
  if (wantRecorder) runRecorder(s); else runSpeech(s);
}

function tick(s) {
  if (s.ended) return;
  if (!s.ta.isConnected) return stop(s, 'gone');
  const now = Date.now();
  if (s.clock) { const sec = Math.floor((now - s.startedAt) / 1000); s.clock.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
  if (s.meter) { const v = Math.min(1, Math.sqrt(s.level) * 3.2); s.meter.style.transform = `scaleX(${Math.max(0.04, v).toFixed(2)})`; }
  if (s.finishing) return;
  if (now - s.lastVoice > SILENCE_MS) return stop(s, 'silence');
  if (now - s.startedAt > MAX_MS) return stop(s, 'max');
}

function setLabel(s, text) { if (s.label) s.label.textContent = text; }

function buildStrip(s) {
  const sel = h('select', { class: 'voice-lang', title: 'Language you are speaking' }, LANGS.map(([c, n]) => h('option', { value: c, selected: c === s.lang }, n)));
  // A new language starts a fresh recording once the current one has handed over its words.
  sel.addEventListener('change', () => { store.set('pm-voice-lang', sel.value); const { ta, btn } = s; stop(s, 'user'); const iv = setInterval(() => { if (!s.ended) return; clearInterval(iv); if (!active && ta.isConnected) start(ta, btn); }, 80); });
  s.label = h('span', { class: 'voice-label' }, 'Starting…');
  s.clock = h('span', { class: 'voice-clock' }, '0:00');
  s.meter = h('i', {});
  s.done = h('button', { class: 'btn sm', type: 'button', onclick: () => { if (!s.finishing) stop(s, 'user'); } }, 'Done');
  s.strip = h('div', { class: 'voice-strip', role: 'status' }, h('span', { class: 'voice-dot' }), s.label, s.clock, h('span', { class: 'voice-meter' }, s.meter), h('span', { class: 'grow' }), sel, s.done);
  const bar = s.ta.closest('.bar, .va-box, .pa-box, .pro-ask, .pt-prompt');
  if (bar) bar.prepend(s.strip); else s.ta.before(s.strip);
}

// What has been said so far and is not yet part of the text the person edited by hand.
function spoken(s) {
  const bits = s.parts.filter((p) => p.text && !p.absorbed).map((p) => p.text);
  const live = s.live.slice(s.liveSkip).trim(); if (live) bits.push(live);
  if (s.interim) bits.push(s.interim.trim());
  let out = '';
  for (const b of bits) { if (!out) { out = b; continue; } const cont = !/[.!?…:;。！？]["”’)]?$/.test(out) && /^[A-Z][a-z]/.test(b) && !/^I\b/.test(b); out += ' ' + (cont ? b[0].toLowerCase() + b.slice(1) : b); }
  return out.replace(/\s+/g, ' ').trim();
}
function write(s) {
  const ta = s.ta; if (!ta.isConnected) return;
  if (ta.value !== s.lastSet) {
    // The person typed while speaking: their text stays as it is, and new words go after it.
    let v = ta.value; const shown = s.shownInterim || ''; if (shown && v.endsWith(shown)) v = v.slice(0, -shown.length);
    s.base = v; for (const p of s.parts) if (p.text) p.absorbed = true; s.liveSkip = s.live.length;
  }
  const sp = spoken(s); s.shownInterim = s.interim ? s.interim.trim() : '';
  const base = sp ? s.base.replace(/[ \t]+$/, '') : s.base;
  const v = sp ? (base && !/\n$/.test(base) ? base + ' ' : base) + sp : base;
  if (v !== ta.value) { ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); try { ta.scrollTop = ta.scrollHeight; ta.setSelectionRange(v.length, v.length); } catch { /* not focusable */ } }
  s.lastSet = v;
}

function stop(s, why) {
  if (s.ended || s.finishing) return;
  s.finishing = true; s.why = why;
  s.btn.classList.remove('rec'); s.btn.classList.add('busy'); s.btn.disabled = true; s.btn.replaceChildren(icon('mic'));
  if (s.done) s.done.disabled = true;
  s.strip?.classList.add('busy'); setLabel(s, 'Finishing…');
  if (why === 'gone') { s.abort?.(); return end(s); }
  if (s.halt) s.halt(); else end(s);     // the engine calls end() when its last words are in
  s.guard = setTimeout(() => end(s), 75_000);   // never leave the bar stuck
}

function end(s) {
  if (s.ended) return; s.ended = true;
  clearInterval(s.tick); clearTimeout(s.guard);
  try { s.abort?.(); } catch { /* already closed */ }
  s.interim = ''; if (s.ta.isConnected) write(s);
  s.strip?.remove();
  s.btn.classList.remove('rec', 'busy'); s.btn.disabled = false; s.btn.title = 'Speak your prompt'; s.btn.replaceChildren(icon('mic'));
  if (active === s) active = null;
  if (s.error) toast(s.error, 'error');
  else if (s.failed) toast(`${s.failed === 1 ? 'One part' : s.failed + ' parts'} of what you said could not be turned into text. Please say it again.`, 'error');
  else if (s.why === 'silence') toast(s.heard ? 'Stopped listening after a minute of silence.' : 'No speech was heard for a minute, so listening stopped.');
  else if (s.why === 'max') toast('Stopped listening after 30 minutes.');
  if (s.ta.isConnected && s.why !== 'gone') { try { s.ta.focus(); } catch { /* fine */ } }
}
function fail(s, message) { if (s.ended) return; s.error = message; s.finishing = true; end(s); }

const micMessage = (e) => {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'The microphone is blocked for this site. Allow it in your browser\'s address bar or settings, then click the microphone again.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No microphone was found. Connect one and try again.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'The microphone is being used by another app. Close that app and try again.';
  return 'The microphone could not be started. Please try again.';
};

// ---------- engine 1: the browser's speech recognition ----------
function runSpeech(s) {
  let rec = null, gotResult = false, began = 0, quick = 0, fatal = null, restart = null, watchdog = null, everStarted = false, netFails = 0, everResult = false, hint = null;
  const android = /Android/i.test(navigator.userAgent);
  const commit = () => { const t = (s.live + (s.interim ? ' ' + s.interim : '')).slice(s.liveSkip).trim(); if (t) s.parts.push({ text: t }); s.live = ''; s.liveSkip = 0; s.interim = ''; };
  const toRecorder = (remember = true, why = '') => {
    clearTimeout(watchdog); clearTimeout(restart); clearTimeout(hint);
    console.info('[voice] live dictation unavailable here, using the recorder:', why || 'unknown');
    // This browser has the feature but its speech service refuses (blocked, offline, or switched off).
    // A passing network hiccup is not remembered: the next click tries the fast live engine again.
    if (remember) session.set('pm-voice-engine2', 'record'); commit(); write(s);
    s.halt = null; s.abort = null;
    if (s.finishing) return end(s);
    runRecorder(s);
  };
  const begin = () => {
    if (s.ended) return;
    try {
      rec = new SR();
      rec.continuous = !android;       // Android repeats earlier words in continuous mode
      rec.interimResults = true; rec.maxAlternatives = 1;
      rec.lang = s.lang === 'auto' ? (navigator.language || 'en-US') : s.lang;
    } catch { return toRecorder(true, 'cannot create'); }
    gotResult = false; began = Date.now(); fatal = null;
    rec.onstart = () => { everStarted = true; clearTimeout(watchdog); clearTimeout(hint); if (!s.finishing) setLabel(s, 'Listening…'); };
    rec.onspeechstart = rec.onsoundstart = () => { s.lastVoice = Date.now(); };
    rec.onresult = (e) => {
      let fin = '', inter = '';
      let prev = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]; const t = r[0]?.transcript || '';
        if (!r.isFinal) { inter += t; continue; }
        // Some engines (Safari, some phones) send a finished sentence twice, or send the whole text so far again.
        const a = norm(t), b = norm(fin);
        if (a.length > 12 && a === prev) continue;
        if (b.length > 12 && a.startsWith(b)) fin = t; else fin += (fin && !/^\s/.test(t) ? ' ' : '') + t;
        prev = a;
      }
      if (inter && norm(fin).length > 12 && norm(inter).startsWith(norm(fin))) fin = '';   // the unfinished text already holds it
      gotResult = true; everResult = true; s.heard = true; s.lastVoice = Date.now();
      s.live = fin; s.interim = inter; write(s);
    };
    rec.onerror = (e) => {
      const c = e.error;
      if (c === 'no-speech' || c === 'aborted') return;
      fatal = c;
    };
    rec.onend = () => {
      clearTimeout(watchdog); commit(); write(s);
      if (s.ended) return;
      if (s.finishing) return end(s);
      if (fatal === 'not-allowed') return fail(s, micMessage({ name: 'NotAllowedError' }));
      if (fatal === 'audio-capture') return fail(s, micMessage({ name: 'NotFoundError' }));
      if (fatal === 'network' && gotResult) netFails = 0;
      // Browsers built on Chrome without Google's speech service (Brave, Opera, Vivaldi, some company networks) fail like this
      // on every try: waiting through retries loses the first sentence, so the recorder takes over at once, for ten minutes.
      if (fatal === 'network' && !everResult) { session.set('pm-voice-nolive', String(Date.now() + 600000)); return toRecorder(false, 'speech service unreachable'); }
      if (fatal === 'network' && ++netFails <= 2) { restart = setTimeout(begin, 150); return; }   // a short drop mid-sentence: keep the live engine
      if (fatal) return toRecorder(fatal !== 'network', fatal);   // service-not-allowed, language-not-supported, or a network that keeps failing
      quick = !gotResult && Date.now() - began < 1500 ? quick + 1 : 0;
      // Engines that end at once again and again without ever hearing anything are not working here.
      // Once words have come through, a quick end is only a pause (Safari and phones end often): keep going.
      if (quick >= 4 && !everResult) return toRecorder(false, 'ends at once');
      // The engines stop after a pause; keep listening until the person is done. Every millisecond here is a word that can be missed.
      restart = setTimeout(begin, quick ? Math.min(1500, 250 * quick) : 0);
    };
    // Some browsers have the feature but never start it and never say why: do not wait for ever.
    clearTimeout(watchdog);
    // The first time, the browser asks for the microphone (Safari also asks for speech recognition): give the person time to answer.
    if (!everStarted) {
      clearTimeout(hint); hint = setTimeout(() => { if (!everStarted && !s.finishing && !s.ended) setLabel(s, 'Allow the microphone if your browser asks…'); }, 2500);
      watchdog = setTimeout(() => { if (s.ended || s.finishing || everStarted) return; const r = rec; try { r.onend = r.onerror = r.onresult = r.onstart = null; r.abort(); } catch { /* closed */ } toRecorder(false, 'never started'); }, 15000);
    }
    try { rec.start(); } catch { restart = setTimeout(() => { quick++; if (quick >= 4 && !everResult) toRecorder(false, 'start refused'); else begin(); }, 400); }
  };
  s.halt = () => {
    clearTimeout(restart); clearTimeout(watchdog); clearTimeout(hint);
    if (!everStarted) { try { rec.onend = null; rec.abort(); } catch { /* closed */ } return end(s); }
    let closed = false; const close = () => { if (closed) return; closed = true; commit(); write(s); end(s); };
    setTimeout(close, 1800);            // some engines never fire "end"
    try { rec.stop(); } catch { close(); }
  };
  s.abort = () => { clearTimeout(restart); clearTimeout(watchdog); try { if (rec) { rec.onend = rec.onresult = rec.onerror = null; rec.abort(); } } catch { /* closed */ } };
  s.strip?.classList.add('sr');
  begin();
}

// ---------- engine 2: record, cut at pauses, transcribe on the server ----------
const WORKLET = 'class T extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(2048);this.n=0}process(i){const c=i[0]&&i[0][0];if(c){for(let k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===2048){this.port.postMessage(this.b.slice(0));this.n=0}}}return true}}registerProcessor("pm-tap",T)';

function wav(chunks, samples) {
  const buf = new ArrayBuffer(44 + samples * 2); const v = new DataView(buf); const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples * 2, true);
  let o = 44; for (const c of chunks) for (let i = 0; i < c.length && o < buf.byteLength; i++, o += 2) v.setInt16(o, c[i], true);
  return new Blob([buf], { type: 'audio/wav' });
}

async function runRecorder(s) {
  s.strip?.classList.remove('sr');
  if (!navigator.mediaDevices?.getUserMedia) return fail(s, window.isSecureContext === false ? 'Voice input needs a secure address (https or localhost).' : 'This browser cannot record from a microphone.');
  let stream = null, ctx = s.ctx || null, src = null, node = null, mute = null, closed = false;
  const close = () => { if (closed) return; closed = true; try { if (node) { if (node.port) node.port.onmessage = null; node.onaudioprocess = null; node.disconnect(); } src?.disconnect(); mute?.disconnect(); } catch { /* gone */ } try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* gone */ } try { if (ctx && ctx.state !== 'closed') ctx.close(); } catch { /* gone */ } };
  s.abort = () => { close(); for (const c of s.calls || []) c.abort(); };
  s.calls = new Set();
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
  catch (e) { close(); return fail(s, micMessage(e)); }
  if (s.ended) return close();
  const AC = window.AudioContext || window.webkitAudioContext;
  try { ctx = ctx || new AC(); if (ctx.state === 'suspended') await ctx.resume(); } catch { close(); return fail(s, 'This browser cannot record from a microphone.'); }
  if (s.ended) return close();

  // While a part is being written, a "…" stands at the end of the text so the person sees words are coming.
  const dots = () => { if (s.ended) return; s.interim = s.parts.some((p) => p.text === null) ? '…' : ''; write(s); };
  // ---- sending the parts, in order ----
  const queue = []; let running = 0;
  const pump = () => {
    while (running < 3 && queue.length) {
      const job = queue.shift(); running++;
      send(job).finally(() => { running--; s.pending--; if (job.part.text === null) job.part.text = ''; dots(); if (s.finishing && !s.pending) end(s); else { if (s.finishing) setLabel(s, `Turning speech into text… ${s.pending} left`); pump(); } });
    }
  };
  const send = async (job) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const ctl = new AbortController(); s.calls.add(ctl); const timer = setTimeout(() => ctl.abort(), 58_000);
      try {
        const lang = s.lang === 'auto' ? '' : s.lang;
        const res = await fetch(`/api/voice/transcribe?lang=${encodeURIComponent(lang)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'audio/wav' }, body: job.blob, signal: ctl.signal });
        const j = await res.json().catch(() => ({}));
        if (res.ok) { job.part.text = String(j.text || '').trim(); if (job.part.text) s.heard = true; dots(); return; }
        if (res.status === 402 || res.status === 401) { s.error = j.error || 'Voice input is not available right now.'; job.part.text = ''; if (!s.finishing) stop(s, 'user'); return; }
        if (res.status === 400) { job.part.text = ''; s.failed++; return; }
      } catch { if (s.ended) return; }
      finally { clearTimeout(timer); s.calls.delete(ctl); }
      if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
    }
    job.part.text = ''; s.failed++; dots();
  };

  // ---- listening: resample to 16 kHz, find speech, cut parts at pauses ----
  const ratio = ctx.sampleRate / RATE; let acc = 0, accN = 0, pos = 0;
  let seg = { chunks: [], samples: 0, voiced: 0, lastVoiceAt: 0 }; let noise = 0.004, t = 0;
  const cut = () => {
    const g = seg; seg = { chunks: [], samples: 0, voiced: 0, lastVoiceAt: 0 };
    if (g.voiced < 0.25) return;                             // noise or a cough, not words
    const keep = Math.min(g.samples, Math.round((g.lastVoiceAt + 0.35) * RATE));   // drop the silent tail
    const part = { text: null }; s.parts.push(part); s.pending++; dots();
    queue.push({ part, blob: wav(g.chunks, keep) }); pump();
  };
  const onChunk = (f) => {
    if (closed || s.finishing) return;
    let sum = 0; const out = new Int16Array(Math.ceil(f.length / ratio) + 1); let n = 0;
    for (let i = 0; i < f.length; i++) {
      const x = f[i]; sum += x * x; acc += x; accN++; pos += 1;
      if (pos >= ratio) { pos -= ratio; const m = Math.max(-1, Math.min(1, acc / accN)); out[n++] = m < 0 ? m * 0x8000 : m * 0x7fff; acc = 0; accN = 0; }
    }
    const rms = Math.sqrt(sum / f.length); const secs = f.length / ctx.sampleRate; t += secs;
    const voice = rms > Math.max(0.012, noise * 3);
    if (!voice) noise = noise * 0.95 + rms * 0.05;
    s.level = s.level * 0.6 + rms * 0.4;
    const chunk = out.subarray(0, n);
    if (voice) { s.lastVoice = Date.now(); seg.voiced += secs; }
    if (!seg.voiced) {
      // Nothing said yet in this part: keep only a short lead-in so the first word is not clipped.
      seg.chunks.push(chunk); seg.samples += n;
      while (seg.chunks.length > 1 && seg.samples - seg.chunks[0].length > RATE * 0.4) seg.samples -= seg.chunks.shift().length;
      return;
    }
    seg.chunks.push(chunk); seg.samples += n; const dur = seg.samples / RATE;
    if (voice) seg.lastVoiceAt = dur;
    const pause = dur - seg.lastVoiceAt;
    // Whole sentences transcribe better than fragments: cut at the end of an utterance, or at a breath once the part is long.
    if ((pause >= 0.7 && seg.voiced >= 0.3) || (dur >= 2.5 && pause >= 0.25) || dur >= 6) cut();
  };

  src = ctx.createMediaStreamSource(stream); mute = ctx.createGain(); mute.gain.value = 0;
  try {
    if (!ctx.audioWorklet) throw new Error('no worklet');
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    node = new AudioWorkletNode(ctx, 'pm-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    node.port.onmessage = (e) => onChunk(e.data);
  } catch {
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
  }
  if (s.ended) return close();
  src.connect(node); node.connect(mute); mute.connect(ctx.destination);
  stream.getAudioTracks()[0]?.addEventListener('ended', () => { if (!s.finishing && !s.ended) { s.error = 'The microphone was disconnected.'; stop(s, 'user'); } });
  s.lastVoice = Date.now(); if (!s.finishing) setLabel(s, 'Listening… words appear after each short pause');
  // Audio that never starts flowing (a suspended audio engine) must not look like listening.
  setTimeout(() => { if (!s.ended && !s.finishing && t === 0) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); setTimeout(() => { if (!s.ended && !s.finishing && t === 0) fail(s, 'The microphone did not start. Click the microphone again.'); }, 1500); } }, 1500);

  s.halt = () => {
    const last = seg; close();
    if (last.voiced >= 0.25) { seg = last; s.finishing = false; cut(); s.finishing = true; }
    if (!s.pending) end(s); else setLabel(s, `Turning speech into text… ${s.pending} left`);
  };
  if (s.finishing) s.halt();
}
