// Builds the real .xlsx with ExcelJS: values, live formulas with their calculated results, number
// formats, styles, conditional formatting, dropdowns, frozen panes, filters, protection and names.
import ExcelJS from 'exceljs';
import { calculate } from './calc.js';
import { columnWidths } from './model.js';
import { styler, sheetTheme } from './style.js';
import { parseRange, parseCell, cellName, colName, quoteSheet } from './a1.js';
import { serialToDate, resolveFormat } from './format.js';
import { addCharts } from './charts.js';

const argb = (hex) => 'FF' + String(hex).replace('#', '').toUpperCase();
const side = (style, color = 'FFD0D4DB') => ({ style, color: { argb: color } });

function applyStyle(cell, st, T) {
  const font = { name: T.font, size: st.size || T.fontSize };
  if (st.bold) font.bold = true; if (st.italic) font.italic = true; if (st.underline) font.underline = true; if (st.strike) font.strike = true;
  if (st.color) font.color = { argb: argb(st.color) };
  cell.font = font;
  if (st.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.fill) } };
  if (st.align || st.valign || st.wrap || st.indent) cell.alignment = { horizontal: st.align, vertical: st.valign || (st.wrap ? 'top' : undefined), wrapText: !!st.wrap || undefined, indent: st.indent || undefined };
  if (st.border && st.border !== 'none') {
    const b = st.border;
    cell.border = b === 'bottom' ? { bottom: side('thin', 'FF8A8F98') } : b === 'top' ? { top: side('thin', 'FF8A8F98') } : b === 'outline' ? { top: side('thin'), left: side('thin'), bottom: side('thin'), right: side('thin') }
      : { top: side(b), left: side(b), bottom: side(b), right: side(b) };
  }
  if (st.fmt && st.fmt.code !== 'General') cell.numFmt = st.fmt.code;
}

function conditional(ws, rule, T) {
  const style = {};
  if (rule.fill) style.fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: argb(rule.fill) } };
  if (rule.color || rule.bold || rule.italic) style.font = { ...(rule.color ? { color: { argb: argb(rule.color) } } : {}), ...(rule.bold ? { bold: true } : {}), ...(rule.italic ? { italic: true } : {}) };
  if (!style.fill && !style.font) style.fill = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFE699' } };
  const val = (v) => (typeof v === 'number' ? String(v) : /^=/.test(String(v)) ? String(v).slice(1) : /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : `"${String(v).replace(/"/g, '""')}"`);
  const first = (() => { const p = parseRange(rule.range); return cellName(p.c1, p.r1); })();
  const ops = { greaterThan: 'greaterThan', lessThan: 'lessThan', between: 'between', equal: 'equal', notEqual: 'notEqual', greaterOrEqual: 'greaterThanOrEqual', lessOrEqual: 'lessThanOrEqual' };
  let r;
  if (ops[rule.rule]) r = { type: 'cellIs', operator: ops[rule.rule], formulae: rule.rule === 'between' ? [val(rule.value ?? 0), val(rule.value2 ?? 0)] : [val(rule.value ?? 0)], style };
  else if (rule.rule === 'contains') r = { type: 'containsText', operator: 'containsText', text: String(rule.value ?? ''), style };
  else if (rule.rule === 'colorScale') { const cs = rule.colors?.length >= 2 ? rule.colors : ['#F8696B', '#FFEB84', '#63BE7B']; r = { type: 'colorScale', cfvo: cs.length === 3 ? [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }] : [{ type: 'min' }, { type: 'max' }], color: cs.map((c) => ({ argb: argb(c) })) }; }
  else if (rule.rule === 'dataBar') r = { type: 'dataBar', minLength: 0, maxLength: 100, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: argb(rule.fill || T.accent) }, gradient: false };
  else if (rule.rule === 'top' || rule.rule === 'bottom') r = { type: 'top10', rank: rule.count || 10, bottom: rule.rule === 'bottom', style };
  else if (rule.rule === 'aboveAverage' || rule.rule === 'belowAverage') r = { type: 'aboveAverage', aboveAverage: rule.rule === 'aboveAverage', style };
  else if (rule.rule === 'duplicate') r = { type: 'expression', formulae: [`COUNTIF(${rule.range.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')},${first})>1`], style };
  else if (rule.rule === 'blank') r = { type: 'expression', formulae: [`LEN(TRIM(${first}))=0`], style };
  else if (rule.rule === 'notBlank') r = { type: 'expression', formulae: [`LEN(TRIM(${first}))>0`], style };
  else if (rule.rule === 'formula') r = { type: 'expression', formulae: [rule.formula], style };
  if (r) ws.addConditionalFormatting({ ref: rule.range, rules: [{ priority: 1, ...r }] });
}

