// Transactional emails: templates, Mandrill sending, and the actions that trigger them. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-emails-'));
delete process.env.SMTP_HOST; delete process.env.MANDRILL_API_KEY;
process.env.MAIL_OUTBOX = '1';
process.env.LOW_CREDIT_ALERT = '20';
const { default: db } = await import('../server/db.js');
const { build } = await import('../server/emails.js');
const { grant, charge, reserve, settle } = await import('../server/credits.js');
const { register, verifyCode, changePassword } = await import('../server/auth.js');
const { notePlan } = await import('../server/billing.js');

const OUTBOX = path.join(process.env.DATA_DIR, 'outbox.json');
const outbox = () => { try { return JSON.parse(fs.readFileSync(OUTBOX, 'utf8')); } catch { return []; } };
const sentTo = (email) => outbox().filter((m) => m.to === email);
const flush = () => new Promise((r) => setTimeout(r, 30));
let n = 0;
const person = (credits = 0) => { const u = { id: 'u_e' + ++n, email: `p${n}@example.com`, name: 'Sam Lee', credits: 0, plan: 'free' }; db.users.push(u); if (credits) grant(u, credits, 'grant', 'start'); return u; };
const fakeRes = () => { const r = { code: 200, body: null, cookies: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.cookie = (k, v) => { r.cookies[k] = v; }; return r; };

const KINDS = ['verify', 'welcome', 'reset', 'password_changed', 'credits_added', 'low_credits', 'out_of_credits', 'plan_downgraded', 'plan_cancel', 'plan_ended', 'payment_failed'];
test('every email renders with the brand, the footer and a text version', () => {
  const u = { email: 'a@example.com', name: '<b>Sam</b> Lee', credits: 12, plan: 'pro' };
  for (const k of KINDS) {
    const m = build(k, u, { url: 'https://scenly.ai/x', code: '123456', credits: 100, balance: 12, desc: 'Pro plan', kind: 'create', planName: 'Pro', fromName: 'Max', toName: 'Pro', toPrice: 20, toCredits: 2200 });
    assert.ok(m.subject && m.subject.length < 90, k + ' subject');
    for (const s of ['ADXL PTY LTD', '447 Collins St, Melbourne VIC 3000', 'info@adxl.ai', '#4361ee', 'icon-192.png']) assert.ok(m.html.includes(s), `${k} html has ${s}`);
    assert.ok(m.text.includes('ADXL PTY LTD') && m.text.includes('info@adxl.ai'), k + ' text footer');
    assert.ok(!m.html.includes('<b>Sam</b>'), k + ' escapes the name');
  }
  assert.ok(build('verify', u, { url: 'https://scenly.ai/v', code: '042731' }).html.includes('042731'));
});

test('Mandrill gets the message from no-reply@scenly.ai with tracking off, and falls back cleanly on errors', async () => {
  const got = [];
  let reply = (body) => [{ email: body.message.to[0].email, status: 'sent' }];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const j = JSON.parse(b); got.push({ path: req.url, j }); res.setHeader('Content-Type', 'application/json'); const out = reply(j); res.statusCode = out.status === 'error' ? 500 : 200; res.end(JSON.stringify(out)); }); });
  await new Promise((r) => srv.listen(0, r));
  process.env.MANDRILL_API_BASE = `http://127.0.0.1:${srv.address().port}/api/1.0`;
  process.env.MANDRILL_API_KEY = 'md-test-not-a-real-key';
  try {
    const { sendEmail } = await import('../server/emails.js');
    const u = { email: 'b@example.com', name: 'Bo' };
    assert.equal(await sendEmail('reset', u, { url: 'https://scenly.ai/#/reset/abc' }), true);
    const m = got[0];
    assert.equal(m.path, '/api/1.0/messages/send.json');
    assert.equal(m.j.key, 'md-test-not-a-real-key');
    assert.equal(m.j.message.from_email, 'no-reply@scenly.ai');
    assert.equal(m.j.message.from_name, 'Scenly');
    assert.equal(m.j.message.headers['Reply-To'], 'info@adxl.ai');
    assert.equal(m.j.message.track_clicks, false);
    assert.deepEqual(m.j.message.tags, ['reset']);
    assert.ok(m.j.message.html.includes('https://scenly.ai/#/reset/abc') && m.j.message.text.includes('https://scenly.ai/#/reset/abc'));
    reply = () => [{ status: 'rejected', reject_reason: 'hard-bounce' }];
    await assert.rejects(sendEmail('reset', u, { url: 'x' }), /rejected: hard-bounce/);
    reply = () => ({ status: 'error', name: 'Invalid_Key', message: 'Invalid API key' });
    await assert.rejects(sendEmail('reset', u, { url: 'x' }), (e) => /Invalid_Key/.test(e.message) && !e.message.includes('md-test'));
  } finally {
    delete process.env.MANDRILL_API_KEY; delete process.env.MANDRILL_API_BASE; srv.close();
  }
});

