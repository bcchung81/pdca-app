// 로드맵 표(table:roadmap — 2026-11-09, 경평 초안 프레임워크 확장 계획 P1 ⑲ 로드맵형) 시험.
// 지키는 것: 올해 열·「계획」 열은 AI가 아니라 코드가 열 머리 연도로 정함(roadmapCols) — 그리기(section-html)·판면 어림(fit)·원고(section-md)가 같은 판정,
// 연도 없는 머리·모르는 연도·열 1개 같은 가장자리, 정리(cleanBlocks)·찼는지(enough), 보고서 연도는 집필·다시 점검이 블록에 넣음(Block.year),
// 쉐브론 머리 표(chevron) 출력은 그대로.

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Block, type BlockOutput, cleanBlocks, isChevronTable, isGridTable, roadmapCols, roadmapPlanMark } from "./blocks.ts";
import { ROADMAP_MARK_PAD_MM, TABLE_SHAPE_MM, blockHeight, blockWidth, canonicalBlock, fitReport, slotOf, tableColsMm } from "./fit.ts";
import { cellRange, defaultCells } from "./frameworks.ts";
import { type ReportSectionSpec, recheckSection } from "./section.ts";
import { blocksSampleHtml } from "./section-html.ts";
import { sectionMarkdown } from "./section-md.ts";

