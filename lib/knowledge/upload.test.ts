import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { BundleChunk } from "./bundle.ts";
import { SHARED_CHARS_LIMIT } from "./guard.ts";
import { type UploadDeps, type UploadInput, UPLOAD_SCOPES, ingestUploadedFile, isUploadScope, kordocDeps, safeStorageName, scopeTags } from "./upload.ts";

const blocks = (n: number, size = 900) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, type: "text", text: String.fromCharCode(0xac00 + (i % 50)).repeat(size), page: 1 + i, breadcrumb: [] }));
const okRead = (chunks: unknown): UploadDeps => ({ read: async () => ({ success: true, chunks }) });
const base = (over: Partial<UploadInput> = {}): UploadInput => ({
  docId: "up-test0001",
  fileName: "점검 지침.pdf",
  storagePath: "knowledge/up-test0001/source.pdf",
  bytes: new Uint8Array([1, 2, 3, 4]),
  title: "시험 지침",
  edition: " 2026.9. ",
  basisYear: 2026,
  scope: "institution",
  existing: [],
  existingShas: new Map(),
  uploadedBy: "u-1",
  ...over,
});

test("범위 선택 → 조각 꼬리표: 기관 공통=사업 없음·공통지표=BZ-4·가점=가점 트랙·사업 공통=BZ-n·검색 전용=표지", () => {
  assert.deepEqual(scopeTags("institution"), { track: "주요사업", business: null, searchOnly: false });
  assert.deepEqual(scopeTags("common-kpi"), { track: "주요사업", business: "BZ-4", searchOnly: false });
  assert.deepEqual(scopeTags("bonus"), { track: "가점", business: null, searchOnly: false });
  assert.deepEqual(scopeTags("BZ-2"), { track: "주요사업", business: "BZ-2", searchOnly: false });
  assert.deepEqual(scopeTags("search-only"), { track: "주요사업", business: null, searchOnly: true });
  assert.deepEqual(scopeTags("report-method"), { track: "주요사업", business: null, searchOnly: false, usage: "report_method" });
  // 경영관리 트랙(2026-10-07): 트랙 공통은 경영관리 트랙·지표 미지정(①), 지표 공통은 MG-n(③)
  assert.deepEqual(scopeTags("mg-institution"), { track: "경영관리", business: null, searchOnly: false });
  assert.deepEqual(scopeTags("MG-3"), { track: "경영관리", business: "MG-3", searchOnly: false });
  assert.equal(UPLOAD_SCOPES.length, 8 + 1 + 14, "기존 8 + 경영관리 공통 1 + 지표 14");
  assert.ok(isUploadScope("MG-14") && !isUploadScope("MG-15") && isUploadScope("mg-institution"));
  assert.ok(isUploadScope("report-method"));
  assert.ok(isUploadScope("BZ-3") && !isUploadScope("BZ-4") && !isUploadScope("아무거나"));
});

test("저장소 키는 영문 고정 이름(한글 파일 이름을 키에 쓰지 않음)", () => {
  assert.equal(safeStorageName("(첨부3) 실사 답변자료.PDF"), "source.pdf");
  assert.equal(safeStorageName("noext"), "source");
});

test("정상: 문서 행·조각·크기 보고가 나오고, 같은 문서 id·정규화한 제목·판으로 기록되며, sha256이 붙는다", async () => {
  const r = await ingestUploadedFile(base(), okRead(blocks(6)));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.document!.doc_id, "up-test0001");
  assert.equal(r.document!.edition, "2026.9.", "앞뒤 공백 제거");
  assert.deepEqual(r.document!.tracks, ["주요사업"]);
  assert.equal(r.document!.status, "ingest");
  assert.equal(r.document!.parser_version, "generic-1");
  assert.equal(r.document!.uploaded_by, "u-1");
  assert.match(String(r.document!.sha256), /^[0-9a-f]{64}$/);
  assert.equal(r.document!.chunk_count, r.chunks!.length);
  assert.deepEqual(r.document!.unit_counts, { generic_section: r.chunks!.length });
  assert.match(String(r.document!.scope), /기관 공통/);
  assert.ok(r.chunks!.every((c) => c.doc_id === "up-test0001" && c.unit_type === "generic_section"));
  assert.deepEqual(r.guard.map((g) => g.unit), ["BZ-1", "BZ-2", "BZ-3"]);
  assert.ok(r.guard.every((g) => g.after > g.before && !g.over));
});

