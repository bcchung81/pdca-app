// AI 백그라운드 작업 한 번의 끝맺기(lib/ai/job-run.ts) + 시작 → after 작업 → 완료 흐름(가짜 DB — 실제 AI·운영 DB 없이, 2026-11-06).
// 서버 액션이 시작(running 행) → 응답 → after에서 runJob(work) → 결과 행. 화면은 그 사이 jobState로 진행 중·끝을 봄.
import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { runJob } from "./job-run.ts";
import { JOB_CRASH_MSG, type JobOutcome, type JobRow, jobState } from "./jobs.ts";
import { startAiRequest, startAiRequests } from "./request-log.ts";

/** 결과·닫기 기록만 남기는 가짜 sink */
function sink(o: { saveErr?: string; saveThrows?: boolean } = {}) {
  const saved: JobOutcome[] = [];
  const failed: string[] = [];
  return {
    saved,
    failed,
    s: {
      save: async (r: JobOutcome) => {
        if (o.saveThrows) throw new Error("연결 끊김");
        if (o.saveErr) return o.saveErr;
        saved.push(r);
        return null;
      },
      fail: async (m: string) => {
        failed.push(m);
      },
    },
  };
}
const quiet = () => {};

test("runJob: 성공하면 결과 하나만 남기고 호출 기록은 건드리지 않음(작업이 이미 ok로 끝맺음)", async () => {
  const k = sink();
  const out = await runJob(async () => ({ ok: true, message: "구성안을 만들었습니다", data: { n: 1 } }), k.s, quiet);
  assert.deepEqual(out, { ok: true, message: "구성안을 만들었습니다", data: { n: 1 } });
  assert.deepEqual(k.saved, [out]);
  assert.deepEqual(k.failed, []);
});

test("runJob: 거절·저장 충돌로 끝나면 결과(실패)를 남기고 아직 running인 기록은 닫음", async () => {
  const k = sink();
  await runJob(async () => ({ ok: false, message: "다른 곳에서 고쳤습니다" }), k.s, quiet);
  assert.deepEqual(k.saved, [{ ok: false, message: "다른 곳에서 고쳤습니다" }]);
  assert.deepEqual(k.failed, ["다른 곳에서 고쳤습니다"]);
});

test("runJob: 작업이 던지면 짧은 글로 실패 결과 + 기록 닫기(멈춘 running 행이 남지 않음), 자세한 오류는 로그로만", async () => {
  const k = sink();
  const logs: string[] = [];
  const out = await runJob(
    async () => {
      throw new Error("내부 비밀 경로 /var/x");
    },
    k.s,
    (m) => logs.push(m),
  );
  assert.deepEqual(out, { ok: false, message: JOB_CRASH_MSG });
  assert.deepEqual(k.saved, [{ ok: false, message: JOB_CRASH_MSG }]);
  assert.deepEqual(k.failed, [JOB_CRASH_MSG]);
  assert.ok(logs.some((l) => l.includes("작업 실패")));
});

test("runJob: 결과를 못 남기면(오류 글·예외) 기록을 error로 닫아 화면이 실패로 봄", async () => {
  for (const o of [{ saveErr: "row-level security" }, { saveThrows: true }]) {
    const k = sink(o);
    await runJob(async () => ({ ok: true, message: "끝" }), k.s, quiet);
    assert.equal(k.saved.length, 0);
    assert.equal(k.failed.length, 1);
    assert.match(k.failed[0], /결과를 저장하지 못했습니다/);
  }
});

// ---------------------------------------------------------------------------
// 시작 → after → 완료: ai_requests·ai_results 두 표를 흉내 낸 가짜 DB 위에서 서버 액션과 같은 순서로

type Row = Record<string, any>;
function fakeDb() {
  const tables: Record<string, Row[]> = { ai_requests: [], ai_results: [] };
  let nextId = 1;
  const builder = (table: string, kind: "select" | "update" | "insert", payload?: Row) => {
    const filters: Array<(r: Row) => boolean> = [];
    const q: any = {
      eq: (k: string, v: any) => (filters.push((r) => r[k] === v), q),
      neq: (k: string, v: any) => (filters.push((r) => r[k] !== v), q),
      gte: (k: string, v: any) => (filters.push((r) => (r[k] ?? "") >= v), q),
      lt: (k: string, v: any) => (filters.push((r) => (r[k] ?? "") < v), q),
      select: () => q,
      single: () => q,
      then(resolve: (v: any) => void) {
        const rows = tables[table];
        if (kind === "select") resolve({ count: rows.filter((r) => filters.every((f) => f(r))).length, data: null, error: null });
        else if (kind === "insert") {
          const r = { id: nextId++, created_at: new Date().toISOString(), ...payload };
          rows.push(r);
          resolve({ data: { id: r.id }, error: null });
        } else {
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          hit.forEach((r) => Object.assign(r, payload));
          resolve({ data: hit, error: null });
        }
      },
    };
    return q;
  };
  const db: any = { from: (t: string) => ({ select: () => builder(t, "select"), insert: (p: Row) => builder(t, "insert", p), update: (p: Row) => builder(t, "update", p) }) };
  /** GET 라우트가 읽는 모양(호출 기록 + 결과 끝맺음) */
  const jobRow = (id: number): JobRow => {
    const r = tables.ai_requests.find((x) => x.id === id)!;
    const res = tables.ai_results.find((x) => x.request_id === id);
    return { id, feature: r.feature, job: r.job ?? null, mode: r.mode, status: r.status, error: r.error ?? null, created_at: r.created_at, finished_at: r.finished_at ?? null, res: res ? { ok: res.result.ok, message: res.result.message } : null };
  };
  return { db, tables, jobRow };
}

