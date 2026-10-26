import assert from "node:assert/strict";
import { test } from "node:test";
import { isFullView } from "./full-view.ts";

test("전체 보기: 카드 전체 페이지·과제별 초안은 늘(?full=1이 있어도 같음), 목록·현행화·보관함·내려받기는 아님", () => {
  assert.equal(isFullView("/cards/ae8389e9-d714-487a-ae98-1397bcdba6fe"), true);
  assert.equal(isFullView("/cards/ae8389e9-d714-487a-ae98-1397bcdba6fe/"), true);
  for (const p of ["/cards", "/cards/import", "/cards/import/12", "/cards/archive", "/cards/export", "/cards/abc/hwpx", "/my", "/reports/cards"]) assert.equal(isFullView(p, "1"), false, p);
  assert.equal(isFullView("/reports/cards/abc"), true);
  assert.equal(isFullView("/reports/cards/abc/"), true);
  assert.equal(isFullView("/reports/cards/abc", "0"), true);
  assert.equal(isFullView("/reports/cards/abc", "1"), true);
  assert.equal(isFullView("/reports/cards"), false);
  assert.equal(isFullView("/reports/business/BZ-1"), false);
  assert.equal(isFullView("/reports/cards/abc/html", "1"), false);
});

test("전체 보기: 목록 이동(?from)·부서 화면 보기(?team)·오른쪽 패널(?panes) 쿼리가 붙어도 판정은 그대로(경로만 봄)", () => {
  // 실제 화면(next/navigation의 usePathname)은 쿼리를 뺀 경로만 주지만, 판정 함수 자체가 쿼리와 무관함을 못박아 둠
  assert.equal(isFullView("/cards/ae8389e9-d714-487a-ae98-1397bcdba6fe"), true);
  assert.equal(isFullView("/reports/cards/abc"), true);
  for (const p of ["/cards", "/cards/import", "/my"]) assert.equal(isFullView(p), false, p);
});
