// 실적 칸의 계획 표지 점검(lib/reports/result-plan.ts, 2026-10-17 서술 품질 F1) 시험.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { futureTime, planInResult, planMarker, refMonthOf, resultLines, resultLinesOfBlock, resultPlanWarning } from "./result-plan.ts";
import { recheckSection, type ReportSectionSpec } from "./section.ts";
import { recheckMgSection } from "./mg-draft.ts";
import { warningLevel } from "./warning-levels.ts";

const REF = refMonthOf("2026-10-17");
const blk = (b: Partial<Block>): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...b });
const spec = (over: Partial<ReportSectionSpec> = {}): ReportSectionSpec => ({
  version: 3,
  card: { id: "경영관리11/11-3", taskNo: "11-3", title: "t" },
  business: { no: 0, name: "지표" },
  task: { no: "11-3", title: "t", bp: false },
  sub: { mark: "", title: "t", markers: [] },
  rows: [],
  results: [],
  caption: "",
  module: 1,
  ...over,
});

test("기준 시점: YYYY-MM-DD만 읽고 다른 글은 null", () => {
  assert.deepEqual(refMonthOf("2026-10-17"), { year: 2026, month: 10 });
  assert.equal(refMonthOf(""), null);
  assert.equal(refMonthOf(undefined), null);
});

test("계획 낱말: 예정·할 계획·N월 계획·할 것·향후는 잡고, 실적을 말하는 어구와 자리표시는 안 잡음", () => {
  for (const [line, hit] of [
    ["’26.11월 시범 예정", "예정"],
    ["분야별 결과를 환류할 예정", "예정"],
    ["전 직원 교육을 확대할 계획", "할 계획"],
    ["절차 개정(9월 계획) 완료 여부", "9월 계획"],
    ["’26.9~12월 계획", "12월 계획"],
    ["성과를 확산할 것", "할 것"],
    ["향후 전 본부로 확대", "향후"],
  ] as const) assert.equal(planMarker(line), hit, line);
  for (const line of [
    "목표 대비 112% 달성",
    "계획 대비 달성률 98%",
    "계획대로 3월 완료",
    "예정보다 2주 앞당겨 완료",
    "예정대로 6월 개정 완료",
    "연간 계획 수립 완료",
    "중장기 인력운영계획서 반영",
    "【확인: ’26년 11월 예정 건수】",
    "교육 85회 운영, 만족도 4.6점",
    "월 계획 수립 건수 12건",
  ]) assert.equal(planMarker(line), null, line);
  assert.equal(planMarker("협력사 만족도 【확인: 12월 간담회 예정 결과】 점수 4.6점"), null, "자리표시 안 낱말은 걷고 봄");
});

test("미래 시점: 기준 월보다 뒤인 ’26.N월·’26.N.·2026년 N월만, 기준 월 이전·범위·기준일 표기·연도만은 안 잡음", () => {
  assert.equal(futureTime("’26.11월 시범 운영", REF), "’26.11월");
  assert.equal(futureTime("’26.12. 완료", REF), "’26.12.");
  assert.equal(futureTime("2026년 12월 시행", REF), "2026년 12월");
  assert.equal(futureTime("’27.1월 시행", REF), "’27.1월");
  assert.equal(futureTime("’26.10월 시행", REF), null, "같은 달은 아직 안 온 것이 아님");
  assert.equal(futureTime("’26.8월 시행 완료", REF), null);
  assert.equal(futureTime("’26.1~12월 연중", REF), null, "범위의 뒤 달은 안 봄");
  assert.equal(futureTime("’26.12월 기준 추정", REF), null, "기준일 표기");
  assert.equal(futureTime("’27년 목표", REF), null, "연도만은 안 봄");
  assert.equal(futureTime("’26.11월 시범 운영", null), null, "기준 시점이 없으면 시점은 안 봄");
  assert.equal(planMarker("’26.11월 시범 운영", REF), "’26.11월");
  assert.equal(planMarker("’26.11월 시범 운영", null), null);
});

