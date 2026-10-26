import assert from "node:assert/strict";
import { test } from "node:test";
import { type StoredDigest, chunkKeyOf, digestChunkRow, digestDocumentRow } from "./rules-digest-store.ts";

const d: StoredDigest = { id: "BZ-1", title: "제목", track: "주요사업", business: "BZ-1", md: "# 문서\n- 줄 [a]\n", inputs: [{ key: "a", hash: "h1" }], promptVersion: "rules-digest@x", model: "m", generatedAt: "2026-10-26T00:00:00Z" };

test("조각 행은 앱이 읽는 모양: doc_id·unit_type·meta.sources", () => {
  const r = digestChunkRow(d, 1, { checkSummary: { 맞음: 3 } });
  assert.equal(r.chunk_key, chunkKeyOf("rules-biz", "BZ-1"));
  assert.equal(r.doc_id, "rules-biz");
  assert.equal(r.unit_type, "rules_digest");
  assert.equal(r.track, "주요사업");
  assert.equal(r.business, "BZ-1");
  assert.equal(r.text, d.md);
  assert.equal(r.searchable, false);
  assert.deepEqual(r.meta, { usage: "rules_digest", sources: [{ key: "a", hash: "h1" }], promptVersion: "rules-digest@x", model: "m", generatedAt: d.generatedAt, checkSummary: { 맞음: 3 } });
});

test("트랙 공통은 business null, reviewedAt은 줄 때만", () => {
  const r = digestChunkRow({ ...d, id: "track-biz", business: null }, 0);
  assert.equal(r.business, null);
  assert.equal("reviewedAt" in (r.meta as object), false);
  assert.equal((digestChunkRow(d, 0, { reviewedAt: "t" }).meta as { reviewedAt?: string }).reviewedAt, "t");
});

test("문서 행: 글이 바뀌면 sha256이 바뀌고 조각 수를 셈", () => {
  const a = digestDocumentRow("주요사업", [digestChunkRow(d, 0)]);
  const b = digestDocumentRow("주요사업", [digestChunkRow({ ...d, md: "다른 글" }, 0)]);
  assert.equal(a.doc_id, "rules-biz");
  assert.equal(a.chunk_count, 1);
  assert.deepEqual(a.unit_counts, { rules_digest: 1 });
  assert.notEqual(a.sha256, b.sha256);
  assert.equal(digestDocumentRow("경영관리", []).doc_id, "rules-mg");
});
