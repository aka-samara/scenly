// Small SVG charts drawn on the server, so they look the same in the preview and in the PDF.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const PALETTE = ['#2E75B6', '#F28E2B', '#59A14F', '#E15759', '#8E6BBF', '#17BECF', '#EDC948', '#9C755F'];

function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function fmt(v, { prefix = '', suffix = '' } = {}) {
  const a = Math.abs(v); let s;
  if (a >= 1e9) s = (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B'; else if (a >= 1e6) s = (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M'; else if (a >= 1e4) s = (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
  else s = Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: a < 10 ? 2 : 1 });
  return prefix + s.replace(/\.0(?=[kMB]|$)/, '') + suffix;
}

// c: { type, title, labels, series:[{name, values}], colors, width, height, prefix, suffix, values (show value labels), legend, ink, muted, grid }
export function chartSvg(c) {
  const W = Math.max(160, c.width || 520), H = Math.max(110, c.height || 280);
  const type = String(c.type || 'bar').toLowerCase().replace('column', 'bar').replace('donut', 'doughnut');
  const labels = (c.labels || []).map(String);
  const series = (c.series || []).filter((s) => s && Array.isArray(s.values)).map((s) => ({ name: String(s.name || ''), values: s.values.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0)) }));
  if (!series.length || !labels.length) return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="#888">No chart data</text></svg>`;
  const colors = (c.colors?.length ? c.colors : PALETTE);
  const col = (i) => colors[i % colors.length];
  const ink = c.ink || '#1A1A22', muted = c.muted || (c.ink === 'currentColor' ? 'currentColor' : '#6B7280'), grid = c.grid || (c.ink === 'currentColor' ? 'currentColor' : '#E3E6EB');
  // Drawn in the text colour of wherever the chart sits, so it reads on light and dark pages alike.
  const go = c.ink === 'currentColor' && !c.grid ? ' stroke-opacity=".16"' : '', mo = c.ink === 'currentColor' && !c.muted ? ' fill-opacity=".68"' : '';
  const fs = Math.max(10, Math.min(16, W / 36));
  const out = [];
  let top = 8;
  if (c.title) { out.push(`<text x="${W / 2}" y="${fs * 1.5}" text-anchor="middle" font-size="${fs * 1.25}" font-weight="700" fill="${ink}">${esc(c.title)}</text>`); top = fs * 2.6; }
  const pie = type === 'pie' || type === 'doughnut';
  const legendItems = pie ? labels.map((l, i) => [l, col(i)]) : series.length > 1 || c.legend ? series.map((s, i) => [s.name || `Series ${i + 1}`, col(i)]) : [];
  let bottom = H - 6;
  if (legendItems.length && c.legend !== false) {
    // The legend is laid out in rows along the bottom.
    const rows = [[]]; let x = 0; const gap = fs * 1.4;
    for (const [name, color] of legendItems) { const w = fs * 1.5 + String(name).length * fs * 0.56 + gap; if (x + w > W - 16 && rows.at(-1).length) { rows.push([]); x = 0; } rows.at(-1).push({ name, color, w }); x += w; }
    const lh = fs * 1.7; bottom = H - rows.length * lh - 2;
    rows.forEach((row, r) => { let lx = (W - row.reduce((a, b) => a + b.w, 0) + gap) / 2; const y = bottom + r * lh + lh * 0.75; for (const it of row) { out.push(`<rect x="${lx.toFixed(1)}" y="${(y - fs * 0.8).toFixed(1)}" width="${fs}" height="${fs}" rx="2" fill="${it.color}"/><text x="${(lx + fs * 1.4).toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs}" fill="${muted}"${mo}>${esc(it.name)}</text>`); lx += it.w; } });
  }
  if (pie) {
    const vals = series[0].values.map((v) => Math.max(0, v)); const total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2, cy = (top + bottom) / 2, r = Math.max(20, Math.min(W / 2 - 12, (bottom - top) / 2 - 4)), r0 = type === 'doughnut' ? r * 0.58 : 0;
    let a = -Math.PI / 2;
    vals.forEach((v, i) => {
      if (!v) return; const b = a + (v / total) * Math.PI * 2; const large = b - a > Math.PI ? 1 : 0;
      const p = (ang, rad) => `${(cx + Math.cos(ang) * rad).toFixed(2)} ${(cy + Math.sin(ang) * rad).toFixed(2)}`;
      const full = v === total;
      const d = full ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0` + (r0 ? ` M ${cx - r0} ${cy} a ${r0} ${r0} 0 1 1 ${2 * r0} 0 a ${r0} ${r0} 0 1 1 ${-2 * r0} 0` : '')
        : r0 ? `M ${p(a, r)} A ${r} ${r} 0 ${large} 1 ${p(b, r)} L ${p(b, r0)} A ${r0} ${r0} 0 ${large} 0 ${p(a, r0)} Z` : `M ${cx} ${cy} L ${p(a, r)} A ${r} ${r} 0 ${large} 1 ${p(b, r)} Z`;
      out.push(`<path d="${d}" fill="${col(i)}" fill-rule="evenodd" stroke="#fff" stroke-width="1.5"/>`);
      const share = v / total;
      if (share >= 0.06 && c.values !== false) { const mid = (a + b) / 2, lr = r0 ? (r + r0) / 2 : r * 0.66; out.push(`<text x="${(cx + Math.cos(mid) * lr).toFixed(1)}" y="${(cy + Math.sin(mid) * lr + fs * 0.35).toFixed(1)}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#fff">${Math.round(share * 100)}%</text>`); }
      a = b;
    });
    if (r0 && c.center) out.push(`<text x="${cx}" y="${cy + fs * 0.6}" text-anchor="middle" font-size="${fs * 1.7}" font-weight="700" fill="${ink}">${esc(c.center)}</text>`);
    return wrap(W, H, out);
  }
  const all = series.flatMap((s) => s.values); const stacked = /stack/.test(type);
  const sums = labels.map((_l, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0));
  const max = niceMax(Math.max(...(stacked ? sums : all), 0)), min = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(...all)) : 0;
  const horizontal = type === 'hbar';
  const n = labels.length;
  if (horizontal) {
    const lw = Math.min(W * 0.34, Math.max(...labels.map((l) => l.length)) * fs * 0.58 + 10);
    const x0 = lw + 4, x1 = W - fs * 3.2, y0 = top + 2, y1 = bottom - fs * 1.6;
    const sx = (v) => x0 + ((v - min) / (max - min)) * (x1 - x0);
    for (let t = 0; t <= 4; t++) { const v = min + ((max - min) * t) / 4, x = sx(v); out.push(`<line x1="${x.toFixed(1)}" y1="${y0}" x2="${x.toFixed(1)}" y2="${y1}" stroke="${grid}"${go}/><text x="${x.toFixed(1)}" y="${y1 + fs * 1.3}" text-anchor="middle" font-size="${fs * 0.9}" fill="${muted}"${mo}>${esc(fmt(v, c))}</text>`); }
    const band = (y1 - y0) / n, bh = Math.min(band * 0.72, 34) / series.length;
    labels.forEach((l, i) => {
      const cy = y0 + band * (i + 0.5);
      out.push(`<text x="${lw - 2}" y="${(cy + fs * 0.35).toFixed(1)}" text-anchor="end" font-size="${fs}" fill="${ink}">${esc(l.length > 28 ? l.slice(0, 27) + '…' : l)}</text>`);
      series.forEach((s, k) => { const v = s.values[i] || 0; const y = cy - (bh * series.length) / 2 + k * bh; const xa = sx(Math.min(0, v)), xb = sx(Math.max(0, v)); out.push(`<rect x="${xa.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0.5, xb - xa).toFixed(1)}" height="${(bh - 1.5).toFixed(1)}" rx="2" fill="${col(series.length > 1 ? k : 0)}"/>`); if (c.values !== false && series.length === 1) out.push(`<text x="${(xb + 4).toFixed(1)}" y="${(y + bh / 2 + fs * 0.3).toFixed(1)}" font-size="${fs * 0.9}" fill="${muted}"${mo}>${esc(fmt(v, c))}</text>`); });
    });
    return wrap(W, H, out);
  }
  const yw = Math.max(...[min, max].map((v) => fmt(v, c).length)) * fs * 0.6 + 8;
  const x0 = yw, x1 = W - 8, y0 = top + (c.values !== false ? fs : 4), y1 = bottom - fs * 1.9;
  const sy = (v) => y1 - ((v - min) / (max - min)) * (y1 - y0);
  for (let t = 0; t <= 4; t++) { const v = min + ((max - min) * t) / 4, y = sy(v); out.push(`<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}" stroke="${grid}"${go}/><text x="${x0 - 5}" y="${(y + fs * 0.33).toFixed(1)}" text-anchor="end" font-size="${fs * 0.9}" fill="${muted}"${mo}>${esc(fmt(v, c))}</text>`); }
  const band = (x1 - x0) / n; const every = Math.ceil((n * Math.max(...labels.map((l) => Math.min(l.length, 12))) * fs * 0.6) / (x1 - x0));
  labels.forEach((l, i) => { if (i % Math.max(1, every)) return; out.push(`<text x="${(x0 + band * (i + 0.5)).toFixed(1)}" y="${(y1 + fs * 1.35).toFixed(1)}" text-anchor="middle" font-size="${fs * 0.92}" fill="${muted}"${mo}>${esc(l.length > 12 ? l.slice(0, 11) + '…' : l)}</text>`); });
  if (type === 'line' || type === 'area') {
    series.forEach((s, k) => {
      const pts = s.values.slice(0, n).map((v, i) => [x0 + band * (i + 0.5), sy(v)]);
      if (type === 'area') out.push(`<path d="M ${pts[0][0].toFixed(1)} ${sy(0).toFixed(1)} ${pts.map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} L ${pts.at(-1)[0].toFixed(1)} ${sy(0).toFixed(1)} Z" fill="${col(k)}" opacity=".18"/>`);
      out.push(`<polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${col(k)}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`);
      if (n <= 24) pts.forEach((p, i) => { out.push(`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#fff" stroke="${col(k)}" stroke-width="2"/>`); if (c.values === true && series.length === 1) out.push(`<text x="${p[0].toFixed(1)}" y="${(p[1] - 7).toFixed(1)}" text-anchor="middle" font-size="${fs * 0.88}" fill="${muted}"${mo}>${esc(fmt(s.values[i], c))}</text>`); });
    });
  } else {
    const groupW = Math.min(band * 0.74, 90), bw = stacked ? groupW : groupW / series.length;
    labels.forEach((_l, i) => {
      let acc = 0;
      series.forEach((s, k) => {
        const v = s.values[i] || 0; const x = x0 + band * (i + 0.5) - groupW / 2 + (stacked ? 0 : k * bw);
        const ya = stacked ? sy(acc + Math.max(0, v)) : sy(Math.max(0, v)), yb = stacked ? sy(acc) : sy(Math.min(0, v)); acc += Math.max(0, v);
        out.push(`<rect x="${x.toFixed(1)}" y="${ya.toFixed(1)}" width="${(bw - (stacked ? 0 : 2)).toFixed(1)}" height="${Math.max(0.5, yb - ya).toFixed(1)}" rx="${stacked ? 0 : 2}" fill="${col(k)}"/>`);
        if (c.values !== false && series.length === 1 && n <= 14) out.push(`<text x="${(x + bw / 2 - 1).toFixed(1)}" y="${(ya - 4).toFixed(1)}" text-anchor="middle" font-size="${fs * 0.88}" fill="${muted}"${mo}>${esc(fmt(v, c))}</text>`);
      });
    });
  }
  out.push(`<line x1="${x0}" y1="${sy(0).toFixed(1)}" x2="${x1}" y2="${sy(0).toFixed(1)}" stroke="${muted}" stroke-width="1"/>`);
  return wrap(W, H, out);
}
const wrap = (W, H, out) => `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;height:auto" font-family="inherit">${out.join('')}</svg>`;
