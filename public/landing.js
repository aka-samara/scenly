// Landing page sections for signed-out visitors: top menu, feature grid, live studio previews, how it works,
// plans, FAQ and the footer. The hero with the chat box stays in app.js (renderLanding), which calls into here.
// Everything shown in a preview is a drawing made with CSS: no customer work, no real people, no invented reviews.
import { h, icon, S, modelLogo, shortName, byId } from './app.js';
import { LEGAL_COMPANY, COPYRIGHT } from './legal.js';

const ADDRESS = ['447 Collins St', 'Melbourne VIC 3000', 'Australia'];
const mailTo = () => S.config?.supportEmail || 'info@adxl.ai';
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const num = (n) => Number(n).toLocaleString('en-US');

// ---------- menu ----------
const LINKS = [['Features', 'lp-feats'], ['Studios', 'lp-show'], ['Models', 'lp-models'], ['Apps', 'lp-apps'], ['Pricing', 'lp-plans'], ['FAQ', 'lp-faq']];
let pendingJump = '';
function jump(id) {
  document.querySelector('.lp-mmenu')?.remove();
  const el = document.getElementById(id);
  if (el && id === 'lp-models' && openDirectory) return openDirectory();
  if (el) return el.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' });
  pendingJump = id; location.hash = '#/'; // from the Terms or Privacy page: open the landing page first
}
const jumpLink = (label, id, cls = '') => h('a', { href: '#/', class: cls, onclick: (e) => { e.preventDefault(); jump(id); } }, label);
export const lpLinks = () => LINKS.map(([label, id]) => jumpLink(label, id));
// Phone menu: the links, log in and sign up in one sheet under the bar.
export function lpBurger() {
  const btn = h('button', { class: 'icon-btn lp-burger', title: 'Menu', 'aria-label': 'Menu', 'aria-expanded': 'false', onclick: () => {
    const open = document.querySelector('.lp-mmenu');
    if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
    btn.setAttribute('aria-expanded', 'true');
    btn.closest('.lp-nav').append(h('div', { class: 'lp-mmenu' },
      LINKS.map(([label, id]) => jumpLink(label, id)),
      h('div', { class: 'lp-mmenu-cta' }, h('a', { class: 'btn', href: '#/login' }, 'Log in'), h('a', { class: 'btn primary', href: '#/signup' }, 'Start free')),
    ));
  } }, icon('menu'));
  return btn;
}

// ---------- small building blocks ----------
const head = (eyebrow, title, sub) => h('div', { class: 'lp-head' }, h('span', { class: 'lp-kicker' }, eyebrow), h('h2', {}, title), sub && h('p', { class: 'lp-sub' }, sub));
const paidTag = () => h('span', { class: 'tag lp-paid', title: 'Included in the Pro, Max and Ultra plans' }, 'Pro');
const freeTag = () => h('span', { class: 'tag dim' }, 'Free');
const win = (title, body, extra) => h('div', { class: 'lpw' }, h('div', { class: 'lpw-bar' }, h('i'), h('i'), h('i'), h('b', {}, title), h('span', { class: 'grow' }), extra), h('div', { class: 'lpw-body' }, body));
const chips = (items, get, set) => {
  const row = h('div', { class: 'lpm-chips' });
  const draw = () => row.replaceChildren(...items.map(([id, label]) => h('button', { class: get() === id ? 'on' : '', onclick: () => { set(id); draw(); } }, label)));
  draw(); return row;
};
// A person drawn from two shapes, so previews never show a real face.
const figure = (hair, skin, top) => h('span', { class: 'lpm-fig' }, h('i', { class: 'hair', style: { background: hair } }), h('i', { class: 'head', style: { background: skin } }), h('i', { class: 'body', style: { background: top } }));

