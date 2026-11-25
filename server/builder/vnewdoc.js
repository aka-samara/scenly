// Video (new) settings kept on a project (project.vnew) and the finishing pass at export (look filter, logo in a corner).
// No imports, so routes.js and render.js can use it without a circular import.
const text = (v, max) => String(v ?? '').replace(/\u0000/g, '').slice(0, max).trim();

// Looks are colour filters added at export: free, and changing one never remakes a scene.
export const LOOKS = {
  auto: { label: 'Auto', vf: '' },
  clean: { label: 'Clean', vf: '' },
  warm: { label: 'Warm film', vf: 'colorbalance=rs=.06:gs=.02:bs=-.06,eq=saturation=1.06:contrast=1.03' },
  cool: { label: 'Cool', vf: 'colorbalance=rs=-.05:gs=0:bs=.07' },
  grain: { label: 'Grain', vf: 'noise=alls=9:allf=t,eq=contrast=1.04' },
  vivid: { label: 'Vivid', vf: 'eq=saturation=1.3:contrast=1.06' },
  mono: { label: 'Black and white', vf: 'hue=s=0,eq=contrast=1.08' },
  vintage: { label: 'Vintage', vf: 'curves=preset=vintage' },
};
export const CORNERS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];

/** Cleans what the browser sends as project.vnew: chips that are remembered with the video. */
export function cleanVnew(input, fileOf, old = {}) {
  const v = { ...(old || {}) };
  if (!input || typeof input !== 'object') return v;
  if (input.look != null) v.look = LOOKS[input.look] ? input.look : 'auto';
  if (input.camera != null) v.camera = text(input.camera, 40);
  if (input.skill != null) v.skill = text(input.skill, 40);
  if (input.voiceId != null) v.voiceId = text(input.voiceId, 120);
  if (input.characterIds != null) v.characterIds = [].concat(input.characterIds).map((x) => text(x, 40)).filter(Boolean).slice(0, 4);
  if (input.sizes != null) v.sizes = [].concat(input.sizes).filter((s) => ['9x16', '1x1', '16x9', '4x5', '2x3'].includes(s)).slice(0, 5);
  if (input.captions != null) v.captions = !!input.captions;
  if (input.mode != null) v.mode = input.mode === 'build' ? 'build' : 'agent';
  if (input.started != null) v.started = !!input.started;
  if (input.brand !== undefined) {
    const b = input.brand;
    if (!b) v.brand = null;
    else {
      const logo = b.logoFileId && fileOf(b.logoFileId);
      v.brand = { name: text(b.name, 80), logoFileId: logo?.kind === 'image' ? logo.id : undefined, corner: !!b.corner && !!logo, cornerAt: CORNERS.includes(b.cornerAt) ? b.cornerAt : 'top-right', endCard: !!b.endCard, sting: !!b.sting };
    }
  }
  return v;
}

/** The finishing pass at export: look filter and the logo in a corner. Returns ffmpeg args, or null when nothing is asked. */
export function finishArgs(project, src, out, logoPath) {
  const look = LOOKS[project.vnew?.look]?.vf || '';
  const corner = project.vnew?.brand?.corner && logoPath ? (project.vnew.brand.cornerAt || 'top-right') : '';
  if (!look && !corner) return null;
  if (!corner) return ['-i', src, '-vf', look + ',format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-c:a', 'copy', '-movflags', '+faststart', out];
  const m = 'main_w*0.03';
  const xy = { 'top-right': [`main_w-overlay_w-${m}`, m], 'top-left': [m, m], 'bottom-right': [`main_w-overlay_w-${m}`, `main_h-overlay_h-${m}`], 'bottom-left': [m, `main_h-overlay_h-${m}`] }[corner];
  const base = look ? `[0:v]${look}[b]` : '[0:v]null[b]';
  // The logo is scaled to 12% of the frame's short side and shown slightly see-through, like a broadcast mark.
  const fc = `${base};[1:v][b]scale2ref=w='min(main_w,main_h)*0.12*iw/ih':h='min(main_w,main_h)*0.12'[lg][bb];[lg]format=rgba,colorchannelmixer=aa=0.88[lga];[bb][lga]overlay=x=${xy[0]}:y=${xy[1]}:format=auto,format=yuv420p[v]`;
  return ['-i', src, '-loop', '1', '-i', logoPath, '-filter_complex', fc, '-map', '[v]', '-map', '0:a?', '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-c:a', 'copy', '-movflags', '+faststart', out];
}

