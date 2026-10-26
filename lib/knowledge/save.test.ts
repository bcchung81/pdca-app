import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "../prep/fake-db.ts";
import { cachedChunks, storeChunks } from "./chunk-cache.ts";
import { changedMatchingDocs, deleteDocument, documentShas, planMatchingJobs, registerMatching, saveDocumentsAndChunks } from "./save.ts";

const asDb = (d: FakeDb) => d as unknown as SupabaseClient;
const doc = (id: string, sha: string | null = "s1") => ({ doc_id: id, title: id, sha256: sha });
const chunk = (key: string, docId: string, over: Record<string, unknown> = {}) => ({ chunk_key: key, doc_id: docId, unit_type: "generic_section", business: null, track: "주요사업", ...over });

test("문서·조각 업서트: 있으면 바꾸고 없으면 넣고, 옛 조각은 prune이 없으면 남기고(건수만 알림) prune이면 지운다", async () => {
  const db = new FakeDb({ knowledge_documents: [doc("d1", "old")], knowledge_chunks: [chunk("d1/a", "d1"), chunk("d1/old", "d1"), chunk("d2/x", "d2")] });
  const logs: string[] = [];
  const r1 = await saveDocumentsAndChunks(asDb(db), [doc("d1", "new")], [chunk("d1/a", "d1", { title: "바뀜" }), chunk("d1/b", "d1")], { log: (m) => logs.push(m) });
  assert.deepEqual(r1, { documents: 1, chunks: 2, stale: { d1: 1 }, pruned: 0 });
  assert.deepEqual(db.rows("knowledge_chunks").map((c) => c.chunk_key).sort(), ["d1/a", "d1/b", "d1/old", "d2/x"], "다른 문서 조각은 그대로, 옛 조각은 남음");
  assert.equal(db.rows("knowledge_chunks").find((c) => c.chunk_key === "d1/a")!.title, "바뀜");
  assert.equal(db.rows("knowledge_documents")[0].sha256, "new");
  assert.ok(logs.some((l) => l.includes("옛 조각 1개 남음")));
  const r2 = await saveDocumentsAndChunks(asDb(db), [doc("d1", "new")], [chunk("d1/a", "d1"), chunk("d1/b", "d1")], { prune: true });
  assert.deepEqual([r2.stale, r2.pruned], [{}, 1]);
  assert.deepEqual(db.rows("knowledge_chunks").map((c) => c.chunk_key).sort(), ["d1/a", "d1/b", "d2/x"]);
});

test("조각 넣기 전 훅은 문서를 넣은 뒤·조각을 넣기 전에 한 번 불린다(시드의 그림 올리기 자리)", async () => {
  const db = new FakeDb();
  const seen: Array<[number, number]> = [];
  await saveDocumentsAndChunks(asDb(db), [doc("d1")], [chunk("d1/a", "d1")], { beforeChunks: async () => void seen.push([db.rows("knowledge_documents").length, db.rows("knowledge_chunks").length]) });
  assert.deepEqual(seen, [[1, 0]]);
});

test("판 비교: 새 문서·sha256이 바뀐 문서만 매칭 대상이고, 같은 판이거나 대응표 대상 조각이 없는 문서는 제외", async () => {
  const db = new FakeDb({ knowledge_documents: [doc("same", "a"), doc("changed", "a")] });
  const before = await documentShas(asDb(db));
  assert.equal(before.get("same"), "a");
  const docs = [doc("same", "a"), doc("changed", "b"), doc("brand-new", "c"), doc("noscope", "d"), doc("nosha", null)];
  const chunks = [chunk("s/1", "same"), chunk("c/1", "changed"), chunk("n/1", "brand-new"), chunk("x/1", "noscope", { unit_type: "plan_section" }), chunk("z/1", "nosha")];
  assert.deepEqual(changedMatchingDocs(before, docs, chunks).sort(), ["brand-new", "changed", "nosha"]);
});

