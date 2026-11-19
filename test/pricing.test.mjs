// The price rule: users pay the AICredit price plus the margin, unless that would pass the official price.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-pricing-')); // never the real database

process.env.MARGIN_PCT = '5'; process.env.CREDIT_USD = '0.001'; process.env.AICREDIT_MASTER_DISCOUNT_PCT = '5';
const { markupFor, markupOf, setDiscounts, usdToCredits, MARGIN_PCT, MASTER_DISCOUNT_PCT, PLANS, PACKS } = await import('../server/credits.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

test('a discounted model gets the 5% margin', () => {
  near(markupFor(25), 1.05); near(markupFor(10), 1.05); near(markupFor(5), 1.05);
  near(usdToCredits(1, 25), 1050); // $1 of AICredit cost is 1,050 credits
});
test('no margin when it would pass the official price', () => {
  near(markupFor(0), 1); near(markupFor(4), 1); near(markupFor(4.7), 1);
  near(usdToCredits(1, 0), 1000);
  // with the margin the user never pays more than official: (1 - d) x markup <= 1
  for (const d of [0, 1, 4, 4.76, 4.77, 5, 10, 35, 50]) assert.ok((1 - d / 100) * markupFor(d) <= 1 + 1e-9, `discount ${d}`);
});
test('the margin is found from the model', () => {
  setDiscounts([{ id: 'cheap', discountPct: 35 }, { id: 'full-price', discountPct: 0 }]);
  near(markupOf('cheap'), 1.05); near(markupOf('full-price'), 1); near(markupOf({ id: 'full-price' }), 1);
  near(markupOf({ id: 'x', discountPct: 20 }), 1.05);
  near(markupOf('never-heard-of-it'), 1.05); near(markupOf(undefined), 1.05); // unknown models get the plain margin
  near(usdToCredits(0.5, 'cheap'), 525); near(usdToCredits(0.5, 'full-price'), 500);
});
test('settings are read from the environment and bad values fall back', () => {
  assert.equal(MARGIN_PCT(), 5); assert.equal(MASTER_DISCOUNT_PCT(), 5);
  process.env.MARGIN_PCT = 'abc'; assert.equal(MARGIN_PCT(), 5);
  process.env.MARGIN_PCT = '10'; near(markupFor(20), 1.1); near(markupFor(8), 1);
  process.env.MARGIN_PCT = '5';
});
test('no offer sells credits below face value', () => {
  // With a 5% margin $1 of credits costs Scenly about $0.905 before fees, so bonus credits would be sold at a loss.
  for (const o of [...PLANS, ...PACKS].filter((x) => x.priceUsd > 0)) assert.ok(o.credits <= o.priceUsd * 1000, `${o.id} gives bonus credits`);
});
