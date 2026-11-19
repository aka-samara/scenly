// Video Builder: the pure part. Timeline maths, credit estimate, captions and every ffmpeg command line.
// Nothing here touches the disk or the network, so all of it is covered by unit tests.
export const FPS = 30;
export const SAMPLE_RATE = 48000;
export const XFADE_SEC = 0.5; // crossfade length
export const FADE_SEC = 0.4; // fade to black: out, then in
export const IMAGE_SEC = 4; // default time a picture stays on screen
export const MIN_SCENE_SEC = 0.5;
export const MAX_SCENES = 120;
export const MAX_PROJECT_SEC = 20 * 60;
export const TRANSITIONS = ['cut', 'crossfade', 'black'];
export const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:3': [4, 3], '3:4': [3, 4], '21:9': [21, 9] };
const SHORT = { '480p': 480, '720p': 720, '1080p': 1080 };

const even = (n) => Math.max(2, Math.round(n / 2) * 2);
export const toFrames = (sec) => Math.max(1, Math.round((Number(sec) || 0) * FPS));
export const frameSec = (frames) => frames / FPS;
const r3 = (n) => Math.round(n * 1000) / 1000;

// Pixel size for a ratio and resolution. The short side is the "p" number.
export function dims(ratio = '16:9', resolution = '720p') {
  const [a, b] = RATIOS[ratio] || RATIOS['16:9']; const s = SHORT[resolution] || 720;
  return a >= b ? { w: even((s * a) / b), h: s } : { w: s, h: even((s * b) / a) };
}

// How long a scene plays, from its source and its trim points.
// Which stretch of the source plays. A version that was made from a time range (precision editing) carries its own window,
// so flipping between the original footage and a retake never changes the length of the video.
export const curVersion = (scene) => (scene.type === 'ai' ? scene.versions?.[scene.cur ?? ((scene.versions?.length || 1) - 1)] || null : null);
export function sceneWindow(scene) {
  const v = curVersion(scene);
  return v && v.tin != null ? { tin: Number(v.tin) || 0, tout: Number(v.tout) > 0 ? Number(v.tout) : null } : { tin: Number(scene.trimIn) || 0, tout: scene.trimOut != null && Number(scene.trimOut) > 0 ? Number(scene.trimOut) : null };
}
export const MAX_REVERSE_SEC = 8; // playing backwards holds every frame in memory, so it is kept to short scenes
export const sceneSpeed = (scene) => { const s = Number(scene.speed); return scene.type !== 'image' && s >= 0.5 && s <= 2 ? s : 1; };
export function sceneSeconds(scene, src) {
  if (scene.type === 'image') return Math.max(MIN_SCENE_SEC, Math.min(60, Number(scene.duration) || IMAGE_SEC));
  const full = Number(src?.duration) || Number(scene.duration) || 0; const w = sceneWindow(scene);
  const tin = Math.max(0, Math.min(w.tin, Math.max(0, full - MIN_SCENE_SEC)));
  const tout = w.tout != null ? Math.min(w.tout, full || w.tout) : full;
  return Math.max(full ? Math.min(MIN_SCENE_SEC, full) : 0, (tout - tin) / sceneSpeed(scene));
}
export const sceneSource = (scene, files) => { const fid = scene.type === 'ai' ? scene.versions?.[scene.cur ?? (scene.versions.length - 1)]?.fileId : scene.fileId; return fid ? files.get(fid) || null : null; };

