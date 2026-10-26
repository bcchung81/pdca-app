// 경평 초안 「틀 고르기」(결정론, 순수) — 구성안 요청에 이야기 틀 후보를 적어 AI가 섞음·한두 틀로 몰리지 않게 합니다.
// 평가 라운드 M·O(카드 8장씩): 섞음 3·5/8, 8종 중 ④⑤⑥⑦⑧은 0회 — 도식은 앱이 후보(diagram-hints)를 주는데 틀은 신호가 없었음(2026-10-09 분석). ⑨~⑪은 2026-10-10에 더함, ⑫는 2026-10-13에 더함.
// 신호 = 도식 후보(이 과제만의 요소·기본 도식) + 글에서 찾은 낱말 + 같은 주요사업 형제 초안이 이미 쓴 틀(뒤로 미룸).
// 틀마다 그 틀을 서게 하는 필수 신호가 있으면(현장 목소리형 = 현장 말, 다자협업형 = 기관 3곳 등) 그 신호가 있어야 후보가 됩니다.
// 요청 글은 resources/prompts/report-outline/request.md storyHints.*

import { MAIN_STORIES, type MainStory } from "./blocks.ts";
import type { DiagramHint } from "./diagram-hints.ts";
import { frameworkOf, shapeName } from "./frameworks.ts";
import { type PromptSet, fillFrom } from "../prompts/template.ts";

export { MAIN_STORIES };

export interface StoryHint {
  story: MainStory;
  /** 찾은 신호(한 줄) */
  why: string;
  /** 그 틀의 여는 블록(블록 순서의 첫 블록 — 「[라벨] 쉬운 이름」) */
  opener: string;
  /** 같은 주요사업 형제 초안 중 이 틀을 주 틀로 쓴 수 */
  siblings: number;
  /** 형제 수를 반영한 점수(정렬용) */
  score: number;
}

/** 신호를 볼 때 쓰는 값(도식 후보 종류·원문 인용 여부·글 낱말 수) */
interface Ctx {
  kinds: Set<string>;
  /** 정부·CEO·현장 원문 인용 후보(평가위원 지적 인용은 틀 신호로 세지 않음 — 지적 틀을 낮춘 결정 2026-09-27 P2) */
  quote: boolean;
  /** 글에 「왜·어떻게 …?」 질문이 있음('25 실사 질의로만 뜬 Q&A 후보는 세지 않음 — 거의 모든 카드에 실사 질의가 있어 왜-어떻게형으로 몰림, 평가 라운드 P 4/8) */
  asked: boolean;
  /** 이 과제의 '25 평가위원 지적 원문이 있음 — 카드 37/59장이라 문 신호로는 안 씀(지적을 주제로 삼지 않음 — 2026-09-27 P2) */
  critique: boolean;
  /** 추진내용의 갈래 표지 수(BRANCH) */
  branches: number;
  /** 글에서 서로 다른 낱말 수 */
  words: (re: RegExp) => number;
}

interface Signal {
  test: (c: Ctx) => boolean;
  w: number;
  /** 문 신호: 틀에 문 신호가 있으면 그중 하나는 있어야 후보(그 틀을 서게 하는 뚜렷한 신호) */
  gate?: boolean;
  why: string;
  /** 이 신호가 없을 때 이유에 붙일 말(후보는 됨 — 이 과제만의 요소의 근거가 아직 없음) */
  lack?: string;
}

const W = {
  rnd: /연구|개발|시범|실증|고도화|확산|상용화/g,
  issue: /주파수|제도|정책|규제|법령|이해관계|갈등|쟁점|이슈|해결책/g,
  coop: /민관|다자|협의체|공동|협력/g,
  voice: /민원|불안|설문|만족도|국민\s?의견/g,
  oneStop: /원스톱|일원화|한\s?번에|단일\s?창구|통합\s?(?:창구|서비스|플랫폼)|창구.{0,6}통합|통합했/g,
  edu: /교육|캠페인|훈련|체험|연습|안전\s?수칙/g,
  value: /공공성|효율성|서비스\s?질|안전성|편의성|신뢰성|투명성|접근성|형평성/g,
  accum: /자격|제도|인프라|누적|매년|해마다|연차/g,
  analysis: /현황\s?분석|실태\s?조사|수요\s?조사|현장\s?조사|진단|데이터\s?분석|원인\s?분석|분석/g,
  // AI·자동화 낱말(⑫ AX 전환형) — 영문 AI는 앞뒤가 영문자가 아닐 때만(AIoT·MAIL 등 제외)
  ax: /(?<![A-Za-z])AI(?![A-Za-z])|인공지능|자동\s?판독|챗봇|RPA|머신\s?러닝|딥\s?러닝|자동화|디지털\s?전환|생성형/g,
  // 업무 절차가 바뀐 낱말(⑫ — AI 낱말과 함께 있어야 문 신호): AI 낱말만으로는 운영 카드 102장 중 21장이 걸려(AI가 배경일 뿐인 주파수·전자파 카드 포함) 함께 보면 13장(2026-10-13 실측)
  proc: /수작업|수기|육안|절차\s?(?:단축|간소화|개선|자동화)|프로세스|업무\s?(?:효율|시간|처리|부담|자동화)|소요\s?(?:시간|기간)|처리\s?(?:시간|기간)|단축|인력\s?(?:절감|투입)|자동\s?(?:탐지|분석|분류|추출|검출|생성|점검)/g,
};
/** 추진내용 줄 머리의 갈래 표지 「∙ (데이터 연계) …」 — 카드 칸 경로(do.lines.N | …)가 붙은 줄만 셈 */
const BRANCH = /^do\.lines\.\d+ \| [∙•·○]\s?\(([^)]{2,20})\)/gm;
const has = (kind: string) => (c: Ctx) => c.kinds.has(kind);
const many = (re: RegExp, min: number, max = Infinity) => (c: Ctx) => {
  const n = c.words(re);
  return n >= min && n <= max;
};

