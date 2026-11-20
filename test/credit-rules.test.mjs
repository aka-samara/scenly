// The credit rules of 2026-11-20: plan credits last one billing month (no rollover), top-up packs last 90 days,
// spending order, Pro tools on paid credits only, refunds back to the right place, and the safe move of old
// balances. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-rules-'));
delete process.env.CARRY_CREDIT_DAYS;
const { default: db } = await import('../server/db.js');
const C = await import('../server/credits.js');
const W = await import('../server/wallet.js');
const { trackRequest } = await import('../server/monitor.js');
const { lowAtFor } = await import('../server/emails.js');

let n = 0;
const DAY = 864e5;
const mk = (extra = {}) => { const u = { id: 'r' + ++n, email: `r${n}@x.test`, credits: 0, plan: 'free', ...extra }; db.users.push(u); return u; };
const pay = (u, offerId, kind, reason) => { const p = { id: 'pay_' + Math.random(), userId: u.id, offerId, kind, reason, status: 'paid', amountUsd: 10 }; db.payments.push(p); return p.id; };
const buyPack = (u, credits = 10000) => C.grant(u, credits, 'purchase', 'pack', { paymentId: pay(u, 'pack10') });
const planMonth = (u, credits, periodEnd, reason = 'subscription_cycle') => C.grant(u, credits, 'purchase', 'plan', { paymentId: pay(u, 'pro', 'subscription', reason), periodEnd });
const inPro = (fn) => new Promise((resolve, reject) => trackRequest({ path: '/api/pro/plan' }, {}, () => { try { resolve(fn()); } catch (e) { reject(e); } }));
const ledgerSum = (u) => Math.round(db.ledger.filter((l) => l.userId === u.id).reduce((s, l) => s + l.credits, 0) * 1e4) / 1e4;
const balanced = (u) => assert.equal(ledgerSum(u), u.credits, 'the ledger adds up to the balance');
const age = (u, days) => { // move every date in this account back by `days`
  const w = u.wallet, back = (iso) => (iso ? new Date(Date.parse(iso) - days * DAY).toISOString() : iso);
  if (w.sub) { w.sub.expiresAt = back(w.sub.expiresAt); w.sub.at = back(w.sub.at); }
  for (const p of w.packs) { p.expiresAt = back(p.expiresAt); p.at = back(p.at); }
};

test('free starter credits: standard tools yes, Pro tools no', async () => {
  const u = mk(); C.grant(u, 1000, 'bonus', 'Welcome credits');
  assert.equal(u.credits, 1000); assert.equal(C.paidBalance(u), 0); assert.equal(C.hasProAccess(u), false);
  C.charge(u, 100, 'Chat'); assert.equal(u.credits, 900);
  await assert.rejects(inPro(() => C.reserve(u, 50, 'Studio Pro')), (e) => e.status === 402 && /Pro tools are paused/.test(e.message) && /free credits still work/.test(e.message));
  await assert.rejects(inPro(() => C.needCredits(u, 0)), (e) => e.code === 'insufficient_credits');
  assert.equal(u.credits, 900); balanced(u);
});

test('a top-up pack lasts 90 days from purchase, then expires', () => {
  const u = mk(); buyPack(u, 10000);
  const p = u.wallet.packs[0];
  assert.equal(Math.round((Date.parse(p.expiresAt) - Date.parse(p.at)) / DAY), 90);
  assert.equal(C.hasProAccess(u), true, 'a pack opens the Pro tools with no subscription');
  C.charge(u, 2500, 'Image');
  age(u, 89); C.ensure(u); assert.equal(u.credits, 7500, 'still valid on day 89');
  age(u, 2); C.ensure(u); assert.equal(u.credits, 0, 'gone after day 90');
  const ex = db.ledger.filter((l) => l.userId === u.id && l.type === 'expire');
  assert.equal(ex.length, 1); assert.equal(ex[0].credits, -7500); assert.match(ex[0].desc, /90 days/);
  assert.equal(C.hasProAccess(u), false, 'Pro tools close when the paid credits are gone');
  balanced(u);
});

test('several packs at once, bought at any time; the soonest to expire is spent first', () => {
  const u = mk(); buyPack(u, 10000); age(u, 30); buyPack(u, 25000);
  assert.equal(u.credits, 35000); assert.equal(u.wallet.packs.length, 2);
  C.charge(u, 12000, 'Video');
  const [older, newer] = u.wallet.packs;
  assert.equal(older.credits, 0); assert.equal(newer.credits, 23000);
  balanced(u);
});

