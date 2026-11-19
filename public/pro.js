// Studio Pro: a second image + video studio that sits beside the Image, Video, Video Agent and Video Builder pages.
// One section, several tools: Home, Agent (one line in, a finished ad, clip or film out), Image, Video and Enhancer.
// Everything is made through the same server routes as the rest of Scenly, so results land in Assets and Recents.
import { h, $, $$, icon, S, store, api, toast, errToast, popover, closePop, pickFiles, uploadFiles, topbar, fmtCredits, setCredits, info, openLightbox, byId, modelLogo, shortName, refreshRecents } from './app.js';

if (!$('#pro-css')) document.head.append(h('link', { id: 'pro-css', rel: 'stylesheet', href: '/pro.css' }));
let INFO = null;
const LISTED = new Set(); // agent sessions already shown in Recents
let live = 0; // bumps on every render, so polls started by an older screen stop
const TOOLS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'agent', label: 'Agent', icon: 'sparkle', tag: 'AI' },
  { id: 'image', label: 'Image', icon: 'image' },
  { id: 'video', label: 'Video', icon: 'video' },
  { id: 'ads', label: 'Ad Studio', icon: 'megaphone' },
  { id: 'enhance', label: 'Enhancer', icon: 'wand' },
];
const uid = (p) => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The server turns a shape into the chosen model's nearest real size (models list their own sizes).
const IMG_SHAPES = [['1:1', 'Square 1:1'], ['4:5', 'Portrait 4:5'], ['3:4', 'Portrait 3:4'], ['9:16', 'Tall 9:16'], ['4:3', 'Landscape 4:3'], ['16:9', 'Wide 16:9'], ['21:9', 'Cinema 21:9']];
const sizeFor = (ratio) => (IMG_SHAPES.some(([r]) => r === ratio) ? ratio : '1:1');
// Images: up to the model's own per-request limit (Seedream 15, GPT Image 2.5 10), at least 4. Videos: 1 to 4.
const countOptions = (m) => [1, 2, 3, 4, 6, 8, 10, 15].filter((n) => n <= (m?.image ? Math.max(4, Math.min(15, m.image.maxN || 1)) : 4));
const credits = (n) => (n < 1 && n > 0 ? 'under 1 credit' : `about ${fmtCredits(Math.ceil(n))} credits`);
const tile = (t) => ({ style: { background: `linear-gradient(135deg, ${t.tint[0]}, ${t.tint[1]})` } });
const copyText = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copied'), () => toast('Could not copy', 'error'));
const models = (type) => S.models.filter((m) => m.type === type);
// Where a result was made (Studio Pro or Ad Studio), so Assets can filter by app. Agent and Ad Studio runs set quiet: their own entry in Recents covers them.
const here = () => (location.hash.startsWith('#/ads') ? 'ads' : 'pro');
const generate = async (body) => { const r = await api('/api/generate', { method: 'POST', body: { origin: here(), ...body, idem: uid('pro') }, timeoutMs: 6 * 60000 }); setCredits(r.credits); refreshRecents(); return r.generation; };
/** One picture, trying the next picture model when one is busy or too slow, so a single provider never stops the work. */
async function picture(body, firstId, onSwitch) {
  const order = [firstId, ...(INFO.imageOrder || []).filter((x) => x !== firstId)].filter(Boolean).slice(0, 3); let err = new Error('No picture model is available right now.');
  for (const [n, mid] of order.entries()) {
    if (n) onSwitch?.(byId(mid));
    try { const g = await generate({ ...body, mode: 'image', model: mid, count: 1 }); if (g.media?.[0]) return g; err = new Error(g.note || 'No picture came back. Nothing was charged.'); }
    catch (e) { err = e; if (e.status === 402 || e.status === 400 || e.status === 404) throw e; }
  }
  throw err;
}
// ---------- Face lock: one saved character held the same in everything that is made ----------
let CHARS = null;
const loadChars = async (fresh) => { if (!CHARS || fresh) { try { CHARS = (await api('/api/characters')).characters; } catch { CHARS = CHARS || []; } } return CHARS; };
const charThumb = (c) => (c?.photos?.[0] ? h('img', { class: 'fl-face', src: `/api/files/${c.photos[0].id}/raw`, alt: '' }) : h('span', { class: 'fl-face' }, icon('face')));
const lockWord = (c) => (c?.kind === 'person' ? 'Face lock' : 'Character lock');
/** The switch. `get()` gives the chosen character id, `set(id)` stores it. Off shows a plain chip; on shows who is locked. */
function faceLock(get, set, redraw, cls = 'chipbtn') {
  const cur = (CHARS || []).find((c) => c.id === get());
  const open = async (e) => {
    const anchor = e.currentTarget; const list = await loadChars(true);
    popover(anchor, h('div', { class: 'menu fl-menu' },
      h('div', { class: 'menu-cap' }, 'Keep the same face in every shot'),
      list.length ? list.map((c) => h('button', { 'data-char': c.id, onclick: () => { closePop(); set(c.id); redraw(); } }, charThumb(c), h('span', { class: 'grow' }, h('b', {}, c.name), h('small', {}, c.kind === 'person' ? `Person · ${c.photos.length} photo${c.photos.length > 1 ? 's' : ''}` : c.kind === 'brand' ? 'Logo' : 'Product')), c.id === get() && icon('check', 'chk')))
        : h('p', { class: 'fl-none' }, 'No saved characters yet. Save a person from 1 to 4 photos, then pick them here.'),
      h('hr'),
      get() && h('button', { 'data-char': '', onclick: () => { closePop(); set(''); redraw(); } }, icon('x'), 'Turn Face lock off'),
      h('a', { href: '#/characters', onclick: closePop }, icon('plus'), list.length ? 'Add or manage characters' : 'Create a character')));
  };
  return h('button', { class: cls + ' fl-btn' + (cur ? ' on' : ''), id: 'face-lock', title: 'Face lock: pick a saved character and every picture and every video shot is made with that same face (or product, or logo).', onclick: open }, cur ? charThumb(cur) : icon('lock'), h('span', { class: 'nm' }, cur ? `${lockWord(cur)}: ${cur.name}` : 'Face lock'));
}
const holdWords = (c) => (c ? `The ${c.kind === 'person' ? 'person' : c.kind === 'brand' ? 'logo' : 'product'} in the first frame is ${c.name}. ${c.kind === 'person' ? 'The person must stay the same person for the whole clip: the same face, hair and outfit.' : 'It must stay identical for the whole clip.'}\n\n` : '');

/** A picture that can also open a video (it keeps a web link the video models accept). Falls back to any picture model. */
async function framePicture(body, firstId, onSwitch) {
  try { const r = await api('/api/pro/frame', { method: 'POST', body: { origin: here(), ...body }, timeoutMs: 6 * 60000 }); setCredits(r.credits); refreshRecents(); return { g: r.generation, fileId: r.fileId, canFilm: r.canFilm }; }
  catch (e) { if (e.status === 402 || e.status === 400 || e.status === 404 || body.characterId) throw e; } // with Face lock there is no fallback: another model would lose the face
  onSwitch?.();
  const g = await picture({ prompt: body.prompt, fileIds: body.fileIds, params: { size: sizeFor(body.ratio) }, sessionId: body.sessionId, origin: body.origin || here(), quiet: body.quiet }, firstId);
  return { g, fileId: null, canFilm: false };
}
/** Wait for a video generation. Stops quietly when the screen that asked has gone. */
async function waitGen(g, token, onTick) {
  while (g.status === 'pending') {
    await sleep(6000); if (token !== live) return null;
    try { const r = await api('/api/generations/' + g.id); g = r.generation; setCredits(r.credits); onTick?.(g); } catch { /* a dropped request: try again on the next tick */ }
  }
  return g;
}
const mediaEl = (m, extra = {}) => (m.type === 'video' ? h('video', { src: m.url, poster: m.poster || undefined, controls: true, playsinline: true, loop: true, preload: 'metadata', ...extra }) : h('img', { src: m.url, alt: m.prompt || '', loading: 'lazy', ...extra }));
/** replaceChildren that skips the `false` and `null` left by `cond && node`. */
const fill = (node, ...kids) => node.replaceChildren(...kids.flat(3).filter((k) => k != null && k !== false && k !== ''));
const frame = (...kids) => h('div', { class: 'scroll' }, h('div', { class: 'pro' }, ...kids));
function tabs(active) {
  return h('nav', { class: 'pro-tabs', id: 'pro-tabs' }, TOOLS.map((t) => h('a', { class: t.id === active ? 'on' : '', href: t.id === 'ads' ? '#/ads' : '#/pro' + (t.id === 'home' ? '' : '/' + t.id), 'data-tool': t.id }, icon(t.icon), t.label, t.tag && h('span', { class: 'tag new' }, t.tag))),
    h('span', { class: 'grow' }), h('a', { class: 'pro-classic', href: '#/video', title: 'The Image, Video, Video Agent and Video Builder pages are unchanged' }, icon('back'), 'Classic studio'));
}

export async function renderPro(tool = '', arg = '') {
  live++;
  try { INFO = INFO || await api('/api/pro/info'); } catch (e) { $('#main').replaceChildren(topbar(), h('div', { class: 'page' }, h('h1', {}, 'Studio Pro'), h('div', { class: 'err' }, e.message))); return; }
  if (tool === 'agent') return renderAgent(arg);
  if (tool === 'image' || tool === 'video') return renderTool(tool);
  if (tool === 'enhance') return renderEnhance(arg);
  if (tool === 'ads') return renderAds(arg);
  return renderHome();
}

// ---------- Home ----------
function templateCard(t) {
  const k = INFO.kinds.find((x) => x.id === t.kind);
  return h('button', { class: 'pro-tpl', 'data-tpl': t.id, onclick: () => { store.set('pro-brief', { prompt: t.prompt, kind: t.kind, ratio: t.ratio, seconds: t.seconds, templateId: t.id }); location.hash = '#/pro/agent'; } },
    h('span', { class: 'art', ...tile(t) }, icon(k?.icon || 'film'), h('span', { class: 'fmt' }, t.ratio + (t.seconds ? ` · ${t.seconds}s` : ' · stills'))),
    h('b', {}, t.title), h('small', {}, t.blurb), t.needs && h('span', { class: 'needs' }, icon('clip'), 'Best with a ' + t.needs));
}
function renderHome() {
  const ta = h('textarea', { id: 'pro-quick', rows: 2, maxlength: 3000, placeholder: 'A 15 second ad for my cold brew coffee, shot like a summer road trip…' });
  const go = () => { const t = ta.value.trim(); if (t.length < 3) { ta.focus(); return toast('Describe what you want in a sentence.', 'error'); } store.set('pro-brief', { prompt: t, kind: 'auto', ratio: 'auto', seconds: 0, send: true }); location.hash = '#/pro/agent'; };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
  const card = (id, ic, title, text, tint) => h('a', { class: 'pro-tool', href: id === 'ads' ? '#/ads' : '#/pro/' + id, 'data-tool': id }, h('span', { class: 'ic', style: { background: tint } }, icon(ic)), h('b', {}, title), h('small', {}, text));
  const rows = INFO.categories.filter((c) => c.id !== 'all').map((c) => { const list = INFO.templates.filter((t) => t.cat === c.id); return list.length ? [h('h2', {}, icon(c.icon), c.label), h('div', { class: 'pro-row' }, list.map(templateCard))] : []; });
  $('#main').replaceChildren(topbar(), frame(tabs('home'),
    h('section', { class: 'pro-hero' },
      h('span', { class: 'eyebrow' }, icon('sparkle'), 'Studio Pro'),
      h('h1', {}, 'Describe it once. Get a finished ad, clip or short film.'),
      h('p', {}, 'The agent plans the shots, paints the frames, films them and cuts them together. You only approve.'),
      h('div', { class: 'pro-ask' }, ta, h('button', { class: 'btn primary', id: 'pro-quick-go', onclick: go }, icon('sparkle'), 'Create'))),
    h('div', { class: 'pro-tools' },
      card('agent', 'sparkle', 'Agent', 'One line in, a finished ad, UGC clip, short drama or product set out.', 'linear-gradient(135deg,#4361ee,#04d9ff)'),
      card('video', 'video', 'Video', 'Text, picture or video in. Camera bodies, lenses and camera moves built in.', 'linear-gradient(135deg,#ffb547,#ff7a45)'),
      card('image', 'image', 'Image', 'Generate, edit, restyle and shoot products with every image model.', 'linear-gradient(135deg,#04d9ff,#3a86ff)'),
      card('ads', 'megaphone', 'Ad Studio', 'Your website becomes a brand kit, then picture and video ads.', 'linear-gradient(135deg,#ff7a45,#ff4f8b)'),
      card('enhance', 'wand', 'Enhancer', 'Sharpen, add detail and upscale any picture to 4K.', 'linear-gradient(135deg,#42c98a,#4361ee)')),
    ...rows.flat()));
}

