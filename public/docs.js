// Docs Studio: documents built in the chat (Word, spreadsheets, PDF, slides), shown in a panel
// beside the conversation with a live preview, version history, edits by prompt and by hand.
import { h, $, $$, icon, S, api, toast, errToast, popover, closePop, dialog, field, pickFiles, uploadFiles, downloadBlob } from './app.js';
import { gridPreview } from './docs-sheet.js';
import { pagesPreview, pagesEditor, openPdfTools } from './docs-pdf.js';
import { slidesEditor } from './docs-slides.js';

export const D = {
  target: null, // the document the next message edits: { id, title, kind, conversationId }
  panel: null,  // the open panel: { id, doc, v, data, mode }
  kind: null,   // a type picked in the composer for the next message
  template: null, // a ready-made template picked for the next message: { id, label }
  brands: null,
};
const KIND_UI = {
  word: { color: '#2b579a', letter: 'W', icon: 'doc', verb: 'Write' },
  sheet: { color: '#1d6f42', letter: 'X', icon: 'sheet', verb: 'Build' },
  pdf: { color: '#c8372d', letter: 'PDF', icon: 'pdf', verb: 'Design' },
  slides: { color: '#c55a28', letter: 'P', icon: 'slides', verb: 'Create' },
};
const kinds = () => S.config?.docKinds || [];
const kindOf = (kid) => kinds().find((k) => k.id === kid);
const ui = (kid) => KIND_UI[kid] || KIND_UI.word;
const wide = () => !matchMedia('(max-width: 1000px)').matches;
const ago = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
const badge = (kid, cls = '') => h('div', { class: 'doc-badge ' + cls, style: { background: ui(kid).color } }, ui(kid).letter);

// ---------- composer ----------
export function composerChips() {
  const wrap = h('span', { class: 'doc-chips' });
  if (!kinds().length) return wrap;
  const t = D.target && S.conv?.id === D.target.conversationId ? D.target : null;
  if (t) {
    wrap.append(h('span', { class: 'chipbtn on doc-target', title: `Your next message changes "${t.title}". Press × to chat without changing it.` },
      h('button', { class: 'in', onclick: () => openPanel(t.id) }, badge(t.kind, 'xs'), h('span', { class: 'nm' }, t.title)),
      h('button', { class: 'x', title: 'Stop editing this document', onclick: () => { D.target = null; refreshComposer(); } }, icon('x'))));
  } else if (D.kind) {
    const k = kindOf(D.kind);
    wrap.append(h('span', { class: 'chipbtn on doc-target', title: `Your next message creates a ${k.label}.` },
      h('button', { class: 'in', onclick: (e) => openKindMenu(e.currentTarget) }, badge(k.id, 'xs'), h('span', { class: 'nm' }, D.template ? D.template.label : 'New ' + k.label.toLowerCase())),
      h('button', { class: 'x', title: 'Cancel', onclick: () => { D.kind = null; D.template = null; refreshComposer(); } }, icon('x'))));
  } else {
    wrap.append(h('button', { class: 'chipbtn', title: 'Create a document in the chat', onclick: (e) => openKindMenu(e.currentTarget) }, icon('doc'), h('span', { class: 'nm' }, 'Create')));
  }
  return wrap;
}
export function refreshComposer() {
  $('#composer .doc-chips')?.replaceWith(composerChips());
  const ta = $('#prompt'); if (!ta) return;
  const t = D.target && S.conv?.id === D.target.conversationId ? D.target : null;
  if (t) ta.placeholder = `Describe a change to "${t.title.slice(0, 40)}"`;
  else if (D.kind) ta.placeholder = `Describe the ${kindOf(D.kind).label.toLowerCase()} you want`;
  else if (ta.dataset.ph) ta.placeholder = ta.dataset.ph;
}
function openKindMenu(anchor) {
  popover(anchor, h('div', { class: 'menu', style: { minWidth: '250px' } },
    h('div', { class: 'menu-cap' }, 'Create in Docs Studio'),
    kinds().map((k) => h('button', { onclick: () => { closePop(); D.kind = k.id; D.template = null; D.target = null; refreshComposer(); $('#prompt')?.focus(); } },
      badge(k.id, 'sm'), h('span', {}, k.label, h('small', { class: 'sub' }, k.imports?.length ? `.${k.ext} from a prompt, or attach ${k.imports.includes('csv') ? `a ${k.imports[0]} or csv file` : `a .${k.imports[0]} to edit`}` : `.${k.ext} with live preview and versions`)), D.kind === k.id && !D.template && icon('check', 'chk'))),
    kinds().filter((k) => k.templates?.length).map((k) => [
      h('div', { class: 'menu-cap' }, k.label + ' templates'),
      k.templates.map((t) => h('button', { onclick: () => { closePop(); pickTemplate(k, t); } }, badge(k.id, 'sm'), h('span', {}, t.label, h('small', { class: 'sub' }, t.sub)), D.template?.id === t.id && icon('check', 'chk'))),
    ]),
    h('hr'),
    h('button', { onclick: () => { closePop(); openPdfTools({ conversationId: S.conv?.id || null, onDoc: (d) => openPanel(d.id) }); } }, icon('pdf'), h('span', {}, 'PDF tools', h('small', { class: 'sub' }, 'Merge, split, sign, fill, OCR, convert'))),
    h('button', { onclick: () => { closePop(); openBrandManager(); } }, icon('palette'), 'Brand kits'),
    h('a', { href: '#/help/docs-studio', onclick: closePop }, icon('help'), 'How Docs Studio works'),
  ), 'above');
}
// A template opens at once; anything typed after the suggested sentence tailors it.
function pickTemplate(k, t) {
  D.kind = k.id; D.template = { id: t.id, label: t.label }; D.target = null;
  refreshComposer();
  const ta = $('#prompt'); if (!ta) return;
  ta.value = `Start from the ${t.label} template`; ta.dispatchEvent(new Event('input')); ta.focus();
  ta.placeholder = 'Press Enter to open it, or add details first (who it is for and what it should say)';
}
// What the chat request says about documents, and what happens after it is sent.
export function requestTarget() {
  const t = D.target && S.conv?.id === D.target.conversationId ? D.target : null;
  return t ? { id: t.id } : D.kind ? { kind: D.kind, template: D.template?.id } : undefined;
}
export function sent() { if (D.kind) { D.kind = null; D.template = null; refreshComposer(); } }

