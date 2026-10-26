// 경평 초안 도식 고르기(결정론, 순수) — 카드·근거 글의 신호로 어울리는 도식 후보를 뽑고, 같은 주요사업 초안들이 이미 쓴 도식을 셉니다.
// 후보는 두 갈래입니다. 「기본 도식」(전후 비교·흐름·병렬 칸·연도 흐름·수치 띠)은 어느 과제에나 맞고, 「이 과제만의 요소」(인용 상자·현장 목소리·
// 정의 박스·우수사례·협업 구조·막대)는 그 과제에 근거가 있을 때만 맞습니다(메시지 띠·가치 띠는 근거 없이도 붙일 수 있어 세지 않음).
// 2025 최종본 반쪽 소항목 10개 중 8개가 기본 도식 1~3개 + 과제만의 요소 1개 이상으로 짜였습니다(docs/analysis/2025-주요사업-outline.json).
// 평가 세트 기준선(2026-09-27)은 0.5쪽 초안 3장 모두 기본 도식만 썼는데, 원인은 예전 신호가 과제를 가려내지 못한 것입니다:
// 「기존·개선·→」 3번이면 전후 비교 → 카드 59장 전부, 1·2순위 47장. 지금은 한 줄에 전(기존·현행·수기…)과 후(개선·전환·→…)가 함께 있는 줄만 셈(13/59).
// 요청 글 「도식 고르기」(resources/prompts/report-draft/request.md diagram.*)에 넣고, 검증은 한 소항목 안 같은 도식 반복·과제만의 요소 없음을 봅니다.

import { type Block, VARIANTS } from "./blocks.ts";

export interface DiagramHint {
  /** 블록 이름(kind 또는 kind:모양) */
  kind: string;
  /** 왜 어울리는지(찾은 신호) */
  why: string;
  /** 이 과제만의 요소(근거가 있어야 쓰는 블록)인가 — 아니면 기본 도식 */
  own: boolean;
}

/** 이 과제만의 요소가 되는 블록 종류(근거가 있어야 쓸 수 있음) — 나머지(compare·steps·cards·timeline·stats·qa·table·strategy·pdca)는 기본 도식, banner·band·bullets·subhead는 어느 쪽도 아님 */
export const OWN_KINDS = ["quotes", "voices", "define", "case", "hub", "chart"] as const;
export const isOwnKind = (kind: string) => (OWN_KINDS as readonly string[]).includes(kind.split(":")[0]);

/** 글 밖에서 코드가 아는 신호 */
export interface HintExtras {
  /** 이 과제의 '25 평가위원 지적 원문(평가 근거 critiques) — 인용 상자로 「지적 → 올해 조치」를 보일 수 있음 */
  critiques?: string[];
  /** 막대로 그릴 수 있는 같은 지표의 시점별 값(예: 「AI 활용 고위험 작업 대체 건수: ’25년 30,706건 → ’26년 목표 45,000건」) */
  series?: string[];
  /** 이 과제·사업의 '25 실사 질의(평가 근거 survey) — 평가위원이 물을 질문에 미리 답하는 Q&A 상자(질문 고르기 참고) */
  survey?: string[];
  /** 올해 실적 재료의 수치(lib/reports/actuals.ts yearFigures) — 주요사업 핵심 수치 띠 후보는 이것이 2개 이상일 때만(없으면 후보 없음, 막대 series와 같은 선례) */
  yearFigures?: string[];
}

/** 도식 후보 옵션 — track이 "mg"(경영관리)일 때만 경영관리 보고서의 짜임 신호를 더 켬. 없으면 주요사업 결과 그대로 */
export interface HintOptions {
  track?: "mg";
  /** 신호를 볼 추가 글(예: 2025 같은 평가내용 절) — 경영관리일 때만 합쳐 봄, 글마다 HINT_TEXT_MAX까지 */
  extraTexts?: string[];
}

const uniq = (xs: string[]) => [...new Set(xs)];
const all = (text: string, re: RegExp) => uniq([...text.matchAll(re)].map((m) => m[0].trim()));

