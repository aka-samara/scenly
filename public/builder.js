// Video Builder: put clips, pictures and AI scenes in order, add a voice-over, music and captions, then export one video.
// Loaded only when the Video Builder is switched on. The timeline maths is the same file the server uses for the export.
import { h, $, $$, icon, S, api, toast, errToast, popover, closePop, dialog, field, pickFiles, fmtSize, info, topbar, fmtCredits, setCredits, downloadFiles } from './app.js';
import { layout, estimate, allowedDuration, sceneCredits, editCredits, curVersion } from './vendor/builder-plan.js';

if (!$('#vb-css')) document.head.append(h('link', { id: 'vb-css', rel: 'stylesheet', href: '/builder.css' }));

let B = null; // the open project
let INFO = null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
const r2 = (n) => Math.round(n * 100) / 100;
const fmtT = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
const fmtLen = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${r2(s)} s`);
const newId = () => 'sc_' + Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const videoModels = () => S.models.filter((m) => m.type === 'video' && m.video?.tasks?.includes('create'));
const mName = (m) => m.name + (m.tag ? ' · ' + m.tag : '');
const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
const TYPE = { ai: 'AI scene', video: 'Video', image: 'Picture' };
const TRANS = { cut: 'Cut', crossfade: 'Crossfade', black: 'Fade to black' };
const HELP = {
  ratio: 'The shape of the finished video. 16:9 is for YouTube and screens, 9:16 for phones, 1:1 for square feeds. Every scene is fitted to this shape.',
  resolution: 'How sharp the finished video is. 720p is quicker and cheaper for AI scenes, 1080p is sharper.',
  model: 'The AI model used for AI scenes unless a scene picks its own. The words after each name say what it is best at. "Fast Draft" costs the fewest credits and is good for trying ideas, "Best Quality" costs the most. The price on the Generate button changes with the model.',
  keyframe: 'Draws a quick still picture of the scene for a few credits, so you can check the look before you spend video credits. The picture becomes the start picture of the scene and Generate animates from it.',
  length: 'How long the finished video is, after trims and crossfades.',
  credits: 'What the AI scenes without a clip will cost. Uploaded clips, pictures, music and the export itself are free. A scene that fails is refunded automatically.',
  export: 'Joins everything into one MP4. Exporting is free and keeps running if you close this tab.',
  prompt: 'Describe what should be seen in this scene: who, where, what happens, camera movement. One or two sentences are enough.',
  duration: 'How long this scene plays. The AI model makes the closest clip length it offers and the scene is trimmed to fit.',
  ref: 'A picture the AI scene should start from, for example a product photo or a character.',
  continuity: 'Starts this scene from the last frame of the scene before it, so the two flow into each other.',
  trim: 'Where this clip starts and stops playing, in seconds from its beginning. You can also drag the ends of the scene on the timeline.',
  transition: 'How this scene changes into the next one. A crossfade blends the two for half a second.',
  fit: 'What happens when a clip has a different shape than the video. "Blurred edges" keeps the whole picture, "Fill" crops it.',
  volume: 'How loud the sound of this clip is. With a voice-over, clip sound starts muted.',
  narration: 'What is said during this scene. It is a note for you and is used later for captions and voice-over planning.',
  lock: 'A locked scene cannot be generated again or deleted by accident.',
  versions: 'Every time a scene is generated again the earlier clip is kept. Step through them and keep the one you like.',
  voice: 'A spoken track that plays over the whole video. Drag it on the timeline to move where it starts.',
  music: 'A background track. It is looped or shortened to fit the video and ends with a short fade.',
  duck: 'Lowers the music automatically while the voice-over is speaking.',
  captions: 'Text shown at the bottom of the video. Double-click a caption to change its words, drag it to move it.',
  zoom: 'How much of the timeline is shown. Zoom in for exact trims.',
  snap: 'While dragging, edges jump to the playhead, to whole seconds and to other edges.',
  burn: 'Draws the captions into the picture so they always show. Without it you still get a separate .srt file that players and social sites can read.',
};

async function call(method, path, body) {
  let res; try { res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); } catch { return { ok: false, status: 0, data: { error: 'The connection dropped. Your work is kept here and will be saved when it is back.' } }; }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
const fail = (r) => { const e = new Error(r.data?.error || 'Something went wrong. Please try again.'); e.code = r.data?.code; e.status = r.status; return e; };

// ---------- leaving the screen ----------
function teardown() {
  if (!B) return;
  pause(); clearTimeout(B.saveT); clearTimeout(B.pollT); B.closed = true;
  if (B.dirty) saveNow(true);
  document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize);
  B = null;
}
window.__pmBuilderOff = teardown;

export async function renderBuilder(arg) {
  teardown();
  try { INFO = INFO || await api('/api/builder/info'); } catch (e) { $('#main').replaceChildren(topbar(), h('div', { class: 'page' }, h('h1', {}, 'Video Builder'), h('div', { class: 'err' }, e.message))); return; }
  if (arg === 'music') return renderMusicAdmin();
  if (arg) return openProject(arg);
  return renderList();
}

// ---------- project list ----------
async function renderList() {
  const grid = h('div', { class: 'vb-projects' }, h('div', { class: 'empty' }, h('span', { class: 'spin' })));
  const page = h('div', { class: 'page' },
    h('h1', {}, 'Video Builder'),
    h('p', { class: 'sub' }, 'Put clips, pictures and AI scenes in order, add a voice-over, music and captions, and export one finished video.'),
    !INFO.ffmpeg && h('div', { class: 'err', id: 'vb-noff' }, INFO.ffmpegHelp),
    h('div', { class: 'row-gap', style: { marginBottom: '18px' } },
      h('button', { class: 'btn primary', id: 'vb-new', onclick: newProject }, icon('plus'), 'New video'),
      S.user.isAdmin && INFO.musicLibrary && h('a', { class: 'btn ghost', href: '#/builder/music' }, icon('audio'), 'Music library')),
    grid);
  $('#main').replaceChildren(topbar(), h('div', { class: 'scroll' }, page));
  try {
    const { projects } = await api('/api/builder/projects');
    grid.replaceChildren(...(projects.length ? projects.map((p) => h('a', { class: 'vb-pcard', href: '#/builder/' + p.id },
      h('div', { class: 'th' }, p.poster ? h('img', { src: p.poster, alt: '', loading: 'lazy' }) : icon('film')),
      h('div', { class: 'meta' }, h('b', {}, p.title), h('small', {}, `${p.scenes} scene${p.scenes === 1 ? '' : 's'} · ${fmtLen(p.seconds)} · ${p.ratio}`)),
      h('button', { class: 'icon-btn sm del', title: 'Delete this project', onclick: (e) => { e.preventDefault(); e.stopPropagation(); confirmBox('Delete this video project?', `"${p.title}" and its scene list will be removed. Exported videos stay in Assets.`, 'Delete', async () => { await api('/api/builder/projects/' + p.id, { method: 'DELETE' }); renderList(); window.__pmRecents?.(); }); } }, icon('trash')),
    )) : [h('div', { class: 'empty big' }, h('div', { class: 'empty-ico' }, icon('film')), h('b', {}, 'No videos yet'), h('span', {}, 'Press "New video", then drop in your clips or describe scenes for the AI.'))]));
  } catch (e) { grid.replaceChildren(h('div', { class: 'err' }, e.message)); }
}
function confirmBox(title, sub, okLabel, fn) {
  const d = dialog({ title, sub, body: h('div', {}), foot: [h('button', { class: 'btn ghost', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', id: 'vb-ok', onclick: async (e) => { e.currentTarget.disabled = true; try { await fn(); d.remove(); } catch (err) { errToast(err); e.currentTarget.disabled = false; } } }, okLabel)] });
  return d;
}
function newProject() {
  let ratio = '16:9';
  const title = h('input', { type: 'text', placeholder: 'For example: Summer launch ad', maxlength: 120, id: 'vb-new-title' });
  const seg = h('div', { class: 'seg' }, INFO.ratios.map((r) => h('button', { class: r === ratio ? 'on' : '', 'data-ratio': r, onclick: (e) => { ratio = r; $$('button', seg).forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, r)));
  const go = async () => { const r = await api('/api/builder/projects', { method: 'POST', body: { title: title.value, ratio } }); d.remove(); location.hash = '#/builder/' + r.project.id; };
  const d = dialog({ title: 'New video', body: [field('Name', title), field(['Shape ', info(HELP.ratio)], seg)], foot: [h('button', { class: 'btn primary', id: 'vb-create', onclick: (e) => { e.currentTarget.disabled = true; go().catch((err) => { errToast(err); e.currentTarget.disabled = false; }); } }, 'Create')] });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#vb-create', d).click(); });
}

// ---------- open a project ----------
async function openProject(pid) {
  $('#main').replaceChildren(topbar(), h('div', { class: 'empty' }, h('span', { class: 'spin' })));
  let v; try { v = await api('/api/builder/projects/' + pid); } catch (e) { toast(e.message, 'error'); location.hash = '#/builder'; return; }
  B = { id: pid, p: v.project, files: new Map(Object.entries(v.files)), jobs: v.jobs || [], sel: v.project.scenes[0]?.id || null, cap: null, zoom: 0, snap: true, undo: [], redo: [], dirty: false, saving: false, t: 0, playing: false, peaks: new Map(), mobilePanel: false };
  B.picturing = v.picturing || [];
  let fresh = false; try { fresh = sessionStorage.getItem('vb-fresh') === pid; if (fresh) sessionStorage.removeItem('vb-fresh'); } catch { /* private window */ }
  if (fresh) { const first = B.p.scenes.find((s) => s.type === 'ai'); if (first) { B.sel = first.id; B.mobilePanel = true; } }
  drawShell(); document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
  if (fresh) setTimeout(() => { const t = $('#vb-prompt'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 80);
  schedulePoll(400);
  const planning = B.jobs.find((j) => j.type === 'plan'); if (planning) watchPlan(planning.id);
}
const lay = () => (B._lay && B._layFor === B.p ? B._lay : (B._layFor = B.p, B._lay = layout(B.p, B.files)));
const touchLay = () => { B._lay = null; };
const scene = (sid = B.sel) => B.p.scenes.find((s) => s.id === sid);
const rowOf = (sid) => lay().rows.find((r) => r.scene.id === sid);
const srcOf = (s) => { const fid = s.type === 'ai' ? s.versions?.[s.cur ?? (s.versions.length - 1)]?.fileId : s.fileId; return fid ? B.files.get(fid) : null; };
const modelOf = (s) => S.models.find((m) => m.id === (s?.modelId || B.p.modelId));
const priceOf = (s) => { const m = modelOf(s); return m ? sceneCredits(m, B.p.resolution, Number(s.duration) || 5) : 0; };
const jobOf = (s) => B.jobs.find((j) => j.id === s.jobId);

// ---------- saving: every change is sent to the server shortly after it is made ----------
const DOC = ['title', 'ratio', 'resolution', 'modelId', 'scenes', 'voice', 'music', 'captions', 'captionStyle'];
const docOf = (p) => JSON.parse(JSON.stringify(Object.fromEntries(DOC.map((k) => [k, p[k] ?? null]))));
function setSaved() { const el = $('#vb-saved'); if (el) el.textContent = B.offline ? 'Not saved yet (no connection)' : B.dirty || B.saving ? 'Saving…' : 'All changes saved'; }
// One edit: remembered for Undo, shown at once, saved a moment later.
function edit(fn, { key = '', redraw = 'all' } = {}) {
  const now = Date.now();
  if (!(key && B.lastKey === key && now - B.lastAt < 900)) { B.undo.push(JSON.stringify(docOf(B.p))); if (B.undo.length > 80) B.undo.shift(); B.redo = []; }
  B.lastKey = key; B.lastAt = now;
  fn(B.p); changed(redraw);
}
function changed(redraw = 'all') {
  B.hold = false; touchLay(); B.dirty = true; setSaved(); clearTimeout(B.saveT); B.saveT = setTimeout(saveNow, 450);
  if (B.sel && !scene()) B.sel = B.p.scenes[0]?.id || null;
  draw(redraw);
}
async function saveNow(leaving = false) {
  const b = B; if (!b || b.saving) return; clearTimeout(b.saveT);
  if (leaving) { try { fetch('/api/builder/projects/' + b.id, { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rev: b.p.rev, ...docOf(b.p) }) }); } catch { /* best effort */ } return; }
  b.saving = true; b.dirty = false; setSaved();
  try {
    for (let n = 0; n < 4; n++) {
      const r = await call('PUT', '/api/builder/projects/' + b.id, { rev: b.p.rev, ...docOf(b.p) });
      if (b.closed) return;
      if (r.ok) { b.offline = false; adopt(r.data, b.dirty); window.__pmVbTitle?.(b.id, b.p.title); break; }
      if (r.status === 409 && r.data.project) { adopt(r.data, true); continue; } // a scene finished meanwhile: keep this edit, take the new clip, send again
      if (r.status === 0) { b.offline = true; b.dirty = true; break; }
      errToast(fail(r)); if (r.status === 404) { location.hash = '#/builder'; return; }
      const fresh = await call('GET', '/api/builder/projects/' + b.id); if (fresh.ok) adopt(fresh.data, false); break;
    }
  } finally { b.saving = false; if (!b.closed) { setSaved(); if (b.dirty) b.saveT = setTimeout(saveNow, b.offline ? 4000 : 300); } }
}
const flush = async () => { while (B && (B.dirty || B.saving)) { if (!B.saving) await saveNow(); else await new Promise((r) => setTimeout(r, 60)); if (B?.offline) throw new Error('There is no connection right now. Try again in a moment.'); } };
// Take what the server knows. With keepLocal the edits made here stay and only the server's own facts (clips, status) come in.
function adopt(v, keepLocal) {
  if (!B || !v?.project) return;
  for (const [k, f] of Object.entries(v.files || {})) B.files.set(k, f);
  B.jobs = v.jobs || B.jobs;
  const drawn = v.picturing ? (B.picturing || []).filter((sid) => !v.picturing.includes(sid)) : []; const hadPic = new Map(drawn.map((sid) => [sid, scene(sid)?.refFileId]));
  if (v.picturing) B.picturing = v.picturing;
  if (keepLocal) {
    const theirs = new Map(v.project.scenes.map((s) => [s.id, s]));
    for (const sid of drawn) { const s = scene(sid), o = theirs.get(sid); if (s && o?.refFileId && o.refFileId !== s.refFileId) { s.refFileId = o.refFileId; s.continuity = false; } } // a preview picture that just arrived
    for (const s of B.p.scenes) { const o = theirs.get(s.id); if (!o || o.type !== 'ai') continue; const grew = (o.versions?.length || 0) !== (s.versions?.length || 0); Object.assign(s, { versions: o.versions, status: o.status, error: o.error, jobId: o.jobId }); if (grew) s.cur = o.cur; }
    B.p.rev = v.project.rev; B.p.exports = v.project.exports; B.p.audioPlan = v.project.audioPlan;
    for (const k of ['voice', 'music']) if (B.p[k] && v.project[k] && B.p[k].fileId === v.project[k].fileId) B.p[k] = { ...v.project[k], ...B.p[k] };
  } else {
    // Keep the same scene objects: the open scene panel's boxes hold on to them, so an edit typed after a save must still land in the project.
    const mine = new Map((B.p?.scenes || []).map((s) => [s.id, s]));
    v.project.scenes = v.project.scenes.map((o) => { const s = mine.get(o.id); if (!s) return o; for (const k of Object.keys(s)) delete s[k]; return Object.assign(s, o); });
    B.p = v.project;
  }
  touchLay(); if (B.sel && !scene()) B.sel = B.p.scenes[0]?.id || null;
  if (drawn.length) {
    const bad = drawn.filter((sid) => scene(sid) && scene(sid).refFileId === hadPic.get(sid));
    if (bad.length) toast(bad.length > 1 ? `${bad.length} preview pictures could not be drawn. Nothing was charged for them. Please try again.` : `Scene ${B.p.scenes.indexOf(scene(bad[0])) + 1}: the preview picture could not be drawn. Nothing was charged. Please try again.`, 'error');
    if (bad.length < drawn.length) api('/api/me').then((m) => setCredits(m.user?.credits)).catch(() => {});
  }
  draw(panelBusy() ? 'nopanel' : 'all');
}
const panelBusy = () => { const a = document.activeElement; return !!(a && $('#vb-panel')?.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
function restore(snap) {
  const doc = JSON.parse(snap); const mine = new Map(B.p.scenes.map((s) => [s.id, s]));
  for (const s of doc.scenes) { const o = mine.get(s.id); if (o?.type === 'ai') Object.assign(s, { versions: o.versions, status: o.status, error: o.error, jobId: o.jobId, cur: Math.min(s.cur ?? 0, Math.max(0, (o.versions?.length || 1) - 1)) }); }
  Object.assign(B.p, doc); B.lastKey = ''; changed('all');
}
function undo() { if (!B.undo.length) return toast('Nothing to undo.'); B.redo.push(JSON.stringify(docOf(B.p))); restore(B.undo.pop()); }
function redo() { if (!B.redo.length) return toast('Nothing to redo.'); B.undo.push(JSON.stringify(docOf(B.p))); restore(B.redo.pop()); }

// ---------- watching jobs (scenes being generated, an export being made) ----------
const busy = () => B.jobs.length > 0 || B.p.scenes.some((s) => s.status === 'generating') || (B.p.exports || []).some((e) => e.status === 'working');
function schedulePoll(ms) { if (!B) return; clearTimeout(B.pollT); B.pollT = setTimeout(poll, ms); }
async function poll() {
  const b = B; if (!b) return;
  if (!busy() && !b.pollOnce) return;
  b.pollOnce = false;
  const before = new Map(b.p.scenes.map((s) => [s.id, s.status])); const exBefore = new Map((b.p.exports || []).map((e) => [e.id, e.status]));
  const r = await call('GET', '/api/builder/projects/' + b.id);
  if (b.closed) return;
  if (r.ok) {
    adopt(r.data, b.dirty || b.saving);
    let money = false;
    for (const s of B.p.scenes) { const was = before.get(s.id); if (was === 'generating' && s.status !== 'generating') { money = true; if (s.status === 'failed') toast(`Scene ${B.p.scenes.indexOf(s) + 1}: ${s.error || 'this scene failed and your credits were refunded.'}`, 'error'); } }
    for (const e of B.p.exports || []) if (exBefore.get(e.id) === 'working' && e.status !== 'working') exportEnded(e);
    if (money) api('/api/me').then((m) => setCredits(m.user?.credits)).catch(() => {});
  }
  if (busy()) schedulePoll(document.hidden ? 5000 : 1500);
}

// ---------- the screen ----------
function drawShell() {
  const title = h('input', { class: 'vb-title', id: 'vb-title', value: B.p.title, maxlength: 120, title: 'Name of this video', oninput: (e) => edit((p) => { p.title = e.target.value; }, { key: 'title', redraw: 'none' }) });
  const drop = h('div', { class: 'vb-drop', id: 'vb-drop' }, icon('upload'), h('b', {}, 'Drop your files to add them'), h('span', {}, 'Videos and pictures become scenes. Sound files become the voice-over or the music.'));
  const root = h('div', { class: 'vb', id: 'vb' },
    h('div', { class: 'vb-bar', id: 'vb-bar' }),
    !INFO.ffmpeg && h('div', { class: 'err vb-warn' }, INFO.ffmpegHelp),
    h('div', { class: 'vb-body' },
      h('section', { class: 'vb-list', id: 'vb-list' }),
      h('section', { class: 'vb-panel', id: 'vb-panel' }),
      h('section', { class: 'vb-stage', id: 'vb-stage' })),
    INFO.precision && h('section', { class: 'vb-rbar', id: 'vb-rbar' }),
    h('section', { class: 'vb-tl', id: 'vb-tl' }),
    drop);
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  root.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; root.classList.add('dropping'); } });
  root.addEventListener('dragleave', (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; root.classList.remove('dropping'); } });
  root.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  root.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; root.classList.remove('dropping'); addFiles([...e.dataTransfer.files]); });
  $('#main').replaceChildren(
    topbar([h('a', { class: 'icon-btn', href: '#/builder', title: 'All videos' }, icon('back')), title],
      h('div', { class: 'row-gap vb-top' }, h('small', { id: 'vb-saved', class: 'vb-saved' }, 'All changes saved'),
        h('button', { class: 'icon-btn', id: 'vb-undo', title: 'Undo (Ctrl or ⌘ + Z)', onclick: undo }, icon('undo')),
        h('button', { class: 'icon-btn', id: 'vb-redo', title: 'Redo (Ctrl or ⌘ + Shift + Z)', onclick: redo }, icon('redo')))),
    root);
  buildStage(); draw('all');
}
function draw(what = 'all') {
  if (!B || what === 'none' || !$('#vb')) return;
  if (B.range) { const r = rowOf(B.range.id); if (!r || B.range.a < r.start - 0.01 || B.range.b > r.start + r.seconds + 0.01) B.range = null; }
  drawBar(); drawList(); if (what !== 'nopanel') drawPanel(); drawTimeline(); syncMedia(true); drawClock(); if (PE()) drawRangeBar();
  const t = $('#vb-title'); if (t && document.activeElement !== t && t.value !== B.p.title) t.value = B.p.title;
}
const sel = (value, opts, on, attrs = {}) => { const s = h('select', { class: 'vb-select', ...attrs, onchange: (e) => on(e.target.value) }, opts.map(([v, l]) => h('option', { value: v }, l))); s.value = value; return s; };
const lab = (text, help) => h('span', { class: 'vb-lab' }, text, help && info(help));

function drawBar() {
  const L = lay(); const est = estimate(B.p, S.models.filter((m) => m.type === 'video')); const todo = est.scenes.length;
  const ex = (B.p.exports || []).find((e) => e.status === 'working'); const exJob = ex && B.jobs.find((j) => j.id === ex.jobId);
  const gen = B.p.scenes.filter((s) => s.status === 'generating').length;
  const cur = scene(); const one = cur && cur.type === 'ai' && !cur.versions?.length && !cur.locked && cur.status !== 'generating' && !cur.rangeLen ? cur : null; // the selected scene still has to be made
  const kf = keyTargets(); const pics = B.picturing?.length || 0;
  fill($('#vb-bar'),
    h('label', { class: 'vb-set' }, lab('Shape', HELP.ratio), sel(B.p.ratio, INFO.ratios.map((r) => [r, r]), (v) => edit((p) => { p.ratio = v; }), { id: 'vb-ratio' })),
    h('label', { class: 'vb-set' }, lab('Quality', HELP.resolution), sel(B.p.resolution, INFO.resolutions.map((r) => [r, r]), (v) => edit((p) => { p.resolution = v; }), { id: 'vb-res' })),
    h('label', { class: 'vb-set wide' }, lab('AI model', HELP.model), sel(B.p.modelId, videoModels().map((m) => [m.id, mName(m)]), (v) => edit((p) => { p.modelId = v; }), { id: 'vb-model' })),
    h('div', { class: 'vb-set' }, lab('Length', HELP.length), h('b', { id: 'vb-len' }, fmtLen(L.seconds))),
    h('div', { class: 'vb-set' }, lab('AI cost', HELP.credits), h('b', { id: 'vb-est' }, todo ? `≈ ${fmtCredits(est.total)} credits` : 'Nothing to pay')),
    h('div', { class: 'vb-go' },
    gen > 0 && h('span', { class: 'vb-busy', id: 'vb-gen' }, h('span', { class: 'spin' }), `Making ${gen} scene${gen > 1 ? 's' : ''}`),
    pics > 0 && h('span', { class: 'vb-busy', id: 'vb-picturing' }, h('span', { class: 'spin' }), `Drawing ${pics} picture${pics > 1 ? 's' : ''}`),
    ex ? h('span', { class: 'vb-busy', id: 'vb-exporting' }, h('span', { class: 'spin' }), `Exporting ${Math.round((exJob?.progress || 0) * 100)}%`, h('button', { class: 'btn ghost sm', onclick: async () => { if (ex.jobId) await call('POST', `/api/jobs/${ex.jobId}/cancel`); B.pollOnce = true; schedulePoll(200); } }, 'Stop'))
      : h('button', { class: 'btn sm' + (one ? '' : ' primary'), id: 'vb-export', onclick: openExport }, icon('dl'), 'Export', info(HELP.export))),
    (kf.length > 0 || todo > 0) && h('div', { class: 'vb-go row' },
    kf.length > 0 && h('button', { class: 'btn sm', id: 'vb-keys', title: HELP.keyframe, onclick: () => previewFrames(null) }, icon('image'), `Preview Keyframes (Cheap) · ≈ ${fmtCredits(r2(kf.length * INFO.keyframe.credits))} credits`),
    one && todo > 1 && h('button', { class: 'btn primary sm', id: 'vb-genone', title: 'Generate only the scene that is selected', onclick: () => generate([one.id]) }, icon('sparkle'), `Generate this scene · ≈ ${fmtCredits(priceOf(one))} credits`),
    todo > 0 && h('button', { class: 'btn sm' + (one && todo === 1 ? ' primary' : ''), id: 'vb-genall', title: 'Generate every AI scene that has no clip yet', onclick: () => generate(null) }, icon('sparkle'), `${todo > 1 ? `Generate all (${todo} scenes)` : one ? 'Generate this scene' : 'Generate scene'} · ≈ ${fmtCredits(est.total)} credits`)),
  );
}

// ---------- scene list ----------
function statusOf(s) {
  if (s.type !== 'ai') return srcOf(s) ? ['Ready', 'ok'] : ['File missing', 'bad'];
  if (s.status === 'generating') { const j = jobOf(s); return [`${j?.note || 'Generating'} ${Math.round((j?.progress || 0) * 100)}%`, 'run']; }
  if (s.status === 'failed') return ['Failed, refunded', 'bad'];
  if (B.picturing?.includes(s.id)) return ['Drawing the preview picture…', 'run'];
  return srcOf(s) ? ['Ready', 'ok'] : s.refFileId && B.files.get(s.refFileId) ? ['Picture ready · no clip yet', 'draft'] : ['No clip yet', 'draft'];
}
function thumbOf(s, big = false) {
  const f = srcOf(s) || (s.type === 'ai' && s.refFileId && B.files.get(s.refFileId)) || null; const src = f?.poster || (f?.kind === 'image' ? f.url : null);
  return src ? h('img', { src, alt: '', loading: 'lazy', draggable: 'false', onerror: (e) => e.target.remove() }) : icon(s.type === 'ai' ? 'sparkle' : s.type === 'image' ? 'image' : 'video', big ? 'big' : '');
}
function drawList() {
  const L = lay(); const box = $('#vb-list'); const keep = box.querySelector('.vb-rows')?.scrollTop || 0;
  const rows = L.rows.map((r, i) => {
    const s = r.scene; const [st, cls] = statusOf(s);
    const row = h('div', { class: 'vb-row' + (s.id === B.sel ? ' on' : '') + (s.locked ? ' locked' : ''), 'data-id': s.id, draggable: 'true', onclick: () => select(s.id, true) },
      h('span', { class: 'num' }, String(i + 1)),
      h('div', { class: 'th' }, thumbOf(s)),
      h('div', { class: 'tx' },
        h('div', { class: 'l1' }, h('span', { class: 'tag dim' }, TYPE[s.type]), h('span', { class: 'time' }, `${fmtT(r.start)} · ${r2(r.seconds)} s`), s.locked && icon('lock')),
        h('div', { class: 'l2' }, s.narration || s.prompt || srcOf(s)?.name || 'No description yet'),
        h('div', { class: 'st ' + cls }, st),
        INFO.keyframe && keyable(s) && h('button', { class: 'vb-pf', 'data-pf': s.id, title: `${HELP.keyframe} About ${fmtCredits(INFO.keyframe.credits)} credits.`, onclick: (e) => { e.stopPropagation(); previewFrames([s.id]); } }, icon('image'), s.refFileId ? 'New preview' : 'Preview Frame')),
      h('button', { class: 'icon-btn sm', title: 'Scene actions', onclick: (e) => { e.stopPropagation(); sceneMenu(e.currentTarget, s); } }, icon('dots')));
    row.addEventListener('dragstart', (e) => { B.dragId = s.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); row.classList.add('drag'); });
    row.addEventListener('dragend', () => { B.dragId = null; $$('.vb-row').forEach((x) => x.classList.remove('drag', 'above', 'below')); });
    row.addEventListener('dragover', (e) => { if (!B.dragId || B.dragId === s.id) return; e.preventDefault(); const b = row.getBoundingClientRect(); const below = e.clientY > b.top + b.height / 2; row.classList.toggle('below', below); row.classList.toggle('above', !below); });
    row.addEventListener('dragleave', () => row.classList.remove('above', 'below'));
    row.addEventListener('drop', (e) => { if (!B.dragId) return; e.preventDefault(); e.stopPropagation(); const below = row.classList.contains('below'); moveScene(B.dragId, i + (below ? 1 : 0)); });
    return row;
  });
  fill(box,
    h('div', { class: 'vb-head' }, h('b', {}, 'Scenes'), h('span', { class: 'n' }, String(B.p.scenes.length)), h('div', { class: 'grow' }),
      h('button', { class: 'btn sm', id: 'vb-add', title: 'Add videos, pictures or sound files. You can also drag them in, many at once.', onclick: () => pickFiles('video/*,image/*,audio/*,.mp3,.wav,.m4a,.mp4,.mov,.webm', true, addFiles), disabled: !INFO.ffmpeg }, icon('upload'), 'Add files'),
      h('button', { class: 'btn sm', id: 'vb-addai', title: 'Add a scene the AI makes from your description', onclick: addAiScene }, icon('sparkle'), 'AI scene')),
    B.uploading && h('div', { class: 'vb-upl', id: 'vb-upl' }, h('span', { class: 'spin' }), B.uploading),
    rows.length ? h('div', { class: 'vb-rows' }, rows) : h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, icon('film')), h('b', {}, 'Start with your first scene'), h('span', {}, 'Drag in videos, pictures and sound files (many at once), or add an AI scene and describe it.')),
  );
  const rl = box.querySelector('.vb-rows'); if (rl) rl.scrollTop = keep;
}
function select(sid, seekTo = false) {
  B.sel = sid; B.cap = null; B.mobilePanel = true;
  if (seekTo) { const r = rowOf(sid); if (r && (B.t < r.start || B.t >= r.start + r.seconds)) { pause(); B.t = r.start + 0.001; } }
  draw('all');
}
function moveScene(sid, to) {
  const from = B.p.scenes.findIndex((s) => s.id === sid); if (from < 0) return; if (to > from) to--; if (to === from) return;
  edit((p) => { const [s] = p.scenes.splice(from, 1); p.scenes.splice(clamp(to, 0, p.scenes.length), 0, s); });
}
function duplicateScene(s) {
  if (B.p.scenes.length >= INFO.maxScenes) return toast(`A project can hold up to ${INFO.maxScenes} scenes.`, 'error');
  const c = { ...JSON.parse(JSON.stringify(s)), id: newId(), copyOf: s.id, locked: false, jobId: undefined, error: undefined, status: s.type === 'ai' ? (s.versions?.length ? 'done' : 'draft') : undefined };
  edit((p) => { p.scenes.splice(p.scenes.indexOf(s) + 1, 0, c); }); select(c.id);
}
function deleteScene(s) {
  if (!s) return;
  if (s.locked) return toast('This scene is locked. Unlock it first.', 'error');
  if (s.status === 'generating') return toast('This scene is being generated. Stop it first, or wait until it is done.', 'error');
  const i = B.p.scenes.indexOf(s);
  edit((p) => { p.scenes.splice(i, 1); }); B.sel = B.p.scenes[Math.min(i, B.p.scenes.length - 1)]?.id || null; draw('all');
  toast('Scene deleted. Press Undo to bring it back.');
}
function splitAtPlayhead() {
  if (B.cap != null) { const c = B.p.captions[B.cap]; if (c && B.t > c.start + 0.2 && B.t < c.end - 0.2) return edit((p) => { const x = p.captions[B.cap]; p.captions.splice(B.cap + 1, 0, { start: r2(B.t), end: x.end, text: x.text }); x.end = r2(B.t); }); }
  const r = lay().rows.find((x) => B.t > x.start + 0.15 && B.t < x.start + x.seconds - 0.15);
  if (!r) return toast('Move the playhead inside a scene, then split.');
  const s = r.scene; if (s.status === 'generating') return toast('Wait until this scene is ready before splitting it.', 'error');
  if (B.p.scenes.length >= INFO.maxScenes) return toast(`A project can hold up to ${INFO.maxScenes} scenes.`, 'error');
  if (s.reverse) return toast('This scene plays backwards. Switch "Play backwards" off before splitting it.', 'error');
  if (PE() && windowed(s)) return rangeAct('split').catch(errToast);
  const at = B.t - r.start;
  edit((p) => {
    const b = { ...JSON.parse(JSON.stringify(s)), id: newId(), copyOf: s.id, locked: false };
    if (s.type === 'image' || !srcOf(s)) { const d = r.seconds; s.duration = r2(at); b.duration = r2(d - at); }
    else { const cut = r2((Number(s.trimIn) || 0) + at * (r.speed || 1)); b.trimIn = cut; if (s.trimOut) b.trimOut = s.trimOut; s.trimOut = cut; }
    b.transition = s.transition; s.transition = 'cut';
    p.scenes.splice(p.scenes.indexOf(s) + 1, 0, b);
  });
}
function sceneMenu(anchor, s) {
  const item = (ic, text, fn, attrs = {}) => h('button', { ...attrs, onclick: () => { closePop(); fn(); } }, icon(ic), text);
  const has = !!srcOf(s);
  popover(anchor, h('div', { class: 'menu' },
    s.type === 'ai' && item('edit', 'Edit description', () => { select(s.id); setTimeout(() => $('#vb-prompt')?.focus(), 30); }),
    s.type === 'ai' && s.status !== 'generating' && item('sparkle', `${has ? 'Generate again' : 'Generate'} · ≈ ${fmtCredits(priceOf(s))} credits`, () => generate([s.id]), { disabled: s.locked }),
    s.type === 'ai' && s.status === 'generating' && item('stop', 'Stop generating', () => stopScene(s)),
    s.type !== 'ai' && item('swap', 'Replace file', () => replaceFile(s)),
    item('copy', 'Duplicate', () => duplicateScene(s)),
    item(s.locked ? 'lock' : 'lock', s.locked ? 'Unlock' : 'Lock', () => edit(() => { s.locked = !s.locked; })),
    item('trash', 'Delete', () => deleteScene(s))));
}

// ---------- adding things ----------
async function upload(files) {
  const ids = []; const errors = [];
  for (let i = 0; i < files.length; i += 6) {
    B.uploading = `Uploading ${Math.min(i + 6, files.length)} of ${files.length} file${files.length > 1 ? 's' : ''}…`; drawList();
    const fd = new FormData(); files.slice(i, i + 6).forEach((f) => fd.append('files', f));
    try { const r = await api('/api/files?audio=1&proxy=1', { method: 'POST', body: fd }); r.files.forEach((f) => ids.push(f.id)); errors.push(...(r.errors || [])); } catch (e) { errors.push(e.message); }
    if (!B) return { ids: [], errors: [] };
  }
  B.uploading = ''; return { ids, errors };
}
async function addFiles(files, extra = {}) {
  if (!B || !files.length) return;
  if (!INFO.ffmpeg) return toast(INFO.ffmpegHelp, 'error');
  try {
    await flush();
    const { ids, errors } = await upload(files); if (!B) return;
    errors.forEach((e) => toast(e, 'error'));
    if (ids.length) {
      B.uploading = 'Reading your files…'; drawList();
      const r = await call('POST', `/api/builder/projects/${B.id}/add`, { fileIds: ids, ...extra }); B.uploading = '';
      if (!r.ok) throw fail(r);
      const had = new Set(B.p.scenes.map((s) => s.id)); adopt(r.data, false);
      const first = B.p.scenes.find((s) => !had.has(s.id)); if (first) { B.sel = first.id; B.cap = null; draw('all'); }
      (r.data.notes || []).forEach((n) => toast(n));
      B.pollOnce = true; schedulePoll(3500); // pictures of the new clips arrive a moment later
    }
  } catch (e) { errToast(e); } finally { if (B) { B.uploading = ''; drawList(); } }
}
async function addAiScene() {
  try {
    await flush(); const at = B.sel ? B.p.scenes.findIndex((s) => s.id === B.sel) + 1 : B.p.scenes.length;
    const r = await call('POST', `/api/builder/projects/${B.id}/scenes`, { prompt: '', duration: 5, at }); if (!r.ok) throw fail(r);
    adopt(r.data, false); B.sel = r.data.sceneId; B.cap = null; B.mobilePanel = true; draw('all'); setTimeout(() => $('#vb-prompt')?.focus(), 40);
  } catch (e) { errToast(e); }
}
function replaceFile(s) {
  pickFiles(s.type === 'image' ? 'image/*' : 'video/*', false, async (files) => {
    const { ids, errors } = await upload(files); errors.forEach((e) => toast(e, 'error')); if (!B) return; drawList(); if (!ids[0]) return;
    edit(() => { s.replaceFileId = ids[0]; delete s.trimOut; s.trimIn = 0; }); await flush().catch(errToast);
    const fresh = await call('GET', '/api/builder/projects/' + B.id); if (fresh.ok) adopt(fresh.data, false);
  });
}

// ---------- AI scenes ----------
// Preview pictures: a cheap still for a scene that has no clip yet. It becomes the start picture, so Generate animates from it.
const keyable = (s) => s.type === 'ai' && !s.versions?.length && !s.locked && s.status !== 'generating' && !s.rangeLen && !B.picturing?.includes(s.id);
const keyTargets = () => (INFO.keyframe ? B.p.scenes.filter((s) => keyable(s) && !s.refFileId && String(s.prompt || '').trim()) : []);
async function previewFrames(sceneIds) {
  try {
    await flush();
    const path = `/api/builder/projects/${B.id}/keyframes`; const body = { sceneIds: sceneIds || undefined };
    const dry = await call('POST', path, { ...body, dryRun: true }); if (!dry.ok) throw fail(dry);
    const d = dry.data; const list = sceneIds ? B.p.scenes.filter((s) => sceneIds.includes(s.id)) : keyTargets();
    const run = async () => {
      const r = await call('POST', path, { ...body, idem: newId() }); if (!r.ok) throw fail(r);
      adopt(r.data, false); schedulePoll(700);
      toast(`${r.data.started} preview picture${r.data.started === 1 ? ' is' : 's are'} being drawn. ${r.data.started === 1 ? 'It shows' : 'They show'} up on the scene${r.data.started === 1 ? '' : 's'} in a moment.`);
    };
    if (d.count === 1 && sceneIds) return await run();
    const video = r2(list.reduce((n, s) => n + priceOf(s), 0));
    confirmBox(`Preview ${d.count} scene${d.count === 1 ? '' : 's'} as pictures?`, `${d.model} draws one still picture for each scene. This costs about ${fmtCredits(d.total)} credits (${fmtCredits(d.per)} each). Making the same scenes as video costs about ${fmtCredits(video)} credits, so this is a cheap way to check the look first. Each picture becomes the start picture of its scene, and Generate then animates from it.${list.some((s) => s.continuity) ? ' Scenes that continue from the scene before will start from their own picture instead.' : ''} A picture that fails is not charged. You have ${fmtCredits(S.user.wallet ? S.user.wallet.paid : S.user.credits)} plan and top-up credits.`, `Preview · ≈ ${fmtCredits(d.total)} credits`, run);
  } catch (e) { errToast(e); }
}
async function generate(sceneIds) {
  const list = sceneIds ? B.p.scenes.filter((s) => sceneIds.includes(s.id)) : B.p.scenes.filter((s) => s.type === 'ai' && !s.versions?.length && !s.locked && s.status !== 'generating');
  if (!list.length) return;
  const total = r2(list.reduce((n, s) => n + priceOf(s), 0));
  const run = async () => {
    await flush();
    const r = await call('POST', `/api/builder/projects/${B.id}/generate`, { sceneIds: sceneIds || undefined, idem: newId() });
    if (!r.ok) throw fail(r);
    adopt(r.data, false); setCredits(r.data.credits); schedulePoll(800);
    toast(`${r.data.started} scene${r.data.started === 1 ? ' is' : 's are'} being made. You can keep working or close this tab.`);
  };
  if (list.length === 1) return run().catch(errToast);
  confirmBox(`Generate ${list.length} scenes?`, `This costs about ${fmtCredits(total)} credits. You have ${fmtCredits(S.user.wallet ? S.user.wallet.paid : S.user.credits)}. Each scene is charged only when it succeeds, and a scene that fails is refunded automatically.`, `Generate · ≈ ${fmtCredits(total)} credits`, run);
}
async function stopScene(s) { const r = await call('POST', `/api/builder/projects/${B.id}/scenes/${s.id}/stop`); if (r.ok) { B.pollOnce = true; schedulePoll(300); toast('Stopping. Credits held for this scene are returned.'); } }

// ---------- scene panel ----------
function numIn(value, { min = 0, max = 600, step = 0.1, id, on }) {
  return h('input', { type: 'number', class: 'vb-num', id, min, max, step, value: String(value), onchange: (e) => { const v = clamp(Number(e.target.value) || 0, min, max); e.target.value = String(v); on(v); } });
}
function slider(value, { min, max, step, id, on, fmt = (v) => v }) {
  const out = h('span', { class: 'vb-val' }, fmt(value));
  return h('div', { class: 'vb-slider' }, h('input', { type: 'range', id, min, max, step, value: String(value), oninput: (e) => { out.textContent = fmt(Number(e.target.value)); on(Number(e.target.value)); } }), out);
}
const toggle = (on, fn, id) => h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on), id, onclick: fn });
const rowF = (label, help, control) => h('div', { class: 'vb-f' }, lab(label, help), control);
function drawPanel() {
  const box = $('#vb-panel'); if (!box) return; box.classList.toggle('open', !!B.mobilePanel && !!scene());
  const s = scene();
  if (!s) { box.replaceChildren(h('div', { class: 'vb-head' }, h('b', {}, 'Scene')), h('div', { class: 'empty' }, 'Pick a scene on the left to change it.')); return; }
  const i = B.p.scenes.indexOf(s); const r = rowOf(s.id); const f = srcOf(s); const m = modelOf(s); const full = f?.duration || 0; const last = i === B.p.scenes.length - 1;
  const key = (k) => ({ key: s.id + k, redraw: 'nopanel' });
  const kids = [h('div', { class: 'vb-head' }, h('b', {}, `Scene ${i + 1}`), h('span', { class: 'tag dim' }, TYPE[s.type]), h('div', { class: 'grow' }), h('button', { class: 'icon-btn sm vb-close', title: 'Close', onclick: () => { B.mobilePanel = false; drawPanel(); } }, icon('x')))];
  if (s.type === 'ai') {
    const maxD = Math.max(...(m?.video?.durations || [15]).filter((d) => d > 0), 5); const made = m ? allowedDuration(m, Number(s.duration) || 5) : null;
    const ref = s.refFileId && B.files.get(s.refFileId);
    kids.push(
      rowF('What happens in this scene', HELP.prompt, h('textarea', { id: 'vb-prompt', rows: 4, maxlength: 4000, placeholder: 'For example: a barista pours milk into a cup, close up, warm morning light', oninput: (e) => edit(() => { s.prompt = e.target.value; }, key('p')) }, s.prompt || '')),
      rowF('AI model', HELP.model, sel(s.modelId || '', [['', `Same as the video (${S.models.find((x) => x.id === B.p.modelId)?.name || 'not set'})`], ...videoModels().map((x) => [x.id, mName(x)])], (v) => edit(() => { s.modelId = v || undefined; }), { id: 'vb-smodel' })),
      s.rangeLen ? h('div', { class: 'vb-f two', id: 'vb-part' }, lab('Length', 'This scene is a part that was cut out of a scene to change it. Its length is fixed, so the video keeps its timing. The footage it had before is kept as version 1.'), h('span', { class: 'vb-fixed' }, icon('lock'), `${r2(r?.seconds || s.rangeLen)} s · a part of a scene`))
        : rowF('Length', HELP.duration, slider(Number(s.duration) || 5, { min: 1, max: Math.max(maxD, 15), step: 1, id: 'vb-dur', fmt: (v) => `${v} s`, on: (v) => edit(() => { s.duration = v; }, key('d')) })),
      !s.rangeLen && made && made !== (Number(s.duration) || 5) && h('small', { class: 'vb-hint' }, `${m.name} makes a ${made} s clip. It is trimmed to your length.`),
      h('div', { class: 'vb-f two' }, lab('Shape and quality'), h('span', { class: 'vb-fixed', title: 'Set for the whole video in the bar above' }, icon('lock'), `${B.p.ratio} · ${B.p.resolution}`)),
      rowF('Start picture', HELP.ref, h('div', { class: 'row-gap vb-wrap' },
        ref ? h('span', { class: 'vb-ref' }, h('img', { src: ref.url, alt: '' }), h('button', { class: 'icon-btn sm', title: 'Remove the picture', onclick: () => edit(() => { s.refFileId = undefined; }) }, icon('x'))) : null,
        h('button', { class: 'btn sm', id: 'vb-ref', onclick: () => pickFiles('image/*', false, async (files) => { const { ids, errors } = await upload(files); errors.forEach((e) => toast(e, 'error')); if (!B) return; drawList(); if (ids[0]) { B.files.set(ids[0], { id: ids[0], kind: 'image', url: `/api/files/${ids[0]}/raw`, name: files[0].name }); edit(() => { s.refFileId = ids[0]; s.continuity = false; }); } }) }, icon('image'), ref ? 'Change' : 'Add a picture'),
        INFO.keyframe && !s.versions?.length && !s.rangeLen && h('button', { class: 'btn sm', id: 'vb-key1', disabled: !keyable(s), title: HELP.keyframe, onclick: () => previewFrames([s.id]) }, icon('sparkle'), B.picturing?.includes(s.id) ? 'Drawing…' : `Preview Frame · ≈ ${fmtCredits(INFO.keyframe.credits)} credits`),
        PE() && S.characters?.length > 0 && h('button', { class: 'btn sm', id: 'vb-char', title: 'Start this scene from the picture of a saved character, so the same person or product appears', onclick: (e) => pickCharacter(e.currentTarget, s) }, icon('face'), 'Character'))),
      i > 0 && h('div', { class: 'vb-f two' }, lab('Continue from the scene before', HELP.continuity), toggle(s.continuity, () => edit(() => { s.continuity = !s.continuity; if (s.continuity) s.refFileId = undefined; }), 'vb-cont')),
      s.versions?.length > 0 && h('div', { class: 'vb-f two' }, lab('Version', HELP.versions), h('div', { class: 'row-gap', id: 'vb-vers' },
        h('button', { class: 'icon-btn sm', title: 'Earlier version', disabled: (s.cur ?? 0) <= 0, onclick: () => edit(() => { s.cur = (s.cur ?? 0) - 1; }) }, '◀'),
        h('span', {}, `${(s.cur ?? 0) + 1} of ${s.versions.length}${curVersion(s)?.original ? ' · original' : ''}`),
        h('button', { class: 'icon-btn sm', title: 'Later version', disabled: (s.cur ?? 0) >= s.versions.length - 1, onclick: () => edit(() => { s.cur = (s.cur ?? 0) + 1; }) }, '▶'),
        PE() && s.versions.length > 1 && h('button', { class: 'btn sm', id: 'vb-compare', title: 'See two versions side by side', onclick: () => compareVersions(s) }, 'Compare'))),
      s.status === 'failed' && h('div', { class: 'err' }, s.error || 'This scene failed and your credits were refunded. Try again?'),
      s.status === 'generating'
        ? h('button', { class: 'btn block', id: 'vb-stop', onclick: () => stopScene(s) }, icon('stop'), 'Stop generating')
        : h('button', { class: 'btn primary block', id: 'vb-gen1', disabled: s.locked, title: s.locked ? 'Unlock the scene to generate it again' : '', onclick: () => generate([s.id]) }, icon('sparkle'), `${s.versions?.length ? 'Generate again' : 'Generate'} · ≈ ${fmtCredits(priceOf(s))} credits`),
    );
  } else {
    kids.push(h('div', { class: 'vb-file' }, h('div', { class: 'th' }, thumbOf(s)), h('div', {}, h('b', {}, f?.name || 'File missing'), h('small', {}, f ? [f.w && `${f.w}×${f.h}`, full && `${r2(full)} s`, f.size && fmtSize(f.size)].filter(Boolean).join(' · ') : 'Replace this file to use the scene.')),
      h('button', { class: 'btn sm', id: 'vb-replace', onclick: () => replaceFile(s) }, icon('swap'), 'Replace')));
    if (s.type === 'image') kids.push(rowF('Shown for', HELP.duration, slider(Number(s.duration) || 4, { min: 0.5, max: 30, step: 0.5, id: 'vb-dur', fmt: (v) => `${v} s`, on: (v) => edit(() => { s.duration = v; }, key('d')) })));
  }
  if (s.type !== 'image' && f && full && !windowed(s)) {
    const tout = s.trimOut || full;
    kids.push(h('div', { class: 'vb-f' }, lab('Trim', HELP.trim), h('div', { class: 'row-gap' },
      h('small', {}, 'From'), numIn(r2(s.trimIn || 0), { max: Math.max(0, r2(tout - 0.3)), id: 'vb-in', on: (v) => edit(() => { s.trimIn = v; }) }),
      h('small', {}, 'to'), numIn(r2(tout), { min: 0.3, max: r2(full), id: 'vb-out', on: (v) => edit(() => { if (v >= full - 0.02) delete s.trimOut; else s.trimOut = Math.max(v, (s.trimIn || 0) + 0.3); }) }),
      h('small', {}, `of ${r2(full)} s`))));
  }
  kids.push(
    !last && rowF('Change to the next scene', HELP.transition, sel(s.transition || 'cut', INFO.transitions.map((t) => [t, TRANS[t] || t]), (v) => edit(() => { s.transition = v; }), { id: 'vb-trans' })),
    rowF('When the shape differs', HELP.fit, sel(s.fit || 'pad', [['pad', 'Blurred edges (whole picture)'], ['crop', 'Fill (crop the sides)']], (v) => edit(() => { s.fit = v; }), { id: 'vb-fit' })),
    s.type !== 'image' && rowF('Clip sound', HELP.volume, slider(Math.round((r?.volume ?? 1) * 100), { min: 0, max: 200, step: 5, id: 'vb-vol', fmt: (v) => (v ? v + '%' : 'Muted'), on: (v) => edit(() => { s.volume = v / 100; }, key('v')) })),
    PE() && s.type !== 'image' && rowF('Speed', 'Slower than 1× stretches the scene, faster shortens it. The sound keeps its pitch.', slider(s.speed || 1, { min: 0.5, max: 2, step: 0.05, id: 'vb-speed', fmt: (v) => `${v}×`, on: (v) => edit(() => { if (v === 1) delete s.speed; else s.speed = v; }, key('sp')) })),
    PE() && s.type !== 'image' && h('div', { class: 'vb-f two' }, lab('Play backwards', `Plays this scene from its end to its start, picture and sound. For scenes of up to ${INFO.maxReverseSec} seconds. The preview shows it without sound.`), toggle(!!s.reverse, () => { if (!s.reverse && r && r.seconds * (s.speed || 1) > INFO.maxReverseSec + 0.05) return toast(`Playing backwards works for scenes of up to ${INFO.maxReverseSec} seconds. Trim or split this scene first.`, 'error'); edit(() => { s.reverse = !s.reverse; }); }, 'vb-rev')),
    rowF('Narration note', HELP.narration, h('textarea', { id: 'vb-narr', rows: 2, maxlength: 600, placeholder: 'What is said during this scene', oninput: (e) => edit(() => { s.narration = e.target.value; }, key('n')) }, s.narration || '')),
    h('div', { class: 'vb-f two' }, lab('Lock this scene', HELP.lock), toggle(s.locked, () => edit(() => { s.locked = !s.locked; }), 'vb-lock')),
    h('div', { class: 'row-gap vb-acts' },
      h('button', { class: 'btn sm', id: 'vb-dup', onclick: () => duplicateScene(s) }, icon('copy'), 'Duplicate'),
      h('button', { class: 'btn sm', id: 'vb-split', title: 'Split at the playhead (S)', onclick: splitAtPlayhead }, icon('cut'), 'Split'),
      h('button', { class: 'btn sm danger', id: 'vb-del', onclick: () => deleteScene(s) }, icon('trash'), 'Delete')));
  const top = box.scrollTop; box.replaceChildren(...kids.filter(Boolean)); box.scrollTop = top;
}

// ---------- preview player ----------
function buildStage() {
  const mk = () => h('video', { playsinline: true, preload: 'auto', class: 'off' });
  B.vid = [mk(), mk()]; B.act = 0; B.img = h('img', { class: 'off', alt: '' }); B.none = h('div', { class: 'vb-none' }); B.tagEl = h('div', { class: 'vb-pictag off', id: 'vb-pictag' });
  B.voiceEl = h('audio', { preload: 'auto' }); B.musicEl = h('audio', { preload: 'auto' });
  fill($('#vb-stage'),
    h('div', { class: 'vb-screen', id: 'vb-screen' }, h('div', { class: 'vb-frame', id: 'vb-frame' }, B.vid[0], B.vid[1], B.img, B.none, B.tagEl, h('div', { class: 'vb-over', id: 'vb-over' }), h('div', { class: 'vb-cap', id: 'vb-capline' }))),
    h('div', { class: 'vb-ctl' },
      h('button', { class: 'icon-btn', id: 'vb-prev', title: 'Previous scene', onclick: () => jump(-1) }, '⏮'),
      h('button', { class: 'btn primary sm', id: 'vb-play', title: 'Play or pause (Space)', onclick: () => (B.playing ? pause() : play()) }, icon('play'), 'Play'),
      h('button', { class: 'icon-btn', id: 'vb-next', title: 'Next scene', onclick: () => jump(1) }, '⏭'),
      h('span', { class: 'vb-clock', id: 'vb-clock' }, '0:00.0'),
      h('div', { class: 'grow' }),
      h('small', { class: 'vb-note' }, 'Preview is a quick draft. Crossfades and exact sound levels show in the export.')),
    B.voiceEl, B.musicEl);
  sizeFrame();
}
function sizeFrame() {
  const fr = $('#vb-frame'), sc = $('#vb-screen'); if (!fr || !sc) return;
  const [a, b] = B.p.ratio.split(':').map(Number); const W = sc.clientWidth - 8, H = sc.clientHeight - 8; if (W <= 0 || H <= 0) return;
  let w = W, hh = W * b / a; if (hh > H) { hh = H; w = H * a / b; }
  fr.style.width = Math.floor(w) + 'px'; fr.style.height = Math.floor(hh) + 'px';
}
function onResize() { if (!B) return; sizeFrame(); drawTimeline(); }
const rowAt = (t) => { const rows = lay().rows; let hit = null; for (const r of rows) { if (t >= r.start - 0.0005) hit = r; else break; } return hit && t <= hit.start + hit.seconds + 0.001 ? hit : null; };
function setSrc(el, url) { if (el.dataset.src !== url) { el.dataset.src = url; el.src = url; } }
function syncMedia(force) {
  if (!B?.vid) return;
  const L = lay(); if (B.t > L.seconds) B.t = L.seconds;
  if (force) sizeFrame();
  const r = rowAt(B.t) || (L.rows.length && B.t >= L.seconds ? L.rows[L.rows.length - 1] : null);
  const f = r && srcOf(r.scene); const sp = r?.speed || 1; const dt = r ? Math.max(0, B.t - r.start) : 0; const local = r ? (r.trimIn || 0) + (r.reverse ? Math.max(0, r.seconds - dt) : dt) * sp : 0;
  const pic = !f && r?.scene.type === 'ai' && r.scene.refFileId ? B.files.get(r.scene.refFileId) : null; // no clip yet: show the picture it will start from
  const key = r ? r.scene.id + ':' + (f?.id || '') + ':' + (pic?.id || '') + ':' + r.scene.status : '';
  const isVid = f && f.kind === 'video';
  if (key !== B.shown || force) {
    B.shown = key;
    B.img.classList.toggle('off', !((f && f.kind === 'image') || pic)); B.none.classList.toggle('off', !!f || !!pic); B.tagEl.classList.toggle('off', !pic);
    if (f?.kind === 'image') setSrc(B.img, f.url); else if (pic) { setSrc(B.img, pic.url); B.tagEl.textContent = r.scene.status === 'generating' ? 'Start picture · the video is being generated…' : 'Start picture · press Generate to turn it into video'; }
    if (!f) B.none.replaceChildren(r ? h('div', {}, icon(r.scene.status === 'generating' ? 'sparkle' : 'film'), h('b', {}, `Scene ${L.rows.indexOf(r) + 1}`), h('span', {}, r.scene.status === 'generating' ? 'Being generated…' : r.scene.type === 'ai' ? 'No clip yet. Describe it and press Generate.' : 'This file is missing.')) : h('div', {}, icon('film'), h('span', {}, 'Add a scene to see it here.')));
    if (isVid) {
      const url = f.play || f.url; const other = B.vid[1 - B.act];
      if (other.dataset.src === url && B.vid[B.act].dataset.src !== url) B.act = 1 - B.act; // the next clip was loaded ahead of time
      const v = B.vid[B.act]; setSrc(v, url); try { v.currentTime = local; } catch { /* not loaded yet */ }
    }
    B.vid.forEach((v, n) => { const on = isVid && n === B.act; v.classList.toggle('off', !on); if (!on && !v.paused) v.pause(); });
    // load the scene after this one into the hidden player, so the change is smooth
    const nx = r && L.rows[L.rows.indexOf(r) + 1]; const nf = nx && srcOf(nx.scene);
    if (nf?.kind === 'video') { const o = B.vid[isVid ? 1 - B.act : 0]; if (!isVid || o !== B.vid[B.act]) { setSrc(o, nf.play || nf.url); o.muted = true; try { o.currentTime = nx.trimIn || 0; } catch { /* later */ } } }
  }
  if (isVid) {
    const v = B.vid[B.act]; const vol = clamp(r.volume, 0, 1); v.muted = vol === 0; v.volume = vol;
    if (v.playbackRate !== sp) v.playbackRate = sp;
    if (Math.abs((v.currentTime || 0) - local) > (r.reverse ? 0.04 : B.playing ? 0.4 : 0.05)) { try { v.currentTime = local; } catch { /* not ready */ } }
    // a browser cannot play a video backwards, so a backwards scene is shown frame by frame
    if (B.playing && !r.reverse && v.paused) v.play().catch(() => {}); if ((!B.playing || r.reverse) && !v.paused) v.pause();
  }
  // sound tracks
  const vo = B.p.voice && B.files.get(B.p.voice.fileId); const mu = B.p.music && B.files.get(B.p.music.fileId); let speaking = false;
  const track = (el, file, at, vol, loop) => {
    if (!file) { if (!el.paused) el.pause(); return false; }
    setSrc(el, file.url); const d = file.duration || el.duration || 0; let pos = at; if (loop && d) pos = ((at % d) + d) % d;
    const live = at >= 0 && (loop || !d || at < d) && B.t < L.seconds;
    el.volume = clamp(vol, 0, 1);
    if (!live || !B.playing) { if (!el.paused) el.pause(); if (live && Math.abs(el.currentTime - pos) > 0.05) { try { el.currentTime = pos; } catch { /* later */ } } return live; }
    if (Math.abs(el.currentTime - pos) > 0.4) { try { el.currentTime = pos; } catch { /* later */ } }
    if (el.paused) el.play().catch(() => {});
    return true;
  };
  speaking = track(B.voiceEl, vo, B.t - (B.p.voice?.offset || 0), B.p.voice?.volume ?? 1, false);
  const duck = mu && B.p.music.duck !== false && vo && speaking ? Math.pow(10, -(B.p.music.duckDb || 12) / 20) : 1;
  track(B.musicEl, mu, B.t, (B.p.music?.volume ?? 0.5) * duck, B.p.music?.fit !== false);
  const shown = (B.p.captions || []).filter((c) => B.t >= c.start && B.t < c.end); const cap = shown.find((c) => !c.pos); const over = shown.filter((c) => c.pos);
  const ov = $('#vb-over'); if (ov) { const k = over.map((c) => c.pos + ':' + c.text).join('|'); if (ov.dataset.k !== k) { ov.dataset.k = k; fill(ov, over.map((c) => h('span', { class: 'vb-ov ' + c.pos }, c.text))); } }
  const cl = $('#vb-capline'); if (cl) { cl.textContent = cap?.text || ''; cl.className = 'vb-cap ' + (B.p.captionStyle || 'clean') + (cap ? '' : ' off'); }
}
function drawClock() {
  const c = $('#vb-clock'); if (c) c.textContent = `${fmtT(B.t)} / ${fmtT(lay().seconds)}`;
  const ph = $('#vb-ph'); if (ph) ph.style.transform = `translateX(${B.t * B.zoom}px)`;
  const btn = $('#vb-play'); if (btn && btn.dataset.on !== String(B.playing)) { btn.dataset.on = String(B.playing); btn.replaceChildren(icon(B.playing ? 'stop' : 'play'), B.playing ? 'Pause' : 'Play'); }
}
function play() {
  const L = lay(); if (!L.rows.length) return; if (B.t >= L.seconds - 0.05) B.t = 0;
  B.playing = true; B.last = performance.now(); syncMedia(true); drawClock();
  const step = (now) => {
    if (!B?.playing) return;
    B.t += Math.min(0.25, (now - B.last) / 1000); B.last = now;
    if (B.t >= lay().seconds) { B.t = lay().seconds; pause(); return; }
    syncMedia(false); drawClock(); followPlayhead(); B.raf = requestAnimationFrame(step);
  };
  B.raf = requestAnimationFrame(step);
}
function pause() { if (!B) return; B.playing = false; cancelAnimationFrame(B.raf); if (B.vid) { syncMedia(false); drawClock(); } }
function seek(t) { B.t = clamp(t, 0, lay().seconds); syncMedia(false); drawClock(); }
function jump(dir) { const rows = lay().rows; const i = rows.indexOf(rowAt(B.t)); const r = rows[clamp((i < 0 ? 0 : i) + dir, 0, rows.length - 1)]; if (r) { seek(r.start + 0.001); B.sel = r.scene.id; B.cap = null; draw('all'); } }
function followPlayhead() { const sc = $('#vb-scroll'); if (!sc) return; const x = B.t * B.zoom; if (x > sc.scrollLeft + sc.clientWidth - 60 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 80); }

// ---------- timeline ----------
const HEAD = 228;
function fitZoom() { const w = ($('#vb-tl')?.clientWidth || 900) - HEAD - 40; return clamp(w / Math.max(4, lay().seconds), 4, 240); }
function snapTime(t, skip = []) {
  if (!B.snap) return t;
  const L = lay(); const pts = [0, B.t, L.seconds, Math.round(t * 2) / 2];
  for (const r of L.rows) pts.push(r.start, r.start + r.seconds);
  for (const c of B.p.captions || []) pts.push(c.start, c.end);
  if (B.p.voice) pts.push(B.p.voice.offset || 0);
  let best = t, d = 8 / B.zoom;
  for (const p of pts) { if (skip.includes(p)) continue; const x = Math.abs(p - t); if (x < d) { d = x; best = p; } }
  return best;
}
// Dragging with the mouse or a finger: move() gets the distance in seconds since the start.
function dragX(e, { start, move, end, threshold = 3 }) {
  if (e.button > 0) return; e.stopPropagation();
  // Listening on the window: the timeline is redrawn while dragging, so the piece that was grabbed may be replaced.
  const x0 = e.clientX; let on = false; const el = window; e.preventDefault();
  const mv = (ev) => { if (!B) return up(ev); const dx = ev.clientX - x0; if (!on) { if (Math.abs(dx) < threshold) return; on = true; start?.(); } move(dx / B.zoom, ev); };
  const up = (ev) => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (B) end?.(on, ev); };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
const beginDrag = () => { B.hold = true; B.undo.push(JSON.stringify(docOf(B.p))); B.redo = []; B.lastKey = ''; };
const liveDrag = () => { touchLay(); drawTimeline(); drawClock(); const L = $('#vb-len'); if (L) L.textContent = fmtLen(lay().seconds); };
async function peaksOf(fid) {
  if (B.peaks.has(fid)) return B.peaks.get(fid);
  const p = api('/api/builder/peaks/' + fid).catch(() => null); B.peaks.set(fid, p); const v = await p; if (B) B.peaks.set(fid, v); return v;
}
function wave(fid, seconds, { loopEvery = 0, from = 0 } = {}) {
  const c = h('canvas', { class: 'vb-wave' }); const width = Math.max(2, Math.round(seconds * B.zoom));
  c.width = Math.min(8000, width); c.height = 40; c.style.width = width + 'px';
  Promise.resolve(peaksOf(fid)).then((pk) => {
    if (!pk?.peaks?.length || !c.isConnected) return;
    const g = c.getContext('2d'); g.fillStyle = getComputedStyle(c).color; const n = c.width; const per = seconds / n;
    for (let x = 0; x < n; x++) { let t = from + x * per; if (loopEvery) t %= loopEvery; const v = pk.peaks[Math.floor(t * pk.perSec)] || 0; const hh = Math.max(1, (v / 100) * 36); g.fillRect(x, 20 - hh / 2, 1, hh); }
  });
  return c;
}
function drawTimeline() {
  const box = $('#vb-tl'); if (!box || !B) return;
  if (!B.zoom || (B.autoZoom !== false && !B.hold)) B.zoom = fitZoom();
  const L = lay(); const Z = B.zoom; const total = Math.max(L.seconds, 1); const width = Math.max(total * Z + 160, box.clientWidth - HEAD);
  const keep = $('#vb-scroll')?.scrollLeft || 0;
  const px = (s) => Math.round(s * Z * 100) / 100 + 'px';
  // ruler
  const stepS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * Z >= 64) || 300; const ticks = [];
  for (let t = 0; t <= total + stepS; t += stepS) ticks.push(h('span', { class: 'tick', style: { left: px(t) } }, t % 60 === 0 && t ? `${t / 60}m` : fmtT(t).replace(/\.0$/, '')));
  const ruler = h('div', { class: 'vb-ruler', id: 'vb-ruler', onpointerdown: (e) => { const rc = e.currentTarget.getBoundingClientRect(); const at = (x) => seek((x - rc.left) / Z); pause();
    if (PE() && e.shiftKey) { const t0 = (e.clientX - rc.left) / Z; return dragX(e, { threshold: 2, move: (_d, ev) => setRange(t0, (ev.clientX - rc.left) / Z, true), end: (m) => { if (!m) { B.range = null; drawRange(); } else if (B.range) seek(B.range.a); } }); }
    at(e.clientX); dragX(e, { threshold: 0, move: (_d, ev) => at(ev.clientX) }); } }, ticks);
  // video track
  const vblocks = L.rows.map((r, i) => {
    const s = r.scene; const f = srcOf(s); const can = s.type !== 'image' && f?.duration && !windowed(s); const [, cls] = statusOf(s); const sp = r.speed || 1;
    const blk = h('div', { class: `vb-clip ${s.type} ${cls}` + (s.id === B.sel ? ' on' : ''), 'data-id': s.id, style: { left: px(r.start), width: px(r.seconds) }, title: `Scene ${i + 1} · ${r2(r.seconds)} s`,
      onpointerdown: (e) => { if (e.target.classList.contains('hd')) return; let to = i; const mark = $('#vb-mark');
        dragX(e, { threshold: 6, start: () => { blk.classList.add('moving'); mark.hidden = false; },
          move: (_d, ev) => { const t = (ev.clientX - $('#vb-tracks').getBoundingClientRect().left) / Z; to = L.rows.findIndex((x) => t < x.start + x.seconds / 2); if (to < 0) to = L.rows.length; const edge = to >= L.rows.length ? L.seconds : L.rows[to].start; mark.style.left = px(edge); },
          end: (moved) => { mark.hidden = true; blk.classList.remove('moving'); if (moved) moveScene(s.id, to); else select(s.id, true); } }); } },
      h('span', { class: 'hd l' + (can ? '' : ' off'), title: 'Drag to trim the start', onpointerdown: (e) => { const in0 = Number(s.trimIn) || 0; const out = s.trimOut || f.duration; dragX(e, { start: beginDrag, move: (d) => { s.trimIn = r2(clamp(in0 + d * sp, 0, out - 0.3)); liveDrag(); }, end: (m) => m && changed('all') }); } }),
      h('span', { class: 'lbl' }, h('b', {}, String(i + 1)), thumbOf(s), h('i', {}, s.type === 'ai' ? (s.prompt || 'AI scene') : f?.name || '')),
      s.transition && s.transition !== 'cut' && i < L.rows.length - 1 && h('span', { class: 'tr', title: TRANS[s.transition] }, s.transition === 'crossfade' ? '⨯' : '◐'),
      h('span', { class: 'hd r', title: 'Drag to change where this scene ends', onpointerdown: (e) => {
        if (can) { const tin = Number(s.trimIn) || 0; const out0 = s.trimOut || f.duration; dragX(e, { start: beginDrag, move: (d) => { let o = clamp(out0 + d * sp, tin + 0.3, f.duration); const edge = snapTime(r.start + (o - tin) / sp); o = clamp(tin + (edge - r.start) * sp, tin + 0.3, f.duration); if (o >= f.duration - 0.02) delete s.trimOut; else s.trimOut = r2(o); liveDrag(); }, end: (m) => m && changed('all') }); }
        else if (s.type === 'image' || !f) { const d0 = r.seconds; dragX(e, { start: beginDrag, move: (d) => { const edge = snapTime(r.start + d0 + d); s.duration = r2(clamp(edge - r.start, s.type === 'ai' ? 1 : 0.5, 60)); liveDrag(); }, end: (m) => m && changed('all') }); } } }));
    return blk;
  });
  // voice-over
  const vo = B.p.voice && B.files.get(B.p.voice.fileId); const mu = B.p.music && B.files.get(B.p.music.fileId);
  const voBlock = vo && h('div', { class: 'vb-aud voice', id: 'vb-voice', style: { left: px(B.p.voice.offset || 0), width: px(vo.duration || 1) }, title: `${vo.name} · drag to move where the voice starts`,
    onpointerdown: (e) => { const o0 = B.p.voice.offset || 0; dragX(e, { start: beginDrag, move: (d) => { B.p.voice.offset = r2(clamp(snapTime(o0 + d, [o0]), 0, 600)); liveDrag(); }, end: (m) => m && changed('all') }); } }, wave(vo.id, vo.duration || 1), h('span', { class: 'nm' }, vo.name));
  const muLen = mu ? (B.p.music.fit !== false ? L.seconds : Math.min(mu.duration || 0, L.seconds)) : 0;
  const duckOn = mu && vo && B.p.music.duck !== false;
  const muBlock = mu && muLen > 0 && h('div', { class: 'vb-aud music', id: 'vb-music', style: { left: 0, width: px(muLen) }, title: `${mu.name}${B.p.music.fit !== false ? ' · looped to fit the video' : ''}` },
    wave(mu.id, muLen, { loopEvery: B.p.music.fit !== false ? mu.duration : 0 }), h('span', { class: 'nm' }, mu.name),
    (B.beats?.fileId === mu.id ? beatTimes(muLen, mu.duration) : []).map((t) => h('i', { class: 'beat', style: { left: px(t) } })),
    duckOn && h('span', { class: 'duck', id: 'vb-duck', title: 'The music is lowered here while the voice speaks', style: { left: px(B.p.voice.offset || 0), width: px(Math.max(0, Math.min(vo.duration || 0, muLen - (B.p.voice.offset || 0)))) } }, `−${B.p.music.duckDb || 12} dB`));
  // captions
  const caps = (B.p.captions || []).map((c, i) => h('div', { class: 'vb-capb' + (B.cap === i ? ' on' : '') + (c.pos ? ' ' + c.pos : ''), 'data-cap': i, style: { left: px(c.start), width: px(Math.max(0.2, c.end - c.start)) }, title: 'Double-click to change the words',
    ondblclick: () => editCaption(i),
    onpointerdown: (e) => { if (e.target.classList.contains('hd')) return; const s0 = c.start, len = c.end - c.start; dragX(e, { start: beginDrag, move: (d) => { c.start = r2(clamp(snapTime(s0 + d, [s0]), 0, Math.max(0, L.seconds - 0.2))); c.end = r2(c.start + len); liveDrag(); }, end: (m) => { if (m) { B.p.captions.sort((a, b) => a.start - b.start); B.cap = B.p.captions.indexOf(c); changed('all'); } else { B.cap = i; $$('.vb-capb').forEach((el) => el.classList.toggle('on', Number(el.dataset.cap) === i)); } } }); } },
    h('span', { class: 'hd l', onpointerdown: (e) => { const s0 = c.start; dragX(e, { start: beginDrag, move: (d) => { c.start = r2(clamp(snapTime(s0 + d), 0, c.end - 0.2)); liveDrag(); }, end: (m) => m && changed('all') }); } }),
    h('span', { class: 'ct' }, c.text),
    h('span', { class: 'hd r', onpointerdown: (e) => { const e0 = c.end; dragX(e, { start: beginDrag, move: (d) => { c.end = r2(Math.max(c.start + 0.2, snapTime(e0 + d))); liveDrag(); }, end: (m) => m && changed('all') }); } })));
  const trk = (cls, ...kids) => h('div', { class: 'vb-track ' + cls }, kids);
  const vol = (obj, k, id) => h('input', { type: 'range', class: 'vb-tvol', id, min: 0, max: 100, step: 5, value: String(Math.round((obj[k] ?? 1) * 100)), title: 'Track volume', oninput: (e) => edit(() => { obj[k] = Number(e.target.value) / 100; }, { key: id, redraw: 'none' }) });
  const heads = h('div', { class: 'vb-heads' },
    h('div', { class: 'vb-th tools' },
      h('button', { class: 'icon-btn sm', id: 'vb-zout', title: 'Zoom out', onclick: () => setZoom(B.zoom / 1.4) }, '−'),
      h('input', { type: 'range', id: 'vb-zoom', min: 4, max: 240, step: 1, value: String(Math.round(Z)), title: 'Zoom', oninput: (e) => setZoom(Number(e.target.value)) }),
      h('button', { class: 'icon-btn sm', id: 'vb-zin', title: 'Zoom in', onclick: () => setZoom(B.zoom * 1.4) }, '+'),
      h('button', { class: 'btn ghost sm' + (B.autoZoom !== false ? ' on' : ''), id: 'vb-zfit', title: 'Show the whole video', onclick: () => { B.autoZoom = true; drawTimeline(); } }, 'Fit'), info(HELP.zoom)),
    h('div', { class: 'vb-th v' }, icon('video'), h('b', {}, 'Video'), h('div', { class: 'grow' }), h('button', { class: 'icon-btn sm' + (B.snap ? ' on' : ''), id: 'vb-snap', title: 'Snapping: ' + (B.snap ? 'on' : 'off') + '. ' + HELP.snap, onclick: () => { B.snap = !B.snap; drawTimeline(); } }, '⌖'), h('button', { class: 'icon-btn sm', id: 'vb-tsplit', title: 'Split at the playhead (S)', onclick: splitAtPlayhead }, icon('cut'))),
    h('div', { class: 'vb-th a' }, icon('mic'), h('b', {}, 'Voice'), info(HELP.voice), h('div', { class: 'grow' }), vo ? [INFO.audioFirst && h('button', { class: 'btn ghost sm', id: 'vb-plan', title: 'Plan scenes from what is said in the voice-over', onclick: planFromVoice }, icon('wand'), 'Plan'), vol(B.p.voice, 'volume', 'vb-vvol'), h('button', { class: 'icon-btn sm', id: 'vb-vmenu', title: 'Voice-over options', onclick: (e) => audioMenu(e.currentTarget, 'voice') }, icon('dots'))] : h('button', { class: 'btn ghost sm', id: 'vb-vadd', onclick: () => pickAudio('voice') }, icon('plus'), 'Add')),
    h('div', { class: 'vb-th a' }, icon('audio'), h('b', {}, 'Music'), info(HELP.music), h('div', { class: 'grow' }), mu ? [vol(B.p.music, 'volume', 'vb-mvol'), h('button', { class: 'icon-btn sm', id: 'vb-mmenu', title: 'Music options', onclick: (e) => audioMenu(e.currentTarget, 'music') }, icon('dots'))] : h('button', { class: 'btn ghost sm', id: 'vb-madd', onclick: () => openMusic() }, icon('plus'), 'Add')),
    h('div', { class: 'vb-th c' }, icon('type'), h('b', {}, 'Captions'), info(HELP.captions), h('div', { class: 'grow' }), h('button', { class: 'icon-btn sm', id: 'vb-cstyle', title: 'Caption look', onclick: (e) => popover(e.currentTarget, h('div', { class: 'menu' }, INFO.captionStyles.map((c) => h('button', { class: c.id === B.p.captionStyle ? 'on' : '', onclick: () => { closePop(); edit((p) => { p.captionStyle = c.id; }); } }, c.label)))) }, icon('palette')), h('button', { class: 'btn ghost sm', id: 'vb-cadd', title: 'Add a caption at the playhead', onclick: addCaption }, icon('plus'), 'Add')));
  const tracks = h('div', { class: 'vb-tracks', id: 'vb-tracks', style: { width: width + 'px' } },
    ruler, trk('v', vblocks, h('span', { class: 'vb-mark', id: 'vb-mark', hidden: true })), trk('a', voBlock), trk('a', muBlock), trk('c', caps),
    PE() && rangeBand(Z),
    h('div', { class: 'vb-ph', id: 'vb-ph', style: { transform: `translateX(${B.t * Z}px)` } }));
  const scroll = h('div', { class: 'vb-scroll', id: 'vb-scroll', onwheel: (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(B.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); } } }, tracks);
  box.replaceChildren(heads, scroll); scroll.scrollLeft = keep;
}
function setZoom(z) { B.autoZoom = false; const sc = $('#vb-scroll'); const mid = sc ? (sc.scrollLeft + sc.clientWidth / 2) / B.zoom : 0; B.zoom = clamp(z, 4, 240); drawTimeline(); const s2 = $('#vb-scroll'); if (s2) s2.scrollLeft = Math.max(0, mid * B.zoom - s2.clientWidth / 2); }

// ---------- voice-over, music, captions ----------
function pickAudio(as) { pickFiles('audio/*,.mp3,.wav,.m4a', false, (files) => addFiles(files, { audioAs: as })); }
function audioMenu(anchor, k) {
  const t = B.p[k]; const item = (ic, text, fn) => h('button', { onclick: () => { closePop(); fn(); } }, icon(ic), text);
  const sw = (label, help, on, fn, id) => h('div', { class: 'vb-mi' }, lab(label, help), toggle(on, (e) => { fn(); e.currentTarget.classList.toggle('on'); }, id));
  popover(anchor, h('div', { class: 'menu vb-amenu' },
    k === 'music' && sw('Lower under the voice', HELP.duck, t.duck !== false, () => edit(() => { t.duck = t.duck === false; }, { redraw: 'nopanel' }), 'vb-duck-sw'),
    k === 'music' && h('div', { class: 'vb-mi' }, lab('By how much'), slider(t.duckDb || 12, { min: 3, max: 24, step: 1, id: 'vb-duckdb', fmt: (v) => `${v} dB`, on: (v) => edit(() => { t.duckDb = v; }, { key: 'duckdb', redraw: 'none' }) })),
    k === 'music' && sw('Fit to the video length', 'Repeats a short track with a soft join, or shortens a long one, and ends with a 2 second fade.', t.fit !== false, () => edit(() => { t.fit = t.fit === false; }, { redraw: 'nopanel' }), 'vb-fit-sw'),
    PE() && h('div', { class: 'vb-mi' }, lab('Fade in', 'The track starts silent and rises to its volume over this time.'), slider(t.fadeIn || 0, { min: 0, max: 10, step: 0.5, id: `vb-${k}-fin`, fmt: (v) => `${v} s`, on: (v) => edit(() => { t.fadeIn = v; }, { key: k + 'fin', redraw: 'none' }) })),
    PE() && h('div', { class: 'vb-mi' }, lab('Fade out', k === 'music' ? 'The music always ends with a fade of at least 2 seconds.' : 'The track falls to silence over this time at its end.'), slider(k === 'music' ? Math.max(2, t.fadeOut || 0) : t.fadeOut || 0, { min: k === 'music' ? 2 : 0, max: 10, step: 0.5, id: `vb-${k}-fout`, fmt: (v) => `${v} s`, on: (v) => edit(() => { t.fadeOut = v; }, { key: k + 'fout', redraw: 'none' }) })),
    k === 'voice' && INFO.audioFirst && item('wand', 'Plan scenes from this voice-over', planFromVoice),
    k === 'voice' && INFO.audioFirst && B.p.audioPlan && item('list', 'Show the last scene plan', () => reviewPlan(B.p.audioPlan.plan)),
    k === 'music' && INFO.beatSync && item('audio', 'Cut to the beat', cutToBeat),
    item('swap', k === 'music' ? 'Choose other music' : 'Replace the voice-over', () => (k === 'music' ? openMusic() : pickAudio('voice'))),
    item('trash', 'Remove', () => edit((p) => { p[k] = null; }))));
}
function addCaption() {
  const L = lay(); const start = Math.floor(clamp(B.t, 0, Math.max(0, L.seconds - 0.5)) * 100) / 100; const c = { start, end: r2(Math.min(L.seconds || start + 3, start + 3)), text: 'New caption' };
  edit((p) => { p.captions = [...(p.captions || []), c].sort((a, b) => a.start - b.start); }); B.cap = B.p.captions.indexOf(c); drawTimeline(); editCaption(B.cap);
}
function editCaption(i) {
  const c = B.p.captions[i]; if (!c) return;
  const ta = h('textarea', { rows: 3, maxlength: 200, id: 'vb-cap-text' }, c.text === 'New caption' ? '' : c.text);
  const pos = h('select', { id: 'vb-cap-pos', class: 'vb-select' }, [['', 'Bottom (caption)'], ...(INFO.captionPos || []).map((p) => [p.id, p.label])].map(([v, l]) => h('option', { value: v }, l))); pos.value = c.pos || '';
  const d = dialog({ title: 'Caption', sub: `${fmtT(c.start)} to ${fmtT(c.end)}`, body: [field('Words shown on screen', ta), PE() ? field('Where it shows', pos) : null, PE() ? h('small', { class: 'vb-hint' }, 'A title or a lower third is burned into the video. The caption file you can download holds the bottom captions only.') : null].filter(Boolean), foot: [
    h('button', { class: 'btn ghost', onclick: () => { d.remove(); edit((p) => { p.captions.splice(p.captions.indexOf(c), 1); }); B.cap = null; drawTimeline(); } }, 'Delete caption'),
    h('button', { class: 'btn primary', id: 'vb-cap-ok', onclick: () => { const t = ta.value.trim(); d.remove(); edit((p) => { if (t) { c.text = t; if (PE()) { if (pos.value) c.pos = pos.value; else delete c.pos; } } else p.captions.splice(p.captions.indexOf(c), 1); }); } }, 'Save')] });
}
// ---------- scenes planned from the voice-over ----------
async function planFromVoice(opt) {
  const title = typeof opt?.title === 'string' ? opt.title : 'Plan scenes from the voice-over?'; const lead = typeof opt?.lead === 'string' ? opt.lead : '';
  try {
    await flush();
    const dry = await call('POST', `/api/builder/projects/${B.id}/plan-audio`, { dryRun: true }); if (!dry.ok) throw fail(dry);
    if (dry.data.job) return watchPlan(dry.data.job.id);
    confirmBox(title, `${lead}Scenly listens to the recording, writes down the words and suggests one scene for each phrase, with a description of the picture. This costs up to ${fmtCredits(dry.data.cap)} credits, and only what is really used is charged. No video is generated yet: you review the plan first.`, `Plan · up to ${fmtCredits(dry.data.cap)} credits`, async () => {
      const r = await call('POST', `/api/builder/projects/${B.id}/plan-audio`, { idem: newId(), lang: navigator.language || '' }); if (!r.ok) throw fail(r);
      watchPlan(r.data.job.id);
    });
  } catch (e) { errToast(e); }
}
function watchPlan(jobId) {
  const bar = h('i', {}); const note = h('small', {}, 'Starting…'); const pid = B.id;
  const d = dialog({ title: 'Planning your scenes', sub: 'You can close this and keep working. The plan waits for you under the voice-over menu.', body: h('div', { class: 'vb-prog', id: 'vb-planprog' }, h('div', { class: 'bar' }, bar), note) });
  const tick = async () => {
    if (!B || B.id !== pid) return;
    const r = await call('GET', '/api/jobs/' + jobId); const j = r.data?.job;
    if (!r.ok || !j) { if (r.status === 0) return setTimeout(tick, 2500); d.remove(); return; }
    bar.style.width = Math.round((j.progress || 0) * 100) + '%'; note.textContent = j.note || 'Working…';
    if (j.status === 'done') { d.remove(); api('/api/me').then((m) => setCredits(m.user?.credits)).catch(() => {}); B.p.audioPlan = { at: j.endedAt, plan: j.result.plan }; return reviewPlan(j.result.plan, j.result.credits); }
    if (j.status === 'failed' || j.status === 'cancelled') { d.remove(); return toast((j.error || 'The plan could not be made.') + ' Nothing was charged.', 'error'); }
    setTimeout(tick, 900);
  };
  tick();
}
function reviewPlan(plan, credits) {
  if (!plan?.scenes?.length) return toast('This plan is empty.', 'error');
  let mode = B.p.scenes.length ? 'replace' : 'add'; let caps = plan.captions.length > 0; const cost = r2(plan.scenes.reduce((n, s) => n + priceOf({ duration: s.duration }), 0));
  const seg = B.p.scenes.length > 0 && h('div', { class: 'seg' }, [['replace', 'Replace my scenes'], ['add', 'Add after my scenes']].map(([k, l]) => h('button', { class: k === mode ? 'on' : '', 'data-mode': k, onclick: (e) => { mode = k; $$('button', seg).forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, l)));
  const d = dialog({ title: `Scene plan: ${plan.scenes.length} scenes, ${fmtLen(plan.seconds)}`, wide: true,
    sub: [credits != null ? `Planning cost ${fmtCredits(credits)} credits. ` : '', plan.noWords ? 'No words could be written down, so the scenes follow the pauses in the recording. ' : '', `Generating all of them would cost about ${fmtCredits(cost)} credits. You can still change every description first.`].join(''),
    body: [h('div', { class: 'vb-plan', id: 'vb-planlist' }, plan.scenes.map((s, i) => h('div', { class: 'vb-pl' }, h('b', {}, String(i + 1)), h('small', {}, `${fmtT(s.start)} · ${s.duration} s`), h('div', {}, s.narration && h('p', { class: 'say' }, `“${s.narration}”`), h('p', {}, s.prompt))))),
      seg && h('div', { class: 'vb-f two' }, lab('With the scenes I already have'), seg),
      plan.captions.length > 0 && h('div', { class: 'vb-f two' }, lab('Add the words as captions', 'Puts each spoken phrase on the Captions track at the moment it is said.'), toggle(true, (e) => { caps = !caps; e.currentTarget.classList.toggle('on', caps); }, 'vb-plancaps'))],
    foot: [h('button', { class: 'btn ghost', onclick: () => d.remove() }, 'Not now'), h('button', { class: 'btn primary', id: 'vb-planuse', onclick: () => {
      d.remove(); const made = plan.scenes.map((s) => ({ id: newId(), type: 'ai', prompt: s.prompt, duration: s.duration, narration: s.narration, transition: 'cut', fit: 'pad', versions: [], cur: 0, status: 'draft' }));
      edit((p) => { p.scenes = mode === 'replace' ? made : [...p.scenes, ...made]; if (mode === 'replace' && p.voice) p.voice.offset = 0; if (caps) p.captions = plan.captions.map((c) => ({ ...c })); });
      B.sel = made[0].id; B.cap = null; draw('all'); toast('Scenes added. Check the descriptions, then press Generate. Undo takes the plan back.');
    } }, 'Use this plan')] });
}
// ---------- cuts moved to the beat of the music ----------
function beatTimes(until, trackLen) { const out = []; const b = B.beats?.beats || []; if (!b.length) return out; const loop = B.p.music?.fit !== false && trackLen > 0; for (let k = 0; k < 400; k++) { for (const t of b) { const x = t + k * (trackLen || 0); if (x >= until) return out; out.push(x); } if (!loop) break; } return out; }
async function cutToBeat() {
  try {
    await flush(); const r = await call('GET', `/api/builder/projects/${B.id}/beats`); if (!r.ok) throw fail(r);
    const mu = B.files.get(B.p.music.fileId); B.beats = { ...r.data, fileId: mu.id };
    let moved = 0;
    edit((p) => {
      for (let i = 0; i < p.scenes.length - 1; i++) {
        touchLay(); const L = lay(); const row = L.rows[i]; const s = row.scene; const end = row.start + row.seconds; const beats = beatTimes(L.seconds + 30, mu.duration); if (!beats.length) break;
        const f = srcOf(s); const fixed = s.type !== 'image' && f?.duration; const maxLen = fixed ? f.duration - (Number(s.trimIn) || 0) : 60; const minLen = 0.5;
        const cands = beats.filter((b) => b - row.start >= minLen && b - row.start <= maxLen + 0.001).sort((a, b) => Math.abs(a - end) - Math.abs(b - end));
        const t = cands[0]; if (t == null || Math.abs(t - end) < 0.02) continue;
        const len = r2(t - row.start);
        if (fixed) { const out = (Number(s.trimIn) || 0) + len; if (out >= f.duration - 0.02) delete s.trimOut; else s.trimOut = r2(out); } else s.duration = len;
        moved++;
      }
    });
    toast(moved ? `${moved} cut${moved === 1 ? '' : 's'} moved to the beat (${r.data.bpm} beats a minute). Undo brings them back.` : 'The cuts already sit on the beat.');
  } catch (e) { errToast(e); }
}
let previewEl = null;
async function openMusic() {
  let mood = ''; let lib = { tracks: [], moods: [] };
  if (INFO.musicLibrary) { try { lib = await api('/api/builder/music'); } catch { /* library unavailable: upload still works */ } }
  const list = h('div', { class: 'vb-tracks-list' }); const chips = h('div', { class: 'vb-moods' });
  const stop = () => { if (previewEl) { previewEl.pause(); previewEl = null; } $$('.vb-trk.playing', list).forEach((x) => x.classList.remove('playing')); };
  const drawList2 = () => {
    chips.replaceChildren(...['', ...lib.moods].map((m) => h('button', { class: 'btn ghost sm' + (m === mood ? ' on' : ''), 'data-mood': m || 'all', onclick: () => { mood = m; drawList2(); } }, m || 'All')));
    const rows = lib.tracks.filter((t) => !mood || t.mood === mood);
    list.replaceChildren(...(rows.length ? rows.map((t) => { const row = h('div', { class: 'vb-trk', 'data-track': t.id },
      h('button', { class: 'icon-btn', title: 'Listen', onclick: () => { const was = row.classList.contains('playing'); stop(); if (was) return; previewEl = new Audio(t.audio); previewEl.play().catch(() => {}); previewEl.onended = stop; row.classList.add('playing'); } }, icon('play')),
      h('div', { class: 'grow' }, h('b', {}, t.title), h('small', {}, [t.mood, t.genre, fmtLen(t.duration), t.bpm ? `${t.bpm} BPM` : null].filter(Boolean).join(' · ')), h('small', { class: 'lic' }, t.licence)),
      h('button', { class: 'btn sm', onclick: () => { stop(); d.remove(); B.files.set('lib_' + t.id, { id: 'lib_' + t.id, kind: 'audio', name: t.title, duration: t.duration, url: t.audio }); edit((p) => { p.music = { ...(p.music || { volume: 0.5, duck: true, duckDb: 12, fit: true }), trackId: t.id, fileId: 'lib_' + t.id }; }); flush().then(async () => { const r = await call('GET', '/api/builder/projects/' + B.id); if (r.ok) adopt(r.data, false); }).catch(errToast); } }, 'Use'));
      return row; }) : [h('div', { class: 'empty' }, lib.tracks.length ? 'No tracks with this mood yet.' : 'The music library is empty.')]));
  };
  drawList2();
  const d = dialog({ title: 'Music', sub: 'Pick a track from the library or upload your own (MP3, WAV or M4A, up to 20 minutes).', wide: true, body: [INFO.musicLibrary && chips, INFO.musicLibrary && list],
    foot: [S.user.isAdmin && INFO.musicLibrary && h('a', { class: 'btn ghost', href: '#/builder/music', onclick: () => { stop(); d.remove(); } }, 'Manage library'), h('div', { class: 'grow' }), h('button', { class: 'btn', id: 'vb-mupload', onclick: () => { stop(); d.remove(); pickAudio('music'); } }, icon('upload'), 'Upload my own')] });
  new MutationObserver(() => { if (!d.isConnected) stop(); }).observe(document.body, { childList: true });
}

// ---------- export ----------
function exportEnded(e) {
  if (e.status === 'done') { toast('Your video is ready. It is also saved in Assets.'); openExport(); }
  else if (e.status === 'failed') toast(e.error || 'The export did not finish. Nothing was charged. Please try again.', 'error');
  else toast('Export stopped.');
}
function openExport() {
  let res = B.p.resolution, burn = false, audioOnly = false; const hasCaps = (B.p.captions || []).length > 0;
  const seg = h('div', { class: 'seg' }, INFO.resolutions.map((r) => h('button', { class: r === res ? 'on' : '', 'data-res': r, onclick: (e) => { res = r; $$('button', seg).forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, r)));
  const done = (B.p.exports || []).filter((e) => e.status === 'done').slice(0, 6);
  const go = async (btn) => {
    btn.disabled = true;
    try { await flush(); const r = await call('POST', `/api/builder/projects/${B.id}/export`, { resolution: res, burnCaptions: burn, audioOnly, idem: newId() }); if (!r.ok) throw fail(r); adopt(r.data, false); d.remove(); schedulePoll(600); toast(r.data.already ? 'An export of this video is already running.' : 'Export started. It keeps going if you close this tab.'); const note = r.data.project.exports?.[0]?.note; if (note) toast(note); }
    catch (e) { errToast(e); btn.disabled = false; }
  };
  const d = dialog({ title: 'Export video', sub: `${fmtLen(lay().seconds)} · ${B.p.scenes.length} scene${B.p.scenes.length === 1 ? '' : 's'} · exporting is free`, body: [
    field('Quality', seg),
    hasCaps && h('div', { class: 'vb-f two' }, lab('Burn captions into the picture', HELP.burn), INFO.canBurnCaptions ? toggle(false, (e) => { burn = !burn; e.currentTarget.classList.toggle('on', burn); }, 'vb-burn') : h('small', { class: 'vb-hint', id: 'vb-noburn' }, 'Not available on this computer')),
    hasCaps && !INFO.canBurnCaptions && h('small', { class: 'vb-hint' }, INFO.burnHelp),
    h('div', { class: 'vb-f two' }, lab('Sound only (no picture)', 'Exports just the mixed voice-over, music and clip sound as an audio file.'), toggle(false, (e) => { audioOnly = !audioOnly; e.currentTarget.classList.toggle('on', audioOnly); }, 'vb-aonly')),
    hasCaps && h('a', { class: 'btn ghost sm', id: 'vb-srt', href: `/api/builder/projects/${B.id}/captions.srt`, download: '', 'data-plain': '1', onclick: async (e) => { if (B.dirty) { e.preventDefault(); await flush().catch(() => {}); e.target.closest('a').click(); } } }, icon('dl'), 'Download captions (.srt)'),
    done.length > 0 && h('div', { class: 'vb-exports', id: 'vb-exports' }, h('div', { class: 'lab' }, 'Finished exports'), done.map((e) => h('div', { class: 'vb-ex' }, icon(e.audioOnly ? 'audio' : 'film'),
      h('div', { class: 'grow' }, h('b', {}, e.audioOnly ? 'Sound only' : `${e.width}×${e.height}${e.burned ? ' · captions burned in' : ''}`), h('small', {}, `${fmtLen(e.seconds || 0)} · ${fmtSize(e.bytes)} · ${new Date(e.endedAt).toLocaleString()}`)),
      h('button', { class: 'btn sm', onclick: () => downloadFiles([e.fileId]) }, icon('dl'), 'Download')))),
  ], foot: [h('button', { class: 'btn primary', id: 'vb-export-go', onclick: (e) => go(e.currentTarget) }, icon('dl'), 'Export')] });
}

// ---------- keyboard ----------
// ---------- precision editing: change one part of a scene, picked on the timeline or from the transcript ----------
// Shown only while FEATURE_PRECISION_EDIT is on. The server cuts the scene into pieces; an AI action adds a new version to the selected piece only.
const PE = () => !!INFO?.precision;
const windowed = (s) => { const v = s && curVersion(s); return !!(v && v.tin != null); };
const editModels = () => S.models.filter((m) => m.type === 'video' && m.video?.tasks?.includes('edit'));
// The selection always stays inside one scene: the one it starts in.
function setRange(a, b, quiet) {
  const L = lay(); const lo = clamp(Math.min(a, b), 0, L.seconds); let hi = clamp(Math.max(a, b), 0, L.seconds);
  const r = L.rows.find((x) => lo >= x.start - 0.001 && lo < x.start + x.seconds - 0.05);
  if (!r) { B.range = null; return drawRange(); }
  const end = r.start + r.seconds; if (hi > end + 0.001) { hi = end; if (!quiet) toast(`A selection stays inside one scene. It now ends where scene ${L.rows.indexOf(r) + 1} ends.`); }
  B.range = { a: r2(Math.max(lo, r.start)), b: r2(hi), id: r.scene.id };
  if (B.sel !== r.scene.id) { B.sel = r.scene.id; B.cap = null; drawList(); drawPanel(); $$('.vb-clip').forEach((el) => el.classList.toggle('on', el.dataset.id === B.sel)); }
  drawRange();
}
function drawRange() {
  const el = $('#vb-range'); const g = B.range && B.range.b - B.range.a >= 0.05 ? B.range : null;
  if (el) { el.hidden = !g; if (g) { el.style.left = g.a * B.zoom + 'px'; el.style.width = (g.b - g.a) * B.zoom + 'px'; } }
  drawRangeBar();
}
function rangeBand(Z) {
  const g = B.range && B.range.b - B.range.a >= 0.05 ? B.range : null;
  const grab = (side) => (e) => { const g0 = { ...B.range }; dragX(e, { threshold: 1, move: (d) => (side === 'l' ? setRange(Math.min(g0.a + d, g0.b - 0.1), g0.b, true) : setRange(g0.a, Math.max(g0.b + d, g0.a + 0.1), true)) }); };
  return h('div', { class: 'vb-range', id: 'vb-range', hidden: !g, style: g ? { left: g.a * Z + 'px', width: (g.b - g.a) * Z + 'px' } : {} },
    h('span', { class: 'rh l', title: 'Drag to move the start of the selection', onpointerdown: grab('l') }), h('span', { class: 'rh r', title: 'Drag to move the end of the selection', onpointerdown: grab('r') }));
}
function markIn() { const r = rowAt(B.t); if (!r) return toast('Move the playhead onto a scene first.'); const g = B.range; setRange(B.t, g && g.id === r.scene.id && g.b > B.t + 0.1 ? g.b : r.start + r.seconds, true); }
function markOut() { const r = rowAt(B.t - 0.002) || rowAt(B.t); if (!r) return toast('Move the playhead onto a scene first.'); const g = B.range; setRange(g && g.id === r.scene.id && g.a < B.t - 0.1 ? g.a : r.start, B.t, true); }
function drawRangeBar() {
  const box = $('#vb-rbar'); if (!box || !B) return;
  const g = B.range && B.range.b - B.range.a >= 0.05 ? B.range : null;
  const btn = (id, ic, label, title, fn, cls = '') => h('button', { class: 'btn sm ' + cls, id, title, onclick: fn }, ic && icon(ic), label);
  const item = (id, ic, label, fn, off) => h('button', { id, disabled: !!off, onclick: () => { closePop(); fn(); } }, icon(ic), label);
  const quiet = (p) => p.catch(errToast);
  fill(box,
    btn('vb-in', '', '[ Start', 'Start the selection at the playhead (I). You can also hold Shift and drag on the time ruler.', markIn, 'ghost'),
    btn('vb-out', '', 'End ]', 'End the selection at the playhead (O)', markOut, 'ghost'),
    g ? [h('span', { class: 'vb-rpill', id: 'vb-rpill', title: 'A part of a scene is selected. Retake makes it again with AI, B-roll puts a new clip over it. The rest of the video stays as it is.' }, '✂', h('span', { class: 'more' }, ' Edit Selected Part'), h('span', { class: 'more2' }, ' (Retake / B-roll)')), h('span', { class: 'vb-rlab', id: 'vb-rlab' }, `${fmtT(g.a)} to ${fmtT(g.b)} · ${r2(g.b - g.a)} s`)] : h('small', { class: 'vb-hint', id: 'vb-rhint' }, 'Select a part of a scene to change only that part: press Start and End at the playhead, or hold Shift and drag on the time ruler.'),
    g && btn('vb-retake', 'sparkle', 'Retake', 'Make this part again with AI. The rest of the video stays as it is.', () => rangeAi('retake')),
    g && btn('vb-change', 'wand', 'Change it', INFO.canSendVideo ? 'Send this part to a model that changes existing video' : 'Works once the app runs at a public address. Until then, use Retake.', () => rangeAi('change')),
    g && btn('vb-fill', 'film', 'B-roll', 'Put a new AI clip over this part, made from a description', () => rangeAi('fill')),
    btn('vb-extend', 'plus', 'Extend here', 'Add a new AI scene that continues from the picture at ' + (g ? 'the end of the selection' : 'the playhead'), () => rangeAi('extend')),
    h('button', { class: 'btn sm', id: 'vb-rmore', title: 'More actions', onclick: (e) => popover(e.currentTarget, h('div', { class: 'menu' },
      item('vb-rdel', 'trash', 'Delete this part', () => quiet(rangeAct('delete', {}, 'That part was removed. Press Undo to bring it back.')), !g),
      item('vb-rmute', 'audio', 'Mute this part', () => quiet(rangeAct('mute', {}, 'That part is silent now.')), !g),
      item('vb-rfreeze', 'image', 'Freeze frame at the playhead', () => quiet(rangeAct('freeze', { seconds: 2 }, 'A 2 second still was added. Drag its edge to change how long it stays.'))),
      item('vb-rsplit', 'cut', 'Split at the playhead', splitAtPlayhead),
      item('vb-rcard', 'type', 'Add an end card', endCard))) }, icon('dots'), 'More'),
    h('div', { class: 'grow' }),
    btn('vb-transcript', 'type', g ? '' : 'Transcript', 'Transcript: pick a part of the video by its words', (e) => openTranscript(e.currentTarget)),
    btn('vb-history', 'list', g ? '' : 'History', 'History: every change in this session. Click one to go back to it.', (e) => openHistory(e.currentTarget)),
    g && h('button', { class: 'icon-btn sm', id: 'vb-rclear', title: 'Clear the selection (Esc)', onclick: () => { B.range = null; drawRange(); } }, icon('x')));
}
// One action on the selected part (or at the playhead). The server answers with the whole project.
async function rangeAct(action, extra = {}, msg) {
  const g = B.range; const point = ['freeze', 'extend', 'split'].includes(action); let sceneId, from, to;
  if (action !== 'card' && !point) { if (!g) { toast('Select a part of the video first.'); return false; } sceneId = g.id; from = g.a; to = g.b; }
  else if (point) {
    const t = action === 'extend' && g ? g.b : B.t; const r = (action === 'extend' && g ? rowOf(g.id) : null) || lay().rows.find((x) => t >= x.start - 0.001 && t <= x.start + x.seconds + 0.001);
    if (!r) { toast('Move the playhead onto a scene first.'); return false; } sceneId = r.scene.id; from = to = t;
  }
  pause(); await flush();
  const snap = JSON.stringify(docOf(B.p));
  const r = await call('POST', `/api/builder/projects/${B.id}/range`, { rev: B.p.rev, action, sceneId, from, to, idem: newId(), ...extra });
  if (!B) return false;
  if (!r.ok) { if (r.status === 409 && r.data.project) adopt(r.data, false); throw fail(r); }
  B.undo.push(snap); if (B.undo.length > 80) B.undo.shift(); B.redo = []; B.lastKey = '';
  B.range = null; adopt(r.data, false);
  if (r.data.sceneId && scene(r.data.sceneId)) { B.sel = r.data.sceneId; B.cap = null; }
  if (r.data.credits != null) setCredits(r.data.credits);
  draw('all'); if (r.data.started) schedulePoll(800); if (msg) toast(msg);
  return true;
}
const AI_TEXT = {
  retake: ['Retake this part', 'Makes this part again from your description. It starts from the picture at the start of the selection, so it joins on to what comes before.', 'Retake', 'This part is being made again. You can keep working.'],
  change: ['Change this part', 'Sends this part of the video to a model that changes existing video. Say what should be different.', 'Change it', 'This part is being changed. You can keep working.'],
  fill: ['B-roll for this part', 'Puts a new clip, made from your description, over this part. Nothing of the old picture is used.', 'Make B-roll', 'The B-roll is being made. You can keep working.'],
  extend: ['Extend from here', 'Adds a new scene after this moment. It starts from the picture at this moment and continues from there.', 'Extend', 'The new scene is being made. You can keep working.'],
};
function rangeAi(kind) {
  const g = B.range; const point = kind === 'extend';
  if (!point && !g) return toast('Select a part of the video first.');
  if (kind === 'change' && !INFO.canSendVideo) return toast('"Change it" sends this part of your video to the video service, which has to download it. That works once the app runs at a public address. Until then, use Retake.');
  const row = g ? rowOf(g.id) : rowAt(B.t); const s = row?.scene; if (!s) return toast('Move the playhead onto a scene first.');
  if (s.locked) return toast('This scene is locked. Unlock it first.', 'error');
  const len = g ? r2((g.b - g.a) * (row.speed || 1)) : 0; const T = AI_TEXT[kind];
  const list = kind === 'change' ? editModels() : videoModels(); if (!list.length) return toast('No video model for this is available right now.', 'error');
  const fits = (m) => m.video.resolutions.includes(B.p.resolution);
  const st = { modelId: (kind !== 'change' && list.find((m) => m.id === (s.modelId || B.p.modelId))?.id) || list.find(fits)?.id || list[0].id, seconds: 5 };
  const ta = h('textarea', { rows: 3, maxlength: 4000, id: 'vb-rprompt', placeholder: kind === 'change' ? 'For example: make it snow, keep everything else' : 'For example: she turns to the camera and smiles, warm evening light' }, kind === 'retake' && s.type === 'ai' ? s.prompt || '' : '');
  const note = h('small', { class: 'vb-hint', id: 'vb-rnote' }); const go = h('button', { class: 'btn primary', id: 'vb-rgo' });
  const price = () => {
    const m = list.find((x) => x.id === st.modelId); const want = point ? st.seconds : Math.max(1, len); const made = allowedDuration(m, want);
    const c = kind === 'change' ? editCredits(m, B.p.resolution, want) : sceneCredits(m, B.p.resolution, want); const tooLong = !point && made != null && made < len - 0.05;
    note.textContent = tooLong ? `${m.name} makes clips of up to ${made} s and this part is ${len} s long. Select a shorter part, or pick another model.`
      : !fits(m) ? `${m.name} cannot make ${B.p.resolution} videos. Pick another model.`
      : !point && made != null && made > len + 0.05 ? `${m.name} makes a ${made} s clip, and that is what you pay for. The first ${len} s are used, so the video keeps its length.`
      : point ? 'The new scene is added after this moment. The video gets longer by its length.' : 'The video keeps its length. The footage you have now stays as version 1, so you can compare and go back.';
    go.disabled = tooLong || !fits(m); fill(go, icon('sparkle'), `${T[2]} · ≈ ${fmtCredits(c)} credits`);
  };
  const d = dialog({ title: T[0], sub: g && !point ? `${fmtT(g.a)} to ${fmtT(g.b)} · ${r2(g.b - g.a)} s` : `At ${fmtT(g ? g.b : B.t)}`, body: [
    h('p', { class: 'vb-hint' }, T[1]), field('What should happen', ta),
    field('AI model', sel(st.modelId, list.map((m) => [m.id, m.name]), (v) => { st.modelId = v; price(); }, { id: 'vb-rmodel' })),
    point ? field('Length of the new scene', slider(st.seconds, { min: 4, max: 15, step: 1, id: 'vb-rsec', fmt: (v) => `${v} s`, on: (v) => { st.seconds = v; price(); } })) : null,
    note, h('small', { class: 'vb-hint' }, 'You are charged only when it succeeds. If it fails, the credits come back automatically.')].filter(Boolean),
  foot: [h('button', { class: 'btn ghost', onclick: () => d.remove() }, 'Cancel'), go] });
  go.onclick = async () => {
    const prompt = ta.value.trim(); if (prompt.length < 3) { ta.focus(); return toast('Describe it in a few words first.', 'error'); }
    go.disabled = true; fill(go, h('span', { class: 'spin' }), 'Starting…');
    try { if (await rangeAct(kind, { prompt, modelId: st.modelId, seconds: st.seconds }, T[3])) d.remove(); else price(); } catch (e) { errToast(e); if (e.status === 409) d.remove(); else price(); }
  };
  price();
}
function endCard() {
  const ta = h('textarea', { rows: 2, maxlength: 200, id: 'vb-card-text', placeholder: 'For example: Thanks for watching' }); const st = { seconds: 3 };
  const d = dialog({ title: 'End card', sub: 'A dark closing picture with your words in the middle, added as the last scene.', body: [field('Words on the card', ta), field('Shown for', slider(3, { min: 1, max: 10, step: 0.5, id: 'vb-card-sec', fmt: (v) => `${v} s`, on: (v) => { st.seconds = v; } }))],
    foot: [h('button', { class: 'btn ghost', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', id: 'vb-card-ok', onclick: async () => { const t = ta.value.trim(); if (!t) return ta.focus(); try { await rangeAct('card', { text: t, seconds: st.seconds }, 'The end card was added as the last scene.'); d.remove(); } catch (e) { errToast(e); } } }, 'Add the end card')] });
}
function pickCharacter(anchor, s) {
  popover(anchor, h('div', { class: 'menu vb-pop' }, S.characters.map((c) => h('button', { 'data-char': c.id, onclick: () => {
    closePop(); const fid = c.sheetId || c.photos?.[0]?.id; if (!fid) return toast(`${c.name} has no picture yet. Add one on the Characters page.`, 'error');
    B.files.set(fid, B.files.get(fid) || { id: fid, kind: 'image', url: `/api/files/${fid}/raw`, name: c.name });
    edit(() => { s.refFileId = fid; s.continuity = false; }); toast(`This scene will start from the picture of ${c.name}.`);
  } }, icon('face'), c.name))));
}
// The words of the video, sentence by sentence. Clicking a sentence selects its time.
function openTranscript(anchor) {
  const caps = (B.p.captions || []).filter((c) => !c.pos);
  popover(anchor, h('div', { class: 'menu vb-pop', id: 'vb-tlist' }, h('b', { class: 'vb-mh' }, 'Transcript'),
    caps.length ? caps.map((c) => h('button', { onclick: () => { closePop(); pause(); seek(c.start); setRange(c.start, c.end); } }, h('small', {}, fmtT(c.start)), h('span', {}, c.text)))
      : h('p', { class: 'vb-hint' }, 'There are no captions yet. Add captions on the Captions track' + (INFO.audioFirst ? ', or press "Plan" on the Voice track to get them from your voice-over.' : '.') + ' Each sentence can then be picked here.')));
}
// History: every state of this session, newest first. Built from the same list Undo and Redo use.
const FIELD = { prompt: 'description', duration: 'length', trimIn: 'trim', trimOut: 'trim', speed: 'speed', reverse: 'direction', volume: 'sound', transition: 'change to the next scene', cur: 'version', locked: 'lock', fit: 'fit to the shape', narration: 'narration note', modelId: 'AI model', refFileId: 'start picture', continuity: 'continue from the scene before', fileId: 'file' };
function describe(a, b) {
  const ia = a.scenes.map((s) => s.id), ib = b.scenes.map((s) => s.id);
  if (ia.join() !== ib.join()) {
    const gone = ia.filter((x) => !ib.includes(x)).length, come = ib.filter((x) => !ia.includes(x)).length;
    return !gone && !come ? 'Moved a scene' : gone && come ? 'Changed a part of a scene' : come ? (come === 1 ? 'Added a scene' : 'Added scenes') : gone === 1 ? 'Removed a scene' : 'Removed scenes';
  }
  for (let i = 0; i < a.scenes.length; i++) { const x = a.scenes[i], y = b.scenes[i]; const k = Object.keys({ ...x, ...y }).find((key) => FIELD[key] && JSON.stringify(x[key] ?? null) !== JSON.stringify(y[key] ?? null)); if (k) return `Scene ${i + 1}: ${FIELD[k]}`; }
  for (const [k, l] of [['captions', 'Captions and text'], ['voice', 'Voice-over'], ['music', 'Music'], ['title', 'Name of the video'], ['ratio', 'Shape'], ['resolution', 'Quality'], ['modelId', 'AI model'], ['captionStyle', 'Caption look']]) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return l;
  return 'Small change';
}
function openHistory(anchor) {
  const states = [...B.undo, JSON.stringify(docOf(B.p)), ...[...B.redo].reverse()].map((x) => JSON.parse(x)); const at = B.undo.length;
  const go = (i) => { closePop(); for (let n = at; n > i; n--) undo(); for (let n = at; n < i; n++) redo(); };
  const rows = []; for (let i = states.length - 1; i >= 0; i--) rows.push(h('button', { class: i === at ? 'on' : i > at ? 'dim' : '', 'data-h': i, onclick: () => go(i) }, h('small', {}, i === at ? 'Now' : i > at ? 'Undone' : String(i)), h('span', {}, i === 0 ? 'When you opened this video' : describe(states[i - 1], states[i]))));
  popover(anchor, h('div', { class: 'menu vb-pop', id: 'vb-hist' }, h('b', { class: 'vb-mh' }, 'History'), rows, states.length === 1 && h('p', { class: 'vb-hint' }, 'Nothing has changed yet in this session.')));
}
// Two versions of one scene side by side, playing the same stretch of time together.
function compareVersions(s) {
  const vs = s.versions; const cur = s.cur ?? vs.length - 1; const st = { a: cur > 0 ? cur - 1 : 1, b: cur };
  const win = (v) => { const f = B.files.get(v.fileId); const d = f?.duration || 0; const tin = v.tin != null ? Number(v.tin) || 0 : Number(s.trimIn) || 0; const tout = v.tin != null ? (Number(v.tout) || d) : (Number(s.trimOut) || d); return { f, tin, tout: d ? Math.min(tout, d) : tout }; };
  const name = (v, i) => `Version ${i + 1}${v.original ? ' (original)' : ''}`;
  const side = (k) => {
    const vid = h('video', { playsinline: true, preload: 'auto', muted: k === 'a', id: 'vb-ab-' + k }); vid.muted = k === 'a';
    const load = () => { const w = win(vs[st[k]]); vid.src = w.f?.play || w.f?.url || ''; vid.dataset.tin = w.tin; vid.dataset.tout = w.tout; vid.addEventListener('loadedmetadata', () => { try { vid.currentTime = w.tin; } catch { /* later */ } }, { once: true }); use.textContent = st[k] === (s.cur ?? 0) ? 'In use now' : 'Use this version'; use.disabled = st[k] === (s.cur ?? 0); };
    const pick = h('select', { class: 'vb-select', id: 'vb-ab-pick-' + k, onchange: (e) => { st[k] = Number(e.target.value); stop(); load(); } }, vs.map((v, i) => h('option', { value: i }, name(v, i)))); pick.value = String(st[k]);
    const use = h('button', { class: 'btn sm', id: 'vb-ab-use-' + k, onclick: () => { const i = st[k]; d.remove(); edit(() => { s.cur = i; }); toast(`${name(vs[i], i)} is used now.`); } });
    return { vid, load, box: h('div', { class: 'vb-ab-side' }, vid, h('div', { class: 'row-gap' }, pick, use)) };
  };
  let raf = 0; const stop = () => { cancelAnimationFrame(raf); A.vid.pause(); Bv.vid.pause(); fill(playBtn, icon('play'), 'Play both'); };
  const A = side('a'), Bv = side('b');
  const playBtn = h('button', { class: 'btn primary', id: 'vb-ab-play', onclick: () => {
    if (!A.vid.paused || !Bv.vid.paused) return stop();
    for (const x of [A.vid, Bv.vid]) { try { x.currentTime = Number(x.dataset.tin) || 0; } catch { /* not loaded */ } x.play().catch(() => {}); }
    fill(playBtn, icon('stop'), 'Stop');
    const tick = () => { if (!document.body.contains(A.vid)) return; if ([A.vid, Bv.vid].every((x) => x.ended || x.currentTime >= Number(x.dataset.tout) - 0.03)) return stop(); for (const x of [A.vid, Bv.vid]) if (x.currentTime >= Number(x.dataset.tout) - 0.03 && !x.paused) x.pause(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  } }, icon('play'), 'Play both');
  const d = dialog({ title: 'Compare versions', sub: `Scene ${B.p.scenes.indexOf(s) + 1}. The sound comes from the right side.`, wide: true, body: h('div', { class: 'vb-ab', id: 'vb-ab' }, A.box, Bv.box), foot: [h('button', { class: 'btn ghost', onclick: () => d.remove() }, 'Close'), playBtn] });
  A.load(); Bv.load();
}

function onKey(e) {
  if (!B || typing(e) || $('.modal-bg') || $('.popover')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod || e.altKey) return;
  if (e.key === ' ') { e.preventDefault(); B.playing ? pause() : play(); }
  else if (e.key.toLowerCase() === 's') { e.preventDefault(); splitAtPlayhead(); }
  else if (PE() && e.key.toLowerCase() === 'i') { e.preventDefault(); markIn(); }
  else if (PE() && e.key.toLowerCase() === 'o') { e.preventDefault(); markOut(); }
  else if (PE() && e.key === 'Escape' && B.range) { B.range = null; drawRange(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (B.cap != null && B.p.captions[B.cap]) { edit((p) => { p.captions.splice(B.cap, 1); }); B.cap = null; drawTimeline(); } else deleteScene(scene()); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); seek(B.t - (e.shiftKey ? 1 : 1 / 30)); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); pause(); seek(B.t + (e.shiftKey ? 1 : 1 / 30)); }
}
window.addEventListener('beforeunload', () => { if (B?.dirty) saveNow(true); });

// ---------- admin: music library ----------
async function renderMusicAdmin() {
  if (!S.user.isAdmin || !INFO.musicLibrary) { location.hash = '#/builder'; return; }
  const list = h('div', { class: 'vb-tracks-list' });
  const f = { file: null, title: h('input', { type: 'text', id: 'ma-title', maxlength: 120 }), genre: h('input', { type: 'text', id: 'ma-genre', maxlength: 40 }), bpm: h('input', { type: 'number', id: 'ma-bpm', min: 0, max: 300 }), licence: h('input', { type: 'text', id: 'ma-licence', maxlength: 300, placeholder: 'Where the track comes from and what it allows' }) };
  const mood = sel(INFO.moods[0], INFO.moods.map((m) => [m, m]), () => {}, { id: 'ma-mood' });
  const fileBtn = h('button', { class: 'btn', id: 'ma-file', onclick: () => pickFiles('audio/*,.mp3,.wav,.m4a', false, (files) => { f.file = files[0]; fileBtn.replaceChildren(icon('audio'), f.file.name); if (!f.title.value) f.title.value = f.file.name.replace(/\.[^.]+$/, ''); }) }, icon('upload'), 'Choose a sound file');
  const load = async () => {
    const { tracks } = await api('/api/builder/music');
    list.replaceChildren(...(tracks.length ? tracks.map((t) => h('div', { class: 'vb-trk', 'data-track': t.id },
      h('audio', { controls: true, preload: 'none', src: t.audio }),
      h('div', { class: 'grow' }, h('b', {}, t.title), h('small', {}, [t.mood, t.genre, fmtLen(t.duration), t.bpm ? `${t.bpm} BPM` : null].filter(Boolean).join(' · ')), h('small', { class: 'lic' }, t.licence)),
      h('button', { class: 'icon-btn', title: 'Delete this track', onclick: async () => { let r = await call('DELETE', '/api/admin/music/' + t.id); if (r.status === 409) { confirmBox('Delete this track?', r.data.error, 'Delete', async () => { await api(`/api/admin/music/${t.id}?force=1`, { method: 'DELETE' }); load(); }); return; } if (!r.ok) return errToast(fail(r)); load(); } }, icon('trash')))) : [h('div', { class: 'empty' }, 'No tracks yet.')]));
  };
  const add = async (btn) => {
    if (!f.file) return toast('Choose a sound file first.', 'error');
    btn.disabled = true; const fd = new FormData(); fd.append('file', f.file); fd.append('title', f.title.value); fd.append('mood', mood.value); fd.append('genre', f.genre.value); fd.append('bpm', f.bpm.value); fd.append('licence', f.licence.value);
    try { await api('/api/admin/music', { method: 'POST', body: fd }); toast('Track added.'); f.file = null; fileBtn.replaceChildren(icon('upload'), 'Choose a sound file'); f.title.value = f.genre.value = f.bpm.value = f.licence.value = ''; await load(); } catch (e) { errToast(e); } finally { btn.disabled = false; }
  };
  $('#main').replaceChildren(topbar([h('a', { class: 'icon-btn', href: '#/builder', title: 'Back' }, icon('back'))]), h('div', { class: 'scroll' }, h('div', { class: 'page' },
    h('h1', {}, 'Music library'), h('p', { class: 'sub' }, 'Tracks everyone can use in the Video Builder. Each track needs its licence written down.'),
    h('div', { class: 'vb-madd' }, fileBtn, field('Title', f.title), field('Mood', mood), field('Genre', f.genre), field('BPM', f.bpm), field('Licence', f.licence), h('button', { class: 'btn primary', id: 'ma-add', onclick: (e) => add(e.currentTarget) }, icon('plus'), 'Add track')),
    h('h2', {}, 'Tracks'), list)));
  load().catch(errToast);
}