// ---------- Agent ----------
async function renderAgent(sid) {
  const token = live;
  if (sid) {
    let s; try { s = (await api('/api/pro/sessions/' + sid)).session; } catch { toast('That session no longer exists', 'error'); location.hash = '#/pro/agent'; return; }
    if (token !== live) return;
    return runAgent(s.state, token);
  }
  const pending = store.get('pro-brief', null); store.set('pro-brief', null);
  const st = { kind: 'auto', ratio: 'auto', seconds: 0, auto: false, quality: 'standard', characterId: '', ...store.get('pro-agent', {}), ...(pending ? { kind: pending.kind, ratio: pending.ratio || 'auto', seconds: pending.seconds || 0 } : {}) };
  let templateId = pending?.templateId || ''; let cat = 'all'; const files = [];
  const keep = () => store.set('pro-agent', { kind: st.kind, ratio: st.ratio, seconds: st.seconds, auto: st.auto, quality: st.quality, characterId: st.characterId });
  const ta = h('textarea', { id: 'pa-prompt', maxlength: 3000, rows: 3, placeholder: 'What do you want to create? An ad, a UGC clip, a short drama, product shots…' }, pending?.prompt || store.get('pro-draft', ''));
  ta.addEventListener('input', () => store.set('pro-draft', ta.value));
  const strip = h('div', { class: 'pa-files', id: 'pa-files' }); const chips = h('div', { class: 'pa-chips', id: 'pa-chips' }); const gal = h('div', { class: 'pro-grid', id: 'pa-gal' }); const cats = h('div', { class: 'seg pa-cats', id: 'pa-cats' });
  const add = () => pickFiles('image/*', false, async (picked) => { const slot = { name: picked[0].name, busy: true }; files.push(slot); drawFiles(); try { const f = (await uploadFiles(picked))[0]; if (f) Object.assign(slot, { id: f.id, busy: false, preview: URL.createObjectURL(picked[0]) }); else files.splice(files.indexOf(slot), 1); } catch (e) { files.splice(files.indexOf(slot), 1); errToast(e); } drawFiles(); });
  const drawFiles = () => strip.replaceChildren(...files.map((f) => h('span', { class: 'pa-file' }, f.busy ? h('span', { class: 'spin' }) : h('img', { src: f.preview, alt: '' }), h('span', {}, f.name), h('button', { class: 'icon-btn sm', title: 'Remove', onclick: () => { files.splice(files.indexOf(f), 1); drawFiles(); } }, icon('x')))));
  const send = () => {
    let prompt = ta.value.trim();
    if (prompt.length < 3) { ta.focus(); return toast('Describe what you want to make in a sentence.', 'error'); }
    if (files.some((f) => f.busy)) return toast('Your picture is still uploading. One moment.');
    store.set('pro-draft', '');
    runAgent({ id: uid('ps_'), title: prompt.slice(0, 60), auto: st.auto, brief: { prompt, kind: st.kind, ratio: st.ratio, seconds: st.seconds, quality: st.quality, characterId: (CHARS || []).some((c) => c.id === st.characterId) ? st.characterId : '', characterName: (CHARS || []).find((c) => c.id === st.characterId)?.name || '', templateId, files: files.filter((f) => f.id).map((f) => ({ id: f.id, name: f.name })) }, items: [], answers: [], out: {} }, live, true);
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  const sel = (id, value, opts, on, title) => { const s = h('select', { id, title, onchange: (e) => { on(e.target.value); keep(); } }, opts.map(([v, l]) => h('option', { value: v }, l))); s.value = String(value); return s; };
  function draw() {
    fill(chips,
      h('button', { class: 'icon-btn', id: 'pa-add', title: 'Add a picture of your product, person or place. The agent builds the work around it.', onclick: add }, icon('plus')),
      faceLock(() => st.characterId, (v) => { st.characterId = v; keep(); }, draw),
      h('div', { class: 'pa-kinds' }, INFO.kinds.map((k) => h('button', { class: 'chipbtn' + (st.kind === k.id ? ' on' : ''), 'data-kind': k.id, title: k.hint, onclick: () => { st.kind = k.id; keep(); draw(); } }, icon(k.icon), k.label))),
      h('span', { class: 'grow' }),
      sel('pa-ratio', st.ratio, [['auto', 'Shape: auto'], ['9:16', '9:16 vertical'], ['16:9', '16:9 wide'], ['1:1', '1:1 square']], (v) => { st.ratio = v; }, 'Shape of the result'),
      sel('pa-len', st.seconds, [[0, 'Length: auto'], [5, '5 s'], [10, '10 s'], [15, '15 s'], [30, '30 s'], [60, '1 min']], (v) => { st.seconds = Number(v); }, 'Length of a video'),
      sel('pa-quality', st.quality, INFO.qualities.map((q) => [q.id, `${q.id[0].toUpperCase() + q.id.slice(1)} video · ${q.resolution} · ${fmtCredits(q.perSecond)}/s`]), (v) => { st.quality = v; }, 'Video quality. Draft is the cheapest way to try an idea; make the final in Standard or High. Prices are credits per second of video.'),
      h('label', { class: 'pa-auto', title: 'On: the agent makes everything without stopping for your approval. Off: it shows you the plan and the price first.' }, 'Autopilot', h('button', { class: 'switch' + (st.auto ? ' on' : ''), id: 'pa-autopilot', role: 'switch', 'aria-checked': String(!!st.auto), onclick: () => { st.auto = !st.auto; keep(); draw(); } })),
      h('button', { class: 'btn primary', id: 'pa-go', onclick: send }, icon('sparkle'), 'Create'));
    cats.replaceChildren(...INFO.categories.map((c) => h('button', { class: c.id === cat ? 'on' : '', 'data-cat': c.id, onclick: () => { cat = c.id; draw(); } }, icon(c.icon), c.label)));
    gal.replaceChildren(...INFO.templates.filter((t) => cat === 'all' || t.cat === cat).map((t) => { const c = templateCard(t); c.onclick = () => { templateId = t.id; Object.assign(st, { kind: t.kind, ratio: t.ratio, seconds: [0, 5, 10, 15, 30, 60].includes(t.seconds) ? t.seconds : 0 }); keep(); ta.value = t.prompt; store.set('pro-draft', t.prompt); draw(); $('#main .scroll').scrollTo({ top: 0, behavior: 'smooth' }); ta.focus(); const a = t.prompt.indexOf('['), b = t.prompt.indexOf(']'); if (a >= 0 && b > a) ta.setSelectionRange(a, b + 1); }; return c; }));
  }
  draw();
  loadChars().then(() => { if (token === live) { if (st.characterId && !CHARS.some((c) => c.id === st.characterId)) { st.characterId = ''; keep(); } draw(); } });
  const recent = h('div', { class: 'pa-recent', id: 'pa-recent' });
  api('/api/pro/sessions').then((r) => { if (token !== live || !r.sessions.length) return; recent.replaceChildren(h('h2', {}, 'Your sessions'), h('div', { class: 'pa-sessions' }, r.sessions.slice(0, 12).map((s) => h('a', { class: 'pa-session', href: '#/pro/agent/' + s.id }, s.cover ? h('img', { src: s.cover, alt: '' }) : h('span', { class: 'ph' }, icon('sparkle')), h('span', { class: 'clip1' }, s.title), h('button', { class: 'icon-btn sm', title: 'Delete this session (what it made stays in Assets)', onclick: async (e) => { e.preventDefault(); e.stopPropagation(); await api('/api/pro/sessions/' + s.id, { method: 'DELETE' }); e.target.closest('.pa-session').remove(); } }, icon('trash')))))); }).catch(() => {});
  $('#main').replaceChildren(topbar(), frame(tabs('agent'),
    h('div', { class: 'pa-start' }, h('h1', {}, 'What do you want to create?'),
      h('p', { class: 'sub' }, `One line is enough. Planning costs ${credits(INFO.planCredits)}; you see the price of everything else before it is made.`),
      h('div', { class: 'pa-box' }, strip, ta, chips)),
    recent, h('h2', {}, 'Start from a template'), cats, gal));
  if (pending?.send) send(); else if (pending?.prompt) { ta.focus(); const a = ta.value.indexOf('['), b = ta.value.indexOf(']'); if (a >= 0 && b > a) ta.setSelectionRange(a, b + 1); }
}

/** One agent session: the thread on the left, what was made on the right. `st` is saved after every step. */
function runAgent(st, token, fresh = false) {
  const thread = h('div', { class: 'pa-thread', id: 'pa-thread' }); const stage = h('div', { class: 'pa-stage', id: 'pa-stage' });
  const alive = () => token === live;
  let saving = null;
  const cover = () => st.out.stills?.find(Boolean)?.url || st.out.keyframe?.url || st.out.clip?.poster || null;
  const persist = () => { clearTimeout(saving); saving = setTimeout(() => api('/api/pro/sessions/' + st.id, { method: 'PUT', body: { title: st.plan?.title || st.title, cover: cover(), state: st } }).then(() => { if (!LISTED.has(st.id)) { LISTED.add(st.id); refreshRecents(); } }).catch(() => {}), 400); };
  const push = (item) => { st.items.push(item); draw(); persist(); return item; };
  const step = (textValue) => push({ t: 'step', text: textValue, state: 'run' });
  const done = (item, state = 'done', note) => { item.state = state; if (note) item.note = note; draw(); persist(); };
  const say = (textValue) => push({ t: 'say', text: textValue });
  const fileIds = () => (st.brief.files || []).map((f) => f.id);
  const lock = () => st.brief.characterId || undefined; const who = () => st.brief.characterName || 'the character';
  const look = () => (st.plan?.look ? ` Look: ${st.plan.look}` : '');
  // The video models add their own sound. Music they invent is sometimes refused by the provider as a copyright risk
  // (seen 2026-11-19), and music belongs in the edit anyway, so takes are asked for with natural sound only.
  const SOUND = ' Natural ambient sound only, no music, no singing.';

  async function plan(extra = {}) {
    const s = step(extra.revise ? 'Rewriting the plan' : st.answers.length ? 'Writing the plan with your answer' : 'Reading the brief and writing the plan');
    try {
      const r = await api('/api/pro/agent/plan', { method: 'POST', body: { prompt: st.brief.prompt, kind: st.brief.kind, ratio: st.brief.ratio, seconds: st.brief.seconds, quality: st.brief.quality, characterId: lock(), templateId: st.brief.templateId, fileIds: fileIds(), answers: st.answers, ...extra }, timeoutMs: 90000 });
      if (!alive()) return; setCredits(r.balance);
      st.plan = r.plan; st.estimate = r.estimate; st.title = r.plan.title; done(s);
      if (r.sawPicture) say('I looked at your picture and built the plan around it.');
      if (r.plan.question) return push({ t: 'question', q: r.plan.question });
      const card = push({ t: 'plan', state: 'open' });
      if (st.auto) approve(card);
    } catch (e) { done(s, 'fail', e.message); push({ t: 'retry', what: 'plan' }); }
  }
  function approve(card) { card.state = 'approved'; draw(); persist(); const d = st.plan.deliverable; return d === 'images' ? makeStills() : d === 'clip' ? makeClip() : makeFilm(); }

  // Pictures are made one request each, so one busy model never loses the whole set. `only` remakes a single picture.
  async function makeStills(only) {
    const todo = st.plan.stills.map((p, i) => [p, i]).filter(([, i]) => (only == null ? !st.out.stills?.[i] : i === only));
    const s = step(only == null ? `Creating ${todo.length} picture${todo.length > 1 ? 's' : ''} with ${st.estimate.imageModel?.name || 'the image model'}` : `Making "${st.plan.stills[only].title}" again`);
    st.out.stills = st.out.stills || st.plan.stills.map(() => null); st.out.failed = (st.out.failed || []).filter((i) => !todo.some(([, k]) => k === i)); draw();
    let last = '';
    const one = async ([p, i]) => {
      try { const { g } = await framePicture({ origin: 'pro', quiet: true, prompt: p.prompt + look(), fileIds: fileIds(), characterId: lock(), ratio: st.plan.ratio, sessionId: st.out.imageSession, title: p.title }, st.estimate.imageModel?.id); st.out.imageSession = g.sessionId; st.out.stills[i] = { ...g.media[0], title: p.title, generationId: g.id }; }
      catch (e) { last = e.message; st.out.failed.push(i); }
      if (alive()) { draw(); persist(); }
    };
    // The first one alone, so the rest join its session and Recents gets one entry for the set.
    if (todo.length) await one(todo[0]);
    await Promise.all(todo.slice(1).map(one));
    if (!alive()) return;
    const made = st.out.stills.filter(Boolean).length; const failed = st.out.failed.length;
    if (!made) { done(s, 'fail', last || 'No picture could be made.'); push({ t: 'retry', what: 'make' }); return; }
    done(s, 'done', failed ? `${failed} could not be made and ${failed > 1 ? 'were' : 'was'} not charged. Press "Try again" on ${failed > 1 ? 'them' : 'it'}.` : ''); finish();
  }

  async function makeClip() {
    const shot = st.plan.shots[0];
    if (!st.out.framed && st.estimate.frame !== false) {
      const s = step(lock() ? `Framing ${who()} in the opening shot` : fileIds().length ? 'Placing your picture into the opening frame' : 'Painting the opening frame');
      try {
        const r = await framePicture({ origin: 'pro', quiet: true, prompt: (st.plan.keyframe || shot.visual) + look(), fileIds: fileIds(), characterId: lock(), ratio: st.plan.ratio, title: st.plan.title }, st.estimate.imageModel?.id, () => { s.note = 'The first picture model was busy. Trying another…'; draw(); });
        if (!alive()) return;
        st.out.keyframe = { ...r.g.media[0], generationId: r.g.id }; st.out.frameFileId = r.canFilm ? r.fileId : null; st.out.framed = true;
        done(s, 'done', r.canFilm ? '' : 'This picture model gives no web link, so the take is filmed from the description and may differ a little from the frame.');
      } catch (e) { done(s, 'fail', e.message); return push({ t: 'retry', what: 'make' }); }
      if (!st.auto) return push({ t: 'frame', state: 'open' });
    }
    return animate();
  }
  async function animate() {
    const shot = st.plan.shots[0]; const s = step(`Filming the ${shot.seconds} second take`);
    try {
      let g;
      if (st.out.clipGen) g = (await api('/api/generations/' + st.out.clipGen)).generation;
      else {
        const r = await api('/api/pro/clip', { method: 'POST', body: { origin: 'pro', quiet: true, prompt: shot.visual + look() + SOUND, fileIds: st.out.frameFileId ? [st.out.frameFileId] : [], ratio: st.plan.ratio, seconds: shot.seconds, quality: st.brief.quality, characterId: st.out.frameFileId ? lock() : undefined, title: st.plan.title, avoid: st.out.avoid || [] }, timeoutMs: 4 * 60000 });
        g = r.generation; setCredits(r.credits); refreshRecents(); s.text = `Filming the ${g.params?.duration || shot.seconds} second take with ${r.model.name} at ${r.resolution}`; s.note = 'Usually one to three minutes. You can leave this page; it keeps going.';
      }
      st.out.clipGen = g.id; draw(); persist();
      g = await waitGen(g, token); if (!g) return;
      // A failed take costs nothing. The model is reported and the next one for this quality films it, up to twice.
      if ((g.status !== 'done' || !g.media?.[0]) && (st.out.avoid || []).length < 2) { st.out.avoid = [...(st.out.avoid || []), g.model]; st.out.clipGen = null; api('/api/pro/avoid', { method: 'POST', body: { modelId: g.model, ratio: st.plan.ratio, quality: st.brief.quality, face: !!lock() } }).catch(() => {}); done(s, 'fail', `${byId(g.model) ? shortName(byId(g.model)) : 'The model'} could not film this take and the credits were returned. Switching to another model.`); return animate(); }
      if (g.status !== 'done' || !g.media?.[0]) { st.out.clipGen = null; throw new Error(g.error || g.note || 'The video could not be made this time. The credits were returned.'); }
      st.out.clip = { ...g.media[0], generationId: g.id }; s.note = ''; done(s); finish();
    } catch (e) { done(s, 'fail', e.message); push({ t: 'retry', what: 'animate' }); }
  }

  async function makeFilm() {
    if (!INFO.builder) { say('Films of several shots need the Video Builder, which is switched off on this server. I can make this as a single clip instead: ask me to revise it into one take.'); return; }
    try {
      if (!st.out.film) {
        const s = step(`Setting up ${st.plan.shots.length} shots`);
        // Face lock: every shot gets its own opening frame painted from the character's photos, and the shot is filmed from it.
        // A frame that cannot be made leaves that shot to its description, and the person is told.
        const frames = st.out.frames = st.out.frames || [];
        if (lock()) {
          s.text = `Framing ${who()} in ${st.plan.shots.length} shots`; let missed = 0; let why = ''; let session; draw();
          const one = async (x, i) => { if (frames[i]) return; try { const r = await framePicture({ origin: 'pro', quiet: true, prompt: x.visual + look(), characterId: lock(), fileIds: fileIds(), ratio: st.plan.ratio, sessionId: session, title: `${st.plan.title}: ${x.title}` }, st.estimate.imageModel?.id); session = r.g.sessionId; frames[i] = { ...r.g.media[0], fileId: r.canFilm ? r.fileId : null }; } catch (e) { missed++; why = e.message; if (e.status === 402 || e.code === 'gateway_quota') throw e; } s.note = `${frames.filter(Boolean).length} of ${st.plan.shots.length} frames ready`; if (alive()) { draw(); persist(); } };
          await one(st.plan.shots[0], 0); await Promise.all(st.plan.shots.slice(1).map((x, i) => one(x, i + 1)));
          if (!alive()) return;
          // Without its frame a shot would be filmed with a different face, which is exactly what Face lock is there to prevent: stop and offer another try.
          if (missed) { done(s, 'fail', `${missed} of ${st.plan.shots.length} opening frames with ${who()} could not be made, so nothing was filmed. ${why}`); return push({ t: 'retry', what: 'make' }); }
          s.note = '';
          if (!st.out.keyframe && frames.find(Boolean)) st.out.keyframe = frames.find(Boolean);
        }
        const r = await api('/api/builder/projects', { method: 'POST', body: { origin: 'pro', title: st.plan.title, ratio: st.plan.ratio, resolution: st.estimate.resolution || '720p', modelId: st.estimate.videoModel?.id,
          scenes: st.plan.shots.map((x, i) => ({ type: 'ai', prompt: (frames[i]?.fileId ? holdWords({ kind: 'person', name: who() }) : '') + x.visual + look() + SOUND, duration: x.seconds, narration: x.narration, refFileId: frames[i]?.fileId || undefined })), agent: { prompt: st.brief.prompt, tab: st.brief.kind, look: st.plan.look, from: 'studio-pro' } } });
        st.out.film = { projectId: r.project.id, shots: r.project.scenes.map((x) => ({ id: x.id })) }; done(s); refreshRecents();
      }
      const f = st.out.film;
      if (!f.started) {
        const s = step(`Filming ${st.plan.shots.length} shots with ${st.estimate.videoModel?.name || 'the video model'}`); f.stepIndex = st.items.indexOf(s);
        const r = await api(`/api/builder/projects/${f.projectId}/generate`, { method: 'POST', body: { idem: uid('pro') } }); setCredits(r.credits); f.started = true; persist();
      }
      await watchFilm();
    } catch (e) { const s = st.items[st.out.film?.stepIndex]; if (s?.state === 'run') done(s, 'fail', e.message); else push({ t: 'step', text: 'Making the film', state: 'fail', note: e.message }); push({ t: 'retry', what: 'make' }); }
  }
  async function watchFilm() {
    const f = st.out.film; const s = st.items[f.stepIndex];
    for (;;) {
      const v = await api('/api/builder/projects/' + f.projectId); if (!alive()) return;
      f.shots = v.project.scenes.filter((x) => x.type === 'ai').map((x) => { const ver = x.versions?.[x.cur ?? ((x.versions?.length || 1) - 1)]; const file = ver && v.files[ver.fileId]; return { id: x.id, status: x.status, error: x.error, url: file?.play || file?.url, poster: file?.poster }; });
      const ready = f.shots.filter((x) => x.url).length; const busy = f.shots.some((x) => x.status === 'generating');
      if (s) s.note = `${ready} of ${f.shots.length} shots ready`; draw();
      const ex = (v.project.exports || []).find((x) => x.id === f.exportId);
      if (ex?.status === 'done' && ex.fileId) { f.url = `/api/media/${ex.fileId}`; st.out.clip = { id: ex.fileId, type: 'video', url: f.url, prompt: st.plan.title }; const cut = st.items.find((x) => x.t === 'step' && x.cut && x.state === 'run'); if (cut) done(cut); return finish(); }
      if (ex && !['working', 'done'].includes(ex.status)) throw new Error(ex.error || 'The film could not be cut together. Open it in the Video Builder to export it.');
      if (!busy && !f.exportId) {
        if (ready < f.shots.length && (f.switches || 0) < 2) {
          // Shots that failed cost nothing. They are filmed again with the next model for this quality.
          f.switches = (f.switches || 0) + 1;
          const r = await api('/api/pro/avoid', { method: 'POST', body: { modelId: v.project.modelId, ratio: st.plan.ratio, quality: st.brief.quality, projectId: f.projectId, face: !!lock() } });
          if (s) { s.text = `Filming ${f.shots.length - ready} shot${f.shots.length - ready > 1 ? 's' : ''} again with ${r.model.name}`; s.state = 'run'; }
          const again = await api(`/api/builder/projects/${f.projectId}/generate`, { method: 'POST', body: { idem: uid('pro') } }); setCredits(again.credits); persist(); await sleep(4000); if (!alive()) return; continue;
        }
        if (ready < f.shots.length) { if (s) done(s, ready ? 'done' : 'fail', `${f.shots.length - ready} shot${f.shots.length - ready > 1 ? 's' : ''} could not be filmed and ${f.shots.length - ready > 1 ? 'were' : 'was'} not charged.`); push({ t: 'filmfix' }); return; }
        if (s) done(s);
        const cut = step('Cutting the shots together'); cut.cut = true;
        const r = await api(`/api/builder/projects/${f.projectId}/export`, { method: 'POST', body: { idem: uid('pro') } }); f.exportId = r.job?.payload?.exportId || r.project.exports?.[0]?.id; persist();
      }
      persist(); await sleep(6000); if (!alive()) return;
    }
  }
  function finish() {
    if (st.items.some((x) => x.t === 'done')) return draw();
    const d = st.plan.deliverable;
    const n = (st.out.stills || []).filter(Boolean).length;
    push({ t: 'done', text: d === 'images' ? `Done. ${n} picture${n > 1 ? 's are' : ' is'} ready and saved to Assets.` : d === 'clip' ? 'Done. Your clip is ready and saved to Assets.' : 'Done. Your film is cut together and saved. Open it in the Video Builder to add music, a voice-over or captions.' });
  }
  const retry = (item) => { const i = st.items.indexOf(item); st.items.splice(i, 1); if (st.items[i - 1]?.t === 'step' && st.items[i - 1].state === 'fail') st.items.splice(i - 1, 1); if (item.what === 'plan') return plan(); if (item.what === 'animate') return animate(); const d = st.plan.deliverable; return d === 'images' ? makeStills() : d === 'clip' ? makeClip() : makeFilm(); };

  // ----- drawing -----
  const stepRow = (x) => h('div', { class: 'pa-step ' + x.state }, x.state === 'run' ? h('span', { class: 'spin' }) : icon(x.state === 'fail' ? 'x' : 'check'), h('span', {}, x.text), x.note && h('small', {}, x.note));
  function questionCard(x) {
    const other = h('input', { type: 'text', maxlength: 300, placeholder: 'Something else…' });
    const pick = (a) => { x.picked = a; st.answers.push({ q: x.q.text, a }); draw(); plan(); };
    other.addEventListener('keydown', (e) => { if (e.key === 'Enter' && other.value.trim()) pick(other.value.trim()); });
    return h('div', { class: 'pa-card q' + (x.picked ? ' closed' : '') }, h('b', {}, x.q.text),
      x.picked ? h('p', { class: 'picked' }, icon('check'), x.picked) : [h('div', { class: 'pa-opts' }, x.q.options.map((o) => h('button', { class: 'pa-opt', onclick: () => pick(o.detail ? `${o.label}: ${o.detail}` : o.label) }, h('b', {}, o.label), o.detail && h('small', {}, o.detail)))), h('div', { class: 'pa-other' }, icon('edit'), other, h('button', { class: 'btn sm ghost', onclick: () => pick('You decide.') }, 'Skip'))]);
  }
  function planCard(x) {
    const p = st.plan; const e = st.estimate; const open = x.state === 'open';
    const note = h('input', { type: 'text', maxlength: 1000, placeholder: 'Tell me what to change…' });
    const revise = () => { const t = note.value.trim(); if (!t) return note.focus(); x.state = 'revised'; push({ t: 'user', text: t }); plan({ revise: { plan: p, note: t } }); };
    note.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') revise(); });
    const what = p.deliverable === 'images' ? `${p.stills.length} picture${p.stills.length > 1 ? 's' : ''}` : p.deliverable === 'clip' ? `One ${p.shots[0].seconds} second take` : `A ${e.seconds} second film in ${p.shots.length} shots`;
    return h('div', { class: 'pa-card plan' + (open ? '' : ' closed') },
      h('div', { class: 'pa-plan-head' }, h('b', {}, p.title), h('span', { class: 'tag dim' }, p.ratio), h('span', { class: 'tag dim' }, what), p.deliverable !== 'images' && h('span', { class: 'tag dim' }, `${e.videoModel?.name || ''} · ${e.resolution}`)),
      h('p', {}, p.summary), p.look && h('p', { class: 'look' }, h('b', {}, 'Look: '), p.look),
      h('ol', { class: 'pa-shots' }, (p.deliverable === 'images' ? p.stills.map((s) => [s.title, s.prompt, '']) : p.shots.map((s) => [s.title, s.visual, `${s.seconds}s`, s.narration, s.onscreen])).map(([t, d, len, nar, cap]) => h('li', {}, h('div', {}, h('b', {}, t), len && h('span', { class: 'len' }, len)), h('small', {}, d), nar && h('small', { class: 'nar' }, icon('mic'), nar), cap && h('small', { class: 'nar' }, icon('type'), cap)))),
      open ? h('div', { class: 'pa-acts' }, h('button', { class: 'btn primary', id: 'pa-approve', onclick: () => approve(x) }, icon('check'), `Approve and make it · ${credits(e.credits)}`), h('div', { class: 'pa-other' }, icon('edit'), note, h('button', { class: 'btn sm', onclick: revise }, 'Revise')))
        : h('p', { class: 'picked' }, icon('check'), x.state === 'approved' ? 'Approved' : 'Revised'));
  }
  function frameCard(x) {
    const open = x.state === 'open'; const shot = st.plan.shots[0]; const cost = (st.estimate.perSecond || INFO.videoModel?.perSecond || 0) * shot.seconds;
    return h('div', { class: 'pa-card frame' + (open ? '' : ' closed') }, h('b', {}, 'Does this opening frame work?'), h('img', { class: 'pa-thumb r' + st.plan.ratio.replace(':', '-'), src: st.out.keyframe.url, alt: '', onclick: () => openLightbox(st.out.keyframe) }),
      open ? h('div', { class: 'pa-acts' }, h('button', { class: 'btn primary', id: 'pa-animate', onclick: () => { x.state = 'approved'; draw(); animate(); } }, icon('play'), `Film it · ${credits(cost)}`), h('button', { class: 'btn', onclick: () => { st.items.splice(st.items.indexOf(x), 1); st.out.frameFileId = null; st.out.keyframe = null; st.out.framed = false; makeClip(); } }, icon('retry'), 'New frame'))
        : h('p', { class: 'picked' }, icon('check'), 'Approved'));
  }
  const item = (x) => (x.t === 'user' ? h('div', { class: 'pa-user' }, x.text) : x.t === 'step' ? stepRow(x) : x.t === 'say' ? h('p', { class: 'pa-say' }, x.text) : x.t === 'question' ? questionCard(x) : x.t === 'plan' ? (st.plan ? planCard(x) : null) : x.t === 'frame' ? (st.out.keyframe ? frameCard(x) : null)
    : x.t === 'retry' ? h('div', { class: 'pa-acts' }, h('button', { class: 'btn', onclick: () => retry(x) }, icon('retry'), 'Try again'))
      : x.t === 'filmfix' ? h('div', { class: 'pa-acts' }, h('a', { class: 'btn primary', href: '#/builder/' + st.out.film.projectId }, icon('film'), 'Finish it in the Video Builder'))
        : x.t === 'done' ? h('div', { class: 'pa-done' }, icon('check'), x.text) : null);
  function copyPack() {
    const c = st.plan?.copy; if (!c || !(c.hook || c.caption)) return null;
    const row = (label, value) => value && h('div', { class: 'pa-copy-row' }, h('span', {}, label), h('p', {}, value), h('button', { class: 'icon-btn sm', title: 'Copy', onclick: () => copyText(value) }, icon('copy')));
    return h('div', { class: 'pa-copy' }, h('h3', {}, icon('type'), 'Copy to post with it'), row('Hook', c.hook), row('Caption', c.caption), row('Call to action', c.cta), row('Hashtags', c.hashtags.map((t) => '#' + t).join(' ')));
  }
  function drawStage() {
    const o = st.out; const kids = [];
    const acts = (m) => h('div', { class: 'pa-media-acts' }, h('a', { class: 'btn sm', href: m.url, download: '' }, icon('dl'), 'Download'), m.type !== 'video' && h('button', { class: 'btn sm', onclick: () => openLightbox(m) }, icon('edit'), 'Edit'), m.type !== 'video' && h('button', { class: 'btn sm', onclick: () => { store.set('pro-video-ref', { mediaId: m.id, url: m.url }); location.hash = '#/pro/video'; } }, icon('play'), 'Animate'),
      m.type !== 'video' && h('button', { class: 'btn sm', onclick: () => { location.hash = '#/pro/enhance/' + m.id; } }, icon('wand'), 'Enhance'));
    if (o.clip) kids.push(h('div', { class: 'pa-hero r' + (st.plan?.ratio || '9:16').replace(':', '-') }, mediaEl(o.clip, { autoplay: true, muted: true })), acts(o.clip), o.film && h('a', { class: 'btn sm ghost', href: '#/builder/' + o.film.projectId }, icon('film'), 'Open in the Video Builder: music, voice-over, captions, re-cut'));
    else if (o.frames?.some(Boolean) && !o.film?.shots?.some((x) => x.url)) kids.push(h('div', { class: 'pa-shotgrid' }, st.plan.shots.map((x, i) => h('div', { class: 'pa-shot r' + st.plan.ratio.replace(':', '-') }, o.frames[i] ? h('img', { src: o.frames[i].url, alt: '', onclick: () => openLightbox(o.frames[i]) }) : h('span', { class: 'wait' }, h('span', { class: 'spin' })), h('span', { class: 'n' }, `Shot ${i + 1}`)))), h('p', { class: 'pa-hint' }, `Opening frames with ${who()}. Each shot is filmed from its frame.`));
    else if (o.film?.shots?.length) kids.push(h('div', { class: 'pa-shotgrid' }, o.film.shots.map((x, i) => h('div', { class: 'pa-shot r' + st.plan.ratio.replace(':', '-') }, x.url ? h('video', { src: x.url, poster: x.poster, muted: true, loop: true, playsinline: true, onmouseenter: (e) => e.target.play().catch(() => {}), onmouseleave: (e) => e.target.pause() }) : h('span', { class: 'wait' }, x.status === 'failed' ? icon('x') : h('span', { class: 'spin' })), h('span', { class: 'n' }, `Shot ${i + 1}`)))));
    else if (o.stills) kids.push(h('div', { class: 'pa-stills n' + Math.min(4, st.plan.stills.length) }, st.plan.stills.map((p, i) => { const m = o.stills[i]; return h('figure', { class: 'r' + st.plan.ratio.replace(':', '-') }, m ? [h('img', { src: m.url, alt: p.title, onclick: () => openLightbox(m) }), h('figcaption', {}, p.title), acts(m)] : o.failed?.includes(i) ? h('span', { class: 'wait fail' }, h('small', {}, `"${p.title}" could not be made. Nothing was charged.`), h('button', { class: 'btn sm', onclick: () => makeStills(i) }, icon('retry'), 'Try again')) : h('span', { class: 'wait' }, h('span', { class: 'spin' }))); })));
    else if (o.keyframe) kids.push(h('div', { class: 'pa-hero r' + st.plan.ratio.replace(':', '-') }, h('img', { src: o.keyframe.url, alt: '', onclick: () => openLightbox(o.keyframe) })), h('p', { class: 'pa-hint' }, 'The opening frame. The take is filmed from it.'));
    else kids.push(h('div', { class: 'pa-empty' }, h('span', { class: 'spin' }), h('p', {}, st.plan ? 'Your work appears here as it is made.' : 'Writing the plan…')));
    const cp = (o.clip || o.stills?.some(Boolean)) && copyPack(); if (cp) kids.push(cp);
    stage.replaceChildren(...kids.filter(Boolean));
  }
  function draw() {
    if (!alive()) return;
    const atEnd = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    thread.replaceChildren(...st.items.map(item).filter(Boolean));
    if (atEnd) thread.scrollTop = thread.scrollHeight;
    drawStage();
    const t = $('#pa-title'); if (t) t.textContent = st.plan?.title || st.title;
  }

  $('#main').replaceChildren(topbar(), h('div', { class: 'pro pa-run' }, tabs('agent'),
    h('div', { class: 'pa-head' }, h('a', { class: 'icon-btn', href: '#/pro/agent', title: 'New session' }, icon('plus')), h('b', { id: 'pa-title' }, st.title), st.brief.characterId && h('span', { class: 'tag disc' }, 'Face lock: ' + (st.brief.characterName || 'on')), st.auto && h('span', { class: 'tag new' }, 'Autopilot')),
    h('div', { class: 'pa-split' }, thread, stage)));
  if (fresh) { history.replaceState(null, '', '#/pro/agent/' + st.id); push({ t: 'user', text: st.brief.prompt }); plan(); return; }
  // Reopened: finish what was still being made.
  st.items.forEach((x) => { if (x.t === 'step' && x.state === 'run') x.state = 'done'; });
  draw();
  if (st.out.film?.started && !st.out.film.url && !st.items.some((x) => x.t === 'filmfix')) { const s = st.items[st.out.film.stepIndex]; if (s && !st.out.film.exportId) s.state = 'run'; watchFilm().catch((e) => { push({ t: 'step', text: 'Making the film', state: 'fail', note: e.message }); }); }
  else if (st.out.clipGen && !st.out.clip) animate();
  // Approved but stopped part-way (a closed tab, a failed step whose button was lost): offer to carry on from where it was.
  else if (st.items.some((x) => x.t === 'plan' && x.state === 'approved') && !st.items.some((x) => ['done', 'retry', 'filmfix'].includes(x.t) || (x.t === 'frame' && x.state === 'open'))) push({ t: 'retry', what: 'make' });
}

// ---------- Image and Video tools ----------
const MODES = {
  video: [
    { id: 'generate', label: 'Generate Video', hint: 'From words, with an optional picture to start from.', icon: 'video', task: 'create' },
    { id: 'frame', label: 'Frame to Video', hint: 'Turn a still picture into a moving shot.', icon: 'image', task: 'create', needs: 'image' },
    { id: 'camera', label: 'Camera Control', hint: 'Pans, orbits, push-ins and drone dives on your subject.', icon: 'compass', task: 'create' },
    { id: 'edit', label: 'Edit Video', hint: 'Change anything inside an existing video.', icon: 'edit', task: 'edit', needs: 'video' },
    { id: 'restyle', label: 'Style Transfer', hint: 'Redraw a video as anime, clay, noir and more.', icon: 'palette', task: 'edit', needs: 'video' },
  ],
  image: [
    { id: 'generate', label: 'Generate Image', hint: 'From words, with optional reference pictures.', icon: 'image' },
    { id: 'edit', label: 'Edit Image', hint: 'Describe a change to a picture you add.', icon: 'edit', needs: 'image' },
    { id: 'product', label: 'Product Shoot', hint: 'Put your product photo into a styled scene.', icon: 'bag', needs: 'image' },
    { id: 'restyle', label: 'Style Transfer', hint: 'Redraw a picture in a new style.', icon: 'palette', needs: 'image' },
  ],
};
const SCENES = ['on a marble counter in soft morning light', 'on a beach at golden hour', 'in a minimalist studio on a coloured backdrop', 'held in a hand on a city street', 'on a wooden table with fresh ingredients around it', 'floating with water splashes on a dark background'];

async function renderTool(mode) {
  const token = live; const isVideo = mode === 'video';
  const st = { characterId: '', mode: 'generate', modelId: '', prompt: '', ratio: isVideo ? '9:16' : '1:1', resolution: '720p', duration: 5, count: 1, quality: '', camera: '', lens: '', move: '', restyle: 'anime', scene: SCENES[0], enhance: false, tab: 'feed', ...store.get('pro-' + mode, {}) };
  if (!MODES[mode].some((m) => m.id === st.mode)) st.mode = 'generate';
  const refs = []; let videoUrl = ''; let gens = []; let busy = false; let busyText = '';
  const handed = isVideo && store.get('pro-video-ref', null);
  if (handed) { store.set('pro-video-ref', null); st.mode = 'frame'; try { const f = (await api(`/api/media/${handed.mediaId}/as-file`, { method: 'POST' })).file; refs.push({ id: f.id, kind: 'image', name: f.name, preview: handed.url }); } catch (e) { errToast(e); } if (token !== live) return; }
  const keep = () => { const { tab, ...rest } = st; store.set('pro-' + mode, { ...rest, tab }); };
  const cur = () => MODES[mode].find((m) => m.id === st.mode);
  const locked = () => (CHARS || []).find((c) => c.id === st.characterId) || null;
  const canLock = () => (isVideo ? cur().task === 'create' : st.mode === 'generate' || st.mode === 'edit');
  // With a person locked, video models that refuse a realistic face as a start picture are left out (Seedance 2.0), and so are picture models that take no reference.
  const pool = () => (isVideo ? models('video').filter((m) => m.video.tasks.includes(cur().task) && !(canLock() && locked()?.kind === 'person' && /^doubao-seedance-2\.0/i.test(m.id)) && !(canLock() && locked() && !m.video.imageToVideo)) : models('image').filter((m) => (!cur().needs && !(canLock() && locked())) || m.image.edit));
  const model = () => { const list = pool(); let m = list.find((x) => x.id === st.modelId); if (!m) { m = (isVideo ? list.find((x) => x.id === INFO.videoModel?.id) || list.find((x) => /doubao-seedance-2-5$/.test(x.id)) || list.find((x) => /2-5/.test(x.id)) : list.find((x) => x.id === INFO.imageModel?.id)) || list[0]; if (m) st.modelId = m.id; } return m; };
  const fixed = (m) => isVideo && m && (m.video.durations || []).every((d) => d < 0); // edit models follow the length of the video they are given
  const cost = () => { const m = model(); if (!m) return 0; return isVideo ? (fixed(m) ? 0 : (m.price.creditsPerSecond[st.resolution] || 0) * st.duration * st.count) : (m.price.creditsPerImage || 0) * st.count; };

  const panel = h('aside', { class: 'pt-panel', id: 'pt-panel' }); const feed = h('div', { class: 'pt-feed', id: 'pt-feed' }); const ta = h('textarea', { id: 'pt-prompt', maxlength: 4000, rows: 4 }, st.prompt);
  ta.addEventListener('input', () => { st.prompt = ta.value; keep(); });
  const link = h('input', { type: 'url', id: 'pt-url', maxlength: 1000, placeholder: 'or paste a direct link to a video (https://… .mp4)', oninput: (e) => { videoUrl = e.target.value.trim(); } });
  const addRef = (kind) => pickFiles(kind === 'video' ? 'video/*' : 'image/*', false, async (picked) => { const slot = { name: picked[0].name, kind, busy: true }; refs.push(slot); drawPanel(); try { const f = (await uploadFiles(picked))[0]; if (!f) throw new Error('That file could not be added.'); Object.assign(slot, { id: f.id, busy: false, preview: kind === 'image' ? URL.createObjectURL(picked[0]) : '' }); } catch (e) { refs.splice(refs.indexOf(slot), 1); errToast(e); } drawPanel(); });
  const row = (label, node, cls = '') => h('label', { class: 'pt-field ' + cls }, h('span', {}, label), node);
  const select = (id, value, opts, on) => { const s = h('select', { id, onchange: (e) => { on(e.target.value); keep(); drawPanel(); } }, opts.map(([v, l]) => h('option', { value: v }, l))); s.value = String(value); return s; };
  const menuBtn = (id, label, value, items, on, logo) => h('button', { class: 'pt-pick', id, onclick: (e) => popover(e.currentTarget, h('div', { class: 'menu pt-menu' }, items.map((it) => h('button', { 'data-v': it.id, onclick: () => { closePop(); on(it.id); keep(); drawPanel(); } }, it.logo || (it.icon && icon(it.icon)), h('span', { class: 'grow' }, h('b', {}, it.label), it.hint && h('small', {}, it.hint)), it.id === value && icon('check', 'chk'))))) }, logo, h('span', { class: 'grow' }, h('small', {}, label), h('b', {}, items.find((x) => x.id === value)?.label || 'None')), icon('arrowDown'));

  function compose() {
    const m = cur(); let p = ta.value.trim(); const look = INFO.restyles.find((x) => x.id === st.restyle);
    if (st.mode === 'restyle') p = isVideo ? `Restyle this video as ${look.say}. Keep the same motion, timing, framing and subjects.${p ? ' ' + p : ''}` : `Redraw this image in ${look.say}. Keep the same subject and composition.${p ? ' ' + p : ''}`;
    if (st.mode === 'product') p = `Professional product photograph of this exact product, unchanged, ${st.scene}. Commercial lighting, sharp focus on the product, no added text.${p ? ' ' + p : ''}`;
    if (st.mode === 'frame' && !p) p = 'Bring this picture to life with natural, subtle motion. Keep the subject and the framing.';
    if (st.mode === 'edit' && !isVideo && p) p = `Edit this image: ${p}. Keep everything else exactly as it is.`;
    if (!p) throw new Error(st.mode === 'camera' ? 'Describe the subject and the scene. The camera move is added for you.' : m.needs && st.mode === 'edit' ? 'Describe the change you want.' : 'Describe what you want to see.');
    if (isVideo && m.task === 'create') {
      const mv = INFO.moves.find((x) => x.id === st.move); const cam = INFO.cameras.find((x) => x.id === st.camera); const lens = INFO.lenses.find((x) => x.id === st.lens);
      if (st.mode === 'camera' && !mv?.say) throw new Error('Pick a camera move.');
      p += [mv?.say && ' ' + mv.say, (cam?.say || lens?.say) && ` Shot ${[cam?.say, lens?.say].filter(Boolean).join(', ').replace(/^shot /, '')}.`].filter(Boolean).join('');
    }
    return p;
  }
  async function go() {
    const m = cur(); const mdl = model(); if (busy) return;
    try {
      if (!mdl) throw new Error('No model is available for this right now.');
      if (refs.some((r) => r.busy)) throw new Error('Your file is still uploading. One moment.');
      const imgs = refs.filter((r) => r.kind === 'image' && r.id); const vids = refs.filter((r) => r.kind === 'video' && r.id);
      if (m.needs === 'image' && !imgs.length) throw new Error('Add a picture first.');
      if (m.needs === 'video' && !vids.length && !videoUrl) throw new Error('Add the video first: upload it or paste a direct link.');
      const prompt = compose(); const ch = canLock() ? locked() : null;
      if (ch && isVideo) {
        // Face lock: an opening frame is painted from the character's photos, and the video is filmed from that frame.
        busy = true; busyText = `Framing ${ch.name}…`; drawPanel();
        const f = await framePicture({ prompt: ta.value.trim() || prompt, characterId: ch.id, fileIds: imgs.slice(0, 1).map((r) => r.id), ratio: st.ratio, title: `${ch.name}: ${(ta.value.trim() || 'opening frame').slice(0, 50)}` }, INFO.imageModel?.id);
        if (token !== live) return;
        if (!f.canFilm) throw new Error(`The opening frame of ${ch.name} was made (it is in Assets), but it has no web link the video model can start from. Please try again.`);
        busyText = 'Starting the video…'; drawPanel();
        const g = await generate({ mode, model: mdl.id, prompt: holdWords(ch) + prompt, typedPrompt: ta.value, fileIds: [f.fileId], task: 'create', count: st.count, params: { ratio: st.ratio, resolution: st.resolution, duration: st.duration } });
        if (token !== live) return; gens.unshift(g); st.tab = 'feed'; drawFeed(); if (g.status === 'pending') watch(g); return;
      }
      if (isVideo && m.task === 'create' && imgs.length && !(await api('/api/pro/link-check', { method: 'POST', body: { fileIds: [imgs[0].id] } })).ok) throw new Error('The video models can only start from a picture that has a public web address. Pictures made by the Studio Pro Agent have one for a few hours (use their Animate button). For your own uploads, Scenly must run on a public address or have file storage connected.');
      const body = isVideo ? { mode, model: mdl.id, prompt, typedPrompt: ta.value, fileIds: (m.needs === 'video' ? vids : imgs.slice(0, 1)).map((r) => r.id), videoUrl: m.needs === 'video' && !vids.length ? videoUrl : undefined, task: m.task, count: st.count, enhance: st.enhance && m.task === 'create' && st.mode !== 'frame', params: fixed(mdl) ? { resolution: st.resolution } : { ratio: st.ratio, resolution: st.resolution, duration: st.duration } }
        : { mode, model: mdl.id, prompt, typedPrompt: ta.value, characterId: ch?.id, fileIds: imgs.slice(0, mdl.image.edit?.max_images || 0).map((r) => r.id), count: st.count, enhance: st.enhance && st.mode === 'generate', params: { size: sizeFor(st.ratio), quality: st.quality || undefined } };
      busy = true; drawPanel();
      const g = await generate(body); if (token !== live) return;
      gens.unshift(g); st.tab = 'feed'; drawFeed(); if (g.status === 'pending') watch(g);
    } catch (e) { errToast(e); } finally { busy = false; busyText = ''; if (token === live) drawPanel(); }
  }
  const watch = (g) => waitGen(g, token).then((done) => { if (!done) return; const i = gens.findIndex((x) => x.id === done.id); if (i >= 0) gens[i] = done; drawFeed(); });

  function drawPanel() {
    const m = cur(); const mdl = model(); const list = pool();
    if (isVideo && mdl) { const v = mdl.video; if (!v.resolutions.includes(st.resolution)) st.resolution = v.resolutions.includes('720p') ? '720p' : v.resolutions[0]; if (!fixed(mdl)) { if (!v.ratios.includes(st.ratio)) st.ratio = v.ratios.includes('9:16') ? '9:16' : v.ratios[0]; if (!v.durations.includes(st.duration)) st.duration = v.durations.includes(5) ? 5 : v.durations[0]; } }
    if (!isVideo && mdl) { if (!mdl.image.qualities.includes(st.quality)) st.quality = mdl.image.qualities.includes('medium') ? 'medium' : mdl.image.qualities[0] || ''; if (!IMG_SHAPES.some(([r]) => r === st.ratio)) st.ratio = '1:1'; }
    if (!countOptions(isVideo ? null : mdl).includes(st.count)) st.count = 1;
    ta.placeholder = st.mode === 'restyle' ? 'Optional: anything to keep or change' : st.mode === 'product' ? 'Optional: props, mood, colours' : st.mode === 'edit' ? 'Describe the change, for example: make the jacket red' : st.mode === 'frame' ? 'Optional: what should move, and how' : st.mode === 'camera' ? 'Describe the subject and the scene' : isVideo ? 'Describe the scene: who, where, what happens' : 'Describe the picture';
    const refKind = m.needs === 'video' ? 'video' : 'image'; const shown = refs.filter((r) => r.kind === refKind);
    const durs = mdl && isVideo && !fixed(mdl) ? mdl.video.durations : [];
    const c = cost();
    fill(panel,
      menuBtn('pt-mode', 'Mode', st.mode, MODES[mode], (v) => { st.mode = v; st.modelId = ''; }, h('span', { class: 'pt-ic' }, icon(m.icon))),
      mdl ? menuBtn('pt-model', 'Model', mdl.id, list.map((x) => ({ id: x.id, label: shortName(x), hint: x.blurb || x.short || '', logo: modelLogo(x, 'logo-xs') })), (v) => { st.modelId = v; }, modelLogo(mdl, 'logo-xs')) : h('div', { class: 'err' }, 'No model can do this right now.'),
      h('div', { class: 'pt-refs' }, h('small', {}, m.needs ? (refKind === 'video' ? 'Video to work on' : st.mode === 'product' ? 'Your product photo' : 'Picture to work on') : isVideo ? 'Start picture (optional)' : 'Reference pictures (optional)'),
        h('div', { class: 'pt-reflist' }, shown.map((r) => h('span', { class: 'pt-ref' }, r.busy ? h('span', { class: 'spin' }) : r.preview ? h('img', { src: r.preview, alt: '' }) : icon(r.kind === 'video' ? 'video' : 'image'), h('button', { class: 'icon-btn sm', title: 'Remove ' + r.name, onclick: () => { refs.splice(refs.indexOf(r), 1); drawPanel(); } }, icon('x')))),
          shown.length < (isVideo ? 1 : 2) && h('button', { class: 'pt-addref', id: 'pt-addref', title: 'Upload', onclick: () => addRef(refKind) }, icon('plus'))),
        refKind === 'video' && link),
      canLock() && faceLock(() => st.characterId, (v) => { st.characterId = v; st.modelId = ''; keep(); }, drawPanel, 'pt-pick'),
      canLock() && locked() && h('small', { class: 'fl-note' }, isVideo ? `An opening frame of ${locked().name} is painted first (${credits(INFO.imageModel?.credits || 0)}), then the video is filmed from it. The face is exact at the start and holds best in shots of 4 to 6 seconds.` : `${locked().name}'s photos are given to the image model with every picture.`),
      st.mode === 'restyle' && h('div', { class: 'pt-looks', id: 'pt-looks' }, INFO.restyles.map((x) => h('button', { class: 'chipbtn' + (st.restyle === x.id ? ' on' : ''), onclick: () => { st.restyle = x.id; keep(); drawPanel(); } }, x.label))),
      st.mode === 'product' && row('Scene', select('pt-scene', st.scene, SCENES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]), (v) => { st.scene = v; })),
      h('div', { class: 'pt-prompt' }, h('small', {}, 'Prompt'), ta),
      h('div', { class: 'pt-two' },
        isVideo && durs.length > 0 && row('Duration', h('div', { class: 'pt-stepper', id: 'pt-dur' }, h('button', { onclick: () => { const i = durs.indexOf(st.duration); if (i > 0) { st.duration = durs[i - 1]; keep(); drawPanel(); } } }, '−'), h('b', {}, st.duration + 's'), h('button', { onclick: () => { const i = durs.indexOf(st.duration); if (i < durs.length - 1) { st.duration = durs[i + 1]; keep(); drawPanel(); } } }, '+'))),
        isVideo && mdl && !fixed(mdl) && row('Aspect ratio', select('pt-ratio', st.ratio, mdl.video.ratios.filter((r) => r !== 'adaptive').map((r) => [r, r]), (v) => { st.ratio = v; })),
        isVideo && mdl && row('Resolution', select('pt-res', st.resolution, mdl.video.resolutions.map((r) => [r, r]), (v) => { st.resolution = v; })),
        !isVideo && row('Shape', select('pt-ratio', st.ratio, IMG_SHAPES, (v) => { st.ratio = v; })),
        !isVideo && mdl?.image.qualities.length > 0 && row('Quality', select('pt-quality', st.quality, mdl.image.qualities.map((q) => [q, q[0].toUpperCase() + q.slice(1)]), (v) => { st.quality = v; })),
        row('How many', select('pt-count', st.count, countOptions(isVideo ? null : mdl).map((n) => [n, String(n)]), (v) => { st.count = Number(v); }))),
      isVideo && m.task === 'create' && h('div', { class: 'pt-two' },
        menuBtn('pt-camera', 'Camera', st.camera, INFO.cameras.map((x) => ({ id: x.id, label: x.label })), (v) => { st.camera = v; }),
        menuBtn('pt-lens', 'Lens', st.lens, INFO.lenses.map((x) => ({ id: x.id, label: x.label + (x.mm ? ` · ${x.mm}mm` : '') })), (v) => { st.lens = v; })),
      isVideo && m.task === 'create' && menuBtn('pt-move', 'Camera move', st.move, INFO.moves.map((x) => ({ id: x.id, label: x.label })), (v) => { st.move = v; }),
      st.mode === 'generate' && h('label', { class: 'pt-switch' }, h('span', {}, 'Enhance prompt', info('AI rewrites a short idea into a detailed prompt before generating.')), h('button', { class: 'switch' + (st.enhance ? ' on' : ''), id: 'pt-enhance', role: 'switch', 'aria-checked': String(!!st.enhance), onclick: () => { st.enhance = !st.enhance; keep(); drawPanel(); } })),
      h('button', { class: 'btn primary block pt-go', id: 'pt-go', disabled: busy, onclick: go }, busy ? h('span', { class: 'spin' }) : icon('sparkle'), busy ? busyText || 'Starting…' : 'Generate', !busy && h('span', { class: 'cost' }, c ? credits(c) : isVideo ? 'priced by video length' : '')));
  }
  const genCard = (g) => h('article', { class: 'pt-gen', 'data-gen': g.id },
    h('div', { class: 'pt-media n' + Math.min(4, Math.max(1, g.media?.length || g.params?.count || 1)) }, g.status === 'pending' ? Array.from({ length: g.params?.count || 1 }, () => h('span', { class: 'wait' }, h('span', { class: 'spin' }), h('small', {}, 'Filming…'))) : g.media?.length ? g.media.map((m) => (m.type === 'video' ? mediaEl(m) : h('img', { src: m.url, alt: '', loading: 'lazy', onclick: () => openLightbox(m, g) }))) : h('span', { class: 'wait fail' }, icon('x'), h('small', {}, g.error || g.note || 'Could not be made. No credits were charged.'))),
    h('p', { class: 'clip2', title: g.prompt }, g.displayPrompt || g.originalPrompt || g.prompt),
    h('div', { class: 'pt-meta' }, byId(g.model) && h('span', { class: 'tag dim' }, shortName(byId(g.model))), g.params?.ratio && h('span', { class: 'tag dim' }, g.params.ratio), g.params?.duration > 0 && h('span', { class: 'tag dim' }, g.params.duration + 's'), g.params?.size && h('span', { class: 'tag dim' }, g.params.size), h('span', { class: 'grow' }),
      h('button', { class: 'icon-btn sm', title: 'Reuse this prompt', onclick: () => { ta.value = g.originalPrompt || g.typedPrompt || g.prompt; st.prompt = ta.value; keep(); ta.focus(); } }, icon('retry')),
      g.media?.[0] && h('a', { class: 'icon-btn sm', title: 'Download', href: g.media[0].url, download: '' }, icon('dl'))));
  function drawFeed() {
    $$('#pt-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === st.tab));
    if (st.tab === 'ideas') { const list = INFO.templates.filter((t) => (isVideo ? t.kind !== 'product' : t.kind === 'product')); return feed.replaceChildren(h('p', { class: 'pt-note' }, 'Templates open in the Agent, which plans and makes the whole piece for you.'), h('div', { class: 'pro-grid' }, list.map(templateCard))); }
    feed.replaceChildren(...(gens.length ? [h('div', { class: 'pt-gens' }, gens.map(genCard))] : [h('div', { class: 'pt-empty' }, icon(isVideo ? 'video' : 'image'), h('b', {}, isVideo ? 'Your videos appear here' : 'Your pictures appear here'), h('p', {}, 'Set it up on the right and press Generate.'))]));
  }
  $('#main').replaceChildren(topbar(), h('div', { class: 'pro pt' }, tabs(mode),
    h('div', { class: 'pt-split' }, h('div', { class: 'pt-left' }, h('div', { class: 'seg', id: 'pt-tabs' }, [['feed', 'Generations'], ['ideas', 'Ideas']].map(([k, l]) => h('button', { 'data-tab': k, onclick: () => { st.tab = k; keep(); drawFeed(); } }, l))), h('div', { class: 'scroll' }, feed)), panel)));
  drawPanel(); drawFeed();
  loadChars().then(() => { if (token === live) { if (st.characterId && !CHARS.some((c) => c.id === st.characterId)) st.characterId = ''; drawPanel(); } });
  try { gens = (await api(`/api/generations?mode=${mode}&limit=40`)).generations; } catch (e) { errToast(e); }
  if (token !== live) return;
  drawFeed(); gens.filter((g) => g.status === 'pending').forEach(watch);
}

