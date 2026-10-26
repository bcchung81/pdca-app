// 한글 HWPX(OWPML) → 공통 모델(model.ts). hwp5.ts와 같은 모양으로 읽어, 원본 그대로 HTML·카드 배치·HWPX 다시 쓰기가 같은 길을 씁니다.
//  · Contents/header.xml: 글꼴(언어 7종)·테두리/배경·글자 모양·탭·번호·글머리표·문단 모양
//  · Contents/section*.xml: 문단 → 글자 조각·표·그림·도형·글자 겹침·줄 배치. 글자 위치(pos)는 한글 셈(조종 문자 8칸)으로 매겨 줄 배치와 맞춤
//  · 여백·들여쓰기·탭 위치: hp:switch가 있으면 HWPUNIT 값(hp:case HwpUnitChar), 없으면 적힌 값
// 입출력은 부르는 쪽이 합니다(바이트 → 모델). 판단 없이 파일 값만 옮깁니다.

import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import {
  type Align,
  type BinItem,
  type Border,
  type BorderFill,
  type Bullet,
  type Cell,
  type CellZone,
  type CharPr,
  type Fill,
  type HeadFoot,
  type HwpDoc,
  HwpReadError,
  LANGS,
  type LineSeg,
  type LineStyle,
  type LineType,
  type Numbering,
  type ObjPos,
  type PageDef,
  type PageNumPos,
  type Para,
  type ParaHead,
  type ParaPr,
  type Pic,
  resolveHeads,
  type Shape,
  type ShapeGeo,
  type Table,
  type TabDef,
} from "./model.ts";
import type { LooseJson } from "../loose-json.ts";

type El = LooseJson;

const kids = (el: El, name?: string): El[] => {
  const out: El[] = [];
  for (let n = el?.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!name || local(n) === name)) out.push(n);
  return out;
};
const local = (el: El): string => el.localName ?? String(el.tagName ?? "").replace(/^[^:]+:/, "");
const kid = (el: El, name: string): El | null => kids(el, name)[0] ?? null;
const attr = (el: El, name: string): string | null => (el?.hasAttribute?.(name) ? el.getAttribute(name) : null);
/** 부호 없는 32비트로 적힌 음수도 되돌림 */
const num = (el: El, name: string, dflt = 0): number => {
  const v = attr(el, name);
  if (v === null || v === "") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return n > 2147483647 && n <= 4294967295 ? n - 4294967296 : n;
};
const flag = (el: El, name: string) => {
  const v = attr(el, name);
  return v === "1" || v === "true";
};
const colorOf = (v: string | null): string | null => (v && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null);
/** hp:switch가 있으면 HwpUnitChar 쪽(HWPUNIT), 없으면 그 자리 요소 */
function unitChild(el: El, name: string): El | null {
  const sw = kid(el, "switch");
  if (sw) {
    const c = kids(sw, "case").find((x) => /HwpUnitChar/.test(attr(x, "hp:required-namespace") ?? attr(x, "required-namespace") ?? ""));
    const fromCase = c ? kid(c, name) : null;
    if (fromCase) return fromCase;
    const d = kid(sw, "default");
    if (d && kid(d, name)) return kid(d, name);
  }
  return kid(el, name);
}
/** switch 없이 hp:default에서만 읽은 값은 2배 값(예전 단위) */
function unitScale(el: El, name: string): number {
  const sw = kid(el, "switch");
  if (!sw) return 1;
  const c = kids(sw, "case").find((x) => /HwpUnitChar/.test(attr(x, "hp:required-namespace") ?? attr(x, "required-namespace") ?? ""));
  return c && kid(c, name) ? 1 : 0.5;
}

