// 경평 구성안의 「월간 점검 보완 요청」(lib/reports/inspection-input.ts) 시험 — 원장 → 종합점검 → 경평 구성안 흐름(2026-10-09):
// 이 과제의 최종 점검표(보완 점검과 같은 규칙 — followupBasis) 미흡 행을 구성안 요청에 넣어 평가 논점·블록 목적이 약점을 메우게 함.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { FollowupBasis } from "../ai/followup.ts";
import { reportOutlinePrompts, reportOutlinePromptsMg } from "../prompts/sets.ts";
import { outlineInspectionPrompt } from "./inspection-input.ts";

const basis: FollowupBasis = {
  period: "2026-09",
  statusLabel: "부서 확인함",
  focus: true,
  rows: [
    { id: "axes.4", table: "axes", no: 4, label: "7대축 4 OutCome 연결", star: true, requested: "산출(교육 횟수)을 국민 체감 성과로 잇는 근거 보강", cardThen: "교육 85회", question: "", evidence: ["관리계획 「원문」"] },
    { id: "patterns.5", table: "patterns", no: 5, label: "질의패턴 5 계량 수치의 함정", star: true, requested: "목표 설정의 도전성 근거", cardThen: "", question: "목표가 전년 실적보다 낮은 이유는?", evidence: [] },
    { id: "coherence.2", table: "coherence", no: 2, label: "정합성 2", star: false, requested: "가".repeat(400), cardThen: "", question: "", evidence: [] },
  ],
  recheck: [{ id: "axes.6", label: "7대축 6", judgment: "기준 미확인", note: "" }],
};

test("두 트랙 구성안 요청: 점검월·상태·집중보완, 미흡 행마다 이름·★·보완 요청·예상 질의, 자리표시 없음, 긴 보완 요청은 자름", () => {
  for (const p of [reportOutlinePrompts().prompts, reportOutlinePromptsMg().prompts]) {
    const text = outlineInspectionPrompt(p, basis);
    assert.doesNotMatch(text, /\{\{\w+\}\}/);
    assert.match(text, /’26\.9/);
    assert.match(text, /부서 확인함/);
    assert.match(text, /집중보완/);
    assert.match(text, /7대축 4 OutCome 연결 ★/);
    assert.match(text, /산출\(교육 횟수\)을 국민 체감 성과로 잇는 근거 보강/);
    assert.match(text, /목표가 전년 실적보다 낮은 이유는\?/);
    assert.ok(!text.includes("가".repeat(201)), "보완 요청은 200자까지");
    assert.doesNotMatch(text, /7대축 6/, "기준 미확인·해당 없음 행은 넣지 않음");
  }
});

test("점검표가 없거나 미흡 행이 없으면 빈 글(요청에 절을 붙이지 않음)", () => {
  const p = reportOutlinePrompts().prompts;
  assert.equal(outlineInspectionPrompt(p, null), "");
  assert.equal(outlineInspectionPrompt(p, { ...basis, rows: [] }), "");
});

test("집중보완이 아니면 집중보완 문구가 없음", () => {
  const text = outlineInspectionPrompt(reportOutlinePrompts().prompts, { ...basis, focus: false });
  assert.doesNotMatch(text, /집중보완 과제/);
});
