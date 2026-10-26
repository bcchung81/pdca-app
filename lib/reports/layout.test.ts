// 경평 초안 블록 배치(2026-10-12 ④ 배치 골격 다양화 — lib/reports/layout.ts) 시험: 묶음·정리, 렌더(section-html)·판면 어림(fit)·
// 구성안(composition·mg-outline)·집필 입히기(applyPlanLayout·verifySection·verifyMgDraft)·직접 고치기 경로·구성안 판면·측정(eval-stats).
import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { reportDraftPrompts, reportDraftPromptsMg, reportOutlinePrompts, reportOutlinePromptsMg } from "../prompts/sets.ts";
import type { Block, BlockOutput } from "./blocks.ts";
import { mgSpecHeight } from "./business-layout.ts";
import { compositionSheetHtml, mgSheetHtml } from "./composition-sheet.ts";
import { type Composition, CompositionOut, type PlanBlock, applyCompositionEdit, applyPlanLayout, blockBudgets, blockPerLine, cleanComposition, editOf, planLayoutText, planPrompt } from "./composition.ts";
import { applyDraftText } from "./draft-text.ts";
import { layoutStats } from "./eval-stats.ts";
import { PAGE_MM, blockHeightWithFigures, blockRooms, blockWidth, canonicalBlock, fitReport, stageHeadMm } from "./fit.ts";
import { FULL_KINDS, PAIR_GAP_MM, cleanLayout, cleanSpan, dropLoneSpans, layoutGroups, layoutName, usesOtherLayout } from "./layout.ts";
import { applyMgCompositionEdit } from "./mg-outline.ts";
import { type MgDraftContext, mgPlanPrompt, verifyMgDraft } from "./mg-draft.ts";
import { sectionHtml } from "./section-html.ts";
import { type ReportSectionSpec, type SectionOutput, sectionContext, verifySection } from "./section.ts";
import { NO_SEED_CARDS } from "../testing/originals.ts";

const cell = (head: string, bullets: string[] = [], tag = "", note = "") => ({ head, tag, bullets, note });
const B = (kind: Block["kind"], label: string, over: Partial<Block> = {}): Block => ({ kind, label, title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...over });
const bullets = (label: string, over: Partial<Block> = {}) => B("bullets", label, { items: ["현장 점검 결과를 바탕으로 측정 기준을 정비"], ...over });
const cards = (label: string, over: Partial<Block> = {}) => B("cards", label, { variant: "plain", cells: [cell("기준 정비", ["측정 기준 정비"]), cell("현장 적용", ["전국 확산"])], ...over });
const steps = (label: string, over: Partial<Block> = {}) => B("steps", label, { variant: "row", cells: [cell("진단", ["현장 진단"]), cell("분석", ["원인 분석"]), cell("해결", ["맞춤 해결"])], ...over });
const chart = (label: string) => B("chart", label, { title: "판독 건수", series: [{ label: "’24년", value: "10건" }, { label: "’25년", value: "20건" }] });
const spec = (blocks: Block[], over: Partial<ReportSectionSpec> = {}): ReportSectionSpec => ({ version: 3, card: { id: "주요사업1/1-가", taskNo: "1-가", title: "과제" }, business: { no: 1, name: "전파품질 향상" }, task: { no: "1-1", title: "실행과제", bp: false }, sub: { mark: "가", title: "소항목", markers: [] }, rows: [], blocks, results: ["성과 한 줄"], caption: "", module: 1, ...over });

