// 한글 문서 모델 → HTML(원본 그대로). 한글이 저장해 둔 치수(칸 폭·높이·여백, 줄 배치, 개체 크기)와 글자 모양(글꼴·크기·장평·자간·색)을
// 그대로 옮깁니다. 입출력 없는 순수 함수이고, 카드 화면(렌더러)과 검증 스크립트가 함께 씁니다.
//
// 배치 규칙(한글 프로그램의 동작 — 원본 PDF와 대조해 확인. 특정 문서 값이 아님)
//  · 단위: HWPUNIT 75 = 1px(96dpi). 글자 크기 1000 = 10pt
//  · 표: 열 경계는 칸 폭 누적값, 표 폭은 개체 폭. 행 폭이 표보다 짧으면 그 행의 마지막 칸이 표 오른쪽 끝까지 늘어남
//  · 칸: 안 여백을 따로 지정하지 않은 칸은 표의 기본 안 여백. 테두리는 칸 가장자리 중앙에 그려 배치에 영향 없음
//  · 문단: 줄마다 한글이 저장한 줄 배치(시작 글자·세로 위치·높이·기준선·줄 간격·가로 위치·폭)대로 한 줄씩 그림
//    - 줄 높이 = 글자 높이 + 줄 간격(간격은 글자 아래). 칸 내용 높이는 마지막 줄의 줄 간격을 뺀 값
//    - 양쪽 정렬은 빈칸에만 폭을 나눔(줄 앞 빈칸·마지막 줄 제외). 내어쓰기는 둘째 줄부터(줄 폭보다 크면 적용 안 함)
//  · 글자: 자간은 그 글자 폭(장평 적용 뒤)에 대한 비율, 줄 끝 글자 뒤에는 붙지 않음. 장평은 가로 비율
//
// 글꼴: 파일에 적힌 글꼴 이름을 그대로 씁니다(기관 PC에 한컴 글꼴이 있으면 그대로 맞음). 글자 폭은 글꼴마다 달라 이 모듈이 정하지 않습니다 —
// 자간·장평·빈칸 종류를 글자 조각의 data-* 속성으로 남기고, 화면에서 fit.ts가 실제로 쓰인 글꼴의 폭을 재서 글자 간격을 맞춥니다.

import { type Border, type BorderFill, type Cell, type CharPr, type FaceInfo, type Fill, type HwpDoc, type Inline, langOf, type LineSeg, type Para, type ParaPr, type Pic, type Shape, type ShapeGeo, type Table } from "./model.ts";

/** 한글 규칙: 기준선은 글자 높이의 85% 자리(글자 상자 위 85%·아래 15%) */
const BASELINE_RATIO = 0.85;

/** HWPUNIT → CSS px(소수 셋째 자리) */
export const px = (hu: number) => Math.round((hu / 75) * 1000) / 1000;
export const f3 = (v: number) => String(Math.round(v * 1000) / 1000);

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 한글 프로그램 규칙: 글꼴에 없는 글자(∙ ☑ 등)를 그리는 대체 글꼴 */
export const HWP_FALLBACK_FACE = "한컴바탕";
/** 한글 프로그램 규칙: 기호 글꼴 사용자 영역(U+F020~F0FF)은 기호 글꼴로 그림 */
const SYMBOL_PUA = /[\uF020-\uF0FF]/;
const SYMBOL_FACES = ["Wingdings", "Symbol"];
/** 한글 프로그램 규칙: 빈칸 폭(글자 크기 대비). '글꼴에 어울리는 빈칸'이 꺼진 글자 모양의 보통·묶음 빈칸 1/2, 고정폭 빈칸 1/4 */
export const SPACE_EM = { normal: 0.5, fixed: 0.25 } as const;
/** 한글 프로그램 규칙: 위·아래 첨자 크기(글자 크기 대비)와 기준선 이동 */
export const SCRIPT = { scale: 0.64, raise: 0.444, lower: 0.15 } as const;

const SERIF = /명조|바탕|Batang|Myeongjo|궁서/i;
const q = (name: string) => `'${name.replace(/'/g, "")}'`;

/** 글꼴 정보 찾기(파일에 적힌 다른 이름·대체 글꼴). 렌더러가 문서마다 설정 */
let faceInfoOf: (face: string) => FaceInfo | undefined = () => undefined;

/** CSS font-family: 파일의 글꼴 이름 → 파일에 적힌 기본(다른) 이름 → 파일의 대체 글꼴 → 한글의 대체 글꼴 → 시스템 기본(고딕·명조) */
export function fontStack(face: string): string {
  const info = face ? faceInfoOf(face) : undefined;
  const names = [face, info?.defaultName, info?.alt, HWP_FALLBACK_FACE].filter((n, i, a): n is string => Boolean(n) && a.indexOf(n) === i);
  return [...names.map(q), SERIF.test(face) ? "serif" : "sans-serif"].join(",");
}

// ───────────────────────── 글자 모양 → CSS

/** 한 글자 모양의 언어별 기본 CSS(글꼴·크기·색·굵기·음영·밑줄·첨자). 자간·빈칸 폭은 spacingAttrs, 장평은 줄 단위로 */
export function charBaseCss(c: CharPr, lang: number): string {
  const face = c.face[lang] || c.face[0];
  const fs = px((c.height * (c.relSize[lang] || 100)) / 100);
  const parts = [`font-family:${fontStack(face)}`, `font-size:${f3(fs)}px`];
  if (c.bold) parts.push("font-weight:700");
  if (c.italic) parts.push("font-style:italic");
  if (c.color && c.color !== "#000000") parts.push(`color:${c.color}`);
  if (c.shade) parts.push(`background-color:${c.shade}`);
  const deco: string[] = [];
  if (c.underline === "BOTTOM") deco.push("underline");
  if (c.underline === "TOP") deco.push("overline");
  if (c.strike) deco.push("line-through");
  if (deco.length) parts.push(`text-decoration:${deco.join(" ")}`, ...(c.underlineColor ? [`text-decoration-color:${c.underlineColor}`] : []));
  if (c.supscript) parts.push(`font-size:${f3(fs * SCRIPT.scale)}px`, `vertical-align:${f3(fs * SCRIPT.raise)}px`);
  else if (c.subscript) parts.push(`font-size:${f3(fs * SCRIPT.scale)}px`, `vertical-align:${f3(-fs * SCRIPT.lower)}px`);
  else if (c.offset[lang]) parts.push(`vertical-align:${f3((c.offset[lang] / 100) * fs)}px`);
  return parts.join(";");
}

/** 빈칸 종류: h 보통(1/2) · q 고정폭(1/4) · f 글꼴 빈칸 */
export type SpaceKind = "h" | "q" | "f";

/**
 * 글자 조각의 자간·장평·빈칸 표시(data-*)와 근사 CSS.
 *  data-s 자간(%) · data-r 장평(%, 줄 단위 가로 비율로 못 줄인 경우만) · data-w 이 조각 빈칸의 폭 규칙 · data-l 줄 끝 글자(뒤 간격 없음) · data-b 진하게
 *  · data-sh 글자 음영 색(fit.ts가 글자 크기 한 칸 — 기준선 위 85%·아래 15% — 만 칠함. 그 전에는 CSS 배경색으로 근사)
 * 근사 CSS는 글자 폭을 1em으로 본 값이고, 화면에서 fit.ts가 실제 글꼴 폭으로 다시 맞춥니다.
 */
export function spacingAttrs(c: CharPr, lang: number, opts: { ratioInLine: boolean; space?: SpaceKind; last?: boolean }): { attrs: string; css: string } {
  const s = c.spacing[lang] || 0;
  const r = opts.ratioInLine ? 100 : c.ratio[lang] || 100;
  // data-b: 진하게 — 자간·장평이 없어도 fit.ts가 보통 굵기 폭으로 맞춤(한글 규칙)
  const attrs = `${s ? ` data-s="${s}"` : ""}${r !== 100 ? ` data-r="${r}"` : ""}${opts.space ? ` data-w="${opts.space}"` : ""}${opts.last ? ' data-l="1"' : ""}${c.bold ? ' data-b="1"' : ""}${c.shade ? ` data-sh="${escHtml(c.shade)}"` : ""}`;
  const k = (r / 100) * (1 + s / 100);
  const css: string[] = [];
  if (!opts.last && Math.abs(k - 1) > 1e-4) css.push(`letter-spacing:${f3(k - 1)}em`);
  if (opts.space) {
    const target = opts.space === "q" ? SPACE_EM.fixed : opts.space === "f" ? 0.3 : SPACE_EM.normal;
    const ws = target * k - 0.3 - (opts.last ? 0 : k - 1);
    if (Math.abs(ws) > 1e-4) css.push(`word-spacing:${f3(ws)}em`);
  }
  return { attrs, css: css.length ? `;${css.join(";")}` : "" };
}

// ───────────────────────── 테두리·채우기 → CSS

/**
 * 선 굵기(mm) → CSS px(파일 값 그대로). 화면에서는 한 장치 점보다 가는 선도 한 점으로 그림(CSS --hw-dp, 해상도별 장치 점 크기).
 * CSS 테두리(border)는 크롬이 굵기를 정수 CSS px로 내림하고 최소 1px로 그려(2배 화면에서 0.12mm 선이 원본의 두 배, 0.4mm 선은 1px)
 * 칸 테두리는 배경 층(그러데이션)으로 그림 — 소수 굵기가 그대로 나옴
 */
export function lineWidthPx(mm: number): number {
  return (mm * 96) / 25.4;
}

/** 도형 윤곽 무늬 선 → CSS outline 모양(실선은 그림자로 그림) */
const SHAPE_LINE_CSS: Record<string, string> = { DASH: "dashed", DOT: "dotted", DASH_DOT: "dashed", DASH_DOT_DOT: "dashed", LONG_DASH: "dashed", CIRCLE: "dotted", DOUBLE_SLIM: "double", SLIM_THICK: "double", THICK_SLIM: "double", SLIM_THICK_SLIM: "double", DOUBLE_WAVE: "double" };

type Side = "l" | "r" | "t" | "b";
/** 변마다 배경 층의 자리(선 방향으로 100%) */
const SIDE_POS: Record<Side, string> = { l: "0 0", r: "100% 0", t: "0 0", b: "0 100%" };
const vertical = (side: Side) => side === "l" || side === "r";

/**
 * 한 변의 선을 배경 층으로. 굵기 w(px)는 한 장치 점보다 가늘면 한 점(--hw-dp).
 * 층 두께는 정수 CSS px(1px 이상) — 크롬은 1 CSS px보다 얇은 배경 층을 자리(소수점 위치)에 따라 그리지 않기도 함 —
 * 이고, 그 안에서 선 굵기만큼만 칠함(날카로운 색 경계). 무늬 선은 원뿔 그러데이션 사분면으로 짧은 사각형을 되풀이
 */
