// Video (new): the shorter, chip-based video section, built beside the old Video Studio, Agent, Builder and Studio Pro
// (which stay exactly as they are). One start box with every feature as a one-tap chip, three ways in (with the agent,
// a quick clip, or build it myself), and one video seen as a plan, a live preview while it is made, the finished video
// in every size, and one scene at a time. It reuses the existing routes: the Agent storyboard, Builder projects, scene
// jobs, preview pictures, export, crop for social, Video Studio generations, characters, AI voice and the music library.
import { micButton } from './voice.js';
import { h, pageCss, $, $$, icon, S, store, api, toast, errToast, info, topbar, fmtCredits, setCredits, popover, closePop, pickFiles, dialog, openCrop, downloadFiles, loadVoices, playSample, voiceList, refreshRecents } from './app.js';

await pageCss('vn-css', '/vnew.css');

// ---------- what the chips can be ----------
const LOOKS = [['auto', 'Auto'], ['clean', 'Clean'], ['warm', 'Warm film'], ['cool', 'Cool'], ['grain', 'Grain'], ['vivid', 'Vivid'], ['mono', 'Black and white'], ['vintage', 'Vintage']];
const CAMERAS = [['auto', 'Auto', ''], ['handheld', 'Handheld', 'Handheld camera with gentle natural shake.'], ['pushin', 'Push in', 'The camera slowly pushes in.'], ['orbit', 'Orbit', 'The camera orbits slowly around the subject.'], ['tracking', 'Tracking', 'The camera tracks alongside the subject.'], ['static', 'Still', 'Locked-off still camera.'], ['drone', 'Drone', 'Aerial drone shot moving forward.'], ['zoom', 'Slow zoom', 'Slow cinematic zoom.'], ['dolly', 'Dolly out', 'The camera pulls back to reveal the scene.']];
const BETWEEN = [['auto', 'Auto'], ['cut', 'Cut'], ['crossfade', 'Fade'], ['black', 'Dip to black']];
const SIZES = [['9x16', '9:16', 'Reels, TikTok, Shorts', '9:16'], ['1x1', '1:1', 'Square feed', '1:1'], ['16x9', '16:9', 'YouTube, screens', '16:9'], ['4x5', '4:5', 'Tall feed post', null], ['2x3', '2:3', 'Pinterest', null]];
const RATIO_OF = { '9x16': '9:16', '1x1': '1:1', '16x9': '16:9' };
const SHAPE_OF = { '9:16': '9x16', '1:1': '1x1', '16:9': '16x9', '4:3': '16x9', '3:4': '4x5', '21:9': '16x9' };
const PRESET_OF = { '9x16': 'tiktok', '1x1': 'ig-square', '16x9': 'youtube', '4x5': 'ig-portrait', '2x3': 'pinterest' };
const DRAWER = [['skill', 'Skill'], ['model', 'Model'], ['character', 'Character'], ['voice', 'Voice'], ['music', 'Music'], ['effects', 'Effects'], ['more', 'More']];
const DEFAULTS = { skill: 'auto', model: 'auto', chars: [], voice: { kind: 'auto' }, music: { kind: 'auto' }, look: 'auto', camera: 'auto', between: 'auto', sizes: ['9x16'], seconds: 30, captions: true, brand: null, quality: '720p', language: 'English', chain: true, previews: true, autoMake: false, captionStyle: 'bold' };
const fmtLen = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const idem = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const f = () => S.config.flags || {};
const paid = () => !!S.user?.paidPlan || S.user?.isAdmin || S.user?.paidPlan === undefined;

// ---------- shared data, fetched once per visit ----------
let D = null;
async function data(force) {
  if (D && !force) return D;
  const pick = (p, x) => p.then((r) => r, () => x);
  const [agent, builder, music, chars, voices, brands] = await Promise.all([
    pick(api('/api/agent/info'), null), pick(api('/api/builder/info'), {}),
    f().musicLibrary ? pick(api('/api/builder/music'), { tracks: [], moods: [] }) : Promise.resolve({ tracks: [], moods: [] }),
    pick(api('/api/characters'), { characters: [] }), pick(loadVoices(), null),
    f().studioPro ? pick(api('/api/pro/brands'), { brands: [] }) : Promise.resolve({ brands: [] }),
  ]);
  D = { agent, builder, tracks: music.tracks || [], moods: music.moods || [], chars: chars.characters || [], voices: voices?.on ? voices : null, brands: brands.brands || [] };
  return D;
}
const videoModels = () => (S.models || []).filter((m) => m.type === 'video' && !m.hidden);
const createModels = () => videoModels().filter((m) => (m.video?.textToVideo || m.video?.imageToVideo) && !m.video?.avatar);
const avatarModel = () => videoModels().find((m) => m.video?.avatar) || null;
const best = () => createModels().find((m) => /seedance-2-5(?!-vision)|seedance-2\.5(?!.*vision)/i.test(m.id) && m.video?.imageToVideo) || null;
const visionModel = () => createModels().find((m) => /vision/i.test(m.id) && m.video?.videoToVideo) || createModels().find((m) => m.video?.videoToVideo) || null;
const modelById = (id) => videoModels().find((m) => m.id === id) || null;
const perSec = (m, res) => (m ? m.price?.creditsPerSecond?.[res] ?? Object.values(m.price?.creditsPerSecond || {})[0] ?? 0 : 0);
const allowed = (m, s) => { const ds = (m?.video?.durations || []).filter((d) => d > 0).sort((a, b) => a - b); return ds.find((d) => d >= s - 0.001) ?? ds[ds.length - 1] ?? s; };
const sceneCost = (m, res, s) => Math.round(perSec(m, res) * allowed(m, s) * 100) / 100;

// ---------- the settings the chips stand for ----------
let SET = null;
const loadSet = () => { SET = { ...DEFAULTS, ...store.get('vn-set', {}) }; if (!Array.isArray(SET.sizes) || !SET.sizes.length) SET.sizes = ['9x16']; return SET; };
const keepSet = () => { if (SET.remember !== false) store.set('vn-set', SET); };
// Auto guesses from the words, the way the agent would.
function guessSkill(prompt) {
  const t = String(prompt).toLowerCase();
  if (/talks? to (the )?camera|ugc|creator|testimonial|review/.test(t)) return 'ugc';
  if (/\bad\b|advert|product|launch|promo|sale|shop|brand/.test(t)) return 'product';
  if (/music video|song|lyrics|beat/.test(t)) return 'music';
  if (/explain|how to|tutorial|lesson|course|steps/.test(t)) return 'explainer';
  if (/story|drama|episode|film|tale|kids/.test(t)) return 'story';
  return 'general';
}
const skillLabel = (id) => (id === 'auto' ? 'Auto' : D?.agent?.tabs?.find((t) => t.id === id)?.label || id);
const charNames = () => (SET.chars || []).map((cid) => D?.chars.find((c) => c.id === cid)?.name).filter(Boolean);
function voiceLabel() {
  const v = SET.voice || {};
  if (v.kind === 'none') return 'No voice';
  if (v.kind === 'file') return v.name || 'My recording';
  if (v.kind === 'ai') return D?.voices?.voices?.find((x) => x.id === v.voiceId)?.name || 'AI voice';
  return 'Auto';
}
function musicLabel() {
  const m = SET.music || {};
  if (m.kind === 'none') return 'None';
  if (m.kind === 'track') return D?.tracks.find((t) => t.id === m.trackId)?.title || 'Track';
  if (m.kind === 'file') return m.name || 'My track';
  return 'Auto';
}
const effectsLabel = () => { const l = LOOKS.find((x) => x[0] === SET.look)?.[1]; const c = CAMERAS.find((x) => x[0] === SET.camera)?.[1]; return SET.look === 'auto' && SET.camera === 'auto' ? 'Auto' : [c !== 'Auto' && c, l !== 'Auto' && l].filter(Boolean).join(', '); };
const sizesLabel = () => SET.sizes.map((s) => SIZES.find((x) => x[0] === s)?.[1]).join(', ');
const brandLabel = () => (SET.brand ? SET.brand.name || 'My logo' : 'None');
const modelLabel = () => (SET.model === 'auto' ? 'Auto' : modelById(SET.model)?.name || 'Auto');
const chipList = () => [
  ['skill', 'Skill', skillLabel(SET.skill)], ['model', 'Model', modelLabel()], ['character', 'Character', charNames().join(', ') || 'None'],
  ['voice', 'Voice', voiceLabel()], ['music', 'Music', musicLabel()], ['effects', 'Effects', effectsLabel()],
  ['more', 'Sizes', sizesLabel()], ['more', 'Length', fmtLen(SET.seconds)], ['more', 'Captions', SET.captions ? 'On' : 'Off'], ['more', 'Brand', brandLabel()], ['more', 'Quality', SET.quality]];

// ======================================================================
// Page entry: #/vnew, #/vnew/<tab>, #/vnew/v/<projectId>[/s/<sceneId>]
// ======================================================================
let POLL = null;
export async function renderVnew(a = '', b = '', c = '', d = '') {
  clearTimeout(POLL); loadSet();
  if (!f().videoNew || !f().videoBuilder) { $('#main').replaceChildren(topbar(), h('div', { class: 'page' }, h('h1', {}, 'Video (new)'), h('p', {}, 'This section is switched off.'))); return; }
  try { await data(a === '' && !D); } catch { /* each part has its own fallback */ }
  if (a === 'v' && b) return renderProject(b, c === 's' ? d : '');
  const tab = ['videos', 'characters', 'voices', 'music', 'skills'].includes(a) ? a : 'create';
  const body = h('div', { class: 'vn-body' });
  $('#main').replaceChildren(topbar([h('span', { class: 'vn-title' }, 'Video', h('span', { class: 'tag new' }, 'New'))]), shellTabs(tab), h('div', { class: 'scroll vn-scroll' }, body));
  if (tab === 'create') return drawCreate(body, a === 'quick' ? 'quick' : a === 'build' ? 'build' : store.get('vn-mode', 'agent'));
  if (tab === 'videos') return drawVideos(body);
  if (tab === 'characters') return drawCharacters(body);
  if (tab === 'voices') return drawVoices(body);
  if (tab === 'music') return drawMusic(body);
  return drawSkills(body);
}
function shellTabs(on) {
  return h('nav', { class: 'vn-tabs', 'aria-label': 'Video sections' }, [['create', 'Create', '#/vnew'], ['videos', 'My videos', '#/vnew/videos'], ['characters', 'Characters', '#/vnew/characters'], ['voices', 'Voices', '#/vnew/voices'], ['music', 'Music', '#/vnew/music'], ['skills', 'Skills and effects', '#/vnew/skills']]
    .map(([id, label, href]) => h('a', { href, class: 'vn-tab' + (on === id ? ' on' : ''), 'data-vtab': id }, label)));
}
const paidNote = () => h('div', { class: 'vn-paid' }, icon('lock'), h('span', {}, 'The Video Agent and Build it myself use paid credits (a monthly plan or a top-up pack). Quick clip works with free credits.'), h('a', { class: 'btn sm primary', href: '#/billing' }, 'See plans'));

// ======================================================================
// Create: one box, three ways in
// ======================================================================
function drawCreate(body, mode) {
  const modes = h('div', { class: 'vn-modes seg', role: 'tablist' }, [['agent', 'With the Video Agent'], ['quick', 'Quick clip, no agent'], ['build', 'Build it myself']].map(([id, label]) => h('button', { class: mode === id ? 'on' : '', role: 'tab', 'aria-selected': String(mode === id), 'data-mode': id, onclick: () => { store.set('vn-mode', id); drawCreate(body, id); } }, label)));
  const inner = mode === 'quick' ? quickBox() : mode === 'build' ? buildBox() : agentBox();
  body.replaceChildren(h('div', { class: 'vn-create' }, h('h1', { class: 'vn-h1' }, 'What do you want to make?'), modes, inner));
}

// ---------- the agent box (J1) ----------
function agentBox() {
  const A = D.agent;
  if (!A) return h('div', { class: 'vn-empty' }, 'The Video Agent is switched off on this server. Use Quick clip or Build it myself.');
  const ta = h('textarea', { id: 'vn-prompt', class: 'vn-ta', maxlength: 2000, rows: 2, placeholder: 'Describe your video in a sentence. For example: a 30 second ad for my face cream, a young woman talks to the camera in warm morning light.' }, store.get('vn-draft', ''));
  ta.addEventListener('input', () => { store.set('vn-draft', ta.value); grow(ta); });
  const files = { image: null, end: null, logo: null, video: null, voice: null, music: null, script: null }; let link = '';
  const chipsEl = h('div', { class: 'vn-chips', id: 'vn-chips' }); const filesEl = h('div', { class: 'vn-files' });
  const go = h('button', { class: 'btn primary vn-go', id: 'vn-create' }, icon('sparkle'), 'Create');
  const drawChips = () => chipsEl.replaceChildren(...chipList().map(([dr, k, v]) => h('button', { class: 'vn-chip', 'data-chip': k.toLowerCase(), onclick: () => openDrawer(dr, drawChips) }, h('span', {}, k + ': '), h('b', {}, v))));
  const ROLE = { image: ['image', 'Start picture', 'image/*'], end: ['image', 'End picture', 'image/*'], logo: ['star', 'Logo', 'image/*'], video: ['video', 'Video to study', 'video/*,.mp4,.mov,.webm'], voice: ['mic', 'Voice clip', 'audio/*,.mp3,.wav,.m4a'], music: ['audio', 'Song', 'audio/*,.mp3,.wav,.m4a'] };
  const drawFiles = () => filesEl.replaceChildren(...[...Object.entries(files).filter(([k, x]) => x && k !== 'script').map(([k, x]) => h('span', { class: 'vn-file', 'data-file': k }, x.busy ? h('span', { class: 'spin' }) : icon(ROLE[k][0]), `${ROLE[k][1]}: ${x.name}`, h('button', { class: 'icon-btn sm', title: 'Remove', onclick: () => { files[k] = null; drawFiles(); } }, icon('x')))),
    files.script && h('span', { class: 'vn-file', 'data-file': 'script' }, icon('doc'), 'My own script', h('button', { class: 'icon-btn sm', title: 'Remove', onclick: () => { files.script = null; drawFiles(); } }, icon('x'))),
    link && h('span', { class: 'vn-file' }, icon('link'), link.slice(0, 40), h('button', { class: 'icon-btn sm', title: 'Remove', onclick: () => { link = ''; drawFiles(); } }, icon('x')))].filter(Boolean));
  const upload = (k) => pickFiles(ROLE[k][2], false, async (picked) => {
    const fd = new FormData(); fd.append('files', picked[0]); files[k] = { name: picked[0].name, busy: true }; drawFiles();
    try { const r = await api('/api/files?audio=1', { method: 'POST', body: fd }); (r.errors || []).forEach((m) => toast(m, 'error')); files[k] = r.files[0] ? { id: r.files[0].id, name: picked[0].name, duration: r.files[0].duration } : null; } catch (e) { files[k] = null; errToast(e); }
    if (k === 'voice' && files.voice) { SET.voice = { kind: 'file', fileId: files.voice.id, name: files.voice.name }; drawChips(); }
    if (k === 'logo' && files.logo) { SET.brand = { ...(SET.brand || {}), name: SET.brand?.name || 'My logo', logoFileId: files.logo.id, endCard: true }; keepSet(); drawChips(); }
    drawFiles();
  }, { title: ROLE[k][1] });
  const add = h('button', { class: 'btn sm vn-add', id: 'vn-add', onclick: (e) => popover(e.currentTarget, h('div', { class: 'menu' },
    ...Object.entries(ROLE).map(([k, [ic, label]]) => h('button', { 'data-role': k, onclick: () => { closePop(); upload(k); } }, icon(ic), label)),
    h('button', { 'data-role': 'link', onclick: () => { closePop(); askText('Add a link', 'https://… a direct video file (.mp4) for the agent to study', (u) => { if (/^https?:\/\//.test(u)) { link = u; drawFiles(); } else toast('That does not look like a link.', 'error'); }); } }, icon('link'), 'Link'),
    h('button', { 'data-role': 'script', onclick: () => { closePop(); scriptDialog(files.script || '', (t) => { files.script = t || null; drawFiles(); }); } }, icon('doc'), 'Paste my own script'))) }, icon('plus'), 'Add');
  const mic = micButton(ta);
  go.onclick = async () => {
    if (!paid()) return toast('The Video Agent uses paid credits. Pick a plan or a top-up pack first.', 'error');
    let p = ta.value.trim(); if (p.length < 3) { ta.focus(); return toast('Describe the video in a sentence first.', 'error'); }
    if (Object.values(files).some((x) => x?.busy)) return toast('A file is still uploading. One moment.');
    if (files.script) p += `\n\nUse this script, scene by scene, word for word for the narration:\n${files.script}`;
    go.disabled = true; go.replaceChildren(h('span', { class: 'spin' }), 'Writing the plan…');
    try { const pid = await createWithAgent(p, files, link); store.set('vn-draft', ''); location.hash = '#/vnew/v/' + pid; }
    catch (e) { errToast(e); go.disabled = false; go.replaceChildren(icon('sparkle'), 'Create'); }
  };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go.click(); });
  drawChips(); drawFiles(); setTimeout(() => grow(ta), 0);
  const tab = A.tabs.find((t) => t.id === (SET.skill === 'auto' ? 'general' : SET.skill)) || A.tabs[0];
  const ex = [...new Set([...(tab?.ideas || []), ...A.tabs.flatMap((t) => t.ideas || [])])].slice(0, 3);
  let all = false; const recEl = h('div', { class: 'vn-recipes' });
  const drawRec = () => recEl.replaceChildren(...[...(all ? A.templates : A.templates.slice(0, 5)).map((t, i) => h('button', { class: 'vn-recipe', 'data-tpl': t.id, onclick: () => {
    SET.skill = t.tab; SET.seconds = t.seconds; SET.sizes = [SHAPE_OF[t.ratio] || '16x9']; if (t.music && t.music !== 'none') SET.music = { kind: 'auto' }; keepSet();
    ta.value = t.prompt.replace(/\[([^\]]+)\]/g, (m) => t.fills?.[m] || m.slice(1, -1)); store.set('vn-draft', ta.value); grow(ta); drawChips(); ta.focus(); toast('Recipe loaded. Change the words, then press Create.');
  } }, h('span', { class: 'vn-thumb t' + (i % 4) }, icon('film')), h('b', {}, t.title), h('small', {}, t.blurb))),
  f().studioPro && h('a', { class: 'vn-recipe', href: '#/ads', 'data-tpl': 'ad-set' }, h('span', { class: 'vn-thumb t2' }, icon('megaphone')), h('b', {}, 'Ad set'), h('small', {}, 'Every size from one website link (Ad Studio)'))].filter(Boolean));
  drawRec();
  return h('div', { class: 'vn-wrap' }, !paid() && paidNote(),
    h('div', { class: 'vn-box' }, ta,
      h('div', { class: 'vn-row' }, h('span', { class: 'vn-lab' }, 'Already set for you. Tap any one to change it.'), h('div', { class: 'grow' }), h('button', { class: 'vn-link', id: 'vn-all', onclick: () => openDrawer('all', drawChips) }, 'See all in one list')),
      chipsEl, filesEl,
      h('div', { class: 'vn-row' }, add, h('span', { class: 'vn-hint' }, 'photo, video, voice clip, logo, link, script, or from my assets'), h('div', { class: 'grow' }), mic, go)),
    h('h2', { class: 'vn-h2' }, 'Or tap an example'), h('div', { class: 'vn-examples' }, ex.map((e) => h('button', { onclick: () => { ta.value = e; store.set('vn-draft', e); grow(ta); ta.focus(); } }, e))),
    h('div', { class: 'vn-row' }, h('h2', { class: 'vn-h2' }, 'Or start from a recipe'), h('div', { class: 'grow' }), h('button', { class: 'vn-link', id: 'vn-allrec', onclick: (e) => { all = !all; drawRec(); e.currentTarget.textContent = all ? 'Fewer' : `All ${A.templates.length} recipes`; } }, `All ${A.templates.length} recipes`)), recEl,
    h('p', { class: 'vn-foot' }, 'Writing the plan costs a few credits. Nothing else is charged until you press Make the video, and only finished scenes are charged.'));
}
function askText(title, ph, done) {
  const inp = h('input', { class: 'vn-input', placeholder: ph });
  const ok = () => { const t = inp.value.trim(); if (!t) return inp.focus(); d.remove(); done(t); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  const d = dialog({ title, body: inp, foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: ok }, 'OK')] });
  setTimeout(() => inp.focus(), 30);
}
const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = Math.min(260, ta.scrollHeight + 2) + 'px'; };
function scriptDialog(text, done) {
  const ta = h('textarea', { class: 'vn-ta big', rows: 10, placeholder: 'Paste your script. One line per scene works best.' }, text);
  const d = dialog({ title: 'Paste my own script', sub: 'The agent keeps your words and plans the pictures around them.', body: ta, foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { done(ta.value.trim()); d.remove(); } }, 'Use this script')] });
  setTimeout(() => ta.focus(), 30);
}

