// 평가 라운드 묶음 요약(결정론, 순수) — scripts/eval/eval-report-score.ts가 초안 8장의 분포를 셈.
// 2026-10-09 틀 고르기 개선의 판정 지표: 틀(주 + 보조) 분포·섞음 비율·첫 블록 분포(평가 라운드 O: 섞음 5/8, 첫 블록 불릿 8/8)
// 2026-10-12 도식 다양화의 판정 지표: 모양(kind:variant) 단위 분포(shapeStats — scripts/eval/shape-stats.ts가 주요사업·경영관리 초안을 함께 셈)
// 2026-10-12 배치 골격 다양화의 판정 지표: 배치별 블록 수·라벨 사다리 아닌 배치를 쓴 카드 비율(layoutStats — 같은 스크립트)

import { PLAIN_KINDS, isOwnKind, shapeKeyOf, shapeVariety } from "./diagram-hints.ts";
import { type LayoutBlock, layoutGroups, usesOtherLayout } from "./layout.ts";

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const sorted = (m: Map<string, number>) => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
const count = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

/** 도식 종류 분포(초안마다 쓴 종류 목록) — 많은 순 횟수·상위 3 비중·엔트로피(비트) */
export function kindStats(lists: string[][]): { frequency: Record<string, number>; top3Share: number; entropyBits: number } {
  const m = count(lists.flat());
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  if (!total) return { frequency: {}, top3Share: 0, entropyBits: 0 };
  const values = [...m.values()].sort((a, b) => b - a);
  const top3 = values.slice(0, 3).reduce((a, b) => a + b, 0) / total;
  const entropy = -values.reduce((n, c) => n + (c / total) * Math.log2(c / total), 0);
  return { frequency: sorted(m), top3Share: round3(top3), entropyBits: round3(entropy) };
}

/** 틀 분포: 주 틀·보조 틀 횟수, 섞음 비율(틀이 있는 초안 중), 쓰인 주 틀 수(섞음 제외), 보조 틀이 있는 초안 수 */
export function storyStats(items: Array<{ story?: string; subStory?: string }>): { main: Record<string, number>; sub: Record<string, number>; mixShare: number; distinctMain: number; withSub: string } {
  const withStory = items.filter((x) => x.story);
  const main = count(withStory.map((x) => x.story!));
  const sub = count(withStory.map((x) => x.subStory ?? "").filter(Boolean));
  return {
    main: sorted(main),
    sub: sorted(sub),
    mixShare: withStory.length ? round3((main.get("섞음") ?? 0) / withStory.length) : 0,
    distinctMain: [...main.keys()].filter((k) => k !== "섞음").length,
    withSub: `${withStory.filter((x) => x.subStory).length}/${withStory.length}`,
  };
}

/** 첫 블록 분포(많은 순)와 불릿으로 연 비율 */
export function firstBlockStats(firsts: string[]): { firstBlocks: Record<string, number>; bulletsShare: number } {
  if (!firsts.length) return { firstBlocks: {}, bulletsShare: 0 };
  const m = count(firsts);
  return { firstBlocks: sorted(m), bulletsShare: round3((m.get("bullets") ?? 0) / firsts.length) };
}

/** 표 모양 4종(2026-10-12에 더한 table 모양) */
export const NEW_TABLE_SHAPES = ["table:result", "table:bars", "table:chevron", "table:ladder"] as const;

export interface ShapeCardStat {
  id: string;
  /** 블록 수(전부) */
  blocks: number;
  /** 글·띠(불릿·소제목·가치 띠·메시지 띠)를 뺀 블록 수 */
  counted: number;
  /** 그중 서로 다른 모양 수 */
  distinct: number;
  /** distinct ÷ counted(센 블록이 없으면 0) */
  ratio: number;
}

/**
 * 모양 단위 세트 지표(결정론): 초안마다 블록(kind·variant)을 받아 카드별 서로 다른 모양 수, 세트 전체 모양 분포(글·띠 제외)의
 * 많은 순 횟수·상위 3 점유·엔트로피, 표(table 모든 모양) 비중, 이 과제만의 요소가 하나라도 있는 카드 비율, 새 표 모양 사용 수
 */