/** 예전(배치 전) 렌더러·판면 어림의 묶음 규칙 그대로 — 배치 필드가 없는 목록은 새 묶음과 같아야 함 */
function oldRows(blocks: Block[]): Array<{ label: string; idx: number[] }> {
  const FULL = new Set(["band", "banner", "quotes", "subhead", "case"]);
  const out: Array<{ label: string; idx: number[] }> = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (!b.label || FULL.has(b.kind)) {
      out.push({ label: "", idx: [i++] });
      continue;
    }
    const idx: number[] = [];
    while (i < blocks.length && blocks[i].label === b.label && !FULL.has(blocks[i].kind)) idx.push(i++);
    out.push({ label: b.label, idx });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 묶음·정리

test("layoutGroups: 배치 필드가 없으면 예전 묶음(같은 라벨 연속 = 한 행, 라벨 없음·전폭 종류 = 블록마다 전폭)과 같음", () => {
  const lists: Block[][] = [
    [bullets("추진배경"), cards("추진내용"), chart("추진내용"), B("banner", "", { text: "메시지" }), steps("추진노력"), B("quotes", "현장", { cells: [cell("요지", ["원문"])] }), bullets("")],
    [bullets(""), bullets("가"), bullets("가"), bullets("나"), B("case", "우수사례", { title: "t", items: ["a"] }), bullets("나")],
  ];
  for (const bs of lists) {
    const now = layoutGroups(bs).map((g) => ({ label: g.label, idx: g.units.flat() }));
    assert.deepEqual(now, oldRows(bs));
    assert.ok(layoutGroups(bs).every((g) => g.units.every((u) => u.length === 1)), "짝 없음");
  }
});

test("layoutGroups: 가로 반씩은 다음 블록도 half이고 같은 그릇·라벨·절일 때만 짝, 단 띠는 같은 라벨·같은 절이 이어지면 한 띠", () => {
  const half = { span: "half" as const };
  // 사다리 행 안 짝 + 이어지는 같은 라벨 블록은 같은 행
  const g1 = layoutGroups([cards("추진내용", half), steps("추진내용", half), bullets("추진내용")]);
  assert.deepEqual(g1, [{ type: "row", label: "추진내용", units: [[0, 1], [2]] }]);
  // 라벨이 다르면 짝 아님(각자 행)
  assert.deepEqual(layoutGroups([cards("가", half), steps("나", half)]).map((g) => g.units), [[[0]], [[1]]]);
  // 전폭 짝은 라벨 무관
  assert.deepEqual(layoutGroups([cards("", half), B("stats", "", { cells: [cell("97%", ["뜻"]), cell("3만국", ["뜻"])], ...half })]), [{ type: "full", label: "", units: [[0, 1]] }]);
  // 짝 없는 half는 혼자(그릇 폭 전부)
  assert.deepEqual(layoutGroups([cards("가", half), bullets("가")]).map((g) => g.units), [[[0], [1]]]);
  // 단 띠: 같은 라벨 연속 = 한 띠(안에 짝도), 라벨이 바뀌면 새 띠
  const st = { layout: "stage" as const };
  const g2 = layoutGroups([bullets("도입", st), cards("전개", { ...st, ...half }), steps("전개", { ...st, ...half }), bullets("전개", st), bullets("마무리", st)]);
  assert.deepEqual(g2, [
    { type: "stage", label: "도입", units: [[0]] },
    { type: "stage", label: "전개", units: [[1, 2], [3]] },
    { type: "stage", label: "마무리", units: [[4]] },
  ]);
  // 경영관리 절 열쇠: 짝·단 띠는 절을 넘지 않음
  const at = ["1.1.가", "1.1.나", "1.1.나"];
  assert.deepEqual(layoutGroups([cards("가", half), steps("가", half), bullets("가")], at).map((g) => g.units), [[[0], [1], [2]]], "사다리 행 묶음은 예전 어림 그대로(절을 넘어도 한 행) — 짝만 안 됨");
  assert.deepEqual(layoutGroups([bullets("전개", st), bullets("전개", st)], ["a", "b"]).map((g) => g.units), [[[0]], [[1]]]);
  // 라벨 없는 단 띠는 전폭, 배치 전폭은 라벨이 있어도 전폭
  assert.equal(layoutGroups([bullets("", st)])[0].type, "full");
  assert.equal(layoutGroups([cards("추진내용", { layout: "full" })])[0].type, "full");
});

test("정리: 목록 밖·이 종류에 뜻 없는 배치는 지우고, 짝 없는 half는 dropLoneSpans가 지움", () => {
  assert.equal(cleanLayout("cards", "stage"), "stage");
  assert.equal(cleanLayout("cards", "full"), "full");
  assert.equal(cleanLayout("quotes", "full"), undefined, "전폭 종류의 full은 기본과 같음");
  assert.equal(cleanLayout("cards", "ladder"), undefined);
  assert.equal(cleanLayout("cards", "wide"), undefined);
  assert.equal(cleanSpan("cards", "half"), "half");
  for (const k of ["chart", "banner", "band", "subhead"]) assert.equal(cleanSpan(k, "half"), undefined, k);
  assert.ok(FULL_KINDS.has("case") && !FULL_KINDS.has("cards"));
  const bs = [cards("가", { span: "half" }), steps("가", { span: "half" }), bullets("나", { span: "half" })];
  assert.equal(dropLoneSpans(bs), 1);
  assert.deepEqual(bs.map((b) => b.span), ["half", "half", undefined]);
  assert.equal(layoutName({ layout: "stage", span: "half" }), "단 띠 · 가로 반씩");
  assert.equal(layoutName({}), "라벨 사다리");
  assert.equal(usesOtherLayout([cards("가"), bullets("")]), false, "라벨 없는 전폭은 예전에도 있던 배치");
  assert.equal(usesOtherLayout([cards("가", { layout: "full" })]), true);
});

// ---------------------------------------------------------------------------
// 렌더

test("렌더: 배치 필드가 없으면 출력에 새 클래스가 없고, 같은 블록에 빈 배치(undefined)를 줘도 바이트까지 같음", () => {
  const bs = [bullets("추진배경"), cards("추진내용"), chart("추진내용"), B("banner", "", { text: "메시지" }), steps("추진노력")];
  const a = sectionHtml(spec(bs), [], { editMarks: true, blockMarks: true });
  assert.doesNotMatch(a, /k-pair|k-stage/);
  const b = sectionHtml(spec(bs.map((x) => ({ ...x, layout: undefined, span: undefined }))), [], { editMarks: true, blockMarks: true });
  assert.equal(a, b);
});

test("렌더 가로 반씩: 두 블록이 .k-pair 두 칸에 나란히(사다리 행 칸 안 · 전폭), 각 칸은 블록 하나 — 고치기 경로(data-t)·data-block은 블록 순번 그대로", () => {
  const half = { span: "half" as const };
  const html = sectionHtml(spec([bullets("추진배경"), cards("추진내용", half), steps("추진내용", half)]), [], { editMarks: true, blockMarks: true });
  assert.match(html, /<tr><th scope="row">추진내용<\/th><td><div class="k-pair"><div class="k-pair__c"><div data-block="1" class="k-cards"/);
  assert.match(html, /<\/div><div class="k-pair__c"><p data-block="2" class="k-dg-title"|<\/div><div class="k-pair__c"><ol data-block="2" class="k-proc"/);
  assert.match(html, /data-t="blocks\.1\.cells\.0\.head"/);
  assert.match(html, /data-t="blocks\.2\.cells\.2\.bullets\.0"/);
  // 전폭 짝(라벨 없음)
  const full = sectionHtml(spec([cards("", half), steps("", half)]));
  assert.match(full, /<\/h5>\n<div class="k-pair"><div class="k-pair__c"><div class="k-cards"/);
  // 짝 없는 half는 예전처럼 혼자(표 열 폭도 그릇 폭으로 셈 — 짝이 있다고 보고 반 폭으로 세지 않음)
  const table = B("table", "추진내용", { items: ["구분", "’25년", "’26년"], cells: [cell("건수", ["1건", "2건"]), cell("비율", ["1%", "2%"])], span: "half" });
  assert.equal(sectionHtml(spec([table])), sectionHtml(spec([{ ...table, span: undefined }])));
});

test("렌더 단 띠·전폭: 단 띠는 .k-stage 머리 하나 + 그 아래 전폭 블록(사다리 표 없음), 배치 전폭은 라벨 칸 없음 — 고치기 경로는 그대로", () => {
  const st = { layout: "stage" as const };
  const html = sectionHtml(spec([bullets("Step 1 도입", st), cards("전개", st), steps("전개", st), bullets("추진성과")]), [], { editMarks: true, marks: true });
  assert.equal(html.match(/class="k-stage"/g)?.length, 2, "띠 머리는 라벨이 바뀔 때만");
  assert.match(html, /<p class="k-stage" data-fit-row="0"><span class="k-stage__l"><span class="k-tag">Step 1<\/span>도입<\/span><\/p>/);
  assert.match(html, /<p class="k-stage" data-fit-row="1"><span class="k-stage__l">전개<\/span><\/p>\n<div class="k-cards"/);
  assert.match(html, /<table class="k-ladder">[\s\S]*<tr data-fit-row="2"><th scope="row">추진성과<\/th>/, "단 띠 뒤 사다리 행은 표로(행 번호는 판면 어림과 같음)");
  assert.equal((html.match(/<table class="k-ladder">/g) ?? []).length, 1);
  assert.match(html, /data-t="blocks\.2\.cells\.0\.head"/);
  const full = sectionHtml(spec([cards("추진내용", { layout: "full" })]));
  assert.doesNotMatch(full, /k-ladder|추진내용<\/th>/);
  // 경영관리 절: 절마다 따로 그리므로 짝은 절 안에서만
  const mg = { indicator: "지표", parts: [{ key: "1.1.가", evalNo: 1, evalTitle: "평가", themeNo: 1, themeTitle: "대주제", mark: "가", title: "절", story: "" as const, why: "" }, { key: "1.1.나", evalNo: 1, evalTitle: "평가", themeNo: 1, themeTitle: "대주제", mark: "나", title: "절2", story: "" as const, why: "" }], at: ["1.1.가", "1.1.나"] };
  const mgHtml = sectionHtml(spec([cards("추진내용", { span: "half" }), steps("추진내용", { span: "half" })], { mg }));
  assert.doesNotMatch(mgHtml, /k-pair/, "절을 넘는 짝은 없음");
});

// ---------------------------------------------------------------------------
// 판면 어림

test("폭: 가로 반씩은 그릇 폭에서 사이 4mm를 뺀 절반(사다리 안 약 73mm·전폭 안 83mm), 배치 전폭·단 띠는 170mm, 짝 없는 half는 그릇 폭", () => {
  const ladder = blockWidth(cards("가"));
  assert.ok(Math.abs(ladder - 150.4) < 0.1);
  assert.equal(blockWidth(cards("가", { span: "half" })), (ladder - PAIR_GAP_MM) / 2);
  assert.equal(blockWidth(cards("", { span: "half" })), (PAGE_MM.width - PAIR_GAP_MM) / 2);
  assert.equal(blockWidth(cards("가", { layout: "full" })), PAGE_MM.width);
  assert.equal(blockWidth(cards("가", { layout: "stage" })), PAGE_MM.width);
  assert.deepEqual(blockRooms([cards("가", { span: "half" }), bullets("가")]), [ladder, ladder], "짝 없는 half는 그릇 폭");
  assert.deepEqual(blockRooms([cards("가", { span: "half" }), steps("가", { span: "half" })]), [(ladder - 4) / 2, (ladder - 4) / 2]);
});

test("판면 어림: 짝은 반 폭으로 두 블록을 각각 어림한 큰 쪽, 단 띠는 띠 머리 + 전폭 블록마다 끝 여백 — 렌더와 같은 행 수", () => {
  const half = { span: "half" as const };
  const a = cards("", half);
  const b = steps("", half);
  const w = (PAGE_MM.width - PAIR_GAP_MM) / 2;
  const r = fitReport(spec([a, b]));
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].mm, Math.round((Math.max(blockHeightWithFigures(a, w), blockHeightWithFigures(b, w)) + 1.3) * 10) / 10);
  assert.equal(r.rows[0].kinds, "cards|steps");
  // 사다리 행 안 짝: 행 = max(라벨 높이, 짝 높이) + 행 여백
  const lw = (blockWidth(cards("가")) - PAIR_GAP_MM) / 2;
  const rr = fitReport(spec([cards("가", half), steps("가", half)]));
  assert.ok(Math.abs(rr.rows[0].mm - (Math.max(blockHeightWithFigures(cards("가", half), lw), blockHeightWithFigures(steps("가", half), lw)) + (6 * 25.4) / 96 + 0.3)) < 0.06);
  // 단 띠
  const st = { layout: "stage" as const };
  const s1 = fitReport(spec([cards("전개", st), steps("전개", st)]));
  assert.equal(s1.rows.length, 1);
  const expect = stageHeadMm("전개") + blockHeightWithFigures(cards("전개", st), PAGE_MM.width) + 1.3 + blockHeightWithFigures(steps("전개", st), PAGE_MM.width) + 1.3;
  assert.ok(Math.abs(s1.rows[0].mm - expect) < 0.06);
  assert.ok(stageHeadMm("전개") > 6 && stageHeadMm("전개") < 6.5, "한 줄 띠 머리 약 6.3mm(.k-stage 상자 + 아래 여백 — 위 여백은 앞 행 끝 여백과 겹쳐 안 셈)");
  // 짝이 하나로 줄면 판면이 줄어듦(두 블록을 세로로 쌓은 것보다 낮음)
  assert.ok(fitReport(spec([cards(""), steps("")])).total > r.total + 10);
  // 경영관리: 절이 다르면 짝 아님(렌더러와 같게)
  const at = { indicator: "", parts: [], at: ["a", "b"] };
  assert.equal(fitReport({ ...spec([a, b]), mg: at }).rows.length, 2);
});

