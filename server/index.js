import 'dotenv/config';
import { serve } from './handover.js'; // must stay before every import that reads the database
import express from 'express';
import { mountVoice } from './voice.js';
import { mountMemory, memoryPrompt, learnFromMessage } from './memory.js';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import db, { save, id, now, MEDIA_DIR, DATA_DIR } from './db.js';
import { runImage, startVideo, pollTask, enhancePrompt, mediaRef, signFile, sizeLike, UserError } from './generate.js';
import { APPS, findApp, publicApp, fillPrompt } from './apps.js';
import { register, login, logout, resend, verify, verifyCode, forgot, reset, changePassword, googleStart, googleCallback, googleReady, isPaid, parseCookies, paidPlanOnly, PAID_TOOL_PATHS, requireUser, requireAdmin, publicUser } from './auth.js';
import { mailReady } from './mail.js';
import { STYLES, STYLE_CATEGORIES, publicStyles, findStyle, styleLocked, applyStyle } from './styles.js';
import { mountEdit, mediaFileId } from './edit.js';
import { flags } from './flags.js';
import { locate, limits, MB, bucketUrl, startBucket, mirror } from './storage.js';
import { startBackups } from './backup.js';
import { securityHeaders, sameOrigin, limit, mountHealth, checkSettings, gracefulShutdown, isProd } from './prod.js';
import { ffmpegInfo } from './ffmpeg.js';
import { startJobs } from './jobs.js';
import { mountDownloads, deriveLater } from './downloads.js';
import { mountBuilder } from './builder/routes.js';
import { mountAssist } from './builder/assist.js';
import { mountPrecision } from './builder/precision.js';
import { mountKeyframes } from './builder/keyframes.js';
import { mountPro } from './pro.js';
import { mountAdmin } from './admin.js';
import { trackRequest, recordFailure } from './monitor.js';
import { getCatalog, findModel, estimateChatUsd, paidUsd } from './catalog.js';
import { PLANS, PACKS, CREDIT_USD, MARKUP, markupOf, usdToCredits, charge, round2, findOffer, migrateAll, sweepCredits, needCredits, balanceOf } from './credits.js';
import { ingest, getFiles, dataUrl, filePath, fileMeta } from './files.js';
import { call, sse, GatewayError } from './gateway.js';
import { startCheckout, finishCheckout, paymentMode } from './payments.js';
import { subsOn, subscribe, switchPlan, setCancel, portalUrl, syncUser, billingView, verifySignature, handleEvent, startBillingSweep, planById, paymentHistory, receiptHtml, previewSwitch } from './billing.js';
import { userProject, projectSummary, projectDetail, projectContext, projectImages, projectConvs, projectGens, KINDS, userCharacter, characterView, applyCharacter } from './projects.js';
import { markdownToDocx, filesToZip, docTitle, safeName, cleanPath, applyFileOps, stripFileBodies } from './export.js';
import { mountDocs, docRequest, kindList } from './docs/routes.js';
import { runDocTurn, DocError } from './docs/pipeline.js';
import { KINDS as DOC_KINDS } from './docs/kinds/index.js';
import { userDoc, setCurrent, deleteDoc, docMeta } from './docs/store.js';
import { SAFE_FONTS } from './docs/brand.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: Math.max(limits().videoMb, limits().fileMb, limits().audioMb, limits().imageMb) * MB, files: 10 } });

app.disable('x-powered-by');
// Behind Coolify's proxy (and Cloudflare) the visitor's address and https come from forwarded headers.
app.set('trust proxy', process.env.TRUST_PROXY ?? (isProd() ? 'loopback, linklocal, uniquelocal' : false));
app.use(securityHeaders);
app.use(sameOrigin);
// Stripe webhook: needs the raw body to check Stripe's signature, so it sits before the JSON reader.
app.post('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!subsOn()) return res.status(404).end();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(400).json({ error: 'STRIPE_WEBHOOK_SECRET is not set.' });
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!verifySignature(raw, req.headers['stripe-signature'], secret)) return res.status(400).json({ error: 'Bad signature.' });
  let evt; try { evt = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Bad JSON.' }); }
  try { res.json({ received: true, result: await handleEvent(evt, { finishPack: finishCheckout }) }); }
  catch (e) { console.error('Stripe webhook:', e.message); res.status(500).json({ error: 'Could not process the event. Stripe will send it again.' }); }
});
app.use(express.json({ limit: '2mb' }));
app.use(parseCookies);
app.use(PAID_TOOL_PATHS, paidPlanOnly); // Video Agent, Video Builder and Studio Pro: Pro plan and above
app.use(trackRequest); // lets charges and gateway calls know which page they came from (admin usage and error log)

// ---------- static ----------
const nm = path.join(here, '..', 'node_modules');
app.use('/vendor/marked.js', express.static(path.join(nm, 'marked/marked.min.js')));
app.use('/vendor/purify.js', express.static(path.join(nm, 'dompurify/dist/purify.min.js')));
app.use('/vendor/hljs.js', express.static(path.join(nm, '@highlightjs/cdn-assets/highlight.min.js')));
app.use('/vendor/hljs-light.css', express.static(path.join(nm, '@highlightjs/cdn-assets/styles/github.min.css')));
app.use('/vendor/hljs-dark.css', express.static(path.join(nm, '@highlightjs/cdn-assets/styles/github-dark.min.css')));
app.use('/vendor/builder-plan.js', express.static(path.join(here, 'builder', 'plan.js'))); // the same timeline maths in the browser and on the server
// App code must revalidate (cheap 304 via ETag): without this Cloudflare gives browsers a 4 hour cache and a deploy reaches people hours late.
const noCache = (res, file) => { if (/\.(html|js|css|mjs)$/i.test(file)) res.setHeader('Cache-Control', 'no-cache'); };
app.use(express.static(path.join(here, '..', 'public'), { setHeaders: noCache }));
// Plain links for app stores and sign-in providers (Google OAuth branding): /privacy and /terms open the legal pages.
for (const k of ['privacy', 'terms']) app.get('/' + k, (req, res) => res.redirect(302, '/#/' + k));

// ---------- helpers ----------
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  const known = e instanceof UserError || e instanceof GatewayError || e?.expose === true; // expose: errors written for the person to read
  if (!known) recordFailure({ kind: 'server', path: `${req.method} ${req.path}`, status: 500, reason: `${e?.name || 'Error'}: ${e?.message || e}`, userId: req.user?.id });
  if (!res.headersSent) res.status(e instanceof UserError || e?.expose === true ? e.status || 400 : e instanceof GatewayError ? (e.status >= 500 ? 502 : e.status) : 500).json({ error: known ? e.message : 'Something went wrong on our side. No credits were charged. Please try again.', code: known ? e.code : 'server_error' });
});
const userConv = (user, cid) => db.conversations.find((c) => c.id === cid && c.userId === user.id);
const isStudioKind = (k) => k === 'image' || k === 'video';
const shortTitle = (t, fallback) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 60 ? t.slice(0, 57) + '…' : t || fallback; };
// Image and video work lives in sessions, so it can be reopened from the history like a chat.
function studioSession(user, mode, sessionId, firstPrompt) {
  let c = sessionId && userConv(user, sessionId);
  if (c && c.kind !== mode) c = null;
  if (!c) {
    c = { id: id('c_'), userId: user.id, kind: mode, title: shortTitle(firstPrompt, mode === 'video' ? 'New video' : 'New image'), messages: [], createdAt: now(), updatedAt: now() };
    db.conversations.push(c);
  }
  return c;
}
// Creations made before sessions existed are gathered into one session per user and type.
{
  const old = db.generations.filter((g) => !g.sessionId && !g.appId && !g.hidden && isStudioKind(g.mode));
  const made = new Map();
  for (const g of old) {
    const key = g.userId + ':' + g.mode;
    if (!made.has(key)) {
      const c = { id: id('c_'), userId: g.userId, kind: g.mode, title: g.mode === 'video' ? 'Earlier videos' : 'Earlier images', messages: [], createdAt: g.createdAt, updatedAt: g.createdAt };
      db.conversations.push(c); made.set(key, c);
    }
    const c = made.get(key);
    g.sessionId = c.id;
    if (g.createdAt > c.updatedAt) c.updatedAt = g.createdAt;
    if (g.createdAt < c.createdAt) c.createdAt = g.createdAt;
  }
  if (old.length) save();
}
// Each AI App keeps one session per user, so its runs can be reopened from the history like a chat.
function appSession(user, appDef, create = true) {
  let c = db.conversations.find((x) => x.userId === user.id && x.kind === 'app' && x.appId === appDef.id);
  if (!c && create) {
    c = { id: id('c_'), userId: user.id, kind: 'app', appId: appDef.id, title: appDef.name, messages: [], createdAt: now(), updatedAt: now() };
    db.conversations.push(c);
  }
  return c;
}
{
  // Apps that were retired leave the history; what they made stays in Assets.
  const before = db.conversations.length;
  db.conversations = db.conversations.filter((c) => c.kind !== 'app' || findApp(c.appId));
  if (db.conversations.length !== before) save();
  const old = db.generations.filter((g) => g.appId && !g.sessionId && !g.hidden && findApp(g.appId));
  for (const g of old) {
    const c = appSession({ id: g.userId }, findApp(g.appId));
    if (!old.some((x) => x.sessionId === c.id)) { c.createdAt = g.createdAt; c.updatedAt = g.createdAt; }
    g.sessionId = c.id;
    if (g.createdAt > c.updatedAt) c.updatedAt = g.createdAt;
    if (g.createdAt < c.createdAt) c.createdAt = g.createdAt;
  }
  if (old.length) save();
}
const convSummary = (c) => ({ id: c.id, title: c.title, kind: c.kind || 'chat', appId: c.appId, projectId: c.projectId || null, fileCount: c.files ? Object.keys(c.files).length : undefined, updatedAt: c.updatedAt, createdAt: c.createdAt, lastModel: c.lastModel, starred: !!c.starred });

