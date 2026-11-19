// Subscriptions with Stripe (switch: FEATURE_SUBSCRIPTIONS=1, off by default).
//
// How it works
// - Everyone starts on the free trial: the welcome credits, no card needed.
// - Paid plans are monthly Stripe subscriptions. Each paid invoice adds that plan's credits once
//   (first payment and every renewal). Unused credits roll over.
// - Upgrading charges the price difference for the rest of the month at once and adds the matching
//   share of the extra credits. Moving to a smaller plan starts at the next renewal's price; nothing is refunded.
// - Cancelling keeps the plan until the end of the paid month. Card changes and invoices are in Stripe's billing page.
// - Credit packs stay one-time purchases (server/payments.js).
// - Stripe is the record of truth. The app reads it back (syncUser) after checkout, from the webhook when one is set up,
//   when the billing page opens, and every 30 minutes for plans that are due. Every grant is keyed by the Stripe
//   invoice id, so reading the same invoice twice never adds credits twice.
// - Without STRIPE_SECRET_KEY the same flow runs in demo mode (no card, plans start at once) for local testing.
// - Prices are created in Stripe on first use (lookup key polymind_<plan>_<cents>_month), so nobody has to copy
//   price ids. STRIPE_PRICE_PRO / STRIPE_PRICE_MAX5 / STRIPE_PRICE_MAX20 can point at existing prices instead.
import crypto from 'node:crypto';
import db, { save, id, now } from './db.js';
import { PLANS, grant, round2 } from './credits.js';
import { flags } from './flags.js';
import { planChanged, subChanged } from './emails.js';

db.billing ||= {};
db.billing.upgrades ||= {};
db.billing.events ||= [];
db.billing.prices ||= {}; // Stripe price id -> plan id, so invoices that only name a price id can be read after a restart

export const subsOn = () => !!flags().subscriptions;
export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY;
const API = () => (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '') + '/v1';
const base = () => (process.env.PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/$/, '');
const keyTag = () => crypto.createHash('sha256').update(process.env.STRIPE_SECRET_KEY || 'demo').digest('hex').slice(0, 10);
export const paidPlans = () => PLANS.filter((p) => p.priceUsd > 0);
export const planById = (pid) => PLANS.find((p) => p.id === pid);
const LIVE = ['active', 'trialing', 'past_due'];

// Plan history for the admin page: every change of plan, with when and why (upgrade, downgrade, cancel, …).
export function notePlan(user, from, why) {
  const to = user.plan || 'free'; from = from || 'free';
  if (from === to) return;
  const price = (pid) => planById(pid)?.priceUsd || 0;
  const kind = why || (to === 'free' ? 'cancelled' : from === 'free' ? 'subscribed' : price(to) > price(from) ? 'upgraded' : 'downgraded');
  (user.planHistory ||= []).push({ from, to, kind, at: now() });
  planChanged(user, from, to, kind);
  if (user.planHistory.length > 50) user.planHistory.splice(0, user.planHistory.length - 50);
}

export class BillingError extends Error {
  constructor(message, status = 400, code) { super(message); this.status = status; this.code = code; this.expose = true; }
}

// ---------- Stripe API (plain fetch, no extra package) ----------
function encode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? encode(x, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === 'object') encode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
export async function stripe(pathname, params, method = 'POST', { idem } = {}) {
  const q = encode(params);
  const url = API() + pathname + (method === 'GET' && params ? '?' + q : '');
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(idem ? { 'Idempotency-Key': idem } : {}) },
      body: method === 'GET' ? undefined : q,
    });
  } catch (e) { throw new BillingError('Could not reach Stripe. Please try again in a moment.', 502, 'stripe_unreachable'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new BillingError(j.error?.message || `Stripe error (${res.status})`, res.status >= 500 ? 502 : 400, j.error?.code || 'stripe_error');
    err.stripe = j.error; throw err;
  }
  return j;
}