const LINE_TYPES: LineType[] = ["NONE", "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM", "WAVE", "DOUBLE_WAVE", "THICK_3D", "THICK_3D_LIFTED", "3D", "3D_LIFTED"];
const lineType = (v: string | null): LineType => (LINE_TYPES.includes(v as LineType) ? (v as LineType) : v ? "SOLID" : "NONE");
const NUM_FORMATS = ["DIGIT", "CIRCLED_DIGIT", "ROMAN_CAPITAL", "ROMAN_SMALL", "LATIN_CAPITAL", "LATIN_SMALL", "CIRCLED_LATIN_CAPITAL", "CIRCLED_LATIN_SMALL", "HANGUL_SYLLABLE", "CIRCLED_HANGUL_SYLLABLE", "HANGUL_JAMO", "CIRCLED_HANGUL_JAMO", "HANGUL_PHONETIC", "IDEOGRAPH", "CIRCLED_IDEOGRAPH", "DECAGON_CIRCLE", "DECAGON_CIRCLE_HANJA"];
const HATCHES = ["HORIZONTAL", "VERTICAL", "BACK_SLASH", "SLASH", "CROSS", "CROSS_DIAGONAL"];
const GRAD_TYPES = ["", "LINEAR", "RADIAL", "CONICAL", "SQUARE"];
const COMPOSE_CIRCLES = ["CHAR", "SHAPE_CIRCLE", "SHAPE_REVERSAL_CIRCLE", "SHAPE_RECTANGLE", "SHAPE_REVERSAL_RECTANGLE", "SHAPE_TRIANGLE", "SHAPE_REVERSAL_TIRANGLE", "SHAPE_LIGHT", "SHAPE_RHOMBUS", "SHAPE_REVERSAL_RHOMBUS", "SHAPE_ROUNDED_RECTANGLE", "SHAPE_EMPTY_CIRCULATE_TRIANGLE", "SHAPE_THIN_CIRCULATE_TRIANGLE", "SHAPE_THICK_CIRCULATE_TRIANGLE"];
const ARROWS = ["NORMAL", "ARROW", "SPEAR", "CONCAVE_ARROW", "EMPTY_DIAMOND", "EMPTY_CIRCLE", "EMPTY_BOX", "FILLED_DIAMOND", "FILLED_CIRCLE", "FILLED_BOX"];
const ARROW_SIZES = ["SMALL_SMALL", "SMALL_MEDIUM", "SMALL_LARGE", "MEDIUM_SMALL", "MEDIUM_MEDIUM", "MEDIUM_LARGE", "LARGE_SMALL", "LARGE_MEDIUM", "LARGE_LARGE"];
const SHADOWS = ["NONE", "PARELLEL_LEFTTOP", "PARELLEL_RIGHTTOP", "PARELLEL_LEFTBOTTOM", "PARELLEL_RIGHTBOTTOM", "SHEAR_LEFTTOP", "SHEAR_RIGHTTOP", "SHEAR_LEFTBOTTOM", "SHEAR_RIGHTBOTTOM", "SHEAR_LEFT_TOP", "SMALLER", "LARGER"];
const SYM_MARKS = ["NONE", "DOT_ABOVE", "RING_ABOVE", "TILDE", "CARON", "SIDE", "COLON", "GRAVE_ACCENT", "ACUTE_ACCENT", "CIRCUMFLEX", "MACRON", "HOOK_ABOVE", "DOT_BELOW"];
const OUTLINES = ["NONE", "SOLID", "DOT", "THICK", "DASH", "DASH_DOT", "DASH_DOT_DOT"];
const idx = (list: string[], v: string | null, dflt = 0) => {
  const i = v ? list.indexOf(v) : -1;
  return i >= 0 ? i : dflt;
};

// ───────────────────────── 머리

function borderOf(el: El | null): Border {
  const w = parseFloat(attr(el, "width") ?? "0.12");
  return { type: lineType(attr(el, "type")), width: Number.isFinite(w) ? w : 0.12, color: colorOf(attr(el, "color")) ?? "#000000" };
}

function fillOf(brush: El | null, binId: (ref: string) => number): Fill | null {
  if (!brush) return null;
  const f: Fill = { color: null, patternColor: null, pattern: -1, image: null, gradation: null };
  const win = kid(brush, "winBrush");
  if (win) {
    f.color = colorOf(attr(win, "faceColor"));
    f.patternColor = colorOf(attr(win, "hatchColor"));
    f.pattern = attr(win, "hatchStyle") ? idx(HATCHES, attr(win, "hatchStyle"), -1) : -1;
    f.alpha = num(win, "alpha");
  }
  const g = kid(brush, "gradation");
  if (g) {
    f.gradation = {
      type: Math.max(1, idx(GRAD_TYPES, attr(g, "type"), 1)),
      angle: num(g, "angle"),
      cx: num(g, "centerX"),
      cy: num(g, "centerY"),
      step: num(g, "step", 255),
      stepCenter: num(g, "stepCenter", 50),
      colors: kids(g, "color").map((c) => colorOf(attr(c, "value")) ?? "#FFFFFF"),
    };
    f.alpha = num(g, "alpha");
  }
  const ib = kid(brush, "imgBrush");
  if (ib) {
    const img = kid(ib, "img");
    f.image = { mode: attr(ib, "mode") ?? "TOTAL", bin: binId(attr(img, "binaryItemIDRef") ?? ""), bright: num(img, "bright"), contrast: num(img, "contrast"), effect: attr(img, "effect") ?? "REAL_PIC" };
    f.alpha = num(img, "alpha");
  }
  return win || g || ib ? f : null;
}

const langVals = (el: El | null, dflt: number) => LANGS.map((l) => (el ? num(el, l, dflt) : dflt));

