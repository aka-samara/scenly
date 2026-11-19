// Storage layer. Every stored file has a key (a path-like name) and a row in db.files.
// This build keeps files on the local disk under DATA_DIR/storage; a bucket driver can replace
// the functions marked "driver" at production without touching the rest of the app.
//
// Layout:
//   users/{userId}/uploads/{images|videos|audio|files}/{fileId}.{ext}
//   users/{userId}/generations/{genId}/{n}.{ext}
//   users/{userId}/projects/{projectId}/scenes/{sceneId}/v{version}.mp4
//   users/{userId}/projects/{projectId}/exports/{exportId}.mp4
//   users/{userId}/derived/{fileId}/poster.jpg | proxy.mp4
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import db, { save, DATA_DIR, UPLOAD_DIR, MEDIA_DIR } from './db.js';
import { bucketConfig, putObject, deleteObject, presignUrl, getObjectToFile } from './objectstore.js';

export const STORAGE_DIR = path.join(DATA_DIR, 'storage');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const clean = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || '_';
const EXT_OK = /^[a-z0-9]{1,5}$/;
export const safeExt = (name, fallback = 'bin') => { const e = path.extname(String(name || '')).slice(1).toLowerCase(); return EXT_OK.test(e) ? e : fallback; };

export const keys = {
  upload: (userId, kind, fileId, ext) => `users/${clean(userId)}/uploads/${{ image: 'images', video: 'videos', audio: 'audio' }[kind] || 'files'}/${clean(fileId)}.${clean(ext)}`,
  generation: (userId, genId, n, ext) => `users/${clean(userId)}/generations/${clean(genId)}/${clean(n)}.${clean(ext)}`,
  scene: (userId, projectId, sceneId, version, ext = 'mp4') => `users/${clean(userId)}/projects/${clean(projectId)}/scenes/${clean(sceneId)}/v${Number(version) || 1}.${clean(ext)}`,
  exportFile: (userId, projectId, exportId, ext = 'mp4') => `users/${clean(userId)}/projects/${clean(projectId)}/exports/${clean(exportId)}.${clean(ext)}`,
  derived: (userId, fileId, name) => `users/${clean(userId)}/derived/${clean(fileId)}/${clean(name)}`,
};

// ---- driver (local disk) ----
export function abs(key) {
  const p = path.resolve(STORAGE_DIR, key);
  if (!p.startsWith(STORAGE_DIR + path.sep)) throw new Error('Bad storage key');
  return p;
}
export function put(key, buf) { const p = abs(key); fs.mkdirSync(path.dirname(p), { recursive: true }); const tmp = p + '.part'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, p); mirror(p); return key; }
export function putFile(key, srcPath, { move = false } = {}) {
  const p = abs(key); fs.mkdirSync(path.dirname(p), { recursive: true });
  if (move) { try { fs.renameSync(srcPath, p); mirror(p); return key; } catch { /* other disk: copy below */ } }
  const tmp = p + '.part'; fs.copyFileSync(srcPath, tmp); fs.renameSync(tmp, p); if (move) fs.rmSync(srcPath, { force: true });
  mirror(p); return key;
}
export const exists = (key) => { try { return fs.statSync(abs(key)).isFile(); } catch { return false; } };
export const sizeOf = (key) => { try { return fs.statSync(abs(key)).size; } catch { return 0; } };
export function remove(key) { let p; try { p = abs(key); fs.rmSync(p, { force: true }); } catch { /* already gone */ } if (p) forget(p); }
// ---- end driver ----

