// The one-time move to 1,000 credits = $1: every stored credit amount x10, dollars untouched, never twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleCredits, CREDIT_SCALE } from '../server/creditscale.js';

const sample = () => ({
  users: [{ id: 'u1', credits: 99.2345, expYear: 2030 }, { id: 'u2', credits: 0 }],
  conversations: [{ id: 'c1', messages: [{ credits: 0.8978, input: 1500, output: 700 }] }],
  ledger: [{ credits: -6.4496, balance: 92.7849, usd: 0.061425, desc: 'Image · Nano Banana 2' }, { credits: 5500, balance: 5592.78, desc: 'Credit pack, 5,500 credits · $50' }],
  tasks: [{ reserved: 109.2, credits: 109.2, duration: 5 }],
  payments: [{ amountUsd: 50, credits: 5500, desc: 'Credit pack, 5,500 credits' }],
  generations: [{ credits: 12.9 }],
  jobs: [{ priority: 2, payload: { credits: 30, reserved: 30, cap: 2.5 }, result: { credits: 28.4 } }],
  holds: [{ amount: 30, charged: 28.4, status: 'settled' }],
  vprojects: [{ rev: 12, scenes: [{ versions: [{ credits: 28.4 }] }] }],
  billing: { upgrades: { in_1: { fromPrice: 20, toPrice: 100, extraCredits: 8000 } } },
  prosessions: [{ state: { estimate: { credits: 240, perSecond: 21.84, images: 4 } } }],
});

test('every credit amount is multiplied by 10 and dollars stay', () => {
  const db = sample(); assert.equal(scaleCredits(db), true); assert.equal(db.creditScale, CREDIT_SCALE);
  assert.equal(db.users[0].credits, 992.345); assert.equal(db.users[0].expYear, 2030); assert.equal(db.users[1].credits, 0);
  assert.equal(db.conversations[0].messages[0].credits, 8.978); assert.equal(db.conversations[0].messages[0].input, 1500);
  assert.equal(db.ledger[0].credits, -64.496); assert.equal(db.ledger[0].balance, 927.849); assert.equal(db.ledger[0].usd, 0.061425);
  assert.equal(db.ledger[1].desc, 'Credit pack, 55,000 credits · $50'); assert.equal(db.ledger[0].desc, 'Image · Nano Banana 2');
  assert.equal(db.tasks[0].reserved, 1092); assert.equal(db.tasks[0].duration, 5);
  assert.equal(db.payments[0].credits, 55000); assert.equal(db.payments[0].amountUsd, 50); assert.equal(db.payments[0].desc, 'Credit pack, 55,000 credits');
  assert.equal(db.generations[0].credits, 129);
  assert.deepEqual(db.jobs[0], { priority: 2, payload: { credits: 300, reserved: 300, cap: 25 }, result: { credits: 284 } });
  assert.deepEqual(db.holds[0], { amount: 300, charged: 284, status: 'settled' });
  assert.equal(db.vprojects[0].scenes[0].versions[0].credits, 284); assert.equal(db.vprojects[0].rev, 12);
  assert.deepEqual(db.billing.upgrades.in_1, { fromPrice: 20, toPrice: 100, extraCredits: 80000 });
  assert.deepEqual(db.prosessions[0].state.estimate, { credits: 2400, perSecond: 218.4, images: 4 });
});
test('it never runs twice', () => {
  const db = sample(); scaleCredits(db); const once = JSON.stringify(db);
  assert.equal(scaleCredits(db), false); assert.equal(JSON.stringify(db), once);
});
test('a balance keeps its dollar value', () => {
  const db = sample(); const before = db.users[0].credits * 0.01; scaleCredits(db);
  assert.ok(Math.abs(db.users[0].credits * 0.001 - before) < 1e-9);
});