// 무게는 카드 59장(seed/cards/260916)에서 신호가 잡히는 빈도로 맞춤(2026-10-09): 단계 표지(steps)는 월별 일정 때문에 41/59장, 연구·개발 낱말 3개 이상은 37/59장이라
// 약한 신호로 두고, 협업 낱말과 함께 나온 기관 3곳(카드·첨부 글 기준 5/59 — 2026-10-14 후속 2 전에는 전년 절까지 합친 글로 13/59, 그 전에는 글 전체 기관 3곳이라 40/59)·가치 낱말 3개(7/59)·원스톱(7/59)·연혁 연도 4개(2/59)처럼 드문 신호를 문으로 둠
const SIGNALS: Record<MainStory, Signal[]> = {
  "단계 전개형": [
    { test: many(W.rnd, 4), w: 3, gate: true, why: "연구·개발·확산 단계 낱말 4개 이상" },
    { test: many(W.rnd, 3, 3), w: 2, gate: true, why: "연구·개발·확산 단계 낱말" },
    { test: has("timeline"), w: 2, gate: true, why: "연도 3개 흐름" },
    { test: has("steps"), w: 1, why: "차례 있는 실행" },
    { test: (c) => c.quote, w: 1, why: "정부·CEO 원문 인용" },
  ],
  "한계 극복·다자협업형": [
    { test: has("hub"), w: 3, gate: true, why: "협업 기관 3곳 이상" },
    { test: has("cards"), w: 1, why: "한계·리스크 표현" },
    { test: many(W.coop, 1), w: 1, why: "협의체·민관 협력" },
  ],
  "이슈→해결책형": [
    { test: has("cards:vs"), w: 3, gate: true, why: "맞선 입장(VS)" },
    { test: many(W.issue, 3), w: 2, gate: true, why: "정책·제도·쟁점 낱말 3개 이상" },
    { test: many(W.issue, 2, 2), w: 1, gate: true, why: "정책·제도 낱말" },
    { test: has("cards"), w: 1, why: "문제·리스크 표현" },
  ],
  "현장 목소리형": [
    { test: has("voices"), w: 4, gate: true, why: "현장의 말(말풍선 원문)", lack: "현장 말 원문은 아직 없음 — 말풍선은 근거가 있을 때만" },
    { test: many(W.voice, 2), w: 2, gate: true, why: "민원·불안·의견수렴" },
  ],
  "원스톱 통합형": [
    { test: many(W.oneStop, 1), w: 3, gate: true, why: "창구·절차 통합" },
    { test: has("hub"), w: 1, why: "업무협약 기관" },
  ],
  "왜-어떻게형": [
    { test: has("define"), w: 2, gate: true, why: "용어·개념 설명" },
    { test: (c) => c.asked, w: 2, gate: true, why: "「왜·어떻게」 질문" },
    { test: many(W.edu, 2), w: 2, gate: true, why: "교육·캠페인·훈련" },
    { test: many(W.edu, 1, 1), w: 1, why: "교육·훈련" },
  ],
  "가치 축 분할형": [
    { test: many(W.value, 3), w: 3, gate: true, why: "가치 축 3개 이상(공공성·효율성 등)" },
    { test: has("band"), w: 1, why: "가치 낱말" },
  ],
  "연혁·연도 사다리형": [
    { test: has("timeline:dots"), w: 3, gate: true, why: "연도 4개 이상(연혁)" },
    { test: (c) => c.kinds.has("timeline") && c.words(W.accum) >= 2, w: 2, gate: true, why: "연도 흐름 + 제도·자격 축적" },
    { test: many(W.accum, 1), w: 1, why: "해마다 쌓은 제도·인프라" },
  ],
  // ⑨~⑪(2026-10-10): 문 신호는 카드 59장에서 13·8·8장에 걸림(전후가 한 줄에 든 글 · 추진내용 갈래 표지 4개 이상 · 분석 낱말 3종 이상)
  "기존→개선형": [
    { test: has("compare:panels"), w: 3, gate: true, why: "기존과 개선이 한 줄에 든 글" },
    { test: (c) => c.critique, w: 1, why: "'25 지적을 고친 과제(지적은 라벨·주제로 안 씀)" },
  ],
  "구분표 중심형": [
    { test: (c) => c.branches >= 4, w: 3, gate: true, why: "추진내용 갈래 4개 이상" },
    { test: (c) => c.branches === 3, w: 1, why: "추진내용 갈래 3개" },
  ],
  "현황분석→대응형": [
    { test: many(W.analysis, 3), w: 3, gate: true, why: "현황분석·조사·진단 낱말 3종 이상" },
    { test: has("table"), w: 1, why: "행·열 수치(분석 결과)" },
  ],
  // ⑫(2026-10-13): AI·자동화 낱말 서로 다른 것 2개 이상 + 업무 절차가 바뀐 낱말 2개 이상(「AI」만 되풀이하거나 AI가 배경일 뿐인 글은 후보 아님)
  "AX 전환형": [
    { test: (c) => many(W.ax, 2)(c) && many(W.proc, 2)(c), w: 3, gate: true, why: "AI·자동화 낱말과 업무 절차 변화(수작업·소요 시간·단축 등)" },
    // 절차 변화 낱말이 4개 이상이면 뚜렷한 전환 과제(운영 카드 7장 — 1-가 안테나 자동판독은 이것 없이 3점이라 5·4·4점 틀에 밀려 후보 3개 밖이었음, 2026-10-13 실측)
    { test: many(W.proc, 4), w: 2, why: "업무 절차 변화 낱말 4개 이상" },
    { test: has("compare:panels"), w: 1, why: "기존과 새 절차가 한 줄에 든 글" },
  ],
};