// ---------- prices ----------
const priceCache = new Map(); // plan id -> price id
// The 'polymind_' prefix is kept after the rename to Scenly so existing Stripe prices and subscriptions still match.
const lookupKey = (p) => `polymind_${p.id}_${Math.round(p.priceUsd * 100)}_month`;
export async function ensurePrice(plan) {
  const env = process.env['STRIPE_PRICE_' + plan.id.toUpperCase()];
  if (env) return env;
  if (priceCache.has(plan.id)) return priceCache.get(plan.id);
  const key = lookupKey(plan);
  const found = await stripe('/prices', { lookup_keys: [key], active: 'true', limit: 1 }, 'GET');
  let price = found.data?.[0];
  if (!price) {
    const product = await stripe('/products', { name: `Scenly ${plan.name}`, description: `${plan.credits.toLocaleString('en-US')} credits every month`, metadata: { plan: plan.id } }, 'POST', { idem: `pm-product-${key}-${keyTag()}` });
    price = await stripe('/prices', { product: product.id, currency: 'usd', unit_amount: Math.round(plan.priceUsd * 100), recurring: { interval: 'month' }, lookup_key: key, transfer_lookup_key: 'true', metadata: { plan: plan.id } }, 'POST', { idem: `pm-price-${key}-${keyTag()}` });
  }
  priceCache.set(plan.id, price.id);
  if (db.billing.prices[price.id] !== plan.id) { db.billing.prices[price.id] = plan.id; save(); }
  return price.id;
}
// Which of our plans is this Stripe price? Metadata first, then the lookup key, then the .env overrides.
export function planForPrice(price) {
  if (!price) return null;
  const pid = typeof price === 'string' ? price : price.id;
  const meta = typeof price === 'object' && price.metadata?.plan;
  if (meta && planById(meta)) return planById(meta);
  const lk = typeof price === 'object' && price.lookup_key;
  if (lk) { const m = /^polymind_([a-z0-9]+)_/.exec(lk); if (m && planById(m[1])) return planById(m[1]); }
  if (db.billing.prices[pid] && planById(db.billing.prices[pid])) return planById(db.billing.prices[pid]);
  for (const p of paidPlans()) if (process.env['STRIPE_PRICE_' + p.id.toUpperCase()] === pid || priceCache.get(p.id) === pid) return p;
  return null;
}

// ---------- customer and portal ----------
export async function ensureCustomer(user) {
  if (user.stripeCustomerId && user.stripeKeyTag === keyTag()) return user.stripeCustomerId;
  const c = await stripe('/customers', { email: user.email, name: user.name, metadata: { userId: user.id } }, 'POST', { idem: `pm-cust-${user.id}-${keyTag()}` });
  user.stripeCustomerId = c.id; user.stripeKeyTag = keyTag(); save();
  return c.id;
}
async function portalConfig(fresh = false) {
  const saved = db.billing.portal;
  if (!fresh && saved?.tag === keyTag()) return saved.id;
  const cfg = await stripe('/billing_portal/configurations', {
    business_profile: { headline: 'Scenly: manage your plan and payments' },
    features: {
      invoice_history: { enabled: 'true' },
      payment_method_update: { enabled: 'true' },
      customer_update: { enabled: 'true', allowed_updates: ['email', 'address', 'name'] },
      subscription_cancel: { enabled: 'true', mode: 'at_period_end' },
    },
  });
  db.billing.portal = { id: cfg.id, tag: keyTag() }; save();
  return cfg.id;
}
export async function portalUrl(user) {
  if (!stripeReady()) throw new BillingError('Billing details open in Stripe once a Stripe key is added. In demo mode use the buttons on this page.', 400, 'demo_mode');
  const customer = await ensureCustomer(user);
  const open = async (fresh) => stripe('/billing_portal/sessions', { customer, return_url: `${base()}/#/billing`, configuration: await portalConfig(fresh) });
  try { return (await open(false)).url; } catch (e) { if (e.stripe?.param === 'configuration' || /configuration/i.test(e.message)) return (await open(true)).url; throw e; }
}

// ---------- reading subscriptions and invoices back from Stripe ----------
const tsIso = (t) => (t ? new Date(t * 1000).toISOString() : null);
const subPlan = (s) => planForPrice(s.items?.data?.[0]?.price) || planById(s.metadata?.plan) || null;
const invoiceSub = (inv) => inv.subscription?.id || inv.subscription || inv.parent?.subscription_details?.subscription || null;
const linePrice = (l) => l.price || l.pricing?.price_details?.price || l.plan?.id || null;
const lineIsProration = (l) => l.proration || l.parent?.subscription_item_details?.proration || l.parent?.invoice_item_details?.proration;

