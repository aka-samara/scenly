// PowerPoint decks. The model writes each slide in a small Markdown (title, bullets, tables, charts,
// stats, pictures, speaker notes); Scenly lays the slides out, shows them in the panel and builds a
// real .pptx with editable text, native charts and tables. An uploaded deck is opened with its look.
import { looseJson } from '../envelope.js';
import { clone, oneOf, pmap, esc } from '../util.js';
import { colour, SAFE_FONTS } from '../brand.js';
import { attrs } from '../pdf/components.js';
import { LAYOUTS, parseSlide, wordsOf, plain } from '../slides/markup.js';
import { SIZES, STYLES, deckBox } from '../slides/layout.js';
import { build, deckHtml, deckPptx } from '../slides/render.js';
import { TEMPLATES } from '../slides/templates.js';

const MAX_SLIDES = 60;
const SLIDE_RE = /<slide\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(?:\/>|>([\s\S]*?)<\/slide\s*>)/gi;
const SETTINGS_HELP = '{"size":"16:9|4:3","style":"clean|bold|dark|minimal","theme":{"primary":"#1F3A5F","accent":"#2E75B6","background":"#FFFFFF","font":"Calibri","headingFont":"Calibri"},"footer":"short text at the bottom left of every slide","numbers":true}';
const SLIDE_HELP = `HOW A SLIDE IS WRITTEN (a small Markdown, one item per line)
- "# Title" on every slide, optionally "## Subtitle" under it.
- Content: "- bullets" (two spaces deeper for a sub-bullet), "1. numbered points", plain paragraphs, "### a small heading", Markdown tables, and "> a quotation" with "-- who said it" on the next line.
- Tags, each on its own line:
  <chart type="bar|hbar|line|area|pie|doughnut|stacked" title="…" labels="2023,2024,2025" series="Revenue: 1.2,1.9,2.6; Costs: 0.9,1.1,1.3" prefix="$" suffix="m"/>
  <stat value="82%" label="On-time delivery"/>   (two to four in a row for the key numbers)
  <image src="file:ID"/> places a picture the user attached (ids are listed in the chat). <image prompt="a precise description of the picture"/> has a picture generated: use it ONLY when the user asks for generated or AI pictures (each costs credits; at most 6 a deck).
  <left> … </left> and <right> … </right> hold two columns (comparisons, before and after, pros and cons).
  <notes>what the presenter says on this slide, two to four natural sentences</notes>
- Layouts (the layout attribute): title (opening slide), section (a divider between parts), content (title and bullets; with a chart, table or picture the text sits beside it), two-column, image-left, image-right, image-full (a picture filling the slide with the title over it), chart, table, stats, quote, steps (three to five steps written "1. Name: one line"), closing. Leave the attribute out and the layout is chosen from the content.
DECK RULES
- One idea per slide, with a title that states the point ("Revenue grew 40% in 2025", not "Revenue").
- At most five bullets of at most twelve words each. Numbers go into a chart, a row of stats or a table, not into bullets. Vary the layouts so no three slides in a row look alike.
- Open with a title slide; decks over eight slides get section slides; end with a closing slide (next steps, the ask or contact details).
- Give every content slide speaker notes unless the user says otherwise.
- Write real, specific content from the request and the attached files. Use [square brackets] only for facts the user did not give.`;

