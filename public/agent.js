// Video Agent: one prompt becomes a storyboard that opens in the Video Builder. Nothing is generated until it is approved there.
import { h, $, $$, icon, S, store, api, toast, errToast, info, topbar, fmtCredits, setCredits, popover, closePop, pickFiles } from './app.js';

if (!$('#vb-css')) document.head.append(h('link', { id: 'vb-css', rel: 'stylesheet', href: '/builder.css' }));
let INFO = null;
const TPL_ICON = { product: 'bag', ugc: 'user', explainer: 'brain', music: 'audio', story: 'star', general: 'film' };
const fmtLen = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);

export async function renderAgent() {
  try { INFO = INFO || await api('/api/agent/info'); } catch (e) { $('#main').replaceChildren(topbar(), h('div', { class: 'page' }, h('h1', {}, 'Video Agent'), h('div', { class: 'err' }, e.message))); return; }
  const st = { tab: 'general', ratio: '16:9', seconds: 30, style: '', language: 'English', voiceover: true, music: INFO.moods[0] || 'none', ...store.get('agent', {}) };
  if (!INFO.tabs.some((t) => t.id === st.tab)) st.tab = 'general';
  if (typeof st.chain !== 'boolean') st.chain = !!INFO.tabs.find((t) => t.id === st.tab).defaults.chain;
  let tpl = null; // the template whose [brackets] may still be in the box
  if (st.music !== 'none' && !INFO.moods.includes(st.music)) st.music = INFO.moods[0] || 'none';
  const keep = () => store.set('agent', st);
  const ta = h('textarea', { id: 'va-prompt', maxlength: 2000 }, store.get('agent-draft', ''));
  // Files that come with the prompt: a picture to start from, a voice-over, a song.
  const files = { image: null, end: null, logo: null, video: null, voice: null, music: null }; const tiles = h('div', { class: 'va-files', id: 'va-files' }); let linkOn = false;
  const link = h('input', { type: 'url', id: 'va-url', class: 'va-url', maxlength: 1000, placeholder: 'Paste a direct link to a video (https://… .mp4)' });
  const ROLE = { image: ['image', 'Picture to start from', 'image/*', 'The video begins with this picture: a product photo, a person, a place.'], end: ['image', 'Picture to end on', 'image/*', 'The story is written to arrive at this picture, and it closes the video as a still.'], logo: ['star', 'Logo', 'image/*', 'The agent takes the brand colours and mood from it. The logo itself is added as a closing card, because AI video cannot draw a logo exactly.'], video: ['video', 'Video to study', 'video/*,.mp4,.mov,.webm', 'The agent looks at this video and plans scenes that match its subject, style and pacing.'], voice: ['mic', 'Voice-over', 'audio/*,.mp3,.wav,.m4a', 'Your own recording. The video is planned for its length.'], music: ['audio', 'Music or your song', 'audio/*,.mp3,.wav,.m4a', 'Goes on the Music track.'] };
  const drawFiles = () => tiles.replaceChildren(
    h('button', { class: 'va-add', id: 'va-add', title: 'Add pictures, a logo, a video, a voice-over or music. The agent studies them before it writes the storyboard.', onclick: (e) => popover(e.currentTarget, h('div', { class: 'menu va-menu' }, h('button', { 'data-role': 'link', title: 'The agent downloads the video from the link and studies it. It must be a direct link to a video file, not a page.', onclick: () => { closePop(); linkOn = true; drawFiles(); link.focus(); } }, icon('link'), 'Video link'), Object.entries(ROLE).map(([k, [ic, label, accept, tip]]) => h('button', { 'data-role': k, title: tip, onclick: () => { closePop(); pickFiles(accept, false, async (picked) => {
      const fd = new FormData(); fd.append('files', picked[0]); files[k] = { name: picked[0].name, busy: true }; drawFiles();
      try { const r = await api('/api/files?audio=1', { method: 'POST', body: fd }); (r.errors || []).forEach((m) => toast(m, 'error')); files[k] = r.files[0] ? { id: r.files[0].id, name: picked[0].name } : null; } catch (err) { files[k] = null; errToast(err); }
      drawFiles();
    }); } }, icon(ic), label)))) }, icon('plus'), h('span', {}, 'Image / Video / Logo / Voice')),
    ...Object.entries(files).filter(([, f]) => f).map(([k, f]) => h('span', { class: 'va-file', 'data-file': k }, f.busy ? h('span', { class: 'spin' }) : icon(ROLE[k][0]), h('span', {}, `${ROLE[k][1]}: ${f.name}`), h('button', { class: 'icon-btn sm', title: 'Remove', onclick: () => { files[k] = null; drawFiles(); } }, icon('x')))),
    ...(linkOn ? [h('span', { class: 'va-file va-link', 'data-file': 'link' }, icon('link'), link, h('button', { class: 'icon-btn sm', title: 'Remove', onclick: () => { linkOn = false; link.value = ''; drawFiles(); } }, icon('x')))] : []));
  drawFiles();
  ta.addEventListener('input', () => store.set('agent-draft', ta.value));
  const tabs = h('div', { class: 'va-tabs seg', id: 'va-tabs' }); const ideas = h('div', { class: 'va-ideas', id: 'va-ideas' }); const chips = h('div', { class: 'va-chips', id: 'va-chips' }); const gal = h('div', { class: 'va-gal', id: 'va-gal' });
  const chip = (label, id, value, opts, on, help) => { const s = h('select', { id, onchange: (e) => { on(e.target.value); keep(); draw(); } }, opts.map(([v, l]) => h('option', { value: v }, l))); s.value = String(value); return h('label', { class: 'va-chip' }, label, s, help && info(help)); };
  const go = h('button', { class: 'btn primary', id: 'va-go' });
  const busy = (on) => { go.disabled = on; go.replaceChildren(on ? h('span', { class: 'spin' }) : icon('sparkle'), on ? 'Writing the storyboard…' : `Write the storyboard · ≈ ${INFO.storyboardCredits < 1 ? 'under 1 credit' : fmtCredits(INFO.storyboardCredits) + ' credits'}`); };
  go.onclick = async () => {
    let prompt = ta.value.trim();
    if (/\[[^\]\n]{1,60}\]/.test(prompt)) { const fills = Object.assign({}, ...INFO.templates.map((t) => t.fills || {}), tpl?.fills || {}); prompt = prompt.replace(/\[([^\]\n]{1,60})\]/g, (m, inner) => fills[m] || inner); ta.value = prompt; store.set('agent-draft', prompt); toast('The parts in [brackets] were filled with sample ideas. You can change every scene in the Builder.'); }
    if (prompt.length < 3) { ta.focus(); return toast('Describe the video you want in a sentence or two.', 'error'); }
    if (Object.values(files).some((f) => f?.busy)) return toast('Your file is still uploading. One moment.');
    busy(true);
    try {
      const studying = Object.values(files).some((f) => f?.id) || (linkOn && link.value.trim());
      if (studying) go.replaceChildren(h('span', { class: 'spin' }), 'Studying your files, then writing…');
      const r = await api('/api/agent/storyboard', { method: 'POST', body: { prompt, ...st, videoUrl: linkOn ? link.value.trim() : '', files: Object.fromEntries(Object.entries(files).filter(([, f]) => f?.id).map(([k, f]) => [k, f.id])) } });
      (r.notes || []).forEach((n) => toast(n, 'error'));
      if (r.seen) toast('What the agent saw: ' + r.seen);
      setCredits(r.balance); store.set('agent-draft', '');
      toast(files.voice && INFO.audioFirst ? `Storyboard ready: ${r.scenes} scenes. To fit the scenes to your voice-over, press "Plan" on the Voice track.` : `Storyboard ready: ${r.scenes} scenes. Check them, then press Generate when you are happy.`);
      try { sessionStorage.setItem('vb-fresh', r.projectId); } catch { /* private window */ }
      location.hash = '#/builder/' + r.projectId;
    } catch (e) { errToast(e); busy(false); }
  };
  function draw() {
    const tab = INFO.tabs.find((t) => t.id === st.tab); ta.placeholder = tab.placeholder || '';
    tabs.replaceChildren(...INFO.tabs.map((t) => h('button', { class: t.id === st.tab ? 'on' : '', 'data-tab': t.id, onclick: () => { st.tab = t.id; const d = { ...t.defaults }; if (d.music && d.music !== 'none' && !INFO.moods.includes(d.music)) delete d.music; Object.assign(st, d); keep(); draw(); } }, t.label)));
    ideas.replaceChildren(...tab.ideas.map((i) => h('button', { onclick: () => { ta.value = i; store.set('agent-draft', i); ta.focus(); } }, i)));
    chips.replaceChildren(...[
      chip('Shape', 'va-ratio', st.ratio, INFO.ratios.map((r) => [r, r]), (v) => { st.ratio = v; }, '16:9 for screens and YouTube, 9:16 for phones, 1:1 for square feeds.'),
      chip('Length', 'va-len', st.seconds, INFO.lengths.map((s) => [s, fmtLen(s)]), (v) => { st.seconds = Number(v); }, `The video is planned as scenes of up to ${INFO.clip.maxSec} seconds each, which is what ${INFO.model?.name || 'the video model'} can make.`),
      chip('Style', 'va-style', st.style, INFO.styles.map((s) => [s.id, s.label]), (v) => { st.style = v; }, 'One look that every scene keeps.'),
      chip('Language', 'va-lang', st.language, INFO.languages.map((l) => [l, l]), (v) => { st.language = v; }, 'The language of the narration and the title. Picture descriptions stay in English because the video models follow them best.'),
      h('label', { class: 'va-chip sw' }, 'Voice-over script', h('button', { class: 'switch' + (st.voiceover ? ' on' : ''), id: 'va-voice', role: 'switch', 'aria-checked': String(!!st.voiceover), onclick: () => { st.voiceover = !st.voiceover; keep(); draw(); } }), info('Writes what the voice says in each scene. Scenly cannot speak it for you yet (the AI service has no voice model), so record or upload your own voice in the Builder.')),
      h('label', { class: 'va-chip sw' }, '🔗 Keep Visual Continuity (Chain Scenes)', h('button', { class: 'switch' + (st.chain ? ' on' : ''), id: 'va-chain', role: 'switch', 'aria-checked': String(!!st.chain), onclick: () => { st.chain = !st.chain; keep(); draw(); } }), info('Each scene starts from the last picture of the scene before, so people, places and light stay the same from scene to scene. The scenes are then made one after another, which takes longer. You can switch it off for any single scene in the Builder.')),
      INFO.moods.length > 0 && chip('Music', 'va-music', st.music, [['none', 'No music'], ...INFO.moods.map((m) => [m, m])], (v) => { st.music = v; }, 'Adds a track with this mood from the music library. You can change it in the Builder.'),
      h('div', { class: 'grow' }), go].filter(Boolean));
    gal.replaceChildren(...INFO.templates.filter((t) => st.tab === 'general' || t.tab === st.tab).map((t) => h('button', { class: 'va-tpl', 'data-tpl': t.id, onclick: () => {
      Object.assign(st, { tab: t.tab, ratio: t.ratio, seconds: t.seconds, style: t.style, voiceover: t.voiceover, music: t.music !== 'none' && INFO.moods.includes(t.music) ? t.music : 'none' }); keep();
      tpl = t; if (typeof INFO.tabs.find((x) => x.id === t.tab)?.defaults.chain === 'boolean') { st.chain = INFO.tabs.find((x) => x.id === t.tab).defaults.chain; keep(); }
      ta.value = t.prompt; store.set('agent-draft', t.prompt); draw(); $('#main .scroll').scrollTo({ top: 0, behavior: 'smooth' }); ta.focus(); const a = t.prompt.indexOf('['), b = t.prompt.indexOf(']'); if (a >= 0 && b > a) ta.setSelectionRange(a, b + 1);
      toast('Template loaded. Replace the parts in [brackets] with your own words, or press Write the storyboard to try it with sample ideas.');
    } }, h('span', { class: 'ic' }, icon(TPL_ICON[t.tab] || 'film')), h('b', {}, t.title), h('small', {}, t.blurb), h('span', { class: 'meta' }, `${fmtLen(t.seconds)} · ${t.ratio}`), h('span', { class: 'eg' }, 'Sample: ' + t.prompt.replace(/\[([^\]]+)\]/g, (m) => t.fills?.[m] || m)))));
    busy(false);
  }
  draw();
  $('#main').replaceChildren(topbar(), h('div', { class: 'scroll' }, h('div', { class: 'va', id: 'va' },
    h('h1', {}, 'What video shall we make?'),
    h('p', { class: 'sub' }, 'Describe it once. The agent writes a storyboard and opens it in the Video Builder, where you approve it before any video is generated.'),
    tabs, h('div', { class: 'va-box' }, h('div', { class: 'va-top' }, tiles, ta), chips), ideas,
    h('p', { class: 'va-note' }, 'Writing the storyboard is the only cost on this page. Generating the scenes is priced in the Builder, before you press the button.'),
    h('h2', {}, 'Start from a template'), gal)));
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go.click(); });
}
