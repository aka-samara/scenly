// File uploads: images are kept for vision models / image edits, documents are
// turned into text so any chat model can read them.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import db, { save, id, now, UPLOAD_DIR } from './db.js';
import { keys, putFile, locate, limits, MB, looksLike, checkQuota, safeExt } from './storage.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth = require('mammoth');

const MAX_TEXT = 300_000; // characters kept per document
const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'sql', 'toml', 'ini', 'log', 'env', 'r', 'scala', 'vue', 'svelte']);
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac']);
const AUDIO_TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac' };
const mbText = (n) => (n >= 1024 ? `${Math.round(n / 102.4) / 10} GB` : `${n} MB`);
// Pictures, videos and sound: a size limit for each, the file must really be what its name says, and it gets its place in storage.
function keepMedia(user, rec, dest, ext) {
  const L = limits(); const max = { image: L.imageMb, video: L.videoMb, audio: L.audioMb }[rec.kind];
  const word = { image: 'picture', video: 'video', audio: 'sound file' }[rec.kind];
  try {
    if (rec.size > max * MB) throw new Error(`${rec.name}: this ${word} is ${mbText(Math.ceil(rec.size / MB))}. The limit is ${mbText(max)}.`);
    if (!rec.size) throw new Error(`${rec.name}: this file is empty.`);
    if (!looksLike(rec.kind, dest)) throw new Error(`${rec.name}: this does not look like a real ${word}. It may be damaged or have the wrong ending.`);
    checkQuota(user.id, rec.size);
  } catch (e) { fs.rmSync(dest, { force: true }); throw e; }
  rec.key = putFile(keys.upload(user.id, rec.kind, rec.id, ext || { image: 'png', video: 'mp4', audio: 'mp3' }[rec.kind]), dest, { move: true });
}

