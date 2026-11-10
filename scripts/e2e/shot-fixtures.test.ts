// 캡처용 가상 점검표(shot-fixtures.mjs): 경영관리 양식 그대로·보내기 조건 통과·집계는 코드 함수·가상 문장만.
import assert from "node:assert/strict";
import test from "node:test";
import { MGMT_FORM_ID, judgeStatus, readResult, sendProblems, tally } from "../../lib/inspections/model.ts";
import { inspectionRow, sampleInspectionResult } from "./shot-fixtures.mjs";

test("가상 점검표: 경영관리 양식, 보내기 조건 통과, 저장 정리 뒤에도 같음", () => {
  const r = sampleInspectionResult();
  assert.equal(r.form, MGMT_FORM_ID);
  assert.deepEqual(sendProblems(r), []);
  assert.deepEqual(readResult(JSON.parse(JSON.stringify(r))), r);
});

test("가상 점검표: 미흡 3행(나머지 충족), 보완요청, 집중보완 아님, 총평 3칸", () => {
  const r = sampleInspectionResult();
  const t = tally(r);
  assert.equal(t.needs, 3);
  assert.equal(judgeStatus(r), "보완요청");
  assert.equal(t.focus, false);
  for (const k of ["axes", "patterns", "coherence"] as const) assert.equal(t.tables[k].blank + t.tables[k].unknown + t.tables[k].na, 0, k);
  for (const k of ["status", "direction", "case"] as const) assert.ok(r.overview[k], k);
  assert.equal(r.checklist?.rows.length, 2);
});

test("inspections 행: 판정 요약은 코드 집계, 근거 조각·작성본 연결 없음", () => {
  const row = inspectionRow();
  assert.deepEqual(row.result.summary, { verdict: "보완요청", needs: 3 });
  assert.deepEqual([row.model, row.knowledge_keys, row.card_version_id], ["manual", [], null]);
});

test("가상 문장만: 미흡 행의 보완·근거·카드 근거와 체크리스트에 「예시」 표지", () => {
  const r = sampleInspectionResult();
  for (const k of ["axes", "patterns", "coherence"] as const)
    for (const row of r[k].filter((x) => x.judgment === "미흡")) {
      assert.ok(row.evidence.every((e) => e.quote.includes("예시") && e.key === null), `${k} 근거`);
      assert.ok(row.card.includes("예시"), `${k} 카드 근거`);
    }
  assert.ok(r.checklist!.rows.every((x) => x.point.includes("예시")));
});
