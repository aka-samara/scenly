// Work on existing PDF files: merge, split, rotate, watermark, compress, forms, signatures, OCR,
// page images and text extraction. pdf-lib edits files, pdf.js reads and draws them, tesseract.js reads scans.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument, StandardFonts, rgb, degrees, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList, PDFName } from 'pdf-lib';

const require = createRequire(import.meta.url);
const MM = 72 / 25.4;
export class PdfError extends Error { constructor(m) { super(m); this.user = true; } }

async function load(buf, { forRead = false } = {}) {
  try { return await PDFDocument.load(buf, { ignoreEncryption: forRead, updateMetadata: false }); }
  catch (e) { throw new PdfError(/encrypt/i.test(e.message) ? 'This PDF is password-protected. Remove the password first, then try again.' : 'This file could not be read as a PDF.'); }
}
const save = async (doc) => Buffer.from(await doc.save({ useObjectStreams: true }));

// "1-3, 5, 8-" → zero-based page indexes, in the order given.
export function parseRanges(text, count) {
  const out = []; const s = String(text || '').trim().toLowerCase();
  if (!s || s === 'all') return Array.from({ length: count }, (_x, i) => i);
  for (const part of s.split(/[,;\s]+/).filter(Boolean)) {
    if (part === 'odd' || part === 'even') { for (let i = part === 'odd' ? 0 : 1; i < count; i += 2) out.push(i); continue; }
    const m = /^(\d+|last)?\s*(-|to)?\s*(\d+|last|end)?$/.exec(part); if (!m || (!m[1] && !m[3])) throw new PdfError(`"${part}" is not a page range. Write pages like 1-3, 5, 8-.`);
    const num = (v, d) => (v == null ? d : /last|end/.test(v) ? count : Number(v));
    const a = num(m[1], 1), b = m[2] ? num(m[3], count) : a;
    if (a < 1 || b < 1 || a > count || b > count) throw new PdfError(`The file has ${count} page${count > 1 ? 's' : ''}, so "${part}" does not fit.`);
    if (a <= b) for (let i = a; i <= b; i++) out.push(i - 1); else for (let i = a; i >= b; i--) out.push(i - 1);
  }
  return out;
}

export async function info(buf) {
  const doc = await load(buf, { forRead: true });
  const pages = doc.getPages().map((p) => { const { width, height } = p.getSize(); return { w: Math.round(width / MM), h: Math.round(height / MM), rotation: p.getRotation().angle }; });
  let fields = []; try { fields = formFields(doc); } catch { /* no form */ }
  return { pages: pages.length, sizes: pages.slice(0, 200), fields, title: doc.getTitle() || '', encrypted: doc.isEncrypted };
}

export async function merge(bufs) {
  const out = await PDFDocument.create();
  for (const b of bufs) { const src = await load(b); for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p); }
  return save(out);
}
// Returns one PDF with the chosen pages, or one PDF per range/page when `each` is set.
export async function split(buf, { ranges = '', each = false, every = 0 } = {}) {
  const src = await load(buf); const n = src.getPageCount();
  const make = async (idx) => { const out = await PDFDocument.create(); for (const p of await out.copyPages(src, idx)) out.addPage(p); return save(out); };
  if (every > 0) { const parts = []; for (let i = 0; i < n; i += every) parts.push({ name: `pages ${i + 1}-${Math.min(n, i + every)}`, buffer: await make(Array.from({ length: Math.min(every, n - i) }, (_x, k) => i + k)) }); return parts; }
  if (each) {
    const groups = String(ranges || '').trim() ? String(ranges).split(/[,;]+/).map((r) => r.trim()).filter(Boolean) : Array.from({ length: n }, (_x, i) => String(i + 1));
    const parts = []; for (const g of groups) parts.push({ name: /^\d+$/.test(g) ? `page ${g}` : `pages ${g}`, buffer: await make(parseRanges(g, n)) });
    return parts;
  }
  return [{ name: 'extract', buffer: await make(parseRanges(ranges, n)) }];
}
export async function removePages(buf, ranges) { const src = await load(buf); const n = src.getPageCount(); const drop = new Set(parseRanges(ranges, n)); if (drop.size >= n) throw new PdfError('That would remove every page.'); const out = await PDFDocument.create(); for (const p of await out.copyPages(src, src.getPageIndices().filter((i) => !drop.has(i)))) out.addPage(p); return save(out); }
export async function reorder(buf, order) { const src = await load(buf); const out = await PDFDocument.create(); for (const p of await out.copyPages(src, parseRanges(order, src.getPageCount()))) out.addPage(p); return save(out); }
export async function rotate(buf, { angle = 90, ranges = '' } = {}) {
  const doc = await load(buf); const a = ((Math.round(Number(angle) / 90) * 90) % 360 + 360) % 360;
  const pages = doc.getPages(); for (const i of parseRanges(ranges, pages.length)) pages[i].setRotation(degrees((pages[i].getRotation().angle + a) % 360));
  return save(doc);
}
const hexRgb = (h) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h || '')); return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(0.5, 0.5, 0.5); };
// Standard PDF fonts only cover Latin-1; other characters are dropped rather than failing.
const latin = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

