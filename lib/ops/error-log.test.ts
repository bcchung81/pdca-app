// 서버 오류 구조화 로그(lib/ops/error-log.ts) 시험 — 2026-10-10 개선 계획 P1-5(최소안): instrumentation onRequestError가 한 줄 JSON으로 남김.
// 쿠키·머리글은 남기지 않고, 주소 쿼리(로그인 토큰 token_hash·code 등이 붙음)는 지움.

import assert from "node:assert/strict";
import { test } from "node:test";
import { errorLogLine } from "./error-log.ts";

const req = { path: "/auth/confirm?token_hash=secret&type=email", method: "POST", headers: { cookie: "sb-access-token=abc", "user-agent": "x" } };
const ctx = { routerKind: "App Router", routePath: "/auth/confirm", routeType: "action", renderSource: "server-rendering", revalidateReason: undefined, renderType: "dynamic" } as const;

test("errorLogLine: 한 줄 JSON — 경로(쿼리 뺌)·방법·경로 파일·종류·오류 이름·메시지·digest, 머리글·쿠키는 없음", () => {
  const err = Object.assign(new TypeError("boom"), { digest: "123" });
  const line = errorLogLine(err, req, ctx, Date.parse("2026-10-10T00:00:00Z"));
  assert.ok(!line.includes("\n"), "한 줄");
  const o = JSON.parse(line);
  assert.equal(o.kind, "request_error");
  assert.equal(o.path, "/auth/confirm", "쿼리(토큰) 뺌");
  assert.equal(o.method, "POST");
  assert.equal(o.route, "/auth/confirm");
  assert.equal(o.type, "action");
  assert.equal(o.name, "TypeError");
  assert.equal(o.message, "boom");
  assert.equal(o.digest, "123");
  assert.equal(o.t, "2026-10-10T00:00:00.000Z");
  assert.ok(!line.includes("secret") && !line.includes("sb-access-token") && !line.includes("cookie"), "토큰·쿠키 없음");
});

test("errorLogLine: 오류가 아닌 값·긴 메시지(500자까지)도 받음", () => {
  const o = JSON.parse(errorLogLine("x".repeat(900), req, ctx, 0));
  assert.equal(o.name, "unknown");
  assert.equal(o.message.length, 500);
});
