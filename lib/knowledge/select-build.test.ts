import assert from "node:assert/strict";
import { test } from "node:test";
import { ALWAYS_KEEP, SELECT_THRESHOLD, judgeLabel, keptBy, pickSelected, selectRows, withAlwaysKept } from "./select-build.ts";

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

test("늘 남길 조각은 앞에(받은 순서), Jev 고른 것은 뒤에 — rank 다시 매김, rejected는 kept에서도 뺌", () => {
  const picked = pickSelected(scores, new Set());
  const { selected, rejectedExcluded } = withAlwaysKept(["k2", "k1", "kx"], picked.selected, new Set(["kx"]));
  assert.deepEqual(selected.map((s) => [s.chunkKey, s.p, s.rank]), [["k2", null, 1], ["k1", null, 2], ["r", 0.9, 3], ["a", 0.5, 4], ["b", 0.5, 5], ["c", 0.2, 6]]);
  assert.equal(rejectedExcluded, 1);
  assert.equal(selectRows("x", selected, "j")[0].score, null);
});

test("늘 남길 조각이 없으면(주요사업) Jev 고른 결과·판정기 표지가 예전과 같음", () => {
  const picked = pickSelected(scores, new Set(["a"]));
  assert.deepEqual(withAlwaysKept([], picked.selected, new Set(["a"])).selected, picked.selected);
  assert.deepEqual(ALWAYS_KEEP.주요사업, []);
  assert.equal(judgeLabel("jev-1.14.0", "strict", SELECT_THRESHOLD, ALWAYS_KEEP.주요사업), "jev-1.14.0:strict:p>=0.2");
});

test("경영관리는 ③ 이 지표 층의 전년 보고서만 늘 남김", () => {
  const mg = ALWAYS_KEEP.경영관리;
  assert.equal(keptBy(mg, "business", "prior"), true);
  assert.equal(keptBy(mg, "business", "survey"), false);
  assert.equal(keptBy(mg, "business", "critique"), false);
  assert.equal(keptBy(mg, "common", "prior"), false);
  assert.equal(keptBy(mg, null, "prior"), false);
  assert.equal(judgeLabel("jev-1.14.0", "strict", SELECT_THRESHOLD, mg), "jev-1.14.0:strict:p>=0.2+keep:business/prior");
});
