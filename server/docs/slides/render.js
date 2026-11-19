// Draws a deck from its laid-out elements: as HTML (the preview, PDF and page images) and as a real
// .pptx (pptxgenjs: editable text boxes, native charts and tables, speaker notes).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { chartSvg } from '../pdf/charts.js';
import { esc } from '../util.js';
import { deckBox, palette, layoutSlide } from './layout.js';

// Pictures are cropped to their box once (so PowerPoint and the preview show the same cut) and kept small.
const cache = new Map();
async function picture(file, src, fit, w, h) {
  const key = `${src}|${fit}|${(w / h).toFixed(3)}`; if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    const img = await loadImage(file.data()); const iw = img.width, ih = img.height; const max = 1800;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (fit === 'cover') { const r = w / h; if (iw / ih > r) { sw = ih * r; sx = (iw - sw) / 2; } else { sh = iw / r; sy = (ih - sh) / 2; } }
    const k = Math.min(1, max / Math.max(sw, sh)); const cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
    const c = createCanvas(cw, ch); c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    const png = /png|gif|webp|svg/i.test(file.mime) && fit !== 'cover';
    const buf = png ? c.toBuffer('image/png') : c.toBuffer('image/jpeg', 86);
    out = { data: `data:${png ? 'image/png' : 'image/jpeg'};base64,${buf.toString('base64')}`, w: cw, h: ch };
  } catch { out = null; }
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  cache.set(key, out); return out;
}
const fileOf = (theme, src) => { const m = /^file:([\w-]+)$/.exec(String(src || '').trim()); return m ? theme.file?.(m[1]) || null : /^logo$/i.test(String(src || '')) && theme.logo ? theme.logo : null; };

// Every slide laid out, with its pictures ready. → { box, pal, slides: [{ layout, bg, els, notes, title }] }
export async function build(spec, theme, { only = null } = {}) {
  const settings = spec.settings || {}; const box = deckBox(settings); const pal = palette(settings, theme);
  const ctx = { box, pal, settings, total: spec.slides.length, image: (src) => fileOf(theme, src) };
  const slides = [];
  for (let i = 0; i < spec.slides.length; i++) {
    if (only != null && only !== i) { slides.push(null); continue; }
    const s = spec.slides[i]; const L = layoutSlide(s, i, ctx);
    if (L.bg.image) { const f = fileOf(theme, L.bg.image); const pic = f && await picture(f, L.bg.image, 'cover', box.W, box.H); L.bg = pic ? { color: L.bg.color, data: pic.data } : { color: L.bg.color }; }
    for (const e of L.els) {
      if (e.kind !== 'image') continue;
      const f = fileOf(theme, e.src); const pic = f && await picture(f, e.src, e.fit === 'fill' ? 'fill' : e.fit, e.w, e.h);
      if (!pic) { e.kind = 'placeholder'; e.label = e.alt || 'Picture'; e.fill = pal.soft; e.color = pal.muted; continue; }
      e.data = pic.data;
      // A picture shown whole is centred in its box at its own proportions.
      if (e.fit === 'contain') { const r = pic.w / pic.h; let w = e.w, h = e.w / r; if (h > e.h) { h = e.h; w = e.h * r; } e.x += (e.w - w) / 2; e.y += (e.h - h) / 2; e.w = w; e.h = h; }
    }
    slides.push({ ...L, notes: s.notes || '' });
  }
  return { box, pal, slides };
}

