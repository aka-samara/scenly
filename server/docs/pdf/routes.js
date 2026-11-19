// PDF tools: work on PDF files the user uploads, or on a PDF designed in Docs Studio.
import fs from 'node:fs';
import db from '../../db.js';
import { UserError } from '../../generate.js';
import { safeName } from '../../export.js';
import { getFiles, filePath, dataUrl } from '../../files.js';
import { userDoc, readVersion, createDoc, addVersion, docMeta } from '../store.js';
import { resolveTheme } from '../brand.js';
import * as T from './tools.js';

const PDF_MIME = 'application/pdf';
const MAX_BYTES = 80 * 1024 * 1024;

export function mountPdfTools(app, { requireUser, wrap }) {
  // The kinds are loaded late: they import this folder too.
  const kinds = async () => (await import('../kinds/index.js')).KINDS;
  const isPdf = (f) => /\.pdf$/i.test(f.name) || f.mime === PDF_MIME;
  // Where the PDFs come from: uploaded files (in the order given), or one Docs Studio document.
  const sources = async (req, src) => {
    const out = [];
    if (src.docId) {
      const d = userDoc(req.user, String(src.docId)); const K = await kinds();
      if (!d || d.kind !== 'pdf') throw new UserError('That PDF was not found.', 404);
      const spec = readVersion(d);
      out.push({ name: `${safeName(spec.title || d.title, 'PDF')}.pdf`, buffer: await K.pdf.render(spec, 'pdf', resolveTheme(req.user, d)) });
    }
    const ids = [].concat(src.fileIds || src.fileId || []).map(String).slice(0, 30);
    for (const f of getFiles(req.user, ids)) {
      if (!isPdf(f)) throw new UserError(`${f.name} is not a PDF.`);
      if (f.size > MAX_BYTES) throw new UserError(`${f.name} is too large for the PDF tools (the limit is 80 MB).`);
      out.push({ name: f.name, buffer: fs.readFileSync(filePath(f)) });
    }
    if (!out.length) throw new UserError('Choose a PDF first.');
    return out;
  };
  const guard = async (fn) => { try { return await fn(); } catch (e) { if (e.user) throw new UserError(e.message); throw e; } };
  const base = (name) => String(name || 'document').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'document';
  const zipOf = async (parts) => { const { default: JSZip } = await import('jszip'); const zip = new JSZip(); const used = new Set(); for (const p of parts) { let n = p.name; for (let i = 2; used.has(n.toLowerCase()); i++) n = p.name.replace(/(\.\w+)$/, ` (${i})$1`); used.add(n.toLowerCase()); zip.file(n, p.buffer); } return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }); };
  const send = (res, name, mime, buf, note) => res.set({ 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${String(name).replace(/[^\x20-\x7E]+/g, '_').replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store', 'Access-Control-Expose-Headers': 'X-Note', ...(note ? { 'X-Note': encodeURIComponent(note) } : {}) }).send(buf);
  // Text of a PDF as Markdown; a scan is read with OCR first.
  const readText = async (buf) => {
    let r = await T.toMarkdown(buf); let scanned = false;
    if (r.chars < 40 * Math.min(r.pages, 5)) { const o = await T.ocr(buf, { searchable: true, maxPages: 30 }); scanned = true; if (o.buffer) { try { r = await T.toMarkdown(o.buffer); } catch { /* the plain text is used */ } } if (r.chars < 20) r = { ...r, markdown: o.text, tables: [] }; }
    return { ...r, scanned };
  };

  app.get('/api/pdf/info', requireUser, wrap(async (req, res) => {
    const [src] = await sources(req, req.query);
    const info = await guard(() => T.info(src.buffer));
    let chars = 0; try { chars = (await T.textLines(src.buffer, { maxPages: 3 })).pages.reduce((a, p) => a + p.lines.reduce((b, l) => b + l.text.length, 0), 0); } catch { /* unreadable text is treated as none */ }
    res.json({ name: src.name, size: src.buffer.length, pages: info.pages, sizes: info.sizes.slice(0, 60), fields: info.fields, encrypted: !!info.encrypted, scanned: chars < 40 * Math.min(info.pages, 3) });
  }));
  // A picture of one page, for choosing pages and placing a signature.
  app.get('/api/pdf/page', requireUser, wrap(async (req, res) => {
    const [src] = await sources(req, req.query);
    const n = Math.max(1, Number(req.query.page) || 1);
    const [png] = await guard(() => T.rasterize(src.buffer, { scale: Math.min(2, Math.max(0.2, Number(req.query.scale) || 0.6)), pages: [n], max: 1, maxSide: 1600 }));
    if (!png) throw new UserError('That page does not exist.', 404);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' }).send(png);
  }));

  app.post('/api/pdf/tools/:tool', requireUser, wrap(async (req, res) => {
    const o = req.body.options || {}; const tool = String(req.params.tool);
    const srcs = await sources(req, req.body); const first = srcs[0]; const name = base(first.name);
    const pdf = (suffix, buf, note) => send(res, `${name}${suffix}.pdf`, PDF_MIME, buf, note);
    await guard(async () => {
      switch (tool) {
        case 'merge': {
          if (srcs.length < 2) throw new T.PdfError('Choose at least two PDFs to merge.');
          return send(res, `${base(o.name) !== 'document' ? base(o.name) : name + ' (merged)'}.pdf`, PDF_MIME, await T.merge(srcs.map((s) => s.buffer)));
        }
        case 'split': {
          const parts = await T.split(first.buffer, { ranges: o.ranges, each: o.mode === 'each' || o.mode === 'ranges', every: o.mode === 'every' ? Math.max(1, Number(o.every) || 1) : 0 });
          if (parts.length === 1) return pdf(` (${o.ranges ? 'pages ' + String(o.ranges).slice(0, 30) : 'extract'})`, parts[0].buffer);
          return send(res, `${name} (split).zip`, 'application/zip', await zipOf(parts.map((p) => ({ name: `${name} - ${p.name}.pdf`, buffer: p.buffer }))));
        }
        case 'remove': return pdf(' (pages removed)', await T.removePages(first.buffer, o.ranges));
        case 'reorder': return pdf(' (reordered)', await T.reorder(first.buffer, o.order));
        case 'rotate': return pdf(' (rotated)', await T.rotate(first.buffer, { angle: Number(o.angle) || 90, ranges: o.ranges }));
        case 'watermark': {
          let image = null;
          if (o.imageId) { const f = getFiles(req.user, [String(o.imageId)])[0]; if (f?.kind === 'image') image = fs.readFileSync(filePath(f)); }
          return pdf(' (watermarked)', await T.watermark(first.buffer, { text: String(o.text || 'DRAFT').slice(0, 80), color: o.color, opacity: Math.min(1, Math.max(0.03, Number(o.opacity) || 0.18)), position: o.position, size: Number(o.size) || 0, ranges: o.ranges, image }));
        }
        case 'numbers': return pdf(' (numbered)', await T.pageNumbers(first.buffer, { position: o.position, start: Number(o.start) || 1, format: String(o.format || '{n} / {total}').slice(0, 40), size: Number(o.size) || 9, color: o.color }));
        case 'compress': {
          const r = await T.compress(first.buffer, { level: ['light', 'medium', 'strong'].includes(o.level) ? o.level : 'medium' });
          const pct = Math.round((1 - r.after / r.before) * 100);
          return pdf(' (compressed)', r.buffer, pct > 0 ? `${pct}% smaller${r.raster ? '. Pages were turned into pictures, so the text can no longer be selected.' : '.'}` : 'This file is already as small as it gets without losing quality.');
        }
        case 'fill': { const r = await T.fillForm(first.buffer, o.values || {}, { flatten: !!o.flatten }); return pdf(' (filled)', r.buffer, `${r.filled} field${r.filled === 1 ? '' : 's'} filled in.`); }
        case 'sign': {
          const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(o.image || ''));
          let image = m ? Buffer.from(m[2], 'base64') : null;
          if (!image && o.imageId) { const f = getFiles(req.user, [String(o.imageId)])[0]; if (f?.kind === 'image') { const d = /^data:[^;]+;base64,(.+)$/.exec(dataUrl(f)); image = d ? Buffer.from(d[1], 'base64') : null; } }
          if (!image) throw new T.PdfError('Draw or upload your signature first.');
          return pdf(' (signed)', await T.sign(first.buffer, { image, page: Number(o.page) || 1, x: Number(o.x), y: Number(o.y), width: Number(o.width) || 0.28, date: o.date ? String(o.date).slice(0, 40) : '', name: o.name ? String(o.name).slice(0, 80) : '' }));
        }
        case 'ocr': {
          const r = await T.ocr(first.buffer, { searchable: true, maxPages: 40 });
          if (o.as === 'text') return send(res, `${name}.txt`, 'text/plain; charset=utf-8', Buffer.from(r.text, 'utf8'));
          return pdf(' (searchable)', r.buffer, r.total > r.pages ? `The first ${r.pages} of ${r.total} pages were read.` : `${r.pages} page${r.pages > 1 ? 's' : ''} read. The text can now be searched and copied.`);
        }
        case 'images': {
          const imgs = await T.rasterize(first.buffer, { scale: o.quality === 'high' ? 3 : 2, max: 60, pages: o.ranges ? T.parseRanges(o.ranges, (await T.info(first.buffer)).pages).map((i) => i + 1) : null, jpeg: o.format === 'jpg' ? 88 : 0 });
          const ext = o.format === 'jpg' ? 'jpg' : 'png';
          if (imgs.length === 1) return send(res, `${name}.${ext}`, `image/${ext === 'jpg' ? 'jpeg' : 'png'}`, imgs[0]);
          return send(res, `${name} (images).zip`, 'application/zip', await zipOf(imgs.map((b, i) => ({ name: `${name} - page ${i + 1}.${ext}`, buffer: b }))));
        }
        case 'text': { const r = await readText(first.buffer); return send(res, `${name}.${o.as === 'md' ? 'md' : 'txt'}`, 'text/plain; charset=utf-8', Buffer.from(r.markdown, 'utf8')); }
        case 'word': {
          const K = await kinds(); const r = await readText(first.buffer);
          if (!r.markdown.trim()) throw new T.PdfError('No text could be read from this PDF.');
          const v = K.word.validate({ kind: 'word', title: name, body: r.markdown });
          if (v.errors.length) throw new T.PdfError(v.errors[0]);
          const note = r.scanned ? 'This PDF is a scan, so the text was read from the page images. Check it for misread words.' : 'Text, headings, lists and tables were brought over. Pictures and the exact page layout do not carry into Word.';
          // Opened in Docs Studio (so it can be edited by prompt) or downloaded straight away.
          if (o.open && req.body.conversationId) {
            const conv = db.conversations.find((c) => c.id === String(req.body.conversationId) && c.userId === req.user.id);
            if (!conv) throw new UserError('Chat not found.', 404);
            const d = createDoc(req.user, { kind: 'word', title: v.spec.title, conversationId: conv.id, projectId: conv.projectId });
            addVersion(d, v.spec, { note: `Converted from ${first.name}`, by: 'upload', summary: K.word.summary(v.spec) });
            return res.json({ doc: docMeta(d), note });
          }
          return send(res, `${name}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', await K.word.render(v.spec, 'docx', resolveTheme(req.user, {})), note);
        }
        case 'excel': {
          const scan = await readText(first.buffer);
          const buf = scan.scanned && scan.markdown ? null : first.buffer;
          const { default: ExcelJS } = await import('exceljs'); const wb = new ExcelJS.Workbook(); let tables = 0;
          const num = (t) => { const s = String(t).trim(); if (!/^[-+(]?[$€£¥]?\s?\d[\d,]*(\.\d+)?\)?%?$/.test(s) || /^0\d/.test(s)) return t; const n = Number(s.replace(/[$€£¥,\s()%]/g, '')); return Number.isFinite(n) ? (/^\(.*\)$/.test(s) ? -n : n) * (/%$/.test(s) ? 0.01 : 1) : t; };
          if (buf) {
            const { pages } = await T.textLines(buf);
            for (const p of pages) {
              // Every line of the page becomes a row; pieces that sit apart on a line become columns.
              const cols = []; for (const l of p.lines) if (l.cells.length > 1) for (const c of l.cells) { const hit = cols.find((x) => Math.abs(x - c.x) < 12); if (hit == null) cols.push(c.x); }
              cols.sort((a, b) => a - b); if (cols.some((x) => p.lines.some((l) => l.cells.length > 1))) tables++;
              const ws = wb.addWorksheet(`Page ${p.n}`);
              for (const l of p.lines) { const row = []; if (l.cells.length < 2 || !cols.length) row[0] = l.text; else for (const c of l.cells) { let best = 0, bd = Infinity; cols.forEach((x, i) => { const d = Math.abs(x - c.x); if (d < bd) { bd = d; best = i; } }); row[best] = row[best] ? `${row[best]} ${c.text}` : c.text; } ws.addRow(row.map((v) => (v == null ? null : num(v)))); }
              ws.columns.forEach((c) => { let w = 8; c.eachCell({ includeEmpty: false }, (cell) => { w = Math.max(w, Math.min(60, String(cell.value ?? '').length + 2)); }); c.width = w; });
              if (wb.worksheets.length >= 100) break;
            }
          } else {
            const ws = wb.addWorksheet('Text'); for (const line of scan.markdown.split('\n')) ws.addRow(/^\|/.test(line) ? line.split('|').slice(1, -1).map((c) => num(c.trim())) : [line]);
          }
          if (!wb.worksheets.length) throw new T.PdfError('No text could be read from this PDF.');
          return send(res, `${name}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from(await wb.xlsx.writeBuffer()), scan.scanned ? 'This PDF is a scan, so its text was read from the page images and may need tidying.' : tables ? 'Each page is a sheet, with table columns kept apart.' : 'No tables were found, so each line of text is a row.');
        }
        default: throw new UserError('That PDF tool does not exist.', 404);
      }
    });
  }));
}
