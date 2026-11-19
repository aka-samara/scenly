// Opens an uploaded .docx as a Docs Studio document: the text becomes Markdown (headings, lists, tables,
// pictures, footnotes), and the page setup, fonts, colours, header and footer are read from the file.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { PAGE, oneTitle } from './markup.js';
import { storeImage } from '../../files.js';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

const attr = (xml, tag, name) => { const m = new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`).exec(xml || ''); return m ? m[1] : null; };
const twipMm = (v) => (Number(v) / 1440) * 25.4;
const unxml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Text of a header or footer part, with page-number fields turned into {page} and {pages}.
function partText(xml) {
  if (!xml) return { text: '', page: false };
  let page = false;
  const paras = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => {
    let out = '';
    for (const m of p[0].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:instrText\b[^>]*>([^<]*)<\/w:instrText>|<w:fldSimple\b[^>]*w:instr="([^"]*)"|<w:tab\/>/g)) {
      const instr = m[2] ?? m[3];
      if (m[1] != null) out += unxml(m[1]);
      else if (instr != null) { if (/\bNUMPAGES\b/.test(instr)) out += '{pages}'; else if (/\bPAGE\b/.test(instr)) { out += '{page}'; page = true; } }
      else out += '  ';
    }
    return out.trim();
  }).filter(Boolean);
  // A field's cached result ("3") follows its instruction; drop digits right after a token.
  const text = paras.join('  ').replace(/(\{pages?\})\s*\d+/g, '$1').replace(/\s{3,}/g, '  ').slice(0, 200);
  return { text, page };
}

export async function settingsFrom(buf) {
  const s = { page: {}, theme: {} };
  let zip; try { zip = await JSZip.loadAsync(buf); } catch { return s; }
  const read = async (p) => { try { return (await zip.file(p)?.async('string')) || ''; } catch { return ''; } };
  const doc = await read('word/document.xml'), styles = await read('word/styles.xml'), themeXml = await read('word/theme/theme1.xml'), rels = await read('word/_rels/document.xml.rels');
  const sect = doc.slice(doc.lastIndexOf('<w:sectPr'));
  const w = Number(attr(sect, 'w:pgSz', 'w:w')), h = Number(attr(sect, 'w:pgSz', 'w:h'));
  if (w && h) {
    const land = attr(sect, 'w:pgSz', 'w:orient') === 'landscape' || w > h;
    const [sw, sh] = [twipMm(Math.min(w, h)), twipMm(Math.max(w, h))];
    s.page.size = Object.entries(PAGE).find(([, [pw, ph]]) => Math.abs(pw - sw) < 4 && Math.abs(ph - sh) < 4)?.[0] || 'A4';
    s.page.orientation = land ? 'landscape' : 'portrait';
  }
  const left = Number(attr(sect, 'w:pgMar', 'w:left'));
  if (left) s.page.margins = Math.round(twipMm(left) * 10) / 10;
  const cols = Number(attr(sect, 'w:cols', 'w:num')); if (cols > 1 && cols <= 3) s.columns = cols;

  const themeFont = (which) => { const m = new RegExp(`<a:${which}Font>[\\s\\S]*?<a:latin typeface="([^"]+)"`).exec(themeXml); return m ? m[1] : null; };
  const fontOf = (xml) => attr(xml, 'w:rFonts', 'w:ascii') || (/asciiTheme="major/.test(xml) ? themeFont('major') : /asciiTheme="minor/.test(xml) ? themeFont('minor') : null);
  const styleXml = (idOrName) => new RegExp(`<w:style\\b[^>]*w:styleId="${idOrName}"[\\s\\S]*?<\\/w:style>`, 'i').exec(styles)?.[0] || '';
  const defaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(styles)?.[0] || '';
  const normal = styleXml('Normal');
  const font = fontOf(normal) || fontOf(defaults) || themeFont('minor');
  if (font) s.theme.font = font;
  const sz = Number(attr(normal, 'w:sz', 'w:val') || attr(defaults, 'w:sz', 'w:val')); if (sz) s.theme.fontSize = sz / 2;
  const h1 = styleXml('Heading1'), h2 = styleXml('Heading2');
  const hfont = fontOf(h1) || themeFont('major'); if (hfont) s.theme.headingFont = hfont;
  const themeColour = (name) => { const m = new RegExp(`<a:${name}>\\s*<a:(?:srgbClr val|sysClr[^>]*lastClr)="([0-9A-Fa-f]{6})"`).exec(themeXml); return m ? '#' + m[1].toUpperCase() : null; };
  const colourOf = (xml) => { const v = attr(xml, 'w:color', 'w:val'); if (v && /^[0-9A-Fa-f]{6}$/.test(v)) return '#' + v.toUpperCase(); const t = attr(xml, 'w:color', 'w:themeColor'); return t ? themeColour(t.replace(/^text(\d)$/, 'dk$1').replace(/^background(\d)$/, 'lt$1')) : null; };
  const hc = colourOf(h1) || colourOf(h2); if (hc && hc !== '#000000') { s.theme.headingColor = hc; s.theme.accent = colourOf(h2) || hc; }
  const tc = colourOf(normal); if (tc) s.theme.textColor = tc;

  const target = (type) => { const id = new RegExp(`<w:${type}Reference\\b[^>]*w:type="default"[^>]*r:id="([^"]+)"|<w:${type}Reference\\b[^>]*r:id="([^"]+)"[^>]*w:type="default"`).exec(sect); const rid = id?.[1] || id?.[2]; const t = rid && new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"|<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels); return t ? 'word/' + (t[1] || t[2]).replace(/^\/?word\//, '') : null; };
  const head = partText(await read(target('header') || 'word/header1.xml'));
  const foot = partText(await read(target('footer') || 'word/footer1.xml'));
  if (head.text) s.header = head.text;
  const footOnlyPage = /^(page\s*)?\{page\}(\s*(of|\/)\s*\{pages\})?$/i.test(foot.text.trim());
  if (foot.text && !footOnlyPage) s.footer = foot.text.replace(/\s*(page\s*)?\{page\}(\s*(of|\/)\s*\{pages\})?\s*$/i, '').trim() || undefined;
  if (foot.page || head.page) s.pageNumbers = true;
  if (/TOC\s+\\o|w:docPartGallery w:val="Table of Contents"/.test(doc)) s.toc = true;
  return s;
}

