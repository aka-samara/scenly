// ffmpeg and ffprobe: found once at startup, every run is logged, nothing here throws at import time.
// Features that need ffmpeg ask ffmpegInfo().ok first and explain plainly when it is missing.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DATA_DIR } from './db.js';

const LOG_DIR = path.join(DATA_DIR, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG = path.join(LOG_DIR, 'ffmpeg.log');
function log(line) {
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 5 * 1024 * 1024) fs.renameSync(LOG, LOG + '.1');
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
  } catch { /* logging must never break a job */ }
}

function find(name, envName) {
  if (/^(1|true|on|yes)$/i.test(process.env.FFMPEG_OFF || '')) return null; // switch for servers that must not run it
  const tries = [process.env[envName], name, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`].filter(Boolean);
  for (const bin of tries) {
    try {
      const r = spawnSync(bin, ['-version'], { encoding: 'utf8', timeout: 8000 });
      if (r.status === 0 && r.stdout) return { bin, version: (r.stdout.split('\n')[0].match(/version\s+(\S+)/) || [])[1] || 'unknown' };
    } catch { /* try the next place */ }
  }
  return null;
}

let info = null;
export function ffmpegInfo(refresh = false) {
  if (info && !refresh) return info;
  const ff = find('ffmpeg', 'FFMPEG_PATH'); const fp = find('ffprobe', 'FFPROBE_PATH');
  info = { ok: !!(ff && fp), ffmpeg: ff?.bin || null, ffprobe: fp?.bin || null, version: ff?.version || null };
  // Some builds (for example the slim Homebrew one) cannot draw text, so burned-in captions are checked for, not assumed.
  info.canBurn = false;
  if (info.ok && !/^(1|true|on|yes)$/i.test(process.env.FFMPEG_NO_SUBTITLES || '')) {
    try { const r = spawnSync(info.ffmpeg, ['-hide_banner', '-filters'], { encoding: 'utf8', timeout: 8000 }); info.canBurn = /^\s*\S+\s+subtitles\s/m.test(r.stdout || ''); } catch { /* stays off */ }
  }
  log(info.ok ? `startup: ffmpeg ${info.version} at ${info.ffmpeg}, ffprobe at ${info.ffprobe}, burned captions ${info.canBurn ? 'available' : 'not available in this build'}` : `startup: ffmpeg not found (ffmpeg=${info.ffmpeg}, ffprobe=${info.ffprobe})`);
  return info;
}
export const BURN_HELP = 'This computer\'s ffmpeg cannot draw text onto video, so captions come as a separate .srt file instead. On a Mac, "brew install ffmpeg-full" adds it.';
export const FFMPEG_HELP = 'Video tools need ffmpeg on this computer. On a Mac, run "brew install ffmpeg" in Terminal, then start Scenly again.';
export class FfmpegError extends Error { constructor(message, detail) { super(message); this.detail = detail; this.status = 500; this.expose = true; } }
export function needFfmpeg() { if (!ffmpegInfo().ok) { const e = new FfmpegError(FFMPEG_HELP); e.status = 503; e.code = 'ffmpeg_missing'; throw e; } }

function exec(bin, args, { timeoutMs = 10 * 60 * 1000, signal, capture = false, cwd, wantErr = false, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const p = spawn(bin, args, { cwd, stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    let out = ''; let err = ''; let full = ''; let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); fn(v); };
    const kill = (why) => { try { p.kill('SIGKILL'); } catch { /* gone */ } log(`${why} after ${Date.now() - t0}ms: ${path.basename(bin)} ${args.join(' ').slice(0, 600)}`); };
    const timer = setTimeout(() => { kill('TIMEOUT'); finish(reject, new FfmpegError('This took too long and was stopped. Please try again.', 'timeout')); }, timeoutMs);
    const onAbort = () => { kill('CANCELLED'); finish(reject, new FfmpegError('Stopped.', 'aborted')); };
    if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort, { once: true }); }
    if (capture) p.stdout.on('data', (d) => { if (out.length < 4e6) out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-6000); if (onStderr) { try { onStderr(String(d)); } catch { /* a progress callback must not break the run */ } } if (wantErr && full.length < 3e6) full += d; });
    p.on('error', (e) => { log(`SPAWN ERROR ${e.message}`); finish(reject, new FfmpegError(FFMPEG_HELP, e.message)); });
    p.on('close', (code) => {
      log(`${code === 0 ? 'OK' : 'FAIL ' + code} ${Date.now() - t0}ms: ${path.basename(bin)} ${args.join(' ').slice(0, 600)}${code === 0 ? '' : '\n    ' + err.trim().split('\n').slice(-4).join('\n    ')}`);
      if (code === 0) finish(resolve, wantErr ? full : out); else finish(reject, new FfmpegError('This file could not be processed. It may be damaged or in a format that is not supported.', err.trim().split('\n').slice(-3).join(' | ')));
    });
  });
}
export function ffmpeg(args, opts) { needFfmpeg(); return exec(ffmpegInfo().ffmpeg, ['-hide_banner', '-nostdin', '-y', ...args], opts); }

// What is inside a media file. Returns null when it cannot be read as media.
export async function probe(file, opts = {}) {
  needFfmpeg();
  let j;
  try { j = JSON.parse(await exec(ffmpegInfo().ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 30000, capture: true, ...opts })); } catch { return null; }
  const v = (j.streams || []).find((s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1); const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  const duration = Number(j.format?.duration) || Number(v?.duration) || Number(a?.duration) || 0;
  if (!v && !a) return null;
  const rot = Math.abs(Number(v?.side_data_list?.find((s) => s.rotation != null)?.rotation ?? v?.tags?.rotate ?? 0)) % 180 === 90;
  const fr = String(v?.avg_frame_rate || v?.r_frame_rate || '').split('/'); const fps = fr.length === 2 && Number(fr[1]) ? Number(fr[0]) / Number(fr[1]) : Number(fr[0]) || 0;
  return { duration: Math.round(duration * 1000) / 1000, hasVideo: !!v, hasAudio: !!a, width: v ? (rot ? v.height : v.width) : 0, height: v ? (rot ? v.width : v.height) : 0, fps: Math.round(fps * 100) / 100, videoCodec: v?.codec_name || null, audioCodec: a?.codec_name || null, format: j.format?.format_name || null };
}

// A file that came in as a video but has sound and no picture (an .m4a sent as video/mp4, a .webm song) is a sound file.
// Returns true when it changed the record, so callers can save.
export function soundOnly(rec, info) {
  if (!rec || rec.kind !== 'video' || !info || info.hasVideo || !info.hasAudio) return false;
  rec.kind = 'audio'; rec.mime = /webm/.test(rec.mime || '') ? 'audio/webm' : 'audio/mp4'; delete rec.proxyKey;
  return true;
}

// A still picture from a video (for grids and lists).
export async function makePoster(src, out, { at = 0.5, width = 640, signal } = {}) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await ffmpeg(['-ss', String(at), '-i', src, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', out], { timeoutMs: 60000, signal })
    .catch(() => ffmpeg(['-i', src, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', out], { timeoutMs: 60000, signal }));
  return out;
}
// A small 480p copy that plays smoothly in the browser while editing.
export async function makeProxy(src, out, { signal } = {}) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await ffmpeg(['-i', src, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-movflags', '+faststart', '-f', 'mp4', out + '.part'], { timeoutMs: 15 * 60 * 1000, signal });
  fs.renameSync(out + '.part', out);
  return out;
}
