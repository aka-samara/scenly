// Spreadsheets. The model plans the workbook as JSON (sheets, columns, formulas, charts); Scenly
// checks every formula with a real calculation engine, shows the result and builds the .xlsx.
import { looseJson } from '../envelope.js';
import { pmap } from '../util.js';
import { normalize } from '../sheet/model.js';
import { calculate } from '../sheet/calc.js';
import { colName } from '../sheet/a1.js';
import { buildXlsx, buildCsv } from '../sheet/xlsx.js';
import { applySheetEdits, applyManualSheet, sources } from '../sheet/edits.js';
import { preview, describe, summary, keepCalc, calcOf } from '../sheet/view.js';
import { importFile, canImport } from '../sheet/import.js';
import { TEMPLATES } from '../sheet/templates.js';
import * as duck from '../sheet/duck.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const XLSX_DATA_ROWS = 200000; // rows of one large data sheet written into the .xlsx

const FORMAT_HELP = `Sheet objects:
- TABLE sheet (lists, ledgers, data): {"name":"Sales","columns":[{"header":"Month"},{"header":"Units","format":"integer"},{"header":"Price","format":"currency"},{"header":"Revenue","format":"currency","formula":"=B{r}*C{r}"}],"rows":[["Jan",120,9.5],["Feb",150,9.5]],"totals":{"Units":"sum","Revenue":"sum"},"freeze":"A2","filter":true,"banded":true}
  The header is row 1 and data starts in row 2 (columns A, B, C… in order). A column "formula" is filled into every row: {r} is the row's number, {first} and {last} are the first and last data rows, {prev} the row above. Leave formula columns out of "rows". "totals" adds a total row: sum, average, min, max, count, or a formula.
- FREE sheet (summaries, dashboards, forms, statements): {"name":"Summary","cells":{"A1":{"v":"Summary","bold":true,"size":16},"A3":"Total revenue","B3":{"v":"=SUM(Sales!D:D)","format":"currency"}},"widths":{"A":24},"merges":["A1:C1"]}
  A cell is a value, a "=formula", or {"v":…, plus any of "bold","italic","fill":"#hex","color":"#hex","align","format","size","wrap","border","note"}. A table sheet can also have "cells" for things outside the table.
- On any sheet: "styles":[{"range":"A1:D1","fill":"#1F3A5F","color":"#FFFFFF","bold":true}], "conditional":[{"range":"D2:D50","rule":"greaterThan","value":1000,"fill":"#C6EFCE"}] (rules: greaterThan, lessThan, between, equal, notEqual, contains, top, bottom, aboveAverage, belowAverage, duplicate, blank, colorScale, dataBar, formula), "validation":[{"range":"C2:C200","list":["Open","Done"]}] (or "type":"whole|decimal|date","min","max"), "charts":[{"type":"column","title":"Revenue by month","categories":"A2:A13","series":[{"name":"Revenue","values":"D2:D13"}]}] (types: column, bar, line, area, pie, doughnut, scatter, stackedColumn, stackedBar; ranges may point at another sheet), "widths":{"A":20}, "freeze":"A2", "filter":true, "protect":true, "tabColor":"#hex".
Workbook: {"title":"…","currency":"USD","sheets":[…],"names":[{"name":"TaxRate","ref":"Inputs!$B$2"}]}
Formats: general, integer, number, currency, currency0, percent, percent0, date, month, datetime, text, or an Excel code such as 0.0"x".
RULES
- Every calculated number must be a formula, never a typed result, so the file stays live. Use real Excel functions in English with commas: SUM, SUMIFS, COUNTIFS, AVERAGEIFS, IF, IFS, IFERROR, XLOOKUP, INDEX, MATCH, VLOOKUP, FILTER, UNIQUE, SORT, TEXT, DATE, EOMONTH, ROUND, PMT, NPV, IRR and so on.
- Other sheets: Sales!A1 or 'Q1 Sales'!A1. For a whole table column use whole-column references such as SUMIFS(Sales!D:D,Sales!A:A,A2); they keep working when rows are added.
- Dates are "YYYY-MM-DD" text with a date format. Percentages are fractions (0.15) with a percent format. Money is a plain number with a currency format.
- Scenly calculates every formula before the file is built and tells you about any that fail, so be exact about cell addresses.
- Put inputs and assumptions in their own clearly labelled cells and point formulas at them.`;

