// HWP 5 바이너리 → 공통 모델(model.ts). 한글 문서 형식 5.0 공개 명세의 레코드 구조를 그대로 읽습니다(암호·배포용 문서는 거절).
//  · 파일: CFB(복합 파일) 안 FileHeader·DocInfo·BodyText/SectionN·BinData/BINxxxx.ext
//  · 레코드 머리 4바이트: 태그 10비트·수준 10비트·크기 12비트(0xFFF면 다음 4바이트가 크기)
//  · DocInfo: 글꼴(언어 7종)·글자 모양·문단 모양·테두리/배경·탭·그림 목록
//  · 본문: 문단 머리 → 글자(조종 문자는 8칸)·글자 모양 바뀌는 곳·줄 배치 → 조종(표·그리기 개체·구역 정의)
// 입출력은 부르는 쪽이 합니다(바이트를 받아 모델을 돌려줌).

import CFB from "cfb";
import { inflateRawSync } from "node:zlib";
import {
  type Align,
  type BinItem,
  type Border,
  type BorderFill,
  type Bullet,
  type Cell,
  type CharPr,
  type Fill,
  type Gradation,
  type HwpDoc,
  HwpReadError,
  resolveHeads,
  type Inline,
  type LineStyle,
  type LineType,
  type Numbering,
  type Obj,
  type ObjPos,
  type PageDef,
  type Para,
  type ParaHead,
  type ParaPr,
  type Pic,
  type Section,
  type Shape,
  type ShapeGeo,
  type Table,
  type TabDef,
  type TextBox,
} from "./model.ts";

interface Rec {
  tag: number;
  level: number;
  data: Buffer;
}

// DocInfo
const T_ID_MAPPINGS = 17;
const T_BIN_DATA = 18;
const T_FACE_NAME = 19;
const T_BORDER_FILL = 20;
const T_CHAR_SHAPE = 21;
const T_TAB_DEF = 22;
const T_NUMBERING = 23;
const T_BULLET = 24;
const T_PARA_SHAPE = 25;
// 본문
const T_PARA_HEADER = 66;
const T_PARA_TEXT = 67;
const T_PARA_CHAR_SHAPE = 68;
const T_PARA_LINE_SEG = 69;
const T_CTRL_HEADER = 71;
const T_LIST_HEADER = 72;
const T_PAGE_DEF = 73;
const T_SHAPE_COMPONENT = 76;
const T_TABLE = 77;
const T_SC_LINE = 78;
const T_SC_RECTANGLE = 79;
const T_SC_POLYGON = 82;
const T_SC_CURVE = 83;
const T_SC_PICTURE = 85;

const MAX_STREAM = 200 * 1024 * 1024;

function readRecords(buf: Buffer): Rec[] {
  const out: Rec[] = [];
  let at = 0;
  while (at + 4 <= buf.length) {
    const h = buf.readUInt32LE(at);
    at += 4;
    let size = h >>> 20;
    if (size === 0xfff) {
      if (at + 4 > buf.length) break;
      size = buf.readUInt32LE(at);
      at += 4;
    }
    if (at + size > buf.length) break;
    out.push({ tag: h & 0x3ff, level: (h >>> 10) & 0x3ff, data: buf.subarray(at, at + size) });
    at += size;
  }
  return out;
}

const cid = (s: string) => ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;
const C_TBL = cid("tbl ");
const C_GSO = cid("gso ");
const C_SECD = cid("secd");
const C_EQED = cid("eqed");
const C_TCPS = cid("tcps");
const C_ATNO = cid("atno");
const C_HEAD = cid("head");
const C_FOOT = cid("foot");
const C_PGNP = cid("pgnp");
const SC_KIND = new Map<number, Shape["kind"] | "pic">([
  [cid("$pic"), "pic"],
  [cid("$rec"), "rect"],
  [cid("$ell"), "ellipse"],
  [cid("$lin"), "line"],
  [cid("$pol"), "polygon"],
  [cid("$cur"), "curve"],
  [cid("$arc"), "arc"],
  [cid("$con"), "container"],
  [cid("$ole"), "ole"],
]);

/** 32비트 색(0x00BBGGRR) → #RRGGBB. 윗바이트가 있으면(0xFFFFFFFF 등) 없음 */
function color(v: number): string | null {
  if (v >>> 24 !== 0) return null;
  const h = (x: number) => x.toString(16).padStart(2, "0").toUpperCase();
  return `#${h(v & 255)}${h((v >>> 8) & 255)}${h((v >>> 16) & 255)}`;
}

/** 경계 안에서만 읽기(짧은 레코드는 기본값) */
class R {
  readonly d: Buffer;
  constructor(d: Buffer) {
    this.d = d;
  }
  has(o: number, n: number) {
    return o + n <= this.d.length;
  }
  u8(o: number, dflt = 0) {
    return this.has(o, 1) ? this.d.readUInt8(o) : dflt;
  }
  i8(o: number, dflt = 0) {
    return this.has(o, 1) ? this.d.readInt8(o) : dflt;
  }
  u16(o: number, dflt = 0) {
    return this.has(o, 2) ? this.d.readUInt16LE(o) : dflt;
  }
  i16(o: number, dflt = 0) {
    return this.has(o, 2) ? this.d.readInt16LE(o) : dflt;
  }
  u32(o: number, dflt = 0) {
    return this.has(o, 4) ? this.d.readUInt32LE(o) : dflt;
  }
  i32(o: number, dflt = 0) {
    return this.has(o, 4) ? this.d.readInt32LE(o) : dflt;
  }
  /** WORD 길이 + UTF-16 글자열 → [글자열, 다음 위치] */
  str(o: number): [string, number] {
    const n = this.u16(o);
    const end = o + 2 + n * 2;
    return end <= this.d.length ? [this.d.toString("utf16le", o + 2, end), end] : ["", this.d.length];
  }
}

