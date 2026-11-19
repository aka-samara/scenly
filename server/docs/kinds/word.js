import fs from 'node:fs';
// Word documents. The model writes settings (JSON) plus the text in Markdown; Scenly validates
// both and builds the preview and the real .docx.
import { marked } from 'marked';
import JSZip from 'jszip';
import { buildDocx } from '../word/docx.js';
import { PAGE, MARGINS, MARK, prepare, fieldsOf, fillFields, FIELD, oneTitle } from '../word/markup.js';
import { importDocx } from '../word/import.js';
import { TEMPLATES } from '../word/templates.js';
import { looseJson } from '../envelope.js';
import { sections, findSection, outline, chunks } from '../md.js';
import { esc, clone, clampNum, oneOf, words, pmap, sanitizeHtml } from '../util.js';
import { colour, SAFE_FONTS } from '../brand.js';

// A section left for later: [[write: brief]]. Never matches across another marker.
const WRITE = /\[\[\s*write\s*:\s*((?:(?!\]\]|\[\[)[\s\S])*?)\]\]/gi;

function normSettings(s = {}) {
  const out = {};
  const p = s.page || {};
  out.page = { size: oneOf(p.size, Object.keys(PAGE), 'A4'), orientation: oneOf(p.orientation, ['portrait', 'landscape'], 'portrait'), margins: typeof p.margins === 'number' ? clampNum(p.margins, 5, 60, 25.4) : oneOf(p.margins, Object.keys(MARGINS), 'normal') };
  const t = s.theme || {};
  out.theme = {};
  for (const k of ['accent', 'headingColor', 'textColor']) { const c = colour(t[k], null); if (c) out.theme[k] = c; }
  for (const k of ['font', 'headingFont']) if (t[k]) out.theme[k] = SAFE_FONTS.find((f) => f.toLowerCase() === String(t[k]).toLowerCase()) || String(t[k]).replace(/[^\w \-]/g, '').slice(0, 40);
  if (t.fontSize != null) out.theme.fontSize = clampNum(t.fontSize, 8, 16, 11);
  if (s.header) out.header = String(s.header).slice(0, 200);
  if (s.footer) out.footer = String(s.footer).slice(0, 200);
  if (s.pageNumbers != null) out.pageNumbers = !!s.pageNumbers;
  if (s.toc != null) out.toc = !!s.toc;
  if (s.cover && typeof s.cover === 'object') {
    out.cover = {};
    for (const k of ['subtitle', 'author', 'organisation']) { const v = s.cover[k] ?? (k === 'organisation' ? s.cover.organization : undefined); if (v) out.cover[k] = String(v).slice(0, 160); }
    if (s.cover.date) out.cover.date = s.cover.date === true ? true : String(s.cover.date).slice(0, 60);
  } else if (s.cover === true) out.cover = { date: true };
  if (s.columns != null && Number(s.columns) > 1) out.columns = clampNum(Math.round(s.columns), 1, 3, 1);
  if (s.lineSpacing != null) out.lineSpacing = clampNum(s.lineSpacing, 1, 2.5, 1.15);
  if (s.justify != null) out.justify = !!s.justify;
  return out;
}
const mergeSettings = (a, b) => normSettings({ ...a, ...b, page: { ...(a.page || {}), ...(b.page || {}) }, theme: { ...(a.theme || {}), ...(b.theme || {}) }, cover: b.cover === false || b.cover === null ? undefined : b.cover && typeof b.cover === 'object' ? { ...(a.cover || {}), ...b.cover } : b.cover ?? a.cover });

