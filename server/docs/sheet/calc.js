// Calculates every formula with HyperFormula before the file is built. This catches broken
// references and typos, and gives real numbers for the preview and for the saved file.
import { HyperFormula } from 'hyperformula';
import { expandSheet } from './model.js';
import { cellName, functionsIn, parseRange, sheetsIn } from './a1.js';

const HF_FUNCS = new Set(HyperFormula.getRegisteredFunctionNames('enGB'));
// Real Excel functions HyperFormula cannot calculate. Excel works them out when the file is opened.
const EXCEL_ONLY = new Set(['LET', 'LAMBDA', 'XMATCH', 'CONCAT', 'INDIRECT', 'SORTBY', 'SEQUENCE', 'RANDARRAY', 'TEXTSPLIT', 'TEXTBEFORE', 'TEXTAFTER', 'TAKE', 'DROP', 'VSTACK', 'HSTACK', 'TOCOL', 'TOROW', 'WRAPROWS', 'WRAPCOLS', 'CHOOSEROWS', 'CHOOSECOLS', 'EXPAND', 'BYROW', 'BYCOL', 'MAP', 'REDUCE', 'SCAN', 'MAKEARRAY', 'ISOMITTED', 'GROUPBY', 'PIVOTBY', 'PERCENTOF', 'STOCKHISTORY', 'IMAGE', 'FORMULATEXT', 'GETPIVOTDATA', 'HYPERLINK', 'CELL', 'INFO', 'AGGREGATE', 'NUMBERVALUE', 'VALUETOTEXT', 'ARRAYTOTEXT', 'DOLLAR', 'FIXED', 'ROMAN', 'ARABIC', 'WORKDAY.INTL', 'NETWORKDAYS.INTL', 'FORECAST.LINEAR', 'FORECAST', 'TREND', 'GROWTH', 'LINEST', 'LOGEST', 'PERCENTRANK', 'PERCENTRANK.INC', 'PERCENTRANK.EXC', 'QUARTILE', 'QUARTILE.INC', 'QUARTILE.EXC', 'PERCENTILE', 'PERCENTILE.INC', 'PERCENTILE.EXC', 'RANK', 'RANK.EQ', 'RANK.AVG', 'MODE', 'MODE.SNGL', 'STDEV', 'STDEV.S', 'STDEV.P', 'VAR', 'VAR.S', 'VAR.P', 'XIRR', 'XNPV', 'MIRR', 'CUMIPMT', 'CUMPRINC', 'SLN', 'SYD', 'DB', 'DDB', 'ISFORMULA', 'SHEET', 'SHEETS', 'UNICHAR', 'UNICODE', 'DAYS360', 'YEARFRAC', 'ISOWEEKNUM', 'WEEKNUM', 'SUBTOTAL', 'TRANSPOSE', 'FREQUENCY', 'MMULT', 'DGET', 'DSUM', 'DCOUNT', 'DAVERAGE', 'DMAX', 'DMIN']);
for (const f of [...EXCEL_ONLY]) if (HF_FUNCS.has(f)) EXCEL_ONLY.delete(f);

const HARD = new Set(['REF', 'NAME', 'CYCLE', 'ERROR', 'VALUE', 'SPILL', 'LIC']);

