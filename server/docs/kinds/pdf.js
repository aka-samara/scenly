// Designed PDFs: brochures, invoices, certificates, one-pagers, menus, reports. The model writes each
// page as HTML on top of Scenly's page stylesheet; Scenly cleans it, draws charts, QR codes and
// form fields, checks in real Chrome that every page fits, and prints the PDF.
import { looseJson } from '../envelope.js';
import { clone, clampNum, oneOf, pmap, esc } from '../util.js';
import { colour, SAFE_FONTS } from '../brand.js';
import { SIZES, pageBox } from '../pdf/base.js';
import { docHtml, attrs, cleanCss, balance } from '../pdf/components.js';
import { htmlToPdf, measure } from '../pdf/render.js';
import fs from 'node:fs';
import { addFormFields, rasterize, layoutNote } from '../pdf/tools.js';
import { TEMPLATES } from '../pdf/templates.js';

const MAX_PAGES = 40, MAX_HTML = 60000;
const LIKE_THIS = /\b(like (this|that|the (attached|sample|example|one))|same (layout|design|look|style|format)|re-?create|rebuild|re-?design|redo|copy (the|this|its) (layout|design|look|style|format)|based on (this|the attached|the sample)|as (a|the) template|use (this|it|the attached).{0,30}template|match(es|ing)? (this|the)|clone|replicate|mimic)\b/i;
// The first page in a reply. A page whose closing tag is missing was cut short: what is there is kept and marked.
function readPage(text) {
  const t = String(text || '');
  const m = [...t.matchAll(PAGE_RE)][0];
  if (m) return pageFrom(m[1], m[2]);
  const open = /<page\b((?:"[^"]*"|'[^']*'|[^>"'])*?)>([\s\S]*)$/i.exec(t);
  if (open && open[2].trim()) return { ...pageFrom(open[1], open[2].replace(/\n?```\s*$/, '')), cut: true };
  return null;
}
const PAGE_RE = /<page\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(?:\/>|>([\s\S]*?)<\/page\s*>)/gi;

function normSettings(s = {}) {
  const out = { page: {}, theme: {} };
  const p = s.page || {};
  out.page.size = oneOf(p.size, Object.keys(SIZES), 'A4');
  if (Number(p.width) > 0 && Number(p.height) > 0) { out.page.width = clampNum(p.width, 40, 1200, 210); out.page.height = clampNum(p.height, 40, 1200, 297); out.page.size = 'Custom'; }
  if (p.orientation) out.page.orientation = oneOf(p.orientation, ['portrait', 'landscape'], 'portrait');
  if (p.padding != null) out.page.padding = clampNum(p.padding, 0, 40, 14);
  if (p.margin != null) out.page.margin = clampNum(p.margin, 5, 40, 18);
  const t = s.theme || {};
  for (const k of ['primary', 'accent', 'text', 'background', 'muted']) { const c = colour(t[k] ?? (k === 'primary' ? t.headingColor : undefined), null); if (c) out.theme[k] = c; }
  for (const k of ['font', 'headingFont']) if (t[k]) out.theme[k] = SAFE_FONTS.find((f) => f.toLowerCase() === String(t[k]).toLowerCase()) || String(t[k]).replace(/[^\w \-]/g, '').slice(0, 40);
  if (t.fontSize != null) out.theme.fontSize = clampNum(t.fontSize, 6, 18, 10.5);
  return out;
}
const mergeSettings = (a, b) => normSettings({ page: { ...(a.page || {}), ...(b.page || {}), ...(b.page?.size && !b.page.width ? { width: undefined, height: undefined } : {}) }, theme: { ...(a.theme || {}), ...(b.theme || {}) } });

function pageFrom(at, body) {
  const a = attrs(at); const flag = (k) => k in a && !/^(false|no|0)$/i.test(a[k]);
  const p = { html: String(body || '').trim() };
  if (a.name || a.title) p.name = String(a.name || a.title).slice(0, 60);
  if (a.bg || a.background) p.bg = String(a.bg || a.background).slice(0, 200);
  if (flag('bleed')) p.bleed = true;
  if (flag('flow')) p.flow = true;
  if (a.pad != null && a.pad !== '') p.pad = clampNum(parseFloat(a.pad), 0, 40, 14);
  if (a.build) { p.build = String(a.build).slice(0, 1500); p.html = ''; }
  return p;
}
const pageAttrs = (p) => `${p.name ? ` name="${p.name.replace(/"/g, "'")}"` : ''}${p.bg ? ` bg="${p.bg}"` : ''}${p.bleed ? ' bleed' : ''}${p.flow ? ' flow' : ''}${p.pad != null ? ` pad="${p.pad}"` : ''}`;

const SETTINGS_HELP = `{"page":{"size":"A4|Letter|A5|A3|Legal|Square|Slide|DL|Card","orientation":"portrait|landscape","width":210,"height":297,"padding":14},"theme":{"primary":"#1F3A5F","accent":"#E4572E","text":"#1A1A22","background":"#FFFFFF","font":"Calibri","headingFont":"Georgia","fontSize":10.5}}`;
const HTML_HELP = `PAGE MARKUP
- <page name="Cover"> … </page> is one sheet of exactly the page size. Its content is a flex column with a safe padding all round. Attributes: bg="primary|accent|dark|soft|#hex|linear-gradient(…)|file:ID" (page background; primary, accent and dark make text white), bleed (no padding, for edge-to-edge designs), pad="10" (padding in mm), flow (a text section that runs over as many pages as it needs, for long reports).
- Write plain HTML with inline styles where needed. Units: mm and pt. NO scripts, NO external images, fonts or links to load, NO <html>/<body>.
- Ready-made classes (use them, they follow the theme): layout "row" + "col"/"col-4"/"col-6"/"col-8", "grid-2/3/4", "stack", "spread", "grow" (takes the free height), "push" (sticks to the bottom), "mt-1…4", "mb-0…3"; text "eyebrow", "lead", "muted", "small", "tiny", "big", "center", "right", "upper", "accent"; surfaces "card" (light box; text inside is dark again even on a dark page), "card line", "card glass" (translucent, for dark backgrounds), "band" (full-width strip; add "top"/"bottom" to touch the page edge), "bg-primary", "bg-accent", "bg-soft", "bg-dark" (these set readable text colours by themselves), "rule", "badge", "btn", "frame"; data "tbl" (table; "num" on numeric cells, tr class "total"), "tbl plain", "stat" (with children "num" and "lbl"), "kv", "dots" (menu line: name … price), ul "check"/"clean", "sign" (signature line). CSS variables: var(--primary) var(--accent) var(--text) var(--muted) var(--soft) var(--line) var(--pad).
- Components: <chart type="bar|hbar|line|area|pie|doughnut|stacked" title="…" labels="Q1,Q2,Q3" values="12,18,25" suffix="%" height="60mm"></chart> (several series: series="2025: 4,6,9; 2026: 5,8,12"); <qr value="https://…" size="28mm"></qr>; <img src="logo"> (the brand logo), <img src="file:ID"> (a picture the user attached; class "cover" fills its box); form fields that stay fillable in the PDF: <field name="email" label="Email" type="text|multiline|checkbox|date|select|signature" options="A,B"></field>. Simple inline <svg> shapes are fine for decoration.
- {page} and {pages} print the page number and page count.
DESIGN RULES
- Each page must fit its sheet, and should fill it: an A4 page is 297 mm tall, which is roughly a header, three or four content blocks and a footer. Add up your heights before writing; never give a block a fixed height taller than a third of the page. Use "grow" on the main area and "push" on the footer so the page is filled without overflowing. Prefer strong hierarchy, generous white space, one accent colour, aligned columns. A cover or hero uses a coloured or gradient background with large type.
- Write real, specific content from the user's request; never lorem ipsum. Use clear [square bracket] placeholders only for facts the user did not give.`;

export default {
  id: 'pdf', label: 'PDF design', noun: 'PDF', ext: 'pdf', icon: 'PDF',
  // Asking about a PDF is ordinary chat; asking for one to be designed opens the designer.
  detect: /\b(design|create|make|generate|build|produce|lay ?out|draft|write|prepare|need|want)\b[^.?!\n]{0,80}\b(pdf|brochure|flyer|leaflet|one-?pager|certificate|poster|menu card|price list|datasheet|letterhead|fillable form|invoice template)\b|\bpdf (design|form|brochure|flyer|invoice|certificate)\b/i,
  formats: [
    { id: 'pdf', label: 'PDF', sub: '.pdf, ready to print or send', mime: 'application/pdf' },
    { id: 'png', ext: 'zip', label: 'Images', sub: 'One PNG per page (.zip)', mime: 'application/zip' },
    { id: 'html', label: 'Web page', sub: '.html', mime: 'text/html; charset=utf-8' },
  ],
  suggestions: ['Make it bolder and more modern', 'Add a QR code to our website', 'Switch to landscape', 'Add a second page with pricing'],
  templates: TEMPLATES.map((t) => ({ id: t.id, label: t.label, sub: t.sub })),
  seedMessage: (label) => `Here is the ${label} template. Tell me your details and I'll fill it in and restyle it, or click any text on the page to edit it.`,
  pictures: true,
  planTokens: 3600,
  template(id, theme) { const t = TEMPLATES.find((x) => x.id === id); if (!t) return null; const v = this.validate({ kind: 'pdf', ...t.build(theme) }); return { label: t.label, spec: v.spec }; },

  prompt(mode) {
    return mode === 'create' ? `You are a graphic designer laying out a PDF.

Inside <document title="…"> write, in this order: one line <settings>{…}</settings> (optional), a <style>…</style> block with extra CSS shared by every page (optional), then the pages.
- Settings (include only what is needed; choose the size and orientation that suit the piece, e.g. certificates are landscape): ${SETTINGS_HELP}
${HTML_HELP}
SEVERAL PAGES: if the PDF has more than one page, do not write any page in full. Write the settings, a <style> block with the shared classes every page will use (for example the page header, footer line and card variants), one line <design>the art direction in two or three sentences: mood, how colour is used, the typography, the header and footer every inner page repeats</design>, and then one <page name="…" build="exactly what this page shows: its sections, facts, numbers and layout"/> for every page, the cover included. Each page is then designed separately from its brief and merged in before the user sees anything, so your <message> describes the finished PDF and never mentions briefs. A single-page PDF is always written in full, with no build attribute.`
      : `You are a graphic designer editing the user's PDF. Its pages are shown below. Change it with one or more <edit> blocks; only send what changes.
- <edit op="replace_page" page="2" name="…" bg="…">the complete new HTML of that page</edit>  (page attributes are optional and replace the old ones)
- <edit op="insert_page" after="1" name="…">HTML of a new page</edit>   (after="0" puts it first; a build="brief" attribute instead of content has the page designed separately)
- <edit op="delete_page" page="3"/>    <edit op="move_page" page="3" to="1"/>
- <edit op="page" page="1" bg="accent" bleed="false" pad="12"/>  changes page attributes only
- <edit op="replace_text" find="exact existing text or markup" replace="new text"/>  for small wording and number changes
- <edit op="style">the complete shared CSS</edit>   <edit op="add_style">CSS added to the shared CSS</edit>
- <edit op="settings">{"page":{"orientation":"landscape"},"theme":{"accent":"#E4572E"}}</edit>  Options: ${SETTINGS_HELP}
- <edit op="restyle_all" instruction="what to change on every page, e.g. Make it more minimal with more white space"/>  redesigns each page separately; use it for changes of look or tone across the whole PDF, and for a new page size.
- <edit op="title">New title</edit>
Changing colours or fonts for the whole PDF is a settings edit, not a rewrite. Pages are numbered from 1.
${HTML_HELP}`;
  },

  // "Make one like this": the attached PDF is measured, and the model is told where everything sits.
  async reference(files, text) {
    const f = files.find((x) => /\.pdf$/i.test(x.name));
    if (!f || !LIKE_THIS.test(String(text || ''))) return '';
    const note = await layoutNote(fs.readFileSync(f.path));
    return `SAMPLE TO FOLLOW: the user attached "${f.name}" as the model for this PDF. Rebuild its layout as closely as the page stylesheet allows: the same page size and orientation (set them in <settings>), the same blocks in the same places, similar type sizes, and its colours as the theme. Use the content the user asks for; if they only ask for a copy, keep the sample's own text. Positions below are measured from the top left of each page.\n${note.text}`;
  },

  parseDocument({ attrs: a, body }) {
    let text = String(body || ''); let settings = {}; let css = '';
    const m = text.match(/<settings>([\s\S]*?)<\/settings>/i);
    if (m) { try { settings = looseJson(m[1]); } catch { /* ignored */ } text = text.replace(m[0], ''); }
    const firstPage = text.search(/<page\b/i);
    const head = firstPage >= 0 ? text.slice(0, firstPage) : '';
    const sm = head.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (sm) { css = sm[1]; text = text.replace(sm[0], ''); }
    let design = ''; const dm = head.match(/<design>([\s\S]*?)<\/design>/i); if (dm) { design = dm[1].trim(); text = text.replace(dm[0], ''); }
    const pages = [...text.matchAll(PAGE_RE)].map((x) => pageFrom(x[1], x[2]));
    // A reply with no <page> tags is taken as one page.
    if (!pages.length && text.replace(/```\w*/g, '').trim()) pages.push({ html: text.replace(/^\s*```\w*\n?|\n?```\s*$/g, '').trim() });
    return { kind: 'pdf', title: a.title || 'PDF', settings, css, design, pages };
  },

  validate(spec) {
    const errors = [], warnings = [];
    const out = { kind: 'pdf', title: String(spec.title || 'PDF').trim().slice(0, 120) || 'PDF', settings: normSettings(spec.settings || {}), css: cleanCss(spec.css || ''), pages: [] };
    if (spec.design) out.design = String(spec.design).replace(/<[^>]*>/g, '').slice(0, 800);
    for (const p of (spec.pages || []).slice(0, MAX_PAGES)) {
      const q = { html: balance(String(p.html || '').replace(/<\/?(document|message|edit|page|settings)\b[^>]*>/gi, '').trim()) };
      if (Array.isArray(p.ink)) { const ink = p.ink.filter((f) => /^\d+(\/\d+){0,30}$/.test(String(f?.path)) && /^#[0-9a-f]{3,8}$/i.test(String(f?.c))).slice(0, 40).map((f) => ({ path: String(f.path), c: String(f.c) })); if (ink.length) q.ink = ink; }
      for (const k of ['name', 'bg', 'build']) if (p[k]) q[k] = String(p[k]);
      for (const k of ['bleed', 'flow']) if (p[k]) q[k] = true;
      if (p.pad != null) q.pad = clampNum(p.pad, 0, 40, 14);
      if (p.fit && p.fit < 1 && !q.flow) q.fit = clampNum(p.fit, 0.5, 1, 1);
      if (q.html.length > MAX_HTML) { errors.push(`Page ${out.pages.length + 1} is too large. Keep each page under ${MAX_HTML / 1000}k characters and do not embed pictures as data.`); continue; }
      if (!q.html && !q.build) continue;
      out.pages.push(q);
    }
    if ((spec.pages || []).length > MAX_PAGES) warnings.push(`Only the first ${MAX_PAGES} pages were kept.`);
    if (!out.pages.length) errors.push('The PDF has no pages. Write at least one <page>…</page> with its HTML.');
    return { spec: out, errors, warnings };
  },

  // Pages left as a brief are designed one by one, several at a time, to match the first page.
  async expand(spec, ctx) {
    const todo = spec.pages.map((p, i) => ({ p, i })).filter((x) => x.p.build);
    if (!todo.length) return spec;
    const s = clone(spec); const box = pageBox(s.settings);
    const ref = s.pages.find((p) => p.html && !p.build);
    const outline = s.pages.map((p, i) => `${i + 1}. ${p.name || 'Page'}${p.build ? ': ' + p.build.slice(0, 160) : ' (written)'}`).join('\n');
    let done = 0;
    ctx.status(`Designing ${todo.length} more page${todo.length > 1 ? 's' : ''}…`);
    await pmap(todo, async ({ p, i }) => {
      const system = `You are a graphic designer writing ONE page of a PDF titled "${s.title}" (${box.w} × ${box.h} mm). Reply with ONLY one <page …>…</page> element: no explanations, no code fence. Follow the art direction and the shared CSS (and the reference page, if one is given) so the PDF reads as one piece. Use the shared classes instead of repeating inline styles, and keep drawings simple, so the page stays under about 9,000 characters.\n${HTML_HELP}`;
      const brief = `Pages of this PDF:\n${outline}\n\n${s.design ? `Art direction: ${s.design}\n\n` : ''}${ctx.request ? `What the user asked for: ${ctx.request.slice(0, 1200)}\n\n` : ''}Shared CSS:\n${s.css || '(none)'}\n\n${ref ? `Reference page (already designed):\n<page${pageAttrs(ref)}>\n${ref.html.slice(0, 7000)}\n</page>\n\n` : ''}Write page ${i + 1}${p.name ? ` ("${p.name}")` : ''}. Brief: ${p.build}`;
      let got = null;
      try {
        got = readPage(await ctx.ask(system, brief, { maxTokens: 4500 }));
        // Cut short by the length limit: asked once more for a leaner page, else what arrived is kept.
        if (got?.cut) { const again = readPage(await ctx.ask(system, `${brief}\n\nYour last attempt was too long and was cut off before the end. Write the page again, complete, in under 6,000 characters: fewer inline styles, shorter texts, no decorative drawings.`, { maxTokens: 4500 }).catch(() => '')); if (again && !again.cut) got = again; }
      } catch (e) {
        if (ctx.signal?.aborted || e.code === 'insufficient_credits') throw e;
        ctx.warn(`Page ${i + 1} could not be designed. Ask me to redo page ${i + 1}.`);
      }
      ctx.status(`Designing pages… ${++done} of ${todo.length}`);
      if (got?.cut) ctx.warn(`Page ${i + 1} came back incomplete. Ask me to redo page ${i + 1}.`);
      if (got) { delete got.build; delete got.cut; }
      s.pages[i] = got?.html ? { ...got, name: got.name || p.name } : { name: p.name, html: `<div class="grow center" style="display:flex;align-items:center;justify-content:center"><p class="muted">This page could not be designed. Ask Scenly to redo page ${i + 1}.</p></div>` };
    }, 4);
    return s;
  },

  // Every fixed page is laid out in Chrome. A page that runs over is rewritten once, then scaled to fit.
  async check(spec, ctx = {}) {
    const s = clone(spec); const box = pageBox(s.settings);
    for (const p of s.pages) { delete p.fit; delete p.ink; }
    const run = () => measure(docHtml(s, ctx.theme || FALLBACK_THEME, { mode: 'measure' }), { widthMm: box.w, heightMm: box.h });
    let m;
    try { m = await run(); } catch (e) { if (e.user) throw e; ctx.warn?.('The page fit could not be checked.'); return s; }
    const over = (i) => !s.pages[i].flow && m[i] && m[i].overY > 2.5;
    // A page a little too full is scaled to fit; one far too full is rewritten first.
    const bad = s.pages.map((_p, i) => i).filter((i) => over(i) && m[i].contentH / box.h > 1.28);
    if (bad.length && ctx.ask) {
      ctx.status?.(bad.length > 1 ? `Tightening ${bad.length} pages that ran over…` : 'Tightening a page that ran over…');
      await pmap(bad, async (i) => {
        const p = s.pages[i]; const pct = Math.round((m[i].contentH / box.h - 1) * 100);
        try {
          const html = await ctx.ask(
            `You are a graphic designer fixing one page of a PDF (${box.w} × ${box.h} mm). The page below is ${pct}% too tall for its sheet, so the bottom is cut off. Rewrite it so everything fits with room to spare: shorten texts, drop the least important items, use smaller gaps or more columns. Keep the look. Reply with ONLY one <page …>…</page> element.\n${HTML_HELP}`,
            `Shared CSS:\n${s.css || '(none)'}\n\n<page${pageAttrs(p)}>\n${p.html}\n</page>`, { maxTokens: 4500 });
          const x = readPage(html);
          if (x?.html && !x.cut) s.pages[i] = { ...x, name: p.name };
        } catch (e) { if (ctx.signal?.aborted || e.code === 'insufficient_credits') throw e; }
      }, 4);
      try { m = await run(); } catch { return s; }
    }
    // Text the same colour as what is behind it is given a colour that shows.
    const th = s.settings.theme || {}; const darkInk = /^#[0-9a-f]{6}$/i.test(th.text || '') && parseInt(th.text.slice(1, 3), 16) + parseInt(th.text.slice(3, 5), 16) + parseInt(th.text.slice(5, 7), 16) < 300 ? th.text : '#1B1F27';
    s.pages.forEach((p, i) => { const low = m[i]?.low || []; if (low.length) p.ink = low.map((f) => ({ path: f.path, c: f.dark ? '#FFFFFF' : darkInk })); });
    s.pages.forEach((p, i) => {
      if (!over(i)) return;
      const fit = Math.max(0.55, (box.h - 0.5) / m[i].contentH);
      p.fit = Math.floor(fit * 1000) / 1000;
      if (fit < 0.75) ctx.warn?.(`Page ${i + 1} holds a lot, so it was scaled down to fit. Ask me to shorten it or to split it over two pages.`);
    });
    return s;
  },

  describe(spec) {
    const box = pageBox(spec.settings);
    const total = spec.pages.reduce((a, p) => a + p.html.length, 0); const cap = total > 60000 ? Math.floor(60000 / spec.pages.length) : Infinity;
    return `Title: ${spec.title}\n${spec.design ? `Art direction: ${spec.design}\n` : ''}Page: ${box.w} × ${box.h} mm, ${spec.pages.length} page${spec.pages.length > 1 ? 's' : ''}\nSettings: ${JSON.stringify(spec.settings)}\nShared CSS:\n${spec.css || '(none)'}\n${spec.pages.map((p, i) => `--- page ${i + 1} ---\n<page${pageAttrs(p)}>\n${p.html.length > cap ? p.html.slice(0, cap) + '\n…[page continues]' : p.html}\n</page>`).join('\n')}\n--- end ---`;
  },

  async applyEdits(spec, edits, ctx) {
    const s = clone(spec); const notes = [], errors = [];
    const idx = (v) => { const n = Math.round(Number(String(v ?? '').replace(/[^\d.-]/g, ''))); return Number.isFinite(n) && n >= 1 && n <= s.pages.length ? n - 1 : -1; };
    const isAll = (e) => /^restyle[_-]all$/i.test(String(e.attrs.op || ''));
    for (const e of [...edits.filter((x) => !isAll(x)), ...edits.filter(isAll)]) {
      const op = String(e.attrs.op || '').toLowerCase().replace(/-/g, '_'); const body = String(e.body || '').trim();
      const inner = () => { const m = [...body.matchAll(PAGE_RE)][0]; return m ? pageFrom(m[1], m[2]) : { html: body }; };
      const at = () => { const tag = Object.entries(e.attrs).filter(([k]) => ['name', 'title', 'bg', 'background', 'bleed', 'flow', 'pad', 'build'].includes(k)).map(([k, v]) => `${k}="${String(v).replace(/"/g, "'")}"`).join(' '); return pageFrom(tag, ''); };
      if (op === 'replace_page') {
        const i = idx(e.attrs.page); if (i < 0) { errors.push(`replace_page: there is no page "${e.attrs.page}". The PDF has ${s.pages.length} page(s).`); continue; }
        const got = inner(); if (!got.html) { errors.push(`replace_page ${i + 1}: the edit has no HTML.`); continue; }
        const a = at(); delete a.html;
        s.pages[i] = { ...keepAttrs(s.pages[i]), ...keepAttrs(got), ...a, html: got.html }; notes.push(`Redesigned page ${i + 1}`);
      } else if (op === 'insert_page' || op === 'add_page') {
        const after = e.attrs.after != null ? Math.max(0, Math.min(s.pages.length, Math.round(Number(e.attrs.after)) || 0)) : e.attrs.before != null ? Math.max(0, (Math.round(Number(e.attrs.before)) || 1) - 1) : s.pages.length;
        const got = inner(); const a = at();
        if (!got.html && !a.build) { errors.push('insert_page: the edit has no HTML.'); continue; }
        if (s.pages.length >= MAX_PAGES) { errors.push(`The PDF already has ${MAX_PAGES} pages.`); continue; }
        s.pages.splice(after, 0, { ...keepAttrs(got), ...a, html: a.build ? '' : got.html }); notes.push(`Added a page after page ${after}`.replace('after page 0', 'at the start'));
      } else if (op === 'delete_page') {
        const i = idx(e.attrs.page); if (i < 0) { errors.push(`delete_page: there is no page "${e.attrs.page}".`); continue; }
        if (s.pages.length === 1) { errors.push('The only page cannot be deleted.'); continue; }
        s.pages.splice(i, 1); notes.push(`Removed page ${i + 1}`);
      } else if (op === 'move_page') {
        const i = idx(e.attrs.page), j = idx(e.attrs.to); if (i < 0 || j < 0) { errors.push('move_page needs page and to, both existing page numbers.'); continue; }
        s.pages.splice(j, 0, s.pages.splice(i, 1)[0]); notes.push(`Moved page ${i + 1} to position ${j + 1}`);
      } else if (op === 'page') {
        const i = idx(e.attrs.page); if (i < 0) { errors.push(`page: there is no page "${e.attrs.page}".`); continue; }
        const a = at(); delete a.html; const p = s.pages[i];
        for (const k of ['bleed', 'flow']) if (k in e.attrs) { if (a[k]) p[k] = true; else delete p[k]; }
        for (const k of ['name', 'bg', 'pad']) if (a[k] != null) p[k] = a[k];
        if ('bg' in e.attrs && !e.attrs.bg) delete p.bg;
        notes.push(`Changed page ${i + 1}`);
      } else if (op === 'replace_text') {
        const find = e.attrs.find ?? '', rep = e.attrs.replace ?? body;
        if (!find) { errors.push('replace_text needs a find attribute.'); continue; }
        let hits = 0; const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'g');
        for (const p of s.pages) { const before = p.html; p.html = p.html.replace(re, () => rep); if (p.html !== before) hits++; }
        if (!hits && s.title.includes(find)) { s.title = s.title.split(find).join(rep); hits++; }
        if (!hits) { errors.push(`replace_text: "${find.slice(0, 80)}" is not on any page. Copy the text exactly as it appears in the page HTML, or use replace_page.`); continue; }
        notes.push(`Replaced "${find.replace(/<[^>]+>/g, '').slice(0, 40)}"`);
      } else if (op === 'style') { s.css = body; notes.push('Updated the shared styles'); }
      else if (op === 'add_style') { if (body) { s.css = `${s.css || ''}\n${body}`; notes.push('Added to the shared styles'); } }
      else if (op === 'settings' || op === 'set') { try { s.settings = mergeSettings(s.settings || {}, looseJson(body)); notes.push('Updated the page setup or theme'); } catch { errors.push('settings: the content must be one JSON object.'); } }
      else if (op === 'title') { const t = (body || e.attrs.title || '').trim(); if (t) { s.title = t.slice(0, 120); notes.push('Renamed the PDF'); } }
      else if (op === 'restyle_all') {
        const instruction = e.attrs.instruction || body; if (!instruction) { errors.push('restyle_all needs an instruction attribute.'); continue; }
        const box = pageBox(s.settings); let done = 0;
        ctx.status(`Redesigning ${s.pages.length} page${s.pages.length > 1 ? 's' : ''}…`);
        await pmap(s.pages, async (p, i) => {
          if (p.build) return;
          try {
            const html = await ctx.ask(
              `You are a graphic designer reworking ONE page of a PDF titled "${s.title}" (${box.w} × ${box.h} mm). Apply the instruction to this page and reply with ONLY one <page …>…</page> element. Keep every fact, number, picture and component unless the instruction says otherwise.\n${HTML_HELP}`,
              `Instruction: ${instruction}\n\nShared CSS:\n${s.css || '(none)'}\n\nPage ${i + 1} of ${s.pages.length}:\n<page${pageAttrs(p)}>\n${p.html}\n</page>`, { maxTokens: 4500 });
            const m = readPage(html);
            if (m?.html && !m.cut) s.pages[i] = { ...m, name: p.name }; else if (m?.cut) ctx.warn(`Page ${i + 1} was left as it was because the new design came back incomplete.`);
          } catch (err) { if (ctx.signal?.aborted || err.code === 'insufficient_credits') throw err; ctx.warn(`Page ${i + 1} was left as it was because the model did not answer in time.`); }
          ctx.status(`Redesigning pages… ${++done} of ${s.pages.length}`);
        }, 4);
        notes.push(instruction.length > 60 ? instruction.slice(0, 57) + '…' : instruction);
      } else errors.push(`Unknown edit op "${e.attrs.op}".`);
    }
    return { spec: s, notes, errors };
  },

  // Changes made by hand: text edited on the page, or a page's HTML.
  applyManual(spec, change) {
    const s = clone(spec);
    if (Array.isArray(change.pages)) for (const c of change.pages) { const p = s.pages[c.index]; if (p && typeof c.html === 'string') { p.html = c.html; delete p.fit; } }
    if (typeof change.css === 'string') s.css = change.css;
    if (change.resetTheme && s.settings) s.settings.theme = {};
    if (change.settings && typeof change.settings === 'object') s.settings = mergeSettings(s.settings || {}, change.settings);
    if (typeof change.title === 'string' && change.title.trim()) s.title = change.title.trim();
    if (change.deletePage != null && s.pages.length > 1 && s.pages[change.deletePage]) s.pages.splice(change.deletePage, 1);
    if (change.movePage && s.pages[change.movePage.from] && s.pages[change.movePage.to]) s.pages.splice(change.movePage.to, 0, s.pages.splice(change.movePage.from, 1)[0]);
    return s;
  },
  source: (spec) => ({ type: 'pages', css: spec.css || '', pages: spec.pages.map((p, i) => ({ name: p.name || `Page ${i + 1}`, html: p.html })) }),

  summary(spec) { const box = pageBox(spec.settings); const size = spec.settings?.page?.size && spec.settings.page.size !== 'Custom' ? spec.settings.page.size : `${Math.round(box.w)} × ${Math.round(box.h)} mm`; return `${spec.pages.length} page${spec.pages.length > 1 ? 's' : ''} · ${size}${box.w > box.h && SIZES[size] && SIZES[size][0] < SIZES[size][1] ? ' landscape' : ''}`; },

  withBrand(spec, tpl, { force = false } = {}) {
    const p = tpl?.pdf?.page; if (!p || force) return spec;
    const cur = spec.settings?.page || {}; if (cur.size || cur.width) return spec;
    return { ...spec, settings: { ...(spec.settings || {}), page: { ...p, ...cur } } };
  },
  preview(spec, theme) { const box = pageBox(spec.settings); return { type: 'pages', html: docHtml(spec, theme, { mode: 'preview' }), width: box.w, height: box.h, count: spec.pages.length, names: spec.pages.map((p, i) => p.name || `Page ${i + 1}`) }; },

  async render(spec, format, theme) {
    if (format === 'html') return Buffer.from(docHtml(spec, theme, { mode: 'screen' }).replace(/ contenteditable="false"/g, ''), 'utf8');
    const box = pageBox(spec.settings);
    let pdf = await htmlToPdf(docHtml(spec, theme, { mode: 'print' }), { widthMm: box.w, heightMm: box.h });
    // Form fields are placed where Chrome drew their boxes. With flowing sections the page numbers shift, so they stay as drawn boxes.
    if (/<field\b/i.test(spec.pages.map((p) => p.html).join('')) && !spec.pages.some((p) => p.flow)) {
      try { const m = await measure(docHtml(spec, theme, { mode: 'measure' }), { widthMm: box.w, heightMm: box.h }); pdf = await addFormFields(pdf, m.map((x) => x.boxes), { title: spec.title, author: theme.company }); } catch { /* the drawn boxes remain */ }
    } else pdf = await addFormFields(pdf, [], { title: spec.title, author: theme.company });
    if (format === 'png') { const { default: JSZip } = await import('jszip'); const zip = new JSZip(); const imgs = await rasterize(pdf, { scale: 2, max: 40 }); imgs.forEach((b, i) => zip.file(`${spec.title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60)} - page ${i + 1}.png`, b)); return zip.generateAsync({ type: 'nodebuffer' }); }
    return pdf;
  },
};
const keepAttrs = (p) => { const o = {}; for (const k of ['name', 'bg', 'bleed', 'flow', 'pad']) if (p[k] != null) o[k] = p[k]; return o; };
const FALLBACK_THEME = { colors: { primary: '#1F3A5F', accent: '#2E75B6', text: '#1A1A22', muted: '#5F6672' }, fonts: { heading: 'Calibri', body: 'Calibri' }, logo: null };
