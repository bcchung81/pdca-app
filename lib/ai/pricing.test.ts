import assert from "node:assert/strict";
import test from "node:test";
import { aiUsageColumns, estimateUsd, isCliModel, pricingFor } from "./pricing.ts";

test("모델 이름 정규화 · 단가 찾기", () => {
  assert.deepEqual(pricingFor("claude-opus-5-5"), { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 });
  // cli/ 접두 걷기
  assert.deepEqual(pricingFor("cli/claude-opus-5-5"), pricingFor("claude-opus-5-5"));
  // 뒤의 " · Claude Code" 꼬리 걷기(modelLabel이 붙이는 표시용 꼬리)
  assert.deepEqual(pricingFor("claude-opus-5-5 · Claude Code"), pricingFor("claude-opus-5-5"));
  // 날짜 꼬리 걷기(API 응답 model에 붙을 수 있음)
  assert.deepEqual(pricingFor("claude-sonnet-5-20260315"), pricingFor("claude-sonnet-5"));
  assert.deepEqual(pricingFor("claude-sonnet-5-2026-03-15"), pricingFor("claude-sonnet-5"));
  // 가장 긴 접두(5-5가 5보다 먼저) — "5"만 대는 모델과 "5-5" 접두가 섞이지 않게
  assert.deepEqual(pricingFor("claude-opus-5"), { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 });
  assert.notDeepEqual(pricingFor("claude-opus-5"), pricingFor("claude-opus-5-5"));
});

test("모르는 모델은 null", () => {
  assert.equal(pricingFor("gpt-5"), null);
  assert.equal(pricingFor(null), null);
  assert.equal(pricingFor(undefined), null);
  assert.equal(pricingFor(""), null);
});

test("CLI 판정: cli/ 접두 또는 Claude Code 표시", () => {
  assert.equal(isCliModel("cli/claude-opus-5-5"), true);
  assert.equal(isCliModel("claude-opus-5-5 · Claude Code"), true);
  assert.equal(isCliModel("claude-opus-5-5"), false);
  // 평가 전용 Codex CLI(구독) — 단가표에 없어 비용 어림은 null
  assert.equal(isCliModel("codex/gpt-6-sol"), true);
  assert.equal(isCliModel("gpt-6-luna · Codex"), true);
  assert.equal(isCliModel("gpt-6-sol"), false);
  assert.equal(pricingFor("codex/gpt-6-sol"), null);
  assert.equal(isCliModel(null), false);
});

test("셈: 입력·출력·캐시 읽기·캐시 쓰기를 단가로 환산", () => {
  const usd = estimateUsd("claude-opus-5-5", { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 });
  assert.equal(usd, 4 + 20 + 0.2 + 5);
});

test("셈: 캐시 값이 없으면 0으로", () => {
  assert.equal(estimateUsd("claude-sonnet-5", { input: 500_000, output: 0 }), 1);
});

test("셈: 모르는 모델은 null", () => {
  assert.equal(estimateUsd("unknown-model", { input: 100, output: 100 }), null);
});

test("aiUsageColumns: ai_requests 칸 이름으로 매핑", () => {
  assert.deepEqual(aiUsageColumns({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4, cacheWrite1h: 5 }), {
    input_tokens: 1,
    output_tokens: 2,
    cache_read_tokens: 3,
    cache_write_tokens: 4,
    cache_write_1h_tokens: 5,
  });
});

test("셈: 캐시 쓰기 중 1시간 몫은 입력 단가의 2배, 나머지는 5분 단가", () => {
  // opus-5-5: input=4, cacheWrite(5분)=5
  const withHour = estimateUsd("claude-opus-5-5", {
    input: 0,
    output: 0,
    cacheWrite: 1_000_000,
    cacheWrite1h: 400_000,
  });
  const without = estimateUsd("claude-opus-5-5", { input: 0, output: 0, cacheWrite: 1_000_000, cacheWrite1h: 0 });
  // 1시간 몫 40만 토큰만큼 (2 - 1.25) × 입력단가 × 몫/100만 만큼 더 비쌈
  assert.ok(withHour !== null && without !== null);
  assert.equal(withHour! - without!, (2 - 1.25) * 4 * (400_000 / 1_000_000));
});

test("셈: cacheWrite1h가 없으면 예전 값과 같음", () => {
  const usd1 = estimateUsd("claude-sonnet-5", { input: 500_000, output: 0, cacheWrite: 200_000 });
  const usd2 = estimateUsd("claude-sonnet-5", { input: 500_000, output: 0, cacheWrite: 200_000, cacheWrite1h: 0 });
  assert.equal(usd1, usd2);
});
