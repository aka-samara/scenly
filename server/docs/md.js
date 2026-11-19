// Markdown helpers for text documents: finding sections by heading so edits can touch one part only.
const norm = (s) => String(s || '').toLowerCase().replace(/[*_`~#[\]()]/g, '').replace(/^\s*(\d+(\.\d+)*[.)]?|[ivxlc]+[.)])\s+/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function sections(body) {
  const lines = String(body || '').split('\n');
  const heads = []; let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) return;
    const m = l.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) heads.push({ level: m[1].length, title: m[2].trim(), start: i });
  });
  heads.forEach((h, k) => {
    const next = heads.slice(k + 1).find((x) => x.level <= h.level);
    h.end = next ? next.start : lines.length;       // the section with its sub-sections
    h.ownEnd = heads[k + 1] ? heads[k + 1].start : lines.length; // up to the next heading of any level
  });
  return { lines, heads };
}

export function findSection(body, heading) {
  const { lines, heads } = sections(body);
  const want = norm(heading);
  if (!want) return { lines, heads, hit: null };
  let hit = heads.filter((h) => norm(h.title) === want);
  if (!hit.length) hit = heads.filter((h) => norm(h.title).includes(want) || want.includes(norm(h.title)));
  return { lines, heads, hit: hit[0] || null };
}

export const outline = (body) => sections(body).heads.map((h) => `${'  '.repeat(h.level - 1)}${'#'.repeat(h.level)} ${h.title}`).join('\n');

// Splits a long document at headings into pieces of roughly `size` characters, for work done piece by piece.
export function chunks(body, size = 5000) {
  const { lines, heads } = sections(body);
  const cuts = [0, ...heads.filter((h) => h.level <= 2 && h.start > 0).map((h) => h.start), lines.length];
  const parts = [];
  for (let i = 0; i < cuts.length - 1; i++) { const t = lines.slice(cuts[i], cuts[i + 1]).join('\n'); if (t.trim()) parts.push(t); }
  const out = [];
  for (const p of parts) {
    if (p.length > size * 1.6) {
      // A very long section is split at paragraph breaks.
      let cur = '';
      for (const para of p.split(/\n{2,}/)) { if (cur && cur.length + para.length > size) { out.push(cur); cur = ''; } cur += (cur ? '\n\n' : '') + para; }
      if (cur) out.push(cur);
    } else if (out.length && out.at(-1).length + p.length < size) out[out.length - 1] += '\n' + p;
    else out.push(p);
  }
  return out;
}