// ---------- live previews ----------
function mockBuilder() {
  const scenes = [['sc-dawn', 'Opening', 'Sunrise over the roastery'], ['sc-neon', 'The pour', 'A slow pour, steam rising'], ['sc-ocean', 'The moment', 'First sip by the window'], ['sc-dune', 'Sign-off', 'Bean & Leaf. Fresh every week.']];
  let cur = 0, timer = null;
  const stage = h('div', { class: 'lpm-stage' });
  const head = h('i', { class: 'lpm-playhead' });
  const playBtn = h('button', { class: 'lpm-play', title: 'Play', onclick: () => (timer ? stop() : play()) });
  const clips = scenes.map((s, i) => h('button', { class: 'lpm-clip ' + s[0], title: s[1], onclick: () => { stop(); show(i); } }, h('span', {}, String(i + 1), h('em', {}, ` · ${s[1]}`))));
  const caps = scenes.map((s, i) => h('button', { class: 'lpm-cap', onclick: () => { stop(); show(i); } }, s[2]));
  function show(i) {
    cur = i;
    stage.className = 'lpm-stage ' + scenes[i][0];
    stage.replaceChildren(h('span', { class: 'lpm-badge' }, `Scene ${i + 1} of ${scenes.length}`), h('span', { class: 'lpm-subtitle' }, scenes[i][2]));
    clips.forEach((c, n) => c.classList.toggle('on', n === i)); caps.forEach((c, n) => c.classList.toggle('on', n === i));
    head.style.setProperty('--f', String((i + 0.5) / scenes.length));
  }
  function stop() { clearInterval(timer); timer = null; playBtn.replaceChildren(icon('play')); playBtn.title = 'Play'; }
  function play() {
    playBtn.replaceChildren(icon('stop')); playBtn.title = 'Stop';
    timer = setInterval(() => { if (!stage.isConnected) return stop(); show((cur + 1) % scenes.length); }, 1700);
  }
  show(0); stop();
  const track = (label, body) => h('div', { class: 'lpm-track' }, h('small', {}, label), body);
  const el = win('Video Builder', [
    h('div', { class: 'lpm-view' }, stage, h('div', { class: 'lpm-ctrl' }, playBtn, h('span', {}, '0:24 · 16:9 · 1080p'), h('span', { class: 'grow' }), h('span', { class: 'tag dim' }, 'Export MP4'))),
    h('div', { class: 'lpm-timeline' }, head,
      track('Scenes', h('div', { class: 'lpm-row' }, clips)),
      track('Voice', h('div', { class: 'lpm-row' }, h('div', { class: 'lpm-wave' }))),
      track('Music', h('div', { class: 'lpm-row' }, h('div', { class: 'lpm-music' }, icon('audio'), 'Warm acoustic'))),
      track('Captions', h('div', { class: 'lpm-row' }, caps)),
    ),
  ]);
  return { el, start: () => { if (!calm() && !timer) play(); }, stop };
}

function mockPro() {
  const steps = ['Read the brief', 'Plan four shots', 'Paint the opening frames', 'Film and put it together'];
  const shots = ['sc-studio', 'sc-dune', 'sc-forest', 'sc-dawn'];
  const list = h('div', { class: 'lpm-steps' });
  const grid = h('div', { class: 'lpm-grid four' });
  let timer = null;
  const draw = (done) => {
    list.replaceChildren(...steps.map((s, i) => h('div', { class: 'lpm-step' + (i < done ? ' done' : i === done ? ' now' : '') }, h('i', {}, i < done ? icon('check') : null), s)));
    grid.replaceChildren(...shots.map((c, i) => h('div', { class: 'lpm-tile ' + (done > 2 || (done === 2 && i < 2) ? c : 'wait') }, h('span', {}, `Shot ${i + 1}`))));
  };
  const stop = () => { clearInterval(timer); timer = null; };
  const run = () => {
    stop(); let n = 0; draw(0);
    if (calm()) return draw(steps.length);
    timer = setInterval(() => { if (!list.isConnected) return stop(); draw(++n); if (n >= steps.length) stop(); }, 950);
  };
  draw(steps.length);
  const el = win('Studio Pro', h('div', { class: 'lpm-split' },
    h('div', { class: 'lpm-col' },
      h('div', { class: 'lpm-bubble' }, 'A 15 second launch film for a handmade ceramic mug. Warm, calm, morning light.'),
      list,
      h('button', { class: 'btn sm', onclick: run }, icon('retry'), 'Run it again'),
    ),
    grid,
  ), h('span', { class: 'tag new' }, 'Autopilot'));
  return { el, start: run, stop };
}

