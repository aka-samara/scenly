import db, { save, id, now } from './db.js';
import { currentVia } from './monitor.js';
import { checkBalance, purchaseReceipt } from './emails.js';

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

// Plans mirror the familiar Free / Pro / Max ladder. Monthly plans grant their
// credits each billing cycle; packs are one-time top-ups that never expire.
// Every offer sells credits at face value ($1 = 1,000 credits, no bonus credits): with a 5% margin on the
// AICredit price there is no room for bonuses, they would be sold below cost. The rough "about N images /
// videos / messages" lines on each card are worked out in the browser from the live model prices.
// Paid plans (Pro and above) open Video Agent, Video Builder, Studio Pro and Ad Studio (paidPlanOnly in
// server/auth.js) and the full style library (server/styles.js). Everything else is open on Free, limited
// only by credits. Perks must only list what the app really does.
export const PLANS = [
  { id: 'free', kind: 'plan', name: 'Free', priceUsd: 0, credits: 1000, period: 'once',
    tagline: 'Try every model', perks: ['1,000 welcome credits, no card needed', 'Chat, documents and Code with every model', 'Image generation and editing', 'Video Studio and one-click AI apps', '2 styles in each style category'] },
  { id: 'pro', kind: 'plan', name: 'Pro', priceUsd: 20, credits: 20000, period: 'month',
    tagline: 'For everyday work', perks: ['20,000 credits every month', 'Video Agent and Video Builder', 'Studio Pro and Ad Studio', 'Everything in Free', 'Every style unlocked', 'Models at official price or less', 'Unused credits roll over', 'Email support'] },
  { id: 'max5', kind: 'plan', name: 'Max', priceUsd: 100, credits: 100000, period: 'month', popular: true,
    tagline: '5x Pro, for regular image and video work', perks: ['100,000 credits every month', 'Everything in Pro', 'Sized for regular image and video work', 'Unused credits roll over', 'Priority support'] },
  { id: 'max20', kind: 'plan', name: 'Ultra', priceUsd: 200, credits: 200000, period: 'month',
    tagline: '10x Pro, for daily creators and teams', perks: ['200,000 credits every month', 'Everything in Pro', 'Sized for daily video production and teams', 'Unused credits roll over', 'Priority support'] },
];

export const PACKS = [
  { id: 'pack10', kind: 'pack', name: '10,000 credits', priceUsd: 10, credits: 10000 },
  { id: 'pack25', kind: 'pack', name: '25,000 credits', priceUsd: 25, credits: 25000 },
  { id: 'pack50', kind: 'pack', name: '50,000 credits', priceUsd: 50, credits: 50000 },
];

export const findOffer = (oid) => [...PLANS, ...PACKS].find((p) => p.id === oid && p.priceUsd > 0);

export function grant(user, credits, type, desc, extra = {}) {
  user.credits = round4((user.credits || 0) + credits);
  db.ledger.push({ id: id('l_'), userId: user.id, type, credits: round4(credits), balance: user.credits, desc, at: now(), ...extra });
  checkBalance(user, { rearmOnly: true }); // a top-up re-arms the low / out of credits emails
  save();
  if (type === 'purchase' && credits > 0) purchaseReceipt(user, round4(credits), desc, extra.paymentId);
}

export function charge(user, credits, desc, extra = {}) {
  const c = Math.max(0, round4(credits));
  user.credits = round4((user.credits || 0) - c);
  db.ledger.push({ id: id('l_'), userId: user.id, type: 'usage', credits: -c, balance: user.credits, desc, at: now(), ...currentVia(), ...extra }); // via: the page that spent it (admin usage)
  if (!extra.holdId) checkBalance(user); // held jobs are checked when they settle, after any refund
  save();
  return c;
}

// ---------- holds: reserve first, then settle to the real cost or release ----------
// Every paid job takes a hold before it starts. A hold ends exactly once: settled (the real cost is kept,
// the rest goes back) or released (everything goes back). Calling settle or release again does nothing,
// so a retry, a crash or a double click can never charge twice or refund twice.
export const canAfford = (user, credits) => (user.credits || 0) >= Math.max(0, Number(credits) || 0);
export function reserve(user, credits, desc, extra = {}) {
  const amount = Math.max(0, round4(credits));
  if (!canAfford(user, amount)) { checkBalance(user, { refused: true }); save(); const e = new Error(`Not enough credits. This needs about ${round2(amount)} and you have ${round2(user.credits || 0)}.`); e.status = 402; e.code = 'insufficient_credits'; throw e; }
  const hold = { id: id('h_'), userId: user.id, amount, status: 'held', desc, createdAt: now(), ...extra };
  db.holds.push(hold);
  charge(user, amount, `${desc} (reserved)`, { holdId: hold.id, ...extra });
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
    else if (diff < 0) charge(user, -diff, `${hold.desc}: final cost`, { holdId: hold.id });
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
