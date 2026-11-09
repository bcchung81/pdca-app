// 단계·시기 모양 4종(steps:logic·funnel·layers, timeline:status)·부분 강조(cells[].focus) 시험 — 2026-11-09, 경평 초안 프레임워크 확장 계획 P4(앞 절반).
// 지키는 것: 논리모형 강조 칸·진행 상태 표지는 AI가 아니라 코드가 정함(cellFocus·statusTag), 정리(cleanBlocks)의 되돌림(칸 모자람·수치 없는 깔때기 → 단계 흐름),
// 그리기(section-html)·판면 어림(fit)·원고(section-md)가 같은 판정, focus가 없으면 예전 출력 그대로, 주요사업 전용(경영관리 목록에서 빠짐 — block-shape·composition·outline-view 시험).

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Block, type BlockCell, type BlockOutput, VARIANTS, cellFocus, cleanBlocks, layerMark, statusTag } from "./blocks.ts";
import { FUNNEL, LAYER_MM, blockHeight, blockWidth, canonicalBlock, funnelMm, isBoxBlock, slotOf } from "./fit.ts";
import { BIZ_ONLY_SHAPES, SHAPES, cellRange, defaultCells, frameworkOf } from "./frameworks.ts";
import type { ReportSectionSpec } from "./section.ts";
import { blocksSampleHtml } from "./section-html.ts";
import { sectionMarkdown } from "./section-md.ts";

const out = (b: Omit<Partial<BlockOutput>, "kind"> & { kind: any }): BlockOutput => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as BlockOutput;
const cell = (head: string, bullets: string[] = [], o: Partial<BlockCell> = {}): BlockCell => ({ head, tag: "", bullets, note: "", ...o });
const blk = (kind: Block["kind"], variant: string, cells: BlockCell[], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant, text: "", items: [], cells, rows: [], series: [], badge: "", ...x });
const line = (s: unknown, max = 400) => String(s ?? "").trim().slice(0, max);
const clean = (...xs: BlockOutput[]) => cleanBlocks(xs, line, () => true).blocks;
const md = (b: Block) =>
  sectionMarkdown({ version: 3, card: { id: "x", taskNo: "1-가", title: "t" }, business: { no: 1, name: "b" }, task: { no: "1-1", title: "t", bp: false }, sub: { mark: "가", title: "제목", markers: [] }, rows: [], results: [], caption: "", blocks: [b], module: 1 } as ReportSectionSpec).md;

// ---------------------------------------------------------------------------
// 모양 목록·짜임 사전

test("VARIANTS: steps·timeline 첫째 모양은 그대로(row·chevron) + 새 모양, SHAPES 이름·칸 범위·보통 칸 수, 주요사업 전용", () => {
  assert.deepEqual(VARIANTS.steps, ["row", "zigzag", "logic", "funnel", "layers"]);
  assert.deepEqual(VARIANTS.timeline, ["chevron", "dots", "status"]);
  for (const code of ["steps:logic", "steps:funnel", "steps:layers", "timeline:status"]) {
    const s = SHAPES.find((x) => x.code === code);
    assert.ok(s && s.group === "base", code);
    assert.ok(BIZ_ONLY_SHAPES.includes(code), `${code}는 주요사업 전용`);
  }
  assert.deepEqual(cellRange("steps", "logic"), { min: 3, max: 5 });
  assert.deepEqual(cellRange("steps", "funnel"), { min: 3, max: 5 });
  assert.deepEqual(cellRange("steps", "layers"), { min: 2, max: 4 });
  assert.deepEqual(cellRange("timeline", "status"), cellRange("timeline", "chevron"));
  assert.deepEqual([defaultCells("steps", "logic"), defaultCells("steps", "funnel"), defaultCells("steps", "layers"), defaultCells("timeline", "status")], [4, 4, 3, 3]);
  // ⑮ 위험관리·안전형 견본의 예방 조치 = 다층 차단
  assert.equal(frameworkOf("위험관리·안전형")?.blocks.find((b) => b.label === "예방 조치")?.variant, "layers");
});

