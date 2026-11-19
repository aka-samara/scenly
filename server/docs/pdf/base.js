// The stylesheet every designed PDF starts from. Pages written separately still match, because they
// all draw on the same variables and classes. The model may add its own CSS on top.
export const SIZES = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A5: [148, 210], A3: [297, 420], A6: [105, 148], Square: [210, 210], Slide: [338.7, 190.5], DL: [99, 210], Card: [85, 55] };

export function pageBox(settings = {}) {
  const p = settings.page || {};
  let [w, h] = SIZES[p.size] || SIZES.A4;
  if (p.width && p.height) { w = p.width; h = p.height; }
  const land = p.orientation === 'landscape' ? true : p.orientation === 'portrait' ? false : w > h;
  if ((land && h > w) || (!land && w > h && p.orientation === 'portrait')) [w, h] = [h, w];
  return { w, h, pad: p.padding ?? Math.max(6, Math.min(16, Math.round(Math.min(w, h) * 0.066))), margin: p.margin ?? 18 };
}

export function baseCss(spec, theme, mode) {
  const st = spec.settings || {}, th = st.theme || {};
  const box = pageBox(st);
  const c = { primary: th.primary || theme.colors.primary, accent: th.accent || theme.colors.accent, text: th.text || theme.colors.text, muted: th.muted || theme.colors.muted || '#5F6672', bg: th.background || '#FFFFFF' };
  const font = th.font || theme.fonts.body, hfont = th.headingFont || theme.fonts.heading;
  const size = th.fontSize || (Math.min(box.w, box.h) < 120 ? 8 : 10.5);
  const screen = mode !== 'print';
  // A dark page colour turns the whole palette round: light text, light headings, cards a shade lighter than the page.
  const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return 1; const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const dark = lum(c.bg) < 0.3;
  if (dark) { if (lum(c.text) < 0.6) c.text = '#F4F4F6'; c.muted = 'rgba(255,255,255,.68)'; }
  const head = dark ? (lum(c.primary) > 0.45 ? c.primary : '#FFFFFF') : c.primary;
  const soft = dark ? 'color-mix(in srgb,#fff 8%,var(--bg))' : 'color-mix(in srgb,var(--accent) 9%,#fff)';
  const line = dark ? 'rgba(255,255,255,.2)' : 'color-mix(in srgb,var(--text) 16%,#fff)';
  return `
@page{size:${box.w}mm ${box.h}mm;margin:0}
:root{--primary:${c.primary};--accent:${c.accent};--text:${c.text};--muted:${c.muted};--bg:${c.bg};--soft:${soft};--hd:${head};--ln:${line};--ink:var(--text);--head:var(--hd);--sub:var(--muted);--eye:var(--accent);--line:var(--ln);--font:'${font}',Calibri,'Helvetica Neue',Arial,sans-serif;--hfont:'${hfont}',Calibri,'Helvetica Neue',Arial,sans-serif;--pw:${box.w}mm;--ph:${box.h}mm;--pad:${box.pad}mm;--gap:5mm;--radius:2.5mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
html{background:${screen ? '#e9eaee' : '#fff'}}
body{font-family:var(--font);font-size:${size}pt;line-height:1.45;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact;${screen ? 'padding:5mm 0 12mm' : ''}}
.pg{position:relative;width:var(--pw);height:var(--ph);overflow:hidden;background:var(--bg);break-after:page;break-inside:avoid;${screen ? 'margin:0 auto 5mm;box-shadow:0 1px 3px rgba(0,0,0,.12),0 6px 22px rgba(0,0,0,.10)' : ''}}
.pg:last-child{break-after:auto}
.pg-in{position:absolute;top:0;left:0;width:100%;height:100%;padding:var(--pad);display:flex;flex-direction:column}
.pg-in>*{flex-shrink:0}
.pg[data-bleed]>.pg-in{padding:0}
.pg.flow{height:auto;overflow:visible;break-inside:auto;padding:0 ${box.margin}mm;${screen ? 'min-height:var(--ph)' : ''}}
.flow-t{width:100%;border-collapse:collapse;table-layout:fixed}.flow-t>thead>tr>td,.flow-t>tfoot>tr>td{height:${box.margin}mm;padding:0;border:0}.flow-t>tbody>tr>td{padding:0;border:0;vertical-align:top}
.pg.flow .pg-in{position:static;height:auto;width:auto;padding:0;display:block}
h1,h2,h3,h4{font-family:var(--hfont);color:var(--head);line-height:1.15;margin:0 0 .45em;font-weight:700}
h1{font-size:2.6em;letter-spacing:-.01em}h2{font-size:1.65em}h3{font-size:1.2em}h4{font-size:1em}
p{margin:0 0 .7em}ul,ol{margin:0 0 .7em;padding-left:1.3em}li{margin:.18em 0}a{color:var(--accent);text-decoration:none}
img{max-width:100%;display:block}svg{max-width:100%}hr{border:0;border-top:.3mm solid var(--line);margin:4mm 0}
.eyebrow{font-size:.8em;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--eye);margin:0 0 .5em}
.lead{font-size:1.25em;line-height:1.4}.muted{color:var(--sub)}.small{font-size:.85em}.tiny{font-size:.72em}.big{font-size:3.4em;font-weight:800;line-height:1;font-family:var(--hfont)}
.center{text-align:center}.right{text-align:right}.upper{text-transform:uppercase;letter-spacing:.08em}.bold{font-weight:700}.nowrap{white-space:nowrap}
.accent{color:var(--accent)}.primary{color:var(--primary)}.white{color:#fff}
.row{display:flex;gap:var(--gap);align-items:stretch}.row.middle{align-items:center}.row.top{align-items:flex-start}.spread{display:flex;justify-content:space-between;align-items:center;gap:var(--gap)}
.col{flex:1 1 0;min-width:0}.col-2{flex:0 0 calc(16.666% - var(--gap))}.col-3{flex:0 0 calc(25% - var(--gap)*.75)}.col-4{flex:0 0 calc(33.333% - var(--gap)*.667)}.col-5{flex:0 0 calc(41.666% - var(--gap)*.6)}.col-6{flex:0 0 calc(50% - var(--gap)*.5)}.col-7{flex:0 0 calc(58.333% - var(--gap)*.4)}.col-8{flex:0 0 calc(66.666% - var(--gap)*.333)}.col-9{flex:0 0 calc(75% - var(--gap)*.25)}
.grid-2,.grid-3,.grid-4{display:grid;gap:var(--gap)}.grid-2{grid-template-columns:repeat(2,1fr)}.grid-3{grid-template-columns:repeat(3,1fr)}.grid-4{grid-template-columns:repeat(4,1fr)}
.stack{display:flex;flex-direction:column;gap:var(--gap)}.grow{flex:1 1 auto!important;min-height:0}.push{margin-top:auto}
.mt-1{margin-top:2mm}.mt-2{margin-top:4mm}.mt-3{margin-top:8mm}.mt-4{margin-top:14mm}.mb-0{margin-bottom:0}.mb-1{margin-bottom:2mm}.mb-2{margin-bottom:4mm}.mb-3{margin-bottom:8mm}
.pad{padding:var(--pad)}.pad-sm{padding:4mm}
.card{background:var(--soft);border-radius:var(--radius);padding:5mm}.card.line{background:#fff;border:.3mm solid var(--line)}.card.white{background:#fff}.card>:last-child{margin-bottom:0}
.band{margin-left:calc(-1*var(--pad));margin-right:calc(-1*var(--pad));padding:6mm var(--pad)}.band.top{margin-top:calc(-1*var(--pad))}.band.bottom{margin-bottom:calc(-1*var(--pad))}
.bg-primary{background:var(--primary)}.bg-accent{background:var(--accent)}.bg-soft{background:var(--soft)}.bg-dark{background:#14181f}.bg-white{background:#fff}
.on-dark,.bg-primary,.bg-accent,.bg-dark{--ink:#fff;--head:#fff;--sub:rgba(255,255,255,.74);--eye:color-mix(in srgb,var(--accent) 45%,#fff);--line:rgba(255,255,255,.28);color:var(--ink)}
.bg-accent{--eye:rgba(255,255,255,.88)}
.card,.bg-soft{--ink:var(--text);--head:var(--hd);--sub:var(--muted);--eye:var(--accent);--line:var(--ln);color:var(--ink)}
.card.white,.card.line,.bg-white,.on-light{--ink:${dark ? '#1B1F27' : 'var(--text)'};--head:${dark ? '#1B1F27' : 'var(--primary)'};--sub:${dark ? '#5F6672' : 'var(--muted)'};--eye:var(--accent);--line:rgba(0,0,0,.14);color:var(--ink)}
.card.bg-primary,.card.bg-accent,.card.bg-dark,.card.glass{--ink:#fff;--head:#fff;--sub:rgba(255,255,255,.74);--eye:rgba(255,255,255,.88);--line:rgba(255,255,255,.28);color:var(--ink)}.card.glass{background:rgba(255,255,255,.12)}
.rule{width:18mm;height:1.2mm;background:var(--accent);border-radius:1mm;margin:0 0 4mm}.center>.rule,.rule.center{margin-left:auto;margin-right:auto}
.badge{display:inline-block;padding:.5mm 2.4mm;border-radius:10mm;background:var(--soft);color:var(--primary);font-size:.78em;font-weight:700;letter-spacing:.04em}
.btn{display:inline-block;padding:2.2mm 6mm;border-radius:10mm;background:var(--accent);color:#fff;font-weight:700}
table{border-collapse:collapse;width:100%}
.tbl th{background:var(--primary);color:#fff;text-align:left;font-weight:600;padding:2mm 3mm;font-size:.92em}.tbl td{padding:2mm 3mm;border-bottom:.25mm solid var(--line);vertical-align:top}.tbl tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--text) 3%,#fff)}
.tbl.plain th{background:transparent;color:var(--muted);border-bottom:.4mm solid var(--text);text-transform:uppercase;font-size:.75em;letter-spacing:.08em}.tbl.plain tbody tr:nth-child(even) td{background:transparent}
.tbl .num,.tbl th.num{text-align:right;font-variant-numeric:tabular-nums}.tbl tr.total td{font-weight:700;border-top:.4mm solid var(--text);border-bottom:0;background:transparent!important}
.stat .num{font-family:var(--hfont);font-size:2.3em;font-weight:800;line-height:1.05;color:var(--head)}.stat .lbl{font-size:.82em;color:var(--sub)}
.kv{display:grid;grid-template-columns:auto 1fr;gap:1.2mm 5mm}.kv>:nth-child(odd){color:var(--sub)}
ul.clean{list-style:none;padding:0}ul.check{list-style:none;padding:0}ul.check li{padding-left:6mm;position:relative}ul.check li::before{content:'✓';position:absolute;left:0;color:var(--accent);font-weight:800}
.dots{display:flex;align-items:baseline;gap:2mm}.dots::after{content:'';order:1;flex:1;border-bottom:.3mm dotted var(--muted);transform:translateY(-1mm)}.dots>:last-child{order:2}
img.cover{width:100%;height:100%;object-fit:cover}img.round{border-radius:50%}.logo{max-height:14mm;max-width:50mm;object-fit:contain}
.abs{position:absolute}.fill{position:absolute;inset:0}.z1{position:relative;z-index:1}
.frame{border:.6mm solid var(--accent);padding:8mm;height:100%}.frame.double{border:1.2mm double var(--accent)}
.sign{border-top:.3mm solid var(--ink);padding-top:1.5mm;min-width:45mm;font-size:.85em;color:var(--sub)}
.cmp{display:block}.cmp.inline{display:inline-block;vertical-align:middle}
.fld{display:block}.fld-l{display:block;font-size:.8em;color:var(--sub);margin-bottom:.8mm}.fld-b{display:block;height:8mm;border:.3mm solid var(--line);border-radius:1mm;background:color-mix(in srgb,var(--accent) 4%,#fff)}.fld-b.multi{height:22mm}.fld-b.check{display:inline-block;width:4.2mm;height:4.2mm;vertical-align:-1mm;margin-right:2mm}.fld.check .fld-l{display:inline;font-size:1em;color:inherit}.fld-b.sig{height:16mm;background:transparent;border:0;border-bottom:.3mm solid var(--text);border-radius:0}
.noimg{display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#eef0f3,#eef0f3 3mm,#e3e6eb 3mm,#e3e6eb 6mm);color:#7a8290;font-size:.8em;min-height:20mm;border-radius:var(--radius)}
`;
}