// The agent path: plan, then the chips are applied to it, then the voice and the preview pictures start straight away.
async function createWithAgent(prompt, files, link) {
  const A = D.agent; const skill = SET.skill === 'auto' ? guessSkill(prompt) : SET.skill; const tab = A.tabs.find((t) => t.id === skill) || A.tabs[0];
  const ratio = RATIO_OF[SET.sizes[0]] || '9:16';
  const voiceOn = SET.voice?.kind !== 'none';
  const styleId = { warm: 'cinematic', grain: 'documentary', clean: 'minimal' }[SET.look] || tab.defaults?.style || '';
  const mood = SET.music?.kind === 'auto' && skill !== 'music' ? D.moods[0] : 'none';
  const people = charList().filter((c) => c.kind === 'person');
  const model = SET.model !== 'auto' ? SET.model : people.length && best() ? best().id : undefined;
  const fileIds = Object.fromEntries(Object.entries(files).filter(([k, x]) => x?.id && k !== 'script').map(([k, x]) => [k, x.id]));
  if (SET.voice?.kind === 'file' && SET.voice.fileId && !fileIds.voice) fileIds.voice = SET.voice.fileId;
  if (SET.music?.kind === 'file' && SET.music.fileId && !fileIds.music) fileIds.music = SET.music.fileId;
  const r = await api('/api/agent/storyboard', { method: 'POST', timeoutMs: 180000, body: { prompt, tab: tab.id, ratio, seconds: SET.seconds, style: styleId, language: SET.language, voiceover: voiceOn, music: mood, chain: !!SET.chain, resolution: SET.quality, modelId: model, videoUrl: /\.(mp4|mov|webm)(\?|$)/i.test(link) ? link : '', files: fileIds } });
  (r.notes || []).forEach((n) => toast(n, 'error')); setCredits(r.balance);
  if (link && !/\.(mp4|mov|webm)(\?|$)/i.test(link)) toast('Product pages are read in Ad Studio. The plan was written from your words.');
  await applySettings(r.projectId, { skill, fresh: true });
  refreshRecents?.();
  return r.projectId;
}
const charList = () => (SET.chars || []).map((cid) => D.chars.find((c) => c.id === cid)).filter(Boolean);
const camWords = () => CAMERAS.find((c) => c[0] === SET.camera)?.[2] || '';

// Puts the chips onto a project: music, brand cards, camera words, captions, look, then voice and preview pictures.
async function applySettings(pid, { skill, fresh } = {}) {
  let v = await api('/api/builder/projects/' + pid); const p = v.project;
  const scenes = p.scenes.map((s) => ({ ...s }));
  const cam = camWords();
  if (cam) scenes.forEach((s) => { if (s.type === 'ai' && !s.versions?.length && !s.prompt.includes(cam)) s.prompt = `${s.prompt} ${cam}`; });
  if (SET.between !== 'auto') scenes.forEach((s, i) => { if (i < scenes.length - 1) s.transition = SET.between; });
  const people = charList().filter((c) => c.kind === 'person'); const b25 = best();
  if (SET.model === 'auto' && people.length && b25) scenes.forEach((s) => { if (s.type === 'ai') s.modelId = b25.id; });
  const body = { rev: p.rev, scenes, captionStyle: SET.captionStyle || 'bold', vnew: { look: SET.look, camera: SET.camera, skill, voiceId: SET.voice?.voiceId, characterIds: SET.chars, sizes: SET.sizes, captions: SET.captions, brand: SET.brand ? { ...SET.brand, endCard: SET.brand.endCard !== false } : null } };
  if (SET.music?.kind === 'track') body.music = { trackId: SET.music.trackId, volume: 0.45 };
  if (SET.music?.kind === 'none') body.music = null;
  v = await api('/api/builder/projects/' + pid, { method: 'PUT', body });
  // The logo as a closing card (and an opening sting when asked); the Agent already adds an uploaded logo at the end.
  const lid = SET.brand?.logoFileId; const hasLogo = v.project.scenes.some((s) => s.type === 'image' && s.fileId === lid);
  if (lid && fresh && SET.brand.endCard !== false && !hasLogo) { try { v = await api(`/api/builder/projects/${pid}/add`, { method: 'POST', body: { fileIds: [lid] } }); } catch (e) { toast('The logo card could not be added: ' + e.message, 'error'); } }
  if (lid && fresh && SET.brand.sting) { try { v = await api(`/api/builder/projects/${pid}/add`, { method: 'POST', body: { fileIds: [lid], at: 0 } }); const s0 = v.project.scenes[0]; if (s0?.type === 'image') { s0.duration = 1.5; s0.transition = 'crossfade'; v = await api('/api/builder/projects/' + pid, { method: 'PUT', body: { rev: v.project.rev, scenes: v.project.scenes } }); } } catch { /* the sting is a nice-to-have */ } }
  // Voice first, so its length sets each scene; pictures in parallel, so no time is lost while the plan is read.
  const jobs = [];
  const aiVoice = (SET.voice?.kind === 'ai' || (SET.voice?.kind === 'auto' && D.voices)) && D.voices && !v.project.voice;
  if (aiVoice && v.project.scenes.some((s) => s.narration)) jobs.push(api(`/api/builder/projects/${pid}/voice-from-script`, { method: 'POST', timeoutMs: 240000, body: { voiceId: SET.voice?.voiceId || D.voices.defaultVoice } }).then((r) => setCredits(r.balance), (e) => toast('The AI voice could not be made: ' + e.message, 'error')));
  else if (SET.captions && v.project.scenes.some((s) => s.narration)) jobs.push(captionsFromNarration(pid));
  if (SET.previews && fresh) jobs.push(api(`/api/builder/projects/${pid}/keyframes`, { method: 'POST', body: { idem: idem(), refFileIds: charList().flatMap((c) => c.fileIds || []).slice(0, 4) } }).then((r) => setCredits(r.credits ?? S.user.credits), (e) => { if (!/already has/.test(e.message)) toast('Preview pictures: ' + e.message, 'error'); }));
  await Promise.all(jobs);
}
async function captionsFromNarration(pid) {
  const v = await api('/api/builder/projects/' + pid); const at = new Map(v.timeline.map((t) => [t.id, t]));
  const captions = v.project.scenes.filter((s) => s.narration && at.get(s.id)).map((s) => ({ start: at.get(s.id).start, end: at.get(s.id).start + at.get(s.id).seconds, text: s.narration.replace(/^["“]|["”]$/g, '') }));
  return api('/api/builder/projects/' + pid, { method: 'PUT', body: { rev: v.project.rev, captions } });
}

