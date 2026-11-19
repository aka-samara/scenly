// Credit safety: every path a paid job can take. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-credits-'));
const { default: db } = await import('../server/db.js');
const { reserve, settle, release, grant, charge, canAfford } = await import('../server/credits.js');
const { defineJob, enqueue, waitFor, startJobs, cancelJob } = await import('../server/jobs.js');

let n = 0;
const user = (credits = 100) => { const u = { id: 'u' + ++n, credits: 0 }; db.users.push(u); grant(u, credits, 'grant', 'start'); return u; };
const ledgerSum = (u) => Math.round(db.ledger.filter((l) => l.userId === u.id).reduce((s, l) => s + l.credits, 0) * 1e4) / 1e4;
const balanced = (u) => assert.equal(ledgerSum(u), u.credits, 'the ledger adds up to the balance');

test('reserve takes the credits at once', () => { const u = user(100); const h = reserve(u, 30, 'Video'); assert.equal(u.credits, 70); assert.equal(h.status, 'held'); balanced(u); });
test('reserve refuses when the balance is too low and takes nothing', () => { const u = user(10); assert.throws(() => reserve(u, 30, 'Video'), (e) => e.status === 402 && e.code === 'insufficient_credits'); assert.equal(u.credits, 10); assert.equal(db.holds.filter((h) => h.userId === u.id).length, 0); balanced(u); });
test('settle below the hold returns the rest', () => { const u = user(100); const h = reserve(u, 30, 'Video'); settle(h, 22.5); assert.equal(u.credits, 77.5); assert.equal(h.status, 'settled'); assert.equal(h.charged, 22.5); balanced(u); });
test('settle at exactly the hold changes nothing more', () => { const u = user(100); const h = reserve(u, 30, 'Video'); settle(h, 30); assert.equal(u.credits, 70); balanced(u); });
test('settle with no real cost known keeps the reserved amount', () => { const u = user(100); const h = reserve(u, 30, 'Video'); settle(h); assert.equal(u.credits, 70); balanced(u); });
test('settle above the hold charges the difference', () => { const u = user(100); const h = reserve(u, 30, 'Video'); settle(h, 34); assert.equal(u.credits, 66); balanced(u); });
test('settle twice charges once', () => { const u = user(100); const h = reserve(u, 30, 'Video'); settle(h, 20); settle(h, 20); settle(h.id, 5); assert.equal(u.credits, 80); balanced(u); });
test('release refunds everything', () => { const u = user(100); const h = reserve(u, 30, 'Video'); release(h, 'failed'); assert.equal(u.credits, 100); assert.equal(h.status, 'released'); balanced(u); });
test('release twice refunds once', () => { const u = user(100); const h = reserve(u, 30, 'Video'); release(h); release(h); release(h.id); assert.equal(u.credits, 100); balanced(u); });
test('release after settle does nothing, settle after release does nothing', () => {
  const u = user(100); const a = reserve(u, 30, 'A'); settle(a, 10); release(a); assert.equal(u.credits, 90);
  const b = reserve(u, 30, 'B'); release(b); settle(b, 30); assert.equal(u.credits, 90); balanced(u);
});
test('an unknown hold is ignored', () => { assert.equal(settle('h_nope', 5), null); assert.equal(release('h_nope'), null); });
test('a free step (0 credits) needs no balance', () => { const u = user(0); const h = reserve(u, 0, 'Free'); settle(h, 0); assert.equal(u.credits, 0); balanced(u); });
test('several holds at once cannot overspend', () => { const u = user(50); reserve(u, 30, 'A'); assert.throws(() => reserve(u, 30, 'B')); assert.equal(u.credits, 20); assert.ok(canAfford(u, 20)); assert.ok(!canAfford(u, 20.01)); balanced(u); });
test('sub-credit amounts keep their precision', () => { const u = user(1); const h = reserve(u, 0.3333, 'Tiny'); settle(h, 0.1111); assert.equal(u.credits, 0.8889); balanced(u); });

