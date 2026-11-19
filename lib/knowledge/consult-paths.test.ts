// 외부 컨설팅 의견 조각(consult26-mg — 2026-11-19 사용자 결정 A3)이 가는 곳·안 가는 곳을 경로마다 지킵니다.
// 들어감: 작성지원·질문·코멘트(묶음 card, 그 지표 ③) · 경영관리 경평 구성안(묶음 outline = report 묶음의 outlineOnly를 펼침).
// 안 들어감: 경평 집필·블록 고치기(묶음 report) · 지표 단위 부분(unit-parts-queries) · 월간 점검 두 트랙 · 평가 관점 · 주요사업 전 기능 · 숫자 근거(relevantRefs·knownNumbers)·인용 대조(bundleRefs).
// 조각은 합성(기관 원문 아님). context.ts·lens-queries.ts·unit-parts-queries.ts는 import "server-only"라 그 모듈만 빈 모듈로 돌려 불러옵니다(handbook-rev-paths.test.ts와 같은 방법).
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyResult } from "../ai/writer.ts";
import { assistPromptsMg, reportDraftPrompts, reportDraftPromptsMg } from "../prompts/sets.ts";
import { draftEvidence, knownNumbers } from "../reports/section.ts";
import { type BundleChunk, buildBundle, bundleRefs, listText, outlineBundle, relevantRefs, sharedTexts } from "./bundle.ts";
import { sharedChars } from "./guard.ts";
import { CONSULT_NOTE } from "./revision-note.ts";
import { applySelection, rolesOf } from "./select.ts";

type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { gatherInspectionKnowledge } = await import("../ai/context.ts");
const { loadLens } = await import("../reports/lens-queries.ts");
const { loadUnitAiExtras, loadUnitMaterials } = await import("../reports/unit-parts-queries.ts");
const { loadMgNumberEvidence } = await import("../reports/mg-queries.ts");

const c = (over: Partial<BundleChunk> & { chunk_key: string }): BundleChunk => ({
  doc_id: "plan-2607",
  seq: 0,
  unit_type: "plan_section",
  track: "경영관리",
  business: null,
  title: `제목 ${over.chunk_key}`,
  text: `글 ${over.chunk_key}`,
  context_prefix: `위치 ${over.chunk_key}`,
  meta: null,
  ...over,
});
const consult = (key: string, business: string, text: string, seq = 0) =>
  c({ chunk_key: `consult26-mg/${key}`, doc_id: "consult26-mg", seq, unit_type: "consult_comment", business, title: `외부 컨설팅 · ${key}`, text, context_prefix: `외부 컨설팅 · 과제 ${key}`, meta: { round: 2 } });

