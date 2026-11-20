// Prompt enhancer for every prompt box: one small sparkle button that rewrites what you typed into a
// better prompt for where you are (a chat message, a picture, a video, a Builder scene, an agent brief,
// a brand-kit field). It never runs by itself and is charged only when you press it (usually under 1 credit).
//
// While it works, a slim status line sits on top of the prompt box (like voice input does) and the box
// shimmers; when it is done, the line offers Undo, which puts your own words back. Typing again hides it.
//
// One component for the whole app: boxes are found by selector, so pages need no wiring. To add a box,
// add a line to PLACES. The Image and Video studio bar keeps its own enhancer (with Auto mode) and uses
// enhanceStatus() from here for the same status line.
import { h, icon, api, toast, errToast, setCredits } from './app.js';

const LABEL = { chat: 'message', image: 'image prompt', video: 'video prompt', scene: 'scene', agent: 'brief', brand: 'text' };
const fromPlaceholder = (ta) => { const p = ta.dataset.ph || ta.placeholder || ''; return /\bimage\b/i.test(p) ? 'image' : /\bvideo\b/i.test(p) ? 'video' : 'chat'; };
const quickMode = (ta) => { const on = ta.closest('.quick')?.querySelector('.seg .on')?.textContent.toLowerCase() || ''; return /image/.test(on) ? 'image' : /video/.test(on) ? 'video' : 'chat'; };

// Where the button goes. `bar`: next to the microphone in a prompt bar. Otherwise it sits in the box's corner.
const PLACES = [
  { sel: '#composer textarea', mode: fromPlaceholder, bar: true },               // chat (also with an image or video model)
  { sel: '.pj-bar textarea', mode: () => 'chat', bar: true },                    // a project's "start a chat"
  { sel: '.quick .bar textarea', mode: quickMode, bar: true },                   // Home quick start
  { sel: '#va-prompt', mode: () => 'agent' },                                    // Video Agent
  { sel: '#vb-prompt, #vb-rprompt', mode: () => 'scene' },                       // Video Builder scene and remake prompts
  { sel: '#pro-quick, #pa-prompt', mode: () => 'agent' },                        // Studio Pro home and Agent
  { sel: '#pt-prompt', mode: () => (/\/video/.test(location.hash) ? 'video' : 'image') }, // Studio Pro Image and Video tools
  { sel: '.ad-field textarea', mode: () => 'brand', field: (ta) => ta.closest('.ad-field')?.querySelector('span')?.textContent.trim() }, // Ad Studio brand kit
];
const SELECTOR = PLACES.map((p) => p.sel).join(', ');

const boxes = new Map(); // textarea → { btn, place, undo, strip, busy, ours }
// Some pages redraw their form (a new textarea with the same text). An offered Undo moves to the new box.
const carry = new Map(); // box key → { old, enhanced, mode }
const keyOf = (ta, place) => `${place.sel}|${ta.id || ''}|${place.field?.(ta) || ''}`;
const findBox = (key, place) => [...document.querySelectorAll(place.sel)].find((t) => keyOf(t, place) === key);

// Writes text back the way typing would, so each page's own handler stores it.
function writeBack(ta, value, st) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  st.ours = true; setter.call(ta, value);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  st.ours = false;
}

// ---------- the status line on top of a prompt box ----------
// enhanceStatus(ta, mode) shows "Enhancing…"; .done(undo) turns it into "Enhanced · Undo"; .close() removes it.
export function enhanceStatus(ta, mode, { onStop } = {}) {
  const label = h('span', { class: 'enh-label' }, `Enhancing your ${LABEL[mode] || 'prompt'}…`);
  const acts = h('span', { class: 'enh-acts' });
  const strip = h('div', { class: 'enh-strip busy', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'enh-ic' }, icon('sparkle')), label, h('span', { class: 'grow' }), acts);
  strip.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // keep the box focused, so the page does not redraw it
  if (onStop) acts.append(h('button', { type: 'button', class: 'enh-link', onclick: onStop }, 'Stop'));
  const bar = ta.closest('.bar, .va-box');
  if (bar) bar.prepend(strip); else ta.before(strip);
  ta.classList.add('enh-busy');
  let timer = 0;
  const api_ = {
    el: strip,
    done(undo, note = '') {
      ta.classList.remove('enh-busy'); strip.classList.remove('busy');
      label.textContent = note || `Enhanced for ${mode === 'chat' ? 'chat' : mode === 'brand' ? 'your brand kit' : mode === 'agent' ? 'the agent' : `this ${mode === 'scene' ? 'scene' : mode}`}`;
      acts.replaceChildren(
        h('button', { type: 'button', class: 'enh-link', title: 'Bring my own words back', onclick: () => { undo(); api_.close(); } }, icon('undo'), 'Undo'),
        h('button', { type: 'button', class: 'enh-x', title: 'Keep it and hide this', 'aria-label': 'Hide', onclick: () => api_.close() }, icon('x')));
      clearTimeout(timer); timer = setTimeout(() => strip.classList.add('quiet'), 6000); // fades back, still clickable
    },
    close() { clearTimeout(timer); ta.classList.remove('enh-busy'); strip.remove(); },
  };
  return api_;
}

