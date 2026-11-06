// AI 백그라운드 작업 순수 규칙(lib/ai/jobs.ts) — 상태 판정·중복 막기·폴링 대상·끝난 작업·화면 주소(2026-11-06)
import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_LIMITS } from "./request-log.ts";
import { JOB_STALE_MSG, type JobRow, busyJobMessage, elapsedLabel, finishedSince, jobHref, jobNotice, jobState, jobTitle, parseIds, shouldPoll, toAiJob } from "./jobs.ts";

const NOW = Date.parse("2026-11-06T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const row = (o: Partial<JobRow> = {}): JobRow => ({ id: 1, feature: "report_outline", job: "outline", mode: "1p", status: "running", error: null, created_at: iso(NOW - 60_000), finished_at: null, card: { uid: "u-1", task_no: "1-가", title: "과제" }, res: null, ...o });

test("jobState: 결과 행이 있으면 그 끝맺음, 없고 기록이 error면 실패, 기록이 ok여도 결과 전이면 진행 중(검증·저장이 남음), staleMs가 지나면 끊김", () => {
  assert.deepEqual(jobState(row(), NOW), { state: "running", message: "" });
  assert.deepEqual(jobState(row({ status: "ok" }), NOW), { state: "running", message: "" }, "AI는 끝났지만 저장 전");
  assert.deepEqual(jobState(row({ status: "ok", res: { ok: true, message: "구성안을 만들었습니다" } }), NOW), { state: "ok", message: "구성안을 만들었습니다" });
  assert.deepEqual(jobState(row({ status: "ok", res: [{ ok: false, message: "저장 충돌" }] }), NOW), { state: "error", message: "저장 충돌" }, "배열로 와도(PostgREST 관계 모양)");
  assert.deepEqual(jobState(row({ status: "error", error: "시간 초과" }), NOW), { state: "error", message: "시간 초과" });
  assert.deepEqual(jobState(row({ created_at: iso(NOW - AI_LIMITS.staleMs - 1) }), NOW), { state: "error", message: JOB_STALE_MSG });
});

test("toAiJob: 작업 종류가 없거나 모르는 행은 null, 카드는 uid·과제번호·과제명", () => {
  assert.equal(toAiJob(row({ job: null }), NOW), null);
  assert.equal(toAiJob(row({ job: "nope" }), NOW), null);
  const j = toAiJob(row({ id: 5, job: "plan", feature: "report_section", card: [{ uid: "u-2", task_no: "2-나", title: "둘" }] }), NOW)!;
  assert.deepEqual({ id: j.id, kind: j.kind, state: j.state, card: j.card }, { id: 5, kind: "plan", state: "running", card: { uid: "u-2", taskNo: "2-나", title: "둘" } });
});

test("busyJobMessage: 같은 카드에서 같은 묶음(경평 초안끼리·작성지원과 질문끼리) 작업이 돌면 거절, 다른 묶음·끝난 작업·끊긴 작업은 통과", () => {
  const running = row({ job: "outline" });
  assert.match(busyJobMessage([running], "plan", NOW) ?? "", /구성안 만들기.*돌고 있습니다/);
  assert.equal(busyJobMessage([running], "assist", NOW), null, "다른 묶음");
  assert.match(busyJobMessage([row({ job: "assist", feature: "card_assist" })], "chat", NOW) ?? "", /AI 작성지원/);
  assert.equal(busyJobMessage([row({ job: "comment" })], "assist", NOW), null, "코멘트는 따로");
  assert.equal(busyJobMessage([row({ res: { ok: true, message: "" } })], "outline", NOW), null, "끝난 작업");
  assert.equal(busyJobMessage([row({ status: "error" })], "outline", NOW), null, "실패한 작업");
  assert.equal(busyJobMessage([row({ created_at: iso(NOW - AI_LIMITS.staleMs - 1) })], "outline", NOW), null, "끊긴 작업");
  assert.equal(busyJobMessage([], "outline", NOW), null);
});

test("shouldPoll: 창이 보일 때만, 진행 중 작업이 있거나 시작한 작업을 아직 서버에서 못 봤을 때만", () => {
  const run = { id: 1, state: "running" as const };
  const done = { id: 2, state: "ok" as const };
  assert.equal(shouldPoll([run], [], true), true);
  assert.equal(shouldPoll([run], [], false), false, "창이 숨으면 멈춤");
  assert.equal(shouldPoll([done], [], true), false, "끝나면 멈춤");
  assert.equal(shouldPoll([done], [3], true), true, "막 시작해 아직 목록에 없음");
  assert.equal(shouldPoll([done], [2], true), false);
  assert.equal(shouldPoll([], [], true), false, "아무 작업 없으면 읽지 않음");
});

test("finishedSince: 전에 진행 중으로 본 것 중 지금 끝난 것만(처음 보는 끝난 작업은 알리지 않음)", () => {
  const after = [toAiJob(row({ id: 1, res: { ok: true, message: "끝" } }), NOW)!, toAiJob(row({ id: 2 }), NOW)!, toAiJob(row({ id: 3, status: "error", error: "x" }), NOW)!];
  const d = finishedSince(
    [
      { id: 1, state: "running" },
      { id: 2, state: "running" },
    ],
    after,
  );
  assert.deepEqual(
    d.map((j) => [j.id, j.state]),
    [[1, "ok"]],
  );
});

test("화면 글·주소: 경평 초안은 과제별 초안, 과제원장은 카드 전체 쪽, 이름은 과제번호 · 자리 · 종류", () => {
  const rep = toAiJob(row(), NOW)!;
  const card = toAiJob(row({ job: "chat", feature: "card_chat" }), NOW)!;
  assert.equal(jobHref(rep), "/reports/cards/u-1");
  assert.equal(jobHref(card), "/cards/u-1");
  assert.equal(jobHref({ ...rep, card: null }), null);
  assert.equal(jobTitle(rep), "1-가 경평 초안 · 구성안 만들기");
  assert.equal(jobTitle(card), "1-가 과제원장 · 질문");
  assert.equal(jobNotice({ ...rep, state: "ok" }), "1-가 경평 초안 · 구성안 만들기 — 끝났어요");
  assert.equal(jobNotice({ ...rep, state: "error" }), "1-가 경평 초안 · 구성안 만들기 — 실패했어요");
  assert.equal(elapsedLabel(iso(NOW - 45_000), NOW), "45초");
  assert.equal(elapsedLabel(iso(NOW - 192_000), NOW), "3분 12초");
});

test("parseIds: 양의 정수만·중복 없이·많아야 n개", () => {
  assert.deepEqual(parseIds("3, 1,x,-2,1,0,4.5"), [3, 1]);
  assert.deepEqual(parseIds(null), []);
  assert.deepEqual(parseIds("1,2,3", 2), [1, 2]);
});
