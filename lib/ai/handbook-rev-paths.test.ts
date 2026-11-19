// 편람 수정본 조각(hb26r-2611 — 2026-11-19 D1·D2)이 옛 편람 조각(plan-2607 handbook26)이 가던 곳에 똑같이 가는지 경로마다 확인합니다.
// 작성지원·질문·코멘트(공통 지식 묶음 card) · 경평 초안(묶음 report + 평가 관점) · 월간 점검(주요사업·경영관리) · 숫자 근거(knownNumbers에 안 넣음 — 옛 편람 조각과 같게).
// 지표 단위 표지(unit-parts-mg.ts)는 lib/reports/unit-parts-mg.test.ts, 공통지표 소속·층 일치(실제 조각)는 lib/knowledge/parsers/handbook-rev.test.ts.
// 조각은 합성(기관 원문 아님). context.ts·lens-queries.ts는 import "server-only"라 그 모듈만 빈 모듈로 돌려 불러옵니다(context-select.test.ts와 같은 방법).
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type BundleChunk, bundleRefs, buildBundle } from "../knowledge/bundle.ts";
import { pickLens } from "../reports/lens.ts";
import { draftEvidence, knownNumbers } from "../reports/section.ts";

type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { gatherInspectionKnowledge } = await import("./context.ts");
const { loadLens } = await import("../reports/lens-queries.ts");

const REV = { revision: "2026.11.13" };
const c = (over: Partial<BundleChunk> & { chunk_key: string }): BundleChunk => ({
  doc_id: "plan-2607",
  seq: 0,
  unit_type: "handbook_indicator",
  track: "주요사업",
  business: null,
  title: `제목 ${over.chunk_key}`,
  text: `글 ${over.chunk_key}`,
  context_prefix: `위치 ${over.chunk_key}`,
  meta: null,
  ...over,
});
const rev = (over: Partial<BundleChunk> & { chunk_key: string; supersedes: string[] }) => {
  const { supersedes, ...rest } = over;
  return c({ doc_id: "hb26r-2611", meta: { ...REV, supersedes }, ...rest });
};

const CHUNKS: BundleChunk[] = [
  c({ chunk_key: "plan-2607/handbook26/common/c2", seq: 1, text: "평가내용2 집행" }),
  c({ chunk_key: "plan-2607/handbook26/BZ-2", seq: 77, business: "BZ-2", text: "주요사업2 배점 18점" }),
  c({ chunk_key: "plan-2607/handbook26/BZ-2/m1", seq: 75, business: "BZ-2", measure: "계량", text: "복합지표 8점" } as Partial<BundleChunk> & { chunk_key: string }),
  c({ chunk_key: "plan-2607/handbook26/BZ-1", seq: 74, business: "BZ-1", text: "주요사업1 20점" }),
  c({ chunk_key: "plan-2607/handbook26/BZ-4", seq: 5, business: "BZ-4", text: "공통지표 편람" }),
  c({ chunk_key: "plan-2607/narr/II/ref2/s2", seq: 60, unit_type: "plan_section", text: "개선(안) 표" }),
  c({ chunk_key: "plan-2607/handbook26/MG-3/k1", seq: 378, track: "경영관리", business: "MG-3", title: "'26 편람 · 일자리 및 균등한 기회 · 계량 (1/2)", text: "옛 계량" }),
  c({ chunk_key: "plan-2607/handbook26/MG-3/k2", seq: 379, track: "경영관리", business: "MG-3", title: "'26 편람 · 일자리 및 균등한 기회 · 비계량 (2/2)", text: "옛 비계량" }),
  c({ chunk_key: "plan-2607/handbook26/MG/1-3/k1", seq: 300, track: "경영관리", business: null, text: "경영관리 공통 편람" }),
  rev({ chunk_key: "hb26r-2611/handbook26/BZ-2", seq: 8, business: "BZ-2", text: "수정 구성 검사 성과 4점", supersedes: ["plan-2607/handbook26/BZ-2"] }),
  rev({ chunk_key: "hb26r-2611/handbook26/BZ-2/m2", seq: 10, business: "BZ-2", text: "수정 신설 지표 가중치 2점 산식 77.7", supersedes: ["plan-2607/handbook26/BZ-2/m1"] }),
  rev({ chunk_key: "hb26r-2611/handbook26/MG-3/k2", seq: 1, track: "경영관리", business: "MG-3", title: "'26 편람(11.13 수정) · 일자리 및 균등한 기회 · 비계량 (2/2)", text: "수정 비계량 ⑥ 공정채용", supersedes: ["plan-2607/handbook26/MG-3/k2"] }),
  // 경영관리 평가 관점 공통 키(lens.ts MG_LENS_CRITERIA_KEYS)
  ...["plan-2607/narr/I/2/s1", "plan-2607/narr/I/2/s2", "plan-2607/narr/II/ref3/s1", "plan-2607/narr/II/ref3/s2"].map((k, i) => c({ chunk_key: k, seq: 10 + i, unit_type: "plan_section", text: `공통 ${k}` })),
];