function applySub(user, s) {
  const before = user.plan, prevSub = user.sub ? { ...user.sub } : null;
  const plan = subPlan(s);
  const item = s.items?.data?.[0];
  if (plan && item?.price?.id && db.billing.prices[item.price.id] !== plan.id) db.billing.prices[item.price.id] = plan.id;
  user.sub = {
    id: s.id, status: s.status, planId: plan?.id || null, itemId: item?.id || null,
    currentPeriodEnd: tsIso(s.current_period_end || item?.current_period_end),
    cancelAtPeriodEnd: !!(s.cancel_at_period_end || s.cancel_at), cancelAt: tsIso(s.cancel_at || (s.cancel_at_period_end ? s.current_period_end || item?.current_period_end : null)),
    paused: !!s.pause_collection, resumesAt: tsIso(s.pause_collection?.resumes_at),
  };
  if (LIVE.includes(s.status)) user.everSubscribed = true;
  user.plan = LIVE.includes(s.status) && plan ? plan.id : 'free';
  if (user.plan !== 'free') user.planRenewsAt = user.sub.currentPeriodEnd;
  notePlan(user, before);
  subChanged(user, prevSub);
}

export const invoiceLinks = (inv) => ({ invoiceNumber: inv.number || null, invoiceUrl: inv.hosted_invoice_url || null, invoicePdf: inv.invoice_pdf || null });
function grantInvoice(user, inv) {
  if (db.payments.some((p) => p.stripeInvoice === inv.id)) return 0;
  const subId = invoiceSub(inv);
  if (!subId || !(inv.amount_paid > 0 || inv.status === 'paid')) return 0;
  const lines = inv.lines?.data || [];
  const main = lines.find((l) => !lineIsProration(l) && (l.amount || 0) > 0) || lines.find((l) => (l.amount || 0) > 0) || lines[0];
  const plan = planForPrice(main && linePrice(main)) || planById(inv.metadata?.plan) || planById(user.sub?.planId);
  let credits = 0, desc = '';
  const reason = inv.billing_reason;
  if (reason === 'subscription_create' || reason === 'subscription_cycle') {
    credits = plan?.credits || 0;
    desc = `${plan?.name || 'Plan'} plan · ${reason === 'subscription_cycle' ? 'monthly renewal' : 'first month'} · $${round2(inv.amount_paid / 100)}`;
  } else if (reason === 'subscription_update') {
    // The upgrade invoice holds two lines: unused time on the old plan (negative) and the rest of the month on the new one.
    const pos = lines.find((l) => (l.amount || 0) > 0), neg = lines.find((l) => (l.amount || 0) < 0);
    const toP = pos && planForPrice(linePrice(pos)), fromP = neg && planForPrice(linePrice(neg));
    const up = toP && fromP ? { from: fromP.id, to: toP.id, fromPrice: fromP.priceUsd, toPrice: toP.priceUsd, extraCredits: toP.credits - fromP.credits } : db.billing.upgrades[inv.id];
    if (!up && Date.now() / 1000 - (inv.created || 0) < 120) return 0; // the app may not have noted this upgrade yet; read it again next time
    if (up && up.extraCredits > 0 && up.toPrice > up.fromPrice) {
      // Credits follow what was actually paid: upgrading on the last day of the month buys only a small part of the difference.
      const fullCents = Math.max(1, Math.round((up.toPrice - up.fromPrice) * 100));
      const share = Math.max(0, Math.min(1, (inv.amount_paid || 0) / fullCents));
      credits = Math.round(up.extraCredits * share);
      desc = `Upgrade to ${planById(up.to)?.name || 'a bigger plan'} · rest of this month · $${round2(inv.amount_paid / 100)}`;
    } else desc = `Plan change · $${round2(inv.amount_paid / 100)}`;
  } else desc = `Plan payment · $${round2(inv.amount_paid / 100)}`;
  const pay = { id: id('pay_'), userId: user.id, offerId: plan?.id || null, kind: 'subscription', reason, amountUsd: round2((inv.amount_paid || 0) / 100), credits, status: 'paid', mode: 'stripe', stripeInvoice: inv.id, stripeSubscription: subId, ...invoiceLinks(inv), createdAt: now(), paidAt: tsIso(inv.status_transitions?.paid_at) || now() };
  db.payments.push(pay);
  if (credits > 0) grant(user, credits, 'purchase', desc, { paymentId: pay.id });
  save();
  return credits;
}