function lineLayer(side: Side, b: Border, w: number): string {
  const c = b.color;
  const v = vertical(side);
  const T = `${Math.max(1, Math.ceil(w))}px`;
  const wd = `max(var(--hw-dp,1px),${f3(w)}px)`;
  const across = v ? (side === "l" ? "to right" : "to left") : side === "t" ? "to bottom" : "to top";
  const full = `${SIDE_POS[side]}/${v ? `${T} 100%` : `100% ${T}`} no-repeat`;
  // 무늬 선: 선 방향 dash만큼, 가로지르는 방향 선 굵기만큼 칠한 사각형을 period마다(한 장치 점보다 짧게는 하지 않음)
  const pattern = (dash: number, period: number) => {
    const D = `max(var(--hw-dp,1px),${f3(dash)}px)`;
    const P = `max(calc(2 * var(--hw-dp,1px)),${f3(period)}px)`;
    const at = side === "t" ? `${D} ${wd}` : side === "b" ? `${D} calc(100% - ${wd})` : side === "l" ? `${wd} ${D}` : `calc(100% - ${wd}) ${D}`;
    const stops = side === "b" ? `transparent 0 180deg,${c} 180deg 270deg,transparent 270deg` : side === "r" ? `${c} 0 90deg,transparent 90deg` : `transparent 0 270deg,${c} 270deg`;
    return `conic-gradient(at ${at},${stops}) ${SIDE_POS[side]}/${v ? `${T} ${P}` : `${P} ${T}`} ${v ? "repeat-y" : "repeat-x"}`;
  };
  switch (b.type) {
    // 점선: 원본 PDF(0.12mm) — 굵기 0.36pt, 점 0.48pt, 간격 0.72pt → 굵기의 약 1.4배 점, 3.5배 주기
    case "DOT":
    case "CIRCLE":
      return pattern(w * 1.41, w * 3.53);
    case "DASH":
    case "DASH_DOT":
    case "DASH_DOT_DOT":
      return pattern(w * 4, w * 6);
    case "LONG_DASH":
      return pattern(w * 8, w * 10);
    // 이중선: 원본 PDF(0.5mm) — 가는 선(굵기의 약 1/4) 둘이 선 폭 양 끝에
    case "DOUBLE_SLIM":
    case "SLIM_THICK":
    case "THICK_SLIM":
    case "SLIM_THICK_SLIM":
    case "DOUBLE_WAVE": {
      const t = `max(var(--hw-dp,1px),${f3(w / 4)}px)`;
      return `linear-gradient(${across},${c} 0 ${t},transparent ${t} calc(${f3(w)}px - ${t}),${c} calc(${f3(w)}px - ${t}) ${f3(w)}px,transparent ${f3(w)}px) ${full}`;
    }
    default:
      return `linear-gradient(${across},${c} 0 ${wd},transparent ${wd}) ${full}`;
  }
}

/** 선이 있는 변의 굵기(mm, 없으면 0) */
const borderMm = (b: Border | null | undefined) => (b && b.type !== "NONE" && b.width > 0 ? b.width : 0);

/**
 * 칸 한 변: 배경 층(--hw-g*)과 굵기(--hw-*w). 없는 변도 적어 둠(CSS 변수는 상속되므로 안쪽 표 칸이 바깥 칸 선을 물려받지 않게).
 * skip: 이웃 칸이 같은 경계를 칠하는 변 — 층은 없고 굵기만 남김(다른 변 선이 모서리까지 닿게)
 */
function borderVar(side: Side, b: Border, skip = false): string {
  if (!borderMm(b)) return `--hw-g${side}:none;--hw-${side}w:0px;`;
  const w = lineWidthPx(b.width);
  return `--hw-g${side}:${skip ? "none" : lineLayer(side, b, w)};--hw-${side}w:${f3(w)}px;`;
}

export interface BoxCss {
  /** 칸 스타일(채우기 + 테두리 변수) */
  style: string;
  /** 테두리가 있음(칸에 테두리 그리기 클래스) */
  border: boolean;
}

/** skip: 이웃 칸이 대신 칠하는 변(표 격자에서 정함 — sharedEdgeSkips) */
export function borderFillCss(bf: BorderFill | null | undefined, imageUrl: (bin: number) => string | null, skip?: ReadonlySet<Side>): BoxCss {
  if (!bf) return { style: "", border: false };
  const sides: [Side, Border][] = [["l", bf.left], ["r", bf.right], ["t", bf.top], ["b", bf.bottom]];
  const border = sides.some(([, b]) => borderMm(b) > 0);
  let s = border ? sides.map(([side, b]) => borderVar(side, b, skip?.has(side))).join("") : "";
  const f = bf.fill;
  if (f?.image) {
    const url = imageUrl(f.image.bin);
    if (url) {
      const mode = f.image.mode;
      const size = mode === "TOTAL" || mode === "ZOOM" ? "100% 100%" : "auto";
      const repeat = mode.startsWith("TILE") ? "repeat" : "no-repeat";
      const pos = mode === "CENTER" ? "center" : "left top";
      s += `background-image:url('${url}');background-size:${size};background-repeat:${repeat};background-position:${pos};`;
    }
  } else if (f?.gradation) s += `background-image:${gradientCss(f)};`;
  else if (f?.color && f.pattern < 0) s += `background-color:${f.color};`;
  else if (f?.color) s += `background-color:${f.color};`;
  return { style: s, border };
}

/**
 * 그러데이션 → CSS. 한글 각도는 CSS 각도와 같은 방향(180 = 첫 색이 위, 90 = 첫 색이 왼쪽 — 원본 PDF의 띠 도형으로 확인).
 * 원·원뿔·사각은 원형으로 근사
 */
export function gradientCss(f: Fill): string {
  const g = f.gradation!;
  const cs = g.colors.length ? g.colors : ["#FFFFFF", "#000000"];
  const stops = cs.map((c, i) => (g.positions && g.positions.length === cs.length ? `${c} ${g.positions[i]}%` : c)).join(",");
  return g.type === 1 || !g.type ? `linear-gradient(${g.angle}deg,${stops})` : `radial-gradient(circle at ${50 + (g.cx ?? 0) / 2}% ${50 + (g.cy ?? 0) / 2}%,${stops})`;
}

// ───────────────────────── 그리기 개체 변환

/** 2×3 변환 행렬 [e1 e2 e3; e4 e5 e6] */
export type Mat = [number, number, number, number, number, number];
const mul = (a: Mat, b: Mat): Mat => [a[0] * b[0] + a[1] * b[3], a[0] * b[1] + a[1] * b[4], a[0] * b[2] + a[1] * b[5] + a[2], a[3] * b[0] + a[4] * b[3], a[3] * b[1] + a[4] * b[4], a[3] * b[2] + a[4] * b[5] + a[5]];
export const applyMat = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];

/**
 * 개체의 만들 때 좌표 → 맨 위 개체 상자 좌표(한글 규칙: 이동 · 회전₁ · 크기₁ · 회전₂ · 크기₂ …, 바깥 묶음부터).
 * 원본 파일의 묶음 개체(띠 도형·글상자)와 그림에 대어 보면 상자 [0, 폭] × [0, 높이]에 꼭 맞음
 */
export function shapeMatrix(g: ShapeGeo | undefined): Mat | null {
  if (!g || g.trans?.length !== 6) return null;
  let m = g.trans as Mat;
  for (const [sc, rot] of g.pairs) m = mul(mul(m, rot as Mat), sc as Mat);
  return m;
}

