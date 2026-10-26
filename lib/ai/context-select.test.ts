// 공통 지식 선별 방식(실험, 기본 꺼짐)의 연결: loadCardBundle·loadLens가 KNOWLEDGE_SELECT와 출처(꽂힌 것 / DB 선별 결과 표·규칙 문서)에 따라 고르는지.
// 실제 DB 대신 질의를 흉내 내는 가짜 클라이언트(eq·in·like만 거름)와 합성 조각(lib/knowledge/fixtures/bundle-synthetic.ts)을 씀.
// context.ts·lens-queries.ts는 import "server-only"라 그 모듈만 빈 모듈로 돌려 불러옵니다(run.test.ts와 같은 방법).
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { afterEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type BundleChunk, RULES_DIGEST_UNIT, buildBundle } from "../knowledge/bundle.ts";
import { clearChunkCache } from "../knowledge/chunk-cache.ts";
import { chunkHash, digestChunks, digestTarget } from "../knowledge/rules-digest.ts";
import { SELECT_MIN_KEYS } from "../knowledge/select.ts";
import { SYN_BIZ_CARD, SYN_CHUNKS } from "../knowledge/fixtures/bundle-synthetic.ts";

type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { cardSelectPreview, loadCardBundle, reportSelectPreview, setSelectionSource } = await import("./context.ts");
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

const synOf = (key: string) => SYN_CHUNKS.find((c) => c.chunk_key === key)!;
/** 규칙 문서 조각의 meta.sources = 원문 조각 key·해시(rules-digest.ts chunkHash) — 지금 원문과 같으면 낡지 않음 */
const sourcesOf = (...keys: string[]) => keys.map((key) => ({ key, hash: chunkHash(synOf(key)) }));
/** 실제 입력 범위(digestChunks — 트랙 공통 ①②·평가단위 ③ 기준류)와 같은 sources — 범위와 어긋나면 낡음(digestScopeFresh) */
const rangeSources = (id: string) => sourcesOf(...digestChunks(SYN_CHUNKS, digestTarget(id)).map((c) => c.chunk_key));
const digest = (key: string, business: string | null, text: string, sources: unknown = rangeSources("track-biz")): BundleChunk => ({
  chunk_key: key,
  doc_id: "rules-biz",
  seq: 0,
  unit_type: RULES_DIGEST_UNIT,
  track: "주요사업",
  business,
  title: key,
  text,
  context_prefix: null,
  meta: { usage: "rules_digest", sources },
});
const DIGESTS = [digest("digest/biz", null, "트랙 공통 규칙 문서"), digest("digest/BZ-1", "BZ-1", "BZ-1 규칙 문서", rangeSources("BZ-1"))];
const unitOf = new Map(SYN_CHUNKS.map((c) => [c.chunk_key, c.unit_type]));
const scope = (keys: string[], status = "auto") => keys.map((chunk_key, i) => ({ card_id: "card-1", chunk_key, status, method: "ai", score: 1, rank: i + 1, basis: null, chunk: { unit_type: unitOf.get(chunk_key) } }));
const CARD = { id: "card-1", ...SYN_BIZ_CARD };
const LINKED = ["att3-2604/qa/BZ-1/1"];
/** 선별 결과 표(card_knowledge_select)에 넣는 사례류 키 — 순위 순(SELECT_MIN_KEYS개 이상) */
const SEL = ["rpt25-biz/BZ-1/b", "plan-2607/eval25/BZ-1/e1/p02", "att3-2604/qa/BZ-1/2", "plan-2607/eval25/BZ-1/e2/p01", "rpt25-biz/BZ-1/a"];
/** 표 행 — 일부러 순위를 거꾸로 넣음(읽을 때 순위 순으로 정렬해야 함) */
const selectRows = (keys: string[]) => keys.map((chunk_key, i) => ({ card_id: "card-1", chunk_key, rank: i + 1, score: 0.9, judge: "test" })).reverse();

const db = (chunks: BundleChunk[], found: string[] = [], o: { select?: string[]; rejected?: string[] } = {}) =>
  fakeDb({ knowledge_chunks: chunks as unknown as Row[], card_knowledge_scope: [...scope(LINKED), ...scope(o.rejected ?? [], "rejected")], card_knowledge_select: selectRows(o.select ?? SEL), task_map: [] }, found);