const BORDER_TYPE: LineType[] = ["NONE", "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM", "WAVE", "DOUBLE_WAVE", "THICK_3D", "THICK_3D_LIFTED", "3D", "3D_LIFTED"];
export const BORDER_WIDTH_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1, 1.5, 2, 3, 4, 5];
const IMG_MODE = ["TILE", "TILE_HORZ_TOP", "TILE_HORZ_BOTTOM", "TILE_VERT_LEFT", "TILE_VERT_RIGHT", "TOTAL", "CENTER", "CENTER_TOP", "CENTER_BOTTOM", "LEFT_CENTER", "LEFT_TOP", "LEFT_BOTTOM", "RIGHT_CENTER", "RIGHT_TOP", "RIGHT_BOTTOM", "ZOOM"];
const IMG_EFFECT = ["REAL_PIC", "GRAY_SCALE", "BLACK_WHITE", "PATTERN8x8"];
const ALIGN: Align[] = ["JUSTIFY", "LEFT", "RIGHT", "CENTER", "DISTRIBUTE", "DISTRIBUTE_SPACE"];

function border(r: R, o: number): Border {
  return { type: BORDER_TYPE[r.u8(o)] ?? "SOLID", width: BORDER_WIDTH_MM[r.u8(o + 1)] ?? 0.12, color: color(r.u32(o + 2)) ?? "#000000" };
}

/**
 * 채우기 정보(테두리/배경·그리기 개체 공통) → [값, 다음 위치].
 * 종류(4) · 단색(12) · 그러데이션(유형 1 · 각도·중심 x·y·번짐 정도·색 수 각 4 · [색 위치 4×n] · 색 4×n) · 그림(6)
 * · 추가 속성(길이 4 + 내용: 그러데이션이면 번짐 중심 1) · 투명도(있는 채우기마다 1)
 */
function fillAt(r: R, o: number): [Fill | null, number] {
  const type = r.u32(o);
  o += 4;
  const f: Fill = { color: null, patternColor: null, pattern: -1, image: null, gradation: null };
  if (type & 1) {
    f.color = color(r.u32(o));
    f.patternColor = color(r.u32(o + 4));
    f.pattern = r.i32(o + 8, -1);
    o += 12;
  }
  if (type & 4) {
    const n = r.i32(o + 17);
    const cnt = Math.max(0, Math.min(n, 64));
    const g: Gradation = { type: r.i8(o), angle: r.i32(o + 1), cx: r.i32(o + 5), cy: r.i32(o + 9), step: r.i32(o + 13), colors: [] };
    o += 21;
    if (n > 2) {
      g.positions = Array.from({ length: cnt }, (_, k) => r.i32(o + k * 4));
      o += 4 * cnt;
    }
    for (let k = 0; k < cnt; k++) g.colors.push(color(r.u32(o + k * 4)) ?? "#FFFFFF");
    o += 4 * cnt;
    f.gradation = g;
  }
  if (type & 2) {
    f.image = { mode: IMG_MODE[r.u8(o)] ?? "TOTAL", bright: r.i8(o + 1), contrast: r.i8(o + 2), effect: IMG_EFFECT[r.u8(o + 3)] ?? "REAL_PIC", bin: r.u16(o + 4) };
    o += 6;
  }
  if (r.has(o, 4)) {
    const n = r.u32(o);
    o += 4;
    if (f.gradation && n >= 1) f.gradation.stepCenter = r.u8(o);
    o += n < 1024 ? n : 0;
  }
  const kinds = [type & 1, type & 4, type & 2].filter(Boolean).length;
  if (kinds && r.has(o, 1)) f.alpha = r.u8(o);
  o += kinds;
  return [type ? f : null, o];
}

function charShape(d: Buffer, faces: string[][]): CharPr {
  const r = new R(d);
  const arr = (o: number, f: (o: number) => number) => Array.from({ length: 7 }, (_, i) => f(o + i));
  const ids = Array.from({ length: 7 }, (_, i) => r.u16(i * 2));
  const attr = r.u32(46);
  const ul = (attr >>> 2) & 3;
  return {
    face: ids.map((id, i) => faces[i]?.[id] ?? faces[0]?.[0] ?? ""),
    ratio: arr(14, (o) => r.u8(o, 100) || 100),
    spacing: arr(21, (o) => r.i8(o)),
    relSize: arr(28, (o) => r.u8(o, 100) || 100),
    offset: arr(35, (o) => r.i8(o)),
    height: r.i32(42, 1000),
    italic: (attr & 1) !== 0,
    bold: (attr & 2) !== 0,
    underline: ul === 1 ? "BOTTOM" : ul === 3 ? "TOP" : "",
    outline: ((attr >>> 8) & 7) !== 0,
    shadow: ((attr >>> 11) & 3) === 0 ? "" : ((attr >>> 11) & 3) === 1 ? "DROP" : "CONTINUOUS",
    emboss: (attr & (1 << 13)) !== 0,
    engrave: (attr & (1 << 14)) !== 0,
    supscript: (attr & (1 << 15)) !== 0,
    subscript: (attr & (1 << 16)) !== 0,
    // 취소선: 18비트 + 선 모양(26~29비트). 모양 15는 선 없음(원본 PDF에 취소선이 없는 글자 모양 239개가 이 값)
    strike: ((attr >>> 18) & 1) === 1 && ((attr >>> 26) & 15) !== 15,
    useFontSpace: (attr & (1 << 25)) !== 0,
    kerning: (attr & (1 << 30)) !== 0,
    shadowX: r.i8(50),
    shadowY: r.i8(51),
    color: color(r.u32(52)) ?? "#000000",
    underlineColor: color(r.u32(56)),
    shade: color(r.u32(60, 0xffffffff)),
    shadowColor: color(r.u32(64, 0xffffffff)),
    borderFill: r.u16(68),
    strikeColor: color(r.u32(70, 0xffffffff)),
    attr,
  };
}

