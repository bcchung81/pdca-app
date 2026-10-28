// 경평 초안 「올해 실적」(lib/reports/actuals.ts) 단위 시험 — 자리표시·수치 판별·시점 가르기·초안 경고를 모두 다룹니다.

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NEED_RE, NEEDS_MAX, TIMING_LABEL, dedupeNeedYear, hasFigure, kpiGaps, needsIn, outcomeActuals, planOnly, stripNeeds, timingOf, yearActuals, yearIssues } from "./actuals.ts";
import { reportDraftPrompts, reportDraftPromptsMg } from "../prompts/sets.ts";
import { cleanLine, sectionContext, sectionPrompt } from "./section.ts";
import { mgMaterialsPrompt } from "./mg-draft.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const seed = { cards: seedCards<Record<string, any>>() };
const card1 = seed.cards.find((c) => c.id === "주요사업1/1-가")!;
const card2 = seed.cards.find((c) => c.id === "주요사업3/7-나")!;

// ---------------------------------------------------------------------------
// 자리표시: NEED_RE·needsIn·stripNeeds

test("NEED_RE: 【확인: …】 패턴만 찾음(대괄호 밖은 매치 안 됨)", () => {
  assert.deepEqual([...`가 【확인: A】 나 【확인: B】`.matchAll(NEED_RE)].map((m) => m[1]), ["A", "B"]);
  assert.deepEqual([...`괄호 없음`.matchAll(NEED_RE)], []);
});

test("needsIn·stripNeeds: 자리표시 안 글을 나온 순·중복 없이 뽑고, 걷은 글에는 남지 않음", () => {
  const text = "실적 【확인: ’26년 누적 건수】 달성, 또 【확인: ’26년 누적 건수】, 【확인: ’26년 목표 대비】";
  assert.deepEqual(needsIn(text), ["’26년 누적 건수", "’26년 목표 대비"]);
  assert.equal(stripNeeds(text), "실적  달성, 또 , ");
  assert.deepEqual(needsIn("자리표시가 없는 글"), []);
  assert.deepEqual(needsIn("  【확인:   앞뒤 빈칸  】  "), ["앞뒤 빈칸"], "안쪽 글은 다듬음");
});

// ---------------------------------------------------------------------------
// hasFigure: 날짜·시점은 걷고, 단위 붙은 수치만

test("hasFigure: 날짜(7.6.)·시점(’26.7)은 수치가 아니고, 단위 붙은 수는 참", () => {
  assert.equal(hasFigure("협력회의 개최(7.6.)"), false);
  assert.equal(hasFigure("’26.7월 오픈"), false);
  assert.equal(hasFigure("659건 응답"), true);
  assert.equal(hasFigure("3사 공동 검토"), false, "단위 목록에 없는 '사'는 수치로 안 침");
  assert.equal(hasFigure(""), false);
  assert.equal(hasFigure("고위험 작업 대체 45,000건 달성"), true);
});

// ---------------------------------------------------------------------------
// timingOf: note 우선 → 칸 전체, 자리표시는 need, 시점 뒤 12자 안 목표어면 target

test("timingOf: 실측 표본(핵심 수치 띠 칸) — none·now·past·target·need", () => {
  assert.equal(timingOf({ note: "", text: "659건" }, 2026), "none", "시점 없는 머리·빈 note");
  assert.equal(timingOf({ note: "’26.8 기준(’25년 130명)", text: "200명" }, 2026), "now", "note의 첫 시점이 올해면 now");
  assert.equal(timingOf({ note: "’25년 130명", text: "200명" }, 2026), "past", "note의 시점이 작년이면 past");
  assert.equal(timingOf({ note: "’26년 목표", text: "200명" }, 2026), "target", "시점 뒤 12자 안에 목표가 있으면 target");
  assert.equal(timingOf({ text: "【확인: ’26년 누적 건수】" }, 2026), "need", "자리표시는 note 유무와 무관하게 need");
  assert.equal(TIMING_LABEL.now, "올해 실적");
});