// ---------- the drawer: every option, one tap from the box, the plan or a finished video ----------
function openDrawer(which, onChange) {
  $('.vn-drawer-bg')?.remove();
  const remember = h('input', { type: 'checkbox', checked: SET.remember !== false, onchange: (e) => { SET.remember = e.target.checked; } });
  const content = h('div', { class: 'vn-dcontent' });
  const strip = h('div', { class: 'vn-dtabs' });
  let cur = which;
  const changed = () => { keepSet(); onChange?.(); draw(); };
  const draw = () => {
    strip.replaceChildren(...[['all', 'All'], ...DRAWER].map(([id, label]) => h('button', { class: cur === id ? 'on' : '', 'data-dtab': id, onclick: () => { cur = id; draw(); } }, label)));
    content.replaceChildren(...(PANELS[cur] || PANELS.all)(changed, (id) => { cur = id; draw(); }));
  };
  const bg = h('div', { class: 'vn-drawer-bg', onmousedown: (e) => { if (e.target === bg) bg.remove(); } },
    h('aside', { class: 'vn-drawer', role: 'dialog', 'aria-label': 'Options' },
      h('div', { class: 'vn-dhead' }, h('b', {}, 'Options for this video'), h('button', { class: 'icon-btn', title: 'Close', onclick: () => bg.remove() }, icon('x'))),
      strip, content,
      h('div', { class: 'vn-dfoot' }, h('label', { class: 'vn-check' }, remember, 'Remember for next time'), h('div', { class: 'grow' }), h('button', { class: 'btn primary', id: 'vn-use', onclick: () => { keepSet(); onChange?.(); bg.remove(); } }, 'Use and close'))));
  document.body.append(bg); draw();
}
const sec = (t, ...rest) => h('div', { class: 'vn-sec' }, h('span', { class: 'vn-lab' }, t), ...rest);
const pickRow = (on, name, sub, extra, onclick, attrs = {}) => h('button', { class: 'vn-pick' + (on ? ' on' : ''), onclick, ...attrs }, h('span', { class: 'ck' }, on ? icon('check') : ''), h('span', { class: 'grow' }, h('b', {}, name), sub && h('small', {}, sub)), extra);
const crow = (label, opts, val, set, note) => h('div', { class: 'vn-crow' }, h('span', { class: 'vn-clab' }, label), h('div', { class: 'vn-cops' }, opts.map(([id, l]) => h('button', { class: 'vn-chip sm' + (val === id ? ' on' : ''), onclick: () => set(id) }, l))), note && h('span', { class: 'free' }, note));
const PANELS = {
  all: (changed, go) => [h('div', { class: 'vn-list' }, chipList().map(([dr, k, v]) => h('div', { class: 'vn-lrow' }, h('span', { class: 'grow' }, h('b', {}, k), h('small', {}, v)), h('button', { class: 'btn sm', onclick: () => go(dr) }, 'Change'))))],
  skill: (changed) => {
    const A = D.agent; const tabs = A ? A.tabs : [];
    return [sec('Skill: how the agent writes and shoots', h('div', { class: 'vn-grid2' }, pickRow(SET.skill === 'auto', 'Auto', 'The agent picks from your words', null, () => { SET.skill = 'auto'; changed(); }, { 'data-skill': 'auto' }),
      tabs.map((t) => pickRow(SET.skill === t.id, t.label, t.placeholder?.slice(0, 60), null, () => { SET.skill = t.id; if (t.defaults?.seconds) SET.seconds = t.defaults.seconds; if (typeof t.defaults?.chain === 'boolean') SET.chain = t.defaults.chain; changed(); }, { 'data-skill': t.id })))),
    sec('Recipes', h('p', { class: 'vn-note' }, `${A?.templates?.length || 0} ready-made recipes are on the start page. Each sets the skill, the length and the shape for you.`))];
  },
  model: (changed) => {
    const res = SET.quality; const ms = createModels(); const av = avatarModel();
    return [sec('Model', pickRow(SET.model === 'auto', 'Auto', 'Best model per scene: real faces use Seedance 2.5, everything else the default', null, () => { SET.model = 'auto'; changed(); }, { 'data-model': 'auto' }),
      ms.map((m) => pickRow(SET.model === m.id, m.name, [m.tag, m.video?.audio && 'own sound', m.video?.videoToVideo && 'follows a video'].filter(Boolean).join(' · '), h('span', { class: 'vn-cost' }, `${fmtCredits(perSec(m, res))} / s`), () => { SET.model = m.id; changed(); }, { 'data-model': m.id })),
      av && pickRow(false, av.name, 'A photo that talks with a voice. Use Talking photo in Quick clip or Build it myself.', h('span', { class: 'vn-cost' }, `${fmtCredits(perSec(av, '720p'))} / s`), () => toast('Talking photos are made from a photo and a voice: use Quick clip or Build it myself, then Talking photo.')))];
  },
  character: (changed) => [sec('Pick one or more', h('div', { class: 'vn-grid2' }, D.chars.length ? D.chars.map((c) => pickRow(SET.chars.includes(c.id), c.name, `${c.kind === 'person' ? 'Person' : c.kind === 'product' ? 'Product' : c.kind || 'Character'}, ${(c.fileIds || []).length} photos`, c.photos?.[0] && h('img', { class: 'vn-av', src: c.photos[0], alt: '' }), () => { SET.chars = SET.chars.includes(c.id) ? SET.chars.filter((x) => x !== c.id) : [...SET.chars, c.id].slice(0, 4); changed(); }, { 'data-char': c.id })) : h('p', { class: 'vn-note' }, 'No characters yet.'))),
    sec('New character, about 20 seconds', h('div', { class: 'vn-row wrap' }, h('a', { class: 'btn sm', href: '#/characters', onclick: () => $('.vn-drawer-bg')?.remove() }, icon('face'), 'From a photo'), h('a', { class: 'btn sm', href: '#/characters', onclick: () => $('.vn-drawer-bg')?.remove() }, icon('pen'), 'Describe one'))),
    sec('How they are used', h('p', { class: 'vn-note' }, 'Same face in every scene: the preview picture of each scene is drawn from the character photos, so the look is locked before any video is made. Real face photos use Seedance 2.5 automatically, because Seedance 2.0 refuses them. People need a consent tick when first added.'))],
  voice: (changed) => {
    const vs = D.voices; const v = SET.voice || {};
    const kids = [];
    if (vs) kids.push(sec('AI voices', voiceList({ value: v.voiceId || vs.defaultVoice, speed: 1, onPick: (x) => { SET.voice = { kind: 'ai', voiceId: x.id }; changed(); }, onSpeed: () => {} })));
    else kids.push(sec('AI voices', h('p', { class: 'vn-note' }, 'AI voices switch on as soon as the voice service key is added. Until then the agent writes the voice script and you can upload or record your own voice.')));
    kids.push(sec('Use your own voice', h('div', { class: 'vn-row wrap' },
      h('button', { class: 'btn sm', id: 'vn-voice-up', onclick: () => pickFiles('audio/*,.mp3,.wav,.m4a', false, async (picked) => { const fd = new FormData(); fd.append('files', picked[0]); try { const r = await api('/api/files?audio=1', { method: 'POST', body: fd }); if (r.files[0]) { SET.voice = { kind: 'file', fileId: r.files[0].id, name: picked[0].name }; changed(); } } catch (e) { errToast(e); } }, { title: 'Voice clip' }) }, icon('upload'), 'Upload or pick a voice clip'),
      h('button', { class: 'btn sm' + (v.kind === 'none' ? ' on' : ''), onclick: () => { SET.voice = { kind: 'none' }; changed(); } }, 'No voice'),
      h('button', { class: 'btn sm' + (v.kind === 'auto' ? ' on' : ''), onclick: () => { SET.voice = { kind: 'auto' }; changed(); } }, 'Auto')),
      h('p', { class: 'vn-note' }, 'An uploaded clip is used as it is and the scenes are cut to it. Record a clip with your phone or the AI Voice page, then pick it here.'),
      v.kind === 'file' && h('p', { class: 'vn-note on' }, icon('check'), `Using: ${v.name}`)));
    return kids;
  },
  music: (changed) => {
    const m = SET.music || {};
    return [sec('Music, from your library', D.tracks.length ? D.tracks.map((t) => pickRow(m.kind === 'track' && m.trackId === t.id, t.title, `${t.mood}${t.duration ? ', ' + clock(t.duration) : ''}`, h('button', { class: 'icon-btn sm', title: 'Play', onclick: (e) => { e.stopPropagation(); playUrl(t.audio, e.currentTarget); } }, icon('play')), () => { SET.music = { kind: 'track', trackId: t.id }; changed(); }, { 'data-track': t.id })) : h('p', { class: 'vn-note' }, 'The music library is empty or switched off.')),
      h('div', { class: 'vn-row wrap' },
        h('button', { class: 'btn sm', onclick: () => pickFiles('audio/*,.mp3,.wav,.m4a', false, async (picked) => { const fd = new FormData(); fd.append('files', picked[0]); try { const r = await api('/api/files?audio=1', { method: 'POST', body: fd }); if (r.files[0]) { SET.music = { kind: 'file', fileId: r.files[0].id, name: picked[0].name }; changed(); } } catch (e) { errToast(e); } }, { title: 'Song' }) }, icon('upload'), 'Upload a track'),
        h('button', { class: 'btn sm' + (m.kind === 'auto' ? ' on' : ''), onclick: () => { SET.music = { kind: 'auto' }; changed(); } }, 'Auto'),
        h('button', { class: 'btn sm' + (m.kind === 'none' ? ' on' : ''), onclick: () => { SET.music = { kind: 'none' }; changed(); } }, 'No music')),
      h('p', { class: 'vn-note' }, 'Music is lowered under the voice automatically.')];
  },
  effects: (changed) => [sec('Effects and look',
    crow('Camera', CAMERAS.map(([a, b]) => [a, b]), SET.camera, (x) => { SET.camera = x; changed(); }),
    crow('Look', LOOKS, SET.look, (x) => { SET.look = x; changed(); }, 'FREE'),
    crow('Between', BETWEEN, SET.between, (x) => { SET.between = x; changed(); }, 'FREE'),
    h('p', { class: 'vn-note' }, 'Camera moves are part of how a scene is made. Looks and transitions are added at the end and are free to change.'))],
  more: (changed) => [
    sec('Sizes', h('div', { class: 'vn-cops' }, SIZES.map(([id, l, note]) => h('button', { class: 'vn-chip sm' + (SET.sizes.includes(id) ? ' on' : ''), 'data-size': id, title: note, onclick: () => { SET.sizes = SET.sizes.includes(id) ? (SET.sizes.length > 1 ? SET.sizes.filter((x) => x !== id) : SET.sizes) : [...SET.sizes, id]; if (!RATIO_OF[SET.sizes[0]]) SET.sizes = ['9x16', ...SET.sizes.filter((x) => x !== '9x16')]; changed(); } }, l))), h('p', { class: 'vn-note' }, 'The first size is the shape the scenes are made in. The other sizes are made from it at the end, free, and you can drag to choose what stays in the frame.')),
    sec('Length', h('div', { class: 'vn-cops' }, (D.agent?.lengths || [15, 30, 60, 120, 300]).map((s) => h('button', { class: 'vn-chip sm' + (SET.seconds === s ? ' on' : ''), onclick: () => { SET.seconds = s; changed(); } }, fmtLen(s))))),
    sec('Captions', h('div', { class: 'vn-cops' }, [[true, 'On'], [false, 'Off']].map(([v, l]) => h('button', { class: 'vn-chip sm' + (SET.captions === v ? ' on' : ''), onclick: () => { SET.captions = v; changed(); } }, l)), [['clean', 'Clean'], ['boxed', 'Boxed'], ['bold', 'Bold']].map(([v, l]) => h('button', { class: 'vn-chip sm' + (SET.captionStyle === v ? ' on' : ''), onclick: () => { SET.captionStyle = v; changed(); } }, l)))),
    sec('Brand', brandPicker(changed)),
    sec('Quality', h('div', { class: 'vn-cops' }, ['480p', '720p', '1080p'].map((q) => h('button', { class: 'vn-chip sm' + (SET.quality === q ? ' on' : ''), onclick: () => { SET.quality = q; changed(); } }, q)))),
    sec('Language of the voice', h('select', { class: 'vn-select', onchange: (e) => { SET.language = e.target.value; changed(); } }, (D.agent?.languages || ['English']).map((l) => h('option', { value: l, selected: SET.language === l }, l)))),
    sec('Scenes', h('label', { class: 'vn-check' }, h('input', { type: 'checkbox', checked: SET.chain, onchange: (e) => { SET.chain = e.target.checked; changed(); } }), 'Chain scenes: each starts from the last picture of the one before'),
      h('label', { class: 'vn-check' }, h('input', { type: 'checkbox', checked: SET.previews, onchange: (e) => { SET.previews = e.target.checked; changed(); } }), 'Draw a preview picture of every scene first (a few credits each)'),
      h('label', { class: 'vn-check' }, h('input', { type: 'checkbox', checked: SET.autoMake, onchange: (e) => { SET.autoMake = e.target.checked; changed(); } }), 'Just make it: skip the plan step when it costs under 5,000 credits'))],
};
function brandPicker(changed) {
  const b = SET.brand;
  const opts = D.brands.filter((x) => x.logoFileId || x.logo).map((x) => pickRow(b?.id === x.id, x.name || x.kit?.name || 'Brand', 'From Ad Studio', null, () => { SET.brand = { id: x.id, name: x.name || x.kit?.name, logoFileId: x.logoFileId || x.logo?.id, endCard: true, corner: false, sting: false }; changed(); }));
  return h('div', { class: 'vn-col' }, ...opts,
    h('div', { class: 'vn-row wrap' },
      h('button', { class: 'btn sm', id: 'vn-logo-up', onclick: () => pickFiles('image/*', false, async (picked) => { const fd = new FormData(); fd.append('files', picked[0]); try { const r = await api('/api/files', { method: 'POST', body: fd }); if (r.files[0]) { SET.brand = { name: picked[0].name.replace(/\.[^.]+$/, ''), logoFileId: r.files[0].id, endCard: true, corner: false, sting: false }; changed(); } } catch (e) { errToast(e); } }, { title: 'Logo' }) }, icon('upload'), b ? 'Change logo' : 'Add my logo'),
      b && h('button', { class: 'btn sm', onclick: () => { SET.brand = null; changed(); } }, 'No brand')),
    b && h('div', { class: 'vn-col' }, h('span', { class: 'vn-note' }, `Logo: ${b.name || 'my logo'}`),
      [['endCard', 'End card: the logo closes the video'], ['corner', 'Corner mark: small logo on every scene (free, added at export)'], ['sting', 'Opening sting: the logo opens the video']].map(([k, l]) => h('label', { class: 'vn-check' }, h('input', { type: 'checkbox', 'data-brand': k, checked: k === 'endCard' ? b.endCard !== false : !!b[k], onchange: (e) => { SET.brand = { ...SET.brand, [k]: e.target.checked }; changed(); } }), l)),
      b.corner && crow('Corner', [['top-right', 'Top right'], ['top-left', 'Top left'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left']], b.cornerAt || 'top-right', (x) => { SET.brand = { ...SET.brand, cornerAt: x }; changed(); })),
    h('p', { class: 'vn-note' }, 'AI video cannot draw a logo exactly, so your real logo file is used as a card and a mark.'));
}
let PLAYING = null;
function playUrl(url, btn) {
  if (PLAYING) { PLAYING.a.pause(); PLAYING.b?.classList.remove('on'); if (PLAYING.url === url) { PLAYING = null; return; } }
  const a = new Audio(url); a.play().catch(() => {}); btn?.classList.add('on'); a.onended = () => btn?.classList.remove('on'); PLAYING = { a, b: btn, url };
}

// ======================================================================
// Quick clip (Q1, Q2): one prompt, one clip, no agent
// ======================================================================
function quickBox() {
  const q = { model: 'auto', chars: [], seconds: 5, sizes: [SET.sizes[0] || '16x9'], quality: SET.quality === '1080p' ? '1080p' : '720p', camera: 'auto', look: 'auto', sound: true, voice: 'off', takes: 1, ...store.get('vn-quick', {}) };
  const keep = () => store.set('vn-quick', q);
  const ta = h('textarea', { id: 'vn-qprompt', class: 'vn-ta', rows: 2, maxlength: 2000, placeholder: 'A golden retriever runs along a beach at sunset, slow motion, the camera tracks beside it.' }, store.get('vn-qdraft', ''));
  ta.addEventListener('input', () => { store.set('vn-qdraft', ta.value); grow(ta); draw(); });
  const slots = { start: null, ref: null, voice: null };
  const pre = store.get('vn-qstart', null); if (pre?.id) { slots.start = pre; store.set('vn-qstart', null); } // a picture sent from Image (new)
  const res = h('div', { class: 'vn-qres', id: 'vn-qres' });
  const chips = h('div', { class: 'vn-chips' }); const slotEl = h('div', { class: 'vn-slots' }); const cost = h('span', { class: 'vn-qcost' });
  const go = h('button', { class: 'btn primary vn-go', id: 'vn-qgo' }, icon('sparkle'), 'Generate');
  const ch = () => q.chars.map((id) => D.chars.find((c) => c.id === id)).filter(Boolean)[0];
  const talking = () => !!avatarModel() && (!!slots.voice || q.voice === 'ai');
  const model = () => {
    if (talking()) return avatarModel();
    if (q.model !== 'auto') return modelById(q.model);
    if (slots.ref?.kind === 'video') return visionModel();
    if (ch()?.kind === 'person' || (q.sound && best())) return best() || createModels()[0];
    return createModels().find((m) => m.id === D.agent?.model?.id) || createModels()[0];
  };
  const est = () => { const m = model(); if (!m) return 0; if (talking()) return perSec(m, '720p') * Math.max(4, slots.voice?.duration || Math.ceil(ta.value.trim().length / 15) || 5); return sceneCost(m, q.quality, q.seconds) * q.sizes.length * q.takes; };
  const pop = (e, title, items) => popover(e.currentTarget, h('div', { class: 'menu' }, h('div', { class: 'menu-head' }, title), items));
  const qchip = (key, label, val, onclick) => h('button', { class: 'vn-chip', 'data-qchip': key, onclick }, h('span', {}, label + ': '), h('b', {}, val));
  const slot = (k, t, d, accept) => h('button', { class: 'vn-slot' + (slots[k] ? ' on' : ''), 'data-slot': k, onclick: () => {
    if (slots[k]) { slots[k] = null; return draw(); }
    pickFiles(accept, false, async (picked) => { const fd = new FormData(); fd.append('files', picked[0]); slots[k] = { name: picked[0].name, busy: true }; draw(); try { const r = await api('/api/files?audio=1', { method: 'POST', body: fd }); const x = r.files[0]; slots[k] = x ? { id: x.id, name: picked[0].name, kind: x.kind || (picked[0].type.split('/')[0]), duration: x.duration } : null; } catch (er) { slots[k] = null; errToast(er); } draw(); }, { title: t });
  } }, slots[k] ? (slots[k].busy ? h('span', { class: 'spin' }) : icon('check')) : icon('plus'), h('b', {}, slots[k] ? slots[k].name : t), h('small', {}, slots[k] ? 'Tap to remove' : d));
  function draw() {
    const m = model();
    chips.replaceChildren(
      qchip('model', 'Model', talking() ? (avatarModel()?.name || 'Talking photo') : q.model === 'auto' ? `Auto (${m?.name || 'none'})` : m?.name || 'Auto', (e) => pop(e, 'MODEL', [h('button', { onclick: () => { closePop(); q.model = 'auto'; keep(); draw(); } }, 'Auto'), ...createModels().map((x) => h('button', { onclick: () => { closePop(); q.model = x.id; keep(); draw(); } }, x.name, h('small', {}, ` ${fmtCredits(perSec(x, q.quality))}/s`)))])),
      qchip('character', 'Character', ch()?.name || 'None', (e) => pop(e, 'CHARACTER', [h('button', { onclick: () => { closePop(); q.chars = []; keep(); draw(); } }, 'None'), ...D.chars.map((c) => h('button', { onclick: () => { closePop(); q.chars = [c.id]; keep(); draw(); } }, c.name))])),
      !talking() && qchip('length', 'Length', `${q.seconds} s`, (e) => pop(e, 'LENGTH', ((m?.video?.durations || [5, 10]).filter((d) => d > 0)).map((d) => h('button', { onclick: () => { closePop(); q.seconds = d; keep(); draw(); } }, `${d} s`)))),
      !talking() && qchip('sizes', 'Sizes', q.sizes.map((s) => RATIO_OF[s]).join(', '), (e) => pop(e, 'SIZES, EACH MADE IN ITS TRUE SHAPE', ['9x16', '1x1', '16x9'].filter((s) => !m || m.video?.ratios?.includes(RATIO_OF[s]) || m.video?.ratios?.includes('adaptive')).map((s) => h('button', { class: q.sizes.includes(s) ? 'on' : '', onclick: () => { q.sizes = q.sizes.includes(s) ? (q.sizes.length > 1 ? q.sizes.filter((x) => x !== s) : q.sizes) : [...q.sizes, s]; keep(); draw(); closePop(); } }, q.sizes.includes(s) ? icon('check') : icon('ratio'), RATIO_OF[s])))),
      !talking() && qchip('quality', 'Quality', q.quality, (e) => pop(e, 'QUALITY', (m?.video?.resolutions || ['720p']).map((r) => h('button', { onclick: () => { closePop(); q.quality = r; keep(); draw(); } }, r)))),
      !talking() && qchip('camera', 'Camera', CAMERAS.find((c) => c[0] === q.camera)?.[1], (e) => pop(e, 'CAMERA', CAMERAS.map(([id, l]) => h('button', { onclick: () => { closePop(); q.camera = id; keep(); draw(); } }, l)))),
      !talking() && qchip('look', 'Look', LOOKS.find((c) => c[0] === q.look)?.[1], (e) => pop(e, 'LOOK', LOOKS.map(([id, l]) => h('button', { onclick: () => { closePop(); q.look = id; keep(); draw(); } }, l)))),
      !talking() && qchip('sound', 'Sound', q.sound ? 'On' : 'Off', () => { q.sound = !q.sound; keep(); draw(); }),
      avatarModel() && qchip('voice', 'Voice', slots.voice ? 'My clip' : q.voice === 'ai' ? 'AI voice reads my words' : 'Off', () => { q.voice = q.voice === 'ai' ? 'off' : 'ai'; keep(); draw(); }),
      !talking() && qchip('takes', 'Takes', String(q.takes), () => { q.takes = q.takes >= 4 ? 1 : q.takes + 1; keep(); draw(); }));
    slotEl.replaceChildren(slot('start', '+ Start picture', 'first frame', 'image/*'), slot('ref', '+ Reference', 'video to follow', 'video/*,.mp4,.mov,.webm'), avatarModel() && slot('voice', '+ Voice clip', 'makes a photo talk', 'audio/*,.mp3,.wav,.m4a'));
    ta.placeholder = talking() ? 'Type what the person says. Add their photo as the start picture.' : 'A golden retriever runs along a beach at sunset, slow motion, the camera tracks beside it.';
    cost.textContent = m ? `About ${fmtCredits(est())} credits${!talking() && q.sizes.length > 1 ? `, ${q.sizes.length} sizes, ${q.seconds} s each` : ''}` : 'No model can make this right now';
  }
  go.onclick = async () => {
    const m = model(); const text = ta.value.trim();
    if (!m) return toast('No video model can make this right now.', 'error');
    if (!text && !slots.start) return toast('Type a prompt first.', 'error');
    if (talking() && !slots.start && !ch()) return toast('A talking photo needs a photo of the person. Add it as the start picture.', 'error');
    if (Object.values(slots).some((x) => x?.busy)) return toast('A file is still uploading.');
    go.disabled = true;
    const cam = CAMERAS.find((c) => c[0] === q.camera)?.[2] || ''; const look = q.look !== 'auto' && q.look !== 'clean' ? ` Colour look: ${LOOKS.find((l) => l[0] === q.look)[1].toLowerCase()}.` : '';
    const fileIds = [slots.start?.id, slots.ref?.id, talking() && slots.voice?.id].filter(Boolean);
    const runs = talking() ? [{ ratio: '' }] : q.sizes.flatMap((s) => Array.from({ length: q.takes }, () => ({ ratio: RATIO_OF[s] })));
    const cards = runs.map((r) => ({ ...r, el: h('div', { class: 'vn-qcard busy' }, h('span', { class: 'spin' }), h('small', {}, r.ratio ? `${r.ratio}, making…` : 'Talking photo, making…')) }));
    res.prepend(...cards.map((c) => c.el));
    await Promise.all(cards.map(async (c) => {
      try {
        const r = await api('/api/generate', { method: 'POST', timeoutMs: 200000, body: { idem: idem(), mode: 'video', model: m.id, prompt: talking() ? text : [text, cam, look].filter(Boolean).join(' ').trim(), fileIds, characterId: ch()?.id, task: slots.ref?.kind === 'video' ? 'edit' : 'create', params: talking() ? {} : { resolution: q.quality, ratio: c.ratio, duration: q.seconds }, origin: 'vnew' } });
        setCredits(r.credits); const g = await waitGen(r.generation, c.el); showClip(c, g, { m, text, q, fileIds });
      } catch (e) { c.el.replaceChildren(h('small', { class: 'err' }, e.message)); c.el.classList.remove('busy'); }
    }));
    go.disabled = false; refreshRecents?.();
  };
  draw(); setTimeout(() => grow(ta), 0);
  loadEarlier(res);
  return h('div', { class: 'vn-wrap' }, h('div', { class: 'vn-box' }, h('p', { class: 'vn-lab' }, 'One prompt, one clip. No agent, no plan.'), ta, slotEl,
    h('div', { class: 'vn-row' }, h('span', { class: 'vn-lab' }, 'Already set. Tap any one to change it.'), h('div', { class: 'grow' }), h('button', { class: 'vn-link', onclick: async () => { if (!ta.value.trim()) return toast('Type a short idea first.'); try { const r = await api('/api/enhance', { method: 'POST', body: { prompt: ta.value.trim(), mode: 'video' } }); ta.value = r.prompt; setCredits(r.credits); grow(ta); } catch (e) { errToast(e); } } }, icon('sparkle'), 'Improve my prompt')),
    chips, h('div', { class: 'vn-row' }, cost, h('div', { class: 'grow' }), micButton(ta), go)),
  h('div', { class: 'vn-ways' }, [['Text to video', 'Just type. Model: Auto picks the best for your words.'], ['Picture to video', 'Add a start picture.'], ['Talking photo', avatarModel() ? 'Add a face photo and a voice clip or typed words. Uses OmniHuman.' : 'Switches on when the OmniHuman key is added.'], ['Follow a video', 'Add a reference video. Uses Seedance 2.5 Vision.'], ['With a character', 'Pick a character and the face stays the same.'], ['Several takes', 'Set Takes to 2 to 4 and keep the best one.']].map(([a, b]) => h('div', { class: 'vn-way' }, h('b', {}, a), h('small', {}, b)))),
  h('h2', { class: 'vn-h2' }, 'Your clips'), res);
}
async function waitGen(g, el) {
  for (let i = 0; i < 400 && !['done', 'failed', 'error'].includes(g.status); i++) {
    await new Promise((r) => setTimeout(r, i < 5 ? 2500 : 4000));
    if (!el.isConnected && i > 3) return g;
    try { g = (await api('/api/generations/' + g.id)).generation; } catch { /* try again */ }
    const p = el.querySelector('small'); if (p && g.progress) p.textContent = typeof g.progress === 'string' ? g.progress : `${Math.round(g.progress * 100)}%`;
  }
  if (g.status !== 'done') throw new Error(g.error || 'This clip could not be made. Nothing was charged for it.');
  return g;
}
async function loadEarlier(res) {
  try { const r = await api('/api/generations?mode=video&limit=8'); r.generations.filter((g) => g.status === 'done' && g.media?.[0]).forEach((g) => { const c = { el: h('div', { class: 'vn-qcard' }) }; res.append(c.el); showClip(c, g, { m: modelById(g.model), text: g.prompt, q: null }); }); } catch { /* fine */ }
}
function showClip(c, g, ctx) {
  const v = g.media?.[0]; if (!v) return;
  c.el.classList.remove('busy');
  const vid = h('video', { src: v.url, controls: true, playsinline: true, preload: 'metadata', poster: v.poster || undefined });
  const act = (label, cls, fn, free) => h('button', { class: 'vn-fix', 'data-act': label, onclick: fn }, h('span', {}, label), h('span', { class: cls }, free));
  c.el.replaceChildren(vid, h('small', { class: 'el' }, g.prompt || ''),
    h('div', { class: 'vn-fixes' },
      act('Download', 'free', () => downloadFiles([v.id], v.url), 'FREE'),
      act('Drag and crop', 'free', () => openCrop(v.id), 'FREE'),
      act('Add more scenes', 'free', () => toStoryboard(v, g), 'OPEN'),
      act('Add voice, music, captions', 'free', () => toStoryboard(v, g), 'OPEN'),
      ctx.m && act('Redo', 'paid', () => { const box = $('#vn-qprompt'); if (box) { box.value = g.prompt || ''; $('#vn-qgo')?.click(); } }, 'ABOUT ' + fmtCredits(sceneCost(ctx.m, g.params?.resolution || '720p', g.params?.duration || 5))),
      ctx.m && f().videoExtend && act('Make it longer', 'paid', () => location.hash = '#/video', 'STUDIO')));
}
// A quick clip becomes the first scene of a project, opened on that scene: voice, music, captions, more scenes.
async function toStoryboard(v, g) {
  try {
    const r = await api(`/api/media/${v.id}/as-file`, { method: 'POST', body: { name: (g.prompt || 'Clip').slice(0, 40) + '.mp4' } });
    const p = (await api('/api/builder/projects', { method: 'POST', body: { title: (g.prompt || 'My video').slice(0, 60), ratio: g.params?.ratio && RATIO_OF[SHAPE_OF[g.params.ratio]] ? g.params.ratio : '16:9', resolution: g.params?.resolution || '720p' } })).project;
    const v2 = await api(`/api/builder/projects/${p.id}/add`, { method: 'POST', body: { fileIds: [r.file.id] } });
    await api('/api/builder/projects/' + p.id, { method: 'PUT', body: { rev: v2.project.rev, vnew: { mode: 'build' } } });
    location.hash = `#/vnew/v/${p.id}`;
  } catch (e) { errToast(e); }
}

// ======================================================================
// Build it myself (Q3): start an empty video and add scenes one by one
// ======================================================================
function buildBox() {
  const title = h('input', { class: 'vn-input', id: 'vn-btitle', placeholder: 'Name of the video (optional)', maxlength: 120 });
  const go = h('button', { class: 'btn primary vn-go', id: 'vn-bgo' }, icon('plus'), 'Start my video');
  go.onclick = async () => {
    if (!paid()) return toast('Build it myself uses paid credits. Pick a plan or a top-up pack first.', 'error');
    go.disabled = true;
    try {
      const p = (await api('/api/builder/projects', { method: 'POST', body: { title: title.value.trim() || 'Untitled video', ratio: RATIO_OF[SET.sizes[0]] || '9:16', resolution: SET.quality } })).project;
      await api('/api/builder/projects/' + p.id, { method: 'PUT', body: { rev: p.rev, captionStyle: SET.captionStyle, vnew: { mode: 'build', look: SET.look, sizes: SET.sizes, captions: SET.captions, brand: SET.brand } } });
      location.hash = '#/vnew/v/' + p.id;
    } catch (e) { errToast(e); go.disabled = false; }
  };
  return h('div', { class: 'vn-wrap' }, !paid() && paidNote(), h('div', { class: 'vn-box' },
    h('p', {}, h('b', {}, 'Build it myself. '), 'You add each scene: AI scenes from a prompt, your own videos and photos, talking photos and text cards. Nothing is planned or made for you unless you ask. You can call the agent in at any time.'),
    h('div', { class: 'vn-row' }, title, h('span', { class: 'vn-chip' }, 'Size: ', h('b', {}, RATIO_OF[SET.sizes[0]] || '9:16')), go)),
  h('p', { class: 'vn-foot' }, 'Only AI scenes cost credits. Your own clips, cuts, music and captions are free.'));
}

// ======================================================================
// One video: plan (J2), making with a live preview (J4), done (J5), one scene (J6), build list (Q3)
// ======================================================================
let PV = null; // the view of the open project
async function renderProject(pid, sid) {
  let v; try { v = await api('/api/builder/projects/' + pid); } catch (e) { $('#main').replaceChildren(topbar(), h('div', { class: 'page' }, h('h1', {}, 'Video'), h('div', { class: 'err' }, e.message), h('a', { class: 'btn', href: '#/vnew' }, 'Back to Video'))); return; }
  PV = v; drawProject(sid);
}
const aiScenes = () => PV.project.scenes.filter((s) => s.type === 'ai');
const made = (s) => s.type !== 'ai' || !!s.versions?.length;
function stage() {
  const p = PV.project;
  if (p.vnew?.mode === 'build') return 'build';
  if (!p.scenes.length) return 'build';
  if (p.scenes.every(made)) return 'done';
  if (p.vnew?.started || p.scenes.some((s) => s.status === 'generating' || (s.versions?.length && s.type === 'ai'))) return 'making';
  return 'plan';
}
function fileOf(id) { return id ? PV.files[id] : null; }
function sceneMedia(s) {
  if (s.type === 'ai') { const ver = s.versions?.[s.cur ?? s.versions.length - 1]; const fv = ver && fileOf(ver.fileId); if (fv) return { kind: 'video', url: fv.play || fv.url, poster: fv.poster }; const ref = fileOf(s.refFileId); return ref ? { kind: 'image', url: ref.url } : null; }
  const fv = fileOf(s.fileId); return fv ? { kind: fv.kind === 'image' ? 'image' : 'video', url: fv.play || fv.url, poster: fv.poster } : null;
}
function schedule() {
  clearTimeout(POLL);
  const busy = PV.jobs.length || PV.project.scenes.some((s) => s.status === 'generating') || (PV.project.exports || []).some((e) => e.status === 'working');
  if (!busy) return;
  POLL = setTimeout(async () => {
    if (!location.hash.startsWith('#/vnew/v/' + PV.project.id)) return;
    try { const v = await api('/api/builder/projects/' + PV.project.id); const was = JSON.stringify([PV.project.rev, PV.jobs.length, PV.picturing, (PV.project.exports || []).map((e) => e.status)]); PV = v; if (JSON.stringify([v.project.rev, v.jobs.length, v.picturing, (v.project.exports || []).map((e) => e.status)]) !== was) drawProject(currentSid()); else schedule(); } catch { schedule(); }
  }, 3000);
}
const currentSid = () => { const m = location.hash.match(/\/s\/([^/]+)/); return m ? m[1] : ''; };
async function save(body, { quiet } = {}) {
  try { PV = await api('/api/builder/projects/' + PV.project.id, { method: 'PUT', body: { rev: PV.project.rev, ...body } }); }
  catch (e) { if (e.code === 'stale' || /changed somewhere else/.test(e.message)) { PV = await api('/api/builder/projects/' + PV.project.id); PV = await api('/api/builder/projects/' + PV.project.id, { method: 'PUT', body: { rev: PV.project.rev, ...body } }); } else { if (!quiet) errToast(e); throw e; } }
  return PV;
}

function projectTop(view) {
  const p = PV.project; const sizes = (p.vnew?.sizes || [SHAPE_OF[p.ratio]]).map((s) => SIZES.find((x) => x[0] === s)?.[1]).filter(Boolean);
  const title = h('input', { class: 'vn-ptitle', value: p.title, 'aria-label': 'Title', onchange: (e) => save({ title: e.target.value }) });
  const first = p.scenes[0]?.id || '';
  return h('div', { class: 'vn-ptop' },
    h('a', { class: 'vn-crumb', href: '#/vnew' }, 'Video /'), title, p.vnew?.skill && h('span', { class: 'vn-chip' }, skillLabel(p.vnew.skill)),
    h('div', { class: 'vn-modes seg sm' }, h('a', { class: view === 'agent' ? 'on' : '', href: '#/vnew/v/' + p.id }, p.vnew?.mode === 'build' ? 'Scenes' : 'Agent'), h('a', { class: view === 'storyboard' ? 'on' : '', href: first ? `#/vnew/v/${p.id}/s/${first}` : '#/vnew/v/' + p.id }, 'Storyboard'), h('a', { href: '#/builder/' + p.id, title: 'The full timeline: trim, move, layers, fine cuts' }, 'Timeline')),
    h('div', { class: 'grow' }), h('button', { class: 'vn-chip', onclick: () => sizesDialog() }, 'Sizes: ', h('b', {}, sizes.join(', '))),
    h('button', { class: 'btn primary', id: 'vn-export', onclick: () => exportAll() }, icon('dl'), 'Export'));
}

function drawProject(sid) {
  const st = stage();
  const main = h('div', { class: 'vn-proj' });
  $('#main').replaceChildren(topbar([h('span', { class: 'vn-title' }, 'Video', h('span', { class: 'tag new' }, 'New'))]), projectTop(sid ? 'storyboard' : 'agent'), h('div', { class: 'scroll vn-scroll' }, main));
  if (sid && PV.project.scenes.some((s) => s.id === sid)) drawScene(main, sid);
  else if (st === 'build') drawBuild(main);
  else if (st === 'plan') drawPlan(main);
  else drawMaking(main, st === 'done');
  schedule();
}

// ---------- J2: the plan ----------
function drawPlan(main) {
  const p = PV.project; const est = PV.estimate?.total || 0;
  const tiles = p.scenes.map((s, i) => { const m = sceneMedia(s); const drawing = PV.picturing?.includes(s.id);
    return h('a', { class: 'vn-tile', href: `#/vnew/v/${p.id}/s/${s.id}`, 'data-scene': i + 1 }, h('span', { class: 'vn-ph' }, m?.kind === 'image' ? h('img', { src: m.url, alt: '' }) : null, h('span', { class: 'n' }, i + 1), h('span', { class: 'ed' }, 'Edit')), h('b', { class: 'el' }, sceneName(s, i)), h('small', { class: drawing ? 'paid' : m ? 'ok' : 'mut' }, s.type !== 'ai' ? 'YOURS' : drawing ? 'DRAWING' : m ? 'PICTURE READY' : 'READY TO MAKE')); });
  const rows = p.scenes.map((s, i) => h('div', { class: 'vn-prow' }, h('span', { class: 'mut' }, `${i + 1}. ${sceneName(s, i)}`), h('span', { class: 'grow' }, s.narration ? `"${s.narration.replace(/^["“]|["”]$/g, '')}"` : s.type === 'ai' ? s.prompt.split('. ')[0] : 'Your ' + s.type), h('span', { class: 'mut' }, `${Math.round(s.duration || PV.timeline.find((t) => t.id === s.id)?.seconds || 0)} s`)));
  const ask = askBox('Change anything in words: make it funnier, use a male voice, add my logo at the end');
  main.replaceChildren(h('div', { class: 'vn-plan' },
    h('div', { class: 'vn-card vn-planl' },
      h('div', { class: 'vn-row' }, h('h2', {}, 'Here is the plan'), h('span', { class: 'vn-chip' }, `${p.scenes.length} scenes, ${Math.round(PV.seconds)} seconds`), h('div', { class: 'grow' }), h('span', { class: 'mut sm' }, 'Tap a scene to edit it before it is made')),
      h('div', { class: 'vn-tiles' }, tiles), h('div', { class: 'vn-prows' }, rows),
      h('div', { class: 'vn-row wrap' }, h('button', { class: 'btn sm', onclick: addAiScene }, icon('plus'), 'Add scene'), h('button', { class: 'btn sm', onclick: reorderDialog }, icon('list'), 'Reorder'), h('button', { class: 'btn sm', onclick: () => scriptDialog(p.scenes.map((s) => s.narration).filter(Boolean).join('\n'), (t) => askAgent(`Use this script word for word as the narration, one line per scene, and fit the scenes to it:\n${t}`)) }, icon('doc'), 'Paste my own script'), h('div', { class: 'grow' }), h('a', { class: 'vn-link', href: '#/builder/' + p.id }, 'Detailed plan table')),
      ask),
    h('div', { class: 'vn-card vn-planr' }, h('span', { class: 'vn-lab' }, 'Chosen for you, tap to change'), settingsList(),
      h('div', { class: 'vn-costbox' }, h('b', {}, `About ${fmtCredits(est)} credits`), h('small', {}, `You have ${fmtCredits(S.user.credits)}. Only finished scenes are charged.`)),
      h('button', { class: 'btn primary block big', id: 'vn-make', onclick: (e) => makeAll(e.currentTarget) }, 'Make the video'),
      h('label', { class: 'vn-check' }, h('input', { type: 'checkbox', checked: !!SET.autoMake, onchange: (e) => { SET.autoMake = e.target.checked; keepSet(); } }), 'Just make it next time', info('Skips this step when the cost is under 5,000 credits. You can still stop and change anything.')))));
  if (SET.autoMake && est > 0 && est < 5000 && !PV.picturing?.length && !drawPlan.auto?.has(p.id)) { (drawPlan.auto ||= new Set()).add(p.id); makeAll($('#vn-make')); }
}
const sceneName = (s, i) => (s.type === 'image' ? (PV.project.vnew?.brand?.logoFileId === s.fileId ? 'Logo card' : 'Picture') : s.type === 'video' ? 'My clip' : ['Hook', 'Problem', 'Product', 'Apply', 'Result', 'Call to action'][i] && PV.project.scenes.length <= 6 && PV.project.agent?.tab && /ad|ugc|product/.test(PV.project.agent.tab) ? ['Hook', 'Problem', 'Product', 'Apply', 'Result', 'Call to action'][i] : `Scene ${i + 1}`);
function settingsList() {
  const p = PV.project; const vn = p.vnew || {}; const m = modelById(p.modelId);
  const voiceName = vn.voiceId ? D.voices?.voices?.find((x) => x.id === vn.voiceId)?.name || 'AI voice' : p.voice ? fileOf(p.voice.fileId)?.name || 'Your voice' : 'No voice yet';
  const music = p.music ? (D.tracks.find((t) => t.id === p.music.trackId)?.title || fileOf(p.music.fileId)?.name || 'Music') : 'None';
  const row = (k, v, fn, extra) => h('div', { class: 'vn-kv' }, h('span', {}, k), h('span', { class: 'grow' }), h('b', {}, v), extra, fn && h('button', { class: 'vn-link sm', onclick: fn }, 'Change'));
  return h('div', { class: 'vn-kvs' },
    row('Skill', skillLabel(vn.skill || p.agent?.tab || 'general')), row('Model', m?.name || 'Auto', (e) => modelPop(e)),
    row('Character', (vn.characterIds || []).map((id) => D.chars.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || 'None'),
    row('Voice', voiceName, (e) => voiceFix(e), p.voice && h('button', { class: 'icon-btn sm', title: 'Play', onclick: (e) => playUrl(fileOf(p.voice.fileId)?.url, e.currentTarget) }, icon('play'))),
    row('Music', music, (e) => musicFix(e), p.music && h('button', { class: 'icon-btn sm', title: 'Play', onclick: (e) => playUrl(fileOf(p.music.fileId)?.url || D.tracks.find((t) => t.id === p.music.trackId)?.audio, e.currentTarget) }, icon('play'))),
    row('Effects', [CAMERAS.find((c) => c[0] === vn.camera)?.[1], LOOKS.find((l) => l[0] === vn.look)?.[1]].filter((x) => x && x !== 'Auto').join(', ') || 'Auto', (e) => lookFix(e)),
    row('Sizes', (vn.sizes || [SHAPE_OF[p.ratio]]).map((s) => SIZES.find((x) => x[0] === s)?.[1]).join(', '), () => sizesDialog()),
    row('Captions', p.captions?.length ? `On, ${p.captionStyle}` : 'Off', () => toggleCaptions()),
    row('Brand', vn.brand ? `${vn.brand.name || 'Logo'}${vn.brand.corner ? ', corner mark' : ''}` : 'None', () => brandDialog()),
    row('Quality', p.resolution));
}
function askBox(ph) {
  const ta = h('textarea', { class: 'vn-ta sm', rows: 1, placeholder: ph, maxlength: 1000 });
  const send = h('button', { class: 'btn sm primary', onclick: async () => { const t = ta.value.trim(); if (!t) return ta.focus(); send.disabled = true; send.replaceChildren(h('span', { class: 'spin' })); await askAgent(t); send.disabled = false; send.replaceChildren('Send'); } }, 'Send');
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send.click(); } });
  return h('div', { class: 'vn-ask' }, ta, micButton(ta), send);
}
async function askAgent(t) {
  try {
    const r = await api(`/api/builder/projects/${PV.project.id}/revise`, { method: 'POST', timeoutMs: 120000, body: { ask: t } });
    PV = r; setCredits(r.balance);
    // New words need a new voice when the voice was made by AI.
    if (PV.project.vnew?.voiceLines && D.voices && /voice|say|word|script|line|funn|short|long/i.test(t)) { try { PV = await api(`/api/builder/projects/${PV.project.id}/voice-from-script`, { method: 'POST', timeoutMs: 240000, body: { voiceId: PV.project.vnew.voiceId } }); setCredits(PV.balance); } catch (e) { toast('The voice was not remade: ' + e.message, 'error'); } }
    const redo = (r.changed || []).filter((id) => PV.project.scenes.find((s) => s.id === id)?.versions?.length);
    // Rewritten scenes that are not made yet get a fresh preview picture, so the plan never shows an empty tile.
    const pics = PV.project.scenes.filter((s) => s.type === 'ai' && !s.versions?.length && !s.refFileId && (r.changed || []).includes(s.id)).map((s) => s.id);
    if (pics.length) { try { PV = await api(`/api/builder/projects/${PV.project.id}/keyframes`, { method: 'POST', body: { idem: idem(), sceneIds: pics, refFileIds: (PV.project.vnew?.characterIds || []).flatMap((id) => D.chars.find((c) => c.id === id)?.fileIds || []).slice(0, 4) } }); setCredits(PV.credits ?? S.user.credits); } catch (e) { if (!/already has/.test(e.message)) toast('Preview pictures: ' + e.message, 'error'); } }
    drawProject(currentSid());
    toast(redo.length ? `Plan changed. ${redo.length} scene${redo.length > 1 ? 's' : ''} that were already made changed too.` : 'Plan changed.');
    if (redo.length) { const d = dialog({ title: `Remake ${redo.length} changed scene${redo.length > 1 ? 's' : ''}?`, sub: 'The old versions are kept, and you can switch back for free.', body: h('p', {}, `About ${fmtCredits(redo.reduce((a, id) => a + costOf(PV.project.scenes.find((s) => s.id === id)), 0))} credits.`), foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Not now'), h('button', { class: 'btn primary', onclick: async () => { d.remove(); await generate(redo); } }, 'Remake them')] }); }
  } catch (e) { errToast(e); }
}
const costOf = (s) => { const m = modelById(s?.modelId || PV.project.modelId); return s ? sceneCost(m, PV.project.resolution, s.duration || 5) : 0; };
async function generate(ids) {
  try { const r = await api(`/api/builder/projects/${PV.project.id}/generate`, { method: 'POST', body: { idem: idem(), ...(ids ? { sceneIds: ids } : {}) } }); PV = r; setCredits(r.credits); drawProject(currentSid()); refreshRecents?.(); }
  catch (e) { errToast(e); }
}
async function makeAll(btn) {
  if (btn) { btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin' }), 'Starting…'); }
  try { await save({ vnew: { started: true } }, { quiet: true }); } catch { /* the scenes still start */ }
  await generate(null);
  if (btn?.isConnected) { btn.disabled = false; btn.replaceChildren('Make the video'); }
}
async function addAiScene() {
  const ta = h('textarea', { class: 'vn-ta', rows: 3, placeholder: 'What happens in this scene?' });
  const d = dialog({ title: 'Add a scene', body: ta, foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const t = ta.value.trim(); if (!t) return ta.focus(); d.remove(); try { PV = await api(`/api/builder/projects/${PV.project.id}/scenes`, { method: 'POST', body: { prompt: [t, camWordsOf(PV.project.vnew?.camera)].filter(Boolean).join(' '), duration: 5 } }); drawProject(currentSid()); } catch (e) { errToast(e); } } }, 'Add scene')] });
  setTimeout(() => ta.focus(), 30);
}
const camWordsOf = (id) => CAMERAS.find((c) => c[0] === id)?.[2] || '';
function reorderDialog() {
  let order = [...PV.project.scenes];
  const list = h('div', { class: 'vn-col' });
  const draw = () => list.replaceChildren(...order.map((s, i) => h('div', { class: 'vn-lrow' }, h('span', { class: 'grow el' }, `${i + 1}. ${s.type === 'ai' ? s.prompt.slice(0, 70) : 'Your ' + s.type}`), h('button', { class: 'icon-btn sm', title: 'Move up', disabled: !i, onclick: () => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); } }, icon('up')), h('button', { class: 'icon-btn sm', title: 'Move down', disabled: i === order.length - 1, onclick: () => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); } }, icon('down')))));
  draw();
  const d = dialog({ title: 'Reorder scenes', body: list, foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { d.remove(); await save({ scenes: order }); drawProject(''); } }, 'Save order')] });
}

