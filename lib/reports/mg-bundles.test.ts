// 경영관리 「수치 묶음 재료」 판정(lib/reports/mg-bundles.ts) 시험 — 가짜 카드·가짜 재료만 씀(2026-10-29 스타일 규칙 S2).

import assert from "node:assert/strict";
import { test } from "node:test";
import { type KnowledgeBundle, relevantRefs } from "../knowledge/bundle.ts";
import { BUNDLE_MIN, cardBundles, figureBundle, headUnit, linkedBundles, materialBundle } from "./mg-bundles.ts";

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

// 연결 조각 표(2026-10-29 S2 보강) — 지어낸 표만 씀
const SCORE_TABLE = [
  "<table><tr><th rowspan=\"2\">순위</th><th rowspan=\"2\">항목명</th><th colspan=\"2\">평가 항목</th><th rowspan=\"2\">총점</th></tr>",
  "<tr><td>가 기준</td><td>나 기준</td></tr>",
  "<tr><td>1</td><td>가 항목</td><td>40</td><td>45</td><td>85</td></tr>",
  "<tr><td>2</td><td>나 항목</td><td>38</td><td>40</td><td>78</td></tr>",
  "<tr><td>3</td><td>다 항목</td><td>35</td><td>36</td><td>71</td></tr></table>",
].join("");
const ref = (key: string, text: string) => ({ key, title: `'25 실사 질문 · 9-(1) Q9 · 가짜 질문 글 ${key}`, text });

test("표 머리 단위: 괄호 단위(「(건)」「(단위: 백만원)」) 먼저, 없으면 단위를 뜻하는 머리 낱말(총점·배점·점수·건수·인원·횟수)만 — 끝 글자가 단위와 같은 머리(구분·기관명)는 아님", () => {
  for (const [head, unit] of [["총점", "점"], ["배점", "점"], ["평가 점수", "점"], ["실적(건)", "건"], ["예산 (단위: 백만원)", "백만원"], ["처리 건수", "건"], ["참여 인원", "명"], ["개최 횟수", "회"], ["교육 인원(명)", "명"]]) assert.equal(headUnit(head), unit, head);
  for (const head of ["구분", "기관명", "순위", "’25년", "탐색기(2)", "평가 항목"]) assert.equal(headUnit(head), "", head);
});

test("연결 조각 묶음: 표를 행 단위로 읽어 맨 숫자 값 칸에 열 머리 단위를 붙이고(두 줄 머리·병합 칸 자리 맞춤) 같은 단위 값 3개 이상이면 그 행만 줄로 — 단위 없는 열은 셈하지 않음", () => {
  const got = linkedBundles([ref("qa25-mg-99/q09", `답변 글\n${SCORE_TABLE}\n끝`)]);
  assert.equal(got.length, 1);
  assert.equal(got[0].from, "linked");
  assert.equal(got[0].unit, "점");
  assert.deepEqual(got[0].values, ["85점", "78점", "71점"], "총점 열만 — 가 기준·나 기준 열은 머리에 단위가 없어 맨 숫자로 둠");
  assert.deepEqual(got[0].lines, ["1 | 가 항목 | 40 | 45 | 85점", "2 | 나 항목 | 38 | 40 | 78점", "3 | 다 항목 | 35 | 36 | 71점"]);
  assert.deepEqual(got[0].ref, { key: "qa25-mg-99/q09", name: "'25 실사 질문 · 9-(1) Q9", head: "순위 | 항목명 | 평가 항목 | 총점 / 가 기준 | 나 기준" });
});

test("연결 조각 묶음: 행 머리(첫 칸) 단위·마크다운 파이프 표, 글 속 숫자 칸(설문 보기)은 값 칸이 아님, 같은 표를 되풀이한 조각은 한 번만", () => {
  const pipe = ["| 구분 | ’24 | ’25 | ’26 목표 |", "| --- | --- | --- | --- |", "| 교육 인원(명) | 120 | 135 | 150 |", "| 협약 | 12건 | 15건 | - |"].join("\n");
  const got = linkedBundles([ref("a", pipe)]);
  assert.deepEqual(got.map((b) => [b.unit, b.values, b.lines]), [["명", ["120명", "135명", "150명"], ["교육 인원(명) | 120명 | 135명 | 150명"]]], "건 값 둘은 묶음 아님");
  const survey = "<table><tr><th>질문</th><th>답변</th></tr><tr><td>1. 연령대</td><td>① 10대 이하<br>② 20대<br>③ 30대<br>④ 40대</td></tr></table>";
  assert.deepEqual(linkedBundles([ref("b", survey)]), [], "보기 글 속 숫자");
  assert.equal(linkedBundles([ref("c", SCORE_TABLE), ref("d", SCORE_TABLE)]).length, 1, "같은 단위·값의 묶음은 처음 조각 것만");
  assert.deepEqual(linkedBundles([ref("e", "표 없는 답변 글 85점, 78점, 71점")]), [], "표 밖 글은 재료 묶음(materialBundle)이 맡음");
});

test("연결 조각 묶음은 이 카드에 연결된 조각(relevantRefs)만 — 같은 지표의 연결 안 된 조각 표는 보지 않음", () => {
  const linked = { ...ref("qa25-mg-99/q09", SCORE_TABLE), unitType: "qa_pair" };
  const other = { ...ref("qa25-mg-99/q10", SCORE_TABLE.replace(/>85</, ">95<")), unitType: "qa_pair" };
  const kb = { unit: "MG-99", layers: [{ id: "business", refs: [linked, other] }], list: { relevant: [linked.key], taskRow: null, peers: [], prior: [], similar: [] } } as unknown as KnowledgeBundle;
  assert.deepEqual(linkedBundles(relevantRefs(kb)).map((b) => b.ref?.key), [linked.key]);
});
