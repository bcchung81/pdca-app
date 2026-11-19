// 외부 컨설팅 의견 조각(consult26-mg — 2026-11-19 사용자 결정 A3, 2026-11-20 카드별 참조)이 가는 곳·안 가는 곳을 경로마다 지킵니다.
// 들어감: **그 카드(meta.card_ids)의 요청에만** — 작성지원·질문·코멘트(묶음 card)·경영관리 경평 구성안·집필·블록 고치기(묶음 report)의 카드별 덩이(bundle.consult — 요청 글 목록표 뒤).
// 안 들어감: 공유 층(①②③ — 같은 지표 카드끼리 캐시를 나눠 쓰는 글) · 같은 지표 다른 카드 · 지표 단위 부분(unit-parts-queries) · 월간 점검 두 트랙 · 평가 관점 · 주요사업 전 기능 ·
// 숫자 근거(relevantRefs·knownNumbers)·인용 대조(bundleRefs) · 공유 조각 조회·캐시(loadBundleChunks).
// 조각은 합성(기관 원문 아님). context.ts·lens-queries.ts·unit-parts-queries.ts는 import "server-only"라 그 모듈만 빈 모듈로 돌려 불러옵니다(handbook-rev-paths.test.ts와 같은 방법).
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assistProgress, draftProgress } from "../ai/progress.ts";
import { verifyResult } from "../ai/writer.ts";
import { assistPrompts, assistPromptsMg, chatPrompts, chatPromptsMg, commentPrompts, commentPromptsMg, reportBlockPrompts, reportBlockPromptsMg, reportDraftPrompts, reportDraftPromptsMg, reportOutlinePrompts, reportOutlinePromptsMg } from "../prompts/sets.ts";
import { draftEvidence, knownNumbers } from "../reports/section.ts";
import { type BundleChunk, buildBundle, bundleRefs, listText, relevantRefs, sharedTexts } from "./bundle.ts";
import { cachedChunks, clearChunkCache } from "./chunk-cache.ts";
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
const { gatherInspectionKnowledge, loadBundleChunks, loadCardBundle, loadCardConsult } = await import("../ai/context.ts");
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
const consult = (key: string, business: string, cards: string[], text: string, seq = 0) =>
  c({ chunk_key: `consult26-mg/${key}`, doc_id: "consult26-mg", seq, unit_type: "consult_comment", business, title: `외부 컨설팅 · ${key}`, text, context_prefix: `외부 컨설팅 · 과제 ${key}`, meta: { round: 2, card_ids: cards } });

const BASE: BundleChunk[] = [
  c({ chunk_key: "plan-2607/narr/mg", seq: 1 }),
  c({ chunk_key: "plan-2607/handbook26/MG-1/k1", seq: 2, unit_type: "handbook_indicator", business: "MG-1", text: "편람 지표1" }),
  c({ chunk_key: "plan-2607/checklist/MG-1/1", seq: 3, unit_type: "checklist_group", business: "MG-1" }),
  c({ chunk_key: "plan-2607/eval25/MG-1/e1", seq: 4, unit_type: "evaluator_comment", business: "MG-1" }),
  c({ chunk_key: "qa25-mg-01/q1", doc_id: "qa25-mg-01", seq: 1, unit_type: "qa_pair", business: "MG-1", text: "실사 답변 실적 12건" }),
  c({ chunk_key: "core25-mg/1-1", doc_id: "core25-mg", seq: 1, unit_type: "core_item", business: "MG-1" }),
  c({ chunk_key: "corr25-2610/MG-1/01", doc_id: "corr25-2610", seq: 1, unit_type: "corrective_action", business: "MG-1" }),
  c({ chunk_key: "rpt25-mg-01/s1", doc_id: "rpt25-mg-01", seq: 1, unit_type: "report_section", business: "MG-1" }),
  c({ chunk_key: "plan-2607/handbook26/MG-7/k1", seq: 6, unit_type: "handbook_indicator", business: "MG-7" }),
  c({ chunk_key: "up-m/1", doc_id: "up-m", unit_type: "generic_section", track: "주요사업", meta: { generic: true, usage: "report_method" }, text: "작성 방법론" }),
  c({ chunk_key: "plan-2607/handbook26/BZ-1", seq: 5, unit_type: "handbook_indicator", track: "주요사업", business: "BZ-1" }),
  c({ chunk_key: "att3-2604/s1/Q01", doc_id: "att3-2604", seq: 1, unit_type: "qa_pair", track: "주요사업", business: "BZ-1" }),
];
const CONSULT: BundleChunk[] = [
  consult("r2/1-1", "MG-1", ["경영관리1/1-1"], "▶ (완료 실적) 컨설턴트가 본 값 4,321건", 44),
  consult("r2/1-2", "MG-1", ["경영관리1/1-2"], "▶ (범위) 1-2 카드만의 의견", 45),
  consult("r1/1-1", "MG-1", ["경영관리1/1-1"], "▶ 9월 의견", 0),
  consult("r2/2-1", "MG-2", ["경영관리2/2-1"], "▶ 다른 지표 의견", 46),
  // 9월 7-1이 지금 7-1·7-2로 나뉨 — 두 카드 모두의 의견(2026-11-20 사용자 결정)
  consult("r1/7-1", "MG-7", ["경영관리7/7-1", "경영관리7/7-2"], "▶ 나뉜 과제 의견", 10),
];
const ALL = [...BASE, ...CONSULT];
const CARD = { title: "", executionTask: "" };
type Purpose = "card" | "report";
const PURPOSES: Purpose[] = ["card", "report"];
const bundleOf = (id: string, unit: string, purpose: Purpose, chunks = ALL, linked: string[] = []) => buildBundle(chunks, { id, evalUnitId: unit, data: CARD }, linked, null, purpose);
const mg1 = (purpose: Purpose, chunks = ALL, linked: string[] = []) => bundleOf("경영관리1/1-1", "MG-1", purpose, chunks, linked);
const layerKeys = (b: ReturnType<typeof mg1>) => b.layers.flatMap((l) => l.refs.map((r) => r.key));
const consultKeys = (b: ReturnType<typeof mg1>) => (b.consult ?? []).map((r) => r.key);
const IS_CONSULT = (k: string) => k.startsWith("consult26-mg/");

