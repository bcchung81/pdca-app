// 경영관리 경평 구성안 「틀 고르기」(결정론, 순수 — 2026-10-12 C5): 주요사업 lib/reports/story-hints.ts와 같은 방식으로 이야기 틀 후보를 구성안 요청에 적어
// AI가 「섞음」·한두 틀로 몰리지 않게 합니다. 경영관리는 절을 AI가 정하므로 후보는 카드 단위(카드 글 + 숫자 근거로 인정하는 첨부 글 + 추천 평가내용의 2025 절 글)로 3개까지 냅니다.
// 2026-11-10 T1: 신호에 쓰는 도식 후보 종류는 카드·첨부 글로만 만듦(mgStoryHintsOf) — 요청 글의 도식 후보(2025 같은 평가내용 절까지 봄)를 그대로 쓰면 2025 절의
// 전략체계·연도 글이 같은 평가내용의 모든 카드에 ①·⑥을 켜 ① 전략수립형이 단독 1순위 10장(AI가 실제로 쓴 절 3개), ⑥이 3후보 20장이었음(주요사업 2026-11-09 P1-2와 같은 문제).
// 2025 절 글은 ⑦의 「2025 절 구분표」 신호에만 씀. ⑬~⑮ 신호도 이때 더함(2026-11-04에 틀만 더해 후보로 한 번도 안 나왔음).
// 신호와 문턱은 2025 경영관리 보고서 14개 지표 육안 판정(분석 docs/analysis/2025-경영관리-경영실적보고서-분석.md §8.7·§8.8 — 절 223단위, 적재 조각 글과 맞춘 220단위)과
// 카드 43장(260904판)에서 신호가 잡히는 빈도로 맞춤 — 문턱별 2025 적중률은 각 신호 주석. ② 배경·내용·성과형은 기본형이라 문 신호가 없어 후보로 내지 않음(후보가 맞지 않으면 기본형).
// 요청 글은 resources/prompts/report-outline-mg/request.md storyHints.*

import { inspectionCardText } from "../ai/inspect.ts";
import { type DiagramHint, diagramHints } from "./diagram-hints.ts";
import { MG_FRAMEWORKS, MG_MAIN_STORIES, type MgMainStory } from "./frameworks-mg.ts";
import { shapeName } from "./frameworks.ts";
import type { MgPriorSection, MgSibling } from "./mg-outline.ts";
import { type PromptSet, fillFrom } from "../prompts/template.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

export interface MgStoryHint {
  story: MgMainStory;
  /** 찾은 신호(한 줄) */
  why: string;
  /** 그 틀의 여는 블록(블록 순서의 첫 블록 — 「[라벨] 쉬운 이름」) */
  opener: string;
  /** 같은 지표 다른 카드 구성안의 절 중 이 틀을 주 틀로 쓴 수 */
  siblings: number;
  /** 형제 수를 반영한 점수(정렬용) */
  score: number;
}

interface Ctx {
  /** 도식 후보 종류(카드·첨부 신호 — sectionHints) */
  kinds: Set<string>;
  /** 카드·첨부 글에서 서로 다른 낱말 수 */
  words: (re: RegExp) => number;
  /** 줄머리 번호 표지(①~⑩·❶~❿)의 서로 다른 수 */
  heads: number;
  /** 지침·가이드라인 준수·이행(COMPLY) */
  comply: boolean;
  /** 추천 평가내용의 2025 절 수와 그중 구분표(「구분 |」 줄머리)가 든 절 수 */
  prior: { total: number; table: number };
}

interface Signal {
  test: (c: Ctx) => boolean;
  w: number;
  /** 문 신호: 틀에 문 신호가 있으면 그중 하나는 있어야 후보 */
  gate?: boolean;
  why: (c: Ctx) => string;
}