const running = new Map();
const lastSync = new Map();
/** Read this person's plan and paid invoices back from Stripe (or roll a demo plan forward). Safe to call often. */
export function syncUser(user, { force = true } = {}) {
  if (!subsOn()) return Promise.resolve(user);
  if (!force && Date.now() - (lastSync.get(user.id) || 0) < 20e3) return Promise.resolve(user);
  if (running.has(user.id)) return running.get(user.id);
  const p = (async () => {
    await null; // let running.set() below happen first, so the finally block always clears it
    try {
      if (user.sub?.demo) return demoRoll(user);
      if (!stripeReady() || !user.stripeCustomerId || user.stripeKeyTag !== keyTag()) return user;
      const subs = await stripe('/subscriptions', { customer: user.stripeCustomerId, status: 'all', limit: 10 }, 'GET');
      const list = (subs.data || []).sort((a, b) => b.created - a.created);
      const cur = list.find((s) => [...LIVE, 'unpaid', 'incomplete'].includes(s.status));
      if (cur) applySub(user, cur);
      else if (user.sub) { const before = user.plan; user.sub = { ...user.sub, status: list[0]?.status || 'canceled' }; user.plan = 'free'; notePlan(user, before); }
      const invs = await stripe('/invoices', { customer: user.stripeCustomerId, status: 'paid', limit: 24 }, 'GET');
      for (const inv of (invs.data || []).sort((a, b) => a.created - b.created)) {
        grantInvoice(user, inv);
        // Invoices of credit packs: add their links to the pack's row.
        const row = db.payments.find((x) => x.userId === user.id && x.stripeInvoice === inv.id && !x.invoicePdf);
        if (row) Object.assign(row, invoiceLinks(inv));
      }
      // Bills still waiting to be paid (a failed renewal): shown with a Pay now link.
      const open = await stripe('/invoices', { customer: user.stripeCustomerId, status: 'open', limit: 5 }, 'GET').catch(() => ({ data: [] }));
      user.openInvoices = (open.data || []).filter((i) => (i.amount_due || 0) > 0).map((i) => ({ id: i.id, amountUsd: round2(i.amount_due / 100), url: i.hosted_invoice_url || null, createdAt: tsIso(i.created), number: i.number || null }));
      // The card on file, for the plan panel.
      const pms = await stripe('/payment_methods', { customer: user.stripeCustomerId, type: 'card', limit: 1 }, 'GET').catch(() => ({ data: [] }));
      const card = pms.data?.[0]?.card;
      user.card = card ? { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year } : null;
      for (const pay of db.payments.filter((x) => x.userId === user.id && x.kind === 'checkout' && x.status === 'pending')) if (cur) pay.status = 'done';
      save();
      return user;
    } finally { lastSync.set(user.id, Date.now()); running.delete(user.id); }
  })();
  running.set(user.id, p);
  return p;
}