export async function watermark(buf, { text = 'DRAFT', color = '#888888', opacity = 0.18, position = 'diagonal', size = 0, ranges = '', image = null } = {}) {
  const doc = await load(buf); const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const t = latin(text).slice(0, 80) || 'DRAFT'; const pages = doc.getPages();
  let img = null; if (image) { try { img = image[0] === 0x89 ? await doc.embedPng(image) : await doc.embedJpg(image); } catch { throw new PdfError('The watermark picture must be a PNG or JPG file.'); } }
  for (const i of parseRanges(ranges, pages.length)) {
    const p = pages[i]; const { width: W, height: H } = p.getSize(); const op = Math.max(0.03, Math.min(1, Number(opacity) || 0.18));
    if (img) { const w = W * 0.5, h = (w / img.width) * img.height; p.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h, opacity: op }); continue; }
    if (position === 'diagonal') {
      const ang = Math.atan2(H, W); const diag = Math.hypot(W, H);
      const fs = size || Math.min(140, (diag * 0.72) / Math.max(1, font.widthOfTextAtSize(t, 1)));
      const tw = font.widthOfTextAtSize(t, fs);
      p.drawText(t, { x: W / 2 - (Math.cos(ang) * tw) / 2 + Math.sin(ang) * fs * 0.3, y: H / 2 - (Math.sin(ang) * tw) / 2 - Math.cos(ang) * fs * 0.3, size: fs, font, color: hexRgb(color), opacity: op, rotate: degrees((ang * 180) / Math.PI) });
    } else {
      const fs = size || 14; const tw = font.widthOfTextAtSize(t, fs); const m = 24;
      const x = /left/.test(position) ? m : /right/.test(position) ? W - tw - m : (W - tw) / 2; const y = /top/.test(position) ? H - m - fs : /bottom|footer/.test(position) ? m : (H - fs) / 2;
      p.drawText(t, { x, y, size: fs, font, color: hexRgb(color), opacity: Math.min(1, op * 2.2) });
    }
  }
  return save(doc);
}
export async function pageNumbers(buf, { position = 'bottom-center', start = 1, format = '{n} / {total}', size = 9, color = '#555555' } = {}) {
  const doc = await load(buf); const font = await doc.embedFont(StandardFonts.Helvetica); const pages = doc.getPages();
  pages.forEach((p, i) => { const { width: W, height: H } = p.getSize(); const t = latin(String(format).replace(/\{n\}/g, String(i + Number(start || 1))).replace(/\{total\}/g, String(pages.length + Number(start || 1) - 1))); const tw = font.widthOfTextAtSize(t, size); const m = 26;
    p.drawText(t, { x: /left/.test(position) ? m : /right/.test(position) ? W - tw - m : (W - tw) / 2, y: /top/.test(position) ? H - m : m - size / 2, size, font, color: hexRgb(color) }); });
  return save(doc);
}