test("실적 칸 줄: 추진성과 상자(results·resultCards·resultBand·resultChart)와 라벨 추진성과·추진실적·성과 블록, 추진실적 열, 구분표의 「추진실적」 열만 — 추진내용 블록은 아님", () => {
  const s = spec({
    results: ["교육 85회 운영"],
    resultCards: [{ tag: "효과", headline: "처리 7분 → 1분", figure: "86%" }],
    resultBand: "7분 → 1분!",
    resultChart: { title: "월별", series: [{ label: "’25년", value: "3건" }], badge: "" },
    blocks: [
      blk({ kind: "bullets", label: "추진내용", items: ["시범 운영할 예정"] }),
      blk({ kind: "stats", label: "추진성과", cells: [{ head: "85회", tag: "", bullets: ["교육 운영"], note: "" }] }),
      blk({ kind: "table", variant: "result", label: "", cells: [{ head: "구분", tag: "", bullets: ["내용(11월 예정)"], note: "" }], series: [{ label: "참여", value: "97%" }], text: "결과 한 줄" }),
      blk({ kind: "table", label: "추진내용", items: ["구분", "주요활동", "추진실적"], cells: [{ head: "A", tag: "", bullets: ["활동 가", "완료"], note: "" }, { head: "B", tag: "", bullets: ["활동 나", "12월 예정"], note: "" }] }),
    ],
  });
  const lines = resultLines(s);
  assert.ok(lines.includes("교육 85회 운영") && lines.includes("처리 7분 → 1분") && lines.includes("7분 → 1분!") && lines.includes("’25년 3건"));
  assert.ok(lines.includes("교육 운영") && lines.includes("참여 97%") && lines.includes("결과 한 줄") && lines.includes("완료") && lines.includes("12월 예정"));
  assert.ok(!lines.includes("시범 운영할 예정"), "추진내용 블록은 실적 칸이 아님");
  assert.ok(!lines.includes("내용(11월 예정)"), "추진실적 열 표의 왼쪽 추진내용 칸은 실적 칸이 아님");
  assert.ok(!lines.includes("활동 가") && !lines.includes("활동 나"), "구분표의 주요활동 열은 실적 칸이 아님");
  assert.deepEqual(planInResult(s, "2026-10-17"), [["12월 예정", "예정"]]);
  assert.deepEqual(resultLinesOfBlock(blk({ kind: "table", variant: "ladder", label: "추진내용", cells: [] })), []);
});

test("경고 한 줄: 막힘 등급, 줄 3개 발췌 + 외 N줄, 없으면 null", () => {
  assert.equal(resultPlanWarning(spec({ results: ["교육 85회 운영"] }), "2026-10-17"), null);
  const w = resultPlanWarning(spec({ results: ["’26.11월 시범 예정", "분야별 결과를 환류할 예정", "교육을 확대할 계획", "향후 전 본부 확대", "정상 문장"] }), "2026-10-17")!;
  assert.match(w, /^실적 칸: 「’26\.11월 시범 예정」 \/ 「분야별 결과를 환류할 예정」 \/ 「교육을 확대할 계획」 외 1줄 — 계획\(「예정」·「할 계획」·「향후」\)이 실적 칸에 있음 — 올해 한 일·결과로 바꾸거나 계획은 추진내용으로$/);
  assert.equal(warningLevel(w), "block");
  const long = resultPlanWarning(spec({ results: [`${"가나다라마바사 ".repeat(8)}준비를 마치고 확대할 예정입니다`] }), "2026-10-17")!;
  assert.match(long, /「….*예정입니다」/);
});

test("다시 점검: 주요사업·경영관리 둘 다 같은 경고를 냄(블록 고치기·직접 고치기 뒤)", () => {
  const biz = spec({ version: 3, results: ["시범 운영 예정"] });
  assert.ok(recheckSection(biz, {}, "", 2026, "2026-10-17").warnings.some((x) => x.startsWith("실적 칸:")));
  assert.ok(!recheckSection(spec({ results: ["시범 운영 완료"] }), {}, "", 2026, "2026-10-17").warnings.some((x) => x.startsWith("실적 칸:")));
  const mg = spec({
    blocks: [blk({ kind: "stats", label: "추진성과", cells: [{ head: "85회", tag: "", bullets: ["’26.11월 시범"], note: "" }] })],
    mg: { indicator: "지표", parts: [], at: ["3.1.가"] },
  });
  assert.ok(recheckMgSection(mg, {}, "", 2026, "2026-10-17").warnings.some((x) => x.startsWith("실적 칸:") && x.includes("’26.11월")));
  assert.ok(!recheckMgSection(mg, {}, "", 2026, "2026-11-30").warnings.some((x) => x.startsWith("실적 칸:")), "기준 시점이 11월 말이면 ’26.11월은 안 온 시점이 아님");
});
