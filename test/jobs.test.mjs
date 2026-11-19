// Job queue: limits, order, retries, restart. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-jobs-'));
process.env.JOBS_MAX_GLOBAL = '3'; process.env.JOBS_MAX_PER_USER = '2';
const { default: db } = await import('../server/db.js');
const { defineJob, enqueue, waitFor, startJobs, pauseJobs, getJob, publicJob, cancelJob } = await import('../server/jobs.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let live = 0, peak = 0; const liveBy = {}; const peakBy = {}; const order = [];
defineJob('work', async (j, { progress }) => { live++; liveBy[j.userId] = (liveBy[j.userId] || 0) + 1; peak = Math.max(peak, live); peakBy[j.userId] = Math.max(peakBy[j.userId] || 0, liveBy[j.userId]); order.push(j.payload.n); progress(0.5, 'half'); await sleep(40); live--; liveBy[j.userId]--; return { n: j.payload.n }; });
const times = []; defineJob('backoff', async () => { times.push(Date.now()); if (times.length < 3) throw new Error('ECONNRESET'); return {}; }, { backoffMs: 60, maxAttempts: 3 });
defineJob('hang', (j, { signal }) => new Promise((res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))), { maxAttempts: 1, timeoutMs: 60000 });
startJobs();

test('limits: never more than 2 per user or 3 in total at once', async () => {
  const jobs = []; for (let i = 0; i < 6; i++) jobs.push(enqueue({ type: 'work', userId: 'A', payload: { n: 'A' + i } }).job, enqueue({ type: 'work', userId: 'B', payload: { n: 'B' + i } }).job);
  const done = await Promise.all(jobs.map((j) => waitFor(j.id)));
  assert.ok(done.every((j) => j.status === 'done')); assert.ok(peak <= 3, 'global peak ' + peak); assert.ok(peakBy.A <= 2 && peakBy.B <= 2, JSON.stringify(peakBy));
  assert.deepEqual(order.filter((x) => x[0] === 'A'), ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'], 'first in, first out for each user');
});
test('one busy user does not block another', async () => {
  const a = [0, 1, 2, 3].map((i) => enqueue({ type: 'work', userId: 'C', payload: { n: 'C' + i } }).job); const d = enqueue({ type: 'work', userId: 'D', payload: { n: 'D0' } }).job;
  await waitFor(d.id); assert.ok(a.some((j) => getJob(j.id).status !== 'done'), 'D finished while C still had work waiting'); await Promise.all(a.map((j) => waitFor(j.id)));
});
test('retries wait longer each time', async () => { const { job } = enqueue({ type: 'backoff', userId: 'E' }); const j = await waitFor(job.id); assert.equal(j.status, 'done'); assert.equal(j.attempts, 3); const g1 = times[1] - times[0], g2 = times[2] - times[1]; assert.ok(g1 >= 40, 'first wait ' + g1); assert.ok(g2 >= 85, 'second wait ' + g2); });
test('a running job can be stopped', async () => { const { job } = enqueue({ type: 'hang', userId: 'F' }); await sleep(30); assert.equal(getJob(job.id).status, 'running'); cancelJob(job.id, 'F'); const j = await waitFor(job.id); assert.equal(j.status, 'cancelled'); });
test('a job is only visible to its owner', () => { const { job } = enqueue({ type: 'work', userId: 'G', payload: { n: 'G' } }); assert.equal(getJob(job.id, 'H'), null); assert.ok(getJob(job.id, 'G')); });
test('public view hides the payload', async () => { const { job } = enqueue({ type: 'work', userId: 'I', payload: { n: 'secret' } }); await waitFor(job.id); const p = publicJob(getJob(job.id)); assert.equal(p.payload, undefined); assert.equal(p.status, 'done'); assert.equal(p.progress, 1); });
test('unknown job type is refused', () => { assert.throws(() => enqueue({ type: 'nope', userId: 'J' })); });
test('after a restart, a job that was running is picked up again', async () => {
  pauseJobs();
  db.jobs.push({ id: 'job_stuck', type: 'work', userId: 'K', payload: { n: 'K' }, status: 'running', attempts: 1, progress: 0.3, createdAt: new Date().toISOString() });
  db.jobs.push({ id: 'job_dead', type: 'hang', userId: 'K', payload: {}, status: 'running', attempts: 1, createdAt: new Date().toISOString() });
  startJobs();
  const a = await waitFor('job_stuck'); assert.equal(a.status, 'done'); assert.equal(a.attempts, 2);
  assert.equal(getJob('job_dead').status, 'failed'); assert.match(getJob('job_dead').error, /restarted/);
});
