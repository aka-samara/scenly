// A stand-in for the gateway's image and video endpoints, for tests that must not spend money.
// It applies the same size rule as the real gateway and writes every request to a log file.
// Usage: node devtools/mockgw.mjs [port] [log file]
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const videoTasks = new Map();
const port = Number(process.argv[2]) || 3190;
const logFile = process.argv[3] || '/tmp/p/mockgw.jsonl';
const models = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/models-snapshot.json'));
const SIZES = ['1024x1024', '1024x1536'];
const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
// A picture with a coloured disc in the middle. `white` gives it a plain white background (for the cut-out step).
function png(w, h, white) {
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (Math.min(w, h) * 0.3) ** 2;
      const c = inside ? [230, 70, 90] : white ? [255, 255, 255] : [40 + ((x * 3) % 90), 90 + ((y * 2) % 120), 160 - ((x + y) % 80)];
      row[1 + x * 3] = c[0]; row[2 + x * 3] = c[1]; row[3 + x * 3] = c[2];
    }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const log = (o) => fs.appendFileSync(logFile, JSON.stringify(o) + '\n');
const field = (raw, name) => raw.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1];
http.createServer((req, res) => {
  const bufs = [];
  req.on('data', (d) => bufs.push(d)).on('end', () => {
    const body = Buffer.concat(bufs); const url = req.url.replace(/^\/api\/v1/, '');
    if (url.startsWith('/models')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(models); }
    if (url === '/mock.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); return res.end(Buffer.from('00000018667479706d703432', 'hex')); }
    if (url.startsWith('/images/')) {
      let model, size, images, n = 1, prompt;
      if (/multipart/.test(req.headers['content-type'] || '')) { const raw = body.toString('latin1'); model = field(raw, 'model'); size = field(raw, 'size'); prompt = field(raw, 'prompt'); n = Number(field(raw, 'n')) || 1; images = (raw.match(/name="image"; filename=/g) || []).length; }
      else { const j = JSON.parse(body.toString() || '{}'); ({ model, size, prompt } = j); n = j.n || 1; images = [].concat(j.image || []).length; }
      log({ at: url, model, size: size || null, images, n, prompt });
      if (size && !SIZES.includes(size)) return json(res, 400, { error: { message: `size "${size}" is not supported for model "${model}". Allowed: ${SIZES.join(', ')}`, code: 'invalid_size' } });
      const [w, h] = (size || '1024x1024').split('x').map(Number);
      return setTimeout(() => json(res, 200, { data: Array.from({ length: n }, () => ({ b64_json: png(w / 4, h / 4, /pure white/i.test(prompt || '')).toString('base64') })), usage: { charge_amount: 0.03 * n } }), Number(process.env.MOCK_DELAY) || 0);
    }
    if (url === '/chat/completions') {
      const j = JSON.parse(body.toString() || '{}');
      const last = j.messages?.[j.messages.length - 1]?.content;
      const images = Array.isArray(last) ? last.filter((p) => p.type === 'image_url').length : 0;
      log({ at: url, model: j.model, images, text: Array.isArray(last) ? last.find((p) => p.type === 'text')?.text : last });
      const txt = String(Array.isArray(last) ? last.find((p) => p.type === 'text')?.text : last || '');
      const usage = { prompt_tokens: 200, completion_tokens: 40, charge_amount: 0.0004 };
      const say = (c) => json(res, 200, { choices: [{ message: { role: 'assistant', content: c } }], usage });
      if (Array.isArray(last) && last.some((p) => p.type === 'input_audio')) { const b = Buffer.from(last.find((p) => p.type === 'input_audio').input_audio.data, 'base64'); return say(`Spoken part of ${((b.length - 44) / 32000).toFixed(1)} seconds.`); }
      if (/BADJSON/.test(txt)) return say('Sorry, here is your plan: scene one is nice');
      if (/DOWN503/.test(txt)) return json(res, 503, { error: { message: 'mock: writer is down' } });
      // Video (new): "change the plan in words" gets the plan back with one scene added and scene 1 rewritten.
      if (/You edit the plan of a short video/.test(txt)) { const cur = JSON.parse(txt.slice(txt.indexOf('{'), txt.indexOf('\n\nThe person asks'))); const sc = cur.scenes.map((x, i) => ({ from: x.n, visual: i === 0 ? 'A close up of the jar with steam behind, revised.' : x.visual, narration: x.narration, seconds: x.seconds })); sc.push({ from: null, visual: 'A new closing scene by the window.', narration: 'Try it today.', seconds: 4 }); return say(JSON.stringify({ title: cur.title + ' (revised)', scenes: sc })); }
      if (/"scenes":\[\{"n":1/.test(txt)) { const ns = [...txt.matchAll(/^(\d+)\. \(/gm)].map((m) => Number(m[1])); return say('```json\n' + JSON.stringify({ scenes: ns.map((n) => ({ n, visual: `Picture for scene ${n}: a quiet street at dawn, slow camera move` })) }) + '\n```'); }
      if (/Write a storyboard/.test(txt)) { const n = Number((txt.match(/in about (\d+) scenes/) || [])[1]) || 4; const voice = !/Narration: none/.test(txt); return say(JSON.stringify({ title: 'Mock storyboard', look: 'warm film look', ...(images ? { seen: `I looked at ${images} pictures.` } : {}), scenes: Array.from({ length: n }, (_, i) => ({ seconds: 5 + (i % 3), visual: `Shot ${i + 1}: a barista pours coffee, close up, slow push in`, narration: voice ? `Line ${i + 1} of the story.` : '' })) })); }
      const content = images ? '- Change: make the sky pink\n- Keep: the red disc, its size and position\n- Lighting: soft sunset glow' : '- Subject: a red fox in fresh snow\n- Setting: pine forest at dawn\n- Lighting: soft golden backlight\n- Style: sharp wildlife photo';
      return json(res, 200, { choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 200, completion_tokens: 40, charge_amount: 0.0004 } });
    }
    if (url === '/videos/generations' && req.method === 'POST') {
      const j = JSON.parse(body.toString() || '{}'); const tid = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      log({ at: url, task: tid, model: j.model, duration: j.duration, ratio: j.ratio, resolution: j.resolution, images: (j.image_urls || []).length, videos: (j.video_urls || []).length, prompt: j.prompt });
      if (/STARTFAIL/.test(j.prompt || '')) return json(res, 500, { error: { message: 'mock: provider is down' } });
      videoTasks.set(tid, { body: j, polls: 0 }); return json(res, 200, { task_id: tid });
    }
    if (url.startsWith('/videos/generations/')) {
      const tid = decodeURIComponent(url.split('/').pop()); const t = videoTasks.get(tid) || { body: { duration: 5, ratio: '16:9' }, polls: 99 };
      t.polls++; log({ at: '/videos/generations/:id', task: tid, poll: t.polls });
      if (/FAILME/.test(t.body.prompt || '')) return json(res, 200, { status: 'failed', error: { message: 'mock: content could not be generated' } });
      if (t.polls <= (Number(process.env.MOCK_VIDEO_POLLS) || 0)) return json(res, 200, { status: t.polls === 1 ? 'pending' : 'processing' });
      const d = Math.max(1, Number(t.body.duration) > 0 ? Number(t.body.duration) : 5); const tall = t.body.ratio === '9:16';
      return json(res, 200, { status: 'succeeded', content: { video_url: `http://localhost:${port}/mockvideo/${d}-${tall ? 'tall' : 'wide'}.mp4` }, usage: { charge_amount: t.body.resolution ? Math.round(d * 0.05 * 100) / 100 : 0.5 } });
    }
    if (url.startsWith('/mockvideo/')) {
      const m = url.match(/\/mockvideo\/(\d+)-(tall|wide)\.mp4/); if (!m) return json(res, 404, {});
      const file = path.join(os.tmpdir(), `mockvideo-${m[1]}-${m[2]}.mp4`);
      if (!fs.existsSync(file)) { try { execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${m[2] === 'tall' ? '360x640' : '640x360'}:rate=24:duration=${m[1]}`, '-f', 'lavfi', '-i', `sine=frequency=${300 + Number(m[1]) * 20}:duration=${m[1]}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file + '.tmp.mp4']); fs.renameSync(file + '.tmp.mp4', file); } catch { res.writeHead(200, { 'Content-Type': 'video/mp4' }); return res.end(Buffer.from('00000018667479706d703432', 'hex')); } }
      res.writeHead(200, { 'Content-Type': 'video/mp4' }); return res.end(fs.readFileSync(file));
    }
    json(res, 404, { error: { message: 'not mocked' } });
  });
}).listen(port, () => console.log('mock gateway on ' + port));
