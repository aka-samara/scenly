// Admin monitoring: which request is running (so charges and gateway calls know where they came from),
// and a capped log of every AICredit gateway call (model, endpoint, status, latency) and every failure
// with its real reason. People never see these reasons; only the admin page does.
import { AsyncLocalStorage } from 'node:async_hooks';
import db, { save, now } from './db.js';

const als = new AsyncLocalStorage();
db.monitor ||= {};
db.monitor.calls ||= [];    // compact rows for every gateway call: performance stats
db.monitor.failures ||= []; // failures with reasons: model, response, gateway, server
const MAX_CALLS = 4000;
const MAX_FAILS = 2000;

/** Express middleware: remembers the request for everything that runs while answering it. */
export function trackRequest(req, _res, next) {
  als.run({ req, path: req.path, method: req.method }, next);
}
export const ctx = () => als.getStore() || null;
/** Where the current work came from: '/api/pro/frame', '/api/chat', … (null in background jobs). */
export function currentVia() {
  const s = ctx(); if (!s) return null;
  const appId = s.req?.body?.appId || (s.path.startsWith('/api/apps/') ? s.path.split('/')[3] : null);
  return { via: s.path, ...(appId ? { app: String(appId).slice(0, 60) } : {}) };
}
const userId = () => ctx()?.req?.user?.id || null;
export function noteModel(model) { const s = ctx(); if (s && model) s.model = model; }
const clip = (t, n = 600) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** One gateway call finished (or failed before answering). */
export function recordCall({ path, model, status, ms, ok }) {
  const s = ctx();
  db.monitor.calls.push({ t: Date.now(), p: normPath(path), m: model || s?.model || null, s: status || 0, ms: Math.round(ms || 0), ok: !!ok, v: s?.path || null });
  if (db.monitor.calls.length > MAX_CALLS) db.monitor.calls.splice(0, db.monitor.calls.length - MAX_CALLS);
  save();
}
/** A failure worth an admin's attention. kind: model | response | gateway | video_task | job | server */
export function recordFailure({ kind, model, path, status, reason, code, userId: uid, ms }) {
  const s = ctx();
  db.monitor.failures.push({ at: now(), kind, model: model || s?.model || null, path: path ? normPath(path) : null, via: s?.path || null, status: status || null, code: code || null, reason: clip(reason), userId: uid || userId(), ms: ms ? Math.round(ms) : null });
  if (db.monitor.failures.length > MAX_FAILS) db.monitor.failures.splice(0, db.monitor.failures.length - MAX_FAILS);
  save();
}
// Task ids in paths are folded together so stats group by endpoint.
const normPath = (p) => String(p || '').replace(/\/videos\/generations\/[^/?]+/, '/videos/generations/:task').slice(0, 80);

/** What kind of failure a gateway status is. */
export function failureKind(status, raw) {
  if (!status || status === 'network') return 'gateway';
  if (status === 401 || status === 402 || status === 403 || /quota|balance|api key|unauthor/i.test(raw || '')) return 'gateway';
  if (status === 502 || status === 503 || status === 520 || status === 522) return 'gateway';
  return 'model';
}