/** 개체가 상자 안에서 차지하는 범위(만들 때 크기의 네 모서리를 옮긴 것) */
function geoBox(g: ShapeGeo, m: Mat): [number, number, number, number] {
  const pts = [applyMat(m, 0, 0), applyMat(m, g.orgW, 0), applyMat(m, g.orgW, g.orgH), applyMat(m, 0, g.orgH)];
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// ───────────────────────── 표 격자

export interface Grid {
  /** 열 경계(0 … 표 폭) */
  xs: number[];
  /** 행 높이 */
  hs: number[];
  width: number;
}

/**
 * 칸 폭·높이에서 열 경계와 행 높이를 구함. 행마다 왼쪽부터 칸 폭을 누적한 값이 다음 칸의 왼쪽 경계(행들 중 가장 많이 나온 값).
 *  · 윗행에서 내려온 병합 칸 때문에 행 중간이 비면, 빈 뒤는 이미 정한 경계에서 다시 누적(모르면 다음 차례에)
 *  · 행의 마지막 칸은 표 오른쪽 끝까지 늘어나므로(한글 동작) 그 폭으로 경계를 정하지 않음. 마지막 경계는 표 폭
 */
/** 칸 안 줄 하나의 연속 좌표(칸 내용 위에서): 문단·줄 번호, 위·아래, 줄 간격까지 끝, 몇 번째 쪽 부분인지, 파일에 적힌 세로 위치 */
export interface CellLine {
  p: number;
  i: number;
  top: number;
  bottom: number;
  end: number;
  page: number;
  vp: number;
}

/**
 * 칸 안 줄들의 연속 좌표. 한글은 쪽을 넘은 줄의 세로 위치를 새 쪽에서 다시 적으므로(앞 줄과 같거나 작음 — 새 쪽 첫 줄이 0이면
 * 앞 줄도 0일 수 있음), 그 줄은 앞 줄 끝(줄 간격 포함)에 이어 붙임. 줄 배치가 없는 문단(고친 글)이 있으면 null
 */
export function cellLines(c: Cell): CellLine[] | null {
  const out: CellLine[] = [];
  let off = 0;
  let prev: LineSeg | null = null;
  let prevEnd = 0;
  let page = 0;
  for (let p = 0; p < c.paras.length; p++) {
    const para = c.paras[p];
    if (!para.lines.length) return null;
    para.lines.forEach((l, i) => {
      if (prev && (l.vertpos < prev.vertpos || (l.vertpos === prev.vertpos && prev.vertsize + prev.spacing > 0))) {
        off = prevEnd - l.vertpos + Math.max(0, l.vertpos);
        page++;
      }
      const top = off + l.vertpos;
      out.push({ p, i, top, bottom: top + l.vertsize, end: top + l.vertsize + l.spacing, page, vp: l.vertpos });
      prev = l;
      prevEnd = top + l.vertsize + l.spacing;
    });
  }
  return out;
}

/**
 * 칸이 내용에 필요한 높이: 한글이 저장한 줄 배치(마지막 줄 아래 끝, 쪽을 넘은 줄은 이어 붙임 — cellLines) + 띄운 개체 아래 끝 + 안 여백.
 * 줄 배치가 없는 문단(고친 글)이 있으면 알 수 없으므로 0(화면이 내용대로 늘림)
 */
export function cellContentHeight(c: Cell): number {
  const lines = cellLines(c);
  if (!lines) return 0;
  let bottom = 0;
  for (const l of lines) bottom = Math.max(bottom, l.bottom);
  c.paras.forEach((p, pi) => {
    const paraTop = lines.find((l) => l.p === pi)?.top ?? 0;
    for (const it of p.items)
      if (it.kind === "obj" && !it.obj.pos.treatAsChar && it.obj.pos.vertRelTo === "PARA") {
        const o = it.obj;
        const h = o.kind === "table" ? o.pos.height : Math.abs(o.curH) || o.pos.height;
        bottom = Math.max(bottom, paraTop + o.pos.vertOffset + o.pos.outMargin[2] + h + o.pos.outMargin[3]);
      }
  });
  return bottom ? bottom + c.margin[2] + c.margin[3] : 0;
}

/**
 * 한글이 저장한 줄 배치로 잰 칸 폭: 칸 안 여백 + 글이 있는 문단의 가장 긴 줄 끝(줄 시작 + 줄 폭) + 문단 오른 여백.
 * 줄 배치가 없으면(고친 글) null. 저장할 때 한글이 실제로 쓴 칸 폭이라 칸 폭 값과 다르면 이쪽이 원본 PDF와 같음
 */
function savedCellWidth(c: Cell, paraRight: (paraPr: number) => number): number | null {
  let w = -1;
  for (const p of c.paras) {
    if (!p.items.some((i) => i.kind === "text" && i.text.trim())) continue;
    for (const l of p.lines) w = Math.max(w, l.horzpos + l.horzsize + paraRight(p.paraPr));
  }
  return w < 0 ? null : w + c.margin[0] + c.margin[1];
}

/**
 * 표 폭이 가장 넓은 행보다 넓을 때(칸 폭 합과 표 폭이 다른 파일) 남는 폭이 들어간 열 경계.
 * 경계 k 뒤 열들을 남는 폭만큼 오른쪽으로 민 격자 중 한글이 저장한 줄 폭(savedCellWidth)과 가장 잘 맞는 것.
 * 기본(행 마지막 칸이 늘어남)보다 절반 넘게 잘 맞을 때만 고름. 칸이 가질 수 없는 폭(최소 줄 폭 등)은 증거로 쓰지 않음
 */
function surplusBoundary(t: Table, xs: number[], surplus: number, paraRight: (paraPr: number) => number): number | null {
  const obs = t.cells.map((c) => {
    const w = savedCellWidth(c, paraRight);
    return w !== null && w <= c.width + surplus ? w : null;
  });
  const cost = (k: number) => {
    const x = (j: number) => xs[j] + (j >= k && j < t.cols ? surplus : 0);
    let n = 0;
    t.cells.forEach((c, i) => {
      const o = obs[i];
      if (o !== null) n += Math.min(surplus, Math.abs(o - (x(Math.min(t.cols, c.col + c.colSpan)) - x(c.col))));
    });
    return n;
  };
  const base = cost(t.cols);
  let best: number | null = null;
  let bestCost = base / 2;
  for (let k = 1; k < t.cols; k++) {
    const v = cost(k);
    if (v < bestCost) {
      best = k;
      bestCost = v;
    }
  }
  return best;
}

/** paraRight: 문단 모양 번호 → 오른 여백(주면 표 폭이 행보다 넓은 표의 남는 폭 자리를 저장된 줄 폭으로 찾음) */
export function tableGrid(t: Table, paraRight?: (paraPr: number) => number): Grid {
  const rows = new Map<number, Cell[]>();
  for (const c of t.cells) rows.set(c.row, [...(rows.get(c.row) ?? []), c]);
  for (const cells of rows.values()) cells.sort((a, b) => a.col - b.col);
  const xs: (number | null)[] = Array(t.cols + 1).fill(null);
  xs[0] = 0;
  for (let pass = 0; pass <= t.cols; pass++) {
    const votes = new Map<number, Map<number, number>>();
    for (const cells of rows.values()) {
      let x: number | null = null;
      let next = 0;
      for (const c of cells) {
        if (c.col !== next || x === null) x = xs[c.col];
        else if (c.col < t.cols) {
          const m = votes.get(c.col) ?? new Map<number, number>();
          m.set(x, (m.get(x) ?? 0) + 1);
          votes.set(c.col, m);
        }
        next = c.col + c.colSpan;
        if (x !== null) x += c.width;
      }
    }
    let changed = false;
    for (const [k, m] of votes)
      if (xs[k] === null) {
        xs[k] = [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
        changed = true;
      }
    if (!changed) break;
  }
  // 어느 칸의 왼쪽도 아닌 경계: 왼쪽 경계를 아는 칸의 폭으로
  for (let pass = 0; pass < 4; pass++)
    for (const c of t.cells) {
      const l = xs[c.col];
      const r = c.col + c.colSpan;
      if (l !== null && r < t.cols && xs[r] === null) xs[r] = l + c.width;
    }
  const maxRow = Math.max(0, ...t.cells.map((c) => (xs[c.col] ?? 0) + c.width));
  const width = t.pos.width || maxRow;
  xs[t.cols] = width;
  // 빈 경계는 앞뒤 사이 고르게
  for (let k = 1; k < t.cols; k++)
    if (xs[k] === null) {
      let j = k + 1;
      while (xs[j] === null) j++;
      const a = xs[k - 1] as number;
      const b = xs[j] as number;
      for (let m = k; m < j; m++) xs[m] = a + ((b - a) * (m - k + 1)) / (j - k + 1);
    }
  // 표 폭이 가장 넓은 행보다 넓으면: 행 마지막 칸이 늘어나는 대신, 저장된 줄 폭이 가리키는 열에 남는 폭을 넣음
  // (주요사업3 6-가: 표 폭 48882, 가장 넓은 행 48428 — 한글은 둘째 열을 454 넓혀 찍고 줄 배치도 그 폭으로 저장)
  const surplus = width - maxRow;
  if (surplus > 0 && paraRight) {
    const k = surplusBoundary(t, xs as number[], surplus, paraRight);
    if (k !== null) for (let j = k; j < t.cols; j++) xs[j] = (xs[j] as number) + surplus;
  }
  // 행 높이: 칸마다 「위 경계 + 칸 높이 ≤ 아래 경계」를 모두 만족하는 가장 작은 경계(위에서부터 차례로 가장 긴 길).
  // 칸 높이는 저장한 높이와 내용 높이(줄 배치 + 안 여백) 중 큰 값 — 한글이 저장한 칸 높이는 열마다 쌓으면 표 높이가 되고,
  // 병합 칸이 그 행들의 합보다 크면 행이 늘어나며, 내용이 저장한 높이보다 크면 그 행이 늘어남 — 원본 PDF 행 위치와 같음
  const ys: number[] = Array(t.rows + 1).fill(0);
  const ending = new Map<number, Cell[]>();
  for (const c of t.cells) {
    const end = Math.min(t.rows, c.row + Math.max(1, c.rowSpan));
    ending.set(end, [...(ending.get(end) ?? []), c]);
  }
  for (let r = 1; r <= t.rows; r++) {
    let y = ys[r - 1];
    for (const c of ending.get(r) ?? []) y = Math.max(y, ys[Math.min(c.row, r - 1)] + Math.max(c.height, cellContentHeight(c)));
    ys[r] = y;
  }
  const hs = ys.slice(1).map((y, r) => y - ys[r]);
  return { xs: xs as number[], hs, width };
}

// ───────────────────────── 문단

export interface HtmlCtx {
  doc: HwpDoc;
  imageUrl: (bin: number) => string | null;
  /** 칸 안 문단 목록을 그리기 전에: 대신 그릴 HTML을 돌려주면 그것을 씀(카드 화면의 편집 연결) */
  cellHook?: (t: Table, c: Cell, depth: number) => string | null;
}

/** 문단 글자를 한글 위치 셈(조종 문자 8칸)으로 펼침: [글자, 글자 모양, 요소] */
interface Glyph {
  ch: string;
  cp: number;
  pos: number;
  item: Inline;
}

function glyphs(p: Para): Glyph[] {
  const out: Glyph[] = [];
  for (const it of p.items) {
    if (it.kind === "text") {
      let pos = it.pos;
      for (const ch of it.text) {
        out.push({ ch, cp: it.charPr, pos, item: it });
        pos += ch.length; // 한글 위치는 UTF-16 단위
      }
    } else if (it.kind === "gen" || it.kind === "zero") for (const ch of it.text) out.push({ ch, cp: it.charPr, pos: it.pos, item: it });
    else if (it.kind === "tab") out.push({ ch: "\t", cp: it.charPr, pos: it.pos, item: it });
    else if (it.kind === "br") out.push({ ch: "\n", cp: it.charPr, pos: it.pos, item: it });
    else out.push({ ch: "\uFFFC", cp: it.charPr, pos: it.pos, item: it });
  }
  return out;
}

const isSpaceCh = (ch: string) => ch === " " || ch === "\u00a0" || ch === "\u2007";

/** 줄 하나의 글자들을 같은 모양끼리 묶어 HTML로. 줄 앞 빈칸은 양쪽 정렬에서 늘지 않게(한글과 같이) 묶어 둠 */
/** 줄 안 개체가 차지하는 높이(HWPUNIT, 바깥 여백 포함) */
function objHeight(o: Table | Pic | Shape): number {
  const h = o.kind === "table" ? o.pos.height : Math.abs(o.curH) || o.pos.height;
  return h + o.pos.outMargin[2] + o.pos.outMargin[3];
}

/**
 * 줄 하나의 글자들을 같은 모양끼리 묶어 HTML로. 줄 앞 빈칸은 양쪽 정렬에서 늘지 않게(한글과 같이) 묶어 둠.
 * trail: 줄 끝 빈칸을 폭 없이. lineH: 원본 줄 높이 — 글자처럼 놓은 개체가 줄보다 낮으면 한글처럼 줄 아래쪽에 붙임(원본 PDF와 같음)
 */
function lineHtml(ctx: HtmlCtx, gs: Glyph[], uniformRatio: boolean, depth: number, trail = false, lineH = 0): string {
  // 줄 끝 글자(뒤에 자간을 붙이지 않음). 글 뒤에 글자처럼 놓인 개체(「신규」 딱지 등)·겹침 글자가 이어지면 그 글자는 줄 끝이 아님 —
  // 원본 PDF: 딱지 앞 글자도 자간만큼 당겨 찍고 빈칸은 제 폭(주요사업3 아홉째 카드)
  let lastVis = -1;
  gs.forEach((g, i) => {
    if (((g.item.kind === "text" || g.item.kind === "gen") && !/\s/.test(g.ch) && g.ch !== "\u2007") || g.item.kind === "obj" || g.item.kind === "compose") lastVis = i;
  });
  // 줄 끝 빈칸(보이는 글자·개체 뒤, 글자 모양이 달라 조각이 나뉘어도 모두): 한글은 줄 폭에 넣지 않음 — 폭 없이 두되 글자는 남김(편집 글자 보존).
  // 고정폭 빈칸은 줄 끝에서도 폭을 가짐(한글 동작)
  let lastInk = -1;
  if (trail) gs.forEach((g, i) => {
    if (g.item.kind !== "br" && !((g.item.kind === "text" || g.item.kind === "gen" || g.item.kind === "zero") && isSpaceCh(g.ch) && g.ch !== "\u2007")) lastInk = i;
  });
  let tail = "";
  // 줄 끝 빈칸의 음영: 한글은 폭 없이 배치하는 줄 끝 빈칸에도 음영을 칠함(원본 PDF: 제목 끝 12pt 빈칸의 6pt 노란 칸) — 빈칸 폭(0.5em × 장평 × (1 + 자간))
  let tailShade = 0;
  let tailShadeColor = "";
  const shadeTail = (c: CharPr) => {
    if (!c.shade || (tailShadeColor && tailShadeColor !== c.shade)) return;
    tailShadeColor = c.shade;
    const size = px((c.height * (c.relSize[0] || 100)) / 100);
    tailShade += 0.5 * size * ((c.ratio[0] || 100) / 100) * (1 + (c.spacing[0] || 0) / 100);
  };
  const out: string[] = [];
  let buf = "";
  let key = "";
  let open = "";
  let lead = true;
  let leadBuf: string[] = [];
  const flush = () => {
    if (buf) (lead ? leadBuf : out).push(`${open}${buf}</span>`);
    buf = "";
  };
  const endLead = () => {
    if (!lead) return;
    flush();
    lead = false;
    if (leadBuf.length) out.push(`<span class="hw-lead">${leadBuf.join("")}</span>`);
    leadBuf = [];
  };
  for (let gi = 0; gi < gs.length; gi++) {
    const g = gs[gi];
    if (g.item.kind === "br") continue;
    if (g.item.kind === "obj" || g.item.kind === "compose") {
      endLead();
      flush();
      key = "";
      if (g.item.kind === "obj") {
        const o = g.item.obj;
        const dy = lineH && o.pos.treatAsChar ? lineH - objHeight(o) : 0;
        out.push(dy > 1 ? `<span class="hw-ov" style="top:${f3(px(dy))}px">${objHtml(ctx, o, depth)}</span>` : objHtml(ctx, o, depth));
      } else out.push(composeHtml(ctx, g.item));
      continue;
    }
    const c = ctx.doc.charPrs[g.cp];
    const isSpace = isSpaceCh(g.ch);
    // 편집 글에만 있는 글자: 폭 없이
    if (g.item.kind === "zero") {
      flush();
      key = "";
      (lead ? leadBuf : out).push(`<span class="hw-z">${escHtml(g.ch)}</span>`);
      continue;
    }
    // 원본 글자를 모양만(편집 글 밖): 한 글자씩 CSS 글로. 줄 끝 빈칸은 폭이 없으므로 그리지 않음
    if (g.item.kind === "gen") {
      flush();
      key = "";
      if (isSpace && gi > lastVis) {
        if (trail && gi > lastInk) shadeTail(c);
        continue;
      }
      if (!isSpace && lead) endLead();
      const lang = isSpace ? 0 : langOf(g.ch.codePointAt(0) ?? 32);
      const sp = spacingAttrs(c, lang, { ratioInLine: uniformRatio, space: isSpace ? (g.ch === "\u2007" ? "q" : c.useFontSpace ? "f" : "h") : undefined, last: gi === lastVis });
      let css = charBaseCss(c, lang) + sp.css;
      if (SYMBOL_PUA.test(g.ch)) css += `;font-family:${[...SYMBOL_FACES.map(q), fontStack(c.face[lang] || c.face[0])].join(",")}`;
      (lead ? leadBuf : out).push(`<span class="hw-g"${sp.attrs} data-c="${escHtml(isSpace ? " " : g.ch)}"${g.item.attrs ?? ""} style="${css}"></span>`);
      continue;
    }
    if (trail && isSpace && g.ch !== "\u2007" && gi > lastInk) {
      flush();
      key = "";
      tail += " ";
      shadeTail(c);
      continue;
    }
    if (!isSpace && lead) endLead();
    const lang = g.ch === "\t" || isSpace ? 0 : langOf(g.ch.codePointAt(0) ?? 32);
    let text = escHtml(g.ch);
    let k: string;
    let css: string;
    let attrs = "";
    if (g.ch === "\t") {
      const w = g.item.kind === "tab" ? g.item.width : 0;
      text = " ";
      k = `${g.cp}|tab|${gi}`;
      css = `${charBaseCss(c, lang)};display:inline-block;width:${f3(px(w))}px`;
    } else {
      const fixed = g.ch === "\u2007";
      const last = gi === lastVis;
      if (isSpace) text = " ";
      const extra = g.item.kind === "text" ? (g.item.attrs ?? "") : "";
      k = `${g.cp}|${lang}|${fixed ? "q" : "n"}|${last ? "L" : ""}|${SYMBOL_PUA.test(g.ch) ? "sym" : ""}|${extra}`;
      const sp = spacingAttrs(c, lang, { ratioInLine: uniformRatio, space: isSpace ? (fixed ? "q" : c.useFontSpace ? "f" : "h") : undefined, last });
      attrs = sp.attrs + extra;
      css = charBaseCss(c, lang) + sp.css;
      if (SYMBOL_PUA.test(g.ch)) css += `;font-family:${[...SYMBOL_FACES.map(q), fontStack(c.face[lang] || c.face[0])].join(",")}`;
    }
    // 같은 조각에 빈칸이 섞이면 빈칸 규칙(data-w)을 조각에 둠
    if (k !== key) {
      flush();
      key = k;
      open = `<span${attrs} style="${css}">`;
    } else if (isSpace && !/ data-w=/.test(open)) {
      const w = g.ch === "\u2007" ? "q" : c.useFontSpace ? "f" : "h";
      open = open.replace("<span", `<span data-w="${w}"`);
    }
    buf += text;
  }
  flush();
  if (lead && leadBuf.length) out.push(`<span class="hw-lead">${leadBuf.join("")}</span>`);
  // 줄 끝 빈칸 음영: 배치 폭 없이(오른쪽 음수 여백) 줄 글자 높이 한 칸(기준선 위 85%·아래 15%)만 칠함.
  // 빈칸 앞(마지막 글자 바로 뒤)에 둠 — 뒤에 두면 빈칸이 줄 끝이 아니게 되어 양쪽 정렬이 그 빈칸에도 간격을 나눔
  if (tailShade > 0 && lineH > 0) {
    const h = px(lineH);
    out.push(`<span class="hw-tsh" style="width:${f3(tailShade)}px;margin-right:${f3(-tailShade)}px;--hw-sh:${tailShadeColor};--hw-shh:${f3(h)}px;--hw-sht:${f3(-BASELINE_RATIO * h)}px"></span>`);
  }
  if (tail) out.push(`<span class="hw-ts">${tail}</span>`);
  return out.join("");
}

/** 글자 겹침 종류(한글): 1 원 · 2 반전 원 · 3 사각형 · 4 반전 사각형 — 그 밖은 글자만 겹침 */
const COMPOSE_SHAPE: Record<number, string> = { 1: "circle", 2: "circle inv", 3: "rect", 4: "rect inv" };

/**
 * 글자 겹침: 글자들을 한 칸에 겹쳐 가운데 맞춤(칸 폭 = 가장 넓은 글자). 글자는 CSS로 그려 편집 글에 섞이지 않음(카드 JSON에도 없음)
 */
function composeHtml(ctx: HtmlCtx, it: Extract<Inline, { kind: "compose" }>): string {
  const base = ctx.doc.charPrs[it.charPr];
  if (!base) return "";
  const kids = [...it.chars].map((ch, i) => {
    const c = ctx.doc.charPrs[it.charPrs[i] ?? -1] ?? base;
    const lang = langOf(ch.codePointAt(0) ?? 32);
    let css = charBaseCss(c, lang);
    if (SYMBOL_PUA.test(ch)) css += `;font-family:${[...SYMBOL_FACES.map(q), fontStack(c.face[lang] || c.face[0])].join(",")}`;
    return `<span data-c="${escHtml(ch)}" style="${css}"></span>`;
  });
  const shape = COMPOSE_SHAPE[it.border];
  return `<span class="hw-cmp${shape ? ` hw-cmp-${shape.replace(" ", " hw-cmp-")}` : ""}" aria-hidden="true" style="${charBaseCss(base, 0)}">${kids.join("")}</span>`;
}

/** 문단 머리 글자 조각: 글머리표 문자·번호 글을 머리 글자 모양으로, 본문과의 거리만큼 띄움.
 * 보통은 CSS로 그려 편집 글에 섞이지 않고, headText(카드 JSON이 번호 글을 본문에 적은 경우)면 편집 글로 둠 */
function paraHeadHtml(ctx: HtmlCtx, p: Para, pp: ParaPr, endCp: number, gs: Glyph[]): { html: (visible: boolean) => string; auto: boolean } | null {
  if (!p.head) return null;
  const def = pp.headingType === "BULLET" ? ctx.doc.bullets[pp.headingId - 1]?.head : ctx.doc.numberings[(pp.headingId || 1) - 1]?.levels[pp.headingLevel]?.head;
  if (!def) return null;
  // 머리 글자 모양: 따로 정하지 않았으면 문단 끝 글자 모양(한글 동작 — 원본 PDF에서 확인)
  const c = ctx.doc.charPrs[def.charPr >= 0 ? def.charPr : endCp] ?? ctx.doc.charPrs[gs[0]?.cp ?? 0];
  if (!c) return null;
  const cp = p.head.codePointAt(0) ?? 32;
  const lang = langOf(cp);
  const fs = px((c.height * (c.relSize[lang] || 100)) / 100);
  const gap = def.textOffsetPercent ? (fs * def.textOffset) / 100 : px(def.textOffset);
  // 머리 폭: '실제 글자 폭에 맞춤'이면 글 폭, 아니면 글자 크기 한 칸(1em)에 정렬해 놓음. 그 뒤 본문과의 거리
  // 번호 글자에도 자간이 붙음(fit.ts가 맞춤)
  const sp = spacingAttrs(c, lang, { ratioInLine: false });
  let css = `${charBaseCss(c, lang)}${sp.css};margin-right:${f3(gap)}px`;
  if (!def.instWidth) css += `;width:${f3(fs * [...p.head].length + px(def.widthAdjust))}px;text-align:${def.align.toLowerCase()}`;
  else if (def.widthAdjust) css += `;padding-right:${f3(px(def.widthAdjust))}px`;
  if (SYMBOL_PUA.test(p.head)) css += `;font-family:${[...SYMBOL_FACES.map(q), fontStack(c.face[lang] || c.face[0])].join(",")}`;
  const data = escHtml(p.head);
  return {
    auto: def.autoIndent,
    html: (visible) =>
      p.headText && visible
        ? `<span class="hw-head hw-head-t"${sp.attrs}${def.instWidth ? ` data-g="${f3(gap)}"` : ""} style="${css}">${data}<span class="hw-z"> </span></span>`
        : `<span class="hw-head${visible ? "" : " hw-ghost"}"${sp.attrs}${def.instWidth ? ` data-g="${f3(gap)}"` : ""} data-head="${data}" style="${css}" aria-hidden="true"></span>`,
  };
}

/** 줄 배치가 없는 문단(빈 문단 등)용 기본 줄 하나 */
function fallbackLine(p: Para, pp: ParaPr, cp: CharPr | undefined): LineSeg {
  const h = cp ? cp.height : 1000;
  const sp = pp.lineSpacingType === "PERCENT" ? (h * (pp.lineSpacing - 100)) / 100 : pp.lineSpacingType === "FIXED" ? pp.lineSpacing - h : pp.lineSpacing;
  return { textpos: 0, vertpos: 0, vertsize: h, textheight: h, baseline: Math.round(h * 0.85), spacing: Math.max(0, sp), horzpos: pp.left, horzsize: 0, flags: 0 };
}

/** 줄 배치 flags(한글): 17·18 줄의 첫·마지막 조각, 20 들여쓰기·자동 내어쓰기 적용, 21 문단 머리 적용 */
const LS_SEGMENT = 0x60000;
const LS_INDENT = 0x100000;
const LS_HEAD = 0x200000;

/**
 * 문단 하나(원본 줄 배치 그대로).
 *  first: 칸·글상자의 첫 문단 · last: 마지막 문단(마지막 줄 아래 줄 간격을 뺌) · prevAfter: 앞 문단의 아래 간격
 * 세로는 저장된 줄 위치를 그대로 쓰지 않고 줄 높이(글자 높이 + 줄 간격)와 문단 간격(앞 문단 아래 + 이 문단 위)으로 쌓음 —
 * 한 칸이 쪽을 넘으면 한글은 새 쪽에서 줄 위치를 0부터 다시 적어, 이어 그리는 화면에서는 그 값이 맞지 않음.
 */
/**
 * 글자처럼 놓지 않은 개체(문단 기준 위치): 문단 위쪽·왼쪽(문단 여백 또는 단)에서 떨어진 거리 + 바깥 여백 자리에 띄워 그림.
 * 한글은 칸 내용 높이를 이 개체 아래 끝(바깥 여백 포함)까지 셈 — 원본 칸 높이(개체 + 바깥 여백 + 칸 여백)와 원본 PDF 행 높이로 확인
 */
function floatsHtml(ctx: HtmlCtx, fl: Glyph[], pp: ParaPr, width: number, depth: number): { html: string; bottom: number } {
  let bottom = 0;
  const html = fl
    .map((g) => {
      const o = (g.item as Extract<Inline, { kind: "obj" }>).obj;
      const [ml, mr, mt, mb] = o.pos.outMargin;
      const w = o.kind === "table" ? o.pos.width : Math.abs(o.curW) || o.pos.width;
      const h = o.kind === "table" ? o.pos.height : Math.abs(o.curH) || o.pos.height;
      const refLeft = o.pos.horzRelTo === "PARA" ? pp.left : 0;
      const refW = Math.max(0, width - (o.pos.horzRelTo === "PARA" ? pp.left + pp.right : 0));
      const ha = o.pos.horzAlign;
      const x = ha === "CENTER" ? refLeft + (refW - w) / 2 + o.pos.horzOffset : ha === "RIGHT" || ha === "OUTSIDE" ? refLeft + refW - w - mr - o.pos.horzOffset : refLeft + o.pos.horzOffset + ml;
      const y = o.pos.vertOffset + mt;
      bottom = Math.max(bottom, y + h + mb);
      return `<span class="hw-fl" style="left:${f3(px(x))}px;top:${f3(px(y))}px">${objHtml(ctx, o, depth)}</span>`;
    })
    .join("");
  return { html, bottom };
}

export function paraHtml(ctx: HtmlCtx, p: Para, opts: { first: boolean; last: boolean; prevAfter: number; width: number; depth: number; attrs?: string; gap?: number }): { html: string } {
  const pp = ctx.doc.paraPrs[p.paraPr];
  const all = glyphs(p);
  // 문단 기준으로 띄운 개체는 줄 밖에(문서 맨 위 표는 덩이로 따로 그리므로 여기에는 칸·글상자 속 개체만 옴)
  const isFloat = (g: Glyph) => g.item.kind === "obj" && !g.item.obj.pos.treatAsChar && g.item.obj.pos.vertRelTo === "PARA";
  const gs = all.filter((g) => !isFloat(g));
  const fl = floatsHtml(ctx, all.filter(isFloat), pp, opts.width, opts.depth);
  const flStyle = fl.html ? `;position:relative;min-height:${f3(px(fl.bottom))}px` : "";
  const firstCp = gs.find((g) => g.item.kind === "text")?.cp ?? p.items[0]?.charPr ?? 0;
  // gap: 쪽 보기에서 다음 쪽으로 이어지는 조각의 첫 문단은 위 간격 없이(한글은 새 쪽 첫 줄을 0에 둠)
  const gap = opts.gap ?? (opts.first ? 0 : opts.prevAfter) + pp.before;
  const head = paraHeadHtml(ctx, p, pp, p.endCharPr ?? firstCp, gs);
  const attrs = (opts.attrs ?? "") + (p.attrs ?? "");
  const flowVars = p.attrs || p.segAttrs || p.flow ? flowStyle(ctx, p, pp, gs, firstCp, opts.width) : null;
  if (p.flow && flowVars) {
    // 글이 원본과 달라 줄 배치를 못 씀: 같은 문단 모양(여백·들여쓰기·정렬·줄 간격)과 글자 모양으로 흘려 그림.
    // 조각(강제 줄바꿈)마다 따로 감쌈
    let body = head ? head.html(true) : "";
    if (p.segAttrs) {
      let seg: Glyph[] = [];
      let k = 0;
      const put = () => {
        const inner = lineHtml(ctx, seg, false, opts.depth);
        body += p.segAttrs?.[k] ? `<span${p.segAttrs[k]}>${inner}</span>` : inner;
      };
      for (const g of gs) {
        if (g.item.kind === "br") {
          put();
          body += "<br>";
          seg = [];
          k++;
        } else seg.push(g);
      }
      put();
    } else if (p.textAttrs) {
      // 글만 감쌈: 앞뒤 개체는 밖에
      let a = 0;
      while (a < gs.length && gs[a].item.kind === "obj") a++;
      let b = gs.length;
      while (b > a && gs[b - 1].item.kind === "obj") b--;
      body += lineHtml(ctx, gs.slice(0, a), false, opts.depth) + `<span${p.textAttrs}>${lineHtml(ctx, gs.slice(a, b), false, opts.depth)}</span>` + lineHtml(ctx, gs.slice(b), false, opts.depth);
    } else body += lineHtml(ctx, gs, false, opts.depth);
    return { html: `<div class="hw-p hw-flow${p.cls ? ` ${p.cls}` : ""}"${attrs} style="margin-top:${f3(px(gap))}px;${flowVars.css}${flStyle}">${body}${fl.html}</div>` };
  }
  const lines = p.lines.length ? p.lines : [fallbackLine(p, pp, ctx.doc.charPrs[p.endCharPr ?? firstCp] ?? ctx.doc.charPrs[firstCp])];
  const flagged = lines.some((l) => (l.flags & LS_SEGMENT) !== 0);
  const html: string[] = [];
  // 조각(강제 줄바꿈)마다 줄을 감쌈: 조각 번호 = 그 줄 앞의 줄바꿈 수
  let segOpen = -1;
  const segOf = (textpos: number) => gs.filter((g) => g.item.kind === "br" && g.pos < textpos).length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const next = lines[i + 1];
    const endPos = next ? next.textpos : Infinity;
    const lg = gs.filter((g) => g.pos >= l.textpos && g.pos < endPos);
    // 강제 줄바꿈(Shift+Enter)으로 끝나는 줄은 마지막 줄처럼 정렬(양쪽 정렬로 늘리지 않음).
    // 쪽 보기에서 자른 조각의 끝 줄은 문단이 다음 쪽에 이어지면 마지막 줄이 아님(원본 PDF: 쪽 끝 줄도 양쪽 정렬로 늘림)
    const endsWithBreak = lg.some((g) => g.item.kind === "br");
    const isLast = (!next && !p.more) || endsWithBreak;
    // 줄 높이: 글자 높이 + 줄 간격(칸의 마지막 줄은 줄 간격 없이)
    const h = l.vertsize + (opts.last && !next ? 0 : l.spacing);
    // 장평: 줄 안 글자 장평이 모두 같으면 줄 전체를 가로로 줄임(정확), 섞였으면 글자 간격으로 대신
    const ratios = new Set(lg.filter((g) => g.item.kind === "text" || g.item.kind === "gen").map((g) => ctx.doc.charPrs[g.cp].ratio[langOf(g.ch.codePointAt(0) ?? 32)] || 100));
    const uniform = ratios.size <= 1 && !lg.some((g) => g.item.kind === "obj");
    const ratio = uniform && ratios.size ? [...ratios][0] / 100 : 1;
    const w = l.horzsize > 0 ? l.horzsize : Math.max(0, opts.width - pp.left - pp.right);
    // 들여쓰기·문단 머리: 한글이 줄마다 적어 둔 표시(flags)대로. 표시가 없는 파일은 첫 줄(들여쓰기)·둘째 줄부터(내어쓰기) 규칙
    const indentOn = flagged ? (l.flags & LS_INDENT) !== 0 : pp.indent > 0 ? i === 0 : i > 0 && -pp.indent < w;
    const headOn = head ? (flagged ? (l.flags & LS_HEAD) !== 0 : i === 0) : false;
    const ghost = head && !headOn && indentOn && head.auto;
    const ind = indentOn && !ghost ? Math.abs(pp.indent) : 0;
    const align = pp.align;
    const ta =
      align === "CENTER" ? "center" : align === "RIGHT" ? "right" : align === "LEFT" ? "left" : align === "JUSTIFY" ? (isLast ? "left" : "justify") : "justify";
    const tal = align === "JUSTIFY" && !isLast ? "justify" : align === "DISTRIBUTE" || align === "DISTRIBUTE_SPACE" ? "justify" : ta;
    // 줄 표시: 최소 공백(줄이 넘칠 때 빈칸을 줄일 한도), 배분 정렬(fit.ts가 남는 폭을 글자 사이마다 나눔)
    const lineAttrs = `${pp.condense ? ` data-cond="${pp.condense}"` : ""}${align === "DISTRIBUTE" ? ' data-dist="1"' : ""}`;
    const cp0 = ctx.doc.charPrs[lg.find((g) => g.item.kind === "text")?.cp ?? firstCp];
    const face = cp0 ? cp0.face[0] : "";
    const style = [
      `margin-left:${f3(px(l.horzpos))}px`,
      `width:${f3(px(ratio !== 1 ? w / ratio : w))}px`,
      `height:${f3(px(h))}px`,
      // 기준선: 줄 맨 앞 기준 표지(높이 = 한글 기준선)로 줄 위에서 정확히 그 거리에 둠. 글꼴 높이 값이나 반올림과 무관
      "line-height:0",
      `font-size:${f3(px(l.vertsize))}px`,
      `font-family:${fontStack(face)}`,
      `text-align:${ta}`,
      `text-align-last:${tal}`,
      // 배분 정렬: 남는 폭을 빈칸 포함 모든 글자 사이에 고르게(마지막 글자 뒤 제외 — 원본 PDF). 화면에서는 fit.ts가 글자 폭을 잰 뒤
      // 직접 나누고(크롬은 줄 앞 기준 표지 때문에 첫 글자에 두 번 줌), 이 CSS는 그 전의 근사.
      // 양쪽·나눔 정렬은 빈칸에만(크롬 기본값은 □·○ 같은 동아시아 기호 옆도 늘림 — 한글은 늘리지 않음)
      align === "DISTRIBUTE" ? "text-justify:inter-character" : ta === "justify" || tal === "justify" ? "text-justify:inter-word" : "",
      ind ? `padding-left:${f3(px(ind))}px` : "",
      ratio !== 1 ? `transform:scaleX(${f3(ratio)});margin-right:${f3(px(w - w / ratio))}px` : "",
    ]
      .filter(Boolean)
      .join(";");
    // 줄 끝 빈칸은 폭 없이(한글은 줄 끝 빈칸을 정렬 폭에 넣지 않음 — 가운데·오른쪽 정렬이 원본과 맞음) 두되 글자는 남김(편집 글자 보존)
    let body = lineHtml(ctx, lg, uniform, opts.depth, true, l.vertsize);
    // 문단 머리(글머리표·번호): 머리를 적용한 줄 앞에 그리고, 자동 내어쓰기 줄은 같은 폭을 비워 둠(글자는 CSS로 그려 편집 글에 섞이지 않음)
    if (head && (headOn || ghost)) body = head.html(headOn) + body;
    // 기준선: 한글이 저장한 값. 「세로 정렬: 가운데」 문단은 줄 가운데를 적어 두므로(글자 높이의 50%) 글자 상자(기준선 위 85%·아래 15%)를
    // 줄 가운데에 둔 기준선으로 — 기준선 정렬 줄은 파일에서 모두 글자 높이의 85%(10,144줄), 가운데 정렬 줄은 모두 50%(21줄)
    const blY = pp.vertAlign === "CENTER" ? l.baseline + (BASELINE_RATIO - 0.5) * l.textheight : l.baseline;
    const bl = `<i class="hw-bl" style="height:${f3(px(blY))}px"></i>`;
    // 글만 감쌀 문단: 줄 앞 개체(글상자·표)를 따로 떼어 같은 자리에 두고, 글은 감쌈 안에(개체 속 글이 편집 글에 섞이지 않게)
    if (p.textAttrs) {
      // 끝 줄 뒤 개체(「신규」·「개선」 딱지 글상자 등): 감쌈을 닫은 뒤 같은 줄 자리에
      let z = lg.length;
      if (i === lines.length - 1)
        while (z > 0 && (lg[z - 1].item.kind === "obj" || (["text", "gen", "zero"].includes(lg[z - 1].item.kind) && /^\s$/.test(lg[z - 1].ch)))) z--;
      const trailing = i === lines.length - 1 && lg.slice(z).some((g) => g.item.kind === "obj") ? lg.slice(z) : [];
      if (trailing.length) {
        const tw = trailing.reduce((sum, g) => sum + (g.item.kind === "obj" ? objWidth(g.item.obj) : 0), 0);
        const main = lg.slice(0, z);
        const mainBody = (head && (headOn || ghost) ? head.html(headOn) : "") + lineHtml(ctx, main, uniform, opts.depth, false, l.vertsize);
        if (i === 0) html.push(`<span${p.textAttrs}>`);
        // 글 부분은 원래 정렬대로 줄 폭에서 딱지 폭을 뺀 만큼, 딱지는 그 뒤(원본에서 딱지는 글 끝 뒤에 이어 붙음)
        const mStyle = style.replace(/width:[^;]+/, `width:${f3(px(Math.max(0, w - tw)))}px`);
        const tStyle = style.replace(/margin-left:[^;]+/, "margin-left:0px").replace(/width:[^;]+/, `width:${f3(px(tw))}px`).replace(/;?padding-left:[^;]+/, "");
        html.push(`<span class="hw-l"${lineAttrs} style="${mStyle}">${bl}${mainBody}</span>`);
        html.push("</span>");
        html.push(`<span class="hw-l" style="${tStyle}">${bl}${lineHtml(ctx, trailing, uniform, opts.depth, false, l.vertsize)}</span>`);
        continue;
      }
      let k = 0;
      while (k < lg.length && (lg[k].item.kind === "obj" || (["gen", "zero"].includes(lg[k].item.kind) && /^\s$/.test(lg[k].ch)))) k++;
      while (k > 0 && lg[k - 1].item.kind !== "obj") k--;
      if (k > 0 && i === 0) {
        const objs = lg.slice(0, k);
        const ow = objs.reduce((sum, g) => sum + (g.item.kind === "obj" ? objWidth(g.item.obj) : 0), 0);
        const lead = (head && (headOn || ghost) ? head.html(headOn) : "") + lineHtml(ctx, objs, uniform, opts.depth, false, l.vertsize);
        const restBody = lineHtml(ctx, lg.slice(k), uniform, opts.depth, false, l.vertsize);
        const aStyle = style.replace(/width:[^;]+/, `width:${f3(px(ow + ind))}px`).replace(/text-align:[^;]+;text-align-last:[^;]+/, "text-align:left;text-align-last:left");
        const bStyle = style
          .replace(/margin-left:[^;]+/, "margin-left:0px")
          .replace(/width:[^;]+/, `width:${f3(px(Math.max(0, w - ow - ind)))}px`)
          .replace(/;?padding-left:[^;]+/, "");
        html.push(`<span class="hw-l" style="${aStyle}">${bl}${lead}</span>`);
        html.push(`<span${p.textAttrs}>`);
        html.push(`<span class="hw-l"${lineAttrs} style="${bStyle}">${bl}${restBody}</span>`);
      } else {
        if (i === 0) html.push(`<span${p.textAttrs}>`);
        html.push(`<span class="hw-l"${lineAttrs} style="${style}">${bl}${body || ""}</span>`);
      }
      if (i === lines.length - 1) html.push("</span>");
      continue;
    }
    const line = `<span class="hw-l"${lineAttrs} style="${style}">${bl}${body || ""}</span>`;
    if (p.segAttrs) {
      const seg = segOf(l.textpos);
      if (seg !== segOpen) {
        if (segOpen >= 0 && p.segAttrs[segOpen]) html.push("</span>");
        segOpen = seg;
        if (p.segAttrs[seg]) html.push(`<span${p.segAttrs[seg]}>`);
      }
    }
    html.push(line);
  }
  if (p.segAttrs && segOpen >= 0 && p.segAttrs[segOpen]) html.push("</span>");
  return { html: `<div class="hw-p${p.cls ? ` ${p.cls}` : ""}"${attrs} style="margin-top:${f3(px(gap))}px${flowVars ? `;${flowVars.vars}` : ""}${flStyle}">${html.join("")}${fl.html}</div>` };
}

/**
 * 흘려 그리기(원본과 글이 달라진 문단, 편집 중인 문단)의 문단 모양: 여백·들여쓰기(내어쓰기)·정렬·줄 간격·글자 크기·줄나눔 단위.
 * css는 흘려 그리는 문단에, vars는 원본 줄 배치 문단이 편집 중에 흘려 보일 때 쓸 CSS 변수로
 */
function flowStyle(ctx: HtmlCtx, p: Para, pp: ParaPr, gs: Glyph[], firstCp: number, width: number): { css: string; vars: string } {
  const c = ctx.doc.charPrs[gs.find((g) => g.item.kind === "text" && !/\s/.test(g.ch))?.cp ?? p.endCharPr ?? firstCp] ?? ctx.doc.charPrs[firstCp];
  const h = c ? c.height : 1000;
  const pitch = pp.lineSpacingType === "PERCENT" ? (h * pp.lineSpacing) / 100 : pp.lineSpacingType === "FIXED" ? pp.lineSpacing : pp.lineSpacingType === "BETWEEN_LINES" ? h + pp.lineSpacing : Math.max(h, pp.lineSpacing);
  const pl = pp.left + (pp.indent < 0 ? -pp.indent : 0);
  const ti = pp.indent;
  const ta = pp.align === "CENTER" ? "center" : pp.align === "RIGHT" ? "right" : pp.align === "LEFT" ? "left" : "justify";
  const face = c ? c.face[0] : "";
  const wb = pp.breakNonLatin === "KEEP_WORD" ? "keep-all" : "normal";
  const vars = `--hw-pl:${f3(px(pl))}px;--hw-pr:${f3(px(pp.right))}px;--hw-ti:${f3(px(ti))}px;--hw-lh:${f3(px(pitch))}px;--hw-fs:${f3(px(h))}px;--hw-ta:${ta};--hw-wb:${wb}`;
  const css = [
    `padding-left:${f3(px(pl))}px`,
    `padding-right:${f3(px(pp.right))}px`,
    `text-indent:${f3(px(ti))}px`,
    `text-align:${ta}`,
    // 배분·나눔 정렬은 마지막 줄도 양쪽으로(배분은 글자 사이마다)
    pp.align === "DISTRIBUTE" || pp.align === "DISTRIBUTE_SPACE" ? "text-align-last:justify" : "text-align-last:start",
    pp.align === "DISTRIBUTE" ? "text-justify:inter-character" : ta === "justify" ? "text-justify:inter-word" : "",
    `line-height:${f3(px(pitch))}px`,
    `font-size:${f3(px(h))}px`,
    `font-family:${fontStack(face)}`,
    `word-break:${wb}`,
    width > 0 ? `max-width:${f3(px(width))}px` : "",
  ]
    .filter(Boolean)
    .join(";");
  return { css, vars };
}

/** 문단 목록(칸·글상자 안) */
export function parasHtml(ctx: HtmlCtx, ps: Para[], width: number, depth: number, firstGap?: number): string {
  let prevAfter = 0;
  return ps
    .map((p, i) => {
      const r = paraHtml(ctx, p, { first: i === 0, last: i === ps.length - 1, prevAfter, width, depth, ...(i === 0 && firstGap !== undefined ? { gap: firstGap } : {}) });
      prevAfter = ctx.doc.paraPrs[p.paraPr]?.after ?? 0;
      return r.html;
    })
    .join("");
}

// ───────────────────────── 개체

/** 줄 안 개체가 차지하는 폭(HWPUNIT, 바깥 여백 포함) */
function objWidth(o: Table | Pic | Shape): number {
  // 뒤집은 개체는 지금 크기가 음수로 적힘(크기는 절댓값)
  const w = o.kind === "table" ? o.pos.width : Math.abs(o.curW) || o.pos.width;
  const [l, r] = o.pos.treatAsChar ? o.pos.outMargin : [0, 0];
  return w + l + r;
}

/** 글자처럼 취급하는 개체의 바깥 여백(한글: 줄 안에서 개체 폭·높이에 더해 자리를 차지함) */
function outMarginCss(o: Table | Pic | Shape): string {
  if (!o.pos.treatAsChar) return "";
  const [l, r, t, b] = o.pos.outMargin;
  return l || r || t || b ? `;margin:${f3(px(t))}px ${f3(px(r))}px ${f3(px(b))}px ${f3(px(l))}px` : "";
}

function objHtml(ctx: HtmlCtx, o: Table | Pic | Shape, depth: number): string {
  // 글자처럼 취급하는 표는 줄 안 상자로(표는 블록이라 그대로 두면 줄 흐름에서 빠져 앞 글자 위에 겹침)
  if (o.kind === "table") {
    const m = outMarginCss(o);
    return `<span class="hw-o hw-tbo"${m ? ` style="${m.slice(1)}"` : ""}>${tableHtml(ctx, o, depth + 1)}</span>`;
  }
  if (o.kind === "pic") return picHtml(ctx, o);
  return shapeHtml(ctx, o, depth);
}

function picHtml(ctx: HtmlCtx, p: Pic): string {
  const url = ctx.imageUrl(p.bin);
  const w = px(Math.abs(p.curW) || p.pos.width);
  const h = px(Math.abs(p.curH) || p.pos.height);
  const [cl, ct, cr, cb] = p.crop;
  // 저장된 그림이 차지하는 범위(자르기 좌표계, HWPUNIT): 보통은 원래 크기와 같고, 한글에서 잘린 부분을 지운 그림은 자른 크기(imgDim)
  const [bw, bh] = p.imgDim && p.imgDim[0] > 0 && p.imgDim[1] > 0 ? p.imgDim : [p.orgW, p.orgH];
  const cw = (cr > 0 ? cr : bw) - cl;
  const ch = (cb > 0 ? cb : bh) - ct;
  // 저장된 그림이 곧 자른 부분이면(범위 = 자르기 크기) 그림 전체를 그대로 — 원본 PDF(주요사업2 열일곱째 카드 그림)
  const whole = Math.abs(cw - bw) <= 1 && Math.abs(ch - bh) <= 1;
  const cropped = !whole && (cl > 0 || ct > 0 || (cr > 0 && cr < bw) || (cb > 0 && cb < bh)) && bw > 0 && bh > 0 && cw > 0 && ch > 0;
  const style = `width:${f3(w)}px;height:${f3(h)}px${outMarginCss(p)}`;
  if (!url) return `<span class="hw-o hw-pic" style="${style}"></span>`;
  if (!cropped) return `<img class="hw-o hw-pic" src="${escHtml(url)}" alt="" style="${style}">`;
  // 자르기: 저장된 그림 범위 기준 영역만 보이게
  const sx = Math.abs(p.curW) / cw;
  const sy = Math.abs(p.curH) / ch;
  return `<span class="hw-o hw-pic" style="${style};overflow:hidden"><img src="${escHtml(url)}" alt="" style="position:absolute;left:${f3(px(-cl * sx))}px;top:${f3(px(-ct * sy))}px;width:${f3(px(bw * sx))}px;height:${f3(px(bh * sy))}px;max-width:none"></span>`;
}

/** 묶음 속 개체: 만들 때 좌표를 묶음 상자 좌표로 옮겨, 차지하는 범위에 그림(선·다각형은 점을 옮겨 그림) */
function childHtml(ctx: HtmlCtx, c: Shape | Pic, depth: number): string {
  const m = shapeMatrix(c.geo);
  if (!m || !c.geo) {
    const x = c.kind === "pic" ? (c.x ?? 0) : c.x;
    const y = c.kind === "pic" ? (c.y ?? 0) : c.y;
    return `<span class="hw-gc" style="left:${f3(px(x))}px;top:${f3(px(y))}px">${c.kind === "pic" ? picHtml(ctx, c) : shapeHtml(ctx, c, depth)}</span>`;
  }
  const [x0, y0, x1, y1] = geoBox(c.geo, m);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const flat = { curW: w, curH: h, geo: undefined, pos: { ...c.pos, treatAsChar: false } };
  let inner: string;
  if (c.kind === "pic") inner = picHtml(ctx, { ...c, ...flat });
  else if (c.kind === "line" || c.kind === "polygon" || c.kind === "curve") inner = shapeHtml(ctx, { ...c, ...flat, points: c.points.map(([x, y]) => applyMat(m, x, y)).map(([x, y]) => [x - x0, y - y0] as [number, number]) }, depth);
  else inner = shapeHtml(ctx, { ...c, ...flat }, depth);
  return `<span class="hw-gc" style="left:${f3(px(x0))}px;top:${f3(px(y0))}px">${inner}</span>`;
}

/** SVG 채우기(단색·그러데이션) — 그러데이션 id는 내용으로 정함(서버·브라우저가 같은 결과) */
function svgPaint(f: Fill | null): { defs: string; paint: string } {
  if (f?.gradation) {
    const g = f.gradation;
    const cs = g.colors.length ? g.colors : ["#FFFFFF", "#000000"];
    const a = (g.angle * Math.PI) / 180;
    const [sx, sy] = [Math.sin(a), -Math.cos(a)];
    const id = `hwg${Math.abs([...`${g.angle}|${cs.join(",")}|${g.positions ?? ""}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)).toString(36)}`;
    const stops = cs.map((c, i) => `<stop offset="${g.positions && g.positions.length === cs.length ? g.positions[i] / 100 : cs.length > 1 ? i / (cs.length - 1) : 0}" stop-color="${c}"/>`).join("");
    const defs = `<defs><linearGradient id="${id}" x1="${f3(0.5 - sx / 2)}" y1="${f3(0.5 - sy / 2)}" x2="${f3(0.5 + sx / 2)}" y2="${f3(0.5 + sy / 2)}">${stops}</linearGradient></defs>`;
    return { defs, paint: `url(#${id})` };
  }
  return { defs: "", paint: f?.color ?? "none" };
}