function getOrCreateConv(user, cid, firstText, kind) {
  let c = cid && userConv(user, cid);
  if (!c && kind === 'code') {
    const t = (firstText || 'New project').replace(/\s+/g, ' ').trim();
    c = { id: id('c_'), userId: user.id, kind: 'code', files: {}, title: t.length > 60 ? t.slice(0, 57) + '…' : t || 'New project', messages: [], createdAt: now(), updatedAt: now() };
    db.conversations.push(c);
  }
  if (!c) {
    const t = (firstText || 'New chat').replace(/\s+/g, ' ').trim();
    c = { id: id('c_'), userId: user.id, title: t.length > 60 ? t.slice(0, 57) + '…' : t || 'New chat', messages: [], createdAt: now(), updatedAt: now() };
    db.conversations.push(c);
  }
  return c;
}

// ---------- public config ----------
app.get('/api/config', (_req, res) => {
  res.json({ flags: flags(), ffmpeg: ffmpegInfo().ok, uploadLimits: { imageMb: limits().imageMb, videoMb: limits().videoMb, audioMb: limits().audioMb, fileMb: limits().fileMb }, googleLogin: googleReady(), emailConfirm: mailReady(), devAuth: process.env.NODE_ENV !== 'production', supportEmail: process.env.SUPPORT_EMAIL || '', plans: PLANS, packs: PACKS, creditUsd: CREDIT_USD(), markup: MARKUP(), paymentMode: paymentMode(), keyConfigured: !!process.env.AICREDIT_API_KEY, docKinds: kindList(), docFonts: SAFE_FONTS });
});
app.get('/api/models', wrap(async (_req, res) => res.json({ models: await getCatalog() })));

// ---------- auth ----------
app.post('/api/auth/register', limit('register', 30, 3600), wrap(register));
app.post('/api/auth/login', limit('login', 30, 900), login);
app.post('/api/auth/logout', logout);
app.post('/api/auth/resend', limit('resend', 6, 3600), wrap(resend));
app.get('/api/auth/verify', limit('verify', 30, 900), verify);
app.post('/api/auth/verify-code', limit('verify-code', 20, 900), verifyCode);
app.post('/api/auth/forgot', limit('forgot', 6, 3600), wrap(forgot));
app.post('/api/auth/reset', limit('reset', 20, 900), reset);
app.post('/api/auth/password', requireUser, limit('password', 10, 900), changePassword);
app.get('/api/auth/google', googleStart);
app.get('/api/auth/google/callback', googleCallback);
app.get('/api/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));
app.patch('/api/me', requireUser, (req, res) => {
  if (typeof req.body.name === 'string' && req.body.name.trim()) req.user.name = req.body.name.trim().slice(0, 60);
  save();
  res.json({ user: publicUser(req.user) });
});

// ---------- conversations ----------
app.get('/api/conversations', requireUser, (req, res) => {
  // Sessions that a Studio Pro agent run or an Ad Studio brand fills are listed once, under that run or brand.
  const list = db.conversations.filter((c) => c.userId === req.user.id && !c.hideInRecents).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(convSummary);
  res.json({ conversations: list });
});
app.get('/api/conversations/:id', requireUser, (req, res) => {
  const c = userConv(req.user, req.params.id);
  if (!c) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ conversation: c });
});
app.patch('/api/conversations/:id', requireUser, (req, res) => {
  const c = userConv(req.user, req.params.id);
  if (!c) return res.status(404).json({ error: 'Conversation not found.' });
  if (typeof req.body.title === 'string') c.title = req.body.title.trim().slice(0, 120) || c.title;
  if (typeof req.body.starred === 'boolean') c.starred = req.body.starred;
  if ('projectId' in req.body) {
    if (req.body.projectId && !userProject(req.user, req.body.projectId)) return res.status(404).json({ error: 'Project not found.' });
    c.projectId = req.body.projectId || undefined;
    // An image or video session carries its creations into the project with it.
    if (isStudioKind(c.kind)) for (const g of db.generations) if (g.sessionId === c.id && g.userId === req.user.id) g.projectId = c.projectId;
  }
  save();
  res.json({ conversation: convSummary(c) });
});
// Reusing or editing something from Assets makes its chat or session the one being worked on, so it moves to the top of Recents.
app.post('/api/conversations/:id/touch', requireUser, (req, res) => {
  const c = userConv(req.user, req.params.id);
  if (!c) return res.status(404).json({ error: 'Conversation not found.' });
  c.updatedAt = now(); save();
  res.json({ conversation: convSummary(c) });
});
app.delete('/api/conversations/:id', requireUser, (req, res) => {
  const gone = userConv(req.user, req.params.id);
  // Removing an app from the history clears its run list. The pictures and videos stay in Assets.
  if (gone?.kind === 'app') for (const g of db.generations) if (g.userId === req.user.id && g.appId === gone.appId) g.hidden = true;
  db.conversations = db.conversations.filter((c) => !(c.id === req.params.id && c.userId === req.user.id));
  for (const d of db.documents.filter((x) => x.conversationId === req.params.id && x.userId === req.user.id)) deleteDoc(d);
  save();
  res.json({ ok: true });
});

// ---------- code project files ----------
app.post('/api/code/projects', requireUser, (req, res) => {
  const c = getOrCreateConv(req.user, null, String(req.body.title || 'New project'), 'code');
  save();
  res.json({ conversation: convSummary(c) });
});
app.put('/api/conversations/:id/files', requireUser, (req, res) => {
  const c = userConv(req.user, req.params.id);
  if (!c || c.kind !== 'code') return res.status(404).json({ error: 'Project not found.' });
  const items = Array.isArray(req.body.files) ? req.body.files : [{ path: req.body.path, content: req.body.content }];
  c.files ||= {};
  for (const it of items) {
    const p = cleanPath(it.path);
    if (!p) return res.status(400).json({ error: `"${String(it.path).slice(0, 60)}" is not a valid file path.` });
    if (it.content == null) { delete c.files[p]; continue; }
    if (Buffer.byteLength(String(it.content)) > 600 * 1024) return res.status(400).json({ error: `${p} is too large (600 KB limit per file).` });
    if (!(p in c.files) && Object.keys(c.files).length >= 200) return res.status(400).json({ error: 'A project can hold up to 200 files.' });
    c.files[p] = String(it.content);
  }
  c.updatedAt = now(); save();
  res.json({ files: c.files });
});
app.get('/api/conversations/:id/zip', requireUser, wrap(async (req, res) => {
  const c = userConv(req.user, req.params.id);
  if (!c || !c.files || !Object.keys(c.files).length) return res.status(404).json({ error: 'This project has no files yet.' });
  const buf = await filesToZip(c.files);
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${safeName(c.title, 'project')}.zip"` }).send(buf);
}));

// ---------- downloads ----------
app.post('/api/export/docx', requireUser, wrap(async (req, res) => {
  const md = String(req.body.markdown || '');
  if (!md.trim()) throw new UserError('There is nothing to export.');
  const title = docTitle(md, String(req.body.title || 'Document'));
  const buf = await markdownToDocx(md, title);
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${safeName(title)}.docx"`, 'X-File-Name': encodeURIComponent(safeName(title) + '.docx') }).send(buf);
}));

