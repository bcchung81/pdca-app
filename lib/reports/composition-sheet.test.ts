// 경평 초안 「구성안 판면」(lib/reports/composition-sheet.ts) 시험: 블록 상자 높이 = 높이 예산, 행 끝 막대는 앞 행 오른쪽 칸,
// 그림 자리 크기, 쉬운 모양 이름, 이스케이프

import assert from "node:assert/strict";
import { test } from "node:test";
import { type Figure, figureMm } from "./blocks.ts";
import { type Composition, type PlanBlock, blockBudgets } from "./composition.ts";
import { SHAPE_NAMES, compositionSheetHtml, shapeCode, shapeName, sheetParts } from "./composition-sheet.ts";
import { PAGE_MM, frameHeight } from "./fit.ts";

const planBlock = (over: Partial<PlanBlock> = {}): PlanBlock => ({ kind: "bullets", variant: "", label: "", purpose: "설명", cells: 2, materials: [], figures: [], ...over });
const comp = (blocks: PlanBlock[], over: Partial<Composition> = {}): Composition => ({ version: 1, message: "", points: [], story: "단계 전개형", storyWhy: "", alternative: "", blocks, results: "결과 방향", materials: [], memo: "", ...over });
const photo: Figure = { kind: "photo", size: "M", pos: "right", desc: "현장 점검 사진" };

test("shapeName: 쉬운 이름(모양이 비면 그 종류의 첫째 모양), 모르는 코드는 그대로", () => {
  assert.equal(shapeName("bullets", ""), "불릿");
  assert.equal(shapeName("timeline", ""), "연도 흐름", "timeline 첫째 모양 chevron");
  assert.equal(shapeName("compare", "table"), "전후 비교 표");
  assert.equal(shapeName("cards", "vs"), "대비 2칸(VS)");
  assert.equal(shapeCode("steps", ""), "steps:row");
  assert.equal(shapeName("nope", "x"), "nope:x");
  // 블록 사전의 모든 종류에 이름이 있음
  for (const k of ["bullets", "hub", "voices", "define", "band", "banner", "quotes", "case", "chart", "subhead", "stats", "qa", "table"]) assert.ok(SHAPE_NAMES[k], k);
});

test("compositionSheetHtml: 블록 상자 높이 = 높이 예산(mm), 제목부·추진성과 = frameHeight, 판면 끝 선 = 모듈 × 255mm", () => {
  const c = comp([planBlock({ kind: "bullets", label: "추진배경", cells: 2 }), planBlock({ kind: "compare", variant: "table", label: "추진내용", cells: 3 }), planBlock({ kind: "quotes", cells: 1 })]);
  const html = compositionSheetHtml(c, 1);
  const budgets = blockBudgets(c, 1);
  const heights = [...html.matchAll(/data-block="(\d+)" style="height:([\d.]+)mm"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(
    heights.map(([i]) => i),
    [0, 1, 2],
  );
  heights.forEach(([i, h]) => assert.ok(Math.abs(h - Math.max(8, budgets[i])) < 0.06, `블록 ${i}: ${h} ≈ ${budgets[i]}`));
  const p = sheetParts(c, 1);
  assert.ok(Math.abs(p.head - frameHeight("가".repeat(38), [], 0)) < 1e-9);
  assert.ok(p.result > 10, "불릿 2줄 추진성과 상자");
  assert.match(html, new RegExp(`top:${PAGE_MM.height}mm`), "판면 끝 선");
  assert.match(html, /class="cs-label">추진배경</);
  assert.match(html, /cs-box cs-box--full" data-block="2"/, "인용 상자는 전폭");
  assert.match(html, /전후 비교 표<span> · 행 3/);
});

test("compositionSheetHtml: 앞 블록과 라벨이 같은 막대(예산 0)는 앞 행 오른쪽 칸(data-block은 막대 순번), 같은 라벨이 이어지면 라벨 칸을 비움", () => {
  const c = comp([planBlock({ kind: "steps", variant: "row", label: "추진내용", cells: 3 }), planBlock({ kind: "chart", label: "추진내용", cells: 3 }), planBlock({ kind: "cards", variant: "plain", label: "추진내용", cells: 3 })]);
  assert.equal(blockBudgets(c, 1)[1], 0, "행 끝 막대는 예산 0");
  const html = compositionSheetHtml(c, 1);
  assert.match(html, /<div class="cs-chart" data-block="1">/);
  assert.equal((html.match(/data-block="1"/g) ?? []).length, 1);
  assert.match(html, /cs-box cs-cont" data-block="2"[^>]*><div class="cs-label"><\/div>/, "이어지는 같은 라벨은 빈 라벨 칸");
});

test("compositionSheetHtml: 그림 자리는 figureMm 크기 빗금 칸, 모든 글은 이스케이프, 머리 모드는 제목부를 줄임", () => {
  const c = comp([planBlock({ kind: "bullets", label: "배경<b>", purpose: "보여 줄 것 <script>", figures: [photo] })], { results: "결과 & 방향" });
  const html = compositionSheetHtml(c, 0.5);
  const { w, h } = figureMm(photo);
  assert.match(html, new RegExp(`class="cs-fig" style="width:${w}mm;height:${h}mm"`));
  assert.match(html, /배경&lt;b&gt;/);
  assert.match(html, /보여 줄 것 &lt;script&gt;/);
  assert.match(html, /결과 &amp; 방향/);
  assert.doesNotMatch(html, /<script>|<b>/);
  assert.ok(sheetParts(c, 0.5, "sub").head < sheetParts(c, 0.5, "all").head, "제목만이면 제목부가 낮음");
  assert.match(compositionSheetHtml(c, 0.5, "sub"), /<div class="cs-head" style="height:[\d.]+mm"><span class="cs-kind">소항목 제목\(가\.\)<\/span>/, "제목부 상자 안 글");
});
