// Admin module: users, plans and subscriptions, usage by model and area, promo credits, bans,
// analytics and the gateway/model error log. Every route here needs an admin account (ADMIN_EMAILS).
// The older /api/admin/stats and /api/admin/health routes stay where they were (index.js, prod.js).
import crypto from 'node:crypto';
import db, { save, id, now } from './db.js';
import { PLANS, grant, round2, walletView } from './credits.js';
import { isAdminEmail, isPaid } from './auth.js';
import { subsOn, stripeReady, stripe, syncUser, setCancel, switchPlan, planById, ensurePrice, demoStart, notePlan, BillingError } from './billing.js';
import { KINDS as DOC_KINDS } from './docs/kinds/index.js';
import { flags } from './flags.js';
import { mailReady } from './mail.js';
import { CREDIT_USD, MARGIN_PCT, MASTER_DISCOUNT_PCT, markupFor, markupOf } from './credits.js';
import { getCatalog } from './catalog.js';

db.adminAudit ||= [];
const DAY = 864e5;
const LIVE = ['active', 'trialing', 'past_due'];
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const ms = (iso) => (iso ? Date.parse(iso) : 0);
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

// ---------- real money only ----------
// With a live Stripe key, revenue, MRR and "paying" count only money that really arrived. Payments made in demo
// mode or with a Stripe test key (before go-live, or on a laptop whose data was brought over) are kept in each
// person's history but left out of the totals. Each paid row is marked once, under the key that took it.
const liveStripe = () => /^sk_live_/.test(process.env.STRIPE_SECRET_KEY || '');
const keyTag = () => crypto.createHash('sha256').update(process.env.STRIPE_SECRET_KEY || 'demo').digest('hex').slice(0, 10); // same tag as server/billing.js
function markPayments() {
  if (!liveStripe()) return;
  const tag = keyTag(); let n = 0; const tags = new Map(db.users.map((u) => [u.id, u.stripeKeyTag]));
  for (const p of db.payments) if (p.status === 'paid' && p.live === undefined) { p.live = p.mode === 'stripe' && !/^cs_test_/.test(p.stripeSession || '') && tags.get(p.userId) === tag; n++; }
  if (n) save();
}
export const realPayment = (p) => p.status === 'paid' && (!liveStripe() || p.live === true);
const realSub = (u) => !liveStripe() || (!u.sub?.demo && u.stripeKeyTag === keyTag());
// What a spend cost at AICredit when the row carries no cost of its own (video holds, Video Builder, Studio Pro):
// the credits charged, turned back into dollars without the margin.
const costOf = (credits, model) => (credits * CREDIT_USD()) / markupOf(model || undefined);

// ---------- areas of the app (what a credit was spent on) ----------
export const AREAS = [
  { id: 'chat', label: 'Chat' }, { id: 'code', label: 'Code' }, { id: 'docs', label: 'Docs' },
  { id: 'image', label: 'Image' }, { id: 'video', label: 'Video' }, { id: 'agent', label: 'Video Agent' },
  { id: 'builder', label: 'Video Builder' }, { id: 'pro', label: 'Studio Pro' }, { id: 'apps', label: 'AI Apps' },
  { id: 'enhance', label: 'Prompt enhance' }, { id: 'other', label: 'Other' },
];
const DOC_LABELS = Object.values(DOC_KINDS).map((k) => k.label);
export function areaOf(l) {
  const v = l.via || '', d = l.desc || '';
  if (l.app || v.startsWith('/api/apps')) return 'apps';
  if (v.startsWith('/api/pro') || /^Studio Pro\b/.test(d)) return 'pro';
  if (v.startsWith('/api/agent') || /^Video Agent\b/.test(d)) return 'agent';
  if (v.startsWith('/api/builder') || /^Video Builder\b/.test(d)) return 'builder';
  if (v.startsWith('/api/docs') || DOC_LABELS.some((x) => d.startsWith(x + ' ·'))) return 'docs';
  if (v.startsWith('/api/code') || /^Code ·/.test(d)) return 'code';
  if (/^Chat ·/.test(d)) return 'chat';
  if (/^Prompt enhance/.test(d)) return 'enhance';
  if (/^Image\b/.test(d)) return 'image';
  if (/^Video\b/.test(d)) return 'video';
  return 'other';
}

