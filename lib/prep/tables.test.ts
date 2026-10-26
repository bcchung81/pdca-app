import assert from "node:assert/strict";
import { test } from "node:test";
import { PREP_READ_ONLY_TABLES, PREP_WRITE_TABLES, assertPrepTable } from "./tables.ts";

test("쓸 수 있는 표는 읽기·쓰기 모두 통과", () => {
  for (const t of PREP_WRITE_TABLES) {
    assertPrepTable(t, "read");
    assertPrepTable(t, "write");
  }
});

test("읽기 전용 표는 읽기만 — 쓰기를 요청하면 던짐", () => {
  for (const t of PREP_READ_ONLY_TABLES) {
    assertPrepTable(t, "read");
    assert.throws(() => assertPrepTable(t, "write"), /읽기만/);
  }
});

test("한정 목록 밖의 표(사용자·프로필·점검 등)는 읽기도 쓰기도 던짐", () => {
  for (const t of ["profiles", "inspections", "card_versions", "knowledge_card_links", "report_comments"]) {
    assert.throws(() => assertPrepTable(t, "read"), /쓸 수 없는 표/);
    assert.throws(() => assertPrepTable(t, "write"), /쓸 수 없는 표/);
  }
});

test("카드 원장·카드 전용 자료·보고서는 처리기가 쓰지 못한다(원장은 로그인 사용자 권한으로만 바뀜)", () => {
  for (const t of ["cards", "card_materials", "report_materials", "reports", "knowledge_chunks"]) assert.throws(() => assertPrepTable(t, "write"));
});