// ---------- HTML ----------
const inch = (v) => `${Number(v).toFixed(3)}in`;
const rgba = (hex, a) => { const n = parseInt(String(hex).replace('#', ''), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const runHtml = (r) => { let t = esc(r.text); if (r.code) t = `<code>${t}</code>`; if (r.bold) t = `<b>${t}</b>`; if (r.italic) t = `<i>${t}</i>`; if (r.link) t = `<u>${t}</u>`; return t; };
function elHtml(e) {
  const pos = `left:${inch(e.x)};top:${inch(e.y)};width:${inch(e.w)};height:${inch(e.h)}`;
  if (e.kind === 'rect' || e.kind === 'ellipse') return `<div class="el" style="${pos};background:${e.alpha != null ? rgba(e.fill, e.alpha) : e.fill};${e.kind === 'ellipse' ? 'border-radius:50%' : e.radius ? `border-radius:${inch(e.radius)}` : ''}${e.line ? `;border:${e.lineW || 1}pt solid ${e.line}` : ''}"></div>`;
  if (e.kind === 'line') return `<div class="el" style="left:${inch(e.x)};top:${inch(e.y)};width:${inch(Math.max(e.w, 0.001))};height:${inch(Math.max(e.h, 0.001))};border-${e.w >= e.h ? 'top' : 'left'}:${e.lineW || 1}pt solid ${e.line || e.fill}"></div>`;
  if (e.kind === 'image') return `<img class="el" alt="${esc(e.alt || '')}" src="${e.data}" style="${pos};object-fit:${e.fit === 'cover' ? 'cover' : 'fill'}">`;
  if (e.kind === 'placeholder') return `<div class="el ph" style="${pos};background:${e.fill};color:${e.color}"><span>${esc(String(e.label).slice(0, 160))}</span></div>`;
  if (e.kind === 'chart') { const W = 500, H = Math.max(120, Math.round((W * e.h) / e.w)); return `<div class="el" style="${pos};color:${e.ink};font-family:'${e.font}',Carlito,Calibri,Arial,sans-serif">${chartSvg({ ...e.chart, width: W, height: H, colors: e.colors, ink: 'currentColor' }).replace('style="display:block;max-width:100%;height:auto"', 'style="display:block;width:100%;height:100%"')}</div>`; }
  if (e.kind === 'table') {
    return `<table class="el tb" style="left:${inch(e.x)};top:${inch(e.y)};width:${inch(e.w)};font:${e.size}pt '${e.font}',Carlito,Calibri,Arial,sans-serif;color:${e.color}">${e.rows.map((r, ri) => `<tr style="height:${inch(e.rowH)}${ri && ri % 2 === 0 ? `;background:${e.alt}` : ''}">${r.map((c) => (e.header && ri === 0 ? `<th style="background:${e.headFill};color:${e.headColor};border-color:${e.line}">${esc(c)}</th>` : `<td style="border-color:${e.line}">${esc(c)}</td>`)).join('')}</tr>`).join('')}</table>`;
  }
  if (e.kind === 'text') {
    const just = e.valign === 'middle' ? 'center' : e.valign === 'bottom' ? 'flex-end' : 'flex-start'; let num = 0;
    const paras = e.paras.map((p, i) => {
      const size = e.size * (p.scale || (p.level ? 0.88 : 1)); if (p.bullet === 'num') num = p.n || num + 1; else if (!p.level) num = 0;
      const pad = (p.bullet ? 0.32 : 0) + (p.level || 0) * 0.32;
      const mark = p.bullet === 'dot' ? `<span class="bu" style="color:${e.accent || 'inherit'}">${p.level ? '–' : '•'}</span>` : p.bullet === 'num' ? `<span class="bu" style="color:${e.accent || 'inherit'}">${num}.</span>` : '';
      return `<p style="font-size:${size.toFixed(1)}pt;padding-left:${inch(pad)};${i ? `margin-top:${(size * e.gap).toFixed(1)}pt;` : ''}${p.head ? `font-weight:700;color:${e.head || 'inherit'};` : ''}">${mark}${p.runs.map(runHtml).join('')}</p>`;
    }).join('');
    return `<div class="el tx" style="${pos};justify-content:${just};text-align:${e.align};font-family:'${e.font}',Carlito,Calibri,Arial,sans-serif;color:${e.color};line-height:${e.lineH};${e.bold ? 'font-weight:700;' : ''}${e.italic ? 'font-style:italic;' : ''}">${paras}</div>`;
  }
  return '';
}
export function deckHtml(spec, built, { mode = 'print' } = {}) {
  const { box: { W, H } } = built; const screen = mode !== 'print';
  const pages = built.slides.map((s, i) => (s ? `<section class="pg" data-page="${i}" style="background:${s.bg.color}${s.bg.data ? ` url('${s.bg.data}') center/cover no-repeat` : ''}">${s.els.map(elHtml).join('')}</section>${mode === 'preview' && s.notes ? `<div class="nt"><b>Speaker notes</b> ${esc(s.notes)}</div>` : ''}` : '')).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(spec.title)}</title><style>
@page{size:${inch(W)} ${inch(H)};margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}html{background:${screen ? '#e9eaee' : '#fff'}}body{${screen ? 'padding:5mm 0 12mm' : ''}}
.pg{position:relative;width:${inch(W)};height:${inch(H)};overflow:hidden;break-after:page;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact;${screen ? 'margin:0 auto 5mm;box-shadow:0 1px 3px rgba(0,0,0,.12),0 6px 22px rgba(0,0,0,.10)' : ''}}.pg:last-of-type{break-after:auto}
.el{position:absolute;margin:0}.tx{display:flex;flex-direction:column;overflow:hidden}.tx p{margin:0;position:relative}.tx .bu{position:absolute;margin-left:-0.3in;width:0.26in;text-align:left;font-style:normal}.tx code{font-family:Consolas,Menlo,monospace;font-size:.9em}
.ph{display:flex;align-items:center;justify-content:center;text-align:center;font:11pt Arial,sans-serif;border-radius:.08in;padding:.2in}.ph span{opacity:.85}
.tb{border-collapse:collapse;table-layout:fixed}.tb th,.tb td{padding:0 .1in;border-bottom:.75pt solid;text-align:left;vertical-align:middle;overflow:hidden;line-height:1.15}.tb th{font-weight:700;border:0}
.nt{width:${inch(W)};margin:-3mm auto 6mm;padding:3mm 4mm;background:#fff8dc;border:1px solid #eadb9a;border-radius:2mm;font:11pt/1.4 Arial,sans-serif;color:#5b4a00;white-space:pre-wrap}.nt b{display:block;font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;opacity:.75;margin-bottom:1mm}
</style></head><body>${pages}</body></html>`;
}

// ---------- PowerPoint ----------
const hx = (c) => String(c || '#000000').replace('#', '').toUpperCase();
export async function deckPptx(spec, built, theme) {
  const { default: Pptx } = await import('pptxgenjs'); const P = Pptx.default || Pptx;
  const pres = new P(); const { box: { W, H }, pal } = built;
  pres.defineLayout({ name: 'DECK', width: W, height: H }); pres.layout = 'DECK';
  pres.title = spec.title; pres.subject = spec.title; pres.company = theme.company || ''; pres.author = theme.company || 'Scenly';
  pres.theme = { headFontFace: pal.hfont, bodyFontFace: pal.font };
  for (const s of built.slides) {
    if (!s) continue;
    const slide = pres.addSlide(); slide.background = s.bg.data ? { data: s.bg.data.replace(/^data:/, '') } : { color: hx(s.bg.color) };
    for (const e of s.els) {
      const at = { x: e.x, y: e.y, w: e.w, h: e.h };
      if (e.kind === 'rect' || e.kind === 'ellipse') slide.addShape(e.kind === 'ellipse' ? pres.ShapeType.ellipse : e.radius ? pres.ShapeType.roundRect : pres.ShapeType.rect, { ...at, fill: { color: hx(e.fill), transparency: e.alpha != null ? Math.round((1 - e.alpha) * 100) : 0 }, line: e.line ? { color: hx(e.line), width: e.lineW || 1 } : { type: 'none' }, ...(e.radius ? { rectRadius: Math.min(0.5, e.radius / Math.min(e.w, e.h)) } : {}) });
      else if (e.kind === 'line') slide.addShape(pres.ShapeType.line, { x: e.x, y: e.y, w: e.w, h: e.h, line: { color: hx(e.line || e.fill), width: e.lineW || 1 } });
      else if (e.kind === 'image') slide.addImage({ data: e.data.replace(/^data:/, ''), ...at, altText: e.alt || undefined });
      else if (e.kind === 'placeholder') { slide.addShape(pres.ShapeType.roundRect, { ...at, fill: { color: hx(e.fill) }, line: { type: 'none' }, rectRadius: 0.03 }); slide.addText(String(e.label).slice(0, 160), { ...at, align: 'center', valign: 'middle', fontSize: 11, color: hx(e.color), fontFace: 'Arial' }); }
      else if (e.kind === 'chart') {
        const c = e.chart; const type = String(c.type || 'bar').toLowerCase(); const pie = /pie|dough|donut/.test(type);
        const data = (pie ? c.series.slice(0, 1) : c.series).map((sr, i) => ({ name: sr.name || (c.series.length > 1 ? `Series ${i + 1}` : c.title || 'Value'), labels: c.labels.length ? c.labels.map(String) : sr.values.map((_v, k) => String(k + 1)), values: sr.values.map((v) => Number(v) || 0) }));
        const kind = pie ? (/pie/.test(type) ? pres.ChartType.pie : pres.ChartType.doughnut) : /line/.test(type) ? pres.ChartType.line : /area/.test(type) ? pres.ChartType.area : pres.ChartType.bar;
        const many = data.length > 1; const fmt = `${c.prefix ? `"${c.prefix}"` : ''}#,##0.##${c.suffix ? `"${c.suffix}"` : ''}`;
        slide.addChart(kind, data, { ...at, chartColors: e.colors.slice(0, pie ? Math.max(1, data[0]?.values.length || 1) : Math.max(1, data.length)).map(hx),
          ...(kind === pres.ChartType.bar ? { barDir: /hbar|horizontal/.test(type) ? 'bar' : 'col', barGrouping: /stack/.test(type) ? 'stacked' : 'clustered', barGapWidthPct: 60 } : {}),
          ...(pie ? { showPercent: true, showLegend: true, legendPos: 'r', holeSize: 58, dataLabelColor: 'FFFFFF', dataLabelFontSize: 13 } : { showLegend: many || c.legend === true, legendPos: 'b', catAxisLabelColor: hx(e.muted), valAxisLabelColor: hx(e.muted), catAxisLabelFontSize: 13, valAxisLabelFontSize: 12, catAxisLabelFontFace: e.font, valAxisLabelFontFace: e.font, valGridLine: { color: hx(e.grid), size: 0.5 }, catGridLine: { style: 'none' }, valAxisLineShow: false, valAxisLabelFormatCode: fmt, showValue: c.values === true || (!many && data[0]?.values.length <= 8 && c.values !== false), dataLabelFormatCode: fmt, dataLabelColor: hx(e.ink), dataLabelFontSize: 12, dataLabelPosition: kind === pres.ChartType.bar && !/stack/.test(type) ? 'outEnd' : undefined, lineSize: 2.5, lineDataSymbolSize: 7 }),
          legendColor: hx(e.ink), legendFontSize: 13, legendFontFace: e.font, showTitle: !!c.title, title: c.title || undefined, titleColor: hx(e.ink), titleFontSize: 15, titleFontFace: e.font });
      } else if (e.kind === 'table') {
        const cols = e.rows[0].length;
        slide.addTable(e.rows.map((r, ri) => r.map((cell) => ({ text: String(cell), options: e.header && ri === 0 ? { bold: true, color: hx(e.headColor), fill: { color: hx(e.headFill) } } : (ri && ri % 2 === 0 ? { fill: { color: hx(e.alt) } } : {}) }))),
          { x: e.x, y: e.y, w: e.w, colW: Array(cols).fill(e.w / cols), rowH: e.rowH, fontSize: e.size, fontFace: e.font, color: hx(e.color), valign: 'middle', margin: [0.03, 0.1, 0.03, 0.1], border: [{ type: 'none' }, { type: 'none' }, { type: 'solid', pt: 0.75, color: hx(e.line) }, { type: 'none' }] });
      } else if (e.kind === 'text') {
        const parts = []; let num = 0;
        e.paras.forEach((p, pi) => {
          const size = Math.round(e.size * (p.scale || (p.level ? 0.88 : 1)) * 10) / 10;
          const para = { fontSize: size, breakLine: false, ...(pi ? { paraSpaceBefore: Math.round(size * e.gap) } : {}), ...(p.bullet === 'dot' ? { bullet: { indent: 23, ...(p.level ? { code: '2013' } : {}), ...(e.accent ? { color: hx(e.accent) } : {}) }, indentLevel: p.level || 0 } : p.bullet === 'num' ? { bullet: { type: 'number', indent: 23, ...(p.n && p.n !== num + 1 ? { numberStartAt: p.n } : {}) }, indentLevel: p.level || 0 } : {}) };
          if (p.bullet === 'num') num = p.n || num + 1; else if (!p.level) num = 0;
          const rs = p.runs.length ? p.runs : [{ text: '' }];
          rs.forEach((r, ri) => parts.push({ text: r.text, options: { ...para, bold: !!(e.bold || r.bold || p.head), italic: !!(e.italic || r.italic), ...(p.head && e.head ? { color: hx(e.head) } : {}), ...(r.code ? { fontFace: 'Consolas' } : {}), ...(r.link ? { hyperlink: { url: r.link } } : {}), breakLine: ri === rs.length - 1 && pi < e.paras.length - 1 } }));
        });
        slide.addText(parts, { ...at, margin: 0, fontFace: e.font, fontSize: e.size, color: hx(e.color), align: e.align, valign: e.valign === 'middle' ? 'middle' : e.valign === 'bottom' ? 'bottom' : 'top', lineSpacingMultiple: Math.round(e.lineH * 0.98 * 100) / 100, fit: 'shrink', isTextBox: true });
      }
    }
    if (s.notes) slide.addNotes(String(s.notes));
  }
  return Buffer.from(await pres.write({ outputType: 'nodebuffer' }));
}
