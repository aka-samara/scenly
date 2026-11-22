// Sound files that arrive looking like videos stay sound files, so music never lands on the Video row. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-music-'));
const { default: db } = await import('../server/db.js');
const { ingest } = await import('../server/files.js');
const { soundOnly, probe, ffmpegInfo } = await import('../server/ffmpeg.js');

test('soundOnly turns a picture-less video into a sound file and leaves real videos alone', () => {
  const a = { kind: 'video', mime: 'video/webm' }; assert.equal(soundOnly(a, { hasVideo: false, hasAudio: true }), true); assert.deepEqual([a.kind, a.mime], ['audio', 'audio/webm']);
  const b = { kind: 'video', mime: 'video/mp4' }; soundOnly(b, { hasVideo: false, hasAudio: true }); assert.equal(b.mime, 'audio/mp4');
  const c = { kind: 'video', mime: 'video/mp4' }; assert.equal(soundOnly(c, { hasVideo: true, hasAudio: true }), false); assert.equal(c.kind, 'video');
  const d = { kind: 'video', mime: 'video/mp4' }; assert.equal(soundOnly(d, { hasVideo: false, hasAudio: false }), false);
  assert.equal(soundOnly({ kind: 'image' }, { hasVideo: false, hasAudio: true }), false);
});

test('an .m4a or audio/webm upload is a sound file whatever the browser calls it', { skip: !ffmpegInfo().ok && 'ffmpeg missing' }, async () => {
  const user = { id: 'u_music' }; db.users.push(user);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-music-src-'));
  const make = (name, args) => { const out = path.join(dir, name); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', ...args, out]); return out; };
  const up = (src, originalname, mimetype) => { const tmp = path.join(dir, 'up-' + originalname); fs.copyFileSync(src, tmp); return { path: tmp, originalname, mimetype, size: fs.statSync(tmp).size }; };
  const m4a = make('song.m4a', ['-c:a', 'aac']); const webm = make('song.webm', ['-c:a', 'libopus']);
  assert.equal((await ingest(user, up(m4a, 'song.m4a', 'video/mp4'), { allowAudio: true })).kind, 'audio');
  assert.equal((await ingest(user, up(webm, 'song.webm', 'audio/webm'), { allowAudio: true })).kind, 'audio');
  // a .webm labelled video/webm is stored as a video, and becomes a sound file once it is read
  const meta = await ingest(user, up(webm, 'track.webm', 'video/webm'), { allowAudio: true }); assert.equal(meta.kind, 'video');
  const rec = db.files.find((f) => f.id === meta.id); const { locate } = await import('../server/storage.js');
  assert.equal(soundOnly(rec, await probe(locate(rec))), true); assert.equal(rec.kind, 'audio');
});
