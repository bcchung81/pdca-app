// 카드 계량지표 빠짐 경고(lib/reports/kpi-cover.ts, 2026-10-27) 시험 — 낱말 고르기(일반어·같은 카드 다른 지표와 함께 쓰는 낱말 제외), 줄여 쓴 이름 허용.

import assert from "node:assert/strict";
import { test } from "node:test";
import { kpiKeyWords, kpiMissingWarning, kpiWords, missingKpis } from "./kpi-cover.ts";
import { warningLevel } from "./warning-levels.ts";
import { type ReportSectionSpec, recheckSection } from "./section.ts";
import { recheckMgSection } from "./mg-draft.ts";

const NAMES = ["ICT기금 분담금 재원 조성 성과", "ICT기금 부채자산 비율 개선 성과"];

test("낱말: 괄호·「(신설)」·일반어(성과·개선·비율 등)·한 글자는 빼고, 같은 카드 다른 지표와 함께 쓰는 낱말도 뺌", () => {
  assert.deepEqual(kpiWords("(신설) 전자파 정보지도 API 연계 실적"), ["전자파", "정보지도", "API", "연계"]);
  assert.deepEqual(kpiKeyWords(NAMES), [["분담금", "재원", "조성"], ["부채자산"]]);
  assert.deepEqual(kpiKeyWords(["ICT기금 성과"]), [["ICT기금"]], "지표가 하나면 그대로");
});

test("빠짐: 부채자산 비율 지표가 초안에 없으면 잡고, 「분담금 조성 성과」처럼 줄여 쓴 것은 다룬 것으로 봄", () => {
  const draft = "ICT기금 수입 예측 정확도 향상, 분담금 조성 성과 ’25년 99.7% → 【확인: ’26년 실적】";
  assert.deepEqual(missingKpis(NAMES, draft), ["ICT기금 부채자산 비율 개선 성과"]);
  const w = kpiMissingWarning(NAMES, draft);
  assert.ok(w?.startsWith("계량지표: 카드 계량지표 「ICT기금 부채자산 비율 개선 성과」"), String(w));
  assert.equal(warningLevel(w!), "info");
  assert.equal(kpiMissingWarning(NAMES, `${draft}\n부채 자산 비율 739% → 【확인】`), null, "빈칸이 달라도 같은 낱말");
  assert.equal(kpiMissingWarning([], draft), null);
});

test("다시 점검: 주요사업에만 붙고 경영관리는 지표가 많아 보지 않음", () => {
  const card = { kpi: { rows: NAMES.map((name) => ({ name, prev: "1%", target: "2%" })) } };
  const base: ReportSectionSpec = { version: 3, card: { id: "c", taskNo: "5-가", title: "t" }, business: { no: 3, name: "b" }, task: { no: "5-1", title: "t", bp: false }, sub: { mark: "가", title: "재정건전성", markers: [] }, rows: [], blocks: [], results: ["분담금 조성 성과 확인"], caption: "", module: 1 };
  assert.ok(recheckSection(base, card, "", 2026, "2026-10-27").warnings.some((w) => w.startsWith("계량지표:") && w.includes("부채자산")));
  assert.ok(!recheckMgSection({ ...base, mg: { indicator: "지표", parts: [], at: [] } }, card, "", 2026, "2026-10-27").warnings.some((w) => w.startsWith("계량지표:")));
});
