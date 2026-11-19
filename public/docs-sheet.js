// The spreadsheet preview in the studio panel: a real grid with sheet tabs, a formula bar,
// calculated values, charts, and editing by hand (every change becomes a new version).
import { h, icon, api, errToast } from './app.js';

const colName = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const ROW_H = 24, HEAD_W = 44, STEP = 150;
const px = (chars) => Math.round(chars * 7.2 + 10);
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); for (const k of kids.flat()) if (k != null) el.append(k); return el; };

function cssOf(st) {
  const out = [];
  if (st.bold) out.push('font-weight:700'); if (st.italic) out.push('font-style:italic');
  const deco = [st.underline && 'underline', st.strike && 'line-through'].filter(Boolean).join(' '); if (deco) out.push('text-decoration:' + deco);
  if (st.fill) out.push('background-color:' + st.fill); if (st.color) out.push('color:' + st.color);
  if (st.align) out.push('text-align:' + st.align);
  if (st.valign) out.push('vertical-align:' + (st.valign === 'middle' ? 'middle' : st.valign));
  if (st.wrap) out.push('white-space:pre-wrap;word-break:break-word'); if (st.size) out.push(`font-size:${Math.round(st.size * 1.18)}px`);
  if (st.indent) out.push(`padding-left:${6 + st.indent * 10}px`);
  const line = '1px solid #8a8f98';
  if (st.border === 'bottom') out.push('border-bottom:' + line); else if (st.border === 'top') out.push('border-top:' + line);
  else if (st.border === 'medium' || st.border === 'thick') out.push(`border:${st.border === 'thick' ? 2 : 1.5}px solid #55595f`);
  else if (st.border && st.border !== 'none') out.push('border:1px solid #b9bec7');
  if (st.bar != null) out.push(`background-image:linear-gradient(90deg, ${st.barColor}99 ${st.bar}%, transparent ${st.bar}%)`);
  return out.join(';');
}

