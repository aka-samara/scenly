// Scenly admin console: overview analytics, users and subscriptions, usage by area and model,
// model / gateway error log with performance stats, admin activity and system settings.
// Loaded only when an admin opens #/admin. Every call goes to /api/admin/*, which checks ADMIN_EMAILS on the server.
import { h, $, icon, S, api, toast, errToast, dialog, field, topbar, fmtCredits, byId, shortName, modelLogo } from './app.js';

if (!$('#admin-css')) document.head.append(h('link', { id: 'admin-css', rel: 'stylesheet', href: '/admin.css' }));

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'chart' },
  { id: 'users', label: 'Users', icon: 'user' },
  { id: 'usage', label: 'Usage', icon: 'bolt' },
  { id: 'errors', label: 'Errors & speed', icon: 'info' },
  { id: 'activity', label: 'Admin activity', icon: 'history' },
  { id: 'system', label: 'System', icon: 'sliders' },
];
const STATUS = {
  free: ['Free', 'st-free'], upgraded: ['Upgraded', 'st-up'], downgraded: ['Downgraded', 'st-down'], cancelling: ['Cancelling', 'st-warn'],
  cancelled: ['Cancelled', 'st-off'], paused: ['Paused', 'st-pause'], past_due: ['Payment failed', 'st-bad'], banned: ['Banned', 'st-bad'],
};
const AREA_COLORS = { chat: '#4361ee', code: '#7c8cff', docs: '#22b8cf', image: '#f59f00', video: '#e8590c', agent: '#d6336c', builder: '#ae3ec9', pro: '#04d9ff', apps: '#40c057', enhance: '#94d82d', other: '#868e96' };
const KIND_LABEL = { model: 'Model failure', response: 'Response failure', gateway: 'API / gateway', video_task: 'Video task failed', job: 'Background job', server: 'Server error' };

let live = 0;
const st = { days: 30, users: { q: '', status: '', plan: '', sort: 'createdAt' }, errors: { days: 7, kind: '', model: '', q: '' }, usageDays: 30 };

// ---------- small helpers ----------
const n0 = (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-US'));
const usd = (n, d = 2) => (n == null ? '–' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const cr = (n) => (n == null ? '–' : fmtCredits(Math.abs(n)) === '0' && n !== 0 ? (n < 0 ? '-' : '') + '<0.01' : (n < 0 ? '−' : '') + fmtCredits(Math.abs(n)));
const ms = (v) => (v == null ? '–' : v >= 10000 ? (v / 1000).toFixed(0) + ' s' : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : v + ' ms');
const when = (iso) => { if (!iso) return '–'; const d = new Date(iso); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
const whenTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
const ago = (iso) => { if (!iso) return '–'; const s = (Date.now() - Date.parse(iso)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago'; return when(iso); };
const modelName = (mid) => (mid && byId(mid) ? shortName(byId(mid)) : mid || '–');
const modelCell = (mid) => (mid && byId(mid) ? h('span', { class: 'mname' }, modelLogo(byId(mid), 'logo-sm'), shortName(byId(mid))) : h('span', { class: 'mono dim' }, mid || '–'));
const badge = (status) => { const [label, cls] = STATUS[status] || [status, 'st-free']; return h('span', { class: 'adm-badge ' + cls }, label); };
const planChip = (name, plan) => h('span', { class: 'adm-plan p-' + (plan || 'free') }, name || 'Free');
const delta = (cur, prev) => { if (!prev) return null; const p = Math.round(((cur - prev) / prev) * 100); return h('span', { class: 'delta ' + (p >= 0 ? 'up' : 'down') }, (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p) + '%'); };
const kpi = (label, value, sub, extra) => h('div', { class: 'adm-kpi' }, h('small', {}, label), h('b', {}, value), (sub || extra) && h('div', { class: 'kpi-sub' }, extra, sub && h('span', {}, sub)));
const card = (title, body, right) => h('section', { class: 'adm-card' }, (title || right) && h('div', { class: 'adm-card-h' }, h('h3', {}, title), right), body);
const empty = (t) => h('div', { class: 'adm-empty' }, t);
const table = (cols, rows, opts = {}) => rows.length
  ? h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-t' + (opts.dense ? ' dense' : '') },
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.num ? 'num' : '' }, c.label)))),
    h('tbody', {}, rows.map((r) => h('tr', { class: opts.onRow ? 'click' : '', onclick: opts.onRow ? () => opts.onRow(r) : null }, cols.map((c) => h('td', { class: (c.num ? 'num ' : '') + (c.cls || '') }, c.get(r))))))))
  : empty(opts.empty || 'Nothing here yet.');