// ---------------------------------------------------------------------------
// 코드가 정하는 값

test("cellFocus: 논리모형은 칸 머리로(결과·영향·성과·효과·Outcome·Impact, 산출이 든 머리는 뺌) — AI focus는 무시, 그 밖 steps·timeline은 focus === true, 다른 종류는 늘 false", () => {
  const logic = blk("steps", "logic", [cell("투입", [], { focus: true }), cell("활동"), cell("산출 결과"), cell("결과"), cell("영향", [], { tag: "Impact" }), cell("", [], { tag: "Outcome" })]);
  assert.deepEqual(cellFocus(logic), [false, false, false, true, true, true]);
  assert.deepEqual(cellFocus(blk("steps", "row", [cell("가"), cell("나", [], { focus: true })])), [false, true]);
  assert.deepEqual(cellFocus(blk("timeline", "chevron", [cell("’25", [], { focus: true }), cell("’26")])), [true, false]);
  assert.deepEqual(cellFocus(blk("cards", "plain", [cell("가", [], { focus: true })])), [false], "steps·timeline 밖은 강조 안 함");
});

test("statusTag: 예정·계획 먼저(완료 예정·진행 예정 = 예정), 완료·종료·달성, 진행·추진 중·운영 중·시행 중, 모르면 빈 글", () => {
  const cases: Array<[string, string]> = [["완료", "완료"], ["’26.3 완료", "완료"], ["종료", "완료"], ["진행", "진행"], ["추진 중", "진행"], ["운영중", "진행"], ["예정", "예정"], ["완료 예정", "예정"], ["진행 예정", "예정"], ["계획", "예정"], ["Step 2", ""], ["", ""]];
  for (const [raw, want] of cases) assert.equal(statusTag(raw), want, raw);
  assert.equal(layerMark({ tag: "" }, 1), "2차");
  assert.equal(layerMark({ tag: " 1차 예방 " }, 0), "1차 예방");
});

test("cleanBlocks: 논리모형 AI focus 버림·3칸 미만은 단계 흐름, 깔때기는 단계마다 수치(【확인】 허용 — note 숫자는 안 셈)가 없으면 단계 흐름, 다층 차단 4층까지, 진행 상태 tag 정리", () => {
  const [lg] = clean(out({ kind: "steps", variant: "logic", cells: [cell("활동", ["교육"], { focus: true }), cell("산출", ["수료"]), cell("결과", ["합격률"])] }));
  assert.equal(lg.variant, "logic");
  assert.ok(lg.cells.every((c) => !("focus" in c)), "AI focus 버림");
  assert.equal(clean(out({ kind: "steps", variant: "logic", cells: [cell("활동", ["a"]), cell("결과", ["b"])] }))[0].variant, "row");
  const fun = (bullets: string[][], notes: string[] = []) => clean(out({ kind: "steps", variant: "funnel", cells: bullets.map((b, i) => cell(["탐지", "확인", "조치", "환수"][i], b, { note: notes[i] ?? "" })) }))[0];
  assert.equal(fun([["1,240건"], ["310건"], ["【확인: 조치 건수】"]]).variant, "funnel");
  assert.equal(fun([["1,240건"], ["확인 완료"], ["120건"]], ["", "’26.1~6월", ""]).variant, "row", "집계 기간의 숫자는 단계 수치가 아님");
  assert.equal(fun([["1,240건"], ["310건"]]).variant, "row", "3단계 미만");
  assert.equal(clean(out({ kind: "steps", variant: "layers", cells: ["가", "나", "다", "라", "마"].map((h) => cell(h, ["조치"])) }))[0].cells.length, 4);
  const [st] = clean(out({ kind: "timeline", variant: "status", cells: [cell("’25", ["a"], { tag: "완료" }), cell("’26", ["b"], { tag: "추진 중", focus: true }), cell("’27", ["c"], { tag: "추진 예정" }), cell("’28", ["d"], { tag: "Step 4" })] }));
  assert.deepEqual(st.cells.map((c) => c.tag), ["완료", "진행", "예정", ""]);
  assert.equal(st.cells[1].focus, true, "진행 상태는 AI focus를 남김");
});