test("거절: 형식·빈 파일·제목 없음·너무 큼·같은 파일(sha256 같음)·읽기 실패 — 모두 ok:false이고 아무 행도 안 만듦", async () => {
  assert.match((await ingestUploadedFile(base({ fileName: "a.exe" }), okRead(blocks(3)))).message!, /올릴 수 있습니다/);
  assert.match((await ingestUploadedFile(base({ fileName: "pdf" }), okRead(blocks(3)))).message!, /올릴 수 있습니다/, "점이 없는 이름은 확장자 없음(이름이 pdf여도 통과하지 않음)");
  assert.match((await ingestUploadedFile(base({ bytes: new Uint8Array() }), okRead(blocks(3)))).message!, /빈 파일/);
  assert.match((await ingestUploadedFile(base({ title: "  " }), okRead(blocks(3)))).message!, /제목/);
  const first = await ingestUploadedFile(base(), okRead(blocks(6)));
  const dup = await ingestUploadedFile(base({ existingShas: new Map([["up-old00001", String(first.document!.sha256)]]) }), okRead(blocks(6)));
  assert.equal(dup.ok, false);
  assert.equal(dup.duplicateOf, "up-old00001");
  assert.ok(!dup.document && !dup.chunks);
  const bad = await ingestUploadedFile(base(), { read: async () => ({ success: false, reason: "PASSWORD" }) });
  assert.match(bad.message!, /읽지 못했습니다\(PASSWORD\)/);
});

test("검산 error(스캔 문서처럼 글이 거의 없음)면 이유를 그대로 알리고 저장하지 않는다", async () => {
  const r = await ingestUploadedFile(base(), okRead([{ id: "c0", type: "text", text: "표지", page: 1 }]));
  assert.equal(r.ok, false);
  assert.match(r.message!, /검산에서 멈췄습니다.*읽은 글이 충분함/);
  assert.match(r.message!, /스캔/);
  assert.ok(!r.chunks);
});

test("크기 보호: 이 범위로 올리면 공유 층이 상한을 넘으면 멈추고, 검색 전용이면 같은 문서도 올라간다", async () => {
  const filler: BundleChunk = { chunk_key: "big/1", doc_id: "d-big", seq: 0, unit_type: "qa_pair", track: "주요사업", business: null, title: "t", text: "가".repeat(SHARED_CHARS_LIMIT - 500), context_prefix: null, meta: null };
  const r = await ingestUploadedFile(base({ existing: [filler] }), okRead(blocks(6, 2000)));
  assert.equal(r.ok, false);
  assert.match(r.message!, /상한/);
  assert.match(r.message!, /검색 전용/);
  assert.ok(r.guard.every((g) => g.over));
  const only = await ingestUploadedFile(base({ existing: [filler], scope: "search-only" }), okRead(blocks(6, 2000)));
  assert.equal(only.ok, true, only.message);
  assert.ok(only.guard.every((g) => g.after === g.before), "검색 전용은 AI 근거가 안 늘어남");
  assert.ok(only.chunks!.every((c) => c.meta.search_only === true));
});

test("경평 초안 작성 방법론으로 올리면 조각 meta.usage가 붙고(검색 전용 표지는 없음), 크기 보호는 검색 전용과 달리 그대로 적용된다", async () => {
  const r = await ingestUploadedFile(base({ scope: "report-method" }), okRead(blocks(2, 800)));
  assert.equal(r.ok, true, r.message);
  assert.ok(r.chunks!.every((c) => c.meta.usage === "report_method" && c.meta.search_only === undefined && c.business === null && c.track === "주요사업"));
  assert.match(String(r.document!.scope), /경평 초안 작성 방법론/);
  const filler: BundleChunk = { chunk_key: "big/1", doc_id: "d-big", seq: 0, unit_type: "qa_pair", track: "주요사업", business: null, title: "t", text: "가".repeat(SHARED_CHARS_LIMIT - 500), context_prefix: null, meta: null };
  const over = await ingestUploadedFile(base({ existing: [filler], scope: "report-method" }), okRead(blocks(6, 2000)));
  assert.equal(over.ok, false, "경평 초안 요청이 한도를 넘으면 멈춤");
  assert.match(over.message!, /상한/);
});

// 실제 원본(이 컴퓨터 resources/knowledge — git 밖) 한 개를 진짜 kordoc으로 읽는다: 서버·CLI가 쓰는 경로 그대로
const REAL = resolve(import.meta.dirname, "../../resources/knowledge/checklist-2605.hwp");
test("실제 한글(hwp) 파일을 kordoc으로 읽어 조각·검산·보호까지 통과한다(원본이 없으면 건너뜀)", { skip: !existsSync(REAL) && "원본(resources/knowledge/checklist-2605.hwp)이 없음" }, async () => {
  const r = await ingestUploadedFile(base({ fileName: "점검표.hwp", bytes: new Uint8Array(readFileSync(REAL)) }), kordocDeps);
  assert.equal(r.ok, true, r.message);
  assert.ok(r.chunks!.length >= 5, `조각 ${r.chunks!.length}`);
  assert.equal(r.checks.filter((c) => !c.ok && c.level === "error").length, 0);
  assert.ok(r.stats!.chars > 10_000);
});
