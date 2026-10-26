// hwp5.ts 직접 시험: 작은 가짜 HWP 5 파일(CFB)을 만들어 오류 분기(구조·머리·암호·배포용·DRM·DocInfo/본문 없음)와
// 정상 읽기(글꼴·글자 모양·문단 모양·쪽 크기·줄 배치·글자·줄바꿈·묶음 빈칸)를 확인합니다. 원본 카드 파일은 hwp.test.ts가 봅니다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import CFB from "cfb";
import { BORDER_WIDTH_MM, readHwp5 } from "./hwp5.ts";
import { HwpReadError } from "./model.ts";

/** 레코드 하나: 태그 10비트 · 수준 10비트 · 크기 12비트(4095 이상이면 확장 크기) */
function rec(tag: number, level: number, data: Buffer): Buffer {
  const big = data.length >= 0xfff;
  const head = Buffer.alloc(big ? 8 : 4);
  head.writeUInt32LE((tag | (level << 10) | ((big ? 0xfff : data.length) << 20)) >>> 0, 0);
  if (big) head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data]);
}
const u16s = (...v: number[]) => Buffer.from(new Uint16Array(v).buffer);
const str = (s: string) => Buffer.concat([u16s(s.length), Buffer.from(s, "utf16le")]);

function fileHeader(flags = 0, sig = "HWP Document File"): Buffer {
  const b = Buffer.alloc(256);
  b.write(sig, 0, "latin1");
  b.writeUInt32LE(flags, 36);
  return b;
}

const idMappings = () => {
  const b = Buffer.alloc(72);
  b.writeInt32LE(1, 4); // 한글 글꼴 1개
  return rec(17, 0, b);
};
const charShape = () => {
  const b = Buffer.alloc(72);
  b.writeInt32LE(1500, 42);
  b.writeUInt32LE(0b10, 46); // 굵게
  return rec(21, 0, b);
};
const docInfo = () => Buffer.concat([idMappings(), rec(19, 0, Buffer.concat([Buffer.from([0]), str("함초롬바탕")])), charShape(), rec(25, 0, Buffer.alloc(54))]);

const pageDef = () => {
  const b = Buffer.alloc(40);
  [59528, 84188, 8504, 8504, 5668, 4252, 4252, 4252, 0].forEach((v, i) => b.writeUInt32LE(v, i * 4));
  return rec(73, 1, b);
};
const paraHeader = (chars: number) => {
  const b = Buffer.alloc(22);
  b.writeUInt32LE(chars, 0);
  return rec(66, 0, b);
};
const lineSeg = (textpos: number, vertpos: number) => {
  const b = Buffer.alloc(36);
  b.writeUInt32LE(textpos, 0);
  b.writeInt32LE(vertpos, 4);
  b.writeInt32LE(1000, 8);
  b.writeInt32LE(1000, 12);
  b.writeInt32LE(850, 16);
  b.writeInt32LE(600, 20);
  b.writeInt32LE(0, 24);
  b.writeInt32LE(40000, 28);
  return rec(69, 1, b);
};
/** 글 문단: 글자 u16 열(마지막 13 = 문단 끝) */
const textPara = (chars: number[], extra: Buffer[] = []) =>
  Buffer.concat([paraHeader(chars.length), rec(67, 1, u16s(...chars)), rec(68, 1, Buffer.from(new Uint32Array([0, 0]).buffer)), lineSeg(0, 0), ...extra]);

function hwp(opts: { flags?: number; sig?: string; docInfo?: Buffer | null; sections?: Buffer[]; compress?: boolean } = {}): Uint8Array {
  const cfb = CFB.utils.cfb_new();
  const comp = opts.compress ? (b: Buffer) => deflateRawSync(b) : (b: Buffer) => b;
  CFB.utils.cfb_add(cfb, "/FileHeader", fileHeader((opts.flags ?? 0) | (opts.compress ? 1 : 0), opts.sig));
  if (opts.docInfo !== null) CFB.utils.cfb_add(cfb, "/DocInfo", comp(opts.docInfo ?? docInfo()));
  (opts.sections ?? []).forEach((s, i) => CFB.utils.cfb_add(cfb, `/BodyText/Section${i}`, comp(s)));
  return new Uint8Array(CFB.write(cfb, { type: "buffer" }) as Buffer);
}
const GOOD = () => Buffer.concat([pageDef(), textPara([0xac00, 65, 10, 30, 31, 13])]);
const readErr = (b: Uint8Array) => assert.throws(() => readHwp5(b), HwpReadError);

