// Turns a slide's text into positioned elements (inches from the top left). The preview (HTML) and
// the .pptx builder both draw exactly these elements, so what the panel shows is what PowerPoint opens.
import { createCanvas } from '@napi-rs/canvas';
import { parseSlide, guessLayout, runs, plain, LAYOUTS } from './markup.js';

export const SIZES = { '16:9': [13.333, 7.5], '4:3': [10, 7.5], '16:10': [10, 6.25], A4: [11.693, 8.268] };
export const STYLES = ['clean', 'bold', 'dark', 'minimal'];
export function deckBox(settings = {}) {
  const t = settings.template;
  if (t?.w > 0 && t?.h > 0) return { W: t.w, H: t.h };
  const [W, H] = SIZES[settings.size] || SIZES['16:9']; return { W, H };
}

const rgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); const n = m ? parseInt(m[1], 16) : 0; return [n >> 16, (n >> 8) & 255, n & 255]; };
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
export const lum = (hex) => { const [r, g, b] = rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

// Colours and fonts for a deck: the deck's own settings, then the brand kit.
export function palette(settings = {}, theme) {
  const th = settings.theme || {}; const tp = settings.template || null; const style = STYLES.includes(settings.style) ? settings.style : 'clean';
  const primary = th.primary || tp?.colors?.primary || theme.colors.primary, accent = th.accent || tp?.colors?.accent || theme.colors.accent;
  let bg = th.background || tp?.colors?.background || (style === 'dark' ? '#12151C' : '#FFFFFF');
  const dark = lum(bg) < 0.35;
  let text = th.text || tp?.colors?.text || (dark ? '#F3F4F6' : theme.colors.text);
  if (dark && lum(text) < 0.5) text = '#F3F4F6'; if (!dark && lum(text) > 0.6) text = '#1A1A22';
  const head = dark ? (lum(primary) > 0.45 ? primary : '#FFFFFF') : (lum(primary) > 0.75 ? text : primary);
  return {
    style, dark, bg, text, primary, accent, head,
    muted: mix(text, bg, 0.42), soft: mix(bg, accent, dark ? 0.16 : 0.09), line: mix(bg, text, 0.16),
    onPrimary: lum(primary) > 0.62 ? '#1A1A22' : '#FFFFFF', onAccent: lum(accent) > 0.62 ? '#1A1A22' : '#FFFFFF',
    font: th.font || tp?.fonts?.body || theme.fonts.body, hfont: th.headingFont || tp?.fonts?.heading || theme.fonts.heading,
    chart: (!th.primary && !th.accent && tp?.colors?.chart?.length >= 3 ? tp.colors.chart : [accent, primary === accent ? mix(primary, '#000000', 0.35) : primary, '#F2A541', '#4CB8A6', '#C8553D', '#8C6BB1', '#6C8EAD', '#B5B5B5']).map((c, i) => (i < 2 && Math.abs(lum(c) - lum(bg)) < 0.12 ? mix(c, dark ? '#FFFFFF' : '#000000', 0.4) : c)),
  };
}

// ----- measuring text, so it can be made to fit its box -----
let g = null;
const widthOf = (text, pt, font, bold) => { g ||= createCanvas(8, 8).getContext('2d'); g.font = `${bold ? 'bold ' : ''}${pt}px "${font}", Carlito, Calibri, Arial, sans-serif`; return g.measureText(text).width / 72; };
function linesOf(text, pt, font, bold, w) {
  if (w <= 0.2) return 99; let n = 0;
  for (const part of String(text).split('\n')) { let cur = 0; n++; for (const word of part.split(/\s+/).filter(Boolean)) { const ww = widthOf(word + ' ', pt, font, bold); if (cur && cur + ww > w * 0.97) { n++; cur = ww; } else cur += ww; } }
  return n;
}
const INDENT = 0.32;
// Height of paragraphs set at `pt`, in inches.
export function textHeight(paras, pt, font, w, { lineH = 1.22, gap = 0.4, bold = false } = {}) {
  let h = 0;
  paras.forEach((p, i) => { const size = pt * (p.scale || (p.level ? 0.88 : 1)); const pw = w - (p.bullet ? INDENT : 0) - (p.level || 0) * INDENT; h += (linesOf(plain(p.text), size, font, bold || p.head || p.bold, pw) * size * lineH) / 72 + (i ? (size * gap) / 72 : 0); });
  return h;
}
// The largest size from `max` down to `min` at which the paragraphs fit the box.
export function fit(paras, font, w, h, max, min, opts) { for (let pt = max; pt > min; pt -= pt > 24 ? 2 : 1) if (textHeight(paras, pt, font, w, opts) <= h) return pt; return min; }

const T = (o) => ({ kind: 'text', align: 'left', valign: 'top', lineH: 1.22, gap: 0.4, ...o, paras: o.paras.map((p) => ({ level: 0, bullet: '', ...p, runs: runs(p.text) })) });
const one = (text, extra = {}) => [{ text, ...extra }];

// One slide → { bg, els, layout }. ctx: { box, pal, settings, total, image(src) → { w, h } | null }
export function layoutSlide(slide, index, ctx) {
  const { box: { W, H }, pal, settings } = ctx; const tp = settings.template || null;
  const p = parseSlide(slide.text);
  let layout = LAYOUTS.includes(slide.layout) ? slide.layout : guessLayout(p, index, ctx.total);
  if (layout === 'two-column' && !p.left && !p.right && p.blocks.length < 2) layout = 'content';
  const els = []; const s = W / 13.333; const mx = 0.62 * Math.max(0.8, s);
  const cover = layout === 'title' || layout === 'closing', section = layout === 'section';
  const kindKey = cover ? 'title' : section ? 'section' : 'content';
  const tg = tp?.[kindKey] || tp?.content || null;   // geometry and text styles cloned from an uploaded deck
  // --- background and decoration ---
  let bg = { color: pal.bg }; let ink = pal.text, head = pal.head, sub = pal.muted, rule = pal.accent;
  const onColour = (c) => { bg = { color: c }; ink = head = lum(c) > 0.62 ? '#1A1A22' : '#FFFFFF'; sub = mix(ink, c, 0.25); rule = lum(c) > 0.62 ? pal.primary : (c === pal.accent ? '#FFFFFF' : pal.accent); };
  if (tp) {
    const b = tg?.bg || tp.content?.bg || tp.bg; if (b?.image) bg = { color: b.color || pal.bg, image: b.image }; else if (b?.color) bg = { color: b.color };
    if (lum(bg.color) < 0.35 && !b?.image) { ink = '#F3F4F6'; head = lum(pal.primary) > 0.45 ? pal.primary : '#FFFFFF'; sub = mix(ink, bg.color, 0.3); }
    if (tg?.dark != null) { if (tg.dark) { ink = head = '#FFFFFF'; sub = '#E5E7EB'; } else { ink = pal.dark ? '#1A1A22' : pal.text; head = pal.dark ? '#1A1A22' : pal.head; } }
    for (const d of [...(tp.decor || []), ...(tg?.decor || [])]) els.push({ ...d });
  } else if (cover) {
    if (pal.style === 'minimal') { els.push({ kind: 'rect', x: 0, y: 0, w: 0.28 * s, h: H, fill: pal.accent }); }
    else if (pal.style === 'dark') { els.push({ kind: 'rect', x: 0, y: H - 0.16, w: W, h: 0.16, fill: pal.accent }); }
    else { onColour(pal.primary); if (pal.style === 'bold') { els.push({ kind: 'ellipse', x: W - 4.4 * s, y: -1.6, w: 6 * s, h: 6 * s, fill: mix(pal.primary, '#FFFFFF', 0.08) }); els.push({ kind: 'ellipse', x: W - 2.6 * s, y: H - 2.4, w: 3.6 * s, h: 3.6 * s, fill: pal.accent, alpha: 0.85 }); } else els.push({ kind: 'rect', x: 0, y: H - 0.22, w: W, h: 0.22, fill: pal.accent }); }
  } else if (section) {
    if (pal.style === 'minimal') els.push({ kind: 'rect', x: 0, y: 0, w: 0.28 * s, h: H, fill: pal.accent });
    else if (pal.style === 'dark') els.push({ kind: 'rect', x: mx, y: H * 0.5 - 1.3, w: 0.9, h: 0.09, fill: pal.accent });
    else onColour(pal.style === 'bold' ? pal.accent : pal.primary);
  } else if (layout !== 'image-full') {
    if (pal.style === 'bold') els.push({ kind: 'rect', x: 0, y: 0, w: W, h: 1.32, fill: pal.primary });
    else if (pal.style === 'clean') els.push({ kind: 'rect', x: mx, y: 0.5, w: 0.09, h: 0.72, fill: pal.accent });
    else if (pal.style === 'minimal') els.push({ kind: 'rect', x: mx, y: 0.46, w: 0.7, h: 0.06, fill: pal.accent });
  }
  const hfont = tg?.title?.font || pal.hfont, bfont = tg?.body?.font || pal.font;
  const pic = (b, x, y, w, h) => {
    if (b.src && ctx.image?.(b.src)) return { kind: 'image', src: b.src, x, y, w, h, fit: b.fit, alt: b.alt };
    return { kind: 'placeholder', x, y, w, h, label: b.prompt ? `Picture to generate: ${b.prompt}` : b.alt || 'Picture', fill: pal.soft, color: sub };
  };
  // --- one block drawn into a box ---
  const draw = (b, x, y, w, h, opts = {}) => {
    if (b.kind === 'text') {
      const max = opts.size || tg?.body?.size || (24 * Math.max(0.85, s)); const size = fit(b.paras, bfont, w, h, max, 12);
      const th = textHeight(b.paras, size, bfont, w);
      els.push(T({ x, y, w, h, paras: b.paras, size, font: bfont, color: tg?.body?.color || ink, head, accent: rule, valign: opts.middle && th < h * 0.8 ? 'middle' : 'top' }));
    } else if (b.kind === 'image') els.push(pic(b, x, y, w, h));
    else if (b.kind === 'chart') els.push({ kind: 'chart', chart: b.chart, x, y, w, h, colors: pal.chart, ink, muted: sub, grid: pal.line, font: bfont });
    else if (b.kind === 'table') {
      const rows = b.rows.slice(0, 14).map((r) => r.slice(0, 8)); const cols = Math.max(...rows.map((r) => r.length), 1);
      const size = Math.max(10, Math.min(18, Math.floor((h / rows.length) * 72 / 2.3), Math.floor((w / cols) * 9)));
      const rh = Math.min(0.72, h / rows.length);
      els.push({ kind: 'table', rows: rows.map((r) => Array.from({ length: cols }, (_x, i) => r[i] ?? '')), header: b.header !== false, x, y, w, h: rh * rows.length, rowH: rh, size, font: bfont, color: ink, headFill: pal.primary, headColor: pal.onPrimary, line: pal.line, alt: pal.dark ? mix(pal.bg, '#FFFFFF', 0.05) : mix(pal.bg, pal.text, 0.03) });
    } else if (b.kind === 'stats') {
      const items = b.items.slice(0, 5); const n = items.length; const across = w / n >= 1.9 || n === 1;
      const gap = 0.25; const tw = across ? (w - gap * (n - 1)) / n : w, thh = across ? Math.min(h, 2.3) : Math.min(1.7, (h - gap * (n - 1)) / n);
      const y0 = across ? y + (h - thh) / 2 : y;
      items.forEach((it, i) => {
        const tx = across ? x + i * (tw + gap) : x, ty = across ? y0 : y + i * (thh + gap);
        els.push({ kind: 'rect', x: tx, y: ty, w: tw, h: thh, fill: pal.soft, radius: 0.1 });
        const vs = fit(one(it.value), hfont, tw - 0.4, thh * 0.5, Math.min(46, thh * 24), 18, { bold: true });
        els.push(T({ x: tx + 0.2, y: ty + thh * 0.1, w: tw - 0.4, h: thh * 0.48, paras: one(it.value), size: vs, font: hfont, color: pal.dark ? '#FFFFFF' : pal.primary, bold: true, align: 'center', valign: 'bottom' }));
        els.push(T({ x: tx + 0.2, y: ty + thh * 0.6, w: tw - 0.4, h: thh * 0.34, paras: one(it.label), size: fit(one(it.label), bfont, tw - 0.4, thh * 0.34, 17, 10), font: bfont, color: sub, align: 'center' }));
      });
    } else if (b.kind === 'quote') {
      const q = one(`“${b.text.replace(/^["“”]+|["“”]+$/g, '')}”`); const hh = b.by ? h - 0.6 : h;
      const size = fit(q, hfont, w, hh, 36, 16);
      els.push(T({ x, y, w, h: hh, paras: q, size, font: hfont, color: head, italic: true, valign: 'middle', align: opts.align || 'left', lineH: 1.3 }));
      if (b.by) els.push(T({ x, y: y + hh + 0.1, w, h: 0.45, paras: one(`— ${b.by.replace(/^[-—–\s]+/, '')}`), size: 18, font: bfont, color: sub, align: opts.align || 'left' }));
    }
  };
  const weight = (b) => (b.kind === 'text' ? Math.min(3.2, 0.5 + b.paras.length * 0.42) : b.kind === 'table' ? Math.min(3.5, 0.5 + b.rows.length * 0.45) : b.kind === 'stats' ? 1.5 : b.kind === 'quote' ? 1.8 : 3);
  const stack = (blocks, x, y, w, h, opts) => { const gap = 0.25; const total = blocks.reduce((a, b) => a + weight(b), 0) || 1; let cy = y; const free = h - gap * (blocks.length - 1); for (const b of blocks) { const bh = (free * weight(b)) / total; draw(b, x, cy, w, bh, opts); cy += bh + gap; } };
  const columns = (left, right, x, y, w, h, ratio = 0.5) => { const gap = 0.45; const lw = (w - gap) * ratio; stack(left, x, y, lw, h, { middle: right.some((b) => b.kind !== 'text') }); stack(right, x + lw + gap, y, w - gap - lw, h, { middle: left.some((b) => b.kind !== 'text') }); };

  // --- cover, section and closing slides ---
  if (cover || section) {
    const img = p.blocks.find((b) => b.kind === 'image'); const rest = p.blocks.filter((b) => b !== img);
    const half = img && !tp; const tw = tg?.title?.w || (half ? W * 0.5 - mx : W * 0.72);
    if (half) els.push({ ...pic(img, W * 0.56, 0, W * 0.44, H), bleed: true });
    const tmax = tg?.title?.size || (section ? 46 : 56) * Math.max(0.8, s);
    const title = one(p.title || (section ? 'Section' : 'Title')); const tsize = fit(title, hfont, tw, H * 0.42, tmax, 22, { bold: true, lineH: 1.1 });
    const th = textHeight(title, tsize, hfont, tw, { bold: true, lineH: 1.1 });
    const subs = p.subtitle ? one(p.subtitle) : null; const ssize = tg?.sub?.size || (section ? 22 : 24);
    const sh = subs ? textHeight(subs, ssize, bfont, tw) + 0.1 : 0;
    const body = rest.filter((b) => b.kind === 'text'); const bh = body.length ? Math.min(2, textHeight(body[0].paras, 18, bfont, tw) + 0.1) : 0;
    const blockH = th + (subs ? 0.3 + sh : 0) + (bh ? 0.35 + bh : 0);
    if (tg?.title?.x != null) {
      els.push(T({ x: tg.title.x, y: tg.title.y, w: tg.title.w, h: tg.title.h, paras: title, size: fit(title, hfont, tg.title.w, tg.title.h, tmax, 20, { bold: tg.title.bold !== false, lineH: 1.1 }), font: hfont, color: tg.title.color || head, bold: tg.title.bold !== false, align: tg.title.align || 'left', valign: tg.title.valign || 'bottom', lineH: 1.1 }));
      const sb = tg.sub || { x: tg.title.x, y: tg.title.y + tg.title.h + 0.15, w: tg.title.w, h: 1 };
      if (subs) els.push(T({ x: sb.x, y: sb.y, w: sb.w, h: sb.h, paras: subs, size: fit(subs, bfont, sb.w, sb.h, ssize, 12), font: bfont, color: sb.color || sub, align: sb.align || tg.title.align || 'left' }));
      if (body.length) draw(body[0], sb.x, sb.y + (subs ? Math.min(sb.h, sh + 0.2) : 0), sb.w, Math.max(0.6, H - (sb.y + (subs ? sh + 0.2 : 0)) - 0.6), { size: 18 });
    } else {
      let y = Math.max(0.7, (H - blockH) / 2 - (section ? 0 : 0.15));
      if (!tp && pal.style !== 'minimal' && !(section && pal.style === 'dark')) { els.push({ kind: 'rect', x: mx, y: y - 0.32, w: 0.9, h: 0.09, fill: rule }); }
      els.push(T({ x: mx, y, w: tw, h: th + 0.05, paras: title, size: tsize, font: hfont, color: head, bold: true, lineH: 1.1 })); y += th + 0.3;
      if (subs) { els.push(T({ x: mx, y, w: tw, h: sh, paras: subs, size: ssize, font: bfont, color: sub })); y += sh + 0.35; }
      if (body.length) draw(body[0], mx, y, tw, Math.max(0.5, H - y - 0.6), { size: 18 });
    }
    return { layout, bg, els, title: p.title };
  }
  // --- a picture filling the slide, with the title over it ---
  if (layout === 'image-full') {
    const img = p.blocks.find((b) => b.kind === 'image');
    if (img) els.push({ ...pic(img, 0, 0, W, H), bleed: true });
    els.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, fill: '#000000', alpha: 0.42 });
    const title = one(p.title || ''); const tw = W - mx * 2; const ts = fit(title, hfont, tw, 1.8, 48, 24, { bold: true, lineH: 1.1 }); const th = textHeight(title, ts, hfont, tw, { bold: true, lineH: 1.1 });
    const text = p.blocks.find((b) => b.kind === 'text'); const subs = p.subtitle ? one(p.subtitle) : text ? text.paras.slice(0, 2).map((x) => ({ text: x.text })) : null;
    const sh = subs ? textHeight(subs, 22, bfont, tw) : 0; let y = H - 0.7 - th - (subs ? sh + 0.2 : 0);
    els.push(T({ x: mx, y, w: tw, h: th + 0.05, paras: title, size: ts, font: hfont, color: '#FFFFFF', bold: true, lineH: 1.1 })); y += th + 0.2;
    if (subs) els.push(T({ x: mx, y, w: tw, h: sh + 0.05, paras: subs, size: 22, font: bfont, color: '#E5E7EB' }));
    return { layout, bg: { color: '#111318' }, els, title: p.title };
  }
  // --- title and content area of an ordinary slide ---
  const band = !tp && pal.style === 'bold';
  const tb = tg?.title?.x != null ? tg.title : { x: mx + (!tp && pal.style === 'clean' ? 0.28 : 0), y: band ? 0.2 : pal.style === 'minimal' ? 0.62 : 0.45, w: W - mx * 2 - 0.28, h: band ? 0.92 : p.subtitle ? 0.72 : 0.95 };
  const title = one(p.title || ''); const tmax = tg?.title?.size || 36 * Math.max(0.82, s);
  let top = tb.y + tb.h + 0.3;
  if (p.title) {
    const subH = p.subtitle && !tg ? 0.36 : 0; const boxH = tb.h + (band ? 0 : 0);
    const ts = fit(title, hfont, tb.w, boxH, tmax, 16, { bold: tg?.title?.bold !== false, lineH: 1.12 });
    els.push(T({ x: tb.x, y: tb.y, w: tb.w, h: boxH, paras: title, size: ts, font: hfont, color: tg?.title?.color || (band ? pal.onPrimary : head), bold: tg?.title?.bold !== false, align: tg?.title?.align || 'left', valign: tg?.title?.valign || (band || !p.subtitle ? 'middle' : 'bottom'), lineH: 1.12 }));
    if (p.subtitle) { const sy = band ? 1.42 : tb.y + boxH + 0.04; els.push(T({ x: tb.x, y: sy, w: tb.w, h: 0.4, paras: one(p.subtitle), size: fit(one(p.subtitle), bfont, tb.w, 0.4, 19, 12), font: bfont, color: sub, align: tg?.title?.align || 'left' })); top = sy + 0.4 + 0.25; }
    if (band) top = Math.max(top, 1.62 + (p.subtitle ? 0.3 : 0));
  } else top = band ? 1.6 : 0.6;
  const foot = settings.footer || settings.numbers !== false;
  const area = tg?.body?.x != null ? { x: tg.body.x, y: Math.max(tg.body.y, p.subtitle ? top : tg.body.y), w: tg.body.w, h: tg.body.y + tg.body.h - Math.max(tg.body.y, p.subtitle ? top : tg.body.y) } : { x: mx, y: top, w: W - mx * 2, h: H - top - (foot ? 0.75 : 0.5) };
  const blocks = p.blocks;
  if (p.left || p.right) {
    if (blocks.length) { const hh = Math.min(area.h * 0.3, 0.3 + blocks.reduce((a, b) => a + weight(b), 0) * 0.4); stack(blocks, area.x, area.y, area.w, hh); area.y += hh + 0.2; area.h -= hh + 0.2; }
    columns(p.left || [], p.right || [], area.x, area.y, area.w, area.h);
  } else if (layout === 'steps' && blocks.some((b) => b.kind === 'text')) {
    const tblock = blocks.find((b) => b.kind === 'text'); const items = tblock.paras.filter((x) => !x.level).slice(0, 5); const n = items.length || 1; const gap = 0.3; const cw = (area.w - gap * (n - 1)) / n; const ch = Math.min(area.h, 3.6); const y0 = area.y + (area.h - ch) / 2;
    items.forEach((it, i) => {
      const x = area.x + i * (cw + gap); const m = /^(.{2,48}?)\s*[:—–]\s+(.+)$/.exec(plain(it.text)); const headT = m ? m[1] : plain(it.text), desc = m ? m[2] : tblock.paras.filter((q, qi) => q.level && tblock.paras.slice(0, qi).filter((z) => !z.level).length === i + 1).map((q) => plain(q.text)).join(' ');
      els.push({ kind: 'rect', x, y: y0, w: cw, h: ch, fill: pal.soft, radius: 0.1 });
      els.push({ kind: 'ellipse', x: x + 0.25, y: y0 + 0.25, w: 0.62, h: 0.62, fill: pal.accent });
      els.push(T({ x: x + 0.25, y: y0 + 0.25, w: 0.62, h: 0.62, paras: one(String(i + 1)), size: 22, font: hfont, color: pal.onAccent, bold: true, align: 'center', valign: 'middle' }));
      const hs = fit(one(headT), hfont, cw - 0.5, 0.9, 23, 13, { bold: true });
      els.push(T({ x: x + 0.25, y: y0 + 1.05, w: cw - 0.5, h: 0.9, paras: one(headT), size: hs, font: hfont, color: head, bold: true }));
      if (desc) els.push(T({ x: x + 0.25, y: y0 + 1.05 + Math.min(0.9, textHeight(one(headT), hs, hfont, cw - 0.5, { bold: true }) + 0.12), w: cw - 0.5, h: ch - 2.1, paras: one(desc), size: fit(one(desc), bfont, cw - 0.5, ch - 2.1, 17, 10), font: bfont, color: sub }));
    });
  } else if (layout === 'quote' && blocks.length === 1 && blocks[0].kind === 'quote') {
    draw(blocks[0], area.x + area.w * 0.08, area.y, area.w * 0.84, area.h, { align: 'center' });
  } else {
    const stats = blocks.filter((b) => b.kind === 'stats'); const texts = blocks.filter((b) => b.kind === 'text' || b.kind === 'quote'); const visuals = blocks.filter((b) => !stats.includes(b) && !texts.includes(b));
    const a = { ...area };
    if (stats.length && (texts.length || visuals.length)) { const sh = Math.min(1.7, a.h * 0.32); const topStats = blocks[0].kind === 'stats'; draw({ kind: 'stats', items: stats.flatMap((x) => x.items) }, a.x, topStats ? a.y : a.y + a.h - sh, a.w, sh); if (topStats) a.y += sh + 0.25; a.h -= sh + 0.25; }
    else if (stats.length) draw({ kind: 'stats', items: stats.flatMap((x) => x.items) }, a.x, a.y, a.w, a.h);
    if (texts.length && visuals.length) {
      const visualFirst = layout === 'image-left' || (layout !== 'image-right' && blocks.indexOf(visuals[0]) < blocks.indexOf(texts[0]));
      const wide = visuals.some((b) => b.kind === 'table' && b.rows[0]?.length > 3);
      if (wide) stack(blocks.filter((b) => b.kind !== 'stats'), a.x, a.y, a.w, a.h);
      else if (visualFirst) columns(visuals, texts, a.x, a.y, a.w, a.h, 0.5); else columns(texts, visuals, a.x, a.y, a.w, a.h, visuals.every((b) => b.kind === 'image') ? 0.52 : 0.46);
    } else if (texts.length || visuals.length) stack([...texts, ...visuals].sort((x, y) => blocks.indexOf(x) - blocks.indexOf(y)), a.x, a.y, a.w, a.h);
  }
  // --- footer ---
  if (foot && !tp?.noFooter) {
    const fy = H - 0.5;
    if (settings.footer) els.push(T({ x: mx, y: fy, w: W * 0.6, h: 0.3, paras: one(String(settings.footer)), size: 11, font: bfont, color: sub, valign: 'middle' }));
    if (settings.numbers !== false) els.push(T({ x: W - mx - 1.2, y: fy, w: 1.2, h: 0.3, paras: one(String(index + 1)), size: 11, font: bfont, color: sub, align: 'right', valign: 'middle' }));
  }
  return { layout, bg, els, title: p.title };
}