// ---------- files ----------
const uploadFiles = (req, res, next) => upload.array('files', 10)(req, res, (err) => {
  if (!err) return next();
  for (const f of req.files || []) fs.rmSync(f.path, { force: true });
  const big = Math.max(limits().videoMb, limits().fileMb);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `That file is too large. The limit is ${big >= 1024 ? Math.round(big / 102.4) / 10 + ' GB' : big + ' MB'} for videos and ${limits().fileMb} MB for other files.` : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'You can add up to 10 files at a time.' : 'The upload did not finish. Please try again.', code: 'upload_failed' });
});
app.post('/api/files', requireUser, uploadFiles, wrap(async (req, res) => {
  const out = [], errors = [];
  for (const f of req.files || []) {
    try {
      const meta = await ingest(req.user, f, { allowAudio: req.query.audio === '1' });
      out.push(meta);
      // Videos and sound files get their length read, a poster and a small preview copy in the background.
      if (meta.kind === 'video' || meta.kind === 'audio') deriveLater(db.files.find((x) => x.id === meta.id), { proxy: req.query.proxy === '1' });
    } catch (e) { errors.push(e.message); fs.rmSync(f.path, { force: true }); }
  }
  res.json({ files: out, errors });
}));
app.get('/api/files/:id/raw', requireUser, (req, res) => {
  const f = db.files.find((x) => x.id === req.params.id && x.userId === req.user.id && x.kind !== 'generated');
  if (!f) return res.status(404).end();
  const remote = bucketUrl(filePath(f), { name: f.name, mime: f.mime, inline: true }); if (remote) return res.redirect(302, remote);
  res.type(f.mime).sendFile(filePath(f));
});
app.get('/api/media/:id', requireUser, (req, res) => {
  const m = db.files.find((x) => x.id === req.params.id && x.userId === req.user.id && x.kind === 'generated');
  if (!m) return res.status(404).end();
  if (m.remoteUrl) return res.redirect(m.remoteUrl);
  const file = locate(m);
  if (!file) return res.status(404).end();
  const remote = bucketUrl(file, { mime: m.mime, inline: true }); if (remote) return res.redirect(302, remote);
  res.type(m.mime).sendFile(file, { dotfiles: 'allow' }, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});
// Turn a generated image into an upload so it can be used as a reference (edit, animate).
app.post('/api/media/:id/as-file', requireUser, (req, res) => {
  const m = db.files.find((x) => x.id === req.params.id && x.userId === req.user.id && x.kind === 'generated' && (x.key || x.file));
  if (!m) return res.status(404).json({ error: 'Only images saved in Scenly can be reused. Download it and upload it instead.' });
  const rec = { id: id('f_'), userId: req.user.id, name: m.name || 'image.png', size: m.size, mime: m.mime, kind: m.mime.startsWith('video/') ? 'video' : 'image', fromMedia: m.id, createdAt: now() };
  fs.copyFileSync(locate(m), filePath(rec)); mirror(filePath(rec));
  db.files.push(rec); save();
  res.json({ file: fileMeta(rec) });
});
app.get('/api/library', requireUser, (req, res) => {
  const gens = new Map(db.generations.filter((g) => g.userId === req.user.id).map((g) => [g.id, g]));
  const convs = new Map(db.conversations.filter((c) => c.userId === req.user.id).map((c) => [c.id, c]));
  const projects = new Map((db.vprojects || []).filter((p) => p.userId === req.user.id).map((p) => [p.id, p]));
  // Every image, video and sound made anywhere in Scenly, including Video Builder scenes and Video Agent films.
  const items = db.files.filter((f) => f.userId === req.user.id && f.kind === 'generated').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((m) => {
    const g = m.generationId && gens.get(m.generationId);
    const conv = g?.sessionId && convs.get(g.sessionId);
    const proj = m.builderId && projects.get(m.builderId);
    // Where it was made: an AI App, Studio Pro, Ad Studio, Video Builder, Video Agent, the editor, the Image or Video page, or a chat.
    const origin = g?.appId ? 'app' : g?.origin || conv?.origin || (conv?.proTool ? 'pro' : '') || (m.builderId ? proj?.origin || (proj?.agent?.from === 'studio-pro' ? 'pro' : proj?.agent ? 'agent' : 'builder') : '') || (g?.tool || g?.editOf ? 'edit' : '') || (g ? (g.mode === 'video' ? 'video' : 'image') : 'chat');
    const type = m.type === 'video' || m.type === 'image' ? m.type : String(m.mime || '').startsWith('image/') ? 'image' : String(m.mime || '').startsWith('video/') ? 'video' : 'other';
    const scene = m.sceneNumber ? `Scene ${m.sceneNumber}` : '';
    return { ...mediaRef(m), type, mime: type === 'other' ? m.mime : undefined, prompt: g?.displayPrompt || g?.originalPrompt || m.prompt || (proj ? [proj.title, scene].filter(Boolean).join(' · ') : m.title), createdAt: m.createdAt, conversationId: m.conversationId, generationId: m.generationId, sessionId: g?.sessionId, tool: m.tool || undefined, rootId: m.rootId || undefined, styleId: g?.styleId, styleVar: g?.styleVar, typedPrompt: g?.typedPrompt, params: g?.params, appId: g?.appId || undefined, builderId: m.builderId || undefined, scene: scene || undefined, origin, source: g?.appId ? 'app' : g ? 'studio' : m.builderId ? 'builder' : 'chat' };
  });
  res.json({ items });
});

// ---------- chat ----------
const estTokens = (s) => Math.ceil(String(s || '').length / 3.5);

// Did the user ask for the answer as a file? Then the reply must be the document and nothing else.
function wantedFile(text) {
  const t = String(text || '').toLowerCase();
  if (/\bdocx\b|\bword (format|file|doc|document|version|copy)\b|\b(in|as|to|into) (an? )?(ms |microsoft )?word\b|\bword doc\b/.test(t)) return 'docx';
  if (/\bpdf (format|file|version|copy)\b|\b(in|as|to|into) (an? )?pdf\b|\b(download|export)\w* .{0,20}\bpdf\b/.test(t)) return 'pdf';
  return null;
}
const CHAT_SYSTEM = () => `You are Scenly, a helpful, accurate assistant. Today is ${new Date().toDateString()}. Use Markdown for structure and fenced code blocks with a language tag for code. When documents are attached, ground your answers in them and cite the document name.

This app has two features you must rely on:
1. Live preview. Any \`\`\`html code block is rendered as a working page in the chat. Only when the user asks for a website, web page, landing page, app, game, chart, graph, dashboard, analytics or another visual, reply with ONE complete, self-contained HTML document in a single \`\`\`html block: inline CSS and JavaScript, responsive, and libraries such as Chart.js loaded from https://cdn.jsdelivr.net when useful. Use realistic example data when none is given. Never say you cannot show visuals, and do not give Python plotting scripts unless the user asks for Python.
   For everyday questions (weather, facts, news, advice, how-to, explanations, chit-chat) answer in plain words with Markdown. Do NOT write HTML, a web page, a template or any code unless the user asked for code, a page, an app or a visual. If you need a detail you don't have, such as the user's city or location for weather, ask for it in one short sentence. You have no live data (weather, prices, scores): say so briefly and give useful general information rather than inventing current numbers.
2. Downloads. Every reply has a Download button that saves it as Word (.docx), PDF, Markdown or HTML. Never say you cannot create or attach files, and never give copy-and-paste instructions.`;
const FILE_SYSTEM = (kind) => `

The user wants this as a ${kind === 'docx' ? 'Word' : 'PDF'} file. The app converts your reply into that file. Reply with ONLY the complete document in Markdown, starting with its title as a "# " heading. No preamble, no closing remarks, no notes about formatting, no emoji. If the user is asking for an earlier answer as a file, write that whole document out again in full.`;
const CODE_SYSTEM = (files) => `You are Scenly Code, an expert software engineer working in the user's project workspace inside a web app. Today is ${new Date().toDateString()}.

How you work:
- To create or replace a file, write the COMPLETE file between <file path="relative/path.ext"> and </file>. Put the raw file content there: no Markdown fences, no placeholders, no "rest unchanged". Always close every file with </file>, never with a Markdown fence.
- To delete a file, write <delete path="relative/path.ext"/>.
- Only write the files you create or change. Leave every other file out.
- Start with one or two short sentences saying what you are about to do. After the files, finish with a short summary of what changed and anything the user must do. Never paste a file's code outside the <file> tags.
- You cannot run commands, install packages or reach the network. When something has to be run, say exactly what to run.
- The workspace shows a live preview of web projects: it opens index.html and loads the project's own CSS and JavaScript files referenced by relative paths. For websites and dashboards use plain HTML, CSS and JavaScript that works with no build step (CDN libraries such as Chart.js are fine) unless the user asks for a framework. Make pages responsive and polished.
- If the user only asks a question, answer it and write no files.
- Match the style and conventions already used in the project.

Current project files:
${Object.keys(files || {}).length ? Object.entries(files).map(([p, c]) => `<file path="${p}">\n${c}\n</file>`).join('\n') : '(the project is empty)'}`;

function buildMessages(conv, model, system, opened = null) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  const userTurns = conv.messages.filter((m) => m.role === 'user');
  const recentImageTurns = new Set(userTurns.slice(-3).map((m) => m.id));
  for (const m of conv.messages) {
    if (m.status === 'error') continue;
    if (m.role === 'assistant') {
      let text = conv.kind === 'code' ? stripFileBodies(m.content) : m.content || '';
      if (m.media?.length) text = `${text}\n[${m.mode === 'video' ? 'Generated a video' : 'Generated an image'} for the prompt: "${m.prompt || ''}"]`.trim();
      if (m.doc) text = `${text}\n[${m.doc.action === 'edited' ? 'Updated' : 'Created'} the ${DOC_KINDS[m.doc.kind]?.label || 'document'} "${m.doc.title}" in Docs Studio (version ${m.doc.v})${m.doc.notes?.length ? ': ' + m.doc.notes.join('; ') : ''}]`.trim();
      if (text) msgs.push({ role: 'assistant', content: text });
      continue;
    }
    const files = getFiles({ id: conv.userId }, (m.files || []).map((f) => f.id));
    // In a spreadsheet turn, attached spreadsheets are opened as sheets, so their text is not repeated here.
    const asSheet = opened ? files.filter((f) => f.kind === 'document' && (m.opened?.includes(f.name) || opened.can?.(f.name))) : [];
    const docs = files.filter((f) => f.kind === 'document' && !asSheet.includes(f));
    const images = files.filter((f) => f.kind === 'image');
    let text = m.content || '';
    if (asSheet.length) text = `[Attached and opened in the ${opened.noun}: ${asSheet.map((f) => f.name).join(', ')}]\n` + text;
    // Documents that can hold pictures are told how to place the attached ones.
    if (opened?.pictures && images.length) text += `\n\n[Attached pictures, which can be placed in the document: ${images.map((f) => `"${f.name}" = file:${f.id}`).join('; ')}]`;
    if (docs.length) {
      text = docs.map((d) => `<document name="${d.name}"${d.truncated ? ' truncated="true"' : ''}>\n${d.text}\n</document>`).join('\n\n') + '\n\n' + text;
    }
    if (images.length && !model.vision) text += `\n\n[The user attached ${images.length} image(s), but this model cannot see images.]`;
    if (images.length && model.vision && recentImageTurns.has(m.id)) {
      msgs.push({ role: 'user', content: [{ type: 'text', text: text || 'See the attached image.' }, ...images.map((f) => ({ type: 'image_url', image_url: { url: dataUrl(f) } }))] });
    } else {
      msgs.push({ role: 'user', content: text });
    }
  }
  return msgs;
}