const sel = (value, options, onchange) => h('select', { class: 'adm-in', onchange: (e) => onchange(e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
function confirmBox({ title, text, ok = 'Confirm', danger, input, onOk }) {
  const inp = input ? h(input.area ? 'textarea' : 'input', { type: input.type || 'text', class: 'adm-in', placeholder: input.placeholder || '', value: input.value || '', rows: 3 }) : null;
  const extra = input?.extra ? h('input', { type: 'text', class: 'adm-in', placeholder: input.extra }) : null;
  const go = h('button', { class: 'btn ' + (danger ? 'adm-danger' : 'primary'), onclick: async () => {
    go.disabled = true;
    try { await onOk(inp?.value, extra?.value); box.remove(); } catch (e) { errToast(e); go.disabled = false; }
  } }, ok);
  const box = dialog({ title, body: h('div', { class: 'adm-dlg' }, h('p', {}, text), inp && field(input.label || '', inp), extra && field(input.extraLabel || '', extra)), foot: [h('button', { class: 'btn ghost', onclick: () => box.remove() }, 'Cancel'), go] });
  box.classList.add('adm-modal');
}

// ---------- charts (plain SVG) ----------
function lineChart(points, { color = '#f5a524', fmt = (v) => v, height = 150 } = {}) {
  const W = 640, H = height, P = 26;
  const max = Math.max(1, ...points.map((p) => p.v));
  const x = (i) => P + (i * (W - P * 2)) / Math.max(1, points.length - 1);
  const y = (v) => H - 20 - (v / max) * (H - 40);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${path}L${x(points.length - 1)},${H - 20}L${x(0)},${H - 20}Z`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="adm-svg" role="img"><line x1="${P}" x2="${W - P}" y1="${H - 20}" y2="${H - 20}" class="ax"/><line x1="${P}" x2="${W - P}" y1="20" y2="20" class="grid"/><text x="${P}" y="14" class="lbl">${fmt(max)}</text><path d="${area}" fill="${color}" opacity=".14"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="7" fill="transparent"><title>${p.label}: ${fmt(p.v)}</title></circle>`).join('')}<text x="${P}" y="${H - 4}" class="lbl">${points[0]?.label || ''}</text><text x="${W - P}" y="${H - 4}" class="lbl" text-anchor="end">${points[points.length - 1]?.label || ''}</text></svg>`;
  return h('div', { html: svg });
}
function stackChart(series, areas, { height = 170 } = {}) {
  const W = 640, H = height, P = 26;
  const tot = series.map((s) => Object.values(s.areas || {}).reduce((a, b) => a + Math.max(0, b), 0));
  const max = Math.max(1, ...tot);
  const bw = (W - P * 2) / series.length;
  let bars = '';
  series.forEach((s, i) => {
    let y0 = H - 20;
    for (const a of areas) {
      const v = Math.max(0, s.areas?.[a.id] || 0); if (!v) continue;
      const hgt = (v / max) * (H - 40);
      bars += `<rect x="${(P + i * bw + 1).toFixed(1)}" y="${(y0 - hgt).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${hgt.toFixed(1)}" fill="${AREA_COLORS[a.id]}" rx="1.5"><title>${s.day} · ${a.label}: ${Math.round(v)} credits</title></rect>`;
      y0 -= hgt;
    }
  });
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="adm-svg" role="img"><line x1="${P}" x2="${W - P}" y1="${H - 20}" y2="${H - 20}" class="ax"/><line x1="${P}" x2="${W - P}" y1="20" y2="20" class="grid"/><text x="${P}" y="14" class="lbl">${Math.round(max).toLocaleString()} credits</text>${bars}<text x="${P}" y="${H - 4}" class="lbl">${series[0]?.day || ''}</text><text x="${W - P}" y="${H - 4}" class="lbl" text-anchor="end">${series[series.length - 1]?.day || ''}</text></svg>`;
  return h('div', {}, h('div', { html: svg }), legend(areas.filter((a) => series.some((s) => s.areas?.[a.id]))));
}
const legend = (areas) => h('div', { class: 'adm-legend' }, areas.map((a) => h('span', {}, h('i', { style: { background: AREA_COLORS[a.id] } }), a.label)));
function barList(items, { fmt = cr, color } = {}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return items.length ? h('div', { class: 'adm-bars' }, items.map((i) => h('div', { class: 'adm-bar' },
    h('div', { class: 'bl' }, i.label), h('div', { class: 'bt' }, h('i', { style: { width: Math.max(1.5, (Math.abs(i.value) / max) * 100) + '%', background: i.color || color || 'var(--a-accent)' } })),
    h('div', { class: 'bv mono' }, fmt(i.value), i.sub && h('small', {}, i.sub))))) : empty('No usage yet.');
}

// ---------- page shell ----------
export async function renderAdmin(tab, sub) {
  const my = ++live;
  tab = TABS.some((t) => t.id === tab) ? tab : 'overview';
  const body = h('div', { class: 'adm-body' }, h('div', { class: 'adm-empty' }, h('span', { class: 'spin' })));
  const root = h('div', { class: 'adm' },
    h('nav', { class: 'adm-tabs' }, TABS.map((t) => h('a', { href: '#/admin/' + t.id, class: t.id === tab ? 'on' : '' }, icon(t.icon), t.label))),
    body,
  );
  const title = h('div', { class: 'adm-title' }, h('span', { class: 'adm-shield' }, icon('lock')), h('div', {}, h('small', {}, 'SCENLY'), h('b', {}, 'Admin console')), h('span', { class: 'adm-mode' }, 'ADMIN MODE'));
  $('#main').replaceChildren(topbar([title], h('div', { class: 'adm-who' }, h('span', { class: 'dot' }), S.user.email)), h('div', { class: 'scroll adm-scroll' }, root));
  try {
    const view = tab === 'users' && sub ? await userPage(sub) : await { overview: overviewTab, users: usersTab, usage: usageTab, errors: errorsTab, activity: activityTab, system: systemTab }[tab]();
    if (my === live) body.replaceChildren(view);
  } catch (e) {
    if (my !== live) return;
    body.replaceChildren(h('div', { class: 'adm-err' }, e.status === 403 ? 'This page is for admin accounts only.' : e.message));
  }
}
const rerender = () => { const p = location.hash.replace(/^#/, '').split('/'); renderAdmin(p[2], p[3]); };

// ---------- Overview ----------
async function overviewTab() {
  const o = await api('/api/admin/overview?days=' + st.days);
  const k = o.kpis;
  const s = o.series;
  const statusOrder = ['free', 'upgraded', 'downgraded', 'cancelling', 'paused', 'past_due', 'cancelled'];
  return h('div', { class: 'adm-stack' },
    h('div', { class: 'adm-row-h' }, h('h2', {}, 'Overview'), h('div', { class: 'grow' }), sel(String(st.days), [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months']], (v) => { st.days = Number(v); rerender(); })),
    h('div', { class: 'adm-kpis' },
      kpi('Users', n0(k.users), `${k.newUsers} new`, delta(k.newUsers, k.newUsersPrev)),
      kpi('Paying', n0(k.paying), `MRR ${usd(k.mrr, 0)}${k.testPaying ? ` · ${k.testPaying} on test plans not counted` : ''}`),
      kpi('Revenue', usd(k.revenue), `all time ${usd(k.revenueAll, 0)}${k.testRevenue ? ` · ${usd(k.testRevenue, 0)} of test payments not counted` : ''}`, delta(k.revenue, k.revenuePrev)),
      kpi('Credits used', cr(k.creditsCharged), `≈ ${usd(k.chargedUsd)}`, delta(k.creditsCharged, k.creditsChargedPrev)),
      kpi('API cost', usd(k.apiUsd, 3), (k.margin == null ? 'margin –' : `margin ${k.margin}%`) + (k.apiUsdEst ? ` · ${usd(k.apiUsdEst, 2)} worked out from credits` : '')),
      kpi('Active people', n0(k.active7), `${k.active30} in 30 days`),
      kpi('Credits outstanding', cr(k.creditsOutstanding), 'owed to people'),
      kpi('Gateway, 24 h', `${n0(k.calls24)} calls`, k.calls24 ? `${k.fails24} failed (${Math.round((k.fails24 / k.calls24) * 100)}%)` : 'no calls yet', k.fails24 ? h('a', { href: '#/admin/errors', class: 'delta down' }, 'see errors') : null),
    ),
    h('div', { class: 'adm-grid2' },
      card('Credits used per day, by area', stackChart(s, o.byArea)),
      card('Revenue per day', lineChart(s.map((x) => ({ label: x.day, v: x.revenue })), { color: '#40c057', fmt: (v) => usd(v, 0) })),
    ),
    h('div', { class: 'adm-grid3' },
      card('Sign-ups per day', lineChart(s.map((x) => ({ label: x.day, v: x.signups })), { color: '#4361ee', fmt: n0, height: 120 })),
      card('Active people per day', lineChart(s.map((x) => ({ label: x.day, v: x.active })), { color: '#04d9ff', fmt: n0, height: 120 })),
      card('People by status', barList(statusOrder.filter((x) => o.statuses[x]).map((x) => ({ label: badge(x), value: o.statuses[x] })), { fmt: n0, color: 'var(--a-accent)' })),
    ),
    h('div', { class: 'adm-grid3' },
      card('Usage by area', barList(o.byArea.filter((a) => a.credits).sort((a, b) => b.credits - a.credits).map((a) => ({ label: a.label, value: a.credits, color: AREA_COLORS[a.id], sub: a.usd ? usd(a.usd, 3) + ' API' : '' })))),
      card('Top models', barList(o.byModel.slice(0, 8).map((m) => ({ label: modelName(m.model), value: m.credits, sub: `${m.calls} calls` })), { color: '#7c8cff' })),
      card('Plans', barList(o.plans.map((p) => ({ label: planChip(p.name, p.id), value: p.users })), { fmt: n0, color: '#f5a524' })),
    ),
    card('Biggest spenders', table([
      { label: 'Person', get: (r) => h('span', { class: 'link' }, r.email) }, { label: 'Plan', get: (r) => planChip(o.plans.find((p) => p.id === r.plan)?.name, r.plan) }, { label: 'Credits used', num: true, get: (r) => cr(r.credits) },
    ], o.topUsers, { onRow: (r) => (location.hash = '#/admin/users/' + r.id), empty: 'No usage in this period.' })),
  );
}

// ---------- Users ----------
async function usersTab() {
  const f = st.users;
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const r = await api('/api/admin/users?' + q);
  const search = h('input', { class: 'adm-in grow', type: 'search', placeholder: 'Search email, name or id', value: f.q, onkeydown: (e) => { if (e.key === 'Enter') { f.q = e.target.value; rerender(); } } });
  return h('div', { class: 'adm-stack' },
    h('div', { class: 'adm-row-h' }, h('h2', {}, 'Users'), h('span', { class: 'dim' }, `${r.users.length} of ${r.total}`), h('div', { class: 'grow' }),
      h('a', { class: 'btn sm ghost', href: '/api/admin/users.csv', download: '' }, icon('dl'), 'Export CSV')),
    h('div', { class: 'adm-filters' }, search,
      sel(f.status, [['', 'Any status'], ...Object.entries(STATUS).map(([k, [l]]) => [k, l])], (v) => { f.status = v; rerender(); }),
      sel(f.plan, [['', 'Any plan'], ...r.plans.map((p) => [p.id, p.name])], (v) => { f.plan = v; rerender(); }),
      sel(f.sort, [['createdAt', 'Newest first'], ['lastActive', 'Last active'], ['used30', 'Most used (30 d)'], ['used', 'Most used (all)'], ['credits', 'Most credits left'], ['paid', 'Most paid'], ['email', 'Email A–Z']], (v) => { f.sort = v; rerender(); }),
      h('button', { class: 'btn sm', onclick: () => { f.q = search.value; rerender(); } }, icon('search'), 'Search')),
    h('div', { class: 'adm-card flush' }, table([
      { label: 'Person', get: (u) => h('div', { class: 'who' }, h('div', { class: 'av' }, (u.name || u.email)[0].toUpperCase()), h('div', {}, h('b', {}, u.name || '–', u.admin && h('span', { class: 'adm-badge st-admin' }, 'admin')), h('small', {}, u.email))) },
      { label: 'Plan', get: (u) => planChip(u.planName, u.plan) },
      { label: 'Status', get: (u) => h('span', { class: 'badges' }, badge(u.status), u.banned && badge('banned')) },
      { label: 'Signed up', get: (u) => when(u.createdAt) },
      { label: 'Upgraded', get: (u) => (u.upgradedAt ? when(u.upgradedAt) : h('span', { class: 'dim' }, '–')) },
      { label: 'Last active', get: (u) => ago(u.lastActive) },
      { label: 'Used (30 d)', num: true, get: (u) => cr(u.used30) },
      { label: 'Used (all)', num: true, get: (u) => cr(u.used) },
      { label: 'Credits left', num: true, get: (u) => h('b', {}, cr(u.credits)) },
      { label: 'Paid', num: true, get: (u) => (u.paidUsd ? usd(u.paidUsd) : h('span', { class: 'dim' }, '–')) },
    ], r.users, { onRow: (u) => (location.hash = '#/admin/users/' + u.id), empty: 'No one matches these filters.' })),
  );
}

// ---------- one person ----------
async function userPage(uid) {
  const d = await api('/api/admin/users/' + encodeURIComponent(uid));
  const u = d.user; const s = d.sub;
  const liveSub = s && ['active', 'trialing', 'past_due'].includes(s.status) && u.plan !== 'free';
  const act = (action, extra = {}) => async () => { await api(`/api/admin/users/${u.id}/subscription`, { method: 'POST', body: { action, ...extra } }); toast('Done'); rerender(); };
  const planOpts = d.plans.filter((p) => p.priceUsd > 0);
  const where = s?.demo || d.stripe === 'demo' ? 'demo mode, no card is charged' : `Stripe ${d.stripe} mode`;
  const subBtns = [];
  if (!d.subscriptions) subBtns.push(h('p', { class: 'dim' }, 'Subscriptions are switched off on this server (FEATURE_SUBSCRIPTIONS).'));
  else if (liveSub) {
    if (s.paused) subBtns.push(h('button', { class: 'btn sm', onclick: () => confirmBox({ title: 'Resume this plan?', text: `Billing and monthly credits start again (${where}).`, ok: 'Resume', onOk: act('resume') }) }, icon('play'), 'Resume'));
    else subBtns.push(h('button', { class: 'btn sm', onclick: () => confirmBox({ title: 'Pause this plan?', text: `No invoices are charged and no monthly credits are added while paused. Their current credits stay (${where}).`, ok: 'Pause', onOk: act('pause') }) }, icon('stop'), 'Pause'));
    if (s.cancelAtPeriodEnd) subBtns.push(h('button', { class: 'btn sm', onclick: () => confirmBox({ title: 'Keep this plan?', text: 'The plan renews as normal again.', ok: 'Undo cancel', onOk: act('uncancel') }) }, icon('undo'), 'Undo cancel'));
    else subBtns.push(h('button', { class: 'btn sm', onclick: () => confirmBox({ title: 'Cancel at the end of the month?', text: `The plan keeps working until ${when(s.currentPeriodEnd)} and then ends. Nothing is refunded.`, ok: 'Cancel at period end', danger: true, onOk: act('cancel_end') }) }, icon('x'), 'Cancel at period end'));
    subBtns.push(h('button', { class: 'btn sm adm-danger-o', onclick: () => confirmBox({ title: 'Cancel now?', text: `The plan ends immediately and the person goes back to Free. Unused time is not refunded automatically (${where}).`, ok: 'Cancel now', danger: true, onOk: act('cancel_now') }) }, icon('trash'), 'Cancel now'));
    const pick = sel(planOpts.find((p) => p.id !== u.plan)?.id || '', planOpts.filter((p) => p.id !== u.plan).map((p) => [p.id, `${p.name} · $${p.priceUsd}/mo`]), () => {});
    subBtns.push(h('div', { class: 'adm-inline' }, pick, h('button', { class: 'btn sm', onclick: () => { const p = planOpts.find((x) => x.id === pick.value); confirmBox({ title: `Move to ${p.name}?`, text: p.priceUsd > (planOpts.find((x) => x.id === u.plan)?.priceUsd || 0) ? `An upgrade charges the price difference for the rest of this month now and adds the matching credits (${where}).` : `A downgrade starts at the next renewal. Nothing is refunded (${where}).`, ok: 'Change plan', onOk: act('change', { planId: p.id }) }); } }, icon('swap'), 'Change plan')));
  } else {
    const pick = sel(s?.planId || planOpts[0]?.id, planOpts.map((p) => [p.id, `${p.name} · $${p.priceUsd}/mo`]), () => {});
    subBtns.push(h('div', { class: 'adm-inline' }, pick, h('button', { class: 'btn sm', onclick: () => { const p = planOpts.find((x) => x.id === pick.value); confirmBox({ title: `${s ? 'Restart' : 'Start'} ${p.name}?`, text: d.stripe === 'demo' ? 'Demo mode: the plan starts now with its credits and no card is charged.' : `This charges the person's saved card $${p.priceUsd} now in Stripe ${d.stripe} mode and starts the plan. If they have no saved card, they need to subscribe from their Billing page.`, ok: s ? 'Restart plan' : 'Start plan', onOk: act(s ? 'restart' : 'start', { planId: p.id }) }); } }, icon('retry'), s ? 'Restart plan' : 'Start plan')));
  }
  const post = (path, body, msg) => async () => { await api(`/api/admin/users/${u.id}/${path}`, { method: 'POST', body }); toast(msg); rerender(); };
  const note = h('textarea', { class: 'adm-in', rows: 3, placeholder: 'Private note for admins (never shown to the person)' }, d.note || '');
  return h('div', { class: 'adm-stack' },
    h('a', { class: 'adm-back', href: '#/admin/users' }, icon('back'), 'All users'),
    h('div', { class: 'adm-person' },
      h('div', { class: 'av big' }, (u.name || u.email)[0].toUpperCase()),
      h('div', { class: 'grow' },
        h('h2', {}, u.name || u.email, u.admin && h('span', { class: 'adm-badge st-admin' }, 'admin')),
        h('div', { class: 'dim' }, u.email, ' · ', h('span', { class: 'mono' }, u.id)),
        h('div', { class: 'badges', style: { marginTop: '8px' } }, planChip(u.planName, u.plan), badge(u.status), u.banned && badge('banned'), h('span', { class: 'adm-chip' }, u.signIn), !u.verified && h('span', { class: 'adm-chip warn' }, 'email not confirmed'), u.billing && h('span', { class: 'adm-chip' }, u.billing === 'demo' ? 'demo billing' : 'Stripe')),
      ),
      h('button', { class: 'btn sm ghost', onclick: post('sync', {}, 'Read back from Stripe') }, icon('retry'), 'Sync billing'),
    ),
    d.ban && h('div', { class: 'adm-alert bad' }, icon('lock'), h('span', {}, `Banned ${whenTime(d.ban.at)} by ${d.ban.by}`, d.ban.reason ? ` · “${d.ban.reason}”` : '', '. They are signed out and cannot sign in.')),
    h('div', { class: 'adm-kpis' },
      kpi('Credits left', cr(u.credits)), kpi('Used, 30 days', cr(u.used30)), kpi('Used, all time', cr(u.used), usd(u.apiUsd, 3) + ' API cost'),
      kpi('Paid', usd(u.paidUsd), u.testUsd ? `${usd(u.testUsd)} in test payments not counted` : (u.testPlan ? 'plan from test mode' : '')), kpi('Signed up', when(u.createdAt), ago(u.createdAt)), kpi('Upgraded', u.upgradedAt ? when(u.upgradedAt) : '–', u.lastUpgradeAt && u.lastUpgradeAt !== u.upgradedAt ? 'last ' + when(u.lastUpgradeAt) : ''),
      kpi('Last active', ago(u.lastActive)), kpi('Work', `${d.counts.chats} chats`, `${d.counts.generations} creations · ${d.counts.files} files`),
    ),
    h('div', { class: 'adm-grid2' },
      card('Subscription', h('div', { class: 'adm-stack sm' },
        s ? h('dl', { class: 'adm-dl' },
          h('dt', {}, 'Plan'), h('dd', {}, planChip(d.plans.find((p) => p.id === (s.planId || u.plan))?.name, s.planId || u.plan)),
          h('dt', {}, 'Stripe status'), h('dd', {}, s.status, s.paused ? ' · paused' : '', s.demo ? ' · demo' : ''),
          h('dt', {}, !liveSub ? 'Ended' : s.cancelAtPeriodEnd ? 'Ends' : s.paused ? 'Paused until' : 'Renews'), h('dd', {}, !liveSub ? 'yes' : when(s.cancelAtPeriodEnd ? s.cancelAt || s.currentPeriodEnd : s.paused ? s.resumesAt : s.currentPeriodEnd) || 'resumed by an admin'),
          d.card && h('dt', {}, 'Card'), d.card && h('dd', {}, `${d.card.brand} ···· ${d.card.last4}`),
          d.stripeCustomer && h('dt', {}, 'Customer'), d.stripeCustomer && h('dd', { class: 'mono' }, d.stripeCustomer),
          d.openInvoices.length > 0 && h('dt', {}, 'Unpaid'), d.openInvoices.length > 0 && h('dd', {}, d.openInvoices.map((i) => usd(i.amountUsd)).join(', ')),
        ) : h('p', { class: 'dim' }, u.plan !== 'free' ? `On ${u.planName} without a subscription record (set before subscriptions, or by hand).` : 'No subscription. On the free trial.'),
        h('div', { class: 'adm-actions' }, subBtns),
      )),
      card('Credits and account', h('div', { class: 'adm-stack sm' },
        d.wallet && h('dl', { class: 'adm-dl' },
          h('dt', {}, 'Plan credits'), h('dd', {}, d.wallet.sub ? `${cr(d.wallet.sub.credits)} · expire ${when(d.wallet.sub.expiresAt)}` : 'none'),
          h('dt', {}, 'Top-ups'), h('dd', {}, d.wallet.packs.length ? d.wallet.packs.map((p) => `${cr(p.credits)}${p.kind === 'carry' ? ' carried over' : ''} · ${p.expiresAt ? 'expire ' + when(p.expiresAt) : 'no expiry'}`).join('; ') : 'none'),
          h('dt', {}, 'Free credits'), h('dd', {}, `${cr(d.wallet.free)} (standard tools only)`),
          d.wallet.owed > 0 && h('dt', {}, 'Owing'), d.wallet.owed > 0 && h('dd', {}, cr(d.wallet.owed)),
          h('dt', {}, 'Pro tools'), h('dd', {}, d.wallet.paid > 0 || (u.plan && u.plan !== 'free') ? (d.wallet.paid > 0 ? 'open' : 'paused (no paid credits)') : 'locked (no plan or top-up)'),
        ),
        h('div', { class: 'adm-actions' },
          h('button', { class: 'btn sm primary', onclick: () => confirmBox({ title: 'Add paid credits', text: 'Added as top-up credits: valid 90 days, work in every tool including the Pro tools (Ad Studio, Video Builder, Video Agent, Studio Pro). Use this to make up for a failed paid job.', ok: 'Add credits', input: { label: 'Credits', type: 'number', placeholder: 'e.g. 500', extra: 'Reason, shown to them (optional)', extraLabel: 'Note' }, onOk: async (v, n) => { await api(`/api/admin/users/${u.id}/credits`, { method: 'POST', body: { amount: Math.abs(Number(v)), note: n, paid: true } }); toast('Paid credits added'); rerender(); } }) }, icon('plus'), 'Add paid credits'),
          h('button', { class: 'btn sm', onclick: () => confirmBox({ title: 'Add free credits', text: 'Free credits work on the standard tools only (Chat, Image, Video Studio, Docs, Code and AI Apps) and do not expire. They show in their history as “Promo credits”.', ok: 'Add credits', input: { label: 'Credits', type: 'number', placeholder: 'e.g. 500', extra: 'Reason, shown to them (optional)', extraLabel: 'Note' }, onOk: async (v, n) => { await api(`/api/admin/users/${u.id}/credits`, { method: 'POST', body: { amount: Math.abs(Number(v)), note: n } }); toast('Free credits added'); rerender(); } }) }, icon('plus'), 'Add free credits'),
          h('button', { class: 'btn sm', onclick: () => confirmBox({ title: 'Remove credits', text: `Takes credits away from the balance (now ${cr(u.credits)}).`, ok: 'Remove', danger: true, input: { label: 'Credits to remove', type: 'number', placeholder: 'e.g. 100', extra: 'Reason (optional)', extraLabel: 'Note' }, onOk: async (v, n) => { await api(`/api/admin/users/${u.id}/credits`, { method: 'POST', body: { amount: -Math.abs(Number(v)), note: n } }); toast('Credits removed'); rerender(); } }) }, icon('coin'), 'Remove credits'),
        ),
        h('div', { class: 'adm-actions' },
          u.banned
            ? h('button', { class: 'btn sm', onclick: () => confirmBox({ title: 'Unban this person?', text: 'They can sign in and use Scenly again.', ok: 'Unban', onOk: post('ban', { banned: false }, 'Unbanned') }) }, icon('check'), 'Unban')
            : h('button', { class: 'btn sm adm-danger-o', disabled: u.admin, title: u.admin ? 'Admin accounts cannot be banned' : '', onclick: () => confirmBox({ title: 'Ban this person?', text: 'They are signed out everywhere and cannot sign in until unbanned. Their plan is not cancelled; do that separately if needed.', ok: 'Ban', danger: true, input: { label: 'Reason (admins only)', placeholder: 'e.g. abuse, chargeback, spam' }, onOk: async (reason) => { await api(`/api/admin/users/${u.id}/ban`, { method: 'POST', body: { banned: true, reason } }); toast('Banned'); rerender(); } }) }, icon('lock'), 'Ban'),
          h('button', { class: 'btn sm', onclick: () => confirmBox({ title: 'Sign out everywhere?', text: `Ends all ${d.counts.sessions} of their sign-ins. They can sign in again.`, ok: 'Sign out', onOk: post('signout', {}, 'Signed out') }) }, icon('out'), 'Sign out everywhere'),
          !u.verified && h('button', { class: 'btn sm', onclick: post('verify', {}, 'Email marked as confirmed') }, icon('mail'), 'Mark email confirmed'),
        ),
        field('Admin note', note),
        h('div', {}, h('button', { class: 'btn sm ghost', onclick: post('note', { get note() { return note.value; } }, 'Note saved') }, 'Save note')),
      )),
    ),
    h('div', { class: 'adm-grid2' },
      card('Usage by area', barList(d.byArea.sort((a, b) => b.credits - a.credits).map((a) => ({ label: a.label, value: a.credits, color: AREA_COLORS[a.id], sub: `${a.calls} uses` })))),
      card('Usage by model', table([{ label: 'Model', get: (m) => modelCell(m.model) }, { label: 'Uses', num: true, get: (m) => m.calls }, { label: 'Credits', num: true, get: (m) => cr(m.credits) }, { label: 'API cost', num: true, get: (m) => usd(m.usd, 4) }], d.byModel, { dense: true, empty: 'No usage yet.' })),
    ),
    h('div', { class: 'adm-grid2' },
      card('Plan history', d.planHistory.length ? h('ol', { class: 'adm-timeline' }, d.planHistory.map((p) => h('li', {}, h('b', {}, p.kind), ` ${d.plans.find((x) => x.id === p.from)?.name || p.from} → ${d.plans.find((x) => x.id === p.to)?.name || p.to}`, h('small', {}, whenTime(p.at))))) : empty('No plan changes recorded yet. Changes are recorded from now on.')),
      card('Payments', table([{ label: 'Date', get: (p) => when(p.at) }, { label: 'What', get: (p) => `${p.kind}${p.reason ? ' · ' + p.reason.replace('subscription_', '') : ''}${p.offer ? ' · ' + p.offer : ''}` }, { label: 'Paid', num: true, get: (p) => usd(p.amountUsd) }, { label: 'Credits', num: true, get: (p) => cr(p.credits) }, { label: '', get: (p) => (p.mode === 'demo' || p.mode === 'test' ? h('span', { class: 'adm-chip' }, p.mode) : '') }], d.payments, { dense: true, empty: 'No payments.' })),
    ),
    card('Credit history', table([{ label: 'When', get: (l) => whenTime(l.at) }, { label: 'Type', get: (l) => h('span', { class: 'adm-chip t-' + l.type }, l.type) }, { label: 'Area', get: (l) => (l.area ? h('span', { class: 'area-dot' }, h('i', { style: { background: AREA_COLORS[l.area] } }), l.area) : '') }, { label: 'What', cls: 'wrap', get: (l) => l.desc }, { label: 'Credits', num: true, get: (l) => h('span', { class: l.credits < 0 ? 'neg' : 'pos' }, (l.credits > 0 ? '+' : '') + cr(l.credits)) }, { label: 'Balance', num: true, get: (l) => cr(l.balance) }], d.ledger.slice(0, 120), { dense: true })),
    d.failures.length > 0 && card('Their recent failures', failureTable(d.failures)),
    d.audit.length > 0 && card('Admin actions on this account', auditTable(d.audit)),
  );
}

// ---------- Usage ----------
async function usageTab() {
  const r = await api('/api/admin/usage?days=' + st.usageDays);
  const areas = r.areas.filter((a) => r.users.some((u) => u.areas[a.id]));
  const totals = Object.fromEntries(areas.map((a) => [a.id, r.users.reduce((n, u) => n + (u.areas[a.id] || 0), 0)]));
  return h('div', { class: 'adm-stack' },
    h('div', { class: 'adm-row-h' }, h('h2', {}, 'Usage'), h('span', { class: 'dim' }, 'credits spent after refunds'), h('div', { class: 'grow' }), sel(String(st.usageDays), [['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months']], (v) => { st.usageDays = Number(v); rerender(); })),
    card('By area', barList(areas.map((a) => ({ label: a.label, value: totals[a.id], color: AREA_COLORS[a.id] })).sort((a, b) => b.value - a.value))),
    card('Per person, by area', h('div', {}, table([
      { label: 'Person', get: (u) => h('span', { class: 'link' }, u.email) },
      ...areas.map((a) => ({ label: a.label, num: true, get: (u) => (u.areas[a.id] ? cr(u.areas[a.id]) : h('span', { class: 'dim' }, '·')) })),
      { label: 'Total used', num: true, get: (u) => h('b', {}, cr(u.total)) },
      { label: 'Credits left', num: true, get: (u) => cr(u.credits) },
      { label: 'Top models', cls: 'wrap', get: (u) => u.models.map((m) => modelName(m.model)).join(', ') },
    ], r.users, { dense: true, onRow: (u) => (location.hash = '#/admin/users/' + u.userId), empty: 'No usage in this period.' }))),
    card('Per model, by area', table([
      { label: 'Model', get: (m) => modelCell(m.model) },
      ...areas.map((a) => ({ label: a.label, num: true, get: (m) => (m.areas[a.id] ? cr(m.areas[a.id]) : h('span', { class: 'dim' }, '·')) })),
      { label: 'Uses', num: true, get: (m) => m.calls }, { label: 'Credits', num: true, get: (m) => h('b', {}, cr(m.total)) }, { label: 'API cost', num: true, get: (m) => usd(m.usd, 4) },
    ], r.models, { dense: true, empty: 'No usage in this period.' })),
  );
}

// ---------- Errors and performance ----------
const failureTable = (rows) => table([
  { label: 'When', get: (f) => whenTime(f.at) },
  { label: 'Kind', get: (f) => h('span', { class: 'adm-chip k-' + f.kind }, KIND_LABEL[f.kind] || f.kind) },
  { label: 'Model', get: (f) => (f.model ? modelCell(f.model) : h('span', { class: 'dim' }, '–')) },
  { label: 'Where', cls: 'mono small', get: (f) => [f.path, f.via && f.via !== f.path ? ' ← ' + f.via : ''].join('') || '–' },
  { label: 'Status', cls: 'mono', get: (f) => f.status || f.code || '–' },
  { label: 'Reason', cls: 'wrap reason', get: (f) => f.reason || '–' },
  { label: 'Person', get: (f) => (f.email ? h('a', { href: '#/admin/users/' + f.userId, onclick: (e) => e.stopPropagation() }, f.email) : '–') },
], rows, { dense: true, empty: 'No failures in this period. 🎉' });
async function errorsTab() {
  const f = st.errors;
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const r = await api('/api/admin/errors?' + q);
  const totalKinds = Object.values(r.kinds).reduce((a, b) => a + b, 0);
  const perfCols = (keyLabel, keyCell) => [
    { label: keyLabel, get: keyCell }, { label: 'Calls', num: true, get: (x) => n0(x.calls) },
    { label: 'Failed', num: true, get: (x) => (x.fails ? h('span', { class: 'neg' }, n0(x.fails)) : '0') },
    { label: 'Fail rate', num: true, get: (x) => h('span', { class: x.failRate >= 20 ? 'neg' : x.failRate >= 5 ? 'warn' : 'pos' }, x.failRate + '%') },
    { label: 'Avg', num: true, get: (x) => ms(x.avgMs) }, { label: 'p50', num: true, get: (x) => ms(x.p50) }, { label: 'p95', num: true, get: (x) => ms(x.p95) }, { label: 'Last call', get: (x) => ago(x.last) },
  ];
  const search = h('input', { class: 'adm-in grow', type: 'search', placeholder: 'Search reason, model, endpoint or email', value: f.q, onkeydown: (e) => { if (e.key === 'Enter') { f.q = e.target.value; rerender(); } } });
  return h('div', { class: 'adm-stack' },
    h('div', { class: 'adm-row-h' }, h('h2', {}, 'Errors & speed'), h('span', { class: 'dim' }, r.since ? `gateway calls logged since ${whenTime(r.since)}` : 'gateway calls are logged from now on'), h('div', { class: 'grow' }),
      sel(String(f.days), [['1', 'Last 24 h'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']], (v) => { f.days = Number(v); rerender(); }),
      h('button', { class: 'btn sm ghost', onclick: () => confirmBox({ title: 'Clear the error log?', text: 'Removes every logged failure (speed stats and failed background jobs stay).', ok: 'Clear', danger: true, onOk: async () => { await api('/api/admin/errors/clear', { method: 'POST' }); toast('Error log cleared'); rerender(); } }) }, icon('trash'), 'Clear log')),
    h('div', { class: 'adm-chips' },
      h('button', { class: 'adm-fchip' + (!f.kind ? ' on' : ''), onclick: () => { f.kind = ''; rerender(); } }, 'All', h('b', {}, totalKinds)),
      Object.entries(KIND_LABEL).map(([k, l]) => h('button', { class: 'adm-fchip k-' + k + (f.kind === k ? ' on' : ''), onclick: () => { f.kind = f.kind === k ? '' : k; rerender(); } }, l, h('b', {}, r.kinds[k] || 0)))),
    card('Speed and reliability by model', table(perfCols('Model', (x) => modelCell(x.key)), r.byModel, { dense: true, empty: 'No gateway calls logged in this period yet.' }), h('span', { class: 'dim small' }, `${n0(r.calls)} calls · times are until the gateway starts answering`)),
    h('div', { class: 'adm-stack' },
      card('By endpoint', table(perfCols('Endpoint', (x) => h('span', { class: 'mono small' }, x.key)), r.byEndpoint, { dense: true, empty: 'No calls yet.' })),
      card('Most common reasons', table([{ label: 'Kind', get: (x) => h('span', { class: 'adm-chip k-' + x.kind }, KIND_LABEL[x.kind] || x.kind) }, { label: 'Reason', cls: 'wrap reason', get: (x) => x.reason || '–' }, { label: 'Models', cls: 'wrap', get: (x) => x.models.map(modelName).join(', ') || '–' }, { label: 'Count', num: true, get: (x) => h('b', {}, x.count) }, { label: 'Last', get: (x) => ago(x.last) }], r.topReasons, { dense: true, empty: 'No failures.' })),
    ),
    card(`Failure log${r.total > 400 ? ' (latest 400 of ' + r.total + ')' : ''}`, h('div', { class: 'adm-stack sm' },
      h('div', { class: 'adm-filters' }, search, sel(f.model, [['', 'Any model'], ...r.models.map((m) => [m, modelName(m)])], (v) => { f.model = v; rerender(); }), h('button', { class: 'btn sm', onclick: () => { f.q = search.value; rerender(); } }, icon('search'), 'Search')),
      failureTable(r.failures))),
  );
}

// ---------- Admin activity ----------
const subState = (x) => (x ? [x.plan, x.status || 'no plan', x.paused && 'paused', x.cancelAtPeriodEnd && 'cancels at period end'].filter(Boolean).join(' · ') : '–');
function auditDetail(a) {
  const d = a.detail || {};
  if (d.before && d.after) return h('span', {}, h('span', { class: 'dim' }, subState(d.before)), '  →  ', h('b', {}, subState(d.after)));
  if (d.amount != null) return h('span', {}, h('b', { class: d.amount < 0 ? 'neg' : 'pos' }, (d.amount > 0 ? '+' : '') + d.amount + ' credits'), d.note ? ' · ' + d.note : '');
  return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' · ');
}
const auditTable = (rows) => table([
  { label: 'When', get: (a) => whenTime(a.at) }, { label: 'Admin', get: (a) => a.admin },
  { label: 'Action', get: (a) => h('span', { class: 'adm-chip' }, a.action.replace(/_/g, ' ')) },
  { label: 'Person', get: (a) => (a.userId ? h('a', { href: '#/admin/users/' + a.userId, onclick: (e) => e.stopPropagation() }, a.email) : '–') },
  { label: 'Details', cls: 'wrap small', get: auditDetail },
], rows, { dense: true, empty: 'No admin actions yet.' });
async function activityTab() {
  const r = await api('/api/admin/audit');
  return h('div', { class: 'adm-stack' }, h('div', { class: 'adm-row-h' }, h('h2', {}, 'Admin activity'), h('span', { class: 'dim' }, 'every change made from this console')), card('', auditTable(r.audit)));
}

// ---------- System ----------
// The one-off email about the credit rules of 2026-11-20, to every account that has ever paid. Hidden once all are sent.
function announceCard() {
  const box = h('div', {});
  api('/api/admin/announce/credit-rules').then((a) => {
    if (!a.pending) return;
    const go = h('button', { class: 'btn sm primary' }, `Send to ${a.pending} paying accounts`);
    go.onclick = () => confirmBox({ title: 'Email the new credit rules?', text: `Sends the "Your Scenly credits: what's changing" email once to ${a.pending} accounts that have paid (${a.withCarried} with carried-over credits get their 90-day date). Accounts already emailed are skipped.`, ok: 'Send emails', onOk: async () => { const r = await api('/api/admin/announce/credit-rules', { method: 'POST' }); toast(`${r.sent} sent${r.failed.length ? `, ${r.failed.length} failed` : ''}`); box.replaceChildren(card('Credit rules email', h('p', {}, `${r.sent} sent${r.failed.length ? `. Failed: ${r.failed.map((f) => f.email).join(', ')}` : '.'}`))); } });
    box.replaceChildren(card('Credit rules email', h('div', { class: 'adm-stack sm' }, h('p', { class: 'dim' }, `${a.pending} of ${a.total} paying accounts have not had the email about the new credit rules yet.`), h('div', { class: 'adm-actions' }, go))));
  }).catch(() => {});
  return box;
}
async function systemTab() {
  const [s, hl, pr] = await Promise.all([api('/api/admin/settings'), api('/api/admin/health').catch(() => null), api('/api/admin/pricing').catch(() => null)]);
  const pct = (n) => (n == null ? '–' : (Math.round(n * 10) / 10) + '%');
  const KIND = { chat: 'Chat', image: 'Image', video: 'Video' };
  const yes = (v, t = 'On', f = 'Off') => h('span', { class: 'adm-chip ' + (v ? 'ok' : 'off') }, v ? t : f);
  const FLAG_LABELS = { videoAgent: 'Video Agent', videoBuilder: 'Video Builder', precisionEdit: 'Precision edit', musicLibrary: 'Music library', beatSync: 'Beat sync', audioFirst: 'Audio-first planning', videoExtend: 'Extend video', frameTiles: 'Frame tiles', studioPro: 'Studio Pro', subscriptions: 'Subscriptions' };
  return h('div', { class: 'adm-stack' },
    h('div', { class: 'adm-row-h' }, h('h2', {}, 'System'), h('span', { class: 'dim' }, 'switches are set in .env and need a restart')),
    announceCard(),
    h('div', { class: 'adm-grid3' },
      card('Billing', h('dl', { class: 'adm-dl' },
        h('dt', {}, 'Subscriptions'), h('dd', {}, yes(s.subscriptions)),
        h('dt', {}, 'Stripe'), h('dd', {}, h('span', { class: 'adm-chip ' + (s.stripe === 'live' ? 'ok' : 'warn') }, s.stripe === 'demo' ? 'demo (no key)' : s.stripe + ' mode')),
        h('dt', {}, 'Webhook'), h('dd', {}, yes(s.webhook, 'Set', 'Not set')),
        h('dt', {}, 'Credit price'), h('dd', {}, usd(s.pricing.creditUsd, 3)),
        h('dt', {}, 'Margin on AICredit price'), h('dd', {}, pct(s.pricing.marginPct)),
        h('dt', {}, 'AICredit master discount'), h('dd', {}, pct(s.pricing.masterDiscountPct)),
        h('dt', {}, 'Welcome credits'), h('dd', {}, s.pricing.signupBonus),
      )),
      card('Sign-in and email', h('dl', { class: 'adm-dl' },
        h('dt', {}, 'Environment'), h('dd', {}, s.env),
        h('dt', {}, 'Public address'), h('dd', { class: 'mono small' }, s.publicUrl || '–'),
        h('dt', {}, 'Email (SMTP)'), h('dd', {}, yes(s.mail, 'Ready', 'Not set')),
        h('dt', {}, 'Google sign-in'), h('dd', {}, yes(s.google, 'Ready', 'Not set')),
        h('dt', {}, 'Admins'), h('dd', {}, s.admins.join(', ') || '–'),
        h('dt', {}, 'AI gateway'), h('dd', { class: 'mono small' }, s.gateway, ' ', yes(s.gatewayKey, 'key set', 'no key')),
      )),
      card('Features', h('dl', { class: 'adm-dl' }, Object.entries(s.flags).map(([k, v]) => [h('dt', {}, FLAG_LABELS[k] || k), h('dd', {}, yes(v))]))),
    ),
    hl && card('Health', h('div', { class: 'adm-kpis' },
      kpi('Server', hl.ok ? 'OK' : 'Problem', `up ${Math.round(hl.uptimeSec / 3600)} h · Node ${hl.node}`),
      kpi('Memory', hl.memoryMb + ' MB'),
      kpi('Database', hl.database.saving ? 'Saving' : 'NOT SAVING', `${hl.database.sizeMb} of ${hl.database.limitMb} MB`),
      kpi('Disk free', hl.disk ? hl.disk.freeGb + ' GB' : '–', hl.disk ? `of ${hl.disk.totalGb} GB` : ''),
      kpi('ffmpeg', hl.ffmpeg ? 'Found' : 'Missing'),
      kpi('Jobs waiting', n0(hl.counts.jobsWaiting), `${hl.counts.sessions} sign-ins`),
    )),
    pr && card('Model pricing', h('div', {},
      h('p', { class: 'dim small', style: { margin: '0 0 10px' } }, `Users pay the AICredit price plus ${pct(pr.marginPct)}. A model whose price with that margin would go above its official price is charged at the AICredit price with no margin. Your cost is the AICredit price less your ${pct(pr.masterDiscountPct)} master discount. One typical unit per model: a chat message (3,000 tokens in, 1,300 out), one image, one second of video.`),
      table([
        { label: 'Model', get: (m) => m.name },
        { label: 'Kind', get: (m) => KIND[m.type] || m.type },
        { label: 'Per', get: (m) => m.unit },
        { label: 'Official', num: true, get: (m) => usd(m.official, 4) },
        { label: 'AICredit discount', num: true, get: (m) => pct(m.discountPct) },
        { label: 'AICredit price', num: true, get: (m) => usd(m.aicredit, 4) },
        { label: 'Your cost', num: true, get: (m) => usd(m.cost, 4) },
        { label: 'User pays', num: true, get: (m) => usd(m.charged, 4) },
        { label: 'Credits', num: true, get: (m) => (m.credits >= 10 ? m.credits.toFixed(1) : m.credits.toFixed(2)) },
        { label: 'Markup', num: true, get: (m) => (m.markupPct > 0 ? pct(m.markupPct) : h('span', { class: 'adm-chip warn', title: 'Adding the margin would cost more than the official price, so none is added' }, 'none')) },
        { label: 'Your margin', num: true, get: (m) => pct(m.marginPct) },
      ], pr.models, { dense: true }),
    ), h('span', { class: 'dim small' }, `${pr.models.length} models · live from AICredit`)),
    card('Plans', table([{ label: 'Plan', get: (p) => planChip(p.name, p.id) }, { label: 'Price', num: true, get: (p) => usd(p.priceUsd, 0) }, { label: 'Credits', num: true, get: (p) => n0(p.credits) }, { label: 'Period', get: (p) => p.period }], s.plans, { dense: true })),
  );
}