// ---------- while a document is being built ----------
export function buildStatus(wrap, text) {
  let card = wrap.querySelector('.doc-build');
  if (!card) {
    const t0 = Date.now();
    const clock = h('small', { class: 'clock' }, '0s');
    card = h('div', { class: 'doc-build' }, h('span', { class: 'spin' }), h('div', {}, h('b', {}, ''), h('small', {}, 'Scenly plans the file, checks it and builds it. Long files are written in parts.')), clock);
    card._t = setInterval(() => { if (!card.isConnected) return clearInterval(card._t); clock.textContent = Math.round((Date.now() - t0) / 1000) + 's'; }, 1000);
    wrap.classList.remove('cursor');
    wrap.replaceChildren(card);
  }
  card.querySelector('b').textContent = text;
}

export function docCard(msg) {
  const d = msg.doc, k = kindOf(d.kind);
  if (!k) return h('div', { class: 'gen-note' }, 'This document type is not available in this version of Scenly.');
  const card = h('div', { class: 'art-card doc-card' },
    badge(d.kind),
    h('div', { class: 'art-txt' }, h('b', {}, d.title), h('small', {}, [k.label, 'v' + d.v, d.summary].filter(Boolean).join(' · '))),
    h('button', { class: 'btn sm primary', onclick: () => openPanel(d.id, d.v) }, icon('eye'), 'Open'),
    d.format === 'pdf' ? h('a', { class: 'btn sm', title: 'Download as PDF', href: `/api/docs/${d.id}/file?v=${d.v}&format=pdf`, download: '' }, icon('dl'), 'PDF') : null,
    h('a', { class: 'icon-btn sm', title: `Download .${k.ext}`, href: `/api/docs/${d.id}/file?v=${d.v}`, download: '' }, icon('dl')),
  );
  const out = [card];
  if (d.action === 'edited' && d.notes?.length) out.push(h('ul', { class: 'doc-notes' }, d.notes.map((n) => h('li', {}, n))));
  if (d.warnings?.length) out.push(h('div', { class: 'gen-note' }, d.warnings.join(' ')));
  return out;
}

// Called when a reply that made or changed a document arrives.
export function afterDocReply(data) {
  const d = data.message?.doc; if (!d) return;
  D.target = { id: d.id, title: d.title, kind: d.kind, conversationId: S.conv?.id };
  refreshComposer();
  if (wide() || D.panel) openPanel(d.id); else toast(`${kindOf(d.kind)?.label || 'Document'} ready. Tap Open to see it.`);
}
// Called whenever the chat page is drawn: keeps the panel and the edit target with their conversation.
export function onChatRendered() {
  const cid = S.conv?.id;
  if (D.target && D.target.conversationId !== cid) D.target = null;
  if (D.panel && D.panel.doc.conversationId !== cid) D.panel = null;
  if (!D.target && cid) {
    const last = S.conv.messages?.findLast?.((m) => m.doc && kindOf(m.doc.kind));
    if (last) D.target = { id: last.doc.id, title: last.doc.title, kind: last.doc.kind, conversationId: cid };
  }
  refreshComposer();
  if (D.panel && wide()) drawPanel();
}
export function onCanvasClosed() { D.panel = null; }

