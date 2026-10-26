// 한글 파일 속 BMP 그림 → PNG·JPEG(작은 쪽): 초기 변환(sips) 규칙과 같게, 무손실 PNG는 픽셀 그대로
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import jpeg from "jpeg-js";
import { parse } from "kordoc";
import { decodeBmp, decodePng as decodePngLib, encodePng, shrinkPhoto, toWebImage } from "./image.ts";
import { cardSourceFile } from "../file-names.ts";
import { NO_SEED_CARDS } from "../../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = resolve(import.meta.dirname, "../../..");
const CARD_HWP1 = join(ROOT, "data/cards/260916", cardSourceFile(1));
const has = existsSync(CARD_HWP1);

/** 24비트 BMP(아래에서 위로 저장) 만들기 */
function bmp24(width: number, height: number, px: (x: number, y: number) => [number, number, number]): Uint8Array {
  const stride = Math.floor((24 * width + 31) / 32) * 4;
  const b = Buffer.alloc(54 + stride * height);
  b.write("BM", 0, "latin1");
  b.writeUInt32LE(b.length, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(width, 18);
  b.writeInt32LE(height, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, bl] = px(x, y);
      const o = 54 + (height - 1 - y) * stride + x * 3;
      b[o] = bl;
      b[o + 1] = g;
      b[o + 2] = r;
    }
  return b;
}

/** 시험용 PNG 풀기(8비트 RGB·RGBA, 필터 0~4) */
function decodePng(p: Uint8Array): { width: number; height: number; rgb: number[] } {
  const b = Buffer.from(p);
  let at = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  const idat: Buffer[] = [];
  while (at < b.length) {
    const len = b.readUInt32BE(at);
    const kind = b.toString("latin1", at + 4, at + 8);
    const data = b.subarray(at + 8, at + 8 + len);
    if (kind === "IHDR") [width, height, type] = [data.readUInt32BE(0), data.readUInt32BE(4), data[9]];
    if (kind === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const up = y ? out[(y - 1) * stride + i] : 0;
      const c = y && i >= bpp ? out[(y - 1) * stride + i - bpp] : 0;
      const p = a + up - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      out[y * stride + i] = (v + pred) & 255;
    }
  }
  const rgb: number[] = [];
  for (let i = 0; i < out.length; i += bpp) rgb.push(out[i], out[i + 1], out[i + 2]);
  return { width, height, rgb };
}

test("BMP 읽기(위아래 뒤집힘·줄 끝 채움) → PNG 무손실", () => {
  const px = (x: number, y: number): [number, number, number] => [(x * 40) & 255, (y * 90) & 255, (x * y * 17) & 255];
  const bmp = bmp24(5, 3, px); // 한 줄 15바이트 → 16바이트로 채움
  const img = decodeBmp(bmp)!;
  assert.deepEqual([img.width, img.height, img.alpha], [5, 3, false]);
  assert.deepEqual([...img.rgba.subarray(0, 4)], [...px(0, 0), 255], "맨 윗줄이 먼저");
  const png = decodePng(encodePng(img.rgba, 5, 3, false));
  const want: number[] = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) want.push(...px(x, y));
  assert.deepEqual(png.rgb, want);
  // BMP가 아니면 그대로
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  assert.deepEqual(toWebImage(jpg, "image_003.jpg"), { data: jpg, name: "image_003.jpg", mime: "image/jpeg" });
});

test("원본 한글 파일의 카드 그림: 초기 변환(sips)처럼 PNG·JPEG 중 작은 쪽, 크기도 비슷", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음(data/ — git 밖)") }, async () => {
  const r: any = await parse(readFileSync(CARD_HWP1));
  for (const [name, seedFile] of [
    ["image_001.bmp", "image_001.jpg"],
    ["image_002.bmp", "image_002.png"],
  ]) {
    const im = r.images.find((x: any) => x.filename === name);
    const web = toWebImage(im.data, name, im.mimeType);
    const seedSize = statSync(join(ROOT, "seed/cards/260916/images/biz1", seedFile)).size;
    assert.equal(web.name, seedFile, `${name} 형식`);
    assert.ok(web.data.length < im.data.length / 4, `${name} 원본 BMP ${im.data.length}B → ${web.data.length}B`);
    assert.ok(web.data.length < seedSize * 1.6, `${name} 초기 변환 ${seedSize}B · 이번 ${web.data.length}B`);
    if (web.mime === "image/jpeg") {
      const d = jpeg.decode(web.data);
      const src = decodeBmp(im.data)!;
      assert.deepEqual([d.width, d.height], [src.width, src.height]);
    }
  }
});

/** 가짜 사진(약한 잡음 섞인 그러데이션 — 사진처럼 PNG로는 잘 안 줄고 JPEG가 작음) */
function photo(w: number, h: number, alpha: boolean): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 24) & 0xff;
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    px[i * 4] = (x * 255) / w + (rnd() & 31);
    px[i * 4 + 1] = (y * 255) / h + (rnd() & 31);
    px[i * 4 + 2] = ((x + y) * 255) / (w + h) + (rnd() & 31);
    px[i * 4 + 3] = alpha && x < 10 ? 128 : 255;
  }
  return px;
}

test("decodePng: encodePng가 만든 PNG(RGB·RGBA, 줄마다 다른 필터)를 같은 픽셀로 되돌림", () => {
  for (const alpha of [false, true]) {
    const rgba = photo(37, 23, alpha);
    const back = decodePngLib(encodePng(rgba, 37, 23, alpha));
    assert.ok(back, "풀림");
    assert.equal(back!.width, 37);
    assert.equal(back!.height, 23);
    assert.equal(back!.alpha, alpha);
    // RGB로 저장하면 알파는 255
    assert.deepEqual([...back!.rgba], [...rgba]);
  }
  assert.equal(decodePngLib(new Uint8Array([1, 2, 3])), null, "PNG가 아니면 null");
});

test("shrinkPhoto(공통 지식 그림): 투명한 곳 없는 큰 PNG는 JPEG로, 투명하거나 작은 PNG·이미 JPEG는 그대로", () => {
  const big = encodePng(photo(480, 480, false), 480, 480, false);
  assert.ok(big.byteLength >= 50_000, `시험 PNG가 충분히 큼(${big.byteLength})`);
  const shrunk = shrinkPhoto(big, "p017-1.png", "image/png");
  assert.equal(shrunk.mime, "image/jpeg");
  assert.equal(shrunk.name, "p017-1.jpg");
  assert.ok(shrunk.data.byteLength < big.byteLength);
  const clear = encodePng(photo(480, 480, true), 480, 480, true);
  assert.equal(shrinkPhoto(clear, "a.png", "image/png").mime, "image/png", "투명한 곳이 있으면 PNG");
  const small = encodePng(photo(20, 20, false), 20, 20, false);
  assert.equal(shrinkPhoto(small, "s.png", "image/png").data, small, "50KB 미만은 그대로");
});