function paraShape(d: Buffer): ParaPr {
  const r = new R(d);
  const a1 = r.u32(0);
  const a3 = r.u32(46);
  const hasNew = r.has(50, 4);
  const lsType = hasNew ? a3 & 0x1f : a1 & 3;
  const hd = (a1 >>> 23) & 3;
  const va = (a1 >>> 20) & 3;
  return {
    align: ALIGN[(a1 >>> 2) & 7] ?? "JUSTIFY",
    breakLatin: (["KEEP_WORD", "HYPHENATION", "BREAK_WORD"] as const)[(a1 >>> 5) & 3] ?? "KEEP_WORD",
    // 한글 줄나눔(비트 7): 규격은 0 = 어절, 1 = 글자. HWPX breakNonLatinWord는 이름과 뜻이 반대(KEEP_WORD = 글자, BREAK_WORD = 어절 —
    // 한글 11 저장본 줄 배치 검산, 커밋 acca106)라서 1 → KEEP_WORD, 0 → BREAK_WORD. 카드 원본 HWP 4개 줄 배치 검산(2026-10-28):
    // 비트 7 = 1 문단은 낱말 가운데 끊김 241/1478, 0 문단은 3/573(셋 다 칸보다 긴 낱말) — 1이 글자 단위
    breakNonLatin: (a1 >>> 7) & 1 ? "KEEP_WORD" : "BREAK_WORD",
    snapToGrid: ((a1 >>> 8) & 1) === 1,
    condense: (a1 >>> 9) & 0x7f,
    keepWithNext: ((a1 >>> 17) & 1) === 1,
    vertAlign: (["BASELINE", "TOP", "CENTER", "BOTTOM"] as const)[va],
    fontLineHeight: ((a1 >>> 22) & 1) === 1,
    headingType: (["NONE", "OUTLINE", "NUMBER", "BULLET"] as const)[hd],
    // 여백·들여쓰기·문단 간격은 HWPUNIT의 2배로 저장됨(HWPX hp:default와 같은 값) — 줄 배치(horzpos)·문단 사이 간격으로 확인
    left: r.i32(4) / 2,
    right: r.i32(8) / 2,
    indent: r.i32(12) / 2,
    before: r.i32(16) / 2,
    after: r.i32(20) / 2,
    lineSpacingType: (["PERCENT", "FIXED", "BETWEEN_LINES", "AT_LEAST"] as const)[lsType] ?? "PERCENT",
    lineSpacing: hasNew ? r.u32(50) : r.i32(24, 160),
    tabDef: r.u16(28),
    headingId: r.u16(30),
    headingLevel: (a1 >>> 25) & 7,
    borderFill: r.u16(32),
    borderOffset: [r.i16(34), r.i16(36), r.i16(38), r.i16(40)],
    autoSpaceEAsianEng: ((r.u32(42) >>> 4) & 1) === 1,
    autoSpaceEAsianNum: ((r.u32(42) >>> 5) & 1) === 1,
  };
}

/** 글꼴 레코드: 이름, (속성 0x80) 대체 글꼴, (0x40) 글꼴 유형 정보 10바이트, (0x20) 기본 글꼴 이름 */
function faceName(d: Buffer): { name: string; alt: string | null; defaultName: string | null } {
  const r = new R(d);
  const attr = r.u8(0);
  const [name, o0] = r.str(1);
  let o = o0;
  let alt: string | null = null;
  let defaultName: string | null = null;
  if (attr & 0x80) {
    [alt, o] = r.str(o + 1);
  }
  if (attr & 0x40) o += 10;
  if (attr & 0x20) [defaultName] = r.str(o);
  return { name, alt: alt || null, defaultName: defaultName && defaultName !== name ? defaultName : null };
}

/** 문단 머리 정보(12바이트): 속성·너비 보정·본문과의 거리·글자 모양 */
function paraHead(r: R, o: number): ParaHead {
  const a = r.u32(o);
  const cp = r.u32(o + 8, 0xffffffff);
  return {
    align: (["LEFT", "CENTER", "RIGHT", "LEFT"] as const)[a & 3],
    instWidth: (a & 4) !== 0,
    autoIndent: (a & 8) !== 0,
    textOffsetPercent: (a & 16) === 0,
    numFormat: (a >>> 5) & 0x1f,
    widthAdjust: r.i16(o + 4),
    textOffset: r.u16(o + 6),
    charPr: cp === 0xffffffff ? -1 : cp,
  };
}

function bullet(d: Buffer): Bullet {
  const r = new R(d);
  return { head: paraHead(r, 0), char: String.fromCharCode(r.u16(12, 0x25cf)) };
}

function numbering(d: Buffer): Numbering {
  const r = new R(d);
  const levels: Numbering["levels"] = [];
  let o = 0;
  for (let lv = 0; lv < 7 && r.has(o, 14); lv++) {
    const head = paraHead(r, o);
    const [format, next] = r.str(o + 12);
    levels.push({ head, format });
    o = next;
  }
  // 시작 번호(2) 뒤 수준별 시작 번호(4 × 7, 5.0.2.5 이후)
  const starts = r.has(o + 2, 28) ? Array.from({ length: 7 }, (_, k) => r.u32(o + 2 + k * 4)) : undefined;
  return { levels, start: r.u16(o, 1) || 1, ...(starts && starts.some((v) => v > 0 && v < 10000) ? { starts: starts.map((v) => (v > 0 && v < 10000 ? v : 1)) } : {}) };
}

