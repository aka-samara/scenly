import test from 'node:test';
import assert from 'node:assert/strict';
import { sizeForShape, maxImageCount } from '../server/generate.js';
import { imageUsd, sizePixels } from '../server/catalog.js';

const gpt = { image: { sizes: ['1024x1024', '2048x2048', '2560x1440', '1440x2560', '2304x1728', '1728x2304'], maxN: 10, qualities: ['low', 'medium', 'high'], outUsdPerM: 30, tokenStyle: 'gpt' }, price: { usdPerImage: 0.04 } };
const seedream = { image: { sizes: ['2048x2048', '2560x1440', '1440x2560', '2K', '3K', '4K'], maxN: 15, outUsdPerM: null }, price: { usdPerImage: 0.033 } };

test('a shape maps to the nearest real size, the smallest when several fit', () => {
  assert.equal(sizeForShape(gpt, '1:1'), '1024x1024');
  assert.equal(sizeForShape(gpt, '9:16'), '1440x2560');
  assert.equal(sizeForShape(gpt, '16:9'), '2560x1440');
  assert.equal(sizeForShape(gpt, '3:4'), '1728x2304');
  assert.equal(sizeForShape(seedream, '1:1'), '2048x2048'); // "2K" style sizes are never picked for a shape
  assert.equal(sizeForShape(gpt, 'wide'), undefined);
});

test('batch size follows the model limit, at least 4, at most 15', () => {
  assert.equal(maxImageCount(gpt), 10);
  assert.equal(maxImageCount(seedream), 15);
  assert.equal(maxImageCount({ image: { maxN: 1 } }), 4);
});

test('token-billed pictures cost more when bigger or higher quality; flat-priced ones do not change', () => {
  assert.equal(sizePixels('4K'), 4096 * 4096);
  const small = imageUsd(gpt, '1024x1024', 'medium'), big = imageUsd(gpt, '2048x2048', 'medium'), high = imageUsd(gpt, '1024x1024', 'high');
  assert.ok(big > small * 3.9 && big < small * 4.1);
  assert.ok(high > small * 3);
  assert.equal(imageUsd(seedream, '4K'), 0.033);
});