function shapeHtml(ctx: HtmlCtx, s: Shape, depth: number): string {
  const w = Math.abs(s.curW) || s.pos.width;
  const h = Math.abs(s.curH) || s.pos.height;
  const size = `width:${f3(px(w))}px;height:${f3(px(h))}px${outMarginCss(s)}`;
  // 묶음: 자식(도형·그림)을 변환 행렬대로 묶음 상자 안에 둠
  if (s.kind === "container") {
    const kids = s.children.map((c) => childHtml(ctx, c, depth)).join("");
    return `<span class="hw-o hw-grp" style="${size}">${kids}</span>`;
  }
  const lw = s.line && s.line.type !== "NONE" && s.line.width > 0 ? px(s.line.width) : 0;
  // 선·다각형·곡선: SVG(점은 만들 때 좌표 — 변환 행렬로 상자 좌표로 옮김)
  if ((s.kind === "line" || s.kind === "polygon" || s.kind === "curve") && s.points.length >= 2) {
    const m = shapeMatrix(s.geo);
    const pts0 = m ? s.points.map(([x, y]) => applyMat(m, x, y)) : s.points;
    const stroke = lw ? ` stroke="${s.line?.color ?? "#000"}" stroke-width="${f3(lw)}"${/DASH|DOT/.test(s.line?.type ?? "") ? ' stroke-dasharray="3 2"' : ""}` : ' stroke="none"';
    const pts = pts0.map(([x, y]) => `${f3(px(x))},${f3(px(y))}`).join(" ");
    const { defs, paint } = s.kind !== "line" ? svgPaint(s.fill) : { defs: "", paint: "none" };
    const shape = s.kind === "line" ? `<polyline points="${pts}" fill="none"${stroke}/>` : `<polygon points="${pts}" fill="${paint}"${stroke}/>`;
    return `<span class="hw-o hw-box" style="${size}"><svg class="hw-svg" width="${f3(px(w))}" height="${f3(px(h))}" viewBox="0 0 ${f3(px(w))} ${f3(px(h))}" aria-hidden="true">${defs}${shape}</svg></span>`;
  }
  const st: string[] = [size];
  if (lw) {
    // 선은 도형 가장자리 중앙에 그림(글상자 안 글자 자리에 영향 없음). 실선은 그림자 두 겹(바깥 반·안쪽 반)으로 — 소수 굵기 그대로
    // (outline은 크롬이 정수 px로 내림), 무늬 선만 outline
    const type = s.line?.type ?? "SOLID";
    const color = s.line?.color ?? "#000";
    if (type === "SOLID" || !SHAPE_LINE_CSS[type]) {
      const half = `calc(max(var(--hw-dp,1px),${f3(lw)}px) / 2)`;
      st.push(`box-shadow:0 0 0 ${half} ${color},inset 0 0 0 ${half} ${color}`);
    } else st.push(`outline:${f3(lw)}px ${SHAPE_LINE_CSS[type]} ${color}`, `outline-offset:${f3(-lw / 2)}px`);
  }
  if (s.fill?.gradation) st.push(`background-image:${gradientCss(s.fill)}`);
  else if (s.fill?.color) st.push(`background-color:${s.fill.color}`);
  if (s.kind === "ellipse") st.push("border-radius:50%");
  else if (s.round > 0) st.push(`border-radius:${f3(px((Math.min(w, h) * s.round) / 100))}px`);
  let inner = "";
  if (s.text) {
    const [ml, mr, mt, mb] = s.text.margin;
    const va = s.text.vertAlign === "CENTER" ? "center" : s.text.vertAlign === "BOTTOM" ? "flex-end" : "flex-start";
    inner = `<span class="hw-tx" style="padding:${f3(px(mt))}px ${f3(px(mr))}px ${f3(px(mb))}px ${f3(px(ml))}px;justify-content:${va}">${parasHtml(ctx, s.text.paras, w - ml - mr, depth + 1)}</span>`;
  }
  return `<span class="hw-o hw-box" style="${st.join(";")}">${inner}</span>`;
}

