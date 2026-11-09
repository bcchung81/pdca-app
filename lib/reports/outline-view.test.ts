// 경평 초안 구성안 화면 값(lib/reports/outline-view.ts) 순수 로직 시험: 모양 표(shapeTable), 견본 카탈로그(outlineCatalog),
// 구성안 판면·경고 값(outlineView).

import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCK_KINDS } from "./blocks.ts";
import { type Composition } from "./composition.ts";
import { BIZ_ONLY_SHAPES, FULL_WIDTH_KINDS } from "./frameworks.ts";
import { REPORT_CSS } from "./section-css.ts";
import { outlineCatalog, outlineView, shapeTable } from "./outline-view.ts";

// ---------------------------------------------------------------------------
// shapeTable

test("shapeTable: 42줄(표 모양 4종은 2026-10-12, 진단 ▶ 처방 짝은 2026-10-13, 로드맵 표·단계·시기 모양 4종·사례·협업·표 모양 5종은 2026-11-09, 행렬·재편 매핑도는 2026-11-10), full = FULL_WIDTH_KINDS, unit이 종류대로(compare·table·remap 행, bullets·case 줄, chart 막대, qa 쌍, strategy·matrix 열, 그 밖 칸)", () => {
  const rows = shapeTable();
  assert.equal(rows.length, 42);
  for (const r of rows) assert.equal(r.full, FULL_WIDTH_KINDS.includes(r.kind), r.code);
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
  assert.equal(byCode["compare:table"].unit, "행");
  assert.equal(byCode["table"].unit, "행");
  assert.equal(byCode["bullets"].unit, "줄");
  assert.equal(byCode["case"].unit, "줄");
  assert.equal(byCode["chart"].unit, "막대");
  assert.equal(byCode["qa"].unit, "쌍");
  assert.equal(byCode["cards:plus"].unit, "칸");
  assert.equal(byCode["remap"].unit, "행");
  assert.equal(byCode["matrix"].unit, "열");
  assert.deepEqual([byCode["matrix"].min, byCode["matrix"].max, byCode["matrix"].def], [2, 4, 3]);
  assert.deepEqual([byCode["remap"].min, byCode["remap"].max, byCode["remap"].def], [1, 5, 3]);
});

// ---------------------------------------------------------------------------
// outlineCatalog

test("outlineCatalog: shapes 42개(경영관리는 주요사업 전용 12가지 — 로드맵 표·단계·시기 모양 4종·사례·협업·표 모양 5종·행렬·재편 매핑도 — 를 뺀 30개)·frameworks 21개(20종 + 섞음 — ⑨~⑪은 2026-10-10, ⑫는 2026-10-13, ⑬~⑯은 2026-11-04, ⑰~⑳은 2026-11-09), 섞음을 뺀 틀과 모든 모양의 html이 kca-dg-doc을 담고 비지 않음, css에 REPORT_CSS, 캐시", () => {
  const cat = outlineCatalog();
  assert.equal(cat.shapes.length, 42);
  const mgShapes = outlineCatalog(true).shapes;
  assert.equal(mgShapes.length, 30);
  assert.ok(!mgShapes.some((x) => BIZ_ONLY_SHAPES.includes(x.code)));
  assert.equal(cat.frameworks.length, 21);
  for (const s of cat.shapes) {
    assert.ok(s.html.length > 0, s.code);
    assert.ok(s.html.includes("kca-dg-doc"), s.code);
  }
  for (const f of cat.frameworks) {
    if (f.story === "섞음") continue;
    assert.ok(f.html.length > 0, f.story);
    assert.ok(f.html.includes("kca-dg-doc"), f.story);
  }
  assert.ok(cat.css.includes(REPORT_CSS));
  assert.equal(outlineCatalog(), cat, "두 번 부르면 같은 객체(캐시)");
});

// ---------------------------------------------------------------------------
// outlineView

const composition = (): Composition => ({
  version: 1,
  message: "메시지",
  points: ["논점"],
  story: "단계 전개형",
  storyWhy: "이유",
  alternative: "차선",
  blocks: [
    { kind: "bullets", variant: "", label: "", purpose: "설명", cells: 2, materials: [], figures: [] },
    { kind: "cards", variant: "plain", label: "라벨", purpose: "설명", cells: 3, materials: [], figures: [], by: "human" },
  ],
  results: "결과",
  materials: [],
  memo: "",
});

test("outlineView: 작은 구성안(블록 2개)으로 fit·budgets 길이 = 블록 수, sheetHtml의 data-block이 블록 수만큼, shapeNames, human 수, avail 키가 BLOCK_KINDS 전부", () => {
  const c = composition();
  const v = outlineView(c, 1, "all");
  assert.equal(typeof v.fit.total, "number");
  assert.equal(typeof v.fit.budget, "number");
  assert.equal(v.budgets.length, c.blocks.length);
  assert.equal(v.shapeNames.length, c.blocks.length);
  const dataBlocks = [...v.sheetHtml.matchAll(/data-block="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(new Set(dataBlocks).size, c.blocks.length, "블록마다 data-block");
  assert.equal(v.human, 1, "by human인 블록 수");
  assert.deepEqual(Object.keys(v.avail).sort(), [...BLOCK_KINDS].sort());
});