function mockAds() {
  const tpls = { launch: ['New arrival', 'Meet the Morning Blend', 'Shop now'], offer: ['Seasonal offer', '20% off your first bag', 'Claim offer'], story: ['Brand story', 'Roasted in small batches', 'Learn more'] };
  let tpl = 'launch', ratio = '1:1';
  const ad = h('div', { class: 'lpm-ad' });
  const draw = () => {
    const [kind, line, cta] = tpls[tpl];
    ad.style.aspectRatio = ratio.replace(':', ' / ');
    ad.dataset.ratio = ratio;
    ad.replaceChildren(h('small', {}, kind), h('b', {}, line), h('span', { class: 'lpm-adcta' }, cta), h('em', {}, 'B&L'));
  };
  draw();
  const el = win('Ad Studio', h('div', { class: 'lpm-split ads' },
    h('div', { class: 'lpm-col' },
      h('div', { class: 'lpm-kit' },
        h('div', { class: 'lpm-kit-top' }, h('span', { class: 'lpm-logo' }, 'B&L'), h('div', {}, h('b', {}, 'Bean & Leaf'), h('small', {}, 'Brand kit read from the website'))),
        h('div', { class: 'lpm-swatches' }, ['#2f1b12', '#c8793b', '#f3e3c8', '#3f6b4f'].map((c) => h('i', { style: { background: c } }))),
        h('small', {}, 'Voice: warm, plain, a little playful'),
      ),
      h('small', { class: 'lpm-label' }, 'Template'),
      chips([['launch', 'New arrival'], ['offer', 'Offer'], ['story', 'Story']], () => tpl, (v) => { tpl = v; draw(); }),
      h('small', { class: 'lpm-label' }, 'Size'),
      chips([['1:1', '1:1'], ['4:5', '4:5'], ['9:16', '9:16'], ['16:9', '16:9']], () => ratio, (v) => { ratio = v; draw(); }),
    ),
    h('div', { class: 'lpm-adwrap' }, ad),
  ));
  return { el };
}

function mockAgent() {
  const scenes = [['sc-neon', 'Night street', 'Slow dolly in through a rainy neon alley', '5 s'], ['sc-studio', 'The shoe', 'Close-up, the shoe lands in a puddle', '4 s'], ['sc-ocean', 'Splash', 'Slow motion water arc, side tracking shot', '6 s'], ['sc-dawn', 'Finish', 'Runner crests a hill at sunrise, logo fades in', '5 s']];
  let cur = 0;
  const cards = h('div', { class: 'lpm-board' });
  const detail = h('div', { class: 'lpm-detail' });
  const draw = () => {
    cards.replaceChildren(...scenes.map((s, i) => h('button', { class: 'lpm-card' + (i === cur ? ' on' : ''), onclick: () => { cur = i; draw(); } }, h('div', { class: 'lpm-thumb ' + s[0] }, h('span', {}, s[3])), h('b', {}, `${i + 1}. ${s[1]}`), h('small', {}, s[2]))));
    detail.replaceChildren(icon('film'), h('span', {}, h('b', {}, `Scene ${cur + 1}: `), scenes[cur][2] + '.'), h('span', { class: 'tag dim' }, scenes[cur][3]));
  };
  draw();
  const el = win('Video Agent', [h('div', { class: 'lpm-prompt' }, icon('sparkle'), 'A 20 second ad for a running shoe, splashing through city rain into sunrise'), cards, detail]);
  return { el };
}

function mockImage() {
  const looks = { photo: ['sc-studio', 'sc-dune', 'sc-ocean', 'sc-forest'], poster: ['sc-dawn', 'sc-neon', 'sc-dune', 'sc-ocean'], neon: ['sc-neon', 'sc-ocean', 'sc-neon', 'sc-dawn'] };
  let look = 'photo', ratio = '1:1';
  const grid = h('div', { class: 'lpm-grid' });
  const draw = () => grid.replaceChildren(...looks[look].map((c, i) => h('div', { class: 'lpm-tile ' + c + (i % 2 ? ' flip' : ''), style: { aspectRatio: ratio.replace(':', ' / ') } })));
  draw();
  const el = win('Image', [
    h('div', { class: 'lpm-prompt' }, icon('image'), 'A matte black water bottle on a pastel background, soft studio light'),
    h('div', { class: 'lpm-opts' },
      chips([['photo', 'Photo'], ['poster', 'Poster'], ['neon', 'Neon']], () => look, (v) => { look = v; draw(); }),
      chips([['1:1', '1:1'], ['16:9', '16:9'], ['3:4', '3:4']], () => ratio, (v) => { ratio = v; draw(); }),
    ),
    grid,
  ]);
  return { el };
}

