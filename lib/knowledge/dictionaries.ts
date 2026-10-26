// 명칭 사전: 주요사업·계량지표·평가내용·2025 보고서 쪽 범위.
// 근거: docs/analysis/공통지식-5종-분석.md §5-2, docs/analysis/2025-주요사업-outline.json

import { compactKey } from "./normalize.ts";
import type { BusinessId, EvalItem } from "./types.ts";

export interface BusinessEntry {
  id: BusinessId;
  /** 2026 카드 묶음 이름(seed/cards/260916) */
  cardGroup: string | null;
  name2026: string;
  name2025: string;
  aliases: string[];
}

export const BUSINESSES: BusinessEntry[] = [
  {
    id: "BZ-1",
    cardGroup: "주요사업1",
    name2026: "전파이용 기회 확대",
    name2025: "전파이용 기회 확대",
    aliases: ["전파이용기회 확대", "전파 이용기회 확대"],
  },
  {
    id: "BZ-2",
    cardGroup: "주요사업2",
    name2026: "국민안전 편익서비스 강화",
    name2025: "전파기반 대국민 서비스 강화",
    aliases: [],
  },
  {
    id: "BZ-3",
    cardGroup: "주요사업3",
    name2026: "방송통신미디어 산업 활성화",
    name2025: "ICT산업 활성화 지원",
    aliases: [],
  },
  {
    id: "BZ-4",
    cardGroup: null,
    name2026: "주요사업 계량지표 구성의 적합성 및 목표의 도전성",
    name2025: "주요사업 계량지표 구성의 적합성 및 목표의 도전성",
    aliases: ["지표 구성 적합성 및 목표의 도전성"],
  },
];

export function businessById(id: BusinessId): BusinessEntry {
  const b = BUSINESSES.find((x) => x.id === id);
  if (!b) throw new Error(`unknown business ${id}`);
  return b;
}

/** 글 안에서 주요사업 1~3 명칭(2025·2026·별칭)을 찾아 ID로 */
export function resolveBusiness(text: string): BusinessId | null {
  const key = compactKey(text);
  for (const b of BUSINESSES) {
    if (b.id === "BZ-4") continue;
    for (const name of [b.name2026, b.name2025, ...b.aliases]) {
      if (key.includes(compactKey(name))) return b.id;
    }
  }
  return null;
}

export function businessByCardGroup(group: string): BusinessId | null {
  return BUSINESSES.find((b) => b.cardGroup === group)?.id ?? null;
}

export type MetricRelation = "유지" | "명칭 변경" | "교체" | "폐지";

export interface MetricEntry {
  /** 2025 계량지표 명칭 */
  name2025: string;
  /** 붙임5 4절 "(xx 지표)" 태그 */
  tag: string;
  business: BusinessId;
  /** 2026 편람('26.1.29) 계량지표. 폐지면 null */
  name2026: string | null;
  relation: MetricRelation;
  aliases: string[];
  note?: string;
}

export const METRICS_2025: MetricEntry[] = [
  { name2025: "전파품질 조기 안정화 기여도", tag: "전파품질", business: "BZ-1", name2026: "전파품질 조기 안정화 기여도", relation: "유지", aliases: [] },
  { name2025: "공공용 주파수 신속 공급 성과", tag: "공공용", business: "BZ-1", name2026: "공공용 주파수 신속 공급 성과", relation: "유지", aliases: [] },
  {
    name2025: "인명구조 및 재난경보 무선국 관리 강화 성과",
    tag: "인명안전",
    business: "BZ-2",
    name2026: "인명구조 및 재난 관리 강화 성과",
    relation: "명칭 변경",
    aliases: [],
  },
  {
    name2025: "생활환경 전자파 안심 사회 구현 성과",
    tag: "전자파",
    business: "BZ-2",
    name2026: null,
    relation: "폐지",
    aliases: [],
    note: "'26 편람에 없음. 근로자 무사고 달성 노력이 신설·이동",
  },
  {
    name2025: "ICT기금 재정 효율화 성과",
    tag: "기금",
    business: "BZ-3",
    name2026: "기금 재정 효율화 성과",
    relation: "명칭 변경",
    aliases: ["ICT기금재정 효율화 성과"],
  },
  {
    name2025: "국내 방송콘텐츠 공동제작 및 투자 활성화",
    tag: "방송",
    business: "BZ-3",
    name2026: "국내 방송콘텐츠 OTT 방영 성과",
    relation: "교체",
    aliases: [],
  },
];

