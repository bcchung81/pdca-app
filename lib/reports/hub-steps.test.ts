// 경평 초안 부서 허브 단계 띠(lib/reports/hub-steps.ts) 단위 시험 — 단계 상태 글·톤, 지금 단계, 주 행동 갈래가 제출 조건(submitReadiness) 셈 그대로 도는지 확인합니다.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type HubStepsInput, hubSteps } from "./hub-steps.ts";
import type { ReportSectionSpec } from "./section.ts";
import { type SubmitCard, submitReadiness } from "./submission.ts";

/** 시험용 최소 v3 spec(submission.test.ts와 같은 모양 — 셈에 쓰지 않는 필드는 기본값) */
function spec(): ReportSectionSpec {
  return {
    version: 3,
    card: { id: "c", taskNo: "1-가", title: "제목" },
    business: { no: 1, name: "대상사업" },
    task: { no: "1-1", title: "실행과제", bp: false },
    sub: { mark: "가", title: "소항목", markers: [] },
    rows: [],
    results: [],
    caption: "",
    blocks: [],
    module: 1,
  };
}

/** unknown: 근거에 없는 숫자(제출 확인할 것 한 줄이 생김) */
function card(taskNo: string, state: "none" | "outline" | "draft", over: Partial<SubmitCard> = {}, unknown: string[] = []): SubmitCard {
  return {
    id: `c-${taskNo}`,
    uid: `u-${taskNo}`,
    taskNo,
    title: taskNo,
    included: true,
    pages: 1,
    dataRev: 1,
    draft: state === "none" ? null : { spec: state === "draft" ? spec() : null, sourceRev: 1, unknownNumbers: unknown, outlineOnly: state === "outline" },
    ...over,
  };
}

const ALL_DRAFTED = [card("1-가", "draft"), card("1-나", "draft")];

function input(cards: SubmitCard[], over: Partial<HubStepsInput> = {}): HubStepsInput {
  return { status: "drafting", returned: false, readiness: submitReadiness(cards), kpiTotal: 2, kpiMissing: 0, materials: 0, preview: false, ...over };
}

const view = (h: ReturnType<typeof hubSteps>) => h.steps.map((s) => `${s.tone}:${s.state}${s.now ? "*" : ""}`);

test("계량 실적 미입력: 1단계가 지금(doing — 경고색 아님) · 주 행동 「계량 실적 넣기」, 2·3단계는 남은 대로", () => {
  const h = hubSteps(input(ALL_DRAFTED, { kpiMissing: 2 }));
  assert.deepEqual(view(h), ["doing:계량 실적 2건 입력 필요*", "done:2개 모두 있음", "idle:확정할 수 있음"]);
  assert.deepEqual(h.action, { step: "evidence", label: "계량 실적 넣기" });
  assert.ok(h.steps.every((s) => s.tone !== "alert"));
});

test("근거 끝: 계량 실적 모두 입력이면 추가자료 수와 done, 계량 지표가 없으면 추가자료 수만 done", () => {
  assert.equal(hubSteps(input(ALL_DRAFTED, { materials: 3 })).steps[0].state, "계량 실적 모두 입력 · 추가자료 3건");
  const none = hubSteps(input(ALL_DRAFTED, { kpiTotal: 0, materials: 1 }));
  assert.equal(none.steps[0].state, "추가자료 1건");
  assert.equal(none.steps[0].tone, "done");
});

test("초안 없는 과제(구성안만 포함): 2단계가 지금 · 주 행동은 첫 과제 「초안 쓰기」(uid로 과제별 초안)", () => {
  const h = hubSteps(input([card("1-가", "draft"), card("1-나", "outline"), card("1-다", "none")]));
  assert.deepEqual(view(h), ["done:계량 실적 모두 입력 · 추가자료 0건", "doing:초안 없는 과제 2건*", "idle:초안이 모두 있어야 확정"]);
  assert.deepEqual(h.action, { step: "draft", label: "1-나 초안 쓰기", uid: "u-1-나", taskNo: "1-나" });
});

test("모두 있음 + 확인할 것: 2단계 글에 가짓수, 3단계가 지금 · 「확정하러 가기」", () => {
  const cards = [card("1-가", "draft", {}, ["12"]), card("1-나", "draft")];
  const h = hubSteps(input(cards));
  assert.equal(submitReadiness(cards).checks.length, 1);
  assert.deepEqual(view(h), ["done:계량 실적 모두 입력 · 추가자료 0건", "done:2개 모두 있음 · 확인할 것 1가지", "doing:확정할 수 있음*"]);
  assert.deepEqual(h.action, { step: "submit", label: "확정하러 가기" });
});

