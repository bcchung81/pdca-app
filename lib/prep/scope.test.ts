import assert from "node:assert/strict";
import { test } from "node:test";
import { displayKeys, isDecided, planScopeWrites, scopeRowsFromLinks, type LinkRow } from "./scope.ts";
import type { ScopeRow } from "./types.ts";

const row = (chunk_key: string, over: Partial<ScopeRow> = {}): ScopeRow => ({
  card_id: "C1",
  chunk_key,
  status: "auto",
  method: "ai",
  score: null,
  rank: null,
  basis: null,
  ...over,
});

test("displayKeys: auto·confirmed만, 순위 순(없으면 뒤) → 키 순, 중복 없음", () => {
  const keys = displayKeys([
    row("k-c", { rank: null }),
    row("k-b", { rank: 2 }),
    row("k-a", { rank: 1, status: "confirmed" }),
    row("k-x", { rank: 0, status: "candidate" }),
    row("k-y", { rank: 0, status: "rejected" }),
    row("k-b", { rank: 2 }),
  ]);
  assert.deepEqual(keys, ["k-a", "k-b", "k-c"]);
});

test("isDecided: 확정·뺌만 사람이 정한 상태", () => {
  assert.ok(isDecided("confirmed") && isDecided("rejected"));
  assert.ok(!isDecided("auto") && !isDecided("candidate"));
});

test("planScopeWrites: 새로 맞은 조각은 auto로 넣고, 다시 맞으면 점수만 바꾸고, 평가 범위에서 빠진 옛 자동 행은 지운다", () => {
  const existing = [row("k-old"), row("k-keep", { score: 0.1 }), row("k-outside")];
  const plan = planScopeWrites("C1", existing, new Set(["k-old", "k-keep", "k-new"]), [
    { chunkKey: "k-new", basis: "새 근거" },
    { chunkKey: "k-keep", score: 0.9, basis: "다시" },
  ], "ai");
  assert.deepEqual(plan.insert.map((r) => [r.chunk_key, r.status, r.method, r.basis]), [["k-new", "auto", "ai", "새 근거"]]);
  assert.deepEqual(plan.update.map((r) => [r.chunk_key, r.score]), [["k-keep", 0.9]]);
  assert.deepEqual(plan.remove, ["k-old"], "평가 범위 밖(k-outside)은 그대로");
});

test("planScopeWrites: 확정·뺌 행은 이번에 맞든 안 맞든 손대지 않는다", () => {
  const existing = [row("k-conf", { status: "confirmed" }), row("k-rej", { status: "rejected" }), row("k-conf2", { status: "confirmed" })];
  const plan = planScopeWrites("C1", existing, new Set(["k-conf", "k-rej", "k-conf2"]), [
    { chunkKey: "k-conf", basis: "b" },
    { chunkKey: "k-rej", basis: "b" },
  ], "ai");
  assert.deepEqual(plan, { insert: [], update: [], remove: [] });
});

test("planScopeWrites: 다른 method의 자동 행은 손대지 않는다(규칙이 AI보다 앞)", () => {
  const existing = [row("k-rule", { method: "rule" }), row("k-rule-gone", { method: "rule" })];
  const plan = planScopeWrites("C1", existing, new Set(["k-rule", "k-rule-gone"]), [{ chunkKey: "k-rule", basis: "ai가 맞춤" }], "ai");
  assert.deepEqual(plan, { insert: [], update: [], remove: [] });
});

test("planScopeWrites: 같은 조각이 여러 번 맞으면 점수가 높은 쪽 한 건, 후보 상태는 그대로 넣는다", () => {
  const plan = planScopeWrites("C1", [], new Set(["k1"]), [
    { chunkKey: "k1", score: 0.3, basis: "낮음", status: "candidate" },
    { chunkKey: "k1", score: 0.8, basis: "높음" },
  ], "rule");
  assert.equal(plan.insert.length, 1);
  assert.equal(plan.insert[0].basis, "높음");
  assert.equal(plan.insert[0].method, "rule");
  const cand = planScopeWrites("C1", [], new Set(["k2"]), [{ chunkKey: "k2", basis: "후보", status: "candidate" }], "rule");
  assert.equal(cand.insert[0].status, "candidate");
});

const link = (over: Partial<LinkRow>): LinkRow => ({
  card_id: "C1",
  finding_index: 0,
  chunk_key: "X",
  finding_no: 0,
  card_finding: "지적",
  method: "finding_3gram",
  score: 0.5,
  basis: null,
  rank: 1,
  status: "auto",
  ...over,
});

test("scopeRowsFromLinks: (과제, 조각)마다 한 행 — 사람이 정한 것이 먼저(confirmed > rejected > auto > candidate), 지적 정보는 meta에", () => {
  const rows = scopeRowsFromLinks([
    link({ finding_index: 0, status: "auto", rank: 2 }),
    link({ finding_index: 1, status: "confirmed", rank: 1, card_finding: "확정된 지적" }),
    link({ finding_index: 2, status: "rejected", rank: 1 }),
    link({ chunk_key: "Y", status: "candidate" }),
    link({ card_id: "C2", status: "rejected" }),
  ]);
  const by = new Map(rows.map((r) => [`${r.card_id}/${r.chunk_key}`, r]));
  assert.equal(rows.length, 3);
  assert.equal(by.get("C1/X")?.status, "confirmed");
  assert.equal((by.get("C1/X")?.meta as { card_finding: string }).card_finding, "확정된 지적");
  assert.equal(by.get("C1/Y")?.status, "candidate");
  assert.equal(by.get("C2/X")?.status, "rejected");
  assert.ok(rows.every((r) => r.method === "rule"));
});

test("scopeRowsFromLinks: 같은 상태끼리는 순위 → 점수 순으로 고른다", () => {
  const [r] = scopeRowsFromLinks([
    link({ finding_index: 0, rank: 3, score: 0.9 }),
    link({ finding_index: 1, rank: 1, score: 0.4, basis: "순위 1" }),
    link({ finding_index: 2, rank: 1, score: 0.7, basis: "순위 1·점수 높음" }),
  ]);
  assert.equal(r.basis, "순위 1·점수 높음");
});