function charPrOf(el: El, faces: string[][], fillIds: Map<string, number>): CharPr {
  const fr = kid(el, "fontRef");
  const ul = kid(el, "underline");
  const st = kid(el, "strikeout");
  const sh = kid(el, "shadow");
  const ol = kid(el, "outline");
  const ulType = attr(ul, "type");
  const stShape = attr(st, "shape");
  const shType = attr(sh, "type");
  const olType = attr(ol, "type");
  // 속성 원값(쓰기에서 모양 이름을 되찾는 데 씀): 밑줄 모양 4~7, 외곽선 8~10, 강조점 21~24, 취소선 모양 26~29
  const strokeIdx = (v: string | null) => Math.max(0, LINE_TYPES.indexOf(lineType(v)) - 1);
  const a = (strokeIdx(attr(ul, "shape")) << 4) | (idx(OUTLINES, olType) << 8) | (idx(SYM_MARKS, attr(el, "symMark")) << 21) | (strokeIdx(stShape) << 26);
  return {
    height: num(el, "height", 1000),
    face: LANGS.map((l, i) => faces[i]?.[num(fr, l)] ?? faces[0]?.[0] ?? ""),
    ratio: langVals(kid(el, "ratio"), 100),
    spacing: langVals(kid(el, "spacing"), 0),
    relSize: langVals(kid(el, "relSz"), 100),
    offset: langVals(kid(el, "offset"), 0),
    bold: Boolean(kid(el, "bold")),
    italic: Boolean(kid(el, "italic")),
    underline: ulType === "BOTTOM" ? "BOTTOM" : ulType === "TOP" ? "TOP" : "",
    underlineColor: colorOf(attr(ul, "color")),
    strike: Boolean(stShape && stShape !== "NONE"),
    strikeColor: colorOf(attr(st, "color")),
    supscript: Boolean(kid(el, "supscript")),
    subscript: Boolean(kid(el, "subscript")),
    outline: Boolean(olType && olType !== "NONE"),
    shadow: shType && shType !== "NONE" ? shType : "",
    shadowColor: colorOf(attr(sh, "color")),
    shadowX: num(sh, "offsetX"),
    shadowY: num(sh, "offsetY"),
    emboss: Boolean(kid(el, "emboss")),
    engrave: Boolean(kid(el, "engrave")),
    color: colorOf(attr(el, "textColor")) ?? "#000000",
    shade: colorOf(attr(el, "shadeColor")),
    kerning: flag(el, "useKerning"),
    useFontSpace: flag(el, "useFontSpace"),
    borderFill: fillIds.get(attr(el, "borderFillIDRef") ?? "") ?? 0,
    attr: a >>> 0,
  };
}

function paraPrOf(el: El, fillIds: Map<string, number>, tabIds: Map<string, number>): ParaPr {
  const al = kid(el, "align");
  const hd = kid(el, "heading");
  const bs = kid(el, "breakSetting");
  const as = kid(el, "autoSpacing");
  const bd = kid(el, "border");
  const mg = unitChild(el, "margin");
  const k = unitScale(el, "margin");
  const ls = unitChild(el, "lineSpacing");
  const m = (name: string) => (mg ? num(kid(mg, name), "value") * k : 0);
  const lsType = (attr(ls, "type") ?? "PERCENT") as ParaPr["lineSpacingType"];
  return {
    align: (attr(al, "horizontal") ?? "JUSTIFY") as Align,
    breakLatin: (attr(bs, "breakLatinWord") ?? "KEEP_WORD") as ParaPr["breakLatin"],
    breakNonLatin: (attr(bs, "breakNonLatinWord") ?? "KEEP_WORD") as ParaPr["breakNonLatin"],
    condense: num(el, "condense"),
    lineSpacingType: ["PERCENT", "FIXED", "BETWEEN_LINES", "AT_LEAST"].includes(lsType) ? lsType : "PERCENT",
    lineSpacing: lsType === "PERCENT" || !ls ? num(ls, "value", 160) : num(ls, "value") * k,
    left: m("left"),
    right: m("right"),
    indent: m("intent"),
    before: m("prev"),
    after: m("next"),
    vertAlign: (attr(al, "vertical") ?? "BASELINE") as ParaPr["vertAlign"],
    snapToGrid: flag(el, "snapToGrid"),
    fontLineHeight: flag(el, "fontLineHeight"),
    keepWithNext: flag(bs, "keepWithNext"),
    borderFill: fillIds.get(attr(bd, "borderFillIDRef") ?? "") ?? 0,
    borderOffset: [num(bd, "offsetLeft"), num(bd, "offsetRight"), num(bd, "offsetTop"), num(bd, "offsetBottom")],
    tabDef: tabIds.get(attr(el, "tabPrIDRef") ?? "") ?? 0,
    headingType: (attr(hd, "type") ?? "NONE") as ParaPr["headingType"],
    headingId: num(hd, "idRef"),
    headingLevel: num(hd, "level"),
    autoSpaceEAsianEng: flag(as, "eAsianEng"),
    autoSpaceEAsianNum: flag(as, "eAsianNum"),
  };
}

function paraHeadOf(el: El, charIds: Map<string, number>): ParaHead {
  const cp = attr(el, "charPrIDRef");
  return {
    align: (attr(el, "align") ?? "LEFT") as ParaHead["align"],
    instWidth: flag(el, "useInstWidth"),
    autoIndent: flag(el, "autoIndent"),
    widthAdjust: num(el, "widthAdjust"),
    textOffset: num(el, "textOffset"),
    textOffsetPercent: (attr(el, "textOffsetType") ?? "PERCENT") === "PERCENT",
    numFormat: idx(NUM_FORMATS, attr(el, "numFormat")),
    charPr: cp && charIds.has(cp) ? charIds.get(cp)! : -1,
  };
}

interface HeadCtx {
  doc: HwpDoc;
  fontIds: string[][];
  fillIds: Map<string, number>;
  charIds: Map<string, number>;
  paraIds: Map<string, number>;
  bulletIds: Map<string, number>;
  numberingIds: Map<string, number>;
}