test("timingOf: note가 없으면 칸 전체(text)의 시점을 보고, '올해'·'금년' 같은 연도 없는 표현도 now", () => {
  assert.equal(timingOf({ text: "’25년 130명" }, 2026), "past", "note 없으면 text로 대체");
  assert.equal(timingOf({ note: "올해 실적", text: "200명" }, 2026), "now");
  assert.equal(timingOf({ note: "금년 목표", text: "200명" }, 2026), "target");
  assert.equal(timingOf({ text: "지난해 감사 지적" }, 2026), "none", "연도 표현이 없으면 목표·예상 낱말도 없어 none");
  assert.equal(timingOf({ text: "예상 실적" }, 2026), "target", "시점 표현이 없어도 칸 전체에 예상·목표가 있으면 target");
});

// ---------------------------------------------------------------------------
// planOnly: 예상·목표·계획·전망 낱말이 있고, 자리표시·올해 실제 언급이 없을 때만

test("planOnly: 목표·예상 낱말 + 올해 실제 언급 없음일 때만 참", () => {
  assert.equal(planOnly("’26년 목표 200건 달성 예상", 2026), true, "시점 바로 뒤가 목표면 올해 언급으로 안 침");
  assert.equal(planOnly("’26년 200건 달성, 목표 대비 초과", 2026), false, "시점 바로 뒤에 목표가 없으면 올해 실제 언급 — planOnly 아님");
  assert.equal(planOnly("현장 검사 완료", 2026), false, "목표·예상 낱말 자체가 없음");
  assert.equal(planOnly("【확인: ’26년 목표 대비】 달성 예상", 2026), false, "자리표시가 있으면 planOnly 아님(확인 필요로 다룸)");
});

// ---------------------------------------------------------------------------
// yearActuals·kpiGaps: 실제 시드 카드로

test("yearActuals: 카드 계량지표(부서 입력 우선) + 올해 수치 든 월별 실적만 — 주요사업1/1-가(월별 수치 없음)", { skip: NO_SEED_CARDS }, () => {
  const a = yearActuals(card1, {}, "2026-09-27");
  assert.equal(a.today, "2026-09-27");
  assert.deepEqual(a.kpi, [{ name: "AI 활용 고위험 작업 대체 건수", unit: "건", prev: "30,706건", target: "45,000건", expected: "", input: "" }]);
  assert.deepEqual(a.monthly, [], "1월~8월 월별 실적은 날짜·건수 이하 단위뿐이라 수치 든 줄 없음");
  assert.deepEqual(kpiGaps(a), a.kpi, "부서 입력도 카드 예상 칸도 없으면 채울 자료");
});

test("yearActuals: 주요사업3/7-나(계량지표 2행·월별 수치 659건) — 부서 입력이 있는 지표는 채울 자료에서 빠짐", { skip: NO_SEED_CARDS }, () => {
  const a = yearActuals(card2, { "주요사업3/7-나#전담기관 만족도": "91점" }, "2026-09-27");
  assert.equal(a.kpi.length, 2);
  assert.equal(a.kpi[0].name, "전담기관 만족도");
  assert.equal(a.kpi[0].input, "91점", "inputs 키는 카드id#지표이름(lib/reports/model.ts kpiKeyedRows)");
  assert.equal(a.kpi[1].input, "", "이름이 다른 지표는 입력 없음");
  assert.equal(a.monthly.length, 2, "수치가 든 줄만(테이블·날짜만 있는 줄 제외)");
  assert.ok(a.monthly.every((m) => m.period === "1월~9월"));
  assert.ok(a.monthly.some((m) => m.line.includes("659건")));
  assert.deepEqual(kpiGaps(a), [a.kpi[1]], "입력이 있는 첫 지표는 빠지고, 둘째만 채울 자료");
});

test("yearActuals: kpi.rows의 예상 칸(expected)도 담고, 빈 자리표시(-) 행은 model.ts kpiRowsOf와 같이 뺌", () => {
  const synthetic = { id: "X", kpi: { rows: [{ name: "지표A", unit: "건", prev: "10건", target: "20건", expected: "15건" }, { name: "-", unit: "", prev: "-", target: "-" }] }, do: { monthly: [] } };
  const a = yearActuals(synthetic, {}, "");
  assert.deepEqual(a.kpi, [{ name: "지표A", unit: "건", prev: "10건", target: "20건", expected: "15건", input: "" }]);
});

