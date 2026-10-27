// 지표 단위 부분 화면의 칸 값 도구(lib/reports/unit-parts-form.ts) 시험.
// 지키는 것: 경로 읽기 · 친 그대로 두되 저장된 값과 같으면 고친 칸에서 뺌 · 저장 목록은 공백·빈 줄 차이를 같은 값으로 봄 · 60칸씩 나눔 · 서버 정리(applyUnitPartEdits)와 같은 값으로 견줌.

import assert from "node:assert/strict";
import { test } from "node:test";
import { EDITS_PER_CALL, chunkEdits, editList, getAtPath, linesOverLimit, linesToText, normalizeValue, setEdit, textToLines, valueAt } from "./unit-parts-form.ts";

const spec = {
  part: "findings",
  rows: [{ id: "a#0", ai: { actions: ["조치 하나", "- 하위 줄"] } }, { id: "a#1", ai: { actions: [] } }],
};

test("경로 읽기: 행 번호도 따라가고 없는 경로는 undefined", () => {
  assert.deepEqual(getAtPath(spec, "rows.0.ai.actions"), ["조치 하나", "- 하위 줄"]);
  assert.equal(getAtPath(spec, "rows.9.ai.actions"), undefined);
  assert.equal(getAtPath(spec, "rows.0.ai.actions.0.x"), undefined);
});

test("setEdit: 친 그대로 두고 저장된 값과 글자까지 같아지면 뺌", () => {
  let e = setEdit({}, spec, "rows.1.ai.actions", ["새 조치", ""]);
  assert.deepEqual(valueAt(e, spec, "rows.1.ai.actions"), ["새 조치", ""]);
  assert.deepEqual(valueAt(e, spec, "rows.0.ai.actions"), ["조치 하나", "- 하위 줄"]);
  e = setEdit(e, spec, "rows.1.ai.actions", []);
  assert.deepEqual(e, {});
});

test("editList: 끝 줄바꿈·공백 차이만이면 저장 대상이 아니고 진짜 바뀐 칸만 남음", () => {
  let e = setEdit({}, spec, "rows.0.ai.actions", ["조치   하나", "- 하위 줄", ""]);
  assert.deepEqual(editList(e, spec), []);
  e = setEdit(e, spec, "rows.1.ai.actions", ["  새 조치 ", "", "둘째"]);
  assert.deepEqual(editList(e, spec), [{ path: "rows.1.ai.actions", value: ["  새 조치 ", "", "둘째"] }]);
  assert.deepEqual(normalizeValue(["  새 조치 ", "", "둘째"]), ["새 조치", "둘째"]);
});

test("담당자 표·참거짓·극성도 같은 규칙", () => {
  const cover = { part: "cover", human: { contacts: [{ role: "팀장", name: "홍길동", phone: "", email: "" }] } };
  const e = setEdit({}, cover, "human.contacts", [{ role: "팀장", name: "홍길동", phone: "", email: "" }, { role: "", name: "", phone: "", email: "" }]);
  assert.deepEqual(editList(e, cover), []);
  const e2 = setEdit(e, cover, "human.contacts", [{ role: "팀장", name: "홍길동", phone: "02", email: "" }]);
  assert.equal(editList(e2, cover).length, 1);
  const out = { part: "outcome", kpi: [{ human: { checked: true, polarity: "up" } }] };
  assert.equal(editList(setEdit({}, out, "kpi.0.human.checked", false), out).length, 1);
  assert.equal(editList(setEdit({}, out, "kpi.0.human.polarity", "up"), out).length, 0);
});

test("chunkEdits: 서버 한 번 분량(60칸)씩", () => {
  const list = Array.from({ length: EDITS_PER_CALL * 2 + 1 }, (_, i) => ({ path: `p${i}`, value: i }));
  assert.deepEqual(chunkEdits(list).map((c) => c.length), [EDITS_PER_CALL, EDITS_PER_CALL, 1]);
  assert.deepEqual(chunkEdits([]), []);
});

test("줄 ↔ 입력 글은 끝 줄바꿈까지 왕복", () => {
  assert.equal(linesToText(["a", "b"]), "a\nb");
  assert.deepEqual(textToLines("a\nb\n"), ["a", "b", ""]);
  assert.equal(linesToText(textToLines("a\nb\n")), "a\nb\n");
  assert.equal(linesToText(undefined), "");
});

test("linesOverLimit: 한 줄 600자·40줄을 넘으면 안내 글(서버가 말없이 자르는 한도), 빈 줄·공백은 서버처럼 정리해 셈", () => {
  assert.equal(linesOverLimit(["짧은 글", "", "  "]), null);
  assert.match(linesOverLimit(["가".repeat(601)]) ?? "", /1번째 줄이 601자/);
  assert.equal(linesOverLimit(["가".repeat(600)]), null);
  assert.match(linesOverLimit(Array.from({ length: 41 }, (_, i) => `줄 ${i}`)) ?? "", /41줄/);
  assert.equal(linesOverLimit("글"), null);
});
