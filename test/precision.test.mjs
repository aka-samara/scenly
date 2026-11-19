// Precision editing in the export engine: speed, playing backwards, versions made from a time range, text overlays, track fades.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-prec-'));
const { layout, sceneSeconds, sceneWindow, pieceArgs, cleanCaptions, toSrt, mixArgs, MAX_REVERSE_SEC } = await import('../server/builder/plan.js');
const { renderProject, cleanWork } = await import('../server/builder/render.js');
const { ffmpegInfo } = await import('../server/ffmpeg.js');

test('speed changes how long a scene plays, never below or above the allowed range', () => {
  const src = { duration: 8 };
  assert.equal(sceneSeconds({ type: 'video', speed: 2 }, src), 4); assert.equal(sceneSeconds({ type: 'video', speed: 0.5, trimIn: 1, trimOut: 3 }, src), 4);
  assert.equal(sceneSeconds({ type: 'video', speed: 9 }, src), 8); assert.equal(sceneSeconds({ type: 'video', speed: 0.1 }, src), 8);
  assert.equal(sceneSeconds({ type: 'image', duration: 3, speed: 2 }, null), 3);
});
test('a version made from a time range keeps its own window, so flipping versions keeps the length', () => {
  const s = { type: 'ai', versions: [{ fileId: 'orig', tin: 12, tout: 15 }, { fileId: 'retake', tin: 0, tout: 3 }], cur: 0, trimIn: 99 };
  assert.deepEqual(sceneWindow(s), { tin: 12, tout: 15 }); assert.equal(sceneSeconds(s, { duration: 60 }), 3);
  assert.equal(sceneSeconds({ ...s, cur: 1 }, { duration: 5 }), 3);
  assert.deepEqual(sceneWindow({ type: 'ai', versions: [{ fileId: 'a' }], cur: 0, trimIn: 1, trimOut: 2 }), { tin: 1, tout: 2 });
  const files = new Map([['orig', { duration: 60 }], ['retake', { duration: 5 }]]);
  const a = layout({ scenes: [s] }, files), b = layout({ scenes: [{ ...s, cur: 1 }] }, files);
  assert.equal(a.seconds, 3); assert.equal(b.seconds, 3); assert.equal(a.rows[0].trimIn, 12); assert.equal(b.rows[0].trimIn, 0);
});
test('ffmpeg arguments: speed reads more of the source, backwards starts from the end of the stretch', () => {
  const base = { src: 'in.mp4', type: 'video', hasAudio: true, trimIn: 2, volume: 1, w: 1280, h: 720 };
  const fast = pieceArgs({ ...base, speed: 2, rowFrames: 90 }, { from: 30, frames: 60 }, 'v.mp4', 'a.wav');
  assert.equal(fast[fast.indexOf('-ss') + 1], '4'); assert.match(fast.join(' '), /setpts=PTS\/2/); assert.match(fast.join(' '), /atempo=2/);
  const back = pieceArgs({ ...base, reverse: true, rowFrames: 90 }, { from: 0, frames: 30 }, 'v.mp4', 'a.wav');
  assert.equal(back[back.indexOf('-ss') + 1], '4'); assert.match(back.join(' '), /,reverse,/); assert.match(back.join(' '), /areverse/);
  const plain = pieceArgs(base, { from: 0, frames: 30 }, 'v.mp4', 'a.wav').join(' '); assert.doesNotMatch(plain, /setpts=PTS\/|reverse|atempo/);
});
test('text overlays: a title may show with a caption, the download holds captions only, the burned file places each text', () => {
  const caps = [{ start: 0, end: 4, text: 'Spoken line' }, { start: 1, end: 3, text: 'BIG {\\an1}TITLE', pos: 'middle' }, { start: 2, end: 5, text: 'Next spoken line' }, { start: 2, end: 6, text: 'Ada Lovelace', pos: 'lower' }, { start: 7, end: 8, text: 'x', pos: 'nowhere' }];
  const c = cleanCaptions(caps, 10);
  assert.equal(c.find((x) => x.text === 'Spoken line').end, 2, 'captions in the same place do not overlap');
  assert.equal(c.find((x) => x.pos === 'middle').end, 3); assert.equal(c.find((x) => x.pos === 'middle').text, 'BIG an1TITLE', 'style codes typed by a person are removed');
  assert.ok(!c.some((x) => x.pos === 'nowhere'));
  const plain = toSrt(caps, 10); assert.doesNotMatch(plain, /TITLE|Lovelace|\{/); assert.match(plain, /Spoken line/);
  const burn = toSrt(caps, 10, { overlays: true }); assert.match(burn, /\{\\an5\\fs30\\b1\}BIG an1TITLE/); assert.match(burn, /\{\\an1\\fs18\\b1\}Ada Lovelace/);
});
test('track fades are written into the mix', () => {
  const a = mixArgs('v.mp4', { scenes: 's.wav', voice: { path: 'vo.mp3', volume: 1, fadeIn: 1, fadeOut: 2, duration: 9 }, music: { path: 'mu.wav', volume: 0.5, duck: true, fadeIn: 3, fadeOut: 5 } }, 20, 'o.mp4').join(' ');
  assert.match(a, /afade=t=in:st=0:d=1,afade=t=out:st=7:d=2/); assert.match(a, /afade=t=in:st=0:d=3,afade=t=out:st=15:d=5/);
  const b = mixArgs('v.mp4', { scenes: 's.wav', music: { path: 'mu.wav' } }, 20, 'o.mp4').join(' '); assert.match(b, /afade=t=out:st=18:d=2/); assert.doesNotMatch(b, /afade=t=in/);
});

const ff = ffmpegInfo().ok;
test('export: a fast scene, a backwards scene and a range version come out at the right length and the right way round', { skip: !ff && 'ffmpeg is not installed here', timeout: 180000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pfix-')); const sh = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
  // brightness rises steadily over 4 seconds, so a frame tells what moment of the source it came from
  sh(['-f', 'lavfi', '-i', "color=c=black:size=640x360:rate=30:duration=4,format=gray,geq=lum='16+50*T'", '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', dir + '/ramp.mp4']);
  sh(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=5', dir + '/voice.mp3']);
  const { put } = await import('../server/storage.js');
  const add = (id, name, extra) => { const key = put(`users/u1/uploads/prec/${name}`, fs.readFileSync(dir + '/' + name)); return [id, { id, userId: 'u1', key, ...extra }]; };
  const files = new Map([add('ramp', 'ramp.mp4', { kind: 'video', duration: 4, hasAudio: true }), add('vo', 'voice.mp3', { kind: 'audio', duration: 5 })]);
  const project = { id: 'p2', userId: 'u1', ratio: '16:9', resolution: '480p', voice: { fileId: 'vo', volume: 1, fadeIn: 0.5, fadeOut: 0.5 }, captions: [{ start: 0.2, end: 2, text: 'Title', pos: 'middle' }, { start: 0.5, end: 3, text: 'Spoken' }],
    scenes: [{ id: 'a', type: 'video', fileId: 'ramp', speed: 2, volume: 1 }, // 4 s at double speed = 2 s
      { id: 'b', type: 'video', fileId: 'ramp', trimIn: 0.5, trimOut: 2.5, reverse: true, volume: 1 }, // 2 s, backwards
      { id: 'c', type: 'ai', versions: [{ fileId: 'ramp', tin: 1, tout: 2.5 }], cur: 0 }] }; // 1.5 s from the middle of the source
  const r = await renderProject(project, files, { burnCaptions: ffmpegInfo().canBurn });
  assert.equal(r.seconds, 5.5); assert.ok(Math.abs(r.measured - 5.5) < 0.12, 'measured ' + r.measured);
  const luma = (t) => { const o = spawnSync('ffmpeg', ['-v', 'info', '-ss', String(t), '-i', r.file, '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8' }); return Number((o.stderr.match(/YAVG=([\d.]+)/) || [])[1]); };
  const fastStart = luma(0.1), fastEnd = luma(1.8); assert.ok(fastEnd - fastStart > 120, `double speed covers the whole 4 s of the source in 2 s: ${fastStart} to ${fastEnd}`);
  const backStart = luma(2.15), backEnd = luma(3.85); assert.ok(backStart - backEnd > 60, `the backwards scene starts bright and ends dark: ${backStart} to ${backEnd}`);
  assert.ok(Math.abs(backStart - (16 + 50 * 2.35)) < 16 && Math.abs(backEnd - (16 + 50 * 0.65)) < 16, 'and it shows the trimmed stretch (0.5 to 2.5 s) of the source');
  const rangeStart = luma(4.1); assert.ok(Math.abs(rangeStart - (16 + 50 * 1.1)) < 14, `the range version starts at its own window: ${rangeStart}`);
  cleanWork(r.work);
  await assert.rejects(renderProject({ ...project, scenes: [{ id: 'z', type: 'video', fileId: 'ramp', reverse: true, speed: 0.5 }, { id: 'y', type: 'video', fileId: 'ramp', speed: 0.5, reverse: true, trimOut: 4 }].slice(0, 1).map((s) => ({ ...s, speed: 1 })).concat([{ id: 'w', type: 'video', fileId: 'ramp', speed: 0.5 }]).map((s) => (s.id === 'z' ? { ...s, fileId: 'long' } : s)) }, new Map([...files, ['long', { ...files.get('ramp'), id: 'long', duration: MAX_REVERSE_SEC + 4 }]]), {}), /plays backwards and is longer/);
});