// ---------- quick fixes shared by the plan, making and done views ----------
function modelPop(e) {
  popover(e.currentTarget, h('div', { class: 'menu' }, h('div', { class: 'menu-head' }, 'MODEL FOR SCENES NOT MADE YET'), createModels().map((m) => h('button', { onclick: async () => { closePop(); const scenes = PV.project.scenes.map((s) => (s.type === 'ai' && !s.versions?.length ? { ...s, modelId: m.id } : s)); await save({ modelId: m.id, scenes }); drawProject(currentSid()); } }, m.name, h('small', {}, ` ${fmtCredits(perSec(m, PV.project.resolution))}/s`)))));
}
function voiceFix(e) {
  const p = PV.project; const anchor = e.currentTarget;
  popover(anchor, h('div', { class: 'menu voice-menu' }, h('div', { class: 'menu-head' }, 'VOICE'),
    D.voices ? voiceList({ value: p.vnew?.voiceId || D.voices.defaultVoice, speed: 1, onPick: async (x) => { closePop(); toast('Making the new voice…'); try { PV = await api(`/api/builder/projects/${p.id}/voice-from-script`, { method: 'POST', timeoutMs: 240000, body: { voiceId: x.id } }); setCredits(PV.balance); drawProject(currentSid()); } catch (er) { errToast(er); } }, onSpeed: () => {} }) : h('p', { class: 'vn-note' }, 'AI voices switch on when the voice key is added.'),
    h('button', { onclick: () => { closePop(); pickFiles('audio/*,.mp3,.wav,.m4a', false, async (picked) => { const fd = new FormData(); fd.append('files', picked[0]); try { const r = await api('/api/files?audio=1', { method: 'POST', body: fd }); if (r.files[0]) { await save({ voice: { fileId: r.files[0].id, volume: 1 } }); drawProject(currentSid()); } } catch (er) { errToast(er); } }, { title: 'Voice clip' }); } }, icon('upload'), 'Use my own voice clip'),
    D.voices && h('button', { onclick: async () => { closePop(); const { openVoiceDialog } = await import('./aivoice.js'); openVoiceDialog({ text: p.scenes.map((s) => s.narration).filter(Boolean).join(' '), onMade: async (file) => { await save({ voice: { fileId: file.id, volume: 1 } }); drawProject(currentSid()); } }); } }, icon('mic'), 'Write one long voice-over'),
    p.voice && h('button', { onclick: async () => { closePop(); await save({ voice: null }); drawProject(currentSid()); } }, icon('x'), 'No voice')));
}
function musicFix(e) {
  popover(e.currentTarget, h('div', { class: 'menu' }, h('div', { class: 'menu-head' }, 'MUSIC, FREE TO CHANGE'),
    D.tracks.map((t) => h('button', { onclick: async () => { closePop(); await save({ music: { trackId: t.id, volume: 0.45 } }); drawProject(currentSid()); } }, icon('audio'), t.title, h('small', {}, ' ' + t.mood))),
    h('button', { onclick: () => { closePop(); pickFiles('audio/*,.mp3,.wav,.m4a', false, async (picked) => { const fd = new FormData(); fd.append('files', picked[0]); try { const r = await api('/api/files?audio=1', { method: 'POST', body: fd }); if (r.files[0]) { await save({ music: { fileId: r.files[0].id, volume: 0.45 } }); drawProject(currentSid()); } } catch (er) { errToast(er); } }, { title: 'Song' }); } }, icon('upload'), 'Upload a track'),
    h('button', { onclick: async () => { closePop(); await save({ music: null }); drawProject(currentSid()); } }, icon('x'), 'No music')));
}
function lookFix(e) {
  popover(e.currentTarget, h('div', { class: 'menu' }, h('div', { class: 'menu-head' }, 'LOOK, ADDED AT EXPORT, FREE'), LOOKS.map(([id, l]) => h('button', { class: PV.project.vnew?.look === id ? 'on' : '', onclick: async () => { closePop(); await save({ vnew: { look: id } }); drawProject(currentSid()); } }, l)),
    h('div', { class: 'menu-head' }, 'BETWEEN SCENES'), BETWEEN.slice(1).map(([id, l]) => h('button', { onclick: async () => { closePop(); await save({ scenes: PV.project.scenes.map((s, i, a) => (i < a.length - 1 ? { ...s, transition: id } : s)) }); drawProject(currentSid()); } }, l))));
}
async function toggleCaptions() {
  const on = !PV.project.captions?.length;
  await save({ vnew: { captions: on }, captions: on ? [] : [] });
  if (on) PV = await captionsFromNarration(PV.project.id);
  drawProject(currentSid()); toast(on ? 'Captions are on. They follow the voice lines.' : 'Captions are off.');
}
function sizesDialog() {
  const p = PV.project; let sizes = [...(p.vnew?.sizes || [SHAPE_OF[p.ratio]])];
  const box = h('div', { class: 'vn-cops' }); const draw = () => box.replaceChildren(...SIZES.map(([id, l, note]) => h('button', { class: 'vn-chip' + (sizes.includes(id) ? ' on' : ''), title: note, onclick: () => { sizes = sizes.includes(id) ? (sizes.length > 1 && id !== SHAPE_OF[p.ratio] ? sizes.filter((x) => x !== id) : sizes) : [...sizes, id]; draw(); } }, l, h('small', {}, ' ' + note))));
  draw();
  const d = dialog({ title: 'Sizes', sub: `Scenes are made in ${p.ratio}. Other sizes are made from it at export, free, and you can drag and crop each one.`, body: box, foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { d.remove(); await save({ vnew: { sizes } }); drawProject(currentSid()); } }, 'Save')] });
}
function brandDialog() {
  const old = SET.brand; SET.brand = PV.project.vnew?.brand || null;
  const body = h('div', {}); const draw = () => body.replaceChildren(brandPicker(draw));
  draw();
  const d = dialog({ title: 'Brand', sub: 'Your logo as an end card, a corner mark and an opening sting.', body, wide: true, foot: [h('button', { class: 'btn', onclick: () => { SET.brand = old; d.remove(); } }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
    const b = SET.brand; SET.brand = old; d.remove();
    await save({ vnew: { brand: b } });
    const lid = b?.logoFileId; const sc = PV.project.scenes;
    if (lid && b.endCard !== false && !sc.some((s) => s.type === 'image' && s.fileId === lid && s !== sc[0])) { PV = await api(`/api/builder/projects/${PV.project.id}/add`, { method: 'POST', body: { fileIds: [lid] } }); }
    if (lid && b.sting && !(sc[0]?.type === 'image' && sc[0].fileId === lid)) { PV = await api(`/api/builder/projects/${PV.project.id}/add`, { method: 'POST', body: { fileIds: [lid], at: 0 } }); }
    drawProject(currentSid());
  } }, 'Save')] });
}

