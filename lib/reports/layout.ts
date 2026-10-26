// 경평 초안 블록 배치(순수, 2026-10-12 「같은 양식 찍어내기」 ④ 배치 골격 다양화). 블록 내용과 따로 두는 두 필드로 정합니다:
//  - layout(라벨을 어떻게 그리나): 없음 = 라벨 사다리(왼쪽 어두운 라벨 칸 — 2025 기본 골격) · full = 전폭(라벨 칸 없이 판 전체, 라벨 글은 그리지 않고 짜임 이름으로만 남음)
//    · stage = 단 띠(라벨이 위쪽 띠 제목이 되고 같은 라벨의 이어진 블록이 그 띠 아래 전폭으로 — 도입 → 전개 → 마무리, □ 소과제 묶음)
//  - span(폭): half = 가로 반씩(바로 다음 블록도 half이고 같은 그릇·같은 라벨·같은 절이면 둘이 나란히 반씩 — 짝이 없으면 무시)
// 근거: 표준보고서 컨설팅 자료(data/templates/표준보고서/report-template-structure-2411.pdf) 1-5 세로전개 예시(12쪽 — 번호 단계 + 오른쪽 상자 나란히)·
// 1-6 가로전개 예시(14쪽 — 라벨 칸 없는 전폭 쉐브론 머리 표)·1-2/1-3(전개 1·2·3 단), 도식 Pool 정의서 2~5단 판정표(diagram-pool.md),
// 2025 경영관리 보고서 □ 소주제 묶음 13/52절·2열 나란히(MG-11 p5·MG-13 p5·MG-2 p9·p11 — docs/analysis/2025-경영관리-경영실적보고서-분석.md §8).
// 두 필드가 없는 블록은 예전과 똑같이 그립니다(렌더러·판면 어림이 이 모듈의 묶음 하나를 같이 씀 — section-html.ts blocksBody·fit.ts fitReport·blockRooms).

import type { BlockKind } from "./blocks.ts";

/** 라벨 그리기(없으면 라벨 사다리) */
export const BLOCK_LAYOUTS = ["full", "stage"] as const;
export type BlockLayout = (typeof BLOCK_LAYOUTS)[number];
/** 폭(없으면 그릇 폭 전부) */
export const BLOCK_SPANS = ["half"] as const;
export type BlockSpan = (typeof BLOCK_SPANS)[number];

/** 화면·요청 글 이름 — 키 ""는 기본(라벨 사다리) */
export const LAYOUT_LABEL: Record<"" | BlockLayout, string> = { "": "라벨 사다리", full: "전폭", stage: "단 띠" };
export const SPAN_LABEL: Record<BlockSpan, string> = { half: "가로 반씩" };
/** 화면 설명(언제 쓰나) */
export const LAYOUT_USE: Record<"" | BlockLayout | BlockSpan, string> = {
  "": "왼쪽 어두운 라벨 칸 + 내용(2025 기본 골격). 같은 라벨이 이어지면 한 행",
  full: "라벨 칸 없이 판 전체 폭(170mm) — 칸이 많은 흐름·표를 넓게. 라벨 글은 안 보임",
  stage: "라벨이 위쪽 단 이름 띠가 되고 같은 라벨의 이어진 블록이 그 아래 전폭으로(도입 → 전개 → 마무리·소과제 묶음)",
  half: "바로 다음 블록과 나란히 반씩(두 블록 모두 고름 — 현황 ↔ 대응, 단계 ↔ 결과 상자처럼 짝인 두 블록)",
};

/** 라벨이 있어도 늘 전폭인 종류(띠·메시지 띠·인용 상자·소제목·우수사례 — 렌더러 FULL_KINDS) */
export const FULL_KINDS: ReadonlySet<string> = new Set<BlockKind>(["band", "banner", "quotes", "subhead", "case"]);
/** 반 폭으로 두지 않는 종류: 판을 가로지르는 띠·소제목, 행 오른쪽에 붙는 막대 */
const NO_HALF: ReadonlySet<string> = new Set<BlockKind>(["band", "banner", "subhead", "chart"]);
/** 가로 반씩으로 둘 수 있는 종류인지(화면 고르기) */
export const canHalf = (kind: string) => !NO_HALF.has(kind);
/** 가로 반씩 두 블록 사이(mm — section-css .k-pair column-gap과 같은 값) */
export const PAIR_GAP_MM = 4;

/** 배치를 볼 블록 값(내용 필드 없이) */
export type LayoutBlock = { kind: string; label: string; layout?: string; span?: string };

