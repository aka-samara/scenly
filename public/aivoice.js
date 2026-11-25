// AI Voice: type a script, pick a voice, get a voice-over (an MP3 in your files). The same maker opens as a dialog in
// the Video Builder voice track, and a finished voice-over can make a photo talk in Video Studio.
import { h, $, icon, S, api, toast, errToast, popover, closePop, dialog, topbar, fmtCredits, setCredits, voiceList, loadVoices, playSample, saveStudio, isAvatar, pageCss } from './app.js';

const perChar = () => S.voices?.creditsPerChar ?? 0.021;
const maxChars = () => S.voices?.maxChars ?? 10000;
const LAST = 'pm-voice-last';
const remember = (v) => { try { localStorage.setItem(LAST, JSON.stringify(v)); } catch { /* private mode */ } };
const last = () => { try { return JSON.parse(localStorage.getItem(LAST) || '{}'); } catch { return {}; } };
const fmtLen = (s) => (!s ? '' : s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s`);

// The script box, voice and speed, with the price as you type. Calls onMade(file) with the new sound file.
function maker({ text = '', cta = 'Make voice-over', onMade, compact = false }) {
  const prev = last();
  const st = { voiceId: prev.voiceId && S.voices?.voices?.some((v) => v.id === prev.voiceId) ? prev.voiceId : S.voices?.defaultVoice, speed: prev.speed || 1, busy: false };
  const voice = () => S.voices?.voices?.find((v) => v.id === st.voiceId);
  const ta = h('textarea', { class: 'av-script', id: 'av-script', rows: compact ? 6 : 7, maxlength: maxChars(), placeholder: 'Type or paste your script. Add tags like [happy], [whispering] or [laughs] to direct how it is read.' });
  ta.value = text;
  const count = h('span', { class: 'av-count' });
  const cost = h('span', { id: 'av-cost' });
  const vbtn = h('button', { class: 'chipbtn av-voice', id: 'av-voice', onclick: (e) => openPicker(e.currentTarget) });
  const go = h('button', { class: 'btn primary', id: 'av-go', onclick: () => make() }, icon('mic'), cta, h('span', { class: 'cost' }, icon('bolt'), cost));
  const drawVoice = () => { const v = voice(); vbtn.replaceChildren(...[icon('mic'), h('span', { class: 'nm' }, v ? `${v.name} · ${v.accent}` : 'Pick a voice'), st.speed !== 1 && h('span', { class: 'tag dim' }, st.speed < 1 ? 'Slower' : 'Faster'), icon('down')].filter(Boolean)); };
  const sync = () => {
    const n = ta.value.trim().length;
    count.textContent = `${n.toLocaleString()} / ${maxChars().toLocaleString()} characters${n ? ` · about ${fmtLen(Math.max(1, n / 15 / st.speed))}` : ''}`;
    cost.textContent = fmtCredits(n * perChar());
    go.disabled = !n || st.busy;
  };
  const openPicker = (anchor) => popover(anchor, h('div', { class: 'menu voice-menu' },
    h('div', { class: 'menu-head' }, 'VOICE'),
    voiceList({ value: st.voiceId, speed: st.speed, onPick: (v) => { closePop(); st.voiceId = v.id; remember({ voiceId: st.voiceId, speed: st.speed }); drawVoice(); }, onSpeed: (n) => { st.speed = n; remember({ voiceId: st.voiceId, speed: st.speed }); drawVoice(); sync(); } }),
  ), 'below');
  async function make() {
    const t = ta.value.trim(); if (!t || st.busy) return;
    st.busy = true; sync(); go.classList.add('busy'); go.firstChild.replaceWith(h('span', { class: 'spin' }));
    try {
      const r = await api('/api/voice/speak', { method: 'POST', body: { text: t, voiceId: st.voiceId, speed: st.speed }, timeoutMs: 150000 });
      setCredits(r.balance);
      await onMade?.(r.file, { text: t });
    } catch (e) { errToast(e); }
    st.busy = false; go.classList.remove('busy'); go.firstChild.replaceWith(icon('mic')); sync();
  }
  ta.addEventListener('input', sync);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); make(); } });
  drawVoice(); sync();
  const el = h('div', { class: 'av-maker' + (compact ? ' compact' : '') }, ta,
    h('div', { class: 'av-row' }, vbtn, h('button', { class: 'icon-btn sm', title: 'Hear this voice', onclick: (e) => playSample(st.voiceId, e.currentTarget) }, icon('play')), h('div', { class: 'grow' }), count),
    h('div', { class: 'av-row end' }, go));
  return { el, ta };
}

/** The voice-over maker as a dialog (Video Builder). onMade(file) is called with the new sound file. */
export async function openVoiceDialog({ title = 'Make a voice-over with AI', text = '', cta = 'Make voice-over', onMade } = {}) {
  await pageCss('aivoice', '/aivoice.css');
  if (!(await loadVoices())?.voices?.length) return toast('AI voices are not available right now.', 'error');
  let d;
  const m = maker({ text, cta, compact: true, onMade: async (f) => { d?.remove(); await onMade?.(f); } });
  d = dialog({ title, sub: 'Type what is said, pick a voice, and it is added as your voice-over.', body: m.el, wide: true });
  setTimeout(() => { m.ta.focus(); m.ta.setSelectionRange(m.ta.value.length, m.ta.value.length); }, 40);
  return d;
}

// Opens Video Studio on the talking-avatar model with this voice-over ready; the person adds a photo.
function makeItTalk(f) {
  const m = S.models.find((x) => isAvatar(x));
  if (!m) return toast('Talking videos are not available right now.', 'error');
  const st = S.studio.video; st.modelId = m.id; st.task = 'create';
  st.refs = [...st.refs.filter((r) => r.kind === 'image'), { id: f.id, name: f.name, kind: 'audio', duration: f.duration, mime: f.mime }];
  saveStudio('video'); S.draft.video = '';
  location.hash = '#/video';
  setTimeout(() => toast(st.refs.some((r) => r.kind === 'image') ? 'Your voice-over is ready. Press Generate to make the photo talk.' : 'Your voice-over is ready. Add a photo of the person who talks, then press Generate.'), 300);
}

/** The AI Voice page: make a voice-over, then listen, download, use it in a talking video. */
export async function renderVoice() {
  await pageCss('aivoice', '/aivoice.css');
  const main = $('#main');
  if (!S.voices?.voices?.length) {
    return main.replaceChildren(topbar(), h('div', { class: 'scroll' }, h('div', { class: 'page' }, h('h1', {}, 'AI Voice'), h('div', { class: 'empty big' }, h('div', { class: 'empty-ico' }, icon('mic')), h('b', {}, 'AI voices are not available right now'), h('div', {}, 'Please try again a little later.')))));
  }
  const list = h('div', { class: 'av-list', id: 'av-list' }, h('div', { class: 'empty' }, h('span', { class: 'spin' })));
  const draw = async (fresh) => {
    let items = [];
    try { items = (await api('/api/uploads')).items.filter((x) => x.aiVoice); } catch (e) { errToast(e); }
    if (fresh) items = [fresh, ...items.filter((x) => x.id !== fresh.id)];
    if (location.hash !== '#/voice') return;
    list.replaceChildren(...(items.length ? items.map(row) : [h('div', { class: 'empty' }, 'Your voice-overs will appear here.')]));
  };
  const row = (x) => h('div', { class: 'av-item', 'data-id': x.id },
    h('div', { class: 'av-ico' }, icon('audio')),
    h('div', { class: 'av-meta' }, h('b', { class: 'clip1' }, x.name.replace(/\.mp3$/i, '')), h('small', {}, [x.aiVoice?.voiceName, fmtLen(x.duration), new Date(x.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' })].filter(Boolean).join(' · '))),
    h('audio', { src: x.url, controls: true, preload: 'none' }),
    h('div', { class: 'av-acts' },
      S.models.some(isAvatar) && h('button', { class: 'btn sm', title: 'Make a photo say this', onclick: () => makeItTalk(x) }, icon('face'), 'Make a photo talk'),
      h('a', { class: 'icon-btn sm', title: 'Download', href: x.url, download: x.name }, icon('dl'))));
  const mk = maker({ onMade: async (f) => { toast('Your voice-over is ready.'); mk.ta.value = ''; mk.ta.dispatchEvent(new Event('input')); await draw({ ...f, createdAt: new Date().toISOString() }); } });
  main.replaceChildren(topbar(), h('div', { class: 'scroll' }, h('div', { class: 'page av-page' },
    h('h1', {}, 'AI Voice'),
    h('p', { class: 'sub' }, 'Type a script and get a natural voice-over in over 100 languages. Use it as the voice-over in the Video Builder, or make a photo say it.'),
    h('div', { class: 'av-card' }, mk.el),
    h('h2', {}, 'Your voice-overs'),
    list)));
  draw();
}
