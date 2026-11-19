// Storage layer, download links, readable names, upload checks and the ZIP writer. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Writable } from 'node:stream';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-store-'));
process.env.DOWNLOAD_LINK_SECONDS = '60';
const { default: db } = await import('../server/db.js');
const S = await import('../server/storage.js');
const { streamZip, zipSize } = await import('../server/zipstream.js');

test('keys follow the layout', () => {
  assert.equal(S.keys.upload('u1', 'video', 'f_1', 'mp4'), 'users/u1/uploads/videos/f_1.mp4');
  assert.equal(S.keys.upload('u1', 'audio', 'f_2', 'mp3'), 'users/u1/uploads/audio/f_2.mp3');
  assert.equal(S.keys.generation('u1', 'g_9', 2, 'mp4'), 'users/u1/generations/g_9/2.mp4');
  assert.equal(S.keys.scene('u1', 'p1', 's3', 4), 'users/u1/projects/p1/scenes/s3/v4.mp4');
  assert.equal(S.keys.exportFile('u1', 'p1', 'e7'), 'users/u1/projects/p1/exports/e7.mp4');
});
test('a key can never leave the storage folder', () => {
  assert.equal(S.keys.upload('../../etc', 'image', '../x', 'png'), 'users/.._.._etc/uploads/images/.._x.png');
  assert.throws(() => S.abs('../outside.txt')); assert.throws(() => S.abs('/etc/passwd')); assert.throws(() => S.abs('users/../../x'));
});
test('put, read, size, remove', () => { const k = S.put(S.keys.generation('u1', 'g1', 1, 'png'), Buffer.from('hello')); assert.ok(S.exists(k)); assert.equal(S.sizeOf(k), 5); assert.equal(fs.readFileSync(S.abs(k), 'utf8'), 'hello'); S.remove(k); assert.ok(!S.exists(k)); S.remove(k); });
test('old rows keep their old place, new rows use their key', () => {
  assert.ok(S.locate({ id: 'f_old', kind: 'image' }).endsWith(path.join('uploads', 'f_old')));
  assert.ok(S.locate({ id: 'm_old', kind: 'generated', file: 'm_old.png' }).endsWith(path.join('media', 'm_old.png')));
  assert.equal(S.locate({ id: 'm_remote', kind: 'generated', remoteUrl: 'https://x' }), null);
  assert.equal(S.locate({ id: 'm_new', kind: 'generated', key: 'users/u/generations/g/1.png' }), S.abs('users/u/generations/g/1.png'));
});
test('download links: valid, tampered, expired', async () => {
  const t = S.signDownload('m_1'); assert.equal(S.readDownloadToken(t).fileId, 'm_1');
  const [b, s] = t.split('.'); const other = Buffer.from(JSON.stringify({ f: 'm_2', e: 9999999999 })).toString('base64url');
  assert.equal(S.readDownloadToken(other + '.' + s), null, 'a changed file id is refused');
  assert.equal(S.readDownloadToken(b + '.' + s.slice(0, -1) + (s.at(-1) === 'A' ? 'B' : 'A')), null);
  assert.equal(S.readDownloadToken('garbage'), null); assert.equal(S.readDownloadToken(''), null);
  assert.equal(S.readDownloadToken(S.signDownload('m_1', { ttl: -5 })), null, 'an expired link is refused');
});
test('readable download names', () => {
  assert.equal(S.downloadName({ kind: 'generated', type: 'video', mime: 'video/mp4', key: 'users/u/generations/g/1.mp4', n: 2, createdAt: '2026-11-17T10:00:00Z' }, { title: 'Summer Launch: Café Ad!' }), 'summer-launch-cafe-ad_03_2026-11-17.mp4');
  assert.equal(S.downloadName({ kind: 'generated', type: 'image', mime: 'image/png', file: 'm.png', prompt: '', createdAt: '2026-01-02T00:00:00Z' }), 'image_2026-01-02.png');
  assert.equal(S.downloadName({ kind: 'video', name: 'my:clip?.mov', mime: 'video/quicktime' }), 'my_clip_.mov');
  assert.match(S.contentDisposition('été "x".mp4'), /^attachment; filename="_t_ _x_.mp4"; filename\*=UTF-8''/);
});
test('upload checks read the real start of the file', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]);
  assert.ok(S.looksLike('image', png)); assert.ok(S.looksLike('video', mp4)); assert.ok(S.looksLike('audio', mp3)); assert.ok(S.looksLike('audio', mp4), 'm4a sound uses the mp4 container');
  assert.ok(!S.looksLike('image', mp4)); assert.ok(!S.looksLike('video', png)); assert.ok(!S.looksLike('image', Buffer.from('<script>alert(1)</script>....')), 'a web page named .png is refused'); assert.ok(!S.looksLike('video', Buffer.from('MZ' + 'x'.repeat(30))), 'a program named .mp4 is refused');
});
test('usage and quota', () => {
  db.files.push({ id: 'a', userId: 'q1', mime: 'image/png', size: 400 }, { id: 'b', userId: 'q1', mime: 'video/mp4', size: 600, derivedBytes: 100 }, { id: 'c', userId: 'q1', mime: 'video/mp4', remoteUrl: 'x', size: 999 }, { id: 'd', userId: 'q2', mime: 'audio/mpeg', size: 50 });
  const u = S.usage('q1'); assert.equal(u.bytes, 1100); assert.equal(u.files, 2); assert.equal(u.byKind.videos, 600); assert.equal(S.usage('q2').byKind.audio, 50);
  process.env.STORAGE_QUOTA_MB = '1'; assert.doesNotThrow(() => S.checkQuota('q1', 1000)); assert.throws(() => S.checkQuota('q1', 2 * 1024 * 1024), (e) => e.status === 413); delete process.env.STORAGE_QUOTA_MB;
});
test('streamed ZIP opens and holds every file unchanged', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-zip-')); const entries = [];
  for (let i = 0; i < 10; i++) { const p = path.join(dir, `src${i}`); const buf = Buffer.alloc(300000 + i * 7919, i + 1); buf.write('clip ' + i); fs.writeFileSync(p, buf); entries.push({ name: i === 3 ? 'été vidéo_03.mp4' : `clip_${String(i + 1).padStart(2, '0')}.mp4`, path: p, size: buf.length }); }
  const out = path.join(dir, 'out.zip'); const ws = fs.createWriteStream(out);
  const bytes = await streamZip(ws, entries); await new Promise((r) => ws.end(r));
  assert.equal(bytes, zipSize(entries), 'size known before writing'); assert.equal(fs.statSync(out).size, bytes);
  const py = `import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps({i.filename:[i.file_size,z.read(i.filename)[:6].decode()] for i in z.infolist()}))`;
  const got = JSON.parse(execFileSync('python3', ['-c', py, out], { encoding: 'utf8' }));
  assert.equal(Object.keys(got).length, 10); assert.deepEqual(got['clip_01.mp4'], [300000, 'clip 0']); assert.deepEqual(got['été vidéo_03.mp4'], [300000 + 3 * 7919, 'clip 3']);
});
test('ZIP stops cleanly when the browser goes away', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-zip2-')); const p = path.join(dir, 'big'); fs.writeFileSync(p, Buffer.alloc(8 * 1024 * 1024));
  const ac = new AbortController(); let n = 0; const sink = new Writable({ write(chunk, _e, cb) { n += chunk.length; if (n > 2 * 1024 * 1024) ac.abort(); cb(); } });
  await assert.rejects(streamZip(sink, [{ name: 'big.mp4', path: p, size: 8 * 1024 * 1024 }], { signal: ac.signal }), /aborted/);
});