/** 신호를 볼 글 상한 — 긴 첨부(표 자료 등)에서도 정규식이 오래 걸리지 않게 */
export const HINT_TEXT_MAX = 60_000;
const ORG_WORD = /^(?:KT|SKT|LGU\+|KISA|ETRI|[가-힣]{2,12}(?:부|청|공사|공단|협회|재단|센터|연구원|대학교?|사업자|통신사|제조사|지자체))$/;
/** 전후 비교 줄: 한 줄에 전(기존·현행·수기…)과 후(개선·전환·→…)가 함께 */
const BEFORE = /기존|현행|종전|수기|수작업|오프라인|As-Is/;
const AFTER = /개선|전환|→|To-Be|대체/;

/** 막대 표 신호: 연도(’25년·25.) 뒤 가까운 수치와 단위 — [1] 연도 두 자리, [3] 단위 */
const YEAR_NUM = /(?:’|')?(\d\d)(?:년도?|\.)?[^\d\n|]{0,12}?(\d[\d,]*(?:\.\d+)?)\s*(%p?|건|명|개소|개|국|종|억원|백만원|천원|만원|억|만|천|회|시간|분|일|km|곳|배|점|원|층|대|톤|t)/g;
/** 쉐브론 머리 표 신호: 단계 머리 낱말(현황·개선방향·적용 결과·추진 배경·협의 과정·신설 …) */
const STAGE_HEAD = /현황|문제점|진단|원인|배경|개선\s?방향|개선\s?방안|대책|해결\s?방안|협의\s?과정|적용\s?결과|신설|시행|확산|정착|기대\s?효과/;

/** 낱말 끝 조사(긴 것부터) — 「한국전력공사와」·「동서대학교와」를 기관 낱말로 읽기 위해 하나만 걷음 */
const ORG_JOSA = /(?:와의|과의|와도|과도|에서|으로|와|과|이|가|은|는|을|를|에|의|로|도|만|등)$/;
const orgOf = (w: string) => {
  if (ORG_WORD.test(w)) return w;
  const stem = w.replace(ORG_JOSA, "");
  return stem !== w && stem.length >= 2 && ORG_WORD.test(stem) ? stem : "";
};
/**
 * 글에 나온 기관 이름(낱말 단위 — 협업 구조 신호, 구성안 도식 근거 조건 lib/reports/frameworks.ts와 같은 셈).
 * 「민주정부」·「중앙정부」처럼 「정부」로 끝나는 낱말은 기관이 아님(국정과제 이름 「…민주정부 실현」이 「…부」로 끝나 잡혔음, 2026-10-14)
 * 낱말 끝 조사 하나는 걷고 판정(「한국전력공사와」→한국전력공사)
 */
export const orgNames = (text: string) => uniq(text.split(/[^가-힣A-Za-z0-9+]+/).map(orgOf).filter((w) => w && !/(요청|신청|부부|정부)$/.test(w)));

/** 협업 낱말(협업 구조 신호) — 단순 「연계」는 데이터 연계(API 출처)가 많아 넣지 않음 */
const COLLAB_WORD = /협업|협력|협약|MOU|공동|참여|위탁|협조|컨소시엄|협의체|거버넌스|파트너/;
/** 글 조각 경계: 줄바꿈·<br>만 — 표 한 행(「|」·칸 태그로 이어진 글)은 관련된 한 묶음으로 봄 */
const PIECE_SPLIT = /\n|<br\s*\/?>/i;

/** 협업 낱말이 든 조각에서 나온 기관(같은 조각에 협업 낱말이 없는 데이터 출처 기관은 뺌, 카드 개요 칸의 「협약 예산」 체크박스 조각은 협업 낱말로 안 봄) */
export const collabOrgNames = (text: string) => orgNames(text.split(PIECE_SPLIT).filter((p) => COLLAB_WORD.test(p.replace(/협약\s?예산/g, ""))).join("\n"));

/** 글 → 도식 후보(이 과제만의 요소 먼저, 갈래 안에서는 신호가 강한 순) */
export function diagramHints(fullText: string, extras: HintExtras = {}, opts: HintOptions = {}): DiagramHint[] {
  const mg = opts.track === "mg";
  const extra = mg ? (opts.extraTexts ?? []).map((x) => x.slice(0, HINT_TEXT_MAX)).join("\n").slice(0, HINT_TEXT_MAX) : "";
  const text = fullText.slice(0, HINT_TEXT_MAX);
  const out: Array<DiagramHint & { score: number }> = [];
  const push = (kind: string, why: string, score: number) => out.push({ kind, why, own: isOwnKind(kind), score });

  // 이 과제만의 요소 — 드문 신호일수록 앞에(우수사례 > 현장 목소리 > 정의 > 협업 구조 > 원문 인용 > 막대 > 지적 인용).
  // 지적 인용은 카드 37/59장에 걸려 앞세우면 모두 지적 인용 상자로 몰림(시드 59장 시험, 2026-09-27)
  const critiques = (extras.critiques ?? []).filter((x) => x.trim());
  if (critiques.length) push("quotes", `'25 평가위원 지적 ${critiques.length}건 — 지적 원문 인용 상자로 「지적 → 올해 조치」`, 3);
  const cited = all(text, /“[^”\n]{10,80}”/g).filter((q) => !/(?:요|죠|까)[.!?]?”$/.test(q));
  if (cited.length) push("quotes", `원문 인용 ${cited.length}개(${cited[0].slice(0, 24)}…) — 정부·CEO·현장 인용 상자`, 5);
  const talk = text.match(/“[^”\n]{6,}(?:요|죠|까)[.!?]?”/g) ?? [];
  if (talk.length) push("voices", `현장 말 ${talk.length}개 — 말풍선`, 8);
  if (/수상|공모전|우수사례|장관상|표창/.test(text)) push("case", "수상·공모전·우수사례 — 우수사례 상자", 9);
  // 협업 구조: 협업 낱말과 같은 조각에 든 기관만 셈 — 단순 API 데이터 출처 기관(국가법령정보센터·천문연구원 등)이 협업 상대로 그려지던 오탐(주요사업3/7-나)
  const orgs = collabOrgNames(text);
  if (orgs.length >= 3) push("hub", `협업 낱말과 함께 나온 기관 ${orgs.length}곳(${orgs.slice(0, 4).join("·")}) — 협업 구조`, 5 + Math.min(1, (orgs.length - 3) / 5));
  if (/란\?|이란|개념|용어/.test(text)) push("define", "용어·개념 설명 — 정의 박스", 7);
  const values = all(text, /공공성|효율성|서비스\s?질|안전성|편의성|신뢰성|투명성/g);
  if (values.length >= 2) push("band", `가치 ${values.join("·")} — 가치 축 띠`, values.length);
  const series = (extras.series ?? []).filter((x) => x.trim());
  if (series.length) push("chart", `같은 지표의 시점별 값 ${series.length}개(${series[0]}) — 행 오른쪽 막대`, 4);

  // 기본 도식
  const years = uniq([...text.matchAll(/’(\d\d)년|20(\d\d)년/g)].map((m) => m[1] ?? m[2]));
  if (years.length >= 4) push("timeline:dots", `연도 ${years.length}개(’${years.sort().join("·’")}) — 연혁·누적 수치`, years.length);
  else if (years.length === 3) push("timeline", "연도 3개 — 단계 흐름(마지막이 올해)", 3);
  const baLines = text.split("\n").filter((l) => BEFORE.test(l) && AFTER.test(l));
  if (baLines.length) push("compare:panels", `전후가 한 줄에 든 글 ${baLines.length}줄 — 번호 매긴 As-Is/To-Be`, 2 + baLines.length * 2);
  const nums = uniq(text.match(/\d[\d,.]*\s*(?:%|건|명|개|국|종|억|만|천|회|시간|일|km|곳|배|점|개소|원)/g) ?? []);
  // 핵심 수치 띠: 주요사업은 올해 실적 수치 2개 이상일 때만 — 글의 단위 수치는 목표·전년 값도 세어 「’25 실적·’26 목표·자리표시」 띠를 부름(2026-10-15 블라인드 심사).
  // 경영관리는 글의 단위 수치 4개 이상(예전 그대로 — 수치 띠가 절을 닫는 추진성과인 경우가 많음)
  const yearNums = uniq(extras.yearFigures ?? []);
  if (mg && nums.length >= 4) push("stats", `수치 ${nums.length}개(${nums.slice(0, 3).join("·")} …) — 핵심 수치 띠`, Math.min(4, nums.length / 4));
  else if (!mg && yearNums.length >= 2) push("stats", `올해 실적 수치 ${yearNums.length}개(${yearNums.slice(0, 3).join("·")}${yearNums.length > 3 ? " …" : ""}) — 핵심 수치 띠`, Math.min(4, yearNums.length / 2));
  const stages = (text.match(/\d단계|Step\s?\d|[①②③④⑤]|~\d{1,2}월/g) ?? []).length;
  // ㄹ자(의견→한계→방향→해결)는 네 낱말이 모두 있을 때만
  const zig = stages >= 4 && ["의견", "한계", "방향", "해결"].every((w) => text.includes(w));
  if (stages >= 3) push(zig ? "steps:zigzag" : "steps", `단계·일정 표지 ${stages}개 — 차례 있는 실행`, Math.min(4, stages / 2));
  const risk = (text.match(/리스크|위험|한계|문제점?|부족|저하/g) ?? []).length;
  if (risk >= 3) push("cards", `문제·리스크 표현 ${risk}번 — 병렬 칸`, Math.min(4, risk / 3));
  // 수치 표: 한 줄에 단위 수치 3개 이상인 줄이 2줄 이상(카드 칸 경로 「path | 글」의 머리는 걷음 — 59장 중 12장)
  const UNIT = /\d[\d,.]*\s*(?:%|건|명|개|국|종|억|만|천|회|시간|일|km|곳|배|점|개소|원|층|대)/g;
  const multi = text.split("\n").filter((l) => new Set(l.replace(/^[^|\n]*\|\s*/, "").match(UNIT) ?? []).size >= 3);
  if (multi.length >= 2) push("table", `수치 3개 이상이 든 줄 ${multi.length}줄 — 행·열 수치 표`, Math.min(4, 1 + multi.length / 2));
  // 대립 2칸: 두 입장·방식이 맞섬(찬반·상충·대립 — 59장 중 2장)
  const vs = all(text, /(?<![A-Za-z])(?:VS|vs)(?![A-Za-z])|찬반|입장\s?차이|상충|대립/g);
  if (vs.length) push("cards:vs", `${vs.join("·")} — 두 입장을 맞세우는 VS 2칸`, 3);
  // 전략체계도·PDCA 순환(2026-10-09): 카드 양식 자체의 머리(## [Plan]·[Act] 환류 …)·지표 범주 칸(□ 중장기 경영목표 …)은 빼고 셈 —
  // 넣으면 59장 중 32장이 PDCA 후보가 됨. 「AI 비전 분석」처럼 비전은 다른 뜻이 많아 신호로 쓰지 않음
  const body = text.split("\n").filter((l) => !/^##\s|categoriesText/.test(l)).join("\n");
  // 전략체계도: 「전략체계」라고 적었거나, 목표 낱말(전략목표·경영목표) + 다른 체계 낱말 하나 이상(경영관리 1-1은 「전략목표」 없이 경영목표·세부목표·전략체계로 적음)
  const strat = new Set(body.match(/전략체계|경영목표|세부목표|전략목표|전략과제|추진전략|실행과제/g) ?? []);
  if (strat.has("전략체계") || ((strat.has("전략목표") || strat.has("경영목표")) && strat.size >= 2)) push("strategy", `${[...strat].join("·")} — 전략체계도`, 3);
  const cycle = body.match(/PDCA|P-D-C-A|선순환\s?체계|순환\s?구조|환류\s?체계/);
  if (cycle) push("pdca", `「${cycle[0]}」 — PDCA 순환(계획 → 실행 → 점검 → 환류)`, 3);
  // Q&A: 「왜·어떻게 …?」 질문 글, 또는 '25 실사 질의(평가위원이 물을 질문에 미리 답함 — 질문 고르기 참고로만)
  const asked = all(text, /(?:왜|어떻게)\s?[^?\n]{2,40}\?/g);
  const survey = (extras.survey ?? []).filter((x) => x.trim());
  if (asked.length) push("qa", `질문 글 ${asked.length}개(${asked[0].slice(0, 20)}…) — Q&A 상자`, 3);
  else if (survey.length) push("qa", `'25 실사 질의 ${survey.length}건 — 평가위원이 물을 질문에 미리 답하는 Q&A 상자`, 1.5);

  // 경영관리 전용 신호(2025 경영관리 보고서 분석 §8.4·§8.5·§8.9 — 모두 기본 도식, 이 과제만의 요소 아님)
  if (mg) {
    // 추가 글(2025 같은 평가내용 절)은 이 경영관리 신호에만 씀 — 위 신호(특히 이 과제만의 요소)에 넣으면 작년 사례·목소리를 올해 후보로 권함
    const mgBody = extra ? `${body}\n${extra.split("\n").filter((l) => !/^##\s/.test(l)).join("\n")}` : body;
    const mgYears = extra ? uniq([...mgBody.matchAll(/’(\d\d)년|20(\d\d)년/g)].map((m) => m[1] ?? m[2])) : years;
    const distinct = (re: RegExp) => new Set(mgBody.match(re) ?? []).size;
    const mgStrat = extra ? new Set(mgBody.match(/전략체계|경영목표|세부목표|전략목표|전략과제|추진전략|실행과제/g) ?? []) : strat;
    // 전략수립 대주제: 환경분석·비전·미션 낱말 + 목표·전략·과제 낱말 → 전략체계(§8.4 전략체계 표, §8.5 ① 전략수립형)
    if (/비전|미션/.test(mgBody) && mgStrat.size >= 1) push("strategy", `비전·미션 + ${[...mgStrat].join("·")} — 전략체계도`, 3);
    // 한 줄에 계획 → 실행 → 점검 → 환류 순서(§8.5 ⑤ PDCA 체계형 — 계획수립 P → 평가운영 D → 성과점검 C → 보상·환류 A).
    // 네 낱말이 글 어디에든 있으면 됨으로 보면 경영관리 카드 43장 중 35장이 후보가 됨(2026-10-12 실측) — 한 줄 순서로 좁힘
    if (/계획[^\n]{0,40}?(?:실행|운영|이행)[^\n]{0,40}?(?:점검|평가)[^\n]{0,40}?(?:환류|피드백)/.test(mgBody)) push("pdca", "한 줄에 계획 → 실행 → 점검 → 환류 — PDCA 순환", 2);
    // 소과제 표지: 소과제·세부과제·소주제가 둘 이상(§8.9 ⑨ 소과제 묶음형)
    const subs = (mgBody.match(/소과제|세부과제|소주제/g) ?? []).length;
    if (subs >= 2) push("cards", `소과제 표지 ${subs}번 — 소과제별 병렬 칸`, Math.min(4, 1 + subs / 2));
    // 환경분석 외부/내부 2열(§8.4 — cards 2칸 + 시사점 띠)
    if (/환경\s?분석/.test(mgBody) && /외부/.test(mgBody) && /내부/.test(mgBody)) push("cards", "환경분석 외부·내부 — 2칸 병렬 칸", 3);
    // 생애 단계 낱말(§8.9 ⑩ 생애주기형 — 단계 띠 + 단계별 표)
    const life = distinct(/채용|선발|배치|육성|교육|평가|보상|승진|퇴직|재취업/g);
    const grow = distinct(/발굴|지원|성장|정착|자립|연계/g);
    if (life >= 4 || grow >= 4) push("steps", `생애·지원 단계 낱말 ${Math.max(life, grow)}개 — 단계 띠`, 3);
    // 지침·가이드라인 준수·이행을 이어 쓴 글(§8.9 ⑪ 준수 점검형 — 항목·지침·이행·준수 표, 틀 후보 story-hints-mg COMPLY와 같은 기준 — 낱말만 따로 보면 카드 대부분이 걸림)
    if (/(?:지침|가이드라인|권고안?|기준)\s?(?:\d+%\s?)?(?:준수|이행)/.test(mgBody)) push("table", "지침·가이드라인 준수·이행 — 항목·지침·이행·준수 구분표", 3.5);
    // 「구분 | 주요활동 | 추진실적」 구분표(§8.4) · SWOT·월별 모니터링 매트릭스
    const sep = mgBody.split("\n").filter((l) => /구분/.test(l) && /주요\s?활동|추진\s?실적|추진\s?내용/.test(l)).length;
    if (sep) push("compare:table", "구분 · 주요활동 · 추진실적 열이 있는 글 — 구분표", 3);
    if (/SWOT/.test(mgBody)) push("table", "SWOT — 격자 표", 2.5);
    // 추진경과·로드맵 + 연도 둘 이상(§8.5 ⑥ 단계·연도 로드맵형)
    if (/추진\s?경과|로드맵|연혁/.test(mgBody) && mgYears.length >= 2) push("timeline", `추진경과·로드맵 + 연도 ${mgYears.length}개 — 연도 흐름`, 3);
    // 표 모양 4종(2026-10-12 — 분석 「블록 어휘 수준」 표, 카드 43장 실측 장수는 diagram-hints.test.ts). 모두 기본 도식
    // 추진실적 열: 2025 같은 평가내용 글에 오른쪽 「추진실적」 칸(혼자 선 「추진실적」 줄, 또는 구분·추진내용 같은 머리 없이 내용 칸 끝이 「| 추진실적」) +
    // 이 카드 정량 성과에 단위 수치 2가지 이상(오른쪽 칸에 쓸 큰 수치). 2025 글 신호만 보면 43장 중 23장
    const resultCol = mgBody.split("\n").some((l) => /^\s*추진\s?실적\s*$/.test(l) || (/\|\s*추진\s?실적\s*$/.test(l) && !/구\s?분|추진\s?(?:내용|배경|방향|절차)|주요\s?(?:내용|활동)|경영현안/.test(l)));
    const resultNums = new Set(body.split("\n").filter((l) => /^outcome\.quantitative/.test(l)).flatMap((l) => l.match(UNIT) ?? [])).size;
    if (resultCol && resultNums >= 2) push("table:result", `2025 같은 평가내용의 「추진실적」 열 + 이 카드 정량 성과 수치 ${resultNums}개 — 추진실적 열 표`, 3);
    // 막대 표: 이 카드 글(2025 글은 빼고 — 넣으면 43장 중 38장) 한 줄에 연도 둘 이상 + 같은 단위 수치 둘 이상(’25년 13명 → ’26년 14명)
    const pair = body.split("\n").find((l) => {
      const ms = [...l.matchAll(YEAR_NUM)];
      const units = new Map<string, number>();
      for (const m of ms) units.set(m[3], (units.get(m[3]) ?? 0) + 1);
      return new Set(ms.map((m) => m[1]).filter((y) => +y >= 18 && +y <= 30)).size >= 2 && [...units.values()].some((n) => n >= 2);
    });
    if (pair) push("table:bars", `한 줄에 연도별 같은 단위 수치(${pair.replace(/^[^|\n]*\|\s*/, "").slice(0, 30)}…) — 값 옆 막대 표`, 3);
    // 쉐브론 머리: 한 줄에 단계 머리 낱말 칸이 셋 이상(「구분 | 현황 | 개선방향 | 적용 결과」·「추진 배경 | 협의 과정 | … 신설」 — 짧은 칸만)
    const chev = mgBody.split("\n").find((l) => new Set(l.split(/[|▶→]/).map((x) => x.trim()).filter((x) => x && x.length <= 20 && STAGE_HEAD.test(x))).size >= 3);
    if (chev) push("table:chevron", `단계 머리 칸이 셋 이상인 줄(${chev.slice(0, 30)}…) — 쉐브론 머리 표`, 3.5);
    // 2단 라벨: 번호 소제목 아래 하위 번호(①-1·①-2 …)가 둘 이상
    const subNo = new Set(mgBody.match(/[①-⑳]\s?-\s?\d/g) ?? []);
    if (subNo.size >= 2) push("table:ladder", `하위 번호 ${[...subNo].slice(0, 4).join("·")} — 2단 라벨 표`, 3);
  }

  // 같은 종류는 가장 강한 신호 하나만, 과제만의 요소 먼저
  const best = new Map<string, DiagramHint & { score: number }>();
  for (const h of out) if (!best.has(h.kind) || best.get(h.kind)!.score < h.score) best.set(h.kind, h);
  return [...best.values()].sort((a, b) => Number(b.own) - Number(a.own) || b.score - a.score).map(({ kind, why, own }) => ({ kind, why, own }));
}

/** 같은 주요사업 초안들의 짜임 서명(blockSignature) → 도식별 사용 횟수(많은 순) */
export function kindUsage(signatures: string[]): Array<[string, number]> {
  const n = new Map<string, number>();
  for (const sig of signatures) for (const k of sig.split(" → ").map((x) => x.trim()).filter(Boolean)) if (!["bullets", "subhead"].includes(k)) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]);
}

