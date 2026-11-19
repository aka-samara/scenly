// Builds the real .docx with the `docx` library: true heading styles, numbered and bulleted lists,
// tables, images, footnotes, a table of contents, headers and footers with page numbers, sections,
// columns, comments, and (optionally) tracked changes against an earlier version.
import { marked } from 'marked';
import { diffArrays, diffWordsWithSpace } from 'diff';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  Header, Footer, PageNumber, TableOfContents, ExternalHyperlink, FootnoteReferenceRun, ImageRun, PageBreak, LevelFormat, SectionType,
  PageOrientation, InsertedTextRun, DeletedTextRun, CommentRangeStart, CommentRangeEnd, CommentReference, TabStopType, VerticalAlign, TableLayoutType,
} from 'docx';
import { PAGE, MARGINS, prepare, plainInline, MARK } from './markup.js';

const mm = (v) => Math.round((v / 25.4) * 1440); // millimetres → twips
const hex = (c) => String(c || '#000000').replace('#', '').toUpperCase();
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED, centre: AlignmentType.CENTER };

// Reads width and height from PNG, JPEG and GIF data.
export function imageSize(buf) {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (buf[0] === 0x47 && buf[1] === 0x49) return { type: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'jpg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch { /* not an image we can place */ }
  return null;
}

// opts: { images: (ref) => Buffer|null, compare: older spec to track changes against, author }
export async function buildDocx(spec, theme, opts = {}) {
  const st = spec.settings || {}, th = st.theme || {};
  const font = th.font || theme.fonts.body, hfont = th.headingFont || theme.fonts.heading;
  const hcol = hex(th.headingColor || theme.colors.primary), accent = hex(th.accent || theme.colors.accent), tcol = hex(th.textColor || theme.colors.text), muted = hex(theme.colors.muted || '#6B7280');
  const size = (th.fontSize || 11) * 2; // half-points
  const author = opts.author || 'Scenly';
  const now = new Date();
  const pageOf = (page = {}) => {
    const [w, h] = PAGE[page.size] || PAGE.A4; const land = page.orientation === 'landscape';
    const m = typeof page.margins === 'number' ? page.margins : MARGINS[page.margins] || 25.4;
    return { width: mm(land ? h : w), height: mm(land ? w : h), margin: mm(m), land };
  };
  const base = pageOf(st.page);

  const prep = prepare(spec.body);
  const footnotes = {}; let footN = 0; const footIds = new Map();
  const comments = []; let revId = 1;
  const numbering = [{ reference: 'bullets', levels: [0, 1, 2, 3, 4].map((l) => ({ level: l, format: LevelFormat.BULLET, text: ['•', '◦', '▪', '•', '◦'][l], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (l + 1) - 360 + 360, hanging: 360 } } } })) },
    { reference: 'numbers', levels: [0, 1, 2, 3, 4].map((l) => ({ level: l, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN, LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER][l], text: `%${l + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } })) }];
  let listInstance = 0;

  // ----- inline text -----
  const mkRun = (text, f, mode) => {
    const props = { text, bold: f.bold || undefined, italics: f.italic || undefined, strike: f.strike || undefined, font: f.code ? 'Consolas' : undefined, shading: f.code ? { type: ShadingType.CLEAR, fill: 'F1F2F4' } : f.mark ? { type: ShadingType.CLEAR, fill: 'FFF2A8' } : undefined, color: f.link ? accent : f.color, underline: f.link ? {} : undefined, superScript: f.sup || undefined, subScript: f.sub || undefined, size: f.size };
    if (mode === 'ins') return new InsertedTextRun({ ...props, id: revId++, author, date: now.toISOString() });
    if (mode === 'del') return new DeletedTextRun({ ...props, id: revId++, author, date: now.toISOString() });
    return new TextRun(props);
  };
  const footnoteRun = (key) => {
    if (!prep.footnotes.has(key)) return null;
    if (!footIds.has(key)) { const id = ++footN; footIds.set(key, id); footnotes[id] = { children: [new Paragraph({ children: inline(marked.lexer(prep.footnotes.get(key))[0]?.tokens || [{ type: 'text', text: prep.footnotes.get(key) }], {}, null) })] }; }
    return new FootnoteReferenceRun(footIds.get(key));
  };
  // Leaf text may hold the private markers for footnotes and comments (see markup.js).
  const leaf = (text, f, mode, out) => {
    const parts = String(text).split(MARK.split);
    for (const p of parts) {
      if (!p) continue;
      let m;
      if ((m = p.match(MARK.foot))) { const r = footnoteRun(m[1]); if (r && mode !== 'del') out.push(r); }
      else if ((m = p.match(MARK.cstart))) { const id = Number(m[1]); const c = prep.comments[id]; if (c && mode !== 'del') { comments.push({ id, author: 'Scenly', date: now, children: [new Paragraph({ children: [new TextRun(c)] })] }); out.push(new CommentRangeStart(id)); f = { ...f, mark: true, cid: id }; } out.state = f; }
      else if (p.match(MARK.cend)) { if (out.state?.cid != null && mode !== 'del') { out.push(new CommentRangeEnd(out.state.cid), new TextRun({ children: [new CommentReference(out.state.cid)] })); } out.state = null; f = { ...f, mark: false, cid: undefined }; }
      else out.push(mkRun(p, out.state ? { ...f, mark: true } : f, mode));
    }
  };
  function inline(tokens, f = {}, mode = null, out = []) {
    for (const t of tokens || []) {
      if (t.type === 'strong') inline(t.tokens, { ...f, bold: true }, mode, out);
      else if (t.type === 'em') inline(t.tokens, { ...f, italic: true }, mode, out);
      else if (t.type === 'del') inline(t.tokens, { ...f, strike: true }, mode, out);
      else if (t.type === 'codespan') out.push(mkRun(t.text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"), { ...f, code: true }, mode));
      else if (t.type === 'br') out.push(new TextRun({ break: 1 }));
      else if (t.type === 'link') {
        const kids = inline(t.tokens, { ...f, link: true }, mode, []);
        if (/^(https?:|mailto:)/i.test(t.href) && !mode) out.push(new ExternalHyperlink({ link: t.href, children: kids })); else out.push(...kids);
      } else if (t.type === 'image') { const img = imageRun(t.href, t.title, t.text); if (img) out.push(img); else if (t.text) out.push(mkRun(`[${t.text}]`, { ...f, italic: true }, mode)); }
      else if (t.type === 'html') { /* raw HTML is dropped */ }
      else if (t.tokens?.length) inline(t.tokens, f, mode, out);
      else leaf(unescape(t.text ?? t.raw ?? ''), f, mode, out);
    }
    return out;
  }
  const unescape = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const contentWidthPx = (pg) => Math.round(((pg.width - 2 * pg.margin) / 1440) * 96);
  let curPage = base, curCols = 1;
  function imageRun(href, title, alt) {
    const buf = opts.images?.(href); if (!buf) return null;
    const dim = imageSize(buf); if (!dim) return null;
    const max = contentWidthPx(curPage) / curCols;
    const pct = /(\d{1,3})\s*%/.exec(title || '')?.[1];
    let w = pct ? (max * Math.min(100, Number(pct))) / 100 : Math.min(max, dim.width);
    const h = Math.round((w / dim.width) * dim.height);
    return new ImageRun({ type: dim.type, data: buf, transformation: { width: Math.round(w), height: h }, altText: { title: alt || 'Image', description: alt || 'Image', name: alt || 'Image' } });
  }

  // ----- blocks -----
  const para = (children, o = {}) => new Paragraph({ children, ...o });
  function cellParas(tokens, f, mode, align) { return [para(inline(tokens, f, mode), { alignment: align, spacing: { before: 40, after: 40 } })]; }
  function table(t, mode, pg, older) {
    const cols = t.header.length;
    const total = (pg.width - 2 * pg.margin) / curCols;
    const lens = t.header.map((hd, i) => Math.max(plainInline(hd.tokens).length, ...t.rows.map((r) => plainInline(r[i]?.tokens || []).length), 3));
    const capped = lens.map((l) => Math.min(Math.max(l, 6), 40)); const sum = capped.reduce((a, b) => a + b, 0);
    const widths = capped.map((l) => Math.floor((l / sum) * total));
    const al = (i) => ALIGN[t.align?.[i]] || AlignmentType.LEFT;
    const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9CED6' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const margins = { top: 60, bottom: 60, left: 110, right: 110 };
    const row = (cells, head, zebra, was) => new TableRow({ tableHeader: head || undefined, cantSplit: true, children: cells.slice(0, cols).concat(Array(Math.max(0, cols - cells.length)).fill({ tokens: [] })).map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, borders, margins, verticalAlign: VerticalAlign.CENTER,
      shading: head ? { type: ShadingType.CLEAR, fill: hcol } : zebra ? { type: ShadingType.CLEAR, fill: 'F6F7F9' } : undefined,
      children: was?.[i] ? [para(diffRuns(was[i].tokens, c.tokens, head ? { bold: true, color: 'FFFFFF' } : {}), { alignment: al(i), spacing: { before: 40, after: 40 } })] : cellParas(c.tokens, head ? { bold: true, color: 'FFFFFF' } : {}, mode, al(i)) })) });
    return new Table({ width: { size: Math.floor(total), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, rows: [row(t.header, true, false, older?.header), ...t.rows.map((r, i) => row(r, false, i % 2 === 1, older?.rows[i]))] });
  }
  function list(t, level, mode, out) {
    const instance = level === 0 ? ++listInstance : listInstance;
    for (const item of t.items) {
      let first = true;
      for (const b of item.tokens) {
        if (b.type === 'list') { list(b, Math.min(level + 1, 4), mode, out); continue; }
        if (b.type === 'space') continue;
        const kids = [];
        if (first && item.task) kids.push(mkRun(item.checked ? '☑ ' : '☐ ', {}, mode));
        inline(b.tokens || [{ type: 'text', text: b.text || b.raw || '' }], {}, mode, kids);
        out.push(para(kids, first ? { numbering: { reference: t.ordered ? 'numbers' : 'bullets', level, instance: t.ordered ? instance * 10 + level : 0 }, spacing: { after: 60 } } : { indent: { left: 720 * (level + 1) }, spacing: { after: 60 } }));
        first = false;
      }
    }
  }
  // One Markdown block → docx blocks. `mode` marks everything as inserted or deleted (tracked changes).
  function block(t, mode, out, pg) {
    if (t.type === 'heading') out.push(para(inline(t.tokens, {}, mode), { heading: HEADINGS[t.depth - 1] }));
    else if (t.type === 'paragraph') {
      let tokens = t.tokens; let alignment;
      const first = tokens[0];
      if (first?.type === 'text') { const m = first.text.match(MARK.align); if (m) { alignment = ALIGN[m[1].toLowerCase()]; tokens = [{ ...first, text: first.text.slice(m[0].length), tokens: undefined }, ...tokens.slice(1)]; } }
      const only = tokens.length === 1 && tokens[0].type === 'image';
      out.push(para(inline(tokens, {}, mode), { alignment: alignment || (only ? AlignmentType.CENTER : st.justify ? AlignmentType.JUSTIFIED : undefined) }));
    } else if (t.type === 'list') list(t, 0, mode, out);
    else if (t.type === 'table') { out.push(table(t, mode, pg)); out.push(para([], { spacing: { after: 80 } })); }
    else if (t.type === 'blockquote') { for (const b of t.tokens) { if (b.type === 'paragraph') out.push(para(inline(b.tokens, { italic: true, color: muted }, mode), quoteProps)); else block(b, mode, out, pg); } }
    else if (t.type === 'code') for (const line of t.text.split('\n')) out.push(para([mkRun(line || ' ', { code: true }, mode)], { spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: 'F4F4F6' } }));
    else if (t.type === 'hr') out.push(para([], { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9CED6', space: 1 } }, spacing: { after: 160 } }));
    else if (t.type === 'html' || t.type === 'space') { /* nothing */ }
    else if (t.tokens) out.push(para(inline(t.tokens, {}, mode)));
    else if (t.text) out.push(para([mkRun(t.text, {}, mode)]));
  }
  const quoteProps = { indent: { left: 400 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: accent, space: 12 } }, spacing: { after: 120 } };

  // Inline pieces of a paragraph as flat segments, so a word-level comparison can keep the new formatting.
  function segments(tokens, f = {}, out = []) {
    for (const t of tokens || []) {
      if (t.type === 'strong') segments(t.tokens, { ...f, bold: true }, out);
      else if (t.type === 'em') segments(t.tokens, { ...f, italic: true }, out);
      else if (t.type === 'del') segments(t.tokens, { ...f, strike: true }, out);
      else if (t.type === 'link') segments(t.tokens, { ...f, link: true }, out);
      else if (t.type === 'codespan') out.push({ text: unescape(t.text), f: { ...f, code: true } });
      else if (t.type === 'br') out.push({ text: ' ', f });
      else if (t.type === 'image') { const img = imageRun(t.href, t.title, t.text); if (img) out.push({ node: img }); }
      else if (t.type === 'html') { /* dropped */ }
      else if (t.tokens?.length) segments(t.tokens, f, out);
      else for (const p of unescape(t.text ?? t.raw ?? '').split(MARK.split)) { if (!p) continue; out.push(MARK.split.test(p) ? { marker: p, f } : { text: p, f }); }
    }
    return out;
  }
  function diffRuns(oldTokens, newTokens, base = {}) {
    const segs = segments(newTokens, base); const out = [];
    let si = 0, off = 0;
    const take = (n, mode) => {
      while (si < segs.length && (n > 0 || !segs[si].text)) {
        const s = segs[si];
        if (s.node) { out.push(s.node); si++; continue; }
        if (s.marker) { leaf(s.marker, s.f, null, out); si++; continue; }
        const chunk = s.text.slice(off, off + n);
        if (chunk) out.push(mkRun(chunk, out.state ? { ...s.f, mark: true } : s.f, mode));
        n -= chunk.length; off += chunk.length;
        if (off >= s.text.length) { si++; off = 0; }
      }
    };
    for (const d of diffWordsWithSpace(plainInline(oldTokens), segs.map((x) => x.text || '').join(''))) {
      if (d.removed) out.push(mkRun(d.value, base, 'del')); else take(d.value.length, d.added ? 'ins' : null);
    }
    take(0, null);
    return out;
  }
  // Tracked changes: compare block by block, then word by word inside paragraphs, headings and table cells that changed.
  function tracked(oldTokens, newTokens, emit) {
    const key = (t) => t.raw.trim().replace(/\s+/g, ' ');
    const parts = diffArrays(oldTokens.map(key), newTokens.map(key));
    let oi = 0, ni = 0;
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      if (!part.added && !part.removed) { for (let k = 0; k < part.count; k++) { emit(newTokens[ni++], null); oi++; } continue; }
      if (part.removed && parts[p + 1]?.added) {
        const olds = oldTokens.slice(oi, oi + part.count), news = newTokens.slice(ni, ni + parts[p + 1].count);
        const n = Math.min(olds.length, news.length);
        for (let k = 0; k < n; k++) {
          const a = olds[k], b = news[k];
          if (a.type === b.type && (a.type === 'paragraph' || a.type === 'heading') && a.depth === b.depth && !MARK.directive.test(b.raw.trim())) emit(b, null, a);
          else if (a.type === 'table' && b.type === 'table' && a.header.length === b.header.length && a.rows.length === b.rows.length) emit(b, null, a);
          else { emit(a, 'del'); emit(b, 'ins'); }
        }
        for (const a of olds.slice(n)) emit(a, 'del');
        for (const b of news.slice(n)) emit(b, 'ins');
        oi += part.count; ni += parts[p + 1].count; p++;
      } else if (part.removed) { for (let k = 0; k < part.count; k++) emit(oldTokens[oi++], 'del'); }
      else { for (let k = 0; k < part.count; k++) emit(newTokens[ni++], 'ins'); }
    }
  }

  // ----- header, footer, cover -----
  const logoBuf = theme.logo?.data; const logoDim = logoBuf ? imageSize(logoBuf) : null;
  const logoRun = (h) => (logoDim ? new ImageRun({ type: logoDim.type, data: logoBuf, transformation: { width: Math.round((h / logoDim.height) * logoDim.width), height: h } }) : null);
  const tokens = (text, f) => String(text).split(/(\{page\}|\{pages\}|\{title\}|\{date\})/i).filter(Boolean).map((p) => {
    const k = p.toLowerCase();
    if (k === '{page}') return new TextRun({ children: [PageNumber.CURRENT], ...f }); if (k === '{pages}') return new TextRun({ children: [PageNumber.TOTAL_PAGES], ...f });
    return new TextRun({ text: k === '{title}' ? spec.title : k === '{date}' ? now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : p, ...f });
  });
  const small = { size: Math.max(14, size - 5), color: muted };
  const rightTab = (pg) => [{ type: TabStopType.RIGHT, position: pg.width - 2 * pg.margin }];
  const headerFor = (pg) => {
    const lg = logoRun(26);
    if (!st.header && !lg) return undefined;
    return new Header({ children: [para([...(lg ? [lg] : []), new TextRun({ text: '\t', ...small }), ...tokens(st.header || '', small)], { tabStops: rightTab(pg), border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D9DCE2', space: 6 } }, spacing: { after: 200 } })] });
  };
  const footerFor = (pg) => {
    const text = st.footer || theme.footer || '';
    if (!text && !st.pageNumbers) return undefined;
    return new Footer({ children: [para([...tokens(text, small), ...(st.pageNumbers ? [new TextRun({ text: '\t', ...small }), new TextRun({ text: 'Page ', ...small }), new TextRun({ children: [PageNumber.CURRENT], ...small }), new TextRun({ text: ' of ', ...small }), new TextRun({ children: [PageNumber.TOTAL_PAGES], ...small })] : [])], { tabStops: rightTab(pg), border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D9DCE2', space: 6 } } })] });
  };
  const cover = () => {
    const c = st.cover; if (!c) return [];
    const lg = logoRun(64); const out = [];
    out.push(para(lg ? [lg] : [], { spacing: { before: 1400, after: 900 } }));
    out.push(para([new TextRun({ text: spec.title, bold: true, size: 64, color: hcol, font: hfont })], { spacing: { after: 240, line: 240, lineRule: 'auto' }, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: accent, space: 14 } } }));
    if (c.subtitle) out.push(para([new TextRun({ text: c.subtitle, size: 30, color: muted })], { spacing: { before: 240, after: 1600 } }));
    for (const line of [c.author, c.organisation || c.organization || theme.company, c.date === true ? now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : c.date].filter(Boolean)) out.push(para([new TextRun({ text: String(line), size: 24, color: tcol })], { spacing: { after: 80 } }));
    out.push(para([new PageBreak()]));
    return out;
  };

  // ----- sections: [[section: landscape]], [[columns: 2]] and friends split the document -----
  const live = (list) => list.filter((t) => t.type !== 'space');
  const lex = (text) => marked.lexer(text, { gfm: true, breaks: true });
  const newTokens = live(lex(prep.text));
  const oldTokens = opts.compare ? live(lex(prepare(opts.compare.body).text)) : null;
  const sections = [];
  let cur = { page: base, cols: st.columns || 1, type: undefined, children: [...cover()] };
  curPage = cur.page; curCols = cur.cols;
  const allHeads = newTokens.filter((t) => t.type === 'heading' && t.depth >= 2 && t.depth <= 3).map((t) => ({ title: plainInline(t.tokens), level: t.depth - 1 }));
  const toc = () => [new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '2-3', cachedEntries: allHeads }), para([new PageBreak()])];
  const titleFirst = newTokens[0]?.type === 'heading' && newTokens[0].depth === 1;
  // The contents list follows the title; with a cover page the cover carries the title instead.
  let tocDue = !!st.toc, skipTitle = !!st.cover && titleFirst;
  if (tocDue && (!titleFirst || st.cover)) { cur.children.push(...toc()); tocDue = false; }
  const emit = (t, mode, older) => {
    if (t.type === 'paragraph') {
      const m = t.raw.trim().match(MARK.directive);
      if (m) {
        if (mode === 'del') return;
        const kind = m[1].toLowerCase(), arg = (m[2] || '').trim().toLowerCase();
        if (kind === 'pagebreak') { cur.children.push(para([new PageBreak()])); return; }
        sections.push(cur);
        const page = kind === 'section' ? pageOf({ ...st.page, orientation: /landscape/.test(arg) ? 'landscape' : /portrait/.test(arg) ? 'portrait' : st.page?.orientation }) : cur.page;
        const cols = kind === 'columns' ? Math.min(3, Math.max(1, Number(arg) || 1)) : /(\d)\s*col/.test(arg) ? Math.min(3, Math.max(1, Number(/(\d)\s*col/.exec(arg)[1]))) : 1;
        cur = { page, cols, type: kind === 'columns' ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE, children: [] };
        curPage = cur.page; curCols = cur.cols;
        return;
      }
    }
    if (skipTitle && mode !== 'del' && t === newTokens[0]) { skipTitle = false; return; }
    if (older && t.type === 'table') { cur.children.push(table(t, null, cur.page, older), para([], { spacing: { after: 80 } })); }
    else if (older) cur.children.push(para(diffRuns(older.tokens, t.tokens), t.type === 'heading' ? { heading: HEADINGS[t.depth - 1] } : {}));
    else block(t, mode, cur.children, cur.page);
    if (tocDue && mode !== 'del' && t.type === 'heading' && t.depth === 1) { cur.children.push(...toc()); tocDue = false; }
  };
  if (oldTokens) tracked(oldTokens, newTokens, emit); else for (const t of newTokens) emit(t, null);
  if (tocDue) cur.children.unshift(...toc());
  sections.push(cur);

  const headingStyle = (sz, before, after, extra = {}) => ({ run: { font: hfont, size: sz, bold: true, color: hcol }, paragraph: { spacing: { before, after }, keepNext: true, ...extra } });
  const doc = new Document({
    creator: theme.company || author, title: spec.title, description: 'Made with Scenly Docs Studio',
    features: { updateFields: !!st.toc },
    styles: {
      default: {
        document: { run: { font, size, color: tcol }, paragraph: { spacing: { after: 140, line: Math.round(240 * (st.lineSpacing || 1.15)) } } },
        title: headingStyle(size * 2, 0, 200),
        heading1: headingStyle(Math.round(size * 1.9), 0, 220),
        heading2: headingStyle(Math.round(size * 1.45), 320, 140, { border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: accent, space: 3 } } }),
        heading3: headingStyle(Math.round(size * 1.2), 260, 100),
        heading4: headingStyle(size, 200, 80),
        hyperlink: { run: { color: accent, underline: {} } },
      },
    },
    numbering: { config: numbering },
    footnotes,
    comments: { children: comments },
    sections: sections.filter((s, i) => s.children.length || i === 0).map((s) => ({
      properties: { type: s.type, page: { size: { width: s.page.land ? s.page.height : s.page.width, height: s.page.land ? s.page.width : s.page.height, orientation: s.page.land ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: s.page.margin, bottom: s.page.margin, left: s.page.margin, right: s.page.margin } }, column: s.cols > 1 ? { count: s.cols, space: 500 } : undefined, titlePage: !!st.cover && s === sections[0] },
      headers: headerFor(s.page) ? { default: headerFor(s.page) } : undefined,
      footers: footerFor(s.page) ? { default: footerFor(s.page) } : undefined,
      children: s.children.length ? s.children : [para([])],
    })),
  });
  return Packer.toBuffer(doc);
}
