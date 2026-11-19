// Thin client for the AICredit gateway. The API key stays on the server.
import { recordCall, recordFailure, failureKind, noteModel } from './monitor.js';
const BASE = () => process.env.AICREDIT_BASE_URL || 'https://aicreditapi.com/api/v1';

export class GatewayError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

// Messages users may see. Whatever the AICredit gateway or a provider says (quota, ids, status codes, HTML
// pages) never reaches people: they get one of a few calm wordings, and the real reason goes to the server log.
// The person's wording (2026-11-17): "This model is busy right now. Please try again shortly or pick another model."
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const NO_CHARGE = ' No credits were charged.';
const WORDS = {
  busy: [
    'This model is busy right now. Please try again shortly or pick another model.',
    'This model is a little busy at the moment. Please try again in a minute, or choose another model.',
    'This model can\'t take your request right now. Please try again shortly or pick a different model.',
  ],
  slow: [
    'This model is taking too long to answer right now. Please try again shortly or pick a faster model.',
    'This model is busy and did not answer in time. Please try again in a minute, or pick another model.',
  ],
  crowded: [
    'This model is getting a lot of requests right now. Please wait a few seconds and try again, or pick another model.',
    'Lots of people are using this model right now. Please try again in a few seconds or pick another model.',
  ],
  blocked: [
    'This model declined the request under its safety rules. Please try different wording or another model.',
  ],
};
export const userWords = (kind = 'busy') => pick(WORDS[kind] || WORDS.busy) + NO_CHARGE;
const SAFETY = /safety|content (policy|filter|moderation)|moderat|sensitive|inappropriate|violat|not permitted content|real person|celebrity|copyright/i;
const looksRaw = (s) => /<\/?(html|head|body|center|h1|title)\b/i.test(s) || s.length > 400;
// For provider text that arrives inside a finished task (video failures).
export function tidyProviderText(raw) {
  const t = String(raw || '').trim();
  if (t) gatewayLog('task said', '', t);
  return t && SAFETY.test(t) ? pick(WORDS.blocked) : pick(WORDS.busy);
}
export const gatewayLog = (where, status, raw) => console.warn(`[gateway] ${where}: ${status || ''} ${String(raw || '').slice(0, 500)}`);

function friendly(status, body) {
  const e = (body && typeof body === 'object' ? body.error || body : {}) || {};
  const raw = String(e.message || (typeof body === 'string' ? body : '') || '');
  const whole = `${raw} ${e.code || ''} ${e.type || ''}`;
  let kind = 'busy';
  if (status === 504 || status === 524 || /time-?out|timed out/i.test(raw)) kind = 'slow';
  else if (status === 429 || /rate.?limit|too many requests/i.test(raw)) kind = 'crowded';
  else if (status >= 400 && status < 500 && SAFETY.test(whole) && !/quota|balance|billing/i.test(whole)) kind = 'blocked';
  // 401 means the app's own key is wrong: people see "busy", the owner sees the cause in the server log.
  gatewayLog(status === 401 ? 'API key refused (check AICREDIT_API_KEY in .env)' : 'provider said', status, raw || JSON.stringify(body || '').slice(0, 300));
  const err = new GatewayError(userWords(kind), status, e.code);
  err.raw = raw; // the original text, for code that reacts to it (size rules, edit routes)
  return err;
}
// Network failures (connection reset, DNS, provider hanging up) get the same treatment.
export function friendlyNetwork(err) {
  if (err instanceof GatewayError || err?.name === 'AbortError') return err;
  console.warn('Gateway network error:', err?.cause?.code || err?.code || '', err?.message);
  return new GatewayError(userWords('busy'), 502, 'network');
}
const RETRY_STATUS = new Set([429, 500, 502, 503, 504, 520, 522, 524]);
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
});

