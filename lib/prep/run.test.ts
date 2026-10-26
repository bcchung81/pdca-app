import assert from "node:assert/strict";
import { test } from "node:test";
import { STUCK_LIMIT_MS, isStuck } from "./queue.ts";
import { type PrepFinish, type PrepHandler, type PrepStore, drainPrepJobs } from "./run.ts";
import type { PrepJob, PrepKind } from "./types.ts";

/** 메모리 저장소 — claim은 실제 저장소처럼 조건부 갱신(대기일 때만 잡힘) */
function fakeStore(seed: Array<Partial<PrepJob> & { kind: PrepKind; target: string; startedAt?: Date }>) {
  const rows = seed.map((s, i) => ({ id: i + 1, payload: {}, status: "queued" as PrepJob["status"], attempts: 0, requested_by: null, error: null as string | null, progress: null as unknown, ...s }));
  const store: PrepStore = {
    async claim(kinds, exclude = []) {
      await Promise.resolve();
      const job = rows.find((r) => r.status === "queued" && kinds.includes(r.kind) && !exclude.includes(r.id));
      if (!job) return null;
      job.status = "running";
      job.attempts++;
      job.startedAt = new Date();
      return { id: job.id, kind: job.kind, target: job.target, payload: job.payload, status: "running", attempts: job.attempts, requested_by: job.requested_by };
    },
    async finish(id, result: PrepFinish) {
      const job = rows.find((r) => r.id === id)!;
      job.status = result.status;
      job.error = result.error ?? null;
      job.progress = result.progress ?? job.progress;
    },
    async reclaimStuck(now) {
      let n = 0;
      for (const r of rows) {
        if (r.status === "running" && isStuck(r.startedAt ?? null, now)) {
          r.status = "queued";
          n++;
        }
      }
      return n;
    },
    async countQueued(kinds) {
      return rows.filter((r) => r.status === "queued" && kinds.includes(r.kind)).length;
    },
    table: () => {
      throw new Error("이 시험에서는 표를 쓰지 않음");
    },
    reader: () => {
      throw new Error("이 시험에서는 표를 쓰지 않음");
    },
  } as PrepStore;
  return { rows, store };
}
const ok: PrepHandler = async () => ({ progress: { n: 1 } });

test("대기 작업을 오래된 순으로 하나씩 처리하고 done, 처리기가 준 progress를 남긴다", async () => {
  const { rows, store } = fakeStore([{ kind: "match_knowledge", target: "A" }, { kind: "match_knowledge", target: "B" }]);
  const order: string[] = [];
  const r = await drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 1000, handlers: { match_knowledge: async ({ job }) => { order.push(job.target); return { progress: { n: 1 } }; } } });
  assert.deepEqual(order, ["A", "B"]);
  assert.deepEqual([r.done, r.failed, r.requeued, r.left], [2, 0, 0, 0]);
  assert.ok(rows.every((x) => x.status === "done" && (x.progress as { n: number }).n === 1));
});

test("처리기가 없으면 건너뛰고 실패로 표시하지 않고 대기로 남긴다(left도 세지 않음)", async () => {
  const { rows, store } = fakeStore([{ kind: "match_knowledge", target: "A" }]);
  const none = await drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 1000, handlers: {} });
  assert.deepEqual(none, { done: 0, failed: 0, requeued: 0, reclaimed: 0, left: 0 });
  assert.equal(rows[0].status, "queued");
  const r = await drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 1000, handlers: { match_knowledge: ok } });
  assert.equal(rows[0].status, "done", "처리기가 생기면 처리됨");
  assert.equal(r.left, 0);
});

test("첫 실패는 다시 대기(같은 드레인에서 다시 안 잡음), 두 번째 실패는 failed로 닫고 오류를 남긴다", async () => {
  const { rows, store } = fakeStore([{ kind: "match_knowledge", target: "A" }]);
  let calls = 0;
  const bad: PrepHandler = async () => { calls++; throw new Error("일시 오류"); };
  const first = await drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 1000, handlers: { match_knowledge: bad } });
  assert.equal(calls, 1);
  assert.deepEqual([first.requeued, first.failed, first.left], [1, 0, 1]);
  assert.equal(rows[0].status, "queued");
  assert.equal(rows[0].error, "일시 오류");
  const second = await drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 1000, handlers: { match_knowledge: bad } });
  assert.deepEqual([second.requeued, second.failed, second.left], [0, 1, 0]);
  assert.equal(rows[0].status, "failed");
});

test("시간 예산이 지나면 다음 작업을 잡지 않는다", async () => {
  const { rows, store } = fakeStore([{ kind: "match_knowledge", target: "A" }, { kind: "match_knowledge", target: "B" }]);
  let t = 0;
  const r = await drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 100, now: () => t, handlers: { match_knowledge: async () => { t += 150; } } });
  assert.equal(r.done, 1);
  assert.equal(r.left, 1);
  assert.equal(rows[1].status, "queued");
});

test("maxJobs를 넘겨 처리하지 않는다", async () => {
  const { store } = fakeStore([{ kind: "match_knowledge", target: "A" }, { kind: "match_knowledge", target: "B" }, { kind: "match_knowledge", target: "C" }]);
  const r = await drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 1000, maxJobs: 2, handlers: { match_knowledge: ok } });
  assert.deepEqual([r.done, r.left], [2, 1]);
});

test("멈춘 작업(실행 중인 채 오래됨)은 시작할 때 대기로 되돌려 다시 돌린다", async () => {
  const stuck = new Date(Date.now() - STUCK_LIMIT_MS - 60_000);
  const { rows, store } = fakeStore([{ kind: "match_knowledge", target: "A", status: "running", attempts: 1, startedAt: stuck }]);
  const r = await drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 1000, handlers: { match_knowledge: ok } });
  assert.equal(r.reclaimed, 1);
  assert.equal(r.done, 1);
  assert.equal(rows[0].status, "done");
});

test("두 처리기가 동시에 돌아도 같은 작업을 두 번 처리하지 않는다", async () => {
  const { store } = fakeStore(Array.from({ length: 6 }, (_, i) => ({ kind: "match_knowledge" as const, target: `T${i}` })));
  const seen: string[] = [];
  const handlers = { match_knowledge: async ({ job }: { job: PrepJob }) => { seen.push(job.target); } };
  const [a, b] = await Promise.all([
    drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 1000, handlers }),
    drainPrepJobs({ store, kinds: ["match_knowledge"], budgetMs: 1000, handlers }),
  ]);
  assert.equal(a.done + b.done, 6);
  assert.equal(new Set(seen).size, 6);
});