/** 목록 밖 값·이 종류에 뜻이 없는 값은 없앰(전폭 종류의 full은 기본과 같음) */
export function cleanLayout(kind: string, layout: unknown): BlockLayout | undefined {
  if (layout === "stage") return "stage";
  if (layout === "full" && !FULL_KINDS.has(kind)) return "full";
  return undefined;
}
export function cleanSpan(kind: string, span: unknown): BlockSpan | undefined {
  return span === "half" && !NO_HALF.has(kind) ? "half" : undefined;
}

/** 블록이 놓이는 그릇: row = 라벨 사다리 행 · stage = 단 띠 아래 · full = 전폭(라벨 없는 블록·전폭 종류·layout full) */
export function containerOf(b: LayoutBlock): "row" | "stage" | "full" {
  if (b.layout === "stage" && b.label) return "stage";
  if (b.layout === "full" || !b.label || FULL_KINDS.has(b.kind)) return "full";
  return "row";
}

/** 묶음 하나: 그릇과 단위(블록 하나 또는 가로 반씩 짝 둘 — 블록 순번) */
export interface LayoutGroup {
  type: "row" | "stage" | "full";
  /** 사다리 행 라벨·단 띠 이름(전폭은 빈 글) */
  label: string;
  units: number[][];
}

const isHalf = (b: LayoutBlock) => cleanSpan(b.kind, b.span) === "half";

/**
 * 블록 목록 → 묶음(렌더러·판면 어림 공용, 결정론). 사다리 행: 이어진 같은 라벨 블록(예전과 같음). 단 띠: 이어진 같은 라벨·같은 절의 stage 블록.
 * 전폭: 블록마다 한 묶음(가로 반씩 짝이면 둘). 가로 반씩 짝 = 이 블록과 바로 다음 블록이 둘 다 half이고 같은 그릇·같은 라벨(전폭은 라벨 무관)·같은 절.
 * at(경영관리 spec.mg.at)을 주면 짝·단 띠는 절을 넘지 않음(사다리 행 묶음은 예전 어림 그대로 — 렌더러는 절마다 따로 그림)
 */
export function layoutGroups(blocks: LayoutBlock[], at?: string[]): LayoutGroup[] {
  const out: LayoutGroup[] = [];
  const samePart = (i: number, j: number) => !at || at[i] === at[j];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    const type = containerOf(b);
    const nx = blocks[i + 1];
    const pair = Boolean(nx) && isHalf(b) && isHalf(nx) && containerOf(nx) === type && (type === "full" || nx.label === b.label) && samePart(i, i + 1);
    const unit = pair ? [i, i + 1] : [i];
    const last = out.at(-1);
    const prev = last?.units.at(-1)?.at(-1);
    if (last && type !== "full" && last.type === type && last.label === b.label && (type === "row" || (prev !== undefined && samePart(prev, i)))) last.units.push(unit);
    else out.push({ type, label: type === "full" ? "" : b.label, units: [unit] });
    i += unit.length;
  }
  return out;
}

/** 짝이 없는 half를 걷음(구성안·초안 정리 — 화면·요청에 「가로 반씩」이 짝 없이 남지 않게). 바꾼 수를 돌려줌 */
export function dropLoneSpans<T extends LayoutBlock>(blocks: T[], at?: string[]): number {
  const paired = new Set(layoutGroups(blocks, at).flatMap((g) => g.units.filter((u) => u.length === 2).flat()));
  let n = 0;
  blocks.forEach((b, i) => {
    if (b.span !== undefined && !paired.has(i)) {
      delete b.span;
      n += 1;
    }
  });
  return n;
}

/** 블록의 배치 이름(화면 칩·요청 글): 「라벨 사다리」·「전폭 · 가로 반씩」 등 */
export function layoutName(b: { layout?: string; span?: string }): string {
  const l = b.layout === "full" || b.layout === "stage" ? LAYOUT_LABEL[b.layout] : LAYOUT_LABEL[""];
  return b.span === "half" ? `${l} · ${SPAN_LABEL.half}` : l;
}

/** 배치 필드만(내용 필드 없이) — 구성안 블록 → 초안 블록으로 옮길 때 */
export const layoutFields = (b: { kind: string; layout?: unknown; span?: unknown }): { layout?: BlockLayout; span?: BlockSpan } => {
  const layout = cleanLayout(b.kind, b.layout);
  const span = cleanSpan(b.kind, b.span);
  return { ...(layout ? { layout } : {}), ...(span ? { span } : {}) };
};

/** 라벨 사다리 아닌 배치를 쓰는가(전폭·단 띠 블록 또는 가로 반씩 짝) — 측정·경고용 */
export function usesOtherLayout(blocks: LayoutBlock[], at?: string[]): boolean {
  return layoutGroups(blocks, at).some((g) => g.type === "stage" || g.units.some((u) => u.length === 2)) || blocks.some((b) => cleanLayout(b.kind, b.layout) === "full");
}
