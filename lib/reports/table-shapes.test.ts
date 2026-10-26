// 표 모양 4종(table의 variant — 2026-10-12)과 모양 다양성 시험.
// 근거: 2025 경영관리 보고서에 자주 나오는데 앱에 없던 표(분석 docs/analysis/2025-경영관리-경영실적보고서-분석.md 「블록 어휘 수준」 표) —
// result(오른쪽 「추진실적」 칸, MG-3·5·11·13) · bars(표 칸 안 막대, MG-11·14) · chevron(쉐브론 머리, MG-5·11) · ladder(2단 라벨, MG-13·14).
// 기존 블록·모양의 HTML·판면 어림은 바이트까지 그대로여야 함(작업 중 평가 초안 101건 + 견본 25개로 전후 대조 — 여기서는 기본 표가 예전 모양 그대로인지만 고정).

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Block, type BlockOutput, VARIANTS, blockBullets, blockSignature, cleanBlocks, isGridTable, ladderGroups, tableBars } from "./blocks.ts";
import { verifyBlockEdit } from "./block-edit.ts";
import { applyDraftText } from "./draft-text.ts";
import { BIZ_VARIETY, bizVarietyIssue, diagramHints, mgVarietyIssues, shapeKeyOf, shapeVariety } from "./diagram-hints.ts";
import { shapeStats } from "./eval-stats.ts";
import { TABLE_SHAPE_MM, blockHeight, blockWidth, canonicalBlock, fitReport, slotOf, tableShapeCosts } from "./fit.ts";
import { SHAPES, cellRange, defaultCells, shapeCode, shapeName } from "./frameworks.ts";
import { unclosedPartKeys } from "./mg-outline.ts";
import type { ReportSectionSpec } from "./section.ts";
import { blocksSampleHtml, sectionHtml } from "./section-html.ts";

const out = (b: Omit<Partial<BlockOutput>, "kind"> & { kind: any }): BlockOutput => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as BlockOutput;
const cell = (head: string, bullets: string[] = [], tag = "", note = "") => ({ head, tag, bullets, note });
const line = (s: unknown, max = 400) => String(s ?? "").trim().slice(0, max);
const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const clean = (...xs: BlockOutput[]) => cleanBlocks(xs, line, () => true).blocks;

// ---------------------------------------------------------------------------
// 모양 목록·짜임 사전

test("VARIANTS.table: 첫째는 빈 글(예전 표 그대로) + result·bars·chevron·ladder, 모양 코드·이름·칸 범위", () => {
  assert.deepEqual(VARIANTS.table, ["", "result", "bars", "chevron", "ladder"]);
  assert.equal(shapeCode("table", ""), "table", "기본 표는 예전처럼 kind만");
  assert.equal(blockSignature([blk("table"), blk("table", { variant: "bars" })]), "table → table:bars");
  for (const v of ["result", "bars", "chevron", "ladder"]) {
    const s = SHAPES.find((x) => x.code === `table:${v}`);
    assert.ok(s, v);
    assert.equal(s!.group, "base", "기본 도식(근거 조건 없음)");
    assert.equal(shapeName("table", v), s!.name);
  }
  assert.deepEqual(cellRange("table", "result"), { min: 1, max: 4 });
  assert.deepEqual(cellRange("table", "chevron"), { min: 1, max: 4 });
  assert.deepEqual(cellRange("table", "ladder"), { min: 2, max: 6 });
  assert.deepEqual(cellRange("table", "bars"), { min: 2, max: 6 });
  assert.equal(defaultCells("table", "result"), 2);
  assert.equal(defaultCells("table", "ladder"), 4);
  assert.equal(defaultCells("table", ""), 3);
  assert.ok(isGridTable(blk("table")) && isGridTable(blk("table", { variant: "bars" })) && isGridTable(blk("table", { variant: "chevron" })));
  assert.ok(!isGridTable(blk("table", { variant: "result" })) && !isGridTable(blk("table", { variant: "ladder" })) && !isGridTable(blk("cards")));
});

// ---------------------------------------------------------------------------
// 정리(cleanBlocks)