const W = {
  // 2025 절 220개: 2종 이상 → ① 15/27(다른 틀 7/193 — 적중 0.68), 카드 2/43
  strategy: /비전|전략목표|전략과제|추진전략|경영목표|전략체계|중점과제|실행과제|전략방향|경영전략/g,
  // 2종 이상 → ③ 14/45(다른 틀 5/175 — 0.74), 카드 3/43
  problem: /갈등|문제점|문제인식|한계|애로|취약|사각지대|불만|혁신\s?포인트|개선\s?필요/g,
  // 2종 이상 → ④ 8/26(다른 틀 4/194 — 0.67). 카드 과제 개요의 「고도화과제(기존)」 체크칸은 글에서 뺌
  asIs: /As-?Is|To-?Be|기존|개선\s?전|개선\s?후|종전|변경\s?전/gi,
  // 3종 이상 → ⑧ 3/30(다른 틀 1/190 — 0.75), 카드 2/43
  monitor: /모니터링|비율|증감|추이|월별|집중도|수익률|지표\s?관리/g,
  // 3종 이상 → ⑩ 생애주기 4/5(다른 틀 5/215 — 0.44), 카드 3/43
  life: /임신|출산|육아|복직|생애|전주기|퇴직|시니어|경력\s?단절|양육|돌봄|정년/g,
  // ⑫ AX 전환형(2026-10-13 — 2025 경영관리 보고서에는 이 틀의 절이 없어 문턱은 주요사업과 같게): AI·자동화 낱말 서로 다른 것 2개 이상(+ W.proc 2개 이상). 영문 AI는 앞뒤가 영문자가 아닐 때만
  ax: /(?<![A-Za-z])AI(?![A-Za-z])|인공지능|자동\s?판독|챗봇|RPA|머신\s?러닝|딥\s?러닝|자동화|디지털\s?전환|생성형/g,
  // ⑫ 업무 절차가 바뀐 낱말(주요사업 story-hints.ts W.proc와 같음 — AI 낱말과 함께 있어야 문 신호)
  proc: /수작업|수기|육안|절차\s?(?:단축|간소화|개선|자동화)|프로세스|업무\s?(?:효율|시간|처리|부담|자동화)|소요\s?(?:시간|기간)|처리\s?(?:시간|기간)|단축|인력\s?(?:절감|투입)|자동\s?(?:탐지|분석|분류|추출|검출|생성|점검)/g,
  // ⑬~⑮(2026-11-10 T1 — 주요사업 story-hints.ts W.pilot·spread·risk·data·decide를 경영관리 말로: 지역 대신 전사, 위험성 평가·경영 반영·제도 개선을 더함).
  // 경영관리 카드 47장(261103판)에서 걸리는 장수는 각 신호 주석. 2025 경영관리 보고서에는 ⑬~⑮ 예시가 없어 문턱은 주요사업과 같은 꼴
  pilot: /시범|실증|테스트베드|파일럿/g,
  spread: /확산|전사|표준화|지침화|매뉴얼화|전면\s?(?:시행|적용|도입)|본격\s?(?:시행|운영)|정착|확대\s?(?:적용|운영|시행)/g,
  risk: /위험\s?(?:요인|요소|지역|성|등급|현장)|위험성\s?평가|사고|재해|예방|안전\s?(?:점검|관리|사고|진단|수칙|확보)|작업\s?중지|무사고|추락|재발\s?방지/g,
  data: /데이터\s?(?:분석|수집|연계|기반|축적|활용|구축|플랫폼)|빅\s?데이터|DB|통계|대시보드|지표\s?분석|모니터링\s?(?:체계|시스템)/g,
  decide: /정책\s?(?:반영|결정|수립|활용|근거)|의사\s?결정|경영\s?(?:반영|의사결정)|기준\s?(?:마련|개선|정립|수립)|배분|우선\s?순위|선정\s?기준|제도\s?개선/g,
};
/** 「지침·가이드라인·권고(안)·기준 (100%) 준수·이행」 — 2025 절 8개에서 잡혀 ⑪ 2단위 모두(나머지 6은 다른 틀), 카드 3/43(3-1·3-3·11-2). 낱말만 따로 보면 카드 8/43이라 이어 쓴 것만 */
const COMPLY = /(?:지침|가이드라인|권고안?|기준)\s?(?:\d+%\s?)?(?:준수|이행)/;
/** 줄머리 번호 표지 — 「경로 | ① …」(카드 칸 풀이 줄의 글 머리)·첨부 줄 머리의 「① …」. 분석 §8.8 「□ 소주제 묶음」 판정 기준(□·번호(①②)·사례❶❷·과제①로 나눈 구획 2개 이상) */
const HEAD = /^(?:[^|\n]*\| )?\s*([①-⑩❶-❿])/gm;
/** 2025 구분표 줄머리(kordoc이 표를 「구분 | …」 줄로 폄) — 절 글에 있으면 ⑦ 44/63(다른 틀 21/157 — 0.68) */
const TABLE_HEAD = /(^|\n)\s*구\s?분\s*\|/;

