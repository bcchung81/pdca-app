// 공통 모델(model.ts) → 한글 HWPX(OWPML). 한글이 저장한 HWPX와 같은 짜임·요소 순서로 파일 묶음을 만듭니다(입출력 없는 순수 함수).
//  · Contents/header.xml: 글꼴(언어 7종)·테두리/배경·글자 모양·탭·번호·글머리표·문단 모양·스타일(바탕글 하나)
//  · Contents/section0.xml: 첫 문단 앞에 구역 정의(쪽 크기·여백) → 문단마다 글자 조각(run)·표·그림·도형·글자 겹침·줄 배치
//  · 여백·들여쓰기·문단 간격·탭 위치: HWPUNIT 값(hp:case HwpUnitChar)과 그 2배(hp:default — HWP 5 파일에 적힌 값)를 함께 적음
//  · 그리기 개체: 만들 때 크기·뒤집기·회전·변환 행렬을 원본 값 그대로 적어 한글이 원본과 같게 그림
//  · 줄 배치(linesegarray): 원본 글자 자리를 그대로 쓴 문단만 적고, 글이 바뀐 문단은 빼서 한글이 다시 조판하게 함
// 요소·속성 이름과 순서는 한글이 저장한 HWPX(data/templates의 한컴 산출물 — 기관 원본이라 git 밖)와 대조해 맞췄습니다.

import type { Border, BorderFill, Cell, CharPr, Fill, HeadFoot, HwpDoc, Inline, LineStyle, PageDef, PageNumPos, Para, ParaHead, ParaPr, Pic, Shape, ShapeGeo, Table } from "./model.ts";
import { headText, LANGS, levelStart } from "./model.ts";

/** 그림 바이트(확장자는 png·jpg 등) */
export interface HwpxImage {
  data: Uint8Array;
  ext: string;
}

export interface HwpxInput {
  /** 모양(글꼴·글자·문단·테두리/배경·탭·글머리·번호·그림 목록). sections는 쓰지 않음 */
  doc: HwpDoc;
  page: PageDef;
  paras: Para[];
  /** 그림 id → 바이트(없으면 빈 그림) */
  images: Map<number, HwpxImage>;
  title?: string;
  /** 꼬리말(쪽 번호 자동 번호 포함)·쪽 번호 위치 — 원본처럼 첫 문단 앞 조종으로 */
  footer?: HeadFoot;
  pageNum?: PageNumPos;
}

/** 쪽 번호 자동 번호 자리표시(읽을 때 넣은 글자 — 파일에는 자동 번호 조종 8칸) */
export const isPageField = (it: Inline) => it.kind === "text" && /data-hw-field="page"/.test(it.attrs ?? "");
const PAGE_NUM_POS = ["NONE", "TOP_LEFT", "TOP_CENTER", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_CENTER", "BOTTOM_RIGHT", "OUTSIDE_TOP", "OUTSIDE_BOTTOM", "INSIDE_TOP", "INSIDE_BOTTOM"];
const AUTO_PAGE_XML = '<hp:ctrl><hp:autoNum num="1" numType="PAGE"><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar="" supscript="0"/></hp:autoNum></hp:ctrl>';

// ───────────────────────── 값 적기

const NS =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" ' +
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" ' +
  'xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" ' +
  'xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
const UNIT_CHAR = 'hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"';

/** XML에 쓸 수 없는 글자(조종 문자 등)를 빼고 이스케이프 */
export function xmlText(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c < 0x20 && c !== 9 && c !== 10 && c !== 13) || c === 0xfffe || c === 0xffff || (c >= 0xd800 && c <= 0xdfff)) continue;
    out += ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === '"' ? "&quot;" : ch;
  }
  return out;
}
const n = (v: number | undefined) => String(Math.round(Number(v) || 0));
/** 음수 위치는 한글처럼 부호 없는 32비트로 */
const u32 = (v: number | undefined) => String(Math.round(Number(v) || 0) >>> 0);
const b = (v: boolean | undefined) => (v ? "1" : "0");
const color = (c: string | null | undefined, none = "none") => c ?? none;
/** 행렬 값(한글처럼 정수는 그대로, 소수는 여섯째 자리까지) */
const dbl = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6;
  return String(Object.is(r, -0) ? 0 : r);
};

