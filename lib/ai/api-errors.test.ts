// AI API 오류 분류·재시도 판단(lib/ai/api-errors.ts) 시험 — 2026-10-10 개선 계획 P1-3:
// 예전에는 속도 제한만 따로 안내하고 과부하(529)·시간 초과·연결 끊김을 「AI 서비스 오류(?)」로 뭉뚱그렸고, 스트림 도중 과부하면 5~10분 작업을 재시도 없이 잃었음.

import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { apiErrorKind, apiErrorMessage, shouldRetryApi } from "./api-errors.ts";

const gen = (status: number, type?: string) => Anthropic.APIError.generate(status, type ? { type: "error", error: { type, message: type } } : {}, "msg", new Headers());

test("apiErrorKind: 속도 제한·과부하(529·스트림 중 overloaded_error)·서버·시간 초과·연결·키·크레딧·요청 거절을 나눔", () => {
  assert.equal(apiErrorKind(gen(429, "rate_limit_error")), "rate");
  assert.equal(apiErrorKind(gen(529, "overloaded_error")), "overloaded");
  assert.equal(apiErrorKind(new Anthropic.APIError(undefined, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", undefined)), "overloaded", "스트림 도중 오류(상태 코드 없음)");
  assert.equal(apiErrorKind(gen(500)), "server");
  assert.equal(apiErrorKind(new Anthropic.APIConnectionTimeoutError()), "timeout");
  assert.equal(apiErrorKind(new Anthropic.APIConnectionError({ message: "socket hang up" })), "connection");
  assert.equal(apiErrorKind(gen(401)), "auth");
  assert.equal(apiErrorKind(Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }, "Your credit balance is too low", new Headers())), "credit");
  assert.equal(apiErrorKind(gen(400)), "bad_request");
  assert.equal(apiErrorKind(gen(402)), "credit", "402는 결제 문제");
  assert.equal(apiErrorKind(gen(400, "billing_error")), "credit", "본문 type billing_error");
  assert.equal(apiErrorKind(new Error("x")), null, "SDK 오류가 아니면 null");
});

test("apiErrorMessage: 종류마다 할 일을 알려 줌(속도 제한 → 1분 뒤, 과부하 → 잠시 뒤, 시간 초과 → 다시 만들기·요청 좁히기, 연결 → 다시 시도)", () => {
  assert.match(apiErrorMessage("rate"), /1분 뒤/);
  assert.match(apiErrorMessage("overloaded"), /몰려|과부하/);
  assert.match(apiErrorMessage("timeout"), /시간|좁혀/);
  assert.match(apiErrorMessage("connection"), /연결/);
  assert.match(apiErrorMessage("credit"), /크레딧/);
  assert.match(apiErrorMessage("auth"), /키/);
});

test("shouldRetryApi: 과부하·연결 끊김만, 첫 시도에서, 시작 60초 안(그 뒤는 생성이 많이 진행돼 다시 하면 비용·시간이 두 배)", () => {
  assert.equal(shouldRetryApi("overloaded", 10_000, 0), true);
  assert.equal(shouldRetryApi("connection", 59_000, 0), true);
  assert.equal(shouldRetryApi("overloaded", 61_000, 0), false);
  assert.equal(shouldRetryApi("overloaded", 10_000, 1), false, "한 번만");
  for (const k of ["rate", "timeout", "server", "auth", "credit", "bad_request", null] as const) assert.equal(shouldRetryApi(k, 1_000, 0), false, String(k));
});
