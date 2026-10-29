// 경영관리 경평 초안 「스타일 프로필」 셈 — 순수 부분(입출력 없음). 기준은 docs/plan/경평초안-스타일-메타프롬프트.md 「스타일 프로필」 표.
// AI 채점은 하지 않고 결정론 수치만 잼. 반복 수치·반복 문장·빈 칸·분량(mm)은 lib 함수 결과를 호출부(mg-style-profile.ts)가 넘김.
import { type Block, blockTexts, isGridTable } from "../../lib/reports/blocks.ts";
import { SUP_RE, plainText } from "../../lib/reports/fit.ts";
import { qtyTokens } from "./mg-para-score-core.ts";

/** 글 → 위첨자 표기(^{…})까지 뺀 보이는 글 */
const visible = (s: string) => plainText(s.replace(SUP_RE, "")).trim();
const len = (s: string) => [...s.replace(/\s+/g, "")].length;
const hasDigit = (s: string) => /\d/.test(s);

/**
 * 보이는 글 — 2025 보고서 md와 렌더된 초안 HTML 양쪽에 같은 방식(쪽당 글자·수량 토큰의 기준이 같은 범위가 되게).
 * 그림 참조 ![…](…), style·script, 태그(줄 나눔 태그는 줄바꿈으로), HTML 엔티티, 표·제목 기호(| # - 연속)를 빼고 공백은 하나로. 첫 <body 앞은 버림
 */
