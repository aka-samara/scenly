// Large tables live in a DuckDB file next to the document's versions (data/docs/<id>/data.duckdb).
// Every import or transform makes a NEW table (t1, t2, …) and nothing is ever changed in place,
// so older versions of the workbook keep pointing at the data they were built from.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DuckDBInstance } from '@duckdb/node-api';
import { UserError } from '../../generate.js';

const file = (dir) => path.join(dir, 'data.duckdb');
export const hasDb = (dir) => fs.existsSync(file(dir));
const q = (name) => '"' + String(name).replace(/"/g, '""') + '"';
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const NUMERIC = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|DECIMAL)/i;
export const isNumericType = (t) => NUMERIC.test(String(t));
export const isDateType = (t) => /^(DATE|TIMESTAMP)/i.test(String(t));

// One job at a time per database file.
const queues = new Map();
function locked(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(key, next.finally(() => { if (queues.get(key) === next) queues.delete(key); }));
  return next;
}

// Opens the document's database, runs fn(connection) and closes it again. In safe mode (the
// default) the connection cannot read or write any file, which is what model-written SQL gets.
export function withDb(dir, fn, { unsafe = false, memory = false } = {}) {
  return locked(memory ? Symbol('mem') : dir, async () => {
    if (!memory) fs.mkdirSync(dir, { recursive: true });
    const inst = await DuckDBInstance.create(memory ? ':memory:' : file(dir), { threads: String(Math.max(2, Math.min(6, os.cpus().length))), memory_limit: '1500MB' });
    const conn = await inst.connect();
    try {
      if (!unsafe) { await conn.run('SET enable_external_access=false'); await conn.run('SET lock_configuration=true'); }
      return await fn(conn);
    } finally {
      try { conn.closeSync(); } catch { /* already closed */ }
      try { inst.closeSync(); } catch { /* already closed */ }
    }
  });
}

// Turns a result into plain rows: numbers, text, true/false, null; dates as ISO text.
function plainRows(reader) {
  const types = reader.columnTypes().map(String);
  const rows = reader.getRowsJson();
  for (const row of rows) for (let i = 0; i < row.length; i++) {
    const v = row[i];
    if (v == null) continue;
    if (isNumericType(types[i])) { const n = Number(v); row[i] = Number.isFinite(n) ? n : null; }
    else if (typeof v === 'object') row[i] = JSON.stringify(v);
    else if (/^TIMESTAMP/i.test(types[i]) && typeof v === 'string') row[i] = v.replace(/(\.\d+)?([+-]\d\d(:\d\d)?)?$/, '').replace(/ 00:00:00$/, '');
  }
  return { columns: reader.columnNames(), types, rows };
}
const read = async (conn, sql) => plainRows(await conn.runAndReadAll(sql));

async function nextTable(conn) {
  const r = await read(conn, "SELECT coalesce(max(try_cast(substr(table_name, 2) AS INTEGER)), 0) FROM information_schema.tables WHERE table_schema = 'main' AND table_name SIMILAR TO 't[0-9]+'");
  return 't' + (Number(r.rows[0][0]) + 1);
}
async function describeTable(conn, table) {
  const cols = await read(conn, `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ${lit(table)} ORDER BY ordinal_position`);
  const n = await read(conn, `SELECT count(*) FROM ${q(table)}`);
  return { table, rows: Number(n.rows[0][0]), columns: cols.rows.map(([name, type]) => ({ name, type })) };
}

// Loads a CSV or TSV file. Types (numbers, dates) are detected from the data.
export function importCsv(dir, csvPath, { header = true } = {}) {
  return withDb(dir, async (conn) => {
    const table = await nextTable(conn);
    const opts = `header=${header}, sample_size=50000, ignore_errors=true, null_padding=true, normalize_names=false`;
    try { await conn.run(`CREATE TABLE ${table} AS SELECT * FROM read_csv(${lit(csvPath)}, ${opts})`); }
    catch { await conn.run(`CREATE TABLE ${table} AS SELECT * FROM read_csv(${lit(csvPath)}, ${opts}, all_varchar=true, strict_mode=false)`); }
    return describeTable(conn, table);
  }, { unsafe: true });
}

// Column facts the model needs to write good questions: type, blanks, distinct values, range, examples.
export function profile(dir, table) {
  return withDb(dir, async (conn) => {
    const s = await read(conn, `SUMMARIZE ${q(table)}`);
    const ix = Object.fromEntries(s.columns.map((c, i) => [c, i]));
    const cols = s.rows.map((r) => ({ name: r[ix.column_name], type: r[ix.column_type], min: r[ix.min], max: r[ix.max], distinct: Number(r[ix.approx_unique]), blanks: Math.round(Number(r[ix.null_percentage]) || 0), avg: r[ix.avg] != null && isNumericType(r[ix.column_type]) ? Number(r[ix.avg]) : undefined }));
    for (const c of cols.filter((c) => /VARCHAR/i.test(c.type) && c.distinct <= 40).slice(0, 12)) {
      const top = await read(conn, `SELECT ${q(c.name)}, count(*) n FROM ${q(table)} WHERE ${q(c.name)} IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 12`);
      c.values = top.rows.map((r) => String(r[0]));
    }
    return cols;
  });
}

