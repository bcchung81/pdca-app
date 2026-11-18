// 「접속 기록」 화면 순수 부분(lib/ops/access-log-view.ts) 시험 — 기간 경계(서울)·더 보기 상한·일시 표기·덧붙임 한 줄·이름표.

import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCESS_ACTIONS } from "./access-log-core.ts";
import { ACTION_NAME, DOWNLOAD_NAME, LOG_MAX, LOG_PAGE, actionName, asUuid, detailText, fmtLogTime, isLogPeriod, logLimit, logRange } from "./access-log-view.ts";

test("행위 이름표는 DB 허용 목록 다섯 개를 모두 덮고, 모르는 값은 그대로", () => {
  assert.deepEqual(Object.keys(ACTION_NAME).sort(), [...ACCESS_ACTIONS].sort());
  assert.equal(actionName("visit"), "첫 접속(하루)");
  assert.equal(actionName("zz"), "zz");
});

test("logRange: 오늘·이번 달·지난달은 서울 경계, 최근 N일은 지금부터 — 1월의 지난달은 전년 12월", () => {
  const now = new Date("2026-11-18T16:30:00Z"); // 서울 11-19 01:30
  assert.deepEqual(logRange("today", now), { from: "2026-11-19T00:00:00+09:00", to: null });
  assert.deepEqual(logRange("thisMonth", now), { from: "2026-11-01T00:00:00+09:00", to: null });
  assert.deepEqual(logRange("lastMonth", now), { from: "2026-10-01T00:00:00+09:00", to: "2026-11-01T00:00:00+09:00" });
  assert.deepEqual(logRange("d7", now), { from: "2026-11-11T16:30:00.000Z", to: null });
  assert.deepEqual(logRange("d30", now), { from: "2026-10-19T16:30:00.000Z", to: null });
  assert.deepEqual(logRange("lastMonth", new Date("2026-01-05T00:00:00Z")), { from: "2025-12-01T00:00:00+09:00", to: "2026-01-01T00:00:00+09:00" });
  assert.equal(isLogPeriod("d7"), true);
  assert.equal(isLogPeriod("d90"), false);
});

test("logLimit: 200 단위, 상한 2,000, 이상한 값은 200", () => {
  assert.equal(logLimit(""), LOG_PAGE);
  assert.equal(logLimit("abc"), LOG_PAGE);
  assert.equal(logLimit("-5"), LOG_PAGE);
  assert.equal(logLimit("400"), 400);
  assert.equal(logLimit("401"), 600);
  assert.equal(logLimit("999999"), LOG_MAX);
});

test("fmtLogTime: 서울 시각 초까지, 못 읽으면 —", () => {
  assert.equal(fmtLogTime("2026-11-18T15:04:05Z"), "2026-11-19 00:04:05");
  assert.equal(fmtLogTime("x"), "—");
});

test("asUuid: uuid 모양만(소문자로)", () => {
  assert.equal(asUuid("00000000-0000-0000-0000-0000000000AA"), "00000000-0000-0000-0000-0000000000aa");
  assert.equal(asUuid("1-가"), null);
  assert.equal(asUuid("x' or 1=1"), null);
});

test("detailText: 내려받기 종류·이름·줄 수, 사용자 관리 작업·건수, AI 스위치 — 모르는 모양은 빈 글", () => {
  assert.equal(detailText("download", { kind: "card_hwpx", name: "1-가 과제.hwpx" }), "카드 한글 · 1-가 과제.hwpx");
  assert.equal(detailText("download", { kind: "cards_csv", name: "과제원장_2026-11.csv", count: 56 }), "과제 원장 목록(CSV) · 과제원장_2026-11.csv · 56줄");
  assert.equal(detailText("download", { kind: "new_kind" }), "new_kind");
  assert.equal(detailText("user_manage", { op: "setUserActive", active: false }), "사용 중지·재개 · 중지");
  assert.equal(detailText("user_manage", { op: "setUserAssignments", added: 2, removed: 1 }), "담당 과제 맞추기 · 추가 2 · 제외 1");
  assert.equal(detailText("user_manage", { op: "applyUserPaste", count: 12, created: 10, updated: 2, errors: 1 }), "일괄 등록 · 12명 · 실패 1");
  assert.equal(detailText("ai_switch", { on: true, reason: "비용 점검" }), "멈춤 · 비용 점검");
  assert.equal(detailText("ai_switch", { on: false }), "다시 켬");
  assert.equal(detailText("user_manage", { op: "applyUserPaste", count: 3, truncated: true }), "일괄 등록 · 3명 · (줄임)");
  assert.equal(detailText("login", null), "");
  assert.equal(detailText("download", "글"), "");
  assert.ok(Object.keys(DOWNLOAD_NAME).length === 9);
});
