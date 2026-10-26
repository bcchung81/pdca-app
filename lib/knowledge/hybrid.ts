// 하이브리드 검색 재현율 시험용 순수 함수(지식공급 하이브리드 선별 계획 3단계 — docs/plan/지식공급-하이브리드선별-계획.md §5 3·§6.1).
// 후보 집합(묶음 층 조각 중 선별 대상 성격) 안에서 여러 순위(글자 TF-IDF·PGroonga·로컬 임베딩)를 매기고 순위 융합(RRF)으로 합칩니다.
// 임베딩 계산·DB 읽기는 scripts/eval/hybrid-recall.ts가 하고, 여기는 입출력 없는 계산만 둡니다. 요청 때 쓰지 않습니다(계획 §5 3 — 미리 계산).

import type { KnowledgeBundle } from "./bundle.ts";
import { type ChunkRole, chunkRole, SELECTABLE_ROLES } from "./chunk-role.ts";
import { lensTopic } from "../reports/lens.ts";
import type { LooseJson } from "../loose-json.ts";

/** RRF 상수 — Cormack 외(2009)의 기본값 */
export const RRF_K = 60;

/**
 * Reciprocal Rank Fusion: 키마다 Σ 1/(k + 순위)(순위는 1부터). 목록에 없는 키는 그 목록 몫이 0.
 * 점수가 같으면 가장 좋은 순위가 앞선 것, 그것도 같으면 목록을 앞에서부터 처음 본 순서.
 */
export function rrf(lists: string[][], k = RRF_K): string[] {
  const score = new Map<string, number>();
  const best = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const list of lists) {
    list.forEach((key, i) => {
      if (!seen.has(key)) seen.set(key, seen.size);
      score.set(key, (score.get(key) ?? 0) + 1 / (k + i + 1));
      best.set(key, Math.min(best.get(key) ?? Infinity, i + 1));
    });
  }
  return [...score.keys()].sort((a, b) => score.get(b)! - score.get(a)! || best.get(a)! - best.get(b)! || seen.get(a)! - seen.get(b)!);
}

/** 상위 k건 안에 든 정답 비율. 정답이 없으면 null(0으로 세지 않음) */
export function recallAt(ranked: string[], positives: Iterable<string>, k: number): number | null {
  const pos = new Set(positives);
  if (!pos.size) return null;
  let hit = 0;
  for (const key of ranked.slice(0, k)) if (pos.has(key)) hit++;
  return hit / pos.size;
}

/** 코사인 순위(벡터는 정규화돼 있다고 보고 내적). 점수가 같으면 들어온 순서 */
export function rankByCosine(query: ArrayLike<number>, docs: Array<{ key: string; vec: ArrayLike<number> }>): string[] {
  const dot = (v: ArrayLike<number>) => {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * query[i];
    return s;
  };
  return docs
    .map((d, i) => ({ key: d.key, s: dot(d.vec), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.key);
}

/** 후보 집합: 묶음 층 조각 중 선별 대상 성격(SELECTABLE_ROLES)인 것, 층 순서 그대로. meta는 generic_section(방법론·기타 — 선별 대상 아님)에만 쓰여 넘기지 않음 */
export function selectableCandidates(bundle: KnowledgeBundle): Array<{ key: string; title: string; text: string; role: ChunkRole }> {
  return bundle.layers
    .flatMap((l) => l.refs)
    .map((r) => ({ key: r.key, title: r.title, text: r.text, role: chunkRole({ doc_id: "", unit_type: r.unitType }) }))
    .filter((c) => SELECTABLE_ROLES.includes(c.role));
}

const lines = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((x) => (typeof x === "string" ? [x] : x && typeof x === "object" ? [String((x as LooseJson).text ?? (x as LooseJson).line ?? "")] : [])) : []);

/**
 * 카드 → 검색 질의 글: 평가 관점 검색 글(lensTopic — 과제명·실행과제·지표·지적, 400자) + 카드 본문(대상사업·추진 내용·계획·성과·지적 개선계획·환류·월별 실적).
 * 임베딩 입력 상한이 모델마다 달라 maxChars에서 자릅니다(앞부분 = lensTopic이 먼저 남음). 두 트랙 카드 모양을 다 읽음
 */
export function cardQueryText(card: LooseJson, maxChars: number): string {
  const d = (card ?? {}) as LooseJson;
  const body = [
    d.indicatorName,
    d.targetBusiness,
    ...lines(d.do?.lines),
    ...lines(d.plan?.lines),
    ...lines(d.outcome?.quantitative),
    ...lines(d.outcome?.qualitative),
    ...(d.findings?.rows ?? []).flatMap((r: LooseJson) => lines(r?.plan)),
    ...(d.feedback?.rows ?? []).flatMap((r: LooseJson) => [...lines(r?.plan), ...lines(r?.self)]),
    ...(d.do?.monthly ?? []).flatMap((m: LooseJson) => lines(m?.items)),
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return [lensTopic(d), ...body].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, maxChars);
}
