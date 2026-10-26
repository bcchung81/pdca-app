// 과제관리카드 한글(HWPX)을 9.16 원본 서식으로. 값은 원본 한글 파일(260916 과제관리카드 주요사업1~3, 카드 59장)의
// 카드 표를 kordoc으로 읽어 잰 것입니다(열 너비·칸별 테두리/채움·글꼴·문단 모양).
//  1) formProfile(layout): kordoc 서식 프로필 — 표마다 열 너비, 칸마다 테두리·채움·글꼴(write.ts cardLayout의 역할로 고름)
//  2) finishCardHwpx(bytes, layout): 프로필로 안 되는 것 — 쪽 여백, 칸 세로 가운데·빈 행 높이, 문단 정렬·줄 간격·글머리 내어쓰기,
//     굵은 머리말·작은 괄호 글·파란 과제번호·PDCA 머리글자·노란 과제명과 AI활용 항목, 굵은 글꼴 요소, 한컴 정품 패키지(R043)
// 결정론 변환입니다(같은 카드 → 같은 파일). 글은 바꾸지 않고 run만 나눠, 내려받은 파일을 다시 올리면 같은 카드로 읽힙니다.
// 원본의 PDCA 화살표(그리기 개체)는 칸 채움으로, 줄마다 다른 자간은 기본 자간으로 바꿨습니다.

import { type BorderDef, type BorderFillDef, type CharPrDef, type FormatProfile, type TableProfile, markdownToHwpx } from "kordoc";
import { CharPrs, ParaPrs, type ParaSpec, normalizeBold, readHwpxFiles, writeHwpxPackage } from "../../hwpx/postprocess.ts";
import { lineClass, lineHead } from "../render.ts";
import { type CardLayout, type CellRole, type LCell, type LTable, type Stage, type WriteOptions, cardLayout, layoutMarkdown } from "./write.ts";
import type { LooseJson } from "../../loose-json.ts";

// ---------------------------------------------------------------------------
// 열 너비(HWPUNIT, 1mm ≈ 283)

const LABEL_W = 4285;
const GAP_W = 849;
/** 원본 표 너비의 내용 부분. 위쪽 구역(과제명~전략)은 43014로 저장돼 있어 아래쪽(환류~성과) 43294에 맞춰 늘림 */
const FULL = 43294;
const TOP = 43014;
const up = (x: number) => Math.round((x * FULL) / TOP);
/** 내용 열마다 오른쪽 경계(내용 시작부터) — 월별 기간 | 계량 구분① | 과제 구분① | 지표명 | 과제명 | 환류 절반 | 예산 절반 | 부서 | 산식 | 과제 구분③ | 계량 구분③ | ’25 실적 | 끝 */
const BOUNDS = [3112, up(10753), up(10891), up(14338), up(20655), 21647, up(21783), up(28031), up(28858), up(32397), up(32542), up(35938), FULL];
export const CARD_COLS = [LABEL_W, GAP_W, ...BOUNDS.map((b, i) => b - (i ? BOUNDS[i - 1] : 0))];
/** 묶음 표지(원본: 남색 띠 28389 너비, HY헤드라인M 15pt 흰 글) — 「(주요사업1)」이 한 줄에 들게 */
const GROUP_COLS = [12000, 16389];
/** AX 붙임: 라벨 8530(본문 표) · 배지 나머지 3321(머리 표 배지 11851) · 내용 */
const AX_COLS = [8530, 3321, 36622];

// ---------------------------------------------------------------------------
// 테두리·채움

const line = (type: string, width: string, color: string): BorderDef => ({ type, width, color });
const G = line("SOLID", "0.12 mm", "#808080"); // 구역 칸 선(회색)
const K = line("SOLID", "0.12 mm", "#000000");
const KT = line("SOLID", "0.5 mm", "#000000"); // 과제명 머리(굵은 검정)
const KD = line("DOT", "0.12 mm", "#000000"); // 부서·관리자 칸(점선)
const BT = line("SOLID", "0.5 mm", "#0000FF"); // 월별 실적 상자(굵은 파랑)
const AXL = line("SOLID", "0.4 mm", "#0C86CB"); // AX 머리
const BL = line("SOLID", "0.12 mm", "#0000FF"); // AX 체크리스트 줄
const NAVY = line("SOLID", "0.2 mm", "#192D87");
const CYAN = "#C7E6E9";