function titleOf(body, fallback) {
  const m = String(body || '').match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m);
  return (m ? m[1] : fallback || 'Document').replace(/[*_`~[\]]/g, '').trim().slice(0, 120) || 'Document';
}

const SETTINGS_HELP = `{"page":{"size":"A4|Letter|Legal|A5","orientation":"portrait|landscape","margins":"normal|narrow|moderate|wide"},"theme":{"accent":"#1F3A5F","headingColor":"#1F3A5F","font":"Calibri","headingFont":"Calibri","fontSize":11},"header":"text at the top of every page; may use {title} {date} {page} {pages}","footer":"text at the bottom of every page","pageNumbers":true,"toc":true,"cover":{"subtitle":"…","author":"…","organisation":"…","date":true},"columns":1,"lineSpacing":1.15,"justify":false}`;
// What the text may use beyond plain Markdown.
const COMMENT_HELP = '- Review comments on a piece of text: {==the text==}{>>the comment<<}. Use them only when the user asks for comments or a review.';
const SYNTAX_HELP = `- Footnotes: put [^1] in the text and a line "[^1]: the note" anywhere below.
- Layout lines, each alone on its own line: [[pagebreak]] starts a new page; [[section: landscape]] or [[section: portrait]] starts a new page with that orientation; [[columns: 2]] sets the text that follows in two columns and [[columns: 1]] goes back to one.
- A paragraph may start with [[center]], [[right]] or [[justify]] to align it. A single line break inside a paragraph is kept as a line break (use it for addresses and sign-offs).
- Pictures the user attached: ![short description](file:ID "60%"), using the ID given with the attachment; the optional "60%" is the width.
- Mail-merge fields: {{Field Name}}, filled from a spreadsheet later (only when the user wants a mail merge or a reusable template).
- A cover page and a table of contents come from the settings ("cover", "toc"), never from text you write.`;


const PDF_TO_WORD = /\b(convert|turn|change|export|make|open|save|get)\b.{0,50}\b(to|into|as|in)\s+(a\s+|an\s+)?(editable\s+)?(ms\s+|microsoft\s+)?(word|docx)\b|\bpdf\s*(to|2|->|→)\s*(word|docx)\b|\beditable (word|doc|document|version)\b/i;
// A PDF becomes an editable document: headings by type size, paragraphs, lists and tables. A scan is read with OCR first.
async function importPdf(file, ctx) {
  const { toMarkdown, ocr } = await import('../pdf/tools.js');
  const buf = fs.readFileSync(file.path); const notes = [];
  let r = await toMarkdown(buf);
  if (r.chars < 40 * Math.min(r.pages, 5)) {
    ctx.status?.('Reading the scanned pages…');
    const o = await ocr(buf, { searchable: false, maxPages: 30, onPage: (n, t) => ctx.status?.(`Reading the scanned pages… ${n} of ${t}`) });
    r = { ...r, markdown: o.text.split(/\n{2,}/).map((x) => x.replace(/\n/g, ' ').trim()).filter(Boolean).join('\n\n') };
    notes.push(o.total > o.pages ? `This PDF is a scan, so its text was read from the page images (first ${o.pages} of ${o.total} pages). Check it for misread words.` : 'This PDF is a scan, so its text was read from the page images. Check it for misread words.');
  } else notes.push('The text, headings, lists and tables were brought over. Pictures and the exact page layout of a PDF do not carry into Word.');
  if (!r.markdown.trim()) throw new Error('no text could be read from this PDF');
  return { spec: { kind: 'word', title: file.name.replace(/\.pdf$/i, ''), body: r.markdown }, notes };
}
export default {
  id: 'word', label: 'Word document', noun: 'document', ext: 'docx', icon: 'W',
  detect: /\b(agreements?|contracts?|nda|terms (and|&) conditions|policy|policies|letter|cover letter|cv|resume|memo|minutes|report|proposal|statement of work|offer letter|affidavit|power of attorney|will|lease)\b[^.?!\n]{0,80}\b(pdf|docx|word)\b|\b(pdf|word|docx)\b[^.?!\n]{0,40}\b(agreement|contract|nda|letter|cv|resume|memo|report|proposal|policy|lease)\b|\b(docx|word (doc|document|file|format|version|copy|memo|letter|report|proposal|contract|agreement|template)|(in|as|to|into) (an? )?(ms |microsoft )?word\b)/i,
  formats: [
    { id: 'docx', label: 'Word', sub: '.docx, opens in Word, Pages and Google Docs', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    { id: 'tracked', ext: 'docx', label: 'Word with tracked changes', sub: 'Shows what changed, to accept or reject in Word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compare: true },
    { id: 'pdf', label: 'PDF', sub: '.pdf, for sending and printing', mime: 'application/pdf' },
    { id: 'md', label: 'Markdown', sub: '.md plain text', mime: 'text/markdown; charset=utf-8' },
    { id: 'html', label: 'Web page', sub: '.html', mime: 'text/html; charset=utf-8' },
  ],
  suggestions: ['Add a cover page and a table of contents', 'Make it more formal', 'Translate it into French', 'Review it and add comments'],
  templates: TEMPLATES.map((t) => ({ id: t.id, label: t.label, sub: t.sub })),
  seedMessage: (label) => `Here is the ${label} template. Tell me about your case and I'll fill it in, or edit the text yourself.`,
  // A PDF is opened as a Word document only when the message asks for exactly that.
  canImport: (name, text) => /\.docx$/i.test(String(name || '')) || (/\.pdf$/i.test(String(name || '')) && text != null && PDF_TO_WORD.test(String(text))),
  imports: ['docx', 'pdf'], pictures: true,
  importsInto: false, // a .docx attached while a document is open is read as source material instead
  // An attached .docx opens in Docs Studio when the message asks for work on the file itself.
  wants: (text, files = []) => (files.length && files.every((f) => /\.pdf$/i.test(f.name)) ? PDF_TO_WORD.test(String(text || '')) : /\b(edit|rewrite|re-?word|translate|restructure|reorgani[sz]e|reformat|format|proof-?read|track(ed)? changes?|red-?line|shorten|expand|improve|polish|update|fix|correct|mail ?merge|add (a|an|the|some|page)|remove|replace|change|convert|clean up|open (this|it|the))\b/i.test(String(text || ''))),
  // "Convert this PDF to Word" is done once the file is open: the model is not asked to touch the text.
  justOpens: (text, files) => files.some((f) => /\.pdf$/i.test(f.name)) && text.length < 90 && /^(please |can you |could you )?(convert|turn|change|export|make|open|save|get)\b[^.,;:]*\b(word|docx)( (doc|document|file|format))?( please)?[.!?]?$/i.test(text),
  template(id, theme) { const t = TEMPLATES.find((x) => x.id === id); if (!t) return null; const v = this.validate({ kind: 'word', ...t.build(theme) }); return { label: t.label, spec: v.spec }; },
  async importFiles(files, _cur, ctx) {
    const r = /\.pdf$/i.test(files[0].name) ? await importPdf(files[0], ctx) : await importDocx(files[0], { user: ctx.user });
    const v = this.validate(r.spec);
    if (v.errors.length) throw new Error(v.errors[0]);
    if (files.length > 1) r.notes.push(`Only ${files[0].name} was opened. Attach the other files one at a time.`);
    return { spec: v.spec, notes: r.notes };
  },

  prompt(mode) {
    return mode === 'create' ? `You are writing a Word document.

Inside <document title="…">, optionally start with one line <settings>{…}</settings>, then write the whole document in Markdown.
- Settings are optional JSON; include only what the request needs: ${SETTINGS_HELP}
- Markdown: begin with "# Title". Use ## and ### headings, paragraphs, bullet and numbered lists, tables, **bold**, *italic* and > quotes. No HTML, no emoji unless asked, no placeholders such as "[Your Name]" unless the user gave no details (then use clear square-bracket placeholders).
${SYNTAX_HELP}
${COMMENT_HELP}
- Write real, complete, professional content. Use the facts the user gave and their attached files. Formal documents (proposals, reports) usually deserve a cover page, page numbers and, when they have five or more sections, a table of contents. Letters, CVs and contracts have no cover page.
- LONG DOCUMENTS: if the document needs more than about 900 words, do not write it all now. Write the title, a short introduction and every heading, and under each heading put ONE line of the form [[write: exactly what this section must cover, key facts to include, and a target length in words]]. Each of those sections is then written separately at full length and merged in before the user sees anything, so your <message> must describe the finished document and must not mention briefs or sections still to be written. Never use [[write: …]] in a short document.`
      : `You are editing the user's Word document. The current document is shown below. Change it with one or more <edit> blocks; only send what changes.
- <edit op="replace_section" heading="Exact heading text">new Markdown for that section, starting with its heading line</edit>
- <edit op="insert_after" heading="Exact heading text">Markdown for a new section placed after that section</edit>
- <edit op="insert_before" heading="Exact heading text">Markdown</edit>
- <edit op="append">Markdown added at the end</edit>   <edit op="prepend">Markdown added right after the title</edit>
- <edit op="delete_section" heading="Exact heading text"/>
- <edit op="replace_text" find="exact existing text" replace="new text"/>
- <edit op="comment" find="exact existing text">your comment on that text</edit>  adds a review comment without changing the wording (use it when asked to review or comment).
- <edit op="settings">{"theme":{"headingColor":"#1F3A5F"}}</edit>  for look and layout. Options: ${SETTINGS_HELP}
- <edit op="title">New title</edit>
- <edit op="rewrite_all" instruction="what to do to every part, e.g. Translate into French / Make the tone more formal / Shorten by half"/>  for changes that touch the whole text. It is applied part by part, so it works on long documents.
- <edit op="replace_all">the complete new Markdown</edit>  only for a short document that needs restructuring.
Headings must match the current document. Colours are hex codes. A new section longer than about 600 words may use a [[write: brief]] line instead of its text.
The text may use:
${SYNTAX_HELP}
The user can download the result with tracked changes against the earlier version, so just make the edits; do not mark changes in the text yourself. To remove the cover page send settings {"cover":false}.`;
  },

  parseDocument({ attrs, body }) {
    let settings = {};
    let text = String(body || '');
    const m = text.match(/<settings>([\s\S]*?)<\/settings>/i);
    if (m) { try { settings = looseJson(m[1]); } catch { /* bad settings are ignored, the text still counts */ } text = text.replace(m[0], ''); }
    text = text.replace(/<\/?(content|body|markdown)>/gi, '').trim();
    return { kind: 'word', title: attrs.title || titleOf(text), settings, body: text };
  },
  // A model that ignored the format but wrote a document anyway still gets its document.
  fromPlain(text) {
    const t = String(text || '').trim();
    return /^\s{0,3}#{1,2}\s+\S/m.test(t) && t.length > 300 ? { kind: 'word', title: titleOf(t), settings: {}, body: t } : null;
  },

  validate(spec) {
    const errors = [], warnings = [];
    const out = { kind: 'word', title: String(spec.title || '').trim().slice(0, 120), settings: normSettings(spec.settings || {}), body: String(spec.body || '').replace(/\r\n/g, '\n').replace(/<\/?(document|message|edit)[^>]*>/gi, '').trim() };
    if (!out.body) errors.push('The document has no text. Write the full document in Markdown inside <document>.');
    if (out.body.length > 600_000) errors.push('The document is too long.');
    if (!out.title) out.title = titleOf(out.body);
    if (out.body) out.body = oneTitle(out.body, out.title);
    return { spec: out, errors, warnings };
  },

  // Sections the model left as [[write: brief]] are written one by one, several at a time.
  async expand(spec, ctx) {
    const briefs = [...spec.body.matchAll(WRITE)];
    if (!briefs.length) return spec;
    const plan = outline(spec.body);
    const { lines, heads } = sections(spec.body);
    let done = 0;
    ctx.status(`Writing ${briefs.length} section${briefs.length > 1 ? 's' : ''}…`);
    const texts = await pmap(briefs.slice(0, 40), async (b) => {
      const lineNo = spec.body.slice(0, b.index).split('\n').length - 1;
      const head = [...heads].reverse().find((h) => h.start <= lineNo);
      let text = '';
      try {
        text = await ctx.ask(
          `You are writing one section of a Word document titled "${spec.title}". Reply with ONLY the Markdown text of this section: no heading line for the section itself (sub-headings with ### are fine), no preamble, no closing remarks. Write complete, specific, professional content. Stay under 750 words unless the brief asks for less.`,
          `Document outline:\n${plan}\n\nSection to write: "${head?.title || 'Section'}"\nBrief: ${b[1].trim()}`,
          { maxTokens: 3200 });
      } catch (e) {
        if (ctx.signal?.aborted || e.code === 'insufficient_credits') throw e;
        ctx.warn(`"${head?.title || 'A section'}" could not be written. Ask me to write that section again.`);
        text = `*This section could not be written. Ask Scenly to write "${head?.title || 'this section'}" again.*`;
      }
      ctx.status(`Writing sections… ${++done} of ${briefs.length}`);
      // Drop a Markdown fence and a repeated heading line for the section itself.
      let out = String(text).replace(/^\s*```(?:markdown|md)?\n|\n```\s*$/g, '').trim();
      const firstLine = out.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*(\n|$)/);
      const same = (x, y) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') === y.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      if (firstLine && (/^\s{0,3}#{1,2}\s/.test(out) || same(firstLine[1], head?.title || ''))) out = out.slice(firstLine[0].length).trim();
      return out;
    }, 5);
    let i = 0;
    const body = spec.body.replace(WRITE, () => (i < texts.length ? texts[i++] || '' : ''));
    return { ...spec, body };
  },

  describe(spec) {
    const body = spec.body.length <= 45000 ? spec.body
      : sections(spec.body).heads.map((h) => { const { lines } = sections(spec.body); const t = lines.slice(h.start, h.ownEnd).join('\n'); return t.length > 700 ? t.slice(0, 700) + ' …[section continues]' : t; }).join('\n\n');
    return `Title: ${spec.title}\nSettings: ${JSON.stringify(spec.settings)}\n${spec.body.length > 45000 ? 'The document is long, so each section is shown shortened. Use rewrite_all, replace_text or section edits.\n' : ''}--- document text (Markdown) ---\n${body}\n--- end ---`;
  },

  async applyEdits(spec, edits, ctx) {
    const s = clone(spec); const notes = [], errors = [];
    const listHeads = () => sections(s.body).heads.map((h) => `"${h.title}"`).slice(0, 60).join(', ');
    // Whole-text rewrites (translate, change the tone) run last, so edits that name a heading still find it.
    const isAll = (e) => /^rewrite[_-]all$/i.test(String(e.attrs.op || ''));
    for (const e of [...edits.filter((x) => !isAll(x)), ...edits.filter(isAll)]) {
      const op = String(e.attrs.op || '').toLowerCase().replace(/-/g, '_');
      const body = String(e.body || '').trim();
      const heading = e.attrs.heading || e.attrs.section || '';
      if (['replace_section', 'insert_after', 'insert_before', 'delete_section'].includes(op)) {
        const { lines, hit } = findSection(s.body, heading);
        if (!hit) { errors.push(`${op}: no heading "${heading}" in the document. Headings are: ${listHeads() || '(none)'}.`); continue; }
        if (op !== 'delete_section' && !body) { errors.push(`${op} "${heading}": the edit has no text.`); continue; }
        if (op === 'replace_section') {
          const withHead = /^\s{0,3}#{1,6}\s+\S/.test(body) ? body : `${'#'.repeat(hit.level)} ${hit.title}\n\n${body}`;
          lines.splice(hit.start, hit.end - hit.start, withHead, ''); notes.push(`Rewrote "${hit.title}"`);
        } else if (op === 'delete_section') { lines.splice(hit.start, hit.end - hit.start); notes.push(`Removed "${hit.title}"`); }
        else if (op === 'insert_after') { lines.splice(hit.end, 0, '', body, ''); notes.push(`Added a section after "${hit.title}"`); }
        else { lines.splice(hit.start, 0, body, ''); notes.push(`Added a section before "${hit.title}"`); }
        s.body = lines.join('\n');
      } else if (op === 'append') { if (body) { s.body += '\n\n' + body; notes.push('Added to the end'); } }
      else if (op === 'prepend') {
        if (!body) continue;
        const { lines, heads } = sections(s.body);
        const at = heads[0]?.level === 1 ? heads[0].start + 1 : 0;
        lines.splice(at, 0, '', body, ''); s.body = lines.join('\n'); notes.push('Added to the start');
      } else if (op === 'replace_text') {
        const find = e.attrs.find ?? '', rep = e.attrs.replace ?? body;
        if (!find) { errors.push('replace_text needs a find attribute.'); continue; }
        if (!s.body.includes(find)) {
          const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi');
          if (!re.test(s.body)) { errors.push(`replace_text: the text "${find.slice(0, 80)}" is not in the document. Copy it exactly, or use replace_section.`); continue; }
          s.body = s.body.replace(re, () => rep);
        } else s.body = s.body.split(find).join(rep);
        notes.push(`Replaced "${find.slice(0, 40)}"`);
      } else if (op === 'comment') {
        const find = e.attrs.find ?? e.attrs.text ?? '', note = (body || e.attrs.comment || '').replace(/<<\}|\{>>/g, '').trim();
        if (!find || !note) { errors.push('comment needs a find attribute and the comment as its content.'); continue; }
        let at = s.body.indexOf(find), len = find.length;
        if (at < 0) { const m = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i').exec(s.body); if (m) { at = m.index; len = m[0].length; } }
        if (at < 0) { errors.push(`comment: the text "${find.slice(0, 80)}" is not in the document. Copy a short phrase exactly.`); continue; }
        // A comment sits on one line of text; a longer match is cut at the line end.
        const nl = s.body.slice(at, at + len).indexOf('\n'); if (nl > 0) len = nl;
        s.body = `${s.body.slice(0, at)}{==${s.body.slice(at, at + len)}==}{>>${note}<<}${s.body.slice(at + len)}`;
        notes.push(`Commented on "${find.slice(0, 40)}"`);
      } else if (op === 'settings' || op === 'set') {
        try { s.settings = mergeSettings(s.settings || {}, looseJson(body)); notes.push('Updated the look'); } catch { errors.push('settings: the content must be one JSON object.'); }
      } else if (op === 'title') {
        const t = (body || e.attrs.title || '').trim();
        if (t) { s.title = t.slice(0, 120); const { lines, heads } = sections(s.body); if (heads[0]?.level === 1) { lines[heads[0].start] = '# ' + s.title; s.body = lines.join('\n'); } notes.push('Renamed the document'); }
      } else if (op === 'replace_all') { if (body) { s.body = body; notes.push('Rewrote the document'); } else errors.push('replace_all: no text given.'); }
      else if (op === 'rewrite_all') {
        const instruction = e.attrs.instruction || body;
        if (!instruction) { errors.push('rewrite_all needs an instruction attribute.'); continue; }
        if (notes.rewrote?.has(instruction.toLowerCase())) continue; // the same instruction sent twice
        (notes.rewrote ||= new Set()).add(instruction.toLowerCase());
        const parts = chunks(s.body, 4500);
        let done = 0;
        ctx.status(`Working through the document… 0 of ${parts.length} parts`);
        const out = await pmap(parts, async (part, i) => {
          let text = '';
          try {
            text = await ctx.ask(
              `You are editing one part of a Word document titled "${s.title}". Apply the instruction to this part and reply with ONLY the resulting Markdown: keep the same headings structure and Markdown formatting, keep every fact, table and number unless the instruction says otherwise, and copy picture lines ![…](file:…), [[…]] layout lines, {{fields}} and footnote marks [^1] exactly as they are. No preamble and no notes.`,
              `Instruction: ${instruction}\n\nPart ${i + 1} of ${parts.length}:\n\n${part}`, { maxTokens: 4200 });
          } catch (e) {
            if (ctx.signal?.aborted || e.code === 'insufficient_credits') throw e;
            ctx.warn(`Part ${i + 1} of the document was left unchanged because the model did not answer in time.`);
          }
          ctx.status(`Working through the document… ${++done} of ${parts.length} parts`);
          return String(text).replace(/^\s*```(?:markdown|md)?\n|\n```\s*$/g, '').trim() || part;
        }, 5);
        s.body = out.join('\n\n');
        const t = s.body.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m); if (t) s.title = t[1].replace(/[*_`~[\]]/g, '').trim().slice(0, 120);
        notes.push(instruction.length > 60 ? instruction.slice(0, 57) + '…' : instruction);
      } else errors.push(`Unknown edit op "${e.attrs.op}".`);
    }
    return { spec: s, notes, errors };
  },

  // Changes made by hand in the studio panel.
  // Page setup, header and footer of a brand kit cloned from a file. force: the kit was just picked, so it wins.
  withBrand(spec, tpl, { force = false } = {}) {
    const w = tpl?.word; if (!w) return spec;
    const s = { ...spec, settings: { ...(spec.settings || {}) } }; const st = s.settings;
    st.page = force ? { ...(st.page || {}), ...(w.page || {}) } : { ...(w.page || {}), ...(st.page || {}) };
    for (const k of ['header', 'footer', 'pageNumbers']) if (w[k] != null && (force || st[k] == null)) st[k] = w[k];
    if (w.fontSize && (force || !st.theme?.fontSize)) st.theme = { ...(st.theme || {}), fontSize: w.fontSize };
    return s;
  },
  applyManual(spec, change) {
    const s = clone(spec);
    if (typeof change.body === 'string') s.body = change.body;
    if (change.resetTheme && s.settings) s.settings.theme = {};
    if (change.settings && typeof change.settings === 'object') s.settings = mergeSettings(s.settings || {}, change.settings);
    if (typeof change.title === 'string' && change.title.trim()) s.title = change.title.trim();
    return s;
  },
  source: (spec) => ({ type: 'markdown', text: spec.body, settings: spec.settings }),

  summary(spec) {
    const w = words(spec.body.replace(/[#*_>`|-]/g, ' '));
    const n = sections(spec.body).heads.filter((h) => h.level === 2).length;
    return `${w.toLocaleString('en-US')} words${n ? ` · ${n} section${n > 1 ? 's' : ''}` : ''}`;
  },

  html(spec, theme, { forFile = false } = {}) {
    const st = spec.settings || {}, th = st.theme || {};
    const [pw, ph] = PAGE[st.page?.size] || PAGE.A4;
    const land = st.page?.orientation === 'landscape';
    const width = land ? ph : pw;
    const margin = typeof st.page?.margins === 'number' ? st.page.margins : MARGINS[st.page?.margins] || 25.4;
    const font = th.font || theme.fonts.body, hfont = th.headingFont || theme.fonts.heading;
    const hcol = th.headingColor || theme.colors.primary, accent = th.accent || theme.colors.accent, tcol = th.textColor || theme.colors.text;
    const size = th.fontSize || 11;
    const lineH = (1.55 * (st.lineSpacing || 1.15)) / 1.15;
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const prep = prepare(spec.body.replace(WRITE, (_m, b) => `\n> *Section to be written: ${String(b).trim().slice(0, 200)}*\n`));
    // Footnotes are numbered in the order they appear; comments show beside the text they are about.
    const footOrder = []; let openComment = null;
    const finish = (html) => sanitizeHtml(html)
      .replace(/<p>\s*\[\[\s*(left|center|centre|right|justify)\s*\]\]\s*/gi, (_m, a) => `<p style="text-align:${a.toLowerCase().replace('centre', 'center')}">`)
      .replace(/<img src="file:([\w-]+)"([^>]*)>/g, (_m, id, rest) => {
        const f = theme.file?.(id); if (!f) return `<span class="noimg">[picture not found]</span>`;
        const pct = /title="[^"]*?(\d{1,3})\s*%[^"]*"/.exec(rest)?.[1];
        const alt = /alt="([^"]*)"/.exec(rest)?.[1] || '';
        return `<img alt="${alt}" src="${forFile ? `data:${f.mime};base64,${f.data().toString('base64')}` : `/api/files/${id}/raw`}"${pct ? ` style="width:${Math.min(100, Number(pct))}%"` : ''}>`;
      })
      .replace(MARK.all, (m) => {
        let x;
        if ((x = m.match(MARK.foot))) { let n = footOrder.indexOf(x[1]) + 1; if (!n) n = footOrder.push(x[1]); return `<sup class="fn">${n}</sup>`; }
        if ((x = m.match(MARK.cstart))) { openComment = Number(x[1]); return '<mark class="cm">'; }
        if (MARK.cend.test(m)) { const c = prep.comments[openComment]; openComment = null; return `</mark>${c ? `<span class="cmn">${esc(c)}</span>` : ''}`; }
        return '';
      })
      .replace(FIELD, (_m, name) => `<span class="fld">${esc(name.trim())}</span>`);
    const md2html = (text) => finish(marked.parse(text, { gfm: true, breaks: true }));
    let body = '', cols = st.columns || 1, colsOpen = false;
    const openCols = () => { if (cols > 1) { body += `<div class="cols" style="column-count:${cols}">`; colsOpen = true; } };
    const closeCols = () => { if (colsOpen) { body += '</div>'; colsOpen = false; } };
    openCols();
    prep.text.split(/\n\n(\[\[\s*(?:pagebreak|section|columns)[^\]\n]*\]\])\n\n/i).forEach((part, i) => {
      if (i % 2 === 0) { if (part.trim()) body += md2html(part); return; }
      const m = part.match(MARK.directive); const kind = m[1].toLowerCase(), arg = (m[2] || '').trim().toLowerCase();
      closeCols();
      if (kind === 'pagebreak') body += '<div class="pagebreak"></div>';
      else if (kind === 'section') { cols = /(\d)\s*col/.test(arg) ? Math.min(3, Number(/(\d)\s*col/.exec(arg)[1])) : 1; body += `<div class="pagebreak" data-l="New section${/landscape/.test(arg) ? ' · landscape page' : /portrait/.test(arg) ? ' · portrait page' : ''}"></div>`; }
      else cols = Math.min(3, Math.max(1, Number(arg) || 1));
      openCols();
    });
    closeCols();
    if (footOrder.length) body += `<section class="fnotes">${footOrder.map((k, n) => `<div><sup>${n + 1}</sup> ${finish(marked.parseInline(prep.footnotes.get(k) || ''))}</div>`).join('')}</section>`;
    const logoImg = (cls) => (theme.logo ? `<img class="${cls}" alt="" src="data:${theme.logo.mime};base64,${theme.logo.data.toString('base64')}">` : '');
    let coverHtml = '';
    if (st.cover) {
      const c = st.cover;
      const lines = [c.author, c.organisation || theme.company, c.date === true ? today : c.date].filter(Boolean);
      coverHtml = `<section class="cover">${logoImg('cover-logo')}<div class="cover-t">${esc(spec.title)}</div>${c.subtitle ? `<div class="cover-s">${esc(c.subtitle)}</div>` : ''}<div class="cover-l">${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div></section><div class="pagebreak"></div>`;
      body = body.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>/, ''); // the cover carries the title
    }
    if (st.toc) {
      const heads = sections(prep.text).heads.filter((h) => h.level >= 2 && h.level <= 3);
      const toc = `<nav class="toc"><div class="toc-t">Contents</div>${heads.map((h) => `<div class="toc-${h.level}">${esc(h.title.replace(MARK.all, '').replace(/[*_`]/g, ''))}</div>`).join('')}</nav>`;
      body = !st.cover && /^\s*<h1[^>]*>[\s\S]*?<\/h1>/.test(body) ? body.replace(/<\/h1>/, '</h1>' + toc) : toc + body;
    }
    body = coverHtml + body;
    const tokens = (t) => esc(t).replace(/\{title\}/gi, esc(spec.title)).replace(/\{date\}/gi, today).replace(/\{page\}/gi, '1').replace(/\{pages\}/gi, '1');
    const logo = logoImg('logo');
    const header = st.header || logo ? `<header class="hdr">${logo}<span></span><span>${tokens(st.header || '')}</span></header>` : '';
    const footText = st.footer || theme.footer || '';
    const footer = footText || st.pageNumbers ? `<footer class="ftr"><span>${tokens(footText)}</span>${st.pageNumbers ? '<span>Page 1</span>' : ''}</footer>` : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(spec.title)}</title><style>
html{background:${forFile ? '#fff' : '#e9eaee'}}body{margin:0;padding:${forFile ? '0' : '22px 14px 60px'};font:${size}pt/${lineH.toFixed(2)} '${font}',Calibri,Arial,sans-serif;color:${tcol}}
.sheet{background:#fff;max-width:${width}mm;margin:0 auto;padding:${margin}mm;box-sizing:border-box;${forFile ? '' : 'box-shadow:0 1px 3px rgba(0,0,0,.12),0 8px 28px rgba(0,0,0,.10);min-height:' + Math.round((land ? pw : ph) * 0.6) + 'mm;'}}
h1,h2,h3,h4{font-family:'${hfont}',Calibri,Arial,sans-serif;color:${hcol};line-height:1.25;margin:1.3em 0 .45em}h1{font-size:${(size * 2).toFixed(1)}pt;margin-top:0}h2{font-size:${(size * 1.45).toFixed(1)}pt;border-bottom:1px solid ${accent}33;padding-bottom:.15em}h3{font-size:${(size * 1.2).toFixed(1)}pt}h4{font-size:${size}pt}
p{margin:0 0 .75em}ul,ol{margin:0 0 .8em;padding-left:1.6em}li{margin:.15em 0}a{color:${accent}}
table{border-collapse:collapse;width:100%;margin:.4em 0 1em;font-size:${(size * 0.94).toFixed(1)}pt}th,td{border:1px solid #c9ced6;padding:5px 9px;text-align:left;vertical-align:top}th{background:${hcol};color:#fff;font-weight:600}tbody tr:nth-child(even) td{background:#f6f7f9}
blockquote{margin:0 0 .9em;padding:.1em 0 .1em 14px;border-left:3px solid ${accent};color:${theme.colors.muted}}pre{background:#f4f4f6;padding:10px 12px;border-radius:6px;white-space:pre-wrap;font-size:.9em}code{font-family:Consolas,Menlo,monospace;font-size:.92em}hr{border:0;border-top:1px solid #c9ced6;margin:1.4em 0}img{max-width:100%}
.pagebreak{border-top:2px dashed #c9ced6;margin:26px -${margin}mm;position:relative;break-after:page}.pagebreak::after{content:'Page break';position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#fff;padding:0 10px;font:10px Arial,sans-serif;color:#9aa0aa;letter-spacing:.06em;text-transform:uppercase}
.hdr,.ftr{display:flex;justify-content:space-between;align-items:center;gap:12px;color:${theme.colors.muted};font-size:${(size * 0.82).toFixed(1)}pt}.hdr{border-bottom:1px solid #d9dce2;padding-bottom:8px;margin-bottom:22px}.ftr{border-top:1px solid #d9dce2;padding-top:8px;margin-top:34px}.logo{max-height:38px;max-width:180px}
.toc{margin:0 0 1.6em;padding:12px 16px;background:${accent}0f;border-radius:6px}.toc-t{font-weight:700;color:${hcol};margin-bottom:6px}.toc-2{margin:.2em 0}.toc-3{margin:.15em 0 .15em 1.4em;color:${theme.colors.muted}}
.pagebreak[data-l]::after{content:attr(data-l)}
.cols{column-gap:9mm}.cols h2{column-span:all}sup.fn{color:${accent};font-weight:600}.fnotes{margin-top:2.4em;padding-top:.7em;border-top:1px solid #c9ced6;font-size:${(size * 0.86).toFixed(1)}pt;color:${theme.colors.muted}}.fnotes div{margin:.25em 0}
mark.cm{background:#fff2a8;padding:0 1px}.cmn{display:inline-block;margin:0 0 0 6px;padding:1px 8px;border-radius:10px;background:#fff7cc;border:1px solid #ecd97a;color:#6b5a00;font:${(size * 0.78).toFixed(1)}pt/1.5 Arial,sans-serif;vertical-align:middle}.cmn::before{content:'Comment: ';font-weight:700}
.fld{background:${accent}1f;color:${hcol};border:1px dashed ${accent}88;border-radius:4px;padding:0 5px;font-size:.92em;white-space:nowrap}.fld::before{content:'«'}.fld::after{content:'»'}.noimg{color:#b42318;font-size:.9em}
.cover{min-height:${Math.round((land ? pw : ph) * 0.55)}mm;display:flex;flex-direction:column;justify-content:center}.cover-logo{max-height:70px;max-width:240px;align-self:flex-start;margin-bottom:14mm}.cover-t{font:700 ${(size * 2.9).toFixed(1)}pt/1.15 '${hfont}',Calibri,Arial,sans-serif;color:${hcol};padding-bottom:.35em;border-bottom:3px solid ${accent}}.cover-s{font-size:${(size * 1.4).toFixed(1)}pt;color:${theme.colors.muted};margin-top:.8em}.cover-l{margin-top:22mm;font-size:${(size * 1.1).toFixed(1)}pt}
${st.justify ? '.sheet p{text-align:justify}' : ''}
@media print{html{background:#fff}body{padding:0}.sheet{box-shadow:none;max-width:none;padding:0}.pagebreak{border:0;margin:0}.pagebreak::after{content:none}}
@media (max-width:640px){.sheet{padding:18px}}
</style></head><body><div class="sheet">${header}${body}${footer}</div></body></html>`;
  },

  preview(spec, theme) { return { type: 'html', html: this.html(spec, theme), fields: fieldsOf(spec.body) }; },

  // opts.compare: an earlier version to show tracked changes against.
  async render(spec, format, theme, opts = {}) {
    if (format === 'md') return Buffer.from(spec.body, 'utf8');
    if (format === 'html') return Buffer.from(this.html(spec, theme, { forFile: true }), 'utf8');
    if (format === 'pdf') {
      // The same page the preview shows, printed by Chrome with real page margins, headers and page numbers.
      const { htmlToPdf } = await import('../pdf/render.js');
      const st = spec.settings || {}; const [pw, ph] = PAGE[st.page?.size] || PAGE.A4; const land = st.page?.orientation === 'landscape';
      const w = land ? ph : pw, h = land ? pw : ph;
      const margin = typeof st.page?.margins === 'number' ? st.page.margins : MARGINS[st.page?.margins] || 25.4;
      const html = this.html({ ...spec, body: spec.body.replace(WRITE, '') }, theme, { forFile: true })
        .replace(/<header class="hdr">[\s\S]*?<\/header>/, '').replace(/<footer class="ftr">[\s\S]*?<\/footer>/, '')
        .replace('</style>', `@page{size:${w}mm ${h}mm}html,body{background:#fff}.sheet{max-width:none!important;padding:0!important;min-height:0!important}.pagebreak{border:0!important;margin:0!important;height:0}.pagebreak::after{content:none!important}mark.cm{background:none}.cmn{display:none}h1,h2,h3,h4{break-after:avoid}tr,img,blockquote{break-inside:avoid}.cover{min-height:${Math.round(h - margin * 2 - 12)}mm;break-after:page}</style>`);
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const tok = (t) => esc(t || '').replace(/\{title\}/gi, esc(spec.title)).replace(/\{date\}/gi, today).replace(/\{page\}/gi, '<span class="pageNumber"></span>').replace(/\{pages\}/gi, '<span class="totalPages"></span>');
      const bar = (l, r) => `<div style="font:8pt Arial,sans-serif;color:#6b7280;width:100%;padding:0 ${margin}mm;display:flex;justify-content:space-between;gap:10mm"><span>${l}</span><span>${r}</span></div>`;
      const footText = st.footer || theme.footer || '';
      return htmlToPdf(html, { widthMm: w, heightMm: h, margin: { top: `${margin}mm`, bottom: `${margin}mm`, left: `${margin}mm`, right: `${margin}mm` },
        header: st.header ? bar('', tok(st.header)) : '', footer: footText || st.pageNumbers ? bar(tok(footText), st.pageNumbers ? 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>' : '') : '' });
    }
    const clean = { ...spec, body: spec.body.replace(WRITE, '') };
    const images = (href) => { const m = /^file:([\w-]+)$/.exec(String(href || '').trim()); const f = m && theme.file?.(m[1]); try { return f ? f.data() : null; } catch { return null; } };
    return buildDocx(clean, theme, { images, compare: format === 'tracked' ? opts.compare || null : null });
  },

  // ----- mail merge: one copy of the document per record, {{Field}} filled from the record -----
  fields: (spec) => fieldsOf(spec.body),
  async merge(spec, records, theme, { mode = 'one', nameField = '' } = {}) {
    const rows = records.slice(0, 500);
    if (!rows.length) throw Object.assign(new Error('The data has no rows.'), { user: true });
    const fill = (rec) => ({ ...spec, title: fillFields(spec.title, rec).replace(FIELD, '').trim() || spec.title, body: fillFields(spec.body, rec) });
    if (mode === 'one') {
      // One file, each record starting on a new page. Footnotes get a suffix per copy so they stay apart.
      const bodies = rows.map((r, i) => fill(r).body.replace(/\[\^([^\]\s]{1,40})\]/g, `[^$1-${i + 1}]`));
      const all = { ...spec, settings: { ...spec.settings, toc: false }, body: bodies.join('\n\n[[section]]\n\n') };
      return { buffer: await this.render(all, 'docx', theme), ext: 'docx', count: rows.length };
    }
    const zip = new JSZip(); const used = new Set();
    const key = (k) => String(k).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    for (let i = 0; i < rows.length; i++) {
      const rec = rows[i]; const hit = nameField && Object.keys(rec).find((k) => key(k) === key(nameField));
      let name = String((hit && rec[hit]) || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').trim().slice(0, 80) || String(i + 1).padStart(3, '0');
      name = `${spec.title.replace(FIELD, '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Document'} - ${name}`;
      let n = name, k = 2; while (used.has(n.toLowerCase())) n = `${name} (${k++})`; used.add(n.toLowerCase());
      zip.file(n + '.docx', await this.render(fill(rec), 'docx', theme));
    }
    return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), ext: 'zip', count: rows.length };
  },
};
