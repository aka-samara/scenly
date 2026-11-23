// Crop and download for social sizes: the shapes, and the maths that turns a position in a frame into ffmpeg numbers.
// Pure, no imports: the same file runs on the server and in the browser (served as /vendor/crop-plan.js),
// so what the person sees in the frame is exactly what ffmpeg cuts.

// Each preset is a social format. Several share one shape; the shape decides the crop, the name goes in the file name.
export const SHAPES = [
  { id: '9x16', w: 9, h: 16, label: '9:16', note: 'Tall, full screen on a phone' },
  { id: '4x5', w: 4, h: 5, label: '4:5', note: 'Tall feed post' },
  { id: '1x1', w: 1, h: 1, label: '1:1', note: 'Square' },
  { id: '2x3', w: 2, h: 3, label: '2:3', note: 'Tall pin' },
  { id: '16x9', w: 16, h: 9, label: '16:9', note: 'Wide, like a TV' },
];
export const PRESETS = [
  { id: 'tiktok', name: 'TikTok video', shape: '9x16' },
  { id: 'tiktok-story', name: 'TikTok story', shape: '9x16' },
  { id: 'ig-story', name: 'Instagram story', shape: '9x16' },
  { id: 'ig-reels', name: 'Instagram Reels', shape: '9x16' },
  { id: 'fb-story', name: 'Facebook story', shape: '9x16' },
  { id: 'fb-reels', name: 'Facebook Reels', shape: '9x16' },
  { id: 'yt-shorts', name: 'YouTube Shorts', shape: '9x16' },
  { id: 'snapchat', name: 'Snapchat', shape: '9x16' },
  { id: 'ig-portrait', name: 'Instagram feed (portrait)', shape: '4x5' },
  { id: 'fb-feed', name: 'Facebook feed (portrait)', shape: '4x5' },
  { id: 'ig-square', name: 'Instagram feed (square)', shape: '1x1' },
  { id: 'fb-square', name: 'Facebook feed (square)', shape: '1x1' },
  { id: 'linkedin-square', name: 'LinkedIn (square)', shape: '1x1' },
  { id: 'pinterest', name: 'Pinterest', shape: '2x3' },
  { id: 'youtube', name: 'YouTube video', shape: '16x9' },
  { id: 'x-wide', name: 'X (Twitter)', shape: '16x9' },
  { id: 'linkedin-wide', name: 'LinkedIn (wide)', shape: '16x9' },
  { id: 'fb-wide', name: 'Facebook (wide)', shape: '16x9' },
];
export const shapeById = (id) => SHAPES.find((s) => s.id === id) || null;
export const presetById = (id) => PRESETS.find((p) => p.id === id) || null;

const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const MAX_SHORT = 1080; // the size the social apps show at most (1080 x 1920, 1080 x 1080 ...); anything bigger is scaled down to save time and space
export const SOFT_SHORT = 720; // under this on the short side the result looks soft on a phone

// The shape closest to the source, so the list can put the other shapes first.
export function closestShape(srcW, srcH) {
  const r = srcW / srcH; let best = null;
  for (const s of SHAPES) { const d = Math.abs(Math.log((s.w / s.h) / r)); if (!best || d < best.d) best = { s, d }; }
  return best && best.d < 0.04 ? best.s.id : null; // within about 4 percent counts as the same shape
}

// mode 'crop': fill the frame, cutting the parts outside it. x and y are 0..1 (0 = left/top edge, 0.5 = centre).
// zoom >= 1 cuts tighter. mode 'fit': the whole video sits in the frame on a blurred copy of itself.
// Returns the source window (crop), the output size and how sharp it will look.
export function plan({ srcW, srcH, shape, mode = 'crop', x = 0.5, y = 0.5, zoom = 1 }) {
  const s = typeof shape === 'string' ? shapeById(shape) : shape;
  if (!s || !(srcW > 0) || !(srcH > 0)) return null;
  const r = s.w / s.h;
  x = clamp(Number(x) || 0, 0, 1); y = clamp(Number(y) || 0, 0, 1); zoom = clamp(Number(zoom) || 1, 1, 4);
  if (mode === 'fit') {
    // The canvas holds the whole video at its own size along one side, then is capped at MAX_SHORT on its short side.
    let cw = Math.max(srcW, srcH * r); let ch = cw / r;
    const k = Math.min(1, MAX_SHORT / Math.min(cw, ch)); cw = even(cw * k); ch = even(cw / r);
    const fs = Math.min(cw / srcW, ch / srcH); const vw = even(srcW * fs); const vh = even(srcH * fs);
    return { mode, shape: s.id, outW: cw, outH: ch, video: { w: vw, h: vh, x: Math.round((cw - vw) / 2), y: Math.round((ch - vh) / 2) }, detail: Math.min(vw, vh), soft: false, keep: 100 }; // nothing is cut, so it is as sharp as the video itself
  }
  let cw = Math.min(srcW, srcH * r) / zoom; let ch = cw / r;
  cw = even(cw); ch = even(Math.min(srcH, cw / r));
  const cx = Math.round((srcW - cw) * x); const cy = Math.round((srcH - ch) * y);
  const short = Math.min(cw, ch); // real picture pixels on the short side, before any scaling
  // Big crops are scaled down to what the apps show; small ones up to at least 720 on the short side, because some apps refuse tiny videos.
  const k = Math.min(MAX_SHORT / short, Math.max(1, SOFT_SHORT / short));
  const outW = even(cw * k); const outH = even(outW / r);
  return { mode, shape: s.id, crop: { w: cw, h: ch, x: clamp(cx, 0, srcW - cw), y: clamp(cy, 0, srcH - ch) }, outW, outH, detail: short, soft: short < SOFT_SHORT, keep: Math.round((cw * ch) / (srcW * srcH) * 100) };
}

// ffmpeg -vf / -filter_complex for a plan. 'fit' needs filter_complex (the blurred copy).
export function filterFor(p) {
  if (!p) return null;
  if (p.mode === 'fit') {
    const v = p.video;
    return { complex: `[0:v]scale=${p.outW}:${p.outH}:force_original_aspect_ratio=increase,crop=${p.outW}:${p.outH},boxblur=luma_radius=min(h\\,w)/20:luma_power=2,eq=brightness=-0.06[bg];[0:v]scale=${v.w}:${v.h}[fg];[bg][fg]overlay=${v.x}:${v.y},setsar=1,format=yuv420p[v]` };
  }
  const c = p.crop;
  const scale = p.outW !== c.w || p.outH !== c.h ? `,scale=${p.outW}:${p.outH}:flags=lanczos` : '';
  return { vf: `crop=${c.w}:${c.h}:${c.x}:${c.y}${scale},setsar=1,format=yuv420p` };
}
