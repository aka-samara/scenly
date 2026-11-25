// Image (new): the shorter, chip-based picture section, beside the old Image page (which stays as it is).
// One box, every option as a one-tap chip: model, size, how many, quality, style, character and photos.
// It reuses the existing routes: /api/generate, the Design Library styles, characters, the image editor and upscale.
import { micButton } from './voice.js';
import { h, pageCss, $, icon, S, store, api, toast, errToast, topbar, fmtCredits, setCredits, popover, closePop, pickFiles, openLightbox, downloadFiles, refreshRecents } from './app.js';

await pageCss('vn-css', '/vnew.css');

const SHAPES = [['1:1', 'Square'], ['3:4', 'Portrait'], ['9:16', 'Tall'], ['4:3', 'Landscape'], ['16:9', 'Wide']];
const idem = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const models = () => (S.models || []).filter((m) => m.type === 'image' && !m.hidden);
const byId = (id) => models().find((m) => m.id === id) || null;
// The size a model makes that is closest to a shape (the server does the same for shapes it is sent).
function sizeFor(m, shape) {
  const [a, b] = shape.split(':').map(Number); const want = a / b; const sizes = m?.image?.sizes || [];
  return sizes.map((s) => { const [w, hh] = s.split('x').map(Number); return { s, d: Math.abs(Math.log((w / hh) / want)) }; }).sort((x, y) => x.d - y.d)[0]?.s || sizes[0];
}
let STYLES = null;