// The timeline: where each scene starts, how long it is seen, and what happens between scenes.
// A crossfade overlaps two scenes, so the video gets shorter by its length. Scenes without a clip yet keep their planned length.
export function layout(project, files) {
  const hasVoice = !!project.voice?.fileId;
  const rows = project.scenes.map((scene) => {
    const src = sceneSource(scene, files);
    const planned = scene.type === 'ai' && !src;
    const sec = planned ? Math.max(MIN_SCENE_SEC, Number(scene.duration) || 5) : sceneSeconds(scene, src);
    return { scene, src, ready: !!src, frames: toFrames(sec), trimIn: scene.type === 'image' ? 0 : Math.max(0, sceneWindow(scene).tin), speed: sceneSpeed(scene), reverse: !!scene.reverse && scene.type !== 'image', volume: scene.volume != null ? Math.max(0, Math.min(2, Number(scene.volume))) : hasVoice ? 0 : 1, xIn: 0, xOut: 0, fadeIn: 0, fadeOut: 0 };
  });
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1]; const t = TRANSITIONS.includes(a.scene.transition) ? a.scene.transition : 'cut';
    if (t === 'crossfade') { const d = Math.min(toFrames(XFADE_SEC), Math.floor((a.frames - a.xIn) / 3), Math.floor(b.frames / 3)); if (d >= 3) { a.xOut = d; b.xIn = d; } }
    else if (t === 'black') { const d = Math.min(toFrames(FADE_SEC), Math.floor((a.frames - a.xIn) / 3), Math.floor(b.frames / 3)); if (d >= 2) { a.fadeOut = d; b.fadeIn = d; } }
  }
  let at = 0;
  for (const r of rows) { r.startFrame = at; r.start = r3(frameSec(at)); r.seconds = r3(frameSec(r.frames)); at += r.frames - r.xOut; }
  return { rows, frames: at, seconds: r3(frameSec(at)) };
}

// What has to be made, in playing order: a body for every scene and a blended piece for every crossfade.
export function pieces(lay) {
  const out = [];
  lay.rows.forEach((r, i) => {
    const body = r.frames - r.xIn - r.xOut;
    out.push({ kind: 'body', row: i, from: r.xIn, frames: body, fadeIn: r.fadeIn, fadeOut: r.fadeOut });
    if (r.xOut) out.push({ kind: 'xfade', row: i, frames: r.xOut, a: { row: i, from: r.frames - r.xOut, frames: r.xOut }, b: { row: i + 1, from: 0, frames: r.xOut } });
  });
  return out;
}

// ---------- ffmpeg command lines ----------
const VCODEC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2), '-video_track_timescale', '15360', '-an'];
const fitFilter = (w, h, fit) => (fit === 'crop'
  ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
  : `split[bgi][fgi];[bgi]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=24:4[bg];[fgi]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`);

