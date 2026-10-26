// 경영관리 지표 단위 카드 밖 부분의 조판 입력(R5d, 순수 — 입출력 없음). 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.6.
//  ① 높이 어림: 표 칸 폭(unit-parts-html.ts의 열 비율 × 판면 170mm − 칸 안 여백)과 글자 수로 줄 수를 세고(fit.ts lineCount) 장마다 mm를 냄 —
//     판형·글자 규격 자료가 없어 어림 + 경고만(자동 맞추기 없음, 2026-10-12 결정). 비어 있는 칸은 빈 칸 높이로 셈하므로 AI 문장이 들어오면 더 길어짐(비어 있는 칸 수를 알려 경고).
//  ② 비고 쪽(Q7): 지적 행 → 그 카드 초안의 지적개선 절(findingRowParts) → 조판에서 그 절이 놓인 쪽 → 지표 시작 쪽 + 쪽 − 1(findingRemark). 저장하지 않고 그릴 때 계산.
//  표지는 쪽 수에 안 세므로(2025 실측 — 쪽 번호가 없음) 높이를 어림하지 않음.

import type { BusinessLayout, MgOutside, MgOutsideChapter } from "./business-layout.ts";
import { HEAD_PART_MM, LINE_MM, PAGE_MM, fitLayout, lineCount } from "./fit.ts";
import { type FindingsPart, type OutcomePart, type PriorPart, type UnitPartsMg, findingRemark, findingRowParts, kpiRate, unitPartsLabels } from "./unit-parts-mg.ts";
import type { ReportSectionSpec } from "./section.ts";
import type { LooseJson } from "../loose-json.ts";


const PT = 25.4 / 72;
const PX = 25.4 / 96;
const BODY_PT = 10.6;
/** 칸 안 좌우 여백(td padding 4px씩) */
const TD_PAD_X = 8 * PX;
/** 칸 안 위아래 여백(td padding 2px씩) + 아래 줄 0.48pt */
const TD_PAD_Y = 4 * PX + 0.48 * PT;
/** 불릿 들여쓰기 0.95em(.k-frame li) */
const LI_INDENT = 0.95 * BODY_PT * PT;
/** 머리 칸(th): 맑은 고딕 10.4pt/1.45, 좌우 3px·위아래 1px */
const TH_LINE = 10.4 * 1.45 * PT;
const TH_PAD_X = 6 * PX;
const TH_PAD_Y = 2 * PX;
/** 표 위 굵은 선(1.68pt) · 표 아래 띄움 6px */
const TABLE_TOP = 1.68 * PT;
const TABLE_GAP = 6 * PX;
/** 빈 칸 표시(.k-up-empty: 8pt/1.4) */
const EMPTY_MM = 1.4 * 8 * PT + 0.2;
/** 장 제목(.k-up-ch: 15pt/1.3 + 위 10px·아래 5px·밑줄 여백 2px + 밑줄 1.68pt) */
const CHAPTER_MM = 15 * 1.3 * PT + 17 * PX + TABLE_TOP;
/** 작은 제목(.k-sub: 14pt/1.3 + 아래 5px) */
const SUB_MM = 14 * 1.3 * PT + 5 * PX;

/** 열 비율(%) — unit-parts-html.ts와 같은 값(그쪽을 바꾸면 함께) */
const COLS = { findings: [44, 44, 12], prior: [34, 33, 33], kpi: [20, 11, 11, 11, 10, 37], three: [24, 38, 38] } as const;

const colMm = (pct: number) => (PAGE_MM.width * pct) / 100;

interface Tally {
  /** 비어 있는 AI·사람 칸 수(빈 칸 높이로 어림한 칸) */
  empty: number;
}

/** 불릿 칸 높이(mm): 비면 빈 칸 높이(+1), 아니면 줄마다 줄 수(들여쓰기 뺀 폭) × 줄 높이 */
function bulletsMm(items: string[], pct: number, t: Tally): number {
  if (!items.length) {
    t.empty += 1;
    return EMPTY_MM;
  }
  const w = colMm(pct) - TD_PAD_X - LI_INDENT;
  return items.reduce((n, x) => n + Math.max(1, fitLayout(x, w).lines) * LINE_MM, 0);
}

