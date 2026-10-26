// 과제별 초안 「AI 초안」 탭 단계 레일(lib/reports/draft-stage.ts) 시험 — 상태 갈래마다 단계 상태·지금 단계·주 행동 하나·다시 쓰기 묶음.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type DraftStage, type DraftStageInput, draftStage } from "./draft-stage.ts";

const base: DraftStageInput = { hasOutline: false, outlineApproved: false, hasDraft: false, draftFromOutline: false, stale: false, checks: 0, mg: false, canWrite: true, locked: false, deptView: false };
const run = (x: Partial<DraftStageInput>) => draftStage({ ...base, ...x });
const states = (s: DraftStage) => s.steps.map((x) => `${x.label}:${x.state}:${x.tone}`);
const now = (s: DraftStage) => s.steps.filter((x) => x.now).map((x) => x.key);
const keys = (xs: DraftStage["redo"]) => xs.map((x) => x.key);

test("draftStage: 단계는 늘 구성안 · 초안 · 점검 셋, 지금 단계는 하나뿐", () => {
  const all: Array<Partial<DraftStageInput>> = [
    {},
    { hasOutline: true },
    { hasOutline: true, outlineApproved: true },
    { hasOutline: true, outlineApproved: true, hasDraft: true, draftFromOutline: true },
    { hasDraft: true, stale: true },
    { hasDraft: true, locked: true, canWrite: false },
    { hasDraft: true, deptView: true, canWrite: false },
    { mg: true },
  ];
  for (const x of all) {
    const s = run(x);
    assert.deepEqual(
      s.steps.map((y) => y.label),
      ["구성안", "초안", "점검"],
    );
    assert.equal(now(s).length, 1, JSON.stringify(x));
  }
});

test("draftStage: 초안·구성안 없음 — 주 행동 「구성안 만들기」, 주요사업만 보조 「구성안 없이 바로 만들기」", () => {
  const s = run({});
  assert.deepEqual(states(s), ["구성안:없음:idle", "초안:없음:idle", "점검:초안 뒤:idle"]);
  assert.deepEqual(now(s), ["outline"]);
  assert.deepEqual(s.primary, { key: "outline", label: "구성안 만들기" });
  assert.deepEqual(s.alt, [{ key: "draft", label: "구성안 없이 바로 만들기", quiet: true }]);
  assert.deepEqual(s.redo, []);
});

test("draftStage: 경영관리는 바로 만들기가 어디에도 없음(초안 없음·초안 있음)", () => {
  const empty = run({ mg: true });
  assert.deepEqual(empty.primary, { key: "outline", label: "구성안 만들기" });
  assert.deepEqual(empty.alt, []);
  const drafted = run({ mg: true, hasOutline: true, outlineApproved: true, hasDraft: true, draftFromOutline: true });
  assert.deepEqual(keys(drafted.redo), ["plan", "outline"]);
  assert.ok(![drafted.primary, ...drafted.alt, ...drafted.redo].some((a) => a?.key === "draft"));
});

test("draftStage: 구성안만(확인 전) — 지금 구성안, 주 행동 「구성안 보기」(구성안 패널의 승인하고 집필로)", () => {
  const s = run({ hasOutline: true });
  assert.deepEqual(states(s), ["구성안:확인 전:doing", "초안:없음:idle", "점검:초안 뒤:idle"]);
  assert.deepEqual(now(s), ["outline"]);
  assert.deepEqual(s.primary, { key: "show-outline", label: "구성안 보기" });
  assert.deepEqual(s.alt, [
    { key: "outline", label: "구성안 다시 만들기" },
    { key: "draft", label: "바로 만들기", quiet: true },
  ]);
  assert.deepEqual(s.redo, []);
  // 경영관리는 바로 만들기 없음
  assert.deepEqual(run({ mg: true, hasOutline: true }).alt, [{ key: "outline", label: "구성안 다시 만들기" }]);
});

test("draftStage: 승인된 구성안에 초안이 없으면(드묾) 지금 초안 · 주 행동 「구성안대로 집필」", () => {
  const s = run({ hasOutline: true, outlineApproved: true });
  assert.deepEqual(states(s), ["구성안:승인:done", "초안:없음:idle", "점검:초안 뒤:idle"]);
  assert.deepEqual(now(s), ["draft"]);
  assert.deepEqual(s.primary, { key: "plan", label: "구성안대로 집필" });
  assert.deepEqual(keys(s.alt), ["outline", "draft"]);
  assert.deepEqual(keys(run({ mg: true, hasOutline: true, outlineApproved: true }).alt), ["outline"]);
});