// One part of one scene: a silent video file and a sound file of exactly the same length.
// part = { from, frames, fadeIn, fadeOut } in frames, counted from the scene's own start (after its trim).
export function pieceArgs({ src, type, hasAudio, trimIn = 0, volume = 1, fit = 'pad', w, h, speed = 1, reverse = false, rowFrames = 0 }, part, outVideo, outAudio) {
  const sec = frameSec(part.frames); const srcSec = sec * speed; // how much of the source this part uses
  // Played backwards, the first frames shown are the last ones of the scene's stretch of the source.
  const ss = r3(reverse ? Math.max(0, trimIn + (frameSec(rowFrames) - frameSec(part.from) - sec) * speed) : trimIn + frameSec(part.from) * speed);
  const tempo = speed !== 1 ? `,setpts=PTS/${r3(speed)}` : ''; const atempo = speed !== 1 ? `,atempo=${r3(speed)}` : '';
  const fades = []; const afades = [];
  if (part.fadeIn) { fades.push(`fade=t=in:st=0:d=${r3(frameSec(part.fadeIn))}`); afades.push(`afade=t=in:st=0:d=${r3(frameSec(part.fadeIn))}`); }
  if (part.fadeOut) { const st = r3(sec - frameSec(part.fadeOut)); fades.push(`fade=t=out:st=${st}:d=${r3(frameSec(part.fadeOut))}`); afades.push(`afade=t=out:st=${st}:d=${r3(frameSec(part.fadeOut))}`); }
  const vchain = reverse
    ? `[0:v]${fitFilter(w, h, fit)},setsar=1,fps=${FPS},trim=end_frame=${Math.ceil(srcSec * FPS)},reverse,setpts=PTS-STARTPTS${tempo},fps=${FPS},tpad=stop_mode=clone:stop_duration=1,format=yuv420p${fades.length ? ',' + fades.join(',') : ''}[v]`
    : `[0:v]${fitFilter(w, h, fit)},setsar=1${tempo},fps=${FPS},tpad=stop_mode=clone:stop_duration=1,format=yuv420p${fades.length ? ',' + fades.join(',') : ''}[v]`;
  const input = type === 'image' ? ['-loop', '1', '-framerate', String(FPS), '-t', String(r3(sec + 1)), '-i', src] : ['-ss', String(ss), '-t', String(r3(reverse ? srcSec : srcSec + 1)), '-i', src];
  const useAudio = type !== 'image' && hasAudio && volume > 0;
  const audioIn = useAudio ? [] : ['-f', 'lavfi', '-t', String(r3(sec + 1)), '-i', `anullsrc=r=${SAMPLE_RATE}:cl=stereo`];
  const achain = `[${useAudio ? '0:a' : '1:a'}]aresample=${SAMPLE_RATE},aformat=sample_fmts=s16:channel_layouts=stereo${useAudio && reverse ? ',areverse' : ''}${useAudio ? atempo : ''}${useAudio && volume !== 1 ? `,volume=${r3(volume)}` : ''},apad${afades.length ? ',' + afades.join(',') : ''},atrim=end_sample=${Math.round(sec * SAMPLE_RATE)}[a]`;
  return [...input, ...audioIn, '-filter_complex', `${vchain};${achain}`,
    '-map', '[v]', '-frames:v', String(part.frames), ...VCODEC, '-f', 'mp4', outVideo,
    '-map', '[a]', '-c:a', 'pcm_s16le', '-ar', String(SAMPLE_RATE), '-ac', '2', '-f', 'wav', outAudio];
}

// A crossfade between the end of one scene and the start of the next.
export function xfadeArgs(a, b, frames, outVideo, outAudio) {
  const d = r3(frameSec(frames));
  return ['-i', a.video, '-i', b.video, '-i', a.audio, '-i', b.audio,
    '-filter_complex', `[0:v][1:v]xfade=transition=fade:duration=${d}:offset=0,format=yuv420p[v];[2:a][3:a]acrossfade=d=${d}:c1=tri:c2=tri,atrim=end_sample=${Math.round(d * SAMPLE_RATE)}[a]`,
    '-map', '[v]', '-frames:v', String(frames), ...VCODEC, '-f', 'mp4', outVideo,
    '-map', '[a]', '-c:a', 'pcm_s16le', '-ar', String(SAMPLE_RATE), '-ac', '2', '-f', 'wav', outAudio];
}

export const concatList = (files) => files.map((f) => `file '${String(f).replace(/'/g, "'\\''")}'`).join('\n') + '\n';
export const concatArgs = (listFile, out, { audio = false } = {}) => ['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', ...(audio ? ['-f', 'wav'] : ['-f', 'mp4']), out];

// Music that is shorter than the video is repeated with a short blend at each join.
export function loopMusicArgs(src, musicSec, totalSec, out, blend = 2) {
  const d = Math.min(blend, Math.max(0.2, musicSec / 4)); const n = Math.min(40, Math.max(2, Math.ceil((totalSec - d) / Math.max(0.5, musicSec - d))));
  const ins = []; for (let i = 0; i < n; i++) ins.push('-i', src);
  let chain = ''; let last = '0:a';
  for (let i = 1; i < n; i++) { chain += `[${last}][${i}:a]acrossfade=d=${r3(d)}:c1=tri:c2=tri[m${i}];`; last = `m${i}`; }
  return { copies: n, args: [...ins, '-filter_complex', `${chain}[${last}]aresample=${SAMPLE_RATE},aformat=sample_fmts=s16:channel_layouts=stereo[a]`, '-map', '[a]', '-c:a', 'pcm_s16le', '-f', 'wav', out] };
}

