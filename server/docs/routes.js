// HTTP routes for Docs Studio: documents, versions, previews, downloads and brand kits.
import db, { save } from '../db.js';
import { UserError } from '../generate.js';
import { safeName } from '../export.js';
import { KINDS, kindList } from './kinds/index.js';
import { userDoc, convDocs, readVersion, addVersion, setCurrent, deleteDoc, docMeta, docDir } from './store.js';
import { getFiles, filePath } from '../files.js';
import { resolveTheme, userBrand, userBrands, createBrand, updateBrand, deleteBrand, brandView } from './brand.js';
import { mountPdfTools } from './pdf/routes.js';
import { cloneBrand, CLONE_ASK } from './clone.js';

export { kindList };

// A message that only mentions a file type ("follow up on the updates spreadsheet") is ordinary chat.
// A type counts only when the message asks to make, change or deliver that file.
// Asking for an email, message or reply is chat, unless a file format is asked for too.
const CHAT_OUTPUT = /^\W*(?:(?:hi|hey|hello|ok|okay|please|pls|kindly|can you|could you|would you|will you|help me|i need you to|i want you to)\W+)*(?:write|draft|compose|prepare|create|make|send|reply|respond|type|craft|do)\b(?:\s+(?:me|us|him|her|them|up))?(?:\s+(?:a|an|the|my|our|this|that|some|quick|short|brief|polite|formal|friendly|professional|nice|simple|follow[- ]?up|reply|thank[- ]you|cold|reminder|response))*\s+(?:emails?|e-mails?|messages?|replies|reply|responses?|texts?|sms|whatsapps?|slack|teams|notes?|tweets?|posts?|captions?|comments?|dms?|answers?|linkedin|bio)\b/i;
// A plain question about a program ("how do I make a pivot table in Excel?") is chat too.
const QUESTION = /^\W*(?:how|what|why|when|where|which|who|whose|is|are|was|were|does|did|should|can i|could i|would it|explain|tell me (?:how|what|why))\b/i;
const FILE_ASK = /\b(?:as|in|into|to|on)\s+(?:an?\s+|the\s+)?(?:ms\s+|microsoft\s+)?(?:word|docx|pdf|excel|xlsx|spreadsheet|sheet|workbook|powerpoint|pptx|slides?|deck|presentation)\b|\.(?:docx|xlsx|pptx|pdf)\b|\b(?:word|excel|pdf|powerpoint|pptx|docx|xlsx)\s+(?:file|document|doc|format|version|copy|download)\b|\b(?:download|export|save)\b/i;
const ACTION = /\b(?:create|make|build|generate|draft|write|prepare|produce|design|give me|send me|i need|we need|i want|we want|need an?|want an?|turn|convert|export|save|put|edit|update|add|insert|fill|change|format|open|analy[sz]e|summari[sz]e|chart|graph|plot|calculate|sort|filter|clean|fix|redo|rewrite|remove|delete|rename|set up|start|new)\b/i;
export function asksFor(k, text) {
  const t = String(text || '');
  const m = k.detect.exec(t);
  if (!m) return false;
  if (QUESTION.test(t)) return false;
  if (FILE_ASK.test(t)) return !CHAT_OUTPUT.test(t) || /\b(?:as|in|into)\s+(?:an?\s+)?(?:word|docx|pdf|excel|xlsx|spreadsheet|powerpoint|pptx|slides?|deck)\b|\.(?:docx|xlsx|pptx|pdf)\b/i.test(t);
  if (CHAT_OUTPUT.test(t)) return false;
  // The asking verb has to be in the same sentence, shortly before the file type.
  const before = t.slice(Math.max(0, m.index - 90), m.index + m[0].length);
  const sentence = before.slice(Math.max(...['.', '?', '!', '\n'].map((c) => before.lastIndexOf(c, before.length - m[0].length - 1))) + 1);
  if (ACTION.test(sentence)) return true;
  // A short request that is just the thing, such as "Budget spreadsheet for March".
  return t.trim().length <= 60 && m.index <= 12 && !t.includes('?') && !/^\W*(?:my|our|the|this|that|these|those|his|her|their|your|its)\b/i.test(t);
}

