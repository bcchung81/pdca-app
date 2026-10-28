// 경평 초안 블록 「모양 바꾸기」(lib/reports/block-shape.ts · block-edit.ts의 checkBlock·cleanShapeOptions·blockShapesPrompt) 테스트 — 2026-10-12.
// 지키는 것: 트랙 밖 모양(경영관리 표 모양)·근거 없는 이 과제만의 요소로는 못 바꿈, 요청하지 않은 모양 바꾸기(정리가 칸 수로 바꾼 것) 거절,
// 원래 블록의 내용 아닌 필드 보존, 대안 정리(지금 모양·겹친 모양 버림·최대 3·고른 모양 먼저), 높이 차이, 프롬프트 규칙 문구.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { reportBlockPrompts, reportBlockPromptsMg } from "../prompts/sets.ts";
import { type BlockEditRequest, SHAPE_OPTIONS_MAX, blockEditPrompt, blockShapesPrompt, blockShapesSchema, checkBlock, cleanShapeOptions, readBlockShapesRequest, verifyBlockEdit } from "./block-edit.ts";
import { CONTENT_FIELDS, MG_ONLY_SHAPES, draftHeight, shapeAllowed, shapeDelta, shapeMenu, shapeRules, withContent } from "./block-shape.ts";
import type { Block, BlockOutput } from "./blocks.ts";
import { OWN_KINDS } from "./diagram-hints.ts";
import { SHAPES } from "./frameworks.ts";
import type { ReportSectionSpec } from "./section.ts";

const block = (b: Partial<Block> & Pick<Block, "kind">): Block => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...b });
const outBlock = (b: Partial<BlockOutput> & Pick<BlockOutput, "kind">): BlockOutput => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as BlockOutput;
const cell = (head: string, bullets: string[] = []) => ({ head, tag: "", bullets, note: "" });
const line = (s: unknown, max = 400) => String(s ?? "").trim().slice(0, max);
const yes = () => true;

const BIZ = shapeRules(false, null, []);
const MG = shapeRules(true, null, []);

const cards = block({ kind: "cards", label: "추진내용", variant: "plain", cells: [cell("수요 조사", ["현장 의견 120건 모음"]), cell("시범 운영", ["3개 지역 시범"]), cell("확산", ["전국 확산"])] });
const stepsOut = outBlock({ kind: "steps", label: "추진내용", variant: "row", cells: [cell("수요 조사", ["현장 의견 120건 모음"]), cell("시범 운영", ["3개 지역 시범"]), cell("확산", ["전국 확산"])] });

function makeSpec(blocks: Block[], extra: Partial<ReportSectionSpec> = {}): ReportSectionSpec {
  return {
    version: 3,
    card: { id: "주요사업1/1-가", taskNo: "1-1", title: "과제" },
    business: { no: 1, name: "사업" },
    task: { no: "1-1", title: "실행과제", bp: false },
    sub: { mark: "가", title: "소항목 제목", markers: [] },
    rows: [],
    results: [],
    caption: "",
    blocks,
    story: "단계 전개형",
    module: 1,
    ...extra,
  };
}
const spec = makeSpec([block({ kind: "bullets", label: "추진배경", items: ["배경 한 줄"] }), cards, block({ kind: "banner", text: "핵심 메시지" })]);
const mgParts = [{ key: "1.1.가", evalNo: 1, evalTitle: "평가내용 1", themeNo: 1, themeTitle: "대주제", mark: "가", title: "절", story: "" as const, why: "" }];
const mgSpec = makeSpec([block({ kind: "bullets", label: "추진배경", items: ["배경 한 줄"] }), cards], { mg: { indicator: "지표", parts: mgParts, at: ["1.1.가", "1.1.가"], pages: 1 } });

// ---------------------------------------------------------------------------
// 규칙

test("shapeAllowed: 같은 모양은 늘 됨, 기본 도식(단계 흐름)은 됨", () => {
  assert.deepEqual(shapeAllowed(cards, "cards", "plain", BIZ), { ok: true });
  assert.deepEqual(shapeAllowed(cards, "steps", "row", BIZ), { ok: true });
});