// ---------------------------------------------------------------------------
// 구성안

const plan = (blocks: PlanBlock[], over: Partial<Composition> = {}): Composition => ({ version: 1, message: "메시지", points: ["논점"], story: "단계 전개형", storyWhy: "", alternative: "", blocks, results: "성과", resultShape: "bullets", materials: [{ id: "m1", kind: "fact", text: "측정 기준 정비", when: "", source: "카드", quote: "측정 기준 정비", found: true }], memo: "", ...over });
const pb = (kind: PlanBlock["kind"], label: string, over: Partial<PlanBlock> = {}): PlanBlock => ({ kind, variant: kind === "cards" ? "plain" : kind === "steps" ? "row" : "", label, purpose: "목적", cells: kind === "bullets" ? 2 : 3, materials: ["m1"], figures: [], ...over });

test("구성안 AI 답: layout ladder·빈 span은 저장하지 않고, full·stage·half는 남김, 짝 없는 half는 지움(스키마는 두 필드를 선택으로 받음)", () => {
  const raw = (kind: string, label: string, layout?: string, span?: string) => ({ kind, variant: "", label, purpose: "p", cells: 3, materials: ["m1"], figures: [], alts: [], ...(layout ? { layout } : {}), ...(span !== undefined ? { span } : {}) });
  const out = CompositionOut.parse({ message: "m", points: [], story: "단계 전개형", storyWhy: "", alternative: "", materials: [{ id: "m1", kind: "fact", text: "측정 기준 정비", when: "", source: "", quote: "측정 기준 정비" }], blocks: [raw("bullets", "도입", "stage", ""), raw("cards", "전개", "stage", "half"), raw("steps", "전개", "stage", "half"), raw("stats", "추진성과", "ladder", "half"), raw("table", "x")], results: "", resultShape: "bullets" });
  const c = cleanComposition(out, "측정 기준 정비", new Set()).composition;
  assert.deepEqual(
    c.blocks.map((b) => [b.layout, b.span]),
    [
      ["stage", undefined],
      ["stage", "half"],
      ["stage", "half"],
      [undefined, undefined],
      [undefined, undefined],
    ],
  );
  assert.ok(!("layout" in c.blocks[3]) && !("span" in c.blocks[3]), "기본 배치는 필드 자체가 없음(옛 구성안과 같은 JSON)");
  assert.throws(() => CompositionOut.parse({ ...out, blocks: [{ ...raw("cards", "a"), layout: "wide" }] }));
});