test("매칭 작업 계획: 닿는 사업의 카드만(기관 공통·공통지표·가점·사업 미지정이면 전부), 한 과제의 문서는 한 작업에 모음", () => {
  const cards = [
    { id: "C1", eval_unit_id: "BZ-1" },
    { id: "C2", eval_unit_id: "BZ-2" },
    { id: "C3", eval_unit_id: "BZ-3" },
  ];
  const chunks = [
    chunk("a/1", "all-doc"), // 사업 미지정 → 모든 카드
    chunk("b/1", "b2-doc", { business: "BZ-2" }),
    chunk("k/1", "kpi-doc", { business: "BZ-4" }),
    chunk("p/1", "bonus-doc", { track: "가점" }),
  ];
  const only = planMatchingJobs(cards, ["b2-doc"], chunks);
  assert.deepEqual(only.map((j) => j.target), ["C2"]);
  const jobs = planMatchingJobs(cards, ["all-doc", "b2-doc"], chunks);
  assert.deepEqual(jobs.map((j) => [j.target, (j.payload as { docIds: string[] }).docIds]), [["C1", ["all-doc"]], ["C2", ["all-doc", "b2-doc"]], ["C3", ["all-doc"]]]);
  for (const id of ["kpi-doc", "bonus-doc"]) assert.equal(planMatchingJobs(cards, [id], chunks).length, 3, `${id}는 모든 카드`);
  assert.deepEqual(planMatchingJobs(cards, [], chunks), []);
});

test("매칭 작업 계획은 트랙을 가른다: 경영관리 조각은 경영관리 카드에만, 주요사업 조각은 주요사업 카드에만, 가점은 두 트랙 모두 — 다른 트랙 카드로 헛된 AI 매칭이 번지지 않음", () => {
  const cards = [
    { id: "B1", eval_unit_id: "BZ-1" },
    { id: "B2", eval_unit_id: "BZ-2" },
    { id: "M1", eval_unit_id: "MG-G1" },
    { id: "M2", eval_unit_id: "MG-G2" },
  ];
  const chunks = [
    chunk("mg/inst", "mg-doc", { track: "경영관리" }), // 경영관리 · 사업 미지정
    chunk("mg/i3", "mg-ind-doc", { track: "경영관리", business: "MG-3" }), // 경영관리 · 지표 지정(카드 지표는 아직 모름 → 경영관리 카드 전부)
    chunk("biz/inst", "biz-doc"), // 주요사업 · 사업 미지정
    chunk("biz/b2", "biz-b2-doc", { business: "BZ-2" }),
    chunk("kpi/1", "kpi-doc", { business: "BZ-4" }),
    chunk("bonus/1", "bonus-doc", { track: "가점" }),
  ];
  const targets = (docId: string) => planMatchingJobs(cards, [docId], chunks).map((j) => j.target);
  assert.deepEqual(targets("mg-doc"), ["M1", "M2"]);
  assert.deepEqual(targets("mg-ind-doc"), ["M1", "M2"]);
  assert.deepEqual(targets("biz-doc"), ["B1", "B2"]);
  assert.deepEqual(targets("biz-b2-doc"), ["B2"]);
  assert.deepEqual(targets("kpi-doc"), ["B1", "B2"], "공통지표는 주요사업 개념");
  assert.deepEqual(targets("bonus-doc"), ["B1", "B2", "M1", "M2"]);
});

test("검색 전용 문서(meta.search_only)는 AI 매칭 대상이 아니라 새 문서여도 매칭 작업을 만들지 않는다(왕복 시험에서 59건이 잘못 등록된 회귀)", () => {
  const before = new Map<string, string | null>();
  const docs = [doc("so-doc", "a"), doc("normal-doc", "b")];
  const chunks = [chunk("so/1", "so-doc", { meta: { search_only: true } }), chunk("n/1", "normal-doc", { meta: { generic: true } })];
  assert.deepEqual(changedMatchingDocs(before, docs, chunks), ["normal-doc"]);
  const cards = [{ id: "C1", eval_unit_id: "BZ-1" }];
  assert.deepEqual(planMatchingJobs(cards, ["so-doc"], chunks), [], "검색 전용은 계획에서도 빠짐");
  assert.deepEqual(planMatchingJobs(cards, ["so-doc", "normal-doc"], chunks).map((j) => (j.payload as { docIds: string[] }).docIds), [["normal-doc"]]);
  // 일부 조각만 검색 전용인 경우(섞인 문서)는 나머지 조각 때문에 대상
  assert.deepEqual(changedMatchingDocs(before, [doc("mix", "c")], [chunk("m/1", "mix", { meta: { search_only: true } }), chunk("m/2", "mix")]), ["mix"]);
});

