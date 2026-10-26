import assert from "node:assert/strict";
import { test } from "node:test";
import { RETURN_MAX, returnLabel, returnTarget, safeReturn, withReturn } from "./return-to.ts";

test("safeReturn: 앱 안 경로만 받음(열린 리다이렉트 막음)", () => {
  assert.equal(safeReturn("/inspections?period=2026-09"), "/inspections?period=2026-09");
  assert.equal(safeReturn(["/reports/12"]), "/reports/12");
  for (const bad of ["", "https://evil.test", "//evil.test", "/\\evil.test", "/javascript:alert(1)", "reports", "/a\nb", "/" + "a".repeat(RETURN_MAX), 12, null, undefined]) assert.equal(safeReturn(bad), null, String(bad));
});

test("withReturn: from을 인코딩해 붙이고(쿼리·해시 보존), 안전하지 않으면 그대로", () => {
  assert.equal(withReturn("/cards/abc", "/inspections?period=2026-09&status=draft"), "/cards/abc?from=%2Finspections%3Fperiod%3D2026-09%26status%3Ddraft");
  assert.equal(withReturn("/cards/abc?panes=inspection", "/my/inspections"), "/cards/abc?panes=inspection&from=%2Fmy%2Finspections");
  assert.equal(withReturn("/reports/12#평가내용2", "/reports"), "/reports/12?from=%2Freports#평가내용2");
  assert.equal(withReturn("/cards/abc", "https://evil.test"), "/cards/abc");
  assert.equal(withReturn("/cards/abc", null), "/cards/abc");
});

test("returnLabel·returnTarget: 돌아갈 곳 이름, from이 없거나 나쁘면 기본값", () => {
  assert.equal(returnLabel("/cards?q=전파&sort=title"), "과제 원장");
  assert.equal(returnLabel("/cards/import/7"), "카드 현행화");
  assert.equal(returnLabel("/reports/cards?state=none"), "과제별 초안");
  assert.equal(returnLabel("/reports/2284"), "보고서 검토");
  assert.equal(returnLabel("/reports/business/BZ-1"), "사업 조판");
  assert.equal(returnLabel("/my/report?team=2"), "경평 초안");
  assert.equal(returnLabel("/somewhere"), "목록");
  assert.deepEqual(returnTarget("/inspections?period=2026-09", "/cards"), { href: "/inspections?period=2026-09", label: "월간 점검" });
  assert.deepEqual(returnTarget("//evil", "/my/report"), { href: "/my/report", label: "경평 초안" });
});