// Older rows (and Video Builder scenes) name the model only in the description: "Video Builder scene · Seedance 2.5 (reserved)".
const nameIn = (d) => { const m = /^(?:Video Builder scene|Video \(reserved\)|Video settle|Image(?: ×\d+)?|Chat|Code) · ([^:]+?)(?: \(reserved\))?(?::.*)?$/.exec(String(d || '')); return m ? m[1].trim() : null; };
/** Every spend row (usage and refunds, netted), with its area and model. Refunds take the area of what they refund. */
function spendRows() {
  markPayments();
  const byHold = new Map(), byTask = new Map();
  for (const l of db.ledger) if (l.type === 'usage') {
    const a = { area: areaOf(l), model: l.model || nameIn(l.desc), est: !(l.usd > 0) };
    if (l.holdId && !byHold.has(l.holdId)) byHold.set(l.holdId, a);
    if (l.taskId && !byTask.has(l.taskId)) byTask.set(l.taskId, a);
  }
  const out = [];
  for (const l of db.ledger) {
    if (l.type !== 'usage' && l.type !== 'refund') continue;
    const linked = (l.holdId && byHold.get(l.holdId)) || (l.taskId && byTask.get(l.taskId)) || null;
    const area = l.type === 'usage' && !linked ? areaOf(l) : linked?.area || areaOf(l);
    const model = l.model || linked?.model || nameIn(l.desc);
    // Cost: the gateway's own figure when the row has one; otherwise worked out from the credits. A refund takes
    // back the estimated cost of what it refunds (a job that failed cost nothing).
    const est = l.type === 'usage' ? !(l.usd > 0) : !!linked?.est;
    const usd = l.type === 'usage' ? (est ? costOf(-l.credits, model) : l.usd) : est ? costOf(-l.credits, model) : 0;
    out.push({ userId: l.userId, t: ms(l.at), credits: -l.credits, usd, usdEst: est ? usd : 0, area, model });
  }
  return out;
}
function sumBy(rows, key) {
  const m = {};
  for (const r of rows) { const k = r[key] || 'unknown'; m[k] ??= { credits: 0, usd: 0, calls: 0 }; m[k].credits += r.credits; m[k].usd += r.usd; if (r.credits > 0) m[k].calls++; }
  for (const v of Object.values(m)) { v.credits = round2(v.credits); v.usd = r4(v.usd); }
  return m;
}

// ---------- people ----------
/** free · upgraded · downgraded · cancelling · cancelled · paused · past_due (and banned, shown beside it). */
export function userStatus(u) {
  const s = u.sub;
  if (s && LIVE.includes(s.status) && u.plan !== 'free') {
    if (s.status === 'past_due') return 'past_due';
    if (s.paused) return 'paused';
    if (s.cancelAtPeriodEnd) return 'cancelling';
    const last = [...(u.planHistory || [])].reverse().find((x) => x.to === u.plan);
    return last?.kind === 'downgraded' ? 'downgraded' : 'upgraded';
  }
  if (u.plan && u.plan !== 'free') return 'upgraded'; // a plan set before subscriptions (packs era) or by hand
  if (u.everSubscribed || (s && !LIVE.includes(s.status))) return 'cancelled';
  return 'free';
}
function upgradeDates(u) {
  const hist = (u.planHistory || []).filter((x) => x.kind === 'subscribed' || x.kind === 'upgraded').map((x) => x.at);
  const pays = db.payments.filter((p) => p.userId === u.id && p.status === 'paid' && p.kind === 'subscription' && p.reason !== 'subscription_cycle').map((p) => p.paidAt || p.createdAt);
  const all = [...hist, ...pays].filter(Boolean).sort();
  return { first: all[0] || null, last: all[all.length - 1] || null };
}
function lastActive(u, rows) {
  let t = u.lastSeenAt || 0;
  for (const r of rows) if (r.t > t) t = r.t;
  return t ? new Date(t).toISOString() : null;
}
function userRow(u, rows) {
  const mine = rows.filter((r) => r.userId === u.id);
  const cut = Date.now() - 30 * DAY;
  const up = upgradeDates(u);
  return {
    id: u.id, email: u.email, name: u.name, plan: u.plan || 'free', planName: planById(u.plan)?.name || 'Free',
    status: userStatus(u), banned: !!u.banned, admin: isAdminEmail(u.email),
    createdAt: u.createdAt, upgradedAt: up.first, lastUpgradeAt: up.last, lastActive: lastActive(u, mine),
    credits: round2(u.credits || 0), used: round2(mine.reduce((n, r) => n + r.credits, 0)), used30: round2(mine.filter((r) => r.t >= cut).reduce((n, r) => n + r.credits, 0)),
    apiUsd: r4(mine.reduce((n, r) => n + r.usd, 0)),
    paidUsd: round2(db.payments.filter((p) => p.userId === u.id && realPayment(p)).reduce((n, p) => n + (p.amountUsd || 0), 0)),
    testUsd: round2(db.payments.filter((p) => p.userId === u.id && p.status === 'paid' && !realPayment(p)).reduce((n, p) => n + (p.amountUsd || 0), 0)),
    testPlan: !!(u.sub && LIVE.includes(u.sub.status) && u.plan !== 'free' && !realSub(u)),
    signIn: u.googleId ? (u.passHash ? 'google+password' : 'google') : 'password', verified: u.emailVerified !== false,
    renewsAt: u.sub && LIVE.includes(u.sub.status) && !u.sub.cancelAtPeriodEnd ? u.sub.currentPeriodEnd : null,
    endsAt: u.sub?.cancelAtPeriodEnd ? u.sub.cancelAt || u.sub.currentPeriodEnd : null,
    billing: u.sub ? (u.sub.demo ? 'demo' : 'stripe') : null,
  };
}