function mockFace() {
  let on = true;
  const same = ['#2b1d16', '#e6b99a', '#4361ee'];
  const drift = [['#2b1d16', '#e6b99a', '#4361ee'], ['#8a5a2b', '#f1cfb4', '#f72585'], ['#111318', '#c98f6b', '#42c98a'], ['#b23a2a', '#f3d6c2', '#ffb547']];
  const places = [['sc-dawn', 'Beach at sunrise'], ['sc-neon', 'City at night'], ['sc-studio', 'Studio portrait'], ['sc-forest', 'Forest walk']];
  const grid = h('div', { class: 'lpm-grid four' });
  const note = h('div', { class: 'lpm-detail' });
  const btn = h('button', { class: 'chipbtn lpm-lock', onclick: () => { on = !on; draw(); } });
  const draw = () => {
    btn.classList.toggle('on', on);
    btn.replaceChildren(icon('lock'), h('span', {}, on ? 'Face lock: Mia' : 'Face lock is off'));
    grid.replaceChildren(...places.map(([c, label], i) => h('div', { class: 'lpm-tile ' + c }, figure(...(on ? same : drift[i])), h('span', {}, label))));
    note.replaceChildren(icon(on ? 'check' : 'info'), h('span', {}, on ? 'The same character in every picture and every video shot.' : 'Without Face lock each result invents a new person. Turn it back on to compare.'));
  };
  draw();
  const el = win('Characters', [grid, note], btn);
  return { el };
}

// ---------- sections ----------
function featureGrid() {
  const c = (t) => S.models.filter((m) => m.type === t).length;
  const items = [
    ['chat', 'Chat', 0, `Ask anything and pick the model for each message${c('chat') ? `, from ${c('chat')} chat models` : ''}. Attach PDFs, Word files, spreadsheets and code.`],
    ['image', 'Image', 0, `Make pictures from a sentence or change a photo with words${c('image') ? `, with ${c('image')} image models` : ''}.`],
    ['video', 'Video Studio', 0, 'Turn a sentence or a single picture into a short cinematic clip, with sound.'],
    ['sparkle', 'Video Agent', 1, 'Describe a video and get a full storyboard, scene by scene, ready to generate.'],
    ['film', 'Video Builder', 1, 'Build videos up to 5 minutes from scenes, with music, voice-over and captions.'],
    ['wand', 'Studio Pro', 1, 'A guided image and video studio that plans the shots for you, with Autopilot.'],
    ['megaphone', 'Ad Studio', 1, 'Turn your website into a brand kit, then into picture and video ads from ready templates.'],
    ['doc', 'Docs Studio', 0, 'Ask for a Word document, spreadsheet, PDF or slide deck and download the finished file.'],
    ['apps', 'AI Apps', 0, `${S.apps.length ? S.apps.length + ' one-click tools' : 'One-click tools'}: product shots, outfit swaps, headshots and more, with no prompt writing.`],
    ['lock', 'Face lock', 0, 'Save a character once and keep the same face, product or logo in every picture and video shot.'],
    ['folder', 'Assets', 0, 'Everything you make lands in one library. Filter by type or by the tool that made it.'],
    ['terminal', 'Code', 0, 'Describe a page or a tool. The files are written for you with a live preview.'],
  ];
  return h('section', { class: 'lp-sec', id: 'lp-feats' },
    head('Features', 'One studio for everything you create', 'Twelve tools, one account and one credit balance.'),
    h('div', { class: 'lp-bento' }, items.map(([ic, name, paid, text]) => h('a', { class: 'lp-tool' + (paid ? ' paid' : ''), href: '#/signup' },
      h('div', { class: 'lp-tool-top' }, h('span', { class: 'ic' }, icon(ic)), h('b', {}, name), paid ? paidTag() : freeTag()),
      h('small', {}, text),
    ))),
  );
}