function withEnv(v: string | undefined, key = "KNOWLEDGE_SELECT") {
  if (v === undefined) delete process.env[key];
  else process.env[key] = v;
}
const saved = process.env.KNOWLEDGE_SELECT;
const savedTracks = process.env.KNOWLEDGE_SELECT_TRACKS;
afterEach(() => {
  withEnv(saved);
  withEnv(savedTracks, "KNOWLEDGE_SELECT_TRACKS");
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

test("DB 출처: 같은 트랙 rules_digest(사업 없음 = 트랙 공통, 사업 = 평가단위)로 선별, 고른 키 = 선별 결과 표(순위 순) + 대응표(자동·확정)는 늘", async () => {
  withEnv("card,report");
  const b = await loadCardBundle(db([...SYN_CHUNKS, ...DIGESTS]), CARD, "card");
  assert.deepEqual(b.select?.digest, { track: "트랙 공통 규칙 문서", unit: "BZ-1 규칙 문서" });
  assert.deepEqual(b.select?.picked.map((r) => r.key), [...SEL, ...LINKED], "표의 순위 순 → 과제 연결");
  assert.ok(!b.select?.all.some((r) => r.unitType === RULES_DIGEST_UNIT), "규칙 문서 조각은 원문 대조 목록에도 안 섞임");
});

test("기능 단위 설정: report,chat이면 질문만 선별, 작성지원·코멘트는 통째로 넣기 / card는 셋 다 선별 / 기능을 안 넘기면 용도로만", async () => {
  const chunks = [...SYN_CHUNKS, ...DIGESTS];
  const expected = buildBundle(SYN_CHUNKS, CARD, LINKED, null, "card");
  withEnv("report,chat");
  assert.deepEqual(await loadCardBundle(db(chunks), CARD, "card", "writer"), expected, "작성지원은 통째로 넣기 그대로");
  assert.deepEqual(await loadCardBundle(db(chunks), CARD, "card", "comment"), expected, "코멘트는 통째로 넣기 그대로");
  assert.deepEqual(await loadCardBundle(db(chunks), CARD, "card"), expected, "기능을 안 넘기면 용도(card)로만 — 꺼짐");
  assert.deepEqual((await loadCardBundle(db(chunks), CARD, "card", "chat")).select?.picked.map((r) => r.key), [...SEL, ...LINKED], "질문은 선별");
  withEnv("card");
  for (const f of ["writer", "chat", "comment"] as const) assert.ok((await loadCardBundle(db(chunks), CARD, "card", f)).select, `card면 ${f}도 선별`);
  assert.ok((await loadCardBundle(db(chunks), CARD, "card")).select, "기능 없이도 그대로");
});

test("진행 줄 미리 보기(cardSelectPreview): 선별이 실제로 적용되는 기능만 고른 수, 꺼졌거나 통째로 넣기로 돌아가면 빈 값", async () => {
  const card = { id: CARD.id, evalUnitId: CARD.evalUnitId, data: CARD.data };
  withEnv("report,chat");
  const n = SEL.length + LINKED.length;
  assert.deepEqual(await cardSelectPreview(db([...SYN_CHUNKS, ...DIGESTS]), card), { chat: n });
  clearChunkCache();
  assert.deepEqual(await cardSelectPreview(db(SYN_CHUNKS), card), {}, "규칙 문서 없음 → 통째로 넣기");
  withEnv("card");
  clearChunkCache();
  assert.deepEqual(await cardSelectPreview(db([...SYN_CHUNKS, ...DIGESTS]), card), { writer: n, chat: n, comment: n });
  for (const env of [undefined, "", "report"]) {
    withEnv(env);
    assert.deepEqual(await cardSelectPreview(db([...SYN_CHUNKS, ...DIGESTS]), card), {}, String(env));
  }
});

test("규칙 문서가 없거나 기준류 자리를 다 못 대신하면 통째로 넣기(반쪽 선별 안 함)", async () => {
  withEnv("card");
  assert.equal((await loadCardBundle(db(SYN_CHUNKS), CARD, "card")).select, undefined, "규칙 문서 없음");
  clearChunkCache();
  assert.equal((await loadCardBundle(db([...SYN_CHUNKS, DIGESTS[0]]), CARD, "card")).select, undefined, "평가단위 규칙 문서 없음(③에 편람·Pool이 있음)");
});

test("경평 진행 줄 미리 보기(reportSelectPreview): report가 켜지고 선별이 실제로 적용되면 고른 수, 아니면 null", async () => {
  const card = { id: CARD.id, evalUnitId: CARD.evalUnitId, data: CARD.data };
  withEnv("report,chat");
  assert.equal(await reportSelectPreview(db([...SYN_CHUNKS, ...DIGESTS]), card), SEL.length + LINKED.length);
  assert.equal(await reportSelectPreview(db([...SYN_CHUNKS, ...DIGESTS], [], { select: [] }), card), null, "선별 행 없음 → 통째로 넣기");
  clearChunkCache();
  assert.equal(await reportSelectPreview(db(SYN_CHUNKS), card), null, "규칙 문서 없음");
  for (const env of [undefined, "", "chat", "card"]) {
    withEnv(env);
    assert.equal(await reportSelectPreview(db([...SYN_CHUNKS, ...DIGESTS]), card), null, String(env));
  }
});

test("DB 출처 선별 결과 표: 대응표 rejected 조각은 표에 있어도 빼고, 남은 수가 SELECT_MIN_KEYS 미만(0개 포함)이면 통째로 넣기", async () => {
  withEnv("report");
  const chunks = [...SYN_CHUNKS, ...DIGESTS];
  const picked = async (o: { select?: string[]; rejected?: string[] }) => (await loadCardBundle(db(chunks, [], o), CARD, "report")).select?.picked.map((r) => r.key);
  assert.equal(SELECT_MIN_KEYS, 5);
  const extra = [...SEL, "plan-2607/eval25/BZ-1/e1/p01"];
  assert.deepEqual(await picked({ select: extra, rejected: ["att3-2604/qa/BZ-1/2"] }), [...extra.filter((k) => k !== "att3-2604/qa/BZ-1/2"), ...LINKED], "rejected는 빼고 순위 순");
  assert.equal(await picked({ select: SEL, rejected: ["rpt25-biz/BZ-1/a"] }), undefined, "rejected를 빼면 4개 → 통째로 넣기");
  assert.equal(await picked({ select: SEL.slice(0, 4) }), undefined, "4개 → 통째로 넣기");
  assert.equal(await picked({ select: [] }), undefined, "선별 행 0개 → 통째로 넣기");
  assert.deepEqual(await picked({ select: SEL }), [...SEL, ...LINKED], "5개면 선별");
});

test("DB 출처 규칙 문서가 낡으면 통째로 넣기: 원문 해시가 다름 · 원문 조각이 사라짐 · sources 기록 없음", async () => {
  withEnv("report");
  const sel = async (digests: BundleChunk[], chunks = SYN_CHUNKS) => {
    clearChunkCache();
    return (await loadCardBundle(db([...chunks, ...digests]), CARD, "report")).select;
  };
  assert.ok(await sel(DIGESTS), "지금 원문과 같으면 선별");
  const changed = SYN_CHUNKS.map((c) => (c.chunk_key === "plan-2607/handbook26/BZ-1/k1" ? { ...c, text: `${c.text} 고침` } : c));
  assert.equal(await sel(DIGESTS, changed), undefined, "평가단위 규칙 문서의 원문 글이 바뀜");
  assert.equal(await sel([DIGESTS[0], digest("digest/BZ-1", "BZ-1", "BZ-1 규칙 문서", [{ key: "plan-2607/handbook26/BZ-1/gone", hash: "0000000000000000" }])]), undefined, "원문 조각이 사라짐");
  assert.equal(await sel([digest("digest/biz", null, "트랙 공통 규칙 문서", null), DIGESTS[1]]), undefined, "sources 기록 없음");
  const added: BundleChunk = { ...synOf("plan-2607/handbook26/BZ-1/k1"), chunk_key: "plan-2607/handbook26/BZ-1/new" };
  assert.equal(await sel(DIGESTS, [...SYN_CHUNKS, added]), undefined, "범위에 새 기준류 조각이 들어옴(sources에 없음)");
});

test("DB 출처 트랙(KNOWLEDGE_SELECT_TRACKS): 목록에 없는 트랙은 규칙 문서·선별 행이 있어도 통째로 넣기, 비면 모든 트랙 — 꽂은 출처에는 안 씀", async () => {
  withEnv("report");
  const sel = async () => {
    clearChunkCache();
    return (await loadCardBundle(db([...SYN_CHUNKS, ...DIGESTS]), CARD, "report")).select;
  };
  for (const tracks of [undefined, "", "주요사업", "경영관리, 주요사업"]) {
    withEnv(tracks, "KNOWLEDGE_SELECT_TRACKS");
    assert.ok(await sel(), `켜짐: ${String(tracks)}`);
  }
  withEnv("경영관리", "KNOWLEDGE_SELECT_TRACKS");
  assert.equal(await sel(), undefined, "주요사업 카드는 꺼짐");
  setSelectionSource(async () => ({ keys: ["rpt25-biz/BZ-1/b"], digest: { track: "파일 트랙", unit: "파일 BZ-1" } }));
  assert.ok(await sel(), "꽂은 출처(실험)는 트랙 설정·최소 개수와 상관없이");
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
