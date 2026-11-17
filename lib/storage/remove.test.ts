import assert from "node:assert/strict";
import { test } from "node:test";
import { type RemoveClient, type RemoveResult, removeFailLine, removeObjects } from "./remove.ts";

const NOW = Date.parse("2026-11-18T03:04:05Z");

test("removeFailLine: 다 지웠으면 null, 오류·일부만·0개면 한 줄 JSON(경로는 앞 5개, 메시지는 300자)", () => {
  assert.equal(removeFailLine("w", "card-materials", ["u/a.pdf"], { data: [{ name: "u/a.pdf" }], error: null }, NOW), null);
  assert.equal(removeFailLine("w", "b", ["a", "b"], { data: [{}, {}, {}], error: null }, NOW), null, "더 많이 지운 것으로 와도 실패 아님");

  const zero = removeFailLine("deleteCardMaterial", "card-materials", ["u/a.pdf"], { data: [], error: null }, NOW);
  assert.deepEqual(JSON.parse(zero!), { t: "2026-11-18T03:04:05.000Z", kind: "storage_remove_failed", where: "deleteCardMaterial", bucket: "card-materials", asked: 1, removed: 0, paths: ["u/a.pdf"] });
  assert.ok(!zero!.includes("\n"), "한 줄");

  const paths = ["1", "2", "3", "4", "5", "6", "7"];
  const err = JSON.parse(removeFailLine("purgeCard", "card-originals", paths, { data: null, error: { message: "x".repeat(500) } }, NOW)!);
  assert.deepEqual(err.paths, ["1", "2", "3", "4", "5"]);
  assert.equal(err.removed, 0);
  assert.equal(err.message.length, 300);

  const part = JSON.parse(removeFailLine("w", "b", ["a", "b"], { data: [{}], error: null }, NOW)!);
  assert.equal(part.removed, 1);
  assert.equal("message" in part, false);
});

/** remove 결과(또는 던짐)를 정해 둔 가짜 클라이언트 */
function fake(result: RemoveResult | Error) {
  const calls: Array<{ bucket: string; paths: string[] }> = [];
  const client: RemoveClient = {
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          calls.push({ bucket, paths });
          if (result instanceof Error) throw result;
          return result;
        },
      }),
    },
  };
  return { client, calls };
}

/** console.error를 잠시 모아 봄 */
async function captureErrors<T>(fn: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  try {
    return { value: await fn(), lines };
  } finally {
    console.error = orig;
  }
}

test("removeObjects: 다 지우면 지운 수만 돌려주고 로그 없음", async () => {
  const { client, calls } = fake({ data: [{ name: "a" }], error: null });
  const { value, lines } = await captureErrors(() => removeObjects(client, "card-materials", ["u/a.pdf"], "deleteCardMaterial"));
  assert.equal(value, 1);
  assert.deepEqual(lines, []);
  assert.deepEqual(calls, [{ bucket: "card-materials", paths: ["u/a.pdf"] }]);
});

test("removeObjects: 권한 없음(빈 결과)·오류·던짐은 로그 한 줄을 남기고 던지지 않음", async () => {
  const results: Array<RemoveResult | Error> = [{ data: [], error: null }, { data: null, error: { message: "denied" } }, new Error("network down")];
  for (const result of results) {
    const { client } = fake(result);
    const { value, lines } = await captureErrors(() => removeObjects(client, "report-materials", ["9/a.pdf"], "deleteMaterial"));
    assert.equal(value, 0);
    assert.equal(lines.length, 1);
    const line = JSON.parse(lines[0]);
    assert.equal(line.kind, "storage_remove_failed");
    assert.equal(line.where, "deleteMaterial");
    if (result instanceof Error) assert.equal(line.message, "network down");
  }
});

test("removeObjects: 지울 경로가 없으면 부르지 않음", async () => {
  const { client, calls } = fake({ data: [], error: null });
  const { value, lines } = await captureErrors(() => removeObjects(client, "b", [], "w"));
  assert.equal(value, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(lines, []);
});
