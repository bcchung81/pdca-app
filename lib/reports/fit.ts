// 경평 초안 판면 맞추기(결정론, 순수) — 글 폭과 칸 폭으로 줄 수를 어림하고 블록 높이를 더해 쪽 예산과 견줍니다.
// 칸 폭·여백·글꼴은 lib/reports/section-css.ts(2025 최종본 실측)와 같은 값입니다. CSS를 바꾸면 여기 SLOT·높이 상수도 함께 바꿉니다.
// 쓰임: ① 요청 글의 「판면 예산」(칸마다 한 줄 글자 수·쪽 줄 수) ② 초안 뒤 높이 어림 → 넘치면 경고·맞추기 요청.

import { type Block, FIGURE_GAP_MM, FIGURE_MM, FIGURE_SIZES, type Figure, LOGO_MM, figureMm, isGridTable, isPanelCompare, ladderGroups } from "./blocks.ts";
import { type LayoutBlock, PAIR_GAP_MM, cleanSpan, containerOf, layoutGroups } from "./layout.ts";
import { REPORT_STYLE } from "./section-css.ts";

/** 2025 최종본 판면: 본문 폭 172mm(CSS 170mm), 본문 높이 약 255mm(본문 시작 y≈25mm ~ 쪽번호 위 ≈280mm) */
export const PAGE_MM = { width: 170, height: 255 } as const;
const PT = 25.4 / 72;
const PX = 25.4 / 96;
/** 본문 글: KoPub바탕 10.6pt, 줄 간격 1.52 */
const BODY_PT = 10.6;
export const LINE_MM = BODY_PT * 1.52 * PT;
/** 불릿 들여쓰기 0.95em */
const INDENT_MM = 0.95 * BODY_PT * PT;
/** 사다리 표: 라벨 열 18mm, 칸 안 여백 좌우 3px */
const LADDER_TD_MM = PAGE_MM.width - 18 - 6 * PX;
/** 행 오른쪽 막대 칸(42mm + 사이 2.5mm) */
const ROW_CHART_MM = 42 + 2.5;

// ---------------------------------------------------------------------------
// 글 폭(em) — 화면 실측(2026-09-27, 미리보기 Chrome): 본문 바탕 한글 0.916em·숫자 0.556em·빈칸 0.41em(낱말 간격 포함),
// 돋움 머리글 한글 0.745em(대체 글꼴 + KoPub 기준 자간 −0.12em — 2025 인쇄본 KoPub돋움은 0.874em라 화면보다 넓음)

/**
 * 글자 폭(em, 자간·낱말 간격 포함) — [본문 바탕, 돋움]. 2026-09-27 화면 실측(미리보기 Chrome, .k-frame li·.k-sub):
 * 한글 0.916·0.745는 예전 값 그대로, 비한글은 돋움이 훨씬 좁음(빈칸 0.21·숫자 0.42·「AI」 0.70em — 예전엔 본문 폭을 써서 제목이 한 줄 더 나온다고 어림)
 */