function showcase() {
  const tabs = [
    ['builder', 'film', 'Video Builder', 1, 'Edit a whole video on one timeline', 'Line up scenes, add a voice-over, music and captions, then export one finished file.', ['Videos up to 5 minutes', 'Music library, voice-over and captions', 'Change one scene without redoing the rest'], mockBuilder],
    ['pro', 'wand', 'Studio Pro', 1, 'Brief it once, let it plan the shots', 'Studio Pro reads your brief, plans each shot and makes the pictures and clips in order.', ['Asks the questions a director would ask', 'Autopilot runs the whole plan for you', 'Works with Face lock for a steady cast'], mockPro],
    ['ads', 'megaphone', 'Ad Studio', 1, 'From your website to finished ads', 'Paste your site address. Ad Studio builds a brand kit, then fills ready templates in your colours and voice.', ['Brand kit: logo, colours and tone', 'Templates for launches, offers and stories', 'Every size, from square to vertical video'], mockAds],
    ['agent', 'sparkle', 'Video Agent', 1, 'A storyboard from one sentence', 'Describe the video. Video Agent writes the scenes, the camera moves and the timing, ready to generate.', ['Scene by scene storyboard', 'Edit any scene before you spend credits', 'Opens in Video Builder for finishing'], mockAgent],
    ['image', 'image', 'Image', 0, 'Pictures in the look you need', 'Write what you want, pick a model and a size, and get options to choose from. Edit any result with words.', ['Leading image models in one place', 'Styles and sizes for every channel', 'Edit a photo by describing the change'], mockImage],
    ['face', 'lock', 'Face lock', 0, 'The same face, every time', 'Save a character from a few photos. Lock it, and every picture and video shot keeps that same face, product or logo.', ['Works across images and video', 'People, products and logos', 'One click to turn on or off'], mockFace],
  ];
  let cur = 'builder', live = null;
  const tabRow = h('div', { class: 'lp-tabs', role: 'tablist' });
  const stageEl = h('div', { class: 'lp-show-stage' });
  const draw = () => {
    live?.stop?.();
    tabRow.replaceChildren(...tabs.map(([id, ic, name]) => h('button', { class: id === cur ? 'on' : '', role: 'tab', 'aria-selected': String(id === cur), onclick: () => { cur = id; draw(); live?.start?.(); } }, icon(ic), name)));
    const [, , name, paid, title, text, points, make] = tabs.find((t) => t[0] === cur);
    live = make();
    stageEl.replaceChildren(
      h('div', { class: 'lp-show-copy' },
        h('div', { class: 'lp-show-name' }, name, paid ? paidTag() : freeTag()),
        h('h3', {}, title), h('p', {}, text),
        h('ul', {}, points.map((p) => h('li', {}, icon('check'), p))),
        h('a', { class: 'btn primary', href: '#/signup' }, paid ? 'Start free, upgrade for ' + name : 'Try it free'),
      ),
      h('div', { class: 'lp-show-view' }, live.el),
    );
  };
  draw();
  const sec = h('section', { class: 'lp-sec', id: 'lp-show' },
    head('Studios', 'See how the studios work', 'These previews are live. Click the scenes, chips and buttons.'),
    tabRow, stageEl,
  );
  // Start the first preview's animation only once it is on screen.
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); live?.start?.(); } }, { threshold: 0.35 }); io.observe(stageEl); }
  return sec;
}

function howItWorks(openGate) {
  const steps = [
    ['pen', 'Describe it', 'Type what you want in plain words, or start from a template or a one-click app.'],
    ['sliders', 'Pick how it is made', 'Choose the model yourself, or let Studio Pro and Video Agent plan the work. You see the credit cost before you run anything.'],
    ['dl', 'Refine and export', 'Change a scene, a caption or a detail, then download. Everything is kept in your Assets.'],
  ];
  const featured = ['doubao-seedance-2-5', 'seedream-5.0-pro', 'gpt-image-2', 'nano-banana-2', 'claude-sonnet-5', 'gpt-5.6-terra', 'gemini-3.6-flash', 'deepseek-v4-flash'].map(byId).filter(Boolean);
  const shown = (featured.length >= 4 ? featured : S.models).slice(0, 8);
  return h('section', { class: 'lp-sec', id: 'lp-how' },
    head('How it works', 'From idea to finished file in three steps'),
    h('div', { class: 'lp-steps' }, steps.map(([ic, t, d], i) => h('div', { class: 'lp-step' }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'ic' }, icon(ic)), h('b', {}, t), h('small', {}, d)))),
    shown.length > 0 && h('div', { class: 'lp-models' }, h('small', {}, `${uniqueModels().length} models, including`), shown.map((m) => h('span', { class: 'lp-model' }, modelLogo(m, 'logo-sm'), shortName(m)))),
    shown.length > 0 && modelDirectory(openGate),
  );
}

