// Works out how each cell looks: workbook theme, table header / total / banding, column settings,
// style ranges, then the cell's own style. Used by both the preview and the .xlsx writer.
import { parseRange, colName } from './a1.js';
import { resolveFormat } from './format.js';

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const textOn = (bg) => (lum(bg) > 0.45 ? '#1A1A22' : '#FFFFFF');
// Mixes a colour with white: tint('#1F3A5F', 0.9) is a very light version.
export const tint = (hex, amount) => { const n = parseInt(hex.slice(1), 16); const mix = (v) => Math.round(v + (255 - v) * amount); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, '0')).join('').toUpperCase(); };

export function sheetTheme(spec, theme) {
  const t = { ...(theme?.template?.sheet || {}), ...(spec.theme || {}) };
  const header = t.header || theme?.colors?.primary || '#1F3A5F';
  const accent = t.accent || theme?.colors?.accent || '#2E75B6';
  return { header, headerText: t.headerText || textOn(header), accent, band: t.band || tint(header, 0.93), total: tint(header, 0.86), font: t.font || theme?.fonts?.body || 'Calibri', fontSize: t.fontSize || 11, text: theme?.colors?.text || '#1A1A22', line: '#D0D4DB' };
}

// Returns style(r, c, cell) → { bold, italic, underline, strike, wrap, fill, color, align, valign, size, border, fmt, indent }.
export function styler(spec, s, ex, theme) {
  const T = sheetTheme(spec, theme);
  const L = ex.layout;
  const ranges = (s.styles || []).map((x) => ({ p: parseRange(x.range), x })).filter((x) => x.p);
  const inTable = (c) => L.hasTable && c >= L.col0 && c < L.col0 + L.cols;
  return (r, c, cell) => {
    const out = {};
    if (inTable(c)) {
      const col = s.columns[c - L.col0];
      if (r === L.headerRow && s.headerStyle !== false) Object.assign(out, { bold: true, fill: T.header, color: T.headerText, align: 'center', valign: 'middle', wrap: true, border: 'thin' });
      else if (L.totalRow && r === L.totalRow) Object.assign(out, { bold: true, fill: T.total, border: 'top' });
      else if (r >= L.first && r <= L.last) { if (s.banded && (r - L.first) % 2 === 1) out.fill = T.band; if (col.align) out.align = col.align; if (col.wrap) out.wrap = true; }
    }
    for (const { p, x } of ranges) if (r >= p.r1 && r <= p.r2 && c >= p.c1 && c <= p.c2) { for (const k of Object.keys(x)) if (k !== 'range' && k !== 'format') out[k] = x[k]; if (x.format) out.fmt = resolveFormat(x.format, spec.currency); }
    if (cell?.s) { for (const k of Object.keys(cell.s)) if (k !== 'format') out[k] = cell.s[k]; }
    if (cell?.fmt) out.fmt = cell.s?.format || !out.fmt ? cell.fmt : out.fmt;
    return out;
  };
}
export const themeOf = sheetTheme;
export { colName };
