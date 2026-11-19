// Job queue. Long or paid work (video processing, exports, scene generation) runs here, never inside a web request.
// - Jobs are saved in the database, so a restart picks up where it stopped.
// - Each job type has a handler, a number of tries, a wait between tries that grows, and a time limit.
// - An idempotency key makes "the same request sent twice" return the first job.
// - Limits: a number of jobs at once for the whole app and for each user.
// - A job can carry a credit hold. It is settled when the job succeeds and released when it fails for good.
import db, { save, id, now } from './db.js';
import { settle, release } from './credits.js';

const handlers = new Map();
const running = new Map(); // job id -> AbortController
const waiters = new Map(); // job id -> [resolve]
const cfg = () => ({
  global: Math.max(1, Number(process.env.JOBS_MAX_GLOBAL) || 4),
  perUser: Math.max(1, Number(process.env.JOBS_MAX_PER_USER) || 2),
  keepDays: Number(process.env.JOBS_KEEP_DAYS) || 7,
});
let paused = false;
let tickTimer = null;

// handler(job, { signal, progress(n, note), log(text) }) -> result (plain data). Throw to fail.
// Throw an error with err.retry === false (or a 4xx err.status) to fail at once without another try.
export function defineJob(type, handler, opts = {}) {
  handlers.set(type, { handler, maxAttempts: 3, timeoutMs: 10 * 60 * 1000, backoffMs: 2000, weight: 1, ...opts });
}

export const publicJob = (j) => j && ({ id: j.id, type: j.type, status: j.status, progress: j.progress || 0, note: j.note || '', attempts: j.attempts, result: j.status === 'done' ? j.result : undefined,
  error: j.status === 'failed' || j.status === 'cancelled' ? j.error : undefined, createdAt: j.createdAt, startedAt: j.startedAt, endedAt: j.endedAt, ref: j.ref || undefined });

export function enqueue({ type, userId, payload = {}, idempotencyKey, holdId, ref, runAfter, priority = 0 }) {
  if (!handlers.has(type)) throw new Error('Unknown job type: ' + type);
  if (idempotencyKey) {
    const dup = db.jobs.find((j) => j.userId === userId && j.type === type && j.idempotencyKey === idempotencyKey);
    if (dup) return { job: dup, duplicate: true };
  }
  const job = { id: id('job_'), type, userId, payload, idempotencyKey: idempotencyKey || undefined, holdId: holdId || undefined, ref: ref || undefined, priority,
    status: 'queued', attempts: 0, progress: 0, runAfter: runAfter || undefined, createdAt: now() };
  db.jobs.push(job); save(); schedule(0);
  return { job, duplicate: false };
}

export const getJob = (jobId, userId) => db.jobs.find((j) => j.id === jobId && (userId == null || j.userId === userId)) || null;
export const listJobs = (userId, filter = () => true) => db.jobs.filter((j) => j.userId === userId && filter(j));

export function cancelJob(jobId, userId) {
  const j = getJob(jobId, userId); if (!j) return null;
  if (j.status === 'queued' || j.status === 'retrying') finish(j, 'cancelled', { error: 'Stopped.' });
  else if (j.status === 'running') { j.cancelRequested = true; running.get(j.id)?.abort(); }
  return j;
}

// Resolves when the job has ended (done, failed or cancelled).
export function waitFor(jobId, timeoutMs = 0) {
  const j = getJob(jobId); if (!j) return Promise.resolve(null);
  if (['done', 'failed', 'cancelled'].includes(j.status)) return Promise.resolve(j);
  return new Promise((resolve) => {
    const list = waiters.get(jobId) || []; waiters.set(jobId, list);
    let t = null; const fn = (x) => { if (t) clearTimeout(t); resolve(x); };
    list.push(fn);
    if (timeoutMs) t = setTimeout(() => { const l = waiters.get(jobId) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); resolve(getJob(jobId)); }, timeoutMs);
  });
}

function finish(j, status, extra = {}) {
  Object.assign(j, extra, { status, endedAt: now() });
  if (status === 'done') j.progress = 1;
  // Credits: the hold ends exactly once, together with the job.
  if (j.holdId) { if (status === 'done') settle(j.holdId, j.result?.credits); else release(j.holdId, status === 'cancelled' ? 'stopped' : 'failed'); }
  save();
  try { handlers.get(j.type)?.onEnd?.(j); } catch (e) { console.warn('[jobs] onEnd', e.message); }
  for (const fn of waiters.get(j.id) || []) fn(j);
  waiters.delete(j.id);
}

const plain = (e) => {
  if (e?.userMessage) return e.userMessage;
  if (e?.status && e.status < 500 && e.message) return e.message;
  if (e?.name === 'FfmpegError' || e?.constructor?.name === 'FfmpegError' || e?.constructor?.name === 'UserError') return e.message;
  if (/timed? ?out|ETIMEDOUT|aborted/i.test(e?.message || '')) return 'This took too long and was stopped. Please try again.';
  if (/ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i.test(e?.message || '')) return 'The connection to the AI service dropped. Please try again.';
  return 'Something went wrong on our side. Nothing was charged for this step. Please try again.';
};
const backoff = (base, attempt) => Math.min(60000, base * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);