const bf = (l?: BorderDef, r?: BorderDef, t?: BorderDef, b?: BorderDef, fill?: string): BorderFillDef => ({
  ...(l ? { leftBorder: l } : {}),
  ...(r ? { rightBorder: r } : {}),
  ...(t ? { topBorder: t } : {}),
  ...(b ? { bottomBorder: b } : {}),
  ...(fill ? { fill: { faceColor: fill } } : {}),
});
const box = (x: BorderDef, fill?: string) => bf(x, x, x, x, fill);

/** PDCA 라벨 채움(원본 화살표 도형의 색) */
export const PDCA_FILL: Record<Stage, string> = { act: "#D8EBEF", plan: "#C5E3E5", do: "#B2D9E0", check: "#9FD0D7" };

const BORDER: Record<string, BorderFillDef> = {
  titleLabel: box(KT, "#000000"),
  title: box(KT),
  headLabel: bf(KT, KD, KD, KD, CYAN),
  headValue: bf(KD, KD, KD, KD, CYAN),
  headLabel2: bf(KT, KD, KD, K, CYAN),
  headValue2: bf(KD, KD, KD, K, CYAN),
  none: {},
  box: box(G),
  gap: bf(G, G),
  catFirst: bf(G, undefined, G, G),
  catMid: bf(undefined, undefined, G, G),
  catLast: bf(undefined, G, G, G),
  header: bf(G, G, G, undefined, CYAN),
  under: bf(G, G, undefined, G),
  doMain: bf(G, G, G, BT),
  pdcaGap: bf(undefined, G),
  monthGap: bf(undefined, BT),
  monthPeriod: bf(BT, undefined, BT, BT),
  monthItems: bf(undefined, BT, BT, BT),
  pdca_act: bf(undefined, undefined, undefined, undefined, PDCA_FILL.act),
  pdca_plan: bf(undefined, undefined, undefined, undefined, PDCA_FILL.plan),
  pdca_do: bf(undefined, undefined, undefined, undefined, PDCA_FILL.do),
  pdca_check: bf(undefined, undefined, undefined, undefined, PDCA_FILL.check),
  group: box(NAVY, "#192D87"),
  axBadge: box(AXL, "#DFE6F7"),
  axTitle: bf(AXL, undefined, undefined, AXL),
  axLabel: box(K, "#E4E4E4"),
  axContent: box(K),
  axCheckLabel: bf(BL, K, BL, BL, "#E4E4E4"),
  axCheckContent: bf(K, BL, BL, BL),
};

const SAME_KEY = new Set<CellRole>(["titleLabel", "title", "headLabel", "headValue", "headLabel2", "headValue2", "gap", "catFirst", "catMid", "catLast", "header", "doMain", "pdcaGap", "monthGap", "monthPeriod", "monthItems", "axBadge", "axTitle", "axLabel", "axContent", "axCheckLabel", "axCheckContent"]);

function borderKey(c: LCell | null, kind: LTable["kind"]): string {
  if (!c) return kind === "card" ? "box" : "none";
  if (SAME_KEY.has(c.role)) return c.role;
  switch (c.role) {
    case "label":
    case "content":
    case "ovCell":
      return "box";
    case "underHeader":
    case "kpiData":
      return "under";
    case "pdcaLabel":
      return `pdca_${c.stage ?? "do"}`;
    case "groupId":
    case "groupName":
      return "group";
    default:
      return "none"; // 구역 사이 빈 행 · AX 비고
  }
}

// ---------------------------------------------------------------------------
// 칸 글꼴(원본: 한컴 윤고딕 740 10pt, 과제명 760, 과제명 라벨 흰 굵은 글, AX 머리 HY헤드라인M 15pt, AX 본문 KoPub돋움체 12pt)

const FACE = "한컴 윤고딕 740";
const cpDef = (pt: number, o: Partial<CharPrDef> = {}): CharPrDef => ({ height_hwpunit: String(Math.round(pt * 100)), textColor: "#000000", fontName_hangul: FACE, ...o });
const CHAR: Record<string, CharPrDef> = {
  base: cpDef(10),
  bold: cpDef(10, { bold: true }),
  white: cpDef(10, { bold: true, textColor: "#FFFFFF" }),
  title: cpDef(10, { fontName_hangul: "한컴 윤고딕 760" }),
  tiny: cpDef(1),
  group: cpDef(15, { textColor: "#FFFFFF", fontName_hangul: "HY헤드라인M" }),
  axHead: cpDef(15, { fontName_hangul: "HY헤드라인M" }),
  axLabel: cpDef(12, { bold: true, fontName_hangul: "KoPub돋움체 Medium" }),
  axBody: cpDef(12, { fontName_hangul: "KoPub돋움체 Medium" }),
};