// Returns { sheets: [{ name, ex, values: Map "r,c" → computed value | { error } }], errors, warnings }.
export function calculate(spec, { limit = 250000 } = {}) {
  const errors = [], warnings = [];
  const expanded = spec.sheets.map((s) => ({ s, ex: expandSheet(spec, s, s.data ? { rowsOverride: s.data.sample || [] } : {}) }));
  const total = expanded.reduce((n, e) => n + e.ex.cells.size, 0);
  const out = expanded.map(({ s, ex }) => ({ name: s.name, ex, values: new Map() }));
  const anyFormula = expanded.some((e) => [...e.ex.cells.values()].some((c) => c.f));
  if (!anyFormula) return { sheets: out, errors, warnings, checked: true };
  if (total > limit) { warnings.push('This workbook is too large to check every formula here. Excel calculates them when the file is opened.'); return { sheets: out, errors, warnings, checked: false }; }

  const data = {};
  expanded.forEach(({ s, ex }) => {
    const m = [];
    for (const [k, cell] of ex.cells) {
      const [r, c] = k.split(',').map(Number);
      (m[r - 1] ||= [])[c - 1] = cell.f ?? (typeof cell.v === 'string' && /^['=+\-@]/.test(cell.v) && !/^-?\d/.test(cell.v) ? "'" + cell.v : cell.v);
    }
    for (let i = 0; i < m.length; i++) { m[i] ||= []; for (let j = 0; j < m[i].length; j++) if (m[i][j] === undefined) m[i][j] = null; }
    data[s.name] = m.length ? m : [[null]];
  });
  let hf;
  try {
    hf = HyperFormula.buildFromSheets(data, { licenseKey: 'gpl-v3', useArrayArithmetic: true, dateFormats: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'], timeFormats: ['hh:mm', 'hh:mm:ss'], precisionRounding: 10, smartRounding: true, useColumnIndex: false, evaluateNullToZero: false, leapYear1900: true, nullDate: { year: 1899, month: 12, day: 30 } });
  } catch (e) { errors.push('The workbook could not be calculated: ' + e.message); return { sheets: out, errors, warnings, checked: false }; }
  for (const n of spec.names || []) { try { hf.addNamedExpression(n.name, '=' + n.ref); } catch (e) { errors.push(`The name "${n.name}" (${n.ref}) is not valid: ${e.message}`); } }
  if (spec.names?.length) hf.rebuildAndRecalculate();

  const bigData = new Set(spec.sheets.filter((x) => x.data).map((x) => x.name.toLowerCase())); let toldBig = false;
  const seen = new Map(); // one line per distinct problem
  const note = (list, key, text) => { const k = key; if (!seen.has(k)) { seen.set(k, { list, text, n: 0, at: [] }); } const e = seen.get(k); e.n++; if (e.at.length < 3) e.at.push(text.at); };
  expanded.forEach(({ s, ex }, si) => {
    const sheetId = hf.getSheetId(s.name);
    for (const [k, cell] of ex.cells) {
      if (!cell.f) continue;
      const [r, c] = k.split(',').map(Number);
      // Formulas over a large data sheet are worked out by Excel; only a sample of those rows is loaded here.
      if (bigData.size && (bigData.has(s.name.toLowerCase()) || sheetsIn(cell.f).some((n) => bigData.has(n.toLowerCase())))) { out[si].values.set(k, { pending: true }); if (!toldBig) { toldBig = true; warnings.push(`Formulas that read the large data sheet${bigData.size > 1 ? 's' : ''} are calculated by Excel when the file is opened, so the preview shows no value for them. Ask for a summary sheet to see the numbers here.`); } continue; }
      let v;
      try { v = hf.getCellValue({ sheet: sheetId, row: r - 1, col: c - 1 }); } catch { v = null; }
      const at = `${s.name}!${cellName(c, r)}`;
      if (v && typeof v === 'object' && v.type) {
        const fns = functionsIn(cell.f);
        const unknown = fns.filter((f) => !HF_FUNCS.has(f));
        const excelOnly = unknown.filter((f) => EXCEL_ONLY.has(f));
        if (v.type === 'NAME' && unknown.length && unknown.length === excelOnly.length) {
          out[si].values.set(k, { pending: true });
          note(warnings, 'excel:' + excelOnly.join(','), { at, msg: `uses ${excelOnly.join(', ')}, which only Excel can calculate, so the preview shows no value there. The file itself works in Excel.` });
          continue;
        }
        out[si].values.set(k, { error: v.value });
        const why = v.type === 'NAME' ? (unknown.length ? `uses ${unknown.filter((f) => !EXCEL_ONLY.has(f)).join(', ') || unknown.join(', ')}, which is not an Excel function` : `uses a name that does not exist (${v.message || 'check range names and text in quotes'})`)
          : v.type === 'REF' ? `points at a cell or sheet that does not exist${v.message ? ' (' + v.message + ')' : ''}`
          : v.type === 'CYCLE' ? 'is a circular reference: it depends on its own result'
          : v.type === 'SPILL' ? 'returns several cells but the cells next to it are not empty'
          : v.type === 'VALUE' ? `has the wrong kind of value${v.message ? ' (' + v.message + ')' : ''}`
          : v.type === 'DIV_BY_ZERO' ? 'divides by zero; wrap it in IFERROR(…, 0) or check the divisor'
          : v.type === 'NA' ? 'finds no match (#N/A); wrap the lookup in IFERROR or check the lookup value'
          : `gives ${v.value}${v.message ? ' (' + v.message + ')' : ''}`;
        note(HARD.has(v.type) ? errors : warnings, v.type + ':' + cell.f.replace(/\d+/g, '#'), { at, msg: `${cell.f.length > 90 ? cell.f.slice(0, 87) + '…' : cell.f} ${why}` });
      } else out[si].values.set(k, v);
    }
  });
  for (const e of seen.values()) e.list.push(`${e.at.join(', ')}${e.n > e.at.length ? ` and ${e.n - e.at.length} more cells` : ''}: ${e.text.msg}`);
  hf.destroy();
  return { sheets: out, errors, warnings, checked: true };
}

// Reads a range of computed values (for charts): returns a flat array.
export function rangeValues(calc, sheetName, ref) {
  const sh = calc.sheets.find((x) => x.name.toLowerCase() === String(sheetName).toLowerCase());
  const p = parseRange(ref); if (!sh || !p) return [];
  const out = [];
  for (let r = p.r1; r <= Math.min(p.r2, sh.ex.maxR); r++) for (let c = p.c1; c <= Math.min(p.c2, sh.ex.maxC); c++) {
    const k = r + ',' + c; const cell = sh.ex.cells.get(k);
    const v = cell?.f ? sh.values.get(k) : cell?.v;
    out.push(v && typeof v === 'object' ? null : v ?? null);
  }
  return out;
}
