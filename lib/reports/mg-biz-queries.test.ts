// mg-biz-queries.ts의 DB를 부르지 않는 부분: 행 바꾸기(과제 표기·빈 값), 빈 입력·상한·오류 때 []. 권한·행 고르기는 lib/db/migrations.test.ts.
// mg-biz-queries.ts는 import "server-only"라 일반 node --test로 못 불러오므로, "server-only"만 빈 모듈로 돌려 주고 불러옵니다(lib/ai/run.test.ts와 같음).
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const q = await import("./mg-biz-queries.ts");

/** rpc 호출을 기록하고 정해 둔 답을 돌려주는 가짜 클라이언트 */
function fake(answer: { data?: unknown; error?: { message: string } | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

/** console.error를 잠시 모음 */
async function quiet<T>(fn: () => Promise<T>): Promise<{ value: T; logged: unknown[][] }> {
  const logged: unknown[][] = [];
  const saved = console.error;
  console.error = (...a: unknown[]) => void logged.push(a);
  try {
    return { value: await fn(), logged };
  } finally {
    console.error = saved;
  }
}

test("과제 표기: 「주요사업N N-가」, 묶음·번호가 그 모양이 아니면 과제번호 그대로", () => {
  assert.equal(q.taskIdOf("주요사업3", "3-나"), "주요사업3 3-나");
  assert.equal(q.taskIdOf("주요사업3", " 12-다 "), "주요사업3 12-다");
  assert.equal(q.taskIdOf(null, "3-나"), "3-나");
  assert.equal(q.taskIdOf("경영관리1", "1-1"), "1-1");
  assert.equal(q.taskIdOf("주요사업3", "AI결과삭제-1"), "AI결과삭제-1");
});

test("목록 행 바꾸기: 빈 팀·개수는 빈 글·0", () => {
  const row = q.toBizRefRow({ biz_card_id: "주요사업1/1-가", uid: "u1", group_name: "주요사업1", task_no: "1-가", title: "가 과제", team_name: null, stamp: "s", updated_at: "2026-11-12T00:00:00Z", unknown_count: null, file_count: 2, chars: 1234 });
  assert.deepEqual(row, { cardId: "주요사업1/1-가", uid: "u1", taskId: "주요사업1 1-가", taskNo: "1-가", title: "가 과제", team: "", stamp: "s", updatedAt: "2026-11-12T00:00:00Z", unknownCount: 0, fileCount: 2, chars: 1234 });
});

test("글 행 바꾸기: 없는 숫자는 글 배열, 붙임은 card/report이고 글이 있는 것만", () => {
  const t = q.toBizRefText({
    biz_card_id: "주요사업2/2-나",
    group_name: "주요사업2",
    task_no: "2-나",
    title: "나 과제",
    team_name: "가상팀",
    data: { a: 1 },
    spec: { version: 3 },
    stamp: "s",
    updated_at: "t",
    unknown_numbers: ["99", 7],
    files: [
      { kind: "card", id: "c1", name: "a.pdf", text: "가" },
      { kind: "report", id: "r1", name: "b.pdf", text: "나" },
      { kind: "prior", id: "p", name: "x", text: "다" },
      { kind: "card", id: "c2", name: "c.pdf", text: null },
    ],
  });
  assert.equal(t.taskId, "주요사업2 2-나");
  assert.deepEqual(t.unknownNumbers, ["99", "7"]);
  assert.deepEqual(t.files, [
    { kind: "card", id: "c1", name: "a.pdf", text: "가" },
    { kind: "report", id: "r1", name: "b.pdf", text: "나" },
  ]);
  assert.deepEqual(q.toBizRefText({ ...t, biz_card_id: "x", group_name: null, task_no: "1", title: "", team_name: null, updated_at: "", unknown_numbers: null, files: null } as never).files, []);
});

test("빈 입력이면 DB를 부르지 않고 []", async () => {
  const f = fake({ data: [] });
  assert.deepEqual(await q.loadBizRefs(f.client, "", 2026), []);
  assert.deepEqual(await q.loadBizRefTexts(f.client, "경영관리1/1-1", 2026, []), []);
  assert.deepEqual(await q.loadBizRefTexts(f.client, "", 2026, ["주요사업1/1-가"]), []);
  assert.deepEqual(await q.loadBizStale(f.client, [], 2026), []);
  assert.equal(f.calls.length, 0);
});

test("인자 이름·같은 id 한 번·상한 넘으면 부르지 않고 []와 오류 기록", async () => {
  const f = fake({ data: [] });
  await q.loadBizRefs(f.client, "경영관리1/1-1", 2026);
  await q.loadBizRefTexts(f.client, "경영관리1/1-1", 2026, ["a", "a", "b"]);
  await q.loadBizStale(f.client, ["m1", "m1", "m2"], 2026);
  assert.deepEqual(f.calls, [
    { fn: "mg_biz_refs", args: { p_card_id: "경영관리1/1-1", p_year: 2026 } },
    { fn: "mg_biz_ref_texts", args: { p_card_id: "경영관리1/1-1", p_year: 2026, p_biz_ids: ["a", "b"] } },
    { fn: "mg_biz_stale", args: { p_card_ids: ["m1", "m2"], p_year: 2026 } },
  ]);
  const many = Array.from({ length: q.BIZ_TEXT_MAX + 1 }, (_, i) => `b${i}`);
  const r1 = await quiet(() => q.loadBizRefTexts(f.client, "m", 2026, many));
  const r2 = await quiet(() => q.loadBizStale(f.client, Array.from({ length: q.BIZ_STALE_MAX + 1 }, (_, i) => `m${i}`), 2026));
  assert.deepEqual([r1.value, r2.value], [[], []]);
  assert.equal(r1.logged.length + r2.logged.length, 2);
  assert.equal(f.calls.length, 3, "상한을 넘으면 DB를 부르지 않음");
});

test("rpc 오류면 []와 오류 기록, 성공이면 행을 바꿔 돌려줌", async () => {
  const bad = fake({ error: { message: "boom" } });
  for (const load of [(): Promise<unknown[]> => q.loadBizRefs(bad.client, "m", 2026), () => q.loadBizRefTexts(bad.client, "m", 2026, ["b"]), () => q.loadBizStale(bad.client, ["m"], 2026)]) {
    const r = await quiet(load);
    assert.deepEqual(r.value, []);
    assert.equal(r.logged.length, 1);
  }
  const ok = fake({ data: [{ card_id: "m", biz_card_id: "주요사업1/1-가", task_no: "1-가", updated_at: null }] });
  assert.deepEqual(await q.loadBizStale(ok.client, ["m"], 2026), [{ cardId: "m", bizCardId: "주요사업1/1-가", taskNo: "1-가", updatedAt: null }]);
});
