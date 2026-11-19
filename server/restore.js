// Restore Scenly onto this machine from the bucket (R2): the database and every stored file.
// Run on the server (app running or stopped), then restart the app:
//                             npm run restore             (latest database backup + all files)
//                             npm run restore -- 2026-11-20   (the daily backup of that date)
//                             npm run restore -- --files-only (only bring back missing files)
// At the restart the old data/db.json is kept as db.json.before-restore-<time>.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { bucketConfig, getObject, getObjectToFile, listObjects } from './objectstore.js';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
const cfg = bucketConfig();
if (!cfg) { console.error('No bucket is set. Add the R2_... settings to .env first.'); process.exit(1); }
const args = process.argv.slice(2);
const filesOnly = args.includes('--files-only');
const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!filesOnly) {
  const key = date ? `backups/db/daily/${date}.json.gz` : 'backups/db/latest.json.gz';
  const gz = await getObject(cfg, key);
  if (!gz) { console.error(`No backup found at ${key}.`); process.exit(1); }
  const json = zlib.gunzipSync(gz); JSON.parse(json); // refuse a damaged backup
  // Written beside the live database; the app switches to it at its next start (and keeps the old one).
  fs.writeFileSync(path.join(DATA_DIR, 'db.json.restore'), json);
  console.log(`Database from ${key} (${(json.length / 1048576).toFixed(1)} MB) is ready. Restart the app to use it.`);
}
let got = 0, had = 0, failed = 0;
for await (const o of listObjects(cfg, '')) {
  if (o.key.startsWith('backups/')) continue;
  const p = path.resolve(DATA_DIR, o.key);
  if (!p.startsWith(DATA_DIR + path.sep)) continue;
  try { if (fs.statSync(p).size === o.size) { had++; continue; } } catch { /* missing */ }
  try { await getObjectToFile(cfg, o.key, p); got++; if (got % 100 === 0) console.log(`…${got} files brought back`); }
  catch (e) { failed++; console.warn('Could not bring back', o.key, e.message); }
}
console.log(`Files: ${got} brought back, ${had} already here, ${failed} failed.`);
process.exit(failed ? 2 : 0);