const SIZE_HELP = `SIZE: long replies time out, so keep your whole reply under about 1,200 tokens and think briefly.
- A workbook with ONE small sheet (up to about 15 rows) can be written in full.
- Anything bigger is written as a PLAN: for every sheet give "name", for a table sheet its "columns" as the list of header names in their final order, and "build": "exactly what this sheet must contain: its purpose, what each column holds, number formats, the formulas in words, totals, charts, conditional colours, and how many rows". Example: {"title":"Coffee shop sales 2026","currency":"USD","sheets":[{"name":"Sales","columns":["Month","Product","Units","Price","Revenue"],"build":"One row per month and product for 2026 (60 rows)… Revenue = Units × Price… total row… freeze header, filter"},{"name":"Summary","build":"Revenue and units per product with SUMIFS over Sales (whole-column references), best month with XLOOKUP, a column chart of revenue per product"}]}
  Every planned sheet is then written separately, in parallel, with your plan in front of it, and merged in before the user sees anything. So your <message> describes the finished workbook and never mentions plans.
- Summary and dashboard sheets should read table sheets with whole-column references (Sales!E:E), because row counts are only known once the sheets are written.
- For more than about 40 rows of invented or sample data, a table uses "generate":{"count":200,"brief":"what the rows contain, with realistic ranges"} instead of "rows"; those rows are also written separately.`;

// Rows left to "generate" are written in batches, several at a time.
async function fillRows(spec, ctx) {
  const jobs = [];
  for (const s of spec.sheets) if (s.generate && s.columns?.length) {
    const inputs = s.columns.map((c, i) => ({ c, i })).filter((x) => !x.c.formula);
    const count = Math.min(s.generate.count, 1000), size = 50;
    for (let from = 0; from < count; from += size) jobs.push({ s, inputs, from, n: Math.min(size, count - from), count });
  }
  if (!jobs.length) return spec;
  let done = 0; const total = jobs.reduce((n, j) => n + j.n, 0);
  ctx.status(`Writing ${total.toLocaleString('en-US')} rows…`);
  const parts = await pmap(jobs, async (j) => {
    const cols = j.inputs.map((x) => `"${x.c.header}"${x.c.format ? ` (${x.c.format})` : ''}`).join(', ');
    const example = (j.s.rows || []).slice(0, 3).map((r) => JSON.stringify(j.inputs.map((x) => (r[x.i] && typeof r[x.i] === 'object' ? r[x.i].v : r[x.i])))).join('\n');
    let rows = [];
    try {
      const text = await ctx.ask(
        'You write rows of realistic data for a spreadsheet. Reply with ONLY the rows, one JSON array per line, values in the column order given, no header, no numbering, no commentary and no code fence. Numbers are plain numbers, dates are "YYYY-MM-DD" text, percentages are fractions.',
        `Workbook: ${spec.title}\nSheet: ${j.s.name}\nColumns, in order: ${cols}\nWhat the rows should contain: ${j.s.generate.brief}\n${example ? `Rows already in the sheet:\n${example}\n` : ''}Write rows ${j.from + 1} to ${j.from + j.n} of ${j.count}. Rows before and after these are written separately, so keep running values (dates, ids, sequences) in step with the row numbers and vary the data naturally.`,
        { maxTokens: 4200 });
      for (const line of String(text).split('\n')) { const t = line.trim().replace(/,$/, ''); if (!t.startsWith('[')) continue; try { const a = JSON.parse(t); if (Array.isArray(a) && !Array.isArray(a[0])) rows.push(a); else if (Array.isArray(a)) rows.push(...a.filter(Array.isArray)); } catch { /* a broken line is skipped */ } }
    } catch (e) {
      if (ctx.signal?.aborted || e.code === 'insufficient_credits') throw e;
      ctx.warn(`Some rows of "${j.s.name}" could not be written. Ask me to add more rows.`);
    }
    done += j.n; ctx.status(`Writing rows… ${Math.min(done, total).toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`);
    return rows.slice(0, j.n + 5).map((r) => { const full = new Array(j.s.columns.length).fill(null); j.inputs.forEach((x, k) => { full[x.i] = r[k] ?? null; }); return full; });
  }, 6);
  const out = { ...spec, sheets: spec.sheets.map((s) => ({ ...s })) };
  jobs.forEach((j, k) => { const s = out.sheets[spec.sheets.indexOf(j.s)]; s.rows = [...(s.rows || []), ...parts[k]]; delete s.generate; });
  for (const s of out.sheets) if (s.generate) delete s.generate;
  return normalize(out).spec;
}

