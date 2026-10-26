// AI 호출 기록·제한 공용 래퍼(lib/ai/request-log.ts) 시험 — 2026-10-10 개선 계획 P0-3·B1:
// 호출 직전에 running 행을 넣어 1분 5회·동시 실행 제한에 진행 중 호출도 세고, 끝나면 토큰·소요 시간을 채워 끝맺음(검증 전에 — 검증 예외에도 토큰이 남음).

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AI_LIMITS, batchLimitMessage, startAiRequest, startAiRequests } from "./request-log.ts";

type Row = Record<string, any>;

/** ai_requests 한 표만 흉내 내는 가짜 클라이언트: select(count head)·insert(returning)·update(returning) + eq·neq·gte·lt 조건 */
function fakeDb(seed: Row[] = []) {
  const rows: Row[] = seed.map((r, i) => ({ id: i + 1, ...r }));
  let nextId = rows.length + 1;
  const match = (r: Row, f: Array<[string, string, any]>) =>
    f.every(([op, k, v]) => (op === "eq" ? r[k] === v : op === "neq" ? r[k] !== v : op === "gte" ? r[k] >= v : op === "lt" ? r[k] < v : true));
  const builder = (kind: "select" | "update" | "insert", payload?: Row, opts?: any) => {
    const filters: Array<[string, string, any]> = [];
    const q: any = {
      eq: (k: string, v: any) => (filters.push(["eq", k, v]), q),
      neq: (k: string, v: any) => (filters.push(["neq", k, v]), q),
      gte: (k: string, v: any) => (filters.push(["gte", k, v]), q),
      lt: (k: string, v: any) => (filters.push(["lt", k, v]), q),
      select: () => q,
      single: () => q,
      then(resolve: (v: any) => void) {
        if (kind === "select") resolve({ count: rows.filter((r) => match(r, filters)).length, data: null, error: null });
        else if (kind === "insert") {
          const r = { id: nextId++, ...payload };
          rows.push(r);
          resolve({ data: { id: r.id }, error: null });
        } else {
          const hit = rows.filter((r) => match(r, filters));
          hit.forEach((r) => Object.assign(r, payload));
          resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
        }
      },
    };
    void opts;
    return q;
  };
  const db: any = { from: (t: string) => (assert.equal(t, "ai_requests"), { select: (_c: string, o?: any) => builder("select", undefined, o), insert: (p: Row) => builder("insert", p), update: (p: Row) => builder("update", p) }) };
  return { db, rows };
}

const NOW = Date.parse("2026-10-10T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const me = "u1";

test("startAiRequest: running 행을 넣고, finish가 토큰·모델·소요 시간·단계 시간을 채워 ok로 끝맺음", async () => {
  const f = fakeDb();
  const r = await startAiRequest(f.db, { userId: me, cardId: "c1", feature: "report_section", mode: "1p" }, NOW);
  assert.ok(r.ok);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].status, "running");
  assert.equal(f.rows[0].created_at, undefined, "만든 시각은 DB 기본값(now())");
  if (!r.ok) return;
  await r.finish({ status: "ok", model: "cli/sonnet", usage: { input: 10, output: 200, cacheRead: 5, cacheWrite: 7, cacheWrite1h: 3 }, timings: { call: 900 } }, NOW + 1234);
  assert.equal(f.rows[0].status, "ok");
  assert.equal(f.rows[0].output_tokens, 200);
  assert.equal(f.rows[0].cache_write_1h_tokens, 3);
  assert.equal(f.rows[0].model, "cli/sonnet");
  assert.equal(f.rows[0].duration_ms, 1234);
  assert.deepEqual(f.rows[0].timings, { call: 900 });
  assert.ok(f.rows[0].finished_at);
});