/** '26 편람에 새로 생긴 계량지표('25 대응 없음) */
export const NEW_METRICS_2026: Array<{ name: string; business: BusinessId; /** 관리계획 7월판 개선(안)(최종본)의 소속 — 편람(최초)과 다르면 */ business2026?: BusinessId; note: string }> = [
  { name: "근로자 무사고 달성 노력", business: "BZ-2", business2026: "BZ-1", note: "'26 신설. '25 생활환경 전자파 지표 자리. 편람(최초)은 주요사업2, 7월판 개선(안)은 주요사업1로 이동" },
];

export function resolveMetric2025(textOrTag: string): MetricEntry | null {
  const key = compactKey(textOrTag);
  if (!key) return null;
  for (const m of METRICS_2025) {
    if (key === compactKey(m.tag) || key === compactKey(`${m.tag} 지표`)) return m;
    for (const name of [m.name2025, ...m.aliases]) {
      if (key === compactKey(name) || key.includes(compactKey(name))) return m;
    }
  }
  return null;
}

/** 성과관리의 적정성 평가내용 ①~④ */
export const EVAL_ITEMS_BIZ: Record<number, EvalItem> = { 1: "계획", 2: "집행", 3: "성과", 4: "환류" };
/** 공통지표(BZ-4) 평가항목 ①~② */
export const EVAL_ITEMS_BZ4: Record<number, EvalItem> = { 1: "지표 적합성", 2: "목표 도전성" };

interface PageRange {
  from: number;
  to: number;
  business: BusinessId;
  eval_item: EvalItem | null;
  indicator: "계량" | "성과관리의 적정성" | "공통지표";
}

/** 2025 경영실적보고서(주요사업) 인쇄 쪽 → 사업·평가내용. outline JSON에서 옮김 */
export const REPORT_2025_PAGES: PageRange[] = [
  { from: 113, to: 113, business: "BZ-1", eval_item: null, indicator: "계량" },
  { from: 114, to: 118, business: "BZ-1", eval_item: "계획", indicator: "성과관리의 적정성" },
  { from: 119, to: 135, business: "BZ-1", eval_item: "집행", indicator: "성과관리의 적정성" },
  { from: 136, to: 137, business: "BZ-1", eval_item: "성과", indicator: "성과관리의 적정성" },
  { from: 138, to: 139, business: "BZ-1", eval_item: "환류", indicator: "성과관리의 적정성" },
  { from: 140, to: 140, business: "BZ-2", eval_item: null, indicator: "계량" },
  { from: 141, to: 145, business: "BZ-2", eval_item: "계획", indicator: "성과관리의 적정성" },
  { from: 146, to: 162, business: "BZ-2", eval_item: "집행", indicator: "성과관리의 적정성" },
  { from: 163, to: 164, business: "BZ-2", eval_item: "성과", indicator: "성과관리의 적정성" },
  { from: 165, to: 166, business: "BZ-2", eval_item: "환류", indicator: "성과관리의 적정성" },
  { from: 167, to: 167, business: "BZ-3", eval_item: null, indicator: "계량" },
  { from: 168, to: 172, business: "BZ-3", eval_item: "계획", indicator: "성과관리의 적정성" },
  { from: 173, to: 190, business: "BZ-3", eval_item: "집행", indicator: "성과관리의 적정성" },
  { from: 191, to: 192, business: "BZ-3", eval_item: "성과", indicator: "성과관리의 적정성" },
  { from: 193, to: 194, business: "BZ-3", eval_item: "환류", indicator: "성과관리의 적정성" },
  { from: 195, to: 197, business: "BZ-4", eval_item: "지표 적합성", indicator: "공통지표" },
  { from: 198, to: 200, business: "BZ-4", eval_item: "목표 도전성", indicator: "공통지표" },
];

export function report2025Page(page: number): PageRange | null {
  return REPORT_2025_PAGES.find((r) => page >= r.from && page <= r.to) ?? null;
}

/** 조각 머리말용 사업 이름. 2025·2026 명칭이 다르면 둘 다 적습니다 */
export function businessLabel(id: BusinessId): string {
  if (id === "BZ-4") return "공통지표(주요사업 계량지표 구성의 적합성 및 목표의 도전성)";
  const b = businessById(id);
  const head = `주요사업${id.slice(3)} ${b.name2026}`;
  return b.name2025 === b.name2026 ? head : `${head}('25 ${b.name2025})`;
}

export function businessShort(id: BusinessId): string {
  return id === "BZ-4" ? "공통지표" : `주요사업${id.slice(3)}`;
}