const has = (kind: string) => (c: Ctx) => c.kinds.has(kind);
const many = (re: RegExp, min: number) => (c: Ctx) => c.words(re) >= min;
const say = (s: string) => () => s;

const SIGNALS: Partial<Record<MgMainStory, Signal[]>> = {
  전략수립형: [
    // 도식 후보 strategy: 2025 절에서 5번 잡혀 4번 ①
    { test: has("strategy"), w: 3, gate: true, why: say("전략목표·전략과제 체계") },
    { test: many(W.strategy, 2), w: 2, gate: true, why: say("비전·전략목표·전략과제 낱말") },
  ],
  "문제·해결형": [
    // 도식 후보 cards:vs: 2025 절 2번 모두 ③
    { test: has("cards:vs"), w: 3, gate: true, why: say("맞선 입장(VS)") },
    { test: many(W.problem, 2), w: 2, gate: true, why: say("갈등·한계·취약 낱말 2개 이상") },
  ],
  "기존·개선형": [
    // 도식 후보 compare:panels: 2025 절 52번 중 ④ 17(0.33 — 보고서 글은 기존·개선 문장이 흔함)이라 약하게
    { test: has("compare:panels"), w: 2, gate: true, why: say("기존과 개선이 한 줄에 든 글") },
    { test: many(W.asIs, 2), w: 2, gate: true, why: say("기존·개선 전후 낱말") },
  ],
  // 도식 후보 pdca: 2025 절 5번 중 ⑤ 1, 카드 7/43(「환류」가 카드 칸 이름·과제명에 흔함)이라 약하게
  "PDCA 체계형": [{ test: has("pdca"), w: 2, gate: true, why: say("PDCA·선순환·환류 체계") }],
  // 도식 후보 timeline: 2025 절 23번 중 ⑥ 3이라 약하게(카드 3/43)
  "단계·연도 로드맵형": [{ test: has("timeline"), w: 2, gate: true, why: say("연도 3개 흐름") }],
  "구분표 중심형": [
    {
      test: (c) => c.prior.total > 0 && c.prior.table * 2 >= c.prior.total,
      w: 2,
      gate: true,
      why: (c) => `추천 평가내용의 2025 절 ${c.prior.total}개 중 ${c.prior.table}개가 구분표`,
    },
    { test: (c) => c.words(/(^|\n)\s*구\s?분\s*\|/g) > 0, w: 1, why: say("첨부에 구분표") },
  ],
  "계량 모니터링형": [{ test: many(W.monitor, 3), w: 3, gate: true, why: say("모니터링·비율·증감 낱말 3개 이상") }],
  "소과제 묶음형": [{ test: (c) => c.heads >= 2, w: 3, gate: true, why: (c) => `줄머리 번호 표지 ${c.heads}개(①②…)` }],
  생애주기형: [{ test: many(W.life, 3), w: 3, gate: true, why: say("임신·육아·퇴직 등 생애 단계 낱말 3개 이상") }],
  "준수 점검형": [{ test: (c) => c.comply, w: 3, gate: true, why: say("지침·가이드라인 준수·이행") }],
  "AX 전환형": [{ test: (c) => many(W.ax, 2)(c) && many(W.proc, 2)(c), w: 3, gate: true, why: say("AI·자동화 낱말과 업무 절차 변화(수작업·소요 시간·단축 등)") }],
  // ⑬ 시범 낱말 + 확산 낱말 2종 1장(13-3). 확산·전사·정착 낱말 3종 이상은 보조 신호(+1)만 — 「전사·정착·표준화」는 경영관리 카드에 흔해 시범 재료 없는 카드 4장(1-2·5-3·9-3·13-2)에
  // 「시범 운영 ▶ 검증 결과」로 여는 틀을 권했음(T4 리뷰 T1-R2). 「우선 적용·1단계·단계적 확대」 같은 시범 비슷한 낱말도 그 4장에는 없음(2026-11-10 실측)
  "시범→확산형": [
    { test: (c) => c.words(W.pilot) >= 1 && c.words(W.spread) >= 2, w: 3, gate: true, why: say("시범·실증 낱말과 확산·표준화·정착 낱말") },
    { test: many(W.spread, 3), w: 1, why: say("전사 확산·표준화·정착 낱말 3종 이상") },
  ],
  // ⑭ 위험 낱말 4종 이상 4장, 3종 4장(AI가 ⑭를 주 틀로 쓴 2-2·4-2 포함)
  "위험관리·안전형": [
    { test: many(W.risk, 4), w: 3, gate: true, why: say("위험 요인·사고·예방·안전 점검 낱말 4종 이상") },
    { test: (c) => c.words(W.risk) === 3, w: 2, gate: true, why: say("위험·예방·안전 낱말 3종") },
  ],
  // ⑮ 데이터 2종 + 결정 2종 1장, 데이터 2종 + 결정 1종 3장(AI가 ⑮를 보조 틀로 쓴 6-2 포함)
  "데이터 기반 의사결정형": [
    { test: (c) => c.words(W.data) >= 2 && c.words(W.decide) >= 2, w: 3, gate: true, why: say("데이터 수집·분석 낱말과 경영 반영·기준 마련 낱말") },
    { test: (c) => c.words(W.data) >= 2 && c.words(W.decide) === 1, w: 2, gate: true, why: say("데이터 분석 낱말과 결정 낱말 하나") },
  ],
};