export function visibleText(raw: string): string {
  const i = raw.indexOf("<body");
  return (i >= 0 ? raw.slice(i) : raw)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<br\s*\/?>|<\/(?:p|div|li|tr|td|th|h\d|section|table)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[|#-]+/g, " ")
    .replace(/[ \t]+/g, " ");
}
/** 보이는 글자 수(공백 제외) — 2025 md도 초안 HTML도 이 함수 하나 */
export const visibleChars = (raw: string): number => len(visibleText(raw));

export interface StylePart {
  key: string;
  title: string;
}
export interface StyleSpec {
  blocks: Block[];
  at: string[];
  parts: StylePart[];
}
/** lib 함수 결과 등 호출부가 넘기는 값 */
export interface StyleContext {
  /** 렌더된 초안 HTML — 있으면 쪽당 글자·수량 토큰은 이 보이는 글로 잼(없으면 spec 블록 글) */
  html?: string | null;
  /** 배정 쪽수 */
  pages: number | null;
  /** 분량(mm): 보강 뒤 높이와 배정 높이. 둘 중 하나라도 없으면 분량 %는 null */
  heightMm: number | null;
  targetMm: number | null;
  repeatFigures: number;
  repeatSentences: number;
  hollow: number;
}
/** 2025 기준값 — 없으면 해당 비교는 하지 않음 */
export interface StyleRef {
  charsPerPage: number | null;
  qtyPerPage: number | null;
  /** 트랙 설정 reportBulletChars */
  bulletChars: number;
}

export interface SectionProfile {
  key: string;
  title: string;
  titleHasFigure: boolean;
  blocks: number;
  dataBlocks: number;
  /** 닫는 추진성과의 수치 칸 수 */
  perfCells: number;
  planBlocks: number;
}
export interface StyleProfile {
  pages: number | null;
  visibleChars: number;
  charsPerPage: number | null;
  qtyTokens: number;
  qtyPerPage: number | null;
  bullets: number;
  bulletAvgLen: number | null;
  /** 표 값 칸(수치 표 isGridTable의 cells[].bullets) 수 */
  tableValueCells: number;
  sections: SectionProfile[];
  volumePct: number | null;
  repeatFigures: number;
  repeatSentences: number;
  hollow: number;
}

/** 칸 불릿 — 추진성과 라벨 블록과 수치 표 값 칸은 뺌(수치 표는 따로 셈). 인용·말풍선 원문도 뺌 */
export function proseBullets(blocks: Block[]): string[] {
  return blocks
    .filter((b) => b.label !== "추진성과" && !isGridTable(b))
    .flatMap((b) => (b.kind === "quotes" || b.kind === "voices" ? [] : [...b.items, ...b.cells.flatMap((c) => c.bullets)]))
    .map(visible)
    .filter(Boolean);
}

/** 수치 표 값 칸 */
export const tableValues = (blocks: Block[]): string[] => blocks.filter(isGridTable).flatMap((b) => b.cells.flatMap((c) => c.bullets)).map(visible).filter(Boolean);

/** 데이터 블록 — 값이 수치인 수치 표(chart·stats는 안 셈) */
export const isDataBlock = (b: Block) => isGridTable(b) && b.cells.some((c) => c.bullets.some(hasDigit));

/**
 * 닫는 추진성과의 수치 칸 — 칸은 머리에 숫자가 있거나 불릿에 수량 토큰이 있으면 하나, 불릿 줄은 수량 토큰이 있으면 하나, 차트는 숫자 있는 항목마다 하나
 */
export function perfCells(blocks: Block[]): number {
  return blocks
    .filter((b) => b.label === "추진성과")
    .reduce(
      (n, b) =>
        n +
        b.cells.filter((c) => hasDigit(c.head) || c.bullets.some((t) => qtyTokens(t).length)).length +
        b.items.filter((t) => qtyTokens(t).length).length +
        b.series.filter((s) => hasDigit(s.value)).length,
      0,
    );
}

/** 계획 낱말 — lib/reports/mg-close.ts isPlanLine과 같은 규칙(그 함수는 내보내지 않음): 「계획·목표 대비」는 견준 결과라 계획으로 안 봄 */
const PLAN_WORD = /예정|예상|목표|계획|전망/;
const isPlanText = (t: string) => PLAN_WORD.test(t.replace(/(계획|목표)\s*대비/g, ""));
/** 계획 블록 — 라벨 뺀 글이 모두 계획·예정 표지가 든 블록 */
export function isPlanBlock(b: Block): boolean {
  const lines = blockTexts(b).filter((t) => t !== b.label).map(visible).filter(Boolean);
  return lines.length > 0 && lines.every(isPlanText);
}

export function styleProfile(spec: StyleSpec, ctx: StyleContext): StyleProfile {
  const texts = [...spec.blocks.flatMap(blockTexts), ...spec.parts.map((p) => p.title)].map(visible).filter(Boolean);
  const vis = ctx.html ? visibleChars(ctx.html) : len(texts.join(""));
  const qty = qtyTokens(ctx.html ? visibleText(ctx.html) : texts.join("\n")).length;
  const per = (n: number) => (ctx.pages && ctx.pages > 0 ? n / ctx.pages : null);
  const bl = proseBullets(spec.blocks);
  const sections = spec.parts.map((p) => {
    const bs = spec.blocks.filter((_, i) => spec.at[i] === p.key);
    return { key: p.key, title: p.title, titleHasFigure: hasDigit(p.title), blocks: bs.length, dataBlocks: bs.filter(isDataBlock).length, perfCells: perfCells(bs), planBlocks: bs.filter(isPlanBlock).length };
  });
  return {
    pages: ctx.pages,
    visibleChars: vis,
    charsPerPage: per(vis),
    qtyTokens: qty,
    qtyPerPage: per(qty),
    bullets: bl.length,
    bulletAvgLen: bl.length ? bl.reduce((n, t) => n + [...t].length, 0) / bl.length : null,
    tableValueCells: tableValues(spec.blocks).length,
    sections,
    volumePct: ctx.heightMm != null && ctx.targetMm ? (ctx.heightMm / ctx.targetMm) * 100 : null,
    repeatFigures: ctx.repeatFigures,
    repeatSentences: ctx.repeatSentences,
    hollow: ctx.hollow,
  };
}

/** 분량 기준(메타프롬프트 표): 배정의 90~125% */
export const VOLUME_RANGE = { min: 90, max: 125 } as const;
/** 절 수 기준 2~3개 */
export const SECTION_RANGE = { min: 2, max: 3 } as const;
/** 닫는 추진성과 수치 칸 기준(절마다) */
export const PERF_CELLS_MIN = 2;
/** 계획 블록 기준(절마다 이하) */
export const PLAN_BLOCKS_MAX = 1;

/** 지표별 기준 통과(null = 비교할 기준이나 값이 없음) */
export interface StyleChecks {
  charsPerPage: boolean | null;
  qtyPerPage: boolean | null;
  bulletAvgLen: boolean | null;
  sections: boolean;
  titlesFigure: boolean;
  dataBlocks: boolean;
  perfCells: boolean;
  planBlocks: boolean;
  volume: boolean | null;
  repeatFigures: boolean;
  repeatSentences: boolean;
  hollow: boolean;
}
export function styleChecks(p: StyleProfile, ref: StyleRef): StyleChecks {
  const ge = (v: number | null, base: number | null) => (v == null || base == null ? null : v >= base);
  return {
    charsPerPage: ge(p.charsPerPage, ref.charsPerPage),
    qtyPerPage: ge(p.qtyPerPage, ref.qtyPerPage),
    bulletAvgLen: ge(p.bulletAvgLen, ref.bulletChars),
    sections: p.sections.length >= SECTION_RANGE.min && p.sections.length <= SECTION_RANGE.max,
    titlesFigure: p.sections.length > 0 && p.sections.every((s) => s.titleHasFigure),
    dataBlocks: p.sections.length > 0 && p.sections.every((s) => s.dataBlocks >= 1),
    perfCells: p.sections.length > 0 && p.sections.every((s) => s.perfCells >= PERF_CELLS_MIN),
    planBlocks: p.sections.every((s) => s.planBlocks <= PLAN_BLOCKS_MAX),
    volume: p.volumePct == null ? null : p.volumePct >= VOLUME_RANGE.min && p.volumePct <= VOLUME_RANGE.max,
    repeatFigures: p.repeatFigures === 0,
    repeatSentences: p.repeatSentences === 0,
    hollow: p.hollow === 0,
  };
}
