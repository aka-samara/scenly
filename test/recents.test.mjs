// Recents: work on a document counts as work on its chat, so the chat moves to the top. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-recents-'));
const { default: db } = await import('../server/db.js');
const { createDoc, addVersion, setCurrent } = await import('../server/docs/store.js');

test('editing a document by hand, or restoring a version, moves its chat up in Recents', () => {
  const user = { id: 'u_r1' }; db.users.push(user);
  const old = '2026-01-01T00:00:00.000Z';
  const chat = { id: 'c_r1', userId: user.id, title: 'Report', messages: [], createdAt: old, updatedAt: old };
  const other = { id: 'c_r2', userId: 'u_other', title: 'Not mine', messages: [], createdAt: old, updatedAt: old };
  db.conversations.push(chat, other);
  const d = createDoc(user, { kind: 'word', title: 'Report', conversationId: chat.id });
  addVersion(d, { title: 'Report', blocks: [] }, { by: 'ai' });
  chat.updatedAt = old;
  addVersion(d, { title: 'Report', blocks: [] }, { by: 'user', note: 'Edited by hand' });
  assert.equal(chat.updatedAt, d.updatedAt); assert.ok(chat.updatedAt > old);
  chat.updatedAt = old;
  assert.equal(setCurrent(d, 1), true);
  assert.ok(chat.updatedAt > old);
  // a document never moves a chat that belongs to someone else
  const stray = createDoc(user, { kind: 'word', title: 'Stray', conversationId: other.id });
  addVersion(stray, { title: 'Stray', blocks: [] }, { by: 'user' });
  assert.equal(other.updatedAt, old);
});