// ---------------------------------------------------------------------------
// yearIssues: 초안 경고(수치 띠 시점·올해 실적 칸·추진성과·자리표시 상한)

const statsCell = (head: string, note = "", bullets: string[] = []) => ({ head, tag: "", bullets, note });
const statsBlock = (cells: Array<ReturnType<typeof statsCell>>) => ({ kind: "stats", cells });

test("yearIssues: 핵심 수치 띠 칸에 시점이 없으면 칸별 경고, 올해·확인 칸이 하나도 없으면 별도 경고", () => {
  const bare = [statsBlock([statsCell("40,000건"), statsCell("97%")])];
  const out = yearIssues(bare, [], "", 2026);
  assert.equal(out.length, 2);
  assert.match(out[0], /핵심 수치 띠: 시점이 없는 칸 2개\(40,000건·97%\)/);
  assert.match(out[1], /핵심 수치 띠에 올해\(’26년\) 실적 칸이 없습니다\(40,000건 시점 없음·97% 시점 없음\)/);
});

test("yearIssues: 시점이 있고 올해·확인 칸이 하나라도 있으면 수치 띠 경고 없음", () => {
  const ok = [statsBlock([statsCell("40,000건", "’26.8 기준"), statsCell("97%", "’25년")])];
  assert.deepEqual(yearIssues(ok, [], "", 2026), []);
  const withNeed = [statsBlock([statsCell("【확인: ’26년 누적 건수】"), statsCell("97%", "’25년")])];
  assert.deepEqual(yearIssues(withNeed, [], "", 2026), [], "자리표시 칸도 올해 실적 칸으로 침(시점 경고도 없음 — need는 bare에서 빠짐)");
});

test("yearIssues: 추진성과가 예상·목표·전년 값뿐이면 경고, 올해 실적·자리표시가 하나라도 있으면 경고 없음 — 1-가 평가 세트 기준선 표본", () => {
  const planAndPast = [
    "AI 판독 전국 확산으로 현장 검사 소요시간 **약 1.5만 시간 절감** 예상",
    "’25년 대비 150% 상향된 고소 현장위험 약 4.5만회 원천 해소 예상",
    "표준 운영절차･RIMS 연계로 판정 편차 최소화, 검사 품질 신뢰도 확보",
  ];
  const out = yearIssues([], planAndPast, "", 2026);
  assert.equal(out.length, 1);
  assert.match(out[0], /추진성과에 올해\(’26년\) 실적이 없습니다\(예상·목표·전년 값뿐이거나 시점이 없음\)/);

  assert.deepEqual(yearIssues([], [...planAndPast, "(’25년 130명 → ’26년 200명) 달성"], "", 2026), [], "올해 실제 값이 섞이면 경고 없음");
  assert.deepEqual(yearIssues([], ["【확인: ’26년 누적 판독 건수】 달성(목표 45,000건)"], "", 2026), [], "자리표시로 남긴 것도 경고 없음");
  assert.deepEqual(yearIssues([], [], "", 2026), [], "추진성과 문장이 없으면 판단하지 않음");
});

test("yearIssues: (’25년 130명 → ’26년 200명)처럼 올해 값을 괄호로 함께 쓰면 단독으로도 경고 없음", () => {
  assert.deepEqual(yearIssues([], ["(’25년 130명 → ’26년 200명) 달성"], "", 2026), []);
});