const chatHandler = wrap(async (req, res) => {
  const user = req.user;
  const isCode = req.path === '/api/code';
  const { model: modelId, message = '', fileIds = [], conversationId, regenerate, projectId } = req.body;
  const model = await findModel(modelId);
  if (!model || model.type !== 'chat') return res.status(400).json({ error: 'Pick a chat model.' });
  if (!String(message).trim() && !fileIds.length && !regenerate) return res.status(400).json({ error: 'Type a message first.' });

  const conv = getOrCreateConv(user, conversationId, message || 'New chat', isCode ? 'code' : 'chat');
  if (isCode !== (conv.kind === 'code')) return res.status(400).json({ error: isCode ? 'Open this in Chat, not Code.' : 'Open this project in Code.' });
  if (isCode) conv.files ||= {};
  if (!conv.messages.length && !conv.projectId && projectId && userProject(user, projectId)) conv.projectId = projectId;
  const proj = conv.projectId && userProject(user, conv.projectId);
  let docReq = null;
  if (regenerate) {
    while (conv.messages.length && conv.messages.at(-1).role === 'assistant') {
      const gone = conv.messages.pop();
      // Regenerating a document reply starts again from the version it was based on.
      const d = gone.doc && userDoc(user, gone.doc.id);
      if (d && DOC_KINDS[d.kind] && !docReq) {
        // A reply that started from an uploaded file or a template goes back to that starting point.
        if (gone.doc.seed) setCurrent(d, gone.doc.seed);
        else if (gone.doc.base && gone.doc.action === 'edited') setCurrent(d, gone.doc.base);
        docReq = { kindId: d.kind, doc: d, fresh: !gone.doc.seed && gone.doc.action !== 'edited' };
      }
    }
    if (!conv.messages.length) return res.status(400).json({ error: 'Nothing to regenerate.' });
  } else {
    const files = getFiles(user, fileIds).map(fileMeta);
    conv.messages.push({ id: id('msg_'), role: 'user', content: String(message), files, createdAt: now() });
  }

  const lastText = conv.messages.findLast((m) => m.role === 'user')?.content;
  if (!isCode && !docReq) {
    const attached = regenerate ? [] : getFiles(user, fileIds).filter((f) => f.kind === 'document').map((f) => ({ name: f.name, size: f.size, path: filePath(f) }));
    docReq = docRequest(user, conv, req.body.doc, lastText, attached);
    if (docReq) docReq.attached = attached;
    // Remember which attachments were opened as the document, so their text is not also sent as chat context.
    if (docReq?.files?.length) conv.messages.findLast((m) => m.role === 'user').opened = docReq.files.map((f) => f.name);
  }
  const fileKind = isCode || docReq ? null : wantedFile(lastText);
  // The person's memory (name, location, a few facts) personalises chat and document answers.
  const mem = isCode ? '' : memoryPrompt(user);
  const system = (isCode ? CODE_SYSTEM(conv.files) : CHAT_SYSTEM() + (fileKind ? FILE_SYSTEM(fileKind) : '')) + (mem ? '\n\n' + mem : '') + (proj ? '\n\n' + projectContext(user, proj, conv.id) : '');
  const messages = buildMessages(conv, model, docReq ? null : system, docReq ? { can: DOC_KINDS[docReq.kindId].importsInto ? DOC_KINDS[docReq.kindId].canImport : null, noun: DOC_KINDS[docReq.kindId].noun, pictures: !!DOC_KINDS[docReq.kindId].pictures } : null);
  if (proj) {
    proj.updatedAt = now();
    // Models that can see also get the project's pictures.
    const pics = model.vision && !isCode ? projectImages(user, proj) : [];
    const last = messages.at(-1);
    if (pics.length && last?.role === 'user') {
      const parts = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
      last.content = [...parts, { type: 'text', text: `Project images, in order: ${pics.map((x, i) => `${i + 1}. ${x.name}`).join('; ')}` }, ...pics.map((x) => ({ type: 'image_url', image_url: { url: x.url } }))];
    }
  }
  const inTok = estTokens(JSON.stringify(messages.map((m) => (typeof m.content === 'string' ? m.content : m.content.filter((p) => p.type === 'text').map((p) => p.text).join(' '))))) + messages.reduce((n, m) => n + (Array.isArray(m.content) ? (m.content.length - 1) * 1100 : 0), 0);

  // Never let one reply cost more than the user has: cap output tokens by balance.
  const bal = balanceOf(user);
  const budgetUsd = (bal * CREDIT_USD()) / markupOf(model) - (inTok * model.price.inPerM) / 1e6;
  const affordableOut = model.price.outPerM > 0 ? Math.floor((budgetUsd / model.price.outPerM) * 1e6) : 1e9;
  if (bal <= 0 || affordableOut < (docReq ? 1500 : 200)) {
    if (!regenerate) conv.messages.pop();
    return res.status(402).json({ error: 'Not enough credits for this model. Top up or choose a cheaper model.', code: 'insufficient_credits' });
  }
  const body = { model: model.id, messages, stream: true, stream_options: { include_usage: true } };
  if (affordableOut < 32000) body.max_tokens = affordableOut;
  // Meanwhile a small model reads the new message for facts worth keeping (name, city, preferences).
  const learning = isCode || regenerate ? null : learnFromMessage(user, lastText);
  const learned = async () => (learning ? Promise.race([learning, new Promise((r) => setTimeout(() => r(null), 2500))]) : null);

  conv.updatedAt = now();
  conv.lastModel = model.id;
  save();

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('start', { conversation: convSummary(conv), userMessage: regenerate ? null : conv.messages.at(-1) });

  const ctrl = new AbortController();
  let finished = false;
  res.on('close', () => { if (!finished) ctrl.abort(); });

  const reply = { id: id('msg_'), role: 'assistant', mode: isCode ? 'code' : 'chat', model: model.id, content: '', reasoning: '', createdAt: now() };
  if (fileKind) reply.fileKind = fileKind;
  let usage = null;
  if (docReq) {
    // Docs Studio: the model plans the file, Scenly checks it and builds it. Nothing is charged unless something is delivered.
    try {
      const r = await runDocTurn({ user, conv, model, ...docReq, userText: String(lastText || ''), history: messages, signal: ctrl.signal, budgetUsd, status: (text) => { if (!res.writableEnded) send('status', { text }); }, projectContext: [mem, proj ? projectContext(user, proj, conv.id) : ''].filter(Boolean).join('\n\n') });
      finished = true;
      reply.content = r.message;
      if (r.doc) reply.doc = r.doc;
      reply.credits = charge(user, usdToCredits(r.usage.usd, model), `${r.doc ? DOC_KINDS[r.doc.kind].label : 'Chat'} · ${model.name}`, { model: model.id, usd: r.usage.usd, conversationId: conv.id });
      reply.usage = { input: r.usage.input, output: r.usage.output };
      const memo = await learned();
      if (memo) reply.memory = memo;
      conv.messages.push(reply);
      conv.updatedAt = now();
      save();
      if (!res.writableEnded) { send('done', { message: reply, credits: publicUser(user).credits, conversation: convSummary(conv), doc: r.target ? docMeta(r.target) : undefined }); res.end(); }
    } catch (e) {
      finished = true;
      if (!regenerate) conv.messages.pop();
      save();
      const known = e instanceof GatewayError || e instanceof UserError || e instanceof DocError;
      if (!known && e?.name !== 'AbortError') console.error('docs', e);
      if (e instanceof DocError) console.warn('Docs Studio could not build:', e.details);
      if (!res.writableEnded) { send('error', { error: known ? e.message : 'Something went wrong while building the document. No credits were charged. Please try again.', code: e.code, removeUserMessage: !regenerate }); res.end(); }
    }
    return;
  }
  try {
    const upstream = await call('/chat/completions', { json: body, signal: ctrl.signal });
    for await (const ev of sse(upstream)) {
      if (ev.usage) usage = ev.usage;
      const d = ev.choices?.[0]?.delta;
      if (!d) continue;
      const r = d.reasoning_content || d.reasoning || '';
      if (r) { reply.reasoning += r; send('delta', { reasoning: r }); }
      if (d.content) { reply.content += d.content; send('delta', { content: d.content }); }
    }
  } catch (e) {
    if (!ctrl.signal.aborted) {
      if (!reply.content && !reply.reasoning) {
        finished = true;
        if (!regenerate) conv.messages.pop();
        save();
        if (!(e instanceof GatewayError)) console.error('chat', e);
        send('error', { error: e instanceof GatewayError ? e.message : 'Something went wrong on our side. No credits were charged. Please try again.', removeUserMessage: !regenerate });
        return res.end();
      }
      reply.error = 'The answer was cut off because the connection to the AI provider dropped. You were only charged for the part you received. Press Try again to get a full answer.';
    } else {
      reply.stopped = true;
    }
  }
  // A finished stream with nothing in it is a failed answer: say so, save nothing, charge nothing.
  if (!ctrl.signal.aborted && !reply.error && !reply.content.trim() && !reply.reasoning.trim()) {
    finished = true;
    if (!regenerate) conv.messages.pop();
    save();
    console.warn(`[gateway] empty answer from ${model.id}`);
    if (!res.writableEnded) { send('error', { error: 'The model sent back an empty answer. No credits were charged. Please try again, or pick another model.', removeUserMessage: !regenerate }); res.end(); }
    return;
  }
  finished = true;
  const usd = paidUsd(usage, estimateChatUsd(model, usage?.prompt_tokens ?? inTok, usage?.completion_tokens ?? estTokens(reply.content + reply.reasoning)));
  reply.credits = charge(user, usdToCredits(usd, model), `${isCode ? 'Code' : 'Chat'} · ${model.name}`, { model: model.id, usd, conversationId: conv.id });
  if (isCode) reply.ops = applyFileOps(conv.files, reply.content);
  reply.usage = usage ? { input: usage.prompt_tokens, output: usage.completion_tokens } : null;
  const memo = reply.stopped ? null : await learned();
  if (memo) reply.memory = memo;
  conv.messages.push(reply);
  conv.updatedAt = now();
  save();
  if (!res.writableEnded) {
    send('done', { message: reply, credits: publicUser(user).credits, files: isCode ? conv.files : undefined, conversation: convSummary(conv) });
    res.end();
  }
});
app.post('/api/chat', requireUser, chatHandler);
app.post('/api/code', requireUser, chatHandler);

