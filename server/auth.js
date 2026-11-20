import crypto from 'node:crypto';
import db, { save, id, now } from './db.js';
import { grant, PRO_PATHS, hasProAccess, proPaused, balanceOf, walletView } from './credits.js';
import { subsOn, billingView } from './billing.js';
import { mailReady, baseUrl } from './mail.js';
import { sendEmail, notify, lowAtFor } from './emails.js';

const SESSION_DAYS = 30;
const COOKIE = 'pm_session';

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
/** Has this person ever paid (a plan or a credit pack)? Paid accounts unlock the full Design Library. */
// Banned accounts (set on the admin page) cannot sign in or use any signed-in route.
export const BANNED_MSG = 'This account has been suspended. Please contact support if you think this is a mistake.';
export const isAdminEmail = (email) => adminEmails().includes(String(email || '').toLowerCase());
export const isPaid = (u) => (u.plan && u.plan !== 'free') || db.payments.some((p) => p.userId === u.id && p.status === 'paid' && p.amountUsd > 0);

// Video Agent, Video Builder and Studio Pro (with Ad Studio, which runs on Studio Pro) are the Pro tools. They are
// open while the person has an active monthly plan or paid credits left (plan or top-up credits); the free
// starter credits do not open them. With no paid credits left they pause until a top-up or the next renewal.
// Admins always get in.
export const PAID_TOOL_PATHS = PRO_PATHS;
export const hasPaidPlan = (u) => !!u && (hasProAccess(u) || isAdminEmail(u.email));
// Mounted on PAID_TOOL_PATHS before the routes. Someone who is not signed in falls through to the route's own
// "Please sign in" answer; a signed-in person without a plan or paid credits is offered both and nothing runs.
export function paidPlanOnly(req, res, next) {
  const sess = db.sessions[req.cookies?.[COOKIE]];
  const user = sess && sess.expires >= Date.now() ? db.users.find((x) => x.id === sess.userId) : null;
  if (!user || hasPaidPlan(user)) return next();
  res.status(402).json({ error: 'Pro tools need a monthly plan or a top-up pack. Your free credits work in Chat, Image, Video Studio, Docs, Code and AI Apps.', code: 'paid_plan_required' });
}

export function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, plan: u.plan || 'free',
    credits: Math.round(balanceOf(u, { pro: false }) * 100) / 100,
    wallet: walletView(u), proPaused: proPaused(u) && hasPaidPlan(u) && !isAdminEmail(u.email),
    lowCreditAt: lowAtFor(u),
    isAdmin: adminEmails().includes(u.email),
    createdAt: u.createdAt,
    hasPassword: !!u.passHash, google: !!u.googleId, paid: isPaid(u), paidPlan: hasPaidPlan(u),
    styleFavs: u.styleFavs || [],
    ...(subsOn() ? { billing: billingView(u) } : {}),
  };
}

function startSession(res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[token] = { userId: user.id, expires: Date.now() + SESSION_DAYS * 864e5 };
  save();
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_DAYS * 864e5 });
}
function endSessions(user) {
  for (const [k, v] of Object.entries(db.sessions)) if (v.userId === user.id) delete db.sessions[k];
}

// Changes when the Terms of Use or Privacy Policy change; stored with each new account.
export const TERMS_VERSION = '2026-11-16';

const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const isProd = () => process.env.NODE_ENV === 'production';
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function setPassword(user, password) {
  user.salt = crypto.randomBytes(16).toString('hex');
  user.passHash = hash(password, user.salt);
}
function welcome(user) {
  if (user.welcomed || db.ledger.some((l) => l.userId === user.id && l.type === 'bonus')) return;
  user.welcomed = true;
  const bonus = Number(process.env.SIGNUP_BONUS_CREDITS ?? 1000);
  if (bonus > 0) grant(user, bonus, 'bonus', 'Free starter credits (Chat, Image, Video Studio, Docs, Code, AI Apps)');
  notify('welcome', user, { credits: bonus });
}
function newUser({ email, name, password, googleId, verified }) {
  const user = { id: id('u_'), email, name: name || email.split('@')[0], credits: 0, plan: 'free', createdAt: now(), acceptedTermsAt: now(), termsVersion: TERMS_VERSION, emailVerified: !!verified };
  if (password) setPassword(user, password);
  if (googleId) user.googleId = googleId;
  db.users.push(user);
  return user;
}
// The confirmation email carries a link (24 hours) and a 6-digit code (30 minutes, 5 tries) for the sign-up page.
const CODE_TRIES = 5;
const newCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
async function sendVerify(user) {
  const t = newToken(), code = newCode();
  user.verifyHash = tokenHash(t); user.verifyExpires = Date.now() + 24 * 3600e3; user.verifySentAt = Date.now();
  user.verifyCodeHash = tokenHash(user.id + ':' + code); user.verifyCodeExpires = Date.now() + 30 * 60e3; user.verifyCodeTries = 0;
  save();
  await sendEmail('verify', user, { url: `${baseUrl()}/api/auth/verify?token=${t}`, code });
}
function clearVerify(user) {
  user.emailVerified = true;
  delete user.verifyHash; delete user.verifyExpires; delete user.verifyCodeHash; delete user.verifyCodeExpires; delete user.verifyCodeTries;
}