// ---------- Enhancer ----------
async function renderEnhance(mediaId) {
  const token = live; const st = { engine: 'both', strength: 'balanced', ...store.get('pro-enhance', {}) };
  let src = null; let out = null; let busy = ''; let pos = 50; let extra = '';
  const body = h('div', { class: 'pe', id: 'pe' });
  const keep = () => store.set('pro-enhance', st);
  const pickAsset = async (e) => {
    const anchor = e.currentTarget; let items = [];
    try { items = (await api('/api/library')).items.filter((m) => m.type === 'image').slice(0, 60); } catch (err) { return errToast(err); }
    if (!items.length) return toast('You have no pictures in Assets yet. Upload one instead.');
    popover(anchor, h('div', { class: 'pe-assets' }, items.map((m) => h('button', { onclick: () => { closePop(); src = m; out = null; draw(); } }, h('img', { src: m.url, alt: '', loading: 'lazy' })))));
  };
  const upload = () => pickFiles('image/*', false, async (picked) => { busy = 'Adding your picture…'; draw(); try { const f = (await uploadFiles(picked))[0]; if (!f) throw new Error('That picture could not be added.'); const r = await api('/api/pro/import', { method: 'POST', body: { fileId: f.id } }); src = r.media; out = null; refreshRecents(); } catch (e) { errToast(e); } busy = ''; if (token === live) draw(); });
  async function run() {
    try {
      let m = src;
      if (st.engine !== 'sharp') { busy = 'Adding detail with AI…'; draw(); const r = await api('/api/pro/enhance', { method: 'POST', body: { mediaId: src.id, strength: st.strength, prompt: extra }, timeoutMs: 5 * 60000 }); setCredits(r.credits); if (!r.media) throw new Error('The picture could not be enhanced this time. No credits were charged.'); m = r.media; out = m; }
      if (st.engine !== 'ai') { busy = 'Upscaling to 4K…'; draw(); const r = await api(`/api/media/${m.id}/upscale`, { method: 'POST', timeoutMs: 3 * 60000 }); out = r.generation.media[0]; }
      refreshRecents();
    } catch (e) { errToast(e); }
    busy = ''; if (token === live) draw();
  }
  function draw() {
    if (!src) return body.replaceChildren(h('div', { class: 'pe-start' }, h('span', { class: 'ic' }, icon('wand')), h('h1', {}, 'Enhancer'), h('p', {}, 'Sharpen, add real detail and upscale any picture up to 4K.'),
      busy ? h('p', { class: 'pe-busy' }, h('span', { class: 'spin' }), busy) : h('div', { class: 'pe-btns' }, h('button', { class: 'btn primary', id: 'pe-upload', onclick: upload }, icon('upload'), 'Upload'), h('button', { class: 'btn', id: 'pe-asset', onclick: pickAsset }, icon('folder'), 'Select asset')),
      h('small', {}, 'Pictures only for now: the gateway has no video upscaler yet.')));
    const price = st.engine === 'sharp' ? 0 : INFO.imageModel?.credits || 0;
    const view = out
      ? h('div', { class: 'pe-compare', id: 'pe-compare', style: { '--pos': pos + '%' }, onpointermove: (e) => { if (e.buttons || e.pointerType === 'mouse') { const r = e.currentTarget.getBoundingClientRect(); pos = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)); e.currentTarget.style.setProperty('--pos', pos + '%'); } } }, h('img', { src: out.url, alt: 'After' }), h('img', { class: 'before', src: src.url, alt: 'Before' }), h('span', { class: 'bar' }), h('span', { class: 'lab l' }, 'Before'), h('span', { class: 'lab r' }, 'After'))
      : h('div', { class: 'pe-compare single' }, h('img', { src: src.url, alt: '' }), busy && h('span', { class: 'pe-veil' }, h('span', { class: 'spin' }), busy));
    const opt = (key, value, label, hint) => h('button', { class: 'pe-opt' + (st[key] === value ? ' on' : ''), 'data-v': value, onclick: () => { st[key] = value; keep(); draw(); } }, h('b', {}, label), h('small', {}, hint));
    const note = h('input', { type: 'text', maxlength: 400, value: extra, placeholder: 'Optional: what to focus on, such as skin texture', oninput: (e) => { extra = e.target.value; } });
    fill(body, h('div', { class: 'pe-work' }, h('div', { class: 'pe-stage' }, view),
      h('aside', { class: 'pt-panel' },
        h('small', { class: 'cap' }, 'What to do'),
        opt('engine', 'both', 'AI detail + 4K', 'Redraws fine detail, then upscales. Best result.'), opt('engine', 'ai', 'AI detail', 'Redraws texture, focus and light at the same size.'), opt('engine', 'sharp', 'Upscale to 4K', 'A sharpened enlargement. Free, changes nothing.'),
        st.engine !== 'sharp' && [h('small', { class: 'cap' }, 'AI strength'), h('div', { class: 'seg pe-seg' }, [['subtle', 'Subtle'], ['balanced', 'Balanced'], ['strong', 'Strong']].map(([v, l]) => h('button', { class: st.strength === v ? 'on' : '', onclick: () => { st.strength = v; keep(); draw(); } }, l))), note],
        h('button', { class: 'btn primary block pt-go', id: 'pe-go', disabled: !!busy, onclick: run }, busy ? h('span', { class: 'spin' }) : icon('wand'), busy || 'Enhance', !busy && h('span', { class: 'cost' }, price ? credits(price) : 'free')),
        out && h('a', { class: 'btn block', href: out.url, download: '' }, icon('dl'), 'Download result'),
        h('button', { class: 'btn ghost block', onclick: () => { src = null; out = null; draw(); } }, icon('retry'), 'Another picture'))));
  }
  $('#main').replaceChildren(topbar(), h('div', { class: 'pro pt' }, tabs('enhance'), body));
  if (mediaId) { try { const items = (await api('/api/library')).items; src = items.find((m) => m.id === mediaId && m.type !== 'video') || null; } catch { /* start empty */ } if (token !== live) return; }
  draw();
}

