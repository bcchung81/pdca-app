// menuOf(머리 더보기 메뉴) — HWPX 항목은 두 트랙 모두 「HWPX 내려받기」·「HWPX(개조식)」 2개, 기존 양식(?form=a)은 메뉴에 없고 주요사업 대체 안내로만.
import assert from "node:assert/strict";
import { test } from "node:test";
import { menuOf } from "./derive.ts";

const base = { uid: "u1", teamQs: "", selfHref: "/reports/cards/u1", reportId: null, staffView: false, evalUnitId: "1", hasSpec: true, version: "v1", module: 0 };

for (const mg of [false, true]) {
  test(`menuOf: ${mg ? "경영관리" : "주요사업"} HWPX 항목은 내려받기·개조식 2개`, () => {
    const items = menuOf({ ...base, mg });
    const hwpx = items.filter((i) => i.label.startsWith("HWPX"));
    assert.deepEqual(hwpx.map((i) => i.label), ["HWPX 내려받기", "HWPX(개조식)"]);
    assert.ok(!items.some((i) => i.href.includes("form=a")));
    const fb = hwpx[0].dom?.fallback;
    assert.equal(fb?.href.includes("form=a"), !mg, "주요사업 대체는 기존 양식, 경영관리는 개조식");
  });
}
