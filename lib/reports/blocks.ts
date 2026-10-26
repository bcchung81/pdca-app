// 과제별 초안 spec v3 「블록 목록」(순수). 2025 최종본 평가내용2 소항목 62개는 블록 종류·순서가 모두 달라(같은 짜임 0),
// 고정 행(추진배경·현황 및 문제점…)과 행↔도식 짝을 버리고 「블록을 이야기 순서대로 + 블록마다 선택 라벨」로 씁니다.
// 라벨이 있는 연속 블록은 한 사다리 표의 행이 되고(같은 라벨은 한 행), 라벨 없는 블록은 전폭입니다. 배치(전폭·단 띠·가로 반씩)는 블록의 layout·span(lib/reports/layout.ts).

import { z } from "zod";
import { type Descriptions, described } from "../prompts/template.ts";
import { PLAN_BAR, STATS_ACTUAL_MIN, actualStatCells } from "./actuals.ts";
import type { BlockLayout, BlockSpan } from "./layout.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

// strategy(전략체계도)·pdca(P·D·C·A 순환)는 2026-10-09 — 경영관리 평가내용 첫 「전략수립」 대주제·PDCA 체계 도식(분석 §8.3·§8.7)을 표·칸 4행으로 흉내 내던 것
export const BLOCK_KINDS = ["bullets", "cards", "compare", "steps", "timeline", "hub", "voices", "define", "band", "banner", "quotes", "case", "chart", "subhead", "stats", "qa", "table", "strategy", "pdca"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/**
 * 이야기 틀 12종 — ①~⑧은 2025 소항목에서, ⑨~⑪은 주요사업 프레임워크 한글 3개(실행과제 틀 36개)를 그려 8종에 안 잡히는 반복 짜임에서 뽑음(2026-10-10).
 * ⑫ AX 전환형은 2025 산업진흥군 타기관 보고서 짜임 분석에서 뽑음(2026-10-13 — KCA 2025 예시 없음).
 * 구성안 AI는 이 중에서 주 틀과 보조 틀을 고름(2026-10-09 — 섞음 대신 주 + 보조)
 */
export const MAIN_STORIES = ["단계 전개형", "한계 극복·다자협업형", "이슈→해결책형", "현장 목소리형", "원스톱 통합형", "왜-어떻게형", "가치 축 분할형", "연혁·연도 사다리형", "기존→개선형", "구분표 중심형", "현황분석→대응형", "AX 전환형"] as const;
export type MainStory = (typeof MAIN_STORIES)[number];
/** 이야기 틀(12종 + 섞음) — 짜임을 고르는 기준이자 형제 초안과 겹침을 보는 이름. 섞음은 옛 구성안·집필 답과 틀 갤러리(「AI가 주 + 보조를 고름」)에만 */
export const STORIES = [...MAIN_STORIES, "섞음"] as const;
export type Story = (typeof STORIES)[number];
export const isMainStory = (s: unknown): s is MainStory => (MAIN_STORIES as readonly string[]).includes(String(s));

/** 블록 칸(카드·단계·시기·기관·말풍선·인용 공용) */
export interface BlockCell {
  head: string;
  tag: string;
  bullets: string[];
  note: string;
}

/**
 * 그림 자리표시(사진·삽화·지도·시스템 화면·기관 로고) — 초안은 영역만 차지하고 「무엇을 보여줄 그림인지」만 적음, 담당자가 채움.
 * 2025 최종본 119~126쪽 실측(docs/analysis/2025-119-126-표현-분석.md): 소항목 11개 모두에 그림(28개)이 있고, 그림만 따로 선 경우는 없이
 * 글·도식 옆에 붙음 — 현황 양옆·칸 옆(left/right), 전후 비교 패널 안 또는 가운데(compare: left=As-Is·right=To-Be·center), 우수사례 상자 오른쪽,
 * 협업 가운데 로고(hub center). 시험·재정·제도 과제는 그림이 없는 소항목도 있음(사업2·3 표본)
 */
export const FIGURE_KINDS = ["photo", "illust", "map", "screen", "logo"] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];
export const FIGURE_LABEL: Record<FigureKind, string> = { photo: "사진", illust: "삽화", map: "지도", screen: "화면", logo: "로고" };
/** 크기 등급(가로×세로 mm, 2025 실측): S 칸 안 작은 사진 18~25×11~19 · M 현황 양옆·패널 안·사례 옆 28~35×18~25 · L 구성·가운데 삽화 45~47×22~44 · W 가로형 개념 삽화 79~90×17~27 · MAP 지도 25~49×32~66 */
export const FIGURE_SIZES = ["S", "M", "L", "W", "MAP"] as const;
export type FigureSize = (typeof FIGURE_SIZES)[number];
export const FIGURE_MM: Record<FigureSize, { w: number; h: number }> = { S: { w: 20, h: 15 }, M: { w: 32, h: 20 }, L: { w: 46, h: 24 }, W: { w: 80, h: 20 }, MAP: { w: 30, h: 40 } };
/** 로고 한 개 크기(2025: 기관 로고 18~24×8~11) — 로고 묶음은 기관 수만큼 넓어짐(logoMm) */
export const LOGO_MM = { w: 22, h: 10 } as const;
/** 로고 묶음 서술의 기관 이름들(「해양경찰청･KCA･KOMSA 기관 로고」 → 3곳) */
export const logoNames = (desc: string) =>
  desc
    .replace(/(기관\s*)?로고(\s*묶음)?/g, "")
    .split(/[･·,、/+]|\s및\s|\s와\s|\s과\s/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
/** 로고 묶음 폭: 기관 하나에 12mm + 여백 10mm, 46mm까지(협업 가운데 칸 폭) */
const logoMm = (desc: string) => ({ w: Math.min(46, 10 + 12 * Math.max(2, logoNames(desc).length)), h: LOGO_MM.h });
export const FIGURE_POS = ["left", "right", "center"] as const;
export type FigurePos = (typeof FIGURE_POS)[number];
export interface Figure {
  kind: FigureKind;
  /** 보여줄 내용(간단 서술 — 「설악산 음영구간 현장 측정 차량」) */
  desc: string;
  pos: FigurePos;
  size: FigureSize;
}
/** 그림 한 개가 차지하는 폭·높이(mm) */
export const figureMm = (f: Figure) => (f.kind === "logo" ? logoMm(f.desc) : FIGURE_MM[f.size]);
/** 그림 칸과 글 사이 간격(mm) */
export const FIGURE_GAP_MM = 2.5;

export interface Block {
  kind: BlockKind;
  /** 왼쪽 라벨(이야기 단계 이름). 비면 전폭 */
  label: string;
  title: string;
  variant: string;
  text: string;
  items: string[];
  cells: BlockCell[];
  rows: Array<{ key: string; before: string[]; after: string[] }>;
  series: Array<{ label: string; value: string }>;
  badge: string;
  /** 그림 자리표시(블록마다 2개까지). 이 기능 전 초안은 없음 */
  figures?: Figure[];
  /** 배치(내용 아닌 필드 — lib/reports/layout.ts): 없음 = 라벨 사다리, full = 전폭, stage = 단 띠. 이 기능(2026-10-12) 전 초안은 없음 */
  layout?: BlockLayout;
  /** 폭(내용 아닌 필드): half = 다음 블록과 가로 반씩. 없으면 그릇 폭 전부 */
  span?: BlockSpan;
}

/** kind별 모양 — 목록 밖이면 첫째 */
export const VARIANTS: Partial<Record<BlockKind, readonly string[]>> = {
  // vs = 두 입장·두 방식을 맞세우는 2칸(2025 1-4 가·사업3 기금수입)
  cards: ["plus", "arrow", "plain", "vs"],
  // diag = 진단 ▶ 처방 짝(2026-10-13 — panels와 같은 두 패널, 꼬리표만 「현황·문제」 ▶ 「추진방향」)
  compare: ["table", "panels", "diag"],
  steps: ["row", "zigzag"],
  timeline: ["chevron", "dots"],
  // 표 모양(2026-10-12 — 2025 경영관리 보고서 빈출, 분석 「블록 어휘 수준」 표): 빈 글 = 수치·구분표(예전 그대로), result = 오른쪽 어두운 「추진실적」 칸,
  // bars = 값 칸 옆 가로 막대(길이는 코드가 셈 — tableBars), chevron = 열 머리가 단계 화살표, ladder = 2단 라벨(큰 라벨 안 하위 라벨 + 내용)
  table: ["", "result", "bars", "chevron", "ladder"],
};

/** 두 패널로 그리는 전후 비교(panels·diag — 같은 마크업·같은 판면 어림, 꼬리표만 다름) */
export const isPanelCompare = (b: Pick<Block, "kind" | "variant">) => b.kind === "compare" && (b.variant === "panels" || b.variant === "diag");

/** 머리 줄(items) + 행마다 값 열(cells[].bullets = 열 순서 값)인 표 — 기본·막대·쉐브론. result·ladder는 칸(cells[].bullets = 불릿)으로 씀 */
export const isGridTable = (b: Pick<Block, "kind" | "variant">) => b.kind === "table" && b.variant !== "result" && b.variant !== "ladder";

/** 표 칸 값 → 막대용 수(앞 수치 + 단위). 자리표시·음수·0·수치가 둘 이상(괄호 밖)·수치로 시작하지 않는 글은 null */
function barNumber(raw: string): { value: number; unit: string } | null {
  if (/【확인:/.test(raw)) return null;
  const s = raw.replace(/\*\*/g, "").replace(/\^\{[^{}]*\}/g, "").trim();
  const m = /^(?:약\s*)?([-−△▽]?)\s*(\d[\d,]*(?:\.\d+)?)\s*([^\d\s()（）[\]~∼→,·･/]{0,4})(.*)$/.exec(s);
  if (!m || m[1]) return null;
  if (/\d/.test(m[4].replace(/\([^)]*\)|（[^）]*）/g, ""))) return null;
  const value = Number(m[2].replace(/,/g, ""));
  return value > 0 && Number.isFinite(value) ? { value, unit: m[3] } : null;
}