test('sign up sends a code; the code confirms the account once, then a welcome email follows', async () => {
  const res = fakeRes();
  await register({ body: { email: 'new@example.com', name: 'Nia', password: 'longenough1' } }, res);
  assert.equal(res.body.pending, true);
  const mail = sentTo('new@example.com').find((m) => m.tag === 'verify');
  assert.match(mail.code, /^\d{6}$/);
  assert.match(mail.url, /\/api\/auth\/verify\?token=/);
  const wrong = String((Number(mail.code) + 1) % 1e6).padStart(6, '0');
  const bad = fakeRes(); verifyCode({ body: { email: 'new@example.com', code: wrong } }, bad);
  assert.equal(bad.code, 400);
  const ok = fakeRes(); verifyCode({ body: { email: 'NEW@example.com ', code: mail.code.slice(0, 3) + ' ' + mail.code.slice(3) } }, ok);
  assert.equal(ok.code, 200); assert.equal(ok.body.user.email, 'new@example.com');
  const again = fakeRes(); verifyCode({ body: { email: 'new@example.com', code: mail.code } }, again);
  assert.equal(again.code, 400, 'a used code does not work twice');
  await flush();
  assert.equal(sentTo('new@example.com').filter((m) => m.tag === 'welcome').length, 1);
});

test('the code stops working after 5 wrong tries', async () => {
  const res = fakeRes();
  await register({ body: { email: 'tries@example.com', password: 'longenough1' } }, res);
  const code = sentTo('tries@example.com').find((m) => m.tag === 'verify').code;
  const wrong = String((Number(code) + 7) % 1e6).padStart(6, '0');
  for (let i = 0; i < 5; i++) verifyCode({ body: { email: 'tries@example.com', code: wrong } }, fakeRes());
  const r = fakeRes(); verifyCode({ body: { email: 'tries@example.com', code } }, r);
  assert.equal(r.code, 400); assert.equal(r.body.code, 'code_expired');
});

test('low and out of credit emails go once each and re-arm after a top-up', async () => {
  const u = person(100);
  charge(u, 70, 'chat'); await flush();
  assert.equal(sentTo(u.email).length, 0, 'still above 20');
  charge(u, 15, 'chat'); charge(u, 1, 'chat'); await flush();
  assert.deepEqual(sentTo(u.email).map((m) => m.tag), ['low_credits']);
  charge(u, 13.5, 'chat'); await flush();
  assert.deepEqual(sentTo(u.email).map((m) => m.tag), ['low_credits', 'out_of_credits']);
  charge(u, 0.4, 'chat'); await flush();
  assert.equal(sentTo(u.email).length, 2, 'no repeats');
  grant(u, 1000, 'grant', 'top up'); charge(u, 990, 'video'); await flush();
  assert.deepEqual(sentTo(u.email).map((m) => m.tag), ['low_credits', 'out_of_credits', 'low_credits']);
});

test('a held job only warns after it settles, and a refused job counts as out of credits', async () => {
  const u = person(40);
  const h = reserve(u, 30, 'Video'); await flush();
  assert.equal(sentTo(u.email).length, 0, 'no warning while the hold may still be refunded');
  settle(h, 5); await flush();
  assert.equal(sentTo(u.email).length, 0, 'refund brought it back above the line');
  charge(u, 20, 'chat'); await flush();
  assert.deepEqual(sentTo(u.email).map((m) => m.tag), ['low_credits']);
  assert.throws(() => reserve(u, 50, 'Video')); await flush();
  assert.deepEqual(sentTo(u.email).map((m) => m.tag), ['low_credits', 'out_of_credits']);
});

test('a paid grant sends a receipt; bonus credits do not', async () => {
  const u = person();
  grant(u, 100, 'bonus', 'Welcome credits');
  db.payments.push({ id: 'pay_e1', userId: u.id, offerId: 'pack25', amountUsd: 25, credits: 2600, status: 'paid' });
  grant(u, 2600, 'purchase', '2,600 credits · $25', { paymentId: 'pay_e1' });
  db.payments.push({ id: 'pay_e2', userId: u.id, offerId: 'pro', kind: 'subscription', reason: 'subscription_cycle', amountUsd: 20, credits: 2200, status: 'paid' });
  grant(u, 2200, 'purchase', 'Pro plan · monthly renewal · $20', { paymentId: 'pay_e2' });
  await flush();
  const subjects = sentTo(u.email).map((m) => m.subject);
  assert.deepEqual(sentTo(u.email).map((m) => m.tag), ['credits_added', 'credits_added']);
  assert.match(subjects[0], /2,600 credits added/);
  assert.match(subjects[1], /Pro plan renewed/);
});

test('plan changes: downgrade and end send emails, upgrades rely on the receipt', async () => {
  const u = person(10);
  u.plan = 'max5'; notePlan(u, 'pro');
  u.plan = 'pro'; notePlan(u, 'max5');
  u.plan = 'free'; notePlan(u, 'pro');
  await flush();
  assert.deepEqual(sentTo(u.email).map((m) => m.tag), ['plan_downgraded', 'plan_ended']);
});

test('changing a password sends a security notice', async () => {
  const u = person(); u.salt = 'x'; u.passHash = null;
  const res = fakeRes(); changePassword({ user: u, body: { password: 'newpassword1' }, cookies: {} }, res);
  await flush();
  const m = sentTo(u.email).find((x) => x.tag === 'password_changed');
  assert.ok(m); assert.match(m.subject, /password was added/i);
});
