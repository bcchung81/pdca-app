import assert from "node:assert/strict";
import { test } from "node:test";
import type { BundleChunk } from "../../knowledge/bundle.ts";
import type { MatchResult } from "../../ai/match.ts";
import { FakeDb, fakePrepStore } from "../fake-db.ts";
import type { PrepJob } from "../types.ts";
import { type MatchCallResult, type MatchKnowledgeDeps, matchKnowledgeHandler } from "./match-knowledge.ts";

const chunk = (chunk_key: string, over: Partial<BundleChunk> = {}): BundleChunk => ({
  chunk_key,
  doc_id: "att3-2604",
  seq: 0,
  unit_type: "qa_pair",
  track: "주요사업",
  business: "BZ-1",
  title: chunk_key,
  text: `글 ${chunk_key}`,
  context_prefix: null,
  meta: null,
  ...over,
});
const CHUNKS = [
  chunk("q1", { seq: 1 }),
  chunk("q2", { seq: 2 }),
  chunk("q3", { seq: 3 }),
  chunk("q-other-biz", { seq: 4, business: "BZ-2" }),
  chunk("rpt1", { doc_id: "rpt25-biz", unit_type: "report_section" }),
];
const USAGE = { input: 100, output: 10, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 };
const ok = (matches: MatchResult["matches"]): MatchCallResult => ({ result: { matches }, model: "claude-sonnet-5", provider: "api", usage: USAGE });
const job = (over: Partial<PrepJob> = {}): PrepJob => ({ id: 7, kind: "match_knowledge", target: "C1", payload: {}, status: "running", attempts: 1, requested_by: "user-1", ...over });
const scopeRow = (chunk_key: string, over: Record<string, unknown> = {}) => ({ card_id: "C1", chunk_key, status: "auto", method: "ai", score: null, rank: 1, basis: "옛 근거", ...over });
const newDb = (scope: Array<Record<string, unknown>> = []) =>
  new FakeDb({ cards: [{ id: "C1", eval_unit_id: "BZ-1", status: "active", data: { title: "과제" } }], card_knowledge_scope: scope, ai_requests: [] });

function run(db: FakeDb, call: MatchKnowledgeDeps["call"], jobOver: Partial<PrepJob> = {}, maxChars?: number) {
  const handler = matchKnowledgeHandler({ call, loadChunks: async () => CHUNKS, maxChars });
  return handler({ store: fakePrepStore(db), job: job(jobOver) });
}

test("조각은 카드의 트랙(평가단위에서 정함)으로 읽는다 — 주요사업 카드는 주요사업 트랙, 경영관리 카드(MG-…)는 경영관리 트랙", async () => {
  for (const [unit, track] of [["BZ-1", "주요사업"], ["MG-G1", "경영관리"]] as const) {
    const db = new FakeDb({ cards: [{ id: "C1", eval_unit_id: unit, status: "active", data: { title: "과제" } }], card_knowledge_scope: [], ai_requests: [] });
    const asked: string[] = [];
    const handler = matchKnowledgeHandler({ call: async () => ok([]), loadChunks: async (_s, t) => (asked.push(t.id), []) });
    await handler({ store: fakePrepStore(db), job: job() });
    assert.deepEqual(asked, [track], unit);
  }
});

test("맞은 조각을 auto·ai로 넣고 순서대로 rank, 호출은 토큰만 ai_requests에 남긴다(작업을 건 사람·작업 번호 포함)", async () => {
  const db = newDb();
  const seen: string[][] = [];
  const out = await run(db, async ({ group }) => (seen.push(group.map((c) => c.chunk_key)), ok([{ key: "q2", certainty: "high", basis: "지표가 같음" }, { key: "rpt1", certainty: "high", basis: "같은 실행과제 절" }, { key: "없음", certainty: "high", basis: "지어냄" }])));
  assert.deepEqual(seen, [["q1", "q2", "q3", "rpt1"]], "다른 사업 조각은 후보가 아님");
  assert.deepEqual(db.rows("card_knowledge_scope").map((r) => [r.chunk_key, r.status, r.method, r.rank, r.basis]), [["q2", "auto", "ai", 1, "지표가 같음"], ["rpt1", "auto", "ai", 2, "같은 실행과제 절"]]);
  assert.equal(db.rows("ai_requests").length, 1);
  const logged = { ...db.rows("ai_requests")[0] };
  assert.ok(typeof logged.duration_ms === "number" && logged.duration_ms >= 0 && logged.finished_at, "소요 시간·끝난 시각이 남음");
  delete logged.duration_ms;
  delete logged.finished_at;
  assert.deepEqual(logged, { user_id: "user-1", card_id: "C1", job_id: 7, feature: "prep_match", mode: "match_knowledge", model: "claude-sonnet-5", status: "ok", input_tokens: 100, output_tokens: 10, cache_read_tokens: 0, cache_write_tokens: 0, cache_write_1h_tokens: 0 });
  assert.deepEqual(out?.progress, { candidates: 4, groups: 1, hits: 2, dropped: 1, inserted: 2, updated: 0, removed: 0 });
});