test("draftStage: 초안 있음 — 지금 점검, 주 행동 「점검 결과 보기」, 다시 쓰기 묶음(구성안대로 집필·구성안 다시 만들기·조용한 바로 다시 만들기)", () => {
  const s = run({ hasOutline: true, outlineApproved: true, hasDraft: true, draftFromOutline: true, checks: 10 });
  assert.deepEqual(states(s), ["구성안:승인 · 집필함:done", "초안:초안 있음:done", "점검:할 일 10:handoff"]);
  assert.deepEqual(now(s), ["check"]);
  assert.deepEqual(s.primary, { key: "show-check", label: "점검 결과 보기" });
  assert.deepEqual(s.redo, [
    { key: "plan", label: "구성안대로 집필" },
    { key: "outline", label: "구성안 다시 만들기" },
    { key: "draft", label: "바로 다시 만들기", quiet: true },
  ]);
  assert.equal(s.redoOpen, false);
  // 점검 할 일 0 — 끝
  assert.equal(run({ hasDraft: true }).steps[2].state, "확인할 것 없음");
  assert.equal(run({ hasDraft: true }).steps[2].tone, "done");
});

test("draftStage: 바로 만들기 초안 — 구성안 「안 씀」, 다시 쓰기에 구성안대로 집필 없음·「구성안 만들기」", () => {
  const s = run({ hasDraft: true });
  assert.equal(s.steps[0].state, "안 씀");
  assert.deepEqual(s.redo.map((a) => a.label), ["구성안 만들기", "바로 다시 만들기"]);
  // 승인된 구성안 뒤 바로 다시 만들기(spec.plan 없음)
  assert.equal(run({ hasOutline: true, outlineApproved: true, hasDraft: true }).steps[0].state, "초안에 안 씀");
  // 초안 뒤 새로 만든 확인 전 구성안 — 우리 차례지만 지금 단계는 점검
  const later = run({ hasOutline: true, hasDraft: true });
  assert.deepEqual([later.steps[0].state, later.steps[0].tone, now(later)[0]], ["확인 전", "doing", "check"]);
});

test("draftStage: 원장이 바뀜 — 초안 단계 「원장이 바뀜 · 다시 쓰기 권장」(우리 차례), 주 행동은 그대로 · 다시 쓰기 묶음 펼침", () => {
  const s = run({ hasOutline: true, outlineApproved: true, hasDraft: true, draftFromOutline: true, stale: true, checks: 3 });
  assert.deepEqual(s.steps[1], { key: "draft", label: "초안", state: "원장이 바뀜 · 다시 쓰기 권장", tone: "doing", now: false });
  assert.deepEqual(s.primary, { key: "show-check", label: "점검 결과 보기" });
  assert.equal(s.redoOpen, true);
  assert.equal(s.redo.length, 3);
  assert.ok(!s.steps.some((x) => x.tone === "alert"), "경고색 없음");
});

test("draftStage: 보고서 잠김(제출·승인) — 「보고서 상태 보기」 하나뿐, 만들기·다시 쓰기 없음", () => {
  for (const x of [{ hasDraft: true, stale: true }, { hasOutline: true }, {}] as Array<Partial<DraftStageInput>>) {
    const s = run({ ...x, locked: true, canWrite: false });
    assert.deepEqual(s.primary, { key: "report", label: "보고서 상태 보기" });
    assert.deepEqual([s.alt, s.redo, s.redoOpen], [[], [], false]);
  }
});

test("draftStage: 부서 화면 보기·쓸 수 없음 — 보기 행동만(초안 → 점검 결과 보기, 구성안만 → 구성안 보기, 없음 → 없음)", () => {
  for (const ro of [{ deptView: true, canWrite: false }, { canWrite: false }, { deptView: true }] as Array<Partial<DraftStageInput>>) {
    assert.deepEqual(run({ ...ro, hasDraft: true, hasOutline: true, stale: true }).primary, { key: "show-check", label: "점검 결과 보기" });
    assert.deepEqual(run({ ...ro, hasOutline: true }).primary, { key: "show-outline", label: "구성안 보기" });
    const empty = run(ro);
    assert.equal(empty.primary, null);
    for (const s of [empty, run({ ...ro, hasDraft: true, stale: true })]) assert.deepEqual([s.alt, s.redo, s.redoOpen], [[], [], false]);
  }
});

test("draftStage: 주 행동은 늘 하나 이하이고 생성 행동은 쓸 수 있을 때만", () => {
  const gen = new Set(["outline", "plan", "draft"]);
  for (const hasOutline of [false, true])
    for (const outlineApproved of [false, true])
      for (const hasDraft of [false, true])
        for (const stale of [false, true])
          for (const mg of [false, true])
            for (const [canWrite, locked, deptView] of [
              [true, false, false],
              [false, true, false],
              [false, false, true],
              [false, false, false],
            ] as const) {
              const s = run({ hasOutline, outlineApproved, hasDraft, draftFromOutline: hasDraft && outlineApproved, stale, mg, canWrite, locked, deptView });
              const acts = [s.primary, ...s.alt, ...s.redo].filter((a) => a !== null);
              if (!canWrite) assert.ok(!acts.some((a) => gen.has(a.key)), "읽기 전용·잠김에 생성 행동 없음");
              if (mg) assert.ok(!acts.some((a) => a.key === "draft"), "경영관리 바로 만들기 없음");
              if (!hasDraft) assert.equal(s.redo.length, 0, "초안이 없으면 다시 쓰기 없음");
            }
});
