// 응답 보안 머리글·이미지 최적화 끄기(next.config.ts) 시험 — 2026-11-10 보안 점검(T4).
// 막는 회귀: 클릭재킹(액자 허용), 같은 출처 숨은 iframe(「한글(화면 그대로)」)이 막히는 것, 부서 화면 보기 쓰기 막기가 Referer를 못 읽게 되는 것,
// /_next/image(이미지 최적화 — Next 16.3.6 취약점 경로)가 다시 열리는 것, X-Powered-By로 판 정보가 나가는 것.

import assert from "node:assert/strict";
import { test } from "node:test";
import nextConfig from "../../next.config.ts";

async function allPathHeaders(): Promise<Map<string, string>> {
  assert.ok(nextConfig.headers, "headers()가 있어야 함");
  const rules = await nextConfig.headers();
  const all = rules.find((r) => r.source === "/:path*");
  assert.ok(all, "모든 경로(/:path*) 규칙이 있어야 함");
  return new Map(all.headers.map((h) => [h.key.toLowerCase(), h.value]));
}

test("보안 머리글: 액자는 같은 출처만(숨은 iframe은 되고 남의 사이트는 안 됨)", async () => {
  const h = await allPathHeaders();
  assert.equal(h.get("x-frame-options"), "SAMEORIGIN");
  const csp = h.get("content-security-policy") ?? "";
  assert.match(csp, /frame-ancestors 'self'(;|$)/);
  assert.doesNotMatch(csp, /frame-ancestors[^;]*'none'/, "'none'이면 같은 출처 숨은 iframe(한글 화면 그대로)이 깨짐");
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
});

test("보안 머리글: CSP는 화면을 깨지 않는 지시어만 강제(스크립트·스타일 제한은 화면 확인 뒤)", async () => {
  const csp = (await allPathHeaders()).get("content-security-policy") ?? "";
  for (const d of ["default-src", "script-src", "style-src", "img-src", "connect-src", "form-action"]) assert.ok(!csp.includes(d), `${d}는 아직 강제하지 않음`);
});

test("보안 머리글: Referer는 같은 출처에 전체 주소(부서 화면 보기 쓰기 막기가 ?team=을 읽음)", async () => {
  const h = await allPathHeaders();
  assert.equal(h.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(h.get("x-content-type-options"), "nosniff");
  assert.match(h.get("permissions-policy") ?? "", /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
  assert.ok(!h.has("strict-transport-security"), "HSTS는 Vercel이 붙임 — 겹치면 첫 값만 쓰여 헷갈림");
});

test("next.config: X-Powered-By 끔·이미지 최적화(/_next/image) 닫음", () => {
  assert.equal(nextConfig.poweredByHeader, false);
  assert.equal(nextConfig.images?.unoptimized, true);
});
