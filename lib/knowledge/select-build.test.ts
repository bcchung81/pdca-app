import assert from "node:assert/strict";
import { test } from "node:test";
import { judgeLabel, pickSelected, selectRows } from "./select-build.ts";

const scores = [
  { chunkKey: "b", p: 0.5 },
  { chunkKey: "a", p: 0.5 },
  { chunkKey: "c", p: 0.2 },
  { chunkKey: "d", p: 0.19 },
  { chunkKey: "r", p: 0.9 },
];

test("문턱 이상만 p 내림차순으로 고르고 같으면 key 순, rank는 1부터", () => {
  const { selected, rejectedExcluded } = pickSelected(scores, new Set());
  assert.deepEqual(selected.map((s) => [s.chunkKey, s.rank]), [["r", 1], ["a", 2], ["b", 3], ["c", 4]]);
  assert.equal(rejectedExcluded, 0);
});

test("rejected는 점수가 높아도 빼고 건수를 센다", () => {
  const { selected, rejectedExcluded } = pickSelected(scores, new Set(["r", "zzz"]));
  assert.deepEqual(selected.map((s) => s.chunkKey), ["a", "b", "c"]);
  assert.equal(rejectedExcluded, 1);
});

test("행 만들기와 판정기 표지", () => {
  const judge = judgeLabel("jev-1.14.0");
  assert.equal(judge, "jev-1.14.0:strict:p>=0.2");
  const rows = selectRows("주요사업1/1-가", pickSelected(scores, new Set()).selected, judge);
  assert.deepEqual(rows[0], { card_id: "주요사업1/1-가", chunk_key: "r", rank: 1, score: 0.9, judge });
  assert.throws(() => selectRows("x", [{ chunkKey: "a", p: 1, rank: 1 }, { chunkKey: "a", p: 1, rank: 2 }], judge), /두 번/);
});
