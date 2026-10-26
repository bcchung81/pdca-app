// 내 과제 「N월에 할 일」 띠(lib/cards/my-todo.ts) 단위 시험 — 단계 숫자와 주 행동 우선순위가 행선 화면과 같은 셈으로 도는지 확인합니다.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReportSectionSpec } from "../reports/section.ts";
import type { SubmitCard } from "../reports/submission.ts";
import { type MyTodoInput, myTodo } from "./my-todo.ts";

const row = (id: string, taskNo: string, evalUnitId = "BZ-1") => ({ id, uid: `u-${id}`, taskNo, evalUnitId });
const ROWS = [row("c3", "2-가"), row("c1", "1-가"), row("c2", "1-나")];

function draftCard(id: string, state: "none" | "outline" | "draft", included = true): SubmitCard {
  // 시험용 최소 v3 spec(submission.test.ts와 같은 모양 — 셈에 쓰지 않는 필드는 기본값)
  const spec: ReportSectionSpec | null =
    state === "draft"
      ? { version: 3, card: { id, taskNo: id, title: id }, business: { no: 1, name: "대상사업" }, task: { no: "1-1", title: "실행과제", bp: false }, sub: { mark: "가", title: "소항목", markers: [] }, rows: [], results: [], caption: "", blocks: [], module: 1 }
      : null;
  return {
    id,
    uid: `u-${id}`,
    taskNo: id,
    title: id,
    included,
    pages: null,
    dataRev: 1,
    draft: state === "none" ? null : { spec, sourceRev: 1, unknownNumbers: [], outlineOnly: state === "outline" },
  };
}

function input(over: Partial<MyTodoInput> = {}): MyTodoInput {
  return { period: "2026-10", track: "주요사업", rows: ROWS, versions: new Map(), inspections: [], drafts: [], ...over };
}

const stepOf = (t: ReturnType<typeof myTodo>, key: string) => t.steps.find((s) => s.key === key);
const nowKeys = (t: ReturnType<typeof myTodo>) => t.steps.filter((s) => s.now).map((s) => s.key);

test("모두 시작 전: 과제번호 순 첫 과제 「실적 반영하기」, 실적 반영 단계가 지금", () => {
  const t = myTodo(input());
  assert.equal(t.title, "10월에 할 일");
  assert.deepEqual(t.action, { kind: "start", label: "1-가 실적 반영하기", uid: "u-c1", taskNo: "1-가" });
  assert.deepEqual(
    t.steps.map((s) => [s.key, s.tone, s.label, s.state]),
    [
      ["reflect", "idle", "10월 실적 반영", "3개 중 0개"],
      ["submit", "idle", "작성본 제출", "반영한 뒤 · 성과관리팀이 확정"],
    ],
  );
  assert.deepEqual(nowKeys(t), ["reflect"]);
});

test("우선순위 1: 돌려받은 작성본이 있으면 그 첫 과제 「보완하기」가 확인할 점검·초안보다 앞", () => {
  const t = myTodo(
    input({
      versions: new Map([
        ["c3", { status: "draft", note: "보완 요청" }],
        ["c2", { status: "draft", note: "다시" }],
      ]),
      inspections: [{ status: "sent", card: { evalUnitId: "BZ-1" } }],
      drafts: [draftCard("c1", "none")],
    }),
  );
  assert.deepEqual(t.action, { kind: "returned", label: "1-나 보완하기", uid: "u-c2", taskNo: "1-나" });
  assert.deepEqual(stepOf(t, "returned"), { key: "returned", tone: "alert", label: "돌려받은 작성본", state: "2건 보완 필요", now: true });
  assert.equal(t.steps[0].key, "returned");
  assert.deepEqual(nowKeys(t), ["returned"]);
});

test("우선순위 2: 확인할 점검 → /my/inspections 「확인할 것」, 우선순위 3: 초안 없는 과제 → 경평 초안", () => {
  const base = { versions: new Map([["c1", { status: "submitted" as const, note: null }]]), drafts: [draftCard("c1", "none"), draftCard("c2", "draft")] };
  const a = myTodo(input({ ...base, inspections: [{ status: "sent", card: { evalUnitId: "BZ-1" } }, { status: "acknowledged", card: { evalUnitId: "BZ-2" } }] }));
  assert.deepEqual(a.action, { kind: "inspect", label: "점검 결과 확인" });
  assert.deepEqual(stepOf(a, "inspect"), { key: "inspect", tone: "doing", label: "점검 결과 확인", state: "받은 2건 중 1건 확인 필요", now: true });

  const b = myTodo(input({ ...base, inspections: [{ status: "acknowledged", card: { evalUnitId: "BZ-1" } }] }));
  assert.deepEqual(b.action, { kind: "draft", label: "경평 초안 쓰기" });
  assert.deepEqual(stepOf(b, "inspect"), { key: "inspect", tone: "done", label: "점검 결과 확인", state: "모두 확인함", now: false });
  assert.deepEqual(stepOf(b, "draft"), { key: "draft", tone: "doing", label: "경평 초안", state: "초안 없는 과제 1건", now: true });
});

