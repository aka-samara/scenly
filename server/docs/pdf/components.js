// Turns the page markup the model writes into safe, finished HTML: scripts and outside resources
// are removed, and the custom tags (<chart>, <qr>, <field>, pictures by file id, the logo) are drawn.
import { createRequire } from 'node:module';
import { chartSvg, PALETTE } from './charts.js';
import { baseCss, pageBox } from './base.js';
import { esc } from '../util.js';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');

const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export function attrs(s) {
  const out = {};
  for (const m of String(s || '').matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}
const TAG = (name) => new RegExp(`<${name}\\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(?:\\/>|>([\\s\\S]*?)<\\/${name}\\s*>|>)`, 'gi');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');

// Nothing active and nothing fetched from outside may survive in a page.
export function cleanHtml(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|iframe|object|embed|frame|frameset|applet|noscript|template|audio|video|canvas|form|title|head)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|iframe|object|embed|frame|frameset|applet|base|meta|link|form|input|button|textarea|select|option|html|body|head|!doctype)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href|action|formaction)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'>\s]*/gi, '$1=$2#')
    // Pictures and fonts come only from uploaded files or data: URLs.
    .replace(/\ssrc(set)?\s*=\s*("|')\s*(?:https?:)?\/\/[^"']*\2/gi, ' data-blocked-src=""')
    .replace(/url\(\s*(["']?)\s*(?:https?:)?\/\/[^)]*\)/gi, 'none')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/[-]/g, '');
}
// Closes tags a page left open (a reply cut short) and drops closing tags that match nothing, so one
// page can never swallow the next.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'chart', 'qr', 'field']);
export function balance(html) {
  let h = String(html || '');
  const lt = h.lastIndexOf('<'); if (lt >= 0 && h.indexOf('>', lt) < 0) h = h.slice(0, lt);
  const stack = []; let out = ''; let last = 0;
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g; let m;
  while ((m = re.exec(h))) {
    const name = m[2].toLowerCase(); let keep = true;
    if (m[1]) { const at = stack.lastIndexOf(name); if (at < 0) keep = false; else stack.length = at; }
    else if (!VOID.has(name) && !/\/\s*$/.test(m[3])) stack.push(name);
    out += h.slice(last, keep ? re.lastIndex : m.index); last = re.lastIndex;
  }
  out += h.slice(last);
  const implied = new Set(['p', 'li', 'td', 'th', 'tr', 'tbody', 'thead', 'tfoot', 'dd', 'dt', 'option']);
  // <chart>, <qr> and <field> may be written with or without a closing tag, so theirs are never added.
  return out + stack.reverse().filter((t) => !implied.has(t)).map((t) => `</${t}>`).join('');
}
export const cleanCss = (css) => String(css || '').replace(/<\/?style[^>]*>/gi, '').replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(["']?)\s*(?:https?:)?\/\/[^)]*\)/gi, 'none').replace(/expression\s*\(/gi, '(').replace(/<\//g, '').slice(0, 20000);

export function parseChart(a, body) {
  let c = {};
  const text = String(body || '').trim();
  if (text.startsWith('{')) { try { c = JSON.parse(text); } catch { /* attributes are used instead */ } }
  const list = (s) => String(s || '').split(/\s*[|;,]\s*/).filter((x) => x !== '');
  const nums = (s) => String(s || '').split(/\s*[|;,]\s*/).map((x) => Number(String(x).replace(/[^0-9.eE+-]/g, ''))).filter((x) => Number.isFinite(x));
  const labels = c.labels || (a.labels ? String(a.labels).split(/\s*[|,]\s*/) : []);
  let series = Array.isArray(c.series) ? c.series : [];
  if (!series.length && a.series) series = String(a.series).split(/\s*;\s*/).filter(Boolean).map((part) => { const i = part.indexOf(':'); return { name: i > 0 ? part.slice(0, i).trim() : '', values: nums(i > 0 ? part.slice(i + 1) : part) }; });
  if (!series.length && (a.values || c.values)) series = [{ name: a.name || '', values: Array.isArray(c.values) ? c.values : nums(a.values) }];
  const bool = (v, d) => (v == null ? d : !/^(false|no|0|off)$/i.test(String(v)));
  return { type: a.type || c.type || 'bar', title: a.title ?? c.title, labels, series, colors: a.colors ? list(a.colors) : c.colors, prefix: a.prefix ?? c.prefix ?? '', suffix: a.suffix ?? c.suffix ?? '', values: bool(a['show-values'] ?? a.showvalues ?? c.showValues, undefined), legend: a.legend != null ? bool(a.legend, true) : c.legend, center: a.center ?? c.center };
}
const cssSize = (v, d) => { const s = String(v ?? '').trim(); return /^\d+(\.\d+)?$/.test(s) ? s + 'mm' : /^\d+(\.\d+)?(mm|cm|px|pt|%|em|rem|in)$/.test(s) ? s : d; };

function qrSvg(value, colour = '#000') {
  try {
    const q = QRCode.create(String(value || ' ').slice(0, 1200), { errorCorrectionLevel: 'M' }); const n = q.modules.size, d = q.modules.data; let path = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) path += `M${x} ${y}h1v1h-1z`;
    return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" width="100%" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block;background:#fff"><path d="${path}" fill="${colour}"/></svg>`;
  } catch { return '<div class="noimg">QR code text is too long</div>'; }
}

// mode: 'preview' (pictures by URL, components marked so hand edits can be saved back), 'print' and 'measure' (pictures inlined).
export function expand(html, theme, { mode = 'print', colors } = {}) {
  const mark = (src, inner, cls = '') => (mode === 'preview' ? `<span class="cmp ${cls}" contenteditable="false" data-src="${b64(src)}">${inner}</span>` : `<span class="cmp ${cls}">${inner}</span>`);
  const imgUrl = (ref) => {
    const r = String(ref || '').trim();
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(r)) return r;
    if (/^logo$/i.test(r)) return theme.logo ? `data:${theme.logo.mime};base64,${theme.logo.data.toString('base64')}` : null;
    const m = /^file:([\w-]+)$/.exec(r); const f = m && theme.file?.(m[1]); if (!f) return null;
    if (mode === 'preview') return `/api/files/${m[1]}/raw`;
    try { return `data:${f.mime};base64,${f.data().toString('base64')}`; } catch { return null; }
  };
  let out = cleanHtml(html);
  out = out.replace(TAG('chart'), (src, at, body) => {
    const a = attrs(at); const c = parseChart(a, body);
    const ratio = /^(\d+(\.\d+)?)\s*[:/x]\s*(\d+(\.\d+)?)$/.exec(a.aspect || a.ratio || ''); const W = 560;
    const H = ratio ? Math.round((W * Number(ratio[3])) / Number(ratio[1])) : /pie|dough|donut/i.test(c.type) ? 360 : 300;
    const svg = chartSvg({ ...c, width: W, height: H, colors: c.colors?.length ? c.colors : colors, ink: 'currentColor' });
    const w = cssSize(a.width, ''), h = cssSize(a.height, '');
    return mark(src, `<span style="display:block;${w ? `width:${w};` : ''}${h ? `max-height:${h};` : ''}${a.style ? a.style.replace(/"/g, "'") : ''}">${h ? svg.replace('style="display:block;max-width:100%;height:auto"', `style="display:block;max-width:100%;height:${h};width:100%"`) : svg}</span>`);
  });
  out = out.replace(TAG('qr'), (src, at) => { const a = attrs(at); const size = cssSize(a.size || a.width, '28mm'); return mark(src, `<span style="display:block;width:${size};height:${size};${a.style ? a.style.replace(/"/g, "'") : ''}">${qrSvg(a.value || a.url || a.text || a.href, /^#[0-9a-f]{3,8}$/i.test(a.color || '') ? a.color : '#000')}</span>`, 'inline'); });
  out = out.replace(TAG('field'), (src, at) => {
    const a = attrs(at); const type = /^(text|multiline|checkbox|date|select|signature|number|email)$/i.test(a.type || '') ? a.type.toLowerCase() : 'text';
    const name = String(a.name || a.label || 'field').replace(/[^\w .-]/g, '').slice(0, 60) || 'field';
    const box = `<span class="fld-b ${type === 'multiline' ? 'multi' : type === 'checkbox' ? 'check' : type === 'signature' ? 'sig' : ''}" data-field="${esc(name)}" data-type="${type}"${a.options ? ` data-options="${esc(a.options)}"` : ''}${a.height ? ` style="height:${cssSize(a.height, '8mm')}"` : ''}></span>`;
    const label = a.label ? `<span class="fld-l">${esc(a.label)}</span>` : '';
    return mark(src, `<span class="fld ${type === 'checkbox' ? 'check' : ''}"${a.style ? ` style="${a.style.replace(/"/g, "'")}"` : ''}>${type === 'checkbox' ? box + label : label + box}</span>`);
  });
  out = out.replace(/<img\b((?:"[^"]*"|'[^']*'|[^>"'])*?)\/?>/gi, (tag, at) => {
    const a = attrs(at); const ref = a.src || '';
    if (!ref) return `<span class="noimg" ${a.style ? `style="${a.style.replace(/"/g, "'")}"` : ''}>Picture</span>`;
    const url = imgUrl(ref);
    // No logo in the brand kit: the company name stands in for it.
    if (!url && /^logo$/i.test(ref)) return theme.company ? `<span class="bold" style="font-family:var(--hfont);font-size:1.25em;white-space:nowrap">${esc(theme.company)}</span>` : '';
    if (!url) return `<span class="noimg ${esc(a.class || '')}" ${a.style ? `style="${a.style.replace(/"/g, "'")}"` : ''}>${esc(a.alt || 'Picture')}</span>`;
    const rest = String(at).replace(/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '');
    return `<img src="${url}"${mode === 'preview' && !/^data:/.test(ref) ? ` data-ref="${esc(ref)}"` : ''}${rest}>`;
  });
  // Background pictures by file id: url(file:ID)
  out = out.replace(/url\(\s*(["']?)(file:[\w-]+|logo)\1\s*\)/gi, (_m, _q, ref) => { const u = imgUrl(ref); return u ? `url('${u}')` : 'none'; });
  return out;
}

// What goes behind a page: a theme colour name, any CSS colour or gradient, or an uploaded picture.
function pageBg(bg, expandCss) {
  const v = String(bg || '').trim(); if (!v) return '';
  if (/^(primary|accent|soft|text)$/i.test(v)) return `background:var(--${v.toLowerCase()});`;
  if (/^dark$/i.test(v)) return 'background:#14181f;';
  if (/^file:[\w-]+$/i.test(v)) return expandCss(`background:url(${v}) center/cover no-repeat;`);
  if (/^[#\w(),.%\s-]+$/.test(v) && !/url|expression|;/i.test(v)) return `background:${v};`;
  return '';
}
const DARK = /^(primary|accent|dark|text)$/i;

// The whole document as one HTML file. Fixed pages are exact page-sized boxes; flow pages run on over as many pages as they need.
export function docHtml(spec, theme, { mode = 'print', only = null } = {}) {
  const st = spec.settings || {}; const box = pageBox(st);
  const th = st.theme || {};
  const colors = [th.accent || theme.colors.accent, th.primary || theme.colors.primary, ...PALETTE.slice(1)];
  const total = spec.pages.length;
  const pages = spec.pages.map((p, i) => {
    if (only != null && only !== i) return '';
    const ex = (h) => expand(h, theme, { mode, colors });
    // In the preview the numbers are marked, so text edited on the page keeps {page} and {pages} as they were written.
    const num = (token, v) => (mode === 'preview' ? `<span class="cmp inline" contenteditable="false" data-src="${Buffer.from(token).toString('base64url')}">${v}</span>` : String(v));
    let inner = ex(balance(p.html || '')).replace(/\{page\}/gi, num('{page}', i + 1)).replace(/\{pages\}/gi, num('{pages}', total));
    if (p.build) inner = `<div class="noimg grow" style="margin:0">This page is still to be written: ${esc(String(p.build).slice(0, 200))}</div>`;
    const fit = !p.flow && p.fit && p.fit < 1 ? ` style="zoom:${p.fit};width:${(100 / p.fit).toFixed(3)}%;height:${(100 / p.fit).toFixed(3)}%"` : '';
    const bg = pageBg(p.bg, (css) => ex(`<i style="${css}"></i>`).match(/style="([^"]*)"/)?.[1] || '');
    const dark = DARK.test(String(p.bg || '').trim()) ? ' on-dark' : '';
    const pad = p.pad != null && !p.bleed ? `--pad:${Number(p.pad) || 0}mm;` : '';
    return `<section class="pg${p.flow ? ' flow' : ''}${dark}" data-page="${i}"${p.bleed ? ' data-bleed' : ''}${p.flow ? ' data-flow' : ''}${bg || pad ? ` style="${pad}${bg}"` : ''}>${p.flow ? `<table class="flow-t"><thead><tr><td></td></tr></thead><tbody><tr><td><div class="pg-in">${inner}</div></td></tr></tbody><tfoot><tr><td></td></tr></tfoot></table>` : `<div class="pg-in"${fit}>${inner}</div>`}</section>`;
  }).join('\n');
  // Text that would be invisible on its background (found when the pages are checked) gets a readable colour.
  const ink = mode === 'measure' ? '' : spec.pages.map((p, i) => (p.ink || []).map((f) => `.pg[data-page="${i}"] .pg-in>${String(f.path).split('/').map((n) => `:nth-child(${Number(n) || 1})`).join('>')}{color:${/^#[0-9a-f]{3,8}$/i.test(f.c) ? f.c : '#fff'}!important}`).join('')).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(spec.title)}</title><style>${baseCss(spec, theme, mode)}\n${cleanCss(spec.css)}\n${ink}</style></head><body>${pages}</body></html>`;
}