const out = (b: Omit<Partial<BlockOutput>, "kind"> & { kind: any }): BlockOutput => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as BlockOutput;
const cell = (head: string, bullets: string[] = []) => ({ head, tag: "", bullets, note: "" });
const blk = (x: Partial<Block> = {}): Block => ({ kind: "table", label: "", title: "", variant: "roadmap", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const line = (s: unknown, max = 400) => String(s ?? "").trim().slice(0, max);
const ITEMS = ["구분", "Step 1(’25) 기반 마련", "Step 2(’26) 확산", "Step 3(’27~) 고도화"];
const road = (x: Partial<Block> = {}) => blk({ items: ITEMS, cells: [cell("추진내용", ["체계 설계", "전국 확산", "고도화"]), cell("기대 효과", ["", "적용 확대", "전면 적용"])], ...x });

// ---------------------------------------------------------------------------
// 올해 열·계획 열 판정

test("roadmapCols: 머리 연도가 보고서 연도와 같은 첫 열이 올해, 그 뒤 열은 계획 — ’26·2026·26년·올해·금년 모두 읽음", () => {
  assert.deepEqual(roadmapCols(ITEMS, 2026), { now: 1, plan: [false, false, true] });
  assert.deepEqual(roadmapCols(["구분", "2025년", "2026년", "2027년"], 2026), { now: 1, plan: [false, false, true] });
  assert.deepEqual(roadmapCols(["구분", "25년", "26년", "27년", "28년"], 2026), { now: 1, plan: [false, false, true, true] });
  assert.deepEqual(roadmapCols(["구분", "1단계", "2단계(올해)", "3단계"]), { now: 1, plan: [false, false, true] }, "올해는 보고서 연도 없이도 올해");
  assert.deepEqual(roadmapCols(["구분", "’25", "금년", "’27"], 2026), { now: 1, plan: [false, false, true] });
  assert.deepEqual(roadmapCols(["구분", "’24~’25", "’26~’27", "’28~"], 2026), { now: 1, plan: [false, false, true] }, "범위 머리는 그 해를 포함");
  assert.deepEqual(roadmapCols(["구분", "’25~’27 기반", "’28 확산"], 2026), { now: 0, plan: [false, true] }, "’25~’27은 ’26을 품음");
});

test("roadmapCols 가장자리: 머리에 연도가 하나도 없으면 마지막 열이 올해(연도 흐름 규칙), 모르는 연도·보고서 연도 없음·열 1개", () => {
  assert.deepEqual(roadmapCols(["구분", "1단계", "2단계", "3단계"], 2026), { now: 2, plan: [false, false, false] }, "연도 없음 → 마지막 열");
  assert.deepEqual(roadmapCols(["구분", "Step 1", "Step 2"]), { now: 1, plan: [false, false] });
  // 머리 연도가 보고서 연도와 안 맞음: 올해 열 없음, 보고서 연도보다 뒤인 열만 계획
  assert.deepEqual(roadmapCols(["구분", "’25", "’27", "’28"], 2026), { now: -1, plan: [false, true, true] });
  assert.deepEqual(roadmapCols(["구분", "’22", "’23", "’24"], 2026), { now: -1, plan: [false, false, false] }, "모두 지난 해 — 강조·표지 없음");
  // 보고서 연도를 모르는데 머리에 연도만 있음: 정하지 않음(엉뚱한 열을 올해로 칠하지 않음)
  assert.deepEqual(roadmapCols(ITEMS), { now: -1, plan: [false, false, false] });
  // 값 열 1개
  assert.deepEqual(roadmapCols(["구분", "기반 마련"], 2026), { now: 0, plan: [false] });
  assert.deepEqual(roadmapCols(["구분", "’27 고도화"], 2026), { now: -1, plan: [true] });
  assert.deepEqual(roadmapCols(["구분"], 2026), { now: -1, plan: [] }, "값 열 없음");
});

test("roadmapPlanMark: 계획 열이고 머리에 「계획」이 없을 때만 표지", () => {
  assert.equal(roadmapPlanMark("Step 3(’27~)", true), true);
  assert.equal(roadmapPlanMark("’27 계획", true), false, "이미 「계획」");
  assert.equal(roadmapPlanMark("Step 2(’26)", false), false);
});

// ---------------------------------------------------------------------------
// 정리·찼는지

test("cleanBlocks roadmap: 머리 줄 + 값 열(값 120자까지 — 쉐브론과 같음), 값 열 2개 미만·행 없음이면 뺌, AI가 year를 줘도 받지 않음", () => {
  const long = "가".repeat(100);
  const [r] = cleanBlocks([out({ kind: "table", variant: "roadmap", items: ITEMS, cells: [cell("추진내용", [long, "b", "c"])], year: 1999 } as any)], line, () => true).blocks;
  assert.equal(r.variant, "roadmap");
  assert.equal(r.cells[0].bullets[0].length, 100);
  assert.equal(r.year, undefined, "보고서 연도는 코드만 넣음");
  assert.ok(isChevronTable(r) && isGridTable(r));
  const drop = cleanBlocks(
    [out({ kind: "table", variant: "roadmap", items: ["구분", "’26"], cells: [cell("x", ["a"])] }), out({ kind: "table", variant: "roadmap", items: ITEMS, cells: [] })],
    line,
    () => true,
  );
  assert.equal(drop.blocks.length, 0);
  assert.deepEqual(drop.droppedShapes, [{ kind: "table", variant: "roadmap" }, { kind: "table", variant: "roadmap" }]);
  assert.deepEqual(cellRange("table", "roadmap"), { min: 1, max: 4 });
  assert.equal(defaultCells("table", "roadmap"), 3);
});

test("recheckSection: 로드맵 표에 보고서 연도를 넣고(모양 바꾸기 뒤), 로드맵이 없으면 블록을 그대로 둠", () => {
  const spec = (blocks: Block[]): ReportSectionSpec => ({ version: 3, card: { id: "x", taskNo: "1-가", title: "t" }, business: { no: 1, name: "b" }, task: { no: "1-1", title: "t", bp: false }, sub: { mark: "가", title: "제목", markers: [] }, rows: [], results: [], caption: "", blocks, module: 1 });
  const card = { id: "x", taskNo: "1-가", title: "t" };
  const r = recheckSection(spec([road()]), card, "", 2026);
  assert.equal(r.spec.blocks?.[0].year, 2026);
  const plain = spec([blk({ variant: "chevron", items: ITEMS, cells: [cell("x", ["a", "b", "c"])] })]);
  assert.equal(recheckSection(plain, card, "", 2026).spec.blocks, plain.blocks, "로드맵 없음 — 같은 배열");
  assert.equal(recheckSection(spec([road()]), card).spec.blocks?.[0].year, undefined, "연도를 안 주면 넣지 않음");
});

// ---------------------------------------------------------------------------
// 그리기

test("그리기: 쉐브론 머리 + 올해 열 머리 k-road--now·칸 k-road__now, 뒤 열 머리 k-road--plan + 「계획」 표지, 앞 열은 보통 쉐브론", () => {
  const h = blocksSampleHtml([road({ year: 2026 })]);
  assert.match(h, /class="k-tbl k-tbl--chev k-tbl--road"/);
  assert.match(
    h,
    /<th scope="col">구분<\/th><th scope="col" class="k-chev"><span><span>Step 1\(’25\) 기반 마련<\/span><\/span><\/th><th scope="col" class="k-chev k-road--now"><span><span>Step 2\(’26\) 확산<\/span><\/span><\/th><th scope="col" class="k-chev k-road--plan"><span><span>Step 3\(’27~\) 고도화 <span class="k-road__plan">계획<\/span><\/span><\/span><\/th>/,
  );
  assert.match(h, /<tr><th scope="row">추진내용<\/th><td>체계 설계<\/td><td class="k-road__now">전국 확산<\/td><td>고도화<\/td><\/tr>/);
  assert.match(h, /<td><\/td><td class="k-road__now">적용 확대<\/td>/, "빈 칸도 자리를 지킴");
  assert.doesNotMatch(h, /k-chev--last/, "로드맵은 마지막 열이 아니라 올해 열을 진하게");
});

test("그리기 가장자리: 보고서 연도 없이 연도 머리면 강조·표지 없음, 연도 없는 머리는 마지막 열이 올해, 머리에 「계획」이 있으면 표지를 겹치지 않음", () => {
  const none = blocksSampleHtml([road()]);
  assert.doesNotMatch(none, /k-road--now|k-road--plan|k-road__plan|k-road__now/);
  const noYear = blocksSampleHtml([road({ items: ["구분", "1단계", "2단계", "3단계"] })]);
  assert.equal((noYear.match(/k-road--now/g) ?? []).length, 1);
  assert.match(noYear, /class="k-chev k-road--now"><span><span>3단계<\/span>/);
  const planned = blocksSampleHtml([road({ year: 2026, items: ["구분", "’25", "’26", "’27 계획"] })]);
  assert.match(planned, /class="k-chev k-road--plan"><span><span>’27 계획<\/span><\/span>/);
  assert.doesNotMatch(planned, /k-road__plan/);
});

// ---------------------------------------------------------------------------
// 판면 어림

test("판면 어림: 로드맵 열 폭·높이는 쉐브론 셈 + 계획 열 머리의 「계획」 표지 폭 — 그리기와 같은 판정, 계획 열이 없으면 쉐브론과 같음", () => {
  const w = blockWidth({ label: "전체 로드맵", kind: "table" });
  const r = road({ label: "전체 로드맵", year: 2026 });
  const chev = { ...r, variant: "chevron" };
  const noPlan = { ...r, year: undefined };
  assert.deepEqual(tableColsMm(noPlan, w), tableColsMm(chev, w), "표지가 없으면 열 폭이 쉐브론과 같음");
  assert.equal(blockHeight(noPlan, w), blockHeight(chev, w), "높이도 같음");
  assert.deepEqual(slotOf(r, w), slotOf(chev, w), "칸 폭(평균)은 쉐브론과 같음");
  assert.ok(ROADMAP_MARK_PAD_MM > 0 && ROADMAP_MARK_PAD_MM < TABLE_SHAPE_MM.chevronPad);
  // 계획 머리가 열 폭 끝에 걸리면 표지만큼 머리 줄이 늘 수 있음 — 늘 쉐브론보다 낮지 않음
  assert.ok(blockHeight(r, w) >= blockHeight(chev, w));
  const tight = road({ label: "전체 로드맵", year: 2026, items: ["구분", "’25 기반", "’26 확산", "’27 고도화 단계 전면 적용 확대"], cells: [cell("추진내용", ["가", "나", "다"])] });
  assert.ok(blockHeight(tight, w) >= blockHeight({ ...tight, variant: "chevron" }, w));
});

test("판면 어림 기준값: 보통 모양 로드맵(단계·연도 머리 3 · 추진내용·산출·기대 효과 3행, 사다리 칸) — 견본 그림에 올해 열·「계획」 표지가 나옴", () => {
  const b = canonicalBlock("table", "roadmap", defaultCells("table", "roadmap"), "라벨");
  assert.deepEqual(b.items, ["구분", "Step 1(’25)", "Step 2(올해)", "Step 3(’27)"]);
  assert.deepEqual(b.cells.map((c) => c.head), ["추진내용", "산출", "기대 효과"]);
  // 2026-11-09 기준값: 블록 43mm(쉐브론 머리 3행 보통 모양 43mm와 같음 — 표지가 머리 줄 수를 안 바꾸는 길이), 사다리 행 45mm(행 위아래 여백 포함)
  assert.equal(Math.round(blockHeight(b, blockWidth(b))), 43);
  assert.equal(Math.round(blockHeight(canonicalBlock("table", "chevron", 3, "라벨"), blockWidth(b))), 43);
  const f = fitReport({ sub: { title: "제목" }, blocks: [b], results: [], module: 1 });
  assert.equal(f.rows.length, 1);
  assert.equal(Math.round(f.rows[0].mm), 45);
  const h = blocksSampleHtml([canonicalBlock("table", "roadmap", 3, "")]);
  assert.match(h, /k-road--now/);
  assert.match(h, /k-road__plan/);
});

// ---------------------------------------------------------------------------
// 원고(한글 내려받기 개조식)

test("마크다운: 올해 열 머리 뒤 「(올해)」, 계획 열 머리 뒤 「(계획)」 — 연도 모름이면 머리 그대로, 머리에 올해·계획이 있으면 겹치지 않음", () => {
  const spec = (b: Block): ReportSectionSpec => ({ version: 3, card: { id: "x", taskNo: "1-가", title: "t" }, business: { no: 1, name: "b" }, task: { no: "1-1", title: "t", bp: false }, sub: { mark: "가", title: "제목", markers: [] }, rows: [], results: [], caption: "", blocks: [b], module: 1 });
  const md = (b: Block) => sectionMarkdown(spec(b)).md;
  assert.ok(md(road({ year: 2026 })).includes("| 구분 | Step 1(’25) 기반 마련 | Step 2(’26) 확산 (올해) | Step 3(’27~) 고도화 (계획) |"));
  assert.ok(md(road({ year: 2026 })).includes("| 추진내용 | 체계 설계 | 전국 확산 | 고도화 |"));
  assert.ok(md(road()).includes("| 구분 | Step 1(’25) 기반 마련 | Step 2(’26) 확산 | Step 3(’27~) 고도화 |"));
  assert.ok(md(road({ items: ["구분", "1단계", "2단계(올해)", "3단계 계획"] })).includes("| 구분 | 1단계 | 2단계(올해) | 3단계 계획 |"));
  assert.deepEqual(sectionMarkdown(spec(road({ year: 2026 }))).warnings, []);
});
