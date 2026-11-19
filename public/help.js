// Help centre: searchable articles at #/help and #/help/<article>[/<section>].
// Works inside the signed-in app and on the public site (visitors). Content lives in help-content.js.
import { h, $, icon, S, topbar } from './app.js';
import { CATS, ARTICLES } from './help-content.js';

if (!$('#help-css')) document.head.append(h('link', { id: 'help-css', rel: 'stylesheet', href: '/help.css' }));

const byId = (id) => ARTICLES.find((a) => a.id === id);
const catOf = (id) => CATS.find((c) => c.id === id);
const support = () => S.config?.supportEmail || 'info@adxl.ai';
const bodyHtml = (a) => a.body.replaceAll('{{support}}', support());
// Plain text of each article for search, built once.
let INDEX = null;
function index() {
  if (INDEX) return INDEX;
  const tmp = document.createElement('div');
  INDEX = ARTICLES.map((a) => {
    tmp.innerHTML = bodyHtml(a);
    // Section titles, so a search can jump straight to the right part of an article.
    const secs = [...tmp.querySelectorAll('h2[id]')].map((x) => ({ id: x.id, title: x.textContent }));
    return { a, title: a.title.toLowerCase(), meta: (a.sum + ' ' + a.kw).toLowerCase(), text: tmp.textContent.replace(/\s+/g, ' '), secs };
  });
  return INDEX;
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function search(q) {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const out = [];
  for (const it of index()) {
    const low = it.text.toLowerCase();
    let score = 0;
    for (const w of words) {
      const t = it.title.includes(w) ? 6 : 0, m = it.meta.includes(w) ? 3 : 0;
      const b = low.split(w).length - 1;
      if (!t && !m && !b) { score = 0; break; } // every word must appear somewhere
      score += t + m + Math.min(b, 5);
    }
    if (!score) continue;
    const sec = it.secs.find((s) => words.some((w) => s.title.toLowerCase().includes(w)));
    const at = Math.max(0, low.indexOf(words.find((w) => low.includes(w)) || ''));
    let start = Math.max(0, at - 60);
    if (start) { const sp = it.text.indexOf(' ', start); if (sp > -1 && sp < at) start = sp + 1; } // begin on a whole word
    let snip = (start ? '…' : '') + it.text.slice(start, start + 170).trim() + '…';
    snip = esc(snip);
    for (const w of words) snip = snip.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
    out.push({ a: it.a, score, sec, snip });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 12);
}
const href = (a, sec) => '#/help/' + a.id + (sec ? '/' + sec : '');

let lastQ = '';
function searchBox(onResults) {
  const input = h('input', { type: 'search', placeholder: 'Search help, like "refund"', value: lastQ, 'aria-label': 'Search help', autocomplete: 'off' });
  const box = h('label', { class: 'hp-search' }, icon('search'), input);
  input.addEventListener('input', () => { lastQ = input.value; onResults(input.value.trim()); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; lastQ = ''; onResults(''); } if (e.key === 'Enter') { const first = document.querySelector('.hp-results a'); if (first) location.hash = first.getAttribute('href'); } });
  return { box, input };
}
function resultsList(q) {
  const res = search(q);
  if (!res.length) return h('div', { class: 'hp-results empty' }, h('p', {}, `Nothing found for "${q}".`), h('p', { class: 'hp-muted' }, 'Try a shorter word, or browse the topics below. ', h('a', { href: '#/help/contact' }, 'Contact support')));
  return h('div', { class: 'hp-results' }, res.map((r) => h('a', { href: href(r.a, r.sec?.id), class: 'hp-result' },
    h('span', { class: 'hp-rcat' }, catOf(r.a.cat).name, r.sec ? ` · ${r.sec.title}` : ''),
    h('b', {}, r.a.title),
    h('small', { html: r.snip }))));
}

// The page frame: inside the app (topbar + scroll) or on the public site (the landing page's own header and footer).
function mount(content, pub) {
  if (pub) { $('#app').replaceChildren(h('div', { class: 'lp hp-public' }, pub.nav(), content, pub.footer())); return $('.lp'); }
  const scroll = h('div', { class: 'scroll hp-scroll' }, content);
  $('#main').replaceChildren(topbar(), scroll);
  return scroll;
}