const SPACERS = new Set<CellRole>(["spacerTop", "spacerLabel", "spacerGap", "spacer"]);

function charKey(c: LCell | null, kind: LTable["kind"]): string {
  if (!c) return kind === "ax" ? "axBody" : "base";
  if (SPACERS.has(c.role)) return "tiny";
  switch (c.role) {
    case "titleLabel":
      return "white";
    case "title":
      return "title";
    case "headLabel":
    case "headLabel2":
    case "label":
    case "pdcaLabel":
      return "bold";
    case "groupId":
    case "groupName":
      return "group";
    case "axBadge":
    case "axTitle":
      return "axHead";
    case "axLabel":
    case "axCheckLabel":
      return "axLabel";
    case "axContent":
    case "axCheckContent":
    case "axNote":
      return "axBody";
    default:
      return "base";
  }
}

// ---------------------------------------------------------------------------
// 프로필

export interface Placed {
  r: number;
  c: number;
  rs: number;
  cs: number;
  /** kordoc이 빈 자리를 메운 칸이면 null */
  cell: LCell | null;
}

/** kordoc(layoutHtmlRows)과 같은 방식으로 칸 자리 잡기: 행 순서대로 빈 열에 놓고, 남는 자리는 빈 칸으로 */
export function placeCells(rows: LCell[][]): { placed: Placed[]; rowCnt: number; colCnt: number } {
  const occ = new Set<string>();
  const placed: Placed[] = [];
  let colCnt = 0;
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row) {
      while (occ.has(`${r},${c}`)) c++;
      const cs = Math.max(1, cell.colspan);
      const rs = Math.max(1, cell.rowspan);
      placed.push({ r, c, rs, cs, cell });
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) occ.add(`${r + dr},${c + dc}`);
      c += cs;
      colCnt = Math.max(colCnt, c);
    }
  });
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < colCnt; c++)
      if (!occ.has(`${r},${c}`)) {
        placed.push({ r, c, rs: 1, cs: 1, cell: null });
        occ.add(`${r},${c}`);
      }
  placed.sort((a, b) => a.r - b.r || a.c - b.c);
  return { placed, rowCnt: rows.length, colCnt };
}

const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function tableProfile(t: LTable, index: number): TableProfile {
  const { placed, rowCnt, colCnt } = placeCells(t.rows);
  const borders: Record<string, BorderFillDef> = {};
  const chars: Record<string, CharPrDef> = {};
  const cells = placed.map((p) => {
    const b = borderKey(p.cell, t.kind);
    const ch = charKey(p.cell, t.kind);
    borders[b] = BORDER[b];
    chars[ch] = CHAR[ch];
    return { row: p.r, col: p.c, rowSpan: p.rs, colSpan: p.cs, borderFillIDRef: b, charPrIDRef: ch };
  });
  const widths = t.kind === "card" ? CARD_COLS : t.kind === "ax" ? AX_COLS : GROUP_COLS;
  const first = placed.find((p) => p.r === 0 && p.c === 0)?.cell;
  return {
    table_index: index,
    rows: rowCnt,
    cols: colCnt,
    ...(first ? { anchor_text: plain(first.html) } : {}),
    ...(widths.length === colCnt ? { col_widths_hwpunit: widths.map(String), width_hwpunit: String(widths.reduce((a, b) => a + b, 0)) } : {}),
    cells,
    used_border_fills: borders,
    used_char_prs: chars,
  };
}

/** 카드 표 모델 → kordoc 서식 프로필(markdownToHwpx의 profile) */
export function formProfile(layout: CardLayout): FormatProfile {
  return { schema_version: "0.3.0", tables: layout.tables.map(tableProfile) };
}

// ---------------------------------------------------------------------------
// 후처리: 문단 모양·run 나누기

