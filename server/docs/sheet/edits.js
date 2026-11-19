// Changes to a workbook: the model's <edit> blocks and the edits made by hand in the grid.
// Rows and columns that move take every formula, chart, rule and name that points at them along.
import { looseJson } from '../envelope.js';
import { clone } from '../util.js';
import { parseCell, parseRange, cellName, colName, colNum, shiftRefs, renameSheetRefs, quoteSheet } from './a1.js';
import { eachFormula, layout, cleanSheetName } from './model.js';
import { calculate } from './calc.js';
import * as duck from './duck.js';
import { fromTable, SMALL_ROWS } from './import.js';

const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const key = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
export const findSheet = (spec, name) => (name ? spec.sheets.find((s) => same(s.name, name)) : spec.sheets.length === 1 ? spec.sheets[0] : null);
const sheetList = (spec) => spec.sheets.map((s) => `"${s.name}"`).join(', ');
// A column given as a letter or a header name → index into s.columns (or -1).
function columnIndex(s, ref) {
  if (ref == null || !s.columns) return -1;
  const L = layout(s);
  const byHeader = s.columns.findIndex((c) => key(c.header) === key(ref));
  if (byHeader >= 0) return byHeader;
  if (/^[A-Za-z]{1,3}$/.test(String(ref).trim())) { const i = colNum(String(ref).trim()) - L.col0; if (i >= 0 && i < s.columns.length) return i; }
  return -1;
}
const SENT = { '{r}': 1048000, '{row}': 1048000, '{prev}': 1047999, '{next}': 1048001, '{first}': 1048100, '{last}': 1048200, '{total}': 1048300, '{header}': 1048400 };
const toSentinel = (f) => f.replace(/\{(r|row|prev|next|first|last|total|header)\}/gi, (m) => SENT[m.toLowerCase()]);
const fromSentinel = (f) => f.replace(/1048000|1047999|1048001|1048100|1048200|1048300|1048400/g, (m) => ({ 1048000: '{r}', 1047999: '{prev}', 1048001: '{next}', 1048100: '{first}', 1048200: '{last}', 1048300: '{total}', 1048400: '{header}' })[m] || m);

// Moves everything that refers to rows/columns of `target` after an insert (delta > 0) or delete (delta < 0).
export function shiftAll(spec, target, axis, at, delta, { grow = false } = {}) {
  const opt = (home) => ({ home, target: target.name, axis, at, delta, grow });
  eachFormula(spec, (f, set, home) => {
    // Column templates such as =B{r}*C{r} follow their own row; only their column letters can move.
    const templ = axis === 'col' && /\{(r|row|prev|next|first|last|total|header)\}/i.test(f);
    const nv = templ ? fromSentinel(shiftRefs(toSentinel(f), opt(home))) : shiftRefs(f, opt(home));
    if (nv !== f) set(nv);
  });
  const mv = (ref, home) => { const out = shiftRefs('=' + ref, opt(home)).slice(1); return out.includes('#REF!') ? null : out; };
  for (const s of spec.sheets) {
    for (const ch of s.charts || []) {
      const home = ch.sheet || s.name;
      if (ch.categories) ch.categories = mv(ch.categories, home) || ch.categories;
      ch.series = ch.series.map((x) => ({ ...x, values: mv(x.values, home) })).filter((x) => x.values);
    }
    if (s.charts) { s.charts = s.charts.filter((c) => c.series.length); if (!s.charts.length) delete s.charts; }
    for (const v of s.validation || []) if (v.listRef) v.listRef = mv(v.listRef, s.name) || v.listRef;
    if (s !== target) continue;
    for (const k of ['styles', 'conditional', 'validation']) if (s[k]) { s[k] = s[k].map((x) => ({ ...x, range: mv(x.range, s.name) })).filter((x) => x.range); if (!s[k].length) delete s[k]; }
    if (s.merges) { s.merges = s.merges.map((m) => mv(m, s.name)).filter(Boolean); if (!s.merges.length) delete s.merges; }
    if (typeof s.filter === 'string') s.filter = mv(s.filter, s.name) || true;
    if (s.cells) {
      const next = {};
      for (const [k, v] of Object.entries(s.cells)) { const n = mv(k, s.name); if (n) next[n] = v; }
      s.cells = next;
    }
    for (const ch of s.charts || []) if (ch.anchor) ch.anchor = mv(ch.anchor, s.name) || ch.anchor;
    const rekey = (obj, isCol) => { const out = {}; for (const [k, v] of Object.entries(obj)) { const n = isCol ? colNum(k) : Number(k); let m = n; if (delta > 0) { if (n >= at) m = n + delta; } else if (n >= at && n <= at - delta - 1) continue; else if (n > at - delta - 1) m = n + delta; out[isCol ? colName(m) : String(m)] = v; } return out; };
    if (axis === 'col' && s.widths) s.widths = rekey(s.widths, true);
    if (axis === 'row' && s.heights) s.heights = rekey(s.heights, false);
    if (axis === 'col' && s.totals) s.totals = rekey(s.totals, true);
  }
}