test("shapeAllowed: 경영관리 표 모양 4종·핵심 수치 띠(2026-10-28)는 주요사업 초안에서 거절, 경영관리는 됨", () => {
  assert.deepEqual([...MG_ONLY_SHAPES].sort(), ["stats", "table:bars", "table:chevron", "table:ladder", "table:result"]);
  for (const code of MG_ONLY_SHAPES) {
    const [kind, variant = ""] = code.split(":");
    const r = shapeAllowed(cards, kind, variant, BIZ);
    assert.equal(r.ok, false, code);
    if (!r.ok) assert.match(r.why, kind === "stats" ? /핵심 수치 띠」 — 주요사업 초안은 따로 떨어진 수치 띠를 쓰지 않습니다/ : /경영관리 보고서 표 모양/);
    assert.deepEqual(shapeAllowed(cards, kind, variant, MG), { ok: true }, code);
  }
  // 저장된 주요사업 초안의 수치 띠는 같은 모양이라 그대로 고칠 수 있음
  assert.deepEqual(shapeAllowed(block({ kind: "stats", cells: [cell("720건", ["판독"]), cell("50건", ["신규"])] }), "stats", "", BIZ), { ok: true });
  // 수치 표(빈 모양)는 두 트랙 모두
  assert.deepEqual(shapeAllowed(cards, "table", "", BIZ), { ok: true });
});

test("shapeAllowed: 근거가 없는 이 과제만의 요소로는 못 바꿈(이유 글), 원래 그 종류면 됨", () => {
  for (const kind of OWN_KINDS) {
    const r = shapeAllowed(cards, kind, "", BIZ);
    assert.equal(r.ok, false, kind);
    if (!r.ok) assert.match(r.why, /이 과제만의 요소라 근거가 있어야/);
  }
  const q = block({ kind: "quotes", cells: [cell("CEO", ["원문"])] });
  assert.deepEqual(shapeAllowed(q, "quotes", "", BIZ), { ok: true });
});

test("shapeRules: 구성안이 있으면 원문을 찾은 재료로(shapeAvailability), 없으면 집필 때의 도식 후보(own)로", () => {
  const withQuote = shapeRules(false, { materials: [{ kind: "quote", text: "원문", when: "", quote: "원문", found: true }], blocks: [] });
  assert.equal(withQuote.avail.quotes?.ok, true);
  assert.equal(withQuote.avail.case?.ok, false);
  assert.doesNotMatch(withQuote.avail.case?.why ?? "", /구성안을 다시 만들면/, "구성안 안내 꼬리는 뗌");
  const fromHints = shapeRules(false, null, [{ kind: "hub", why: "협업 기관 3곳", own: true }]);
  assert.equal(fromHints.avail.hub?.ok, true);
  assert.match(fromHints.avail.hub?.why ?? "", /협업 기관 3곳/);
  assert.equal(fromHints.avail.chart?.ok, false);
  assert.deepEqual(shapeAllowed(cards, "hub", "", fromHints), { ok: true });
});

test("shapeMenu: 주요사업은 경영관리 표 모양을 안 보임, 경영관리는 29가지 전부. 규칙이 없으면 이 과제만의 요소는 ok = null(요청 때 확인)", () => {
  const biz = shapeMenu(false, null);
  assert.equal(biz.length, SHAPES.length - MG_ONLY_SHAPES.length);
  assert.ok(biz.every((m) => !MG_ONLY_SHAPES.includes(m.code)));
  assert.equal(shapeMenu(true, MG).length, SHAPES.length);
  assert.equal(biz.find((m) => m.code === "quotes")?.ok, null);
  assert.equal(biz.find((m) => m.code === "steps:row")?.ok, true);
  assert.equal(shapeMenu(false, BIZ).find((m) => m.code === "quotes")?.ok, false);
});

// ---------------------------------------------------------------------------
// 내용 아닌 필드 보존

// 배치 필드(다른 작업 「배치 골격 다양화」가 Block에 더하는 내용 아닌 필드 — 이름이 무엇이든)는 타입과 상관없이 값으로 확인
type Extra = { layout?: unknown; span?: unknown; future?: unknown };
const extra = (b: Block) => b as unknown as Extra;
const withExtra = (b: Block, x: Extra) => ({ ...b, ...x }) as unknown as Block;