/** 원본 쪽 여백: 위·아래 15mm, 왼쪽 20mm, 머리말·꼬리말 10mm. 오른쪽은 표 너비(48428)에 맞춤(원본 표는 여백을 0.8mm 넘음) */
const PAGE_MARGIN = '<hp:margin header="2834" footer="2834" gutter="0" left="5669" right="5431" top="4251" bottom="4251"/>';
const SPACER_H = 384;

const P_CENTER: ParaSpec = { align: "CENTER", left: 0, right: 0, intent: 0, lineSpacing: 130 };
const P_KPI: ParaSpec = { align: "CENTER", left: 0, right: 0, intent: 0, lineSpacing: 120 };
const P_TIGHT: ParaSpec = { align: "CENTER", left: 0, right: 0, intent: 0, lineSpacing: 100 };
const P_BODY: ParaSpec = { align: "JUSTIFY", left: 300, right: 300, intent: 0, lineSpacing: 150 };
/** 글머리(∙ → ※ ★ ① 등) 한 칸만큼 뒷줄을 들임 */
const P_HANG1: ParaSpec = { align: "JUSTIFY", left: 300, right: 300, intent: -1000, lineSpacing: 150 };
/** 하위 글머리(- 가.)는 한 단 더 들여 */
const P_HANG2: ParaSpec = { align: "JUSTIFY", left: 1300, right: 300, intent: -900, lineSpacing: 150 };

const CENTER_ROLES = new Set<CellRole>(["titleLabel", "title", "headLabel", "headValue", "headLabel2", "headValue2", "label", "pdcaLabel", "header", "monthPeriod", "groupId", "axBadge", "axLabel", "axCheckLabel"]);
const VCENTER_ROLES = new Set<CellRole>([...CENTER_ROLES, "kpiData", "ovCell", "catFirst", "catMid", "catLast", "groupName", "axTitle"]);
const PLAIN_ROLES = new Set<CellRole>(["ovCell", "catFirst", "catMid", "catLast", "groupName", "axTitle"]);

function paraFor(c: LCell | null, text: string): ParaSpec {
  if (!c) return P_BODY;
  if (SPACERS.has(c.role)) return P_TIGHT;
  if (CENTER_ROLES.has(c.role)) return P_CENTER;
  if (c.role === "kpiData") return P_KPI;
  if (PLAIN_ROLES.has(c.role) || c.hint) return P_BODY;
  const cls = lineClass(text);
  if (cls === "b2" || cls === "b2k") return P_HANG2;
  if (cls === "plain" || cls === "center") return P_BODY;
  return P_HANG1;
}

type Variant = "bold" | "small" | "sup" | "blue" | "shade";
interface Seg {
  t: string;
  v: Variant[];
}

/** 괄호 설명 「(…)」은 9pt(원본: 부서(팀) · 지표명 (단위) · 국정과제(정부정책) · 고도화과제(기존) 등) */
function smallParens(t: string, base: Variant[] = []): Seg[] {
  return t
    .split(/(\([^()]*\))/)
    .filter(Boolean)
    .map((x) => ({ t: x, v: /^\([^()]*\)$/.test(x) ? [...base, "small"] : base }));
}