test("선 굵기 표는 16단계, 오름차순", () => {
  assert.equal(BORDER_WIDTH_MM.length, 16);
  assert.deepEqual([...BORDER_WIDTH_MM], [...BORDER_WIDTH_MM].sort((a, b) => a - b));
});

test("오류: CFB가 아닌 바이트·머리 없음·서명 틀림·암호·배포용·DRM·DocInfo 없음·본문 없음", () => {
  assert.throws(() => readHwp5(new Uint8Array([1, 2, 3])), /구조를 읽지 못/);
  const noHeader = CFB.utils.cfb_new();
  CFB.utils.cfb_add(noHeader, "/DocInfo", Buffer.alloc(4));
  assert.throws(() => readHwp5(new Uint8Array(CFB.write(noHeader, { type: "buffer" }) as Buffer)), /한글\(HWP\) 파일이 아닙니다/);
  assert.throws(() => readHwp5(hwp({ sig: "Not A Hwp Document", sections: [GOOD()] })), /파일이 아닙니다/);
  assert.throws(() => readHwp5(hwp({ flags: 2, sections: [GOOD()] })), /암호/);
  assert.throws(() => readHwp5(hwp({ flags: 4, sections: [GOOD()] })), /배포용/);
  assert.throws(() => readHwp5(hwp({ flags: 16, sections: [GOOD()] })), /DRM/);
  assert.throws(() => readHwp5(hwp({ docInfo: null, sections: [GOOD()] })), /DocInfo/);
  assert.throws(() => readHwp5(hwp({ sections: [] })), /본문이 없습니다/);
  readErr(new Uint8Array(0));
});

test("정상 읽기: 글꼴·글자 모양·쪽 크기·글자·줄바꿈·묶음/고정폭 빈칸·줄 배치", () => {
  const d = readHwp5(hwp({ sections: [GOOD()] }));
  assert.equal(d.format, "hwp");
  assert.equal(d.sections.length, 1);
  assert.deepEqual(d.sections[0].page, { width: 59528, height: 84188, left: 8504, right: 8504, top: 5668, bottom: 4252, header: 4252, footer: 4252, gutter: 0, landscape: false });
  assert.equal(d.charPrs.length, 1);
  assert.equal(d.charPrs[0].height, 1500);
  assert.equal(d.charPrs[0].bold, true);
  assert.equal(d.charPrs[0].face[0], "함초롬바탕");
  assert.equal(d.paraPrs.length, 1);
  assert.deepEqual(d.borderFills, [null], "테두리 목록의 0번은 비어 있음");
  const p = d.sections[0].paras.find((q) => q.items.length)!;
  const kinds = p.items.map((i) => i.kind);
  assert.deepEqual(kinds, ["text", "br", "text"]);
  assert.equal((p.items[0] as any).text, "가A");
  assert.equal((p.items[2] as any).text, "  ");
  assert.equal(p.lines.length, 1);
  assert.equal(p.lines[0].horzsize, 40000);
  assert.equal(p.length, 6);
});

test("압축 문서(플래그 1)와 구역 여러 개, 쪽 정의 없는 구역은 page null", () => {
  const d = readHwp5(hwp({ compress: true, sections: [GOOD(), textPara([65, 13])] }));
  assert.equal(d.sections.length, 2);
  assert.equal(d.sections[0].page?.width, 59528);
  assert.equal(d.sections[1].page, null);
});

test("짧거나 잘린 레코드는 기본값으로 읽음(글자 모양 높이 기본 1000, 상대 크기 100)", () => {
  const info = Buffer.concat([rec(17, 0, Buffer.alloc(0)), rec(21, 0, Buffer.alloc(4)), rec(25, 0, Buffer.alloc(2))]);
  const d = readHwp5(hwp({ docInfo: info, sections: [GOOD()] }));
  assert.equal(d.charPrs[0].height, 1000);
  assert.deepEqual(d.charPrs[0].relSize, Array(7).fill(100));
  assert.deepEqual(d.charPrs[0].ratio, Array(7).fill(100));
  // 머리만 잘린 레코드가 끝에 붙어도 앞까지는 읽음
  const cut = Buffer.concat([GOOD(), Buffer.from([0xff, 0xff])]);
  assert.equal(readHwp5(hwp({ sections: [cut] })).sections[0].paras.length, 1);
});

test("확장 크기 레코드(4095바이트 이상) 문단 글도 읽음", () => {
  const chars = Array.from({ length: 2100 }, () => 0xac00);
  chars.push(13);
  const d = readHwp5(hwp({ sections: [Buffer.concat([pageDef(), textPara(chars)])] }));
  const p = d.sections[0].paras[0];
  assert.equal((p.items[0] as any).text.length, 2100);
});