const BASE: BundleChunk[] = [
  c({ chunk_key: "plan-2607/narr/mg", seq: 1 }),
  c({ chunk_key: "plan-2607/handbook26/MG-1/k1", seq: 2, unit_type: "handbook_indicator", business: "MG-1", text: "편람 지표1" }),
  c({ chunk_key: "plan-2607/checklist/MG-1/1", seq: 3, unit_type: "checklist_group", business: "MG-1" }),
  c({ chunk_key: "plan-2607/eval25/MG-1/e1", seq: 4, unit_type: "evaluator_comment", business: "MG-1" }),
  c({ chunk_key: "qa25-mg-01/q1", doc_id: "qa25-mg-01", seq: 1, unit_type: "qa_pair", business: "MG-1", text: "실사 답변 실적 12건" }),
  c({ chunk_key: "core25-mg/1-1", doc_id: "core25-mg", seq: 1, unit_type: "core_item", business: "MG-1" }),
  c({ chunk_key: "corr25-2610/MG-1/01", doc_id: "corr25-2610", seq: 1, unit_type: "corrective_action", business: "MG-1" }),
  c({ chunk_key: "rpt25-mg-01/s1", doc_id: "rpt25-mg-01", seq: 1, unit_type: "report_section", business: "MG-1" }),
  c({ chunk_key: "up-m/1", doc_id: "up-m", unit_type: "generic_section", track: "주요사업", meta: { generic: true, usage: "report_method" }, text: "작성 방법론" }),
  c({ chunk_key: "plan-2607/handbook26/BZ-1", seq: 5, unit_type: "handbook_indicator", track: "주요사업", business: "BZ-1" }),
  c({ chunk_key: "att3-2604/s1/Q01", doc_id: "att3-2604", seq: 1, unit_type: "qa_pair", track: "주요사업", business: "BZ-1" }),
];
const CONSULT: BundleChunk[] = [
  consult("r2/1-1", "MG-1", "▶ (완료 실적) 컨설턴트가 본 값 4,321건", 44),
  consult("r2/1-2", "MG-1", "▶ (범위) 이 지표 다른 카드 의견", 45),
  consult("r1/1-1", "MG-1", "▶ 9월 의견", 0),
  consult("r2/2-1", "MG-2", "▶ 다른 지표 의견", 46),
];
const ALL = [...BASE, ...CONSULT];
const CARD = { title: "", executionTask: "" };
const mg1 = (purpose: "card" | "report" | "outline", chunks = ALL, linked: string[] = []) => buildBundle(chunks, { id: "경영관리1/1-1", evalUnitId: "MG-1", data: CARD } as never, linked, null, purpose);
const keysOf = (b: ReturnType<typeof mg1>) => b.layers.flatMap((l) => l.refs.map((r) => r.key));
const IS_CONSULT = (k: string) => k.startsWith("consult26-mg/");

test("작성지원·질문·코멘트(card): 그 지표 ③에 같은 지표 카드 의견이 모두(머리에 과제번호), 다른 지표·주요사업 과제에는 없음, 위치 글에 「근거 아님」 표지", () => {
  const b = mg1("card");
  const own = b.layers.find((l) => l.id === "business")!.refs;
  assert.deepEqual(own.filter((r) => IS_CONSULT(r.key)).map((r) => r.key), ["consult26-mg/r1/1-1", "consult26-mg/r2/1-1", "consult26-mg/r2/1-2"]);
  const where = own.find((r) => r.key === "consult26-mg/r2/1-2")!.where!;
  assert.equal(where, `외부 컨설팅 · 과제 r2/1-2 · ※ ${CONSULT_NOTE}`);
  assert.ok(sharedTexts(assistPromptsMg().prompts, b).join("\n").includes("이 지표 다른 카드 의견"), "요청 앞 공유 층 글에 들어감");
  const mg2 = buildBundle(ALL, { evalUnitId: "MG-2", data: CARD }, [], null, "card");
  assert.deepEqual(keysOf(mg2).filter(IS_CONSULT), ["consult26-mg/r2/2-1"]);
  for (const p of ["card", "report", "outline"] as const) {
    const bz = buildBundle(ALL, { evalUnitId: "BZ-1", data: CARD }, [], null, p);
    assert.ok(!keysOf(bz).some(IS_CONSULT), `주요사업 ${p}`);
    assert.equal(bz.outlineOnly, undefined);
  }
});

test("경평 집필·블록 고치기(report): 층에 없고 요청 글이 컨설팅 조각을 적재하기 전과 바이트까지 같음 — 구성안 몫은 outlineOnly에만", () => {
  const withC = mg1("report");
  const without = mg1("report", BASE);
  assert.ok(!keysOf(withC).some(IS_CONSULT));
  const p = reportDraftPromptsMg().prompts;
  assert.deepEqual(sharedTexts(p, withC), sharedTexts(p, without));
  assert.equal(listText(p, withC), listText(p, without));
  assert.deepEqual(withC.outlineOnly?.map((l) => [l.id, l.refs.map((r) => r.key)]), [["business", ["consult26-mg/r1/1-1", "consult26-mg/r2/1-1", "consult26-mg/r2/1-2"]]]);
  assert.equal(without.outlineOnly, undefined, "구성안에만 더할 조각이 없으면 칸도 없음(예전 묶음과 같은 모양)");
});

