// What the studio panel shows (a grid with calculated values, looks and charts) and what the
// model is told about the current workbook when it is asked to change it.
import { calculate } from './calc.js';
import { layout, columnWidths } from './model.js';
import { styler, sheetTheme } from './style.js';
import { parseRange, parseCell, cellName, colName } from './a1.js';
import { display, resolveFormat } from './format.js';
import { chartData, placeCharts } from './charts.js';
import * as duck from './duck.js';

const calcs = new WeakMap();
export const calcOf = (spec) => { let c = calcs.get(spec); if (!c) { c = calculate(spec); calcs.set(spec, c); } return c; };
export const keepCalc = (spec, calc) => calcs.set(spec, calc);

const valueOf = (sh, k) => { const cell = sh.ex.cells.get(k); if (!cell) return undefined; return cell.f ? sh.values.get(k) : cell.v; };
export function cellText(cell, v) {
  if (v && typeof v === 'object') return v.pending ? '…' : v.error || '#ERROR!';
  if (v === undefined && cell.f) return '';
  return display(v, cell.fmt);
}
const mixHex = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };

// Conditional formatting, worked out for the preview. Returns Map "r,c" → style overrides.
function conditionalStyles(s, sh) {
  const out = new Map();
  for (const rule of s.conditional || []) {
    const p = parseRange(rule.range); if (!p) continue;
    const r2 = Math.min(p.r2, sh.ex.maxR), c2 = Math.min(p.c2, sh.ex.maxC);
    const cells = [];
    for (let r = p.r1; r <= r2; r++) for (let c = p.c1; c <= c2; c++) { const v = valueOf(sh, r + ',' + c); cells.push({ k: r + ',' + c, v: v && typeof v === 'object' ? null : v ?? null }); }
    const nums = cells.map((x) => x.v).filter((v) => typeof v === 'number');
    const style = {}; for (const k of ['fill', 'color', 'bold', 'italic']) if (rule[k] != null) style[k] = rule[k];
    if (!Object.keys(style).length) style.fill = '#FFE699';
    const num = (x) => (typeof x === 'number' ? x : Number(String(x).replace(/^=/, '')));
    const a = num(rule.value), b = num(rule.value2);
    const cmp = (v) => {
      const isNum = typeof v === 'number';
      switch (rule.rule) {
        case 'greaterThan': return isNum && v > a; case 'lessThan': return isNum && v < a;
        case 'greaterOrEqual': return isNum && v >= a; case 'lessOrEqual': return isNum && v <= a;
        case 'between': return isNum && v >= Math.min(a, b) && v <= Math.max(a, b);
        case 'equal': return v != null && (isNum && Number.isFinite(a) ? v === a : String(v).toLowerCase() === String(rule.value).toLowerCase());
        case 'notEqual': return v != null && !(isNum && Number.isFinite(a) ? v === a : String(v).toLowerCase() === String(rule.value).toLowerCase());
        case 'contains': return v != null && String(v).toLowerCase().includes(String(rule.value ?? '').toLowerCase());
        case 'blank': return v == null || String(v).trim() === ''; case 'notBlank': return v != null && String(v).trim() !== '';
        default: return false;
      }
    };
    if (rule.rule === 'colorScale' && nums.length) {
      const cs = rule.colors?.length >= 2 ? rule.colors : ['#F8696B', '#FFEB84', '#63BE7B'];
      const lo = Math.min(...nums), hi = Math.max(...nums);
      const mid = [...nums].sort((x, y) => x - y)[Math.floor(nums.length / 2)];
      for (const x of cells) if (typeof x.v === 'number') { const fill = hi === lo ? cs[0] : cs.length === 3 ? (x.v <= mid ? mixHex(cs[0], cs[1], mid === lo ? 1 : (x.v - lo) / (mid - lo)) : mixHex(cs[1], cs[2], (x.v - mid) / (hi - mid))) : mixHex(cs[0], cs[1], (x.v - lo) / (hi - lo)); out.set(x.k, { ...(out.get(x.k) || {}), fill, color: '#1A1A22' }); }
    } else if (rule.rule === 'dataBar' && nums.length) {
      const hi = Math.max(...nums, 0);
      for (const x of cells) if (typeof x.v === 'number' && hi > 0) out.set(x.k, { ...(out.get(x.k) || {}), bar: Math.max(0, Math.round((x.v / hi) * 100)), barColor: rule.fill || '#63A0E8' });
    } else if ((rule.rule === 'top' || rule.rule === 'bottom') && nums.length) {
      const sorted = [...nums].sort((x, y) => (rule.rule === 'top' ? y - x : x - y)); const cut = sorted[Math.min(sorted.length, rule.count || 10) - 1];
      for (const x of cells) if (typeof x.v === 'number' && (rule.rule === 'top' ? x.v >= cut : x.v <= cut)) out.set(x.k, { ...(out.get(x.k) || {}), ...style });
    } else if ((rule.rule === 'aboveAverage' || rule.rule === 'belowAverage') && nums.length) {
      const avg = nums.reduce((x, y) => x + y, 0) / nums.length;
      for (const x of cells) if (typeof x.v === 'number' && (rule.rule === 'aboveAverage' ? x.v > avg : x.v < avg)) out.set(x.k, { ...(out.get(x.k) || {}), ...style });
    } else if (rule.rule === 'duplicate') {
      const count = new Map(); for (const x of cells) if (x.v != null) count.set(String(x.v).toLowerCase(), (count.get(String(x.v).toLowerCase()) || 0) + 1);
      for (const x of cells) if (x.v != null && count.get(String(x.v).toLowerCase()) > 1) out.set(x.k, { ...(out.get(x.k) || {}), ...style });
    } else for (const x of cells) if (cmp(x.v)) out.set(x.k, { ...(out.get(x.k) || {}), ...style });
  }
  return out;
}

