// Probe: does a smaller reference picture get an image edit through the gateway's 60 second limit?
import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const B = process.env.AICREDIT_BASE_URL, H = { Authorization: 'Bearer ' + process.env.AICREDIT_API_KEY, 'Content-Type': 'application/json' };
const db = JSON.parse(fs.readFileSync('data/db.json', 'utf8')); const ch = db.characters.find((c) => c.name === 'Mia');
const im = await loadImage(fs.readFileSync('data/uploads/' + ch.fileIds[0])); const k = Math.min(1, 1024 / Math.max(im.width, im.height));
const cv = createCanvas(Math.round(im.width * k), Math.round(im.height * k)); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
const jpg = cv.toBuffer('image/jpeg', 88); console.log('ref', cv.width + 'x' + cv.height, jpg.length, 'bytes');
const t = Date.now();
const r = await fetch(B + '/images/edits', { method: 'POST', headers: H, signal: AbortSignal.timeout(170000), body: JSON.stringify({ model: 'seedream-5.0-pro', prompt: 'The reference image shows the person Mia. Keep this exact person: the same face and facial features, skin tone and hair. Mia drinks coffee on a sunny balcony in a white linen shirt, handheld phone photo, golden morning light.', size: '1024x1536', response_format: 'url', n: 1, image: [`data:image/jpeg;base64,${jpg.toString('base64')}`] }) });
const body = await r.text(); console.log('edits', r.status, Math.round((Date.now() - t) / 1000) + 's', body.slice(0, 200).replace(/\s+/g, ' '));
try { fs.writeFileSync(process.argv[2], JSON.parse(body).data[0].url); } catch { /* no picture */ }