/** 탭 정의: 속성(4)·개수(4)·탭마다 위치(4, HWPUNIT의 2배)·종류(1)·채움(1)·예약(2) */
function tabDef(d: Buffer): TabDef {
  const r = new R(d);
  const attr = r.u32(0);
  const n = r.i32(4);
  const stops: TabDef["stops"] = [];
  for (let k = 0; k < n && r.has(8 + k * 8, 8); k++) {
    const o = 8 + k * 8;
    stops.push({ pos: r.u32(o) / 2, kind: (["LEFT", "RIGHT", "CENTER", "DECIMAL"] as const)[r.u8(o + 4)] ?? "LEFT", leader: r.u8(o + 5) });
  }
  return { autoLeft: (attr & 1) !== 0, autoRight: (attr & 2) !== 0, stops };
}

function objPos(d: Buffer): ObjPos {
  const r = new R(d);
  const a = r.u32(4);
  return {
    treatAsChar: (a & 1) !== 0,
    affectLineSpacing: (a & 4) !== 0,
    vertRelTo: (["PAPER", "PAGE", "PARA", "PARA"] as const)[(a >>> 3) & 3],
    vertAlign: (["TOP", "CENTER", "BOTTOM", "INSIDE", "OUTSIDE"] as const)[(a >>> 5) & 7] ?? "TOP",
    horzRelTo: (["PAPER", "PAGE", "COLUMN", "PARA"] as const)[(a >>> 8) & 3],
    horzAlign: (["LEFT", "CENTER", "RIGHT", "INSIDE", "OUTSIDE"] as const)[(a >>> 10) & 7] ?? "LEFT",
    wrap: (["SQUARE", "TOP_AND_BOTTOM", "BEHIND_TEXT", "IN_FRONT_OF_TEXT"] as const)[(a >>> 21) & 7] ?? "SQUARE",
    vertOffset: r.i32(8),
    horzOffset: r.i32(12),
    width: r.u32(16),
    height: r.u32(20),
    zOrder: r.i32(24),
    outMargin: [r.u16(28), r.u16(30), r.u16(32), r.u16(34)],
    flowWithText: ((a >>> 13) & 1) === 1,
    allowOverlap: ((a >>> 14) & 1) === 1,
    widthRelTo: (["PAPER", "PAGE", "COLUMN", "PARA", "ABSOLUTE"] as const)[(a >>> 15) & 7] ?? "ABSOLUTE",
    heightRelTo: (["PAPER", "PAGE", "ABSOLUTE", "ABSOLUTE"] as const)[(a >>> 18) & 3],
    protect: ((a >>> 20) & 1) === 1,
    textFlow: (["BOTH_SIDES", "LEFT_ONLY", "RIGHT_ONLY", "LARGEST_ONLY"] as const)[(a >>> 24) & 3],
    numberingType: (["NONE", "PICTURE", "TABLE", "EQUATION"] as const)[(a >>> 26) & 7] ?? "NONE",
    // 개체 설명: 개체 id(4)·쪽 나눔 방지(4) 뒤 글자열
    comment: r.has(44, 2) ? r.str(44)[0] : "",
  };
}

interface Ctx {
  recs: Rec[];
}

/** 레코드 [start, end)에서 수준 level의 문단들 */
function paras(ctx: Ctx, start: number, end: number, level: number, limit = Infinity): [Para[], number] {
  const out: Para[] = [];
  let i = start;
  while (i < end && out.length < limit) {
    const rec = ctx.recs[i];
    if (rec.level < level) break;
    if (rec.tag !== T_PARA_HEADER || rec.level !== level) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < end && ctx.recs[j].level > level) j++;
    out.push(para(ctx, i, j));
    i = j;
  }
  return [out, i];
}

/** 조종 문자 분류: 확장(개체·구역 정의 등, CTRL_HEADER와 짝)·인라인(탭·필드 끝 등)은 8칸 */
const EXTENDED = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);
const INLINE = new Set([4, 5, 6, 7, 8, 9, 19, 20]);