// ---------- every model, with what it is good for ----------
// Read from the public model list the page already loaded, so it always matches what the app offers. No prices here.
const KINDS = [['all', 'All'], ['chat', 'Chat'], ['image', 'Image'], ['video', 'Video']];
const KIND_LABEL = { chat: 'Chat', image: 'Image', video: 'Video' };
const providerLabel = (m) => String(m.provider || '').split(' / ')[0];
// The gateway can list one model twice under two ids; count and show it once.
function uniqueModels() {
  const seen = new Set();
  return S.models.filter((m) => KIND_LABEL[m.type] && !seen.has(m.type + shortName(m)) && seen.add(m.type + shortName(m)));
}
let openDirectory = null; // set while the landing page is shown, used by the Models menu link
function modelDirectory(openGate) {
  const models = uniqueModels();
  let kind = 'all', q = '', built = false;
  const count = (k) => (k === 'all' ? models.length : models.filter((m) => m.type === k).length);
  const tabs = h('div', { class: 'lp-dir-tabs', role: 'tablist', 'aria-label': 'Model type' });
  const grid = h('div', { class: 'lp-dir-grid' });
  const empty = h('p', { class: 'lp-dir-empty', hidden: '' }, 'No model matches that search.');
  const search = h('input', { type: 'search', placeholder: 'Search models', 'aria-label': 'Search models', autocomplete: 'off', oninput: () => { q = search.value.trim().toLowerCase(); draw(); } });
  const card = (m) => h('article', { class: 'lp-dir-card', 'data-type': m.type },
    h('div', { class: 'lp-dir-top' }, modelLogo(m, 'logo'), h('div', { class: 'lp-dir-name' }, h('b', {}, shortName(m)), h('small', {}, providerLabel(m))),
      h('button', { class: 'btn sm', 'aria-label': 'Try ' + shortName(m), onclick: () => openGate({ mode: m.type, modelId: m.id }) }, 'Try it')),
    h('div', { class: 'lp-dir-tags' }, h('span', { class: 'tag lp-kind k-' + m.type }, KIND_LABEL[m.type]), m.useTag && h('span', { class: 'tag new' }, m.useTag)),
    h('p', {}, m.blurb || ''),
  );
  const cards = new Map();
  const draw = () => {
    tabs.replaceChildren(...KINDS.filter(([k]) => count(k)).map(([k, label]) => h('button', { role: 'tab', class: k === kind ? 'on' : '', 'aria-selected': String(k === kind), onclick: () => { kind = k; draw(); } }, label, h('span', {}, String(count(k))))));
    const list = models.filter((m) => (kind === 'all' || m.type === kind) && (!q || `${m.name} ${m.provider} ${m.useTag} ${m.blurb} ${KIND_LABEL[m.type]}`.toLowerCase().includes(q)));
    grid.replaceChildren(...list.map((m) => cards.get(m.id) || cards.set(m.id, card(m)).get(m.id)));
    empty.hidden = list.length > 0;
  };
  const panel = h('div', { class: 'lp-dir', id: 'lp-models-all', hidden: '' },
    h('div', { class: 'lp-dir-bar' }, tabs, h('label', { class: 'lp-dir-search' }, icon('search'), search)),
    grid, empty,
  );
  const btn = h('button', { class: 'btn lp-dir-toggle', 'aria-expanded': 'false', 'aria-controls': 'lp-models-all' });
  const label = () => btn.replaceChildren(panel.hidden ? 'See all models' : 'Hide the model list', icon('down'));
  const toggle = (show = panel.hidden) => {
    if (show && !built) { built = true; draw(); } // the cards are only made the first time the list opens
    panel.hidden = !show; btn.setAttribute('aria-expanded', String(show)); btn.classList.toggle('open', show); label();
  };
  btn.onclick = () => { const wasOpen = !panel.hidden; toggle(); if (wasOpen) btn.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'center' }); };
  label();
  openDirectory = () => { toggle(true); panel.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' }); };
  return h('div', { class: 'lp-dir-wrap', id: 'lp-models' }, h('div', { class: 'lp-dir-cta' }, btn), panel);
}

