// The spreadsheet spec: what the model plans, cleaned into one predictable shape (normalize),
// and laid out cell by cell (expand) for the calculator, the preview and the .xlsx writer.
import { parseCell, parseRange, cellName, colName, colNum, rangeName, sheetsIn, MAX_COLS } from './a1.js';
import { resolveFormat, isoToSerial, toNumber } from './format.js';
import { colour } from '../brand.js';
import { clampNum, oneOf } from '../util.js';

export const LIMITS = { sheets: 60, cols: 200, rows: 20000, cells: 400000, title: 120 };
const ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;
const AGG = { sum: 'SUM', total: 'SUM', average: 'AVERAGE', avg: 'AVERAGE', mean: 'AVERAGE', min: 'MIN', max: 'MAX', count: 'COUNT', counta: 'COUNTA', median: 'MEDIAN' };
const STYLE_KEYS = ['bold', 'italic', 'underline', 'strike', 'wrap'];

export function cleanSheetName(name, used) {
  let n = String(name ?? '').replace(/[\\/?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  const base = n; let i = 2;
  while (used.has(n.toLowerCase())) { const suffix = ` (${i++})`; n = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(n.toLowerCase());
  return n;
}
// One style object with only the keys Scenly understands.
export function cleanStyle(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {};
  for (const k of STYLE_KEYS) if (s[k] != null) out[k] = !!s[k];
  const fill = colour(s.fill ?? s.background ?? s.bg, null); if (fill) out.fill = fill;
  const col = colour(s.color ?? s.fontColor ?? s.font_color, null); if (col) out.color = col;
  if (s.align) { const a = oneOf(s.align, ['left', 'center', 'right'], null); if (a) out.align = a; }
  if (s.valign) { const a = oneOf(s.valign, ['top', 'middle', 'bottom'], null); if (a) out.valign = a; }
  if (s.size != null) out.size = clampNum(s.size, 6, 72, 11);
  if (s.border != null) { const b = s.border === true ? 'thin' : oneOf(s.border, ['thin', 'medium', 'thick', 'none', 'bottom', 'top', 'outline'], null); if (b) out.border = b; }
  if (s.format != null) out.format = String(s.format).slice(0, 80);
  if (s.indent != null) out.indent = clampNum(s.indent, 0, 10, 0);
  return Object.keys(out).length ? out : null;
}
// A cell value from the model: number, text, true/false, null, "=formula", or { value, …style }.
function cleanValue(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > 8000 ? v.slice(0, 8000) : v;
  if (typeof v === 'object' && !Array.isArray(v)) {
    const inner = v.formula ?? v.f ?? v.value ?? v.v ?? v.text ?? null;
    const val = typeof inner === 'object' ? null : cleanValue(v.formula != null || v.f != null ? (String(inner).startsWith('=') ? String(inner) : '=' + inner) : inner);
    const st = cleanStyle(v.s && typeof v.s === 'object' ? v.s : v);
    const note = v.note ? String(v.note).slice(0, 500) : undefined;
    return st || note ? { v: val, ...(st ? { s: st } : {}), ...(note ? { note } : {}) } : val;
  }
  return String(v);
}
const rangeOk = (r) => { const p = parseRange(r); return p ? rangeName(p.wholeCols ? { ...p } : p).replace(/1048576/g, '1048576') && (p.wholeCols ? `${colName(p.c1)}:${colName(p.c2)}` : rangeName(p)) : null; };

function cleanColumn(c, i) {
  if (typeof c === 'string') c = { header: c };
  c ||= {};
  const out = { header: String(c.header ?? c.name ?? c.title ?? `Column ${i + 1}`).slice(0, 200) };
  if (c.format != null) out.format = String(c.format).slice(0, 80);
  if (c.width != null) out.width = clampNum(c.width, 2, 120, 12);
  if (c.formula != null && String(c.formula).trim()) { const f = String(c.formula).trim(); out.formula = f.startsWith('=') ? f : '=' + f; }
  if (c.align) { const a = oneOf(c.align, ['left', 'center', 'right'], null); if (a) out.align = a; }
  if (c.wrap) out.wrap = true;
  if (c.note) out.note = String(c.note).slice(0, 300);
  return out;
}

function cleanSheet(raw, used, errors, warnings) {
  const s = { name: cleanSheetName(raw.name ?? raw.title, used) };
  const where = `Sheet "${s.name}"`;
  // A sheet that is only planned so far: it is written separately before the workbook is built.
  if (typeof raw.build === 'string' && raw.build.trim()) s.build = raw.build.trim().slice(0, 2500);
  if (raw.data && typeof raw.data === 'object' && raw.data.table) {
    // Rows live in the document's DuckDB file (large uploads and query results).
    s.data = { table: String(raw.data.table), rows: Number(raw.data.rows) || 0, sample: Array.isArray(raw.data.sample) ? raw.data.sample.slice(0, 100) : [], types: Array.isArray(raw.data.types) ? raw.data.types.map(String) : [] };
    s.columns = (raw.columns || []).slice(0, LIMITS.cols).map(cleanColumn);
    for (const [i, c] of (raw.columns || []).slice(0, LIMITS.cols).entries()) if (c?.field) s.columns[i].field = String(c.field);
  } else if (Array.isArray(raw.grid)) {
    s.grid = raw.grid.slice(0, LIMITS.rows).map((r) => (Array.isArray(r) ? r.slice(0, LIMITS.cols).map(cleanValue) : [cleanValue(r)]));
  } else {
    let cols = raw.columns ?? raw.headers;
    let rows = Array.isArray(raw.rows) ? raw.rows : Array.isArray(raw.data) ? raw.data : [];
    if (!Array.isArray(cols) || !cols.length) {
      // No columns given: rows of objects name their own columns; otherwise this is a free-form sheet.
      const firstObj = rows.find((r) => r && typeof r === 'object' && !Array.isArray(r));
      cols = firstObj ? Object.keys(firstObj) : [];
    }
    if (cols.length > LIMITS.cols) { warnings.push(`${where}: only the first ${LIMITS.cols} columns were kept.`); cols = cols.slice(0, LIMITS.cols); }
    s.columns = cols.map(cleanColumn);
    if (rows.length > LIMITS.rows) { warnings.push(`${where}: only the first ${LIMITS.rows.toLocaleString('en-US')} rows were kept.`); rows = rows.slice(0, LIMITS.rows); }
    const key = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
    s.rows = rows.map((r) => {
      if (Array.isArray(r)) return r.slice(0, s.columns.length).map(cleanValue);
      if (r && typeof r === 'object') { const m = new Map(Object.entries(r).map(([k, v]) => [key(k), v])); return s.columns.map((c, i) => cleanValue(m.get(key(c.header)) ?? m.get(colName(i + 1).toLowerCase()) ?? null)); }
      return [cleanValue(r)];
    });
    if (raw.origin && parseCell(raw.origin)) s.origin = String(raw.origin).toUpperCase().replace(/\$/g, '');
    if (raw.generate && typeof raw.generate === 'object' && raw.generate.brief) s.generate = { count: clampNum(raw.generate.count ?? raw.generate.rows, 1, 5000, 50), brief: String(raw.generate.brief).slice(0, 1500) };
    const tot = raw.totals ?? raw.total;
    // Totals are kept by column letter. A header name is accepted too (a header wins over a letter when both fit).
    const col0 = s.origin ? parseCell(s.origin).col : 1;
    const totalCol = (k) => {
      const byHeader = s.columns.findIndex((c) => key(c.header) === key(k));
      if (byHeader >= 0) return byHeader;
      const ci = /^[A-Za-z]{1,3}$/.test(k) ? colNum(k) - col0 : -1;
      return ci >= 0 && ci < s.columns.length ? ci : -1;
    };
    if (tot && typeof tot === 'object' && !Array.isArray(tot)) {
      s.totals = {};
      for (const [k, v] of Object.entries(tot)) {
        if (k === 'label') { s.totalLabel = String(v).slice(0, 60); continue; }
        if (Array.isArray(v)) continue;
        const ci = totalCol(k);
        if (ci < 0) { warnings.push(`${where}: totals for "${k}" were ignored because there is no such column.`); continue; }
        s.totals[colName(col0 + ci)] = String(v);
      }
      if (Array.isArray(tot.sum)) for (const k of tot.sum) { const ci = totalCol(k); if (ci >= 0) s.totals[colName(col0 + ci)] = 'sum'; }
      if (!Object.keys(s.totals).length) delete s.totals;
    }
    if (raw.totalLabel) s.totalLabel = String(raw.totalLabel).slice(0, 60);
    if (raw.headerStyle === false) s.headerStyle = false;
    if (raw.banded) s.banded = true;
  }
  if (raw.cells && typeof raw.cells === 'object') {
    s.cells = {};
    for (const [k, v] of Object.entries(raw.cells).slice(0, 5000)) { const p = parseCell(k); if (p) s.cells[cellName(p.col, p.row)] = cleanValue(v); else warnings.push(`${where}: "${k}" is not a cell address and was ignored.`); }
    if (!Object.keys(s.cells).length) delete s.cells;
  }
  const ranged = (list, fn) => (Array.isArray(list) ? list : []).slice(0, 300).map((x) => { if (!x || typeof x !== 'object') return null; const r = rangeOk(x.range ?? x.ref ?? x.cells); if (!r) { warnings.push(`${where}: a rule with the range "${x.range}" was ignored.`); return null; } return fn(x, r); }).filter(Boolean);
  const st = ranged(raw.styles, (x, range) => { const c = cleanStyle(x); return c ? { range, ...c } : null; });
  if (st.length) s.styles = st;
  const cf = ranged(raw.conditional ?? raw.conditionalFormatting, (x, range) => {
    const rule = oneOf(String(x.rule ?? x.type ?? '').replace(/[\s_-]/g, ''), ['greaterThan', 'lessThan', 'between', 'equal', 'notEqual', 'greaterOrEqual', 'lessOrEqual', 'contains', 'colorScale', 'dataBar', 'top', 'bottom', 'duplicate', 'formula', 'aboveAverage', 'belowAverage', 'blank', 'notBlank'], null);
    if (!rule) { warnings.push(`${where}: the conditional rule "${x.rule}" is not supported and was ignored.`); return null; }
    const out = { range, rule };
    if (x.value != null) out.value = typeof x.value === 'number' ? x.value : String(x.value).slice(0, 300);
    if (x.value2 != null) out.value2 = typeof x.value2 === 'number' ? x.value2 : String(x.value2).slice(0, 300);
    if (x.formula) out.formula = String(x.formula).replace(/^=/, '').slice(0, 500);
    if (x.count != null) out.count = clampNum(x.count, 1, 1000, 10);
    const style = cleanStyle(x); if (style) Object.assign(out, style);
    if (Array.isArray(x.colors)) out.colors = x.colors.map((c) => colour(c, null)).filter(Boolean).slice(0, 3);
    if (rule === 'formula' && !out.formula) return null;
    return out;
  });
  if (cf.length) s.conditional = cf;
  const dv = ranged(raw.validation ?? raw.dataValidation, (x, range) => {
    const out = { range };
    if (Array.isArray(x.list)) out.list = x.list.map((v) => String(v).slice(0, 100)).slice(0, 200);
    else if (typeof x.list === 'string' && x.list) out.listRef = x.list.replace(/^=/, '').slice(0, 200);
    else if (x.type) { out.type = oneOf(x.type, ['whole', 'decimal', 'date', 'textLength'], 'decimal'); if (x.min != null) out.min = x.min; if (x.max != null) out.max = x.max; }
    else return null;
    if (x.message) out.message = String(x.message).slice(0, 200);
    return out;
  });
  if (dv.length) s.validation = dv;
  const merges = (Array.isArray(raw.merges) ? raw.merges : []).map(rangeOk).filter(Boolean).slice(0, 500);
  if (merges.length) s.merges = merges;
  if (raw.freeze) { const f = raw.freeze === true ? { col: 1, row: 2 } : parseCell(raw.freeze); if (f) s.freeze = cellName(f.col, f.row); }
  if (raw.filter) s.filter = raw.filter === true ? true : rangeOk(raw.filter) || true;
  if (raw.protect) s.protect = true;
  if (raw.hidden) s.hidden = true;
  if (raw.gridlines === false) s.gridlines = false;
  const tab = colour(raw.tabColor, null); if (tab) s.tabColor = tab;
  if (raw.widths && typeof raw.widths === 'object') { s.widths = {}; for (const [k, v] of Object.entries(raw.widths)) if (/^[A-Za-z]{1,3}$/.test(k)) s.widths[k.toUpperCase()] = clampNum(v, 2, 120, 12); }
  if (raw.heights && typeof raw.heights === 'object') { s.heights = {}; for (const [k, v] of Object.entries(raw.heights)) if (/^\d+$/.test(k)) s.heights[k] = clampNum(v, 6, 300, 18); }
  const charts = (Array.isArray(raw.charts) ? raw.charts : []).slice(0, 12).map((c) => cleanChart(c, where, warnings)).filter(Boolean);
  if (charts.length) s.charts = charts;
  if (!s.data && !s.grid && !s.columns?.length && !s.cells && !s.generate && !s.build) errors.push(`${where} is empty. Give it "columns" and "rows", or "cells".`);
  return s;
}

function cleanChart(c, where, warnings) {
  if (!c || typeof c !== 'object') return null;
  const type = oneOf(String(c.type || 'column').replace(/chart$/i, ''), ['column', 'bar', 'line', 'pie', 'doughnut', 'area', 'scatter', 'stackedColumn', 'stackedBar'], 'column');
  const series = (Array.isArray(c.series) ? c.series : c.values ? [{ name: c.name, values: c.values }] : []).slice(0, 12).map((s) => {
    const values = typeof s === 'string' ? s : s?.values;
    if (!values || !parseRange(values)) return null;
    const out = { values: String(values).replace(/\$/g, '') };
    if (s?.name != null) out.name = String(s.name).slice(0, 100);
    const col = colour(s?.color, null); if (col) out.color = col;
    return out;
  }).filter(Boolean);
  if (!series.length) { warnings.push(`${where}: a chart was ignored because it has no data range.`); return null; }
  const out = { type, series };
  if (c.title) out.title = String(c.title).slice(0, 120);
  if (c.categories && parseRange(c.categories)) out.categories = String(c.categories).replace(/\$/g, '');
  if (c.sheet) out.sheet = String(c.sheet).slice(0, 31);
  out.anchor = parseCell(c.anchor ?? c.at) ? String(c.anchor ?? c.at).toUpperCase() : null;
  out.width = clampNum(c.width, 200, 1400, 520); out.height = clampNum(c.height, 140, 900, 300);
  if (c.xTitle) out.xTitle = String(c.xTitle).slice(0, 80);
  if (c.yTitle) out.yTitle = String(c.yTitle).slice(0, 80);
  if (c.legend === false) out.legend = false;
  return out;
}

// Cleans a whole workbook spec. Returns { spec, errors, warnings }.
export function normalize(raw) {
  const errors = [], warnings = [];
  raw = raw && typeof raw === 'object' ? raw : {};
  const list = Array.isArray(raw.sheets) ? raw.sheets : Array.isArray(raw.tabs) ? raw.tabs : raw.columns || raw.rows || raw.cells || raw.grid ? [raw] : [];
  const spec = { kind: 'sheet', title: String(raw.title || raw.name || 'Spreadsheet').trim().slice(0, LIMITS.title) || 'Spreadsheet', sheets: [] };
  if (raw.currency) spec.currency = String(raw.currency).trim().slice(0, 6);
  if (raw.theme && typeof raw.theme === 'object') { spec.theme = {}; for (const k of ['header', 'headerText', 'accent', 'band']) { const c = colour(raw.theme[k], null); if (c) spec.theme[k] = c; } if (raw.theme.font) spec.theme.font = String(raw.theme.font).replace(/[^\w \-]/g, '').slice(0, 40); if (raw.theme.fontSize) spec.theme.fontSize = clampNum(raw.theme.fontSize, 8, 16, 11); if (!Object.keys(spec.theme).length) delete spec.theme; }
  if (!list.length) errors.push('The workbook has no sheets. Give "sheets": [ { "name": …, "columns": […], "rows": […] } ].');
  if (list.length > LIMITS.sheets) warnings.push(`Only the first ${LIMITS.sheets} sheets were kept.`);
  const used = new Set();
  for (const sh of list.slice(0, LIMITS.sheets)) if (sh && typeof sh === 'object') spec.sheets.push(cleanSheet(sh, used, errors, warnings));
  const names = (Array.isArray(raw.names) ? raw.names : Array.isArray(raw.namedRanges) ? raw.namedRanges : []).slice(0, 200).map((n) => {
    const name = String(n?.name || '').trim(); const ref = String(n?.ref ?? n?.range ?? '').trim().replace(/^=/, '');
    if (!/^[A-Za-z_][A-Za-z0-9_.]{0,60}$/.test(name) || parseCell(name) || !ref) { if (name) warnings.push(`The name "${name}" is not a valid range name and was ignored.`); return null; }
    return { name, ref };
  }).filter(Boolean);
  if (names.length) spec.names = names;
  // Every formula must point at sheets that exist.
  const have = new Set(spec.sheets.map((s) => s.name.toLowerCase()));
  const missing = new Set();
  eachFormula(spec, (f) => { for (const n of sheetsIn(f)) if (!have.has(n.toLowerCase())) missing.add(n); });
  for (const n of missing) errors.push(`A formula points at a sheet called "${n}", but the workbook has no such sheet. Sheets are: ${spec.sheets.map((s) => `"${s.name}"`).join(', ')}.`);
  let cells = 0; for (const s of spec.sheets) cells += (s.rows?.length || s.grid?.length || 0) * (s.columns?.length || s.grid?.[0]?.length || 1);
  if (cells > LIMITS.cells) errors.push('The workbook is too large to build in one go. Use fewer rows, or upload the data as a file instead.');
  return { spec, errors, warnings };
}

const rawOf = (v) => (v && typeof v === 'object' ? v.v : v);
// Calls fn(formula, set) for every formula in the spec; `set` replaces it.
export function eachFormula(spec, fn) {
  let home = spec.sheets[0]?.name;
  const visit = (v, put) => { const r = rawOf(v); if (typeof r === 'string' && r.startsWith('=')) fn(r, (nv) => put(v && typeof v === 'object' ? { ...v, v: nv } : nv), home); };
  for (const s of spec.sheets) {
    home = s.name;
    for (const c of s.columns || []) if (c.formula) fn(c.formula, (nv) => { c.formula = nv; }, home);
    for (const row of s.rows || []) row.forEach((v, i) => visit(v, (nv) => { row[i] = nv; }));
    for (const row of s.grid || []) row.forEach((v, i) => visit(v, (nv) => { row[i] = nv; }));
    for (const k of Object.keys(s.cells || {})) visit(s.cells[k], (nv) => { s.cells[k] = nv; });
    for (const k of Object.keys(s.totals || {})) if (String(s.totals[k]).startsWith('=')) fn(s.totals[k], (nv) => { s.totals[k] = nv; }, home);
    for (const c of s.conditional || []) if (c.formula) fn('=' + c.formula, (nv) => { c.formula = nv.replace(/^=/, ''); }, home);
  }
  for (const n of spec.names || []) fn('=' + n.ref, (nv) => { n.ref = nv.replace(/^=/, ''); }, spec.sheets[0]?.name);
}

// Where a table sheet sits: header row, first and last data row, total row (all 1-based).
export function layout(s) {
  const o = s.origin ? parseCell(s.origin) : { col: 1, row: 1 };
  const n = s.data ? s.data.rows : s.rows?.length || 0;
  const hasTable = !!s.columns?.length;
  return { col0: o.col, headerRow: o.row, first: o.row + 1, last: o.row + n, totalRow: s.totals ? o.row + n + 1 : null, cols: s.columns?.length || 0, n, hasTable };
}
const fillTemplate = (f, r, L) => f.replace(/\{r\}|\{row\}/gi, r).replace(/\{prev\}/gi, r - 1).replace(/\{next\}/gi, r + 1).replace(/\{first\}/gi, L.first).replace(/\{last\}/gi, Math.max(L.last, L.first)).replace(/\{total\}/gi, L.totalRow ?? L.last + 1).replace(/\{header\}/gi, L.headerRow);

// Lays a sheet out as a sparse matrix of cells: { v (number|string|boolean|null), f (formula), fmt, t }.
// `rowsOverride` lets data-backed sheets expand just a window of their rows.
export function expandSheet(spec, s, { rowsOverride, rowOffset = 0 } = {}) {
  const cur = spec.currency;
  const cells = new Map(); // "r,c" → cell
  let maxR = 0, maxC = 0;
  const put = (r, c, raw, colFmt, kind) => {
    const obj = raw && typeof raw === 'object' ? raw : null;
    let v = obj ? obj.v : raw;
    if (v == null && !obj) return;
    const cell = { v: null };
    const fmt = obj?.s?.format ? resolveFormat(obj.s.format, cur) : colFmt;
    if (typeof v === 'string' && v.startsWith('=') && v.length > 1) cell.f = v;
    else if (typeof v === 'string') {
      if (fmt?.kind !== 'text' && ISO.test(v)) { const n = isoToSerial(v); if (n != null) { cell.v = n; cell.t = 'd'; } else cell.v = v; }
      else if (fmt && (fmt.kind === 'number' || fmt.kind === 'currency' || fmt.kind === 'percent') && v.trim() !== '') { const n = toNumber(v); cell.v = n ?? v; }
      else cell.v = v;
    } else cell.v = v;
    if (fmt && fmt.kind !== 'general') cell.fmt = fmt;
    else if (cell.t === 'd') cell.fmt = resolveFormat(/[T ]\d{2}:/.test(String(v)) ? 'datetime' : 'date', cur);
    if (obj?.s) cell.s = obj.s;
    if (obj?.note) cell.note = obj.note;
    if (kind) cell.k = kind;
    cells.set(r + ',' + c, cell);
    if (r > maxR) maxR = r; if (c > maxC) maxC = c;
  };
  const L = layout(s);
  if (s.columns?.length) {
    const fmts = s.columns.map((c) => resolveFormat(c.format, cur));
    s.columns.forEach((c, i) => put(L.headerRow, L.col0 + i, c.header, null, 'h'));
    const rows = rowsOverride || s.rows || [];
    rows.forEach((row, ri) => {
      const r = L.first + rowOffset + ri;
      s.columns.forEach((c, i) => {
        const given = row[i];
        if ((given == null || given === '') && c.formula) put(r, L.col0 + i, fillTemplate(c.formula, r, L), fmts[i]);
        else if (given != null) put(r, L.col0 + i, given, fmts[i]);
      });
    });
    if (s.totals && L.totalRow && !rowsOverride) {
      const labelCol = s.columns.findIndex((_c, i) => s.totals[colName(L.col0 + i)] == null);
      if (labelCol >= 0) put(L.totalRow, L.col0 + labelCol, s.totalLabel || 'Total', null, 't');
      for (const [letter, how] of Object.entries(s.totals)) {
        const i = colNum(letter) - L.col0;
        if (i < 0 || i >= s.columns.length) continue;
        const fn = AGG[String(how).toLowerCase()];
        const f = fn ? `=${fn}(${letter}${L.first}:${letter}${Math.max(L.last, L.first)})` : fillTemplate(String(how).startsWith('=') ? String(how) : '=' + how, L.totalRow, L);
        put(L.totalRow, L.col0 + i, f, fmts[i], 't');
      }
    }
  }
  if (s.grid && !rowsOverride) s.grid.forEach((row, ri) => row.forEach((v, ci) => put(ri + 1, ci + 1, v, null)));
  if (!rowsOverride) for (const [k, v] of Object.entries(s.cells || {})) { const p = parseCell(k); const prev = cells.get(p.row + ',' + p.col); put(p.row, p.col, v, prev?.fmt && !(v && typeof v === 'object' && v.s?.format) ? prev.fmt : null); }
  return { cells, maxR, maxC, layout: L };
}

// Column widths: given ones first, then a sensible guess from the content.
export function columnWidths(s, ex) {
  const w = {};
  const L = ex.layout;
  for (let c = 1; c <= Math.min(ex.maxC, MAX_COLS); c++) {
    const given = s.widths?.[colName(c)] ?? (s.columns && c >= L.col0 && c < L.col0 + s.columns.length ? s.columns[c - L.col0].width : null);
    if (given) { w[c] = given; continue; }
    let max = 6, seen = 0;
    for (const [k, cell] of ex.cells) {
      if (!k.endsWith(',' + c)) continue;
      if (++seen > 400) break;
      const len = cell.f ? 10 : cell.t === 'd' ? 12 : typeof cell.v === 'number' ? String(Math.round(cell.v)).length + (cell.fmt?.kind === 'currency' ? 5 : 3) : String(cell.v ?? '').split('\n').reduce((m, l) => Math.max(m, l.length), 0);
      if (len > max) max = len;
    }
    w[c] = Math.min(60, Math.max(8, Math.round(max * 1.15 + 2)));
  }
  return w;
}
