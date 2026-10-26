import assert from "node:assert/strict";
import { test } from "node:test";
import { userBlocks } from "./user-blocks.ts";

const cache = { type: "ephemeral" as const, ttl: "5m" as const };
type B = { text?: string };
const marks = (b: object[]) => b.filter((x) => "cache_control" in x).length;
const text = (x: object | undefined) => (x as B | undefined)?.text;

test("요청 글 표지가 없으면 공유 덩이만 표지(시스템 1 + 덩이 2 = 3)", () => {
  const b = userBlocks({ shared: ["A", "B"], prompt: "P", cache });
  assert.equal(marks(b), 2);
  assert.equal(text(b[2]), "P");
  assert.equal("cache_control" in b[2]!, false);
});

test("1차 요청(cachePrompt)은 요청 글 끝에 표지 — 시스템 포함 4개 이내", () => {
  const b = userBlocks({ shared: ["A", "B", "C"], prompt: "P", cache, cachePrompt: true });
  assert.equal(marks(b) + 1, 4);
  assert.deepEqual(b.map(text), ["A", "B", "C", "P"]);
  assert.equal("cache_control" in b[2]!, false);
  assert.equal("cache_control" in b[3]!, true);
});

test("고치기 요청은 1차와 앞부분이 바이트까지 같고 끝부분만 다름", () => {
  const first = userBlocks({ shared: ["A", "B"], prompt: "P", cache, cachePrompt: true });
  const fix = userBlocks({ shared: ["A", "B"], prompt: "P", cache, tail: "\n\n고칠 점" });
  assert.deepEqual(fix.slice(0, 3), first);
  assert.equal(fix.length, 4);
  assert.equal(text(fix[3]), "\n\n고칠 점");
  assert.equal("cache_control" in fix[3]!, false);
  assert.equal(marks(fix) + 1, 4);
});

test("그림은 요청 글 앞에 오고 표지 개수는 그대로", () => {
  const img = { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: "x" } };
  const b = userBlocks({ shared: [], prompt: "P", cache, media: img });
  assert.equal((b[0] as { type: string }).type, "image");
  assert.equal(marks(b), 0);
});