test("withContent: 원래 블록의 내용 아닌 필드(배치 등 — 지금 없거나 나중에 생길 필드)는 그대로, 내용 필드만 바뀜", () => {
  const before = withExtra(cards, { layout: "stage", span: "half", future: 7 });
  const next = withContent(before, block({ kind: "steps", label: "추진내용", variant: "row", cells: cards.cells }));
  assert.deepEqual([extra(next).layout, extra(next).span, extra(next).future], ["stage", "half", 7]);
  assert.equal(next.kind, "steps");
  assert.equal(next.variant, "row");
  assert.ok(!(CONTENT_FIELDS as readonly string[]).includes("layout") && !(CONTENT_FIELDS as readonly string[]).includes("span"));
});

test("checkBlock: 모양을 바꾼 고치기도, 같은 모양 고치기도 원래 블록의 배치 필드를 지킴", () => {
  const before = withExtra(cards, { layout: "full", span: "half" });
  const shaped = checkBlock(before, stepsOut, line, yes, BIZ);
  assert.ok(shaped.ok);
  if (shaped.ok) assert.deepEqual([extra(shaped.block).layout, extra(shaped.block).span], ["full", "half"]);
  const same = verifyBlockEdit(before, outBlock({ ...stepsOut, kind: "cards", variant: "plain" }), line, yes);
  assert.ok(same.ok);
  if (same.ok) assert.deepEqual([extra(same.block).layout, extra(same.block).span], ["full", "half"]);
});

// ---------------------------------------------------------------------------
// 고치기 검증(rules 있음)

test("verifyBlockEdit(rules): 요청대로 칸 도식 → 단계 흐름으로 바꾸면 받고 shape 전후를 알림, 라벨 유지", () => {
  const r = verifyBlockEdit(cards, stepsOut, line, yes, BIZ);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.shape, { from: "cards:plain", to: "steps:row" });
  assert.equal(r.block.label, "추진내용");
  assert.equal(r.changed, 0, "글은 그대로 옮김");
});

test("verifyBlockEdit(rules 없음): 예전처럼 종류가 바뀌면 거절", () => {
  const r = verifyBlockEdit(cards, stepsOut, line, yes);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /종류를 바꿨습니다/);
});

test("verifyBlockEdit(rules): 주요사업 초안에서 경영관리 표 모양(추진실적 열 표)으로 바꾸면 거절하고 이유를 알림", () => {
  const out = outBlock({ kind: "table", variant: "result", label: "추진내용", cells: [cell("", ["현장 의견 모음"]), cell("", ["시범 운영"])], series: [{ label: "만족도", value: "97%" }] });
  const biz = verifyBlockEdit(cards, out, line, yes, BIZ);
  assert.equal(biz.ok, false);
  if (!biz.ok) assert.match(biz.message, /AI가 고른 모양을 쓸 수 없습니다 — 「추진실적 열 표」은 경영관리/);
  const mg = verifyBlockEdit(cards, out, line, yes, MG);
  assert.ok(mg.ok);
  if (mg.ok) assert.deepEqual(mg.shape, { from: "cards:plain", to: "table:result" });
});

test("verifyBlockEdit(rules): 근거 없는 이 과제만의 요소(협업 구조)로는 못 바꿈 — 원문 대조를 통과해도 근거 조건이 먼저", () => {
  const hub = outBlock({ kind: "hub", label: "추진내용", cells: [cell("KCA", ["총괄"]), cell("A기관", ["실증"]), cell("B기관", ["확산"])] });
  const r = verifyBlockEdit(cards, hub, line, yes, BIZ);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /협업 구조」은 이 과제만의 요소라 근거가 있어야/);
  const ok = verifyBlockEdit(cards, hub, line, yes, shapeRules(false, null, [{ kind: "hub", why: "기관 2곳", own: true }]));
  assert.ok(ok.ok);
});

