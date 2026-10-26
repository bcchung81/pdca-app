// 타기관 짜임 적용(2026-10-13 — docs/plan/타기관-짜임-적용-계획.md §2.3·§2.5) 시험:
// 전후 비교 새 모양 compare:diag(진단 ▶ 처방 짝 — panels와 같은 마크업·판면 어림, 꼬리표만 다름)와 구성안 「목소리–해법 1:1」 경고.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type Block, type Figure, VARIANTS, cleanBlocks, isPanelCompare } from "./blocks.ts";
import { MG_ONLY_SHAPES, shapeMenu } from "./block-shape.ts";
import { type Composition, type PlanBlock, compositionIssues } from "./composition.ts";
import { blockHeight, blockHeightWithFigures, blockWidth, canonicalBlock, guardFigures, slotOf } from "./fit.ts";
import { SHAPES, cellRange, defaultCells, shapeCode, shapeName } from "./frameworks.ts";
import { blockHtml } from "./section-html.ts";

const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const fig = (pos: Figure["pos"], over: Partial<Figure> = {}): Figure => ({ kind: "photo", desc: "현장 사진", pos, size: "M", ...over });
const rows = [
  { key: "", before: ["접수 창구가 셋으로 나뉘어 민원인이 여러 번 방문"], after: ["온라인 단일 창구로 접수 일원화"] },
  { key: "", before: ["처리 현황을 알 수 없어 문의 반복"], after: ["단계별 처리 알림 제공"] },
];
const pair = (variant: string, x: Partial<Block> = {}) => blk("compare", { variant, items: ["접수 절차가 복잡", "한 번에 접수"], rows, ...x });

// ---------------------------------------------------------------------------
// compare:diag — 모양 목록·사전

test("VARIANTS.compare: 첫째는 table 그대로(모양이 없으면 표 — 기존 출력 불변), diag는 끝에", () => {
  assert.deepEqual(VARIANTS.compare, ["table", "panels", "diag"]);
  assert.equal(shapeCode("compare", ""), "compare:table");
});

test("SHAPES: compare:diag는 기본 도식 「진단 ▶ 처방 짝」, 칸(행) 범위는 다른 전후 비교와 같고 주요사업 「다른 모양」 목록에도 나옴", () => {
  const s = SHAPES.find((x) => x.code === "compare:diag");
  assert.ok(s);
  assert.equal(s!.group, "base");
  assert.equal(shapeName("compare", "diag"), "진단 ▶ 처방 짝");
  assert.deepEqual(cellRange("compare", "diag"), cellRange("compare", "panels"));
  assert.equal(defaultCells("compare", "diag"), defaultCells("compare", "panels"));
  assert.ok(!MG_ONLY_SHAPES.includes("compare:diag"), "두 트랙 공용");
  assert.ok(shapeMenu(false, null).some((m) => m.code === "compare:diag" && m.ok === true));
});

test("cleanBlocks: compare:diag 모양을 그대로 받음(목록 밖이면 첫째 table로 떨어지던 것)", () => {
  const r = cleanBlocks([{ kind: "compare", label: "", title: "", variant: "diag", text: "", items: ["문제", "방향"], cells: [], rows, series: [], badge: "", evidence: "", figures: [] } as never], (s) => String(s ?? "").trim(), () => true);
  assert.equal(r.blocks[0].variant, "diag");
  assert.ok(isPanelCompare(r.blocks[0]));
  assert.ok(isPanelCompare({ kind: "compare", variant: "panels" }));
  assert.ok(!isPanelCompare({ kind: "compare", variant: "table" }));
  assert.ok(!isPanelCompare({ kind: "cards", variant: "diag" }));
});

// ---------------------------------------------------------------------------
// compare:diag — 렌더

test("blockHtml compare:diag: 두 패널 + 가운데 화살표, 꼬리표는 「현황·문제」 ▶ 「추진방향」, 행마다 ➀ ↔ ➊ 번호 짝", () => {
  const html = blockHtml(pair("diag"), new Set());
  assert.match(html, /<div class="k-panels">/);
  assert.match(html, /<span class="k-tag">현황·문제<\/span>/);
  assert.match(html, /<span class="k-tag k-tag--dark">추진방향<\/span>/);
  assert.doesNotMatch(html, /As-Is|To-Be/);
  assert.match(html, /➀<\/span>접수 창구가 셋으로[\s\S]*➁<\/span>처리 현황을[\s\S]*➊<\/span>온라인 단일 창구[\s\S]*➋<\/span>단계별 처리 알림/);
  assert.match(html, /k-panels__arr/, "가운데 화살표");
});

test("blockHtml compare:diag는 panels와 같은 마크업 — 꼬리표 글만 다름(그림 자리 포함), panels 출력은 As-Is/To-Be 그대로", () => {
  const figures = [fig("left"), fig("right"), fig("center", { kind: "illust", size: "L" })];
  for (const x of [{}, { figures }, { figures: [fig("center", { kind: "illust", size: "L" })] }] as Partial<Block>[]) {
    const panels = blockHtml(pair("panels", x), new Set());
    const diag = blockHtml(pair("diag", x), new Set());
    assert.match(panels, /<span class="k-tag">As-Is<\/span>[\s\S]*<span class="k-tag k-tag--dark">To-Be<\/span>/);
    assert.equal(diag.replace(">현황·문제<", ">As-Is<").replace(">추진방향<", ">To-Be<"), panels);
    assert.doesNotMatch(diag, /k-figrow/, "그림은 패널 안·가운데에(블록 옆으로 빼지 않음 — panels와 같음)");
  }
});