test("작성지원·질문·코멘트(card)·경평 구성안·집필·블록 고치기(report): 이 카드 의견만 카드별 덩이(consult)로 — 같은 지표 다른 카드·다른 지표 의견 0, 공유 층에는 없음, 위치 글에 「근거 아님」 표지", () => {
  for (const p of PURPOSES) {
    const b = mg1(p);
    assert.deepEqual(consultKeys(b), ["consult26-mg/r1/1-1", "consult26-mg/r2/1-1"], `${p}: 1차 → 2차 순`);
    assert.ok(!layerKeys(b).some(IS_CONSULT), `${p}: 공유 층에 없음`);
    assert.equal(b.consult![1].where, `외부 컨설팅 · 과제 r2/1-1 · ※ ${CONSULT_NOTE}`);
    assert.deepEqual(consultKeys(bundleOf("경영관리1/1-2", "MG-1", p)), ["consult26-mg/r2/1-2"], `${p}: 같은 지표 다른 카드는 자기 의견만`);
    assert.deepEqual(consultKeys(bundleOf("경영관리2/2-1", "MG-2", p)), ["consult26-mg/r2/2-1"]);
    assert.equal(bundleOf("경영관리1/1-3", "MG-1", p).consult, undefined, `${p}: 의견 없는 카드는 칸도 없음(예전 묶음과 같은 모양)`);
    assert.equal(buildBundle(ALL, { evalUnitId: "MG-1", data: CARD }, [], null, p).consult, undefined, `${p}: 카드 id를 안 넘기면(크기 재기·실험 스크립트) 의견 없음`);
    const bz = bundleOf("주요사업1/1-가", "BZ-1", p);
    assert.ok(!layerKeys(bz).some(IS_CONSULT) && bz.consult === undefined, `${p}: 주요사업`);
  }
});

test("나뉜 과제(9월 7-1 → 지금 7-1·7-2): 의견이 두 카드 모두에 들어가고, 같은 지표의 다른 카드(7-3)에는 없음", () => {
  for (const p of PURPOSES) {
    assert.deepEqual(consultKeys(bundleOf("경영관리7/7-1", "MG-7", p)), ["consult26-mg/r1/7-1"]);
    assert.deepEqual(consultKeys(bundleOf("경영관리7/7-2", "MG-7", p)), ["consult26-mg/r1/7-1"]);
    assert.equal(bundleOf("경영관리7/7-3", "MG-7", p).consult, undefined);
  }
});

