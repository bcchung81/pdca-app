// 스크립트 CSP Report-Only 정책(lib/security/csp.ts) 시험 — 2026-11-18 보안 점검 「CSP에 script-src 없음」.
// 막는 회귀: nonce·strict-dynamic·경평 문서 해시·보고 주소가 빠지는 것, 'unsafe-inline'이 들어가 nonce가 무의미해지는 것, 운영에 'unsafe-eval'이 실리는 것,
// nonce가 고정·예측 가능해지는 것, 경평 초안 문서(/reports/cards/<uid>/html)에 Report-Only가 실려 헛 보고가 쏟아지는 것
// (그 문서 스크립트는 운영 빌드에서 압축돼 해시 상수로 못 맞춤 — 자체 강제 meta CSP lib/reports/doc-csp.ts가 있음).

import assert from "node:assert/strict";
import { test } from "node:test";
import { CSP_REPORT_PATH, makeNonce, reportOnlyApplies, reportOnlyCsp } from "./csp.ts";

test("reportOnlyCsp: nonce·strict-dynamic·report-uri, unsafe-inline·해시 없음", () => {
  const csp = reportOnlyCsp("abc123==", false);
  const script = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src ")) ?? "";
  assert.match(script, /'self'/);
  assert.match(script, /'nonce-abc123=='/);
  assert.match(script, /'strict-dynamic'/);
  assert.ok(!csp.includes("sha256-"), "해시는 운영 빌드에서 안 맞음 — 경평 문서는 reportOnlyApplies로 뺌");
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.ok(csp.includes(`report-uri ${CSP_REPORT_PATH}`));
  assert.equal(CSP_REPORT_PATH, "/api/csp-report");
  assert.ok(!csp.includes("unsafe-inline"));
  for (const d of ["default-src", "style-src", "img-src", "connect-src"]) assert.ok(!csp.includes(d), `${d}는 이번 범위 밖`);
});

test("reportOnlyCsp: 'unsafe-eval'은 개발 모드만", () => {
  assert.ok(!reportOnlyCsp("n", false).includes("unsafe-eval"));
  assert.match(reportOnlyCsp("n", true), /script-src [^;]*'unsafe-eval'/);
});

test("makeNonce: 요청마다 다르고 128비트 base64(Next가 읽는 형식)", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const n = makeNonce();
    assert.match(n, /^[A-Za-z0-9+/]{22}==$/);
    assert.equal(Buffer.from(n, "base64").length, 16);
    seen.add(n);
  }
  assert.equal(seen.size, 100);
  // next/dist/server/app-render/get-script-nonce-from-header.js가 정책에서 nonce를 읽는 정규식과 같음
  assert.match(`'nonce-${makeNonce()}'`, /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/);
});

test("reportOnlyApplies: 경평 초안 문서만 빼고 나머지는 Report-Only를 실음(path는 질의 문자열 없는 경로)", () => {
  for (const p of ["/reports/cards/abc/html", "/reports/cards/x-1_2/html"]) assert.equal(reportOnlyApplies(p), false, p);
  for (const p of ["/reports/cards/x/html/extra", "/reports/cards/x", "/reports/cards//html", "/reports/cards/x/hwpx", "/cards", "/cards/x/html", "/login", "/", "/reports/cards/a/b/html"]) {
    assert.equal(reportOnlyApplies(p), true, p);
  }
});
