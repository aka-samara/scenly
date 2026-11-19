// Planning scenes from sound: where the pauses are, which words belong to which scene, where the beats fall.
// Pure functions (no files, no network), so every rule here is covered by unit tests.

const r2 = (n) => Math.round(n * 100) / 100;

// ffmpeg's silencedetect prints "silence_start: 1.23" and "silence_end: 2.5 | silence_duration: 1.27".
export function parseSilences(stderr, total) {
  const out = []; let open = null;
  for (const line of String(stderr || '').split('\n')) {
    let m = line.match(/silence_start:\s*(-?[\d.]+)/); if (m) { open = Math.max(0, Number(m[1])); continue; }
    m = line.match(/silence_end:\s*([\d.]+)/); if (m) { out.push({ start: open ?? 0, end: Number(m[1]) }); open = null; }
  }
  if (open != null && total > open) out.push({ start: open, end: total }); // silence that runs to the end of the file
  return out.filter((s) => s.end > s.start);
}

// The stretches with sound in them: everything between the silences.
export function speechRuns(silences, total, { minRun = 0.25 } = {}) {
  const runs = []; let at = 0;
  for (const s of [...silences].sort((a, b) => a.start - b.start)) { if (s.start - at >= minRun) runs.push({ start: r2(at), end: r2(s.start) }); at = Math.max(at, s.end); }
  if (total - at >= minRun) runs.push({ start: r2(at), end: r2(total) });
  return runs;
}

// Pieces short enough to transcribe in one request. Neighbouring runs are joined while they fit; a long run is cut evenly.
export function chunkRuns(runs, maxLen = 12) {
  const out = [];
  for (const r of runs) {
    const len = r.end - r.start;
    if (len > maxLen) { const n = Math.ceil(len / maxLen); for (let i = 0; i < n; i++) out.push({ start: r2(r.start + (len * i) / n), end: r2(r.start + (len * (i + 1)) / n) }); continue; }
    const last = out[out.length - 1];
    if (last && !last.fixed && r.end - last.start <= maxLen && r.start - last.end < 0.6) last.end = r.end; else out.push({ ...r });
  }
  return out.map(({ start, end }) => ({ start, end }));
}

// Scenes that follow the speech: a new scene starts just before a phrase begins, never in the middle of one when it can be avoided.
// Every scene is at most maxSec long (what the AI model can make) and the scenes cover the recording from start to end.
export function planScenes(phrases, total, { maxSec = 10, minSec = 2, target = 6, lead = 0.1 } = {}) {
  total = Math.max(0, Number(total) || 0); if (!(total > 0)) return [];
  maxSec = Math.max(1, maxSec); target = Math.min(target, maxSec); minSec = Math.min(minSec, target);
  const ph = [...phrases].filter((p) => p.end > p.start).sort((a, b) => a.start - b.start);
  const cuts = [0];
  for (const p of ph) {
    const last = cuts[cuts.length - 1]; const at = Math.max(0, p.start - lead);
    if (at - last >= minSec && p.end - last > target && total - at >= minSec) cuts.push(r2(at));
  }
  cuts.push(total);
  const spans = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1]; const n = Math.max(1, Math.ceil((b - a - 0.001) / maxSec));
    for (let k = 0; k < n; k++) spans.push({ start: r2(a + ((b - a) * k) / n), end: r2(a + ((b - a) * (k + 1)) / n) });
  }
  return spans.map((s, i) => {
    const words = ph.filter((p) => { const mid = (p.start + p.end) / 2; return mid >= s.start && (mid < s.end || i === spans.length - 1); }).map((p) => String(p.text || '').trim()).filter(Boolean).join(' ');
    return { start: s.start, duration: r2(s.end - s.start), narration: words };
  });
}

