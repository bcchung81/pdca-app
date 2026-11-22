import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FakeDb } from "../prep/fake-db.ts";
import type { BundleChunk } from "./bundle.ts";
import { SHARED_CHARS_LIMIT, overLimitMessage, sharedChars, sharedSizeReport } from "./guard.ts";
import { PEER_DOC_ID, type PeerCase, peerChunks } from "./parsers/peer.ts";
import { PEER_SAVE_FAILED_MSG, storePeerCases } from "./peer-store.ts";

const asDb = (d: unknown) => d as SupabaseClient;
const doc = { doc_id: PEER_DOC_ID, title: "붙임2", sha256: "s-new" };
const peer = (good: string, seq = 1): PeerCase => ({ seq, kind: "기관", org: "시험기관", business: "시험사업", grade: "B+", good, bad: "", kca: false });
/** 지금 DB에 있는 기관 공통 조각 하나(요청 앞 공유 층 ① — 모든 사업에 붙음) */
const inst = (chars: number): BundleChunk => ({ chunk_key: "base/1", doc_id: "base", seq: 0, unit_type: "generic_section", track: "주요사업", business: null, title: "기관 공통", text: "가".repeat(chars), context_prefix: null, meta: null });

test("붙임2 크기 보호: 일반 문서와 같은 함수로 재고, 넘으면 DB에 아무것도 쓰지 않고 일반 문서와 같은 문구 — 넘지 않으면 저장(옛 사례는 prune)", async () => {
  const existing = [inst(SHARED_CHARS_LIMIT - 3000)];
  assert.ok(sharedChars(existing, "BZ-1") < SHARED_CHARS_LIMIT, "올리기 전에는 상한 안");
  const big = peerChunks([peer("나".repeat(5000))]);
  const db = new FakeDb();
  const r = await storePeerCases(asDb(db), doc, big, existing);
  assert.deepEqual(r, { ok: false, message: overLimitMessage(sharedSizeReport(existing, big as unknown as BundleChunk[]))! });
  assert.match((r as { message: string }).message, /상한/);
  assert.deepEqual(db.writes, [], "넘으면 문서·조각 어느 것도 안 씀");

  const small = peerChunks([peer("잘한 점 한 줄")]);
  const saved = new FakeDb({ knowledge_chunks: [{ chunk_key: `${PEER_DOC_ID}/old`, doc_id: PEER_DOC_ID }] });
  assert.deepEqual(await storePeerCases(asDb(saved), doc, small, existing), { ok: true });
  assert.deepEqual(saved.rows("knowledge_documents").map((d) => d.doc_id), [PEER_DOC_ID]);
  assert.deepEqual(saved.rows("knowledge_chunks").map((c) => c.chunk_key), small.map((c) => c.chunk_key), "옛 사례는 지우고 새 사례만");
});

test("붙임2 크기 보호: 다시 올리면 같은 문서의 옛 사례는 새 사례로 바꿔서 잼(두 번 세지 않음)", async () => {
  const old = peerChunks([peer("다".repeat(5000))]) as unknown as BundleChunk[];
  const existing = [inst(SHARED_CHARS_LIMIT - 7000), ...old];
  assert.ok(sharedChars(existing, "BZ-1") < SHARED_CHARS_LIMIT);
  const again = peerChunks([peer("라".repeat(5000))]);
  assert.deepEqual(await storePeerCases(asDb(new FakeDb()), doc, again, existing), { ok: true });
});

test("붙임2 저장 중간 실패: 되돌리지 않고 같은 파일을 다시 올리라고 안내(2026-11-22 결정) — 문서 행은 이미 바뀌었을 수 있음", async () => {
  const db = new FakeDb();
  // 문서 행은 쓰이고 조각 업서트에서 끊김
  const failing = { from: (t: string) => (t === "knowledge_chunks" ? { upsert: async () => ({ error: { message: "연결 끊김" } }) } : db.from(t)) };
  const r = await storePeerCases(asDb(failing), doc, peerChunks([peer("잘한 점")]), [inst(1000)]);
  assert.deepEqual(r, { ok: false, message: PEER_SAVE_FAILED_MSG });
  assert.match(PEER_SAVE_FAILED_MSG, /일부만 바뀌었을 수 있으니 같은 파일을 다시 올려 주세요/);
  assert.equal(db.rows("knowledge_documents").length, 1, "자동 되돌리기는 하지 않음");
});

test("붙임2 올리기 액션은 이 경로로만 저장: 모든 트랙 조각을 캐시 없이 읽어(일반 문서와 같음) storePeerCases에 넘기고, 공유 쓰기 함수를 직접 부르지 않음", () => {
  const src = readFileSync(resolve(import.meta.dirname, "../../app/(app)/admin/library/actions.ts"), "utf8");
  assert.ok(src.includes(`loadBundleChunks(supabase, "all", { fresh: true })`));
  assert.ok(src.includes("storePeerCases(supabase, doc, chunks, existing)"));
  assert.ok(!src.includes("saveDocumentsAndChunks"), "크기 보호를 건너뛰는 직접 저장이 없어야 함");
});
