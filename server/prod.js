// Production basics: security headers, request limits, health checks, settings check and a clean shutdown.
// Everything here is harmless on a laptop; the stricter parts only switch on with NODE_ENV=production.
import fs from 'node:fs';
import db, { DATA_DIR, saveNow, saveState, releaseDb } from './db.js';
import { bucketStatus, bucketOn } from './storage.js';
import { backupStatus } from './backup.js';
import { ffmpegInfo } from './ffmpeg.js';

export const isProd = () => process.env.NODE_ENV === 'production';
const started = Date.now();

// The visitor's address. Behind Cloudflare the real one is in CF-Connecting-IP (TRUST_CLOUDFLARE=1).
export const clientIp = (req) => (process.env.TRUST_CLOUDFLARE === '1' && req.headers['cf-connecting-ip']) || req.ip || req.socket?.remoteAddress || '?';

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (isProd() && (req.secure || req.headers['x-forwarded-proto'] === 'https')) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
}

// Requests that change something must come from this site's own pages (stops other sites posting on a signed-in person's behalf).
export function sameOrigin(req, res, next) {
  if (!isProd() || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.path.startsWith('/api/') || req.path === '/api/stripe/webhook') return next();
  const origin = req.headers.origin; if (!origin) return next(); // same-origin form posts and server-to-server calls
  let want; try { want = new URL(process.env.PUBLIC_URL).host; } catch { return next(); }
  try { if (new URL(origin).host === want) return next(); } catch { /* bad header */ }
  res.status(403).json({ error: 'This request came from another website and was refused.' });
}

// Simple in-memory limits per visitor address. One server is enough for this; Stage 2 moves it to Redis.
const hits = new Map();
export function limit(name, max, windowSec, message = 'Too many tries. Please wait a few minutes and try again.') {
  return (req, res, next) => {
    if (process.env.RATE_LIMITS === '0') return next();
    const k = `${name}:${clientIp(req)}`; const t = Date.now(); const cut = t - windowSec * 1000;
    const list = (hits.get(k) || []).filter((x) => x > cut);
    if (list.length >= max) { res.setHeader('Retry-After', Math.ceil((list[0] - cut) / 1000)); return res.status(429).json({ error: message, code: 'rate_limited' }); }
    list.push(t); hits.set(k, list); next();
  };
}
setInterval(() => { const cut = Date.now() - 3600000; for (const [k, v] of hits) if (!v.length || v[v.length - 1] < cut) hits.delete(k); }, 600000).unref();

// Expired sign-ins are removed once a day so the database does not keep growing.
export function pruneSessions() {
  let n = 0; const t = Date.now();
  for (const [k, s] of Object.entries(db.sessions || {})) if (!s || s.expires < t) { delete db.sessions[k]; n++; }
  return n;
}
setInterval(pruneSessions, 864e5).unref();

function diskFree() {
  try { const s = fs.statfsSync(DATA_DIR); return { freeGb: Math.round((s.bavail * s.bsize) / 1e8) / 10, totalGb: Math.round((s.blocks * s.bsize) / 1e8) / 10 }; } catch { return null; }
}
function writable() { try { const p = `${DATA_DIR}/.health`; fs.writeFileSync(p, String(Date.now())); fs.rmSync(p, { force: true }); return true; } catch { return false; } }

export function mountHealth(app, { requireUser, requireAdmin }) {
  // For the load balancer, Coolify and uptime monitors: 200 when the app can serve and save.
  app.get('/healthz', (_req, res) => {
    const ok = writable() && Array.isArray(db.users) && saveState.ok; // a failing database save must raise the alarm
    res.status(ok ? 200 : 503).set('Cache-Control', 'no-store').json({ ok, uptimeSec: Math.round((Date.now() - started) / 1000) });
  });
  // Details for admins: disk, ffmpeg, bucket copies, backups.
  app.get('/api/admin/health', requireUser, requireAdmin, (_req, res) => {
    res.json({ ok: writable(), env: isProd() ? 'production' : 'development', uptimeSec: Math.round((Date.now() - started) / 1000), node: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      database: { saving: saveState.ok, error: saveState.error, sizeMb: Math.round(saveState.bytes / 1048576), limitMb: 512, lastSave: saveState.at }, disk: diskFree(), ffmpeg: ffmpegInfo().ok, bucket: bucketStatus(), backups: backupStatus(),
      counts: { users: db.users.length, files: db.files.length, jobsWaiting: db.jobs.filter((j) => j.status === 'queued' || j.status === 'retrying').length, sessions: Object.keys(db.sessions || {}).length } });
  });
}

// Warns about settings that production needs. Never prints a secret.
export function checkSettings() {
  if (!isProd()) return [];
  const e = process.env; const warn = [];
  if (!e.AICREDIT_API_KEY) warn.push('AICREDIT_API_KEY is empty: no AI model will answer.');
  if (!/^https:\/\//.test(e.PUBLIC_URL || '')) warn.push('PUBLIC_URL should be your https address, for example https://scenly.ai.');
  if (!e.LINK_SECRET || e.LINK_SECRET.length < 32) warn.push('LINK_SECRET should be a long random text (32+ characters). Download links are signed with it.');
  if (!e.ADMIN_EMAILS) warn.push('ADMIN_EMAILS is empty: nobody can open the admin page.');
  if (!e.SMTP_HOST && !e.MANDRILL_API_KEY) warn.push('No email sender (MANDRILL_API_KEY or SMTP_HOST): sign-up confirmation and password reset emails are off.');
  if (!bucketOn()) warn.push('No R2 bucket is set: files stay only on this server and are not backed up.');
  if (e.STRIPE_SECRET_KEY && /^sk_test_/.test(e.STRIPE_SECRET_KEY)) warn.push('Stripe is in TEST mode: nobody is really charged.');
  if (!e.STRIPE_SECRET_KEY) warn.push('No Stripe key: purchases run in demo mode and give credits for free.');
  for (const w of warn) console.warn('[settings] ' + w);
  return warn;
}

// On deploy or restart (SIGTERM), finish answering, save the database, then stop. Jobs that were running start again on the next start.
export function gracefulShutdown(server) {
  let closing = false;
  const stop = (sig) => {
    if (closing) return; closing = true; console.log(`[shutdown] ${sig}: saving and stopping`);
    try { saveNow(); } catch (e) { console.error('[shutdown] save failed:', e.message); }
    // The final save also hands the data folder to a new copy that is waiting for it (server/handover.js).
    const done = () => { try { releaseDb(); } catch (e) { console.error('[shutdown] save failed:', e.message); } process.exit(0); };
    server.close(done);
    server.closeIdleConnections?.();
    setTimeout(done, Number(process.env.SHUTDOWN_GRACE_MS) || 10000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
}