/** 체크 상자 칸: ☑ 항목 이름은 굵게, 괄호 설명은 9pt, 「주요사업」 꼬리표는 작게 — 원본 양식 fmtCheck와 같은 규칙 */
function checkSegs(t: string, highlightChecked = false): Seg[] {
  const out: Seg[] = [];
  let checked = false;
  for (const part of t.split(/([☑□☐])/)) {
    if (!part) continue;
    if (/^[☑□☐]$/.test(part)) {
      checked = part === "☑";
      out.push({ t: part, v: checked ? ["bold"] : [] });
      continue;
    }
    if (highlightChecked && checked && part.trim() && !/해당\s*사항\s*없음/.test(part)) {
      out.push({ t: part, v: ["shade"] });
      checked = false;
      continue;
    }
    const m = /^(\s*)(주요사업\s*)?([^(:,，]*)([\s\S]*)$/.exec(part)!;
    if (m[1]) out.push({ t: m[1], v: [] });
    if (m[2]) out.push({ t: m[2], v: ["sup"] });
    if (m[3]) out.push({ t: m[3], v: checked && m[3].trim() ? ["bold"] : [] });
    if (m[4]) out.push(...smallParens(m[4]));
    checked = false;
  }
  return out;
}

/** 칸 역할과 글에 따라 run 나누기(글은 그대로) */
export function segments(text: string, c: LCell | null, index: number): Seg[] {
  const whole: Seg[] = [{ t: text, v: [] }];
  if (!c) return whole;
  switch (c.role) {
    case "title": {
      const m = /^([\s\S]*?)(\s*\(과제번호 : [^)]*\))$/.exec(text);
      return m ? [...(m[1] ? [{ t: m[1], v: ["shade"] as Variant[] }] : []), { t: m[2], v: ["blue"] }] : [{ t: text, v: ["shade"] }];
    }
    case "pdcaLabel": {
      const m = index === 0 ? /^\[([A-Za-z])([A-Za-z]*)\]$/.exec(text) : null;
      return m ? [{ t: "[", v: [] }, { t: m[1], v: ["blue"] }, { t: `${m[2]}]`, v: [] }] : whole;
    }
    case "headLabel":
    case "header":
      return smallParens(text);
    case "ovCell":
    case "catFirst":
    case "catMid":
    case "catLast":
      return /[☑□☐]/.test(text) ? checkSegs(text) : whole;
    case "underHeader":
      if (c.hint === "esg") return checkSegs(text);
      if (c.hint === "ai") return checkSegs(text, true);
      if (c.hint === "national") return whole;
      break;
    case "content":
    case "doMain":
    case "monthItems":
    case "axContent":
    case "axCheckContent":
    case "axNote":
      break;
    default:
      return whole;
  }
  // 글줄: 글머리 뒤 괄호 머리말은 굵게(원본 양식과 같은 규칙), ★ (…) 머리는 파랑
  const cls = lineClass(text);
  if (cls === "star") {
    const m = /^(★\s*(?:\([^)]*\))?)([\s\S]*)$/.exec(text)!;
    return [{ t: m[1], v: ["bold", "blue"] }, ...(m[2] ? [{ t: m[2], v: [] as Variant[] }] : [])];
  }
  const lh = lineHead(text, cls);
  if (!lh) return whole;
  return [...(lh[0] ? [{ t: lh[0], v: [] as Variant[] }] : []), { t: lh[1], v: ["bold"] }, ...(lh[2] ? [{ t: lh[2], v: [] as Variant[] }] : [])];
}

const addBold = (x: string) => (/\sbold="1"/.test(x) ? x : x.replace(/^(<hh:charPr\b[^>]*?)(\s*>)/, '$1 bold="1"$2'));

function variantId(cp: CharPrs, base: string, vs: Variant[]): string {
  let id = base;
  for (const v of [...new Set(vs)].sort()) {
    if (v === "bold") id = cp.derive(id, "bold", addBold);
    else if (v === "small") id = cp.sized(id, 9);
    else if (v === "sup") id = cp.sized(id, 7);
    else if (v === "blue") id = cp.derive(id, "blue", (x) => x.replace(/textColor="[^"]*"/, 'textColor="#0000FF"'));
    else if (v === "shade") id = cp.derive(id, "shade", (x) => x.replace(/shadeColor="[^"]*"/, 'shadeColor="#FFFF00"'));
  }
  return id;
}

const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&");
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------------------
// section XML 훑기(kordoc 산출은 규칙적이라 태그 깊이만 셈)

/** 최상위 표들의 [시작, 끝] */
function topTables(xml: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /<hp:tbl\b|<\/hp:tbl>/g;
  let depth = 0;
  let start = -1;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0] === "</hp:tbl>") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push([start, re.lastIndex]);
        start = -1;
      }
    } else {
      if (depth === 0) start = m.index;
      depth += 1;
    }
  }
  return out;
}

/** 표 XML에서 이 표의 칸(중첩 표 칸 제외)을 f로 바꿈 */
function mapDirectCells(tbl: string, f: (cell: string) => string): string {
  const re = /<hp:tbl\b|<\/hp:tbl>|<hp:tc\b|<\/hp:tc>/g;
  let depth = 0;
  let start = -1;
  let last = 0;
  let out = "";
  for (let m = re.exec(tbl); m; m = re.exec(tbl)) {
    if (m[0] === "<hp:tbl") depth += 1;
    else if (m[0] === "</hp:tbl>") depth -= 1;
    else if (m[0] === "<hp:tc" && depth === 1 && start < 0) start = m.index;
    else if (m[0] === "</hp:tc>" && depth === 1 && start >= 0) {
      out += tbl.slice(last, start) + f(tbl.slice(start, re.lastIndex));
      last = re.lastIndex;
      start = -1;
    }
  }
  return out + tbl.slice(last);
}

