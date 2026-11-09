// 경평 초안 「틀 고르기」(결정론, 순수) — 구성안 요청에 이야기 틀 후보를 적어 AI가 섞음·한두 틀로 몰리지 않게 합니다.
// 평가 라운드 M·O(카드 8장씩): 섞음 3·5/8, 8종 중 ④⑤⑥⑦⑧은 0회 — 도식은 앱이 후보(diagram-hints)를 주는데 틀은 신호가 없었음(2026-10-09 분석). ⑨~⑪은 2026-10-10에 더함, ⑫는 2026-10-13에 더함,
// ⑬~⑯(2026-11-04 틀만)·⑰~⑳(2026-11-09)의 신호는 2026-11-09 P1-2 보정에서 더함(docs/plan/경평초안-프레임워크-확장-계획.md P1-2).
// 신호 = 도식 후보(이 과제만의 요소·기본 도식) + 글에서 찾은 낱말 + 같은 주요사업 형제 초안이 이미 쓴 틀(뒤로 미룸). 신호 글은 전년 절을 뺀 카드 본문 + 숫자 근거 첨부(section.ts storyHintsOf).
// 보정 측정(운영 원장 주요사업 활성 카드 56장, 2026-11-09 scripts/eval/story-cards.ts): 보정 전 1순위로 쓰인 틀 16종 중 8종(① 21·⑫ 15·⑧ 7장 — 상위 3틀 43장),
// 보정 뒤 20종 중 13종(최다 10장·상위 3틀 27장, 일괄은 19종·최다 6장), 20종 모두 3후보에 1장 이상.
// 문 신호가 걸리는 카드 수(56장 중): ① 단계 낱말 4개 23·3개 9·연도 흐름 7 / ② 협업 기관 9 / ③ VS 2·쟁점 낱말 3개 21·2개 10 / ④ 말풍선 0·민원 낱말 23 / ⑤ 6 / ⑥ 정의 3·교육 6 /
// ⑦ 8 / ⑧ 연혁 4·연도 + 축적 4 / ⑨ 전후 한 줄 19·기존 + 수치 → 수치 10 / ⑩ 갈래 4개 이상 16 / ⑪ 4 / ⑫ 15 / ⑬ 13 / ⑭ 1·5 / ⑮ 6·3 / ⑯ 3·3 / ⑰ 16 / ⑱ 2·10 / ⑲ 8·6(「N단계」 뺀 뒤 — 빼기 전 11·8) / ⑳ 3·9
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