test("cleanBlocks: 모르는 표 모양은 빈 글(예전 그대로), bars·chevron은 머리 줄 + 값 열(쉐브론 값은 120자까지)", () => {
  const long = "가".repeat(100);
  const [x, b, c] = clean(
    out({ kind: "table", variant: "grid", items: ["구분", "’25", "’26"], cells: [cell("가", ["1건", "2건"]), cell("나", ["3건", "4건"])] }),
    out({ kind: "table", variant: "bars", items: ["구분", "’25", "’26"], cells: [cell("가", ["1건", "2건"]), cell("나", ["3건", "4건"])] }),
    out({ kind: "table", variant: "chevron", items: ["구분", "현황", "개선방향", "적용 결과"], cells: [cell("측정", [long, "b", "c"])] }),
  );
  assert.equal(x.variant, "");
  assert.equal(b.variant, "bars");
  assert.deepEqual(b.cells[1].bullets, ["3건", "4건"]);
  assert.equal(c.variant, "chevron");
  assert.equal(c.cells.length, 1, "쉐브론은 1행도 됨");
  assert.equal(c.cells[0].bullets[0].length, 100, "기본 표(60자)보다 길게");
  assert.equal(clean(out({ kind: "table", items: ["구분", "a", "b"], cells: [cell("x", [long, "y"]), cell("z", ["1", "2"])] }))[0].cells[0].bullets[0].length, 60, "기본 표 값은 예전처럼 60자");
});

test("cleanBlocks result: 왼쪽 행 4개까지(불릿 없는 행 뺌)·큰 수치 2개까지·items 비움, 결과가 없으면 칸 도식(2행↑)이나 불릿으로", () => {
  const [r] = clean(
    out({ kind: "table", variant: "result", items: ["무시"], cells: [cell("가", ["a"]), cell("빈", []), cell("나", ["b"]), cell("다", ["c"]), cell("라", ["d"]), cell("마", ["e"])], series: [{ label: "배정", value: "20건" }, { label: "항목", value: "11개" }, { label: "셋째", value: "3개" }], text: "전수 완료" }),
  );
  assert.equal(r.variant, "result");
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.cells.map((c) => c.head), ["가", "나", "다", "라"]);
  assert.deepEqual(r.series.map((s) => s.value), ["20건", "11개"]);
  const [cards, bullets] = clean(out({ kind: "table", variant: "result", cells: [cell("가", ["a"]), cell("나", ["b"])] }), out({ kind: "table", variant: "result", cells: [cell("가", ["a", "b"])] }));
  assert.equal(`${cards.kind}:${cards.variant}`, "cards:plain");
  assert.equal(bullets.kind, "bullets");
  assert.deepEqual(bullets.items, ["a", "b"]);
  assert.equal(clean(out({ kind: "table", variant: "result", cells: [cell("가", ["a"])], text: "결과 줄만" }))[0].variant, "result", "결과 줄만 있어도 됨");
});

test("cleanBlocks ladder: 행 6개까지(내용 없는 행 뺌)·items 비움, 2행 미만이면 뺌", () => {
  const rows = Array.from({ length: 8 }, (_, i) => cell(i < 4 ? "① 관리" : "② 운영", [`내용 ${i}`], `①-${i}`));
  const [l] = clean(out({ kind: "table", variant: "ladder", items: ["x", "y", "z"], cells: [...rows.slice(0, 2), cell("빈", [], "t"), ...rows.slice(2)] }));
  assert.equal(l.cells.length, 6);
  assert.deepEqual(l.items, []);
  assert.equal(clean(out({ kind: "table", variant: "ladder", cells: [cell("① 하나", ["a"])] })).length, 0);
});

test("ladderGroups: 이어진 같은 큰 라벨·빈 글은 한 칸, 다시 나오면 새 칸", () => {
  assert.deepEqual(ladderGroups([cell("① 관리"), cell(""), cell("① 관리"), cell("② 운영"), cell("① 관리")]), [
    { head: "① 관리", start: 0, rows: 3 },
    { head: "② 운영", start: 3, rows: 1 },
    { head: "① 관리", start: 4, rows: 1 },
  ]);
});

