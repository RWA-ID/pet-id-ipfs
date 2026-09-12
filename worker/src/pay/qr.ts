/**
 * The collar QR, as a PNG, rendered on request.
 *
 * The QR on the site is drawn in the browser by qrcodejs — a mail client can't
 * run that, and no hosted copy of it exists. Rather than pin one per order,
 * this renders it from the order's own name: deterministic, nothing to store,
 * and it can never drift from the name it points at.
 *
 * The PNG is written by hand: 1-bit greyscale with stored (uncompressed)
 * deflate blocks. A 33-module code at scale 8 lands around 14 kB, which is
 * cheaper than pulling an image library into the worker bundle.
 */
import { encode } from "uqr";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1, s = 0;
  for (const b of bytes) {
    a = (a + b) % 65521;
    s = (s + a) % 65521;
  }
  return ((s << 16) | a) >>> 0;
}

const be32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** length + type + data + crc(type+data) */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat([new TextEncoder().encode(type), data]);
  return concat([be32(data.length), body, be32(crc32(body))]);
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * @param scale pixels per QR module
 * @param quiet quiet-zone width in modules — four is the spec's minimum, and
 *        without it a scanner can't find the code against a coloured background.
 */
export function qrPng(text: string, scale = 8, quiet = 4): Uint8Array {
  const { size, data } = encode(text, { ecc: "M", border: 0 });
  const px = (size + quiet * 2) * scale;
  const rowBytes = Math.ceil(px / 8);

  // Each row is a filter byte (0 = none) followed by packed 1-bit pixels,
  // where a set bit is white. Zero-filled, so we only set the light pixels.
  const raw = new Uint8Array((rowBytes + 1) * px);
  for (let y = 0; y < px; y++) {
    const row = y * (rowBytes + 1);
    const my = Math.floor(y / scale) - quiet;
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const dark = my >= 0 && my < size && mx >= 0 && mx < size && data[my][mx];
      if (!dark) raw[row + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }

  // zlib: 0x78 0x01, then stored deflate blocks (65535 bytes max each), then adler32.
  const zlib: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let off = 0; off < raw.length; off += 65535) {
    const len = Math.min(65535, raw.length - off);
    const last = off + len >= raw.length ? 1 : 0;
    zlib.push(new Uint8Array([last, len & 255, (len >> 8) & 255, ~len & 255, (~len >> 8) & 255]));
    zlib.push(raw.subarray(off, off + len));
  }
  zlib.push(be32(adler32(raw)));

  // bit depth 1, colour type 0 (greyscale), no interlacing
  const ihdr = concat([be32(px), be32(px), new Uint8Array([1, 0, 0, 0, 0])]);
  return concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", concat(zlib)),
    chunk("IEND", new Uint8Array()),
  ]);
}