export async function ingest(user, file, { allowAudio = false } = {}) {
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  const rec = { id: id('f_'), userId: user.id, name: file.originalname, size: file.size, mime: file.mimetype, createdAt: now() };
  const dest = path.join(UPLOAD_DIR, rec.id);
  try { fs.renameSync(file.path, dest); } catch (e) { if (e.code !== 'EXDEV') throw e; fs.copyFileSync(file.path, dest); fs.rmSync(file.path, { force: true }); } // the upload folder can be on another disk
  if (IMAGE_MIME.has(file.mimetype)) {
    rec.kind = 'image';
    keepMedia(user, rec, dest, safeExt(file.originalname, file.mimetype.split('/')[1].replace('jpeg', 'jpg')));
  } else if (allowAudio && (AUDIO_EXT.has(ext) || /^audio\//.test(file.mimetype))) {
    // Checked before videos: some computers label an .m4a song video/mp4, and a .webm song has a video ending.
    rec.kind = 'audio';
    if (!/^audio\//.test(rec.mime)) rec.mime = AUDIO_TYPES[ext] || 'audio/mpeg';
    keepMedia(user, rec, dest, AUDIO_EXT.has(ext) ? ext : ['mp4', 'webm'].includes(ext) ? ext : 'mp3');
  } else if (VIDEO_MIME.has(file.mimetype) || ['mp4', 'mov', 'webm'].includes(ext)) {
    rec.kind = 'video';
    if (!rec.mime.startsWith('video/')) rec.mime = ext === 'mov' ? 'video/quicktime' : 'video/' + ext;
    keepMedia(user, rec, dest, ['mp4', 'mov', 'webm'].includes(ext) ? ext : 'mp4');
  } else {
    rec.kind = 'document';
    let text = '';
    try {
      if (file.size > limits().fileMb * MB) throw new Error(`this file is ${mbText(Math.ceil(file.size / MB))}. The limit is ${mbText(limits().fileMb)}`);
      if (ext === 'pdf' || file.mimetype === 'application/pdf') {
        const r = await pdfParse(fs.readFileSync(dest));
        text = r.text;
        rec.pages = r.numpages;
        // A scan has pictures of pages and no text: the pages are read (OCR) so the chat can answer questions about them.
        if (text.replace(/\s+/g, '').length < 25 * Math.min(r.numpages || 1, 5) && file.size < 60 * 1024 * 1024) {
          try {
            const { ocr } = await import('./docs/pdf/tools.js');
            const o = await ocr(fs.readFileSync(dest), { searchable: false, maxPages: 15 });
            if (o.text.trim()) { text = `[This PDF is a scan. Its text was read from the page images${o.total > o.pages ? ` (first ${o.pages} of ${o.total} pages)` : ''} and may contain misread words.]\n\n${o.text}`; rec.ocr = true; }
          } catch { /* the file is kept without text */ }
        }
      } else if (ext === 'xlsx' || ext === 'xlsm') {
        // Spreadsheets open in Docs Studio; ordinary chats get a short text preview of each sheet.
        rec.sheetFile = true;
        text = file.size > 12 * 1024 * 1024 ? `[${file.originalname} is a large Excel workbook. Open it as a Spreadsheet in Docs Studio to analyse it.]` : await workbookText(dest);
      } else if (ext === 'pptx') {
        // Decks open in Docs Studio; ordinary chats get the text of every slide.
        const { pptxText } = await import('./docs/slides/import.js');
        const r = await pptxText(dest); text = r.text; rec.pages = r.slides;
      } else if (ext === 'docx') {
        text = (await mammoth.extractRawText({ path: dest })).value;
      } else if (TEXT_EXT.has(ext) || /^text\//.test(file.mimetype) || file.mimetype === 'application/json') {
        // Only the part that is kept is read, so very large CSV files stay cheap.
        const fd = fs.openSync(dest, 'r'); const buf = Buffer.alloc(Math.min(file.size, MAX_TEXT * 2 + 16));
        try { fs.readSync(fd, buf, 0, buf.length, 0); } finally { fs.closeSync(fd); }
        text = buf.toString('utf8'); if (file.size > buf.length) text = text.slice(0, MAX_TEXT + 1);
      } else {
        throw new Error('unsupported');
      }
    } catch (e) {
      fs.rmSync(dest, { force: true });
      throw new Error(e.message === 'unsupported'
        ? `${file.originalname}: this file type is not supported yet. Try PDF, DOCX, XLSX, PPTX, text, code, CSV or images.`
        : `${file.originalname}: could not read this file (${e.message}).`);
    }
    rec.truncated = text.length > MAX_TEXT;
    rec.text = text.slice(0, MAX_TEXT);
    rec.chars = rec.text.length;
  }
  db.files.push(rec);
  save();
  const { text, key, ...meta } = rec;
  return meta;
}

async function workbookText(file) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out = [];
  const val = (v) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? String(v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join('') : v.error ?? '')) : String(v));
  for (const ws of wb.worksheets.slice(0, 8)) {
    out.push(`## Sheet "${ws.name}" (${ws.rowCount} rows)`);
    for (let r = 1; r <= Math.min(ws.rowCount, 60); r++) { const cells = []; ws.getRow(r).eachCell({ includeEmpty: true }, (c, i) => { if (i <= 30) cells[i - 1] = val(c.value).replace(/[\n|]/g, ' ').slice(0, 60); }); out.push(cells.join(' | ')); }
    if (ws.rowCount > 60) out.push(`… ${ws.rowCount - 60} more rows`);
    if (out.join('\n').length > 30000) break;
  }
  return out.join('\n').slice(0, 32000);
}

export function getFiles(user, ids = []) {
  return ids.map((fid) => db.files.find((f) => f.id === fid && f.userId === user.id)).filter(Boolean);
}

export function filePath(f) {
  return locate(f);
}

export function dataUrl(f) {
  return `data:${f.mime === 'image/jpg' ? 'image/jpeg' : f.mime};base64,${fs.readFileSync(filePath(f)).toString('base64')}`;
}

export const fileMeta = (f) => ({ id: f.id, name: f.name, kind: f.kind, mime: f.mime, size: f.size, pages: f.pages, truncated: f.truncated });

// Keeps an image that came from inside another file (for example a picture in a Word document).
export function storeImage(user, name, mime, buf) {
  const rec = { id: id('f_'), userId: user.id, name, size: buf.length, mime, kind: 'image', derived: true, createdAt: now() };
  fs.writeFileSync(path.join(UPLOAD_DIR, rec.id), buf);
  db.files.push(rec); save();
  return rec;
}
