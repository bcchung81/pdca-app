// 과제별 초안의 「전년도 보고서 같은 과제 절」 고르기(결정론, 순수).
// 2026 과제관리카드 1장 ↔ 2025년도 경영실적보고서 평가내용2 소항목(공통 지식 rpt25-biz, unit report_section)을
// 같은 주요사업 안에서 글자 두 개 묶음(bigram) TF-IDF 코사인으로 견줍니다. 제목·실행과제 글은 무게를 더 줍니다.

import { cardFindings } from "./findings.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

export interface PriorSection {
  key: string;
  business: string;
  taskNo: string;
  mark: string;
  title: string;
  taskTitle: string;
  targetName: string;
  page: number | null;
  text: string;
}

export interface PriorPick {
  section: PriorSection;
  score: number;
}

/** 이 점수 아래면 「같은 과제」로 보지 않음(59장 실측: 짝이 맞는 절은 0.2 넘음, 엉뚱한 절은 0.1 안팎) */
export const PRIOR_MIN_SCORE = 0.16;
/** 둘째 절은 첫째 점수의 이만큼 이상일 때만(한 과제가 전년 절 두 개에 걸친 경우) */
export const PRIOR_SECOND_RATIO = 0.8;

const hangulText = (s: string) => s.replace(/[^가-힣A-Za-z0-9]+/g, " ").toLowerCase();

/** 낱말 안 글자 두 개 묶음(띄어쓰기 경계는 넘지 않음) */
function bigrams(s: string, weight: number, into: Map<string, number>): void {
  for (const w of hangulText(s).split(" ")) {
    if (w.length < 2) continue;
    for (let i = 0; i < w.length - 1; i++) {
      const g = w.slice(i, i + 2);
      into.set(g, (into.get(g) ?? 0) + weight);
    }
  }
}

const lines = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((x) => (typeof x === "string" ? [x] : x && typeof x === "object" ? [String((x as Json).text ?? (x as Json).line ?? "")] : [])) : []);

/** 카드 → 가중 bigram(제목·실행과제·대상사업 3배, 본문 1배) */
export function cardVector(card: Json): Map<string, number> {
  const v = new Map<string, number>();
  bigrams([card?.title, card?.executionTask, card?.targetBusiness].filter(Boolean).join(" "), 3, v);
  const body = [
    ...(card?.do?.items ?? []).map((it: Json) => `${it?.heading ?? ""} ${it?.text ?? ""}`),
    ...lines(card?.plan?.lines),
    // 지적 칸은 실제 지적 줄만(「경영평가 지적사항 없음」 줄은 닮은 정도에 넣지 않음 — findings.ts, 2026-10-14)
    ...cardFindings(card),
    ...lines(card?.outcome?.quantitative),
    ...lines(card?.outcome?.qualitative),
    ...(card?.kpi?.rows ?? []).map((r: Json) => `${r?.name ?? ""} ${r?.formula ?? ""}`),
    ...(card?.do?.monthly ?? []).flatMap((m: Json) => lines(m?.items)),
  ].join(" ");
  bigrams(body, 1, v);
  return v;
}

export function sectionVector(s: PriorSection): Map<string, number> {
  const v = new Map<string, number>();
  bigrams(`${s.title} ${s.taskTitle} ${s.targetName}`, 3, v);
  bigrams(s.text, 1, v);
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>, idf: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [g, x] of a) {
    const w = idf.get(g) ?? 0;
    const xa = x * w;
    na += xa * xa;
    const y = b.get(g);
    if (y) dot += xa * y * w;
  }
  for (const [g, y] of b) {
    const w = idf.get(g) ?? 0;
    nb += y * w * (y * w);
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** 같은 주요사업 절 모두의 닮은 정도(높은 순) */
export function scorePrior(card: Json, sections: PriorSection[]): PriorPick[] {
  if (!sections.length) return [];
  const vecs = sections.map(sectionVector);
  // 절들에서 흔한 묶음(사업·추진·강화 같은)은 무게를 낮춤
  const df = new Map<string, number>();
  for (const v of vecs) for (const g of v.keys()) df.set(g, (df.get(g) ?? 0) + 1);
  const n = sections.length;
  const idf = new Map([...df].map(([g, d]) => [g, Math.log((n + 1) / (d + 0.5))]));
  const cv = cardVector(card);
  return sections.map((section, i) => ({ section, score: Math.round(cosine(cv, vecs[i], idf) * 1000) / 1000 })).sort((a, b) => b.score - a.score);
}

/**
 * 카드와 닮은 순(같은 bigram TF-IDF 코사인) — 전년 절 말고도 붙임2 사례처럼 제목·글이 있는 자료에 씀(참고자료 설계 §4.3 「닮은 순서」).
 * head는 3배 무게(제목·사업명). 점수가 같으면 들어온 순서(적재 순서) 그대로
 */
export function rankSimilar(card: Json, docs: Array<{ key: string; head: string; text: string }>): Array<{ key: string; score: number }> {
  if (!docs.length) return [];
  const vecs = docs.map((d) => {
    const v = new Map<string, number>();
    bigrams(d.head, 3, v);
    bigrams(d.text, 1, v);
    return v;
  });
  const df = new Map<string, number>();
  for (const v of vecs) for (const g of v.keys()) df.set(g, (df.get(g) ?? 0) + 1);
  const n = docs.length;
  const idf = new Map([...df].map(([g, d]) => [g, Math.log((n + 1) / (d + 0.5))]));
  const cv = cardVector(card);
  return docs
    .map((d, i) => ({ key: d.key, score: Math.round(cosine(cv, vecs[i], idf) * 1000) / 1000, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ key, score }) => ({ key, score }));
}

/** 같은 주요사업 절 중 카드와 닮은 절(점수 기준 넘는 것 최대 2개 — 둘째는 첫째의 80% 이상일 때만) */
export function pickPrior(card: Json, sections: PriorSection[]): PriorPick[] {
  const scored = scorePrior(card, sections);
  const top = scored[0];
  if (!top || top.score < PRIOR_MIN_SCORE) return [];
  const second = scored[1];
  return second && second.score >= PRIOR_MIN_SCORE && second.score >= top.score * PRIOR_SECOND_RATIO ? [top, second] : [top];
}

/** knowledge_chunks 행 → 전년 절 */
export function toPriorSection(row: { chunk_key: string; business: string | null; title: string; text: string; report_page_2025: number | null; meta: Json }): PriorSection {
  const m = row.meta ?? {};
  return {
    key: row.chunk_key,
    business: row.business ?? "",
    taskNo: String(m.task_no ?? ""),
    mark: String(m.mark ?? ""),
    title: String(m.title ?? row.title),
    taskTitle: String(m.task_title ?? ""),
    targetName: String(m.target_name ?? ""),
    page: row.report_page_2025,
    text: row.text,
  };
}

/** 프롬프트·화면용 이름: 「2025 보고서 1-1 가. 제목(p.119)」 */
export const priorLabel = (s: PriorSection) => `2025 보고서 ${s.taskNo} ${s.mark}. ${s.title}${s.page ? `(p.${s.page})` : ""}`;