const kind = {
  id: 'sheet', label: 'Spreadsheet', noun: 'spreadsheet', ext: 'xlsx', icon: 'X',
  detect: /\b(xlsx|xls|excel|spreadsheets?|workbook|google sheets?|csv file|pivot table)\b/i,
  formats: [
    { id: 'xlsx', label: 'Excel', sub: '.xlsx with live formulas and charts', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { id: 'csv', label: 'CSV', sub: '.csv of the sheet you are looking at, values only', mime: 'text/csv; charset=utf-8' },
  ],
  suggestions: ['Add a chart', 'Add a summary sheet', 'Highlight the highest values', 'Add a totals row'],
  imports: ['xlsx', 'xlsm', 'csv', 'tsv'],
  importsInto: true,
  seedMessage: (label) => `Here is the ${label} template with live formulas. Tell me about your case and I'll tailor it, or change any cell yourself.`,
  templates: TEMPLATES.map(({ id, label, sub }) => ({ id, label, sub })),
  canImport,

  prompt(mode, cur) {
    const hasTables = cur?.sheets.some((s) => s.data || s.columns?.length);
    const big = cur?.sheets.some((s) => s.data);
    const query = hasTables ? `
READING THE DATA: you only see the first rows of long sheets${big ? ' and a few sample rows of large data sheets' : ''}. When you need figures you cannot see, reply with ONLY one or more <query>SELECT …</query> blocks and nothing else. It is DuckDB SQL; every table sheet is a table named exactly like the sheet (in double quotes) with columns named like its headers (in double quotes). You get the results back, and then you answer in the normal format. Use this for questions about the data (totals, top customers, trends, anomalies, duplicates) before answering; never guess numbers.` : '';
    if (mode === 'create') return `You are building an Excel workbook.

Inside <document title="…"> write ONE JSON object and nothing else.
${FORMAT_HELP}
${SIZE_HELP}
- Build what a careful analyst would: clear headers, sensible number formats, a total row where it helps, frozen headers, and a chart or summary sheet when the request is about results. No explanations inside cells unless asked.`;
    return `You are editing the user's Excel workbook. The current workbook is shown below with cell addresses and calculated values. Change it with <edit> blocks; send only what changes.
- <edit op="set_cells" sheet="Sales">{"B2": 130, "E1": {"v":"Margin","bold":true}, "E2": "=D2*0.3", "F9": null}</edit>  (null clears a cell; works for any cell, header or total)
- <edit op="add_rows" sheet="Sales">[["Mar", 90, 10], ["Apr", 200, 10]]</edit>  (added at the end; or after="7" to insert below sheet row 7). For many invented rows: <edit op="add_rows" sheet="Sales" count="100" brief="what to generate"/>
- <edit op="delete_rows" sheet="Sales" rows="5-7"/>
- <edit op="add_column" sheet="Sales" after="Revenue">{"header":"Margin","format":"percent","formula":"=E{r}/D{r}","total":"average"}</edit>  ("values":[…] instead of a formula for typed data)
- <edit op="set_column" sheet="Sales" column="Price">{"format":"currency0","width":14}</edit>   <edit op="delete_column" sheet="Sales" column="Notes"/>
- <edit op="sort" sheet="Sales" by="Revenue" order="desc"/>
- <edit op="format" sheet="Sales">{"styles":[…],"conditional":[…],"validation":[…],"charts":[…],"freeze":"A2","filter":true,"banded":true,"widths":{"A":22},"totals":{"Units":"sum"},"clear":["charts"]}</edit>  (lists are added to what is there; "clear" removes existing styles, conditional, validation, charts or merges first)
- <edit op="add_sheet">{…one sheet object…}</edit>   <edit op="replace_sheet" sheet="Summary">{…}</edit>   <edit op="rename_sheet" sheet="Sheet1" to="Data"/>   <edit op="delete_sheet" sheet="Old"/>
- <edit op="workbook">{"title":"…","currency":"EUR","theme":{"header":"#1F3A5F"},"names":[{"name":"TaxRate","ref":"Inputs!$B$2"}]}</edit>
- <edit op="query_sheet" name="Sales by region">SELECT "Region", sum("Revenue") AS "Revenue" FROM "Sales" GROUP BY 1 ORDER BY 2 DESC</edit>  builds a new sheet from a DuckDB query over the table sheets (replace="Existing sheet" overwrites one). Use it for pivots, summaries, cleaning, removing duplicates, joining or stacking sheets, and anything on large data sheets. Its result is values, not formulas.
Formulas, charts and rules that point at rows or columns you insert or delete are adjusted for you.\nKeep your reply under about 1,200 tokens. A new or rebuilt sheet that needs more than that is sent as a plan, {"name":…,"columns":[header names],"build":"exactly what it must contain"}, inside add_sheet or replace_sheet, and is then written separately.
${FORMAT_HELP}${query}`;
  },

  parseDocument({ attrs, body }) {
    let raw;
    try { raw = looseJson(body); } catch (e) { return { kind: 'sheet', title: attrs.title, __bad: e.message }; }
    if (Array.isArray(raw)) raw = { sheets: raw };
    if (attrs.title && !raw.title) raw.title = attrs.title;
    return raw;
  },

  validate(raw, _ctx, { lenient = false } = {}) {
    if (raw?.__bad) return { spec: null, errors: ['The <document> must contain one valid JSON object (' + raw.__bad + '). Check quotes, commas and brackets.'], warnings: [] };
    const n = normalize(raw);
    if (n.errors.length) return n;
    // Sheets still to be written are checked once they exist (see expand).
    if (n.spec.sheets.some((s) => s.build || s.generate)) return { spec: n.spec, errors: [], warnings: n.warnings };
    const calc = calculate(n.spec);
    keepCalc(n.spec, calc);
    // After the parts were written and repaired once, a formula that still fails is reported, not fatal.
    if (lenient) return { spec: n.spec, errors: [], warnings: [...calc.errors.slice(0, 3).map((e) => 'Needs attention: ' + e), ...n.warnings, ...calc.warnings] };
    return { spec: n.spec, errors: calc.errors, warnings: [...n.warnings, ...calc.warnings] };
  },

  planTokens: 3000,

  // Planned sheets are written one call each, in parallel; then rows left to "generate" are written in batches.
  async expand(spec0, ctx) {
    let spec = spec0;
    const planned = spec.sheets.filter((s) => s.build);
    if (planned.length) {
      const plan = spec.sheets.map((s) => `- "${s.name}"${s.columns?.length ? ` (table; columns ${s.columns.map((c, i) => `${colName(i + 1)} "${c.header}"`).join(', ')})` : ''}: ${s.build || 'already written'}`).join('\n');
      const system = `You are writing ONE sheet of an Excel workbook. Other sheets are written at the same time and refer to this one, so follow the plan exactly. Reply with ONLY one JSON object for this sheet: no code fence, no commentary. Think briefly and keep the reply under about 1,500 tokens.\n${FORMAT_HELP}\n- Keep the sheet's name. For a table sheet keep the planned columns in exactly the planned order, starting in column A, because other sheets refer to them by letter.\n- For more than about 40 rows of invented data use "generate":{"count":N,"brief":"…"} instead of "rows".\n- Refer to other table sheets with whole-column references such as SUMIFS(Sales!E:E,Sales!B:B,A2).`;
      const write = async (s, problems) => {
        const text = await ctx.ask(system, `Workbook: ${spec.title}${spec.currency ? ` (currency ${spec.currency})` : ''}\nWhat the user asked for: ${ctx.request || '(see plan)'}\n\nPlan of all sheets:\n${plan}\n\nWrite the sheet "${s.name}" now.${problems ? `\n\nYour previous version of this sheet had these problems, fix them:\n- ${problems.join('\n- ')}` : ''}`, { maxTokens: 3000 });
        let raw = looseJson(text);
        if (Array.isArray(raw?.sheets)) raw = raw.sheets.find((x) => String(x?.name || '').toLowerCase() === s.name.toLowerCase()) || raw.sheets[0];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not a sheet');
        delete raw.build; raw.name = s.name;
        return raw;
      };
      let done = 0;
      ctx.status(`Writing ${planned.length} sheet${planned.length > 1 ? 's' : ''}…`);
      const fail = (s) => ({ name: s.name, cells: { A1: `This sheet could not be written. Ask Scenly to build the sheet "${s.name}" again.` } });
      const built = await pmap(planned, async (s) => {
        let out;
        try { out = await write(s); }
        catch (e) { if (ctx.signal?.aborted || e.code === 'insufficient_credits') throw e; try { out = await write(s, ['The reply was not one valid JSON sheet object.']); } catch (e2) { if (ctx.signal?.aborted || e2.code === 'insufficient_credits') throw e2; ctx.warn(`The sheet "${s.name}" could not be written. Ask me to build it again.`); out = fail(s); } }
        ctx.status(`Writing sheets… ${++done} of ${planned.length}`);
        return out;
      }, 6);
      const merge = (list) => normalize({ ...spec, sheets: spec.sheets.map((s) => { const i = planned.indexOf(s); return i >= 0 ? list[i] : s; }) });
      let n = merge(built);
      if (n.errors.length) throw Object.assign(new Error(n.errors[0]), { details: n.errors });
      n = { ...n, spec: await fillRows(n.spec, ctx) };
      // One repair round: sheets whose formulas fail, or whose lookups all come back empty, are sent
      // back with the exact problems and a look at the data they read.
      const problemsOf = (m) => {
        const by = {}; const calc = calculate(m.spec);
        const add = (name, text) => (by[name] ||= []).push(text);
        for (const e of calc.errors) { const who = planned.find((s) => e.startsWith(s.name + '!')); if (who) add(who.name, e); }
        m.spec.sheets.forEach((s, si) => {
          if (!planned.some((x) => x.name === s.name)) return;
          const cols = new Map();
          for (const [k, cell] of calc.sheets[si].ex.cells) {
            if (!cell.f || !/\b(SUMIFS?|COUNTIFS?|AVERAGEIFS?|XLOOKUP|VLOOKUP|HLOOKUP|MATCH|MAXIFS|MINIFS)\(/i.test(cell.f) || !/!/.test(cell.f)) continue;
            const [r, c] = k.split(',').map(Number); const v = calc.sheets[si].values.get(k);
            const empty = v === 0 || v === '' || v == null || (typeof v === 'object' && !v.pending);
            const g = cols.get(c) || cols.set(c, { n: 0, empty: 0, first: null }).get(c); g.n++; if (empty) { g.empty++; g.first ||= `${s.name}!${colName(c)}${r}: ${cell.f}`; }
          }
          for (const g of cols.values()) if (g.n >= 3 && g.empty === g.n) add(s.name, `All ${g.n} formulas like ${g.first} give 0 or nothing, so their criteria do not match the data they look at. Check the data shown below (for example dates are real dates, not month names; text must match exactly) and rewrite them so they match.`);
        });
        return by;
      };
      const peek = (m) => m.spec.sheets.filter((s) => s.columns?.length && s.rows?.length).map((s) => `"${s.name}" rows ${2}-${Math.min(4, s.rows.length + 1)} of ${s.rows.length + 1}: ` + s.rows.slice(0, 3).map((r) => '[' + s.columns.map((c, i) => `${colName(i + 1)}=${JSON.stringify(r[i] && typeof r[i] === 'object' ? r[i].v : r[i] ?? (c.formula ? '(formula)' : null))}`).join(', ') + ']').join(' ')).join('\n');
      const bad = problemsOf(n);
      const redo = planned.filter((s) => bad[s.name] && !built[planned.indexOf(s)].generate);
      if (redo.length) {
        ctx.status('Checking the formulas and fixing a problem…');
        const data = peek(n);
        const fixed = await pmap(redo, async (s) => { try { return await write(s, [...bad[s.name].slice(0, 8), `The data in the table sheets as it was actually written:\n${data}`]); } catch (e) { if (ctx.signal?.aborted || e.code === 'insufficient_credits') throw e; return null; } }, 6);
        const done2 = n.spec.sheets;
        const m = normalize({ ...n.spec, sheets: done2.map((s) => { const k = redo.findIndex((x) => x.name === s.name); return k >= 0 && fixed[k] ? fixed[k] : s; }) });
        if (!m.errors.length) { const before = Object.values(bad).flat().length; const m2 = { ...m, spec: await fillRows(m.spec, ctx) }; if (Object.values(problemsOf(m2)).flat().length < before) n = m2; }
      }
      return n.spec;
    }
    return fillRows(spec, ctx);
  },

  describe,
  applyEdits: (spec, edits, ctx) => applySheetEdits(spec, edits, ctx),
  applyManual: applyManualSheet,
  summary,
  preview,

  // Runs the model's <query> blocks and returns their results as text (or null when there are none).
  async answerQueries(text, spec, ctx) {
    const list = [...String(text).matchAll(/<query\b[^>]*>([\s\S]*?)<\/query>/gi)].map((m) => m[1].replace(/^```\w*\n?|```$/g, '').trim()).filter(Boolean).slice(0, 5);
    if (!list.length || !spec) return null;
    const src = sources(spec, calcOf(spec));
    const memory = !ctx.dir || !spec.sheets.some((s) => s.data);
    const out = [];
    for (const sql of list) {
      try {
        const r = await duck.query(ctx.dir, sql, src, { limit: 60, memory });
        const rows = r.rows.map((row) => row.map((v) => (v == null ? '' : typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : String(v).slice(0, 80))).join(' | '));
        out.push(`QUERY: ${sql}\nRESULT (${r.total.toLocaleString('en-US')} row${r.total === 1 ? '' : 's'}${r.total > r.rows.length ? `, first ${r.rows.length} shown` : ''}):\n${r.columns.join(' | ')}\n${rows.join('\n')}`);
      } catch (e) { out.push(`QUERY: ${sql}\nERROR: ${e.message}\nTables: ${src.map((s) => `"${s.name}"`).join(', ')}`); }
    }
    return out.join('\n\n');
  },

  // Uploaded spreadsheets and CSV files become sheets (added to the current workbook when there is one).
  async importFiles(files, cur, ctx) {
    const used = new Set((cur?.sheets || []).map((s) => s.name.toLowerCase()));
    const sheets = [], notes = [], names = [...(cur?.names || [])]; let title = cur?.title;
    for (const f of files) {
      ctx.status(`Opening ${f.name}…`);
      const r = await importFile(f, { dir: ctx.dir, used });
      sheets.push(...r.sheets); notes.push(...r.notes); title ||= r.title;
      for (const n of r.names || []) if (!names.some((x) => x.name.toLowerCase() === n.name.toLowerCase())) names.push(n);
    }
    const raw = cur ? { ...cur, sheets: [...cur.sheets, ...sheets], names } : { title, sheets, names };
    const n = normalize(raw);
    // An uploaded workbook is opened as it is; formulas Scenly cannot follow show as errors instead of blocking it.
    if (!n.spec.sheets.length) throw new Error(n.errors[0] || 'The file has no data.');
    return { spec: n.spec, notes, added: sheets.map((s) => s.name) };
  },
  async rows(spec, sheetName, offset, limit, { dir }) {
    const s = spec.sheets.find((x) => x.name === sheetName);
    if (!s?.data) return { rows: [], offset, total: 0 };
    const r = await duck.rows(dir, s.data.table, offset, limit);
    return { rows: r.rows, offset, total: s.data.rows };
  },
  // The rows of one sheet as records keyed by the header row, as they read on screen (for mail merge).
  async records(spec, sheetName, theme, { dir, limit = 500 } = {}) {
    const s = spec.sheets.find((x) => x.name === sheetName) || spec.sheets.find((x) => !x.hidden) || spec.sheets[0];
    if (!s) return { sheet: '', columns: [], rows: [] };
    const text = (v) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
    if (s.data) {
      const r = await duck.rows(dir, s.data.table, 0, limit);
      const columns = r.columns.map((c) => String(c?.name ?? c));
      return { sheet: s.name, columns, rows: r.rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, text(row[i])]))) };
    }
    const pv = preview(spec, theme).sheets.find((x) => x.name === s.name);
    const grid = [];
    for (const [r, c, t] of pv?.cells || []) { if (t === '' || t == null) continue; (grid[r] ||= [])[c] = String(t); }
    const filled = (row) => (row || []).filter((x) => x != null && x !== '').length;
    const widest = Math.max(0, ...Array.from(grid, filled));
    // The header is the first row that is about as wide as the table (title rows above it are skipped).
    const h = grid.findIndex((row) => filled(row) >= Math.max(1, Math.min(2, widest)) && filled(row) >= widest * 0.6);
    if (h < 0) return { sheet: s.name, columns: [], rows: [] };
    const cols = []; grid[h].forEach((name, c) => { if (name) cols.push([c, name]); });
    const rows = [];
    for (let r = h + 1; r < grid.length && rows.length < limit; r++) { if (!filled(grid[r])) { if (rows.length) break; continue; } rows.push(Object.fromEntries(cols.map(([c, name]) => [name, grid[r][c] ?? '']))); }
    return { sheet: s.name, columns: cols.map((x) => x[1]), rows };
  },
  // The same for a spreadsheet or CSV file that is not a document yet.
  async recordsFromFile(file, theme, { sheet, limit = 500 } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-merge-'));
    try {
      const r = await importFile(file, { dir });
      const n = normalize({ title: r.title, sheets: r.sheets, names: [] });
      if (!n.spec.sheets.length) throw new Error('The file has no data.');
      const out = await this.records(n.spec, sheet, theme, { dir, limit });
      return { ...out, sheets: n.spec.sheets.map((x) => x.name) };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  },
  template(id, theme) { const t = TEMPLATES.find((x) => x.id === id); if (!t) return null; const n = normalize(t.build(theme)); return { spec: n.spec, label: t.label }; },

  async render(spec, format, theme, { dir, sheet } = {}) {
    const calc = calcOf(spec);
    if (format === 'csv') {
      const si = Math.max(0, spec.sheets.findIndex((s) => s.name === sheet));
      const s = spec.sheets[si];
      if (!s.data) return buildCsv(spec, si, calc);
      const q = (v) => { const t = v == null ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const parts = ['﻿' + s.columns.map((c) => q(c.header)).join(',') + '\r\n'];
      let buf = [];
      for await (const row of duck.allRows(dir, s.data.table)) { buf.push(row.map(q).join(',')); if (buf.length >= 5000) { parts.push(buf.join('\r\n') + '\r\n'); buf = []; } }
      parts.push(buf.join('\r\n'));
      return Buffer.from(parts.join(''), 'utf8');
    }
    return buildXlsx(spec, theme, { calc, rowsFor: (s) => duck.allRows(dir, s.data.table, { max: XLSX_DATA_ROWS }), dataRowLimit: XLSX_DATA_ROWS });
  },
};
export default kind;
