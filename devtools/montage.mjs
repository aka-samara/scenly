// Contact sheet: node devtools/montage.mjs <dir> <out.png> <filter-substring> [cols]
import fs from 'node:fs'; import path from 'node:path'; import puppeteer from 'puppeteer';
const [dir, out, filt = '', cols = 5] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png') && f.includes(filt)).sort();
const html = `<body style="margin:0;background:#888;font:12px sans-serif"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${files.map((f) => `<div><div>${f}</div><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}"></div>`).join('')}</div></body>`;
const b = await puppeteer.launch({ headless: true }); const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close(); console.log(files.length, 'images');