// Longest wait for the gateway to start answering. Its own proxy normally gives up after about 60 seconds,
// so anything past this is a connection that will never answer (it used to hang for up to 10 minutes).
const HEADER_WAIT_MS = () => Number(process.env.GATEWAY_WAIT_MS) || 150000;
// Models the gateway said this account may not call ("Token is not allowed to call this model", seen 2026-11-19 for
// Seedream 5.0, GPT Image 2.5 and GPT Image 2 Edits). The catalog hides them for a while so people never pick a dead model.
export const refusedModels = new Map(); // model id -> when it was refused
const REFUSED = /not allowed to call this model|model_not_allowed|does not have permission to access model/i;
export async function call(pathname, { method = 'POST', json, form, signal, waitMs = HEADER_WAIT_MS() } = {}) {
  const key = process.env.AICREDIT_API_KEY;
  if (!key) throw new GatewayError('AICREDIT_API_KEY is not set on the server. Add it to .env and restart.', 500, 'no_key');
  const headers = { Authorization: `Bearer ${key}` };
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  // Retry brief provider hiccups (timeouts, 5xx, rate limits) before anything is streamed or charged.
  const tries = method === 'GET' ? 3 : 2;
  const t0 = Date.now(); const model = json?.model || null; noteModel(model);
  // Admin log (server/monitor.js): every call with its latency, every failure with the real reason.
  const logFail = (status, raw, kind) => {
    recordCall({ path: pathname, model, status: typeof status === 'number' ? status : 0, ms: Date.now() - t0, ok: false });
    recordFailure({ kind: kind || failureKind(status, raw), model, path: `${method} ${pathname}`, status: typeof status === 'number' ? status : null, code: typeof status === 'string' ? status : null, reason: raw, ms: Date.now() - t0 });
  };
  for (let attempt = 1; ; attempt++) {
    let res;
    const wait = new AbortController();
    const timer = setTimeout(() => wait.abort(), waitMs);
    try { res = await fetch(BASE() + pathname, { method, headers, body, signal: signal ? AbortSignal.any([signal, wait.signal]) : wait.signal }); }
    catch (err) {
      clearTimeout(timer);
      // No answer in time. A POST may still be running at the provider, so it is not sent again.
      if (wait.signal.aborted && !signal?.aborted) { logFail(504, `No answer after ${Math.round(waitMs / 1000)} s`, 'model'); gatewayLog(`${method} ${pathname} no answer after ${Math.round(waitMs / 1000)}s`, 504, ''); throw new GatewayError(userWords('slow'), 504, 'timeout'); }
      if (err?.name === 'AbortError' || attempt >= tries) { if (err?.name !== 'AbortError') logFail('network', `${err?.cause?.code || err?.code || ''} ${err?.message || 'network error'}`.trim(), 'gateway'); throw friendlyNetwork(err); }
      await sleep(1500 * attempt, signal); continue;
    }
    clearTimeout(timer);
    if (res.ok) { recordCall({ path: pathname, model, status: res.status, ms: Date.now() - t0, ok: true }); return res; }
    const text = await res.text().catch(() => '');
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.warn(`Gateway ${method} ${pathname} -> ${res.status}${attempt < tries && RETRY_STATUS.has(res.status) && !(method !== 'GET' && (res.status === 504 || res.status === 524)) ? ', retrying' : ''}`);
    // A POST that timed out at the provider may still be running (and billed) there, so it is not sent again.
    const timedOut = method !== 'GET' && (res.status === 504 || res.status === 524);
    if (attempt < tries && RETRY_STATUS.has(res.status) && !timedOut && !signal?.aborted) { await sleep(res.status === 429 ? 3000 : 1500 * attempt, signal); continue; }
    logFail(res.status, typeof parsed === 'string' ? parsed : parsed?.error?.message || JSON.stringify(parsed).slice(0, 600));
    const refusedId = model || (form && typeof form.get === 'function' ? form.get('model') : null);
    if (refusedId && REFUSED.test(`${parsed?.error?.message || ''} ${parsed?.error?.code || ''}`)) refusedModels.set(String(refusedId), Date.now());
    throw friendly(res.status, parsed);
  }
}

export async function callJson(pathname, opts) {
  const res = await call(pathname, opts);
  const j = await res.json();
  if (j?.error) { recordFailure({ kind: 'response', path: pathname, status: res.status, reason: j.error.message || JSON.stringify(j.error) }); throw friendly(res.status, j); }
  return j;
}

// Async iterator over parsed SSE JSON events from an OpenAI-style stream.
export async function* sse(res) {
  const decoder = new TextDecoder();
  let buf = '';
  const it = res.body[Symbol.asyncIterator]();
  for (;;) {
    let step;
    try { step = await it.next(); } catch (err) { if (err?.name !== 'AbortError') recordFailure({ kind: 'response', path: 'stream', reason: `Stream broke: ${err?.cause?.code || err?.code || ''} ${err?.message || ''}` }); throw friendlyNetwork(err); }
    if (step.done) break;
    const chunk = step.value;
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data);
        if (j.error) { recordFailure({ kind: 'response', path: 'stream', reason: j.error.message || JSON.stringify(j.error) }); throw friendly(500, j); }
        yield j;
      } catch (e) {
        if (e instanceof GatewayError) throw e;
      }
    }
  }
}

// One complete (non-streamed) chat reply. The gateway buffers streams and cuts every request at about
// 60 seconds, so document building uses several short calls instead of one long one.
export async function complete(model, messages, { maxTokens = 6000, signal, timeoutMs = 57000 } = {}) {
  const limit = AbortSignal.timeout(timeoutMs);
  const both = signal ? AbortSignal.any([signal, limit]) : limit;
  let j;
  try {
    j = await callJson('/chat/completions', { json: { model: model.id, messages, max_tokens: maxTokens }, signal: both });
  } catch (e) {
    if (limit.aborted && !signal?.aborted) { recordFailure({ kind: 'model', model: model.id, path: '/chat/completions', status: 504, reason: `No complete answer within ${Math.round(timeoutMs / 1000)} s` }); throw new GatewayError(userWords('slow'), 504, 'timeout'); }
    throw e;
  }
  const choice = j.choices?.[0];
  return { text: String(choice?.message?.content || ''), finish: choice?.finish_reason, usage: j.usage || null };
}
