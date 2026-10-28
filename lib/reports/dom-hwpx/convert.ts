// 화면 배치 스냅숏(snapshot.ts) → 한글 모델(HwpxInput) → HWPX — 시험판(2026-10-28). 입출력 없는 순수 모듈.
// 블록 종류·화면 클래스 이름을 모르는 범용 변환기: 브라우저가 그린 상자 위치(기하)와 계산된 CSS만 보고 한글 문단·표로 옮깁니다.
// 쓰기는 카드 변환과 같은 범용 쓰기 계층(hwpx-write.ts hwpxFiles → postprocess.ts writeHwpxPackage).
//
// 나누기(기하만):
//  ① 항목 모으기: 테두리·배경이 있는 상자(→ 표 칸)와 대체 대상(그림·SVG)은 경계로 남기고, 꾸밈 없는 감싸개는 풀어 그 자식들을 같은 영역의 항목으로 올림.
//     안이 글뿐인 상자는 글 흐름(→ 문단 하나). 블록 형제 사이의 글은 익명 글 흐름(브라우저의 익명 블록과 같음)
//  ② 가로 띠: 세로 구간이 겹치는 항목끼리 한 띠(겹침 0.3mm 초과). 띠는 위에서 아래로 쌓은 문단·표가 되고 띠 사이 빈틈은 문단 위 간격
//     — 맞닿은 띠가 모두 꾸민 상자이고 세로 칸 경계가 같으면(표의 행들) 한 띠로 합침
//  ③ 띠 안에 항목이 여럿이면 표: 세로로 자를 수 있고(열 구간이 안 겹침) 꾸민 상자의 위아래 경계가 열끼리 맞지 않으면 「열 나눔」(한 행 표 — 열마다 따로 흐름),
//     아니면 「격자」(모든 상자 경계로 행·열을 만들고 상자는 칸 합치기 — 표의 행 높이를 같이 씀). 빈 자리는 꾸밈 없는 빈 칸
//  ④ 꾸민 상자 하나는 1×1 표(안 여백 = 테두리 + 안 여백). 안이 그 상자를 꽉 채운 표 하나뿐이면 감싸지 않고 바깥 테두리·배경을 가장자리 칸에 얹음
// 옮김: 테두리·배경 → 칸 테두리/배경(borderFill), 글 → 글자 모양(글꼴은 report-fonts.ts 별칭 → 한글 이름), 줄 높이 → 줄 간격 %,
//   자간(letter-spacing) → 글자 자간 %, vertical-align 길이 → 글자 위치 %, 자기 테두리·배경이 있는 인라인 상자(칩) → 글자 테두리(테두리 있음)·음영(배경만),
//   왼쪽 안 여백 안에 놓인 절대 위치 ::before 한 글자 → 문단 글머리표, 추출기가 그린 SVG 그림(PNG) → 글자처럼 취급한 한글 그림
// 내어쓰기(2026-10-28 — hangOf, 관례는 lib/hwpx/hang.ts): 글머리표 문단·화면에서 둘째 줄이 첫 줄보다 오른쪽에서 시작하는 문단(원본 배치 카드의 「∙ …」)·
//   음수 text-indent·한 줄 부호 글(부호 뒤 글자 자리를 잰 것) → 첫 줄 자리 left + 음수 intent. 점검(hangCheck): 부호·글머리표 문단 중 내어쓰기 없는 수 → 통계·근사 목록
// 줄 맞춤(한글은 파일의 줄 배치를 따르지 않고 다시 조판함 — 2026-10-28 한컴 뷰어 확인):
//   · 화면에서 한 줄이던 글(줄 상자 1개, 줄바꿈 없음) → 문단 줄 넘김 SQUEEZE(한글이 자간을 줄여 한 줄로 — 한글 글 폭이 조금 넓어도 쪼개지지 않게)
//   · 열 나눔 표가 영역 왼쪽에 붙어 있으면 끝 열을 영역 오른쪽 끝까지 넓힘(칸 폭 여유 — 줄 바꿀 자리가 없는 한 줄 글에 여유)
//   · word-break → 줄 나눔 단위(wordBreakOf): keep-all → 한글 어절(breakNonLatinWord BREAK_WORD — 이름과 뜻이 반대), normal·break-all → 한글 글자(KEEP_WORD), break-all은 영문도 글자
//   · 정렬(alignOf·lastAlignOf): justify → 양쪽(JUSTIFY), 마지막 줄까지 펴는 text-align-last: justify → 배분(DISTRIBUTE), text-justify: none → 왼쪽.
//     한 줄 글은 마지막 줄 정렬을 따르고(양쪽이 아니면 화면 글 자리로 가운데·오른쪽·왼쪽), 어절 단위 양쪽 정렬 문단에서 화면이 어절 가운데서 줄을 나눴으면(닫는 괄호 뒤 등)
//     한글 어절 단위는 그 자리에서 못 나눠 한 어절만 남은 줄의 글자 사이가 벌어지므로 왼쪽 정렬로
// 배경 그림(그라데이션) 층마다 background-size·position·repeat로 실제로 칠해지는 자리를 구함(paintOf):
//   · 한 방향 2px 이하로 칠하는 층 = 가는 선 — 상자 가장자리에 붙어 그 변을 다 덮으면 칸 테두리 한 변, 아니면 안쪽 선 항목(→ 격자 경계선, 채운 칸 뒤로는 가려짐)
//   · 칠하는 면적 × 그라데이션 평균 불투명도가 상자의 절반 아래면 칠하지 않음(상자 전체를 칠하지 않게)
//   · 나머지(꽉 찬 그라데이션)는 예전처럼 색 평균 단색
// 위첨자: 둘레 글보다 작은 글자를 올리면(vertical-align: super·양수 길이) 한글 위첨자(supscript — 크기는 둘레 글 크기, 카드 원본과 같은 방식), 아래로 내리면 아래첨자.
//   크기가 같은 글의 위치만 옮기면 글자 위치(offset) — 한글은 음수가 위(화면 vertical-align 양수 = 위와 부호가 반대)
// 줄 간격(2026-10-28 — Converter.lineOf): 화면에서 잰 줄 간격을 계산된 line-height보다 먼저 씀. 원본 배치 카드는 줄마다 높이를 준 인라인 블록을
//   line-height: 0·font-size: 0인 문단 상자에 쌓아 계산값이 0이라, 계산값을 옮기면 한글 줄 간격 0%로 줄이 한 줄 높이에 겹쳤음.
//   여러 줄은 이어지는 줄 가운데 간격, 한 줄은 계산값이 글자 크기의 0.9배 이상이면 그 값·아니면 줄 상자 높이(흐름 내용 높이).
//   비율(%)의 기준은 문단 안 글의 가장 큰 글자 크기(한글 비율 줄 간격은 그 줄 글자 크기 기준 — 감싼 상자 글자 크기가 아님. 큰 상자 안 작은 글이 화면보다 좁아지지 않게)
// 겹침 점검(overlapCheck — 결정론): 만든 모델에서 줄 간격이 글자 크기 × 0.9 미만인 문단, 줄 배치를 적었으면 같은 칸 안에서 앞 줄과 세로 위치가 겹치는 문단을 셈 → 통계·근사 목록
// 근사(목록으로 남김): 그라데이션 → 색 평균 단색, 둥근 모서리·그림자·clip-path 무시, 그리지 못한 SVG·그림 → 자리만, 반투명 → 흰 바탕과 섞은 색, 1px 선 → 한글 가는 선 등
// 원본 그림(2026-10-28 — pictures 옵션을 줄 때만, 없으면 예전과 같음): 스냅숏의 그림 주소(<img> src·배경 url)마다 부르는 쪽이 받아 둔 바이트로
//   · <img> → 한글 그림(글자처럼 취급, 화면 상자 크기 — 조상이 잘라 낸 부분은 그림 자르기). 글 속이면 문단 안 개체, 블록이면 그림 문단
//   · 칸 배경 그림(url 층) → 칸 그림 채우기(background-size·position·repeat → 채우기 방식 imageFillMode — 100% 100%면 크기에 맞춤)
//   · 바이트가 없는 그림(허용 밖 주소·상한·모르는 형식)은 같은 크기의 빈 그림(자리만), 배경이면 생략 — 근사 기록
// 두 판: lines=false면 줄 배치 없이(한글이 조판), true면 화면에서 잰 줄마다 시작 글자·세로 위치로 linesegarray를 적음(한글이 화면 줄바꿈을 따르는지 시험용)
// 쪽 정의(용지·여백 mm)는 부르는 쪽이 넘김(page — 경평 초안은 section-hwpx.ts REPORT_PAGE_MM). 본문 틀 폭이 쪽 본문 폭과 다르면 근사 기록.
// 쪽 넘김(2026-10-28): 맨 위 표 중 splitOverMm(기본 = 쪽 본문 높이)보다 높은 것은 글자처럼 취급하지 않는 표(문단 기준 위치·위아래 배치)로 두어
//   한글이 쪽 경계에서 나눔 — 그 값보다 높은 행이 있으면 칸 안에서도 나눔(TABLE), 아니면 행 단위(CELL). 표 안 표는 그대로 글자처럼 취급
// 흉내 자간 되돌리기(spacingUndo): 글꼴 별칭마다 「진짜 글꼴이 없어 대체 글꼴로 폭을 흉내 낸 자간(em)」을 주면, 그 별칭 글의 자간이 흉내 값 쪽(절반 이상)이면 그 값을 뺌
//   (한글 파일은 진짜 글꼴 이름을 적으므로 흉내 자간이 남으면 한글에서 글이 좁아짐). 어떤 별칭·값인지는 부르는 쪽이 정함

import { BORDER_WIDTH_MM } from "../../hwp/hwp5.ts";
import { type HwpxImage, type HwpxInput, hwpxFiles } from "../../hwp/hwpx-write.ts";
import type { Align, Border, BorderFill, CharPr, Cell, HwpDoc, Inline, LineSeg, PageDef, Para, ParaPr, Pic, Table } from "../../hwp/model.ts";
import { hangCheck, markerLead } from "../../hwpx/hang.ts";
import { writeHwpxPackage } from "../../hwpx/postprocess.ts";
import { REPORT_FONTS, type ReportFontFace } from "../report-fonts.ts";
import { cssUrls } from "./pictures.ts";
import type { LayoutSnapshot, Rect, SnapBox, SnapFrag, SnapImage, SnapNode, SnapPseudo, SnapStyle } from "./snapshot.ts";

// ───────────────────────── 단위·용지

const HU_PER_MM = 7200 / 25.4;
/** mm → HWPUNIT */
const hu = (v: number) => Math.round(v * HU_PER_MM);
/** 같은 경계로 보는 거리(mm) */
const EPS = 0.3;

/** 쪽 정의(mm): 용지 폭·높이, 안쪽·바깥쪽(왼·오른)·위·아래 여백, 머리말·꼬리말, 제본 여백. 맞쪽 여부(gutterType)는 없으면 맞쪽(LEFT_RIGHT) */
export interface PageMm {
  readonly width: number;
  readonly height: number;
  readonly inside: number;
  readonly outside: number;
  readonly top: number;
  readonly bottom: number;
  readonly header: number;
  readonly footer: number;
  readonly gutter: number;
  readonly gutterType?: PageDef["gutterType"];
}
/** 쪽 정의(mm) → 한글 용지(HWPUNIT) */
export function pageDefOf(p: PageMm): PageDef {
  return {
    width: hu(p.width),
    height: hu(p.height),
    left: hu(p.inside),
    right: hu(p.outside),
    top: hu(p.top),
    bottom: hu(p.bottom),
    header: hu(p.header),
    footer: hu(p.footer),
    gutter: hu(p.gutter),
    landscape: false,
    gutterType: p.gutterType ?? "LEFT_RIGHT",
  };
}
/** 쪽 본문 크기(mm): 폭 = 용지 − 좌우 여백, 높이 = 용지 − 위아래 여백 − 머리말·꼬리말 */
export const bodyMmOf = (p: PageMm) => ({ w: p.width - p.inside - p.outside, h: p.height - p.top - p.bottom - p.header - p.footer });

/** 흉내 자간 되돌리기 한 줄: 글꼴 별칭(font-family 목록의 이름)과 그 별칭 글에 화면이 건 흉내 자간 값들(em) */
export interface SpacingUndo {
  readonly family: string;
  readonly em: readonly number[];
}

export interface DomHwpxOptions {
  /** 화면에서 잰 줄 배치(linesegarray)를 적음 */
  lines: boolean;
  title?: string;
  /** 쪽 정의(mm) */
  page: PageMm;
  /** 맨 위 표를 쪽 경계에서 나눌 수 있게 할 높이(mm) — 이보다 높은 맨 위 표. 없으면 쪽 본문 높이 */
  splitOverMm?: number;
  /** 흉내 자간 되돌리기(없으면 화면 자간 그대로) */
  spacingUndo?: readonly SpacingUndo[];
  /** 원본 그림: 스냅숏 그림 주소 → 받아 둔 바이트(pictures.ts resolvePictures). 없으면 <img>·배경 url은 예전처럼 자리만·생략 */
  pictures?: ReadonlyMap<string, HwpxImage>;
}
export interface Approximation {
  kind: string;
  count: number;
}
export interface DomHwpxStats {
  /** 글 문단 수(표를 품은 문단 제외) */
  paras: number;
  tables: number;
  cells: number;
  /** 표 안 표 깊이(가장 깊은 것) */
  depth: number;
  /** 줄 배치를 적은 문단 수 */
  lined: number;
  /** 한 줄 유지(SQUEEZE) 문단 수 */
  squeezed: number;
  /** 그림 수(SVG를 그린 PNG) */
  pics: number;
  /** 원본 그림 개체 수(<img> — 바이트를 받은 것) */
  images: number;
  /** 그림 채우기 칸 수(배경 url — 바이트를 받은 것) */
  imageFills: number;
  /** 바이트가 없어 빈 그림(자리만)으로 둔 <img> 수 */
  imageVoids: number;
  /** 배경의 가는 선을 옮긴 칸 테두리 변 수(가장자리 변 + 안쪽 선이 닿은 칸) */
  rules: number;
  /** 쪽 경계에서 나눌 수 있게 둔 맨 위 표 수 */
  split: number;
  /** 겹침 점검: 줄 간격 < 글자 크기 × 0.9인 글 문단 수(overlapCheck) */
  tight: number;
  /** 겹침 점검: 같은 칸(문단 목록) 안에서 앞 줄과 세로 위치가 겹치는 문단 수 — 줄 배치를 적었을 때만 셈 */
  stacked: number;
  /** 내어쓰기 점검(lib/hwpx/hang.ts hangCheck): 부호로 시작하거나 글머리표인 문단 수 */
  marked: number;
  /** 내어쓰기 점검: 그중 내어쓰기가 없는 문단 수 — 0이어야 함 */
  flat: number;
}
/** 채움 점검용: 한글에서 칠하는 칸·글자 배경의 화면 자리(틀 기준 mm)와 채움색 — 화면 픽셀과 견줌(시험판 스크립트) */
export interface FillProbe {
  kind: "칸" | "글자";
  rect: Rect;
  color: string;
  /** 글자 배경이면 그 글자색(#RRGGBB — 점검이 글자 픽셀을 빼고 바탕을 잼) */
  ink?: string;
}
export interface DomHwpxResult {
  input: HwpxInput;
  approx: Approximation[];
  stats: DomHwpxStats;
  fills: FillProbe[];
}