function para(ctx: Ctx, i: number, end: number): Para {
  const head = new R(ctx.recs[i].data);
  const level = ctx.recs[i].level;
  const nchars = head.u32(0) & 0x7fffffff;
  const p: Para = { paraPr: head.u16(8), style: head.u8(10), items: [], lines: [], length: nchars, pageBreak: (head.u8(11) & 0x0c) !== 0 };
  let text: Buffer | null = null;
  const shapes: [number, number][] = [];
  const ctrls: number[] = [];
  for (let k = i + 1; k < end; k++) {
    const rec = ctx.recs[k];
    if (rec.level !== level + 1) continue;
    if (rec.tag === T_PARA_TEXT) text = rec.data;
    else if (rec.tag === T_PARA_CHAR_SHAPE) for (let o = 0; o + 8 <= rec.data.length; o += 8) shapes.push([rec.data.readUInt32LE(o), rec.data.readUInt32LE(o + 4)]);
    else if (rec.tag === T_PARA_LINE_SEG)
      for (let o = 0; o + 36 <= rec.data.length; o += 36) {
        const d = rec.data;
        p.lines.push({
          textpos: d.readUInt32LE(o),
          vertpos: d.readInt32LE(o + 4),
          vertsize: d.readInt32LE(o + 8),
          textheight: d.readInt32LE(o + 12),
          baseline: d.readInt32LE(o + 16),
          spacing: d.readInt32LE(o + 20),
          horzpos: d.readInt32LE(o + 24),
          horzsize: d.readInt32LE(o + 28),
          flags: d.readUInt32LE(o + 32),
        });
      }
    else if (rec.tag === T_CTRL_HEADER) ctrls.push(k);
  }
  if (!shapes.length) shapes.push([0, 0]);
  const shapeAt = (pos: number) => {
    let id = shapes[0][1];
    for (const [at, s] of shapes) if (at <= pos) id = s;
    return id;
  };
  p.endCharPr = shapeAt(Math.max(0, nchars - 1));
  if (!text) return p;
  let ci = 0;
  let buf = "";
  let bufPos = 0;
  let bufShape = -1;
  const flush = () => {
    if (buf) p.items.push({ kind: "text", pos: bufPos, text: buf, charPr: bufShape });
    buf = "";
  };
  const n = text.length >> 1;
  for (let u = 0; u < n; ) {
    const ch = text.readUInt16LE(u * 2);
    const cs = shapeAt(u);
    if (ch < 32) {
      if (EXTENDED.has(ch) || INLINE.has(ch)) {
        flush();
        if (ch === 9) {
          const w = u + 7 < n ? text.readUInt32LE(u * 2 + 2) : 0;
          const x = u + 7 < n ? text.readUInt16LE(u * 2 + 6) : 0;
          p.items.push({ kind: "tab", pos: u, charPr: cs, width: w, leader: x & 0xff, tabKind: (x >>> 8) & 0xff });
        } else if (EXTENDED.has(ch)) {
          const k = ctrls[ci++];
          const cmp = k !== undefined ? compose(ctx.recs[k].data) : null;
          if (cmp) p.items.push({ kind: "compose", pos: u, charPr: cs, ...cmp });
          else if (k !== undefined && new R(ctx.recs[k].data).u32(0) === C_ATNO) {
            // 자동 번호: 쪽 번호만(머리말·꼬리말) — 쪽 보기가 data-hw-field 자리에 쪽 번호를 넣음
            if ((new R(ctx.recs[k].data).u32(4) & 0xf) === 0) p.items.push({ kind: "text", pos: u, text: "0", charPr: cs, attrs: ' data-hw-field="page"' });
          } else {
            const obj = k !== undefined ? control(ctx, k) : null;
            if (obj && "kind" in obj) p.items.push({ kind: "obj", pos: u, charPr: cs, obj });
          }
        }
        u += 8;
        continue;
      }
      if (ch === 10) {
        flush();
        p.items.push({ kind: "br", pos: u, charPr: cs });
      } else if (ch === 30 || ch === 31) {
        // 묶음 빈칸·고정폭 빈칸
        if (!buf || cs !== bufShape) {
          flush();
          bufPos = u;
          bufShape = cs;
        }
        buf += ch === 30 ? "\u00a0" : "\u2007";
      } else flush();
      u += 1;
      continue;
    }
    if (!buf || cs !== bufShape) {
      flush();
      bufPos = u;
      bufShape = cs;
    }
    buf += String.fromCharCode(ch);
    u += 1;
  }
  flush();
  return p;
}

/** 글자 겹침(tcps): 글자 수·글자·테두리 종류·안 글자 크기·펼침·안 글자 모양 ID들 */
function compose(data: Buffer): { chars: string; border: number; size: number; spread: number; charPrs: number[] } | null {
  if (data.length < 6 || data.readUInt32LE(0) !== C_TCPS) return null;
  const r = new R(data);
  const len = r.u16(4);
  let chars = "";
  for (let i = 0; i < len; i++) chars += String.fromCharCode(r.u16(6 + i * 2));
  const o = 6 + len * 2;
  if (data.length < o + 4) return { chars, border: 0, size: 0, spread: 0, charPrs: [] };
  const cnt = r.u8(o + 3);
  const charPrs: number[] = [];
  for (let i = 0; i < cnt && o + 8 + i * 4 <= data.length; i++) charPrs.push(data.readInt32LE(o + 4 + i * 4));
  return { chars, border: r.u8(o), size: r.i8(o + 1), spread: r.u8(o + 2), charPrs };
}

/** 조종 머리 레코드 k → 개체(표·그림·도형) 또는 구역 정의 */
function control(ctx: Ctx, k: number): Obj | { page: PageDef } | null {
  const rec = ctx.recs[k];
  const id = new R(rec.data).u32(0);
  let end = k + 1;
  while (end < ctx.recs.length && ctx.recs[end].level > rec.level) end++;
  if (id === C_TBL) return table(ctx, k, end);
  if (id === C_GSO) return gso(ctx, k, end);
  if (id === C_SECD) {
    for (let j = k + 1; j < end; j++)
      if (ctx.recs[j].tag === T_PAGE_DEF) {
        const r = new R(ctx.recs[j].data);
        const page: PageDef = { width: r.u32(0), height: r.u32(4), left: r.u32(8), right: r.u32(12), top: r.u32(16), bottom: r.u32(20), header: r.u32(24), footer: r.u32(28), gutter: r.u32(32), landscape: (r.u32(36) & 1) !== 0 };
        return { page };
      }
    return null;
  }
  if (id === C_EQED) return { kind: "equation", pos: objPos(rec.data), curW: 0, curH: 0, x: 0, y: 0, line: null, fill: null, round: 0, shadow: null, text: null, children: [], points: [] };
  return null;
}

