// Payments. With STRIPE_SECRET_KEY set, purchases go through Stripe Checkout
// (one-time charges; recurring subscriptions are a production follow-up).
// Without it, the app runs in demo mode and grants credits immediately.
import db, { save, id, now } from './db.js';
import { grant } from './credits.js';
import { subsOn, ensureCustomer, syncUser, invoiceLinks, stripe as stripeApi } from './billing.js';

export const paymentMode = () => (process.env.STRIPE_SECRET_KEY ? 'stripe' : 'demo');

async function stripe(pathname, params, method = 'POST') {
  const res = await fetch((process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '') + '/v1' + pathname, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? new URLSearchParams(params) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error?.message || 'Stripe error');
  return j;
}

function applyOffer(user, offer, payment) {
  if (payment.status === 'paid') return;
  payment.status = 'paid';
  payment.paidAt = now();
  grant(user, offer.credits, 'purchase', `${offer.kind === 'plan' ? offer.name + ' plan' : offer.name} · $${offer.priceUsd}`, { paymentId: payment.id });
  if (offer.kind === 'plan') {
    user.plan = offer.id;
    user.planRenewsAt = new Date(Date.now() + 30 * 864e5).toISOString();
  }
  save();
}

export async function startCheckout(user, offer) {
  const payment = { id: id('pay_'), userId: user.id, offerId: offer.id, amountUsd: offer.priceUsd, credits: offer.credits, status: 'pending', mode: paymentMode(), createdAt: now() };
  db.payments.push(payment);
  if (paymentMode() === 'demo') {
    applyOffer(user, offer, payment);
    return { mode: 'demo', granted: offer.credits };
  }
  const base = process.env.PUBLIC_URL || 'http://localhost:3000';
  const session = await stripe('/checkout/sessions', {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(offer.priceUsd * 100)),
    'line_items[0][price_data][product_data][name]': `Scenly ${offer.kind === 'plan' ? offer.name + ' plan' : offer.name}`,
    client_reference_id: payment.id,
    ...(subsOn() ? { customer: await ensureCustomer(user), 'metadata[userId]': user.id, 'metadata[paymentId]': payment.id, 'invoice_creation[enabled]': 'true' } : { customer_email: user.email }),
    success_url: `${base}/api/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/#/billing`,
  });
  payment.stripeSession = session.id;
  save();
  return { mode: 'stripe', url: session.url };
}

export async function finishCheckout(user, sessionId) {
  if (paymentMode() !== 'stripe' || !sessionId) return;
  if (subsOn()) {
    // A plan checkout: the plan and its credits are read back from Stripe.
    const pending = db.payments.find((p) => p.stripeSession === sessionId && p.userId === user.id);
    if (pending?.kind === 'checkout') return syncUser(user);
    if (!pending) { const s = await stripeApi('/checkout/sessions/' + encodeURIComponent(sessionId), null, 'GET'); if (s.mode === 'subscription' && (s.client_reference_id === user.id || s.metadata?.userId === user.id)) return syncUser(user); return; }
  }
  const payment = db.payments.find((p) => p.stripeSession === sessionId && p.userId === user.id);
  if (!payment || payment.status === 'paid') return;
  const s = await stripe('/checkout/sessions/' + encodeURIComponent(sessionId), null, 'GET');
  if (s.payment_status === 'paid') {
    const { findOffer } = await import('./credits.js');
    applyOffer(user, findOffer(payment.offerId), payment);
    // Packs bought with subscriptions on get a Stripe invoice: keep its links for the payment history.
    if (subsOn() && s.invoice) {
      payment.stripeInvoice = typeof s.invoice === 'string' ? s.invoice : s.invoice.id;
      try { Object.assign(payment, invoiceLinks(typeof s.invoice === 'string' ? await stripeApi('/invoices/' + encodeURIComponent(s.invoice), null, 'GET') : s.invoice)); save(); } catch { /* the next sync fills them in */ }
    }
  }
}
