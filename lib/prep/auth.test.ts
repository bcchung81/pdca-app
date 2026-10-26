import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrepAuthorized } from "./auth.ts";

test("CRON_SECRET과 Bearer 값이 같을 때만 통과", () => {
  assert.equal(isPrepAuthorized("Bearer s3cret", "s3cret"), true);
  assert.equal(isPrepAuthorized("Bearer s3cret!", "s3cret"), false);
  assert.equal(isPrepAuthorized("Bearer wrong", "s3cret"), false);
  assert.equal(isPrepAuthorized("s3cret", "s3cret"), false, "Bearer 접두사 없음");
  assert.equal(isPrepAuthorized("bearer s3cret", "s3cret"), false);
});

test("비밀이 비어 있거나 헤더가 없으면 늘 거절(설정 실수로 열리지 않음)", () => {
  assert.equal(isPrepAuthorized("Bearer ", ""), false);
  assert.equal(isPrepAuthorized("Bearer x", undefined), false);
  assert.equal(isPrepAuthorized(null, "s3cret"), false);
  assert.equal(isPrepAuthorized("Bearer undefined", undefined), false);
});