// Sets one cell wherever it lives: a header, a table row, the total row or a free cell.
function setCell(s, addr, value, errors) {
  const p = parseCell(addr);
  if (!p) { errors.push(`"${addr}" is not a cell address.`); return false; }
  const a = cellName(p.col, p.row);
  if (s.data) { errors.push(`"${s.name}" is a large data sheet, so single cells cannot be changed. Use <edit op="query_sheet"> to make a changed copy.`); return false; }
  const clear = value == null || value === '';
  if (s.grid) {
    if (clear && p.row > s.grid.length) return true;
    while (s.grid.length < p.row) s.grid.push([]);
    const row = s.grid[p.row - 1]; while (row.length < p.col) row.push(null);
    row[p.col - 1] = clear ? null : value;
    if (s.cells?.[a] !== undefined) delete s.cells[a];
    return true;
  }
  const L = layout(s);
  const ci = p.col - L.col0;
  if (L.hasTable && ci >= 0 && ci < L.cols) {
    if (p.row === L.headerRow) { if (!clear) s.columns[ci].header = String(typeof value === 'object' ? value.v ?? value.value ?? '' : value); return true; }
    if (p.row >= L.first && p.row <= L.last) { s.rows[p.row - L.first][ci] = clear ? null : value; return true; }
    if (L.totalRow && p.row === L.totalRow) { const letter = colName(p.col); if (clear) delete s.totals[letter]; else if (typeof value === 'string' && value.startsWith('=')) s.totals[letter] = value; else { s.totalLabel = String(value?.v ?? value); delete s.totals[letter]; } return true; }
    if (!L.totalRow && p.row === L.last + 1 && !clear && !s.cells?.[a]) { const row = new Array(L.cols).fill(null); row[ci] = value; s.rows.push(row); return true; }
  }
  s.cells ||= {};
  if (clear) delete s.cells[a]; else s.cells[a] = value;
  if (!Object.keys(s.cells).length) delete s.cells;
  return true;
}
const asRow = (s, r) => {
  if (Array.isArray(r)) return r.slice(0, s.columns.length).concat(new Array(Math.max(0, s.columns.length - r.length)).fill(null));
  if (r && typeof r === 'object') { const m = new Map(Object.entries(r).map(([k, v]) => [key(k), v])); return s.columns.map((c, i) => m.get(key(c.header)) ?? m.get(colName(layout(s).col0 + i).toLowerCase()) ?? null); }
  return [r].concat(new Array(s.columns.length - 1).fill(null));
};
// "5-7, 12" → [[5,7],[12,12]] sorted from the bottom up.
const spans = (text) => String(text || '').split(/[,;\s]+/).map((t) => { const m = t.match(/^(\d+)(?:\s*[-:–]\s*(\d+))?$/); return m ? [Math.min(+m[1], +(m[2] || m[1])), Math.max(+m[1], +(m[2] || m[1]))] : null; }).filter(Boolean).sort((a, b) => b[0] - a[0]);