test("verifyBlockEdit(rules): 인용 상자는 근거 조건을 채워도 원문을 못 찾은 인용이면 빠짐(집필과 같은 원문 대조)", () => {
  const rules = shapeRules(false, null, [{ kind: "quotes", why: "CEO 발언", own: true }]);
  const out = outBlock({ kind: "quotes", cells: [cell("CEO", ["지어낸 인용 문장입니다"])] });
  const r = verifyBlockEdit(cards, out, line, () => false, rules);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /찾지 못한 인용/);
});

test("checkBlock(rules): AI는 지금 모양을 냈는데 정리가 칸 수로 모양을 바꾸면(PDCA 3칸 → 단계 흐름) 요청하지 않은 바꾸기라 거절", () => {
  const pdca = block({ kind: "pdca", cells: [cell("P", ["계획"]), cell("D", ["실행"]), cell("C", ["점검"]), cell("A", ["환류"])] });
  const r = checkBlock(pdca, outBlock({ kind: "pdca", cells: [cell("P", ["계획"]), cell("D", ["실행"]), cell("C", ["점검"])] }), line, yes, BIZ);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /칸 수가 「PDCA 순환」 모양에 맞지 않아/);
});

test("checkBlock(rules): 같은 종류인데 모양이 목록 밖이면 원래 모양(AI가 모양을 빠뜨림 — 바꾸려던 것이 아님)", () => {
  const r = checkBlock(cards, outBlock({ ...stepsOut, kind: "cards", variant: "없는모양" }), line, yes, BIZ);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.block.variant, "plain");
    assert.equal(r.shape, null);
  }
});

test("checkBlock(rules): 표끼리 다른 갈래로 바꿔 정리에서 버려지면 원래 표 모양으로 한 번 더", () => {
  const result = block({ kind: "table", variant: "result", label: "추진내용", cells: [cell("", ["점검 강화"]), cell("", ["교육"])], series: [{ label: "이행률", value: "97%" }] });
  // AI가 결과 표를 값 열 표로 바꿨지만 머리 줄(items)이 없어 수치 표로는 못 그림 → 원래 result로
  const r = checkBlock(result, outBlock({ kind: "table", variant: "", label: "추진내용", cells: [cell("", ["점검 강화 고침"]), cell("", ["교육"])], series: [{ label: "이행률", value: "97%" }] }), line, yes, MG);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.block.variant, "result");
});

// ---------------------------------------------------------------------------
// 대안 정리

const opt = (b: BlockOutput, why = "까닭") => ({ block: b, why });

test("cleanShapeOptions: 지금 모양과 같은 안·앞 안과 같은 모양은 버리고 이유를 남김, 최대 3안", () => {
  const timeline = outBlock({ ...stepsOut, kind: "timeline", variant: "chevron" });
  const table = outBlock({ kind: "table", variant: "", label: "추진내용", items: ["구분", "내용", "결과"], cells: [cell("조사", ["120건", "완료"]), cell("시범", ["3개 지역", "완료"])] });
  const zig = outBlock({ ...stepsOut, variant: "zigzag", cells: [...stepsOut.cells, cell("정착", ["제도화"])] });
  const out = { options: [opt(outBlock({ ...stepsOut, kind: "cards", variant: "plain" })), opt(stepsOut), opt(stepsOut), opt(timeline), opt(table), opt(zig)], reply: "" };
  const r = cleanShapeOptions(cards, out, line, yes, BIZ);
  assert.equal(r.options.length, SHAPE_OPTIONS_MAX);
  assert.deepEqual(
    r.options.map((o) => o.code),
    ["steps:row", "timeline:chevron", "table"],
  );
  assert.ok(r.dropped.some((x) => /지금 모양과 모양이 같아/.test(x)));
  assert.ok(r.dropped.some((x) => /앞 안과 모양이 같아/.test(x)));
  assert.ok(r.dropped.some((x) => /3안을 넘어/.test(x)));
  // out은 AI 답 그대로(적용 때 서버가 다시 검증)
  assert.equal(r.options[0].out, stepsOut);
});

