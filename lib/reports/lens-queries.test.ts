// 경평 평가 관점 읽기(lens-queries.ts) — 선별 방식이 고른 지적·실사 자리에서도 AI 가점 실사는 관련 카드에만(bonus-scope.ts bonusDrop, 공통 지식 묶음과 같은 판정).
// 실제 DB 대신 질의를 흉내 내는 가짜 클라이언트(eq·in·like·range만 거름)와 합성 조각, 꽂은 선별 출처(setSelectionSource)를 씀.
// context.ts·lens-queries.ts는 import "server-only"라 그 모듈만 빈 모듈로 돌려 불러옵니다(context-select.test.ts와 같은 방법).
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { afterEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BundleChunk } from "../knowledge/bundle.ts";
import { clearChunkCache } from "../knowledge/chunk-cache.ts";
import { SYN_CHUNKS } from "../knowledge/fixtures/bundle-synthetic.ts";

type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { setSelectionSource } = await import("../ai/context.ts");
const { loadLens } = await import("./lens-queries.ts");

type Row = Record<string, unknown>;
type Op = [string, unknown[]];
const get = (r: Row, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (v as Row | undefined)?.[k], r);
const likeRe = (pat: string) => new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/%/g, ".*")}$`);

/** 표마다 행을 주면 eq·in·like로 거르고 range로 자르는 가짜 클라이언트. rpc(검색)는 빈 결과 */
function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
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
          return (...args: unknown[]) => builder(table, [...ops, [prop, args]]);
        },
      },
    );
  return { from: (t: string) => builder(t, []), rpc: () => Promise.resolve({ data: [] }) } as unknown as SupabaseClient;
}

/** 가점 실사 요청자료(평가 관점 유형 밖 — 연결 판정이 유형으로 거르지 않은 대응표 키 전부를 보는지 확인용) */
const BONUS_REQ: BundleChunk = { ...SYN_CHUNKS.find((c) => c.chunk_key === "att3-2604/qa/bonus/1")!, chunk_key: "att3-2604/req/bonus/1", unit_type: "request_evidence", text: "가점 요청자료" };
const CHUNKS = [...SYN_CHUNKS, BONUS_REQ];
const unitOf = new Map(CHUNKS.map((c) => [c.chunk_key, c.unit_type]));
const scope = (keys: string[]) => keys.map((chunk_key, i) => ({ card_id: "card-1", chunk_key, status: "auto", method: "ai", score: 1, rank: i + 1, basis: null, chunk: { unit_type: unitOf.get(chunk_key) } }));
const db = (linked: string[] = []) => fakeDb({ knowledge_chunks: CHUNKS as unknown as Row[], card_knowledge_scope: scope(linked) });
const AI_NONE = { ai: { text: "해당사항 없음", checked: false } };
const AI_ON = { ai: { text: "AI 안테나 자동판독", checked: true } };
const card = (evalUnitId: string, strategy?: unknown) => ({ id: "card-1", evalUnitId, data: { title: "안테나 판독", executionTask: "", ...(strategy ? { strategy } : {}) } });
/** 경평 선별 결과(꽂은 출처) — 가점 실사·이 사업 지적·실사 */
const PICK = ["att3-2604/qa/bonus/1", "plan-2607/eval25/BZ-1/e1/p01", "att3-2604/qa/BZ-1/2"];
const keys = async (c: ReturnType<typeof card>, linked: string[] = []) => (await loadLens(db(linked), c)).map((r) => `${r.group}:${r.key}`);

const saved = { select: process.env.KNOWLEDGE_SELECT, tracks: process.env.KNOWLEDGE_SELECT_TRACKS };
const restore = (key: string, v: string | undefined) => (v === undefined ? delete process.env[key] : (process.env[key] = v));
afterEach(() => {
  restore("KNOWLEDGE_SELECT", saved.select);
  restore("KNOWLEDGE_SELECT_TRACKS", saved.tracks);
  setSelectionSource(null);
  clearChunkCache();
});
const selectOn = () => {
  process.env.KNOWLEDGE_SELECT = "report";
  delete process.env.KNOWLEDGE_SELECT_TRACKS;
  setSelectionSource(async () => ({ keys: PICK, digest: { track: "t", unit: "u" } }));
};

test("평가 관점(선별): 무관 카드는 고른 조각 중 AI 가점 실사를 빼고, 관련 카드(AI활용 칸)는 그대로 넣음", async () => {
  selectOn();
  const plain = await keys(card("BZ-1", AI_NONE));
  assert.ok(plain.includes("survey:att3-2604/qa/BZ-1/2") && plain.includes("critiques:plan-2607/eval25/BZ-1/e1/p01"), "이 사업 지적·실사는 그대로");
  assert.ok(!plain.some((k) => k.endsWith("/bonus/1")), "무관 카드: 가점 실사 없음");
  const related = await keys(card("BZ-1", AI_ON));
  assert.ok(related.includes("survey:att3-2604/qa/bonus/1"), "관련 카드: 고른 순서대로 가점 실사");
  assert.deepEqual(related.filter((k) => !k.endsWith("/bonus/1")), plain, "가점 실사 말고는 같음");
});

test("평가 관점(선별): 관련 판정의 대응표 연결은 유형으로 거르지 않은 키 전부 — 평가 관점 유형 밖 요청자료만 연결돼도 관련", async () => {
  selectOn();
  assert.ok((await keys(card("BZ-1", AI_NONE), [BONUS_REQ.chunk_key])).includes("survey:att3-2604/qa/bonus/1"));
  assert.ok(!(await keys(card("BZ-1", AI_NONE), ["att3-2604/qa/BZ-1/1"])).some((k) => k.endsWith("/bonus/1")), "가점 실사가 아닌 연결은 관련 판정에 안 셈");
});

test("평가 관점(선별, 경영관리): 지표 13 카드는 가점 실사를 넣고 다른 지표 카드는 뺌", async () => {
  selectOn();
  assert.ok((await keys(card("MG-13"))).includes("survey:att3-2604/qa/bonus/1"));
  assert.ok(!(await keys(card("MG-3"))).some((k) => k.endsWith("/bonus/1")));
});

test("평가 관점: 선별이 꺼져 있으면 가점 거르기와 상관없이 예전 그대로(검색 순 자리 — 사업 없는 가점 실사는 검색에 안 걸림)", async () => {
  delete process.env.KNOWLEDGE_SELECT;
  assert.deepEqual(await keys(card("BZ-1", AI_NONE)), await keys(card("BZ-1", AI_ON)));
});
