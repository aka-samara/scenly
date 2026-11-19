// Number formats: friendly names the model uses → Excel format codes, and display text for the preview.
const SYMBOL = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', AED: 'AED ', SAR: 'SAR ', AUD: 'A$', CAD: 'C$', CHF: 'CHF ', SGD: 'S$', LKR: 'Rs ', PKR: 'Rs ', ZAR: 'R', BRL: 'R$', MXN: 'MX$', KRW: '₩', TRY: '₺', RUB: '₽', NGN: '₦', PHP: '₱', THB: '฿', IDR: 'Rp ', MYR: 'RM ', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ', PLN: 'zł ', NZD: 'NZ$', HKD: 'HK$', BDT: '৳', EGP: 'E£', QAR: 'QAR ', KWD: 'KWD ' };
export const currencySymbol = (c) => { const s = String(c || 'USD').trim(); return SYMBOL[s.toUpperCase()] ?? (s.length <= 4 ? s : '$'); };

const NAMED = (sym) => ({
  general: 'General', text: '@',
  integer: '#,##0', number: '#,##0.00', decimal: '#,##0.00', number1: '#,##0.0', number0: '#,##0', plain: '0', year: '0',
  currency: `"${sym}"#,##0.00;[Red]-"${sym}"#,##0.00`, currency0: `"${sym}"#,##0;[Red]-"${sym}"#,##0`, accounting: `_("${sym}"* #,##0.00_);_("${sym}"* (#,##0.00);_("${sym}"* "-"??_);_(@_)`,
  percent: '0.0%', percent0: '0%', percent2: '0.00%',
  date: 'dd mmm yyyy', shortdate: 'dd/mm/yyyy', usdate: 'mm/dd/yyyy', isodate: 'yyyy-mm-dd', month: 'mmm yyyy', datetime: 'dd mmm yyyy hh:mm', time: 'hh:mm',
  multiple: '0.0"x"', thousands: '#,##0,"k"', millions: '#,##0.0,,"m"',
});
// Friendly name or raw Excel code → { code, kind } where kind drives typing and preview.
export function resolveFormat(f, currency) {
  if (f == null || f === '') return { name: 'general', code: 'General', kind: 'general' };
  const raw = String(f).trim(); const key = raw.toLowerCase().replace(/[\s_-]/g, '');
  const table = NAMED(currencySymbol(currency));
  if (table[key]) return { name: key, code: table[key], kind: /^(currency|accounting)/.test(key) ? 'currency' : /^percent/.test(key) ? 'percent' : /date|month|time/.test(key) ? 'date' : key === 'text' ? 'text' : key === 'general' ? 'general' : 'number' };
  // A raw Excel number format such as 0.00 or #,##0 "units" or yyyy-mm-dd.
  if (/[0#?@]|(^|[^a-z])(d{1,4}|m{1,5}|y{2,4}|h{1,2}|s{1,2})([^a-z]|$)/i.test(raw) && raw.length <= 80) {
    const bare = raw.replace(/"[^"]*"|\[[^\]]*\]/g, '');
    return { name: raw, code: raw, kind: /%/.test(bare) ? 'percent' : /[ymdhs]/i.test(bare) && !/[0#]/.test(bare) ? 'date' : bare === '@' ? 'text' : 'number' };
  }
  return { name: 'general', code: 'General', kind: 'general', unknown: raw };
}

// Excel serial date ↔ ISO date. Excel's day 1 is 1900-01-01 (with its famous leap-year bug, so day 60 does not exist).
const EPOCH = Date.UTC(1899, 11, 30);
export const isoToSerial = (s) => {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return Number.isNaN(ms) ? null : (ms - EPOCH) / 864e5;
};
export const serialToDate = (n) => new Date(EPOCH + Math.round(n * 864e5));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');

function fmtDate(serial, code) {
  const d = serialToDate(serial);
  if (Number.isNaN(d.getTime())) return String(serial);
  const Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds();
  let hadHour = false;
  return code.replace(/"([^"]*)"|\[[^\]]*\]|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM/gi, (t, lit) => {
    if (lit != null) return lit;
    const k = t.toLowerCase();
    if (k === 'yyyy') return Y; if (k === 'yy') return p2(Y % 100);
    if (k === 'mmmm') return new Date(Date.UTC(2000, M, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' });
    if (k === 'mmm') return MONTHS[M];
    if (k === 'mm' || k === 'm') { if (hadHour) { hadHour = false; return k === 'mm' ? p2(mi) : mi; } return k === 'mm' ? p2(M + 1) : M + 1; }
    if (k === 'dddd' || k === 'ddd') return d.toLocaleString('en', { weekday: k === 'dddd' ? 'long' : 'short', timeZone: 'UTC' });
    if (k === 'dd') return p2(D); if (k === 'd') return D;
    if (k === 'hh' || k === 'h') { hadHour = true; return k === 'hh' ? p2(h) : h; }
    if (k === 'ss' || k === 's') return k === 'ss' ? p2(s) : s;
    return '';
  });
}
function fmtNumber(n, code) {
  // Pick the positive / negative / zero section.
  const parts = code.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  let sec = parts[0], neg = false;
  if (n < 0 && parts[1]) { sec = parts[1]; n = Math.abs(n); neg = !/-/.test(sec.replace(/"[^"]*"/g, '')) && false; }
  else if (n === 0 && parts[2]) sec = parts[2];
  else if (n < 0) { neg = true; n = Math.abs(n); }
  sec = sec.replace(/\[[^\]]*\]/g, '').replace(/_.|\*./g, '');
  const lits = []; sec = sec.replace(/"([^"]*)"|\\(.)/g, (_m, a, b) => { lits.push(a ?? b); return '\u0001'; });
  if (/%/.test(sec)) n *= 100;
  const numPart = sec.match(/[#0?][#0?,]*(\.[#0?]+)?,*/);
  if (!numPart) return sec.replace(/\u0001/g, () => lits.shift() ?? '') || String(n);
  const scale = (numPart[0].match(/,+$/) || [''])[0].length; if (scale) n /= 1000 ** scale;
  const decs = (numPart[1] || '').length ? numPart[1].length - 1 : 0;
  const minDecs = ((numPart[1] || '').match(/0/g) || []).length;
  const grouping = /[#0],[#0]/.test(numPart[0]);
  let txt = n.toLocaleString('en-US', { minimumFractionDigits: minDecs, maximumFractionDigits: decs, useGrouping: grouping });
  const out = sec.replace(numPart[0], '\u0002').replace(/\u0001/g, () => lits.shift() ?? '').replace('\u0002', txt);
  return (neg ? '-' : '') + out;
}
// Display text for a value under a format, as close to Excel as the preview needs.
export function display(v, fmt) {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v !== 'number') return String(v);
  const code = fmt?.code || 'General';
  try {
    if (fmt?.kind === 'date') return fmtDate(v, code);
    if (code === 'General' || code === '@') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
    return fmtNumber(v, code);
  } catch { return String(v); }
}
// Turns text such as "$1,200.50", "45%" or "(300)" into a number when a column is numeric.
export function toNumber(s) {
  if (typeof s === 'number') return s;
  let t = String(s).trim(); if (!t) return null;
  let neg = false, pct = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/%$/.test(t)) { pct = true; t = t.slice(0, -1); }
  t = t.replace(/^[-+]?\s*[^\d\-+.(]{1,4}\s*(?=[\d.])/, (m) => (m.trim().startsWith('-') ? '-' : '')).replace(/[,\s]/g, '').replace(/[^\d.eE+-]+$/, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  let n = Number(t); if (neg) n = -n; if (pct) n /= 100;
  return Number.isFinite(n) ? n : null;
}
