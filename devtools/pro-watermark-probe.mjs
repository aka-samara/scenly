// Probe: which request settings, if any, make Seedream return a picture without its "AI generated" corner stamp.
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const B = process.env.AICREDIT_BASE_URL, H = { Authorization: 'Bearer ' + process.env.AICREDIT_API_KEY, 'Content-Type': 'application/json' }; const out = process.argv[2];
const base = { model: 'seedream-5.0-pro', prompt: 'A plain light grey studio wall with a single green plant in a white pot on the left, soft daylight, empty space on the right', size: '1024x1024', n: 1, response_format: 'url' };
const tries = { a_watermark_false: { watermark: false }, b_extra_body: { extra_body: { watermark: false } }, c_add_watermark: { add_watermark: false, logo_info: { add_logo: false } } };
await Promise.all(Object.entries(tries).map(async ([name, extra]) => {
  try { const r = await fetch(B + '/images/generations', { method: 'POST', headers: H, body: JSON.stringify({ ...base, ...extra }), signal: AbortSignal.timeout(150000) }); const j = await r.json(); const u = j.data?.[0]?.url; if (!u) return console.log(name, r.status, JSON.stringify(j).slice(0, 160));
    const f = `${out}/wm-${name}.png`; fs.writeFileSync(f, Buffer.from(await (await fetch(u)).arrayBuffer())); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-vf', 'crop=300:120:iw-300:ih-120', `${out}/wm-${name}-corner.png`]); console.log(name, 'ok'); } catch (e) { console.log(name, 'ERR', e.message); }
}));
