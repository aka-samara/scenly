// Brand kits: colours, fonts, logo and company details that every document type can follow.
// Format cloning saves what it extracts from a sample file as a brand kit too (the "template" field).
import fs from 'node:fs';
import db, { save, id, now } from '../db.js';
import { getFiles, filePath } from '../files.js';
import { UserError } from '../generate.js';
import './store.js';

export const DEFAULT_THEME = {
  colors: { primary: '#1F3A5F', accent: '#2E75B6', text: '#1A1A22', muted: '#5F6672', background: '#FFFFFF' },
  fonts: { heading: 'Calibri', body: 'Calibri' },
};
// Fonts that exist on nearly every computer, so files look the same when opened elsewhere.
export const SAFE_FONTS = ['Calibri', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Garamond', 'Cambria', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New', 'Segoe UI', 'Aptos', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Playfair Display', 'Merriweather', 'Source Sans Pro'];

export const hex = (v, fallback) => {
  const m = String(v || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return '#' + h.toUpperCase();
};
const NAMED = { navy: '#1F3A5F', blue: '#2E75B6', red: '#C0392B', green: '#2E8B57', teal: '#0F8B8D', purple: '#6C4AB6', orange: '#E67E22', black: '#111111', grey: '#5F6672', gray: '#5F6672', gold: '#B8860B', maroon: '#7B1E2B', pink: '#D6468B', white: '#FFFFFF', yellow: '#F2C200', brown: '#7A5230' };
export const colour = (v, fallback) => hex(v, null) || NAMED[String(v || '').trim().toLowerCase()] || fallback;
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

export const userBrand = (user, bid) => db.brands.find((b) => b.id === bid && b.userId === user.id);
export const userBrands = (user) => db.brands.filter((b) => b.userId === user.id).sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));

function clean(user, body, existing = {}) {
  const b = { ...existing };
  if (body.name != null || !existing.id) { b.name = clip(body.name, 60); if (!b.name) throw new UserError('Give the brand kit a name.'); }
  if (body.colors) {
    b.colors = { ...(existing.colors || DEFAULT_THEME.colors) };
    for (const k of Object.keys(DEFAULT_THEME.colors)) if (body.colors[k] != null) b.colors[k] = colour(body.colors[k], b.colors[k]);
  }
  b.colors ||= { ...DEFAULT_THEME.colors };
  if (body.fonts) b.fonts = { heading: clip(body.fonts.heading, 40) || DEFAULT_THEME.fonts.heading, body: clip(body.fonts.body, 40) || DEFAULT_THEME.fonts.body };
  b.fonts ||= { ...DEFAULT_THEME.fonts };
  for (const k of ['company', 'tagline', 'address', 'website', 'email', 'phone', 'footer']) if (body[k] != null) b[k] = clip(body[k], k === 'address' || k === 'footer' ? 300 : 120);
  if ('logoFileId' in body) {
    const f = body.logoFileId && getFiles(user, [body.logoFileId]).find((x) => x.kind === 'image');
    b.logoFileId = f ? f.id : undefined;
  }
  return b;
}

export function createBrand(user, body, extra = {}) {
  if (userBrands(user).length >= 50) throw new UserError('You can save up to 50 brand kits. Delete one first.');
  const b = { id: id('b_'), userId: user.id, ...clean(user, body), createdAt: now(), updatedAt: now() };
  // A kit cloned from a file carries what was read from it; it never becomes the default by itself.
  if (extra.template) { b.template = extra.template; b.source = extra.source || 'file'; }
  if (body.isDefault || (!userBrands(user).length && !extra.keepDefault)) setDefault(user, b);
  db.brands.push(b); save();
  return b;
}
export function updateBrand(user, b, body) {
  Object.assign(b, clean(user, body, b), { updatedAt: now() });
  if (body.isDefault === true) setDefault(user, b);
  if (body.isDefault === false) b.isDefault = false;
  save();
  return b;
}
function setDefault(user, b) { for (const x of db.brands) if (x.userId === user.id) x.isDefault = false; b.isDefault = true; }
export function deleteBrand(user, b) {
  db.brands = db.brands.filter((x) => x !== b);
  for (const d of db.documents) if (d.brandId === b.id) delete d.brandId;
  save();
}
export const brandView = (b) => ({ id: b.id, name: b.name, colors: b.colors, fonts: b.fonts, company: b.company || '', tagline: b.tagline || '', address: b.address || '', website: b.website || '', email: b.email || '', phone: b.phone || '', footer: b.footer || '', logoFileId: b.logoFileId || null, isDefault: !!b.isDefault, source: b.source || 'manual', hasTemplate: !!b.template, sourceFile: b.template?.file || null, templateKinds: b.template ? ['word', 'sheet', 'slides', 'pdf'].filter((k) => b.template[k]) : [], createdAt: b.createdAt });

// The look a document should follow: its own brand kit, else the user's default kit, else Scenly's defaults.
export function resolveTheme(user, doc) {
  const b = (doc?.brandId && userBrand(user, doc.brandId)) || (doc?.brandId === null ? null : db.brands.find((x) => x.userId === user.id && x.isDefault)) || null;
  const theme = { brandId: b?.id || null, name: b?.name || null, colors: { ...DEFAULT_THEME.colors, ...(b?.colors || {}) }, fonts: { ...DEFAULT_THEME.fonts, ...(b?.fonts || {}) }, company: b?.company || '', tagline: b?.tagline || '', address: b?.address || '', website: b?.website || '', email: b?.email || '', phone: b?.phone || '', footer: b?.footer || '', logo: null, template: b?.template || null };
  const logo = b?.logoFileId && db.files.find((f) => f.id === b.logoFileId && f.userId === user.id && f.kind === 'image');
  // Pictures the user uploaded, for documents that place them: theme.file(id) → { mime, data() }.
  theme.file = (fid) => { const f = db.files.find((x) => x.id === fid && x.userId === user.id && x.kind === 'image'); return f ? { mime: f.mime === 'image/jpg' ? 'image/jpeg' : f.mime, name: f.name, data: () => fs.readFileSync(filePath(f)) } : null; };
  if (logo) { try { theme.logo = { mime: logo.mime === 'image/jpg' ? 'image/jpeg' : logo.mime, data: fs.readFileSync(filePath(logo)), name: logo.name }; } catch {} }
  return theme;
}
// What the model is told about the brand, so wording and structure can follow it.
export function brandNote(theme) {
  if (!theme?.brandId) return '';
  const bits = [`Brand kit "${theme.name}" is applied automatically (colours ${theme.colors.primary} and ${theme.colors.accent}, fonts ${theme.fonts.heading} / ${theme.fonts.body}${theme.logo ? ', logo' : ''}).`];
  if (theme.company) bits.push(`Company: ${theme.company}${theme.tagline ? ' (' + theme.tagline + ')' : ''}.`);
  const contact = [theme.address, theme.phone, theme.email, theme.website].filter(Boolean).join(' | ');
  if (contact) bits.push(`Contact details: ${contact}.`);
  if (theme.template?.file) bits.push(`This kit was cloned from "${theme.template.file}": its page setup, header, footer and slide look are applied automatically, so leave page size, margins, header and footer out of the settings unless the user asks for different ones.`);
  bits.push('Do not set colours or fonts yourself unless the user asks for different ones.');
  return bits.join(' ');
}