function readHeader(xml: string, doc: HwpDoc, binId: (ref: string) => number): HeadCtx {
  const root = parseXml(xml, "Contents/header.xml");
  const ref = kid(root, "refList") ?? root;
  const fontIds: string[][] = LANGS.map(() => []);
  const faceSets = kid(ref, "fontfaces");
  for (const ff of kids(faceSets, "fontface")) {
    const li = LANGS.findIndex((l) => l.toUpperCase() === (attr(ff, "lang") ?? "").toUpperCase());
    if (li < 0) continue;
    for (const f of kids(ff, "font")) {
      const face = attr(f, "face") ?? "";
      fontIds[li][num(f, "id")] = face;
      const sub = kid(f, "substFont");
      if (face && !doc.faces[face]) doc.faces[face] = { defaultName: null, alt: sub ? attr(sub, "face") : null };
    }
  }
  const fillIds = new Map<string, number>();
  for (const bf of kids(kid(ref, "borderFills"), "borderFill")) {
    const v: BorderFill = {
      left: borderOf(kid(bf, "leftBorder")),
      right: borderOf(kid(bf, "rightBorder")),
      top: borderOf(kid(bf, "topBorder")),
      bottom: borderOf(kid(bf, "bottomBorder")),
      diagonal: borderOf(kid(bf, "diagonal")),
      fill: fillOf(kid(bf, "fillBrush"), binId),
    };
    fillIds.set(attr(bf, "id") ?? "", doc.borderFills.length);
    doc.borderFills.push(v);
  }
  const charIds = new Map<string, number>();
  const charEls = kids(kid(ref, "charProperties"), "charPr");
  charEls.forEach((c, i) => charIds.set(attr(c, "id") ?? String(i), i));
  for (const c of charEls) doc.charPrs.push(charPrOf(c, fontIds, fillIds));
  const tabIds = new Map<string, number>();
  for (const t of kids(kid(ref, "tabProperties"), "tabPr")) {
    const items = (() => {
      const sw = kid(t, "switch");
      if (!sw) return kids(t, "tabItem").map((x) => [x, 1] as const);
      const c = kids(sw, "case").find((x) => /HwpUnitChar/.test(attr(x, "hp:required-namespace") ?? attr(x, "required-namespace") ?? ""));
      if (c) return kids(c, "tabItem").map((x) => [x, 1] as const);
      return kids(kid(sw, "default"), "tabItem").map((x) => [x, 0.5] as const);
    })();
    const def: TabDef = {
      autoLeft: flag(t, "autoTabLeft"),
      autoRight: flag(t, "autoTabRight"),
      stops: items.map(([x, k]) => ({ pos: num(x, "pos") * k, kind: (attr(x, "type") ?? "LEFT") as TabDef["stops"][number]["kind"], leader: idx(LINE_TYPES, attr(x, "leader")) })),
    };
    tabIds.set(attr(t, "id") ?? "", doc.tabDefs.length);
    doc.tabDefs.push(def);
  }
  const numberingIds = new Map<string, number>();
  for (const n of kids(kid(ref, "numberings"), "numbering")) {
    const heads = kids(n, "paraHead").sort((a, c) => num(a, "level") - num(c, "level"));
    const nb: Numbering = { levels: heads.map((h) => ({ head: paraHeadOf(h, charIds), format: h.textContent ?? "" })), start: Math.max(1, num(heads[0], "start", 1)), starts: heads.map((h) => Math.max(1, num(h, "start", 1))) };
    doc.numberings.push(nb);
    numberingIds.set(attr(n, "id") ?? "", doc.numberings.length);
  }
  const bulletIds = new Map<string, number>();
  for (const b of kids(kid(ref, "bullets"), "bullet")) {
    const h = kid(b, "paraHead");
    const bu: Bullet = { head: h ? paraHeadOf(h, charIds) : { align: "LEFT", instWidth: false, autoIndent: true, widthAdjust: 0, textOffset: 50, textOffsetPercent: true, numFormat: 0, charPr: -1 }, char: attr(b, "char") ?? "●" };
    doc.bullets.push(bu);
    bulletIds.set(attr(b, "id") ?? "", doc.bullets.length);
  }
  const paraIds = new Map<string, number>();
  const paraEls = kids(kid(ref, "paraProperties"), "paraPr");
  paraEls.forEach((p, i) => paraIds.set(attr(p, "id") ?? String(i), i));
  for (const p of paraEls) {
    const pp = paraPrOf(p, fillIds, tabIds);
    const hid = String(pp.headingId);
    if (pp.headingType === "BULLET") pp.headingId = bulletIds.get(hid) ?? pp.headingId;
    else if (pp.headingType === "NUMBER") pp.headingId = numberingIds.get(hid) ?? pp.headingId;
    doc.paraPrs.push(pp);
  }
  return { doc, fontIds, fillIds, charIds, paraIds, bulletIds, numberingIds };
}

// ───────────────────────── 본문

interface SecCtx {
  head: HeadCtx;
  binId: (ref: string) => number;
  page: PageDef | null;
  outline: number;
  /** 구역의 머리말·꼬리말·쪽 번호 위치(첫 것) — 쪽 보기 */
  header?: HeadFoot;
  footer?: HeadFoot;
  pageNum?: PageNumPos;
  /** 지금 읽는 최상위 문단 번호(쪽 번호 위치가 든 문단) */
  paraIndex?: number;
}

