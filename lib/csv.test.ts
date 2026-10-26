import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell, toCsv } from "./csv.ts";

test("CSV 칸: 따옴표·쉼표·줄바꿈, 수식 주입 방지, BOM", () => {
  assert.equal(csvCell('가, "나"'), '"가, ""나"""');
  assert.equal(csvCell("줄\n바꿈"), '"줄\n바꿈"');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("-3"), "'-3");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(45.5), "45.5");
  assert.equal(toCsv([["a", "b"], [1, 2]]), "﻿a,b\r\n1,2\r\n");
});
