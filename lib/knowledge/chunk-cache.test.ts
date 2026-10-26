// 공통 지식 조각 캐시(lib/knowledge/chunk-cache.ts) 시험 — 2026-10-10 개선 계획 P2-2: 5분 캐시를 문서를 올린 뒤에도 비우지 않아,
// 같은 서버에서 연달아 올리면 크기 보호(40만 자)가 앞 문서가 빠진 낡은 조각으로 재고, 올린 직후 AI 요청에도 새 문서가 최대 5분 안 보였음.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK_TTL_MS, cachedChunks, clearChunkCache, storeChunks } from "./chunk-cache.ts";

test("캐시: 5분 안이면 같은 것을, 지나면 null, 비우면 null", () => {
  clearChunkCache();
  storeChunks("all", [{ k: 1 }], 1_000);
  assert.deepEqual(cachedChunks("all", 1_000 + CHUNK_TTL_MS - 1), [{ k: 1 }]);
  assert.equal(cachedChunks("all", 1_000 + CHUNK_TTL_MS + 1), null, "5분 지나면 다시 읽음");
  storeChunks("주요사업", [{ k: 2 }], 2_000);
  clearChunkCache();
  assert.equal(cachedChunks("주요사업", 2_001), null, "올리기·지우기 뒤 비움");
  assert.equal(cachedChunks("없는 열쇠", 0), null);
});
