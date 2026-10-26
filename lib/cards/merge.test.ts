import assert from "node:assert/strict";
import { test } from "node:test";
import { conflictLabels, mergeDraft } from "./merge.ts";

const base = { title: "과제", plan: { lines: ["계획"] }, do: { lines: ["실적"] }, kpi: { rows: [1] } };

test("부서가 바꾼 구역만 반영하고 원장의 다른 변경은 지킴", () => {
  const ledger = { ...base, kpi: { rows: [1, 2] } }; // 성과관리팀이 KPI를 고침
  const draft = { ...base, do: { lines: ["실적", "9월 실적"] } }; // 부서는 Do만
  const r = mergeDraft(ledger, base, draft);
  assert.deepEqual(r.changed, ["do"]);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.merged.kpi, { rows: [1, 2] }, "원장 KPI 변경 유지");
  assert.deepEqual(r.merged.do.lines, ["실적", "9월 실적"]);
});

test("같은 구역을 양쪽이 바꾸면 충돌(작성본 쪽 반영)", () => {
  const ledger = { ...base, do: { lines: ["실적(성과관리팀 고침)"] } };
  const draft = { ...base, do: { lines: ["실적", "9월"] } };
  const r = mergeDraft(ledger, base, draft);
  assert.deepEqual(r.conflicts, ["do"]);
  assert.deepEqual(r.merged.do.lines, ["실적", "9월"]);
  assert.deepEqual(conflictLabels(r.conflicts), ["[Do] 추진 실적"]);
});

test("양쪽이 같은 값으로 바꾸면 충돌 아님, base 없으면 다른 구역 모두 반영, 키 순서 무시", () => {
  const ledger = { ...base, do: { lines: ["같음"] } };
  const draft = { ...base, do: { lines: ["같음"] } };
  assert.deepEqual(mergeDraft(ledger, base, draft).conflicts, []);
  const r = mergeDraft({ ...base, kpi: { rows: [9] } }, null, { ...base });
  assert.deepEqual(r.changed, ["kpi"], "base 없음 → 원장과 다른 구역을 작성본 값으로");
  assert.deepEqual(mergeDraft({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } }, { a: { x: 1, y: 2 } }).changed, []);
});