// ---------- demo mode: the same flow with no card, for trying it locally ----------
export function demoStart(user, plan) {
  const before = user.plan;
  const end = new Date(Date.now() + 30 * 864e5).toISOString();
  user.sub = { demo: true, id: id('sub_demo_'), status: 'active', planId: plan.id, currentPeriodEnd: end, cancelAtPeriodEnd: false, cancelAt: null };
  user.plan = plan.id; user.planRenewsAt = end; user.everSubscribed = true;
  notePlan(user, before);
  const pay = { id: id('pay_'), userId: user.id, offerId: plan.id, kind: 'subscription', reason: 'subscription_create', amountUsd: plan.priceUsd, credits: plan.credits, status: 'paid', mode: 'demo', createdAt: now(), paidAt: now() };
  db.payments.push(pay);
  grant(user, plan.credits, 'purchase', `${plan.name} plan · first month · $${plan.priceUsd} (demo, no charge)`, { paymentId: pay.id });
}
function demoRoll(user) {
  const s = user.sub;
  while (s && s.status === 'active' && Date.parse(s.currentPeriodEnd) <= Date.now()) {
    if (s.cancelAtPeriodEnd) { const before = user.plan; s.status = 'canceled'; user.plan = 'free'; notePlan(user, before); break; }
    if (s.paused) { s.currentPeriodEnd = new Date(Date.parse(s.currentPeriodEnd) + 30 * 864e5).toISOString(); user.planRenewsAt = s.currentPeriodEnd; continue; } // paused: no renewal, no credits
    const plan = planById(s.planId);
    s.currentPeriodEnd = new Date(Date.parse(s.currentPeriodEnd) + 30 * 864e5).toISOString();
    user.planRenewsAt = s.currentPeriodEnd;
    const pay = { id: id('pay_'), userId: user.id, offerId: plan.id, kind: 'subscription', reason: 'subscription_cycle', amountUsd: plan.priceUsd, credits: plan.credits, status: 'paid', mode: 'demo', createdAt: now(), paidAt: now() };
    db.payments.push(pay);
    grant(user, plan.credits, 'purchase', `${plan.name} plan · monthly renewal · $${plan.priceUsd} (demo, no charge)`, { paymentId: pay.id });
  }
  save();
  return user;
}

// ---------- actions ----------
const hasLivePlan = (user) => !!(user.sub && LIVE.includes(user.sub.status) && user.plan !== 'free');

export async function subscribe(user, plan) {
  if (!plan || !(plan.priceUsd > 0)) throw new BillingError('Unknown plan.');
  await syncUser(user);
  if (hasLivePlan(user)) throw new BillingError(`You are already on ${planById(user.plan)?.name || 'a plan'}. Use the button on that plan to switch.`, 409, 'already_subscribed');
  if (!stripeReady()) { demoStart(user, plan); save(); return { mode: 'demo', plan: plan.id, granted: plan.credits }; }
  const customer = await ensureCustomer(user);
  let price = await ensurePrice(plan);
  const pay = { id: id('pay_'), userId: user.id, offerId: plan.id, kind: 'checkout', amountUsd: 0, credits: 0, status: 'pending', mode: 'stripe', createdAt: now() };
  const open = () => stripe('/checkout/sessions', {
    mode: 'subscription', customer, client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: 'true',
    metadata: { userId: user.id, plan: plan.id, paymentId: pay.id },
    subscription_data: { metadata: { userId: user.id, plan: plan.id } },
    success_url: `${base()}/api/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base()}/#/billing`,
  });
  let session;
  try { session = await open(); }
  catch (e) {
    // A price that was archived or deleted in the Stripe dashboard: look it up again (or make a new one) and retry once.
    if (!/price/i.test(e.message) || process.env['STRIPE_PRICE_' + plan.id.toUpperCase()]) throw e;
    priceCache.delete(plan.id); price = await ensurePrice(plan); session = await open();
  }
  pay.stripeSession = session.id;
  db.payments.push(pay); save();
  return { mode: 'stripe', url: session.url };
}

