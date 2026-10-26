// 한글 파일 속 그림 → 웹에서 가벼운 PNG·JPEG(둘 중 작은 쪽). 초기 변환(parse_cards.py — 파이썬 원본은 2026-09-28에 지워 git 이력에만, macOS sips로 PNG와
// JPEG(품질 85)를 만들어 작은 쪽을 씀)과 같은 규칙을 서버에서 순수 JS로 합니다(Vercel에는 sips·sharp가 없음). 입출력 없는 순수 함수.
//  · 한글이 카드에 넣는 그림은 무압축 BMP(24·32비트)라 장당 0.4~2.7MB — 그대로 두면 카드 화면·한글 내려받기가 무거워짐
//  · BMP(팔레트 1·4·8비트, 16·24·32비트, 비트필드) → RGBA → PNG(zlib, 줄마다 필터 고름) · JPEG(jpeg-js 품질 85)
//  · 투명한 곳이 있으면 PNG만. 이미 JPEG·PNG·GIF 등이면 그대로, 읽지 못하는 BMP(RLE 압축 등)도 원본 그대로 둠

import { crc32, deflateSync, inflateSync } from "node:zlib";
import jpeg from "jpeg-js";

export interface WebImage {
  data: Uint8Array;
  /** 저장 이름(BMP면 확장자를 .png·.jpg로 바꿈) */
  name: string;
  mime: string;
}

const JPEG_QUALITY = 85;

const isBmp = (b: Uint8Array) => b.length > 26 && b[0] === 0x42 && b[1] === 0x4d;

/** 마스크 → (자리, 비트 수) */
function maskInfo(mask: number): [number, number] {
  if (!mask) return [0, 0];
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift += 1;
  let bits = 0;
  while (((mask >>> (shift + bits)) & 1) === 1) bits += 1;
  return [shift, bits];
}
const scale = (v: number, bits: number) => (bits >= 8 ? v >>> (bits - 8) : bits ? Math.round((v * 255) / ((1 << bits) - 1)) : 0);

/** 무압축(BI_RGB)·비트필드 BMP → RGBA. 못 읽으면 null */
export function decodeBmp(b: Uint8Array): { width: number; height: number; rgba: Uint8Array; alpha: boolean } | null {
  if (!isBmp(b)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const offset = dv.getUint32(10, true);
  const hsize = dv.getUint32(14, true);
  const core = hsize === 12;
  const width = core ? dv.getUint16(18, true) : dv.getInt32(18, true);
  const rawH = core ? dv.getInt16(20, true) : dv.getInt32(22, true);
  const bpp = core ? dv.getUint16(24, true) : dv.getUint16(28, true);
  const comp = core ? 0 : dv.getUint32(30, true);
  const colors = core || b.length < 50 ? 0 : dv.getUint32(46, true);
  const height = Math.abs(rawH);
  if (width <= 0 || height <= 0 || width > 20000 || height > 20000) return null;
  if (comp !== 0 && comp !== 3 && comp !== 6) return null; // RLE·JPEG·PNG 담긴 BMP 등은 그대로 둠
  if (![1, 4, 8, 16, 24, 32].includes(bpp)) return null;
  // 비트필드: 머리 안(52바이트 이상) 또는 머리 바로 뒤(40바이트 머리)
  let masks: [number, number, number, number] = bpp === 16 ? [0x7c00, 0x03e0, 0x001f, 0] : [0x00ff0000, 0x0000ff00, 0x000000ff, 0];
  if (comp === 3 || comp === 6) {
    const at = 14 + 40;
    if (b.length < at + 12) return null;
    masks = [dv.getUint32(at, true), dv.getUint32(at + 4, true), dv.getUint32(at + 8, true), comp === 6 || hsize >= 56 ? dv.getUint32(at + 12, true) : 0];
  }
  const palStart = 14 + hsize + (comp === 3 && hsize === 40 ? 12 : comp === 6 && hsize === 40 ? 16 : 0);
  const entry = core ? 3 : 4;
  const palette: number[][] = [];
  if (bpp <= 8) {
    const n = colors || 1 << bpp;
    for (let i = 0; i < n; i++) {
      const p = palStart + i * entry;
      if (p + 2 >= b.length) break;
      palette.push([b[p + 2], b[p + 1], b[p]]);
    }
  }
  const stride = Math.floor((bpp * width + 31) / 32) * 4;
  if (offset + stride * height > b.length) return null;
  const rgba = new Uint8Array(width * height * 4);
  const [rs, rb] = maskInfo(masks[0]);
  const [gs, gb] = maskInfo(masks[1]);
  const [bs, bb] = maskInfo(masks[2]);
  const [as, ab] = maskInfo(masks[3]);
  let alpha = false;
  for (let y = 0; y < height; y++) {
    const row = offset + (rawH < 0 ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r: number;
      let g: number;
      let bl: number;
      let a = 255;
      if (bpp <= 8) {
        const bit = x * bpp;
        const idx = (b[row + (bit >> 3)] >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        [r, g, bl] = palette[idx] ?? [0, 0, 0];
      } else if (bpp === 24) {
        const p = row + x * 3;
        [bl, g, r] = [b[p], b[p + 1], b[p + 2]];
      } else {
        const v = bpp === 16 ? dv.getUint16(row + x * 2, true) : dv.getUint32(row + x * 4, true);
        r = scale((v & masks[0]) >>> rs, rb);
        g = scale((v & masks[1]) >>> gs, gb);
        bl = scale((v & masks[2]) >>> bs, bb);
        if (ab) {
          a = scale((v & masks[3]) >>> as, ab);
          if (a < 255) alpha = true;
        }
      }
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = bl;
      rgba[o + 3] = a;
    }
  }
  return { width, height, rgba, alpha };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}

/** RGBA → PNG(불투명하면 RGB). 줄마다 다섯 필터 중 합이 가장 작은 것을 고름 */
export function encodePng(rgba: Uint8Array, width: number, height: number, alpha: boolean): Uint8Array {
  const bpp = alpha ? 4 : 3;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  let prev = Buffer.alloc(stride);
  let line = Buffer.alloc(stride);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = x * bpp;
      line[d] = rgba[s];
      line[d + 1] = rgba[s + 1];
      line[d + 2] = rgba[s + 2];
      if (alpha) line[d + 3] = rgba[s + 3];
    }
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (line[i] - pred) & 255;
        out[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
    [prev, line] = [line, prev];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array())]);
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };

