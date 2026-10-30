// 경영관리 경평 초안 「값 충돌」·「제목 완료형」(lib/reports/mg-consistency.ts)과 그것을 쓰는 구성안 정리·집필 요청·집필 점검·다시 점검·분량 보강 시험(2026-10-30).
// 가짜 카드·가짜 일반어만 씀(실제 카드 문장·수치 없음, AI·DB 호출 없음).

import assert from "node:assert/strict";
import { test } from "node:test";
import { reportBlockPromptsMg, reportDraftPromptsMg } from "../prompts/sets.ts";
import type { Block, BlockOutput } from "./blocks.ts";
import { type Composition, editOf, readComposition } from "./composition.ts";
import { cleanConflicts, conflictHits, conflictLine, conflictWarnings, doneClaims, titleDoneHits, titleDoneWarning } from "./mg-consistency.ts";
import { type MgDraftContext, mgPlanPrompt, recheckMgSection, verifyMgDraft } from "./mg-draft.ts";
import { type FillTarget, acceptFill, fillRequestText, hasFillReason, mgFillReasons, pickFillTargets } from "./mg-fill.ts";
import { type MgOutlineOutput, applyMgCompositionEdit, cleanMgComposition, mgFindingOpenIssue, replaceMgPart } from "./mg-outline.ts";
import type { MgConflict, MgPart } from "./mg-types.ts";
import { figureKeys } from "./repeat-figures.ts";
import { type ReportSectionSpec, evidenceOf } from "./section.ts";
import { warningLevel } from "./warning-levels.ts";

// 가짜 카드(구판 값)와 가짜 첨부(신판 값)
const card = {
  id: "경영관리9/9-3",
  group: "경영관리9",
  taskNo: "9-3",
  title: "가짜 과제",
  overview: { checks: {} },
  feedback: { rows: [] },
  findings: { rows: [] },
  do: { lines: ["∙ 점검 유형 12종 운영", "∙ 안내 채널 5개 운영"], monthly: [] },
  kpi: { rows: [] },
  outcome: { quantitative: ["∙ 점검 유형 12종 운영", "∙ 현장 교육 과정 20개 운영"], qualitative: [] },
};
const ATTACH = "결과 보고: 점검 유형 15종으로 정비, 안내 채널 7개로 확대";
const { hayKey, known } = evidenceOf(card, ATTACH);

const C1: MgConflict = { item: "점검 유형 수", drop: "점검 유형 12종", keep: "점검 유형 15종으로 정비", why: "카드 원장 구판, 첨부 결과 보고가 더 최근" };

// ---------------------------------------------------------------------------
// 정리

test("값 충돌 정리: 두 값의 수치가 근거에 있을 때만 남김 — 근거에 없는 수치(지어낸 충돌)·같은 값·수치 없는 값은 버림, 한 자리 수만 있으면 원문 구절로 확인", () => {
  const raw = [
    C1,
    { item: "점검 유형 수", drop: "점검 유형 40종", keep: "점검 유형 15종으로 정비", why: "" }, // 40은 근거에 없음
    { item: "점검 유형 수", drop: "유형 15종", keep: "점검 유형 15종으로 정비", why: "" }, // 같은 값
    { item: "운영 방식", drop: "대면 운영", keep: "비대면 운영", why: "" }, // 수치 없음
    { item: "안내 채널 수", drop: "안내 채널 5개", keep: "안내 채널 7개로 확대", why: "" }, // 한 자리 수 — 원문 구절에 있음
    { item: "안내 채널 수", drop: "안내 채널 4개", keep: "안내 채널 7개로 확대", why: "" }, // 한 자리 수 — 원문에 없음
    C1, // 같은 충돌 두 번
  ];
  const got = cleanConflicts(raw, hayKey, known);
  assert.deepEqual(got.map((c) => c.drop), ["점검 유형 12종", "안내 채널 5개"]);
  assert.deepEqual(cleanConflicts(undefined, hayKey, known), []);
});

