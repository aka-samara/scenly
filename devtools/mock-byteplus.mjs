// A stand-in for the two BytePlus services Scenly calls directly (OmniHuman 2.0 and Seed TTS 3.0), for tests.
// Usage: node devtools/mock-byteplus.mjs [port] [log.jsonl]
// Then start Scenly with BYTEPLUS_VISION_BASE_URL=http://localhost:<port> BYTEPLUS_SPEECH_BASE_URL=http://localhost:<port>
// Speech: real MP3 audio (a tone, ~15 characters per second) in the official JSONL event stream. A script containing
// "FAILVOICE" gets an error event. OmniHuman: tasks stay in_queue, then generating, then done with a small MP4.
// A prompt containing "FAILVIDEO" ends with the content-filter error (50510).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PORT = Number(process.argv[2]) || 3291;
const LOG = process.argv[3] || '/tmp/mock-byteplus.jsonl';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mbp-'));
const ff = (a) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
ff(['-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', tmp + '/out.mp4']);
const log = (x) => fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...x }) + '\n');
const tasks = new Map(); let n = 0;
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { let j = {}; try { j = JSON.parse(b || '{}'); } catch { /* not json */ } ok({ raw: b, json: j }); }); });
const hex = (x) => Buffer.from(x).toString('hex');
const sha = (s) => hex(crypto.createHash('sha256').update(s).digest());
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
// Rebuild the BytePlus signature from the request and compare it with the one sent.
function checkSignature(req, url, raw) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^HMAC-SHA256 Credential=([^/]+)\/(\S+?), SignedHeaders=(\S+?), Signature=([0-9a-f]+)$/);
  if (!m || m[1] !== 'test-ak') return false;
  const [, , scope, names, sig] = m;
  const t = req.headers['x-date'] || '';
  const lines = names.split(';').map((n) => `${n}:${req.headers[n]}`);
  const canon = ['POST', '/', url.search.slice(1), ...lines, '', names, sha(raw)].join('\n');
  const [day, region, service] = scope.split('/');
  const key = hmac(hmac(hmac(hmac('test-sk', day), region), service), 'request');
  return hex(hmac(key, ['HMAC-SHA256', t, scope, sha(canon)].join('\n'))) === sig;
}
const json = (res, code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/video.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); return fs.createReadStream(tmp + '/out.mp4').pipe(res); }
  const { raw, json: b } = await body(req);
  // ---- Seed TTS 3.0
  const tts = url.pathname.match(/^\/api\/v3\/text-to-speech\/([^/]+)\/streaming$/);
  if (tts) {
    log({ kind: 'tts', voice: decodeURIComponent(tts[1]), key: req.headers['x-api-key'], body: b });
    if (req.headers['x-api-key'] !== 'test-speech-key') { res.writeHead(401, { 'Content-Type': 'text/plain' }); return res.end(JSON.stringify({ event: 'error', error: { code: 'unauthorized', message: 'bad key' } }) + '\n'); }
    if (/FAILVOICE/.test(b.text || '')) { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(JSON.stringify({ event: 'error', error: { code: 'internal', message: 'synthesis failed' } }) + '\n'); }
    const secs = Math.max(0.6, String(b.text || '').length / 15 / (b.voice_settings?.speed || 1));
    const f = `${tmp}/tts-${++n}.mp3`; ff(['-f', 'lavfi', '-i', `sine=frequency=220:duration=${secs.toFixed(2)}`, '-c:a', 'libmp3lame', '-b:a', '64k', f]);
    const audio = fs.readFileSync(f); const half = Math.floor(audio.length / 2);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.write(JSON.stringify({ event: 'ready', session_id: 's' + n }) + '\n');
    res.write(JSON.stringify({ event: 'audio', audio: audio.subarray(0, half).toString('base64') }) + '\n');
    res.write(JSON.stringify({ event: 'audio', audio: audio.subarray(half).toString('base64') }) + '\n');
    return res.end(JSON.stringify({ event: 'final', reason: 'TTS_STREAM_FINAL_REASON_CLOSED', is_final: true }) + '\n');
  }
  // ---- OmniHuman 2.0 (Vision AI). Two routes: Bearer API key on /api/common/v3/..., or the signed Access Key
  // route on /?Action=CVSync2AsyncSubmitTask. The signed route is checked by rebuilding the signature with test-sk.
  const action = url.searchParams.get('Action');
  let path = url.pathname, signedOk = false;
  if (url.pathname === '/' && action) {
    path = action === 'CVSync2AsyncSubmitTask' ? '/api/common/v3/submit_task_v2' : '/api/common/v3/get_result_v2';
    signedOk = checkSignature(req, url, raw);
  }
  if (path.startsWith('/api/common/v3/')) {
    log({ kind: 'vision', path, action, auth: req.headers.authorization, body: b });
    if (action ? !signedOk : req.headers.authorization !== 'Bearer test-vision-key') return json(res, 200, { code: 50400, data: null, message: 'Access Denied: Access Denied', status: 50400 });
    if (b.req_key !== 'realman_avatar_picture_omni20_cv') return json(res, 200, { code: 50215, data: null, message: 'Input invalid for this service.' });
    if (path.endsWith('/submit_task_v2')) {
      if (!b.audio_url || !Array.isArray(b.image_urls) || !b.image_urls[0]) return json(res, 200, { code: 50215, data: null, message: 'Input invalid for this service.' });
      const id = String(7000000000000000000n + BigInt(++n));
      tasks.set(id, { polls: 0, fail: /FAILVIDEO/.test(b.prompt || '') });
      return json(res, 200, { code: 10000, data: { task_id: id }, message: 'Success', status: 10000 });
    }
    if (path.endsWith('/get_result_v2')) {
      const t = tasks.get(String(b.task_id));
      if (!t) return json(res, 200, { code: 10000, data: { status: 'not_found' }, message: 'Success' });
      t.polls++;
      if (t.polls < 2) return json(res, 200, { code: 10000, data: { status: 'in_queue' }, message: 'Success' });
      if (t.polls < 3) return json(res, 200, { code: 10000, data: { status: 'generating' }, message: 'Success' });
      if (t.fail) return json(res, 200, { code: 50510, data: null, message: 'Algovproxy Risk Error' });
      return json(res, 200, { code: 10000, data: { status: 'done', video_url: `http://localhost:${PORT}/video.mp4` }, message: 'Success' });
    }
  }
  json(res, 404, { error: 'not here' });
}).listen(PORT, () => console.log('mock byteplus on', PORT));
