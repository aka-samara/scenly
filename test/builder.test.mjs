// Video Builder: timeline maths, credit estimate, captions, ffmpeg command building, and a real 3-scene export from fixture files (no paid calls).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-build-'));
const P = await import('../server/builder/plan.js');
const { renderProject, cleanWork } = await import('../server/builder/render.js');
const { ffmpegInfo, probe } = await import('../server/ffmpeg.js');

const file = (id, duration, extra = {}) => [id, { id, userId: 'u1', duration, hasAudio: true, ...extra }];
const proj = (scenes, extra = {}) => ({ id: 'p1', userId: 'u1', ratio: '16:9', resolution: '720p', scenes, ...extra });

test('sizes are even and follow the ratio', () => {
  assert.deepEqual(P.dims('16:9', '720p'), { w: 1280, h: 720 }); assert.deepEqual(P.dims('9:16', '1080p'), { w: 1080, h: 1920 }); assert.deepEqual(P.dims('1:1', '480p'), { w: 480, h: 480 });
  for (const r of Object.keys(P.RATIOS)) for (const s of ['480p', '720p', '1080p']) { const d = P.dims(r, s); assert.ok(d.w % 2 === 0 && d.h % 2 === 0, r + s); }
});
test('timeline: starts, lengths and total with cuts', () => {
  const files = new Map([file('a', 6), file('b', 8)]);
  const lay = P.layout(proj([{ id: 's1', type: 'video', fileId: 'a' }, { id: 's2', type: 'video', fileId: 'b', trimIn: 1, trimOut: 5 }, { id: 's3', type: 'image', fileId: 'a', duration: 3 }]), files);
  assert.deepEqual(lay.rows.map((r) => [r.start, r.seconds]), [[0, 6], [6, 4], [10, 3]]); assert.equal(lay.seconds, 13);
});
test('timeline: a crossfade overlaps, so the video gets shorter by its length', () => {
  const files = new Map([file('a', 6), file('b', 8)]);
  const lay = P.layout(proj([{ id: 's1', type: 'video', fileId: 'a', transition: 'crossfade' }, { id: 's2', type: 'video', fileId: 'b', transition: 'black' }, { id: 's3', type: 'video', fileId: 'a' }]), files);
  assert.equal(lay.seconds, 6 + 8 + 6 - P.XFADE_SEC); assert.equal(lay.rows[1].start, 6 - P.XFADE_SEC); assert.equal(lay.rows[1].fadeOut, 12); assert.equal(lay.rows[2].fadeIn, 12);
  const ps = P.pieces(lay); assert.equal(ps.reduce((n, p) => n + p.frames, 0), lay.frames, 'parts add up to the whole video exactly');
  assert.deepEqual(ps.map((p) => p.kind), ['body', 'xfade', 'body', 'body']);
});
test('timeline: very short scenes never get a transition longer than a third of them', () => {
  const files = new Map([file('a', 0.6), file('b', 0.6)]);
  const lay = P.layout(proj([{ id: 's1', type: 'video', fileId: 'a', transition: 'crossfade' }, { id: 's2', type: 'video', fileId: 'b', transition: 'crossfade' }, { id: 's3', type: 'video', fileId: 'a' }]), files);
  for (const r of lay.rows) assert.ok(r.xIn + r.xOut < r.frames, 'something of every scene is left');
  assert.equal(P.pieces(lay).reduce((n, p) => n + p.frames, 0), lay.frames);
});
test('timeline: 60 scenes add up, and a voice-over mutes scene sound unless the user set it', () => {
  const files = new Map([file('a', 5)]); const scenes = Array.from({ length: 60 }, (_, i) => ({ id: 's' + i, type: 'video', fileId: 'a', transition: i % 3 === 0 ? 'crossfade' : 'cut', volume: i === 5 ? 0.8 : undefined }));
  const lay = P.layout(proj(scenes, { voice: { fileId: 'v' } }), files);
  assert.equal(lay.seconds, 300 - 20 * 0.5); assert.equal(lay.rows[0].volume, 0); assert.equal(lay.rows[5].volume, 0.8);
  assert.equal(P.layout(proj(scenes), files).rows[0].volume, 1);
});
test('an AI scene without a clip keeps its planned place', () => {
  const lay = P.layout(proj([{ id: 's1', type: 'ai', duration: 7, versions: [] }, { id: 's2', type: 'ai', duration: 5, versions: [{ fileId: 'a' }], cur: 0 }]), new Map([file('a', 5)]));
  assert.equal(lay.rows[0].ready, false); assert.equal(lay.rows[0].seconds, 7); assert.equal(lay.rows[1].ready, true); assert.equal(lay.rows[1].start, 7);
});
const model = (durations, per = { '720p': 20, '1080p': 40 }) => ({ id: 'm', video: { durations, resolutions: Object.keys(per) }, price: { creditsPerSecond: per } });
test('a scene is never planned longer than the model allows', () => {
  const m = model([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  for (let want = 0.5; want <= 40; want += 0.25) { const d = P.allowedDuration(m, want); assert.ok(d >= 4 && d <= 15, `${want}s gave ${d}`); if (want >= 4 && want <= 15) assert.ok(d >= want && d - want < 1, `${want}s is covered by ${d}`); }
  assert.equal(P.allowedDuration(model([-1]), 8), null); assert.equal(P.allowedDuration(model([5, 10]), 6), 10);
});
test('credit estimate: only AI scenes that still need a clip, uploads and export are free', () => {
  const m = model([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  const p = proj([{ id: 'a', type: 'ai', duration: 5, versions: [] }, { id: 'b', type: 'ai', duration: 7.2, versions: [] }, { id: 'c', type: 'ai', duration: 5, versions: [{ fileId: 'x' }] }, { id: 'd', type: 'video', fileId: 'x' }, { id: 'e', type: 'ai', duration: 5, versions: [], locked: true }], { modelId: 'm' });
  const e = P.estimate(p, [m]); assert.equal(e.total, 5 * 20 + 8 * 20); assert.deepEqual(e.scenes.map((s) => s.id), ['a', 'b']);
  assert.equal(P.estimate(p, [m], { only: ['c'] }).total, 100, 'regenerating one scene is priced on its own');
  assert.equal(P.estimate({ ...p, resolution: '1080p' }, [m]).total, 5 * 40 + 8 * 40);
  assert.equal(P.estimate(proj([{ id: 'd', type: 'video', fileId: 'x' }]), [m]).total, 0);
});
test('captions: cleaned, in order, never overlapping, and written as .srt', () => {
  const srt = P.toSrt([{ start: 3, end: 6, text: 'Second line' }, { start: 0, end: 3.5, text: ' First\r\nline ' }, { start: 7, end: 7, text: 'gone' }, { start: 8, end: 99, text: 'Last' }, { start: 1, end: 2, text: '   ' }], 10);
  assert.equal(srt, '1\n00:00:00,000 --> 00:00:03,000\nFirst\nline\n\n2\n00:00:03,000 --> 00:00:06,000\nSecond line\n\n3\n00:00:08,000 --> 00:00:10,000\nLast\n');
});
test('command lines: one part, a crossfade, the sound mix', () => {
  const a = P.pieceArgs({ src: '/x/in.mp4', type: 'video', hasAudio: true, trimIn: 1.5, volume: 0.5, fit: 'pad', w: 1280, h: 720 }, { from: 15, frames: 90, fadeIn: 12, fadeOut: 0 }, 'o.mp4', 'o.wav');
  assert.deepEqual(a.slice(0, 6), ['-ss', '2', '-t', '4', '-i', '/x/in.mp4']); const fc = a[a.indexOf('-filter_complex') + 1];
  assert.match(fc, /boxblur/); assert.match(fc, /fps=30,tpad=stop_mode=clone:stop_duration=1,format=yuv420p,fade=t=in:st=0:d=0\.4\[v\]/); assert.match(fc, /\[0:a\].*volume=0\.5.*atrim=end_sample=144000\[a\]/); assert.equal(a[a.indexOf('-frames:v') + 1], '90');
  const img = P.pieceArgs({ src: '/x/p.png', type: 'image', hasAudio: false, fit: 'crop', w: 720, h: 1280 }, { from: 0, frames: 120 }, 'o.mp4', 'o.wav');
  assert.deepEqual(img.slice(0, 4), ['-loop', '1', '-framerate', '30']); assert.match(img.join(' '), /anullsrc/); assert.doesNotMatch(img.join(' '), /boxblur/);
  assert.match(P.xfadeArgs({ video: 'a.mp4', audio: 'a.wav' }, { video: 'b.mp4', audio: 'b.wav' }, 15, 'x.mp4', 'x.wav').join(' '), /xfade=transition=fade:duration=0\.5:offset=0.*acrossfade=d=0\.5/);
  const mix = P.mixArgs('v.mp4', { scenes: 's.wav', voice: { path: 'vo.mp3', volume: 1 }, music: { path: 'mu.mp3', volume: 0.4, duck: true, duckDb: 12 } }, 30, 'out.mp4').join(' ');
  assert.match(mix, /sidechaincompress=threshold=0\.03:ratio=4/); assert.match(mix, /amix=inputs=3/); assert.match(mix, /afade=t=out:st=28:d=2/); assert.match(mix, /-c:v copy/);
  assert.doesNotMatch(P.mixArgs('v.mp4', { scenes: 's.wav', voice: { path: 'vo.mp3' }, music: { path: 'mu.mp3', duck: false } }, 30, 'o.mp4').join(' '), /sidechaincompress/, 'ducking can be switched off');
  assert.match(P.mixArgs('v.mp4', { scenes: 's.wav' }, 10, 'o.mp4').join(' '), /amix=inputs=1/);
  assert.equal(P.loopMusicArgs('m.mp3', 10, 35, 'o.wav').copies, 5);
  assert.equal(P.concatList(["/a/it's.mp4"]), "file '/a/it'\\''s.mp4'\n");
});

// ---------- a real export from fixture files ----------
const ff = ffmpegInfo().ok;
test('export: 3 mixed scenes + voice-over + looping music + burned captions', { skip: !ff && 'ffmpeg is not installed here', timeout: 180000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fix-')); const sh = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
  sh(['-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', dir + '/wide.mp4']);
  sh(['-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=25:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', dir + '/tall-silent.mp4']);
  sh(['-f', 'lavfi', '-i', 'color=c=orange:size=800x600', '-frames:v', '1', dir + '/pic.png']);
  sh(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=7', dir + '/voice.mp3']); sh(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=3', dir + '/music.mp3']);
  const rec = (id, name, extra) => [id, { id, userId: 'u1', kind: 'video', ...extra, __path: dir + '/' + name }];
  // The engine finds files through the storage layer, so the fixtures are placed there.
  const { put } = await import('../server/storage.js');
  const add = (id, name, extra) => { const key = put(`users/u1/uploads/test/${name}`, fs.readFileSync(dir + '/' + name)); return [id, { id, userId: 'u1', key, ...extra }]; };
  const files = new Map([add('wide', 'wide.mp4', { kind: 'video', duration: 4, hasAudio: true }), add('tall', 'tall-silent.mp4', { kind: 'video', duration: 3, hasAudio: false }), add('pic', 'pic.png', { kind: 'image' }), add('vo', 'voice.mp3', { kind: 'audio', duration: 7 }), add('mu', 'music.mp3', { kind: 'audio', duration: 3 })]);
  const project = { id: 'p1', userId: 'u1', ratio: '16:9', resolution: '720p', voice: { fileId: 'vo', volume: 1 }, music: { fileId: 'mu', volume: 0.4, duck: true, fit: true }, captionStyle: 'boxed',
    captions: [{ start: 0.2, end: 2.5, text: 'Hello from the builder' }, { start: 3, end: 6, text: 'Second caption' }],
    scenes: [{ id: 's1', type: 'video', fileId: 'wide', trimIn: 0.5, trimOut: 3.5, transition: 'crossfade', volume: 1 }, { id: 's2', type: 'image', fileId: 'pic', duration: 2.5, transition: 'black' }, { id: 's3', type: 'video', fileId: 'tall', fit: 'pad' }] };
  const notes = [];
  const r = await renderProject(project, files, { burnCaptions: true, progress: (n, note) => notes.push(note) });
  assert.equal(r.seconds, 3 + 2.5 + 3 - 0.5); assert.ok(Math.abs(r.measured - r.seconds) < 0.12, `measured ${r.measured}`); assert.equal(r.width, 1280); assert.equal(r.height, 720); assert.equal(r.burned, true);
  const info = await probe(r.file); assert.equal(info.videoCodec, 'h264'); assert.equal(info.audioCodec, 'aac'); assert.equal(info.fps, 30); assert.ok(info.hasAudio);
  const pix = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt,nb_frames', '-of', 'csv=p=0', r.file], { encoding: 'utf8' }).trim(); assert.equal(pix, 'yuv420p,240');
  assert.ok(notes.some((n) => /Preparing scene/.test(n)) && notes.includes('Mixing the sound'));
  cleanWork(r.work);
  // exporting again uses the cache and gives the same length; without captions burned and at another size
  const t0 = Date.now(); const again = await renderProject(project, files, {}); assert.equal(again.burned, false); assert.equal(again.seconds, r.seconds); assert.ok(Date.now() - t0 < 15000); cleanWork(again.work);
  const audio = await renderProject(project, files, { audioOnly: true }); const ai = await probe(audio.file); assert.ok(!ai.hasVideo && ai.hasAudio && Math.abs(ai.duration - r.seconds) < 0.12); cleanWork(audio.work);
  const tall = await renderProject({ ...project, ratio: '9:16' }, files, { resolution: '480p' }); assert.equal(tall.width, 480); assert.equal(tall.height, 854); cleanWork(tall.work);
  // a scene with no clip is refused with a plain message
  await assert.rejects(renderProject({ ...project, scenes: [...project.scenes, { id: 's4', type: 'ai', duration: 5, versions: [] }] }, files, {}), (e) => /Scene 4 has no video yet/.test(e.message) && e.status === 400);
  await assert.rejects(renderProject({ ...project, scenes: [] }, files, {}), /Add at least one scene/);
});
