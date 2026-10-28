// 「한글(화면 그대로)」 요청 본문 읽기(read-body.ts) 테스트 — 합성 본문만.
// 지키는 것: 보통 본문 그대로 · gzip 본문 풀기 · 풀린 크기 상한을 넘으면 null(413) · 풀지 못하면 빈 글(→ JSON 아님 400) · 줄인 본문 상한(2MB)을 넘으면 null(413)
import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { DOM_HWPX_GZIP_TYPE, DOM_HWPX_MAX_BYTES } from "./policy.ts";
import { decodeBody, readSnapshotText } from "./read-body.ts";

test("본문 글: 보통 그대로 · gzip은 풂 · 풀린 크기 상한을 넘으면 null · 풀지 못하면 빈 글", () => {
  const json = JSON.stringify({ version: "c:1", snapshot: { a: "가".repeat(1000) } });
  assert.equal(decodeBody(new TextEncoder().encode(json), false), json);
  assert.equal(decodeBody(gzipSync(json), true), json);
  assert.equal(decodeBody(gzipSync(json), true, 100), null);
  assert.equal(decodeBody(new TextEncoder().encode("gzip 아님"), true), "");
});

test("요청 본문: content-type이 gzip이면 풂 · 줄인 본문이 2MB를 넘으면 null(413 — 선언 길이·실제 길이 모두)", async () => {
  const json = JSON.stringify({ version: "c:1", snapshot: { b: "x".repeat(5 * 1024 * 1024) } });
  const gz = gzipSync(json);
  assert.ok(gz.length < DOM_HWPX_MAX_BYTES && json.length > DOM_HWPX_MAX_BYTES, "줄이면 상한 안");
  assert.equal(await readSnapshotText(new Request("http://x/", { method: "POST", headers: { "content-type": DOM_HWPX_GZIP_TYPE }, body: gz })), json);
  assert.equal(await readSnapshotText(new Request("http://x/", { method: "POST", headers: { "content-type": "application/json" }, body: json })), null);
  assert.equal(await readSnapshotText(new Request("http://x/", { method: "POST", headers: { "content-length": String(DOM_HWPX_MAX_BYTES + 1) }, body: "{}" })), null);
});
