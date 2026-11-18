import assert from "node:assert/strict";
import { test } from "node:test";
import { recomputeDerived } from "./edit.ts";
import { AUTOSAVE_SUMMARY, type EditPoint, HISTORY_MERGE_MS, REVERT_PREFIX, SYNC_PREFIX, historyMergeable, kstStamp, planRevert, revertSummary } from "./revert.ts";

/** checkEditable을 통과하는 최소 주요사업 카드 */
function card(doLine: string, extra: Record<string, unknown> = {}) {
  return {
    id: "1-가",
    group: "주요사업1",
    taskNo: "1-가",
    title: "시험 과제",
    overview: { cells: [] },
    kpi: { rows: [] },
    strategy: {},
    act: {},
    plan: {},
    do: { lines: [doLine] },
    check: {},
    outcome: {},
    ...extra,
  };
}

const point = (id: number, before: unknown, after: unknown, summary = `${AUTOSAVE_SUMMARY}(Do·50%·진행중)`, at = "2026-11-18T05:05:00Z"): EditPoint => ({ id, at, summary, before, after });

test("정상: 그 수정 직후(after) 내용으로 되돌리고 요약에 서울 시각·이력 번호", () => {
  const plan = planRevert(point(12, card("가"), card("나")), "after", [{ summary: `${AUTOSAVE_SUMMARY}(…)` }], { data: card("다") });
  assert.equal(plan.ok, true);
  assert.ok(plan.ok);
  assert.deepEqual(plan.data.do, { lines: ["나"] });
  assert.equal(plan.summary, "되돌림: 2026-11-18 14:05 시점(이력 #12)");
});

test("정상: 가장 오래된 행의 수정 전(before)으로", () => {
  const plan = planRevert(point(3, card("가"), card("나")), "before", [], { data: card("다") });
  assert.ok(plan.ok);
  assert.deepEqual(plan.data.do, { lines: ["가"] });
  assert.equal(plan.summary, "되돌림: 2026-11-18 14:05 수정 전(이력 #3)");
});

test("되돌린 내용은 파생 칸을 다시 셈(saveCard와 같은 recomputeDerived)", () => {
  const old = card("가", { overview: { cells: ["☑ 고도화"] } });
  const plan = planRevert(point(1, card("x"), old), "after", [], { data: card("다") });
  assert.ok(plan.ok);
  assert.equal(plan.data.overview.checks.advanced, true);
  assert.equal(plan.data.overview.kind, "고도화");
});

test("현행화 뒤 시점은 막음 — 고른 시점 뒤에 현행화 행이 있으면", () => {
  const later = [{ summary: `${AUTOSAVE_SUMMARY}(…)` }, { summary: `${SYNC_PREFIX} 1-가.hwp (기본·Do)` }];
  const plan = planRevert(point(5, card("가"), card("나")), "after", later, { data: card("다") });
  assert.equal(plan.ok, false);
  assert.ok(!plan.ok);
  assert.equal(plan.code, "sync");
});

test("현행화 행 자신의 after(현행화 직후)는 되돌릴 수 있고, before(현행화 전)는 막음", () => {
  const sync = point(7, card("가"), card("나"), `${SYNC_PREFIX} 1-가.hwp (Do)`);
  assert.equal(planRevert(sync, "after", [], { data: card("다") }).ok, true);
  const before = planRevert(sync, "before", [], { data: card("다") });
  assert.ok(!before.ok);
  assert.equal(before.code, "sync");
});

test("지금 내용과 같으면 쓰지 않음(키 순서만 다른 jsonb도 같음)", () => {
  const now = recomputeDerived(card("나")); // 원장 값은 저장 때 파생 칸을 다시 센 값
  const reordered = Object.fromEntries(Object.entries(card("나")).reverse());
  const plan = planRevert(point(9, card("가"), reordered), "after", [], { data: now });
  assert.ok(!plan.ok);
  assert.equal(plan.code, "same");
});

test("식별 값(id·group·taskNo)이 지금과 다르면 막음", () => {
  for (const k of ["id", "group", "taskNo"]) {
    const plan = planRevert(point(2, card("가"), card("나", { [k]: "다른 값" })), "after", [], { data: card("다") });
    assert.ok(!plan.ok, k);
    assert.equal(plan.code, "identity", k);
  }
});

test("새 과제 등록 행의 before(빈 객체)는 막음", () => {
  const reg = point(1, {}, card("가"), "새 과제 등록: 1-가.hwp");
  const plan = planRevert(reg, "before", [], { data: card("다") });
  assert.ok(!plan.ok);
  assert.equal(plan.code, "empty");
  assert.equal(planRevert(reg, "after", [], { data: card("다") }).ok, true, "등록 직후로는 되돌릴 수 있음");
});

test("보관한 과제는 막음", () => {
  const plan = planRevert(point(4, card("가"), card("나")), "after", [], { data: card("다"), retired: true });
  assert.ok(!plan.ok);
  assert.equal(plan.code, "retired");
});

test("구역이 빠진 옛 내용은 원장에 쓸 수 없음(checkEditable)", () => {
  const broken = card("나");
  delete (broken as Record<string, unknown>).outcome;
  const plan = planRevert(point(6, card("가"), broken), "after", [], { data: card("다") });
  assert.ok(!plan.ok);
  assert.equal(plan.code, "invalid");
  assert.match(plan.reason, /outcome 구역이 없습니다/);
});

test("서울 시각 표기(자정은 00시)", () => {
  assert.equal(kstStamp("2026-11-17T15:00:00Z"), "2026-11-18 00:00");
  assert.equal(revertSummary({ id: 30, at: "2026-01-02T03:04:00Z" }, "after"), "되돌림: 2026-01-02 12:04 시점(이력 #30)");
});

test("이력 합치기: 같은 사람의 30분 안 자동 저장 행만 — 되돌림·현행화 행에는 합치지 않음", () => {
  const now = Date.parse("2026-11-18T05:20:00Z");
  const at = "2026-11-18T05:05:00Z";
  assert.equal(historyMergeable({ edited_by: "u1", edited_at: at, summary: `${AUTOSAVE_SUMMARY}(Do·50%·진행중)` }, "u1", now), true);
  assert.equal(historyMergeable({ edited_by: "u2", edited_at: at, summary: `${AUTOSAVE_SUMMARY}(Do·50%·진행중)` }, "u1", now), false, "다른 사람");
  assert.equal(historyMergeable({ edited_by: "u1", edited_at: at, summary: `${AUTOSAVE_SUMMARY}(…)` }, "u1", now + HISTORY_MERGE_MS), false, "30분 지남");
  assert.equal(historyMergeable({ edited_by: "u1", edited_at: at, summary: `${REVERT_PREFIX} 2026-11-18 14:00 시점(이력 #3)` }, "u1", now), false, "되돌림 행");
  assert.equal(historyMergeable({ edited_by: "u1", edited_at: at, summary: `${SYNC_PREFIX} a.hwp (Do)` }, "u1", now), false, "현행화 행");
  assert.equal(historyMergeable(null, "u1", now), false);
  assert.ok(!revertSummary({ id: 1, at }, "after").startsWith(AUTOSAVE_SUMMARY), "되돌림 요약은 자동 저장 앞머리로 시작하지 않음");
});
