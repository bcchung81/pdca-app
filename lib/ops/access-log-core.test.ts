// 접속 기록 순수 부분(lib/ops/access-log-core.ts) 시험 — IP 고르기·기기 요약·하루 첫 접속 표식·문서 탐색 판정·값 자르기·실패 로그 줄.
// 막는 회귀: 프록시 주소를 접속지로 남김, 원문 user-agent가 새어 나감, 화면 안 갱신(RSC)·서버 액션·내려받기가 「첫 접속」으로 셈, 긴 값으로 기록이 거절됨.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { ACCESS_ACTIONS, ACCESS_LIMITS, SEEN_COOKIE, accessArgs, accessFailLine, deviceSummary, isDocumentVisit, kstDay, pickIp, seenToday, seenValue } from "./access-log-core.ts";

const H = (o: Record<string, string>) => new Headers(o);
const UID = "00000000-0000-0000-0000-0000000000aa";

test("행위 허용 목록은 DB(표 check·log_access)와 같은 다섯 개", () => {
  assert.deepEqual([...ACCESS_ACTIONS], ["login", "visit", "download", "user_manage", "ai_switch"]);
  const sql = readFileSync(join(resolve(import.meta.dirname, "../.."), "supabase/migrations/20261118140000_access_logs_ai_switch.sql"), "utf8");
  const lists = [...sql.matchAll(/action not in \(([^)]*)\)|action in \(([^)]*)\)/g)].map((m) => (m[1] ?? m[2]).split(",").map((x) => x.trim().replace(/'/g, "")));
  assert.equal(lists.length, 2, "표 check와 rpc 두 곳");
  for (const l of lists) assert.deepEqual(l, [...ACCESS_ACTIONS]);
});

test("pickIp: x-forwarded-for 첫 값(공백 걷음), 없으면 x-real-ip, 둘 다 없으면 null, 100자까지", () => {
  assert.equal(pickIp(H({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" })), "203.0.113.7");
  assert.equal(pickIp(H({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(pickIp(H({ "x-forwarded-for": "", "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(pickIp(H({})), null);
  assert.equal(pickIp(H({ "x-forwarded-for": "1".repeat(300) }))?.length, ACCESS_LIMITS.ip);
});

test("deviceSummary: 「브라우저 · OS」로 줄이고 원문은 남기지 않음", () => {
  const cases: Array<[string, string]> = [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Chrome · Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", "Edge · Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Whale/4.29.282.14 Safari/537.36", "Whale · Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "Safari · macOS"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Safari · iOS"],
    ["Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36", "Samsung Internet · Android"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox · Linux"],
    ["curl/8.7.1", "기타 · 기타"],
  ];
  for (const [ua, want] of cases) assert.equal(deviceSummary(ua), want, ua);
  assert.equal(deviceSummary(""), null);
  assert.equal(deviceSummary(null), null);
});

test("하루 첫 접속 표식: 서울 날짜 + 사용자 — 서울 자정에 바뀌고, 다른 사용자 표식은 오늘 것이 아님", () => {
  const t = Date.parse("2026-11-18T14:59:59Z"); // 서울 11-18 23:59:59
  assert.equal(kstDay(t), "20261118");
  assert.equal(kstDay(t + 1000), "20261119");
  assert.equal(SEEN_COOKIE, "pdca_seen");
  assert.equal(seenValue(UID, t), `20261118.${UID}`);
  assert.equal(seenToday(seenValue(UID, t), UID, t), true);
  assert.equal(seenToday(seenValue(UID, t), UID, t + 1000), false, "다음 날");
  assert.equal(seenToday(seenValue(UID, t), "00000000-0000-0000-0000-0000000000bb", t), false, "다른 사용자");
  assert.equal(seenToday(undefined, UID, t), false);
});

test("isDocumentVisit: 화면 문서를 여는 GET만 — 서버 액션 POST·RSC·미리 불러오기·iframe·/api·내려받기 라우트는 빼고, 머리글 없는 요청도 셈하지 않음", () => {
  const doc = { "sec-fetch-dest": "document" };
  assert.equal(isDocumentVisit("GET", "/cards", H(doc)), true);
  assert.equal(isDocumentVisit("GET", "/", H(doc)), true);
  assert.equal(isDocumentVisit("POST", "/cards", H(doc)), false, "서버 액션");
  assert.equal(isDocumentVisit("GET", "/cards", H({ "sec-fetch-dest": "empty" })), false, "RSC·fetch");
  assert.equal(isDocumentVisit("GET", "/cards", H({ "sec-fetch-dest": "iframe" })), false, "숨은 사본");
  assert.equal(isDocumentVisit("GET", "/cards", H({ ...doc, "sec-purpose": "prefetch;prerender" })), false);
  assert.equal(isDocumentVisit("GET", "/cards", H({ ...doc, purpose: "prefetch" })), false);
  assert.equal(isDocumentVisit("GET", "/cards", H({})), false, "머리글 없음");
  for (const p of ["/api/ai/requests", "/cards/abc/hwpx", "/reports/cards/abc/hwpx", "/reports/cards/abc/html", "/reports/business/MG-1/hwpx", "/inspections/summary/md", "/cards/export", "/inspections/export"])
    assert.equal(isDocumentVisit("GET", p, H(doc)), false, p);
  assert.equal(isDocumentVisit("GET", "/reports/business/MG-1/parts", H(doc)), true);
});

test("accessArgs: 머리글에서 IP·기기, target은 200자까지, 큰 detail은 kind·op·count만 남김", () => {
  const h = H({ "x-forwarded-for": "203.0.113.7", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36" });
  assert.deepEqual(accessArgs({ action: "download", target: "u1", detail: { kind: "card_hwpx", name: "1-가.hwpx" } }, h), {
    p_action: "download",
    p_target: "u1",
    p_ip: "203.0.113.7",
    p_ua: "Chrome · Windows",
    p_detail: { kind: "card_hwpx", name: "1-가.hwpx" },
  });
  const big = accessArgs({ action: "user_manage", target: "x".repeat(500), detail: { op: "applyUserPaste", count: 3, rows: "가".repeat(3000) } }, H({}));
  assert.equal(big.p_target?.length, ACCESS_LIMITS.target);
  assert.deepEqual(big.p_detail, { truncated: true, op: "applyUserPaste", count: 3 });
  assert.deepEqual(accessArgs({ action: "login" }, H({})), { p_action: "login", p_target: null, p_ip: null, p_ua: null, p_detail: null });
});

test("accessFailLine: 한 줄 JSON(행위·사유만, 300자까지)", () => {
  const line = accessFailLine("visit", "x".repeat(500), Date.parse("2026-11-18T00:00:00Z"));
  const o = JSON.parse(line);
  assert.deepEqual(Object.keys(o), ["t", "kind", "action", "message"]);
  assert.equal(o.kind, "access_log_error");
  assert.equal(o.message.length, 300);
  assert.ok(!line.includes("\n"));
});
