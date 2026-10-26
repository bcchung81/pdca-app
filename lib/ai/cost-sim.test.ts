import assert from "node:assert/strict";
import { test } from "node:test";
import { annualCost, compare, mixFromArrivals, requestCost, type RequestProfile } from "./cost-sim.ts";

const FULL: RequestProfile = { sharedTokens: 271000, cardTokens: 0, tailTokens: 10000, outputTokens: 26646 };
const SEL: RequestProfile = { sharedTokens: 45000, cardTokens: 40000, tailTokens: 10000, outputTokens: 26646 };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("통째로 넣기 cold: 271000×2.5 + 10000×2 + 26646×10 (/1e6)", () => {
  near(requestCost(FULL, "cold"), (271000 * 2.5 + 10000 * 2 + 26646 * 10) / 1e6);
});

test("통째로 넣기 warmCard: 읽기 단가", () => {
  near(requestCost(FULL, "warmCard"), (271000 * 0.2 + 20000 + 266460) / 1e6);
});

test("선별 warmShared: shared 읽기 + card 쓰기", () => {
  near(requestCost(SEL, "warmShared"), (45000 * 0.2 + 40000 * 2.5 + 20000 + 266460) / 1e6);
});

test("1시간 TTL: 쓰기 단가는 입력 ×2", () => {
  near(requestCost(FULL, "cold", "1h"), (271000 * 4 + 20000 + 266460) / 1e6);
  // 읽기는 TTL과 무관
  near(requestCost(FULL, "warmCard", "1h"), requestCost(FULL, "warmCard", "5m"));
});

test("연 비용 = 요청 수 × 비율 가중 평균", () => {
  const mix = { cold: 0.5, warmShared: 0, warmCard: 0.5 };
  const r = annualCost(FULL, { cards: 10, requestsPerCardMonth: 5, mix });
  assert.equal(r.requests, 600);
  near(r.perRequest, 0.5 * requestCost(FULL, "cold") + 0.5 * requestCost(FULL, "warmCard"));
  near(r.usd, 600 * r.perRequest);
});

test("compare: 차이 금액·%", () => {
  const c = compare(FULL, SEL, { cards: 1, requestsPerCardMonth: 1, months: 1, mix: { cold: 1, warmShared: 0, warmCard: 0 } });
  near(c.diffUsd, c.selected.usd - c.full.usd);
  near(c.diffPct, (c.diffUsd / c.full.usd) * 100);
});

test("비율 합이 1이 아니면 오류", () => {
  assert.throws(() => annualCost(FULL, { cards: 1, requestsPerCardMonth: 1, mix: { cold: 0.5, warmShared: 0.2, warmCard: 0.2 } }), /합이 1/);
});

test("mixFromArrivals: λ=0이면 cold 1", () => {
  assert.deepEqual(mixFromArrivals({ requestsPerHourSamePrefix: 0, requestsPerHourSameCard: 0, ttlMinutes: 5 }), {
    cold: 1,
    warmShared: 0,
    warmCard: 0,
  });
});

test("mixFromArrivals: 합 1, 같은 카드가 먼저", () => {
  const m = mixFromArrivals({ requestsPerHourSamePrefix: 12, requestsPerHourSameCard: 6, ttlMinutes: 5 });
  near(m.cold + m.warmShared + m.warmCard, 1);
  near(m.warmCard, 1 - Math.exp(-0.5));
  near(m.warmShared, (1 - m.warmCard) * (1 - Math.exp(-0.5)));
});