// ----- forms -----
function formFields(doc) {
  const form = doc.getForm();
  return form.getFields().map((f) => {
    const name = f.getName(); let type = 'other', value = '', options;
    if (f instanceof PDFTextField) { type = f.isMultiline() ? 'multiline' : 'text'; value = f.getText() || ''; }
    else if (f instanceof PDFCheckBox) { type = 'checkbox'; value = f.isChecked(); }
    else if (f instanceof PDFDropdown || f instanceof PDFOptionList) { type = 'select'; options = f.getOptions(); value = f.getSelected()[0] || ''; }
    else if (f instanceof PDFRadioGroup) { type = 'radio'; options = f.getOptions(); value = f.getSelected() || ''; }
    return { name, type, value, options, readOnly: f.isReadOnly() };
  }).filter((f) => f.type !== 'other');
}
export async function fillForm(buf, values = {}, { flatten = false } = {}) {
  const doc = await load(buf); const form = doc.getForm(); let filled = 0;
  const key = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const lookup = new Map(Object.entries(values).map(([k, v]) => [key(k), v]));
  for (const f of form.getFields()) {
    const k = key(f.getName()); const short = key(f.getName().split('.').pop());
    if (!lookup.has(k) && !lookup.has(short)) continue; const v = lookup.has(k) ? lookup.get(k) : lookup.get(short);
    try {
      if (f instanceof PDFTextField) { const max = f.getMaxLength(); f.setText(v == null ? '' : max ? latin(v).slice(0, max) : latin(v)); }
      else if (f instanceof PDFCheckBox) { if (v === true || /^(true|yes|y|1|x|on|checked)$/i.test(String(v))) f.check(); else f.uncheck(); }
      else if (f instanceof PDFDropdown || f instanceof PDFOptionList || f instanceof PDFRadioGroup) { const opt = f.getOptions().find((o) => key(o) === key(v)); if (opt) f.select(opt); else if (f instanceof PDFDropdown) { f.addOptions([latin(v)]); f.select(latin(v)); } else continue; }
      else continue;
      filled++;
    } catch { /* a field that refuses its value is skipped */ }
  }
  if (flatten) { try { form.flatten(); } catch { /* some forms cannot be flattened */ } }
  return { buffer: await save(doc), filled };
}
// Adds fillable fields to a PDF Scenly designed. boxes: per page, [{name,type,options,x,y,w,h}] in mm from the top left.
export async function addFormFields(buf, boxes, meta = {}) {
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  if (meta.title) doc.setTitle(meta.title); doc.setProducer('Scenly Docs Studio'); doc.setCreator('Scenly Docs Studio'); if (meta.author) doc.setAuthor(meta.author);
  if (boxes.some((b) => b?.length)) {
    const form = doc.getForm(); const font = await doc.embedFont(StandardFonts.Helvetica); const used = new Set(); const pages = doc.getPages();
    boxes.forEach((list, pi) => {
      const page = pages[pi]; if (!page) return; const H = page.getHeight();
      for (const b of list || []) {
        if (b.type === 'signature' || b.w < 1 || b.h < 1) continue;
        let name = latin(b.name).replace(/\./g, ' ').trim() || 'field'; let n = name, k = 2; while (used.has(n.toLowerCase())) n = `${name} ${k++}`; used.add(n.toLowerCase());
        const rect = { x: b.x * MM, y: H - (b.y + b.h) * MM, width: b.w * MM, height: b.h * MM, borderWidth: 0, font };
        try {
          if (b.type === 'checkbox') form.createCheckBox(n).addToPage(page, { ...rect, borderWidth: 0 });
          else if (b.type === 'select') { const f = form.createDropdown(n); f.addOptions(String(b.options || '').split(/\s*[,|]\s*/).filter(Boolean).map(latin)); f.addToPage(page, rect); try { f.setFontSize(9); } catch { /* default size */ } }
          else { const f = form.createTextField(n); if (b.type === 'multiline') f.enableMultiline(); f.addToPage(page, rect); try { f.setFontSize(b.type === 'multiline' ? 10 : Math.max(8, Math.min(12, b.h * MM * 0.5))); } catch { /* default size */ } }
        } catch { /* skip a field that cannot be placed */ }
      }
    });
  }
  return save(doc);
}