const PREVIEW_ROWS = 1500;
export function preview(spec, theme) {
  const calc = calcOf(spec);
  const T = sheetTheme(spec, theme);
  const sheets = spec.sheets.map((s, si) => {
    const sh = calc.sheets[si]; const { ex } = sh; const L = ex.layout;
    const styleOf = styler(spec, s, ex, theme);
    const cond = conditionalStyles(s, sh);
    const styles = [], index = new Map();
    const sid = (st) => { const k = JSON.stringify(st); let i = index.get(k); if (i == null) { i = styles.length; styles.push(st); index.set(k, i); } return i; };
    const cells = [];
    const maxR = Math.min(ex.maxR, PREVIEW_ROWS);
    const keys = [...ex.cells.keys()].map((k) => k.split(',').map(Number)).filter(([r]) => r <= maxR).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [r, c] of keys) {
      const k = r + ',' + c; const cell = ex.cells.get(k);
      const v = cell.f ? sh.values.get(k) : cell.v;
      const st = { ...styleOf(r, c, cell), ...(cond.get(k) || {}) };
      const css = {};
      for (const key of ['bold', 'italic', 'underline', 'strike', 'wrap', 'fill', 'color', 'valign', 'size', 'border', 'indent', 'bar', 'barColor']) if (st[key] != null && st[key] !== false) css[key] = st[key];
      css.align = st.align || (v && typeof v === 'object' ? 'center' : typeof v === 'number' ? 'right' : typeof v === 'boolean' ? 'center' : undefined);
      if (v && typeof v === 'object' && v.error) css.color = '#C00000';
      if (typeof v === 'number' && v < 0 && /\[Red\]/i.test(cell.fmt?.code || '') && !css.color) css.color = '#C00000';
      if (!css.align) delete css.align;
      const t = [r, c, cellText(cell, v), sid(css)];
      if (cell.f) t.push(cell.f); else if (cell.t === 'd' || (typeof cell.v === 'number' && cell.fmt)) t.push(null, cell.t === 'd' ? display(cell.v, resolveFormat(cell.v % 1 ? 'yyyy-mm-dd hh:mm' : 'isodate')) : cell.v);
      if (cell.note) { while (t.length < 6) t.push(null); t.push(cell.note); }
      cells.push(t);
    }
    // Style ranges over empty cells (fills and borders on blank areas).
    const blanks = [];
    for (const x of s.styles || []) {
      const p = parseRange(x.range); if (!p || p.wholeCols || p.wholeRows || (p.r2 - p.r1 + 1) * (p.c2 - p.c1 + 1) > 4000) continue;
      for (let r = p.r1; r <= Math.min(p.r2, PREVIEW_ROWS); r++) for (let c = p.c1; c <= p.c2; c++) if (!ex.cells.has(r + ',' + c)) { const st = styleOf(r, c, null); const css = {}; for (const key of ['fill', 'border']) if (st[key]) css[key] = st[key]; if (Object.keys(css).length) blanks.push([r, c, '', sid(css)]); }
    }
    const w = columnWidths(s, ex);
    const merges = (s.merges || []).map((m) => parseRange(m)).filter(Boolean).map((p) => [p.r1, p.c1, p.r2, p.c2]);
    let maxC = ex.maxC; for (const b of blanks) if (b[1] > maxC) maxC = b[1];
    const chartList = s.charts || [];
    const places = placeCharts(chartList, ex);
    const charts = chartList.map((ch, i) => { const d = chartData(spec, s, ch, calc, T); return { type: d.type, title: d.title, categories: d.categories.slice(0, 400), series: d.series.map((x) => ({ name: x.name, color: x.color, values: x.values.slice(0, 400) })), legend: d.legend, xTitle: d.xTitle, yTitle: d.yTitle, colors: d.pieColors, width: d.width, height: d.height, at: places[i] }; });
    const f = s.freeze ? parseCell(s.freeze) : null;
    return {
      name: s.name, tabColor: s.tabColor, hidden: !!s.hidden, gridlines: s.gridlines !== false,
      maxR: Math.max(maxR, ...blanks.map((b) => b[0]), 1), maxC: Math.max(maxC, 1), clipped: ex.maxR > maxR ? ex.maxR : undefined,
      widths: Array.from({ length: Math.max(maxC, 1) }, (_x, i) => w[i + 1] || 9), heights: s.heights || undefined,
      freeze: f ? { row: f.row - 1, col: f.col - 1 } : null, merges, styles, cells: cells.concat(blanks), charts,
      table: L.hasTable ? { headerRow: L.headerRow, first: L.first, last: L.last, col0: L.col0, cols: L.cols, totalRow: L.totalRow } : null,
      data: s.data ? { rows: s.data.rows, shown: s.data.sample?.length || 0 } : undefined,
      editable: !s.data && !s.protect,
    };
  });
  return { type: 'grid', title: spec.title, font: T.font, sheets, warnings: calc.warnings.slice(0, 5) };
}

