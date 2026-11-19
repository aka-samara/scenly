// Memory API test. Run: node devtools/mock-memory-gw.mjs, then the app with AICREDIT_BASE_URL=http://localhost:3199/api/v1 AICREDIT_API_KEY=x PORT=3111 RATE_LIMITS=0
// and a fresh DATA_DIR, then node devtools/t-memory.mjs from the same folder as the mock (it reads mock-memory.log).
import fs from 'node:fs';
const LOG = process.env.MOCK_LOG || 'mock-memory.log';
if (fs.existsSync(LOG)) fs.rmSync(LOG);
const B = process.env.APP || 'http://localhost:3111';
let cookie = '', pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
async function api(p, { method = 'GET', body } = {}) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: B }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
}
async function chat(message, conversationId) {
  const r = await fetch(B + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: B }, body: JSON.stringify({ model: 'deepseek-v4-flash', message, conversationId }) });
  const t = await r.text();
  const done = t.split('\n\n').find((b) => b.startsWith('event: done'));
  return done ? JSON.parse(done.split('\ndata: ')[1]) : { raw: t };
}
const email = `mem${Date.now()}@test.local`;
let r = await api('/api/auth/register', { method: 'POST', body: { email, password: 'devpass123', name: 'Aka Tester' } });
ok(r.status === 200, 'register ' + JSON.stringify(r.j).slice(0, 200));
r = await api('/api/memory');
ok(r.j.memory.on && r.j.memory.learn && r.j.memory.facts.length === 0 && r.j.memory.accountName === 'Aka Tester', 'empty memory');
// A message about a task only: no helper call, no note.
let d = await chat('Write a haiku about rain');
ok(d.message && !d.message.memory, 'no memory note on a plain task');
ok(!/kind":"learn/.test(fs.readFileSync(LOG, 'utf8')), 'helper not called for a plain task');
// Personal facts are learned and shown under the answer.
d = await chat('Hi, my name is Aka and I live in Sydney, Australia. I prefer short answers.', d.conversation.id);
ok(d.message?.memory?.length === 3, 'learned 3 changes ' + JSON.stringify(d.message?.memory));
r = await api('/api/memory');
ok(r.j.memory.name === 'Aka' && r.j.memory.location === 'Sydney, Australia' && r.j.memory.facts[0]?.text === 'Prefers short answers' && r.j.memory.facts[0].source === 'chat', 'saved ' + JSON.stringify(r.j.memory));
// The next answer gets the memory in its system prompt.
d = await chat('What is the weather like today?', d.conversation.id);
ok(/Sydney, Australia/.test(d.message?.content), 'answer used location: ' + d.message?.content);
const lastChat = fs.readFileSync(LOG, 'utf8').trim().split('\n').map(JSON.parse).filter((x) => x.kind === 'chat').at(-1);
ok(/Name: Aka/.test(lastChat.memory) && /Prefers short answers/.test(lastChat.memory), 'system prompt has memory');
// Saved in the conversation, so the note shows after reload.
r = await api('/api/conversations/' + d.conversation.id);
ok((r.j.conversation || r.j).messages.some((m) => m.memory?.length), 'note kept on the message');
// Edit by hand.
const fid = (await api('/api/memory')).j.memory.facts[0].id;
r = await api('/api/memory/facts/' + fid, { method: 'PATCH', body: { text: '  Prefers very short answers\n' } });
ok(r.j.memory.facts[0].text === 'Prefers very short answers' && r.j.memory.facts[0].source === 'you', 'edit');
r = await api('/api/memory/facts', { method: 'POST', body: { text: 'Runs a small video agency' } });
ok(r.j.memory.facts.length === 2, 'add');
r = await api('/api/memory/facts', { method: 'POST', body: { text: 'runs a small video agency' } });
ok(r.status === 400, 'duplicate refused');
r = await api('/api/memory/facts', { method: 'POST', body: { text: '   ' } });
ok(r.status === 400, 'empty refused');
r = await api('/api/memory', { method: 'PUT', body: { location: 'Melbourne' } });
ok(r.j.memory.location === 'Melbourne' && r.j.memory.name === 'Aka', 'edit location only');
// Forget from chat.
d = await chat('Please forget that I like short answers', d.conversation.id);
r = await api('/api/memory');
ok(r.j.memory.facts.length === 1 && d.message?.memory?.[0]?.kind === 'forgot', 'forgot via chat ' + JSON.stringify(d.message?.memory));
// Turning memory off: nothing in the prompt, nothing learned.
await api('/api/memory', { method: 'PUT', body: { on: false } });
d = await chat('My name is Bob, what is the weather?', d.conversation.id);
const off = fs.readFileSync(LOG, 'utf8').trim().split('\n').map(JSON.parse).filter((x) => x.kind === 'chat').at(-1);
ok(!off.memory && !d.message?.memory && (await api('/api/memory')).j.memory.name === 'Aka', 'off: not used, not learned');
await api('/api/memory', { method: 'PUT', body: { on: true, learn: false } });
d = await chat('My name is Bob', d.conversation.id);
ok(!d.message?.memory && (await api('/api/memory')).j.memory.name === 'Aka', 'learn off');
// Facts limit.
await api('/api/memory', { method: 'PUT', body: { learn: true } });
for (let i = 0; i < 40; i++) await api('/api/memory/facts', { method: 'POST', body: { text: 'Fact ' + i } });
r = await api('/api/memory');
ok(r.j.memory.facts.length === 30, 'cap at 30');
r = await api('/api/memory/facts', { method: 'POST', body: { text: 'x'.repeat(400) } });
ok(r.status === 400, 'full refused');
// Delete one and clear all.
r = await api('/api/memory/facts/' + r.j.memory?.facts?.[0]?.id, { method: 'DELETE' });
r = await api('/api/memory'); const before = r.j.memory.facts.length;
r = await api('/api/memory/facts/' + r.j.memory.facts[0].id, { method: 'DELETE' });
ok(r.j.memory.facts.length === before - 1, 'delete one');
r = await api('/api/memory', { method: 'DELETE' });
ok(!r.j.memory.facts.length && !r.j.memory.name && !r.j.memory.location && r.j.memory.on, 'clear all');
// Another user cannot see it; signed out gets 401.
const keep = cookie; cookie = '';
r = await api('/api/memory'); ok(r.status === 401, 'signed out 401');
cookie = keep;
// The user object sent to the browser does not carry memory.
r = await api('/api/auth/me'); ok(!JSON.stringify(r.j).includes('memory'), 'me has no memory');
console.log(`${pass} passed, ${fail} failed`);
