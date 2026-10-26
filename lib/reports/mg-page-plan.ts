// 경영관리 목차·쪽 배정(결정론, 순수) — 지표 총 쪽수는 작성분량(규정 — mg-volume.ts, 2026-10-12 사용자 결정), 평가내용·과제로 나눈 값은 앱이 어림한 배정(성과관리팀이 고침).
// 2025 지표별 보고서(공통 지식 rpt25-mg-NN)의 「세부평가내용별」 장 쪽 수(인쇄 쪽 — 간지·빈 쪽 제외)를 평가내용마다 나누고(한 쪽에 평가내용이 둘이면 반씩 — mgPageRef),
// 카드가 쓰는 본문 예산(작성분량 − 2025의 본문 아닌 내용 장 쪽 — withMgVolume)이 2025 본문보다 작으면 평가내용 쪽을 비례로 줄이고(작성분량 표가 바뀔 때의 상한 — 2025 데이터에서는 예산 = 본문),
// 카드 ↔ 평가내용 첫 대응(MG_CARD_EVALS — 추천 기본값)으로 과제마다 0.5쪽 단위로 나눔(2026-10-10 사용자 결정 「2안」).
// 목차 1단 = 평가내용(카드의 첫 평가내용), 2단 = 둘 이상 걸칠 때만 「평가내용 1·3에 걸침」. 저장은 주요사업과 같은 report_outline.

import { evalsFor } from "./mg-outline.ts";
import type { OutlineRow } from "./outline.ts";

/** 2025 보고서 조각 하나의 쪽 정보(knowledge_chunks — meta.chapter·eval_no·eval_title·printed_pages, pdf_page_start·end) */
export interface MgPageChunk {
  chapter: string;
  evalNo: number | null;
  evalTitle: string;
  start: number | null;
  end: number | null;
  /** 인쇄 쪽 번호(쪽 꼬리표 — meta.printed_pages). 간지·표지 조각은 빈 목록 */
  printed?: number[] | null;
}

/** 평가내용 하나의 쪽 수(2025 쪽을 나눈 소수 — 표시는 0.5쪽 단위로. 본문 예산으로 줄였으면 0.5쪽 단위 값이고 2025 값은 pages2025) */
export interface MgEvalPages {
  no: number;
  title: string;
  pages: number;
  pages2025?: number;
}

/**
 * 지표 하나의 쪽 기준: 2025 전체 PDF 쪽·본문(인쇄 쪽 — 카드가 쓰는 쪽, 작성분량을 적용하면 본문 예산)·그 밖(전체 − 본문: 표지·간지·내용 장)·그중 본문 아닌 내용 장(인쇄 쪽)·평가내용별.
 * volume·body2025는 작성분량을 적용한 뒤(withMgVolume)에만
 */
export interface MgPageRef {
  total: number;
  body: number;
  common: number;
  content: number;
  evals: MgEvalPages[];
  volume?: number;
  body2025?: number;
  /** 2025 지표관리 방향 장 쪽(MG-1만 3쪽 — 본문과 겹치지 않는 인쇄 쪽, content에 들어 있음). 없으면 생략 — 이 앱이 쓰지 않는 장이라 조판의 카드 밖 부분 쪽 비교(content − direction)에서 뺌 */
  direction?: number;
}

/** 세부평가내용별 장(절·대주제 본문) — lib/knowledge/parsers/report25-mg.ts의 chapter 값 */
const BODY_CHAPTERS = new Set(["detail", "detail_theme"]);
/** 본문 아닌 내용 장(지표관리 방향·지적사항 조치실적·전년 대비·성과분석 및 환류) — 표지(cover)·간지처럼 내용이 아닌 쪽은 작성분량에 안 들어가 빼지 않음 */
const CONTENT_CHAPTERS = new Set(["direction", "findings", "prior", "outcome"]);

/** 조각이 차지한 쪽: 인쇄 쪽으로 셀 때는 인쇄 쪽 번호(없으면 어디에도 안 셈 — 간지·표지·빈 쪽), 아니면 PDF 쪽 범위 */
const pagesOf = (c: MgPageChunk, printed: boolean): number[] =>
  printed ? (c.printed ?? []) : c.start && c.end ? Array.from({ length: c.end - c.start + 1 }, (_, i) => c.start! + i) : [];