async function run(j) {
  const h = handlers.get(j.type);
  const ac = new AbortController(); running.set(j.id, ac);
  j.status = 'running'; j.attempts += 1; j.startedAt = j.startedAt || now(); j.lastStartAt = now(); j.note = ''; save();
  const timer = setTimeout(() => { j.timedOut = true; ac.abort(); }, h.timeoutMs);
  let lastSave = 0;
  const ctx = {
    signal: ac.signal,
    progress: (n, note) => { j.progress = Math.max(0, Math.min(0.99, Number(n) || 0)); if (note != null) j.note = String(note).slice(0, 200); if (Date.now() - lastSave > 1000) { lastSave = Date.now(); save(); } },
    log: (text) => { (j.log = j.log || []).push(`${now()} ${String(text).slice(0, 300)}`); if (j.log.length > 40) j.log.shift(); },
  };
  try {
    const result = await h.handler(j, ctx);
    if (j.cancelRequested) throw Object.assign(new Error('Stopped.'), { retry: false });
    finish(j, 'done', { result: result ?? null, error: undefined });
  } catch (e) {
    const cancelled = j.cancelRequested;
    const timedOut = j.timedOut; j.timedOut = undefined;
    ctx.log(`try ${j.attempts} failed: ${e?.message || e}${e?.detail ? ' | ' + e.detail : ''}`);
    const final = cancelled || e?.retry === false || (e?.status >= 400 && e?.status < 500) || j.attempts >= h.maxAttempts;
    if (e?.defer && !cancelled && !timedOut) { j.attempts -= 1; j.status = 'queued'; j.runAfter = new Date(Date.now() + e.defer).toISOString(); j.note = e.note || 'Waiting'; save(); } // not a failure: it waits for something else and gives its place to other jobs
    else if (cancelled) finish(j, 'cancelled', { error: 'Stopped.' });
    else if (final) { console.warn(`[jobs] ${j.type} ${j.id} failed after ${j.attempts} tries: ${e?.message}`); finish(j, 'failed', { error: timedOut ? 'This took too long and was stopped. Please try again.' : plain(e) }); }
    else { j.status = 'retrying'; j.runAfter = new Date(Date.now() + backoff(h.backoffMs, j.attempts)).toISOString(); j.note = 'Trying again…'; save(); }
  } finally {
    clearTimeout(timer); running.delete(j.id); schedule(0);
  }
}

function tick() {
  tickTimer = null;
  if (paused) return;
  const c = cfg(); const nowMs = Date.now();
  const perUser = new Map();
  for (const jid of running.keys()) { const j = db.jobs.find((x) => x.id === jid); if (j) perUser.set(j.userId, (perUser.get(j.userId) || 0) + 1); }
  const ready = db.jobs.filter((j) => (j.status === 'queued' || j.status === 'retrying') && handlers.has(j.type) && (!j.runAfter || Date.parse(j.runAfter) <= nowMs))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.createdAt.localeCompare(b.createdAt));
  for (const j of ready) {
    if (running.size >= c.global) break;
    const typeMax = handlers.get(j.type).maxPerUser || c.perUser;
    if ((perUser.get(j.userId) || 0) >= typeMax) continue;
    perUser.set(j.userId, (perUser.get(j.userId) || 0) + 1);
    run(j);
  }
  // Wake up for the next job that is waiting for its retry time.
  const next = db.jobs.filter((j) => (j.status === 'queued' || j.status === 'retrying') && j.runAfter).map((j) => Date.parse(j.runAfter) - nowMs).filter((n) => n > 0).sort((a, b) => a - b)[0];
  if (next != null) schedule(Math.min(next + 20, 30000));
}
function schedule(ms) { if (tickTimer && ms > 0) return; if (tickTimer) clearTimeout(tickTimer); tickTimer = setTimeout(tick, ms); }

// Called once at startup, after every job type is defined.
export function startJobs() {
  let resumed = 0;
  for (const j of db.jobs) {
    if (j.status === 'running') { // the app stopped in the middle of this job
      if (!handlers.has(j.type) || j.attempts >= (handlers.get(j.type)?.maxAttempts || 1)) finish(j, 'failed', { error: 'The app restarted while this was running. Nothing was charged. Please try again.' });
      else { j.status = 'retrying'; j.runAfter = undefined; resumed++; }
    }
  }
  const cut = Date.now() - cfg().keepDays * 86400000;
  const before = db.jobs.length;
  db.jobs = db.jobs.filter((j) => !['done', 'failed', 'cancelled'].includes(j.status) || Date.parse(j.endedAt || j.createdAt) > cut);
  if (resumed || before !== db.jobs.length) save();
  if (resumed) console.log(`[jobs] picked up ${resumed} unfinished job(s) after restart`);
  paused = false; schedule(0);
}
export function pauseJobs() { paused = true; }
export const jobStats = () => ({ running: running.size, queued: db.jobs.filter((j) => j.status === 'queued' || j.status === 'retrying').length, ...cfg() });