test('spending order: plan credits, then top-ups, then free credits', () => {
  const u = mk(); C.grant(u, 1000, 'bonus', 'Welcome credits'); buyPack(u, 10000);
  planMonth(u, 20000, new Date(Date.now() + 30 * DAY).toISOString(), 'subscription_create');
  C.charge(u, 21000, 'Video');
  assert.equal(u.wallet.sub.credits, 0); assert.equal(u.wallet.packs[0].credits, 9000); assert.equal(u.wallet.free.credits, 1000);
  C.charge(u, 9500, 'Video');
  assert.equal(u.wallet.packs[0].credits, 0); assert.equal(u.wallet.free.credits, 500);
  const parts = db.ledger.filter((l) => l.userId === u.id && l.type === 'usage').at(-1).parts;
  assert.deepEqual(parts.map((p) => p.c), [9000, 500]);
  balanced(u);
});

test('renewal: unused plan credits expire, no rollover; top-ups are untouched', () => {
  const u = mk(); buyPack(u, 10000);
  planMonth(u, 20000, new Date(Date.now() + 30 * DAY).toISOString(), 'subscription_create');
  C.charge(u, 5000, 'Image');
  planMonth(u, 20000, new Date(Date.now() + 60 * DAY).toISOString());
  assert.equal(u.wallet.sub.credits, 20000); assert.equal(u.wallet.packs[0].credits, 10000); assert.equal(u.credits, 30000);
  const ex = db.ledger.filter((l) => l.userId === u.id && l.type === 'expire');
  assert.equal(ex.length, 1); assert.equal(ex[0].credits, -15000);
  balanced(u);
});

test('plan credits expire after the period ends with no renewal (cancelled plan)', () => {
  const u = mk({ plan: 'pro' });
  planMonth(u, 20000, new Date(Date.now() + 2 * 3600e3).toISOString(), 'subscription_create');
  C.ensure(u); assert.equal(u.credits, 20000);
  age(u, 1); C.ensure(u); assert.equal(u.credits, 0, 'a day after the end, past the grace hours');
  balanced(u);
});

test('an upgrade adds to this month\'s plan credits with the same end date', () => {
  const u = mk(); const end = new Date(Date.now() + 20 * DAY).toISOString();
  planMonth(u, 20000, end, 'subscription_create');
  C.grant(u, 50000, 'purchase', 'upgrade', { paymentId: pay(u, 'max5', 'subscription', 'subscription_update'), periodEnd: end });
  assert.equal(u.wallet.sub.credits, 70000); assert.equal(u.wallet.sub.expiresAt, end); balanced(u);
});

test('Pro tools: plan and top-up credits only; paused at zero even with an active plan', async () => {
  const u = mk({ plan: 'pro', sub: { status: 'active' } }); C.grant(u, 1000, 'bonus', 'Welcome credits');
  assert.equal(C.hasProAccess(u), true, 'an active plan keeps the pages open');
  assert.equal(C.proPaused(u), true, 'but with no paid credits nothing runs');
  await assert.rejects(inPro(() => C.reserve(u, 10, 'Video Builder scene')), /Pro tools are paused/);
  buyPack(u, 10000); assert.equal(C.proPaused(u), false);
  const h = await inPro(() => C.reserve(u, 4000, 'Video Builder scene'));
  assert.equal(h.pro, true); assert.equal(u.wallet.packs[0].credits, 6000); assert.equal(u.wallet.free.credits, 1000, 'free credits untouched');
  await assert.rejects(inPro(() => C.reserve(u, 6500, 'Video Builder scene')), (e) => /6,000 plan and top-up credits/.test(e.message));
  balanced(u);
});

test('refunds go back to the bucket they came from', async () => {
  const u = mk(); C.grant(u, 1000, 'bonus', 'Welcome credits'); buyPack(u, 1000);
  const h = C.reserve(u, 1500, 'Video'); // 1000 from the pack, 500 free
  C.release(h, 'failed');
  assert.equal(u.wallet.packs[0].credits, 1000); assert.equal(u.wallet.free.credits, 1000);
  const h2 = C.reserve(u, 1500, 'Video'); C.settle(h2, 1200); // 300 back, to the bucket that lasts longest (free)
  assert.equal(u.wallet.packs[0].credits, 0); assert.equal(u.wallet.free.credits, 800);
  balanced(u);
});

test('a refund to a pack that has expired since comes back as a fresh top-up', () => {
  const u = mk(); buyPack(u, 1000);
  C.charge(u, 400, 'Video (reserved)', { taskId: 't1' });
  age(u, 91); C.ensure(u); assert.equal(u.credits, 0);
  C.grant(u, 400, 'refund', 'Video failed, refunded', { taskId: 't1' });
  assert.equal(u.credits, 400); assert.equal(C.paidBalance(u), 400, 'still paid credits'); balanced(u);
});

