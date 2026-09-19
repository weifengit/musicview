/**
 * 生成应用图标源图（1024×1024 PNG）：深色圆角底 + 7 音级族色柱（呼应图表配色）。
 * 之后用 `npx tauri icon scripts/icon-src.png` 生成全套尺寸。
 *
 * 运行：npx tsx scripts/make-icon.ts
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const S = 1024;

// ---- CRC32（PNG 块校验）----
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

// ---- 颜色（与图表 FAMILY/HUES 一致）----
function hsl(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const HUES = [0, 28, 55, 120, 185, 222, 268];
const BG: [number, number, number] = [24, 24, 32];
const CORNER = 200; // 圆角半径

// 7 根柱：宽窄间距 + 不同高度（像一个图表）
const BAR_W = 92;
const GAP = 34;
const BAR_RADIUS = 24;
const HEIGHTS = [0.5, 0.7, 0.42, 0.86, 0.6, 0.36, 0.66];
const MAX_H = 560;
const BASE_Y = 700; // 柱子底边
const totalW = 7 * BAR_W + 6 * GAP;
const X0 = Math.round((S - totalW) / 2);

const px = new Uint8Array(S * S * 4);

function inRoundedRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r - 1));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r - 1));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    if (!inRoundedRect(x, y, 0, 0, S, S, CORNER)) continue; // 圆角外保持透明
    px[i] = BG[0];
    px[i + 1] = BG[1];
    px[i + 2] = BG[2];
    px[i + 3] = 255;
    for (let b = 0; b < 7; b++) {
      const bx0 = X0 + b * (BAR_W + GAP);
      const h = Math.round(HEIGHTS[b] * MAX_H);
      const by0 = BASE_Y - h;
      if (inRoundedRect(x, y, bx0, by0, bx0 + BAR_W, BASE_Y, BAR_RADIUS)) {
        const t = HEIGHTS[b]; // 高=响：更深的颜色
        const [r, g, bb] = hsl(HUES[b], 62, 74 - 30 * t);
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = bb;
        break;
      }
    }
  }
}

// ---- 编码 PNG ----
const raw = Buffer.alloc(S * (1 + S * 4));
for (let y = 0; y < S; y++) {
  const rowStart = y * (1 + S * 4);
  raw[rowStart] = 0; // filter: none
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, rowStart + 1);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = new URL('./icon-src.png', import.meta.url).pathname;
writeFileSync(out, png);
console.log(`图标源图已生成: ${out} (${(png.length / 1024).toFixed(0)} KB)`);
