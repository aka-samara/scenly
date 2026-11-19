// Stripe webhook signatures and the demo plan's monthly roll. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-billing-'));
process.env.FEATURE_SUBSCRIPTIONS = '1';
delete process.env.STRIPE_SECRET_KEY;
const { default: db } = await import('../server/db.js');
const { verifySignature, subscribe, switchPlan, setCancel, syncUser, planById, billingView, planForPrice } = await import('../server/billing.js');

const sign = (body, secret, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
test('a correctly signed webhook is accepted', () => assert.ok(verifySignature('{"a":1}', sign('{"a":1}', 'whsec_x'), 'whsec_x')));
test('a wrong secret, changed body or old timestamp is refused', () => {
  assert.ok(!verifySignature('{"a":1}', sign('{"a":1}', 'whsec_y'), 'whsec_x'));
  assert.ok(!verifySignature('{"a":2}', sign('{"a":1}', 'whsec_x'), 'whsec_x'));
  assert.ok(!verifySignature('{"a":1}', sign('{"a":1}', 'whsec_x', Math.floor(Date.now() / 1000) - 3600), 'whsec_x'));
  assert.ok(!verifySignature('{}', undefined, 'whsec_x'));
});
test('a price is matched to its plan by metadata or lookup key', () => {
  assert.equal(planForPrice({ id: 'p1', metadata: { plan: 'max5' } }).id, 'max5');
  assert.equal(planForPrice({ id: 'p2', metadata: {}, lookup_key: 'polymind_pro_2000_month' }).id, 'pro');
  assert.equal(planForPrice({ id: 'p3', metadata: {} }), null);
});
const user = () => { const u = { id: 'u' + Math.random(), email: 'x@y.z', credits: 0, plan: 'free' }; db.users.push(u); return u; };
test('demo plan: start, renew once per month, cancel at the end', async () => {
  const u = user();
  assert.equal(billingView(u).trial, true);
  await subscribe(u, planById('pro'));
  assert.equal(u.plan, 'pro'); assert.equal(u.credits, 20000); assert.equal(billingView(u).trial, false);
  await assert.rejects(subscribe(u, planById('max5')), (e) => e.status === 409);
  u.sub.currentPeriodEnd = new Date(Date.now() - 1000).toISOString();
  await syncUser(u); assert.equal(u.credits, 40000);
  await syncUser(u); assert.equal(u.credits, 40000, 'no second renewal in the same month');
  await setCancel(u, true);
  u.sub.currentPeriodEnd = new Date(Date.now() - 1000).toISOString();
  await syncUser(u); assert.equal(u.plan, 'free'); assert.equal(u.credits, 40000, 'credits kept after the plan ends');
});
test('demo switch: up adds the difference, down adds nothing', async () => {
  const u = user(); await subscribe(u, planById('pro'));
  await switchPlan(u, planById('max20')); assert.equal(u.credits, 200000);
  await switchPlan(u, planById('pro')); assert.equal(u.credits, 200000); assert.equal(u.plan, 'pro');
});