test("값 충돌 줄 판정: 버린 값의 수치가 있고 항목·구절 낱말이 절반 이상 겹치는 줄만 — 같은 수치라도 다른 대상의 줄·쓸 값의 줄은 안 걸림, 라벨이 대상이면 걸림", () => {
  assert.ok(conflictLine("점검 유형 12종을 현장에 적용", C1));
  assert.ok(!conflictLine("현장 교육 12종 과정 운영", C1), "같은 「12종」이라도 다른 대상");
  assert.ok(!conflictLine("점검 유형 15종으로 정비 완료", C1), "쓸 값");
  assert.ok(!conflictLine("12종 운영", C1), "대상 낱말이 없음");
  assert.ok(conflictLine("12종 운영", C1, "점검 유형"), "라벨(행 주제)이 대상");
});

// ---------------------------------------------------------------------------
// 구성안

const part = (key: string, evalNo: number, mark: string, title: string): MgPart => ({ key, evalNo, evalTitle: `평가내용 ${evalNo}`, themeNo: 1, themeTitle: "대주제", mark, title, story: "", why: "" });

const outline = (conflicts?: MgOutlineOutput["conflicts"]): MgOutlineOutput => ({
  message: "핵심",
  points: ["논점"],
  parts: [
    { evalNo: 1, themeNo: 1, themeTitle: "", mark: "가", title: "첫 절", story: "배경·내용·성과형", why: "" },
    { evalNo: 1, themeNo: 1, themeTitle: "", mark: "나", title: "둘째 절", story: "배경·내용·성과형", why: "" },
  ],
  materials: [
    { id: "m1", kind: "fact", text: "평가위원 지적 — 점검 기준이 흩어져 있음", when: "", source: "근거", quote: "" },
    { id: "m2", kind: "fact", text: "점검 유형 개편", when: "", source: "카드", quote: "" },
    { id: "m3", kind: "fact", text: "안내 채널 확대", when: "", source: "카드", quote: "" },
  ],
  blocks: [
    { part: 1, kind: "bullets", variant: "", label: "추진배경", purpose: "왜", cells: 2, materials: ["m1", "m2", "m3"], figures: [], alts: [] },
    { part: 1, kind: "bullets", variant: "", label: "추진성과", purpose: "결과", cells: 2, materials: ["m1", "m3"], figures: [], alts: [] },
    { part: 2, kind: "bullets", variant: "", label: "추진내용", purpose: "무엇", cells: 2, materials: ["m3", "m1"], figures: [], alts: [] },
  ],
  ...(conflicts ? { conflicts } : {}),
});

test("구성안 정리: 근거로 확인된 값 충돌만 mg.conflicts로, 없으면 필드 없음", () => {
  const c = cleanMgComposition(outline([C1, { item: "점검 유형 수", drop: "점검 유형 40종", keep: "점검 유형 15종으로 정비", why: "" }]), hayKey, known, { indicator: "지표", prior: [] }).composition;
  assert.deepEqual(c.mg?.conflicts, [C1]);
  assert.equal("conflicts" in (cleanMgComposition(outline(), hayKey, known, { indicator: "지표", prior: [] }).composition.mg ?? {}), false);
});

test("구성안 정리: 절마다 첫 블록의 재료가 지적 재료로 시작하면 첫 비지적 재료 뒤로 옮김(나머지 순서 유지) — 첫 블록이 아니면 그대로, 지적 여는 블록 경고(재료 기준)도 사라짐", () => {
  const c = cleanMgComposition(outline(), hayKey, known, { indicator: "지표", prior: [] }).composition;
  assert.deepEqual(c.blocks.map((b) => b.materials), [["m2", "m1", "m3"], ["m1", "m3"], ["m3", "m1"]]);
  assert.equal(mgFindingOpenIssue(c), "");
  // 지적 재료만 있는 첫 블록은 그대로
  const only = outline();
  only.blocks[0].materials = ["m1"];
  assert.deepEqual(cleanMgComposition(only, hayKey, known, { indicator: "지표", prior: [] }).composition.blocks[0].materials, ["m1"]);
});