/**
 * 막대 표(table:bars) 한 행의 막대 길이(%, 0~100): 같은 행에서 단위가 같은 값끼리 가장 큰 값에 견줌(결정론 — AI는 숫자만 씀).
 * 수치가 아닌 칸·음수·0·자리표시는 null(막대 없음), 같은 단위 값이 하나뿐이면 견줄 것이 없어 null
 */
export function tableBars(values: string[]): Array<number | null> {
  const nums = values.map(barNumber);
  const max = new Map<string, { n: number; top: number }>();
  for (const x of nums) if (x) max.set(x.unit, { n: (max.get(x.unit)?.n ?? 0) + 1, top: Math.max(max.get(x.unit)?.top ?? 0, x.value) });
  return nums.map((x) => {
    const g = x && max.get(x.unit);
    return x && g && g.n >= 2 ? Math.round((x.value / g.top) * 1000) / 10 : null;
  });
}

/** 2단 라벨 표(table:ladder)의 큰 라벨 묶음: 이어진 행의 head가 같거나 비면 한 칸(rowspan). start = 첫 행 순번 */
export function ladderGroups(cells: BlockCell[]): Array<{ head: string; start: number; rows: number }> {
  const out: Array<{ head: string; start: number; rows: number }> = [];
  cells.forEach((c, i) => {
    const last = out.at(-1);
    if (last && (!c.head || c.head === last.head)) last.rows += 1;
    else out.push({ head: c.head, start: i, rows: 1 });
  });
  return out;
}