test("finish: 실패(error)로 끝맺어도 duration_ms·finished_at이 남고, timings를 안 넘겨도 시작 시각에서 자동 계산됨", async () => {
  const f = fakeDb();
  const r = await startAiRequest(f.db, { userId: me, feature: "card_comment" }, NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  await r.finish({ status: "error", error: "시간 초과" }, NOW + 4321);
  assert.equal(f.rows[0].status, "error");
  assert.equal(f.rows[0].duration_ms, 4321);
  assert.ok(f.rows[0].finished_at);
  assert.equal(f.rows[0].timings, undefined);
});

test("finish는 한 번만: ok로 끝맺은 뒤 검증 예외로 error 끝맺기를 불러도 토큰 기록이 남음(running 조건)", async () => {
  const f = fakeDb();
  const r = await startAiRequest(f.db, { userId: me, feature: "inspection" }, NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  await r.finish({ status: "ok", usage: { input: 1, output: 50, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 } }, NOW + 10);
  await r.finish({ status: "error", error: "검증 실패" }, NOW + 20);
  assert.equal(f.rows[0].status, "ok");
  assert.equal(f.rows[0].output_tokens, 50);
});

test("제한: 진행 중 호출이 상한이면 거절(5~10분짜리 호출도 셈), 최근 60초 기록이 5건이면 거절", async () => {
  const running = Array.from({ length: AI_LIMITS.running }, () => ({ user_id: me, feature: "report_outline", status: "running", created_at: iso(NOW - 5 * 60_000) }));
  const busy = await startAiRequest(fakeDb(running).db, { userId: me, feature: "card_assist" }, NOW);
  assert.equal(busy.ok, false);
  assert.match(!busy.ok ? busy.message : "", /이미 \d+건/);
  const recent = Array.from({ length: AI_LIMITS.perMinute }, () => ({ user_id: me, feature: "card_chat", status: "ok", created_at: iso(NOW - 10_000) }));
  const often = await startAiRequest(fakeDb(recent).db, { userId: me, feature: "card_chat" }, NOW);
  assert.equal(often.ok, false);
  assert.match(!often.ok ? often.message : "", /1분 뒤/);
  // 다른 사람 기록·첨부 그림 설명 기록은 세지 않음
  const others = [...recent.map((r) => ({ ...r, user_id: "u2" })), ...recent.map((r) => ({ ...r, feature: "material_describe" }))];
  assert.equal((await startAiRequest(fakeDb(others).db, { userId: me, feature: "card_chat" }, NOW)).ok, true);
});

test("오래된 running 행(끝맺지 못한 호출 — 함수가 시간 제한에서 끊김)은 시작할 때 error로 닫고 동시 실행 수에서 뺌", async () => {
  const stale = Array.from({ length: AI_LIMITS.running }, () => ({ user_id: me, feature: "report_section", status: "running", created_at: iso(NOW - AI_LIMITS.staleMs - 60_000) }));
  const f = fakeDb(stale);
  const r = await startAiRequest(f.db, { userId: me, feature: "report_section" }, NOW);
  assert.ok(r.ok, "오래된 것은 세지 않음");
  assert.deepEqual(f.rows.slice(0, stale.length).map((x) => x.status), stale.map(() => "error"));
  assert.match(f.rows[0].error, /중단/);
});

test("limited: false(첨부 그림 설명)는 제한 없이 기록만", async () => {
  const running = Array.from({ length: AI_LIMITS.running + 2 }, () => ({ user_id: me, feature: "report_outline", status: "running", created_at: iso(NOW - 60_000) }));
  const r = await startAiRequest(fakeDb(running).db, { userId: me, feature: "material_describe", limited: false }, NOW);
  assert.ok(r.ok);
});

test("requestState·medianMs(AI 사용량 화면): running은 진행 중, 오래된 running은 중단, 소요 시간 중앙값은 끝맺은 행만", async () => {
  const { requestState, medianMs } = await import("./request-log.ts");
  assert.equal(requestState({ status: "running", created_at: iso(NOW - 60_000) }, NOW), "running");
  assert.equal(requestState({ status: "running", created_at: iso(NOW - AI_LIMITS.staleMs - 1) }, NOW), "stalled");
  assert.equal(requestState({ status: "error", created_at: iso(NOW) }, NOW), "error");
  assert.equal(requestState({ status: "ok", created_at: iso(NOW) }, NOW), "ok");
  assert.equal(medianMs([{ duration_ms: 300 }, { duration_ms: 100 }, { duration_ms: null }, { duration_ms: 200 }]), 200);
  assert.equal(medianMs([{ duration_ms: 100 }, { duration_ms: 400 }]), 250);
  assert.equal(medianMs([{ duration_ms: null }]), null);
});

// 여러 안(경평 구성안 「다른 짜임 여러 안」, 2026-10-12): 같은 요청 N번을 한꺼번에 동시에 — 동시 상한(2)을 혼자 넘으므로 진행 중 호출이 없을 때만, 1분 상한에는 N건으로 셈
test("batchLimitMessage: 진행 중 호출이 하나라도 있으면 거절, 최근 60초 + N이 1분 상한을 넘으면 거절, 한 번에 1분 상한까지", () => {
  assert.equal(batchLimitMessage({ running: 0, recent: 0 }, 3), null);
  assert.equal(batchLimitMessage({ running: 0, recent: AI_LIMITS.perMinute - 3 }, 3), null, "딱 상한");
  assert.match(batchLimitMessage({ running: 1, recent: 0 }, 2) ?? "", /이미 1건 돌고/);
  assert.match(batchLimitMessage({ running: 0, recent: AI_LIMITS.perMinute - 2 }, 3) ?? "", /3번으로 셉니다/);
  assert.match(batchLimitMessage({ running: 0, recent: 0 }, AI_LIMITS.perMinute + 1) ?? "", /까지입니다/);
});

test("startAiRequests: 안마다 running 행 하나(같은 기능·mode), 끝맺기는 안마다 따로 — 진행 중 호출이 있으면 행을 넣지 않고 거절", async () => {
  const f = fakeDb();
  const r = await startAiRequests(f.db, { userId: me, cardId: "c1", feature: "report_outline", mode: "1p+3안" }, 3, NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.reqs.length, 3);
  assert.deepEqual(f.rows.map((x) => [x.feature, x.mode, x.status]), Array.from({ length: 3 }, () => ["report_outline", "1p+3안", "running"]));
  // 묶음이 도는 동안(running 3건) 다른 요청·다른 묶음은 거절 — 만든 시각은 DB 기본값이라 가짜 표에 채움
  f.rows.forEach((x) => (x.created_at ??= iso(NOW)));
  assert.equal((await startAiRequest(f.db, { userId: me, feature: "card_chat" }, NOW + 1)).ok, false);
  assert.equal((await startAiRequests(f.db, { userId: me, feature: "report_outline" }, 2, NOW + 1)).ok, false);
  await r.reqs[1].finish({ status: "error", error: "실패" }, NOW + 5);
  await r.reqs[0].finish({ status: "ok", usage: { input: 1, output: 9, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 } }, NOW + 9);
  assert.deepEqual(f.rows.map((x) => x.status), ["ok", "error", "running"], "안마다 따로 끝맺음");
  const busy = fakeDb([{ user_id: me, feature: "card_assist", status: "running", created_at: iso(NOW - 30_000) }]);
  const no = await startAiRequests(busy.db, { userId: me, feature: "report_outline" }, 2, NOW);
  assert.equal(no.ok, false);
  assert.equal(busy.rows.length, 1, "거절하면 행을 넣지 않음");
});
