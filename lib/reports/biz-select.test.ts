// 주요사업 초안 첫 선택·off 열쇠(biz-select.ts) — 구성안에서 고른 biz가 집필 요청의 off로 지워지지 않게
import assert from "node:assert/strict";
import { test } from "node:test";
import { approxChars, bizNoParts, initialBiz, offKeysOf } from "./biz-select.ts";

const cand = (id: string) => ({ id }) as never;
const biz = [cand("a"), cand("b"), cand("c")];

test("초안 없이 구성안 biz만 있으면 첫 선택 = 그 biz, off(b:)에 안 들어감", () => {
  const first = initialBiz({ used: null, outlineBiz: ["b"], biz });
  assert.deepEqual(first, ["b"]);
  assert.deepEqual(offKeysOf([], biz, new Set(first)), ["b:a", "b:c"]);
});

test("지난 초안의 biz가 우선, 둘 다 없으면 빈 선택, 후보에 없는 id는 뺌", () => {
  assert.deepEqual(initialBiz({ used: { biz: ["c"] }, outlineBiz: ["b"], biz }), ["c"]);
  assert.deepEqual(initialBiz({ used: null, biz }), []);
  assert.deepEqual(initialBiz({ used: null, outlineBiz: ["zzz"], biz }), []);
});

test("지워진 주요사업: 저장된 biz(지난 초안·구성안) 중 후보에 없는 것은 b:로 함께 보내 다음 요청에서 빠짐", () => {
  const off = offKeysOf(["c:1"], biz, new Set(["a"]), ["a", "gone", "gone"]);
  assert.deepEqual(off, ["c:1", "b:b", "b:c", "b:gone"], "후보에 있는 저장 biz(a)는 그대로, 없는 것(gone)만 한 번 더함");
  assert.deepEqual(offKeysOf([], biz, new Set(["a", "b", "c"]), ["a"]), [], "모두 후보에 있고 고르면 off 없음");
});

test("approxChars: 0은 「약 1천 자」가 아니라 0자, 1천 미만은 n자, 이상은 천·만 단위", () => {
  assert.equal(approxChars(0), "0자");
  assert.equal(approxChars(420), "420자");
  assert.equal(approxChars(12_000), "약 1.2만 자");
  assert.equal(approxChars(3400), "약 3천 자");
});

test("bizNoParts: 묶음 번호와 과제번호를 나눔(같은 5-가도 묶음으로 가름), 형식이 다르면 통째로", () => {
  assert.deepEqual(bizNoParts("주요사업3 5-가"), { group: "3", no: "5-가" });
  assert.deepEqual(bizNoParts("주요사업5 5-가"), { group: "5", no: "5-가" });
  assert.deepEqual(bizNoParts("기타"), { group: "", no: "기타" });
});