test("cleanShapeOptions: 고른 모양 안을 맨 앞으로, 없으면 알림. 트랙 밖·근거 없는 안은 이유와 함께 버림", () => {
  const timeline = outBlock({ ...stepsOut, kind: "timeline", variant: "chevron" });
  const hub = outBlock({ kind: "hub", cells: [cell("KCA", ["총괄"]), cell("A", ["실증"]), cell("B", ["확산"])] });
  const r = cleanShapeOptions(cards, { options: [opt(stepsOut), opt(hub), opt(timeline)], reply: "" }, line, yes, BIZ, "timeline:chevron");
  assert.deepEqual(
    r.options.map((o) => o.code),
    ["timeline:chevron", "steps:row"],
  );
  assert.ok(r.dropped.some((x) => /협업 구조.*근거가 있어야/.test(x)));
  const none = cleanShapeOptions(cards, { options: [opt(stepsOut)], reply: "" }, line, yes, BIZ, "stats");
  assert.match(none.dropped[0], /고른 모양\(핵심 수치 띠\) 안이 없습니다/);
});

test("readBlockShapesRequest: 고른 모양이 지금 모양·트랙 밖·근거 없음·모르는 코드면 AI 전에 글로 거절, 비면 AI가 고름", () => {
  assert.deepEqual(readBlockShapesRequest({ blockIndex: 1, request: "  " }, spec, BIZ), { blockIndex: 1, request: "", want: null });
  assert.deepEqual(readBlockShapesRequest({ blockIndex: 1, want: "steps:row", request: "단계가 보이게" }, spec, BIZ), { blockIndex: 1, request: "단계가 보이게", want: "steps:row" });
  assert.match(String(readBlockShapesRequest({ blockIndex: 1, want: "cards:plain" }, spec, BIZ)), /지금도 「칸 도식」 모양/);
  assert.match(String(readBlockShapesRequest({ blockIndex: 1, want: "table:ladder" }, spec, BIZ)), /경영관리 보고서 표 모양/);
  assert.match(String(readBlockShapesRequest({ blockIndex: 1, want: "case" }, spec, BIZ)), /근거가 있어야/);
  assert.match(String(readBlockShapesRequest({ blockIndex: 1, want: "없음:모양" }, spec, BIZ)), /찾지 못했습니다/);
  assert.match(String(readBlockShapesRequest({ blockIndex: 9 }, spec, BIZ)), /블록을 찾지 못했습니다/);
  assert.equal(typeof readBlockShapesRequest({ blockIndex: 1, want: "table:ladder" }, mgSpec, MG), "object");
});

// ---------------------------------------------------------------------------
// 높이 차이

test("shapeDelta: 주요사업은 판면 어림(예산 = 모듈 × 255mm), delta = 후 − 전, 같은 블록이면 0", () => {
  const same = shapeDelta(spec, 1, cards);
  assert.equal(same.delta, 0);
  assert.equal(same.budget, 255);
  assert.equal(same.before, draftHeight(spec).total);
  const steps = checkBlock(cards, stepsOut, line, yes, BIZ);
  assert.ok(steps.ok);
  if (!steps.ok) return;
  const d = shapeDelta(spec, 1, steps.block);
  assert.equal(d.delta, d.after - d.before);
  assert.notEqual(d.after, d.before, "모양이 바뀌면 높이 어림이 달라짐");
});

test("shapeDelta: 경영관리는 높이 어림(mgSpecHeight)과 배정 쪽 × 255mm, 배정이 없으면 예산 null", () => {
  assert.equal(shapeDelta(mgSpec, 1, cards).budget, 255);
  const noPages = { ...mgSpec, mg: { ...mgSpec.mg!, pages: undefined } };
  assert.equal(shapeDelta(noPages, 1, cards).budget, null);
});

// ---------------------------------------------------------------------------
// 요청 글·스키마·프롬프트 규칙