// ───────────────────────── 표

export function tableHtml(ctx: HtmlCtx, t: Table, depth = 0): string {
  const g = tableGrid(t, (id) => ctx.doc.paraPrs[id]?.right ?? 0);
  return tablePartHtml(ctx, t, { hs: g.hs, cells: t.cells.filter((c) => c.row < t.rows).map((c) => ({ cell: c, row: c.row, rowSpan: c.rowSpan, paras: null })) }, depth, g);
}

/**
 * 표 조각(쪽 보기): 행 높이, 칸마다 조각 안 행 번호·행 수·그릴 문단(null이면 칸 문단 그대로, 편집 연결 cellHook 포함).
 * gap: 앞 쪽에서 이어지는 칸 글의 첫 문단 위 간격(한글이 새 쪽에 적은 첫 줄 위치)
 */
export interface TablePart {
  hs: number[];
  cells: { cell: Cell; row: number; rowSpan: number; paras: Para[] | null; gap?: number }[];
}

/**
 * 맞닿은 칸 경계는 한 칸만 칠함 — 두 칸이 같은 경계를 각자 칠하면 한 장치 점보다 가는 선(0.12mm)이 서로 다른 점에 찍혀 두 겹이 됨
 * (원본 PDF는 한 겹). 더 굵은 선을 가진 칸이 칠하고, 같으면 왼쪽·위 칸(오른쪽·아래 변)이 칠함. 경계 전체가 이웃 칸으로 덮이지 않으면
 * (표 바깥·빈 자리·병합 칸이 걸친 곳) 칠함 — 선이 빠지지 않게. 칸마다 칠하지 않을 변을 돌려줌
 */
