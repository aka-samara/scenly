// Database backups. The whole database is one JSON snapshot, gzipped.
// With a bucket (R2) set: an hourly copy (24 rolling slots), one per day kept BACKUP_KEEP_DAYS days, and latest.json.gz.
// Without a bucket: one per day on this disk under DATA_DIR/backups, the last 7 kept.
// Restore with `npm run restore` (see server/restore.js).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import db, { DATA_DIR } from './db.js';
import { bucketConfig, putObject, listObjects, deleteObject } from './objectstore.js';

const LOCAL = path.join(DATA_DIR, 'backups');
const state = { last: null, lastError: null, count: 0 };
export const backupStatus = () => ({ ...state });

export function snapshot() { return zlib.gzipSync(Buffer.from(JSON.stringify(db)), { level: 6 }); }

export async function backupNow({ when = new Date() } = {}) {
  const buf = snapshot(); const day = when.toISOString().slice(0, 10); const hour = when.toISOString().slice(11, 13);
  const cfg = bucketConfig();
  try {
    if (cfg) {
      await putObject(cfg, `backups/db/hourly/${hour}.json.gz`, buf, { contentType: 'application/gzip' });
      await putObject(cfg, `backups/db/daily/${day}.json.gz`, buf, { contentType: 'application/gzip' });
      await putObject(cfg, 'backups/db/latest.json.gz', buf, { contentType: 'application/gzip' });
      const keep = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS) || 30);
      const cut = new Date(when.getTime() - keep * 864e5).toISOString().slice(0, 10);
      for await (const o of listObjects(cfg, 'backups/db/daily/')) { const d = /(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(o.key)?.[1]; if (d && d < cut) await deleteObject(cfg, o.key); }
    } else {
      fs.mkdirSync(LOCAL, { recursive: true });
      const tmp = path.join(LOCAL, `db-${day}.json.gz.tmp`); fs.writeFileSync(tmp, buf); fs.renameSync(tmp, path.join(LOCAL, `db-${day}.json.gz`));
      const old = fs.readdirSync(LOCAL).filter((f) => /^db-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort().slice(0, -7);
      for (const f of old) fs.rmSync(path.join(LOCAL, f), { force: true });
    }
    state.last = when.toISOString(); state.lastError = null; state.count++; state.bytes = buf.length; state.where = cfg ? 'bucket' : 'disk';
    return true;
  } catch (e) {
    state.lastError = e.message; console.warn('[backup] failed:', e.message);
    return false;
  }
}

export function startBackups() {
  if (process.env.BACKUPS === '0') return;
  const hours = Math.max(0.25, Number(process.env.BACKUP_EVERY_HOURS) || (bucketConfig() ? 1 : 24));
  setTimeout(() => backupNow(), 60000).unref?.();
  setInterval(() => backupNow(), hours * 3600000).unref?.();
}
