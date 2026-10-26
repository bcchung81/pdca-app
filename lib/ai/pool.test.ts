// 동시 실행 풀(lib/ai/pool.ts) 시험 — 2026-10-10 개선 계획 B5: 월간 일괄 점검이 한 건씩(과제당 6~7분, 59장 ≈ 6.5시간)이라 동시 2건으로.

import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_LIMITS } from "./request-log.ts";
import { BATCH_CONCURRENCY, runPool } from "./pool.ts";

const tick = () => new Promise((r) => setTimeout(r, 1));

test("runPool: 동시에 limit건까지만 돌리고, 결과는 입력 순서대로", async () => {
  let live = 0;
  let peak = 0;
  const out = await runPool([5, 1, 4, 2, 3], 2, async (n) => {
    live++;
    peak = Math.max(peak, live);
    for (let i = 0; i < n; i++) await tick();
    live--;
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 40, 20, 30]);
  assert.equal(peak, 2);
});

test("runPool: 멈추면 새 일을 시작하지 않고(도는 일은 끝까지), 시작하지 않은 자리는 undefined", async () => {
  let stop = false;
  const started: number[] = [];
  const out = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
    started.push(n);
    if (n === 2) stop = true;
    await tick();
    return n;
  }, { stopped: () => stop });
  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(out, [1, 2, undefined, undefined, undefined]);
});

test("runPool: 일이 던져도 다른 일은 계속(던진 자리는 onError로 넘기고 undefined)", async () => {
  const errors: number[] = [];
  const out = await runPool([1, 2, 3], 2, async (n) => {
    await tick();
    if (n === 2) throw new Error("x");
    return n;
  }, { onError: (_e, i) => errors.push(i) });
  assert.deepEqual(out, [1, undefined, 3]);
  assert.deepEqual(errors, [1]);
});

test("BATCH_CONCURRENCY는 AI 동시 실행 제한(AI_LIMITS.running)과 같음 — 넘으면 서버가 「이미 N건」으로 거절", () => {
  assert.equal(BATCH_CONCURRENCY, AI_LIMITS.running);
});