export function sharedEdgeSkips(cells: { cell: Cell; row: number; rowSpan: number }[], rows: number, cols: number, bfOf: (c: Cell) => BorderFill | null | undefined): Set<Side>[] {
  const occ: (number | undefined)[][] = Array.from({ length: rows }, () => new Array(cols));
  cells.forEach((pc, i) => {
    for (let r = pc.row; r < Math.min(rows, pc.row + pc.rowSpan); r++) for (let c = pc.cell.col; c < Math.min(cols, pc.cell.col + pc.cell.colSpan); c++) occ[r][c] = i;
  });
  const OPP: Record<Side, "left" | "right" | "top" | "bottom"> = { l: "right", r: "left", t: "bottom", b: "top" };
  const OWN: Record<Side, "left" | "right" | "top" | "bottom"> = { l: "left", r: "right", t: "top", b: "bottom" };
  return cells.map((pc) => {
    const skip = new Set<Side>();
    const bf = bfOf(pc.cell);
    if (!bf) return skip;
    const r0 = pc.row;
    const r1 = Math.min(rows, pc.row + pc.rowSpan);
    const c0 = pc.cell.col;
    const c1 = Math.min(cols, pc.cell.col + pc.cell.colSpan);
    for (const side of ["l", "r", "t", "b"] as Side[]) {
      const w = borderMm(bf[OWN[side]]);
      if (!w) continue;
      // 그 변 바깥 한 줄의 칸들(하나라도 비면 이웃 없음)
      const at: [number, number][] = [];
      if (side === "l" || side === "r") {
        const c = side === "l" ? c0 - 1 : c1;
        if (c < 0 || c >= cols) continue;
        for (let r = r0; r < r1; r++) at.push([r, c]);
      } else {
        const r = side === "t" ? r0 - 1 : r1;
        if (r < 0 || r >= rows) continue;
        for (let c = c0; c < c1; c++) at.push([r, c]);
      }
      const ns = at.map(([r, c]) => occ[r][c]);
      if (!ns.length || ns.some((n) => n === undefined)) continue;
      const other = [...new Set(ns as number[])].map((n) => borderMm(bfOf(cells[n].cell)?.[OPP[side]]));
      // 왼쪽·위 변은 이웃이 같거나 굵으면, 오른쪽·아래 변은 이웃이 더 굵을 때만 이웃에게 맡김
      if (side === "l" || side === "t" ? other.every((o) => o >= w) : other.every((o) => o > w)) skip.add(side);
    }
    return skip;
  });
}