/** 후보가 되는 최소 점수 */
const MIN_SCORE = 2;
/** 형제 하나가 이 틀을 주 틀로 썼을 때 깎는 점수 */
const SIBLING_COST = 2;
/** 후보 수 */
const MAX_HINTS = 3;

/** 틀의 여는 블록(블록 순서의 첫 블록) */
export function openerOf(story: string): string {
  const b = frameworkOf(story)?.blocks[0];
  if (!b) return "";
  return `${b.label ? `[${b.label}] ` : ""}${shapeName(b.kind, b.variant ?? "")}`;
}

/**
 * 도식 후보(diagramHints)·글·형제 초안의 주 틀 → 이야기 틀 후보(점수 순, 3개까지). 문 신호가 하나도 없거나 점수가 모자라면 후보가 아님.
 * 형제가 이미 주 틀로 쓴 틀은 형제 하나에 SIBLING_COST씩 깎아 뒤로 미룸(빼지는 않음 — 그래도 가장 맞으면 앞에 남음)
 */
export function storyHints(hints: DiagramHint[], text: string, siblingStories: string[] = []): StoryHint[] {
  const ctx: Ctx = {
    kinds: new Set(hints.map((h) => h.kind)),
    quote: hints.some((h) => h.kind === "quotes" && h.why.startsWith("원문 인용")),
    asked: hints.some((h) => h.kind === "qa" && h.why.startsWith("질문 글")),
    critique: hints.some((h) => h.kind === "quotes" && h.why.startsWith("'25 평가위원 지적")),
    branches: new Set([...text.matchAll(BRANCH)].map((m) => m[1].replace(/\s/g, ""))).size,
    words: (re) => new Set([...text.matchAll(re)].map((m) => m[0].replace(/\s/g, ""))).size,
  };
  const out: StoryHint[] = [];
  MAIN_STORIES.forEach((story) => {
    const signals = SIGNALS[story];
    let score = 0;
    let gated = !signals.some((s) => s.gate);
    const why: string[] = [];
    for (const s of signals) {
      if (s.test(ctx)) {
        score += s.w;
        why.push(s.why);
        if (s.gate) gated = true;
      } else if (s.lack) why.push(s.lack);
    }
    if (!gated || score < MIN_SCORE) return;
    const siblings = siblingStories.filter((x) => x === story).length;
    out.push({ story, why: why.join(" · "), opener: openerOf(story), siblings, score: score - siblings * SIBLING_COST });
  });
  return out.sort((a, b) => b.score - a.score || MAIN_STORIES.indexOf(a.story) - MAIN_STORIES.indexOf(b.story)).slice(0, MAX_HINTS);
}

/** 요청 글 「틀 고르기」(report-outline/request.md storyHints·storyHints.item·storyHints.none·storyHints.siblings) */
export function storyHintsPrompt(p: PromptSet, hints: StoryHint[]): string {
  const items = hints.length
    ? hints.map((h) => fillFrom(p, "request", "storyHints.item", { story: h.story, why: h.why, opener: h.opener || "—", siblings: h.siblings ? fillFrom(p, "request", "storyHints.siblings", { n: h.siblings }) : "" })).join("\n")
    : fillFrom(p, "request", "storyHints.none");
  return fillFrom(p, "request", "storyHints", { items });
}
