// 로그인 없이 여는 경로(lib/auth/public-paths.ts) 시험 — 2026-10-10 개선 계획 P2-9: 예전에는 /api/prep/ 접두사 전체를 열어,
// 나중에 그 폴더에 라우트를 더하면서 자체 인증을 빠뜨리면 그대로 공개될 수 있었음. 크론 라우트 하나만 정확히 엶.

import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicPath } from "./public-paths.ts";

test("isPublicPath: 로그인·메일 링크 확인·크론 처리기만 공개", () => {
  for (const p of ["/login", "/auth/confirm", "/auth/callback", "/api/prep/run"]) assert.equal(isPublicPath(p), true, p);
});

test("isPublicPath: 같은 접두사의 다른 경로는 공개 아님(/api/prep/ 아래 새 라우트·/loginx 등)", () => {
  for (const p of ["/api/prep/other", "/api/prep/run/x", "/api/prep", "/loginx", "/auth", "/", "/cards", "/api/other"]) assert.equal(isPublicPath(p), false, p);
});
