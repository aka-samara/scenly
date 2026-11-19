// Projects (shared instructions, knowledge files, and the chats and creations assigned to them)
// and Characters (a person, product or logo saved once and reused in any image or video tool).
import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';
import { locate } from './storage.js';
import { getFiles, dataUrl, fileMeta } from './files.js';

const cut = (s, n) => { const t = String(s || '').replace(/\s+\n/g, '\n').trim(); return t.length > n ? t.slice(0, n) + ' …' : t; };

// ---------- projects ----------
export const userProject = (user, pid) => db.projects.find((p) => p.id === pid && p.userId === user.id);
// Image and video sessions are left out: their pictures and clips are listed as creations instead.
export const projectConvs = (p) => db.conversations.filter((c) => c.projectId === p.id && c.userId === p.userId && c.kind !== 'image' && c.kind !== 'video');
export const projectGens = (p) => db.generations.filter((g) => g.projectId === p.id && g.userId === p.userId && !g.hidden);

export function projectSummary(p) {
  const gens = projectGens(p);
  const cover = gens.flatMap((g) => g.media || []).filter((m) => m.type === 'image').slice(-3).map((m) => m.url);
  return { id: p.id, name: p.name, description: p.description || '', createdAt: p.createdAt, updatedAt: p.updatedAt, counts: { chats: projectConvs(p).length, creations: gens.length, files: (p.fileIds || []).length }, cover };
}
export function projectDetail(user, p, convSummary) {
  return {
    ...projectSummary(p),
    instructions: p.instructions || '',
    files: getFiles(user, p.fileIds || []).map(fileMeta),
    conversations: projectConvs(p).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(convSummary),
    generations: projectGens(p).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((g) => ({ ...g, userId: undefined })),
  };
}

// Everything a model needs to answer as part of the project. Budgeted so it stays affordable.
export function projectContext(user, p, currentConvId) {
  const parts = [`You are working inside the user's project "${p.name}". Treat everything below as shared background for this project: its instructions, its knowledge files, its other chats and the images and videos created in it. Use it without being asked, stay consistent with it, and say which file or chat a fact came from when that helps.`];
  if (p.description) parts.push(`<project_description>\n${cut(p.description, 2000)}\n</project_description>`);
  if (p.instructions) parts.push(`<project_instructions>\nFollow these in every reply:\n${cut(p.instructions, 8000)}\n</project_instructions>`);

  const files = getFiles(user, p.fileIds || []);
  const docs = files.filter((f) => f.kind === 'document' && f.text);
  if (docs.length) {
    const per = Math.max(3000, Math.floor(60000 / docs.length));
    parts.push('<project_files>\n' + docs.map((d) => `<document name="${d.name}"${d.text.length > per ? ' truncated="true"' : ''}>\n${cut(d.text, per)}\n</document>`).join('\n') + '\n</project_files>');
  }
  const media = files.filter((f) => f.kind !== 'document');
  if (media.length) parts.push('<project_assets>\n' + media.map((f) => `- ${f.kind}: ${f.name}`).join('\n') + '\n</project_assets>');

  const others = projectConvs(p).filter((c) => c.id !== currentConvId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
  if (others.length) {
    const per = Math.max(2, Math.floor(36 / others.length));
    parts.push('<other_chats_in_project>\n' + others.map((c) => {
      const msgs = c.messages.filter((m) => m.content && m.status !== 'error').slice(-per).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${cut(String(m.content).replace(/<file\s+path="([^"]+)"\s*>[\s\S]*?<\/file>/g, '[wrote $1]'), 700)}`).join('\n');
      const fileList = c.kind === 'code' && c.files ? `\nProject code files: ${Object.keys(c.files).slice(0, 40).join(', ')}` : '';
      return `<chat title="${c.title.replace(/"/g, "'")}" type="${c.kind || 'chat'}">\n${msgs}${fileList}\n</chat>`;
    }).join('\n') + '\n</other_chats_in_project>');
  }
  const gens = projectGens(p).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40);
  if (gens.length) parts.push('<creations_in_project>\n' + gens.map((g) => `- ${g.mode} (${g.model}, ${g.createdAt.slice(0, 10)}${g.status !== 'done' ? ', ' + g.status : ''}): ${cut(g.displayPrompt && g.displayPrompt !== g.prompt ? `${g.displayPrompt} | full prompt: ${g.prompt}` : g.prompt, 500)}`).join('\n') + '\n</creations_in_project>');
  return parts.join('\n\n');
}

// Up to four project pictures (knowledge images first, then the newest creations) for models that can see.
export function projectImages(user, p, max = 4) {
  const out = [];
  for (const f of getFiles(user, p.fileIds || [])) {
    if (out.length >= max) break;
    if (f.kind === 'image' && f.size < 4e6) { try { out.push({ name: f.name, url: dataUrl(f) }); } catch {} }
  }
  const made = projectGens(p).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).flatMap((g) => (g.media || []).filter((m) => m.type === 'image').map((m) => ({ m, g })));
  for (const { m, g } of made) {
    if (out.length >= max) break;
    const rec = db.files.find((f) => f.id === m.id && f.file);
    if (!rec || rec.size > 4e6) continue;
    try { out.push({ name: `created image: ${cut(g.displayPrompt || g.prompt, 80)}`, url: `data:${rec.mime};base64,${fs.readFileSync(locate(rec)).toString('base64')}` }); } catch {}
  }
  return out;
}

