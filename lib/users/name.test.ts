import assert from "node:assert/strict";
import { test } from "node:test";
import { NAME_MAX, checkDisplayName } from "./name.ts";
import { planRow } from "./plan.ts";

test("checkDisplayName: 공백을 정돈하고, 빈 이름과 40자 초과는 자르지 않고 거절", () => {
  assert.deepEqual(checkDisplayName("  홍길동   차장 "), { ok: true, name: "홍길동 차장" });
  assert.deepEqual(checkDisplayName("홍\u200b길동"), { ok: true, name: "홍 길동" }, "보이지 않는 글자는 공백으로");
  assert.deepEqual(checkDisplayName(""), { ok: false, name: "", message: "이름이 비어 있습니다" });
  assert.deepEqual(checkDisplayName(" \t \n"), { ok: false, name: "", message: "이름이 비어 있습니다" });
  assert.equal(checkDisplayName("가".repeat(NAME_MAX)).ok, true, "40자는 통과");
  const long = checkDisplayName("가".repeat(NAME_MAX + 1));
  assert.equal(long.ok, false);
  assert.equal(long.ok ? "" : long.message, "이름이 40자를 넘습니다");
  assert.equal(long.name.length, NAME_MAX + 1, "넘는 이름을 조용히 자르지 않음");
});

test("일괄 등록 판정(planRow)도 같은 이름 규칙", () => {
  const ctx = { actorRole: "pmo" as const, allowedDomains: ["kca.kr"], teams: new Map([[1, { id: 1, name: "검사기획팀", hq: null }]]), existing: () => null };
  for (const raw of ["", "가".repeat(NAME_MAX + 1)]) {
    const row = planRow({ name: raw, email: "a@kca.kr", teamId: 1 }, ctx);
    assert.equal(row.status, "invalid");
    assert.equal(row.message, (checkDisplayName(raw) as { message: string }).message);
  }
  assert.equal(planRow({ name: " 홍길동 ", email: "a@kca.kr", teamId: 1 }, ctx).name, "홍길동");
});
