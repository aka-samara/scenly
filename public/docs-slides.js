// Editing a deck by hand in the studio panel: every slide's text and speaker notes, its layout,
// the order of the slides, and the look of the deck.
import { h, icon, errToast } from './app.js';

const LABELS = { '': 'Automatic', title: 'Title', section: 'Section', content: 'Content', 'two-column': 'Two columns', 'image-left': 'Picture left', 'image-right': 'Picture right', 'image-full': 'Full picture', chart: 'Chart', table: 'Table', stats: 'Key numbers', quote: 'Quote', steps: 'Steps', closing: 'Closing' };
const titleOf = (text) => (/^\s*#\s+(.*)$/m.exec(text || '')?.[1] || 'Untitled slide').replace(/[*_`]/g, '').slice(0, 70);

export function slidesEditor(src, env) {
  const deck = src.slides.map((s) => ({ ...s })); const first = JSON.stringify(deck);
  const st = { style: src.settings.style, footer: src.settings.footer || '', numbers: src.settings.numbers !== false }; const firstSt = JSON.stringify(st);
  const list = h('div', { class: 'sl-list' });
  const save = h('button', { class: 'btn sm primary' }, icon('check'), 'Save as new version');
  const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(420, ta.scrollHeight + 2) + 'px'; };
  const card = (s, i) => {
    const name = h('b', {}, titleOf(s.text));
    const text = h('textarea', { class: 'sl-text', spellcheck: 'true', rows: 4, oninput: () => { s.text = text.value; name.textContent = titleOf(s.text); grow(text); } }); text.value = s.text;
    const notes = h('textarea', { class: 'sl-notes', spellcheck: 'true', rows: 2, placeholder: 'Speaker notes (what you say on this slide)', oninput: () => { s.notes = notes.value; grow(notes); } }); notes.value = s.notes || '';
    setTimeout(() => { grow(text); grow(notes); }, 0);
    const btn = (ic, title, fn, off) => h('button', { class: 'icon-btn sm', title, disabled: !!off, onclick: fn }, icon(ic));
    return h('div', { class: 'sl-card' },
      h('div', { class: 'sl-head' }, h('span', { class: 'sl-n' }, String(i + 1)), name, h('span', { class: 'grow' }),
        h('select', { title: 'Layout', onchange: (e) => { s.layout = e.target.value; } }, src.layouts.map((l) => h('option', { value: l, selected: (s.layout || '') === l }, LABELS[l] || l)).concat(h('option', { value: '', selected: !s.layout }, LABELS['']))),
        btn('up', 'Move up', () => { [deck[i - 1], deck[i]] = [deck[i], deck[i - 1]]; draw(); }, i === 0),
        btn('down', 'Move down', () => { [deck[i + 1], deck[i]] = [deck[i], deck[i + 1]]; draw(); }, i === deck.length - 1),
        btn('copy', 'Duplicate', () => { deck.splice(i + 1, 0, { ...s }); draw(); }),
        btn('trash', 'Delete this slide', () => { deck.splice(i, 1); draw(); }, deck.length <= 1)),
      text, notes,
      h('button', { class: 'sl-add', title: 'Add a slide here', onclick: () => { deck.splice(i + 1, 0, { layout: '', text: '# New slide\n- First point', notes: '' }); draw(); setTimeout(() => list.children[i + 1]?.querySelector('textarea')?.focus(), 30); } }, icon('plus'), 'Add a slide'));
  };
  const draw = () => list.replaceChildren(...deck.map(card));
  save.onclick = async () => {
    const change = {}; const changedDeck = JSON.stringify(deck) !== first, changedSt = JSON.stringify(st) !== firstSt;
    if (!changedDeck && !changedSt) return env.done();
    if (changedDeck) change.deck = deck.map((s) => ({ layout: s.layout || '', text: s.text, notes: s.notes || '' }));
    if (changedSt) change.settings = { style: st.style, footer: st.footer, numbers: st.numbers };
    save.disabled = true;
    try { await env.save(change, changedDeck ? (deck.length !== src.slides.length ? `Edited the deck by hand (${deck.length} slides)` : 'Edited slides by hand') : 'Changed the look by hand'); }
    catch (e) { errToast(e); save.disabled = false; }
  };
  draw();
  return h('div', { class: 'studio-edit' },
    h('div', { class: 'studio-edit-bar' }, h('span', {}, 'Each slide: # Title, then - bullets, a table, or a line such as <chart …/> or <stat …/>.'), h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', onclick: () => env.done() }, 'Cancel'), save),
    h('div', { class: 'sl-look' },
      h('label', {}, 'Style', h('select', { disabled: src.settings.template, title: src.settings.template ? 'This deck uses the look of your uploaded deck' : '', onchange: (e) => { st.style = e.target.value; } }, src.styles.map((x) => h('option', { value: x, selected: st.style === x }, x[0].toUpperCase() + x.slice(1))))),
      h('label', { class: 'grow' }, 'Footer', h('input', { type: 'text', value: st.footer, placeholder: 'Text at the bottom of every slide', oninput: (e) => { st.footer = e.target.value; } })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.numbers, onchange: (e) => { st.numbers = e.target.checked; } }), 'Slide numbers')),
    list);
}
