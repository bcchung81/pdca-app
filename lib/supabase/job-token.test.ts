// 백그라운드 작업 토큰 남은 시간 판정(lib/supabase/job-token.ts) — after() 안에서 토큰 갱신이 일어나지 않게 시작에서 먼저 갱신할지
import assert from "node:assert/strict";
import { test } from "node:test";
import { JOB_TOKEN_MIN_MS, needsRefresh } from "./job-token.ts";

const NOW = Date.parse("2026-11-06T09:00:00Z");

test("needsRefresh: 남은 시간이 작업 최장 시간(20분)+여유보다 짧거나 모르면 먼저 갱신, 넉넉하면 그대로", () => {
  assert.equal(JOB_TOKEN_MIN_MS, 25 * 60_000);
  assert.equal(needsRefresh(NOW / 1000 + 60 * 60, NOW), false, "1시간 남음");
  assert.equal(needsRefresh(NOW / 1000 + 26 * 60, NOW), false, "26분 남음");
  assert.equal(needsRefresh(NOW / 1000 + 24 * 60, NOW), true, "24분 남음");
  assert.equal(needsRefresh(NOW / 1000 - 10, NOW), true, "이미 만료");
  assert.equal(needsRefresh(undefined, NOW), true, "모름");
  assert.equal(needsRefresh(Number.NaN, NOW), true);
});
