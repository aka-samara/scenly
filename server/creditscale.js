// One-time change of the credit unit (2026-11-19): 1 credit went from $0.01 to $0.001, so every stored credit
// amount is multiplied by 10 and everyone keeps exactly the value they had. server/db.js runs this once when it
// loads a database that has not been converted yet, and keeps a copy of the file from before.
export const CREDIT_SCALE = 10;

// Fields that hold a number of credits, per collection. Dollar amounts (usd, amountUsd, fromPrice, toPrice) stay.
const FIELDS = {
  users: ['credits'],
  conversations: ['credits'],          // credits shown under each reply
  ledger: ['credits', 'balance'],
  tasks: ['reserved', 'credits'],
  payments: ['credits'],
  generations: ['credits'],
  jobs: ['credits', 'reserved', 'cap'], // waiting and finished background jobs (payload and result)
  holds: ['amount', 'charged'],
  vprojects: ['credits'],              // what each scene version cost
  billing: ['extraCredits'],
  prosessions: ['credits', 'perSecond'], // saved Studio Pro estimates
};
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const TEXT = /(\d[\d,]*(?:\.\d+)?)(\s+credits\b)/g; // "Credit pack, 5,500 credits" in old receipts and history lines
const scaleText = (s, k) => s.replace(TEXT, (_m, n, tail) => { const v = Number(n.replace(/,/g, '')); return Number.isFinite(v) ? r4(v * k).toLocaleString('en-US') + tail : n + tail; });

function walk(node, keys, k, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) { for (const x of node) walk(x, keys, k, depth + 1); return; }
  for (const [key, v] of Object.entries(node)) {
    if (typeof v === 'number') { if (keys.includes(key) && Number.isFinite(v)) node[key] = r4(v * k); }
    else walk(v, keys, k, depth + 1);
  }
}

/** Multiplies every stored credit amount by k, in place. Returns true when it changed the database. */
export function scaleCredits(db, k = CREDIT_SCALE) {
  if (db.creditScale === k) return false;
  for (const [coll, keys] of Object.entries(FIELDS)) walk(db[coll], keys, k);
  for (const coll of ['ledger', 'payments']) for (const row of db[coll] || []) if (typeof row.desc === 'string') row.desc = scaleText(row.desc, k);
  db.creditScale = k;
  return true;
}
