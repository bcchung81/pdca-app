import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetState, buildOutline, halfPageTasks, isPageStep, pageSteps, splitBudget } from "./outline.ts";

test("카드 → 목차: 사업별 과제번호 순, 대상사업·실행과제 단, 기본 쪽수", () => {
  const card = (id: string, unit: string, taskNo: string, tb: string, et = "실행", no = "1") => ({ id, evalUnitId: unit, taskNo, targetBusiness: tb, executionTask: et, executionTaskNo: no });
  const rows = buildOutline([card("c3", "BZ-1", "10-가", "나"), card("c1", "BZ-1", "2-나", "가"), card("c2", "BZ-1", "2-가", "가"), card("d1", "BZ-2", "1-가", " ", "", "")]);
  assert.deepEqual(
    rows.map((r) => [r.card_id, r.sort, r.section, r.subsection]),
    [
      ["c2", 0, "가", "1. 실행"],
      ["c1", 1, "가", "1. 실행"],
      ["c3", 2, "나", "1. 실행"],
      ["d1", 0, "대상사업 미지정", null],
    ],
  );
  assert.equal(rows[0].pages, 3, "과제 3개 → 15/3=5 → 최대 3쪽");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  assert.equal(sum(splitBudget(19)), 15, "19개도 합이 15쪽");
  assert.deepEqual(splitBudget(19).slice(0, 12), Array(11).fill(1).concat([0.5]), "앞 11개 1쪽, 나머지 0.5쪽");
  assert.equal(sum(splitBudget(7)), 15);
  assert.ok(splitBudget(7).every((p) => p * 2 === Math.round(p * 2)));
  assert.deepEqual(splitBudget(40), Array(40).fill(0.5), "과제가 많으면 모두 0.5쪽(예산 넘침은 화면이 알림)");
});

test("쪽 예산 15±1과 0.5쪽 단위", () => {
  assert.equal(budgetState(13.5), "under");
  assert.equal(budgetState(14), "ok");
  assert.equal(budgetState(16), "ok");
  assert.equal(budgetState(16.5), "over");
  assert.ok(isPageStep(1.5));
  assert.ok(!isPageStep(1.25));
  assert.ok(!isPageStep(-1));
});

test("halfPageTasks: 실행과제 쪽 배정 합이 반쪽(X.5쪽)이면 목록에 남고, 정수 쪽이면 빠짐", () => {
  const row = (section: string, subsection: string | null, pages: number, included = true) => ({ section, subsection, pages, included });
  const rows = [
    row("가", "1. 실행", 1),
    row("가", "1. 실행", 0.5), // 합 1.5쪽 — 반쪽이 빔
    row("가", "2. 실행", 1), // 합 1쪽 — 안 나옴
    row("나", "1. 실행", 1),
    row("나", "1. 실행", 1), // 합 2쪽 — 안 나옴
  ];
  const half = halfPageTasks(rows);
  assert.deepEqual(half, [{ section: "가", subsection: "1. 실행", sum: 1.5 }]);
});

test("halfPageTasks: included가 false인 과제는 셈에서 빠짐, subsection이 null이면 대상사업 단위로 묶음", () => {
  const row = (section: string, subsection: string | null, pages: number, included = true) => ({ section, subsection, pages, included });
  const rows = [row("다", null, 1), row("다", null, 0.5), row("라", "1. 실행", 1), row("라", "1. 실행", 0.5, false)];
  const half = halfPageTasks(rows);
  assert.deepEqual(half, [{ section: "다", subsection: "", sum: 1.5 }], "라는 included=false 과제를 빼면 1쪽이라 안 나옴");
});

test("halfPageTasks: 넣은 과제가 없으면(합 0) 목록에 안 나옴", () => {
  const row = (section: string, subsection: string | null, pages: number, included = true) => ({ section, subsection, pages, included });
  assert.deepEqual(halfPageTasks([row("마", "1. 실행", 0.5, false)]), []);
});

test("pageSteps: 주요사업 3쪽까지(예전 선택지 그대로)·경영관리 10쪽까지, 목록 밖 지금 값은 더함 — 없으면 선택 상자가 0쪽으로 보임(경영관리 1-1 6쪽)", () => {
  assert.deepEqual(pageSteps(3), [0, 0.5, 1, 1.5, 2, 2.5, 3]);
  assert.equal(pageSteps(10).length, 21);
  assert.equal(pageSteps(10).at(-1), 10);
  assert.deepEqual(pageSteps(3, 6), [0, 0.5, 1, 1.5, 2, 2.5, 3, 6]);
  assert.deepEqual(pageSteps(3, 2), pageSteps(3), "목록 안 값은 그대로");
  assert.equal(pageSteps(99).at(-1), 10, "report_outline 한도 10쪽");
});
