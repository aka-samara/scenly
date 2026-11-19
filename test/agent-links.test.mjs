// Video links given to the Video Agent: only public https addresses are ever fetched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-link-'));
delete process.env.ALLOW_LOCAL_LINKS;
const { fetchVideoLink } = await import('../server/builder/assist.js');

test('a video link must be public https: no plain http, no addresses inside this computer or network', async () => {
  for (const [link, words] of [['not a link', /not a web address/], ['http://example.com/a.mp4', /must start with https/], ['file:///etc/passwd', /must start with https/], ['https://127.0.0.1/a.mp4', /cannot be reached/], ['https://localhost/a.mp4', /cannot be reached/], ['https://192.168.1.10/a.mp4', /cannot be reached/], ['https://10.0.0.5/a.mp4', /cannot be reached/], ['https://169.254.169.254/latest', /cannot be reached/], ['https://[::1]/a.mp4', /cannot be reached/]]) {
    await assert.rejects(() => fetchVideoLink(link), (e) => { assert.match(e.message, words, link); return true; });
  }
});
