// 부서 화면 보기 요청 판정(lib/auth/preview-url.ts) 시험 — 개선 계획 P2-6
import assert from "node:assert/strict";
import { test } from "node:test";
import { isPreviewUrl } from "./preview-url.ts";

test("isPreviewUrl: /my·/my/…·/cards/<uid>·/reports/cards/<uid>·/reports/<숫자>에 ?team=이 붙은 주소만", () => {
  for (const u of ["https://app.kca.kr/my?team=12", "https://app.kca.kr/my/report?team=3&from=%2Fdashboard", "https://app.kca.kr/my/inspections?period=2026-10&team=7", "https://app.kca.kr/cards/abc123?team=12&panes=inspection", "/my?team=1", "https://app.kca.kr/reports/cards/abc?team=1", "https://app.kca.kr/reports/12?team=3"]) {
    assert.equal(isPreviewUrl(u), true, u);
  }
  for (const u of [null, undefined, "", "https://app.kca.kr/my", "https://app.kca.kr/my?team=", "https://app.kca.kr/cards?team=12", "https://app.kca.kr/cards/abc/hwpx?team=1", "https://app.kca.kr/reports/cards?team=1", "https://app.kca.kr/reports/outline?team=1", "https://app.kca.kr/reports/business/BZ-1?team=1", "https://app.kca.kr/reports/abc?team=1", "https://app.kca.kr/reports/12", "https://app.kca.kr/mypage?team=1", "https://app.kca.kr/dashboard?team=1", "http://[bad"]) {
    assert.equal(isPreviewUrl(u), false, String(u));
  }
});