test("경평 구성안(outline): report 묶음 + 컨설팅 의견을 ③ 끝에 — outlineBundle(report 묶음)과 buildBundle(…, outline)이 같고, 작성 방법론도 그대로", () => {
  const o = mg1("outline");
  assert.deepEqual(outlineBundle(mg1("report")), o);
  const own = o.layers.find((l) => l.id === "business")!.refs.map((r) => r.key);
  assert.deepEqual(own.slice(-3), ["consult26-mg/r1/1-1", "consult26-mg/r2/1-1", "consult26-mg/r2/1-2"], "③ 끝(집필 묶음의 ③ 앞부분은 그대로)");
  assert.deepEqual(own.slice(0, -3), mg1("report").layers.find((l) => l.id === "business")!.refs.map((r) => r.key));
  assert.ok(o.layers.find((l) => l.id === "institution")!.refs.some((r) => r.key === "up-m/1"), "작성 방법론은 구성안에도");
  const plain = mg1("report", BASE);
  assert.equal(outlineBundle(plain), plain, "구성안 몫이 없으면 같은 묶음 그대로");
  // 주요사업은 구성안 = 집필 묶음
  const bz = (p: "report" | "outline") => buildBundle(ALL, { evalUnitId: "BZ-1", data: CARD }, [], null, p);
  assert.deepEqual(bz("outline"), bz("report"));
  assert.deepEqual(sharedTexts(reportDraftPrompts().prompts, outlineBundle(bz("report"))), sharedTexts(reportDraftPrompts().prompts, bz("report")));
});

test("숫자·인용 근거: 카드에 연결(대응표 auto·confirmed)돼 있어도 relevantRefs·bundleRefs에서 빠지고, knownNumbers에 컨설팅 의견 속 수치가 없음", () => {
  const linked = ["consult26-mg/r2/1-1", "qa25-mg-01/q1"];
  for (const p of ["card", "outline"] as const) {
    const b = mg1(p, ALL, linked);
    assert.ok(b.list.relevant.includes("consult26-mg/r2/1-1"), "목록표 「이 과제 해당」 표시는 그대로");
    assert.deepEqual(relevantRefs(b).map((r) => r.key), ["qa25-mg-01/q1"], p);
    assert.ok(!bundleRefs(b).some((r) => IS_CONSULT(r.key)), p);
    const known = knownNumbers({}, draftEvidence([], [], [], {} as never, relevantRefs(b)).known);
    assert.ok(known.has("12") && !known.has("4321") && !known.has("4,321"), p);
  }
  // 작성지원 인용 대조: 컨설팅 조각을 인용·근거 키로 적어도 원문 확인 근거가 되지 않음(인용·근거 키에서 빠짐)
  const b = mg1("card", ALL, linked);
  const v = verifyResult(
    { headline: "", summary: "", citations: [{ key: "consult26-mg/r2/1-1", quote: "컨설턴트가 본 값 4,321건" }, { key: "qa25-mg-01/q1", quote: "실사 답변 실적 12건" }], suggestions: [{ kind: "improve", target_path: "", period: null, proposed: ["가"], reason: "", source_keys: ["consult26-mg/r2/1-1", "qa25-mg-01/q1"] }], monthly_row: null, need_input: null, followup: [] } as never,
    {},
    bundleRefs(b),
  );
  assert.deepEqual(v.citations.map((x) => x.key), ["qa25-mg-01/q1"]);
  assert.deepEqual(v.suggestions[0].sourceKeys, ["qa25-mg-01/q1"]);
});