test("yearIssues: 자리표시가 NEEDS_MAX(4)개를 넘으면 경고 — 스택 칸·추진성과와 별개로 전체 글(allText)에서 셈", () => {
  const okStats = [statsBlock([statsCell("40,000건", "’26.8 기준"), statsCell("97%", "’26.9 기준")])];
  const needs5 = Array.from({ length: 5 }, (_, i) => `【확인: 항목${i}】`).join(" ");
  const out = yearIssues(okStats, [], needs5, 2026);
  assert.deepEqual(out, [`자리표시가 5개입니다 — 평가 논점에 꼭 필요한 수치 ${NEEDS_MAX}개까지만 남깁니다.`]);
  assert.deepEqual(yearIssues(okStats, [], "【확인: 항목1】 【확인: 항목2】", 2026), [], "상한 이하면 경고 없음");
});

// ---------------------------------------------------------------------------
// 카드 정량 성과 칸의 올해 실적(2026-10-27 — 주요사업1/7-가: 칸에 「’26년 성과 2.000일」이 있는데 계량지표가 「없음 → 【확인】」으로 안내됐음)

const OUTCOME_CARD = {
  id: "주요사업9/7-가",
  kpi: { rows: [{ name: "공공용 주파수 신속 공급 성과", unit: null, prev: "2.833", target: "2.267" }, { name: "이용기관 만족도", unit: "점", prev: "80", target: "85" }] },
  outcome: {
    quantitative: [
      "∙ 공공용 주파수 신속 공급 성과 달성(‘26.8)",
      "(‘26년 목표 2.267일 → ‘26년 성과 2.000일)",
      "∙ ’26년 운용수익률 목표 100% 초과 달성",
      "∙ 교육 운영실적 00% 증가(’26.12 예정)",
      "∙ ’25년 대비 150% 상향된 약 4.5만회 위험 해소 예상",
      "∙ ’26년 상반기 현장 점검 실적 120건",
    ],
  },
};

test("outcomeActuals: 글머리 없는 줄은 앞 항목에 붙이고, 올해 시점·목표가 아닌 수치·성과/실적/달성이 있고 예정·예상이 아닌 줄만(‘26 → ’26)", () => {
  assert.deepEqual(outcomeActuals(OUTCOME_CARD, 2026), ["공공용 주파수 신속 공급 성과 달성(’26.8) (’26년 목표 2.267일 → ’26년 성과 2.000일)", "’26년 상반기 현장 점검 실적 120건"]);
  assert.deepEqual(outcomeActuals(OUTCOME_CARD, 2027), [], "다른 해");
  assert.deepEqual(outcomeActuals({ outcome: { quantitative: ["(’26년 목표 2.267일)"] } }, 2026), [], "목표 값뿐");
});

test("yearActuals: 정량 성과 줄은 이름 낱말이 맞는 계량지표에 붙고(kpi.outcome), 남은 줄은 outcome — today가 없으면 보지 않음", () => {
  const a = yearActuals(OUTCOME_CARD, {}, "2026-10-27");
  assert.equal(a.kpi[0].outcome, "공공용 주파수 신속 공급 성과 달성(’26.8) (’26년 목표 2.267일 → ’26년 성과 2.000일)");
  assert.equal(a.kpi[1].outcome, undefined);
  assert.deepEqual(a.outcome, ["’26년 상반기 현장 점검 실적 120건"]);
  assert.equal(yearActuals(OUTCOME_CARD).outcome, undefined);
  assert.equal(yearActuals(OUTCOME_CARD).kpi[0].outcome, undefined);
  assert.deepEqual(kpiGaps(a).map((k) => k.name), ["공공용 주파수 신속 공급 성과", "이용기관 만족도"], "채울 자료 목록은 그대로(부서 입력·예상 칸만 봄)");
});

