// Phone bottom tab bar: Home, Chat, Image, Video and Menu (opens the full side menu). Shown by mobile.css at 640px and below,
// only while the signed-in app shell is on screen. Kept out of app.js so it can be removed by deleting one script tag.
import { h, icon } from './app.js';

const TABS = [
  ['#/home', 'home', 'home', 'Home'],
  ['#/chat', 'chat', 'chat', 'Chat'],
  ['#/image', 'image', 'image', 'Image'],
  ['#/video', 'video', 'video', 'Video'],
];
let bar = null;

function sectionOf() {
  const hash = location.hash.replace(/^#/, '') || '/';
  return hash.startsWith('/c/') ? 'chat' : hash.split('/')[1] || 'chat';
}
function mark() {
  if (!bar) return;
  const sec = sectionOf();
  bar.querySelectorAll('[data-tab]').forEach((a) => { const on = a.dataset.tab === sec; a.classList.toggle('on', on); a.toggleAttribute('aria-current', on); });
  const known = TABS.some(([, sec2]) => sec2 === sec);
  bar.querySelector('.mtab-more').classList.toggle('on', !known);
}
function sync() {
  const shell = document.getElementById('shell');
  document.body.classList.toggle('has-tabbar', !!shell);
  if (!shell) return;
  if (!bar) {
    bar = h('nav', { class: 'mtab-bar', 'aria-label': 'Main' },
      TABS.map(([href, sec, ic, label]) => h('a', { href, 'data-tab': sec, onclick: () => shell.classList.remove('mobile-open') }, icon(ic), h('span', {}, label))),
      h('button', { type: 'button', class: 'mtab-more', 'aria-label': 'Menu', onclick: () => document.getElementById('shell')?.classList.toggle('mobile-open') }, icon('menu'), h('span', {}, 'Menu')));
  }
  if (!bar.isConnected) document.body.append(bar);
  mark();
}
new MutationObserver(sync).observe(document.getElementById('app'), { childList: true });
addEventListener('hashchange', mark);
sync();
// The on-screen keyboard shrinks the visual viewport; hide the tab bar while it is up so the composer has the room.
const vv = window.visualViewport;
if (vv) {
  const kb = () => document.body.classList.toggle('kb-open', vv.height < window.innerHeight * 0.78 && !!document.activeElement?.matches('input, textarea, select, [contenteditable]'));
  vv.addEventListener('resize', kb); addEventListener('focusout', () => setTimeout(kb, 50));
}
