// ruleScopeChecks: 적재 결과가 규칙 범위(층 ①②③)를 실제로 채우는지 미리 확인하는 검산.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readSeedInput } from "../db/seed-files.ts";
import { HAS_SEED_CARDS } from "../testing/originals.ts";
import { LENS_CRITERIA_KEYS } from "../reports/lens.ts";
import { makeChunk, type ChunkInput } from "./chunk.ts";
import { ruleScopeChecks } from "./scope-check.ts";
import type { KnowledgeChunk } from "./types.ts";

const chunk = (over: Partial<ChunkInput> & { chunk_key: string; doc_id: string; unit_type: KnowledgeChunk["unit_type"] }): KnowledgeChunk =>
  makeChunk({
    track: "주요사업",
    business: null,
    eval_item: null,
    measure: null,
    title: over.chunk_key,
    context_prefix: over.chunk_key,
    blocks: ["글"],
    pdf_page_start: 1,
    ...over,
  });

/** 검산을 모두 통과할 최소 조각 집합(사업마다 필요한 단위 유형 하나씩 + 평가 기준 6개 + 서술 1개 + 실사 사업 미지정 1개) */
function minimalChunks(): KnowledgeChunk[] {
  const out: KnowledgeChunk[] = [];
  for (const key of LENS_CRITERIA_KEYS) out.push(chunk({ chunk_key: key, doc_id: "plan-2607", unit_type: "handbook_indicator" }));
  out.push(chunk({ chunk_key: "plan-2607/narr/I/1/s1", doc_id: "plan-2607", unit_type: "plan_section", track: "주요사업" }));
  for (const biz of ["BZ-1", "BZ-2", "BZ-3"] as const) {
    out.push(chunk({ chunk_key: `plan-2607/eval/${biz}/1`, doc_id: "plan-2607", unit_type: "evaluator_comment", business: biz }));
    out.push(chunk({ chunk_key: `plan-2607/handbook26/${biz}/1`, doc_id: "plan-2607", unit_type: "handbook_indicator", business: biz }));
    out.push(chunk({ chunk_key: `plan-2607/tasks/${biz}/1`, doc_id: "plan-2607", unit_type: "task_list_row", business: biz }));
    out.push(chunk({ chunk_key: `mid25-biz/${biz}/1`, doc_id: "mid25-biz", unit_type: "finding_row", business: biz }));
    out.push(chunk({ chunk_key: `att3-2604/qa/${biz}/1`, doc_id: "att3-2604", unit_type: "qa_pair", business: biz }));
    out.push(chunk({ chunk_key: `rpt25-biz/${biz}/1`, doc_id: "rpt25-biz", unit_type: "report_section", business: biz }));
    out.push(chunk({ chunk_key: `pool25-biz/${biz}/1`, doc_id: "pool25-biz", unit_type: "pool_indicator", business: biz }));
  }
  out.push(chunk({ chunk_key: "att3-2604/qa/bonus/1", doc_id: "att3-2604", unit_type: "qa_pair", business: null, track: "가점" }));
  return out;
}

test("ruleScopeChecks: 규칙 범위를 모두 채우면 error 검산 전부 통과", () => {
  const checks = ruleScopeChecks(minimalChunks());
  const failed = checks.filter((c) => c.level === "error" && !c.ok);
  assert.deepEqual(failed, []);
  assert.ok(checks.length > 0);
});

test("ruleScopeChecks: 평가 기준 키 하나가 빠지면 그 키 이름을 담아 실패", () => {
  const missingKey = LENS_CRITERIA_KEYS[0];
  const chunks = minimalChunks().filter((c) => c.chunk_key !== missingKey);
  const checks = ruleScopeChecks(chunks);
  const failed = checks.find((c) => c.name.includes("평가 기준 고정 키"));
  assert.ok(failed);
  assert.equal(failed.ok, false);
  assert.ok(String(failed.actual).includes(missingKey), `actual에 ${missingKey} 없음: ${failed.actual}`);
});

