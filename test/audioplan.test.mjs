// Scenes from sound: pauses, phrases, scene plan, beats, loose JSON.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSilences, speechRuns, chunkRuns, planScenes, beatGrid, parseJsonLoose, fitDurations, wavSlice } from '../server/builder/audioplan.js';

const LOG = `[silencedetect @ 0x1] silence_start: 2.5\n[silencedetect @ 0x1] silence_end: 3.4 | silence_duration: 0.9\nframe= 1\n[silencedetect @ 0x1] silence_start: 8\n[silencedetect @ 0x1] silence_end: 8.6 | silence_duration: 0.6\n[silencedetect @ 0x1] silence_start: 19.2\n`;

test('silences are read from the ffmpeg log, including one that runs to the end', () => {
  assert.deepEqual(parseSilences(LOG, 20), [{ start: 2.5, end: 3.4 }, { start: 8, end: 8.6 }, { start: 19.2, end: 20 }]);
  assert.deepEqual(parseSilences('', 10), []);
});
test('speech runs are what lies between the silences', () => {
  assert.deepEqual(speechRuns(parseSilences(LOG, 20), 20), [{ start: 0, end: 2.5 }, { start: 3.4, end: 8 }, { start: 8.6, end: 19.2 }]);
  assert.deepEqual(speechRuns([{ start: 0, end: 10 }], 10), []);
  assert.deepEqual(speechRuns([], 7), [{ start: 0, end: 7 }]);
});
test('a long run is cut into pieces a model can hear in one go', () => {
  const c = chunkRuns([{ start: 0, end: 2.5 }, { start: 3.4, end: 8 }, { start: 8.6, end: 39 }], 12);
  assert.ok(c.every((x) => x.end - x.start <= 12.01)); assert.equal(c[0].start, 0); assert.equal(c[c.length - 1].end, 39);
});
test('scenes cover the whole recording, none longer than the model allows, cuts fall before phrases', () => {
  const phrases = [{ start: 0.2, end: 2.5, text: 'Hello there.' }, { start: 3.4, end: 8, text: 'This is our shop.' }, { start: 8.6, end: 19.2, text: 'We bake every morning and deliver by bike.' }, { start: 21, end: 24, text: 'Come and see us.' }];
  const s = planScenes(phrases, 25, { maxSec: 8, minSec: 2, target: 6 });
  assert.equal(s[0].start, 0); assert.ok(Math.abs(s.reduce((n, x) => n + x.duration, 0) - 25) < 0.05);
  assert.ok(s.every((x) => x.duration <= 8.01 && x.duration > 0.9));
  for (let i = 1; i < s.length; i++) assert.ok(Math.abs(s[i].start - (s[i - 1].start + s[i - 1].duration)) < 0.02);
  assert.match(s.map((x) => x.narration).join(' '), /Hello there\. This is our shop\..*Come and see us\./);
  assert.ok(s.some((x) => Math.abs(x.start - 8.5) < 0.01), 'a cut just before "We bake…"');
  assert.deepEqual(planScenes([], 0), []);
  const noWords = planScenes([], 21, { maxSec: 5 }); assert.equal(noWords.length, 5); assert.ok(noWords.every((x) => x.duration <= 5 && x.narration === ''));
});
test('a steady beat is found, silence and noise are not mistaken for one', () => {
  const rate = 11025; const make = (bpm, sec) => { const a = new Int16Array(rate * sec); const step = (60 / bpm) * rate; for (let b = 0.25 * rate; b < a.length; b += step) for (let k = 0; k < 400; k++) { const i = Math.round(b) + k; if (i < a.length) a[i] = Math.round(20000 * Math.exp(-k / 80) * Math.sin(k / 3)); } return a; };
  const g = beatGrid(make(120, 20), rate); assert.ok(g, 'beat found'); assert.ok([120, 60].includes(g.bpm) || Math.abs(g.bpm - 120) <= 1, 'bpm ' + g.bpm);
  const gaps = g.beats.slice(1).map((b, i) => b - g.beats[i]); assert.ok(gaps.every((d) => Math.abs(d - 60 / g.bpm) < 0.03));
  assert.ok(g.beats.some((b) => Math.abs(b - 0.25) < 0.04 || Math.abs(b - 0.75) < 0.04), 'beats line up with the clicks: ' + g.beats.slice(0, 3));
  assert.equal(beatGrid(new Int16Array(rate * 10), rate), null);
  assert.equal(beatGrid(new Int16Array(rate), rate), null);
  const g2 = beatGrid(make(96, 20), rate); assert.ok(g2 && Math.abs(g2.bpm - 96) <= 1, 'bpm ' + g2?.bpm);
});
test('JSON is taken out of code fences and chatter', () => {
  assert.deepEqual(parseJsonLoose('Sure!\n```json\n{"scenes":[{"n":1,"visual":"a"}]}\n```'), { scenes: [{ n: 1, visual: 'a' }] });
  assert.deepEqual(parseJsonLoose('[1,2]'), [1, 2]);
  assert.equal(parseJsonLoose('no json here'), null); assert.equal(parseJsonLoose('{broken'), null);
});
test('storyboard lengths are fitted to the model and the wanted total', () => {
  const d = fitDurations([5, 5, 5, 5, 50, 'x'], 30, { minSec: 2, maxSec: 10 });
  assert.equal(d.length, 6); assert.ok(d.every((x) => x >= 2 && x <= 10)); assert.ok(Math.abs(d.reduce((a, b) => a + b, 0) - 30) <= 6);
});
test('a WAV slice is a valid WAV of the right length', () => {
  const rate = 16000; const data = Buffer.alloc(rate * 2 * 3); const head = Buffer.alloc(44); head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  const s = wavSlice(Buffer.concat([head, data]), 1, 2.5); assert.equal(s.toString('latin1', 0, 4), 'RIFF'); assert.equal(s.length, 44 + rate * 2 * 1.5); assert.equal(s.readUInt32LE(24), rate);
  assert.equal(wavSlice(Buffer.concat([head, data]), 5, 6), null);
});

test('a storyboard is read even when the writing model breaks lines inside words or stops early', () => {
  const real = '{\n\n  "title": "Morning",\n  "look\n": "Warm, soft\n light",\n  "scenes\n": [\n    {\n      "seconds": 5,\n      "visual": "Close-up of\n coffee beans, he says \\"hello\\"",\n      "narration\n": "Good morning."\n    }\n  ]\n}';
  const j = parseJsonLoose(real);
  assert.equal(j.title, 'Morning'); assert.equal(j.look, 'Warm, soft light'); assert.equal(j.scenes.length, 1); assert.equal(j.scenes[0].visual, 'Close-up of coffee beans, he says "hello"'); assert.equal(j.scenes[0].narration, 'Good morning.');
  const cut = parseJsonLoose('Here it is:\n```json\n{"title":"T","scenes":[{"seconds":5,"visual":"one {with} braces"},{"seconds":6,"visual":"two"},{"seconds":7,"vis');
  assert.equal(cut.cutOff, true); assert.deepEqual(cut.scenes.map((x) => x.visual), ['one {with} braces', 'two']);
  assert.equal(parseJsonLoose('Sorry, I cannot do that.'), null); assert.deepEqual(parseJsonLoose('[{"n":1}]'), [{ n: 1 }]);
});
