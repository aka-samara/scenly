// Credit buckets: where each credit came from, when it expires, and which tools it may be spent on.
//
//   sub    this billing period's plan credits. They expire when the plan renews (the next period's
//          credits replace them) or a few hours after the period ends if no renewal arrives. No rollover.
//   packs  one entry per top-up pack, valid PACK_VALID_DAYS (90) days from purchase. Any number at once.
//          Also holds paid credits carried over from before these rules ('carry'), admin gifts of paid
//          credits ('promo') and refunds whose bucket has gone ('refund').
//   free   the free starter credits (welcome credits and free gifts). Standard tools only, no expiry.
//   owed   a small overrun (a job that cost a little more than it reserved); paid back from the next grant.
//
// Spending order: plan credits first, then packs with the soonest expiry, then free credits. Pro tools
// (Video Agent, Video Builder, Studio Pro, Ad Studio) can only spend plan and pack credits.
// user.credits always equals the spendable total, so older code that reads it keeps working.
// Pure functions on a user object: credits.js adds the ledger rows and saving.

const DAY = 864e5;
export const PACK_DAYS = () => { const v = Number(process.env.PACK_VALID_DAYS ?? 90); return Number.isFinite(v) && v > 0 ? v : 90; };
// After a period ends, how long plan credits wait for the renewal payment before they expire anyway
// (Stripe takes up to about an hour to charge a renewal). A renewal that arrives replaces them at once.
export const SUB_GRACE_MS = () => { const v = Number(process.env.SUB_CREDIT_GRACE_HOURS ?? 6); return (Number.isFinite(v) && v >= 0 ? v : 6) * 3600e3; };
// Paid credits held before these rules expire this many days after the switch (default 90, the owner's choice of
// 2026-11-20). CARRY_CREDIT_DAYS=0 or 'never' keeps them with no end date.
export const CARRY_DAYS = () => { const raw = String(process.env.CARRY_CREDIT_DAYS ?? '').trim(); if (raw === '') return 90; const v = Number(raw); return Number.isFinite(v) && v > 0 ? v : null; };

const r4 = (n) => Math.round(n * 1e4) / 1e4;
const ms = (iso) => (iso ? Date.parse(iso) : Infinity);
const rid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const addDays = (t, d) => new Date(t + d * DAY).toISOString();

export function wallet(user) {
  const w = user.wallet;
  if (!w) return null;
  w.packs ||= []; w.free ||= { id: 'free', credits: 0 }; w.owed ||= 0;
  return w;
}

const subLive = (s, t) => !!s && !s.expired && t < ms(s.expiresAt) + SUB_GRACE_MS();
const packLive = (p, t) => !p.expired && t < ms(p.expiresAt);

/** Live buckets in spending order. pro: leave out the free credits. */
export function buckets(user, { pro = false, t = Date.now() } = {}) {
  const w = wallet(user); if (!w) return [];
  const out = [];
  if (subLive(w.sub, t)) out.push(w.sub);
  out.push(...w.packs.filter((p) => packLive(p, t)).sort((a, b) => ms(a.expiresAt) - ms(b.expiresAt) || ms(a.at) - ms(b.at)));
  if (!pro) out.push(w.free);
  return out;
}
const sum = (list) => r4(list.reduce((n, b) => n + Math.max(0, b.credits || 0), 0));

/** What the person can spend. pro: plan and pack credits only. */
export function spendable(user, { pro = false, t } = {}) {
  const w = wallet(user); if (!w) return Number(user.credits || 0);
  return r4(sum(buckets(user, { pro, t })) - w.owed);
}
export const paidCredits = (user, t) => Math.max(0, spendable(user, { pro: true, t }));
export const sync = (user) => { if (wallet(user)) user.credits = spendable(user); return user.credits; };

/** Take credits out. Returns the parts taken, [{b: bucket id, c: credits}]. A shortfall is recorded as owed. */
export function spend(user, amount, { pro = false } = {}) {
  const w = wallet(user); let left = r4(Math.max(0, amount)); const parts = [];
  for (const b of buckets(user, { pro })) {
    if (left <= 0) break;
    const take = r4(Math.min(left, Math.max(0, b.credits)));
    if (take > 0) { b.credits = r4(b.credits - take); parts.push({ b: b.id, c: take }); left = r4(left - take); }
  }
  // A pro job that overruns its reservation by a little may use free credits before it runs into debt.
  if (left > 0 && pro && w.free.credits > 0) { const take = r4(Math.min(left, w.free.credits)); w.free.credits = r4(w.free.credits - take); parts.push({ b: 'free', c: take }); left = r4(left - take); }
  if (left > 0) { w.owed = r4(w.owed + left); parts.push({ b: 'owed', c: left }); }
  sync(user);
  return parts;
}

// Grants pay back anything owed first.
function payOwed(w, amount) { const pay = Math.min(w.owed, amount); w.owed = r4(w.owed - pay); return r4(amount - pay); }