export async function register(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim().slice(0, 60) || email.split('@')[0];
  const password = String(req.body.password || '');
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  let user = db.users.find((u) => u.email === email);
  if (user && user.emailVerified !== false) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
  if (user) { user.name = name; setPassword(user, password); } // signed up before but never confirmed: start again
  else user = newUser({ email, name, password, verified: !mailReady() });
  if (!mailReady()) {
    // No email service on this server: the account works straight away.
    welcome(user); startSession(res, user);
    return res.json({ user: publicUser(user) });
  }
  try { await sendVerify(user); } catch (e) { console.error('verify email failed:', e.message); return res.status(502).json({ error: 'We could not send the confirmation email. Check the address and try again.' }); }
  res.json({ pending: true, email });
}

export async function resend(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.users.find((u) => u.email === email);
  if (user && user.emailVerified === false && mailReady()) {
    if (Date.now() - (user.verifySentAt || 0) < 45e3) return res.status(429).json({ error: 'We just sent one. Give it a minute, and check your spam folder.' });
    try { await sendVerify(user); } catch (e) { console.error('verify email failed:', e.message); }
  }
  res.json({ ok: true });
}

export function verify(req, res) {
  const hsh = tokenHash(req.query.token || '');
  const user = db.users.find((u) => u.verifyHash && safeEq(u.verifyHash, hsh));
  if (!user || user.verifyExpires < Date.now()) return res.redirect('/?auth=verify_expired#/login');
  clearVerify(user);
  welcome(user); startSession(res, user);
  res.redirect('/?auth=verified');
}

// The same confirmation by typing the 6-digit code from the email.
export function verifyCode(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').replace(/\D/g, '');
  const user = db.users.find((u) => u.email === email);
  const bad = () => res.status(400).json({ error: 'That code is not right. Check the latest email, or press the button in it.', code: 'bad_code' });
  if (!user || user.emailVerified !== false || !user.verifyCodeHash || code.length !== 6) return bad();
  if (user.verifyCodeExpires < Date.now() || (user.verifyCodeTries || 0) >= CODE_TRIES) return res.status(400).json({ error: 'This code has expired. Send the email again to get a new one.', code: 'code_expired' });
  if (!safeEq(user.verifyCodeHash, tokenHash(user.id + ':' + code))) { user.verifyCodeTries = (user.verifyCodeTries || 0) + 1; save(); return bad(); }
  if (user.banned) return res.status(403).json({ error: BANNED_MSG, code: 'banned' });
  clearVerify(user);
  welcome(user); startSession(res, user);
  res.json({ user: publicUser(user) });
}

export function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.users.find((u) => u.email === email);
  if (user && !user.passHash && user.googleId) return res.status(401).json({ error: 'This account signs in with Google. Press "Continue with Google", or use "Forgot password?" to add a password.', code: 'google_only' });
  if (!user || !user.passHash || !safeEq(hash(String(req.body.password || ''), user.salt), user.passHash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  if (user.banned) return res.status(403).json({ error: BANNED_MSG, code: 'banned' });
  if (user.emailVerified === false) return res.status(403).json({ error: 'Confirm your email first. We sent a link to ' + user.email + '.', code: 'unverified' });
  startSession(res, user);
  res.json({ user: publicUser(user) });
}

export async function forgot(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!mailReady() && isProd()) return res.status(503).json({ error: 'Password reset by email is not available yet. Please contact support.' });
  const user = db.users.find((u) => u.email === email);
  let devLink;
  if (user && Date.now() - (user.resetSentAt || 0) > 30e3) {
    const t = newToken();
    user.resetHash = tokenHash(t); user.resetExpires = Date.now() + 3600e3; user.resetSentAt = Date.now();
    save();
    const url = `${baseUrl()}/#/reset/${t}`;
    try {
      const sent = await sendEmail('reset', user, { url });
      // On a computer with no email service the link is handed straight back, so reset still works locally.
      if (!sent && !isProd()) devLink = url;
    } catch (e) { console.error('reset email failed:', e.message); }
  }
  // Same answer whether or not the account exists, so nobody can test which emails have accounts.
  res.json({ ok: true, devLink });
}