const Cell = z.object({ head: z.string(), tag: z.string(), bullets: z.array(z.string()), note: z.string() });

/** AI 답 블록 한 개의 필드 — 설명(뜻·채우는 법)은 resources/prompts/report-draft/schema.md의 block.* 절 */
export const BLOCK_OUT_FIELDS = ["kind", "label", "title", "variant", "text", "items", "cells", "rows", "series", "badge", "evidence", "figures"] as const;

/** 블록 스키마. desc(schema.md 절)를 주면 모델에 보내는 설명을 붙이고, 없으면 구조만(타입·검증용) */
export function blockOutSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: (typeof BLOCK_OUT_FIELDS)[number]) => described(s, desc, `block.${key}`);
  return z.object({
    kind: d(z.enum(BLOCK_KINDS), "kind"),
    label: d(z.string(), "label"),
    title: d(z.string(), "title"),
    variant: d(z.string(), "variant"),
    text: d(z.string(), "text"),
    items: d(z.array(z.string()), "items"),
    cells: d(z.array(Cell), "cells"),
    rows: d(z.array(z.object({ key: z.string(), before: z.array(z.string()), after: z.array(z.string()) })), "rows"),
    series: d(z.array(z.object({ label: z.string(), value: z.string() })), "series"),
    badge: d(z.string(), "badge"),
    evidence: d(z.string(), "evidence"),
    figures: d(z.array(z.object({ kind: z.enum(FIGURE_KINDS), desc: z.string(), pos: z.enum(FIGURE_POS), size: z.enum(FIGURE_SIZES) })), "figures"),
  });
}
export const BlockOut = blockOutSchema();
export type BlockOutput = z.infer<typeof BlockOut>;