// ---------- characters ----------
export const KINDS = ['person', 'product', 'brand'];
export const userCharacter = (user, cid) => db.characters.find((c) => c.id === cid && c.userId === user.id);
export function characterView(user, c) {
  return { id: c.id, name: c.name, kind: c.kind, notes: c.notes || '', photos: getFiles(user, c.fileIds).map(fileMeta), sheetId: c.sheetId || null, createdAt: c.createdAt };
}

/**
 * Works a saved character into a request: which reference files to send and what to add to the prompt.
 * Image models here take at most two references, so a character with several photos travels as one
 * "sheet" image (built in the browser), which leaves the second slot for an outfit, product or scene.
 */
export function applyCharacter(user, ch, { mode, model, fileIds = [], prompt }) {
  const photos = getFiles(user, ch.fileIds).filter((f) => f.kind === 'image');
  if (!photos.length) return { fileIds, prompt };
  const what = ch.kind === 'person' ? 'person' : ch.kind === 'brand' ? 'logo' : 'product';
  const keep = ch.kind === 'person'
    ? 'Keep this exact person in the result: the same face and facial features, skin tone, hair and body type. Do not change who they are.'
    : ch.kind === 'brand'
      ? 'Reproduce this logo exactly: the same shapes, colours, lettering and proportions. Do not redraw or restyle it.'
      : 'Keep this product identical: the same shape, colours, materials, label text and logo.';
  const notes = ch.notes ? ` Notes about ${ch.name}: ${cut(ch.notes, 400)}.` : '';
  if (mode === 'video') {
    const mine = getFiles(user, fileIds).filter((f) => f.kind === 'image');
    const ids = mine.length || !model.video.imageToVideo ? fileIds : [photos[0].id, ...fileIds];
    const lead = mine.length ? '' : `The ${what} in the first frame is ${ch.name}. `;
    return { fileIds: ids, prompt: `${lead}${ch.kind === 'person' ? 'The person must stay the same person for the whole clip: same face, hair and outfit unless told otherwise.' : keep}${notes}\n\n${prompt}` };
  }
  const room = model.image.edit?.max_images || 0;
  if (!room) return { error: `${model.name} cannot use reference photos, so it cannot keep ${ch.name} consistent. Pick Nano Banana 2, Seedream or GPT Image.` };
  const sheet = photos.length > 1 && ch.sheetId && getFiles(user, [ch.sheetId])[0];
  const extra = fileIds.filter((x) => !ch.fileIds.includes(x) && x !== ch.sheetId);
  let refs, lead;
  if (sheet) { refs = [sheet.id]; lead = `Reference image 1 is a reference sheet with ${photos.length} photos of the same ${what}, ${ch.name}. ${keep} Make one single new picture, never a grid, collage or copy of the sheet.`; }
  else if (!extra.length && photos.length > 1 && room > 1) { refs = photos.slice(0, room).map((f) => f.id); lead = `The reference images all show the same ${what}, ${ch.name}. ${keep}`; }
  else { refs = [photos[0].id]; lead = `Reference image 1 shows the ${what}, ${ch.name}. ${keep}`; }
  return { fileIds: [...refs, ...extra].slice(0, room), prompt: `${lead}${notes}\n\n${prompt}` };
}