/**
 * 2025 지표 보고서 조각 → 쪽 기준. 본문·내용 장은 인쇄 쪽 번호로 셈(2026-10-12 — 2025 본문 = 인쇄 쪽 기준, 간지·빈 쪽 제외: PDF 쪽으로 세면
 * 두 칸 지표(안전 및 재난관리·조직 및 인적자원관리)의 두 번째 칸 간지·표지 2쪽이 본문에 섞였음). 인쇄 쪽 정보가 한 조각에도 없으면(옛 데이터·시험 픽스처) PDF 쪽으로.
 * 본문 쪽마다 그 쪽에 걸친 평가내용 수로 나눠 셈(합 = 본문 쪽 수), 내용 장 쪽은 본문과 겹치지 않는 쪽만. total은 PDF 쪽 수(common = total − 본문)
 */
export function mgPageRef(chunks: MgPageChunk[]): MgPageRef {
  const printed = chunks.some((c) => c.printed?.length);
  const total = Math.max(0, ...chunks.map((c) => c.end ?? 0));
  const body = chunks.filter((c) => BODY_CHAPTERS.has(c.chapter)).map((c) => ({ ...c, at: new Set(pagesOf(c, printed)) }));
  const titles = new Map<number, string>();
  for (const c of body) if (c.evalNo !== null && c.evalTitle && !titles.has(c.evalNo)) titles.set(c.evalNo, c.evalTitle);
  const pages = new Map<number, number>();
  const bodyPages = new Set<number>();
  for (const c of body) for (const p of c.at) bodyPages.add(p);
  for (const p of bodyPages) {
    const here = [...new Set(body.filter((c) => c.evalNo !== null && c.at.has(p)).map((c) => c.evalNo!))];
    for (const e of here) pages.set(e, (pages.get(e) ?? 0) + 1 / here.length);
  }
  const evals = [...pages].sort((a, b) => a[0] - b[0]).map(([no, n]) => ({ no, title: titles.get(no) ?? "", pages: Math.round(n * 100) / 100 }));
  const contentPages = new Set<number>();
  for (const c of chunks) if (CONTENT_CHAPTERS.has(c.chapter)) for (const p of pagesOf(c, printed)) if (!bodyPages.has(p)) contentPages.add(p);
  const directionPages = new Set<number>();
  for (const c of chunks) if (c.chapter === "direction") for (const p of pagesOf(c, printed)) if (!bodyPages.has(p)) directionPages.add(p);
  return { total, body: bodyPages.size, common: total - bodyPages.size, content: contentPages.size, evals, ...(directionPages.size ? { direction: directionPages.size } : {}) };
}

/**
 * 카드가 쓰는 본문 예산(2026-10-12 사용자 결정) = 작성분량 − 2025의 본문 아닌 내용 장 쪽. 2025 본문보다 크면 2025 본문 그대로(늘린 쪽을 채울 근거가 없음),
 * 작으면 그 값(0.5쪽 내림). 식이 0 이하(내용 장이 작성분량보다 많음 — 데이터가 이상)면 min(2025 본문, 작성분량)
 */
export function mgBodyBudget(volume: number, body: number, content: number): number {
  const raw = volume - content;
  if (!(raw > 0)) return Math.min(body, volume);
  return Math.min(body, Math.floor(raw * 2) / 2);
}

/**
 * 쪽 기준에 작성분량을 적용: 본문 = 본문 예산(mgBodyBudget), 예산이 2025 본문보다 작으면 평가내용 쪽을 비례로 줄여 0.5쪽 단위로
 * (내림 뒤 남는 반쪽을 나머지가 큰 평가내용부터 — 합 = 예산, 넘지 않음). 작성분량이 없는 지표·본문이 없는 지표는 그대로
 */
export function withMgVolume(ref: MgPageRef, volume: number | undefined): MgPageRef {
  if (volume === undefined || !ref.body) return ref;
  const budget = mgBodyBudget(volume, ref.body, ref.content);
  if (budget >= ref.body) return { ...ref, volume, body2025: ref.body };
  const scaled = ref.evals.map((e) => (e.pages * budget * 2) / ref.body);
  const halves = scaled.map((v) => Math.floor(v + 1e-9));
  let rest = Math.round(budget * 2) - halves.reduce((n, v) => n + v, 0);
  for (const i of scaled.map((_, i) => i).sort((a, b) => scaled[b] - halves[b] - (scaled[a] - halves[a]) || a - b)) {
    if (rest <= 0) break;
    halves[i]++;
    rest--;
  }
  return { ...ref, body: budget, volume, body2025: ref.body, evals: ref.evals.map((e, i) => ({ ...e, pages: halves[i] / 2, pages2025: e.pages })) };
}

/** 0.5쪽 단위로 반올림(표시용) */
export const halfPage = (n: number) => Math.round(n * 2) / 2;

/** 목차 1단 글 「평가내용 N. 제목」에서 평가내용 번호 */
export function evalNoOf(section: string): number | null {
  const m = /^평가내용 (\d+)\./.exec(section);
  return m ? Number(m[1]) : null;
}