// Tables the model can query: stored data sheets as they are, small table sheets with their calculated values.
export function sources(spec, calc) {
  calc ||= calculate(spec);
  const out = [];
  spec.sheets.forEach((s, si) => {
    if (s.data) { out.push({ name: s.name, table: s.data.table }); return; }
    if (!s.columns?.length || !s.rows?.length) return;
    const L = layout(s); const { ex, values } = calc.sheets[si];
    const seen = new Set();
    const names = s.columns.map((c, i) => { let n = String(c.header).trim() || colName(L.col0 + i); while (seen.has(n.toLowerCase())) n += '_2'; seen.add(n.toLowerCase()); return n; });
    const rows = s.rows.map((_r, ri) => s.columns.map((_c, i) => { const k = L.first + ri + ',' + (L.col0 + i); const cell = ex.cells.get(k); if (!cell) return null; let v = cell.f ? values.get(k) : cell.v; if (v && typeof v === 'object') v = null; if (cell.t === 'd' && typeof v === 'number') v = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 864e5)).toISOString().slice(0, v % 1 ? 19 : 10).replace('T', ' '); return v; }));
    const columns = names.map((name, i) => { const vals = rows.map((r) => r[i]).filter((v) => v != null && v !== ''); const isDate = vals.length && s.rows.every((_r, ri) => { const c = ex.cells.get(L.first + ri + ',' + (L.col0 + i)); return !c || c.v == null || c.t === 'd'; }); return { name, type: isDate ? 'TIMESTAMP' : vals.length && vals.every((v) => typeof v === 'number') ? 'DOUBLE' : vals.length && vals.every((v) => typeof v === 'boolean') ? 'BOOLEAN' : 'VARCHAR' }; });
    for (const r of rows) r.forEach((v, i) => { if (v != null && columns[i].type === 'VARCHAR' && typeof v !== 'string') r[i] = String(v); });
    out.push({ name: s.name, columns, rows });
  });
  return out;
}

