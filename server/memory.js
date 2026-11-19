// Memory: a few short facts about the person (name, where they live, simple preferences) that every chat
// can use to personalise answers. The person sees and edits them under Memory in the user menu.
// Facts are also picked up from what the person writes in chats, by a small, fast model in the background.
import { save, id, now } from './db.js';
import { findModel } from './catalog.js';
import { complete } from './gateway.js';
import { parseJsonLoose } from './builder/audioplan.js';

export const MEM_MAX_FACTS = 30;
export const MEM_MAX_LEN = 160;
const NAME_MAX = 60;
const PLACE_MAX = 80;

const clean = (s, max) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

export function memoryOf(user) {
  if (!user.memory) user.memory = { on: true, learn: true, name: '', location: '', facts: [] };
  const m = user.memory;
  m.facts ||= [];
  return m;
}

export function memoryView(user) {
  const m = memoryOf(user);
  return {
    on: m.on !== false, learn: m.learn !== false,
    name: m.name || '', location: m.location || '',
    facts: m.facts.map((f) => ({ id: f.id, text: f.text, source: f.source || 'you', updatedAt: f.updatedAt || f.createdAt })),
    limits: { facts: MEM_MAX_FACTS, length: MEM_MAX_LEN },
    accountName: user.name || '',
  };
}

// The lines added to the chat system prompt. Empty when memory is off or holds nothing.
export function memoryPrompt(user) {
  const m = user.memory;
  if (!m || m.on === false) return '';
  const lines = [];
  if (m.name) lines.push(`- Name: ${m.name}`);
  if (m.location) lines.push(`- Location: ${m.location}`);
  for (const f of m.facts || []) lines.push(`- ${f.text}`);
  if (!lines.length) return '';
  return `What you know about the user, from the memory they keep in their account:
${lines.join('\n')}
Use this quietly to personalise answers when it is relevant: their name in a greeting, their city or country for weather, local time, prices, currency, units, spelling and nearby places, and their preferences for how answers are written. Do not list these facts back or mention the memory unless the user asks about it. If the user says something different in this chat, follow what they say now.`;
}

// ---------- editing ----------
function addFact(m, text, source) {
  const t = clean(text, MEM_MAX_LEN);
  if (!t) return null;
  const same = m.facts.find((f) => f.text.toLowerCase() === t.toLowerCase());
  if (same) return null;
  if (m.facts.length >= MEM_MAX_FACTS) {
    // Full: the oldest fact picked up from a chat makes room. Facts the person typed are never pushed out.
    const i = m.facts.findIndex((f) => f.source === 'chat');
    if (i < 0) return null;
    m.facts.splice(i, 1);
  }
  const f = { id: id('mem_'), text: t, source, createdAt: now(), updatedAt: now() };
  m.facts.push(f);
  return f;
}

export function mountMemory(app, { requireUser, wrap }) {
  app.get('/api/memory', requireUser, (req, res) => res.json({ memory: memoryView(req.user) }));

  // Settings and the two fixed fields. Only the keys sent are changed.
  app.put('/api/memory', requireUser, (req, res) => {
    const m = memoryOf(req.user);
    const b = req.body || {};
    if ('on' in b) m.on = !!b.on;
    if ('learn' in b) m.learn = !!b.learn;
    if ('name' in b) m.name = clean(b.name, NAME_MAX);
    if ('location' in b) m.location = clean(b.location, PLACE_MAX);
    m.updatedAt = now();
    save();
    res.json({ memory: memoryView(req.user) });
  });

  app.post('/api/memory/facts', requireUser, (req, res) => {
    const m = memoryOf(req.user);
    const t = clean(req.body?.text, MEM_MAX_LEN);
    if (!t) return res.status(400).json({ error: 'Type something to remember first.' });
    if (m.facts.some((f) => f.text.toLowerCase() === t.toLowerCase())) return res.status(400).json({ error: 'That is already in your memory.' });
    if (m.facts.length >= MEM_MAX_FACTS) return res.status(400).json({ error: `Memory holds up to ${MEM_MAX_FACTS} facts. Delete one to add another.` });
    addFact(m, t, 'you');
    save();
    res.json({ memory: memoryView(req.user) });
  });

  app.patch('/api/memory/facts/:id', requireUser, (req, res) => {
    const m = memoryOf(req.user);
    const f = m.facts.find((x) => x.id === req.params.id);
    if (!f) return res.status(404).json({ error: 'That fact is no longer in your memory.' });
    const t = clean(req.body?.text, MEM_MAX_LEN);
    if (!t) return res.status(400).json({ error: 'A fact cannot be empty. Delete it instead.' });
    f.text = t; f.source = 'you'; f.updatedAt = now();
    save();
    res.json({ memory: memoryView(req.user) });
  });

  app.delete('/api/memory/facts/:id', requireUser, (req, res) => {
    const m = memoryOf(req.user);
    m.facts = m.facts.filter((x) => x.id !== req.params.id);
    save();
    res.json({ memory: memoryView(req.user) });
  });

  // Forget everything, keeping the two switches as they are.
  app.delete('/api/memory', requireUser, (req, res) => {
    const m = memoryOf(req.user);
    m.name = ''; m.location = ''; m.facts = [];
    m.updatedAt = now();
    save();
    res.json({ memory: memoryView(req.user) });
  });
}