/** 한 소항목 안에서 같은 도식(kind)을 두 번 이상 쓴 것(불릿·소제목·막대 제외 — 막대는 여러 개가 2025 관행) */
export function repeatedKinds(blocks: Block[]): string[] {
  const n = new Map<string, number>();
  for (const b of blocks) if (!["bullets", "subhead", "chart"].includes(b.kind)) n.set(b.kind, (n.get(b.kind) ?? 0) + 1);
  return [...n].filter(([, c]) => c > 1).map(([k]) => k);
}

/** 이 소항목이 쓴 과제만의 요소(OWN_KINDS) */
export const ownKindsIn = (blocks: Block[]) => uniq(blocks.map((b) => b.kind).filter((k) => isOwnKind(k)));

// ---------------------------------------------------------------------------
// 모양 다양성(2026-10-12 — 경고만, 고치기 사유·점수에는 안 씀): 운영 초안 10장에서 같은 카드가 회차에 따라 도식 9종 ↔ 5종(불릿·표·수치뿐)으로 갈림

/** 다양성 셈에서 빼는 글·띠 블록(불릿·소제목·가치 띠·메시지 띠) */
export const PLAIN_KINDS: ReadonlySet<string> = new Set(["bullets", "subhead", "band", "banner"]);

/** 모양 이름(kind, 기본이 아닌 모양이면 kind:variant — blockSignature와 같은 표기) */
export const shapeKeyOf = (b: { kind: string; variant: string }) => (b.variant && b.variant !== (VARIANTS[b.kind as Block["kind"]]?.[0] ?? "") ? `${b.kind}:${b.variant}` : b.kind);

