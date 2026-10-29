// 경영관리 「수치 묶음 재료」 판정(lib/reports/mg-bundles.ts) 시험 — 가짜 카드·가짜 재료만 씀(2026-10-29 스타일 규칙 S2).

import assert from "node:assert/strict";
import { test } from "node:test";
import { BUNDLE_MIN, cardBundles, figureBundle, materialBundle } from "./mg-bundles.ts";

const kpiRow = (name: string, unit: string, prev: string, target: string, expected = "") => ({ name, unit, weight: "", prev, target, expected });
const card = (rows: unknown[], monthly: unknown[] = []) => ({ id: "경영관리9/9-3", taskNo: "9-3", kpi: { rows }, do: { lines: [], monthly } });

test("묶음 판정: 같은 단위의 서로 다른 값 3개 이상만 — 값 둘·단위가 다른 값 셋은 묶음 아님", () => {
  assert.equal(BUNDLE_MIN, 3);
  assert.deepEqual(figureBundle(["가 과정 40명, 나 과정 52명, 다 과정 61명"]), { unit: "명", values: ["40명", "52명", "61명"] });
  assert.equal(figureBundle(["가 과정 40명 → 나 과정 52명"]), null, "값 둘(전후 한 쌍)");
  assert.equal(figureBundle(["교육 40명, 협약 12건, 만족도 87점"]), null, "단위가 모두 다름");
  assert.equal(figureBundle(["40명 · 40명 · 52명"]), null, "같은 값은 한 번만 셈");
  assert.equal(figureBundle(["3명, 5명, 7명"]), null, "흔한 값(한 자리 개수)은 반복 수치 점검과 같게 셈하지 않음");
  assert.deepEqual(figureBundle(["협약 12건·21건", "만족 81점·88점·85점"])?.unit, "점", "값이 가장 많은 단위");
});

test("카드 묶음 ① 계량지표: 행마다 ’25 실적·’26 목표·예상 값(맨 숫자는 지표 단위를 붙임), 같은 단위 값 3개 이상이면 그 단위 행만 줄로", () => {
  const three = cardBundles(card([kpiRow("가 지표", "점", "71.4", "85"), kpiRow("나 지표", "점", "85.3", "92"), kpiRow("다 지표", "건", "46", "58")]));
  assert.equal(three.length, 1);
  assert.equal(three[0].from, "kpi");
  assert.equal(three[0].unit, "점");
  assert.deepEqual(three[0].values, ["71.4점", "85점", "85.3점", "92점"]);
  assert.deepEqual(three[0].lines, ["가 지표: 71.4점 · 85점", "나 지표: 85.3점 · 92점"], "건 행은 그 단위 값이 없어 줄에서 뺌");
  assert.equal(cardBundles(card([kpiRow("가 지표", "%", "85", "90", "92")]))[0].values.length, 3, "한 행의 실적·목표·예상 셋도 묶음");
  assert.deepEqual(cardBundles(card([kpiRow("가 지표", "점", "71.4", "85"), kpiRow("나 지표", "건", "46", "58")])), [], "단위가 다른 행 둘(같은 단위 값 2개씩)은 묶음 아님");
});

test("카드 묶음 ② 월별 실적: 수치 줄(표 칸 포함 — yearActuals wide) 전체에서 같은 단위 값 3개 이상", () => {
  const table = { table: { rows: [[{ th: true, lines: ["구분"] }, { th: true, lines: ["’26.3월"] }, { th: true, lines: ["’26.6월"] }], [{ lines: ["교육"] }, { lines: ["수료 40명"] }, { lines: ["수료 52명"] }]] } };
  const got = cardBundles(card([], [{ period: "’26.3월", items: ["∙ 직무교육 61명 수료"] }, { period: "’26.6월", items: [table] }]));
  assert.equal(got.length, 1);
  assert.equal(got[0].from, "monthly");
  assert.deepEqual(got[0].values, ["61명", "40명", "52명"]);
  assert.equal(got[0].lines.length, 3);
  assert.deepEqual(cardBundles(card([], [{ period: "’26.3월", items: ["∙ 직무교육 61명 수료", "∙ 협약 12건 체결"] }])), [], "값 둘·단위 다름");
});

test("재료 묶음: 글 + 원문 구절(표 행을 옮긴 재료)에 같은 단위 값 3개 이상, 자료 필요 재료는 아님", () => {
  const row = { kind: "figure", text: "만족도 평가 총점: 가 항목 85점, 나 항목 88점, 다 항목 82점", quote: "1 | 가 항목 | 32 | 34 | 85" };
  assert.deepEqual(materialBundle(row)?.values, ["85점", "88점", "82점"]);
  assert.equal(materialBundle({ ...row, kind: "need" }), null);
  assert.equal(materialBundle({ kind: "figure", text: "개방 46건 → 58건", quote: "46건 | 58건" }), null, "값 둘");
});
