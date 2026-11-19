// Object storage (Cloudflare R2, or any S3-compatible bucket) without an SDK.
// Requests are signed with AWS Signature Version 4, which R2 accepts.
//
// Settings (.env):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
//   or, for another S3-compatible store: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET
// With none of these set the app keeps files on its own disk only, exactly as before.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export function bucketConfig(env = process.env) {
  const account = env.R2_ACCOUNT_ID;
  const endpoint = (env.S3_ENDPOINT || (account ? `https://${account}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');
  const accessKey = env.R2_ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET || env.S3_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, accessKey, secretKey, bucket, region: env.S3_REGION || 'auto', prefix: String(env.BUCKET_PREFIX || '').replace(/^\/+|\/+$/g, '') };
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
// RFC 3986 encoding, as S3 wants it.
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = (p) => p.split('/').map(enc).join('/');
const amzDate = (d) => d.toISOString().replace(/[:-]|\.\d{3}/g, '');

function signingKey(secret, date, region) {
  return hmac(hmac(hmac(hmac('AWS4' + secret, date), region), 's3'), 'aws4_request');
}

function objectPath(cfg, key) {
  const full = cfg.prefix ? `${cfg.prefix}/${key}` : key;
  return `/${enc(cfg.bucket)}/${encPath(full)}`;
}

// Signs a request (headers style). Returns the headers to send.
export function signRequest(cfg, { method, pathname, query = {}, headers = {}, payloadHash = 'UNSIGNED-PAYLOAD', date = new Date() }) {
  const url = new URL(cfg.endpoint);
  const t = amzDate(date); const day = t.slice(0, 8);
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': t };
  const names = Object.keys(all).sort();
  const canonQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');
  const canon = [method, pathname, canonQuery, names.map((n) => `${n}:${all[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${cfg.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', t, scope, sha256(canon)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(cfg.secretKey, day, cfg.region)).update(toSign).digest('hex');
  all.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
  delete all.host;
  return { headers: all, query: canonQuery };
}

// A link to one object that works without signing in, for `expires` seconds from `date`.
export function presignUrl(cfg, key, { expires = 3600, date = new Date(), method = 'GET', filename, inline = false, contentType } = {}) {
  const url = new URL(cfg.endpoint);
  const pathname = objectPath(cfg, key);
  const t = amzDate(date); const day = t.slice(0, 8); const scope = `${day}/${cfg.region}/s3/aws4_request`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${cfg.accessKey}/${scope}`, 'X-Amz-Date': t,
    'X-Amz-Expires': String(Math.min(604800, Math.max(1, Math.round(expires)))), 'X-Amz-SignedHeaders': 'host',
  };
  if (filename) q['response-content-disposition'] = `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  if (contentType) q['response-content-type'] = contentType;
  const canonQuery = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const canon = [method, pathname, canonQuery, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', t, scope, sha256(canon)].join('\n');
  const sig = crypto.createHmac('sha256', signingKey(cfg.secretKey, day, cfg.region)).update(toSign).digest('hex');
  return `${url.origin}${pathname}?${canonQuery}&X-Amz-Signature=${sig}`;
}

// One HTTP request to the bucket. body: Buffer, string, or { file: path }.
function send(cfg, method, key, { body, headers = {}, query = {}, toFile } = {}) {
  const pathname = key == null ? `/${enc(cfg.bucket)}` : objectPath(cfg, key);
  let size = 0; if (Buffer.isBuffer(body) || typeof body === 'string') size = Buffer.byteLength(body); else if (body?.file) size = fs.statSync(body.file).size;
  const extra = { ...headers }; if (body != null) extra['content-length'] = size;
  const signed = signRequest(cfg, { method, pathname, query, headers: extra });
  const url = new URL(cfg.endpoint);
  const lib = url.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request({ method, host: url.hostname, port: url.port || undefined, path: pathname + (signed.query ? '?' + signed.query : ''), headers: signed.headers, timeout: 120000 }, (res) => {
      if (toFile && res.statusCode === 200) {
        const tmp = toFile + '.part'; fs.mkdirSync(path.dirname(toFile), { recursive: true });
        pipeline(res, fs.createWriteStream(tmp)).then(() => { fs.renameSync(tmp, toFile); resolve({ status: 200, headers: res.headers }); }, (e) => { fs.rmSync(tmp, { force: true }); reject(e); });
        return;
      }
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('Bucket request timed out')));
    req.on('error', reject);
    if (body?.file) fs.createReadStream(body.file).on('error', reject).pipe(req);
    else req.end(body ?? undefined);
  });
}

const fail = (what, r) => Object.assign(new Error(`Bucket ${what} failed: HTTP ${r.status} ${String(r.body || '').replace(/\s+/g, ' ').slice(0, 300)}`), { status: r.status });

export async function putObject(cfg, key, body, { contentType = 'application/octet-stream' } = {}) {
  const r = await send(cfg, 'PUT', key, { body, headers: { 'content-type': contentType } });
  if (r.status !== 200) throw fail('upload', r);
  return true;
}
export async function getObjectToFile(cfg, key, file) {
  const r = await send(cfg, 'GET', key, { toFile: file });
  if (r.status !== 200) throw fail('download', r);
  return file;
}
export async function getObject(cfg, key) {
  const r = await send(cfg, 'GET', key);
  if (r.status === 404) return null;
  if (r.status !== 200) throw fail('download', r);
  return r.body;
}
export async function headObject(cfg, key) {
  const r = await send(cfg, 'HEAD', key);
  if (r.status === 404) return null;
  if (r.status !== 200) throw fail('check', r);
  return { size: Number(r.headers['content-length']) || 0 };
}
export async function deleteObject(cfg, key) {
  const r = await send(cfg, 'DELETE', key);
  if (r.status !== 204 && r.status !== 200 && r.status !== 404) throw fail('delete', r);
  return true;
}
// Lists keys under a prefix (ListObjectsV2), page by page.
export async function* listObjects(cfg, prefix = '') {
  const full = cfg.prefix ? `${cfg.prefix}/${prefix}` : prefix; let token = '';
  for (;;) {
    const query = { 'list-type': '2', prefix: full, ...(token ? { 'continuation-token': token } : {}) };
    const r = await send(cfg, 'GET', null, { query });
    if (r.status !== 200) throw fail('list', r);
    const xml = r.body.toString('utf8');
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = decodeXml(/<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1] || '');
      yield { key: cfg.prefix ? key.slice(cfg.prefix.length + 1) : key, size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] || 0), modified: /<LastModified>(.*?)<\/LastModified>/.exec(m[1])?.[1] };
    }
    if (!/<IsTruncated>true<\/IsTruncated>/.test(xml)) return;
    token = decodeXml(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] || ''); if (!token) return;
  }
}
const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