// ---- holds tied to jobs ----
defineJob('t-ok', async (j) => ({ credits: j.payload.actual }), { backoffMs: 5 });
let flaky = 0; defineJob('t-flaky', async () => { if (++flaky < 3) throw new Error('fetch failed'); return { credits: 4 }; }, { backoffMs: 5, maxAttempts: 3 });
defineJob('t-fail', async () => { throw new Error('boom'); }, { backoffMs: 5, maxAttempts: 2 });
defineJob('t-refuse', async () => { throw Object.assign(new Error('That video is too long.'), { status: 400 }); }, { backoffMs: 5 });
defineJob('t-slow', async (j, { signal }) => new Promise((res, rej) => { const t = setTimeout(() => res({ credits: 10 }), 3000); signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); }); }), { backoffMs: 5, maxAttempts: 1, timeoutMs: 150 });
startJobs();

test('job done: hold settled to the real cost', async () => { const u = user(100); const h = reserve(u, 30, 'Scene'); const { job } = enqueue({ type: 't-ok', userId: u.id, payload: { actual: 12 }, holdId: h.id }); const j = await waitFor(job.id); assert.equal(j.status, 'done'); assert.equal(u.credits, 88); balanced(u); });
test('job retried then done: charged once', async () => { const u = user(100); const h = reserve(u, 10, 'Scene'); const { job } = enqueue({ type: 't-flaky', userId: u.id, holdId: h.id }); const j = await waitFor(job.id); assert.equal(j.status, 'done'); assert.equal(j.attempts, 3); assert.equal(u.credits, 96); assert.equal(db.ledger.filter((l) => l.holdId === h.id && l.type === 'usage').length, 1); balanced(u); });
test('job failed for good: full refund, plain message', async () => { const u = user(100); const h = reserve(u, 30, 'Scene'); const { job } = enqueue({ type: 't-fail', userId: u.id, holdId: h.id }); const j = await waitFor(job.id); assert.equal(j.status, 'failed'); assert.equal(j.attempts, 2); assert.equal(u.credits, 100); assert.match(j.error, /Nothing was charged/); assert.doesNotMatch(j.error, /boom/); balanced(u); });
test('job refused (bad input): no retry, full refund, its own message', async () => { const u = user(100); const h = reserve(u, 30, 'Scene'); const { job } = enqueue({ type: 't-refuse', userId: u.id, holdId: h.id }); const j = await waitFor(job.id); assert.equal(j.status, 'failed'); assert.equal(j.attempts, 1); assert.equal(j.error, 'That video is too long.'); assert.equal(u.credits, 100); balanced(u); });
test('job timed out: full refund', async () => { const u = user(100); const h = reserve(u, 30, 'Scene'); const { job } = enqueue({ type: 't-slow', userId: u.id, holdId: h.id }); const j = await waitFor(job.id); assert.equal(j.status, 'failed'); assert.match(j.error, /too long/); assert.equal(u.credits, 100); balanced(u); });
test('job cancelled while waiting: full refund', async () => { const u = user(100); const h = reserve(u, 30, 'Scene'); const { job } = enqueue({ type: 't-ok', userId: u.id, payload: { actual: 5 }, holdId: h.id, runAfter: new Date(Date.now() + 60000).toISOString() }); cancelJob(job.id, u.id); const j = await waitFor(job.id); assert.equal(j.status, 'cancelled'); assert.equal(u.credits, 100); balanced(u); });
test('the same request twice (idempotency key): one job, one charge', async () => {
  const u = user(100); const h = reserve(u, 30, 'Scene');
  const a = enqueue({ type: 't-ok', userId: u.id, payload: { actual: 30 }, holdId: h.id, idempotencyKey: 'k1' }); const b = enqueue({ type: 't-ok', userId: u.id, payload: { actual: 30 }, idempotencyKey: 'k1' });
  assert.equal(b.duplicate, true); assert.equal(a.job.id, b.job.id); await waitFor(a.job.id); assert.equal(u.credits, 70); balanced(u);
});