const taskKey = (t: string) => t.split("-").map((x) => Number(x) || 0);
const byTask = (a: string, b: string) => {
  const [x, y] = [taskKey(a), taskKey(b)];
  return x[0] - y[0] || (x[1] ?? 0) - (y[1] ?? 0);
};

/** 지표 하나의 배정안: 목차 행(카드마다) + 카드가 없는 평가내용(참고 — 성과관리팀·주관 부서가 쓰는 자리) */
export interface MgOutlinePlan {
  rows: OutlineRow[];
  /** 카드가 하나도 대응하지 않는 평가내용 */
  orphan: MgEvalPages[];
}

/**
 * 배정안: 평가내용마다 쪽(본문 예산 몫 — withMgVolume, 작성분량이 없으면 2025 쪽)을 그 평가내용에 대응한 카드 수로 똑같이 나누고 카드마다 더함 → 0.5쪽 단위(카드당 0.5~10쪽, 큰 나머지 순으로 합을 맞춤).
 * 카드 ↔ 평가내용은 evalsFor(MG_CARD_EVALS ∩ 2025 평가내용, 없으면 그 지표의 평가내용 모두 — 혁신가점 12~14)
 */
export function buildMgOutline(unit: string, ref: MgPageRef, cards: Array<{ id: string; taskNo: string }>): MgOutlinePlan {
  const nos = ref.evals.map((e) => e.no);
  const list = [...cards].sort((a, b) => byTask(a.taskNo, b.taskNo)).map((c) => ({ ...c, evals: evalsFor(c.taskNo, nos) }));
  const raw = new Map(list.map((c) => [c.id, 0]));
  const orphan: MgEvalPages[] = [];
  for (const e of ref.evals) {
    const holders = list.filter((c) => c.evals.includes(e.no));
    if (!holders.length) {
      orphan.push(e);
      continue;
    }
    for (const c of holders) raw.set(c.id, raw.get(c.id)! + e.pages / holders.length);
  }
  // 0.5쪽(반쪽) 단위: 내림 뒤 남는 반쪽을 나머지가 큰 카드부터 — 합이 반올림한 전체와 같게, 카드마다 최소 반쪽·최대 20반쪽(report_outline 10쪽)
  const target = Math.round([...raw.values()].reduce((n, v) => n + v, 0) * 2);
  const halves = new Map(list.map((c) => [c.id, Math.min(20, Math.max(1, Math.floor(raw.get(c.id)! * 2)))]));
  let rest = target - [...halves.values()].reduce((n, v) => n + v, 0);
  for (const c of [...list].sort((a, b) => (raw.get(b.id)! * 2 - Math.floor(raw.get(b.id)! * 2)) - (raw.get(a.id)! * 2 - Math.floor(raw.get(a.id)! * 2)) || byTask(a.taskNo, b.taskNo))) {
    if (rest <= 0) break;
    if (halves.get(c.id)! >= 20) continue;
    halves.set(c.id, halves.get(c.id)! + 1);
    rest--;
  }
  const title = (no: number) => ref.evals.find((e) => e.no === no)?.title ?? "";
  const ordered = [...list].sort((a, b) => (a.evals[0] ?? 0) - (b.evals[0] ?? 0) || byTask(a.taskNo, b.taskNo));
  const rows = ordered.map((c, i) => {
    const first = c.evals[0];
    return {
      card_id: c.id,
      eval_unit_id: unit,
      section: first ? `평가내용 ${first}. ${title(first)}`.trim() : "평가내용 미지정",
      subsection: c.evals.length > 1 ? `평가내용 ${c.evals.join("·")}에 걸침` : null,
      sort: i,
      pages: halves.get(c.id)! / 2,
    };
  });
  return { rows, orphan };
}

/** 본문 예산 중 카드가 맡은 쪽(본문 − 카드 없는 평가내용, 0.5쪽 단위) — 목차·쪽 배정과 사업 조판이 같은 값을 씀 */
export function mgCardPages(ref: MgPageRef, orphan: MgEvalPages[]): number {
  return halfPage(ref.body - orphan.reduce((n, e) => n + e.pages, 0));
}

/** 배정 합과 카드가 맡은 본문 예산 비교 — ±1쪽 안이면 예산 수준 */
export function mgBudgetState(sum: number, ref: MgPageRef, orphan: MgEvalPages[]): "under" | "ok" | "over" {
  const base = mgCardPages(ref, orphan);
  if (sum < base - 1) return "under";
  if (sum > base + 1) return "over";
  return "ok";
}