// ---------- what a plan change costs, before it happens ----------
const r2 = (n) => Math.round(n * 100) / 100;
function demoQuote(user, from, to) {
  const end = Date.parse(user.sub.currentPeriodEnd);
  const frac = Math.max(0, Math.min(1, (end - Date.now()) / (30 * 864e5)));
  return { frac, credit: r2(from.priceUsd * frac), charge: r2(to.priceUsd * frac) };
}
/** The numbers the confirm popup shows. Upgrades ask Stripe for the exact bill (create_preview). */
export async function previewSwitch(user, plan) {
  if (!plan || !(plan.priceUsd > 0)) throw new BillingError('Unknown plan.');
  await syncUser(user, { force: false });
  if (!hasLivePlan(user)) throw new BillingError('You do not have a paid plan yet. Choose one to start.', 409, 'no_subscription');
  const from = planById(user.plan);
  if (from.id === plan.id) throw new BillingError(`You are already on ${plan.name}.`);
  if (user.sub.status === 'past_due') throw new BillingError('Your last payment did not go through. Please update your card under Manage billing first.', 402, 'past_due');
  const upgrade = plan.priceUsd > from.priceUsd;
  const prorationDate = Math.floor(Date.now() / 1000);
  let credit = 0, charge = 0;
  if (upgrade) {
    if (user.sub.demo) ({ credit, charge } = demoQuote(user, from, plan));
    else {
      const price = await ensurePrice(plan);
      const inv = await stripe('/invoices/create_preview', {
        customer: user.stripeCustomerId, subscription: user.sub.id,
        subscription_details: { items: [{ id: user.sub.itemId, price }], proration_behavior: 'always_invoice', proration_date: prorationDate },
      });
      for (const l of inv.lines?.data || []) {
        if (!lineIsProration(l)) continue;
        if ((l.amount || 0) < 0) credit += -l.amount / 100; else charge += (l.amount || 0) / 100;
      }
      credit = r2(credit); charge = r2(charge);
    }
  }
  const dueNow = r2(Math.max(0, charge - credit));
  const fullDiff = Math.max(0.01, plan.priceUsd - from.priceUsd);
  const extraCredits = upgrade ? Math.round((plan.credits - from.credits) * Math.min(1, dueNow / fullDiff)) : 0;
  return {
    upgrade, from: { id: from.id, name: from.name, priceUsd: from.priceUsd, credits: from.credits },
    to: { id: plan.id, name: plan.name, priceUsd: plan.priceUsd, credits: plan.credits },
    credit, charge, dueNow, extraCredits, renewsAt: user.sub.currentPeriodEnd, prorationDate,
    card: user.card || null, demo: !!user.sub.demo,
  };
}

export async function switchPlan(user, plan, { prorationDate } = {}) {
  if (!plan || !(plan.priceUsd > 0)) throw new BillingError('Unknown plan.');
  await syncUser(user);
  if (!hasLivePlan(user)) throw new BillingError('You do not have a paid plan yet. Choose one to start.', 409, 'no_subscription');
  const from = planById(user.plan);
  if (from.id === plan.id) throw new BillingError(`You are already on ${plan.name}.`);
  if (user.sub.status === 'past_due') throw new BillingError('Your last payment did not go through. Please update your card under Manage billing first.', 402, 'past_due');
  const upgrade = plan.priceUsd > from.priceUsd;
  if (user.sub.demo) {
    const before = user.plan;
    user.sub.planId = plan.id; user.plan = plan.id; user.sub.cancelAtPeriodEnd = false; user.sub.cancelAt = null;
    notePlan(user, before);
    if (upgrade) {
      // The same sums Stripe makes: unused time on the old plan is credited, the rest of the month on the new one is charged.
      const q = demoQuote(user, from, plan);
      const due = r2(Math.max(0, q.charge - q.credit));
      const extra = Math.round((plan.credits - from.credits) * Math.min(1, due / Math.max(0.01, plan.priceUsd - from.priceUsd)));
      const pay = { id: id('pay_'), userId: user.id, offerId: plan.id, kind: 'subscription', reason: 'subscription_update', amountUsd: due, credits: extra, status: 'paid', mode: 'demo', createdAt: now(), paidAt: now() };
      db.payments.push(pay);
      if (extra > 0) grant(user, extra, 'purchase', `Upgrade to ${plan.name}, rest of this month · $${due} (demo, no charge)`, { paymentId: pay.id });
    }
    save();
    return { mode: 'demo', plan: plan.id, upgrade };
  }
  const price = await ensurePrice(plan);
  const s = await stripe('/subscriptions/' + encodeURIComponent(user.sub.id), {
    items: [{ id: user.sub.itemId, price }],
    proration_behavior: upgrade ? 'always_invoice' : 'none',
    // Charge exactly what the popup showed: Stripe prorates from the moment of the preview (if it is recent).
    ...(upgrade && prorationDate && Math.abs(Date.now() / 1000 - prorationDate) < 30 * 60 ? { proration_date: Math.floor(prorationDate) } : {}),
    payment_behavior: upgrade ? 'error_if_incomplete' : 'allow_incomplete',
    cancel_at_period_end: 'false',
    metadata: { userId: user.id, plan: plan.id },
    expand: ['latest_invoice'],
  });
  const inv = s.latest_invoice;
  if (upgrade && inv?.id) { db.billing.upgrades[inv.id] = { from: from.id, to: plan.id, fromPrice: from.priceUsd, toPrice: plan.priceUsd, extraCredits: plan.credits - from.credits, at: now() }; save(); }
  applySub(user, s);
  await syncUser(user);
  return { mode: 'stripe', plan: user.plan, upgrade };
}

