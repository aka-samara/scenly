// Stand-in gateway for devtools/t-memory.mjs: streams chat answers (saying the remembered location) and answers the memory helper with simple rules.
import http from 'node:http'; import fs from 'node:fs';
const models = fs.readFileSync(new URL('../server/models-snapshot.json', import.meta.url));
const LOG = process.env.MOCK_LOG || 'mock-memory.log';
const port = Number(process.env.MOCK_PORT || 3199);
const log = (o) => fs.appendFileSync(LOG, JSON.stringify(o) + '\n');
http.createServer((req, res) => {
  const bufs = []; req.on('data', (d) => bufs.push(d)).on('end', () => {
    const url = req.url.replace(/^\/api\/v1/, '');
    if (url.startsWith('/models')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(models); }
    if (url === '/chat/completions') {
      const j = JSON.parse(Buffer.concat(bufs).toString() || '{}');
      const sys = j.messages.find((m) => m.role === 'system')?.content || '';
      const last = String(j.messages.at(-1).content);
      if (/You maintain a short memory/.test(sys)) {
        const msg = (last.match(/"""([\s\S]*)"""/) || [])[1] || '';
        const cur = JSON.parse(last.match(/Current memory:\n(.*)\n/)[1]);
        const out = { name: null, location: null, add: [], update: [], remove: [] };
        let m;
        if ((m = msg.match(/my name is (\w+)/i))) out.name = m[1];
        if ((m = msg.match(/i live in ([\w ,]+?)(\.|$| and)/i))) out.location = m[1];
        if (/short answers/i.test(msg) && !/forget/i.test(msg)) out.add.push('Prefers short answers');
        if (/forget.*short/i.test(msg)) out.remove = cur.facts.filter((f) => /short/i.test(f.text)).map((f) => f.id);
        log({ kind: 'learn', msg, out });
        return setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: '```json\n' + JSON.stringify(out) + '\n```' } }], usage: { prompt_tokens: 300, completion_tokens: 30, charge_amount: 0.0001 } })); }, 300);
      }
      log({ kind: 'chat', model: j.model, memory: (sys.match(/What you know about the user[\s\S]*?\nUse this quietly/) || [''])[0] });
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const text = 'Mock answer. ' + (/Location: (.*)/.exec(sys)?.[1] ? `Weather for ${/Location: (.*)/.exec(sys)[1]} looks fine.` : 'No location known.');
      setTimeout(() => { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`); res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, charge_amount: 0.0002 } })}\n\ndata: [DONE]\n\n`); res.end(); }, 800);
      return;
    }
    res.writeHead(404); res.end('{}');
  });
}).listen(port, () => console.log('mock on', port));