/** 글 칸 높이(mm): 불릿 아님 */
const textMm = (s: string, pct: number) => Math.max(1, fitLayout(s, colMm(pct) - TD_PAD_X).lines) * LINE_MM;

/** 머리 줄(mm): 이름마다 칸 폭에서 줄 수, 가장 많은 쪽 */
const headMm = (names: string[], pcts: readonly number[]) => Math.max(...names.map((n, i) => Math.max(1, lineCount(n, colMm(pcts[i]) - TH_PAD_X, 10.4)))) * TH_LINE + TH_PAD_Y;

const rowMm = (cells: number[]) => Math.max(...cells) + TD_PAD_Y;

function findingsMm(p: FindingsPart, labels: ReturnType<typeof unitPartsLabels>, t: Tally): number {
  const L = labels.findings;
  const c = COLS.findings;
  const rows = p.rows.length ? p.rows.reduce((n, r) => n + rowMm([bulletsMm(r.code.finding, c[0], t), bulletsMm(r.ai.actions, c[1], t), LINE_MM]), 0) : rowMm([EMPTY_MM]);
  return CHAPTER_MM + TABLE_TOP + headMm([...L.cols], c) + rows + TABLE_GAP;
}

function priorMm(p: PriorPart, labels: ReturnType<typeof unitPartsLabels>, t: Tally): number {
  const c = COLS.prior;
  const head = headMm(labels.prior.cols, c);
  return CHAPTER_MM + p.rows.reduce((n, r) => n + HEAD_PART_MM.biz + TABLE_TOP + head + rowMm([bulletsMm(r.human.upTo, c[0], t), bulletsMm(r.ai.now, c[1], t), bulletsMm(r.ai.effect, c[2], t)]) + TABLE_GAP, 0);
}

function outcomeMm(p: OutcomePart, labels: ReturnType<typeof unitPartsLabels>, t: Tally): number {
  const L = labels.outcome;
  const c = COLS.kpi;
  const on = p.kpi.filter((k) => k.human.checked);
  // 계량 표 머리는 2단(구분·전년 실적·성과 분석은 두 줄 합침, ’26년 아래 목표·실적·달성률)
  const kpiHead = 2 * TH_LINE + 2 * TH_PAD_Y;
  const kpiRows = on.length
    ? on.reduce((n, k) => {
        const actual = k.code.actual.trim();
        return n + rowMm([textMm(`${k.code.name}${k.code.unit ? `(${k.code.unit})` : ""}`, c[0]), textMm(k.code.prev, c[1]), textMm(k.code.target, c[2]), textMm(actual || "【확인: 실적 미입력】", c[3]), actual ? textMm(kpiRate(k).text, c[4]) : LINE_MM, bulletsMm(k.ai.analysis, c[5], t)]);
      }, 0)
    : rowMm([EMPTY_MM]);
  const q = COLS.three;
  const qual = TABLE_TOP + headMm(L.qualCols, q) + p.qual.reduce((n, r) => n + rowMm([textMm(r.human.label, q[0]), bulletsMm(r.ai.result, q[1], t), bulletsMm(r.ai.analysis, q[2], t)]), 0) + TABLE_GAP;
  const plan = TABLE_TOP + headMm(L.planCols, q) + p.plan.reduce((n, r) => n + rowMm([textMm(r.human.label, q[0]), bulletsMm(r.ai.self, q[1], t), bulletsMm(r.ai.plan, q[2], t)]), 0) + TABLE_GAP;
  return CHAPTER_MM + HEAD_PART_MM.task + SUB_MM + TABLE_TOP + kpiHead + kpiRows + TABLE_GAP + SUB_MM + qual + HEAD_PART_MM.task + plan;
}

/**
 * 카드 밖 부분 → 조판 입력(사업 조판 layoutBusiness의 opts.mg.outside). 앞 = 지적사항 조치실적 + 전년 대비(새 쪽에서 이어 씀), 뒤 = 성과분석 및 환류(새 쪽).
 * 표지는 쪽 수에 안 세어 넣지 않음. pages2025·wholeTarget은 부르는 쪽이 쪽 기준(MgPageRef)에서 알려 줌
 */
