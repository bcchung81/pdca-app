import assert from "node:assert/strict";
import { test } from "node:test";
import { allowed, dbTargetFrom, guardProduction } from "./db-target.ts";

test("dbTargetFrom: 비어 있으면 production(안전 쪽)", () => {
  assert.equal(dbTargetFrom({}), "production");
  assert.equal(dbTargetFrom({ DB_TARGET: "" }), "production");
});

test("dbTargetFrom: development만 개발로 봄", () => {
  assert.equal(dbTargetFrom({ DB_TARGET: "development" }), "development");
  assert.equal(dbTargetFrom({ DB_TARGET: "production" }), "production");
  assert.equal(dbTargetFrom({ DB_TARGET: "아무값" }), "production");
});

test("allowed: --allow-production 인자 유무", () => {
  assert.equal(allowed(["node", "script.ts"]), false);
  assert.equal(allowed(["node", "script.ts", "--allow-production"]), true);
});

test("guardProduction: development면 그냥 통과", () => {
  let exited = false;
  const origExit = process.exit;
  process.exit = (() => {
    exited = true;
    return undefined as never;
  }) as typeof process.exit;
  try {
    guardProduction("시험", [], { DB_TARGET: "development" });
    assert.equal(exited, false);
  } finally {
    process.exit = origExit;
  }
});

test("guardProduction: production이고 --allow-production 없으면 종료", () => {
  let exitCode: number | undefined;
  const origExit = process.exit;
  process.exit = ((code?: number) => {
    exitCode = code;
    throw new Error("exit");
  }) as typeof process.exit;
  try {
    assert.throws(() => guardProduction("시험", [], {}));
    assert.equal(exitCode, 1);
  } finally {
    process.exit = origExit;
  }
});

test("guardProduction: production이라도 --allow-production이면 통과", () => {
  let exited = false;
  const origExit = process.exit;
  process.exit = (() => {
    exited = true;
    return undefined as never;
  }) as typeof process.exit;
  try {
    guardProduction("시험", ["--allow-production"], { DB_TARGET: "production" });
    assert.equal(exited, false);
  } finally {
    process.exit = origExit;
  }
});
