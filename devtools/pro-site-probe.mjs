// Probe for the Ad Studio website reader: node devtools/pro-site-probe.mjs <address>
import { browseSite } from '../server/pro-site.js';
const t = Date.now(); const s = await browseSite(process.argv[2]);
console.log(JSON.stringify({ secs: Math.round((Date.now() - t) / 1000), url: s.url, title: s.title, colors: s.colors, fonts: s.fonts, pages: s.pages.map((p) => `${p.kind} ${p.url} text:${p.text.length}`), logos: s.logos.map((l) => `${l.w}x${l.h} ${l.url.slice(0, 90)}`), svgLogo: s.svgLogo.length, icon: s.icon, og: s.ogImage.slice(0, 80), pictures: s.pictures.map((p) => `${p.role} ${p.w}x${p.h} [${p.alt.slice(0, 40)}] ${p.from}`) }, null, 1));
