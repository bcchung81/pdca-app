// 경평 초안(주요사업 과제별 소항목 spec) → 한글(HWPX) — 화면 초안 양식 그대로(2026-10-21 사용자 승인 「A안」). 입출력 없는 순수 모듈.
// spec → 화면과 같은 묶음·치수 규칙 → 공통 한글 모델(lib/hwp/model.ts)을 코드가 지음 → 카드와 같은 범용 쓰기 계층(hwpx-write.ts hwpxFiles).
//  · 짜임은 화면 렌더러(section-html.ts)를 그대로 따라감: 머리(대상사업·실행과제 띠·소항목) → 본문(layoutGroups 묶음 — 라벨 사다리 표·단 띠·전폭·가로 반씩)
//    → 블록 19종 + 모양(blockCore와 같은 갈래) → 추진성과 상자. 묶음 함수(layoutGroups·ladderGroups·isPanelCompare·tableBars)는 렌더러·판면 어림과 같은 것을 씀
//  · 치수·색·크기는 화면과 한 곳: 판면·라벨 칸 mm는 fit.ts·layout.ts·blocks.ts 상수, 회색조·선 굵기·글자 크기·줄간격은 section-css.ts REPORT_STYLE.
//    부품별 줄 높이(머리·상자 머리·표 머리 칸·수치 칸 — CSS line-height)는 REPORT_STYLE.lh × 100을 그 문단의 「글자에 따라 %」 줄간격으로(그 밖은 기본 160%)
//    여기서 새로 정하는 값은 화면 CSS의 px·em 값을 HWPUNIT로 옮긴 것과 한글의 일반 규칙(테두리 굵기 표·글머리표)뿐
//  · 도형(그리기 개체)은 쓰지 않음(1회차 — 파일 깨짐 위험을 줄임): 상자·화살표·막대는 표 칸·채움·테두리·글자(▶ ✚ ↺ ▼ ⇄ ◉)로 그림
//  · 글은 줄 배치(linesegarray) 없이 써서 한글이 조판하고, 칸 높이는 최소 높이만 적어 한글이 글에 맞게 늘림
//  · 화면 전용 표시(카드에 없는 숫자 붉은 점선·근거 약한 문장 점선·고치기 표지)는 넣지 않음. 【확인: …】은 괄호 표기 그대로 + 화면과 같은 노란 음영
//  · 경영관리(spec.mg)·지표 한 파일은 이 모듈 범위 밖(개조식 section-md.ts 그대로) — 들어오면 블록만 차례로 그리고 경고

import { BORDER_WIDTH_MM } from "../hwp/hwp5.ts";
import { type HwpxInput, hwpxFiles } from "../hwp/hwpx-write.ts";
import type { Align, Border, BorderFill, Bullet, Cell, CharPr, HwpDoc, Inline, LineType, PageDef, Para, ParaPr, Table } from "../hwp/model.ts";
import { writeHwpxPackage } from "../hwpx/postprocess.ts";
import { type Block, type BlockCell, FIGURE_GAP_MM, FIGURE_LABEL, type Figure, type FigurePos, blockTexts, figureMm, isPanelCompare, ladderGroups, tableBars } from "./blocks.ts";
import { PAGE_MM, STATS_ROW_LABEL, TABLE_SHAPE_MM, ownResult, resultBandMm, resultRowHeadMm, statsBoxLabel, statsLine, statsRow, tableRowHeadMm, textEm } from "./fit.ts";
import { PAIR_GAP_MM, layoutGroups } from "./layout.ts";
import { fontName } from "./report-fonts.ts";
import { REPORT_STYLE } from "./section-css.ts";
import type { Diagram, LadderRow, MiniChart, ReportSectionSpec } from "./section.ts";

// ───────────────────────── 단위·용지

const HU_PER_MM = 7200 / 25.4;
/** mm → HWPUNIT */
const mm = (v: number) => Math.round(v * HU_PER_MM);
/** 화면 px(96dpi) → HWPUNIT(1px = 75) */
const px = (v: number) => Math.round(v * 75);
/** pt → mm(테두리 굵기) */
const ptMm = (v: number) => (v * 25.4) / 72;

/**
 * 경영실적보고서 편집 용지(사용자 결정 2026-10-21): 216×303mm 맞쪽, 안쪽·바깥쪽 23 · 위 15.5 · 아래 12.5 · 머리말·꼬리말 10 · 제본 0(mm)
 * → 본문 170×255mm(화면 fit.ts PAGE_MM과 같음 — section-hwpx.test.ts가 대조)
 */
export const REPORT_PAGE_MM = { width: 216, height: 303, inside: 23, outside: 23, top: 15.5, bottom: 12.5, header: 10, footer: 10, gutter: 0 } as const;
const PAGE: PageDef = {
  width: mm(REPORT_PAGE_MM.width),
  height: mm(REPORT_PAGE_MM.height),
  left: mm(REPORT_PAGE_MM.inside),
  right: mm(REPORT_PAGE_MM.outside),
  top: mm(REPORT_PAGE_MM.top),
  bottom: mm(REPORT_PAGE_MM.bottom),
  header: mm(REPORT_PAGE_MM.header),
  footer: mm(REPORT_PAGE_MM.footer),
  gutter: mm(REPORT_PAGE_MM.gutter),
  landscape: false,
  gutterType: "LEFT_RIGHT",
};
/** 본문 폭(HWPUNIT) — 최상위 표는 모두 이 폭 */
const BODY_W = mm(PAGE_MM.width);

/**
 * 글꼴 이름(한글이 쓰는 이름 — data/templates의 한컴 저장본 header.xml에 「KoPub바탕체 Light」「KoPub돋움체 Bold」「맑은 고딕」「HY헤드라인M」이 이 이름으로 적힘.
 * 「KoPub바탕체 Bold」는 같은 이름 짜임으로 적은 것 — 한글에서 확인 필요). 글꼴 파일은 넣지 않음(금기 6). 대체 글꼴은 함초롬바탕·함초롬돋움.
 * 이름은 화면 CSS 별칭과 같은 표(report-fonts.ts REPORT_FONTS)에서 굵기로 가져옴 — 굵지 않은 본문은 Light(300), 굵게는 Bold(700)
 */
export const HWPX_FACES = {
  body: fontName("body", 300),
  bodyB: fontName("body", 700),
  dotumB: fontName("dotum", 700),
  label: fontName("label", 400),
  head: fontName("head", 400),
  num: fontName("num", 400),
} as const;
type Face = keyof typeof HWPX_FACES;
const FACE_ALT: Record<Face, string | null> = { body: "함초롬바탕", bodyB: "함초롬바탕", dotumB: "함초롬돋움", label: "함초롬돋움", head: "함초롬돋움", num: null };

const ST = REPORT_STYLE;
const G = ST.gray;
const F = ST.pt;
const NEED = ST.need;
/** 부품별 줄 높이(화면 CSS line-height 배수 — REPORT_STYLE.lh) → 한글 줄간격 %(글자에 따라: 그 줄 글자 크기 × %, CSS line-height × 100과 같은 뜻) */
const LH = ST.lh;
const pct = (v: number) => Math.round(v * 100);
/** 칸 사이 기호 칸(카드 묶음 ✚·▶·시기 흐름 ▶·PDCA ▶) mm·기호 pt — 화면 .k-join·grid 템플릿과 같은 값 */
const JOIN = ST.join;
/** 좁은 칸 본문 안 여백 좌우(카드·PDCA·단계·시기 본문 — 화면 .k-card__b·.k-proc__b·.k-tl__b) */
const BOX_X = px(ST.boxPadX);

// ───────────────────────── 모양 등록기(같은 값은 한 번만)

interface Line {
  /** 굵기(pt — 한글 테두리 굵기 표의 가장 가까운 값으로) */
  pt: number;
  color: string;
  type?: LineType;
}
interface Box {
  l?: Line | null;
  r?: Line | null;
  t?: Line | null;
  b?: Line | null;
  fill?: string;
  /** 빗금 색(그림 자리 — 화면 빗금 칸) */
  hatch?: string;
}
interface CS {
  face: Face;
  pt: number;
  bold?: boolean;
  color?: string;
  /** 글자 뒤 배경(음영) */
  shade?: string;
  /** 글자 테두리/배경(칩) */
  box?: Box;
  sup?: boolean;
}
interface PS {
  align?: Align;
  bullet?: boolean;
  /** 글머리표 문단의 글자 크기(pt — 내어쓰기·본문과의 거리가 em이라 크기마다 다름). Writer.para가 채움 */
  bulletPt?: number;
  left?: number;
  indent?: number;
  before?: number;
  after?: number;
  /** 줄간격 %(없으면 160) */
  line?: number;
  /** 문단 테두리/배경 */
  box?: Box;
  /** 본문 글(글자 단위 줄 나눔 — 화면 section-css의 word-break: normal 갈래). 불릿 문단은 늘 본문 */
  chars?: boolean;
}

const HAIR: Line = { pt: ST.line.hair, color: G.g4 };
const HAIR3: Line = { pt: ST.line.hair, color: G.g3 };
const HAIR5: Line = { pt: ST.line.hair, color: G.g5 };
const THICK: Line = { pt: ST.line.thick, color: G.g4 };
const all = (l: Line | null, fill?: string): Box => ({ l, r: l, t: l, b: l, ...(fill ? { fill } : {}) });

/**
 * 글머리표(화면 li::before 「•」 — REPORT_STYLE.bullet): 한글 글머리표 문단의 내어쓰기로 화면과 같은 자리에 둠(lib/hwpx/hang.ts 관례).
 * left = 부호 자리(markEm), intent = −(글 시작 − 부호 자리) — 첫 줄은 부호에서, 둘째 줄부터 글 시작(padEm)에서.
 * 첫 줄 글 자리 = 부호 자리 + 「•」 폭 + 본문과의 거리 → 본문과의 거리 = padEm − markEm − 「•」 폭. 자동 내어쓰기는 끔(켜면 한글이 intent에 글머리표 폭을 더함)
 */
const BULLET_HANG = { mark: ST.bullet.markEm, text: ST.bullet.padEm };
/** 「•」 폭(em) — 화면에서 잰 값(경평 초안 11장 스냅숏의 li::before 「•」 상자 폭 0.34~0.44em, 가장 흔한 값 0.40em — 본문 자간 맞춤이 더해져 흔들림) */
const BULLET_GLYPH_EM = 0.4;
const bulletOf = (pt: number): Bullet => ({
  char: "•",
  head: { align: "LEFT", instWidth: true, autoIndent: false, widthAdjust: 0, textOffset: Math.round((BULLET_HANG.text - BULLET_HANG.mark - BULLET_GLYPH_EM) * pt * 100), textOffsetPercent: false, numFormat: 0, charPr: -1 },
});

