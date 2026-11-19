// The text a slide is written in, shared by the preview, the .pptx builder and the editors:
//   # Title            ## Subtitle
//   - bullet           (two spaces deeper for a sub-bullet)   1. numbered
//   plain lines are paragraphs;  > a quote   -- who said it
//   | a | b |  Markdown tables
//   <chart type="bar" labels="A,B" series="2024: 1,2; 2025: 3,4"/>
//   <image src="file:ID"/>  or  <image prompt="what to generate"/>
//   <stat value="82%" label="On-time delivery"/>
//   <left> … </left> <right> … </right> for two columns
import { attrs, parseChart } from '../pdf/components.js';

export const LAYOUTS = ['title', 'section', 'content', 'two-column', 'image-left', 'image-right', 'image-full', 'chart', 'table', 'stats', 'quote', 'steps', 'closing'];
const TAG = (name) => new RegExp(`<${name}\\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(?:\\/>|>([\\s\\S]*?)<\\/${name}\\s*>|>)`, 'gi');

// Inline Markdown → runs: [{ text, bold, italic, code, link }]
export function runs(text) {
  const out = []; const s = String(text ?? '');
  const re = /(\*\*|__)(.+?)\1|(\*|_)(?=\S)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+)\)/g; let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    if (m[2] != null) out.push({ text: m[2], bold: true });
    else if (m[4] != null) out.push({ text: m[4], italic: true });
    else if (m[5] != null) out.push({ text: m[5], code: true });
    else out.push({ text: m[6], link: m[7] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.filter((r) => r.text !== '').map((r) => ({ ...r, text: r.text.replace(/\\([*_`[\]#|<>-])/g, '$1') }));
}
export const plain = (text) => runs(text).map((r) => r.text).join('');

// Lines of text → blocks: text (paragraphs with levels), table, chart, image, stats, quote.
function blocksOf(src) {
  const blocks = []; let text = null; let table = null; let stats = null;
  const flush = () => { if (text) blocks.push(text); if (table) blocks.push(table); if (stats) blocks.push(stats); text = table = stats = null; };
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  for (let raw of lines) {
    const line = raw.replace(/\s+$/, ''); const t = line.trim();
    if (!t) { if (table || stats) flush(); continue; }
    let m;
    if ((m = /^<chart\b([^]*?)\/?>(?:([^]*?)<\/chart>)?$/i.exec(t))) { flush(); const c = parseChart(attrs(m[1]), m[2]); if (c.series.length) blocks.push({ kind: 'chart', chart: c }); continue; }
    if ((m = /^<image\b([^]*?)\/?>(?:<\/image>)?$/i.exec(t))) { flush(); const a = attrs(m[1]); blocks.push({ kind: 'image', src: a.src || '', prompt: a.prompt || '', alt: a.alt || a.caption || '', fit: /contain|fit|logo/i.test(a.fit || '') ? 'contain' : 'cover' }); continue; }
    if ((m = /^<stat\b([^]*?)\/?>(?:<\/stat>)?$/i.exec(t))) { if (text || table) flush(); const a = attrs(m[1]); stats ||= { kind: 'stats', items: [] }; stats.items.push({ value: String(a.value || '').slice(0, 24), label: String(a.label || '').slice(0, 90) }); continue; }
    if (/^\|.*\|$/.test(t)) { if (text || stats) flush(); if (/^\|[\s:|-]+\|$/.test(t)) { if (table) table.header = true; continue; } table ||= { kind: 'table', rows: [], header: false }; table.rows.push(t.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))); continue; }
    if (table || stats) flush();
    if ((m = /^>\s?(.*)$/.exec(t))) { const last = blocks.at(-1); if (!text && last?.kind === 'quote') last.text += ' ' + m[1]; else { flush(); blocks.push({ kind: 'quote', text: m[1], by: '' }); } continue; }
    if ((m = /^(?:--|—|–)\s*(.+)$/.exec(t)) && blocks.at(-1)?.kind === 'quote' && !text) { blocks.at(-1).by = m[1]; continue; }
    text ||= { kind: 'text', paras: [] };
    const indent = Math.min(2, Math.floor((line.length - line.trimStart().length) / 2));
    if ((m = /^[-*•]\s+(.*)$/.exec(t))) text.paras.push({ text: m[1], level: indent, bullet: 'dot' });
    else if ((m = /^(\d{1,2})[.)]\s+(.*)$/.exec(t))) text.paras.push({ text: m[2], level: indent, bullet: 'num', n: Number(m[1]) });
    else if ((m = /^#{3,6}\s+(.*)$/.exec(t))) text.paras.push({ text: m[1], level: 0, bullet: '', head: true });
    else text.paras.push({ text: t, level: 0, bullet: '' });
  }
  flush();
  return blocks;
}

// A slide's text → { title, subtitle, blocks, left, right }
export function parseSlide(src) {
  let s = String(src || '');
  const out = { title: '', subtitle: '', blocks: [], left: null, right: null };
  s = s.replace(TAG('left'), (_m, _a, body) => { out.left = blocksOf(body); return ''; }).replace(TAG('right'), (_m, _a, body) => { out.right = blocksOf(body); return ''; });
  const rest = [];
  for (const line of s.split('\n')) {
    let m;
    if (!out.title && (m = /^\s*#\s+(.*)$/.exec(line))) out.title = m[1].trim();
    else if (!out.subtitle && !rest.some((l) => l.trim()) && (m = /^\s*##\s+(.*)$/.exec(line))) out.subtitle = m[1].trim();
    else rest.push(line.replace(/^(\s*)##\s+/, '$1### '));
  }
  out.blocks = blocksOf(rest.join('\n'));
  return out;
}

// What a slide holds, for choosing a layout when none is given.
export function guessLayout(p, index, total) {
  const kinds = new Set(p.blocks.map((b) => b.kind));
  if (p.left || p.right) return 'two-column';
  if (!p.blocks.length) return index === 0 ? 'title' : index === total - 1 && /thank|question|contact|q\s*&\s*a/i.test(p.title) ? 'closing' : 'section';
  if (kinds.has('quote') && p.blocks.length === 1) return 'quote';
  if (kinds.has('stats') && !kinds.has('chart') && !kinds.has('image')) return 'stats';
  if (kinds.has('chart')) return 'chart';
  if (kinds.has('table')) return 'table';
  if (kinds.has('image')) return 'image-right';
  return 'content';
}
export const wordsOf = (src) => plain(String(src || '').replace(/<[^>]*>/g, ' ')).split(/\s+/).filter(Boolean).length;
