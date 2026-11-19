// A1 reference helpers: columns, ranges, and shifting references when rows or columns move.
export const colNum = (letters) => { let n = 0; for (const c of String(letters).toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64); return n; };
export const colName = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
export const MAX_ROWS = 1048576, MAX_COLS = 16384;

// "B3" → { col: 2, row: 3 }; accepts $ signs.
export function parseCell(ref) {
  const m = String(ref || '').trim().match(/^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/);
  if (!m) return null;
  const col = colNum(m[1]), row = Number(m[2]);
  return col >= 1 && col <= MAX_COLS && row >= 1 && row <= MAX_ROWS ? { col, row } : null;
}
// "A1:C9", "B2", "A:A", "2:5" → { c1, r1, c2, r2 } (whole columns/rows use the sheet limits).
export function parseRange(ref) {
  const s = String(ref || '').trim().replace(/\$/g, '').replace(/^.*!/, '');
  let m = s.match(/^([A-Za-z]{1,3})(\d{1,7})(?::([A-Za-z]{1,3})(\d{1,7}))?$/);
  if (m) { const c1 = colNum(m[1]), r1 = +m[2], c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? +m[4] : r1; return { c1: Math.min(c1, c2), r1: Math.min(r1, r2), c2: Math.max(c1, c2), r2: Math.max(r1, r2) }; }
  m = s.match(/^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/);
  if (m) { const a = colNum(m[1]), b = colNum(m[2]); return { c1: Math.min(a, b), r1: 1, c2: Math.max(a, b), r2: MAX_ROWS, wholeCols: true }; }
  m = s.match(/^(\d{1,7}):(\d{1,7})$/);
  if (m) return { c1: 1, r1: Math.min(+m[1], +m[2]), c2: MAX_COLS, r2: Math.max(+m[1], +m[2]), wholeRows: true };
  return null;
}
export const cellName = (col, row) => colName(col) + row;
export const rangeName = (r) => (r.c1 === r.c2 && r.r1 === r.r2 ? cellName(r.c1, r.r1) : `${cellName(r.c1, r.r1)}:${cellName(r.c2, r.r2)}`);
export const quoteSheet = (name) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${String(name).replace(/'/g, "''")}'`);

// Splits a formula into string literals and everything else, so rewrites never touch quoted text.
function segments(formula) {
  const out = []; let i = 0, cur = '';
  const s = String(formula);
  while (i < s.length) {
    if (s[i] === '"') {
      if (cur) { out.push({ code: cur }); cur = ''; }
      let j = i + 1;
      while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { j += 2; continue; } break; } j++; }
      out.push({ str: s.slice(i, j + 1) }); i = j + 1;
    } else cur += s[i++];
  }
  if (cur) out.push({ code: cur });
  return out;
}
const REF = /((?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(.])(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(.]))?|((?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(!.])/g;
const unq = (p) => (p ? p.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'") : null);

// Rewrites the references in `formula` (which lives on sheet `home`) after rows or columns were
// inserted (delta > 0) or deleted (delta < 0) on sheet `target`, starting at row/column `at`.
export function shiftRefs(formula, { home, target, axis, at, delta, grow = false }) {
  if (typeof formula !== 'string' || !formula.startsWith('=')) return formula;
  const same = (prefix) => (unq(prefix) ?? home).toLowerCase() === String(target).toLowerCase();
  const gone = '#REF!';
  const mv = (n, isStart) => {
    if (delta > 0) return n >= at ? n + delta : n;
    const end = at - delta - 1; // last deleted index
    if (n < at) return n;
    if (n > end) return n + delta;
    return isStart ? at : at - 1; // inside the deleted block: clamp to its edge
  };
  return segments(formula).map((seg) => seg.str ?? seg.code.replace(REF, (m, p1, d1, c1, d2, r1, d3, c2, d4, r2, p2, d5, ca, d6, cb, offset, whole) => {
    const before = whole[offset - 1];
    if (before && /[A-Za-z0-9_.]/.test(before)) return m; // part of a longer name such as LOG10 or a defined name
    if (ca) { // whole-column range A:C
      if (!same(p2) || axis !== 'col') return m;
      let a = colNum(ca), b = colNum(cb);
      if (delta < 0 && a >= at && b <= at - delta - 1) return gone;
      a = mv(a, true); b = mv(b, false);
      return `${p2 || ''}${d5}${colName(a)}:${d6}${colName(b)}`;
    }
    if (!same(p1)) return m;
    let a = { c: colNum(c1), r: +r1 }, b = c2 ? { c: colNum(c2), r: +r2 } : null;
    const k = axis === 'col' ? 'c' : 'r';
    const end = at - delta - 1;
    if (delta < 0) {
      if (!b && a[k] >= at && a[k] <= end) return gone;
      if (b && a[k] >= at && b[k] <= end) return gone;
    }
    if (b) { a[k] = mv(a[k], true); b[k] = mv(b[k], false); if (grow && delta > 0 && b[k] === at - 1 && a[k] < at) b[k] += delta; } else a[k] = mv(a[k], true);
    if (a.c < 1 || a.r < 1) return gone;
    return `${p1 || ''}${d1}${colName(a.c)}${d2}${a.r}${b ? `:${d3}${colName(b.c)}${d4}${b.r}` : ''}`;
  })).join('');
}

// Rewrites references to a renamed sheet.
export function renameSheetRefs(formula, from, to) {
  if (typeof formula !== 'string' || !formula.startsWith('=')) return formula;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:'${esc(from.replace(/'/g, "''"))}'|(?<![A-Za-z0-9_.'])${esc(from)})!`, 'gi');
  return segments(formula).map((seg) => seg.str ?? seg.code.replace(re, quoteSheet(to) + '!')).join('');
}

// Names of the functions a formula calls, upper-cased.
export function functionsIn(formula) {
  const out = new Set();
  for (const seg of segments(formula)) if (seg.code) for (const m of seg.code.matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)) out.add(m[1].toUpperCase());
  return [...out];
}
// Sheets a formula points at.
export function sheetsIn(formula) {
  const out = new Set();
  for (const seg of segments(formula)) if (seg.code) for (const m of seg.code.matchAll(/('(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!/g)) out.add(unq(m[0]));
  return [...out];
}
