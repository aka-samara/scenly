// OmniHuman 2.0 and Seed TTS 3.0 are bought straight from BytePlus: priced from the official list price, shown only
// when their feature flag is on and their key is set, and never under a separate supplier name.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const env = (vars, fn) => async () => { const old = {}; for (const k in vars) { old[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; } try { await fn(); } finally { for (const k in old) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } } };

test('OmniHuman is hidden unless the flag is on and a credential is set', env({ FEATURE_AVATAR_VIDEO: '1', BYTEPLUS_VISION_API_KEY: null, BYTEPLUS_ACCESS_KEY_ID: null, BYTEPLUS_SECRET_ACCESS_KEY: null }, async () => {
  const { directModels } = await import('../server/catalog.js');
  assert.equal(directModels().length, 0);
  process.env.BYTEPLUS_VISION_API_KEY = 'k'; process.env.FEATURE_AVATAR_VIDEO = '0';
  assert.equal(directModels().length, 0);
}));

test('An Access Key pair also switches OmniHuman on, and is signed the way BytePlus expects', env({ FEATURE_AVATAR_VIDEO: '1', BYTEPLUS_VISION_API_KEY: null, BYTEPLUS_ACCESS_KEY_ID: 'test-ak', BYTEPLUS_SECRET_ACCESS_KEY: 'test-sk' }, async () => {
  const { directModels } = await import('../server/catalog.js');
  const { visionAuthKind, signedRequest } = await import('../server/byteplus.js');
  assert.equal(visionAuthKind(), 'access-key');
  assert.equal(directModels().length, 1, 'the model shows with an Access Key pair alone');
  // Signature compared against the official byteplus-sdk (SignerV4) for this exact body, date and credentials.
  const body = '{"req_key":"realman_avatar_picture_omni20_cv","image_urls":["http://x/p.jpg"],"audio_url":"http://x/a.mp3","enable_watermark":false}';
  const r = signedRequest('CVSync2AsyncSubmitTask', body, new Date('2026-11-25T05:00:00Z'));
  assert.equal(r.url, 'https://cv.byteplusapi.com/?Action=CVSync2AsyncSubmitTask&Version=2024-06-06');
  assert.equal(r.headers.Authorization, 'HMAC-SHA256 Credential=test-ak/20261125/ap-singapore-1/cv/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=6adc1e1a58326a88587ec02ec521dfcc833e62b22191b74bf0c04c9628c65964');
}));

test('OmniHuman is priced at the official $0.07 per second plus the direct margin', env({ FEATURE_AVATAR_VIDEO: '1', BYTEPLUS_VISION_API_KEY: 'k', BYTEPLUS_ACCESS_KEY_ID: null, BYTEPLUS_SECRET_ACCESS_KEY: null, DIRECT_MARGIN_PCT: null, CREDIT_USD: null }, async () => {
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

test('voice settings stay inside the ranges the speech API accepts', async () => {
  const { voiceSettings } = await import('../server/byteplus.js');
  assert.equal(voiceSettings({}), null, 'normal settings send nothing');
  assert.equal(voiceSettings({ speed: 1, volume: 1, pitch: 0, style: '  ' }), null);
  assert.deepEqual(voiceSettings({ speed: 3, volume: 0.1, pitch: 40, style: ' Slowly,\n warmly ' }), { speed: 2, volume: 0.5, pitch: 12, instructions: ['Slowly, warmly'] });
  assert.deepEqual(voiceSettings({ speed: '0.75', pitch: -4.4 }), { speed: 0.75, pitch: -4 });
  assert.equal(voiceSettings({ style: 'x'.repeat(500) }).instructions[0].length, 200);
});

test('every voice has a unique id, and native voices name their language', async () => {
  const { VOICES } = await import('../server/byteplus.js');
  assert.equal(new Set(VOICES.map((v) => v.id)).size, VOICES.length);
  for (const v of VOICES.filter((x) => !['American', 'British'].includes(x.accent))) assert.ok(/^[a-z]{2}$/.test(v.lang || ''), `${v.name} names its language`);
  for (const acc of ['Italian', 'Spanish (Spain)', 'Spanish (Latin America)', 'Chinese']) assert.ok(VOICES.filter((v) => v.accent === acc).length >= 4, `${acc} has several native voices`);
});
