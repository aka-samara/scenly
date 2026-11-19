// One-off: copy this computer's Scenly data (database + every file) to the bucket, then stop.
// Used to move a local install to the production server: run `npm run push` here, then `npm run restore` there.
// Stop the app first, so the database does not change while it is copied.
import 'dotenv/config';
import { sweepBucket, bucketStatus, bucketOn } from './storage.js';
import { backupNow, backupStatus } from './backup.js';

if (!bucketOn()) { console.error('No bucket is set. Add the four R2_... lines to .env first.'); process.exit(1); }
const n = sweepBucket(); console.log(`Copying ${n} file(s) to the bucket…`);
let last = -1;
for (;;) {
  const s = bucketStatus(); if (!s.waiting) break;
  if (s.waiting !== last && s.waiting % 50 === 0) console.log(`…${s.waiting} left`); last = s.waiting;
  await new Promise((r) => setTimeout(r, 500));
}
const st = bucketStatus();
if (!(await backupNow())) { console.error('The database copy failed:', backupStatus().lastError); process.exit(1); }
console.log(`Done: ${st.uploaded} file(s) copied, ${st.failed} failed. Database copied as backups/db/latest.json.gz.`);
if (st.failed) console.log('Some files failed (last error: ' + st.lastError + '). Run npm run push again to retry them.');
process.exit(st.failed ? 2 : 0);
