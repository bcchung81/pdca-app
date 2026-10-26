import assert from "node:assert/strict";
import { test } from "node:test";
import { aiProviderFrom, apiKeysFrom, isCreditBalanceError, keyOrder } from "./provider.ts";

test("aiProviderFrom: 로컬 — API 키가 있으면 api", () => {
  assert.equal(aiProviderFrom({ ANTHROPIC_API_KEY: "sk-x" }), "api");
});

test("aiProviderFrom: 로컬 — API 키가 없으면 cli", () => {
  assert.equal(aiProviderFrom({}), "cli");
});

test("aiProviderFrom: 로컬 — AI_PROVIDER로 지정하면 그대로(키 유무와 무관)", () => {
  assert.equal(aiProviderFrom({ AI_PROVIDER: "cli", ANTHROPIC_API_KEY: "sk-x" }), "cli");
  assert.equal(aiProviderFrom({ AI_PROVIDER: "api" }), "api");
});

test("aiProviderFrom: Vercel — 키가 없어도 api", () => {
  assert.equal(aiProviderFrom({ VERCEL: "1" }), "api");
});

test("aiProviderFrom: Vercel — AI_PROVIDER=cli여도 api(CLI가 없어 spawn이 실패하므로)", () => {
  assert.equal(aiProviderFrom({ VERCEL: "1", AI_PROVIDER: "cli", ANTHROPIC_API_KEY: "sk-x" }), "api");
});

test("aiProviderFrom: 로컬 — AI_PROVIDER=codex일 때만 codex(평가 전용 — 키가 있어도, 비우면 고르지 않음)", () => {
  assert.equal(aiProviderFrom({ AI_PROVIDER: "codex" }), "codex");
  assert.equal(aiProviderFrom({ AI_PROVIDER: " Codex ", ANTHROPIC_API_KEY: "sk-x" }), "codex");
  assert.equal(aiProviderFrom({}), "cli");
});

test("aiProviderFrom: Vercel — AI_PROVIDER=codex여도 api", () => {
  assert.equal(aiProviderFrom({ VERCEL: "1", AI_PROVIDER: "codex" }), "api");
});

test("크레딧 부족 오류 글을 알아본다(400 credit balance is too low) — 첨부·요청이 잘못된 오류와 구분", () => {
  assert.ok(isCreditBalanceError('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing"}}'));
  assert.ok(isCreditBalanceError("Credit balance is too low"));
  assert.ok(!isCreditBalanceError("400 invalid_request_error: image exceeds 5 MB maximum"));
  assert.ok(!isCreditBalanceError(""));
});

test("apiKeysFrom: 기본 키가 앞, 공백·빈 값·중복은 뺌, 예비만 있어도 목록이 됨", () => {
  assert.deepEqual(apiKeysFrom({ ANTHROPIC_API_KEY: "a", ANTHROPIC_API_KEY_FALLBACK: "b" }), ["a", "b"]);
  assert.deepEqual(apiKeysFrom({ ANTHROPIC_API_KEY: " a ", ANTHROPIC_API_KEY_FALLBACK: "  " }), ["a"]);
  assert.deepEqual(apiKeysFrom({ ANTHROPIC_API_KEY: "a", ANTHROPIC_API_KEY_FALLBACK: "a" }), ["a"]);
  assert.deepEqual(apiKeysFrom({ ANTHROPIC_API_KEY_FALLBACK: "b" }), ["b"]);
  assert.deepEqual(apiKeysFrom({}), []);
});

test("keyOrder: 소진 안 된 키가 먼저(원래 순서), 소진된 키는 뒤 — 모두 소진이면 원래 순서", () => {
  assert.deepEqual(keyOrder(["a", "b"], new Set()), ["a", "b"]);
  assert.deepEqual(keyOrder(["a", "b"], new Set(["a"])), ["b", "a"]);
  assert.deepEqual(keyOrder(["a", "b"], new Set(["a", "b"])), ["a", "b"]);
  assert.deepEqual(keyOrder(["a", "b"], new Set(["b"])), ["a", "b"]);
});