export function tablePartHtml(ctx: HtmlCtx, t: Table, part: TablePart, depth = 0, grid?: Grid): string {
  faceInfoOf = (face) => ctx.doc.faces?.[face];
  const g = grid ?? tableGrid(t, (id) => ctx.doc.paraPrs[id]?.right ?? 0);
  const cols = g.xs.slice(1).map((x, i) => x - g.xs[i]);
  const rows: TablePart["cells"][] = Array.from({ length: part.hs.length }, () => []);
  for (const pc of part.cells) if (pc.row < part.hs.length) rows[pc.row].push(pc);
  const placed = part.cells.filter((pc) => pc.row < part.hs.length);
  const skipList = sharedEdgeSkips(placed, part.hs.length, t.cols, (c) => ctx.doc.borderFills[c.borderFill]);
  const skips = new Map(placed.map((pc, i) => [pc, skipList[i]]));
  const out: string[] = [`<table class="hw-t" style="width:${f3(px(g.width))}px">`, `<colgroup>${cols.map((w) => `<col style="width:${f3(px(w))}px">`).join("")}</colgroup>`];
  rows.forEach((cells, r) => {
    out.push(`<tr style="height:${f3(px(part.hs[r]))}px">`);
    cells.sort((a, b) => a.cell.col - b.cell.col);
    for (const pc of cells) {
      const { cell: c, rowSpan, paras, gap } = pc;
      const right = Math.min(t.cols, c.col + c.colSpan);
      const w = g.xs[right] - g.xs[c.col];
      const box = borderFillCss(ctx.doc.borderFills[c.borderFill], ctx.imageUrl, skips.get(pc));
      const [ml, mr, mt, mb] = c.margin;
      const va = c.vertAlign === "CENTER" ? "middle" : c.vertAlign === "BOTTOM" ? "bottom" : "top";
      const span = `${c.colSpan > 1 ? ` colspan="${c.colSpan}"` : ""}${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ""}`;
      const inner = paras ? parasHtml(ctx, paras, w - ml - mr, depth, gap) : (ctx.cellHook?.(t, c, depth) ?? parasHtml(ctx, c.paras, w - ml - mr, depth));
      out.push(
        `<td${span} class="hw-c${box.border ? " hw-bd" : ""}" style="padding:${f3(px(mt))}px ${f3(px(mr))}px ${f3(px(mb))}px ${f3(px(ml))}px;--hw-ci:-9999px ${f3(-px(mr))}px -9999px ${f3(-px(ml))}px;vertical-align:${va};${box.style}"><div class="hw-cc"${c.attrs ?? ""}>${inner}</div></td>`,
      );
    }
    out.push("</tr>");
  });
  out.push("</table>");
  return out.join("");
}