// ---------- what the model sees ----------
const short = (v, n = 60) => { const s = String(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const rawText = (v) => { const r = v && typeof v === 'object' ? v.v : v; return r == null ? '' : typeof r === 'string' ? (r.startsWith('=') ? r : JSON.stringify(short(r))) : String(r); };

export async function describe(spec, ctx = {}) {
  const calc = calcOf(spec);
  const out = [`Workbook title: ${spec.title}${spec.currency ? ` · currency ${spec.currency}` : ''}${spec.theme ? ` · theme ${JSON.stringify(spec.theme)}` : ''}`];
  if (spec.names?.length) out.push('Names: ' + spec.names.map((n) => `${n.name} = ${n.ref}`).join('; '));
  const budget = Math.max(2500, Math.floor(36000 / spec.sheets.length));
  for (const [si, s] of spec.sheets.entries()) {
    const sh = calc.sheets[si]; const L = layout(s);
    const lines = [];
    const shown = (k) => { const cell = sh.ex.cells.get(k); if (!cell) return ''; const v = cell.f ? sh.values.get(k) : cell.v; return cell.f ? `${cell.f} → ${cellText(cell, v)}` : cell.t === 'd' ? cellText(cell, v) : typeof cell.v === 'string' ? short(cell.v, 50) : String(cell.v ?? ''); };
    if (s.data) {
      lines.push(`SHEET "${s.name}": LARGE DATA SHEET with ${s.data.rows.toLocaleString('en-US')} rows, stored as a database table. You only see its columns and a few sample rows; use <query> to read it and <edit op="query_sheet"> to build sheets from it.`);
      let prof = null;
      try { if (ctx.dir) prof = await duck.profile(ctx.dir, s.data.table); } catch { /* described without a profile */ }
      lines.push('Columns (SQL name, type, facts):');
      s.columns.forEach((c, i) => { const p = prof?.find((x) => x.name === (c.field || c.header)); lines.push(`  ${colName(i + 1)} "${c.field || c.header}" ${p?.type || s.data.types?.[i] || ''}${p ? ` · ${p.distinct.toLocaleString('en-US')} distinct${p.blanks ? ` · ${p.blanks}% blank` : ''}${p.min != null ? ` · ${short(p.min, 24)} to ${short(p.max, 24)}` : ''}${p.values ? ` · values: ${p.values.map((v) => short(v, 24)).join(', ')}` : ''}` : ''}`); });
      lines.push('Sample rows:'); for (const r of (s.data.sample || []).slice(0, 5)) lines.push('  ' + r.map((v) => (v == null ? '' : short(v, 24))).join(' | '));
    } else if (s.columns?.length) {
      lines.push(`SHEET "${s.name}": table. Header in row ${L.headerRow}, data rows ${L.first}-${L.last} (${L.n} rows)${L.totalRow ? `, total row ${L.totalRow}` : ''}.`);
      lines.push('Columns: ' + s.columns.map((c, i) => `${colName(L.col0 + i)} "${c.header}"${c.format ? ` [${c.format}]` : ''}${c.formula ? ` formula ${c.formula}` : ''}`).join(' | '));
      const rowLine = (ri) => `  ${L.first + ri}: ` + s.columns.map((_c, i) => shown(L.first + ri + ',' + (L.col0 + i))).join(' | ');
      const n = s.rows.length; const head = n <= 45 ? n : 30;
      for (let ri = 0; ri < head; ri++) lines.push(rowLine(ri));
      if (n > head) { lines.push(`  … rows ${L.first + head}-${L.last - 3} not shown (use <query> to read them) …`); for (let ri = n - 3; ri < n; ri++) lines.push(rowLine(ri)); }
      if (L.totalRow) lines.push(`  ${L.totalRow} (totals): ` + s.columns.map((_c, i) => shown(L.totalRow + ',' + (L.col0 + i))).join(' | '));
    } else lines.push(`SHEET "${s.name}": free-form sheet.`);
    if (!s.data) {
      // Free cells are listed row by row: "5: A=Revenue | B==SUM(B2:B4) → 1,200".
      const byRow = new Map();
      const add = (r, c) => { const t = shown(r + ',' + c); if (t !== '') (byRow.get(r) || byRow.set(r, []).get(r)).push([c, `${colName(c)}=${t}`]); };
      if (s.grid) s.grid.forEach((row, ri) => row.forEach((v, ci) => { if (v != null && v !== '') add(ri + 1, ci + 1); }));
      for (const k of Object.keys(s.cells || {})) { const p = parseCell(k); add(p.row, p.col); }
      const free = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([r, list]) => `${r}: ${list.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(' | ')}`);
      if (free.length) { lines.push(s.columns?.length ? 'Other cells:' : 'Cells:'); let used = 0; for (const f of free) { if (used > budget * 0.7) { lines.push(`  … ${free.length} rows of cells in total, the rest not shown …`); break; } lines.push('  ' + f); used += f.length + 3; } }
    }
    const extra = [];
    if (s.freeze) extra.push(`freeze ${s.freeze}`); if (s.filter) extra.push('filter'); if (s.banded) extra.push('banded rows'); if (s.protect) extra.push('protected'); if (s.hidden) extra.push('hidden');
    if (s.totals) extra.push('totals ' + JSON.stringify(s.totals));
    for (const k of ['styles', 'conditional', 'validation', 'merges', 'charts', 'widths']) if (s[k] && (Array.isArray(s[k]) ? s[k].length : Object.keys(s[k]).length)) extra.push(`${k} ${short(JSON.stringify(s[k]), 900)}`);
    if (extra.length) lines.push('Settings: ' + extra.join('; '));
    let text = lines.join('\n'); if (text.length > budget) text = text.slice(0, budget) + '\n  … (sheet shortened)';
    out.push(text);
  }
  if (calc.warnings.length) out.push('Notes from the formula check: ' + calc.warnings.slice(0, 4).join(' '));
  void rawText;
  return out.join('\n\n');
}

export function summary(spec) {
  let rows = 0, formulas = 0, charts = 0;
  const calc = calcOf(spec);
  spec.sheets.forEach((s, si) => { rows += s.data ? s.data.rows : s.rows?.length || s.grid?.length || 0; charts += s.charts?.length || 0; for (const c of calc.sheets[si].ex.cells.values()) if (c.f) formulas++; });
  const n = spec.sheets.length;
  return [`${n} sheet${n > 1 ? 's' : ''}`, rows ? `${rows.toLocaleString('en-US')} rows` : '', formulas ? `${formulas.toLocaleString('en-US')} formulas` : '', charts ? `${charts} chart${charts > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
}
