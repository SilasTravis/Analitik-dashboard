// Generates a 1024x1024 rounded-square indigo PNG with a white "A" placeholder.
// Used only to seed `tauri icon` so the build can find required icons.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 1024;
const BG = [99, 102, 241]; // indigo
const FG = [255, 255, 255]; // white
const RADIUS = 180;

function pixel(x, y) {
  // rounded square mask
  const cx = x < RADIUS ? RADIUS : x > SIZE - RADIUS ? SIZE - RADIUS : x;
  const cy = y < RADIUS ? RADIUS : y > SIZE - RADIUS ? SIZE - RADIUS : y;
  const d = Math.hypot(x - cx, y - cy);
  if (d > RADIUS) return [0, 0, 0, 0];

  // letter "A" rectangle bounds
  const left = SIZE * 0.32;
  const right = SIZE * 0.68;
  const top = SIZE * 0.28;
  const bottom = SIZE * 0.72;
  const cxA = SIZE / 2;
  if (x >= left && x <= right && y >= top && y <= bottom) {
    const t = (y - top) / (bottom - top); // 0 top → 1 bottom
    const halfW = (t * (right - left)) / 2;
    const inLeg = Math.abs(x - cxA) > halfW - SIZE * 0.04 && Math.abs(x - cxA) < halfW;
    const inBar = y > top + (bottom - top) * 0.6 && y < top + (bottom - top) * 0.68 && Math.abs(x - cxA) < halfW;
    if (inLeg || inBar) return [...FG, 255];
  }
  return [...BG, 255];
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixel(x, y);
    const off = y * (SIZE * 4 + 1) + 1 + x * 4;
    raw[off] = r;
    raw[off + 1] = g;
    raw[off + 2] = b;
    raw[off + 3] = a;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcSrc = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeInt32BE(crc32(crcSrc), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (table[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) | 0;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const idat = deflateSync(raw);
const iend = Buffer.alloc(0);

const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", iend)]);

mkdirSync("src-tauri/icons", { recursive: true });
writeFileSync("src-tauri/icons/source.png", png);
console.log("wrote src-tauri/icons/source.png", png.length, "bytes");
