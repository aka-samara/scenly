// Format cloning: reads the look of a sample file (Word, Excel, PowerPoint or PDF) or of a Docs Studio
// document, and saves it as a brand kit that every document type can follow. A kit made this way keeps,
// next to its colours, fonts and logo, the details one type needs: page setup and header for Word,
// table colours for spreadsheets, backgrounds and title positions for slides, page size for PDFs.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import db from '../db.js';
import { getFiles, filePath, storeImage } from '../files.js';
import { UserError } from '../generate.js';
import { createBrand, userBrands, resolveTheme, userBrand, DEFAULT_THEME, SAFE_FONTS, hex } from './brand.js';
import { readVersion } from './store.js';
import { mix, lum } from './slides/layout.js';

export const CLONE_EXT = /\.(docx|pptx|xlsx|xlsm|pdf)$/i;
// "in the same format as this file", "use this as our template", "clone the style of the attached deck"…
export const CLONE_ASK = /\b(same (format|formatting|look|style|styling|design|branding|layout)|(clone|copy|match|follow|keep|reuse|mirror|replicate|mimic)\b.{0,40}\b(format|formatting|look|style|styling|design|branding|brand|theme|template|layout)|(format|formatting|look|style|styling|design|branding|theme)\b.{0,25}\b(of|from) (this|the attached|the uploaded|that|my|our)|(as|for) (a|the|my|our) (brand )?(template|brand kit)|brand (kit|template) from|house style)\b/i;

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const vivid = (c) => !!c && lum(c) > 0.04 && lum(c) < 0.8 && sat(c) > 0.18;
function sat(c) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; }
function hue(c) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; }
const hueGap = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };
// Free fonts that stand in for the usual office fonts on Linux and in Google Docs.
const ALIAS = { carlito: 'Calibri', liberationsans: 'Arial', arimo: 'Arial', liberationserif: 'Times New Roman', tinos: 'Times New Roman', caladea: 'Cambria', liberationmono: 'Courier New', cousine: 'Courier New', helveticaneue: 'Helvetica', timesnewroman: 'Times New Roman' };
const safeFont = (name) => { const n = String(name || '').toLowerCase().replace(/[^a-z]/g, ''); if (!n) return null; const al = Object.keys(ALIAS).find((k) => n.includes(k)); if (al) return ALIAS[al]; return [...SAFE_FONTS].sort((a, b) => b.length - a.length).find((f) => n.includes(f.toLowerCase().replace(/[^a-z]/g, ''))) || null; };
const fontName = (name) => safeFont(name) || (/^[\w][\w \-]{1,38}$/.test(String(name || '').trim()) ? String(name).trim() : null);
const themeOf = (xml) => {
  const out = { colors: {}, fonts: {} };
  for (const k of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']) { const m = new RegExp(`<a:${k}>\\s*<a:(?:srgbClr val|sysClr[^>]*lastClr)="([0-9A-Fa-f]{6})"`).exec(xml || ''); if (m) out.colors[k] = '#' + m[1].toUpperCase(); }
  for (const [k, tag] of [['heading', 'major'], ['body', 'minor']]) { const m = new RegExp(`<a:${tag}Font>[\\s\\S]*?<a:latin typeface="([^"]+)"`).exec(xml || ''); if (m && m[1]) out.fonts[k] = m[1]; }
  return out;
};
const pick = (...list) => list.find(Boolean) || null;
// Two brand colours from whatever the file offers: a main colour and a second one that differs from it.
function pair(candidates, fallback = []) {
  const all = [...candidates, ...fallback].filter((c) => c && /^#[0-9A-F]{6}$/.test(c));
  const primary = all.find(vivid) || all.find((c) => lum(c) < 0.5) || DEFAULT_THEME.colors.primary;
  const accent = all.find((c) => c !== primary && vivid(c) && (hueGap(c, primary) > 25 || Math.abs(lum(c) - lum(primary)) > 0.18)) || mix(primary, '#FFFFFF', 0.35);
  return { primary, accent };
}

async function fromPptx(user, f, buf) {
  const { importPptx } = await import('./slides/import.js');
  const { spec } = await importPptx({ path: f.path || filePath(f), name: f.name }, { user });
  const t = spec.settings.template; const notes = [];
  const chart = t.colors.chart || [];
  const art = (t.content?.decor || []).map((d) => d.fill).filter(Boolean);
  const p2 = pair([t.colors.primary, ...art, t.colors.accent, ...chart]); const primary = p2.primary;
  // Artwork drawn on the slides says more about the brand than the theme's unused accent colours.
  const accent = art.includes(p2.accent) ? p2.accent : art.find((c) => c !== primary && vivid(c)) || p2.accent;
  const dark = lum(t.colors.background || '#FFFFFF') < 0.4;
  const logo = (t.content?.decor || []).filter((d) => d.kind === 'image' && d.w * d.h < t.w * t.h * 0.08 && d.w > 0.25).sort((a, b) => a.y - b.y)[0];
  notes.push(`Slides get the deck's size, backgrounds, ${logo ? 'logo, ' : ''}fixed artwork and title positions.`);
  return { colors: { primary, accent, text: dark ? DEFAULT_THEME.colors.text : t.colors.text || DEFAULT_THEME.colors.text }, fonts: t.fonts, logoFileId: logo ? String(logo.src).replace(/^file:/, '') : undefined, template: { slides: t }, notes, zip: await JSZip.loadAsync(buf) };
}

async function fromDocx(user, f, buf) {
  const { settingsFrom } = await import('./word/import.js');
  const s = await settingsFrom(buf); const zip = await JSZip.loadAsync(buf); const notes = [];
  const th = themeOf(await zip.file('word/theme/theme1.xml')?.async('string'));
  const { primary, accent } = pair([s.theme.headingColor, s.theme.accent], [th.colors.accent1, th.colors.accent2, th.colors.dk2]);
  // The logo is the first picture in the page header.
  let logoFileId;
  for (const name of Object.keys(zip.files).filter((n) => /^word\/_rels\/header\d*\.xml\.rels$/.test(n)).sort()) {
    const m = /Target="(media\/[^"]+\.(png|jpe?g|gif))"/i.exec(await zip.file(name).async('string')); if (!m) continue;
    const img = zip.file('word/' + m[1]); if (!img) continue;
    const b = await img.async('nodebuffer'); if (b.length < 4 * 1024 * 1024) { logoFileId = storeImage(user, path.posix.basename(m[1]), MIME[m[2].toLowerCase()] || 'image/png', b).id; break; }
  }
  const word = { page: s.page, header: s.header, footer: s.footer, fontSize: s.theme.fontSize, pageNumbers: s.pageNumbers, columns: s.columns };
  notes.push(`Word documents get its page size, margins${s.header ? ', header' : ''}${s.footer ? ', footer' : ''} and text size.`);
  return { colors: { primary, accent, text: s.theme.textColor && lum(s.theme.textColor) < 0.5 ? s.theme.textColor : DEFAULT_THEME.colors.text }, fonts: { heading: s.theme.headingFont || th.fonts.heading, body: s.theme.font || th.fonts.body }, logoFileId, footer: s.footer, template: { word, ...(s.page?.size ? { pdf: { page: { size: s.page.size, orientation: s.page.orientation } } } : {}) }, notes, zip };
}