// ---------- the studio panel ----------
export async function openPanel(id, v) {
  if (!$('.chat')) return;
  try {
    const data = await api(`/api/docs/${id}${v ? '?v=' + v : ''}`);
    D.panel = { id, doc: data.doc, v: data.v, data, mode: 'preview', wide: D.panel?.wide, grid: D.panel?.id === id ? D.panel.grid : undefined };
    D.target = { id, title: data.doc.title, kind: data.doc.kind, conversationId: data.doc.conversationId };
    refreshComposer();
    drawPanel();
  } catch (e) { errToast(e); }
}
function setData(data) {
  Object.assign(D.panel, { doc: data.doc, v: data.v, data });
  if (D.target?.id === data.doc.id) { D.target.title = data.doc.title; refreshComposer(); }
  drawPanel();
}
const prevOf = (doc) => { const cur = doc.versions.find((x) => x.n === doc.current); const b = cur?.base ?? doc.current - 1; return doc.versions.some((x) => x.n === b) ? b : null; };
const nextOf = (doc) => { const kids = doc.versions.filter((x) => (x.base ?? x.n - 1) === doc.current && x.n !== doc.current); return kids.length ? kids.at(-1).n : null; };
async function moveTo(n, msg) {
  try { setData(await api(`/api/docs/${D.panel.id}/current`, { method: 'POST', body: { v: n } })); if (msg) toast(msg); } catch (e) { errToast(e); }
}

function drawPanel() {
  const host = $('.chat'); const P = D.panel; if (!host || !P) return;
  const keepScroll = scrollOf($('.canvas.studio'));
  $('.canvas')?.remove();
  const { doc, data } = P; const k = kindOf(doc.kind);
  const isCurrent = P.v === doc.current;
  const ver = doc.versions.find((x) => x.n === P.v);
  const prev = prevOf(doc), next = nextOf(doc);
  const body = h('div', { class: 'canvas-body studio-body' });
  const panel = h('aside', { class: 'canvas studio' + (P.wide ? ' wide' : ''), 'data-kind': doc.kind },
    h('div', { class: 'canvas-head' },
      badge(doc.kind, 'sm'),
      h('button', { class: 'studio-title', title: 'Rename', onclick: rename }, doc.title),
      h('button', { class: 'chipbtn ver', title: 'Version history', onclick: (e) => openHistory(e.currentTarget) }, icon('history'), 'v' + P.v, icon('down')),
      h('button', { class: 'icon-btn sm', title: 'Undo: go back one version', disabled: !isCurrent || prev == null, onclick: () => moveTo(prev, 'Went back to version ' + prev) }, icon('undo')),
      h('button', { class: 'icon-btn sm', title: 'Redo', disabled: !isCurrent || next == null, onclick: () => moveTo(next, 'Back on version ' + next) }, icon('redo')),
      h('span', { class: 'grow' }),
      data.source && h('button', { class: 'icon-btn sm' + (P.mode === 'edit' ? ' on' : ''), title: P.mode === 'edit' ? 'Back to the preview' : 'Edit by hand', disabled: !isCurrent, onclick: () => { P.mode = P.mode === 'edit' ? 'preview' : 'edit'; drawPanel(); } }, icon(P.mode === 'edit' ? 'eye' : 'edit')),
      h('button', { class: 'icon-btn sm', title: 'Brand kit: colours, fonts and logo', onclick: (e) => openBrandMenu(e.currentTarget) }, icon('palette')),
      h('button', { class: 'btn sm primary dl', onclick: (e) => openDownload(e.currentTarget) }, icon('dl'), h('span', {}, 'Download')),
      h('button', { class: 'icon-btn sm', title: 'Full width', onclick: () => { P.wide = !P.wide; panel.classList.toggle('wide'); } }, icon('expand')),
      h('button', { class: 'icon-btn sm', title: 'Close', onclick: closePanel }, icon('x')),
    ),
    !isCurrent && h('div', { class: 'studio-banner' }, icon('history'), h('span', {}, `You are looking at version ${P.v}${ver ? ', ' + ago(ver.createdAt) : ''}. New changes apply to version ${doc.current}.`), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: () => openPanel(doc.id) }, 'Back to latest'),
      h('button', { class: 'btn sm primary', onclick: () => moveTo(P.v, 'Version ' + P.v + ' restored') }, 'Restore this version')),
    body,
    isCurrent && P.mode !== 'edit' && k?.suggestions?.length ? h('div', { class: 'studio-foot' }, h('span', { class: 'lead' }, icon('wand'), 'Try'), k.suggestions.map((s) => h('button', { class: 'chipbtn', onclick: () => { const ta = $('#prompt'); if (!ta) return; ta.value = s; ta.dispatchEvent(new Event('input')); ta.focus(); if (!wide()) closePanel(); } }, s))) : null,
  );
  if (P.mode === 'edit' && data.source) body.append(sourceEditor(data.source));
  else body.append(previewNode(data.preview, keepScroll));
  host.append(panel); host.classList.add('canvas-open');
}
function closePanel() { $('.canvas')?.remove(); $('.chat')?.classList.remove('canvas-open'); D.panel = null; }

