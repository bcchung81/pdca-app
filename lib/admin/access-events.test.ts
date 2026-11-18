import assert from "node:assert/strict";
import { test } from "node:test";
import { actionLabel, asUserId, eventLimit, isEventPeriod, periodRange, summarizeDetail } from "./access-events.ts";

const lookup = { team: (id: number) => (id === 1 ? "가팀" : id === 2 ? "나팀" : undefined), taskNo: (id: string) => (id === "c1" ? "1-가" : undefined) };

test("action 이름: 알려진 8종은 한국어, 모르는 것은 원래 이름", () => {
  assert.equal(actionLabel("card_purged"), "카드 영구 삭제");
  assert.equal(actionLabel("ban_failed"), "사용 중지 반영 실패");
  assert.equal(actionLabel("something_new"), "something_new");
});

test("역할·팀 변경 요약", () => {
  assert.equal(summarizeDetail("user_updated", { role: { from: "dept_user", to: "pmo" } }, lookup), "역할 부서 담당자 → 성과관리팀");
  assert.equal(summarizeDetail("user_updated", { team: { from: 1, to: 2 } }, lookup), "팀 가팀 → 나팀");
  assert.equal(summarizeDetail("user_updated", { team: { from: null, to: 9 } }, lookup), "팀 없음 → #9");
  assert.equal(summarizeDetail("user_updated", { role: { from: "pmo", to: "admin" }, via: "system" }, lookup), "역할 성과관리팀 → 관리자 · 시스템");
});

test("사용 중지·재개는 action이 말하므로 active 칸을 따로 적지 않음", () => {
  assert.equal(summarizeDetail("user_deactivated", { active: { from: true, to: false } }, lookup), "");
});

test("담당 과제 지정·해제: 과제번호로, 60개 넘으면 외 N건", () => {
  assert.equal(summarizeDetail("assigned", { count: 2, card_ids: ["c1", "c9"] }, lookup), "1-가, c9");
  assert.equal(summarizeDetail("unassigned", { count: 7, card_ids: ["c1", "c2", "c3", "c4", "c5", "c6", "c7"], auto: true }, lookup), "1-가, c2, c3, c4, c5 외 2건 · 다른 변경에 따른 자동 처리");
  assert.equal(summarizeDetail("assigned", { count: 70, card_ids: Array.from({ length: 60 }, (_, i) => `x${i}`) }), "x0, x1, x2, x3, x4 외 65건");
});

test("카드 영구 삭제·반영 실패·계정 만들기", () => {
  assert.equal(summarizeDetail("card_purged", { card_id: "c1", task_no: "2-나", title: "시험 과제" }), "2-나 시험 과제");
  assert.equal(summarizeDetail("ban_failed", { active: false, ban_error: "오류" }), "로그인 차단 실패 · 오류");
  assert.equal(summarizeDetail("user_added", { via: "paste", role: "dept_user", team_id: 1 }, lookup), "역할 부서 담당자 · 팀 가팀 · 일괄 등록");
});

test("detail이 이상한 값이어도 던지지 않고 문자열만 돌려줌", () => {
  for (const d of [null, undefined, "x", 3, [], { role: "<img onerror=1>" }, { card_ids: "x", count: "y" }]) {
    for (const a of ["user_updated", "assigned", "card_purged", "ban_failed", "other"]) assert.equal(typeof summarizeDetail(a, d, lookup), "string");
  }
  assert.equal(summarizeDetail("other", { a: 1, via: "system" }), "a · 시스템");
});

test("기간: 이번 달·지난달 경계는 서울 시각 달 첫날, 90일은 끝 없음", () => {
  const now = new Date("2026-11-18T03:00:00Z");
  assert.deepEqual(periodRange("thisMonth", now), { from: "2026-11-01T00:00:00+09:00", to: null });
  assert.deepEqual(periodRange("lastMonth", now), { from: "2026-10-01T00:00:00+09:00", to: "2026-11-01T00:00:00+09:00" });
  assert.deepEqual(periodRange("lastMonth", new Date("2026-01-05T00:00:00Z")), { from: "2025-12-01T00:00:00+09:00", to: "2026-01-01T00:00:00+09:00" });
  // UTC로는 10월 31일이지만 서울은 11월 1일
  assert.equal(periodRange("thisMonth", new Date("2026-10-31T16:00:00Z")).from, "2026-11-01T00:00:00+09:00");
  assert.equal(periodRange("d90", now).to, null);
  assert.equal(isEventPeriod("d90"), true);
  assert.equal(isEventPeriod("x"), false);
});

test("더 보기 줄 수와 사용자 id 검사", () => {
  assert.equal(eventLimit(""), 200);
  assert.equal(eventLimit("201"), 400);
  assert.equal(eventLimit("999999"), 2000);
  assert.equal(eventLimit("abc"), 200);
  assert.equal(asUserId("12345678-1234-1234-1234-123456789abc"), "12345678-1234-1234-1234-123456789abc");
  assert.equal(asUserId("1,or(id.eq.2)"), null);
});