test("blockShapesPrompt: 자리표시가 안 남고, 지금 모양·안 수·바꿀 수 있는 모양(한 줄 글자 수)·쓸 수 없는 모양이 들어감. 주요사업은 표 모양 4종을 안 적음", () => {
  const text = blockShapesPrompt(reportBlockPrompts().prompts, spec, { blockIndex: 1, request: "", want: null }, { card: "카드 글", extra: "" }, BIZ);
  assert.doesNotMatch(text, /\{\{/);
  assert.match(text, /이번 요청 — 다른 모양으로/);
  assert.match(text, /지금 모양\(cards:plain 칸 도식\)과 다른 모양 2~3안/);
  assert.match(text, /steps:row 단계 흐름\(2~5개 · 한 줄 약 \d+자\)/);
  assert.match(text, /쓸 수 없는 모양\(근거 없음 — 고르지 않음\): .*quotes 인용 상자/);
  for (const code of MG_ONLY_SHAPES) assert.ok(!text.includes(code), code);
  assert.match(text, /원하는 모양: 정하지 않음/);
  assert.match(text, /「지금 블록\(JSON\)」/);
});

test("blockShapesPrompt(경영관리): 표 모양 4종이 바꿀 수 있는 모양에 들어가고, 고른 모양은 첫 안으로", () => {
  const text = blockShapesPrompt(reportBlockPromptsMg().prompts, mgSpec, { blockIndex: 1, request: "추진실적을 오른쪽에", want: "table:result" }, { card: "", extra: "" }, MG);
  assert.doesNotMatch(text, /\{\{/);
  for (const code of MG_ONLY_SHAPES) assert.ok(text.includes(code), code);
  assert.match(text, /원하는 모양: table:result 추진실적 열 표 — 첫 안은 반드시 이 모양/);
  assert.match(text, /다른 모양 1~3안/);
  assert.match(text, /덧붙인 요청: 추진실적을 오른쪽에/);
});

test("blockEditPrompt: 규칙을 주면 고치기 요청에 「모양 바꾸기」 줄(바꿀 수 있는·쓸 수 없는 모양), 없으면 「모양을 바꾸지 않음」", () => {
  const req: BlockEditRequest = { blockIndex: 1, kind: "edit", request: "단계도로 바꿔 줘", quote: "" };
  const withRules = blockEditPrompt(reportBlockPrompts().prompts, spec, req, { card: "", extra: "" }, BIZ);
  assert.match(withRules, /모양 바꾸기\(요청이 모양을 말할 때만 — 아니면 지금 모양 그대로\): 바꿀 수 있는 모양 .*steps:row/);
  assert.doesNotMatch(withRules, /table:result/);
  const without = blockEditPrompt(reportBlockPrompts().prompts, spec, req, { card: "", extra: "" });
  assert.match(without, /없음 — 이 요청은 모양을 바꾸지 않음/);
});

test("blockShapesSchema: 안 배열·까닭·reply 구조", () => {
  const schema = blockShapesSchema();
  assert.ok(schema.safeParse({ options: [{ block: stepsOut, why: "차례가 있음" }], reply: "" }).success);
  assert.equal(schema.safeParse({ options: [{ block: stepsOut }], reply: "" }).success, false);
  assert.equal(schema.safeParse({ reply: "" }).success, false);
});

test("프롬프트 규칙 문구: 예전 「종류는 바꾸지 않습니다」 대신 요청이 모양을 말하면 바꿀 수 있음 — 사실·숫자 그대로, 근거 없는 칸 금지, 「다른 모양으로」 절차·출력", () => {
  for (const f of ["report-block", "report-block-mg"]) {
    const sys = readFileSync(new URL(`../../resources/prompts/${f}/system.md`, import.meta.url), "utf8");
    assert.doesNotMatch(sys, /종류는 바꾸지 않습니다/, f);
    assert.match(sys, /요청이 모양 바꾸기를 말하면/, f);
    assert.match(sys, /사실·숫자·인용은 그대로 옮기고/, f);
    assert.match(sys, /근거에 없는 칸\(인용·말풍선·정의·우수사례·협업 기관·시점 수치\)을 지어 채우지 않습니다/, f);
    assert.match(sys, /「다른 모양으로」면 같은 내용을 지금 모양과 다른 모양의 안 여럿으로/, f);
    assert.match(sys, /다른 모양으로: 답은 JSON options/, f);
    assert.match(sys, /요청하지 않은 모양 바꾸기/, f);
  }
  // 모델이 받는 시스템 글(끼움을 푼 판)에도 같은 규칙
  assert.match(reportBlockPrompts().prompts.system.system, /요청이 모양 바꾸기를 말하면/);
});