// Per-type previews register here; each returns a DOM node for the panel body.
export const PREVIEWS = {
  html(pv, keep) {
    // No scripts run in this frame. allow-same-origin only lets the panel restore the scroll position.
    const f = h('iframe', { class: 'pv-frame', title: 'Document preview', sandbox: 'allow-same-origin', srcdoc: pv.html });
    if (keep?.top) f.addEventListener('load', () => { try { f.contentWindow.scrollTo(0, keep.top); } catch {} });
    return f;
  },
};
// Spreadsheets: a grid that can be edited cell by cell. Each change is saved as a new version.
PREVIEWS.grid = (pv) => {
  const P = D.panel;
  P.grid ||= {};
  return gridPreview(pv, { state: P.grid, docId: P.id, v: P.v, canEdit: P.v === P.doc.current,
    save: async (change, note) => { const data = await api(`/api/docs/${P.id}/manual`, { method: 'POST', body: { change, note } }); setData(data); } });
};
PREVIEWS.pages = (pv, keep) => pagesPreview(pv, keep);
function previewNode(pv, keep) { return (PREVIEWS[pv?.type] || (() => h('div', { class: 'empty' }, 'No preview for this document type yet.')))(pv, keep); }
function scrollOf(panel) {
  const f = panel?.querySelector('iframe.pv-frame');
  try { return f ? { top: f.contentWindow.scrollY } : null; } catch { return null; }
}

// Editing by hand. Text documents are edited as Markdown; other types add their own editors.
export const EDITORS = {
  markdown(src) {
    const ta = h('textarea', { class: 'studio-src', spellcheck: 'true' }); ta.value = src.text;
    const save = h('button', { class: 'btn sm primary', onclick: async () => {
      if (ta.value === src.text) { D.panel.mode = 'preview'; return drawPanel(); }
      save.disabled = true;
      try { const data = await api(`/api/docs/${D.panel.id}/manual`, { method: 'POST', body: { change: { body: ta.value } } }); D.panel.mode = 'preview'; setData(data); toast('Saved as version ' + data.v); }
      catch (e) { errToast(e); save.disabled = false; }
    } }, icon('check'), 'Save as new version');
    return h('div', { class: 'studio-edit' },
      h('div', { class: 'studio-edit-bar' }, h('span', {}, 'Editing the text by hand. Headings start with #, lists with -, tables use | bars, fields are {{Name}}.'), h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: () => { D.panel.mode = 'preview'; drawPanel(); } }, 'Cancel'), save),
      ta);
  },
};
EDITORS.pages = (src) => pagesEditor(src, { preview: D.panel.data.preview,
  done: () => { D.panel.mode = 'preview'; drawPanel(); },
  save: async (change, note) => { const data = await api(`/api/docs/${D.panel.id}/manual`, { method: 'POST', body: { change, note } }); D.panel.mode = 'preview'; setData(data); toast('Saved as version ' + data.v); } });
EDITORS.slides = (src) => slidesEditor(src, {
  done: () => { D.panel.mode = 'preview'; drawPanel(); },
  save: async (change, note) => { const data = await api(`/api/docs/${D.panel.id}/manual`, { method: 'POST', body: { change, note } }); D.panel.mode = 'preview'; setData(data); toast('Saved as version ' + data.v); } });
function sourceEditor(src) { return (EDITORS[src.type] || (() => h('div', { class: 'empty' }, 'This document type cannot be edited by hand yet.')))(src); }

async function rename() {
  const P = D.panel; if (!P || P.v !== P.doc.current) return toast('Go back to the latest version to rename it.');
  const t = prompt('Rename this document', P.doc.title);
  if (!t || !t.trim() || t.trim() === P.doc.title) return;
  try { setData(await api(`/api/docs/${P.id}/manual`, { method: 'POST', body: { change: { title: t.trim() }, note: 'Renamed' } })); } catch (e) { errToast(e); }
}

function openHistory(anchor) {
  const P = D.panel; const { doc } = P;
  const who = (x) => (x.by === 'user' ? 'You' : x.by === 'upload' ? 'Uploaded file' : 'Scenly');
  popover(anchor, h('div', { class: 'menu ver-menu' },
    h('div', { class: 'menu-cap' }, `Version history · ${doc.versions.length} version${doc.versions.length > 1 ? 's' : ''}`),
    [...doc.versions].reverse().map((x) => h('button', { class: x.n === P.v ? 'sel' : '', onclick: () => { closePop(); openPanel(doc.id, x.n); } },
      h('span', { class: 'vn' }, 'v' + x.n),
      h('span', { class: 'vt' }, h('span', { class: 'clip1' }, x.note || 'Edited'), h('small', {}, `${who(x)} · ${ago(x.createdAt)}${x.summary ? ' · ' + x.summary : ''}`)),
      x.n === doc.current && h('span', { class: 'tag new' }, 'Current'))),
    h('div', { class: 'ver-hint' }, 'Every change is kept. Open an older version to restore it.'),
  ));
}

