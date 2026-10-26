import assert from "node:assert/strict";
import { test } from "node:test";
import { cardFindings, isNoFindingLine, realFindingLines } from "./findings.ts";

test("「지적 없음」 변형은 지적이 아님", () => {
  for (const s of ["∙ 해당없음", "해당 없음", "∙ 해당사항 없음", "∙ 경영평가 지적사항 없음", "지적사항 없음", "없음", "없음.", "N/A", "n/a", "• 해당없음."]) {
    assert.ok(isNoFindingLine(s), s);
  }
});

test("없음이 다른 말과 함께 든 실제 지적은 남음", () => {
  for (const s of ["∙ 산식 근거 없음 — 재산정 필요", "→ 자격취득자 취업 연계 지원을 위한 추가 노력 필요", "해당 지표 근거 없음"]) {
    assert.ok(!isNoFindingLine(s), s);
  }
});

test("글줄만·앞 기호 걷기·빈 줄/기호 줄 빼기", () => {
  assert.deepEqual(realFindingLines(["∙ 실적 미흡", "-", "  ", "※", { table: 1 }, "∙ 해당없음", "→ 추가 노력 필요", 3]), ["실적 미흡", "추가 노력 필요"]);
  assert.deepEqual(realFindingLines(undefined), []);
});

test("cardFindings: 주요사업 act.findings에서 실제 지적만", () => {
  assert.deepEqual(cardFindings({ act: { findings: ["∙ 경영평가 지적사항 없음"] } }), []);
  assert.deepEqual(cardFindings({ act: { findings: ["∙ API 연계 실적 미흡"] } }), ["API 연계 실적 미흡"]);
  assert.deepEqual(cardFindings(null), []);
});
