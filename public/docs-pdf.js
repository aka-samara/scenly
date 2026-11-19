// Designed PDFs in the studio panel: pages scaled to the panel, text that can be edited right on the
// page, and the PDF tools (merge, split, rotate, watermark, compress, forms, sign, OCR, convert).
import { h, $, icon, api, toast, errToast, dialog, field, pickFiles, uploadFiles, downloadBlob, fmtSize } from './app.js';

const MM = 96 / 25.4;
// The page frame is scaled from outside: no script ever runs inside it.
function frame(pv, { keep, onReady } = {}) {
  const f = h('iframe', { class: 'pv-frame pv-pages', title: 'PDF preview', sandbox: 'allow-same-origin', srcdoc: pv.html });
  const fit = () => { try { const root = f.contentDocument?.documentElement; if (!root || !f.clientWidth) return; root.style.zoom = String(Math.min(1.6, Math.max(0.15, (f.clientWidth - 28) / (pv.width * MM)))); } catch { /* frame not ready */ } };
  f.addEventListener('load', () => { fit(); if (keep?.top) { try { f.contentWindow.scrollTo(0, keep.top); } catch {} } onReady?.(f); });
  new ResizeObserver(fit).observe(f);
  return f;
}
export const pagesPreview = (pv, keep) => frame(pv, { keep });