function openDownload(anchor) {
  const P = D.panel; const k = kindOf(P.doc.kind);
  const href = (f, extra = '') => `/api/docs/${P.id}/file?v=${P.v}&format=${f.id}${P.grid?.sheet ? '&sheet=' + encodeURIComponent(P.grid.sheet) : ''}${extra}`;
  // Tracked changes compare this version with the one before it, or with the very first one.
  const me = P.doc.versions.find((x) => x.n === P.v); const before = me?.base ?? P.v - 1;
  const hasBefore = P.doc.versions.some((x) => x.n === before && x.n !== P.v);
  const first = P.doc.versions[0]?.n;
  popover(anchor, h('div', { class: 'menu', style: { minWidth: '260px' } },
    h('div', { class: 'menu-cap' }, 'Download version ' + P.v),
    k.formats.map((f) => (f.compare
      ? (hasBefore ? [
        h('a', { href: href(f, '&against=' + before), download: '', onclick: () => closePop() }, icon('swap'), h('span', {}, f.label, h('small', { class: 'sub' }, `Changes since version ${before}. Accept or reject them in Word`))),
        first != null && first !== before && first !== P.v ? h('a', { href: href(f, '&against=' + first), download: '', onclick: () => closePop() }, icon('swap'), h('span', {}, f.label, h('small', { class: 'sub' }, `Everything changed since version ${first}${P.doc.versions[0].by === 'upload' ? ', your uploaded file' : ''}`))) : null,
      ] : null)
      : h('a', { href: href(f), download: '', onclick: () => closePop() }, icon(f.id === 'html' ? 'globe' : 'dl'), h('span', {}, f.label, h('small', { class: 'sub' }, f.sub))))),
    k.merge && [h('hr'), h('button', { onclick: () => { closePop(); openMerge(); } }, icon('layers'), h('span', {}, 'Mail merge', h('small', { class: 'sub' }, 'One copy per row of a spreadsheet')))],
    P.doc.kind === 'pdf' && [h('hr'), h('button', { onclick: () => { closePop(); openPdfTools({ docId: P.id, title: P.doc.title, conversationId: P.doc.conversationId, onDoc: (d) => openPanel(d.id) }); } }, icon('sliders'), h('span', {}, 'PDF tools', h('small', { class: 'sub' }, 'Merge, split, sign, watermark, compress, convert')))],
  ));
}

