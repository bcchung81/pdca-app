// 경평 초안 근거 겹침(결정론, 순수) — 한글·영숫자 낱말 안 글자 두 개 묶음(bigram)이 근거 글에 얼마나 있는지.
// 평가 채점 도구(scripts/eval/eval-report-score.ts)에서 옮김(4단계 검증 보강 — 규칙 한 곳). 쓰임: 근거 약한 문장(초안 화면 점선·경고),
// 소항목끼리 같은 문장 찾기(5단계 사업 단위 조판). 판정이 아니라 신호입니다 — 사실 여부는 사람이 봄.

import { plainText } from "./fit.ts";
import type { ReportSectionSpec } from "./section.ts";

/** 근거 약함 기준: 문장의 글자 두 개 묶음 중 근거 글에 있는 비율이 이보다 낮으면. 0.35(평가 채점 기준)는 라벨을 뺀 뒤 M·N 16장에서 한 문장도 안 걸려(최저 0.42) 0.5로 올림(사용자 결정 2026-09-27) */
export const GROUND_WEAK = 0.5;

const hangulWord = (s: string) => s.replace(/[^가-힣A-Za-z0-9]+/g, " ").toLowerCase();

/** 글 → 낱말 안 글자 두 개 묶음 모음(한 글자 낱말은 뺌) */
export function bigramSet(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of hangulWord(s).split(" ")) {
    if (w.length < 2) continue;
    for (let i = 0; i < w.length - 1; i++) out.add(w.slice(i, i + 2));
  }
  return out;
}

/** 문장 하나의 근거 겹침(0~1) — 글자 두 개 묶음이 없으면(너무 짧음) null(판단하지 않음) */
export function overlapScore(sentence: string, sourceBigrams: Set<string>): number | null {
  const bg = bigramSet(plainText(sentence));
  if (bg.size === 0) return null;
  let hit = 0;
  for (const g of bg) if (sourceBigrams.has(g)) hit += 1;
  return Math.round((hit / bg.size) * 1000) / 1000;
}

/** 문장으로 볼 최소 길이(빈칸 뺀 글자) — 라벨·칸 머리 같은 짧은 이름은 판단하지 않음 */
const SENTENCE_MIN = 8;

/**
 * 근거를 볼 문장 목록: 불릿·칸 글·칸 결과 줄·전후 비교 칸·띠/정의 본문 + 추진성과. 라벨·블록 머리·칸 머리·칩·막대 수치는 이름이라 뺌
 * (4단계 보고: 라벨 「추진배경」이 겹침 0.33으로 약한 문장에 잡혔음), 인용·말풍선은 원문 대조를 따로 하므로 뺌
 */
export function groundedSentences(spec: Pick<ReportSectionSpec, "blocks" | "results">): string[] {
  const out: string[] = [];
  for (const b of spec.blocks ?? []) {
    if (b.kind === "quotes" || b.kind === "voices" || b.kind === "chart") continue;
    out.push(b.text, ...b.items, ...b.cells.flatMap((c) => [...c.bullets, c.note]), ...b.rows.flatMap((r) => [...r.before, ...r.after]));
  }
  out.push(...spec.results);
  return out.filter((s) => plainText(s ?? "").replace(/\s/g, "").length >= SENTENCE_MIN);
}

/** 문장마다 근거 겹침(판단하지 않은 짧은 문장은 뺌) */
export function groundScores(spec: Pick<ReportSectionSpec, "blocks" | "results">, sourceText: string): Array<{ text: string; overlap: number }> {
  const source = bigramSet(sourceText);
  return groundedSentences(spec)
    .map((text) => ({ text, overlap: overlapScore(text, source) }))
    .filter((x): x is { text: string; overlap: number } => x.overlap !== null);
}

/** 두 글의 닮은 정도(0~1): 글자 두 개 묶음의 겹침 ÷ 짧은 쪽 묶음 수(한쪽이 다른 쪽을 거의 품으면 1에 가까움) — 소항목끼리 같은 문장 찾기 */
export function textSimilarity(a: string, b: string): number {
  const x = bigramSet(plainText(a));
  const y = bigramSet(plainText(b));
  const n = Math.min(x.size, y.size);
  if (!n) return 0;
  let hit = 0;
  for (const g of x) if (y.has(g)) hit += 1;
  return Math.round((hit / n) * 1000) / 1000;
}