test("흐름: 시작(running 행·작업 종류) → 응답 → after에서 AI(호출 기록 ok) → 검증·저장 중에도 진행 중 → 결과 행이 생기면 끝(화면이 끝맺음 글을 받음)", async () => {
  const f = fakeDb();
  const start = await startAiRequest(f.db, { userId: "u1", cardId: "c1", feature: "report_outline", mode: "1p", job: "outline" });
  assert.ok(start.ok);
  if (!start.ok) return;
  assert.equal(f.tables.ai_requests[0].job, "outline", "작업 종류는 넣을 때 기록");
  assert.equal(jobState(f.jobRow(start.id)).state, "running", "응답을 돌려줄 때는 진행 중");

  // after에서 도는 작업 — 단계마다 화면이 보는 상태를 잼
  let midAi = "";
  let midSave = "";
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const k = {
    save: async (result: JobOutcome) => {
      f.tables.ai_results.push({ request_id: start.id, result });
      return null;
    },
    fail: (m: string) => start.finish({ status: "error", error: m }),
  };
  const done = runJob(async () => {
    midAi = jobState(f.jobRow(start.id)).state;
    await start.finish({ status: "ok", model: "cli/opus" }); // AI가 돌려준 직후 토큰 기록(검증 전)
    await gate; // 검증·저장(예: 1차 저장·분량 채움)
    midSave = jobState(f.jobRow(start.id)).state;
    return { ok: true, message: "구성안을 만들었습니다(블록 6개)" };
  }, k);
  for (let i = 0; i < 50 && f.tables.ai_requests[0].status !== "ok"; i++) await Promise.resolve();
  assert.equal(f.tables.ai_requests[0].status, "ok", "호출 기록은 AI 직후 ok");
  assert.equal(jobState(f.jobRow(start.id)).state, "running", "결과 행 전에는 여전히 진행 중");
  release();
  await done;
  assert.equal(midAi, "running");
  assert.equal(midSave, "running");
  assert.deepEqual(jobState(f.jobRow(start.id)), { state: "ok", message: "구성안을 만들었습니다(블록 6개)" });
});

test("흐름: after 작업이 AI 전에 던지면 기록이 error로 닫히고(동시 실행 제한에서 빠짐) 결과는 짧은 실패 글", async () => {
  const f = fakeDb();
  const start = await startAiRequest(f.db, { userId: "u1", cardId: "c1", feature: "card_chat", job: "chat" });
  assert.ok(start.ok);
  if (!start.ok) return;
  await runJob(
    async () => {
      throw new Error("boom");
    },
    { save: async (result) => (f.tables.ai_results.push({ request_id: start.id, result }), null), fail: (m) => start.finish({ status: "error", error: m }) },
    quiet,
  );
  assert.equal(f.tables.ai_requests[0].status, "error");
  assert.equal(f.tables.ai_requests[0].error, JOB_CRASH_MSG);
  assert.deepEqual(jobState(f.jobRow(start.id)), { state: "error", message: JOB_CRASH_MSG });
  // 동시 실행 수에서 빠짐: 같은 사용자가 바로 다시 시작할 수 있음
  const again = await startAiRequest(f.db, { userId: "u1", cardId: "c1", feature: "card_chat", job: "chat" });
  assert.ok(again.ok);
});

test("여러 안 묶음: 작업 종류는 첫 행에만(묶음 하나가 작업 하나 — 결과 행은 첫 행 id로), 나머지 행은 기록만", async () => {
  const f = fakeDb();
  const b = await startAiRequests(f.db, { userId: "u1", cardId: "c1", feature: "report_outline", mode: "1p+3안", job: "alts" }, 3);
  assert.ok(b.ok);
  assert.deepEqual(
    f.tables.ai_requests.map((r) => r.job ?? null),
    ["alts", null, null],
  );
});
