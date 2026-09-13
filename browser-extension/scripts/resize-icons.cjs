/**
 * Regenerates the extension icons from a single square PNG source.
 *
 * Hand-rolled rather than pulling in sharp/jimp: this directory ships with
 * zero dependencies on purpose, and icons change about once a rebrand.
 * Decodes an 8-bit non-interlaced PNG, box-downscales it in premultiplied
 * alpha (so the mark's edges don't halo), and re-encodes as RGBA.
 *
 * Usage: node scripts/resize-icons.cjs <source.png> <out-dir>
 *
 * CommonJS (.cjs) because package.json sets "type": "module" for the
 * extension sources themselves.
 */
const fs = require('fs'), zlib = require('zlib');

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function decode(file) {
  const buf = fs.readFileSync(file);
  let off = 8, ihdr = null, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (ihdr.depth !== 8 || ihdr.interlace !== 0) throw new Error('unsupported PNG: ' + JSON.stringify(ihdr));
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.color];
  if (!ch) throw new Error('unsupported color type ' + ihdr.color);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { w, h } = ihdr, stride = w * ch, out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev ? prev[x] : 0, c = prev && x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pp = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pp ? a : pb <= pp ? b : c; }
      cur[x] = v & 0xff;
    }
  }
  // normalize to RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * ch, d = i * 4;
    if (ch === 4) { rgba[d] = out[s]; rgba[d+1] = out[s+1]; rgba[d+2] = out[s+2]; rgba[d+3] = out[s+3]; }
    else if (ch === 3) { rgba[d] = out[s]; rgba[d+1] = out[s+1]; rgba[d+2] = out[s+2]; rgba[d+3] = 255; }
    else if (ch === 2) { rgba[d] = rgba[d+1] = rgba[d+2] = out[s]; rgba[d+3] = out[s+1]; }
    else { rgba[d] = rgba[d+1] = rgba[d+2] = out[s]; rgba[d+3] = 255; }
  }
  return { w, h, rgba };
}
// Box filter downscale with premultiplied alpha (avoids halos on the edges).
function resize(img, nw, nh) {
  const { w, h, rgba } = img, out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const s = (sy * w + sx) * 4, al = rgba[s + 3] / 255;
        r += rgba[s] * al; g += rgba[s + 1] * al; b += rgba[s + 2] * al; a += rgba[s + 3]; n++;
      }
      const d = (y * nw + x) * 4, am = a / n;
      const un = a > 0 ? 255 / a : 0;
      out[d] = Math.round(Math.min(255, r * un)); out[d+1] = Math.round(Math.min(255, g * un));
      out[d+2] = Math.round(Math.min(255, b * un)); out[d+3] = Math.round(am);
    }
  }
  return { w: nw, h: nh, rgba: out };
}
function encode(img, file) {
  const { w, h, rgba } = img, raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}
const [src, outDir] = process.argv.slice(2);
const img = decode(src);
console.log('source', img.w + 'x' + img.h);
for (const size of [16, 32, 48, 128]) {
  encode(resize(img, size, size), `${outDir}/icon${size}.png`);
  console.log('wrote icon' + size + '.png');
}