export function unitPartsOutside(p: UnitPartsMg, base: { pages2025?: number; wholeTarget?: number } = {}): MgOutside {
  const labels = unitPartsLabels(p.year, p.unit);
  const t: Tally = { empty: 0 };
  const front: MgOutsideChapter[] = [];
  const back: MgOutsideChapter[] = [];
  if (p.findings) front.push({ key: "findings", title: labels.findings.title, mm: findingsMm(p.findings, labels, t) });
  if (p.prior) front.push({ key: "prior", title: labels.prior.title, mm: priorMm(p.prior, labels, t) });
  if (p.outcome) back.push({ key: "outcome", title: labels.outcome.title, mm: outcomeMm(p.outcome, labels, t) });
  return { front, back, ...base, emptyCells: t.empty };
}

/** 2025 보고서에서 그 지표의 첫 카드 밖 장(지적사항 조치실적)이 놓인 인쇄 쪽 — 비고 「p.N」의 기본 시작 쪽(조각 meta.printed_pages, 2026-10-16 rpt25-mg-01~11 확인). 혁신가점 12~14는 카드 밖 장이 없음. 2026 책 쪽이 다르면 화면 쿼리 ?start=로 바꿈 */
export const MG_FRONT_PAGE_2025: Readonly<Record<string, number>> = { "MG-1": 4, "MG-2": 15, "MG-3": 25, "MG-4": 35, "MG-5": 46, "MG-6": 53, "MG-7": 61, "MG-8": 72, "MG-9": 84, "MG-10": 98, "MG-11": 107 };

/**
 * 조판 결과에서 카드의 절(절 열쇠)이 놓인 쪽 — 카드 시작 쪽에서 그 절의 첫 블록 위치(블록 순번 ÷ 블록 수)만큼 카드 높이를 내려간 곳(카드가 여러 쪽에 걸칠 때).
 * 절별 높이가 없어 블록 수로 나눈 어림. 모르면(초안 없음·절 열쇠 없음) null. 쪽 번호는 LaidPage.no(지표 안 쪽 번호 — 앞 쪽 포함)
 */
export function partPageOf(layout: Pick<BusinessLayout, "items" | "sections" | "pages">, cardId: string, partKey: string): number | null {
  const i = layout.sections.findIndex((s) => s.cardId === cardId);
  if (i < 0) return null;
  const spec = layout.items[i]?.spec;
  const sec = layout.sections[i];
  const at = spec?.mg?.at ?? [];
  const idx = at.indexOf(partKey);
  if (!spec || idx < 0 || !at.length) return null;
  const first = layout.pages.find((pg) => pg.no === sec.startPage)?.pieces.find((x) => x.index === i);
  const H = PAGE_MM.height;
  const abs = (sec.startPage - 1) * H + (first?.top ?? 0) + (idx / at.length) * sec.height;
  return Math.min(sec.endPage, Math.max(sec.startPage, Math.floor(abs / H + 1e-9) + 1));
}

/**
 * 지적 행 id → 비고(「p.74」). start = 지표 시작 쪽(책 전체 인쇄 쪽 — 앞 쪽 1이 이 쪽), cards = 카드 id → 원장 data, specs = 카드 id → 과제별 초안.
 * 그 행의 지적개선 절(findingRowParts)이 조판에서 놓인 쪽(partPageOf) — 초안이 없거나 절을 못 정하면 빈 글
 */
export function findingRemarks(
  findings: FindingsPart | null,
  ctx: { start: number; layout: Pick<BusinessLayout, "items" | "sections" | "pages">; cards: Record<string, LooseJson>; specs: Record<string, ReportSectionSpec | null> },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of findings?.rows ?? []) {
    const keys = findingRowParts(ctx.specs[r.code.cardId] ?? null, ctx.cards[r.code.cardId], r.code.rowIndex, r.code.finding);
    out[r.id] = findingRemark(ctx.start, keys, (k) => partPageOf(ctx.layout, r.code.cardId, k));
  }
  return out;
}
