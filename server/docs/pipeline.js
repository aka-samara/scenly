// One Docs Studio turn: ask the model for a document (or edits to one), check the result,
// ask once more if it cannot be built, write long parts separately, then save a new version.
import { complete, GatewayError } from '../gateway.js';
import { estimateChatUsd, paidUsd } from '../catalog.js';
import { UserError } from '../generate.js';
import { KINDS } from './kinds/index.js';
import { parseReply } from './envelope.js';
import { createDoc, addVersion, readVersion, setCurrent, deleteDoc, docDir } from './store.js';
import { resolveTheme, brandNote } from './brand.js';
import { DocError } from './util.js';
import { cloneBrand, CLONE_ASK, CLONE_EXT } from './clone.js';

const CORE = (k, mode) => `You are Scenly, working in Docs Studio, the part of the app that builds real files. Today is ${new Date().toDateString()}.
The app turns what you write into a real ${k.label} (.${k.ext}), shows it next to the chat with a live preview and offers it for download. So never say you cannot create or attach files, never tell the user to copy and paste, and never describe these format rules to the user.

Reply in EXACTLY this format, with nothing outside the tags:
<message>One or two short, friendly sentences telling the user what you ${mode === 'create' ? 'made' : 'changed'}. Plain text.</message>
${mode === 'create' ? `<document title="Short file title">\n…the ${k.noun}…\n</document>` : '<edit …>…</edit> blocks, as described below. To throw the current file away and start again, send a complete <document title="…">…</document> instead.'}

If the user only asks a question and nothing has to be ${mode === 'create' ? 'created' : 'changed'}, reply with only <message>your full answer</message>. If the request is too unclear to build anything useful, ask one short question the same way.`;

// How fast each model has been answering lately (tokens per second). The gateway cuts every request
// at 60 seconds, so a slow model is asked for shorter replies instead of being left to time out.
const SPEED = new Map();
const capFor = (model, want) => { const v = SPEED.get(model.id); return v ? Math.max(900, Math.min(want, Math.floor(v * 42))) : want; };