test("사람이 확정·뺀 행은 AI가 어떻게 답해도 그대로(맞다고 해도 안 덮고, 안 맞다고 해도 안 지움)", async () => {
  const db = newDb([scopeRow("q1", { status: "confirmed", basis: "사람이 확정", method: "human" }), scopeRow("q2", { status: "rejected", basis: "사람이 뺌" }), scopeRow("q3", { status: "confirmed", basis: "확정2" })]);
  await run(db, async () => ok([{ key: "q1", certainty: "high", basis: "AI가 다시 맞춤" }, { key: "q2", certainty: "high", basis: "AI가 다시 맞춤" }]));
  const by = new Map(db.rows("card_knowledge_scope").map((r) => [r.chunk_key, r]));
  assert.deepEqual([by.get("q1")?.status, by.get("q1")?.basis], ["confirmed", "사람이 확정"]);
  assert.deepEqual([by.get("q2")?.status, by.get("q2")?.basis], ["rejected", "사람이 뺌"]);
  assert.equal(by.get("q3")?.status, "confirmed", "안 맞다고 해도 확정은 안 지움");
});

test("다시 매칭: 평가 범위 안에서 빠진 옛 AI 행은 지우고, 범위 밖(다른 문서)·다른 method(규칙) 행은 남기고, 다시 맞으면 근거만 바꾼다", async () => {
  const db = newDb([scopeRow("q1", { basis: "옛" }), scopeRow("q3"), scopeRow("rpt1", { method: "rule", basis: "규칙" }), scopeRow("outside-doc")]);
  await run(db, async () => ok([{ key: "q1", certainty: "high", basis: "새 근거" }]), { payload: { docIds: ["att3-2604"] } });
  const by = new Map(db.rows("card_knowledge_scope").map((r) => [r.chunk_key, r]));
  assert.equal(by.get("q1")?.basis, "새 근거");
  assert.ok(!by.has("q3"), "이번 범위에서 빠짐 → 지움");
  assert.equal(by.get("rpt1")?.basis, "규칙", "범위 밖(다른 문서) + 규칙 행");
  assert.ok(by.has("outside-doc"), "평가 범위 밖은 지우지 않음");
});

test("문서 지정(payload.docIds)이면 그 문서 조각만 물어본다", async () => {
  const db = newDb();
  const seen: string[][] = [];
  await run(db, async ({ group }) => (seen.push(group.map((c) => c.chunk_key)), ok([])), { payload: { docIds: ["rpt25-biz"] } });
  assert.deepEqual(seen, [["rpt1"]]);
});

test("조각이 많아 묶음이 여럿이면 묶음마다 부르고 rank가 이어진다(자르지 않음)", async () => {
  const db = newDb();
  const seen: string[][] = [];
  const out = await run(db, async ({ group }) => (seen.push(group.map((c) => c.chunk_key)), ok(group.map((c) => ({ key: c.chunk_key, certainty: "high" as const, basis: `근거 ${c.chunk_key}` })))), {}, 400);
  assert.ok(seen.length >= 2, `묶음이 나뉨: ${JSON.stringify(seen)}`);
  assert.deepEqual(seen.flat(), ["q1", "q2", "q3", "rpt1"], "빠짐·중복 없이 전부");
  assert.deepEqual(db.rows("card_knowledge_scope").map((r) => r.rank).sort(), [1, 2, 3, 4]);
  assert.equal(db.rows("ai_requests").length, seen.length, "호출마다 기록");
  assert.equal((out?.progress as { groups: number }).groups, seen.length);
});

