// Request signing for the R2 / S3 bucket. Expected signatures were produced by botocore (the AWS SDK for Python)
// for the same inputs, so these prove the hand-written signer matches AWS Signature Version 4.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { presignUrl, signRequest, bucketConfig } from '../server/objectstore.js';

const cfg = { endpoint: 'https://acc.r2.cloudflarestorage.com', accessKey: 'AKID123', secretKey: 'secret/KEY+abc', bucket: 'my-bucket', region: 'auto', prefix: '' };
const date = new Date('2026-11-18T05:00:00Z');

test('presigned download link matches botocore', () => {
  const u = presignUrl(cfg, 'users/u_1/a b+.mp4', { expires: 7200, date, filename: 'a b.mp4' });
  assert.match(u, /X-Amz-Signature=4c5680255a582b875d2ff25bc3210e9a97068e1ce4193d09f30a43e87ef61ef3$/);
  assert.ok(u.startsWith('https://acc.r2.cloudflarestorage.com/my-bucket/users/u_1/a%20b%2B.mp4?'));
});
test('signed upload matches botocore', () => {
  const h = signRequest(cfg, { method: 'PUT', pathname: '/my-bucket/users/x.png', headers: { 'content-type': 'image/png', 'content-length': 5 }, date, payloadHash: crypto.createHash('sha256').update('hello').digest('hex') }).headers;
  assert.match(h.authorization, /Signature=256f209789507c5498a8a3b4c21155882f9c7cdec2545995fb17c5f5e7380408$/);
});
test('R2 settings build the right address; nothing set means no bucket', () => {
  assert.equal(bucketConfig({}), null);
  const c = bucketConfig({ R2_ACCOUNT_ID: 'abc', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'b' });
  assert.equal(c.endpoint, 'https://abc.r2.cloudflarestorage.com'); assert.equal(c.region, 'auto');
});
