// 경평 초안 「채울 것」 모음(lib/reports/todo-board.ts) 시험 — 평가단위 × 부서 줄의 셈·정렬·견본·카드 밖 부분.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReportSectionSpec } from "./section.ts";
import type { SubmitCard } from "./submission.ts";
import { type TodoCard, type TodoInput, SAMPLE_CHARS, buildTodoBoard, stringsOf } from "./todo-board.ts";

function spec(results: string[] = []): ReportSectionSpec {
  return { version: 3, card: { id: "c", taskNo: "1-가", title: "제목" }, business: { no: 1, name: "대상사업" }, task: { no: "1-1", title: "실행과제", bp: false }, sub: { mark: "가", title: "소항목", markers: [] }, rows: [], results, caption: "", blocks: [], module: 1 };
}

function sub(id: string, taskNo: string, o: Partial<SubmitCard> = {}): SubmitCard {
  return { id, uid: `u-${id}`, taskNo, title: `과제 ${taskNo}`, included: true, pages: 1, dataRev: 1, draft: null, ...o };
}

const drafted = (results: string[], unknownNumbers: string[] = []): SubmitCard["draft"] => ({ spec: spec(results), sourceRev: 1, unknownNumbers });
const kpi2 = [{ name: "지표A", unit: "건", target: "10", prev: "5" }, { name: "지표B", unit: "%", target: "1", prev: "2" }, { name: "-", unit: "", target: "", prev: "" }];

const units = [
  { id: "U1", name: "첫째", cardGroup: "주요사업1" },
  { id: "U2", name: "둘째", cardGroup: null },
];
const teams = [{ id: 1, name: "가팀" }, { id: 2, name: "나팀" }];

function input(cards: TodoCard[], extra: Partial<TodoInput> = {}): TodoInput {
  return { units, teams, cards, reports: [], ...extra };
}

test("buildTodoBoard: 계량 행(빈 자리표시 제외)·입력 유무·【확인】 견본·근거에 없는 숫자·초안 없음을 줄마다 셈", () => {
  const long = "가".repeat(60);
  const cards: TodoCard[] = [
    { unitId: "U1", teamId: 1, kpi: kpi2, submit: sub("a", "1-가", { draft: drafted([`달성 【확인: ${long}】 입니다`, "【확인: 누적 건수】 건"], ["99%"]) }) },
    { unitId: "U1", teamId: 1, kpi: [], submit: sub("b", "1-나") }, // 초안 없음
  ];
  const b = buildTodoBoard(input(cards, { reports: [{ id: 7, unitId: "U1", teamId: 1, inputs: { kpi: { "a#0": " 12 ", "a#1": "  " } } }] }));
  assert.equal(b.rows.length, 1);
  const r = b.rows[0];
  assert.equal(r.reportId, 7);
  assert.equal(r.cards, 2);
  assert.equal(r.kpiTotal, 2); // "-" 행은 지표가 아님
  assert.equal(r.kpiMissing, 1); // a#0 입력, a#1 공백
  assert.equal(r.needs, 2);
  assert.equal(r.noDraft, 1);
  assert.equal(r.unknown, 1);
  assert.equal(r.todo, 1 + 2 + 1 + 1);
  assert.equal(r.samples.length, 2);
  assert.equal(r.samples[0], `1-가 ${long.slice(0, SAMPLE_CHARS)}`);
  assert.deepEqual(b.totals, { requests: 0, needs: 2, kpiMissing: 1, noDraft: 1, unknown: 1, todo: 5 });
});

test("buildTodoBoard: 보고서 행이 없으면 계량 실적을 모두 미입력으로 셈, 목차에서 뺀 과제는 초안·자리표시를 안 따짐", () => {
  const cards: TodoCard[] = [
    { unitId: "U1", teamId: 1, kpi: kpi2, submit: sub("a", "1-가", { included: false, draft: drafted(["【확인: 값】"]) }) },
    { unitId: "U1", teamId: 1, kpi: [], submit: sub("b", "1-나", { included: false }) },
  ];
  const r = buildTodoBoard(input(cards)).rows[0];
  assert.equal(r.reportId, null);
  assert.equal(r.kpiMissing, 2);
  assert.equal(r.needs, 0);
  assert.equal(r.noDraft, 0);
});

