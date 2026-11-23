// Resizable panels and movable pop-ups, for the whole app.
//
// Panels: each entry in AREAS names a split layout and one of its columns. A thin divider is drawn
// over the boundary (a fixed-position handle, so no page's own DOM is touched). Dragging it sets a
// CSS variable that resize.css uses in that layout's grid columns; the size is remembered per area
// in localStorage. Double-click a divider to go back to the default size.
//
// Pop-ups: any dialog (.modal inside .modal-bg, and the expand editor) can be moved by dragging its
// header and resized from its bottom-right corner (CSS `resize`).

const AREAS = [
  // sel: the grid; col: the column being sized (index, or -1 for the last); side: which edge of it is dragged;
  // on: 'root' when the variable belongs on <html>; min/max in px; minRest: room left for the other columns.
  { id: 'side', sel: '.shell:not(.collapsed)', col: 0, side: 'right', v: '--side', on: 'root', min: 190, max: 420, mq: 861 },
  { id: 'chat-list', sel: '.chat:not(.nolist):not(.canvas-open)', col: 0, side: 'right', v: '--chat-list', min: 190, max: 460, mq: 1001 },
  { id: 'canvas', sel: '.chat.canvas-open', skipIf: '.canvas.wide', col: -1, side: 'left', v: '--canvas-w', min: 320, minRest: 360, mq: 1001 },
  { id: 'cx-list', sel: '.codex:not(.nolist):not(.ws-wide)', col: 0, side: 'right', v: '--cx-list', min: 180, max: 420, mq: 1001 },
  { id: 'cx-ws', sel: '.codex:not(.ws-wide)', col: -1, side: 'left', v: '--cx-ws', min: 300, minRest: 360, mq: 1001 },
  { id: 'vb-list', sel: '.vb-body', col: 0, side: 'right', v: '--vb-list', min: 200, max: 520, mq: 1181 },
  { id: 'vb-panel', sel: '.vb-body', col: 1, side: 'right', v: '--vb-panel', min: 260, minRest: 320, mq: 1181 },
  { id: 'pa', sel: '.pa-split', col: 0, side: 'right', v: '--pa-left', min: 300, minRest: 320, mq: 981 },
  { id: 'pt', sel: '.pt-split', col: -1, side: 'left', v: '--pt-right', min: 280, minRest: 360, mq: 981 },
  { id: 'pe', sel: '.pe-work', col: -1, side: 'left', v: '--pe-right', min: 260, minRest: 320, mq: 981 },
];

const KEY = (a) => `pm-size-${a.id}`;
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

const handles = new Map(); // area id -> handle element
let queued = false;
let dragging = null;

const holderOf = (a, grid) => (a.on === 'root' ? document.documentElement : grid);
const colOf = (a, grid) => { const kids = [...grid.children].filter((c) => !['absolute', 'fixed'].includes(getComputedStyle(c).position) && !c.classList.contains('pn-max') && getComputedStyle(c).display !== 'none'); return kids[a.col < 0 ? kids.length - 1 : a.col]; };

function applySaved(a, grid) {
  const holder = holderOf(a, grid);
  if (holder.style.getPropertyValue(a.v)) return;
  const px = read(KEY(a));
  if (Number.isFinite(px)) holder.style.setProperty(a.v, `${clampFor(a, grid, px)}px`);
}

function clampFor(a, grid, px) {
  const width = grid.getBoundingClientRect().width;
  const max = Math.min(a.max ?? Infinity, a.minRest ? width - a.minRest : Infinity);
  return Math.round(Math.max(a.min, Math.min(px, Math.max(a.min, max))));
}

function handleFor(a) {
  let el = handles.get(a.id);
  if (el) return el;
  el = document.createElement('div');
  el.className = 'rz-h';
  el.title = 'Drag to resize · double-click to reset';
  el.setAttribute('role', 'separator');
  el.setAttribute('aria-orientation', 'vertical');
  el.dataset.area = a.id;
  el.addEventListener('pointerdown', (e) => startDrag(e, a, el));
  el.addEventListener('dblclick', () => reset(a));
  document.body.append(el);
  handles.set(a.id, el);
  return el;
}