function renderHome(pub) {
  const out = h('div', { class: 'hp-out' });
  const cats = h('div', { class: 'hp-cats' }, CATS.map((c) => h('section', { class: 'hp-cat', id: 'hp-cat-' + c.id },
    h('div', { class: 'hp-cat-head' }, h('span', { class: 'hp-cat-ic' }, icon(c.icon)), h('div', {}, h('h2', {}, c.name), h('p', {}, c.blurb))),
    h('ul', {}, ARTICLES.filter((a) => a.cat === c.id).map((a) => h('li', {}, h('a', { href: href(a) }, h('b', {}, a.title), h('small', {}, a.sum))))))));
  const show = (q) => { out.replaceChildren(...(q ? [resultsList(q)] : [])); cats.hidden = !!q; };
  const { box, input } = searchBox(show);
  const page = h('div', { class: 'hp hp-home' },
    h('header', { class: 'hp-hero' },
      h('div', { class: 'hp-eyebrow' }, icon('help'), 'Scenly Help'),
      h('h1', {}, 'How can we help?'),
      h('p', {}, 'Guides to every part of Scenly, in plain language.'),
      box),
    h('div', { class: 'hp-quick' }, ['welcome', 'credits', 'plans', 'troubleshooting'].map(byId).map((a) => h('a', { href: href(a), class: 'hp-chip' }, a.title))),
    out, cats,
    contactCard());
  const sc = mount(page, pub);
  show(lastQ.trim());
  sc?.scrollTo?.({ top: 0 });
  if (matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 0);
}

function contactCard() {
  return h('div', { class: 'hp-contact' }, icon('mail'), h('div', { class: 'grow' }, h('b', {}, 'Still need help?'), h('span', {}, 'Email the Scenly team and we will get back to you.')), h('a', { class: 'btn', href: 'mailto:' + support() }, 'Email support'));
}

function renderArticle(a, sec, pub) {
  const cat = catOf(a.cat);
  const i = ARTICLES.indexOf(a);
  const prev = ARTICLES[i - 1], next = ARTICLES[i + 1];
  const body = h('div', { class: 'hp-body', html: bodyHtml(a) });
  const secs = [...body.querySelectorAll('h2[id]')];
  // In-page links (#/help/x/section) keep working as normal hash links; section ids are prefixed to stay unique.
  secs.forEach((s) => { s.dataset.sec = s.id; s.id = 'hp-' + s.id; });
  const nav = h('nav', { class: 'hp-nav', 'aria-label': 'Help topics' },
    h('a', { class: 'hp-nav-home', href: '#/help' }, icon('help'), 'Help home'),
    CATS.map((c) => h('div', { class: 'hp-nav-grp' }, h('b', {}, c.name),
      ARTICLES.filter((x) => x.cat === c.id).map((x) => h('a', { href: href(x), class: x === a ? 'on' : '' }, x.title)))));
  const toc = secs.length > 2 && h('div', { class: 'hp-toc' }, h('b', {}, 'On this page'), secs.map((s) => h('a', { href: href(a, s.dataset.sec), onclick: (e) => { e.preventDefault(); history.replaceState(null, '', href(a, s.dataset.sec)); s.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, s.textContent)));
  const results = h('div', { class: 'hp-out' });
  lastQ = '';
  const { box } = searchBox((q) => { results.replaceChildren(...(q ? [resultsList(q)] : [])); });
  const page = h('div', { class: 'hp hp-art' },
    nav,
    h('article', { class: 'hp-main' },
      h('div', { class: 'hp-top' }, h('div', { class: 'hp-crumbs' }, h('a', { href: '#/help' }, 'Help'), icon('arrow'), h('a', { href: '#/help', onclick: () => setTimeout(() => document.getElementById('hp-cat-' + cat.id)?.scrollIntoView({ block: 'start' }), 60) }, cat.name)), box),
      results,
      h('h1', {}, a.title),
      h('p', { class: 'hp-lead' }, a.sum),
      toc,
      body,
      h('div', { class: 'hp-pn' },
        prev ? h('a', { href: href(prev), class: 'prev' }, h('small', {}, 'Previous'), h('b', {}, prev.title)) : h('span'),
        next ? h('a', { href: href(next), class: 'next' }, h('small', {}, 'Next'), h('b', {}, next.title)) : h('span')),
      contactCard()));
  const sc = mount(page, pub);
  const target = sec && body.querySelector(`[data-sec="${CSS.escape(sec)}"]`);
  requestAnimationFrame(() => { if (target) target.scrollIntoView({ block: 'start' }); else sc?.scrollTo?.({ top: 0 }); });
  // Visitors cannot open app pages: their links lead to sign up instead.
  if (pub) body.querySelectorAll('a.hp-go').forEach((x) => { x.setAttribute('href', '#/signup'); x.textContent = 'Create a free account →'; });
}

// pub: { nav, footer } when shown to a visitor who is not signed in.
export function renderHelp(id = '', sec = '', pub = null) {
  const a = id && byId(id);
  if (a) renderArticle(a, sec, pub); else renderHome(pub);
}