test("구성안 값 충돌 보존: 사람 편집·저장 읽기·절 다시 짜기에서 사라지지 않음(다시 짠 절이 새로 찾은 충돌은 더함)", () => {
  const c = cleanMgComposition(outline([C1]), hayKey, known, { indicator: "지표", prior: [] }).composition;
  assert.deepEqual(applyMgCompositionEdit(c, editOf(c)).composition.mg?.conflicts, [C1]);
  assert.deepEqual(readComposition(JSON.parse(JSON.stringify(c)))?.mg?.conflicts, [C1]);
  const C2: MgConflict = { item: "안내 채널 수", drop: "안내 채널 5개", keep: "안내 채널 7개로 확대", why: "" };
  const next = cleanMgComposition(outline([C1, C2]), hayKey, known, { indicator: "지표", prior: [] }).composition;
  const merged = replaceMgPart(c, next, "1.1.가", "배경·내용·성과형");
  assert.ok(merged.changed);
  assert.deepEqual(merged.composition.mg?.conflicts, [C1, C2]);
  const noNew = replaceMgPart(c, cleanMgComposition(outline(), hayKey, known, { indicator: "지표", prior: [] }).composition, "1.1.가", "배경·내용·성과형");
  assert.deepEqual(noNew.composition.mg?.conflicts, [C1]);
});

// ---------------------------------------------------------------------------
// 집필 요청·집필 점검·다시 점검

const ctx: MgDraftContext = { unit: "MG-9", indicator: "지표", taskNo: "9-3", markers: [], prior: [], evals: [1] };
const P1 = part("1.1.가", 1, "가", "점검 유형 정비");
const plan = (conflicts?: MgConflict[]): Composition => ({
  version: 1,
  message: "메시지",
  points: ["논점"],
  story: "",
  storyWhy: "",
  alternative: "",
  results: "",
  materials: [{ id: "m1", kind: "fact", text: "점검 유형 정비", when: "", source: "첨부", quote: "점검 유형 15종으로 정비", found: true }],
  memo: "",
  blocks: [
    { kind: "bullets", variant: "", label: "추진내용", purpose: "무엇", cells: 2, materials: ["m1"], figures: [], at: P1.key },
    { kind: "bullets", variant: "", label: "추진성과", purpose: "결과", cells: 2, materials: ["m1"], figures: [], at: P1.key },
  ],
  mg: { indicator: "지표", parts: [P1], ...(conflicts ? { conflicts } : {}) },
});
const blk = (b: Partial<BlockOutput>): BlockOutput => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b });
const draftOut = { caption: "", parts: [{ key: P1.key, title: "점검 유형 정비", blocks: [blk({ label: "추진내용", items: ["점검 유형 12종을 현장에 적용", "현장 교육 12종 과정 운영"] }), blk({ label: "추진성과", items: ["점검 유형 15종으로 정비"] })] }] };