function userDetail(u) {
  const rows = spendRows().filter((r) => r.userId === u.id);
  const ledger = db.ledger.filter((l) => l.userId === u.id).slice(-200).reverse().map((l) => ({ at: l.at, type: l.type, credits: l.credits, balance: l.balance, desc: l.desc, model: l.model || null, area: l.type === 'usage' ? areaOf(l) : null }));
  const byArea = sumBy(rows, 'area'), byModel = sumBy(rows, 'model');
  return {
    user: userRow(u, rows),
    sub: u.sub || null, card: u.card || null, stripeCustomer: u.stripeCustomerId || null, openInvoices: u.openInvoices || [],
    planHistory: [...(u.planHistory || [])].reverse(),
    payments: db.payments.filter((p) => p.userId === u.id && p.status === 'paid').map((p) => ({ at: p.paidAt || p.createdAt, kind: p.kind, reason: p.reason || null, offer: p.offerId, amountUsd: p.amountUsd, credits: p.credits || 0, mode: realPayment(p) ? p.mode : p.mode === 'demo' ? 'demo' : 'test', number: p.invoiceNumber || null })).reverse(),
    byArea: AREAS.map((a) => ({ ...a, ...(byArea[a.id] || { credits: 0, usd: 0, calls: 0 }) })).filter((a) => a.credits || a.calls),
    byModel: Object.entries(byModel).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.credits - a.credits),
    ledger,
    failures: db.monitor.failures.filter((f) => f.userId === u.id).slice(-50).reverse(),
    counts: { chats: db.conversations.filter((c) => c.userId === u.id).length, generations: db.generations.filter((g) => g.userId === u.id).length, files: db.files.filter((f) => f.userId === u.id).length, sessions: Object.values(db.sessions).filter((s) => s.userId === u.id && s.expires > Date.now()).length },
    ban: u.banned ? { at: u.bannedAt, reason: u.banReason || '', by: u.bannedBy || '' } : null,
    audit: db.adminAudit.filter((a) => a.userId === u.id).slice(-50).reverse(),
    paidEver: isPaid(u),
    wallet: walletView(u),
    note: u.adminNote || '',
  };
}