// The final sound: scene sound + voice-over + music, with the music dipping under the voice.
// tracks: { scenes: path, voice?: { path, volume, offset }, music?: { path, volume, duck, duckDb } }
export function mixArgs(video, tracks, totalSec, out, { audioOnly = false } = {}) {
  const ins = audioOnly ? [] : ['-i', video]; const base = audioOnly ? 0 : 1;
  ins.push('-i', tracks.scenes); const parts = []; const labels = [];
  const fmt = `aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo`;
  parts.push(`[${base}:a]${fmt}[s]`); labels.push('[s]');
  let idx = base + 1; let voiceKey = null;
  if (tracks.voice) {
    ins.push('-i', tracks.voice.path); const off = Math.max(0, Math.round((tracks.voice.offset || 0) * 1000));
    const duck = tracks.music && tracks.music.duck !== false;
    const vf = []; const vin = Math.min(10, Number(tracks.voice.fadeIn) || 0), vout = Math.min(10, Number(tracks.voice.fadeOut) || 0), vdur = Number(tracks.voice.duration) || 0;
    if (vin > 0) vf.push(`afade=t=in:st=0:d=${r3(vin)}`); if (vout > 0 && vdur > vout) vf.push(`afade=t=out:st=${r3(vdur - vout)}:d=${r3(vout)}`);
    parts.push(`[${idx}:a]${fmt}${vf.length ? ',' + vf.join(',') : ''},volume=${r3(tracks.voice.volume ?? 1)}${off ? `,adelay=${off}:all=1` : ''}${duck ? ',asplit=2[vo][vk]' : '[vo]'}`); labels.push('[vo]'); if (duck) voiceKey = '[vk]'; idx++;
  }
  if (tracks.music) {
    ins.push('-i', tracks.music.path); const fade = Math.min(Math.max(2, Math.min(10, Number(tracks.music.fadeOut) || 0)), totalSec / 4); const vol = r3(tracks.music.volume ?? 0.5); const min = Math.min(10, Number(tracks.music.fadeIn) || 0, totalSec / 4);
    parts.push(`[${idx}:a]${fmt},atrim=0:${r3(totalSec)}${min > 0 ? `,afade=t=in:st=0:d=${r3(min)}` : ''},afade=t=out:st=${r3(Math.max(0, totalSec - fade))}:d=${r3(fade)},volume=${vol}[mu]`);
    if (voiceKey) { const ratio = Math.max(2, Math.min(20, Math.round((Number(tracks.music.duckDb) || 12) / 3))); parts.push(`[mu]${voiceKey}sidechaincompress=threshold=0.03:ratio=${ratio}:attack=40:release=500[mud]`); labels.push('[mud]'); } else labels.push('[mu]');
    idx++;
  }
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95,apad,atrim=0:${r3(totalSec)}[a]`);
  const codec = ['-c:a', 'aac', '-b:a', '192k', '-ar', String(SAMPLE_RATE), '-ac', '2'];
  return audioOnly
    ? [...ins, '-filter_complex', parts.join(';'), '-map', '[a]', ...codec, '-f', 'ipod', out]
    : [...ins, '-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', ...codec, '-movflags', '+faststart', '-f', 'mp4', out];
}

// ---------- captions ----------
const stamp = (sec) => { const ms = Math.max(0, Math.round(sec * 1000)); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
export function cleanCaptions(captions, totalSec = Infinity) {
  // Captions sit at the bottom. Text overlays are captions with a place of their own: a title in the middle, a line at the top, a lower third.
  const all = (captions || []).map((c) => ({ start: Math.max(0, Number(c.start) || 0), end: Math.min(totalSec, Number(c.end) || 0), text: String(c.text || '').replace(/\r/g, '').replace(/[{}\\]/g, '').replace(/\n{2,}/g, '\n').trim().slice(0, 300), ...(CAPTION_POS[c.pos] ? { pos: c.pos } : {}) }))
    .filter((c) => c.text && c.end > c.start).sort((a, b) => a.start - b.start);
  // two texts in the same place never overlap; a caption and a title may show together
  return all.map((c, i) => { const next = all.slice(i + 1).find((x) => (x.pos || '') === (c.pos || '')); return { ...c, end: next ? Math.min(c.end, next.start) : c.end }; }).filter((c) => c.end - c.start >= 0.05);
}
export const CAPTION_POS = { top: { label: 'Top', tag: '{\\an8}' }, middle: { label: 'Title in the middle', tag: '{\\an5\\fs30\\b1}' }, lower: { label: 'Lower third', tag: '{\\an1\\fs18\\b1}' } };
// The .srt people download holds the spoken captions only; the burned-in version also carries the text overlays, each in its place.
export const toSrt = (captions, totalSec, { overlays = false } = {}) => cleanCaptions(captions, totalSec).filter((c) => overlays || !c.pos)
  .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${overlays && c.pos ? CAPTION_POS[c.pos].tag : ''}${c.text}\n`).join('\n');