// ----- signing: a drawn or typed signature placed on a page (a visible signature, not a certificate) -----
export async function sign(buf, { image, page = 1, x = 0.6, y = 0.82, width = 0.28, date = '', name = '' } = {}) {
  const doc = await load(buf); const pages = doc.getPages(); const p = pages[Math.max(0, Math.min(pages.length - 1, Number(page) - 1 || 0))];
  if (!image) throw new PdfError('Draw or type a signature first.');
  let img; try { img = image[0] === 0x89 ? await doc.embedPng(image) : await doc.embedJpg(image); } catch { throw new PdfError('The signature picture could not be used.'); }
  const { width: W, height: H } = p.getSize(); const w = Math.max(30, Math.min(W, W * Number(width))); const h = (w / img.width) * img.height;
  const px = Math.max(0, Math.min(W - w, W * Number(x))), py = Math.max(0, Math.min(H - h, H - H * Number(y) - h));
  p.drawImage(img, { x: px, y: py, width: w, height: h });
  const line = [latin(name), latin(date)].filter(Boolean).join(' · ');
  if (line) { const font = await doc.embedFont(StandardFonts.Helvetica); p.drawText(line, { x: px, y: Math.max(4, py - 10), size: 8, font, color: rgb(0.3, 0.3, 0.3) }); }
  return save(doc);
}

// ----- reading and drawing with pdf.js -----
let pdfjsP = null, canvasP = null;
const pdfjs = () => (pdfjsP ||= import('pdfjs-dist/legacy/build/pdf.mjs'));
const canvasLib = () => (canvasP ||= import('@napi-rs/canvas'));
const fontDir = () => path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
async function open(buf) {
  const lib = await pdfjs();
  try { const task = lib.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, standardFontDataUrl: fontDir(), isEvalSupported: false, verbosity: 0 }); const doc = await task.promise; if (typeof doc.destroy !== 'function') doc.destroy = () => task.destroy(); return doc; }
  catch (e) { throw new PdfError(/password/i.test(e.message) ? 'This PDF is password-protected. Remove the password first, then try again.' : 'This file could not be read as a PDF.'); }
}
// Page pictures. Returns PNG (or JPEG) buffers for the pages asked for.
export async function rasterize(buf, { scale = 1.5, pages = null, max = 20, jpeg = 0, maxSide = 0 } = {}) {
  const doc = await open(buf); const { createCanvas } = await canvasLib(); const out = [];
  const list = (pages || Array.from({ length: doc.numPages }, (_x, i) => i + 1)).filter((n) => n >= 1 && n <= doc.numPages).slice(0, max);
  try {
    for (const n of list) {
      const page = await doc.getPage(n); let vp = page.getViewport({ scale });
      if (maxSide && Math.max(vp.width, vp.height) > maxSide) vp = page.getViewport({ scale: (scale * maxSide) / Math.max(vp.width, vp.height) });
      const c = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp, canvas: c }).promise;
      out.push(jpeg ? c.toBuffer('image/jpeg', jpeg) : c.toBuffer('image/png')); page.cleanup();
    }
  } finally { await doc.destroy().catch(() => {}); }
  return out;
}
// Smaller file. "light" re-packs the file without touching quality; "strong" redraws each page as a JPEG picture
// (much smaller for scans and photo-heavy files, but the text can no longer be selected).
export async function compress(buf, { level = 'light' } = {}) {
  if (level !== 'strong' && level !== 'medium') {
    const doc = await load(buf); doc.setProducer('Scenly Docs Studio'); const out = await save(doc);
    return { buffer: out.length < buf.length ? out : buf, before: buf.length, after: Math.min(out.length, buf.length), raster: false };
  }
  const src = await load(buf, { forRead: true }); const sizes = src.getPages().map((p) => { const s = p.getSize(); const r = p.getRotation().angle % 180 !== 0; return r ? { width: s.height, height: s.width } : s; });
  const dpi = level === 'strong' ? 96 : 140, q = level === 'strong' ? 62 : 78;
  const out = await PDFDocument.create(); const total = sizes.length;
  for (let i = 0; i < total; i += 8) {
    const imgs = await rasterize(buf, { scale: dpi / 72, pages: Array.from({ length: Math.min(8, total - i) }, (_x, k) => i + k + 1), max: 8, jpeg: q });
    for (let k = 0; k < imgs.length; k++) { const s = sizes[i + k]; const img = await out.embedJpg(imgs[k]); out.addPage([s.width, s.height]).drawImage(img, { x: 0, y: 0, width: s.width, height: s.height }); }
  }
  const res = await save(out);
  return res.length < buf.length * 0.95 ? { buffer: res, before: buf.length, after: res.length, raster: true } : { buffer: buf, before: buf.length, after: buf.length, raster: false };
}