test("요청 글: 공유 층 글(sharedTexts)은 컨설팅 조각 적재 전과 바이트까지 같고(같은 지표 카드끼리 캐시 공유 그대로), 목록표(listText) 맨 끝에만 이 카드 의견 원문 — 경영관리 네 기능 묶음", () => {
  for (const [name, p, purpose] of [
    ["card-assist-mg", assistPromptsMg().prompts, "card"],
    ["card-chat-mg", chatPromptsMg().prompts, "card"],
    ["card-comment-mg", commentPromptsMg().prompts, "card"],
    ["report-draft-mg(구성안·집필·블록 고치기의 kb 절)", reportDraftPromptsMg().prompts, "report"],
  ] as const) {
    const withC = mg1(purpose);
    const without = mg1(purpose, BASE);
    assert.deepEqual(sharedTexts(p, withC), sharedTexts(p, without), name);
    assert.deepEqual(sharedTexts(p, withC), sharedTexts(p, bundleOf("경영관리1/1-2", "MG-1", purpose)), `${name}: 같은 지표 다른 카드와 공유 층 글이 같음`);
    const list = listText(p, withC);
    const before = listText(p, without);
    assert.ok(list.startsWith(`${before}\n`), name);
    const tail = list.slice(before.length);
    assert.match(tail, /「외부 컨설팅 의견\(이 카드\)」 2건/);
    assert.ok(tail.includes("컨설턴트가 본 값 4,321건") && tail.includes("9월 의견") && !tail.includes("1-2 카드만의 의견"), name);
    assert.equal(listText(p, bundleOf("경영관리1/1-3", "MG-1", purpose)), before, `${name}: 의견 없는 카드는 예전과 같은 글`);
  }
});

test("프롬프트: kb.consult 절과 「외부 컨설팅 의견(이 카드)」 쓰는 법은 경영관리 판에만(작성지원·질문·코멘트 적응문, 경평 구성안·집필·블록 고치기 입력), 주요사업 판에는 없음", () => {
  for (const s of [assistPromptsMg(), chatPromptsMg(), commentPromptsMg()]) {
    assert.ok(s.prompts.request["kb.consult"], s.prompts.feature);
    assert.match(s.prompts.system.system, /「외부 컨설팅 의견\(이 카드\)」[^\n]*점검 관점[^\n]*근거로 쓰지 않습니다/, s.prompts.feature);
  }
  assert.ok(reportDraftPromptsMg().prompts.request["kb.consult"]);
  for (const s of [reportDraftPromptsMg(), reportOutlinePromptsMg(), reportBlockPromptsMg()]) {
    assert.match(s.prompts.system.system, /외부 컨설팅 의견\(이 카드\): 점검 관점[^\n]*【확인: …】·「자료 필요」로 남깁니다[^\n]*근거로 쓰지 않고/, s.prompts.feature);
  }
  for (const s of [assistPrompts(), chatPrompts(), commentPrompts(), reportDraftPrompts(), reportOutlinePrompts(), reportBlockPrompts()]) {
    assert.equal(s.prompts.request["kb.consult"], undefined, s.prompts.feature);
    assert.ok(!s.prompts.system.system.includes("외부 컨설팅"), s.prompts.feature);
  }
});

