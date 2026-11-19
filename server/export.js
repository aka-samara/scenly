// Turns a Markdown reply into a real Word (.docx) file, and a code project into a .zip.
// Uses jszip (already installed with mammoth) and marked, so there is nothing new to install.
import JSZip from 'jszip';
import { marked } from 'marked';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decode = (s) => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// XML 1.0 forbids most control characters; Word refuses to open a file that has one.
const clean = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');

function run(text, f = {}) {
  const props = [
    f.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '',
    f.b ? '<w:b/>' : '', f.i ? '<w:i/>' : '', f.strike ? '<w:strike/>' : '',
    f.color ? `<w:color w:val="${f.color}"/>` : '',
    f.code ? '<w:sz w:val="20"/>' : '',
    f.u ? '<w:u w:val="single"/>' : '',
    f.code && !f.block ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F1F4"/>' : '',
  ].join('');
  const parts = clean(text).split('\n');
  const body = parts.map((p, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(p)}</w:t>`).join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${body}</w:r>`;
}

function runs(tokens, f = {}) {
  let out = '';
  for (const t of tokens || []) {
    switch (t.type) {
      case 'strong': out += runs(t.tokens, { ...f, b: 1 }); break;
      case 'em': out += runs(t.tokens, { ...f, i: 1 }); break;
      case 'del': out += runs(t.tokens, { ...f, strike: 1 }); break;
      case 'codespan': out += run(decode(t.text), { ...f, code: 1 }); break;
      case 'br': out += '<w:r><w:br/></w:r>'; break;
      case 'link': out += runs(t.tokens, { ...f, u: 1, color: '0B5CAD' }); break;
      case 'image': out += run(`[Image: ${t.text || t.href}]`, { ...f, i: 1 }); break;
      case 'html': out += run(decode(String(t.text || t.raw).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')), f); break;
      default: out += t.tokens ? runs(t.tokens, f) : run(decode(t.text ?? t.raw ?? ''), f);
    }
  }
  return out;
}

function para(inner, o = {}) {
  const props = [
    o.style ? `<w:pStyle w:val="${o.style}"/>` : '',
    o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr>' : '',
    o.num ? `<w:numPr><w:ilvl w:val="${o.level || 0}"/><w:numId w:val="${o.num}"/></w:numPr>` : '',
    o.indent ? `<w:ind w:left="${o.indent}"/>` : '',
    o.align ? `<w:jc w:val="${o.align}"/>` : '',
  ].join('');
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${inner}</w:p>`;
}

function table(t) {
  const cols = t.header.length || 1;
  const width = Math.floor(9000 / cols);
  const cell = (c, i, head) => {
    const al = t.align?.[i];
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF1F5"/>' : ''}</w:tcPr>${para(runs(c.tokens, head ? { b: 1 } : {}), { style: 'Cell', align: al === 'center' ? 'center' : al === 'right' ? 'right' : '' })}</w:tc>`;
  };
  const border = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="B8BDC7"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${`<w:gridCol w:w="${width}"/>`.repeat(cols)}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${t.header.map((c, i) => cell(c, i, true)).join('')}</w:tr>`
    + t.rows.map((r) => `<w:tr>${r.map((c, i) => cell(c, i, false)).join('')}</w:tr>`).join('')
    + '</w:tbl>' + para('', { style: 'Cell' });
}

function blocks(tokens, ctx) {
  let out = '';
  for (const t of tokens || []) {
    switch (t.type) {
      case 'space': break;
      case 'heading': out += para(runs(t.tokens), { style: 'Heading' + Math.min(t.depth, 4) }); break;
      case 'paragraph': out += para(runs(t.tokens), { style: ctx.quote ? 'Quote' : '', indent: ctx.indent }); break;
      case 'text': out += para(runs(t.tokens || [{ type: 'text', text: t.text }]), { indent: ctx.indent }); break;
      case 'hr': out += para('', { border: true }); break;
      case 'code': out += String(t.text).split('\n').map((line) => para(run(line, { code: 1, block: 1 }), { style: 'Code' })).join(''); break;
      case 'blockquote': out += blocks(t.tokens, { ...ctx, quote: true }); break;
      case 'table': out += table(t); break;
      case 'html': { const txt = decode(String(t.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim(); if (txt) out += para(run(txt)); break; }
      case 'list': {
        const level = ctx.level ?? 0;
        // Each top-level list gets its own numbering instance so "1." restarts for every new list.
        const num = level === 0 || !ctx.num || ctx.ordered !== t.ordered ? ctx.nums.add(t.ordered, Number(t.start) || 1) : ctx.num;
        for (const item of t.items) {
          let first = true;
          for (const b of item.tokens) {
            if (b.type === 'list') { out += blocks([b], { ...ctx, level: level + 1, num, ordered: t.ordered }); continue; }
            if (b.type === 'space') continue;
            const box = item.task && first ? run(item.checked ? '☑ ' : '☐ ') : '';
            if (b.type === 'text' || b.type === 'paragraph') {
              out += first ? para(box + runs(b.tokens || [{ type: 'text', text: b.text }]), { num, level }) : para(runs(b.tokens || [{ type: 'text', text: b.text }]), { indent: 720 * (level + 1) });
            } else out += blocks([b], { ...ctx, indent: 720 * (level + 1) });
            first = false;
          }
        }
        break;
      }
      default: if (t.tokens) out += para(runs(t.tokens)); else if (t.text) out += para(run(decode(t.text)));
    }
  }
  return out;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[[1, 36, 320], [2, 28, 280], [3, 24, 240], [4, 22, 200]].map(([n, sz, before]) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="1A1A22"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`).join('\n')}
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F4F6"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C8CCD4"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="555B66"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Cell"><w:name w:val="Cell"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr></w:style>
</w:styles>`;

function numbering(lists) {
  const lvl = (i, ordered) => ordered
    ? `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${['decimal', 'lowerLetter', 'lowerRoman'][i % 3]}"/><w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`
    : `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${['•', '◦', '▪'][i % 3]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
  const abs = (id, ordered) => `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${Array.from({ length: 9 }, (_, i) => lvl(i, ordered)).join('')}</w:abstractNum>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${abs(0, false)}${abs(1, true)}${lists.map((l, i) => `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${l.ordered ? 1 : 0}"/>${l.ordered ? Array.from({ length: 9 }, (_, k) => `<w:lvlOverride w:ilvl="${k}"><w:startOverride w:val="${k === 0 ? l.start : 1}"/></w:lvlOverride>`).join('') : ''}</w:num>`).join('')}</w:numbering>`;
}

export function docTitle(markdown, fallback = 'Document') {
  const m = String(markdown || '').match(/^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/m);
  const t = (m ? m[1] : fallback).replace(/[*_`~[\]]/g, '').trim();
  return t.slice(0, 80) || fallback;
}
export const safeName = (s, fallback = 'document') => (String(s || '').normalize('NFKD').replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || fallback);

