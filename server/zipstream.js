// A ZIP written straight to the response, one file after another, so a big "Download selected"
// never has to fit in memory. Files are stored as they are (videos and pictures do not shrink anyway).
import fs from 'node:fs';
import zlib from 'node:zlib';

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crcStep = zlib.crc32 ? (buf, crc) => zlib.crc32(buf, crc) : (buf, crc) => { let c = ~crc >>> 0; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
const dosTime = (d) => ({ time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() });
export const ZIP_MAX_BYTES = 0xfff00000; // just under 4 GB (this simple writer has no ZIP64)
export const ZIP_MAX_FILES = 2000;

// entries: [{ name, path }]. Names must be unique. Resolves with the number of bytes written.
export async function streamZip(out, entries, { signal } = {}) {
  const central = []; let offset = 0;
  const write = (buf) => new Promise((resolve, reject) => { if (signal?.aborted || out.destroyed) return reject(new Error('aborted')); offset += buf.length; if (out.write(buf)) resolve(); else { const onClose = () => reject(new Error('aborted')); out.once('drain', () => { out.off('close', onClose); resolve(); }); out.once('close', onClose); } });
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'); const st = fs.statSync(e.path); const { time, date } = dosTime(st.mtime); const start = offset;
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0808, 6); head.writeUInt16LE(0, 8); head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt16LE(name.length, 26);
    await write(Buffer.concat([head, name]));
    let crc = 0, size = 0;
    for await (const chunk of fs.createReadStream(e.path, { highWaterMark: 1 << 20 })) { crc = crcStep(chunk, crc); size += chunk.length; await write(chunk); }
    const dd = Buffer.alloc(16); dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(crc >>> 0, 4); dd.writeUInt32LE(size, 8); dd.writeUInt32LE(size, 12);
    await write(dd);
    central.push({ name, crc: crc >>> 0, size, time, date, start });
  }
  const cdStart = offset;
  for (const c of central) {
    const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0808, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14);
    h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.size, 20); h.writeUInt32LE(c.size, 24); h.writeUInt16LE(c.name.length, 28); h.writeUInt32LE(c.start, 42);
    await write(Buffer.concat([h, c.name]));
  }
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10); end.writeUInt32LE(offset - cdStart, 12); end.writeUInt32LE(cdStart, 16);
  await write(end);
  return offset;
}
// Exact size of the ZIP before it is written, so the browser can show real progress.
export const zipSize = (entries) => entries.reduce((n, e) => n + 30 + 16 + 46 + 2 * Buffer.byteLength(e.name, 'utf8') + e.size, 22);