test("ruleScopeChecks: 한 사업의 qa_pair가 빠지면 그 사업 항목만 실패", () => {
  const chunks = minimalChunks().filter((c) => !(c.doc_id === "att3-2604" && c.unit_type === "qa_pair" && c.business === "BZ-2"));
  const checks = ruleScopeChecks(chunks);
  const bz2 = checks.find((c) => c.name.includes("BZ-2 qa_pair"));
  const bz1 = checks.find((c) => c.name.includes("BZ-1 qa_pair"));
  assert.ok(bz2 && !bz2.ok, "BZ-2 qa_pair 실패해야 함");
  assert.ok(bz1 && bz1.ok, "BZ-1 qa_pair는 그대로 통과해야 함");
});

test("ruleScopeChecks: 이번 적재에 없는 문서는 그 항목을 건너뜀(거짓 실패 없음)", () => {
  const chunks = minimalChunks().filter((c) => c.doc_id !== "mid25-biz");
  const checks = ruleScopeChecks(chunks);
  assert.ok(!checks.some((c) => c.name.includes("finding_row")), "mid25-biz 없으면 finding_row 항목이 없어야 함");
  const failed = checks.filter((c) => c.level === "error" && !c.ok);
  assert.deepEqual(failed, []);
});

// readSeedInput은 카드 원본(seed/cards — git 밖)도 읽으므로, 없으면 공통 지식도 없는 것으로 봄
const seed = HAS_SEED_CARDS ? readSeedInput(new URL("../..", import.meta.url).pathname) : { knowledgeAvailable: false, chunks: undefined };
test("ruleScopeChecks: 실제 적재 결과(있으면)는 규칙 범위를 모두 채움", { skip: seed.knowledgeAvailable ? false : "공통 지식 적재 결과 없음" }, () => {
  const checks = ruleScopeChecks(seed.chunks!);
  const failed = checks.filter((c) => c.level === "error" && !c.ok);
  assert.deepEqual(failed, []);
});

test("공통지표(BZ-4) 조각의 소속 사업 검산: 질의응답·지적·증빙은 related_business가 있어야 통과, 총평·편람은 면제", () => {
  const find = (cs: KnowledgeChunk[]) => ruleScopeChecks(cs).find((x) => x.name.includes("소속 사업(related_business)"));
  assert.equal(find(minimalChunks()), undefined, "공통지표 조각이 없으면 이 검사 항목도 없음");
  const kpi = (key: string, unit_type: KnowledgeChunk["unit_type"], related: unknown) => chunk({ chunk_key: key, doc_id: "att3-2604", unit_type, business: "BZ-4", meta: { related_business: related } });
  const ok = find([...minimalChunks(), kpi("att3-2604/s1/Q01", "qa_pair", "BZ-1"), kpi("att3-2604/s1/Q/ev/11-1", "evidence_image", "BZ-3")])!;
  assert.equal(ok.ok, true);
  const bad = find([...minimalChunks(), kpi("att3-2604/s1/Q01", "qa_pair", "BZ-1"), kpi("att3-2604/s1/Q99", "qa_pair", null), kpi("att3-2604/s1/Q/ev/11-2", "evidence_image", "BZ-4")])!;
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.actual, ["att3-2604/s1/Q99", "att3-2604/s1/Q/ev/11-2"]);
  assert.equal(bad.level, "error", "새 지표 이름이 사전에 없으면 적재가 멈춤");
  const exempt = find([...minimalChunks(), kpi("att3-2604/s1/Q01", "qa_pair", "BZ-2"), chunk({ chunk_key: "plan-2607/eval25/BZ-4/total/fit/p01", doc_id: "plan-2607", unit_type: "evaluator_comment", business: "BZ-4" }), chunk({ chunk_key: "plan-2607/handbook26/BZ-4", doc_id: "plan-2607", unit_type: "handbook_indicator", business: "BZ-4" })])!;
  assert.equal(exempt.ok, true, "총평(total)·편람은 소속 사업이 없어도 됨");
});