test("목차에서 뺀 과제는 셈에서 빠짐(submitReadiness 그대로) — 빠진 과제에 초안이 없어도 확정할 수 있음", () => {
  const h = hubSteps(input([card("1-가", "draft"), card("1-나", "none", { included: false })]));
  assert.equal(h.steps[1].state, "1개 모두 있음");
  assert.equal(h.steps[2].state, "확정할 수 있음");
  assert.equal(h.action?.step, "submit");
});

test("목차에 든 과제가 없으면 2·3단계는 시작 전이고 주 행동 없음", () => {
  const h = hubSteps(input([card("1-가", "none", { included: false })]));
  assert.deepEqual(view(h).slice(1), ["idle:목차에 든 과제 없음", "idle:확정할 과제 없음"]);
  assert.equal(h.action, null);
});

test("남은 제출 행(2026-10-27 전): handoff · 지금 단계·주 행동 없음(계량 미입력이 남아도)", () => {
  const h = hubSteps(input(ALL_DRAFTED, { status: "submitted", kpiMissing: 1 }));
  assert.deepEqual(view(h), ["idle:계량 실적 1건 입력 필요", "done:2개 모두 있음", "handoff:제출함 · 성과관리팀 검토 중"]);
  assert.equal(h.action, null);
});

test("확정(승인): 3단계 done 「확정함 · 승인 상태」 · 주 행동 없음 — 승인이면 돌려받음 표시는 무시", () => {
  const h = hubSteps(input(ALL_DRAFTED, { status: "approved", returned: true }));
  assert.deepEqual(h.steps[2], { key: "submit", label: "확정", tone: "done", state: "확정함 · 승인 상태", now: false });
  assert.equal(h.action, null);
});

test("돌려받음(승인 풀기·예전 돌려보내기): 3단계 doing 「돌려받음 · 보완 뒤 다시 확정」, 다 갖췄으면 지금 단계 · 「확정하러 가기」", () => {
  const h = hubSteps(input(ALL_DRAFTED, { returned: true }));
  assert.deepEqual(h.steps[2], { key: "submit", label: "확정", tone: "doing", state: "돌려받음 · 보완 뒤 다시 확정", now: true });
  assert.equal(h.action?.label, "확정하러 가기");
  // 앞 단계가 남았으면 지금은 그 단계(돌려받음은 우리 차례라 톤은 doing 그대로)
  const h2 = hubSteps(input([card("1-가", "none")], { returned: true }));
  assert.equal(h2.action?.step, "draft");
  assert.equal(h2.steps[2].tone, "doing");
});

test("자료 준비 보고서: 초안이 모두 있어도 확정 전이가 없어 3단계는 지금이 아님", () => {
  const h = hubSteps(input(ALL_DRAFTED, { status: "preparing" }));
  assert.deepEqual(h.steps[2], { key: "submit", label: "확정", tone: "idle", state: "초안을 저장하면 확정할 수 있음", now: false });
  assert.equal(h.action, null);
});

test("보고서 준비 전: 1·3단계는 준비 뒤, 초안 없는 과제가 있으면 2단계가 지금", () => {
  const h = hubSteps(input([card("2-가", "none"), card("2-나", "draft")], { status: null, kpiTotal: 0, kpiMissing: 0 }));
  assert.deepEqual(view(h), ["idle:보고서 준비 뒤 입력", "doing:초안 없는 과제 1건*", "idle:보고서 준비 뒤 확정"]);
  assert.deepEqual(h.action, { step: "draft", label: "2-가 초안 쓰기", uid: "u-2-가", taskNo: "2-가" });
  // 초안이 모두 있으면 할 수 있는 단계가 없음
  assert.equal(hubSteps(input(ALL_DRAFTED, { status: null })).action, null);
});

test("부서 화면 보기: 주 행동 이름이 「보기」", () => {
  assert.equal(hubSteps(input(ALL_DRAFTED, { kpiMissing: 1, preview: true })).action?.label, "계량 실적 보기");
  assert.equal(hubSteps(input([card("1-가", "none")], { preview: true })).action?.label, "1-가 초안 보기");
  assert.equal(hubSteps(input(ALL_DRAFTED, { preview: true })).action?.label, "확정 절 보기");
});