test("경평 초안 작성 방법론 문서(meta.usage = report_method)도 과제원장 매칭 대상이 아니라 새 문서여도 매칭 작업을 만들지 않는다", () => {
  const docs = [doc("m-doc", "a"), doc("normal-doc", "b")];
  const chunks = [chunk("m/1", "m-doc", { meta: { generic: true, usage: "report_method" } }), chunk("n/1", "normal-doc", { meta: { generic: true } })];
  assert.deepEqual(changedMatchingDocs(new Map(), docs, chunks), ["normal-doc"]);
  assert.deepEqual(planMatchingJobs([{ id: "C1", eval_unit_id: "BZ-1" }], ["m-doc"], chunks), []);
});

test("매칭 등록: 활성 카드에만, 사용자 권한으로 등록하면 requested_by를 넣고, 대상이 없으면 아무것도 안 하고, 실패해도 던지지 않는다(대기 중 중복 건너뜀은 prep-core.test가 지킴)", async () => {
  const db = new FakeDb({ cards: [{ id: "C1", eval_unit_id: "BZ-1", status: "active" }, { id: "C2", eval_unit_id: "BZ-1", status: "retired" }] });
  const chunks = [chunk("a/1", "d1")];
  const r = await registerMatching(asDb(db), ["d1"], chunks, { requestedBy: "u-1" });
  assert.deepEqual([r.queued, r.skipped], [1, 0]);
  assert.deepEqual(db.rows("prep_jobs").map((j) => [j.kind, j.target, j.requested_by, j.payload]), [["match_knowledge", "C1", "u-1", { docIds: ["d1"] }]]);
  const none = await registerMatching(asDb(db), [], chunks);
  assert.deepEqual(none, { queued: 0, skipped: 0, docs: [] });
  const broken = { from: () => { throw new Error("표가 없음"); } } as unknown as SupabaseClient;
  const bad = await registerMatching(broken, ["d1"], chunks);
  assert.equal(bad.queued, 0);
  assert.match(bad.message ?? "", /표가 없음/);
});

test("문서 삭제는 문서 행을 지운다(조각·대응표 연쇄 삭제는 migrations.test.ts의 일반 문서 시험이 지킴)", async () => {
  const db = new FakeDb({ knowledge_documents: [doc("d1"), doc("d2")] });
  await deleteDocument(asDb(db), "d1");
  assert.deepEqual(db.rows("knowledge_documents").map((d) => d.doc_id), ["d2"]);
});

test("저장·삭제는 이 서버의 조각 캐시를 비운다 — 실패로 일부만 썼어도(개선 계획 P2-2: 연달아 올리면 낡은 조각으로 크기를 쟀음)", async () => {
  const db = new FakeDb();
  storeChunks("all", [{ k: 1 }]);
  await saveDocumentsAndChunks(asDb(db), [doc("d1")], [chunk("d1/a", "d1")]);
  assert.equal(cachedChunks("all"), null, "저장 뒤");
  storeChunks("all", [{ k: 1 }]);
  await assert.rejects(saveDocumentsAndChunks(asDb(db), [doc("d2")], [chunk("d2/a", "d2")], { beforeChunks: async () => { throw new Error("그림 실패"); } }));
  assert.equal(cachedChunks("all"), null, "실패해도");
  storeChunks("all", [{ k: 1 }]);
  await deleteDocument(asDb(db), "d1");
  assert.equal(cachedChunks("all"), null, "삭제 뒤");
});
