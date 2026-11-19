// Tiny JSON-file database. Good for local use and small deployments;
// swap for Postgres/SQLite before scaling to many users.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { scaleCredits, CREDIT_SCALE } from './creditscale.js';
import './handover.js'; // waits here, during a deploy, until the old copy of the app has saved and let go

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'db.json');

for (const d of [DATA_DIR, UPLOAD_DIR, MEDIA_DIR]) fs.mkdirSync(d, { recursive: true });

const empty = () => ({ users: [], sessions: {}, conversations: [], ledger: [], files: [], tasks: [], payments: [], generations: [], projects: [], characters: [], jobs: [], holds: [], vprojects: [], tracks: [] });

// A restore (npm run restore) leaves the database as db.json.restore; it takes over here, at start,
// so a restore can be run while the app is up and then finished with a restart.
const RESTORE_FILE = DB_FILE + '.restore';
if (fs.existsSync(RESTORE_FILE)) {
  if (fs.existsSync(DB_FILE)) fs.renameSync(DB_FILE, `${DB_FILE}.before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.renameSync(RESTORE_FILE, DB_FILE);
  console.log('[restore] using the restored database');
}

let db;
try {
  db = { ...empty(), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
} catch {
  db = { ...empty(), creditScale: CREDIT_SCALE }; // a new database starts in the current credit unit
}
// Credits became 10 times smaller on 2026-11-19 (1,000 credits = $1). A database from before is converted here,
// once, before anything reads it; the file as it was is kept beside it.
if (db.creditScale !== CREDIT_SCALE) {
  const keep = `${DB_FILE}.before-credits-x${CREDIT_SCALE}-${new Date().toISOString().replace(/[:.]/g, '-')}`; // a copy of exactly what is converted
  fs.copyFileSync(DB_FILE, keep);
  scaleCredits(db);
  const tmp = DB_FILE + '.tmp-scale'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE);
  console.log(`[credits] balances and history multiplied by ${CREDIT_SCALE}: 1,000 credits = $1 now. The file from before is ${path.basename(keep)}`);
}

// Saving rewrites the whole file, which pauses the app for a moment (about 0.5 s at 150 MB).
// DB_SAVE_MS sets how often at most: 150 ms locally; 5 s is the production default (Dockerfile).
// The file write itself runs in the background; a shutdown or restart saves at once.
const SAVE_MS = Math.max(50, Number(process.env.DB_SAVE_MS) || 150);
// Health of saving, shown on /healthz and the admin health page.
export const saveState = { ok: true, error: null, bytes: 0, at: null };
let timer = null; let writing = false; let again = false; let lastSave = 0; let syncSaves = 0;
// One writer only. During a rolling deploy the old and new app run side by side on the same data folder for a
// moment; the old one must not save its (older) copy over the file the new one just loaded. Each start claims the
// folder with a fresh token, and an app that no longer holds the token stops writing the database.
// The new copy only gets here after the old one has let go (server/handover.js), so it reads a complete db.json.
const OWNER_FILE = path.join(path.dirname(DB_FILE), '.db-owner');
const ALIVE_FILE = path.join(path.dirname(DB_FILE), '.db-alive'); // heartbeat: tells a starting copy that this one is still running
const OWNER = crypto.randomBytes(12).toString('hex');
fs.writeFileSync(OWNER_FILE + '.tmp', OWNER); fs.renameSync(OWNER_FILE + '.tmp', OWNER_FILE);
let lostOwner = false;
export function ownsDb() {
  if (lostOwner) return false;
  let cur = null; try { cur = fs.readFileSync(OWNER_FILE, 'utf8').trim(); } catch { return true; }
  if (cur && cur !== OWNER) { lostOwner = true; console.warn('[db] a newer copy of the app took over this data folder; this copy stops saving.'); return false; }
  return true;
}
// Written whole (temp file, then rename), so a starting copy never reads a half-written file.
const writeWhole = (f, text) => { fs.writeFileSync(f + '.tmp', text); fs.renameSync(f + '.tmp', f); };
// The heartbeat also says where this copy can be reached, so a new copy that is waiting can pass requests on to it
// (server/handover.js) instead of holding them; "stopping" once shutdown has begun and new connections are refused.
const myIp = () => Object.values(os.networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address || '127.0.0.1';
const ADDR = `${myIp()}:${Number(process.env.PORT || 3000)}`;
let stopping = false;
const beat = () => { try { if (!lostOwner) writeWhole(ALIVE_FILE, `${OWNER} ${Date.now()} ${stopping ? 'stopping' : ADDR}`); } catch { /* next beat */ } };
beat(); setInterval(beat, 2000).unref?.();
/** Shutdown has begun: a waiting new copy holds requests from now on rather than passing them here. */
export function markStopping() { stopping = true; beat(); }
/** Last save on shutdown, then let a waiting new copy take the data folder. */
export function releaseDb() {
  if (!ownsDb()) return;
  saveNow();
  lostOwner = true; // nothing after this may write the file
  try { writeWhole(OWNER_FILE, 'released'); fs.rmSync(ALIVE_FILE, { force: true }); } catch (e) { console.error('[db] release failed:', e.message); }
}
function writeSync() {
  if (!ownsDb()) return;
  syncSaves++; // a background write that started earlier must not replace this newer file
  const tmp = DB_FILE + '.tmp-now';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
async function flush() {
  timer = null;
  if (writing) { again = true; return; }
  if (!ownsDb()) return;
  writing = true; lastSave = Date.now(); const mark = syncSaves;
  try {
    const tmp = DB_FILE + '.tmp';
    const text = JSON.stringify(db); // fails past about 512 MB: the most this file database can hold
    await fs.promises.writeFile(tmp, text);
    Object.assign(saveState, { ok: true, error: null, bytes: text.length, at: new Date().toISOString() });
    if (mark === syncSaves) await fs.promises.rename(tmp, DB_FILE);
  } catch (e) { console.error('[db] save failed:', e.message); Object.assign(saveState, { ok: false, error: e.message }); setTimeout(save, 30000).unref?.(); }
  finally { writing = false; }
  if (again) { again = false; save(); }
  if (saveState.bytes > 350 * 1048576 && !saveState.warned) { saveState.warned = true; console.warn('[db] the database file is over 350 MB; it cannot grow past about 512 MB. Plan the move to Postgres.'); }
}
export function save() {
  if (!timer) timer = setTimeout(flush, Math.max(0, SAVE_MS - (Date.now() - lastSave)));
}
export function saveNow() {
  if (timer) { clearTimeout(timer); timer = null; }
  writeSync();
}
process.on('exit', () => { if (timer || writing) writeSync(); });
// An older copy of the app (one without the owner check) may still save once while it shuts down during a deploy.
// Writing this copy's database again a little later puts the right file back.
for (const ms of [75e3, 150e3]) setTimeout(() => { try { writeSync(); } catch (e) { console.error('[db] save failed:', e.message); } }, ms).unref?.();

export const id = (p = '') => p + crypto.randomBytes(9).toString('base64url');
export const now = () => new Date().toISOString();
export default db;