// ---------- images & video inside a chat ----------
app.post('/api/image', requireUser, wrap(async (req, res) => {
  const user = req.user;
  const { model: modelId, prompt = '', fileIds = [], conversationId, size, quality, count } = req.body;
  if (!String(prompt).trim()) throw new UserError('Describe the image you want.');
  const conv = getOrCreateConv(user, conversationId, prompt);
  const r = await runImage(user, { modelId, prompt, fileIds, size, quality, count, meta: { conversationId: conv.id } });
  const userMsg = { id: id('msg_'), role: 'user', content: prompt, files: getFiles(user, fileIds).map(fileMeta), createdAt: now() };
  const reply = { id: id('msg_'), role: 'assistant', mode: 'image', model: r.model.id, prompt, content: '', media: r.media.map(mediaRef), credits: r.credits, note: r.partialError || undefined, createdAt: now() };
  conv.messages.push(userMsg, reply);
  conv.updatedAt = now(); conv.lastModel = r.model.id;
  save();
  res.json({ conversation: convSummary(conv), userMessage: userMsg, message: reply, credits: publicUser(user).credits });
}));

app.post('/api/video', requireUser, wrap(async (req, res) => {
  const user = req.user;
  const { model: modelId, prompt = '', fileIds = [], conversationId, videoUrl, count } = req.body;
  if (!String(prompt).trim()) throw new UserError('Describe the video you want.');
  const conv = getOrCreateConv(user, conversationId, prompt);
  const messageId = id('msg_');
  const r = await startVideo(user, { modelId, prompt, fileIds, videoUrl, count, params: req.body, target: { conversationId: conv.id, messageId } });
  const userMsg = { id: id('msg_'), role: 'user', content: prompt, files: r.refs, createdAt: now() };
  const reply = { id: messageId, role: 'assistant', mode: 'video', model: r.model.id, prompt, content: '', status: 'pending', taskId: r.taskIds[0], taskIds: r.taskIds, params: r.params, credits: r.reserved, note: r.partialError || undefined, createdAt: now() };
  conv.messages.push(userMsg, reply);
  conv.updatedAt = now(); conv.lastModel = r.model.id;
  save();
  res.json({ conversation: convSummary(conv), userMessage: userMsg, message: reply, credits: publicUser(user).credits });
}));