// rowsFor(sheet) returns an async iterator of row arrays for data-backed sheets.
export async function buildXlsx(spec, theme, { rowsFor, calc } = {}) {
  calc ||= calculate(spec);
  const T = sheetTheme(spec, theme);
  const wb = new ExcelJS.Workbook();
  wb.creator = theme?.company || 'Scenly'; wb.created = new Date(); wb.title = spec.title;
  wb.calcProperties.fullCalcOnLoad = true; // Excel recalculates on open, so every formula is live and current
  const chartJobs = [];
  for (const [si, s] of spec.sheets.entries()) {
    const { ex, values } = calc.sheets[si];
    const L = ex.layout;
    const ws = wb.addWorksheet(s.name, { properties: s.tabColor ? { tabColor: { argb: argb(s.tabColor) } } : {}, views: [{ showGridLines: s.gridlines !== false, ...(s.freeze ? (() => { const f = parseCell(s.freeze); return { state: 'frozen', xSplit: f.col - 1, ySplit: f.row - 1 }; })() : {}) }], state: s.hidden ? 'hidden' : 'visible' });
    const styleOf = styler(spec, s, ex, theme);
    const widths = columnWidths(s, ex);
    for (const [c, w] of Object.entries(widths)) ws.getColumn(Number(c)).width = w;
    const write = (r, c, cell, k) => {
      const xc = ws.getCell(r, c);
      if (cell.f) {
        const res = values.get(k);
        const result = res && typeof res === 'object' ? (res.error ? { error: res.error } : undefined) : res ?? undefined;
        xc.value = { formula: cell.f.slice(1), result };
      } else if (cell.t === 'd' && typeof cell.v === 'number') xc.value = serialToDate(cell.v);
      else if (cell.v != null) xc.value = cell.v;
      applyStyle(xc, styleOf(r, c, cell), T);
      if (cell.note) xc.note = cell.note;
    };
    for (const [k, cell] of ex.cells) { const [r, c] = k.split(',').map(Number); if (s.data && r > L.headerRow && r <= L.headerRow + (s.data.sample?.length || 0) && r < L.first + s.data.rows) continue; write(r, c, cell, k); }
    // Style ranges that cover empty cells still apply (fills, borders on blank areas).
    for (const x of s.styles || []) {
      const p = parseRange(x.range); if (!p || p.wholeCols || p.wholeRows || (p.r2 - p.r1 + 1) * (p.c2 - p.c1 + 1) > 20000) continue;
      for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) if (!ex.cells.has(r + ',' + c)) applyStyle(ws.getCell(r, c), styleOf(r, c, null), T);
    }
    if (s.data && rowsFor) {
      // Large data: rows come straight from the database, with the column formulas filled in per row.
      const fmts = s.columns.map((c) => resolveFormat(c.format, spec.currency));
      const isDate = s.columns.map((_c, i) => /^(DATE|TIMESTAMP)/i.test(s.data.types?.[i] || ''));
      let r = L.first;
      for await (const row of rowsFor(s)) {
        const xr = ws.getRow(r);
        s.columns.forEach((col, i) => {
          const v = row[i];
          const xc = xr.getCell(L.col0 + i);
          if ((v == null || v === '') && col.formula) xc.value = { formula: col.formula.slice(1).replace(/\{r\}|\{row\}/gi, r).replace(/\{first\}/gi, L.first).replace(/\{last\}/gi, L.last).replace(/\{prev\}/gi, r - 1) };
          else if (v != null) xc.value = isDate[i] && typeof v === 'string' ? new Date(v.length <= 10 ? v + 'T00:00:00Z' : v.replace(' ', 'T') + 'Z') : v;
          if (fmts[i].code !== 'General') xc.numFmt = fmts[i].code;
        });
        xr.commit?.();
        r++;
      }
    }
    for (const m of s.merges || []) { try { ws.mergeCells(m); } catch { /* overlapping merges are skipped */ } }
    for (const [row, hgt] of Object.entries(s.heights || {})) ws.getRow(Number(row)).height = hgt;
    if (L.hasTable && s.headerStyle !== false) ws.getRow(L.headerRow).height = Math.max(ws.getRow(L.headerRow).height || 0, 22);
    if (s.filter && (L.hasTable || typeof s.filter === 'string')) ws.autoFilter = typeof s.filter === 'string' ? s.filter : { from: { row: L.headerRow, column: L.col0 }, to: { row: Math.max(L.last, L.headerRow), column: L.col0 + L.cols - 1 } };
    for (const rule of s.conditional || []) { try { conditional(ws, rule, T); } catch { /* a rule Excel would reject is left out */ } }
    for (const v of s.validation || []) {
      const p = parseRange(v.range); if (!p) continue;
      const dv = v.list ? { type: 'list', allowBlank: true, formulae: [`"${v.list.join(',').replace(/"/g, '""').slice(0, 250)}"`] }
        : v.listRef ? { type: 'list', allowBlank: true, formulae: [v.listRef] }
        : { type: v.type, allowBlank: true, operator: v.min != null && v.max != null ? 'between' : v.min != null ? 'greaterThanOrEqual' : 'lessThanOrEqual', formulae: [v.min, v.max].filter((x) => x != null) };
      if (v.message) Object.assign(dv, { showErrorMessage: true, errorTitle: 'Check this value', error: v.message });
      const last = Math.min(p.r2, p.wholeCols ? Math.max(L.last, 1000) : p.r2);
      if ((last - p.r1 + 1) * (p.c2 - p.c1 + 1) <= 60000) for (let r = p.r1; r <= last; r++) for (let c = p.c1; c <= p.c2; c++) ws.getCell(r, c).dataValidation = dv;
    }
    if (s.protect) await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true, sort: true, autoFilter: true });
    for (const ch of s.charts || []) chartJobs.push({ sheetIndex: si, sheet: s, chart: ch, ex });
  }
  for (const n of spec.names || []) { try { wb.definedNames.add(n.ref.includes('!') ? n.ref : `${quoteSheet(spec.sheets[0].name)}!${n.ref}`, n.name); } catch { /* skip names ExcelJS rejects */ } }
  let buf = Buffer.from(await wb.xlsx.writeBuffer());
  if (chartJobs.length) buf = await addCharts(buf, spec, chartJobs, T, calc);
  return buf;
}

// One sheet as CSV (calculated values, not formulas).
export function buildCsv(spec, sheetIndex = 0, calc) {
  calc ||= calculate(spec);
  const { ex, values } = calc.sheets[sheetIndex] || calc.sheets[0];
  const lines = [];
  for (let r = 1; r <= ex.maxR; r++) {
    const row = [];
    for (let c = 1; c <= ex.maxC; c++) {
      const k = r + ',' + c; const cell = ex.cells.get(k);
      let v = cell ? (cell.f ? values.get(k) : cell.v) : '';
      if (v && typeof v === 'object') v = v.error || '';
      if (cell?.t === 'd' && typeof v === 'number') v = serialToDate(v).toISOString().slice(0, v % 1 ? 16 : 10).replace('T', ' ');
      v = v == null ? '' : String(v);
      row.push(/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    }
    lines.push(row.join(','));
  }
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}
export { colName };