/** 그림 한 장 → 웹용. BMP면 PNG·JPEG 중 작은 쪽(투명하면 PNG), 아니면 그대로 */
export function toWebImage(data: Uint8Array, name: string, mime?: string): WebImage {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const keep = { data, name, mime: mime || MIME[ext] || "application/octet-stream" };
  const img = isBmp(data) ? decodeBmp(data) : null;
  if (!img) return keep;
  const stem = name.replace(/\.[^.]+$/, "");
  const png = encodePng(img.rgba, img.width, img.height, img.alpha);
  const jpg = img.alpha ? null : new Uint8Array(jpeg.encode({ data: Buffer.from(img.rgba), width: img.width, height: img.height }, JPEG_QUALITY).data);
  return jpg && jpg.length < png.length ? { data: jpg, name: `${stem}.jpg`, mime: "image/jpeg" } : { data: png, name: `${stem}.png`, mime: "image/png" };
}

/**
 * PNG → RGBA(8비트 RGB·RGBA·회색조, 비월(interlace) 아님만 — 그 밖은 null). 공통 지식 그림 줄이기(shrinkPhoto)용 순수 풀기:
 * IHDR·IDAT를 모아 zlib로 풀고 줄마다 필터(없음·왼쪽·위·평균·Paeth)를 되돌림
 */
export function decodePng(b: Uint8Array): { width: number; height: number; rgba: Uint8Array; alpha: boolean } | null {
  const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength);
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let color = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const channels = color === 6 ? 4 : color === 2 ? 3 : color === 0 ? 1 : color === 4 ? 2 : 0;
  if (!width || !height || depth !== 8 || !channels || interlace) return null;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let alpha = false;
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const up = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * channels;
      const g = channels <= 2;
      rgba[o] = line[s];
      rgba[o + 1] = g ? line[s] : line[s + 1];
      rgba[o + 2] = g ? line[s] : line[s + 2];
      const al = channels === 4 ? line[s + 3] : channels === 2 ? line[s + 1] : 255;
      rgba[o + 3] = al;
      if (al < 255) alpha = true;
    }
    prev = line;
  }
  return { width, height, rgba, alpha };
}

/** 사진 줄이기 JPEG 품질 */
const PHOTO_QUALITY = 80;

/**
 * 공통 지식 그림을 웹용으로(2026-09-28): BMP는 toWebImage, 투명한 곳이 없는 PNG는 JPEG(품질 80)가 더 작으면 JPEG로 — 첨부3 증빙 쪽처럼 사진을 PNG로 담은
 * PDF는 그대로 두면 문서 하나에 300MB가 넘음. 투명한 그림·풀 수 없는 PNG·이미 작은 그림(50KB 미만)은 그대로
 */
export function shrinkPhoto(data: Uint8Array, name: string, mime?: string): WebImage {
  const web = toWebImage(data, name, mime);
  if (web.mime !== "image/png" || web.data.byteLength < 50_000) return web;
  const img = decodePng(web.data);
  if (!img || img.alpha) return web;
  const jpg = new Uint8Array(jpeg.encode({ data: Buffer.from(img.rgba), width: img.width, height: img.height }, PHOTO_QUALITY).data);
  return jpg.byteLength < web.data.byteLength ? { data: jpg, name: web.name.replace(/\.[^.]+$/, ".jpg"), mime: "image/jpeg" } : web;
}