const hex = (c: string) => {
  const s = c.trim().replace(/^#/, "");
  return `#${(s.length === 3 ? [...s].map((x) => x + x).join("") : s).toUpperCase()}`;
};
const snapMm = (v: number) => BORDER_WIDTH_MM.reduce((a, c) => (Math.abs(c - v) < Math.abs(a - v) ? c : a), BORDER_WIDTH_MM[0]);
const NONE: Border = { type: "NONE", width: 0.1, color: "#000000" };
const border = (l?: Line | null): Border => (l ? { type: l.type ?? "SOLID", width: snapMm(ptMm(l.pt)), color: hex(l.color) } : NONE);
const seven = <T>(v: T) => Array.from({ length: 7 }, () => v);

class Shapes {
  readonly doc: HwpDoc = { format: "hwpx", faces: {}, charPrs: [], paraPrs: [], borderFills: [null], tabDefs: [], bullets: [], numberings: [], bins: new Map(), sections: [] };
  private ids = new Map<string, number>();
  /** 만든 값 그대로를 열쇠로(입력 표기가 달라도 같은 모양이면 한 번만) */
  private once<T>(kind: string, list: T[], v: T): number {
    const k = `${kind}:${JSON.stringify(v)}`;
    let id = this.ids.get(k);
    if (id === undefined) {
      list.push(v);
      id = list.length - 1;
      this.ids.set(k, id);
    }
    return id;
  }
  fill(b: Box): number {
    const v: BorderFill = {
      left: border(b.l),
      right: border(b.r),
      top: border(b.t),
      bottom: border(b.b),
      diagonal: NONE,
      fill: b.fill ? { color: hex(b.fill), patternColor: b.hatch ? hex(b.hatch) : null, pattern: b.hatch ? 3 : -1, image: null, gradation: null } : null,
    };
    return this.once("bf", this.doc.borderFills, v);
  }
  char(c: CS): number {
    const name = HWPX_FACES[c.face];
    if (!this.doc.faces[name]) this.doc.faces[name] = { defaultName: null, alt: FACE_ALT[c.face] };
    const bf = c.box ? this.fill(c.box) : 0;
    const v: CharPr = {
      height: Math.round(c.pt * 100),
      face: seven(name),
      ratio: seven(100),
      spacing: seven(0),
      relSize: seven(100),
      offset: seven(0),
      bold: Boolean(c.bold),
      italic: false,
      underline: "",
      underlineColor: null,
      strike: false,
      strikeColor: null,
      supscript: Boolean(c.sup),
      subscript: false,
      outline: false,
      shadow: "",
      shadowColor: null,
      shadowX: 0,
      shadowY: 0,
      emboss: false,
      engrave: false,
      color: hex(c.color ?? G.ink),
      shade: c.shade ? hex(c.shade) : null,
      kerning: false,
      // 빈칸 폭은 글꼴의 빈칸 글리프 폭(화면 브라우저와 같음). false면 한글 기본 빈칸 폭이라 줄이 길어짐(표본 07: 내용 높이 155.0 → 141.4mm, 화면 137.1mm)
      useFontSpace: true,
      borderFill: bf,
    };
    return this.once("cp", this.doc.charPrs, v);
  }
  para(p: PS): number {
    const bf = p.box ? this.fill(p.box) : 0;
    const em = (p.bulletPt ?? F.body) * 100;
    const v: ParaPr = {
      align: p.align ?? "JUSTIFY",
      breakLatin: "KEEP_WORD",
      // HWPX breakNonLatinWord는 이름과 뜻이 반대: KEEP_WORD = 글자 단위, BREAK_WORD = 어절 단위(한글 11 저장본 3개 줄 배치: KEEP_WORD 낱말 가운데 끊김 317회 / BREAK_WORD 2회).
      // 화면과 같은 갈래(2026-10-28): 본문 글(불릿·칸 글·표 글·추진성과 문장 — 2025 최종본처럼 글자 단위)은 KEEP_WORD, 제목·라벨·머리·칩은 BREAK_WORD(어절 단위 — 화면 keep-all).
      // 영문 breakLatinWord는 이름 그대로(KEEP_WORD = 단어 단위)
      breakNonLatin: p.bullet || p.chars ? "KEEP_WORD" : "BREAK_WORD",
      condense: 0,
      lineSpacingType: "PERCENT",
      lineSpacing: p.line ?? ST.lineSpacingPct,
      left: (p.left ?? 0) + (p.bullet ? Math.round(BULLET_HANG.mark * em) : 0),
      right: 0,
      indent: p.bullet ? -Math.round((BULLET_HANG.text - BULLET_HANG.mark) * em) : (p.indent ?? 0),
      before: p.before ?? 0,
      after: p.after ?? 0,
      vertAlign: "BASELINE",
      snapToGrid: false,
      fontLineHeight: false,
      keepWithNext: false,
      borderFill: bf,
      borderOffset: [0, 0, 0, 0],
      tabDef: 0,
      headingType: p.bullet ? "BULLET" : "NONE",
      headingId: p.bullet ? this.once("bu", this.doc.bullets, bulletOf(p.bulletPt ?? F.body)) + 1 : 0,
      headingLevel: 0,
      autoSpaceEAsianEng: false,
      autoSpaceEAsianNum: false,
    };
    return this.once("pp", this.doc.paraPrs, v);
  }
}

// ───────────────────────── 글자 조각·문단

const BODY: CS = { face: "body", pt: F.body };
const BODY_B: CS = { face: "bodyB", pt: F.body };
const HEAD: CS = { face: "dotumB", pt: F.body };
const LABEL: CS = { face: "label", pt: F.label, bold: true };
const WHITE = G.g0;
/** 빈 칸·막대 칸용 아주 작은 글자(칸 최소 높이가 글 줄 높이로 커지지 않게) */
const TINY: CS = { face: "body", pt: 1 };

/**
 * XML 1.0 금지 문자 걷기(U+0000–0008·000B·000C·000E–001F·FFFE·FFFF, 짝 없는 서로게이트) — 모델로 들어가는 모든 글이 지남.
 * 탭(0009)·줄바꿈(000A)·복귀(000D)는 그대로(줄바꿈은 flat이 빈칸으로)
 */
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const clean = (s: string) => s.replace(XML_BAD, "");

/** 줄바꿈 → 빈칸(화면은 줄바꿈을 빈칸으로 보임) */
const flat = (s: unknown) => clean(String(s ?? "")).replace(/\s*\r?\n\s*/g, " ");
/** 강조 표기를 뗀 글(막대 값 — 화면 SVG 글과 같게) */
const plain = (s: string) => flat(s).replace(/\*\*/g, "");

/** 강조(**…** → 굵은 돋움, 화면 .k-frame li b) */
function emphFace(c: CS): CS {
  if (c.face === "body" || c.face === "bodyB") return { ...c, face: "dotumB", bold: false };
  return c.face === "label" ? { ...c, bold: true } : c;
}

class Writer {
  readonly sh = new Shapes();
  readonly warnings: string[] = [];

  run(text: string, c: CS): Inline {
    return { kind: "text", pos: 0, charPr: this.sh.char(c), text: clean(text) };
  }

  /** 글 → 조각: 【확인: …】(괄호 그대로 + 노란 음영) → **강조** → ^{위첨자}. 짝 없는 **는 걷음(화면 emph와 같음) */
  rich(s: string, base: CS, needPt?: number): Inline[] {
    const text = flat(s);
    const out: Inline[] = [];
    const sup = (t: string, c: CS) => {
      let last = 0;
      for (const m of t.matchAll(/\^\{([^{}]{1,120}?)\}/g)) {
        if (m.index > last) out.push(this.run(t.slice(last, m.index), c));
        out.push(this.run(m[1], { ...c, sup: true }));
        last = m.index + m[0].length;
      }
      if (last < t.length) out.push(this.run(t.slice(last), c));
    };
    const emph = (t: string, c: CS) => {
      let last = 0;
      for (const m of t.matchAll(/\*\*([^*]+?)\*\*/g)) {
        sup(t.slice(last, m.index).replace(/\*\*/g, ""), c);
        sup(m[1], emphFace(c));
        last = m.index + m[0].length;
      }
      sup(t.slice(last).replace(/\*\*/g, ""), c);
    };
    let last = 0;
    for (const m of text.matchAll(/【확인:\s*([^】]{1,200})】/g)) {
      emph(text.slice(last, m.index), base);
      // 글자 그대로 「【확인: 내용】」(한글 찾기로 모두 찾음) + 화면 【확인】과 같은 노란 음영
      const need: CS = { ...base, face: base.face === "bodyB" ? "body" : base.face, bold: false, color: NEED.ink, shade: NEED.bg, ...(needPt ? { pt: needPt } : {}) };
      out.push(this.run("【확인: ", need));
      emph(m[1], need);
      out.push(this.run("】", need));
      last = m.index + m[0].length;
    }
    emph(text.slice(last), base);
    return out;
  }

  /** 칩(화면 .k-tag — 돋움 굵게 8pt, 가는 테두리 g5, 흰 바탕) 또는 어두운 칩(흰 글자) 뒤 빈칸 */
  tag(text: string, dark = false, after: CS = BODY): Inline[] {
    if (!text) return [];
    const c: CS = dark ? { face: "dotumB", pt: F.tag, color: WHITE, shade: G.g4 } : { face: "dotumB", pt: F.tag, box: all(HAIR5, G.g0) };
    return [...this.rich(text, c), this.run(" ", after)];
  }

  para(ps: PS, items: Inline[], end: CS = BODY): Para {
    let pos = 0;
    const its = items.map((it) => {
      const x = { ...it, pos };
      pos += it.kind === "text" ? it.text.length : 8;
      return x;
    });
    return { paraPr: this.sh.para(ps.bullet ? { ...ps, bulletPt: end.pt } : ps), style: 0, items: its, lines: [], length: pos + 1, pageBreak: false, endCharPr: this.sh.char(end) };
  }
  /** 글 한 문단 */
  p(s: string, c: CS = BODY, ps: PS = {}): Para {
    return this.para(ps, this.rich(s, c), c);
  }
  /** 불릿 목록(화면 ul) */
  ul(items: string[], c: CS = BODY, ps: PS = {}): Para[] {
    return items.map((x) => this.para({ ...ps, bullet: true }, this.rich(x, c), c));
  }
  /** 빈 문단(아주 작은 글자 — 칸 높이를 키우지 않음) */
  empty(): Para {
    return this.para({ line: 100 }, [], TINY);
  }

  // ───────────────────────── 표

  /** 칸 너비 나누기: 고정(HWPUNIT)·비율(fr) — 합이 total과 정확히 같게(반올림 오차는 마지막 칸) */
  cols(total: number, parts: Array<number | { fr: number }>): number[] {
    const fixed = parts.reduce<number>((a, p) => a + (typeof p === "number" ? p : 0), 0);
    const frs = parts.reduce<number>((a, p) => a + (typeof p === "number" ? 0 : p.fr), 0);
    const rest = Math.max(0, total - fixed);
    const out = parts.map((p) => (typeof p === "number" ? Math.round(p) : Math.round((rest * p.fr) / (frs || 1))));
    out[out.length - 1] += total - out.reduce((a, c) => a + c, 0);
    return out.map((v) => Math.max(1, v));
  }

  /**
   * 표 하나: 칸 너비(HWPUNIT 합 = 표 폭) · 행 최소 높이 · 칸(행·열·합침·테두리/배경·세로 정렬·안 여백·문단).
   * outline을 주면 바깥 가장자리 칸에 그 선을 더함(따로 정한 선은 그대로)
   */
  table(colW: number[], rowH: number[], cells: TCell[], o: { outline?: Line } = {}): Table {
    const rows = rowH.length;
    const ncol = colW.length;
    const out: Cell[] = cells.map((c) => {
      const rs = c.rs ?? 1;
      const cs = c.cs ?? 1;
      const box: Box = { ...(c.box ?? {}) };
      if (o.outline) {
        if (c.c === 0 && box.l === undefined) box.l = o.outline;
        if (c.c + cs === ncol && box.r === undefined) box.r = o.outline;
        if (c.r === 0 && box.t === undefined) box.t = o.outline;
        if (c.r + rs === rows && box.b === undefined) box.b = o.outline;
      }
      const m = c.m ?? [px(3), px(3), px(2), px(2)];
      return {
        row: c.r,
        col: c.c,
        rowSpan: rs,
        colSpan: cs,
        width: colW.slice(c.c, c.c + cs).reduce((a, v) => a + v, 0),
        height: rowH.slice(c.r, c.r + rs).reduce((a, v) => a + v, 0),
        margin: m,
        ownMargin: true,
        borderFill: this.sh.fill(box),
        vertAlign: c.va ?? "CENTER",
        paras: c.paras.length ? c.paras : [this.empty()],
      };
    });
    const width = colW.reduce((a, v) => a + v, 0);
    const height = rowH.reduce((a, v) => a + v, 0);
    return {
      kind: "table",
      pos: { treatAsChar: true, affectLineSpacing: false, vertRelTo: "PARA", horzRelTo: "PARA", vertAlign: "TOP", horzAlign: "LEFT", vertOffset: 0, horzOffset: 0, width, height, wrap: "TOP_AND_BOTTOM", zOrder: 0, outMargin: [0, 0, 0, 0] },
      rows,
      cols: ncol,
      cellSpacing: 0,
      inMargin: [0, 0, 0, 0],
      borderFill: this.sh.fill({}),
      pageBreak: "CELL",
      repeatHeader: false,
      cells: out,
    };
  }

  /** 표를 품은 문단(글자처럼 — 한글이 쪽에 흘림). before = 위 여백(화면 margin-top) */
  host(t: Table, before = 0, align: Align = "LEFT"): Para {
    return this.para({ align, line: 100, before }, [{ kind: "obj", pos: 0, charPr: this.sh.char(BODY), obj: t }]);
  }
}

interface TCell {
  r: number;
  c: number;
  rs?: number;
  cs?: number;
  paras: Para[];
  box?: Box;
  va?: "TOP" | "CENTER" | "BOTTOM";
  /** 안 여백(왼·오른·위·아래 HWPUNIT, 없으면 화면 2px 3px) */
  m?: [number, number, number, number];
}

/** 한 줄 글 행의 최소 높이(글 크기 × 줄간격 + 위아래 여백) — 한글이 글에 맞게 늘림 */
const lineH = (pt: number = F.body, pad = px(4)) => Math.round(pt * ST.lineSpacingPct) + pad;
const M0: [number, number, number, number] = [0, 0, 0, 0];
const inner = (w: number, m: [number, number, number, number] = [px(3), px(3), px(2), px(2)]) => Math.max(mm(5), w - m[0] - m[1]);

// ───────────────────────── 블록

const MARKER_STYLE: Record<string, CS> = {
  BP: { face: "dotumB", pt: F.marker, color: WHITE, shade: G.g5 },
  지적개선: { face: "dotumB", pt: F.marker, color: WHITE, shade: G.g5 },
  AI: { face: "dotumB", pt: F.marker, color: WHITE, shade: G.g5 },
  신규: { face: "dotumB", pt: F.small, box: all({ pt: 1, color: G.ink }) },
};
const KNOWN_KINDS = new Set(["bullets", "cards", "compare", "steps", "timeline", "hub", "voices", "define", "band", "banner", "quotes", "case", "chart", "subhead", "stats", "qa", "table", "strategy", "pdca"]);
/** 글 앞 동그라미 번호(전후 비교 패널은 그리는 쪽이 번호를 붙임 — section-html.ts LEAD_NUM) */
const LEAD_NUM = /^\s*[①-⑳❶-❿➀-➓]\s*/;
const STEP_LEAD = /^(Step\s?\d+|\d단계)\s*/;
/** 칸 사이 ✚로 잇는 행(v1·v2 card_grid — section-html.ts JOIN_LABELS) */
const JOIN_LABELS = new Set(["현황 및 문제점", "추진배경"]);

class SectionWriter extends Writer {
  /** 라벨 칸 글: 「Step 1 …」「’24년 …」「1단계 …」는 앞을 칩으로 + 줄바꿈(section-html.ts labelHtml) */
  labelParas(label: string): Para[] {
    const m = /^(Step\s?\d+|’\d\d년~?|\d{4}년~?|\d단계)\s*(.*)$/.exec(label);
    const ps: PS = { align: "CENTER", line: pct(LH.ladder) };
    if (!m) return [this.para(ps, [this.run(flat(label), LABEL)], LABEL)];
    return [this.para(ps, this.tag(m[1], false, LABEL), LABEL), ...(m[2] ? [this.para(ps, [this.run(m[2], LABEL)], LABEL)] : [])];
  }

  title(b: Pick<Block, "title">): Para[] {
    return b.title ? [this.p(b.title, HEAD, { align: "LEFT", before: px(4), line: pct(LH.title) })] : [];
  }

  /** 그림 자리(화면 .k-fig): 크기 등급 mm 그대로의 점선 상자 + 빗금 바탕 + 종류 칩 + 서술 */
  figBox(f: Figure): Table {
    const { w, h } = figureMm(f);
    const logo = f.kind === "logo";
    const paras = [
      this.para({ align: "CENTER", line: pct(LH.figKind) }, [this.run(FIGURE_LABEL[f.kind], { face: "label", pt: F.figKind, bold: true, color: WHITE, shade: G.g5 })], { face: "label", pt: F.figKind }),
      this.para({ align: "CENTER", line: pct(LH.figDesc) }, [this.run(flat(f.desc), { face: "label", pt: logo ? 7 : F.figDesc, color: G.g5 })], { face: "label", pt: F.figDesc }),
    ];
    const m: [number, number, number, number] = logo ? [px(2), px(2), px(1), px(1)] : [px(3), px(3), px(2), px(2)];
    return this.table([mm(w)], [mm(h)], [{ r: 0, c: 0, paras, m, box: { ...all({ pt: 0.75, color: G.g4, type: "DASH" }), fill: G.g1, hatch: "#e6e7e6" } }]);
  }

  /** 블록 옆 그림(왼쪽은 앞, 나머지는 뒤 — section-html.ts withSideFigures): 테두리 없는 표 [그림][사이][본문][사이][그림] */
  withFigures(b: Block, w: number, core: (w: number) => Para[], skip: FigurePos[] = []): Para[] {
    const figs = (b.figures ?? []).filter((f) => !skip.includes(f.pos));
    if (!figs.length) return core(w);
    const left = figs.filter((f) => f.pos === "left");
    const right = figs.filter((f) => f.pos !== "left");
    const gap = mm(FIGURE_GAP_MM);
    const used = figs.reduce((a, f) => a + mm(figureMm(f).w) + gap, 0);
    // 본문 칸이 너무 좁으면(좁은 반 폭 등) 그림을 블록 아래 가운데에 둠
    if (w - used < mm(30)) return [...core(w), ...figs.map((f) => this.host(this.figBox(f), px(3), "CENTER"))];
    const parts: number[] = [];
    const cells: TCell[] = [];
    const add = (width: number, paras: Para[]) => {
      cells.push({ r: 0, c: parts.length, paras, m: M0 });
      parts.push(width);
    };
    for (const f of left) {
      add(mm(figureMm(f).w), [this.host(this.figBox(f))]);
      add(gap, []);
    }
    const mainAt = parts.length;
    parts.push(0);
    cells.push({ r: 0, c: mainAt, paras: [], m: M0, va: "TOP" });
    for (const f of right) {
      add(gap, []);
      add(mm(figureMm(f).w), [this.host(this.figBox(f))]);
    }
    parts[mainAt] = w - parts.reduce((a, v) => a + v, 0);
    cells[cells.findIndex((c) => c.c === mainAt)].paras = core(parts[mainAt]);
    return [this.host(this.table(parts, [lineH()], cells))];
  }

  /** 블록 하나(그림 포함): 전후 비교 패널·우수사례는 블록 안에서, 협업 가운데 로고는 가운데 칸 안에서, 그 밖은 옆에 */
  block(b: Block, w: number): Para[] {
    if (isPanelCompare(b) || b.kind === "case") return this.core(b, w);
    return this.withFigures(b, w, (x) => this.core(b, x), b.kind === "hub" ? ["center"] : []);
  }

  /** 수치 띠 불릿(칸마다 한 불릿 — 칩(tag)은 화면처럼 칩, 글은 fit.ts statsLine — 위첨자 시점 ^{…}). c = 글자 모양(상자 안은 굵게) */
  statsUl(b: Block, c: CS = BODY): Para[] {
    return b.cells.flatMap((x) => {
      const line = statsLine({ ...x, tag: "" });
      return line ? [this.para({ bullet: true }, [...this.tag(x.tag.trim(), false, c), ...this.rich(line, c)], c)] : [];
    });
  }

  /** 칸 카드(머리·불릿·덧글) 세 행 — cards·pdca가 같이 씀 */
  cardColumns(cells: BlockCell[], w: number, gapMm: number, joiner: string, head: (c: BlockCell, i: number) => Inline[]): Table {
    const gap = mm(gapMm);
    const parts: Array<number | { fr: number }> = [];
    cells.forEach((_, i) => {
      if (i) parts.push(gap);
      parts.push({ fr: 1 });
    });
    const colW = this.cols(w, parts);
    const hasNote = cells.some((c) => c.note);
    const rowH = [lineH(), lineH(), ...(hasNote ? [lineH()] : [])];
    const out: TCell[] = [];
    cells.forEach((c, i) => {
      const col = i * 2;
      if (i) out.push({ r: 0, c: col - 1, rs: rowH.length, paras: joiner ? [this.para({ align: "CENTER", line: pct(LH.join) }, [this.run(joiner, { face: "label", pt: JOIN.pt, bold: true, color: G.g3 })], BODY)] : [], m: M0 });
      out.push({ r: 0, c: col, paras: [this.para({ align: "CENTER", line: pct(LH.card) }, head(c, i), HEAD)], box: { l: HAIR, r: HAIR, t: HAIR, b: HAIR, fill: G.g2 }, m: [px(4), px(4), 0, 0] });
      out.push({ r: 1, c: col, paras: c.bullets.length ? this.ul(c.bullets) : [this.empty()], box: { l: HAIR, r: HAIR, b: hasNote ? null : HAIR }, m: [BOX_X, BOX_X, px(2), px(2)] });
      if (hasNote) out.push({ r: 2, c: col, paras: c.note ? [this.p(c.note, BODY_B, { align: "CENTER" })] : [], box: { l: HAIR, r: HAIR, t: HAIR3, b: HAIR }, m: [px(4), px(4), px(1), px(1)] });
    });
    return this.table(colW, rowH, out);
  }

  core(b: Block, w: number): Para[] {
    const title = b.title && !["define", "case"].includes(b.kind) ? this.title(b) : [];
    const wMm = w / HU_PER_MM;
    switch (b.kind) {
      case "bullets":
        return [...title, ...this.ul(b.items)];
      case "cards": {
        const cells = b.cells.slice(0, 4);
        if (!cells.length) return title;
        const head = (c: BlockCell) => [...this.tag(c.tag, false, HEAD), ...this.rich(c.head, HEAD)];
        if (b.variant === "vs" && cells.length === 2) {
          // VS 대립 2칸: 가운데 9mm에 VS 원(진회색 바탕 흰 글자)
          const t = this.cardColumns(cells, w, 9, "", head);
          const mid = t.cells.find((c) => c.col === 1);
          if (mid) mid.paras = [this.para({ align: "CENTER", line: pct(LH.vs) }, [this.run("VS", { face: "head", pt: 9, color: WHITE, shade: G.g5 })], BODY)];
          return [...title, this.host(t, px(3))];
        }
        const join = b.variant === "plus" ? "✚" : b.variant === "arrow" ? "▶" : "";
        return [...title, this.host(this.cardColumns(cells, w, join && cells.length > 1 ? JOIN.gapMm : 3, join, head), px(3))];
      }
      case "pdca": {
        const DEF = ["P", "D", "C", "A"];
        const cells = b.cells.slice(0, 4);
        const t = this.cardColumns(cells, w, JOIN.gapMm, "▶", (c, i) => [this.run((c.tag || DEF[i]).slice(0, 2), { face: "label", pt: 8.5, bold: true, color: WHITE, shade: G.g4 }), this.run(" ", HEAD), ...this.rich(c.head, HEAD)]);
        const out = [...title, this.host(t, px(3))];
        if (b.text) out.push(this.host(this.table([w], [lineH(F.small)], [{ r: 0, c: 0, paras: [this.para({ align: "CENTER", line: pct(LH.pdcaFb) }, [this.run("↺ ", { ...HEAD, pt: F.small }), ...this.rich(b.text, { ...HEAD, pt: F.small })], HEAD)], box: all({ ...HAIR, type: "DASH" }), m: [px(6), px(6), px(2), px(2)] }]), mm(1.2)));
        return out;
      }
      case "compare":
        if (isPanelCompare(b)) return [...title, ...this.panels(b, w)];
        return [...title, this.host(this.beforeAfter(b.rows, w))];
      case "steps":
        if (b.variant === "zigzag" && b.cells.length === 4) return [...title, this.host(this.zigzag(b.cells, w), px(3))];
        return [
          ...title,
          this.host(
            this.processFlow(
              b.cells.map((c) => ({ title: [c.tag.replace(/^(Step\s?\d+|\d단계)$/, ""), c.head.replace(STEP_LEAD, "")].filter(Boolean).join(" "), bullets: c.bullets, note: c.note })),
              w,
            ),
            px(3),
          ),
        ];
      case "timeline":
        if (b.variant === "dots") return [...title, this.host(this.dots(b.cells, w), px(3))];
        return [...title, this.host(this.chevronTimeline(b.cells.map((c) => ({ title: c.head, bullets: c.bullets, note: c.note })), w), px(3))];
      case "hub":
        return [...title, ...this.hub(b, w)];
      case "voices":
        return [...title, this.host(this.voices(b.cells, w), px(3))];
      case "define": {
        const paras: Para[] = [this.para({ align: "LEFT" }, [this.run(" ", { ...HEAD, pt: F.label, shade: G.g4 }), ...this.rich(b.title, { ...HEAD, pt: F.label, color: WHITE, shade: G.g4 }), this.run("   ", { ...HEAD, pt: F.label, shade: G.g4 })], HEAD)];
        if (b.text) paras.push(this.p(b.text, BODY, { chars: true }));
        if (b.items.length) {
          const chips: Inline[] = [];
          b.items.forEach((x, i) => {
            if (i) chips.push(this.run(" → ", { face: "label", pt: 10, bold: true, color: G.g4 }));
            chips.push(...this.rich(x, { face: "dotumB", pt: F.small, box: all(HAIR5, G.g0) }));
          });
          paras.push(this.para({ align: "LEFT", before: px(3), line: pct(LH.chip) }, chips, BODY));
        }
        return [this.host(this.table([w], [lineH()], [{ r: 0, c: 0, paras, box: all(HAIR), m: [px(6), px(6), 0, px(4)], va: "TOP" }]), px(5))];
      }
      case "band": {
        const text = this.para({ align: "CENTER", line: pct(LH.band) }, [this.run("▶ ", HEAD), ...this.rich(b.text, HEAD), this.run(" ◀", HEAD)], HEAD);
        if (!b.label) return [this.host(this.table([w], [lineH()], [{ r: 0, c: 0, paras: [text], box: all(HAIR) }]), px(5))];
        const lw = mm(Math.max(18, textEm(b.label) * F.label * (25.4 / 72) + 16 * (25.4 / 96)));
        const colW = this.cols(w, [lw, mm(2), { fr: 1 }]);
        return [
          this.host(
            this.table(colW, [lineH()], [
              { r: 0, c: 0, paras: [this.para({ align: "CENTER", line: pct(LH.band) }, [this.run(flat(b.label), LABEL)], LABEL)], box: all(HAIR, G.g2), m: [px(8), px(8), 0, 0] },
              { r: 0, c: 1, paras: [], m: M0 },
              { r: 0, c: 2, paras: [text], box: all(HAIR) },
            ]),
            px(5),
          ),
        ];
      }
      case "banner": {
        // 메시지 띠: 굵은 테두리 + 오른쪽·아래 그림자(굵은 회색 선). 아래 중괄호는 1회차에서 뺌
        const line = { pt: 0.9, color: G.g5 };
        const shadow = { pt: 1.4, color: G.g4 };
        return [this.host(this.table([w], [lineH()], [{ r: 0, c: 0, paras: [this.p(b.text, BODY_B, { align: "CENTER" })], box: { l: line, t: line, r: shadow, b: shadow }, m: [px(6), px(6), px(2), px(2)] }]), px(6))];
      }
      case "quotes":
        return [this.host(this.quotes(b.cells, w), 0)];
      case "case":
        return [this.host(this.caseBox(b, w), px(5))];
      case "chart": {
        // 막대가 행 오른쪽이 아니면 48mm로 가운데(화면 max-width 48mm)
        const cw = Math.min(w, mm(48));
        const t = this.chart({ title: b.title, series: b.series, badge: b.badge }, cw);
        return [this.host(cw < w ? this.center(t, w) : t, px(5))];
      }
      case "subhead":
        return [this.p(b.text, { face: "dotumB", pt: F.subhead }, { align: "LEFT", before: px(7), after: px(2), line: pct(LH.subhead) })];
      case "qa":
        return [...title, this.host(this.qa(b.cells, w), px(3))];
      case "table":
        if (b.variant === "result") return [...title, this.host(this.resultTable(b, w), px(3))];
        if (b.variant === "ladder") return [...title, this.host(this.ladderTable(b, w), px(3))];
        return [...title, this.host(this.gridTable(b, w, wMm), px(3))];
      case "strategy":
        return [...title, this.host(this.strategy(b, w), px(3))];
      case "stats":
        // 수치 띠 = 추진성과 불릿(화면 section-html statsUl — 칸마다 「성과 문장(^{시점}수치)」). 상자는 놓인 자리가 정함(blocksBody)
        return [...title, ...this.statsUl(b)];
      default: {
        const kind = String((b as { kind?: unknown }).kind);
        if (!KNOWN_KINDS.has(kind)) this.warnings.push(`모르는 블록 종류 「${kind}」 — 글만 불릿으로 옮겼습니다.`);
        return this.ul(blockTexts(b));
      }
    }
  }

  /** 좁은 표를 판 폭 가운데에(테두리 없는 3칸 — 최상위 표는 모두 본문 폭) */
  center(t: Table, w: number): Table {
    const side = Math.floor((w - t.pos.width) / 2);
    const colW = [side, t.pos.width, w - side - t.pos.width];
    return this.table(colW, [lineH()], [
      { r: 0, c: 0, paras: [], m: M0 },
      { r: 0, c: 1, paras: [this.host(t)], m: M0 },
      { r: 0, c: 2, paras: [], m: M0 },
    ]);
  }

  /** 기존 → 개선 표(before_after): 구 분 15% · 기 존 39% · 화살표 6% · 개 선 40% */
  beforeAfter(rows: Block["rows"], w: number): Table {
    const colW = this.cols(w, [{ fr: 15 }, { fr: 39 }, { fr: 6 }, { fr: 40 }]);
    const H11: CS = { face: "dotumB", pt: F.box };
    const n = rows.length;
    const cells: TCell[] = [
      { r: 0, c: 0, paras: [this.p("구 분", H11, { align: "CENTER", line: pct(LH.ba) })], box: { fill: G.g2 }, m: [px(5), px(5), px(2), px(2)] },
      { r: 0, c: 1, paras: [this.p("기 존", H11, { align: "CENTER", line: pct(LH.ba) })], box: { fill: G.g2 }, m: [px(5), px(5), px(2), px(2)] },
      { r: 0, c: 2, paras: [], m: M0 },
      { r: 0, c: 3, paras: [this.p("개 선", { ...H11, color: WHITE }, { align: "CENTER", line: pct(LH.ba) })], box: { l: THICK, r: THICK, t: THICK, fill: G.g4 }, m: [px(5), px(5), px(2), px(2)] },
    ];
    rows.forEach((r, i) => {
      const last = i === n - 1;
      cells.push({ r: i + 1, c: 0, paras: [this.p(r.key, H11, { align: "CENTER", line: pct(LH.ba) })], box: { b: HAIR3, r: HAIR3 }, m: [px(5), px(5), px(2), px(2)] });
      cells.push({ r: i + 1, c: 1, paras: this.ul(r.before), box: { b: HAIR3 }, m: [px(5), px(5), px(2), px(2)] });
      if (i === 0) cells.push({ r: 1, c: 2, rs: n, paras: [this.para({ align: "CENTER" }, [this.run("▶", { face: "label", pt: 16, bold: true, color: G.g3 })], BODY)], m: M0 });
      cells.push({ r: i + 1, c: 3, paras: this.ul(r.after), box: { l: THICK, r: THICK, b: last ? THICK : HAIR3 }, m: [px(5), px(5), px(2), px(2)] });
    });
    return this.table(colW, [lineH(F.box), ...rows.map(() => lineH())], cells);
  }

  /** 전후 비교 두 패널(panels·diag): As-Is ▶ To-Be, 항목마다 번호(기존 ➀➁➂ · 개선 ➊➋➌) — 그림은 패널 안(왼·오른)·가운데 */
  panels(b: Block, w: number): Para[] {
    const NUM = ["➀➁➂➃➄", "➊➋➌➍➎"];
    const diag = b.variant === "diag";
    const TAG = diag ? ["현황·문제", "추진방향"] : ["As-Is", "To-Be"];
    const LEAD_TAG = diag ? /^(현황\s*[·･ㆍ및]?\s*문제점?|추진\s?방향)\s*[:：-]?\s*/ : /^(As-?Is|To-?Be)\s*[:：-]?\s*/i;
    const center = (b.figures ?? []).find((f) => f.pos === "center");
    const midW = center ? mm(figureMm(center).w + 4) : mm(8);
    const colW = this.cols(w, [{ fr: 1 }, midW, { fr: 1 }]);
    const side = (to: boolean, col: number): TCell[] => {
      const k = to ? 1 : 0;
      const line = to ? THICK : HAIR;
      const headC: CS = to ? { ...HEAD, color: WHITE } : HEAD;
      const head = this.para({ align: "CENTER", line: pct(LH.panel) }, [...this.tag(TAG[k], to, headC), ...this.rich((b.items[k] ?? "").replace(LEAD_TAG, ""), headC)], HEAD);
      const items = b.rows.map((r, i) =>
        this.para({ align: "JUSTIFY", left: 0, indent: -Math.round(1.3 * F.body * 100), chars: true }, [
          this.run(`${[...NUM[k]][i] ?? ""} `, { face: "num", pt: F.body }),
          ...(r.key ? this.tag(r.key) : []),
          ...this.rich((to ? r.after : r.before).join(" / ").replace(LEAD_NUM, ""), BODY),
        ]),
      );
      const figs = (b.figures ?? []).filter((f) => f.pos === (to ? "right" : "left"));
      const bodyW = inner(colW[col], [px(5), px(5), px(2), px(3)]);
      const body = figs.length ? [this.withFiguresList(items, figs, bodyW)] : items;
      return [
        { r: 0, c: col, paras: [head], box: { l: line, r: line, t: line, b: HAIR, fill: to ? G.g4 : G.g1 }, m: [px(4), px(4), 0, 0] },
        { r: 1, c: col, paras: body, box: { l: line, r: line, b: line }, m: [px(5), px(5), px(2), px(3)] },
      ];
    };
    const mid: TCell = {
      r: 0,
      c: 1,
      rs: 2,
      paras: center ? [this.host(this.figBox(center), 0, "CENTER")] : [this.para({ align: "CENTER" }, [this.run("▶", { face: "label", pt: 16, bold: true, color: G.g3 })], BODY)],
      m: center ? [mm(2), mm(2), 0, 0] : M0,
    };
    return [this.host(this.table(colW, [lineH(), lineH()], [...side(false, 0), mid, ...side(true, 2)]), px(3))];
  }

  /** 패널 안 목록 옆 그림(화면 .k-panel__b flex): 테두리 없는 [목록][사이 2mm][그림] */
  withFiguresList(items: Para[], figs: Figure[], w: number): Para {
    const parts: number[] = [0];
    const cells: TCell[] = [{ r: 0, c: 0, paras: items, m: M0, va: "TOP" }];
    for (const f of figs) {
      cells.push({ r: 0, c: parts.length, paras: [], m: M0 });
      parts.push(mm(2));
      cells.push({ r: 0, c: parts.length, paras: [this.host(this.figBox(f))], m: M0 });
      parts.push(mm(figureMm(f).w));
    }
    parts[0] = Math.max(mm(10), w - parts.reduce((a, v) => a + v, 0));
    return this.host(this.table(parts, [lineH()], cells));
  }

  /** 단계 흐름(process_flow): 굵은 바깥 테두리, 칸마다 머리(번호 칩 + 제목, 회색)·불릿·결과 줄 */
  processFlow(steps: Array<{ title: string; bullets: string[]; note: string }>, w: number): Table {
    const n = Math.max(1, steps.length);
    const colW = this.cols(w, steps.map(() => ({ fr: 1 })));
    const H11: CS = { face: "dotumB", pt: F.box };
    const hasNote = steps.some((s) => s.note);
    const cells: TCell[] = [];
    steps.forEach((s, i) => {
      const lr = { l: i ? HAIR : undefined, r: i < n - 1 ? HAIR : undefined };
      cells.push({ r: 0, c: i, paras: [this.para({ align: "CENTER", line: pct(LH.proc) }, [this.run(String(i + 1), { face: "dotumB", pt: F.tag, box: all(HAIR5, G.g0) }), this.run(" ", H11), ...this.rich(s.title, H11)], H11)], box: { ...lr, fill: G.g2 }, m: [px(10), px(10), 0, 0] });
      cells.push({ r: 1, c: i, paras: s.bullets.length ? this.ul(s.bullets) : [this.empty()], box: lr, m: [BOX_X, BOX_X, px(2), px(2)] });
      if (hasNote) cells.push({ r: 2, c: i, paras: s.note ? [this.p(s.note, BODY_B, { align: "CENTER" })] : [], box: { ...lr, t: HAIR }, m: [px(3), px(3), px(1), px(1)] });
    });
    return this.table(colW, [lineH(F.box), lineH(), ...(hasNote ? [lineH()] : [])], cells, { outline: THICK });
  }

  /** 지그재그 4단계(1↓2 → 3↑4): 3×3 칸 [1|·|4] [▼|·|▲] [2|▶|3] */
  zigzag(cells: BlockCell[], w: number): Table {
    const colW = this.cols(w, [{ fr: 1 }, mm(7), { fr: 1 }]);
    const at = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    const out: TCell[] = cells.map((c, i) => ({
      r: at[i][0],
      c: at[i][1],
      va: "TOP",
      box: all(HAIR),
      m: [px(4), px(4), 0, px(2)],
      paras: [
        this.para({ align: "CENTER", line: pct(LH.zig), box: { b: HAIR } }, [this.run(` ${i + 1}단계 `, { ...HEAD, shade: G.g2 }), this.run(" ", HEAD), ...this.rich(c.head.replace(STEP_LEAD, ""), HEAD)], HEAD),
        ...this.ul(c.bullets),
        ...(c.note ? [this.p(c.note, BODY_B, { align: "CENTER", before: px(2), box: { t: HAIR3 } })] : []),
      ],
    }));
    const arrow = (r: number, c: number, ch: string): TCell => ({ r, c, paras: [this.para({ align: "CENTER", line: pct(LH.zigArr) }, [this.run(ch, { face: "label", pt: 12, bold: true, color: G.g3 })], BODY)], m: M0 });
    const blank = (r: number, c: number): TCell => ({ r, c, paras: [], m: M0 });
    out.push(blank(0, 1), arrow(1, 0, "▼"), blank(1, 1), arrow(1, 2, "▲"), arrow(2, 1, "▶"));
    return this.table(colW, [lineH(), mm(5), lineH()], out, { outline: HAIR3 });
  }

  /** 시기 흐름(셰브론): 칸 사이 JOIN.gapMm ▶, 마지막(당해연도) 머리는 진회색·굵은 테두리, 결과 줄은 칸 바닥 */
  chevronTimeline(steps: Array<{ title: string; bullets: string[]; note: string }>, w: number): Table {
    const parts: Array<number | { fr: number }> = [];
    steps.forEach((_, i) => {
      if (i) parts.push(mm(JOIN.gapMm));
      parts.push({ fr: 1 });
    });
    const colW = this.cols(w, parts);
    const hasNote = steps.some((s) => s.note);
    const rows = hasNote ? 3 : 2;
    const H11: CS = { face: "dotumB", pt: F.box };
    const cells: TCell[] = [];
    steps.forEach((s, i) => {
      const col = i * 2;
      const cur = i === steps.length - 1;
      const line = cur ? THICK : HAIR;
      if (i) cells.push({ r: 0, c: col - 1, rs: rows, paras: [this.para({ align: "CENTER" }, [this.run("▶", { face: "label", pt: 9, bold: true, color: G.g4 })], BODY)], m: M0 });
      cells.push({ r: 0, c: col, paras: [this.para({ align: "CENTER", line: pct(LH.tl) }, this.rich(s.title, cur ? { ...H11, color: WHITE } : H11), H11)], box: { l: HAIR, r: HAIR, t: HAIR, b: line, fill: cur ? G.g4 : G.g2 }, m: [px(2), px(2), 0, 0] });
      cells.push({ r: 1, c: col, va: "TOP", paras: s.bullets.length ? this.ul(s.bullets) : [this.empty()], box: { l: line, r: line, b: hasNote ? null : line }, m: [BOX_X, BOX_X, px(1), px(1)] });
      if (hasNote) cells.push({ r: 2, c: col, va: "BOTTOM", paras: s.note ? [this.p(s.note, BODY_B, { align: "CENTER" })] : [], box: { l: line, r: line, b: line }, m: [BOX_X, BOX_X, px(1), px(1)] });
    });
    return this.table(colW, [lineH(F.box), lineH(), ...(hasNote ? [lineH()] : [])], cells);
  }

  /**
   * 점 연혁(dots): 연도 칩(마지막 진회색) · 점 · 글 · 덧글 칩. 선은 점 행을 위·아래 반 칸 두 행으로 나눈 경계선(t 테두리) —
   * 칸마다 [왼][점 4mm][오른]으로 나눠 점 칸만 두 행을 합쳐 점(◉)이 선의 한가운데를 가림
   */
  dots(cells: BlockCell[], w: number): Table {
    const parts: Array<number | { fr: number }> = [];
    cells.forEach(() => parts.push({ fr: 1 }, mm(4), { fr: 1 }));
    const colW = this.cols(w, parts);
    const out: TCell[] = [];
    const yr: CS = { face: "label", pt: 9, bold: true };
    const line = HAIR5;
    cells.forEach((c, i) => {
      const cur = i === cells.length - 1;
      const col = i * 3;
      out.push({ r: 0, c: col, cs: 3, paras: [this.para({ align: "CENTER" }, this.rich(c.head, cur ? { ...yr, color: WHITE, shade: G.g4 } : { ...yr, box: all(HAIR5, G.g0) }), yr)], m: [px(3), px(3), px(3), 0] });
      for (const k of [0, 2]) {
        out.push({ r: 1, c: col + k, paras: [this.empty()], m: M0 });
        out.push({ r: 2, c: col + k, paras: [this.empty()], m: M0, box: { t: line } });
      }
      out.push({ r: 1, c: col + 1, rs: 2, paras: [this.para({ align: "CENTER", line: 100 }, [this.run("◉", { face: "label", pt: 9, color: G.g5 })], BODY)], m: M0 });
      out.push({
        r: 3,
        c: col,
        cs: 3,
        va: "TOP",
        paras: [...c.bullets.map((x) => this.p(x, BODY, { align: "LEFT", chars: true })), ...(c.note ? [this.para({ align: "CENTER", before: px(2) }, this.rich(c.note, { face: "label", pt: 8.5, bold: true, box: all(HAIR5) }), BODY)] : [])],
        m: [px(3), px(3), 0, px(3)],
      });
    });
    const half = Math.round(lineH(9, 0) / 2);
    return this.table(colW, [lineH(9), half, half, lineH()], out, { outline: HAIR });
  }

  /** 협업 구조: 기관 둘이면 [기관 ⇄ 가운데 ⇄ 기관], 그 밖이면 [가운데 ⇄ 기관 목록 표] — 가운데 칸 머리 진회색, 로고 묶음은 가운데 칸 안 */
  hub(b: Block, w: number): Para[] {
    const [center, ...nodes] = b.cells;
    if (!center) return this.ul(blockTexts(b));
    const link = (r: number, c: number): TCell => ({ r, c, paras: [this.para({ align: "CENTER" }, [this.run("⇄", { face: "label", pt: 13, bold: true, color: G.g4 })], BODY)], m: M0 });
    const logos = (b.figures ?? []).filter((f) => f.pos === "center");
    const mid = (cw: number): Para[] => [
      this.para({ align: "CENTER", line: pct(LH.hub), box: { fill: G.g4 } }, this.rich(center.head, { ...HEAD, color: WHITE }), HEAD),
      ...(logos.length ? [this.logoRow(logos, inner(cw, [px(5), px(5), 0, px(2)]))] : []),
      ...this.ul(center.bullets),
    ];
    if (nodes.length === 2) {
      const colW = this.cols(w, [{ fr: 1 }, mm(9), { fr: 1.2 }, mm(9), { fr: 1 }]);
      const node = (c: BlockCell, col: number): TCell => ({
        r: 0,
        c: col,
        box: all(HAIR),
        m: [px(5), px(5), px(2), px(3)],
        paras: [this.para({ align: "CENTER", line: pct(LH.hub), box: all(HAIR5, G.g0) }, this.rich(c.head, HEAD), HEAD), this.p(c.bullets.join(" / "), BODY, { align: "CENTER", chars: true })],
      });
      return [this.host(this.table(colW, [lineH()], [node(nodes[0], 0), link(0, 1), { r: 0, c: 2, paras: mid(colW[2]), box: all(HAIR), m: [px(5), px(5), 0, px(2)], va: "CENTER" }, link(0, 3), node(nodes[1], 4)]), px(3))];
    }
    const colW = this.cols(w, [{ fr: 0.9 }, mm(9), { fr: 1.6 }]);
    const listW = colW[2];
    const lw = this.cols(listW, [{ fr: 3 }, { fr: 7 }]);
    const list = this.table(
      lw,
      nodes.map(() => lineH()),
      nodes.flatMap((c, i): TCell[] => [
        { r: i, c: 0, paras: [this.p(c.head, { ...HEAD, pt: 10.2 }, { align: "CENTER", line: pct(LH.hubList) })], box: all(HAIR, G.g1), m: [px(4), px(4), px(1), px(1)] },
        { r: i, c: 1, paras: this.ul(c.bullets), box: all(HAIR), m: [px(4), px(4), px(1), px(1)] },
      ]),
    );
    const cells: TCell[] = [{ r: 0, c: 0, paras: mid(colW[0]), box: all(HAIR), m: [px(5), px(5), 0, px(2)] }, link(0, 1), { r: 0, c: 2, paras: nodes.length ? [this.host(list)] : [], m: M0 }];
    return [this.host(this.table(colW, [lineH()], cells), px(3))];
  }

  /** 로고 묶음(가운데 칸 안 — 그림 자리 상자를 나란히) */
  logoRow(figs: Figure[], w: number): Para {
    const parts: number[] = [];
    const cells: TCell[] = [];
    figs.forEach((f, i) => {
      if (i) {
        cells.push({ r: 0, c: parts.length, paras: [], m: M0 });
        parts.push(mm(1.5));
      }
      cells.push({ r: 0, c: parts.length, paras: [this.host(this.figBox(f))], m: M0 });
      parts.push(mm(figureMm(f).w));
    });
    const used = parts.reduce((a, v) => a + v, 0);
    if (used >= w) return this.host(this.table(parts, [lineH()], cells), px(2), "CENTER");
    return this.host(this.center(this.table(parts, [lineH()], cells), w), px(2));
  }

  /** 현장 목소리: 두 칸씩 [이름 칩 15mm][말풍선 “…”] */
  voices(cells: BlockCell[], w: number): Table {
    const per = Math.min(2, Math.max(1, cells.length));
    const parts: Array<number | { fr: number }> = [];
    for (let i = 0; i < per; i++) {
      if (i) parts.push(mm(4));
      parts.push(mm(15 + 3), { fr: 1 });
    }
    const colW = this.cols(w, parts);
    const out: TCell[] = [];
    const rows = Math.ceil(cells.length / per);
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < per; k++) {
        const c = cells[r * per + k];
        const col = k * 3;
        if (k) out.push({ r, c: col - 1, paras: [], m: M0 });
        if (!c) {
          out.push({ r, c: col, paras: [], m: M0 }, { r, c: col + 1, paras: [], m: M0 });
          continue;
        }
        out.push({ r, c: col, paras: [this.para({ align: "CENTER", line: pct(LH.voice) }, this.rich(c.head || "현장", { face: "dotumB", pt: 7.5, color: WHITE, shade: G.g4 }), BODY)], m: [0, mm(3), px(3), px(3)] });
        out.push({ r, c: col + 1, paras: [this.para({ align: "CENTER", chars: true }, [this.run("“", BODY), ...this.rich(c.bullets[0] ?? "", BODY), this.run("”", BODY)])], box: all(HAIR), m: [px(6), px(6), px(2), px(2)] });
      }
    }
    return this.table(colW, Array.from({ length: rows }, () => lineH()), out);
  }

  /** 인용 상자: 머리(칩 + 제목, 연회색)·“인용”(출처 작은 글). 상자 사이 6mm */
  quotes(cells: BlockCell[], w: number): Table {
    const parts: Array<number | { fr: number }> = [];
    cells.forEach((_, i) => {
      if (i) parts.push(mm(6));
      parts.push({ fr: 1 });
    });
    const colW = this.cols(w, parts.length ? parts : [{ fr: 1 }]);
    const out: TCell[] = [];
    cells.forEach((c, i) => {
      const col = i * 2;
      if (i) out.push({ r: 0, c: col - 1, rs: 2, paras: [], m: M0 });
      out.push({ r: 0, c: col, paras: [this.para({ align: "CENTER", line: pct(LH.ctx) }, [...this.tag(c.tag, false, HEAD), ...this.rich(c.head, HEAD)], HEAD)], box: { l: HAIR, r: HAIR, t: HAIR, b: HAIR, fill: G.g1 }, m: [px(4), px(4), 0, 0] });
      const items: Inline[] = [this.run("“", BODY), ...this.rich(c.bullets[0] ?? "", BODY), this.run("”", BODY)];
      if (c.note) items.push(this.run("(", { ...BODY, pt: F.small }), ...this.rich(c.note.replace(/^\(|\)$/g, ""), { ...BODY, pt: F.small }), this.run(")", { ...BODY, pt: F.small }));
      out.push({ r: 1, c: col, paras: [this.para({ bullet: true }, items)], box: { l: HAIR, r: HAIR, b: HAIR }, m: [px(5), px(5), px(2), px(3)] });
    });
    return this.table(colW, [lineH(), lineH()], out);
  }

  /** 우수사례 상자: 머리(진회색 탭 + 제목, 연회색) · 줄(「라벨 | 내용」은 칩 + 글) · 그림은 오른쪽 칸 */
  caseBox(b: Block, w: number): Table {
    const fig = (b.figures ?? [])[0];
    const colW = fig ? this.cols(w, [{ fr: 1 }, mm(figureMm(fig).w)]) : [w];
    const H11: CS = { face: "dotumB", pt: F.box };
    const items = b.items.map((x) => {
      const m = /^([^|:：]{1,8}?)\s*[|:：]\s+(.+)$/.exec(x);
      return m ? this.para({ align: "JUSTIFY", chars: true }, [...this.tag(m[1]), ...this.rich(m[2], BODY)]) : this.para({ bullet: true }, this.rich(x, BODY));
    });
    const cells: TCell[] = [
      { r: 0, c: 0, paras: [this.para({ align: "CENTER", line: pct(LH.caseHead) }, [this.run(` ${flat(b.label || "우수사례")}  `, { ...H11, color: WHITE, shade: G.g4 }), this.run("  ", H11), ...this.rich(b.title, H11)], H11)], box: { fill: G.g1 }, m: [0, px(4), 0, 0] },
      { r: 1, c: 0, paras: items.length ? items : [this.empty()], m: [px(5), px(5), px(2), px(3)], va: "TOP" },
    ];
    if (fig) cells.push({ r: 0, c: 1, rs: 2, paras: [this.host(this.figBox(fig))], box: { l: { pt: 0.75, color: G.g4, type: "DASH" } }, m: M0 });
    return this.table(colW, [lineH(F.box), lineH()], cells, { outline: HAIR });
  }

  /**
   * 막대(화면 miniChartHtml의 SVG — 값 → 높이, 마지막 막대 진하게): 표 칸으로. 막대마다 안쪽 표 한 개(세로 3행 —
   * [위 빈 칸 = 최대 − 막대][값 글 줄][막대 칸 = 값 비율 × 최대])라 막대 높이가 값 비율 그대로(층 나눔 없음)이고 값 글이 막대 바로 위에 붙음.
   * 열은 SVG와 같은 비례(양끝 10, 칸마다 막대 폭 min(26, 칸 × 0.5)). 최대 막대 높이는 SVG와 같은 54/150 폭.
   * 값이 【확인: …】이면 노란 점선 빈 막대(최대의 55%) + 「확인」
   */
  chart(c: MiniChart, w: number): Table {
    const n = Math.max(1, c.series.length);
    const vals = c.series.map((s) => (/【확인:/.test(s.value) ? 0 : Number((s.value.match(/\d[\d,]*(?:\.\d+)?/)?.[0] ?? "0").replace(/,/g, ""))));
    const max = Math.max(...vals, 1);
    const slot = 130 / n;
    const bw = Math.min(26, slot * 0.5);
    const parts: Array<{ fr: number }> = [{ fr: 10 }];
    for (let i = 0; i < n; i++) parts.push({ fr: (slot - bw) / 2 }, { fr: bw }, { fr: (slot - bw) / 2 });
    parts.push({ fr: 10 });
    const colW = this.cols(w, parts);
    const ncol = colW.length;
    const unit = w / 150;
    const maxBar = Math.round(54 * unit);
    const valH = Math.round(9.5 * 100 * 1.2);
    const head = Boolean(c.title || c.badge);
    const r0 = head ? 1 : 0;
    const cells: TCell[] = [];
    if (head)
      cells.push({
        r: 0,
        c: 0,
        cs: ncol,
        paras: [this.para({ align: "CENTER", line: pct(LH.chart) }, [...this.rich(c.title, { ...HEAD, pt: F.small }), ...(c.badge ? [this.run(" ", HEAD), this.run(plain(c.badge), { face: "dotumB", pt: F.tag, color: WHITE, shade: G.g5 })] : [])], HEAD)],
        box: { b: HAIR, fill: G.g1 },
        m: [px(3), px(3), 0, 0],
      });
    const tiny = () => [this.empty()];
    const labRow = r0 + 1;
    for (const r of [r0, labRow]) cells.push({ r, c: 0, paras: tiny(), m: M0, box: r === r0 ? { b: HAIR } : {} }, { r, c: ncol - 1, paras: tiny(), m: M0, box: r === r0 ? { b: HAIR } : {} });
    c.series.forEach((s, i) => {
      const col = 1 + i * 3;
      const need = /【확인:/.test(s.value);
      const bar = need ? Math.round(maxBar * 0.55) : Math.max(Math.round(2 * unit), Math.round((maxBar * vals[i]) / max));
      const dash: Line = { pt: 0.8, color: NEED.line, type: "DASH" };
      const sideW = colW[col];
      const barW = colW[col + 1];
      const inW = [sideW, barW, colW[col + 2]];
      const barBox: Box = need ? { l: dash, r: dash, t: dash, b: dash, fill: NEED.bg } : { fill: i === n - 1 ? G.g4 : G.g2, b: HAIR };
      const inner3 = this.table(inW, [Math.max(1, maxBar - bar), valH, bar], [
        { r: 0, c: 0, cs: 3, paras: tiny(), m: M0 },
        { r: 1, c: 0, cs: 3, va: "BOTTOM", m: M0, paras: [this.para({ align: "CENTER", line: 100 }, [this.run(need ? "확인" : plain(s.value), need ? { face: "dotumB", pt: 9, color: NEED.label } : { face: "dotumB", pt: 9.5 })], BODY)] },
        { r: 2, c: 0, paras: tiny(), m: M0, box: { b: HAIR } },
        { r: 2, c: 1, paras: tiny(), m: M0, box: barBox },
        { r: 2, c: 2, paras: tiny(), m: M0, box: { b: HAIR } },
      ]);
      cells.push({ r: r0, c: col, cs: 3, va: "BOTTOM", m: M0, paras: [this.host(inner3)], box: { b: HAIR } });
      cells.push({ r: labRow, c: col, cs: 3, va: "TOP", m: M0, paras: [this.para({ align: "CENTER", line: 100 }, [this.run(plain(s.label), { face: "dotumB", pt: 8.5, color: "#333333" })], BODY)] });
    });
    const rowH = [...(head ? [lineH(F.small, 0)] : []), maxBar + valH, Math.round(16 * unit)];
    return this.table(colW, rowH, cells, { outline: HAIR });
  }

  /** Q&A 상자: 쌍마다 Q 표지(진회색) + 질문(돋움 굵게), A 표지(흰 바탕 테두리) + 답(하나면 불릿 없이) */
  qa(cells: BlockCell[], w: number): Table {
    const colW = this.cols(w, [mm(6), { fr: 1 }]);
    const out: TCell[] = [];
    const mark = (ch: string, a: boolean) => this.para({ align: "CENTER", line: pct(LH.qaMark) }, [this.run(ch, a ? { face: "dotumB", pt: F.tag, color: G.g5, box: all(HAIR5, G.g0) } : { face: "dotumB", pt: F.tag, color: WHITE, shade: G.g5 })], BODY);
    cells.forEach((c, i) => {
      out.push({ r: i * 2, c: 0, va: "TOP", paras: [mark("Q", false)], m: [px(6), 0, px(2), 0] });
      out.push({ r: i * 2, c: 1, va: "TOP", paras: [this.p(c.head, HEAD, { align: "LEFT", line: pct(LH.qa) })], m: [0, px(6), px(2), 0] });
      out.push({ r: i * 2 + 1, c: 0, va: "TOP", paras: [mark("A", true)], m: [px(6), 0, 0, mm(0.8)] });
      out.push({ r: i * 2 + 1, c: 1, va: "TOP", paras: c.bullets.length === 1 ? [this.p(c.bullets[0], BODY, { chars: true })] : this.ul(c.bullets), m: [0, px(6), 0, mm(0.8)] });
    });
    return this.table(colW, cells.flatMap(() => [lineH(), lineH()]), out, { outline: HAIR });
  }

  /** 수치 표(기본·막대·쉐브론): 머리 줄 = items(첫째 = 행 머리 열), 행 머리 열 폭은 판면 어림(fit.ts tableRowHeadMm)과 같은 규칙 */
  gridTable(b: Block, w: number, wMm: number): Table {
    const head = mm(tableRowHeadMm(wMm));
    const nv = Math.max(1, b.items.length - 1);
    const colW = this.cols(w, [head, ...Array.from({ length: nv }, () => ({ fr: 1 }))]);
    const chev = b.variant === "chevron";
    const bars = b.variant === "bars";
    const cells: TCell[] = b.items.map((x, i): TCell => {
      const dark = chev && i > 0;
      return {
        r: 0,
        c: i,
        paras: [this.p(x, dark ? { ...LABEL, color: WHITE } : LABEL, { align: "CENTER", line: pct(LH.tbl) })],
        box: { t: THICK, b: HAIR, l: i ? { pt: ST.line.hair, color: G.g0 } : undefined, fill: dark ? (i === b.items.length - 1 ? G.g5 : G.g4) : G.g2 },
        m: [px(4), px(4), px(1), px(1)],
      };
    });
    const last = b.cells.length - 1;
    b.cells.forEach((c, i) => {
      const bottom = i === last ? HAIR : HAIR3;
      cells.push({ r: i + 1, c: 0, paras: [this.p(c.head, { ...HEAD, pt: F.label }, { align: "CENTER", line: pct(LH.tbl) })], box: { b: bottom, fill: G.g1 }, m: [px(4), px(4), px(1), px(1)] });
      const lens = bars ? tableBars(c.bullets) : [];
      for (let k = 0; k < nv; k++) {
        const x = c.bullets[k] ?? "";
        const cw = inner(colW[k + 1], [px(4), px(4), px(1), px(1)]);
        const len = lens[k];
        const paras = len == null ? (x ? [this.p(x, BODY, { align: chev ? "LEFT" : "CENTER", chars: true })] : [this.empty()]) : [this.barCell(x, len, cw)];
        cells.push({ r: i + 1, c: k + 1, paras, box: { b: bottom, l: HAIR3 }, va: chev ? "TOP" : "CENTER", m: [px(4), px(4), px(1), px(1)] });
      }
    });
    return this.table(colW, [lineH(F.label), ...b.cells.map(() => lineH())], cells);
  }

  /** 막대 표 값 칸: [값(오른쪽 맞춤)][사이][막대 14mm(채운 길이 = 비율)] */
  barCell(x: string, pct: number, w: number): Para {
    const track = mm(TABLE_SHAPE_MM.bar);
    const colW = this.cols(w, [{ fr: 1 }, mm(TABLE_SHAPE_MM.barGap), track]);
    const fillW = Math.max(1, Math.min(track - 1, Math.round((track * pct) / 100)));
    const barParts = pct >= 100 ? [track] : [fillW, track - fillW];
    const bar = this.table(barParts, [mm(2.6)], barParts.map((_, i): TCell => ({ r: 0, c: i, paras: [this.empty()], m: M0, box: i === 0 ? { fill: G.g4, t: HAIR3, b: HAIR3, l: HAIR3, r: barParts.length === 1 ? HAIR3 : undefined } : { fill: G.g1, t: HAIR3, b: HAIR3, r: HAIR3 } })));
    return this.host(
      this.table(colW, [lineH()], [
        { r: 0, c: 0, paras: [this.p(x, BODY, { align: "RIGHT", chars: true })], m: M0 },
        { r: 0, c: 1, paras: [], m: M0 },
        { r: 0, c: 2, paras: [this.host(bar)], m: M0 },
      ]),
    );
  }

  /** 추진실적 열 표(table:result): 왼쪽 행(행 머리 + 추진내용 불릿) · 오른쪽 한 칸(진회색 — 「추진실적」·큰 수치·뜻·결과 줄) */
  resultTable(b: Block, w: number): Table {
    const wMm = w / HU_PER_MM;
    const right = mm(TABLE_SHAPE_MM.result);
    const rh = b.cells.some((c) => c.head) ? mm(resultRowHeadMm(wMm)) : 0;
    const colW = this.cols(w, [...(rh ? [rh] : []), { fr: 1 }, right]);
    const off = rh ? 1 : 0;
    const W9: CS = { face: "dotumB", pt: F.small, color: WHITE };
    const res: Para[] = [
      this.para({ align: "CENTER", line: pct(LH.resHead), box: { b: { pt: ST.line.hair, color: G.g0 } }, after: px(1) }, [this.run("추진실적", W9)], W9),
      ...b.series.flatMap((x) => [this.p(x.value, { face: "dotumB", pt: F.stat, color: WHITE }, { align: "CENTER", before: px(1), line: pct(LH.resValue) }), ...(x.label ? [this.p(x.label, W9, { align: "CENTER", line: pct(LH.resLine) })] : [])]),
      ...(b.text ? [this.p(b.text, W9, { align: "CENTER", before: px(2), line: pct(LH.resLine) })] : []),
    ];
    const n = Math.max(1, b.cells.length);
    const cells: TCell[] = [];
    b.cells.forEach((c, i) => {
      const bottom = i === n - 1 ? HAIR : HAIR3;
      if (rh) cells.push({ r: i, c: 0, paras: [this.p(c.head, { ...HEAD, pt: F.label }, { align: "CENTER", line: pct(LH.tbl) })], box: { b: bottom, fill: G.g1, t: i === 0 ? THICK : undefined }, m: [px(4), px(4), px(1), px(1)] });
      cells.push({ r: i, c: off, paras: this.ul(c.bullets), box: { b: bottom, l: off ? HAIR3 : undefined, t: i === 0 ? THICK : undefined }, m: [px(4), px(4), px(1), px(1)] });
    });
    cells.push({ r: 0, c: off + 1, rs: n, paras: res, box: { fill: G.g5, l: { pt: ST.line.hair, color: G.g5 }, t: THICK, b: HAIR }, m: [px(4), px(4), px(2), px(2)] });
    return this.table(colW, Array.from({ length: n }, () => lineH()), cells);
  }

  /** 2단 라벨 표(table:ladder): 큰 라벨(이어진 같은·빈 글은 한 칸 — ladderGroups) · 하위 라벨(있을 때) · 내용 불릿 */
  ladderTable(b: Block, w: number): Table {
    const sub = b.cells.some((c) => c.tag);
    const colW = this.cols(w, [mm(TABLE_SHAPE_MM.ladderBig), ...(sub ? [mm(TABLE_SHAPE_MM.ladderSub)] : []), { fr: 1 }]);
    const n = b.cells.length;
    const cells: TCell[] = [];
    const m: [number, number, number, number] = [px(4), px(4), px(1), px(1)];
    for (const g of ladderGroups(b.cells)) {
      const end = g.start + g.rows === n;
      cells.push({ r: g.start, c: 0, rs: g.rows, paras: [this.p(g.head, { ...HEAD, pt: F.label }, { align: "CENTER", line: pct(LH.tbl) })], box: { fill: G.g2, r: HAIR, b: end ? HAIR : HAIR3, t: g.start === 0 ? THICK : undefined }, m });
      for (let i = g.start; i < g.start + g.rows; i++) {
        const bottom = i === n - 1 ? HAIR : HAIR3;
        const top = i === 0 ? THICK : undefined;
        if (sub) cells.push({ r: i, c: 1, paras: [this.p(b.cells[i].tag, { ...HEAD, pt: F.label }, { align: "LEFT", line: pct(LH.tbl) })], box: { fill: G.g1, r: HAIR3, b: bottom, t: top }, m });
        cells.push({ r: i, c: sub ? 2 : 1, paras: this.ul(b.cells[i].bullets), box: { b: bottom, t: top }, m });
      }
    }
    return this.table(colW, b.cells.map(() => lineH()), cells);
  }

  /** 전략체계도: 왼쪽 층 이름 열(16mm, 있을 때) + 목표 띠(진회색) → 열 머리 → 과제 → 지표 행 */
  strategy(b: Block, w: number): Table {
    const n = Math.max(1, b.cells.length);
    const tier = b.items.length > 0;
    const colW = this.cols(w, [...(tier ? [mm(16)] : []), ...Array.from({ length: n }, () => ({ fr: 1 }))]);
    const off = tier ? 1 : 0;
    const cells: TCell[] = [];
    const rowH: number[] = [];
    let r = 0;
    let layer = 0;
    const m: [number, number, number, number] = [px(3), px(3), px(2), px(2)];
    const th = () => {
      const i = layer++;
      if (tier) cells.push({ r, c: 0, paras: [this.p(b.items[i] ?? "", { ...HEAD, pt: F.small }, { align: "CENTER", line: pct(LH.stratTh) })], box: all(HAIR, G.g2), m });
    };
    const H: CS = HEAD;
    if (b.text) {
      th();
      cells.push({ r, c: off, cs: n, paras: [this.p(b.text, { ...H, color: WHITE }, { align: "CENTER", line: pct(LH.stratTop) })], box: all(HAIR, G.g4), m: [px(4), px(4), px(2), px(2)] });
      rowH.push(lineH());
      r++;
    }
    th();
    b.cells.forEach((c, i) => cells.push({ r, c: off + i, paras: [this.para({ align: "CENTER", line: pct(LH.stratHead) }, [...this.tag(c.tag, false, H), ...this.rich(c.head, H)], H)], box: all(HAIR, G.g1), m }));
    rowH.push(lineH());
    r++;
    th();
    b.cells.forEach((c, i) => cells.push({ r, c: off + i, va: "TOP", paras: this.ul(c.bullets), box: all(HAIR), m }));
    rowH.push(lineH());
    r++;
    if (b.cells.some((c) => c.note)) {
      th();
      b.cells.forEach((c, i) => cells.push({ r, c: off + i, paras: c.note ? [this.p(c.note, { ...H, pt: F.small }, { align: "CENTER", line: pct(LH.stratFoot) })] : [], box: all(HAIR, G.g1), m }));
      rowH.push(lineH(F.small));
      r++;
    }
    return this.table(colW, rowH, cells);
  }

  // ───────────────────────── 본문 묶음·머리·추진성과

  /**
   * v3 본문(section-html.ts blocksBody와 같은 묶음 — layoutGroups): 라벨 사다리 행은 이어서 한 표(왼쪽 라벨 18mm), 단 띠는 띠 문단 + 그 아래 전폭,
   * 전폭은 그대로, 가로 반씩 짝은 두 칸 나란히(사이 4mm), 행 끝 막대는 행 오른쪽(42mm, 사이 2.5mm)
   */
  blocksBody(blocks: Block[], own = false): Para[] {
    const out: Para[] = [];
    let rows: Array<{ label: string; units: number[][] }> = [];
    const one = (j: number, w: number) => this.block(blocks[j], w);
    // 수치 띠 상자(화면 statsBox — 소항목 추진성과 상자와 같은 틀, 굵은 불릿 + 오른쪽 막대). 사다리 밖 수치 띠도 상자(own이면 불릿 그대로)
    const statsBox = (label: string, main: number[], chart: number | undefined, w: number) => {
      const c = chart === undefined ? null : blocks[chart];
      return this.resultBox(label, () => main.flatMap((j) => [...this.title(blocks[j]), ...this.statsUl(blocks[j], BODY_B)]), c && { title: c.title, series: c.series, badge: c.badge }, "", w);
    };
    const outer = (j: number, w: number) => (blocks[j].kind === "stats" && !own ? [statsBox(statsBoxLabel(blocks[j]), [j], undefined, w)] : one(j, w));
    const unit = (us: number[], w: number, outside = false): Para[] => {
      const pick = outside ? outer : one;
      if (us.length === 1) return pick(us[0], w);
      const colW = this.cols(w, [{ fr: 1 }, mm(PAIR_GAP_MM), { fr: 1 }]);
      return [
        this.host(
          this.table(colW, [lineH()], [
            { r: 0, c: 0, va: "TOP", m: M0, paras: pick(us[0], colW[0]) },
            { r: 0, c: 1, m: M0, paras: [] },
            { r: 0, c: 2, va: "TOP", m: M0, paras: pick(us[1], colW[2]) },
          ]),
        ),
      ];
    };
    const flush = () => {
      if (!rows.length) return;
      const colW = this.cols(BODY_W, [mm(18), { fr: 1 }]);
      const m: [number, number, number, number] = [px(3), px(3), px(2), px(2)];
      const cw = inner(colW[1], m);
      const cells: TCell[] = [];
      rows.forEach((r, i) => {
        const flatUnits = r.units.flat();
        const last = flatUnits.at(-1)!;
        const single = r.units.every((x) => x.length === 1);
        const withChart = single && flatUnits.length > 1 && blocks[last].kind === "chart";
        let paras: Para[];
        if (withChart) {
          const sideW = this.cols(cw, [{ fr: 1 }, mm(2.5), mm(42)]);
          const main = flatUnits.slice(0, -1).flatMap((j) => one(j, sideW[0]));
          const b = blocks[last];
          paras = [
            this.host(
              this.table(sideW, [lineH()], [
                { r: 0, c: 0, va: "TOP", m: M0, paras: main },
                { r: 0, c: 1, m: M0, paras: [] },
                { r: 0, c: 2, m: M0, paras: [this.host(this.chart({ title: b.title, series: b.series, badge: b.badge }, sideW[2]))] },
              ]),
            ),
          ];
        } else paras = single ? flatUnits.flatMap((j) => one(j, cw)) : r.units.flatMap((us) => unit(us, cw));
        cells.push({ r: i, c: 0, paras: this.labelParas(r.label), box: all(HAIR, G.g2), m });
        cells.push({ r: i, c: 1, paras, box: { r: HAIR, t: HAIR, b: HAIR }, m });
      });
      out.push(this.host(this.table(colW, rows.map(() => lineH()), cells), px(5)));
      rows = [];
    };
    for (const g of layoutGroups(blocks)) {
      if (g.type === "row") {
        const box = statsRow(g, blocks, own);
        if (!box) {
          rows.push({ label: g.label, units: g.units });
          continue;
        }
        flush();
        out.push(statsBox(g.label, box.main, box.chart, BODY_W));
        continue;
      }
      // 소항목 추진성과 상자가 따로 있으면 전폭 수치 띠는 「추진실적」 사다리 행(화면과 같음)
      if (own && g.type === "full" && g.units[0].length === 1 && blocks[g.units[0][0]].kind === "stats") {
        rows.push({ label: STATS_ROW_LABEL, units: g.units });
        continue;
      }
      flush();
      if (g.type === "stage") {
        out.push(this.stage(g.label));
        for (const us of g.units) out.push(...unit(us, BODY_W, true));
        continue;
      }
      out.push(...unit(g.units[0], BODY_W, true));
    }
    flush();
    return out;
  }

  /** 단 띠: 진회색 단 이름 탭(흰 글자) + 판을 가로지르는 아래 선(문단 테두리) */
  stage(label: string): Para {
    const W: CS = { ...HEAD, color: WHITE, shade: G.g5 };
    const m = /^(Step\s?\d+|’\d\d년~?|\d{4}년~?|\d단계)\s*(.*)$/.exec(label);
    const items = m ? [this.run(" ", W), ...this.tag(m[1], false, W), this.run(`${m[2]}   `, W)] : [this.run(` ${flat(label)}   `, W)];
    return this.para({ align: "LEFT", before: px(6), after: px(1), line: pct(LH.stage), box: { b: { pt: 1.2, color: G.g5 } } }, items, HEAD);
  }

  /** 추진성과 상자: [라벨 21mm 진회색][본문 — 3칸·불릿(굵게)·막대][강조 띠] — 굵은 테두리 */
  result(spec: ReportSectionSpec): Para[] {
    const cards = spec.resultCards ?? [];
    const chart = spec.resultChart && spec.resultChart.series.length >= 2 ? spec.resultChart : null;
    if (!cards.length && !spec.results.length && !chart) return [];
    return [this.resultBox("추진성과", (w) => this.resultMain(spec, w), chart, spec.resultBand)];
  }

  /** 추진성과 본문: 3칸(있으면) + 굵은 불릿 — w = 본문 글 칸 폭 */
  resultMain(spec: ReportSectionSpec, w: number): Para[] {
    const cards = spec.resultCards ?? [];
    const main: Para[] = [];
    if (cards.length) {
      const cw = this.cols(w, cards.map(() => ({ fr: 1 })));
      main.push(
        this.host(
          this.table(
            cw,
            [lineH()],
            cards.map((c, i): TCell => ({
              r: 0,
              c: i,
              box: { l: i ? HAIR3 : undefined },
              m: [px(5), px(5), px(1), px(1)],
              paras: [this.para({ align: "CENTER" }, [...(c.tag ? [this.run(`[${flat(c.tag)}] `, BODY_B)] : []), ...this.rich(c.headline, BODY_B)], BODY_B), this.p(c.figure, BODY_B, { align: "CENTER" })],
            })),
          ),
        ),
      );
    }
    main.push(...this.ul(spec.results, BODY_B));
    return main;
  }

  /**
   * 추진성과 상자 틀(2026-10-28 — 소항목 추진성과·수치 띠 상자 공용, 화면 .k-result): [라벨 21mm 진회색][본문(main — 글 칸 폭을 받음) · 막대(오른쪽 42mm)][강조 띠] — 굵은 테두리.
   * width = 상자 폭(가로 반씩 짝이면 반 폭)
   */
  resultBox(label: string, mainOf: (w: number) => Para[], chart: MiniChart | null, band = "", width = BODY_W): Para {
    const bandMm = band ? resultBandMm(band) + 4 : 0;
    const colW = this.cols(width, [mm(21), { fr: 1 }, ...(bandMm ? [mm(bandMm)] : [])]);
    const edge: Line = { pt: 1.2, color: G.g5 };
    const bodyM: [number, number, number, number] = [px(6), px(6), px(3), px(3)];
    const bw = inner(colW[1], bodyM);
    const mainW = chart ? this.cols(bw, [{ fr: 1 }, mm(2.5), mm(42)]) : [bw];
    const main = mainOf(mainW[0]);
    const body = chart
      ? [
          this.host(
            this.table(mainW, [lineH()], [
              { r: 0, c: 0, m: M0, paras: main },
              { r: 0, c: 1, m: M0, paras: [] },
              { r: 0, c: 2, m: M0, paras: [this.host(this.chart(chart, mainW[2]))] },
            ]),
          ),
        ]
      : main;
    const cells: TCell[] = [
      { r: 0, c: 0, paras: [this.p(label, { face: "dotumB", pt: F.resultLabel, color: WHITE }, { align: "CENTER", line: pct(LH.result) })], box: { l: edge, t: edge, b: edge, fill: G.g5 }, m: [px(2), px(2), 0, 0] },
      { r: 0, c: 1, paras: body, box: { t: edge, b: edge, r: bandMm ? undefined : edge, fill: G.g1 }, m: bodyM },
    ];
    if (bandMm && band)
      cells.push({ r: 0, c: 2, paras: [this.p(band, { face: "dotumB", pt: F.box, color: WHITE, shade: G.g5 }, { align: "CENTER", line: pct(LH.resultBand) })], box: { t: edge, b: edge, r: edge }, m: [mm(2), px(5), 0, 0] });
    return this.host(this.table(colW, [lineH()], cells), px(6));
  }

  /** 머리: 대상사업 상자 · 실행과제 띠(번호 칩·BP) · 소항목(가. [칩] 제목 + 마커) */
  heads(spec: ReportSectionSpec): Para[] {
    const H15: CS = { face: "head", pt: F.head };
    const biz = this.para({ align: "LEFT", after: px(5), line: pct(LH.biz) }, [this.run(` 대상사업${spec.business.no} `, { face: "head", pt: F.bizNo, box: all(HAIR, G.g2) }), this.run("  ", H15), this.run(flat(spec.business.name), H15)], H15);
    const marker = (m: string) => (MARKER_STYLE[m] ? [this.run(" ", HEAD), this.run(` ${m} `, MARKER_STYLE[m])] : []);
    const task = this.para(
      { align: "LEFT", after: px(4), line: pct(LH.task), box: { fill: G.g1 } },
      [this.run(` ${flat(spec.task.no)} `, { face: "head", pt: F.taskNo, color: WHITE, shade: G.g4 }), this.run("  ", H15), this.run(flat(spec.task.title), H15), ...(spec.task.bp ? marker("BP") : [])],
      H15,
    );
    const S14: CS = { face: "dotumB", pt: F.sub };
    // 갈래 칩은 v3 블록 목록 초안만(화면 sectionBodyInner와 같음)
    const chip = spec.version === 3 && spec.sub.chip ? `[${flat(spec.sub.chip)}] ` : "";
    const sub = this.para({ align: "LEFT", after: px(5), line: pct(LH.sub) }, [this.run(`${flat(spec.sub.mark)}. ${chip}`, S14), ...this.rich(spec.sub.title, S14), ...spec.sub.markers.flatMap(marker)], S14);
    return [biz, task, sub];
  }

  /** 옛 도식(v1·v2 행) → 같은 모양(section-html.ts diagramHtml): 기존·개선 표·단계 흐름·시기 흐름·칸 카드(추진배경·현황 행은 ✚)·노력/성과 표 */
  diagram(d: Diagram, label: string, w: number): Para[] {
    const title = d.title ? this.title(d) : [];
    switch (d.type) {
      case "before_after":
        return [...title, this.host(this.beforeAfter(d.rows, w))];
      case "process_flow":
        return [...title, this.host(this.processFlow(d.steps, w), px(3))];
      case "timeline":
        return [...title, this.host(this.chevronTimeline(d.steps, w), px(3))];
      case "card_grid": {
        const cells = d.steps.slice(0, 4).map((s) => ({ head: s.title, tag: "", bullets: s.bullets, note: s.note }));
        const join = JOIN_LABELS.has(label) && cells.length > 1;
        return [...title, this.host(this.cardColumns(cells, w, join ? JOIN.gapMm : 3, join ? "✚" : "", (c) => this.rich(c.head, HEAD)), px(3))];
      }
      case "action_table": {
        const colW = this.cols(w, [{ fr: 1 }, { fr: 1 }]);
        const m: [number, number, number, number] = [px(5), px(5), px(2), px(2)];
        const cells: TCell[] = [
          { r: 0, c: 0, paras: [this.p("추진 노력", LABEL, { align: "CENTER", line: pct(LH.act) })], box: { t: THICK, b: HAIR, fill: G.g2 }, m },
          { r: 0, c: 1, paras: [this.p("추진 성과", { ...LABEL, color: WHITE }, { align: "CENTER", line: pct(LH.act) })], box: { t: THICK, b: HAIR, fill: G.g4 }, m },
          ...d.actions.flatMap((a, i): TCell[] => [
            { r: i + 1, c: 0, paras: [this.p(a.effort, BODY, { chars: true })], box: { b: HAIR }, m },
            { r: i + 1, c: 1, paras: [this.p(a.result, BODY_B, { chars: true })], box: { b: HAIR, l: HAIR3 }, m },
          ]),
        ];
        return [...title, this.host(this.table(colW, [lineH(), ...d.actions.map(() => lineH())], cells), px(3))];
      }
      default:
        return title;
    }
  }

  /** v1·v2 사다리 행 표(행마다 라벨 + 불릿·도식·행 옆 막대) */
  oldLadder(rows: LadderRow[]): Para[] {
    if (!rows.length) return [];
    const colW = this.cols(BODY_W, [mm(18), { fr: 1 }]);
    const m: [number, number, number, number] = [px(3), px(3), px(2), px(2)];
    const cw = inner(colW[1], m);
    const cells: TCell[] = [];
    rows.forEach((r, i) => {
      const main = (w: number) => [...this.ul(r.bullets), ...(r.diagram && r.diagram.type !== "none" ? this.diagram(r.diagram, r.label, w) : [])];
      let paras: Para[];
      if (r.chart) {
        const sideW = this.cols(cw, [{ fr: 1 }, mm(2.5), mm(42)]);
        paras = [this.host(this.table(sideW, [lineH()], [{ r: 0, c: 0, va: "TOP", m: M0, paras: main(sideW[0]) }, { r: 0, c: 1, m: M0, paras: [] }, { r: 0, c: 2, m: M0, paras: [this.host(this.chart(r.chart, sideW[2]))] }]))];
      } else paras = main(cw);
      cells.push({ r: i, c: 0, paras: [this.para({ align: "CENTER", line: pct(LH.ladder) }, [this.run(flat(r.label), LABEL)], LABEL)], box: all(HAIR, G.g2), m });
      cells.push({ r: i, c: 1, paras: paras.length ? paras : [this.empty()], box: { r: HAIR, t: HAIR, b: HAIR }, m });
    });
    return [this.host(this.table(colW, rows.map(() => lineH()), cells), px(5))];
  }

  /** v1·v2 본문(section-html.ts sectionBodyInner 뒤쪽과 같은 순서): 인용 상자 → 추진배경 행 → 메시지 띠 → 나머지 행 → 우수사례 */
  oldBody(spec: ReportSectionSpec): Para[] {
    const out: Para[] = [];
    const ctx = spec.context ?? [];
    if (ctx.length) out.push(this.host(this.quotes(ctx.map((c) => ({ head: c.title, tag: c.chip, bullets: [c.quote], note: c.cite })), BODY_W)));
    const rows = spec.rows ?? [];
    const span = spec.banner ? Math.max(0, rows.findIndex((r) => r.label === "추진배경") + 1) : rows.length;
    out.push(...this.oldLadder(rows.slice(0, span)));
    if (spec.banner) out.push(...this.core({ kind: "banner", label: "", title: "", variant: "", text: spec.banner, items: [], cells: [], rows: [], series: [], badge: "" }, BODY_W));
    out.push(...this.oldLadder(rows.slice(span)));
    for (const c of spec.cases ?? []) out.push(...this.core({ kind: "case", label: c.tab, title: c.title, variant: "", text: "", items: c.items, cells: [], rows: [], series: [], badge: "" }, BODY_W));
    return out;
  }
}

