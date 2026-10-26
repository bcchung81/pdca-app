import assert from "node:assert/strict";
import { test } from "node:test";
import { compareTaskNo, compareUnitId, currentPeriod } from "./view.ts";

test("과제번호 정렬: 실행과제 번호(수) → 가나다", () => {
  assert.deepEqual(["2-가", "10-가", "1-다", "1-가", "1-나"].sort(compareTaskNo), ["1-가", "1-나", "1-다", "2-가", "10-가"]);
});

test("평가단위 id 정렬: 번호는 숫자 순(MG-10이 MG-2 뒤) — 주요사업 BZ-1~3과 카드 묶음 이름도 같은 규칙", () => {
  assert.deepEqual(["MG-10", "MG-2", "MG-1", "MG-14", "MG-9"].sort(compareUnitId), ["MG-1", "MG-2", "MG-9", "MG-10", "MG-14"]);
  assert.deepEqual(["경영관리11", "경영관리3", "경영관리1"].sort(compareUnitId), ["경영관리1", "경영관리3", "경영관리11"]);
  assert.deepEqual(["BZ-3", "BZ-1", "BZ-2"].sort(compareUnitId), ["BZ-1", "BZ-2", "BZ-3"]);
});

test("작성 기간은 서울 기준 월", () => {
  assert.equal(currentPeriod(new Date("2026-09-30T16:00:00Z")), "2026-10"); // 서울 10.1 01시
  assert.equal(currentPeriod(new Date("2026-09-25T03:00:00Z")), "2026-09");
});
