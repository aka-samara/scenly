import db, { save, id, now } from './db.js';
import { currentVia, ctx } from './monitor.js';
import { checkBalance, purchaseReceipt, creditsExpiring } from './emails.js';
import * as W from './wallet.js';

// One credit is a tenth of a US cent: $1 = 1,000 credits.
export const CREDIT_USD = () => Number(process.env.CREDIT_USD || 0.001);
// A number of US cents as credits, for the few fixed amounts in the code (small minimums and caps).
export const centsToCredits = (cents) => (Number(cents) * 0.01) / CREDIT_USD();
// Margin on top of what AICredit charges (its discounted price). Default 5%.
export const MARGIN_PCT = () => { const v = Number(process.env.MARGIN_PCT ?? 5); return Number.isFinite(v) && v >= 0 ? v : 5; };

// Extra discount AICredit gives this account on top of its listed prices. It lowers what Scenly pays, never what
// users pay; the admin console uses it to show the real cost and margin.
export const MASTER_DISCOUNT_PCT = () => { const v = Number(process.env.AICREDIT_MASTER_DISCOUNT_PCT ?? 0); return Number.isFinite(v) && v >= 0 && v < 100 ? v : 0; };

// The multiplier for one model. AICredit price x (1 + margin), unless that would cost more than the
// model's official price: then the AICredit price is charged with no margin at all.
// discountPct is AICredit's discount off the official price (0 to 100).
export function markupFor(discountPct) {
  const m = 1 + MARGIN_PCT() / 100;
  const d = Math.min(100, Math.max(0, Number(discountPct) || 0)) / 100;
  return (1 - d) * m <= 1 + 1e-9 ? m : 1;
}

// Model id -> AICredit discount, filled by the catalog each time it loads, so a charge only needs the model.
const discounts = new Map();
export const setDiscounts = (models) => { discounts.clear(); for (const m of models) discounts.set(m.id, Number(m.discountPct) || 0); };
// model: a catalog model, a model id or a number (discount %). Unknown models get the plain margin.
export function markupOf(model) {
  if (typeof model === 'number') return markupFor(model);
  if (model && typeof model === 'object' && model.discountPct != null) return markupFor(model.discountPct);
  const mid = typeof model === 'string' ? model : model?.id;
  return mid && discounts.has(mid) ? markupFor(discounts.get(mid)) : 1 + MARGIN_PCT() / 100;
}
// Kept for code that still asks for one number: the margin multiplier most models get.
export const MARKUP = () => 1 + MARGIN_PCT() / 100;

// Turn a real AICredit charge (USD, already discounted) into user credits for that model.
export const usdToCredits = (usd, model) => (Number(usd) * markupOf(model)) / CREDIT_USD();
export const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 1e4) / 1e4; // balances keep sub-cent precision

// Plans mirror the familiar Free / Pro / Max ladder. Monthly plans grant their credits each billing cycle and
// unused plan credits expire at renewal (no rollover). Packs are one-time top-ups valid 90 days from purchase.
// Every offer sells credits at face value ($1 = 1,000 credits, no bonus credits): with a 5% margin on the
// AICredit price there is no room for bonuses, they would be sold below cost. The rough "about N images /
// videos / messages" lines on each card are worked out in the browser from the live model prices.
// Paid plans (Pro and above) open Video Agent, Video Builder, Studio Pro and Ad Studio (paidPlanOnly in
// server/auth.js) and the full style library (server/styles.js). Everything else is open on Free, limited
// only by credits. Perks must only list what the app really does.
export const PLANS = [
  { id: 'free', kind: 'plan', name: 'Free', priceUsd: 0, credits: 1000, period: 'once',
    tagline: 'Try every model', perks: ['1,000 free starter credits, no card needed', 'Chat, documents and Code with every model', 'Image generation and editing', 'Video Studio and one-click AI apps', '2 styles in each style category'] },
  { id: 'pro', kind: 'plan', name: 'Pro', priceUsd: 20, credits: 20000, period: 'month',
    tagline: 'For everyday work', perks: ['20,000 credits every month', 'Video Agent and Video Builder', 'Studio Pro and Ad Studio', 'Everything in Free', 'Every style unlocked', 'Models at official price or less', 'Credits renew each month (no rollover)', 'Email support'] },
  { id: 'max5', kind: 'plan', name: 'Max', priceUsd: 100, credits: 100000, period: 'month', popular: true,
    tagline: '5x Pro, for regular image and video work', perks: ['100,000 credits every month', 'Everything in Pro', 'Sized for regular image and video work', 'Credits renew each month (no rollover)', 'Priority support'] },
  { id: 'max20', kind: 'plan', name: 'Ultra', priceUsd: 200, credits: 200000, period: 'month',
    tagline: '10x Pro, for daily creators and teams', perks: ['200,000 credits every month', 'Everything in Pro', 'Sized for daily video production and teams', 'Credits renew each month (no rollover)', 'Priority support'] },
];