const unb64 = (s) => { try { return decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')))); } catch { return ''; } };
// The HTML of one page as it should be saved: drawn components go back to the tags they came from.
function pageSource(inEl) {
  const c = inEl.cloneNode(true); const srcs = [];
  c.querySelectorAll('.cmp[data-src]').forEach((el) => { const tok = `${srcs.length}`; srcs.push(unb64(el.getAttribute('data-src'))); el.replaceWith(c.ownerDocument.createTextNode(tok)); });
  c.querySelectorAll('img[data-ref]').forEach((el) => { el.setAttribute('src', el.getAttribute('data-ref')); el.removeAttribute('data-ref'); });
  c.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  return c.innerHTML.replace(/(\d+)/g, (_m, i) => srcs[Number(i)] || '').trim();
}

// Editing by hand: click any text on a page and type. The HTML of a page can be edited too.
export function pagesEditor(src, env) {
  const pv = env.preview; let doc = null; const before = new Map(); let htmlMode = false;
  const hint = h('span', {}, 'Click any text on a page and type. Charts, QR codes and pictures stay as they are.');
  const save = h('button', { class: 'btn sm primary' }, icon('check'), 'Save as new version');
  const htmlBtn = h('button', { class: 'btn sm ghost', title: 'Edit the HTML of a page' }, icon('code'), 'HTML');
  const body = h('div', { class: 'pdf-edit-body' });
  const f = frame(pv, { keep: env.keep, onReady: (fr) => {
    doc = fr.contentDocument;
    doc.querySelectorAll('.pg').forEach((pg) => { const inner = pg.querySelector('.pg-in'); if (!inner) return; before.set(pg.getAttribute('data-page'), pageSource(inner)); inner.setAttribute('contenteditable', 'true'); inner.setAttribute('spellcheck', 'true'); });
    const st = doc.createElement('style'); st.textContent = '.pg-in{outline:none;cursor:text}.pg:focus-within{box-shadow:0 0 0 .6mm #2f9df4,0 6px 22px rgba(0,0,0,.12)}.cmp{cursor:default}'; doc.head.append(st);
  } });
  // The HTML view: one page at a time in a text box.
  const sel = h('select', {}, src.pages.map((p, i) => h('option', { value: i }, `${i + 1}. ${p.name}`)));
  const ta = h('textarea', { class: 'studio-src', spellcheck: 'false' });
  const edited = new Map();
  const showHtml = () => { ta.value = edited.get(Number(sel.value)) ?? src.pages[Number(sel.value)].html; };
  ta.oninput = () => edited.set(Number(sel.value), ta.value); sel.onchange = showHtml;
  const draw = () => { body.replaceChildren(htmlMode ? h('div', { class: 'pdf-html' }, h('div', { class: 'pdf-html-bar' }, 'Page', sel), ta) : f); hint.textContent = htmlMode ? 'Editing the HTML of one page at a time.' : 'Click any text on a page and type. Charts, QR codes and pictures stay as they are.'; htmlBtn.classList.toggle('on', htmlMode); if (htmlMode) showHtml(); };
  htmlBtn.onclick = () => { htmlMode = !htmlMode; draw(); };
  save.onclick = async () => {
    const pages = [];
    if (htmlMode) for (const [index, html] of edited) { if (html !== src.pages[index].html) pages.push({ index, html }); }
    else if (doc) doc.querySelectorAll('.pg').forEach((pg) => { const inner = pg.querySelector('.pg-in'); const id = pg.getAttribute('data-page'); if (!inner) return; const now = pageSource(inner); if (now !== before.get(id)) pages.push({ index: Number(id), html: now }); });
    if (!pages.length) return env.done();
    save.disabled = true;
    try { await env.save({ pages }, pages.length > 1 ? `Edited ${pages.length} pages by hand` : `Edited page ${pages[0].index + 1} by hand`); }
    catch (e) { errToast(e); save.disabled = false; }
  };
  draw();
  return h('div', { class: 'studio-edit' }, h('div', { class: 'studio-edit-bar' }, hint, h('span', { class: 'grow' }), htmlBtn, h('button', { class: 'btn sm ghost', onclick: () => env.done() }, 'Cancel'), save), body);
}
// ---------- PDF tools ----------
const TOOLS = [
  { id: 'merge', label: 'Merge', sub: 'Join several PDFs into one', icon: 'layers', many: true },
  { id: 'pages', label: 'Split & organise', sub: 'Extract, remove or reorder pages', icon: 'swap' },
  { id: 'rotate', label: 'Rotate', sub: 'Turn pages the right way up', icon: 'rotate' },
  { id: 'compress', label: 'Compress', sub: 'Make the file smaller', icon: 'down' },
  { id: 'watermark', label: 'Watermark', sub: 'Stamp text across the pages', icon: 'type' },
  { id: 'numbers', label: 'Page numbers', sub: 'Number every page', icon: 'doc' },
  { id: 'fill', label: 'Fill a form', sub: 'Type into the form fields', icon: 'edit' },
  { id: 'sign', label: 'Sign', sub: 'Draw your signature on a page', icon: 'pen' },
  { id: 'ocr', label: 'Read a scan (OCR)', sub: 'Make scanned pages searchable', icon: 'search' },
  { id: 'convert', label: 'Convert', sub: 'To Word, Excel, pictures or text', icon: 'retry' },
];
// source: { docId, title } to work on the PDF open in the panel; otherwise files are uploaded here.
export function openPdfTools({ docId = null, title = '', conversationId = null, tool = null, onDoc = null } = {}) {
  const st = { tool: tool || null, files: [], info: null, busy: false, o: {}, sig: null };
  const useDoc = () => docId && !st.files.length;
  const srcBody = () => (useDoc() ? { docId } : { fileIds: st.files.map((f) => f.id) });
  const srcQuery = () => (useDoc() ? `docId=${docId}` : `fileId=${st.files[0]?.id}`);
  const box = h('div', { class: 'ptools' });
  const go = h('button', { class: 'btn primary', disabled: true }, icon('dl'), 'Download');
  const opt = (k, d) => (st.o[k] ?? d);
  const set = (k, redraw) => (e) => { st.o[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; if (redraw) draw(); };
  const text = (k, ph, d = '') => h('input', { type: 'text', value: opt(k, d), placeholder: ph, oninput: set(k) });
  const select = (k, items, d, redraw) => h('select', { onchange: set(k, redraw) }, items.map(([v, l]) => h('option', { value: v, selected: String(opt(k, d)) === String(v) }, l)));
  const pagesHint = () => (st.info ? `This PDF has ${st.info.pages} page${st.info.pages > 1 ? 's' : ''}. Write pages like 1-3, 5, 8- (leave empty for all).` : 'Write pages like 1-3, 5, 8- (leave empty for all).');
  const loadInfo = async () => {
    st.info = null; if (!useDoc() && !st.files.length) return draw();
    try { st.info = await api(`/api/pdf/info?${srcQuery()}`); } catch (e) { errToast(e); }
    draw();
  };
  const add = () => pickFiles('.pdf,application/pdf', true, async (files) => {
    box.classList.add('busy');
    try { const got = await uploadFiles(files); st.files.push(...got.filter((f) => /\.pdf$/i.test(f.name))); await loadInfo(); } catch (e) { errToast(e); }
    box.classList.remove('busy'); draw();
  });
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= st.files.length) return; [st.files[i], st.files[j]] = [st.files[j], st.files[i]]; if (i === 0 || j === 0) loadInfo(); else draw(); };

  // The signature pad: drawn with the mouse or a finger, kept as a transparent PNG.
  const sigPad = () => {
    const c = h('canvas', { class: 'sig-pad', width: 560, height: 180 }); const g = c.getContext('2d'); let on = false, any = !!st.sig;
    g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#14233b';
    if (st.sig) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0); im.src = st.sig; }
    const at = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height]; };
    c.onpointerdown = (e) => { on = true; c.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...at(e)); };
    c.onpointermove = (e) => { if (!on) return; g.lineTo(...at(e)); g.stroke(); any = true; };
    c.onpointerup = () => { on = false; if (any) { st.sig = c.toDataURL('image/png'); go.disabled = !ready(); } };
    const clear = h('button', { class: 'btn sm ghost', onclick: () => { g.clearRect(0, 0, c.width, c.height); any = false; st.sig = null; go.disabled = true; } }, 'Clear');
    const up = h('button', { class: 'btn sm ghost', onclick: () => pickFiles('image/png,image/jpeg', false, (files) => { const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => { g.clearRect(0, 0, c.width, c.height); const k = Math.min(c.width / im.width, c.height / im.height); g.drawImage(im, (c.width - im.width * k) / 2, (c.height - im.height * k) / 2, im.width * k, im.height * k); any = true; st.sig = c.toDataURL('image/png'); go.disabled = !ready(); }; im.src = rd.result; }; rd.readAsDataURL(files[0]); }) }, icon('upload'), 'Use a picture');
    return h('div', { class: 'sig' }, c, h('div', { class: 'sig-bar' }, h('small', { class: 'hint' }, 'Draw your signature here.'), h('span', { class: 'grow' }), up, clear));
  };
  // Where the signature goes: click the page.
  const placer = () => {
    const n = Math.min(st.info?.pages || 1, Math.max(1, Number(opt('page', st.info?.pages || 1)) || 1));
    const x = Number(opt('x', 0.58)), y = Number(opt('y', 0.82)); const w = Number(opt('width', 0.28));
    const mark = h('div', { class: 'sig-mark', style: { left: x * 100 + '%', top: y * 100 + '%', width: w * 100 + '%' } }, 'Signature');
    const wrap = h('div', { class: 'sig-page', onclick: (e) => { const r = wrap.getBoundingClientRect(); st.o.x = Math.max(0, Math.min(1 - w, (e.clientX - r.left) / r.width - w / 2)); st.o.y = Math.max(0, Math.min(0.95, (e.clientY - r.top) / r.height - 0.03)); mark.style.left = st.o.x * 100 + '%'; mark.style.top = st.o.y * 100 + '%'; } },
      h('img', { src: `/api/pdf/page?${srcQuery()}&page=${n}&scale=0.7`, alt: `Page ${n}` }), mark);
    return wrap;
  };

  const ready = () => {
    if (!st.tool || st.busy) return false;
    if (st.tool === 'merge') return st.files.length + (docId ? 1 : 0) >= 2;
    if (!useDoc() && !st.files.length) return false;
    if (st.tool === 'sign') return !!st.sig;
    if (st.tool === 'fill') return !!st.info?.fields?.length;
    return true;
  };
  const options = () => {
    const t = st.tool;
    if (t === 'merge') return [h('small', { class: 'hint' }, st.files.length + (docId ? 1 : 0) < 2 ? 'Add the PDFs to join. They are merged in the order shown.' : 'The files are merged in the order shown. Use the arrows to change it.'), field('Name of the merged file', text('name', 'Merged'))];
    if (t === 'pages') {
      const a = opt('action', 'extract');
      return [field('What to do', select('action', [['extract', 'Keep only some pages'], ['remove', 'Remove some pages'], ['reorder', 'Put the pages in a new order'], ['each', 'Split into one file per page'], ['ranges', 'Split into several files by ranges'], ['every', 'Split every few pages']], 'extract', true)),
        a === 'every' ? field('Pages per file', h('input', { type: 'number', min: 1, value: opt('every', 2), oninput: set('every') }))
          : a === 'each' ? null
            : a === 'reorder' ? field('New order', text('order', 'For example 3, 1, 2, 4-'), 'Every page you list is kept, in that order. Pages you leave out are dropped.')
              : field(a === 'ranges' ? 'Ranges, one file each' : 'Pages', text('ranges', a === 'ranges' ? 'For example 1-3, 4-6, 7-' : 'For example 1-3, 5'), pagesHint())];
    }
    if (t === 'rotate') return [field('Turn', select('angle', [[90, 'Right (90° clockwise)'], [270, 'Left (90° anticlockwise)'], [180, 'Upside down (180°)']], 90)), field('Pages', text('ranges', 'All pages'), pagesHint())];
    if (t === 'compress') return [field('How much', select('level', [['light', 'Light: tidy the file, keep everything sharp'], ['medium', 'Medium: smaller pictures, text stays selectable where it can'], ['strong', 'Strong: smallest file, pages become pictures']], 'medium')), h('small', { class: 'hint' }, 'If the file cannot get smaller, you get it back unchanged.')];
    if (t === 'watermark') return [field('Text', text('text', 'DRAFT', 'CONFIDENTIAL')), h('div', { class: 'row2' }, field('Position', select('position', [['diagonal', 'Across the page'], ['center', 'Centre'], ['top-right', 'Top right'], ['top-left', 'Top left'], ['bottom-right', 'Bottom right'], ['bottom-center', 'Bottom centre']], 'diagonal')), field('Strength', select('opacity', [[0.1, 'Faint'], [0.18, 'Normal'], [0.35, 'Strong']], 0.18))), h('div', { class: 'row2' }, field('Colour', h('input', { type: 'color', value: opt('color', '#888888'), oninput: set('color') })), field('Pages', text('ranges', 'All pages')))];
    if (t === 'numbers') return [h('div', { class: 'row2' }, field('Position', select('position', [['bottom-center', 'Bottom centre'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'], ['top-right', 'Top right'], ['top-center', 'Top centre']], 'bottom-center')), field('Style', select('format', [['{n} / {total}', '1 / 12'], ['{n}', '1'], ['Page {n}', 'Page 1'], ['Page {n} of {total}', 'Page 1 of 12']], '{n} / {total}'))), field('First number', h('input', { type: 'number', value: opt('start', 1), oninput: set('start') }))];
    if (t === 'fill') {
      if (!st.info) return [h('div', { class: 'gen-note' }, 'Add the PDF form to fill in.')];
      const fields = st.info.fields.filter((f) => !f.readOnly);
      if (!fields.length) return [h('div', { class: 'gen-note' }, 'This PDF has no form fields to fill. To make a fillable form, ask in the chat with the PDF type picked: "Design a registration form with name, email and a signature box".')];
      st.o.values ||= Object.fromEntries(fields.map((f) => [f.name, f.value]));
      const put = (f) => (e) => { st.o.values[f.name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; };
      return [h('div', { class: 'pform' }, fields.slice(0, 120).map((f) => (f.type === 'checkbox'
        ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st.o.values[f.name], onchange: put(f) }), f.name)
        : field(f.name, f.options?.length ? h('select', { onchange: put(f) }, [h('option', { value: '' }, ''), ...f.options.map((x) => h('option', { value: x, selected: x === st.o.values[f.name] }, x))]) : f.type === 'multiline' ? h('textarea', { rows: 3, oninput: put(f) }, st.o.values[f.name] || '') : h('input', { type: 'text', value: st.o.values[f.name] || '', oninput: put(f) }))))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!opt('flatten', false), onchange: set('flatten') }), 'Lock the answers (the form can no longer be edited)')];
    }
    if (t === 'sign') {
      if (!st.info) return [h('div', { class: 'gen-note' }, 'Add the PDF to sign.')];
      return [sigPad(), h('div', { class: 'row2' }, field('Page', h('input', { type: 'number', min: 1, max: st.info.pages, value: opt('page', st.info.pages), onchange: (e) => { st.o.page = e.target.value; draw(); } })), field('Size', select('width', [[0.18, 'Small'], [0.28, 'Medium'], [0.4, 'Large']], 0.28, true))),
        h('div', { class: 'row2' }, field('Name under it (optional)', text('name', 'Your name')), field('Date under it (optional)', text('date', new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })))),
        field('Where it goes', placer(), 'Click the page to place the signature.'),
        h('small', { class: 'hint' }, 'This draws your signature on the page. It is not a certificate-based digital signature.')];
    }
    if (t === 'ocr') return [st.info && !st.info.scanned ? h('div', { class: 'gen-note' }, 'This PDF already has text you can select, so it does not need reading. You can still run it.') : null, field('Result', select('as', [['pdf', 'A searchable PDF that looks the same'], ['text', 'Just the text (.txt)']], 'pdf')), h('small', { class: 'hint' }, 'Reads English text from scanned pages, up to 40 pages at a time. It takes a few seconds per page.')];
    if (t === 'convert') {
      const to = opt('to', 'word');
      return [field('Convert to', select('to', [['word', 'Word document (.docx)'], ['excel', 'Excel workbook (.xlsx)'], ['images', 'Pictures, one per page'], ['text', 'Plain text']], 'word', true)),
        to === 'word' && conversationId ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!opt('open', true), onchange: set('open') }), 'Open it in Docs Studio, so it can be edited by prompt') : null,
        to === 'images' ? h('div', { class: 'row2' }, field('Format', select('format', [['png', 'PNG'], ['jpg', 'JPG']], 'png')), field('Pages', text('ranges', 'All pages'))) : null,
        h('small', { class: 'hint' }, to === 'word' ? 'Text, headings, lists and tables come across. The exact page layout and pictures of a PDF do not.' : to === 'excel' ? 'Each page becomes a sheet, with table columns kept apart. Scanned pages are read with OCR first.' : to === 'images' ? 'Up to 60 pages.' : 'Scanned pages are read with OCR first.')];
    }
    return [];
  };
  const draw = () => {
    const t = TOOLS.find((x) => x.id === st.tool);
    go.disabled = !ready();
    go.lastChild.textContent = st.busy ? 'Working…' : st.tool === 'convert' && opt('to', 'word') === 'word' && conversationId && opt('open', true) ? 'Convert and open' : 'Download';
    const fileRow = (f, i) => h('div', { class: 'pfile' }, icon('pdf'), h('span', { class: 'nm' }, f.name), h('small', {}, fmtSize(f.size) + (f.pages ? ` · ${f.pages} page${f.pages > 1 ? 's' : ''}` : '')),
      st.tool === 'merge' && st.files.length > 1 ? [h('button', { class: 'icon-btn', title: 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, icon('up')), h('button', { class: 'icon-btn', title: 'Move down', disabled: i === st.files.length - 1, onclick: () => move(i, 1) }, icon('down'))] : null,
      h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { st.files.splice(i, 1); st.o.values = null; loadInfo(); } }, icon('x')));
    box.replaceChildren(...[
      h('div', { class: 'ptool-grid' }, TOOLS.map((x) => h('button', { class: 'ptool' + (st.tool === x.id ? ' on' : ''), onclick: () => { if (st.tool !== x.id) { st.tool = x.id; st.o = {}; } draw(); } }, icon(x.icon), h('b', {}, x.label), h('small', {}, x.sub)))),
      h('div', { class: 'field' }, h('div', { class: 'lab' }, t?.many ? 'PDFs' : 'PDF'),
        h('div', { class: 'pfiles' },
          docId && (st.tool === 'merge' || !st.files.length) ? h('div', { class: 'pfile' }, icon('pdf'), h('span', { class: 'nm' }, title || 'This PDF'), h('small', {}, 'open in the panel')) : null,
          (t?.many ? st.files : st.files.slice(0, 1)).map(fileRow),
          (t?.many || !st.files.length) ? h('button', { class: 'chipbtn', onclick: add }, icon('upload'), h('span', { class: 'nm' }, st.files.length || docId ? (t?.many ? 'Add more PDFs' : 'Use another PDF') : 'Choose a PDF')) : null)),
      st.tool ? h('div', { class: 'ptool-opts' }, options().filter(Boolean)) : h('div', { class: 'gen-note' }, 'Pick a tool above.'),
    ].filter(Boolean));
  };
  go.onclick = async () => {
    const o = { ...st.o }; let tool = st.tool;
    if (tool === 'pages') { const a = o.action || 'extract'; tool = a === 'remove' ? 'remove' : a === 'reorder' ? 'reorder' : 'split'; if (tool === 'split') o.mode = a; if (a === 'each') o.ranges = ''; if ((a === 'extract' || a === 'remove' || a === 'ranges') && !String(o.ranges || '').trim()) return toast('Write which pages first, for example 1-3.', 'error'); if (a === 'reorder' && !String(o.order || '').trim()) return toast('Write the new page order first, for example 3, 1, 2.', 'error'); }
    if (tool === 'convert') tool = o.to || 'word';
    if (tool === 'sign') { o.image = st.sig; o.page ??= st.info?.pages || 1; o.x ??= 0.58; o.y ??= 0.82; }
    const opening = tool === 'word' && conversationId && (o.open ?? true);
    if (tool === 'word') o.open = !!opening;
    const body = tool === 'merge' && docId ? { docId, fileIds: st.files.map((f) => f.id) } : srcBody();
    st.busy = true; draw();
    try {
      const res = await fetch(`/api/pdf/tools/${tool}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, conversationId, options: o }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'That did not work. Please try again.');
      if (opening) { const r = await res.json(); toast(r.note || 'Opened in Docs Studio'); bg.remove(); onDoc?.(r.doc); return; }
      const cd = res.headers.get('Content-Disposition') || '';
      const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] || '') || /filename="([^"]+)"/.exec(cd)?.[1] || 'result.pdf';
      const note = decodeURIComponent(res.headers.get('X-Note') || '');
      downloadBlob(await res.blob(), name); toast(note ? `${name} downloaded. ${note}` : `${name} downloaded`);
    } catch (e) { errToast(e); }
    st.busy = false; draw();
  };
  const bg = dialog({ title: 'PDF tools', sub: docId ? `Work on "${title}" or on any PDF you upload. Your files stay in your account.` : 'Merge, split, compress, sign, fill in, read scans and convert PDFs.', wide: true, body: [box], foot: [h('button', { class: 'btn ghost', onclick: () => bg.remove() }, 'Close'), go] });
  draw(); if (docId) loadInfo();
  return bg;
}