export function shapeStats(drafts: Array<{ id: string; blocks: Array<{ kind: string; variant: string }> }>): {
  cards: ShapeCardStat[];
  frequency: Record<string, number>;
  top3Share: number;
  entropyBits: number;
  tableShare: number;
  ownCards: string;
  ownShare: number;
  newShapes: Record<string, number>;
  avgDistinct: number;
  avgRatio: number;
} {
  const cards = drafts.map((d) => {
    const v = shapeVariety(d.blocks);
    return { id: d.id, blocks: d.blocks.length, counted: v.counted, distinct: v.distinct, ratio: v.counted ? round3(v.distinct / v.counted) : 0 };
  });
  const lists = drafts.map((d) => d.blocks.filter((b) => !PLAIN_KINDS.has(b.kind)).map(shapeKeyOf));
  const k = kindStats(lists);
  const all = lists.flat();
  const own = drafts.filter((d) => d.blocks.some((b) => isOwnKind(b.kind))).length;
  const newShapes = Object.fromEntries(NEW_TABLE_SHAPES.map((x) => [x, all.filter((y) => y === x).length]));
  const avg = (xs: number[]) => (xs.length ? round3(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  return {
    cards,
    frequency: k.frequency,
    top3Share: k.top3Share,
    entropyBits: k.entropyBits,
    tableShare: all.length ? round3(all.filter((x) => x.split(":")[0] === "table").length / all.length) : 0,
    ownCards: `${own}/${drafts.length}`,
    ownShare: drafts.length ? round3(own / drafts.length) : 0,
    newShapes,
    avgDistinct: avg(cards.map((c) => c.distinct)),
    avgRatio: avg(cards.map((c) => c.ratio)),
  };
}

/** 배치 이름(측정 표 — 렌더러 묶음 기준): 가로 반씩 짝 안 블록이 먼저, 그다음 그릇 */
export const LAYOUT_KEYS = ["라벨 사다리", "단 띠", "전폭(배치)", "전폭(라벨 없음·전폭 종류)", "가로 반씩"] as const;

/**
 * 배치 지표(결정론): 초안마다 블록(kind·label·layout·span — 경영관리는 절 열쇠 at)을 받아 배치별 블록 수(렌더러와 같은 묶음 layoutGroups —
 * 가로 반씩 짝 안의 블록은 「가로 반씩」, 그 밖은 그릇: 사다리 행·단 띠·전폭(배치로 고른 것 / 라벨 없음·전폭 종류)),
 * 라벨 사다리 아닌 배치(전폭 배치·단 띠·가로 반씩 짝)를 하나라도 쓴 카드 수·비율. 「라벨 없음·전폭 종류」는 예전에도 있던 전폭이라 「아닌 배치」에 안 셈
 */
export function layoutStats(drafts: Array<{ id: string; blocks: LayoutBlock[]; at?: string[] }>): { blocks: Record<string, number>; share: Record<string, number>; otherCards: string; otherShare: number; cards: Array<{ id: string; other: boolean }> } {
  const m = new Map<string, number>(LAYOUT_KEYS.map((k) => [k, 0]));
  for (const d of drafts)
    for (const g of layoutGroups(d.blocks, d.at))
      for (const u of g.units)
        for (const j of u) {
          const b = d.blocks[j];
          const key = u.length === 2 ? "가로 반씩" : g.type === "row" ? "라벨 사다리" : g.type === "stage" ? "단 띠" : b.layout === "full" ? "전폭(배치)" : "전폭(라벨 없음·전폭 종류)";
          m.set(key, (m.get(key) ?? 0) + 1);
        }
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const cards = drafts.map((d) => ({ id: d.id, other: usesOtherLayout(d.blocks, d.at) }));
  const other = cards.filter((c) => c.other).length;
  return {
    blocks: Object.fromEntries(m),
    share: Object.fromEntries([...m].map(([k, n]) => [k, total ? round3(n / total) : 0])),
    otherCards: `${other}/${drafts.length}`,
    otherShare: drafts.length ? round3(other / drafts.length) : 0,
    cards,
  };
}
