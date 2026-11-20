// A model the gateway lists under two ids shows once in the pickers (the cheaper id, or on a tie the shorter
// one), and the hidden id still finds the shown model so older chats keep working.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-dedupe-')); // never the real database
process.env.MARGIN_PCT = '5'; process.env.CREDIT_USD = '0.001';
const snap = JSON.parse(fs.readFileSync(new URL('../server/models-snapshot.json', import.meta.url), 'utf8'));
const opus = snap.results.find((m) => m.id === 'claude-opus-5');
const opus55 = snap.results.find((m) => m.id === 'claude-opus-5.5');
const results = [...snap.results,
  { ...opus, id: 'claude-opus-5-202609', model_id: 'claude-opus-5-202609', discount_percentage: 15 }, // same model, cheaper
  { ...opus55, id: 'claude-opus-5-5-cc', model_id: 'claude-opus-5-5-cc' }]; // same model, same price
const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ object: 'list', results })); });
await new Promise((r) => srv.listen(0, r));
process.env.AICREDIT_BASE_URL = `http://127.0.0.1:${srv.address().port}`;
const { getCatalog, findModel } = await import('../server/catalog.js');

test('each model name shows once per type', async () => {
  const all = await getCatalog();
  const seen = new Map();
  for (const m of all) { const k = m.type + '|' + m.name.toLowerCase(); assert.ok(!seen.has(k), `${m.name} twice: ${seen.get(k)} and ${m.id}`); seen.set(k, m.id); }
  assert.equal(all.filter((m) => m.name === 'Claude Opus 5').length, 1);
  assert.equal(all.filter((m) => m.name === 'Claude Opus 5.5').length, 1);
});
test('the cheaper id is kept; on a tie the shorter id', async () => {
  const all = await getCatalog();
  assert.equal(all.find((m) => m.name === 'Claude Opus 5').id, 'claude-opus-5-202609');
  assert.equal(all.find((m) => m.name === 'Claude Opus 5.5').id, 'claude-opus-5.5');
});
test('a hidden id still finds the shown model', async () => {
  assert.equal((await findModel('claude-opus-5')).id, 'claude-opus-5-202609');
  assert.equal((await findModel('claude-opus-5-5-cc')).id, 'claude-opus-5.5');
  assert.equal(await findModel('no-such-model'), undefined);
});
test('credits per message follow the AICredit price x 1.05', async () => {
  const m = await findModel('claude-opus-5-202609');
  assert.ok(Math.abs(m.price.creditsInPerM - m.price.inPerM * 1.05 * 1000) < 1e-6);
});
test.after(() => srv.close());