// Text with its position, grouped into lines. Each line: { x, y, w, size, bold, text, cells:[{x, text}] } in points from the top left.
export async function textLines(buf, { maxPages = 200 } = {}) {
  const doc = await open(buf); const pages = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n); const vp = page.getViewport({ scale: 1 }); const tc = await page.getTextContent();
      const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => { const [a, b, , d, e, f] = it.transform; const size = Math.hypot(a, b) || Math.abs(d) || 10; return { x: e, y: vp.height - f, w: it.width, size, text: it.str, bold: /bold|black|heavy|semibold/i.test(tc.styles?.[it.fontName]?.fontFamily || '') || /bold|black|heavy/i.test(it.fontName || '') }; });
      items.sort((p, q) => p.y - q.y || p.x - q.x);
      const lines = [];
      for (const it of items) { const l = lines.at(-1); if (l && Math.abs(l.y - it.y) <= Math.max(2, Math.min(l.size, it.size) * 0.45)) l.items.push(it); else lines.push({ y: it.y, size: it.size, items: [it] }); }
      pages.push({ n, width: vp.width, height: vp.height, lines: lines.map((l) => {
        l.items.sort((p, q) => p.x - q.x);
        // Pieces that sit apart on the line are separate cells (table columns); close pieces are one run of text.
        const cells = []; for (const it of l.items) { const c = cells.at(-1); const gap = c ? it.x - (c.x + c.w) : 0; if (c && gap < Math.max(it.size * 1.1, 9)) { c.text += (gap > it.size * 0.18 && !/\s$/.test(c.text) && !/^\s/.test(it.text) ? ' ' : '') + it.text; c.w = it.x + it.w - c.x; c.parts.push({ text: it.text, gap }); } else cells.push({ x: it.x, w: it.w, text: it.text, parts: [{ text: it.text, gap: 0 }] }); }
        // Letter-spaced text arrives one letter at a time: the letters are joined, and only the wider gaps are spaces.
        for (const c of cells) { if (c.parts.length < 4 || c.parts.filter((q) => q.text.trim().length === 1).length < c.parts.length * 0.7) continue; const gaps = c.parts.slice(1).map((q) => q.gap).filter((g) => g > 0).sort((a, b) => a - b); const mid = gaps[Math.floor(gaps.length / 2)] || 0; c.text = c.parts.map((q, i) => (i && (q.gap > mid * 2.2 + 0.5) && !/^\s/.test(q.text) ? ' ' : '') + q.text).join('').replace(/\s+/g, ' '); }
        const size = Math.max(...l.items.map((i) => i.size));
        return { x: l.items[0].x, y: l.y, w: l.items.at(-1).x + l.items.at(-1).w - l.items[0].x, size, bold: l.items.every((i) => i.bold), text: cells.map((c) => c.text.trim()).join('  ').trim(), cells: cells.map((c) => ({ x: c.x, w: c.w, text: c.text.trim() })) };
      }) });
      page.cleanup();
    }
    return { pages, total: doc.numPages };
  } finally { await doc.destroy().catch(() => {}); }
}