// ---------------------------------------------------------------------------
// 정리·검증(결정론)

export interface BlockClean {
  blocks: Block[];
  /** 뺀 블록 이유(경고) */
  dropped: string[];
}

/**
 * AI 블록 → spec 블록. line = 글 정리(표기 통일 포함), found = 근거 원문 대조.
 * quotes·voices는 칸마다 원문을 찾은 것만, case·define은 evidence를 찾을 때만 남깁니다(지어낸 인용·수상·정의 차단).
 * opts.statsYear(주요사업 집필 검증만 — section.ts verifySection): 올해 실적 칸(actuals.ts actualStatCells)이 2개 미만인 핵심 수치 띠를 뺌.
 * 경영관리·블록 고치기는 주지 않음 — 경영관리 수치 띠는 절을 닫는 추진성과인 경우가 많아 빼면 「성과로 닫지 않은 절」이 생김
 */
export function cleanBlocks(raw: BlockOutput[], line: (s: unknown, max?: number) => string, found: (s: string) => boolean, opts: { statsYear?: number } = {}): BlockClean {
  const dropped: string[] = [];
  const list = (a: unknown, max: number, len = 200) => (Array.isArray(a) ? a.map((x) => line(x, len)).filter(Boolean).slice(0, max) : []);
  const cells = (a: unknown, max: number) =>
    (Array.isArray(a) ? a : [])
      .map((c: Json) => ({ head: line(c?.head, 60), tag: line(c?.tag, 20), bullets: list(c?.bullets, 5, 160), note: line(c?.note, 120) }))
      .filter((c) => c.head || c.bullets.length || c.note)
      .slice(0, max);
  // 수치 표 칸 값은 자리를 지켜야 하므로(빈 칸도 한 열) 거르지 않고 열 수에 맞춤
  const tableRows = (a: unknown, cols: number, len = 60) =>
    (Array.isArray(a) ? a : [])
      .map((c: Json) => ({ head: line(c?.head, 40), tag: "", bullets: Array.from({ length: cols }, (_, i) => line(Array.isArray(c?.bullets) ? c.bullets[i] : "", len)), note: "" }))
      .filter((c) => c.head || c.bullets.some(Boolean))
      .slice(0, 6);
  const blocks: Block[] = [];
  for (const b of (raw ?? []).slice(0, 16)) {
    const kind = BLOCK_KINDS.includes(b?.kind) ? b.kind : null;
    if (!kind) continue;
    const vs = VARIANTS[kind];
    const variant = vs ? (vs.includes(String(b.variant)) ? String(b.variant) : vs[0]) : "";
    const x: Block = {
      kind,
      label: line(b.label, 24),
      title: line(b.title, 80),
      variant,
      text: line(b.text, 200),
      items: list(b.items, 8, 160),
      cells: cells(b.cells, kind === "voices" || kind === "quotes" ? 3 : kind === "strategy" || kind === "pdca" ? 4 : 5),
      rows: (Array.isArray(b.rows) ? b.rows : []).map((r: Json) => ({ key: line(r?.key, 30), before: list(r?.before, 4, 120), after: list(r?.after, 4, 120) })).filter((r: Json) => r.before.length || r.after.length).slice(0, 5),
      series: (Array.isArray(b.series) ? b.series : []).map((s: Json) => ({ label: line(s?.label, 16), value: line(s?.value, 24) })).filter((s: Json) => s.label && /\d/.test(s.value)).slice(0, 4),
      badge: line(b.badge, 24),
      figures: cleanFigures(kind, b.figures, line),
    };
    const name = `${kind}${x.label ? `(${x.label})` : ""}`;
    // 수치 표: items = 머리 줄 전체(첫째 = 행 머리 열 이름, 값 열 2~5개), 칸마다 head = 행 머리·bullets = 값 열 순서대로
    // 추진실적 열 표(result): cells = 왼쪽 행(head 구분 — 선택·bullets 추진내용 불릿) 4행까지, series = 오른쪽 큰 수치 1~2(label 뜻·value 수치), text = 짧은 결과 줄(선택).
    // 결과(수치·결과 줄)가 하나도 없으면 오른쪽 칸을 그릴 수 없어 평범한 칸(2행 이상) 또는 불릿으로
    if (kind === "table" && x.variant === "result") {
      x.items = [];
      x.cells = cells(b.cells, 12).filter((c) => c.bullets.length).slice(0, 4);
      x.series = x.series.slice(0, 2);
      if (!x.series.length && !x.text) Object.assign(x, x.cells.length >= 2 ? { variant: "plain", kind: "cards" } : { kind: "bullets", variant: "", items: x.cells.flatMap((c) => c.bullets).slice(0, 8), cells: [] });
    } else if (kind === "table" && x.variant === "ladder") {
      // 2단 라벨 표(ladder): cells = 행(head 큰 라벨 — 이어진 같은 라벨·빈 글은 한 칸으로 합침, tag 하위 라벨, bullets 내용) 6행까지
      x.items = [];
      x.cells = cells(b.cells, 12).filter((c) => c.bullets.length).slice(0, 6);
    } else if (kind === "table") {
      // 쉐브론 머리 표(chevron)는 값 칸이 단계별 내용이라 조금 길게(120자)
      x.items = list(b.items, 6, 30);
      x.cells = x.items.length >= 3 ? tableRows(b.cells, x.items.length - 1, x.variant === "chevron" ? 120 : 60) : [];
    }
    // 전략체계도: items = 왼쪽 층 이름(목표·전략·과제·지표 — 지표마다 달라 자유, 4개까지·짧게)
    if (kind === "strategy") x.items = list(b.items, 4, 20);
    // PDCA 순환은 4칸일 때만(칸이 모자라거나 남으면 단계 흐름 — 환류 띠는 뺌)
    if (kind === "pdca" && x.cells.length !== 4) Object.assign(x, { kind: "steps", variant: "row", text: "" });
    // VS 대립은 두 칸일 때만(칸이 셋 이상이면 평범한 칸)
    if (kind === "cards" && x.variant === "vs" && x.cells.length !== 2) x.variant = "plain";
    // Q&A 상자: 질문(head)과 답(bullets)이 다 있는 쌍만, 3쌍까지
    if (kind === "qa") x.cells = x.cells.filter((c) => c.head && c.bullets.length).slice(0, 3).map((c) => ({ ...c, bullets: c.bullets.slice(0, 2) }));
    if (kind === "quotes" || kind === "voices") {
      const kept = x.cells.filter((c) => c.bullets[0] && found(c.bullets[0].replace(/^[“"]|[”"]$/g, "")));
      if (kept.length < x.cells.length) dropped.push(`${name}: 근거 원문에서 찾지 못한 ${kind === "quotes" ? "인용" : "말풍선"} ${x.cells.length - kept.length}개를 뺐습니다(지어낸 인용 차단).`);
      x.cells = kept.map((c) => ({ ...c, bullets: [c.bullets[0].replace(/^[“"]|[”"]$/g, "")] }));
    }
    if ((kind === "case" || kind === "define") && !(b.evidence && found(String(b.evidence)))) {
      dropped.push(`${name}: 근거 원문(evidence)을 찾지 못해 뺐습니다 — ${kind === "case" ? "수상·보도 자료" : "정의가 적힌 자료"}를 첨부하면 넣을 수 있습니다.`);
      continue;
    }
    if (!enough(x)) continue;
    // 막대: 실적 값이 2개 미만(목표·계획 값만 더한 막대)이면 뺌
    if (kind === "chart" && actualBars(x.series).length < 2) {
      dropped.push("막대: 실적 값이 2개 미만(목표·계획 값만 더한 막대)이라 뺐습니다 — 실적 값이 쌓이면 다시 쓸 수 있습니다");
      continue;
    }
    // 핵심 수치 띠(주요사업): 올해 실적 칸이 2개 미만(목표·예상·전년 값·자리표시로 채운 띠)이면 뺌(2026-10-15 블라인드 심사)
    if (kind === "stats" && opts.statsYear) {
      const actual = actualStatCells(x.cells, opts.statsYear).length;
      if (actual < STATS_ACTUAL_MIN) {
        dropped.push(`수치 띠: 올해 실적 칸이 ${actual}개뿐(${x.cells.map((c) => c.head).join("·")} — 목표·예상·전년 값·자리표시로 채운 띠)이라 뺐습니다 — 올해 실적 값이 ${STATS_ACTUAL_MIN}개 이상 쌓이면 다시 쓸 수 있습니다`);
        continue;
      }
    }
    blocks.push(x);
  }
  return { blocks, dropped };
}

