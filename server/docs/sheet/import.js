// Opens an uploaded .xlsx, .csv or .tsv as workbook sheets. Small sheets are kept in the
// workbook itself (formulas, formats and widths included); large ones go into DuckDB.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import * as duck from './duck.js';
import { colName } from './a1.js';
import { cleanSheetName } from './model.js';

export const SMALL_ROWS = 2000;      // sheets up to this many rows stay fully editable cell by cell
const FULL_LOAD_BYTES = 12 * 1024 * 1024;
export const canImport = (name) => /\.(xlsx|xlsm|csv|tsv|tab)$/i.test(String(name || ''));

const iso = (d) => { const s = d.toISOString(); return s.endsWith('T00:00:00.000Z') ? s.slice(0, 10) : s.slice(0, 16).replace('T', ' '); };
const argbHex = (c) => (c?.argb && /^[0-9A-F]{8}$/i.test(c.argb) ? '#' + c.argb.slice(2).toUpperCase() : null);
// One ExcelJS cell → the value Scenly stores (formula text, number, text, true/false, ISO date).
function cellValue(cell) {
  let v = cell.value;
  if (v == null) return null;
  if (cell.formula) return '=' + cell.formula;
  if (v instanceof Date) return iso(v);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text != null) return String(v.text?.richText ? v.text.richText.map((t) => t.text).join('') : v.text);
    if (v.error) return String(v.error);
    if ('result' in v) return v.result instanceof Date ? iso(v.result) : v.result ?? null;
    return null;
  }
  return v;
}
const plainText = (v) => (v == null ? '' : String(v));
const csvCell = (v) => { const s = v == null ? '' : v instanceof Date ? iso(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function uniqueHeaders(list) {
  const seen = new Map();
  return list.map((h, i) => { let n = plainText(h).replace(/\s+/g, ' ').trim() || `Column ${colName(i + 1)}`; const k = n.toLowerCase(); const c = seen.get(k) || 0; seen.set(k, c + 1); return c ? `${n} ${c + 1}` : n; });
}
const guessFormat = (type) => (duck.isDateType(type) ? (/TIMESTAMP/i.test(type) ? 'datetime' : 'date') : undefined);

// A stored table becomes a data sheet; a small one is copied into the workbook as normal rows.
async function fromTable(dir, info, name, { keepSmall = true } = {}) {
  const columns = info.columns.map((c) => ({ header: c.name, format: guessFormat(c.type) }));
  if (keepSmall && info.rows <= SMALL_ROWS) {
    const r = await duck.rows(dir, info.table, 0, SMALL_ROWS);
    return { name, columns: columns.map((c) => (c.format ? c : { header: c.header })), rows: r.rows, freeze: 'A2', filter: true };
  }
  const sample = (await duck.rows(dir, info.table, 0, 100)).rows;
  return { name, data: { table: info.table, rows: info.rows, sample, types: info.columns.map((c) => c.type) }, columns: columns.map((c, i) => ({ ...c, field: info.columns[i].name })), freeze: 'A2', filter: true };
}
export { fromTable };

// The column formula shared by every row, e.g. "=B{r}*C{r}", or null when rows differ.
function columnTemplate(formulas, firstRow) {
  let tpl = null;
  for (let i = 0; i < formulas.length; i++) {
    const f = formulas[i]; if (typeof f !== 'string' || !f.startsWith('=')) return null;
    const r = firstRow + i;
    const t = f.replace(new RegExp(`(?<![A-Za-z0-9_$])(\\$?[A-Za-z]{1,3})${r}(?![0-9A-Za-z_(])`, 'g'), '$1{r}');
    if (tpl == null) tpl = t; else if (t !== tpl) return null;
  }
  return tpl && tpl.includes('{r}') ? tpl : null;
}

// The last row that holds a value (formatting and dropdowns often reach far below the data).
function lastRow(ws) { let last = 0; ws.eachRow((row, n) => { if (row.hasValues) last = n; }); return last; }

function smallSheet(ws, name) {
  const rowsN = lastRow(ws), colsN = Math.min(ws.columnCount || 0, 200);
  const grid = [];
  const styles = [];
  for (let r = 1; r <= rowsN; r++) {
    const row = ws.getRow(r); const out = [];
    for (let c = 1; c <= colsN; c++) {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master !== cell) { out.push(null); continue; }
      out.push(cellValue(cell));
    }
    grid.push(out);
  }
  while (grid.length && grid.at(-1).every((v) => v == null || v === '')) grid.pop();
  if (!grid.length) return null;
  const merges = (ws.model?.merges || []).slice(0, 300);
  const sheet = { name };
  const first = grid[0];
  const filled = first.filter((v) => v != null && v !== '').length;
  const lastCol = first.reduce((m, v, i) => (v != null && v !== '' ? i : m), -1) + 1;
  const tableLike = !merges.length && grid.length >= 2 && filled >= 2 && filled === lastCol && first.slice(0, lastCol).every((v) => typeof v === 'string' && !v.startsWith('='))
    && new Set(first.slice(0, lastCol).map((v) => v.toLowerCase())).size === lastCol && grid.every((r) => r.slice(lastCol).every((v) => v == null || v === ''));
  const fmtOf = (c, r1, r2) => { let f = null; for (let r = r1; r <= Math.min(r2, r1 + 30); r++) { const nf = ws.getRow(r).getCell(c).numFmt; if (nf && nf !== 'General') { f = nf; break; } } return f; };
  if (tableLike) {
    const body = grid.slice(1).map((r) => r.slice(0, lastCol));
    sheet.columns = first.slice(0, lastCol).map((h, i) => {
      const col = { header: h };
      const f = fmtOf(i + 1, 2, grid.length); if (f) col.format = f.slice(0, 80);
      const tpl = columnTemplate(body.map((r) => r[i]), 2);
      if (tpl) { col.formula = tpl; for (const r of body) r[i] = null; }
      return col;
    });
    sheet.rows = body;
    sheet.filter = true;
  } else {
    // A free-form sheet (a form, a report, a dashboard): keep each cell where it is, with its basic look.
    let styled = 0;
    sheet.grid = grid.map((row, ri) => row.map((v, ci) => {
      if (v == null) return null;
      const cell = ws.getRow(ri + 1).getCell(ci + 1);
      const s = {};
      if (styled < 4000) {
        if (cell.font?.bold) s.bold = true; if (cell.font?.italic) s.italic = true;
        const fc = argbHex(cell.font?.color); if (fc && fc !== '#000000') s.color = fc;
        const fill = cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid' ? argbHex(cell.fill.fgColor) : null; if (fill && fill !== '#FFFFFF') s.fill = fill;
        if (['center', 'right'].includes(cell.alignment?.horizontal)) s.align = cell.alignment.horizontal;
        if (cell.alignment?.wrapText) s.wrap = true;
        if (cell.numFmt && cell.numFmt !== 'General') s.format = cell.numFmt.slice(0, 80);
      }
      if (Object.keys(s).length) { styled++; return { v, s }; }
      return v;
    }));
    sheet.headerStyle = false;
    if (merges.length) sheet.merges = merges;
  }
  void styles;
  const widths = {};
  for (let c = 1; c <= Math.min(colsN, 60); c++) { const w = ws.getColumn(c).width; if (w && Math.abs(w - 8.43) > 0.5) widths[colName(c)] = Math.round(w); }
  if (Object.keys(widths).length) sheet.widths = widths;
  const view = ws.views?.[0];
  if (view?.state === 'frozen' && (view.xSplit || view.ySplit)) sheet.freeze = colName((view.xSplit || 0) + 1) + ((view.ySplit || 0) + 1);
  else if (tableLike) sheet.freeze = 'A2';
  if (ws.state === 'hidden' || ws.state === 'veryHidden') sheet.hidden = true;
  return sheet;
}

async function sheetToCsv(rowsIter, tmp) {
  const out = fs.createWriteStream(tmp);
  let n = 0, header = null;
  for await (const values of rowsIter) {
    if (!header) { header = uniqueHeaders(values); out.write(header.map(csvCell).join(',') + '\n'); continue; }
    const line = []; for (let i = 0; i < header.length; i++) line.push(csvCell(values[i]));
    if (!out.write(line.join(',') + '\n')) await new Promise((r) => out.once('drain', r));
    n++;
  }
  await new Promise((r) => out.end(r));
  return { rows: n, header };
}
const rowValues = (row) => { const out = []; row.eachCell({ includeEmpty: true }, (cell, c) => { const v = cell.value; out[c - 1] = v == null ? null : v instanceof Date ? v : typeof v === 'object' ? (v.result !== undefined ? v.result : v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? v.error ?? null) : v; }); return out; };

// Returns { sheets: [raw sheet specs], notes: [text for the user], title }.
export async function importFile(file, { dir, used = new Set() }) {
  const ext = path.extname(file.name).slice(1).toLowerCase();
  const base = path.basename(file.name, path.extname(file.name));
  const notes = [], sheets = [], names = [];
  const tmpCsv = () => path.join(os.tmpdir(), `pm-import-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  if (ext === 'csv' || ext === 'tsv' || ext === 'tab') {
    const info = await duck.importCsv(dir, file.path);
    if (!info.columns.length) throw new Error(`${file.name} has no columns.`);
    sheets.push(await fromTable(dir, info, cleanSheetName(base, used)));
    return { sheets, notes, title: base };
  }
  const size = fs.statSync(file.path).size;
  if (size <= FULL_LOAD_BYTES) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file.path);
    for (const ws of wb.worksheets) {
      const name = cleanSheetName(ws.name, used);
      const last = lastRow(ws);
      if (last > SMALL_ROWS + 1) {
        const tmp = tmpCsv();
        try {
          const it = (async function* () { for (let r = 1; r <= last; r++) yield rowValues(ws.getRow(r)); })();
          await sheetToCsv(it, tmp);
          sheets.push(await fromTable(dir, await duck.importCsv(dir, tmp), name, { keepSmall: false }));
        } finally { fs.rmSync(tmp, { force: true }); }
      } else { const s = smallSheet(ws, name); if (s) sheets.push(s); else used.delete(name.toLowerCase()); }
    }
    try {
      const zip = await JSZip.loadAsync(fs.readFileSync(file.path));
      const has = (re) => Object.keys(zip.files).some((n) => re.test(n));
      const lost = [has(/^xl\/charts\//) && 'charts', has(/^xl\/pivotTables\//) && 'pivot tables', has(/^xl\/media\//) && 'pictures'].filter(Boolean);
      if (lost.length) notes.push(`The ${lost.join(', ').replace(/, ([^,]*)$/, ' and $1')} in ${file.name} are not carried over yet. Ask me to rebuild them.`);
    } catch { /* the note is optional */ }
    for (const d of wb.definedNames?.model || []) if (d?.name && d.ranges?.length === 1 && !/^_xlnm/i.test(d.name)) names.push({ name: d.name, ref: String(d.ranges[0]) });
  } else {
    // A very large workbook is read as a stream: values only, straight into the database.
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(file.path, { sharedStrings: 'cache', styles: 'cache', hyperlinks: 'ignore', worksheets: 'emit', entries: 'emit' });
    let i = 0;
    for await (const ws of reader) {
      const name = cleanSheetName(ws.name || `Sheet${++i}`, used);
      const tmp = tmpCsv();
      try {
        const it = (async function* () { for await (const row of ws) yield rowValues(row); })();
        const { rows: n } = await sheetToCsv(it, tmp);
        if (n > 0) sheets.push(await fromTable(dir, await duck.importCsv(dir, tmp), name)); else used.delete(name.toLowerCase());
      } finally { fs.rmSync(tmp, { force: true }); }
    }
    notes.push('This workbook is very large, so its sheets were opened as data: values are kept, formulas are replaced by their results.');
  }
  if (!sheets.length) throw new Error(`${file.name} has no data.`);
  return { sheets, notes, names, title: base };
}
