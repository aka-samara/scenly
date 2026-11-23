// Crop and download for social sizes. Pick a format (TikTok, Reels, Shorts, stories, feeds), drag the video
// inside the frame (mouse or finger), download. The server cuts it with ffmpeg: no AI, no credits.
// The same maths (/vendor/crop-plan.js) decides the frame here and the cut on the server.
import { h, $, $$, icon, api, toast, errToast, dialog, startDownload, addDownload } from './app.js';
import { SHAPES, PRESETS, plan, closestShape, SOFT_SHORT } from '/vendor/crop-plan.js';

const SNAP = 0.035; // within this of the centre, the video snaps to it
const LAST = 'scenly-crop-last';
const remembered = () => { try { return JSON.parse(localStorage.getItem(LAST) || '{}'); } catch { return {}; } };
const remember = (v) => { try { localStorage.setItem(LAST, JSON.stringify(v)); } catch { /* private window */ } };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (n) => n.replace(/ \((.+)\)$/, ' · $1');

export async function openCrop(fileId, { title } = {}) {
  let info;
  try { info = await api(`/api/media/${fileId}/crop-info`); } catch (e) { return errToast(e); }
  const same = closestShape(info.w, info.h);
  // Shapes that differ from the video come first; its own shape last (useful only to zoom in).
  const shapes = [...SHAPES.filter((s) => s.id !== same), ...SHAPES.filter((s) => s.id === same)];
  const last = remembered();
  const st = {
    shape: shapes.find((s) => s.id === last.shape && s.id !== same)?.id || shapes[0].id,
    preset: null, mode: 'crop', pos: {}, busy: false, playing: true,
  };
  st.preset = PRESETS.find((p) => p.id === last.preset && p.shape === st.shape)?.id || PRESETS.find((p) => p.shape === st.shape).id;
  const pos = () => (st.pos[st.shape] ||= { x: 0.5, y: 0.5, zoom: 1 });
  const cur = () => plan({ srcW: info.w, srcH: info.h, shape: st.shape, mode: st.mode, ...pos() });

  // ---------- the stage: the video under a frame; the parts outside the frame are dimmed ----------
  const vid = h('video', { class: 'cr-vid', src: info.preview, poster: info.poster || null, muted: true, loop: true, autoplay: true, playsinline: true, preload: 'auto', disablepictureinpicture: true });
  const bg = h('div', { class: 'cr-bg' }, info.poster ? h('img', { src: info.poster, alt: '' }) : null);
  const frame = h('div', { class: 'cr-frame' }, h('span', { class: 'cr-gv' }), h('span', { class: 'cr-gh' }), h('span', { class: 'cr-thirds' }));
  const hint = h('div', { class: 'cr-hint' }, icon('expand'), 'Drag to place');
  const playBtn = h('button', { class: 'icon-btn sm cr-play', title: 'Pause', onclick: (e) => { e.stopPropagation(); st.playing = !st.playing; st.playing ? vid.play().catch(() => {}) : vid.pause(); playBtn.title = st.playing ? 'Pause' : 'Play'; playBtn.replaceChildren(icon(st.playing ? 'pause' : 'play')); } }, icon('pause'));
  const stage = h('div', { class: 'cr-stage', id: 'cr-stage' }, bg, vid, frame, hint, playBtn);

  // ---------- the options ----------
  const shapeRow = h('div', { class: 'cr-shapes', role: 'tablist' });
  const presetRow = h('div', { class: 'cr-presets' });
  const modeRow = h('div', { class: 'seg cr-mode' },
    h('button', { 'data-mode': 'crop', onclick: () => setMode('crop') }, 'Fill the frame'),
    h('button', { 'data-mode': 'fit', onclick: () => setMode('fit') }, 'Fit whole video'));
  const zoom = h('input', { type: 'range', min: '1', max: '3', step: '0.01', value: '1', id: 'cr-zoom', 'aria-label': 'Zoom', oninput: (e) => { pos().zoom = Number(e.target.value); draw(); } });
  const zoomRow = h('div', { class: 'cr-zoom' }, h('span', { class: 'lab' }, 'Zoom'), zoom,
    h('button', { class: 'btn ghost sm', id: 'cr-centre', title: 'Put the video back in the middle', onclick: () => { Object.assign(pos(), { x: 0.5, y: 0.5 }); draw(); } }, icon('target'), 'Centre'));
  const facts = h('div', { class: 'cr-facts', id: 'cr-facts' });
  const warn = h('div', { class: 'cr-warn', id: 'cr-warn', hidden: true });
  const dl = h('button', { class: 'btn primary', id: 'cr-dl', onclick: () => download() }, icon('dl'), 'Download', h('span', { class: 'cost' }, 'Free'));

  const d = dialog({
    title: 'Crop for social',
    sub: 'Pick where it goes, drag the video to place it, then download. Free, no credits.',
    wide: true,
    body: [h('div', { class: 'cr' }, stage, h('div', { class: 'cr-side' },
      h('div', { class: 'lab' }, 'Shape'), shapeRow,
      h('div', { class: 'lab' }, 'Made for'), presetRow,
      h('div', { class: 'lab' }, 'How it fills the frame'), modeRow, zoomRow, facts, warn))],
    foot: [h('small', { class: 'cr-foot-note' }, `Your video: ${info.w} × ${info.h}`), h('div', { class: 'grow' }), dl],
  });
  d.classList.add('crop-bg');
  d.querySelector('.dlg-box')?.classList.add('crop-box');

  function setMode(m) { st.mode = m; draw(); }
  function drawOptions() {
    shapeRow.replaceChildren(...shapes.map((s) => {
      const k = 22 / Math.max(s.w, s.h);
      return h('button', { class: 'cr-shape' + (s.id === st.shape ? ' on' : ''), role: 'tab', 'aria-selected': String(s.id === st.shape), 'data-shape': s.id, title: s.note, onclick: () => { st.shape = s.id; if (presetById(st.preset)?.shape !== s.id) st.preset = PRESETS.find((p) => p.shape === s.id).id; draw(); } },
        h('span', { class: 'ratio', style: { width: Math.round(s.w * k) + 'px', height: Math.round(s.h * k) + 'px' } }), h('b', {}, s.label), s.id === same && h('small', {}, 'Same as video'));
    }));
    presetRow.replaceChildren(...PRESETS.filter((p) => p.shape === st.shape).map((p) => h('button', { class: 'cr-chip' + (p.id === st.preset ? ' on' : ''), 'data-preset': p.id, onclick: () => { st.preset = p.id; drawOptions(); } }, short(p.name))));
    $$('button', modeRow).forEach((b) => b.classList.toggle('on', b.dataset.mode === st.mode));
  }
  const presetById = (pid) => PRESETS.find((p) => p.id === pid);

  // Where everything sits on the stage, in CSS pixels.
  let G = null;
  function layout() {
    const p = cur(); if (!p) return null;
    const SW = stage.clientWidth, SH = stage.clientHeight; if (!SW || !SH) return null;
    const r = p.outW / p.outH;
    let fw, fh;
    if (p.mode === 'fit') { fw = Math.min(SW * 0.9, SH * 0.9 * r); fh = fw / r; }
    else {
      // Leave room around the frame so the dimmed parts outside it show which way the video can move.
      const wide = info.w / info.h > r * 1.01, tall = info.w / info.h < r / 1.01;
      fw = Math.min(SW * (wide ? 0.6 : 0.88), SH * (tall ? 0.62 : 0.88) * r); fh = fw / r;
    }
    const fx = (SW - fw) / 2, fy = (SH - fh) / 2;
    if (p.mode === 'fit') { const k = fw / p.outW; return { p, fx, fy, fw, fh, vx: fx + p.video.x * k, vy: fy + p.video.y * k, vw: p.video.w * k, vh: p.video.h * k }; }
    const k = fw / p.crop.w; // screen pixels per video pixel
    // Continuous position (the plan rounds to whole pixels), so dragging feels smooth.
    const { x, y } = pos(); const cwv = p.crop.w, chv = p.crop.h;
    return { p, fx, fy, fw, fh, k, slackX: (info.w - cwv) * k, slackY: (info.h - chv) * k, vx: fx - (info.w - cwv) * x * k, vy: fy - (info.h - chv) * y * k, vw: info.w * k, vh: info.h * k };
  }
  function place() {
    G = layout(); if (!G) return;
    Object.assign(frame.style, { left: G.fx + 'px', top: G.fy + 'px', width: G.fw + 'px', height: G.fh + 'px' });
    Object.assign(vid.style, { left: G.vx + 'px', top: G.vy + 'px', width: G.vw + 'px', height: G.vh + 'px' });
    Object.assign(bg.style, { left: G.fx + 'px', top: G.fy + 'px', width: G.fw + 'px', height: G.fh + 'px' });
    const { x, y } = pos();
    frame.classList.toggle('snap-x', st.mode === 'crop' && G.slackX > 1 && x === 0.5);
    frame.classList.toggle('snap-y', st.mode === 'crop' && G.slackY > 1 && y === 0.5);
  }
  function drawFacts() {
    const p = cur(); if (!p) return;
    const pr = presetById(st.preset);
    facts.replaceChildren(
      h('span', {}, h('b', {}, `${p.outW} × ${p.outH}`), ' MP4'),
      h('span', {}, p.mode === 'fit' ? 'Whole video kept, blurred edges' : `Keeps ${p.keep}% of the picture`),
      info.duration ? h('span', {}, `${Math.round(info.duration)} s${info.hasAudio ? ', with sound' : ''}`) : null,
    );
    // Cropping only cuts the picture down, so warn when little real detail is left.
    if (p.mode === 'crop' && p.soft) {
      warn.hidden = false;
      warn.replaceChildren(icon('info'), h('div', {}, h('b', {}, 'This crop may look soft. '),
        `Only ${p.detail} pixels of your video are left across the short side, and ${pr ? short(pr.name) : 'social apps'} looks best at 1080. `,
        h('a', { href: '#', id: 'cr-tofit', onclick: (e) => { e.preventDefault(); setMode('fit'); } }, 'Fit the whole video instead'),
        pos().zoom > 1 ? [' or ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); pos().zoom = 1; draw(); } }, 'zoom out')] : null, '.'));
    } else warn.hidden = true;
  }
  function draw() {
    drawOptions();
    const cropMode = st.mode === 'crop';
    zoomRow.hidden = !cropMode; zoom.value = String(pos().zoom);
    stage.classList.toggle('fit', !cropMode);
    const G2 = layout(); const movable = cropMode && G2 && (G2.slackX > 1 || G2.slackY > 1);
    stage.classList.toggle('movable', !!movable);
    hint.hidden = !movable;
    hint.lastChild.textContent = movable ? (G2.slackX > 1 && G2.slackY > 1 ? 'Drag to place' : G2.slackX > 1 ? 'Drag left or right' : 'Drag up or down') : '';
    place(); drawFacts();
  }

  // ---------- dragging: mouse, pen and finger (pointer events), arrow keys too ----------
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (st.mode !== 'crop' || !G || e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: pos().x, y: pos().y };
    stage.setPointerCapture(e.pointerId); stage.classList.add('dragging'); hint.hidden = true; e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || pinch) return;
    const P = pos();
    if (G.slackX > 1) { let x = clamp(drag.x - (e.clientX - drag.sx) / G.slackX, 0, 1); if (Math.abs(x - 0.5) < SNAP) x = 0.5; P.x = x; }
    if (G.slackY > 1) { let y = clamp(drag.y - (e.clientY - drag.sy) / G.slackY, 0, 1); if (Math.abs(y - 0.5) < SNAP) y = 0.5; P.y = y; }
    place();
  });
  const end = (e) => { if (!drag || e.pointerId !== drag.id) return; drag = null; stage.classList.remove('dragging'); drawFacts(); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.tabIndex = 0; stage.setAttribute('aria-label', 'Video position. Use the arrow keys to move it.');
  stage.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02; const P = pos(); const k = { ArrowLeft: ['x', -1], ArrowRight: ['x', 1], ArrowUp: ['y', -1], ArrowDown: ['y', 1] }[e.key];
    if (!k || st.mode !== 'crop') return; e.preventDefault(); P[k[0]] = clamp(P[k[0]] + k[1] * step, 0, 1); place(); drawFacts();
  });
  // Mouse wheel or trackpad pinch zooms on a computer.
  stage.addEventListener('wheel', (e) => { if (st.mode !== 'crop') return; e.preventDefault(); pos().zoom = clamp(pos().zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 1, 3); draw(); }, { passive: false });
  // Two fingers pinch to zoom on a phone.
  let pinch = null;
  stage.addEventListener('touchstart', (e) => { if (e.touches.length === 2 && st.mode === 'crop') { const [a, b] = e.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: pos().zoom }; } }, { passive: true });
  stage.addEventListener('touchmove', (e) => { if (pinch && e.touches.length === 2) { const [a, b] = e.touches; pos().zoom = clamp(pinch.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d, 1, 3); zoom.value = String(pos().zoom); place(); } }, { passive: true });
  stage.addEventListener('touchend', () => { if (pinch) { pinch = null; draw(); } });

  const ro = new ResizeObserver(() => place()); ro.observe(stage);
  new MutationObserver((_, mo) => { if (!d.isConnected) { ro.disconnect(); vid.pause(); vid.removeAttribute('src'); vid.load(); mo.disconnect(); } }).observe(document.body, { childList: true });

  // ---------- download ----------
  async function download() {
    if (st.busy) return; st.busy = true; dl.disabled = true;
    const label = (t) => dl.replaceChildren(h('span', { class: 'spin' }), t);
    label('Getting it ready…');
    const body = { preset: st.preset, shape: st.shape, mode: st.mode, ...pos() };
    remember({ shape: st.shape, preset: st.preset });
    try {
      let r = await api(`/api/media/${fileId}/crop`, { method: 'POST', body });
      if (!r.ready) {
        const jid = r.job.id;
        for (let i = 0; ; i++) {
          await wait(i < 4 ? 500 : 900);
          if (!d.isConnected) { toast('Your crop keeps going. Open Crop for social again to download it.'); return; }
          const { job } = await api('/api/jobs/' + jid);
          if (job.status === 'done') break;
          if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error || 'The crop did not finish. Please try again.');
          label(job.status === 'queued' ? 'Waiting to start…' : `Cropping ${Math.round((job.progress || 0) * 100)}%`);
        }
        r = await api(`/api/media/${fileId}/crop`, { method: 'POST', body });
      }
      startDownload(r.url); addDownload({ name: r.name, size: r.size, url: r.url, expires: Date.now() + r.expiresIn * 1000 });
      const pr = presetById(st.preset);
      toast(`${pr ? short(pr.name) : 'Your'} crop is downloading. Pick another shape to make more.`);
    } catch (e) { errToast(e); }
    finally { st.busy = false; if (dl.isConnected) { dl.disabled = false; dl.replaceChildren(icon('dl'), 'Download', h('span', { class: 'cost' }, 'Free')); } }
  }

  vid.addEventListener('loadedmetadata', place);
  vid.play?.().catch(() => {});
  requestAnimationFrame(draw);
  return d;
}