export async function runDocTurn({ user, conv, model, kindId, doc, fresh, history, status = () => {}, signal, budgetUsd = Infinity, projectContext = '', files = [], attached = [], template = null, userText = '' }) {
  const k = KINDS[kindId];
  if (!k) throw new UserError('That document type is not available yet.');
  let cur = doc && !fresh ? readVersion(doc) : null;
  // "…as a PDF": a type that can also print to PDF offers that download first.
  const wantFormat = k.id !== 'pdf' && /\bpdf\b/i.test(userText) && !/\.pdf\b|\b(this|the attached|uploaded) pdf\b/i.test(userText) && k.formats.some((f) => f.id === 'pdf') ? 'pdf' : undefined;
  const warnings = [];
  // "In the same format as this file": the look of an attached Word, Excel, PowerPoint or PDF file is saved
  // as a brand kit and this document follows it. A file this type opens itself already brings its look.
  let cloned = null;
  const sample = CLONE_ASK.test(userText) && attached.find((f) => CLONE_EXT.test(f.name) && !files.includes(f) && !(k.id === 'pdf' && /\.pdf$/i.test(f.name)));
  if (sample) {
    try { status(`Reading the look of ${sample.name}…`); cloned = await cloneBrand(user, { file: sample, reuse: true }); if (doc) { doc.brandId = cloned.brand.id; } warnings.push(...cloned.notes.slice(0, 1), ...(cloned.notes.length > 1 ? ['It is saved under brand kits, so any document can use it.'] : [])); }
    catch (e) { warnings.push(e instanceof UserError ? e.message : `The look of ${sample.name} could not be read.`); }
  }
  const theme = resolveTheme(user, cloned ? { brandId: cloned.brand.id } : doc || {});
  const usage = { usd: 0, input: 0, output: 0, calls: 0 };

  const call = async (messages, maxTokens) => {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (usage.usd >= budgetUsd) throw new UserError('Not enough credits to finish this document. Top up or choose a cheaper model.', 402, 'insufficient_credits');
    const t0 = Date.now();
    let r;
    try { r = await complete(model, messages, { maxTokens: capFor(model, maxTokens), signal }); }
    catch (e) { if (e.code === 'timeout') SPEED.set(model.id, Math.min(SPEED.get(model.id) || 50, 50) * 0.6); throw e; }
    const secs = (Date.now() - t0) / 1000, out = r.usage?.completion_tokens || 0;
    if (out > 150 && secs > 2) { const now = out / secs, was = SPEED.get(model.id); SPEED.set(model.id, was ? was * 0.5 + now * 0.5 : now); }
    usage.calls++;
    if (process.env.DOCS_DEBUG) console.log(`--- docs reply (${model.id}, finish ${r.finish}, ${r.usage?.completion_tokens} tokens) ---\n${r.text}\n---`);
    usage.input += r.usage?.prompt_tokens || 0; usage.output += r.usage?.completion_tokens || 0;
    usage.usd += paidUsd(r.usage, estimateChatUsd(model, r.usage?.prompt_tokens || 0, r.usage?.completion_tokens || Math.ceil(r.text.length / 3.5)));
    return r;
  };
  const ctx = {
    theme, signal, status, user, request: String(userText || '').slice(0, 4000),
    warn: (w) => warnings.push(w),
    // A small side request to the same model, used for writing or rewriting one part.
    ask: async (system, text, { maxTokens = 3000 } = {}) => {
      const msgs = [{ role: 'system', content: system }, { role: 'user', content: text }];
      try { return (await call(msgs, maxTokens)).text; }
      catch (e) { if (e.code !== 'timeout' || signal?.aborted) throw e; return (await call([...msgs, { role: 'user', content: 'Your last reply took too long and was cancelled. Answer again, more briefly.' }], maxTokens)).text; }
    },
  };

  ctx.dir = doc ? docDir(doc) : null;

  // An uploaded file or a ready-made template becomes the first version before the model is asked anything.
  let target = doc || null, seeded = null;
  const undoSeed = () => { if (!seeded) return; if (seeded.newDoc) deleteDoc(target); else if (seeded.prev) setCurrent(target, seeded.prev); };
  if (!fresh && files.length && k.importFiles) {
    const newDoc = !target;
    target ||= createDoc(user, { brandId: cloned?.brand.id, kind: k.id, title: files[0].name.replace(/\.\w+$/, ''), conversationId: conv.id, projectId: conv.projectId });
    ctx.dir = docDir(target);
    try {
      const r = await k.importFiles(files, cur, ctx);
      const prev = target.current;
      const names = files.map((f) => f.name).join(', ');
      const v = addVersion(target, r.spec, { note: `${cur ? 'Added' : 'Opened'} ${names}`, by: 'upload', summary: k.summary(r.spec) });
      warnings.push(...r.notes);
      seeded = { v, prev, newDoc, action: cur ? 'edited' : 'created', notes: [`${cur ? 'Added' : 'Opened'} ${names}`], message: `I've opened ${names}${cur ? ` in this ${k.noun}` : ''}: ${k.summary(r.spec)}. Ask me anything about it, or tell me what to change.` };
      cur = r.spec;
    } catch (e) {
      if (newDoc) deleteDoc(target);
      throw e instanceof UserError ? e : new UserError(`That file could not be opened (${String(e.message).slice(0, 200)}). No credits were charged.`);
    }
  } else if (!cur && template && k.template) {
    const t = k.template(template, theme);
    if (t) {
      if (k.check) t.spec = (await k.check(t.spec, { theme, warn: () => {} })) || t.spec;
      target = createDoc(user, { brandId: cloned?.brand.id, kind: k.id, title: t.spec.title, conversationId: conv.id, projectId: conv.projectId });
      ctx.dir = docDir(target);
      const v = addVersion(target, t.spec, { note: `Started from the ${t.label} template`, by: 'ai', summary: k.summary(t.spec) });
      seeded = { v, newDoc: true, action: 'created', notes: [], message: k.seedMessage ? k.seedMessage(t.label) : `Here is the ${t.label} template. Tell me what to change.` };
      cur = t.spec;
    }
  }
  const seededDoc = () => ({ format: wantFormat, id: target.id, v: seeded.v, base: seeded.prev || undefined, seed: seeded.v, kind: k.id, title: target.title, action: seeded.action, summary: k.summary(cur), notes: seeded.notes, warnings: warnings.slice(0, 6) });
  // Nothing more was asked than "open this": no model call is needed.
  if (seeded && (!userText.trim() || /^(start (from|with) the .{3,40} template\.?|(please )?(open|load|import|view|show)( (this|it|the|my))?( (file|spreadsheet|workbook|csv|data|document|doc|docx|word (file|document)))?( in docs studio)?\.?)$/i.test(userText.trim()) || k.justOpens?.(userText.trim(), files)))
    return { message: seeded.message, doc: seededDoc(), target, usage, warnings };

  try { return await modelTurn(); } catch (e) { undoSeed(); throw e; }

  async function modelTurn() {
  const mode = cur ? 'edit' : 'create';
  const current = cur ? await k.describe(cur, ctx) : '';
  // A sample the user wants followed (for example a PDF whose layout is to be rebuilt).
  let sample = '';
  if (k.reference && attached.length) { try { sample = await k.reference(attached, userText, ctx); } catch { sample = ''; } }
  const system = [CORE(k, mode), k.prompt(mode, cur), brandNote(theme), sample, cur ? `CURRENT ${k.label.toUpperCase()} (version ${target.current}):\n${current}` : '', projectContext].filter(Boolean).join('\n\n');
  const messages = [{ role: 'system', content: system }, ...history];

  status(mode === 'create' ? `Planning your ${k.noun}…` : 'Working out the changes…');
  const planTokens = k.planTokens || 4500;
  let first;
  try { first = await call(messages, planTokens); }
  catch (e) {
    // Too slow to finish inside the gateway's time limit: ask once more for a shorter reply.
    if (e.code !== 'timeout' || signal?.aborted) throw e;
    status(`${model.name} is answering slowly. Trying again with a shorter plan…`);
    first = await call([...messages, { role: 'user', content: `Your last reply took too long and was cancelled. Reply again in the required format, but keep the whole reply under ${Math.round(capFor(model, planTokens) * 0.6)} tokens: think briefly, ${mode === 'create' ? 'give a short plan and leave the detail to the parts that are written separately' : 'send only the smallest edits that do the job'}.` }], planTokens);
  }
  // The model may first ask to read the data (spreadsheets): answer its queries, then let it reply properly.
  for (let round = 0; k.answerQueries && cur && round < 3; round++) {
    const results = await k.answerQueries(first.text, cur, ctx);
    if (!results) break;
    status('Reading the data…');
    messages.push({ role: 'assistant', content: first.text.slice(0, 6000) }, { role: 'user', content: `${results}\n\nThose are the results. ${round === 2 ? 'Do not send more queries. ' : ''}Now reply in the required format (<message>, plus <edit> blocks only if the workbook has to change).` });
    first = await call(messages, planTokens);
  }
  let built = await build(first, mode);

  if (built.errors.length) {
    // One more try, telling the model exactly what was wrong.
    status('Fixing a problem and trying again…');
    const fix = built.cutOff
      ? `Your reply was cut off before it finished, so nothing could be built. Reply again in the same format, but shorter: ${mode === 'create' ? 'keep the structure and use the long-document method described above so it fits' : 'send fewer or smaller edits'}.`
      : `That could not be built:\n- ${built.errors.slice(0, 8).join('\n- ')}\n\nReply again in exactly the required format with these problems fixed. The user never saw that attempt, so write the <message> as if this were your first reply and do not mention corrections.`;
    const second = await call([...messages, { role: 'assistant', content: first.text.slice(0, 12000) }, { role: 'user', content: fix }], planTokens);
    built = await build(second, mode);
    first = second;
    if (built.errors.length) throw new DocError(`${model.name} did not produce a usable ${k.noun} this time. No credits were charged. Please try again, or pick a stronger model for this task.`, built.errors);
  }
  const said = (built.message || first.text.replace(/<query\b[\s\S]*?<\/query>/gi, '').trim());
  if (!built.spec) return seeded ? { message: said || seeded.message, doc: seededDoc(), target, usage, warnings } : { message: said, usage, warnings };

  let spec = built.spec;
  if (k.expand) {
    try { spec = await k.expand(spec, ctx); }
    catch (e) { if (e instanceof GatewayError || e instanceof UserError || e.name === 'AbortError') throw e; throw new DocError(`The ${k.noun} could not be finished. No credits were charged. Please try again.`, e.details || [e.message]); }
    const v = k.validate(spec, ctx, { lenient: true });
    if (v.errors.length) throw new DocError(`The ${k.noun} could not be finished. No credits were charged. Please try again.`, v.errors);
    spec = v.spec; warnings.push(...v.warnings);
  }
  status(`Building the ${k.noun}…`);
  if (k.check) { try { spec = (await k.check(spec, ctx)) || spec; } catch (e) { if (e.user) throw new UserError(e.message); throw e; } }

  target ||= createDoc(user, { brandId: cloned?.brand.id, kind: k.id, title: spec.title, conversationId: conv.id, projectId: conv.projectId });
  const base = seeded ? seeded.prev || undefined : cur ? target.current : undefined;
  const action = cur && !built.replaced ? 'edited' : 'created';
  const note = action === 'edited' ? (built.notes.join('; ') || 'Edited') : (cur ? 'Rebuilt from scratch' : 'Created');
  const summary = k.summary(spec);
  const v = addVersion(target, spec, { note, by: 'ai', model: model.id, summary });
  return {
    message: built.message || (action === 'edited' ? `I've updated the ${k.noun}.` : `Here is your ${k.noun}.`),
    doc: { format: wantFormat, id: target.id, v, base, seed: seeded?.v, kind: k.id, title: target.title, action: seeded?.newDoc ? 'created' : action, summary, notes: [...(seeded?.notes || []), ...built.notes].slice(0, 8), warnings: warnings.slice(0, 6) },
    target, usage, warnings,
  };
  }

  async function build(r, mode) {
    const p = parseReply(r.text);
    const out = { message: p.message, spec: null, errors: [], notes: [], cutOff: false, replaced: false };
    let raw = null;
    if (p.document) { raw = k.parseDocument(p.document, { ...ctx, current: cur }); if (!cur && k.withBrand && theme.template) raw = k.withBrand(raw, theme.template); out.replaced = true; }
    else if (p.edits.length && cur) {
      const e = await k.applyEdits(cur, p.edits, ctx);
      raw = e.spec; out.notes = e.notes; out.errors.push(...e.errors);
      if (!e.notes.length && !e.errors.length) out.errors.push('None of the edits changed anything.');
    } else if (p.edits.length && !cur) out.errors.push('There is no document yet. Send a complete <document title="…">…</document>.');
    else if (mode === 'create' && k.fromPlain) { raw = k.fromPlain(r.text); if (raw) { out.message = ''; out.replaced = true; } }
    // A reply that ended on its own but left out the closing </document> is complete; one that hit the length limit is not.
    const cut = r.finish === 'length' || (p.truncated && !(p.openDocument && r.finish === 'stop'));
    if (cut && (raw || p.edits.length || /<document|<edit/i.test(r.text))) { out.cutOff = true; out.errors.push('The reply was cut off before it finished.'); }
    if (!raw) return out;
    const v = k.validate(raw, ctx);
    out.errors.push(...v.errors); warnings.push(...v.warnings);
    if (!out.errors.length) out.spec = v.spec;
    return out;
  }
}

export { DocError, GatewayError };