function plans(examplesList) {
  const P = S.config.plans, packs = S.config.packs || [];
  return h('section', { class: 'lp-sec', id: 'lp-plans' },
    head('Pricing', 'Start free, upgrade when you need more', `No card needed to start. ${num(P[0].credits)} free starter credits are on us.`),
    h('div', { class: 'lp-plans' }, P.map((pl) => h('div', { class: 'lp-plan' + (pl.popular ? ' pop' : '') },
      pl.popular && h('span', { class: 'tag new' }, 'Most popular'),
      h('b', {}, pl.name),
      h('div', { class: 'price' }, pl.priceUsd ? '$' + pl.priceUsd : 'Free', pl.priceUsd ? h('small', {}, ' / month') : null),
      h('div', { class: 'lp-credits' }, icon('coin'), `${num(pl.credits)} credits${pl.priceUsd ? ' every month, valid 1 month' : ' to start'}`),
      h('small', {}, pl.tagline),
      h('ul', {}, pl.perks.slice(1).map((x) => h('li', {}, icon('check'), x))),
      examplesList(pl.credits),
      h('a', { class: 'btn ' + (pl.popular || !pl.priceUsd ? 'primary' : ''), href: '#/signup' }, pl.priceUsd ? `Start free, then choose ${pl.name}` : 'Start free'),
    ))),
    h('div', { class: 'lp-plan-notes' },
      h('div', { class: 'lp-note' }, h('span', { class: 'ic' }, icon('lock')), h('div', {}, h('b', {}, 'Pro tools'), h('small', {}, 'Ad Studio, Video Builder, Video Agent and Studio Pro open with any monthly plan or top-up pack, for as long as you have paid credits or an active plan. Free starter credits work in Chat, Image, Video Studio, Docs, Code and AI Apps.'))),
      packs.length > 0 && h('div', { class: 'lp-note' }, h('span', { class: 'ic' }, icon('coin')), h('div', {}, h('b', {}, 'Top-up packs, valid 90 days'), h('small', {}, 'No subscription needed: ', packs.map((p) => `${num(p.credits)} credits for $${p.priceUsd}`).join(', '), '. Buy as many as you like, any time. Plan credits last one month and do not roll over; with a plan, plan credits are used first.'))),
    ),
  );
}

function faq() {
  const P = S.config.plans; const free = P[0];
  const c = (t) => S.models.filter((m) => m.type === t).length;
  const mail = mailTo();
  const items = [
    ['What is Scenly?', 'Scenly is one place to chat with leading AI models and to make images, videos, ads and documents. You describe what you want, choose a model or let a studio plan the work, and download the result.'],
    ['What do I get for free?', `A free account starts with ${num(free.credits)} free starter credits and needs no card. Use them in Chat, Docs, Code, Image (generation and editing), Video Studio and the one-click AI Apps.`],
    ['How do credits work?', `Everything uses one credit balance. 1,000 credits are worth US$1 of model use, charged at the model's official price or less, and the cost is shown before you run anything. Cheaper models stretch your credits further.`],
    ['Which tools need a plan or a top-up?', `Ad Studio, Video Builder, Video Agent and Studio Pro are the Pro tools. They are included in ${P.filter((p) => p.priceUsd).map((p) => p.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}, and any top-up pack opens them too. They stay open while you have paid credits or an active plan, and pause when your paid credits reach zero until you top up or your plan renews.`],
    ['Do credits expire?', 'Monthly plan credits are valid for one month from your billing date. Unused plan credits expire when your plan renews and do not roll over. Top-up pack credits are valid for 90 days from purchase. Free starter credits have no end date.'],
    ['Which credits are used first?', 'If you have both, Scenly always uses your monthly plan credits first so your top-ups are saved for later. Top-ups are then used soonest-to-expire first.'],
    ['Can I cancel my plan?', 'Yes, at any time from the billing page. Your plan and its credits stay until the end of the period you paid for, and you are not charged again. Top-up credits keep their own 90-day dates.'],
    ['Can I buy credits without a subscription?', 'Yes. Top-up packs are one-time purchases valid for 90 days. You can buy several, at any time, even before the last one runs out. They also open the Pro tools.'],
    ['Which AI models can I use?', `${S.models.length ? `Right now there are ${S.models.length} models: ${c('chat')} for chat, ${c('image')} for images and ${c('video')} for video. ` : ''}You choose the model each time, and new models are added as they are released.`],
    ['What is Face lock?', 'Face lock keeps one saved character the same in everything you make. Save a person, a product or a logo once, turn the lock on, and every picture and every video shot uses it.'],
    ['Who owns what I make?', ['We do not claim ownership of what is made for you. Some models have their own rules, and the details are in the ', h('a', { href: '#/terms' }, 'Terms of Use'), '.']],
    ['How do I get help?', ['Email us at ', h('a', { href: 'mailto:' + mail }, mail), '. Paid plans include email support, and Max and Ultra include priority support.']],
  ];
  return h('section', { class: 'lp-sec lp-faq-sec', id: 'lp-faq' },
    head('FAQ', 'Questions, answered'),
    h('div', { class: 'lp-faq' }, items.map(([q, a], i) => h('details', i === 0 ? { open: '' } : {}, h('summary', {}, h('span', {}, q), icon('down')), h('p', {}, a)))),
  );
}

