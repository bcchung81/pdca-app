import assert from "node:assert/strict";
import { test } from "node:test";
import type { BundleChunk } from "./bundle.ts";
import { SHARED_CHARS_LIMIT, overLimitMessage, sharedChars, sharedSizeReport } from "./guard.ts";

const c = (key: string, over: Partial<BundleChunk> = {}): BundleChunk => ({
  chunk_key: key,
  doc_id: "d-base",
  seq: 0,
  unit_type: "generic_section",
  track: "주요사업",
  business: null,
  title: key,
  text: "가".repeat(1000),
  context_prefix: null,
  meta: null,
  ...over,
});

test("공유 층 글자 수: 기관 공통은 모든 사업에, 사업 공통은 그 사업에만, 검색 전용·범위 밖 트랙은 안 셈", () => {
  const chunks = [c("inst"), c("b1", { business: "BZ-1" }), c("b2", { business: "BZ-2" }), c("so", { meta: { search_only: true } }), c("mg", { track: "경영관리" })];
  const n1 = sharedChars(chunks, "BZ-1");
  const n2 = sharedChars(chunks, "BZ-2");
  const n3 = sharedChars(chunks, "BZ-3");
  assert.ok(n1 > 2000 && n1 < 2600, `BZ-1 기관+사업 공통 2조각(봉투 포함) ${n1}`);
  assert.equal(n1, n2, "같은 크기의 사업 공통이라 같음");
  assert.ok(n3 > 1000 && n3 < 1300, `BZ-3은 기관 공통 1조각만 ${n3}`);
});

test("공유 층 글자 수: 경평 초안 작성 방법론(meta.usage)은 경평 초안 요청에만 들어가므로 둘 중 큰 쪽으로 잼 — 모든 사업에 같이 늘고, 한도 보호는 경평 초안 쪽까지 지킴", () => {
  const base = [c("inst"), c("b1", { business: "BZ-1" })];
  const method = c("method", { doc_id: "d-method", meta: { usage: "report_method" } });
  for (const unit of ["BZ-1", "BZ-2", "BZ-3"]) {
    const without = sharedChars(base, unit);
    const withMethod = sharedChars([...base, method], unit);
    assert.ok(withMethod > without + 900 && withMethod < without + 1300, `${unit} 방법론 1조각(봉투 포함)만큼 늘어남: ${without} → ${withMethod}`);
  }
  const report = sharedSizeReport(base, [method]);
  assert.ok(report.every((r) => r.after > r.before), "올리면 모든 사업의 크기 보고가 늘어남");
});

test("트랙별 크기 보고: 주요사업은 늘 보고하고, 경영관리 지표 14개는 이번에 더하는 조각이 경영관리 요청에 닿을 때만 — 한 트랙 자료가 다른 트랙의 한도를 먹지 않음", () => {
  const biz = [c("biz/inst"), c("biz/b1", { business: "BZ-1" })];
  const mg = [c("mg/inst", { track: "경영관리", doc_id: "d-mg" }), c("mg/i3", { track: "경영관리", doc_id: "d-mg", business: "MG-3" })];
  const existing = [...biz, ...mg];
  // 주요사업 자료를 올리면 경영관리 지표 행은 안 나옴(예전 보고와 같음)
  const bizUp = sharedSizeReport(existing, [c("biz/new", { doc_id: "d-new", business: "BZ-2" })]);
  assert.deepEqual(bizUp.map((r) => r.unit), ["BZ-1", "BZ-2", "BZ-3"]);
  assert.ok(bizUp.every((r) => r.track === "주요사업"));
  // 경영관리 자료를 올리면 주요사업 3행 + 경영관리 14행
  const mgUp = sharedSizeReport(existing, [c("mg/new", { track: "경영관리", doc_id: "d-mgnew", business: "MG-5" })]);
  assert.equal(mgUp.length, 17);
  const row = (u: string) => mgUp.find((r) => r.unit === u)!;
  assert.ok(row("MG-5").after > row("MG-5").before, "올린 지표만 늘어남");
  assert.equal(row("MG-4").after, row("MG-4").before);
  assert.ok(row("MG-3").before > row("MG-4").before, "지표 공통 조각은 그 지표에만 셈");
  for (const u of ["BZ-1", "BZ-2", "BZ-3"]) assert.equal(row(u).after, row(u).before, "경영관리 자료는 주요사업 크기를 안 늘림");
  assert.equal(sharedChars(existing, "BZ-1"), sharedChars(biz, "BZ-1"), "주요사업 요청 크기에는 경영관리 조각이 안 섞임");
  // 가점은 두 트랙 요청에 모두 들어가므로 두 트랙 모두 보고
  const bonusUp = sharedSizeReport(existing, [c("bonus/1", { track: "가점", doc_id: "d-bonus" })]);
  assert.equal(bonusUp.length, 17);
  assert.ok(bonusUp.every((r) => r.after > r.before));
});

test("트랙별 한도: 경영관리 지표가 한도를 넘어도 주요사업은 안 넘고(반대도), 넘는 지표만 문장에 나옴", () => {
  const huge = c("mg/huge", { track: "경영관리", doc_id: "d-huge", business: "MG-2", text: "라".repeat(SHARED_CHARS_LIMIT) });
  const rows = sharedSizeReport([c("biz/inst")], [huge]);
  assert.ok(rows.filter((r) => r.track === "주요사업").every((r) => !r.over));
  assert.deepEqual(rows.filter((r) => r.over).map((r) => r.unit), ["MG-2"]);
  assert.match(overLimitMessage(rows)!, /MG-2/);
  assert.ok(!/BZ-/.test(overLimitMessage(rows)!));
});

test("크기 보고: 사업별 전·후·여유, 같은 문서를 다시 올리면 옛 조각을 빼고 새 조각으로 잼, 상한을 넘으면 over", () => {
  const existing = [c("inst"), c("inst2")];
  const add = [c("new1", { doc_id: "d-new", business: "BZ-2" })];
  const rows = sharedSizeReport(existing, add);
  assert.deepEqual(rows.map((r) => r.unit), ["BZ-1", "BZ-2", "BZ-3"]);
  assert.ok(rows[1].after > rows[1].before && rows[0].after === rows[0].before, "BZ-2에만 늘어남");
  assert.ok(rows.every((r) => !r.over && r.room === SHARED_CHARS_LIMIT - r.after));
  assert.equal(overLimitMessage(rows), null);
  const again = sharedSizeReport([...existing, ...add], [c("new1", { doc_id: "d-new", business: "BZ-2", text: "나".repeat(2000) })]);
  assert.ok(again[1].after > again[1].before, "같은 문서 조각은 바꿔서 잼(두 번 세지 않음)");
  const big = sharedSizeReport(existing, [c("huge", { doc_id: "d-huge", text: "다".repeat(SHARED_CHARS_LIMIT) })]);
  assert.ok(big.every((r) => r.over));
  assert.match(overLimitMessage(big)!, /검색 전용/);
  assert.match(overLimitMessage(big)!, /BZ-1/);
});