export async function markdownToDocx(markdown, title) {
  const lists = [];
  const nums = { add(ordered, start) { lists.push({ ordered, start }); return lists.length; } };
  const body = blocks(marked.lexer(String(markdown || '')), { nums });
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body || para('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1300" w:bottom="1440" w:left="1300" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const zip = new JSZip();
  const add = zip.file.bind(zip);
  zip.file = (name, content) => add(name, content, { createFolders: false });
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(clean(title || ''))}</dc:title><dc:creator>Scenly</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', STYLES);
  zip.file('word/numbering.xml', numbering(lists));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function filesToZip(files) {
  const zip = new JSZip();
  for (const [p, content] of Object.entries(files || {})) zip.file(p, content, { createFolders: false });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ---------- code projects ----------
const MAX_FILES = 200, MAX_FILE_BYTES = 600 * 1024;
export function cleanPath(p) {
  const s = String(p || '').trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  if (!s || s.length > 200 || s.split('/').some((seg) => !seg || seg === '..' || seg === '.') || /[\u0000-\u001f<>:"|?*]/.test(s)) return null;
  return s;
}
// Models sometimes wrap a file's content in a Markdown fence even when told not to.
const unfence = (s) => { const m = s.match(/^\s*```[\w+-]*\n([\s\S]*?)\n```\s*$/); return m ? m[1] : s.replace(/^\s*```[\w+.-]*[ \t]*\n/, ''); };

export function normalizeFileBlocks(text, streaming = false) {
  text = String(text || '');
  const open = /<file\s+path="([^"]+)"\s*>/g;
  const starts = []; let m;
  while ((m = open.exec(text))) starts.push({ i: m.index, end: open.lastIndex, path: m[1] });
  if (!starts.length) return text;
  let out = '', last = 0;
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    if (s.i < last) continue;
    const nextFile = k + 1 < starts.length ? starts[k + 1].i : text.length;
    const del = text.indexOf('<delete path=', s.end);
    const limit = del >= 0 && del < nextFile ? del : nextFile;
    const seg = text.slice(s.end, limit);
    out += text.slice(last, s.i);
    const close = seg.indexOf('</file>');
    if (close >= 0) { out += text.slice(s.i, s.end + close + 7); last = s.end + close + 7; continue; }
    // Some models end a file with a Markdown fence instead of </file>. Treat the last fence-only line as the end.
    const isLast = limit === text.length;
    const fences = [...seg.matchAll(/\n[ \t]*```[ \t]*(?=\n|$)/g)];
    const fence = fences[fences.length - 1];
    if (!fence || (isLast && streaming && !/\n[ \t]*```[ \t]*\n/.test(seg.slice(fence.index) + '\n'))) { out += text.slice(s.i, limit); last = limit; continue; }
    if (isLast && streaming && seg.slice(fence.index + fence[0].length).trim() === '' ) { out += text.slice(s.i, limit); last = limit; continue; }
    out += text.slice(s.i, s.end) + seg.slice(0, fence.index) + '\n</file>';
    last = s.end + fence.index + fence[0].length;
  }
  return out + text.slice(last);
}


// Reads the <file path="..."> ... </file> and <delete path="..."/> blocks out of a reply.
export function parseFileOps(text) {
  const ops = [];
  const re = /<file\s+path="([^"]+)"\s*>\n?([\s\S]*?)\n?<\/file>|<delete\s+path="([^"]+)"\s*\/?>(?:\s*<\/delete>)?/g;
  let m;
  text = normalizeFileBlocks(text);
  while ((m = re.exec(text))) {
    const p = cleanPath(m[1] ?? m[3]);
    if (!p) continue;
    ops.push(m[1] != null ? { action: 'write', path: p, content: unfence(m[2]) } : { action: 'delete', path: p });
  }
  return ops;
}
function lineDiff(a, b) {
  const count = new Map();
  for (const l of String(a).split('\n')) count.set(l, (count.get(l) || 0) + 1);
  let added = 0;
  for (const l of String(b).split('\n')) { const n = count.get(l) || 0; if (n > 0) count.set(l, n - 1); else added++; }
  let removed = 0; for (const n of count.values()) removed += n;
  return { added, removed };
}
// Applies a reply's file blocks to the project and returns a short record of each change.
export function applyFileOps(files, text) {
  const done = [];
  for (const op of parseFileOps(text)) {
    if (op.action === 'delete') {
      if (op.path in files) { done.push({ action: 'delete', path: op.path, removed: files[op.path].split('\n').length, added: 0 }); delete files[op.path]; }
      continue;
    }
    if (Buffer.byteLength(op.content) > MAX_FILE_BYTES) { done.push({ action: 'skip', path: op.path, note: 'File is too large to save.' }); continue; }
    const isNew = !(op.path in files);
    if (isNew && Object.keys(files).length >= MAX_FILES) { done.push({ action: 'skip', path: op.path, note: 'Project has too many files.' }); continue; }
    const d = isNew ? { added: op.content.split('\n').length, removed: 0 } : lineDiff(files[op.path], op.content);
    files[op.path] = op.content;
    done.push({ action: isNew ? 'create' : 'update', path: op.path, ...d });
  }
  return done;
}
// Past replies are sent back to the model without the file bodies; the current files travel in the system prompt.
export const stripFileBodies = (text) => normalizeFileBlocks(text)
  .replace(/<file\s+path="([^"]+)"\s*>[\s\S]*?<\/file>/g, '[wrote $1]')
  .replace(/<file\s+path="([^"]+)"\s*>[\s\S]*$/, '[started $1, not saved]')
  .replace(/<delete\s+path="([^"]+)"\s*\/?>/g, '[deleted $1]');