// ---------- J4 and J5: making with a live preview, then done ----------
function drawMaking(main, done) {
  const p = PV.project; const ai = aiScenes(); const ready = ai.filter((s) => s.versions?.length).length;
  const left = h('div', { class: 'vn-col vn-left' }, h('h2', {}, done ? 'Your video is ready' : 'Preview, playing now'), player(), h('p', { class: 'mut sm center' }, done ? `${Math.round(PV.seconds)} seconds. Exported files are below.` : 'Pictures with the real voice, music and captions. Each picture turns into video as its scene is ready.'));
  const mid = h('div', { class: 'vn-col vn-mid' });
  if (!done) {
    const pct = ai.length ? Math.round((ready / ai.length) * 100) : 100;
    mid.append(h('div', { class: 'vn-row' }, h('h2', {}, 'Making the real scenes'), h('div', { class: 'grow' }), h('span', { class: 'mut sm' }, `${ready} of ${ai.length} ready`)), h('div', { class: 'vn-bar' }, h('i', { style: { width: pct + '%' } })),
      ...p.scenes.map((s, i) => { const m = sceneMedia(s); const st = made(s) ? 'Ready' : s.status === 'generating' ? 'Making' : s.status === 'failed' || s.error ? 'Failed' : 'Waiting';
        return h('div', { class: 'vn-mrow', 'data-scene': i + 1 }, h('span', { class: 'vn-ph sm' }, m?.kind === 'image' ? h('img', { src: m.url, alt: '' }) : m?.poster ? h('img', { src: m.poster, alt: '' }) : null, h('span', { class: 'n' }, i + 1)), h('span', { class: 'grow' }, h('b', {}, sceneName(s, i)), h('small', { class: 'el' }, s.narration || s.prompt || '')), h('span', { class: 'vn-st ' + st.toLowerCase(), title: s.error || '' }, st), st === 'Failed' && h('button', { class: 'btn sm', onclick: () => generate([s.id]) }, 'Try again'), h('a', { class: 'btn sm', href: `#/vnew/v/${p.id}/s/${s.id}` }, 'Edit')); }),
      h('div', { class: 'vn-note-box' }, icon('bolt'), h('span', {}, h('b', {}, 'You can leave this page. '), 'It keeps going and shows in Recents. Waiting scenes cost nothing to change; only a scene already made needs credits to redo.')));
  } else {
    const ex = (p.exports || [])[0];
    mid.append(h('h2', {}, `Ready in ${(p.vnew?.sizes || [SHAPE_OF[p.ratio]]).length} size${(p.vnew?.sizes || []).length > 1 ? 's' : ''}`), sizesRow(ex),
      h('div', { class: 'vn-row' }, h('h2', {}, 'Tap a scene to edit just that one'), h('div', { class: 'grow' }), h('span', { class: 'mut sm' }, 'The others stay as they are')),
      h('div', { class: 'vn-tiles' }, p.scenes.map((s, i) => { const m = sceneMedia(s); return h('a', { class: 'vn-tile', href: `#/vnew/v/${p.id}/s/${s.id}` }, h('span', { class: 'vn-ph' }, m?.poster || m?.kind === 'image' ? h('img', { src: m.poster || m.url, alt: '' }) : null, h('span', { class: 'n' }, i + 1), h('span', { class: 'ed' }, 'Edit')), h('b', { class: 'el' }, sceneName(s, i))); })));
  }
  mid.append(h('h2', {}, done ? 'Small changes, one tap' : 'Fix it in one tap'), fixes(done), askBox(done ? 'Or tell the agent: swap scene 3 for a close up of the jar' : 'Or say what to change'));
  const right = h('div', { class: 'vn-col vn-right' }, h('h2', {}, 'Go deeper, when you want'), h('p', { class: 'mut sm' }, 'Nothing is hidden. Every tool opens on this same video.'),
    ...[['Storyboard', 'Edit any scene big: prompt, photo, clip', `#/vnew/v/${p.id}/s/${p.scenes[0]?.id || ''}`], ['Timeline', 'Trim, move, layers, fine cuts, voice and music tracks', '#/builder/' + p.id], ['Effects and transitions', 'Camera moves, looks, between scenes', null, lookFix], ['Characters', 'Swap or add a person or product', '#/vnew/characters'], ['Voices', 'Change voice or mood, record or upload your own', null, voiceFix], ['Music', 'Pick another track from your library', null, musicFix], ['Skills', 'Save this style as your own skill', '#/vnew/skills'], ['Crop for social', 'Drag what stays in the frame for each app', null, () => { const e2 = (p.exports || []).find((x) => x.status === 'done'); if (!e2) return toast('Export the video first, then crop it for each app.'); openCrop(e2.fileId); }]]
      .map(([a, b, href, fn]) => h('div', { class: 'vn-door' }, h('span', { class: 'grow' }, h('b', {}, a), h('small', {}, b)), href ? h('a', { class: 'btn sm', href }, 'Open') : h('button', { class: 'btn sm', onclick: fn }, 'Open'))));
  main.replaceChildren(h('div', { class: 'vn-make' + (done ? ' done' : '') }, left, mid, right));
}
function fixes(done) {
  const p = PV.project; const remake = aiScenes().reduce((a, s) => a + costOf(s), 0);
  const fx = (label, tag, cls, fn) => h('button', { class: 'vn-fix', 'data-fix': label, onclick: fn }, h('span', {}, label), h('span', { class: cls }, tag));
  const list = [
    fx('Different voice', D.voices ? 'ABOUT ' + fmtCredits(Math.max(1, p.scenes.map((s) => s.narration || '').join('').length * (D.voices.creditsPerChar || 0.021))) : 'FREE', D.voices ? 'paid' : 'free', voiceFix),
    fx('Different music', 'FREE', 'free', musicFix),
    fx('Change the words', 'ABOUT 10', 'paid', () => wordsDialog()),
    fx(done ? 'Make it 15 s' : 'Make it shorter', 'FREE', 'free', () => askAgent(done ? 'Make the whole video about 15 seconds long by removing or shortening scenes. Keep the best scenes as they are.' : 'Make the video shorter: fewer or shorter scenes.')),
    fx('Captions on or off', 'FREE', 'free', toggleCaptions),
    fx('Captions style', 'FREE', 'free', async () => { const order = ['clean', 'boxed', 'bold']; await save({ captionStyle: order[(order.indexOf(p.captionStyle) + 1) % 3] }); toast(`Captions style: ${PV.project.captionStyle}. It shows in the exported video.`); drawProject(''); }),
    fx('Other look', 'FREE', 'free', lookFix),
  ];
  const firstPic = aiScenes().find((s) => !s.versions?.length && s.status !== 'generating');
  if (!done && firstPic) list.push(fx(`Redo picture ${p.scenes.indexOf(firstPic) + 1}`, 'ABOUT ' + fmtCredits(D.builder?.keyframe?.credits || 60), 'paid', async () => { try { PV = await api(`/api/builder/projects/${p.id}/keyframes`, { method: 'POST', body: { idem: idem(), sceneIds: [firstPic.id], refFileIds: (p.vnew?.characterIds || []).flatMap((id) => D.chars.find((c) => c.id === id)?.fileIds || []).slice(0, 4) } }); drawProject(''); } catch (e) { errToast(e); } }));
  if (done && p.resolution !== '1080p') list.push(fx('Sharper, 1080p', 'ABOUT ' + fmtCredits(aiScenes().reduce((a, s) => a + sceneCost(modelById(s.modelId || p.modelId), '1080p', s.duration || 5), 0)), 'paid', () => { const d = dialog({ title: 'Remake every scene in 1080p?', sub: 'The 720p versions are kept and you can switch back for free.', body: h('p', {}, `About ${fmtCredits(aiScenes().reduce((a, s) => a + sceneCost(modelById(s.modelId || p.modelId), '1080p', s.duration || 5), 0))} credits.`), foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { d.remove(); await save({ resolution: '1080p' }); await generate(aiScenes().map((s) => s.id)); } }, 'Remake in 1080p')] }); }));
  if (done) list.push(fx('Remake all scenes', 'ABOUT ' + fmtCredits(remake), 'paid', () => generate(aiScenes().map((s) => s.id))));
  return h('div', { class: 'vn-fixes' }, list);
}
function wordsDialog() {
  const p = PV.project; const boxes = p.scenes.map((s, i) => ({ s, ta: h('textarea', { class: 'vn-ta sm', rows: 2 }, s.narration || '') }));
  const body = h('div', { class: 'vn-col' }, boxes.map(({ s, ta }, i) => h('label', { class: 'vn-col' }, h('span', { class: 'vn-lab' }, `Scene ${i + 1}`), ta)));
  const d = dialog({ title: 'Change the words', sub: 'What the voice says in each scene. The voice is made again if it was made by AI.', body, wide: true, foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
    d.remove(); await save({ scenes: p.scenes.map((s, i) => ({ ...s, narration: boxes[i].ta.value.trim() })) });
    if (p.vnew?.voiceLines && D.voices) { try { PV = await api(`/api/builder/projects/${p.id}/voice-from-script`, { method: 'POST', timeoutMs: 240000, body: { voiceId: p.vnew.voiceId } }); setCredits(PV.balance); } catch (e) { errToast(e); } }
    else if (PV.project.captions?.length || PV.project.vnew?.captions) PV = await captionsFromNarration(p.id);
    drawProject('');
  } }, 'Save words')] });
}