test("구성안 편집: 배치·폭을 고르고 저장(editOf → applyCompositionEdit), 바꾸면 사람이 고친 블록, 짝이 없어진 half는 지움", () => {
  const c = plan([pb("bullets", "추진배경"), pb("cards", "추진내용"), pb("steps", "추진내용")]);
  const e = editOf(c);
  assert.ok(e.blocks.every((b) => !("layout" in b) && !("span" in b)));
  const next = applyCompositionEdit(c, { ...e, blocks: e.blocks.map((b, i) => (i ? { ...b, span: "half" } : { ...b, layout: "stage" })) }).composition;
  assert.deepEqual(next.blocks.map((b) => [b.layout, b.span, b.by]), [["stage", undefined, "human"], [undefined, "half", "human"], [undefined, "half", "human"]]);
  assert.deepEqual(editOf(next).blocks.map((b) => [b.layout, b.span]), [["stage", undefined], [undefined, "half"], [undefined, "half"]]);
  // 짝 하나를 빼면 남은 half는 지움, 목록 밖 값은 지움
  const lone = applyCompositionEdit(next, { ...editOf(next), blocks: editOf(next).blocks.slice(0, 2).map((b, i) => (i === 0 ? { ...b, layout: "wide" } : b)) }).composition;
  assert.deepEqual(lone.blocks.map((b) => [b.layout, b.span]), [[undefined, undefined], [undefined, undefined]]);
  // 경영관리: 절 순서로 다시 세운 뒤 절을 넘는 짝은 지움
  const mgc = plan([pb("cards", "가", { at: "1.1.가", span: "half" }), pb("steps", "가", { at: "1.1.나", span: "half" })], { story: "", mg: { indicator: "지표", parts: [{ key: "1.1.가", evalNo: 1, evalTitle: "", themeNo: 1, themeTitle: "", mark: "가", title: "", story: "", why: "" }, { key: "1.1.나", evalNo: 1, evalTitle: "", themeNo: 1, themeTitle: "", mark: "나", title: "", story: "", why: "" }] } });
  const mgNext = applyMgCompositionEdit(mgc, editOf(mgc)).composition;
  assert.deepEqual(mgNext.blocks.map((b) => b.span), [undefined, undefined]);
});