/** 칸 XML에서 이 칸의 문단(중첩 표 안 문단 제외)을 f로 바꿈 */
function mapDirectParagraphs(cell: string, f: (p: string, index: number) => string): string {
  const re = /<hp:tbl\b|<\/hp:tbl>|<hp:p\b|<\/hp:p>/g;
  let depth = 0;
  let start = -1;
  let last = 0;
  let index = 0;
  let out = "";
  for (let m = re.exec(cell); m; m = re.exec(cell)) {
    if (m[0] === "<hp:tbl") depth += 1;
    else if (m[0] === "</hp:tbl>") depth -= 1;
    else if (m[0] === "<hp:p" && depth === 0 && start < 0) start = m.index;
    else if (m[0] === "</hp:p>" && depth === 0 && start >= 0) {
      out += cell.slice(last, start) + f(cell.slice(start, re.lastIndex), index++);
      last = re.lastIndex;
      start = -1;
    }
  }
  return out + cell.slice(last);
}

/** 마지막으로 나오는 태그(칸 자신의 cellSz·cellMargin — 중첩 표 칸의 것은 앞에 있음)를 바꿈 */
function replaceLast(xml: string, re: RegExp, to: (m: RegExpMatchArray) => string): string {
  const m = [...xml.matchAll(new RegExp(re.source, "g"))].at(-1);
  return m && m.index !== undefined ? xml.slice(0, m.index) + to(m) + xml.slice(m.index + m[0].length) : xml;
}

function styleParagraph(p: string, c: LCell | null, index: number, cp: CharPrs, pp: ParaPrs): string {
  if (/<hp:tbl\b/.test(p)) return p;
  const run = /<hp:run charPrIDRef="(\d+)"><hp:t>([^<]*)<\/hp:t><\/hp:run>/.exec(p);
  const onlyRun = run && (p.match(/<hp:run\b/g) ?? []).length === 1;
  const text = onlyRun ? unescapeXml(run[2]) : "";
  const id = pp.get(paraFor(c, text));
  let out = p.replace(/^<hp:p\b([^>]*?)paraPrIDRef="\d+"/, (_all, pre: string) => `<hp:p${pre}paraPrIDRef="${id}"`);
  if (!onlyRun || !text) return out;
  const segs = segments(text, c, index).filter((s) => s.t);
  if (segs.length === 1 && !segs[0].v.length) return out;
  const runs = segs.map((s) => `<hp:run charPrIDRef="${variantId(cp, run[1], s.v)}"><hp:t>${escapeXml(s.t)}</hp:t></hp:run>`).join("");
  out = out.replace(run[0], () => runs);
  return out;
}