/**
 * 소항목 spec → 한글 모델 입력(hwpx-write.ts HwpxInput)·경고. 머리 → 본문(v3 블록 목록 또는 v1·v2 행) → 추진성과.
 * opts.title = 문서 제목(없으면 「과제번호 제목 초안」)
 */
export function sectionHwpxInput(spec: ReportSectionSpec, opts: { title?: string } = {}): { input: HwpxInput; warnings: string[] } {
  const w = new SectionWriter();
  const paras: Para[] = [...w.heads(spec)];
  if (spec.version === 3 && Array.isArray(spec.blocks)) {
    if (spec.mg) w.warnings.push("경영관리 초안은 한글(개조식)으로 내려받습니다 — 이 양식은 절 머리 없이 블록만 차례로 그렸습니다.");
    paras.push(...w.blocksBody(spec.blocks, !spec.mg && ownResult(spec)));
  } else {
    w.warnings.push(`옛 초안 형식(v${spec.version}) — 행·도식을 화면과 같은 단순한 표 모양으로 옮겼습니다.`);
    paras.push(...w.oldBody(spec));
  }
  paras.push(...w.result(spec));
  const title = clean(opts.title ?? `${flat(spec.card.taskNo)} ${flat(spec.card.title)} 초안`.trim());
  return { input: { doc: w.sh.doc, page: PAGE, paras, images: new Map(), title }, warnings: w.warnings };
}

/** 소항목 spec → 한글(HWPX) 바이트(범용 쓰기 계층 hwpxFiles → 한컴 정품 순서 묶기 writeHwpxPackage) */
export async function sectionToHwpx(spec: ReportSectionSpec, opts: { title?: string } = {}): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const { input, warnings } = sectionHwpxInput(spec, opts);
  const { bytes } = await writeHwpxPackage(hwpxFiles(input));
  return { bytes, warnings };
}