async function fromXlsx(user, f, buf) {
  const zip = await JSZip.loadAsync(buf); const notes = [];
  const th = themeOf(await zip.file('xl/theme/theme1.xml')?.async('string'));
  const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  const col = (c) => {
    if (!c) return null; let v = null;
    if (c.argb && /^[0-9A-Fa-f]{8}$/.test(c.argb)) v = '#' + c.argb.slice(2).toUpperCase(); else if (c.theme != null) v = th.colors[order[c.theme]] || null;
    if (v && c.tint) v = c.tint > 0 ? mix(v, '#FFFFFF', 1 - c.tint) : mix('#000000', v, 1 + c.tint);
    return v;
  };
  const fillOf = (cell) => (cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid' ? col(cell.fill.fgColor) : null);
  const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const sheet = { }; let logoFileId; let tableAccent = null;
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== 'visible') continue;
    // The header row: the first row near the top with a filled or bold run of cells.
    for (let r = 1; r <= Math.min(ws.rowCount, 12) && !sheet.header; r++) {
      const cells = []; ws.getRow(r).eachCell({ includeEmpty: false }, (c) => cells.push(c)); if (cells.length < 2) continue;
      const fills = cells.map(fillOf).filter(Boolean);
      if (fills.length >= cells.length * 0.6 && lum(fills[0]) < 0.93) {
        sheet.header = fills[0]; const fc = col(cells[0].font?.color); if (fc) sheet.headerText = fc;
        const body = []; ws.getRow(r + 1).eachCell({ includeEmpty: false }, (c) => body.push(c)); const body2 = []; ws.getRow(r + 2).eachCell({ includeEmpty: false }, (c) => body2.push(c));
        const band = [...body, ...body2].map(fillOf).find((x) => x && lum(x) > 0.8 && x !== '#FFFFFF'); if (band) sheet.band = band;
        const bf = (body[0] || cells[0]).font; if (bf?.name) sheet.font = fontName(bf.name) || undefined; if (bf?.size) sheet.fontSize = Math.max(8, Math.min(14, bf.size));
      }
    }
    const tbl = Object.values(ws.tables || {})[0]; const st = tbl?.table?.style?.theme || tbl?.style?.theme; const m = /Medium(\d+)|Light(\d+)|Dark(\d+)/.exec(st || '');
    if (m && !tableAccent) { const n = Number(m[1] || m[2] || m[3]); const idx = (n - 1) % 7; tableAccent = idx === 0 ? th.colors.dk1 : th.colors['accent' + idx]; }
    if (!logoFileId) { try { const im = (ws.getImages() || []).find((x) => (x.range?.tl?.nativeRow ?? 99) < 8); const media = im && wb.getImage(im.imageId); if (media?.buffer && MIME[media.extension] && media.buffer.length < 4 * 1024 * 1024) logoFileId = storeImage(user, `logo.${media.extension}`, MIME[media.extension], Buffer.from(media.buffer)).id; } catch { /* no logo */ } }
    if (!sheet.font) { const c = ws.getCell('A1'); if (c.font?.name) sheet.font = fontName(c.font.name) || undefined; }
  }
  if (!sheet.header && tableAccent) sheet.header = tableAccent;
  const { primary, accent } = sheet.header ? pair([sheet.header, tableAccent]) : pair([], [th.colors.accent1, th.colors.accent2, th.colors.dk2]);
  if (!sheet.header) { sheet.header = primary; notes.push('The workbook has no coloured header row, so its theme colours were used.'); }
  sheet.accent = accent;
  notes.push('Spreadsheets get its header colours, banding and font.');
  return { colors: { primary: vivid(sheet.header) || lum(sheet.header) < 0.5 ? sheet.header : primary, accent, text: DEFAULT_THEME.colors.text }, fonts: { heading: sheet.font || th.fonts.heading, body: sheet.font || th.fonts.body }, logoFileId, template: { sheet }, notes, zip };
}

