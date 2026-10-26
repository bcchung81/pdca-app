import assert from "node:assert/strict";
import { test } from "node:test";
import { oldestDaysAgo, spreadText } from "./spread.ts";

test("spreadText: 많은 순 상위 N개 + 나머지는 「외 N곳」", () => {
  const g = [...Array(22).fill("경영기획본부"), ...Array(15).fill("운영지원단"), ...Array(5).fill("안전관리실"), "감사실", "감사실", "기타"];
  assert.equal(spreadText(g), "경영기획본부 22 · 운영지원단 15 · 안전관리실 5 외 2곳");
  assert.equal(spreadText(g, 4), "경영기획본부 22 · 운영지원단 15 · 안전관리실 5 · 감사실 2 외 1곳");
});

test("spreadText: 같은 수는 가나다순, 묶음이 top 이하면 「외」 없음, 비면 빈 글", () => {
  assert.equal(spreadText(["나팀", "가팀", "다팀"]), "가팀 1 · 나팀 1 · 다팀 1");
  assert.equal(spreadText(["가팀", "가팀"]), "가팀 2");
  assert.equal(spreadText([]), "");
});

test("oldestDaysAgo: 가장 오래된 제출이 며칠 전인지(하루 미만 0, 없으면 null)", () => {
  const now = new Date("2026-10-09T12:00:00+09:00");
  assert.equal(oldestDaysAgo(["2026-10-08T12:00:00+09:00", "2026-10-02T09:00:00+09:00", null], now), 7);
  assert.equal(oldestDaysAgo(["2026-10-09T03:00:00+09:00"], now), 0);
  assert.equal(oldestDaysAgo([null, undefined], now), null);
  assert.equal(oldestDaysAgo([], now), null);
});