function styleCell(cell: string, c: LCell | null, cp: CharPrs, pp: ParaPrs): string {
  let out = cell.replace(/(<hp:subList\b[^>]*\svertAlign=")[A-Z]+"/, `$1${c && VCENTER_ROLES.has(c.role) ? "CENTER" : "TOP"}"`);
  if (c && SPACERS.has(c.role)) {
    // 빈 행: 1pt 글·여백 0으로 원본처럼 얇게
    out = out.replace(/^(<hp:tc\b[^>]*?)hasMargin="0"/, '$1hasMargin="1"');
    out = replaceLast(out, /<hp:cellSz width="(\d+)" height="\d+"\/>/, (m) => `<hp:cellSz width="${m[1]}" height="${SPACER_H}"/>`);
    out = replaceLast(out, /<hp:cellMargin\b[^>]*\/>/, () => '<hp:cellMargin left="0" right="0" top="0" bottom="0"/>');
  }
  return mapDirectParagraphs(out, (p, i) => styleParagraph(p, c, i, cp, pp));
}

function styleSection(xml: string, layout: CardLayout, cp: CharPrs, pp: ParaPrs): string {
  let out = xml.replace(/<hp:margin header="\d+" footer="\d+" gutter="\d+" left="\d+" right="\d+" top="\d+" bottom="\d+"\/>/, PAGE_MARGIN);
  const tables = topTables(out);
  for (let i = tables.length - 1; i >= 0; i--) {
    const t = layout.tables[i];
    if (!t) continue;
    const pos = new Map(placeCells(t.rows).placed.map((p) => [`${p.r},${p.c}`, p.cell]));
    const [a, b] = tables[i];
    // 표 자체 테두리는 없음(kordoc 기본은 검정 실선 — 빈 행까지 바깥선이 그려짐)
    const tbl = out.slice(a, b).replace(/^<hp:tbl\b([^>]*?)borderFillIDRef="\d+"/, '<hp:tbl$1borderFillIDRef="1"');
    const styled = mapDirectCells(tbl, (cell) => {
      const tail = cell.slice(cell.lastIndexOf("</hp:subList>"));
      const addr = /<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"\/>/.exec(tail);
      return styleCell(cell, addr ? (pos.get(`${addr[2]},${addr[1]}`) ?? null) : null, cp, pp);
    });
    out = out.slice(0, a) + styled + out.slice(b);
  }
  return out;
}

/** 원본 카드의 본문 자간(대표값 -3%): 한컴 윤고딕 글꼴을 쓰는 글자 모양의 자간을 좁힘(원본은 한 쪽에 들게 줄마다 -1~-18%) */
const SPACING = -3;
export function condenseFaces(header: string, prefix = "한컴 윤고딕", spacing = SPACING): string {
  const hangul = /<hh:fontface lang="HANGUL"[\s\S]*?<\/hh:fontface>/.exec(header)?.[0] ?? "";
  const ids = new Set([...hangul.matchAll(/<hh:font id="(\d+)" face="([^"]+)"/g)].filter((m) => m[2].startsWith(prefix)).map((m) => m[1]));
  if (!ids.size) return header;
  return header.replace(/<hh:charPr\b[\s\S]*?<\/hh:charPr>/g, (x) => {
    const f = /<hh:fontRef hangul="(\d+)"/.exec(x)?.[1];
    return f && ids.has(f) ? x.replace(/<hh:spacing [^>]*\/>/, `<hh:spacing hangul="${spacing}" latin="${spacing}" hanja="${spacing}" japanese="${spacing}" other="${spacing}" symbol="${spacing}" user="${spacing}"/>`) : x;
  });
}

/** kordoc이 프로필로 만든 카드 HWPX → 원본 서식 마무리 + 한컴 정품 패키지 */
export async function finishCardHwpx(input: Uint8Array, layout: CardLayout): Promise<Uint8Array> {
  const files = await readHwpxFiles(input);
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const header = files.get("Contents/header.xml");
  const section = files.get("Contents/section0.xml");
  if (!header || !section) return input;
  const head = normalizeBold(dec.decode(header));
  const cp = new CharPrs(head);
  const pp = new ParaPrs(head);
  files.set("Contents/section0.xml", enc.encode(styleSection(dec.decode(section), layout, cp, pp)));
  files.set("Contents/header.xml", enc.encode(coreFillBrush(condenseFaces(normalizeBold(pp.finish(cp.finish()))))));
  return (await writeHwpxPackage(files)).bytes;
}

/**
 * 칸 채우기(음영)는 OWPML 공통(core) 이름공간의 fillBrush·winBrush — kordoc 프로필 경로가 머리 이름공간(hh:)으로 적어
 * 한글이 칸 음영을 못 읽을 수 있음. 공통 이름공간으로 바로잡음(hc는 header.xml 머리에 선언돼 있음)
 */
export function coreFillBrush(header: string): string {
  return header.replace(/<(\/?)hh:(fillBrush|winBrush|gradation|imgBrush|color)\b/g, "<$1hc:$2");
}

/**
 * 카드 → 9.16 원본 서식 한글(HWPX). 그림 바이트는 images에(opts.imageKey가 표 모델을 만들며 채워도 됨 — 표 모델을 먼저 만듦).
 * 입출력 없는 변환이라 내려받기(export.ts)와 왕복 테스트가 같은 길을 씁니다.
 */
export async function buildCardHwpx(card: LooseJson, opts: WriteOptions = {}, images: Record<string, Uint8Array> = {}): Promise<Uint8Array> {
  const layout = cardLayout(card, opts);
  const raw = await markdownToHwpx(layoutMarkdown(layout), { images, profile: formProfile(layout) });
  return finishCardHwpx(new Uint8Array(raw), layout);
}