test("blockHtml compare:diag: 요지(items) 앞에 꼬리표 글을 또 적었으면 떼고 그림(꼬리표와 겹치지 않게)", () => {
  const html = blockHtml(pair("diag", { items: ["현황·문제: 접수 절차가 복잡", "추진방향 - 한 번에 접수"] }), new Set());
  assert.match(html, /현황·문제<\/span>접수 절차가 복잡/);
  assert.match(html, /추진방향<\/span>한 번에 접수/);
});

// ---------------------------------------------------------------------------
// compare:diag — 판면 어림(panels와 같은 높이·폭 규칙)

test("판면 어림: compare:diag는 panels와 같은 칸 폭·높이(그림 자리·막대 행 지킴이 포함)", () => {
  const p = pair("panels");
  const d = pair("diag");
  assert.deepEqual(slotOf(d, blockWidth(d)), slotOf(p, blockWidth(p)));
  assert.equal(blockHeight(d, 150), blockHeight(p, 150));
  const figures = [fig("left"), fig("right")];
  assert.equal(blockHeightWithFigures(pair("diag", { figures }), 170), blockHeightWithFigures(pair("panels", { figures }), 170));
  for (const n of [1, 2, 3, 4]) {
    const cp = canonicalBlock("compare", "panels", n, "추진노력");
    const cd = canonicalBlock("compare", "diag", n, "추진노력");
    assert.deepEqual(cd.items, cp.items, "보통 모양도 요지 두 칸");
    assert.equal(blockHeight(cd, blockWidth(cd)), blockHeight(cp, blockWidth(cp)), `${n}행`);
  }
  // 막대가 붙은 좁은 행의 패널 안 M 그림 둘은 panels처럼 빠짐(옆 그림 규칙이 아니라 패널 규칙)
  const chart = () => blk("chart", { label: "A", series: [{ label: "a", value: "1" }, { label: "b", value: "2" }] });
  const pd = pair("panels", { label: "A", figures: [fig("left"), fig("right")] });
  const dd = pair("diag", { label: "A", figures: [fig("left"), fig("right")] });
  assert.deepEqual(guardFigures([dd, chart()]), guardFigures([pd, chart()]));
  assert.deepEqual(dd.figures, pd.figures);
});

// ---------------------------------------------------------------------------
// 목소리 → 해법 1:1(구성안 경고)

const planBlock = (over: Partial<PlanBlock> = {}): PlanBlock => ({ kind: "bullets", variant: "", label: "", purpose: "설명", cells: 2, materials: [], figures: [], ...over });
const voiceComposition = (voices: number, next: Partial<PlanBlock>, over: Partial<Composition> = {}): Composition => ({
  version: 1,
  message: "메시지",
  points: ["논점"],
  story: "현장 목소리형",
  storyWhy: "이유",
  alternative: "차선",
  blocks: [planBlock({ kind: "banner" }), planBlock({ kind: "voices", label: "국민 의견수렴", cells: voices }), planBlock({ label: "추진노력", ...next }), planBlock({ kind: "stats", cells: 3 })],
  results: "결과",
  materials: [],
  memo: "",
  ...over,
});
const voiceWarn = (c: Composition) => compositionIssues(c, 1).filter((x) => x.startsWith("목소리–해법"));

test("compositionIssues 목소리–해법: 현장 목소리형에서 말풍선 수와 바로 다음 전후 비교·표 행 수가 다르면 경고", () => {
  assert.deepEqual(voiceWarn(voiceComposition(3, { kind: "compare", variant: "table", cells: 2 })), ["목소리–해법: 말풍선 3개와 다음 표 2행이 1:1이 아닙니다 — 목소리마다 해법 행 하나로 맞춥니다."]);
  assert.equal(voiceWarn(voiceComposition(2, { kind: "table", cells: 4 })).length, 1, "표도 셈");
  assert.equal(voiceWarn(voiceComposition(2, { kind: "compare", variant: "diag", cells: 3 })).length, 1, "진단 ▶ 처방 짝도 셈");
  assert.equal(voiceWarn(voiceComposition(3, { kind: "compare", variant: "panels", cells: 2 }, { story: "단계 전개형", subStory: "현장 목소리형" })).length, 1, "보조 틀이 현장 목소리형이어도");
});

test("compositionIssues 목소리–해법: 수가 같거나·다음 블록이 전후 비교·표가 아니거나·현장 목소리형이 아니면 경고 없음", () => {
  assert.deepEqual(voiceWarn(voiceComposition(3, { kind: "compare", variant: "table", cells: 3 })), []);
  assert.deepEqual(voiceWarn(voiceComposition(3, { kind: "cards", variant: "plain", cells: 2 })), []);
  assert.deepEqual(voiceWarn(voiceComposition(3, { kind: "compare", variant: "table", cells: 2 }, { story: "단계 전개형" })), []);
  const last = voiceComposition(3, { kind: "compare", cells: 2 });
  assert.deepEqual(voiceWarn({ ...last, blocks: last.blocks.slice(0, 2) }), [], "말풍선이 마지막 블록");
});