/** 목표·계획·예상·전망 표시가 라벨이나 값에 있는 막대(정의는 actuals.ts — 수치 띠 칸과 같은 낱말) */
export { PLAN_BAR };

/**
 * 막대 중 실적 막대(목표·계획·예상·전망 표시가 없고 값이 막대용 수로 읽히는 것) — 블록 막대와 추진성과 막대가 같은 규칙.
 * 값이 자리표시(【확인: ’26년 …】)거나 수로 읽히지 않으면(barNumber null) 실적이 아님(2026-10-15 — 「’25 실적·’26 목표·’26 실적 【확인】」이 실적 2개로 통과하던 것)
 */
export const actualBars = <T extends { label: string; value: string }>(series: T[]): T[] => series.filter((x) => !PLAN_BAR.test(`${x.label} ${x.value}`) && barNumber(x.value) !== null);

/** 블록마다 그림 2개까지 — 모르는 종류·빈 서술은 버리고, 자리·크기는 목록 밖이면 기본값(가운데는 전후 비교·협업만, 지도는 MAP) */
export function cleanFigures(kind: BlockKind, raw: unknown, line: (s: unknown, max?: number) => string): Figure[] {
  if (!Array.isArray(raw)) return [];
  const out: Figure[] = [];
  for (const f of raw as Json[]) {
    if (!FIGURE_KINDS.includes(f?.kind)) continue;
    const desc = line(f?.desc, 60);
    if (!desc) continue;
    // 로고는 협업 기관 2곳 이상의 묶음 하나만(2025 협업 구조 가운데 로고 묶음 — KCA 하나만 둔 로고는 뺌, 평가 라운드 G)
    if (f.kind === "logo" && (logoNames(desc).length < 2 || out.some((x) => x.kind === "logo"))) continue;
    let pos: FigurePos = FIGURE_POS.includes(f?.pos) ? f.pos : "right";
    if (pos === "center" && kind !== "compare" && kind !== "hub") pos = "right";
    const size: FigureSize = f.kind === "map" ? "MAP" : FIGURE_SIZES.includes(f?.size) ? f.size : "M";
    out.push({ kind: f.kind, desc, pos, size });
    if (out.length === 2) break;
  }
  return out;
}

