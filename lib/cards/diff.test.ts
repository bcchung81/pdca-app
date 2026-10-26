import assert from "node:assert/strict";
import { test } from "node:test";
import { diffCards, sectionOf } from "./diff.ts";

test("글 칸 변경·추가·삭제를 찾고 파생 값은 무시", () => {
  const before = { title: "과제", do: { monthly: [{ period: "1월~8월", items: ["가"], periodTokens: ["1"] }] }, raw: "<table>", plan: { lines: ["x"] } };
  const after = { title: "과제", do: { monthly: [{ period: "1월~8월", items: ["가", "나"], periodTokens: ["9"] }, { period: "9월", items: ["다"] }] }, raw: "<table2>", plan: { lines: ["y"] } };
  const d = diffCards(before, after);
  assert.deepEqual(
    d.map((c) => [c.path, c.before, c.after]),
    [
      ["do.monthly.0.items.1", "", "나"],
      ["do.monthly.1.period", "", "9월"],
      ["do.monthly.1.items.0", "", "다"],
      ["plan.lines.0", "x", "y"],
    ],
  );
  assert.equal(d[0].section, "[Do] 추진 실적");
});

test("삭제된 칸과 체크 상자", () => {
  const d = diffCards({ act: { findings: ["지적"] }, overview: { cells: ["□ 신규"], checks: { new: false } } }, { act: { findings: [] }, overview: { cells: ["☑ 신규"], checks: { new: true } } });
  assert.deepEqual(
    d.map((c) => [c.path, c.before, c.after]),
    [
      ["overview.cells.0", "□ 신규", "☑ 신규"],
      ["act.findings.0", "지적", ""],
    ],
  );
  assert.equal(sectionOf("zzz.a"), "기타");
});