export async function applySheetEdits(spec0, edits, ctx = {}) {
  const spec = clone(spec0); const notes = [], errors = [];
  const json = (e, what) => { try { return looseJson(e.body); } catch { errors.push(`${e.attrs.op}: the content must be ${what} in JSON.`); return undefined; } };
  for (const e of edits) {
    const op = String(e.attrs.op || '').toLowerCase().replace(/-/g, '_');
    const sheetName = e.attrs.sheet ?? e.attrs.name;
    const need = () => { const s = findSheet(spec, e.attrs.sheet); if (!s) errors.push(`${op}: ${e.attrs.sheet ? `there is no sheet "${e.attrs.sheet}"` : 'say which sheet with sheet="…"'}. Sheets are: ${sheetList(spec)}.`); return s; };
    if (op === 'set_cells' || op === 'set_cell' || op === 'cells') {
      const s = need(); if (!s) continue;
      let obj = e.attrs.cell ? { [e.attrs.cell]: e.attrs.value ?? e.body } : json(e, 'an object such as {"B2": 10, "C2": "=B2*2"}'); if (!obj || typeof obj !== 'object') continue;
      let n = 0; for (const [a, v] of Object.entries(obj)) if (setCell(s, a, v, errors)) n++;
      if (n) notes.push(`Changed ${n} cell${n > 1 ? 's' : ''} on "${s.name}"`);
    } else if (op === 'add_rows' || op === 'add_row' || op === 'append_rows') {
      const s = need(); if (!s) continue;
      if (s.data) { errors.push(`add_rows: "${s.name}" is a large data sheet. Use query_sheet with UNION ALL to make a copy with extra rows.`); continue; }
      if (e.attrs.brief || e.attrs.count && !e.body.trim()) {
        if (!s.columns?.length) { errors.push('add_rows with a brief needs a sheet with columns.'); continue; }
        s.generate = { count: Number(e.attrs.count) || 20, brief: String(e.attrs.brief || 'More rows like the existing ones') };
        notes.push(`Added ${s.generate.count} rows to "${s.name}"`); continue;
      }
      let rows = json(e, 'an array of rows'); if (rows === undefined) continue;
      if (!Array.isArray(rows)) rows = [rows]; else if (rows.length && !rows.some((r) => r && typeof r === 'object')) rows = [rows];
      if (!rows.length) { errors.push('add_rows: no rows given.'); continue; }
      const L = layout(s);
      if (s.grid) {
        const at = Math.min(Math.max(1, e.attrs.after != null ? Number(e.attrs.after) + 1 : s.grid.length + 1), s.grid.length + 1);
        shiftAll(spec, s, 'row', at, rows.length, { grow: at === s.grid.length + 1 });
        s.grid.splice(at - 1, 0, ...rows.map((r) => (Array.isArray(r) ? r : Object.values(r))));
      } else if (s.columns?.length) {
        let at = e.attrs.after != null ? Number(e.attrs.after) + 1 : e.attrs.before != null ? Number(e.attrs.before) : L.last + 1;
        at = Math.min(Math.max(L.first, at || L.last + 1), L.last + 1);
        shiftAll(spec, s, 'row', at, rows.length, { grow: at === L.last + 1 });
        s.rows.splice(at - L.first, 0, ...rows.map((r) => asRow(s, r)));
      } else { errors.push(`add_rows: "${s.name}" has no table. Use set_cells.`); continue; }
      notes.push(`Added ${rows.length} row${rows.length > 1 ? 's' : ''} to "${s.name}"`);
    } else if (op === 'delete_rows' || op === 'delete_row') {
      const s = need(); if (!s) continue;
      if (s.data) { errors.push(`delete_rows: "${s.name}" is a large data sheet. Use query_sheet with a WHERE clause to make a filtered copy.`); continue; }
      const list = spans(e.attrs.rows ?? e.attrs.row ?? e.body);
      if (!list.length) { errors.push('delete_rows needs rows="5-7" (sheet row numbers).'); continue; }
      let n = 0;
      for (const [a, b] of list) {
        const L = layout(s);
        if (s.grid) { const from = Math.max(1, a), to = Math.min(b, s.grid.length); if (to < from) continue; s.grid.splice(from - 1, to - from + 1); shiftAll(spec, s, 'row', from, -(to - from + 1)); n += to - from + 1; }
        else { const from = Math.max(L.first, a), to = Math.min(b, L.last); if (to < from) { errors.push(`delete_rows: rows ${a}-${b} are not data rows of "${s.name}" (data rows are ${L.first}-${L.last}).`); continue; } s.rows.splice(from - L.first, to - from + 1); shiftAll(spec, s, 'row', from, -(to - from + 1)); n += to - from + 1; }
      }
      if (n) notes.push(`Removed ${n} row${n > 1 ? 's' : ''} from "${s.name}"`);
    } else if (op === 'add_column') {
      const s = need(); if (!s) continue;
      if (!s.columns?.length || s.data) { errors.push(`add_column: "${s.name}" ${s.data ? 'is a large data sheet; use query_sheet to make a copy with the new column' : 'has no table; use set_cells'}.`); continue; }
      const def = json(e, 'an object such as {"header": "Margin", "format": "percent", "formula": "=D{r}/C{r}"}'); if (!def || typeof def !== 'object') continue;
      const L = layout(s);
      const ref = e.attrs.after ?? e.attrs.before;
      let i = ref != null ? columnIndex(s, ref) : -1;
      if (ref != null && i < 0) { errors.push(`add_column: there is no column "${ref}" on "${s.name}". Columns: ${s.columns.map((c) => `"${c.header}"`).join(', ')}.`); continue; }
      i = ref == null ? s.columns.length : e.attrs.after != null ? i + 1 : i;
      shiftAll(spec, s, 'col', L.col0 + i, 1);
      const { values, total, ...col } = def;
      s.columns.splice(i, 0, col);
      s.rows.forEach((r, ri) => r.splice(i, 0, Array.isArray(values) ? values[ri] ?? null : null));
      if (total) { s.totals ||= {}; s.totals[colName(L.col0 + i)] = String(total); }
      notes.push(`Added the column "${col.header || 'Column'}" to "${s.name}"`);
    } else if (op === 'delete_column') {
      const s = need(); if (!s) continue;
      const i = columnIndex(s, e.attrs.column ?? e.attrs.header ?? e.body.trim());
      if (i < 0 || s.data) { errors.push(`delete_column: ${s.data ? `"${s.name}" is a large data sheet; use query_sheet` : `there is no column "${e.attrs.column ?? e.body.trim()}" on "${s.name}". Columns: ${(s.columns || []).map((c) => `"${c.header}"`).join(', ')}`}.`); continue; }
      if (s.columns.length === 1) { errors.push('delete_column: a table needs at least one column.'); continue; }
      const L = layout(s); const gone = s.columns[i].header;
      s.columns.splice(i, 1); s.rows.forEach((r) => r.splice(i, 1));
      shiftAll(spec, s, 'col', L.col0 + i, -1);
      notes.push(`Removed the column "${gone}" from "${s.name}"`);
    } else if (op === 'set_column' || op === 'column') {
      const s = need(); if (!s) continue;
      const i = columnIndex(s, e.attrs.column ?? e.attrs.header);
      if (i < 0) { errors.push(`set_column: there is no column "${e.attrs.column ?? e.attrs.header}" on "${s.name}". Columns: ${(s.columns || []).map((c) => `"${c.header}"`).join(', ')}.`); continue; }
      const def = json(e, 'an object such as {"format": "currency", "width": 14}'); if (!def || typeof def !== 'object') continue;
      const { values, total, ...rest } = def; const col = s.columns[i];
      for (const [k, v] of Object.entries(rest)) { if (v == null || v === '') delete col[k]; else col[k] = v; }
      if (!s.data) {
        if (Array.isArray(values)) s.rows.forEach((r, ri) => { r[i] = values[ri] ?? null; });
        else if (rest.formula) s.rows.forEach((r) => { r[i] = null; });
        if (total !== undefined) { const letter = colName(layout(s).col0 + i); s.totals ||= {}; if (total) s.totals[letter] = String(total); else delete s.totals[letter]; if (!Object.keys(s.totals).length) delete s.totals; }
      }
      notes.push(`Updated the column "${col.header}" on "${s.name}"`);
    } else if (op === 'sort') {
      const s = need(); if (!s) continue;
      const i = columnIndex(s, e.attrs.by ?? e.attrs.column);
      if (i < 0 || s.data || !s.rows) { errors.push(`sort: ${s.data ? `"${s.name}" is a large data sheet; use query_sheet with ORDER BY` : `there is no column "${e.attrs.by}" on "${s.name}"`}.`); continue; }
      const calc = calculate(spec); const si = spec.sheets.indexOf(s); const L = layout(s);
      const val = (ri) => { const k = L.first + ri + ',' + (L.col0 + i); const c = calc.sheets[si].ex.cells.get(k); const v = c?.f ? calc.sheets[si].values.get(k) : c?.v; return v && typeof v === 'object' ? null : v ?? null; };
      const desc = /^desc/i.test(e.attrs.order || '');
      const order = s.rows.map((_r, ri) => ri).sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return a - b; if (x == null) return 1; if (y == null) return -1; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }); return (desc ? -c : c) || a - b; });
      s.rows = order.map((ri) => s.rows[ri]);
      notes.push(`Sorted "${s.name}" by ${s.columns[i].header}${desc ? ', largest first' : ''}`);
    } else if (op === 'add_sheet') {
      const def = json(e, 'one sheet object'); if (!def || typeof def !== 'object') continue;
      if (e.attrs.name && !def.name) def.name = e.attrs.name;
      if (def.name && spec.sheets.some((s) => same(s.name, def.name))) { errors.push(`add_sheet: there is already a sheet "${def.name}". Use replace_sheet to rebuild it, or another name.`); continue; }
      const after = e.attrs.after ? spec.sheets.findIndex((s) => same(s.name, e.attrs.after)) : -1;
      const before = e.attrs.before ? spec.sheets.findIndex((s) => same(s.name, e.attrs.before)) : e.attrs.first != null ? 0 : -1;
      spec.sheets.splice(before >= 0 ? before : after >= 0 ? after + 1 : spec.sheets.length, 0, def);
      notes.push(`Added the sheet "${def.name || 'Sheet'}"`);
    } else if (op === 'replace_sheet') {
      const s = need(); if (!s) continue;
      const def = json(e, 'one sheet object'); if (!def || typeof def !== 'object') continue;
      def.name ||= s.name;
      const i = spec.sheets.indexOf(s);
      if (!same(def.name, s.name)) eachFormula(spec, (f, set) => { const nv = renameSheetRefs(f, s.name, def.name); if (nv !== f) set(nv); });
      spec.sheets[i] = def;
      notes.push(`Rebuilt the sheet "${def.name}"`);
    } else if (op === 'delete_sheet') {
      const s = need(); if (!s) continue;
      if (spec.sheets.length === 1) { errors.push('delete_sheet: a workbook needs at least one sheet.'); continue; }
      spec.sheets.splice(spec.sheets.indexOf(s), 1);
      notes.push(`Removed the sheet "${s.name}"`);
    } else if (op === 'rename_sheet') {
      const s = need(); if (!s) continue;
      const used = new Set(spec.sheets.filter((x) => x !== s).map((x) => x.name.toLowerCase()));
      const to = cleanSheetName(e.attrs.to ?? e.body.trim(), used);
      const from = s.name; if (from === to) continue;
      eachFormula(spec, (f, set) => { const nv = renameSheetRefs(f, from, to); if (nv !== f) set(nv); });
      for (const x of spec.sheets) for (const ch of x.charts || []) { if (ch.sheet && same(ch.sheet, from)) ch.sheet = to; const rn = (r) => renameSheetRefs('=' + r, from, to).slice(1); if (ch.categories) ch.categories = rn(ch.categories); ch.series.forEach((se) => { se.values = rn(se.values); }); }
      s.name = to; notes.push(`Renamed "${from}" to "${to}"`);
    } else if (op === 'format' || op === 'set_sheet' || op === 'sheet') {
      const s = need(); if (!s) continue;
      const def = json(e, 'an object such as {"styles": [{"range": "A1:D1", "bold": true}], "freeze": "A2"}'); if (!def || typeof def !== 'object') continue;
      const lists = ['styles', 'conditional', 'validation', 'merges', 'charts'];
      for (const k of [].concat(def.clear || [])) delete s[k];
      for (const k of lists) if (Array.isArray(def[k]) && def[k].length) s[k] = [...(s[k] || []), ...def[k]];
      for (const k of ['widths', 'heights', 'totals']) if (def[k] && typeof def[k] === 'object') s[k] = { ...(s[k] || {}), ...def[k] };
      for (const k of ['freeze', 'filter', 'banded', 'tabColor', 'protect', 'hidden', 'gridlines', 'totalLabel', 'headerStyle']) if (k in def) { if (def[k] == null || def[k] === false && k !== 'gridlines' && k !== 'headerStyle') delete s[k]; else s[k] = def[k]; }
      notes.push(`Changed the look of "${s.name}"`);
    } else if (op === 'workbook' || op === 'settings') {
      const def = json(e, 'an object such as {"title": "Budget 2027", "currency": "EUR"}'); if (!def || typeof def !== 'object') continue;
      if (def.title) spec.title = String(def.title);
      if (def.currency) spec.currency = String(def.currency);
      if (def.theme && typeof def.theme === 'object') spec.theme = { ...(spec.theme || {}), ...def.theme };
      if (Array.isArray(def.names)) { const m = new Map((spec.names || []).map((n) => [n.name.toLowerCase(), n])); for (const n of def.names) if (n?.name) { if (n.ref) m.set(String(n.name).toLowerCase(), n); else m.delete(String(n.name).toLowerCase()); } spec.names = [...m.values()]; }
      notes.push('Updated the workbook settings');
    } else if (op === 'title') {
      const t = (e.body || e.attrs.title || '').trim(); if (t) { spec.title = t; notes.push('Renamed the workbook'); }
    } else if (op === 'query_sheet' || op === 'sql') {
      const name = e.attrs.name ?? e.attrs.into ?? e.attrs.replace;
      if (!name) { errors.push('query_sheet needs name="New sheet name".'); continue; }
      if (!ctx.dir) { errors.push('query_sheet is not available here.'); continue; }
      const replacing = e.attrs.replace ? findSheet(spec, e.attrs.replace) : spec.sheets.find((s) => same(s.name, name));
      try {
        ctx.status?.('Working on the data…');
        // Small results are computed in memory unless a stored table is involved.
        const src = sources(spec);
        const info = await duck.materialize(ctx.dir, e.body, src);
        const used = new Set(spec.sheets.filter((x) => x !== replacing).map((x) => x.name.toLowerCase()));
        const sheet = await fromTable(ctx.dir, info, cleanSheetName(name, used));
        if (info.rows <= SMALL_ROWS) { sheet.banded = true; }
        if (e.attrs.charts) { try { sheet.charts = looseJson(e.attrs.charts); } catch { /* ignore */ } }
        if (replacing) { const i = spec.sheets.indexOf(replacing); if (!same(replacing.name, sheet.name)) eachFormula(spec, (f, set) => { const nv = renameSheetRefs(f, replacing.name, sheet.name); if (nv !== f) set(nv); }); for (const k of ['charts', 'conditional', 'tabColor']) if (replacing[k] && !sheet[k]) sheet[k] = replacing[k]; spec.sheets[i] = sheet; }
        else spec.sheets.push(sheet);
        notes.push(`${replacing ? 'Rebuilt' : 'Added'} "${sheet.name}" from the data (${info.rows.toLocaleString('en-US')} row${info.rows === 1 ? '' : 's'})`);
      } catch (err) { if (ctx.signal?.aborted) throw err; errors.push(`query_sheet "${name}": ${err.message}`); }
    } else errors.push(`Unknown edit op "${e.attrs.op}". Use set_cells, add_rows, delete_rows, add_column, delete_column, set_column, sort, add_sheet, replace_sheet, delete_sheet, rename_sheet, format, workbook or query_sheet.`);
    void sheetName;
  }
  return { spec, notes, errors };
}

// Edits made by hand in the grid.
export function applyManualSheet(spec0, change) {
  const spec = clone(spec0);
  if (change.resetTheme) delete spec.theme;
  if (typeof change.title === 'string' && change.title.trim()) spec.title = change.title.trim();
  if (change.cells && typeof change.cells === 'object') {
    const s = findSheet(spec, change.sheet) || spec.sheets[0];
    const errors = [];
    for (const [a, v] of Object.entries(change.cells).slice(0, 2000)) {
      let val = v;
      if (typeof v === 'string') { const t = v.trim(); val = t === '' ? null : t.startsWith('=') ? t : /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : /^(true|false)$/i.test(t) ? /^true$/i.test(t) : v; }
      setCell(s, a, val, errors);
    }
    if (errors.length) throw Object.assign(new Error(errors[0]), { user: true });
  }
  return spec;
}
export { quoteSheet, parseRange };