// ---------- the button ----------
// Once there is something to improve, the sparkle lights up (and pulses once), so it gets noticed while typing.
function ready(btn, on) {
  if (on && !btn.classList.contains('enh-ready')) { btn.classList.add('enh-ready', 'enh-nudge'); setTimeout(() => btn.classList.remove('enh-nudge'), 1300); }
  else if (!on) btn.classList.remove('enh-ready', 'enh-nudge');
}
function drawBtn(st) {
  const { btn } = st;
  btn.classList.toggle('busy', !!st.busy); btn.classList.toggle('on', !!st.undo);
  ready(btn, !st.busy && !st.undo && st.ta.value.trim().length >= 3);
  btn.replaceChildren(st.busy ? h('span', { class: 'enh-spin' }) : icon(st.undo ? 'undo' : 'sparkle'));
  const tip = st.busy ? 'Enhancing…' : st.undo ? 'Undo: bring my own words back' : `Enhance my ${LABEL[st.place.mode(st.ta)] || 'prompt'} with AI (usually under 1 credit)`;
  btn.title = tip; btn.setAttribute('aria-label', tip);
}

async function run(st) {
  const { ta } = st;
  if (st.busy) return;
  if (st.undo) { st.undo(); return; }
  const old = ta.value; const mode = st.place.mode(ta);
  if (!old.trim()) { toast(mode === 'brand' ? 'Write a few words in this field first, then press this.' : 'Type a short idea first, then press this to improve it.'); return ta.focus(); }
  const ctrl = new AbortController();
  st.busy = true; ta.readOnly = true; drawBtn(st);
  st.strip?.close();
  st.strip = enhanceStatus(ta, mode, { onStop: () => ctrl.abort() });
  try {
    const r = await api('/api/enhance', { method: 'POST', body: { prompt: old, mode, field: st.place.field?.(ta) }, signal: ctrl.signal, timeoutMs: 90000 });
    if (r.credits != null) setCredits(r.credits);
    ta.readOnly = false; st.busy = false;
    const key = keyOf(ta, st.place);
    const box = ta.isConnected ? st : boxes.get(findBox(key, st.place)); // the page redrew the form meanwhile
    st.strip.close();
    if (!box || box.ta.value !== old) return drawBtn(st); // the text was changed meanwhile: leave it
    writeBack(box.ta, r.prompt, box);
    offerUndo(boxes.get(box.ta.isConnected ? box.ta : findBox(key, st.place)) || box, old, r.prompt, mode);
  } catch (e) {
    ta.readOnly = false; st.busy = false; st.strip.close();
    if (e?.name === 'AbortError' && ctrl.signal.aborted) toast('Stopped. Your words are unchanged.');
    else errToast(e);
  }
  drawBtn(st);
}

function offerUndo(st, old, enhanced, mode) {
  const { ta } = st; const key = keyOf(ta, st.place);
  carry.set(key, { old, enhanced, mode });
  st.undo = () => {
    carry.delete(key);
    const cur = ta.isConnected ? st : boxes.get(findBox(key, st.place));
    if (cur) { cur.undo = null; writeBack(cur.ta, old, cur); cur.strip?.close(); drawBtn(cur); cur.ta.focus(); }
    st.undo = null; st.strip?.close(); drawBtn(st);
  };
  st.strip?.close();
  st.strip = enhanceStatus(ta, mode); st.strip.done(() => st.undo?.());
  st.strip.el.querySelector('.enh-x')?.addEventListener('click', () => { carry.delete(key); st.undo = null; drawBtn(st); }); // keep it: the undo goes away
  drawBtn(st);
  if (document.activeElement !== ta) { ta.focus({ preventScroll: true }); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch { /* not focusable */ } }
}

