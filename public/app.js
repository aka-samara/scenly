// Scenly front end: a dependency-free single page app in a dark creative-studio style.
import * as Docs from './docs.js';
import { micButton } from './voice.js';
import { installExpandEditors } from './expand.js';
import { installResizers } from './resize.js';
import { installEnhancers, enhanceStatus } from './enhance.js';
import { TERMS, PRIVACY, LEGAL_UPDATED, LEGAL_COMPANY, LEGAL_PLACE, COPYRIGHT } from './legal.js';
import { lpLinks, lpBurger, landingSections, landingStats, landingFooter } from './landing.js';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  video: '<rect x="2" y="5" width="15" height="14" rx="3"/><path d="m17 10 5-3v10l-5-3"/>',
  apps: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  clip: '<path d="m21.4 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  retry: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 10 3 2-3 2M13 15h4"/>',
  project: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  face: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="10" r="3"/><path d="M7.5 17c.8-2 2.5-3 4.5-3s3.7 1 4.5 3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  side: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9a3 3 0 0 0-2.8-1.5c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2A3 3 0 0 1 9.2 15M12 6v1.5M12 16.5V18"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  chart: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
  db: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6.5c0 1.7 3.6 3 8 3s8-1.3 8-3V5.5M4 12v6.5c0 1.7 3.6 3 8 3s8-1.3 8-3V12"/>',
  dl: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  brain: '<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V6a3 3 0 0 0-3-3ZM15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z"/>',
  wand: '<path d="m15 4 5 5L9 20H4v-5Z"/><path d="M13 6l5 5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  ratio: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4M17 10v4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
  play: '<path d="M7 4v16l13-8Z"/>',
  bag: '<path d="M5 8h14l-1 12H6Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  shirt: '<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0Z"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pen: '<path d="M3 21l3-1L19 7l-2-2L4 18Z"/><path d="M15 5l2-2 4 4-2 2"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  poster: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h5M8 17l3-3 2 2 3-3"/>',
  blend: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/><circle cx="12" cy="12" r="3"/>',
  megaphone: '<path d="M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2Z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
  paw: '<circle cx="6" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="10" r="2"/><path d="M8 17a4 4 0 0 1 8 0c0 2-2 3-4 3s-4-1-4-3Z"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h14M17 20l4-4-4-4"/><path d="M21 16H7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
  audio: '<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.500"/><path d="m4 7 8 6 8-6"/>',
  send: '<rect x="3" y="5" width="18" height="14" rx="2.500"/><path d="m4 7 8 6 8-6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.500 6h.01M3.500 12h.01M3.500 18h.01"/>',
  grid: '<rect x="3" y="3" width="7.500" height="7.500" rx="1.500"/><rect x="13.500" y="3" width="7.500" height="7.500" rx="1.500"/><rect x="3" y="13.500" width="7.500" height="7.500" rx="1.500"/><rect x="13.500" y="13.500" width="7.500" height="7.500" rx="1.500"/>',
  cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.500 8 20 19M8.500 16 20 5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  hd: '<rect x="3" y="5" width="18" height="14" rx="2.500"/><path d="M7 9v6M7 12h3M10 9v6M14 9v6h1.500a3 3 0 0 0 0-6Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.500v.01"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2a4 4 0 0 0 4-4c0-4-4-7.3-9-7.3Z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15.5" cy="7.5" r="1"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9h18M3 15h18M9 3v18M15 9v12"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8M7 8h6M7 11.5h10"/>',
  pdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M8.5 17v-4h1.3a1.2 1.2 0 0 1 0 2.4H8.5M13 13v4h.8a2 2 0 0 0 0-4Z"/>',
};
const icon = (name, cls = '') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i ' + cls); s.innerHTML = ICONS[name] || ''; return s; };

// ---------- state ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('pm-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pm-' + k, JSON.stringify(v)); } catch {} },
};
// ---------- theme (dark is the default) ----------
function theme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const css = document.getElementById('hljs-theme'); if (css) css.href = t === 'light' ? '/vendor/hljs-light.css' : '/vendor/hljs-dark.css';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#f5f5f7' : '#050506');
  store.set('theme', t);
  $$('.theme-btn').forEach((b) => { b.replaceChildren(icon(t === 'light' ? 'moon' : 'sun')); b.title = t === 'light' ? 'Switch to dark mode' : 'Switch to light mode'; });
}
function toggleTheme() { applyTheme(theme() === 'light' ? 'dark' : 'light'); }
function themeBtn() {
  const t = theme();
  return h('button', { class: 'theme-btn', title: t === 'light' ? 'Switch to dark mode' : 'Switch to light mode', onclick: toggleTheme }, icon(t === 'light' ? 'moon' : 'sun'));
}

const S = {
  user: null, config: null, models: [], apps: [], conversations: [], conv: null,
  projects: [], characters: [], projectId: null,
  chatModelId: store.get('chat-model', 'deepseek-v4-flash'),
  codeModelId: store.get('code-model', ''), code: null, pendingCode: '',
  attachments: [], search: '',
  studio: {
    image: { modelId: 'seedream-5.0-pro', size: '', quality: 'medium', count: 1, autoEnhance: false, ...store.get('studio-image', {}), enhance: undefined, refs: [] },
    video: { modelId: 'doubao-seedance-2.0-fast', resolution: '', ratio: '', duration: 5, count: 1, autoEnhance: false, ...store.get('studio-video', {}), enhance: undefined, refs: [], videoUrl: '' },
  },
  gens: { image: null, video: null },
  sid: { image: null, video: null }, // the open image / video session
  draft: { image: '', video: '' },
  view: { image: 'creations', video: 'creations' },
  styles: null, // the Design Library
};
S.studio.image.busy = S.studio.video.busy = false;
const saveStudio = (mode) => { const { refs, videoUrl, busy, creating, ...rest } = S.studio[mode]; store.set('studio-' + mode, rest); };
const byId = (mid) => S.models.find((m) => m.id === mid);
const chatModel = () => byId(S.chatModelId) || S.models.find((m) => m.type === 'chat') || S.models[0];
const studioModel = (mode) => { const st = S.studio[mode]; let m = byId(st.modelId); if (!m || m.type !== mode) { m = S.models.find((x) => x.type === mode); if (m) st.modelId = m.id; } return m; };
const fmtCredits = (n) => (n == null ? '–' : n >= 100 ? Math.round(n).toLocaleString() : n >= 10 ? (Math.round(n * 10) / 10).toString() : n >= 1 ? n.toFixed(1).replace(/\.0$/, '') : n >= 0.01 ? n.toFixed(2) : n > 0 ? '<0.01' : '0');
const kindLabel = { chat: 'Chat', image: 'Image', video: 'Video', code: 'Code' };

async function api(path, opts = {}) {
  // timeoutMs: give up waiting after this long (the server has its own, shorter limit; this is the last guard).
  let timer = null;
  if (opts.timeoutMs && !opts.signal) { const c = new AbortController(); timer = setTimeout(() => c.abort(), opts.timeoutMs); opts = { ...opts, signal: c.signal }; }
  let res;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }, body: opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body });
  } catch (err) {
    if (timer && err?.name === 'AbortError') { const e = new Error('This is taking much longer than usual, so the app stopped waiting. If it finishes, it will still appear here and in Assets. Otherwise no credits are charged.'); e.code = 'client_timeout'; throw e; }
    throw err;
  } finally { clearTimeout(timer); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || `Request failed (${res.status})`); e.status = res.status; e.code = j.code; throw e; }
  return j;
}

function toast(msg, type = '') {
  const t = h('div', { class: 'toast ' + type }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), type === 'error' ? 6500 : 3200);
}
// Never show raw server output (HTML error pages, stack traces) to people.
function cleanErr(m) {
  const t = String(m || '');
  if (/<\/?(html|head|body|center|h1|title)\b/i.test(t) || /^\s*\{/.test(t) || t.length > 400 || /^(TypeError|Error|fetch failed|terminated|network)/i.test(t) || t === 'Failed to fetch') {
    return /time-?out|504/i.test(t) ? 'This model is taking too long to answer right now. Please try again shortly or pick a faster model. No credits were charged.' : 'This model is busy right now. Please try again shortly or pick another model. No credits were charged.';
  }
  // Provider codes and ids ("403 insufficient account quota (request id: ...)") never reach the screen.
  if (/request[ _-]?id|\bhelix-|^\s*\d{3}\s+[a-z]/i.test(t) || /insufficient[\w\s]{0,20}(quota|balance)/i.test(t)) return 'This model is busy right now. Please try again shortly or pick another model. No credits were charged.';
  return t || 'Something went wrong. Please try again.';
}
function errBox(e, retry) {
  if (e?.code === 'insufficient_credits') upgradePrompt();
  return h('div', { class: 'err' }, cleanErr(e.message ?? e), e.code === 'insufficient_credits' ? h('span', {}, ' ', h('a', { href: '#/billing' }, 'Get credits')) : null,
    retry && e.code !== 'insufficient_credits' && h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: retry }, icon('retry'), 'Try again')));
}
function errToast(e) {
  if (e?.code === 'insufficient_credits' && upgradePrompt()) return;
  const t = h('div', { class: 'toast error' }, cleanErr(e.message ?? e), e.code === 'insufficient_credits' ? h('span', {}, ' ', h('a', { href: '#/billing' }, 'Get credits')) : e.code === 'style_locked' ? h('span', {}, ' ', h('a', { href: '#/billing', onclick: () => { $('.lightbox')?.remove(); closePop(); } }, 'See plans')) : null);
  $('#toasts').append(t); setTimeout(() => t.remove(), 7000);
}

function setCredits(c) {
  if (!S.user || c == null) return;
  S.user.credits = c;
  $$('[data-credits]').forEach((el) => (el.textContent = fmtCredits(c)));
  const bar = $('#credit-bar'); if (bar) bar.style.width = creditPct() + '%';
}
const creditPct = () => { const plan = S.config?.plans.find((p) => p.id === S.user?.plan) || S.config?.plans[0]; return Math.max(2, Math.min(100, (S.user.credits / (plan?.credits || 100)) * 100)); };

// ---------- markdown ----------
marked.setOptions({ gfm: true, breaks: false });
// opts.embed: show a full web page (or SVG) inline as a live, sandboxed preview with its code behind a toggle.
// opts.streaming: the answer is still arriving, so a page being written shows as a small "Writing…" card.
function renderMd(text, opts = {}) {
  const html = DOMPurify.sanitize(marked.parse(text || ''), { ADD_ATTR: ['target'] });
  const wrap = h('div', { class: 'md', html });
  wrap.querySelectorAll('pre > code').forEach((code) => {
    const lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || '';
    try { hljs.highlightElement(code); } catch {}
    const pre = code.parentElement;
    const btn = h('button', { class: 'btn ghost sm', onclick: () => copyText(code.textContent, btn) }, icon('copy'), 'Copy');
    const src = code.textContent;
    const page = (/^html?$/i.test(lang) || (!lang && /^\s*(<!doctype html|<html[\s>])/i.test(src)) || lang === 'svg' || /^\s*<svg[\s>]/i.test(src)) && src.trim().length > 40 && extractHtml('```' + (lang || 'html') + '\n' + src + '\n```');
    const pv = page && h('button', { class: 'btn ghost sm', onclick: () => openCanvas(page) }, icon('eye'), 'Preview');
    const box = h('div', { class: 'code' }, h('div', { class: 'code-head' }, h('span', {}, lang || 'code'), h('span', { style: { display: 'flex', gap: '2px' } }, pv, btn)));
    if (opts.embed && page && (page.kind === 'svg' || /<!doctype html|<html[\s>]|<body[\s>]/i.test(src))) {
      if (opts.streaming) { pre.replaceWith(h('div', { class: 'art-card pv-writing' }, h('div', { class: 'art-ic' }, icon('globe')), h('div', { class: 'art-txt' }, h('b', {}, h('span', { class: 'spin' }), ' Writing web page…'), h('small', {}, `${src.split('\n').length} lines so far · preview appears when it is done`)))); return; }
      box.hidden = true;
      const tog = h('button', { class: 'btn ghost sm', 'aria-expanded': 'false', onclick: () => { box.hidden = !box.hidden; tog.setAttribute('aria-expanded', String(!box.hidden)); tog.lastChild.textContent = box.hidden ? 'Show code' : 'Hide code'; } }, icon('code'), h('span', {}, 'Show code'));
      const frame = previewFrame(page.html); frame.loading = 'lazy';
      pre.replaceWith(h('div', { class: 'pv-embed' },
        h('div', { class: 'pv-embed-head' }, h('span', { class: 'pv-embed-title', title: page.title }, icon(page.kind === 'svg' ? 'image' : 'globe'), page.title), h('span', { class: 'pv-embed-acts' }, tog,
          h('button', { class: 'icon-btn sm', title: 'Open large preview', onclick: () => openCanvas(page) }, icon('expand')),
          h('button', { class: 'icon-btn sm', title: 'Download .html', onclick: () => downloadBlob(new Blob([page.html], { type: 'text/html' }), fileSlug(page.title) + '.html') }, icon('dl')))),
        h('div', { class: 'pv-embed-frame' + (page.kind === 'svg' ? ' svg' : '') }, frame), box));
      box.append(pre);
      return;
    }
    pre.replaceWith(box); box.append(pre);
  });
  wrap.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
  return wrap;
}
// Copy a chat answer as clean text: no ** or # symbols. Apps that accept formatting (email, Docs, Word) get bold,
// lists and tables with no colours or background; plain-text apps get readable text with bullets.
async function copyRich(md, btn) {
  const html = DOMPurify.sanitize(marked.parse(md || ''));
  const d = h('div', { style: { position: 'fixed', left: '-9999px', top: '0', width: '600px' } });
  d.innerHTML = html;
  d.querySelectorAll('ol').forEach((ol) => [...ol.children].forEach((li, i) => li.prepend(`${(Number(ol.getAttribute('start')) || 1) + i}. `)));
  d.querySelectorAll('ul > li').forEach((li) => li.prepend('• '));
  document.body.append(d);
  const plain = d.innerText.replace(/\n{3,}/g, '\n\n').trim();
  d.remove();
  try {
    if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error('no rich clipboard');
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
    if (btn) { const old = btn.innerHTML; btn.replaceChildren(icon('check')); setTimeout(() => (btn.innerHTML = old), 1400); }
  } catch { return copyText(plain, btn); }
}
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { const ta = h('textarea', {}, text); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  if (btn) { const old = btn.innerHTML; btn.replaceChildren(icon('check'), btn.textContent.trim() ? 'Copied' : ''); setTimeout(() => (btn.innerHTML = old), 1400); }
}

// ---------- model presentation ----------
const PROVIDER_STYLE = [
  [/bytedance|volcano|doubao|seed/i, ['#2fe6f2', '#3a6bff'], 'S'],
  [/openai|gpt/i, ['#10a37f', '#0b6e57'], 'AI'],
  [/google|gemini|nano/i, ['#4285f4', '#9b72cb'], 'G'],
  [/anthropic|claude/i, ['#d97757', '#a3502f'], 'A'],
  [/deepseek/i, ['#4d6bfe', '#2a3fb0'], 'D'],
  [/qwen|alibaba|wan/i, ['#7c5cff', '#4b2fd1'], 'Q'],
  [/moonshot|kimi/i, ['#222', '#555'], 'K'],
  [/xai|grok/i, ['#444', '#111'], 'X'],
  [/zhipu|glm/i, ['#3367f6', '#1d3a8f'], 'Z'],
  [/minimax|hailuo/i, ['#ff4f6d', '#c51f4a'], 'M'],
];
// Provider icons, the same ones the gateway's pricing page uses (copied into /icons/providers).
const PROVIDER_ICON = {
  deepseek: 'deepseek.svg', bytedance: 'bytedance.png', 'z.ai': 'zai.png', 'moonshot-ai': 'kimi.png', xiaomi: 'xiaomi.png',
  alibaba: 'qwen.png', tencent: 'tencent.png', anthropic: 'anthropic.png', google: 'google.png', openai: 'openai.svg', xai: 'xai.png',
};
const ICON_RULES = [[/gpt|openai/i, 'openai'], [/claude|anthropic/i, 'anthropic'], [/gemini|nano-banana|google/i, 'google'], [/qwen|alibaba|wan/i, 'alibaba'], [/mimo|xiaomi/i, 'xiaomi'], [/kimi|moonshot/i, 'moonshot-ai'], [/glm|zhipu|z\.ai/i, 'z.ai'], [/seedance|seedream|doubao|bytedance|volcano/i, 'bytedance'], [/hunyuan|\bhy[\s-]|tencent/i, 'tencent'], [/deepseek/i, 'deepseek'], [/grok|\bxai\b/i, 'xai']];
function providerIcon(m) {
  if (!m) return null;
  if (PROVIDER_ICON[m.parent]) return '/icons/providers/' + PROVIDER_ICON[m.parent];
  const key = `${m.id} ${m.name} ${m.provider}`;
  const hit = ICON_RULES.find(([re]) => re.test(key));
  return hit ? '/icons/providers/' + PROVIDER_ICON[hit[1]] : null;
}
function letterLogo(m, cls) {
  const key = `${m?.provider} ${m?.id} ${m?.name}`;
  const hit = PROVIDER_STYLE.find(([re]) => re.test(key));
  const [c1, c2] = hit ? hit[1] : ['#555', '#333'];
  const letter = /seedance/i.test(key) ? 'SD' : /seedream/i.test(key) ? 'SR' : /nano/i.test(key) ? 'NB' : hit ? hit[2] : (m?.name || '?')[0];
  return h('div', { class: cls, style: { background: `linear-gradient(135deg, ${c1}, ${c2})`, color: '#fff' } }, letter);
}
// The model's provider icon on a light tile; falls back to coloured letters if the icon is missing.
function modelLogo(m, cls = 'logo') {
  const src = providerIcon(m);
  if (!src) return letterLogo(m, cls);
  const box = h('div', { class: cls + ' has-icon', title: m?.provider || '' });
  const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
  img.onerror = () => box.replaceWith(letterLogo(m, cls));
  box.append(img);
  return box;
}
const shortName = (m) => (m?.name || '').replace(/^Doubao /, '').replace(/^Dreamina /, 'Dreamina ');
// The one-line, plain-language description shown under a model's name (server/blurbs.js).
const modelBlurb = (m) => m.blurb || modelPitch(m);
function modelPitch(m) {
  if (m.type === 'video') {
    const v = m.video; const parts = [];
    if (v.videoToVideo && !v.textToVideo) parts.push('Edits or restyles an existing video');
    else parts.push(v.imageToVideo ? 'Text or image to video' : 'Text to video');
    if (v.videoToVideo && v.textToVideo) parts.push('video reference');
    const ds = v.durations.filter((d) => d > 0);
    if (ds.length) parts.push(`${Math.min(...ds)}–${Math.max(...ds)}s`);
    parts.push(v.resolutions.join(' / '));
    if (v.audio) parts.push('with sound');
    return parts.join(' · ');
  }
  if (m.type === 'image') return (m.short || m.description || '').split('·')[0].trim() || 'Text to image and editing';
  return m.short || m.description || '';
}
function costText(m, mode) {
  if (m.type === 'chat') return `≈${fmtCredits(m.price.creditsPerMessage)} credits / message`;
  if (m.type === 'image') return `≈${fmtCredits(m.price.creditsPerImage)} credits / image`;
  const r = m.video.resolutions[0];
  return `≈${fmtCredits(m.price.creditsPerSecond[r])} credits / second at ${r}`;
}
// What one typical use of a model costs in credits: a message, an image, or 5 seconds of video at its lowest resolution.
function unitCost(m) {
  if (!m?.price) return 0;
  if (m.type === 'chat') return m.price.creditsPerMessage || 0;
  if (m.type === 'image') return m.price.creditsPerImage || 0;
  const v = Object.values(m.price.creditsPerSecond || {}).filter((x) => x > 0);
  return v.length ? Math.min(...v) * 5 : 0;
}
// A quiet price hint for the model lists. Only the two ends are marked, so most rows stay clean:
// the cheapest quarter of each kind says "Low cost", the dearest fifth says "Premium".
function costTier(m) {
  const peers = S.models.filter((x) => x.type === m.type).map(unitCost).filter((c) => c > 0).sort((a, b) => a - b);
  const c = unitCost(m); if (!c || peers.length < 4) return '';
  const rank = peers.filter((x) => x < c).length / peers.length;
  return rank < 0.25 ? 'low' : rank >= 0.8 ? 'high' : '';
}
function costTag(m) {
  const t = costTier(m);
  if (t === 'low') return h('span', { class: 'tag cost-low', title: `One of the cheapest ${m.type} models: ${costText(m).replace('≈', 'about ')}` }, 'Low cost');
  if (t === 'high') return h('span', { class: 'tag cost-high', title: `One of the most capable and most expensive ${m.type} models: ${costText(m).replace('≈', 'about ')}` }, 'Premium');
  return null;
}
// Rough "what you get" numbers for a number of credits, from the live prices: each line is what the credits buy
// if they all went on that one thing. Used on plan cards, pack cards and the landing page.
function creditExamples(credits) {
  const first = (ids, type) => ids.map(byId).find((m) => m && unitCost(m) > 0) || S.models.filter((m) => m.type === type && unitCost(m) > 0).sort((a, b) => unitCost(a) - unitCost(b))[0];
  const nice = (n) => { if (n < 20) return Math.floor(n); const p = 10 ** (String(Math.floor(n)).length - 2); return Math.floor(n / p) * p; }; // two leading digits, rounded down
  const chat = first(['gpt-5.6-terra', 'claude-sonnet-5', 'gemini-3.6-flash'], 'chat');
  const img = first(['nano-banana-2', 'gpt-image-2', 'seedream-5.0-pro'], 'image');
  const vid = first(['doubao-seedance-2-5', 'seedance-2-5-260628', 'doubao-seedance-2.0'], 'video');
  const fast = first(['doubao-seedance-2.0-fast'], 'video');
  const sec = (m, r) => m?.price?.creditsPerSecond?.[r] || Object.values(m?.price?.creditsPerSecond || {})[0] || 0;
  const rows = [
    img && [credits / img.price.creditsPerImage, `${shortName(img)} images`],
    vid && sec(vid, '720p') && [credits / (sec(vid, '720p') * 5), `${shortName(vid)} videos (5 s, 720p)`],
    fast && fast !== vid && sec(fast, '480p') && [credits / (sec(fast, '480p') * 5), `${shortName(fast)} videos (5 s, 480p)`],
    chat && [credits / chat.price.creditsPerMessage, `${shortName(chat)} chat messages`],
  ].filter((x) => x && x[0] >= 1);
  return rows.map(([n, label]) => ({ n: nice(n), label }));
}
const examplesList = (credits) => { const ex = creditExamples(credits); return ex.length ? h('div', { class: 'gets' }, h('small', {}, 'Roughly, any one of'), ex.map((x) => h('div', {}, h('b', {}, '~' + x.n.toLocaleString()), ' ' + x.label))) : null; };
// Credits for one picture at the chosen size and quality (token-billed models cost more for bigger or higher-quality pictures).
const imageCreditsFor = (m, size, quality) => { const row = m?.price?.creditsBySize?.[size]; return (row && (row[quality] ?? row[''] ?? Object.values(row)[0])) ?? m?.price?.creditsPerImage ?? 0; };
// Images: up to the model's own per-request limit (Seedream 15, GPT Image 2.5 10), at least 4. Videos: 1 to 4.
const batchOptions = (m) => [1, 2, 3, 4, 6, 8, 10, 15].filter((n) => n <= (m?.image ? Math.max(4, Math.min(15, m.image.maxN || 1)) : 4));
// "2K", "3K" and "4K" let the model pick the shape at that resolution; everything else is width x height.
const sizeLabel = (s) => { const d = /^(\d+)x(\d+)$/.exec(s); if (!d) return { icon: '1:1', name: s === 'auto' ? 'Auto' : `${s} · auto shape`, px: s === 'auto' ? 'Matches the picture' : `${s} resolution` }; const w = Number(d[1]), hh = Number(d[2]); return { icon: `${w}:${hh}`, name: w === hh ? 'Square' : w > hh ? 'Landscape' : 'Portrait', px: `${w} × ${hh}` }; };
function estimate(mode) {
  const m = studioModel(mode); const st = S.studio[mode]; if (!m) return 0;
  if (mode === 'image') return imageCreditsFor(m, st.size, st.quality) * st.count;
  const per = m.price.creditsPerSecond[st.resolution] ?? Object.values(m.price.creditsPerSecond)[0] ?? 0;
  return per * (st.duration > 0 ? st.duration : 10) * st.count;
}

// ---------- boot ----------
async function boot() {
  S.config = await api('/api/config');
  try { S.user = (await api('/api/me')).user; } catch (e) { S.user = null; if (e.code === 'banned') setTimeout(() => toast(e.message, 'error'), 300); }
  const back = new URLSearchParams(location.search).get('auth');
  if (back) {
    history.replaceState(null, '', location.pathname + location.hash);
    const msg = { verified: ['Email confirmed. You are signed in.', ''], google: ['Signed in with Google.', ''], verify_expired: ['That confirmation link has expired or was already used. Sign in to get a new one.', 'error'], google_failed: ['Google sign-in did not finish. Please try again.', 'error'], google_off: ['Google sign-in is not set up on this server yet.', 'error'], banned: ['This account has been suspended. Please contact support if you think this is a mistake.', 'error'] }[back];
    if (msg) setTimeout(() => toast(msg[0], msg[1]), 300);
    if (S.user && (back === 'verified' || back === 'google')) applyIntent();
  }
  if (!S.user) {
    // Visitors see the landing page straight away; models and apps are public.
    await Promise.all([loadModels().catch(() => { S.models = []; }), api('/api/apps').then((r) => (S.apps = r.apps)).catch(() => { S.apps = []; })]);
    return renderPublic();
  }
  await afterLogin();
}
// What a signed-out visitor sees for the current address.
function renderPublic() {
  $$('.modal-bg').forEach((d) => d.remove());
  const hsh = location.hash;
  if (hsh === '#/login') return renderAuth('login');
  if (hsh === '#/signup') return renderAuth('signup');
  if (hsh.startsWith('#/reset/')) return renderReset(hsh.slice(8));
  if (hsh === '#/terms' || hsh === '#/privacy') return $('#app').replaceChildren(h('div', { class: 'lp' }, lpNav(), renderLegal(hsh.slice(2)), lpFooter()));
  if (hsh === '#/help' || hsh.startsWith('#/help/')) { const p = hsh.slice(2).split('/'); return import('./help.js').then((m) => m.renderHelp(p[1] || '', p[2] || '', { nav: lpNav, footer: lpFooter })); }
  return renderLanding();
}
async function afterLogin() {
  await Promise.all([loadModels(), loadConversations(), api('/api/apps').then((r) => (S.apps = r.apps)).catch(() => {}), loadProjects(), loadCharacters(), loadStyles()]);
  renderShell();
  route();
}
window.addEventListener('hashchange', () => { if (S.user) { if ($('#main')) route(); } else if (S.config) renderPublic(); });
async function loadModels() { S.models = (await api('/api/models')).models; }
// Video Builder and Video Agent projects are listed in Recents too, so they can be opened again.
// Work kept outside chats is listed in Recents too, so it can be opened again: Video Builder and Video Agent projects,
// Studio Pro agent sessions and Ad Studio brands.
const EXTRA_KINDS = new Set(['builder', 'pro', 'ads']);
const builderRecents = async () => {
  const star = (k, id) => store.get(k, []).includes(id);
  const f = hasPaidTools() ? S.config?.flags || {} : {}; // these tools are for paid plans, so the Free plan has nothing to list
  const [vb, ps, br] = await Promise.all([
    f.videoBuilder ? api('/api/builder/projects').then((r) => r.projects.filter((p) => p.origin !== 'pro').map((p) => ({ id: p.id, kind: 'builder', origin: p.origin, title: p.title, updatedAt: p.updatedAt, starred: star('vb-star', p.id) }))).catch(() => []) : [],
    f.studioPro ? api('/api/pro/sessions').then((r) => r.sessions.map((x) => ({ id: x.id, kind: 'pro', title: x.title, updatedAt: x.updatedAt, starred: star('pro-star', x.id) }))).catch(() => []) : [],
    f.studioPro ? api('/api/pro/brands').then((r) => r.brands.map((b) => ({ id: b.id, kind: 'ads', title: b.name, updatedAt: b.updatedAt, starred: star('pro-star', b.id) }))).catch(() => []) : [],
  ]);
  return [...vb, ...ps, ...br];
};
const mixRecents = (convs, vids) => [...convs.filter((c) => !EXTRA_KINDS.has(c.kind)), ...vids].sort((a, b) => (a.temp ? -1 : b.temp ? 1 : String(b.updatedAt).localeCompare(String(a.updatedAt))));
async function loadConversations() { const [c, v] = await Promise.all([api('/api/conversations'), builderRecents()]); S.conversations = mixRecents(c.conversations, v); }
window.__pmVbTitle = (id, title) => { const c = S.conversations.find((x) => x.id === id); if (!c) return window.__pmRecents(); c.updatedAt = new Date().toISOString(); if (c.title !== title) { c.title = title; } S.conversations = mixRecents(S.conversations.filter((x) => !EXTRA_KINDS.has(x.kind)), S.conversations.filter((x) => EXTRA_KINDS.has(x.kind))); renderRecents(); };
window.__pmRecents = async () => { if (!S.user) return; const v = await builderRecents(); S.conversations = mixRecents(S.conversations, v); renderRecents(); };

// ---------- auth ----------
function glowArt() {
  return h('div', { class: 'bgfx' },
    h('div', { class: 'orb', style: { width: '420px', height: '420px', left: '-80px', top: '-60px', background: '#04d9ff' } }),
    h('div', { class: 'orb', style: { width: '380px', height: '380px', right: '-60px', top: '30%', background: '#4361ee', animationDelay: '-4s' } }),
    h('div', { class: 'orb', style: { width: '300px', height: '300px', left: '30%', bottom: '-120px', background: '#3a0ca3', opacity: '.5', animationDelay: '-8s' } }),
  );
}
// What the visitor typed on the landing page, kept through sign up so their first chat starts by itself.
const intent = {
  get: () => { try { return JSON.parse(sessionStorage.getItem('pm-intent') || 'null'); } catch { return null; } },
  set: (v) => { try { v ? sessionStorage.setItem('pm-intent', JSON.stringify(v)) : sessionStorage.removeItem('pm-intent'); } catch { /* private mode */ } },
};
// After sign in: go where the visitor was heading and send their first message.
function applyIntent() {
  const it = intent.get(); intent.set(null);
  const go = (hash) => history.replaceState(null, '', hash);
  if (!it) { if (!location.hash || location.hash === '#' || /^#\/(login|signup)$/.test(location.hash)) go('#/'); return; }
  const m = it.modelId && byId(it.modelId);
  if (m) {
    if (it.mode === 'code') { S.codeModelId = m.id; store.set('code-model', m.id); }
    else if ((it.mode === 'image' || it.mode === 'video') && m.type === it.mode) { S.studio[it.mode].modelId = m.id; saveStudio(it.mode); }
    else if (m.type === 'chat') { S.chatModelId = m.id; store.set('chat-model', m.id); }
  }
  if (it.appId) return go('#/apps/' + it.appId);
  if (it.mode === 'image' || it.mode === 'video') { S.draft[it.mode] = it.text || ''; return go('#/' + it.mode); }
  if (it.mode === 'code') { S.pendingCode = it.text || ''; S.autoSend = !!it.text; return go('#/code'); }
  S.pendingChat = it.text || ''; S.autoSend = !!it.text; go('#/chat');
}
const GOOGLE_G = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.300-2.100 3.500-5.200 3.500-8.700Z"/><path fill="#34A853" d="M12 24c3.200 0 6-1.100 8-2.900l-3.900-3c-1.100.7-2.500 1.200-4.100 1.200-3.100 0-5.800-2.100-6.700-5H1.300v3.100A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.300 14.300a7.200 7.200 0 0 1 0-4.600V6.600H1.300a12 12 0 0 0 0 10.800l4-3.100Z"/><path fill="#EA4335" d="M12 4.800c1.800 0 3.300.6 4.600 1.800l3.400-3.400A12 12 0 0 0 1.300 6.600l4 3.100c.9-2.900 3.600-4.900 6.700-4.900Z"/></svg>';
function googleBtn() {
  if (!S.config.googleLogin && !S.config.devAuth) return null;
  return h('a', {
    class: 'btn google', href: '/api/auth/google',
    onclick: (e) => { if (!S.config.googleLogin) { e.preventDefault(); toast('Google sign-in switches on once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are in the .env file. The README has the steps.', 'error'); } },
  }, h('span', { class: 'g', html: GOOGLE_G }), 'Continue with Google');
}
async function signedIn(user, msg) {
  S.user = user;
  $$('.modal-bg').forEach((d) => d.remove());
  applyIntent();
  await afterLogin();
  if (msg) toast(msg);
}
// "Check your email" step after sign up. This tab signs itself in once the link is opened anywhere.
function verifyStep(form, email) {
  const note = h('div', { class: 'form-err' });
  const again = h('button', { class: 'btn', type: 'button', onclick: async () => {
    again.disabled = true; note.textContent = '';
    try { await api('/api/auth/resend', { method: 'POST', body: { email } }); note.className = 'form-ok'; note.textContent = 'Sent again. Check your spam folder too.'; }
    catch (ex) { note.className = 'form-err'; note.textContent = ex.message; }
    setTimeout(() => { again.disabled = false; }, 8000);
  } }, 'Send the email again');
  const codeIn = h('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, placeholder: '6-digit code', class: 'code-input', style: { textAlign: 'center', letterSpacing: '6px', fontSize: '20px', fontWeight: '600' } });
  const codeBtn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const code = codeIn.value.replace(/\D/g, '');
    if (code.length !== 6) { note.className = 'form-err'; note.textContent = 'Enter the 6-digit code from the email.'; return codeIn.focus(); }
    codeBtn.disabled = true; note.textContent = '';
    try { const r = await api('/api/auth/verify-code', { method: 'POST', body: { email, code } }); clearInterval(timer); signedIn(r.user, `Welcome! You have ${fmtCredits(r.user.credits)} free credits to start.`); }
    catch (ex) { note.className = 'form-err'; note.textContent = ex.message; codeBtn.disabled = false; codeIn.select(); }
  } }, 'Confirm');
  codeIn.addEventListener('input', () => { if (codeIn.value.replace(/\D/g, '').length === 6) codeBtn.click(); });
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); codeBtn.click(); } });
  const box = h('div', { class: 'verify-step' },
    h('div', { class: 'vs-ic' }, icon('send')),
    h('h3', {}, 'Check your email'),
    h('p', {}, 'We sent a confirmation email to ', h('b', {}, email), '. Press the button in it, or type the code here. This page continues by itself.'),
    h('div', { style: { display: 'flex', gap: '8px', margin: '4px 0 12px' } }, codeIn, codeBtn),
    again, note,
    h('p', { class: 'fine' }, 'Wrong address? ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); clearInterval(timer); form._swap('signup'); } }, 'Start again')),
  );
  [...form.children].forEach((c) => { if (!c.matches('.brand')) c.remove(); });
  form.append(box);
  form.onsubmit = (e) => e.preventDefault();
  const timer = setInterval(async () => {
    if (!form.isConnected) return clearInterval(timer);
    try { const u = (await api('/api/me')).user; if (u) { clearInterval(timer); signedIn(u, `Welcome! You have ${fmtCredits(u.credits)} free credits to start.`); } } catch { /* not confirmed yet */ }
  }, 3000);
}
function forgotStep(form, swap, email = '') {
  const err = h('div', { class: 'form-err' });
  const input = h('input', { name: 'email', type: 'email', required: true, autocomplete: 'email', placeholder: 'you@example.com', value: email });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Email me a reset link');
  const box = h('div', { class: 'verify-step left' },
    h('h3', {}, 'Reset your password'),
    h('p', {}, 'Enter your email and we will send you a link to choose a new password.'),
    h('label', { class: 'field' }, 'Email', input), err, btn,
    h('p', { style: { fontSize: '14px', textAlign: 'center' } }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); swap('login'); } }, 'Back to sign in')),
  );
  [...form.children].forEach((c) => { if (!c.matches('.brand')) c.remove(); });
  form.append(box);
  form.onsubmit = null;
  form._submit = async () => {
    err.textContent = ''; btn.disabled = true;
    try {
      const r = await api('/api/auth/forgot', { method: 'POST', body: { email: input.value } });
      box.replaceChildren(
        h('div', { class: 'vs-ic' }, icon('send')),
        h('h3', {}, 'Check your email'),
        h('p', {}, 'If ', h('b', {}, input.value), ' has an account, a reset link is on its way. It works for 1 hour.'),
        r.devLink && h('p', { class: 'dev-link' }, 'No email service is set up on this computer, so here is your link: ', h('a', { href: r.devLink }, 'Choose a new password')),
        h('p', { style: { fontSize: '14px', textAlign: 'center' } }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); swap('login'); } }, 'Back to sign in')),
      );
      box.classList.remove('left');
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  };
  setTimeout(() => input.focus(), 30);
}
function authForm(mode, swap) {
  const err = h('div', { class: 'form-err' });
  const isSignup = mode === 'signup';
  const free = S.config.plans[0].credits;
  const btn = h('button', { class: 'btn primary', type: 'submit' }, isSignup ? 'Start free trial' : 'Sign in');
  const g = googleBtn();
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (form._submit) return form._submit();
      err.replaceChildren(); btn.disabled = true;
      const fd = Object.fromEntries(new FormData(form));
      try {
        const r = await api(isSignup ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: fd });
        if (r.pending) return verifyStep(form, r.email);
        await signedIn(r.user, isSignup && `Welcome! You have ${fmtCredits(r.user.credits)} free credits to start.`);
      } catch (ex) {
        err.replaceChildren(ex.message);
        if (ex.code === 'unverified') err.append(' ', h('a', { href: '#', onclick: async (e2) => { e2.preventDefault(); try { await api('/api/auth/resend', { method: 'POST', body: { email: fd.email } }); verifyStep(form, fd.email); } catch (e3) { err.replaceChildren(e3.message); } } }, 'Send it again'));
        btn.disabled = false;
      }
    },
  },
    g, g && h('div', { class: 'or-line' }, h('span', {}, 'or')),
    isSignup && h('label', { class: 'field' }, 'Name', h('input', { name: 'name', autocomplete: 'name', placeholder: 'Your name' })),
    h('label', { class: 'field' }, 'Email', h('input', { name: 'email', type: 'email', required: true, autocomplete: 'email', placeholder: 'you@example.com' })),
    h('label', { class: 'field' }, h('span', { class: 'lab-row' }, 'Password', !isSignup && h('a', { href: '#', tabindex: '-1', class: 'forgot', onclick: (e) => { e.preventDefault(); forgotStep(form, swap, form.querySelector('input[name=email]')?.value || ''); } }, 'Forgot password?')),
      h('input', { name: 'password', type: 'password', required: true, minlength: isSignup ? 8 : null, autocomplete: isSignup ? 'new-password' : 'current-password', placeholder: isSignup ? 'At least 8 characters' : '••••••••' })),
    err,
    btn,
    isSignup && h('p', { class: 'fine' }, `${free} free credits to try every model. No card needed.`),
    isSignup && agreeLine(),
    h('p', { style: { fontSize: '14px', textAlign: 'center' } }, isSignup ? 'Already have an account? ' : 'New to Scenly? ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); swap(isSignup ? 'login' : 'signup'); } }, isSignup ? 'Sign in' : 'Create a free account')),
  );
  form._swap = swap;
  return form;
}
// The page a password reset link opens.
function renderReset(token) {
  const err = h('div', { class: 'form-err' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Save and sign in');
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); err.replaceChildren(); btn.disabled = true;
    try {
      const r = await api('/api/auth/reset', { method: 'POST', body: { token, password: form.password.value } });
      history.replaceState(null, '', '#/');
      await signedIn(r.user, 'Password changed. You are signed in.');
    } catch (ex) {
      err.replaceChildren(ex.message);
      if (ex.code === 'expired') err.append(' ', h('a', { href: '#/login' }, 'Back to sign in'));
      btn.disabled = false;
    }
  } },
    h('a', { class: 'brand', href: '#/', title: 'Back to the home page' }, h('img', { src: '/logo.svg', alt: '' }), 'Scenly'),
    h('h1', {}, 'Choose a new password'),
    h('p', {}, 'You will be signed in straight after.'),
    h('label', { class: 'field' }, 'New password', h('input', { name: 'password', type: 'password', required: true, minlength: 8, autocomplete: 'new-password', placeholder: 'At least 8 characters' })),
    err, btn,
  );
  $('#app').replaceChildren(h('div', { class: 'auth solo' }, h('div', { class: 'auth-form' }, form, h('div', { class: 'auth-legal' }, h('a', { href: '#/terms' }, 'Terms of Use'), h('a', { href: '#/privacy' }, 'Privacy Policy'), h('span', {}, COPYRIGHT)))));
  form.password.focus();
}
// Account details and password, from the menu at the bottom of the sidebar.
function openAccount() {
  const u = S.user;
  const err = h('div', { class: 'form-err' });
  const cur = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Your current password' });
  const nw = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'At least 8 characters', minlength: 8 });
  const btn = h('button', { class: 'btn primary', onclick: async () => {
    err.replaceChildren(); btn.disabled = true;
    try {
      const r = await api('/api/auth/password', { method: 'POST', body: { current: cur.value, password: nw.value } });
      S.user = { ...S.user, ...r.user };
      d.remove();
      toast(r.created ? 'Password added. You can now sign in with Google or with your email and password.' : 'Password changed.');
    } catch (ex) { err.replaceChildren(ex.message); btn.disabled = false; }
  } }, u.hasPassword ? 'Change password' : 'Add password');
  const how = u.google && u.hasPassword ? 'Google, or email and password' : u.google ? 'Google' : 'Email and password';
  const d = dialog({
    title: 'Account',
    body: [
      h('div', { class: 'acct-rows' },
        h('div', {}, h('span', {}, 'Name'), h('b', {}, u.name)),
        h('div', {}, h('span', {}, 'Email'), h('b', {}, u.email)),
        h('div', {}, h('span', {}, 'Sign in with'), h('b', {}, how)),
      ),
      h('h4', { class: 'acct-h' }, u.hasPassword ? 'Change your password' : 'Add a password'),
      !u.hasPassword && h('p', { class: 'acct-p' }, 'You sign in with Google. Add a password if you also want to sign in with your email.'),
      u.hasPassword && field('Current password', cur),
      field('New password', nw),
      err,
    ],
    foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Close'), btn],
  });
  nw.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
}
function renderAuth(mode = 'login') {
  const isSignup = mode === 'signup';
  const form = authForm(mode, (m) => { history.replaceState(null, '', '#/' + m); renderAuth(m); });
  form.prepend(
    h('a', { class: 'brand', href: '#/', title: 'Back to the home page' }, h('img', { src: '/logo.svg', alt: '' }), 'Scenly'),
    h('h1', {}, isSignup ? 'Create your free account' : 'Welcome back'),
    h('p', {}, isSignup ? `Start your free trial with ${S.config.plans[0].credits} credits.` : 'Sign in to keep creating.'),
  );
  $('#app').replaceChildren(h('div', { class: 'auth' },
    h('div', { class: 'auth-art' }, glowArt(),
      h('div', { class: 'brand', style: { position: 'relative', zIndex: 1 } }, h('img', { src: '/logo.svg', alt: '' }), 'Scenly'),
      h('div', { class: 'copy' },
        h('h2', {}, 'Light up your ideas with images, video and AI chat.'),
        h('p', {}, 'Seedance video with sound, Seedream, GPT Image and Nano Banana images, one-click AI apps, and every leading chat model. One credit balance.'),
      ),
      h('div', { class: 'auth-feats' },
        h('div', {}, icon('video'), 'Text, image & video to video'),
        h('div', {}, icon('image'), 'Image generation & edits'),
        h('div', {}, icon('apps'), 'One-click AI apps'),
        h('div', {}, icon('chat'), 'Chat with 30+ models'),
      ),
    ),
    h('div', { class: 'auth-form' }, form, h('div', { class: 'auth-legal' }, h('a', { href: '#/terms' }, 'Terms of Use'), h('a', { href: '#/privacy' }, 'Privacy Policy'), h('span', {}, COPYRIGHT))),
  ));
  form.querySelector('input[name=email]')?.focus();
}

// The sign up step a visitor meets after their first message, or when they pick an app.
function openGate(it, mode = 'signup') {
  intent.set(it);
  $$('.modal-bg.gate').forEach((d) => d.remove());
  const app = it?.appId && S.apps.find((a) => a.id === it.appId);
  const free = S.config.plans[0].credits;
  const signup = mode === 'signup';
  const form = authForm(mode, (m) => openGate(it, m));
  const picked = it?.modelId && byId(it.modelId);
  const what = app ? `Open ${app.name}` : !it?.text && picked ? `Start with ${shortName(picked)}` : it?.text ? ({ chat: 'Your message', image: 'Your image idea', video: 'Your video idea', code: 'Your build' }[it.mode] || 'Your message') : '';
  const bg = h('div', { class: 'modal-bg dlg gate', onmousedown: (e) => { if (e.target === bg) bg.remove(); } },
    h('div', { class: 'gate-box' },
      h('button', { class: 'icon-btn gate-x', title: 'Close', onclick: () => bg.remove() }, icon('x')),
      h('div', { class: 'brand' }, h('img', { src: '/logo.svg', alt: '' }), 'Scenly'),
      h('h2', {}, signup ? 'Create a free account to continue' : 'Sign in to continue'),
      h('p', { class: 'gate-sub' }, signup ? `Start your free trial with ${free} credits. It takes a few seconds${it?.text ? ', then your message is sent for you' : ''}.` : it?.text ? 'Your message is sent as soon as you are in.' : 'Welcome back.'),
      what && h('div', { class: 'gate-quote' + (picked ? ' with-model' : '') }, picked && modelLogo(picked, 'logo'), h('div', { class: 'gq' }, h('small', {}, what, picked && it.text ? ` · ${shortName(picked)}` : ''), !app && it.text && h('div', {}, it.text))),
      form,
    ));
  document.body.append(bg);
  setTimeout(() => form.querySelector(signup ? 'input[name=name]' : 'input[name=email]')?.focus(), 30);
}

// ---------- Terms of Use and Privacy Policy ----------
const legalId = (t) => 'lg-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function legalBlocks(blocks) {
  const out = []; let list = null;
  for (const b of blocks) {
    if (b.startsWith('- ')) { if (!list) out.push(list = h('ul', {})); list.append(h('li', {}, b.slice(2))); continue; }
    list = null;
    out.push(b.startsWith('## ') ? h('h3', {}, b.slice(3)) : h('p', { class: b === b.toUpperCase() && /[A-Z]{12}/.test(b) ? 'caps' : '' }, b));
  }
  return out;
}
function renderLegal(kind) {
  const doc = kind === 'privacy' ? PRIVACY : TERMS;
  const other = kind === 'privacy' ? ['#/terms', 'Terms of Use'] : ['#/privacy', 'Privacy Policy'];
  const jump = (e, id) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const mail = S.config?.supportEmail;
  return h('article', { class: 'legal' },
    h('div', { class: 'legal-eyebrow' }, 'Legal'),
    h('h1', {}, doc.title),
    h('div', { class: 'legal-meta' }, `Last updated ${LEGAL_UPDATED}`, h('span', {}, '·'), `${LEGAL_COMPANY}, ${LEGAL_PLACE}`),
    h('nav', { class: 'legal-toc' }, h('b', {}, 'On this page'), h('ol', {}, doc.sections.map(([t]) => h('li', {}, h('a', { href: '#', onclick: (e) => jump(e, legalId(t)) }, t))))),
    h('div', { class: 'legal-intro' }, legalBlocks(doc.intro)),
    doc.sections.map(([t, ...blocks], i) => h('section', { id: legalId(t) }, h('h2', {}, `${i + 1}. ${t}`), legalBlocks(blocks))),
    h('section', { class: 'legal-contact' },
      h('p', {}, h('b', {}, LEGAL_COMPANY), h('br'), LEGAL_PLACE, mail ? [h('br'), 'Email: ', h('a', { href: 'mailto:' + mail }, mail)] : null),
      h('p', {}, 'Related: ', h('a', { href: other[0] }, other[1])),
    ),
  );
}
// Top menu and footer of the public pages. The links, the phone menu and the footer live in landing.js.
function lpNav() {
  return h('header', { class: 'lp-nav' },
    h('a', { class: 'brand', href: '#/' }, h('img', { src: '/logo.svg', alt: '' }), 'Scenly'),
    h('nav', {}, ...lpLinks()),
    h('div', { class: 'grow' }),
    themeBtn(),
    h('a', { class: 'btn ghost', href: '#/login' }, 'Log in'),
    h('a', { class: 'btn primary', href: '#/signup' }, 'Start free'),
    lpBurger(),
  );
}
const lpFooter = () => landingFooter();
const agreeLine = () => h('p', { class: 'fine agree' }, 'By continuing you agree to the ', h('a', { href: '#/terms', target: '_blank' }, 'Terms of Use'), ' and ', h('a', { href: '#/privacy', target: '_blank' }, 'Privacy Policy'), ', and confirm you are 18 or older.');

// ---------- landing page for visitors ----------
function renderLanding() {
  const free = S.config.plans[0].credits;
  let mode = intent.get()?.mode || 'chat';
  const ideas = {
    chat: [['Plan a trip', 'Plan a 3-day trip to Lisbon on a budget.'], ['Write an email', 'Write a friendly email asking a client to confirm a meeting next Tuesday.'], ['Explain something', 'Explain how compound interest works with a simple example.'], ['Service agreement', 'Create a simple service agreement as a Word document.']],
    image: [['Product shot', 'A minimalist product photo of a matte black water bottle on a pastel background, soft studio light'], ['Poster', 'A retro travel poster of the Swiss Alps with bold typography that says "ALPS"'], ['Logo idea', 'A clean modern logo for a coffee shop called Bean & Leaf']],
    video: [['Cinematic', 'A slow cinematic dolly shot through a neon-lit rainy alley at night'], ['Nature', 'Aerial drone shot over turquoise ocean waves breaking on white sand, golden hour'], ['Product ad', 'A 10 second ad of a running shoe splashing through water in slow motion']],
    code: [['Landing page', 'Build a modern landing page for a specialty coffee subscription: hero, features, pricing and a signup form.'], ['Dashboard', 'Build a sales analytics dashboard with KPI cards and charts using example data.'], ['To-do app', 'Build a to-do app with add, complete, filter and local storage.']],
  };
  const holder = { chat: 'Ask anything', image: 'Describe the image you want', video: 'Describe the scene for your video', code: 'Describe what to build' };
  const ta = h('textarea', { id: 'lp-prompt', rows: 2, placeholder: holder[mode] });
  const chosen = { ...(intent.get()?.modelId ? { [intent.get().mode || 'chat']: intent.get().modelId } : {}) };
  const modelsFor = (k) => (k === 'code' ? codeModels() : S.models.filter((x) => x.type === k && !(k === 'video' && !x.video?.textToVideo && !x.video?.imageToVideo)));
  const current = () => byId(chosen[mode]) || (mode === 'code' ? codeModel() : mode === 'chat' ? chatModel() : studioModel(mode));
  const chip = h('button', { class: 'chipbtn lp-model-chip', title: 'Choose a model', onclick: (e) => pickModel(e.currentTarget) });
  const drawChip = () => { const m = current(); chip.replaceChildren(...(m ? [modelLogo(m, 'logo-sm'), h('span', { class: 'nm' }, shortName(m))] : [h('span', { class: 'nm' }, 'Choose a model')]), icon('down')); };
  // Visitors can browse every model; choosing one asks them to sign up, keeping what they typed.
  const pickModel = (anchor) => {
    let q = '';
    const list = h('div', { class: 'pick-list' });
    const draw = () => {
      const ms = modelsFor(mode).filter((m) => !q || (m.name + m.provider + m.id + (m.blurb || '')).toLowerCase().includes(q));
      const cur = current();
      list.replaceChildren(...ms.map((m) => h('button', { class: 'mopt' + (m.id === cur?.id ? ' sel' : ''), onclick: () => { closePop(); chosen[mode] = m.id; drawChip(); openGate({ mode, text: ta.value.trim(), modelId: m.id }); } },
        modelLogo(m),
        h('div', { class: 'txt' },
          h('div', { class: 'nm' }, shortName(m), m.caps?.includes('reasoning') && h('span', { class: 'tag dim' }, 'reasoning'), m.vision && h('span', { class: 'tag dim' }, 'vision'), costTag(m)),
          h('div', { class: 'ds', title: m.type === 'video' ? modelPitch(m) : '' }, modelBlurb(m)),
        ),
        m.id === cur?.id && icon('check', 'chk'),
      )));
      if (!ms.length) list.append(h('div', { class: 'empty' }, 'No models match'));
    };
    const input = h('input', { class: 'field-input', placeholder: 'Search models', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
    popover(anchor, h('div', { class: 'models picker', style: { width: '360px' } }, h('div', { style: { padding: '4px', flex: 'none' } }, input), h('div', { class: 'menu-head' }, `${kindLabel[mode].toUpperCase()} MODELS · ${modelsFor(mode).length}`), list), 'auto');
    draw(); if (!matchMedia('(max-width: 860px)').matches) input.focus();
  };
  ta.value = intent.get()?.text || '';
  const send = h('button', { class: 'send', id: 'lp-send', title: 'Send', onclick: () => go() }, icon('up'));
  const seg = h('div', { class: 'seg' });
  const sugg = h('div', { class: 'suggests' });
  const sync = () => { autoGrow(ta); send.disabled = !ta.value.trim(); };
  const draw = () => {
    seg.replaceChildren(...['chat', 'image', 'video', 'code'].map((k) => h('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; draw(); ta.focus(); } }, icon(k === 'code' ? 'terminal' : k), kindLabel[k])));
    ta.placeholder = holder[mode];
    drawChip();
    sugg.replaceChildren(...ideas[mode].map(([label, text]) => h('button', { class: 'suggest', onclick: () => { ta.value = text; sync(); ta.focus(); } }, icon(mode === 'chat' ? 'sparkle' : mode === 'code' ? 'terminal' : mode), label)));
  };
  const go = () => { const text = ta.value.trim(); if (!text) return ta.focus(); openGate({ mode, text, modelId: current()?.id }); };
  ta.addEventListener('input', sync);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } });
  draw();

  const page = h('div', { class: 'lp' },
    lpNav(),
    h('section', { class: 'lp-hero' }, glowArt(),
      h('div', { class: 'lp-hero-in' },
        h('div', { class: 'lp-eyebrow' }, icon('sparkle'), 'Chat, images, video, ads and documents in one studio'),
        h('h1', {}, 'Create anything with ', h('span', { class: 'grad' }, 'every leading AI model')),
        h('p', {}, `Type an idea and get an answer, a picture, a video or a finished document. Start free with ${free.toLocaleString('en-US')} credits, no card needed.`),
        h('div', { class: 'bar lp-bar' }, h('div', { class: 'bar-top' }, ta), h('div', { class: 'bar-row' }, seg, chip, h('div', { class: 'grow' }), send)),
        sugg,
        landingStats(),
      ),
    ),
    landingSections({ examplesList, appCover, openGate }),
    h('section', { class: 'lp-end' }, h('h2', {}, 'Your first scene is one sentence away'), h('p', {}, `Create a free account, get ${free.toLocaleString('en-US')} credits and try every model.`), h('div', { class: 'lp-end-btns' }, h('a', { class: 'btn primary', href: '#/signup' }, 'Create a free account'), h('a', { class: 'btn ghost', href: '#/login' }, 'I already have an account'))),
    lpFooter(),
  );
  $('#app').replaceChildren(page);
  sync();
  if (!matchMedia('(max-width: 860px)').matches) ta.focus();
}

// ---------- shell ----------
// Video Agent, Video Builder, Studio Pro and Ad Studio are for Pro and above. On the Free plan their menu
// entries show "Pro" in place of "New", and opening one shows what it does and how to get it.
const PAID_TOOLS = {
  agent: ['Video Agent', 'sparkle', 'Describe a video and get a full storyboard, scene by scene, ready to generate.'],
  builder: ['Video Builder', 'film', 'Build videos up to 5 minutes from scenes, with music, voice-over and captions.'],
  pro: ['Studio Pro', 'wand', 'A guided image and video studio that plans the shots for you.'],
  ads: ['Ad Studio', 'megaphone', 'Turn your website into a brand kit, then into picture and video ads.'],
};
// Locked only when the server says this account has no paid plan. Admins always get in, and a server that has
// not been restarted yet (it does not send paidPlan) locks nothing.
const hasPaidTools = () => !!S.user && (S.user.isAdmin || S.user.paidPlan !== false);
const needsPaidPlan = (section) => !!PAID_TOOLS[section] && !hasPaidTools();
const paidTag = () => (hasPaidTools() ? h('span', { class: 'tag new' }, 'New') : h('span', { class: 'tag dim', title: 'In the Pro, Max and Ultra plans' }, 'Pro'));
function renderPaidOnly(section) {
  const [name, ic, what] = PAID_TOOLS[section];
  const plans = S.config.plans.filter((p) => p.priceUsd > 0);
  $('#main').replaceChildren(topbar(), h('div', { class: 'scroll' }, h('div', { class: 'paid-only' },
    h('div', { class: 'up-ico' }, icon(ic)),
    h('h1', {}, `${name} is part of the paid plans`),
    h('p', { class: 'sub' }, what),
    h('p', { class: 'sub' }, 'Chat, images, Video Studio, documents, Code and the AI apps stay free to use with your credits.'),
    h('div', { class: 'paid-only-plans' }, plans.map((p) => h('a', { class: 'up-plan' + (p.popular ? ' pop' : ''), href: '#/billing' }, h('b', {}, p.name), h('span', {}, `$${p.priceUsd}/month`), h('small', {}, `${p.credits.toLocaleString()} credits each month`)))),
    h('a', { class: 'btn primary', href: '#/billing' }, 'See plans'),
  )));
}
function navLink(href, nav, ic, label, tag) {
  return h('a', { class: 'nav', href, 'data-nav': nav, onclick: closeMobile }, icon(ic), h('span', { class: 'grow' }, label), tag);
}
function renderShell() {
  const plan = S.config.plans.find((p) => p.id === S.user.plan)?.name || 'Free';
  const shell = h('div', { class: 'shell' + (store.get('side', 1) === 0 ? ' collapsed' : ''), id: 'shell' },
    h('aside', { class: 'sidebar' },
      h('div', { class: 'side-top' },
        h('a', { class: 'brand', href: '#/home', title: 'Home', onclick: closeMobile }, h('img', { src: '/logo.svg', alt: '' }), 'Scenly'),
        h('button', { class: 'icon-btn sm', title: 'Hide sidebar', onclick: toggleSidebar }, icon('side')),
      ),
      h('a', { class: 'btn primary block new-chat', href: '#/chat', onclick: () => { S.conv = null; closeMobile(); } }, icon('plus'), 'New chat'),
      h('div', { class: 'side-scroll' },
        navLink('#/chat', 'chat', 'chat', 'Chat'),
        navLink('#/image', 'image', 'image', 'Image'),
        navLink('#/video', 'video', 'video', S.config.flags?.videoBuilder || S.config.flags?.videoAgent ? 'Video Studio' : 'Video'),
        S.config.flags?.videoAgent && S.config.flags?.videoBuilder && navLink('#/agent', 'agent', 'sparkle', 'Video Agent', paidTag()),
        S.config.flags?.videoBuilder && navLink('#/builder', 'builder', 'film', 'Video Builder', paidTag()),
        S.config.flags?.studioPro && navLink('#/pro', 'pro', 'wand', 'Studio Pro', paidTag()),
        S.config.flags?.studioPro && navLink('#/ads', 'ads', 'megaphone', 'Ad Studio', paidTag()),
        navLink('#/code', 'code', 'terminal', 'Code'),
        h('div', { class: 'side-label' }, 'WORKSPACE'),
        navLink('#/projects', 'projects', 'project', 'Projects'),
        navLink('#/characters', 'characters', 'face', 'Characters'),
        navLink('#/apps', 'apps', 'apps', 'AI Apps', h('span', { class: 'tag hot' }, 'Hot')),
        navLink('#/assets', 'assets', 'folder', 'Assets'),
        navLink('#/help', 'help', 'help', 'Help'),
        S.user.isAdmin && navLink('#/admin', 'admin', 'chart', 'Admin'),
        h('div', { class: 'side-label recents-head' }, 'RECENTS',
          h('button', { class: 'icon-btn sm', title: 'Search your history', onclick: () => { const b = $('#side-search'); b.hidden = !b.hidden; if (b.hidden) { S.search = ''; b.querySelector('input').value = ''; renderRecents(); } else b.querySelector('input').focus(); } }, icon('search'))),
        h('label', { class: 'search side-search', id: 'side-search', hidden: !S.search }, icon('search'), h('input', { placeholder: 'Search chats, images, videos, projects', value: S.search, oninput: (e) => { S.search = e.target.value; renderRecents(); } })),
        h('nav', { class: 'conv-list', id: 'recents' }),
      ),
      h('div', { class: 'side-foot' },
        // The credit balance is shown in the top bar on every page, so the side menu no longer repeats it.
        h('button', { class: 'user-chip', onclick: (e) => openUserMenu(e.currentTarget) },
          h('div', { class: 'avatar' }, (S.user.name || S.user.email)[0].toUpperCase()),
          h('div', { class: 'meta' }, h('div', {}, S.user.name || S.user.email), h('small', {}, plan + ' plan')),
        ),
      ),
    ),
    h('main', { class: 'main', id: 'main', onclick: (e) => { if ($('#shell').classList.contains('mobile-open') && !e.target.closest('.menu-btn')) closeMobile(); } }),
  );
  $('#app').replaceChildren(shell);
  renderRecents();
  setupDrop();
}
function toggleSidebar() {
  const sh = $('#shell');
  if (matchMedia('(max-width: 860px)').matches) { sh.classList.toggle('mobile-open'); return; }
  sh.classList.toggle('collapsed');
  store.set('side', sh.classList.contains('collapsed') ? 0 : 1);
}
const closeMobile = () => $('#shell')?.classList.remove('mobile-open');

// The "?" in the top bar opens the help article for the page you are on (articles in help-content.js).
const HELP_FOR = { chat: 'chat', c: 'chat', image: 'image', video: 'video-studio', agent: 'video-agent', builder: 'video-builder', pro: 'studio-pro', ads: 'ad-studio', code: 'code', apps: 'ai-apps', assets: 'assets-recents', billing: 'billing', projects: 'projects', characters: 'characters', home: 'find-your-way' };
const HELP_PRO = { agent: 'agent', video: 'video', image: 'image', enhance: 'enhancer', enhancer: 'enhancer' };
function helpBtn() {
  const [, sec = 'chat', sub = ''] = (location.hash.replace(/^#/, '') || '/').split('/');
  if (sec === 'help') return null;
  const id = HELP_FOR[sec || 'chat'];
  const href = !id ? '#/help' : '#/help/' + id + (sec === 'pro' && HELP_PRO[sub] ? '/' + HELP_PRO[sub] : '');
  return h('a', { class: 'help-btn', href, title: id ? 'Help for this page' : 'Help', 'aria-label': 'Help' }, icon('help'));
}
function topbar(left = [], right = null) {
  return h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn menu-btn', title: 'Menu', onclick: toggleSidebar }, icon('menu')),
    left,
    h('div', { class: 'grow' }),
    right,
    helpBtn(),
    themeBtn(),
    h('a', { class: 'pill', href: '#/billing', title: 'Your credits' }, icon('bolt'), h('span', { 'data-credits': '' }, fmtCredits(S.user.credits))),
    h('a', { class: 'pill pricing-pill', href: '#/billing' }, 'Pricing', S.user.plan === 'free' && h('span', { class: 'badge' }, 'UPGRADE')),
  );
}

let openPop = null;
function popover(anchor, content, place = 'auto') {
  closePop();
  const pop = h('div', { class: 'popover' }, content);
  document.body.append(pop);
  if (anchor.classList?.contains('folded')) anchor = anchor.closest('.bar-row')?.querySelector('#bar-more') || anchor;
  const r = anchor.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  // Open on the side with room, never past the window edge. When opening upward the popover is pinned
  // by its bottom edge, so it grows upward when its content changes (tabs, search) instead of off-screen.
  const spaceAbove = r.top - 16, spaceBelow = innerHeight - r.bottom - 16;
  const up = place === 'above'
    ? spaceAbove >= Math.min(pr.height, 320) || spaceAbove >= spaceBelow
    : place === 'auto' && pr.height > spaceBelow && spaceAbove > spaceBelow;
  const maxH = Math.max(160, Math.min(560, up ? spaceAbove : spaceBelow));
  const left = Math.min(r.left, innerWidth - pr.width - 10);
  pop.style.setProperty('--pop-max', maxH + 'px');
  Object.assign(pop.style, { maxHeight: maxH + 'px', left: Math.max(8, left) + 'px' },
    up ? { bottom: (innerHeight - r.top + 8) + 'px', top: 'auto' } : { top: (r.bottom + 8) + 'px' });
  openPop = pop;
  const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePop(); };
  setTimeout(() => { if (openPop === pop) document.addEventListener('mousedown', outside); }, 0);
  pop._off = () => document.removeEventListener('mousedown', outside);
  return pop;
}
function closePop() { if (openPop) { openPop._off?.(); openPop.remove(); openPop = null; } }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (openPop) closePop(); else if ($('.lightbox')) { const l = $('.lightbox'); l._close ? l._close() : l.remove(); } else if ($('.modal-bg')) { const d = [...$$('.modal-bg')].pop(); if (d.classList.contains('app')) closeAppModal(); else d.remove(); } } });

function openUserMenu(anchor) {
  popover(anchor, h('div', { class: 'menu' },
    h('div', { style: { padding: '8px 10px', fontSize: '13px', color: 'var(--muted)' } }, S.user.email),
    h('hr'),
    h('button', { onclick: () => { closePop(); openAccount(); } }, icon('user'), 'Account & password'),
    h('a', { href: '#/billing', onclick: closePop }, icon('coin'), 'Plans & credits'),
    h('a', { href: '#/assets', onclick: closePop }, icon('folder'), 'My assets'),
    h('a', { href: '#/help', onclick: closePop }, icon('help'), 'Help'),
    h('button', { onclick: () => { toggleTheme(); closePop(); } }, icon(theme() === 'light' ? 'moon' : 'sun'), theme() === 'light' ? 'Dark mode' : 'Light mode'),
    h('hr'),
    h('a', { href: '#/terms', onclick: closePop }, icon('doc'), 'Terms of Use'),
    h('a', { href: '#/privacy', onclick: closePop }, icon('lock'), 'Privacy Policy'),
    h('hr'),
    h('button', { onclick: async () => { await api('/api/auth/logout', { method: 'POST' }); location.hash = ''; location.reload(); } }, icon('out'), 'Sign out'),
  ), 'above');
}

// ---------- answers in progress ----------
// An answer keeps generating when you open another chat or page. Each one is a job tied to its conversation:
// it keeps the live message element, so coming back shows the answer where it has got to.
const JOBS = new Set();
const UNREAD = new Set(); // conversations whose answer finished while you were elsewhere
const jobOf = (conv) => (conv ? [...JOBS].find((j) => j.conv === conv || (conv.id && j.conv.id === conv.id)) : null);
const jobById = (cid) => (cid ? [...JOBS].find((j) => j.conv.id === cid && j.kind !== 'studio' && j.kind !== 'app') : null);
const isWorking = (cid) => [...JOBS].some((j) => j.conv.id === cid) || [...APP_WATCH.values()].some((w) => w.cid === cid);
function endJob(job, { unread = false } = {}) {
  JOBS.delete(job);
  if (unread && job.conv.id) UNREAD.add(job.conv.id);
  updateSend(); updateCodeSend(); renderRecents();
}
function noteConv(summary) {
  const ex = S.conversations.find((x) => x.id === summary.id);
  if (ex) Object.assign(ex, summary); else S.conversations.unshift(summary);
  S.conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  renderRecents();
}
// A brand new image or video has no saved chat or session until the first result is back.
// Until then it is shown in Recents as a working entry, so the person can see it and get back to it.
function tempConv(kind, title, href) {
  const c = { id: 'tmp_' + Math.random().toString(36).slice(2), kind, title: (String(title || '').trim() || (kind === 'video' ? 'New video' : kind === 'image' ? 'New image' : 'New chat')).slice(0, 80), updatedAt: new Date().toISOString(), temp: true, href };
  S.conversations.unshift(c); renderRecents();
  return c;
}
function dropTemp(c) { if (c && S.conversations.includes(c)) { S.conversations = S.conversations.filter((x) => x !== c); } }
const convMark = (c) => (c.temp || isWorking(c.id) ? h('span', { class: 'spin conv-spin', title: 'Working…' }) : icon(convIcon(c)));
window.addEventListener('beforeunload', (e) => { if ([...JOBS].some((j) => j.ctrl)) { e.preventDefault(); e.returnValue = ''; } });

// ---------- routing ----------
let pollTimer = null;
async function route() {
  closePop();
  clearTimeout(pollTimer);
  const hash = location.hash.replace(/^#/, '') || '/';
  const section = hash.startsWith('/c/') ? 'chat' : hash.split('/')[1] || 'chat';
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === section));
  if (section !== 'apps') closeAppModal(true);
  if (section !== 'builder') window.__pmBuilderOff?.();
  $$('.modal-bg.dlg').forEach((d) => d.remove());
  renderRecents();
  if (hash.startsWith('/c/')) {
    const cid = hash.slice(3);
    UNREAD.delete(cid);
    const running = jobById(cid);
    if (running?.kind === 'code') { location.hash = '#/code/' + cid; return; }
    if (running) S.conv = running.conv;
    else if (S.conv?.id !== cid || !S.conv.messages) {
      try { S.conv = (await api('/api/conversations/' + cid)).conversation; } catch { toast('Chat not found', 'error'); location.hash = '#/chat'; return; }
    }
    if (S.conv.kind === 'code') { S.conv = null; location.hash = '#/code/' + cid; return; }
    if (S.conv.kind === 'app') { const aid = S.conv.appId; S.conv = null; location.hash = '#/apps/' + aid; return; }
    if (S.conv.kind === 'image' || S.conv.kind === 'video') { const k = S.conv.kind; S.conv = null; location.hash = `#/${k}/${cid}`; return; }
    return renderChat();
  }
  if (section === 'code') return renderCode(hash.split('/')[2]);
  if (section === 'chat') { S.conv = S.resume && jobOf(S.resume) ? S.resume : null; S.resume = null; return renderChat(); }
  if (section === 'image' || section === 'video') return openStudio(section, hash.split('/')[2] || null);
  if (section === 'apps') return renderApps(hash.split('/')[2]);
  if (section === 'projects') return renderProjects(hash.split('/')[2]);
  if (section === 'characters') return renderCharacters();
  if (needsPaidPlan(section) && (section === 'builder' || section === 'agent' ? S.config.flags?.videoBuilder : S.config.flags?.studioPro)) return renderPaidOnly(section);
  if (section === 'builder' && S.config.flags?.videoBuilder) { window.__pmRecents(); const m = await import('./builder.js'); return m.renderBuilder(hash.split('/')[2] || ''); }
  if (section === 'agent' && S.config.flags?.videoAgent && S.config.flags?.videoBuilder) { window.__pmRecents(); const m = await import('./agent.js'); return m.renderAgent(); }
  // Ad Studio is a main feature with its own address; its old address inside Studio Pro still opens it.
  if (section === 'pro' && hash.split('/')[2] === 'ads' && S.config.flags?.studioPro) { location.replace('#/ads' + (hash.split('/')[3] ? '/' + hash.split('/')[3] : '')); return; }
  if ((section === 'ads' || section === 'pro') && S.config.flags?.studioPro) window.__pmRecents();
  if (section === 'ads' && S.config.flags?.studioPro) { const m = await import('./pro.js'); return m.renderPro('ads', hash.split('/')[2] || ''); }
  if (section === 'pro' && S.config.flags?.studioPro) { const m = await import('./pro.js'); return m.renderPro(hash.split('/')[2] || '', hash.split('/')[3] || ''); }
  if (section === 'assets') return renderAssets();
  if (section === 'help') { const m = await import('./help.js'); return m.renderHelp(hash.split('/')[2] || '', hash.split('/')[3] || ''); }
  if (section === 'billing') return renderBilling();
  if (section === 'terms' || section === 'privacy') return $('#main').replaceChildren(topbar(), h('div', { class: 'scroll' }, renderLegal(section), h('div', { class: 'legal-copy' }, COPYRIGHT)));
  if (section === 'admin') return renderAdmin(hash.split('/')[2], hash.split('/')[3]);
  if (section === 'home') return renderHome();
  S.conv = null; return renderChat();
}

// ---------- uploads ----------
async function uploadFiles(files) {
  const fd = new FormData(); files.forEach((f) => fd.append('files', f));
  const r = await api('/api/files', { method: 'POST', body: fd });
  r.errors.forEach((e) => toast(e, 'error'));
  return r.files;
}
function pickFiles(accept, multiple, cb) {
  const inp = h('input', { type: 'file', accept, multiple, hidden: true, onchange: (e) => { const f = [...e.target.files]; inp.remove(); if (f.length) cb(f); } });
  document.body.append(inp); inp.click();
}
async function mediaAsFile(item) {
  const r = await api(`/api/media/${item.id}/as-file`, { method: 'POST' });
  return { ...r.file, preview: item.url };
}
const refThumb = (a) => a.preview || (a.id ? `/api/files/${a.id}/raw` : '');

let dropTarget = null; // a function(files) for the current page
function setupDrop() {
  let depth = 0, zone = null;
  window.ondragenter = (e) => { if (!e.dataTransfer?.types.includes('Files') || !dropTarget) return; depth++; if (!zone) { zone = h('div', { class: 'dropzone' }, 'Drop to add as reference'); document.body.append(zone); } };
  window.ondragleave = () => { if (--depth <= 0) { depth = 0; zone?.remove(); zone = null; } };
  window.ondragover = (e) => e.preventDefault();
  window.ondrop = (e) => { e.preventDefault(); depth = 0; zone?.remove(); zone = null; if (e.dataTransfer?.files.length && dropTarget && !e.target.closest('.drop')) dropTarget([...e.dataTransfer.files]); };
}

// ---------- lightbox ----------
function openLightbox(item, gen) {
  if (item.type !== 'video' && item.id) return openEditor(item, gen);
  const m = byId(item.model || gen?.model);
  const isVideo = item.type === 'video';
  const lb = h('div', { class: 'lightbox', onclick: (e) => { if (e.target === lb || e.target.classList.contains('stage')) lb.remove(); } },
    h('div', { class: 'stage' }, isVideo ? h('video', { src: item.url, controls: true, autoplay: true, playsinline: true }) : h('img', { src: item.url, alt: item.prompt || '' })),
    h('aside', {},
      h('div', { class: 'lab' }, 'Prompt'),
      h('p', {}, item.prompt || gen?.prompt || ''),
      m && h('div', { class: 'gen-meta' }, h('span', { class: 'meta-chip model' }, modelLogo(m, 'logo-xs'), shortName(m)), gen?.params && paramChips(gen)),
      h('div', { class: 'acts' },
        h('a', { class: 'btn', href: item.url, download: '' }, icon('dl'), 'Download'),
        h('button', { class: 'btn', onclick: () => { lb.remove(); reusePrompt(gen || { mode: item.type, prompt: item.prompt, model: item.model }); } }, icon('retry'), 'Reuse prompt'),
        !isVideo && h('button', { class: 'btn', onclick: async () => { lb.remove(); await useAsReference(item, 'image'); } }, icon('edit'), 'Edit this image'),
        !isVideo && h('button', { class: 'btn primary', onclick: async () => { lb.remove(); await useAsReference(item, 'video'); } }, icon('play'), 'Animate'),
        isVideo && byId(S.studio.video.modelId) && h('button', { class: 'btn', onclick: async () => { lb.remove(); await useAsReference(item, 'video'); } }, icon('swap'), 'Restyle this video'),
      ),
    ),
    h('button', { class: 'icon-btn close', onclick: () => lb.remove() }, icon('x')),
  );
  document.body.append(lb);
}

async function useAsReference(item, mode) {
  try {
    const f = await mediaAsFile(item);
    const st = S.studio[mode];
    if (f.kind === 'video') {
      const vm = S.models.find((m) => m.type === 'video' && m.video.videoToVideo && m.video.textToVideo) || S.models.find((m) => m.type === 'video' && m.video.videoToVideo);
      if (vm) st.modelId = vm.id;
      st.task = 'edit';
    } else if (mode === 'video' && !studioModel('video').video.imageToVideo) {
      const vm = S.models.find((m) => m.type === 'video' && m.video.imageToVideo); if (vm) st.modelId = vm.id;
    }
    if (mode === 'video' && f.kind === 'image') st.task = 'create';
    st.refs = [...st.refs.filter((r) => r.kind === f.kind), f].slice(-refLimit(mode, f.kind));
    if (mode === 'video' && f.kind === 'image' && !S.draft.video) S.draft.video = 'Bring this image to life with natural motion and a slow cinematic camera push-in.';
    S.view[mode] = 'creations';
    if (!(mode === 'image' && await resumeHome(item, mode))) goStudio(mode);
    toast(f.kind === 'video' ? 'Video added as reference' : mode === 'video' ? 'Image added. Describe the motion and generate.' : 'Image added as reference. Describe the edit.');
  } catch (e) { errToast(e); }
}
function refLimit(mode, kind) {
  const m = studioModel(mode);
  if (mode === 'image') return m?.image.edit?.max_images || 1;
  return kind === 'video' ? m?.video.maxVideos || 1 : m?.video.maxImages || 1;
}
// Work picked up again continues in the session it came from, which moves to the top of Recents.
async function resumeHome(x, mode) {
  const sid = x.sessionId;
  if (!sid || !S.conversations.some((c) => c.id === sid && c.kind === mode)) return false;
  try { noteConv((await api(`/api/conversations/${sid}/touch`, { method: 'POST' })).conversation); } catch { /* still open it */ }
  S.view[mode] = 'creations';
  if (location.hash === `#/${mode}/${sid}`) renderStudio(mode); else location.hash = `#/${mode}/${sid}`;
  return true;
}
async function reusePrompt(g) {
  const mode = g.mode === 'video' ? 'video' : 'image';
  const st = S.studio[mode];
  const text = g.styleId ? g.typedPrompt || '' : g.tool ? '' : g.originalPrompt || g.prompt || '';
  // A picture made inside a chat goes back to that chat.
  const chat = !g.sessionId && g.conversationId && S.conversations.find((c) => c.id === g.conversationId && (c.kind || 'chat') === 'chat');
  if (chat) {
    if (g.model && byId(g.model)) { S.chatModelId = g.model; store.set('chat-model', g.model); }
    try { noteConv((await api(`/api/conversations/${chat.id}/touch`, { method: 'POST' })).conversation); } catch { /* still open it */ }
    S.pendingChat = text;
    if (location.hash === '#/c/' + chat.id) route(); else location.hash = '#/c/' + chat.id;
    return;
  }
  if (g.model && byId(g.model)) st.modelId = g.model;
  if (g.params) { for (const k of ['size', 'quality', 'resolution', 'ratio', 'duration']) if (g.params[k] != null) st[k] = g.params[k]; }
  if (mode === 'image') { st.styleId = g.styleId && styleById(g.styleId) && !styleById(g.styleId).locked ? g.styleId : ''; st.styleVar = st.styleId ? g.styleVar || '' : ''; }
  S.draft[mode] = text;
  saveStudio(mode);
  if (!(await resumeHome(g, mode))) goStudio(mode);
}


// ======================================================================
// Studio: Image and Video pages with the creation bar
// ======================================================================
const INSPIRATION = {
  image: [
    ['Product hero', 'A minimalist product photo of a matte black water bottle on a pastel podium, soft studio light, long gentle shadow, 85mm lens', ['#ff8a5b', '#ffd36e']],
    ['Retro poster', 'A retro travel poster of the Swiss Alps with bold typography that says "ALPS", flat colours, 1960s screen-print style', ['#654ea3', '#eaafc8']],
    ['Cozy illustration', 'A cozy watercolor illustration of a reading nook by a rainy window, warm lamp light, a sleeping cat', ['#43cea2', '#185a9d']],
    ['Fashion editorial', 'Fashion editorial portrait of a model in an oversized silver coat, wind in hair, desert dunes at golden hour, film grain', ['#c471f5', '#fa71cd']],
    ['Isometric city', 'An isometric miniature city block at night, neon signs, tiny people, tilt-shift, highly detailed 3D render', ['#00c6ff', '#0072ff']],
    ['Food close-up', 'Macro shot of a glossy chocolate lava cake being cut, molten centre flowing, dark moody background, steam', ['#f12711', '#f5af19']],
  ],
  video: [
    ['Neon alley', 'A slow cinematic dolly shot through a neon-lit rainy alley at night, reflections on wet ground, distant thunder and soft synth music', ['#4568dc', '#b06ab3']],
    ['Ocean aerial', 'Aerial drone shot gliding over turquoise ocean waves breaking on white sand at golden hour, seagulls calling', ['#11998e', '#38ef7d']],
    ['Sneaker spin', 'A sneaker rotating on a turntable with dramatic rim lighting and floating dust particles, deep bass hit at the end', ['#232526', '#7f8c8d']],
    ['Coffee pour', 'Slow-motion macro of latte art being poured into a ceramic cup, warm morning cafe light, gentle cafe ambience', ['#f7971e', '#ffd200']],
    ['Fantasy forest', 'A tracking shot following a glowing fox through an enchanted forest at dusk, fireflies, mist, magical chimes', ['#0f2027', '#2c5364']],
    ['City timelapse', 'Timelapse of a busy city intersection from day to night, light trails, clouds racing overhead, ambient city hum', ['#fc5c7d', '#6a82fb']],
  ],
};

function paramChips(g) {
  const p = g.params || {};
  const out = [];
  if (g.mode === 'video') {
    if (p.ratio) out.push(h('span', { class: 'meta-chip' }, icon('ratio'), p.ratio));
    if (p.resolution) out.push(h('span', { class: 'meta-chip' }, p.resolution));
    if (p.duration) out.push(h('span', { class: 'meta-chip' }, p.duration > 0 ? p.duration + 's' : 'auto length'));
  } else {
    if (p.size) out.push(h('span', { class: 'meta-chip' }, p.size.replace('x', '×')));
    if (p.quality && byId(g.model)?.image?.qualities?.includes(p.quality)) out.push(h('span', { class: 'meta-chip' }, p.quality));
  }
  return out;
}

function genCard(g, { onChange } = {}) {
  const m = byId(g.model);
  const count = g.mode === 'video' ? (g.params?.count || g.taskIds?.length || 1) : g.media?.length || 1;
  const media = h('div', { class: 'gen-media' + (g.mode === 'video' ? ' video' : '') });
  for (const x of g.media || []) {
    const [iw, ih] = String(g.params?.size || '').split('x').map(Number);
    const tile = h('div', { class: 'tile' + (g.mode === 'video' ? ' v' : ''), style: iw && ih && x.type !== 'video' ? { aspectRatio: `${iw} / ${ih}` } : null },
      x.type === 'video'
        ? h('video', { src: x.url, controls: true, playsinline: true, preload: 'metadata', loop: true })
        : h('img', { src: x.url, alt: g.prompt, loading: 'lazy', onclick: () => openLightbox(x, g) }),
      h('div', { class: 'over' },
        x.type === 'video' && h('button', { class: 'icon-btn sm', title: 'Open', onclick: () => openLightbox(x, g) }, icon('expand')),
        x.type !== 'video' && h('button', { class: 'icon-btn sm', title: 'Animate', onclick: () => useAsReference(x, 'video') }, icon('play')),
        x.type !== 'video' && h('button', { class: 'icon-btn sm', title: 'Edit: change it, remove the background, resize, upscale and more', onclick: () => openEditor(x, g) }, icon('edit')),
        h('a', { class: 'icon-btn sm', href: x.url, download: '', title: 'Download' }, icon('dl')),
      ),
    );
    media.append(tile);
  }
  if (g.status === 'pending') {
    for (let i = (g.media || []).length; i < count; i++) {
      media.append(h('div', { class: 'tile pending' + (g.mode === 'video' ? ' v' : '') }, h('div', { class: 'in' }, h('span', { class: 'spin' }), h('b', {}, g.mode === 'video' ? 'Generating video' : 'Creating'), h('small', {}, g.progress ? `Status: ${g.progress}` : 'Usually 1 to 5 minutes. You can leave this page.'))));
    }
  }
  const app = g.appId && S.apps.find((a) => a.id === g.appId);
  return h('div', { class: 'gen', 'data-gid': g.id },
    h('div', { class: 'gen-head' },
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { class: 'gen-prompt', title: g.prompt, onclick: () => (app ? (location.hash = '#/apps/' + app.id) : reusePrompt(g)) }, g.displayPrompt || g.originalPrompt || g.prompt),
        h('div', { class: 'gen-meta' },
          app && h('span', { class: 'meta-chip', style: { color: 'var(--accent)' } }, icon('apps'), app.name),
          m && h('span', { class: 'meta-chip model' }, modelLogo(m, 'logo-xs'), shortName(m)),
          g.characterName && h('span', { class: 'meta-chip', style: { color: 'var(--accent)' } }, icon('face'), g.characterName),
          paramChips(g),
          (g.refs || []).length > 0 && h('span', { class: 'meta-chip' }, icon('clip'), `${g.refs.length} ref`),
          g.styleName && h('span', { class: 'meta-chip', style: { color: 'var(--accent)' }, title: 'Design Library style' }, icon('palette'), g.styleName, g.styleVar ? ` · ${g.styleVar}` : ''),
          g.tool && !g.styleName && h('span', { class: 'meta-chip' }, icon('edit'), 'Edit'),
          g.originalPrompt && h('span', { class: 'meta-chip', title: g.prompt }, icon('wand'), 'Enhanced'),
          g.credits != null && h('span', { class: 'meta-chip' }, icon('bolt'), g.tool && !g.credits ? 'Free' : fmtCredits(g.credits) + (g.status === 'pending' ? ' reserved' : '')),
          h('span', { class: 'meta-chip' }, new Date(g.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        ),
      ),
      h('div', { class: 'gen-tools' },
        !app && h('button', { class: 'icon-btn sm', title: 'Reuse prompt and settings', onclick: () => reusePrompt(g) }, icon('retry')),
        genProjectBtn(g),
        h('button', { class: 'icon-btn sm', title: 'Copy prompt', onclick: (e) => copyText(g.prompt, e.currentTarget) }, icon('copy')),
        h('button', { class: 'icon-btn sm', title: 'Delete', onclick: async () => { await api('/api/generations/' + g.id, { method: 'DELETE' }); onChange?.('delete', g); } }, icon('trash')),
      ),
    ),
    g.status === 'error' ? h('div', { class: 'gen-err' }, g.error ? cleanErr(g.error) : 'Generation failed. Credits were refunded.') : media,
    g.note && h('div', { class: 'gen-note' }, g.note),
  );
}

function dayLabel(iso) {
  const d = new Date(iso); const t = new Date();
  const diff = Math.floor((new Date(t.toDateString()) - new Date(d.toDateString())) / 864e5);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

const onStudio = (mode) => location.hash.split('/')[1] === mode;
// Stay in the open session when already on the page; otherwise start a new one.
function goStudio(mode) { if (onStudio(mode)) renderStudio(mode); else location.hash = '#/' + mode; }
// Image and video work is kept in sessions that show up in Recents, like chats.
function openStudio(mode, sid) {
  if (sid) UNREAD.delete(sid);
  if (sid !== S.sid[mode]) { S.sid[mode] = sid; S.gens[mode] = sid ? null : []; }
  return renderStudio(mode);
}
async function renderStudio(mode) {
  const main = $('#main');
  const view = S.view[mode];
  const seg = h('div', { class: 'seg' },
    h('button', { class: view === 'creations' ? 'on' : '', onclick: () => { S.view[mode] = 'creations'; renderStudio(mode); } }, icon('history'), 'History'),
    h('button', { class: view === 'explore' ? 'on' : '', onclick: () => { S.view[mode] = 'explore'; renderStudio(mode); } }, icon('compass'), 'Explore'),
  );
  const scroll = h('div', { class: 'scroll', id: 'studio-scroll' });
  const sess = S.sid[mode] && S.conversations.find((c) => c.id === S.sid[mode]);
  const wrap = h('div', { class: 'studio' }, topbar([h('div', { class: 'title', id: 'st-title' }, sess?.title || '')], seg), scroll, h('div', { class: 'dock' }, tipBanner(mode), buildStudioBar(mode)));
  main.replaceChildren(wrap);
  dropTarget = (files) => addStudioRefs(mode, files);
  $('#prompt')?.focus();

  if (view === 'explore') {
    scroll.append(h('div', { class: 'feed' },
      h('h2', { style: { font: '600 20px var(--display)', margin: '0 0 6px' } }, mode === 'video' ? 'Video ideas' : 'Image ideas'),
      h('p', { style: { color: 'var(--muted)', margin: '0 0 18px' } }, 'Pick one to load it into the prompt bar, then tweak it.'),
      h('div', { class: 'insp' }, INSPIRATION[mode].map(([t, p, c]) => h('button', { class: 'insp-card', style: { background: `linear-gradient(135deg, ${c[0]}cc, ${c[1]}99), #111` }, onclick: () => { S.draft[mode] = p; S.view[mode] = 'creations'; renderStudio(mode); } },
        h('div', {}, h('b', {}, t), h('p', {}, p)), h('div', { class: 'use' }, 'Use this prompt', icon('arrow'))))),
      h('h2', { style: { font: '600 20px var(--display)', margin: '34px 0 14px' } }, 'One-click apps'),
      h('div', { class: 'app-grid' }, S.apps.filter((a) => a.category === mode).slice(0, 4).map(appCard)),
    ));
    return;
  }

  if (!S.gens[mode] && !S.sid[mode]) S.gens[mode] = [];
  if (!S.gens[mode]) {
    const sid = S.sid[mode];
    scroll.append(h('div', { class: 'empty', style: { paddingTop: '30vh' } }, h('span', { class: 'spin' })));
    let got = [];
    try { got = (await api(`/api/generations?mode=${mode}&session=${sid}`)).generations; } catch (e) { errToast(e); }
    if (S.sid[mode] !== sid) return;
    S.gens[mode] = [...[...JOBS].filter((j) => j.kind === 'studio' && j.mode === mode && j.conv.id === sid).map((j) => j.temp), ...got];
    if (!got.length && !S.conversations.some((c) => c.id === sid)) { toast('That session no longer exists', 'error'); location.hash = '#/' + mode; return; }
    if (!onStudio(mode)) return;
  }
  drawFeed(mode);
}

function drawFeed(mode) {
  const scroll = $('#studio-scroll'); if (!scroll) return;
  const list = S.gens[mode] || [];
  scroll.replaceChildren();
  $('.studio-empty')?.remove();
  if (!list.length) {
    $('.studio').append(h('div', { class: 'studio-empty' }, h('div', {},
      h('h1', {}, 'Light up your creation with ', h('span', { class: 'glow' }, 'Scenly')),
      h('p', {}, mode === 'video' ? 'Describe a scene, add an image to animate it, or a video to restyle it.' : 'Describe an image, or add one as a reference to edit it.'),
    )));
    return;
  }
  const feed = h('div', { class: 'feed' });
  let last = '';
  for (const g of list) {
    const d = dayLabel(g.createdAt);
    if (d !== last) { feed.append(h('div', { class: 'day' }, d)); last = d; }
    feed.append(genCard(g, { onChange: (what, x) => { if (what === 'delete') { S.gens[mode] = S.gens[mode].filter((y) => y.id !== x.id); drawFeed(mode); } } }));
  }
  scroll.append(feed);
  schedulePoll(mode);
}

function schedulePoll(mode) {
  clearTimeout(pollTimer);
  const pending = (S.gens[mode] || []).filter((g) => g.status === 'pending');
  if (!pending.length) return;
  pollTimer = setTimeout(async () => {
    for (const p of pending) {
      try {
        const r = await api('/api/generations/' + p.id);
        const i = S.gens[mode].findIndex((x) => x.id === p.id);
        if (i >= 0) S.gens[mode][i] = r.generation;
        setCredits(r.credits);
        const el = $(`[data-gid="${p.id}"]`);
        if (el) el.replaceWith(genCard(r.generation, { onChange: (what, x) => { if (what === 'delete') { S.gens[mode] = S.gens[mode].filter((y) => y.id !== x.id); drawFeed(mode); } } }));
        if (r.generation.status === 'done') toast(mode === 'video' ? 'Your video is ready' : 'Your images are ready');
        if (r.generation.status === 'error') toast('A generation failed. Credits were refunded.', 'error');
      } catch {}
    }
    if (onStudio(mode)) schedulePoll(mode);
  }, 7000);
}

// ---------- Design Library: ready-made looks added to a prompt in one click ----------
async function loadStyles() { try { S.styles = await api('/api/styles'); } catch { S.styles = null; } }
const styleById = (sid) => S.styles?.styles.find((s) => s.id === sid) || null;
const curStyle = () => (S.studio.image.styleId ? styleById(S.studio.image.styleId) : null);
const styleArt = (s) => h('span', { class: 'art', style: { background: `linear-gradient(135deg, ${s.colors[0]}, ${s.colors[1]})` } }, s.thumb ? h('img', { src: s.thumb, alt: '', loading: 'lazy' }) : icon(s.icon));

function styleChip() {
  const st = S.studio.image; const s = curStyle();
  return h('button', { class: 'chipbtn stylechip' + (s ? ' on' : ''), id: 'style-chip', title: s ? `Style: ${s.name}. Click to change.` : 'Design Library: add a ready-made look in one click', onclick: (e) => openStyleLib(e.currentTarget) },
    s ? h('span', { class: 'sw', style: { background: `linear-gradient(135deg, ${s.colors[0]}, ${s.colors[1]})` } }) : icon('palette'),
    h('span', { class: 'nm' }, s ? s.name + (s.variable ? ` · ${st.styleVar || s.variable.options[0]}` : '') : 'Style'),
    s && h('span', { class: 'clr', title: 'Remove style', role: 'button', onclick: (e) => { e.stopPropagation(); setStyle(null); } }, icon('x')),
  );
}
function setStyle(s, value) {
  const st = S.studio.image;
  st.styleId = s ? s.id : ''; st.styleVar = s?.variable ? value || s.variable.options[0] : '';
  if (s?.needsImage && !studioModel('image')?.image.edit) {
    const em = S.models.find((x) => x.type === 'image' && x.image.edit);
    if (em) { st.modelId = em.id; toast(`Switched to ${shortName(em)}, which can change photos.`); }
  }
  saveStudio('image');
  if (onStudio('image')) renderStudioBar('image');
  if (s?.needsImage && !st.refs.length && !st.characterId) { toast(`${s.name} changes a photo. Pick the photo to use.`); pickFiles('image/*', false, (f) => addStudioRefs('image', f)); }
}
let styleCat = 'all';
function openStyleLib(anchor, { onPick, cat: startCat, current } = {}) {
  if (!S.styles) { loadStyles().then(() => (S.styles ? openStyleLib(anchor, { onPick, cat: startCat, current }) : toast('The Design Library could not be loaded. Please try again.', 'error'))); return; }
  let cat = startCat || styleCat;
  let ask = null;    // a style that needs one more choice (occasion, new background)
  let locked = null; // a locked style that was clicked
  const body = h('div', { class: 'stylelib' });
  const pick = (s, value) => { closePop(); (onPick || setStyle)(s, value); };
  const toggleFav = async (s) => {
    const on = !S.styles.favs.includes(s.id);
    S.styles.favs = on ? [...S.styles.favs, s.id] : S.styles.favs.filter((x) => x !== s.id);
    draw();
    try { S.styles.favs = (await api(`/api/styles/${s.id}/fav`, { method: 'POST', body: { on } })).favs; } catch (e) { errToast(e); }
  };
  const draw = () => {
    const { styles, categories, favs, unlocked } = S.styles;
    const sel = onPick ? current : S.studio.image.styleId;
    const list = styles.filter((s) => (cat === 'all' ? true : cat === 'fav' ? favs.includes(s.id) : s.category === cat)).sort((a, b) => a.locked - b.locked);
    const tabs = [['all', 'All'], ...categories.map((c) => [c.id, c.name]), ['fav', 'Favourites']];
    const tile = (s) => {
      const fav = favs.includes(s.id);
      return h('button', { class: 'st-tile' + (s.id === sel ? ' sel' : '') + (s.locked ? ' locked' : '') + (ask === s ? ' asking' : ''), 'data-style': s.id, title: s.addon.replace(/\{\w+\}/, '…'),
        onclick: () => { if (s.locked) { locked = s; ask = null; return draw(); } if (s.variable) { ask = s; locked = null; return draw(); } pick(s); } },
        styleArt(s),
        s.locked ? h('span', { class: 'badge lock', title: 'In the paid plans' }, icon('lock')) : h('span', { class: 'badge fav' + (fav ? ' on' : ''), role: 'button', title: fav ? 'Remove from favourites' : 'Add to favourites', onclick: (e) => { e.stopPropagation(); toggleFav(s); } }, icon('star')),
        s.needsImage && h('span', { class: 'badge photo' }, 'Photo'),
        h('span', { class: 'nm' }, s.name),
      );
    };
    let slot = null;
    if (ask) {
      const custom = ask.variable.custom && h('input', { class: 'field-input', placeholder: 'Or type your own', maxlength: 80, onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) pick(ask, e.target.value.trim()); } });
      slot = h('div', { class: 'st-ask' }, h('b', {}, `${ask.name}: ${ask.variable.label.toLowerCase()}`),
        h('div', { class: 'opt-row' }, ask.variable.options.map((o) => h('button', { class: 'opt', onclick: () => pick(ask, o) }, o))), custom);
    } else if (locked) {
      slot = h('div', { class: 'st-ask lockmsg' }, icon('lock'), h('div', { class: 'grow' }, h('b', {}, `${locked.name} is in the full Design Library`), h('small', {}, 'Any paid plan or credit pack unlocks all 36 styles.')), h('a', { class: 'btn primary sm', href: '#/billing', onclick: () => { closePop(); $('.lightbox')?.remove(); } }, 'See plans'));
    }
    const free = styles.filter((s) => !s.locked).length;
    body.replaceChildren(...[
      h('div', { class: 'st-head' }, h('b', {}, 'Design Library', info(INFO.style)), h('small', {}, onPick ? 'Pick a look and this image is redone in it.' : 'Pick a look. It is added to your prompt for you.')),
      h('div', { class: 'opt-row st-cats' }, tabs.map(([k, l]) => h('button', { class: 'opt' + (cat === k ? ' on' : ''), 'data-cat': k, onclick: () => { cat = k; if (!startCat) styleCat = k; ask = locked = null; draw(); } }, k === 'fav' && icon('star'), l))),
      slot,
      list.length ? h('div', { class: 'st-grid' }, list.map(tile)) : h('div', { class: 'empty', style: { padding: '26px 10px' } }, cat === 'fav' ? 'No favourites yet. Press the star on a style to keep it here.' : 'Nothing here.'),
      !unlocked && free < styles.length && h('div', { class: 'st-foot' }, icon('lock'), h('span', { class: 'grow' }, `The free trial includes ${free} of ${styles.length} styles. Any paid plan or credit pack unlocks them all.`), h('a', { href: '#/billing', onclick: () => { closePop(); $('.lightbox')?.remove(); } }, 'See plans')),
    ].filter(Boolean));
    if (slot) body.scrollIntoView?.({ block: 'nearest' });
    if (slot && body.parentElement) body.parentElement.scrollTop = 0;
  };
  draw();
  popover(anchor, body, 'above').classList.add('wide-pop');
}

// ---------- image editor: one place for every change to a finished picture ----------
let EDIT_OPTS = null;
async function openEditor(item, gen) {
  $('.lightbox')?.remove();
  let cur = { ...item };
  let versions = [cur];
  let panel = 'home';
  let busy = '';
  let changed = false;
  let draft = '';
  const textIn = { headline: '', subline: '', position: 'auto' };
  let sizes = new Set(['ig-post', 'story', 'yt-thumb']);
  const editModels = S.models.filter((m) => m.type === 'image' && m.image.edit);
  const sm = S.models.find((m) => m.id === S.studio.image.modelId);
  let em = (sm?.image?.edit && sm) || ['seedream-5.0-pro', 'nano-banana-2', 'gpt-image-2', 'nano-banana'].map(byId).find((m) => m?.image?.edit) || editModels[0];
  const cost = () => (em ? fmtCredits(em.price.creditsPerImage) : '');
  const costTag = () => h('span', { class: 'cost' }, icon('bolt'), cost());
  const stage = h('div', { class: 'stage' });
  const strip = h('div', { class: 'ver-strip' });
  const aside = h('aside', {});
  const close = () => { lb.remove(); if (changed && location.hash === '#/assets') renderAssets(); };
  const lb = h('div', { class: 'lightbox editor', onclick: (e) => { if (e.target === lb || e.target === stage) close(); } },
    h('div', { class: 'stage-wrap' }, stage, strip), aside, h('button', { class: 'icon-btn close', title: 'Close', onclick: close }, icon('x')));
  lb._close = close;
  const prompt0 = item.prompt || gen?.displayPrompt || gen?.prompt || '';

  const run = async (label, call) => {
    if (busy) return;
    busy = label; draw();
    try {
      const r = await call();
      if (r?.generation) {
        if (r.generation.status === 'error' || !r.generation.media?.length) throw new Error(r.generation.error || 'The edit did not work this time. No credits were charged. Please try again.');
        versions = r.versions?.length ? r.versions : versions;
        cur = versions.find((v) => v.id === r.generation.media[0].id) || versions[versions.length - 1];
        cur.sessionId = r.session?.id;
        changed = true;
        setCredits(r.credits);
        if (r.session) noteConv(r.session);
        if (r.session && S.gens.image && S.sid.image === r.session.id && !S.gens.image.some((g) => g.id === r.generation.id)) { S.gens.image = [r.generation, ...S.gens.image]; if (onStudio('image')) drawFeed('image'); }
        if (r.generation.note) toast(r.generation.note, 'error');
      }
      panel = 'home';
    } catch (e) { errToast(e); }
    busy = ''; if (lb.isConnected) draw();
  };
  const edit = (label, tool, input) => run(label, () => api('/api/edit', { method: 'POST', body: { mediaId: cur.id, tool, input, model: em?.id } }));

  const back = (title) => h('div', { class: 'ed-back' }, h('button', { class: 'icon-btn sm', title: 'Back', onclick: () => { panel = 'home'; draw(); } }, icon('back')), h('b', {}, title));
  const tool = (ic, name, sub, onclick, attrs = {}) => h('button', { class: 'ed-tool', disabled: !!busy, onclick, ...attrs }, icon(ic), h('span', {}, h('b', {}, name), h('small', {}, sub)));
  const needModel = (fn) => () => (em ? fn() : toast('No image model that can edit pictures is available right now.', 'error'));

  function drawPanel() {
    const O = EDIT_OPTS || { mockups: [], languages: [], sizes: [] };
    if (panel === 'text') {
      const head = h('input', { class: 'field-input', placeholder: 'Headline, for example SUMMER SALE', maxlength: 80, value: textIn.headline, oninput: (e) => { textIn.headline = e.target.value; go.disabled = !textIn.headline.trim() || !!busy; } });
      const sub = h('input', { class: 'field-input', placeholder: 'Smaller line (optional)', maxlength: 120, value: textIn.subline, oninput: (e) => { textIn.subline = e.target.value; } });
      const go = h('button', { class: 'btn primary', disabled: !textIn.headline.trim() || !!busy, onclick: () => edit('Add text', 'text', { ...textIn }) }, 'Add text', costTag());
      head.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
      setTimeout(() => head.focus(), 30);
      return [back('Add text'), head, sub,
        h('div', { class: 'lab' }, 'Where'),
        h('div', { class: 'opts four' }, [['auto', 'Auto'], ['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']].map(([k, l]) => h('button', { class: 'opt' + (textIn.position === k ? ' on' : ''), onclick: () => { textIn.position = k; draw(); } }, l))),
        go, h('p', { class: 'ed-note' }, 'The AI draws the words into the picture. Short text works best. Check the spelling in the result.')];
    }
    if (panel === 'translate') {
      return [back('Translate the text in this image'), h('p', { class: 'ed-note' }, 'Pick a language. The words in the picture are replaced, the design stays.'),
        h('div', { class: 'opt-row' }, O.languages.map((l) => h('button', { class: 'opt', disabled: !!busy, onclick: () => edit(`Translate to ${l}`, 'translate', { language: l }) }, l))),
        h('p', { class: 'ed-cost' }, icon('bolt'), `${cost()} credits per translation`)];
    }
    if (panel === 'mockup') {
      const ic = { tshirt: 'shirt', mug: 'coin', packaging: 'bag', signage: 'home', phone: 'user', laptop: 'code', billboard: 'megaphone', tote: 'bag', poster: 'poster' };
      return [back('Put it on a mockup'), h('div', { class: 'ed-grid three' }, O.mockups.map((m) => h('button', { class: 'ed-tool col', disabled: !!busy, onclick: () => edit(`Mockup: ${m.name}`, 'mockup', { mockup: m.id }) }, icon(ic[m.id] || 'image'), h('b', {}, m.name)))),
        h('p', { class: 'ed-cost' }, icon('bolt'), `${cost()} credits per mockup`)];
    }
    if (panel === 'sizes') {
      const btn = h('button', { class: 'btn primary', disabled: !sizes.size || !!busy, onclick: async () => {
        btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin' }), 'Preparing…');
        try {
          const res = await fetch(`/api/media/${cur.id}/export`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sizes: [...sizes] }) });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'The sizes could not be made. Please try again.');
          downloadBlob(await res.blob(), decodeURIComponent(res.headers.get('X-File-Name') || 'scenly-sizes.zip'));
          toast(sizes.size > 1 ? `${sizes.size} sizes downloaded as one zip file.` : 'Downloaded.');
        } catch (e) { errToast(e); }
        if (lb.isConnected) draw();
      } }, icon('dl'), sizes.size > 1 ? `Download ${sizes.size} sizes` : 'Download', h('span', { class: 'cost' }, 'Free'));
      return [back('Resize for social and web'),
        h('div', { class: 'ed-sizes' }, O.sizes.map((z) => h('label', { class: 'ed-size' + (sizes.has(z.id) ? ' on' : '') },
          h('input', { type: 'checkbox', checked: sizes.has(z.id), onchange: (e) => { e.target.checked ? sizes.add(z.id) : sizes.delete(z.id); draw(); } }),
          h('span', { class: 'ratio', style: { width: Math.round(18 * Math.min(1, z.w / z.h)) + 'px', height: Math.round(18 * Math.min(1, z.h / z.w)) + 'px' } }),
          h('b', {}, z.name), h('small', {}, `${z.w} × ${z.h}`)))),
        btn, h('p', { class: 'ed-note' }, 'Nothing is cropped. The whole picture is kept, and any spare room is filled with a soft blur of the same picture.')];
    }
    // home
    const ta = h('textarea', { class: 'ed-ta', rows: 2, placeholder: 'Describe a change, for example: make the sky pink', oninput: (e) => { draft = e.target.value; go.disabled = !draft.trim() || !!busy; } });
    ta.value = draft;
    const go = h('button', { class: 'btn primary', disabled: !draft.trim() || !!busy, onclick: needModel(() => { const t = draft.trim(); draft = ''; edit('Your change', 'change', { text: t }); }) }, 'Apply', costTag());
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go.click(); } });
    const wand = h('button', { class: 'icon-btn', title: 'Improve my wording: reads the picture and tidies your request', disabled: !!busy, onclick: async () => {
      if (!draft.trim()) return toast('Type the change first, then press this to tidy it.');
      wand.disabled = true; const old = draft; ta.disabled = true; ta.value = 'Reading the picture…';
      try { const r = await api('/api/enhance', { method: 'POST', body: { prompt: old, mode: 'image', mediaId: cur.id } }); draft = r.prompt; setCredits(r.credits); } catch (e) { errToast(e); }
      if (lb.isConnected) draw();
    } }, icon('wand'));
    return [
      h('div', { class: 'lab' }, 'Change this image'),
      ta,
      h('div', { class: 'ed-row' }, wand, h('div', { class: 'grow' }), go),
      h('div', { class: 'lab' }, 'One-click tools'),
      h('div', { class: 'ed-grid' },
        tool('cut', 'Remove background', 'See-through PNG', needModel(() => edit('Background removed', 'background', {})), { title: 'Plain backgrounds are removed for free. Busy ones use one AI edit first.', 'data-tool': 'background' }),
        tool('hd', 'Upscale to 4K', 'Free', () => run('Upscale', () => api(`/api/media/${cur.id}/upscale`, { method: 'POST' })), { title: 'A larger, sharpened copy up to 4096 pixels on the long side.', 'data-tool': 'upscale' }),
        tool('ratio', 'Resize', 'Posts, stories, banners', () => { panel = 'sizes'; draw(); }, { 'data-tool': 'sizes' }),
        tool('type', 'Add text', 'Headline in the picture', needModel(() => { panel = 'text'; draw(); }), { 'data-tool': 'text' }),
        tool('globe', 'Translate', 'Text in the image', needModel(() => { panel = 'translate'; draw(); }), { 'data-tool': 'translate' }),
        tool('shirt', 'Mockup', 'T-shirt, mug, sign…', needModel(() => { panel = 'mockup'; draw(); }), { 'data-tool': 'mockup' }),
        tool('palette', 'Restyle', 'Design Library', needModel((e) => openStyleLib($('[data-tool=style]', aside), { cat: 'transform', onPick: (s, v) => edit(`Style: ${s.name}`, 'style', { styleId: s.id, styleVar: v }) })), { 'data-tool': 'style' }),
        tool('play', 'Animate', 'Turn into a video', async () => { close(); await useAsReference(cur, 'video'); }, { 'data-tool': 'animate' }),
      ),
      em && h('p', { class: 'ed-cost' }, icon('bolt'), `AI edits use ${shortName(em)}, ${cost()} credits each.`, editModels.length > 1 && h('a', { href: '#', onclick: (e) => { e.preventDefault(); popover(e.currentTarget, h('div', { class: 'menu' }, editModels.map((m) => h('button', { onclick: () => { closePop(); em = m; draw(); } }, modelLogo(m, 'logo-xs'), shortName(m), h('span', { style: { color: 'var(--faint)', marginLeft: 'auto', paddingLeft: '12px' } }, fmtCredits(m.price.creditsPerImage)), m === em && icon('check', 'chk')))), 'above'); } }, 'Change')),
      prompt0 && h('div', { class: 'lab' }, 'Prompt'),
      prompt0 && h('p', { class: 'ed-prompt' }, prompt0),
      h('div', { class: 'acts row' },
        h('a', { class: 'btn', href: cur.url, download: '' }, icon('dl'), 'Download'),
        h('button', { class: 'btn', title: 'Put this image in the prompt bar as a reference', onclick: async () => { close(); await useAsReference(cur, 'image'); } }, icon('clip'), 'Use as reference'),
        !item.appId && prompt0 && !cur.tool && h('button', { class: 'btn', onclick: () => { close(); reusePrompt(gen || assetGen(item)); } }, icon('retry'), 'Reuse prompt'),
      ),
    ];
  }
  function draw() {
    stage.replaceChildren(...[
      h('img', { src: cur.url, alt: cur.prompt || '', class: cur.tool === 'background' ? 'checker' : '' }),
      !!busy && h('div', { class: 'ed-busy' }, h('span', { class: 'spin' }), h('b', {}, busy === 'Upscale' ? 'Upscaling…' : 'Working on it…'), h('small', {}, busy === 'Upscale' ? 'A few seconds.' : 'Usually under a minute. The result is saved as a new version.')),
    ].filter(Boolean));
    strip.style.display = versions.length > 1 ? '' : 'none';
    strip.replaceChildren(...versions.map((v, i) => h('button', { class: 'ver' + (v.id === cur.id ? ' on' : ''), title: v.tool ? v.label || 'Edit' : 'Original', disabled: !!busy, onclick: () => { cur = { ...v, sessionId: cur.sessionId || item.sessionId }; draw(); } },
      h('img', { src: v.url, alt: '', loading: 'lazy' }), h('span', {}, i === 0 && !v.tool ? 'Original' : `v${i + 1}`))));
    strip.querySelector('.ver.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    aside.replaceChildren(...drawPanel().filter(Boolean));
    if (cur.w && cur.h) aside.append(h('div', { class: 'ed-dim' }, `${cur.w} × ${cur.h} px`));
  }
  draw();
  document.body.append(lb);
  api(`/api/media/${item.id}/versions`).then((r) => { if (!lb.isConnected || busy) return; if (r.versions?.length) { versions = r.versions; cur = { ...(versions.find((v) => v.id === item.id) || cur), sessionId: item.sessionId }; draw(); } }).catch(() => {});
  if (!EDIT_OPTS) api('/api/edit/options').then((r) => { EDIT_OPTS = r; if (lb.isConnected && panel !== 'home') draw(); }).catch(() => {});
}

// ---------- info points: a small (i) that explains a control, on hover and on tap ----------
let TIP = null;
function hideTip() { if (TIP) { TIP.box.remove(); TIP = null; } }
function showTip(el, text, pinned = false) {
  hideTip();
  const box = h('div', { class: 'tip', role: 'tooltip' }, typeof text === 'function' ? text() : text);
  document.body.append(box);
  const r = el.getBoundingClientRect(); const b = box.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2));
  const above = r.top - b.height - 8 >= 8;
  Object.assign(box.style, { left: left + 'px', top: (above ? r.top - b.height - 8 : r.bottom + 8) + 'px' });
  TIP = { box, el, pinned };
}
function info(text, cls = '') {
  const b = h('span', { class: 'info ' + cls, tabindex: '0', role: 'button', 'aria-label': 'What is this?',
    onmouseenter: () => { if (!TIP?.pinned) showTip(b, text); },
    onmouseleave: () => { if (TIP && !TIP.pinned) hideTip(); },
    onfocus: () => { if (!TIP) showTip(b, text); },
    onblur: () => hideTip(),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } },
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); if (TIP?.el === b && TIP.pinned) hideTip(); else showTip(b, text, true); },
    onmousedown: (e) => e.stopPropagation(),
  }, icon('info'));
  return b;
}
document.addEventListener('pointerdown', (e) => { if (TIP && !TIP.el.contains(e.target)) hideTip(); }, true);
window.addEventListener('hashchange', hideTip);
const INFO = {
  ratio: 'The shape of the video. 16:9 is wide (YouTube, TV). 9:16 is tall (Reels, TikTok, Shorts). Auto follows your reference.',
  resolution: 'How sharp the video is. Higher looks crisper and costs more credits per second.',
  duration: 'How long the clip runs. You pay per second, so shorter clips cost less.',
  size: 'The shape and pixel size of the picture. For a banner, story or thumbnail, open the finished image and press Resize.',
  quality: 'Higher quality gives finer detail and costs more credits. Medium suits most pictures.',
  batch: 'How many results to make from this one prompt. Each one is charged separately, and any that fail are refunded.',
  enhance: 'AI rewrites your idea into a short, clear prompt. It reads your reference photo too. Costs well under 1 credit.',
  character: 'Keeps the same person, product or logo in every result by using their saved photos as a reference.',
  project: 'Adds what you make to a project, so it shares that project\'s instructions, files and history.',
  style: 'A ready-made look that is added to your prompt for you. Photo looks change a picture you upload.',
  task: 'Create makes a new video from words or a picture. Edit video changes a video you already have.',
};
const labInfo = (label, key) => h('label', { class: 'lab' }, label, info(INFO[key]));

// ---------- video tasks ----------
const TASKS = { create: ['Create', 'New video from words or a picture', 'sparkle'], edit: ['Edit video', 'Restyle a video, or replace and remove things in it', 'swap'], extend: ['Extend video', 'Continue a video from its last frame', 'arrow'] };
const videoTask = () => { const m = studioModel('video'); const st = S.studio.video; if (m && !m.video.tasks.includes(st.task)) st.task = m.video.tasks[0]; return st.task; };

// ---------- tip banner: points to a new feature once, until it is closed ----------
const tipsDone = () => store.get('tips-done', []);
function tipBanner(mode) {
  const tips = [
    { id: 'builder', on: () => S.config.flags?.videoBuilder, modes: ['video', 'image'], text: 'New: build videos up to 5 minutes with Video Builder', cta: 'Open', go: () => { location.hash = '#/builder'; } },
    { id: 'tasks', on: () => S.models.some((m) => m.type === 'video' && m.video.tasks.length > 1), modes: ['video'], text: 'New: models that can edit a video now show Create and Edit video in the model menu', cta: 'Show me', go: () => $('#model-chip')?.click() },
    { id: 'editor', modes: ['image'], text: 'New: click any finished image to remove its background, resize it, add text or make a mockup' },
  ];
  const done = tipsDone();
  const t = tips.find((x) => x.modes.includes(mode) && !done.includes(x.id) && (!x.on || x.on()));
  if (!t) return null;
  const close = () => { store.set('tips-done', [...new Set([...tipsDone(), t.id])]); el.remove(); };
  const el = h('div', { class: 'tip-banner', 'data-tip': t.id }, icon('sparkle'), h('span', { class: 'grow' }, t.text),
    t.cta && h('button', { class: 'link', onclick: () => { close(); t.go(); } }, t.cta, icon('arrow')),
    h('button', { class: 'icon-btn sm', title: 'Dismiss', onclick: close }, icon('x')));
  return el;
}

// ---------- creation bar ----------
function buildStudioBar(mode) {
  const st = S.studio[mode];
  const m = studioModel(mode);
  if (!m) return h('div', { class: 'bar' }, h('div', { class: 'empty' }, `No ${mode} models are available right now.`));
  normaliseSettings(mode);
  const look = mode === 'image' ? curStyle() : null;
  if (mode === 'image' && st.styleId && S.styles && (!look || look.locked)) { st.styleId = ''; st.styleVar = ''; }
  const task = mode === 'video' ? videoTask() : null;
  const ph = mode === 'video'
    ? (task === 'edit' ? 'Add a video, then say what to change: restyle it, replace or remove something' : task === 'extend' ? 'Add a video, then describe what happens next' : 'Describe the video you want to create')
    : look?.needsImage ? `${look.name}: add a photo, then press Generate. Extra details are optional.` : 'Describe the scene you want to generate';
  const ta = h('textarea', { id: 'prompt', rows: 2, placeholder: ph });
  ta.value = S.draft[mode] || '';
  ta.addEventListener('input', () => { S.draft[mode] = ta.value; autoGrow(ta); updateGo(); if (ENH_UNDO) { ENH_UNDO.strip?.close(); ENH_UNDO = null; drawEnhBtn(); } });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); generate(mode); } });
  ta.addEventListener('paste', (e) => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); addStudioRefs(mode, files); } });
  const mats = h('div', { class: 'material', id: 'mats' });
  const go = h('button', { class: 'gen-btn', id: 'go', onclick: () => generate(mode) }, icon('sparkle'), 'Generate', h('span', { class: 'cost' }, icon('bolt'), h('span', { id: 'cost' }, '')));
  const expand = h('button', { class: 'icon-btn sm bar-expand', title: 'Make the prompt box taller', onclick: () => { const on = bar.classList.toggle('tall'); expand.title = on ? 'Make the prompt box smaller' : 'Make the prompt box taller'; autoGrow(ta); ta.focus(); } }, icon('expand'));
  const more = h('button', { class: 'chipbtn icon-only', id: 'bar-more', title: 'More options', hidden: true, onclick: (e) => openBarMore(e.currentTarget) }, icon('dots'));
  const row = h('div', { class: 'bar-row one' },
    modeChip(mode),
    h('button', { class: 'chipbtn', id: 'model-chip', title: 'Model', onclick: (e) => openModelMenu(e.currentTarget, mode) }, modelLogo(m, 'logo-sm'), h('span', { class: 'nm' }, shortName(m), mode === 'video' && m.video.tasks.length > 1 && h('span', { class: 'task' }, ' · ' + TASKS[task][0])), icon('down')),
    h('button', { class: 'chipbtn', id: 'set-chip', title: 'Settings', onclick: (e) => openSettings(e.currentTarget, mode) }, icon('ratio'), h('span', { class: 'nm', id: 'set-sum' }, settingsSummary(mode))),
    mode === 'image' && styleChip(),
    characterChip(mode),
    projectChip('studio'),
    more,
    h('div', { class: 'grow' }),
    micButton(ta),
    h('div', { class: 'split' + (st.autoEnhance ? ' on' : ''), id: 'enh-split', title: st.autoEnhance ? 'Auto-enhance is on: every prompt is improved by AI before it is generated. Open the arrow to turn it off.' : '' },
      h('button', { class: 'icon-btn', id: 'enh-now', title: ENH_TIP, onclick: () => enhanceNow(mode) }, icon('sparkle')),
      h('button', { class: 'enh-auto', id: 'enh-auto', hidden: !st.autoEnhance, title: 'Auto-enhance is on. Click to turn it off.', onclick: () => setAutoEnhance(mode, false) }, 'Auto'),
      h('button', { class: 'icon-btn caret', id: 'enh-menu', title: 'Prompt enhancer options', onclick: (e) => openEnhMenu(e.currentTarget.parentElement, mode) }, icon('down')),
    ),
    info(() => costBreakdown(mode), 'cost-info'),
    go,
  );
  const bar = h('div', { class: 'bar' }, h('div', { class: 'bar-top' }, mats, ta, expand), row);
  // Chips that do not fit move into the More menu: Project first, then Character, then Style.
  const fit = () => fitBar(row);
  if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(row); }
  new MutationObserver(fit).observe(row, { childList: true });
  setTimeout(() => { autoGrow(ta); drawMats(mode); updateGo(); fit(); }, 0);
  return bar;
}
const FOLD_ORDER = ['.proj-chip', '.char-chip', '.stylechip'];
function fitBar(row) {
  if (!row.isConnected) return;
  const more = row.querySelector('#bar-more'); if (!more) return;
  const chips = FOLD_ORDER.map((sel) => row.querySelector(sel)).filter(Boolean);
  chips.forEach((c) => c.classList.remove('folded')); more.hidden = true; row.classList.remove('wrap', 'tight');
  const over = () => row.scrollWidth > row.clientWidth + 1;
  for (const c of chips) { if (!over()) break; c.classList.add('folded'); more.hidden = false; }
  // Still too wide: Mode, Model, Settings and Generate stay, in a shorter form (the model name is cut with …).
  if (over()) row.classList.add('tight');
  // Very narrow screens: when even that is not enough, the row may use a second line so nothing is cut off.
  if (over()) { row.classList.remove('tight'); row.classList.add('wrap'); }
  more.classList.toggle('on', chips.some((c) => c.classList.contains('folded') && c.classList.contains('on')));
}
function openBarMore(anchor) {
  const row = anchor.closest('.bar-row');
  const items = [['.stylechip', 'palette', 'Style'], ['.char-chip', 'face', 'Character'], ['.proj-chip', 'project', 'Project']]
    .map(([sel, ic, label]) => [row.querySelector(sel + '.folded'), ic, label]).filter(([el]) => el);
  popover(anchor, h('div', { class: 'menu', style: { minWidth: '220px' } },
    h('div', { class: 'menu-cap' }, 'More options'),
    items.map(([el, ic, label]) => h('button', { 'data-more': label.toLowerCase(), onclick: () => { closePop(); el.click(); } }, icon(ic), label, el.classList.contains('on') && h('span', { class: 'more-val' }, el.querySelector('.nm')?.textContent || 'On'))),
  ), 'above');
}
// Auto-enhance rewrites every prompt before it is generated, so whenever it is on the bar says so in words.
function setAutoEnhance(mode, on) {
  const st = S.studio[mode];
  st.autoEnhance = !!on; saveStudio(mode);
  const split = $('#enh-split'); if (split) { split.classList.toggle('on', st.autoEnhance); split.title = st.autoEnhance ? 'Auto-enhance is on: every prompt is improved by AI before it is generated. Open the arrow to turn it off.' : ''; }
  const tag = $('#enh-auto'); if (tag) tag.hidden = !st.autoEnhance;
  toast(st.autoEnhance ? 'Auto-enhance is on. Your prompts are improved by AI before each generation.' : 'Auto-enhance is off. Your own words are sent as they are.');
}
function openEnhMenu(anchor, mode) {
  const st = S.studio[mode];
  const sw = h('button', { class: 'switch' + (st.autoEnhance ? ' on' : ''), role: 'switch', 'aria-checked': String(!!st.autoEnhance), id: 'enh', onclick: () => {
    setAutoEnhance(mode, !st.autoEnhance);
    sw.classList.toggle('on', st.autoEnhance); sw.setAttribute('aria-checked', String(st.autoEnhance));
  } }, h('i'));
  popover(anchor, h('div', { class: 'settings', style: { width: '300px' } },
    h('h4', {}, h('span', {}, 'Prompt enhancer', info(INFO.enhance))),
    h('div', { class: 'row' }, h('div', {}, 'Auto-enhance when I press Generate', h('small', {}, 'Your prompt is improved first, then generated.')), sw),
    h('button', { class: 'btn sm block', style: { marginTop: '6px' }, onclick: () => { closePop(); enhanceNow(mode); } }, icon('sparkle'), ENH_UNDO ? 'Undo the last enhance' : 'Enhance my prompt now'),
  ), 'above');
}
function costBreakdown(mode) {
  const st = S.studio[mode]; const m = studioModel(mode); if (!m) return '';
  const total = fmtCredits(estimate(mode));
  const n = st.count;
  if (mode === 'image') return `${fmtCredits(imageCreditsFor(m, st.size, st.quality))} credits × ${n} image${n > 1 ? 's' : ''} = about ${total} credits. You are charged the real cost when each image is done. Failed ones are refunded.`;
  const per = m.price.creditsPerSecond[st.resolution] ?? Object.values(m.price.creditsPerSecond)[0] ?? 0;
  const secs = st.duration > 0 ? st.duration : 10;
  return `${st.duration > 0 ? secs + 's' : 'about ' + secs + 's (follows your video)'} × ${st.resolution} at ${fmtCredits(per)} credits/s × ${n} video${n > 1 ? 's' : ''} = about ${total} credits. Reserved when you press Generate, settled to the real cost when done. Failed ones are refunded.`;
}
const autoGrow = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, ta.closest('.bar.tall') ? Math.round(innerHeight * 0.5) : 240) + 'px'; };

function modeChip(mode) {
  const labels = { image: ['image', 'AI Image'], video: ['video', 'AI Video'], chat: ['chat', 'AI Chat'] };
  return h('button', { class: 'chipbtn', id: 'mode-chip', onclick: (e) => popover(e.currentTarget, h('div', { class: 'menu', style: { minWidth: '170px' } },
    ['image', 'video', 'chat'].map((k) => h('button', { onclick: () => { closePop(); if (k !== mode) { if (S.draft[mode] && k !== 'chat') S.draft[k] = S.draft[k] || S.draft[mode]; location.hash = '#/' + k; } } }, icon(labels[k][0]), labels[k][1], k === mode && icon('check', 'chk'))),
  ), 'above') }, icon(labels[mode][0]), h('span', { class: 'nm' }, labels[mode][1]), icon('down'));
}

function normaliseSettings(mode) {
  const st = S.studio[mode]; const m = studioModel(mode); if (!m) return;
  st.count = batchOptions(mode === 'image' ? m : null).includes(Number(st.count)) ? Number(st.count) : 1;
  if (mode === 'image') {
    if (!m.image.sizes.includes(st.size)) st.size = m.image.sizes[0];
    if (m.image.qualities?.length && !m.image.qualities.includes(st.quality)) st.quality = m.image.qualities.includes('medium') ? 'medium' : m.image.qualities[0];
    const maxRefs = m.image.edit ? m.image.edit.max_images || 1 : 0;
    if (st.refs.length > maxRefs) { st.refs = st.refs.slice(0, maxRefs); if (!maxRefs) toast(`${shortName(m)} does not take reference images, so they were removed.`); }
  } else {
    const v = m.video;
    const task = videoTask();
    if (!v.resolutions.includes(st.resolution)) st.resolution = v.resolutions.includes('720p') ? '720p' : v.resolutions[0];
    if (!v.ratios.includes(st.ratio)) st.ratio = v.ratios.includes('16:9') ? '16:9' : v.ratios[0];
    if (!v.durations.includes(Number(st.duration))) st.duration = v.durations.includes(5) ? 5 : v.durations[0];
    // Create starts from words or one picture. Edit and Extend work on one video.
    const imgs = st.refs.filter((r) => r.kind === 'image').slice(0, v.imageToVideo && task === 'create' ? v.maxImages || 1 : 0);
    const vids = st.refs.filter((r) => r.kind === 'video').slice(0, v.videoToVideo ? v.maxVideos || 1 : 0);
    if (imgs.length + vids.length < st.refs.length) toast(task === 'edit' ? 'Edit video works on one video, so the picture was removed.' : `Some references were removed: ${shortName(m)} does not accept them.`);
    st.refs = [...imgs, ...vids];
    if (!v.videoToVideo) st.videoUrl = '';
  }
}

function settingsSummary(mode) {
  const st = S.studio[mode];
  if (mode === 'image') return `${st.size.replace('x', '×')}${studioModel('image')?.image.qualities?.length ? ' · ' + st.quality : ''} · ×${st.count}`;
  return `${st.ratio === 'adaptive' ? 'Auto' : st.ratio} · ${st.resolution} · ${st.duration > 0 ? st.duration + 's' : 'auto'} · ×${st.count}`;
}

function drawMats(mode) {
  const box = $('#mats'); if (!box) return;
  const st = S.studio[mode]; const m = studioModel(mode);
  const task = mode === 'video' ? videoTask() : null;
  const needVideo = task === 'edit' || task === 'extend';
  const accepts = mode === 'image' ? !!m.image.edit : needVideo ? m.video.videoToVideo || task === 'extend' : m.video.imageToVideo || m.video.videoToVideo;
  const kids = st.refs.map((r) => h('div', { class: 'mat' + (r.loading ? ' loading' : '') },
    r.kind === 'video' ? h('video', { src: refThumb(r), muted: true, preload: 'metadata' }) : h('img', { src: refThumb(r), alt: '' }),
    r.loading && h('span', { class: 'spin', style: { position: 'absolute', inset: 0, margin: 'auto' } }),
    h('span', { class: 'lbl' }, r.kind === 'video' ? 'Video' : 'Image'),
    h('button', { class: 'x', title: 'Remove', onclick: () => { st.refs = st.refs.filter((x) => x !== r); drawMats(mode); updateGo(); } }, icon('x')),
  ));
  if (st.videoUrl) kids.push(h('div', { class: 'mat doc', title: st.videoUrl }, icon('link'), h('span', { class: 'lbl' }, 'Link'), h('button', { class: 'x', onclick: () => { st.videoUrl = ''; drawMats(mode); updateGo(); } }, icon('x'))));
  const room = mode === 'image' ? (m.image.edit?.max_images || 0) - st.refs.length
    : needVideo ? (m.video.maxVideos || 1) - st.refs.length - (st.videoUrl ? 1 : 0)
      : (m.video.imageToVideo ? m.video.maxImages : 0) + (m.video.videoToVideo ? m.video.maxVideos : 0) - st.refs.length - (st.videoUrl ? 1 : 0);
  if (accepts && room > 0) kids.push(h('button', { class: 'mat-add' + (needVideo ? ' need' : ''), id: 'mat-add', title: needVideo ? 'Add the video to work on' : 'Add a reference', onclick: (e) => openMaterialMenu(e.currentTarget, mode) }, h('div', {}, icon(needVideo ? 'video' : 'plus'), needVideo ? 'Video' : 'Reference')));
  box.replaceChildren(...kids);
  box.style.display = kids.length ? '' : 'none';
}

function openMaterialMenu(anchor, mode) {
  const m = studioModel(mode);
  const v = mode === 'video' ? m.video : null;
  const task = mode === 'video' ? videoTask() : null;
  const st = S.studio[mode];
  const nImg = st.refs.filter((r) => r.kind === 'image').length, nVid = st.refs.filter((r) => r.kind === 'video').length + (st.videoUrl ? 1 : 0);
  const canImg = mode === 'image' || (v.imageToVideo && task === 'create' && nImg < (v.maxImages || 1));
  const canVid = !!v?.videoToVideo && nVid < (v.maxVideos || 1);
  popover(anchor, h('div', { class: 'menu' },
    canImg && h('button', { onclick: () => { closePop(); pickFiles('image/*', true, (f) => addStudioRefs(mode, f)); } }, icon('upload'), 'Upload image'),
    canVid && h('button', { onclick: () => { closePop(); pickFiles('video/mp4,video/quicktime,video/webm', false, (f) => addStudioRefs(mode, f)); } }, icon('video'), 'Upload video'),
    canVid && h('button', { onclick: () => { closePop(); const u = prompt('Paste a public link to an .mp4 or .mov video'); if (u && u.trim()) { S.studio.video.videoUrl = u.trim(); drawMats(mode); updateGo(); } } }, icon('link'), 'Paste video link'),
    h('hr'),
    h('button', { onclick: () => { closePop(); pickFromAssets(mode, canVid, canImg); } }, icon('folder'), 'From my assets'),
  ), 'above');
}

async function addStudioRefs(mode, files) {
  const st = S.studio[mode]; const m = studioModel(mode);
  const v = mode === 'video' ? m.video : null;
  const task = mode === 'video' ? videoTask() : null;
  const ok = files.filter((f) => (f.type.startsWith('image/') && (mode === 'image' ? m.image.edit : v.imageToVideo && task === 'create')) || (f.type.startsWith('video/') && v?.videoToVideo));
  if (!ok.length) return toast(task === 'edit' || task === 'extend' ? 'This task works on a video. Add an .mp4 or .mov file, or switch the task to Create to use a picture.' : mode === 'video' && !v.videoToVideo ? `${shortName(m)} takes image references only.` : `${shortName(m)} does not take this kind of reference.`, 'error');
  const pending = ok.map((f) => ({ tmp: Math.random().toString(36).slice(2), name: f.name, kind: f.type.startsWith('video/') ? 'video' : 'image', preview: URL.createObjectURL(f), loading: true }));
  st.refs.push(...pending); drawMats(mode); updateGo();
  try {
    const got = await uploadFiles(ok);
    pending.forEach((p, i) => { const f = got.find((x) => x.name === p.name) || got[i]; if (f) Object.assign(p, f, { loading: false }); else p.failed = true; });
  } catch (e) { errToast(e); pending.forEach((p) => (p.failed = true)); }
  st.refs = st.refs.filter((r) => !r.failed);
  const lim = (k) => refLimit(mode, k);
  st.refs = [...st.refs.filter((r) => r.kind === 'image').slice(-lim('image')), ...st.refs.filter((r) => r.kind === 'video').slice(-lim('video'))];
  drawMats(mode); updateGo();
}

async function pickFromAssets(mode, allowVideo, allowImage = true) {
  const { items } = await api('/api/library');
  const list = items.filter((x) => (allowImage && x.type === 'image') || (allowVideo && x.type === 'video')).slice(0, 60);
  const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) bg.remove(); } },
    h('div', { class: 'modal', style: { height: 'min(640px, 100%)' } },
      h('div', { class: 'modal-head' }, h('div', { class: 'grow' }, h('b', {}, 'Pick from my assets'), h('small', {}, 'Click an item to use it as a reference')), h('button', { class: 'icon-btn', onclick: () => bg.remove() }, icon('x'))),
      h('div', { style: { overflowY: 'auto', padding: '16px' } }, list.length ? h('div', { class: 'recent' }, list.map((x) => h('button', { class: 'tile', onclick: async () => { bg.remove(); await useAsReference(x, mode); } }, x.type === 'video' ? h('video', { src: x.url, muted: true, preload: 'metadata' }) : h('img', { src: x.url, alt: '', loading: 'lazy' })))) : h('div', { class: 'empty' }, 'No saved images yet.')),
    ));
  document.body.append(bg);
}

function openModelMenu(anchor, mode) {
  const list = S.models.filter((m) => m.type === mode);
  const st = S.studio[mode];
  const cur = st.modelId;
  const choose = (m, task) => { closePop(); st.modelId = m.id; if (task) st.task = task; saveStudio(mode); renderStudioBar(mode); };
  popover(anchor, h('div', { class: 'models' },
    h('div', { class: 'menu-head' }, mode === 'video' ? 'VIDEO MODELS' : 'IMAGE MODELS', mode === 'video' && info(INFO.task)),
    list.map((m) => {
      const tasks = mode === 'video' ? m.video.tasks : [];
      return h('div', { class: 'mrow' + (m.id === cur ? ' sel' : ''), 'data-model': m.id },
        h('button', { class: 'mopt' + (m.id === cur ? ' sel' : ''), onclick: () => choose(m, tasks.includes(st.task) ? st.task : tasks[0]) },
          modelLogo(m),
          h('div', { class: 'txt' },
            h('div', { class: 'nm' }, shortName(m),
              mode === 'video' && m.video.videoToVideo && !m.video.textToVideo && h('span', { class: 'tag dim' }, 'Video edit'),
              /fast/i.test(m.id) && h('span', { class: 'tag new' }, 'Fast'),
              costTag(m)),
            m.tag && h('div', { class: 'ds mtag' }, m.tag),
            h('div', { class: 'ds', title: mode === 'video' ? modelPitch(m) : '' }, modelBlurb(m)),
            h('div', { class: 'pr' }, costText(m)),
          ),
          m.id === cur && icon('check', 'chk'),
        ),
        // What this model can do. One click picks the model and the task together.
        tasks.length > 1 && h('div', { class: 'mtasks' }, tasks.map((t) => h('button', { class: 'opt' + (m.id === cur && st.task === t ? ' on' : ''), 'data-task': t, title: TASKS[t][1], onclick: () => choose(m, t) }, icon(TASKS[t][2]), TASKS[t][0]))),
      );
    }),
  ), 'above');
}
function renderStudioBar(mode) {
  const dock = $('.dock'); if (!dock) return;
  dock.replaceChildren(...[tipBanner(mode), buildStudioBar(mode)].filter(Boolean));
  $('#prompt')?.focus();
}

function openSettings(anchor, mode) {
  const st = S.studio[mode]; const m = studioModel(mode);
  const body = h('div', { class: 'settings' });
  const redraw = () => {
    const kids = [h('h4', {}, mode === 'video' ? 'Video settings' : 'Image settings', h('button', { onclick: () => { if (mode === 'video') { st.resolution = ''; st.ratio = ''; st.duration = 5; } else { st.size = ''; st.quality = 'medium'; } st.count = 1; normaliseSettings(mode); saveStudio(mode); redraw(); sync(); } }, icon('retry'), 'Reset'))];
    if (mode === 'video') {
      const v = m.video;
      kids.push(labInfo('Aspect ratio', 'ratio'), h('div', { class: 'opts' }, v.ratios.map((r) => h('button', { class: 'opt' + (st.ratio === r ? ' on' : ''), onclick: () => { st.ratio = r; redraw(); sync(); } }, ratioIcon(r), r === 'adaptive' ? 'Auto' : r))));
      kids.push(labInfo('Resolution', 'resolution'), h('div', { class: 'opts' }, v.resolutions.map((r) => h('button', { class: 'opt' + (st.resolution === r ? ' on' : ''), onclick: () => { st.resolution = r; redraw(); sync(); } }, r))));
      const ds = v.durations.filter((d) => d > 0);
      if (ds.length > 1) {
        const val = h('div', { class: 'val' }, st.duration + 's');
        kids.push(labInfo('Duration', 'duration'), h('div', { class: 'slider-row' },
          h('input', { type: 'range', min: Math.min(...ds), max: Math.max(...ds), step: 1, value: st.duration, oninput: (e) => { const n = Number(e.target.value); st.duration = ds.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)); val.textContent = st.duration + 's'; sync(); } }), val));
      } else {
        kids.push(labInfo('Duration', 'duration'), h('div', { style: { color: 'var(--muted)', fontSize: '13px' } }, ds.length ? ds[0] + 's' : 'Matches the reference video'));
      }
    } else {
      kids.push(labInfo('Size', 'size'), h('div', { class: 'opts' }, m.image.sizes.map((s) => { const L = sizeLabel(s); return h('button', { class: 'opt' + (st.size === s ? ' on' : ''), onclick: () => { st.size = s; redraw(); sync(); } }, ratioIcon(L.icon), h('span', { class: 'two' }, L.name, h('small', {}, L.px))); })));
      if (m.image.qualities?.length) kids.push(labInfo('Quality', 'quality'), h('div', { class: 'opts' }, m.image.qualities.map((q) => h('button', { class: 'opt' + (st.quality === q ? ' on' : ''), onclick: () => { st.quality = q; redraw(); sync(); } }, q[0].toUpperCase() + q.slice(1)))));
    }
    kids.push(labInfo(mode === 'video' ? 'Batch: videos per run' : 'Batch: images per run', 'batch'),
      h('div', { class: 'opts four', id: 'batch-opts' }, batchOptions(mode === 'image' ? m : null).map((n) => h('button', { class: 'opt' + (st.count === n ? ' on' : ''), 'data-batch': n, onclick: () => { st.count = n; redraw(); sync(); } }, String(n)))),
      h('p', { class: 'set-note' }, 'Each result is charged separately. Failed ones are refunded.'));
    if (mode === 'video' && m.video.audio) kids.push(h('div', { class: 'row', style: { borderTop: '1px solid var(--line)', marginTop: '12px' } }, h('div', {}, 'Sound', h('small', {}, 'This model generates synced audio with the video.')), h('span', { class: 'tag new' }, icon('audio'), ' On')));
    if (mode === 'image') kids.push(h('p', { class: 'set-note' }, `These are all the sizes ${shortName(m)} makes${m.image.qualities?.length ? '' : ', at one fixed quality'}. For a story, banner or thumbnail, open a finished image and press Resize.`));
    body.replaceChildren(...kids);
  };
  const sync = () => { saveStudio(mode); const s = $('#set-sum'); if (s) s.textContent = settingsSummary(mode); updateGo(); };
  redraw();
  popover(anchor, body, 'above');
}
function ratioIcon(r) {
  const [a, b] = r === 'adaptive' ? [1, 1] : r.split(':').map(Number);
  const k = 16 / Math.max(a, b);
  return h('span', { class: 'ratio', style: { width: Math.max(5, a * k) + 'px', height: Math.max(5, b * k) + 'px', borderStyle: r === 'adaptive' ? 'dashed' : 'solid' } });
}

function updateGo() {
  const go = $('#go'); if (!go) return;
  const mode = onStudio('video') ? 'video' : 'image';
  const st = S.studio[mode]; const m = studioModel(mode);
  const c = $('#cost'); if (c) c.textContent = fmtCredits(estimate(mode));
  const hasText = !!$('#prompt')?.value.trim();
  const task = mode === 'video' ? videoTask() : null;
  const hasVideo = st.refs.some((r) => r.kind === 'video') || !!st.videoUrl;
  const needsVideo = (task === 'edit' || task === 'extend') && !hasVideo;
  const needsRef = mode === 'video' && !needsVideo && !m.video.textToVideo && !st.refs.length && !st.videoUrl && !(st.characterId && m.video.imageToVideo);
  const look = mode === 'image' ? curStyle() : null;
  const needsPhoto = !!look?.needsImage && !st.refs.length && !st.characterId;
  go.disabled = (!hasText && !(look?.needsImage && !needsPhoto)) || needsRef || needsVideo || needsPhoto || st.refs.some((r) => r.loading);
  go.title = needsVideo ? `Add the video you want to ${task === 'extend' ? 'extend' : 'edit'} first` : needsPhoto ? `${look.name} changes a photo. Add a photo first.` : needsRef ? `${shortName(m)} needs a reference ${m.video.videoToVideo ? 'video' : 'image'}` : !hasText ? 'Describe what you want first' : `About ${fmtCredits(estimate(mode))} credits`;
}

const ENH_TIP = 'Improve my prompt: a short, point-by-point version. Reads your photo too when one is attached.';
let ENH_UNDO = null; // your own words, kept until you type again
function drawEnhBtn() {
  const b = $('#enh-now'); if (!b) return;
  b.replaceChildren(icon(ENH_UNDO ? 'undo' : 'sparkle'));
  b.title = ENH_UNDO ? 'Undo: bring my own words back' : ENH_TIP;
  b.classList.toggle('on', !!ENH_UNDO);
}
async function enhanceNow(mode) {
  const ta = $('#prompt'); if (!ta) return;
  if (ENH_UNDO && ENH_UNDO.mode === mode) { ta.value = ENH_UNDO.old; S.draft[mode] = ENH_UNDO.old; ENH_UNDO.strip?.close(); ENH_UNDO = null; drawEnhBtn(); autoGrow(ta); updateGo(); return ta.focus(); }
  if (ta.readOnly) return;
  const refs = mode === 'image' ? S.studio.image.refs.filter((r) => r.kind === 'image' && r.id && !r.loading) : [];
  if (!ta.value.trim() && !refs.length) return toast(mode === 'image' ? 'Type a short idea or add a photo first, then press this.' : 'Type a short idea first, then press this.');
  // Your words stay visible while the AI works; a status line on top of the bar says what is happening (enhance.js).
  const old = ta.value; ta.readOnly = true;
  $('#prompt-bar-enh')?.remove();
  const strip = enhanceStatus(ta, mode); strip.el.id = 'prompt-bar-enh';
  if (refs.length) strip.el.querySelector('.enh-label').textContent = 'Reading your photo and enhancing…';
  const b = $('#enh-now'); if (b) { b.disabled = true; b.replaceChildren(h('span', { class: 'enh-spin' })); }
  try {
    const r = await api('/api/enhance', { method: 'POST', body: { prompt: old, mode, fileIds: refs.map((x) => x.id) } });
    ta.value = r.prompt; S.draft[mode] = r.prompt; setCredits(r.credits);
    ENH_UNDO = { mode, old, strip };
    strip.done(() => { if (ENH_UNDO?.strip === strip) enhanceNow(mode); });
    if (refs.length && !r.sawImage) toast('The photo could not be read just now, so only your words were improved.');
  } catch (e) { ta.value = old; strip.close(); errToast(e); }
  ta.readOnly = false; if (b) b.disabled = false; autoGrow(ta); updateGo(); drawEnhBtn(); ta.focus();
}

async function generate(mode) {
  const st = S.studio[mode]; const m = studioModel(mode);
  const ta = $('#prompt');
  const prompt = ta?.value.trim();
  const look = mode === 'image' ? curStyle() : null;
  if ((!prompt && !look?.needsImage) || $('#go')?.disabled) return;
  ENH_UNDO?.strip?.close(); ENH_UNDO = null; drawEnhBtn();
  st.busy = true; updateGo();
  const autoEnh = !!st.autoEnhance && !!prompt;
  const body = { idem: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`, mode, model: m.id, prompt, task: mode === 'video' ? videoTask() : undefined, styleId: look?.id, styleVar: look?.variable ? st.styleVar || look.variable.options[0] : undefined, fileIds: st.refs.map((r) => r.id), count: st.count, enhance: false, videoUrl: st.videoUrl || undefined, characterId: st.characterId || undefined, projectId: S.projectId || undefined,
    params: mode === 'image' ? { size: st.size, quality: st.quality } : { resolution: st.resolution, ratio: st.ratio, duration: st.duration } };
  // Show a placeholder right away.
  const temp = { id: 'tmp', mode, model: m.id, prompt: prompt || look?.name || '', styleName: look?.name, params: { ...body.params, count: st.count }, status: 'pending', media: [], createdAt: new Date().toISOString(), progress: autoEnh ? 'improving your prompt (auto-enhance is on)' : mode === 'image' ? 'creating' : 'starting' };
  S.gens[mode] = [temp, ...(S.gens[mode] || [])];
  // Empty the bar straight away so the same prompt is not sent twice. It comes back if the request fails.
  const sent = { refs: st.refs, videoUrl: st.videoUrl };
  S.draft[mode] = ''; ta.value = ''; autoGrow(ta);
  st.refs = []; st.videoUrl = ''; drawMats(mode);
  drawFeed(mode);
  $('#studio-scroll')?.scrollTo({ top: 0 });
  const startSid = S.sid[mode];
  let mine = null;
  const job = { kind: 'studio', mode, conv: { id: startSid }, temp };
  const tmpC = !startSid && !st.creating ? tempConv(mode, prompt || look?.name, '#/' + mode) : null;
  JOBS.add(job); renderRecents();
  try {
    // A second prompt sent before the first has created the session waits for it, so both land in one session.
    if (!S.sid[mode] && st.creating) await st.creating.catch(() => {});
    body.sessionId = S.sid[mode] || undefined;
    if (autoEnh) {
      // Its own short step, so the card says what is really happening and a slow helper never blocks the picture.
      try {
        const er = await api('/api/enhance', { method: 'POST', body: { prompt, mode, fileIds: mode === 'image' ? sent.refs.filter((x) => x.kind === 'image' && x.id).map((x) => x.id) : [] }, timeoutMs: 45000 });
        if (er.prompt?.trim()) { body.prompt = er.prompt; body.typedPrompt = prompt; }
        setCredits(er.credits);
      } catch (e) { toast('The prompt could not be improved just now, so your own words were used.'); }
      temp.progress = mode === 'image' ? 'creating' : 'starting';
      if (onStudio(mode)) drawFeed(mode);
    }
    const req = api('/api/generate', { method: 'POST', body, timeoutMs: 200000 });
    if (!body.sessionId) { mine = req; st.creating = req; }
    const r = await req;
    dropTemp(tmpC);
    if (S.gens[mode]?.includes(temp)) S.gens[mode] = S.gens[mode].map((g) => (g === temp ? r.generation : g));
    else if (S.gens[mode] && S.sid[mode] && S.sid[mode] === r.session?.id && !S.gens[mode].some((g) => g.id === r.generation.id)) S.gens[mode] = [r.generation, ...S.gens[mode]];
    else if (r.session && !(onStudio(mode) && S.sid[mode] === r.session.id)) UNREAD.add(r.session.id);
    setCredits(r.credits);
    if (r.session) {
      const ex = S.conversations.find((c) => c.id === r.session.id);
      if (ex) Object.assign(ex, r.session); else S.conversations.unshift(r.session);
      S.conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (!S.sid[mode] && S.sid[mode] === startSid) {
        S.sid[mode] = r.session.id;
        if (location.hash === '#/' + mode) { history.replaceState(null, '', `#/${mode}/${r.session.id}`); const t = $('#st-title'); if (t) t.textContent = r.session.title; }
      }
      renderRecents();
    }
    if (r.generation.note) toast(r.generation.note, 'error');
  } catch (e) {
    if (S.gens[mode]) S.gens[mode] = S.gens[mode].filter((g) => g !== temp);
    if (!S.draft[mode]) { S.draft[mode] = prompt; const box = onStudio(mode) && $('#prompt'); if (box) { box.value = prompt; autoGrow(box); } }
    if (!st.refs.length && !st.videoUrl) { st.refs = sent.refs; st.videoUrl = sent.videoUrl; if (onStudio(mode)) drawMats(mode); }
    errToast(e);
  }
  if (mine && st.creating === mine) st.creating = null;
  dropTemp(tmpC);
  JOBS.delete(job); renderRecents();
  st.busy = false;
  if (onStudio(mode)) { drawFeed(mode); updateGo(); }
}

// ======================================================================
// Home
// ======================================================================
const BANNERS = [
  { eyebrow: 'Video · Seedance 2.5', title: '30-second cinematic videos, with sound', text: 'Multi-shot clips with synced audio from a sentence or a single image.', cta: 'Create a video', go: () => pickAndGo('video', ['doubao-seedance-2-5', 'seedance-2-5-260628']), orbs: ['#1bb7c4', '#3a6bff', '#9b5cff'] },
  { eyebrow: 'AI Apps', title: 'One photo in, a finished ad out', text: 'Product photoshoots, 360° spins, outfit swaps and more. No prompt writing needed.', cta: 'Browse apps', go: () => (location.hash = '#/apps'), orbs: ['#ff7a45', '#ffcc4d', '#ff4f8b'] },
  { eyebrow: 'Image · Seedream 5.0 Pro', title: 'Precise images and edits', text: 'Generate from text or edit a photo with words: swap backgrounds, change colours, fix details.', cta: 'Create an image', go: () => pickAndGo('image', ['seedream-5.0-pro']), orbs: ['#43cea2', '#185a9d', '#2fe6f2'] },
];
let bannerTimer = null;
function pickAndGo(mode, ids) {
  const m = ids.map(byId).find((x) => x && x.type === mode);
  if (m) { S.studio[mode].modelId = m.id; saveStudio(mode); }
  location.hash = '#/' + mode;
}

async function renderHome() {
  const main = $('#main');
  dropTarget = null;
  let idx = 0;
  const hero = h('div', { class: 'hero' });
  const drawBanner = () => {
    const b = BANNERS[idx];
    hero.replaceChildren(
      h('div', { class: 'bgfx' }, b.orbs.map((c, i) => h('div', { class: 'orb', style: { width: 360 - i * 40 + 'px', height: 360 - i * 40 + 'px', right: 40 + i * 160 + 'px', top: i === 1 ? '40%' : '-60px', background: c, animationDelay: -i * 3 + 's' } }))),
      h('div', { class: 'copy' }, h('div', { class: 'eyebrow' }, icon('sparkle'), b.eyebrow), h('h2', {}, b.title), h('p', {}, b.text), h('button', { class: 'btn primary', onclick: b.go }, b.cta, icon('arrow'))),
      h('div', { class: 'dots' }, BANNERS.map((_, i) => h('button', { class: i === idx ? 'on' : '', 'aria-label': 'Slide ' + (i + 1), onclick: () => { idx = i; drawBanner(); } }))),
    );
  };
  drawBanner();
  clearInterval(bannerTimer);
  bannerTimer = setInterval(() => { if (!hero.isConnected) return clearInterval(bannerTimer); idx = (idx + 1) % BANNERS.length; drawBanner(); }, 7000);

  // Quick start bar
  let qmode = 'video';
  const qta = h('textarea', { rows: 2, placeholder: 'What do you want to create today?' });
  const segBtns = h('div', { class: 'seg' });
  const drawSeg = () => segBtns.replaceChildren(...['image', 'video', 'chat', 'code'].map((k) => h('button', { class: qmode === k ? 'on' : '', onclick: () => { qmode = k; drawSeg(); } }, icon(k), kindLabel[k])));
  drawSeg();
  const goQuick = () => {
    const t = qta.value.trim();
    if (qmode === 'chat') { S.pendingChat = t; location.hash = '#/chat'; return; }
    if (qmode === 'code') { S.pendingCode = t; location.hash = '#/code'; return; }
    S.draft[qmode] = t; location.hash = '#/' + qmode;
  };
  qta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goQuick(); } });
  const quick = h('div', { class: 'quick' }, h('div', { class: 'bar' }, h('div', { class: 'bar-top' }, qta), h('div', { class: 'bar-row' }, segBtns, h('div', { class: 'grow' }), micButton(qta), h('button', { class: 'gen-btn', onclick: goQuick }, icon('sparkle'), 'Start'))));

  const featured = ['doubao-seedance-2-5', 'doubao-seedance-2.0-fast', 'doubao-seedance-2.0', 'seedream-5.0-pro', 'gpt-image-2', 'nano-banana-2'].map(byId).filter(Boolean);
  const recent = h('div', { class: 'recent' });
  const page = h('div', { class: 'page home' },
    hero, quick,
    h('h2', {}, 'Models'),
    h('div', { class: 'model-row' }, featured.map((m) => h('button', { class: 'mcard', onclick: () => pickAndGo(m.type, [m.id]) },
      h('div', { class: 'top' }, modelLogo(m), h('b', {}, shortName(m)), h('span', { class: 'tag dim kind' }, kindLabel[m.type])),
      h('small', {}, modelBlurb(m)),
    ))),
    h('h2', {}, 'Popular apps', h('a', { href: '#/apps', style: { marginLeft: 'auto', fontSize: '13px', fontFamily: 'var(--font)', fontWeight: 500 } }, 'See all')),
    h('div', { class: 'app-grid' }, S.apps.slice(0, 8).map(appCard)),
    h('h2', {}, 'Your recent creations', h('a', { href: '#/assets', style: { marginLeft: 'auto', fontSize: '13px', fontFamily: 'var(--font)', fontWeight: 500 } }, 'All assets')),
    recent,
  );
  main.replaceChildren(topbar(), h('div', { class: 'scroll' }, page));
  try {
    const { items } = await api('/api/library');
    if (!items.length) recent.replaceWith(h('div', { class: 'empty', style: { border: '1px dashed var(--line-2)', borderRadius: '14px' } }, 'Nothing yet. Your images and videos will show up here.'));
    else recent.replaceChildren(...items.filter((x) => x.type !== 'other').slice(0, 12).map((x) => assetTile(x)));
  } catch {}
}

// ======================================================================
// AI Apps
// ======================================================================
function appCover(a, big) {
  return h('div', { class: 'cover', style: { background: `linear-gradient(135deg, ${a.colors[0]}, ${a.colors[1]})` } }, icon(a.icon || 'apps'), a.badge && h('span', { class: 'tag' }, a.badge));
}
function appCard(a) {
  return h('button', { class: 'appc', onclick: () => (location.hash = '#/apps/' + a.id) },
    appCover(a),
    h('span', { class: 'tag dim kindtag', style: { background: 'rgba(0,0,0,.45)', color: '#fff' } }, a.category === 'video' ? 'Video' : 'Image'),
    h('div', { class: 'body' }, h('b', {}, a.name), h('small', {}, a.tagline)),
  );
}

let appFilter = { tab: 'all', q: '' };
function renderApps(openId) {
  const main = $('#main');
  dropTarget = null;
  const grid = h('div', { class: 'app-grid' });
  const draw = () => {
    const q = appFilter.q.toLowerCase();
    const list = S.apps.filter((a) => (appFilter.tab === 'all' || (appFilter.tab === 'video' ? a.category === 'video' : a.group === appFilter.tab)) && (!q || (a.name + a.tagline + a.description).toLowerCase().includes(q)));
    grid.replaceChildren(...(list.length ? list.map(appCard) : [h('div', { class: 'empty', style: { gridColumn: '1/-1' } }, 'No apps match.')]));
    $$('.apps-page .tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === appFilter.tab));
  };
  const heroApps = ['character-scenes', 'virtual-tryon', 'headshot-studio'].map((x) => S.apps.find((a) => a.id === x)).filter(Boolean);
  const page = h('div', { class: 'page' },
    h('div', { class: 'toolbar' }, h('h1', { style: { margin: 0, flex: 1 } }, 'App Library'),
      h('label', { class: 'search' }, icon('search'), h('input', { placeholder: 'Search apps', value: appFilter.q, oninput: (e) => { appFilter.q = e.target.value; draw(); } }))),
    h('p', { class: 'sub' }, 'One-purpose tools. Add a photo or a line of text and get a finished result. Each run is priced like a normal generation.'),
    heroApps.length === 3 && h('div', { class: 'app-hero' }, heroApps.map(appCard)),
    h('div', { class: 'toolbar' }, h('div', { class: 'tabs' }, [['all', 'All'], ['character', 'Characters'], ['portrait', 'Portraits'], ['fashion', 'Fashion'], ['product', 'Product'], ['edit', 'Editing'], ['video', 'Video']].map(([k, l]) => h('button', { 'data-tab': k, onclick: () => { appFilter.tab = k; draw(); } }, l)))),
    grid,
  );
  if (!$('.apps-page')) main.replaceChildren(topbar(), h('div', { class: 'scroll apps-page' }, page));
  draw();
  closeAppModal(true);
  if (openId) { const a = S.apps.find((x) => x.id === openId); if (a) openAppModal(a); else location.hash = '#/apps'; }
}

// ---------- AI App runs ----------
// A run belongs to the app, not to the pop-up: closing the pop-up leaves it working, and opening the app again shows it.
const APP_LIVE = new Map(); // app id -> placeholder cards of runs that are still being made
const APP_WATCH = new Map(); // generation id -> { appId, cid } for videos that are still rendering
const appConv = (appId) => S.conversations.find((c) => c.kind === 'app' && c.appId === appId);
const openAppBg = (appId) => { const bg = $('.modal-bg.app'); return bg && bg._appId === appId ? bg : null; };
const appBusy = (appId) => !!APP_LIVE.get(appId)?.size || [...APP_WATCH.values()].some((w) => w.appId === appId);
let appWatchTimer = null;
function watchApps() {
  clearTimeout(appWatchTimer);
  if (!APP_WATCH.size) return;
  appWatchTimer = setTimeout(async () => {
    for (const [gid, w] of [...APP_WATCH]) {
      try {
        const r = await api('/api/generations/' + gid); const g = r.generation; setCredits(r.credits);
        const open = openAppBg(w.appId);
        if (g.status !== 'pending') {
          APP_WATCH.delete(gid);
          const name = S.apps.find((x) => x.id === w.appId)?.name || 'Your app';
          if (!open) { if (w.cid && g.status === 'done') UNREAD.add(w.cid); toast(g.status === 'done' ? `${name} is ready. Open it from Recents.` : `${name} could not finish. Credits were refunded.`, g.status === 'done' ? '' : 'error'); }
          renderRecents();
        }
        open?._update(g);
      } catch (e) { if (e.status === 404) { APP_WATCH.delete(gid); renderRecents(); } }
    }
    watchApps();
  }, 7000);
}

function closeAppModal(silent) {
  const bg = $('.modal-bg.app'); if (!bg) return;
  const name = bg._appId && appBusy(bg._appId) && S.apps.find((x) => x.id === bg._appId)?.name;
  bg._cleanup?.(); bg.remove();
  if (name) toast(`${name} keeps working in the background. Open it again from Recents.`);
  if (!silent && location.hash.startsWith('#/apps/')) history.replaceState(null, '', '#/apps');
}

async function openAppModal(a) {
  const state = { files: {}, text: '', videoUrl: '', model: a.model, runs: [], characterId: null, options: {}, consent: false, params: {}, count: 1 };
  const isVideo = a.category === 'video';
  const hasPhoto = a.inputs.some((i) => ['image', 'images', 'subject'].includes(i.type));
  // What is really sent: the user's choice, else the app's default, kept inside what the chosen model can do.
  function settings() {
    const m = byId(state.model), d = a.settings || {}, p = state.params;
    if (!m) return {};
    if (!isVideo) { const want = p.size || (a.frame ? 'auto' : d.size); return { size: want === 'auto' || m.image.sizes.includes(want) ? want : m.image.sizes[0] }; }
    const v = m.video, pick = (list, ...want) => want.find((x) => list.includes(x)) ?? list[0];
    return { resolution: pick(v.resolutions, p.resolution, d.resolution, '720p'), ratio: pick(v.ratios, p.ratio, d.ratio, hasPhoto ? 'adaptive' : '16:9', '16:9'), duration: pick(v.durations, p.duration, d.duration, 5) };
  }
  const runs = () => a.variants?.length || state.count;
  const results = h('div', { class: 'app-main' }, h('div', { class: 'empty' }, h('span', { class: 'spin' })));
  const costEl = h('span', {});
  const runBtn = h('button', { class: 'gen-btn', style: { justifyContent: 'center', width: '100%', height: '44px' }, onclick: run }, icon('sparkle'), 'Run app', h('span', { class: 'cost' }, icon('bolt'), costEl));
  const modelSel = h('select', { onchange: (e) => { state.model = e.target.value; drawOptions(); updateCost(); } }, a.models.filter(byId).map((mid) => h('option', { value: mid, selected: mid === state.model }, shortName(byId(mid)))));

  function updateCost() {
    const m = byId(state.model); if (!m) return;
    let c;
    if (m.type === 'image') c = m.price.creditsPerImage;
    else { const { resolution: r, duration: d } = settings(); c = (m.price.creditsPerSecond[r] || 0) * (d > 0 ? d : 10); }
    costEl.textContent = '≈' + fmtCredits(c * runs());
    const ready = a.inputs.every((inp) => !inp.required || (inp.type === 'text' ? state.text.trim() : inp.type === 'video' ? state.files.video || state.videoUrl : inp.type === 'consent' ? state.consent : inp.type === 'select' ? true : inp.type === 'subject' ? charById(state.characterId) || (state.files[inp.key] || []).filter(Boolean).length : (state.files[inp.key] || []).filter(Boolean).length));
    const busy = !!APP_LIVE.get(a.id)?.size;
    runBtn.disabled = !ready || busy || Object.values(state.files).flat().some((f) => f?.loading);
    runBtn.classList.toggle('busy', busy);
  }

  function dropBox(inp, slot = 0) {
    const key = inp.key;
    const cur = inp.type === 'video' ? state.files.video : (state.files[key] || [])[slot];
    const accept = inp.type === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/*';
    const box = h('div', { class: 'drop' });
    const set = async (file) => {
      const pend = { name: file.name, kind: inp.type === 'video' ? 'video' : 'image', preview: URL.createObjectURL(file), loading: true };
      if (inp.type === 'video') state.files.video = pend; else { state.files[key] = state.files[key] || []; state.files[key][slot] = pend; }
      drawInputs(); updateCost();
      try { const [f] = await uploadFiles([file]); if (!f) throw new Error('Upload failed'); Object.assign(pend, f, { loading: false }); }
      catch (e) { errToast(e); if (inp.type === 'video') state.files.video = null; else state.files[key][slot] = null; }
      drawInputs(); updateCost();
    };
    box.onclick = (e) => { if (e.target.closest('.x')) return; pickFiles(accept, false, (f) => set(f[0])); };
    box.ondragover = (e) => { e.preventDefault(); box.classList.add('over'); };
    box.ondragleave = () => box.classList.remove('over');
    box.ondrop = (e) => { e.preventDefault(); box.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) set(f); };
    if (cur) {
      box.append(cur.kind === 'video' ? h('video', { src: refThumb(cur), muted: true, controls: true }) : h('img', { src: refThumb(cur), alt: '' }));
      if (cur.loading) box.append(h('span', { class: 'spin', style: { position: 'relative', zIndex: 1 } }));
      box.append(h('button', { class: 'x', title: 'Remove', onclick: () => { if (inp.type === 'video') state.files.video = null; else state.files[key][slot] = null; drawInputs(); updateCost(); } }, icon('x')));
    } else box.append(h('div', {}, icon(inp.type === 'video' ? 'video' : 'upload'), h('div', {}, inp.type === 'video' ? 'Upload a video' : 'Click or drop an image'), h('small', { style: { color: 'var(--faint)' } }, inp.type === 'video' ? 'MP4, MOV or WebM' : 'PNG, JPG or WebP')));
    return box;
  }

  const inputsBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
  function drawInputs() {
    inputsBox.replaceChildren(...a.inputs.map((inp) => {
      if (inp.type === 'text') {
        const el = h(inp.multiline ? 'textarea' : 'textarea', { rows: inp.multiline ? 5 : 3, placeholder: inp.placeholder || '', oninput: (e) => { state.text = e.target.value; updateCost(); } });
        el.value = state.text;
        return h('div', {}, h('div', { class: 'lab' }, inp.label), el);
      }
      if (inp.type === 'subject') {
        const list = S.characters.filter((c) => !inp.kinds || inp.kinds.includes(c.kind));
        const picked = list.find((c) => c.id === state.characterId);
        const noun = subjectNoun(inp.kinds);
        const newOne = () => openCharacterDialog(null, { kind: inp.kinds?.[0], kinds: inp.kinds, onSave: (c) => { state.characterId = c.id; drawInputs(); updateCost(); } });
        const plural = noun === 'character' ? 'characters' : inp.kinds.length === 1 ? KIND_WORD[inp.kinds[0]] + 's' : 'products and logos';
        const saved = h('div', { class: 'saved-box' },
          h('div', { class: 'saved-head' }, h('b', {}, `Your saved ${plural}`), h('a', { href: '#/characters', title: 'Rename, change or delete them' }, 'Manage')),
          h('div', { class: 'char-row' },
            list.map((c) => h('button', { class: 'char-pick' + (picked?.id === c.id ? ' on' : ''), title: c.name, onclick: () => { state.characterId = picked?.id === c.id ? null : c.id; drawInputs(); updateCost(); } }, h('img', { src: charThumb(c), alt: '' }), h('span', { class: 'clip1' }, c.name))),
            h('button', { class: 'char-pick add', title: `Save a ${noun} to reuse it in every app`, onclick: newOne }, h('span', { class: 'plus' }, icon('plus')), h('span', {}, 'Save new'))),
          h('small', { class: 'hint' }, picked ? `Using ${picked.name}. Click it again to use a photo instead.` : `Saved once, they can be picked in every app, Image and Video. A photo you add above is used for this run only and is not saved.`));
        return h('div', {}, h('div', { class: 'lab' }, inp.label, !inp.required && ' (optional)'),
          !picked && dropBox(inp), saved);
      }
      if (inp.type === 'select') {
        const cur = state.options[inp.key] || inp.options[0].value;
        state.options[inp.key] = cur;
        return h('div', {}, h('div', { class: 'lab' }, inp.label), h('div', { class: 'opt-row' }, inp.options.map((o) => h('button', { class: 'opt' + (cur === o.value ? ' on' : ''), onclick: () => { state.options[inp.key] = o.value; drawInputs(); } }, o.label))));
      }
      if (inp.type === 'consent') return h('label', { class: 'consent' }, h('input', { type: 'checkbox', checked: state.consent, onchange: (e) => { state.consent = e.target.checked; updateCost(); } }), h('span', {}, inp.label));
      if (inp.type === 'images') return h('div', {}, h('div', { class: 'lab' }, inp.label), h('div', { class: 'drops' }, Array.from({ length: inp.max || 2 }, (_, i) => dropBox(inp, i))));
      if (inp.type === 'video') return h('div', {}, h('div', { class: 'lab' }, inp.label), dropBox(inp), h('div', { class: 'or' }, 'or'), h('input', { type: 'text', placeholder: 'Paste a public video link (https://…mp4)', value: state.videoUrl, oninput: (e) => { state.videoUrl = e.target.value.trim(); updateCost(); } }));
      return h('div', {}, h('div', { class: 'lab' }, inp.label), dropBox(inp));
    }));
  }

  // Output settings, limited to what the chosen model and the gateway accept.
  const optionsBox = h('div', { class: 'app-opts' });
  function drawOptions() {
    const m = byId(state.model); if (!m) return optionsBox.replaceChildren();
    const cur = settings();
    const row = (label, key, opts) => opts.length > 1 && h('div', {}, h('div', { class: 'lab' }, label), h('div', { class: 'opt-row' }, opts.map(([v, l]) => h('button', { class: 'opt' + (cur[key] === v ? ' on' : ''), 'data-opt': key + ':' + v, onclick: () => { state.params[key] = v; drawOptions(); updateCost(); } }, l))));
    if (!isVideo) {
      const names = { '1024x1024': 'Square 1:1', '1024x1536': 'Portrait 2:3' };
      optionsBox.replaceChildren(...[
        row('Shape', 'size', [...(a.frame ? [['auto', 'Match my photo']] : []), ...m.image.sizes.map((x) => [x, names[x] || x.replace('x', ' × ')])]),
        !a.variants && h('div', {}, h('div', { class: 'lab' }, 'How many'), h('div', { class: 'opt-row' }, [1, 2, 3, 4].map((n) => h('button', { class: 'opt' + (state.count === n ? ' on' : ''), 'data-opt': 'count:' + n, onclick: () => { state.count = n; drawOptions(); updateCost(); } }, String(n))))),
      ].filter(Boolean));
      return;
    }
    const v = m.video;
    const lens = [...new Set([5, 8, 10, 15, (a.settings || {}).duration].filter((d) => v.durations.includes(d)))].sort((x, y) => x - y);
    const ratioName = { adaptive: 'Match my photo', '16:9': 'Wide 16:9', '9:16': 'Tall 9:16', '1:1': 'Square 1:1', '4:3': '4:3', '3:4': '3:4', '21:9': 'Cinema 21:9' };
    optionsBox.replaceChildren(...[
      row('Shape', 'ratio', v.ratios.filter((r) => r !== 'adaptive' || hasPhoto).map((r) => [r, ratioName[r] || r])),
      row('Length', 'duration', lens.map((d) => [d, d + ' sec'])),
      row('Quality', 'resolution', v.resolutions.map((r) => [r, r])),
    ].filter(Boolean));
  }

  async function run() {
    if (appBusy(a.id)) return toast('This app is still working on your last run. Please wait for it to finish.');
    runBtn.disabled = true;
    const fileIds = [];
    for (const inp of a.inputs) {
      if (inp.type === 'subject' && charById(state.characterId)) continue;
      for (const f of inp.type === 'video' ? [state.files.video] : state.files[inp.key] || []) if (f?.id) fileIds.push(f.id);
    }
    const characterId = a.inputs.some((i) => i.type === 'subject') && charById(state.characterId) ? state.characterId : undefined;
    const temp = { id: 'tmp', mode: a.category, appId: a.id, model: state.model, prompt: state.text || a.name, params: {}, status: 'pending', media: [], createdAt: new Date().toISOString(), progress: 'starting' };
    const frameFileId = a.frame && (state.files[a.frame] || []).find((x) => x?.id)?.id;
    const body = { fileIds, text: state.text, videoUrl: state.videoUrl || undefined, model: state.model, characterId, options: state.options, consent: state.consent, projectId: S.projectId || undefined, params: settings(), count: a.variants ? 1 : state.count, frameFileId: frameFileId || undefined };
    const live = APP_LIVE.get(a.id) || new Set(); APP_LIVE.set(a.id, live); live.add(temp);
    state.runs.unshift(temp); drawRuns();
    // From here on nothing depends on this pop-up: it may be closed and opened again while the run goes on.
    let job = null, unread = false;
    try {
      const s = await api(`/api/apps/${a.id}/session`, { method: 'POST' }).catch(() => null);
      if (s?.session) { noteConv(s.session); job = { kind: 'app', appId: a.id, conv: { id: s.session.id } }; JOBS.add(job); renderRecents(); }
      const r = await api(`/api/apps/${a.id}/run`, { method: 'POST', body });
      const gens = r.generations || [r.generation];
      live.delete(temp);
      if (r.session) noteConv(r.session);
      setCredits(r.credits);
      S.gens[a.category] = null; // refresh studio history next time
      for (const g of gens) if (g.status === 'pending') APP_WATCH.set(g.id, { appId: a.id, cid: r.session?.id });
      watchApps();
      const open = openAppBg(a.id);
      if (open) open._swap(temp, gens);
      else if (gens.some((g) => g.status === 'done')) { unread = true; toast(`${a.name} is ready. Open it from Recents.`); }
    } catch (e) {
      live.delete(temp);
      const open = openAppBg(a.id);
      if (open) { open._swap(temp, []); errToast(e); } else toast(`${a.name} could not finish. ${cleanErr(e.message ?? e)}`, 'error');
      api(`/api/apps/${a.id}/session`, { method: 'DELETE' }).catch(() => {}).then(loadConversations).then(renderRecents).catch(() => {}); // a first run that failed leaves no entry behind
    } finally { if (job) endJob(job, { unread }); else renderRecents(); }
  }

  const notice = h('div', { class: 'app-bgnote' });
  function drawRuns() {
    const busy = state.runs.some((g) => g.status === 'pending');
    notice.style.display = busy ? '' : 'none';
    if (busy && !notice.firstChild) notice.append(h('span', { class: 'spin' }), h('div', { class: 'grow' }, h('b', {}, 'Working on it'), h('small', {}, 'You can close this window. It keeps working in the background, and the result is saved in Recents and Assets.')), h('button', { class: 'btn ghost sm', onclick: () => closeAppModal() }, 'Close and keep working'));
    if (!state.runs.length) {
      results.replaceChildren(h('div', { class: 'empty' }, h('div', { style: { width: '84px', height: '84px', borderRadius: '22px', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${a.colors[0]}, ${a.colors[1]})` } }, icon(a.icon)), h('b', { style: { color: 'var(--text)' } }, a.name), h('div', { style: { maxWidth: '360px' } }, a.description)));
      return;
    }
    results.replaceChildren(...state.runs.map((g) => genCard(g, { onChange: (w, x) => { if (w === 'delete') { APP_WATCH.delete(x.id); state.runs = state.runs.filter((y) => y.id !== x.id); drawRuns(); updateCost(); renderRecents(); } } })));
  }

  const bg = h('div', { class: 'modal-bg app', onclick: (e) => { if (e.target === bg) closeAppModal(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'modal-head' },
        h('div', { class: 'ico', style: { background: `linear-gradient(135deg, ${a.colors[0]}, ${a.colors[1]})` } }, icon(a.icon)),
        h('div', { class: 'grow' }, h('b', {}, a.name), h('small', {}, `By Scenly · ${a.category === 'video' ? 'Video' : 'Image'} app`)),
        h('button', { class: 'icon-btn', title: 'Close', onclick: () => closeAppModal() }, icon('x')),
      ),
      notice,
      h('div', { class: 'modal-body' },
        h('div', { class: 'app-side' },
          h('p', { class: 'desc' }, a.description),
          inputsBox,
          optionsBox,
          h('div', {}, h('div', { class: 'lab' }, 'Model'), modelSel),
          h('div', { class: 'run' }, runBtn, h('small', {}, (a.variants ? `Makes ${a.variants.length} images. ` : '') + 'Charged only when it succeeds. Failed runs are refunded.')),
        ),
        results,
      ),
    ),
  );
  bg._appId = a.id;
  bg._swap = (temp, gens) => { state.runs = state.runs.flatMap((g) => (g === temp ? gens : [g])); drawRuns(); updateCost(); };
  bg._update = (g) => { state.runs = state.runs.map((x) => (x.id === g.id ? g : x)); drawRuns(); updateCost(); };
  document.body.append(bg);
  const mine = appConv(a.id); if (mine) { UNREAD.delete(mine.id); renderRecents(); }
  state.runs = [...(APP_LIVE.get(a.id) || [])];
  drawInputs(); drawOptions(); updateCost(); if (state.runs.length) drawRuns();
  try {
    const { generations } = await api('/api/generations?limit=500');
    const past = generations.filter((g) => g.appId === a.id).slice(0, 40);
    state.runs = [...state.runs.filter((g) => g.id === 'tmp' || !past.some((p) => p.id === g.id)), ...past];
    for (const g of past) if (g.status === 'pending') APP_WATCH.set(g.id, { appId: a.id, cid: g.sessionId });
    watchApps(); renderRecents();
  } catch {}
  if (bg.isConnected) { drawRuns(); updateCost(); }
}

// ======================================================================
// Assets
// ======================================================================
const assetGen = (x) => ({ mode: x.type === 'video' ? 'video' : 'image', prompt: x.prompt, model: x.model, sessionId: x.sessionId, conversationId: x.conversationId, tool: x.tool, styleId: x.styleId, styleVar: x.styleVar, typedPrompt: x.typedPrompt, params: x.params });
// Reuse from Assets: back to the app, session or chat it was made in, which moves to the top of Recents.
async function assetReuse(x) {
  if (x.builderId && S.config.flags?.videoBuilder) { location.hash = '#/builder/' + x.builderId; return; }
  if (x.appId) {
    const c = appConv(x.appId);
    if (c) { try { noteConv((await api(`/api/conversations/${c.id}/touch`, { method: 'POST' })).conversation); } catch { /* open it anyway */ } }
    location.hash = '#/apps/' + x.appId; return;
  }
  return reusePrompt(assetGen(x));
}
// ---------- downloads: signed links with readable names, one ZIP for a selection, and a tray ----------
const DL = { list: store.get('downloads', []).filter((d) => d.expires > Date.now()), open: false };
const saveDL = () => store.set('downloads', DL.list.slice(0, 30).map(({ id, name, size, url, expires, count }) => ({ id, name, size, url, expires, count })));
function startDownload(url) { const a = h('a', { href: url, hidden: true, 'data-plain': '1' }); document.body.append(a); a.click(); setTimeout(() => a.remove(), 2000); }
function addDownload(d) { DL.list.unshift({ id: 'd' + Date.now() + Math.random().toString(36).slice(2, 6), at: Date.now(), ...d }); saveDL(); DL.open = true; drawTray(); }
async function downloadFiles(ids, fallbackUrl) {
  ids = [...new Set(ids)];
  if (!ids.length) return;
  try {
    if (ids.length === 1) {
      const { links } = await api('/api/downloads/link', { method: 'POST', body: { ids } });
      const l = links[0];
      if (l.remote) { window.open(l.url, '_blank', 'noopener'); return; }
      startDownload(l.url); addDownload({ name: l.name, size: l.size, url: l.url, expires: Date.now() + l.expiresIn * 1000 });
    } else {
      addDownload({ name: `Preparing ${ids.length} files…`, busy: true, expires: Date.now() + 60000 });
      const row = DL.list[0];
      try {
        const z = await api('/api/downloads/zip', { method: 'POST', body: { ids } });
        Object.assign(row, { name: z.name, size: z.size, url: z.url, count: z.count, busy: false, expires: Date.now() + z.expiresIn * 1000 }); saveDL(); drawTray();
        startDownload(z.url);
        if (z.skipped) toast(`${z.skipped} of the files are not stored in Scenly and were left out.`);
      } catch (e) { DL.list = DL.list.filter((x) => x !== row); saveDL(); drawTray(); throw e; }
    }
  } catch (e) {
    if (fallbackUrl && ids.length === 1) { const a = h('a', { href: fallbackUrl, download: '', hidden: true, 'data-plain': '1' }); document.body.append(a); a.click(); a.remove(); } else errToast(e);
  }
}
function drawTray() {
  DL.list = DL.list.filter((d) => d.expires > Date.now() || d.busy);
  let tray = $('#dl-tray');
  if (!DL.list.length || !S.user) { tray?.remove(); return; }
  if (!tray) { tray = h('div', { id: 'dl-tray', class: 'dl-tray' }); document.body.append(tray); }
  const mins = (d) => Math.max(1, Math.round((d.expires - Date.now()) / 60000));
  tray.classList.toggle('open', DL.open);
  tray.replaceChildren(...[
    h('button', { class: 'dl-head', title: 'Downloads', onclick: () => { DL.open = !DL.open; drawTray(); } }, icon('dl'), h('span', {}, 'Downloads'), h('span', { class: 'n' }, String(DL.list.length)), icon('down')),
    DL.open && h('div', { class: 'dl-list' },
      DL.list.map((d) => h('div', { class: 'dl-row' },
        d.busy ? h('span', { class: 'spin' }) : icon(d.count ? 'folder' : 'check'),
        h('div', { class: 'txt' }, h('div', { class: 'nm', title: d.name }, d.name), h('small', {}, d.busy ? 'Getting it ready' : [d.count ? `${d.count} files` : null, d.size ? fmtSize(d.size) : null, `link works for ${mins(d)} more min`].filter(Boolean).join(' · '))),
        !d.busy && h('a', { class: 'icon-btn sm', href: d.url, title: 'Download again', 'data-plain': '1' }, icon('dl')),
      )),
      h('button', { class: 'dl-clear', onclick: () => { DL.list = DL.list.filter((d) => d.busy); saveDL(); drawTray(); } }, 'Clear list'),
    ),
  ].filter(Boolean));
}
// Every Download button for a stored image or video goes through a signed link, so the file arrives with a readable name.
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[download]'); if (!a || a.dataset.plain) return;
  const m = (a.getAttribute('href') || '').match(/^\/api\/media\/([\w-]+)$/); if (!m) return;
  e.preventDefault(); e.stopPropagation(); downloadFiles([m[1]], a.getAttribute('href'));
}, true);
setTimeout(drawTray, 1500);

function assetButtons(x, cls = 'icon-btn sm') {
  return [
    x.type !== 'video' && h('button', { class: cls, title: 'Edit: change it, remove the background, resize, upscale and more', onclick: (e) => { e.stopPropagation(); openEditor(x); } }, icon('edit')),
    (x.appId || x.builderId || (x.prompt && !x.tool && x.type !== 'other')) && h('button', { class: cls, title: x.appId ? 'Open the app it was made in' : x.builderId ? 'Open the video project it was made in' : 'Reuse prompt', onclick: (e) => { e.stopPropagation(); assetReuse(x); } }, icon('retry')),
    h('a', { class: cls, href: x.url, download: '', title: 'Download', onclick: (e) => e.stopPropagation() }, icon('dl')),
  ];
}
// The app each result was made in, for the Assets filter and the label on each tile.
const ORIGIN = { image: ['Image', 'image'], video: ['Video Studio', 'video'], chat: ['Chat', 'chat'], pro: ['Studio Pro', 'wand'], ads: ['Ad Studio', 'megaphone'], builder: ['Video Builder', 'film'], agent: ['Video Agent', 'sparkle'], edit: ['Editor', 'edit'] };
const originKey = (x) => (x.origin === 'app' || (!x.origin && x.appId) ? 'app:' + x.appId : x.origin || (x.source === 'chat' ? 'chat' : x.type === 'video' ? 'video' : 'image'));
const originInfo = (k) => { if (k.startsWith('app:')) { const aid = k.slice(4); return [S.apps.find((a) => a.id === aid)?.name || aid.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), 'apps']; } return ORIGIN[k] || ['Other', 'folder']; };
const assetMedia = (x, extra = {}) => (x.type === 'video' ? h('video', { src: x.url, poster: x.poster || null, muted: true, preload: x.poster ? 'none' : 'metadata', ...extra }) : x.type === 'other' ? h('div', { class: 'audio-tile', onclick: (e) => e.stopPropagation() }, icon('audio'), h('audio', { src: x.url, controls: true, preload: 'none' })) : h('img', { src: x.url, alt: x.prompt || '', loading: 'lazy', ...extra }));
function assetTile(x, withCap) {
  const [oname, oicon] = originInfo(originKey(x));
  const sel = withCap && ASSET_SEL;
  const tile = h('div', { class: 'tile' + (x.type === 'video' ? ' v' : '') + (sel ? ' selecting' : '') + (sel?.has(x.id) ? ' picked' : ''), 'data-id': x.id },
    sel && h('span', { class: 'pick' }, icon('check')),
    withCap && h('span', { class: 'tag dim app-tag', title: 'Made in ' + oname }, icon(oicon), oname),
    assetMedia(x, x.type === 'video' ? { onmouseenter: (e) => e.target.play().catch(() => {}), onmouseleave: (e) => e.target.pause(), onclick: () => openLightbox(x), style: { cursor: 'zoom-in' } } : { onclick: () => openLightbox(x) }),
    withCap && h('div', { class: 'cap' }, x.prompt || ''),
    h('div', { class: 'over' }, withCap ? assetButtons(x) : h('a', { class: 'icon-btn sm', href: x.url, download: '', title: 'Download' }, icon('dl'))),
  );
  if (sel) tile.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleAssetPick(x.id); }, true);
  return tile;
}
function assetRow(x) {
  const [where, wicon] = originInfo(originKey(x));
  const sel = ASSET_SEL;
  const row = h('div', { class: 'asset-row' + (sel ? ' selecting' : '') + (sel?.has(x.id) ? ' picked' : ''), 'data-id': x.id, onclick: () => { if (x.type !== 'other') openLightbox(x); } },
    sel && h('span', { class: 'pick' }, icon('check')),
    h('div', { class: 'thumb' + (x.type === 'video' ? ' v' : '') }, x.type === 'video' ? (x.poster ? h('img', { src: x.poster, alt: '', loading: 'lazy' }) : h('video', { src: x.url, muted: true, preload: 'metadata' })) : x.type === 'other' ? icon('audio') : h('img', { src: x.url, alt: '', loading: 'lazy' }), x.type === 'video' && icon('play')),
    h('div', { class: 'txt' },
      h('div', { class: 'p' }, x.prompt || (x.type === 'video' ? 'Video' : 'Image')),
      h('div', { class: 'm' }, h('span', {}, icon(x.type === 'video' ? 'video' : x.type === 'other' ? 'audio' : 'image'), x.type === 'video' ? 'Video' : x.type === 'other' ? 'Sound' : 'Image'), h('span', {}, icon(wicon), where), h('span', {}, new Date(x.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }))),
    ),
    h('div', { class: 'acts' }, assetButtons(x, 'icon-btn')),
  );
  if (sel) row.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleAssetPick(x.id); }, true);
  return row;
}
let assetTab = 'all', assetFrom = 'all';
let ASSET_SEL = null; // a Set of picked ids while "Select" is on
let assetSelChanged = () => {};
function toggleAssetPick(aid) {
  if (!ASSET_SEL) return;
  if (ASSET_SEL.has(aid)) ASSET_SEL.delete(aid); else ASSET_SEL.add(aid);
  $$(`[data-id="${aid}"]`).forEach((el) => el.classList.toggle('picked', ASSET_SEL.has(aid)));
  assetSelChanged();
}
async function renderAssets() {
  const main = $('#main');
  dropTarget = null;
  let view = store.get('assets-view', 'grid');
  const grid = h('div', { class: 'masonry' }, h('div', { class: 'empty' }, h('span', { class: 'spin' })));
  const tabs = h('div', { class: 'tabs' });
  const toggle = h('div', { class: 'row-gap' });
  ASSET_SEL = null;
  const usageLine = h('span', { class: 'usage', id: 'storage-usage' });
  const selBar = h('div', { class: 'sel-bar', id: 'sel-bar', hidden: true });
  const page = h('div', { class: 'page' }, h('h1', {}, 'Assets'), h('p', { class: 'sub' }, 'Every image, video and sound you have made in any app, newest first. Filter by type or by the app that made it. ', usageLine), h('div', { class: 'toolbar' }, tabs, toggle), selBar, grid);
  api('/api/storage/usage').then((u) => { usageLine.textContent = `Storage used: ${fmtSize(u.bytes)}${u.quotaBytes ? ' of ' + fmtSize(u.quotaBytes) : ''}.`; }).catch(() => {});
  const from = h('div', { class: 'opt-row asset-from' });
  tabs.parentElement.after(from);
  const scroll = h('div', { class: 'scroll assets-page' }, page);
  const top = h('button', { class: 'to-top', title: 'Back to top', onclick: () => scroll.scrollTo({ top: 0, behavior: 'smooth' }) }, icon('up'), 'Top');
  scroll.addEventListener('scroll', () => top.classList.toggle('show', scroll.scrollTop > 500), { passive: true });
  main.replaceChildren(topbar(), scroll, top);
  const { items } = await api('/api/library');
  if (location.hash !== '#/assets') return;
  const isFrom = (x, k) => k === 'all' || originKey(x) === k;
  const isType = (x, k) => k === 'all' || x.type === k;
  const draw = () => {
    // One filter for each app things were made in: Image, Video Studio, Studio Pro, Ad Studio, Video Agent, Video Builder, the editor, chats and every AI App used.
    const order = ['image', 'video', 'pro', 'ads', 'agent', 'builder', 'edit', 'chat'];
    const keys = [...new Set(items.map(originKey))].sort((a, b) => (order.includes(a) ? order.indexOf(a) : 99) - (order.includes(b) ? order.indexOf(b) : 99) || a.localeCompare(b));
    const places = [['all', 'Everything', 'folder'], ...keys.map((k) => [k, ...originInfo(k)])];
    if (!places.some(([k]) => k === assetFrom)) assetFrom = 'all';
    tabs.replaceChildren(...[['all', 'All'], ['video', 'Videos'], ['image', 'Images'], ['other', 'Other']].map(([k, l]) => h('button', { class: assetTab === k ? 'on' : '', onclick: () => { assetTab = k; draw(); } }, `${l} ${items.filter((x) => isType(x, k) && isFrom(x, assetFrom)).length}`)));
    toggle.replaceChildren(...[
      items.length > 0 && h('button', { class: 'btn ghost sm' + (ASSET_SEL ? ' on' : ''), id: 'sel-toggle', title: 'Pick several files and download them as one ZIP', onclick: () => { ASSET_SEL = ASSET_SEL ? null : new Set(); draw(); } }, icon('check'), ASSET_SEL ? 'Done' : 'Select'),
      viewToggle(view, (v) => { view = v; store.set('assets-view', v); draw(); })].filter(Boolean));
    from.style.display = places.length > 1 ? '' : 'none';
    from.replaceChildren(...places.map(([k, l, ic]) => h('button', { class: 'opt' + (assetFrom === k ? ' on' : ''), 'data-from': k, onclick: () => { assetFrom = k; draw(); } }, icon(ic), l, h('span', { class: 'n' }, String(items.filter((x) => isType(x, assetTab) && isFrom(x, k)).length)))));
    const list = items.filter((x) => isType(x, assetTab) && isFrom(x, assetFrom));
    assetSelChanged = () => {
      selBar.hidden = !ASSET_SEL; if (!ASSET_SEL) return;
      const n = ASSET_SEL.size; const all = list.length > 0 && list.every((x) => ASSET_SEL.has(x.id));
      selBar.replaceChildren(
        h('b', { id: 'sel-count' }, n ? `${n} selected` : 'Click the files you want'),
        h('button', { class: 'btn ghost sm', id: 'sel-all', onclick: () => { if (all) list.forEach((x) => ASSET_SEL.delete(x.id)); else list.forEach((x) => ASSET_SEL.add(x.id)); draw(); } }, all ? 'Select none' : `Select all ${list.length}`),
        h('div', { class: 'grow' }),
        h('button', { class: 'btn sm', id: 'sel-dl', disabled: !n, onclick: async (e) => { const b = e.currentTarget; b.disabled = true; await downloadFiles([...ASSET_SEL]); b.disabled = false; } }, icon('dl'), n > 1 ? `Download ${n} as one ZIP` : 'Download selected'),
        h('button', { class: 'btn ghost sm', onclick: () => { ASSET_SEL = null; draw(); } }, 'Cancel'),
      );
    };
    assetSelChanged();
    grid.className = view === 'list' ? 'asset-list' : 'masonry';
    grid.replaceChildren(...(list.length ? list.map((x) => (view === 'list' ? assetRow(x) : assetTile(x, true))) : [h('div', { class: 'empty' }, items.length ? 'Nothing matches this filter.' : 'Nothing here yet. Create something in Image, Video or AI Apps.')]));
  };
  draw();
}

// ======================================================================
// Chat
// ======================================================================
function renderChat() {
  const m = chatModel();
  const main = $('#main');
  dropTarget = (files) => addFiles(files);
  const side = h('div', { class: 'chat-list' });
  const scroll = h('div', { class: 'scroll', id: 'scroll' });
  const jump = h('button', { class: 'jump-btm', onclick: () => { S.follow = true; toBottom(); } }, icon('arrowDown'), 'Latest');
  S.follow = true;
  scroll.addEventListener('scroll', () => {
    const gap = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
    S.follow = gap < 80;
    jump.classList.toggle('show', gap > 300);
  }, { passive: true });
  const chatMain = h('div', { class: 'chat-main' }, topbar([h('div', { class: 'title', id: 'conv-title' }, S.conv?.title || '')]), scroll, jump, h('div', { class: 'dock' }, buildChatBar(), h('div', { class: 'bar-hint' }, 'AI can make mistakes. Check important info.')));
  main.replaceChildren(h('div', { class: 'chat nolist' }, side, chatMain));
  renderConvList();
  if (!S.conv) {
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const sugg = {
      chat: [['Summarize a PDF', 'Summarize the attached document in 5 bullet points.'], ['Write code', 'Write a Python script that renames all files in a folder to lowercase.'], ['Video script', 'Write a 15-second product video script with 3 shots and camera directions.'], ['Plan a trip', 'Plan a 3-day trip to Lisbon on a budget.']],
      image: [['Product shot', 'A minimalist product photo of a matte black water bottle on a pastel background, soft studio light'], ['Poster', 'A retro travel poster of the Swiss Alps with bold typography that says "ALPS"']],
      video: [['Cinematic', 'A slow cinematic dolly shot through a neon-lit rainy alley at night'], ['Nature', 'Aerial drone shot over turquoise ocean waves breaking on white sand, golden hour']],
    }[m?.type || 'chat'];
    scroll.append(h('div', { class: 'chat-hero' },
      h('h1', {}, `${greet}, ${(S.user.name || '').split(' ')[0] || 'there'}`),
      h('p', {}, m?.type === 'image' ? 'Describe an image, or attach one to edit it.' : m?.type === 'video' ? 'Describe a scene. Attach an image to animate it.' : 'Ask anything, attach documents, or switch to an image or video model.'),
      h('div', { class: 'suggests' }, sugg.map(([label, text]) => h('button', { class: 'suggest', onclick: () => { const ta = $('#prompt'); ta.value = text; ta.dispatchEvent(new Event('input')); ta.focus(); } }, icon(m?.type === 'image' ? 'image' : m?.type === 'video' ? 'video' : 'sparkle'), label))),
    ));
    if (S.pendingChat) { const ta = $('#prompt'); ta.value = S.pendingChat; S.pendingChat = ''; ta.dispatchEvent(new Event('input')); if (S.autoSend) { S.autoSend = false; setTimeout(() => { if ($('#prompt') === ta && ta.value) submit(); }, 0); } }
  } else {
    const thread = h('div', { class: 'thread', id: 'thread' });
    const job = jobOf(S.conv);
    S.conv.messages.forEach((msg, i) => thread.append(renderMessage(msg, !job && i === S.conv.messages.length - 1)));
    if (job) thread.append(...[job.tmpUser, job.aiEl].filter(Boolean));
    scroll.append(thread);
    requestAnimationFrame(() => toBottom());
    pollPendingVideos();
  }
  Docs.onChatRendered();
  $('#prompt')?.focus();
}

const convHref = (c) => (c.kind === 'builder' ? '#/builder/' + c.id : c.kind === 'pro' ? '#/pro/agent/' + c.id : c.kind === 'ads' ? '#/ads/' + c.id : c.kind === 'app' ? '#/apps/' + c.appId : c.kind === 'code' ? '#/code/' + c.id : c.kind === 'image' || c.kind === 'video' ? `#/${c.kind}/${c.id}` : '#/c/' + c.id);
const convIcon = (c) => (c.kind === 'builder' && c.origin === 'agent' ? 'sparkle' : { code: 'terminal', image: 'image', video: 'video', app: 'apps', builder: 'film', pro: 'wand', ads: 'megaphone' }[c.kind] || 'chat');
function renderRecents() {
  const list = $('#recents'); if (!list) return;
  const q = S.search.trim().toLowerCase();
  const items = S.conversations.filter((c) => !q || c.title.toLowerCase().includes(q));
  const parts = location.hash.replace(/^#/, '').split('/');
  const isCur = (c) => (c.temp ? (c.href === '#/chat' ? parts[1] === 'chat' || !parts[1] : location.hash === c.href) : c.kind === 'app' ? parts[1] === 'apps' && parts[2] === c.appId : c.kind === 'pro' ? parts[1] === 'pro' && parts[3] === c.id : c.kind === 'ads' ? parts[1] === 'ads' && parts[2] === c.id : parts[2] === c.id);
  const groups = [['Starred', (c) => c.starred], ['Today', (c) => age(c) < 1], ['Previous 7 days', (c) => age(c) < 7], ['Previous 30 days', (c) => age(c) < 30], ['Older', () => true]];
  const used = new Set();
  list.replaceChildren();
  for (const [label, test] of groups) {
    const g = items.filter((c) => !used.has(c.id) && test(c));
    if (!g.length) continue;
    g.forEach((c) => used.add(c.id));
    list.append(h('div', { class: 'conv-group' }, label));
    for (const c of g) {
      if (c.temp) { list.append(h('div', { class: 'conv working' + (isCur(c) ? ' active' : '') }, h('a', { href: c.href, title: c.title, onclick: (e) => { closeMobile(); if (c.conv) { e.preventDefault(); S.resume = c.conv; if (location.hash === '#/chat') route(); else location.hash = '#/chat'; } } }, convMark(c), h('span', {}, c.title)))); continue; }
      list.append(h('div', { class: 'conv' + (isCur(c) ? ' active' : '') + (isWorking(c.id) ? ' working' : '') },
        h('a', { href: convHref(c), title: c.title, onclick: closeMobile }, convMark(c), h('span', {}, c.title)),
        UNREAD.has(c.id) && !isCur(c) && h('i', { class: 'conv-dot', title: c.kind === 'app' ? 'New result' : 'New answer' }),
        h('button', { class: 'icon-btn', title: 'More', onclick: (e) => { e.preventDefault(); e.stopPropagation(); openConvMenu(e.currentTarget, c); } }, icon('dots')),
      ));
    }
  }
  if (!items.length) list.append(h('div', { class: 'conv-none' }, q ? 'Nothing matches' : 'Your chats, images, videos, video projects, Studio Pro sessions, ad brands, apps and code will appear here.'));
}
const renderConvList = renderRecents;
const age = (c) => (Date.now() - Date.parse(c.updatedAt)) / 864e5;

function openConvMenu(anchor, c) {
  if (c.kind === 'pro' || c.kind === 'ads') {
    const what = c.kind === 'pro' ? 'Studio Pro session' : 'brand';
    const path = c.kind === 'pro' ? '/api/pro/sessions/' : '/api/pro/brands/';
    return popover(anchor, h('div', { class: 'menu' },
      h('button', { onclick: () => { closePop(); const st = store.get('pro-star', []); c.starred = !c.starred; store.set('pro-star', c.starred ? [...st, c.id] : st.filter((x) => x !== c.id)); renderRecents(); } }, icon('star'), c.starred ? 'Unstar' : 'Star'),
      h('button', { style: { color: 'var(--danger)' }, onclick: async () => {
        closePop();
        if (!confirm(`Delete this ${what}? The images and videos it made stay in Assets.`)) return;
        const was = location.hash === convHref(c);
        try { await api(path + c.id, { method: 'DELETE' }); } catch (err) { return errToast(err); }
        S.conversations = S.conversations.filter((x) => x.id !== c.id);
        if (was) location.hash = c.kind === 'pro' ? '#/pro/agent' : '#/ads';
        renderRecents();
      } }, icon('trash'), 'Delete'),
    ));
  }
  if (c.kind === 'builder') {
    const open = () => location.hash === '#/builder/' + c.id;
    return popover(anchor, h('div', { class: 'menu' },
      h('button', { onclick: () => { closePop(); const st = store.get('vb-star', []); c.starred = !c.starred; store.set('vb-star', c.starred ? [...st, c.id] : st.filter((x) => x !== c.id)); renderRecents(); } }, icon('star'), c.starred ? 'Unstar' : 'Star'),
      h('button', { onclick: async () => { closePop(); const t = prompt('Rename this video project', c.title); if (t && t.trim()) { try { await api('/api/builder/projects/' + c.id, { method: 'PUT', body: { title: t } }); } catch (err) { return errToast(err); } c.title = t.trim(); renderRecents(); if (open()) route(); } } }, icon('edit'), 'Rename'),
      h('button', { style: { color: 'var(--danger)' }, onclick: async () => {
        closePop();
        if (!confirm('Delete this video project? Its scene list is removed. Exported videos stay in Assets.')) return;
        const was = open();
        try { await api('/api/builder/projects/' + c.id, { method: 'DELETE' }); } catch (err) { return errToast(err); }
        S.conversations = S.conversations.filter((x) => x.id !== c.id);
        if (was) location.hash = '#/builder'; else if (location.hash === '#/builder') route();
        renderRecents();
      } }, icon('trash'), 'Delete'),
    ));
  }
  const studio = c.kind === 'image' || c.kind === 'video';
  const isApp = c.kind === 'app';
  const what = isApp ? 'app' : c.kind === 'code' ? 'build' : studio ? c.kind + ' session' : 'chat';
  const isOpen = () => (isApp ? !!openAppBg(c.appId) : c.kind === 'code' ? S.code?.id === c.id : studio ? S.sid[c.kind] === c.id && onStudio(c.kind) : S.conv?.id === c.id);
  const setTitle = () => { const el = c.kind === 'code' ? $('#cx-title') : studio ? $('#st-title') : $('#conv-title'); if (el && isOpen()) el.textContent = c.title; if (S.conv?.id === c.id) S.conv.title = c.title; if (S.code?.id === c.id) S.code.title = c.title; };
  popover(anchor, h('div', { class: 'menu' },
    h('button', { onclick: async () => { closePop(); await api('/api/conversations/' + c.id, { method: 'PATCH', body: { starred: !c.starred } }); c.starred = !c.starred; renderRecents(); } }, icon('star'), c.starred ? 'Unstar' : 'Star'),
    h('button', { onclick: async () => { closePop(); const t = prompt('Rename this ' + what, c.title); if (t && t.trim()) { await api('/api/conversations/' + c.id, { method: 'PATCH', body: { title: t } }); c.title = t.trim(); renderRecents(); setTitle(); } } }, icon('edit'), 'Rename'),
    !isApp && h('button', { onclick: () => { const a = anchor; closePop(); openProjectMenu(a, c.projectId, async (pid) => { try { await api('/api/conversations/' + c.id, { method: 'PATCH', body: { projectId: pid } }); } catch (err) { return errToast(err); } c.projectId = pid || null; if (S.conv?.id === c.id) { S.conv.projectId = c.projectId; $('#composer .proj-chip')?.replaceWith(projectChip('chat')); } if (S.code?.id === c.id) S.code.projectId = c.projectId; toast(pid ? `Added to ${projectById(pid)?.name}` : 'Removed from project'); loadProjects(); }); } }, icon('project'), c.projectId && projectById(c.projectId) ? 'Change project' : 'Add to project'),
    c.kind === 'code' && h('a', { href: `/api/conversations/${c.id}/zip`, download: '', onclick: closePop }, icon('dl'), 'Download .zip'),
    h('button', { style: { color: 'var(--danger)' }, onclick: async () => {
      closePop();
      if (!confirm(isApp ? `Remove ${c.title} from your history? Its list of past runs is cleared. The images and videos it made stay in Assets.` : studio ? `Delete this ${what}? The ${c.kind}s it made stay in Assets.` : c.kind === 'code' ? 'Delete this build and its files?' : 'Delete this chat?')) return;
      const open = isOpen();
      await api('/api/conversations/' + c.id, { method: 'DELETE' });
      S.conversations = S.conversations.filter((x) => x.id !== c.id);
      if (isApp) { UNREAD.delete(c.id); if (open) closeAppModal(); }
      else if (open) {
        if (c.kind === 'code') { S.code = null; location.hash = '#/code'; }
        else if (studio) { S.sid[c.kind] = null; S.gens[c.kind] = []; location.hash = '#/' + c.kind; }
        else { S.conv = null; location.hash = '#/chat'; }
      }
      renderRecents();
    } }, icon('trash'), 'Delete'),
  ));
}
function renderTopbarTitle() { const t = $('#conv-title'); if (t) t.textContent = S.conv?.title || ''; }

function selectChatModel(mid) {
  S.chatModelId = mid; store.set('chat-model', mid);
  const keep = $('#prompt')?.value || '';
  const dock = $('.chat-main .dock');
  if (dock) dock.firstChild.replaceWith(buildChatBar());
  const ta = $('#prompt'); if (ta) { ta.value = keep; ta.dispatchEvent(new Event('input')); ta.focus(); }
}

function openChatPicker(anchor) {
  let tab = chatModel()?.type || 'chat', q = '';
  const list = h('div', { class: 'pick-list' });
  const tabs = h('div', { class: 'seg', style: { margin: '6px 4px 8px', flex: 'none' } });
  const draw = () => {
    tabs.replaceChildren(...['chat', 'image', 'video', 'code'].map((t) => h('button', { class: tab === t ? 'on' : '', onclick: () => { tab = t; draw(); } }, icon(t), kindLabel[t])));
    if (tab === 'code') {
      const cs = codeModels().filter((m) => !q || (m.name + m.provider + m.id + (m.blurb || '')).toLowerCase().includes(q));
      list.replaceChildren(h('div', { class: 'pick-note' }, 'Coding models open in Code, a workspace with project files and a live preview.'), ...cs.map((m) => h('button', { class: 'mopt', onclick: () => { closePop(); S.codeModelId = m.id; store.set('code-model', m.id); S.pendingCode = $('#prompt')?.value || ''; location.hash = '#/code'; } },
        modelLogo(m),
        h('div', { class: 'txt' },
          h('div', { class: 'nm' }, shortName(m), dedicatedCoder(m) && h('span', { class: 'tag new' }, 'Code model'), costTag(m)),
          h('div', { class: 'ds' }, modelBlurb(m)),
          h('div', { class: 'pr' }, costText(m)),
        ),
        icon('arrow', 'chk'),
      )));
      if (!cs.length) list.append(h('div', { class: 'empty' }, 'No models match'));
      return;
    }
    const ms = S.models.filter((m) => m.type === tab && (!q || (m.name + m.provider + m.id + (m.blurb || '')).toLowerCase().includes(q)) && !(m.type === 'video' && !m.video.textToVideo && !m.video.imageToVideo));
    list.replaceChildren(...ms.map((m) => h('button', { class: 'mopt' + (m.id === S.chatModelId ? ' sel' : ''), onclick: () => { closePop(); selectChatModel(m.id); } },
      modelLogo(m),
      h('div', { class: 'txt' },
        h('div', { class: 'nm' }, shortName(m), m.caps.includes('reasoning') && h('span', { class: 'tag dim' }, 'reasoning'), m.vision && h('span', { class: 'tag dim' }, 'vision'), costTag(m)),
        h('div', { class: 'ds', title: m.type === 'video' ? modelPitch(m) : '' }, modelBlurb(m)),
        h('div', { class: 'pr' }, costText(m)),
      ),
      m.id === S.chatModelId && icon('check', 'chk'),
    )));
    if (!ms.length) list.append(h('div', { class: 'empty' }, 'No models match'));
  };
  const input = h('input', { class: 'field-input', placeholder: 'Search models', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  popover(anchor, h('div', { class: 'models picker', style: { width: '380px' } }, h('div', { style: { padding: '4px', flex: 'none' } }, input), tabs, list), 'above');
  draw(); input.focus();
}

function buildChatBar() {
  const m = chatModel();
  const ta = h('textarea', { id: 'prompt', rows: 1, placeholder: m?.type === 'image' ? 'Describe the image you want' : m?.type === 'video' ? 'Describe the video scene' : `Message ${shortName(m) || 'Scenly'}` });
  const send = h('button', { class: 'send', id: 'send', title: 'Send', disabled: true, onclick: () => (jobOf(S.conv) ? stopStream(S.conv, typedNext()) : submit()) }, icon('up'));
  const est = h('span', { id: 'est', style: { color: 'var(--faint)', fontSize: '12px' } });
  const opts = [];
  if (m?.type === 'video') {
    const st = S.studio.video; const keep = st.modelId; st.modelId = m.id; normaliseSettings('video'); st.modelId = keep;
    opts.push(h('span', { class: 'chipbtn', style: { cursor: 'default' } }, icon('ratio'), `${st.ratio} · ${st.resolution} · ${st.duration > 0 ? st.duration + 's' : 'auto'}`));
  }
  const bar = h('div', { class: 'bar', id: 'composer' },
    h('div', { class: 'bar-top' }, h('div', { class: 'material', id: 'chips' }), ta),
    h('div', { class: 'bar-row' },
      h('button', { class: 'icon-btn', title: m?.type === 'chat' ? 'Attach files (PDF, Word, Excel, PowerPoint, code, images)' : 'Attach a reference image', onclick: () => pickFiles(m?.type === 'chat' ? '' : 'image/*', true, addFiles) }, icon('clip')),
      h('button', { class: 'chipbtn', onclick: (e) => openChatPicker(e.currentTarget) }, modelLogo(m, 'logo-sm'), h('span', { class: 'nm' }, shortName(m)), icon('down')),
      opts,
      projectChip('chat'),
      m?.type === 'chat' && Docs.composerChips(),
      h('div', { class: 'grow' }), est, micButton(ta), send,
    ),
  );
  ta.addEventListener('input', () => { autoGrow(ta); updateSend(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!jobOf(S.conv)) submit(); else if (typedNext()) stopStream(S.conv, true); } });
  ta.addEventListener('paste', (e) => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); addFiles(files); } });
  ta.dataset.ph = ta.placeholder;
  setTimeout(() => { renderChips(); updateEst(); updateSend(); if (m?.type === 'chat') Docs.refreshComposer(); }, 0);
  return bar;
}
function updateEst() {
  const el = $('#est'); const m = chatModel(); if (!el || !m) return;
  if (m.type === 'video') { const st = S.studio.video; const per = m.price.creditsPerSecond[st.resolution] || Object.values(m.price.creditsPerSecond)[0] || 0; el.textContent = `≈${fmtCredits(per * (st.duration > 0 ? st.duration : 10))} credits`; }
  else if (m.type === 'image') el.textContent = `≈${fmtCredits(m.price.creditsPerImage)} credits`;
  else el.textContent = '';
}
function updateSend() {
  const send = $('#send'); if (!send) return;
  if (jobOf(S.conv)) { send.disabled = false; send.classList.add('stop'); send.replaceChildren(icon('stop')); send.title = typedNext() ? 'Stop and send your new message' : 'Stop'; return; }
  send.classList.remove('stop'); send.replaceChildren(icon('up')); send.title = 'Send';
  const busy = S.attachments.some((a) => a.loading);
  send.disabled = busy || (!($('#prompt')?.value.trim()) && !(chatModel()?.type === 'chat' && S.attachments.length));
}

async function addFiles(files) {
  const m = chatModel();
  if (m.type !== 'chat') files = files.filter((f) => f.type.startsWith('image/'));
  if (!files.length) return toast(m.type === 'chat' ? 'No files to add' : 'Image and video models accept image references only', 'error');
  const pending = files.map((f) => ({ tmp: Math.random().toString(36).slice(2), name: f.name, kind: f.type.startsWith('image/') ? 'image' : 'document', preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null, loading: true }));
  S.attachments.push(...pending); renderChips(); updateSend();
  try {
    const got = await uploadFiles(files);
    pending.forEach((p) => { const f = got.find((x) => x.name === p.name && !S.attachments.some((a) => a.id === x.id)); if (f) Object.assign(p, f, { loading: false }); else p.failed = true; });
  } catch (e) { errToast(e); pending.forEach((p) => (p.failed = true)); }
  S.attachments = S.attachments.filter((a) => !a.failed);
  renderChips(); updateSend();
  if (m.type === 'chat' && !m.vision && S.attachments.some((a) => a.kind === 'image')) toast(`${shortName(m)} can't see images. Pick a model tagged "vision" to read them.`);
}
function fileChip(a) {
  const ext = (a.name.split('.').pop() || '').slice(0, 4);
  return h('div', { class: 'fchip' },
    a.kind === 'image' ? h('img', { src: a.preview || `/api/files/${a.id}/raw`, alt: '' }) : h('div', { class: 'ft' }, ext),
    h('div', { class: 'nm' }, h('div', {}, a.name), h('small', {}, a.kind === 'image' ? 'Image' : a.pages ? `${a.pages} ${/\.pptx$/i.test(a.name) ? 'slide' : 'page'}${a.pages === 1 ? '' : 's'}` : a.size ? `${Math.max(1, Math.round(a.size / 1024))} KB` : 'Document')),
  );
}
function renderChips() {
  const c = $('#chips'); if (!c) return;
  c.replaceChildren(...S.attachments.map((a) => h('div', { class: 'mat' + (a.kind === 'image' ? '' : ' doc'), title: a.name },
    a.kind === 'image' ? h('img', { src: a.preview || `/api/files/${a.id}/raw`, alt: '' }) : (a.name.split('.').pop() || 'file').slice(0, 4),
    a.loading && h('span', { class: 'spin', style: { position: 'absolute', inset: 0, margin: 'auto' } }),
    h('span', { class: 'lbl' }, a.name),
    h('button', { class: 'x', title: 'Remove', onclick: () => { S.attachments = S.attachments.filter((x) => x !== a); renderChips(); updateSend(); } }, icon('x')),
  )));
  c.style.display = S.attachments.length ? '' : 'none';
}

// ---------- messages ----------
function renderMessage(msg, isLast) {
  if (msg.role === 'user') {
    return h('div', { class: 'msg user', 'data-id': msg.id },
      msg.files?.length > 0 && h('div', { class: 'chips' }, msg.files.map((f) => fileChip(f))),
      msg.content && h('div', { class: 'bubble' }, msg.content),
    );
  }
  const m = byId(msg.model);
  const body = h('div', { class: 'ai-body' });
  if (msg.reasoning) body.append(thinkingBlock(msg.reasoning, false));
  if (msg.mode === 'image' || msg.mode === 'video') {
    if (msg.media?.length) body.append(h('div', { class: 'gen-media' + (msg.mode === 'video' ? ' video' : '') }, msg.media.map((x) => h('div', { class: 'tile' + (x.type === 'video' ? ' v' : '') },
      x.type === 'video' ? h('video', { src: x.url, controls: true, playsinline: true, preload: 'metadata' }) : h('img', { src: x.url, alt: x.prompt || '', onclick: () => openLightbox(x) }),
      h('div', { class: 'over' }, x.type !== 'video' && h('button', { class: 'icon-btn sm', title: 'Animate', onclick: () => useAsReference(x, 'video') }, icon('play')), h('a', { class: 'icon-btn sm', href: x.url, download: '', title: 'Download' }, icon('dl')))))));
    if (msg.status === 'pending') body.append(h('div', { class: 'gen-card' }, h('div', { class: 'shimmer' }), h('div', {}, h('b', {}, h('span', { class: 'spin' }), ' Generating video…'), h('small', {}, `${msg.params?.resolution || ''} · ${msg.params?.ratio || ''} · ${msg.params?.duration > 0 ? msg.params.duration + 's' : 'auto'}. Usually 1 to 5 minutes; you can leave this page.`), msg.progress && h('small', {}, 'Status: ' + msg.progress))));
  }
  const embed = msg.mode === 'chat' && !askedForCode(msg);
  if (msg.content) body.append(renderMd(msg.content, { embed }));
  const page = msg.mode === 'chat' && !body.querySelector('.pv-embed') && extractHtml(msg.content);
  if (page) body.append(previewCard(page));
  if (msg.mode === 'chat' && msg.fileKind && msg.content && !msg.error) body.append(fileCard(msg));
  if (msg.doc) body.append(...[Docs.docCard(msg)].flat());
  if (msg.error) body.append(errBox({ message: msg.error }, isLast && msg.mode === 'chat' ? () => submit({ regenerate: true }) : null));
  if (msg.note) body.append(h('div', { class: 'gen-note' }, msg.note));
  if (msg.stopped) body.append(h('div', { style: { color: 'var(--faint)', fontSize: '13px', marginTop: '6px' } }, 'Stopped'));
  const copyBtn = msg.content && h('button', { class: 'icon-btn sm', title: 'Copy', onclick: (e) => copyRich(msg.content, e.currentTarget) }, icon('copy'));
  const regen = isLast && msg.mode === 'chat' && h('button', { class: 'icon-btn sm', title: 'Regenerate', onclick: () => submit({ regenerate: true }) }, icon('retry'));
  const dlBtn = msg.mode === 'chat' && msg.content && !msg.doc && h('button', { class: 'icon-btn sm', title: 'Download as Word, PDF or other formats', onclick: (e) => openDownloadMenu(e.currentTarget, msg.content) }, icon('dl'));
  return h('div', { class: 'msg ai', 'data-id': msg.id },
    h('div', { class: 'ai-head' }, m ? modelLogo(m, 'ai-logo') : h('img', { class: 'ai-mark', src: '/logo.svg', alt: '' }), h('div', { class: 'who' }, m ? shortName(m) : msg.model, msg.mode !== 'chat' && h('small', {}, kindLabel[msg.mode]))),
    body,
    h('div', { class: 'msg-actions' }, copyBtn, dlBtn, regen, h('span', { class: 'spacer' }), msg.credits != null && h('span', { title: 'Credits used' }, `${fmtCredits(msg.credits)} credits`)),
  );
}
// True when the person's question asked for the code itself, so a web page in the answer stays as code.
const CODE_ASK = /\b(code|coding|html|css|javascript|js|source|markup|snippet|script|syntax)\b/i;
function askedForCode(msg) {
  const list = S.conv?.messages || [];
  let i = list.findIndex((x) => x.id === msg.id); if (i < 0) i = list.length;
  for (let j = i - 1; j >= 0; j--) if (list[j].role === 'user') return CODE_ASK.test(list[j].content || '');
  return false;
}
function thinkingBlock(text, open) {
  return h('details', { class: 'thinking', open }, h('summary', {}, icon('brain'), 'Thinking'), h('div', { class: 'body' }, text));
}

function appendToThread(node) {
  let thread = $('#thread');
  if (!thread) {
    const sc = $('#scroll'); sc.replaceChildren(h('div', { class: 'thread', id: 'thread' })); thread = $('#thread');
  }
  thread.append(node);
  S.follow = true; toBottom();
}
// Jump to the newest message without smooth-scroll animation, so a user scrolling up is never fought.
function toBottom() { const sc = $('#scroll'); if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'instant' }); }

function clearComposer() {
  const ta = $('#prompt'); if (ta) { ta.value = ''; ta.style.height = 'auto'; }
  S.attachments = []; renderChips(); updateSend();
}

async function submit({ regenerate = false } = {}) {
  const m = chatModel();
  const ta = $('#prompt');
  const text = ta?.value.trim() || '';
  if (jobOf(S.conv)) return;
  if (!regenerate && !text && !(m.type === 'chat' && S.attachments.length)) return;
  if (S.attachments.some((a) => a.loading)) return toast('Wait for uploads to finish');
  const fileIds = regenerate ? [] : S.attachments.map((a) => a.id);
  if (m.type === 'chat') return streamChat({ text, fileIds, regenerate });
  const atts = S.attachments.slice();
  clearComposer();
  const placeholder = h('div', { class: 'msg ai' }, h('div', { class: 'ai-head' }, modelLogo(m, 'ai-logo'), h('div', { class: 'who' }, shortName(m))), h('div', { class: 'gen-card' }, h('div', { class: 'shimmer' }), h('div', {}, h('b', {}, h('span', { class: 'spin' }), m.type === 'image' ? ' Creating image…' : ' Starting video…'), h('small', {}, text.slice(0, 120)))));
  const tmpUser = renderMessage({ id: 'tmp', role: 'user', content: text, files: atts });
  if (!S.conv) { S.conv = { id: null, title: text, messages: [] }; $('#scroll').replaceChildren(); }
  const conv = S.conv;
  appendToThread(tmpUser); appendToThread(placeholder);
  const job = { kind: m.type, conv, tmpUser, aiEl: placeholder };
  const tmpC = !conv.id ? tempConv('chat', text, '#/chat') : null;
  if (tmpC) tmpC.conv = conv;
  JOBS.add(job); updateSend(); renderRecents();
  const shown = () => S.conv === conv && placeholder.isConnected;
  let unread = false;
  try {
    const body = { model: m.id, prompt: text, fileIds, conversationId: conv.id };
    if (m.type === 'image') { body.size = m.image.sizes.includes(S.studio.image.size) ? S.studio.image.size : m.image.sizes[0]; body.quality = S.studio.image.quality; }
    else { const st = S.studio.video; Object.assign(body, { resolution: st.resolution, ratio: st.ratio, duration: st.duration }); }
    const r = await api(m.type === 'image' ? '/api/image' : '/api/video', { method: 'POST', body });
    dropTemp(tmpC);
    const vis = shown();
    Object.assign(conv, r.conversation);
    conv.messages.push(r.userMessage, r.message);
    job.tmpUser = null;
    noteConv(r.conversation);
    setCredits(r.credits);
    if (vis) {
      if (!location.hash.endsWith(conv.id)) history.replaceState(null, '', '#/c/' + conv.id);
      renderTopbarTitle();
      tmpUser.replaceWith(renderMessage(r.userMessage));
      placeholder.replaceWith(renderMessage(r.message, true));
      S.follow = true; toBottom();
      if (m.type === 'video') pollPendingVideos();
    } else unread = true;
  } catch (e) {
    if (shown()) {
      placeholder.replaceWith(h('div', { class: 'msg ai' }, errBox(e)));
      tmpUser.remove();
      if (!conv.id) S.conv = null;
      const p = $('#prompt'); if (p && !p.value && !regenerate) { p.value = text; p.dispatchEvent(new Event('input')); }
    } else toast(`${m.type === 'image' ? 'The image' : 'The video'} in "${(conv.title || 'your chat').slice(0, 40)}" could not be made. ${cleanErr(e.message ?? e)}`, 'error');
  } finally { dropTemp(tmpC); endJob(job, { unread }); }
}

async function streamChat({ text, fileIds, regenerate }) {
  const m = chatModel();
  const atts = S.attachments.slice();
  if (!regenerate) clearComposer();
  if (regenerate) { const last = $('#thread .msg.ai:last-child'); if (last) last.remove(); while (S.conv.messages.at(-1)?.role === 'assistant') S.conv.messages.pop(); }
  const isNew = !S.conv;
  if (isNew) { S.conv = { id: null, title: text, messages: [] }; $('#scroll').replaceChildren(); }
  const conv = S.conv; // this answer belongs to this conversation, whatever is on screen later
  const tmpUser = !regenerate && renderMessage({ id: 'tmp', role: 'user', content: text, files: atts });
  if (tmpUser) appendToThread(tmpUser);
  const body = h('div', { class: 'ai-body' });
  const contentWrap = h('div', { class: 'cursor' }, h('div', { class: 'md' }, h('p', {}, '')));
  body.append(contentWrap);
  const aiEl = h('div', { class: 'msg ai' }, h('div', { class: 'ai-head' }, modelLogo(m, 'ai-logo'), h('div', { class: 'who' }, shortName(m))), body);
  appendToThread(aiEl);

  const ctrl = new AbortController();
  const job = { kind: 'chat', conv, ctrl, tmpUser: tmpUser || null, aiEl };
  JOBS.add(job); updateSend(); renderRecents();
  // True while this conversation is the one on screen.
  const shown = () => S.conv === conv && aiEl.isConnected;
  let content = '', reasoning = '', thinkEl = null, raf = 0, unread = false;
  const paint = () => {
    raf = 0;
    if (!JOBS.has(job)) return;
    if (reasoning && !thinkEl) { thinkEl = thinkingBlock('', true); body.prepend(thinkEl); }
    if (thinkEl) { const b = thinkEl.querySelector('.body'); b.textContent = reasoning; b.scrollTop = b.scrollHeight; if (content) thinkEl.open = false; }
    if (content) contentWrap.replaceChildren(renderMd(content, { embed: !CODE_ASK.test(text || ''), streaming: true }));
    if (shown() && S.follow) toBottom();
  };
  // Hidden browser tabs pause animation frames, so a timer keeps the text moving there too.
  const schedule = () => { if (!raf) raf = document.hidden ? setTimeout(paint, 250) : requestAnimationFrame(paint); };
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.id, message: text, fileIds, conversationId: conv.id, regenerate, projectId: conv.id ? undefined : S.projectId || undefined, doc: regenerate ? undefined : Docs.requestTarget() }), signal: ctrl.signal });
    Docs.sent();
    if (!res.ok) { const j = await res.json().catch(() => ({})); const e = new Error(j.error || 'Request failed'); e.code = j.code; throw e; }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1];
        const data = JSON.parse((block.match(/^data: (.*)$/m) || [])[1] || '{}');
        if (ev === 'start') {
          const vis = shown();
          if (tmpUser) tmpUser.remove();
          job.tmpUser = null;
          if (isNew) {
            Object.assign(conv, data.conversation);
            if (vis) { history.replaceState(null, '', '#/c/' + conv.id); renderTopbarTitle(); }
          }
          if (data.userMessage) { conv.messages.push(data.userMessage); if (vis) aiEl.before(renderMessage(data.userMessage)); }
          noteConv(data.conversation);
        } else if (ev === 'status') {
          Docs.buildStatus(contentWrap, data.text);
          if (shown() && S.follow) toBottom();
        } else if (ev === 'delta') {
          if (data.content) content += data.content;
          if (data.reasoning) reasoning += data.reasoning;
          schedule();
        } else if (ev === 'done') {
          const vis = shown();
          conv.messages.push(data.message);
          setCredits(data.credits);
          JOBS.delete(job);
          if (data.conversation) noteConv(data.conversation);
          if (vis) {
            const done = renderMessage(data.message, true);
            aiEl.replaceWith(done);
            const page = !done.querySelector('.pv-embed') && extractHtml(data.message.content);
            if (page && !matchMedia('(max-width: 1000px)').matches) openCanvas(page);
            Docs.afterDocReply(data);
            if (S.follow) toBottom();
          } else unread = true;
        } else if (ev === 'error') {
          const e = new Error(data.error); e.removeUser = data.removeUserMessage; e.code = data.code; throw e;
        }
      }
    }
  } catch (e) {
    const vis = shown();
    if (e.name === 'AbortError') {
      // Stopped by hand: the server keeps what was written so far.
      // Anything typed in the box meanwhile is kept, and sent next when Stop was pressed to send it.
      setTimeout(async () => {
        if (!conv.id) return;
        try {
          const fresh = (await api('/api/conversations/' + conv.id)).conversation;
          if (S.conv === conv && $('#scroll') && location.hash === '#/c/' + conv.id && !jobOf(conv)) {
            const typed = $('#prompt')?.value || '';
            S.conv = fresh; renderChat();
            const ta = $('#prompt');
            if (ta && typed) { ta.value = typed; ta.dispatchEvent(new Event('input')); ta.focus(); ta.setSelectionRange(typed.length, typed.length); }
            if (job.sendNext && ta?.value.trim()) submit();
          }
          S.user = (await api('/api/me')).user; setCredits(S.user.credits);
        } catch { /* the chat is reloaded the next time it is opened */ }
      }, 600);
    } else if (vis) {
      const again = () => { const ta = $('#prompt'); if (ta && !ta.value && text) { ta.value = text; ta.dispatchEvent(new Event('input')); } aiEl.remove(); if (S.conv?.messages.at(-1)?.role === 'user' && !e.removeUser) submit({ regenerate: true }); else submit(); };
      aiEl.querySelector('.ai-body').replaceChildren(errBox(e, regenerate || text ? again : null));
      if (tmpUser?.isConnected || e.removeUser) { const ta = $('#prompt'); if (ta && !ta.value) { ta.value = text; ta.dispatchEvent(new Event('input')); } }
      if (e.removeUser) { aiEl.previousElementSibling?.classList.contains('user') && aiEl.previousElementSibling.remove(); if (conv.messages.at(-1)?.role === 'user') conv.messages.pop(); }
    } else {
      if (e.removeUser && conv.messages.at(-1)?.role === 'user') conv.messages.pop();
      toast(`The answer in "${(conv.title || 'your chat').slice(0, 40)}" failed. ${cleanErr(e.message ?? e)}`, 'error');
    }
  } finally {
    endJob(job, { unread });
  }
}
// Stop the answer being written. With sendAfter, the message typed meanwhile is sent once it has stopped.
function stopStream(conv = S.conv, sendAfter = false) { const job = jobOf(conv); if (!job) return; if (sendAfter) job.sendNext = true; job.ctrl?.abort(); }
// In chat with a text model, a message typed while an answer is being written goes next.
const typedNext = () => chatModel()?.type === 'chat' && !!$('#prompt')?.value.trim() && !S.attachments.some((a) => a.loading);

function pollPendingVideos() {
  clearTimeout(pollTimer);
  const pending = S.conv?.messages?.filter((x) => x.mode === 'video' && x.status === 'pending') || [];
  if (!pending.length) return;
  pollTimer = setTimeout(async () => {
    for (const p of pending) {
      try {
        const r = await api('/api/video/' + p.taskId);
        if (r.message && S.conv) {
          const idx = S.conv.messages.findIndex((x) => x.id === p.id);
          if (idx >= 0) { S.conv.messages[idx] = r.message; const el = $(`#thread [data-id="${p.id}"]`); if (el) el.replaceWith(renderMessage(r.message, idx === S.conv.messages.length - 1)); }
          setCredits(r.credits);
          if (r.message.status === 'done') toast('Your video is ready');
        }
      } catch {}
    }
    if (location.hash.startsWith('#/c/')) pollPendingVideos();
  }, 8000);
}

// ======================================================================
// Billing & admin
// ======================================================================
async function renderBilling() {
  const main = $('#main');
  dropTarget = null;
  const page = h('div', { class: 'page' }, h('div', { class: 'empty' }, h('span', { class: 'spin' })));
  main.replaceChildren(topbar(), h('div', { class: 'scroll' }, page));
  const back = location.hash.split('/')[2];
  if (back) history.replaceState(null, '', '#/billing');
  let b;
  try { b = await api('/api/billing'); } catch (e) { page.replaceChildren(errBox(e, renderBilling)); return; }
  S.user = b.user; setCredits(b.user.credits);
  const subs = !!b.subscriptions, bv = b.user.billing || {};
  const pays = subs ? (await api('/api/billing/payments').catch(() => ({ payments: [] }))).payments : [];
  const money = (n) => '$' + Number(n || 0).toFixed(2);
  if (back === 'thanks') toast(b.user.plan !== 'free' ? `You are on ${(b.plans.find((p) => p.id === b.user.plan) || {}).name}. Thank you!` : 'Payment received. Your credits will show here in a moment.');
  if (back === 'check') toast('We could not confirm the payment yet. If you paid, it will show here within a few minutes.', 'error');
  const refresh = async () => { S.user = (await api('/api/me')).user; renderShell(); renderBilling(); };
  const buy = async (offer, btn) => {
    btn.disabled = true;
    try {
      const r = await api('/api/billing/checkout', { method: 'POST', body: { offerId: offer.id } });
      if (r.url) { location.href = r.url; return; }
      toast(offer.kind === 'plan' && subs ? `You are on ${offer.name}. ${offer.credits.toLocaleString()} credits added${r.mode === 'demo' ? ' (demo mode, no charge)' : ''}.` : `Added ${offer.credits.toLocaleString()} credits${r.mode === 'demo' ? ' (demo mode, no charge)' : ''}`);
      await refresh();
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
  };
  const planName = (pid) => (b.plans.find((p) => p.id === pid) || b.plans[0]).name;
  const curPlan = b.plans.find((p) => p.id === b.user.plan) || b.plans[0];
  const onPaid = subs && b.user.plan !== 'free' && bv.hasSub !== false && ['active', 'past_due', 'trialing'].includes(bv.status);
  // A paid plan with no monthly subscription behind it (bought once before monthly plans, or set by an admin).
  // There is nothing to switch or cancel, so every plan button starts a monthly plan instead.
  const oneTime = subs && b.user.plan !== 'free' && bv.hasSub === false;
  const dateTxt = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const post = async (url, body, btn) => {
    if (btn) btn.disabled = true;
    try { const r = await api(url, { method: 'POST', body }); if (r.url) { location.href = r.url; return r; } await refresh(); return r; }
    catch (e) { toast(e.message, 'error'); if (btn) btn.disabled = false; }
  };
  const switchTo = async (p, btn) => {
    btn.disabled = true;
    let q;
    try { q = await api('/api/billing/preview', { method: 'POST', body: { planId: p.id } }); }
    catch (e) { toast(e.message, 'error'); btn.disabled = false; return; }
    btn.disabled = false;
    planChangeDialog(q, async (go) => {
      const r = await post('/api/billing/switch', { planId: p.id, prorationDate: q.prorationDate }, go);
      if (r) { $('.plan-dlg')?.remove(); toast(q.upgrade ? `Upgraded to ${p.name}. ${q.dueNow > 0 ? `${money(q.dueNow)} paid, ` : ''}${q.extraCredits.toLocaleString()} credits added.` : `Moved to ${p.name}. Your new price starts on ${dateTxt(q.renewsAt)}.`); }
    });
  };
  const planPanel = () => {
    if (!subs) return null;
    let line, tone = '';
    if (onPaid && bv.status === 'past_due') { line = 'Your last payment did not go through. Update your card to keep your plan.'; tone = ' warn'; }
    else if (onPaid && bv.endsAt) line = `Your plan ends on ${dateTxt(bv.endsAt)}. You keep your credits after that.`;
    else if (onPaid && bv.renewsAt) line = `Renews on ${dateTxt(bv.renewsAt)} with ${curPlan.credits.toLocaleString()} new credits.`;
    else if (bv.trial) line = b.user.credits > 0.005 / (S.config.creditUsd || 0.001) ? `You are on the free trial with ${fmtCredits(b.user.credits)} credits left. Upgrade any time for monthly credits.` : 'You have used your free trial credits. Choose a plan or a credit pack to keep going.';
    else if (oneTime) line = `You have ${curPlan.name} from a one-time purchase, so it does not renew by itself. Start a monthly plan below to get new credits every month.`;
    else line = 'You are on the free plan. Choose a plan or a credit pack to get more credits.';
    const extra = [];
    if (onPaid && bv.nextPayment && bv.status !== 'past_due') extra.push(`Next payment ${money(bv.nextPayment.amountUsd)} on ${dateTxt(bv.nextPayment.at)}`);
    if (bv.card) extra.push(`${bv.card.brand ? bv.card.brand[0].toUpperCase() + bv.card.brand.slice(1) : 'Card'} ending ${bv.card.last4}, expires ${String(bv.card.expMonth).padStart(2, '0')}/${String(bv.card.expYear).slice(-2)}`);
    const btns = [];
    if (bv.portal) { const pb = h('button', { class: 'btn' + (tone ? ' primary' : '') }, icon('coin'), bv.status === 'past_due' ? 'Update card' : 'Manage billing'); pb.onclick = () => post('/api/billing/portal', {}, pb); btns.push(pb); }
    if (onPaid && bv.status !== 'past_due') {
      const cb = h('button', { class: 'btn ghost' }, bv.endsAt ? 'Keep my plan' : 'Cancel plan');
      cb.onclick = async () => {
        if (!bv.endsAt && !confirm(`Cancel ${curPlan.name}?\n\nYour plan stays until ${dateTxt(bv.renewsAt || new Date())} and your credits stay after that. You will not be charged again.`)) return;
        const r = await post('/api/billing/cancel', { cancel: !bv.endsAt }, cb);
        if (r) toast(bv.endsAt ? 'Your plan will renew as normal.' : 'Your plan is cancelled. It stays until the end of this month.');
      };
      btns.push(cb);
    }
    return h('div', { class: 'plan-panel' + tone, 'data-plan-panel': '' },
      h('div', { class: 'grow' }, h('small', {}, 'Your plan'), h('div', { class: 'pp-name' }, bv.trial ? 'Free trial' : curPlan.name, onPaid && bv.status === 'past_due' ? h('span', { class: 'pp-tag warn' }, 'Payment failed') : onPaid && bv.endsAt ? h('span', { class: 'pp-tag' }, 'Cancelled') : onPaid ? h('span', { class: 'pp-tag ok' }, 'Active') : null), h('p', {}, line), extra.length ? h('p', { class: 'pp-extra' }, extra.join(' · ')) : null),
      btns.length ? h('div', { class: 'pp-btns' }, btns) : null);
  };
  const planCard = (p) => {
    const cur = S.user.plan === p.id;
    let btn;
    if (!subs) {
      btn = h('button', { class: 'btn ' + (p.popular ? 'grad' : 'primary'), disabled: p.priceUsd === 0 || null }, p.priceUsd === 0 ? (cur ? 'Current plan' : 'Included') : cur ? 'Renew / add credits' : `Get ${p.name}`);
      btn.onclick = () => buy(p, btn);
    } else if (p.priceUsd === 0) {
      btn = h('button', { class: 'btn', disabled: true }, cur && bv.trial ? 'Your free trial' : cur ? 'Current plan' : 'Included');
    } else if (cur && onPaid) {
      btn = h('button', { class: 'btn', disabled: true }, 'Current plan');
    } else if (onPaid) {
      const up = p.priceUsd > curPlan.priceUsd;
      btn = h('button', { class: 'btn ' + (up ? (p.popular ? 'grad' : 'primary') : 'ghost') }, up ? `Upgrade to ${p.name}` : `Switch to ${p.name}`);
      btn.onclick = () => switchTo(p, btn);
    } else {
      btn = h('button', { class: 'btn ' + (p.popular ? 'grad' : 'primary') }, oneTime ? (cur ? `Renew ${p.name} monthly` : `Start ${p.name} monthly`) : `Upgrade to ${p.name}`);
      btn.onclick = () => buy(p, btn);
    }
    btn.dataset.plan = p.id;
    return h('div', { class: 'card' + (p.popular ? ' pop' : '') + (subs && cur ? ' cur' : '') },
      p.popular && h('span', { class: 'badge' }, 'Most popular'),
      h('h3', {}, subs && p.priceUsd === 0 && bv.trial ? 'Free trial' : p.name), h('div', { class: 'tl' }, subs && p.priceUsd === 0 ? (bv.trial ? 'No card needed' : 'Where you start') : p.tagline),
      h('div', { class: 'price' }, `$${p.priceUsd}`, h('small', {}, p.period === 'month' ? ' / month' : '')),
      h('ul', {}, p.perks.map((x) => h('li', {}, icon('check'), x))),
      examplesList(p.credits),
      btn,
    );
  };
  const packCard = (p) => {
    const btn = h('button', { class: 'btn', 'data-pack': p.id }, `Buy for $${p.priceUsd}`);
    btn.onclick = () => buy(p, btn);
    return h('div', { class: 'card' }, h('h3', {}, p.name), h('div', { class: 'tl' }, p.note || 'One-time top-up, never expires'), h('div', { class: 'price' }, `$${p.priceUsd}`), examplesList(p.credits), btn);
  };
  const order = { video: 0, image: 1, chat: 2 };
  const rows = [...S.models].sort((a, c) => order[a.type] - order[c.type]);
  page.replaceChildren(...[
    h('h1', {}, 'Plans & credits'),
    h('p', { class: 'sub' }, 'One balance for every model and app. Credits never expire. $1 buys 1,000 credits, and every model is priced at its official rate or less. The numbers on each card are rough guides; the exact cost is shown before you generate.'),
    b.paymentMode === 'demo' && h('div', { class: 'notice' }, subs ? 'Payments are in demo mode: plans start, switch and renew without a card, and packs add credits at once. Add a Stripe key in .env to take real payments.' : 'Payments are in demo mode: purchases add credits instantly without charging a card. Add a Stripe key in .env to take real payments.'),
    planPanel(),
    subs && (bv.openInvoices || []).length ? h('div', { class: 'notice due-notice' }, `A payment of ${money(bv.openInvoices[0].amountUsd)} is waiting. `, h('a', { href: bv.openInvoices[0].url, target: '_blank', rel: 'noopener' }, 'Pay now')) : null,
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('small', {}, 'Balance'), h('div', {}, fmtCredits(b.user.credits) + ' credits')),
      h('div', { class: 'stat' }, h('small', {}, 'Used in last 30 days'), h('div', {}, fmtCredits(b.spent30) + ' credits')),
      h('div', { class: 'stat' }, h('small', {}, 'Current plan'), h('div', {}, subs && bv.trial ? 'Free trial' : planName(b.user.plan))),
    ),
    h('h2', {}, subs && onPaid ? 'Change plan' : 'Plans'),
    subs && h('p', { class: 'sub' }, 'Monthly plans add their credits every month. Unused credits roll over. Cancel any time.'),
    h('div', { class: 'cards' }, b.plans.map(planCard)),
    h('h2', { id: 'packs' }, 'Credit packs'),
    subs && h('p', { class: 'sub' }, 'One-time top-ups for any account. Pack credits never expire.'),
    h('div', { class: 'cards' }, b.packs.map(packCard)),
    subs ? h('h2', { id: 'payments' }, 'Payment history') : null,
    subs ? (pays.length ? h('div', { class: 'table-wrap' }, h('table', { class: 't pay-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Description'), h('th', { style: { textAlign: 'right' } }, 'Amount'), h('th', {}, 'Documents'))),
      h('tbody', {}, pays.map((x) => h('tr', { 'data-payment': x.id },
        h('td', { style: { whiteSpace: 'nowrap', color: 'var(--muted)' } }, new Date(x.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })),
        h('td', {}, x.desc, x.credits ? h('div', { class: 'pay-sub' }, `+${Number(x.credits).toLocaleString()} credits`, x.number ? ` · ${x.number}` : '', x.demo ? ' · demo, no charge' : '') : null),
        h('td', { class: 'num' }, money(x.amountUsd)),
        h('td', {}, h('div', { class: 'pay-docs' },
          x.invoicePdf ? h('a', { href: x.invoicePdf, target: '_blank', rel: 'noopener', 'data-doc': 'pdf' }, icon('dl'), 'Invoice PDF') : null,
          x.invoiceUrl ? h('a', { href: x.invoiceUrl, target: '_blank', rel: 'noopener', 'data-doc': 'view' }, 'View') : null,
          h('a', { href: '/api/billing/receipt/' + x.id, target: '_blank', rel: 'noopener', 'data-doc': 'receipt' }, 'Receipt'))))))),
    ) : h('div', { class: 'empty' }, 'No payments yet.')) : null,
    subs && bv.portal ? h('p', { class: 'pay-foot' }, 'Need to change your card, billing address or tax details? ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); post('/api/billing/portal', {}); } }, 'Open Manage billing'), '.') : null,
    h('h2', {}, 'What things cost'),
    h('div', { class: 'table-wrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Model'), h('th', {}, 'Type'), h('th', {}, 'Provider'), h('th', { style: { textAlign: 'right' } }, 'Credits'))),
      h('tbody', {}, rows.map((m) => h('tr', {}, h('td', {}, h('span', { class: 'mname' }, modelLogo(m, 'logo-sm'), shortName(m))), h('td', {}, kindLabel[m.type]), h('td', { style: { color: 'var(--muted)' } }, m.provider), h('td', { class: 'num' }, costText(m))))),
    )),
    h('p', { style: { color: 'var(--faint)', fontSize: '12.5px' } }, 'Chat estimates assume a typical message (about 1,500 input and 700 output tokens). Video is billed per second and depends on resolution. You are charged for actual usage.'),
    h('h2', {}, 'Activity'),
    b.ledger.length ? h('div', { class: 'table-wrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Description'), h('th', { style: { textAlign: 'right' } }, 'Credits'), h('th', { style: { textAlign: 'right' } }, 'Balance'))),
      h('tbody', {}, b.ledger.slice(0, 100).map((l) => h('tr', {}, h('td', { style: { whiteSpace: 'nowrap', color: 'var(--muted)' } }, new Date(l.at).toLocaleString()), h('td', {}, l.desc), h('td', { class: 'num ' + (l.credits > 0 ? 'pos' : 'neg') }, (l.credits > 0 ? '+' : '−') + fmtCredits(Math.abs(l.credits))), h('td', { class: 'num' }, fmtCredits(l.balance))))),
    )) : h('div', { class: 'empty' }, 'No activity yet.'),
  ].filter((x) => x != null && x !== false)); // a bare false would show up as the word "false"
}

// Before a plan change: exactly what is paid today and what the plan will be from the next renewal.
function planChangeDialog(q, onConfirm) {
  const money = (n) => '$' + Number(n || 0).toFixed(2);
  const day = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const card = q.card ? `${q.card.brand ? q.card.brand[0].toUpperCase() + q.card.brand.slice(1) : 'Card'} ending ${q.card.last4}` : 'your card on file';
  const row = (label, value, cls = '') => h('div', { class: 'pc-row ' + cls }, h('span', {}, label), h('b', {}, value));
  const close = () => bg.remove();
  const go = h('button', { class: 'btn primary', 'data-confirm': '' }, q.upgrade ? (q.dueNow > 0 ? `Pay ${money(q.dueNow)} and upgrade` : 'Upgrade now') : `Move to ${q.to.name}`);
  go.onclick = () => onConfirm(go);
  const bg = h('div', { class: 'modal-bg dlg plan-dlg', onmousedown: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'gate-box pc-box' },
      h('button', { class: 'icon-btn gate-x', title: 'Close', onclick: close }, icon('x')),
      h('h2', {}, q.upgrade ? `Upgrade to ${q.to.name}` : `Move to ${q.to.name}`),
      h('p', { class: 'gate-sub' }, `From ${q.from.name} ($${q.from.priceUsd}/month) to ${q.to.name} ($${q.to.priceUsd}/month).`),
      h('div', { class: 'pc-block' },
        h('small', {}, 'Today'),
        q.upgrade ? [
          row(`${q.to.name} for the rest of this month`, money(q.charge)),
          row(`Credit for unused ${q.from.name} time`, '−' + money(q.credit), 'muted'),
          row('You pay now', money(q.dueNow), 'total'),
          row('Credits added now', `+${q.extraCredits.toLocaleString()}`),
        ] : [
          row('You pay now', money(0), 'total'),
          h('p', { class: 'pc-note' }, `No refund for this month. You keep all your current credits, and you stay on ${q.to.name} from today.`),
        ]),
      h('div', { class: 'pc-block' },
        h('small', {}, `From ${day(q.renewsAt)}`),
        row('Each month you pay', `${money(q.to.priceUsd)}`),
        row('Credits each month', q.to.credits.toLocaleString()),
        h('p', { class: 'pc-note' }, 'Your renewal date stays the same. Cancel any time.')),
      h('p', { class: 'pc-card' }, q.demo ? 'Demo mode: no card is charged.' : q.upgrade && q.dueNow > 0 ? `${money(q.dueNow)} is charged to ${card} now.` : `Charged to ${card} at your next renewal.`),
      h('div', { class: 'up-foot' }, h('button', { class: 'btn ghost', onclick: close }, 'Cancel'), go)));
  document.body.append(bg);
  return bg;
}

// When credits run out (switch FEATURE_SUBSCRIPTIONS): one clear next step instead of a bare error.
let upgradeShownAt = 0;
function upgradePrompt() {
  if (!S.config?.flags?.subscriptions || !S.user) return false;
  if ($('.upgrade-dlg')) return true;
  if (Date.now() - upgradeShownAt < 60e3) return false;
  upgradeShownAt = Date.now();
  const bv = S.user.billing || {};
  const plans = S.config.plans.filter((p) => p.priceUsd > 0);
  const cur = S.config.plans.find((p) => p.id === S.user.plan);
  const paid = cur && cur.priceUsd > 0 && bv.hasSub !== false && ['active', 'past_due', 'trialing'].includes(bv.status);
  const bigger = paid ? plans.filter((p) => p.priceUsd > cur.priceUsd) : plans;
  const close = () => bg.remove();
  const go = (hash) => { close(); closePop(); $('.lightbox')?.remove(); if (location.hash === hash) route(); else location.hash = hash; };
  const pick = async (p, btn) => {
    if (paid) return go('#/billing');
    btn.disabled = true;
    try {
      const r = await api('/api/billing/checkout', { method: 'POST', body: { offerId: p.id } });
      if (r.url) { location.href = r.url; return; }
      S.user = (await api('/api/me')).user; setCredits(S.user.credits); renderShell(); close();
      toast(`You are on ${p.name}. ${p.credits.toLocaleString()} credits added${r.mode === 'demo' ? ' (demo mode, no charge)' : ''}.`);
    } catch (e) { btn.disabled = false; toast(e.message, 'error'); }
  };
  const title = bv.trial ? 'Your free trial credits are used up' : paid ? `You have used this month's ${cur.name} credits` : 'You are out of credits';
  const sub = bv.trial ? 'Pick a plan to keep going. Plans add fresh credits every month, and you can cancel any time.' : paid ? (bv.renewsAt ? `New credits arrive on ${new Date(bv.renewsAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}. Until then, add a credit pack or move to a bigger plan.` : 'Add a credit pack or move to a bigger plan to keep going.') : 'Pick a plan or a credit pack to keep going.';
  const bg = h('div', { class: 'modal-bg dlg upgrade-dlg', onmousedown: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'gate-box up-box' },
      h('button', { class: 'icon-btn gate-x', title: 'Close', onclick: close }, icon('x')),
      h('div', { class: 'up-ico' }, icon('bolt')),
      h('h2', {}, title), h('p', { class: 'gate-sub' }, sub),
      bigger.length ? h('div', { class: 'up-plans' }, bigger.slice(0, 3).map((p) => {
        const btn = h('button', { class: 'up-plan' + (p.popular ? ' pop' : ''), 'data-plan': p.id }, h('b', {}, p.name), h('span', {}, `$${p.priceUsd}/month`), h('small', {}, `${p.credits.toLocaleString()} credits each month`));
        btn.onclick = () => pick(p, btn);
        return btn;
      })) : null,
      h('div', { class: 'up-foot' },
        h('button', { class: 'btn', onclick: () => go('#/billing') }, paid ? 'Buy a credit pack' : 'Credit packs and all plans'),
        h('button', { class: 'btn ghost', onclick: close }, 'Not now'))));
  document.body.append(bg);
  return true;
}

// The admin module (users, subscriptions, usage, analytics, error log) lives in admin.js and loads only for admins.
async function renderAdmin(tab, sub) {
  dropTarget = null;
  const m = await import('./admin.js');
  return m.renderAdmin(tab || '', sub || '');
}

// ======================================================================
// Downloads (Word, PDF, Markdown, HTML) and the live HTML preview
// ======================================================================
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const mdTitle = (md, fallback = 'Scenly reply') => ((String(md || '').match(/^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/m) || [])[1] || fallback).replace(/[*_`~[\]]/g, '').trim().slice(0, 80) || fallback;
const fileSlug = (s) => (String(s).normalize('NFKD').replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'document');
function docHtml(md, title) {
  const body = DOMPurify.sanitize(marked.parse(md || ''));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title.replace(/[<>&]/g, '')}</title><style>body{font:11pt/1.6 Calibri,Arial,Helvetica,sans-serif;color:#15151b;max-width:780px;margin:40px auto;padding:0 24px}h1{font-size:20pt;line-height:1.25}h2{font-size:15pt;margin-top:1.4em}h3{font-size:12.5pt}table{border-collapse:collapse;width:100%;margin:0 0 14px}th,td{border:1px solid #b8bdc7;padding:6px 10px;text-align:left;vertical-align:top}th{background:#eef1f5}pre{background:#f4f4f6;padding:12px;border-radius:6px;white-space:pre-wrap}code{font-family:Consolas,Menlo,monospace;font-size:10pt}blockquote{margin:0 0 12px;padding-left:14px;border-left:3px solid #c8ccd4;color:#555b66}hr{border:0;border-top:1px solid #bbb;margin:20px 0}@media print{body{margin:0;max-width:none;padding:0}}</style></head><body>${body}</body></html>`;
}
async function exportReply(md, fmt, btn) {
  const title = mdTitle(md);
  try {
    if (fmt === 'docx') {
      if (btn) btn.disabled = true;
      const res = await fetch('/api/export/docx', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: md, title }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not create the Word file.');
      downloadBlob(await res.blob(), decodeURIComponent(res.headers.get('X-File-Name') || fileSlug(title) + '.docx'));
      toast('Word file downloaded');
    } else if (fmt === 'md') downloadBlob(new Blob([md], { type: 'text/markdown' }), fileSlug(title) + '.md');
    else if (fmt === 'html') downloadBlob(new Blob([docHtml(md, title)], { type: 'text/html' }), fileSlug(title) + '.html');
    else if (fmt === 'pdf') {
      // The browser's own "Save as PDF" gives a real, selectable PDF with no extra software.
      const frame = h('iframe', { style: { position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 }, srcdoc: docHtml(md, title) });
      frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { toast('Could not open the print dialog', 'error'); } setTimeout(() => frame.remove(), 60000); };
      document.body.append(frame);
      toast('Choose "Save as PDF" in the print dialog');
    }
  } catch (e) { errToast(e); } finally { if (btn) btn.disabled = false; }
}
function openDownloadMenu(anchor, md) {
  const item = (fmt, ic, label, sub) => h('button', { onclick: () => { closePop(); exportReply(md, fmt); } }, icon(ic), h('span', {}, label, h('small', { style: { display: 'block', color: 'var(--faint)', fontSize: '11.5px' } }, sub)));
  popover(anchor, h('div', { class: 'menu', style: { minWidth: '210px' } },
    h('div', { class: 'menu-head' }, 'DOWNLOAD AS'),
    item('docx', 'doc', 'Word', '.docx, opens in Word and Google Docs'),
    item('pdf', 'doc', 'PDF', 'through the print dialog'),
    item('md', 'doc', 'Markdown', '.md plain text'),
    item('html', 'globe', 'Web page', '.html'),
  ));
}

// Finds a full web page (or an SVG) inside a reply so it can be shown live.
function extractHtml(md) {
  let best = null;
  for (const m of String(md || '').matchAll(/```([\w+-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g)) {
    const lang = m[1].toLowerCase(), code = m[2];
    const isHtml = lang === 'html' || lang === 'htm' || (!lang && /^\s*(<!doctype html|<html[\s>])/i.test(code));
    const isSvg = lang === 'svg' || ((lang === 'xml' || !lang) && /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(code));
    if (!isHtml && !isSvg) continue;
    if (code.trim().length < 40) continue;
    const html = isSvg ? `<!doctype html><html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${code}</body></html>` : code;
    if (!best || html.length > best.html.length) best = { html, kind: isSvg ? 'svg' : 'html' };
  }
  if (best) best.title = (best.html.match(/<title[^>]*>([^<]{1,80})<\/title>/i) || [])[1]?.trim() || (best.kind === 'svg' ? 'SVG image' : 'Web page');
  return best;
}
function previewFrame(html) {
  // Sandboxed with no same-origin access: generated pages can run their scripts but cannot touch the account.
  return h('iframe', { class: 'pv-frame', title: 'Live preview', sandbox: 'allow-scripts allow-forms allow-modals allow-popups', srcdoc: html });
}
function highlighted(code, lang) {
  const el = h('code', {}, code);
  try { if (code.length < 200000 && lang && hljs.getLanguage(lang)) el.innerHTML = hljs.highlight(code, { language: lang }).value; } catch {}
  el.classList.add('hljs');
  return h('pre', { class: 'pv-code' }, el);
}
function closeCanvas() { $('.canvas')?.remove(); $('.chat')?.classList.remove('canvas-open'); Docs.onCanvasClosed(); }
function openCanvas({ title, html }) {
  const host = $('.chat'); if (!host) return;
  closeCanvas();
  let tab = 'preview';
  const body = h('div', { class: 'canvas-body' });
  const seg = h('div', { class: 'seg' });
  const draw = () => {
    seg.replaceChildren(...[['preview', 'eye', 'Preview'], ['code', 'code', 'Code']].map(([k, ic, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, icon(ic), l)));
    body.replaceChildren(tab === 'preview' ? previewFrame(html) : highlighted(html, 'xml'));
  };
  const panel = h('aside', { class: 'canvas' },
    h('div', { class: 'canvas-head' },
      h('b', { title }, title), seg, h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn sm', title: 'Reload preview', onclick: () => { tab = 'preview'; draw(); } }, icon('retry')),
      h('button', { class: 'icon-btn sm', title: 'Full width', onclick: () => panel.classList.toggle('wide') }, icon('expand')),
      h('button', { class: 'icon-btn sm', title: 'Download .html', onclick: () => downloadBlob(new Blob([html], { type: 'text/html' }), fileSlug(title) + '.html') }, icon('dl')),
      h('button', { class: 'icon-btn sm', title: 'Close preview', onclick: closeCanvas }, icon('x')),
    ),
    body,
  );
  host.append(panel); host.classList.add('canvas-open');
  draw();
}
function previewCard(found) {
  return h('div', { class: 'art-card' },
    h('div', { class: 'art-ic' }, icon(found.kind === 'svg' ? 'image' : 'globe')),
    h('div', { class: 'art-txt' }, h('b', {}, found.title), h('small', {}, found.kind === 'svg' ? 'SVG image · live preview' : 'Web page · live preview')),
    h('button', { class: 'btn sm primary', onclick: () => openCanvas(found) }, icon('eye'), 'Open preview'),
    h('button', { class: 'icon-btn sm', title: 'Download .html', onclick: () => downloadBlob(new Blob([found.html], { type: 'text/html' }), fileSlug(found.title) + '.html') }, icon('dl')),
  );
}
function fileCard(msg) {
  const title = mdTitle(msg.content, 'Document');
  const word = msg.fileKind !== 'pdf';
  return h('div', { class: 'art-card' },
    h('div', { class: 'art-ic doc' }, word ? 'W' : 'PDF'),
    h('div', { class: 'art-txt' }, h('b', {}, `${fileSlug(title)}.${word ? 'docx' : 'pdf'}`), h('small', {}, word ? 'Word document · ready to download' : 'PDF · saved through the print dialog')),
    h('button', { class: 'btn sm primary', onclick: (e) => exportReply(msg.content, word ? 'docx' : 'pdf', e.currentTarget) }, icon('dl'), word ? 'Download Word' : 'Save as PDF'),
    h('button', { class: 'icon-btn sm', title: 'Other formats', onclick: (e) => openDownloadMenu(e.currentTarget, msg.content) }, icon('down')),
  );
}

// ======================================================================
// Code: a coding agent with a project workspace (files, editor, live preview)
// ======================================================================
const isCodeModel = (m) => m.type === 'chat' && m.caps.includes('coding');
const dedicatedCoder = (m) => /code|coder|codex/i.test(m.id + ' ' + m.name);
const codeModels = () => S.models.filter(isCodeModel).sort((a, b) => dedicatedCoder(b) - dedicatedCoder(a));
function codeModel() {
  const m = byId(S.codeModelId);
  if (m && isCodeModel(m)) return m;
  const list = codeModels();
  return ['deepseek-v4-flash', 'deepseek-v4-pro', 'qwen3.8-flash'].map((x) => list.find((y) => y.id === x)).find(Boolean) || list[0] || chatModel();
}
const CX = { tab: 'code', path: null, page: null, editing: false, wsOpen: false };
const EXT_LANG = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', html: 'xml', htm: 'xml', svg: 'xml', xml: 'xml', vue: 'xml', css: 'css', scss: 'scss', json: 'json', md: 'markdown', py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', php: 'php', sh: 'bash', bash: 'bash', yml: 'yaml', yaml: 'yaml', sql: 'sql', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', toml: 'ini', ini: 'ini', dockerfile: 'dockerfile' };
const extOf = (p) => (p.split('/').pop().includes('.') ? p.split('.').pop().toLowerCase() : p.split('/').pop().toLowerCase());
const htmlPages = (files) => Object.keys(files).filter((p) => /\.html?$/i.test(p)).sort((a, b) => (/(^|\/)index\.html?$/i.test(b) - /(^|\/)index\.html?$/i.test(a)) || a.split('/').length - b.split('/').length || a.localeCompare(b));
function resolvePath(from, rel) {
  const out = from.split('/').slice(0, -1);
  for (const seg of rel.split('/')) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); }
  return out.join('/');
}
// Builds one self-contained page from the project: local CSS, JS and SVG files are pulled in.
function buildPreview(files, page) {
  let html = files[page] || '';
  const local = (ref) => { if (!ref || /^([a-z]+:|\/\/|#|data:)/i.test(ref)) return null; const p = ref.startsWith('/') ? ref.slice(1).split(/[?#]/)[0] : resolvePath(page, ref.split(/[?#]/)[0]); return p in files ? p : null; };
  html = html.replace(/<link\b[^>]*>/gi, (tag) => { if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) return tag; const p = local((tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1]); return p ? `<style>\n${files[p].replace(/<\/style/gi, '<\\/style')}\n</style>` : tag; });
  html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, attrs) => { const p = local((attrs.match(/src\s*=\s*["']([^"']+)["']/i) || [])[1]); if (!p) return tag; const type = (attrs.match(/type\s*=\s*["']([^"']+)["']/i) || [])[1]; return `<script${type ? ` type="${type}"` : ''}>\n${files[p].replace(/<\/script/gi, '<\\/script')}\n</script>`; });
  html = html.replace(/(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (all, a, src, c) => { const p = local(src); return p && /\.svg$/i.test(p) ? `${a}data:image/svg+xml;utf8,${encodeURIComponent(files[p])}${c}` : all; });
  const nav = `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var u=a.getAttribute('href');if(!u||/^(#|[a-z]+:|\\/\\/)/i.test(u))return;e.preventDefault();parent.postMessage({pmNav:u.split('#')[0].split('?')[0]},'*');},true);</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, nav + '</body>') : html + nav;
}
window.addEventListener('message', (e) => {
  const frame = $('.cx-ws .pv-frame');
  if (!frame || e.source !== frame.contentWindow || typeof e.data?.pmNav !== 'string' || !S.code) return;
  const target = e.data.pmNav.startsWith('/') ? e.data.pmNav.slice(1) : resolvePath(CX.page || 'index.html', e.data.pmNav);
  const hit = [target, target + '.html', (target ? target + '/' : '') + 'index.html'].find((p) => p in S.code.files);
  if (hit && /\.html?$/i.test(hit)) { CX.page = hit; drawWorkspace(); } else toast(`"${e.data.pmNav}" is not a page in this project`);
});

// Splits a reply into text and file steps, so files show as one-line steps instead of walls of code.
function normalizeFileBlocks(text, streaming = false) {
  text = String(text || '');
  const open = /<file\s+path="([^"]+)"\s*>/g;
  const starts = []; let m;
  while ((m = open.exec(text))) starts.push({ i: m.index, end: open.lastIndex, path: m[1] });
  if (!starts.length) return text;
  let out = '', last = 0;
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    if (s.i < last) continue;
    const nextFile = k + 1 < starts.length ? starts[k + 1].i : text.length;
    const del = text.indexOf('<delete path=', s.end);
    const limit = del >= 0 && del < nextFile ? del : nextFile;
    const seg = text.slice(s.end, limit);
    out += text.slice(last, s.i);
    const close = seg.indexOf('</file>');
    if (close >= 0) { out += text.slice(s.i, s.end + close + 7); last = s.end + close + 7; continue; }
    // Some models end a file with a Markdown fence instead of </file>. Treat the last fence-only line as the end.
    const isLast = limit === text.length;
    const fences = [...seg.matchAll(/\n[ \t]*```[ \t]*(?=\n|$)/g)];
    const fence = fences[fences.length - 1];
    if (!fence || (isLast && streaming && !/\n[ \t]*```[ \t]*\n/.test(seg.slice(fence.index) + '\n'))) { out += text.slice(s.i, limit); last = limit; continue; }
    if (isLast && streaming && seg.slice(fence.index + fence[0].length).trim() === '' ) { out += text.slice(s.i, limit); last = limit; continue; }
    out += text.slice(s.i, s.end) + seg.slice(0, fence.index) + '\n</file>';
    last = s.end + fence.index + fence[0].length;
  }
  return out + text.slice(last);
}
function codeSegments(content, streaming) {
  content = normalizeFileBlocks(content, streaming);
  const out = []; let last = 0, m;
  const re = /<file\s+path="([^"]+)"\s*>\n?([\s\S]*?)\n?<\/file>|<delete\s+path="([^"]+)"\s*\/?>(?:\s*<\/delete>)?/g;
  while ((m = re.exec(content))) {
    if (m.index > last) out.push({ text: content.slice(last, m.index) });
    out.push(m[1] != null ? { op: 'write', path: m[1].replace(/^(\.\/)+/, ''), lines: m[2].split('\n').length } : { op: 'delete', path: m[3] });
    last = re.lastIndex;
  }
  let rest = content.slice(last);
  const open = rest.match(/<file\s+path="([^"]+)"\s*>\n?([\s\S]*)$/);
  if (open) { out.push({ text: rest.slice(0, open.index) }); out.push({ op: 'write', path: open[1].replace(/^(\.\/)+/, ''), lines: open[2].split('\n').length, pending: streaming, cut: !streaming }); rest = ''; }
  if (streaming) rest = rest.replace(/<(f(i(l(e[^>]*)?)?)?|d(e(l(e(t(e[^>]*)?)?)?)?)?)?$/, '');
  if (rest.trim()) out.push({ text: rest });
  return out.filter((s) => s.op || s.text.trim());
}
function renderCodeMsg(msg, { streaming = false, isLast = false } = {}) {
  if (msg.role === 'user') return h('div', { class: 'cx-user', 'data-id': msg.id }, h('span', { class: 'cx-caret' }, '>'), h('div', {}, msg.content));
  const m = byId(msg.model);
  const box = h('div', { class: 'cx-ai', 'data-id': msg.id });
  if (msg.reasoning) box.append(thinkingBlock(msg.reasoning, streaming && !msg.content));
  const used = new Set();
  const segs = codeSegments(msg.content || '', streaming);
  segs.forEach((s, i) => {
    if (s.text) { const md = renderMd(s.text.trim()); if (streaming && i === segs.length - 1) md.classList.add('typing'); return box.append(md); }
    const rec = (msg.ops || []).find((o, k) => !used.has(k) && o.path === s.path && used.add(k));
    const verb = s.pending ? 'Writing' : s.cut ? 'Stopped' : s.op === 'delete' ? 'Delete' : rec?.action === 'update' ? 'Update' : rec?.action === 'skip' ? 'Skipped' : rec?.action === 'create' || !rec ? 'Write' : 'Write';
    const openable = !s.pending && !s.cut && s.op !== 'delete' && rec?.action !== 'skip';
    box.append(h(openable ? 'button' : 'div', { class: 'cx-op' + (s.pending ? ' pending' : '') + (s.op === 'delete' ? ' del' : '') + (s.cut || rec?.action === 'skip' ? ' warn' : ''), title: openable ? 'Open this file' : null, onclick: openable ? () => openCodeFile(s.path) : null },
      s.pending ? h('span', { class: 'spin' }) : h('span', { class: 'dot' }, '●'),
      h('span', { class: 'verb' }, verb), h('span', { class: 'path' }, s.path),
      s.pending ? h('span', { class: 'dstat' }, `${s.lines} lines`) : s.cut ? h('span', { class: 'dstat' }, 'not saved, reply was cut off') : rec?.note ? h('span', { class: 'dstat' }, rec.note) : rec ? h('span', { class: 'dstat' }, rec.added ? h('i', { class: 'add' }, `+${rec.added}`) : null, rec.removed ? h('i', { class: 'rem' }, `−${rec.removed}`) : null) : h('span', { class: 'dstat' }, `${s.lines || ''} lines`),
    ));
  });
  if (streaming && !segs.length && !msg.reasoning) box.append(h('div', { class: 'cx-op pending' }, h('span', { class: 'spin' }), h('span', { class: 'verb' }, 'Thinking…')));
  if (msg.error) box.append(errBox({ message: msg.error }, isLast ? () => submitCode({ regenerate: true }) : null));
  if (msg.stopped) box.append(h('div', { class: 'cx-foot' }, 'Stopped'));
  if (!streaming) box.append(h('div', { class: 'cx-foot' },
    m ? [modelLogo(m, 'logo-xs'), shortName(m)] : msg.model, msg.ops?.length ? ` · ${msg.ops.filter((o) => o.action !== 'skip').length} file${msg.ops.length === 1 ? '' : 's'} changed` : '', msg.credits != null ? ` · ${fmtCredits(msg.credits)} credits` : '',
    h('span', { class: 'grow' }),
    h('button', { class: 'icon-btn sm', title: 'Copy reply', onclick: (e) => copyText(codeSegments(msg.content || '').map((s) => s.text || `[${s.op} ${s.path}]`).join('\n'), e.currentTarget) }, icon('copy')),
    isLast && h('button', { class: 'icon-btn sm', title: 'Try again', onclick: () => submitCode({ regenerate: true }) }, icon('retry')),
  ));
  return box;
}

async function renderCode(cid) {
  const main = $('#main');
  if (cid) {
    const running = jobById(cid);
    UNREAD.delete(cid);
    if (running && S.code !== running.conv) {
      S.code = running.conv;
      Object.assign(CX, { path: null, page: null, editing: false, tab: htmlPages(S.code.files).length ? 'preview' : 'code' });
    } else if (!running && S.code?.id !== cid) {
      let conv;
      try { conv = (await api('/api/conversations/' + cid)).conversation; } catch { toast('Build not found', 'error'); location.hash = '#/code'; return; }
      if (conv.kind !== 'code') { location.hash = '#/c/' + cid; return; }
      S.code = { ...conv, files: conv.files || {} };
      Object.assign(CX, { path: null, page: null, editing: false, tab: htmlPages(S.code.files).length ? 'preview' : 'code' });
    }
  } else { S.code = null; Object.assign(CX, { path: null, page: null, editing: false, tab: 'code' }); }
  dropTarget = (files) => addProjectFiles(files);
  const side = h('div', { class: 'chat-list' });
  const scroll = h('div', { class: 'scroll', id: 'cx-scroll' });
  S.follow = true;
  scroll.addEventListener('scroll', () => { S.follow = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80; }, { passive: true });
  const wsBtn = h('button', { class: 'pill ws-btn', onclick: () => $('.codex').classList.add('show-ws') }, icon('folder'), h('span', { id: 'cx-count' }, 'Files'));
  const mainCol = h('div', { class: 'cx-main' },
    topbar([h('div', { class: 'title', id: 'cx-title' }, S.code?.title || 'Scenly Code')], wsBtn),
    scroll,
    h('div', { class: 'dock' }, buildCodeBar(), h('div', { class: 'bar-hint' }, 'Writes and edits project files. It does not run commands on your computer.')),
  );
  main.replaceChildren(h('div', { class: 'codex nolist' }, side, mainCol, h('aside', { class: 'cx-ws', id: 'cx-ws' })));
  renderCodeList();
  if (!S.code || (!S.code.messages.length && !jobOf(S.code))) {
    const m = codeModel();
    const tips = [['Landing page', 'Build a modern landing page for a specialty coffee subscription: hero, features, pricing and a signup form.'], ['Analytics dashboard', 'Build a sales analytics dashboard with KPI cards and Chart.js line, bar and doughnut charts using example data.'], ['Python script', 'Write a Python script that reads a CSV of orders and prints revenue per month, with a README.'], ['To-do app', 'Build a to-do app with add, complete, filter and local storage. Plain HTML, CSS and JavaScript.']];
    scroll.append(h('div', { class: 'cx-thread', id: 'cx-thread' }, h('div', { class: 'cx-welcome' },
      h('div', { class: 'cx-box' }, h('b', {}, h('span', { class: 'cx-star' }, '✻'), ' Welcome to Scenly Code'), h('p', {}, 'Describe what to build. I plan it, write the files into your project, and show a live preview.'), h('p', { class: 'dim' }, `model: ${shortName(m)}  ·  project: ${S.code ? S.code.title : 'new'}`)),
      h('div', { class: 'cx-tips' }, h('span', { class: 'dim' }, 'Try:'), tips.map(([l, t]) => h('button', { class: 'suggest', onclick: () => { const ta = $('#cx-prompt'); ta.value = t; ta.dispatchEvent(new Event('input')); ta.focus(); } }, icon('terminal'), l))),
    )));
    if (S.pendingCode) { const ta = $('#cx-prompt'); ta.value = S.pendingCode; S.pendingCode = ''; ta.dispatchEvent(new Event('input')); if (S.autoSend) { S.autoSend = false; setTimeout(() => { if ($('#cx-prompt') === ta && ta.value) submitCode(); }, 0); } }
  } else {
    const thread = h('div', { class: 'cx-thread', id: 'cx-thread' });
    const job = jobOf(S.code);
    S.code.messages.forEach((msg, i) => thread.append(renderCodeMsg(msg, { isLast: !job && i === S.code.messages.length - 1 })));
    if (job) thread.append(...[job.tmpUser, job.aiEl].filter(Boolean));
    scroll.append(thread);
    requestAnimationFrame(() => scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'instant' }));
  }
  drawWorkspace();
  $('#cx-prompt')?.focus();
}
const renderCodeList = renderRecents;
function openCodePicker(anchor) {
  let q = '';
  const list = h('div', { class: 'pick-list' });
  const cur = codeModel();
  const draw = () => {
    const ms = codeModels().filter((m) => !q || (m.name + m.provider + m.id + (m.blurb || '')).toLowerCase().includes(q));
    list.replaceChildren(...ms.map((m) => h('button', { class: 'mopt' + (m.id === cur.id ? ' sel' : ''), onclick: () => { closePop(); S.codeModelId = m.id; store.set('code-model', m.id); const keep = $('#cx-prompt')?.value || ''; $('.cx-main .dock').firstChild.replaceWith(buildCodeBar()); const ta = $('#cx-prompt'); ta.value = keep; ta.dispatchEvent(new Event('input')); ta.focus(); } },
      modelLogo(m),
      h('div', { class: 'txt' },
        h('div', { class: 'nm' }, shortName(m), dedicatedCoder(m) && h('span', { class: 'tag new' }, 'Code model'), m.caps.includes('fast') && h('span', { class: 'tag dim' }, 'fast'), costTag(m)),
        h('div', { class: 'ds' }, modelBlurb(m)),
        h('div', { class: 'pr' }, costText(m)),
      ),
      m.id === cur.id && icon('check', 'chk'),
    )));
    if (!ms.length) list.append(h('div', { class: 'empty' }, 'No models match'));
  };
  const input = h('input', { class: 'field-input', placeholder: 'Search coding models', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } });
  popover(anchor, h('div', { class: 'models picker', style: { width: '380px' } }, h('div', { style: { padding: '4px', flex: 'none' } }, input), h('div', { class: 'menu-head' }, 'CODING MODELS'), list), 'above');
  draw(); input.focus();
}
function buildCodeBar() {
  const m = codeModel();
  const ta = h('textarea', { id: 'cx-prompt', rows: 1, placeholder: S.code?.messages.length ? 'Ask for a change, a fix or a new feature' : 'Describe what to build' });
  const send = h('button', { class: 'send', id: 'cx-send', title: 'Send', disabled: true, onclick: () => (jobOf(S.code) ? stopStream(S.code) : submitCode()) }, icon('up'));
  const bar = h('div', { class: 'bar cx-bar' },
    h('div', { class: 'bar-top' }, h('span', { class: 'cx-caret' }, '>'), ta),
    h('div', { class: 'bar-row' },
      h('button', { class: 'icon-btn', title: 'Add your own files to the project', onclick: () => pickFiles('', true, addProjectFiles) }, icon('clip')),
      h('button', { class: 'chipbtn', title: 'Coding model', onclick: (e) => openCodePicker(e.currentTarget) }, modelLogo(m, 'logo-sm'), h('span', { class: 'nm' }, shortName(m)), icon('down')),
      projectChip('code'),
      h('div', { class: 'grow' }), micButton(ta), send,
    ),
  );
  const sync = () => { autoGrow(ta); updateCodeSend(); };
  ta.addEventListener('input', sync);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!jobOf(S.code)) submitCode(); } });
  setTimeout(updateCodeSend, 0);
  return bar;
}
function updateCodeSend() {
  const send = $('#cx-send'); if (!send) return;
  if (jobOf(S.code)) { send.disabled = false; send.classList.add('stop'); send.replaceChildren(icon('stop')); send.title = 'Stop'; return; }
  send.classList.remove('stop'); send.replaceChildren(icon('up')); send.title = 'Send';
  send.disabled = !$('#cx-prompt')?.value.trim();
}
async function addProjectFiles(list) {
  const picked = [];
  for (const f of list) {
    if (f.size > 600 * 1024) { toast(`${f.name} is over 600 KB and was skipped`, 'error'); continue; }
    const text = await f.text();
    if (text.slice(0, 4000).includes('\u0000')) { toast(`${f.name} is not a text file and was skipped`, 'error'); continue; }
    picked.push({ path: f.webkitRelativePath || f.name, content: text });
  }
  if (!picked.length) return;
  try {
    if (!S.code) {
      const r = await api('/api/code/projects', { method: 'POST', body: { title: picked[0].path.split('/').pop() } });
      S.conversations.unshift(r.conversation);
      S.code = { ...r.conversation, messages: [], files: {} };
      history.replaceState(null, '', '#/code/' + S.code.id);
      $('#cx-title').textContent = S.code.title; renderCodeList();
    }
    S.code.files = (await api(`/api/conversations/${S.code.id}/files`, { method: 'PUT', body: { files: picked } })).files;
    CX.tab = 'code'; CX.path = picked[0].path.replace(/^(\.\/)+/, ''); CX.editing = false;
    drawWorkspace();
    toast(`${picked.length} file${picked.length === 1 ? '' : 's'} added to the project`);
  } catch (e) { errToast(e); }
}
function openCodeFile(p) {
  if (!S.code || !(p in S.code.files)) return toast('That file is no longer in the project');
  Object.assign(CX, { tab: 'code', path: p, editing: false });
  $('.codex')?.classList.add('show-ws');
  drawWorkspace();
}
function drawWorkspace() {
  const ws = $('#cx-ws'); if (!ws) return;
  const files = S.code?.files || {};
  const paths = Object.keys(files).sort((a, b) => (a.includes('/') - b.includes('/')) || a.localeCompare(b));
  const pages = htmlPages(files);
  const cnt = $('#cx-count'); if (cnt) cnt.textContent = paths.length ? `${paths.length} file${paths.length === 1 ? '' : 's'}` : 'Files';
  if (CX.tab === 'preview' && !pages.length) CX.tab = 'code';
  if (!CX.page || !(CX.page in files)) CX.page = pages[0] || null;
  if (!CX.path || !(CX.path in files)) { CX.path = paths.includes('index.html') ? 'index.html' : paths[0] || null; CX.editing = false; }
  const seg = h('div', { class: 'seg' }, [['preview', 'eye', 'Preview'], ['code', 'code', 'Code']].map(([k, ic, l]) => h('button', { class: CX.tab === k ? 'on' : '', disabled: k === 'preview' && !pages.length, title: k === 'preview' && !pages.length ? 'This project has no web page to preview' : null, onclick: () => { CX.tab = k; drawWorkspace(); } }, icon(ic), l)));
  const head = h('div', { class: 'canvas-head' },
    seg,
    CX.tab === 'preview' && pages.length > 1 && h('select', { class: 'cx-page', onchange: (e) => { CX.page = e.target.value; drawWorkspace(); } }, pages.map((p) => h('option', { value: p, selected: p === CX.page }, p))),
    h('span', { class: 'grow' }),
    CX.tab === 'preview' && h('button', { class: 'icon-btn sm', title: 'Reload preview', onclick: drawWorkspace }, icon('retry')),
    h('button', { class: 'icon-btn sm', title: 'Full width', onclick: () => $('.codex').classList.toggle('ws-wide') }, icon('expand')),
    paths.length > 0 && S.code?.id && h('a', { class: 'icon-btn sm', title: 'Download project as .zip', href: `/api/conversations/${S.code.id}/zip`, download: '' }, icon('dl')),
    h('button', { class: 'icon-btn sm ws-close', title: 'Back to the conversation', onclick: () => $('.codex').classList.remove('show-ws') }, icon('x')),
  );
  let body;
  if (!paths.length) {
    body = h('div', { class: 'empty cx-empty' }, icon('folder'), h('b', {}, 'No files yet'), h('span', {}, 'Files the model writes appear here, with a live preview for web pages. You can also drop your own files in.'));
  } else if (CX.tab === 'preview') {
    body = h('div', { class: 'canvas-body' }, previewFrame(buildPreview(files, CX.page)));
  } else {
    const tree = h('div', { class: 'cx-files' }, paths.map((p) => { const i = p.lastIndexOf('/'); return h('button', { class: 'cx-file' + (p === CX.path ? ' on' : ''), title: p, onclick: () => { CX.path = p; CX.editing = false; drawWorkspace(); } }, icon('doc'), h('span', {}, i >= 0 && h('i', {}, p.slice(0, i + 1)), p.slice(i + 1))); }));
    const content = files[CX.path] ?? '';
    const area = CX.editing ? h('textarea', { class: 'cx-edit', spellcheck: 'false' }, content) : highlighted(content, EXT_LANG[extOf(CX.path)]);
    const save = async () => { try { S.code.files = (await api(`/api/conversations/${S.code.id}/files`, { method: 'PUT', body: { path: CX.path, content: area.value } })).files; CX.editing = false; drawWorkspace(); toast('Saved'); } catch (e) { errToast(e); } };
    if (CX.editing) area.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } if (e.key === 'Tab') { e.preventDefault(); area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end'); } });
    body = h('div', { class: 'cx-code' }, tree, h('div', { class: 'cx-editor' },
      h('div', { class: 'code-head' }, h('span', {}, CX.path, h('i', { style: { opacity: .6, fontStyle: 'normal' } }, `  ·  ${content.split('\n').length} lines`)), h('span', { style: { display: 'flex', gap: '2px' } },
        CX.editing ? [h('button', { class: 'btn ghost sm', onclick: () => { CX.editing = false; drawWorkspace(); } }, 'Cancel'), h('button', { class: 'btn sm primary', onclick: save }, icon('check'), 'Save')]
          : [h('button', { class: 'btn ghost sm', onclick: (e) => copyText(content, e.currentTarget) }, icon('copy'), 'Copy'), h('button', { class: 'btn ghost sm', onclick: () => { CX.editing = true; drawWorkspace(); $('.cx-edit')?.focus(); } }, icon('edit'), 'Edit'), h('button', { class: 'btn ghost sm', title: 'Download this file', onclick: () => downloadBlob(new Blob([content]), CX.path.split('/').pop()) }, icon('dl')), h('button', { class: 'btn ghost sm', title: 'Delete this file', onclick: async () => { if (!confirm(`Delete ${CX.path}?`)) return; try { S.code.files = (await api(`/api/conversations/${S.code.id}/files`, { method: 'PUT', body: { path: CX.path, content: null } })).files; drawWorkspace(); } catch (e) { errToast(e); } } }, icon('trash'))],
      )),
      area,
    ));
  }
  ws.replaceChildren(head, body);
}

async function submitCode({ regenerate = false } = {}) {
  const m = codeModel();
  const ta = $('#cx-prompt');
  const text = ta?.value.trim() || '';
  if ((!regenerate && !text) || jobOf(S.code)) return;
  if (!regenerate) { ta.value = ''; ta.style.height = 'auto'; }
  const thread = $('#cx-thread');
  if (!S.code || !S.code.messages.length) thread.replaceChildren();
  if (regenerate) { thread.querySelector('.cx-ai:last-child')?.remove(); while (S.code.messages.at(-1)?.role === 'assistant') S.code.messages.pop(); }
  const isNew = !S.code;
  if (isNew) S.code = { id: null, title: text, messages: [], files: {} };
  const conv = S.code; // this build, whatever is on screen later
  const tmpUser = !regenerate && renderCodeMsg({ id: 'tmp', role: 'user', content: text });
  if (tmpUser) thread.append(tmpUser);
  const live = { role: 'assistant', model: m.id, content: '', reasoning: '' };
  const ctrl = new AbortController();
  const job = { kind: 'code', conv, ctrl, tmpUser: tmpUser || null, aiEl: renderCodeMsg(live, { streaming: true }) };
  thread.append(job.aiEl);
  S.follow = true;
  const shown = () => S.code === conv && job.aiEl.isConnected;
  const bottom = () => { const sc = $('#cx-scroll'); if (sc && S.follow && shown()) sc.scrollTo({ top: sc.scrollHeight, behavior: 'instant' }); };
  const swap = (next) => { job.aiEl.replaceWith(next); job.aiEl = next; };
  bottom();
  JOBS.add(job); updateCodeSend(); renderRecents();
  let raf = 0, unread = false, over = false;
  const paint = () => { raf = 0; if (over) return; swap(renderCodeMsg(live, { streaming: true })); bottom(); };
  const schedule = () => { if (!raf) raf = document.hidden ? setTimeout(paint, 250) : requestAnimationFrame(paint); };
  try {
    const res = await fetch('/api/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.id, message: text, conversationId: conv.id, regenerate, projectId: conv.id ? undefined : S.projectId || undefined }), signal: ctrl.signal });
    if (!res.ok) { const j = await res.json().catch(() => ({})); const e = new Error(j.error || 'Request failed'); e.code = j.code; throw e; }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1];
        const data = JSON.parse((block.match(/^data: (.*)$/m) || [])[1] || '{}');
        if (ev === 'start') {
          const vis = shown();
          if (!conv.id) { Object.assign(conv, data.conversation); if (vis) { history.replaceState(null, '', '#/code/' + conv.id); const t = $('#cx-title'); if (t) t.textContent = conv.title; } }
          if (data.userMessage) { conv.messages.push(data.userMessage); if (tmpUser) { if (vis) tmpUser.replaceWith(renderCodeMsg(data.userMessage)); else tmpUser.remove(); } }
          job.tmpUser = null;
          noteConv(data.conversation);
        } else if (ev === 'delta') {
          if (data.content) live.content += data.content;
          if (data.reasoning) live.reasoning += data.reasoning;
          schedule();
        } else if (ev === 'done') {
          over = true;
          const vis = shown();
          conv.messages.push(data.message);
          conv.files = data.files || conv.files;
          setCredits(data.credits);
          JOBS.delete(job);
          if (data.conversation) noteConv(data.conversation);
          if (vis) {
            swap(renderCodeMsg(data.message, { isLast: true })); bottom();
            const wrote = (data.message.ops || []).filter((o) => o.action === 'create' || o.action === 'update');
            if (wrote.length) {
              const pages = htmlPages(conv.files);
              CX.editing = false;
              if (pages.length) { CX.tab = 'preview'; const page = wrote.find((o) => /\.html?$/i.test(o.path)); if (page && !(CX.page in conv.files)) CX.page = page.path; }
              else { CX.tab = 'code'; CX.path = wrote[0].path; }
            }
            drawWorkspace();
          } else unread = true;
        } else if (ev === 'error') { const e = new Error(data.error); e.removeUser = data.removeUserMessage; throw e; }
      }
    }
  } catch (e) {
    over = true;
    const vis = shown();
    if (e.name === 'AbortError') {
      setTimeout(async () => {
        if (!conv.id) return;
        try {
          if (S.code === conv && $('#cx-scroll') && location.hash === '#/code/' + conv.id && !jobOf(conv)) {
            const typed = $('#cx-prompt')?.value || '';
            S.code = null; await renderCode(conv.id);
            const ta = $('#cx-prompt'); if (ta && typed) { ta.value = typed; ta.dispatchEvent(new Event('input')); }
          }
          S.user = (await api('/api/me')).user; setCredits(S.user.credits);
        } catch { /* reloaded the next time it is opened */ }
      }, 600);
    } else if (vis) {
      const aiEl = job.aiEl;
      aiEl.replaceChildren(errBox(e, () => { aiEl.remove(); if (S.code?.messages.at(-1)?.role === 'user' && !e.removeUser) submitCode({ regenerate: true }); else submitCode(); }));
      if (e.removeUser || !conv.messages.length) { const p = $('#cx-prompt'); if (p && !p.value && !regenerate) { p.value = text; p.dispatchEvent(new Event('input')); } }
      if (e.removeUser) { aiEl.previousElementSibling?.classList.contains('cx-user') && aiEl.previousElementSibling.remove(); if (conv.messages.at(-1)?.role === 'user') conv.messages.pop(); }
      if (!conv.id) S.code = null;
    } else {
      if (e.removeUser && conv.messages.at(-1)?.role === 'user') conv.messages.pop();
      toast(`The build in "${(conv.title || 'your project').slice(0, 40)}" failed. ${cleanErr(e.message ?? e)}`, 'error');
    }
  } finally { endJob(job, { unread }); }
}

// ======================================================================
// Dialogs
// ======================================================================
function dialog({ title, sub, body, foot, wide }) {
  const bg = h('div', { class: 'modal-bg dlg', onmousedown: (e) => { if (e.target === bg) bg.remove(); } },
    h('div', { class: 'modal dlg-box' + (wide ? ' wide' : '') },
      h('div', { class: 'modal-head' }, h('div', { class: 'grow' }, h('b', {}, title), sub && h('small', {}, sub)), h('button', { class: 'icon-btn', title: 'Close', onclick: () => bg.remove() }, icon('x'))),
      h('div', { class: 'dlg-body' }, body),
      foot && h('div', { class: 'dlg-foot' }, foot),
    ));
  document.body.append(bg);
  setTimeout(() => bg.querySelector('input[type=text], textarea')?.focus(), 30);
  return bg;
}
const field = (label, el, hint) => h('div', { class: 'field' }, h('div', { class: 'lab' }, label), el, hint && h('small', { class: 'hint' }, hint));
const fmtSize = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1e3)) + ' KB');

// ======================================================================
// Projects
// ======================================================================
const projectById = (pid) => S.projects.find((p) => p.id === pid);
async function loadProjects() { try { S.projects = (await api('/api/projects')).projects; } catch { S.projects = []; } }
async function loadCharacters() { try { S.characters = (await api('/api/characters')).characters; } catch { S.characters = []; } }

// The project the current composer writes into: the open chat's project, or the one picked for new work.
function ctxProject(kind) {
  const conv = kind === 'chat' ? S.conv : kind === 'code' ? S.code : null;
  return projectById(conv?.id ? conv.projectId : S.projectId);
}
function projectChip(kind) {
  const p = ctxProject(kind);
  const b = h('button', { class: 'chipbtn proj-chip' + (p ? ' on' : ''), title: p ? `In project "${p.name}". It shares the project's instructions, files, chats and creations.` : 'Add this to a project',
    onclick: (e) => openProjectMenu(e.currentTarget, p?.id, async (pid) => {
      const conv = kind === 'chat' ? S.conv : kind === 'code' ? S.code : null;
      if (conv?.id) {
        try { await api('/api/conversations/' + conv.id, { method: 'PATCH', body: { projectId: pid } }); } catch (err) { return errToast(err); }
        conv.projectId = pid || null;
        const ex = S.conversations.find((x) => x.id === conv.id); if (ex) ex.projectId = pid || null;
        toast(pid ? `Added to ${projectById(pid)?.name}` : 'Removed from project');
        loadProjects();
      } else S.projectId = pid || null;
      b.replaceWith(projectChip(kind));
    }) }, icon('project'), (p || kind !== 'studio') && h('span', { class: 'nm' }, p ? p.name : 'Project'));
  if (!p && kind === 'studio') b.classList.add('icon-only');
  return b;
}
function openProjectMenu(anchor, currentId, onPick) {
  popover(anchor, h('div', { class: 'menu', style: { minWidth: '220px' } },
    h('div', { class: 'menu-cap' }, 'Project', info(INFO.project)),
    h('button', { onclick: () => { closePop(); onPick(null); } }, icon('x'), 'No project', !currentId && icon('check', 'chk')),
    S.projects.map((p) => h('button', { onclick: () => { closePop(); onPick(p.id); } }, icon('project'), h('span', { class: 'clip1' }, p.name), currentId === p.id && icon('check', 'chk'))),
    h('hr'),
    h('button', { onclick: () => { closePop(); openProjectDialog(null, (p) => onPick(p.id)); } }, icon('plus'), 'New project'),
  ), 'above');
}
function openProjectDialog(p, done) {
  const name = h('input', { type: 'text', maxlength: 80, placeholder: 'Spring campaign, Client ACME, My novel…', value: p?.name || '' });
  const desc = h('textarea', { rows: 3, maxlength: 2000, placeholder: 'What is this project about? Who is it for?' }); desc.value = p?.description || '';
  const save = h('button', { class: 'btn primary', onclick: async () => {
    if (!name.value.trim()) return name.focus();
    save.disabled = true;
    try {
      const r = p ? await api('/api/projects/' + p.id, { method: 'PATCH', body: { name: name.value, description: desc.value } }) : await api('/api/projects', { method: 'POST', body: { name: name.value, description: desc.value } });
      await loadProjects(); bg.remove(); done?.(r.project);
    } catch (e) { errToast(e); save.disabled = false; }
  } }, p ? 'Save' : 'Create project');
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); });
  const bg = dialog({ title: p ? 'Edit project' : 'New project', sub: 'A project keeps instructions, files, chats and creations together.', body: [field('Name', name), field('Description', desc, 'Optional. The AI reads this in every chat in the project.')], foot: [h('button', { class: 'btn ghost', onclick: () => bg.remove() }, 'Cancel'), save] });
}

function projectCard(p) {
  const cover = h('div', { class: 'pj-cover n' + Math.min(p.cover.length, 3) }, p.cover.length ? p.cover.map((u) => h('img', { src: u, alt: '', loading: 'lazy' })) : icon('project'));
  return h('a', { class: 'pj-card', href: '#/projects/' + p.id },
    cover,
    h('div', { class: 'body' }, h('b', {}, p.name), h('small', { class: 'clip2' }, p.description || 'No description yet'),
      h('div', { class: 'pj-counts' }, h('span', {}, icon('chat'), p.counts.chats), h('span', {}, icon('image'), p.counts.creations), h('span', {}, icon('doc'), p.counts.files))),
  );
}

function projectRow(p) {
  return h('a', { class: 'pj-row', href: '#/projects/' + p.id },
    h('div', { class: 'pj-thumb' }, p.cover.length ? h('img', { src: p.cover[0], alt: '', loading: 'lazy' }) : icon('project')),
    h('div', { class: 'txt' }, h('b', {}, p.name), h('small', {}, p.description || 'No description yet')),
    h('div', { class: 'pj-counts' }, h('span', { title: 'Chats' }, icon('chat'), p.counts.chats), h('span', { title: 'Images and videos' }, icon('image'), p.counts.creations), h('span', { title: 'Files' }, icon('doc'), p.counts.files)),
    icon('arrow', 'go'),
  );
}
// Grid or list, remembered on this device.
function viewToggle(cur, set) {
  return h('div', { class: 'seg view-toggle' },
    h('button', { class: cur === 'grid' ? 'on' : '', title: 'Grid view', 'data-view': 'grid', onclick: () => set('grid') }, icon('grid')),
    h('button', { class: cur === 'list' ? 'on' : '', title: 'List view', 'data-view': 'list', onclick: () => set('list') }, icon('list')),
  );
}
let PJ = { p: null, tab: 'chats' };
async function renderProjects(pid) {
  const main = $('#main');
  dropTarget = null;
  if (pid) return renderProject(pid);
  await loadProjects();
  if (location.hash !== '#/projects') return;
  const newBtn = h('button', { class: 'btn primary', onclick: () => openProjectDialog(null, (p) => (location.hash = '#/projects/' + p.id)) }, icon('plus'), 'New project');
  const asList = store.get('pj-view', 'grid') === 'list';
  main.replaceChildren(topbar(), h('div', { class: 'scroll' }, h('div', { class: 'page' },
    h('div', { class: 'toolbar' }, h('h1', { style: { margin: 0, flex: 1 } }, 'Projects'), S.projects.length > 0 && viewToggle(asList ? 'list' : 'grid', (v) => { store.set('pj-view', v); renderProjects(); }), newBtn),
    h('p', { class: 'sub' }, 'Give a project its instructions and files once. Every chat, image and video you add to it shares that background, and the AI answers with all of it in mind.'),
    S.projects.length ? (asList ? h('div', { class: 'pj-list' }, S.projects.map(projectRow)) : h('div', { class: 'pj-grid' }, S.projects.map(projectCard))) : h('div', { class: 'empty big' }, h('div', { class: 'empty-ico' }, icon('project')), h('b', {}, 'No projects yet'), h('div', {}, 'Create one for a client, a campaign or anything you keep coming back to.'), h('button', { class: 'btn primary', style: { marginTop: '8px' }, onclick: () => newBtn.click() }, icon('plus'), 'New project')),
  )));
}

async function renderProject(pid) {
  const main = $('#main');
  let p;
  try { p = (await api('/api/projects/' + pid)).project; } catch { toast('Project not found', 'error'); location.hash = '#/projects'; return; }
  if (location.hash !== '#/projects/' + pid) return;
  if (PJ.p?.id !== pid) PJ.tab = 'chats';
  PJ.p = p;
  const reload = () => renderProject(pid);
  const patch = async (body) => { try { await api('/api/projects/' + pid, { method: 'PATCH', body }); } catch (e) { errToast(e); } await reload(); };
  const startIn = (hash, text) => { S.projectId = pid; if (text != null) { if (hash === '#/code') S.pendingCode = text; else if (hash === '#/chat') S.pendingChat = text; else S.draft[hash.slice(2)] = text; } S.conv = null; location.hash = hash; };

  // composer
  const ta = h('textarea', { rows: 1, placeholder: `Start a new chat in ${p.name}` });
  const send = h('button', { class: 'send', title: 'Start chat', disabled: true, onclick: () => startIn('#/chat', ta.value.trim()) }, icon('up'));
  ta.addEventListener('input', () => { autoGrow(ta); send.disabled = !ta.value.trim(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (ta.value.trim()) send.click(); } });
  const composer = h('div', { class: 'bar pj-bar' },
    h('div', { class: 'bar-top' }, ta),
    h('div', { class: 'bar-row' },
      h('button', { class: 'chipbtn', onclick: () => startIn('#/image') }, icon('image'), 'New image'),
      h('button', { class: 'chipbtn', onclick: () => startIn('#/video') }, icon('video'), 'New video'),
      h('button', { class: 'chipbtn', onclick: () => startIn('#/code') }, icon('terminal'), 'New code'),
      h('div', { class: 'grow' }), micButton(ta), send));

  // chats and creations
  const body = h('div', { class: 'pj-list' });
  const drawBody = () => {
    $$('.pj-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === PJ.tab));
    if (PJ.tab === 'chats') {
      body.replaceChildren(...(p.conversations.length ? p.conversations.map((c) => h('div', { class: 'pj-row' },
        h('a', { href: (c.kind === 'code' ? '#/code/' : '#/c/') + c.id }, convMark(c), h('span', { class: 'grow clip1' }, c.title), h('small', {}, dayLabel(c.updatedAt))),
        h('button', { class: 'icon-btn sm', title: 'Remove from project', onclick: async () => { await api('/api/conversations/' + c.id, { method: 'PATCH', body: { projectId: null } }); const ex = S.conversations.find((x) => x.id === c.id); if (ex) ex.projectId = null; reload(); } }, icon('x')),
      )) : [h('div', { class: 'empty' }, 'No chats yet. Start one above, or add chats you already have.')]));
    } else {
      const tiles = p.generations.flatMap((g) => (g.media?.length ? g.media.map((x) => ({ g, x })) : [{ g }]));
      body.replaceChildren(tiles.length ? h('div', { class: 'recent' }, tiles.map(({ g, x }) => h('div', { class: 'tile' + (g.mode === 'video' ? ' v' : '') },
        !x ? h('div', { class: 'pj-pending' }, g.status === 'pending' ? h('span', { class: 'spin' }) : icon('x'), h('small', { class: 'clip2' }, g.status === 'pending' ? 'Still generating' : 'Failed'))
          : x.type === 'video' ? h('video', { src: x.url, muted: true, preload: 'metadata', onclick: () => openLightbox(x, g), style: { cursor: 'zoom-in' } }) : h('img', { src: x.url, alt: g.prompt, loading: 'lazy', onclick: () => openLightbox(x, g) }),
        h('div', { class: 'cap' }, g.displayPrompt || g.prompt),
        h('div', { class: 'over' }, h('button', { class: 'icon-btn sm', title: 'Remove from project', onclick: async () => { await api('/api/generations/' + g.id, { method: 'PATCH', body: { projectId: null } }); S.gens[g.mode] = null; reload(); } }, icon('x'))),
      ))) : h('div', { class: 'empty' }, 'No images or videos yet. Create one from here, or add ones you already made.'));
    }
  };
  const tabs = h('div', { class: 'tabs pj-tabs' },
    h('button', { 'data-tab': 'chats', onclick: () => { PJ.tab = 'chats'; drawBody(); } }, `Chats ${p.conversations.length}`),
    h('button', { 'data-tab': 'creations', onclick: () => { PJ.tab = 'creations'; drawBody(); } }, `Images & videos ${p.generations.length}`));
  const addBtn = h('button', { class: 'btn sm', onclick: () => (PJ.tab === 'chats' ? pickChatsForProject(p, reload) : pickCreationsForProject(p, reload)) }, icon('plus'), 'Add existing');

  // instructions and files
  const editInstr = () => {
    const t = h('textarea', { rows: 12, maxlength: 8000, placeholder: 'How should the AI work in this project?\n\nFor example: who the audience is, the tone of voice, facts about the brand, what to avoid, the format you want answers in.' }); t.value = p.instructions;
    const bg = dialog({ title: 'Project instructions', sub: 'Followed in every chat in this project.', wide: true, body: t, foot: [h('button', { class: 'btn ghost', onclick: () => bg.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { bg.remove(); await patch({ instructions: t.value }); } }, 'Save')] });
  };
  const addFilesToProject = (files) => {
    toast(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);
    uploadFiles(files).then((got) => (got.length ? patch({ addFileIds: got.map((f) => f.id) }) : null)).catch(errToast);
  };
  dropTarget = addFilesToProject;
  const side = h('aside', { class: 'pj-side' },
    h('div', { class: 'pj-panel' },
      h('div', { class: 'pj-ph' }, h('b', {}, 'Instructions'), h('button', { class: 'btn ghost sm', onclick: editInstr }, icon('edit'), p.instructions ? 'Edit' : 'Add')),
      p.instructions ? h('p', { class: 'pj-instr', onclick: editInstr }, p.instructions) : h('p', { class: 'pj-none' }, 'Tell the AI how to work here: audience, tone, brand facts, what to avoid.')),
    h('div', { class: 'pj-panel' },
      h('div', { class: 'pj-ph' }, h('b', {}, 'Files'), h('button', { class: 'btn ghost sm', onclick: () => pickFiles('', true, addFilesToProject) }, icon('upload'), 'Add')),
      p.files.length ? h('div', { class: 'pj-files' }, p.files.map((f) => h('div', { class: 'pj-file' },
        f.kind === 'image' ? h('img', { src: `/api/files/${f.id}/raw`, alt: '' }) : h('span', { class: 'fi' }, icon(f.kind === 'video' ? 'video' : 'doc')),
        h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'clip1' }, f.name), h('small', {}, `${f.kind === 'document' ? (f.pages ? f.pages + ' pages' : 'Document') : f.kind === 'image' ? 'Image' : 'Video'} · ${fmtSize(f.size)}`)),
        h('button', { class: 'icon-btn sm', title: 'Remove', onclick: () => patch({ removeFileId: f.id }) }, icon('x')),
      ))) : h('p', { class: 'pj-none' }, 'Brand guides, briefs, product sheets, reference photos. PDF, Word, text, code and images. Drop files anywhere on this page.')),
    h('div', { class: 'pj-note' }, icon('sparkle'), 'Chats in this project read the instructions, the files, the other chats and the prompts of every image and video in it.'),
  );

  main.replaceChildren(topbar(), h('div', { class: 'scroll' }, h('div', { class: 'page pj-page' },
    h('a', { class: 'pj-back', href: '#/projects' }, icon('arrow'), 'All projects'),
    h('div', { class: 'toolbar', style: { alignItems: 'flex-start' } },
      h('div', { style: { flex: 1, minWidth: 0 } }, h('h1', { style: { margin: 0 } }, p.name), h('p', { class: 'sub', style: { margin: '6px 0 0' } }, p.description || 'No description yet.')),
      h('button', { class: 'btn sm', onclick: () => openProjectDialog(p, reload) }, icon('edit'), 'Edit'),
      h('button', { class: 'icon-btn', title: 'More', onclick: (e) => popover(e.currentTarget, h('div', { class: 'menu' },
        h('button', { style: { color: 'var(--danger)' }, onclick: async () => { closePop(); if (!confirm(`Delete the project "${p.name}"? Its chats, images and videos are kept and only leave the project.`)) return; await api('/api/projects/' + pid, { method: 'DELETE' }); if (S.projectId === pid) S.projectId = null; await Promise.all([loadProjects(), loadConversations()]); location.hash = '#/projects'; } }, icon('trash'), 'Delete project'))) }, icon('dots'))),
    h('div', { class: 'pj-cols' },
      h('div', { class: 'pj-main' }, composer, h('div', { class: 'toolbar', style: { margin: '22px 0 12px' } }, tabs, addBtn), body),
      side),
  )));
  drawBody();
}

function pickChatsForProject(p, done) {
  const picked = new Set();
  const list = S.conversations.filter((c) => !c.temp && c.projectId !== p.id);
  const add = h('button', { class: 'btn primary', disabled: true, onclick: async () => { bg.remove(); await api('/api/projects/' + p.id, { method: 'PATCH', body: { addConversationIds: [...picked] } }); await loadConversations(); done(); } }, 'Add to project');
  const bg = dialog({ title: 'Add chats to this project', sub: 'The project will use what was said in them.', body: list.length ? h('div', { class: 'pick-rows' }, list.map((c) => {
    const row = h('button', { class: 'pick-row', onclick: () => { picked.has(c.id) ? picked.delete(c.id) : picked.add(c.id); row.classList.toggle('on', picked.has(c.id)); add.disabled = !picked.size; add.textContent = picked.size ? `Add ${picked.size} to project` : 'Add to project'; } },
      h('span', { class: 'box' }, icon('check')), icon(c.kind === 'code' ? 'terminal' : 'chat'), h('span', { class: 'grow clip1' }, c.title), c.projectId && projectById(c.projectId) && h('span', { class: 'tag dim' }, projectById(c.projectId).name));
    return row;
  })) : h('div', { class: 'empty' }, 'All your chats are already in this project.'), foot: [h('button', { class: 'btn ghost', onclick: () => bg.remove() }, 'Cancel'), add] });
}
async function pickCreationsForProject(p, done) {
  const picked = new Set();
  let gens = [];
  try { gens = (await api('/api/generations?limit=200')).generations.filter((g) => g.projectId !== p.id && g.media?.length); } catch (e) { return errToast(e); }
  const add = h('button', { class: 'btn primary', disabled: true, onclick: async () => { bg.remove(); await api('/api/projects/' + p.id, { method: 'PATCH', body: { addGenerationIds: [...picked] } }); S.gens.image = S.gens.video = null; done(); } }, 'Add to project');
  const bg = dialog({ title: 'Add images and videos to this project', sub: 'The project will know what you made and the prompts you used.', wide: true, body: gens.length ? h('div', { class: 'recent pick-grid' }, gens.map((g) => {
    const x = g.media[0];
    const t = h('button', { class: 'tile', title: g.displayPrompt || g.prompt, onclick: () => { picked.has(g.id) ? picked.delete(g.id) : picked.add(g.id); t.classList.toggle('on', picked.has(g.id)); add.disabled = !picked.size; add.textContent = picked.size ? `Add ${picked.size} to project` : 'Add to project'; } },
      x.type === 'video' ? h('video', { src: x.url, muted: true, preload: 'metadata' }) : h('img', { src: x.url, alt: '', loading: 'lazy' }), h('span', { class: 'box' }, icon('check')), g.media.length > 1 && h('span', { class: 'cnt' }, g.media.length));
    return t;
  })) : h('div', { class: 'empty' }, 'Nothing to add yet. Create an image or a video first.'), foot: [h('button', { class: 'btn ghost', onclick: () => bg.remove() }, 'Cancel'), add] });
}
// "Add to project" for a creation card.
function genProjectBtn(g) {
  if (!g.id || g.id === 'tmp') return null;
  return h('button', { class: 'icon-btn sm', title: 'Add to a project', onclick: (e) => openProjectMenu(e.currentTarget, g.projectId, async (pid) => {
    try { await api('/api/generations/' + g.id, { method: 'PATCH', body: { projectId: pid } }); } catch (err) { return errToast(err); }
    g.projectId = pid || undefined; toast(pid ? `Added to ${projectById(pid)?.name}` : 'Removed from project'); loadProjects();
  }) }, icon('project'));
}

// ======================================================================
// Characters: a person, product or logo saved once and reused everywhere
// ======================================================================
const KIND = { person: ['Person', 'user'], product: ['Product', 'bag'], brand: ['Brand logo', 'type'] };
// What the saved thing is called for each type, so a product is never called a character.
const KIND_WORD = { person: 'character', product: 'product', brand: 'brand logo' };
const KIND_TEXT = {
  person: { name: 'Name, such as "Maya"', notes: 'Optional details to always keep, such as "round glasses, small scar on left eyebrow"' },
  product: { name: 'Product name, such as "Trail bottle 750 ml"', notes: 'Optional details to always keep, such as "matte black, silver cap, logo on the front"' },
  brand: { name: 'Brand name', notes: 'Optional details to always keep, such as "always in navy blue, never stretched"' },
};
const subjectNoun = (kinds) => (!kinds?.length || kinds.includes('person') ? 'character' : kinds.length === 1 ? KIND_WORD[kinds[0]] : kinds.map((k) => KIND_WORD[k]).join(' or '));
const charThumb = (c) => (c.photos[0] ? `/api/files/${c.photos[0].id}/raw` : '');
const charById = (cid) => S.characters.find((c) => c.id === cid);

// Image models take two reference pictures at most, so several photos travel as one sheet.
async function buildSheet(photos, name) {
  const imgs = await Promise.all(photos.map((p) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not read a photo')); im.src = `/api/files/${p.id}/raw`; })));
  const n = imgs.length, cols = 2, rows = n > 2 ? 2 : 1, cell = 768, gap = 12;
  const cv = document.createElement('canvas'); cv.width = cols * cell + gap; cv.height = rows * cell + (rows - 1) * gap;
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  imgs.forEach((im, i) => {
    const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - r * cols : cols;
    const x0 = (i % cols) * (cell + gap) + (inRow === 1 && cols === 2 ? (cell + gap) / 2 : 0), y0 = r * (cell + gap);
    const s = Math.min(cell / im.naturalWidth, cell / im.naturalHeight), w = im.naturalWidth * s, hh = im.naturalHeight * s;
    cx.drawImage(im, x0 + (cell - w) / 2, y0 + (cell - hh) / 2, w, hh);
  });
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
  const [f] = await uploadFiles([new File([blob], `${fileSlug(name) || 'character'}-sheet.jpg`, { type: 'image/jpeg' })]);
  return f?.id;
}

function openCharacterDialog(ch, { kind, kinds: allowed, onSave } = {}) {
  const types = Object.entries(KIND).filter(([k]) => ch || !allowed?.length || allowed.includes(k));
  const st = { kind: ch?.kind || kind || 'person', photos: (ch?.photos || []).map((p) => ({ ...p })), consent: !!ch && ch.kind === 'person', changed: false };
  const name = h('input', { type: 'text', maxlength: 60, placeholder: 'Name', value: ch?.name || '' });
  const notes = h('textarea', { rows: 2, maxlength: 600, placeholder: 'Optional details to always keep, such as "round glasses, small scar on left eyebrow"' }); notes.value = ch?.notes || '';
  const kinds = h('div', { class: 'opt-row' });
  const photos = h('div', { class: 'ch-photos' });
  const consentBox = h('label', { class: 'consent' });
  const save = h('button', { class: 'btn primary' });
  const saveLabel = () => (ch ? 'Save' : 'Save ' + KIND_WORD[st.kind]);
  const heading = () => (ch ? 'Edit ' : 'New ') + KIND_WORD[st.kind];
  const hint = h('small', { class: 'hint' });
  const check = () => { save.disabled = !name.value.trim() || !st.photos.filter((p) => p.id).length || st.photos.some((p) => p.loading) || (st.kind === 'person' && !st.consent); };
  const addPhotos = async (files) => {
    files = files.filter((f) => f.type.startsWith('image/')).slice(0, 4 - st.photos.length);
    if (!files.length) return;
    const pend = files.map((f) => ({ name: f.name, preview: URL.createObjectURL(f), loading: true }));
    st.photos.push(...pend); st.changed = true; draw();
    try { const got = await uploadFiles(files); pend.forEach((p, i) => { const f = got.find((x) => x.name === p.name) || got[i]; if (f) Object.assign(p, f, { loading: false }); else p.failed = true; }); } catch (e) { errToast(e); pend.forEach((p) => (p.failed = true)); }
    st.photos = st.photos.filter((p) => !p.failed); draw();
  };
  function draw() {
    kinds.replaceChildren(...types.map(([k, [l, ic]]) => h('button', { class: 'opt' + (st.kind === k ? ' on' : ''), onclick: () => { st.kind = k; draw(); } }, icon(ic), l)));
    photos.replaceChildren(...st.photos.map((p) => h('div', { class: 'ch-photo' + (p.loading ? ' loading' : '') }, h('img', { src: refThumb(p), alt: '' }), p.loading && h('span', { class: 'spin' }), h('button', { class: 'x', title: 'Remove', onclick: () => { st.photos = st.photos.filter((x) => x !== p); st.changed = true; draw(); } }, icon('x')))),
      st.photos.length < 4 && h('button', { class: 'ch-photo add', onclick: () => pickFiles('image/*', true, addPhotos) }, icon('plus'), h('small', {}, st.photos.length ? 'Add' : 'Add photos')));
    hint.textContent = st.kind === 'person' ? '1 to 4 clear photos of the same person. A front view plus a side view and a full-body shot works best.' : st.kind === 'brand' ? '1 to 4 images of the logo. A flat version on a plain background works best.' : '1 to 4 photos of the product from different sides on a plain background.';
    name.placeholder = KIND_TEXT[st.kind].name; notes.placeholder = KIND_TEXT[st.kind].notes;
    save.textContent = saveLabel();
    const title = bg?.querySelector('.modal-head b'); if (title) title.textContent = heading();
    kinds.parentElement.style.display = types.length > 1 ? '' : 'none';
    consentBox.style.display = st.kind === 'person' ? '' : 'none';
    consentBox.replaceChildren(h('input', { type: 'checkbox', checked: st.consent, onchange: (e) => { st.consent = e.target.checked; check(); } }), h('span', {}, 'This is me, or I have this person\'s permission to use their likeness.'));
    check();
  }
  name.addEventListener('input', check);
  save.onclick = async () => {
    save.disabled = true; save.textContent = 'Saving…';
    try {
      const ids = st.photos.map((p) => p.id);
      const body = { name: name.value, kind: st.kind, notes: notes.value, consent: st.consent };
      if (!ch || st.changed) { body.fileIds = ids; body.sheetId = ids.length > 1 ? await buildSheet(st.photos, name.value).catch(() => undefined) : undefined; }
      const r = ch ? await api('/api/characters/' + ch.id, { method: 'PATCH', body }) : await api('/api/characters', { method: 'POST', body });
      await loadCharacters(); bg.remove(); toast(`${r.character.name} saved`); onSave?.(r.character);
    } catch (e) { errToast(e); save.textContent = saveLabel(); check(); }
  };
  const bg = dialog({ title: heading(), sub: 'Save it once, then pick it in any image or video tool.', body: [field('Type', kinds), field('Photos', photos), hint, field('Name', name), field('Notes', notes), consentBox], foot: [h('button', { class: 'btn ghost', onclick: () => bg.remove() }, 'Cancel'), save] });
  bg.ondragover = (e) => e.preventDefault();
  bg.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); addPhotos([...e.dataTransfer.files]); };
  draw();
}

function useCharacter(c, mode) {
  S.studio[mode].characterId = c.id;
  if (mode === 'image') { const m = studioModel('image'); if (!m?.image.edit) { const alt = ['nano-banana-2', 'seedream-5.0-pro', 'gpt-image-2'].map(byId).find((x) => x?.image?.edit) || S.models.find((x) => x.type === 'image' && x.image.edit); if (alt) { S.studio.image.modelId = alt.id; saveStudio('image'); } } }
  location.hash = '#/' + mode;
}
let charTab = 'all';
async function renderCharacters() {
  const main = $('#main');
  dropTarget = null;
  await loadCharacters();
  if (location.hash !== '#/characters') return;
  const list = S.characters.filter((c) => charTab === 'all' || c.kind === charTab);
  const newBtn = h('button', { class: 'btn primary', onclick: () => openCharacterDialog(null, { kind: charTab === 'all' ? 'person' : charTab, onSave: renderCharacters }) }, icon('plus'), 'New character');
  const card = (c) => h('div', { class: 'ch-card' },
    h('div', { class: 'ph' + (c.kind !== 'person' ? ' fit' : ''), onclick: () => openCharacterDialog(c, { onSave: renderCharacters }) }, h('img', { src: charThumb(c), alt: c.name, loading: 'lazy' }), h('span', { class: 'tag dim' }, KIND[c.kind][0]), c.photos.length > 1 && h('span', { class: 'cnt' }, `${c.photos.length} photos`)),
    h('div', { class: 'body' }, h('b', { class: 'clip1' }, c.name),
      h('div', { class: 'acts' },
        h('button', { class: 'btn sm', onclick: () => useCharacter(c, 'image') }, icon('image'), 'Image'),
        h('button', { class: 'btn sm', onclick: () => useCharacter(c, 'video') }, icon('video'), 'Video'),
        h('button', { class: 'icon-btn sm', title: 'More', onclick: (e) => popover(e.currentTarget, h('div', { class: 'menu' },
          h('button', { onclick: () => { closePop(); openCharacterDialog(c, { onSave: renderCharacters }); } }, icon('edit'), 'Edit'),
          h('button', { style: { color: 'var(--danger)' }, onclick: async () => { closePop(); if (!confirm(`Delete ${c.name}?`)) return; await api('/api/characters/' + c.id, { method: 'DELETE' }); for (const k of ['image', 'video']) if (S.studio[k].characterId === c.id) S.studio[k].characterId = null; renderCharacters(); } }, icon('trash'), 'Delete'))) }, icon('dots')))),
  );
  const tools = S.apps.filter((a) => ['character', 'portrait', 'fashion', 'product'].includes(a.group)).slice(0, 12);
  main.replaceChildren(topbar(), h('div', { class: 'scroll' }, h('div', { class: 'page' },
    h('div', { class: 'toolbar' }, h('h1', { style: { margin: 0, flex: 1 } }, 'Characters'), newBtn),
    h('p', { class: 'sub' }, 'Save a person, a product or a logo once. Pick it in Image, Video or any app and it stays the same across scenes, outfits and poses.'),
    h('div', { class: 'toolbar' }, h('div', { class: 'tabs' }, [['all', 'All'], ['person', 'People'], ['product', 'Products'], ['brand', 'Logos']].map(([k, l]) => h('button', { class: charTab === k ? 'on' : '', onclick: () => { charTab = k; renderCharacters(); } }, l)))),
    list.length ? h('div', { class: 'ch-grid' }, list.map(card)) : h('div', { class: 'empty big' }, h('div', { class: 'empty-ico' }, icon('face')), h('b', {}, charTab === 'all' ? 'No characters yet' : 'Nothing here yet'), h('div', {}, 'Upload 1 to 4 photos and give it a name.'), h('button', { class: 'btn primary', style: { marginTop: '8px' }, onclick: () => newBtn.click() }, icon('plus'), 'New character')),
    tools.length > 0 && h('h2', { class: 'h2' }, 'What you can do with a character'),
    tools.length > 0 && h('div', { class: 'app-grid' }, tools.map(appCard)),
  )));
}

// Character picker in the Image and Video bars.
function characterChip(mode) {
  const st = S.studio[mode];
  const c = charById(st.characterId); if (!c) st.characterId = null;
  const redraw = () => { b.replaceWith(characterChip(mode)); updateGo(); };
  const b = h('button', { class: 'chipbtn char-chip' + (c ? ' on' : ''), title: c ? `${c.name} stays the same in everything you generate` : 'Keep the same person, product or logo in every result', onclick: (e) => popover(e.currentTarget, h('div', { class: 'menu', style: { minWidth: '240px' } },
    h('div', { class: 'menu-cap' }, 'Character', info(INFO.character)),
    h('button', { onclick: () => { closePop(); st.characterId = null; redraw(); } }, icon('x'), 'None', !c && icon('check', 'chk')),
    S.characters.map((x) => h('button', { onclick: () => {
      closePop(); st.characterId = x.id;
      const m = studioModel(mode);
      if (mode === 'image' && !m.image.edit) toast(`${shortName(m)} cannot use reference photos. Pick Nano Banana 2, Seedream or GPT Image to keep ${x.name} the same.`, 'error');
      if (mode === 'video' && !m.video.imageToVideo) toast(`${shortName(m)} cannot start from a photo, so ${x.name} may not look the same. Pick a Seedance model.`, 'error');
      redraw();
    } }, h('img', { class: 'mini', src: charThumb(x), alt: '' }), h('span', { class: 'clip1' }, x.name), h('span', { class: 'tag dim' }, KIND[x.kind][0]), c?.id === x.id && icon('check', 'chk'))),
    h('hr'),
    h('button', { onclick: () => { closePop(); openCharacterDialog(null, { onSave: (n) => { st.characterId = n.id; redraw(); } }); } }, icon('plus'), 'New character'),
    S.characters.length > 0 && h('a', { href: '#/characters', onclick: closePop }, icon('face'), 'Manage characters'),
  ), 'above') }, c ? h('img', { class: 'mini', src: charThumb(c), alt: '' }) : icon('face'), c && h('span', { class: 'nm' }, c.name));
  if (!c) b.classList.add('icon-only');
  return b;
}

installExpandEditors();
installResizers();
installEnhancers();
boot().catch((e) => { document.body.append(h('div', { class: 'err', style: { margin: '20px' } }, 'Could not start: ' + e.message)); });

// Shared with docs.js (Docs Studio).
const refreshRecents = () => loadConversations().then(renderRecents).catch(() => {});
export { h, $, $$, icon, S, store, api, toast, errToast, cleanErr, popover, closePop, dialog, field, pickFiles, uploadFiles, downloadBlob, fmtSize, info, topbar, fmtCredits, setCredits, downloadFiles, openLightbox, byId, modelLogo, shortName, refreshRecents };