/** 신호를 볼 때 쓰는 값(도식 후보 종류·원문 인용 여부·글 낱말 수·갈래 표지 수) */
interface Ctx {
  kinds: Set<string>;
  /** 정부·CEO·현장 원문 인용 후보(평가위원 지적 인용은 틀 신호로 세지 않음 — 지적 틀을 낮춘 결정 2026-09-27 P2) */
  quote: boolean;
  /** 글에 「왜·어떻게 …?」 질문이 있음('25 실사 질의로만 뜬 Q&A 후보는 세지 않음 — 거의 모든 카드에 실사 질의가 있어 왜-어떻게형으로 몰림, 평가 라운드 P 4/8) */
  asked: boolean;
  /** 추진내용(do.lines) 줄 머리의 번호 갈래 표지(①·❶·가.·1)) 서로 다른 수 */
  num: number;
  /** 조치 및 개선방향(plan.lines) 줄 머리의 번호 갈래 표지 수 */
  planNum: number;
  /** 추진내용 줄 머리의 점 갈래 「∙ (키워드)」 서로 다른 키워드 수 */
  dot: number;
  /** 카드 개요에 ☑ 중장기과제(양식 칸 — 56장 중 37장이라 보조 신호로만) */
  midTerm: boolean;
  /** 양식 글을 뺀 본문에서 서로 다른 낱말 수 */
  words: (re: RegExp) => number;
  /** 제목·계획·추진내용 줄에서만 센 서로 다른 낱말 수(⑫ — AI가 곁가지인 카드를 거름) */
  core: (re: RegExp) => number;
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
  // 현장 말 낱말(④) — 2026-11-09 간담회·건의·애로·고충·의견수렴을 더함(원문 말풍선이 없으면 이 낱말만으로는 2점까지)
  voice: /민원|불안|설문|만족도|국민\s?의견|간담회|건의|애로|고충|현장\s?(?:의견|목소리|요구)|의견\s?수렴/g,
  oneStop: /원스톱|일원화|한\s?번에|단일\s?창구|통합\s?(?:창구|서비스|플랫폼)|창구.{0,6}통합|통합했/g,
  edu: /교육|캠페인|훈련|체험|연습|안전\s?수칙/g,
  value: /공공성|효율성|서비스\s?질|안전성|편의성|신뢰성|투명성|접근성|형평성/g,
  accum: /자격|제도|인프라|누적|매년|해마다|연차/g,
  analysis: /현황\s?분석|실태\s?조사|수요\s?조사|현장\s?조사|진단|데이터\s?분석|원인\s?분석|분석/g,
  // AI·자동화 낱말(⑫ AX 전환형) — 영문 AI는 앞뒤가 영문자가 아닐 때만(AIoT·MAIL 등 제외)
  ax: /(?<![A-Za-z])AI(?![A-Za-z])|인공지능|자동\s?판독|챗봇|RPA|머신\s?러닝|딥\s?러닝|자동화|디지털\s?전환|생성형/g,
  // 업무 절차가 바뀐 낱말(⑫ — AI 낱말과 함께 있어야 문 신호): AI 낱말만으로는 운영 카드 102장 중 21장이 걸려(AI가 배경일 뿐인 주파수·전자파 카드 포함) 함께 보면 13장(2026-10-13 실측)
  proc: /수작업|수기|육안|절차\s?(?:단축|간소화|개선|자동화)|프로세스|업무\s?(?:효율|시간|처리|부담|자동화)|소요\s?(?:시간|기간)|처리\s?(?:시간|기간)|단축|인력\s?(?:절감|투입)|자동\s?(?:탐지|분석|분류|추출|검출|생성|점검)/g,
  // ⑨ 기존 쪽 낱말과 「수치 → 수치」 표기(2026-11-09)
  before: /기존|종전|개선\s?전|도입\s?전|As-?Is|AS-?IS|이전\s?(?:방식|절차)/g,
  arrowNum: /\d[\d,.]*\s?(?:건|일|시간|분|%|명|개|원|회|곳)?\s?(?:→|⇒)\s?\d/g,
  // ⑬ 시범 낱말 · 확산 낱말 · 지역 낱말
  pilot: /시범|실증|테스트베드|파일럿/g,
  spread: /확산|전국|표준화|지침화|전면\s?(?:시행|적용|도입)|본사업|정착|확대\s?(?:적용|운영|시행)/g,
  region: /수도권|영남|호남|충청|강원|제주|경남|경북|전남|전북|충남|충북|부산|대구|광주|대전|울산|세종|인천|권역|지역별|시도|지자체/g,
  // ⑭ 재점검·환류 낱말(카드 양식 머리 「[Act] 전년도 환류」는 ## 머리 줄이라 빠짐)
  loop: /재점검|환류|후속\s?점검|이행\s?점검|사후\s?점검|개선\s?(?:과제|계획|이행)|재발\s?방지|점검\s?결과|자체\s?평가/g,
  // ⑮ 위험·안전 낱말
  risk: /위험\s?(?:요인|요소|지역|성|등급|현장)|사고|재해|예방|안전\s?(?:점검|관리|사고|진단|수칙|확보)|작업\s?중지|무사고|추락|재발\s?방지/g,
  // ⑯ 데이터 낱말 · 결정 낱말
  data: /데이터\s?(?:분석|수집|연계|기반|축적|활용|구축|플랫폼)|빅\s?데이터|DB|통계|대시보드|지표\s?분석|모니터링\s?(?:체계|시스템)/g,
  decide: /정책\s?(?:반영|결정|수립|활용|근거)|의사\s?결정|기준\s?(?:마련|개선|정립|수립)|배분|우선\s?순위|선정\s?기준/g,
  // ⑱ 원인 낱말 · 조치 낱말(카드 칸 이름 「(장애 또는 리스크 요인)」·「(모니터링 및 해결 방안)」은 본문에서 뺀 뒤 셈)
  cause: /원인|요인|때문|기인|비롯/g,
  remedy: /조치|대응|해결|보완|해소|개선\s?방안/g,
  // ⑲ 로드맵 낱말 · 연도 — 「N단계」는 뺌(「기존 6단계 → 4단계」 같은 업무 공정에도 걸려 다년 계획이 없는 카드를 ⑲ 1순위로 올림 — 2026-11-09 실호출 확인, AI가 「다년 계획 근거 없음」으로 거절)
  roadmap: /로드맵|중장기\s?(?:계획|로드맵|추진)|Step\s?\d|STEP\s?\d|연차별|차년도|중기\s?계획|단계적\s?(?:추진|확대|구축)/g,
  year: /(?:20[2-3]\d|['’]\s?[2-3]\d)\s?년/g,
  // ⑳ 수혜 대상 낱말
  target: /중소\s?(?:기업|사업자)|소상공인|영세|취약\s?계층|고령|노인|장애인|청년|아동|어린이|학생|농어촌|도서\s?지역|다문화|외국인|저소득|스타트업|창업\s?기업|대기업|소규모|대상별|수요자별|맞춤형/g,
};
/**
 * 줄 머리 갈래 표지(카드 칸 경로 do.lines.N·plan.lines.N이 붙은 줄만): [1] do|plan, [2] 번호(①·❶) [3] 가. [4] 1) — 번호 갈래, 번호 없이 점(∙•·○)이면 점 갈래이고 [5] 괄호 키워드
 * (2026-11-09 — 예전에는 점 갈래 「∙ (키워드)」만 세어 「❶ …」·「① (…)」 표지 카드를 놓침)
 */
const HEAD = /^(do|plan)\.lines\.\d+ \| \s*(?:([①-⑳❶-❿➀-➓])|([가나다라마바사아자차카타파하])\.|(\d)\)|[∙•·○])\s?(?:\(([^)]{2,20})\))?/gm;
/** 양식 글 줄(신호로 안 셈): 개요 칸(☑ 체크박스)·지표 범주·ESG 칸·담당자·부서, `## ` 머리 줄 */
const FORM_LINE = /^(?:(?:overview\.cells\.\d+|kpi\.categoriesText|strategy\.esgText|@person|deptText) \||## )/;
/** 칸 이름(양식 — 거의 모든 카드에 있어 ⑱이 50/56장에 걸렸음) */
const FORM_LABEL = /\(장애 또는 리스크 요인\)|\(모니터링 및 해결 방안\)/g;
/** 제목·계획·추진내용 줄(⑫ 핵심 줄) */
const CORE_LINE = /^(?:title|do\.lines\.\d+|plan\.lines\.\d+)/;
const has = (kind: string) => (c: Ctx) => c.kinds.has(kind);
const many = (re: RegExp, min: number, max = Infinity) => (c: Ctx) => {
  const n = c.words(re);
  return n >= min && n <= max;
};
const distinctWords = (text: string) => (re: RegExp) => new Set([...text.matchAll(re)].map((m) => m[0].replace(/\s/g, ""))).size;

// 무게는 운영 원장 주요사업 활성 카드 56장(261103판)의 신호 빈도와 틀 분포 집계(scripts/eval/story-cards.ts)로 맞춤(2026-11-09 P1-2).
// 신호는 전년 절을 뺀 카드 본문 + 숫자 근거 첨부와 그 글로 만든 도식 후보 종류만 봄(전년 절 글이 ①·⑧·⑨를 끌었음 — 연도 흐름 24 → 7장, 전후 한 줄 39 → 19장).
// 어디에나 걸려 변별력이 없는 신호(단계 표지 steps 43/56장, '25 평가위원 지적 53/56장)는 뺐고, 문 신호는 대략 1~25장에 걸리게 둠. 드문 틀(④·⑭·⑯)은 억지로 올리지 않음
const SIGNALS: Record<MainStory, Signal[]> = {
  "단계 전개형": [
    { test: many(W.rnd, 4), w: 2, gate: true, why: "연구·개발·확산 단계 낱말 4개 이상" },
    { test: many(W.rnd, 5), w: 1, why: "단계 낱말 5개 이상" },
    { test: many(W.rnd, 3, 3), w: 1, gate: true, why: "연구·개발·확산 단계 낱말 3개" },
    { test: has("timeline"), w: 2, gate: true, why: "카드 글의 연도 3개 흐름" },
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
    { test: many(W.voice, 2), w: 2, gate: true, why: "민원·간담회·건의·의견수렴" },
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
    { test: has("timeline:dots"), w: 3, gate: true, why: "카드 글의 연도 4개 이상(연혁)" },
    { test: (c) => c.kinds.has("timeline") && c.words(W.accum) >= 2, w: 2, gate: true, why: "연도 흐름 + 제도·자격 축적" },
    { test: many(W.accum, 1), w: 1, why: "해마다 쌓은 제도·인프라" },
  ],
  // '25 평가위원 지적은 신호에서 뺌(53/56장에 걸려 변별력 없음 — 2026-11-09)
  "기존→개선형": [
    { test: has("compare:panels"), w: 3, gate: true, why: "기존과 개선이 한 줄에 든 글" },
    { test: (c) => c.words(W.before) >= 1 && c.words(W.arrowNum) >= 1, w: 2, gate: true, why: "「기존·종전·도입 전」과 「수치 → 수치」 표기" },
  ],
  // 갈래 3개 이하는 ⑰ 쪽(번호 갈래 2~4개) — ⑩은 갈래 4개 이상을 표 하나로
  "구분표 중심형": [
    { test: (c) => c.dot >= 4 || c.num >= 5, w: 3, gate: true, why: "추진내용 갈래 4개 이상(점 갈래 4개 이상 또는 번호 갈래 5개 이상)" },
    { test: (c) => Math.max(c.dot, c.num) >= 5, w: 1, why: "갈래 5개 이상" },
  ],
  "현황분석→대응형": [
    { test: many(W.analysis, 3), w: 3, gate: true, why: "현황분석·조사·진단 낱말 3종 이상" },
    { test: has("table"), w: 1, why: "행·열 수치(분석 결과)" },
  ],
  // ⑫(2026-10-13): AI·자동화 낱말 서로 다른 것 2개 이상 + 업무 절차가 바뀐 낱말 2개 이상, 2026-11-09부터 제목·계획·추진내용 줄에 AI 낱말 1개 이상(AX 연계 붙임만으로는 안 열림)
  "AX 전환형": [
    { test: (c) => c.core(W.ax) >= 1 && c.words(W.ax) >= 2 && c.words(W.proc) >= 2, w: 3, gate: true, why: "AI·자동화 낱말과 업무 절차 변화(수작업·소요 시간·단축 등)" },
    // 절차 변화 낱말이 4개 이상이면 뚜렷한 전환 과제(운영 카드 7장 — 1-가 안테나 자동판독은 이것 없이 3점이라 5·4·4점 틀에 밀려 후보 3개 밖이었음, 2026-10-13 실측)
    { test: many(W.proc, 4), w: 2, why: "업무 절차 변화 낱말 4개 이상" },
    { test: has("compare:panels"), w: 1, why: "기존과 새 절차가 한 줄에 든 글" },
  ],
  // ⑬~⑯ 신호(2026-11-09 — 2026-11-04에 틀만 더하고 신호가 비어 후보로 안 나왔음)
  "시범→확산형": [
    { test: (c) => c.words(W.pilot) >= 1 && c.words(W.spread) >= 2, w: 3, gate: true, why: "시범·실증 낱말과 확산·표준화·정착 낱말" },
    { test: many(W.region, 2), w: 1, why: "지역·권역 낱말" },
  ],
  "환류 개선형": [
    { test: many(W.loop, 3), w: 3, gate: true, why: "재점검·환류·이행 점검 낱말 3종 이상" },
    { test: many(W.loop, 2, 2), w: 2, gate: true, why: "재점검·환류 낱말" },
  ],
  "위험관리·안전형": [
    { test: many(W.risk, 4), w: 3, gate: true, why: "위험 요인·사고·예방·안전 점검 낱말 4종 이상" },
    { test: many(W.risk, 3, 3), w: 2, gate: true, why: "위험·예방·안전 낱말" },
  ],
  "데이터 기반 의사결정형": [
    { test: (c) => c.words(W.data) >= 2 && c.words(W.decide) >= 2, w: 3, gate: true, why: "데이터 수집·분석 낱말과 정책 반영·기준 마련 낱말" },
    { test: (c) => c.words(W.data) >= 2 && c.words(W.decide) === 1, w: 2, gate: true, why: "데이터 분석 낱말과 결정 낱말 하나" },
  ],
  // ⑰~⑳(2026-11-09, 경평 초안 프레임워크 확장 계획 P1)
  "핵심키워드 연결형": [
    { test: (c) => c.num >= 2 && c.num <= 4, w: 3, gate: true, why: "추진내용 번호 갈래 2~4개(①·❶·가.·1))" },
    { test: (c) => c.planNum >= 2, w: 1, why: "조치 및 개선방향에도 번호 갈래" },
  ],
  "문제·원인별 해결형": [
    { test: (c) => c.words(W.cause) >= 2 && c.words(W.remedy) >= 2, w: 3, gate: true, why: "원인 낱말 2종과 조치 낱말 2종 이상" },
    { test: (c) => c.words(W.cause) === 1 && c.words(W.remedy) >= 2, w: 2, gate: true, why: "원인 낱말과 조치 낱말" },
  ],
  "로드맵형": [
    { test: many(W.roadmap, 2), w: 3, gate: true, why: "로드맵·Step·단계적 추진 낱말 2종 이상" },
    { test: (c) => c.words(W.roadmap) === 1 && (c.words(W.year) >= 3 || c.midTerm), w: 2, gate: true, why: "로드맵 낱말과 여러 해 계획" },
    { test: (c) => c.midTerm, w: 1, why: "중장기과제" },
    { test: has("timeline"), w: 1, why: "연도 흐름" },
  ],
  "대상별 맞춤형": [
    { test: many(W.target, 3), w: 3, gate: true, why: "수혜 대상 낱말 3종 이상(중소·소상공인·취약계층 등)" },
    { test: many(W.target, 2, 2), w: 2, gate: true, why: "수혜 대상 낱말 2종" },
  ],
};

/** 동점일 때 먼저 둘 기본형 ★(교육 자료 분류표 — ⑨ ⑱ ① ⑰ ⑩), 나머지는 틀 번호 순 */
const STAR_FIRST: readonly MainStory[] = ["기존→개선형", "문제·원인별 해결형", "단계 전개형", "핵심키워드 연결형", "구분표 중심형"];
const tieRank = (s: MainStory) => (STAR_FIRST.includes(s) ? STAR_FIRST.indexOf(s) : STAR_FIRST.length + MAIN_STORIES.indexOf(s));

/** 신호를 볼 값: 양식 글(개요 칸·지표 범주·ESG·`## ` 머리 줄·칸 이름)을 뺀 본문으로 셈 */
function contextOf(hints: DiagramHint[], text: string): Ctx {
  const body = text
    .split("\n")
    .filter((l) => !FORM_LINE.test(l))
    .join("\n")
    .replace(FORM_LABEL, "");
  const num = new Set<string>();
  const planNum = new Set<string>();
  const dot = new Set<string>();
  for (const m of body.matchAll(HEAD)) {
    const mark = m[2] ?? m[3] ?? m[4];
    if (m[1] === "plan") {
      if (mark) planNum.add(mark);
    } else if (mark) num.add(mark);
    else if (m[5]) dot.add(m[5].replace(/\s/g, ""));
  }
  return {
    kinds: new Set(hints.map((h) => h.kind)),
    quote: hints.some((h) => h.kind === "quotes" && h.why.startsWith("원문 인용")),
    asked: hints.some((h) => h.kind === "qa" && h.why.startsWith("질문 글")),
    num: num.size,
    planNum: planNum.size,
    dot: dot.size,
    midTerm: /☑\s?중장기과제/.test(text),
    words: distinctWords(body),
    core: distinctWords(
      body
        .split("\n")
        .filter((l) => CORE_LINE.test(l))
        .join("\n"),
    ),
  };
}

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
 * 형제가 이미 주 틀로 쓴 틀은 형제 하나에 SIBLING_COST씩 깎아 뒤로 미룸(빼지는 않음 — 그래도 가장 맞으면 앞에 남음). 동점이면 기본형 ★ 먼저(tieRank)
 * hints·text는 전년 절을 뺀 카드 본문(+ 숫자 근거 첨부)과 그 글로 만든 도식 후보 — 서버는 section.ts storyHintsOf로 넘김(2026-11-09 P1-2)
 */
export function storyHints(hints: DiagramHint[], text: string, siblingStories: string[] = []): StoryHint[] {
  const ctx = contextOf(hints, text);
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
  return out.sort((a, b) => b.score - a.score || tieRank(a.story) - tieRank(b.story)).slice(0, MAX_HINTS);
}

/** 요청 글 「틀 고르기」(report-outline/request.md storyHints·storyHints.item·storyHints.none·storyHints.siblings) */
export function storyHintsPrompt(p: PromptSet, hints: StoryHint[]): string {
  const items = hints.length
    ? hints.map((h) => fillFrom(p, "request", "storyHints.item", { story: h.story, why: h.why, opener: h.opener || "—", siblings: h.siblings ? fillFrom(p, "request", "storyHints.siblings", { n: h.siblings }) : "" })).join("\n")
    : fillFrom(p, "request", "storyHints.none");
  return fillFrom(p, "request", "storyHints", { items });
}