// Tables are runs of lines whose cells line up in the same columns.
function tablesOf(lines) {
  const out = []; let run = [];
  const flush = () => { if (run.length >= 2) out.push(run); run = []; };
  for (const l of lines) { if (l.cells.length >= 2) run.push(l); else if (run.length && l.cells.length === 1 && run.length >= 2 && l.x > run[0].cells[0].x + 4) run.push(l); else flush(); }
  flush();
  return out.map((rows) => {
    const xs = []; for (const r of rows) for (const c of r.cells) { const hit = xs.find((x) => Math.abs(x.x - c.x) < 14 || (c.x >= x.x - 4 && c.x <= x.right)); if (hit) { hit.x = Math.min(hit.x, c.x); hit.right = Math.max(hit.right, c.x + c.w); hit.n++; } else xs.push({ x: c.x, right: c.x + c.w, n: 1 }); }
    const cols = xs.filter((x) => x.n >= Math.max(1, rows.length * 0.2)).sort((a, b) => a.x - b.x);
    const grid = rows.map((r) => { const row = cols.map(() => ''); for (const c of r.cells) { let best = 0, bd = Infinity; cols.forEach((col, i) => { const d = Math.abs(col.x - c.x); if (d < bd) { bd = d; best = i; } }); row[best] = (row[best] ? row[best] + ' ' : '') + c.text; } return row; });
    return { start: rows[0], end: rows.at(-1), rows: grid, lines: new Set(rows) };
  }).filter((t) => t.rows[0].length >= 2);
}
// The text of a PDF as Markdown: headings by type size, paragraphs, bullet lists and tables.
export async function toMarkdown(buf, opts = {}) {
  const { pages, total } = await textLines(buf, opts); const sizes = new Map();
  for (const p of pages) for (const l of p.lines) sizes.set(Math.round(l.size * 2) / 2, (sizes.get(Math.round(l.size * 2) / 2) || 0) + l.text.length);
  const body = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
  // Lines repeated at the same height on most pages are running headers and footers.
  const seen = new Map(); for (const p of pages) for (const l of p.lines) { if (l.y > p.height * 0.08 && l.y < p.height * 0.92) continue; const k = l.text.replace(/\d+/g, '#') + '@' + Math.round(l.y / 6); seen.set(k, (seen.get(k) || 0) + 1); }
  const repeated = (p, l) => pages.length >= 3 && (l.y <= p.height * 0.08 || l.y >= p.height * 0.92) && seen.get(l.text.replace(/\d+/g, '#') + '@' + Math.round(l.y / 6)) >= pages.length * 0.6;
  const out = []; const tables = []; let para = ''; let last = null;
  const flush = () => { if (para.trim()) out.push(para.trim()); para = ''; };
  for (const p of pages) {
    const lines = p.lines.filter((l) => !repeated(p, l) && !/^\s*(page\s*)?\d+(\s*(of|\/)\s*\d+)?\s*$/i.test(l.text));
    const tbls = tablesOf(lines);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]; const t = tbls.find((x) => x.lines.has(l));
      if (t) { if (l === t.start) { flush(); const head = t.rows[0], rest = t.rows.slice(1); const cell = (c) => String(c || '').replace(/\|/g, '\\|'); out.push([`| ${head.map(cell).join(' | ')} |`, `|${head.map(() => ' --- |').join('')}`, ...rest.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n')); tables.push({ page: p.n, rows: t.rows }); } last = null; continue; }
      const ratio = l.size / body; const short = l.text.length < 90;
      const bullet = /^\s*([•●▪■◦‣·*–-]|\d{1,2}[.)])\s+/.exec(l.text);
      if (short && (ratio >= 1.6)) { flush(); out.push(`# ${l.text}`); last = null; }
      else if (short && ratio >= 1.25) { flush(); out.push(`## ${l.text}`); last = null; }
      else if (short && (ratio >= 1.08 || (l.bold && !/[.,;:]$/.test(l.text) && l.text.length < 70)) && !bullet) { flush(); out.push(`### ${l.text}`); last = null; }
      else if (bullet) { flush(); out.push(/^\s*\d/.test(l.text) ? l.text.trim() : `- ${l.text.replace(bullet[0], '').trim()}`); last = { ...l, list: true }; }
      else {
        const gap = last ? l.y - last.y : 0;
        if (last && !last.list && gap > 0 && gap < last.size * 1.9 && Math.abs(l.size - last.size) < 0.8) para += (/-$/.test(para) && /^[a-z]/.test(l.text) ? '' : ' ') + l.text;
        else if (last?.list && gap > 0 && gap < last.size * 1.6 && l.x > last.x + 3) { out[out.length - 1] += ' ' + l.text; continue; }
        else { flush(); para = l.text; }
        last = l;
      }
    }
    flush(); last = null;
  }
  const md = out.join('\n\n').replace(/^(- .*)\n\n(?=- )/gm, '$1\n').replace(/^(\d{1,2}[.)] .*)\n\n(?=\d{1,2}[.)] )/gm, '$1\n');
  return { markdown: md, tables, pages: total, chars: md.length };
}