// ---------- analytics ----------
function overview(days) {
  const t = Date.now(), cut = t - days * DAY, prevCut = cut - days * DAY;
  const rows = spendRows();
  const inRange = rows.filter((r) => r.t >= cut);
  markPayments();
  const paid = db.payments.filter(realPayment);
  const testPaid = db.payments.filter((p) => p.status === 'paid' && !realPayment(p));
  const payT = (p) => ms(p.paidAt || p.createdAt);
  const series = {};
  for (let d = 0; d < days; d++) series[dayKey(cut + (d + 1) * DAY)] = { signups: 0, revenue: 0, credits: 0, usd: 0, active: new Set(), areas: {} };
  for (const u of db.users) { const k = dayKey(ms(u.createdAt)); if (series[k]) series[k].signups++; }
  for (const p of paid) { const k = dayKey(payT(p)); if (series[k]) series[k].revenue += p.amountUsd || 0; }
  for (const r of inRange) { const s = series[dayKey(r.t)]; if (!s) continue; s.credits += r.credits; s.usd += r.usd; s.active.add(r.userId); s.areas[r.area] = (s.areas[r.area] || 0) + r.credits; }
  const statuses = {}, plans = {};
  for (const u of db.users) { const st = userStatus(u); statuses[st] = (statuses[st] || 0) + 1; plans[u.plan || 'free'] = (plans[u.plan || 'free'] || 0) + 1; }
  const subscribed = db.users.filter((u) => u.sub && LIVE.includes(u.sub.status) && !u.sub.paused && u.plan !== 'free');
  const live = subscribed.filter(realSub);
  const mrr = live.reduce((n, u) => n + (planById(u.plan)?.priceUsd || 0), 0);
  const rev = (a, b) => round2(paid.filter((p) => payT(p) >= a && payT(p) < b).reduce((n, p) => n + (p.amountUsd || 0), 0));
  const creditsIn = (a, b) => round2(rows.filter((r) => r.t >= a && r.t < b).reduce((n, r) => n + r.credits, 0));
  const usdIn = (a, b) => r4(rows.filter((r) => r.t >= a && r.t < b).reduce((n, r) => n + r.usd, 0));
  const apiUsdEst = r4(inRange.reduce((n, r) => n + r.usdEst, 0));
  const active = (a) => new Set(rows.filter((r) => r.t >= a).map((r) => r.userId)).size;
  const calls = db.monitor.calls.filter((c) => c.t >= t - DAY);
  const byArea = sumBy(inRange, 'area'), byModel = sumBy(inRange, 'model');
  const creditUsd = CREDIT_USD();
  const charged = creditsIn(cut, t + 1);
  const apiUsd = usdIn(cut, t + 1);
  return {
    days,
    kpis: {
      users: db.users.length, newUsers: db.users.filter((u) => ms(u.createdAt) >= cut).length, newUsersPrev: db.users.filter((u) => ms(u.createdAt) >= prevCut && ms(u.createdAt) < cut).length,
      paying: live.length, mrr: round2(mrr), revenue: rev(cut, t + 1), revenuePrev: rev(prevCut, cut), revenueAll: round2(paid.reduce((n, p) => n + (p.amountUsd || 0), 0)),
      testRevenue: round2(testPaid.reduce((n, p) => n + (p.amountUsd || 0), 0)), testPaying: subscribed.length - live.length, apiUsdEst,
      creditsCharged: charged, creditsChargedPrev: creditsIn(prevCut, cut), apiUsd, chargedUsd: round2(charged * creditUsd),
      margin: charged * creditUsd > 0 ? Math.round((1 - apiUsd / (charged * creditUsd)) * 1000) / 10 : null,
      creditsOutstanding: round2(db.users.reduce((n, u) => n + (u.credits || 0), 0)),
      active7: active(t - 7 * DAY), active30: active(t - 30 * DAY), banned: db.users.filter((u) => u.banned).length,
      calls24: calls.length, fails24: calls.filter((c) => !c.ok).length,
    },
    series: Object.entries(series).map(([day, s]) => ({ day, signups: s.signups, revenue: round2(s.revenue), credits: round2(s.credits), usd: r4(s.usd), active: s.active.size, areas: Object.fromEntries(Object.entries(s.areas).map(([k, v]) => [k, round2(v)])) })),
    statuses, plans: PLANS.map((p) => ({ id: p.id, name: p.name, users: plans[p.id] || 0, priceUsd: p.priceUsd })),
    byArea: AREAS.map((a) => ({ ...a, ...(byArea[a.id] || { credits: 0, usd: 0, calls: 0 }) })),
    byModel: Object.entries(byModel).map(([model, v]) => ({ model, ...v })).sort((a, b) => b.credits - a.credits).slice(0, 25),
    topUsers: db.users.map((u) => ({ id: u.id, email: u.email, plan: u.plan || 'free', credits: round2(inRange.filter((r) => r.userId === u.id).reduce((n, r) => n + r.credits, 0)) })).filter((x) => x.credits > 0).sort((a, b) => b.credits - a.credits).slice(0, 10),
  };
}