// ---------------------------------------------------------------------------
// 그리기

test("부분 강조: focus가 없으면 HTML이 focus 필드가 없던 때와 바이트까지 같고(focus: false도), true면 그 칸만 k-focus — 단계·ㄹ자·연도 흐름·연혁 점", () => {
  const four = [cell("Step 1 진단", ["a"]), cell("설계", ["b"], { note: "결과" }), cell("실행", ["c"]), cell("환류", ["d"])];
  for (const [kind, variant] of [["steps", "row"], ["steps", "zigzag"], ["timeline", "chevron"], ["timeline", "dots"]] as const) {
    const plain = blocksSampleHtml([blk(kind, variant, four)]);
    assert.equal(blocksSampleHtml([blk(kind, variant, four.map((c) => ({ ...c, focus: false })))]), plain, `${kind}:${variant} focus false`);
    assert.doesNotMatch(plain, /k-focus/);
    const on = blocksSampleHtml([blk(kind, variant, four.map((c, i) => (i === 2 ? { ...c, focus: true } : c)))]);
    assert.equal((on.match(/k-focus/g) ?? []).length, 1, `${kind}:${variant}`);
    // 판면 어림은 강조와 무관
    const w = blockWidth(blk(kind, variant, four, { label: "라벨" }));
    assert.equal(blockHeight(blk(kind, variant, four.map((c) => ({ ...c, focus: true })), { label: "라벨" }), w), blockHeight(blk(kind, variant, four, { label: "라벨" }), w));
  }
});

test("논리모형 HTML: 단계 흐름과 같은 그림 + 결과·영향 칸만 k-focus(AI focus 무시), 높이·칸 폭도 단계 흐름과 같음", () => {
  const cells = [cell("활동", ["교육 12회"], { focus: true }), cell("산출", ["수료 300명"]), cell("결과", ["합격률 상승"]), cell("영향", ["사고 감소"])];
  const h = blocksSampleHtml([blk("steps", "logic", cells)]);
  assert.equal(blocksSampleHtml([blk("steps", "row", cells.map((c) => ({ ...c, focus: undefined })))]), blocksSampleHtml([blk("steps", "row", cells.map((c) => cell(c.head, c.bullets)))]), "focus: undefined는 필드가 없는 칸과 같음");
  const lis = [...h.matchAll(/<li( class="k-focus")?><div class="k-proc__h">/g)].map((m) => Boolean(m[1]));
  assert.deepEqual(lis, [false, false, true, true]);
  const lg = blk("steps", "logic", cells, { label: "라벨" });
  const row = blk("steps", "row", cells, { label: "라벨" });
  assert.deepEqual(slotOf(lg, 150), slotOf(row, 150));
  assert.equal(blockHeight(lg, 150), blockHeight(row, 150));
});