/** A new plan period: last period's plan credits expire, this period's arrive. Returns credits that expired. */
export function newSubPeriod(user, credits, { expiresAt, planId, paymentId, t = Date.now() }) {
  const w = wallet(user);
  const old = w.sub && !w.sub.expired && w.sub.credits > 0 ? r4(w.sub.credits) : 0;
  w.sub = { id: rid('sub_'), kind: 'sub', credits: payOwed(w, credits), original: credits, at: new Date(t).toISOString(), expiresAt: expiresAt || addDays(t, 30), planId: planId || null, paymentId: paymentId || null };
  sync(user);
  return old;
}
/** Extra plan credits in the same period (an upgrade). */
export function addToSub(user, credits, { expiresAt, planId, t = Date.now() } = {}) {
  const w = wallet(user);
  if (!subLive(w.sub, t)) return newSubPeriod(user, credits, { expiresAt, planId, t }), 0;
  w.sub.credits = r4(w.sub.credits + payOwed(w, credits)); w.sub.original = r4((w.sub.original || 0) + credits);
  if (planId) w.sub.planId = planId;
  sync(user);
  return 0;
}
/** A top-up pack (or other paid credits) valid for `days` (null = no expiry). */
export function addPack(user, credits, { kind = 'pack', days = PACK_DAYS(), paymentId, desc, t = Date.now() } = {}) {
  const w = wallet(user);
  const p = { id: rid('pk_'), kind, credits: payOwed(w, credits), original: credits, at: new Date(t).toISOString(), expiresAt: days ? addDays(t, days) : null, paymentId: paymentId || null, desc: desc || null };
  w.packs.push(p);
  sync(user);
  return p;
}
export function addFree(user, credits) { const w = wallet(user); w.free.credits = r4(w.free.credits + payOwed(w, credits)); sync(user); }

/** Give back credits taken earlier, to the buckets they came from (latest expiry first). */
export function giveBack(user, parts, amount, t = Date.now()) {
  const w = wallet(user); let left = r4(amount);
  const live = new Map(buckets(user, { t }).map((b) => [b.id, b]));
  const order = [...(parts || [])].sort((a, b) => rank(w, b.b) - rank(w, a.b));
  const back = [];
  for (const p of order) {
    if (left <= 0) break;
    const c = r4(Math.min(left, p.c)); if (!(c > 0)) continue;
    left = r4(left - c);
    if (p.b === 'owed') { const x = Math.min(w.owed, c); w.owed = r4(w.owed - x); back.push({ b: 'owed', c }); continue; }
    const b = live.get(p.b);
    if (b) { b.credits = r4(b.credits + c); back.push({ b: b.id, c }); continue; }
    // The bucket has expired since: paid credits come back as a fresh top-up, free ones as free.
    if (p.b === 'free') { w.free.credits = r4(w.free.credits + c); back.push({ b: 'free', c }); }
    else { const np = addPack(user, c, { kind: 'refund', desc: 'Refund' }); back.push({ b: np.id, c }); }
  }
  if (left > 0) { w.free.credits = r4(w.free.credits + left); back.push({ b: 'free', c: left }); } // no record of where it came from
  sync(user);
  return back;
}
function rank(w, id) { // bigger = later expiry = gets refunds first
  if (id === 'owed') return Infinity;
  if (id === 'free') return 1e15;
  if (w.sub?.id === id) return ms(w.sub.expiresAt);
  const p = w.packs.find((x) => x.id === id); return p ? ms(p.expiresAt) : -1;
}

/** Expire anything past its date. Returns [{bucket, credits}] for the ledger. */
export function expireDue(user, t = Date.now()) {
  const w = wallet(user); if (!w) return [];
  const out = [];
  if (w.sub && !w.sub.expired && t >= ms(w.sub.expiresAt) + SUB_GRACE_MS()) { out.push({ bucket: w.sub, credits: r4(Math.max(0, w.sub.credits)) }); w.sub.credits = 0; w.sub.expired = true; }
  for (const p of w.packs) if (!p.expired && t >= ms(p.expiresAt)) { out.push({ bucket: p, credits: r4(Math.max(0, p.credits)) }); p.credits = 0; p.expired = true; }
  if (w.packs.length > 60) w.packs = w.packs.filter((p) => !p.expired || p.credits > 0).concat(w.packs.filter((p) => p.expired && !(p.credits > 0)).slice(-20));
  sync(user);
  return out;
}

/** Packs with credits left that expire within `days`, not yet warned about. */
export function expiringSoon(user, days = 7, t = Date.now()) {
  return buckets(user, { pro: true, t }).filter((b) => b.kind !== 'sub' && b.expiresAt && !b.warned && b.credits >= 1 && ms(b.expiresAt) - t <= days * DAY);
}

/** Move a balance held before these rules into buckets. Never changes the total. */
export function migrate(user, { paidEver, t = Date.now() }) {
  if (user.wallet) return null;
  const bal = r4(Number(user.credits || 0));
  user.wallet = { v: 1, sub: null, packs: [], free: { id: 'free', credits: 0 }, owed: 0, migratedAt: new Date(t).toISOString() };
  let to = 'none';
  if (bal < 0) { user.wallet.owed = -bal; to = 'owed'; }
  else if (bal > 0 && paidEver) { addPack(user, bal, { kind: 'carry', days: CARRY_DAYS(), desc: 'Credits from before the new credit rules', t }); to = 'carry'; }
  else if (bal > 0) { user.wallet.free.credits = bal; to = 'free'; }
  sync(user);
  if (Math.abs(user.credits - bal) > 1e-6) throw new Error(`wallet migration changed the balance of ${user.id}: ${bal} -> ${user.credits}`);
  return { balance: bal, to };
}

/** What the account and billing pages show. */
export function view(user, t = Date.now()) {
  const w = wallet(user); if (!w) return null;
  const sub = subLive(w.sub, t) && w.sub.credits > 0 ? { credits: r4(w.sub.credits), expiresAt: w.sub.expiresAt } : null;
  const packs = w.packs.filter((p) => packLive(p, t) && p.credits > 0.005).sort((a, b) => ms(a.expiresAt) - ms(b.expiresAt))
    .map((p) => ({ credits: r4(p.credits), original: p.original, kind: p.kind, boughtAt: p.at, expiresAt: p.expiresAt }));
  return { total: spendable(user, { t }), paid: paidCredits(user, t), free: r4(Math.max(0, w.free.credits)), owed: w.owed, sub, packs, packDays: PACK_DAYS() };
}