test('a job that costs a little more than it reserved never goes below zero in a bucket', () => {
  const u = mk(); buyPack(u, 100);
  const h = C.reserve(u, 100, 'Video'); C.settle(h, 130);
  assert.equal(u.credits, -30); assert.equal(u.wallet.owed, 30);
  buyPack(u, 1000); assert.equal(u.credits, 970, 'the next top-up pays what is owed'); assert.equal(u.wallet.owed, 0);
  balanced(u);
});

test('admin gifts: free by default, paid (90 days) when asked', () => {
  const u = mk(); C.grant(u, 500, 'promo', 'Promo credits'); assert.equal(u.wallet.free.credits, 500);
  C.grant(u, 700, 'promo', 'Promo top-up credits (90 days)', { paid: true });
  assert.equal(C.paidBalance(u), 700); assert.equal(u.wallet.packs[0].kind, 'promo');
  C.grant(u, -200, 'adjust', 'Credits removed'); assert.equal(u.credits, 1000); balanced(u);
});

test('top-ups expiring within a week are listed once for the reminder email', () => {
  const u = mk(); buyPack(u, 3000); age(u, 85);
  const soon = W.expiringSoon(u, 7); assert.equal(soon.length, 1);
  C.sweepCredits(); assert.equal(W.expiringSoon(u, 7).length, 0, 'warned once');
});

test('moving old balances: totals never change, nothing is lost, it runs once', () => {
  const before = db.users.length;
  const paid = mk({ credits: 12345.5 }); db.payments.push({ id: 'p_old', userId: paid.id, status: 'paid', amountUsd: 10 });
  const subd = mk({ credits: 80000, plan: 'max5' });
  const free = mk({ credits: 640 });
  const neg = mk({ credits: -12 });
  const zero = mk({ credits: 0 });
  const total = () => Math.round(db.users.slice(before).reduce((t, u) => t + u.credits, 0) * 1e4) / 1e4;
  const t0 = total(); let copied = 0;
  const r = C.migrateAll({ keepCopy: () => copied++ });
  assert.equal(copied, 1, 'the database is copied first');
  assert.equal(total(), t0, 'no balance changes');
  assert.equal(paid.wallet.packs[0].kind, 'carry'); assert.equal(paid.wallet.packs[0].expiresAt, null, 'carried paid credits keep no expiry');
  assert.equal(C.paidBalance(paid), 12345.5); assert.equal(C.hasProAccess(paid), true);
  assert.equal(C.paidBalance(subd), 80000, 'a subscriber\'s current balance is carried, not treated as this month\'s plan credits');
  assert.equal(free.wallet.free.credits, 640); assert.equal(C.paidBalance(free), 0);
  assert.equal(neg.wallet.owed, 12); assert.equal(neg.credits, -12);
  assert.equal(zero.credits, 0);
  assert.ok(r.moved >= 5);
  assert.equal(C.migrateAll({ keepCopy: () => copied++ }).moved, 0, 'second run does nothing'); assert.equal(copied, 1);
  for (const u of [paid, subd, free, neg, zero]) assert.equal(ledgerSum(u), 0, 'the move adds only zero-credit history rows');
});

test('CARRY_CREDIT_DAYS gives carried-over credits an end date', () => {
  process.env.CARRY_CREDIT_DAYS = '90';
  const u = mk({ credits: 500 }); db.payments.push({ id: 'p_old2', userId: u.id, status: 'paid', amountUsd: 5 });
  C.ensure(u); delete process.env.CARRY_CREDIT_DAYS;
  assert.equal(Math.round((Date.parse(u.wallet.packs[0].expiresAt) - Date.now()) / DAY), 90);
});

test('low-balance warning: 1,000 credits with paid credits, 200 on free credits only', () => {
  const a = mk(); C.grant(a, 1000, 'bonus', 'Welcome credits'); assert.equal(lowAtFor(a), 200);
  const b = mk(); buyPack(b, 5000); assert.equal(lowAtFor(b), 1000);
});

test('what the billing page shows', () => {
  const u = mk(); C.grant(u, 1000, 'bonus', 'Welcome credits'); buyPack(u, 10000);
  planMonth(u, 20000, new Date(Date.now() + 30 * DAY).toISOString(), 'subscription_create');
  const v = C.walletView(u);
  assert.equal(v.total, 31000); assert.equal(v.paid, 30000); assert.equal(v.free, 1000);
  assert.equal(v.sub.credits, 20000); assert.equal(v.packs.length, 1); assert.equal(v.packDays, 90);
});