function table(ctx: Ctx, k: number, end: number): Table | null {
  const level = ctx.recs[k].level;
  let ti = -1;
  for (let j = k + 1; j < end; j++)
    if (ctx.recs[j].tag === T_TABLE && ctx.recs[j].level === level + 1) {
      ti = j;
      break;
    }
  if (ti < 0) return null;
  const r = new R(ctx.recs[ti].data);
  const attr = r.u32(0);
  const rows = r.u16(4);
  const t: Table = {
    kind: "table",
    pos: objPos(ctx.recs[k].data),
    rows,
    cols: r.u16(6),
    cellSpacing: r.u16(8),
    inMargin: [r.u16(10), r.u16(12), r.u16(14), r.u16(16)],
    borderFill: r.u16(18 + rows * 2),
    pageBreak: (["NONE", "CELL", "TABLE", "NONE"] as const)[attr & 3],
    repeatHeader: (attr & 4) !== 0,
    cells: [],
  };
  // 칸 묶음 영역(여러 칸에 걸친 테두리/배경): 개수(2) + (시작 열·행, 끝 열·행, 테두리/배경) 2바이트씩
  const nz = r.u16(20 + rows * 2);
  for (let z = 0; z < nz && r.has(22 + rows * 2 + z * 10, 10); z++) {
    const o = 22 + rows * 2 + z * 10;
    (t.zones ??= []).push({ c0: r.u16(o), r0: r.u16(o + 2), c1: r.u16(o + 4), r1: r.u16(o + 6), borderFill: r.u16(o + 8) });
  }
  const cellLevel = level + 1;
  for (let j = ti + 1; j < end; ) {
    const rec = ctx.recs[j];
    if (rec.tag !== T_LIST_HEADER || rec.level !== cellLevel) {
      j++;
      continue;
    }
    // 목록 머리: 문단 수(2)·?(2)·속성(4, 세로 정렬 5~6비트·안 여백 지정 16비트) 뒤에 칸 속성
    const c = new R(rec.data);
    const flags = c.u32(4);
    const va = (flags >>> 5) & 3;
    const own = ((flags >>> 16) & 1) === 1;
    const [ps, next] = paras(ctx, j + 1, end, cellLevel, Math.max(1, c.u16(0)));
    const cell: Cell = {
      row: c.u16(10),
      col: c.u16(8),
      colSpan: Math.max(1, c.u16(12)),
      rowSpan: Math.max(1, c.u16(14)),
      width: c.u32(16),
      height: c.u32(20),
      // 안 여백을 따로 지정하지 않은 칸은 표의 기본 안 여백을 씀
      margin: own ? [c.u16(24), c.u16(26), c.u16(28), c.u16(30)] : [...t.inMargin],
      ownMargin: own,
      borderFill: c.u16(32),
      vertAlign: (["TOP", "CENTER", "BOTTOM", "TOP"] as const)[va],
      paras: ps,
      ...(((flags >>> 18) & 1) === 1 ? { header: true } : {}),
      ...(((flags >>> 17) & 1) === 1 ? { protect: true } : {}),
    };
    t.cells.push(cell);
    j = Math.max(next, j + 1);
  }
  return t;
}

/** 그리기 개체 공통(SHAPE_COMPONENT): 루트는 앞에 개체 id가 한 번 더 붙음 */
function shapeComp(d: Buffer, nested: boolean) {
  const r = new R(d);
  const b = nested ? 0 : 4;
  const kid = r.u32(b);
  const nMat = Math.min(r.u16(b + 46), 16);
  // 변환 행렬: 이동 1개 + (크기·회전) × n, 행렬 하나 = double 6개
  const mat = (o: number) => Array.from({ length: 6 }, (_, k) => (r.has(o + k * 8, 8) ? d.readDoubleLE(o + k * 8) : k === 0 || k === 4 ? 1 : 0));
  const flags = r.u32(b + 32);
  const geo: ShapeGeo = {
    orgW: r.u32(b + 16),
    orgH: r.u32(b + 20),
    flipH: (flags & 1) !== 0,
    flipV: (flags & 2) !== 0,
    angle: r.u16(b + 36),
    cx: r.i32(b + 38),
    cy: r.i32(b + 42),
    trans: mat(b + 48),
    pairs: Array.from({ length: nMat }, (_, k) => [mat(b + 96 + k * 96), mat(b + 144 + k * 96)] as [number[], number[]]),
    groupLevel: r.u16(b + 12),
  };
  const after = b + 48 + 48 + nMat * 96;
  return { kind: SC_KIND.get(kid) ?? "unknown", x: r.i32(b + 4), y: r.i32(b + 8), orgW: geo.orgW, orgH: geo.orgH, curW: r.i32(b + 24), curH: r.i32(b + 28), after, r, geo };
}

function lineStyleAt(r: R, o: number): [LineStyle, number] {
  const c = color(r.u32(o));
  const w = r.i32(o + 4);
  const attr = r.u32(o + 8);
  // 선 종류는 테두리선과 같은 표(0 없음·1 실선…) — 원본 PDF에서 배지 테두리가 실선으로 찍힘
  return [{ color: c, width: w, type: BORDER_TYPE[attr & 0x3f] ?? "SOLID", attr, outline: r.u8(o + 12) }, o + 13];
}

function gso(ctx: Ctx, k: number, end: number): Obj | null {
  const level = ctx.recs[k].level;
  const pos = objPos(ctx.recs[k].data);
  let si = -1;
  for (let j = k + 1; j < end; j++)
    if (ctx.recs[j].tag === T_SHAPE_COMPONENT) {
      si = j;
      break;
    }
  if (si < 0) return null;
  return shapeAt(ctx, si, end, pos, level, false);
}

