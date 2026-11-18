// AI 호출 기록·제한 공용 래퍼(lib/ai/request-log.ts) 시험 — 2026-10-10 개선 계획 P0-3·B1:
// 호출 직전에 running 행을 넣어 1분 5회·동시 실행 제한에 진행 중 호출도 세고, 끝나면 토큰·소요 시간을 채워 끝맺음(검증 전에 — 검증 예외에도 토큰이 남음).
// 2026-11-16부터 시작·끝맺기는 rpc(start_ai_request·finish_ai_request — 20261116110000). 여기서는 가짜 rpc(request-log-fake.ts)로 TS 래퍼를 보고,
// DB 함수 자체(잠금·한도·키 대조·권한)는 lib/db/migrations.test.ts가 PGlite로 확인함.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AI_LIMITS, AI_PAUSED_MESSAGE, DESCRIBE_FEATURE, DESCRIBE_LIMITS, batchLimitMessage, startAiRequest, startAiRequests } from "./request-log.ts";
import { fakeAiRequestRpc } from "./request-log-fake.ts";

type Row = Record<string, any>;

const NOW = Date.parse("2026-10-10T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const me = "u1";

/** ai_requests 표 + rpc만 있는 가짜 클라이언트(표 직접 쓰기는 없음 — from을 부르면 실패). calls = rpc 기록 */
function fakeDb(seed: Row[] = [], user = me) {
  const rows: Row[] = seed.map((r, i) => ({ id: i + 1, ...r }));
  const rpc = fakeAiRequestRpc(rows, { user, now: () => NOW });
  const calls: Array<{ fn: string; args: Record<string, any> }> = [];
  const db: any = {
    rpc: (fn: string, args: Record<string, any>) => (calls.push({ fn, args }), rpc(fn, args)),
    from: (t: string) => assert.fail(`표 직접 접근 없음(${t})`),
  };
  return { db, rows, calls };
}

test("startAiRequest: rpc로 running 행을 넣고, finish가 토큰·모델·소요 시간·단계 시간을 채워 ok로 끝맺음", async () => {
  const f = fakeDb();
  const r = await startAiRequest(f.db, { userId: me, cardId: "c1", feature: "report_section", mode: "1p" }, NOW);
  assert.ok(r.ok);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].status, "running");
  assert.deepEqual(f.calls[0].args, { p_feature: "report_section", p_card_id: "c1", p_mode: "1p", p_job: null, p_key_hashes: [f.rows[0].finish_key_hash], p_batch: false });
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

test("끝맺기 키: 시작 때는 키의 sha256만 보내고, 끝맺기 때 보낸 키가 그 해시와 맞음(키는 행마다 다름)", async () => {
  const f = fakeDb();
  const b = await startAiRequests(f.db, { userId: me, feature: "report_outline", mode: "1p+2안" }, 2, NOW);
  assert.ok(b.ok);
  if (!b.ok) return;
  const hashes = f.calls[0].args.p_key_hashes as string[];
  assert.equal(hashes.length, 2);
  assert.notEqual(hashes[0], hashes[1]);
  for (const h of hashes) assert.match(h, /^[0-9a-f]{64}$/);
  await b.reqs[1].finish({ status: "error", error: "x" }, NOW + 1);
  const key = f.calls[1].args.p_key as string;
  assert.equal(createHash("sha256").update(key, "utf8").digest("hex"), hashes[1]);
  assert.ok(!hashes.includes(key), "키 자체는 시작 때 보내지 않음");
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

test("제한(DB 판정 → TS 안내 글): 진행 중 호출이 상한이면 「이미 N건」, 최근 60초 기록이 상한이면 「1분 뒤」", async () => {
  const running = Array.from({ length: AI_LIMITS.running }, () => ({ user_id: me, feature: "report_outline", status: "running", created_at: iso(NOW - 5 * 60_000) }));
  const busy = await startAiRequest(fakeDb(running).db, { userId: me, feature: "card_assist" }, NOW);
  assert.equal(busy.ok, false);
  assert.match(!busy.ok ? busy.message : "", /이미 \d+건/);
  const recent = Array.from({ length: AI_LIMITS.perMinute }, () => ({ user_id: me, feature: "card_chat", status: "ok", created_at: iso(NOW - 10_000) }));
  const often = await startAiRequest(fakeDb(recent).db, { userId: me, feature: "card_chat" }, NOW);
  assert.equal(often.ok, false);
  assert.match(!often.ok ? often.message : "", /1분 뒤/);
});

test("rpc가 실패하면(함수 없음·연결 오류) AI를 부르지 않게 거절", async () => {
  const db: any = { rpc: async () => ({ data: null, error: { message: "function not found" } }) };
  const r = await startAiRequest(db, { feature: "card_chat" }, NOW);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /기록을 남기지 못해/);
  const b = await startAiRequests(db, { feature: "report_outline" }, 2, NOW);
  assert.equal(b.ok, false);
});

test("첨부 그림 설명(material_describe)은 따로 셈: 다른 기능 기록에 막히지 않고, 그림 설명 한도(DESCRIBE_LIMITS)에 걸리면 거절", async () => {
  const others = Array.from({ length: AI_LIMITS.perMinute }, () => ({ user_id: me, feature: "card_chat", status: "running", created_at: iso(NOW - 10_000) }));
  assert.equal((await startAiRequest(fakeDb(others).db, { feature: DESCRIBE_FEATURE }, NOW)).ok, true);
  const described = Array.from({ length: DESCRIBE_LIMITS.perMinute }, () => ({ user_id: me, feature: DESCRIBE_FEATURE, status: "ok", created_at: iso(NOW - 10_000) }));
  assert.equal((await startAiRequest(fakeDb(described).db, { feature: "card_chat" }, NOW)).ok, true, "그림 설명 기록은 다른 기능 한도에 안 셈");
  const r = await startAiRequest(fakeDb(described).db, { feature: DESCRIBE_FEATURE }, NOW);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /1분 뒤/);
  const busy = Array.from({ length: DESCRIBE_LIMITS.running }, () => ({ user_id: me, feature: DESCRIBE_FEATURE, status: "running", created_at: iso(NOW - 10_000) }));
  const b = await startAiRequest(fakeDb(busy).db, { feature: DESCRIBE_FEATURE }, NOW);
  assert.match(!b.ok ? b.message : "", new RegExp(`이미 ${DESCRIBE_LIMITS.running}건`));
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

test("AI 일시 중지(start_ai_request가 paused — 20261118140000): 한 건·여러 안 모두 관리자 멈춤 안내로 거절(한도 안내가 아님), 끝맺기 함수 없음", async () => {
  assert.equal(AI_PAUSED_MESSAGE, "관리자가 AI 기능을 잠시 멈췄습니다. 잠시 뒤 다시 시도하세요.");
  const calls: string[] = [];
  const db: any = { rpc: async (fn: string) => (calls.push(fn), { data: { ok: false, paused: true }, error: null }), from: (t: string) => assert.fail(`표 직접 접근 없음(${t})`) };
  assert.deepEqual(await startAiRequest(db, { feature: "card_assist" }, NOW), { ok: false, message: AI_PAUSED_MESSAGE });
  assert.deepEqual(await startAiRequests(db, { feature: "report_outline" }, 3, NOW), { ok: false, message: AI_PAUSED_MESSAGE });
  assert.deepEqual(await startAiRequest(db, { feature: DESCRIBE_FEATURE }, NOW), { ok: false, message: AI_PAUSED_MESSAGE }, "그림 설명도");
  assert.deepEqual(calls, ["start_ai_request", "start_ai_request", "start_ai_request"]);
});
