import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { call, callJson, tidyProviderText } from '../server/gateway.js';
import { paidUsd } from '../server/catalog.js';

function server(handler) {
  return new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, () => resolve(s)); });
}
async function withGateway(handler, fn) {
  const s = await server(handler);
  process.env.AICREDIT_BASE_URL = `http://127.0.0.1:${s.address().port}/api/v1`;
  process.env.AICREDIT_API_KEY = 'test';
  try { await fn(); } finally { s.closeAllConnections?.(); s.close(); }
}

test('quota error from the provider becomes a calm message without ids', async () => {
  await withGateway((req, res) => { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: '403 insufficient account quota (request id: helix-gxO8gUWA5Ju3f1nq)', type: 'new_api_error' } })); }, async () => {
    await assert.rejects(callJson('/chat/completions', { json: {} }), (e) => { assert.match(e.message, /busy|can't take/); assert.doesNotMatch(e.message, /helix|request id|403|quota/i); return true; });
  });
});

test('a safety refusal gets its own calm wording, never the raw text', async () => {
  await withGateway((req, res) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Your prompt was rejected by the safety system (request id: abc).' } })); }, async () => {
    await assert.rejects(callJson('/images/generations', { json: {} }), (e) => { assert.match(e.message, /safety rules/); assert.doesNotMatch(e.message, /request id/); return true; });
  });
});

test('every other provider error becomes a busy wording', async () => {
  for (const [code, text] of [[500, '<html>502 Bad Gateway</html>'], [400, 'size "9x9" is not supported'], [401, 'invalid key'], [503, 'no available channel for model gpt-5.5']]) {
    await withGateway((req, res) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: text } })); }, async () => {
      await assert.rejects(callJson('/chat/completions', { json: {} }), (e) => { assert.match(e.message, /^This model /); assert.match(e.message, /No credits were charged\.$/); assert.equal(e.raw, text); return true; });
    });
  }
});

test('a gateway that never answers is given up on, and the POST is not sent twice', async () => {
  let hits = 0;
  await withGateway(() => { hits++; /* never answers */ }, async () => {
    const t0 = Date.now();
    await assert.rejects(call('/images/generations', { json: {}, waitMs: 300 }), (e) => { assert.equal(e.status, 504); assert.match(e.message, /too long|did not answer in time/); return true; });
    assert.ok(Date.now() - t0 < 2000);
    assert.equal(hits, 1);
  });
});

test('video task failure text hides account details but keeps real reasons', () => {
  assert.match(tidyProviderText('insufficient account quota (request id: helix-1)'), /^This model /);
  assert.match(tidyProviderText('The input image contains a real person.'), /safety rules/);
});

test('a zero charge from the gateway for real work uses the price list', () => {
  assert.equal(paidUsd({ charge_amount: 0 }, 0.012), 0.012);
  assert.equal(paidUsd({ charge_amount: '0.004' }, 0.012), 0.004);
  assert.equal(paidUsd(null, 0.01), 0.01);
});