const LINE_TYPES = ["NONE", "SOLID", "DASH", "DOT", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM", "WAVE", "DOUBLE_WAVE", "THICK_3D", "THICK_3D_LIFTED", "3D", "3D_LIFTED"];
/** 밑줄·취소선 모양(선 종류 표에서 없음을 뺀 차례) */
const STROKE_SHAPES = LINE_TYPES.slice(1);
const NUM_FORMATS = ["DIGIT", "CIRCLED_DIGIT", "ROMAN_CAPITAL", "ROMAN_SMALL", "LATIN_CAPITAL", "LATIN_SMALL", "CIRCLED_LATIN_CAPITAL", "CIRCLED_LATIN_SMALL", "HANGUL_SYLLABLE", "CIRCLED_HANGUL_SYLLABLE", "HANGUL_JAMO", "CIRCLED_HANGUL_JAMO", "HANGUL_PHONETIC", "IDEOGRAPH", "CIRCLED_IDEOGRAPH", "DECAGON_CIRCLE", "DECAGON_CIRCLE_HANJA"];
const SYM_MARKS = ["NONE", "DOT_ABOVE", "RING_ABOVE", "TILDE", "CARON", "SIDE", "COLON", "GRAVE_ACCENT", "ACUTE_ACCENT", "CIRCUMFLEX", "MACRON", "HOOK_ABOVE", "DOT_BELOW"];
const OUTLINES = ["NONE", "SOLID", "DOT", "THICK", "DASH", "DASH_DOT", "DASH_DOT_DOT"];
const HATCHES = ["HORIZONTAL", "VERTICAL", "BACK_SLASH", "SLASH", "CROSS", "CROSS_DIAGONAL"];
const GRAD_TYPES = ["LINEAR", "LINEAR", "RADIAL", "CONICAL", "SQUARE"];
const ARROWS = ["NORMAL", "ARROW", "SPEAR", "CONCAVE_ARROW", "EMPTY_DIAMOND", "EMPTY_CIRCLE", "EMPTY_BOX", "FILLED_DIAMOND", "FILLED_CIRCLE", "FILLED_BOX"];
const ARROW_SIZES = ["SMALL_SMALL", "SMALL_MEDIUM", "SMALL_LARGE", "MEDIUM_SMALL", "MEDIUM_MEDIUM", "MEDIUM_LARGE", "LARGE_SMALL", "LARGE_MEDIUM", "LARGE_LARGE"];
const SHADOWS = ["NONE", "PARELLEL_LEFTTOP", "PARELLEL_RIGHTTOP", "PARELLEL_LEFTBOTTOM", "PARELLEL_RIGHTBOTTOM", "SHEAR_LEFTTOP", "SHEAR_RIGHTTOP", "SHEAR_LEFTBOTTOM", "SHEAR_RIGHTBOTTOM", "SHEAR_LEFT_TOP", "SMALLER", "LARGER"];
const COMPOSE_CIRCLES = ["CHAR", "SHAPE_CIRCLE", "SHAPE_REVERSAL_CIRCLE", "SHAPE_RECTANGLE", "SHAPE_REVERSAL_RECTANGLE", "SHAPE_TRIANGLE", "SHAPE_REVERSAL_TIRANGLE", "SHAPE_LIGHT", "SHAPE_RHOMBUS", "SHAPE_REVERSAL_RHOMBUS", "SHAPE_ROUNDED_RECTANGLE", "SHAPE_EMPTY_CIRCULATE_TRIANGLE", "SHAPE_THIN_CIRCULATE_TRIANGLE", "SHAPE_THICK_CIRCULATE_TRIANGLE"];

/** 테두리 굵기(mm) → 한글 표기(「0.12 mm」「1.0 mm」) */
export function mmText(mm: number): string {
  const v = Math.round((Number(mm) || 0.1) * 100) / 100;
  return `${Number.isInteger(v) ? v.toFixed(1) : String(v)} mm`;
}

// ───────────────────────── 머리(header.xml)

interface Header {
  xml: string;
  /** 언어별 글꼴 이름 → id */
  fontIds: Map<string, number>[];
  /** 모양 없음(테두리·채우기 없음) 테두리/배경 id — 0을 가리키는 곳에 씀 */
  emptyFill: number;
  /** 개요 번호 id(구역 정의 outlineShapeIDRef) */
  outline: number;
}

function borderXml(tag: string, bd: Border | undefined): string {
  return `<hh:${tag} type="${bd?.type ?? "NONE"}" width="${mmText(bd?.width ?? 0.1)}" color="${bd?.color ?? "#000000"}"/>`;
}

/** 채우기(테두리/배경·그리기 개체 공통) */
function fillXml(f: Fill | null | undefined, binRef: (bin: number) => string): string {
  if (!f || (!f.color && !f.patternColor && !f.gradation && !f.image && f.pattern < 0)) return "";
  const parts: string[] = [];
  const alpha = n(f.alpha);
  // 단색 채우기(면 색이 없음이어도 무늬 색이 있으면 원본처럼 적음)
  if (f.color || f.patternColor || f.pattern >= 0) {
    const hatch = f.pattern >= 0 && HATCHES[f.pattern] ? ` hatchStyle="${HATCHES[f.pattern]}"` : "";
    parts.push(`<hc:winBrush faceColor="${color(f.color)}" hatchColor="${f.patternColor ?? "#000000"}"${hatch} alpha="${alpha}"/>`);
  }
  if (f.gradation) {
    const g = f.gradation;
    parts.push(
      `<hc:gradation type="${GRAD_TYPES[g.type] ?? "LINEAR"}" angle="${n(g.angle)}" centerX="${n(g.cx)}" centerY="${n(g.cy)}" step="${n(g.step ?? 255)}" colorNum="${g.colors.length}" stepCenter="${n(g.stepCenter ?? 50)}" alpha="${alpha}">` +
        g.colors.map((c) => `<hc:color value="${c}"/>`).join("") +
        "</hc:gradation>",
    );
  }
  if (f.image) parts.push(`<hc:imgBrush mode="${f.image.mode}"><hc:img binaryItemIDRef="${binRef(f.image.bin)}" bright="${n(f.image.bright)}" contrast="${n(f.image.contrast)}" effect="${f.image.effect}" alpha="${alpha}"/></hc:imgBrush>`);
  return `<hc:fillBrush>${parts.join("")}</hc:fillBrush>`;
}

function borderFillXml(id: number, bf: BorderFill | null, binRef: (bin: number) => string): string {
  return (
    `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
    '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' +
    borderXml("leftBorder", bf?.left) +
    borderXml("rightBorder", bf?.right) +
    borderXml("topBorder", bf?.top) +
    borderXml("bottomBorder", bf?.bottom) +
    borderXml("diagonal", bf?.diagonal) +
    fillXml(bf?.fill, binRef) +
    "</hh:borderFill>"
  );
}

const langAttrs = (vals: number[], f: (v: number) => string = n) => LANGS.map((l, i) => `${l}="${f(vals[i] ?? vals[0] ?? 0)}"`).join(" ");

function charPrXml(id: number, c: CharPr, fontIds: Map<string, number>[], fillRef: (bf: number) => number): string {
  const attr = c.attr ?? 0;
  const refs = LANGS.map((l, i) => `${l}="${fontIds[i].get(c.face[i] ?? c.face[0] ?? "") ?? 0}"`).join(" ");
  const ulShape = STROKE_SHAPES[(attr >>> 4) & 15] ?? "SOLID";
  const stShape = c.strike ? (STROKE_SHAPES[(attr >>> 26) & 15] ?? "SOLID") : "NONE";
  return (
    `<hh:charPr id="${id}" height="${n(c.height)}" textColor="${c.color ?? "#000000"}" shadeColor="${color(c.shade)}" useFontSpace="${b(c.useFontSpace)}" useKerning="${b(c.kerning)}" symMark="${SYM_MARKS[(attr >>> 21) & 15] ?? "NONE"}" borderFillIDRef="${fillRef(c.borderFill)}">` +
    `<hh:fontRef ${refs}/>` +
    `<hh:ratio ${langAttrs(c.ratio)}/>` +
    `<hh:spacing ${langAttrs(c.spacing)}/>` +
    `<hh:relSz ${langAttrs(c.relSize)}/>` +
    `<hh:offset ${langAttrs(c.offset)}/>` +
    (c.italic ? "<hh:italic/>" : "") +
    (c.bold ? "<hh:bold/>" : "") +
    `<hh:underline type="${c.underline || "NONE"}" shape="${ulShape}" color="${c.underlineColor ?? "#000000"}"/>` +
    `<hh:strikeout shape="${stShape}" color="${c.strikeColor ?? "#000000"}"/>` +
    `<hh:outline type="${c.outline ? (OUTLINES[(attr >>> 8) & 7] ?? "SOLID") : "NONE"}"/>` +
    `<hh:shadow type="${c.shadow || "NONE"}" color="${c.shadowColor ?? "#C0C0C0"}" offsetX="${n(c.shadowX)}" offsetY="${n(c.shadowY)}"/>` +
    (c.emboss ? "<hh:emboss/>" : "") +
    (c.engrave ? "<hh:engrave/>" : "") +
    (c.supscript ? "<hh:supscript/>" : "") +
    (c.subscript ? "<hh:subscript/>" : "") +
    "</hh:charPr>"
  );
}

function paraHeadXml(h: ParaHead, attrs: string, text: string | null): string {
  const a =
    `${attrs} align="${h.align}" useInstWidth="${b(h.instWidth)}" autoIndent="${b(h.autoIndent)}" widthAdjust="${n(h.widthAdjust)}" ` +
    `textOffsetType="${h.textOffsetPercent ? "PERCENT" : "HWPUNIT"}" textOffset="${n(h.textOffset)}" numFormat="${NUM_FORMATS[h.numFormat] ?? "DIGIT"}" ` +
    `charPrIDRef="${h.charPr < 0 ? 4294967295 : h.charPr}" checkable="0"`;
  return text ? `<hh:paraHead ${a}>${xmlText(text)}</hh:paraHead>` : `<hh:paraHead ${a}/>`;
}

/** 여백 값: HWPUNIT(case)·2배(default) 두 벌 */
function marginSwitch(pp: ParaPr): string {
  const set = (k: number) =>
    "<hh:margin>" +
    `<hc:intent value="${n(pp.indent * k)}" unit="HWPUNIT"/><hc:left value="${n(pp.left * k)}" unit="HWPUNIT"/><hc:right value="${n(pp.right * k)}" unit="HWPUNIT"/>` +
    `<hc:prev value="${n(pp.before * k)}" unit="HWPUNIT"/><hc:next value="${n(pp.after * k)}" unit="HWPUNIT"/>` +
    "</hh:margin>" +
    `<hh:lineSpacing type="${pp.lineSpacingType}" value="${n(pp.lineSpacingType === "PERCENT" ? pp.lineSpacing : pp.lineSpacing * k)}" unit="HWPUNIT"/>`;
  return `<hp:switch><hp:case ${UNIT_CHAR}>${set(1)}</hp:case><hp:default>${set(2)}</hp:default></hp:switch>`;
}

function paraPrXml(id: number, pp: ParaPr, fillRef: (bf: number) => number, tabs: number): string {
  const [ol, or, ot, ob] = pp.borderOffset ?? [0, 0, 0, 0];
  return (
    `<hh:paraPr id="${id}" tabPrIDRef="${pp.tabDef < tabs ? pp.tabDef : 0}" condense="${n(pp.condense)}" fontLineHeight="${b(pp.fontLineHeight)}" snapToGrid="${b(pp.snapToGrid)}" suppressLineNumbers="0" checked="0">` +
    `<hh:align horizontal="${pp.align}" vertical="${pp.vertAlign}"/>` +
    `<hh:heading type="${pp.headingType}" idRef="${pp.headingType === "NONE" ? 0 : n(pp.headingId)}" level="${n(pp.headingLevel)}"/>` +
    `<hh:breakSetting breakLatinWord="${pp.breakLatin}" breakNonLatinWord="${pp.breakNonLatin}" widowOrphan="0" keepWithNext="${b(pp.keepWithNext)}" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
    `<hh:autoSpacing eAsianEng="${b(pp.autoSpaceEAsianEng)}" eAsianNum="${b(pp.autoSpaceEAsianNum)}"/>` +
    marginSwitch(pp) +
    `<hh:border borderFillIDRef="${fillRef(pp.borderFill)}" offsetLeft="${n(ol)}" offsetRight="${n(or)}" offsetTop="${n(ot)}" offsetBottom="${n(ob)}" connect="0" ignoreMargin="0"/>` +
    "</hh:paraPr>"
  );
}

const LEADERS = LINE_TYPES.slice(0, 12);

/**
 * 번호 수준별 시작 번호: 문단 머리 번호가 원본 문서에서 센 번호(p.head)와 같게 맞춤.
 * 원본의 일부(카드 한 장)만 쓰면 앞에서 이어 세던 번호(다.·라.)가 가.부터 다시 세어지므로, 그 수준이 처음 나오는 문단의 원본 번호로 시작하게 함
 */
export function numberingStarts(doc: HwpDoc, paras: Para[]): number[][] {
  const starts = doc.numberings.map((nb) => nb.levels.map((_, k) => levelStart(nb, k)));
  const counters = new Map<number, number[]>();
  const fixed = new Set<string>();
  const one = (p: Para) => {
    const pp = doc.paraPrs[p.paraPr];
    if (!pp || (pp.headingType !== "OUTLINE" && pp.headingType !== "NUMBER")) return;
    const id = pp.headingType === "OUTLINE" ? pp.headingId || 1 : pp.headingId;
    const nb = doc.numberings[id - 1];
    if (!nb?.levels.length) return;
    const lv = Math.min(pp.headingLevel, nb.levels.length - 1);
    const st = starts[id - 1];
    const cs = counters.get(id) ?? Array(10).fill(0);
    const fresh = !cs[lv];
    cs[lv] = fresh ? st[lv] : cs[lv] + 1;
    for (let k = lv + 1; k < cs.length; k++) cs[k] = 0;
    counters.set(id, cs);
    const probe = { ...nb, starts: st };
    if (!p.head || !fresh || fixed.has(`${id}:${lv}`) || headText(probe, lv, cs) === p.head) return;
    fixed.add(`${id}:${lv}`);
    for (let v = 1; v <= 500; v++) {
      const test = [...cs];
      test[lv] = v;
      if (headText(probe, lv, test) === p.head) {
        st[lv] = v;
        cs[lv] = v;
        break;
      }
    }
  };
  const visit = (ps: Para[]) => {
    for (const p of ps) {
      one(p);
      for (const it of p.items)
        if (it.kind === "obj") {
          const o = it.obj;
          if (o.kind === "table") for (const c of o.cells) visit(c.paras);
          else if (o.kind !== "pic" && o.text) visit(o.text.paras);
        }
    }
  };
  visit(paras);
  return starts;
}

function headerXml(doc: HwpDoc, binRef: (bin: number) => string, styleRefs: { paraPr: number; charPr: number }, starts: number[][]): Header {
  // 글꼴: 언어마다 쓰인 이름을 처음 나온 차례로
  const fontIds = LANGS.map(() => new Map<string, number>());
  for (const c of doc.charPrs) LANGS.forEach((_, i) => {
    const f = c.face[i] ?? c.face[0] ?? "";
    if (f && !fontIds[i].has(f)) fontIds[i].set(f, fontIds[i].size);
  });
  const fallbackFace = doc.charPrs[0]?.face[0] || "함초롬바탕";
  for (const m of fontIds) if (!m.size) m.set(fallbackFace, 0);
  const fonts = LANGS.map((l, i) => {
    const items = [...fontIds[i]].map(([face, id]) => {
      const alt = doc.faces?.[face]?.alt;
      const sub = alt ? `<hh:substFont face="${xmlText(alt)}" type="TTF" isEmbedded="0" binaryItemIDRef=""/>` : "";
      return `<hh:font id="${id}" face="${xmlText(face)}" type="TTF" isEmbedded="0">${sub}</hh:font>`;
    });
    return `<hh:fontface lang="${l.toUpperCase()}" fontCnt="${items.length}">${items.join("")}</hh:fontface>`;
  });

  // 테두리/배경: 1부터(모델 [0]은 비움). 0을 가리키는 곳은 끝에 붙인 빈 모양으로
  const fills = doc.borderFills.slice(1);
  const emptyFill = fills.length + 1;
  const fillRef = (bf: number) => (bf > 0 && bf <= fills.length ? bf : emptyFill);
  const borderFills = [...fills.map((bf, i) => borderFillXml(i + 1, bf, binRef)), borderFillXml(emptyFill, null, binRef)];

  const charPrs = doc.charPrs.map((c, i) => charPrXml(i, c, fontIds, fillRef));

  const tabDefs = doc.tabDefs.length ? doc.tabDefs : [{ autoLeft: false, autoRight: false, stops: [] }];
  const tabs = tabDefs.map((t, i) => {
    // 모델의 위치는 HWPUNIT, 예전 값(hp:default)은 2배. 터무니없는 값(옛 배치)은 뺌
    const stops = t.stops.filter((s) => s.pos >= 0 && s.pos < 1_000_000);
    const item = (k: number, unit: boolean) =>
      stops.map((s) => `<hh:tabItem pos="${n(s.pos * k)}" type="${s.kind}" leader="${LEADERS[s.leader] ?? "NONE"}"${unit ? ' unit="HWPUNIT"' : ""}/>`).join("");
    const body = stops.length ? `<hp:switch><hp:case ${UNIT_CHAR}>${item(1, true)}</hp:case><hp:default>${item(2, false)}</hp:default></hp:switch>` : "";
    return `<hh:tabPr id="${i}" autoTabLeft="${b(t.autoLeft)}" autoTabRight="${b(t.autoRight)}"${body ? `>${body}</hh:tabPr>` : "/>"}`;
  });

  const numberings = doc.numberings.map(
    (nb, i) => `<hh:numbering id="${i + 1}" start="0">${nb.levels.map((lv, k) => paraHeadXml(lv.head, `start="${starts[i]?.[k] ?? levelStart(nb, k)}" level="${k + 1}"`, lv.format)).join("")}</hh:numbering>`,
  );
  const bullets = doc.bullets.map((bu, i) => `<hh:bullet id="${i + 1}" char="${xmlText(bu.char)}" useImage="0">${paraHeadXml(bu.head, 'level="0"', null)}</hh:bullet>`);
  const paraPrs = doc.paraPrs.map((pp, i) => paraPrXml(i, pp, fillRef, tabDefs.length));
  const outline = doc.paraPrs.find((pp) => pp.headingType === "OUTLINE")?.headingId || (doc.numberings.length ? 1 : 0);

  const list = (tag: string, items: string[]) => (items.length ? `<hh:${tag} itemCnt="${items.length}">${items.join("")}</hh:${tag}>` : "");
  const xml =
    XML_HEAD +
    `<hh:head ${NS} version="1.5" secCnt="1">` +
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>' +
    "<hh:refList>" +
    `<hh:fontfaces itemCnt="7">${fonts.join("")}</hh:fontfaces>` +
    list("borderFills", borderFills) +
    list("charProperties", charPrs) +
    list("tabProperties", tabs) +
    list("numberings", numberings) +
    list("bullets", bullets) +
    list("paraProperties", paraPrs) +
    `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="${styleRefs.paraPr}" charPrIDRef="${styleRefs.charPr}" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>` +
    "</hh:refList>" +
    '<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>' +
    '<hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption>' +
    '<hh:trackchageConfig flags="56"/>' +
    "</hh:head>";
  return { xml, fontIds, emptyFill, outline };
}

// ───────────────────────── 본문(section0.xml)

interface SecCtx {
  doc: HwpDoc;
  binRef: (bin: number) => string;
  fillRef: (bf: number) => number;
  /** 개체 id(표·그림·도형마다 하나씩) */
  nextId: () => number;
}

function secPrXml(page: PageDef, emptyFill: number, outline: number): string {
  const pbf = (type: string) =>
    `<hp:pageBorderFill type="${type}" borderFillIDRef="${emptyFill}" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`;
  const note = (place: string, length: string, between: string) =>
    '<hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>' +
    `<hp:noteLine length="${length}" type="SOLID" width="0.12 mm" color="#000000"/>` +
    `<hp:noteSpacing betweenNotes="${between}" belowLine="567" aboveLine="850"/>` +
    '<hp:numbering type="CONTINUOUS" newNum="1"/>' +
    `<hp:placement place="${place}" beneathText="0"/>`;
  return (
    `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="${outline}" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
    '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>' +
    '<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>' +
    '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>' +
    '<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>' +
    `<hp:pagePr landscape="${page.landscape ? "NARROWLY" : "WIDELY"}" width="${n(page.width)}" height="${n(page.height)}" gutterType="${page.gutterType ?? "LEFT_ONLY"}">` +
    `<hp:margin header="${n(page.header)}" footer="${n(page.footer)}" gutter="${n(page.gutter)}" left="${n(page.left)}" right="${n(page.right)}" top="${n(page.top)}" bottom="${n(page.bottom)}"/>` +
    "</hp:pagePr>" +
    `<hp:footNotePr>${note("EACH_COLUMN", "-1", "283")}</hp:footNotePr>` +
    `<hp:endNotePr>${note("END_OF_DOCUMENT", "14692344", "0")}</hp:endNotePr>` +
    pbf("BOTH") +
    pbf("EVEN") +
    pbf("ODD") +
    "</hp:secPr>" +
    '<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>'
  );
}

/** 글자 조각 → hp:t 안 글(묶음 빈칸·고정폭 빈칸은 한글 요소로) */
function tText(s: string): string {
  let out = "";
  for (const ch of s) out += ch === " " ? "<hp:nbSpace/>" : ch === " " ? "<hp:fwSpace/>" : xmlText(ch);
  return out;
}

/**
 * 원본 글자 위치 → 쓴 파일의 글자 위치. 원본에서 읽지 않은 조종 문자(누름틀·책갈피 등, 8칸)는 쓰지 않으므로 그만큼 앞으로 당김.
 * 줄 배치의 시작 글자 위치를 쓴 글에 맞추는 데 씀
 */
export function positionMap(p: Para): (pos: number) => number {
  const gaps: [number, number][] = [];
  let expect = 0;
  for (const it of p.items) {
    if (it.kind === "zero" || !Number.isInteger(it.pos)) continue;
    if (it.pos > expect) gaps.push([expect, it.pos - expect]);
    const len = it.kind === "text" && !isPageField(it) ? (it.raw ?? it.text).length : it.kind === "gen" ? it.text.length : it.kind === "br" ? 1 : 8;
    expect = Math.max(expect, it.pos + len);
  }
  return (pos) => pos - gaps.reduce((a, [at, n]) => a + (at < pos ? Math.min(n, pos - at) : 0), 0);
}

/** 원본 글자 자리를 그대로 쓴 문단(줄 배치를 그대로 쓸 수 있음) */
function keepsLines(p: Para): boolean {
  return !p.flow && !p.relaid && p.lines.length > 0 && p.items.every((it) => it.kind === "zero" || Number.isInteger(it.pos));
}

function paraXml(ctx: SecCtx, p: Para, lead = "", leadCtrls = 2): string {
  const runs: string[] = [];
  let cur: number | null = null;
  let kids: string[] = [];
  let t: string | null = null;
  const closeT = () => {
    if (t !== null) kids.push(`<hp:t>${t}</hp:t>`);
    t = null;
  };
  const flush = () => {
    closeT();
    if (cur !== null) runs.push(kids.length ? `<hp:run charPrIDRef="${cur}">${kids.join("")}</hp:run>` : `<hp:run charPrIDRef="${cur}"/>`);
    kids = [];
  };
  const openRun = (cp: number) => {
    if (cur !== cp) {
      flush();
      cur = cp;
    }
  };
  const items: Inline[] = p.items;
  for (const it of items) {
    if (it.kind === "zero") continue;
    const cp = Math.max(0, it.charPr);
    if (isPageField(it)) {
      openRun(cp);
      closeT();
      kids.push(AUTO_PAGE_XML);
    } else if (it.kind === "text" || it.kind === "gen") {
      const s = it.kind === "text" ? (it.raw ?? it.text) : it.text;
      if (!s) continue;
      openRun(cp);
      t = (t ?? "") + tText(s);
    } else if (it.kind === "br") {
      openRun(cp);
      t = (t ?? "") + "<hp:lineBreak/>";
    } else if (it.kind === "tab") {
      openRun(cp);
      t = (t ?? "") + `<hp:tab width="${n(it.width)}" leader="${n(it.leader)}" type="${n(it.tabKind)}"/>`;
    } else if (it.kind === "compose") {
      openRun(cp);
      closeT();
      kids.push(composeXml(it));
    } else if (it.kind === "obj") {
      openRun(cp);
      closeT();
      kids.push(objXml(ctx, it.obj));
    }
  }
  flush();
  const end = p.endCharPr ?? cur ?? 0;
  if (!runs.length || (p.endCharPr !== undefined && cur !== p.endCharPr)) runs.push(`<hp:run charPrIDRef="${Math.max(0, end)}"/>`);
  if (lead) runs.unshift(`<hp:run charPrIDRef="${Math.max(0, p.endCharPr ?? items.find((it) => it.kind !== "zero")?.charPr ?? 0)}">${lead}</hp:run>`);
  // 구역 정의·단 정의(조종 문자 2개 = 16칸, 꼬리말·쪽 번호가 있으면 더)를 앞에 둔 문단은 둘째 줄부터 시작 글자 위치가 그만큼 뒤로
  const at = positionMap(p);
  const shift = (i: number) => (lead && i > 0 ? 8 * leadCtrls : 0);
  const lines = keepsLines(p)
    ? `<hp:linesegarray>${p.lines.map((l, i) => `<hp:lineseg textpos="${n(at(l.textpos) + shift(i))}" vertpos="${n(l.vertpos)}" vertsize="${n(l.vertsize)}" textheight="${n(l.textheight)}" baseline="${n(l.baseline)}" spacing="${n(l.spacing)}" horzpos="${n(l.horzpos)}" horzsize="${n(l.horzsize)}" flags="${u32(l.flags)}"/>`).join("")}</hp:linesegarray>`
    : "";
  return `<hp:p id="0" paraPrIDRef="${Math.max(0, p.paraPr)}" styleIDRef="0" pageBreak="${b(p.pageBreak)}" columnBreak="0" merged="0">${runs.join("")}${lines}</hp:p>`;
}

function parasXml(ctx: SecCtx, ps: Para[]): string {
  return ps.map((p) => paraXml(ctx, p)).join("");
}

function composeXml(it: Extract<Inline, { kind: "compose" }>): string {
  const ids = it.charPrs.length ? it.charPrs : [-1];
  return (
    `<hp:compose circleType="${COMPOSE_CIRCLES[it.border] ?? "CHAR"}" charSz="${n(it.size)}" composeType="${it.spread ? "OVERLAP" : "SPREAD"}" charPrCnt="${ids.length}" composeText="${xmlText(it.chars)}">` +
    ids.map((c) => `<hp:charPr prIDRef="${c < 0 ? 4294967295 : c}"/>`).join("") +
    "</hp:compose>"
  );
}

/** 개체 위치·크기·바깥 여백(표·그림·도형 공통) */
function objPlaceXml(o: Table | Pic | Shape, w: number, h: number): string {
  const p = o.pos;
  const [ml, mr, mt, mb] = p.outMargin;
  return (
    `<hp:sz width="${n(w)}" widthRelTo="${p.widthRelTo ?? "ABSOLUTE"}" height="${n(h)}" heightRelTo="${p.heightRelTo ?? "ABSOLUTE"}" protect="${b(p.protect)}"/>` +
    `<hp:pos treatAsChar="${b(p.treatAsChar)}" affectLSpacing="${b(p.affectLineSpacing)}" flowWithText="${b(p.flowWithText ?? p.vertRelTo === "PARA")}" allowOverlap="${b(p.allowOverlap)}" holdAnchorAndSO="0" ` +
    `vertRelTo="${p.vertRelTo}" horzRelTo="${p.horzRelTo}" vertAlign="${p.vertAlign}" horzAlign="${p.horzAlign}" vertOffset="${u32(p.vertOffset)}" horzOffset="${u32(p.horzOffset)}"/>` +
    `<hp:outMargin left="${n(ml)}" right="${n(mr)}" top="${n(mt)}" bottom="${n(mb)}"/>`
  );
}

function objXml(ctx: SecCtx, o: Table | Pic | Shape): string {
  if (o.kind === "table") return tableXml(ctx, o);
  if (o.kind === "pic") return picXml(ctx, o, 0);
  return shapeXml(ctx, o, 0);
}

function tableXml(ctx: SecCtx, t: Table): string {
  // 표 크기 높이: 원본 값(행을 늘리고 줄이면 화면 변환이 그만큼 더하고 뺌) — 한글이 열 때 행 높이로 다시 셈
  const height = t.pos.height;
  const [il, ir, it, ib] = t.inMargin;
  const zones = t.zones?.length
    ? `<hp:cellzoneList>${t.zones.map((z) => `<hp:cellzone startRowAddr="${z.r0}" startColAddr="${z.c0}" endRowAddr="${z.r1}" endColAddr="${z.c1}" borderFillIDRef="${ctx.fillRef(z.borderFill)}"/>`).join("")}</hp:cellzoneList>`
    : "";
  const rows: Cell[][] = Array.from({ length: t.rows }, () => []);
  for (const c of t.cells) if (c.row < t.rows) rows[c.row].push(c);
  const trs = rows
    .map((cells) => {
      cells.sort((a, c) => a.col - c.col);
      const tcs = cells.map((c) => {
        const [ml, mr, mt, mb] = c.margin;
        return (
          `<hp:tc name="" header="${b(c.header)}" hasMargin="${b(c.ownMargin)}" protect="${b(c.protect)}" editable="0" dirty="0" borderFillIDRef="${ctx.fillRef(c.borderFill)}">` +
          `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${c.vertAlign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
          parasXml(ctx, c.paras.length ? c.paras : [emptyPara(c)]) +
          "</hp:subList>" +
          `<hp:cellAddr colAddr="${c.col}" rowAddr="${c.row}"/><hp:cellSpan colSpan="${c.colSpan}" rowSpan="${c.rowSpan}"/>` +
          `<hp:cellSz width="${n(c.width)}" height="${n(c.height)}"/><hp:cellMargin left="${n(ml)}" right="${n(mr)}" top="${n(mt)}" bottom="${n(mb)}"/>` +
          "</hp:tc>"
        );
      });
      return `<hp:tr>${tcs.join("")}</hp:tr>`;
    })
    .join("");
  const p = t.pos;
  return (
    `<hp:tbl id="${ctx.nextId()}" zOrder="${n(p.zOrder)}" numberingType="${p.numberingType ?? "TABLE"}" textWrap="${p.wrap}" textFlow="${p.textFlow ?? "BOTH_SIDES"}" lock="0" dropcapstyle="None" ` +
    `pageBreak="${t.pageBreak}" repeatHeader="${b(t.repeatHeader)}" rowCnt="${t.rows}" colCnt="${t.cols}" cellSpacing="${n(t.cellSpacing)}" borderFillIDRef="${ctx.fillRef(t.borderFill)}" noAdjust="0">` +
    objPlaceXml(t, t.pos.width, height) +
    `<hp:inMargin left="${n(il)}" right="${n(ir)}" top="${n(it)}" bottom="${n(ib)}"/>` +
    zones +
    trs +
    "</hp:tbl>"
  );
}

function emptyPara(c: Cell): Para {
  return { paraPr: 0, style: 0, items: [], lines: [], length: 1, pageBreak: false, ...(c.paras[0]?.endCharPr !== undefined ? { endCharPr: c.paras[0].endCharPr } : {}) };
}

/** 모양 정보가 없는 개체(옛 배치): 지금 크기 그대로, 변환 없음 */
function geoOf(o: Pic | Shape): ShapeGeo {
  if (o.geo) return o.geo;
  const orgW = o.kind === "pic" ? o.orgW || o.curW : o.curW || o.pos.width;
  const orgH = o.kind === "pic" ? o.orgH || o.curH : o.curH || o.pos.height;
  const cw = o.curW || o.pos.width;
  const ch = o.curH || o.pos.height;
  return { orgW, orgH, flipH: false, flipV: false, angle: 0, cx: cw / 2, cy: ch / 2, trans: [1, 0, 0, 0, 1, 0], pairs: [[[orgW ? cw / orgW : 1, 0, 0, 0, orgH ? ch / orgH : 1, 0], [1, 0, 0, 0, 1, 0]]], groupLevel: 0 };
}

/** 그리기 개체 공통 앞부분(묶음 속 위치·크기·뒤집기·회전·변환 행렬) */
function componentXml(o: Pic | Shape, g: ShapeGeo): string {
  const mat = (tag: string, m: number[]) => `<hc:${tag} e1="${dbl(m[0])}" e2="${dbl(m[1])}" e3="${dbl(m[2])}" e4="${dbl(m[3])}" e5="${dbl(m[4])}" e6="${dbl(m[5])}"/>`;
  const x = o.kind === "pic" ? (o.x ?? 0) : o.x;
  const y = o.kind === "pic" ? (o.y ?? 0) : o.y;
  return (
    `<hp:offset x="${u32(x)}" y="${u32(y)}"/>` +
    `<hp:orgSz width="${n(g.orgW)}" height="${n(g.orgH)}"/>` +
    `<hp:curSz width="${u32(o.curW)}" height="${u32(o.curH)}"/>` +
    `<hp:flip horizontal="${b(g.flipH)}" vertical="${b(g.flipV)}"/>` +
    `<hp:rotationInfo angle="${n(g.angle)}" centerX="${n(g.cx)}" centerY="${n(g.cy)}" rotateimage="1"/>` +
    `<hp:renderingInfo>${mat("transMatrix", g.trans)}${g.pairs.map(([s, r]) => mat("scaMatrix", s) + mat("rotMatrix", r)).join("")}</hp:renderingInfo>`
  );
}

/** 개체 머리 속성(묶음 속 개체는 id 0·번호 없음) */
function shapeAttrs(ctx: SecCtx, o: Pic | Shape, level: number): string {
  const p = o.pos;
  const id = level ? 0 : ctx.nextId();
  return `id="${id}" zOrder="${level ? 0 : n(p.zOrder)}" numberingType="${level ? "NONE" : (p.numberingType ?? "PICTURE")}" textWrap="${p.wrap}" textFlow="${p.textFlow ?? "BOTH_SIDES"}" lock="0" dropcapstyle="None" href="" groupLevel="${level}" instid="${ctx.nextId()}"`;
}

function tailXml(o: Pic | Shape, level: number): string {
  if (level) return "";
  const w = o.pos.width || o.curW;
  const h = o.pos.height || o.curH;
  return objPlaceXml(o, w, h) + (o.pos.comment ? `<hp:shapeComment>${xmlText(o.pos.comment)}</hp:shapeComment>` : "<hp:shapeComment/>");
}

function picXml(ctx: SecCtx, p: Pic, level: number): string {
  const g = geoOf(p);
  const rect = p.imgRect ?? [
    [0, 0],
    [p.orgW, 0],
    [p.orgW, p.orgH],
    [0, p.orgH],
  ];
  const [cl, ct, cr, cb] = p.crop;
  const [ml, mr, mt, mb] = p.inMargin;
  const dim = p.imgDim ?? [p.orgW, p.orgH];
  const border =
    p.borderWidth > 0
      ? `<hp:lineShape color="${p.borderColor ?? "#000000"}" width="${n(p.borderWidth)}" style="SOLID" endCap="FLAT" headStyle="NORMAL" tailStyle="NORMAL" headfill="1" tailfill="1" headSz="SMALL_SMALL" tailSz="SMALL_SMALL" outlineStyle="NORMAL" alpha="0"/>`
      : "";
  return (
    `<hp:pic ${shapeAttrs(ctx, p, level)} reverse="0">` +
    componentXml(p, g) +
    border +
    `<hc:img binaryItemIDRef="${ctx.binRef(p.bin)}" bright="${n(p.bright)}" contrast="${n(p.contrast)}" effect="${p.effect || "REAL_PIC"}" alpha="0"/>` +
    `<hp:imgRect>${rect.map(([x, y], i) => `<hc:pt${i} x="${u32(x)}" y="${u32(y)}"/>`).join("")}</hp:imgRect>` +
    `<hp:imgClip left="${n(cl)}" right="${n(cr || p.orgW)}" top="${n(ct)}" bottom="${n(cb || p.orgH)}"/>` +
    `<hp:inMargin left="${n(ml)}" right="${n(mr)}" top="${n(mt)}" bottom="${n(mb)}"/>` +
    `<hp:imgDim dimwidth="${n(dim[0])}" dimheight="${n(dim[1])}"/>` +
    "<hp:effects/>" +
    tailXml(p, level) +
    "</hp:pic>"
  );
}

function lineShapeXml(l: LineStyle | null): string {
  const a = l?.attr ?? 0;
  const style = l ? l.type : "NONE";
  return (
    `<hp:lineShape color="${l?.color ?? "#000000"}" width="${n(l?.width ?? 0)}" style="${style}" endCap="${((a >>> 6) & 15) === 1 ? "FLAT" : "ROUND"}" ` +
    `headStyle="${ARROWS[(a >>> 10) & 63] ?? "NORMAL"}" tailStyle="${ARROWS[(a >>> 16) & 63] ?? "NORMAL"}" headfill="${(a >>> 30) & 1}" tailfill="${(a >>> 31) & 1}" ` +
    `headSz="${ARROW_SIZES[(a >>> 22) & 15] ?? "SMALL_SMALL"}" tailSz="${ARROW_SIZES[(a >>> 26) & 15] ?? "SMALL_SMALL"}" outlineStyle="${["NORMAL", "OUTER", "INNER"][l?.outline ?? 0] ?? "NORMAL"}" alpha="0"/>`
  );
}

function shapeXml(ctx: SecCtx, s: Shape, level: number): string {
  const g = geoOf(s);
  if (s.kind === "container") {
    const kids = s.children.map((c) => (c.kind === "pic" ? picXml(ctx, c, level + 1) : shapeXml(ctx, c, level + 1))).join("");
    return `<hp:container ${shapeAttrs(ctx, s, level)}>${componentXml(s, g)}${kids}${tailXml(s, level)}</hp:container>`;
  }
  const tag = s.kind === "rect" || s.kind === "ellipse" || s.kind === "line" || s.kind === "polygon" || s.kind === "curve" || s.kind === "arc" ? s.kind : null;
  if (!tag) return ""; // 수식·OLE 등은 원본 배치에 없음
  const sh = s.shadow;
  const shadow = `<hp:shadow type="${SHADOWS[sh?.type ?? 0] ?? "NONE"}" color="${sh?.color ?? "#B2B2B2"}" offsetX="${n(sh?.x)}" offsetY="${n(sh?.y)}" alpha="${n(sh?.alpha)}"/>`;
  const text = s.text
    ? `<hp:drawText lastWidth="${n(s.text.lastWidth ?? g.orgW)}" name="" editable="0">` +
      `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${s.text.vertAlign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">` +
      parasXml(ctx, s.text.paras) +
      "</hp:subList>" +
      `<hp:textMargin left="${n(s.text.margin[0])}" right="${n(s.text.margin[1])}" top="${n(s.text.margin[2])}" bottom="${n(s.text.margin[3])}"/>` +
      "</hp:drawText>"
    : "";
  const common = componentXml(s, g) + lineShapeXml(s.line) + fillXml(s.fill, ctx.binRef) + shadow + text;
  let geom = "";
  if (tag === "rect") {
    const cs = s.corners ?? [
      [0, 0],
      [g.orgW, 0],
      [g.orgW, g.orgH],
      [0, g.orgH],
    ];
    geom = cs.map(([x, y], i) => `<hc:pt${i} x="${u32(x)}" y="${u32(y)}"/>`).join("");
  } else if (tag === "ellipse") {
    geom =
      `<hc:center x="${n(g.orgW / 2)}" y="${n(g.orgH / 2)}"/><hc:ax1 x="${n(g.orgW)}" y="${n(g.orgH / 2)}"/><hc:ax2 x="${n(g.orgW / 2)}" y="0"/>` +
      '<hc:start1 x="0" y="0"/><hc:end1 x="0" y="0"/><hc:start2 x="0" y="0"/><hc:end2 x="0" y="0"/>';
  } else if (tag === "line") {
    const [a, c] = s.points.length >= 2 ? s.points : [[0, 0] as [number, number], [g.orgW, g.orgH] as [number, number]];
    geom = `<hc:startPt x="${u32(a[0])}" y="${u32(a[1])}"/><hc:endPt x="${u32(c[0])}" y="${u32(c[1])}"/>`;
  } else if (tag === "curve") {
    geom = s.points.slice(0, -1).map(([x, y], i) => `<hp:seg type="${s.segs?.[i] ? "CURVE" : "LINE"}" x1="${u32(x)}" y1="${u32(y)}" x2="${u32(s.points[i + 1][0])}" y2="${u32(s.points[i + 1][1])}"/>`).join("");
  } else geom = s.points.map(([x, y]) => `<hc:pt x="${u32(x)}" y="${u32(y)}"/>`).join("");
  const extra = tag === "rect" ? ` ratio="${n(s.round)}"` : tag === "ellipse" ? ' intervalDirty="0" hasArcPr="0" arcType="NORMAL"' : tag === "line" ? ' isReverseHV="0"' : "";
  return `<hp:${tag} ${shapeAttrs(ctx, s, level)}${extra}>${common}${geom}${tailXml(s, level)}</hp:${tag}>`;
}

// ───────────────────────── 묶음

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpg", jpeg: "image/jpg", bmp: "image/bmp", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", wmf: "image/wmf", emf: "image/emf" };
/** 1×1 투명 PNG(바이트를 못 구한 그림 자리) */
const BLANK_PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

/** 문단들의 글(미리보기 글) */
function plainText(ps: Para[], out: string[] = []): string[] {
  for (const p of ps) {
    let line = "";
    for (const it of p.items) {
      if (it.kind === "text" || it.kind === "gen") line += it.text;
      else if (it.kind === "obj" && it.obj.kind === "table") {
        if (line.trim()) out.push(line);
        line = "";
        for (const c of it.obj.cells) plainText(c.paras, out);
      }
    }
    if (line.trim()) out.push(line);
  }
  return out;
}

/**
 * 모델 → HWPX 파일 묶음(경로 → 바이트). 묶기(zip)·정품 순서는 lib/hwpx/postprocess.ts의 writeHwpxPackage가 합니다.
 */
export function hwpxFiles(input: HwpxInput): Map<string, Uint8Array> {
  const enc = new TextEncoder();
  const { doc, page, paras } = input;
  // 쓰인 그림만: 모델 그림 id → BinData 이름
  const binIds = new Map<number, string>();
  const binRef = (bin: number) => {
    let id = binIds.get(bin);
    if (!id) {
      id = `image${bin}`;
      binIds.set(bin, id);
    }
    return id;
  };
  const first = paras[0];
  const styleRefs = { paraPr: Math.max(0, first?.paraPr ?? 0), charPr: Math.max(0, first?.endCharPr ?? 0) };
  const head = headerXml(doc, binRef, styleRefs, numberingStarts(doc, paras));
  const fillRef = (bf: number) => (bf > 0 && bf < head.emptyFill ? bf : head.emptyFill);
  let seq = 1_000_000_000;
  const ctx: SecCtx = { doc, binRef, fillRef, nextId: () => ++seq };
  // 꼬리말·쪽 번호 위치: 구역 정의·단 정의 뒤 조종으로(한글이 저장하는 자리)
  const textW = page.width - page.left - page.right;
  const foot = input.footer
    ? `<hp:ctrl><hp:footer id="${ctx.nextId()}" applyPageType="${input.footer.applyTo}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${input.footer.vertAlign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="${n(textW)}" textHeight="${n(page.footer)}" hasTextRef="0" hasNumRef="0">${parasXml(ctx, input.footer.paras)}</hp:subList></hp:footer></hp:ctrl>`
    : "";
  const pn = input.pageNum ? `<hp:ctrl><hp:pageNum pos="${PAGE_NUM_POS[input.pageNum.position] ?? "BOTTOM_CENTER"}" formatType="DIGIT" sideChar="${xmlText(input.pageNum.dash)}"/></hp:ctrl>` : "";
  const leadCtrls = 2 + (foot ? 1 : 0) + (pn ? 1 : 0);
  const body = paras.map((p, i) => paraXml(ctx, i === 0 ? { ...p, pageBreak: false } : p, i === 0 ? secPrXml(page, head.emptyFill, head.outline) + foot + pn : "", leadCtrls)).join("");
  const section = XML_HEAD + `<hs:sec ${NS}>${body}</hs:sec>`;

  const files = new Map<string, Uint8Array>();
  files.set("mimetype", enc.encode("application/hwp+zip"));
  const items: string[] = [];
  for (const [bin, id] of [...binIds].sort((a, c) => a[0] - c[0])) {
    const img = input.images.get(bin);
    const ext = (img?.ext || "png").toLowerCase().replace(/^jpeg$/, "jpg");
    const path = `BinData/${id}.${img ? ext : "png"}`;
    files.set(path, img?.data ?? BLANK_PNG);
    items.push(`<opf:item id="${id}" href="${path}" media-type="${MIME[img ? ext : "png"] ?? "application/octet-stream"}" isEmbeded="1"/>`);
  }
  const title = xmlText(input.title ?? "");
  files.set(
    "Contents/content.hpf",
    enc.encode(
      XML_HEAD +
        `<opf:package ${NS} version="" unique-identifier="" id="">` +
        `<opf:metadata><opf:title>${title}</opf:title><opf:language>ko</opf:language></opf:metadata>` +
        `<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>${items.join("")}<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>` +
        '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>' +
        "</opf:package>",
    ),
  );
  files.set("Contents/header.xml", enc.encode(head.xml));
  files.set("Contents/section0.xml", enc.encode(section));
  files.set("Preview/PrvText.txt", enc.encode(plainText(paras).join("\r\n").slice(0, 1024)));
  files.set(
    "META-INF/container.xml",
    enc.encode(
      XML_HEAD +
        '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles>' +
        '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>' +
        '<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>',
    ),
  );
  return files;
}
