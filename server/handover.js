// Hand-over between two copies of the app during a deploy, so nothing done in between is lost.
//
// Coolify deploys by starting the new copy next to the old one, waiting until the new one is healthy, and only
// then stopping the old one. Both share one data folder, and the database lives in memory. Before this file, the
// new copy read db.json as it started, while the old copy went on serving people for another minute or so; every
// sign-in, chat, charge or payment in that minute was made only in the old copy's memory and was gone once the new
// copy took over. A sign-in made then looked fine at first and then answered "Please sign in." everywhere.
//
// Now the new copy waits. It answers /healthz at once (so the deploy goes ahead) without reading the database,
// until the old copy has saved for the last time and let go (see releaseDb in db.js, called on shutdown). Then it
// reads db.json, which is now complete. Requests that reach it meanwhile are passed on to the old copy, which still
// has the live data (its address is in the heartbeat), so nobody waits; only in the second or two between the old
// copy starting to shut down and letting go are they held, and answered here right after.
// A copy that crashed stops its heartbeat, so the new copy does not wait for it.
//
// db.js imports this module, so nothing reads the database before the wait is over. Only the app itself
// (server/index.js) listens here; scripts and tests that import db.js just wait if another copy holds the data.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const OWNER_FILE = path.join(DATA_DIR, '.db-owner');
export const ALIVE_FILE = path.join(DATA_DIR, '.db-alive');
export const RELEASED = 'released';
export const HEARTBEAT_MS = 2000;
const STALE_MS = 8000; // no heartbeat for this long: the copy that held the data folder is gone
const MAX_WAIT_MS = Number(process.env.HANDOVER_MAX_MS) || 120000; // never wait longer than this for the old copy

fs.mkdirSync(DATA_DIR, { recursive: true });

const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };
let oldAddr = null; // "ip:port" of the copy that holds the data while it still takes requests, else null
/** Is another copy of the app running on this data folder and still holding the database? */
function otherCopyHolds() {
  oldAddr = null;
  const owner = read(OWNER_FILE);
  if (!owner || owner === RELEASED) return false;
  const alive = read(ALIVE_FILE); // "<owner token> <time> <ip:port | stopping>", written every HEARTBEAT_MS by the holder
  if (!alive) return false; // a copy from before this hand-over existed: nothing to wait for
  const [tok, at, addr] = alive.split(' ');
  const holds = tok === owner && Date.now() - Number(at) < STALE_MS;
  if (holds && addr && addr !== 'stopping') oldAddr = addr;
  return holds;
}

// Passes one request on to the old copy. If the old copy no longer takes connections (it has begun to stop),
// the request is held instead and answered here once the data is handed over.
function passOn(req, res) {
  const i = oldAddr.lastIndexOf(':');
  const up = http.request({ host: oldAddr.slice(0, i), port: Number(oldAddr.slice(i + 1)), method: req.method, path: req.url, headers: req.headers, agent: false });
  let connected = false;
  up.on('socket', (sock) => sock.once('connect', () => { connected = true; req.pipe(up); }));
  up.on('response', (r) => { res.writeHead(r.statusCode, r.statusMessage, r.rawHeaders); r.pipe(res); });
  up.on('error', () => {
    if (!connected) return hold(req, res); // nothing was sent: answer it here after the hand-over
    if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'The app was updating. Please try again.' })); }
    else res.destroy();
  });
  res.on('close', () => { if (!res.writableFinished) up.destroy(); });
}

const PORT = Number(process.env.PORT || 3000);
let handler = null; // the app, once it is ready
const held = [];
export const server = http.createServer((req, res) => {
  if (handler) return handler(req, res);
  if (req.url === '/healthz' || req.url.startsWith('/healthz?')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, starting: true }));
  }
  if (oldAddr) return passOn(req, res);
  hold(req, res);
});
function hold(req, res) { if (handler) handler(req, res); else held.push([req, res]); }

/** Gives the listening server to the app and answers the requests that waited for it. */
export function serve(app) {
  handler = app;
  for (const [req, res] of held.splice(0)) if (!res.destroyed) app(req, res);
  return server;
}

const isApp = /server[\\/]index\.js$/.test(process.argv[1] || '');
const listen = () => (isApp ? new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, resolve); }) : null);
if (otherCopyHolds()) {
  // Listen now, so the deploy can see this copy is healthy and stop the old one.
  await listen();
  console.log('[handover] another copy of the app still holds the data; waiting for it to save and stop');
  const t0 = Date.now();
  while (otherCopyHolds() && Date.now() - t0 < MAX_WAIT_MS) await new Promise((r) => setTimeout(r, 250));
  if (otherCopyHolds()) console.warn(`[handover] the other copy did not stop within ${Math.round(MAX_WAIT_MS / 1000)} s; taking over anyway`);
  else console.log(`[handover] the other copy let go after ${((Date.now() - t0) / 1000).toFixed(1)} s; loading the database`);
} else {
  await listen();
}