// Which document a chat message is about, if any: the one open in the panel, a type picked in
// the composer, or a request that plainly asks for a file type.
export function docRequest(user, conv, asked, text, files = []) {
  // Files a document type can open directly (spreadsheets and CSV files for now).
  const opens = (k) => (k.canImport ? files.filter((f) => k.canImport(f.name, text)) : []);
  if (asked?.id) {
    const d = userDoc(user, asked.id);
    if (d && d.conversationId === conv.id && KINDS[d.kind]) return { kindId: d.kind, doc: d, files: KINDS[d.kind].importsInto ? opens(KINDS[d.kind]) : [] };
  }
  if (asked?.kind && KINDS[asked.kind]) return { kindId: asked.kind, doc: null, files: opens(KINDS[asked.kind]), template: asked.template ? String(asked.template) : null };
  if (asked === false) return null;
  // A spreadsheet dropped into a chat opens in Docs Studio, where it can be analysed in full.
  // Naming another document type ("a Word report in the format of this deck") means making that type, not opening the file.
  let named = Object.values(KINDS).filter((k) => asksFor(k, text));
  // "A Word memo in the same format as this deck": the type that could open the attachment is the sample, not what to make.
  if (named.length > 1 && CLONE_ASK.test(String(text || '')) && named.some((k) => !opens(k).length)) named = named.filter((k) => !opens(k).length);
  for (const k of Object.values(KINDS)) {
    const f = opens(k); if (f.length && named.length && !named.includes(k)) continue;
    const auto = k.wants ? k.wants(text, f) : f.some((x) => !/\.(csv|tsv|tab)$/i.test(x.name) || x.size > 150_000);
    if (f.length && (auto || k.detect.test(String(text || '')))) return { kindId: k.id, doc: null, files: f };
  }
  for (const k of named) {
    const existing = convDocs(user, conv.id).filter((d) => d.kind === k.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const wantsNew = /\b(new|another|separate|second|create|make|generate|write|draft|build|prepare|produce)\b/i.test(text);
    return { kindId: k.id, doc: existing && !wantsNew ? existing : null };
  }
  return null;
}

export function mountDocs(app, { requireUser, wrap }) {
  const find = (req) => { const d = userDoc(req.user, req.params.id); if (!d) throw new UserError('Document not found.', 404); return d; };
  const version = (d, v) => { const n = Number(v) || d.current; const spec = readVersion(d, n); if (!spec) throw new UserError('That version no longer exists.', 404); return { n, spec }; };
  const view = async (user, d, n, spec) => {
    const k = KINDS[d.kind];
    return { doc: docMeta(d), v: n, summary: k.summary(spec), preview: await k.preview(spec, resolveTheme(user, d)), source: k.source ? k.source(spec) : null, templates: undefined };
  };

  app.get('/api/docs', requireUser, (req, res) => {
    const cid = req.query.conversationId;
    const list = db.documents.filter((d) => d.userId === req.user.id && (!cid || d.conversationId === cid) && KINDS[d.kind]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ documents: list.map(docMeta) });
  });
  app.get('/api/docs/:id', requireUser, wrap(async (req, res) => {
    const d = find(req); const { n, spec } = version(d, req.query.v);
    res.json(await view(req.user, d, n, spec));
  }));
  app.get('/api/docs/:id/file', requireUser, wrap(async (req, res) => {
    const d = find(req); const { n, spec } = version(d, req.query.v);
    const k = KINDS[d.kind];
    const fmt = k.formats.find((f) => f.id === req.query.format) || k.formats[0];
    // Tracked changes compare with the version asked for, or else with the version this one was made from.
    let compare = null, against = null;
    if (fmt.compare) {
      const me = d.versions.find((x) => x.n === n);
      against = Number(req.query.against) || (me?.base ?? n - 1);
      compare = against && against !== n ? readVersion(d, against) : null;
      if (!compare) throw new UserError('There is no earlier version to compare with yet.');
    }
    const buf = await k.render(spec, fmt.id, resolveTheme(req.user, d), { dir: docDir(d), sheet: req.query.sheet ? String(req.query.sheet) : undefined, compare });
    const name = `${safeName(spec.title || d.title, k.noun)}${compare ? ` (changes since v${against})` : ''}.${fmt.ext || fmt.id}`;
    res.set({ 'Content-Type': fmt.mime, 'Content-Disposition': `${req.query.inline ? 'inline' : 'attachment'}; filename="${name}"`, 'Cache-Control': 'no-store' }).send(buf);
  }));
  // Undo, redo and "restore this version" all just move the pointer; nothing is ever lost.
  app.post('/api/docs/:id/current', requireUser, wrap(async (req, res) => {
    const d = find(req);
    if (!setCurrent(d, req.body.v)) throw new UserError('That version no longer exists.', 404);
    const { n, spec } = version(d);
    res.json(await view(req.user, d, n, spec));
  }));
  // Changes made by hand in the panel become a new version too.
  app.post('/api/docs/:id/manual', requireUser, wrap(async (req, res) => {
    const d = find(req); const k = KINDS[d.kind];
    const { spec } = version(d);
    if (!k.applyManual) throw new UserError('This document type cannot be edited by hand yet.');
    let changed;
    try { changed = k.applyManual(spec, req.body.change || {}); } catch (e) { if (e.user) throw new UserError(e.message); throw e; }
    const v = k.validate(changed);
    if (v.errors.length) throw new UserError(v.errors[0]);
    // Types that lay pages out (PDF) check the fit again after a hand edit.
    if (k.check) { try { v.spec = (await k.check(v.spec, { theme: resolveTheme(req.user, d), warn: () => {} })) || v.spec; } catch (e) { if (e.user) throw new UserError(e.message); throw e; } }
    // Nothing actually changed (for example clearing a cell that a column formula fills again).
    if (JSON.stringify(v.spec) === JSON.stringify(spec)) return res.json(await view(req.user, d, d.current, spec));
    const n = addVersion(d, v.spec, { note: String(req.body.note || 'Edited by hand').slice(0, 120), by: 'user', summary: k.summary(v.spec) });
    res.json(await view(req.user, d, n, v.spec));
  }));
  // More rows of a large data sheet, for scrolling in the preview.
  app.get('/api/docs/:id/rows', requireUser, wrap(async (req, res) => {
    const d = find(req); const { spec } = version(d, req.query.v); const k = KINDS[d.kind];
    if (!k.rows) throw new UserError('Not available for this document type.');
    res.json(await k.rows(spec, String(req.query.sheet || ''), Number(req.query.offset) || 0, Math.min(500, Number(req.query.limit) || 200), { dir: docDir(d) }));
  }));
  // Mail merge. GET lists the fields and the data on offer; POST builds the merged file.
  const mergeData = async (req, d, { limit = 500 } = {}) => {
    const theme = resolveTheme(req.user, d); const src = req.method === 'GET' ? req.query : req.body;
    if (src.docId) {
      const sd = userDoc(req.user, String(src.docId)); if (!sd || !KINDS[sd.kind]?.records) throw new UserError('That spreadsheet was not found.', 404);
      const spec = readVersion(sd);
      return { ...(await KINDS[sd.kind].records(spec, src.sheet ? String(src.sheet) : '', theme, { dir: docDir(sd), limit })), sheets: spec.sheets.filter((x) => !x.hidden).map((x) => x.name), name: sd.title };
    }
    if (src.fileId) {
      const f = getFiles(req.user, [String(src.fileId)])[0];
      if (!f || !KINDS.sheet.canImport(f.name)) throw new UserError('Choose an Excel or CSV file.', 400);
      try { return { ...(await KINDS.sheet.recordsFromFile({ name: f.name, path: filePath(f) }, theme, { sheet: src.sheet ? String(src.sheet) : '', limit })), name: f.name }; }
      catch (e) { throw new UserError(`That file could not be read (${String(e.message).slice(0, 160)}).`); }
    }
    return null;
  };
  app.get('/api/docs/:id/merge', requireUser, wrap(async (req, res) => {
    const d = find(req); const k = KINDS[d.kind]; const { spec } = version(d, req.query.v);
    if (!k.merge) throw new UserError('Mail merge is not available for this document type.');
    const data = await mergeData(req, d, { limit: 500 });
    const sheets = db.documents.filter((x) => x.userId === req.user.id && x.conversationId === d.conversationId && KINDS[x.kind]?.records).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((x) => ({ id: x.id, title: x.title }));
    res.json({ fields: k.fields(spec), sources: sheets, data: data && { name: data.name, sheet: data.sheet, sheets: data.sheets, columns: data.columns, count: data.rows.length, sample: data.rows.slice(0, 3) } });
  }));
  app.post('/api/docs/:id/merge', requireUser, wrap(async (req, res) => {
    const d = find(req); const k = KINDS[d.kind]; const { spec } = version(d, req.body.v);
    if (!k.merge) throw new UserError('Mail merge is not available for this document type.');
    const data = await mergeData(req, d);
    if (!data?.rows.length) throw new UserError('The data has no rows to merge.');
    let out;
    try { out = await k.merge(spec, data.rows, resolveTheme(req.user, d), { mode: req.body.mode === 'zip' ? 'zip' : 'one', nameField: String(req.body.nameField || '') }); }
    catch (e) { if (e.user) throw new UserError(e.message); throw e; }
    const name = `${safeName(spec.title.replace(/\{\{[^}]*\}\}/g, '').trim() || d.title, k.noun)} (merged, ${out.count}).${out.ext}`;
    res.set({ 'Content-Type': out.ext === 'zip' ? 'application/zip' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' }).send(out.buffer);
  }));
  app.patch('/api/docs/:id', requireUser, wrap(async (req, res) => {
    const d = find(req);
    if ('brandId' in req.body) {
      if (req.body.brandId && !userBrand(req.user, req.body.brandId)) throw new UserError('Brand kit not found.', 404);
      d.brandId = req.body.brandId || null; // null means "no brand kit", even when a default exists
      // Picking a brand kit is the latest word on the look, so colours and fonts set earlier give way to it.
      const k = KINDS[d.kind]; const cur = readVersion(d);
      if (d.brandId && cur && k.applyManual) {
        let reset = k.applyManual(cur, { resetTheme: true }); const tpl = userBrand(req.user, d.brandId).template;
        if (tpl && k.withBrand) reset = k.withBrand(reset, tpl, { force: true });
        const next = k.validate(reset).spec;
        if (JSON.stringify(next) !== JSON.stringify(cur)) addVersion(d, next, { note: `Applied the brand kit "${userBrand(req.user, d.brandId).name}"`, by: 'user', summary: k.summary(next) });
      }
      save();
    }
    const { n, spec } = version(d);
    res.json(await view(req.user, d, n, spec));
  }));
  app.delete('/api/docs/:id', requireUser, wrap(async (req, res) => { deleteDoc(find(req)); res.json({ ok: true }); }));

  mountPdfTools(app, { requireUser, wrap });

  // ---------- brand kits ----------
  const brand = (req) => { const b = userBrand(req.user, req.params.id); if (!b) throw new UserError('Brand kit not found.', 404); return b; };
  app.get('/api/brands', requireUser, (req, res) => res.json({ brands: userBrands(req.user).map(brandView) }));
  app.post('/api/brands', requireUser, wrap(async (req, res) => res.json({ brand: brandView(createBrand(req.user, req.body || {})) })));
  // Format cloning: a brand kit from the look of an uploaded file or of a Docs Studio document.
  app.post('/api/brands/clone', requireUser, wrap(async (req, res) => { const r = await cloneBrand(req.user, { fileId: req.body?.fileId, docId: req.body?.docId, name: req.body?.name }); res.json({ brand: brandView(r.brand), notes: r.notes }); }));
  app.patch('/api/brands/:id', requireUser, wrap(async (req, res) => res.json({ brand: brandView(updateBrand(req.user, brand(req), req.body || {})) })));
  app.delete('/api/brands/:id', requireUser, wrap(async (req, res) => { deleteBrand(req.user, brand(req)); res.json({ ok: true }); }));
}
