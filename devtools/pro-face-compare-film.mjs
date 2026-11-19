// Comparison picture for a Face lock film: the character's photo beside frames from each shot of the exported film.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const [out, tmp, title] = process.argv.slice(2);
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8'));
const find = (rec) => { const p = rec.key ? path.join('data', rec.key) : path.join('data/uploads', rec.id); return fs.existsSync(p) ? p : execFileSync('find', ['data', '-name', path.basename(rec.key || rec.id) + '*']).toString().split('\n')[0]; };
const p = db.vprojects.filter((x) => x.title.includes(title)).pop(); const ch = db.characters.find((c) => c.name === 'Mia');
const vid = find(db.files.find((f) => f.id === p.exports[0].fileId)); fs.copyFileSync(vid, path.join(path.dirname(out), 'face-lock-film.mp4'));
const cells = [['Saved character photo', find(db.files.find((f) => f.id === ch.fileIds[0]))]];
for (const [i, [label, t]] of [['Shot 1: start', 0.1], ['Shot 1: end', 3.6], ['Shot 2: start', 4.3], ['Shot 2: end', 7.7]].entries()) { const f = path.join(tmp, `film-${i}.jpg`); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', vid, '-frames:v', '1', f]); cells.push([label, f]); }
const W = 420, H = 630, pad = 16, top = 46; const cv = createCanvas(pad + cells.length * (W + pad), top + H + pad); const g = cv.getContext('2d');
g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, cv.width, cv.height); g.font = '600 20px sans-serif'; g.fillStyle = '#f3f3f5';
for (const [i, [label, file]] of cells.entries()) { const im = await loadImage(fs.readFileSync(file)); const x = pad + i * (W + pad); const k = Math.max(W / im.width, H / im.height); const sw = W / k, sh = H / k; g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, top, W, H); g.fillText(label, x, 30); }
fs.writeFileSync(out, cv.toBuffer('image/jpeg', 90)); console.log('written');