// The preview: each scene's clip, or its picture while the clip is made, with the voice, music and captions on top.
function player() {
  const p = PV.project; const rows = PV.timeline; const total = PV.seconds || 1;
  const stage = h('div', { class: 'vn-player r' + (p.ratio || '16:9').replace(':', 'x') });
  const img = h('img', { alt: '' }); const vid = h('video', { muted: true, playsinline: true, preload: 'auto' });
  const cap = h('div', { class: 'vn-cap' }); const tag = h('span', { class: 'vn-ptag' }, 'Preview');
  const bar = h('i'); const time = h('span', { class: 'vn-time' }, `0:00 / ${clock(total)}`);
  const voice = p.voice && fileOf(p.voice.fileId) ? new Audio(fileOf(p.voice.fileId).url) : null;
  const musicUrl = p.music && (fileOf(p.music.fileId)?.url || D.tracks.find((t) => t.id === p.music.trackId)?.audio); const music = musicUrl ? new Audio(musicUrl) : null; if (music) music.volume = (p.music.volume ?? 0.5) * (voice ? 0.6 : 1);
  let t = 0, playing = false, last = 0, raf = 0, cur = -1;
  const btn = h('button', { class: 'btn sm', onclick: () => (playing ? pause() : play()) }, icon('play'), 'Play');
  const show = (time) => {
    const i = Math.max(0, rows.findIndex((r) => time >= r.start && time < r.start + r.seconds)); const r = rows[i] || rows[0]; if (!r) return;
    const s = p.scenes.find((x) => x.id === r.id); const m = sceneMedia(s);
    if (i !== cur) { cur = i; tag.textContent = m?.kind === 'video' && s.type === 'ai' ? 'Scene ' + (i + 1) : s.type === 'ai' ? `Scene ${i + 1}, picture` : 'Scene ' + (i + 1);
      if (m?.kind === 'video') { img.hidden = true; vid.hidden = false; if (vid.getAttribute('src') !== m.url) { vid.src = m.url; } vid.currentTime = Math.max(0, time - r.start); if (playing) vid.play().catch(() => {}); }
      else { vid.hidden = true; vid.pause(); img.hidden = !m; if (m) img.src = m.url; } }
    const c = (p.captions || []).find((x) => time >= x.start && time < x.end && !x.pos); cap.textContent = c ? c.text : (!p.captions?.length && s?.narration ? '' : '');
    cap.hidden = !cap.textContent; bar.style.width = Math.min(100, (time / total) * 100) + '%'; time_(time);
  };
  const time_ = (x) => { time.textContent = `${clock(x)} / ${clock(total)}`; };
  const tick = (now) => { if (!playing) return; t += (now - last) / 1000; last = now; if (t >= total) { pause(); t = 0; show(0); return; } show(t); raf = requestAnimationFrame(tick); };
  function play() { playing = true; last = performance.now(); btn.replaceChildren(icon('pause'), 'Pause'); [voice, music].forEach((a) => { if (a) { a.currentTime = t; a.play().catch(() => {}); } }); cur = -1; show(t); raf = requestAnimationFrame(tick); }
  function pause() { playing = false; cancelAnimationFrame(raf); btn.replaceChildren(icon('play'), 'Play'); vid.pause(); voice?.pause(); music?.pause(); }
  const track = h('div', { class: 'vn-seek', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); t = ((e.clientX - r.left) / r.width) * total; cur = -1; [voice, music].forEach((a) => { if (a) a.currentTime = t; }); show(t); } }, bar);
  stage.append(img, vid, tag, cap, h('div', { class: 'vn-pctl' }, btn, track, time));
  const obs = new MutationObserver(() => { if (!stage.isConnected) { pause(); obs.disconnect(); } }); setTimeout(() => obs.observe(document.getElementById('main'), { childList: true, subtree: true }), 0);
  setTimeout(() => show(0), 0);
  return stage;
}