/** 글·띠를 뺀 블록 수와 서로 다른 모양 수 */
export function shapeVariety(blocks: Array<{ kind: string; variant: string }>): { counted: number; distinct: number } {
  const xs = blocks.filter((b) => !PLAIN_KINDS.has(b.kind)).map(shapeKeyOf);
  return { counted: xs.length, distinct: new Set(xs).size };
}

/** 주요사업 소항목 기준: 시각 블록(글·띠 제외)이 3개 이상이면 서로 다른 모양 3가지 이상 */
export const BIZ_VARIETY = { from: 3, min: 3 } as const;

/** 주요사업 다양성 경고 한 줄(구성안·초안 공용 — 같은 kind 반복은 repeatedKinds가 따로 봄), 맞으면 null */
export function bizVarietyIssue(blocks: Array<{ kind: string; variant: string }>): string | null {
  const v = shapeVariety(blocks);
  if (v.counted < BIZ_VARIETY.from || v.distinct >= BIZ_VARIETY.min) return null;
  return `짜임: 시각 블록 ${v.counted}개의 모양이 ${v.distinct}가지뿐입니다 — 서로 다른 모양 ${BIZ_VARIETY.min}가지 이상으로(후보에 없어도 내용 모양에 맞는 사전의 다른 도식·모양).`;
}

