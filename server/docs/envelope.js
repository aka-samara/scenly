// Reads the tagged reply a model gives in document mode:
//   <message>…</message>  <document title="…">…</document>  <edit op="…" …>…</edit>
// Models are sloppy, so this accepts missing closing tags, Markdown fences and stray text.

const decode = (s) => String(s).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function parseAttrs(s) {
  const out = {};
  for (const m of String(s || '').matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3]);
  return out;
}

// Removes one Markdown fence wrapped around a whole block.
export function unfence(s) {
  const t = String(s || '').trim();
  const m = t.match(/^```[\w+-]*[ \t]*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : t.replace(/^```[\w+-]*[ \t]*\n/, '').replace(/\n```\s*$/, '');
}

export function parseReply(text) {
  let t = String(text || '').replace(/\r\n/g, '\n');
  const out = { message: '', document: null, edits: [], truncated: false };

  const msg = t.match(/<message>([\s\S]*?)(?:<\/message>|(?=<document\b|<edit\b)|$)/i);
  const docOpen = t.match(/<document\b([^>]*)>/i);
  if (docOpen) {
    const start = docOpen.index + docOpen[0].length;
    const end = t.indexOf('</document>', start);
    out.truncated = end < 0; out.openDocument = end < 0;
    out.document = { attrs: parseAttrs(docOpen[1]), body: unfence(end < 0 ? t.slice(start) : t.slice(start, end)) };
  } else {
    // Attribute values may hold > (for example a comment written as {>>…<<}).
    const re = /<edit\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(?:\/>|>([\s\S]*?)<\/edit>)/gi;
    let m;
    while ((m = re.exec(t))) out.edits.push({ attrs: parseAttrs(m[1]), body: unfence(m[2] || '') });
    // An edit that was cut off before </edit> is dropped, but the caller should know.
    const lastOpen = t.lastIndexOf('<edit');
    if (lastOpen >= 0 && !/<edit\b(?:"[^"]*"|'[^']*'|[^>"'])*?(\/>|>[\s\S]*?<\/edit>)/i.test(t.slice(lastOpen))) out.truncated = true;
  }
  if (msg) out.message = msg[1].trim();
  else {
    const cut = t.search(/<document\b|<edit\b/i);
    out.message = (cut >= 0 ? t.slice(0, cut) : t).replace(/<\/?message>/gi, '').trim();
  }
  out.message = out.message.replace(/^```[\w]*\n?|```$/g, '').trim();
  return out;
}

// Pulls the first JSON value out of text that may have prose or a fence around it, and repairs
// the usual slips: trailing commas, comments, smart quotes, and a reply cut off before the end.
export function looseJson(text) {
  let s = unfence(String(text || '')).trim();
  const first = s.search(/[{[]/);
  if (first < 0) throw new Error('no JSON found');
  s = s.slice(first);
  const attempt = (x) => { try { return { ok: true, value: JSON.parse(x) }; } catch (e) { return { ok: false, error: e }; } };
  let r = attempt(s);
  if (r.ok) return r.value;
  // Keep only the balanced JSON value, in case text follows it.
  const bal = balanced(s);
  if (bal.end > 0) { r = attempt(s.slice(0, bal.end)); if (r.ok) return r.value; }
  let fixed = (bal.end > 0 ? s.slice(0, bal.end) : s)
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
  r = attempt(fixed);
  if (r.ok) return r.value;
  // Cut off mid-way: close what is still open.
  const b2 = balanced(fixed);
  if (b2.end < 0) {
    let tail = fixed;
    if (b2.inString) tail += '"';
    tail = tail.replace(/,\s*$/, '').replace(/:\s*$/, ': null').replace(/,\s*"[^"]*"\s*$/, (m) => (/^\s*,\s*"[^"]*"\s*$/.test(m) && b2.stack.at(-1) === '{' ? '' : m));
    tail += b2.stack.reverse().map((c) => (c === '{' ? '}' : ']')).join('');
    r = attempt(tail.replace(/,\s*([}\]])/g, '$1'));
    if (r.ok) return r.value;
  }
  throw new Error('invalid JSON: ' + r.error.message);
}

function balanced(s) {
  const stack = []; let inString = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') { stack.pop(); if (!stack.length) return { end: i + 1, stack, inString }; }
  }
  return { end: -1, stack, inString };
}
