// Builds one comparison picture for a Face lock test: the character's photo, the locked opening frame, and frames from the clip.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const [out, tmp] = process.argv.slice(2);
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8')); const u = db.users.find((x) => x.email === 'studio-pro-test@polymind.test');
const find = (rec) => { const p = rec.key ? path.join('data', rec.key) : path.join('data/uploads', rec.id); if (fs.existsSync(p)) return p; const hit = execFileSync('find', ['data', '-name', path.basename(rec.key || rec.id) + '*']).toString().split('\n')[0]; return hit; };
const ch = db.characters.find((c) => c.userId === u.id && c.name === 'Mia');
const gens = db.generations.filter((g) => g.userId === u.id && g.characterId === ch.id);
const frame = gens.filter((g) => g.mode === 'image' && /balcony/i.test(g.prompt)).pop(); const clip = db.generations.filter((g) => g.userId === u.id && g.mode === 'video' && g.status === 'done' && g.createdAt > frame.createdAt).shift();
const vid = find(db.files.find((f) => f.id === clip.media[0].id));
const shots = [];
for (const [i, t] of [[0, 0.1], [1, 2.5], [2, 4.6]]) { const f = path.join(tmp, `cmp-${i}.jpg`); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-i', vid, '-frames:v', '1', f]); shots.push([`${t < 1 ? 'Face lock video: start (the locked frame)' : 'Video at ' + t + ' s'}`, f]); }
const cells = [['Saved character photo', find(db.files.find((f) => f.id === ch.fileIds[0]))], ...shots];
const W = 420, H = 630, pad = 16, top = 46; const cv = createCanvas(pad + cells.length * (W + pad), top + H + pad); const g = cv.getContext('2d');
g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, cv.width, cv.height); g.font = '600 20px sans-serif'; g.fillStyle = '#f3f3f5';
for (const [i, [label, file]] of cells.entries()) { const im = await loadImage(fs.readFileSync(file)); const x = pad + i * (W + pad); const k = Math.max(W / im.width, H / im.height); const sw = W / k, sh = H / k; g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, top, W, H); g.fillText(label, x, 30); }
fs.writeFileSync(out, cv.toBuffer('image/jpeg', 90)); console.log('written', out, clip.model, clip.params);
