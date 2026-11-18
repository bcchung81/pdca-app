// CSP 위반 보고 뽑기(lib/security/csp-report.ts) 시험 — 로그에 질의 문자열(?team= 등)·출처가 실리는 것, 긴 값이 그대로 남는 것,
// 큰 본문·깨진 본문을 받아 로그를 남기는 것을 막음.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CSP_REPORT_MAX_BYTES, parseCspReport, pathOnly } from "./csp-report.ts";

const report = (r: Record<string, unknown>) => JSON.stringify({ "csp-report": r });

test("parseCspReport: 정해진 칸만, 주소는 경로만", () => {
  const v = parseCspReport(report({
    "document-uri": "https://example.test/cards/abc?team=x#frag",
    "violated-directive": "script-src",
    "blocked-uri": "inline",
    "source-file": "https://example.test/_next/static/chunks/a.js?v=1",
    "line-number": 12,
    "script-sample": "alert(1)",
    "original-policy": "script-src 'nonce-secret'",
    referrer: "https://example.test/my?team=y",
  }));
  assert.deepEqual(v, {
    directive: "script-src",
    blocked: "inline",
    document: "/cards/abc",
    source: "/_next/static/chunks/a.js",
    line: 12,
    sample: "alert(1)",
  });
});

test("parseCspReport: effective-directive가 있으면 그것을 먼저", () => {
  const v = parseCspReport(report({ "effective-directive": "script-src-elem", "violated-directive": "script-src" }));
  assert.equal(v?.directive, "script-src-elem");
});

test("parseCspReport: 긴 값은 자름(blocked 200자·sample 80자)", () => {
  const v = parseCspReport(report({ "blocked-uri": "x".repeat(500), "script-sample": "y".repeat(500) }));
  assert.equal(v?.blocked?.length, 200);
  assert.equal(v?.sample?.length, 80);
});

test("parseCspReport: 8KB 넘음·JSON 아님·빈 본문·csp-report 없음은 null", () => {
  const big = report({ "script-sample": "z".repeat(CSP_REPORT_MAX_BYTES) });
  assert.ok(big.length > CSP_REPORT_MAX_BYTES);
  assert.equal(parseCspReport(big), null);
  assert.equal(parseCspReport("not json"), null);
  assert.equal(parseCspReport(""), null);
  assert.equal(parseCspReport("{}"), null);
  assert.equal(parseCspReport("null"), null);
  assert.equal(parseCspReport(JSON.stringify({ "csp-report": "x" })), null);
  assert.equal(parseCspReport(JSON.stringify({ "csp-report": [] })), null);
});

test("parseCspReport: 빈 칸·이상한 형은 null 칸", () => {
  assert.deepEqual(parseCspReport(report({ "line-number": "3", "document-uri": "about:blank" })), {
    directive: null, blocked: null, document: null, source: null, line: null, sample: null,
  });
});

test("pathOnly: 주소가 아니면 null", () => {
  assert.equal(pathOnly("inline"), null);
  assert.equal(pathOnly("eval"), null);
  assert.equal(pathOnly(3), null);
  assert.equal(pathOnly("https://a.test/x/y?q=1"), "/x/y");
});