// ───────────────────────── CSS 값 읽기(계산값 문자열)

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}
/** 계산된 색(rgb()·rgba()·#hex·transparent) → 값. 모르면 null */
export function parseColor(s: string): Rgba | null {
  const t = (s ?? "").trim().toLowerCase();
  if (!t || t === "transparent" || t === "none") return null;
  const h = /^#([0-9a-f]{3,8})$/.exec(t);
  if (h) {
    const x = h[1].length <= 4 ? [...h[1]].map((c) => c + c).join("") : h[1];
    return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: x.length >= 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1 };
  }
  const m = /^rgba?\(([^)]*)\)$/.exec(t);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean);
  if (p.length < 3) return null;
  const a = p[3] === undefined ? 1 : p[3].endsWith("%") ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
  return { r: parseFloat(p[0]), g: parseFloat(p[1]), b: parseFloat(p[2]), a: Number.isFinite(a) ? a : 1 };
}
const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0").toUpperCase();
/** 흰 바탕 위에 섞은 단색 #RRGGBB */
const onWhite = (c: Rgba) => `#${hex2(c.r * c.a + 255 * (1 - c.a))}${hex2(c.g * c.a + 255 * (1 - c.a))}${hex2(c.b * c.a + 255 * (1 - c.a))}`;
const visibleColor = (c: Rgba | null): c is Rgba => !!c && c.a > 0.004;
/** 테두리 덧그림 의사요소가 상자를 덮는다고 보는 가장자리 차이(mm — 선 굵기 반쯤 넘침) */
const OVERLAY_TOL_MM = 0.6;
/** 한글 종이색(채움 비교 — onWhite 글 모양) */
const PAPER = "#FFFFFF";

const LINE_STYLE: Record<string, Border["type"]> = { solid: "SOLID", dashed: "DASH", dotted: "DOT", double: "DOUBLE_SLIM", groove: "SOLID", ridge: "SOLID", inset: "SOLID", outset: "SOLID" };
const NONE: Border = { type: "NONE", width: 0.1, color: "#000000" };
/** 한글 테두리 굵기 표의 가장 가까운 값 */
const snapWidth = (v: number) => BORDER_WIDTH_MM.reduce((a, c) => (Math.abs(c - v) < Math.abs(a - v) ? c : a), BORDER_WIDTH_MM[0]);
/** 화면 1px(브라우저가 계산값 굵기를 정수 px로 올림 — 1px 아래로 지정한 선도 1px) */
const ONE_PX_MM = 25.4 / 96;

const visibleSide = (s: SnapStyle["border"][number]) => s.w > 0.001 && s.style !== "none" && s.style !== "hidden" && visibleColor(parseColor(s.color));
const hasBorder = (st: SnapStyle) => st.border.some(visibleSide);
const hasBg = (st: SnapStyle) => visibleColor(parseColor(st.bg)) || (st.bgImage && st.bgImage !== "none");
/** 자기 테두리·배경이 보이는 상자(스타일만 — 자리를 모르는 의사요소용. 상자는 Converter.decoBox) */
const decorated = (st: SnapStyle) => hasBorder(st) || !!hasBg(st);

// ───────────────────────── 배경 그림 층(그라데이션) 읽기

const PX_MM = 25.4 / 96;
/** 가는 선으로 보는 굵기 상한(mm) — 화면 2px */
const THIN_MM = 2 * PX_MM;
/** 위·아래첨자로 보는 최소 이동(둘레 글 크기에 대한 몫) — 칩의 1~2pt 줄 맞춤 이동(둘레 글의 1/10~1/5)은 글자 위치로 둠 */
const SCRIPT_MIN_SHIFT = 0.25;
/** 칠하는 몫(면적 × 평균 불투명도)이 이것보다 작으면 상자를 칠하지 않음 */
const MIN_COVER = 0.5;

/** 맨 위 수준에서 나눔(괄호 안은 그대로): 쉼표 또는 공백 */
export function splitTop(s: string, sep: "," | " "): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && (sep === "," ? ch === "," : /\s/.test(ch))) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** 계산값 길이(px·%·calc(% ± px)) → mm. %의 기준 길이 ref(mm). 못 읽으면 null */
export function lenMm(v: string, ref: number): number | null {
  const t = v.trim();
  let m = /^(-?[\d.]+)px$/.exec(t);
  if (m) return Number(m[1]) * PX_MM;
  m = /^(-?[\d.]+)%$/.exec(t);
  if (m) return (Number(m[1]) / 100) * ref;
  m = /^calc\(\s*(-?[\d.]+)%\s*([+-])\s*(-?[\d.]+)px\s*\)$/.exec(t);
  if (m) return (Number(m[1]) / 100) * ref + (m[2] === "-" ? -1 : 1) * Number(m[3]) * PX_MM;
  if (t === "0") return 0;
  return null;
}

interface Stop {
  c: Rgba;
  /** 그라데이션 선 위 자리(0~1) — 정해 둔 뒤에는 늘 값 */
  at: number | null;
}
interface Gradient {
  repeating: boolean;
  stops: Stop[];
}
const COLOR_HEAD = /^(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|transparent)/i;
/**
 * 그라데이션 층 하나 → 색 멈춤(자리는 그라데이션 선 길이 lineMm에 대한 몫). 그라데이션이 아니면 null.
 * 자리 없는 멈춤은 CSS 규칙대로 앞뒤 사이를 고르게 나누고, 앞 멈춤보다 앞이면 앞 자리로 당김
 */
export function parseGradient(layer: string, lineMm: number): Gradient | null {
  const m = /^(repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/.exec(layer.trim());
  if (!m) return null;
  const stops: Stop[] = [];
  for (const arg of splitTop(m[3], ",")) {
    const head = COLOR_HEAD.exec(arg);
    if (!head) continue; // 방향·모양 인자
    const c = parseColor(head[1]) ?? { r: 0, g: 0, b: 0, a: 0 };
    const pos = splitTop(arg.slice(head[1].length), " ").map((x) => {
      const v = lenMm(x, lineMm);
      return v === null || lineMm <= 0 ? null : v / lineMm;
    });
    if (!pos.length) stops.push({ c, at: null });
    for (const at of pos) stops.push({ c, at });
  }
  if (!stops.length) return null;
  if (stops[0].at === null) stops[0].at = 0;
  if (stops[stops.length - 1].at === null) stops[stops.length - 1].at = 1;
  let max = 0;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].at === null) {
      let j = i;
      while (stops[j].at === null) j++;
      const a = stops[i - 1].at as number;
      const b = stops[j].at as number;
      for (let k = i; k < j; k++) stops[k].at = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    }
    max = Math.max(max, stops[i].at as number);
    stops[i].at = max;
  }
  return { repeating: !!m[1], stops };
}
/**
 * 그라데이션 선을 따라 잰 평균(멈춤 사이는 곧게 섞임): 불투명도 a와 불투명도를 곱한 색(premultiplied).
 * 처음 멈춤 앞·끝 멈춤 뒤는 그 멈춤 색(반복이면 한 주기만). 선 길이를 모르면(자리가 모두 같음) 멈춤 평균
 */
