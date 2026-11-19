// Ready-made PDF designs. They open at once (no model call) and are then filled in by prompt or by hand.
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const co = (t) => t.company || '[Your Company]';
const contact = (t) => [t.address || '[Address]', t.phone || '[Phone]', t.email || '[Email]', t.website || '[Website]'];
const logoOr = (t, cls = 'logo') => (t.logo ? `<img src="logo" class="${cls}">` : `<div class="bold" style="font-size:1.5em;font-family:var(--hfont)">${co(t)}</div>`);

export const TEMPLATES = [
  { id: 'invoice', label: 'Invoice', sub: 'A4, items table, totals, payment details',
    build: (t) => ({ title: 'Invoice [0001]', settings: { page: { size: 'A4' } }, pages: [{ name: 'Invoice', html: `
<div class="spread top" style="align-items:flex-start">
  <div>${logoOr(t)}<p class="small muted mt-1">${contact(t).slice(0, 3).join('<br>')}</p></div>
  <div class="right"><h1 class="mb-0" style="font-size:2.4em">INVOICE</h1><div class="kv small mt-1" style="justify-content:end"><span>Invoice no.</span><b>[0001]</b><span>Date</span><b>${today()}</b><span>Due</span><b>[Due date]</b></div></div>
</div>
<div class="row mt-3">
  <div class="col card"><div class="eyebrow">Bill to</div><b>[Client name]</b><br><span class="small">[Client address]<br>[Client email]</span></div>
  <div class="col card"><div class="eyebrow">Project</div><b>[Project or order]</b><br><span class="small">[PO number or reference]</span></div>
</div>
<table class="tbl mt-3">
  <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
  <tbody>
    <tr><td>[Item or service 1]</td><td class="num">1</td><td class="num">[0.00]</td><td class="num">[0.00]</td></tr>
    <tr><td>[Item or service 2]</td><td class="num">1</td><td class="num">[0.00]</td><td class="num">[0.00]</td></tr>
    <tr><td>[Item or service 3]</td><td class="num">1</td><td class="num">[0.00]</td><td class="num">[0.00]</td></tr>
  </tbody>
</table>
<div class="row mt-2">
  <div class="col"></div>
  <div class="col-5"><table class="tbl plain"><tbody>
    <tr><td>Subtotal</td><td class="num">[0.00]</td></tr>
    <tr><td>Tax ([0]%)</td><td class="num">[0.00]</td></tr>
    <tr class="total"><td>Total due</td><td class="num" style="font-size:1.3em;color:var(--primary)">[0.00]</td></tr>
  </tbody></table></div>
</div>
<div class="push">
  <div class="row"><div class="col"><div class="eyebrow">Payment details</div><p class="small">Bank: [Bank name]<br>Account name: ${co(t)}<br>IBAN / Account: [Number]<br>Reference: Invoice [0001]</p></div>
  <div class="col"><div class="eyebrow">Terms</div><p class="small">Payment is due within [30] days. Thank you for your business.</p></div></div>
  <hr><div class="spread tiny muted"><span>${co(t)} · ${contact(t)[3]}</span><span>Page {page} of {pages}</span></div>
</div>` }] }) },
  { id: 'certificate', label: 'Certificate', sub: 'A4 landscape with frame, name and signatures',
    build: (t) => ({ title: 'Certificate of Achievement', settings: { page: { size: 'A4', orientation: 'landscape', padding: 10 }, theme: { headingFont: 'Georgia' } }, pages: [{ name: 'Certificate', html: `
<div class="frame double center" style="display:flex;flex-direction:column;align-items:center;padding:12mm 20mm">
  ${t.logo ? '<img src="logo" class="logo">' : `<div class="eyebrow">${co(t)}</div>`}
  <div class="eyebrow mt-2" style="letter-spacing:.3em">Certificate of Achievement</div>
  <p class="muted mt-2 mb-0">This certificate is proudly presented to</p>
  <h1 style="font-size:4em;margin:6mm 0 3mm">[Recipient Name]</h1>
  <div class="rule center"></div>
  <p class="lead" style="max-width:190mm">for successfully completing <b>[Course or achievement]</b>, demonstrating [the skill or quality recognised].</p>
  <div class="row push" style="width:100%;align-items:flex-end;justify-content:space-between">
    <div class="sign center" style="width:60mm">[Name]<br>[Title]</div>
    <div class="center small muted">Awarded on<br><b style="color:var(--text)">${today()}</b></div>
    <div class="sign center" style="width:60mm">[Name]<br>[Title]</div>
  </div>
</div>` }] }) },
  { id: 'onepager', label: 'One-pager', sub: 'A4 company or product overview with stats',
    build: (t) => ({ title: `${co(t)} One-Pager`, settings: { page: { size: 'A4' } }, pages: [{ name: 'One-pager', html: `
<div class="band top bg-primary" style="padding-top:14mm;padding-bottom:10mm">
  <div class="spread"><div class="eyebrow">[Category or tagline]</div>${t.logo ? '<img src="logo" class="logo" style="max-height:10mm">' : ''}</div>
  <h1 style="font-size:3em;max-width:150mm">[The one-line promise of your product]</h1>
  <p class="lead muted mb-0" style="max-width:150mm">[One or two sentences on who it is for and the result they get.]</p>
</div>
<div class="grid-3 mt-3">
  <div class="stat"><div class="num">[00]%</div><div class="lbl">[What improved]</div></div>
  <div class="stat"><div class="num">[000]+</div><div class="lbl">[Customers or users]</div></div>
  <div class="stat"><div class="num">[0]x</div><div class="lbl">[Faster, cheaper, more]</div></div>
</div>
<div class="row mt-3 grow">
  <div class="col-7">
    <div class="eyebrow">The problem</div><p>[Two or three sentences describing the problem your customers face today.]</p>
    <div class="eyebrow mt-2">Our solution</div><p>[Two or three sentences on how you solve it and what makes your approach different.]</p>
    <ul class="check"><li>[Key benefit 1]</li><li>[Key benefit 2]</li><li>[Key benefit 3]</li></ul>
  </div>
  <div class="col stack">
    <div class="card"><div class="eyebrow">How it works</div><ol class="mb-0"><li>[Step 1]</li><li>[Step 2]</li><li>[Step 3]</li></ol></div>
    <div class="card line"><p class="mb-1">"[A short customer quote that proves the value.]"</p><div class="small muted">[Name, Title, Company]</div></div>
  </div>
</div>
<div class="band bottom bg-soft push"><div class="spread"><div><b>${co(t)}</b><br><span class="small muted">${contact(t).slice(1).join(' · ')}</span></div><qr value="${/^https?:/.test(t.website || '') ? t.website : 'https://example.com'}" size="18mm"></qr></div></div>` }] }) },
  { id: 'menu', label: 'Menu', sub: 'A4 restaurant or café menu in two columns',
    build: (t) => ({ title: `${t.company || '[Restaurant Name]'} Menu`, settings: { page: { size: 'A4', padding: 16 }, theme: { headingFont: 'Georgia' } }, css: '.item{margin-bottom:3.2mm}.item .dots b{font-weight:600}.item p{margin:0;font-size:.85em;color:var(--muted)}h2{font-size:1.3em;letter-spacing:.14em;text-transform:uppercase;margin-top:5mm;padding-bottom:1.5mm;border-bottom:.3mm solid var(--accent)}', pages: [{ name: 'Menu', html: `
<div class="center"><div class="eyebrow">[Est. year · City]</div><h1 style="font-size:3.2em;margin-bottom:1mm">${t.company || '[Restaurant Name]'}</h1><div class="rule center"></div></div>
<div class="row grow" style="--gap:12mm">
  <div class="col">
    <h2>Starters</h2>
    <div class="item"><div class="dots"><b>[Dish name]</b><span>[0.00]</span></div><p>[Short description, main ingredients]</p></div>
    <div class="item"><div class="dots"><b>[Dish name]</b><span>[0.00]</span></div><p>[Short description, main ingredients]</p></div>
    <div class="item"><div class="dots"><b>[Dish name]</b><span>[0.00]</span></div><p>[Short description, main ingredients]</p></div>
    <h2>Mains</h2>
    <div class="item"><div class="dots"><b>[Dish name]</b><span>[0.00]</span></div><p>[Short description, main ingredients]</p></div>
    <div class="item"><div class="dots"><b>[Dish name]</b><span>[0.00]</span></div><p>[Short description, main ingredients]</p></div>
    <div class="item"><div class="dots"><b>[Dish name]</b><span>[0.00]</span></div><p>[Short description, main ingredients]</p></div>
    <div class="item"><div class="dots"><b>[Dish name]</b><span>[0.00]</span></div><p>[Short description, main ingredients]</p></div>
  </div>
  <div class="col">
    <h2>Desserts</h2>
    <div class="item"><div class="dots"><b>[Dish name]</b><span>[0.00]</span></div><p>[Short description]</p></div>
    <div class="item"><div class="dots"><b>[Dish name]</b><span>[0.00]</span></div><p>[Short description]</p></div>
    <h2>Drinks</h2>
    <div class="item"><div class="dots"><b>[Drink]</b><span>[0.00]</span></div></div>
    <div class="item"><div class="dots"><b>[Drink]</b><span>[0.00]</span></div></div>
    <div class="item"><div class="dots"><b>[Drink]</b><span>[0.00]</span></div></div>
    <div class="item"><div class="dots"><b>[Drink]</b><span>[0.00]</span></div></div>
    <div class="card mt-3 center"><div class="eyebrow">Chef's special</div><b>[Dish name]</b><p class="small muted mb-0">[Description] · [0.00]</p></div>
  </div>
</div>
<p class="center tiny muted push mb-0">[Allergen note. Prices include tax. Service not included.]</p>` }] }) },
  { id: 'brochure', label: 'Brochure', sub: 'A4, two pages: cover and services with pricing',
    build: (t) => ({ title: `${co(t)} Brochure`, settings: { page: { size: 'A4' } }, pages: [
      { name: 'Cover', bg: 'linear-gradient(150deg,var(--primary) 0%,color-mix(in srgb,var(--primary) 55%,var(--accent)) 100%)', html: `
<div class="on-dark" style="display:flex;flex-direction:column;height:100%">
  <div class="spread">${t.logo ? '<img src="logo" class="logo">' : `<b style="font-size:1.3em">${co(t)}</b>`}<span class="small muted">${new Date().getFullYear()}</span></div>
  <div class="grow" style="display:flex;flex-direction:column;justify-content:center">
    <div class="eyebrow">[What you do, in three words]</div>
    <h1 style="font-size:4.4em;max-width:160mm">[A bold headline about the value you bring]</h1>
    <div class="rule"></div>
    <p class="lead" style="max-width:130mm">[One or two sentences that tell the reader who you help and how.]</p>
  </div>
  <div class="spread small"><span>${contact(t)[3]}</span><span>${contact(t)[2]}</span><span>${contact(t)[1]}</span></div>
</div>` },
      { name: 'Services', html: `
<div class="eyebrow">What we offer</div><h2>[Services built around your goals]</h2>
<div class="grid-3 mt-2">
  <div class="card"><h3>[Service 1]</h3><p class="small mb-0">[Two sentences on what it is and the result the customer gets.]</p></div>
  <div class="card"><h3>[Service 2]</h3><p class="small mb-0">[Two sentences on what it is and the result the customer gets.]</p></div>
  <div class="card"><h3>[Service 3]</h3><p class="small mb-0">[Two sentences on what it is and the result the customer gets.]</p></div>
</div>
<div class="row mt-3 grow">
  <div class="col"><div class="eyebrow">Why us</div><ul class="check"><li>[Reason 1, with a number if you have one]</li><li>[Reason 2]</li><li>[Reason 3]</li><li>[Reason 4]</li></ul>
    <chart type="bar" title="[Results for our clients]" labels="2023,2024,2025,2026" values="12,19,27,38" suffix="%" height="52mm"></chart></div>
  <div class="col"><div class="eyebrow">Packages</div>
    <table class="tbl"><thead><tr><th>Package</th><th>Includes</th><th class="num">Price</th></tr></thead><tbody>
      <tr><td><b>Starter</b></td><td class="small">[What is included]</td><td class="num">[000]</td></tr>
      <tr><td><b>Growth</b></td><td class="small">[What is included]</td><td class="num">[000]</td></tr>
      <tr><td><b>Premium</b></td><td class="small">[What is included]</td><td class="num">[000]</td></tr>
    </tbody></table>
    <div class="card line mt-2"><p class="mb-1">"[A customer quote that builds trust.]"</p><div class="small muted">[Name, Company]</div></div></div>
</div>
<div class="band bottom bg-primary push"><div class="spread"><div><h3 class="mb-0">[Ready to start? Talk to us today.]</h3><span class="small muted">${contact(t).slice(1).join(' · ')}</span></div><span class="btn">[Book a call]</span></div></div>` }] }) },
  { id: 'report', label: 'Report', sub: 'A4 cover page plus flowing text pages with a chart',
    build: (t) => ({ title: '[Report Title]', settings: { page: { size: 'A4' } }, pages: [
      { name: 'Cover', bg: 'primary', html: `
<div class="spread">${t.logo ? '<img src="logo" class="logo">' : `<b>${co(t)}</b>`}<span class="small muted">${today()}</span></div>
<div class="grow" style="display:flex;flex-direction:column;justify-content:center"><div class="eyebrow">[Report type or period]</div><h1 style="font-size:4em">[Report Title]</h1><div class="rule"></div><p class="lead muted">[A one-sentence summary of what this report covers.]</p></div>
<div class="small muted">Prepared by [Author] · ${co(t)}</div>` },
      { name: 'Report', flow: true, html: `
<h2>Executive summary</h2>
<p>[Three to five sentences: why this report was written, the main findings and what you recommend.]</p>
<div class="grid-3 mt-2 mb-3"><div class="card stat"><div class="num">[00]%</div><div class="lbl">[Key figure 1]</div></div><div class="card stat"><div class="num">[000]</div><div class="lbl">[Key figure 2]</div></div><div class="card stat"><div class="num">[0.0]</div><div class="lbl">[Key figure 3]</div></div></div>
<h2>Findings</h2>
<h3>[Finding 1]</h3><p>[What was found, with the evidence.]</p>
<chart type="line" title="[Trend over time]" labels="Jan,Feb,Mar,Apr,May,Jun" values="12,15,14,19,23,27" height="60mm"></chart>
<h3>[Finding 2]</h3><p>[What was found, with the evidence.]</p>
<table class="tbl"><thead><tr><th>Measure</th><th class="num">Previous</th><th class="num">Current</th><th class="num">Change</th></tr></thead><tbody><tr><td>[Measure 1]</td><td class="num">[0]</td><td class="num">[0]</td><td class="num">[+0%]</td></tr><tr><td>[Measure 2]</td><td class="num">[0]</td><td class="num">[0]</td><td class="num">[+0%]</td></tr></tbody></table>
<h2 class="mt-3">Recommendations</h2>
<ol><li><b>[Recommendation 1].</b> [Why, and what it would take.]</li><li><b>[Recommendation 2].</b> [Why, and what it would take.]</li><li><b>[Recommendation 3].</b> [Why, and what it would take.]</li></ol>` }] }) },
];