test("blockBullets: 추진실적 열·2단 라벨 표의 불릿은 문체 점검 대상, 값 열 표는 예전처럼 빠짐", () => {
  assert.deepEqual(blockBullets(blk("table", { variant: "result", cells: [cell("가", ["문장 하나"])] })), ["문장 하나"]);
  assert.deepEqual(blockBullets(blk("table", { variant: "ladder", cells: [cell("가", ["문장 둘"])] })), ["문장 둘"]);
  assert.deepEqual(blockBullets(blk("table", { variant: "bars", items: ["a", "b", "c"], cells: [cell("x", ["1건", "2건"])] })), []);
});

// ---------------------------------------------------------------------------
// 막대 길이(코드가 셈)

test("tableBars: 같은 행·같은 단위끼리 가장 큰 값에 견줌, 수치 아님·단위 하나뿐·음수·0·자리표시는 막대 없음", () => {
  assert.deepEqual(tableBars(["46.8%", "50%"]), [93.6, 100]);
  assert.deepEqual(tableBars(["900시간", "1,000시간"]), [90, 100], "쉼표");
  assert.deepEqual(tableBars(["(신규)", "65%"]), [null, null], "수치가 아닌 칸이 있으면 같은 단위 값이 하나뿐 → 막대 없음");
  assert.deepEqual(tableBars(["12건", "30%", "24건"]), [50, null, 100], "단위가 다른 값은 따로(30%는 혼자)");
  assert.deepEqual(tableBars(["-3건", "△2건", "0건", "4건"]), [null, null, null, null], "음수·0은 막대 없음 → 남은 4건 혼자");
  assert.deepEqual(tableBars(["【확인: ’26 실적】", "10건", "20건"]), [null, 50, 100]);
  assert.deepEqual(tableBars(["12건 → 20건", "10건"]), [null, null], "괄호 밖에 수치가 둘이면 한 값이 아님");
  assert.deepEqual(tableBars(["10건(↑20%)", "**20건**", "^{’25}5건"]), [50, 100, 25], "괄호 속 수치·강조·위첨자 시점은 거름");
  assert.deepEqual(tableBars(["약 3만국", "6만국"]), [50, 100], "「약」 + 한글 단위");
  assert.deepEqual(tableBars([]), []);
});

// ---------------------------------------------------------------------------
// 그리기

test("기본 표 HTML은 예전 모양 그대로(class k-tbl, 막대·쉐브론 표지 없음)", () => {
  const h = blocksSampleHtml([blk("table", { items: ["구분", "’25", "’26"], cells: [cell("건수", ["10건", "20건"]), cell("비율", ["1%", "2%"])] })]);
  assert.match(h, /<table class="k-tbl"><colgroup><col style="width:20\.00%"><col style="width:40\.00%"><col style="width:40\.00%"><\/colgroup><thead><tr><th scope="col">구분<\/th>/);
  assert.match(h, /<tr><th scope="row">건수<\/th><td>10건<\/td><td>20건<\/td><\/tr>/);
  assert.doesNotMatch(h, /k-barc|k-chev|k-res|k-lad/);
});

test("bars: 막대가 되는 칸만 k-barc(너비 %), 수치가 아닌 칸은 예전 칸 그대로", () => {
  const h = blocksSampleHtml([blk("table", { variant: "bars", items: ["지표", "’25", "’26"], cells: [cell("단축률", ["46.8%", "50%"]), cell("자동화율", ["(신규)", "65%"])] })]);
  assert.match(h, /class="k-tbl k-tbl--bars"/);
  assert.match(h, /<span class="k-barc__v">46\.8%<\/span><span class="k-barc__t" aria-hidden="true"><span class="k-barc__b" style="width:93\.6%"><\/span><\/span>/);
  assert.match(h, /style="width:100%"/);
  assert.match(h, /<td>\(신규\)<\/td><td>65%<\/td>/);
});

test("chevron: 값 열 머리마다 k-chev(마지막은 k-chev--last), 첫 머리(행 머리 열)는 보통 머리", () => {
  const h = blocksSampleHtml([blk("table", { variant: "chevron", items: ["구분", "현황", "개선방향", "적용 결과"], cells: [cell("측정", ["설문", "실측", "재산출"])] })]);
  assert.match(h, /class="k-tbl k-tbl--chev"/);
  assert.match(h, /<th scope="col">구분<\/th><th scope="col" class="k-chev"><span>현황<\/span><\/th><th scope="col" class="k-chev"><span>개선방향<\/span><\/th><th scope="col" class="k-chev k-chev--last"><span>적용 결과<\/span><\/th>/);
});