function normSettings(s = {}) {
  const out = { size: Object.keys(SIZES).includes(s.size) ? s.size : '16:9', style: oneOf(s.style, STYLES, 'clean'), theme: {} };
  const t = s.theme || {};
  for (const k of ['primary', 'accent', 'background', 'text']) { const c = colour(t[k]); if (c) out.theme[k] = c; }
  for (const k of ['font', 'headingFont']) if (t[k] && SAFE_FONTS.some((f) => f.toLowerCase() === String(t[k]).toLowerCase())) out.theme[k] = SAFE_FONTS.find((f) => f.toLowerCase() === String(t[k]).toLowerCase());
  if (s.footer) out.footer = String(s.footer).replace(/<[^>]*>/g, '').slice(0, 90);
  if (s.numbers === false) out.numbers = false;
  // The look taken from an uploaded deck: sizes, colours, backgrounds, logo and placeholder positions.
  if (s.template && typeof s.template === 'object') out.template = s.template;
  return out;
}
// A brand kit cloned from a deck lends its look to decks that have none of their own.
const withLook = (spec, theme) => {
  const st = spec.settings || {}; const tp = theme?.template; if (!tp || st.template) return spec;
  if (tp.slides) return { ...spec, settings: { ...st, template: tp.slides } };
  if (tp.slidesStyle && (!st.style || st.style === 'clean')) return { ...spec, settings: { ...st, style: tp.slidesStyle } };
  return spec;
};
const mergeSettings = (a, b) => ({ ...a, ...b, theme: { ...(a.theme || {}), ...(b.theme || {}) }, template: b.template === null ? undefined : b.template || a.template });
function slideFrom(at, body) {
  const a = attrs(at); let text = String(body || ''); let notes = a.notes || '';
  text = text.replace(/<notes>([\s\S]*?)<\/notes>/gi, (_m, n) => { notes = notes ? `${notes}\n${n.trim()}` : n.trim(); return ''; }).replace(/<notes>[\s\S]*$/i, (m) => { notes = m.replace(/<notes>/i, '').trim(); return ''; });
  const s = { text: text.replace(/^\s*```\w*\n?|\n?```\s*$/g, '').replace(/^\n+|\s+$/g, '') };
  if (a.layout && LAYOUTS.includes(String(a.layout).toLowerCase())) s.layout = String(a.layout).toLowerCase();
  if (notes) s.notes = notes;
  if (a.build) s.build = String(a.build).slice(0, 700);
  if (a.n || a.slide) s.n = Math.round(Number(a.n || a.slide)) || undefined;
  return s;
}
const readSlides = (text) => [...String(text || '').matchAll(SLIDE_RE)].map((m) => slideFrom(m[1], m[2]));
const slideTag = (s, i) => `<slide${i != null ? ` n="${i + 1}"` : ''}${s.layout ? ` layout="${s.layout}"` : ''}>\n${s.text}${s.notes ? `\n<notes>${s.notes}</notes>` : ''}\n</slide>`;
const titleOf = (s) => plain(parseSlide(s.text).title || '').slice(0, 60);

