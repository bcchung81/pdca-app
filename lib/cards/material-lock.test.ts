import assert from "node:assert/strict";
import { test } from "node:test";
import { draftMaterialIds, lockedMaterialIds } from "./material-lock.ts";

test("초안 근거 자료 id: spec.sources의 card 항목과 구성안 outline.sources.card를 모으고, 다른 종류·모양이 틀린 값은 뺌", () => {
  assert.deepEqual(
    draftMaterialIds({
      sources: [
        { kind: "card", id: "a", name: "a.pdf" },
        { kind: "report", id: "r", name: "r.pdf" },
        { kind: "prior", id: "p", name: "전년" },
        { kind: "card", id: 3 },
        null,
      ],
      outlineCard: ["b", 4, null],
    }),
    ["a", "b"],
  );
  assert.deepEqual(draftMaterialIds({ sources: null, outlineCard: null }), []);
  assert.deepEqual(draftMaterialIds({ sources: { kind: "card", id: "x" }, outlineCard: "y" }), [], "배열이 아니면 근거 없음");
});

test("잠긴 근거: 잠긴 연도의 초안이 쓴 자료만, 잠기지 않은 연도는 빠짐", () => {
  const drafts = [
    { year: 2026, sources: [{ kind: "card", id: "a" }], outlineCard: ["b"] },
    { year: 2025, sources: [{ kind: "card", id: "c" }], outlineCard: null },
  ];
  assert.deepEqual([...lockedMaterialIds(drafts, new Set([2026]))].sort(), ["a", "b"]);
  assert.deepEqual([...lockedMaterialIds(drafts, new Set())], []);
  assert.deepEqual([...lockedMaterialIds(drafts, new Set([2025, 2026]))].sort(), ["a", "b", "c"]);
});
