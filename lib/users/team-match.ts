// 엑셀에 적힌 팀 표기를 DB의 팀(teams)과 견줘 자동 확정하거나 추천합니다(입출력 없음).
//
// 이 결과는 「어느 팀 카드를 보는가」(접근 범위)로 곧바로 이어지므로 틀리게 자동 확정하지 않는 것이 첫째 원칙입니다.
//  · 자동 확정(exact)은 오판 여지가 없는 경우뿐 — 팀명은 조직 전체에서 고유(teams.name unique)이므로
//    ① 전체가 팀명과 같음 ② 괄호·슬래시·공백으로 나눈 조각 하나가 팀명과 같음 ③ 본부명+팀명이 붙어 있음
//  · 나머지는 추천(suggest) — 화면에서 사람이 확인해 체크해야 반영됩니다. 이름이 비슷한 팀 쌍
//    (전파혁신전략팀/추진팀, 검사관리팀/기획팀, 기금○○팀들)을 글자 유사도만으로 고르지 않기 위함입니다.

import { bigramDice } from "../knowledge/similarity.ts";
import type { Suggestion, TeamMatch, TeamRef } from "./types.ts";

// 가운뎃점 변형(·ㆍ・･•∙⋅‧)과 마침표·쉼표는 NFKC가 자모로 바꾸기 전에 없앱니다(위성·공공전파팀 ↔ 위성ㆍ공공전파팀)
const DOTS = /[·ㆍ・･•∙⋅‧,.]/g;
const PUNCT = /[()（）［］[\]{}<>「」『』"'`~!?:;|/\\\-–—_]/g;
const SPLIT = /[()（）［］[\]{}<>「」『』/\\,;:|→\-–—]+|\s+/;
const SUFFIX = /(팀|센터|단|tf|본부|부|실)$/;
const SUGGEST_MIN = 0.45;
const SUGGEST_MAX = 3;

/** 팀·본부 이름 비교용 정규화: 가운뎃점·공백·괄호 제거, 유니코드 정규화, 영문 소문자 */
export function normalizeName(s: string): string {
  return s.replace(DOTS, "").normalize("NFKC").toLowerCase().replace(/[\s ​]+/g, "").replace(PUNCT, "");
}

const stem = (n: string) => n.replace(SUFFIX, "");

/** 글자 2-그램 Dice 계수(0~1) — 계산은 `bigramDice`(knowledge/similarity.ts), 빈 글은 0 */
export function dice(a: string, b: string): number {
  return a && b ? bigramDice(a, b) : 0;
}

interface Indexed {
  team: TeamRef;
  name: string;
  hq: string;
}

/** 조각 하나(또는 전체)에 대한 한 팀의 유사도와 이유 */
function scoreOne(cs: string, t: Indexed): { score: number; reason: string } {
  let best = { score: 0, reason: "" };
  const take = (score: number, reason: string) => {
    if (score > best.score) best = { score, reason };
  };
  if (cs.length >= 2 && stem(cs) === stem(t.name) && stem(t.name).length >= 2) take(0.97, "「팀」·「센터」 같은 끝말만 다름");
  if (t.name.length >= 3 && cs.includes(t.name)) take(0.92, "팀명이 포함됨");
  if (cs.length >= 3 && t.name.includes(cs)) take(0.55 + 0.35 * (cs.length / t.name.length), "팀명의 일부만 적힘");
  take(dice(cs, t.name), "글자가 비슷함");
  if (t.hq) take(dice(cs, t.hq + t.name) * 0.95, "글자가 비슷함");
  return best;
}

/**
 * 팀 표기 하나를 DB 팀과 견줍니다. teams는 카드가 연결된 활성 팀 목록.
 * 빈 글이면 none.
 */
export function matchTeam(text: string, teams: readonly TeamRef[]): TeamMatch {
  const n = normalizeName(text);
  if (!n) return { kind: "none" };
  const idx: Indexed[] = teams.map((team) => ({ team, name: normalizeName(team.name), hq: team.hq ? normalizeName(team.hq) : "" }));
  const byName = new Map<string, Indexed[]>();
  for (const t of idx) byName.set(t.name, [...(byName.get(t.name) ?? []), t]);
  const hqs = new Set(idx.map((t) => t.hq).filter(Boolean));

  // ① 전체가 팀명과 같음
  const whole = byName.get(n);
  if (whole?.length === 1) return { kind: "exact", teamId: whole[0].team.id, reason: "팀명 일치" };

  // ③ 본부명+팀명이 붙어 있음(구분 없이 이어 적음)
  const glued = idx.filter((t) => t.hq && t.hq + t.name === n);
  if (glued.length === 1) return { kind: "exact", teamId: glued[0].team.id, reason: "본부+팀명 일치" };

  // ② 나눈 조각 하나가 팀명과 같음(전파기반본부(검사기획팀), 전파기반본부 검사기획팀, 본부/팀 …)
  const segs = [...new Set(text.split(SPLIT).map(normalizeName).filter(Boolean))];
  const named = new Map<number, Indexed>();
  for (const s of segs) for (const t of byName.get(s) ?? []) named.set(t.team.id, t);
  if (named.size === 1) {
    const t = [...named.values()][0];
    const hqSeg = segs.find((s) => hqs.has(s));
    const reason = hqSeg && hqSeg === t.hq ? "본부+팀명 일치" : "팀명 일치";
    const warn = hqSeg && hqSeg !== t.hq ? `입력한 본부(${hqSeg})와 이 팀의 본부(${t.team.hq ?? "없음"})가 다릅니다` : undefined;
    return { kind: "exact", teamId: t.team.id, reason, ...(warn ? { warn } : {}) };
  }
  if (named.size > 1) {
    const candidates = [...named.values()].map((t) => ({ teamId: t.team.id, score: 0.9, reason: "팀명이 여러 개 적혀 있음" }));
    return { kind: "suggest", candidates: candidates.slice(0, SUGGEST_MAX) };
  }

  // 본부명만 적힘 → 그 본부의 팀들을 후보로
  const hqOnly = segs.find((s) => hqs.has(s)) ?? (hqs.has(n) ? n : undefined);
  if (hqOnly && segs.every((s) => hqs.has(s))) {
    const list = idx.filter((t) => t.hq === hqOnly);
    return { kind: "suggest", candidates: list.map((t) => ({ teamId: t.team.id, score: 0.5, reason: "본부만 적혀 있음 — 팀을 골라 주세요" })) };
  }

  // 나머지: 전체와 각 조각을 모든 팀과 견줘 상위 후보
  const pieces = [...new Set([n, ...segs])].filter((s) => s.length >= 2);
  const scored: Suggestion[] = [];
  for (const t of idx) {
    let best = { score: 0, reason: "" };
    for (const p of pieces) {
      const r = scoreOne(p, t);
      if (r.score > best.score) best = r;
    }
    if (best.score >= SUGGEST_MIN) scored.push({ teamId: t.team.id, score: Math.round(best.score * 100) / 100, reason: best.reason });
  }
  scored.sort((a, b) => b.score - a.score || a.teamId - b.teamId);
  return scored.length ? { kind: "suggest", candidates: scored.slice(0, SUGGEST_MAX) } : { kind: "none" };
}

/** 드롭다운·표에 쓰는 이름: 「팀명 (본부)」 */
export function teamLabel(t: TeamRef): string {
  return t.hq ? `${t.name} (${t.hq})` : t.name;
}