export async function setCancel(user, cancel) {
  await syncUser(user);
  if (!hasLivePlan(user)) throw new BillingError('You do not have a paid plan to change.', 409, 'no_subscription');
  if (user.sub.demo) { const prev = { ...user.sub }; user.sub.cancelAtPeriodEnd = !!cancel; user.sub.cancelAt = cancel ? user.sub.currentPeriodEnd : null; subChanged(user, prev); save(); return user.sub; }
  const s = await stripe('/subscriptions/' + encodeURIComponent(user.sub.id), { cancel_at_period_end: cancel ? 'true' : 'false' });
  applySub(user, s); save();
  return user.sub;
}

/** What the browser needs to know about this person's plan. */
export function billingView(user) {
  const s = user.sub;
  const plan = planById(user.plan) || PLANS[0];
  return {
    trial: user.plan === 'free' && !user.everSubscribed,
    plan: plan.id,
    status: s ? s.status : user.plan === 'free' ? 'trial' : 'active',
    // A monthly plan that can be switched, cancelled or renewed. An account can hold a paid plan without one:
    // a plan bought as a one-time purchase before monthly plans existed, or one set by an admin.
    hasSub: hasLivePlan(user),
    renewsAt: s && !s.cancelAtPeriodEnd && LIVE.includes(s.status) ? s.currentPeriodEnd : null,
    endsAt: s && s.cancelAtPeriodEnd && LIVE.includes(s.status) ? s.cancelAt || s.currentPeriodEnd : null,
    paused: !!s?.paused,
    demo: !!s?.demo || !stripeReady(),
    portal: stripeReady() && !!user.stripeCustomerId,
    card: user.card || null,
    openInvoices: (user.openInvoices || []).filter((i) => i.url),
    nextPayment: s && !s.cancelAtPeriodEnd && (s.status === 'active' || s.status === 'trialing') && planById(s.planId) ? { amountUsd: planById(s.planId).priceUsd, at: s.currentPeriodEnd } : null,
  };
}