function shapeAt(ctx: Ctx, si: number, end: number, pos: ObjPos, ctrlLevel: number, nested: boolean): Obj | null {
  const sc = shapeComp(ctx.recs[si].data, nested);
  const scLevel = ctx.recs[si].level;
  let send = si + 1;
  while (send < end && ctx.recs[send].level > scLevel) send++;
  const find = (tag: number) => {
    for (let j = si + 1; j < send; j++) if (ctx.recs[j].tag === tag && ctx.recs[j].level === scLevel + 1) return ctx.recs[j].data;
    return null;
  };
  if (sc.kind === "pic") {
    const d = find(T_SC_PICTURE);
    const r = new R(d ?? Buffer.alloc(0));
    const pic: Pic = {
      kind: "pic",
      pos,
      orgW: sc.orgW,
      orgH: sc.orgH,
      curW: sc.curW,
      curH: sc.curH,
      borderColor: color(r.u32(0, 0xffffffff)),
      borderWidth: r.i32(4),
      crop: [r.i32(44), r.i32(48), r.i32(52), r.i32(56)],
      inMargin: [r.u16(60), r.u16(62), r.u16(64), r.u16(66)],
      bright: r.i8(68),
      contrast: r.i8(69),
      effect: IMG_EFFECT[r.u8(70)] ?? "REAL_PIC",
      bin: r.u16(71),
      imgRect: [0, 1, 2, 3].map((k) => [r.i32(12 + k * 8), r.i32(16 + k * 8)] as [number, number]),
      // 그림 효과 정보 뒤 원본 그림 크기(5.0.2.x 이후)
      ...(r.has(82, 8) ? { imgDim: [r.u32(82), r.u32(86)] as [number, number] } : {}),
      geo: sc.geo,
      ...(nested ? { x: sc.x, y: sc.y } : {}),
    };
    return pic;
  }
  const shape: Shape = { kind: sc.kind, pos, curW: sc.curW, curH: sc.curH, x: sc.x, y: sc.y, line: null, fill: null, round: 0, shadow: null, text: null, children: [], points: [], geo: sc.geo };
  if (sc.kind === "container") {
    for (let j = si + 1; j < send; j++) {
      const rec = ctx.recs[j];
      if (rec.tag !== T_SHAPE_COMPONENT || rec.level !== scLevel + 1) continue;
      const child = shapeAt(ctx, j, send, pos, ctrlLevel, true);
      if (child && child.kind !== "table") shape.children.push(child as Shape | Pic);
    }
    return shape;
  }
  // 선·채우기·그림자(그리기 개체 공통 속성)
  const r = sc.r;
  if (r.has(sc.after, 13)) {
    const [line, o] = lineStyleAt(r, sc.after);
    shape.line = line;
    const [fill, o2] = fillAt(r, o);
    shape.fill = fill;
    // 그림자: 종류(4)·색(4)·x(4)·y(4)·투명도(1)
    if (r.has(o2, 16)) shape.shadow = { type: r.u32(o2), color: color(r.u32(o2 + 4)), x: r.i32(o2 + 8), y: r.i32(o2 + 12), alpha: r.u8(o2 + 16) };
  }
  const rect = find(T_SC_RECTANGLE);
  if (rect) {
    shape.round = rect[0] ?? 0;
    // 네 모서리(x, y 차례로)
    if (rect.length >= 33) shape.corners = [0, 1, 2, 3].map((k) => [rect.readInt32LE(1 + k * 8), rect.readInt32LE(5 + k * 8)] as [number, number]);
  }
  const ln = find(T_SC_LINE);
  if (ln && ln.length >= 16) shape.points = [
    [ln.readInt32LE(0), ln.readInt32LE(4)],
    [ln.readInt32LE(8), ln.readInt32LE(12)],
  ];
  // 다각형·곡선: 점 수(4) + 점(x, y 4바이트씩) [+ 곡선은 조각 종류 1바이트씩]
  const curve = find(T_SC_CURVE);
  const poly = find(T_SC_POLYGON) ?? curve;
  if (poly && poly.length >= 4) {
    const n = Math.min(poly.readInt32LE(0), 4096);
    for (let q = 0; q < n && 4 + q * 8 + 8 <= poly.length; q++) shape.points.push([poly.readInt32LE(4 + q * 8), poly.readInt32LE(8 + q * 8)]);
    if (curve && n > 1) shape.segs = Array.from({ length: n - 1 }, (_, q) => (4 + n * 8 + q < curve.length ? curve[4 + n * 8 + q] : 0));
  }
  // 글상자: 개체 수준의 목록 머리 뒤 문단
  for (let j = si + 1; j < send; j++) {
    const rec = ctx.recs[j];
    if (rec.tag !== T_LIST_HEADER || rec.level !== scLevel + 1) continue;
    const c = new R(rec.data);
    const va = (c.u32(4) >>> 5) & 3;
    const [ps] = paras(ctx, j + 1, send, scLevel + 1, Math.max(1, c.u16(0)));
    const box: TextBox = { margin: [c.u16(8), c.u16(10), c.u16(12), c.u16(14)], vertAlign: (["TOP", "CENTER", "BOTTOM", "TOP"] as const)[va], paras: ps, lastWidth: c.u32(16) };
    shape.text = box;
    break;
  }
  return shape;
}

function inflate(raw: Buffer): Buffer {
  const out = inflateRawSync(raw, { maxOutputLength: MAX_STREAM });
  return out;
}

/** 구역의 머리말·꼬리말(첫 것 — 양쪽 적용이 흔함)과 쪽 번호 위치 */
function readHeadFoot(ctx: Ctx, sec: Section) {
  const recs = ctx.recs;
  for (let k = 0; k < recs.length; k++) {
    const rec = recs[k];
    if (rec.tag !== T_CTRL_HEADER || rec.data.length < 4) continue;
    const id = rec.data.readUInt32LE(0);
    if (id === C_PGNP && !sec.pageNum && rec.data.length >= 16) {
      const r = new R(rec.data);
      const prop = r.u32(4);
      const ch = (o: number) => (rec.data.length >= o + 2 && r.u16(o) ? String.fromCharCode(r.u16(o)) : "");
      let para = -1;
      for (let q = 0; q <= k; q++) if (recs[q].tag === T_PARA_HEADER && recs[q].level === 0) para++;
      sec.pageNum = { position: (prop >>> 8) & 0xf, format: prop & 0xff, prefix: ch(10), suffix: ch(12), dash: ch(14) || "-", charPr: 0, para };
      continue;
    }
    if (id !== C_HEAD && id !== C_FOOT) continue;
    if ((id === C_HEAD && sec.header) || (id === C_FOOT && sec.footer)) continue;
    let end = k + 1;
    while (end < recs.length && recs[end].level > rec.level) end++;
    for (let j = k + 1; j < end; j++) {
      if (recs[j].tag !== T_LIST_HEADER || recs[j].level !== rec.level + 1) continue;
      const c = new R(recs[j].data);
      const [ps] = paras(ctx, j + 1, end, rec.level + 1, Math.max(1, c.u16(0)));
      const hf = {
        applyTo: (["BOTH", "EVEN", "ODD", "BOTH"] as const)[new R(rec.data).u32(4) & 3],
        vertAlign: (["TOP", "CENTER", "BOTTOM", "TOP"] as const)[(c.u32(4) >>> 5) & 3],
        paras: ps,
      };
      if (id === C_HEAD) sec.header = hf;
      else sec.footer = hf;
      break;
    }
  }
}