/** knowledge_chunks·knowledge_documents 등을 흉내 냄 — eq·in·like·or(eq·is.null·like·in)를 거름. 나머지 표는 빈 행, rpc는 빈 결과 */
function fakeDb(rows: BundleChunk[]): SupabaseClient {
  const get = (r: Record<string, unknown>, k: string) => r[k];
  const like = (pat: string) => new RegExp(`^${pat.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&").replace(/%/g, ".*")}$`);
  const orMatch = (r: Record<string, unknown>, expr: string) =>
    expr.split(/,(?![^()]*\))/).some((cond) => {
      const [field, op, ...rest] = cond.split(".");
      const v = rest.join(".");
      if (op === "eq") return String(get(r, field)) === v;
      if (op === "is" && v === "null") return get(r, field) == null;
      if (op === "like") return like(v).test(String(get(r, field)));
      if (op === "in") return v.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(get(r, field)));
      throw new Error(`가짜 DB가 모르는 or 조건: ${cond}`);
    });
  const run = (table: string, ops: Array<[string, unknown[]]>) => {
    let out: Record<string, unknown>[] = table === "knowledge_chunks" ? (rows as unknown as Record<string, unknown>[]) : table === "knowledge_documents" ? [{ doc_id: "plan-2607", title: "2026년도 경영평가 관리계획" }, { doc_id: "hb26r-2611", title: "2026년도 경영평가편람 수정 신구대비표(2026.11.13)" }] : [];
    for (const [op, args] of ops) {
      if (op === "eq") out = out.filter((r) => get(r, String(args[0])) === args[1]);
      if (op === "in") out = out.filter((r) => (args[1] as unknown[]).includes(get(r, String(args[0]))));
      if (op === "like") out = out.filter((r) => like(String(args[1])).test(String(get(r, String(args[0])))));
      if (op === "or") out = out.filter((r) => orMatch(r, String(args[0])));
      if (op === "order") out = [...out].sort((a, b) => Number(a[String(args[0])]) - Number(b[String(args[0])]));
    }
    return out;
  };
  const builder = (table: string, ops: Array<[string, unknown[]]>): unknown =>
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

const CARD = { title: "", executionTask: "" };