// ---------- webhook ----------
export function verifySignature(raw, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(String(header).split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1)]; }).filter(([k]) => k !== 'v1'));
  const sigs = String(header).split(',').filter((kv) => kv.trim().startsWith('v1=')).map((kv) => kv.trim().slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return sigs.some((s) => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}
export async function handleEvent(evt, { finishPack } = {}) {
  if (db.billing.events.includes(evt.id)) return 'duplicate';
  const o = evt.data?.object || {};
  let user = (o.customer && db.users.find((u) => u.stripeCustomerId === (o.customer.id || o.customer)))
    || db.users.find((u) => u.id === (o.client_reference_id || o.metadata?.userId));
  if (!user) return 'unknown customer';
  if (evt.type === 'checkout.session.completed' && o.mode === 'payment' && finishPack) await finishPack(user, o.id);
  if (/^(checkout\.session|invoice|customer\.subscription)\./.test(evt.type)) await syncUser(user);
  db.billing.events.push(evt.id);
  if (db.billing.events.length > 1000) db.billing.events.splice(0, 500);
  save();
  return 'ok';
}

// ---------- background: catch renewals and failed payments even without a webhook ----------
let sweepTimer = null;
export function startBillingSweep(everyMs = 30 * 60e3) {
  if (sweepTimer || !subsOn()) return;
  const run = async () => {
    const soon = Date.now() + 5 * 60e3;
    for (const u of db.users.filter((x) => x.sub && (LIVE.includes(x.sub.status) || x.sub.status === 'unpaid' || x.sub.status === 'incomplete'))) {
      const due = !u.sub.currentPeriodEnd || Date.parse(u.sub.currentPeriodEnd) <= soon || u.sub.status !== 'active';
      if (due) await syncUser(u).catch((e) => console.warn('Billing sync failed for one account:', e.message));
    }
  };
  sweepTimer = setInterval(run, everyMs); sweepTimer.unref?.();
  setTimeout(run, 5e3).unref?.();
}

// ---------- payment history ----------
const DESC = (p) => {
  const plan = planById(p.offerId);
  if (p.kind === 'subscription') return p.reason === 'subscription_cycle' ? `${plan?.name || 'Plan'} plan, monthly renewal` : p.reason === 'subscription_update' ? `Upgrade to ${plan?.name || 'a bigger plan'}, rest of the month` : `${plan?.name || 'Plan'} plan, first month`;
  if (plan) return `${plan.name} plan`;
  return p.credits ? `Credit pack, ${Number(p.credits).toLocaleString('en-US')} credits` : 'Payment';
};
export function paymentHistory(user) {
  return db.payments
    .filter((p) => p.userId === user.id && p.status === 'paid')
    .sort((a, b) => { const sec = (x) => Math.floor(Date.parse(x.paidAt || x.createdAt) / 1000); return sec(b) - sec(a) || String(b.createdAt).localeCompare(String(a.createdAt)); })
    .map((p) => ({ id: p.id, at: p.paidAt || p.createdAt, desc: DESC(p), amountUsd: p.amountUsd, credits: p.credits || 0, demo: p.mode === 'demo', number: p.invoiceNumber || null, invoiceUrl: p.invoiceUrl || null, invoicePdf: p.invoicePdf || null }));
}
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** A printable receipt made from the app's own records (every payment, demo ones included). */
export function receiptHtml(user, paymentId) {
  const p = paymentHistory(user).find((x) => x.id === paymentId);
  if (!p) return null;
  const seller = process.env.RECEIPT_SELLER || 'ADXL PTY LTD, Victoria, Australia';
  const support = process.env.SUPPORT_EMAIL || '';
  const date = new Date(p.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(p.number || p.id)}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#111;background:#f4f4f5;margin:0;padding:24px}main{max-width:620px;margin:auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06)}h1{font-size:22px;margin:0 0 4px}.m{color:#666;font-size:13px}table{width:100%;border-collapse:collapse;margin:22px 0}td{padding:10px 0;border-bottom:1px solid #eee}td.r{text-align:right}tr.t td{font-weight:700;border-bottom:0}.demo{background:#fff6e0;border:1px solid #f3d38b;padding:8px 12px;border-radius:8px;font-size:13px;margin-top:14px}button{margin-top:18px;padding:9px 16px;border-radius:999px;border:1px solid #ccc;background:#fff;font:inherit;cursor:pointer}@media print{body{background:#fff;padding:0}main{box-shadow:none}button{display:none}}</style></head>
<body><main><h1>Scenly receipt</h1><div class="m">${esc(seller)}${support ? ' · ' + esc(support) : ''}</div>
<p><b>Billed to</b><br>${esc(user.name)}<br>${esc(user.email)}</p>
<p class="m">Receipt ${esc(p.number || p.id)} · Paid ${esc(date)}</p>
<table><tr><td>${esc(p.desc)}${p.credits ? `<div class="m">${Number(p.credits).toLocaleString('en-US')} credits added</div>` : ''}</td><td class="r">$${Number(p.amountUsd).toFixed(2)} USD</td></tr>
<tr class="t"><td>Total paid</td><td class="r">$${Number(p.amountUsd).toFixed(2)} USD</td></tr></table>
${p.demo ? '<div class="demo">Demo mode: no card was charged for this payment.</div>' : p.invoicePdf ? '<p class="m">The official invoice for this payment can be downloaded from your billing page.</p>' : ''}
<button onclick="window.print()">Print or save as PDF</button></main></body></html>`;
}