// ---------- Ad Studio ----------
const PLACEMENTS = [
  { id: 'feed', label: 'Feed post', ratio: '1:1', hint: 'Square picture ads for Instagram, Facebook and LinkedIn feeds.', icon: 'grid' },
  { id: 'story', label: 'Stories & Reels', ratio: '9:16', hint: 'Tall picture ads, edge to edge on a phone.', icon: 'poster' },
  { id: 'video', label: 'Video ad', ratio: '9:16', hint: 'A short vertical video for each idea, made by the Agent.', icon: 'video' },
];
async function renderAds(bid) {
  const token = live;
  if (!bid) {
    const input = h('input', { type: 'text', id: 'ad-url', maxlength: 300, placeholder: 'yourbrand.com' }); const go = h('button', { class: 'btn primary', id: 'ad-go' }); const list = h('div', { class: 'ad-brands', id: 'ad-brands' });
    const idle = () => { go.disabled = false; go.replaceChildren(icon('sparkle'), 'Build brand kit'); };
    const make = async (body) => { go.disabled = true; const notes = body.url ? ['Opening the website…', 'Reading its pages…', 'Looking at pricing and products…', 'Collecting the logo and pictures…', 'Writing the brand kit…'] : ['Setting up…']; let n = 0; const say = () => go.replaceChildren(h('span', { class: 'spin' }), notes[Math.min(n++, notes.length - 1)]); say(); const tick = setInterval(say, 6000); try { const r = await api('/api/pro/brands', { method: 'POST', body, timeoutMs: 150000 }).finally(() => clearInterval(tick)); if (r.balance != null) setCredits(r.balance); location.hash = '#/ads/' + r.brand.id; } catch (e) { errToast(e); idle(); } };
    go.onclick = () => { const u = input.value.trim(); if (u.length < 4) { input.focus(); return toast('Type your website address, like yourbrand.com', 'error'); } make({ url: u }); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); }); idle();
    $('#main').replaceChildren(topbar(), frame(tabs('ads'),
      h('section', { class: 'pro-hero ad-hero' }, h('span', { class: 'eyebrow' }, icon('megaphone'), 'Ad Studio'), h('h1', {}, 'Turn your website into a brand kit and ads.'),
        h('p', {}, `Paste the address. The page is read once (${credits(INFO.planCredits)}) and becomes your colours, tone, selling points and products. Then pick where the ads run.`),
        h('div', { class: 'pro-ask ad-ask' }, icon('globe'), input, go),
        h('button', { class: 'btn ghost sm', id: 'ad-manual', onclick: () => make({ kit: { name: 'My brand' } }) }, 'or set up your brand by hand')),
      h('h2', {}, icon('palette'), 'Your brands'), list));
    try { const r = await api('/api/pro/brands'); if (token !== live) return; fill(list, r.brands.length ? r.brands.map((b) => h('a', { class: 'ad-brand', href: '#/ads/' + b.id, style: { background: `linear-gradient(135deg, ${b.primary}, ${b.secondary})` } }, h('b', {}, b.name), h('small', {}, b.tagline || b.website))) : h('p', { class: 'pt-note' }, 'No brands yet. Paste a website above to make the first one.')); } catch (e) { errToast(e); }
    return;
  }
  let b; try { b = (await api('/api/pro/brands')).brands.find((x) => x.id === bid); } catch (e) { errToast(e); }
  if (token !== live) return; if (!b) { toast('That brand no longer exists', 'error'); location.hash = '#/ads'; return; }
  const st = { template: store.get('pro-ad-template', 'auto'), placement: 'feed', per: 1, picked: new Set(b.products.slice(0, 2).map((p) => p.name)), ads: (b.ads || []).map((a) => ({ ...a, placement: PLACEMENTS.find((x) => x.id === a.place) || PLACEMENTS[0] })), busy: '' };
  const saveAds = () => api('/api/pro/brands/' + b.id, { method: 'PUT', body: { kit: b, logoFileId: b.logoFileId, ads: st.ads.filter((a) => a.state !== 'run').map(({ placement, ...a }) => ({ ...a, place: placement.id })) } }).catch(() => {});
  const kitBox = h('div', { class: 'ad-kit', id: 'ad-kit' }); const makeBox = h('div', { class: 'ad-make', id: 'ad-make' }); const out = h('div', { class: 'ad-out', id: 'ad-out' });
  b.assets = b.assets || [];
  let saveT = null; const saveKit = () => { clearTimeout(saveT); saveT = setTimeout(() => api('/api/pro/brands/' + b.id, { method: 'PUT', body: { kit: b, logoFileId: b.logoFileId, assets: b.assets } }).catch(errToast), 600); };
  const thumb = (fid) => `/api/files/${fid}/raw`;
  const ROLE = { logo: 'Logo', product: 'Product', image: 'Picture' };
  // What one of the site's pictures is used for: the logo, a product's photo, or just a brand picture.
  const assetMenu = (e, a) => popover(e.currentTarget, h('div', { class: 'menu ad-asset-menu' },
    h('div', { class: 'menu-cap' }, 'Use this picture as'),
    h('button', { onclick: () => { closePop(); b.assets.forEach((x) => { if (x.role === 'logo') x.role = 'image'; }); a.role = 'logo'; b.logoFileId = a.fileId; saveKit(); drawKit(); } }, icon('star'), 'The brand logo', b.logoFileId === a.fileId && icon('check', 'chk')),
    ...b.products.map((p) => h('button', { onclick: () => { closePop(); p.imageId = p.imageId === a.fileId ? undefined : a.fileId; if (p.imageId) a.role = 'product'; if (b.logoFileId === a.fileId) b.logoFileId = null; saveKit(); drawKit(); drawMake(); } }, icon('bag'), h('span', { class: 'grow' }, 'Photo of ' + p.name), p.imageId === a.fileId && icon('check', 'chk'))),
    h('hr'),
    h('a', { href: thumb(a.fileId), target: '_blank', onclick: closePop }, icon('expand'), 'Open full size'),
    h('button', { style: { color: 'var(--danger)' }, onclick: () => { closePop(); b.assets = b.assets.filter((x) => x !== a); b.products.forEach((p) => { if (p.imageId === a.fileId) p.imageId = undefined; }); if (b.logoFileId === a.fileId) b.logoFileId = null; saveKit(); drawKit(); drawMake(); } }, icon('trash'), 'Remove from this brand')));
  const addAssets = () => pickFiles('image/*', true, async (picked) => { try { const fs = await uploadFiles(picked.slice(0, 8)); for (const f of fs) b.assets.push({ fileId: f.id, role: 'image', alt: f.name }); saveKit(); drawKit(); toast('Added. Click a picture to say what it shows.'); } catch (e) { errToast(e); } });
  const reread = async (e) => { if (!confirm(`Read ${b.website} again? The brand kit and its pictures are replaced with what the site says now. Ads you made are kept.`)) return; const btn = e.currentTarget; btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin' }), 'Reading…'); try { const r = await api(`/api/pro/brands/${b.id}/reread`, { method: 'POST', timeoutMs: 150000 }); setCredits(r.balance); location.reload(); } catch (err) { errToast(err); drawKit(); } };
  const fld = (label, key, big) => h('label', { class: 'ad-field' + (big ? ' big' : '') }, h('span', {}, label), big ? h('textarea', { rows: big, maxlength: 700, oninput: (e) => { b[key] = e.target.value; saveKit(); } }, b[key] || '') : h('input', { type: 'text', maxlength: 300, value: b[key] || '', oninput: (e) => { b[key] = e.target.value; saveKit(); } }));
  const colour = (label, key) => h('label', { class: 'ad-field colour' }, h('span', {}, label), h('span', { class: 'sw' }, h('input', { type: 'color', value: b[key], oninput: (e) => { b[key] = e.target.value.toUpperCase(); saveKit(); e.target.nextSibling.textContent = b[key]; } }), h('code', {}, b[key])));
  function drawKit() {
    fill(kitBox, h('div', { class: 'ad-kit-head' }, h('h2', {}, icon('palette'), 'Brand kit'), h('small', {}, 'Fix anything that looks off. Changes save by themselves.'), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', title: 'Delete this brand', onclick: async () => { if (!confirm(`Delete the brand "${b.name}"? Ads you made stay in Assets.`)) return; await api('/api/pro/brands/' + b.id, { method: 'DELETE' }); location.hash = '#/ads'; } }, icon('trash'))),
    h('div', { class: 'ad-grid' }, fld('Name', 'name'), fld('Tagline', 'tagline'), fld('Description', 'description', 3), colour('Primary colour', 'primary'), colour('Secondary colour', 'secondary'), fld('Look', 'aesthetics', 2), fld('Tone of voice', 'tone', 2), fld('Audience', 'audience', 2),
      h('label', { class: 'ad-field big' }, h('span', {}, 'Selling points, one per line'), h('textarea', { rows: 5, maxlength: 1400, oninput: (e) => { b.points = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); saveKit(); } }, b.points.join('\n'))),
      h('div', { class: 'ad-field big ad-assets-box' }, h('div', { class: 'ad-assets-head' }, h('span', {}, 'Logo and pictures', b.read?.how === 'browser' ? ` · found on ${b.read.pages.map((p) => p.kind).join(', ')}` : ''), h('span', { class: 'grow' }), b.website && h('button', { class: 'btn sm ghost', id: 'ad-reread', title: 'Open the website again and rebuild the kit from it', onclick: reread }, icon('retry'), 'Read the site again'), h('button', { class: 'btn sm', id: 'ad-add-asset', onclick: addAssets }, icon('upload'), 'Add pictures')),
        b.assets.length ? h('div', { class: 'ad-assets', id: 'ad-assets' }, b.assets.map((a) => { const prod = b.products.find((p) => p.imageId === a.fileId); const isLogo = b.logoFileId === a.fileId; return h('button', { class: 'ad-asset' + (isLogo ? ' logo' : ''), title: a.alt || 'Click to say what this picture is', onclick: (e) => assetMenu(e, a) }, h('img', { src: thumb(a.fileId), alt: a.alt || '', loading: 'lazy' }), h('span', { class: 'tag ' + (isLogo ? 'new' : prod ? 'disc' : 'dim') }, isLogo ? 'Logo' : prod ? prod.name : ROLE[a.role] || 'Picture')); }))
          : h('small', {}, 'No pictures yet. Add your logo and product photos: ads with a real product photo show the real product.'),
        b.assets.length > 0 && h('small', {}, 'Click a picture to make it the logo or the photo of a product. A product with a photo is shown as it really looks in its ads.'))));
  }
  const tplOf = (a) => (INFO.adTemplates || []).find((t) => t.id === a.template && t.id !== 'auto');
  const brief = (a) => `${tplOf(a) ? `Ad format: ${tplOf(a).label}. ${tplOf(a).video} ` : ''}${a.visual} Brand: ${b.name}. ${b.description} Look: ${b.aesthetics} Brand colours ${b.primary} and ${b.secondary}. Headline idea: "${a.headline}".`;
  async function generateAds() {
    const p = PLACEMENTS.find((x) => x.id === st.placement);
    try {
      st.busy = 'Writing the ad ideas…'; drawMake();
      const r = await api(`/api/pro/brands/${b.id}/concepts`, { method: 'POST', body: { products: [...st.picked], per: st.per, format: p.id === 'video' ? 'video' : 'static', template: st.template }, timeoutMs: 90000 });
      setCredits(r.balance); if (token !== live) return;
      const batch = r.ads.map((a) => ({ ...a, placement: p, template: st.template, state: p.id === 'video' ? 'idea' : 'run' })); st.ads = [...batch, ...st.ads]; st.busy = ''; drawMake(); drawOut();
      if (p.id === 'video') return saveAds();
      let session; // the first picture alone, so the rest join its entry in Recents
      // The image model takes two references: the product's real photo first, the logo second.
      const refsFor = (a) => { const want = String(a.product || '').toLowerCase().trim(); const prod = b.products.find((x) => x.imageId && x.name.toLowerCase() === want) || (want && b.products.filter((x) => x.imageId && st.picked.has(x.name)).find((x) => want.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(want))) || (st.picked.size === 1 ? b.products.find((x) => x.imageId && st.picked.has(x.name)) : null); const ids = [prod?.imageId, b.logoFileId].filter(Boolean); const lead = [prod && `Reference image 1 is the real photo of ${prod.name}: show this exact product, unchanged in shape, colour and label.`, b.logoFileId && `Reference image ${prod ? 2 : 1} is the ${b.name} logo: place it small and unchanged in a corner, and do not redraw it.`].filter(Boolean).join(' '); return { ids, lead: lead ? '\n\n' + lead : '' }; };
      const one = async (a) => { try { const ref = refsFor(a); const { g } = await framePicture({ origin: 'ads', quiet: true, prompt: a.visual + ref.lead, ratio: p.ratio, fileIds: ref.ids, sessionId: session, title: `${b.name}: ${a.headline}` }, INFO.imageModel?.id); session = g.sessionId; a.media = g.media[0]; a.state = 'done'; } catch (e) { a.state = 'fail'; a.error = e.message; } saveAds(); if (token === live) drawOut(); };
      await one(batch[0]); await Promise.all(batch.slice(1).map(one));
    } catch (e) { errToast(e); st.busy = ''; if (token === live) drawMake(); }
  }
  function drawMake() {
    const p = PLACEMENTS.find((x) => x.id === st.placement); const n = Math.min(8, Math.max(1, (st.picked.size || 1) * st.per));
    const price = p.id === 'video' ? 0 : n * (INFO.imageModel?.credits || 0);
    fill(makeBox, h('h2', {}, icon('megaphone'), 'Make ads'),
      h('small', { class: 'cap' }, 'Where will they run?'),
      h('div', { class: 'ad-places' }, PLACEMENTS.map((x) => h('button', { class: 'pe-opt' + (st.placement === x.id ? ' on' : ''), 'data-place': x.id, onclick: () => { st.placement = x.id; drawMake(); } }, h('b', {}, icon(x.icon), x.label, h('span', { class: 'tag dim' }, x.ratio)), h('small', {}, x.hint)))),
      h('small', { class: 'cap' }, 'Ad template'),
      h('div', { class: 'ad-tpls', id: 'ad-tpls' }, (INFO.adTemplates || []).map((t) => h('button', { class: 'ad-tpl' + (st.template === t.id ? ' on' : ''), 'data-tpl': t.id, title: t.blurb, onclick: () => { st.template = t.id; store.set('pro-ad-template', t.id); drawMake(); } }, h('span', { class: 'ic' }, icon(t.icon)), h('b', {}, t.label), t.tag && h('span', { class: 'tag ' + (t.tag === 'Viral' ? 'hot' : t.tag === 'Trending' ? 'new' : 'dim') }, t.tag)))),
      h('small', { class: 'ad-tpl-note' }, (INFO.adTemplates || []).find((t) => t.id === st.template)?.blurb || ''),
      h('small', { class: 'cap' }, 'What to advertise'),
      h('div', { class: 'ad-products' }, b.products.map((x) => h('button', { class: 'chipbtn' + (st.picked.has(x.name) ? ' on' : ''), title: x.blurb, onclick: () => { if (st.picked.has(x.name)) st.picked.delete(x.name); else if (st.picked.size < 6) st.picked.add(x.name); drawMake(); } }, x.imageId ? h('img', { class: 'mini', src: thumb(x.imageId), alt: '' }) : st.picked.has(x.name) && icon('check'), x.name)),
        h('button', { class: 'chipbtn', onclick: () => { const name = prompt('Name of the product or offer'); if (name?.trim()) { b.products.push({ name: name.trim().slice(0, 80), blurb: '' }); st.picked.add(name.trim().slice(0, 80)); saveKit(); drawMake(); } } }, icon('plus'), 'Add product')),
      h('div', { class: 'ad-go-row' }, h('label', { class: 'pa-auto' }, 'Ads for each', (() => { const s = h('select', { id: 'ad-per', onchange: (e) => { st.per = Number(e.target.value); drawMake(); } }, [1, 2, 3, 4].map((k) => h('option', { value: k }, String(k)))); s.value = String(st.per); return s; })()),
        h('span', { class: 'grow' }), h('button', { class: 'btn primary', id: 'ad-make-go', disabled: !!st.busy, onclick: generateAds }, st.busy ? h('span', { class: 'spin' }) : icon('sparkle'), st.busy || `Generate ${n} ad${n > 1 ? 's' : ''}`, !st.busy && h('span', { class: 'cost' }, p.id === 'video' ? 'ideas first, then you pick' : credits(price)))));
  }
  function drawOut() {
    fill(out, st.ads.length > 0 && h('h2', {}, icon('image'), 'Your ads'), h('div', { class: 'ad-cards' }, st.ads.map((a) => h('article', { class: 'ad-card r' + a.placement.ratio.replace(':', '-') },
      a.state === 'done' ? h('img', { src: a.media.url, alt: a.headline, loading: 'lazy', onclick: () => openLightbox(a.media) }) : a.state === 'idea' ? h('div', { class: 'wait idea' }, icon('video'), h('small', {}, a.visual)) : a.state === 'fail' ? h('div', { class: 'wait fail' }, icon('x'), h('small', {}, a.error || 'Could not be made. Nothing was charged.')) : h('div', { class: 'wait' }, h('span', { class: 'spin' })),
      h('div', { class: 'ad-copy' }, h('span', { class: 'ad-tags' }, tplOf(a) && h('span', { class: 'tag new' }, tplOf(a).label), h('span', { class: 'tag dim' }, a.angle || a.placement.label)), h('b', {}, a.headline), h('small', {}, a.sub), h('div', { class: 'pa-media-acts' },
        h('button', { class: 'btn sm', title: 'Copy the headline, line and call to action', onclick: () => copyText([a.headline, a.sub, a.cta].filter(Boolean).join('\n')) }, icon('copy'), a.cta || 'Copy text'),
        a.state === 'done' && h('a', { class: 'btn sm', href: a.media.url, download: '' }, icon('dl'), 'Download'),
        h('button', { class: 'btn sm' + (a.state === 'idea' ? ' primary' : ''), onclick: () => { store.set('pro-brief', { prompt: brief(a), kind: 'ad', ratio: '9:16', seconds: 0, send: a.state === 'idea' }); location.hash = '#/pro/agent'; } }, icon('video'), a.state === 'idea' ? 'Make this video' : 'Video version')))))));
  }
  $('#main').replaceChildren(topbar(), frame(tabs('ads'), h('a', { class: 'pj-back ad-back', href: '#/ads' }, icon('arrow'), 'All brands'), h('div', { class: 'ad-top', style: { background: `linear-gradient(135deg, ${b.primary}, ${b.secondary})` } }, h('h1', {}, b.name), h('p', {}, b.tagline)), h('div', { class: 'ad-cols' }, kitBox, makeBox), out));
  drawKit(); drawMake(); drawOut();
}