// Everything between the hero and the closing call to action. `tools` are app.js helpers that are not exported.
export function landingSections({ examplesList, appCover, openGate }) {
  const apps = S.apps.length > 0 && h('section', { class: 'lp-sec', id: 'lp-apps' },
    head('AI Apps', 'Or skip the prompt and start with an app', 'Ready-made tools. Add a photo, press a button, get the result.'),
    h('div', { class: 'app-grid' }, S.apps.slice(0, 8).map((a) => h('button', { class: 'appc', onclick: () => openGate({ appId: a.id }) }, appCover(a), h('span', { class: 'tag dim kindtag', style: { background: 'rgba(0,0,0,.45)', color: '#fff' } }, a.category === 'video' ? 'Video' : 'Image'), h('div', { class: 'body' }, h('b', {}, a.name), h('small', {}, a.tagline))))),
    S.apps.length > 8 && h('p', { class: 'lp-more' }, `And ${S.apps.length - 8} more inside. `, h('a', { href: '#/signup' }, 'Create a free account to see them all')),
  );
  if (pendingJump) { const id = pendingJump; pendingJump = ''; setTimeout(() => jump(id), 60); }
  return [featureGrid(), showcase(), howItWorks(openGate), apps, plans(examplesList), faq()];
}

// Numbers under the hero chat box, all read from the live app.
export function landingStats() {
  const free = S.config.plans[0].credits;
  const rows = [[S.models.length, 'AI models'], [S.apps.length, 'one-click apps'], [num(free), 'free credits to start'], ['$0', 'no card needed']].filter(([n]) => n);
  return h('div', { class: 'lp-stats' }, rows.map(([n, label]) => h('div', {}, h('b', {}, String(n)), h('small', {}, label))));
}

export function landingFooter() {
  const mail = mailTo();
  const col = (title, links) => h('div', { class: 'lp-fcol' }, h('b', {}, title), links);
  return h('footer', { class: 'lp-footer' },
    h('div', { class: 'lp-footer-in' },
      h('div', { class: 'lp-fbrand' },
        h('a', { class: 'brand', href: '#/' }, h('img', { src: '/logo.svg', alt: '' }), 'Scenly'),
        h('p', {}, 'The AI studio for images, video, ads and documents, with every leading model in one account.'),
        h('a', { class: 'btn primary', href: '#/signup' }, 'Start free'),
      ),
      col('Product', [jumpLink('Features', 'lp-feats'), jumpLink('Studios', 'lp-show'), jumpLink('Models', 'lp-models'), jumpLink('AI Apps', 'lp-apps'), jumpLink('Pricing', 'lp-plans'), jumpLink('FAQ', 'lp-faq'), h('a', { href: '#/help' }, 'Help centre')]),
      col('Account', [h('a', { href: '#/signup' }, 'Create an account'), h('a', { href: '#/login' }, 'Log in')]),
      col('Legal', [h('a', { href: '#/terms' }, 'Terms of Use'), h('a', { href: '#/privacy' }, 'Privacy Policy')]),
      col('Contact', [h('a', { href: 'mailto:' + mail }, mail), h('address', {}, LEGAL_COMPANY, ADDRESS.map((l) => [h('br'), l]))]),
    ),
    h('div', { class: 'lp-footer-base' }, h('span', {}, COPYRIGHT), h('span', {}, 'Scenly is a product of ', LEGAL_COMPANY, '.')),
  );
}