export function gradientMean(g: Gradient): Rgba {
  const s = g.stops;
  const p0 = s[0].at as number;
  const p1 = s[s.length - 1].at as number;
  const acc = { r: 0, g: 0, b: 0, a: 0 };
  let total = 0;
  const add = (c: Rgba, w: number) => {
    acc.r += c.r * c.a * w;
    acc.g += c.g * c.a * w;
    acc.b += c.b * c.a * w;
    acc.a += c.a * w;
    total += w;
  };
  if (p1 - p0 < 1e-6) s.forEach((x) => add(x.c, 1));
  else {
    if (!g.repeating) {
      add(s[0].c, Math.max(0, p0));
      add(s[s.length - 1].c, Math.max(0, 1 - p1));
    }
    for (let i = 1; i < s.length; i++) {
      const w = (s[i].at as number) - (s[i - 1].at as number);
      if (w <= 0) continue;
      add(s[i - 1].c, w / 2);
      add(s[i].c, w / 2);
    }
  }
  if (total <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const a = acc.a / total;
  return a > 0 ? { r: acc.r / acc.a, g: acc.g / acc.a, b: acc.b / acc.a, a } : { r: 0, g: 0, b: 0, a: 0 };
}
/** 선형 그라데이션 각도(도, 0 = 위쪽) — 방향 인자가 없으면 아래(180). 모서리 방향은 45° 단위로 어림 */
function gradientAngle(layer: string): number {
  const m = /gradient\(\s*([^,]*?),/.exec(layer);
  const a = m?.[1].trim() ?? "";
  const deg = /^(-?[\d.]+)deg$/.exec(a);
  if (deg) return Number(deg[1]);
  if (!a.startsWith("to ")) return 180;
  const h = a.includes("right") ? 90 : a.includes("left") ? -90 : 0;
  const v = a.includes("top") ? 0 : a.includes("bottom") ? 180 : null;
  if (v === null) return h;
  return h === 0 ? v : v === 0 ? h / 2 : 180 - h / 2;
}

/**
 * 배경 그림 한 층의 background-size·position·repeat 계산값 → 한글 그림 채우기 방식(exact: 화면과 같은 방식인지).
 * 반복 없음 + 100% 100% → 크기에 맞춤(TOTAL) · cover·contain → 확대(ZOOM, 근사) · 크기 auto면 위치(0%·50%·100%)로 아홉 자리 ·
 * 가로·세로 반복 → 바둑판(TILE) · 한 방향 반복 → 그 방향 바둑판(위·아래·왼·오른). 나머지(길이로 준 크기 등)는 크기에 맞춤(근사)
 */
export function imageFillMode(size: string, position: string, repeat: string): { mode: string; exact: boolean } {
  const sz = splitTop(size.trim() || "auto", " ");
  const rp = splitTop(repeat.trim() || "repeat", " ");
  const rx = rp[0] === "repeat-x" ? true : rp[0] === "repeat-y" ? false : rp[0] !== "no-repeat";
  const ry = rp[0] === "repeat-x" ? false : rp[0] === "repeat-y" ? true : (rp[1] ?? rp[0]) !== "no-repeat";
  const KEY: Record<string, number> = { left: 0, top: 0, center: 50, right: 100, bottom: 100 };
  const pct = (v: string | undefined): number | null => {
    if (v === undefined) return 50;
    if (v in KEY) return KEY[v];
    const m = /^(-?[\d.]+)%$/.exec(v);
    if (m) return Number(m[1]);
    return /^0(px)?$/.test(v) ? 0 : null;
  };
  const ps = splitTop(position.trim() || "0% 0%", " ");
  const px = pct(ps[0]);
  const py = pct(ps[1]);
  const autoSize = sz.every((v) => v === "auto");
  if (rx && ry) return { mode: "TILE", exact: autoSize };
  if (rx || ry) {
    const near = (v: number | null, a: number) => v !== null && Math.abs(v - a) < 0.5;
    if (rx) return { mode: near(py, 100) ? "TILE_HORZ_BOTTOM" : "TILE_HORZ_TOP", exact: autoSize && (near(py, 0) || near(py, 100)) };
    return { mode: near(px, 100) ? "TILE_VERT_RIGHT" : "TILE_VERT_LEFT", exact: autoSize && (near(px, 0) || near(px, 100)) };
  }
  if (sz[0] === "100%" && sz[1] === "100%") return { mode: "TOTAL", exact: true };
  if (sz[0] === "cover" || sz[0] === "contain") return { mode: "ZOOM", exact: false };
  if (autoSize && px !== null && py !== null) {
    const h = px === 0 ? "LEFT" : px === 50 ? "CENTER" : px === 100 ? "RIGHT" : null;
    const v = py === 0 ? "TOP" : py === 50 ? "CENTER" : py === 100 ? "BOTTOM" : null;
    if (h && v) return { mode: h === "CENTER" && v === "CENTER" ? "CENTER" : `${h}_${v}`, exact: true };
  }
  return { mode: "TOTAL", exact: false };
}

/** 배경 층을 읽은 결과: 칠(단색 #RRGGBB 또는 없음)·가장자리 변 테두리·안쪽 가는 선(틀 기준 자리) */
interface Paint {
  fill: string | null;
  /** 맨 위 url 층의 그림 채우기(바이트를 받은 것만) */
  image: ImgFill | null;
  edges: Partial<Record<"t" | "r" | "b" | "l", Border>>;
  rules: { rect: Rect; dir: "h" | "v"; border: Border }[];
}

const right = (r: Rect) => r.x + r.w;
const bottom = (r: Rect) => r.y + r.h;

// ───────────────────────── 근사 기록

class Notes {
  private m = new Map<string, number>();
  add(kind: string, n = 1): void {
    this.m.set(kind, (this.m.get(kind) ?? 0) + n);
  }
  list(): Approximation[] {
    return [...this.m].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
  }
}

// ───────────────────────── 모양 등록기(같은 값은 한 번만)

interface BoxSpec {
  l: Border;
  r: Border;
  t: Border;
  b: Border;
  fill: string | null;
  /** 그림 채우기(그림 id·채우기 방식) */
  image?: ImgFill | null;
}
interface ImgFill {
  bin: number;
  mode: string;
}
const EMPTY_BOX: BoxSpec = { l: NONE, r: NONE, t: NONE, b: NONE, fill: null };
interface CharSpec {
  face: string;
  height: number;
  bold: boolean;
  italic: boolean;
  color: string;
  shade: string | null;
  borderFill: number;
  spacing: number;
  offset: number;
  sup: boolean;
  sub: boolean;
  underline: boolean;
  strike: boolean;
}
interface ParaSpec {
  align: Align;
  line: number;
  left: number;
  right: number;
  indent: number;
  before: number;
  after: number;
  breakLatin: ParaPr["breakLatin"];
  breakNonLatin: ParaPr["breakNonLatin"];
  /** 줄 넘김: BREAK 보통 · SQUEEZE 자간을 줄여 한 줄로 */
  wrap: "BREAK" | "SQUEEZE";
  /** 글머리표 id(0 없음) */
  bullet: number;
}

const seven = <T>(v: T) => Array.from({ length: 7 }, () => v);

class Shapes {
  readonly doc: HwpDoc = { format: "hwpx", faces: {}, charPrs: [], paraPrs: [], borderFills: [null], tabDefs: [], bullets: [], numberings: [], bins: new Map(), sections: [] };
  private ids = new Map<string, number>();
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
  face(name: string, alt: string | null): void {
    if (!this.doc.faces[name]) this.doc.faces[name] = { defaultName: null, alt };
  }
  fill(b: BoxSpec): number {
    const image = b.image ? { mode: b.image.mode, bin: b.image.bin, bright: 0, contrast: 0, effect: "REAL_PIC" } : null;
    const v: BorderFill = { left: b.l, right: b.r, top: b.t, bottom: b.b, diagonal: NONE, fill: b.fill || image ? { color: b.fill, patternColor: null, pattern: -1, image, gradation: null } : null };
    return this.once("bf", this.doc.borderFills, v);
  }
  char(c: CharSpec): number {
    const v: CharPr = {
      height: c.height,
      face: seven(c.face),
      ratio: seven(100),
      spacing: seven(c.spacing),
      relSize: seven(100),
      offset: seven(c.offset),
      bold: c.bold,
      italic: c.italic,
      underline: c.underline ? "BOTTOM" : "",
      underlineColor: null,
      strike: c.strike,
      strikeColor: null,
      supscript: c.sup,
      subscript: c.sub,
      outline: false,
      shadow: "",
      shadowColor: null,
      shadowX: 0,
      shadowY: 0,
      emboss: false,
      engrave: false,
      color: c.color,
      shade: c.shade,
      kerning: false,
      // 빈칸 폭 = 글꼴의 빈칸 글리프 폭(화면 브라우저와 같음 — 커밋 acca106 실측)
      useFontSpace: true,
      borderFill: c.borderFill,
    };
    return this.once("cp", this.doc.charPrs, v);
  }
  para(p: ParaSpec): number {
    const v: ParaPr = {
      align: p.align,
      breakLatin: p.breakLatin,
      breakNonLatin: p.breakNonLatin,
      condense: 0,
      lineSpacingType: "PERCENT",
      lineSpacing: p.line,
      left: p.left,
      right: p.right,
      indent: p.indent,
      before: p.before,
      after: p.after,
      vertAlign: "BASELINE",
      snapToGrid: false,
      fontLineHeight: false,
      keepWithNext: false,
      borderFill: 0,
      borderOffset: [0, 0, 0, 0],
      tabDef: 0,
      headingType: p.bullet ? "BULLET" : "NONE",
      headingId: p.bullet,
      headingLevel: 0,
      autoSpaceEAsianEng: false,
      autoSpaceEAsianNum: false,
      // BREAK는 적지 않음(쓰기 계층 기본값)
      ...(p.wrap === "SQUEEZE" ? { lineWrap: "SQUEEZE" as const } : {}),
    };
    return this.once("pp", this.doc.paraPrs, v);
  }
  /**
   * 글머리표(문자·머리 글자 모양·본문과의 거리 HWPUNIT) → id(1부터). 내어쓰기는 문단 모양 intent로 직접 주므로 자동 내어쓰기는 끔
   * (켜면 한글이 intent에 글머리표 폭을 더해 둘째 줄이 글 첫 자보다 오른쪽으로 감 — lib/hwpx/hang.ts)
   */
  bullet(char: string, charPr: number, offset: number): number {
    return (
      this.once("bu", this.doc.bullets, {
        char,
        head: { align: "LEFT" as const, instWidth: true, autoIndent: false, widthAdjust: 0, textOffset: Math.max(0, offset), textOffsetPercent: false, numFormat: 0, charPr },
      }) + 1
    );
  }
}

// ───────────────────────── 중간 표현

/** 글 흐름(→ 문단 하나): 영역·문단 여백이 될 안 여백(위·오른·아래·왼 mm)·글 마디·스타일·글머리표 */
interface Flow {
  t: "flow";
  rect: Rect;
  padIn: [number, number, number, number];
  style: SnapStyle;
  nodes: SnapNode[];
  /** 글 앞뒤 ::before·::after(인라인일 때 글로) */
  pseudo: { before?: SnapPseudo; after?: SnapPseudo };
  marker: Marker | null;
  ord: number;
}
interface BoxItem {
  t: "box";
  rect: Rect;
  node: SnapBox;
  ord: number;
}
/** 자리만 남기는 대체 대상(그리지 못한 SVG·그림) */
interface VoidItem {
  t: "void";
  rect: Rect;
  node: SnapBox;
  ord: number;
}
/** 그림이 있는 대체 대상(추출기가 그린 SVG·바이트를 받은 <img>) → 한글 그림. rect는 보이는 자리 */
interface PicItem {
  t: "pic";
  rect: Rect;
  src: PicSrc;
  ord: number;
}
/**
 * 한글 그림 재료: 같은 그림을 한 벌로 묶는 열쇠·바이트 만들기(null이면 빈 그림 — 쓰기 계층이 투명 그림을 넣음)·
 * 화면 상자(full)와 보이는 부분(clip — 조상이 잘라 냄, 없으면 전체)
 */
interface PicSrc {
  key: string;
  make: (() => HwpxImage) | null;
  full: Rect;
  clip?: Rect;
  /** 원본 그림(<img>)인지(통계용 — 아니면 SVG를 그린 그림) */
  photo: boolean;
}
/** 배경의 안쪽 가는 선(가로 h·세로 v) — 칸을 차지하지 않고 격자 경계선이 됨 */
interface RuleItem {
  t: "rule";
  rect: Rect;
  dir: "h" | "v";
  border: Border;
  ord: number;
}
type Item = Flow | BoxItem | VoidItem | PicItem | RuleItem;
interface Marker {
  text: string;
  style: SnapStyle;
  rect: Rect;
}
interface Region {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
type VAlign = "TOP" | "CENTER" | "BOTTOM";
interface TCell {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
  box: BoxSpec | null;
  /** 안 여백(왼·오른·위·아래 HWPUNIT) */
  margin: [number, number, number, number];
  va: VAlign;
  outs: POut[];
}
/** 표: 열·행 경계(mm, 틀 기준)와 칸 — 칸 자리는 빠짐·겹침 없이 다 채움 */
interface TableIR {
  xs: number[];
  ys: number[];
  cells: TCell[];
}
/** 문단(아직 모양 id를 정하지 않은 것) — 표를 품은 문단이면 table·rect, 그림을 품은 문단이면 pic·rect */
interface POut {
  ps: ParaSpec;
  items: Inline[];
  lines: LineSeg[];
  end: number;
  table?: TableIR;
  pic?: PicSrc;
  rect?: Rect;
}

/** 줄(화면에서 잰 것): 시작 글자 위치(문단 글 기준)·글 상자 */
interface Line {
  start: number;
  x0: number;
  x1: number;
  cy: number;
  h: number;
}

/** XML 1.0 금지 문자(section-hwpx.ts와 같은 규칙) */
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** 인라인 수준(글 흐름 안에 들어가는 것): 글·줄바꿈·inline, 안이 글뿐인 원자 인라인(inline-block 등 — 칩) */
function inlineLevel(n: SnapNode): boolean {
  if (n.kind !== "box") return true;
  const d = n.style.display;
  if (d === "contents") return n.children.every(inlineLevel);
  if (!d.startsWith("inline")) return false;
  if (d === "inline" || n.replaced) return true;
  return n.children.every(inlineLevel);
}
/** 보이는 글(또는 그림 — pic이 참인 대체 대상)이 있음 */
function hasInk(nodes: SnapNode[], pic?: (b: SnapBox) => boolean): boolean {
  return nodes.some((n) => (n.kind === "text" ? n.text.trim() !== "" : n.kind === "br" ? false : n.replaced ? !!pic?.(n) : hasInk(n.children, pic) || !!n.before?.text.trim() || !!n.after?.text.trim()));
}
/** 안쪽 상자(테두리·안 여백을 뺀 내용 상자) */
function contentRect(b: SnapBox): Rect {
  const [bt, br, bb, bl] = b.style.border.map((s) => s.w);
  const [pt, pr, pb, pl] = b.style.pad;
  return { x: b.rect.x + bl + pl, y: b.rect.y + bt + pt, w: Math.max(0, b.rect.w - bl - pl - br - pr), h: Math.max(0, b.rect.h - bt - pt - bb - pb) };
}
const isAbs = (p: string) => p === "absolute" || p === "fixed";
/** 그려진 범위: 글 조각과 크기 있는 상자(자손이 상자 밖으로 넘친 것까지 — 절대 위치는 뺌)를 합친 것. textOnly면 글 조각만. 없으면 null */
function drawnExtent(nodes: SnapNode[], textOnly: boolean): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (r: Rect) => {
    if (r.w <= 0 && r.h <= 0) return;
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  };
  const walk = (ns: SnapNode[]) => {
    for (const n of ns) {
      if (n.kind === "text") n.frags.forEach(add);
      else if (n.kind === "box" && !isAbs(n.style.position)) {
        if (!textOnly && n.rect.w > 0 && n.rect.h > 0) add(n.rect);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
const BLOCKISH = new Set(["block", "list-item", "table-cell", "flow-root", "table-caption"]);

/** 가까운 값끼리 묶은 경계(묶음 평균) */
function snapEdges(vals: number[]): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const out: number[] = [];
  let grp: number[] = [];
  for (const v of s) {
    if (grp.length && v - grp[0] > EPS) {
      out.push(grp.reduce((a, c) => a + c, 0) / grp.length);
      grp = [];
    }
    grp.push(v);
  }
  if (grp.length) out.push(grp.reduce((a, c) => a + c, 0) / grp.length);
  return out;
}
const nearest = (edges: number[], v: number) => edges.reduce((bi, e, i) => (Math.abs(e - v) < Math.abs(edges[bi] - v) ? i : bi), 0);
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

// ───────────────────────── 변환기

class Converter {
  readonly sh = new Shapes();
  readonly notes = new Notes();
  private ord = 0;
  private lineCache = new WeakMap<Flow, Line[]>();
  private pitchCache = new WeakMap<Flow, number>();
  private segCache = new WeakMap<Flow, Seg[]>();
  private tinyCp = -1;
  readonly stats: DomHwpxStats = { paras: 0, tables: 0, cells: 0, depth: 0, lined: 0, squeezed: 0, pics: 0, images: 0, imageFills: 0, imageVoids: 0, rules: 0, split: 0, tight: 0, stacked: 0, marked: 0, flat: 0 };
  readonly fills: FillProbe[] = [];
  private paints = new WeakMap<SnapStyle, Paint>();
  private parents = new WeakMap<SnapBox, SnapBox>();
  /** 그림 id → 바이트(같은 그림은 한 번만 — 빈 그림 id는 바이트 없음) */
  readonly images = new Map<number, HwpxImage>();
  private picBins = new Map<string, number>();
  /** 원본 그림(주소 → 바이트) — 없으면 <img>·배경 url을 옮기지 않음 */
  private readonly pictures: ReadonlyMap<string, HwpxImage> | null;

  private readonly withLines: boolean;
  private readonly rootStyle: SnapStyle;
  /** 맨 위 표를 나눌 수 있게 할 높이(mm) */
  private readonly splitOverMm: number;
  private readonly undo: ReadonlyMap<string, readonly number[]>;
  constructor(withLines: boolean, rootStyle: SnapStyle, splitOverMm: number, undo: readonly SpacingUndo[], pictures: ReadonlyMap<string, HwpxImage> | null = null) {
    this.pictures = pictures;
    this.withLines = withLines;
    this.rootStyle = rootStyle;
    this.splitOverMm = splitOverMm;
    this.undo = new Map(undo.map((u) => [u.family, u.em]));
  }

  /** 흉내 자간을 뺀 자간(pt): font-family 목록에서 되돌리기 표에 있는 첫 이름의 값 중 가장 가까운 것 s — 자간(em)이 s 쪽으로 s의 절반 이상이면 뺌 */
  spacingPt(st: SnapStyle): number {
    if (!this.undo.size || !st.fontSize) return st.letterSpacing;
    const fam = st.fontFamily
      .split(",")
      .map((f) => f.trim().replace(/^["']|["']$/g, ""))
      .find((f) => this.undo.has(f));
    const vals = fam ? (this.undo.get(fam) as readonly number[]) : [];
    if (!vals.length) return st.letterSpacing;
    const em = st.letterSpacing / st.fontSize;
    const s = vals.reduce((a, v) => (Math.abs(v - em) < Math.abs(a - em) ? v : a), vals[0]);
    if (s === 0 || em / s < 0.5) return st.letterSpacing;
    this.notes.add("빠진 글꼴 갈래의 흉내 자간 → 되돌림(한글은 진짜 글꼴 이름)");
    return st.letterSpacing - s * st.fontSize;
  }

  // ── 글꼴·글자 모양

  /** font-family 목록 → 한글 글꼴 이름: 앱 글꼴 별칭(report-fonts.ts)이면 그 굵기의 한글 이름, 아니면 목록의 첫 실제 이름 */
  face(st: SnapStyle): { name: string; bold: boolean } {
    const fams = st.fontFamily.split(",").map((f) => f.trim().replace(/^["']|["']$/g, ""));
    const generic = fams.find((f) => f === "serif" || f === "sans-serif");
    const alt = generic === "serif" ? "함초롬바탕" : generic === "sans-serif" ? "함초롬돋움" : null;
    const w = st.fontWeight;
    for (const f of fams) {
      const g = Object.values(REPORT_FONTS).find((x) => x.alias === f);
      if (!g) continue;
      const faces = g.faces as readonly ReportFontFace[];
      const at = (x: number) => faces.find((p) => p.weight[0] <= x && x <= p.weight[1]);
      const nearestFace = faces.reduce((a, p) => (Math.abs((p.weight[0] + p.weight[1]) / 2 - w) < Math.abs((a.weight[0] + a.weight[1]) / 2 - w) ? p : a), faces[0]);
      const face = at(w) ?? nearestFace;
      const regular = at(400) ?? faces[0];
      // 굵은 이름이 보통 이름 + 「 Bold」처럼 같은 글꼴 묶음이면(맑은 고딕 → 맑은 고딕 Bold) 보통 이름 + 굵게 속성(한글 저장본 관행)
      if (face !== regular && face.names[0].startsWith(`${regular.names[0]} `)) {
        this.sh.face(regular.names[0], alt);
        return { name: regular.names[0], bold: true };
      }
      this.sh.face(face.names[0], alt);
      return { name: face.names[0], bold: w >= 600 && face.weight[1] < 600 };
    }
    const real = fams.find((f) => f && !["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"].includes(f)) ?? "함초롬바탕";
    this.notes.add("글꼴 별칭 표에 없는 글꼴 → 목록의 첫 이름 그대로");
    this.sh.face(real, alt);
    return { name: real, bold: w >= 600 };
  }

  /**
   * 글자 모양: 스타일 + 칩(글자 테두리/배경 또는 음영). outerPt = 둘레 글(부모) 글자 크기 — 위·아래첨자 판정에 씀.
   * 위첨자: vertical-align super, 또는 둘레 글보다 작은 글자를 둘레 글 크기의 1/4 이상 올림 → supscript + 크기는 둘레 글 크기(한글이 줄여 올림 — 카드 원본과 같음).
   * 아래첨자도 같은 방식. 그 밖의 길이 이동(크기가 같은 글·칩의 작은 줄 맞춤)은 글자 위치 % — 한글은 음수가 위(화면 양수 = 위)
   */
  charOf(st: SnapStyle, chip: Chip | null, outerPt?: number): number {
    const f = this.face(st);
    // 글자 크기 0(폭 없이 그린 빈칸 — 추출기가 낱말 경계로 남김)은 둘레 글 크기
    let pt = st.fontSize || outerPt || 10;
    const c = parseColor(st.color);
    if (c && c.a < 1 && c.a > 0) this.notes.add("반투명 글자색 → 흰 바탕과 섞은 단색");
    let offset = 0;
    let sup = false;
    let sub = false;
    const va = st.verticalAlign;
    const shift = /^-?[\d.]+px$/.test(va) ? parseFloat(va) : 0;
    const smaller = outerPt !== undefined && outerPt > pt + 0.05;
    const script = smaller && Math.abs(shift * 0.75) >= SCRIPT_MIN_SHIFT * (outerPt as number);
    if (va === "super" || (shift > 0 && script)) sup = true;
    else if (va === "sub" || (shift < 0 && script)) sub = true;
    else if (shift) offset = Math.max(-100, Math.min(100, -Math.round(((shift * 0.75) / pt) * 100)));
    if ((sup || sub) && smaller) {
      pt = outerPt as number;
      this.notes.add(sup ? "올린 작은 글자 → 한글 위첨자(크기는 둘레 글, 한글이 줄임)" : "내린 작은 글자 → 한글 아래첨자(크기는 둘레 글, 한글이 줄임)");
    }
    let spacing = Math.round((this.spacingPt(st) / pt) * 100);
    if (spacing < -50 || spacing > 50) {
      this.notes.add("자간이 한글 범위(−50~50%) 밖 → 잘라냄");
      spacing = Math.max(-50, Math.min(50, spacing));
    }
    if (Math.abs(st.wordSpacing) > 0.05) this.notes.add("낱말 간격(word-spacing) 무시");
    return this.sh.char({
      face: f.name,
      height: Math.round(pt * 100),
      bold: f.bold,
      italic: st.fontStyle === "italic" || st.fontStyle.startsWith("oblique"),
      color: c ? onWhite(c) : "#000000",
      shade: chip?.shade ?? null,
      borderFill: chip?.bf ?? 0,
      spacing,
      offset,
      sup,
      sub,
      underline: st.textDecoration.includes("underline"),
      strike: st.textDecoration.includes("line-through"),
    });
  }
  /** 아주 작은 글자(빈 칸·표를 품은 문단 — 높이를 키우지 않음) */
  tiny(): number {
    if (this.tinyCp < 0) this.tinyCp = this.charOf({ ...this.rootStyle, fontSize: 1, letterSpacing: 0, wordSpacing: 0, verticalAlign: "baseline", textDecoration: "none" }, null);
    return this.tinyCp;
  }

  // ── 테두리·배경

  /** 꾸밈 근사 기록(둥근 모서리·그림자·clip-path·반투명) */
  noteDecor(st: SnapStyle): void {
    if (st.radius && !/^0(px)?( 0(px)?)*$/.test(st.radius.trim())) this.notes.add("둥근 모서리 → 직각");
    if (st.shadow && st.shadow !== "none") this.notes.add("그림자(box-shadow) 생략");
    if (st.clipPath && st.clipPath !== "none") this.notes.add("모양 자르기(clip-path) 무시 → 사각형");
    if (st.opacity < 1) this.notes.add("반투명(opacity) 무시");
  }
  border(s: SnapStyle["border"][number]): Border {
    if (!visibleSide(s)) return NONE;
    const c = parseColor(s.color) as Rgba;
    if (c.a < 1) this.notes.add("반투명 선색 → 흰 바탕과 섞은 단색");
    const type = LINE_STYLE[s.style] ?? "SOLID";
    if (!LINE_STYLE[s.style] || ["groove", "ridge", "inset", "outset", "double"].includes(s.style)) this.notes.add(`선 종류 근사(${s.style} → ${type})`);
    // 1px 이하로 지정한 가는 선도 브라우저 계산값은 1px — 한글의 가는 선(0.12mm)으로
    let width: number;
    if (Math.abs(s.w - ONE_PX_MM) < 0.002) {
      width = 0.12;
      this.notes.add("화면 1px 선(계산값) → 한글 가는 선 0.12mm");
    } else width = snapWidth(s.w);
    return { type, width, color: onWhite(c) };
  }
  /**
   * 배경(background-color + 그라데이션 층들)이 상자 rect(틀 기준 mm)에 실제로 칠하는 것 — 상자 스타일마다 한 번(근사 기록이 겹치지 않게).
   * 층은 아래(끝 층)부터: 칠하는 자리 = background-size·position(안쪽 테두리 상자 기준)·repeat, 칠은 테두리 상자까지.
   * 한 방향 2px 이하이고 그 방향으로 반복하지 않으면 가는 선(가장자리를 다 덮으면 그 변, 아니면 안쪽 선),
   * 칠하는 몫(면적 × 평균 불투명도)이 절반 아래면 생략, 나머지는 멈춤 색 평균을 바탕(배경색 또는 흰색)에 섞음
   */
  paintOf(st: SnapStyle, r: Rect): Paint {
    const hit = this.paints.get(st);
    if (hit) return hit;
    const base = parseColor(st.bg);
    let out: Rgba | null = visibleColor(base) ? base : null;
    if (out && out.a < 1) this.notes.add("반투명 배경 → 흰 바탕과 섞은 단색");
    const paint: Paint = { fill: null, image: null, edges: {}, rules: [] };
    const img = st.bgImage;
    if (img && img !== "none") {
      const layers = splitTop(img, ",");
      const sizes = splitTop(st.bgSize ?? "auto", ",");
      const poss = splitTop(st.bgPosition ?? "0% 0%", ",");
      const reps = splitTop(st.bgRepeat ?? "repeat", ",");
      const [bt, br, bb, bl] = st.border.map((x) => x.w);
      const pa: Rect = { x: r.x + bl, y: r.y + bt, w: Math.max(0, r.w - bl - br), h: Math.max(0, r.h - bt - bb) };
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (layer.trim() === "none") continue;
        if (!/gradient\(/.test(layer)) {
          const url = cssUrls(layer)[0];
          const got = url ? this.pictures?.get(url) : undefined;
          if (url && got) {
            const mode = imageFillMode(sizes[i % sizes.length] ?? "auto", poss[i % poss.length] ?? "0% 0%", reps[i % reps.length] ?? "repeat");
            if (!mode.exact) this.notes.add("배경 그림 크기·자리 → 칸 크기에 맞춤(근사)");
            paint.image = { bin: this.binOf(`url:${url}`, () => got), mode: mode.mode };
          } else this.notes.add(this.pictures && url ? "그림 배경(url) — 그림을 받지 못해 생략" : "그림 배경(url) 생략");
          continue;
        }
        // 그림 한 장(타일) 크기 — 그라데이션의 auto는 자리 상자 크기
        const sz = splitTop(sizes[i % sizes.length] ?? "auto", " ");
        let tw = pa.w;
        let th = pa.h;
        if (sz[0] !== "cover" && sz[0] !== "contain") {
          tw = sz[0] && sz[0] !== "auto" ? (lenMm(sz[0], pa.w) ?? pa.w) : pa.w;
          th = sz[1] && sz[1] !== "auto" ? (lenMm(sz[1], pa.h) ?? pa.h) : pa.h;
        }
        const ps = splitTop(poss[i % poss.length] ?? "0% 0%", " ");
        const ox = lenMm(ps[0] ?? "0%", pa.w - tw) ?? 0;
        const oy = lenMm(ps[1] ?? "0%", pa.h - th) ?? 0;
        const rp = splitTop(reps[i % reps.length] ?? "repeat", " ");
        const rx = rp[0] === "repeat-x" ? true : rp[0] === "repeat-y" ? false : rp[0] !== "no-repeat";
        const ry = rp[0] === "repeat-x" ? false : rp[0] === "repeat-y" ? true : (rp[1] ?? rp[0]) !== "no-repeat";
        // 칠하는 자리(테두리 상자로 자름)
        const x0 = rx ? r.x : Math.max(r.x, pa.x + ox);
        const x1 = rx ? right(r) : Math.min(right(r), pa.x + ox + tw);
        const y0 = ry ? r.y : Math.max(r.y, pa.y + oy);
        const y1 = ry ? bottom(r) : Math.min(bottom(r), pa.y + oy + th);
        const pw = x1 - x0;
        const ph = y1 - y0;
        if (pw <= 0.001 || ph <= 0.001) continue;
        const ang = (gradientAngle(layer) * Math.PI) / 180;
        const g = parseGradient(layer, Math.abs(tw * Math.sin(ang)) + Math.abs(th * Math.cos(ang)));
        if (!g) continue;
        const mean = gradientMean(g);
        const hLine = !ry && ph <= THIN_MM + 0.001 && pw > THIN_MM;
        const vLine = !rx && pw <= THIN_MM + 0.001 && ph > THIN_MM;
        if (hLine || vLine) {
          if (!visibleColor(mean)) continue;
          const w = hLine ? ph : pw;
          const border: Border = { type: "SOLID", width: Math.abs(w - ONE_PX_MM) < 0.002 || w < ONE_PX_MM ? 0.12 : snapWidth(w), color: onWhite(mean) };
          const near = (a: number, b: number) => Math.abs(a - b) < EPS;
          const side = hLine
            ? x0 <= r.x + EPS && x1 >= right(r) - EPS
              ? near(y0, r.y)
                ? "t"
                : near(y1, bottom(r))
                  ? "b"
                  : null
              : null
            : y0 <= r.y + EPS && y1 >= bottom(r) - EPS
              ? near(x0, r.x)
                ? "l"
                : near(x1, right(r))
                  ? "r"
                  : null
              : null;
          if (side) {
            paint.edges[side] = border;
            this.notes.add("가는 선 배경(그라데이션) → 칸 테두리 한 변");
          } else {
            paint.rules.push({ rect: { x: x0, y: y0, w: pw, h: ph }, dir: hLine ? "h" : "v", border });
            this.notes.add("가는 선 배경(그라데이션) → 그 자리 칸 경계선");
          }
          continue;
        }
        const cover = ((pw * ph) / Math.max(1e-6, r.w * r.h)) * mean.a;
        if (cover < MIN_COVER) {
          this.notes.add("배경 그림이 상자 대부분을 칠하지 않음(투명·일부만) → 칠하지 않음");
          continue;
        }
        // 꽉 찬 그라데이션: 멈춤 색 평균(예전과 같음)을 바탕(아래 층까지 섞은 색 또는 흰색)에 섞음
        const cs = g.stops.map((x) => x.c);
        const under = out ? { r: out.r, g: out.g, b: out.b } : { r: 255, g: 255, b: 255 };
        const mix = (k: "r" | "g" | "b") => cs.reduce((a, c) => a + c[k] * c.a + under[k] * (1 - c.a), 0) / cs.length;
        out = { r: mix("r"), g: mix("g"), b: mix("b"), a: 1 };
        this.notes.add(g.repeating ? "줄무늬 배경(repeating-gradient) → 색 평균 단색" : "그라데이션 배경 → 색 평균 단색");
      }
    }
    paint.fill = out ? onWhite(out) : null;
    this.paints.set(st, paint);
    return paint;
  }
  /**
   * 자기 테두리·배경이 보이는 상자(배경 층은 실제로 칠하는 자리로 판단 — 안쪽 가는 선만 있는 상자는 꾸밈 없음).
   * 채움만 있고 그 색이 바탕(behind — 가장 가까운 칠한 조상, 없으면 흰 종이)과 같으며 그림자(box-shadow — 테두리 대신 고리를 그리는 데 씀)도 없으면
   * 보이지 않으므로 꾸밈 아님(감싸지 않고 안 항목을 올림 — 2026-10-28, 흰 바탕 문서 틀이 통째로 1×1 표가 되던 것)
   */
  decoBox(b: SnapBox): boolean {
    if (hasBorder(b.style)) return true;
    if (Object.keys(this.overlayEdges(b)).length > 0) return true;
    const p = this.paintOf(b.style, b.rect);
    if (Object.keys(p.edges).length > 0) return true;
    if (p.image) return true;
    if (!p.fill) return false;
    return p.fill !== this.behind(b) || (!!b.style.shadow && b.style.shadow !== "none");
  }
  /** 상자 뒤에 보이는 색: 가장 가까운 칠한 조상의 채움, 없으면 흰 종이. 그 사이 조상에 배경 그림(가는 선 등)이 있으면 모름(null — 흰 점이 선을 가리는 꼴) */
  behind(b: SnapBox): string | null {
    for (let p = this.parents.get(b); p; p = this.parents.get(p)) {
      if (p.style.bgImage && p.style.bgImage !== "none") return null;
      const f = this.paintOf(p.style, p.rect).fill;
      if (f) return f;
    }
    return PAPER;
  }
  /**
   * 테두리 덧그림 의사요소: 글 없는 절대 위치 ::before·::after가 상자를 (테두리 굵기 반쯤 넘쳐) 덮고 배경 층으로 가는 선만 그리면 — 원본 배치 카드 칸 테두리
   * (lib/hwp/html.ts .hw-bd::before) 같은 것 — 그 선을 상자 테두리 변으로(2026-10-28). 채움이 있는 의사요소는 덧그림으로 보지 않음(도형 — 생략 기록)
   */
  isOverlay(b: SnapBox, p: SnapPseudo | undefined): p is SnapPseudo & { rect: Rect } {
    if (!p?.rect || !isAbs(p.style.position) || p.text.trim()) return false;
    const r = p.rect;
    const near = (a: number, c: number) => Math.abs(a - c) <= OVERLAY_TOL_MM;
    if (!near(r.x, b.rect.x) || !near(r.y, b.rect.y) || !near(right(r), right(b.rect)) || !near(bottom(r), bottom(b.rect))) return false;
    const paint = this.paintOf(p.style, r);
    return !paint.fill && Object.keys(paint.edges).length > 0;
  }
  /** 테두리 덧그림 의사요소가 그리는 변(::before 먼저, ::after가 덮음) */
  overlayEdges(b: SnapBox): Paint["edges"] {
    const out: Paint["edges"] = {};
    for (const p of [b.before, b.after]) if (this.isOverlay(b, p)) Object.assign(out, this.paintOf(p.style, p.rect).edges);
    return out;
  }
  /** 부모 표(behind용) — 변환 전에 한 번 */
  index(root: SnapBox): void {
    const walk = (b: SnapBox) => {
      for (const c of b.children)
        if (c.kind === "box") {
          this.parents.set(c, b);
          walk(c);
        }
    };
    walk(root);
  }
  boxSpec(st: SnapStyle, rect: Rect): BoxSpec {
    this.noteDecor(st);
    const [t, r, b, l] = st.border.map((s) => this.border(s));
    const p = this.paintOf(st, rect);
    const e = p.edges;
    const pick = (own: Border, k: keyof Paint["edges"]) => {
      const x = e[k];
      if (!x || own.type !== "NONE") return own;
      this.stats.rules += 1;
      return x;
    };
    return { t: pick(t, "t"), r: pick(r, "r"), b: pick(b, "b"), l: pick(l, "l"), fill: p.fill, ...(p.image ? { image: p.image } : {}) };
  }
  /** 상자의 안쪽 가는 선 → 선 항목 */
  ruleItems(b: SnapBox): RuleItem[] {
    return this.paintOf(b.style, b.rect).rules.map((x) => ({ t: "rule", rect: x.rect, dir: x.dir, border: x.border, ord: this.ord++ }));
  }

  // ── 항목 모으기

  /** 왼쪽 안 여백 안에 놓인 절대 위치 ::before 한두 글자 → 글머리표 */
  markerOf(b: SnapBox): Marker | null {
    const p = b.before;
    if (!p || !p.rect || !isAbs(p.style.position)) return null;
    const text = p.text.trim();
    if (!text || [...text].length > 2) return null;
    const [, , , bl] = b.style.border.map((s) => s.w);
    const textLeft = b.rect.x + bl + b.style.pad[3];
    if (right(p.rect) > textLeft + EPS) return null;
    return { text, style: p.style, rect: p.rect };
  }
  /** 의사요소가 글로 들어가지 않을 때 기록(used: 글머리표·테두리 덧그림으로 쓴 것은 빼고) */
  notePseudo(p: SnapPseudo | undefined, used: boolean): void {
    if (!p || used) return;
    const inline = !isAbs(p.style.position) && p.style.display.startsWith("inline");
    if (inline) return;
    if (p.text.trim()) this.notes.add("절대 위치·블록 의사요소의 글 생략");
    else if (decorated(p.style)) this.notes.add("의사요소 도형(삼각형 등) 생략");
  }

  flowOf(owner: SnapBox, deco: boolean, nodes: SnapNode[], rect: Rect | null, marker: Marker | null, whole: boolean): Flow {
    let r: Rect;
    let padIn: [number, number, number, number] = [0, 0, 0, 0];
    if (rect) r = rect;
    else if (deco) r = contentRect(owner);
    else {
      r = owner.rect;
      const [bt, br, bb, bl] = owner.style.border.map((s) => s.w);
      const [pt, pr, pb, pl] = owner.style.pad;
      padIn = [bt + pt, br + pr, bb + pb, bl + pl];
    }
    return { t: "flow", rect: r, padIn, style: owner.style, nodes, pseudo: whole ? { before: marker ? undefined : owner.before, after: owner.after } : {}, marker, ord: this.ord++ };
  }

  /** 상자 안 항목: 글뿐이면 글 흐름 하나, 아니면 꾸민 상자·대체 대상은 경계로 남기고 꾸밈 없는 상자는 풀어 올림 */
  itemsOf(b: SnapBox, deco: boolean): Item[] {
    const marker = this.markerOf(b);
    // 안쪽 가는 선(배경)은 항목으로 — 꾸민 상자면 그 칸 안 배치에, 아니면 바깥 영역 배치에 들어감
    const rules = this.ruleItems(b);
    if (b.children.length && b.children.every(inlineLevel)) {
      if (!hasInk(b.children, this.inkPic) && !b.before?.text.trim() && !b.after?.text.trim()) return rules;
      if (!marker) this.notePseudo(b.before, this.isOverlay(b, b.before));
      this.notePseudo(b.after, this.isOverlay(b, b.after));
      return [this.flowOf(b, deco, b.children, null, marker, true), ...rules];
    }
    this.notePseudo(b.before, !!marker || this.isOverlay(b, b.before));
    this.notePseudo(b.after, this.isOverlay(b, b.after));
    const out: Item[] = [];
    let pend: SnapNode[] = [];
    let markerLeft = marker;
    const flush = () => {
      if (pend.length && hasInk(pend, this.inkPic)) {
        out.push(this.flowOf(b, deco, pend, this.anonRect(b, pend), markerLeft, false));
        markerLeft = null;
      }
      pend = [];
    };
    const visit = (nodes: SnapNode[]) => {
      for (const k of nodes) {
        if (inlineLevel(k)) {
          pend.push(k);
          continue;
        }
        flush();
        const kb = k as SnapBox;
        if (kb.style.display === "contents") {
          visit(kb.children);
          continue;
        }
        if (kb.replaced) {
          const src = this.picSrcOf(kb);
          if (kb.image) {
            out.push({ t: "pic", rect: kb.rect, src: this.svgSrc(kb.image, kb.rect), ord: this.ord++ });
            this.notes.add("SVG → 브라우저가 그린 그림(PNG)");
          } else if (src) {
            if (src.clip && (src.clip.w <= 0.01 || src.clip.h <= 0.01)) this.notes.add("다 잘려 안 보이는 그림 생략");
            else out.push({ t: "pic", rect: src.clip ?? kb.rect, src, ord: this.ord++ });
          } else if (kb.children.length) out.push({ t: "box", rect: kb.rect, node: kb, ord: this.ord++ });
          else {
            out.push({ t: "void", rect: kb.rect, node: kb, ord: this.ord++ });
            this.notes.add(kb.replaced === "svg" ? "SVG 도형 → 자리만(생략)" : "그림·대체 대상 → 자리만(생략)");
          }
          continue;
        }
        if (this.decoBox(kb)) out.push({ t: "box", rect: kb.rect, node: kb, ord: this.ord++ });
        else {
          this.noteDecor({ ...kb.style, radius: "0px", clipPath: "none" });
          out.push(...this.itemsOf(kb, false));
        }
      }
    };
    visit(b.children);
    flush();
    if (markerLeft) this.notes.add("글머리 의사요소를 붙일 글이 없음 → 생략");
    out.push(...rules);
    return out;
  }

  /**
   * 익명 글 흐름 영역: 블록 상자 안이면 내용 상자 폭, 아니면(flex·grid 항목) 글 상자들을 합친 것.
   * 폭이나 높이가 0인 상자(글자 크기 0으로 감싼 inline 등 — 안의 inline-block 글은 상자 밖에 그려짐)는 자기 자리 대신 안 내용의 자리를 합침(2026-10-28).
   * 내용 상자 폭으로 넓힐 때 같은 줄 옆에 놓인 형제 상자(따로 항목이 되는 것 — 딱지 등)가 그려진 범위(자손이 상자 밖으로 넘친 것까지)는 넘지 않음
   * (넘으면 격자가 겹쳐 차례로 쌓여 한 줄이 두 문단이 됨). 옆 상자 판정은 흐름의 글 범위로 — 글이 감겨 딱지 아래로 오면 옆이 아님
   */
  anonRect(b: SnapBox, nodes: SnapNode[]): Rect {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (r: Rect) => {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, right(r));
      y1 = Math.max(y1, bottom(r));
    };
    const walk = (ns: SnapNode[]) => {
      for (const n of ns) {
        if (n.kind === "text") n.frags.forEach(add);
        else if (n.kind === "box") {
          if (n.style.display === "contents" || n.rect.w === 0 || n.rect.h === 0) walk(n.children);
          else add(n.rect);
        }
      }
    };
    walk(nodes);
    if (!Number.isFinite(x0)) return contentRect(b);
    if (BLOCKISH.has(b.style.display)) {
      const c = contentRect(b);
      let l = c.x;
      let r = right(c);
      const ink = drawnExtent(nodes, true);
      if (ink) {
        const mine = new Set(nodes);
        const beside = (ns: SnapNode[]) => {
          for (const n of ns) {
            if (n.kind !== "box" || mine.has(n)) continue;
            if (n.style.display === "contents") {
              beside(n.children);
              continue;
            }
            if (isAbs(n.style.position)) continue;
            const e = drawnExtent([n], false);
            if (!e || overlap(y0, y1, e.y, bottom(e)) <= EPS) continue;
            if (right(e) <= ink.x + EPS) l = Math.max(l, right(e));
            else if (e.x >= right(ink) - EPS) r = Math.min(r, e.x);
          }
        };
        beside(b.children);
      }
      return { x: l, y: y0, w: r - l, h: y1 - y0 };
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ── 글 흐름 → 문단

  /** 글 조각(글자 모양·붙는 쪽·화면 줄 부분) — 흐름마다 한 번만 만듦(근사 기록이 겹치지 않게) */
  segsOf(f: Flow): Seg[] {
    let segs = this.segCache.get(f);
    if (!segs) {
      segs = this.makeSegs(f);
      this.segCache.set(f, segs);
    }
    return segs;
  }
  makeSegs(f: Flow): Seg[] {
    const segs: Seg[] = [];
    // px: 앞 의사요소(::before)의 시작 x(mm — 감싼 상자의 내용 왼쪽). 의사요소 글은 줄 부분(frags)을 재지 않아 내어쓰기 첫 줄 자리를 여기서 앎(hangOf)
    const pseudoSeg = (p: SnapPseudo | undefined, chip: Chip | null, stick: "next" | "prev", px?: number) => {
      if (!p || !p.text || isAbs(p.style.position) || !p.style.display.startsWith("inline")) return;
      segs.push({ kind: "text", text: p.text, cp: this.charOf(p.style, chip), stick, frags: [], ...(px !== undefined ? { px } : {}) });
    };
    // outerPt: 이 글을 담은 상자(st)의 둘레 글 크기 — 위·아래첨자 판정
    const walk = (nodes: SnapNode[], st: SnapStyle, chip: Chip | null, outerPt?: number) => {
      for (const n of nodes) {
        if (n.kind === "text") segs.push({ kind: "text", text: n.text, cp: this.charOf(st, chip, outerPt), frags: n.frags });
        else if (n.kind === "br") segs.push({ kind: "br", cp: this.charOf(st, chip) });
        else if (n.replaced) {
          const src = this.picSrcOf(n);
          if (src) {
            if (src.clip && (src.clip.w <= 0.01 || src.clip.h <= 0.01)) this.notes.add("다 잘려 안 보이는 그림 생략");
            else segs.push({ kind: "pic", src, cp: this.charOf(st, chip) });
            continue;
          }
          for (const c of n.children) walk([c], st, chip, outerPt);
          this.notes.add(n.replaced === "svg" ? "글 속 SVG 도형 생략" : "글 속 그림·대체 대상 생략");
        } else if (n.style.display === "contents") walk(n.children, n.style, chip, outerPt);
        else {
          let c = chip;
          const deco = this.decoBox(n);
          if (deco) c = this.chipOf(n);
          if (this.paintOf(n.style, n.rect).rules.length) this.notes.add("글 속 상자의 가는 선 배경 생략");
          if (!n.children.every(inlineLevel)) this.notes.add("인라인 상자 안 블록 → 글로 펼침");
          this.notePseudo(n.before, false);
          this.notePseudo(n.after, false);
          pseudoSeg(n.before, c, "next", n.rect.x + n.style.border[3].w + n.style.pad[3]);
          const em = n.style.fontSize / 0.75 / 96 * 25.4; // 1em(mm)
          if (deco && n.style.pad[3] >= 0.2 * em) segs.push({ kind: "text", text: " ", cp: this.charOf(n.style, c), stick: "next", frags: [] });
          walk(n.children, n.style, c, st.fontSize || outerPt);
          if (deco && n.style.pad[1] >= 0.2 * em) segs.push({ kind: "text", text: " ", cp: this.charOf(n.style, c), stick: "prev", frags: [] });
          pseudoSeg(n.after, c, "prev");
        }
      }
    };
    pseudoSeg(f.pseudo.before, null, "next");
    walk(f.nodes, f.style, null);
    pseudoSeg(f.pseudo.after, null, "prev");
    return normalizeSpaces(segs);
  }
  /** 칩: 테두리(배경 가장자리 선 포함)가 있으면 글자 테두리/배경, 배경만이면 음영 */
  chipOf(n: SnapBox): Chip {
    const spec = this.boxSpec(n.style, n.rect);
    // 글자색: 칩 안 첫 글이 놓인 상자의 색(안쪽 글상자처럼 글이 제 색을 가질 수 있음)
    const inkOf = (b: SnapBox): string | null => {
      for (const c of b.children) {
        if (c.kind === "text" && c.text.trim()) return b.style.color;
        if (c.kind === "box") {
          const x = inkOf(c);
          if (x) return x;
        }
      }
      return null;
    };
    const ink = parseColor(inkOf(n) ?? n.style.color);
    if (spec.fill) this.fills.push({ kind: "글자", rect: n.rect, color: spec.fill, ...(ink ? { ink: onWhite(ink) } : {}) });
    if (spec.image) this.notes.add("글 속 상자의 그림 배경 생략");
    if ([spec.t, spec.r, spec.b, spec.l].some((x) => x.type !== "NONE")) return { bf: this.sh.fill({ ...spec, image: null }) };
    return { shade: spec.fill };
  }

  /** 흐름의 화면 줄(캐시) */
  linesOf(f: Flow): Line[] {
    let ls = this.lineCache.get(f);
    if (!ls) {
      ls = clusterLines(this.segsOf(f));
      this.lineCache.set(f, ls);
    }
    return ls;
  }
  /** 흐름 글자 크기(pt — 한글 줄 간격 비율의 기준): 안 글의 가장 큰 글자 크기, 글이 없으면 흐름 상자 글자 크기(감싼 상자는 font-size: 0일 수 있음 — 원본 배치 카드) */
  textPt(f: Flow): number {
    const hs = this.segsOf(f).flatMap((s) => (s.kind === "text" && s.text.trim() ? [this.sh.doc.charPrs[s.cp].height / 100] : []));
    return hs.length ? Math.max(...hs) : f.style.fontSize || 10;
  }
  /**
   * 줄 간격(mm): 화면에서 잰 줄 간격을 계산된 line-height보다 먼저 씀(원본 배치 카드 문단은 line-height: 0 상자에 줄 높이를 준 인라인 블록을 쌓음).
   *  · 여러 줄: 이어지는 줄 가운데 간격의 아래쪽 중앙값(빈 줄·큰 글자 줄이 끌지 않게) — 계산값과 3% 안이면 계산값(같은 값, 반올림 차이만)
   *  · 잰 간격이 없거나 글자 크기 × LINE_MIN 미만이면 계산값(normal은 글자 크기 × 1.2), 그것도 LINE_MIN 미만이면 줄 상자 높이(흐름 내용 높이 ÷ 줄 수)
   */
  lineOf(f: Flow): number {
    let L = this.pitchCache.get(f);
    if (L !== undefined) return L;
    const st = f.style;
    const fontMm = this.textPt(f) * MM_PER_PT;
    const css = (st.lineHeight ?? (st.fontSize || this.textPt(f)) * 1.2) * MM_PER_PT;
    const ls = this.linesOf(f);
    const pitch = linePitch(ls);
    if (pitch !== null && pitch >= LINE_MIN * fontMm) L = Math.abs(pitch - css) <= 0.03 * pitch ? css : pitch;
    else if (css >= LINE_MIN * fontMm) L = css;
    else {
      const h = (f.rect.h - f.padIn[0] - f.padIn[2]) / Math.max(1, ls.length);
      L = h >= LINE_MIN * fontMm ? h : fontMm * 1.2;
    }
    if (L !== css) this.notes.add("줄 높이 계산값 대신 화면에서 잰 줄 간격");
    else if (st.lineHeight === null) this.notes.add("줄 높이 normal → 120%");
    this.pitchCache.set(f, L);
    return L;
  }
  /** 흐름의 세로 범위(첫 줄 위 ~ 끝 줄 아래, 줄 높이 기준). 줄이 없으면 상자 */
  flowExtent(f: Flow): { y0: number; y1: number } {
    const ls = this.linesOf(f);
    if (!ls.length) return { y0: f.rect.y, y1: bottom(f.rect) };
    const L = this.lineOf(f);
    return { y0: ls[0].cy - L / 2, y1: ls[ls.length - 1].cy + L / 2 };
  }
  extentOf(items: Item[]): { y0: number; y1: number } {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const it of items) {
      const e = it.t === "flow" ? this.flowExtent(it) : { y0: it.rect.y, y1: bottom(it.rect) };
      y0 = Math.min(y0, e.y0);
      y1 = Math.max(y1, e.y1);
    }
    return { y0, y1 };
  }

  /**
   * 내어쓰기(lib/hwpx/hang.ts 관례 — 첫 줄은 left, 둘째 줄부터 left − intent): 첫 줄 시작 x0(mm)과 내어쓰기 폭 w(mm). 없으면 null. 왼쪽·양쪽·배분 정렬 글만
   *  · 음수 text-indent(CSS 내어쓰기): 첫 줄 = 내용 왼쪽 + text-indent, 둘째 줄부터 내용 왼쪽
   *  · 여러 줄: 둘째 줄부터의 가장 왼쪽 시작 − 첫 줄 시작(화면에서 잰 줄 상자 — 원본 배치 카드는 줄마다 왼쪽 안 여백을 준 인라인 블록)
   *  · 한 줄이고 부호 + 빈칸으로 시작하는 글(markerLead): 부호 뒤 첫 글자가 따로 잰 줄 부분의 시작이면 그 자리 − 첫 줄 시작
   */
  hangOf(f: Flow, segs: Seg[], lines: Line[], align: Align): { x0: number; w: number } | null {
    if (!["LEFT", "JUSTIFY", "DISTRIBUTE"].includes(align)) return null;
    const ti = f.style.textIndent;
    if (ti < -EPS) return { x0: f.rect.x + f.padIn[3] + ti, w: -ti };
    if (!lines.length) return null;
    // 첫 줄 시작: 줄 상자는 의사요소 글을 빼고 재므로, 맨 앞이 의사요소 글(원본 배치 카드의 기호 글머리 등)이면 그 시작 x
    const first = segs[0];
    const xa = Math.min(lines[0].x0, first?.kind === "text" && !first.frags.length && first.px !== undefined ? first.px : Infinity);
    if (lines.length > 1) {
      const xb = Math.min(...lines.slice(1).map((l) => l.x0));
      return xb - xa > EPS ? { x0: xa, w: xb - xa } : null;
    }
    const text = segs.map((s) => (s.kind === "br" ? "\n" : s.kind === "pic" ? "\uFFFC".repeat(8) : s.text)).join("");
    const lead = markerLead(text);
    if (!lead) return null;
    for (const s of segs) {
      if (s.kind !== "text") continue;
      const fr = s.frags.find((g) => (s.pos ?? 0) + g.at === lead && g.w > 0);
      const x = fr ? fr.x : s.pos === lead && s.px !== undefined ? s.px : null;
      if (x !== null) return x - xa > EPS ? { x0: xa, w: x - xa } : null;
    }
    return null;
  }

  flowPara(f: Flow, region: Region): POut {
    const segs = this.segsOf(f);
    const st = f.style;
    const items: Inline[] = [];
    let pos = 0;
    for (const s of segs) {
      if (s.kind === "br") {
        items.push({ kind: "br", pos, charPr: s.cp });
        pos += 1;
      } else if (s.kind === "pic") {
        items.push({ kind: "obj", pos, charPr: s.cp, obj: this.pic(s.src) });
        pos += 8;
      } else {
        items.push({ kind: "text", pos, charPr: s.cp, text: s.text });
        pos += s.text.length;
      }
    }
    const lines = this.linesOf(f);
    const end = this.charOf(st, null);
    const brk = wordBreakOf(st.wordBreak);
    let align = alignOf(st);
    const L = this.lineOf(f);
    const pt = this.textPt(f);
    const line = Math.round((L / (pt * MM_PER_PT)) * 100);
    let left = f.rect.x - region.x0 + f.padIn[3];
    let rightM = region.x1 - right(f.rect) + f.padIn[1];
    let indent = st.textIndent;
    let bullet = 0;
    if (f.marker) {
      // 글머리표: 첫 줄은 부호 자리, 둘째 줄부터 글 시작 자리(내어쓰기 = 글 시작 − 부호 왼쪽 — lib/hwpx/hang.ts)
      const m = f.marker;
      const mcp = this.charOf(m.style, null);
      const textStart = f.rect.x + f.padIn[3];
      bullet = this.sh.bullet(m.text, mcp, hu(textStart - right(m.rect)));
      left = m.rect.x - region.x0;
      indent = -(textStart - m.rect.x);
    }
    const hang = f.marker ? null : this.hangOf(f, segs, lines, align);
    if (hang) {
      left = hang.x0 - region.x0;
      indent = -hang.w;
    }
    const single = lines.length <= 1 && !segs.some((s) => s.kind === "br");
    if (single && lines.length && lastAlignOf(st) === "DISTRIBUTE") align = "DISTRIBUTE";
    else if (single && lines.length) {
      // 한 줄 글: 화면 글 자리로 정렬을 정하고 오른쪽 여유를 둠(한글 글자 폭이 조금 달라도 줄이 안 넘치게)
      const tx0 = lines[0].x0;
      const tx1 = lines[0].x1;
      const lg = tx0 - region.x0;
      const rg = region.x1 - tx1;
      if (!f.marker && !hang && lg > 0.5 && Math.abs(lg - rg) < 0.8) {
        align = "CENTER";
        left = 0;
        rightM = 0;
        indent = 0;
      } else if (!f.marker && !hang && lg > 0.5 && rg < 0.5) {
        align = "RIGHT";
        left = 0;
        rightM = 0;
        indent = 0;
      } else {
        if (!f.marker && !hang) {
          left = Math.max(0, lg);
          indent = 0;
        }
        rightM = 0;
        align = "LEFT";
      }
    } else if (align === "JUSTIFY" && brk.nonLatin === "BREAK_WORD" && midWordBreak(segs, lines)) {
      align = "LEFT";
      this.notes.add("어절 단위 양쪽 정렬인데 화면이 어절 가운데서 줄을 나눔 → 왼쪽 정렬(한 어절 줄의 글자 벌어짐 방지)");
    }
    const squeeze = single && lines.length === 1;
    if (squeeze) this.stats.squeezed += 1;
    const ps: ParaSpec = {
      align,
      line,
      left: hu(Math.max(0, left)),
      right: hu(Math.max(0, rightM)),
      indent: hu(indent),
      before: hu(f.padIn[0]),
      after: hu(f.padIn[2]),
      breakLatin: brk.latin,
      breakNonLatin: brk.nonLatin,
      wrap: squeeze ? "SQUEEZE" : "BREAK",
      bullet,
    };
    const out: POut = { ps, items, lines: [], end };
    if (this.withLines && lines.length) {
      const size = Math.round(pt * 100);
      const pitch = Math.round(L * HU_PER_MM);
      const textLeft = region.x0 + Math.max(0, left);
      const width = hu(region.x1 - region.x0) - ps.left - ps.right;
      out.lines = lines.map((ln, i) => {
        const horz = i === 0 ? 0 : Math.max(0, hu(ln.x0 - textLeft));
        return {
          textpos: ln.start,
          vertpos: Math.max(0, hu(ln.cy - L / 2 - region.y0)),
          vertsize: size,
          textheight: size,
          baseline: Math.round(size * 0.85),
          spacing: Math.max(0, pitch - size),
          horzpos: horz,
          horzsize: Math.max(0, width - horz),
          flags: 393216,
        };
      });
      this.stats.lined += 1;
    }
    return out;
  }

  // ── 상자·표

  /** 세로 정렬: 내용 범위와 영역 위아래 빈틈으로 */
  vaOf(ext: { y0: number; y1: number }, region: Region): VAlign {
    // 안 요소의 바깥 여백 정도(1mm 안팎)는 위 정렬로 봄 — 아래 정렬은 위 빈틈이 뚜렷할 때만
    const tg = ext.y0 - region.y0;
    const bg = region.y1 - ext.y1;
    if (tg > 0.5 && bg > 0.5 && Math.abs(tg - bg) < Math.max(0.8, 0.15 * (tg + bg))) return "CENTER";
    if (tg > 2 && bg < 0.3) return "BOTTOM";
    return "TOP";
  }

  /** 꾸민 상자 → 칸(테두리/배경·안 여백·세로 정렬·안 문단) */
  boxCell(b: SnapBox, at: { r0: number; r1: number; c0: number; c1: number }): TCell {
    const box = this.boxSpec(b.style, b.rect);
    // 테두리 덧그림 의사요소의 선은 자기 테두리가 없는 변에
    const ov = this.overlayEdges(b);
    for (const k of ["t", "r", "b", "l"] as const) {
      const e = ov[k];
      if (e && box[k].type === "NONE") {
        box[k] = e;
        this.stats.rules += 1;
      }
    }
    const cr = contentRect(b);
    const items = this.itemsOf(b, true);
    const region: Region = { x0: cr.x, x1: right(cr), y0: cr.y, y1: bottom(cr) };
    let va: VAlign = "TOP";
    if (items.length) {
      va = this.vaOf(this.extentOf(items), region);
      if (va !== "TOP") region.y0 = this.extentOf(items).y0;
    }
    const outs = this.layout(items, region);
    const margin: [number, number, number, number] = [hu(cr.x) - hu(b.rect.x), hu(right(b.rect)) - hu(right(cr)), hu(cr.y) - hu(b.rect.y), hu(bottom(b.rect)) - hu(bottom(cr))];
    return { ...at, box, margin: margin.map((v) => Math.max(0, v)) as [number, number, number, number], va, outs };
  }

  /** 꾸민 상자 하나 → 표(1×1, 안이 꽉 찬 표 하나면 그 표에 바깥 테두리·배경을 얹음) */
  boxTable(b: SnapBox): TableIR {
    const cell = this.boxCell(b, { r0: 0, r1: 1, c0: 0, c1: 1 });
    const cr = contentRect(b);
    const only = cell.outs.length === 1 ? cell.outs[0] : null;
    const noPad = b.style.pad.every((p) => p < 0.1);
    if (only?.table && only.rect && noPad && !cell.box?.image && only.ps.before === 0 && Math.abs(only.rect.x - cr.x) < EPS && Math.abs(right(only.rect) - right(cr)) < EPS && Math.abs(only.rect.y - cr.y) < EPS && Math.abs(bottom(only.rect) - bottom(cr)) < EPS) {
      const t = only.table;
      const outer = cell.box as BoxSpec;
      const lastC = t.xs.length - 1;
      const lastR = t.ys.length - 1;
      for (const c of t.cells) {
        const bx = { ...(c.box ?? EMPTY_BOX) };
        if (c.c0 === 0 && bx.l.type === "NONE") bx.l = outer.l;
        if (c.c1 === lastC && bx.r.type === "NONE") bx.r = outer.r;
        if (c.r0 === 0 && bx.t.type === "NONE") bx.t = outer.t;
        if (c.r1 === lastR && bx.b.type === "NONE") bx.b = outer.b;
        if (!bx.fill && outer.fill) bx.fill = outer.fill;
        c.box = bx;
      }
      return t;
    }
    return { xs: [b.rect.x, right(b.rect)], ys: [b.rect.y, bottom(b.rect)], cells: [cell] };
  }

  /** 표·그림을 품은 문단 모양: 영역 안 자리로 정렬(가운데·오른쪽) 또는 왼쪽 여백 */
  place(rect: Rect, region: Region): ParaSpec {
    const lg = rect.x - region.x0;
    const rg = region.x1 - right(rect);
    let align: Align = "LEFT";
    let left = Math.max(0, lg);
    if (lg > 0.3 && Math.abs(lg - rg) < 0.5) {
      align = "CENTER";
      left = 0;
    } else if (lg > 0.3 && rg < 0.3) {
      align = "RIGHT";
      left = 0;
    }
    return { align, line: 100, left: hu(left), right: 0, indent: 0, before: 0, after: 0, breakLatin: "KEEP_WORD", breakNonLatin: "BREAK_WORD", wrap: "BREAK", bullet: 0 };
  }
  /** 표를 품은 문단 */
  host(t: TableIR, rect: Rect, region: Region): POut {
    return { ps: this.place(rect, region), items: [], lines: [], end: this.tiny(), table: t, rect };
  }
  /** 그림을 품은 문단 */
  picHost(it: PicItem, region: Region): POut {
    return { ps: this.place(it.rect, region), items: [], lines: [], end: this.tiny(), pic: it.src, rect: it.rect };
  }

  // ── 배치

  /** 가로 띠: 세로 구간이 겹치는 항목끼리. 맞닿은 표 행(모두 꾸민 상자·같은 열 경계)은 한 띠로 */
  bands(items: Item[]): { items: Item[]; y0: number; y1: number }[] {
    const s = [...items].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    const out: { items: Item[]; y0: number; y1: number }[] = [];
    for (const it of s) {
      const last = out[out.length - 1];
      if (last && it.rect.y < last.y1 - EPS) {
        last.items.push(it);
        last.y1 = Math.max(last.y1, bottom(it.rect));
      } else out.push({ items: [it], y0: it.rect.y, y1: bottom(it.rect) });
    }
    const rowLike = (b: { items: Item[] }) => b.items.length >= 2 && b.items.every((i) => i.t === "box");
    const xKey = (b: { items: Item[] }) => snapEdges(b.items.flatMap((i) => [i.rect.x, right(i.rect)]));
    const merged: typeof out = [];
    for (const b of out) {
      const prev = merged[merged.length - 1];
      if (prev && rowLike(prev) && rowLike(b) && b.y0 - prev.y1 < EPS) {
        const a = xKey(prev);
        const c = xKey(b);
        if (a.length === c.length && a.every((v, i) => Math.abs(v - c[i]) < EPS)) {
          prev.items.push(...b.items);
          prev.y1 = Math.max(prev.y1, b.y1);
          continue;
        }
      }
      merged.push(b);
    }
    return merged;
  }

  /** 세로로 자르기: 가로 구간이 겹치지 않는 열들(왼쪽부터) */
  columns(items: Item[]): Item[][] {
    const s = [...items].sort((a, b) => a.rect.x - b.rect.x);
    const cols: { items: Item[]; x1: number }[] = [];
    for (const it of s) {
      const last = cols[cols.length - 1];
      if (last && it.rect.x < last.x1 - EPS) {
        last.items.push(it);
        last.x1 = Math.max(last.x1, right(it.rect));
      } else cols.push({ items: [it], x1: right(it.rect) });
    }
    return cols.map((c) => c.items);
  }

  /** 열끼리 행이 맞는가: 꾸민 상자가 두 열 이상에 있고, 그 위아래 경계가 모두 다른 열과 같은 높이(또는 띠 위아래) */
  aligned(cols: Item[][], band: { y0: number; y1: number }): boolean {
    const boxCols = cols.filter((c) => c.some((i) => i.t === "box"));
    if (boxCols.length < 2) return false;
    const edges = (c: Item[]) => c.filter((i) => i.t === "box").flatMap((i) => [i.rect.y, bottom(i.rect)]);
    const per = boxCols.map(edges);
    const near = (a: number, b: number) => Math.abs(a - b) < EPS;
    return per.every((es, k) => es.every((e) => near(e, band.y0) || near(e, band.y1) || per.some((o, j) => j !== k && o.some((x) => near(x, e)))));
  }

  /** 열 나눔 표(한 행): 열마다 따로 흐름. 열 사이 빈틈은 앞 열에 붙임(한 줄 글이 넘치지 않게 여유) */
  columnsTable(cols: Item[][], band: { y0: number; y1: number }, x0: number, x1: number): TableIR {
    const starts = [x0, ...cols.slice(1).map((c) => Math.min(...c.map((i) => i.rect.x)))];
    const xs: number[] = [];
    const cells: TCell[] = [];
    cols.forEach((c, i) => {
      const end = i + 1 < cols.length ? starts[i + 1] : x1;
      const c0 = xs.length;
      xs.push(starts[i]);
      // 띠 높이를 꽉 채운 꾸민 상자 하나뿐인 열: 그 상자를 바로 칸으로(감싸지 않음), 뒤 빈틈은 빈 칸 열
      const only = c.length === 1 && c[0].t === "box" ? c[0] : null;
      if (only && Math.abs(only.rect.y - band.y0) < EPS && Math.abs(bottom(only.rect) - band.y1) < EPS) {
        cells.push(this.boxCell(only.node, { r0: 0, r1: 1, c0, c1: c0 + 1 }));
        if (end - right(only.rect) > EPS) {
          xs.push(right(only.rect));
          cells.push({ r0: 0, r1: 1, c0: c0 + 1, c1: c0 + 2, box: null, margin: [0, 0, 0, 0], va: "TOP", outs: [] });
        }
        return;
      }
      const region: Region = { x0: starts[i], x1: end, y0: band.y0, y1: band.y1 };
      const ext = this.extentOf(c);
      const va = this.vaOf(ext, region);
      if (va !== "TOP") region.y0 = ext.y0;
      cells.push({ r0: 0, r1: 1, c0, c1: c0 + 1, box: null, margin: [0, 0, 0, 0], va, outs: this.layout(c, region) });
    });
    xs.push(x1);
    return { xs, ys: [band.y0, band.y1], cells };
  }

  /**
   * 격자 표: 모든 항목 경계로 행·열, 항목은 칸 합치기. 글 흐름은 위아래 빈틈까지 늘려(꾸밈이 없어 보이는 모양은 같음) 행 수를 줄임. 겹치면 null.
   * 안쪽 가는 선(rule)은 칸을 차지하지 않고 가운데 자리를 경계로 더함 — 그 경계에서 시작하는(가로 선은 위 변, 세로 선은 왼 변) 채움 없는 칸에 테두리로 얹음.
   * 선을 가로지르는 칸(채운 상자 등)은 선을 가림(화면에서 배경 위에 그려진 것과 같음). 빈 칸은 선 경계를 넘어 합치지 않음
   */
  gridTable(items: Item[], band: { y0: number; y1: number }, x0: number, x1: number): TableIR | null {
    const rules = items.filter((i): i is RuleItem => i.t === "rule");
    const solid = items.filter((i) => i.t !== "rule");
    const cyOf = (r: RuleItem) => r.rect.y + r.rect.h / 2;
    const cxOf = (r: RuleItem) => r.rect.x + r.rect.w / 2;
    const exp = new Map<Item, { y0: number; y1: number }>();
    for (const it of solid) {
      if (it.t !== "flow") {
        exp.set(it, { y0: it.rect.y, y1: bottom(it.rect) });
        continue;
      }
      const xo = (o: Item) => overlap(it.rect.x, right(it.rect), o.rect.x, right(o.rect)) > EPS;
      const above = solid.filter((o) => o !== it && xo(o) && bottom(o.rect) <= it.rect.y + EPS);
      const below = solid.filter((o) => o !== it && xo(o) && o.rect.y >= bottom(it.rect) - EPS);
      const near = above.reduce<Item | null>((a, o) => (!a || bottom(o.rect) > bottom(a.rect) ? o : a), null);
      let y0 = !near ? band.y0 : near.t !== "flow" ? bottom(near.rect) : it.rect.y;
      let y1 = below.length ? Math.min(...below.map((o) => o.rect.y)) : band.y1;
      // 늘리되 가로 선을 넘지 않음(넘으면 그 칸이 선을 가림)
      for (const r of rules) {
        if (r.dir !== "h" || !xo(r)) continue;
        const cy = cyOf(r);
        if (cy <= it.rect.y + EPS) y0 = Math.max(y0, cy);
        if (cy >= bottom(it.rect) - EPS) y1 = Math.min(y1, cy);
      }
      exp.set(it, { y0: Math.min(y0, it.rect.y), y1: Math.max(y1, bottom(it.rect)) });
    }
    const xs = snapEdges([x0, x1, ...solid.flatMap((i) => [i.rect.x, right(i.rect)]), ...rules.flatMap((r) => (r.dir === "h" ? [r.rect.x, right(r.rect)] : [cxOf(r)]))]);
    const ys = snapEdges([band.y0, band.y1, ...solid.flatMap((i) => [exp.get(i)!.y0, exp.get(i)!.y1]), ...rules.flatMap((r) => (r.dir === "h" ? [cyOf(r)] : [r.rect.y, bottom(r.rect)]))]);
    const occ = Array.from({ length: ys.length - 1 }, () => Array.from({ length: xs.length - 1 }, () => false));
    const cells: TCell[] = [];
    for (const it of solid) {
      const e = exp.get(it)!;
      const at = { c0: nearest(xs, it.rect.x), c1: nearest(xs, right(it.rect)), r0: nearest(ys, e.y0), r1: nearest(ys, e.y1) };
      if (at.c0 >= at.c1 || at.r0 >= at.r1) {
        // 글이 든 항목은 버리지 않음 — 격자를 포기하고 차례로 쌓음(겹친 상자와 같은 길)
        if (it.t === "flow" || (it.t === "box" && hasInk([it.node]))) return null;
        this.notes.add("아주 작은 상자(0.3mm 이하) 생략");
        continue;
      }
      for (let r = at.r0; r < at.r1; r++)
        for (let c = at.c0; c < at.c1; c++) {
          if (occ[r][c]) return null;
          occ[r][c] = true;
        }
      if (it.t === "box") cells.push(this.boxCell(it.node, at));
      else if (it.t === "void") cells.push({ ...at, box: null, margin: [0, 0, 0, 0], va: "TOP", outs: [] });
      else if (it.t === "pic") cells.push({ ...at, box: null, margin: [0, 0, 0, 0], va: "TOP", outs: [this.picHost(it, { x0: xs[at.c0], x1: xs[at.c1], y0: ys[at.r0], y1: ys[at.r1] })] });
      else {
        const region: Region = { x0: xs[at.c0], x1: xs[at.c1], y0: ys[at.r0], y1: ys[at.r1] };
        const va = this.vaOf(this.flowExtent(it), region);
        if (va !== "TOP") region.y0 = this.flowExtent(it).y0;
        // 영역이 상자보다 넓어진 만큼(경계 맞춤 오차) 문단 여백이 생기지 않게 흐름 상자를 칸에 맞춤
        const f: Flow = { ...it, rect: { x: region.x0, y: it.rect.y, w: region.x1 - region.x0, h: it.rect.h } };
        this.segCache.set(f, this.segsOf(it));
        cells.push({ ...at, box: null, margin: [0, 0, 0, 0], va, outs: [this.flowPara(f, region)] });
      }
    }
    const hardRows = new Set(rules.filter((r) => r.dir === "h").map((r) => nearest(ys, cyOf(r))));
    const hardCols = new Set(rules.filter((r) => r.dir === "v").map((r) => nearest(xs, cxOf(r))));
    fillEmpty(occ, cells, hardRows, hardCols);
    for (const r of rules) {
      let hit = 0;
      const h = r.dir === "h";
      const k = h ? nearest(ys, cyOf(r)) : nearest(xs, cxOf(r));
      const last = h ? ys.length - 1 : xs.length - 1;
      // 선이 걸친 구간(가로 선이면 x, 세로 선이면 y)
      const [s0, s1] = h ? [r.rect.x, right(r.rect)] : [r.rect.y, bottom(r.rect)];
      for (const c of cells) {
        if (c.box?.fill || c.box?.image) continue;
        const [a0, a1] = h ? [xs[c.c0], xs[c.c1]] : [ys[c.r0], ys[c.r1]];
        if (a0 < s0 - EPS || a1 > s1 + EPS) continue;
        const startEdge = h ? c.r0 : c.c0;
        const endEdge = h ? c.r1 : c.c1;
        // 경계에서 시작하는 칸의 위(왼) 변 — 끝 경계의 선이면 거기서 끝나는 칸의 아래(오른) 변
        const side = k < last ? (startEdge === k ? (h ? "t" : "l") : null) : endEdge === k ? (h ? "b" : "r") : null;
        if (!side) continue;
        const bx = { ...(c.box ?? EMPTY_BOX) };
        if (bx[side].type !== "NONE") continue;
        bx[side] = r.border;
        c.box = bx;
        hit++;
      }
      this.stats.rules += hit;
      if (!hit) this.notes.add("가는 선이 칸·글에 가려 생략");
    }
    return { xs, ys, cells };
  }
  /** 띠에 홀로 있는 가는 선 → 선 자리 크기의 칸 하나(가로 선은 위 변, 세로 선은 왼 변) */
  ruleTable(r: RuleItem): TableIR {
    const box = { ...EMPTY_BOX, [r.dir === "h" ? "t" : "l"]: r.border };
    this.stats.rules += 1;
    return { xs: [r.rect.x, right(r.rect)], ys: [r.rect.y, bottom(r.rect)], cells: [{ r0: 0, r1: 1, c0: 0, c1: 1, box, margin: [0, 0, 0, 0], va: "TOP", outs: [] }] };
  }

  /** 띠 하나 → 문단들 */
  bandOuts(band: { items: Item[]; y0: number; y1: number }, region: Region): POut[] {
    // 자리만 남기는 대체 대상은 경계에 넣지 않음(빈 칸이 그 자리를 채움 — 가는 틈 열이 생기지 않게)
    const items = band.items.filter((i) => i.t !== "void");
    if (!items.length) return [];
    const rules = items.filter((i): i is RuleItem => i.t === "rule");
    // 선만 있는 띠: 선마다 가는 칸 하나
    if (rules.length === items.length) return rules.map((r) => this.host(this.ruleTable(r), r.rect, region));
    if (items.length === 1) {
      const it = items[0];
      if (it.t === "flow") return [this.flowPara(it, region)];
      if (it.t === "pic") return [this.picHost(it, region)];
      return [this.host(this.boxTable((it as BoxItem).node), it.rect, region)];
    }
    const x0 = Math.min(...items.map((i) => i.rect.x));
    const x1 = Math.max(...items.map((i) => right(i.rect)));
    const y0 = Math.min(...items.map((i) => i.rect.y));
    const y1 = Math.max(...items.map((i) => bottom(i.rect)));
    band = { items, y0, y1 };
    const rect: Rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const cols = this.columns(items);
    // 가는 선이 있으면 격자로(선이 열 나눔 표의 칸 경계를 가로지름)
    if (!rules.length && cols.length >= 2 && !this.aligned(cols, band)) {
      // 칸 폭 여유: 띠가 가운데 놓인 것이 아니면 끝 열을 영역 오른쪽 끝까지 넓힘(끝 열의 한 줄 글이 글 폭에 딱 맞춰져 한글에서 넘치지 않게 — 여러 줄 글은 오른쪽 여백으로 화면 폭을 지킴)
      const lg = x0 - region.x0;
      const rg = region.x1 - x1;
      const xr = rg > EPS && !(lg > 0.3 && Math.abs(lg - rg) < 0.5) ? region.x1 : x1;
      return [this.host(this.columnsTable(cols, band, x0, xr), { ...rect, w: xr - x0 }, region)];
    }
    const grid = this.gridTable(items, band, x0, x1);
    if (grid) return [this.host(grid, rect, region)];
    // 겹친 상자: 화면 순서대로 차례로 쌓음(가는 선은 뺌)
    this.notes.add("겹친 상자 → 차례로 쌓음");
    if (rules.length) this.notes.add("겹친 상자 사이 가는 선 생략");
    return [...items].filter((i) => i.t !== "rule").sort((a, b) => a.ord - b.ord).flatMap((it) => this.bandOuts({ items: [it], y0: it.rect.y, y1: bottom(it.rect) }, region));
  }

  /** 영역 안 항목 → 위에서 아래로 쌓은 문단들(띠 사이 빈틈은 문단 위 간격) */
  layout(items: Item[], region: Region): POut[] {
    const out: POut[] = [];
    let prev = region.y0;
    for (const band of this.bands(items)) {
      const outs = this.bandOuts(band, region);
      if (!outs.length) continue;
      const gap = band.y0 - prev;
      if (gap > 0.05) outs[0].ps = { ...outs[0].ps, before: outs[0].ps.before + hu(gap) };
      out.push(...outs);
      prev = band.y1;
    }
    return out;
  }

  // ── 마무리(모양 id 확정)

  para(o: POut, depth: number): Para {
    let items = o.items;
    let ps = o.ps;
    if (o.table) {
      const t = this.table(o.table, depth + 1);
      // 글자처럼 취급하지 않는 표: 문단 정렬·왼쪽 여백 대신 표 가로 자리(문단 기준 정렬·거리)
      if (!t.pos.treatAsChar) {
        t.pos = { ...t.pos, horzAlign: ps.align === "CENTER" ? "CENTER" : ps.align === "RIGHT" ? "RIGHT" : "LEFT", horzOffset: ps.align === "CENTER" || ps.align === "RIGHT" ? 0 : ps.left };
        ps = { ...ps, align: "LEFT", left: 0 };
      }
      items = [{ kind: "obj", pos: 0, charPr: this.tiny(), obj: t }];
    } else if (o.pic) items = [{ kind: "obj", pos: 0, charPr: this.tiny(), obj: this.pic(o.pic) }];
    else this.stats.paras += 1;
    let pos = 0;
    const its = items.map((it) => {
      const x = { ...it, pos } as Inline;
      pos += it.kind === "text" ? it.text.length : it.kind === "br" ? 1 : 8;
      return x;
    });
    return { paraPr: this.sh.para(ps), style: 0, items: its, lines: o.lines, length: pos + 1, pageBreak: false, endCharPr: o.end };
  }
  emptyPara(): Para {
    return { paraPr: this.sh.para({ align: "LEFT", line: 100, left: 0, right: 0, indent: 0, before: 0, after: 0, breakLatin: "KEEP_WORD", breakNonLatin: "BREAK_WORD", wrap: "BREAK", bullet: 0 }), style: 0, items: [], lines: [], length: 1, pageBreak: false, endCharPr: this.tiny() };
  }
  /** 그림 id(같은 열쇠는 같은 id). make가 null이면 바이트 없는 id(쓰기 계층이 빈 그림을 넣음) */
  binOf(key: string, make: (() => HwpxImage) | null): number {
    let bin = this.picBins.get(key);
    if (bin === undefined) {
      bin = this.picBins.size + 1;
      if (make) this.images.set(bin, make());
      this.picBins.set(key, bin);
    }
    return bin;
  }
  /** SVG를 그린 PNG → 그림 재료(열쇠 = PNG 글 — 같은 PNG는 한 벌) */
  svgSrc(im: SnapImage, rect: Rect): PicSrc {
    return { key: im.png, make: () => ({ data: Uint8Array.from(atob(im.png), (c) => c.charCodeAt(0)), ext: "png" }), full: rect, photo: false };
  }
  /** <img> → 그림 재료: 원본 그림 옵션이 있고 주소가 있을 때만(바이트를 못 받았으면 빈 그림 — 자리만) */
  picSrcOf(b: SnapBox): PicSrc | null {
    if (!this.pictures || !b.src || b.replaced !== "img") return null;
    const got = this.pictures.get(b.src.url);
    return { key: got ? `url:${b.src.url}` : "", make: got ? () => got : null, full: b.rect, ...(b.src.clip ? { clip: b.src.clip } : {}), photo: true };
  }
  /** 글 흐름 안 그림으로 볼 대체 대상(hasInk) */
  private readonly inkPic = (b: SnapBox) => this.picSrcOf(b) !== null;
  /** 그림(글자처럼 취급 — 보이는 부분 크기 그대로, 잘린 그림은 화면 상자 전체를 원래 크기로 두고 자름). 같은 열쇠는 그림 하나를 같이 씀 */
  pic(src: PicSrc): Pic {
    const bin = this.binOf(src.key, src.make);
    if (!src.photo) this.stats.pics += 1;
    else if (src.make) this.stats.images += 1;
    else {
      this.stats.imageVoids += 1;
      this.notes.add("그림을 받지 못함 → 같은 크기 빈 그림(자리만)");
    }
    const full = src.full;
    const vis = src.clip ?? full;
    const w = Math.max(1, hu(full.w));
    const h = Math.max(1, hu(full.h));
    const cw = Math.max(1, hu(vis.w));
    const ch = Math.max(1, hu(vis.h));
    const cl = Math.max(0, Math.min(w, hu(vis.x - full.x)));
    const ct = Math.max(0, Math.min(h, hu(vis.y - full.y)));
    if (src.clip) this.notes.add("잘린 그림 → 한글 그림 자르기");
    return {
      kind: "pic",
      pos: { treatAsChar: true, affectLineSpacing: false, vertRelTo: "PARA", horzRelTo: "PARA", vertAlign: "TOP", horzAlign: "LEFT", vertOffset: 0, horzOffset: 0, width: cw, height: ch, wrap: "TOP_AND_BOTTOM", zOrder: 0, outMargin: [0, 0, 0, 0] },
      orgW: w,
      orgH: h,
      curW: cw,
      curH: ch,
      crop: src.clip ? [cl, ct, Math.min(w, cl + cw), Math.min(h, ct + ch)] : [0, 0, w, h],
      inMargin: [0, 0, 0, 0],
      bin,
      borderColor: null,
      borderWidth: 0,
      bright: 0,
      contrast: 0,
      effect: "REAL_PIC",
      imgDim: [w, h],
    };
  }
  table(t: TableIR, depth: number): Table {
    this.stats.tables += 1;
    this.stats.depth = Math.max(this.stats.depth, depth);
    const colW = t.xs.slice(1).map((x, i) => Math.max(1, hu(x) - hu(t.xs[i])));
    const rowH = t.ys.slice(1).map((y, i) => Math.max(1, hu(y) - hu(t.ys[i])));
    const cells: Cell[] = t.cells.map((c) => {
      this.stats.cells += 1;
      if (c.box?.image) this.stats.imageFills += 1;
      if (c.box?.fill) this.fills.push({ kind: "칸", rect: { x: t.xs[c.c0], y: t.ys[c.r0], w: t.xs[c.c1] - t.xs[c.c0], h: t.ys[c.r1] - t.ys[c.r0] }, color: c.box.fill });
      const width = colW.slice(c.c0, c.c1).reduce((a, v) => a + v, 0);
      const height = rowH.slice(c.r0, c.r1).reduce((a, v) => a + v, 0);
      const [l, r, tp, bt] = c.margin;
      // 안 여백이 칸보다 크면 줄임(한글이 칸을 넓히지 않게)
      const k = l + r > width - 100 ? Math.max(0, (width - 100) / Math.max(1, l + r)) : 1;
      const paras = c.outs.map((o) => this.para(o, depth));
      return {
        row: c.r0,
        col: c.c0,
        rowSpan: c.r1 - c.r0,
        colSpan: c.c1 - c.c0,
        width,
        height,
        margin: [Math.floor(l * k), Math.floor(r * k), tp, bt],
        ownMargin: true,
        borderFill: this.sh.fill(c.box ?? EMPTY_BOX),
        vertAlign: c.va,
        paras: paras.length ? paras : [this.emptyPara()],
      };
    });
    const width = colW.reduce((a, v) => a + v, 0);
    const height = rowH.reduce((a, v) => a + v, 0);
    // 맨 위 표가 나눔 높이보다 높으면 글자처럼 취급하지 않음(한글이 쪽 경계에서 나눔) — 가로 자리는 품은 문단(para)이 정함
    const over = hu(this.splitOverMm);
    const split = depth === 1 && height > over;
    if (split) this.stats.split += 1;
    return {
      kind: "table",
      pos: { treatAsChar: !split, affectLineSpacing: false, vertRelTo: "PARA", horzRelTo: "PARA", vertAlign: "TOP", horzAlign: "LEFT", vertOffset: 0, horzOffset: 0, width, height, wrap: "TOP_AND_BOTTOM", zOrder: 0, outMargin: [0, 0, 0, 0] },
      rows: rowH.length,
      cols: colW.length,
      cellSpacing: 0,
      inMargin: [0, 0, 0, 0],
      borderFill: this.sh.fill(EMPTY_BOX),
      // 나눔 높이보다 높은 행이 있으면 칸 안에서도 나눔(TABLE), 아니면 행 단위(CELL — 한글 기본값)
      pageBreak: split && rowH.some((h) => h > over) ? "TABLE" : "CELL",
      repeatHeader: false,
      cells,
    };
  }
}

interface Chip {
  bf?: number;
  shade?: string | null;
}
/** 글 조각: 글·줄바꿈·글 속 그림(문단 안 개체 — 글자 자리 8칸) */
type Seg = { kind: "text"; text: string; cp: number; stick?: "next" | "prev"; frags: SnapFrag[]; pos?: number; px?: number } | { kind: "br"; cp: number; pos?: number } | { kind: "pic"; cp: number; src: PicSrc; pos?: number };

/**
 * 빈 자리를 꾸밈 없는 빈 칸으로(한 행에서 이어진 빈 자리를 옆으로, 같은 폭이 아래로 이어지면 아래로 합침).
 * 가는 선 경계(hardRows: 행 경계 번호, hardCols: 열 경계 번호)는 넘어 합치지 않음
 */
function fillEmpty(occ: boolean[][], cells: TCell[], hardRows = new Set<number>(), hardCols = new Set<number>()): void {
  for (let r = 0; r < occ.length; r++)
    for (let c = 0; c < occ[r].length; c++) {
      if (occ[r][c]) continue;
      let c1 = c + 1;
      while (c1 < occ[r].length && !occ[r][c1] && !hardCols.has(c1)) c1++;
      let r1 = r + 1;
      while (r1 < occ.length && !hardRows.has(r1) && occ[r1].slice(c, c1).every((v) => !v)) r1++;
      for (let y = r; y < r1; y++) for (let x = c; x < c1; x++) occ[y][x] = true;
      cells.push({ r0: r, r1, c0: c, c1, box: null, margin: [0, 0, 0, 0], va: "TOP", outs: [] });
    }
}

/**
 * 공백 정리: 문단 머리·끝 공백을 걷고 조각 사이 겹친 공백을 하나로(화면 공백 접기와 같음). 걷은 글자만큼 줄 부분 시작 위치를 당김.
 * 줄바꿈 글자(pre-line)는 줄바꿈으로. XML 금지 문자도 걷음
 */
function normalizeSpaces(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  let lastSpace = true;
  for (const s of segs) {
    if (s.kind === "br") {
      out.push(s);
      lastSpace = true;
      continue;
    }
    if (s.kind === "pic") {
      out.push(s);
      lastSpace = false;
      continue;
    }
    const parts = s.text.replace(XML_BAD, "").split("\n");
    parts.forEach((part, pi) => {
      if (pi > 0) {
        out.push({ kind: "br", cp: s.cp });
        lastSpace = true;
      }
      const removed: number[] = [];
      let text = "";
      const base = s.text.split("\n").slice(0, pi).reduce((a, p) => a + p.length + 1, 0);
      for (let i = 0; i < part.length; i++) {
        const ch = part[i] === "\t" ? " " : part[i];
        if (ch === " " && lastSpace) {
          removed.push(base + i);
          continue;
        }
        text += ch;
        lastSpace = ch === " ";
      }
      const shift = (at: number) => at - base - removed.filter((k) => k < at).length;
      const frags = s.frags.filter((f) => f.at >= base && f.at <= base + part.length).map((f) => ({ ...f, at: Math.max(0, Math.min(text.length, shift(f.at))) }));
      if (text) out.push({ kind: "text", text, cp: s.cp, stick: s.stick, frags, ...(s.px !== undefined && pi === 0 ? { px: s.px } : {}) });
    });
  }
  // 끝 공백
  for (let i = out.length - 1; i >= 0; i--) {
    const s = out[i];
    if (s.kind !== "text") break;
    const t = s.text.replace(/ +$/, "");
    if (t === s.text) break;
    if (t) {
      out[i] = { ...s, text: t, frags: s.frags.map((f) => ({ ...f, at: Math.min(f.at, t.length) })) };
      break;
    }
    out.splice(i, 1);
  }
  // 줄바꿈 바로 앞 공백
  for (let i = 1; i < out.length; i++) {
    const p = out[i - 1];
    if (out[i].kind === "br" && p.kind === "text" && p.text.endsWith(" ")) out[i - 1] = { ...p, text: p.text.replace(/ +$/, "") };
  }
  let pos = 0;
  return out
    .filter((s) => s.kind !== "text" || s.text)
    .map((s) => {
      const x = { ...s, pos };
      pos += s.kind === "br" ? 1 : s.kind === "pic" ? 8 : s.text.length;
      return x;
    });
}

/**
 * 화면 줄 묶기: 조각의 줄 부분을 글 순서로 보며, 앞 부분보다 아래(세로 가운데가 반 줄 넘게)·왼쪽으로 가면 새 줄.
 * 줄 시작 위치는 그 부분의 첫 글자 — 바로 앞에 「뒤에 붙는」 글(::before·칩 왼쪽 여백)이 있으면 그 글부터
 */
function clusterLines(segs: Seg[]): Line[] {
  const lines: Line[] = [];
  let prev: SnapFrag | null = null;
  segs.forEach((s, si) => {
    if (s.kind !== "text") return;
    for (const f of s.frags) {
      if (f.w <= 0 && f.h <= 0) continue;
      const cy = f.y + f.h / 2;
      const last = lines[lines.length - 1];
      const newLine = !last || (prev !== null && cy - (prev.y + prev.h / 2) > 0.5 * Math.min(f.h, prev.h) && f.x < prev.x + prev.w - 0.5);
      if (newLine) {
        let start = (s.pos ?? 0) + f.at;
        if (f.at === 0) {
          let k = si - 1;
          while (k >= 0 && segs[k].kind === "text" && (segs[k] as { stick?: string }).stick === "next") {
            start = segs[k].pos ?? start;
            k--;
          }
        }
        lines.push({ start: lines.length ? start : 0, x0: f.x, x1: f.x + f.w, cy, h: f.h });
      } else {
        last.x0 = Math.min(last.x0, f.x);
        last.x1 = Math.max(last.x1, f.x + f.w);
        // 줄 가운데는 가장 큰 글자 부분 기준(위첨자·칩이 끌지 않게)
        if (f.h > last.h + 0.05) {
          last.cy = cy;
          last.h = f.h;
        }
      }
      prev = f;
    }
  });
  return lines;
}

const MM_PER_PT = 25.4 / 72;
/** 줄 간격이 글자 크기의 이 배수 미만이면 줄이 겹침(줄 간격 고르기·겹침 점검 공용) */
const LINE_MIN = 0.9;
/** 화면 줄 간격(mm): 이어지는 줄 가운데 간격의 아래쪽 중앙값. 줄이 하나면 null */
function linePitch(ls: Line[]): number | null {
  const d = ls
    .slice(1)
    .map((l, i) => l.cy - ls[i].cy)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  return d.length ? d[Math.floor((d.length - 1) / 2)] : null;
}

/**
 * 겹침 점검(결정론 — 한글에서 줄이 겹쳐 읽을 수 없는 문단): 모든 문단 목록(본문·표 칸, 표 안 표까지)에서
 *  · tight: 글 문단의 줄 간격(글자 크기 × 비율 — PERCENT, FIXED는 그 값, BETWEEN_LINES는 글자 + 값, AT_LEAST는 큰 쪽)이 가장 큰 글자 크기 × LINE_MIN 미만
 *  · stacked: 줄 배치(linesegarray)를 적은 문단 목록에서 앞 줄 위치 + 앞 줄 글 높이 × LINE_MIN보다 위에서 시작하는 줄이 있는 문단
 *    (줄 배치가 없으면 한글이 문단을 차례로 쌓으므로 겹침은 tight로만 생김)
 */
export function overlapCheck(input: Pick<HwpxInput, "doc" | "paras">): { tight: number; stacked: number } {
  const { charPrs, paraPrs } = input.doc;
  let tight = 0;
  let stacked = 0;
  const list = (paras: readonly Para[]) => {
    let prev: LineSeg | null = null;
    for (const p of paras) {
      const hs = p.items.flatMap((it) => (it.kind === "text" && it.text.trim() ? [charPrs[it.charPr]?.height ?? 0] : []));
      if (hs.length) {
        const h = Math.max(...hs);
        const pp = paraPrs[p.paraPr];
        const v = pp.lineSpacing;
        const pitch = pp.lineSpacingType === "PERCENT" ? (h * v) / 100 : pp.lineSpacingType === "FIXED" ? v : pp.lineSpacingType === "BETWEEN_LINES" ? h + v : Math.max(h, v);
        if (pitch < LINE_MIN * h) tight += 1;
      }
      let hit = false;
      for (const ln of p.lines) {
        if (prev && ln.vertpos < prev.vertpos + LINE_MIN * prev.textheight) hit = true;
        prev = ln;
      }
      if (hit) stacked += 1;
      for (const it of p.items) if (it.kind === "obj" && it.obj.kind === "table") for (const c of it.obj.cells) list(c.paras);
    }
  };
  list(input.paras);
  return { tight, stacked };
}
type AlignStyle = Pick<SnapStyle, "textAlign" | "textAlignLast" | "textJustify">;
/** 한쪽 정렬 값(start·left·center·right·end …) → 한글 정렬(왼쪽→오른쪽 글 기준) */
function sideOf(a: string): Align {
  if (a === "center" || a === "-webkit-center") return "CENTER";
  if (a === "right" || a === "end" || a === "-webkit-right") return "RIGHT";
  return "LEFT";
}
/**
 * 여러 줄 문단 정렬: justify → 양쪽(JUSTIFY — 마지막 줄은 펴지 않음), 마지막 줄까지 펴면(text-align-last: justify) 배분(DISTRIBUTE),
 * text-justify: none이면 펴지 않으므로 왼쪽. 나머지는 한쪽 정렬
 */
export function alignOf(st: AlignStyle): Align {
  if (st.textAlign === "justify") {
    if (st.textJustify === "none") return "LEFT";
    return st.textAlignLast === "justify" ? "DISTRIBUTE" : "JUSTIFY";
  }
  return sideOf(st.textAlign);
}
/** 마지막 줄 정렬(한 줄 글이면 그 줄): text-align-last가 auto면 text-align을 따르되 justify는 시작 쪽(펴지 않음), justify면 배분 */
export function lastAlignOf(st: AlignStyle): Align {
  const l = st.textAlignLast;
  if (!l || l === "auto") return st.textAlign === "justify" ? "LEFT" : sideOf(st.textAlign);
  if (l === "justify") return st.textJustify === "none" ? "LEFT" : "DISTRIBUTE";
  return sideOf(l);
}
/**
 * word-break → 한글 줄 나눔 단위. HWPX 이름과 뜻이 반대(breakNonLatinWord BREAK_WORD = 어절, KEEP_WORD = 글자 — 한글 11 저장본 줄 배치 검산, 커밋 acca106).
 * keep-all → 한글 어절·영문 단어, break-all → 한글·영문 모두 글자(breakLatinWord BREAK_WORD = 글자 — 영문 쪽은 이름 그대로), 그 밖(normal·break-word) → 한글 글자·영문 단어
 */
export function wordBreakOf(wordBreak: string): { nonLatin: ParaPr["breakNonLatin"]; latin: ParaPr["breakLatin"] } {
  if (wordBreak === "keep-all") return { nonLatin: "BREAK_WORD", latin: "KEEP_WORD" };
  if (wordBreak === "break-all") return { nonLatin: "KEEP_WORD", latin: "BREAK_WORD" };
  return { nonLatin: "KEEP_WORD", latin: "KEEP_WORD" };
}
/** 화면 줄바꿈 중 공백이 아닌 자리(어절 가운데 — 닫는 괄호 뒤·overflow-wrap 등)에서 나뉜 것이 있음 */
function midWordBreak(segs: Seg[], lines: Line[]): boolean {
  const text = segs.map((s) => (s.kind === "br" ? "\n" : s.kind === "pic" ? "\uFFFC".repeat(8) : s.text)).join("");
  return lines.slice(1).some((l) => l.start > 0 && l.start < text.length && !/\s/.test(text[l.start - 1]) && !/\s/.test(text[l.start]));
}

/** 스냅숏 → 한글 모델 입력·근사 목록·통계 */
export function snapshotHwpxInput(snap: LayoutSnapshot, opts: DomHwpxOptions): DomHwpxResult {
  const body = bodyMmOf(opts.page);
  const cv = new Converter(opts.lines, snap.root.style, opts.splitOverMm ?? body.h, opts.spacingUndo ?? [], opts.pictures ?? null);
  if (Math.abs(snap.frame.w - body.w) > 0.5) cv.notes.add(`본문 틀 폭 ${snap.frame.w.toFixed(1)}mm ≠ 한글 본문 ${body.w}mm`);
  const region: Region = { x0: 0, x1: snap.frame.w, y0: 0, y1: snap.frame.h };
  const root = snap.root;
  cv.index(root);
  const outs = cv.decoBox(root) ? [cv.host(cv.boxTable(root), root.rect, region)] : cv.layout(cv.itemsOf(root, false), region);
  const paras = outs.map((o) => cv.para(o, 0));
  if (!paras.length) paras.push(cv.emptyPara());
  const ov = overlapCheck({ doc: cv.sh.doc, paras });
  cv.stats.tight = ov.tight;
  cv.stats.stacked = ov.stacked;
  if (ov.tight) cv.notes.add("겹침 점검: 줄 간격이 글자 크기 × 0.9 미만인 문단", ov.tight);
  if (ov.stacked) cv.notes.add("겹침 점검: 같은 칸 안에서 앞 줄과 세로 위치가 겹치는 문단", ov.stacked);
  const hc = hangCheck({ doc: cv.sh.doc, paras });
  cv.stats.marked = hc.marked;
  cv.stats.flat = hc.flat;
  if (hc.flat) cv.notes.add("내어쓰기 점검: 부호로 시작하거나 글머리표인데 내어쓰기가 없는 문단", hc.flat);
  return { input: { doc: cv.sh.doc, page: pageDefOf(opts.page), paras, images: cv.images, title: opts.title ?? "" }, approx: cv.notes.list(), stats: cv.stats, fills: cv.fills };
}

/** 스냅숏 → HWPX 바이트(범용 쓰기 계층 → 한컴 정품 순서 묶기) */
export async function snapshotToHwpx(snap: LayoutSnapshot, opts: DomHwpxOptions): Promise<{ bytes: Uint8Array; approx: Approximation[]; stats: DomHwpxStats; fills: FillProbe[] }> {
  const { input, approx, stats, fills } = snapshotHwpxInput(snap, opts);
  const { bytes } = await writeHwpxPackage(hwpxFiles(input));
  return { bytes, approx, stats, fills };
}