test("숫자·인용 근거: 카드에 연결(대응표 auto·confirmed)돼 있어도 relevantRefs·bundleRefs·목록표 「이 과제 해당」에 없고, knownNumbers에 컨설팅 의견 속 수치가 없음", () => {
  const linked = ["consult26-mg/r2/1-1", "qa25-mg-01/q1"];
  for (const p of PURPOSES) {
    const b = mg1(p, ALL, linked);
    assert.deepEqual(b.list.relevant, ["qa25-mg-01/q1"], p);
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

test("선별 방식이어도: 이 카드 의견(consult)은 그대로 남아 요청 글 끝에 붙고, 선별 대조 원문(select.all)·숫자·인용 근거에는 안 들어감", () => {
  for (const p of PURPOSES) {
    const sel = applySelection(mg1(p), { keys: [], digest: { track: "규칙", unit: "규칙" } }, rolesOf(ALL));
    assert.deepEqual(consultKeys(sel), ["consult26-mg/r1/1-1", "consult26-mg/r2/1-1"], p);
    assert.ok(!sel.select!.all.some((r) => IS_CONSULT(r.key)) && !bundleRefs(sel).some((r) => IS_CONSULT(r.key)) && !relevantRefs(sel).some((r) => IS_CONSULT(r.key)), p);
    assert.ok(listText(reportDraftPromptsMg().prompts, sel).includes("「외부 컨설팅 의견(이 카드)」 2건"), p);
  }
});

test("크기 보호: 컨설팅 의견은 공유 층이 아니라 공유 층 크기(sharedChars)가 적재 전과 같음 — 경영관리 지표·주요사업 모두", () => {
  for (const unit of ["MG-1", "MG-2", "MG-7", "MG-3", "BZ-1"]) assert.equal(sharedChars(ALL, unit), sharedChars(BASE, unit), unit);
});

test("AI 진행 줄: 이 카드 의견 제목이 있으면 「컨설팅 의견 N건」(근거 아님 표시), 없으면 줄 없음 — 작성지원·경평 초안", () => {
  const titles = ["외부 컨설팅 1차 · 가", "외부 컨설팅 2차 · 가"];
  const find = (s: ReturnType<typeof assistProgress>) => s.sources.find((x) => x.label.startsWith("컨설팅 의견"));
  const a = find(assistProgress("improve", { files: [], consult: titles }));
  assert.equal(a?.label, "컨설팅 의견 2건");
  assert.match(a!.detail, /외부 컨설팅 1차 · 가 · 외부 컨설팅 2차 · 가 — [^\n]*이 카드 것만[^\n]*사실·숫자 근거 아님/);
  assert.equal(find(assistProgress("chat", { files: [], consult: [] })), undefined);
  assert.equal(find(assistProgress("chat", { files: [] })), undefined);
  assert.equal(find(draftProgress("outline", { files: [], prior: [], lens: 0, mg: true, consult: titles }))?.label, "컨설팅 의견 2건");
  assert.equal(find(draftProgress("plan", { files: [], prior: [], lens: 0, mg: true })), undefined);
});

/** knowledge_chunks 등을 흉내 냄 — eq·neq·in·like·contains(jsonb 배열 칸)·or(eq·is.null·like·in)를 거름. 나머지 표는 빈 행 */
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
  const contains = (r: Record<string, unknown>, col: string, want: Record<string, unknown[]>) => {
    const have = (get(r, col) ?? {}) as Record<string, unknown>;
    return Object.entries(want).every(([k, xs]) => Array.isArray(have[k]) && xs.every((x) => (have[k] as unknown[]).includes(x)));
  };
  const run = (table: string, ops: Array<[string, unknown[]]>) => {
    let out: Record<string, unknown>[] = table === "knowledge_chunks" ? (rows as unknown as Record<string, unknown>[]) : [];
    for (const [op, args] of ops) {
      if (op === "eq") out = out.filter((r) => get(r, String(args[0])) === args[1]);
      if (op === "neq") out = out.filter((r) => get(r, String(args[0])) !== args[1]);
      if (op === "in") out = out.filter((r) => (args[1] as unknown[]).includes(get(r, String(args[0]))));
      if (op === "like") out = out.filter((r) => like(String(args[1])).test(String(get(r, String(args[0])))));
      if (op === "contains") out = out.filter((r) => contains(r, String(args[0]), args[1] as Record<string, unknown[]>));
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

test("조회: 공유 조각(loadBundleChunks)은 컨설팅 유형을 빼고 읽어 캐시에도 없고(사람마다 다른 DB 결과가 공유 캐시에 안 섞임), 카드 요청(loadCardBundle)은 그 카드 의견만 따로 읽어 덩이로", async () => {
  clearChunkCache();
  try {
    const db = fakeDb(ALL);
    const shared = await loadBundleChunks(db, (await import("../tracks/index.ts")).trackSpecOfUnit("MG-1"));
    assert.ok(shared.length > 0 && !shared.some((r) => IS_CONSULT(r.chunk_key)));
    assert.ok(!(cachedChunks<BundleChunk>("경영관리") ?? []).some((r) => IS_CONSULT(r.chunk_key)), "캐시에 없음");
    assert.ok(!(await loadBundleChunks(db, "all", { fresh: true })).some((r) => IS_CONSULT(r.chunk_key)), "모든 트랙(올리기 크기 보호)");
    assert.deepEqual((await loadCardConsult(db, "경영관리7/7-2")).map((r) => r.chunk_key), ["consult26-mg/r1/7-1"]);
    const b = await loadCardBundle(db, { id: "경영관리1/1-1", evalUnitId: "MG-1", data: CARD });
    assert.deepEqual(consultKeys(b), ["consult26-mg/r1/1-1", "consult26-mg/r2/1-1"]);
    assert.ok(!layerKeys(b).some(IS_CONSULT));
    assert.equal((await loadCardBundle(db, { id: "경영관리1/1-3", evalUnitId: "MG-1", data: CARD }, "report")).consult, undefined);
  } finally {
    clearChunkCache();
  }
});

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