const PAGE_NUM_POS = ["NONE", "TOP_LEFT", "TOP_CENTER", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_CENTER", "BOTTOM_RIGHT", "OUTSIDE_TOP", "OUTSIDE_BOTTOM", "INSIDE_TOP", "INSIDE_BOTTOM"];

const WRAPS = ["SQUARE", "TOP_AND_BOTTOM", "BEHIND_TEXT", "IN_FRONT_OF_TEXT"];
function objPosOf(el: El): ObjPos {
  const sz = kid(el, "sz");
  const pos = kid(el, "pos");
  const om = kid(el, "outMargin");
  const comment = kid(el, "shapeComment");
  return {
    treatAsChar: flag(pos, "treatAsChar"),
    affectLineSpacing: flag(pos, "affectLSpacing"),
    vertRelTo: (attr(pos, "vertRelTo") ?? "PARA") as ObjPos["vertRelTo"],
    horzRelTo: (attr(pos, "horzRelTo") ?? "PARA") as ObjPos["horzRelTo"],
    vertAlign: (attr(pos, "vertAlign") ?? "TOP") as ObjPos["vertAlign"],
    horzAlign: (attr(pos, "horzAlign") ?? "LEFT") as ObjPos["horzAlign"],
    vertOffset: num(pos, "vertOffset"),
    horzOffset: num(pos, "horzOffset"),
    width: num(sz, "width"),
    height: num(sz, "height"),
    wrap: (WRAPS.includes(attr(el, "textWrap") ?? "") ? attr(el, "textWrap") : "TOP_AND_BOTTOM") as ObjPos["wrap"],
    zOrder: num(el, "zOrder"),
    outMargin: [num(om, "left"), num(om, "right"), num(om, "top"), num(om, "bottom")],
    flowWithText: flag(pos, "flowWithText"),
    allowOverlap: flag(pos, "allowOverlap"),
    widthRelTo: (attr(sz, "widthRelTo") ?? "ABSOLUTE") as ObjPos["widthRelTo"],
    heightRelTo: (attr(sz, "heightRelTo") ?? "ABSOLUTE") as ObjPos["heightRelTo"],
    protect: flag(sz, "protect"),
    textFlow: (attr(el, "textFlow") ?? "BOTH_SIDES") as ObjPos["textFlow"],
    numberingType: (attr(el, "numberingType") ?? "NONE") as ObjPos["numberingType"],
    comment: comment?.textContent ?? "",
  };
}

function margin4(el: El | null): [number, number, number, number] {
  return [num(el, "left"), num(el, "right"), num(el, "top"), num(el, "bottom")];
}

function tableOf(ctx: SecCtx, el: El): Table {
  const t: Table = {
    kind: "table",
    pos: objPosOf(el),
    rows: num(el, "rowCnt"),
    cols: num(el, "colCnt"),
    cellSpacing: num(el, "cellSpacing"),
    inMargin: margin4(kid(el, "inMargin")),
    borderFill: ctx.head.fillIds.get(attr(el, "borderFillIDRef") ?? "") ?? 0,
    pageBreak: (attr(el, "pageBreak") ?? "CELL") as Table["pageBreak"],
    repeatHeader: flag(el, "repeatHeader"),
    cells: [],
  };
  const zones: CellZone[] = kids(kid(el, "cellzoneList"), "cellzone").map((z) => ({ r0: num(z, "startRowAddr"), c0: num(z, "startColAddr"), r1: num(z, "endRowAddr"), c1: num(z, "endColAddr"), borderFill: ctx.head.fillIds.get(attr(z, "borderFillIDRef") ?? "") ?? 0 }));
  if (zones.length) t.zones = zones;
  for (const tr of kids(el, "tr"))
    for (const tc of kids(tr, "tc")) {
      const addr = kid(tc, "cellAddr");
      const span = kid(tc, "cellSpan");
      const sz = kid(tc, "cellSz");
      const sub = kid(tc, "subList");
      const own = flag(tc, "hasMargin");
      const c: Cell = {
        row: num(addr, "rowAddr"),
        col: num(addr, "colAddr"),
        rowSpan: Math.max(1, num(span, "rowSpan", 1)),
        colSpan: Math.max(1, num(span, "colSpan", 1)),
        width: num(sz, "width"),
        height: num(sz, "height"),
        margin: own ? margin4(kid(tc, "cellMargin")) : [...t.inMargin],
        ownMargin: own,
        borderFill: ctx.head.fillIds.get(attr(tc, "borderFillIDRef") ?? "") ?? 0,
        vertAlign: (attr(sub, "vertAlign") ?? "TOP") as Cell["vertAlign"],
        paras: kids(sub, "p").map((p) => paraOf(ctx, p)),
        ...(flag(tc, "header") ? { header: true } : {}),
        ...(flag(tc, "protect") ? { protect: true } : {}),
      };
      t.cells.push(c);
    }
  return t;
}

const mat6 = (el: El | null): number[] => (el ? ["e1", "e2", "e3", "e4", "e5", "e6"].map((k) => Number(attr(el, k) ?? 0)) : [1, 0, 0, 0, 1, 0]);

function geoOf(el: El): ShapeGeo {
  const org = kid(el, "orgSz");
  const flip = kid(el, "flip");
  const rot = kid(el, "rotationInfo");
  const ri = kid(el, "renderingInfo");
  const ms = kids(ri);
  const pairs: [number[], number[]][] = [];
  for (let i = 0; i < ms.length; i++)
    if (local(ms[i]) === "scaMatrix") {
      const r = ms[i + 1] && local(ms[i + 1]) === "rotMatrix" ? ms[i + 1] : null;
      pairs.push([mat6(ms[i]), mat6(r)]);
    }
  return {
    orgW: num(org, "width"),
    orgH: num(org, "height"),
    flipH: flag(flip, "horizontal"),
    flipV: flag(flip, "vertical"),
    angle: num(rot, "angle"),
    cx: num(rot, "centerX"),
    cy: num(rot, "centerY"),
    trans: mat6(kid(ri, "transMatrix")),
    pairs,
    groupLevel: num(el, "groupLevel"),
  };
}

function lineStyleOf(el: El | null): LineStyle | null {
  if (!el) return null;
  const type = lineType(attr(el, "style"));
  // 속성 원값: 선 종류 0~5 · 끝 모양 6~9 · 화살표 10~15·16~21 · 크기 22~25·26~29 · 채움 30·31
  const a =
    (LINE_TYPES.indexOf(type) & 63) |
    ((attr(el, "endCap") === "FLAT" ? 1 : 0) << 6) |
    (idx(ARROWS, attr(el, "headStyle")) << 10) |
    (idx(ARROWS, attr(el, "tailStyle")) << 16) |
    (idx(ARROW_SIZES, attr(el, "headSz")) << 22) |
    (idx(ARROW_SIZES, attr(el, "tailSz")) << 26) |
    ((flag(el, "headfill") ? 1 : 0) << 30) |
    ((flag(el, "tailfill") ? 1 : 0) << 31);
  return { color: colorOf(attr(el, "color")), width: num(el, "width"), type, attr: a >>> 0, outline: idx(["NORMAL", "OUTER", "INNER"], attr(el, "outlineStyle")) };
}

const pt = (el: El | null): [number, number] => [num(el, "x"), num(el, "y")];

function picOf(ctx: SecCtx, el: El, parentPos: ObjPos | null): Pic {
  const cur = kid(el, "curSz");
  const img = kid(el, "img");
  const clip = kid(el, "imgClip");
  const rect = kid(el, "imgRect");
  const dim = kid(el, "imgDim");
  const off = kid(el, "offset");
  const line = kid(el, "lineShape");
  const g = geoOf(el);
  const nested = g.groupLevel > 0;
  return {
    kind: "pic",
    pos: nested && parentPos ? parentPos : objPosOf(el),
    orgW: g.orgW,
    orgH: g.orgH,
    curW: num(cur, "width"),
    curH: num(cur, "height"),
    crop: [num(clip, "left"), num(clip, "top"), num(clip, "right"), num(clip, "bottom")],
    inMargin: margin4(kid(el, "inMargin")),
    bin: ctx.binId(attr(img, "binaryItemIDRef") ?? ""),
    borderColor: colorOf(attr(line, "color")),
    borderWidth: line && attr(line, "style") !== "NONE" ? num(line, "width") : 0,
    bright: num(img, "bright"),
    contrast: num(img, "contrast"),
    effect: attr(img, "effect") ?? "REAL_PIC",
    ...(rect ? { imgRect: [0, 1, 2, 3].map((i) => pt(kid(rect, `pt${i}`))) } : {}),
    ...(dim ? { imgDim: [num(dim, "dimwidth"), num(dim, "dimheight")] as [number, number] } : {}),
    geo: g,
    ...(nested ? { x: num(off, "x"), y: num(off, "y") } : {}),
  };
}

const SHAPE_TAGS = new Set(["rect", "ellipse", "line", "polygon", "curve", "arc", "container"]);

function shapeOf(ctx: SecCtx, el: El, parentPos: ObjPos | null): Shape {
  const tag = local(el) as Shape["kind"];
  const g = geoOf(el);
  const nested = g.groupLevel > 0;
  const cur = kid(el, "curSz");
  const off = kid(el, "offset");
  const pos = nested && parentPos ? parentPos : objPosOf(el);
  const s: Shape = { kind: tag, pos, curW: num(cur, "width"), curH: num(cur, "height"), x: num(off, "x"), y: num(off, "y"), line: null, fill: null, round: 0, shadow: null, text: null, children: [], points: [], geo: g };
  if (tag === "container") {
    for (const c of kids(el)) {
      const t = local(c);
      if (t === "pic") s.children.push(picOf(ctx, c, pos));
      else if (SHAPE_TAGS.has(t)) s.children.push(shapeOf(ctx, c, pos));
    }
    return s;
  }
  s.line = lineStyleOf(kid(el, "lineShape"));
  s.fill = fillOf(kid(el, "fillBrush"), ctx.binId);
  const sh = kid(el, "shadow");
  if (sh) s.shadow = { type: idx(SHADOWS, attr(sh, "type")), color: colorOf(attr(sh, "color")), x: num(sh, "offsetX"), y: num(sh, "offsetY"), alpha: num(sh, "alpha") };
  const dt = kid(el, "drawText");
  if (dt) {
    const sub = kid(dt, "subList");
    s.text = { margin: margin4(kid(dt, "textMargin")), vertAlign: (attr(sub, "vertAlign") ?? "TOP") as "TOP" | "CENTER" | "BOTTOM", paras: kids(sub, "p").map((p) => paraOf(ctx, p)), lastWidth: num(dt, "lastWidth") };
  }
  if (tag === "rect") {
    s.round = num(el, "ratio");
    const cs = [0, 1, 2, 3].map((i) => kid(el, `pt${i}`));
    if (cs.every(Boolean)) s.corners = cs.map(pt);
  } else if (tag === "polygon") s.points = kids(el, "pt").map(pt);
  else if (tag === "line") s.points = [pt(kid(el, "startPt")), pt(kid(el, "endPt"))];
  else if (tag === "curve") {
    const segs = kids(el, "seg");
    s.points = segs.length ? [[num(segs[0], "x1"), num(segs[0], "y1")], ...segs.map((x) => [num(x, "x2"), num(x, "y2")] as [number, number])] : [];
    s.segs = segs.map((x) => (attr(x, "type") === "CURVE" ? 1 : 0));
  }
  return s;
}

/** 문단: 글자 위치는 한글 셈(글자 1칸, 조종 문자·개체 8칸) */
function paraOf(ctx: SecCtx, el: El): Para {
  const p: Para = {
    paraPr: ctx.head.paraIds.get(attr(el, "paraPrIDRef") ?? "") ?? 0,
    style: num(el, "styleIDRef"),
    items: [],
    lines: [],
    length: 0,
    pageBreak: flag(el, "pageBreak") || flag(el, "columnBreak"),
  };
  let pos = 0;
  let lastCp = 0;
  const text = (s: string, cp: number) => {
    if (!s) return;
    const prev = p.items[p.items.length - 1];
    if (prev && prev.kind === "text" && prev.charPr === cp && prev.pos + prev.text.length === pos) prev.text += s;
    else p.items.push({ kind: "text", pos, charPr: cp, text: s });
    pos += s.length;
  };
  for (const run of kids(el, "run")) {
    const cp = ctx.head.charIds.get(attr(run, "charPrIDRef") ?? "") ?? 0;
    lastCp = cp;
    for (const c of kids(run)) {
      const t = local(c);
      if (t === "t") {
        for (let n = c.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === 3 || n.nodeType === 4) text(String(n.nodeValue ?? "").replace(/\r?\n/g, ""), cp);
          else if (n.nodeType === 1) {
            const tt = local(n);
            if (tt === "lineBreak") {
              p.items.push({ kind: "br", pos, charPr: cp });
              pos += 1;
            } else if (tt === "tab") {
              p.items.push({ kind: "tab", pos, charPr: cp, width: num(n, "width"), leader: num(n, "leader"), tabKind: num(n, "type") });
              pos += 8;
            } else if (tt === "nbSpace") text(" ", cp);
            else if (tt === "fwSpace") text(" ", cp);
            else if (tt === "hyphen") text("-", cp);
            else if (tt !== "markpenBegin" && tt !== "markpenEnd") pos += 8; // 제목 차례 표시 등 인라인 조종(형광펜은 글자 자리 없음)
          }
        }
      } else if (t === "tbl") {
        p.items.push({ kind: "obj", pos, charPr: cp, obj: tableOf(ctx, c) });
        pos += 8;
      } else if (t === "pic") {
        p.items.push({ kind: "obj", pos, charPr: cp, obj: picOf(ctx, c, null) });
        pos += 8;
      } else if (SHAPE_TAGS.has(t)) {
        p.items.push({ kind: "obj", pos, charPr: cp, obj: shapeOf(ctx, c, null) });
        pos += 8;
      } else if (t === "compose") {
        const circle = idx(COMPOSE_CIRCLES, attr(c, "circleType"));
        const charPrs = kids(c, "charPr").map((x) => {
          const id = attr(x, "prIDRef") ?? "";
          return ctx.head.charIds.has(id) ? ctx.head.charIds.get(id)! : -1;
        });
        p.items.push({ kind: "compose", pos, charPr: cp, chars: attr(c, "composeText") ?? "", border: circle, size: num(c, "charSz"), spread: attr(c, "composeType") === "OVERLAP" ? 1 : 0, charPrs });
        pos += 8;
      } else if (t === "secPr") {
        const pp = kid(c, "pagePr");
        const m = kid(pp, "margin");
        if (pp && !ctx.page)
          ctx.page = {
            width: num(pp, "width"),
            height: num(pp, "height"),
            left: num(m, "left"),
            right: num(m, "right"),
            top: num(m, "top"),
            bottom: num(m, "bottom"),
            header: num(m, "header"),
            footer: num(m, "footer"),
            gutter: num(m, "gutter"),
            landscape: attr(pp, "landscape") === "NARROWLY",
          };
        const ol = attr(c, "outlineShapeIDRef");
        if (ol) ctx.outline = num(c, "outlineShapeIDRef");
        pos += 8;
      } else if (t === "ctrl") {
        for (const k of kids(c)) {
          const kt = local(k);
          if (kt === "autoNum" && attr(k, "numType") === "PAGE") p.items.push({ kind: "text", pos, charPr: cp, text: "0", attrs: ' data-hw-field="page"' });
          else if ((kt === "footer" || kt === "header") && !ctx[kt]) {
            const sub = kid(k, "subList");
            const va = attr(sub, "vertAlign");
            const hf: HeadFoot = {
              applyTo: attr(k, "applyPageType") === "EVEN" ? "EVEN" : attr(k, "applyPageType") === "ODD" ? "ODD" : "BOTH",
              vertAlign: va === "BOTTOM" ? "BOTTOM" : va === "CENTER" ? "CENTER" : "TOP",
              paras: kids(sub, "p").map((q) => paraOf(ctx, q)),
            };
            ctx[kt] = hf;
          } else if (kt === "pageNum" && !ctx.pageNum)
            ctx.pageNum = { position: Math.max(0, PAGE_NUM_POS.indexOf(attr(k, "pos") ?? "")), format: 0, prefix: "", suffix: "", dash: attr(k, "sideChar") ?? "-", charPr: 0, para: ctx.paraIndex };
          pos += 8;
        }
        if (!kids(c).length) pos += 8;
      }
      else pos += 8; // 수식·양식 개체 등(원본 배치에 쓰지 않음)
    }
  }
  p.endCharPr = lastCp;
  p.length = pos + 1;
  const lsa = kid(el, "linesegarray");
  for (const l of kids(lsa, "lineseg")) {
    const seg: LineSeg = {
      textpos: num(l, "textpos"),
      vertpos: num(l, "vertpos"),
      vertsize: num(l, "vertsize"),
      textheight: num(l, "textheight"),
      baseline: num(l, "baseline"),
      spacing: num(l, "spacing"),
      horzpos: num(l, "horzpos"),
      horzsize: num(l, "horzsize"),
      flags: Number(attr(l, "flags") ?? 0) >>> 0,
    };
    p.lines.push(seg);
  }
  return p;
}