// Mail merge: {{Field}} placeholders in the document are filled from the rows of a spreadsheet.
async function openMerge() {
  const P = D.panel; const base = `/api/docs/${P.id}/merge`;
  const st = { src: null, sheet: '', info: null, mode: 'one', nameField: '' };
  const box = h('div', { class: 'merge' });
  const go = h('button', { class: 'btn primary', disabled: true }, icon('dl'), 'Merge');
  const qs = () => (st.src ? `&${st.src.docId ? 'docId=' + st.src.docId : 'fileId=' + st.src.fileId}${st.sheet ? '&sheet=' + encodeURIComponent(st.sheet) : ''}` : '');
  const load = async () => {
    box.classList.add('busy');
    try { st.info = await api(`${base}?v=${P.v}${qs()}`); } catch (e) { errToast(e); st.src = null; try { st.info = await api(`${base}?v=${P.v}`); } catch { /* keep the old view */ } }
    box.classList.remove('busy'); draw();
  };
  const norm = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const upload = () => pickFiles('.xlsx,.xlsm,.csv,.tsv', false, async (files) => { try { const got = await uploadFiles(files); if (got[0]) { st.src = { fileId: got[0].id, name: got[0].name }; st.sheet = ''; await load(); } } catch (e) { errToast(e); } });
  const draw = () => {
    const info = st.info; if (!info) return;
    const data = info.data; const cols = new Set((data?.columns || []).map(norm));
    const missing = data ? info.fields.filter((f) => !cols.has(norm(f))) : [];
    if (data && !st.nameField) st.nameField = data.columns.find((c) => /name|company|client|customer/i.test(c)) || data.columns[0] || '';
    go.disabled = !data?.count || !info.fields.length;
    go.lastChild.textContent = data?.count ? `Merge ${data.count} document${data.count > 1 ? 's' : ''}` : 'Merge';
    box.replaceChildren(...[
      h('div', { class: 'field' }, h('div', { class: 'lab' }, 'Fields in this document'),
        info.fields.length
          ? h('div', { class: 'merge-fields' }, info.fields.map((f) => h('span', { class: 'tag' + (data ? (cols.has(norm(f)) ? ' ok' : ' miss') : '') }, f, data ? (cols.has(norm(f)) ? icon('check') : ' · no column') : null)))
          : h('div', { class: 'gen-note' }, 'This document has no fields yet. Write them as {{Name}} or {{Company}} where each value should go, or ask in the chat: "Turn this into a mail-merge letter with Name, Company and Address fields".')),
      h('div', { class: 'field' }, h('div', { class: 'lab' }, 'Data: one row per copy'),
        h('div', { class: 'merge-src' },
          info.sources.map((x) => h('button', { class: 'chipbtn' + (st.src?.docId === x.id ? ' on' : ''), onclick: () => { st.src = { docId: x.id, name: x.title }; st.sheet = ''; load(); } }, icon('sheet'), h('span', { class: 'nm' }, x.title))),
          st.src?.fileId && h('span', { class: 'chipbtn on' }, icon('sheet'), h('span', { class: 'nm' }, st.src.name)),
          h('button', { class: 'chipbtn', onclick: upload }, icon('upload'), h('span', { class: 'nm' }, 'Upload Excel or CSV'))),
        !info.sources.length && !st.src && h('small', { class: 'hint' }, 'The first row of the sheet holds the column names. They are matched to the fields by name.')),
      data?.sheets?.length > 1 && field('Sheet', h('select', { onchange: (e) => { st.sheet = e.target.value; load(); } }, data.sheets.map((n) => h('option', { value: n, selected: n === data.sheet }, n)))),
      data && h('div', { class: 'merge-data' },
        data.count ? h('table', {}, h('thead', {}, h('tr', {}, data.columns.slice(0, 6).map((c) => h('th', {}, c)))), h('tbody', {}, data.sample.map((r) => h('tr', {}, data.columns.slice(0, 6).map((c) => h('td', {}, String(r[c] ?? ''))))))) : h('div', { class: 'gen-note' }, 'No rows were found in this sheet.'),
        data.count ? h('small', { class: 'hint' }, `${data.count} row${data.count > 1 ? 's' : ''}${data.count >= 500 ? ' (the first 500 are merged)' : ''}${data.columns.length > 6 ? `, ${data.columns.length} columns` : ''}.${missing.length ? ` No column matches ${missing.map((m) => '"' + m + '"').join(', ')}, so ${missing.length > 1 ? 'those fields stay' : 'that field stays'} as written.` : ''}`) : null),
      data?.count ? h('div', { class: 'field' }, h('div', { class: 'lab' }, 'Result'),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'mm', checked: st.mode === 'one', onchange: () => { st.mode = 'one'; draw(); } }), 'One Word file, each copy on a new page'),
        h('label', { class: 'check' }, h('input', { type: 'radio', name: 'mm', checked: st.mode === 'zip', onchange: () => { st.mode = 'zip'; draw(); } }), 'A separate Word file for each row (.zip)'),
        st.mode === 'zip' && h('div', { class: 'merge-name' }, h('span', {}, 'Name each file after'), h('select', { onchange: (e) => { st.nameField = e.target.value; } }, data.columns.map((c) => h('option', { value: c, selected: c === st.nameField }, c))))) : null,
    ].filter(Boolean));
  };
  go.onclick = async () => {
    go.disabled = true; const label = go.lastChild.textContent; go.lastChild.textContent = 'Merging…';
    try {
      const res = await fetch(base, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: P.v, ...st.src, sheet: st.sheet, mode: st.mode, nameField: st.nameField }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The merge failed.');
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'merged.docx';
      downloadBlob(await res.blob(), name); toast('Merged file downloaded'); bg.remove();
    } catch (e) { errToast(e); go.disabled = false; go.lastChild.textContent = label; }
  };
  const bg = dialog({ title: 'Mail merge', sub: `Makes one copy of "${P.doc.title}" for every row of a spreadsheet.`, wide: true, body: [box], foot: [h('button', { class: 'btn ghost', onclick: () => bg.remove() }, 'Cancel'), go] });
  await load();
  // A single spreadsheet in this chat is the obvious choice.
  if (st.info?.sources.length === 1 && st.info.fields.length) { st.src = { docId: st.info.sources[0].id, name: st.info.sources[0].title }; load(); }
}