// ---------- error log and performance ----------
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
function perf(calls, key) {
  const m = new Map();
  for (const c of calls) { const k = c[key] || '(none)'; if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
  return [...m].map(([k, list]) => {
    const okMs = list.filter((c) => c.ok).map((c) => c.ms);
    const fails = list.filter((c) => !c.ok).length;
    return { key: k, calls: list.length, fails, failRate: Math.round((fails / list.length) * 1000) / 10, avgMs: okMs.length ? Math.round(okMs.reduce((a, b) => a + b, 0) / okMs.length) : null, p50: pct(okMs, 50), p95: pct(okMs, 95), last: new Date(Math.max(...list.map((c) => c.t))).toISOString() };
  }).sort((a, b) => b.calls - a.calls);
}
const reasonKey = (r) => String(r || '').replace(/(request[ _-]?id|req_?id|task)[:=\s]*[\w-]+/gi, '$1 …').replace(/\b[0-9a-f]{12,}\b/gi, '…').replace(/\d{2,}/g, '#').slice(0, 140);
function jobFailures(cut) {
  return db.jobs.filter((j) => j.status === 'failed' && ms(j.endedAt || j.createdAt) >= cut).map((j) => ({
    at: j.endedAt || j.createdAt, kind: 'job', model: j.payload?.modelId || null, path: `job: ${j.type}`, via: null, status: null, code: j.type,
    reason: [...new Set([j.error, ...(j.log || []).slice(-2).map((x) => String(x).replace(/^\S+Z\s+(try \d+ failed:\s*)?/, ''))].filter(Boolean))].join(' | ').slice(0, 600), userId: j.userId,
  }));
}
function errors({ days = 7, kind = '', model = '', q = '' }) {
  const cut = Date.now() - days * DAY;
  const users = new Map(db.users.map((u) => [u.id, u.email]));
  let list = [...db.monitor.failures.filter((f) => ms(f.at) >= cut), ...jobFailures(cut)];
  const kinds = {}; for (const f of list) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
  if (kind) list = list.filter((f) => f.kind === kind);
  if (model) list = list.filter((f) => f.model === model);
  if (q) { const s = q.toLowerCase(); list = list.filter((f) => `${f.reason} ${f.model} ${f.path} ${f.via} ${users.get(f.userId) || ''}`.toLowerCase().includes(s)); }
  list.sort((a, b) => ms(b.at) - ms(a.at));
  const reasons = new Map();
  for (const f of list) { const k = `${f.kind}|${reasonKey(f.reason)}`; const r = reasons.get(k) || { kind: f.kind, reason: reasonKey(f.reason), count: 0, models: new Set(), last: f.at }; r.count++; if (f.model) r.models.add(f.model); reasons.set(k, r); }
  const calls = db.monitor.calls.filter((c) => c.t >= cut);
  return {
    days, kinds, total: list.length,
    failures: list.slice(0, 400).map((f) => ({ ...f, email: users.get(f.userId) || null })),
    topReasons: [...reasons.values()].sort((a, b) => b.count - a.count).slice(0, 15).map((r) => ({ ...r, models: [...r.models].slice(0, 5) })),
    byModel: perf(calls, 'm'), byEndpoint: perf(calls, 'p'),
    calls: calls.length, since: db.monitor.calls[0] ? new Date(db.monitor.calls[0].t).toISOString() : null,
    models: [...new Set([...db.monitor.failures.map((f) => f.model), ...calls.map((c) => c.m)].filter(Boolean))].sort(),
  };
}

// ---------- subscription actions ----------
async function subAction(user, action, planId) {
  if (!subsOn()) throw new BillingError('Subscriptions are switched off on this server (FEATURE_SUBSCRIPTIONS).', 409);
  if (!['restart', 'change', 'start'].includes(action)) await syncUser(user).catch(() => {});
  const s = user.sub;
  const live = s && LIVE.includes(s.status) && user.plan !== 'free';
  const stripeSub = live && !s.demo && stripeReady();
  const need = () => { if (!live) throw new BillingError('This person has no active paid plan.', 409); };
  switch (action) {
    case 'pause': need();
      if (s.paused) throw new BillingError('The plan is already paused.', 409);
      if (stripeSub) await stripe('/subscriptions/' + encodeURIComponent(s.id), { pause_collection: { behavior: 'void' } });
      else s.paused = true;
      break;
    case 'resume': need();
      if (!s.paused) throw new BillingError('The plan is not paused.', 409);
      if (stripeSub) await stripe('/subscriptions/' + encodeURIComponent(s.id), { pause_collection: '' });
      else s.paused = false;
      break;
    case 'cancel_end': need(); await setCancel(user, true); break;
    case 'uncancel': need(); await setCancel(user, false); break;
    case 'cancel_now': {
      need();
      const before = user.plan;
      if (stripeSub) await stripe('/subscriptions/' + encodeURIComponent(s.id), null, 'DELETE');
      else { s.status = 'canceled'; user.plan = 'free'; notePlan(user, before); }
      break;
    }
    case 'change': need(); await switchPlan(user, planById(planId)); break;
    case 'restart': case 'start': {
      if (live) throw new BillingError('This person already has an active plan.', 409);
      const plan = planById(planId || s?.planId);
      if (!plan || !(plan.priceUsd > 0)) throw new BillingError('Choose a paid plan to start.');
      if (!stripeReady()) { demoStart(user, plan); break; }
      if (!user.stripeCustomerId) throw new BillingError('This person has no Stripe customer yet. They need to choose a plan on their Billing page once, with their card.', 409);
      const pms = await stripe('/payment_methods', { customer: user.stripeCustomerId, type: 'card', limit: 1 }, 'GET');
      const pm = pms.data?.[0]?.id;
      if (!pm) throw new BillingError('No saved card for this person. They need to subscribe again from their Billing page.', 409);
      await stripe('/subscriptions', { customer: user.stripeCustomerId, items: [{ price: await ensurePrice(plan) }], default_payment_method: pm, payment_behavior: 'error_if_incomplete', metadata: { userId: user.id, plan: plan.id, by: 'admin' } }, 'POST', { idem: `pm-admin-restart-${user.id}-${plan.id}-${Math.floor(Date.now() / 60000)}` });
      break;
    }
    default: throw new BillingError('Unknown action.');
  }
  save();
  if (stripeReady() && user.stripeCustomerId) await syncUser(user).catch((e) => console.warn('Admin sync:', e.message));
  return user.sub;
}

// ---------- routes ----------
function audit(req, user, action, detail = {}) {
  db.adminAudit.push({ id: id('a_'), at: now(), adminId: req.user.id, admin: req.user.email, userId: user?.id || null, email: user?.email || null, action, detail });
  if (db.adminAudit.length > 3000) db.adminAudit.splice(0, db.adminAudit.length - 3000);
  save();
}
const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function mountAdmin(app, { requireUser, requireAdmin, wrap }) {
  const A = [requireUser, requireAdmin];
  const findUser = (req, res) => { const u = db.users.find((x) => x.id === req.params.id); if (!u) res.status(404).json({ error: 'No such user.' }); return u; };

  app.get('/api/admin/overview', ...A, (req, res) => res.json(overview(Math.min(365, Math.max(7, Number(req.query.days) || 30)))));

  app.get('/api/admin/users', ...A, (req, res) => {
    const rows = spendRows();
    let list = db.users.map((u) => userRow(u, rows));
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q) list = list.filter((u) => `${u.email} ${u.name} ${u.id}`.toLowerCase().includes(q));
    if (req.query.status) list = list.filter((u) => (req.query.status === 'banned' ? u.banned : u.status === req.query.status));
    if (req.query.plan) list = list.filter((u) => u.plan === req.query.plan);
    const sort = String(req.query.sort || 'createdAt');
    const key = { createdAt: (u) => ms(u.createdAt), lastActive: (u) => ms(u.lastActive), used: (u) => u.used, used30: (u) => u.used30, credits: (u) => u.credits, paid: (u) => u.paidUsd, email: (u) => u.email }[sort] || ((u) => ms(u.createdAt));
    list.sort((a, b) => (sort === 'email' ? String(key(a)).localeCompare(String(key(b))) : key(b) - key(a)));
    res.json({ users: list, total: db.users.length, plans: PLANS.map((p) => ({ id: p.id, name: p.name, priceUsd: p.priceUsd })) });
  });

  app.get('/api/admin/users.csv', ...A, (_req, res) => {
    const rows = spendRows();
    const cols = ['id', 'email', 'name', 'planName', 'status', 'banned', 'createdAt', 'upgradedAt', 'lastActive', 'credits', 'used', 'used30', 'apiUsd', 'paidUsd', 'signIn', 'verified'];
    const body = [cols.join(','), ...db.users.map((u) => userRow(u, rows)).map((r) => cols.map((c) => csv(r[c])).join(','))].join('\n');
    res.type('text/csv').set('Content-Disposition', `attachment; filename="scenly-users-${dayKey(Date.now())}.csv"`).send(body);
  });

  app.get('/api/admin/users/:id', ...A, (req, res) => { const u = findUser(req, res); if (u) res.json({ ...userDetail(u), plans: PLANS.map((p) => ({ id: p.id, name: p.name, priceUsd: p.priceUsd })), subscriptions: subsOn(), stripe: stripeReady() ? (/^sk_live_/.test(process.env.STRIPE_SECRET_KEY) ? 'live' : 'test') : 'demo' }); });

  app.post('/api/admin/users/:id/credits', ...A, (req, res) => {
    const u = findUser(req, res); if (!u) return;
    const amount = round2(Number(req.body.amount));
    const note = String(req.body.note || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e6) return res.status(400).json({ error: 'Enter a number of credits (up to 1,000,000; use a minus sign to take credits away).' });
    if (amount < 0 && (u.credits || 0) + amount < 0) return res.status(400).json({ error: `This would take the balance below zero (it is ${round2(u.credits || 0)}).` });
    // paid: added as top-up credits (90 days, every tool including the Pro tools); otherwise free credits (standard tools, no expiry).
    const paid = amount > 0 && !!req.body.paid;
    grant(u, amount, amount > 0 ? 'promo' : 'adjust', amount > 0 ? `${paid ? 'Promo top-up credits (90 days)' : 'Promo credits'}${note ? ': ' + note : ''}` : `Credits removed by Scenly${note ? ': ' + note : ''}`, { by: req.user.id, paid });
    audit(req, u, amount > 0 ? (paid ? 'promo_paid_credits' : 'promo_credits') : 'remove_credits', { amount, note });
    res.json({ ok: true, credits: round2(u.credits) });
  });

  app.post('/api/admin/users/:id/ban', ...A, (req, res) => {
    const u = findUser(req, res); if (!u) return;
    const ban = req.body.banned !== false;
    if (ban && (isAdminEmail(u.email) || u.id === req.user.id)) return res.status(400).json({ error: 'Admin accounts cannot be banned. Remove the email from ADMIN_EMAILS first.' });
    if (ban) {
      u.banned = true; u.bannedAt = now(); u.bannedBy = req.user.email; u.banReason = String(req.body.reason || '').trim().slice(0, 200);
      for (const [k, s] of Object.entries(db.sessions)) if (s.userId === u.id) delete db.sessions[k]; // signed out everywhere at once
    } else { delete u.banned; delete u.bannedAt; delete u.bannedBy; delete u.banReason; }
    save(); audit(req, u, ban ? 'ban' : 'unban', ban ? { reason: u.banReason } : {});
    res.json({ ok: true, banned: !!u.banned });
  });

  app.post('/api/admin/users/:id/signout', ...A, (req, res) => {
    const u = findUser(req, res); if (!u) return;
    let n = 0; for (const [k, s] of Object.entries(db.sessions)) if (s.userId === u.id && k !== req.cookies?.pm_session) { delete db.sessions[k]; n++; }
    save(); audit(req, u, 'sign_out', { sessions: n });
    res.json({ ok: true, ended: n });
  });

  app.post('/api/admin/users/:id/verify', ...A, (req, res) => {
    const u = findUser(req, res); if (!u) return;
    u.emailVerified = true; delete u.verifyHash; delete u.verifyExpires; save(); audit(req, u, 'verify_email');
    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/subscription', ...A, wrap(async (req, res) => {
    const u = findUser(req, res); if (!u) return;
    const action = String(req.body.action || '');
    const before = { plan: u.plan, status: u.sub?.status, paused: !!u.sub?.paused, cancelAtPeriodEnd: !!u.sub?.cancelAtPeriodEnd };
    await subAction(u, action, req.body.planId);
    audit(req, u, 'subscription_' + action, { before, after: { plan: u.plan, status: u.sub?.status, paused: !!u.sub?.paused, cancelAtPeriodEnd: !!u.sub?.cancelAtPeriodEnd }, planId: req.body.planId || null });
    res.json({ ok: true, ...userDetail(u) });
  }));

  app.post('/api/admin/users/:id/sync', ...A, wrap(async (req, res) => { const u = findUser(req, res); if (!u) return; await syncUser(u); res.json(userDetail(u)); }));

  app.post('/api/admin/users/:id/note', ...A, (req, res) => {
    const u = findUser(req, res); if (!u) return;
    u.adminNote = String(req.body.note || '').slice(0, 1000); save(); audit(req, u, 'note');
    res.json({ ok: true });
  });

  app.get('/api/admin/usage', ...A, (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30)); const cut = Date.now() - days * DAY;
    const rows = spendRows().filter((r) => r.t >= cut);
    const emails = new Map(db.users.map((u) => [u.id, u.email]));
    // A grid: one row per person, one column per area, plus their top models.
    const grid = new Map();
    for (const r of rows) {
      const g = grid.get(r.userId) || { userId: r.userId, email: emails.get(r.userId) || r.userId, total: 0, usd: 0, areas: {}, models: {} };
      g.total += r.credits; g.usd += r.usd; g.areas[r.area] = (g.areas[r.area] || 0) + r.credits; if (r.model) g.models[r.model] = (g.models[r.model] || 0) + r.credits;
      grid.set(r.userId, g);
    }
    const users = [...grid.values()].map((g) => ({ ...g, total: round2(g.total), usd: r4(g.usd), credits: round2(db.users.find((u) => u.id === g.userId)?.credits || 0), areas: Object.fromEntries(Object.entries(g.areas).map(([k, v]) => [k, round2(v)])), models: Object.entries(g.models).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, c]) => ({ model: m, credits: round2(c) })) })).sort((a, b) => b.total - a.total);
    // Model × area, for "which models does each part of the app use".
    const mx = {};
    for (const r of rows) { const k = r.model || 'unknown'; mx[k] ??= { model: k, total: 0, usd: 0, calls: 0, areas: {} }; mx[k].total += r.credits; mx[k].usd += r.usd; if (r.credits > 0) mx[k].calls++; mx[k].areas[r.area] = round2((mx[k].areas[r.area] || 0) + r.credits); }
    res.json({ days, areas: AREAS, users, models: Object.values(mx).map((m) => ({ ...m, total: round2(m.total), usd: r4(m.usd) })).sort((a, b) => b.total - a.total) });
  });

  app.get('/api/admin/errors', ...A, (req, res) => res.json(errors({ days: Math.min(90, Math.max(1, Number(req.query.days) || 7)), kind: String(req.query.kind || ''), model: String(req.query.model || ''), q: String(req.query.q || '').slice(0, 100) })));
  app.post('/api/admin/errors/clear', ...A, (req, res) => { const n = db.monitor.failures.length; db.monitor.failures = []; save(); audit(req, null, 'clear_error_log', { removed: n }); res.json({ ok: true, removed: n }); });

  app.get('/api/admin/audit', ...A, (_req, res) => res.json({ audit: db.adminAudit.slice(-300).reverse() }));

  // What every model costs and what users pay for it, one typical unit each: a chat message (1,500 tokens in,
  // 700 out), one image, or one second of video. official = the maker's own price; aicredit = the listed
  // AICredit price (official less its discount); cost = what Scenly really pays (listed less the master
  // discount on the account); charged = what the user pays in credits, as dollars.
  app.get('/api/admin/pricing', ...A, async (_req, res, next) => {
    try {
      const master = 1 - MASTER_DISCOUNT_PCT() / 100, r6 = (n) => Math.round(n * 1e6) / 1e6;
      const rows = [];
      for (const m of await getCatalog()) {
        const disc = 1 - (m.discountPct || 0) / 100; let unit, aicredit;
        if (m.type === 'chat') { unit = 'message'; aicredit = (1500 * (m.price.inPerM || 0) + 700 * (m.price.outPerM || 0)) / 1e6; }
        else if (m.type === 'image') { unit = 'image'; aicredit = m.price.usdPerImage || 0; }
        else { const r = m.price.usdPerSecond?.['720p'] != null ? '720p' : Object.keys(m.price.usdPerSecond || {})[0]; unit = `second (${r})`; aicredit = m.price.usdPerSecond?.[r] || 0; }
        if (!(aicredit > 0)) continue;
        const markup = markupFor(m.discountPct), charged = aicredit * markup, cost = aicredit * master;
        rows.push({ id: m.id, name: m.name, type: m.type, unit, discountPct: m.discountPct || 0, official: r6(disc > 0 ? aicredit / disc : aicredit), aicredit: r6(aicredit), cost: r6(cost), charged: r6(charged),
          credits: r6(charged / CREDIT_USD()), markupPct: Math.round((markup - 1) * 1000) / 10, marginPct: Math.round((1 - cost / charged) * 1000) / 10, aboveOfficial: disc >= 1 });
      }
      res.json({ marginPct: MARGIN_PCT(), masterDiscountPct: MASTER_DISCOUNT_PCT(), creditUsd: CREDIT_USD(), models: rows });
    } catch (e) { next(e); }
  });

  app.get('/api/admin/settings', ...A, (_req, res) => {
    const e = process.env;
    res.json({
      flags: flags(), subscriptions: subsOn(), stripe: stripeReady() ? (/^sk_live_/.test(e.STRIPE_SECRET_KEY) ? 'live' : 'test') : 'demo', webhook: !!e.STRIPE_WEBHOOK_SECRET,
      mail: mailReady(), google: !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET), env: e.NODE_ENV || 'development', publicUrl: e.PUBLIC_URL || null,
      pricing: { creditUsd: CREDIT_USD(), marginPct: MARGIN_PCT(), masterDiscountPct: MASTER_DISCOUNT_PCT(), signupBonus: Number(e.SIGNUP_BONUS_CREDITS ?? 1000) },
      admins: (e.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean),
      gateway: (e.AICREDIT_BASE_URL || 'https://aicreditapi.com/api/v1'), gatewayKey: !!e.AICREDIT_API_KEY,
      plans: PLANS,
    });
  });
}