export const CAPTION_STYLES = {
  clean: { label: 'Clean', style: 'FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.2,Shadow=0.6,MarginV=28,Alignment=2' },
  boxed: { label: 'Boxed', style: 'FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=28,Alignment=2' },
  bold: { label: 'Bold yellow', style: 'FontName=Arial,FontSize=20,Bold=1,PrimaryColour=&H0000E6FF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=34,Alignment=2' },
};
// Runs inside the folder that holds the .srt, so the file name needs no escaping.
export const burnArgs = (video, srtName, styleKey, out) => ['-i', video, '-vf', `subtitles=${srtName}:force_style='${(CAPTION_STYLES[styleKey] || CAPTION_STYLES.clean).style}'`,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', '-f', 'mp4', out];

// ---------- credits ----------
// Only AI scenes that still have to be generated cost credits. Uploads, assembly and export are free.
export function allowedDuration(model, wantSec) {
  const ds = (model?.video?.durations || []).filter((d) => d > 0).sort((a, b) => a - b);
  if (!ds.length) return null;
  return ds.find((d) => d >= wantSec - 0.001) ?? ds[ds.length - 1]; // the shortest clip that covers the scene; it is trimmed at assembly
}
export function sceneCredits(model, resolution, wantSec) {
  const d = allowedDuration(model, wantSec); if (d == null) return 0;
  const per = model.price?.creditsPerSecond?.[resolution] ?? Object.values(model.price?.creditsPerSecond || {})[0] ?? 0;
  return Math.round(per * d * 100) / 100;
}
// "Change it" sends a cut of the video to a model that edits video. It is priced by the length of the cut.
export function editCredits(model, resolution, sec) {
  const d = allowedDuration(model, sec) ?? Math.max(1, Math.ceil(sec - 0.001));
  const per = model?.price?.creditsPerSecond?.[resolution] ?? Object.values(model?.price?.creditsPerSecond || {})[0] ?? 0;
  return Math.round(per * d * 100) / 100;
}
export function estimate(project, models, { only } = {}) {
  let total = 0; const scenes = [];
  for (const s of project.scenes) {
    if (s.type !== 'ai' || s.locked || (only ? !only.includes(s.id) : s.versions?.length)) continue;
    const m = models.find((x) => x.id === (s.modelId || project.modelId)); const res = m?.video?.resolutions?.includes(project.resolution) ? project.resolution : m?.video?.resolutions?.[0];
    const c = m ? sceneCredits(m, res, Number(s.duration) || 5) : 0; scenes.push({ id: s.id, credits: c, seconds: m ? allowedDuration(m, Number(s.duration) || 5) : 0 }); total += c;
  }
  return { total: Math.round(total * 100) / 100, scenes };
}