test("깔때기 HTML: 띠 폭이 아래로 갈수록 줄고(마지막 = FUNNEL.minRatio) 판면 어림과 같은 폭, 집계 기준 칸은 note가 있을 때만", () => {
  const cells = [cell("탐지", ["의심 신호 1,240건"], { note: "’26.1~6월, 전국 무선국" }), cell("확인", ["불법 확인 310건"]), cell("조치", ["시정 120건"], { focus: true }), cell("환수", ["과태료 4억 원"])];
  const b = blk("steps", "funnel", cells);
  const h = blocksSampleHtml([b]);
  const widths = [...h.matchAll(/k-fun__band[^"]*" style="width:([\d.]+)%"/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [100, 86.67, 73.33, 60]);
  const g = funnelMm(b, blockWidth(b));
  assert.equal(g.bands.at(-1)! / g.area, FUNNEL.minRatio);
  assert.match(h, /<ol class="k-fun k-fun--note" style="--k-fun-note:34\.00%">/);
  assert.equal((h.match(/class="k-fun__n"/g) ?? []).length, 4, "note 없는 단계도 빈 칸(줄 맞춤)");
  assert.match(h, /k-fun__band k-focus/);
  const bare = blocksSampleHtml([blk("steps", "funnel", cells.map((c) => ({ ...c, note: "" })))]);
  assert.match(bare, /<ol class="k-fun">/);
  assert.doesNotMatch(bare, /k-fun__n|--k-fun-note/);
  assert.equal(funnelMm({ cells: [cell("가")] }, 150).note, 0);
  // 칸 글 폭은 가장 좁은 띠 안, 높이는 띠마다 — 글이 길면 높아짐
  const s = slotOf(b, 150);
  assert.ok(s.body < slotOf({ ...b, variant: "row" }, 150).body * 2);
  const long = blk("steps", "funnel", cells.map((c) => ({ ...c, bullets: [`${c.bullets[0]} ${"가".repeat(60)}`] })));
  assert.ok(blockHeight(long, 150) > blockHeight(b, 150));
  assert.equal(isBoxBlock(b), false, "세로로 쌓는 깔때기는 나란한 상자 아님(빈 상자 경고 없음)");
});

test("다층 차단 HTML: 층 표지는 tag 또는 「N차」, 층 이름 칸은 이름이 있을 때만(LAYER_MM.head), 강조 칸, 판면 어림 칸 폭", () => {
  const cells = [cell("사전 예방", ["정기 점검 120회"]), cell("현장 차단", ["작업 중지"], { tag: "2차 차단", note: "중지 14건", focus: true }), cell("재발 방지", ["제도 개선"])];
  const h = blocksSampleHtml([blk("steps", "layers", cells)]);
  assert.deepEqual([...h.matchAll(/<span class="k-lay__m">([^<]*)<\/span>/g)].map((m) => m[1]), ["1차", "2차 차단", "3차"]);
  assert.match(h, /<ol class="k-lay k-lay--named">/);
  assert.equal((h.match(/class="k-lay__h"/g) ?? []).length, 3);
  assert.match(h, /<li class="k-focus"><span class="k-lay__m">2차 차단/);
  assert.match(h, /<p class="k-lay__r">중지 <span class="k-nb">14건<\/span><\/p>/);
  const bare = blocksSampleHtml([blk("steps", "layers", cells.map((c) => ({ ...c, head: "" })))]);
  assert.match(bare, /<ol class="k-lay">/);
  assert.doesNotMatch(bare, /k-lay__h/);
  const b = blk("steps", "layers", cells);
  assert.equal(slotOf(b, 150).note, 150 - LAYER_MM.mark - LAYER_MM.head - 8 * (25.4 / 96));
  assert.ok(slotOf({ ...b, cells: cells.map((c) => ({ ...c, head: "" })) }, 150).note > slotOf(b, 150).note, "이름 칸이 없으면 넓어짐");
  assert.equal(isBoxBlock(b), false);
});

test("진행 상태 HTML: 머리 뒤 상태 표지, 진행 칸이 「지금」(마지막 칸이 아님), 예정 칸은 k-st--plan, (당해연도) 없음 — 연도 흐름 출력은 그대로", () => {
  const cells = [cell("’25 설계", ["체계 설계"], { tag: "완료" }), cell("’26 시범", ["3개 지역"], { tag: "진행" }), cell("’27 확산", ["전국 적용"], { tag: "예정", note: "목표 17개 시도" })];
  const h = blocksSampleHtml([blk("timeline", "status", cells)]);
  assert.match(h, /<ol class="k-tl k-tl--st"/);
  assert.deepEqual([...h.matchAll(/<span class="k-st">([^<]*)<\/span>/g)].map((m) => m[1]), ["완료", "진행", "예정"]);
  assert.match(h, /<li class="k-tl__item" aria-current="step"><div class="k-tl__h">’26 시범 <span class="k-st">진행<\/span>/);
  assert.match(h, /<li class="k-tl__item k-st--plan"><div class="k-tl__h">’27 확산/);
  assert.doesNotMatch(h, /당해연도/);
  const chev = blocksSampleHtml([blk("timeline", "chevron", cells)]);
  assert.doesNotMatch(chev, /k-st|k-tl--st/);
  assert.match(chev, /<li class="k-tl__item" aria-current="step"><div class="k-tl__h">’27 확산<span class="sr">\(당해연도\)<\/span>/);
  // 표지가 머리 글에 들어가므로 높이는 연도 흐름과 같거나 큼, 표지 없으면 같음
  const w = 150;
  assert.ok(blockHeight(blk("timeline", "status", cells), w) >= blockHeight(blk("timeline", "chevron", cells), w));
  const tight = cells.map((c) => ({ ...c, head: "가".repeat(13) }));
  assert.ok(blockHeight(blk("timeline", "status", tight), w) > blockHeight(blk("timeline", "chevron", tight), w), "좁은 칸에서 표지가 머리를 한 줄 늘림");
  assert.equal(blockHeight(blk("timeline", "status", cells.map((c) => ({ ...c, tag: "" }))), w), blockHeight(blk("timeline", "chevron", cells), w));
});

// ---------------------------------------------------------------------------
// 판면 어림 기준값·견본

test("판면 어림 기준값(사다리 칸, 보통 모양 — canonicalBlock): 논리모형 4칸 38mm(단계 흐름 3칸과 같음)·깔때기 4단계 51mm·다층 차단 3층 56mm·진행 상태 3칸 36mm(연도 흐름과 같음)", () => {
  const mm = (kind: Block["kind"], variant: string) => {
    const b = canonicalBlock(kind, variant, defaultCells(kind, variant), "라벨");
    return Math.round(blockHeight(b, blockWidth(b)));
  };
  assert.equal(mm("steps", "logic"), 38);
  assert.equal(mm("steps", "row"), 38);
  assert.equal(mm("steps", "funnel"), 51);
  assert.equal(mm("steps", "layers"), 56);
  assert.equal(mm("timeline", "status"), 36);
  assert.equal(mm("timeline", "chevron"), 36);
  // 견본: 논리모형은 결과·영향 칸이 강조돼 보이고, 진행 상태는 완료·진행·예정 표지
  const lg = blocksSampleHtml([canonicalBlock("steps", "logic", 5, "")]);
  assert.equal((lg.match(/k-focus/g) ?? []).length, 2);
  assert.match(blocksSampleHtml([canonicalBlock("timeline", "status", 3, "")]), /k-st">완료[\s\S]*k-st">진행[\s\S]*k-st">예정/);
  assert.match(blocksSampleHtml([canonicalBlock("steps", "funnel", 4, "")]), /k-fun--note/);
});

// ---------------------------------------------------------------------------
// 원고(한글 내려받기 마크다운)

test("원고: 깔때기는 단계 | 수치 | 집계 기준 표, 다층 차단은 칸 머리 앞 [층 표지], 진행 상태는 머리 뒤 (완료)·(예정), 논리모형은 단계 목록", () => {
  const fun = md(blk("steps", "funnel", [cell("탐지", ["1,240건"], { note: "’26.1~6월" }), cell("확인", ["310건"]), cell("조치", ["120건"])]));
  assert.match(fun, /\| 단계 \| 수치 \| 집계 기준 \|/);
  assert.match(fun, /\| 탐지 \| 1,240건 \| ’26\.1~6월 \|/);
  const lay = md(blk("steps", "layers", [cell("사전 예방", ["점검"]), cell("현장 차단", ["중지"], { tag: "2차 차단" })]));
  assert.match(lay, /ㅇ \*\*\[1차\] 사전 예방\*\*/);
  assert.match(lay, /ㅇ \*\*\[2차 차단\] 현장 차단\*\*/);
  const st = md(blk("timeline", "status", [cell("’25 설계", ["a"], { tag: "완료" }), cell("’27 확산", ["b"], { tag: "예정" }), cell("’28", ["c"])]));
  assert.match(st, /ㅇ \*\*’25 설계 \(완료\)\*\*/);
  assert.match(st, /ㅇ \*\*’27 확산 \(예정\)\*\*/);
  assert.match(st, /ㅇ \*\*’28\*\*/);
  assert.match(md(blk("steps", "logic", [cell("활동", ["a"]), cell("결과", ["b"]), cell("영향", ["c"])])), /ㅇ \*\*2단계 결과\*\*/);
});