test("둘째 묶음 호출이 실패하면 던지고 대응표는 그대로(옛 자동 행도 안 지움), 성공한 호출·실패 호출은 모두 기록된다", async () => {
  const db = newDb([scopeRow("q3", { basis: "옛" })]);
  let n = 0;
  await assert.rejects(
    () =>
      run(db, async ({ group }) => {
        if (++n === 2) throw new Error("모델 오류");
        return ok(group.map((c) => ({ key: c.chunk_key, certainty: "high" as const, basis: "b" })));
      }, {}, 400),
    /모델 오류/,
  );
  assert.deepEqual(db.rows("card_knowledge_scope").map((r) => [r.chunk_key, r.basis]), [["q3", "옛"]]);
  assert.deepEqual(db.rows("ai_requests").map((r) => r.status), ["ok", "error"]);
  assert.equal(db.rows("ai_requests")[1].error, "모델 오류");
  assert.ok(!db.writes.some((w) => w.table === "card_knowledge_scope"), "실패하면 대응표에 쓰지 않음");
});

test("읽은 뒤 쓰기 전에 사람이 확정해도 덮거나 지우지 않는다(쓰는 순간에도 상태 조건)", async () => {
  const db = newDb([scopeRow("q1", { basis: "옛" }), scopeRow("q3", { basis: "옛" })]);
  // 처리기가 대응표를 읽은 직후, 성과관리팀이 q1(다시 맞을 행)·q3(지워질 행)을 확정
  db.afterSelect.card_knowledge_scope = () => {
    for (const r of db.rows("card_knowledge_scope")) r.status = "confirmed";
    delete db.afterSelect.card_knowledge_scope;
  };
  await run(db, async () => ok([{ key: "q1", certainty: "high", basis: "새 근거" }]));
  assert.deepEqual(db.rows("card_knowledge_scope").map((r) => [r.chunk_key, r.status, r.basis]), [["q1", "confirmed", "옛"], ["q3", "confirmed", "옛"]]);
});

test("없는·보관한 카드와 후보 조각이 없는 카드는 모델을 부르지 않고 끝낸다", async () => {
  let called = 0;
  const call = async () => (called++, ok([]));
  const missing = await run(new FakeDb({ cards: [] }), call);
  assert.deepEqual(missing?.progress, { skipped: "카드 없음" });
  const retired = await run(new FakeDb({ cards: [{ id: "C1", eval_unit_id: "BZ-1", status: "retired", data: {} }] }), call);
  assert.deepEqual(retired?.progress, { skipped: "보관한 카드" });
  const none = await run(newDb(), call, { payload: { docIds: ["없는-문서"] } });
  assert.deepEqual(none?.progress, { candidates: 0, hits: 0 });
  assert.equal(called, 0);
});

test("처리기는 대응표·ai_requests만 쓴다 — 카드·조각은 읽기만", async () => {
  const db = newDb();
  await run(db, async () => ok([{ key: "q1", certainty: "high", basis: "b" }]));
  assert.deepEqual([...new Set(db.writes.map((w) => w.table))].sort(), ["ai_requests", "card_knowledge_scope"]);
});

test("확신은 auto, 애매는 candidate(후보)로 넣고, 다시 매칭에서 후보가 확신으로 바뀌면 상태도 바꾼다", async () => {
  const db = newDb([scopeRow("q3", { status: "candidate", basis: "옛 후보" })]);
  await run(db, async () => ok([{ key: "q1", certainty: "high", basis: "확실" }, { key: "q2", certainty: "unsure", basis: "애매: 사안이 겹칠 수 있음" }, { key: "q3", certainty: "high", basis: "이번엔 확실" }]));
  const by = new Map(db.rows("card_knowledge_scope").map((r) => [r.chunk_key, r]));
  assert.deepEqual([by.get("q1")?.status, by.get("q1")?.method], ["auto", "ai"]);
  assert.deepEqual([by.get("q2")?.status, by.get("q2")?.basis], ["candidate", "애매: 사안이 겹칠 수 있음"]);
  assert.equal(by.get("q3")?.status, "auto", "후보였던 행이 확신으로 바뀜");
});
