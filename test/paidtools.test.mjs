// Video Agent, Video Builder and Studio Pro are for Pro and above; chat, images and Video Studio stay open.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-paidtools-'));
process.env.ADMIN_EMAILS = 'boss@example.com';
const { default: db } = await import('../server/db.js');
const { paidPlanOnly, hasPaidPlan, PAID_TOOL_PATHS, publicUser } = await import('../server/auth.js');

const mk = (plan, email = plan + '@example.com') => { const u = { id: 'u_' + plan + Math.random(), email, plan, credits: 500 }; db.users.push(u); db.sessions['s_' + u.id] = { userId: u.id, expires: Date.now() + 60000 }; return u; };
const ask = (u) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; let passed = false; paidPlanOnly({ cookies: u ? { pm_session: 's_' + u.id } : {} }, res, () => { passed = true; }); return { passed, res }; };

test('the Free plan is stopped with an upgrade message', () => {
  const r = ask(mk('free'));
  assert.equal(r.passed, false); assert.equal(r.res.code, 402); assert.equal(r.res.body.code, 'paid_plan_required');
});
test('Pro, Max and Ultra get in', () => { for (const plan of ['pro', 'max5', 'max20']) assert.equal(ask(mk(plan)).passed, true, plan); });
test('a credit pack alone does not open the paid tools', () => {
  const u = mk('free', 'packbuyer@example.com'); db.payments.push({ id: 'pay_x', userId: u.id, status: 'paid', amountUsd: 10 });
  assert.equal(ask(u).passed, false); assert.equal(publicUser(u).paid, true); assert.equal(publicUser(u).paidPlan, false);
});
test('admins get in on any plan, and signed-out requests fall through to the sign-in check', () => {
  assert.equal(ask(mk('free', 'boss@example.com')).passed, true);
  assert.equal(ask(null).passed, true);
  const old = mk('free', 'expired@example.com'); db.sessions['s_' + old.id].expires = Date.now() - 1; assert.equal(ask(old).passed, true);
});
test('only the three tools are covered', () => {
  assert.deepEqual(PAID_TOOL_PATHS, ['/api/builder', '/api/agent', '/api/pro']);
  assert.equal(hasPaidPlan({ plan: 'free', email: 'a@b.c' }), false); assert.equal(hasPaidPlan({ plan: 'pro', email: 'a@b.c' }), true); assert.equal(hasPaidPlan(null), false);
});