export function reset(req, res) {
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const hsh = tokenHash(req.body.token || '');
  const user = db.users.find((u) => u.resetHash && safeEq(u.resetHash, hsh));
  if (!user || user.resetExpires < Date.now()) return res.status(400).json({ error: 'This reset link has expired or was already used. Ask for a new one.', code: 'expired' });
  const had = !!user.passHash;
  setPassword(user, password);
  delete user.resetHash; delete user.resetExpires;
  // Opening the link proves the inbox is theirs.
  if (user.emailVerified === false) clearVerify(user);
  welcome(user);
  endSessions(user); startSession(res, user);
  notify('password_changed', user, { created: !had });
  res.json({ user: publicUser(user) });
}

export function changePassword(req, res) {
  const user = req.user;
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
  if (user.passHash && !safeEq(hash(String(req.body.current || ''), user.salt), user.passHash)) return res.status(400).json({ error: 'Your current password is not right.' });
  const had = !!user.passHash;
  setPassword(user, password);
  // Other devices are signed out; this one stays in.
  const mine = req.cookies?.[COOKIE];
  for (const [k, v] of Object.entries(db.sessions)) if (v.userId === user.id && k !== mine) delete db.sessions[k];
  save();
  notify('password_changed', user, { created: !had });
  res.json({ user: publicUser(user), created: !had });
}

// ---------- Google sign-in (OAuth 2, no extra packages) ----------
export const googleReady = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const googleRedirect = () => `${baseUrl()}/api/auth/google/callback`;
export function googleStart(req, res) {
  if (!googleReady()) return res.redirect('/?auth=google_off#/login');
  const state = newToken();
  res.cookie('pm_oauth', state, { httpOnly: true, sameSite: 'lax', secure: isProd(), maxAge: 600e3 });
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirect(), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + q);
}
export async function googleCallback(req, res) {
  const fail = (why) => { console.warn('Google sign-in failed:', why); res.redirect('/?auth=google_failed#/login'); };
  try {
    const state = req.cookies?.pm_oauth;
    res.clearCookie('pm_oauth');
    if (!googleReady() || !req.query.code || !state || state !== req.query.state) return fail(req.query.error || 'state mismatch');
    const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: String(req.query.code), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirect(), grant_type: 'authorization_code' }), signal: AbortSignal.timeout(15000) });
    const tok = await tr.json();
    if (!tr.ok || !tok.access_token) return fail(tok.error_description || tok.error || 'no token');
    const ur = await fetch(process.env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15000) });
    const g = await ur.json();
    const email = String(g.email || '').toLowerCase();
    if (!ur.ok || !g.sub || !validEmail(email) || g.email_verified === false) return fail('no verified email');
    let user = db.users.find((u) => u.googleId === g.sub) || db.users.find((u) => u.email === email);
    if (!user) user = newUser({ email, name: String(g.name || '').slice(0, 60), googleId: g.sub, verified: true });
    // A sign-up with this address that was never confirmed may have been made by someone else: its password
    // must not open the account once the real owner arrives with Google.
    if (user.emailVerified === false && !user.googleId) { delete user.passHash; delete user.salt; endSessions(user); }
    user.googleId = g.sub;
    if (user.banned) return res.redirect('/?auth=banned#/login');
    if (user.emailVerified === false) clearVerify(user);
    welcome(user); startSession(res, user);
    res.redirect('/?auth=google');
  } catch (e) { fail(e.message); }
}

export function logout(req, res) {
  const token = req.cookies?.[COOKIE];
  if (token) { delete db.sessions[token]; save(); }
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}

export function parseCookies(req, _res, next) {
  // A cookie with a broken % sequence (set by anything else on this domain) must not fail the whole request.
  const dec = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
  req.cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, dec(v.join('='))]));
  next();
}

export function requireUser(req, res, next) {
  const s = db.sessions[req.cookies?.[COOKIE]];
  if (!s || s.expires < Date.now()) return res.status(401).json({ error: 'Please sign in.' });
  req.user = db.users.find((u) => u.id === s.userId);
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  if (req.user.banned) { endSessions(req.user); save(); res.clearCookie(COOKIE); return res.status(401).json({ error: BANNED_MSG, code: 'banned' }); }
  req.user.lastSeenAt = Date.now(); // for "last active" on the admin page (saved with the next change)
  next();
}

export function requireAdmin(req, res, next) {
  if (!adminEmails().includes(req.user.email)) return res.status(403).json({ error: 'Admins only.' });
  next();
}