app.get('/api/video/:taskId', requireUser, wrap(async (req, res) => {
  const t = db.tasks.find((x) => x.taskId === req.params.taskId && x.userId === req.user.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  const siblings = db.tasks.filter((x) => x.userId === req.user.id && (t.messageId ? x.messageId === t.messageId : x.generationId === t.generationId));
  await Promise.all(siblings.map(pollTask));
  const conv = db.conversations.find((c) => c.id === t.conversationId);
  res.json({ message: conv?.messages.find((m) => m.id === t.messageId), credits: publicUser(req.user).credits });
}));
setInterval(() => db.tasks.filter((t) => t.status === 'pending').forEach(pollTask), 15000).unref();

// Credit rules of 2026-11-20: every balance moves into buckets (plan, top-up, free) once, at the first start of
// this version. Totals never change; the database as it was is kept beside it. Then plan and top-up credits
// past their date expire every 10 minutes, and top-ups that expire within a week get one reminder email.
try {
  const r = migrateAll({ keepCopy: () => { const f = path.join(DATA_DIR, 'db.json'); if (fs.existsSync(f)) fs.copyFileSync(f, `${f}.before-credit-rules-${new Date().toISOString().replace(/[:.]/g, '-')}`); } });
  if (r.moved) console.log(`[credits] ${r.moved} accounts moved to the new credit rules (${r.carry || 0} paid carried over, ${r.free || 0} free, ${r.owed || 0} owing); total ${r.total} credits unchanged`);
} catch (e) { console.error('[credits] moving balances to the new credit rules failed; nothing was changed:', e.message); }
setTimeout(() => { try { sweepCredits(); } catch (e) { console.error('[credits] sweep failed:', e.message); } }, 30e3).unref();
setInterval(() => { try { sweepCredits(); } catch (e) { console.error('[credits] sweep failed:', e.message); } }, 10 * 60e3).unref();

// ---------- studio: Image / Video pages and AI Apps ----------
const genView = (g) => ({ ...g, userId: undefined });
// The other studios that make pictures and videos through these routes, so Assets and Recents can say where each came from.
const ORIGINS = ['pro', 'ads'];
const markSession = (c, origin, quiet) => { if (ORIGINS.includes(origin) && !c.origin) c.origin = origin; if (quiet) c.hideInRecents = true; };

async function createGeneration(user, { mode, modelId, prompt, fileIds = [], videoUrl, params = {}, count = 1, appId, enhance, displayPrompt, characterId, projectId, styleId, styleVar, mediaMeta = {}, extra = {}, task, typedBefore, origin }) {
  let finalPrompt = String(prompt || '').trim();
  // A Design Library style. Photo Transform styles work on the uploaded picture and need no typed prompt.
  const style = styleId && mode === 'image' ? findStyle(styleId) : null;
  if (styleId && mode === 'image' && !style) throw new UserError('That style no longer exists. Pick another one.');
  if (style && styleLocked(user, style)) throw new UserError(`${style.name} is part of the full Design Library, which comes with any paid plan or top-up pack.`, 402, 'style_locked');
  if (style?.needsImage && !getFiles(user, fileIds).some((f) => f.kind === 'image') && !characterId) throw new UserError(`${style.name} changes a photo. Add a photo first.`);
  if (!finalPrompt && !style?.needsImage) throw new UserError(mode === 'video' ? 'Describe the video you want.' : 'Describe the image you want.');
  const ch = characterId ? userCharacter(user, characterId) : null;
  if (characterId && !ch) throw new UserError('That character no longer exists. Pick another one.');
  let enhanced = null;
  const typed = finalPrompt;
  if (enhance && finalPrompt) { enhanced = await enhancePrompt(user, finalPrompt, mode, fileIds); finalPrompt = enhanced.prompt; }
  if (style) {
    finalPrompt = applyStyle(style, finalPrompt, styleVar);
    displayPrompt ||= typed || style.name;
    extra = { ...extra, typedPrompt: typed, styleId: style.id, styleName: style.name, styleVar: style.variable ? String(styleVar || style.variable.options[0]).slice(0, 80) : undefined };
  }
  if (ch) {
    const model = await findModel(modelId);
    if (!model || model.type !== mode) throw new UserError(`Pick ${mode === 'video' ? 'a video' : 'an image'} model.`);
    const locked = applyCharacter(user, ch, { mode, model, fileIds, prompt: finalPrompt });
    if (locked.error) throw new UserError(locked.error);
    displayPrompt ||= enhanced ? undefined : finalPrompt;
    fileIds = locked.fileIds; finalPrompt = locked.prompt;
  }
  const gid = id('g_');
  const base = { id: gid, userId: user.id, mode, prompt: finalPrompt, originalPrompt: enhanced && !appId ? String(prompt) : typedBefore && !appId && String(typedBefore).trim() !== typed ? String(typedBefore).slice(0, 4000) : undefined, displayPrompt, appId, origin: ORIGINS.includes(origin) ? origin : undefined, ...extra, characterId: ch?.id, characterName: ch?.name, projectId: projectId && userProject(user, projectId) ? projectId : undefined, createdAt: now() };
  if (mode === 'image') {
    const r = await runImage(user, { modelId, prompt: finalPrompt, fileIds, size: params.size, quality: params.quality, count, meta: { generationId: gid, ...mediaMeta }, strict: !appId && !extra.tool });
    const g = { ...base, model: r.model.id, params: r.params, refs: getFiles(user, fileIds).map(fileMeta), status: 'done', media: r.media.map(mediaRef), credits: round2(r.credits + (enhanced?.credits || 0)), note: r.partialError || undefined };
    db.generations.push(g); save();
    return g;
  }
  if (mode === 'video') {
    const r = await startVideo(user, { modelId, prompt: finalPrompt, fileIds, videoUrl, count, params, target: { generationId: gid }, strict: !appId, task: appId ? undefined : task });
    const g = { ...base, model: r.model.id, params: { ...r.params, count: r.taskIds.length }, refs: r.refs, videoUrl, status: 'pending', media: [], taskIds: r.taskIds, credits: round2(r.reserved + (enhanced?.credits || 0)), note: r.partialError || undefined };
    db.generations.push(g); save();
    return g;
  }
  throw new UserError('Unknown mode.');
}

// The same click sent twice (double click, a retry after a dropped connection) must make and charge one result.
const recentGenerate = new Map();
const once = (key, fn) => {
  if (!key) return fn();
  for (const [k, v] of recentGenerate) if (v.at < Date.now() - 15 * 60000) recentGenerate.delete(k);
  if (!recentGenerate.has(key)) { const p = fn(); recentGenerate.set(key, { at: Date.now(), p }); p.catch(() => recentGenerate.delete(key)); }
  return recentGenerate.get(key).p;
};
app.post('/api/generate', requireUser, wrap(async (req, res) => {
  const idem = typeof req.body.idem === 'string' && req.body.idem.length >= 8 ? `${req.user.id}:${req.body.idem.slice(0, 80)}` : null;
  res.json(await once(idem, () => generateOnce(req)));
}));
async function generateOnce(req) {
  const res = { json: (x) => x };
  const { mode, model, prompt, fileIds, videoUrl, params, count, enhance, characterId, sessionId, styleId, styleVar, task } = req.body;
  const existing = sessionId && userConv(req.user, sessionId);
  const projectId = req.body.projectId || (existing?.kind === mode ? existing.projectId : undefined);
  const g = await createGeneration(req.user, { mode, modelId: model, prompt, fileIds, videoUrl, params, count, enhance, characterId, projectId, styleId, styleVar, task: ['create', 'edit', 'extend'].includes(task) ? task : undefined, typedBefore: typeof req.body.typedPrompt === 'string' ? req.body.typedPrompt : undefined, origin: req.body.origin });
  // The session is only created once something was really made, so failed first tries leave nothing behind.
  const session = studioSession(req.user, g.mode, sessionId, g.displayPrompt || g.originalPrompt || prompt || g.styleName);
  markSession(session, req.body.origin, req.body.quiet === true);
  g.sessionId = session.id;
  if (!session.projectId && g.projectId) session.projectId = g.projectId;
  session.updatedAt = now(); session.lastModel = g.model;
  save();
  return res.json({ generation: genView(g), session: convSummary(session), credits: publicUser(req.user).credits });
}

app.get('/api/generations', requireUser, wrap(async (req, res) => {
  const mode = req.query.mode;
  const session = req.query.session;
  const list = db.generations.filter((g) => g.userId === req.user.id && !g.hidden && (!mode || g.mode === mode) && (!session || g.sessionId === session)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Number(req.query.limit) || 200);
  res.json({ generations: list.map(genView) });
}));

app.get('/api/generations/:id', requireUser, wrap(async (req, res) => {
  const g = db.generations.find((x) => x.id === req.params.id && x.userId === req.user.id);
  if (!g) return res.status(404).json({ error: 'Not found.' });
  if (g.status === 'pending') await Promise.all(db.tasks.filter((t) => t.generationId === g.id).map(pollTask));
  res.json({ generation: genView(g), credits: publicUser(req.user).credits });
}));

app.patch('/api/generations/:id', requireUser, (req, res) => {
  const g = db.generations.find((x) => x.id === req.params.id && x.userId === req.user.id);
  if (!g) return res.status(404).json({ error: 'Not found.' });
  if ('projectId' in req.body) {
    if (req.body.projectId && !userProject(req.user, req.body.projectId)) return res.status(404).json({ error: 'Project not found.' });
    g.projectId = req.body.projectId || undefined;
  }
  save();
  res.json({ generation: genView(g) });
});
app.delete('/api/generations/:id', requireUser, (req, res) => {
  const g = db.generations.find((x) => x.id === req.params.id && x.userId === req.user.id);
  if (g) { g.hidden = true; save(); }
  res.json({ ok: true });
});

app.post('/api/enhance', requireUser, wrap(async (req, res) => {
  const fromMedia = req.body.mediaId ? mediaFileId(req.user, String(req.body.mediaId)) : null;
  const r = await enhancePrompt(req.user, req.body.prompt, req.body.mode, fromMedia ? [fromMedia] : req.body.fileIds, { edit: !!fromMedia, field: req.body.field });
  res.json({ prompt: r.prompt, sawImage: !!r.sawImage, credits: publicUser(req.user).credits });
}));

app.get('/api/apps', wrap(async (_req, res) => {
  const models = await getCatalog();
  const apps = APPS.map((a) => ({ ...publicApp(a), model: a.models.find((mid) => models.some((m) => m.id === mid)) || null })).filter((a) => a.model);
  res.json({ apps });
}));

// Opens the app's entry in the history before a run starts, so it shows as working straight away.
app.post('/api/apps/:id/session', requireUser, (req, res) => {
  const appDef = findApp(req.params.id);
  if (!appDef) return res.status(404).json({ error: 'App not found.' });
  const c = appSession(req.user, appDef);
  c.updatedAt = now(); save();
  res.json({ session: convSummary(c) });
});
// A first run that fails leaves nothing behind in the history.
const tidyAppSession = (user, appDef) => { const c = appSession(user, appDef, false); if (c && !db.generations.some((g) => g.sessionId === c.id && !g.hidden)) { db.conversations = db.conversations.filter((x) => x !== c); save(); } };
app.delete('/api/apps/:id/session', requireUser, (req, res) => { const appDef = findApp(req.params.id); if (appDef) tidyAppSession(req.user, appDef); res.json({ ok: true }); });
app.post('/api/apps/:id/run', requireUser, wrap(async (req, res) => {
  const appDef = findApp(req.params.id);
  if (!appDef) return res.status(404).json({ error: 'App not found.' });
  const filed = (gens) => {
    const c = appSession(req.user, appDef);
    for (const g of gens) g.sessionId = c.id;
    c.updatedAt = now(); c.lastModel = gens[0].model; save();
    return convSummary(c);
  };
  const tidy = () => tidyAppSession(req.user, appDef);
  try {
  const models = await getCatalog();
  const modelId = [req.body.model, ...appDef.models].find((mid) => mid && appDef.models.includes(mid) && models.some((m) => m.id === mid));
  if (!modelId) throw new UserError('This app\'s models are not available right now.');
  const { fileIds = [], text = '', videoUrl, characterId, options = {}, consent, projectId } = req.body;
  const hasImage = getFiles(req.user, fileIds).some((f) => f.kind === 'image');
  for (const inp of appDef.inputs) {
    if (!inp.required) continue;
    if (inp.type === 'subject' && !characterId && !hasImage) throw new UserError(`Pick a character or add a photo for "${inp.label}".`);
    if (inp.type === 'consent' && consent !== true) throw new UserError('Please confirm you have permission to use these photos.');
    if (inp.type === 'text' && !String(text).trim()) throw new UserError(`Fill in "${inp.label}".`);
    if ((inp.type === 'image' || inp.type === 'images') && !getFiles(req.user, fileIds).some((f) => f.kind === 'image')) throw new UserError(`Add ${inp.label.toLowerCase()}.`);
    if (inp.type === 'video' && !videoUrl && !getFiles(req.user, fileIds).some((f) => f.kind === 'video')) throw new UserError('Add a source video.');
  }
  // Settings: the app's defaults, then what the user chose. A picture that edits a photo follows that photo's shape.
  const params = { ...(appDef.settings || {}), ...(req.body.params || {}) };
  if (appDef.category === 'image' && (params.size === 'auto' || (!params.size && appDef.frame))) {
    const ch = characterId && userCharacter(req.user, characterId);
    const src = getFiles(req.user, [req.body.frameFileId].filter(Boolean)).find((f) => f.kind === 'image') || (appDef.frame === 'subject' && ch ? getFiles(req.user, ch.fileIds).find((f) => f.kind === 'image') : null) || getFiles(req.user, fileIds).find((f) => f.kind === 'image');
    params.size = (src && sizeLike(await findModel(modelId), src)) || appDef.settings?.size;
  }
  const picked = appDef.inputs.filter((i) => i.type === 'select').map((i) => (i.options.find((o) => o.value === options[i.key]) || i.options[0]).label).join(', ');
  const run = (variant) => createGeneration(req.user, {
    mode: appDef.category, modelId, prompt: fillPrompt(appDef, text, options, variant), fileIds, videoUrl, characterId, projectId,
    params, count: variant ? 1 : req.body.count || 1, appId: appDef.id, enhance: !!appDef.enhance,
    displayPrompt: variant ? `${appDef.name} · ${variant.label}` : String(text).trim() || picked || appDef.name,
  });
  if (appDef.variants) {
    const done = await Promise.allSettled(appDef.variants.map(run));
    const made = done.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!made.length) throw done[0].reason;
    const session = filed(made);
    const gens = made.map(genView);
    return res.json({ generation: gens[0], generations: gens, session, credits: publicUser(req.user).credits });
  }
  const g = await run();
  const session = filed([g]);
  res.json({ generation: genView(g), session, credits: publicUser(req.user).credits });
  } catch (e) { tidy(); throw e; }
}));