test("할 일 없음: 주 행동 없음(모두 시작함·점검 모두 확인·초안 모두 있음)", () => {
  const t = myTodo(
    input({
      versions: new Map(ROWS.map((r) => [r.id, { status: "confirmed" as const, note: null }])),
      inspections: [{ status: "acknowledged", card: { evalUnitId: "BZ-1" } }],
      drafts: ROWS.map((r) => draftCard(r.id, "draft")),
    }),
  );
  assert.equal(t.action, null);
  assert.deepEqual(nowKeys(t), []);
  assert.deepEqual(
    t.steps.map((s) => [s.key, s.tone, s.state]),
    [
      ["reflect", "done", "3개 중 3개"],
      ["submit", "done", "모두 확정"],
      ["inspect", "done", "모두 확인함"],
      ["draft", "done", "과제별 초안 모두 있음"],
    ],
  );
});

test("숫자: 작성 중·돌려받음·제출·확정이 섞이면 반영 m은 넷 모두, 제출은 제출만 세고 handoff", () => {
  const rows = [...ROWS, row("c4", "3-가"), row("c5", "3-나")];
  const t = myTodo(
    input({
      rows,
      versions: new Map([
        ["c1", { status: "draft", note: null }],
        ["c2", { status: "draft", note: "보완" }],
        ["c3", { status: "submitted", note: null }],
        ["c4", { status: "confirmed", note: null }],
        ["x9", { status: "submitted", note: null }], // 이 화면 밖 과제는 세지 않음
      ]),
    }),
  );
  assert.equal(stepOf(t, "reflect")?.state, "5개 중 4개");
  assert.equal(stepOf(t, "reflect")?.tone, "doing");
  assert.deepEqual(stepOf(t, "submit"), { key: "submit", tone: "handoff", label: "작성본 제출", state: "1건 · 성과관리팀 확인 대기", now: false });
  assert.equal(stepOf(t, "returned")?.state, "1건 보완 필요");
});

test("목차에서 뺀 과제는 초안 숫자에서 빠지고, 구성안만 있는 과제는 초안 없음으로 셈(제출 조건과 같음)", () => {
  const t = myTodo(
    input({
      versions: new Map(ROWS.map((r) => [r.id, { status: "confirmed" as const, note: null }])),
      drafts: [draftCard("c1", "none", false), draftCard("c2", "outline"), draftCard("c3", "draft"), draftCard("x9", "none")],
    }),
  );
  assert.equal(stepOf(t, "draft")?.state, "초안 없는 과제 1건");
  assert.deepEqual(t.action, { kind: "draft", label: "경평 초안 쓰기" });

  const allOut = myTodo(input({ drafts: [draftCard("c1", "none", false)] }));
  assert.equal(stepOf(allOut, "draft"), undefined, "목차 포함 과제가 없으면 단계 없음");
});

test("받은 점검이 없으면 점검 단계 없음, 다른 트랙 과제의 점검은 /my/inspections처럼 세지 않음", () => {
  assert.equal(stepOf(myTodo(input()), "inspect"), undefined);
  const t = myTodo(input({ inspections: [{ status: "sent", card: { evalUnitId: "MG-3" } }] }));
  assert.equal(stepOf(t, "inspect"), undefined);
  assert.equal(t.action?.kind, "start");
  const mg = myTodo(input({ track: "경영관리", rows: [row("m1", "3-1", "MG-3")], inspections: [{ status: "sent", card: { evalUnitId: "MG-3" } }, { status: "sent", card: { evalUnitId: "BZ-1" } }] }));
  assert.equal(stepOf(mg, "inspect")?.state, "받은 1건 중 1건 확인 필요");
});

test("과제가 없으면 반영 단계는 0개 중 0개이고 주 행동 없음", () => {
  const t = myTodo(input({ rows: [] }));
  assert.equal(t.action, null);
  assert.equal(stepOf(t, "reflect")?.state, "0개 중 0개");
});

test("우선순위 5: 모두 시작했고 작성 중(아직 안 냄)만 남으면 첫 과제 「이어서 작성」, 작성본 제출 단계가 지금", () => {
  const t = myTodo(
    input({
      versions: new Map([
        ["c1", { status: "confirmed", note: null }],
        ["c2", { status: "draft", note: null }],
        ["c3", { status: "draft", note: null }],
      ]),
    }),
  );
  assert.deepEqual(t.action, { kind: "continue", label: "1-나 이어서 작성", uid: "u-c2", taskNo: "1-나" });
  assert.deepEqual([stepOf(t, "submit")?.tone, stepOf(t, "submit")?.state], ["doing", "작성 중 2건 · 제출 전"]);
  assert.deepEqual(nowKeys(t), ["submit"]);
});