export const PACKS = [
  { id: 'pack10', kind: 'pack', name: '10,000 credits', priceUsd: 10, credits: 10000 },
  { id: 'pack25', kind: 'pack', name: '25,000 credits', priceUsd: 25, credits: 25000 },
  { id: 'pack50', kind: 'pack', name: '50,000 credits', priceUsd: 50, credits: 50000 },
];

export const findOffer = (oid) => [...PLANS, ...PACKS].find((p) => p.id === oid && p.priceUsd > 0);

// ---------- buckets: plan credits, top-up packs, free credits (server/wallet.js) ----------
// Pro tools: Video Agent, Video Builder, Studio Pro and Ad Studio (which runs on Studio Pro). They spend plan
// and top-up credits only, never the free starter credits.
export const PRO_PATHS = ['/api/builder', '/api/agent', '/api/pro'];
// Studio Pro and Ad Studio also make pictures and videos through /api/generate; they send origin 'pro' or 'ads'.
const PRO_ORIGINS = ['pro', 'ads', 'agent', 'builder'];
export const inPro = () => { const s = ctx(); const p = s?.path || ''; return PRO_PATHS.some((x) => p === x || p.startsWith(x + '/')) || PRO_ORIGINS.includes(s?.req?.body?.origin); };
const paidEver = (user) => db.payments.some((p) => p.userId === user.id && p.status === 'paid' && p.amountUsd > 0) || (!!user.plan && user.plan !== 'free');
const row = (user, type, credits, desc, extra = {}) => db.ledger.push({ id: id('l_'), userId: user.id, type, credits: round4(credits), balance: user.credits, desc, at: now(), ...extra });
const EXPIRED_DESC = (b) => b.kind === 'sub' ? 'Unused plan credits expired at the end of the billing month'
  : b.kind === 'carry' ? 'Carried-over credits expired' : `Top-up credits expired (${W.PACK_DAYS()} days after purchase)`;

/** Makes sure the account uses credit buckets, and expires anything past its date. Cheap; call it freely. */
export function ensure(user) {
  if (!user) return user;
  if (!user.wallet) {
    const m = W.migrate(user, { paidEver: paidEver(user) });
    if (m && m.balance !== 0) row(user, 'migrate', 0, m.to === 'carry' ? `${fmt(m.balance)} credits carried over to the new credit rules${W.CARRY_DAYS() ? `, valid ${W.CARRY_DAYS()} days` : ', no expiry'}` : m.to === 'free' ? `${fmt(m.balance)} free credits carried over to the new credit rules` : 'Balance carried over to the new credit rules', { to: m.to });
    save();
  }
  for (const x of W.expireDue(user)) if (x.credits > 0) { row(user, 'expire', -x.credits, EXPIRED_DESC(x.bucket), { bucket: x.bucket.id }); save(); }
  return user;
}
const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** What this person can spend right now. In a Pro tool (or with pro: true) only plan and top-up credits count. */
export const balanceOf = (user, { pro = inPro() } = {}) => (user ? W.spendable(ensure(user), { pro }) : 0);
export const paidBalance = (user) => (user ? W.paidCredits(ensure(user)) : 0);
export const walletView = (user) => (user ? W.view(ensure(user)) : null);
const hasLiveSub = (u) => !!u.plan && u.plan !== 'free' && (!u.sub || ['active', 'trialing', 'past_due'].includes(u.sub.status));
/** Pro tools open while the person has an active plan or paid credits left. With an active plan and no
 *  credits the pages open but nothing can run until they top up or the plan renews. */
export const hasProAccess = (u) => !!u && (hasLiveSub(u) || paidBalance(u) > 0.005);
/** The Pro tools are open but there are no plan or top-up credits to run them. */
export const proPaused = (u) => !!u && !(paidBalance(u) > 0.005);