// ───────────────────────── 파일

function parseXml(xml: string, name: string): El {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level !== "warning") errors.push(msg);
    },
  }).parseFromString(xml, "text/xml");
  if (errors.length || !doc?.documentElement) throw new HwpReadError(`한글(HWPX) 파일의 ${name}을 읽지 못했습니다.`);
  return doc.documentElement;
}

/** HWPX 바이트 → 모델 */
export async function readHwpx(bytes: Uint8Array): Promise<HwpDoc> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new HwpReadError("한글(HWPX) 파일 구조를 읽지 못했습니다.");
  }
  const text = async (path: string) => (zip.file(path) ? await zip.file(path)!.async("string") : null);
  const header = await text("Contents/header.xml");
  if (!header) throw new HwpReadError("한글(HWPX) 파일의 문서 정보(header.xml)가 없습니다.");
  // 그림: content.hpf 목록의 id → 파일
  const doc: HwpDoc = { format: "hwpx", faces: {}, charPrs: [], paraPrs: [], borderFills: [null], tabDefs: [], bullets: [], numberings: [], bins: new Map(), sections: [] };
  const binNums = new Map<string, number>();
  const hpf = await text("Contents/content.hpf");
  const items = hpf ? kids(kid(parseXml(hpf, "content.hpf"), "manifest"), "item") : [];
  for (const it of items) {
    const href = attr(it, "href") ?? "";
    const id = attr(it, "id") ?? "";
    if (!href.startsWith("BinData/")) continue;
    const n = binNums.size + 1;
    binNums.set(id, n);
    const f = zip.file(href);
    const item: BinItem = { id: n, ext: (href.split(".").pop() ?? "").toLowerCase(), data: f ? await f.async("uint8array") : null };
    doc.bins.set(n, item);
  }
  const binId = (ref: string) => binNums.get(ref) ?? 0;
  const head = readHeader(header, doc, binId);
  const ctx: SecCtx = { head, binId, page: null, outline: 0 };
  const sections = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort((a, c) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(c)![0]));
  for (const s of sections) {
    const root = parseXml((await text(s)) ?? "", s);
    ctx.page = null;
    ctx.header = ctx.footer = ctx.pageNum = undefined;
    const paras = kids(root, "p").map((p, i) => {
      ctx.paraIndex = i;
      return paraOf(ctx, p);
    });
    doc.sections.push({ page: ctx.page, paras, ...(ctx.header ? { header: ctx.header } : {}), ...(ctx.footer ? { footer: ctx.footer } : {}), ...(ctx.pageNum ? { pageNum: ctx.pageNum } : {}) });
  }
  if (!doc.sections.length) throw new HwpReadError("한글(HWPX) 파일에 본문이 없습니다.");
  // 개요 번호: 구역 정의가 가리키는 번호(없으면 첫 번호)
  const outline = head.numberingIds.get(String(ctx.outline)) ?? (doc.numberings.length ? 1 : 0);
  for (const pp of doc.paraPrs) if (pp.headingType === "OUTLINE") pp.headingId = outline;
  resolveHeads(doc);
  return doc;
}
