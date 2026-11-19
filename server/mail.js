// Outgoing email transport.
// - MANDRILL_API_KEY set: sends through Mandrill (Mailchimp Transactional). If Mandrill fails and SMTP_HOST is
//   also set, the same message is retried over SMTP.
// - SMTP_HOST set (no Mandrill key): sends over SMTP.
// - MAIL_OUTBOX=1: writes messages to data/outbox.json instead (used by the tests).
// - Nothing set: the message is printed in the server window and the app carries on.
// MAIL_FROM is the sender (default "Scenly <no-reply@scenly.ai>"), MAIL_REPLY_TO the reply address (default info@adxl.ai).
// The templates live in server/emails.js.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

const OUTBOX = path.join(DATA_DIR, 'outbox.json');
export const mailMode = () => (process.env.MANDRILL_API_KEY ? 'mandrill' : process.env.SMTP_HOST ? 'smtp' : process.env.MAIL_OUTBOX ? 'outbox' : 'none');
export const mailReady = () => mailMode() !== 'none';
export const baseUrl = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

function sender() {
  const raw = (process.env.MAIL_FROM || 'Scenly <no-reply@scenly.ai>').trim();
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || 'Scenly', email: m[2].trim() } : { name: 'Scenly', email: raw };
}
const replyTo = () => process.env.MAIL_REPLY_TO || 'info@adxl.ai';

let transport = null;
async function smtp() {
  if (!transport) {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}
async function viaSmtp(msg) {
  const f = sender();
  const t = await smtp();
  await t.sendMail({ from: `${f.name} <${f.email}>`, replyTo: replyTo(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
}

async function viaMandrill(msg) {
  const f = sender();
  const res = await fetch((process.env.MANDRILL_API_BASE || 'https://mandrillapp.com/api/1.0').replace(/\/$/, '') + '/messages/send.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: process.env.MANDRILL_API_KEY,
      message: {
        subject: msg.subject, html: msg.html, text: msg.text,
        from_email: f.email, from_name: f.name,
        to: [{ email: msg.to, name: msg.toName || undefined, type: 'to' }],
        headers: { 'Reply-To': replyTo() },
        // Account links and codes must reach the person exactly as sent: no click or open tracking.
        track_opens: false, track_clicks: false, auto_text: false, inline_css: false, url_strip_qs: false,
        preserve_recipients: false, important: !!msg.important,
        tags: msg.tag ? [String(msg.tag).slice(0, 50)] : undefined,
        ...(process.env.MANDRILL_SUBACCOUNT ? { subaccount: process.env.MANDRILL_SUBACCOUNT } : {}),
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  let j = null; try { j = await res.json(); } catch { /* not JSON */ }
  // Errors come back as { status: 'error', name, message }; never echo the key.
  if (!res.ok || !Array.isArray(j)) throw new Error(`Mandrill ${res.status}: ${j?.name || 'error'}${j?.message ? ' (' + String(j.message).slice(0, 160) + ')' : ''}`);
  const r = j[0] || {};
  if (r.status === 'rejected' || r.status === 'invalid') throw new Error(`Mandrill ${r.status}${r.reject_reason ? ': ' + r.reject_reason : ''}`);
  return r;
}

/**
 * Sends one email: { to, toName, subject, html, text, tag, important, meta }.
 * Returns false when no mail service is set up (the main link or code is printed in the server window instead).
 */
export async function deliver(msg) {
  const mode = mailMode();
  if (mode === 'none') {
    console.log(`\n[email not set up] ${msg.subject} for ${msg.to}${msg.meta?.url ? `:\n  ${msg.meta.url}` : ''}${msg.meta?.code ? `\n  code ${msg.meta.code}` : ''}\n`);
    return false;
  }
  if (mode === 'outbox') {
    let box = []; try { box = JSON.parse(fs.readFileSync(OUTBOX, 'utf8')); } catch {}
    box.push({ to: msg.to, subject: msg.subject, tag: msg.tag || null, ...(msg.meta || {}), at: new Date().toISOString() });
    fs.writeFileSync(OUTBOX, JSON.stringify(box.slice(-200)));
    return true;
  }
  if (mode === 'smtp') { await viaSmtp(msg); return true; }
  try { await viaMandrill(msg); }
  catch (e) {
    if (!process.env.SMTP_HOST) throw e;
    console.warn(`Mandrill failed (${e.message}); sending "${msg.tag || msg.subject}" over SMTP instead.`);
    await viaSmtp(msg);
  }
  return true;
}