export function grant(user, credits, type, desc, extra = {}) {
  ensure(user);
  let parts = null; const where = {};
  if (credits < 0) parts = W.spend(user, -credits);
  else if (type === 'refund') parts = W.giveBack(user, sourceParts(user, extra), credits);
  else if (type === 'bonus' || (type === 'promo' && !extra.paid)) W.addFree(user, credits);
  else if (type === 'promo') { const p = W.addPack(user, credits, { kind: 'promo', desc }); where.bucket = p.id; where.expiresAt = p.expiresAt; }
  else if (type === 'purchase') {
    const pay = extra.paymentId && db.payments.find((p) => p.id === extra.paymentId);
    const offer = pay && [...PLANS, ...PACKS].find((o) => o.id === pay.offerId);
    if (pay?.kind === 'subscription' && pay.reason === 'subscription_update') W.addToSub(user, credits, { expiresAt: extra.periodEnd || user.sub?.currentPeriodEnd, planId: pay.offerId });
    else if (pay?.kind === 'subscription' || offer?.kind === 'plan') {
      const expiresAt = extra.periodEnd || (pay?.kind === 'subscription' ? user.sub?.currentPeriodEnd : null) || new Date(Date.now() + 30 * 864e5).toISOString();
      const old = W.newSubPeriod(user, credits, { expiresAt, planId: pay?.offerId, paymentId: pay?.id });
      if (old > 0) row(user, 'expire', -old, 'Unused plan credits expired at renewal (plan credits do not roll over)', { balance: round4(user.credits - credits) });
      where.expiresAt = user.wallet.sub.expiresAt;
    } else { const p = W.addPack(user, credits, { kind: 'pack', paymentId: pay?.id, desc }); where.bucket = p.id; where.expiresAt = p.expiresAt; }
  } else W.addFree(user, credits);
  const { periodEnd: _pe, paid: _pd, ...rest } = extra;
  row(user, type, credits, desc, { ...rest, ...where, ...(parts ? { parts } : {}) });
  checkBalance(user, { rearmOnly: true }); // a top-up re-arms the low / out of credits emails
  save();
  if (type === 'purchase' && credits > 0) purchaseReceipt(user, round4(credits), desc, extra.paymentId, where.expiresAt);
}

// Where the credits of a hold or a video task came from, less what was already given back.
function sourceParts(user, extra) {
  const key = extra.holdId ? 'holdId' : extra.taskId ? 'taskId' : null; if (!key) return [];
  const net = new Map();
  for (const l of db.ledger) {
    if (l.userId !== user.id || l[key] !== extra[key] || !l.parts) continue;
    const sign = l.type === 'usage' || l.type === 'adjust' ? 1 : l.type === 'refund' ? -1 : 0;
    for (const p of l.parts) net.set(p.b, round4((net.get(p.b) || 0) + sign * p.c));
  }
  return [...net].filter(([, c]) => c > 0).map(([b, c]) => ({ b, c }));
}

export function charge(user, credits, desc, extra = {}) {
  ensure(user);
  const c = Math.max(0, round4(credits));
  const pro = extra.pro ?? inPro();
  const parts = W.spend(user, c, { pro });
  db.ledger.push({ id: id('l_'), userId: user.id, type: 'usage', credits: -c, balance: user.credits, desc, at: now(), ...currentVia(), ...extra, parts, ...(pro ? { pro: true } : {}) }); // via: the page that spent it (admin usage)
  if (!extra.holdId) checkBalance(user); // held jobs are checked when they settle, after any refund
  save();
  return c;
}

/** The error for a job this person cannot pay for. In a Pro tool it says why free credits do not count. */
export function creditsError(user, need, what) {
  const pro = inPro(), have = balanceOf(user, { pro });
  const free = pro ? W.view(ensure(user)).free : 0;
  const msg = pro && have <= 0.005
    ? `Pro tools are paused because you have no plan or top-up credits left. Top up or wait for your plan to renew.${free > 0.5 ? ` Your ${fmt(Math.floor(free))} free credits still work in Chat, Image, Video Studio, Docs, Code and AI Apps.` : ''}`
    : what || (need > 0 ? `Not enough credits. This needs about ${fmt(Math.ceil(need))} and you have ${fmt(Math.floor(have))}${pro ? ' plan and top-up credits' : ''}.` : 'You are out of credits. Top up to keep going.');
  const e = new Error(msg); e.status = 402; e.code = 'insufficient_credits'; e.expose = true; if (pro) e.proPaused = have <= 0.005;
  return e;
}
/** Throws the right 402 when this person cannot spend `need` credits here (need 0: needs any credits at all). */
export function needCredits(user, need = 0, what) {
  const have = balanceOf(user);
  if (need > 0 ? have < need : !(have > 0)) { checkBalance(user, { refused: true }); save(); throw creditsError(user, need, what); }
}