/** 초안의 그림 자리표시 모두(블록 순서대로) — 「채울 자료」 목록·개수 셈 */
export const figuresOf = (blocks: Block[]) => blocks.flatMap((b) => b.figures ?? []);

/** 블록이 그릴 만큼 찼는지 */
function enough(b: Block): boolean {
  switch (b.kind) {
    case "bullets":
      return b.items.length > 0;
    case "cards":
    case "steps":
    case "timeline":
    case "hub":
    case "strategy":
      return b.cells.length >= 2;
    case "pdca":
      return b.cells.length === 4;
    case "voices":
    case "quotes":
    case "qa":
      return b.cells.length >= 1;
    case "table":
      if (b.variant === "result") return b.cells.length >= 1 && (b.series.length > 0 || Boolean(b.text));
      if (b.variant === "ladder") return b.cells.length >= 2;
      if (b.variant === "chevron") return b.items.length >= 3 && b.cells.length >= 1;
      return b.items.length >= 3 && b.cells.length >= 2;
    case "compare":
      return b.rows.length >= 1;
    case "chart":
      return b.series.length >= 2;
    case "stats":
      // 핵심 수치 띠: 칸마다 수치(head)가 있어야 함
      return b.cells.filter((c) => /\d/.test(c.head)).length >= 2;
    case "define":
      return Boolean(b.title && (b.text || b.items.length));
    case "case":
      return Boolean(b.title || b.items.length);
    case "band":
    case "banner":
    case "subhead":
      return Boolean(b.text);
  }
}