// ---------- Docs Studio ----------
mountDocs(app, { requireUser, wrap });
mountEdit(app, { requireUser, wrap, createGeneration, studioSession, convSummary, genView, userConv });

// ---------- Design Library ----------
app.get('/api/styles', requireUser, (req, res) => {
  res.json({ categories: STYLE_CATEGORIES, styles: publicStyles(req.user).map((x) => ({ ...x, thumb: fs.existsSync(path.join(here, '..', 'public', 'styles', x.id + '.jpg')) ? `/styles/${x.id}.jpg` : undefined })), favs: req.user.styleFavs || [], unlocked: isPaid(req.user) });
});
app.post('/api/styles/:id/fav', requireUser, (req, res) => {
  if (!findStyle(req.params.id)) return res.status(404).json({ error: 'Style not found.' });
  const favs = new Set(req.user.styleFavs || []);
  if (req.body.on === false) favs.delete(req.params.id); else favs.add(req.params.id);
  req.user.styleFavs = [...favs]; save();
  res.json({ favs: req.user.styleFavs });
});
mountVoice(app, { requireUser, wrap });
mountMemory(app, { requireUser, wrap });
mountDownloads(app, { requireUser, wrap });
mountBuilder(app, { requireUser, requireAdmin, wrap });
mountAssist(app, { requireUser, wrap });
mountPrecision(app, { requireUser, wrap });
mountKeyframes(app, { requireUser, wrap });
mountPro(app, { requireUser, wrap, createGeneration, studioSession, convSummary, genView, publicUser, markSession });