// Puts the button (and a status line that is showing) next to the box. Runs again when a page rebuilds the form around the same box.
function mount(st) {
  const { ta, btn } = st;
  if (st.place.bar) {
    const bar = ta.closest('.bar'); const mic = bar?.querySelector('.bar-row .mic');
    if (mic) mic.before(btn); else bar?.querySelector('.bar-row .grow')?.after(btn);
    if (!btn.isConnected) { btn.classList.remove('icon-btn', 'in-bar'); btn.classList.add('corner'); st.place = { ...st.place, bar: false }; }
  }
  if (!st.place.bar) {
    const host = ta.parentElement;
    if (getComputedStyle(host).position === 'static') host.classList.add('enh-host');
    ta.classList.add('enh-pad');
    ta.after(btn);
    placeCorner(st);
    st.ro?.disconnect();
    if (window.ResizeObserver) { st.ro = new ResizeObserver(() => placeCorner(st)); st.ro.observe(ta); st.ro.observe(host); }
  }
  const strip = st.strip?.el;
  if (strip && !strip.isConnected && (st.busy || st.undo)) { const bar = ta.closest('.bar, .va-box'); if (bar) bar.prepend(strip); else ta.before(strip); }
}

function attach(ta, place) {
  if (ta.dataset.enh || ta.matches('[data-no-enhance]')) return;
  ta.dataset.enh = '1';
  const btn = h('button', { type: 'button', class: 'enh-btn' + (place.bar ? ' icon-btn in-bar' : ' corner') });
  const st = { ta, btn, place, undo: null, strip: null, busy: false, ours: false };
  boxes.set(ta, st);
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the box focused
  btn.addEventListener('click', () => run(st));
  // Typing your own words again drops the undo (the enhanced text is now yours).
  ta.addEventListener('input', () => { if (st.ours || st.busy) return; ready(btn, !st.undo && ta.value.trim().length >= 3); carry.delete(keyOf(ta, st.place)); if (st.undo) { st.undo = null; st.strip?.close(); drawBtn(st); } });
  drawBtn(st);
  const was = carry.get(keyOf(ta, place));
  mount(st);
  if (was) { if (ta.value === was.enhanced) queueMicrotask(() => offerUndo(st, was.old, was.enhanced, was.mode)); else carry.delete(keyOf(ta, place)); }
}

// The corner button follows the box's bottom-right corner, inside the border, clear of a scrollbar.
function placeCorner(st) {
  const { ta, btn } = st;
  if (!ta.isConnected || !btn.isConnected) return;
  const right = ta.offsetLeft + ta.clientLeft + ta.clientWidth;
  const bottom = ta.offsetTop + ta.clientTop + ta.clientHeight;
  btn.style.left = `${right - btn.offsetWidth - 14}px`; // clear of the resize grip
  btn.style.top = `${bottom - btn.offsetHeight - 5}px`;
  btn.hidden = !ta.offsetWidth;
}

function scan() {
  for (const [ta, st] of boxes) if (!ta.isConnected) { st.ro?.disconnect(); st.btn.remove(); st.strip?.close(); boxes.delete(ta); }
  for (const place of PLACES) for (const ta of document.querySelectorAll(place.sel)) if (ta instanceof HTMLTextAreaElement) attach(ta, place);
  for (const st of boxes.values()) {
    if (!st.btn.isConnected || (!st.place.bar && st.btn.parentElement !== st.ta.parentElement) || (st.strip && !st.strip.el.isConnected && (st.busy || st.undo))) mount(st);
    else if (!st.place.bar) placeCorner(st);
  }
}

export function installEnhancers() {
  if (installEnhancers.done) return; installEnhancers.done = true;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/enhance.css'; document.head.append(link);
  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  addEventListener('resize', later);
  // The quick-start bar on Home switches between image, video and chat: refresh the tooltip.
  document.addEventListener('click', (e) => { if (e.target.closest?.('.quick .seg')) setTimeout(() => { for (const st of boxes.values()) if (!st.busy) drawBtn(st); }, 0); });
  // The Image and Video studio bar has its own button: light it up the same way.
  document.addEventListener('input', (e) => { const b = e.target.id === 'prompt' && e.target.closest('.bar')?.querySelector('#enh-now'); if (b) ready(b, !b.classList.contains('on') && e.target.value.trim().length >= 3); });
  scan();
}
export const ENHANCE_SELECTOR = SELECTOR;