// Finds a steady beat. samples: mono 16-bit sound as numbers, rate: samples a second.
// Returns { bpm, beats: [seconds…] } or null when the music has no clear pulse.
export function beatGrid(samples, rate, { minBpm = 70, maxBpm = 180 } = {}) {
  const hop = Math.max(1, Math.round(rate / 100)); const n = Math.floor(samples.length / hop); if (n < 300) return null; // under 3 seconds
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let e = 0; const o = i * hop; for (let k = 0; k < hop; k++) { const v = samples[o + k]; e += v * v; } env[i] = Math.log1p(e / hop); }
  const on = new Float32Array(n); let sum = 0;
  for (let i = 1; i < n; i++) { const d = env[i] - env[i - 1]; on[i] = d > 0 ? d : 0; sum += on[i]; }
  const mean = sum / n; if (!(mean > 0)) return null;
  const at = (x) => { const i = Math.round(x); return i >= 0 && i < n ? Math.max(on[i], i > 0 ? on[i - 1] : 0, i + 1 < n ? on[i + 1] : 0) : 0; };
  let best = null;
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const period = 6000 / bpm; const steps = 24;
    for (let s = 0; s < steps; s++) {
      const phase = (period * s) / steps; let score = 0, count = 0;
      for (let x = phase; x < n; x += period) { score += at(x); count++; }
      score /= Math.max(1, count);
      if (!best || score > best.score) best = { bpm, phase, score, period };
    }
  }
  if (!best || best.score < mean * 4) return null; // beats must stand out clearly from the rest
  const beats = []; for (let x = best.phase; x < n; x += best.period) beats.push(r2(x / 100));
  return { bpm: Math.round(best.bpm), beats };
}

// The model was asked for JSON; this takes it out of whatever wrapping it arrived in.
// JSON from a writing model, read forgivingly. Seen on the real service: line breaks in the middle of strings and of key names
// ("scenes\n": …), code fences, words before or after, and an answer cut off before its end.
const tidyKeys = (v) => (Array.isArray(v) ? v.map(tidyKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k.trim(), tidyKeys(x)])) : v);
function mendStrings(t) { // drop raw control characters inside "…" (they are not allowed there), keep everything else
  let out = '', inStr = false, esc = false;
  for (const ch of t) {
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === '\\') { esc = true; out += ch; continue; }
      if (ch === '"') inStr = false;
      if (ch === '\n' || ch === '\r' || ch === '\t') continue;
      out += ch;
    } else { if (ch === '"') inStr = true; out += ch; }
  }
  return out;
}
export function parseJsonLoose(text) {
  const raw = String(text || '').replace(/```(?:json)?/gi, '').trim();
  for (const t of [raw, mendStrings(raw)]) {
    const shapes = [['{', '}'], ['[', ']']]; const io = (c) => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }; if (io('[') < io('{')) shapes.reverse(); // the bracket that comes first says what the answer is
    for (const [open, close] of shapes) {
      const a = t.indexOf(open), b = t.lastIndexOf(close);
      if (a >= 0 && b > a) { try { return tidyKeys(JSON.parse(t.slice(a, b + 1))); } catch { /* try the next reading */ } }
    }
  }
  // cut off before the end: keep every complete {…} of the list that was being written
  const t = mendStrings(raw); const at = t.indexOf('['); if (at < 0) return null;
  const items = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = at + 1; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start >= 0) { try { items.push(tidyKeys(JSON.parse(t.slice(start, i + 1)))); } catch { /* skip a broken one */ } start = -1; } }
    else if (ch === ']' && depth === 0) break;
  }
  return items.length ? { scenes: items, cutOff: true } : null;
}

// Lengths asked for by a storyboard, made to fit: each within what the model can make, together close to the wanted total.
export function fitDurations(wanted, totalSec, { minSec = 2, maxSec = 10 } = {}) {
  const w = wanted.map((x) => Math.max(minSec, Math.min(maxSec, Number(x) || (minSec + maxSec) / 2)));
  const sum = w.reduce((a, b) => a + b, 0); if (!(sum > 0) || !(totalSec > 0)) return w.map(r2);
  const k = totalSec / sum;
  return w.map((x) => Math.round(Math.max(minSec, Math.min(maxSec, x * k)) * 2) / 2);
}

// A slice of a 16-bit mono WAV, as a WAV of its own.
export function wavSlice(buf, startSec, endSec) {
  let off = 12, rate = 16000, dataAt = -1, dataLen = 0, channels = 1;
  while (off + 8 <= buf.length) {
    const tag = buf.toString('latin1', off, off + 4); const len = buf.readUInt32LE(off + 4);
    if (tag === 'fmt ') { channels = buf.readUInt16LE(off + 10); rate = buf.readUInt32LE(off + 12); }
    if (tag === 'data') { dataAt = off + 8; dataLen = Math.min(len, buf.length - dataAt); break; }
    off += 8 + len + (len % 2);
  }
  if (dataAt < 0) return null;
  const frame = 2 * channels; const a = Math.max(0, Math.floor(startSec * rate)) * frame; const b = Math.min(dataLen, Math.ceil(endSec * rate) * frame);
  if (b <= a) return null;
  const data = buf.subarray(dataAt + a, dataAt + b); const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8, 'latin1'); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * frame, 28); head.writeUInt16LE(frame, 32); head.writeUInt16LE(16, 34); head.write('data', 36, 'latin1'); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