// ---------- projects ----------
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
app.get('/api/projects', requireUser, (req, res) => {
  res.json({ projects: db.projects.filter((p) => p.userId === req.user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(projectSummary) });
});
app.post('/api/projects', requireUser, (req, res) => {
  const name = clip(req.body.name, 80);
  if (!name) return res.status(400).json({ error: 'Give the project a name.' });
  const p = { id: id('p_'), userId: req.user.id, name, description: clip(req.body.description, 2000), instructions: clip(req.body.instructions, 8000), fileIds: [], createdAt: now(), updatedAt: now() };
  db.projects.push(p); save();
  res.json({ project: projectDetail(req.user, p, convSummary) });
});
app.get('/api/projects/:id', requireUser, wrap(async (req, res) => {
  const p = userProject(req.user, req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found.' });
  await Promise.all(db.tasks.filter((t) => t.status === 'pending' && projectGens(p).some((g) => g.id === t.generationId)).map(pollTask));
  res.json({ project: projectDetail(req.user, p, convSummary) });
}));
app.patch('/api/projects/:id', requireUser, (req, res) => {
  const p = userProject(req.user, req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found.' });
  if (typeof req.body.name === 'string' && req.body.name.trim()) p.name = clip(req.body.name, 80);
  if (typeof req.body.description === 'string') p.description = clip(req.body.description, 2000);
  if (typeof req.body.instructions === 'string') p.instructions = clip(req.body.instructions, 8000);
  if (Array.isArray(req.body.addFileIds)) p.fileIds = [...new Set([...(p.fileIds || []), ...getFiles(req.user, req.body.addFileIds).filter((f) => f.kind !== 'generated').map((f) => f.id)])].slice(0, 40);
  if (req.body.removeFileId) p.fileIds = (p.fileIds || []).filter((x) => x !== req.body.removeFileId);
  // Assign or remove existing chats and creations in one go.
  for (const cid of req.body.addConversationIds || []) { const c = userConv(req.user, cid); if (c) c.projectId = p.id; }
  for (const gid of req.body.addGenerationIds || []) { const g = db.generations.find((x) => x.id === gid && x.userId === req.user.id); if (g) g.projectId = p.id; }
  p.updatedAt = now(); save();
  res.json({ project: projectDetail(req.user, p, convSummary) });
});
app.delete('/api/projects/:id', requireUser, (req, res) => {
  const p = userProject(req.user, req.params.id);
  if (p) {
    for (const c of db.conversations) if (c.projectId === p.id && c.userId === req.user.id) delete c.projectId;
    for (const g of db.generations) if (g.projectId === p.id) delete g.projectId;
    db.projects = db.projects.filter((x) => x !== p); save();
  }
  res.json({ ok: true });
});

// ---------- characters ----------
function characterInput(user, body, existing) {
  const out = {};
  if (body.name != null || !existing) { out.name = clip(body.name, 60); if (!out.name) throw new UserError('Give the character a name.'); }
  if (body.kind != null || !existing) { out.kind = KINDS.includes(body.kind) ? body.kind : 'person'; }
  if (body.notes != null) out.notes = clip(body.notes, 600);
  if (body.fileIds != null || !existing) {
    const photos = getFiles(user, body.fileIds || []).filter((f) => f.kind === 'image').slice(0, 4);
    if (!photos.length) throw new UserError('Add at least one photo.');
    out.fileIds = photos.map((f) => f.id);
    const sheet = body.sheetId && getFiles(user, [body.sheetId]).find((f) => f.kind === 'image');
    out.sheetId = sheet && photos.length > 1 ? sheet.id : undefined;
  }
  return out;
}
app.get('/api/characters', requireUser, (req, res) => {
  res.json({ characters: db.characters.filter((c) => c.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => characterView(req.user, c)) });
});
app.post('/api/characters', requireUser, wrap(async (req, res) => {
  const data = characterInput(req.user, req.body);
  if (data.kind === 'person' && req.body.consent !== true) throw new UserError('Please confirm you have the right to use this person\'s photos.');
  if (db.characters.filter((c) => c.userId === req.user.id).length >= 100) throw new UserError('You can save up to 100 characters. Delete one first.');
  const c = { id: id('ch_'), userId: req.user.id, ...data, consentAt: data.kind === 'person' ? now() : undefined, createdAt: now() };
  db.characters.push(c); save();
  res.json({ character: characterView(req.user, c) });
}));
app.patch('/api/characters/:id', requireUser, wrap(async (req, res) => {
  const c = userCharacter(req.user, req.params.id);
  if (!c) return res.status(404).json({ error: 'Character not found.' });
  Object.assign(c, characterInput(req.user, req.body, c)); save();
  res.json({ character: characterView(req.user, c) });
}));
app.delete('/api/characters/:id', requireUser, (req, res) => {
  db.characters = db.characters.filter((c) => !(c.id === req.params.id && c.userId === req.user.id)); save();
  res.json({ ok: true });
});

// Signed public link for reference videos (needed by video-to-video providers).
app.get('/p/:fid/:sig', (req, res) => {
  const f = db.files.find((x) => x.id === req.params.fid && x.kind === 'video');
  if (!f || signFile(f.id) !== req.params.sig) return res.status(404).end();
  const remote = bucketUrl(filePath(f), { mime: f.mime, inline: true }); if (remote) return res.redirect(302, remote);
  res.type(f.mime).sendFile(filePath(f));
});

// ---------- billing ----------
app.get('/api/billing', requireUser, wrap(async (req, res) => {
  if (subsOn()) await syncUser(req.user, { force: false }).catch((e) => console.warn('Billing sync:', e.message));
  const ledger = db.ledger.filter((l) => l.userId === req.user.id).slice(-300).reverse();
  const spent30 = ledger.filter((l) => l.type === 'usage' && Date.now() - Date.parse(l.at) < 30 * 864e5).reduce((n, l) => n - l.credits, 0);
  res.json({ user: publicUser(req.user), ledger, spent30: round2(spent30), plans: PLANS, packs: PACKS, paymentMode: paymentMode(), subscriptions: subsOn() });
}));
app.post('/api/billing/checkout', requireUser, wrap(async (req, res) => {
  const offer = findOffer(req.body.offerId);
  if (!offer) return res.status(400).json({ error: 'Unknown plan or pack.' });
  if (subsOn() && offer.kind === 'plan') return res.json(await subscribe(req.user, offer));
  res.json(await startCheckout(req.user, offer));
}));
app.get('/api/billing/return', requireUser, wrap(async (req, res) => {
  let ok = true;
  try { await finishCheckout(req.user, String(req.query.session_id || '')); } catch (e) { ok = false; console.warn('Checkout return:', e.message); }
  res.redirect(subsOn() ? `/#/billing/${ok ? 'thanks' : 'check'}` : '/#/billing');
}));
// Plan management (switch FEATURE_SUBSCRIPTIONS)
const subsOnly = (req, res, next) => (subsOn() ? next() : res.status(404).json({ error: 'Not found.' }));
app.post('/api/billing/preview', requireUser, subsOnly, wrap(async (req, res) => res.json(await previewSwitch(req.user, planById(req.body.planId)))));
app.post('/api/billing/switch', requireUser, subsOnly, wrap(async (req, res) => { const r = await switchPlan(req.user, planById(req.body.planId), { prorationDate: Number(req.body.prorationDate) || 0 }); res.json({ ...r, user: publicUser(req.user) }); }));
app.post('/api/billing/cancel', requireUser, subsOnly, wrap(async (req, res) => { await setCancel(req.user, req.body.cancel !== false); res.json({ user: publicUser(req.user) }); }));
app.post('/api/billing/portal', requireUser, subsOnly, wrap(async (req, res) => res.json({ url: await portalUrl(req.user) })));
app.get('/api/billing/payments', requireUser, subsOnly, (req, res) => res.json({ payments: paymentHistory(req.user) }));
app.get('/api/billing/receipt/:id', requireUser, subsOnly, (req, res) => { const html = receiptHtml(req.user, req.params.id); if (!html) return res.status(404).send('Receipt not found.'); res.type('html').send(html); });
app.post('/api/billing/sync', requireUser, subsOnly, wrap(async (req, res) => { await syncUser(req.user); res.json({ user: publicUser(req.user) }); }));

// ---------- admin ----------
app.get('/api/admin/stats', requireUser, requireAdmin, (_req, res) => {
  const usage = db.ledger.filter((l) => l.type === 'usage');
  const apiCostUsd = usage.reduce((n, l) => n + (l.usd || 0), 0);
  const revenueUsd = db.payments.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amountUsd, 0);
  const byModel = {};
  for (const l of usage) if (l.model) { byModel[l.model] ??= { credits: 0, usd: 0, calls: 0 }; byModel[l.model].credits -= l.credits; byModel[l.model].usd += l.usd || 0; byModel[l.model].calls++; }
  res.json({ users: db.users.length, conversations: db.conversations.length, revenueUsd: round2(revenueUsd), apiCostUsd: Math.round(apiCostUsd * 1e4) / 1e4, creditsOutstanding: round2(db.users.reduce((n, u) => n + u.credits, 0)), byModel });
});

mountHealth(app, { requireUser, requireAdmin });
mountAdmin(app, { requireUser, requireAdmin, wrap });
app.get(/^\/(?!api\/|p\/|healthz$).*/, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(here, '..', 'public', 'index.html')));

const PORT = Number(process.env.PORT || 3000);
const server = serve(app); // already listening (server/handover.js), so a deploy never drops or loses requests
{
  console.log(`Scenly running at http://localhost:${PORT}`);
  const ff = ffmpegInfo();
  console.log(ff.ok ? `ffmpeg ${ff.version} found: video tools are ready` : 'ffmpeg was not found: video posters, previews and exports are off until it is installed ("brew install ffmpeg" on a Mac)');
  startJobs();
  startBillingSweep();
  startBucket();
  startBackups();
  checkSettings();
  if (subsOn()) console.log(`Subscriptions are on (${process.env.STRIPE_SECRET_KEY ? (/^sk_live_/.test(process.env.STRIPE_SECRET_KEY) ? 'Stripe LIVE mode' : 'Stripe test mode') : 'demo mode, no Stripe key'})`);
  if (!process.env.AICREDIT_API_KEY) console.warn('Warning: AICREDIT_API_KEY is not set. Copy .env.example to .env and add your key.');
  getCatalog().then((m) => console.log(`Loaded ${m.length} models`));
}

gracefulShutdown(server);
