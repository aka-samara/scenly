// OmniHuman 2.0 and Seed TTS 3.0 are bought straight from BytePlus: priced from the official list price, shown only
// when their feature flag is on and their key is set, and never under a separate supplier name.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const env = (vars, fn) => async () => { const old = {}; for (const k in vars) { old[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; } try { await fn(); } finally { for (const k in old) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } } };

test('OmniHuman is hidden unless the flag is on and the key is set', env({ FEATURE_AVATAR_VIDEO: '1', BYTEPLUS_VISION_API_KEY: null }, async () => {
  const { directModels } = await import('../server/catalog.js');
  assert.equal(directModels().length, 0);
  process.env.BYTEPLUS_VISION_API_KEY = 'k'; process.env.FEATURE_AVATAR_VIDEO = '0';
  assert.equal(directModels().length, 0);
}));

test('OmniHuman is priced at the official $0.07 per second plus the direct margin', env({ FEATURE_AVATAR_VIDEO: '1', BYTEPLUS_VISION_API_KEY: 'k', DIRECT_MARGIN_PCT: null, CREDIT_USD: null }, async () => {
  const { directModels } = await import('../server/catalog.js');
  const [m] = directModels();
  assert.equal(m.id, 'omnihuman-2.0');
  assert.equal(m.provider, 'ByteDance');
  assert.ok(Math.abs(m.price.creditsPerSecond['720p'] - 73.5) < 1e-9);
  process.env.DIRECT_MARGIN_PCT = '0';
  assert.ok(Math.abs(directModels()[0].price.creditsPerSecond['720p'] - 70) < 1e-9, 'margin 0 is the official price');
  assert.deepEqual(m.video.tasks, ['create']);
  assert.equal(m.video.textToVideo, false);
  assert.ok(m.video.avatar);
}));

test('AI voice costs $20 per million characters plus the direct margin', env({ DIRECT_MARGIN_PCT: null, CREDIT_USD: null }, async () => {
  const { speechCredits } = await import('../server/speech.js');
  assert.ok(Math.abs(speechCredits(1000) - 21) < 1e-9);
  assert.equal(speechCredits(0), 0);
}));

test('direct models do not change how AICredit models are priced', env({ MARGIN_PCT: null }, async () => {
  const { markupOf, markupFor, registerDirect } = await import('../server/credits.js');
  registerDirect('omnihuman-2.0');
  assert.equal(markupOf(10), markupFor(10));
  assert.equal(markupOf({ id: 'seedance-x', discountPct: 0 }), 1, 'a gateway model at 0% discount still gets no margin above official');
  assert.equal(markupOf('omnihuman-2.0'), 1.05);
}));

test('the voice list leaves out voices named after famous people or characters', async () => {
  const { VOICES, findVoice, DEFAULT_VOICE } = await import('../server/byteplus.js');
  assert.ok(VOICES.length >= 30);
  assert.ok(findVoice(DEFAULT_VOICE));
  for (const v of VOICES) assert.doesNotMatch(v.id + v.name, /pitt|hiddleston|lana_del|zendaya|peppa|peiqi|gollum|joker|godfather|michael-mouse|simba|chandler/i);
  assert.equal(new Set(VOICES.map((v) => v.id)).size, VOICES.length);
});
