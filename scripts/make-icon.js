// Genera build/icon.ico (256x256) sin dependencias externas.
// Uso: node scripts/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

function mix(a, b, t) { return Math.round(a + (b - a) * t); }

function inRoundedRect(x, y, rx0, ry0, rx1, ry1, r) {
  if (x < rx0 || x > rx1 || y < ry0 || y > ry1) return false;
  const cx = x < rx0 + r ? rx0 + r : (x > rx1 - r ? rx1 - r : x);
  const cy = y < ry0 + r ? ry0 + r : (y > ry1 - r ? ry1 - r : y);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= rx0 + r && x <= rx1 - r) || (y >= ry0 + r && y <= ry1 - r);
}

function buildRGBA() {
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  const BG = [99, 102, 241];
  const BG2 = [139, 92, 246];
  for (let y = 0; y < SIZE; y++) {
    const rowStart = y * (SIZE * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < SIZE; x++) {
      const i = rowStart + 1 + x * 4;
      let r = 0, g = 0, b = 0, a = 0;
      if (inRoundedRect(x, y, 8, 8, SIZE - 9, SIZE - 9, 48)) {
        const t = y / SIZE;
        r = mix(BG[0], BG2[0], t);
        g = mix(BG[1], BG2[1], t);
        b = mix(BG[2], BG2[2], t);
        a = 255;
        // manija de la bolsa (anillo superior)
        const dx = x - 128, dy = y - 118;
        const d2 = dx * dx + dy * dy;
        if (y < 128 && d2 <= 40 * 40 && d2 >= 25 * 25) { r = g = b = 255; }
        // cuerpo de la bolsa
        if (inRoundedRect(x, y, 66, 122, 190, 214, 16)) { r = g = b = 255; }
        // guiño interior de la manija (recorte de color)
        if (y >= 122 && y <= 214 && x >= 66 && x <= 190 && false) {}
      }
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  return raw;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rgba, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function ico(pngBuf) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(1, 4);
  const ent = Buffer.alloc(16);
  ent[0] = 0; ent[1] = 0; ent[2] = 0; ent[3] = 0;
  ent.writeUInt16LE(1, 4);
  ent.writeUInt16LE(32, 6);
  ent.writeUInt32LE(pngBuf.length, 8);
  ent.writeUInt32LE(22, 12);
  return Buffer.concat([dir, ent, pngBuf]);
}

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });
const pngBuf = png(buildRGBA());
fs.writeFileSync(path.join(out, 'icon.png'), pngBuf);
fs.writeFileSync(path.join(out, 'icon.ico'), ico(pngBuf));
console.log('Iconos generados: build/icon.png, build/icon.ico');