// ---- bucket copy (Cloudflare R2 or another S3-compatible store) ----
// The local disk stays the working copy (ffmpeg, PDF and image tools read files from it).
// With a bucket set, every stored file is also copied there: that is the lasting copy and backup,
// and downloads and media are handed out from the bucket with short-lived links, so big videos
// do not travel through this server. Bucket keys are paths under DATA_DIR (storage/..., uploads/..., media/..., docs/...).
let bucketCfg; const bucket = () => (bucketCfg === undefined ? (bucketCfg = bucketConfig()) : bucketCfg);
export const bucketOn = () => !!bucket();
export const resetBucket = () => { bucketCfg = undefined; };
const SKIP = /(^|\/)(tmp|logs|backups|cache)\/|\.(part|tmp)$|^db\.json|^outbox\.json$|\.DS_Store$/;
export const remoteKey = (p) => { const rel = path.relative(DATA_DIR, p).split(path.sep).join('/'); return !rel || rel.startsWith('..') || SKIP.test(rel) ? null : rel; };
const remoteIndex = () => (db.remote ||= {}); // remote key -> size copied
export const isMirrored = (p) => { const k = p && remoteKey(p); return !!(k && remoteIndex()[k] != null); };
const queue = new Map(); const inflight = new Set(); let active = 0; const stats = { uploaded: 0, failed: 0, lastError: null, lastSweep: null };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', json: 'application/json', pdf: 'application/pdf' };
export function mirror(p) {
  if (!bucket()) return; const k = remoteKey(p); if (!k) return;
  queue.set(k, p); pump();
}
function pump() {
  const max = Math.max(1, Number(process.env.BUCKET_UPLOADS_AT_ONCE) || 3);
  while (active < max && queue.size) {
    const [k, p] = queue.entries().next().value; queue.delete(k); active++; inflight.add(k);
    (async () => {
      let size; try { size = fs.statSync(p).size; } catch { return; } // gone before its turn
      for (let i = 0; ; i++) {
        try { await putObject(bucket(), k, { file: p }, { contentType: MIME[safeExt(p, '')] || 'application/octet-stream' }); remoteIndex()[k] = size; stats.uploaded++; save(); return; }
        catch (e) { if (i >= 2) { stats.failed++; stats.lastError = e.message; console.warn('[bucket] copy failed, will retry later:', k, e.message); return; } await new Promise((r) => setTimeout(r, 2000 * 3 ** i)); }
      }
    })().finally(() => { active--; inflight.delete(k); pump(); });
  }
}
export function forget(p) {
  const k = remoteKey(p); if (!k) return; queue.delete(k);
  if (!bucket() || remoteIndex()[k] == null) return;
  delete remoteIndex()[k]; save();
  deleteObject(bucket(), k).catch((e) => console.warn('[bucket] delete failed:', k, e.message));
}
// Copies anything not yet in the bucket: files written by older code paths, and copies that failed earlier.
export function sweepBucket() {
  if (!bucket()) return 0; let n = 0; const idx = remoteIndex();
  const walk = (dir) => { let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of list) { const p = path.join(dir, e.name); const k = remoteKey(e.isDirectory() ? p + '/x' : p); if (e.isDirectory()) { if (k) walk(p); continue; }
      if (!k || !e.isFile() || queue.has(k)) continue; let size; try { size = fs.statSync(p).size; } catch { continue; }
      if (idx[k] !== size) { queue.set(k, p); n++; } } };
  walk(DATA_DIR); stats.lastSweep = new Date().toISOString(); pump();
  return n;
}
export const bucketStatus = () => ({ on: bucketOn(), waiting: queue.size + active, copied: Object.keys(remoteIndex()).length, ...stats });
// A short-lived link straight to the bucket copy, or null when there is none (then the server sends the file itself).
// The link is signed for the current hour, so the same file keeps the same address for an hour and browsers can cache it.
export function bucketUrl(p, { name, mime, inline = false } = {}) {
  if (!bucket() || process.env.BUCKET_SERVE === '0' || !isMirrored(p) || queue.has(remoteKey(p)) || inflight.has(remoteKey(p))) return null;
  // Signed from the start of this hour, or from the file's last change if that is later, so a changed file gets a new address.
  let mt = 0; try { mt = Math.floor(fs.statSync(p).mtimeMs / 1000) * 1000; } catch { /* only in the bucket */ }
  const from = Math.min(Date.now(), Math.max(Math.floor(Date.now() / 3600000) * 3600000, mt));
  return presignUrl(bucket(), remoteKey(p), { date: new Date(from), expires: 7200, filename: name, inline, contentType: mime });
}
// Brings a file back from the bucket when this disk does not have it (a new server, or a restore).
export async function ensureLocal(p) {
  if (!p) return false; try { if (fs.statSync(p).isFile()) return true; } catch { /* fetch below */ }
  if (!bucket() || !isMirrored(p)) return false;
  await getObjectToFile(bucket(), remoteKey(p), p); return true;
}
export function startBucket() {
  if (!bucket()) return;
  const every = Math.max(1, Number(process.env.BUCKET_SWEEP_MINUTES) || 10) * 60000;
  setTimeout(sweepBucket, 5000).unref?.(); setInterval(sweepBucket, every).unref?.();
}

// Where a db.files row lives on disk. Rows from before the storage layer keep their old place.
export function locate(rec) {
  if (!rec) return null;
  if (rec.key) return abs(rec.key);
  if (rec.kind === 'generated') return rec.file ? path.join(MEDIA_DIR, rec.file) : null;
  return path.join(UPLOAD_DIR, rec.id);
}
export const hasBytes = (rec) => { const p = locate(rec); try { return !!p && fs.statSync(p).isFile(); } catch { return false; } };

// ---- signed, expiring download links ----
// Old fallback value kept after the rename to Scenly so links already handed out stay valid.
const secret = () => process.env.LINK_SECRET || process.env.AICREDIT_API_KEY || 'polymind-local';
const mac = (s) => crypto.createHmac('sha256', secret()).update('dl:' + s).digest('base64url').slice(0, 32);
export const DOWNLOAD_TTL = () => Math.max(60, Number(process.env.DOWNLOAD_LINK_SECONDS) || 3600);
export function signDownload(fileId, { ttl = DOWNLOAD_TTL(), variant = '' } = {}) {
  const body = Buffer.from(JSON.stringify({ f: fileId, e: Math.floor(Date.now() / 1000) + ttl, v: variant || undefined })).toString('base64url');
  return `${body}.${mac(body)}`;
}
export function readDownloadToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = mac(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const j = JSON.parse(Buffer.from(body, 'base64url').toString()); return j.e * 1000 > Date.now() ? { fileId: j.f, variant: j.v || '', expires: j.e * 1000 } : null; } catch { return null; }
}