export async function importDocx(file, { user }) {
  const buf = fs.readFileSync(file.path);
  const notes = []; let pictures = 0, skipped = 0;
  const convertImage = mammoth.images.imgElement(async (image) => {
    const type = String(image.contentType || '').toLowerCase();
    if (!/^image\/(png|jpe?g|gif)$/.test(type) || pictures >= 40) { skipped++; return { src: '' }; }
    const data = await image.read();
    if (data.length > 8 * 1024 * 1024) { skipped++; return { src: '' }; }
    const rec = storeImage(user, `${file.name.replace(/\.\w+$/, '')} picture ${++pictures}.${type.split('/')[1].replace('jpeg', 'jpg')}`, type, data);
    return { src: 'file:' + rec.id };
  });
  const r = await mammoth.convertToHtml({ buffer: buf }, { convertImage, styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => p:fresh", "p[style-name='Quote'] => blockquote > p:fresh", "p[style-name='Intense Quote'] => blockquote > p:fresh"] });
  let html = r.value;
  // Word's own contents list is rebuilt by Scenly, so the stale copy is dropped.
  html = html.replace(/<p>\s*<a href="#_Toc[^"]*">[\s\S]*?<\/a>\s*<\/p>/g, '');
  // Footnotes: mammoth lists them at the end; they become [^n] notes.
  const notesMap = new Map();
  html = html.replace(/<ol>((?:\s*<li id="(?:foot|end)note-\d+">[\s\S]*?<\/li>)+)\s*<\/ol>/g, (_m, items) => {
    for (const li of items.matchAll(/<li id="((?:foot|end)note-\d+)">([\s\S]*?)<\/li>/g)) notesMap.set(li[1], li[2].replace(/<a href="#(?:foot|end)note-ref-\d+">[^<]*<\/a>/g, ''));
    return '';
  });
  let n = 0; const order = new Map();
  html = html.replace(/<sup>\s*<a href="#((?:foot|end)note-\d+)"[^>]*>[^<]*<\/a>\s*<\/sup>/g, (_m, id) => { if (!notesMap.has(id)) return ''; if (!order.has(id)) order.set(id, ++n); return `<span data-fn="${order.get(id)}"></span>`; });

  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*', hr: '---' });
  td.use(gfm);
  td.addRule('fn', { filter: (node) => node.nodeName === 'SPAN' && node.getAttribute('data-fn'), replacement: (_c, node) => `[^${node.getAttribute('data-fn')}]` });
  td.addRule('img', { filter: 'img', replacement: (_c, node) => { const src = node.getAttribute('src'); return src ? `![${(node.getAttribute('alt') || 'Picture').replace(/[\[\]\n]/g, ' ')}](${src})` : ''; } });
  td.addRule('anchor', { filter: (node) => node.nodeName === 'A' && !node.getAttribute('href'), replacement: (c) => c });
  // Table cells hold paragraphs in Word; Markdown cells are one line.
  td.addRule('cell', { filter: ['th', 'td'], replacement: (c, node) => ` ${c.trim().replace(/\n{2,}/g, '<br>').replace(/\n/g, ' ').replace(/\|/g, '\\|')} |${node.nextElementSibling ? '' : ''}` });
  td.addRule('row', { filter: 'tr', replacement: (c, node) => {
    const cells = node.children.length; const first = !node.previousElementSibling && (!node.parentNode.previousElementSibling || node.parentNode.nodeName === 'THEAD');
    return `\n|${c}${first ? `\n|${' --- |'.repeat(cells)}` : ''}`;
  } });
  td.addRule('table', { filter: 'table', replacement: (c) => `\n\n${c.trim()}\n\n` });
  td.addRule('tsection', { filter: ['thead', 'tbody', 'tfoot'], replacement: (c) => c });
  let body = td.turndown(html).replace(/<br>/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (order.size) body += '\n\n' + [...order].map(([id, k]) => `[^${k}]: ${td.turndown(notesMap.get(id)).replace(/\s*\n+\s*/g, ' ').trim()}`).join('\n');

  body = body.replace(/^(\s*)(-|\d+\.)\s{2,}/gm, '$1$2 ');
  // "1\. Scope" in a heading is just "1. Scope".
  body = body.replace(/^(#{1,6}\s+.*)$/gm, (l) => l.replace(/\\([.\-()+!#])/g, '$1'));
  const fileTitle = file.name.replace(/\.\w+$/, '').replace(/[_]+/g, ' ').trim();
  body = oneTitle(body, fileTitle);
  const settings = await settingsFrom(buf);
  const h1 = body.match(/^#\s+(.+)$/m);
  const title = (h1 ? h1[1] : fileTitle).replace(/\\([.\-()!#+])/g, '$1').replace(/[*_`~[\]\\]/g, '').trim().slice(0, 120) || 'Document';
  if (skipped) notes.push(`${skipped} picture${skipped > 1 ? 's' : ''} in a format Word documents cannot carry over (or too large) ${skipped > 1 ? 'were' : 'was'} left out.`);
  if (/<w:(ins|del) /.test(await (await JSZip.loadAsync(buf)).file('word/document.xml')?.async('string') || '')) notes.push('The file had tracked changes: the accepted text was opened.');
  if (!body) throw new Error('the file has no text');
  return { spec: { kind: 'word', title, settings, body }, notes };
}