test("result: 오른쪽 결과 칸 하나가 모든 행에 걸침(rowspan) — 머리 「추진실적」·큰 수치·뜻·결과 줄, 행 머리가 없으면 행 머리 열도 없음", () => {
  const b = blk("table", { variant: "result", cells: [cell("측정기준", ["a"]), cell("로그", ["b", "c"])], series: [{ label: "유형 배정", value: "20건" }], text: "전수 완료" });
  const h = blocksSampleHtml([b]);
  assert.match(h, /class="k-tbl k-tbl--res"/);
  assert.match(h, /<td class="k-res__r" rowspan="2"><p class="k-res__h">추진실적<\/p><p class="k-res__v">20건<\/p><p class="k-res__l">유형 배정<\/p><p class="k-res__t">전수 완료<\/p><\/td>/);
  assert.equal((h.match(/k-res__r/g) ?? []).length, 1);
  assert.match(h, /<th scope="row">측정기준<\/th>/);
  const noHead = blocksSampleHtml([{ ...b, cells: [cell("", ["a"])] }]);
  assert.doesNotMatch(noHead, /<th scope="row">/);
  assert.match(noHead, /rowspan="1"/);
});

test("ladder: 큰 라벨은 묶음마다 한 칸(rowspan), 하위 라벨 열은 tag가 있을 때만", () => {
  const b = blk("table", { variant: "ladder", cells: [cell("① 관리", ["a"], "①-1"), cell("", ["b"], "①-2"), cell("② 운영", ["c"], "②-1")] });
  const h = blocksSampleHtml([b]);
  assert.match(h, /class="k-tbl k-tbl--lad"/);
  assert.match(h, /<th scope="rowgroup" class="k-lad__g" rowspan="2">① 관리<\/th><th scope="row" class="k-lad__s">①-1<\/th>/);
  assert.match(h, /<th scope="rowgroup" class="k-lad__g">② 운영<\/th>/);
  assert.equal((h.match(/k-lad__g"/g) ?? []).length, 2);
  assert.doesNotMatch(blocksSampleHtml([{ ...b, cells: b.cells.map((c) => ({ ...c, tag: "" })) }]), /k-lad__s/);
});

// ---------------------------------------------------------------------------
// 두 번 눌러 고치기(직접 고치기) — 새 칸 글도 표지·허용 경로

const spec = (blocks: Block[]): ReportSectionSpec =>
  ({ version: 3, card: { id: "c", taskNo: "1-가", title: "과제" }, business: { no: 1, name: "b" }, task: { no: "1-1", title: "t", bp: false }, sub: { mark: "가", title: "제목", markers: [] }, rows: [], results: [], resultCards: [], caption: "", module: 1, blocks }) as unknown as ReportSectionSpec;

test("직접 고치기: 새 표 모양의 칸 글에 표지(data-t)가 달리고 applyDraftText가 받음 — 큰 수치(series)는 추진실적 열 표에서만", () => {
  const s = spec([
    blk("table", { variant: "result", cells: [cell("구분", ["내용"])], series: [{ label: "뜻", value: "20건" }], text: "결과" }),
    blk("table", { variant: "ladder", cells: [cell("① 관리", ["a"], "①-1"), cell("", ["b"], "①-2")] }),
    blk("table", { variant: "bars", items: ["구분", "’25", "’26"], cells: [cell("x", ["10건", "20건"])] }),
    blk("chart", { title: "건수", series: [{ label: "’25", value: "10" }, { label: "’26", value: "20" }] }),
  ]);
  const h = sectionHtml(s, [], { editMarks: true });
  for (const p of ["blocks.0.series.0.value", "blocks.0.series.0.label", "blocks.0.text", "blocks.0.cells.0.bullets.0", "blocks.1.cells.0.head", "blocks.1.cells.1.tag", "blocks.1.cells.1.bullets.0", "blocks.2.cells.0.bullets.1"]) assert.match(h, new RegExp(`data-t="${p.replace(/\./g, "\\.")}"`), p);
  const ok = applyDraftText(s, { path: "blocks.0.series.0.value", text: "21건" });
  assert.ok(ok.ok && ok.changed && ok.blockIndex === 0);
  assert.equal(ok.ok && ok.spec.blocks![0].series[0].value, "21건");
  assert.ok(applyDraftText(s, { path: "blocks.1.cells.1.tag", text: "①-2 전환" }).ok);
  const chart = applyDraftText(s, { path: "blocks.3.series.0.value", text: "99" });
  assert.equal(chart.ok, false, "막대(chart) 값은 여기서 못 바꿈");
});

// ---------------------------------------------------------------------------
// 판면 어림

test("slotOf: 막대 표는 값 글이 막대 칸만큼 좁고, 쉐브론 머리는 화살표 여백만큼 머리가 좁고, 추진실적 열·2단 라벨은 열 폭대로", () => {
  const w = 150;
  const grid = blk("table", { items: ["a", "b", "c"], cells: [cell("x", ["1", "2"])] });
  const g = slotOf(grid, w);
  assert.equal(Math.round((g.body - slotOf({ ...grid, variant: "bars" }, w).body) * 10) / 10, TABLE_SHAPE_MM.bar + TABLE_SHAPE_MM.barGap);
  assert.ok(slotOf({ ...grid, variant: "chevron" }, w).head < g.head);
  assert.equal(slotOf({ ...grid, variant: "chevron" }, w).body, g.body, "쉐브론 값 칸은 기본과 같음");
  const res = blk("table", { variant: "result", cells: [cell("구분", ["a"])] });
  assert.ok(slotOf(res, w).body < slotOf({ ...res, cells: [cell("", ["a"])] }, w).body, "행 머리 열이 있으면 좁음");
  const lad = blk("table", { variant: "ladder", cells: [cell("가", ["a"], "t"), cell("", ["b"])] });
  assert.ok(slotOf(lad, w).body < slotOf({ ...lad, cells: lad.cells.map((c) => ({ ...c, tag: "" })) }, w).body, "하위 라벨 열이 있으면 좁음");
});

test("blockHeight result: 왼쪽 행 합과 오른쪽 결과 칸 중 큰 것 — 큰 수치가 늘면(행이 짧을 때) 높아지고, 행 글이 길면 왼쪽이 정함", () => {
  const w = blockWidth({ label: "추진내용", kind: "table" });
  const base = blk("table", { label: "추진내용", variant: "result", cells: [cell("", ["짧게"])], series: [{ label: "뜻", value: "20건" }] });
  const one = blockHeight(base, w);
  const two = blockHeight({ ...base, series: [...base.series, { label: "뜻", value: "11개" }] }, w);
  assert.ok(two > one, "오른쪽이 정할 때 큰 수치 하나가 더해지면 높아짐");
  const longLeft = { ...base, cells: Array.from({ length: 4 }, () => cell("", ["가".repeat(120)])) };
  assert.equal(blockHeight({ ...longLeft, series: [...base.series, { label: "뜻", value: "11개" }] }, w), blockHeight(longLeft, w), "왼쪽이 더 높으면 오른쪽 칸은 높이를 안 바꿈");
  assert.ok(blockHeight({ ...base, text: "결과 한 줄" }, w) > one);
});

test("blockHeight ladder·chevron·bars: 큰 라벨이 행보다 길면 그 높이, 쉐브론 머리는 기본 머리보다 높거나 같음, 막대 표는 좁은 값 칸에서 줄이 늘 수 있음", () => {
  const w = blockWidth({ label: "추진체계", kind: "table" });
  const lad = blk("table", { label: "추진체계", variant: "ladder", cells: [cell("① 관리", ["a"], "①-1"), cell("", ["b"], "①-2")] });
  const h = blockHeight(lad, w);
  assert.ok(h > 0);
  assert.ok(blockHeight({ ...lad, cells: [{ ...lad.cells[0], head: "가".repeat(40) }, lad.cells[1]] }, w) > h, "큰 라벨이 길어 여러 줄");
  const grid = blk("table", { label: "a", items: ["구분", "현황", "개선방향"], cells: [cell("x", ["가", "나"]), cell("y", ["다", "라"])] });
  assert.ok(blockHeight({ ...grid, variant: "chevron" }, w) >= blockHeight(grid, w));
  const longVal = { ...grid, cells: grid.cells.map((c) => ({ ...c, bullets: c.bullets.map(() => "1,234,567건(전년 대비 증가)") })) };
  assert.ok(blockHeight({ ...longVal, variant: "bars" }, w) >= blockHeight(longVal, w));
});

test("canonicalBlock·fitReport·tableShapeCosts: 네 모양 모두 보통 모양으로 어림이 되고 견본 그림이 비지 않음", () => {
  for (const v of ["result", "bars", "chevron", "ladder"]) {
    const b = canonicalBlock("table", v, defaultCells("table", v), "라벨");
    assert.equal(b.variant, v);
    const r = fitReport({ sub: { title: "제목" }, blocks: [b], results: [], module: 1 });
    assert.ok(r.total > 0 && r.rows.length === 1, v);
    assert.match(blocksSampleHtml([canonicalBlock("table", v, defaultCells("table", v), "")]), /k-tbl/);
    const thick = canonicalBlock("table", v, defaultCells("table", v), "라벨", [], 3);
    assert.ok(blockHeight(thick, blockWidth(thick)) > blockHeight(b, blockWidth(b)) - 0.01, `${v}: 줄을 채우면 낮아지지 않음`);
  }
  assert.match(tableShapeCosts(), /table:result 2행.*\d+mm · table:bars 3행 \d+mm · table:chevron 2행.*\d+mm · table:ladder 4행.*\d+mm/);
});

// ---------------------------------------------------------------------------
// 블록 고치기·닫기

test("verifyBlockEdit: AI가 표 모양을 빠뜨리거나 다른 칸 갈래로 바꾸면 원래 모양을 지킴, 같은 갈래 안(기본 → 막대)은 받음", () => {
  const before = blk("table", { variant: "result", cells: [cell("가", ["a"])], series: [{ label: "뜻", value: "20건" }] });
  const r = verifyBlockEdit(before, out({ kind: "table", variant: "", cells: [cell("가", ["고친 글"])], series: [{ label: "뜻", value: "20건" }] }), line, () => true);
  assert.ok(r.ok && r.block.variant === "result" && r.block.cells[0].bullets[0] === "고친 글");
  const grid = blk("table", { items: ["구분", "’25", "’26"], cells: [cell("x", ["1건", "2건"]), cell("y", ["3건", "4건"])] });
  const g = verifyBlockEdit(grid, out({ kind: "table", variant: "bars", items: grid.items, cells: grid.cells }), line, () => true);
  assert.ok(g.ok && g.block.variant === "bars");
  const bad = verifyBlockEdit(grid, out({ kind: "table", variant: "모름", items: grid.items, cells: grid.cells }), line, () => true);
  assert.ok(bad.ok && bad.block.variant === "");
});

test("성과로 닫기: 추진실적 열 표(table:result)는 라벨과 상관없이 「추진실적」 닫기 — 엄격 지표(마지막 라벨 「추진성과」)는 그대로", () => {
  const parts = [{ key: "1.1.가", evalNo: 1, evalTitle: "", themeNo: 1, themeTitle: "", mark: "가", title: "", story: "" as const, why: "" }];
  assert.deepEqual(unclosedPartKeys(parts, [{ at: "1.1.가", label: "추진내용", kind: "table", variant: "result" }]), []);
  assert.deepEqual(unclosedPartKeys(parts, [{ at: "1.1.가", label: "추진내용", kind: "table", variant: "" }]), ["1.1.가"]);
  assert.deepEqual(unclosedPartKeys(parts, [{ at: "1.1.가", label: "추진내용", kind: "table", variant: "result" }], true), ["1.1.가"]);
});

// ---------------------------------------------------------------------------
// 도식 후보 신호(경영관리만). 카드 43장 실측(2026-10-12, 스크래치 덤프 — 카드 글 + 추천 평가내용의 2025 절 글, 실제 diagramHints):
// table:result 8장 · table:bars 9장 · table:chevron 6장 · table:ladder 4장, 넷 중 하나 이상 21장. 예전 PDCA 신호처럼 넓어지지 않게 좁힌 근거:
// result는 2025 글 신호만 보면 23장(→ 이 카드 정량 성과 수치 2가지 이상을 더함), bars는 2025 글까지 보면 38장(→ 카드·첨부 글만)

const mg = (extra: string) => ({ track: "mg" as const, extraTexts: [extra] });
const kinds = (text: string, extra = "") => diagramHints(text, {}, mg(extra)).map((h) => h.kind);

test("신호 result: 2025 글의 오른쪽 「추진실적」 칸 + 카드 정량 성과 수치 2가지 — 「구분 | 추진내용 | 추진실적」 같은 보통 머리 줄은 아님", () => {
  const card = "outcome.quantitative.0 | ∙ 측정 유형 배정 20건, 공통 로그 11개 항목";
  assert.ok(kinds(card, "보안성 해결 | 심사자료 AI 자동 제작 | 추진실적").includes("table:result"));
  assert.ok(kinds(card, "가. 절\n추진실적\n∙ 내용").includes("table:result"), "혼자 선 「추진실적」 줄");
  assert.ok(!kinds(card, "구분 | 추진내용 | 추진실적").includes("table:result"), "보통 구분표 머리");
  assert.ok(!kinds("outcome.quantitative.0 | ∙ 20건 완료", "보안성 | 추진실적").includes("table:result"), "정량 성과 수치가 하나뿐");
  assert.ok(!diagramHints(card + "\n보안성 | 추진실적").some((h) => h.kind.startsWith("table:")), "주요사업은 표 모양 신호 없음");
});

test("신호 bars: 카드 한 줄에 연도 둘 + 같은 단위 수치 둘(2025 글은 안 봄)", () => {
  assert.ok(kinds("outcome.quantitative.0 | ∙ ’25년 13명 → ’26년 14명").includes("table:bars"));
  assert.ok(!kinds("outcome.quantitative.0 | ∙ ’26년 14명 목표").includes("table:bars"), "연도 하나");
  assert.ok(!kinds("do.lines.0 | ’25년 3회 → ’26년 40%").includes("table:bars"), "단위가 다름");
  assert.ok(!kinds("x", "’25년 13명 → ’26년 14명").includes("table:bars"), "2025 글만 있으면 아님");
});

test("신호 chevron: 한 줄에 짧은 단계 머리 칸 셋 이상", () => {
  assert.ok(kinds("x", "구분 | 현황 | 개선방향 | 적용 결과 | 탄소감축 효과").includes("table:chevron"));
  assert.ok(kinds("x", "구분 | 추진 배경 | 협의 과정 | 현장의 목소리를 담은 복지제도 신설").includes("table:chevron"));
  assert.ok(!kinds("x", "현황 및 개선방향을 검토하고 적용 결과를 정리").includes("table:chevron"), "칸으로 나뉘지 않은 문장");
  assert.ok(!kinds("x", "구분 | 추진내용 | 추진실적").includes("table:chevron"));
});

test("신호 ladder: 하위 번호(①-1·①-2 …)가 둘 이상", () => {
  assert.ok(kinds("x", "① 관리 | ①-1 점검 | ①-2 전환").includes("table:ladder"));
  assert.ok(!kinds("x", "① 관리 | ①-1 점검").includes("table:ladder"));
  assert.ok(!kinds("① 측정기준 정립 | ② 로그 인프라").includes("table:ladder"), "번호만 있고 하위 번호 없음");
});

// ---------------------------------------------------------------------------
// 모양 다양성(경고만 — 고치기 사유·점수에는 안 넣음)

const sh = (code: string) => ({ kind: code.split(":")[0], variant: code.split(":")[1] ?? "" });

test("shapeVariety·shapeKeyOf: 글·띠를 빼고 셈, 기본 모양은 kind만", () => {
  assert.equal(shapeKeyOf({ kind: "cards", variant: "plus" }), "cards");
  assert.equal(shapeKeyOf({ kind: "table", variant: "" }), "table");
  assert.equal(shapeKeyOf({ kind: "table", variant: "result" }), "table:result");
  assert.deepEqual(shapeVariety(["bullets", "banner", "band", "subhead", "table", "table", "table:bars", "stats"].map(sh)), { counted: 4, distinct: 3 });
});

test("bizVarietyIssue(주요사업): 시각 블록 3개 이상인데 모양이 3가지 미만이면 한 줄, 2개 이하·3가지 이상이면 없음", () => {
  assert.equal(BIZ_VARIETY.min, 3);
  assert.match(bizVarietyIssue(["chart", "chart", "chart", "bullets"].map(sh)) ?? "", /^짜임: 시각 블록 3개의 모양이 1가지뿐/);
  assert.equal(bizVarietyIssue(["compare", "stats", "bullets"].map(sh)), null, "0.5쪽 소항목(시각 블록 2개)");
  assert.equal(bizVarietyIssue(["compare", "stats", "quotes"].map(sh)), null);
});

test("mgVarietyIssues(경영관리): 한 절에 같은 표 모양 둘이면 한 줄(다른 표 모양은 함께 써도 됨), 카드 전체 모양이 절반 이하면 한 줄", () => {
  const parts = [
    { key: "a", name: "가." },
    { key: "b", name: "나." },
  ];
  // 13-4 4회차 짜임(단조롭다고 본 판): 절 가·나에 일반 구분표 둘씩, 글·띠 뺀 8개 중 4가지
  const v4 = ["bullets", "compare:table", "table", "table", "stats", "bullets", "table", "table", "stats", "bullets", "timeline", "bullets"].map(sh);
  const at4 = ["a", "a", "a", "a", "a", "b", "b", "b", "b", "b", "b", "b"];
  const w = mgVarietyIssues(v4, at4, parts);
  assert.equal(w.length, 3);
  assert.match(w[0], /가\.에 같은 표 모양\(table 2개\)/);
  assert.match(w[2], /블록 8개\(불릿·소제목·띠 제외\)의 모양이 4가지뿐/);
  // 13-4 3회차(9종): 경고 없음
  const v3 = ["cards:plain", "banner", "strategy", "table", "stats", "quotes", "compare:table", "steps", "table", "cards:vs", "stats"].map(sh);
  assert.deepEqual(mgVarietyIssues(v3, ["a", "a", "a", "a", "a", "b", "b", "b", "b", "b", "b"], parts), []);
  assert.deepEqual(mgVarietyIssues(["table", "table:result", "table:bars"].map(sh), ["a", "a", "a"], parts), [], "다른 표 모양은 한 절에 함께");
  assert.deepEqual(mgVarietyIssues(["table", "stats", "table"].map(sh), ["a", "b", "b"].slice(0, 3), parts).length, 0, "블록 3개(4개 미만)는 카드 기준을 보지 않음");
});

// ---------------------------------------------------------------------------
// 측정 지표(scripts/eval/shape-stats.ts)

test("shapeStats: 카드별 블록·글·띠 뺀 블록·서로 다른 모양, 세트 엔트로피·상위 3·표 비중·이 과제만의 요소 카드·새 표 모양 수", () => {
  const r = shapeStats([
    { id: "A", blocks: ["bullets", "table", "table:result", "quotes"].map(sh) },
    { id: "B", blocks: ["table", "table", "stats"].map(sh) },
  ]);
  assert.deepEqual(r.cards, [
    { id: "A", blocks: 4, counted: 3, distinct: 3, ratio: 1 },
    { id: "B", blocks: 3, counted: 3, distinct: 2, ratio: 0.667 },
  ]);
  assert.deepEqual(r.frequency, { table: 3, "table:result": 1, quotes: 1, stats: 1 });
  assert.equal(r.tableShare, 0.667);
  assert.equal(r.ownCards, "1/2");
  assert.equal(r.newShapes["table:result"], 1);
  assert.equal(r.newShapes["table:bars"], 0);
  assert.equal(r.avgDistinct, 2.5);
  assert.equal(r.top3Share, 0.833);
  assert.ok(r.entropyBits > 1.7 && r.entropyBits < 1.8);
  assert.equal(shapeStats([]).ownCards, "0/0");
});
