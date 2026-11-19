// Expand editor: every text box in the app gets a small "expand" button (shown while the box is
// hovered or focused). It opens the text in a large pop-up editor; Save writes it back to the box
// (firing a normal `input` event, so each page's own handler stores it), Cancel leaves it untouched.
//
// One component for the whole app. Opt a box out with `data-no-expand`, give the pop-up a title
// with `data-expand-title`, or open the editor yourself with `openExpandEditor({ value, title, ... })`.

const SKIP = 'textarea[data-no-expand], textarea.cx-edit, textarea.xp-ta';
const ICON_EXPAND = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';

let btn = null;      // the single floating expand button
let target = null;   // the text box it belongs to
let hideTimer = 0;
let editorOpen = false;

const usable = (ta) => ta instanceof HTMLTextAreaElement && !ta.matches(SKIP) && !ta.disabled && !ta.readOnly && ta.isConnected && ta.offsetWidth > 60;

// A short, human title for the pop-up: explicit title, the field's label, or a fallback.
function titleFor(ta) {
  const own = ta.dataset.expandTitle || ta.getAttribute('aria-label');
  if (own) return own;
  if (ta.labels?.[0]?.textContent.trim()) return clean(ta.labels[0].textContent);
  let node = ta;
  for (let up = 0; up < 4 && node.parentElement; up++) {
    node = node.parentElement;
    const lab = [...node.children].find((c) => c !== ta && !c.contains(ta) && c.matches('label, .lab, .vb-lab, .pt-lab, .pro-lab, h3, h4, legend'));
    if (lab && clean(lab.textContent)) return clean(lab.textContent);
  }
  const ph = (ta.placeholder || '').replace(/\?.*$/s, '?').split(/\n|For example|…|\.\.\./)[0].replace(/[.,:;\s]+$/, '').trim();
  return ph && ph.length <= 60 ? ph : 'Edit text';
}
const clean = (t) => t.replace(/\s+/g, ' ').trim().replace(/[?ⓘ]+$/, '').trim().slice(0, 80);

function place() {
  if (!btn || !target) return;
  if (!target.isConnected) return hide(true);
  const r = target.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) { btn.hidden = true; return; }
  btn.hidden = false;
  const inner = target.clientWidth ? r.left + target.clientLeft + target.clientWidth : r.right; // keep clear of a scrollbar
  const small = r.height < 48; // one-line boxes (chat composers): sit just above, not over the typing
  btn.classList.toggle('above', small);
  btn.style.left = `${Math.round(inner - 30)}px`;
  btn.style.top = `${Math.round(small ? r.top - 30 : r.top + 4)}px`;
}

function show(ta) {
  if (editorOpen || !usable(ta)) return;
  clearTimeout(hideTimer);
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'xp-btn';
    btn.title = 'Open in a large editor';
    btn.setAttribute('aria-label', 'Open in a large editor');
    btn.innerHTML = ICON_EXPAND;
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the box focused
    btn.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    btn.addEventListener('mouseleave', () => hide());
    btn.addEventListener('click', () => { if (target) expandTextarea(target); });
    document.body.append(btn);
  }
  target = ta;
  place();
  // The page can move under the box without a scroll or resize (a banner appears, the composer grows), so keep it in place while shown.
  clearInterval(show.timer); show.timer = setInterval(() => { if (!btn || btn.hidden || !target) clearInterval(show.timer); else place(); }, 300);
}

function hide(now = false) {
  clearTimeout(hideTimer);
  const go = () => {
    if (!btn) return;
    if (target && (document.activeElement === target || target.matches(':hover') || btn.matches(':hover'))) return;
    btn.hidden = true; target = null;
  };
  if (now) { if (btn) btn.hidden = true; target = null; } else hideTimer = setTimeout(go, 220);
}

// Writes text back into a box the way typing would, so the page's own handlers save it.
function writeBack(ta, value) {
  if (!ta.isConnected || ta.value === value) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, value);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
}

export function expandTextarea(ta) {
  hide(true);
  const start = ta.selectionStart; const end = ta.selectionEnd;
  return openExpandEditor({
    value: ta.value,
    title: titleFor(ta),
    placeholder: ta.placeholder,
    maxLength: ta.maxLength > 0 ? ta.maxLength : 0,
    selection: [start, end],
    onSave: (v) => writeBack(ta, v),
    onClose: () => { if (ta.isConnected) { ta.focus({ preventScroll: true }); } },
  });
}