/**
 * 한글 문서 조각 기본 스타일(칸 테두리는 가장자리 중앙에, 줄은 원본 줄 배치대로).
 * 표 테두리는 칸 내용 위에 — 한글은 표마다 칸 배경·내용(글·그림·안쪽 표)을 찍은 뒤 테두리를 마지막에 그림(원본 PDF 그리기 순서).
 *  칸보다 넓은 그림도 테두리 선 아래에 놓임(칸 내용 z 2 < 테두리 z 3, 칸 내용마다 쌓임 맥락이라 안쪽 표 테두리는 그 칸 안에서 같은 규칙)
 * 원본 줄의 고정폭 빈칸(data-w="q")은 inline-block — 한글은 양쪽 정렬에서 고정폭 빈칸을 늘리지 않음(원본 PDF), 편집 중에는 보통 글
 */
export const HW_CSS = `
.hw-doc{position:relative;color:#000;font-kerning:none;font-variant-ligatures:none;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;--hw-dp:1px}
@media (min-resolution:1.25dppx){.hw-doc{--hw-dp:.8px}}
@media (min-resolution:1.5dppx){.hw-doc{--hw-dp:.6667px}}
@media (min-resolution:2dppx){.hw-doc{--hw-dp:.5px}}
@media (min-resolution:3dppx){.hw-doc{--hw-dp:.3334px}}
.hw-t{border-collapse:separate;border-spacing:0;table-layout:fixed;margin:0}
.hw-c{position:relative;box-sizing:border-box;overflow:visible}
.hw-c.hw-bd::before{content:"";position:absolute;pointer-events:none;z-index:3;
  left:calc(var(--hw-lw,0px)/-2);right:calc(var(--hw-rw,0px)/-2);top:calc(var(--hw-tw,0px)/-2);bottom:calc(var(--hw-bw,0px)/-2);
  background:var(--hw-gl,none),var(--hw-gr,none),var(--hw-gt,none),var(--hw-gb,none)}
/* 칸 내용은 칸의 왼쪽·오른쪽 끝(테두리 중심선, 안 여백 포함)에서 자름 — 한글은 칸마다 칸 사각형으로 잘라 그림(원본 PDF 자르기 경로: 칸보다 넓은 안쪽 표·그림).
   위·아래는 자르지 않음: 행 높이가 내용을 품어 넘치지 않고, 내용 상자는 세로 정렬로 칸보다 낮게 놓여 그 상자로 자르면 첨자·동그라미 숫자·딱지 테두리·글자 아래 획이 잘림.
   고치는 중(초점)·리뷰 표시 칸은 자르지 않음(초점 테두리·표시 윤곽) */
.hw-cc{position:relative;z-index:2;clip-path:inset(var(--hw-ci,0))}
.hw-cc:focus-within,.hw-cc:has(.kc-anchor-hot){clip-path:none}
.hw-p{display:block;font-size:0;line-height:0;white-space:normal}
.hw-l{display:inline-block;vertical-align:top;white-space:pre;box-sizing:border-box;transform-origin:0 0;overflow:visible;word-spacing:0}
.hw-ts,.hw-ts *{font-size:0!important;letter-spacing:0!important;word-spacing:0!important}
.hw-tsh{display:inline-block;position:relative;height:0;vertical-align:baseline;pointer-events:none}
.hw-tsh::before{content:"";position:absolute;left:0;right:0;top:var(--hw-sht);height:var(--hw-shh);background:var(--hw-sh)}
.hw-edit .hw-tsh{display:none}
.hw-lead{display:inline-block;word-spacing:0}
.hw-l [data-w="q"]{display:inline-block}
.hw-bl{display:inline-block;width:0;vertical-align:baseline}
.hw-head{display:inline-block;white-space:pre}
.hw-head::before{content:attr(data-head)}
.hw-ghost{visibility:hidden}
.hw-g::before{content:attr(data-c)}
.hw-z{font-size:0!important;letter-spacing:0!important;word-spacing:0!important}
.hw-seg{display:inline}
.hw-flow{white-space:pre-wrap;overflow-wrap:anywhere}
.hw-flow .hw-lead{display:inline}
.hw-edit{white-space:pre-wrap!important;overflow-wrap:anywhere}
.hw-p.hw-edit,.hw-edit .hw-p{font-size:var(--hw-fs)!important;line-height:var(--hw-lh)!important;padding-left:var(--hw-pl);padding-right:var(--hw-pr);text-indent:var(--hw-ti);text-align:var(--hw-ta);word-break:var(--hw-wb)}
.hw-edit .hw-l{display:inline!important;width:auto!important;height:auto!important;margin:0!important;padding:0!important;transform:none!important;line-height:inherit!important;font-size:inherit!important;white-space:pre-wrap!important;text-indent:0}
.hw-edit .hw-bl{display:none}
.hw-edit [data-w="q"]{display:inline!important}
.hw-edit .hw-lead{display:inline}
.hw-edit .hw-ts,.hw-edit .hw-ts *,.hw-edit .hw-z{font-size:inherit!important}
.hw-cmp{display:inline-grid;vertical-align:baseline;justify-items:center;white-space:pre;position:relative}
.hw-cmp>span{grid-area:1/1}
.hw-cmp>span::before{content:attr(data-c)}
.hw-cmp-circle::after,.hw-cmp-rect::after{content:"";position:absolute;z-index:-1;left:50%;top:0;width:1em;height:1em;transform:translate(-50%,-80%);box-sizing:border-box;border:.07em solid currentColor}
.hw-cmp-circle::after{border-radius:50%}
.hw-cmp-inv::after{background:currentColor}
.hw-cmp-inv>span{color:#fff!important}
.hw-o{display:inline-block;vertical-align:top;box-sizing:border-box;position:relative;text-align:left;text-align-last:auto;letter-spacing:0;word-spacing:0;white-space:normal}
.hw-grp{position:relative}
.hw-fl{position:absolute;display:block;line-height:0;text-align:left}
.hw-ov{display:inline-block;position:relative;vertical-align:top;line-height:0}
.hw-gc{position:absolute;display:block;line-height:0}
.hw-svg{display:block;overflow:visible}
.hw-tx{display:flex;flex-direction:column;box-sizing:border-box;width:100%;height:100%}
img.hw-pic{object-fit:fill}
`;