// ---------- learning from chats ----------
// Only messages that sound like the person talking about themselves are read, so most turns cost nothing.
const PERSONAL = /\b(i am|i'm|im|i was born|my|mine|i live|i work|i study|i prefer|i like|i love|i hate|i don'?t (like|want|eat)|i speak|i use|i have|i've got|call me|remember|forget|from now on|always|never)\b/i;
export const looksPersonal = (text) => PERSONAL.test(String(text || ''));

const LEARN_SYSTEM = `You maintain a short memory of basic facts about a user of a chat app, so future answers can be personalised.
You get the current memory and one new message the user wrote. Decide if the message states a lasting, basic fact about the user themselves, or asks to remember or forget something.

Keep only:
- their name or what they like to be called
- where they live (city, region or country)
- their job, business or field of study
- languages they speak, units or currency they use
- stable preferences for how answers should be written (for example "prefers short answers", "uses British spelling")
- a few lasting personal basics they share on purpose (for example "has two kids", "is vegetarian")
- anything they explicitly ask you to remember

Never keep: one-off tasks or questions, facts about the topic they are asking about, things said about other people, hypotheticals, role-play, quotes, text inside pasted documents or code, passwords, card or account numbers, addresses with street numbers, phone numbers, emails, or sensitive details (health, religion, politics, sexuality, ethnicity, money troubles) unless the user explicitly asks you to remember that exact thing.

Write each fact in the third person, short (under 15 words), with no name prefix: "Works as a nurse", "Prefers metric units".
If a new fact replaces an old one (moved city, new job), update the old fact instead of adding a second one.
If the user asks to forget something, remove the matching fact (or clear name/location).

Reply with JSON only, no other text, in this shape:
{"name": string|null, "location": string|null, "add": [string], "update": [{"id": string, "text": string}], "remove": [string]}
Use null for name and location when they do not change, and "" to clear them. Use empty lists when nothing changes. Most messages change nothing: then reply {"name":null,"location":null,"add":[],"update":[],"remove":[]}.`;

async function learnModel() {
  for (const p of [process.env.MEMORY_MODEL, 'deepseek-v4-flash', 'qwen3.8-flash', 'glm-5.3-flash', 'gemini-3.1-flash-lite', 'gpt-5.6-luna'].filter(Boolean)) {
    const m = await findModel(p);
    if (m?.type === 'chat') return m;
  }
  return null;
}

function parseJson(text) {
  try { const j = parseJsonLoose(text); return j && !Array.isArray(j) ? j : null; } catch { return null; }
}

// Reads one message and applies what it finds. Returns the changes, for the "Memory updated" note,
// or null when nothing changed. Never throws: memory must not get in the way of a chat.
// The helper call is tiny and is not charged to the person.
export async function learnFromMessage(user, text) {
  try {
    const m0 = user.memory;
    if (m0 && (m0.on === false || m0.learn === false)) return null;
    const msg = String(text || '').trim();
    if (!msg || !looksPersonal(msg)) return null;
    const model = await learnModel();
    if (!model) return null;
    const m = memoryOf(user);
    const current = { name: m.name || '', location: m.location || '', facts: m.facts.map((f) => ({ id: f.id, text: f.text })) };
    const r = await complete(model, [
      { role: 'system', content: LEARN_SYSTEM },
      { role: 'user', content: `Current memory:\n${JSON.stringify(current)}\n\nNew message from the user:\n"""${msg.slice(0, 1500)}"""` },
    ], { maxTokens: 400, timeoutMs: 20000 });
    const j = parseJson(r.text);
    if (!j || typeof j !== 'object') return null;
    return applyLearned(user, j);
  } catch (e) {
    console.warn('[memory] could not read the message:', e.message);
    return null;
  }
}

export function applyLearned(user, j) {
  const m = memoryOf(user);
  if (m.on === false || m.learn === false) return null; // switched off while the helper was reading
  const changes = [];
  if (typeof j.name === 'string' && clean(j.name, NAME_MAX) !== (m.name || '')) {
    m.name = clean(j.name, NAME_MAX);
    changes.push(m.name ? { kind: 'saved', text: `Name: ${m.name}` } : { kind: 'forgot', text: 'Name' });
  }
  if (typeof j.location === 'string' && clean(j.location, PLACE_MAX) !== (m.location || '')) {
    m.location = clean(j.location, PLACE_MAX);
    changes.push(m.location ? { kind: 'saved', text: `Location: ${m.location}` } : { kind: 'forgot', text: 'Location' });
  }
  for (const rid of Array.isArray(j.remove) ? j.remove.slice(0, 10) : []) {
    const f = m.facts.find((x) => x.id === rid);
    if (f) { m.facts = m.facts.filter((x) => x !== f); changes.push({ kind: 'forgot', text: f.text }); }
  }
  for (const u of Array.isArray(j.update) ? j.update.slice(0, 10) : []) {
    const f = m.facts.find((x) => x.id === u?.id);
    const t = clean(u?.text, MEM_MAX_LEN);
    if (f && t && t !== f.text) { f.text = t; f.source = 'chat'; f.updatedAt = now(); changes.push({ kind: 'saved', text: t }); }
  }
  for (const a of Array.isArray(j.add) ? j.add.slice(0, 5) : []) {
    const f = typeof a === 'string' && addFact(m, a, 'chat');
    if (f) changes.push({ kind: 'saved', text: f.text });
  }
  if (!changes.length) return null;
  m.updatedAt = now();
  save();
  return changes;
}