// The pop-up editor itself. Resolves with the saved text, or null when cancelled.
export function openExpandEditor({ value = '', title = 'Edit text', placeholder = '', maxLength = 0, selection, onSave, onClose } = {}) {
  return new Promise((resolve) => {
    editorOpen = true;
    const box = document.createElement('div');
    box.className = 'xp-bg';
    box.innerHTML = `
      <div class="xp-modal" role="dialog" aria-modal="true" aria-labelledby="xp-title">
        <div class="xp-head">
          <b id="xp-title"></b>
          <small class="xp-count"></small>
          <button type="button" class="xp-x" title="Cancel (Esc)" aria-label="Cancel"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        <textarea class="xp-ta" spellcheck="true"></textarea>
        <div class="xp-foot">
          <small class="xp-keys">Esc to cancel · ⌘/Ctrl + Enter to save</small>
          <div class="xp-grow"></div>
          <button type="button" class="btn xp-cancel">Cancel</button>
          <button type="button" class="btn primary xp-save">Save</button>
        </div>
      </div>`;
    const ta = box.querySelector('.xp-ta');
    const modal = box.querySelector('.xp-modal');
    try { const sz = JSON.parse(localStorage.getItem('pm-xp-size')); if (sz?.w && innerWidth > 640) { modal.style.width = `${Math.min(sz.w, innerWidth - 16)}px`; modal.style.height = `${Math.min(sz.h, innerHeight - 16)}px`; } } catch { /* no storage */ }
    const count = box.querySelector('.xp-count');
    box.querySelector('#xp-title').textContent = title;
    ta.placeholder = placeholder || '';
    if (maxLength) ta.maxLength = maxLength;
    ta.value = value;
    const recount = () => {
      const n = ta.value.length;
      const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
      count.textContent = maxLength ? `${n.toLocaleString()} / ${maxLength.toLocaleString()} characters` : `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
      count.classList.toggle('near', !!maxLength && n > maxLength * 0.9);
    };
    ta.addEventListener('input', recount); recount();

    const finish = (save) => {
      window.removeEventListener('keydown', onKey, true);
      try { if (modal.style.width) localStorage.setItem('pm-xp-size', JSON.stringify({ w: modal.offsetWidth, h: modal.offsetHeight })); } catch { /* no storage */ }
      box.remove(); editorOpen = false;
      if (save) onSave?.(ta.value);
      onClose?.();
      resolve(save ? ta.value : null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopImmediatePropagation(); finish(true); }
      else if (box.contains(e.target)) e.stopPropagation(); // keep page shortcuts (Space, S, Delete…) from firing while typing here
    };
    window.addEventListener('keydown', onKey, true);
    box.addEventListener('mousedown', (e) => { if (e.target === box) box.dataset.down = '1'; });
    box.addEventListener('mouseup', (e) => { if (e.target === box && box.dataset.down && ta.value === value) finish(false); delete box.dataset.down; });
    box.querySelector('.xp-x').addEventListener('click', () => finish(false));
    box.querySelector('.xp-cancel').addEventListener('click', () => finish(false));
    box.querySelector('.xp-save').addEventListener('click', () => finish(true));
    document.body.append(box);
    ta.focus();
    const [s, e] = selection && selection[0] != null ? selection : [ta.value.length, ta.value.length];
    ta.setSelectionRange(s, e);
    if (s === e && s === ta.value.length) ta.scrollTop = ta.scrollHeight;
  });
}

// Wire up once for the whole document: works for text boxes created at any time on any page.
export function installExpandEditors() {
  if (installExpandEditors.done) return; installExpandEditors.done = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = '/expand.css';
  document.head.append(link);
  const isTa = (el) => el instanceof HTMLTextAreaElement;
  document.addEventListener('focusin', (e) => { if (isTa(e.target)) show(e.target); });
  document.addEventListener('focusout', (e) => { if (isTa(e.target)) hide(); });
  document.addEventListener('mouseover', (e) => { if (isTa(e.target)) show(e.target); });
  document.addEventListener('mouseout', (e) => { if (isTa(e.target)) hide(); });
  document.addEventListener('input', (e) => { if (e.target === target) place(); }); // auto-growing boxes
  addEventListener('scroll', place, true);
  addEventListener('resize', place);
  // ⌘/Ctrl + Shift + E opens the focused box in the editor.
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e' && e.shiftKey && (e.metaKey || e.ctrlKey) && usable(document.activeElement)) { e.preventDefault(); expandTextarea(document.activeElement); }
  });
}
