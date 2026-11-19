// The extra syntax Word documents use on top of Markdown, shared by the .docx builder and the preview:
//   [^1] with a "[^1]: text" line        footnotes
//   {==text==}{>>comment<<}              a comment on a piece of text ({>>comment<<} alone sits at a point)
//   [[pagebreak]]  [[section: landscape]]  [[columns: 2]]   on their own line
//   [[center]] / [[right]] / [[justify]]  at the start of a paragraph
//   {{Field}}                            mail-merge fields
export const PAGE = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A5: [148, 210], A3: [297, 420] };
export const MARGINS = { normal: 25.4, narrow: 12.7, moderate: 19, wide: 38 };

// Footnotes and comments are swapped for private-use markers so the Markdown parser carries them through untouched.
const A = '', Z = '';
export const MARK = {
  split: /([^]*)/,
  foot: /^F([^]*)$/,
  cstart: /^C(\d+)$/,
  cend: /^E$/,
  all: /[^]*/g,
  align: /^\s*\[\[\s*(left|center|centre|right|justify)\s*\]\]\s*/i,
  directive: /^\[\[\s*(pagebreak|section|columns)\s*(?::\s*([^\]]*))?\]\]$/i,
};
export const DIRECTIVE_LINE = /^[ \t]*\[\[\s*(pagebreak|section|columns)\s*(?::\s*([^\]\n]*))?\]\][ \t]*$/gim;
export const FIELD = /\{\{\s*([\p{L}\p{N}_][\p{L}\p{N}_ .\-]{0,58}?)\s*\}\}/gu;

export function prepare(body) {
  const footnotes = new Map(); const comments = [];
  const lines = String(body || '').replace(/[]/g, '').split('\n');
  const kept = []; let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const m = !fence && l.match(/^\s{0,3}\[\^([^\]\s]{1,40})\]:\s*(.*)$/);
    if (!m) { kept.push(l); continue; }
    let text = m[2];
    // Indented lines that follow belong to the same note.
    while (i + 1 < lines.length && /^(\s{2,}|\t)\S/.test(lines[i + 1])) text += ' ' + lines[++i].trim();
    if (!footnotes.has(m[1])) footnotes.set(m[1], text.trim());
  }
  let text = kept.join('\n');
  text = text.replace(/\{==([\s\S]{0,2000}?)==\}\s*\{>>([\s\S]{0,1500}?)<<\}/g, (_m, t, c) => { comments.push(c.trim()); return `${A}C${comments.length - 1}${Z}${t}${A}E${Z}`; });
  text = text.replace(/\{>>([\s\S]{0,1500}?)<<\}/g, (_m, c) => { comments.push(c.trim()); return `${A}C${comments.length - 1}${Z}${A}E${Z}`; });
  text = text.replace(/\{==([\s\S]{0,2000}?)==\}/g, '$1');
  text = text.replace(/\[\^([^\]\s]{1,40})\]/g, (m, k) => (footnotes.has(k) ? `${A}F${k}${Z}` : m));
  // A directive needs blank lines around it to be a paragraph of its own.
  text = text.replace(DIRECTIVE_LINE, (m) => `\n\n${m.trim()}\n\n`);
  return { text, footnotes, comments };
}

// The plain text of inline Markdown tokens, without the private markers.
export function plainInline(tokens) {
  let out = '';
  for (const t of tokens || []) {
    if (t.type === 'br') out += ' ';
    else if (t.type === 'image') out += t.text || '';
    else if (t.type === 'codespan') out += t.text;
    else if (t.tokens?.length) out += plainInline(t.tokens);
    else out += t.text ?? t.raw ?? '';
  }
  return out.replace(MARK.all, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Mail-merge fields used in a document, in the order they first appear.
export function fieldsOf(body) {
  const seen = new Map();
  for (const m of String(body || '').matchAll(FIELD)) { const k = m[1].trim(); if (!seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k); }
  return [...seen.values()];
}
const key = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
// Fills {{Field}} with a record's values. Field names match column names loosely (case, spaces, punctuation).
export function fillFields(body, record) {
  const map = new Map(Object.entries(record).map(([k, v]) => [key(k), v]));
  return String(body || '').replace(FIELD, (m, name) => { const k = key(name); return map.has(k) ? String(map.get(k) ?? '').replace(/([\\`*_[\]|])/g, '\\$1') : m; });
}

// Scenly documents have one title (#) with sections under it (##). Text that uses # for every
// section is shifted down a level and given the title on top.
export function oneTitle(body, title) {
  let fence = false; const lines = String(body || '').split('\n'); const heads = [];
  lines.forEach((l, i) => { if (/^\s*(```|~~~)/.test(l)) fence = !fence; else if (!fence && /^\s{0,3}#{1,6}\s+\S/.test(l)) heads.push(i); });
  const isH1 = (i) => /^\s{0,3}#\s+\S/.test(lines[i]);
  const h1s = heads.filter(isH1);
  const firstText = lines.findIndex((l) => l.trim());
  const startsWithH1 = h1s.length > 0 && h1s[0] === firstText;
  if (h1s.length === 1) return lines.join('\n');
  if (!h1s.length) return `# ${title}\n\n${lines.join('\n')}`;
  // Several top-level headings, or one that is not at the top: all but a leading title move down.
  const keep = startsWithH1 && h1s.length > 1 && !/^\s{0,3}#\s+(\d+[.)]|[IVX]+[.)])\s/.test(lines[h1s[0]]) ? h1s[0] : -1;
  for (const i of heads) if (i !== keep) lines[i] = lines[i].replace(/^(\s{0,3})(#{1,5})(\s)/, '$1$2#$3');
  return keep >= 0 ? lines.join('\n') : `# ${title}\n\n${lines.join('\n')}`;
}