test("buildTodoBoard: 견본은 줄바꿈을 한 칸으로 접음", () => {
  const cs: TodoCard[] = [{ unitId: "U1", teamId: 1, kpi: [], submit: sub("a", "1-가", { draft: drafted(["【확인: 가\n  나】"]) }) }];
  assert.deepEqual(buildTodoBoard(input(cs)).rows[0].samples, ["1-가 가 나"]);
});

test("buildTodoBoard: 견본은 3개까지, 같은 과제 안 같은 이름은 한 번", () => {
  const cs: TodoCard[] = ["a", "b"].map((id) => ({ unitId: "U1", teamId: 1, kpi: [], submit: sub(id, `1-${id}`, { draft: drafted(["【확인: x】 【확인: x】 【확인: y】"]) }) }));
  const r = buildTodoBoard(input(cs)).rows[0];
  assert.equal(r.needs, 4);
  assert.equal(r.samples.length, 3);
});

test("buildTodoBoard: 할 일 많은 순 → 같으면 단위 순서 → 부서 이름 순, 알 수 없는 단위의 카드는 빼고 구성안뿐인 카드는 초안 없음", () => {
  const cards: TodoCard[] = [
    { unitId: "U2", teamId: 2, kpi: [], submit: sub("c", "2-가", { draft: drafted(["【확인: a】"]) }) },
    { unitId: "U1", teamId: 2, kpi: [], submit: sub("d", "1-가", { draft: { spec: null, sourceRev: null, unknownNumbers: [], outlineOnly: true } }) },
    { unitId: "U1", teamId: 1, kpi: kpi2, submit: sub("e", "1-나", { draft: drafted([]) }) },
    { unitId: "ZZ", teamId: 1, kpi: kpi2, submit: sub("f", "9-가") },
  ];
  const b = buildTodoBoard(input(cards));
  assert.deepEqual(b.rows.map((r) => [r.unitId, r.teamId, r.todo]), [["U1", 1, 2], ["U1", 2, 1], ["U2", 2, 1]]);
});

test("buildTodoBoard: 카드 밖 부분은 자리표시가 있는 지표에만 부서 없는 줄로 생기고 부분 이름이 견본 앞에 붙음", () => {
  const parts = [
    { unitId: "U2", part: "cover", spec: { code: { w: "【확인: 가중치】" } } },
    { unitId: "U2", part: "outcome", spec: { kpi: [{ ai: { analysis: ["【확인: 분석 근거】", "【확인: 분석 근거】"] } }] } },
    { unitId: "U1", part: "prior", spec: { rows: [{ ai: { now: ["자리표시 없음"] } }] } },
  ];
  const b = buildTodoBoard(input([], { parts }));
  assert.equal(b.rows.length, 1);
  const r = b.rows[0];
  assert.equal(r.unitId, "U2");
  assert.equal(r.teamId, null);
  assert.equal(r.needs, 2); // 부분 안 같은 이름은 한 번
  assert.deepEqual(r.samples, ["표지 가중치", "성과분석·환류 분석 근거"]);
  assert.equal(r.todo, 2);
});

test("buildTodoBoard: 카드가 없으면 빈 모음", () => {
  assert.deepEqual(buildTodoBoard(input([])), { rows: [], totals: { requests: 0, needs: 0, kpiMissing: 0, noDraft: 0, unknown: 0, todo: 0 } });
});

test("stringsOf: 중첩 객체·배열의 글만 모음", () => {
  assert.deepEqual(stringsOf({ a: ["x", 1, { b: "y" }], c: null, d: "z" }), ["x", "y", "z"]);
});
