// Documents made in Docs Studio. The small record lives in db.json; every version's full
// content is its own JSON file under data/docs/<document id>/, so history stays cheap.
import fs from 'node:fs';
import path from 'node:path';
import db, { save, id, now, DATA_DIR } from '../db.js';

export const DOCS_DIR = path.join(DATA_DIR, 'docs');
fs.mkdirSync(DOCS_DIR, { recursive: true });
db.documents ||= [];
db.brands ||= [];

export const docDir = (d) => path.join(DOCS_DIR, d.id);
const versionFile = (d, n) => path.join(docDir(d), `v${n}.json`);

export const userDoc = (user, did) => db.documents.find((d) => d.id === did && d.userId === user.id);
export const convDocs = (user, cid) => db.documents.filter((d) => d.userId === user.id && d.conversationId === cid);

// A document lives in a chat. Editing it by hand, undoing or restoring a version is work on that chat,
// so the chat moves to the top of Recents like it does after a new message.
function touchConv(d) { const c = d.conversationId && db.conversations.find((x) => x.id === d.conversationId && x.userId === d.userId); if (c) c.updatedAt = d.updatedAt; }

export function createDoc(user, { kind, title, conversationId, projectId, brandId }) {
  const d = { id: id('d_'), userId: user.id, kind, title: String(title || 'Untitled').slice(0, 120), conversationId, projectId, brandId, versions: [], current: 0, createdAt: now(), updatedAt: now() };
  fs.mkdirSync(docDir(d), { recursive: true });
  db.documents.push(d);
  save();
  return d;
}

// Adds a version on top of the current one and makes it current.
export function addVersion(d, spec, { note = '', by = 'ai', model, summary } = {}) {
  const n = (d.versions.at(-1)?.n || 0) + 1;
  fs.mkdirSync(docDir(d), { recursive: true });
  fs.writeFileSync(versionFile(d, n), JSON.stringify(spec));
  d.versions.push({ n, note: String(note).slice(0, 300), by, model, summary, base: d.current || undefined, createdAt: now() });
  d.current = n;
  if (spec.title) d.title = String(spec.title).slice(0, 120);
  d.updatedAt = now(); touchConv(d);
  save();
  return n;
}

export function readVersion(d, n = d.current) {
  if (!d.versions.some((v) => v.n === Number(n))) return null;
  try { return JSON.parse(fs.readFileSync(versionFile(d, Number(n)), 'utf8')); } catch { return null; }
}

export function setCurrent(d, n) {
  if (!d.versions.some((v) => v.n === Number(n))) return false;
  d.current = Number(n); d.updatedAt = now(); touchConv(d); save();
  return true;
}

export function deleteDoc(d) {
  db.documents = db.documents.filter((x) => x !== d);
  fs.rmSync(docDir(d), { recursive: true, force: true });
  save();
}

export const docMeta = (d) => ({ id: d.id, kind: d.kind, title: d.title, conversationId: d.conversationId, projectId: d.projectId || null, brandId: d.brandId || null, current: d.current, versions: d.versions, createdAt: d.createdAt, updatedAt: d.updatedAt });