test("작성지원·질문·코멘트·경평 초안(공통 지식 묶음): 수정본 조각은 옛 편람 조각과 같은 ③ 층에 들고, 다른 사업·트랙 과제에는 안 들어감", () => {
  for (const purpose of ["card", "report"] as const) {
    const keys = (unit: string) => bundleRefs(buildBundle(CHUNKS, { evalUnitId: unit, data: CARD }, [], null, purpose)).map((r) => r.key);
    const bz2 = buildBundle(CHUNKS, { evalUnitId: "BZ-2", data: CARD }, [], null, purpose);
    const own = bz2.layers.find((l) => l.id === "business")!.refs.map((r) => r.key);
    assert.ok(own.includes("hb26r-2611/handbook26/BZ-2") && own.includes("plan-2607/handbook26/BZ-2"), purpose);
    assert.ok(own.indexOf("hb26r-2611/handbook26/BZ-2") > own.indexOf("plan-2607/handbook26/BZ-2/m1"), "같은 층 안에서 관리계획 다음 문서 순(DOC_ORDER)");
    assert.ok(!keys("BZ-1").some((k) => k.startsWith("hb26r-2611/")), "주요사업1 과제에는 수정본 조각 없음");
    assert.ok(keys("MG-3").includes("hb26r-2611/handbook26/MG-3/k2") && !keys("MG-3").some((k) => k.includes("/BZ-")), "경영관리 과제는 그 지표 수정본만");
    assert.ok(!keys("MG-4").includes("hb26r-2611/handbook26/MG-3/k2"));
    const where = (k: string) => bundleRefs(bz2).find((r) => r.key === k)!.where!;
    assert.match(where("hb26r-2611/handbook26/BZ-2"), /^위치 hb26r-2611\/handbook26\/BZ-2 · ※ '26 편람 11\.13 수정본.*이 판이 유효/);
    assert.match(where("plan-2607/handbook26/BZ-2"), /※ 11\.13 수정본 기준: 배점 18점 그대로/);
    assert.match(where("plan-2607/narr/II/ref2/s2"), /※ 7월판 개선\(안\) — 11\.13 수정본에서 다르게 확정됨/);
  }
});

test("월간 점검(주요사업): 그 사업 편람 조각과 함께 수정본 조각이 들어가고, 위치 글에 판 표지가 붙음 — 다른 사업 수정본은 빠짐", async () => {
  const refs = await gatherInspectionKnowledge(fakeDb(CHUNKS), "BZ-2");
  const keys = refs.map((r) => r.key);
  for (const k of ["hb26r-2611/handbook26/BZ-2", "hb26r-2611/handbook26/BZ-2/m2", "plan-2607/handbook26/BZ-2", "plan-2607/handbook26/BZ-2/m1", "plan-2607/handbook26/BZ-4", "plan-2607/handbook26/common/c2", "plan-2607/narr/II/ref2/s2"]) assert.ok(keys.includes(k), k);
  assert.ok(!keys.includes("plan-2607/handbook26/BZ-1") && !keys.includes("hb26r-2611/handbook26/MG-3/k2"));
  const by = (k: string) => refs.find((r) => r.key === k)!;
  assert.match(by("hb26r-2611/handbook26/BZ-2/m2").where!, /11\.13 수정본\(신구대비표 「수정」 쪽\) — 이 판이 유효/);
  assert.equal(by("hb26r-2611/handbook26/BZ-2/m2").title, "편람 수정 신구대비표 제목 hb26r-2611/handbook26/BZ-2/m2", "출처 이름 = 문서 이름 + 조각 제목");
  assert.match(by("plan-2607/handbook26/BZ-2/m1").where!, /11\.13 수정본 기준: 이 복합지표/);
  assert.match(by("plan-2607/narr/II/ref2/s2").where!, /수정본에서 다르게 확정됨/);
});

test("월간 점검(경영관리): 그 지표 편람 조각과 함께 수정본 조각이 들어가고(공통 편람도 그대로), 다른 지표 수정본은 빠짐", async () => {
  const keys = (await gatherInspectionKnowledge(fakeDb(CHUNKS), "MG-3")).map((r) => r.key);
  for (const k of ["hb26r-2611/handbook26/MG-3/k2", "plan-2607/handbook26/MG-3/k1", "plan-2607/handbook26/MG-3/k2", "plan-2607/handbook26/MG/1-3/k1"]) assert.ok(keys.includes(k), k);
  assert.ok(!keys.some((k) => k.includes("/BZ-")));
  const other = (await gatherInspectionKnowledge(fakeDb(CHUNKS), "MG-4")).map((r) => r.key);
  assert.ok(!other.includes("hb26r-2611/handbook26/MG-3/k2") && other.includes("plan-2607/handbook26/MG/1-3/k1"));
});

test("경평 초안 평가 관점(경영관리): 그 지표 편람 조각에 수정본 조각이 옛 조각 바로 앞으로 들고, 한 자리로 세어 공통 평가 기준이 밀려나지 않으며, 위치 글에 판 표지", async () => {
  const lens = await loadLens(fakeDb(CHUNKS), { id: "경영관리3/3-1", evalUnitId: "MG-3", data: {} });
  const crit = lens.filter((r) => r.group === "criteria");
  assert.deepEqual(crit.map((r) => r.key), [
    "plan-2607/handbook26/MG-3/k1",
    "hb26r-2611/handbook26/MG-3/k2",
    "plan-2607/handbook26/MG-3/k2",
    "plan-2607/narr/I/2/s1",
    "plan-2607/narr/I/2/s2",
    "plan-2607/narr/II/ref3/s1",
    "plan-2607/narr/II/ref3/s2",
  ]);
  assert.match(crit[1].where, /이 판이 유효/);
  assert.match(crit[2].where, /※ 11\.13 수정본 기준: ①이/);
  // 수정본이 없을 때(적재 전)와 견주어 다른 평가 기준 수가 같음
  const before = await loadLens(fakeDb(CHUNKS.filter((x) => x.doc_id !== "hb26r-2611")), { id: "경영관리3/3-1", evalUnitId: "MG-3", data: {} });
  assert.equal(before.filter((r) => r.group === "criteria").length, crit.length - 1);
});

test("숫자 근거: 편람 조각은 옛 판·수정본 모두 숫자 근거(known)가 아니라 인용 대조(quoteOnly)에만 — 옛 편람 조각과 같게", () => {
  const rows = CHUNKS.filter((x) => x.business === "BZ-2").map((x) => ({ ...x, text: String(x.text) }));
  const lens = pickLens({ criteria: rows, criteriaOrder: rows.map((r) => r.chunk_key), linked: [], execution: [], searched: [], peers: [] });
  assert.ok(lens.some((r) => r.key === "hb26r-2611/handbook26/BZ-2/m2"));
  const ev = draftEvidence([], [], lens, {} as never, []);
  assert.ok(ev.quoteOnly.includes("77.7") && ev.quoteOnly.includes("복합지표 8점"));
  const known = knownNumbers({}, ev.known);
  assert.ok(!known.has("77.7") && !known.has("8"), "수정본 산식 숫자도 옛 편람 숫자처럼 근거 숫자가 아님");
});