// ---------- sizes, export and download ----------
function sizesRow(ex) {
  const p = PV.project; const sizes = p.vnew?.sizes || [SHAPE_OF[p.ratio]];
  const box = h('div', { class: 'vn-sizes', id: 'vn-sizes' });
  const working = ex?.status === 'working';
  const frames = sizes.map((s) => { const [w, hh] = { '9x16': [54, 96], '1x1': [76, 76], '16x9': [120, 68], '4x5': [64, 80], '2x3': [60, 90] }[s]; return h('div', { class: 'vn-size' }, h('span', { class: 'vn-frame', style: { width: w + 'px', height: hh + 'px' } }), h('small', {}, SIZES.find((x) => x[0] === s)[1])); });
  box.append(...frames, h('div', { class: 'vn-col' },
    h('div', { class: 'vn-row wrap' }, h('button', { class: 'btn primary', id: 'vn-dlall', disabled: working, onclick: () => exportAll() }, working ? h('span', { class: 'spin' }) : icon('dl'), working ? 'Exporting…' : ex?.status === 'done' ? 'Download all' : 'Export and download'), h('button', { class: 'btn', onclick: () => shareLink() }, icon('link'), 'Share link')),
    h('div', { class: 'vn-row wrap' }, h('button', { class: 'btn sm', onclick: () => sizesDialog() }, 'Add another size'), h('button', { class: 'btn sm', onclick: () => { const e2 = (p.exports || []).find((x) => x.status === 'done'); if (!e2) return toast('Export first, then drag and crop.'); openCrop(e2.fileId); } }, icon('crop'), 'Drag and crop')),
    ex?.status === 'failed' && h('small', { class: 'err' }, ex.error || 'The export failed. Please try again.')));
  return box;
}
// Export once in the shape the scenes were made in, then every other size from it (fit with a soft blurred edge).
async function exportAll() {
  const p = PV.project;
  if (!p.scenes.every(made)) { const n = p.scenes.filter((s) => !made(s)).length; return toast(`${n} scene${n > 1 ? 's are' : ' is'} not made yet. Make ${n > 1 ? 'them' : 'it'} first.`, 'error'); }
  try {
    let ex = (p.exports || [])[0];
    const fresh = ex?.status === 'done' && ex.endedAt && Date.parse(ex.endedAt) >= Date.parse(p.updatedAt) - 1500;
    if (!fresh) {
      const r = await api(`/api/builder/projects/${p.id}/export`, { method: 'POST', body: { idem: idem(), resolution: p.resolution, burnCaptions: !!p.captions?.length } });
      PV = r; drawProject(''); toast('Exporting. This takes about a minute.');
      for (let i = 0; i < 400; i++) { await new Promise((res) => setTimeout(res, 3000)); PV = await api('/api/builder/projects/' + p.id); ex = PV.project.exports[0]; if (ex.status !== 'working') break; }
      drawProject('');
      if (ex.status !== 'done') return toast(ex.error || 'The export did not finish. Please try again.', 'error');
    }
    const sizes = PV.project.vnew?.sizes || [SHAPE_OF[p.ratio]]; const main = SHAPE_OF[PV.project.ratio];
    downloadFiles([ex.fileId]);
    for (const s of sizes.filter((x) => x !== main)) cropTo(ex.fileId, s);
  } catch (e) { errToast(e); }
}
async function cropTo(fileId, shape) {
  const body = { preset: PRESET_OF[shape], shape, mode: 'fit' };
  try {
    let r = await api(`/api/media/${fileId}/crop`, { method: 'POST', body });
    if (r.job) { toast(`Making the ${SIZES.find((x) => x[0] === shape)[1]} size…`); for (let i = 0; i < 300; i++) { await new Promise((res) => setTimeout(res, 2500)); const { job } = await api('/api/jobs/' + r.job.id); if (job.status === 'done') break; if (['failed', 'cancelled'].includes(job.status)) throw new Error(job.error || 'That size could not be made.'); } r = await api(`/api/media/${fileId}/crop`, { method: 'POST', body }); }
    if (r.url) { const a = h('a', { href: r.url, download: r.name || '', hidden: true }); document.body.append(a); a.click(); setTimeout(() => a.remove(), 2000); }
  } catch (e) { errToast(e); }
}
async function shareLink() {
  const ex = (PV.project.exports || []).find((e) => e.status === 'done'); if (!ex) return toast('Export the video first, then share it.');
  try {
    const r = await api(`/api/media/${ex.fileId}/crop`, { method: 'POST', body: { preset: PRESET_OF[SHAPE_OF[PV.project.ratio]], shape: SHAPE_OF[PV.project.ratio], mode: 'fit' } });
    if (r.job) return toast('Preparing the link. Press Share link again in a moment.');
    const url = new URL(r.url, location.href).href;
    if (navigator.share) { await navigator.share({ title: PV.project.title, url }).catch(() => {}); } else { await navigator.clipboard.writeText(url); toast(`Link copied. It works for ${Math.round((r.expiresIn || 3600) / 3600)} hours.`); }
  } catch (e) { errToast(e); }
}

// ---------- J6: edit one scene ----------
function drawScene(main, sid) {
  const p = PV.project; const i = p.scenes.findIndex((s) => s.id === sid); const s = p.scenes[i]; const m = sceneMedia(s);
  const list = h('div', { class: 'vn-col vn-slist' }, h('div', { class: 'vn-row' }, h('h2', {}, 'Scenes'), h('div', { class: 'grow' }), h('button', { class: 'btn sm', onclick: addAiScene }, icon('plus'), 'Add')),
    p.scenes.map((x, j) => { const mm = sceneMedia(x); return h('a', { class: 'vn-srow' + (x.id === sid ? ' on' : ''), href: `#/vnew/v/${p.id}/s/${x.id}` }, h('span', { class: 'vn-ph xs' }, mm?.poster || mm?.kind === 'image' ? h('img', { src: mm.poster || mm.url, alt: '' }) : null, h('span', { class: 'n' }, j + 1)), h('span', { class: 'grow' }, h('b', {}, sceneName(x, j)), h('small', { class: 'el' }, x.narration || x.prompt || 'Your ' + x.type)), h('span', { class: 'vn-st ' + (x.id === sid ? 'on' : '') }, x.id === sid ? 'Editing' : made(x) ? 'Kept' : 'Waiting')); }),
    h('p', { class: 'mut sm' }, 'The other scenes are not touched and not charged again.'));
  const versions = s.type === 'ai' && s.versions?.length ? h('div', { class: 'vn-vers' }, h('span', { class: 'vn-lab' }, 'Versions'), s.versions.map((v, k) => h('button', { class: 'vn-chip sm' + ((s.cur ?? s.versions.length - 1) === k ? ' on' : ''), onclick: async () => { await save({ scenes: p.scenes.map((x) => (x.id === sid ? { ...x, cur: k } : x)) }); drawProject(sid); } }, `${k + 1}`)), h('small', { class: 'mut' }, 'The old one is kept. Switch back any time, free.')) : null;
  const center = h('div', { class: 'vn-col vn-scenter' },
    h('div', { class: 'vn-row' }, h('h2', {}, sceneName(s, i) === `Scene ${i + 1}` ? `Scene ${i + 1}` : `Scene ${i + 1}, ${sceneName(s, i)}`), h('span', { class: 'vn-chip' }, `${Math.round(s.duration || PV.timeline[i]?.seconds || 0)} s`), h('div', { class: 'grow' }), h('a', { class: 'btn sm', href: i > 0 ? `#/vnew/v/${p.id}/s/${p.scenes[i - 1].id}` : null, 'aria-disabled': String(i === 0) }, 'Previous'), h('a', { class: 'btn sm', href: i < p.scenes.length - 1 ? `#/vnew/v/${p.id}/s/${p.scenes[i + 1].id}` : null }, 'Next')),
    h('div', { class: 'vn-sview r' + p.ratio.replace(':', 'x') }, m?.kind === 'video' ? h('video', { src: m.url, poster: m.poster, controls: true, playsinline: true }) : m ? h('img', { src: m.url, alt: '' }) : h('span', { class: 'mut' }, 'No picture yet'), s.status === 'generating' && h('span', { class: 'vn-ptag' }, h('span', { class: 'spin' }), ' New version, making')),
    versions, h('span', { class: 'vn-lab' }, 'Video Agent'), askBox(`Change this scene in words, for example: make it a close up with steam behind`));
  // The ask box above talks about this scene only.
  const sendAsk = center.querySelector('.vn-ask .btn.primary'); const taAsk = center.querySelector('.vn-ask textarea');
  sendAsk.onclick = async (e) => { e.stopImmediatePropagation(); const t = taAsk.value.trim(); if (!t) return; sendAsk.disabled = true; await askAgent(`In scene ${i + 1} only: ${t}. Keep every other scene exactly as it is.`); };
  const right = h('div', { class: 'vn-col vn-sright' }); let tab = 'scene';
  const tabs = h('div', { class: 'vn-dtabs' });
  const drawRight = () => { tabs.replaceChildren(...[['scene', 'Scene'], ['voice', 'Voice'], ['effects', 'Effects'], ['text', 'Text']].map(([id, l]) => h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; drawRight(); } }, l))); right.replaceChildren(tabs, ...sceneTab(tab, s, i)); };
  drawRight();
  main.replaceChildren(h('div', { class: 'vn-scene' }, list, center, right));
}
function sceneTab(tab, s, i) {
  const p = PV.project; const upd = async (patch, redraw = true) => { await save({ scenes: p.scenes.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) }); if (redraw) drawProject(s.id); };
  const model = modelById(s.modelId || p.modelId);
  const foot = h('div', { class: 'vn-col vn-sfoot' },
    h('div', { class: 'vn-row wrap' }, h('a', { class: 'btn sm', href: '#/builder/' + p.id, title: 'Trim and split in the Timeline' }, icon('cut'), 'Trim'), h('a', { class: 'btn sm', href: '#/builder/' + p.id }, 'Split'),
      h('button', { class: 'btn sm', onclick: async () => { const copy = { ...s, id: undefined, copyOf: s.id }; const scenes = [...p.scenes]; scenes.splice(i + 1, 0, copy); await save({ scenes }); drawProject(PV.project.scenes[i + 1]?.id || s.id); } }, icon('copy'), 'Duplicate'),
      h('button', { class: 'btn sm danger', onclick: async () => { if (!confirm('Delete this scene? A made scene can be brought back from Undo in the Timeline.')) return; await save({ scenes: p.scenes.filter((x) => x.id !== s.id) }); location.hash = '#/vnew/v/' + p.id; } }, icon('trash'), 'Delete')),
    s.type === 'ai' && h('button', { class: 'btn primary block', id: 'vn-redo', disabled: s.status === 'generating', onclick: () => generate([s.id]) }, s.status === 'generating' ? 'Making…' : `${s.versions?.length ? 'Redo this scene only' : 'Make this scene'}, about ${fmtCredits(costOf(s))} credits`));
  if (tab === 'scene') {
    if (s.type !== 'ai') return [sec('This scene', h('p', { class: 'vn-note' }, `Your own ${s.type}. It is free and is used as it is.`), s.type === 'image' && h('label', { class: 'vn-col' }, h('span', { class: 'vn-lab' }, 'Seconds on screen'), h('input', { class: 'vn-input', type: 'number', min: 0.5, max: 60, step: 0.5, value: s.duration, onchange: (e) => upd({ duration: Number(e.target.value) }) }))), foot];
    const ta = h('textarea', { class: 'vn-ta', rows: 4, maxlength: 4000, onchange: (e) => upd({ prompt: e.target.value }, false) }, s.prompt);
    const chars = D.chars;
    return [sec('What happens', ta),
      sec('Use my own', h('div', { class: 'vn-row wrap' },
        h('button', { class: 'btn sm', onclick: () => pickFiles('image/*', false, async (picked) => { const fd = new FormData(); fd.append('files', picked[0]); try { const r = await api('/api/files', { method: 'POST', body: fd }); if (r.files[0]) upd({ refFileId: r.files[0].id, continuity: false }); } catch (e) { errToast(e); } }, { title: 'Start picture for this scene' }) }, icon('image'), '+ Photo'),
        h('button', { class: 'btn sm', onclick: () => pickFiles('video/*,.mp4,.mov,.webm', false, async (picked) => { const fd = new FormData(); fd.append('files', picked[0]); try { const r = await api('/api/files', { method: 'POST', body: fd }); if (!r.files[0]) return; PV = await api(`/api/builder/projects/${p.id}/add`, { method: 'POST', body: { fileIds: [r.files[0].id], at: i } }); const keep = PV.project.scenes.filter((x) => x.id !== s.id); await save({ scenes: keep }); drawProject(PV.project.scenes[i]?.id || ''); } catch (e) { errToast(e); } }, { title: 'A video to use instead of this AI scene' }) }, icon('video'), '+ Video instead'),
        s.refFileId && h('button', { class: 'btn sm', onclick: () => upd({ refFileId: null }) }, icon('x'), 'Remove photo'))),
      sec('In this scene', h('div', { class: 'vn-row wrap' }, chars.length ? chars.map((c) => h('button', { class: 'vn-chip sm', title: 'Use this character\'s photo as the start picture', onclick: () => c.fileIds?.[0] && upd({ refFileId: c.sheetId || c.fileIds[0], continuity: false, ...(c.kind === 'person' && best() ? { modelId: best().id } : {}) }) }, c.name)) : h('a', { class: 'vn-link', href: '#/characters' }, '+ Character'))),
      sec('Camera, needs a new clip', h('div', { class: 'vn-cops' }, CAMERAS.slice(1).map(([id, l, words]) => h('button', { class: 'vn-chip sm' + (s.prompt.includes(words) ? ' on' : ''), onclick: () => { const base = CAMERAS.reduce((a, c) => (c[2] ? a.replace(' ' + c[2], '').replace(c[2], '') : a), s.prompt).trim(); upd({ prompt: `${base} ${words}` }); } }, l)))),
      sec('Model', h('select', { class: 'vn-select', onchange: (e) => upd({ modelId: e.target.value || undefined }) }, h('option', { value: '' }, `Same as the video (${modelById(p.modelId)?.name || 'Auto'})`), createModels().map((x) => h('option', { value: x.id, selected: s.modelId === x.id }, `${x.name}, ${fmtCredits(perSec(x, p.resolution))}/s`)))),
      sec('Length', h('div', { class: 'vn-cops' }, ((model?.video?.durations || [5, 10]).filter((d) => d > 0)).map((d) => h('button', { class: 'vn-chip sm' + (Math.round(s.duration) === d ? ' on' : ''), onclick: () => upd({ duration: d }) }, `${d} s`)))),
      h('label', { class: 'vn-check' }, h('input', { type: 'checkbox', checked: !!s.continuity, onchange: (e) => upd({ continuity: e.target.checked }) }), 'Start from the last picture of the scene before'),
      foot];
  }
  if (tab === 'voice') {
    const line = p.vnew?.voiceLines?.[s.id]; const ta = h('textarea', { class: 'vn-ta', rows: 3, maxlength: 600 }, s.narration || '');
    return [sec('Voice line', ta, h('div', { class: 'vn-row wrap' },
      line && h('button', { class: 'btn sm', onclick: (e) => playUrl(fileOf(line.fileId)?.url || `/api/files/${line.fileId}/raw`, e.currentTarget) }, icon('play'), 'Play'),
      h('button', { class: 'btn sm primary', onclick: async () => { await upd({ narration: ta.value.trim() }, false); if (p.vnew?.voiceLines && D.voices) { try { PV = await api(`/api/builder/projects/${p.id}/voice-from-script`, { method: 'POST', timeoutMs: 240000, body: { voiceId: p.vnew.voiceId } }); setCredits(PV.balance); } catch (e) { errToast(e); } } else if (PV.project.captions?.length) PV = await captionsFromNarration(p.id); drawProject(s.id); } }, D.voices && p.vnew?.voiceLines ? 'Save and remake the voice' : 'Save words'))),
      sec('Voice of the video', h('button', { class: 'btn sm', onclick: voiceFix }, icon('mic'), 'Change voice')), foot];
  }
  if (tab === 'effects') {
    return [sec('Look, free', h('div', { class: 'vn-cops' }, LOOKS.map(([id, l]) => h('button', { class: 'vn-chip sm' + ((p.vnew?.look || 'auto') === id ? ' on' : ''), onclick: async () => { await save({ vnew: { look: id } }); drawProject(s.id); } }, l))), h('p', { class: 'vn-note' }, 'The look is for the whole video and is added at export.')),
      sec('To the next scene, free', h('div', { class: 'vn-cops' }, BETWEEN.slice(1).map(([id, l]) => h('button', { class: 'vn-chip sm' + (s.transition === id ? ' on' : ''), onclick: () => upd({ transition: id }) }, l)))),
      s.type === 'ai' && sec('Camera, needs a new clip', h('div', { class: 'vn-cops' }, CAMERAS.slice(1).map(([id, l, words]) => h('button', { class: 'vn-chip sm' + (s.prompt.includes(words) ? ' on' : ''), onclick: () => { const base = CAMERAS.reduce((a, c) => (c[2] ? a.replace(' ' + c[2], '').replace(c[2], '') : a), s.prompt).trim(); upd({ prompt: `${base} ${words}` }); } }, l)))), foot];
  }
  // text: a title in the middle of this scene, and the caption that sits under it
  const row = PV.timeline[i]; const title = (p.captions || []).find((c) => c.pos === 'middle' && row && c.start >= row.start - 0.01 && c.start < row.start + row.seconds);
  const ta = h('input', { class: 'vn-input', maxlength: 120, value: title?.text || '', placeholder: 'For example: 30% off this week' });
  return [sec('Text on screen', ta, h('button', { class: 'btn sm primary', onclick: async () => { const caps = (p.captions || []).filter((c) => c !== title); if (ta.value.trim() && row) caps.push({ start: row.start, end: row.start + row.seconds, text: ta.value.trim(), pos: 'middle' }); await save({ captions: caps }); toast('Saved. Text shows in the exported video.'); drawProject(s.id); } }, 'Save text')),
    h('p', { class: 'vn-note' }, 'Spoken captions follow the voice lines. Change their style with Captions style on the video page.'), foot];
}

