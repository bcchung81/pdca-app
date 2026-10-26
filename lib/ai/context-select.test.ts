// 공통 지식 선별 방식(실험, 기본 꺼짐)의 연결: loadCardBundle·loadLens가 KNOWLEDGE_SELECT와 출처(꽂힌 것 / DB 규칙 문서)에 따라 고르는지.
// 실제 DB 대신 질의를 흉내 내는 가짜 클라이언트(eq·in·like만 거름)와 합성 조각(lib/knowledge/fixtures/bundle-synthetic.ts)을 씀.
// context.ts·lens-queries.ts는 import "server-only"라 그 모듈만 빈 모듈로 돌려 불러옵니다(run.test.ts와 같은 방법).
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { afterEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type BundleChunk, RULES_DIGEST_UNIT, buildBundle } from "../knowledge/bundle.ts";
import { clearChunkCache } from "../knowledge/chunk-cache.ts";
import { SYN_BIZ_CARD, SYN_CHUNKS } from "../knowledge/fixtures/bundle-synthetic.ts";

type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { loadCardBundle, setSelectionSource } = await import("./context.ts");
const { loadLens } = await import("../reports/lens-queries.ts");

type Op = [string, unknown[]];
type Row = Record<string, unknown>;
const get = (r: Row, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (v as Row | undefined)?.[k], r);
const likeRe = (pat: string) => new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/%/g, ".*")}$`);

/** 표마다 행을 주면 eq·in·like로 거르고 range로 자르는 가짜 클라이언트. rpc는 found를 돌려줌 */
function fakeDb(tables: Record<string, Row[]>, found: string[] = []): SupabaseClient {
  const run = (table: string, ops: Op[]) => {
    let rows = tables[table] ?? [];
    for (const [op, args] of ops) {
      if (op === "eq") rows = rows.filter((r) => get(r, String(args[0])) === args[1]);
      if (op === "in") rows = rows.filter((r) => (args[1] as unknown[]).includes(get(r, String(args[0]))));
      if (op === "like") rows = rows.filter((r) => likeRe(String(args[1])).test(String(get(r, String(args[0])))));
      if (op === "range") rows = rows.slice(Number(args[0]), Number(args[1]) + 1);
    }
    return rows;
  };
  const builder = (table: string, ops: Op[]): unknown =>
    new Proxy(
      {},
      {
        get(_, prop: string) {
          if (prop === "then") return (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve({ data: run(table, ops), error: null }).then(ok, fail);
          if (prop === "maybeSingle") return () => Promise.resolve({ data: run(table, ops)[0] ?? null, error: null });
          return (...args: unknown[]) => builder(table, [...ops, [prop, args]]);
        },
      },
    );
  return { from: (t: string) => builder(t, []), rpc: () => Promise.resolve({ data: found.map((chunk_key) => ({ chunk_key })) }) } as unknown as SupabaseClient;
}

const digest = (key: string, business: string | null, text: string): BundleChunk => ({ chunk_key: key, doc_id: "digest", seq: 0, unit_type: RULES_DIGEST_UNIT, track: "주요사업", business, title: key, text, context_prefix: null, meta: null });
const DIGESTS = [digest("digest/biz", null, "트랙 공통 규칙 문서"), digest("digest/BZ-1", "BZ-1", "BZ-1 규칙 문서")];
const unitOf = new Map(SYN_CHUNKS.map((c) => [c.chunk_key, c.unit_type]));
const scope = (keys: string[]) => keys.map((chunk_key, i) => ({ card_id: "card-1", chunk_key, status: "auto", method: "ai", score: 1, rank: i + 1, basis: null, chunk: { unit_type: unitOf.get(chunk_key) } }));
const CARD = { id: "card-1", ...SYN_BIZ_CARD };
const LINKED = ["att3-2604/qa/BZ-1/1"];

const db = (chunks: BundleChunk[], found: string[] = []) => fakeDb({ knowledge_chunks: chunks as unknown as Row[], card_knowledge_scope: scope(LINKED), task_map: [] }, found);

function withEnv(v: string | undefined) {
  if (v === undefined) delete process.env.KNOWLEDGE_SELECT;
  else process.env.KNOWLEDGE_SELECT = v;
}
const saved = process.env.KNOWLEDGE_SELECT;
afterEach(() => {
  withEnv(saved);
  setSelectionSource(null);
  clearChunkCache();
});

test("설정이 꺼져 있으면(비었거나 다른 용도만) 통째로 넣기 묶음 그대로 — 규칙 문서가 적재돼 있어도", async () => {
  const expected = buildBundle(SYN_CHUNKS, CARD, LINKED, null, "card");
  for (const env of [undefined, "", "report"]) {
    withEnv(env);
    clearChunkCache();
    const b = await loadCardBundle(db([...SYN_CHUNKS, ...DIGESTS]), CARD, "card");
    assert.equal(b.select, undefined, String(env));
    assert.deepEqual(b, expected);
  }
});

test("DB 출처: 같은 트랙 rules_digest(사업 없음 = 트랙 공통, 사업 = 평가단위)로 선별, 고른 키 = 대응표(자동·확정)", async () => {
  withEnv("card,report");
  const b = await loadCardBundle(db([...SYN_CHUNKS, ...DIGESTS]), CARD, "card");
  assert.deepEqual(b.select?.digest, { track: "트랙 공통 규칙 문서", unit: "BZ-1 규칙 문서" });
  assert.deepEqual(b.select?.picked.map((r) => r.key), LINKED);
  assert.ok(!b.select?.all.some((r) => r.unitType === RULES_DIGEST_UNIT), "규칙 문서 조각은 원문 대조 목록에도 안 섞임");
});

test("규칙 문서가 없거나 기준류 자리를 다 못 대신하면 통째로 넣기(반쪽 선별 안 함)", async () => {
  withEnv("card");
  assert.equal((await loadCardBundle(db(SYN_CHUNKS), CARD, "card")).select, undefined, "규칙 문서 없음");
  clearChunkCache();
  assert.equal((await loadCardBundle(db([...SYN_CHUNKS, DIGESTS[0]]), CARD, "card")).select, undefined, "평가단위 규칙 문서 없음(③에 편람·Pool이 있음)");
});

test("꽂은 출처가 DB보다 앞서고, 출처가 null이면 통째로 넣기", async () => {
  withEnv("card");
  const calls: unknown[] = [];
  setSelectionSource(async (card) => {
    calls.push(card);
    return { keys: ["rpt25-biz/BZ-1/b"], digest: { track: "파일 트랙", unit: "파일 BZ-1" } };
  });
  const b = await loadCardBundle(db([...SYN_CHUNKS, ...DIGESTS]), CARD, "card");
  assert.deepEqual(calls, [{ id: "card-1", evalUnitId: "BZ-1", unit: "BZ-1" }]);
  assert.deepEqual(b.select?.digest, { track: "파일 트랙", unit: "파일 BZ-1" });
  assert.deepEqual(b.select?.picked.map((r) => r.key), ["rpt25-biz/BZ-1/b", ...LINKED]);
  setSelectionSource(async () => null);
  clearChunkCache();
  assert.equal((await loadCardBundle(db([...SYN_CHUNKS, ...DIGESTS]), CARD, "card")).select, undefined);
});

test("평가 관점: 경평에 선별이 있으면 검색 순 대신 고른 지적·실사 조각 순서, 없으면 검색 순 그대로", async () => {
  const found = ["att3-2604/qa/BZ-1/2"];
  const keys = async () => (await loadLens(db([...SYN_CHUNKS, ...DIGESTS], found), CARD)).map((r) => `${r.group}:${r.key}`);
  withEnv(undefined);
  const off = await keys();
  assert.ok(off.includes("survey:att3-2604/qa/BZ-1/2"), "꺼짐: 검색 결과");
  withEnv("report");
  setSelectionSource(async () => ({ keys: ["rpt25-biz/BZ-1/a", "att3-2604/BZ-4/Q1", "plan-2607/eval25/BZ-1/e1/p01", "att3-2604/qa/BZ-2/1"], digest: { track: "t", unit: "u" } }));
  clearChunkCache();
  const on = await keys();
  assert.ok(!on.includes("survey:att3-2604/qa/BZ-1/2"), "검색 결과 대신");
  assert.ok(on.includes("survey:att3-2604/BZ-4/Q1") && on.includes("critiques:plan-2607/eval25/BZ-1/e1/p01"), "고른 지적·실사");
  assert.ok(!on.some((k) => k.endsWith("rpt25-biz/BZ-1/a") || k.endsWith("qa/BZ-2/1")), "지적·실사가 아닌 것·범위 밖은 안 넣음");
  assert.deepEqual(on.filter((k) => !k.startsWith("survey:") && !k.startsWith("critiques:")), off.filter((k) => !k.startsWith("survey:") && !k.startsWith("critiques:")), "기준·사례 묶음은 그대로");
  withEnv("card");
  clearChunkCache();
  assert.deepEqual(await keys(), off, "경평이 선별 대상이 아니면 그대로");
});
