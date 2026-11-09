import assert from "node:assert/strict";
import { test } from "node:test";
import { filterMine, linkedChunkKeys } from "./my-scope.ts";

const chunk = (k: string, doc: string, seq: number, type = "rule", business: string | null = null) => ({ chunk_key: k, doc_id: doc, unit_type: type, business, seq });

test("연결 키: rejected 제외·중복 정리", () => {
  const keys = linkedChunkKeys([
    { chunk_key: "a", status: "auto" },
    { chunk_key: "a", status: "confirmed" },
    { chunk_key: "b", status: "rejected" },
    { chunk_key: "c", status: "confirmed" },
  ]);
  assert.deepEqual([...keys].sort(), ["a", "c"]);
});

test("내 조각 거르기: 연결된 것만, 조건은 그 안에서, 문서·순번 순", () => {
  const all = [chunk("x2", "d2", 1), chunk("x1", "d1", 2, "table", "BZ-1"), chunk("x0", "d1", 1), chunk("no", "d1", 3)];
  const keys = new Set(["x0", "x1", "x2"]);
  assert.deepEqual(filterMine(all, keys, {}).map((c) => c.chunk_key), ["x0", "x1", "x2"]);
  assert.deepEqual(filterMine(all, keys, { doc: "d1" }).map((c) => c.chunk_key), ["x0", "x1"]);
  assert.deepEqual(filterMine(all, keys, { type: "table" }).map((c) => c.chunk_key), ["x1"]);
  assert.deepEqual(filterMine(all, keys, { biz: "BZ-1" }).map((c) => c.chunk_key), ["x1"]);
  assert.deepEqual(filterMine(all, new Set(), {}), []);
});
