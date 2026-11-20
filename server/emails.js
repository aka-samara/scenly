// Transactional emails: one branded layout and the short list of messages Scenly sends.
//
//   verify            sign up: confirmation link + 6-digit code (the code can be typed on the sign-up page)
//   welcome           first time an account is ready (after confirming, Google sign-in, or straight away with no mail service)
//   reset             "forgot password" link
//   password_changed  security notice after a reset or a change in settings
//   credits_added     receipt for every paid grant: credit pack, first plan payment, renewal, upgrade
//   low_credits       balance fell under LOW_CREDIT_ALERT (default 1,000) credits; sent once until topped up
//   credits_expiring  top-up credits with a balance expire within 7 days (one email per pack)
//   out_of_credits    balance is (nearly) zero or a job was refused for lack of credits; once until topped up
//   plan_downgraded   moved to a smaller plan
//   plan_cancel       cancellation scheduled (plan runs to the end of the month) or the cancellation was undone
//   plan_ended        the paid plan ended and the account is back on Free
//   payment_failed    a renewal payment did not go through
//
// Every send is best-effort: a failed email is logged and never breaks the action that triggered it,
// except the confirmation and reset emails, whose callers handle the error themselves.
import { deliver, baseUrl } from './mail.js';
import { PLANS } from './credits.js';
import db from './db.js';

