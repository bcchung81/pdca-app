// 실험: 과제 ↔ 공통 지식 조각의 「관련 있는가」 판단을 TypeSafe Jev(예/아니오 확률을 돌려주는 System One 모델)에 맡겨 보기.
// Claude light가 「확신/애매」를 스스로 말하는 것과 달리, Jev는 조각마다 0~1 확률을 돌려주므로 구간(임계값)을 코드가 정해 애매 비율을 조절·측정할 수 있다.
// 지금은 실험(scripts/eval/jev-match-experiment.ts — DB에 쓰지 않음)용이다. 채택하기로 하면 질문 문구(아래 QUESTION·CRITERIA)는
// 프로젝트 규칙대로 resources/prompts/<기능>/ 파일로 옮긴다. 순수 함수 + 주입 가능한 HTTP 호출이라 server-only 없이 시험할 수 있음.
// 문서: https://docs.typesafe.ai/primitives/noul.md · https://docs.typesafe.ai/api.md · 재순위 요리책 https://docs.typesafe.ai/cookbooks/rerank_typesafe.md

import type { BundleChunk } from "../knowledge/bundle.ts";
import { flattenHtmlTables } from "../knowledge/rich-text.ts";
import type { LooseJson } from "../loose-json.ts";


export interface NoulQuestion {
  type: "noul";
  instructions: string | Record<string, unknown>;
  criteria?: { true: string; false: string };
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, { type: string; noul?: number }>;
  usage: { input_tokens: number; output_tokens: number };
}

export type SystemOneCall = (req: { state: unknown; questions: Record<string, NoulQuestion> }) => Promise<SystemOneResponse>;

/** 0~1 확률을 구간으로: high 이상 = 확신(자동 초안), low 이하 = 제외, 그 사이 = 애매(후보 — 사람이 고름). 문서 예시의 YES 0.8·NO 0.2 */
export interface Bands {
  high: number;
  low: number;
}
export const DEFAULT_BANDS: Bands = { high: 0.8, low: 0.2 };

export type Band = "auto" | "candidate" | "none";

const checkP = (p: number) => {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`확률은 0~1이어야 합니다: ${p}`);
};

export function bandOf(p: number, bands: Bands = DEFAULT_BANDS): Band {
  checkP(p);
  if (p >= bands.high) return "auto";
  if (p <= bands.low) return "none";
  return "candidate";
}