/** HWP 5 바이트 → 모델 */
export function readHwp5(bytes: Uint8Array): HwpDoc {
  let cfb: CFB.CFB$Container;
  try {
    cfb = CFB.read(Buffer.from(bytes), { type: "buffer" });
  } catch {
    throw new HwpReadError("한글(HWP) 파일 구조를 읽지 못했습니다.");
  }
  const stream = (path: string): Buffer | null => {
    const e = CFB.find(cfb, path);
    return e?.content ? Buffer.from(e.content as Uint8Array) : null;
  };
  const header = stream("/FileHeader");
  if (!header || header.toString("latin1", 0, 17) !== "HWP Document File") throw new HwpReadError("한글(HWP) 파일이 아닙니다.");
  const flags = header.readUInt32LE(36);
  if (flags & 2) throw new HwpReadError("암호가 걸린 한글 파일은 읽지 못합니다. 암호를 푼 뒤 올려 주세요.");
  if (flags & 4) throw new HwpReadError("배포용 한글 파일은 읽지 못합니다. 일반 문서로 저장해 올려 주세요.");
  if (flags & 16) throw new HwpReadError("DRM이 걸린 한글 파일은 읽지 못합니다.");
  const compressed = (flags & 1) !== 0;
  const docInfoRaw = stream("/DocInfo");
  if (!docInfoRaw) throw new HwpReadError("한글 파일의 문서 정보(DocInfo)가 없습니다.");
  const info = readRecords(compressed ? inflate(docInfoRaw) : docInfoRaw);

  // 글꼴: 언어별 개수는 ID_MAPPINGS[1..7]
  const idm = info.find((r) => r.tag === T_ID_MAPPINGS);
  const counts = idm ? Array.from({ length: Math.floor(idm.data.length / 4) }, (_, i) => idm.data.readInt32LE(i * 4)) : [];
  const faceRecs = info.filter((r) => r.tag === T_FACE_NAME).map((r) => faceName(r.data));
  const faceNames = faceRecs.map((f) => f.name);
  const faces: string[][] = [];
  let fo = 0;
  for (let l = 0; l < 7; l++) {
    const n = counts[1 + l] ?? 0;
    faces.push(faceNames.slice(fo, fo + n));
    fo += n;
  }
  const faceInfo: HwpDoc["faces"] = {};
  for (const f of faceRecs) if (!faceInfo[f.name] || (!faceInfo[f.name].defaultName && f.defaultName)) faceInfo[f.name] = { defaultName: f.defaultName, alt: f.alt };
  const doc: HwpDoc = { format: "hwp", faces: faceInfo, charPrs: [], paraPrs: [], borderFills: [null], tabDefs: [], bullets: [], numberings: [], bins: new Map(), sections: [] };
  const binDefs: { id: number; ext: string; compress: number }[] = [];
  for (const rec of info) {
    if (rec.tag === T_CHAR_SHAPE) doc.charPrs.push(charShape(rec.data, faces));
    else if (rec.tag === T_PARA_SHAPE) doc.paraPrs.push(paraShape(rec.data));
    else if (rec.tag === T_TAB_DEF) doc.tabDefs.push(tabDef(rec.data));
    else if (rec.tag === T_BULLET) doc.bullets.push(bullet(rec.data));
    else if (rec.tag === T_NUMBERING) doc.numberings.push(numbering(rec.data));
    else if (rec.tag === T_BORDER_FILL) {
      const r = new R(rec.data);
      const [fill] = fillAt(r, 32);
      const bf: BorderFill = { left: border(r, 2), right: border(r, 8), top: border(r, 14), bottom: border(r, 20), diagonal: border(r, 26), fill };
      doc.borderFills.push(bf);
    } else if (rec.tag === T_BIN_DATA) {
      const r = new R(rec.data);
      const attr = r.u16(0);
      const type = attr & 0xf;
      if (type === 1 || type === 2) binDefs.push({ id: r.u16(2), ext: r.str(4)[0].toLowerCase(), compress: (attr >>> 4) & 3 });
    }
  }
  for (const b of binDefs) {
    const name = `/BinData/BIN${b.id.toString(16).toUpperCase().padStart(4, "0")}.${b.ext}`;
    const raw = stream(name);
    let data: Uint8Array | null = raw;
    if (raw && (b.compress === 1 || (b.compress === 0 && compressed))) {
      try {
        data = inflate(raw);
      } catch {
        data = raw;
      }
    }
    const item: BinItem = { id: b.id, ext: b.ext, data };
    doc.bins.set(b.id, item);
  }

  for (let s = 0; ; s++) {
    const raw = stream(`/BodyText/Section${s}`);
    if (!raw) break;
    const recs = readRecords(compressed ? inflate(raw) : raw);
    const ctx: Ctx = { recs };
    const [ps] = paras(ctx, 0, recs.length, 0);
    const sec: Section = { page: null, paras: ps };
    // 구역 정의(쪽 크기·여백): 첫 문단의 secd 조종
    for (let k = 0; k < recs.length; k++)
      if (recs[k].tag === T_PAGE_DEF) {
        const r = new R(recs[k].data);
        sec.page = { width: r.u32(0), height: r.u32(4), left: r.u32(8), right: r.u32(12), top: r.u32(16), bottom: r.u32(20), header: r.u32(24), footer: r.u32(28), gutter: r.u32(32), landscape: (r.u32(36) & 1) !== 0 };
        break;
      }
    readHeadFoot(ctx, sec);
    doc.sections.push(sec);
  }
  if (!doc.sections.length) throw new HwpReadError("한글 파일에 본문이 없습니다.");
  resolveHeads(doc);
  return doc;
}

export type { Inline };
