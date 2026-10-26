// 경평 초안 「자료 요청」(lib/reports/material-requests.ts) 시험 — 자료 필요만 뽑기·쓰일 곳·중복·상한·부서 묶음·복사 글.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Composition, Material, PlanBlock } from "./composition.ts";
import { type RequestCard, REQUEST_CARD_MAX, buildMaterialRequests, needRequestsOf, requestsText } from "./material-requests.ts";
import { buildTodoBoard } from "./todo-board.ts";
import type { SubmitCard } from "./submission.ts";

const mat = (id: string, kind: Material["kind"], text: string, found = true): Material => ({ id, kind, text, when: "", source: "", quote: "", found });
const blk = (materials: string[], o: Partial<PlanBlock> = {}): PlanBlock => ({ kind: "bullets", variant: "", label: "", purpose: "", cells: 2, materials, figures: [], ...o });
function comp(materials: Material[], blocks: PlanBlock[], extra: Partial<Composition> = {}): Composition {
  return { version: 1, message: "", points: [], story: "", storyWhy: "", alternative: "", blocks, results: "", materials, memo: "", ...extra };
}
const card = (uid: string, taskNo: string, outline: unknown, o: Partial<RequestCard> = {}): RequestCard => ({ unitId: "U1", teamId: 1, uid, taskNo, title: `과제 ${taskNo}`, included: true, outline, ...o });

test("needRequestsOf: 자료 필요만 뽑고(원문 못 찾음·일반 재료는 제외), 쓰일 곳은 블록 라벨(없으면 목적), 어느 블록도 안 쓰면 빈 글", () => {
  const c = comp(
    [mat("m1", "need", "올해 이용자 수"), mat("m2", "fact", "사실"), mat("m3", "figure", "수치 못 찾음", false), mat("m4", "need", "수상 증빙")],
    [blk(["m1", "m2"], { label: "성과" }), blk(["m1"], { purpose: "전후 비교를 보여 줌" })],
  );
  assert.deepEqual(needRequestsOf(c), [
    { text: "올해 이용자 수", where: "성과 · 전후 비교를 보여 줌" },
    { text: "수상 증빙", where: "" },
  ]);
});

test("needRequestsOf: 같은 문구(공백·대소문자 차이)는 한 번, 쓰일 곳은 합침. 형식이 다른 구성안은 빈 목록", () => {
  const c = comp([mat("m1", "need", "올해  실적"), mat("m2", "need", "올해 실적")], [blk(["m1"], { label: "가" }), blk(["m2"], { label: "나" })]);
  assert.deepEqual(needRequestsOf(c), [{ text: "올해 실적", where: "가 · 나" }]);
  assert.deepEqual(needRequestsOf(null), []);
  assert.deepEqual(needRequestsOf({ version: 2 }), []);
});

test("needRequestsOf: 경영관리는 블록의 절 열쇠로 쓰일 곳을 절 이름으로", () => {
  const part = { key: "2.1.가", evalNo: 2, evalTitle: "평가", themeNo: 1, themeTitle: "대주제", mark: "가", title: "소통", story: "" as const, why: "" };
  const c = comp([mat("m1", "need", "소통 횟수")], [blk(["m1"], { at: "2.1.가", label: "추진성과" })], { mg: { indicator: "X", parts: [part] } });
  assert.equal(needRequestsOf(c)[0].where, "평가내용 2 · 대주제 1 · 가. 소통");
});

test("buildMaterialRequests: 부서별로 묶고 요청 많은 순, 목차에서 뺀 과제·요청 없는 과제는 빠지며 상한을 넘으면 more", () => {
  const many = comp(Array.from({ length: REQUEST_CARD_MAX + 3 }, (_, i) => mat(`m${i}`, "need", `자료 ${i}`)), []);
  const one = comp([mat("m1", "need", "한 건")], []);
  const cards = [
    card("a", "1-가", one, { teamId: 1 }),
    card("b", "1-나", many, { teamId: 2 }),
    card("c", "1-다", one, { teamId: 2, included: false }),
    card("d", "1-라", comp([mat("m1", "fact", "사실")], []), { teamId: 2 }),
    card("e", "1-마", null, { teamId: 2 }),
  ];
  const depts = buildMaterialRequests(cards, [{ id: 1, name: "가팀" }, { id: 2, name: "나팀" }]);
  assert.deepEqual(depts.map((d) => [d.teamName, d.total, d.cards.length]), [["나팀", REQUEST_CARD_MAX + 3, 1], ["가팀", 1, 1]]);
  assert.equal(depts[0].cards[0].items.length, REQUEST_CARD_MAX);
  assert.equal(depts[0].cards[0].more, 3);
});

test("requestsText: 부서 제목·과제별 줄·쓰일 곳·외 N건", () => {
  const c = comp([mat("m1", "need", "올해 이용자 수"), mat("m2", "need", "수상 증빙")], [blk(["m1"], { label: "성과" })]);
  const [d] = buildMaterialRequests([card("a", "1-가", c)], [{ id: 1, name: "가팀" }], 1);
  assert.equal(requestsText(d, 2026), ["[가팀] 2026년도 경평 초안 자료 요청 — 1개 과제 2건", "", "■ 1-가 과제 1-가", "- 올해 이용자 수 (쓰일 곳: 성과)", "- 외 1건 (과제별 초안 화면에서 확인)"].join("\n"));
});

test("buildTodoBoard: 줄의 requests는 자료 필요 수(구성안만 있는 과제 포함, 목차에서 뺀 과제 제외)이고 할 일 합에는 안 들어감", () => {
  const o = comp([mat("m1", "need", "A"), mat("m2", "need", "B")], []);
  const sub = (id: string, included: boolean): SubmitCard => ({ id, uid: id, taskNo: id, title: id, included, pages: 1, dataRev: 1, draft: { spec: null, sourceRev: null, unknownNumbers: [], outlineOnly: true, outline: o } });
  const b = buildTodoBoard({
    units: [{ id: "U1", name: "첫째", cardGroup: null }],
    teams: [{ id: 1, name: "가팀" }],
    cards: [{ unitId: "U1", teamId: 1, kpi: [], submit: sub("x", true) }, { unitId: "U1", teamId: 1, kpi: [], submit: sub("y", false) }],
    reports: [],
  });
  assert.equal(b.rows[0].requests, 2);
  assert.equal(b.totals.requests, 2);
  assert.equal(b.rows[0].todo, 1); // 구성안만 있는 x = 초안 없음 1
});
