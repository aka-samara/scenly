// Admin module: usage areas, statuses, plan history, refunds netted into the right area. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-admin-'));
const { default: db } = await import('../server/db.js');
const { grant, charge, reserve, release } = await import('../server/credits.js');
const { areaOf, userStatus } = await import('../server/admin.js');
const { notePlan } = await import('../server/billing.js');
const { trackRequest } = await import('../server/monitor.js');

test('areas come from the description or the page that spent the credits', () => {
  assert.equal(areaOf({ desc: 'Chat · GPT-5' }), 'chat');
  assert.equal(areaOf({ desc: 'Code · Kimi K2 Code' }), 'code');
  assert.equal(areaOf({ desc: 'Word document · GLM-5-Flash' }), 'docs');
  assert.equal(areaOf({ desc: 'Spreadsheet · Qwen3-Flash' }), 'docs');
  assert.equal(areaOf({ desc: 'Image · Seedream 5.0 Pro' }), 'image');
  assert.equal(areaOf({ desc: 'Image · Seedream 5.0 Pro', via: '/api/pro/frame' }), 'pro');
  assert.equal(areaOf({ desc: 'Image · Seedream 5.0 Pro', via: '/api/generate', app: 'headshot' }), 'apps');
  assert.equal(areaOf({ desc: 'Video (reserved) · Seedance 2.5' }), 'video');
  assert.equal(areaOf({ desc: 'Video Builder scene · Seedance 2.5 (reserved)' }), 'builder');
  assert.equal(areaOf({ desc: 'Video Agent · storyboard · Gemini 3.5 Flash' }), 'agent');
  assert.equal(areaOf({ desc: 'Studio Pro · plan · GPT-5.6 Luna' }), 'pro');
  assert.equal(areaOf({ desc: 'Prompt enhance · DeepSeek V4 Flash' }), 'enhance');
});

test('a charge made while answering a request remembers the page', async () => {
  const u = { id: 'u_via', credits: 0 }; db.users.push(u); grant(u, 50, 'grant', 'start');
  await new Promise((done) => trackRequest({ path: '/api/pro/clip', method: 'POST', body: {} }, {}, () => { charge(u, 5, 'Image · X', { model: 'x' }); done(); }));
  const l = db.ledger.filter((x) => x.userId === u.id && x.type === 'usage').pop();
  assert.equal(l.via, '/api/pro/clip');
  assert.equal(areaOf(l), 'pro');
});

test('a released hold refunds into the same area', () => {
  const u = { id: 'u_hold', credits: 0 }; db.users.push(u); grant(u, 100, 'grant', 'start');
  const h = reserve(u, 40, 'Video Builder scene · Seedance 2.5', { builderId: 'b1' });
  release(h, 'failed');
  const rows = db.ledger.filter((l) => l.userId === u.id && (l.type === 'usage' || l.type === 'refund'));
  assert.equal(rows.reduce((n, l) => n - l.credits, 0), 0, 'net spend is zero');
  assert.ok(rows.every((l) => l.holdId === h.id));
});

test('status follows the subscription and the plan history', () => {
  const u = { id: 'u_s', plan: 'free' };
  assert.equal(userStatus(u), 'free');
  u.plan = 'max5'; notePlan(u, 'free'); u.sub = { status: 'active', planId: 'max5' };
  assert.equal(userStatus(u), 'upgraded');
  u.plan = 'pro'; notePlan(u, 'max5'); u.sub.planId = 'pro';
  assert.equal(u.planHistory.at(-1).kind, 'downgraded');
  assert.equal(userStatus(u), 'downgraded');
  u.sub.paused = true; assert.equal(userStatus(u), 'paused');
  u.sub.paused = false; u.sub.cancelAtPeriodEnd = true; assert.equal(userStatus(u), 'cancelling');
  u.sub.status = 'canceled'; u.plan = 'free'; u.everSubscribed = true; notePlan(u, 'pro');
  assert.equal(userStatus(u), 'cancelled');
  assert.deepEqual(u.planHistory.map((x) => x.kind), ['subscribed', 'downgraded', 'cancelled']);
});

test('with a live Stripe key only live payments count as revenue; test and demo ones are set apart', async () => {
  const { realPayment } = await import('../server/admin.js');
  const before = process.env.STRIPE_SECRET_KEY;
  const demo = { status: 'paid', mode: 'demo', amountUsd: 20 };
  assert.equal(realPayment(demo), !/^sk_live_/.test(before || ''), 'without a live key everything counts, as before');
  process.env.STRIPE_SECRET_KEY = 'sk_live_test_only';
  try {
    assert.equal(realPayment(demo), false);
    assert.equal(realPayment({ status: 'paid', mode: 'stripe', live: false, amountUsd: 20 }), false);
    assert.equal(realPayment({ status: 'paid', mode: 'stripe', live: true, amountUsd: 20 }), true);
    assert.equal(realPayment({ status: 'pending', mode: 'stripe', live: true, amountUsd: 20 }), false);
  } finally { if (before === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = before; }
});
