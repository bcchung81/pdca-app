// AI API 오류 분류·재시도 판단(lib/ai/api-errors.ts) 시험 — 2026-10-10 개선 계획 P1-3:
// 예전에는 속도 제한만 따로 안내하고 과부하(529)·시간 초과·연결 끊김을 「AI 서비스 오류(?)」로 뭉뚱그렸고, 스트림 도중 과부하면 5~10분 작업을 재시도 없이 잃었음.

import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { API_TOTAL_MS, apiErrorKind, apiErrorMessage, deadlinePassed, remainingMs, shouldRetryApi, switchesKey } from "./api-errors.ts";
import { keyOrder } from "./provider.ts";

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
  for (const k of ["rate", "timeout", "server", "auth", "credit", "spend", "bad_request", null] as const) assert.equal(shouldRetryApi(k, 1_000, 0), false, String(k));
});

// 월 지출 한도(2026-11-12 — platform.claude.com/docs/en/api/rate-limits): 등급 한도는 429 rate_limit_error + details.error_code enforced_spend_limit_reached(retry-after 없음),
// 조직이 정한 한도는 400 invalid_request_error 「You have reached your specified (workspace) API usage limits」 — 예전에는 rate(「1분 뒤」)·bad_request로 분류돼 예비 키로 안 넘어갔음
const body = (type: string, message: string, details?: Record<string, string>) => ({ type: "error", error: { type, message, ...(details ? { details } : {}) } });
const spendCap = (status: number | undefined) =>
  status === undefined
    ? new Anthropic.APIError(undefined, body("rate_limit_error", "spend limit", { error_code: "enforced_spend_limit_reached" }), "spend limit", undefined)
    : Anthropic.APIError.generate(status, body("rate_limit_error", "spend limit", { error_code: "enforced_spend_limit_reached" }), "spend limit", new Headers());

test("apiErrorKind: 월 지출 한도는 spend — 429 + error_code(스트림 도중 상태 코드 없이도), 400 「specified (workspace) API usage limits」 · 일반 429·크레딧·다른 400은 그대로", () => {
  assert.equal(apiErrorKind(spendCap(429)), "spend", "429라도 error_code가 있으면 rate보다 먼저");
  assert.equal(apiErrorKind(spendCap(undefined)), "spend", "스트림 도중(상태 코드 없음)");
  assert.equal(apiErrorKind(gen(429, "rate_limit_error")), "rate", "일반 429는 rate 그대로");
  const limit = (m: string) => Anthropic.APIError.generate(400, body("invalid_request_error", m), m, new Headers());
  assert.equal(apiErrorKind(limit("You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.")), "spend");
  assert.equal(apiErrorKind(limit("You have reached your specified workspace API usage limits.")), "spend", "작업 공간 한도");
  assert.equal(apiErrorKind(limit("Your credit balance is too low to access the Anthropic API.")), "credit", "크레딧 부족은 credit 그대로");
  assert.equal(apiErrorKind(limit("messages: field required")), "bad_request", "다른 400은 그대로");
  assert.match(apiErrorMessage("spend"), /이번 달 AI API 사용 한도.*관리자.*다음 달 1일/);
  assert.equal(shouldRetryApi("spend", 1_000, 0), false, "재시도 안 함");
});

test("키 교차: 크레딧 부족처럼 월 지출 한도(spend)도 그 키를 소진 표시하고 다음 키로 — 속도 제한·과부하 등은 키를 안 바꿈", () => {
  assert.equal(switchesKey("credit"), true);
  assert.equal(switchesKey("spend"), true);
  for (const k of ["rate", "overloaded", "server", "timeout", "connection", "auth", "bad_request", null] as const) assert.equal(switchesKey(k), false, String(k));
  // structuredApi와 같은 고리(키 순서 → 오류면 switchesKey로 소진 표시·다음 키)를 흉내: 기본 키가 spend, 예비 1이 성공
  const keys = ["main", "fb1", "fb2"];
  const exhausted = new Set<string>();
  const fail: Record<string, unknown> = { main: spendCap(429) };
  let used: string | null = null;
  const order = keyOrder(keys, exhausted);
  for (let k = 0; k < order.length; k++) {
    const e = fail[order[k]];
    if (!e) {
      used = order[k];
      break;
    }
    if (switchesKey(apiErrorKind(e)) && k + 1 < order.length) exhausted.add(order[k]);
    else throw e;
  }
  assert.equal(used, "fb1");
  assert.deepEqual(keyOrder(keys, exhausted), ["fb1", "fb2", "main"], "다음 요청부터 한도 닿은 키는 뒤로");
  // 마지막 키까지 spend면 그 오류 그대로 → 안내 문구
  assert.equal(apiErrorKind(spendCap(429)), "spend");
});

test("호출 전체 마감 — 마감 signal로 멈춘 APIUserAbortError는 timeout이고 재시도·키 전환 대상이 아님", () => {
  const kind = apiErrorKind(new Anthropic.APIUserAbortError());
  assert.equal(kind, "timeout");
  assert.match(apiErrorMessage(kind!), /시간/);
  assert.equal(shouldRetryApi(kind, 1_000, 0), false);
  assert.equal(switchesKey(kind), false);
});

test("remainingMs·deadlinePassed: 770초 마감 — 시작·경과·0 이하", () => {
  assert.equal(API_TOTAL_MS, 770_000);
  assert.equal(remainingMs(1_000, 1_000), 770_000, "시작 직후 = 전체");
  assert.equal(remainingMs(1_000, 1_000 + 440_000), 330_000, "경과만큼 줄어듦");
  assert.equal(remainingMs(0, 770_000), 0, "딱 마감");
  assert.equal(remainingMs(0, 900_000), 0, "넘으면 음수가 아니라 0");
  assert.equal(deadlinePassed(0, 769_999), false);
  assert.equal(deadlinePassed(0, 770_000), true);
  assert.equal(deadlinePassed(0, 1_000, 500), true, "총 시간을 따로 줄 수 있음");
});
