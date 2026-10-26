import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_VIEW, boardHref, parseView, viewParams } from "./board-view.ts";

test("보기 설정 ↔ 주소: 왕복, 모르는 값은 버림, 옆 창 주소에 보기 유지", () => {
  const v = parseView({ unit: "BZ-2", q: "자격 검정", sort: "person.desc", f_department: "전파기반본부", f_kind: "" }, ["BZ-1", "BZ-2", "BZ-3"]);
  assert.deepEqual(v, { unit: "BZ-2", q: "자격 검정", sort: { key: "person", dir: "desc" }, filters: { department: ["전파기반본부"], kind: [], draft: [] } });
  assert.deepEqual(parseView(Object.fromEntries(new URLSearchParams(boardHref(v).split("?")[1])), ["BZ-1", "BZ-2", "BZ-3"]), v);
  assert.deepEqual(parseView({ unit: "BZ-9", sort: "evil.asc" }, ["BZ-1"]), EMPTY_VIEW);
  assert.equal(boardHref(EMPTY_VIEW), "/cards");
  assert.equal(boardHref(EMPTY_VIEW, "abc"), "/cards?peek=abc");
  assert.ok(boardHref(v, "u1").endsWith("&peek=u1"));
});

test("옛 주소 쿼리(PDCA 단계·진도율·상태 정렬·필터)는 오류 없이 무시", () => {
  // 목록에서 단계·진도율·상태 열을 없앤 뒤에도 예전 북마크·링크가 오류 없이 빈 보기로 떨어져야 함
  const v = parseView({ sort: "progress.desc", f_status: "진행중", f_stage: "Plan" }, ["BZ-1"]);
  assert.deepEqual(v, EMPTY_VIEW);
});

test("작성본 필터(f_draft): 왕복, 다른 필터·검색·정렬·peek·keep과 함께 보존", () => {
  const units = ["BZ-1", "BZ-2"];
  const v = parseView({ unit: "BZ-1", q: "교육", sort: "taskNo.asc", f_department: "경영지원본부", f_draft: "제출|시작 전" }, units);
  assert.deepEqual(v.filters, { department: ["경영지원본부"], kind: [], draft: ["제출", "시작 전"] });
  const href = boardHref(v, "u1", { path: "/my", keep: { team: "7" } });
  const sp = new URLSearchParams(href.split("?")[1]);
  assert.equal(sp.get("f_draft"), "제출|시작 전");
  assert.equal(sp.get("team"), "7");
  assert.equal(sp.get("peek"), "u1");
  assert.deepEqual(parseView(Object.fromEntries(sp), units), v);
  // 현황 바로 가기 주소: 한글 값도 viewParams가 인코딩하고 파싱이 되돌림
  const link = `/cards?${viewParams({ ...EMPTY_VIEW, filters: { ...EMPTY_VIEW.filters, draft: ["시작 전"] } })}`;
  assert.deepEqual(parseView(Object.fromEntries(new URL(link, "http://x").searchParams), units).filters.draft, ["시작 전"]);
  // 값이 없으면 주소에 안 붙음
  assert.equal(viewParams(EMPTY_VIEW).has("f_draft"), false);
});