// ----- OCR for scanned pages -----
export async function ocr(buf, { maxPages = 30, onPage = () => {}, searchable = true } = {}) {
  const { createWorker } = require('tesseract.js');
  let langPath; try { langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'); } catch { langPath = undefined; }
  let failed = null;
  const worker = await createWorker('eng', 1, { ...(langPath ? { langPath, gzip: true } : {}), cachePath: os.tmpdir(), errorHandler: (e) => { failed = e; } }).catch((e) => { throw new PdfError(`The text reader could not start (${String(e?.message || e).slice(0, 120)}).`); });
  const src = await load(buf, { forRead: true }); const total = src.getPageCount(); const n = Math.min(total, maxPages);
  const out = searchable ? await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false }) : null;
  const font = out ? await out.embedFont(StandardFonts.Helvetica) : null; const texts = [];
  try {
    for (let i = 0; i < n; i++) {
      const [png] = await rasterize(buf, { scale: 2, pages: [i + 1], max: 1, maxSide: 2600 });
      const r = await worker.recognize(png, {}, { text: true, blocks: searchable });
      if (failed) throw new PdfError('The text reader stopped unexpectedly.');
      texts.push(r.data.text.trim()); onPage(i + 1, n);
      if (!out) continue;
      // An invisible text layer goes over the picture, word by word, so the PDF can be searched and copied from.
      const page = out.getPage(i); const { width: W, height: H } = page.getSize(); const dim = pngSize(png); const sx = W / dim.w, sy = H / dim.h;
      const words = (r.data.blocks || []).flatMap((b) => (b.paragraphs || []).flatMap((p) => (p.lines || []).flatMap((l) => l.words || [])));
      for (const w of words) { const t = latin(w.text); if (!t.trim() || w.confidence < 35) continue; const bw = (w.bbox.x1 - w.bbox.x0) * sx, bh = (w.bbox.y1 - w.bbox.y0) * sy; const fs = Math.max(4, bh * 0.82); const tw = font.widthOfTextAtSize(t, fs) || 1;
        try { page.drawText(t, { x: w.bbox.x0 * sx, y: H - w.bbox.y1 * sy + bh * 0.18, size: fs, font, opacity: 0, xSkew: degrees(0), ...(Math.abs(tw - bw) > 1 ? { size: Math.max(3, fs * Math.min(1.6, Math.max(0.5, bw / tw))) } : {}) }); } catch { /* skip a word */ } }
    }
  } finally { await worker.terminate().catch(() => {}); }
  return { text: texts.join('\n\n'), pages: n, total, buffer: out ? await save(out) : null };
}
function pngSize(b) { return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }

// A short description of how a sample PDF is laid out, for "make one like this".
export async function layoutNote(buf, { maxPages = 2 } = {}) {
  const { pages, total } = await textLines(buf, { maxPages }); const notes = [];
  let palette = [];
  try {
    const [png] = await rasterize(buf, { scale: 0.5, pages: [1], max: 1 }); const { loadImage, createCanvas } = await canvasLib(); const img = await loadImage(png);
    const c = createCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; const count = new Map();
    for (let i = 0; i < d.length; i += 16) { const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4); count.set(k, (count.get(k) || 0) + 1); }
    const tot = d.length / 16;
    palette = [...count].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => ({ hex: '#' + [(k >> 8) & 15, (k >> 4) & 15, k & 15].map((v) => (v * 17).toString(16).padStart(2, '0')).join('').toUpperCase(), share: Math.round((n / tot) * 100) })).filter((x) => x.share >= 1);
  } catch { /* colours are optional */ }
  for (const p of pages) {
    const mm = (v) => Math.round(v / MM);
    notes.push(`Page ${p.n}: ${mm(p.width)} × ${mm(p.height)} mm (${p.width > p.height ? 'landscape' : 'portrait'}).`);
    for (const l of p.lines.slice(0, 70)) notes.push(`  y=${mm(l.y)}mm x=${mm(l.x)}mm ${l.cells.length > 1 ? `${l.cells.length} columns at x=${l.cells.map((c) => mm(c.x)).join('/')}mm ` : ''}${Math.round(l.size)}pt${l.bold ? ' bold' : ''}: "${l.text.slice(0, 90)}"`);
    if (p.lines.length > 70) notes.push(`  … ${p.lines.length - 70} more lines`);
  }
  return { text: `${total} page${total > 1 ? 's' : ''}.${palette.length ? ` Colours on page 1 by area: ${palette.map((c) => `${c.hex} ${c.share}%`).join(', ')}.` : ''}\n${notes.join('\n')}`.slice(0, 9000), total };
}