async function fromPdf(user, f, buf) {
  const { rasterize } = await import('./pdf/tools.js'); const { SIZES } = await import('./pdf/base.js');
  const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib'); const { loadImage, createCanvas } = await import('@napi-rs/canvas');
  const notes = []; const pdf = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
  const { width, height } = pdf.getPage(0).getSize(); const wmm = (width / 72) * 25.4, hmm = (height / 72) * 25.4; const land = wmm > hmm;
  const named = Object.entries(SIZES).find(([, [a, b]]) => Math.abs(a - Math.min(wmm, hmm)) < 3 && Math.abs(b - Math.max(wmm, hmm)) < 3)?.[0];
  const page = named && named !== 'Slide' && named !== 'Card' ? { size: named, orientation: land ? 'landscape' : 'portrait' } : named ? { size: named } : { width: Math.round(wmm), height: Math.round(hmm) };
  // Colours by area on the first pages.
  const count = new Map(); let tot = 0;
  for (const png of await rasterize(buf, { scale: 0.5, pages: [1, 2, 3], max: 3 })) {
    const img = await loadImage(png); const c = createCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 8) { const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4); const e = count.get(k) || [k, 0, 0, 0, 0]; e[1]++; e[2] += d[i]; e[3] += d[i + 1]; e[4] += d[i + 2]; count.set(k, e); tot++; }
  }
  const pal = [...count.values()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([, n, r, g, b]) => ({ c: '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('').toUpperCase(), share: n / tot })).filter((x) => x.share > 0.0015);
  const coloured = pal.filter((x) => vivid(x.c)).map((x) => x.c);
  const { primary, accent } = pair(coloured, pal.filter((x) => lum(x.c) < 0.35).map((x) => x.c));
  const text = pal.filter((x) => lum(x.c) < 0.2 && sat(x.c) < 0.5).map((x) => x.c)[0] || DEFAULT_THEME.colors.text;
  // Font names are in the file even when the letters are embedded.
  const names = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) { if (!(obj instanceof PDFDict) || !/^\/Font(Descriptor)?$/.test(String(obj.get(PDFName.of('Type'))))) continue; const b = String(obj.get(PDFName.of('BaseFont')) || obj.get(PDFName.of('FontName')) || '').replace(/^\//, '').replace(/^[A-Z]{6}\+/, ''); if (b) names.push(b); }
  const fams = names.map((n) => ({ n, fam: safeFont(n.replace(/#20/g, ' ')), bold: /bold|black|heavy|semibold/i.test(n) })).filter((x) => x.fam);
  const fonts = { heading: pick(fams.find((x) => x.bold)?.fam, fams[0]?.fam), body: pick(fams.find((x) => !x.bold)?.fam, fams[0]?.fam) };
  if (!fams.length) notes.push('Its fonts are not ones Scenly can reuse, so the kit keeps the standard font. You can change it in the kit.');
  notes.push('PDFs get its page size. A PDF holds no editable header, footer or logo, so add a logo to the kit if you want one.');
  const word = ['A4', 'Letter', 'Legal', 'A5', 'A3'].includes(page.size) ? { page: { size: page.size, orientation: page.orientation } } : null;
  return { colors: { primary, accent, text }, fonts, template: { pdf: { page }, ...(word ? { word } : {}) }, notes };
}

// The look of an uploaded file.
export async function lookFromFile(user, f) {
  const ext = f.name.split('.').pop().toLowerCase();
  if (!CLONE_EXT.test(f.name)) throw new UserError('Choose a Word (.docx), Excel (.xlsx), PowerPoint (.pptx) or PDF file to copy the look from.');
  let buf; try { buf = fs.readFileSync(f.path || filePath(f)); } catch { throw new UserError('That file is no longer available. Upload it again.'); }
  let look;
  try { look = ext === 'pptx' ? await fromPptx(user, f, buf) : ext === 'docx' ? await fromDocx(user, f, buf) : ext === 'pdf' ? await fromPdf(user, f, buf) : await fromXlsx(user, f, buf); }
  catch (e) { if (e instanceof UserError) throw e; throw new UserError(`The look of ${f.name} could not be read (${String(e.message).slice(0, 160)}).`); }
  // The company name saved in an Office file's properties.
  if (look.zip) { try { const app = await look.zip.file('docProps/app.xml')?.async('string'); const m = /<Company>([^<]{2,80})<\/Company>/.exec(app || ''); if (m && !/^(microsoft|home|none)$/i.test(m[1].trim())) look.company = m[1].trim(); } catch { /* optional */ } delete look.zip; }
  look.template = { ...look.template, source: ext === 'xlsm' ? 'xlsx' : ext, file: f.name };
  look.name = f.name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 50) || 'Cloned look';
  return look;
}

// The look of a document made or opened in Docs Studio.
export function lookFromDoc(user, d) {
  const spec = readVersion(d); if (!spec) throw new UserError('That document has no version to copy the look from.');
  const theme = resolveTheme(user, d); const st = spec.settings || {}; const t = st.theme || {};
  const look = { colors: { primary: theme.colors.primary, accent: theme.colors.accent, text: theme.colors.text }, fonts: { ...theme.fonts }, template: { ...(theme.template || {}), source: 'document', file: d.title }, notes: [], name: `${d.title} look`.slice(0, 55) };
  const b = theme.brandId && userBrand(user, theme.brandId);
  if (b?.logoFileId) look.logoFileId = b.logoFileId; for (const k of ['company', 'tagline', 'address', 'website', 'email', 'phone', 'footer']) if (b?.[k]) look[k] = b[k];
  if (d.kind === 'word') {
    if (t.headingColor) look.colors.primary = t.headingColor; if (t.accent) look.colors.accent = t.accent; if (t.textColor) look.colors.text = t.textColor;
    if (t.headingFont) look.fonts.heading = t.headingFont; if (t.font) look.fonts.body = t.font;
    look.template.word = { page: st.page, header: st.header, footer: st.footer, fontSize: t.fontSize, pageNumbers: st.pageNumbers };
  } else if (d.kind === 'sheet') {
    const s = spec.theme || {}; if (s.header) look.colors.primary = s.header; if (s.accent) look.colors.accent = s.accent; if (s.font) look.fonts.body = look.fonts.heading = s.font;
    if (Object.keys(s).length) look.template.sheet = { ...s };
  } else if (d.kind === 'slides') {
    const tp = st.template; if (tp) { look.template.slides = tp; look.colors.primary = tp.colors?.primary || look.colors.primary; look.colors.accent = tp.colors?.accent || look.colors.accent; if (tp.fonts?.heading) look.fonts.heading = tp.fonts.heading; if (tp.fonts?.body) look.fonts.body = tp.fonts.body; }
    else if (st.style && st.style !== 'clean') look.template.slidesStyle = st.style;
    if (t.primary) look.colors.primary = t.primary; if (t.accent) look.colors.accent = t.accent; if (t.headingFont) look.fonts.heading = t.headingFont; if (t.font) look.fonts.body = t.font;
  } else if (d.kind === 'pdf') {
    if (t.primary) look.colors.primary = t.primary; if (t.accent) look.colors.accent = t.accent; if (t.text) look.colors.text = t.text; if (t.headingFont) look.fonts.heading = t.headingFont; if (t.font) look.fonts.body = t.font;
    look.template.pdf = { page: st.page };
  }
  return look;
}

// Saves a look as a brand kit. { fileId } or { docId }, with an optional name.
export async function cloneBrand(user, { fileId, docId, name, isDefault, file, reuse } = {}) {
  let look;
  if (docId) { const d = db.documents.find((x) => x.id === String(docId) && x.userId === user.id); if (!d) throw new UserError('Document not found.', 404); look = lookFromDoc(user, d); }
  else { const f = file || (fileId && getFiles(user, [String(fileId)])[0]); if (!f) throw new UserError('Choose a file to copy the look from.'); look = await lookFromFile(user, f); }
  // The same file sent again in a chat uses the kit made from it before.
  const same = reuse && userBrands(user).find((b) => b.template?.file === look.template.file && b.template?.source === look.template.source && hex(look.colors?.primary, '') === b.colors.primary);
  if (same) return { brand: same, notes: [`Used the brand kit "${same.name}", which was made from ${look.template.file} earlier.`] };
  const taken = new Set(userBrands(user).map((b) => b.name.toLowerCase())); let nm = String(name || look.name).trim().slice(0, 56) || 'Cloned look'; for (let i = 2; taken.has(nm.toLowerCase()); i++) nm = `${String(name || look.name).trim().slice(0, 52)} ${i}`;
  const fonts = { heading: fontName(look.fonts?.heading) || fontName(look.fonts?.body) || DEFAULT_THEME.fonts.heading, body: fontName(look.fonts?.body) || fontName(look.fonts?.heading) || DEFAULT_THEME.fonts.body };
  const colors = Object.fromEntries(Object.entries(look.colors || {}).map(([k, v]) => [k, hex(v, null)]).filter(([, v]) => v));
  const brand = createBrand(user, { name: nm, colors, fonts, logoFileId: look.logoFileId, company: look.company, tagline: look.tagline, address: look.address, website: look.website, email: look.email, phone: look.phone, footer: look.footer, isDefault: !!isDefault }, { template: look.template, source: look.template.source, keepDefault: !isDefault });
  const lead = `Saved the look of ${look.template.file} as the brand kit "${brand.name}": colours ${brand.colors.primary} and ${brand.colors.accent}, fonts ${brand.fonts.heading}${brand.fonts.body !== brand.fonts.heading ? ' and ' + brand.fonts.body : ''}${brand.logoFileId ? ', and its logo' : ''}.`;
  return { brand, notes: [lead, ...look.notes] };
}
