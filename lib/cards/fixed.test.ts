import assert from "node:assert/strict";
import { test } from "node:test";
import { fixedChanged, fixedLabelOf, fixedLabelOfTrack, fixedSectionsOf, inFixed } from "./fixed.ts";

test("고정 영역 변경 판정", () => {
  const a = { act: { findings: ["가"] }, plan: { lines: ["x"] }, kpi: { rows: [] }, do: { lines: ["1"] } };
  assert.equal(fixedChanged(a, { ...a, do: { lines: ["2"] } }), false);
  assert.equal(fixedChanged(a, { ...a, plan: { lines: ["y"] } }), true);
  assert.ok(inFixed("kpi.rows.0.target"));
  assert.ok(inFixed("act"));
  assert.ok(!inFixed("actual.x"));
  assert.ok(!inFixed(null));
});

test("키 순서만 다르면 바뀐 것이 아님(jsonb 저장 순서)", () => {
  const a = { kpi: { categories: { pool: true, ceoContract: false }, rows: [{ b: 1, a: 2 }] }, act: {}, plan: {} };
  const b = { kpi: { categories: { ceoContract: false, pool: true }, rows: [{ a: 2, b: 1 }] }, act: {}, plan: {} };
  assert.equal(fixedChanged(a, b), false);
  assert.equal(fixedChanged(a, { ...b, kpi: { ...b.kpi, rows: [{ a: 3, b: 1 }] } }), true);
});

test("카드 종류별 고정 영역: 주요사업 Act·Plan·계량지표, 경영관리(묶음 경영관리N) 전년도 환류·지적 및 개선방안·계량지표(지침 08)", () => {
  assert.deepEqual(fixedSectionsOf({ group: "주요사업1" }), ["act", "plan", "kpi"]);
  assert.deepEqual(fixedSectionsOf({ group: "경영관리3" }), ["feedback", "findings", "kpi"]);
  assert.deepEqual(fixedSectionsOf(null), ["act", "plan", "kpi"], "모르면 주요사업(DB 트리거와 같은 기준)");
  assert.equal(fixedLabelOf({ group: "경영관리3" }), "전년도 환류·지적 및 개선방안·계량지표");
  assert.equal(fixedLabelOfTrack("주요사업"), "Act·Plan·계량지표");
  assert.equal(fixedLabelOfTrack("경영관리"), fixedLabelOf({ group: "경영관리1" }));
});