const BRAND = { blue: '#4361ee', cyan: '#04d9ff', ink: '#14152a', body: '#45475e', muted: '#8a8ca3', line: '#e6e8f2', page: '#f3f5fb' };
const COMPANY = { name: 'ADXL PTY LTD', address: '447 Collins St, Melbourne VIC 3000, Australia', email: 'info@adxl.ai' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const firstName = (u) => String(u?.name || '').trim().split(/\s+/)[0] || 'there';
const planOf = (pid) => PLANS.find((p) => p.id === pid);
const link = (hash) => `${baseUrl()}/${hash}`;

// ---------- layout ----------
// Table-based so it holds up in Outlook and Gmail. Light only: dark-mode clients get the same look.
export function render({ preheader = '', title, paras = [], code, details, cta, after = [], fine = [], reason }) {
  const p = (t) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${BRAND.body}">${t}</p>`;
  const codeBox = code ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr><td style="background:#eef1fe;border:1px solid #d7ddfc;border-radius:12px;padding:14px 22px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:30px;line-height:36px;letter-spacing:8px;font-weight:700;color:${BRAND.ink}">${esc(code)}</td></tr></table>` : '';
  const rows = (details || []).filter((r) => r && r[1] != null && r[1] !== '').map(([k, v], i, all) => `<tr><td style="padding:10px 0;font-size:14px;color:${BRAND.muted};${i < all.length - 1 ? `border-bottom:1px solid ${BRAND.line};` : ''}">${esc(k)}</td><td align="right" style="padding:10px 0;font-size:14px;font-weight:600;color:${BRAND.ink};${i < all.length - 1 ? `border-bottom:1px solid ${BRAND.line};` : ''}">${esc(v)}</td></tr>`).join('');
  const table = rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-top:1px solid ${BRAND.line};border-bottom:1px solid ${BRAND.line}">${rows}</table>` : '';
  const button = cta ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px"><tr><td bgcolor="${BRAND.blue}" style="border-radius:10px;background:${BRAND.blue};background-image:linear-gradient(100deg,${BRAND.blue},${BRAND.cyan})"><a href="${esc(cta.url)}" target="_blank" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${esc(cta.label)}</a></td></tr></table>` : '';
  const fallback = cta?.fallback ? `<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:${BRAND.muted}">If the button does not work, copy this link into your browser:<br><a href="${esc(cta.url)}" style="color:${BRAND.blue};word-break:break-all">${esc(cta.url)}</a></p>` : '';
  const small = fine.map((t) => `<p style="margin:0 0 10px;font-size:13px;line-height:20px;color:${BRAND.muted}">${t}</p>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${'&#8199;&#65279;&#847; '.repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.page}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<tr><td style="padding:0 4px 18px"><a href="${esc(baseUrl())}" style="text-decoration:none;color:${BRAND.ink}"><img src="${esc(baseUrl())}/icon-192.png" width="32" height="32" alt="" style="vertical-align:middle;border:0;border-radius:8px"><span style="vertical-align:middle;font-size:19px;font-weight:700;letter-spacing:-0.2px;padding-left:10px;color:${BRAND.ink}">Scenly</span></a></td></tr>
<tr><td style="background:#ffffff;border-radius:16px;border:1px solid ${BRAND.line};overflow:hidden">
<div style="height:4px;line-height:4px;font-size:0;background:${BRAND.blue};background-image:linear-gradient(90deg,${BRAND.blue},${BRAND.cyan})">&nbsp;</div>
<div style="padding:32px 32px 18px">
<h1 style="margin:0 0 16px;font-size:23px;line-height:30px;font-weight:700;color:${BRAND.ink}">${esc(title)}</h1>
${paras.map(p).join('')}${codeBox}${table}${button}${after.map(p).join('')}${fallback}${small}
</div></td></tr>
<tr><td style="padding:22px 8px 0;font-size:12px;line-height:19px;color:${BRAND.muted};text-align:center">
${reason ? esc(reason) + '<br>' : ''}Questions? Reply to this email or write to <a href="mailto:${COMPANY.email}" style="color:${BRAND.muted}">${COMPANY.email}</a>.<br>
<a href="${esc(link('#/billing'))}" style="color:${BRAND.muted}">Billing</a> &nbsp;·&nbsp; <a href="${esc(link('#/terms'))}" style="color:${BRAND.muted}">Terms</a> &nbsp;·&nbsp; <a href="${esc(link('#/privacy'))}" style="color:${BRAND.muted}">Privacy</a><br><br>
Scenly is a product of ${COMPANY.name}<br>${COMPANY.address}
</td></tr></table></td></tr></table></body></html>`;
}

// Plain-text twin of the same blocks, for clients that do not show HTML.
function plain({ title, paras = [], code, details, cta, after = [], fine = [], reason }) {
  const strip = (s) => String(s).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const out = [title, '', ...paras.map(strip).flatMap((x) => [x, ''])];
  if (code) out.push(`    ${code}`, '');
  for (const [k, v] of (details || []).filter((r) => r && r[1] != null && r[1] !== '')) out.push(`${k}: ${v}`);
  if (details?.length) out.push('');
  if (cta) out.push(`${cta.label}: ${cta.url}`, '');
  out.push(...after.map(strip).flatMap((x) => [x, '']), ...fine.map(strip).flatMap((x) => [x, '']));
  out.push('--', reason || '', `Questions? Write to ${COMPANY.email}.`, `Scenly is a product of ${COMPANY.name}, ${COMPANY.address}`);
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim() + '\n';
}

const ACCOUNT_REASON = 'You are receiving this because you have a Scenly account.';

/** Builds { subject, html, text } for one email kind. Exported for previews and tests. */
export function build(kind, user, d = {}) {
  const hi = `Hi ${esc(firstName(user))},`;
  const T = {
    verify: () => ({
      subject: `${d.code} is your Scenly confirmation code`,
      preheader: `Confirm your email to start your free trial. Code: ${d.code}`,
      title: 'Confirm your email',
      paras: [`${hi} welcome to Scenly. Press the button to confirm <b>${esc(user.email)}</b>, or type this code on the sign-up page:`],
      code: d.code,
      cta: { label: 'Confirm email', url: d.url, fallback: true },
      fine: ['The code works for 30 minutes and the button for 24 hours. If you did not create a Scenly account, you can ignore this email.'],
      reason: 'You are receiving this because this address was used to sign up for Scenly.',
    }),
    welcome: () => ({
      subject: 'Welcome to Scenly',
      preheader: d.credits > 0 ? `Your ${fmtNum(d.credits)} free credits are ready.` : 'Your account is ready.',
      title: 'Your account is ready',
      paras: [`${hi} thanks for joining Scenly. Chat with the latest AI models, create images and videos, and work with your files, all in one place.`,
        d.credits > 0 ? `We have added <b>${fmtNum(d.credits)} free starter credits</b> to your account. Use them in Chat, Image, Video Studio, Docs, Code and AI Apps.` : 'You can start right away.'],
      cta: { label: 'Open Scenly', url: link('#/') },
      after: ['Want the Pro tools (Ad Studio, Video Builder, Video Agent and Studio Pro) or more credits? Monthly plans and top-up packs are on the <a href="' + esc(link('#/billing')) + `" style="color:${BRAND.blue}">billing page</a>.`],
      reason: ACCOUNT_REASON,
    }),
    reset: () => ({
      subject: 'Reset your Scenly password',
      preheader: 'Choose a new password. The link works for 1 hour.',
      title: 'Reset your password',
      paras: [`${hi} we got a request to reset the password for <b>${esc(user.email)}</b>. Press the button to choose a new one.`],
      cta: { label: 'Choose a new password', url: d.url, fallback: true },
      fine: ['This link works for 1 hour and can be used once. If you did not ask for it, ignore this email and your password stays the same.'],
      reason: ACCOUNT_REASON,
    }),
    password_changed: () => ({
      subject: d.created ? 'A password was added to your Scenly account' : 'Your Scenly password was changed',
      preheader: 'If this was you, there is nothing to do.',
      title: d.created ? 'Password added' : 'Your password was changed',
      paras: [`${hi} the password for your Scenly account <b>${esc(user.email)}</b> was ${d.created ? 'set' : 'changed'} on ${esc(fmtDate(Date.now()))}. Other devices have been signed out.`,
        'If this was you, there is nothing else to do.'],
      cta: { label: 'Not you? Reset your password', url: link('#/login') },
      fine: [`If you did not make this change, reset your password straight away and let us know at <a href="mailto:${COMPANY.email}" style="color:${BRAND.muted}">${COMPANY.email}</a>.`],
      reason: 'You are receiving this security notice because you have a Scenly account.',
      important: true,
    }),
    credits_added: () => {
      const titles = { create: `Your ${d.planName} plan is active`, cycle: `Your ${d.planName} plan renewed`, upgrade: `You are now on ${d.planName}`, plan: `Your ${d.planName} plan is active`, pack: 'Credits added' };
      const title = titles[d.kind] || 'Credits added';
      return {
        subject: d.kind === 'pack' || !d.planName ? `${fmtNum(d.credits)} credits added to your Scenly account` : `${title} · ${fmtNum(d.credits)} credits added`,
        preheader: `Payment received. New balance: ${fmtNum(d.balance)} credits.`,
        title,
        paras: [`${hi} thanks for your payment. Your credits are ready to use, including the Pro tools.`,
          d.kind === 'pack' ? `These top-up credits are valid for 90 days, until <b>${esc(fmtDate(d.expiresAt))}</b>. If you also have a monthly plan, your plan credits are used first.`
          : d.kind === 'upgrade' ? 'These credits belong to this billing month and expire with the rest of your plan credits when your plan renews.'
          : `Plan credits are valid for one billing month${d.expiresAt ? `, until <b>${esc(fmtDate(d.expiresAt))}</b>` : ''}. Unused plan credits expire when your plan renews and do not roll over.`],
        details: [['Item', d.desc], ['Amount paid', d.amountUsd != null ? `US$${Number(d.amountUsd).toFixed(2)}` : null], ['Credits added', fmtNum(d.credits)], d.expiresAt ? ['Valid until', fmtDate(d.expiresAt)] : null, ['New balance', `${fmtNum(d.balance)} credits`], ['Date', fmtDate(Date.now())], d.renewsAt ? ['Next renewal', fmtDate(d.renewsAt)] : null],
        cta: { label: 'Start creating', url: link('#/') },
        after: [`Invoices and receipts are on your <a href="${esc(link('#/billing'))}" style="color:${BRAND.blue}">billing page</a>.`],
        reason: ACCOUNT_REASON,
      };
    },
    low_credits: () => ({
      subject: `You have ${fmtNum(d.balance)} Scenly credits left`,
      preheader: 'Top up or pick a plan so your next creation does not stop halfway.',
      title: 'Your credits are running low',
      paras: [`${hi} your balance is down to <b>${fmtNum(d.balance)} credits</b>. Image and video generation stop when credits run out, and the Pro tools pause at zero, so now is a good time to top up.`,
        user.plan && user.plan !== 'free' ? 'Top-up packs work alongside your plan and stay valid for 90 days. You can buy as many as you like, at any time; your plan credits are always used first.' : 'Top-up packs are valid for 90 days with no subscription needed, or pick a monthly plan for fresh credits every month.'],
      cta: { label: 'Get more credits', url: link('#/billing') },
      reason: ACCOUNT_REASON,
    }),
    out_of_credits: () => ({
      subject: 'You are out of Scenly credits',
      preheader: 'Add credits to keep creating.',
      title: 'You are out of credits',
      paras: [`${hi} your Scenly balance is <b>${fmtNum(d.balance)} credits</b>, which is not enough for new chats, images or videos.`,
        'Your work is safe. Add a top-up pack or choose a plan and you can pick up right where you left off. Pro tools (Ad Studio, Video Builder, Video Agent and Studio Pro) are paused until then.'],
      cta: { label: 'Add credits', url: link('#/billing') },
      reason: ACCOUNT_REASON,
    }),
    credits_expiring: () => {
      const n = (d.packs || []).reduce((t, p) => t + p.credits, 0), first = (d.packs || [])[0];
      return {
        subject: `${fmtNum(Math.floor(n))} Scenly top-up credits expire ${first ? 'on ' + fmtDate(first.expiresAt) : 'soon'}`,
        preheader: 'Use them before they expire.',
        title: 'Your top-up credits expire soon',
        paras: [`${hi} top-up credits are valid for 90 days from purchase. Some of yours expire within the next week:`],
        details: (d.packs || []).map((p) => [`Expires ${fmtDate(p.expiresAt)}`, `${fmtNum(Math.floor(p.credits))} credits`]),
        after: ['Scenly always spends your monthly plan credits first, then the top-up credits that expire soonest.'],
        cta: { label: 'Use my credits', url: link('#/') },
        reason: ACCOUNT_REASON,
      };
    },
    plan_downgraded: () => ({
      subject: `Your Scenly plan is changing to ${d.toName}`,
      preheader: `From your next renewal you pay US$${d.toPrice} a month.`,
      title: `You moved to ${d.toName}`,
      paras: [`${hi} your plan has changed from ${esc(d.fromName)} to <b>${esc(d.toName)}</b>.`,
        `From your next renewal${d.renewsAt ? ' on ' + esc(fmtDate(d.renewsAt)) : ''} you pay US$${d.toPrice} a month and get ${fmtNum(d.toCredits)} credits each month. Your current plan credits stay until then; any left at renewal expire. Top-up credits are not affected.`],
      cta: { label: 'Manage your plan', url: link('#/billing') },
      reason: ACCOUNT_REASON,
    }),
    plan_cancel: () => (d.undone ? {
      subject: `Your Scenly ${d.planName} plan will continue`,
      preheader: 'Your cancellation was undone.',
      title: `${d.planName} will continue`,
      paras: [`${hi} your cancellation was undone. Your ${esc(d.planName)} plan stays active${d.renewsAt ? ' and renews on ' + esc(fmtDate(d.renewsAt)) : ''}.`],
      cta: { label: 'Manage your plan', url: link('#/billing') },
      reason: ACCOUNT_REASON,
    } : {
      subject: `Your Scenly ${d.planName} plan has been cancelled`,
      preheader: d.endsAt ? `You keep ${d.planName} until ${fmtDate(d.endsAt)}.` : 'Your plan will not renew.',
      title: 'Your plan has been cancelled',
      paras: [`${hi} we have cancelled your ${esc(d.planName)} plan as asked. You keep everything in ${esc(d.planName)}${d.endsAt ? ' until <b>' + esc(fmtDate(d.endsAt)) + '</b>' : ' until the end of this billing month'}, and you will not be charged again.`,
        'Plan credits can be used until the plan ends and expire then. Top-up credits stay valid for 90 days from purchase. Changed your mind? You can keep your plan with one click.'],
      cta: { label: 'Keep my plan', url: link('#/billing') },
      reason: ACCOUNT_REASON,
    }),
    plan_ended: () => ({
      subject: `Your Scenly ${d.fromName} plan has ended`,
      preheader: 'Your account is now on Free. Your work is still there.',
      title: 'Your plan has ended',
      paras: [`${hi} your ${esc(d.fromName)} plan has ended and your account is now on Free.`,
        `Unused plan credits expired with the plan. ${user.credits > 0.5 ? `You still have <b>${fmtNum(Math.floor(user.credits))} credits</b> (top-up or free credits) and` : 'All'} your work is still here. You can pick a plan or buy a top-up pack at any time.`],
      cta: { label: 'See plans', url: link('#/billing') },
      reason: ACCOUNT_REASON,
    }),
    payment_failed: () => ({
      subject: 'Action needed: your Scenly payment did not go through',
      preheader: 'Update your card to keep your plan.',
      title: 'Your payment did not go through',
      paras: [`${hi} we could not take the payment for your ${esc(d.planName || 'Scenly')} plan. This usually means the card expired or the bank declined it.`,
        'Please update your card. We will try again automatically, and your plan stays active while we do.'],
      cta: { label: 'Update payment details', url: link('#/billing') },
      reason: ACCOUNT_REASON,
      important: true,
    }),
  }[kind];
  if (!T) throw new Error('Unknown email: ' + kind);
  const spec = T();
  return { subject: spec.subject, html: render(spec), text: plain(spec), important: !!spec.important };
}

/** Sends one kind of email to a user. Throws on failure (callers that must not fail use notify). */
export async function sendEmail(kind, user, d = {}) {
  if (!user?.email) return false;
  const m = build(kind, user, d);
  return deliver({ to: user.email, toName: user.name, subject: m.subject, html: m.html, text: m.text, tag: kind, important: m.important, meta: { kind, url: d.url, code: d.code } });
}

/** Fire and forget: never throws, never blocks the request. */
export function notify(kind, user, d = {}) {
  if (!user?.email || user.banned || /\.test$/i.test(user.email)) return;
  sendEmail(kind, user, d).catch((e) => console.error(`email ${kind} failed:`, e.message));
}

// ---------- triggers used by credits and billing ----------
const OUT_AT = 10; // under one US cent of credits counts as none left
export const LOW_CREDIT_AT = () => { const v = Number(process.env.LOW_CREDIT_ALERT ?? 1000); return Number.isFinite(v) && v >= 0 ? v : 1000; };
// Accounts with only free starter credits get the warning later (at 200), so a new account is not told its
// balance is low right after its first chat.
const paidLeft = (u) => (u.plan && u.plan !== 'free') || (!!u.wallet?.sub && !u.wallet.sub.expired && u.wallet.sub.credits > 0) || (u.wallet?.packs || []).some((p) => !p.expired && p.credits > 0);
export const lowAtFor = (u) => (u && !paidLeft(u) ? Math.min(LOW_CREDIT_AT(), 200) : LOW_CREDIT_AT());
const rank = { low: 1, out: 2 };

/** After credits change: warn once when the balance gets low or runs out, and re-arm after a top-up. */
export function checkBalance(user, { refused = false, rearmOnly = false } = {}) {
  if (!user) return;
  const bal = Number(user.credits || 0);
  const lowAt = lowAtFor(user);
  const level = bal < OUT_AT || (refused && bal < lowAt) ? 'out' : bal < lowAt ? 'low' : null;
  if (!level) { if (user.creditAlert) delete user.creditAlert; return; }
  if (rearmOnly) return; // credits going in never trigger a warning
  if ((rank[user.creditAlert] || 0) >= rank[level]) return;
  user.creditAlert = level;
  notify(level === 'out' ? 'out_of_credits' : 'low_credits', user, { balance: Math.max(0, Math.round(bal * 100) / 100) });
}

/** Receipt for a paid grant. Works out what was bought from the payment record. */
export function purchaseReceipt(user, credits, desc, paymentId, expiresAt) {
  const pay = paymentId && db.payments.find((p) => p.id === paymentId);
  const plan = planOf(pay?.offerId);
  const kind = pay?.kind === 'subscription'
    ? ({ subscription_create: 'create', subscription_cycle: 'cycle', subscription_update: 'upgrade' }[pay.reason] || 'pack')
    : plan ? 'plan' : 'pack';
  notify('credits_added', user, {
    kind, planName: plan?.name, desc, credits, balance: user.credits, amountUsd: pay?.amountUsd, expiresAt,
    renewsAt: kind !== 'pack' && kind !== 'upgrade' ? user.sub?.currentPeriodEnd || user.planRenewsAt : null,
  });
}

/** Top-up credits that expire within a week. */
export function creditsExpiring(user, packs) { if (packs?.length) notify('credits_expiring', user, { packs }); }

/** Plan changes recorded by notePlan. Upgrades and new plans are covered by their payment receipt. */
export function planChanged(user, from, to, kind) {
  const f = planOf(from), t = planOf(to);
  if (kind === 'downgraded' && t) notify('plan_downgraded', user, { fromName: f?.name || from, toName: t.name, toPrice: t.priceUsd, toCredits: t.credits, renewsAt: user.sub?.currentPeriodEnd });
  else if (to === 'free' && f && f.priceUsd > 0) notify('plan_ended', user, { fromName: f.name });
}

/** Compares a subscription before and after a change: cancellation set or undone, payment failed. */
export function subChanged(user, before) {
  const s = user.sub;
  if (!before || !s) return;
  const planName = planOf(s.planId)?.name || planOf(user.plan)?.name || 'paid';
  const live = ['active', 'trialing', 'past_due'].includes(s.status);
  if (live && !before.cancelAtPeriodEnd && s.cancelAtPeriodEnd) notify('plan_cancel', user, { planName, endsAt: s.cancelAt || s.currentPeriodEnd });
  else if (live && before.cancelAtPeriodEnd && !s.cancelAtPeriodEnd) notify('plan_cancel', user, { planName, undone: true, renewsAt: s.currentPeriodEnd });
  if (s.status === 'past_due' && before.status !== 'past_due') notify('payment_failed', user, { planName });
}