// ---------- charts (drawn from the same data the Excel chart uses) ----------
const nice = (max) => { if (max <= 0) return 1; const p = 10 ** Math.floor(Math.log10(max)); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const short = (n) => { const a = Math.abs(n); return a >= 1e9 ? +(n / 1e9).toFixed(1) + 'bn' : a >= 1e6 ? +(n / 1e6).toFixed(1) + 'm' : a >= 1e4 ? +(n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k' : String(+n.toFixed(a < 10 ? 2 : a < 100 ? 1 : 0)); };
function chartSvg(ch) {
  const W = ch.width || 520, H = ch.height || 300;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'xl-chart-svg', role: 'img', 'aria-label': ch.title || 'Chart' });
  const top = ch.title ? 34 : 12;
  if (ch.title) svg.append(s('text', { x: W / 2, y: 22, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: '#1a1a22' }, ch.title));
  const pie = ch.type === 'pie' || ch.type === 'doughnut';
  const legendItems = pie ? ch.categories.map((c, i) => ({ name: c, color: ch.colors[i % ch.colors.length] })) : ch.series.map((x) => ({ name: x.name, color: x.color }));
  const tip = (el, text) => { el.append(s('title', {}, text)); return el; };
  if (pie) {
    const vals = (ch.series[0]?.values || []).map((v) => Math.max(0, v || 0)); const total = vals.reduce((a, b) => a + b, 0) || 1;
    const lw = ch.legend ? Math.min(150, W * 0.3) : 0;
    const cx = (W - lw) / 2, cy = top + (H - top - 10) / 2, R = Math.max(20, Math.min((W - lw) / 2, (H - top - 10) / 2) - 8);
    let a = -Math.PI / 2;
    vals.forEach((v, i) => {
      if (!v) return;
      const b = a + (v / total) * Math.PI * 2; const large = b - a > Math.PI ? 1 : 0;
      const p = (ang, r) => `${cx + Math.cos(ang) * r} ${cy + Math.sin(ang) * r}`;
      const hole = ch.type === 'doughnut' ? R * 0.55 : 0;
      const d = v === total ? `M ${p(a, R)} A ${R} ${R} 0 1 1 ${p(a + Math.PI, R)} A ${R} ${R} 0 1 1 ${p(a, R)}${hole ? ` M ${p(a, hole)} A ${hole} ${hole} 0 1 0 ${p(a + Math.PI, hole)} A ${hole} ${hole} 0 1 0 ${p(a, hole)}` : ''}`
        : hole ? `M ${p(a, R)} A ${R} ${R} 0 ${large} 1 ${p(b, R)} L ${p(b, hole)} A ${hole} ${hole} 0 ${large} 0 ${p(a, hole)} Z` : `M ${cx} ${cy} L ${p(a, R)} A ${R} ${R} 0 ${large} 1 ${p(b, R)} Z`;
      svg.append(tip(s('path', { d, fill: ch.colors[i % ch.colors.length], stroke: '#fff', 'stroke-width': 1.5, 'fill-rule': 'evenodd' }), `${ch.categories[i] ?? ''}: ${short(v)} (${Math.round((v / total) * 100)}%)`));
      const mid = (a + b) / 2; if ((v / total) > 0.05) svg.append(s('text', { x: cx + Math.cos(mid) * (hole ? (R + hole) / 2 : R * 0.65), y: cy + Math.sin(mid) * (hole ? (R + hole) / 2 : R * 0.65) + 4, 'text-anchor': 'middle', 'font-size': 11, fill: '#fff', 'font-weight': 600 }, Math.round((v / total) * 100) + '%'));
      a = b;
    });
    if (ch.legend) legendItems.slice(0, 12).forEach((it, i) => { const y = top + 14 + i * 18; svg.append(s('rect', { x: W - lw + 4, y: y - 9, width: 10, height: 10, rx: 2, fill: it.color }), s('text', { x: W - lw + 20, y, 'font-size': 11, fill: '#444' }, String(it.name).slice(0, 20))); });
    return svg;
  }
  const horizontal = ch.type === 'bar' || ch.type === 'stackedBar', stacked = ch.type === 'stackedColumn' || ch.type === 'stackedBar', scatter = ch.type === 'scatter';
  const n = ch.categories.length || 1;
  const legendH = ch.legend ? 24 : 0;
  const m = { l: horizontal ? Math.min(130, 16 + Math.max(...ch.categories.map((c) => String(c).length), 3) * 6.2) : 50, r: 16, t: top, b: 28 + legendH + (ch.xTitle ? 14 : 0) };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const all = stacked ? ch.categories.map((_c, i) => ch.series.reduce((a, x) => a + Math.max(0, x.values[i] || 0), 0)) : ch.series.flatMap((x) => x.values.filter((v) => v != null));
  const lo = Math.min(0, ...all), hi0 = Math.max(0, ...all); const hi = nice(hi0 - lo) + lo > hi0 ? nice(hi0) || 1 : hi0;
  const min = lo < 0 ? -nice(-lo) : 0, max = hi || 1;
  const val = (v) => (v - min) / (max - min || 1);
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    if (horizontal) { const x = m.l + val(v) * pw; svg.append(s('line', { x1: x, x2: x, y1: m.t, y2: m.t + ph, stroke: '#e6e8ec' }), s('text', { x, y: m.t + ph + 14, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#666' }, short(v))); }
    else { const y = m.t + ph - val(v) * ph; svg.append(s('line', { x1: m.l, x2: m.l + pw, y1: y, y2: y, stroke: '#e6e8ec' }), s('text', { x: m.l - 6, y: y + 3.5, 'text-anchor': 'end', 'font-size': 10.5, fill: '#666' }, short(v))); }
  }
  const band = (horizontal ? ph : pw) / n;
  const every = Math.max(1, Math.ceil(n / (horizontal ? ph / 14 : pw / 46)));
  const xs = scatter ? ch.categories.map(Number) : null; const sx = scatter && xs.every(Number.isFinite) ? { lo: Math.min(...xs), hi: Math.max(...xs) } : null;
  ch.categories.forEach((c, i) => {
    if (i % every || scatter) return;
    const label = String(c).length > 14 ? String(c).slice(0, 13) + '…' : String(c);
    if (horizontal) svg.append(s('text', { x: m.l - 6, y: m.t + band * (i + 0.5) + 3.5, 'text-anchor': 'end', 'font-size': 10.5, fill: '#444' }, label));
    else svg.append(s('text', { x: m.l + band * (i + 0.5), y: m.t + ph + 14, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#444' }, label));
  });
  const zero = val(0);
  if (ch.type === 'line' || ch.type === 'area' || scatter) {
    ch.series.forEach((x) => {
      const pts = x.values.map((v, i) => (v == null ? null : [scatter && sx ? m.l + ((xs[i] - sx.lo) / (sx.hi - sx.lo || 1)) * pw : m.l + band * (i + 0.5), m.t + ph - val(v) * ph, v, i])).filter(Boolean);
      if (!pts.length) return;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
      if (ch.type === 'area') svg.append(s('path', { d: `${d} L${pts.at(-1)[0]} ${m.t + ph - zero * ph} L${pts[0][0]} ${m.t + ph - zero * ph} Z`, fill: x.color, opacity: 0.25 }));
      if (!scatter || pts.length < 60) svg.append(s('path', { d, fill: 'none', stroke: x.color, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
      if (pts.length <= 60) for (const p of pts) svg.append(tip(s('circle', { cx: p[0], cy: p[1], r: 3, fill: x.color, stroke: '#fff', 'stroke-width': 1 }), `${x.name} · ${ch.categories[p[3]] ?? ''}: ${short(p[2])}`));
    });
  } else {
    const k = stacked ? 1 : ch.series.length; const inner = band * 0.72, bw = inner / k;
    ch.categories.forEach((c, i) => {
      let acc = 0;
      ch.series.forEach((x, si) => {
        const v = x.values[i]; if (v == null) return;
        const from = stacked ? acc : 0; const to = stacked ? acc + Math.max(0, v) : v; if (stacked) acc = to;
        const a = Math.min(val(from), val(to)), b = Math.max(val(from), val(to));
        const off = band * i + (band - inner) / 2 + (stacked ? 0 : si * bw);
        const r = horizontal ? { x: m.l + a * pw, y: m.t + off, width: Math.max(1, (b - a) * pw), height: Math.max(1, bw - 1) } : { x: m.l + off, y: m.t + ph - b * ph, width: Math.max(1, bw - 1), height: Math.max(1, (b - a) * ph) };
        svg.append(tip(s('rect', { ...r, rx: 1.5, fill: x.color }), `${ch.series.length > 1 ? x.name + ' · ' : ''}${c}: ${short(v)}`));
      });
    });
  }
  svg.append(horizontal ? s('line', { x1: m.l + zero * pw, x2: m.l + zero * pw, y1: m.t, y2: m.t + ph, stroke: '#9aa0aa' }) : s('line', { x1: m.l, x2: m.l + pw, y1: m.t + ph - zero * ph, y2: m.t + ph - zero * ph, stroke: '#9aa0aa' }));
  if (ch.xTitle) svg.append(s('text', { x: m.l + pw / 2, y: H - legendH - 6, 'text-anchor': 'middle', 'font-size': 11, fill: '#555' }, ch.xTitle));
  if (ch.yTitle) svg.append(s('text', { x: 12, y: m.t + ph / 2, 'text-anchor': 'middle', 'font-size': 11, fill: '#555', transform: `rotate(-90 12 ${m.t + ph / 2})` }, ch.yTitle));
  if (ch.legend) { let x = m.l; legendItems.slice(0, 8).forEach((it) => { const label = String(it.name).slice(0, 22); svg.append(s('rect', { x, y: H - 17, width: 10, height: 10, rx: 2, fill: it.color }), s('text', { x: x + 14, y: H - 8, 'font-size': 11, fill: '#444' }, label)); x += 26 + label.length * 6.3; }); }
  return svg;
}

// ---------- the grid ----------
// env: { state (kept between redraws), canEdit, docId, v, save(change, note) }
export function gridPreview(pv, env) {
  const st = env.state;
  let sheet = pv.sheets.find((x) => x.name === st.sheet) || pv.sheets.find((x) => !x.hidden) || pv.sheets[0];
  const wrap = h('div', { class: 'xl-wrap' });
  const nameBox = h('span', { class: 'xl-name' }, '');
  const fx = h('input', { class: 'xl-fx', type: 'text', spellcheck: 'false', placeholder: 'Select a cell to see its value or formula', 'aria-label': 'Cell contents' });
  const bar = h('div', { class: 'xl-bar' }, nameBox, h('span', { class: 'xl-fxi' }, 'fx'), fx);
  const scroller = h('div', { class: 'xl-scroll', tabindex: '0' });
  const tabs = h('div', { class: 'xl-tabs' });
  const note = h('div', { class: 'xl-note' });
  wrap.append(bar, note, scroller, tabs);
  let saving = false, sel = null, cellsAt = new Map(), covered = new Map(), rendered = 0, tbody = null, extraRows = [];

  const drawTabs = () => tabs.replaceChildren(...pv.sheets.map((x) => h('button', { class: 'xl-tab' + (x === sheet ? ' on' : '') + (x.hidden ? ' hid' : ''), title: x.hidden ? 'Hidden sheet' : x.name, style: x.tabColor ? { boxShadow: `inset 0 -3px 0 ${x.tabColor}` } : {}, onclick: () => { st.sheet = x.name; sheet = x; sel = null; st.sel = null; draw(); } }, x.name, x.data ? h('small', {}, ' ' + compact(x.data.rows)) : null, x.charts.length ? icon('chart') : null)));
  const compact = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n)) + ' rows';

  function draw() {
    st.sheet = sheet.name;
    drawTabs();
    cellsAt = new Map(); covered = new Map(); rendered = 0; extraRows = [];
    for (const c of sheet.cells) cellsAt.set(c[0] + ',' + c[1], c);
    for (const [r1, c1, r2, c2] of sheet.merges) for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) covered.set(r + ',' + c, r === r1 && c === c1 ? { rs: r2 - r1 + 1, cs: c2 - c1 + 1 } : null);
    const css = sheet.styles.map(cssOf);
    const cols = Math.max(sheet.maxC + 1, sheet.charts.length ? sheet.maxC + 2 : 0, 6);
    const widths = Array.from({ length: cols }, (_x, i) => px(sheet.widths[i] || 9));
    const table = h('table', { class: 'xl' + (sheet.gridlines ? '' : ' nogrid'), style: { width: HEAD_W + widths.reduce((a, b) => a + b, 0) + 'px', fontFamily: `'${pv.font}', Calibri, Arial, sans-serif` } },
      h('colgroup', {}, h('col', { style: { width: HEAD_W + 'px' } }), widths.map((w) => h('col', { style: { width: w + 'px' } }))),
      h('thead', {}, h('tr', {}, h('th', { class: 'corner' }), widths.map((_w, i) => h('th', {}, colName(i + 1))))));
    tbody = h('tbody');
    table.append(tbody);
    const totalRows = () => sheet.maxR + extraRows.length + (sheet.data ? 0 : 3);
    const rowEl = (r) => {
      const tr = h('tr', {}, h('th', {}, String(r)));
      if (sheet.heights?.[r]) tr.style.height = Math.round(sheet.heights[r] * 1.33) + 'px';
      if (r === 1 && sheet.freeze?.row >= 1) tr.classList.add('frozen');
      const extra = r > sheet.maxR ? extraRows[r - sheet.maxR - 1] : null;
      for (let c = 1; c <= cols; c++) {
        const k = r + ',' + c;
        if (covered.has(k) && !covered.get(k)) continue;
        const cell = cellsAt.get(k);
        const td = document.createElement('td');
        td.dataset.a = k;
        if (cell) { td.textContent = cell[2]; const stl = sheet.styles[cell[3]] || {}; if (cell[2] && !stl.wrap && (!stl.align || stl.align === 'left') && !covered.has(k) && !(cellsAt.get(r + ',' + (c + 1))?.[2])) td.classList.add('spill'); const s2 = css[cell[3]]; if (s2) td.style.cssText = s2; if (cell[6]) { td.classList.add('note'); td.title = cell[6]; } if (cell[2] === '…') td.title = 'Excel calculates this when the file is opened'; }
        else if (extra && c <= extra.length) { const v = extra[c - 1]; td.textContent = v == null ? '' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 6 }) : String(v); if (typeof v === 'number') td.style.textAlign = 'right'; }
        const m = covered.get(k); if (m) { td.colSpan = m.cs; td.rowSpan = m.rs; }
        tr.append(td);
      }
      return tr;
    };
    const more = () => { const to = Math.min(totalRows(), rendered + STEP); const frag = document.createDocumentFragment(); for (let r = rendered + 1; r <= to; r++) frag.append(rowEl(r)); tbody.append(frag); rendered = to; };
    more();
    // Charts float over the grid where Excel puts them.
    const layer = h('div', { class: 'xl-charts' });
    const left = (col) => HEAD_W + widths.slice(0, col - 1).reduce((a, b) => a + b, 0);
    for (const ch of sheet.charts) layer.append(h('div', { class: 'xl-chart', style: { left: left(ch.at.col) + 'px', top: ROW_H + (ch.at.row - 1) * ROW_H + 'px', width: ch.width + 'px', height: ch.height + 'px' } }, chartSvg(ch)));
    const chartsBottom = Math.max(0, ...sheet.charts.map((ch) => ROW_H + (ch.at.row - 1) * ROW_H + ch.height + 30));
    const inner = h('div', { class: 'xl-inner', style: { minHeight: chartsBottom ? chartsBottom + 'px' : '' } }, table, layer);
    scroller.replaceChildren(inner);
    // Rows can be taller than the default, so charts are placed against the real row positions once laid out.
    requestAnimationFrame(() => { [...layer.children].forEach((el, i) => { const tr = tbody.rows[sheet.charts[i].at.row - 1]; if (tr) el.style.top = tr.offsetTop + 'px'; }); const bottom = Math.max(0, ...[...layer.children].map((el) => el.offsetTop + el.offsetHeight + 30)); if (bottom) inner.style.minHeight = bottom + 'px'; });
    scroller.onscroll = () => { st.scroll = { top: scroller.scrollTop, left: scroller.scrollLeft, sheet: sheet.name }; if (rendered < totalRows() && scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 600) more(); else if (sheet.data && rendered >= totalRows() && scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 300) loadMore(); };
    // A large data sheet shows its first rows and loads more as you scroll.
    let loading = false, offset = sheet.data?.shown || 0;
    async function loadMore() {
      if (loading || !sheet.data || offset >= sheet.data.rows) return;
      loading = true;
      try {
        const r = await api(`/api/docs/${env.docId}/rows?v=${env.v}&sheet=${encodeURIComponent(sheet.name)}&offset=${offset}&limit=300`);
        extraRows.push(...r.rows); offset += r.rows.length; more(); info();
      } catch (e) { errToast(e); } finally { loading = false; }
    }
    const info = () => {
      const bits = [];
      if (sheet.data) bits.push(h('span', {}, icon('db'), ` Large data sheet: ${sheet.data.rows.toLocaleString()} rows, ${Math.min(offset, sheet.data.rows).toLocaleString()} loaded. Ask questions about it in the chat; scroll to load more.`));
      else if (sheet.clipped) bits.push(h('span', {}, `Showing the first ${sheet.maxR.toLocaleString()} of ${sheet.clipped.toLocaleString()} rows. The download has all of them.`));
      for (const w of pv.warnings || []) bits.push(h('span', { class: 'warn' }, w));
      note.replaceChildren(...bits); note.hidden = !bits.length;
    };
    info();
    table.onmousedown = (e) => { const td = e.target.closest('td'); if (td) select(td.dataset.a); };
    table.ondblclick = (e) => { if (e.target.closest('td')) startEdit(); };
    if (st.scroll?.sheet === sheet.name) requestAnimationFrame(() => { while (rendered < totalRows() && rendered * ROW_H < st.scroll.top + 800) more(); scroller.scrollTop = st.scroll.top; scroller.scrollLeft = st.scroll.left; });
    if (st.sel?.sheet === sheet.name) select(st.sel.a, true); else { nameBox.textContent = ''; fx.value = ''; fx.disabled = true; }
  }

  const addr = (k) => { const [r, c] = k.split(',').map(Number); return colName(c) + r; };
  const rawOf = (k) => { const c = cellsAt.get(k); return !c ? '' : c[4] ? c[4] : c[5] != null ? String(c[5]) : c[2]; };
  const editable = () => env.canEdit && sheet.editable;
  function select(k, quiet) {
    if (!k) return;
    tbody.querySelector('td.sel')?.classList.remove('sel');
    const td = tbody.querySelector(`td[data-a="${k}"]`);
    sel = k; st.sel = { sheet: sheet.name, a: k };
    td?.classList.add('sel');
    nameBox.textContent = addr(k);
    fx.value = rawOf(k); fx.disabled = !editable(); fx.dataset.was = fx.value;
    fx.title = editable() ? 'Type a value or a formula starting with = and press Enter' : sheet.data ? 'Large data sheets are changed by asking in the chat' : 'Go back to the latest version to edit';
    if (!quiet) td?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function startEdit(first) { if (!sel || !editable()) return; fx.focus(); if (first != null) fx.value = first; else fx.select(); }
  async function commit() {
    if (!sel || !editable() || saving || fx.value === fx.dataset.was) return;
    const a = addr(sel), value = fx.value; saving = true; fx.dataset.was = value; fx.disabled = true;
    try { await env.save({ sheet: sheet.name, cells: { [a]: value } }, `Changed ${a} on ${sheet.name}`); }
    catch (e) { errToast(e); fx.disabled = false; fx.dataset.was = rawOf(sel); fx.focus(); }
    finally { saving = false; }
  }
  fx.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit().then(() => scroller.focus()); }
    else if (e.key === 'Escape') { fx.value = fx.dataset.was || ''; scroller.focus(); }
  };
  fx.onblur = () => { if (fx.value !== (fx.dataset.was || '') && document.activeElement !== fx) commit(); };
  scroller.onkeydown = (e) => {
    if (!sel || e.metaKey || e.ctrlKey || e.altKey) return;
    const [r, c] = sel.split(',').map(Number);
    const go = (dr, dc) => { e.preventDefault(); const k = Math.max(1, r + dr) + ',' + Math.max(1, c + dc); if (tbody.querySelector(`td[data-a="${k}"]`)) select(k); };
    if (e.key === 'ArrowDown' || e.key === 'Enter') go(1, 0); else if (e.key === 'ArrowUp') go(-1, 0); else if (e.key === 'ArrowLeft') go(0, -1); else if (e.key === 'ArrowRight' || e.key === 'Tab') go(0, 1);
    else if (e.key === 'F2') { e.preventDefault(); startEdit(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && editable() && rawOf(sel) !== '') { e.preventDefault(); fx.value = ''; commit(); }
    else if (e.key.length === 1 && editable()) { e.preventDefault(); startEdit(e.key); }
  };
  draw();
  return wrap;
}