test("구성안 판면 어림·예산·글 한도: 짝은 한 줄을 함께 써 예산이 같고, 반 폭이라 한 줄 글자 수가 줄어듦, 단 띠는 띠 머리를 첫 블록에만", () => {
  const c = plan([pb("bullets", "추진배경"), pb("cards", "추진내용", { span: "half" }), pb("steps", "추진내용", { span: "half" }), pb("bullets", "추진성과")]);
  const budgets = blockBudgets(c, 1);
  assert.equal(budgets[1], budgets[2]);
  const flat = plan(c.blocks.map((b) => ({ ...b, span: undefined })));
  assert.ok(blockPerLine(c.blocks[1])!.perLine < blockPerLine(flat.blocks[1])!.perLine);
  // 단 띠: 같은 띠 둘째 블록 예산에는 띠 머리가 없음(같은 블록이면 첫째보다 작음)
  const st = plan([pb("cards", "전개", { layout: "stage" }), pb("cards", "전개", { layout: "stage" })]);
  const sb = blockBudgets(st, 1);
  assert.ok(sb[0] > sb[1]);
  // 기본 배치 구성안은 예전 셈(블록 하나의 행) 그대로 — 배치를 빼도 같은 값
  assert.deepEqual(blockBudgets(flat, 1), blockBudgets(plan(flat.blocks.map((b) => ({ ...b }))), 1));
});