export async function renderInew(tab = '') {
  const st = { model: 'auto', shape: '1:1', count: 2, quality: '', style: null, styleVar: '', char: null, refs: [], mode: 'create', ...store.get('in-set', {}), refs: [] };
  const keep = () => { const { refs, ...rest } = st; store.set('in-set', rest); };
  let chars = []; try { chars = (await api('/api/characters')).characters; } catch { /* none */ }
  const body = h('div', { class: 'vn-body' });
  $('#main').replaceChildren(topbar([h('span', { class: 'vn-title' }, 'Image', h('span', { class: 'tag new' }, 'New'))]),
    h('nav', { class: 'vn-tabs' }, [['', 'Create'], ['mine', 'My images']].map(([id, l]) => h('a', { class: 'vn-tab' + (tab === id ? ' on' : ''), href: '#/inew' + (id ? '/' + id : '') }, l))),
    h('div', { class: 'scroll vn-scroll' }, body));
  const grid = h('div', { class: 'in-grid', id: 'in-grid' });
  if (tab === 'mine') { body.replaceChildren(h('div', { class: 'vn-wrap wide' }, h('h1', { class: 'vn-h1 left' }, 'My images'), grid)); return loadMine(grid, 60); }

  const ta = h('textarea', { class: 'vn-ta', id: 'in-prompt', rows: 2, maxlength: 4000, placeholder: 'A bottle of face cream on a marble sink, soft morning light, product photo.' }, store.get('in-draft', ''));
  ta.addEventListener('input', () => { store.set('in-draft', ta.value); grow(); draw(); });
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(240, ta.scrollHeight + 2) + 'px'; };
  const chipsEl = h('div', { class: 'vn-chips' }); const refsEl = h('div', { class: 'vn-files' }); const cost = h('span', { class: 'vn-qcost' });
  const go = h('button', { class: 'btn primary vn-go', id: 'in-go' }, icon('sparkle'), 'Create');
  const model = () => {
    if (st.model !== 'auto') return byId(st.model);
    const ms = models(); const needEdit = st.refs.length || st.mode === 'edit';
    return (needEdit ? ms.filter((m) => m.image?.edit) : ms).find((m) => /seedream-5\.0-pro|nano-banana/i.test(m.id)) || (needEdit ? ms.find((m) => m.image?.edit) : ms[0]) || ms[0];
  };
  const chip = (k, label, val, onclick) => h('button', { class: 'vn-chip', 'data-ichip': k, onclick }, h('span', {}, label + ': '), h('b', {}, val));
  const pop = (e, title, items) => popover(e.currentTarget, h('div', { class: 'menu' }, h('div', { class: 'menu-head' }, title), items));
  function draw() {
    const m = model();
    chipsEl.replaceChildren(
      chip('model', 'Model', st.model === 'auto' ? `Auto (${m?.name || 'none'})` : m?.name || 'Auto', (e) => pop(e, 'MODEL', [h('button', { onclick: () => { closePop(); st.model = 'auto'; keep(); draw(); } }, 'Auto'), ...models().map((x) => h('button', { onclick: () => { closePop(); st.model = x.id; keep(); draw(); } }, x.name, h('small', {}, ` ${fmtCredits(x.price?.creditsPerImage || 0)} each`)))])),
      chip('size', 'Size', `${SHAPES.find((x) => x[0] === st.shape)?.[1] || ''} ${st.shape}`, (e) => pop(e, 'SIZE', SHAPES.map(([r, l]) => h('button', { onclick: () => { closePop(); st.shape = r; keep(); draw(); } }, icon('ratio'), `${l} ${r}`)))),
      chip('count', 'How many', String(st.count), () => { st.count = st.count >= 4 ? 1 : st.count + 1; keep(); draw(); }),
      m?.image?.qualities?.length > 1 && chip('quality', 'Quality', st.quality || m.image.qualities[0], (e) => pop(e, 'QUALITY', m.image.qualities.map((q) => h('button', { onclick: () => { closePop(); st.quality = q; keep(); draw(); } }, q)))),
      chip('style', 'Style', st.style?.name || 'None', (e) => stylePop(e)),
      chip('character', 'Character', chars.find((c) => c.id === st.char)?.name || 'None', (e) => pop(e, 'CHARACTER', [h('button', { onclick: () => { closePop(); st.char = null; keep(); draw(); } }, 'None'), ...chars.map((c) => h('button', { onclick: () => { closePop(); st.char = c.id; keep(); draw(); } }, c.name)), h('a', { href: '#/characters', onclick: closePop }, icon('plus'), 'New character')])));
    refsEl.replaceChildren(...st.refs.map((r, i) => h('span', { class: 'vn-file' }, r.busy ? h('span', { class: 'spin' }) : icon('image'), r.name, h('button', { class: 'icon-btn sm', title: 'Remove', onclick: () => { st.refs.splice(i, 1); draw(); } }, icon('x')))));
    const each = m?.price?.creditsPerImage || 0;
    cost.textContent = m ? `About ${fmtCredits(each * st.count)} credits, ${st.count} picture${st.count > 1 ? 's' : ''}` : 'No picture model is available';
  }
  async function stylePop(e) {
    if (!STYLES) { try { STYLES = await api('/api/styles'); } catch (er) { return errToast(er); } }
    const q = h('input', { class: 'vn-input', placeholder: 'Search styles' }); const list = h('div', { class: 'in-styles' });
    const fill = () => list.replaceChildren(h('button', { class: 'in-style', onclick: () => { closePop(); st.style = null; keep(); draw(); } }, h('span', { class: 'th' }, icon('x')), 'None'),
      ...STYLES.styles.filter((x) => !q.value || x.name.toLowerCase().includes(q.value.toLowerCase())).slice(0, 60).map((x) => h('button', { class: 'in-style' + (st.style?.id === x.id ? ' on' : ''), title: x.needsImage ? 'Changes a photo you add' : '', onclick: () => { closePop(); st.style = { id: x.id, name: x.name, needsImage: !!x.needsImage, variable: x.variable }; st.styleVar = x.variable?.options?.[0] || ''; keep(); draw(); } }, h('span', { class: 'th' }, x.thumb ? h('img', { src: x.thumb, alt: '', loading: 'lazy' }) : icon('palette')), x.name)));
    q.addEventListener('input', fill); fill();
    popover(e.currentTarget, h('div', { class: 'menu in-stylemenu' }, h('div', { class: 'menu-head' }, 'DESIGN LIBRARY STYLES'), q, list));
  }
  const addRefs = () => pickFiles('image/*', true, async (picked) => {
    const slots = picked.map((p) => ({ name: p.name, busy: true })); st.refs.push(...slots); draw();
    const fd = new FormData(); picked.forEach((p) => fd.append('files', p));
    try { const r = await api('/api/files', { method: 'POST', body: fd }); (r.errors || []).forEach((m) => toast(m, 'error')); slots.forEach((s, i) => { const x = r.files[i]; if (x) Object.assign(s, { id: x.id, busy: false }); else st.refs.splice(st.refs.indexOf(s), 1); }); }
    catch (er) { st.refs = st.refs.filter((x) => !slots.includes(x)); errToast(er); }
    draw();
  }, { title: 'Photos to use' });
  const improve = h('button', { class: 'vn-link', onclick: async () => { if (!ta.value.trim()) return toast('Type a short idea first.'); improve.disabled = true; try { const r = await api('/api/enhance', { method: 'POST', body: { prompt: ta.value.trim(), mode: 'image', fileIds: st.refs.filter((x) => x.id).map((x) => x.id) } }); ta.value = r.prompt; setCredits(r.credits); store.set('in-draft', ta.value); grow(); } catch (er) { errToast(er); } improve.disabled = false; } }, icon('sparkle'), 'Improve my prompt');
  go.onclick = async () => {
    const m = model(); const prompt = ta.value.trim();
    if (!m) return toast('No picture model is available right now.', 'error');
    if (!prompt && !(st.style?.needsImage && (st.refs.length || st.char))) return toast(st.style?.needsImage ? `${st.style.name} changes a photo. Add a photo first.` : 'Describe the picture first.', 'error');
    if (st.refs.some((r) => r.busy)) return toast('A photo is still uploading.');
    const card = h('div', { class: 'in-card busy' }, h('span', { class: 'spin' }), h('small', {}, 'Making…'));
    grid.prepend(card); go.disabled = true;
    try {
      const r = await api('/api/generate', { method: 'POST', timeoutMs: 200000, body: { idem: idem(), mode: 'image', model: m.id, prompt, styleId: st.style?.id, styleVar: st.style?.variable ? st.styleVar : undefined, fileIds: st.refs.filter((x) => x.id).map((x) => x.id), count: st.count, characterId: st.char || undefined, params: { size: sizeFor(m, st.shape), quality: st.quality || undefined }, origin: 'inew' } });
      setCredits(r.credits); card.remove(); let g = r.generation;
      for (let i = 0; i < 120 && !['done', 'failed', 'error'].includes(g.status); i++) { await new Promise((res) => setTimeout(res, 2500)); try { g = (await api('/api/generations/' + g.id)).generation; } catch { /* retry */ } }
      if (g.status !== 'done') throw new Error(g.error || 'The picture could not be made. Nothing was charged.');
      g.media.slice().reverse().forEach((x) => grid.prepend(imgCard(x, g)));
      if (g.note) toast(g.note, 'error'); refreshRecents?.();
    } catch (er) { card.remove(); errToast(er); }
    go.disabled = false;
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go.click(); });
  draw(); setTimeout(grow, 0);
  body.replaceChildren(h('div', { class: 'vn-create' }, h('h1', { class: 'vn-h1' }, 'What picture do you want?'),
    h('div', { class: 'vn-wrap' }, h('div', { class: 'vn-box' }, ta,
      h('div', { class: 'vn-row' }, h('span', { class: 'vn-lab' }, 'Already set. Tap any one to change it.'), h('div', { class: 'grow' }), improve), chipsEl, refsEl,
      h('div', { class: 'vn-row' }, h('button', { class: 'btn sm', id: 'in-add', onclick: addRefs }, icon('plus'), 'Add photos'), h('span', { class: 'vn-hint' }, 'to change a photo or follow it, or from my assets'), h('div', { class: 'grow' }), cost, micButton(ta), go)),
    h('div', { class: 'vn-ways' }, [['From words', 'Type and press Create.'], ['Change a photo', 'Add a photo and say what to change: background, colours, outfit.'], ['Design Library style', 'Pick a Style. Photo styles change a photo you add.'], ['Same character', 'Pick a Character and the face stays the same.'], ['Edit after', 'Open any picture to remove the background, resize, upscale or change it with words.'], ['Make it move', 'Make a video from any picture in one tap.']].map(([a, b]) => h('div', { class: 'vn-way' }, h('b', {}, a), h('small', {}, b)))),
    h('h2', { class: 'vn-h2' }, 'Your pictures'), grid)));
  loadMine(grid, 16);
}
async function loadMine(grid, n) {
  try { const r = await api('/api/generations?mode=image&limit=' + n); r.generations.filter((g) => g.status === 'done').forEach((g) => (g.media || []).forEach((x) => grid.append(imgCard(x, g)))); if (!grid.children.length) grid.append(h('p', { class: 'mut' }, 'No pictures yet.')); }
  catch (e) { grid.append(h('div', { class: 'err' }, e.message)); }
}
function imgCard(x, g) {
  const act = (ic, title, fn) => h('button', { class: 'icon-btn sm', title, 'aria-label': title, onclick: (e) => { e.stopPropagation(); fn(); } }, icon(ic));
  return h('div', { class: 'in-card', 'data-media': x.id }, h('img', { src: x.thumb || x.url, alt: g.prompt || '', loading: 'lazy', onclick: () => openLightbox({ ...x, type: 'image', model: g.model, prompt: g.prompt }, g) }),
    h('div', { class: 'in-acts' },
      act('dl', 'Download', () => downloadFiles([x.id], x.url)),
      act('edit', 'Edit: change it, remove the background, resize, upscale', () => openLightbox({ ...x, type: 'image', model: g.model, prompt: g.prompt }, g)),
      act('video', 'Make a video from this picture', async () => { try { const r = await api(`/api/media/${x.id}/as-file`, { method: 'POST', body: { name: 'Picture.png' } }); store.set('vn-qstart', { id: r.file.id, name: r.file.name || 'Picture', kind: 'image' }); store.set('vn-mode', 'quick'); location.hash = '#/vnew/quick'; } catch (e) { errToast(e); } }),
      act('hd', 'Upscale to 4K (free)', async () => { try { await api(`/api/media/${x.id}/upscale`, { method: 'POST' }); toast('Upscaled. The larger copy is in Assets.'); } catch (e) { errToast(e); } }),
      act('retry', 'Same prompt again', () => { const box = $('#in-prompt'); if (box) { box.value = g.prompt || ''; box.dispatchEvent(new Event('input')); $('#in-go')?.click(); } })));
}