test("집필 요청: 값 충돌이 있으면 「쓰지 않을 값 → 쓸 값」 목록, 없으면 예전 글 그대로", () => {
  const p = reportDraftPromptsMg().prompts;
  const withC = mgPlanPrompt(p, plan([C1]), ctx);
  assert.ok(withC.includes("「점검 유형 12종」 → 「점검 유형 15종으로 정비」"));
  assert.ok(withC.includes("값 충돌"));
  assert.ok(!/\{\{/.test(withC));
  const without = mgPlanPrompt(p, plan(), ctx);
  assert.ok(!without.includes("쓰지 않을 값"));
  assert.equal(withC.replace(/\n- 값 충돌[^\n]*\n {2}- [^\n]*/, ""), without, "목록 줄만 더해짐");
});

test("집필 점검: 버린 값이 남은 블록에 막힘 경고 「값 충돌」(다른 대상의 같은 수치는 안 걸림) — 초안 spec.mg.conflicts로 옮겨 다시 점검도 같은 경고, 충돌이 없으면 필드·경고 없음", () => {
  const v = verifyMgDraft(draftOut, card, plan([C1]), ctx, ATTACH, "", 2026, "2026-10-30");
  assert.deepEqual(v.spec.mg?.conflicts, [C1]);
  const w = v.warnings.filter((x) => x.startsWith("값 충돌:"));
  assert.equal(w.length, 1);
  assert.ok(w[0].includes("1번 「추진내용」") && !w[0].includes("2번"), w[0]);
  assert.equal(warningLevel(w[0]), "block");
  assert.deepEqual(conflictHits(v.spec).map((h) => h.line), ["점검 유형 12종을 현장에 적용"]);
  const r = recheckMgSection(v.spec, card, ATTACH, 2026, "2026-10-30");
  assert.deepEqual(r.warnings.filter((x) => x.startsWith("값 충돌:")), w, "다시 점검도 같은 글");
  // 고치면 사라짐
  const fixed: ReportSectionSpec = { ...v.spec, blocks: [{ ...v.spec.blocks![0], items: ["점검 유형 15종을 현장에 적용", "현장 교육 12종 과정 운영"] }, v.spec.blocks![1]] };
  assert.deepEqual(conflictWarnings(fixed), []);
  const none = verifyMgDraft(draftOut, card, plan(), ctx, ATTACH, "", 2026, "2026-10-30");
  assert.equal(none.spec.mg && "conflicts" in none.spec.mg, false);
  assert.ok(!none.warnings.some((x) => x.startsWith("값 충돌:")));
});

// ---------------------------------------------------------------------------
// 제목 완료형

const titleSpec = (title: string, lines: string[]): Pick<ReportSectionSpec, "blocks" | "mg"> => {
  const p = part("1.1.가", 1, "가", title);
  const b: Block = { kind: "bullets", label: "추진내용", title: "", variant: "", text: "", items: lines, cells: [], rows: [], series: [], badge: "" };
  return { blocks: [b], mg: { indicator: "지표", parts: [p], at: [p.key] } };
};

test("제목 완료형: 제목 완료 끝말 마디와 같은 대상의 계획 줄(예정·아직 안 온 달)이 같은 절에 있으면 참고 경고 — 방향 낱말·다른 대상·계획 없는 줄은 안 걸림", () => {
  assert.deepEqual(doneClaims("점검 체계 정착으로 처리 만족도 상승"), ["점검 체계 정착", "처리 만족도 상승"]);
  assert.deepEqual(doneClaims("점검 체계 개편을 통한 처리 기준 강화"), []);
  const hit = titleDoneHits(titleSpec("점검 체계 정착으로 처리 만족도 상승", ["점검 체계 정착 추진(12월 예정)"]), "2026-10-30");
  assert.equal(hit.length, 1);
  assert.equal(hit[0].claim, "점검 체계 정착");
  const month = titleDoneHits(titleSpec("점검 결과 확정", ["점검 결과 확정(’26.12월)"]), "2026-10-30");
  assert.equal(month.length, 1, "작성일 뒤 달");
  assert.equal(titleDoneHits(titleSpec("점검 결과 확정", ["점검 결과 확정(’26.12월)"]), "2027-01-05").length, 0, "이미 지난 달");
  assert.equal(titleDoneHits(titleSpec("점검 체계 개편을 통한 처리 기준 강화", ["점검 체계 개편 추진(12월 예정)"]), "2026-10-30").length, 0, "방향 낱말");
  assert.equal(titleDoneHits(titleSpec("점검 체계 정착으로 처리 만족도 상승", ["하반기 홍보 확대 예정"]), "2026-10-30").length, 0, "다른 대상");
  assert.equal(titleDoneHits(titleSpec("점검 체계 정착으로 처리 만족도 상승", ["점검 체계 정착 완료"]), "2026-10-30").length, 0, "계획 표지 없음");
  const w = titleDoneWarning(titleSpec("점검 체계 정착으로 처리 만족도 상승", ["점검 체계 정착 추진(12월 예정)"]), "2026-10-30")!;
  assert.ok(w.startsWith("제목 완료형: "));
  assert.equal(warningLevel(w), "info");
});

test("제목 완료형: 집필 점검·다시 점검 모두 같은 경고", () => {
  const out = { caption: "", parts: [{ key: P1.key, title: "점검 체계 정착으로 처리 만족도 상승", blocks: [blk({ label: "추진내용", items: ["점검 체계 정착 추진(12월 예정)"] }), blk({ label: "추진성과", items: ["점검 유형 15종으로 정비"] })] }] };
  const v = verifyMgDraft(out, card, plan(), ctx, ATTACH, "", 2026, "2026-10-30");
  const w = v.warnings.filter((x) => x.startsWith("제목 완료형:"));
  assert.equal(w.length, 1);
  assert.deepEqual(recheckMgSection(v.spec, card, ATTACH, 2026, "2026-10-30").warnings.filter((x) => x.startsWith("제목 완료형:")), w);
});

// ---------------------------------------------------------------------------
// 분량 보강

const fillSpec = (): ReportSectionSpec => verifyMgDraft(draftOut, card, plan([C1]), ctx, ATTACH, "", 2026, "2026-10-30").spec;

test("분량 보강 판정·고르기: 버린 값이 남은 블록이 사유(다른 사유가 없어도) — 고칠 대상 맨 앞(why conflict), 보탤 원장 사실에서 버린 값을 쓴 줄은 뺌, 요청 글에 fill.conflict", () => {
  const spec = fillSpec();
  const r = mgFillReasons(spec, card);
  assert.deepEqual(r.conflicts.map((x) => [x.index, x.conflict.drop]), [[0, "점검 유형 12종"]]);
  assert.ok(hasFillReason(r));
  assert.ok(!r.facts.some((f) => f.includes("12종")), "원장의 버린 값 줄은 보탤 사실에서 뺌");
  const ts = pickFillTargets(spec, r);
  assert.equal(ts[0].index, 0);
  assert.equal(ts[0].why, "conflict");
  assert.deepEqual(ts[0].conflicts, [C1]);
  const text = fillRequestText(reportBlockPromptsMg().prompts, ts[0]);
  assert.ok(text.includes("값 충돌 — 이 블록의 「점검 유형 12종」(항목 점검 유형 수 — 쓸 값 「점검 유형 15종으로 정비」"), text);
  assert.ok(!/\{\{/.test(text));
  // 충돌이 없는 초안은 사유 없음(예전 그대로)
  const plain = verifyMgDraft(draftOut, card, plan(), ctx, ATTACH, "", 2026, "2026-10-30").spec;
  assert.deepEqual(mgFillReasons(plain, card).conflicts, []);
});

test("분량 보강 받기: 버린 값을 고치면 fixed, 남기고 늘기만 하면 kept, 하나도 못 고치고 늘지도 않으면 못 받음, 다른 줄에 버린 값을 새로 쓰면 못 받음", () => {
  const spec = fillSpec();
  const b0 = spec.blocks![0];
  const input = { card, known: ATTACH, quoteOnly: "", year: 2026, today: "2026-10-30" };
  const found = () => true;
  const out = (b: Block): BlockOutput => ({ ...b, evidence: "", figures: b.figures ?? [] }) as BlockOutput;
  const fixed = acceptFill(spec, 0, out({ ...b0, items: ["점검 유형 15종을 현장에 적용", b0.items[1]] }), input, found, null, [], [], [C1]);
  assert.ok(fixed.ok && fixed.conflicts && fixed.conflicts.fixed[0] === "점검 유형 12종", JSON.stringify(fixed));
  const kept = acceptFill(spec, 0, out({ ...b0, items: [...b0.items, "현장 교육 과정 20개 운영으로 참여 범위를 넓힘"] }), input, found, null, [], [], [C1]);
  assert.ok(kept.ok && kept.conflicts?.kept[0] === "점검 유형 12종", JSON.stringify(kept));
  const same = acceptFill(spec, 0, out({ ...b0, items: ["점검 유형 12종을 현장 전체에 적용", b0.items[1]] }), input, found, null, [], [], [C1]);
  assert.ok(!same.ok && same.reason.includes("값 충돌"), JSON.stringify(same));
  const b1 = spec.blocks![1];
  const wrote = acceptFill(spec, 1, out({ ...b1, items: [...b1.items, "점검 유형 12종 운영 경험을 반영"] }), input, found, null);
  assert.ok(!wrote.ok && wrote.reason.includes("새로 씀"), JSON.stringify(wrote));
  const t: FillTarget = { index: 0, why: "conflict", boxes: [], share: null, facts: [], refFacts: [], repeats: [], sentences: [], conflicts: [C1] };
  assert.equal(t.conflicts.length, 1);
});

// ---------------------------------------------------------------------------
// 주요사업 불변

test("주요사업 불변: 수치 열쇠 기본은 흔한 값을 빼고(예전 그대로) all일 때만 셈, 경영관리 골격이 없는 초안은 값 충돌·제목 완료형 없음", () => {
  assert.deepEqual([...figureKeys("3명 · 100% · 0건 · 12종").keys()], ["12종"]);
  assert.deepEqual([...figureKeys("3명 · 100% · 0건 · 12종", true).keys()], ["3명", "100%", "0건", "12종"]);
  const biz = { blocks: [{ kind: "bullets", label: "", title: "", variant: "", text: "", items: ["점검 유형 12종을 현장에 적용"], cells: [], rows: [], series: [], badge: "" } as Block] };
  assert.deepEqual(conflictWarnings(biz), []);
  assert.equal(titleDoneWarning(biz), null);
});