// ---- readable download names: {project-or-prompt}_{scene-number}_{date}.ext ----
const slug = (s, n = 40) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n).replace(/-+$/, '');
export function downloadName(rec, { title, number } = {}) {
  const ext = rec.key ? safeExt(rec.key) : rec.file ? safeExt(rec.file) : safeExt(rec.name, (rec.mime || '').split('/')[1] === 'jpeg' ? 'jpg' : ((rec.mime || '').split('/')[1] || 'bin').replace('quicktime', 'mov'));
  if (rec.kind !== 'generated' && rec.name && !title) return rec.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120);
  const base = slug(title || rec.title || rec.prompt) || (rec.type === 'video' || /^video\//.test(rec.mime || '') ? 'video' : /^audio\//.test(rec.mime || '') ? 'audio' : 'image');
  const num = number ?? rec.sceneNumber ?? (rec.n != null ? Number(rec.n) + 1 : null);
  const date = String(rec.createdAt || new Date().toISOString()).slice(0, 10);
  return [base, num != null ? String(num).padStart(2, '0') : null, date].filter(Boolean).join('_') + '.' + ext;
}
export const contentDisposition = (name, inline = false) => `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

// ---- usage and limits ----
export const MB = 1024 * 1024;
export const limits = () => ({
  imageMb: Number(process.env.MAX_IMAGE_UPLOAD_MB) || 30,
  videoMb: Number(process.env.MAX_VIDEO_UPLOAD_MB) || 500,
  audioMb: Number(process.env.MAX_AUDIO_UPLOAD_MB) || 100,
  fileMb: Number(process.env.MAX_UPLOAD_MB) || 100,
  quotaMb: Number(process.env.STORAGE_QUOTA_MB) || 0, // 0 = no limit
  retentionDays: Number(process.env.RETENTION_DAYS) || 0, // 0 = keep forever
});
export function usage(userId) {
  const out = { bytes: 0, files: 0, byKind: { images: 0, videos: 0, audio: 0, other: 0 } };
  for (const f of db.files) {
    if (f.userId !== userId || f.remoteUrl) continue;
    const b = Number(f.size) || 0; out.bytes += b + (Number(f.derivedBytes) || 0); out.files++;
    const m = f.mime || '';
    out.byKind[m.startsWith('image/') ? 'images' : m.startsWith('video/') ? 'videos' : m.startsWith('audio/') ? 'audio' : 'other'] += b;
  }
  const q = limits().quotaMb * MB;
  return { ...out, quotaBytes: q, left: q ? Math.max(0, q - out.bytes) : null };
}
export function checkQuota(userId, addBytes = 0) {
  const u = usage(userId);
  if (u.quotaBytes && u.bytes + addBytes > u.quotaBytes) { const e = new Error('Your storage is full. Delete some files in Assets to make room.'); e.status = 413; e.code = 'storage_full'; e.expose = true; throw e; }
}

// ---- upload checks: the first bytes must match what the file says it is ----
const SIGS = [
  ['image/png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/gif', (b) => b.subarray(0, 4).toString('latin1') === 'GIF8'],
  ['image/webp', (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
  ['video/mp4', (b) => b.subarray(4, 8).toString('latin1') === 'ftyp'],
  ['video/webm', (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3],
  ['audio/mpeg', (b) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)],
  ['audio/wav', (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE'],
  ['audio/ogg', (b) => b.subarray(0, 4).toString('latin1') === 'OggS'],
  ['audio/flac', (b) => b.subarray(0, 4).toString('latin1') === 'fLaC'],
];
export function sniff(filePathOrBuf) {
  let b = filePathOrBuf;
  if (typeof b === 'string') { const fd = fs.openSync(b, 'r'); b = Buffer.alloc(16); try { fs.readSync(fd, b, 0, 16, 0); } finally { fs.closeSync(fd); } }
  for (const [mime, test] of SIGS) if (b.length >= 12 && test(b)) return mime;
  return null;
}
// True when a file that claims to be a picture, video or sound really starts like one.
export function looksLike(kind, filePathOrBuf) {
  const got = sniff(filePathOrBuf);
  if (!got) return false;
  if (kind === 'video') return got.startsWith('video/'); // .mov and .m4a files share the mp4 "ftyp" start
  if (kind === 'audio') return got.startsWith('audio/') || got === 'video/mp4' || got === 'video/webm';
  return got.startsWith(kind + '/');
}
