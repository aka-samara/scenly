// Writes every transactional email to data/email-previews/*.html so you can open them in a browser.
// Run: node devtools/email-previews.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PUBLIC_URL ||= pathToFileURL(path.join(root, 'public')).href; // logo loads from disk
const { build } = await import('../server/emails.js');
const out = path.join(root, 'data', 'email-previews'); fs.mkdirSync(out, { recursive: true });
const u = { email: 'sam@example.com', name: 'Sam Lee', credits: 12.5, plan: 'pro' };
const d = { url: 'https://scenly.ai/api/auth/verify?token=example', code: '482913', credits: 2600, balance: 2612.5, desc: '2,600 credits · $25', amountUsd: 25, kind: 'pack', fromName: 'Max', toName: 'Pro', toPrice: 20, toCredits: 2200, renewsAt: Date.now() + 30 * 864e5, endsAt: Date.now() + 30 * 864e5, planName: 'Pro' };
const list = [['verify'], ['welcome', { credits: 100 }], ['reset'], ['password_changed'], ['credits_added'], ['credits_added', { kind: 'create', desc: 'Pro plan · first month · $20', amountUsd: 20, credits: 2200, balance: 2300 }, 'plan'], ['low_credits', { balance: 14 }], ['out_of_credits', { balance: 0 }], ['plan_downgraded'], ['plan_cancel'], ['plan_cancel', { undone: true }, 'undone'], ['plan_ended'], ['payment_failed']];
let idx = '<meta charset="utf-8"><title>Scenly emails</title><body style="font-family:sans-serif;padding:24px"><h2>Scenly emails</h2><ul>';
for (const [k, x = {}, suffix] of list) {
  const m = build(k, u, { ...d, ...x }); const f = `${k}${suffix ? '-' + suffix : ''}`;
  fs.writeFileSync(path.join(out, f + '.html'), m.html); fs.writeFileSync(path.join(out, f + '.txt'), m.text);
  idx += `<li><a href="${f}.html">${f}</a> · ${m.subject.replace(/</g, '&lt;')} · <a href="${f}.txt">text</a></li>`;
}
fs.writeFileSync(path.join(out, 'index.html'), idx + '</ul>');
console.log('Open ' + path.join(out, 'index.html'));