const GLYPH: Array<[RegExp, number, number]> = [
  [/[ \u00a0]/, 0.408, 0.212],
  [/[0-9]/, 0.556, 0.422],
  [/[A-Z]/, 0.619, 0.505],
  [/[a-z]/, 0.41, 0.384],
  [/[.,:;!|]/, 0.335, 0.149],
  [/[’‘']/, 0.144, 0.102],
  [/[()[\]]/, 0.417, 0.23],
  [/[「」“”"]/, 0.622, 0.216],
  [/[･·∙]/, 0.667, 0.282],
  [/%/, 0.674, 0.758],
  [/[~∼]/, 0.568, 0.528],
  [/[-/]/, 0.417, 0.25],
];

function charEm(ch: string, dotum: boolean): number {
  const c = ch.codePointAt(0) ?? 0;
  if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3131 && c <= 0x318e) || (c >= 0x4e00 && c <= 0x9fff)) return dotum ? 0.745 : 0.916;
  for (const [re, body, dot] of GLYPH) if (re.test(ch)) return dotum ? dot : body;
  return dotum ? 0.745 : 0.916; // → ▶ ↑ ① ✚ 등(한글 폭과 같음)
}

/** 위첨자 표기 ^{…}(추진성과 전후 비교 — ^{’24년}100국 → ^{’25년}200국): 6.1pt라 본문 10.6pt 글자의 0.58배 폭 */
export const SUP_RE = /\^\{([^{}]{1,20})\}/g;
const SUP_SCALE = 6.1 / 10.6;

/** 강조 표시(**…**)·위첨자 표기(^{…})를 뺀 글 */
export const plainText = (s: string) => s.replace(/\*\*/g, "").replace(SUP_RE, "$1");

/**
 * 글 폭(em). 강조(**…**)는 명조 본문 안에서 굵은 돋움으로 그려져(section-css .k-frame li b) 돋움 폭으로 셈 —
 * 2026-09-27 화면 실측: 「건당 25분」을 강조하면 한 줄이 약 1em 좁아짐(바탕 폭으로 세면 Q&A 답이 한 줄 더 나온다고 어림)
 */
export function textEm(s: string, dotum = false): number {
  let n = 0;
  s.split("**").forEach((part, i) => {
    const bold = dotum || (i % 2 === 1 && s.split("**").length > 2);
    for (const m of part.matchAll(SUP_RE)) for (const ch of m[1]) n += charEm(ch, bold) * SUP_SCALE;
    for (const ch of part.replace(SUP_RE, "")) n += charEm(ch, bold);
  });
  return n;
}

/** 글 → 줄 수: 띄어쓰기 단위로 넘김(word-break: keep-all), 한 낱말이 줄보다 길면 글자 단위로 나눔 */
export function lineCount(s: string, widthMm: number, pt = BODY_PT, dotum = false): number {
  return lineLayout(s, widthMm, pt, dotum).lines;
}

/** 줄 수와 마지막 줄 채움 비율(0~1) */
export function lineLayout(s: string, widthMm: number, pt = BODY_PT, dotum = false): { lines: number; last: number } {
  // 위첨자는 폭을 줄여 셈(textEm) — 위첨자 안 빈칸은 줄을 넘기지 않게 붙임. 강조 표시는 낱말마다 다시 싸서 돋움 폭으로 셈
  const t = s.replace(SUP_RE, (m) => m.replace(/\s/g, "\u00a0")).replace(/\*\*([^*]+?)\*\*/g, (_, x: string) => x.split(/[ \t\n]+/).map((w) => `**${w}**`).join(" ")).trim();
  if (!plainText(t).trim()) return { lines: 0, last: 0 };
  const cap = widthMm / (pt * PT); // 줄 폭(em)
  let lines = 1;
  let used = 0;
  for (const w of t.split(/[ \t\n]+/)) {
    const we = textEm(w, dotum);
    const need = used ? used + charEm(" ", dotum) + we : we;
    if (need <= cap) {
      used = need;
      continue;
    }
    if (used) lines += 1;
    if (we > cap) {
      lines += Math.ceil(we / cap) - 1;
      used = we % cap;
    } else used = we;
  }
  return { lines, last: Math.min(1, used / cap) };
}

/**
 * 자간 맞춤: 한글 편집 관행대로 1~2글자 넘침은 문단 자간을 줄여 한 줄 덜 씀(fit-dom.ts가 화면에서 −0.06em까지 — 한글 0.916em의 약 6.5%).
 * 줄을 하나 줄일 수 있으면 그 줄 배치를, 아니면 그대로
 */
export const SQUEEZE = 0.065;
export function fitLayout(s: string, widthMm: number, pt = BODY_PT, dotum = false): { lines: number; last: number; squeezed: boolean } {
  const base = lineLayout(s, widthMm, pt, dotum);
  if (base.lines < 2) return { ...base, squeezed: false };
  const tight = lineLayout(s, widthMm * (1 + SQUEEZE), pt, dotum);
  return tight.lines < base.lines ? { ...tight, squeezed: true } : { ...base, squeezed: false };
}

/** 줄 폭에 들어가는 한글 글자 수(요청 글 안내용 — 한글 기준, 빈칸·숫자는 더 좁음) */
export const hangulPerLine = (widthMm: number, pt = BODY_PT, dotum = false) => Math.floor(widthMm / (pt * PT) / (dotum ? 0.745 : 0.916));

// ---------------------------------------------------------------------------
// 칸 폭(mm): 블록 종류·모양·칸 수·놓인 자리(사다리 칸 / 전폭 / 막대 옆)마다

export interface Slot {
  /** 칸 글(불릿) 한 줄 폭 */
  body: number;
  /** 칸 머리(돋움) 한 줄 폭 */
  head: number;
  /** 결과 줄(note) 한 줄 폭 */
  note: number;
}

/** Q&A 상자의 Q·A 표지 칸(section-css .k-qa grid 첫 열) */
export const QA_MARK_MM = 6;
/** VS 칸 사이(section-css .k-cards--vs 가운데 열) */
const QA_VS_MM = 9;
/** 수치 표 행 머리 열 폭(section-html tableHtml colgroup과 같은 값) */
export const tableRowHeadMm = (width: number) => Math.max(18, Math.min(34, width * 0.22));
/**
 * 표 모양(2026-10-12, section-html·section-css와 같은 값): 추진실적 열 표의 오른쪽 결과 칸 폭 · 막대 표의 막대 칸(막대 14mm + 사이 1.5mm) ·
 * 2단 라벨 표의 큰 라벨 열·하위 라벨 열 · 쉐브론 머리의 화살표 안 여백(좌우 합)
 */
export const TABLE_SHAPE_MM = { result: 36, bar: 14, barGap: 1.5, ladderBig: 24, ladderSub: 30, chevronPad: 7 } as const;
/** 추진실적 열 표의 왼쪽 행 머리 열(행 머리가 하나라도 있을 때) */
export const resultRowHeadMm = (width: number) => tableRowHeadMm(width - TABLE_SHAPE_MM.result);

/**
 * 블록이 놓이는 폭: 라벨 있는 사다리 칸 150mm, 전폭 170mm(전폭 종류·라벨 없음·배치 전폭·단 띠), 막대가 붙은 행은 막대 칸만큼 좁음,
 * 가로 반씩(span half)은 그 그릇 폭에서 사이 4mm를 뺀 절반 — 짝이 있다고 보고 셈(짝 없는 half는 렌더러·어림이 그릇 폭 전부로 그림 — blockRooms)
 */
export function blockWidth(b: LayoutBlock, withChart = false): number {
  const base = containerOf(b) === "row" ? LADDER_TD_MM : PAGE_MM.width;
  const w = withChart ? base - ROW_CHART_MM : base;
  return cleanSpan(b.kind, b.span) ? (w - PAIR_GAP_MM) / 2 : w;
}

/** 짝 없이 혼자 놓인 블록의 폭(span을 무시 — 짝이 없는 half는 그릇 폭 전부) */
export const soloWidth = (b: LayoutBlock, withChart = false) => blockWidth(b.span === undefined ? b : { kind: b.kind, label: b.label, layout: b.layout }, withChart);

/** 전략체계도 왼쪽 층 이름 열 폭(section-css .k-strat th) */
export const STRAT_TIER_MM = 16;
/** 칸 사이 기호 칸 — 카드 묶음 ✚·▶·시기 흐름 ▶·PDCA ▶(section-css·section-html·section-hwpx와 같은 REPORT_STYLE.join.gapMm) */
const JOIN_GAP_MM = REPORT_STYLE.join.gapMm;
/** 좁은 칸 본문 안 여백 좌우 합 — 카드·PDCA 칸(.k-card__b)·단계(.k-proc__b)·시기(.k-tl__b) 본문(REPORT_STYLE.boxPadX) */
const BOX_PAD_MM = 2 * REPORT_STYLE.boxPadX * PX;
/** PDCA 칸 머리의 단계 표지 원(section-css .k-pdca__m — 지름 4.6mm + 사이 1.4mm) */
const PDCA_MARK_MM = 6;

export function slotOf(b: Pick<Block, "kind" | "variant" | "cells"> & Partial<Pick<Block, "items">>, width: number): Slot {
  const n = Math.max(1, b.cells.length);
  const pad = (px: number) => px * PX;
  switch (b.kind) {
    case "strategy": {
      // 표 열: (폭 − 층 이름 열) ÷ 열 수, 칸 안 여백 좌우 3px
      const col = (width - (b.items?.length ? STRAT_TIER_MM : 0)) / n;
      return { body: col - pad(6) - INDENT_MM, head: col - pad(6), note: col - pad(6) };
    }
    case "pdca": {
      const cell = (width - JOIN_GAP_MM * 3) / 4;
      return { body: cell - BOX_PAD_MM - INDENT_MM, head: cell - pad(8) - PDCA_MARK_MM, note: cell - pad(8) };
    }
    case "cards": {
      const cols = Math.min(4, n);
      // 칸 사이: ✚·▶ JOIN_GAP_MM, VS 원 9mm(두 칸), 그 밖 3mm
      const gaps = b.variant === "vs" ? QA_VS_MM : b.variant === "plus" || b.variant === "arrow" ? JOIN_GAP_MM * (cols - 1) : 3 * (cols - 1);
      const cell = (width - gaps) / cols;
      return { body: cell - BOX_PAD_MM - INDENT_MM, head: cell - pad(8), note: cell - pad(8) };
    }
    case "steps": {
      if (b.variant === "zigzag") {
        const cell = (width - 7 - pad(6)) / 2;
        return { body: cell - pad(8) - INDENT_MM, head: cell - 12, note: cell - pad(8) };
      }
      const cell = width / n;
      return { body: cell - BOX_PAD_MM - INDENT_MM, head: cell - pad(12) - 5, note: cell - pad(6) };
    }
    case "timeline": {
      if (b.variant === "dots") {
        const cell = width / n - pad(6);
        return { body: cell, head: cell, note: cell - pad(16) };
      }
      // 결과 줄(note)도 본문 칸(.k-tl__b) 안
      const cell = (width - JOIN_GAP_MM * (n - 1)) / n;
      return { body: cell - BOX_PAD_MM - INDENT_MM, head: cell, note: cell - BOX_PAD_MM };
    }
    case "compare":
      if (isPanelCompare(b)) {
        const cell = (width - 8) / 2;
        return { body: cell - pad(10) - INDENT_MM - 5, head: cell - pad(8), note: cell };
      }
      return { body: width * 0.39 - pad(10) - INDENT_MM, head: width * 0.15 - pad(10), note: width * 0.4 - pad(10) - INDENT_MM - 1.2 };
    case "hub": {
      if (n - 1 === 2) {
        const unit = (width - 18) / 3.2;
        return { body: unit * 1.2 - pad(10) - INDENT_MM, head: unit - pad(18), note: unit - pad(10) };
      }
      const center = ((width - 9) * 0.9) / 2.5;
      const list = ((width - 9) * 1.6) / 2.5;
      return { body: center - pad(10) - INDENT_MM, head: list * 0.3 - pad(8), note: list * 0.7 - pad(8) - INDENT_MM };
    }
    case "voices": {
      const cols = Math.min(2, n);
      const cell = (width - 4 * (cols - 1)) / cols - 15 - 3 - pad(12);
      return { body: cell, head: cell, note: cell };
    }
    case "quotes": {
      const cell = n > 1 ? (width - 6) / 2 : width;
      return { body: cell - pad(10) - INDENT_MM, head: cell - pad(8), note: cell };
    }
    case "band":
      return { body: width - 18 - 2 - 4, head: 18, note: width };
    case "stats": {
      const cell = (width - 3 * (n - 1)) / n - pad(8);
      return { body: cell, head: cell, note: cell };
    }
    case "define":
    case "case":
      return { body: width - pad(12) - INDENT_MM, head: width - 30, note: width };
    case "qa":
      // Q&A 상자: 테두리·안 여백 12px, 왼쪽 Q·A 표지 칸(QA_MARK_MM) — 질문은 돋움 굵게, 답은 불릿
      return { body: width - pad(12) - QA_MARK_MM - INDENT_MM, head: width - pad(12) - QA_MARK_MM, note: width };
    case "table": {
      // 추진실적 열 표: 오른쪽 결과 칸(36mm) + 왼쪽 행 머리 열(행 머리가 있을 때) + 추진내용 불릿 칸 — body = 불릿, head = 행 머리, note = 결과 칸
      if (b.variant === "result") {
        const rowHead = b.cells.some((c) => c.head) ? resultRowHeadMm(width) : 0;
        return { body: width - TABLE_SHAPE_MM.result - rowHead - pad(8) - INDENT_MM, head: rowHead - pad(8), note: TABLE_SHAPE_MM.result - pad(8) };
      }
      // 2단 라벨 표: 큰 라벨 열 + 하위 라벨 열(tag가 있을 때) + 내용 불릿 칸 — body = 불릿, head = 큰 라벨, note = 하위 라벨
      if (b.variant === "ladder") {
        const sub = b.cells.some((c) => c.tag) ? TABLE_SHAPE_MM.ladderSub : 0;
        return { body: width - TABLE_SHAPE_MM.ladderBig - sub - pad(8) - INDENT_MM, head: TABLE_SHAPE_MM.ladderBig - pad(8), note: sub - pad(8) };
      }
      // 수치 표: 행 머리 열(폭의 22%, 18~34mm) + 값 열(나머지를 똑같이) — 칸 안 여백 좌우 4px. 막대 표는 값 옆 막대 칸만큼 글이 좁고, 쉐브론 머리는 화살표 안 여백만큼 머리 글이 좁음
      const cols = Math.max(1, b.cells[0]?.bullets.length ?? 2);
      const rowHead = tableRowHeadMm(width);
      const cell = (width - rowHead) / cols;
      if (b.variant === "bars") return { body: cell - pad(8) - TABLE_SHAPE_MM.bar - TABLE_SHAPE_MM.barGap, head: cell - pad(8), note: rowHead - pad(8) };
      if (b.variant === "chevron") return { body: cell - pad(8), head: cell - TABLE_SHAPE_MM.chevronPad, note: rowHead - pad(8) };
      return { body: cell - pad(8), head: cell - pad(8), note: rowHead - pad(8) };
    }
    default:
      return { body: width - INDENT_MM, head: width, note: width };
  }
}

// ---------------------------------------------------------------------------
// 높이(mm) 어림

const HEAD_MM = 10.6 * 1.5 * PT; // 돋움 10.6pt/1.5
const HEAD11_MM = 11 * 1.5 * PT;
// 칸 글(본문)은 자간 맞춤을 반영한 줄 수로 셈(화면과 같게)
const lines = (xs: string[], w: number, pt = BODY_PT, dotum = false) => xs.reduce((s, x) => s + (dotum || pt !== BODY_PT ? lineCount(x, w, pt, dotum) : fitLayout(x, w).lines), 0);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);

/** 인용 한 칸의 줄 수: 인용 글(본문 크기, 자간 맞춤) 뒤에 출처(9.5pt 작은 글)가 이어 붙음 */
function quoteLines(c: Block["cells"][number], w: number): number {
  const q = fitLayout(`“${c.bullets[0] ?? ""}”`, w);
  if (!c.note) return q.lines;
  const noteMm = textEm(`(${c.note})`) * 9.5 * PT;
  // 자간 맞춤(fit-dom fitTextLines)은 출처까지 한 칸 글로 줄이므로, 줄마다 SQUEEZE만큼 더 들어감
  const room = (1 - q.last) * w + SQUEEZE * w * q.lines;
  return q.lines + (noteMm > room ? Math.ceil((noteMm - room) / w) : 0);
}

/** 정의 상자 칩 줄(9.5pt 돋움 칩 + 칩 사이 화살표, 넘치면 다음 줄 — CSS flex-wrap): 줄 수만큼 높이 */
function chipRowsMm(items: string[], w: number): number {
  if (!items.length) return 0;
  const chip = (x: string) => Math.min(w, textEm(x, true) * 9.5 * PT + 12 * PX + 0.3);
  let rows = 1;
  let used = 0;
  let extra = 0;
  items.forEach((x, i) => {
    const cw = chip(x);
    // 칩 하나가 줄보다 길면 칩 안에서 줄바꿈
    if (cw >= w) extra += (lineCount(x, w - 12 * PX, 9.5, true) - 1) * 9.5 * 1.5 * PT;
    const need = (i ? 1.6 + 3.4 + 1.6 : 0) + cw;
    if (used && used + need > w) {
      rows += 1;
      used = cw;
    } else used += need;
  });
  return rows * (9.5 * 1.5 * PT + 0.3) + (rows - 1) * 1.6 + extra + 0.8;
}

/** 블록 하나의 높이(mm) — width는 blockWidth(막대가 붙은 행이면 좁은 폭), centerExtra는 협업 가운데 칸에 더할 높이(로고 묶음) */
export function blockHeight(b: Block, width: number, centerExtra = 0): number {
  const s = slotOf(b, width);
  const L = LINE_MM;
  const cellBody = (c: Block["cells"][number]) => lines(c.bullets, s.body) * L;
  // 단계 흐름은 렌더러처럼 칸 제목·칩의 「Step N」·「N단계」를 뗀 글로 셈(번호 칩이 차례를 보임)
  // 연도 흐름(chevron)은 렌더러가 칸 머리에 head만 씀(tag는 안 그림 — 2026-09-27 행별 실측)
  const headText = (c: Block["cells"][number]) => (b.kind === "steps" ? [c.tag.replace(/^(Step\s?\d+|\d단계)$/, ""), c.head.replace(/^(Step\s?\d+|\d단계)\s*/, "")] : b.kind === "timeline" ? [c.head] : [c.tag, c.head]).filter(Boolean).join(" ");
  const heads = (pt = 10.6) => max(b.cells.map((c) => lineCount(headText(c), s.head, pt, true))) * (pt === 11 ? HEAD11_MM : HEAD_MM);
  const notes = max(b.cells.map((c) => lineCount(c.note, s.note))) * L;
  switch (b.kind) {
    case "bullets":
      return (b.title ? HEAD_MM + 1 : 0) + lines(b.items, s.body) * L + 0.5;
    case "cards":
      return (b.title ? HEAD_MM + 1 : 0) + heads() + max(b.cells.map(cellBody)) + (notes ? notes + 0.6 : 0) + 1.9;
    case "steps":
      if (b.variant === "zigzag") {
        const row = (cs: Block["cells"]) => max(cs.map((c) => lineCount(c.head, s.head, 10.6, true))) * HEAD_MM + max(cs.map((c) => lines(c.bullets, s.body) * L + (c.note ? lineCount(c.note, s.note) * L + 0.8 : 0))) + 1.2;
        // ㄹ자: 위 줄 = 1·4단계, 아래 줄 = 2·3단계
        return row([b.cells[0], b.cells[3]].filter(Boolean)) + row([b.cells[1], b.cells[2]].filter(Boolean)) + 5 + 2.4;
      }
      return (b.title ? HEAD_MM + 1 : 0) + heads(11) + max(b.cells.map(cellBody)) + (notes ? notes + 0.8 : 0) + 2.6;
    case "timeline":
      // 연혁 점 칸 글은 문단 p(자간 맞춤 없음)
      if (b.variant === "dots") return 4.6 + 5.6 + max(b.cells.map((c) => c.bullets.reduce((n, x) => n + lineCount(x, s.body), 0) * L + (c.note ? 5.2 : 0))) + 2.6;
      return (b.title ? HEAD_MM + 1 : 0) + heads(11) + max(b.cells.map((c) => cellBody(c) + (c.note ? lineCount(c.note, s.note) * L + 0.3 : 0))) + 1.8;
    case "compare":
      if (isPanelCompare(b)) {
        // 그림(section-html): 왼쪽 = As-Is 패널 안·오른쪽 = To-Be 패널 안(그 패널 글 폭만 그림 폭 + 사이 2mm + 오른쪽 여백 2mm 줄어듦), 가운데 = 두 패널 사이 칸(그림 폭 + 4mm)
        const figs = b.figures ?? [];
        const center = figs.find((f) => f.pos === "center");
        const inside = (to: boolean) => figs.filter((f) => f.pos === (to ? "right" : "left"));
        const side = (to: boolean) =>
          Math.max(
            max([lineCount(b.items[to ? 1 : 0] ?? "", s.head, 10.6, true), 1]) * HEAD_MM + b.rows.reduce((n, r) => n + lineCount(panelRowText(r, to), panelTextMm(b, s, to)) * L, 0) + 1.6,
            ...inside(to).map((f) => HEAD_MM + figureBoxMm(f) + 1.2),
          );
        return (b.title ? HEAD_MM + 1 : 0) + Math.max(side(false), side(true), 18, center ? figureBoxMm(center) + 1 : 0) + 1;
      }
      // 기존→개선 화살표 칸(세로 24mm)이 표 몸통의 최소 높이
      // 표 테두리·머리 행 여백: 행별 실측(2026-09-27, 32행)이 평균 1.8mm 커서 끝 여백 1 → 2.6mm
      return (b.title ? HEAD_MM + 1 : 0) + HEAD11_MM + Math.max(24.5, b.rows.reduce((n, r) => n + Math.max(lineCount(r.key, s.head, 11, true) * HEAD11_MM, lines(r.before, s.body) * L, lines(r.after, s.note) * L) + 1.1, 0)) + 2.6;
    case "hub": {
      const [center, ...nodes] = b.cells;
      if (!center) return 0;
      const t = b.title ? HEAD_MM + 1 : 0;
      if (nodes.length === 2) return t + max([HEAD_MM + lines(center.bullets, s.body) * L + centerExtra, ...nodes.map((c) => HEAD_MM + lineCount(c.bullets.join(" / "), s.note) * L + 1.3)]) + 1.2;
      const list = nodes.reduce((n, c) => n + Math.max(lineCount(c.head, s.head, 10.2, true) * 5, lines(c.bullets, s.note) * L) + 0.6, 0);
      return t + Math.max(HEAD_MM + lines(center.bullets, s.body) * L + 1 + centerExtra, list) + 1.2;
    }
    case "voices": {
      const cols = Math.min(2, b.cells.length);
      const rowsN = Math.ceil(b.cells.length / cols);
      return (b.title ? HEAD_MM + 1 : 0) + rowsN * Math.max(15, max(b.cells.map((c) => lineCount(`“${c.bullets[0] ?? ""}”`, s.body) * L + 1.2))) + (rowsN - 1) * 4 + 1.6;
    }
    case "quotes":
      return max(b.cells.map((c) => HEAD_MM + 0.3 + quoteLines(c, s.body) * L)) + 0.8;
    case "define":
      return HEAD_MM + (b.text ? lineCount(b.text, s.body + INDENT_MM) * L : 0) + chipRowsMm(b.items, s.body + INDENT_MM) + 2.1;
    case "band":
      return Math.max(1, lineCount(`▶ ${b.text} ◀`, s.body, 10.6, true)) * 10.6 * 1.6 * PT + 1.3;
    case "banner":
      return lineCount(b.text, width - 6, 12.8, true) * 12.8 * 1.45 * PT + 3.2;
    case "subhead":
      return lineCount(b.text, width, 12, true) * 12 * 1.4 * PT + 2.4;
    case "case":
      return HEAD11_MM + lines(b.items, s.body) * L + 2.6;
    case "chart":
      return CHART_MM;
    case "qa":
      // 쌍마다 질문 줄(돋움 굵게) + 답(하나면 불릿 점·들여쓰기 없음), 쌍 사이 0.8mm, 상자 테두리·여백 1.6mm
      return (b.title ? HEAD_MM + 1 : 0) + b.cells.reduce((n, c) => n + lineCount(c.head, s.head, 10.6, true) * HEAD_MM + lines(c.bullets, qaAnswerWidth(c, s)) * L + 0.8, 0) + 1.6;
    case "table": {
      // 머리 줄(맑은 고딕 10.4pt/1.45) + 행마다 가장 긴 칸(행 머리는 돋움 10.4pt, 값은 본문) + 칸 여백 2px, 위 굵은 선·아래 선 1.2mm
      const TH = 10.4 * 1.45 * PT;
      const t = b.title ? HEAD_MM + 1 : 0;
      if (b.variant === "result") {
        // 왼쪽 행(행 머리 돋움 · 추진내용 불릿) 합 vs 오른쪽 결과 칸(머리 「추진실적」 9.5pt + 큰 수치 15pt·뜻 9.5pt 묶음 + 결과 줄 9.5pt) 중 큰 것
        const left = b.cells.reduce((n, c) => n + Math.max(c.head ? lineCount(c.head, s.head, 10.4, true) * TH : 0, lines(c.bullets, s.body) * L) + 2 * PX, 0);
        const small = 9.5 * 1.4 * PT;
        const right = small + 1 + b.series.reduce((n, x) => n + lineCount(x.value, s.note, 15, true) * 15 * 1.3 * PT + lineCount(x.label, s.note, 9.5, true) * small + 0.6, 0) + (b.text ? lineCount(b.text, s.note, 9.5, true) * small + 0.6 : 0) + 4 * PX;
        return t + Math.max(left, right) + 1.2;
      }
      if (b.variant === "ladder") {
        // 큰 라벨 묶음마다: 행(하위 라벨 돋움 · 내용 불릿) 합과 큰 라벨 줄 중 큰 것
        return t + ladderGroups(b.cells).reduce((n, g) => {
          const rows = b.cells.slice(g.start, g.start + g.rows).reduce((m, c) => m + Math.max(c.tag ? lineCount(c.tag, s.note, 10.4, true) * TH : 0, lines(c.bullets, s.body) * L) + 2 * PX, 0);
          return n + Math.max(rows, lineCount(g.head, s.head, 10.4, true) * TH + 2 * PX);
        }, 0) + 1.2;
      }
      // 쉐브론 머리: 화살표 칸 위아래 여백 1px씩 더(section-css .k-chev)
      const head = max([lineCount(b.items[0] ?? "", s.note, 10.4, true), ...b.items.slice(1).map((x) => lineCount(x, s.head, 10.4, true))]) * TH + 2 * PX + (b.variant === "chevron" ? 2 * PX : 0);
      const body = b.cells.reduce((n, c) => n + Math.max(lineCount(c.head, s.note, 10.4, true) * TH, max(c.bullets.map((x) => lineCount(x, s.body) * L))) + 2 * PX, 0);
      return (b.title ? HEAD_MM + 1 : 0) + head + body + 1.2;
    }
    case "strategy": {
      // 표 행마다 칸 안 여백 위아래 2px + 테두리: 목표 띠(돋움 굵게, 있을 때) · 열 머리(돋움 굵게) · 과제(본문 불릿) · 지표(9.5pt 돋움, 있을 때) — 층 이름 칸(9.5pt 돋움)이 더 길면 그 높이
      const ROW = 4 * PX + 0.3;
      const tierW = STRAT_TIER_MM - 4 * PX;
      const tier = (i: number) => (b.items[i] ? lineCount(b.items[i], tierW, 9.5, true) * 9.5 * 1.3 * PT : 0);
      const cols = width - (b.items.length ? STRAT_TIER_MM : 0);
      const top = b.text ? Math.max(lineCount(b.text, cols - 8 * PX, 10.6, true) * HEAD_MM, tier(0)) + ROW : 0;
      const head = Math.max(max(b.cells.map((c) => lineCount([c.tag, c.head].filter(Boolean).join(" "), s.head, 10.6, true))) * HEAD_MM, tier(b.text ? 1 : 0)) + ROW;
      const body = Math.max(max(b.cells.map((c) => lines(c.bullets, s.body))) * L, tier(b.text ? 2 : 1)) + ROW;
      const hasNote = b.cells.some((c) => c.note);
      const foot = hasNote ? Math.max(max(b.cells.map((c) => lineCount(c.note, s.note, 9.5, true))) * 9.5 * 1.45 * PT, tier(b.text ? 3 : 2)) + ROW : 0;
      return (b.title ? HEAD_MM + 1 : 0) + top + head + body + foot + 0.8;
    }
    case "pdca": {
      // 4칸(머리 = 단계 표지 원 + 단계 이름, 몸통 = 불릿, 꼬리 = 결과 줄) + 환류 띠(9.5pt 돋움, 있을 때)
      const heads4 = max(b.cells.map((c) => lineCount(c.head, s.head, 10.6, true))) * HEAD_MM;
      const fb = b.text ? lineCount(`↺ ${b.text}`, width - 12 * PX, 9.5, true) * 9.5 * 1.45 * PT + 4 * PX + 1.2 : 0;
      return (b.title ? HEAD_MM + 1 : 0) + heads4 + max(b.cells.map(cellBody)) + (notes ? notes + 0.6 : 0) + 1.9 + fb;
    }
    case "stats":
    {
      // 수치 칸(설명은 문단 p라 자간 맞춤 없음 — 줄 수는 lineCount): 큰 수치 15pt, 자리표시(【확인: …】)는 10.5pt 노란 칸(section-css .k-stat__v .k-need), 출처 줄은 9.5pt/1.4 — 두 줄로 넘기도 함(2026-09-27 행별 실측)
      const value = (h: string) => (/【확인:/.test(h) ? lineCount(h.replace(/【확인:\s*([^】]*)】/g, "$1"), s.head - 8 * PX, 10.5, true) * 10.5 * 1.35 * PT + 1.3 : lineCount(h, s.head, 15, true) * 15 * 1.3 * PT);
      const note = (n: string) => (n ? lineCount(n, s.note, 9.5, true) * 9.5 * 1.4 * PT + 0.3 : 0);
      return (b.title ? HEAD_MM + 1 : 0) + max(b.cells.map((c) => (c.tag ? 4.6 : 0) + value(c.head) + lineCount(c.bullets[0] ?? "", s.body) * L + note(c.note))) + 2.6;
    }
  }
}

/**
 * 전후 비교 패널 한쪽 글 폭(section-css): 패널 칸 − 테두리 − 목록 안 여백 10px − 번호 자리 1.3em(− 그림 + 사이 2mm + 오른쪽 여백 2mm).
 * 가운데 그림이 있으면 두 패널이 (그림 폭 + 4mm − 8mm)의 절반씩 좁아짐. to = 오른쪽(개선) 패널
 */
function panelTextMm(b: Block, s: Slot, to: boolean): number {
  const figs = b.figures ?? [];
  const center = figs.find((f) => f.pos === "center");
  const shrink = center ? (figureMm(center).w + 4 - 8) / 2 : 0;
  const inside = figs.filter((f) => f.pos === (to ? "right" : "left"));
  return Math.max(20, s.head + 8 * PX - 0.3 - 10 * PX - 1.3 * BODY_PT * PT - shrink - inside.reduce((n, f) => n + figureMm(f).w + 2, 0) - (inside.length ? 2 : 0));
}

/** 전후 비교 패널의 한 줄 글(구분 칩(r.key)은 글 앞에 붙은 글자로 셈) */
const panelRowText = (r: Block["rows"][number], to: boolean) => `${r.key ? `${r.key} ` : ""}${(to ? r.after : r.before).join(" / ")}`;

/** Q&A 답 한 줄 폭: 답이 하나면 불릿 들여쓰기가 없음(section-css .k-qa dd li:only-child) */
const qaAnswerWidth = (c: Block["cells"][number], s: Slot) => (c.bullets.length === 1 ? s.body + INDENT_MM : s.body);

/** 협업 구조 가운데 칸 안에 들어가는 그림(로고 묶음) — 폭이 아니라 높이를 더함 */
const insideHub = (b: Block, f: Figure) => b.kind === "hub" && f.pos === "center";

/**
 * 그림 칸의 실제 높이(section-html figHtml: 등급 높이 이상, 1.6배까지): 종류 칩 + 서술 줄(7.8pt, 로고 7pt — 칸 폭에서 안 여백을 뺀 폭)이
 * 등급 높이보다 길면 늘어남. 2026-09-27 행별 실측(M 라운드): S(20mm) 칸의 25자 서술이 4줄이 되어 칸이 15mm → 약 20mm
 */
export function figureBoxMm(f: Figure): number {
  const { w, h } = figureMm(f);
  const logo = f.kind === "logo";
  const pt = logo ? 7 : 7.8;
  const inner = w - (logo ? 4 : 6) * PX - 2 * PX;
  const content = 7.5 * 1.25 * PT + PX + lineCount(f.desc, inner, pt) * pt * 1.3 * PT + (logo ? 2 : 4) * PX + 2 * PX;
  return Math.min(Math.round(h * 1.6), Math.max(h, content));
}

/** 그림 자리표시가 차지하는 폭(그림 폭 + 간격의 합, 협업 가운데 로고 제외) */
export const figuresWidth = (b: Block) => (b.figures ?? []).filter((f) => !insideHub(b, f)).reduce((n, f) => n + figureMm(f).w + FIGURE_GAP_MM, 0);

/** 그림 자리표시가 붙은 블록 높이: 글 폭은 그림 폭 + 간격만큼 좁고, 높이는 그림 높이 이상(2025: 그림은 옆 글 상자 높이에 맞춰 놓임). 협업 가운데 로고는 로고 줄 높이를 더함 */
export function blockHeightWithFigures(b: Block, width: number): number {
  const figs = b.figures ?? [];
  if (!figs.length) return blockHeight(b, width);
  if (isPanelCompare(b)) return blockHeight(b, width);
  const side = figs.filter((f) => !insideHub(b, f));
  const logos = figs.length - side.length ? LOGO_MM.h + 2 : 0;
  // 그림이 행 높이를 정할 때: 사다리 행 여백만 더해짐(2026-09-27 K·L·M 행별 실측 19행 — 예전 「그림 높이 + 1mm」는 한결같이 1.3mm 큼)
  return Math.max(blockHeight(b, Math.max(40, width - figuresWidth(b)), logos), ...side.map((f) => figureBoxMm(f) - 0.3));
}

/** 블록마다 놓이는 폭(mm) — fitReport·렌더러와 같은 묶음(lib/reports/layout.ts layoutGroups: 라벨 행·막대가 붙은 행·전폭·단 띠·가로 반씩 짝). at = 경영관리 절 열쇠 */
export function blockRooms(blocks: LayoutBlock[], at?: string[]): number[] {
  const out: number[] = new Array(blocks.length).fill(0);
  for (const g of layoutGroups(blocks, at)) {
    // 막대가 붙은 행(짝 없는 블록만 둘 이상이고 마지막이 막대) — 예전과 같은 규칙
    const side = g.type === "row" && g.units.length > 1 && g.units.every((u) => u.length === 1) && blocks[g.units.at(-1)![0]].kind === "chart";
    for (const u of g.units) for (const k of u) out[k] = u.length === 2 ? blockWidth(blocks[k]) : soloWidth(blocks[k], side);
  }
  return out;
}

/** 그림 옆에 남아야 하는 글 폭(mm): 블록 옆 = 놓인 폭의 55%와 70mm 중 큰 것, 전후 비교 패널 한쪽 = 40mm, 우수사례 = 100mm */
export const FIGURE_TEXT_MIN = { side: 70, sideShare: 0.55, panel: 40, case: 100 } as const;

/**
 * 그림 자리 판면 지킴이(결정론 — 검증에서 부름): 그림을 넣고 남는 글 폭이 모자라면 그 그림을 S로 줄이고, 그래도 모자라면 뺌.
 * 평가 시험(2026-09-27): 막대가 붙은 좁은 행의 전후 비교 패널 안에 M 그림 둘을 넣자 패널 글 칸이 약 14mm가 되어 판면 376mm(0.5쪽 예산 127.5mm)
 */
export function guardFigures(blocks: Block[], at?: string[]): string[] {
  const warnings: string[] = [];
  const rooms = blockRooms(blocks, at);
  blocks.forEach((b, i) => {
    const room = rooms[i];
    const figs = b.figures ?? [];
    if (!figs.length) return;
    const textLeft = (fs: Figure[]): number => {
      if (isPanelCompare(b)) {
        const center = fs.find((f) => f.pos === "center");
        const half = (room - (center ? figureMm(center).w + 4 : 8)) / 2;
        return Math.min(...(["left", "right"] as const).map((pos) => half - fs.filter((f) => f.pos === pos).reduce((n, f) => n + figureMm(f).w + 2, 0)));
      }
      return room - fs.filter((f) => !insideHub(b, f)).reduce((n, f) => n + figureMm(f).w + FIGURE_GAP_MM, 0);
    };
    const need = isPanelCompare(b) ? FIGURE_TEXT_MIN.panel : b.kind === "case" ? FIGURE_TEXT_MIN.case : Math.max(FIGURE_TEXT_MIN.side, room * FIGURE_TEXT_MIN.sideShare);
    let fs = figs.map((f) => ({ ...f }));
    // 큰 것부터 S로 줄이고(지도·로고 제외), 그래도 모자라면 뒤에서부터 뺌
    for (const f of [...fs].sort((a, c) => figureMm(c).w - figureMm(a).w)) {
      if (textLeft(fs) >= need) break;
      if (f.kind !== "logo" && f.kind !== "map" && f.size !== "S") f.size = "S";
    }
    let dropped = 0;
    while (fs.length && textLeft(fs) < need) {
      fs = fs.slice(0, -1);
      dropped += 1;
    }
    const shrunk = fs.filter((f, k) => f.size !== figs[k].size).length;
    if (shrunk) warnings.push(`그림: ${b.label || b.kind} 옆 글 폭이 모자라 그림 ${shrunk}개를 작게(S) 줄였습니다.`);
    if (dropped) warnings.push(`그림: ${b.label || b.kind}의 폭이 좁아 그림 ${dropped}개를 뺐습니다 — 전폭 블록이나 넓은 행으로 옮기면 넣을 수 있습니다.`);
    b.figures = fs;
  });
  return warnings;
}

/** 막대(행 옆 42mm 칸) 높이 — svg 150×104 비율 + 제목 줄 */
export const CHART_MM = 42 * (104 / 150) + 9.5 * 1.45 * PT + 0.6;
/** 라벨만 있는 막대(행에 다른 블록이 없음) — 가운데 48mm */
const LONE_CHART_MM = 48 * (104 / 150) + 9.5 * 1.45 * PT + 2;

/**
 * 머리 모드(사업 단위 조판 — 2025 최종본: 대상사업이 바뀔 때만 대상사업 상자, 실행과제가 바뀔 때만 실행과제 띠).
 * all = 대상사업 상자 + 실행과제 띠 + 제목, task = 실행과제 띠 + 제목, sub = 제목만(section-html sectionBodyHtml의 head와 같음)
 */
export type HeadMode = "all" | "task" | "sub";
/** 머리 조각 높이(mm): 대상사업 상자 6.9, 실행과제 띠 7.2(frameHeight 제목부) */
export const HEAD_PART_MM = { biz: 6.9, task: 7.2 } as const;
/** 머리를 뺀 만큼(mm): 대상사업 상자를 빼면 6.9, 실행과제 띠까지 빼면 14.1 */
export const headCut = (head: HeadMode = "all") => (head === "all" ? 0 : head === "task" ? HEAD_PART_MM.biz : HEAD_PART_MM.biz + HEAD_PART_MM.task);

/** 추진성과 강조 띠(오른쪽 칩 — 돋움 11pt 굵게, 안 여백 좌우 6px) 폭: 한 줄에 들면 글 폭, 아니면 40mm에서 줄바꿈 */
export const resultBandMm = (band: string) => Math.min(RESULT_BAND_MAX, textEm(band, true) * 11 * PT + 12 * PX + 1);
const RESULT_BAND_MAX = 40;
/** 추진성과 곁들임(막대·강조 띠) */
export interface ResultExtras {
  chart?: boolean;
  band?: string;
}

/** 추진성과 불릿 한 줄 폭: 라벨 21mm·안 여백을 빼고, 막대(42mm + 2.5mm)·강조 띠(칩 + 2mm)가 있으면 그만큼 좁음 */
export function resultWidth(x: ResultExtras = {}): number {
  return PAGE_MM.width - 21 - 12 * PX - INDENT_MM - (x.chart ? ROW_CHART_MM : 0) - (x.band ? resultBandMm(x.band) + 2 : 0);
}

/** 갈래 칩을 붙인 제목(렌더러 section-html.ts와 같은 글 — 「[값] 제목」, lib/reports/split-axes.ts). 칩이 없으면 제목 그대로 */
export const chipTitle = (title: string, chip?: string) => (chip ? `[${chip}] ${title}` : title);

/**
 * 소항목 제목 줄 높이: 「가. 제목」(돋움 14pt) 끝에 마커 칩(11pt, 줄바꿈 없이 한 덩어리)이 붙음 — 마지막 줄에 칩이 안 들어가면 한 줄 더.
 * markers를 모르면(구성안 어림) 「지적개선 AI」가 붙는다고 보고 셈. 2026-09-27 M 라운드: 마커 없는 카드도 늘 붙여 세어 한 줄(5.3mm) 크게 어림
 */
export function titleMm(title: string, markers?: string[]): number {
  const line = 14 * 1.3 * PT;
  if (!markers) return lineCount(`가. ${title} 지적개선 AI`, PAGE_MM.width, 14, true) * line;
  const l = lineLayout(`가. ${title}`, PAGE_MM.width, 14, true);
  // 마커 칩은 자간 0(돋움 −0.12em을 되돌림) — 「지적개선」 칩 17.7mm 실측
  const chips = markers.reduce((n, m) => n + (textEm(m, true) + 0.12 * [...m].length) * 11 * PT + (m === "BP" ? 27 : 10) * PX + 6 * PX, 0);
  return (l.lines + (chips && l.last * PAGE_MM.width + chips > PAGE_MM.width ? 1 : 0)) * line;
}

/** 제목부(대상사업 상자·실행과제 띠·소항목 제목 — 머리 모드대로) + 추진성과 상자(불릿 또는 3칸, 곁들임 막대·강조 띠). markers = 소항목 마커(모르면 생략) */
export function frameHeight(title: string, results: string[], resultCards: number, x: ResultExtras = {}, markers?: string[], mode: HeadMode = "all"): number {
  // 대상사업 상자·실행과제 띠·제목 사이 여백: K·L·M 행별 실측 24장에서 한 줄 제목 제목부가 22.9mm(예전 어림 21.8mm)
  const head = HEAD_PART_MM.biz + HEAD_PART_MM.task - headCut(mode) + titleMm(title, markers) + 2.4;
  const text = resultCards ? 16 + results.length * LINE_MM : lines(results, resultWidth(x), BODY_PT) * LINE_MM;
  const band = x.band ? lineCount(x.band, RESULT_BAND_MAX - 12 * PX, 11, true) * 11 * 1.3 * PT + 2 : 0;
  const body = Math.max(text, x.chart ? CHART_MM : 0, band);
  // 상자 안팎 여백 2.6mm(2026-09-27 행별 실측 96장 — 예전 4.8mm는 상자마다 2.2mm 크게 어림)
  return head + (results.length || resultCards || x.chart ? Math.max(12, body + 2.6) + 1.6 : 0);
}

export interface FitRow {
  /** 사다리 행 라벨(전폭 블록은 빈 문자열) */
  label: string;
  kinds: string;
  mm: number;
}

export interface FitReport {
  /** 쪽 예산(모듈 × 255mm) */
  budget: number;
  /** 어림 높이 */
  total: number;
  rows: FitRow[];
  /** 두 줄 이상이 되는 칸 글(자간 맞춤 뒤 — 정보용: 두 줄을 꽉 채우면 괜찮음) */
  wrapped: FitLine[];
  /** 한두 글자만 다음 줄로 넘어간 칸 글(마지막 줄 35% 미만) — 줄바꿈이 끊겨 보임 */
  ragged: FitLine[];
  /** 칸을 덜 채운 한 줄 칸 글(그 칸 한 줄의 60% 미만) — 빈 곳이 보임 */
  sparse: FitLine[];
  /** 나란한 상자 중 형제 칸보다 줄이 적어 비어 보이는 칸(hollowBoxes — 맞추기 판정에는 안 씀, 고치기 요청·경고·점수에만) */
  hollow?: HollowBox[];
  /** 살펴본 칸 글 수 */
  bullets: number;
}

export interface FitLine {
  where: string;
  text: string;
  lines: number;
  /** 그 칸 한 줄 한글 글자 수 */
  perLine: number;
  /** 마지막 줄 채움(0~1) */
  fill: number;
}

/** 라벨 줄 수(18mm 칸, 맑은고딕 10.4pt/1.3 — Step N·연도 라벨은 칩 + 줄바꿈) */
const labelMm = (label: string) => {
  const m = /^(Step\s?\d+|’\d\d년~?|\d{4}년~?|\d단계)\s*(.*)$/.exec(label);
  const n = m ? 1 + (m[2] ? lineCount(m[2], 18 - 6 * PX, 10.4, true) : 0) : lineCount(label, 18 - 6 * PX, 10.4, true);
  return n * 10.4 * 1.3 * PT + 1.2;
};

/**
 * 단 띠 머리 높이(mm — section-css .k-stage: 돋움 10.6pt/1.5 한 줄 + 아래 선 1.2pt + 아래 여백 1px). 띠 이름이 한 줄을 넘으면 줄만큼.
 * 위 여백 6px는 앞 행의 끝 여백(전폭 1.3mm·사다리 행 여백)과 겹쳐 따로 세지 않음 — 2026-10-12 Chrome 실측(견본 3단, 띠 + 불릿 2줄 행 19.1mm · 어림 19.3mm)
 */
export const stageHeadMm = (label: string) => Math.max(1, lineCount(label, PAGE_MM.width - 30 * PX, 10.6, true)) * HEAD_MM + 1.2 * PT + PX;

/**
 * 블록 목록 → 행(렌더러 blocksBody와 같은 묶음 — lib/reports/layout.ts layoutGroups: 라벨 있는 연속 블록은 사다리 행, 같은 라벨은 한 행, 행 끝 막대는 오른쪽,
 * 단 띠는 띠 머리 + 그 아래 블록, 가로 반씩 짝은 반 폭으로 두 블록을 각각 어림한 뒤 큰 쪽). 경영관리 spec은 mg.at으로 짝·단 띠가 절을 넘지 않게
 */
export function fitReport(spec: { sub: { title: string; markers?: string[]; chip?: string }; head?: HeadMode; blocks?: Block[]; results: string[]; resultCards?: unknown[]; resultChart?: { series: unknown[] } | null; resultBand?: string; module: number; mg?: { at: string[] } }): FitReport {
  const blocks = spec.blocks ?? [];
  const rows: FitRow[] = [];
  const wrapped: FitLine[] = [];
  const ragged: FitLine[] = [];
  const sparse: FitLine[] = [];
  let bullets = 0;
  const check = (text: string, w: number, where: string) => {
    if (!plainText(text).trim()) return;
    bullets += 1;
    const l = fitLayout(text, w);
    const line = { where, text, lines: l.lines, perLine: hangulPerLine(w), fill: Math.round(l.last * 100) / 100 };
    if (l.lines > 1) wrapped.push(line);
    if (l.lines > 1 && l.last < 0.35) ragged.push(line);
    if (l.lines === 1 && l.last < 0.6) sparse.push(line);
  };
  const noteWraps = (b: Block, width: number, where: string) => {
    const s = slotOf(b, width);
    if (["cards", "steps", "timeline", "quotes", "strategy", "pdca"].includes(b.kind)) for (const c of b.cells) for (const x of c.bullets) check(x, s.body, where);
    if (b.kind === "hub") for (const c of b.cells.slice(1)) for (const x of c.bullets) check(x, s.note, where);
    if (b.kind === "compare") for (const r of b.rows) for (const x of [...r.before, ...r.after]) check(x, s.body, where);
    if (b.kind === "bullets" || b.kind === "case") for (const x of b.items) check(x, s.body, where);
    if (b.kind === "qa") for (const c of b.cells) for (const x of c.bullets) check(x, qaAnswerWidth(c, s), where);
    if (b.kind === "table" && !isGridTable(b)) for (const c of b.cells) for (const x of c.bullets) check(x, s.body, where);
  };
  // 단위(블록 하나 또는 가로 반씩 짝) 높이: 짝은 반 폭으로 두 블록을 각각 어림해 큰 쪽(그리드 한 줄 — 짧은 쪽 아래는 빔)
  const one = (p: Block, w: number) => (p.kind === "chart" ? LONE_CHART_MM : blockHeightWithFigures(p, w));
  const unitMm = (u: number[], where: string) => {
    if (u.length === 1) {
      const p = blocks[u[0]];
      noteWraps(p, soloWidth(p) - figuresWidth(p), where ? `${where} · ${p.kind}` : p.kind);
      return one(p, soloWidth(p));
    }
    return Math.max(
      ...u.map((k) => {
        const p = blocks[k];
        noteWraps(p, blockWidth(p) - figuresWidth(p), `${where ? `${where} · ` : ""}반 · ${p.kind}`);
        return one(p, blockWidth(p));
      }),
    );
  };
  const kindsOf = (units: number[][]) => units.map((u) => u.map((k) => blocks[k].kind).join("|")).join("+");
  for (const g of layoutGroups(blocks, spec.mg?.at)) {
    const flat = g.units.flat();
    if (g.type === "full") {
      const b = blocks[flat[0]];
      if (flat.length === 1) {
        const w = soloWidth(b);
        rows.push({ label: "", kinds: b.kind, mm: b.kind === "chart" ? LONE_CHART_MM : blockHeightWithFigures(b, w) + 1.3 });
        noteWraps(b, w - figuresWidth(b), b.kind);
      } else rows.push({ label: "", kinds: kindsOf(g.units), mm: unitMm(flat, "") + 1.3 });
      continue;
    }
    if (g.type === "stage") {
      // 단 띠: 띠 머리 + 단위마다 전폭 블록(전폭 행과 같은 끝 여백 1.3mm)
      const mm = g.units.reduce((n, u) => n + unitMm(u, g.label) + 1.3, stageHeadMm(g.label));
      rows.push({ label: g.label, kinds: `띠:${kindsOf(g.units)}`, mm });
      continue;
    }
    // 같은 라벨 연속 블록 = 한 행(짝 없는 블록만이면 예전과 같은 셈 — 행 끝 막대는 오른쪽)
    if (g.units.every((u) => u.length === 1)) {
      const parts = flat.map((k) => blocks[k]);
      const last = parts.at(-1)!;
      const side = parts.length > 1 && last.kind === "chart";
      const main = side ? parts.slice(0, -1) : parts;
      const content = main.reduce((n, p) => n + one(p, soloWidth(p, side)), 0);
      main.forEach((p) => noteWraps(p, soloWidth(p, side) - figuresWidth(p), `${g.label} · ${p.kind}`));
      rows.push({ label: g.label, kinds: parts.map((p) => p.kind).join("+"), mm: Math.max(labelMm(g.label), side ? Math.max(content, CHART_MM) : content) + 6 * PX + 0.3 });
      continue;
    }
    const content = g.units.reduce((n, u) => n + unitMm(u, g.label), 0);
    rows.push({ label: g.label, kinds: kindsOf(g.units), mm: Math.max(labelMm(g.label), content) + 6 * PX + 0.3 });
  }
  const extras: ResultExtras = { chart: (spec.resultChart?.series.length ?? 0) >= 2, band: spec.resultBand || "" };
  const total = frameHeight(chipTitle(spec.sub.title, spec.sub.chip), spec.results, spec.resultCards?.length ?? 0, extras, spec.sub.markers, spec.head) + rows.reduce((n, r) => n + r.mm, 0) + 1.3;
  for (const x of spec.results) check(x, resultWidth(extras), "추진성과");
  return { budget: spec.module * PAGE_MM.height, total: Math.round(total), rows: rows.map((r) => ({ ...r, mm: Math.round(r.mm * 10) / 10 })), wrapped, ragged, sparse, hollow: hollowBoxes(blocks, spec.mg?.at), bullets };
}

// ---------------------------------------------------------------------------
// 빈 상자(2026-10-15 후속 5): 나란한 상자는 가장 긴 칸이 높이를 정해 짧은 칸 아래가 빔 — 초안 G 64건 실측 상자 채움 72~75%·상자당 불릿 1.0~1.4개

/** 나란한 상자 도식 — 카드·단계·연도 흐름(chevron)·전후 패널(panels·diag)·PDCA(연혁 점·표·막대·수치 띠는 아님) */
export const isBoxBlock = (b: Pick<Block, "kind" | "variant">) => ["cards", "steps", "pdca"].includes(b.kind) || (b.kind === "timeline" && b.variant !== "dots") || isPanelCompare(b);

export interface HollowBox {
  /** 어디(「라벨 n번째 칸」·전후 패널은 「라벨 왼쪽/오른쪽 패널」 — 라벨 없는 블록은 블록 종류) */
  where: string;
  /** 쓴 줄(불릿마다 줄 수 − 1 + 마지막 줄 채움, 결과 줄 포함 — 소수 한 자리) */
  used: number;
  /** 같은 줄에 나란한 형제 칸 중 가장 긴 칸의 줄 수 */
  most: number;
  /** 이 칸 한 줄 한글 글자 수 */
  perLine: number;
  /** 형제 최장 줄의 90%까지 늘릴 글자 수 어림 */
  add: number;
}

/** 빈 칸 기준: 형제 최장 칸이 2줄 이상이고, 쓴 줄이 그보다 1줄 넘게 모자람 — 집필 요청의 「나란한 칸은 ±1줄」과 같은 폭(75% 기준은 초안 G 상자 칸의 53~57%가 걸려 경고가 소음이 됨, 2026-10-15) */
export const HOLLOW = { minLines: 2, gap: 1 } as const;

/**
 * 빈 상자 재기(결정론): 칸 폭은 렌더러·판면 어림과 같은 blockRooms·figuresWidth·slotOf. 칸 불릿은 자간 맞춤 뒤 줄(fitLayout), 결과 줄(note)은 결과 줄 폭으로,
 * 전후 패널은 행마다 한 줄 글(blockHeight와 같은 폭). 형제 = 한 줄에 나란한 칸(ㄹ자 단계는 1·4단계 / 2·3단계, 카드는 4칸마다 줄바꿈). at = 경영관리 절 열쇠
 */
export function hollowBoxes(blocks: Block[], at?: string[]): HollowBox[] {
  const rooms = blockRooms(blocks, at);
  const out: HollowBox[] = [];
  const filled = (l: { lines: number; last: number }) => (l.lines ? l.lines - 1 + l.last : 0);
  blocks.forEach((b, i) => {
    if (!isBoxBlock(b)) return;
    const panel = isPanelCompare(b);
    const s = slotOf(b, panel ? rooms[i] : Math.max(40, rooms[i] - figuresWidth(b)));
    const name = b.label || b.kind;
    const boxes = panel
      ? [false, true].map((to) => {
          const w = panelTextMm(b, s, to);
          const ls = b.rows.map((r) => lineLayout(panelRowText(r, to), w));
          return { where: `${name} ${to ? "오른쪽" : "왼쪽"} 패널`, lines: ls.reduce((n, l) => n + l.lines, 0), used: ls.reduce((n, l) => n + filled(l), 0), w };
        })
      : b.cells.map((c, k) => {
          const ls = [...c.bullets.map((x) => fitLayout(x, s.body)), lineLayout(c.note, s.note)];
          return { where: `${name} ${k + 1}번째 칸`, lines: ls.reduce((n, l) => n + l.lines, 0), used: ls.reduce((n, l) => n + filled(l), 0), w: s.body };
        });
    const n = boxes.length;
    const cols = b.kind === "cards" ? 4 : n;
    const groups = panel ? [[0, 1]] : b.kind === "steps" && b.variant === "zigzag" ? [[0, 3], [1, 2]] : Array.from({ length: Math.ceil(n / cols) }, (_, r) => Array.from({ length: Math.min(cols, n - r * cols) }, (_, k) => r * cols + k));
    for (const g of groups) {
      const sib = g.filter((k) => k < n);
      if (sib.length < 2) continue;
      const most = Math.max(...sib.map((k) => boxes[k].lines));
      if (most < HOLLOW.minLines) continue;
      for (const k of sib) {
        const x = boxes[k];
        if (x.used >= most - HOLLOW.gap) continue;
        const perLine = hangulPerLine(x.w);
        out.push({ where: x.where, used: Math.round(x.used * 10) / 10, most, perLine, add: Math.max(1, Math.round((most * 0.9 - x.used) * perLine)) });
      }
    }
  });
  return out;
}

/** 빈 칸 경고 한 줄(두 트랙 공용 — 덜 찬 순 4곳까지). 자동 고치기 사유가 아님(경고·고치기 요청 목록·판면 점수에만) */
export function hollowWarning(boxes: HollowBox[] = []): string | null {
  if (!boxes.length) return null;
  const top = [...boxes].sort((a, b) => b.most - b.used - (a.most - a.used)).slice(0, 4);
  const more = boxes.length - top.length;
  return `칸 채우기: ${top.map((x) => `[${x.where}] ${x.used}/${x.most}줄`).join(" · ")}${more ? ` 외 ${more}칸` : ""} — 나란한 칸보다 줄이 적어 상자가 비어 보입니다. 근거에 있는 사실로 짧은 칸을 보강하고, 더 쓸 사실이 없으면 긴 칸을 줄여 줄 수를 맞춰 주세요.`;
}

// ---------------------------------------------------------------------------
// 요청 글 「판면 예산」(칸 폭별 한 줄 글자 수) · 맞추기 판단

const cell = (kind: Block["kind"], variant: string, n: number, width = LADDER_TD_MM) => slotOf({ kind, variant, cells: Array.from({ length: n }, () => ({ head: "", tag: "", bullets: [], note: "" })) }, width);
const per = (mm: number) => hangulPerLine(mm);
const perHead = (mm: number, pt = 10.6) => hangulPerLine(mm, pt, true);

/** 칸 폭별 한 줄 한글 글자 수(사다리 칸 기준 — 라벨 없는 전폭 블록은 조금 넓음) */
export function capacityLines(): string[] {
  const c2 = cell("cards", "plain", 2);
  const c3 = cell("cards", "plain", 3);
  const c3j = cell("cards", "plus", 3);
  const c4 = cell("cards", "plain", 4);
  const s3 = cell("steps", "row", 3);
  const s4 = cell("steps", "row", 4);
  const z = cell("steps", "zigzag", 4);
  const t3 = cell("timeline", "chevron", 3);
  const t4 = cell("timeline", "chevron", 4);
  const d3 = cell("timeline", "dots", 3);
  const cmp = cell("compare", "table", 1);
  const pan = cell("compare", "panels", 1);
  const hub = cell("hub", "", 3);
  const hubL = cell("hub", "", 4);
  const q1 = cell("quotes", "", 1, PAGE_MM.width);
  const qa = cell("qa", "", 2);
  const vs = cell("cards", "vs", 2);
  const tb3 = slotOf({ kind: "table", variant: "", cells: [{ head: "", tag: "", bullets: ["", "", ""], note: "" }] }, LADDER_TD_MM);
  const st3 = slotOf({ kind: "strategy", variant: "", cells: Array.from({ length: 3 }, () => ({ head: "", tag: "", bullets: [], note: "" })), items: ["목표", "전략", "과제"] }, LADDER_TD_MM);
  const pd = cell("pdca", "", 4);
  return [
    `bullets(라벨 옆 사다리 칸) ${per(LADDER_TD_MM - INDENT_MM)}자 · 막대가 붙은 행 ${per(LADDER_TD_MM - ROW_CHART_MM - INDENT_MM)}자 · 전폭 ${per(PAGE_MM.width - INDENT_MM)}자`,
    `cards 2칸 ${per(c2.body)}자 · 3칸 ${per(c3.body)}자(✚·▶ 잇기 ${per(c3j.body)}자) · 4칸 ${per(c4.body)}자 — 칸 머리 3칸 ${perHead(c3.head)}자·4칸 ${perHead(c4.head)}자`,
    `steps 3단계 ${per(s3.body)}자 · 4단계 ${per(s4.body)}자 · zigzag ${per(z.body)}자 — 단계 머리 4단계 ${perHead(s4.head, 11)}자`,
    `timeline 3칸 ${per(t3.body)}자 · 4칸 ${per(t4.body)}자(시기 머리 ${perHead(t3.head, 11)}자) · dots 3칸 ${per(d3.body)}자`,
    `compare 표 기존·개선 칸 ${per(cmp.body)}자(구분 ${perHead(cmp.head, 11)}자) · panels ${per(pan.body)}자`,
    `hub 참여 기관 2곳: 가운데 ${per(hub.body)}자·기관 역할 ${per(hub.note)}자 · 목록형 역할 ${per(hubL.note)}자`,
    `quotes 1개 ${per(q1.body)}자(두 개면 절반) · banner ${perHead(PAGE_MM.width - 6, 12.8)}자`,
    `qa 질문 ${perHead(qa.head)}자·답 ${per(qa.body)}자 · table 값 칸(값 열 3) ${per(tb3.body)}자(행 머리 ${perHead(tb3.note, 10.4)}자) · cards vs 칸 ${per(vs.body)}자 · strategy 3열 과제 ${per(st3.body)}자 · pdca 칸 ${per(pd.body)}자`,
    `추진성과 불릿 ${per(resultWidth())}자 · 막대를 곁들이면 ${per(resultWidth({ chart: true }))}자`,
  ];
}

/**
 * 칸을 채운 보통 모양의 블록(구성안 판면 어림용 — lib/reports/composition.ts). n = 칸·행·줄·막대 수(종류마다 뜻이 다름),
 * 칸 불릿 2개 × 약 1.4줄(칸 채우기 규칙), 인용 1.6줄, 수치 띠 뜻 1.8줄, 전후 비교 행마다 1.5줄 — blockCosts와 같은 채움
 */
export function canonicalBlock(kind: Block["kind"], variant: string, n: number, label: string, figures: Figure[] = [], lines?: number, place: Pick<Block, "layout" | "span"> = {}): Block {
  // lines를 주면 칸(전후 비교는 기존·개선 칸, 인용·수치 띠는 뜻 줄) 글이 그 줄 수를 채운 모양 — 구성안 글 한도 셈(lib/reports/composition.ts blockLimits)
  // place = 배치·폭(lib/reports/layout.ts) — 칸 글을 놓인 폭(전폭·반 폭)으로 채움
  const fill = (mm: number, lines = 1) => "가".repeat(Math.max(4, Math.floor(hangulPerLine(mm) * 0.9 * lines)));
  const count = Math.max(1, Math.min(8, Math.round(n)));
  const base: Block = { kind, label, title: "", variant, text: "", items: [], cells: [], rows: [], series: [], badge: "", figures, ...(place.layout ? { layout: place.layout } : {}), ...(place.span ? { span: place.span } : {}) };
  const cells = (k: number) => Array.from({ length: k }, () => ({ head: "머리", tag: "", bullets: [] as string[], note: "" }));
  const inner = (b: Block) => Math.max(40, blockWidth(b) - figuresWidth(b));
  switch (kind) {
    case "bullets":
      return { ...base, items: Array.from({ length: count }, () => fill(inner(base) - INDENT_MM)) };
    case "compare": {
      const sl = slotOf(base, inner(base));
      return { ...base, items: isPanelCompare({ kind: "compare", variant }) ? ["기존", "개선"] : [], rows: Array.from({ length: count }, () => ({ key: "구분", before: [fill(sl.body, lines ?? 1.5)], after: [fill(sl.body, lines ?? 1.5)] })) };
    }
    case "quotes":
    case "voices": {
      const b = { ...base, cells: cells(Math.min(count, kind === "quotes" ? 2 : 3)) };
      const sl = slotOf(b, inner(b));
      return { ...b, cells: b.cells.map((c) => ({ ...c, bullets: [fill(sl.body, lines ?? (kind === "quotes" ? 1.6 : 1.4))], note: kind === "quotes" ? "’25.6, 출처" : "" })) };
    }
    case "stats": {
      const b = { ...base, cells: cells(Math.min(4, Math.max(2, count))) };
      const sl = slotOf(b, inner(b));
      return { ...b, cells: b.cells.map((c) => ({ ...c, head: "약 3만국", bullets: [fill(sl.body, lines ?? 1.8)], note: "’26.8 기준" })) };
    }
    case "define":
      return { ...base, title: "무엇인가?", text: fill(inner(base) - 12, 2), items: ["단계", "단계", "단계"] };
    case "case":
      return { ...base, title: "우수사례", items: Array.from({ length: count }, () => fill(inner(base) - 12)) };
    case "band":
    case "banner":
    case "subhead":
      return { ...base, text: "가".repeat(30) };
    case "chart":
      return { ...base, title: "지표", series: Array.from({ length: Math.min(4, Math.max(2, count)) }, (_, i) => ({ label: `’2${4 + i}년`, value: `${10 + i}` })) };
    case "qa": {
      // 쌍마다 질문 한 줄 + 답 불릿 1개(약 1.6줄)
      const b = { ...base, cells: cells(Math.min(3, count)) };
      const sl = slotOf(b, inner(b));
      return { ...b, cells: b.cells.map((c) => ({ ...c, head: "왜 이 일이 필요한가?", bullets: [fill(sl.body, lines ?? 1.6)] })) };
    }
    case "strategy": {
      // 목표 띠 한 줄 + 층 이름 넷 + 열마다 머리·과제 불릿 2개(약 1.2줄)·지표 한 줄
      const b = { ...base, text: "가".repeat(24), items: ["목표", "전략", "과제", "지표"], cells: cells(Math.min(4, Math.max(2, count))) };
      const sl = slotOf(b, inner(b));
      return { ...b, cells: b.cells.map((c) => ({ ...c, head: "전략목표", bullets: lines ? [fill(sl.body, lines)] : [fill(sl.body, 1.2), fill(sl.body, 1.2)], note: "성과지표" })) };
    }
    case "pdca": {
      // 4칸(불릿 2개 × 약 1.4줄) + 환류 띠 한 줄
      const b = { ...base, text: "가".repeat(30), cells: cells(4) };
      const sl = slotOf(b, inner(b));
      return { ...b, cells: b.cells.map((c) => ({ ...c, head: "계획수립", bullets: lines ? [fill(sl.body, lines)] : [fill(sl.body, 1.4), fill(sl.body, 1.4)] })) };
    }
    case "table": {
      // 추진실적 열 표: 행(구분 + 추진내용 불릿 2개 × 약 1.2줄) 1~4개 + 오른쪽 큰 수치 2개·결과 줄
      if (variant === "result") {
        const b = { ...base, cells: Array.from({ length: Math.min(4, count) }, () => ({ head: "구분", tag: "", bullets: [] as string[], note: "" })), series: [{ label: "결과의 뜻", value: "약 3만국" }, { label: "결과의 뜻", value: "97%" }], text: "가".repeat(12) };
        const sl = slotOf(b, inner(b));
        return { ...b, cells: b.cells.map((c) => ({ ...c, bullets: lines ? [fill(sl.body, lines)] : [fill(sl.body, 1.2), fill(sl.body, 1.2)] })) };
      }
      // 2단 라벨 표: 큰 라벨 하나에 하위 라벨 행 둘씩(행마다 내용 불릿 1개 × 약 1.4줄)
      if (variant === "ladder") {
        const b = { ...base, cells: Array.from({ length: Math.min(6, Math.max(2, count)) }, (_, i) => ({ head: `${"①②③"[Math.floor(i / 2)]} 큰 라벨`, tag: `${"①②③"[Math.floor(i / 2)]}-${(i % 2) + 1} 하위 라벨`, bullets: [] as string[], note: "" })) };
        const sl = slotOf(b, inner(b));
        return { ...b, cells: b.cells.map((c) => ({ ...c, bullets: [fill(sl.body, lines ?? 1.4)] })) };
      }
      // 쉐브론 머리 표: 단계 머리 3개 + 행마다 단계별 내용(약 1.5줄)
      if (variant === "chevron") {
        const b = { ...base, items: ["구분", "현황", "개선방향", "적용 결과"], cells: Array.from({ length: Math.min(4, count) }, () => ({ head: "행 머리", tag: "", bullets: ["", "", ""], note: "" })) };
        const sl = slotOf(b, inner(b));
        return { ...b, cells: b.cells.map((c) => ({ ...c, bullets: c.bullets.map(() => fill(sl.body, lines ?? 1.5)) })) };
      }
      // 머리 줄(구분 + 값 열 3개) + 행마다 값(짧은 수치 — lines를 주면 그 줄 수를 채운 글). 막대 표도 같은 모양(값 옆 막대 칸만큼 글이 좁음)
      const b = { ...base, items: ["구분", "’24년", "’25년", "’26년"], cells: Array.from({ length: Math.max(2, count) }, () => ({ head: "행 머리", tag: "", bullets: ["", "", ""], note: "" })) };
      const sl = slotOf(b, inner(b));
      return { ...b, cells: b.cells.map((c) => ({ ...c, bullets: c.bullets.map(() => (lines ? fill(sl.body, lines) : "12,345건")) })) };
    }
    default: {
      // cards·steps·timeline·hub: 칸마다 불릿 2개 × 약 1.4줄(단계·시기는 결과 줄)
      const b = { ...base, cells: cells(kind === "hub" ? Math.max(3, count) : Math.max(2, count)) };
      const sl = slotOf(b, inner(b));
      const note = ["steps", "timeline"].includes(kind) ? fill(sl.note) : "";
      return { ...b, cells: b.cells.map((c) => ({ ...c, bullets: lines ? [fill(sl.body, lines)] : [fill(sl.body, 1.4), fill(sl.body, 1.4)], note })) };
    }
  }
}

/**
 * 블록 종류별 어림 높이(mm) — 칸을 채운 보통 모양(칸 불릿 2개·각 한 줄, 머리·결과 줄 한 줄)을 blockHeight로 잰 값.
 * 요청 글 「판면 예산」에 넣어 AI가 블록 영역 안에서 블록 수·종류를 고르게 함(③ 평가 라운드: 0.5쪽에 인용 상자를 기본 도식에 더해 113~120%로 넘침)
 */
export function blockCosts(): string[] {
  const fill = (mm: number, lines = 1) => "가".repeat(Math.max(4, Math.floor(hangulPerLine(mm) * 0.9 * lines)));
  const mk = (kind: Block["kind"], variant: string, cells: number, label = "라벨", o: Partial<Block> = {}): Block => {
    const base: Block = { kind, label, title: "", variant, text: "", items: [], cells: Array.from({ length: cells }, () => ({ head: "머리", tag: "", bullets: [], note: "" })), rows: [], series: [], badge: "", ...o };
    const sl = slotOf(base, blockWidth(base));
    const note = ["steps", "timeline"].includes(kind) ? fill(sl.note) : "";
    return { ...base, cells: base.cells.map((c) => ({ ...c, bullets: [fill(sl.body, 1.4), fill(sl.body, 1.4)], note })), ...o };
  };
  const mm = (b: Block) => Math.round(blockHeight(b, blockWidth(b)));
  const cmp = (variant: string, rows: number) => {
    const b = mk("compare", variant, 0);
    const sl = slotOf(b, blockWidth(b));
    return mm({ ...b, items: isPanelCompare({ kind: "compare", variant }) ? ["기존", "개선"] : [], rows: Array.from({ length: rows }, () => ({ key: "구분", before: [fill(sl.body, 1.5)], after: [fill(sl.body, 1.5)] })) });
  };
  const quote = (n: number) => {
    const b = mk("quotes", "", n, "");
    const sl = slotOf(b, blockWidth(b));
    return mm({ ...b, cells: b.cells.map((c) => ({ ...c, bullets: [fill(sl.body, 1.6)], note: "’25.6, 출처" })) });
  };
  const bullets = (n: number) => mm({ ...mk("bullets", "", 0), items: Array.from({ length: n }, () => fill(LADDER_TD_MM - INDENT_MM)) });
  const statCell = slotOf(mk("stats", "", 3, ""), PAGE_MM.width).body;
  const stats = mm({ ...mk("stats", "", 3, ""), cells: Array.from({ length: 3 }, () => ({ head: "약 3만국", tag: "", bullets: [fill(statCell, 1.8)], note: "’26.8 기준" })) });
  const define = mm({ ...mk("define", "", 0, ""), text: fill(PAGE_MM.width - 12, 2), items: ["단계", "단계", "단계"] });
  const kase = mm({ ...mk("case", "", 0, ""), items: [fill(PAGE_MM.width - 12), fill(PAGE_MM.width - 12), fill(PAGE_MM.width - 12)] });
  const canon = (kind: Block["kind"], variant: string, n: number) => {
    const b = canonicalBlock(kind, variant, n, "라벨");
    return Math.round(blockHeight(b, blockWidth(b)));
  };
  return [
    `(칸 글을 채운 보통 모양 기준 — 칸 글이 길면 더 높음) bullets 줄당 약 ${LINE_MM.toFixed(1)}mm(3줄 ${bullets(3)}mm) · quotes 1개 ${quote(1)}mm·2개 나란히 ${quote(2)}mm · banner 약 ${mm({ ...mk("banner", "", 0, ""), text: "가".repeat(30) })}mm`,
    `cards 3칸 ${mm(mk("cards", "plain", 3))}mm · steps 3단계 ${mm(mk("steps", "row", 3))}mm·4단계 ${mm(mk("steps", "row", 4))}mm·zigzag ${mm(mk("steps", "zigzag", 4))}mm · timeline 3칸 ${mm(mk("timeline", "chevron", 3))}mm`,
    `compare 표 2행 ${cmp("table", 2)}mm·3행 ${cmp("table", 3)}mm · panels 3행 ${cmp("panels", 3)}mm · hub 기관 3곳 ${mm(mk("hub", "", 4))}mm`,
    `stats 3칸 ${stats}mm · define ${define}mm · case 3줄 ${kase}mm · chart는 앞 블록 행 오른쪽(높이 0, 그 행 칸이 좁아짐)`,
    `qa 2쌍 ${canon("qa", "", 2)}mm·3쌍 ${canon("qa", "", 3)}mm · table 3행(값 열 3) ${canon("table", "", 3)}mm·4행 ${canon("table", "", 4)}mm · cards vs 2칸 ${mm(mk("cards", "vs", 2))}mm · strategy ${canon("strategy", "", 3)}mm(3열·목표 띠·지표 줄) · pdca ${canon("pdca", "", 4)}mm(4칸·환류 띠)`,
    `그림 자리(figures)는 블록 옆에 붙어 그 블록 글 폭을 그림 폭 + ${FIGURE_GAP_MM}mm만큼 줄이고 높이는 그림 높이 이상: ${FIGURE_SIZES.map((k) => `${k} ${FIGURE_MM[k].w}×${FIGURE_MM[k].h}`).join(" · ")} · 로고 ${LOGO_MM.w}×${LOGO_MM.h}`,
  ];
}

/** 표 모양 4종의 어림 높이 한 줄(경영관리 분량 안내에만 — 주요사업 요청 글 blockCosts는 그대로, 2026-10-12) */
export function tableShapeCosts(): string {
  const canon = (variant: string, n: number) => {
    const b = canonicalBlock("table", variant, n, "라벨");
    return Math.round(blockHeight(b, blockWidth(b)));
  };
  return `table:result 2행(오른쪽 추진실적 칸) ${canon("result", 2)}mm · table:bars 3행 ${canon("bars", 3)}mm · table:chevron 2행(단계 머리 3) ${canon("chevron", 2)}mm · table:ladder 4행(큰 라벨 2) ${canon("ladder", 4)}mm`;
}

/** 쪽 모듈 → 블록 영역 높이(mm): 제목부(대상사업·실행과제·소항목 제목 약 21mm — 머리 모드대로 줄어듦)와 추진성과(약 22mm)를 뺀 것 */
export const blockAreaMm = (module: number, head: HeadMode = "all") => Math.max(40, Math.round(module * PAGE_MM.height - 21 + headCut(head) - 22));

/** 채움 목표: 2025 최종본 쪽은 빈 곳 없이 꽉 참 — 어림(±4%, 1-가 실측 ±1mm)이 예산의 95~102%면 맞음 */
export const FIT_BAND = { under: 0.95, over: 1.02 } as const;

/** 판면 넘침 경고 기준(초안 어림 ÷ 예산) — 과제별 초안 맞추기(OVER_AGAIN)와 같은 4%. 제출 확인 목록(submission.ts)이 씀 — 판면 판정(fitVerdict)과 한 곳에 두려고 여기 둠 */
export const SUBMIT_OVER = 1.04;

/** 판면 판정 등급: 빔 · 맞음 · 조금 넘침 · 넘침(제출 전 확인) */
export type FitLevel = "under" | "ok" | "slight" | "over";
/** 판정 톤(상태 톤 이름 — components/ui/status-tone.ts): 맞음은 끝·중립, 빔·조금 넘침은 우리 차례, 넘침만 경고(2026-10-18 「경고색은 막힘에만」) */
export type FitTone = "done" | "doing" | "alert";
export interface FitVerdict {
  level: FitLevel;
  /** 화면에 먼저 보이는 뜻(「분량 맞음 · 101%」의 앞) */
  label: string;
  /** 짧은 풀이(title) */
  hint: string;
  tone: FitTone;
}

/** 판정 범위 한 줄(title) — 문턱 상수에서 만듦 */
export const FIT_RANGE_TEXT = `맞음 ${Math.round(FIT_BAND.under * 100)}~${Math.round(FIT_BAND.over * 100)}% · 조금 넘침 ~${Math.round(SUBMIT_OVER * 100)}% · 넘침 ${Math.round(SUBMIT_OVER * 100)}% 초과`;

/**
 * 판면 판정 하나(2026-10-21 사용자 결정): 판면 어림 ÷ 예산(%)을 95% 미만 빔 · 95~102% 분량 맞음 · 102~104% 조금 넘침 · 104% 초과 넘침(제출 전 확인)으로.
 * 문턱은 FIT_BAND(맞추기·판면 경고)와 SUBMIT_OVER(제출 확인 목록)를 그대로 씀 — 과제별 초안 도구줄·구성안·여러 안·부서 허브·보고서 검토가 같이 씀.
 */
export function fitVerdict(pct: number): FitVerdict {
  if (pct > SUBMIT_OVER * 100) return { level: "over", label: "넘침", hint: "배정 쪽을 넘김 — 제출 전 확인", tone: "alert" };
  if (pct > FIT_BAND.over * 100) return { level: "slight", label: "조금 넘침", hint: "배정 쪽을 조금 넘김 — 줄일 곳이 있으면 줄임", tone: "doing" };
  if (pct < FIT_BAND.under * 100) return { level: "under", label: "분량 빔", hint: "배정 쪽에 빈 곳이 남음 — 채울 곳이 있으면 채움", tone: "doing" };
  return { level: "ok", label: "분량 맞음", hint: "배정 쪽에 맞음", tone: "done" };
}

export type FitNeed = "over" | "under" | "ragged" | "sparse";

/** 맞추기가 필요한가: 예산을 2% 넘거나 95%에 못 미치거나, 한두 글자 넘어간 칸 글이 3개 이상이거나, 덜 채운 칸 글이 30%(최소 4개)를 넘음 */
export function fitNeeded(r: FitReport): FitNeed | null {
  if (r.total > r.budget * FIT_BAND.over) return "over";
  if (r.total < r.budget * FIT_BAND.under) return "under";
  if (r.ragged.length >= 3) return "ragged";
  if (r.sparse.length >= Math.max(4, Math.ceil(r.bullets * 0.3))) return "sparse";
  return null;
}

/** 판면 점수(작을수록 좋음): 넘침은 두 배로, 예산 95% 아래 빈 곳, 한두 글자 넘어간 칸 글 하나에 3, 덜 채운 칸 글·빈 상자 칸 하나에 1 */
export function fitScore(r: FitReport): number {
  return (r.total > r.budget ? (r.total - r.budget) * 2 : Math.max(0, r.budget * 0.95 - r.total)) + r.ragged.length * 3 + r.sparse.length + (r.hollow?.length ?? 0);
}