// ---------- Q3: build it myself, scene by scene ----------
function drawBuild(main) {
  const p = PV.project; const ai = p.scenes.filter((s) => s.type === 'ai' && !s.versions?.length);
  const addFiles = (accept, title) => pickFiles(accept, true, async (picked) => { const fd = new FormData(); picked.forEach((x) => fd.append('files', x)); try { const r = await api('/api/files?audio=1', { method: 'POST', body: fd }); (r.errors || []).forEach((m) => toast(m, 'error')); PV = await api(`/api/builder/projects/${p.id}/add`, { method: 'POST', body: { fileIds: r.files.map((x) => x.id) } }); (PV.notes || []).forEach((n) => toast(n)); drawProject(''); } catch (e) { errToast(e); } }, { title });
  const opts = [['AI scene from a prompt', 'sparkle', addAiScene], ['Upload a video', 'video', () => addFiles('video/*,.mp4,.mov,.webm', 'Videos')], ['Upload a photo', 'image', () => addFiles('image/*', 'Photos')], ['From my assets', 'folder', () => addFiles('image/*,video/*,.mp4,.mov,.webm', 'From my assets')], avatarModel() && ['Talking photo', 'face', talkingDialog], ['Text card', 'type', textCard]].filter(Boolean);
  const rows = p.scenes.map((s, i) => { const m = sceneMedia(s); const st = s.type !== 'ai' ? 'Yours' : s.versions?.length ? 'Ready' : s.status === 'generating' ? 'Making' : 'Not made';
    return h('div', { class: 'vn-mrow' }, h('span', { class: 'vn-ph sm' }, m?.poster || m?.kind === 'image' ? h('img', { src: m.poster || m.url, alt: '' }) : null, h('span', { class: 'n' }, i + 1)), h('span', { class: 'grow' }, h('b', {}, s.type === 'ai' ? 'AI scene' : s.type === 'video' ? 'My video' : 'Picture'), h('small', { class: 'el' }, s.prompt || fileOf(s.fileId)?.name || '')), h('span', { class: 'vn-st ' + st.toLowerCase().replace(' ', '') }, st), h('a', { class: 'btn sm', href: `#/vnew/v/${p.id}/s/${s.id}` }, 'Edit')); });
  const est = ai.reduce((a, s) => a + costOf(s), 0);
  main.replaceChildren(h('div', { class: 'vn-build' },
    h('div', { class: 'vn-row' }, h('div', {}, h('h2', {}, 'Build it myself'), h('p', { class: 'mut sm' }, 'You add each scene. Nothing is planned or made for you unless you ask.')), h('div', { class: 'grow' }), h('button', { class: 'btn', onclick: () => askText('Call the agent in', 'For example: write three more scenes that end on my logo', (t) => askAgent(t)) }, icon('sparkle'), 'Call the agent in')),
    h('div', { class: 'vn-card' }, rows.length ? rows : h('p', { class: 'mut' }, 'No scenes yet. Add the first one below.'),
      h('div', { class: 'vn-addrow' }, h('span', { class: 'vn-lab' }, '+ Add a scene'), opts.map(([l, ic, fn]) => h('button', { class: 'btn sm', 'data-add': l, onclick: fn }, icon(ic), l)))),
    h('div', { class: 'vn-card' }, h('span', { class: 'vn-lab' }, 'For the whole video'), settingsList()),
    h('div', { class: 'vn-card vn-row wrap' }, h('span', { class: 'grow mut sm' }, 'Only AI scenes cost credits. Your own clips, cuts, music and captions are free.'),
      ai.length > 0 && h('button', { class: 'btn primary', id: 'vn-make', onclick: () => generate(null) }, `Make the ${ai.length} AI scene${ai.length > 1 ? 's' : ''}, about ${fmtCredits(est)}`),
      p.scenes.length > 0 && h('button', { class: 'btn', onclick: () => exportAll() }, icon('dl'), 'Export'),
      p.scenes.length > 0 && p.scenes.every(made) && h('button', { class: 'btn', onclick: async () => { await save({ vnew: { mode: 'agent' } }); drawProject(''); } }, 'See it with the preview'))));
}
// A talking photo: a face photo plus a voice clip or typed words, made with OmniHuman, then added as a scene.
function talkingDialog() {
  const st = { photo: null, voice: null };
  const ta = h('textarea', { class: 'vn-ta', rows: 3, placeholder: 'What the person says (read by an AI voice). Or add a voice clip instead.' });
  const row = h('div', { class: 'vn-row wrap' });
  const pick = (k, accept, label) => h('button', { class: 'btn sm', onclick: () => pickFiles(accept, false, async (picked) => { const fd = new FormData(); fd.append('files', picked[0]); try { const r = await api('/api/files?audio=1', { method: 'POST', body: fd }); st[k] = r.files[0] ? { id: r.files[0].id, name: picked[0].name } : null; draw(); } catch (e) { errToast(e); } }, { title: label }) }, st[k] ? icon('check') : icon('plus'), st[k] ? st[k].name : label);
  const draw = () => row.replaceChildren(pick('photo', 'image/*', 'Face photo'), pick('voice', 'audio/*,.mp3,.wav,.m4a', 'Voice clip'), ...D.chars.filter((c) => c.kind === 'person').map((c) => h('button', { class: 'vn-chip sm', onclick: () => { st.photo = { id: c.fileIds[0], name: c.name }; draw(); } }, c.name)));
  draw();
  const go = h('button', { class: 'btn primary', onclick: async () => {
    if (!st.photo) return toast('Add a face photo first.', 'error'); if (!st.voice && !ta.value.trim()) return toast('Type what they say, or add a voice clip.', 'error');
    go.disabled = true; go.replaceChildren(h('span', { class: 'spin' }), 'Making the talking photo…');
    try {
      const r = await api('/api/generate', { method: 'POST', timeoutMs: 200000, body: { idem: idem(), mode: 'video', model: avatarModel().id, prompt: ta.value.trim(), fileIds: [st.photo.id, st.voice?.id].filter(Boolean), params: {}, origin: 'vnew' } });
      setCredits(r.credits); const g = await waitGen(r.generation, go);
      const fr = await api(`/api/media/${g.media[0].id}/as-file`, { method: 'POST', body: { name: 'Talking photo.mp4' } });
      PV = await api(`/api/builder/projects/${PV.project.id}/add`, { method: 'POST', body: { fileIds: [fr.file.id] } });
      d.remove(); drawProject('');
    } catch (e) { errToast(e); go.disabled = false; go.replaceChildren('Make it talk'); }
  } }, 'Make it talk');
  const d = dialog({ title: 'Talking photo', sub: 'A photo of a person that speaks your words, made with OmniHuman. It is as long as the voice.', body: h('div', { class: 'vn-col' }, row, ta), foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Cancel'), go] });
}
// A text card: drawn in the browser as a picture in the video's shape, then added as a scene. Free.
function textCard() {
  const inp = h('input', { class: 'vn-input', maxlength: 80, placeholder: 'For example: Grand opening, Saturday 9 am' });
  const bgc = h('input', { type: 'color', value: '#101530' }); const fg = h('input', { type: 'color', value: '#ffffff' });
  const d = dialog({ title: 'Text card', sub: 'A plain card with your words, in the shape of the video. Free.', body: h('div', { class: 'vn-col' }, inp, h('div', { class: 'vn-row' }, h('label', { class: 'vn-check' }, bgc, 'Background'), h('label', { class: 'vn-check' }, fg, 'Text'))), foot: [h('button', { class: 'btn', onclick: () => d.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
    const t = inp.value.trim(); if (!t) return inp.focus();
    const [a, b] = PV.project.ratio.split(':').map(Number); const W = a >= b ? 1280 : Math.round(1280 * a / b), H = a >= b ? Math.round(1280 * b / a) : 1280;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = bgc.value; x.fillRect(0, 0, W, H); x.fillStyle = fg.value; x.textAlign = 'center'; x.textBaseline = 'middle';
    let size = Math.round(Math.min(W, H) / 9); x.font = `700 ${size}px Inter, system-ui, sans-serif`; while (x.measureText(t).width > W * 0.86 && size > 18) { size -= 4; x.font = `700 ${size}px Inter, system-ui, sans-serif`; }
    x.fillText(t, W / 2, H / 2);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const fd = new FormData(); fd.append('files', new File([blob], 'Text card.png', { type: 'image/png' }));
    try { const r = await api('/api/files', { method: 'POST', body: fd }); PV = await api(`/api/builder/projects/${PV.project.id}/add`, { method: 'POST', body: { fileIds: [r.files[0].id] } }); d.remove(); drawProject(''); } catch (e) { errToast(e); }
  } }, 'Add card')] });
  setTimeout(() => inp.focus(), 30);
}

// ======================================================================
// The other tabs: My videos, Characters, Voices, Music, Skills and effects
// ======================================================================
async function drawVideos(body) {
  body.replaceChildren(h('div', { class: 'vn-wrap wide' }, h('h1', { class: 'vn-h1 left' }, 'My videos'), h('div', { class: 'spin' })));
  let list = []; try { list = (await api('/api/builder/projects')).projects; } catch (e) { return body.replaceChildren(h('div', { class: 'err' }, e.message)); }
  body.replaceChildren(h('div', { class: 'vn-wrap wide' }, h('div', { class: 'vn-row' }, h('h1', { class: 'vn-h1 left' }, 'My videos'), h('div', { class: 'grow' }), h('a', { class: 'btn primary', href: '#/vnew' }, icon('plus'), 'New video')),
    list.length ? h('div', { class: 'vn-cards' }, list.map((p) => h('a', { class: 'vn-vcard', href: '#/vnew/v/' + p.id, 'data-project': p.id }, h('span', { class: 'vn-ph' }, p.poster ? h('img', { src: p.poster, alt: '' }) : icon('film')), h('b', { class: 'el' }, p.title), h('small', {}, `${p.scenes} scenes · ${clock(p.seconds || 0)} · ${p.ratio}${p.exports ? ' · exported' : ''}`), h('small', { class: 'mut' }, { agent: 'Made with the agent', pro: 'From Studio Pro', builder: 'Built by hand' }[p.origin] || '')))) : h('p', { class: 'mut' }, 'No videos yet. Make one from Create.')));
}
function drawCharacters(body) {
  body.replaceChildren(h('div', { class: 'vn-wrap wide' }, h('div', { class: 'vn-row' }, h('h1', { class: 'vn-h1 left' }, 'Characters'), h('div', { class: 'grow' }), h('a', { class: 'btn primary', href: '#/characters' }, icon('plus'), 'New character')),
    h('p', { class: 'mut' }, 'Pick characters with the Character chip when you create a video. The same face and product stay in every scene.'),
    D.chars.length ? h('div', { class: 'vn-cards' }, D.chars.map((c) => h('div', { class: 'vn-vcard' }, h('span', { class: 'vn-ph' }, c.photos?.[0] ? h('img', { src: c.photos[0], alt: '' }) : icon('face')), h('b', {}, c.name), h('small', {}, `${c.kind}, ${(c.fileIds || []).length} photos`),
      h('button', { class: 'btn sm', onclick: () => { loadSet(); SET.chars = SET.chars.includes(c.id) ? SET.chars : [...SET.chars, c.id].slice(0, 4); keepSet(); toast(`${c.name} will be in your next video.`); location.hash = '#/vnew'; } }, 'Use in a video')))) : h('p', { class: 'mut' }, 'No characters yet.'),
    h('a', { class: 'vn-link', href: '#/characters' }, 'Open the full Characters page')));
}
function drawVoices(body) {
  const vs = D.voices;
  body.replaceChildren(h('div', { class: 'vn-wrap wide' }, h('div', { class: 'vn-row' }, h('h1', { class: 'vn-h1 left' }, 'Voices'), h('div', { class: 'grow' }), f().aiVoice && h('a', { class: 'btn', href: '#/voice' }, icon('mic'), 'AI Voice page')),
    vs ? h('div', { class: 'vn-card' }, h('p', { class: 'mut' }, 'Tap a voice to use it in your next video. Press play to hear it.'), voiceList({ value: SET.voice?.voiceId || vs.defaultVoice, speed: 1, onPick: (x) => { SET.voice = { kind: 'ai', voiceId: x.id }; keepSet(); toast(`${x.name} will read your next video.`); }, onSpeed: () => {} }))
      : h('div', { class: 'vn-card' }, h('p', {}, 'AI voices switch on as soon as the voice service key is added. Until then, use your own voice: upload or pick a voice clip with the Voice chip.')),
    h('div', { class: 'vn-card' }, h('b', {}, 'Your own voice'), h('p', { class: 'mut sm' }, 'Upload a clip, or pick one from your assets, with the Voice chip on Create. An uploaded clip is used as it is and the scenes are cut to it.'))));
}
function drawMusic(body) {
  body.replaceChildren(h('div', { class: 'vn-wrap wide' }, h('h1', { class: 'vn-h1 left' }, 'Music'), h('p', { class: 'mut' }, 'Tracks in the music library. Tap one to use it in your next video, or upload your own track with the Music chip.'),
    D.tracks.length ? h('div', { class: 'vn-col' }, D.tracks.map((t) => h('div', { class: 'vn-lrow' }, h('button', { class: 'icon-btn sm', title: 'Play', onclick: (e) => playUrl(t.audio, e.currentTarget) }, icon('play')), h('span', { class: 'grow' }, h('b', {}, t.title), h('small', {}, `${t.mood}${t.genre ? ', ' + t.genre : ''}${t.duration ? ', ' + clock(t.duration) : ''}`)), h('button', { class: 'btn sm' + (SET.music?.trackId === t.id ? ' primary' : ''), onclick: () => { SET.music = { kind: 'track', trackId: t.id }; keepSet(); drawMusic(body); } }, SET.music?.trackId === t.id ? 'Chosen' : 'Use')))) : h('p', { class: 'mut' }, 'The music library is empty or switched off.'),
    S.user.isAdmin && h('a', { class: 'vn-link', href: '#/builder/music' }, 'Manage the music library (admin)')));
}
function drawSkills(body) {
  const A = D.agent;
  body.replaceChildren(h('div', { class: 'vn-wrap wide' }, h('h1', { class: 'vn-h1 left' }, 'Skills and effects'),
    h('h2', { class: 'vn-h2' }, 'Skills: how the agent writes and shoots'), h('div', { class: 'vn-cards' }, (A?.tabs || []).map((t) => h('div', { class: 'vn-vcard' }, h('b', {}, t.label), h('small', { class: 'mut' }, t.placeholder || ''), h('button', { class: 'btn sm', onclick: () => { SET.skill = t.id; keepSet(); location.hash = '#/vnew'; } }, 'Use')))),
    h('h2', { class: 'vn-h2' }, `Recipes (${A?.templates?.length || 0})`), h('div', { class: 'vn-cards' }, (A?.templates || []).map((t) => h('div', { class: 'vn-vcard' }, h('b', {}, t.title), h('small', { class: 'mut' }, t.blurb), h('small', {}, `${fmtLen(t.seconds)} · ${t.ratio}`)))),
    h('h2', { class: 'vn-h2' }, 'Camera moves'), h('div', { class: 'vn-cops' }, CAMERAS.slice(1).map(([id, l, w]) => h('span', { class: 'vn-chip', title: w }, l))),
    h('h2', { class: 'vn-h2' }, 'Looks, free at export'), h('div', { class: 'vn-cops' }, LOOKS.slice(1).map(([, l]) => h('span', { class: 'vn-chip' }, l))),
    h('h2', { class: 'vn-h2' }, 'Between scenes, free'), h('div', { class: 'vn-cops' }, BETWEEN.slice(1).map(([, l]) => h('span', { class: 'vn-chip' }, l))),
    h('h2', { class: 'vn-h2' }, 'The other video tools'), h('div', { class: 'vn-cards' }, [['Video Studio', 'One clip at a time, every model and setting', '#/video'], f().videoAgent && ['Video Agent (classic)', 'The original agent page', '#/agent'], ['Video Builder', 'The full timeline editor', '#/builder'], f().studioPro && ['Studio Pro', 'Guided picture and video studio', '#/pro'], f().studioPro && ['Ad Studio', 'Brand kit from a website, then ads in every size', '#/ads'], f().aiVoice && ['AI Voice', 'Type a script, get a voice-over', '#/voice']].filter(Boolean).map(([a, b, href]) => h('a', { class: 'vn-vcard', href }, h('b', {}, a), h('small', { class: 'mut' }, b))))));
}