/**
 * 경영관리 카드 기준(2026-10-12): 카드 전체에서 서로 다른 모양이 블록 수(글·띠 제외)의 절반을 넘게(4개 이상일 때) — 단조롭다고 본 13-4 4회차가 8개 중 4가지(정확히 절반),
 * 9종이던 3회차가 10개 중 8가지, 7절 8-1이 19개 중 11가지. 한 절에서 같은 표 모양은 한 번(일반 구분표 table 두 개 대신 표 모양 result·bars·chevron·ladder나 다른 도식)
 */
export const MG_VARIETY = { from: 4 } as const;

/** 경영관리 다양성 경고(구성안·초안 공용): blocks와 같은 순서의 절 열쇠(at), 절 이름(name) */
export function mgVarietyIssues(blocks: Array<{ kind: string; variant: string }>, at: string[], parts: Array<{ key: string; name: string }>): string[] {
  const out: string[] = [];
  for (const p of parts) {
    const n = new Map<string, number>();
    blocks.forEach((b, i) => {
      if (at[i] === p.key && b.kind === "table") n.set(shapeKeyOf(b), (n.get(shapeKeyOf(b)) ?? 0) + 1);
    });
    const dup = [...n].filter(([, c]) => c > 1);
    if (dup.length) out.push(`짜임: ${p.name}에 같은 표 모양(${dup.map(([k, c]) => `${k} ${c}개`).join("·")})을 겹쳐 썼습니다 — 한 절에 같은 표 모양은 하나까지, 둘째 표는 다른 표 모양(추진실적 열·막대 표·쉐브론 머리·2단 라벨)이나 다른 도식으로.`);
  }
  const v = shapeVariety(blocks);
  if (v.counted >= MG_VARIETY.from && v.distinct * 2 <= v.counted) out.push(`짜임: 블록 ${v.counted}개(불릿·소제목·띠 제외)의 모양이 ${v.distinct}가지뿐입니다 — 서로 다른 모양이 절반을 넘게(후보에 없어도 내용 모양에 맞는 사전의 다른 도식·표 모양).`);
  return out;
}