test("요청 글: 정량 성과 칸 실적이 붙은 계량지표는 「없음 → 【확인】」 대신 그 줄로, 남은 줄은 따로 — 두 트랙", () => {
  const a = yearActuals(OUTCOME_CARD, {}, "2026-10-27");
  const biz = sectionPrompt(reportDraftPrompts().prompts, OUTCOME_CARD, sectionContext(OUTCOME_CARD, []), 2026, [], [], [], [], a);
  assert.match(biz, /계량지표 공공용 주파수 신속 공급 성과\(—\): .*’26년 실적 공공용 주파수 신속 공급 성과 달성\(’26\.8\) \(’26년 목표 2\.267일 → ’26년 성과 2\.000일\)\(카드 정량 성과 칸/);
  assert.doesNotMatch(biz, /【확인: ’26년 공공용 주파수 신속 공급 성과】/);
  assert.match(biz, /【확인: ’26년 이용기관 만족도】/, "붙은 줄이 없는 지표는 그대로");
  assert.match(biz, /카드 정량 성과 칸 중 올해 실적이 든 줄[^\n]*\n {2}- ’26년 상반기 현장 점검 실적 120건/);
  const ctx = { indicator: "지표", taskNo: "9-1", markers: [], prior: [], evals: [], cardAsOf: "" };
  const mg = mgMaterialsPrompt(reportDraftPromptsMg().prompts, OUTCOME_CARD, ctx as never, 2026, [], [], [], a);
  assert.match(mg, /’26년 실적 공공용 주파수 신속 공급 성과 달성.*\(카드 정량 성과 칸/);
  assert.match(mg, /- ’26년 상반기 현장 점검 실적 120건/);
  // 정량 성과 실적이 없으면 예전 글 그대로(새 절이 안 나옴)
  assert.doesNotMatch(sectionPrompt(reportDraftPrompts().prompts, { id: "x" }, sectionContext({ id: "x" }, []), 2026, [], [], [], [], yearActuals({ id: "x" }, {}, "2026-10-27")), /카드 정량 성과 칸/);
});

// ---------------------------------------------------------------------------
// 윗첨자 연도 뒤 자리표시의 같은 연도(2026-10-27 — 화면 「’26년’26년 …」)

test("dedupeNeedYear·cleanLine: ^{’26년}【확인: ’26년 …】의 안쪽 같은 연도만 뺌 — 다른 연도·월 시점·연도뿐인 자리표시·윗첨자 없는 글은 그대로", () => {
  assert.equal(dedupeNeedYear("^{’25년}30,706건 → ^{’26년}【확인: ’26년 AI 활용 고위험 작업 대체 건수】 (목표 45,000건)"), "^{’25년}30,706건 → ^{’26년}【확인: AI 활용 고위험 작업 대체 건수】 (목표 45,000건)");
  assert.equal(dedupeNeedYear("^{’26}【확인: ’26년 소요기간(일)】"), "^{’26}【확인: 소요기간(일)】");
  assert.equal(dedupeNeedYear("^{’26년}【확인: ’25년 실적】"), "^{’26년}【확인: ’25년 실적】");
  assert.equal(dedupeNeedYear("^{’26년}【확인: ’26.4 전환 인원】"), "^{’26년}【확인: ’26.4 전환 인원】");
  assert.equal(dedupeNeedYear("^{’26년}【확인: ’26년】"), "^{’26년}【확인: ’26년】");
  assert.equal(dedupeNeedYear("’26년 건수는 【확인: ’26년 건수】"), "’26년 건수는 【확인: ’26년 건수】");
  assert.equal(cleanLine("- 인식도 ^{’25년}89% → ^{‘26년}【확인: ‘26년 위험성평가 인식도(%)】"), "인식도 ^{’25년}89% → ^{’26년}【확인: 위험성평가 인식도(%)】", "AI 답 정리 단계에서(두 트랙 공용)");
});

test("yearActuals: 열쇠는 지표 이름 — 행을 끼우거나 순서를 바꿔도 같은 지표에 값이 붙고, 이름이 바뀐 지표는 비어 보임", () => {
  const inputs = { "c1#B 지표": "7건" };
  const rows = (names: string[]) => ({ id: "c1", kpi: { rows: names.map((name) => ({ name })) } });
  assert.equal(yearActuals(rows(["A 지표", "B 지표"]), inputs).kpi[1].input, "7건");
  const moved = yearActuals(rows(["새 지표", "B 지표", "A 지표"]), inputs).kpi;
  assert.deepEqual(moved.map((k) => k.input), ["", "7건", ""]);
  assert.deepEqual(yearActuals(rows(["B 지표 (수정)"]), inputs).kpi.map((k) => k.input), [""]);
});
