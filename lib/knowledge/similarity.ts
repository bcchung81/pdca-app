// 글자 n-gram 비교. 카드 지적사항 ↔ 지적 행, 카드 제목 ↔ 과제 목록 대응에 씁니다.

import { compactKey } from "./normalize.ts";

export function charNgrams(text: string, n: number): Set<string> {
  const key = compactKey(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= key.length; i++) out.add(key.slice(i, i + n));
  return out;
}

/** a의 n-gram 가운데 b에 있는 비율(포함도). 짧은 요약(카드)이 긴 원문(지적)에 얼마나 들어 있는지 */
export function containment(a: string, b: string, n = 3): number {
  const A = charNgrams(a, n);
  if (A.size === 0) return 0;
  const B = charNgrams(b, n);
  let hit = 0;
  for (const g of A) if (B.has(g)) hit += 1;
  return hit / A.size;
}

/** Dice 계수(양쪽 대칭). 제목끼리 비교 */
export function dice(a: string, b: string, n = 2): number {
  const A = charNgrams(a, n);
  const B = charNgrams(b, n);
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const g of A) if (B.has(g)) hit += 1;
  return (2 * hit) / (A.size + B.size);
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const cs = [...s];
  for (let i = 0; i + 1 < cs.length; i++) {
    const g = cs[i] + cs[i + 1];
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/**
 * 글자 두 개씩 겹치는 정도(0~1) — 정규화 없이 받은 글 그대로, 같은 두 글자는 횟수까지 셈(다중집합).
 * 위 `dice`(compactKey 정규화 + 중복 없는 집합)와 다른 계산이라 따로 둠. 같은 글이면(빈 글 포함) 1, 한 글자 이하는 0.
 * 카드 칸 ↔ 원본 문단 맞춤(layout-bind)·팀 이름 비교(team-match)가 씀.
 */
export function bigramDice(a: string, b: string): number {
  if (a === b) return 1;
  if ([...a].length < 2 || [...b].length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let hit = 0;
  let na = 0;
  let nb = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  for (const [g, v] of A) hit += Math.min(v, B.get(g) ?? 0);
  return (2 * hit) / (na + nb);
}

export function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