function place() {
  queued = false;
  placePanels();
  for (const a of AREAS) {
    const grid = innerWidth >= a.mq ? document.querySelector(a.sel) : null;
    const col = grid && colOf(a, grid);
    const r = col?.getBoundingClientRect();
    const gr = grid?.getBoundingClientRect();
    if (!grid || !r || (a.skipIf && grid.querySelector(a.skipIf)) || r.width < 40 || !gr.height || grid.closest('[hidden]')) { handles.get(a.id)?.setAttribute('hidden', ''); continue; }
    applySaved(a, grid);
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    const x = a.side === 'right' ? r.right + gap / 2 : r.left - gap / 2;
    const el = handleFor(a);
    el.removeAttribute('hidden');
    const top = Math.max(gr.top, 0); const bottom = Math.min(gr.bottom, innerHeight);
    el.style.left = `${Math.round(x - 4)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.height = `${Math.max(0, Math.round(bottom - top))}px`;
  }
}
// ---- expand a whole side panel into a large centred view ----
// sel: the panel; title: what the button says. The panel keeps its own content and controls; it is
// only shown bigger (fixed, centred, over a dimmed page). A placeholder holds its grid column.
const PANELS = [
  { id: 'vb-panel', sel: '.vb-panel', mq: 1181, top: 8 },
  { id: 'pt-panel', sel: '.pt-panel', mq: 981, top: 8 },
  { id: 'vb-list', sel: '.vb-list', mq: 861, top: 9 },
  { id: 'vb-tl', sel: '.vb-tl', mq: 861, top: 2, right: 2 },
  { id: 'img-edit', sel: '.lightbox.editor > aside', mq: 861, top: 10 },
];
const EXPAND_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
const SHRINK_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';
const pbtns = new Map();
let maxed = null; // { panel, ph, bg }

function panelBtn(pc) {
  let el = pbtns.get(pc.id);
  if (el) return el;
  el = document.createElement('button');
  el.type = 'button'; el.className = 'pn-btn'; el.dataset.panel = pc.id;
  el.addEventListener('click', () => { const panel = document.querySelector(pc.sel); if (!panel) return; if (maxed?.panel === panel) shrinkPanel(); else growPanel(panel); });
  document.body.append(el); pbtns.set(pc.id, el);
  return el;
}

function growPanel(panel) {
  shrinkPanel();
  const r = panel.getBoundingClientRect();
  const ph = document.createElement('div'); ph.className = 'pn-ph'; ph.style.minHeight = `${r.height}px`;
  panel.before(ph);
  const bg = document.createElement('div'); bg.className = 'pn-bg'; bg.addEventListener('click', shrinkPanel);
  const lb = panel.closest('.lightbox'); // the image viewer is its own layer: dim inside it
  if (lb) { bg.style.zIndex = '4'; lb.append(bg); } else document.body.append(bg);
  panel.classList.add('pn-max'); document.body.classList.add('pn-open');
  maxed = { panel, ph, bg };
  window.dispatchEvent(new Event('resize')); schedule();
}
export function shrinkPanel() {
  if (!maxed) return;
  const { panel, ph, bg } = maxed; maxed = null;
  panel.classList.remove('pn-max'); ph.remove(); bg.remove(); document.body.classList.remove('pn-open');
  window.dispatchEvent(new Event('resize')); schedule();
}

function placePanels() {
  if (maxed && !maxed.panel.isConnected) shrinkPanel();
  for (const pc of PANELS) {
    const panel = innerWidth >= pc.mq ? document.querySelector(pc.sel) : null;
    const r = panel?.getBoundingClientRect();
    const lb = document.querySelector('.lightbox');
    if (!panel || !r.width || !r.height || document.querySelector('.modal-bg, .xp-bg') || (lb && !lb.contains(panel)) || (maxed && maxed.panel !== panel)) { pbtns.get(pc.id)?.setAttribute('hidden', ''); continue; }
    const el = panelBtn(pc); const on = maxed?.panel === panel;
    el.removeAttribute('hidden'); el.classList.toggle('on', on);
    el.innerHTML = on ? SHRINK_SVG : EXPAND_SVG;
    el.title = on ? 'Back to the normal size (Esc)' : 'Expand this panel';
    el.setAttribute('aria-label', el.title);
    el.style.zIndex = panel.closest('.lightbox') ? '126' : '';
    el.style.left = `${Math.round(r.right - 38 - (pc.right || 0) - (panel.scrollHeight > panel.clientHeight + 2 ? 8 : 0))}px`;
    el.style.top = `${Math.round(pc.bottom != null ? r.bottom - 30 - pc.bottom : r.top + pc.top)}px`;
  }
}

const schedule = () => { if (!queued && !dragging) { queued = true; requestAnimationFrame(place); } };

function startDrag(e, a, el) {
  const grid = document.querySelector(a.sel); if (!grid) return;
  const col = colOf(a, grid); if (!col) return;
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  const r = col.getBoundingClientRect();
  dragging = { a, grid, startX: e.clientX, startW: r.width };
  document.body.classList.add('rz-drag'); el.classList.add('on');
  const move = (ev) => {
    const dx = ev.clientX - dragging.startX;
    const w = clampFor(a, grid, dragging.startW + (a.side === 'right' ? dx : -dx));
    holderOf(a, grid).style.setProperty(a.v, `${w}px`);
    dragging.w = w;
    place();
    window.dispatchEvent(new Event('resize')); // let pages that measure themselves (timeline, preview) re-layout
  };
  const up = () => {
    el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    document.body.classList.remove('rz-drag'); el.classList.remove('on');
    if (dragging?.w) write(KEY(a), dragging.w);
    dragging = null; schedule();
  };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

function reset(a) {
  const grid = document.querySelector(a.sel); if (!grid) return;
  holderOf(a, grid).style.removeProperty(a.v);
  write(KEY(a), null);
  window.dispatchEvent(new Event('resize'));
  schedule();
}

// ---- movable pop-ups ----
const NO_DRAG = 'button, input, select, textarea, a, [contenteditable], .seg, label';
function startMove(e) {
  if (e.button !== 0 || innerWidth < 641) return;
  const head = e.target.closest('.modal-bg .modal-head, .xp-head');
  if (!head || e.target.closest(NO_DRAG)) return;
  const box = head.closest('.modal, .xp-modal'); if (!box) return;
  e.preventDefault();
  const [ox, oy] = (box.dataset.pos || '0,0').split(',').map(Number);
  const sx = e.clientX; const sy = e.clientY;
  const r = box.getBoundingClientRect();
  const move = (ev) => {
    // keep at least the header on screen
    const x = Math.max(-r.left - r.width + 120, Math.min(innerWidth - r.left - 120, ox + ev.clientX - sx));
    const y = Math.max(-r.top, Math.min(innerHeight - r.top - 48, oy + ev.clientY - sy));
    box.style.translate = `${x}px ${y}px`; box.dataset.pos = `${x},${y}`;
  };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); document.body.classList.remove('rz-drag'); };
  document.body.classList.add('rz-drag');
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}

export function installResizers() {
  if (installResizers.done) return; installResizers.done = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = '/resize.css';
  document.head.append(link);
  const ours = (n) => n?.nodeType === 1 && n.matches('.rz-h, .pn-btn, .pn-bg, .xp-btn');
  // Watch the whole page (the image viewer lives outside #app), ignoring changes to our own handles.
  new MutationObserver((recs) => { if (recs.some((r) => !ours(r.target) && ![...r.addedNodes, ...r.removedNodes].every(ours) || (r.type === 'attributes' && !ours(r.target)))) schedule(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  addEventListener('resize', schedule);
  addEventListener('scroll', schedule, true);
  addEventListener('transitionend', schedule, true);
  document.addEventListener('pointerdown', startMove);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && maxed && !document.querySelector('.modal-bg, .xp-bg, .pop, .popover') && (!document.querySelector('.lightbox') || maxed.panel.closest('.lightbox'))) { e.stopImmediatePropagation(); shrinkPanel(); } }, true);
  schedule();
}