// ---------- holds: reserve first, then settle to the real cost or release ----------
// Every paid job takes a hold before it starts. A hold ends exactly once: settled (the real cost is kept,
// the rest goes back) or released (everything goes back). Calling settle or release again does nothing,
// so a retry, a crash or a double click can never charge twice or refund twice.
export const canAfford = (user, credits) => balanceOf(user) >= Math.max(0, Number(credits) || 0);
export function reserve(user, credits, desc, extra = {}) {
  const amount = Math.max(0, round4(credits));
  if (!canAfford(user, amount)) { checkBalance(user, { refused: true }); save(); throw creditsError(user, amount); }
  const pro = inPro();
  const hold = { id: id('h_'), userId: user.id, amount, status: 'held', desc, createdAt: now(), ...extra, ...(pro ? { pro: true } : {}) };
  db.holds.push(hold);
  charge(user, amount, `${desc} (reserved)`, { holdId: hold.id, ...extra, pro });
  return hold;
}
const findHold = (h) => (typeof h === 'string' ? db.holds.find((x) => x.id === h) : h);
export function settle(holdOrId, actualCredits) {
  const hold = findHold(holdOrId); if (!hold || hold.status !== 'held') return hold || null;
  const user = db.users.find((u) => u.id === hold.userId);
  const actual = Math.max(0, round4(actualCredits == null ? hold.amount : actualCredits));
  hold.status = 'settled'; hold.charged = actual; hold.endedAt = now();
  if (user) {
    const diff = round4(hold.amount - actual);
    if (diff > 0) grant(user, diff, 'refund', `${hold.desc}: unused part returned`, { holdId: hold.id });
    else if (diff < 0) charge(user, -diff, `${hold.desc}: final cost`, { holdId: hold.id, pro: !!hold.pro });
    checkBalance(user);
  }
  save();
  return hold;
}
export function release(holdOrId, reason = 'not completed') {
  const hold = findHold(holdOrId); if (!hold || hold.status !== 'held') return hold || null;
  const user = db.users.find((u) => u.id === hold.userId);
  hold.status = 'released'; hold.charged = 0; hold.reason = reason; hold.endedAt = now();
  if (user && hold.amount > 0) grant(user, hold.amount, 'refund', `${hold.desc}: refunded (${reason})`, { holdId: hold.id });
  save();
  return hold;
}

// ---------- start-up move to buckets, and the expiry sweep ----------
/** Moves every account to credit buckets, once. The database file from before is kept beside it. Never changes a balance. */
export function migrateAll({ keepCopy } = {}) {
  const todo = db.users.filter((u) => !u.wallet);
  if (!todo.length) return { moved: 0 };
  const before = round4(db.users.reduce((n, u) => n + Number(u.credits || 0), 0));
  if (keepCopy) keepCopy();
  const out = { moved: 0, carry: 0, free: 0, owed: 0 };
  for (const u of todo) { ensure(u); out.moved++; const last = db.ledger.findLast?.((l) => l.userId === u.id && l.type === 'migrate'); if (last?.to) out[last.to] = (out[last.to] || 0) + 1; }
  const after = round4(db.users.reduce((n, u) => n + Number(u.credits || 0), 0));
  if (Math.abs(after - before) > 0.01) throw new Error(`credit migration changed the total: ${before} -> ${after}`);
  db.creditRules = { v: 1, at: now() };
  save();
  return { ...out, total: after };
}
/** Expires plan and top-up credits past their date, and warns about top-ups that expire within 7 days. */
export function sweepCredits() {
  for (const u of db.users) {
    ensure(u);
    const soon = W.expiringSoon(u, 7);
    if (soon.length) { for (const b of soon) b.warned = true; save(); creditsExpiring(u, soon.map((b) => ({ credits: round4(b.credits), expiresAt: b.expiresAt }))); }
  }
}