test("집필 요청 글: 기본 배치면 블록 줄이 예전 그대로, 전폭·단 띠·가로 반씩은 줄에 배치 꼬리", () => {
  assert.equal(planLayoutText(pb("cards", "추진내용")), "");
  assert.equal(planLayoutText(pb("cards", "")), "");
  assert.equal(planLayoutText(pb("cards", "추진내용", { layout: "full" })), " · 배치 전폭(라벨 칸 없음)");
  assert.equal(planLayoutText(pb("cards", "전개", { layout: "stage", span: "half" })), " · 배치 단 띠(라벨 「전개」이 위 띠 제목) · 다음 블록과 가로 반씩(칸 폭 절반)");
  const p = reportDraftPrompts().prompts;
  const text = planPrompt(p, plan([pb("cards", "추진내용", { span: "half" }), pb("steps", "추진내용", { span: "half" })]), 1);
  assert.match(text, /1\. \[추진내용\] cards:plain · 다음 블록과 가로 반씩\(칸 폭 절반\) — 목적/);
  assert.doesNotMatch(planPrompt(p, plan([pb("cards", "추진내용")]), 1), /배치|가로 반씩/);
});

test("배치 고르기 프롬프트: 두 트랙 구성안 시스템만 끼우고(집필·블록 고치기는 안 끼움), 구성안 스키마 설명에 layout·span", () => {
  const sys = (s: { system: Record<string, string> }) => s.system.system;
  assert.match(sys(reportOutlinePrompts().prompts), /## 배치 고르기/);
  assert.match(sys(reportOutlinePromptsMg().prompts), /## 배치 고르기/);
  assert.doesNotMatch(sys(reportDraftPrompts().prompts), /## 배치 고르기/);
  assert.doesNotMatch(sys(reportDraftPromptsMg().prompts), /## 배치 고르기/);
  for (const s of [reportOutlinePrompts().prompts, reportOutlinePromptsMg().prompts]) {
    assert.match(s.schema["block.layout"], /ladder.*full.*stage/);
    assert.match(s.schema["block.span"], /half/);
  }
});

// ---------------------------------------------------------------------------
// 집필에 입히기

test("applyPlanLayout: 구성안 블록과 짝지은 초안 블록에 배치를 옮기고(AI가 낸 배치는 없음), 짝 없는 half는 지움", () => {
  const c = plan([pb("bullets", "추진배경", { layout: "stage" }), pb("cards", "추진내용", { span: "half" }), pb("steps", "추진내용", { span: "half" })]);
  const blocks = [bullets("추진배경"), cards("추진내용"), steps("추진내용"), bullets("더")];
  applyPlanLayout(c, blocks);
  assert.deepEqual(blocks.map((b) => [b.layout, b.span]), [["stage", undefined], [undefined, "half"], [undefined, "half"], [undefined, undefined]]);
  const short = [bullets("추진배경"), cards("추진내용")];
  applyPlanLayout(c, short);
  assert.deepEqual(short.map((b) => b.span), [undefined, undefined], "짝 블록이 초안에 없으면 남은 half는 지움");
});

test("verifySection(placeBlocks): 배치를 판면 어림 전에 입혀 spec.fit이 배치대로", { skip: NO_SEED_CARDS }, async () => {
  const { readFileSync } = await import("node:fs");
  const { join, resolve } = await import("node:path");
  const seed = JSON.parse(readFileSync(join(resolve(import.meta.dirname, "../.."), "seed/cards/260916/biz-260916.json"), "utf8")) as { cards: any[] };
  const card = seed.cards.find((x) => x.id === "주요사업1/1-가")!;
  const ctx = sectionContext(card, seed.cards.filter((x) => x.group === "주요사업1"));
  const ob = (b: Block): BlockOutput => ({ ...b, evidence: "", figures: [] }) as BlockOutput;
  const out: SectionOutput = { title: "소항목", story: "단계 전개형", blocks: [ob(cards("")), ob(steps(""))], results: ["성과"], resultCards: [], resultChart: { title: "", series: [], badge: "" }, resultBand: "", caption: "" } as unknown as SectionOutput;
  const c = plan([pb("cards", "", { span: "half" }), pb("steps", "", { span: "half" })]);
  const plain = verifySection(out, card, ctx);
  const placed = verifySection(out, card, ctx, "", [], "", undefined, [], (bs) => applyPlanLayout(c, bs));
  assert.deepEqual(placed.spec.blocks?.map((b) => b.span), ["half", "half"]);
  assert.ok(placed.spec.fit!.total < plain.spec.fit!.total, "나란히 놓아 판면이 줄어듦");
});

test("verifyMgDraft·mgPlanPrompt: 경영관리 절마다 구성안 배치를 입히고 요청 글 블록 줄에 배치 꼬리", () => {
  const card = { id: "경영관리9/9-3", group: "경영관리9", taskNo: "9-3", title: "과제", do: { lines: ["∙ 직무교육 체계 개편"], monthly: [] }, kpi: { rows: [] } };
  const ctx: MgDraftContext = { unit: "MG-9", indicator: "지표", taskNo: "9-3", markers: [], prior: [], evals: [1] };
  const parts = [{ key: "1.1.가", evalNo: 1, evalTitle: "평가", themeNo: 1, themeTitle: "대주제", mark: "가", title: "절", story: "" as const, why: "" }];
  const c = plan([pb("cards", "추진내용", { at: "1.1.가", layout: "stage" }), pb("bullets", "추진성과", { at: "1.1.가" })], { story: "", mg: { indicator: "지표", parts } });
  const ob = (b: Block): BlockOutput => ({ ...b, evidence: "", figures: [] }) as BlockOutput;
  const v = verifyMgDraft({ parts: [{ key: "1.1.가", title: "절", blocks: [ob(cards("추진내용")), ob(bullets("추진성과"))] }], caption: "" } as any, card, c, ctx);
  assert.deepEqual(v.spec.blocks?.map((b) => b.layout), ["stage", undefined]);
  assert.match(sectionHtml(v.spec), /class="k-stage"/);
  assert.ok(mgSpecHeight(v.spec) > 0);
  assert.match(mgPlanPrompt(reportDraftPromptsMg().prompts, c, ctx), /1\. \[추진내용\] cards:plain · 배치 단 띠\(라벨 「추진내용」이 위 띠 제목\) — 목적/);
});

test("직접 고치기: 배치가 달라도 글 경로(blocks.N.…)는 그대로 — 짝 안 블록 글을 고치면 그 블록만 바뀌고 배치 필드는 남음", () => {
  const s = spec([cards("가", { span: "half" }), steps("가", { span: "half" })]);
  const r = applyDraftText(s, { path: "blocks.1.cells.0.head", text: "현장 진단 확대" });
  assert.ok(r.ok && r.changed);
  if (r.ok) {
    assert.equal(r.spec.blocks?.[1].cells[0].head, "현장 진단 확대");
    assert.deepEqual(r.spec.blocks?.map((b) => b.span), ["half", "half"]);
    assert.equal(r.blockIndex, 1);
  }
});

// ---------------------------------------------------------------------------
// 구성안 판면(와이어프레임)·측정

test("구성안 판면: 가로 반씩은 한 상자 안 두 칸, 단 띠는 띠 머리 상자 — 블록마다 data-block", () => {
  const html = compositionSheetHtml(plan([pb("bullets", "도입", { layout: "stage" }), pb("cards", "전개", { span: "half" }), pb("steps", "전개", { span: "half" })]), 1);
  assert.match(html, /<div class="cs-stage"><span>도입<\/span><\/div>/);
  assert.match(html, /cs-pairbox[^>]*><div class="cs-label">전개<\/div><div class="cs-pair"><div class="cs-half" data-block="1">[\s\S]*<div class="cs-half" data-block="2">/);
  const mg = plan([pb("cards", "가", { at: "1.1.가", span: "half" }), pb("steps", "가", { at: "1.1.가", span: "half" })], { mg: { indicator: "", parts: [{ key: "1.1.가", evalNo: 1, evalTitle: "", themeNo: 1, themeTitle: "", mark: "가", title: "", story: "", why: "" }] } });
  assert.match(mgSheetHtml(mg), /cs-pair/);
});

test("layoutStats: 배치별 블록 수(짝 안 블록은 가로 반씩)·라벨 사다리 아닌 배치를 쓴 카드 비율", () => {
  const r = layoutStats([
    { id: "a", blocks: [bullets("추진배경"), cards("추진내용", { span: "half" }), steps("추진내용", { span: "half" }), B("banner", "", { text: "m" })] },
    { id: "b", blocks: [bullets("도입", { layout: "stage" }), cards("추진내용", { layout: "full" }), bullets("추진성과")] },
    { id: "c", blocks: [bullets("추진배경"), bullets("")] },
  ]);
  assert.deepEqual(r.blocks, { "라벨 사다리": 3, "단 띠": 1, "전폭(배치)": 1, "전폭(라벨 없음·전폭 종류)": 2, "가로 반씩": 2 });
  assert.equal(r.otherCards, "2/3");
  assert.equal(r.otherShare, 0.667);
  assert.deepEqual(r.cards.map((x) => x.other), [true, true, false]);
});

test("canonicalBlock(place): 배치·폭을 받은 보통 모양은 놓인 폭으로 칸 글을 채움", () => {
  const wide = canonicalBlock("bullets", "", 2, "가");
  const half = canonicalBlock("bullets", "", 2, "가", [], undefined, { span: "half" });
  assert.equal(half.span, "half");
  assert.ok(half.items[0].length < wide.items[0].length);
  assert.equal(canonicalBlock("cards", "plain", 3, "가").layout, undefined);
});
