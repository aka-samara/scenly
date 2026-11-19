// Opens an uploaded .pptx: the text, tables, charts, pictures and speaker notes of every slide, and
// the deck's look (slide size, theme colours and fonts, backgrounds, logo and other fixed artwork,
// and where titles and text sit) so new slides match the original.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { storeImage } from '../../files.js';
import { mix, lum } from './layout.js';

const EMU = 914400;
const kids = (n, name) => { const out = []; for (let c = n?.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (!name || c.nodeName === name)) out.push(c); return out; };
const kid = (n, name) => kids(n, name)[0] || null;
const find = (n, ...names) => { let c = n; for (const nm of names) { c = kid(c, nm); if (!c) return null; } return c; };
const all = (n, name) => (n ? Array.from(n.getElementsByTagName(name)) : []);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };

export async function importPptx(file, { user } = {}) {
  let zip;
  try { zip = await JSZip.loadAsync(fs.readFileSync(file.path)); } catch { throw new Error('this file is not a PowerPoint .pptx file'); }
  const cache = new Map();
  const xml = async (p) => { if (cache.has(p)) return cache.get(p); const f = zip.file(p); const d = f ? new DOMParser({ onError: () => {} }).parseFromString(await f.async('string'), 'text/xml') : null; cache.set(p, d); return d; };
  const rels = async (p) => {
    const d = await xml(`${path.posix.dirname(p)}/_rels/${path.posix.basename(p)}.rels`); const out = {};
    for (const r of all(d, 'Relationship')) { const t = r.getAttribute('Target') || ''; out[r.getAttribute('Id')] = { type: (r.getAttribute('Type') || '').split('/').pop(), target: r.getAttribute('TargetMode') === 'External' ? null : t.startsWith('/') ? t.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(p), t)) }; }
    return out;
  };
  const pres = await xml('ppt/presentation.xml'); if (!pres) throw new Error('this file is not a PowerPoint .pptx file');
  const presRels = await rels('ppt/presentation.xml');
  const sz = all(pres, 'p:sldSz')[0]; const W = (Number(sz?.getAttribute('cx')) || 12192000) / EMU, H = (Number(sz?.getAttribute('cy')) || 6858000) / EMU;
  const slidePaths = all(pres, 'p:sldId').map((n) => presRels[n.getAttribute('r:id')]?.target).filter(Boolean);
  if (!slidePaths.length) throw new Error('this deck has no slides');
  const masterPath = presRels[all(pres, 'p:sldMasterId')[0]?.getAttribute('r:id')]?.target || 'ppt/slideMasters/slideMaster1.xml';
  const master = await xml(masterPath); const masterRels = await rels(masterPath);
  const themePath = Object.values(masterRels).find((r) => r.type === 'theme')?.target || 'ppt/theme/theme1.xml';
  const theme = await xml(themePath);

  // ----- colours -----
  const scheme = {}; for (const c of kids(all(theme, 'a:clrScheme')[0])) { const v = kid(c, 'a:srgbClr')?.getAttribute('val') || kid(c, 'a:sysClr')?.getAttribute('lastClr'); if (v) scheme[c.nodeName.replace('a:', '')] = '#' + v.toUpperCase(); }
  const cmapNode = all(master, 'p:clrMap')[0]; const cmap = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }; if (cmapNode) for (const a of Array.from(cmapNode.attributes)) cmap[a.name] = a.value;
  const schemeColor = (name) => scheme[cmap[name] || name] || scheme[name] || null;
  // The colour a fill or text node names, with its tint or shade applied.
  const colorOf = (n) => {
    if (!n) return null; const s = kid(n, 'a:srgbClr'), sc = kid(n, 'a:schemeClr'), sy = kid(n, 'a:sysClr'); let c = null, node = null;
    if (s) { c = '#' + s.getAttribute('val').toUpperCase(); node = s; } else if (sc) { c = schemeColor(sc.getAttribute('val')); node = sc; } else if (sy) { c = '#' + (sy.getAttribute('lastClr') || '000000').toUpperCase(); node = sy; }
    if (!c || !/^#[0-9A-F]{6}$/.test(c)) return null;
    for (const m of kids(node)) { const v = Number(m.getAttribute('val')) / 100000; if (m.nodeName === 'a:lumMod') c = mix('#000000', c, Math.min(1, v)); else if (m.nodeName === 'a:lumOff') c = mix(c, '#FFFFFF', Math.min(1, v)); else if (m.nodeName === 'a:tint') c = mix('#FFFFFF', c, v); else if (m.nodeName === 'a:shade') c = mix('#000000', c, v); }
    return c;
  };
  const alphaOf = (n) => { const a = all(n, 'a:alpha')[0]; return a ? Number(a.getAttribute('val')) / 100000 : null; };
  const fonts = { heading: all(theme, 'a:majorFont')[0] && kid(all(theme, 'a:majorFont')[0], 'a:latin')?.getAttribute('typeface'), body: all(theme, 'a:minorFont')[0] && kid(all(theme, 'a:minorFont')[0], 'a:latin')?.getAttribute('typeface') };
  const fontName = (f) => (!f ? null : f === '+mj-lt' ? fonts.heading : f === '+mn-lt' ? fonts.body : f);

  // ----- pictures -----
  const stored = new Map(); let kept = 0;
  const picture = async (target) => {
    if (!target || !user) return null; if (stored.has(target)) return stored.get(target);
    const ext = target.split('.').pop().toLowerCase(); const f = zip.file(target); let id = null;
    if (f && MIME[ext] && kept < 80) { const buf = await f.async('nodebuffer'); if (buf.length < 12 * 1024 * 1024) { id = `file:${storeImage(user, path.posix.basename(target), MIME[ext], buf).id}`; kept++; } }
    stored.set(target, id); return id;
  };
  const darkPicture = async (target) => { try { const img = await loadImage(await zip.file(target).async('nodebuffer')); const c = createCanvas(24, 14); const g = c.getContext('2d'); g.drawImage(img, 0, 0, 24, 14); const d = g.getImageData(0, 0, 24, 14).data; let t = 0; for (let i = 0; i < d.length; i += 4) t += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return t / (d.length / 4) / 255 < 0.45; } catch { return false; } };

  // ----- geometry -----
  const xfrm = (n) => { const x = all(n, 'a:xfrm')[0] || all(n, 'p:xfrm')[0]; const off = kid(x, 'a:off'), ext = kid(x, 'a:ext'); return off && ext ? { x: Number(off.getAttribute('x')) / EMU, y: Number(off.getAttribute('y')) / EMU, w: Number(ext.getAttribute('cx')) / EMU, h: Number(ext.getAttribute('cy')) / EMU } : null; };
  const phOf = (sp) => { const ph = all(kid(sp, 'p:nvSpPr') || kid(sp, 'p:nvPicPr') || kid(sp, 'p:nvGraphicFramePr') || sp, 'p:ph')[0]; return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') || '' } : null; };
  const isTitle = (ph) => ph && (ph.type === 'title' || ph.type === 'ctrTitle');
  const within = (g, b) => (g ? { x: g.x + (b.x - g.cx) * g.sx, y: g.y + (b.y - g.cy) * g.sy, w: b.w * g.sx, h: b.h * g.sy } : b);
  const groupOf = (grp, outer) => { const x = find(grp, 'p:grpSpPr', 'a:xfrm'); const off = kid(x, 'a:off'), ext = kid(x, 'a:ext'), co = kid(x, 'a:chOff'), ce = kid(x, 'a:chExt'); if (!off || !ext) return outer; const b = within(outer, { x: off.getAttribute('x') / EMU, y: off.getAttribute('y') / EMU, w: ext.getAttribute('cx') / EMU, h: ext.getAttribute('cy') / EMU }); const cw = (Number(ce?.getAttribute('cx')) || ext.getAttribute('cx')) / EMU, ch = (Number(ce?.getAttribute('cy')) || ext.getAttribute('cy')) / EMU; return { x: b.x, y: b.y, cx: (Number(co?.getAttribute('x')) || 0) / EMU, cy: (Number(co?.getAttribute('y')) || 0) / EMU, sx: cw ? b.w / cw : 1, sy: ch ? b.h / ch : 1 }; };

  // A plain drawn shape (bar, block, circle, line) as fixed artwork.
  const shapeDecor = (n, b) => {
    const sp = kid(n, 'p:spPr'); const prst = kid(sp, 'a:prstGeom')?.getAttribute('prst') || (n.nodeName === 'p:cxnSp' ? 'line' : '');
    const fill = kid(sp, 'a:solidFill'); const grad = kid(sp, 'a:gradFill'); const ln = kid(sp, 'a:ln'); const lnc = ln && !kid(ln, 'a:noFill') ? colorOf(kid(ln, 'a:solidFill')) : null;
    const fc = fill ? colorOf(fill) : grad ? colorOf(all(grad, 'a:gs')[0]) : null;
    if (/^(line|straightConnector1)$/.test(prst) && lnc) return { kind: 'line', ...b, line: lnc, lineW: Math.max(0.5, Number(ln.getAttribute('w') || 9525) / 12700) };
    if (fc && /^(rect|roundRect|ellipse|snip|round|flowChart)/.test(prst || 'rect') && !kid(sp, 'a:custGeom')) return { kind: /ellipse/.test(prst) ? 'ellipse' : 'rect', ...b, fill: fc, ...(alphaOf(fill || grad) != null ? { alpha: alphaOf(fill || grad) } : {}), ...(/round/.test(prst) ? { radius: Math.min(b.w, b.h) * 0.12 } : {}) };
    return null;
  };

  // ----- the fixed artwork and placeholders of a master or layout -----
  const partInfo = async (doc, p) => {
    if (!doc) return null; const r = await rels(p); const out = { decor: [], ph: {}, bg: null, showMaster: (doc.documentElement.getAttribute('showMasterSp') || '1') !== '0', type: doc.documentElement.getAttribute('type') || '' };
    const bg = all(doc, 'p:bg')[0];
    if (bg) {
      const pr = kid(bg, 'p:bgPr'), ref = kid(bg, 'p:bgRef');
      if (pr && kid(pr, 'a:blipFill')) { const t = r[all(pr, 'a:blip')[0]?.getAttribute('r:embed')]?.target; const id = await picture(t); if (id) out.bg = { image: id, dark: await darkPicture(t), color: '#FFFFFF' }; }
      else if (pr && kid(pr, 'a:solidFill')) { const c = colorOf(kid(pr, 'a:solidFill')); if (c) out.bg = { color: c }; }
      else if (pr && kid(pr, 'a:gradFill')) { const stops = all(kid(pr, 'a:gradFill'), 'a:gs').map((g) => colorOf(g)).filter(Boolean); if (stops.length) out.bg = { color: stops.length > 1 ? mix(stops[0], stops.at(-1), 0.5) : stops[0] }; }
      else if (ref) { const c = colorOf(ref); if (c) out.bg = { color: c }; }
    }
    const walk = async (tree, g) => {
      for (const n of kids(tree)) {
        if (n.nodeName === 'p:grpSp') { await walk(n, groupOf(n, g)); continue; }
        const box0 = xfrm(n); const ph = phOf(n);
        if (n.nodeName === 'p:pic' && !ph && box0) { const id = await picture(r[all(n, 'a:blip')[0]?.getAttribute('r:embed')]?.target); if (id) out.decor.push({ kind: 'image', src: id, fit: 'fill', ...within(g, box0) }); continue; }
        if (n.nodeName !== 'p:sp' && n.nodeName !== 'p:cxnSp') continue;
        if (ph) {
          const key = isTitle(ph) ? 'title' : ph.type === 'subTitle' ? 'sub' : ph.type === 'body' || ph.type === 'obj' ? (out.ph.body ? 'body2' : 'body') : null; if (!key) continue;
          const lst = find(n, 'p:txBody', 'a:lstStyle', 'a:lvl1pPr'); const p1 = find(n, 'p:txBody', 'a:p'); const def = kid(lst, 'a:defRPr') || kid(kid(p1, 'a:pPr'), 'a:defRPr') || kid(kid(p1, 'a:r'), 'a:rPr') || kid(p1, 'a:endParaRPr'); const bp = find(n, 'p:txBody', 'a:bodyPr');
          out.ph[key] = { ...(box0 ? within(g, box0) : {}), size: def?.getAttribute('sz') ? Number(def.getAttribute('sz')) / 100 : undefined, bold: def?.getAttribute('b') ? def.getAttribute('b') === '1' : undefined, color: colorOf(kid(def, 'a:solidFill')) || undefined, align: { ctr: 'center', r: 'right', l: 'left' }[lst?.getAttribute('algn')] || undefined, valign: { ctr: 'middle', b: 'bottom', t: 'top' }[bp?.getAttribute('anchor')] || undefined, font: fontName(kid(def, 'a:latin')?.getAttribute('typeface')) || undefined };
          continue;
        }
        if (!box0) continue; const d = shapeDecor(n, within(g, box0)); if (d) out.decor.push(d);
      }
    };
    await walk(all(doc, 'p:spTree')[0], null);
    out.decor = out.decor.filter((d) => d.w >= 0 && d.h >= 0 && d.x < W && d.y < H).slice(0, 24);
    return out;
  };
  const M = await partInfo(master, masterPath);
  const txStyle = (name) => { const lv = find(all(master, 'p:txStyles')[0], name, 'a:lvl1pPr'); const def = kid(lv, 'a:defRPr'); return { size: def?.getAttribute('sz') ? Number(def.getAttribute('sz')) / 100 : undefined, bold: def?.getAttribute('b') === '1', color: colorOf(kid(def, 'a:solidFill')) || undefined, align: { ctr: 'center', r: 'right', l: 'left' }[lv?.getAttribute('algn')] || undefined, font: fontName(kid(def, 'a:latin')?.getAttribute('typeface')) || undefined }; };
  const tStyle = txStyle('p:titleStyle'), bStyle = txStyle('p:bodyStyle');
  const layoutPaths = Object.values(masterRels).filter((r) => r.type === 'slideLayout').map((r) => r.target);
  const layouts = []; for (const p of layoutPaths.slice(0, 30)) { const d = await xml(p); const info = await partInfo(d, p); if (info) layouts.push({ path: p, ...info }); }
  // Which layouts the deck actually uses most, so the cloned look follows them.
  const used = new Map(); const slideLayout = [];
  for (const sp of slidePaths) { const lp = Object.values(await rels(sp)).find((r) => r.type === 'slideLayout')?.target; slideLayout.push(lp); if (lp) used.set(lp, (used.get(lp) || 0) + 1); }
  const pick = (types, fallback) => layouts.filter((l) => types.includes(l.type)).sort((a, b) => (used.get(b.path) || 0) - (used.get(a.path) || 0))[0] || fallback;
  const contentL = pick(['obj', 'tx', 'title', 'titleOnly'].slice(0, 2), null) || layouts.filter((l) => l.ph.title && l.ph.body && l.type !== 'title' && l.type !== 'secHead').sort((a, b) => (used.get(b.path) || 0) - (used.get(a.path) || 0))[0] || null;
  const coverL = pick(['title'], null), sectionL = pick(['secHead'], coverL);
  const bgText = scheme[cmap.tx1] || '#1A1A22', bgBase = scheme[cmap.bg1] || '#FFFFFF';
  const kindOf = (L, base) => {
    if (!L && !base) return null;
    const bg = L?.bg || M.bg || { color: bgBase }; const dark = bg.image ? !!bg.dark : lum(bg.color) < 0.4;
    const merge = (key, style) => { const a = M.ph[key] || {}, b = L?.ph[key] || {}; const o = { ...style, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v != null)), ...Object.fromEntries(Object.entries(b).filter(([, v]) => v != null)) }; return o.x != null && o.w > 0.5 && o.h > 0.2 ? o : null; };
    const title = merge('title', tStyle), body = merge('body', bStyle), sub = L?.ph.sub ? merge('sub', { ...bStyle, size: undefined }) : L?.type === 'secHead' && L.ph.body ? merge('body', { ...bStyle, size: undefined }) : null;
    const fixText = (t) => { if (!t) return t; if (t.color && Math.abs(lum(t.color) - (bg.image ? (dark ? 0.1 : 0.95) : lum(bg.color))) < 0.25) delete t.color; t.size = t.size ? Math.max(12, Math.min(66, t.size)) : undefined; return t; };
    return { bg: bg.image ? { image: bg.image, color: dark ? '#111318' : '#FFFFFF' } : { color: bg.color }, dark, decor: [...(L && !L.showMaster ? [] : M.decor), ...(L?.decor || [])], title: fixText(title), body: fixText(body), sub: fixText(sub) };
  };
  const tContent = kindOf(contentL, true), tCover = kindOf(coverL, false), tSection = kindOf(sectionL, false);
  // A body placeholder that leaves no room, or a title box that is the cover's, is not usable for content slides.
  if (tContent?.body && tContent.title && tContent.body.y < tContent.title.y + 0.3) tContent.body = null;
  const titleColor = tContent?.title?.color || tStyle.color || schemeColor('tx1');
  const vivid = (c) => c && lum(c) > 0.08 && lum(c) < 0.85;
  const primary = vivid(titleColor) ? titleColor : vivid(scheme.dk2) ? scheme.dk2 : scheme.accent1 || '#1F3A5F';
  const accent = scheme.accent1 && scheme.accent1 !== primary ? scheme.accent1 : scheme.accent2 || primary;
  const template = { w: Math.round(W * 1000) / 1000, h: Math.round(H * 1000) / 1000, source: file.name, colors: { primary, accent, background: tContent?.bg?.color || bgBase, text: bgText, chart: [1, 2, 3, 4, 5, 6].map((i) => scheme['accent' + i]).filter(Boolean) }, fonts: { heading: fonts.heading || undefined, body: fonts.body || undefined }, bg: tContent?.bg || { color: bgBase }, content: tContent || undefined, title: tCover || undefined, section: tSection || undefined };
  for (const k of ['content', 'title', 'section']) if (template[k]) for (const key of ['title', 'body', 'sub']) if (template[k][key]) for (const f of ['x', 'y', 'w', 'h']) if (template[k][key][f] != null) template[k][key][f] = Math.round(template[k][key][f] * 1000) / 1000;

  // ----- the slides -----
  const esc = (t) => String(t).replace(/([*_`|\\])/g, '\\$1');
  const paraText = (p, plainOnly) => { let out = ''; for (const n of kids(p)) { if (n.nodeName === 'a:br') { out += ' '; continue; } if (n.nodeName !== 'a:r' && n.nodeName !== 'a:fld') continue; const t = kid(n, 'a:t')?.textContent || ''; if (!t) continue; const rp = kid(n, 'a:rPr'); const b = rp?.getAttribute('b') === '1', i = rp?.getAttribute('i') === '1'; const core = plainOnly ? t.trim() : esc(t.trim()); if (plainOnly) { out += t; continue; } const lead = t.match(/^\s*/)[0], tail = t.match(/\s*$/)[0]; out += core ? `${lead}${b ? '**' : i ? '*' : ''}${core}${b ? '**' : i ? '*' : ''}${tail}` : t; } return out.replace(/\*\*\*\*/g, '').replace(/\s+/g, ' ').trim(); };
  const paras = (sp) => kids(kid(sp, 'p:txBody'), 'a:p').map((p) => { const pr = kid(p, 'a:pPr'); return { text: paraText(p), level: Math.min(2, Number(pr?.getAttribute('lvl')) || 0), none: !!kid(pr, 'a:buNone'), num: !!kid(pr, 'a:buAutoNum'), bullet: !!(kid(pr, 'a:buChar') || kid(pr, 'a:buAutoNum')) }; }).filter((p) => p.text);
  const chartTag = async (target) => {
    const d = await xml(target); if (!d) return ''; const plot = all(d, 'c:plotArea')[0]; if (!plot) return '';
    const node = kids(plot).find((n) => /Chart$/.test(n.nodeName)); if (!node) return '';
    const base = node.nodeName.replace('c:', '').replace(/3D/, ''); const dir = kid(node, 'c:barDir')?.getAttribute('val'); const grp = kid(node, 'c:grouping')?.getAttribute('val') || '';
    const type = base === 'barChart' ? (/stack/i.test(grp) ? 'stacked' : dir === 'bar' ? 'hbar' : 'bar') : base === 'lineChart' ? 'line' : base === 'areaChart' ? 'area' : base === 'pieChart' ? 'pie' : base === 'doughnutChart' ? 'doughnut' : 'bar';
    const pts = (n) => all(n, 'c:pt').sort((a, b) => a.getAttribute('idx') - b.getAttribute('idx')).map((pt) => kid(pt, 'c:v')?.textContent ?? '');
    const sers = kids(node, 'c:ser').slice(0, 8).map((s) => ({ name: all(kid(s, 'c:tx'), 'c:v')[0]?.textContent || '', labels: pts(kid(s, 'c:cat')), values: pts(kid(s, 'c:val')).map((v) => Math.round(Number(v) * 1000) / 1000 || 0) })).filter((s) => s.values.length);
    if (!sers.length) return ''; const clean = (t) => String(t).replace(/[",;:|<>]/g, ' ').trim();
    const title = all(kid(all(d, 'c:chart')[0], 'c:title'), 'a:t').map((t) => t.textContent).join('');
    return `<chart type="${type}"${title ? ` title="${clean(title)}"` : ''} labels="${sers[0].labels.map(clean).join(',')}" series="${sers.map((s) => `${clean(s.name) || 'Series'}: ${s.values.join(',')}`).join('; ')}"/>`;
  };
  const slides = []; let pics = 0, charts = 0, skipped = 0;
  // First pass: what is on every slide. Second pass: decide what is content and what is the deck's fixed look.
  const round = (v, q) => Math.round((v || 0) * q) / q; const boxSig = (b, q = 4) => (b ? `${round(b.x, q)},${round(b.y, q)},${round(b.w, q)},${round(b.h, q)}` : '');
  const sizeOf = (n) => Math.max(0, ...all(n, 'a:rPr').map((x) => Number(x.getAttribute('sz')) / 100 || 0), ...all(n, 'a:endParaRPr').map(() => 0));
  const raw = [];
  for (let si = 0; si < Math.min(slidePaths.length, 60); si++) {
    const sp = slidePaths[si]; const doc = await xml(sp); if (!doc) continue; const r = await rels(sp);
    const L = layouts.find((l) => l.path === slideLayout[si]);
    const S = { si, L, r, title: '', subtitle: '', texts: [], visuals: [], art: [], full: null, bg: null, titleBox: null };
    const sbg = find(doc.documentElement, 'p:cSld', 'p:bg', 'p:bgPr'); if (sbg && kid(sbg, 'a:solidFill')) S.bg = colorOf(kid(sbg, 'a:solidFill'));
    const walk = async (tree, g) => {
      for (const n of kids(tree)) {
        if (n.nodeName === 'p:grpSp') { await walk(n, groupOf(n, g)); continue; }
        const ph = phOf(n); const b0 = xfrm(n); const b = b0 ? within(g, b0) : null;
        if (n.nodeName === 'p:sp' || n.nodeName === 'p:cxnSp') {
          const ps = paras(n);
          if (!ps.length) { const d = !ph && b ? shapeDecor(n, b) : null; if (d) S.art.push({ sig: `${d.kind}|${d.fill || d.line}|${boxSig(b)}`, d }); continue; }
          if (isTitle(ph) && !S.title) { S.title = kids(kid(n, 'p:txBody'), 'a:p').map((p) => paraText(p, true)).filter(Boolean).join(' '); continue; }
          if ((ph?.type === 'subTitle' || (ph && L?.type === 'secHead' && ps.length === 1)) && !S.subtitle) { S.subtitle = ps.map((p) => p.text).join(' '); continue; }
          if (ph && /^(dt|ftr|sldNum|hdr)$/.test(ph.type)) continue;
          const plainText = kids(kid(n, 'p:txBody'), 'a:p').map((p) => paraText(p, true)).filter(Boolean).join(' ');
          if (all(n, 'a:fld').length && plainText.length < 12) continue;   // a slide number or date field
          const rp = all(n, 'a:rPr')[0];
          S.texts.push({ ph: !!ph, b, ps, plain: plainText, size: sizeOf(n), color: colorOf(kid(rp, 'a:solidFill')), bold: rp?.getAttribute('b') === '1', sig: `${plainText.replace(/\d+/g, '#').toLowerCase()}|${b ? `${round(b.x, 2)},${round(b.y, 2)}` : ''}` });
        } else if (n.nodeName === 'p:pic') {
          const t = r[all(n, 'a:blip')[0]?.getAttribute('r:embed')]?.target; if (!b || !t) { skipped++; continue; }
          S.art.push({ sig: `image|${t}|${boxSig(b)}`, pic: t, b });
        } else if (n.nodeName === 'p:graphicFrame') {
          const tbl = all(n, 'a:tbl')[0]; const ch = all(n, 'c:chart')[0];
          if (tbl) { const rows = kids(tbl, 'a:tr').map((tr) => kids(tr, 'a:tc').map((tc) => kids(kid(tc, 'a:txBody'), 'a:p').map((p) => paraText(p)).filter(Boolean).join(' ').replace(/\|/g, '/'))); if (rows.length) S.visuals.push({ x: b?.x ?? 0, y: b?.y ?? 0, tag: [`| ${rows[0].join(' | ')} |`, `|${rows[0].map(() => '---|').join('')}`, ...rows.slice(1).map((row) => `| ${row.join(' | ')} |`)].join('\n') }); }
          else if (ch) { const tag = await chartTag(r[ch.getAttribute('r:id')]?.target); if (tag) { S.visuals.push({ x: b?.x ?? 0, y: b?.y ?? 0, tag }); charts++; } else skipped++; }
          else skipped++;
        }
      }
    };
    await walk(all(doc, 'p:spTree')[0], null);
    const np = Object.values(r).find((x) => x.type === 'notesSlide')?.target; S.notes = '';
    if (np) { const nd = await xml(np); for (const s of all(nd, 'p:sp')) { if (phOf(s)?.type === 'body') S.notes = kids(kid(s, 'p:txBody'), 'a:p').map((p) => all(p, 'a:t').map((t) => t.textContent).join('')).filter(Boolean).join('\n'); } }
    raw.push(S);
  }
  // Text and artwork that repeat on most slides (a footer, a logo, a colour bar) belong to the look, not to the content.
  const count = new Map(); for (const S of raw) for (const k of new Set([...S.texts.filter((t) => !t.ph).map((t) => 't|' + t.sig), ...S.art.map((a) => 'a|' + a.sig)])) count.set(k, (count.get(k) || 0) + 1);
  const repeats = (k) => raw.length >= 3 && (count.get(k) || 0) >= Math.max(2, Math.ceil(raw.length * 0.5));
  const fixed = new Map();
  for (const S of raw) {
    S.texts = S.texts.filter((t) => t.ph || !(repeats('t|' + t.sig) && t.plain.length < 80 && (!t.b || t.b.y > H * 0.8 || t.b.y + t.b.h < H * 0.14)));
    const keep = [];
    for (const a of S.art) {
      if (repeats('a|' + a.sig)) { if (!fixed.has(a.sig)) { if (a.pic) { const id = await picture(a.pic); if (id) fixed.set(a.sig, { kind: 'image', src: id, fit: 'fill', ...a.b }); } else fixed.set(a.sig, a.d); } continue; }
      if (a.pic) keep.push(a);
    }
    for (const a of keep) {
      const b = a.b; if (b.w < 0.7 || b.h < 0.7) { skipped++; continue; }
      const id = await picture(a.pic); if (!id) { skipped++; continue; }
      pics++; if (b.w * b.h > W * H * 0.8) S.full = id; else S.visuals.push({ x: b.x, y: b.y, tag: `<image src="${id}"${b.w * b.h < W * H * 0.08 ? ' fit="contain"' : ''}/>` });
    }
  }
  if (fixed.size && tContent) tContent.decor = [...tContent.decor, ...fixed.values()].slice(0, 30);
  for (const S of raw) {
    const { si, L } = S; const free = S.texts.filter((t) => !t.ph && t.b);
    // A deck drawn with plain text boxes: the title is the largest short text near the top.
    if (!S.title && free.length) {
      const big = [...free].sort((a, b) => b.size - a.size)[0];
      const coverish = si === 0 || (S.texts.length <= 3 && !S.visuals.length && big.size >= 36 && big.b.y > H * 0.25);
      const top = Math.min(...S.texts.filter((t) => t.b).map((t) => t.b.y));
      const cands = free.filter((t) => t.ps.length <= 2 && t.plain.length <= 140 && (coverish || t.b.y < H * 0.3) && (t.size >= 20 || t.b.y === top));
      const cmax = Math.max(0, ...cands.map((t) => t.size)); const cand = coverish ? cands.sort((a, b) => b.size - a.size || a.b.y - b.b.y)[0] : cands.filter((t) => t.size >= cmax * 0.6).sort((a, b) => a.b.y - b.b.y)[0];
      if (cand) { S.title = cand.plain; S.titleBox = cand; S.derived = !coverish; S.texts = S.texts.filter((t) => t !== cand); S.coverish = coverish; }
    }
    // Big numbers with a caption under them are figures.
    const loose = S.texts.filter((t) => !t.ph && t.b); const stats = [];
    for (const v of loose) {
      if (!(v.size >= 26 && v.ps.length === 1 && v.plain.length <= 14 && /\d/.test(v.plain))) continue;
      const cx = v.b.x + v.b.w / 2; const label = loose.filter((t) => t !== v && t.ps.length === 1 && t.plain.length <= 90 && t.size < v.size && t.b.y >= v.b.y && t.b.y <= v.b.y + v.b.h + 1.2 && Math.abs(t.b.x + t.b.w / 2 - cx) < Math.max(0.6, v.b.w / 2) && !stats.some((s) => s.label === t)).sort((a, b) => a.b.y - b.b.y)[0];
      stats.push({ v, label });
    }
    if (stats.length >= 2) { const gone = new Set(stats.flatMap((s) => [s.v, s.label])); S.texts = S.texts.filter((t) => !gone.has(t)); const q = (t) => String(t || '').replace(/"/g, "'"); S.visuals.push({ x: 0, y: Math.min(...stats.map((s) => s.v.b.y)), tag: stats.sort((a, b) => a.v.b.x - b.v.b.x).map((s) => `<stat value="${q(s.v.plain)}" label="${q(s.label?.plain)}"/>`).join('\n') }); }
    // Rows of short headings with a line under each (steps, features): one list item per column.
    const cells = S.texts.filter((t) => !t.ph && t.b && t.ps.length === 1 && !/^\d{1,2}[.)]?$/.test(t.plain)); const numerals = S.texts.filter((t) => !t.ph && /^\d{1,2}[.)]?$/.test(t.plain));
    const colsMap = new Map(); for (const t of cells) { const k = [...colsMap.keys()].find((x) => Math.abs(x - t.b.x) < 0.35) ?? t.b.x; colsMap.set(k, [...(colsMap.get(k) || []), t]); }
    const grid = [...colsMap.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.sort((a, b) => a.b.y - b.b.y));
    if (!stats.length && grid.length >= 3 && grid.length <= 6 && grid.every((c) => c.length === 2 && c[0].plain.length <= 48) && cells.length === S.texts.length - numerals.length) {
      S.texts = []; S.visuals.push({ x: 0, y: grid[0][0].b.y, tag: grid.map((c, i) => `${numerals.length ? `${i + 1}.` : "-"} **${esc(c[0].plain)}**: ${esc(c[1].plain)}`).join("\n") }); S.steps = numerals.length >= 3;
    }
    if ((si === 0 || S.coverish) && !S.subtitle && !S.visuals.length && S.texts.length && S.texts.length <= 2 && S.texts.every((t) => !t.ph && t.ps.length === 1)) { const t = [...S.texts].sort((a, b) => (a.b?.y ?? 0) - (b.b?.y ?? 0))[0]; S.subtitle = t.plain; S.texts = S.texts.filter((x) => x !== t); S.coverish = true; }
    const bodies = S.texts.map((t, i) => ({ x: t.b?.x ?? L?.ph[i ? 'body2' : 'body']?.x ?? 0, y: t.b?.y ?? 0, lines: t.ps.map((p) => ((t.ph && !p.none) || p.bullet ? `${'  '.repeat(p.level)}${p.num ? '1.' : '-'} ${p.text}` : p.text)) }));
    const visuals = S.visuals; const lines = [];
    if (S.title) lines.push(`# ${S.title}`); if (S.subtitle) lines.push(`## ${S.subtitle}`);
    bodies.sort((a, b) => a.y - b.y || a.x - b.x);
    // Two text boxes side by side are two columns.
    const cols = bodies.length === 2 && !visuals.length && Math.abs(bodies[0].y - bodies[1].y) < 0.6 && Math.abs(bodies[0].x - bodies[1].x) > W * 0.25;
    if (cols) { const [a, b] = [...bodies].sort((p, q) => p.x - q.x); lines.push('<left>', ...a.lines, '</left>', '<right>', ...b.lines, '</right>'); }
    else { const items = [...bodies.map((x) => ({ x: x.x, y: x.y, text: x.lines.join('\n') })), ...visuals.map((v) => ({ x: v.x, y: v.y, text: v.tag }))]; const side = bodies.length && visuals.length && visuals.every((v) => Math.abs(v.x - bodies[0].x) > W * 0.2); items.sort((a, b) => (side ? a.x - b.x : a.y - b.y || a.x - b.x)); for (const it of items) lines.push(it.text, ''); }
    if (S.full) lines.push(`<image src="${S.full}"/>`);
    let layout = L?.type === 'title' || S.coverish || (si === 0 && !bodies.length && !visuals.length) ? 'title' : L?.type === 'secHead' ? 'section' : cols ? 'two-column' : S.full ? 'image-full' : S.steps ? 'steps' : undefined;
    if (layout === 'title' && (visuals.length || bodies.length > 1)) layout = undefined;
    if (layout === 'title' && si === raw.length - 1 && si > 1) layout = 'closing';
    else if (layout === 'title' && si > 0 && L?.type !== 'title') layout = 'section';
    S.layout = layout;
    if (!lines.length) lines.push(`# Slide ${si + 1}`);
    if (!S.title) lines.unshift(`# ${bodies[0]?.lines[0]?.replace(/^[-\d.\s]+/, '').replace(/\*\*/g, '').slice(0, 60) || `Slide ${si + 1}`}`);
    slides.push({ layout, text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), notes: S.notes.trim() || undefined });
  }
  // A deck without placeholders still has a look: where its titles sit, and the colours its slides use.
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const tb = raw.filter((S) => S.derived && S.titleBox).map((S) => S.titleBox);
  if (tContent && !tContent.title && tb.length >= 2) { const w = Math.max(median(tb.map((t) => t.b.w)), W * 0.5); const x = median(tb.map((t) => t.b.x)); tContent.title = { x: round(x, 1000), y: round(median(tb.map((t) => t.b.y)), 1000), w: round(Math.min(w, W - x - 0.3), 1000), h: round(Math.max(0.6, median(tb.map((t) => t.b.h))), 1000), size: Math.max(18, Math.min(54, median(tb.map((t) => t.size)) || 32)), bold: tb.filter((t) => t.bold).length * 2 >= tb.length, color: tb[0].color || undefined, valign: 'middle' }; }
  const inner = raw.filter((S) => S.layout !== 'title' && S.layout !== 'closing' && S.layout !== 'section'); const bgs = inner.map((S) => S.bg).filter(Boolean);
  if (tContent && bgs.length && bgs.length * 2 >= inner.length) { const c = bgs.sort((a, b) => bgs.filter((x) => x === b).length - bgs.filter((x) => x === a).length)[0]; if (c !== tContent.bg.color || tContent.bg.image) { tContent.bg = { color: c }; tContent.dark = lum(c) < 0.4; template.bg = tContent.bg; template.colors.background = c; if (tContent.dark) template.colors.text = '#F3F4F6'; } }
  const cover = raw[0];
  if (cover?.bg && (!tCover || cover.bg !== tCover.bg.color)) { template.title = { ...(tCover || { decor: [] }), bg: { color: cover.bg }, dark: lum(cover.bg) < 0.4 }; if (!tCover) { template.title.decor = []; } }
  if (!template.section && template.title && raw.some((S) => S.layout === 'section')) template.section = template.title;
  const core = await xml('docProps/core.xml'); const docTitle = all(core, 'dc:title')[0]?.textContent?.trim();
  const notes = [`Opened ${slides.length} slide${slides.length === 1 ? '' : 's'} with the look of your deck: its size, colours, fonts, backgrounds and fixed artwork such as the logo. New slides follow the same look.`];
  if (slidePaths.length > 60) notes.push('Only the first 60 slides were opened.');
  if (skipped) notes.push(`${skipped} item${skipped === 1 ? '' : 's'} could not be carried over (SmartArt, video, small icons or drawings).`);
  notes.push('Animations and transitions are not kept.');
  return { spec: { kind: 'slides', title: docTitle || file.name.replace(/\.pptx$/i, ''), settings: { template }, slides }, notes, stats: { pics, charts } };
}

// The plain text of a deck, slide by slide, for ordinary chats that have a .pptx attached.
export async function pptxText(file, max = 120000) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  const un = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  let out = '';
  for (let i = 0; i < names.length && out.length < max; i++) {
    const x = await zip.file(names[i]).async('string');
    const paras = [...x.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((m) => [...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => un(t[1])).join('')).filter((t) => t.trim());
    out += `--- Slide ${i + 1} ---\n${paras.join('\n')}\n\n`;
  }
  return { text: out.trim(), slides: names.length };
}
