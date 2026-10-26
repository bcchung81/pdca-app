import assert from "node:assert/strict";
import { test } from "node:test";
import { registerTarget } from "./register.ts";

test("새 과제 등록 식별: 경영관리는 묶음 경영관리N → 평가단위 MG-N·과제번호 N-M(14-1), 주요사업은 묶음을 고르거나 파일에서 읽음", () => {
  assert.deepEqual(registerTarget({ group: "경영관리14", taskNo: "14-1", title: "국정과제 이행" }, ""), { ok: true, group: "경영관리14", unit: "MG-14", taskNo: "14-1", id: "경영관리14/14-1", title: "국정과제 이행" });
  assert.deepEqual(registerTarget({ group: "주요사업2", taskNo: "1-가", title: "t" }, ""), { ok: true, group: "주요사업2", unit: "BZ-2", taskNo: "1-가", id: "주요사업2/1-가", title: "t" });
  // 묶음을 파일에서 못 읽은 주요사업 카드는 고른 묶음
  const picked = registerTarget({ group: "주요사업?", taskNo: "2-나", title: "t" }, "주요사업3");
  assert.ok(picked.ok && picked.id === "주요사업3/2-나" && picked.unit === "BZ-3");
});

test("새 과제 등록 거절: 묶음 모름·번호 모양이 다름·경영관리 번호가 묶음과 안 맞음·과제명 없음", () => {
  assert.deepEqual(registerTarget({ group: "주요사업?", taskNo: "1-가", title: "t" }, ""), { ok: false, message: "주요사업을 골라 주세요." });
  const bad = registerTarget({ group: "경영관리3", taskNo: "1-가", title: "t" }, "");
  assert.ok(!bad.ok && /과제번호\(예: 14-1\)/.test(bad.message), "경영관리 번호 예시는 14-1");
  assert.ok(!registerTarget({ group: "주요사업1", taskNo: "1-1", title: "t" }, "").ok, "주요사업은 「N-가」");
  const mismatch = registerTarget({ group: "경영관리3", taskNo: "4-1", title: "t" }, "");
  assert.ok(!mismatch.ok && /맞지 않습니다/.test(mismatch.message));
  assert.ok(!registerTarget({ group: "경영관리3", taskNo: "3-1", title: " " }, "").ok);
});