test("선별 방식이어도: 컨설팅 의견은 사례류가 아니라(advice) 층에 원문 그대로 남고, 구성안 몫(outlineOnly)도 유지되며, 대조 원문(select.all)에도 안 들어감", () => {
  const report = mg1("report");
  const sel = applySelection(report, { keys: [], digest: { track: "규칙", unit: "규칙" } }, rolesOf(ALL));
  assert.deepEqual(sel.outlineOnly, report.outlineOnly);
  assert.deepEqual(outlineBundle(sel).layers.find((l) => l.id === "business")!.refs.filter((r) => IS_CONSULT(r.key)).length, 3);
  const card = applySelection(mg1("card"), { keys: [], digest: { track: "규칙", unit: "규칙" } }, rolesOf(ALL));
  assert.equal(keysOf(card).filter(IS_CONSULT).length, 3, "card 선별 묶음에도 원문 그대로");
  assert.ok(!bundleRefs(card).some((r) => IS_CONSULT(r.key)) && !relevantRefs(card).some((r) => IS_CONSULT(r.key)));
});

test("크기 보호: 컨설팅 의견만큼 그 지표의 공유 층 크기(card·report·outline 중 큰 쪽)가 늘고, 다른 지표·주요사업은 그대로", () => {
  const grow = (unit: string) => sharedChars(ALL, unit) - sharedChars(BASE, unit);
  assert.ok(grow("MG-1") > 0 && grow("MG-2") > 0);
  assert.equal(grow("MG-3"), 0);
  assert.equal(grow("BZ-1"), 0);
});

/** knowledge_chunks 등을 흉내 냄 — eq·in·like·or(eq·is.null·like·in)를 거름. 나머지 표는 빈 행 */
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
    let out: Record<string, unknown>[] = table === "knowledge_chunks" ? (rows as unknown as Record<string, unknown>[]) : [];
    for (const [op, args] of ops) {
      if (op === "eq") out = out.filter((r) => get(r, String(args[0])) === args[1]);
      if (op === "in") out = out.filter((r) => (args[1] as unknown[]).includes(get(r, String(args[0]))));
      if (op === "like") out = out.filter((r) => like(String(args[1])).test(String(get(r, String(args[0])))));
      if (op === "or") out = out.filter((r) => orMatch(r, String(args[0])));
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

test("월간 점검(경영관리·주요사업)·평가 관점·지표 단위 부분·경영관리 숫자 근거 조회: 유형·문서를 골라 읽어 컨설팅 의견이 안 들어감", async () => {
  const db = fakeDb(ALL);
  const keys = (refs: Array<{ key?: string; chunk_key?: string }>) => refs.map((r) => String(r.key ?? r.chunk_key));
  const mgInspect = keys(await gatherInspectionKnowledge(db, "MG-1"));
  assert.ok(mgInspect.includes("plan-2607/checklist/MG-1/1") && !mgInspect.some(IS_CONSULT), "경영관리 월간 점검");
  assert.ok(!keys(await gatherInspectionKnowledge(db, "BZ-1")).some(IS_CONSULT), "주요사업 월간 점검");
  assert.ok(!keys(await loadLens(db, { id: "경영관리1/1-1", evalUnitId: "MG-1", data: {} })).some(IS_CONSULT), "평가 관점(경평 초안)");
  const { materials } = await loadUnitMaterials(db, "MG-1", 2026);
  const extras = await loadUnitAiExtras(db, "MG-1");
  const unitKeys = [...materials.report2025, ...materials.evaluator, ...materials.handbook, ...extras.corrective, ...extras.core].map((x) => x.chunk_key);
  assert.ok(unitKeys.includes("corr25-2610/MG-1/01") && !unitKeys.some(IS_CONSULT), "지표 단위 부분");
  const numbers = await loadMgNumberEvidence(db, "MG-1");
  assert.ok(numbers.includes("글 rpt25-mg-01/s1") && !numbers.includes("4,321"), "경영관리 경평 숫자 근거(2025 보고서·핵심공통항목)");
});