export function batches<T>(list: T[], size: number): T[][] {
  if (!(size >= 1)) throw new Error("묶음 크기는 1 이상이어야 합니다");
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const oneLine = (v: unknown) => (typeof v === "string" ? v.replace(/\s*\n\s*/g, " / ").trim() : "");
const textLines = (arr: unknown): string[] => (Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").map(oneLine).filter(Boolean) : []);

/** 과제 상태: 과제 정체성과 매칭에 쓰는 칸(전년 지적·AI 활용·개요). 월별 실적은 넣지 않음. 이름 붙은 필드(task 아래)로 두어 질문이 `task`로 가리킴 */
export function cardState(data: unknown): { task: Record<string, unknown> } {
  const d = (data ?? {}) as Record<string, LooseJson>;
  const task: Record<string, unknown> = {};
  const put = (key: string, v: unknown) => {
    const s = oneLine(v);
    if (s) task[key] = s;
  };
  put("과제명", d.title);
  put("과제번호", d.taskNo);
  put("실행과제", [d.executionTaskNo, d.executionTask].filter(Boolean).join(" "));
  put("대상사업", d.targetBusiness);
  const kpi = (d.kpi?.rows ?? []).map((r: Record<string, unknown>) => [oneLine(r?.nameRaw ?? r?.name), oneLine(r?.formula)].filter(Boolean).join(" — ")).filter(Boolean);
  if (kpi.length) task.계량지표 = kpi;
  const findings = textLines(d.act?.findings);
  if (findings.length) task.전년_지적사항 = findings;
  put("AI_활용", d.strategy?.ai?.text);
  const overview = textLines(d.overview?.cells);
  if (overview.length) task.과제_개요 = overview;
  return { task };
}

/** 질문 문구(실험용 — 채택하면 resources/prompts로). 조각 하나가 과제 하나와 「직접 관련되는가」 한 가지만 묻는다 */
const QUESTION = "자료 `candidate`는 `task`(과제)가 다루는 사안 — 과제명·실행과제·계량지표·전년 지적사항 — 을 직접 다루는 자료인가?";
const CRITERIA_TRUE = "자료가 그 과제의 사업·성과지표·전년 지적사항·대상을 직접 다룬다(같은 사안을 묻거나 평가하거나 근거를 제시한다)";

/**
 * 「아니오」 기준의 문구 변형 — 문구가 확률에 얼마나 영향을 주는지 보려고 둘을 비교한다.
 * strict(기본, 1차 실험과 같음): 같은 사업 안의 다른 사안·사업 전반·낱말만 닮은 것을 모두 아니오로 밝힘
 * loose: 「같은 사업 안의 다른 사안·사업 전반」 줄을 빼고 낱말만 닮은 경우와 명백히 다른 주제만 아니오로 둠
 */
export const WORDING_VARIANTS = ["strict", "loose"] as const;
export type WordingVariant = (typeof WORDING_VARIANTS)[number];
const CRITERIA_FALSE: Record<WordingVariant, string> = {
  strict: "자료가 같은 사업 안의 다른 사안이거나, 사업 전반·일반 원칙만 다루거나, 낱말만 닮았다",
  loose: "자료가 그 과제와 관계없는 주제이거나, 낱말만 닮았다",
};

/** 조각마다 Noul 질문 하나. 질문 id는 조각 순서(q0, q1, …)이고 ids[i]가 그 조각 키 — 조각 글은 자르지 않음 */
export function relevanceQuestions(chunks: BundleChunk[], variant: WordingVariant = "strict"): { questions: Record<string, NoulQuestion>; ids: string[] } {
  if (!WORDING_VARIANTS.includes(variant)) throw new Error(`알 수 없는 문구 변형: ${variant}`);
  const criteria = { true: CRITERIA_TRUE, false: CRITERIA_FALSE[variant] };
  const questions: Record<string, NoulQuestion> = {};
  chunks.forEach((c, i) => {
    questions[`q${i}`] = {
      type: "noul",
      instructions: {
        candidate: { title: c.title, unit: c.unit_type, ...(c.context_prefix ? { where: c.context_prefix } : {}), text: flattenHtmlTables(c.text ?? "") },
        question: QUESTION,
      },
      criteria,
    };
  });
  return { questions, ids: chunks.map((c) => c.chunk_key) };
}

export interface ChunkScore {
  chunkKey: string;
  p: number;
}

/**
 * 카드 한 장 × 조각들을 묶음(batchSize)으로 나눠 채점. 묶음마다 같은 state(과제)로 한 번씩 요청 — 한 요청 안의 질문은 서로 독립·병렬.
 * 답이 빠지거나 Noul이 아니거나 확률이 범위 밖이면 0으로 덮지 않고 던진다
 */
export async function scoreChunks(
  call: SystemOneCall,
  card: unknown,
  chunks: BundleChunk[],
  opts: { batchSize?: number; variant?: WordingVariant } = {},
): Promise<{ scores: ChunkScore[]; usage: { input_tokens: number; output_tokens: number }; requests: number; model: string }> {
  const state = cardState(card);
  const scores: ChunkScore[] = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let model = "";
  let requests = 0;
  for (const group of batches(chunks, opts.batchSize ?? 25)) {
    const { questions, ids } = relevanceQuestions(group, opts.variant);
    const res = await call({ state, questions });
    requests++;
    model = res.model;
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    ids.forEach((key, i) => {
      const a = res.answers[`q${i}`];
      if (!a) throw new Error(`답이 없습니다: q${i} (${key})`);
      if (a.type !== "noul" || typeof a.noul !== "number") throw new Error(`Noul 답이 아닙니다: q${i} (${a.type})`);
      checkP(a.noul);
      scores.push({ chunkKey: key, p: a.noul });
    });
  }
  return { scores, usage, requests, model };
}

export interface BandSummary {
  total: number;
  auto: number;
  candidate: number;
  none: number;
  /** 관련 있음(확신 + 애매) 중 애매 비율 */
  ambiguousShare: number;
}

export function summarizeBands(ps: number[], bands: Bands = DEFAULT_BANDS): BandSummary {
  const s = { total: ps.length, auto: 0, candidate: 0, none: 0 };
  for (const p of ps) s[bandOf(p, bands)]++;
  const related = s.auto + s.candidate;
  return { ...s, ambiguousShare: related ? s.candidate / related : 0 };
}

/** 기존(Claude) 판정 × Jev 구간 교차표. 기존 목록에 없는 조각은 absent */
export function crossTab(jev: Map<string, number>, existing: Map<string, "auto" | "candidate">, bands: Bands = DEFAULT_BANDS): Record<"auto" | "candidate" | "absent", Record<Band, number>> {
  const t = { auto: { auto: 0, candidate: 0, none: 0 }, candidate: { auto: 0, candidate: 0, none: 0 }, absent: { auto: 0, candidate: 0, none: 0 } };
  for (const [key, p] of jev) t[existing.get(key) ?? "absent"][bandOf(p, bands)]++;
  return t;
}

/** 지정한 조각들의 구간별 수. Jev 점수에 없는 조각은 0으로 치지 않고 missing으로 센다 */
export function bandCounts(jev: Map<string, number>, keys: Iterable<string>, bands: Bands = DEFAULT_BANDS): Record<Band | "missing", number> {
  const c = { auto: 0, candidate: 0, none: 0, missing: 0 };
  for (const k of keys) {
    const p = jev.get(k);
    if (p === undefined) c.missing++;
    else c[bandOf(p, bands)]++;
  }
  return c;
}

export interface CardComparison {
  claudeAutoTotal: number;
  /** Claude가 확신한 것 중 Jev가 제외(p≤low)한 수 */
  claudeAutoNone: number;
  claudeCandTotal: number;
  /** Claude가 애매하다고 한 것 중 Jev가 제외한 수 */
  claudeCandNone: number;
}

/** 카드 한 장의 비교 지표(결정 규칙의 재료) */
export function cardComparison(jev: Map<string, number>, existing: Map<string, "auto" | "candidate">, bands: Bands = DEFAULT_BANDS): CardComparison {
  const t = crossTab(jev, existing, bands);
  const sum = (r: Record<Band, number>) => r.auto + r.candidate + r.none;
  return { claudeAutoTotal: sum(t.auto), claudeAutoNone: t.auto.none, claudeCandTotal: sum(t.candidate), claudeCandNone: t.candidate.none };
}

/** 결정 규칙: Claude 확신을 Jev가 제외한 것이 maxAutoDropped건 이하 그리고 Claude 후보 제외율이 minCandDropShare 이상이어야 「2차 걸러내기」로 검토 */
export interface Rule {
  maxAutoDropped: number;
  minCandDropShare: number;
}
export const DEFAULT_RULE: Rule = { maxAutoDropped: 1, minCandDropShare: 0.3 };

export function evaluateRule(perCard: CardComparison[], rule: Rule = DEFAULT_RULE): { autoDropped: number; candTotal: number; candDropped: number; candDropShare: number; pass: boolean; reasons: string[] } {
  const autoDropped = perCard.reduce((a, c) => a + c.claudeAutoNone, 0);
  const candTotal = perCard.reduce((a, c) => a + c.claudeCandTotal, 0);
  const candDropped = perCard.reduce((a, c) => a + c.claudeCandNone, 0);
  const candDropShare = candTotal ? candDropped / candTotal : 0;
  const reasons: string[] = [];
  if (autoDropped > rule.maxAutoDropped) reasons.push(`Claude 확신을 Jev가 제외한 것 ${autoDropped}건 > 허용 ${rule.maxAutoDropped}건`);
  if (!candTotal) reasons.push("Claude 후보가 하나도 없어 후보 제외율을 잴 수 없음");
  else if (candDropShare < rule.minCandDropShare) reasons.push(`Claude 후보 제외율 ${(candDropShare * 100).toFixed(0)}% < 기준 ${(rule.minCandDropShare * 100).toFixed(0)}%`);
  return { autoDropped, candTotal, candDropped, candDropShare, pass: reasons.length === 0, reasons };
}

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

/** TypeSafe System One 호출(서버·스크립트에서만 — 키를 브라우저에 두지 않음). 429·529는 지수 백오프(1초·2초·…)로 retries번까지 다시, 그 밖의 오류는 바로 던진다 */
export function typesafeCaller(o: { apiKey: string; model: string; fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void>; retries?: number }): SystemOneCall {
  const doFetch = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const retries = o.retries ?? 3;
  return async (req) => {
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ state: req.state, model: o.model, questions: req.questions }),
      });
      if (res.ok) return (await res.json()) as SystemOneResponse;
      if ((res.status === 429 || res.status === 529) && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      // 응답 본문은 오류 설명만 짧게(요청·키는 싣지 않음)
      const body = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`TypeSafe 요청 실패(${res.status}): ${body}`);
    }
  };
}
