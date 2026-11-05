import assert from "node:assert/strict";
import { test } from "node:test";
import { UNKNOWN_USER, whoOf } from "./who.ts";

test("올린 사람 이름: 읽은 프로필은 이름(없으면 메일), 못 읽은 사람은 「다른 사용자」, 기록 없음은 null", () => {
  const who = whoOf([
    { id: "u1", display_name: "담당자 갑", email: "a@example.test" },
    { id: "u2", display_name: null, email: "b@example.test" },
  ]);
  assert.equal(who("u1"), "담당자 갑");
  assert.equal(who("u2"), "b@example.test");
  assert.equal(who("u3"), UNKNOWN_USER);
  assert.equal(UNKNOWN_USER, "다른 사용자");
  assert.equal(who(null), null);
  assert.equal(who(undefined), null);
});