export default {
  id: 'slides', label: 'PowerPoint', noun: 'presentation', ext: 'pptx', icon: 'PPT',
  detect: /\b(pptx?|powerpoint|slide ?deck|pitch deck|slides|keynote presentation)\b|\b(create|make|build|prepare|draft|generate|write|need|want)\b[^.?!\n]{0,60}\b(presentation|deck)\b/i,
  formats: [
    { id: 'pptx', label: 'PowerPoint', sub: '.pptx, opens in PowerPoint, Keynote and Google Slides', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    { id: 'pdf', label: 'PDF', sub: 'One slide per page', mime: 'application/pdf' },
    { id: 'notes', ext: 'pdf', label: 'PDF with speaker notes', sub: 'Each slide with its notes under it', mime: 'application/pdf' },
    { id: 'png', ext: 'zip', label: 'Images', sub: 'One PNG per slide (.zip)', mime: 'application/zip' },
  ],
  suggestions: ['Add speaker notes to every slide', 'Make it more visual, with fewer words', 'Switch to a dark style', 'Add a slide with next steps'],
  templates: TEMPLATES.map((t) => ({ id: t.id, label: t.label, sub: t.sub })),
  seedMessage: (label) => `Here is the ${label} deck. Tell me about your company or topic and I'll write it for you, or use Edit to change any slide yourself.`,
  pictures: true,
  imports: ['pptx'],
  canImport: (name) => /\.pptx$/i.test(String(name || '')),
  importsInto: false,
  // An attached deck opens in Docs Studio when the message asks for work on the deck itself.
  wants: (text) => !String(text || '').trim() || /\b(edit|rewrite|translate|restyle|redesign|reformat|shorten|expand|improve|polish|update|fix|correct|add|remove|replace|change|convert|clean up|open|use|template|theme|master|same (look|style|design)|like this|speaker notes)\b/i.test(String(text || '')),
  justOpens: (text) => text.length < 90 && /^(please |can you |could you )?(open|load|import|view|show|edit)\b[^.,;:]*\b(deck|presentation|slides|powerpoint|pptx|file|it|this)\b[^.,;:]{0,30}[.!?]?$/i.test(text),
  planTokens: 4200,
  template(id, theme) { const t = TEMPLATES.find((x) => x.id === id); if (!t) return null; const v = this.validate({ kind: 'slides', ...t.build(theme) }); return { label: t.label, spec: v.spec }; },
  async importFiles(files, _cur, ctx) {
    const { importPptx } = await import('../slides/import.js');
    const r = await importPptx(files[0], { user: ctx.user });
    const v = this.validate(r.spec); if (v.errors.length) throw new Error(v.errors[0]);
    if (files.length > 1) r.notes.push(`Only ${files[0].name} was opened. Attach the other files one at a time.`);
    return { spec: v.spec, notes: r.notes };
  },

  prompt(mode, cur) {
    return mode === 'create' ? `You are a presentation designer writing a PowerPoint deck.

Inside <document title="…"> write one line <settings>{…}</settings> (optional), then the slides, each as <slide layout="…"> … </slide>.
- Settings (include only what the request needs; pick a style and two colours that suit the subject): ${SETTINGS_HELP}
${SLIDE_HELP}
LONG DECKS: if the deck has more than seven slides, do not write them all now. Write the settings, the title slide in full, and every other slide as one line <slide layout="…" build="exactly what this slide says and shows: its point, the facts and numbers, and the data of any chart or table"/>. Those slides are then written separately and merged in before the user sees anything, so your <message> describes the finished deck and never mentions briefs. When the user does not say how long the deck should be, eight to twelve slides suit most subjects.`
      : `You are a presentation designer editing the user's PowerPoint deck. Its slides are shown below with their numbers. Change it with one or more <edit> blocks; only send what changes.
- <edit op="replace_slide" slide="3" layout="…">the complete new text of that slide, with its <notes></edit>
- <edit op="insert_slide" after="3" layout="…">the text of a new slide</edit>   (after="0" puts it first; give build="a brief" instead of text to have it written separately)
- <edit op="delete_slide" slide="4"/>     <edit op="move_slide" slide="5" to="2"/>
- <edit op="slide" slide="2" layout="image-left"/>   changes the layout only
- <edit op="notes" slide="2">new speaker notes</edit>
- <edit op="replace_text" find="exact text on a slide" replace="new text"/>   (all="true" for every match)
- <edit op="settings">{"style":"dark","theme":{"accent":"#E4572E"}}</edit>   look, colours, fonts, size, footer${cur?.settings?.template ? ' (this deck uses the look of an uploaded deck; {"template":null} drops it)' : ''}
- <edit op="title">New deck title</edit>
- <edit op="rewrite_all" instruction="what to do to every slide, e.g. Translate into French, keep numbers"/>  rewrites each slide separately: use it for translations, a change of tone or length across the deck, and for adding speaker notes everywhere.
Slide numbers always mean the numbers shown below, whatever else you insert, delete or move in the same reply.
${SLIDE_HELP}`;
  },

  parseDocument({ attrs: a, body }, ctx) {
    let text = String(body || ''); let settings = {};
    const m = text.match(/<settings>([\s\S]*?)<\/settings>/i);
    if (m) { try { settings = looseJson(m[1]); } catch { /* ignored */ } text = text.replace(m[0], ''); }
    let slides = readSlides(text);
    // A reply without <slide> tags: slides separated by lines of ---, or one slide per "# Title".
    if (!slides.length && text.trim()) slides = text.split(/\n\s*---+\s*\n|\n(?=#\s)/).map((t) => slideFrom('', t)).filter((s) => s.text.trim());
    // Slides written the way the deck is shown to the model: "--- Slide 3 [layout: chart] ---".
    const HEAD = /^[ \t]*-{2,}\s*Slide\s+\d+\s*(?:\[\s*layout\s*:\s*([\w-]+)\s*\])?\s*-{2,}[ \t]*$/gim;
    if (slides.length <= 1 && [...text.matchAll(HEAD)].length >= 2) { const parts = text.replace(/<\/?slide\b[^>]*>/gi, '').split(HEAD); slides = []; for (let i = 1; i < parts.length; i += 2) { const sl = slideFrom(parts[i] ? `layout="${parts[i]}"` : '', parts[i + 1] || ''); if (sl.text.trim()) slides.push(sl); } }
    else slides = slides.map((sl) => ({ ...sl, text: sl.text.replace(HEAD, '').trim() }));
    // A deck rebuilt in place keeps the look cloned from the uploaded deck unless the reply drops it.
    const keep = ctx?.current?.settings?.template; if (keep && settings.template === undefined) settings.template = keep; else if (typeof settings.template === 'string') settings.template = keep || undefined;
    return { kind: 'slides', title: a.title || '', settings, slides };
  },

  validate(spec) {
    const errors = [], warnings = [];
    const out = { kind: 'slides', title: String(spec.title || '').trim().slice(0, 120), settings: normSettings(spec.settings || {}), slides: [] };
    for (const s of (spec.slides || []).slice(0, MAX_SLIDES)) {
      const q = { text: String(s.text || '').replace(/<\/?(document|message|edit|slide|settings)\b[^>]*>/gi, '').replace(/\r/g, '').trim().slice(0, 6000) };
      if (s.layout && LAYOUTS.includes(s.layout)) q.layout = s.layout;
      if (s.notes) q.notes = String(s.notes).replace(/<[^>]*>/g, '').trim().slice(0, 3000);
      if (s.build) q.build = String(s.build).slice(0, 700);
      if (!q.text && !q.build) continue;
      out.slides.push(q);
    }
    if ((spec.slides || []).length > MAX_SLIDES) warnings.push(`Only the first ${MAX_SLIDES} slides were kept.`);
    if (!out.slides.length) errors.push('The deck has no slides. Write each slide as <slide layout="…">…</slide>.');
    if (!out.title) out.title = (out.slides[0] && titleOf(out.slides[0])) || 'Presentation';
    return { spec: out, errors, warnings };
  },

  // Slides left as a brief are written a few at a time; pictures asked for by prompt are generated.
  async expand(spec, ctx) {
    const s = clone(spec);
    const todo = s.slides.map((p, i) => ({ p, i })).filter((x) => x.p.build);
    if (todo.length) {
      const outline = s.slides.map((p, i) => `${i + 1}. ${p.build ? `[${p.layout || 'auto'}] ${p.build.slice(0, 200)}` : `${titleOf(p)} (written)`}`).join('\n');
      const groups = []; for (let i = 0; i < todo.length; i += 2) groups.push(todo.slice(i, i + 2));
      let done = 0; ctx.status(`Writing ${todo.length} slides…`);
      await pmap(groups, async (g) => {
        let got = [];
        try {
          const reply = await ctx.ask(
            `You are a presentation designer writing slides of the deck "${s.title}". Reply with ONLY the slides asked for, each as <slide n="its number" layout="…"> … </slide>: no explanations, no code fence.\n${SLIDE_HELP}`,
            `The whole deck, for context:\n${outline}\n\n${ctx.request ? `What the user asked for: ${ctx.request.slice(0, 1500)}\n\n` : ''}Write slide${g.length > 1 ? 's' : ''} ${g.map((x) => x.i + 1).join(', ')} in full:\n${g.map((x) => `Slide ${x.i + 1}${x.p.layout ? ` (layout ${x.p.layout})` : ''}: ${x.p.build}`).join('\n')}`, { maxTokens: 2600 });
          got = readSlides(reply);
        } catch (e) { if (ctx.signal?.aborted || e.code === 'insufficient_credits') throw e; }
        g.forEach((x, k) => {
          const hit = got.find((q) => q.n === x.i + 1) || (got.every((q) => !q.n) ? got[k] : null);
          if (hit?.text) { delete hit.n; delete hit.build; s.slides[x.i] = { ...hit, layout: hit.layout || x.p.layout }; if (!s.slides[x.i].layout) delete s.slides[x.i].layout; }
          else { ctx.warn(`Slide ${x.i + 1} could not be written. Ask me to redo slide ${x.i + 1}.`); s.slides[x.i] = { layout: x.p.layout, text: `# ${x.p.build.split(/[.:;]/)[0].slice(0, 70)}\n- [This slide could not be written. Ask Scenly to redo slide ${x.i + 1}.]` }; }
        });
        done += g.length; ctx.status(`Writing slides… ${Math.min(done, todo.length)} of ${todo.length}`);
      }, 6);
    }
    await this.pictures_(s, ctx);
    return s;
  },
  // <image prompt="…"/> → a generated picture, stored with the user's files and placed by its id.
  async pictures_(s, ctx) {
    const wants = []; s.slides.forEach((p, i) => { for (const m of String(p.text).matchAll(/<image\b[^>]*\bprompt\s*=\s*("[^"]*"|'[^']*')[^>]*>/gi)) if (!/\bsrc\s*=\s*["']?file:/i.test(m[0])) wants.push({ i, tag: m[0], prompt: m[1].slice(1, -1) }); });
    if (!wants.length || !ctx.user) return;
    const list = wants.slice(0, 6); if (wants.length > 6) ctx.warn('Only the first 6 pictures were generated. Ask me for the others one slide at a time.');
    let model = null;
    try { const { getCatalog } = await import('../../catalog.js'); model = (await getCatalog()).filter((m) => m.type === 'image' && m.price?.creditsPerImage > 0 && m.image?.sizes?.length).sort((a, b) => a.price.creditsPerImage - b.price.creditsPerImage)[0]; } catch { model = null; }
    if (!model) { ctx.warn('No picture model is available right now, so the pictures were left as placeholders.'); return; }
    ctx.status(`Generating ${list.length} picture${list.length > 1 ? 's' : ''}…`);
    const { runImage } = await import('../../generate.js'); const { storeImage } = await import('../../files.js'); const { MEDIA_DIR } = await import('../../db.js'); const fs = await import('node:fs'); const path = await import('node:path');
    let made = 0, failed = 0;
    await pmap(list, async (w) => {
      try {
        const wide = model.image.sizes.find((z) => { const m = /^(\d+)\D+(\d+)$/.exec(z); return m && Number(m[1]) > Number(m[2]); });
        const r = await runImage(ctx.user, { modelId: model.id, prompt: `${w.prompt}. Clean, professional presentation visual, no text or lettering.`, size: wide, count: 1, meta: { source: 'slides' } });
        const media = r.media[0]; if (!media?.file && !media?.key) throw new Error('no file');
        const rec = storeImage(ctx.user, `slide-${w.i + 1}.png`, 'image/png', fs.readFileSync((await import('../../storage.js')).locate(media)));
        s.slides[w.i].text = s.slides[w.i].text.replace(w.tag, `<image src="file:${rec.id}" alt="${esc(w.prompt.slice(0, 120))}"/>`); made++;
      } catch (e) { if (ctx.signal?.aborted) throw e; failed++; }
    }, 3);
    if (made) ctx.note?.(`Generated ${made} picture${made > 1 ? 's' : ''} with ${model.name}`);
    if (failed) ctx.warn(`${failed} picture${failed > 1 ? 's' : ''} could not be generated and ${failed > 1 ? 'were' : 'was'} left as a placeholder.`);
  },

  describe(spec) {
    const cap = spec.slides.length > 40 ? 700 : 2500;
    const st = { ...spec.settings }; if (st.template) st.template = '(the look of the uploaded deck)';
    return `Title: ${spec.title}\nSettings: ${JSON.stringify(st)}\n${spec.slides.length} slides:\n\n${spec.slides.map((s, i) => `--- Slide ${i + 1}${s.layout ? ` [layout: ${s.layout}]` : ''} ---\n${s.text.length > cap ? s.text.slice(0, cap) + '\n…' : s.text}${s.notes ? `\n<notes>${s.notes.length > 500 ? s.notes.slice(0, 500) + '…' : s.notes}</notes>` : ''}`).join('\n\n')}`;
  },

  async applyEdits(spec, edits, ctx) {
    const s = clone(spec); const notes = [], errors = []; const n0 = s.slides.length;
    // Every slide keeps the number it had before the edits, so several edits in one reply never shift each other.
    const tagged = s.slides.map((x, i) => ({ ...x, _n: i + 1 }));
    const at = (v) => { const n = Math.round(Number(String(v ?? '').replace(/[^\d.-]/g, ''))); return Number.isFinite(n) ? tagged.findIndex((x) => x._n === n) : -1; };
    const order = (op) => (/^(insert|add)/.test(op) ? 1 : /^delete|^remove/.test(op) ? 2 : /^move/.test(op) ? 3 : /^rewrite/.test(op) ? 4 : 0);
    const list = edits.map((e) => ({ e, op: String(e.attrs.op || '').toLowerCase().replace(/-/g, '_') })).sort((a, b) => order(a.op) - order(b.op));
    const todo = [];
    for (const { e, op } of list) {
      const body = String(e.body || '').trim(); const a = e.attrs;
      const inner = () => { const got = readSlides(body)[0] || slideFrom('', body); if (a.layout && LAYOUTS.includes(String(a.layout).toLowerCase())) got.layout = String(a.layout).toLowerCase(); if (a.build) got.build = String(a.build); delete got.n; return got; };
      if (op === 'replace_slide') {
        const i = at(a.slide ?? a.n); if (i < 0) { errors.push(`replace_slide: there is no slide "${a.slide}". The deck has ${n0} slides.`); continue; }
        const got = inner(); if (!got.text && !got.build) { errors.push(`replace_slide ${a.slide}: the edit has no slide text.`); continue; }
        tagged[i] = { ...got, notes: got.notes ?? tagged[i].notes, _n: tagged[i]._n }; if (!tagged[i].notes) delete tagged[i].notes; notes.push(`Rewrote slide ${a.slide}`);
      } else if (op === 'insert_slide' || op === 'add_slide') {
        const got = inner(); if (!got.text && !got.build) { errors.push('insert_slide: the edit has no slide text.'); continue; }
        const after = a.after != null ? Math.round(Number(a.after)) : a.before != null ? Math.round(Number(a.before)) - 1 : n0;
        let pos = after <= 0 ? 0 : tagged.findIndex((x) => x._n === after) + 1; if (pos <= 0 && after > 0) pos = tagged.length;
        // Several slides inserted after the same slide keep the order they were sent in.
        while (pos < tagged.length && tagged[pos]._after === after) pos++;
        tagged.splice(pos, 0, { ...got, _after: after }); notes.push(`Added a slide${got.text ? `: ${titleOf(got)}` : ''}`);
      } else if (op === 'delete_slide' || op === 'remove_slide') {
        const i = at(a.slide ?? a.n); if (i < 0) { errors.push(`delete_slide: there is no slide "${a.slide}".`); continue; }
        if (tagged.length <= 1) { errors.push('The last slide cannot be deleted.'); continue; }
        tagged.splice(i, 1); notes.push(`Deleted slide ${a.slide}`);
      } else if (op === 'move_slide') {
        const i = at(a.slide ?? a.n); const to = Math.max(1, Math.min(tagged.length, Math.round(Number(a.to)) || 1)); if (i < 0) { errors.push(`move_slide: there is no slide "${a.slide}".`); continue; }
        tagged.splice(to - 1, 0, tagged.splice(i, 1)[0]); notes.push(`Moved slide ${a.slide} to position ${to}`);
      } else if (op === 'slide' || op === 'layout') {
        const i = at(a.slide ?? a.n); if (i < 0) { errors.push(`slide: there is no slide "${a.slide}".`); continue; }
        const l = String(a.layout || '').toLowerCase(); if (!LAYOUTS.includes(l)) { errors.push(`"${a.layout}" is not a layout. Use one of: ${LAYOUTS.join(', ')}.`); continue; }
        tagged[i].layout = l; notes.push(`Slide ${a.slide} now uses the ${l} layout`);
      } else if (op === 'notes') {
        const i = at(a.slide ?? a.n); if (i < 0) { errors.push(`notes: there is no slide "${a.slide}".`); continue; }
        if (body) tagged[i].notes = body.replace(/<\/?notes>/gi, '').trim(); else delete tagged[i].notes; notes.push(`Updated the notes of slide ${a.slide}`);
      } else if (op === 'replace_text') {
        const find = a.find ?? ''; const rep = a.replace ?? body; if (!find) { errors.push('replace_text needs a find attribute.'); continue; }
        let hits = 0; const all = /^(true|yes|1)$/i.test(a.all || '');
        for (const x of tagged) for (const k of ['text', 'notes']) { if (!x[k] || !x[k].includes(find) || (hits && !all)) continue; hits += x[k].split(find).length - 1; x[k] = all ? x[k].split(find).join(rep) : x[k].replace(find, rep); }
        if (!hits) errors.push(`replace_text: "${String(find).slice(0, 60)}" was not found on any slide. Copy the text exactly as it is written below, or use replace_slide.`); else notes.push(`Replaced "${String(find).slice(0, 40)}"`);
      } else if (op === 'settings') { try { s.settings = mergeSettings(s.settings, looseJson(body)); notes.push('Updated the look'); } catch { errors.push('settings: the content must be JSON.'); } }
      else if (op === 'title') { if (body) { s.title = body.slice(0, 120); notes.push('Renamed the deck'); } }
      else if (op === 'rewrite_all') { const instruction = a.instruction || body; if (!instruction) errors.push('rewrite_all needs an instruction attribute.'); else todo.push(instruction); }
      else errors.push(`Unknown edit op "${a.op}".`);
    }
    s.slides = tagged.map(({ _n, _after, ...x }) => x);
    for (const instruction of todo) {
      if (!ctx?.ask) break;
      const groups = []; for (let i = 0; i < s.slides.length; i += 4) groups.push(s.slides.map((x, k) => ({ x, k })).slice(i, i + 4));
      let done = 0; ctx.status(`Rewriting ${s.slides.length} slides…`);
      await pmap(groups, async (g) => {
        try {
          const reply = await ctx.ask(
            `You are a presentation designer reworking slides of the deck "${s.title}". Apply the instruction to each slide below and reply with ONLY those slides, each as <slide n="its number" layout="…"> … </slide>. Keep every fact, number, chart, table and picture tag unless the instruction says otherwise.\n${SLIDE_HELP}`,
            `Instruction: ${instruction}\n\n${g.map(({ x, k }) => slideTag(x, k)).join('\n\n')}`, { maxTokens: 3200 });
          const got = readSlides(reply);
          g.forEach(({ x, k }, gi) => { const hit = got.find((q) => q.n === k + 1) || (got.every((q) => !q.n) ? got[gi] : null); if (hit?.text) { delete hit.n; s.slides[k] = { ...hit, layout: hit.layout || x.layout, notes: hit.notes ?? x.notes }; for (const key of ['layout', 'notes']) if (!s.slides[k][key]) delete s.slides[k][key]; } else ctx.warn(`Slide ${k + 1} was left as it was.`); });
        } catch (err) { if (ctx.signal?.aborted || err.code === 'insufficient_credits') throw err; ctx.warn(`Slides ${g[0].k + 1} to ${g.at(-1).k + 1} were left as they were because the model did not answer in time.`); }
        done += g.length; ctx.status(`Rewriting slides… ${Math.min(done, s.slides.length)} of ${s.slides.length}`);
      }, 4);
      notes.push(instruction.length > 60 ? instruction.slice(0, 57) + '…' : instruction);
    }
    if (s.slides.some((x) => x.build) || /<image\b[^>]*\bprompt=/i.test(s.slides.map((x) => x.text).join('\n'))) { const ex = await this.expand(s, ctx); s.slides = ex.slides; }
    return { spec: s, notes, errors };
  },

  applyManual(spec, change) {
    const s = clone(spec);
    // The editor sends the whole deck back: slides edited, added, removed or reordered by hand.
    if (Array.isArray(change.deck) && change.deck.length) s.slides = change.deck.slice(0, MAX_SLIDES).map((x) => { const q = { text: String(x.text || '') }; if (x.layout && LAYOUTS.includes(x.layout)) q.layout = x.layout; if (x.notes) q.notes = String(x.notes); return q; });
    if (change.resetTheme && s.settings) { s.settings.theme = {}; }
    if (change.settings && typeof change.settings === 'object') s.settings = mergeSettings(s.settings || {}, change.settings);
    if (typeof change.title === 'string' && change.title.trim()) s.title = change.title.trim();
    return s;
  },
  source: (spec) => ({ type: 'slides', slides: spec.slides.map((x) => ({ layout: x.layout || '', text: x.text, notes: x.notes || '' })), layouts: LAYOUTS, settings: { size: spec.settings.size, style: spec.settings.style, footer: spec.settings.footer || '', numbers: spec.settings.numbers !== false, template: !!spec.settings.template }, styles: STYLES }),
  summary(spec) { const n = spec.slides.length; const notes = spec.slides.filter((x) => x.notes).length; return `${n} slide${n === 1 ? '' : 's'} · ${spec.settings.template ? 'your deck\'s look' : spec.settings.size}${notes ? ` · notes on ${notes === n ? 'every slide' : notes}` : ''}`; },
  stats: (spec) => ({ slides: spec.slides.length, words: spec.slides.reduce((a, x) => a + wordsOf(x.text), 0) }),

  async preview(spec0, theme) {
    const spec = withLook(spec0, theme);
    const built = await build(spec, theme); const { W, H } = built.box;
    return { type: 'pages', html: deckHtml(spec, built, { mode: 'preview' }), width: W * 25.4, height: H * 25.4, count: spec.slides.length, names: spec.slides.map((x, i) => titleOf(x) || `Slide ${i + 1}`), unit: 'Slide' };
  },
  async render(spec0, format, theme) {
    const spec = withLook(spec0, theme);
    const built = await build(spec, theme); const { W, H } = deckBox(spec.settings);
    if (format === 'pptx') return deckPptx(spec, built, theme);
    const { htmlToPdf } = await import('../pdf/render.js');
    if (format === 'notes') {
      // Notes pages: the slide on the top half of a portrait page, its notes underneath.
      const html = deckHtml(spec, built, { mode: 'print' }); const k = 180 / (W * 25.4);
      const pages = built.slides.map((sl, i) => `<div class="np"><div class="sl"><div style="zoom:${k.toFixed(4)}">${html.match(new RegExp(`<section class="pg" data-page="${i}"[\\s\\S]*?</section>`))?.[0] || ''}</div></div><h3>${i + 1}. ${esc(sl.title || 'Slide')}</h3><p>${esc(sl.notes || '').replace(/\n/g, '<br>') || '<i>No notes for this slide.</i>'}</p></div>`).join('');
      const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/@page\{[^}]*\}/, '@page{size:210mm 297mm;margin:0}').replace(/break-after:page;/, '');
      return htmlToPdf(`<!doctype html><html><head><meta charset="utf-8"><style>${css}.np{width:210mm;height:297mm;padding:15mm;break-after:page;font:11.5pt/1.5 Calibri,Carlito,Arial,sans-serif;color:#222;overflow:hidden}.np:last-child{break-after:auto}.np .sl{border:.3mm solid #ccc;width:180mm;height:${(180 * H / W).toFixed(2)}mm;overflow:hidden}.np .pg{margin:0!important;box-shadow:none!important}.np h3{font-size:13pt;margin:8mm 0 3mm}.np p{margin:0;white-space:normal}</style></head><body style="padding:0;background:#fff">${pages}</body></html>`, { widthMm: 210, heightMm: 297 });
    }
    const pdf = await htmlToPdf(deckHtml(spec, built, { mode: 'print' }), { widthMm: W * 25.4, heightMm: H * 25.4 });
    if (format === 'png') { const { rasterize } = await import('../pdf/tools.js'); const { default: JSZip } = await import('jszip'); const zip = new JSZip(); const imgs = await rasterize(pdf, { scale: 2, max: MAX_SLIDES }); imgs.forEach((b, i) => zip.file(`${spec.title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60)} - slide ${String(i + 1).padStart(2, '0')}.png`, b)); return zip.generateAsync({ type: 'nodebuffer' }); }
    return pdf;
  },
};