/** 후보가 되는 최소 점수 */
const MIN_SCORE = 2;
/** 같은 지표 다른 카드의 절 하나가 이 틀을 주 틀로 썼을 때 깎는 점수(주요사업과 같음) */
const SIBLING_COST = 2;
/** 후보 수 */
const MAX_HINTS = 3;

/** 틀의 여는 블록(블록 순서의 첫 블록) */
export function mgOpenerOf(story: string): string {
  const b = MG_FRAMEWORKS.find((f) => f.story === story)?.blocks[0];
  if (!b) return "";
  return `${b.label ? `[${b.label}] ` : ""}${shapeName(b.kind, b.variant ?? "")}`;
}

/** 신호를 볼 카드·첨부 글: 카드 칸 풀이(양식 머리·과제번호 줄·과제 개요 체크칸은 뺌 — 「고도화과제(기존)」·지표 범주 이름이 신호로 잡히지 않게) + 숫자 근거로 인정하는 첨부 */
export function mgHintText(card: Json, files: Array<{ text: string; numberEvidence?: boolean }> = []): string {
  const cardText = inspectionCardText(card)
    .split("\n")
    .filter((l) => !/^## |^\(|^overview\./.test(l))
    .join("\n");
  return [cardText, ...files.filter((f) => f.numberEvidence !== false).map((f) => f.text)].join("\n");
}

/**
 * 카드·첨부 글(mgHintText)·도식 후보·추천 평가내용의 2025 절 글·같은 지표 다른 카드 구성안 절의 주 틀 → 이야기 틀 후보(점수 순, 3개까지).
 * 문 신호가 하나도 없거나 점수가 모자라면 후보가 아님. 형제가 이미 주 틀로 쓴 틀은 절 하나에 SIBLING_COST씩 깎아 뒤로(빼지는 않음)
 */
export function mgStoryHints(input: { text: string; hints?: DiagramHint[]; prior?: string[]; siblingStories?: string[] }): MgStoryHint[] {
  const prior = input.prior ?? [];
  const ctx: Ctx = {
    kinds: new Set((input.hints ?? []).map((h) => h.kind)),
    words: (re) => new Set([...input.text.matchAll(re)].map((m) => m[0].replace(/\s/g, ""))).size,
    heads: new Set([...input.text.matchAll(HEAD)].map((m) => m[1])).size,
    comply: COMPLY.test(input.text),
    prior: { total: prior.length, table: prior.filter((t) => TABLE_HEAD.test(t)).length },
  };
  const siblingStories = input.siblingStories ?? [];
  const out: MgStoryHint[] = [];
  for (const story of MG_MAIN_STORIES) {
    const signals = SIGNALS[story];
    if (!signals) continue;
    let score = 0;
    let gated = false;
    const why: string[] = [];
    for (const s of signals) {
      if (!s.test(ctx)) continue;
      score += s.w;
      why.push(s.why(ctx));
      if (s.gate) gated = true;
    }
    if (!gated || score < MIN_SCORE) continue;
    const siblings = siblingStories.filter((x) => x === story).length;
    out.push({ story, why: why.join(" · "), opener: mgOpenerOf(story), siblings, score: score - siblings * SIBLING_COST });
  }
  return out.sort((a, b) => b.score - a.score || MG_MAIN_STORIES.indexOf(a.story) - MG_MAIN_STORIES.indexOf(b.story)).slice(0, MAX_HINTS);
}

/** 요청 글 「틀 고르기」(report-outline-mg/request.md storyHints·storyHints.item·storyHints.none·storyHints.siblings) */
export function mgStoryHintsPrompt(p: PromptSet, hints: MgStoryHint[]): string {
  const items = hints.length
    ? hints.map((h) => fillFrom(p, "request", "storyHints.item", { story: h.story, why: h.why, opener: h.opener || "—", siblings: h.siblings ? fillFrom(p, "request", "storyHints.siblings", { n: h.siblings }) : "" })).join("\n")
    : fillFrom(p, "request", "storyHints.none");
  return fillFrom(p, "request", "storyHints", { items });
}

/** 틀 신호용 도식 후보 — 카드·숫자 근거 첨부 글로만(2025 같은 평가내용 절 글은 넣지 않음 — 머리 주석 2026-11-10). 글은 서버 sectionHints의 hintSource와 같은 모양(카드 칸 풀이 + 첨부) */
export function mgCardKinds(card: Json, files: Array<{ text: string; numberEvidence?: boolean }> = []): DiagramHint[] {
  return diagramHints([inspectionCardText(card), ...files.filter((f) => f.numberEvidence !== false).map((f) => f.text)].join("\n"), {}, { track: "mg" });
}

/** 카드 하나의 틀 후보(구성안 요청·집계 공용): 카드·첨부 글과 그 글로 만든 도식 후보, 추천 평가내용(ctx.evals)의 2025 절 글(⑦ 신호만), 형제 절의 주 틀 */
export function mgStoryHintsOf(x: { card: Json; ctx: { prior: MgPriorSection[]; evals: number[] }; files?: Array<{ text: string; numberEvidence?: boolean }>; siblingStories?: string[] }): MgStoryHint[] {
  const prior = x.ctx.prior.filter((s) => x.ctx.evals.includes(s.evalNo)).map((s) => s.text);
  return mgStoryHints({ text: mgHintText(x.card, x.files ?? []), hints: mgCardKinds(x.card, x.files ?? []), prior, siblingStories: x.siblingStories });
}

/**
 * 구성안 요청의 「틀 고르기」 글 한 덩이(callReportOutlineMg가 task 뒤에 붙임 — 절별 다시 짜기에는 안 붙임): 카드·숫자 근거 첨부 글과 그 글의 도식 후보,
 * 추천 평가내용(ctx.evals)의 2025 절 글(⑦ 신호), 같은 지표 다른 카드 구성안 절의 주 틀. 요청 글의 도식 후보(2025 절 글까지 봄)는 받지 않음(2026-11-10)
 */
export function mgStoryHintsFor(p: PromptSet, x: { card: Json; ctx: { prior: MgPriorSection[]; evals: number[] }; files?: Array<{ text: string; numberEvidence?: boolean }>; siblings?: MgSibling[] }): string {
  const siblingStories = (x.siblings ?? []).flatMap((sb) => sb.parts.map((q) => q.story));
  return mgStoryHintsPrompt(p, mgStoryHintsOf({ card: x.card, ctx: x.ctx, files: x.files, siblingStories }));
}
