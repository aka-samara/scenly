// Small helpers shared by every document type.
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const clampNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export const oneOf = (v, list, d) => { const s = String(v ?? '').toLowerCase(); return list.find((x) => x.toLowerCase() === s) || d; };
export const words = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

// Runs fn over items with at most `limit` running at once; results keep their order.
export async function pmap(items, fn, limit = 5) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// Generated HTML is shown in a script-less sandbox, and may be downloaded, so active content is removed.
export function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|iframe|object|embed|frame|frameset|applet|base|meta|link|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|iframe|object|embed|frame|frameset|applet|base|meta|link|form|input|button|textarea|select)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href|action)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'>\s]*/gi, '$1=$2#');
}

export class DocError extends Error {
  constructor(message, details) { super(message); this.details = details; }
}
