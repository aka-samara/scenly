// Simulates a rolling deploy: copy A serves, copy B starts on the same data folder, people keep signing in on A,
// then A is stopped. Everything done on A before it stopped must be there on B, and B must answer requests that
// arrived while it waited. Run: node devtools/t-handover.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const DATA = '/tmp/t-handover-' + Date.now();
const env = (port) => ({ ...process.env, PORT: String(port), DATA_DIR: DATA, RATE_LIMITS: '0', DB_SAVE_MS: '5000', AICREDIT_API_KEY: '', MAIL_OUTBOX: '', SMTP_HOST: '', MANDRILL_API_KEY: '' });
const logs = { A: '', B: '' };
const start = (name, port) => { const p = spawn('node', ['server/index.js'], { env: env(port), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', (d) => (logs[name] += d)); p.stderr.on('data', (d) => (logs[name] += d)); return p; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (port, path = '/healthz') => { for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://localhost:${port}${path}`); if (r.ok) return r.json(); } catch {} await sleep(150); } throw new Error('not up ' + port); };
const reg = async (port, email) => { const r = await fetch(`http://localhost:${port}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'password123', name: 'T' }) }); if (!r.ok) throw new Error(await r.text()); return r.headers.get('set-cookie').split(';')[0]; };
const me = (port, cookie) => fetch(`http://localhost:${port}/api/me`, { headers: { cookie } }).then((r) => r.status);
let fails = 0; const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails++; };

const A = start('A', 3301); await up(3301);
const early = await reg(3301, 'early@t.local');
const B = start('B', 3302);
const hb = await up(3302); check(hb.starting === true, 'new copy is healthy at once but waits (healthz says starting)');
const late = await reg(3301, 'late@t.local'); // the case from the bug: a sign-in on the old copy during the deploy
check((await me(3301, late)) === 200, 'old copy still serves people during the deploy');
// While the new copy waits, requests that reach it are passed on to the old copy: answered at once, nothing lost.
let t0 = Date.now(); const passed = await me(3302, late);
check(passed === 200 && Date.now() - t0 < 1500, `request to the waiting new copy is passed to the old one, no pause (${passed}, ${Date.now() - t0} ms)`);
const viaNew = await reg(3302, 'vianew@t.local'); // a sign-up made through the new copy before it took over
await sleep(1500);
A.kill('SIGTERM');
t0 = Date.now(); const heldStatus = await me(3302, late);
check(heldStatus === 200, `request during the switch is answered after hand-over, signed in (${heldStatus}, ${Date.now() - t0} ms)`);
check((await me(3302, viaNew)) === 200, 'sign-up passed through the new copy while it waited is kept');
check((await me(3302, early)) === 200, 'sign-in from before the deploy still works on the new copy');
check((await me(3302, late)) === 200, 'sign-in made on the old copy during the deploy works on the new copy');
await sleep(300);
check(/let go after/.test(logs.B), 'new copy logged the hand-over');
// a crashed copy (no shutdown) must not make the next one wait
B.kill('SIGKILL'); await sleep(9000);
const C = start('C', 3303); const t1 = Date.now(); const hc = await up(3303); await up(3303, '/api/config');
check(!hc.starting || Date.now() - t1 < 3000, `after a crash the next copy starts without waiting (${Date.now() - t1} ms)`);
check((await me(3303, late)) === 200, 'sign-ins survive a crash too');
C.kill('SIGTERM'); await sleep(500);
fs.rmSync(DATA, { recursive: true, force: true });
if (fails) { console.log(logs); process.exit(1); }
console.log('all passed');