/** 블록의 모든 글(숫자 대조·문체 경고) */
export function blockTexts(b: Block): string[] {
  return [
    b.label,
    b.title,
    b.text,
    ...b.items,
    ...b.cells.flatMap((c) => [c.head, c.tag, ...c.bullets, c.note]),
    ...b.rows.flatMap((r) => [r.key, ...r.before, ...r.after]),
    ...b.series.map((s) => `${s.label} ${s.value}`),
    b.badge,
  ].filter(Boolean);
}

/** 문체 경고를 볼 문장(불릿·칸 불릿 — 인용·말풍선은 원문, 수치 표 칸은 값이라 뺌) */
export function blockBullets(b: Block): string[] {
  if (b.kind === "quotes" || b.kind === "voices") return [];
  if (b.kind === "table") return isGridTable(b) ? [] : b.cells.flatMap((c) => c.bullets);
  return [...b.items, ...b.cells.flatMap((c) => c.bullets)];
}

/** 시각 블록 수(불릿·소제목 빼고) */
export const visualCount = (blocks: Block[]) => blocks.filter((b) => b.kind !== "bullets" && b.kind !== "subhead").length;

/** 짜임 서명: 블록 종류(모양)를 순서대로 — 형제 초안과 겹침을 봄 */
export function blockSignature(blocks: Block[]): string {
  return blocks.map((b) => (b.variant && b.variant !== (VARIANTS[b.kind]?.[0] ?? "") ? `${b.kind}:${b.variant}` : b.kind)).join(" → ");
}

// ---------------------------------------------------------------------------
// 전년 절 짜임 뽑기(근사, 결정론) — kordoc 글의 표지로 블록 순서를 추정해 요청에 적음

const HINTS: Array<[string, RegExp]> = [
  ["인용 상자(정부·CEO 원문)", /^(정부|CEO|장관|VIP)\b|’\d\d\.\d{1,2},\s*[^)]*(지시|발표|방침)/],
  // 말투(…요·…까·…죠)로 끝난 따옴표 줄은 말풍선이지 메시지 띠가 아님
  ["메시지 띠", /^“[^|]{8,}(?<![요까죠][.!?]?)”[^|]*$|^[^|]{10,}!$/],
  ["연도 흐름", /’\d\d년[^|]*\|[^|]*’\d\d년/],
  ["Step 사다리", /Step ?\d/],
  ["단계 흐름", /(^|\| )(1 [가-힣]|①|1단계)/],
  ["As-Is/To-Be·기존/개선", /As-Is|To-Be|기\s?존\s*\|.*개\s?선|^구\s?분\s*\|\s*기\s?존/],
  ["✚ 병렬 칸", /✚/],
  ["용어·왜 박스", /란\?|왜 .{2,20}\?/],
  ["말풍선(현장 목소리)", /“[^”]{6,}(요|까|죠|다)[.!?]?”/],
  ["가치 축 띠", /^(공공성|서비스질|효율성|신뢰성|투명성|안전성|편의성)\s*\|?\s*▶/],
  ["로드맵·추진전략", /로드맵|추진전략/],
  ["핵심이슈→해결책", /핵심이슈|주요이슈|해결책/],
  ["협업 구조(기관 역할)", /MOU|업무협약|협력체계|거버넌스|협의체/],
  ["우수사례", /우수사례/],
];

/** 전년 절 글 → 블록 표지 순서(처음 나온 순, 중복 없음) */
export function layoutHints(text: string): string[] {
  const out: string[] = [];
  for (const l of text.split("\n")) {
    for (const [name, re] of HINTS) if (!out.includes(name) && re.test(l)) out.push(name);
  }
  return out;
}