// ---------- brand kits ----------
export async function loadBrands(force) {
  if (!D.brands || force) { try { D.brands = (await api('/api/brands')).brands; } catch { D.brands = []; } }
  return D.brands;
}
const swatches = (b) => h('span', { class: 'swatches' }, ['primary', 'accent', 'text'].map((c) => h('i', { style: { background: b.colors[c] } })));
async function openBrandMenu(anchor) {
  const P = D.panel; const brands = await loadBrands();
  // doc.brandId: an id, null for "none", undefined for "follow my default kit".
  const active = P.doc.brandId === null ? null : P.doc.brandId || brands.find((b) => b.isDefault)?.id || null;
  const pick = async (bid) => { closePop(); try { setData(await api(`/api/docs/${P.id}`, { method: 'PATCH', body: { brandId: bid } })); toast(bid ? 'Brand kit applied' : 'Brand kit removed'); } catch (e) { errToast(e); } };
  popover(anchor, h('div', { class: 'menu', style: { minWidth: '260px' } },
    h('div', { class: 'menu-cap' }, 'Brand kit for this document'),
    h('button', { onclick: () => pick(null) }, icon('x'), 'No brand kit', active == null && icon('check', 'chk')),
    brands.map((b) => h('button', { onclick: () => pick(b.id) }, swatches(b), h('span', { class: 'clip1' }, b.name), b.isDefault && h('span', { class: 'tag dim' }, 'Default'), active === b.id && icon('check', 'chk'))),
    h('hr'),
    h('button', { onclick: () => { closePop(); openBrandDialog(null, (b) => b && pick(b.id)); } }, icon('plus'), 'New brand kit'),
    h('button', { title: 'Reads the colours, fonts, logo and page setup of a Word, Excel, PowerPoint or PDF file', onclick: () => { closePop(); cloneBrandFromFile((b) => pick(b.id)); } }, icon('upload'), 'Copy the look of a file…'),
    h('button', { title: 'Keeps the look of this document as a brand kit for other documents', onclick: () => { closePop(); cloneBrand({ docId: P.id }); } }, icon('copy'), 'Save this look as a brand kit'),
    brands.length > 0 && h('button', { onclick: () => { closePop(); openBrandManager(); } }, icon('sliders'), 'Manage brand kits'),
  ));
}
// Format cloning: a brand kit made from the look of a file or of the open document.
const KIND_LOOK = { word: 'Word page setup, header and footer', sheet: 'spreadsheet header colours and banding', slides: 'slide backgrounds, artwork and title positions', pdf: 'PDF page size' };
async function cloneBrand(body, done) {
  const t = toast('Reading the look…');
  try {
    const r = await api('/api/brands/clone', { method: 'POST', body }); await loadBrands(true); t?.remove?.();
    const bg = dialog({ title: `Brand kit "${r.brand.name}" saved`, sub: 'Every document type can now follow this look.', body: [
      h('div', { class: 'clone-res' }, r.brand.logoFileId && h('img', { class: 'lg', src: `/api/files/${r.brand.logoFileId}/raw`, alt: '' }), swatches(r.brand), h('span', {}, `${r.brand.fonts.heading}${r.brand.fonts.body !== r.brand.fonts.heading ? ' / ' + r.brand.fonts.body : ''}`)),
      h('ul', { class: 'clone-notes' }, r.notes.map((n) => h('li', {}, n)))],
      foot: [h('button', { class: 'btn ghost', onclick: () => { bg.remove(); openBrandDialog(r.brand, () => {}); } }, icon('edit'), 'Review and edit'), h('button', { class: 'btn primary', onclick: () => bg.remove() }, 'Done')] });
    await done?.(r.brand);
    return r.brand;
  } catch (e) { t?.remove?.(); errToast(e); }
}
export function cloneBrandFromFile(done) {
  pickFiles('.docx,.xlsx,.xlsm,.pptx,.pdf', false, async (files) => { try { const got = await uploadFiles(files); if (got[0]) await cloneBrand({ fileId: got[0].id }, done); } catch (e) { errToast(e); } });
}
export async function openBrandManager() {
  const list = h('div', { class: 'brand-list' });
  const draw = async () => {
    const brands = await loadBrands(true);
    list.replaceChildren(...brands.map((b) => h('button', { class: 'brand-row', onclick: () => openBrandDialog(b, draw) },
      b.logoFileId ? h('img', { class: 'lg', src: `/api/files/${b.logoFileId}/raw`, alt: '' }) : h('span', { class: 'lg none' }, (b.name[0] || 'B').toUpperCase()),
      h('span', { class: 'grow' }, h('b', {}, b.name, b.isDefault && h('span', { class: 'tag dim' }, 'Default')), h('small', {}, `${b.fonts.heading}${b.fonts.body !== b.fonts.heading ? ' / ' + b.fonts.body : ''}${b.company ? ' · ' + b.company : ''}${b.sourceFile ? ' · from ' + b.sourceFile : ''}`)),
      swatches(b), icon('edit'))));
    if (!brands.length) list.append(h('div', { class: 'empty' }, 'No brand kits yet. A brand kit holds your colours, fonts, logo and company details, and every document you create can follow it. Use "From a file" to copy the look of a Word, Excel, PowerPoint or PDF file you already have.'));
  };
  const bg = dialog({ title: 'Brand kits', sub: 'Colours, fonts, logo and company details that your documents follow.', body: [list], foot: [h('button', { class: 'btn ghost', onclick: () => bg.remove() }, 'Close'), h('button', { class: 'btn', title: 'Reads the colours, fonts, logo and page setup of a Word, Excel, PowerPoint or PDF file', onclick: () => cloneBrandFromFile(draw) }, icon('upload'), 'From a file'), h('button', { class: 'btn primary', onclick: () => openBrandDialog(null, draw) }, icon('plus'), 'New brand kit')] });
  draw();
}
function openBrandDialog(b, done) {
  const fonts = [...new Set([...(S.config?.docFonts || ['Calibri', 'Arial']), b?.fonts?.heading, b?.fonts?.body].filter(Boolean))];
  const text = (v, ph, max = 120) => h('input', { type: 'text', value: v || '', placeholder: ph, maxlength: max });
  const name = text(b?.name, 'Acme Ltd, Personal, Client X…', 60);
  const col = (key, label) => {
    const v = b?.colors?.[key] || { primary: '#1F3A5F', accent: '#2E75B6', text: '#1A1A22' }[key];
    const pick = h('input', { type: 'color', value: v }); const hex = h('input', { type: 'text', value: v, maxlength: 7, class: 'hex' });
    pick.oninput = () => { hex.value = pick.value.toUpperCase(); }; hex.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) pick.value = hex.value; };
    return { key, el: h('label', { class: 'col' }, h('span', {}, label), h('span', { class: 'col-in' }, pick, hex)), get: () => hex.value };
  };
  const cols = [col('primary', 'Primary (headings)'), col('accent', 'Accent (lines, tables)'), col('text', 'Body text')];
  const sel = (v) => { const s = h('select', {}, fonts.map((f) => h('option', { value: f, selected: f === v }, f))); return s; };
  const hfont = sel(b?.fonts?.heading || 'Calibri'), bfont = sel(b?.fonts?.body || 'Calibri');
  let logoId = b?.logoFileId || null;
  const logoBox = h('div', { class: 'logo-pick' });
  const drawLogo = () => logoBox.replaceChildren(...[
    logoId ? h('img', { src: `/api/files/${logoId}/raw`, alt: 'Logo' }) : h('span', { class: 'none' }, 'No logo'),
    h('button', { class: 'btn sm', onclick: () => pickFiles('image/png,image/jpeg', false, async (files) => { try { const got = await uploadFiles(files); if (got[0]?.kind === 'image') { logoId = got[0].id; drawLogo(); } } catch (e) { errToast(e); } }) }, icon('upload'), logoId ? 'Replace' : 'Upload logo'),
    logoId && h('button', { class: 'btn sm ghost', onclick: () => { logoId = null; drawLogo(); } }, 'Remove')].filter(Boolean));
  drawLogo();
  const company = text(b?.company, 'Company name'), tagline = text(b?.tagline, 'Tagline (optional)');
  const address = text(b?.address, 'Street, city, country', 300), phone = text(b?.phone, 'Phone'), email = text(b?.email, 'Email'), website = text(b?.website, 'Website');
  const footer = text(b?.footer, 'Footer line, e.g. Confidential · Acme Ltd · Reg. no. 12345', 300);
  const def = h('input', { type: 'checkbox', checked: b ? b.isDefault : !(D.brands || []).length });
  const save = h('button', { class: 'btn primary', onclick: async () => {
    if (!name.value.trim()) return name.focus();
    save.disabled = true;
    const body = { name: name.value, colors: Object.fromEntries(cols.map((c) => [c.key, c.get()])), fonts: { heading: hfont.value, body: bfont.value }, logoFileId: logoId, company: company.value, tagline: tagline.value, address: address.value, phone: phone.value, email: email.value, website: website.value, footer: footer.value, isDefault: def.checked };
    try {
      const r = b ? await api('/api/brands/' + b.id, { method: 'PATCH', body }) : await api('/api/brands', { method: 'POST', body });
      await loadBrands(true); bg.remove(); toast('Brand kit saved');
      await done?.(r.brand);
      if (D.panel) await openPanel(D.panel.id, D.panel.v);
    } catch (e) { errToast(e); save.disabled = false; }
  } }, b ? 'Save' : 'Create brand kit');
  const del = b && h('button', { class: 'btn ghost', style: { color: 'var(--danger)', marginRight: 'auto' }, onclick: async () => { if (!confirm(`Delete the brand kit "${b.name}"? Documents keep their content.`)) return; try { await api('/api/brands/' + b.id, { method: 'DELETE' }); await loadBrands(true); bg.remove(); await done?.(null); if (D.panel) await openPanel(D.panel.id, D.panel.v); } catch (e) { errToast(e); } } }, icon('trash'), 'Delete');
  const bg = dialog({ title: b ? 'Edit brand kit' : 'New brand kit', sub: 'Documents made in Docs Studio follow this look.', wide: true, body: [
    h('div', { class: 'brand-form' },
      b?.sourceFile && h('div', { class: 'field span2 clone-from' }, icon('copy'), h('span', {}, `Copied from ${b.sourceFile}.${b.templateKinds?.length ? ' It also carries ' + b.templateKinds.map((k) => KIND_LOOK[k]).filter(Boolean).join(', ') + '.' : ''}`)),
      field('Name', name),
      field('Logo', logoBox, 'PNG or JPG. Shown in headers and on cover pages.'),
      h('div', { class: 'field span2' }, h('div', { class: 'lab' }, 'Colours'), h('div', { class: 'cols' }, cols.map((c) => c.el))),
      field('Heading font', hfont), field('Body font', bfont),
      field('Company', company), field('Tagline', tagline),
      h('div', { class: 'field span2' }, h('div', { class: 'lab' }, 'Contact details'), h('div', { class: 'grid3' }, phone, email, website), address),
      h('div', { class: 'field span2' }, h('div', { class: 'lab' }, 'Footer text'), footer),
      h('label', { class: 'check span2' }, def, 'Use this brand kit for every new document'),
    )], foot: [del, h('button', { class: 'btn ghost', onclick: () => bg.remove() }, 'Cancel'), save] });
}
