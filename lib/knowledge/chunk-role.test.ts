// chunkRole·isLatest: 조각 성격 분류표(운영 DB 실측 2026-10-26)와 최신·대표 판정을 지킵니다.

import assert from "node:assert/strict";
import { test } from "node:test";
import { DIGEST_ROLES, ROLE_LABEL, SELECTABLE_ROLES, chunkRole, isLatest, type ChunkRole } from "./chunk-role.ts";

/** 분류표를 그대로 옮긴 기대값: [문서, unit_type, 기대 성격] */
const TABLE: [string, string, ChunkRole][] = [
  ["plan-2607", "plan_section", "rule"],
  ["plan-2607", "handbook_indicator", "rule"],
  ["plan-2607", "checklist_group", "rule"],
  ["plan-2607", "task_list_row", "rule"],
  ["pool25-biz", "pool_indicator", "rule"],
  ["goal30-2605", "goal_indicator", "rule"],
  ["ceo24-2605", "ceo_indicator", "rule"],
  ["ax26-2605", "ax_task", "rule"],
  ["plan-2607", "evaluator_comment", "critique"],
  ["mid25-biz", "finding_row", "critique"],
  ["mid25-mg", "finding_row", "critique"],
  ["corr25-2610", "corrective_action", "critique"],
  ["att3-2604", "qa_pair", "survey"],
  ["att3-2604", "qa_part", "survey"],
  ["att3-2604", "request_evidence", "survey"],
  ["att3-2604", "evidence_image", "survey"],
  ["qa25-mg-01", "qa_pair", "survey"],
  ["rpt25-biz", "report_section", "prior"],
  ["rpt25-mg-01", "report_chapter", "prior"],
  ["peer25-biz", "peer_case", "case"],
  ["core25-mg", "core_item", "evidence"],
];

test("분류표: 실측 unit_type 전부가 기대 성격으로 나온다", () => {
  for (const [doc_id, unit_type, want] of TABLE) {
    assert.equal(chunkRole({ doc_id, unit_type, meta: {} }), want, `${doc_id}/${unit_type}`);
  }
});

test("generic_section: usage가 report_method면 method, 없으면 other", () => {
  assert.equal(chunkRole({ doc_id: "up-1", unit_type: "generic_section", meta: { usage: "report_method" } }), "method");
  assert.equal(chunkRole({ doc_id: "up-1", unit_type: "generic_section", meta: { generic: true } }), "other");
  assert.equal(chunkRole({ doc_id: "up-1", unit_type: "generic_section", meta: null }), "other");
});

test("모르는 unit_type은 other, meta 없어도 동작", () => {
  assert.equal(chunkRole({ doc_id: "x", unit_type: "unknown_kind" }), "other");
  assert.equal(chunkRole({ doc_id: "x", unit_type: "constructor" }), "other");
});

test("DIGEST_ROLES와 SELECTABLE_ROLES는 겹치지 않고, 둘 다 method·evidence·other를 포함하지 않는다", () => {
  for (const r of DIGEST_ROLES) assert.ok(!SELECTABLE_ROLES.includes(r), r);
  for (const bad of ["method", "evidence", "other"] as const) {
    assert.ok(!DIGEST_ROLES.includes(bad), `DIGEST ${bad}`);
    assert.ok(!SELECTABLE_ROLES.includes(bad), `SELECTABLE ${bad}`);
  }
});

test("ROLE_LABEL은 모든 성격에 한국어 이름이 있다", () => {
  for (const [, , r] of TABLE) assert.ok(ROLE_LABEL[r].length > 0, r);
  assert.equal(ROLE_LABEL.other, "기타");
});

test("isLatest: duplicate_of는 false, search_only는 false, 기본은 true", () => {
  assert.equal(isLatest({ doc_id: "up-1", meta: { duplicate_of: "plan-2607/x" } }), false);
  assert.equal(isLatest({ doc_id: "up-1", meta: { search_only: true } }), false);
  assert.equal(isLatest({ doc_id: "up-1", meta: { search_only: false } }), true);
  assert.equal(isLatest({ doc_id: "plan-2607", meta: {} }), true);
  assert.equal(isLatest({ doc_id: "plan-2607", meta: null }), true);
});