export function rows(dir, table, offset = 0, limit = 200) {
  return withDb(dir, async (conn) => read(conn, `SELECT * FROM ${q(table)} LIMIT ${Math.max(1, Math.min(5000, Number(limit) || 200))} OFFSET ${Math.max(0, Number(offset) || 0)}`));
}

// Every row of a table, a chunk at a time (for building the .xlsx or a .csv).
export async function* allRows(dir, table, { max = Infinity } = {}) {
  const step = 20000;
  for (let off = 0; off < max; off += step) {
    const r = await withDb(dir, (conn) => read(conn, `SELECT * FROM ${q(table)} LIMIT ${Math.min(step, max - off)} OFFSET ${off}`));
    for (const row of r.rows) yield row;
    if (r.rows.length < step) return;
  }
}

// `sources`: [{ name (as the model sees it), table }] for stored tables, or
//            [{ name, columns: [{ name, type }], rows }] for small sheets kept in the workbook itself.
async function attach(conn, sources) {
  for (const s of sources) {
    if (s.table) { await conn.run(`CREATE OR REPLACE TEMP VIEW ${q(s.name)} AS SELECT * FROM main.${q(s.table)}`); continue; }
    if (!s.columns?.length) continue;
    await conn.run(`CREATE OR REPLACE TEMP TABLE ${q(s.name)} (${s.columns.map((c) => `${q(c.name)} ${c.type}`).join(', ')})`);
    const val = (v, t) => (v == null || v === '' ? 'NULL' : t === 'DOUBLE' ? (Number.isFinite(Number(v)) ? String(Number(v)) : 'NULL') : t === 'BOOLEAN' ? (v ? 'true' : 'false') : lit(v));
    for (let i = 0; i < s.rows.length; i += 500) {
      const chunk = s.rows.slice(i, i + 500).map((r) => '(' + s.columns.map((c, j) => val(r[j], c.type)).join(',') + ')').join(',');
      if (chunk) await conn.run(`INSERT INTO ${q(s.name)} VALUES ${chunk}`);
    }
  }
}
const friendly = (e) => String(e?.message || e).replace(/\s+/g, ' ').replace(/^.*?(Binder|Parser|Catalog|Conversion|Invalid Input|Permission|Out of Range|IO) Error:/i, '$1 Error:').slice(0, 500);
async function checkSelect(conn, sql) {
  const text = String(sql || '').trim().replace(/;+\s*$/, '');
  if (!text) throw new UserError('The query is empty.');
  let ex;
  try { ex = await conn.extractStatements(text); } catch (e) { throw new UserError(friendly(e)); }
  if (ex.count !== 1) throw new UserError('Only one SELECT statement is allowed per query.');
  let type;
  try { const p = await ex.prepare(0); type = p.statementType; } catch (e) { throw new UserError(friendly(e)); }
  // 1 is SELECT; PIVOT statements report as 27 (MULTI).
  if (type !== 1 && !(type === 27 && /^\s*pivot\b/i.test(text))) throw new UserError('Only read-only SELECT queries are allowed.');
  return text;
}
const withTimeout = async (conn, ms, fn) => { const t = setTimeout(() => { try { conn.interrupt(); } catch { /* finished */ } }, ms); try { return await fn(); } finally { clearTimeout(t); } };

// Runs one read-only question against the workbook's tables.
export function query(dir, sql, sources, { limit = 200, memory = false } = {}) {
  return withDb(dir, async (conn) => {
    await attach(conn, sources);
    const text = await checkSelect(conn, sql);
    try {
      return await withTimeout(conn, 45000, async () => {
        const total = /^\s*(summarize|describe|pivot)/i.test(text) ? null : Number((await read(conn, `SELECT count(*) FROM (${text})`)).rows[0][0]);
        const r = await read(conn, total == null ? text : `SELECT * FROM (${text}) LIMIT ${limit}`);
        return { ...r, total: total ?? r.rows.length };
      });
    } catch (e) { throw new UserError(friendly(e)); }
  }, { memory });
}

// Saves the result of a query as a new stored table.
export function materialize(dir, sql, sources) {
  return withDb(dir, async (conn) => {
    await attach(conn, sources);
    const text = await checkSelect(conn, sql);
    const table = await nextTable(conn);
    try { await withTimeout(conn, 120000, () => conn.run(`CREATE TABLE main.${table} AS SELECT * FROM (${text})`)); } catch (e) { throw new UserError(friendly(e)); }
    return describeTable(conn, table);
  });
}
