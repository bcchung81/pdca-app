// 경평 초안 「구성안」(lib/reports/composition.ts) 순수 로직 시험: 재료·블록 정리(원문 대조), 판면 어림·판면에 맞게 줄이기,
// 집필 요청 글(planPrompt), 집필이 구성안 짜임을 지켰는지(planAdherence).

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Block } from "./blocks.ts";
import { MAIN_STORIES } from "./blocks.ts";
import {
  COMPOSITION_LIMITS,
  type Composition,
  type CompositionOutput,
  type Material,
  type PlanBlock,
  EDIT_LIMITS,
  applyCompositionEdit,
  blockBudgets,
  cleanComposition,
  compositionFit,
  compositionIssues,
  compositionOutSchema,
  withFixedStory,
  editOf,
  fitComposition,
  planAdherence,
  planBlockCap,
  blockLimits,
  limitText,
  planBlocks,
  planLimitIssues,
  planMatch,
  outlineSiblingLayout,
  planPrompt,
  readComposition,
  shapeChoices,
  sideBySide,
} from "./composition.ts";
import { canonicalBlock } from "./fit.ts";
import { cellRange, storyLabel } from "./frameworks.ts";
import { evidenceOf } from "./section.ts";
import { reportDraftPrompts } from "../prompts/sets.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const seed = { cards: seedCards<Record<string, any>>() };
const card = seed.cards.find((c) => c.id === "주요사업1/1-가")!;

const material = (over: Partial<Record<string, unknown>> = {}) => ({ id: "m1", kind: "fact", text: "재료 글", when: "’25년", source: "카드", quote: "", ...over });
const planBlock = (over: Partial<PlanBlock> = {}): PlanBlock => ({ kind: "bullets", variant: "", label: "", purpose: "설명", cells: 2, materials: [], figures: [], ...over });
const baseComposition = (over: Partial<Composition> = {}): Composition => ({
  version: 1,
  message: "메시지",
  points: ["논점"],
  story: "단계 전개형",
  storyWhy: "이유",
  alternative: "차선",
  blocks: [planBlock()],
  results: "결과",
  materials: [],
  memo: "",
  ...over,
});
const outBase = (over: Partial<CompositionOutput> = {}): CompositionOutput =>
  ({
    message: "메시지",
    points: ["논점1"],
    story: "단계 전개형",
    storyWhy: "이유",
    alternative: "차선",
    materials: [],
    blocks: [],
    results: "결과",
    ...over,
  }) as CompositionOutput;

// ---------------------------------------------------------------------------
// cleanComposition — 재료 원문 대조(실제 카드), 겹침·빈 글·모르는 종류, 블록 정리

test("cleanComposition: 카드 글에 있는 구절은 found=true, 없는 구절은 found=false(1-가 카드)", { skip: NO_SEED_CARDS }, () => {
  const { hayKey, known } = evidenceOf(card);
  const out = outBase({
    materials: [
      material({ id: "m1", kind: "fact", quote: "AI 자동판독 기술 고도화" }),
      material({ id: "m2", kind: "quote", quote: "이 문구는 카드 어디에도 없음 절대" }),
    ] as any,
    blocks: [{ kind: "bullets", variant: "", label: "", purpose: "목적", cells: 2, materials: ["m1"], figures: [] }] as any,
  });
  const { composition, warnings } = cleanComposition(out, hayKey, known);
  assert.equal(composition.materials.find((m) => m.id === "m1")?.found, true, "카드에 있는 구절");
  assert.equal(composition.materials.find((m) => m.id === "m2")?.found, false, "카드에 없는 구절");
  assert.ok(warnings.some((w) => w.includes("원문에서 구절을 찾지 못한 재료 1개(m2)")), warnings.join("\n"));
  // 블록의 재료 번호는 있는 것만 남음
  assert.deepEqual(composition.blocks[0].materials, ["m1"]);
});

test("cleanComposition: 재료 번호 겹침·빈 글·모르는 종류는 버림", { skip: NO_SEED_CARDS }, () => {
  const { hayKey, known } = evidenceOf(card);
  const out = outBase({
    materials: [
      material({ id: "m1", text: "첫 번째" }),
      material({ id: "m1", text: "번호 겹침(버려짐)" }),
      material({ id: "m2", text: "" }),
      material({ id: "m3", kind: "unknown-kind" }),
    ] as any,
  });
  const { composition } = cleanComposition(out, hayKey, known);
  assert.deepEqual(
    composition.materials.map((m) => m.id),
    ["m1"],
  );
  assert.equal(composition.materials[0].text, "첫 번째");
});

test("cleanComposition: 수치 재료의 숫자가 근거에 없으면 경고", { skip: NO_SEED_CARDS }, () => {
  const { hayKey, known } = evidenceOf(card);
  const out = outBase({ materials: [material({ id: "m1", kind: "figure", text: "이용자 98765명", quote: "" })] as any });
  const { warnings } = cleanComposition(out, hayKey, known);
  assert.ok(warnings.some((w) => w.includes("근거에 없는 숫자가 든 수치 재료 1개(m1)")), warnings.join("\n"));
});

test("cleanComposition: need 재료는 quote가 없어도 found 대조를 하지 않음(경고 없음)", { skip: NO_SEED_CARDS }, () => {
  const { hayKey, known } = evidenceOf(card);
  const out = outBase({ materials: [material({ id: "m1", kind: "need", text: "올해 실적 값", quote: "" })] as any });
  const { composition, warnings } = cleanComposition(out, hayKey, known);
  assert.equal(composition.materials[0].found, false);
  assert.ok(!warnings.some((w) => w.includes("원문에서 구절을 찾지 못한")), warnings.join("\n"));
});

test("cleanComposition: 블록 — 모르는 종류는 버리고, 모양은 목록 밖이면 첫째, 칸 수는 모양별 범위(frameworks.ts cellRange), 없는 재료 번호는 뗌", { skip: NO_SEED_CARDS }, () => {
  const { hayKey, known } = evidenceOf(card);
  const out = outBase({
    materials: [material({ id: "m1" })] as any,
    blocks: [
      { kind: "cards", variant: "nope", label: "라벨", purpose: "목적", cells: 999, materials: ["m1", "없는번호"], figures: [] },
      { kind: "모르는종류", variant: "", label: "", purpose: "", cells: 1, materials: [], figures: [] },
    ] as any,
  });
  const { composition } = cleanComposition(out, hayKey, known);
  assert.equal(composition.blocks.length, 1, "모르는 종류는 버림");
  assert.equal(composition.blocks[0].variant, "plus", "cards 모양 목록의 첫째");
  assert.equal(composition.blocks[0].cells, cellRange("cards", "plus").max, "칸 수는 그 모양의 상한까지");
  assert.deepEqual(composition.blocks[0].ai, { kind: "cards", variant: "plus" }, "AI 처음 모양을 남김");
  assert.deepEqual(composition.blocks[0].materials, ["m1"], "없는 재료 번호는 뗌");
});

test("cleanComposition: 블록의 alts는 처음 모양과 같은 것·모르는 종류·겹침은 버리고 2개까지", { skip: NO_SEED_CARDS }, () => {
  const { hayKey, known } = evidenceOf(card);
  const out = outBase({
    materials: [material({ id: "m1" })] as any,
    blocks: [
      {
        kind: "cards",
        variant: "plain",
        label: "",
        purpose: "",
        cells: 3,
        materials: [],
        figures: [],
        alts: [
          { kind: "cards", variant: "plain", why: "처음과 같음(버림)" },
          { kind: "모르는종류", variant: "", why: "모르는 종류(버림)" },
          { kind: "steps", variant: "row", why: "대안1" },
          { kind: "steps", variant: "row", why: "겹침(버림)" },
          { kind: "timeline", variant: "chevron", why: "대안2" },
          { kind: "compare", variant: "table", why: "3번째(버림 — 2개까지)" },
        ],
      },
    ] as any,
  });
  const { composition } = cleanComposition(out, hayKey, known);
  assert.deepEqual(composition.blocks[0].alts, [
    { kind: "steps", variant: "row", why: "대안1" },
    { kind: "timeline", variant: "chevron", why: "대안2" },
  ]);
});

test("compositionOutSchema: 이야기 틀은 문자열로 받아 파싱이 실패하지 않고(가운뎃점 변형·주 + 보조 표기·섞음·빈 글), 정리가 12종으로 맞춤 — 담당자가 고른 틀은 덮어씀(2026-10-12)", () => {
  // enum·literal이면 「한계 극복･다자협업형」(U+FF65) 하나로 답 전체가 파싱 실패 → 구성안이 통째로 안 만들어짐(같은 날 집필 story 버그와 같은 원인)
  const schema = compositionOutSchema();
  for (const s of ["원스톱 통합형", "한계 극복･다자협업형", "한계 극복ㆍ다자협업형 + 연혁·연도 사다리형", "", "섞음", "모르는 틀"]) assert.equal(schema.safeParse(outBase({ story: s })).success, true, s);
  const clean = (story: string, subStory?: string) => cleanComposition(outBase({ story, ...(subStory !== undefined ? { subStory } : {}) }), "", new Set()).composition;
  assert.equal(clean("한계 극복･다자협업형").story, "한계 극복·다자협업형", "반각 가운뎃점 → 정식 이름");
  assert.equal(clean("한계 극복ㆍ다자협업형 + 연혁·연도 사다리형").story, "한계 극복·다자협업형", "「주 + 보조」로 적으면 앞 이름");
  assert.equal(clean("이슈 -> 해결책형").story, "이슈→해결책형", "화살표 표기");
  assert.equal(clean("「⑤ 원스톱 통합형」").story, "원스톱 통합형", "번호·따옴표");
  assert.equal(clean("섞음").story, "", "AI 답의 섞음은 버림(두 틀이면 주 + 보조)");
  assert.equal(clean("모르는 틀").story, "", "모르는 이름은 버림");
  assert.equal(clean("단계 전개형", "가치 축 분할형").subStory, "가치 축 분할형");
  assert.equal(clean("단계 전개형", "현장 목소리 형").subStory, "현장 목소리형", "보조 틀도 맞춤(띄어쓰기)");
  for (const s of ["원스톱 통합형", "한계 극복･다자협업형", "", "섞음"]) {
    const parsed = schema.parse(outBase({ story: s }));
    assert.equal(withFixedStory(parsed, "원스톱 통합형").story, "원스톱 통합형", `덮어씀: ${s}`);
    assert.equal(cleanComposition(withFixedStory(parsed, "원스톱 통합형"), "", new Set()).composition.story, "원스톱 통합형");
  }
  assert.equal(withFixedStory(outBase({ story: "현장 목소리형" }), "섞음").story, "현장 목소리형", "섞음을 고른 요청은 AI가 고른 틀을 그대로");
  assert.equal(withFixedStory(outBase({ story: "현장 목소리형" }), undefined).story, "현장 목소리형");
  for (const s of MAIN_STORIES) assert.equal(clean(s).story, s, s);
});

test("compositionOutSchema: subStory는 문자열(없어도 됨) — 정리가 12종·주 틀과 다를 때만 남김", () => {
  const s = compositionOutSchema();
  for (const sub of ["", "연혁·연도 사다리형", "섞음", "연혁ㆍ연도 사다리형"]) assert.equal(s.safeParse(outBase({ subStory: sub })).success, true, sub);
  assert.equal(s.safeParse(outBase()).success, true, "옛 답(보조 틀 없음)도 통과");
  assert.equal(cleanComposition(outBase({ subStory: "섞음" }), "", new Set()).composition.subStory, undefined);
});

test("cleanComposition: 보조 틀은 12종이고 주 틀과 다를 때만 남김", { skip: NO_SEED_CARDS }, () => {
  const { hayKey, known } = evidenceOf(card);
  assert.equal(cleanComposition(outBase({ story: "단계 전개형", subStory: "한계 극복·다자협업형" } as any), hayKey, known).composition.subStory, "한계 극복·다자협업형");
  assert.equal(cleanComposition(outBase({ story: "단계 전개형", subStory: "단계 전개형" } as any), hayKey, known).composition.subStory, undefined, "주 틀과 같으면 뺌");
  assert.equal(cleanComposition(outBase({ story: "단계 전개형", subStory: "" } as any), hayKey, known).composition.subStory, undefined);
  assert.equal(cleanComposition(outBase({ story: "단계 전개형", subStory: "모르는 틀" } as any), hayKey, known).composition.subStory, undefined);
});

test("applyCompositionEdit: 주 틀이 그대로면 보조 틀을 지키고, 주 틀을 바꾸면 보조 틀은 지움", () => {
  const c = baseComposition({ story: "단계 전개형", subStory: "현장 목소리형" });
  assert.equal(applyCompositionEdit(c, editOf(c)).composition.subStory, "현장 목소리형");
  assert.equal(applyCompositionEdit(c, { ...editOf(c), story: "원스톱 통합형" }).composition.subStory, undefined);
});

test("storyLabel·planPrompt: 보조 틀이 있으면 「주 + 보조」로 적음", () => {
  assert.equal(storyLabel("단계 전개형", "현장 목소리형"), "단계 전개형 + 현장 목소리형");
  assert.equal(storyLabel("단계 전개형"), "단계 전개형");
  assert.equal(storyLabel(""), "");
  const text = planPrompt(reportDraftPrompts().prompts, baseComposition({ story: "단계 전개형", subStory: "현장 목소리형" }), 1);
  assert.match(text, /단계 전개형 \+ 현장 목소리형/);
});

test("cleanComposition: 블록·재료 수는 상한까지만", { skip: NO_SEED_CARDS }, () => {
  const { hayKey, known } = evidenceOf(card);
  const out = outBase({
    materials: Array.from({ length: COMPOSITION_LIMITS.materials * 2 }, (_, i) => material({ id: `m${i}`, text: `재료 ${i}` })) as any,
    blocks: Array.from({ length: COMPOSITION_LIMITS.blocks * 2 }, () => ({ kind: "bullets", variant: "", label: "", purpose: "", cells: 1, materials: [], figures: [] })) as any,
  });
  const { composition } = cleanComposition(out, hayKey, known);
  assert.equal(composition.materials.length, COMPOSITION_LIMITS.materials);
  assert.equal(composition.blocks.length, COMPOSITION_LIMITS.blocks);
});

// ---------------------------------------------------------------------------
// readComposition

test("readComposition: 형식이 다르면 null, version 1이고 blocks·materials 배열이면 그대로", () => {
  assert.equal(readComposition(null), null);
  assert.equal(readComposition({ version: 2, blocks: [], materials: [] }), null);
  assert.equal(readComposition({ version: 1, blocks: [] }), null, "materials 없음");
  const raw = { version: 1, blocks: [], materials: [], message: "m" };
  assert.deepEqual(readComposition(raw), raw);
});

// ---------------------------------------------------------------------------
// fitComposition — 7블록 넘친 구성안(불릿 2 + 도식 5)

test("fitComposition: 불릿 2 + 도식 5로 넘친 구성안은 둘째 불릿부터 빠지고, 칸은 최소 칸 수 아래로 안 내려가고, 넘침을 줄임", () => {
  const c = baseComposition({
    blocks: [
      planBlock({ kind: "bullets", cells: 4, label: "" }),
      planBlock({ kind: "bullets", cells: 4, label: "" }),
      planBlock({ kind: "cards", variant: "plain", cells: 4, label: "라벨1" }),
      planBlock({ kind: "steps", variant: "row", cells: 4, label: "라벨2" }),
      planBlock({ kind: "timeline", variant: "chevron", cells: 4, label: "라벨3" }),
      planBlock({ kind: "compare", variant: "table", cells: 4, label: "라벨4" }),
      planBlock({ kind: "hub", cells: 4, label: "라벨5" }),
    ],
  });
  const before = compositionFit(c, 1);
  assert.ok(before.total > before.budget, "손으로 짠 구성안은 1쪽 예산을 넘김");
  const { composition, changes } = fitComposition(c, 1);
  assert.equal(composition.blocks.filter((b) => b.kind === "bullets").length, 1, "둘째 불릿부터 빠짐(첫 불릿은 남음)");
  const floors: Record<string, number> = { cards: 3, steps: 3, timeline: 3, hub: 3, compare: 2 };
  for (const b of composition.blocks) if (floors[b.kind] !== undefined) assert.ok(b.cells >= floors[b.kind], `${b.kind} 칸 ${b.cells} >= ${floors[b.kind]}`);
  const after = compositionFit(composition, 1);
  assert.ok(after.total < before.total, `줄인 뒤(${after.total})가 전(${before.total})보다 작아야 함`);
  assert.ok(changes.length > 0, "고친 내역이 남음");
});

test("fitComposition: 이미 예산 안이면 아무것도 바꾸지 않음", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "bullets", cells: 2 })] });
  const { composition, changes } = fitComposition(c, 1);
  assert.deepEqual(composition.blocks, c.blocks);
  assert.deepEqual(changes, []);
});

test("fitComposition: 그림 높이가 정하는 칸(그림 S가 붙은 불릿 2줄 → 1줄)처럼 높이를 못 줄이는 칸 줄이기는 하지 않음 — changes에 그 블록이 없음", () => {
  // 불릿 2줄(글자 수)은 그림(S, 15mm) 높이보다 이미 낮아 1줄로 줄여도 블록 높이가 그대로임(compositionFit로 확인한 값)
  const c = baseComposition({
    blocks: [planBlock({ kind: "bullets", cells: 2, label: "", figures: [{ kind: "illust", desc: "그림", pos: "right", size: "S" }] })],
  });
  const before = compositionFit(c, 0.1);
  assert.ok(before.total > before.budget, "작은 예산으로 넘치게 만듦");
  const { composition, changes } = fitComposition(c, 0.1);
  assert.equal(composition.blocks[0].cells, 2, "높이가 줄지 않는 칸 줄이기는 적용하지 않음");
  assert.deepEqual(changes, [], "고친 내역에 이 블록이 없음");
});

// ---------------------------------------------------------------------------
// compositionIssues

test("compositionIssues: 블록이 없으면 그 문장뿐, 자료 필요 재료는 목록으로", () => {
  assert.deepEqual(compositionIssues(baseComposition({ blocks: [] }), 1), ["구성안에 블록이 없습니다."]);
  const c = baseComposition({ materials: [{ id: "m1", kind: "need", text: "필요한 자료", when: "", source: "", quote: "", found: false } as Material] });
  const issues = compositionIssues(c, 1);
  assert.ok(issues.some((x) => x.includes("자료 필요 1건: 필요한 자료")), issues.join("\n"));
});

test("compositionIssues: 재료 없는 블록·목적 없는 블록 경고, 다 채우면 안 나옴", () => {
  const bare = baseComposition({ blocks: [planBlock({ kind: "cards", variant: "plain", purpose: "", materials: [] })] });
  const issues = compositionIssues(bare, 1);
  assert.ok(issues.some((x) => x.startsWith("재료 없는 블록:")), issues.join("\n"));
  assert.ok(issues.some((x) => x.startsWith("목적 없는 블록:")), issues.join("\n"));
  const filled = baseComposition({
    blocks: [planBlock({ kind: "cards", variant: "plain", purpose: "목적", materials: ["m1"] })],
    materials: [{ id: "m1", kind: "fact", text: "재료", when: "", source: "", quote: "", found: true }],
  });
  const noIssues = compositionIssues(filled, 1);
  assert.ok(!noIssues.some((x) => x.startsWith("재료 없는 블록:")), noIssues.join("\n"));
  assert.ok(!noIssues.some((x) => x.startsWith("목적 없는 블록:")), noIssues.join("\n"));
});

test("compositionIssues: 띠·배너·소제목은 재료 없어도 「재료 없는 블록」 경고가 없음", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "banner", purpose: "목적" }), planBlock({ kind: "band", purpose: "목적" }), planBlock({ kind: "subhead", purpose: "목적" })] });
  const issues = compositionIssues(c, 1);
  assert.ok(!issues.some((x) => x.startsWith("재료 없는 블록:")), issues.join("\n"));
});

// ---------------------------------------------------------------------------
// applyCompositionEdit(2026-09-28 새 편집 형식 — BlockEdit·CompositionEdit)

test("applyCompositionEdit: editOf 그대로 적용하면 블록 내용이 같고 by가 안 붙음, notes 없음(사람이 안 고침)", () => {
  const c = baseComposition({
    blocks: [
      planBlock({ kind: "bullets", label: "A", figures: [{ kind: "photo", desc: "사진", pos: "right", size: "M" }] }),
      planBlock({ kind: "cards", variant: "plain", label: "B" }),
    ],
  });
  const { composition, notes } = applyCompositionEdit(c, editOf(c));
  assert.deepEqual(
    composition.blocks.map((b) => ({ kind: b.kind, variant: b.variant, label: b.label, cells: b.cells, figures: b.figures })),
    c.blocks.map((b) => ({ kind: b.kind, variant: b.variant, label: b.label, cells: b.cells, figures: b.figures })),
  );
  assert.ok(
    composition.blocks.every((b) => !b.by),
    "사람이 안 고쳤으므로 by 없음",
  );
  assert.deepEqual(notes, []);
});

test("applyCompositionEdit: 도식 바꾸기(기본 도식)는 by human이 붙고, 칸 수는 그 모양의 범위로 맞춤(cards:vs는 늘 2)", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "bullets", cells: 4, label: "A" })] });
  const toSteps = editOf(c);
  toSteps.blocks[0] = { ...toSteps.blocks[0], kind: "steps", variant: "row" };
  const stepsResult = applyCompositionEdit(c, toSteps).composition;
  assert.equal(stepsResult.blocks[0].kind, "steps");
  assert.equal(stepsResult.blocks[0].by, "human");

  const toVs = editOf(c);
  toVs.blocks[0] = { ...toVs.blocks[0], kind: "cards", variant: "vs", cells: 5 };
  const vsResult = applyCompositionEdit(c, toVs).composition;
  assert.equal(vsResult.blocks[0].kind, "cards");
  assert.equal(vsResult.blocks[0].variant, "vs");
  assert.equal(vsResult.blocks[0].cells, 2, "cards:vs는 늘 2");
  assert.equal(vsResult.blocks[0].by, "human");
});

test("applyCompositionEdit: 근거 없는 이 과제만의 요소로 바꾸면 원래 모양으로 남고 notes에 이유, found quote 재료가 있으면 바뀜, AI가 추천한 종류면 재료 없어도 바뀜", () => {
  const noEvidence = baseComposition({ blocks: [planBlock({ kind: "bullets", label: "A" })], materials: [] });
  const e1 = editOf(noEvidence);
  e1.blocks[0] = { ...e1.blocks[0], kind: "quotes", variant: "" };
  const r1 = applyCompositionEdit(noEvidence, e1);
  assert.equal(r1.composition.blocks[0].kind, "bullets", "재료도 AI 추천도 없으면 원래 모양으로 남음");
  assert.ok(r1.notes.length > 0, "이유가 남음");

  const withQuote = baseComposition({
    blocks: [planBlock({ kind: "bullets", label: "A" })],
    materials: [{ id: "m1", kind: "quote", text: "인용", when: "", source: "", quote: "인용문", found: true }],
  });
  const e2 = editOf(withQuote);
  e2.blocks[0] = { ...e2.blocks[0], kind: "quotes", variant: "" };
  const r2 = applyCompositionEdit(withQuote, e2);
  assert.equal(r2.composition.blocks[0].kind, "quotes", "원문 확인(found) quote 재료가 있으면 바뀜");
  assert.deepEqual(r2.notes, []);

  const withAi = baseComposition({ blocks: [{ ...planBlock({ kind: "bullets", label: "A" }), ai: { kind: "quotes", variant: "" } }], materials: [] });
  const e3 = editOf(withAi);
  e3.blocks[0] = { ...e3.blocks[0], kind: "quotes", variant: "" };
  const r3 = applyCompositionEdit(withAi, e3);
  assert.equal(r3.composition.blocks[0].kind, "quotes", "AI가 alts·ai로 추천한 종류면 재료 없어도 바뀜");
});

test("applyCompositionEdit: 새 블록(from null)·복제(같은 from 두 번 — 둘째는 그림 없음) 모두 by human, 블록 수는 EDIT_LIMITS.blocks까지", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "bullets", label: "A", figures: [{ kind: "photo", desc: "사진", pos: "right", size: "M" }] })] });
  const e = editOf(c);
  e.blocks.push({ from: null, kind: "cards", variant: "plain", label: "새", purpose: "", cells: 3, materials: [], memo: "", figures: [] });
  e.blocks.push({ ...e.blocks[0] }); // 같은 from(0)을 두 번째로 — 복제
  const { composition } = applyCompositionEdit(c, e);
  assert.equal(composition.blocks.length, 3);
  assert.equal(composition.blocks[0].by, undefined, "원본은 안 바뀜");
  assert.equal(composition.blocks[1].by, "human", "새 블록");
  assert.equal(composition.blocks[2].by, "human", "복제");
  assert.equal(composition.blocks[0].figures.length, 1, "원본은 그림을 유지");
  assert.deepEqual(composition.blocks[2].figures, [], "복제본은 그림 없음");

  const many = editOf(c);
  for (let i = 0; i < EDIT_LIMITS.blocks + 5; i++) many.blocks.push({ from: null, kind: "bullets", variant: "", label: `${i}`, purpose: "", cells: 1, materials: [], memo: "", figures: [] });
  const limited = applyCompositionEdit(c, many).composition;
  assert.equal(limited.blocks.length, EDIT_LIMITS.blocks);
});

test("applyCompositionEdit: 재료는 재료표에 있는 번호만(없는 번호 버림), 라벨·목적·메모는 길이 상한까지", () => {
  const c = baseComposition({
    blocks: [planBlock({ kind: "bullets", label: "A" })],
    materials: [{ id: "m1", kind: "fact", text: "재료", when: "", source: "", quote: "", found: true }],
  });
  const e = editOf(c);
  e.blocks[0] = { ...e.blocks[0], materials: ["m1", "없는번호"], label: "가".repeat(50), purpose: "나".repeat(200), memo: "다".repeat(300) };
  const { composition } = applyCompositionEdit(c, e);
  assert.deepEqual(composition.blocks[0].materials, ["m1"]);
  assert.equal(composition.blocks[0].label.length, EDIT_LIMITS.label);
  assert.equal(composition.blocks[0].purpose.length, EDIT_LIMITS.purpose);
  assert.equal((composition.blocks[0].memo ?? "").length, EDIT_LIMITS.memo);
});

test("applyCompositionEdit: 그림은 원래 블록의 것만 남고, center 자리를 못 쓰는 종류로 바꾸면 center 그림이 right로(cleanFigures 규칙)", () => {
  const c = baseComposition({
    blocks: [planBlock({ kind: "compare", variant: "table", label: "A", figures: [{ kind: "photo", desc: "사진", pos: "center", size: "M" }] })],
  });
  const e = editOf(c);
  e.blocks[0] = { ...e.blocks[0], kind: "cards", variant: "plain" }; // cards는 center 자리를 못 씀(compare·hub만)
  const { composition } = applyCompositionEdit(c, e);
  assert.equal(composition.blocks[0].figures.length, 1, "원래 블록의 그림만 남음");
  assert.equal(composition.blocks[0].figures[0].pos, "right");
});

test("applyCompositionEdit: 순서·빼기·이야기 틀(목록 안만)·추진성과 모양(목록 안만)", () => {
  const c = baseComposition({
    blocks: [planBlock({ kind: "bullets", label: "A" }), planBlock({ kind: "cards", variant: "plain", label: "B" })],
    story: "단계 전개형",
  });
  const e = editOf(c);
  const swapped: typeof e = { ...e, blocks: [e.blocks[1], e.blocks[0]], story: "이슈→해결책형", resultShape: "cards" };
  const next = applyCompositionEdit(c, swapped).composition;
  assert.deepEqual(
    next.blocks.map((b) => b.label),
    ["B", "A"],
  );
  assert.equal(next.story, "이슈→해결책형");
  assert.equal(next.resultShape, "cards");

  const bad = applyCompositionEdit(c, { ...e, story: "없는 틀" }).composition;
  assert.equal(bad.story, c.story, "목록 밖 틀은 그대로");

  const dropped = applyCompositionEdit(c, { ...e, blocks: [e.blocks[0]] }).composition;
  assert.equal(dropped.blocks.length, 1, "뺀 블록은 남지 않음");
});

// ---------------------------------------------------------------------------
// shapeChoices

test("shapeChoices: 30개 모두 돌아오고, 근거 없는 이 과제만의 요소는 ok false, 지금 모양과 같은 모양은 deltaMm 0, 칸을 더 쓰는 모양은 deltaMm > 0, add 모드는 블록이 하나 느는 판면이라 deltaMm > 0", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "bullets", cells: 2, label: "A" })] });
  const e = editOf(c);
  const change = shapeChoices(c, e, { pos: 0, mode: "change" }, 1);
  assert.equal(change.length, 30);
  const quotesChoice = change.find((x) => x.code === "quotes")!;
  assert.equal(quotesChoice.ok, false, "재료도 AI 추천도 없는 이 과제만의 요소");
  const sameChoice = change.find((x) => x.kind === "bullets")!;
  assert.equal(sameChoice.deltaMm, 0, "지금 모양과 같은 모양");
  const cardsChoice = change.find((x) => x.code === "cards:plus")!;
  assert.ok(cardsChoice.deltaMm > 0, `불릿 2줄 → 칸 도식(보통 3칸)은 판면이 늘어남(실측 ${cardsChoice.deltaMm}mm)`);

  const add = shapeChoices(c, e, { pos: 0, mode: "add" }, 1);
  const addBullets = add.find((x) => x.kind === "bullets")!;
  assert.ok(addBullets.deltaMm > 0, "블록을 더하면 판면이 늘어남");
});

// ---------------------------------------------------------------------------
// planPrompt — 집필 요청 글(승인된 구성안)

test("planPrompt: 채운 뒤 자리표시가 남지 않고, 블록마다 높이 예산이 들어감", () => {
  const p = reportDraftPrompts().prompts;
  const c = baseComposition({
    points: ["논점1", "논점2"],
    blocks: [
      planBlock({ kind: "bullets", cells: 2, label: "", purpose: "목적1", materials: ["m1"] }),
      planBlock({ kind: "cards", variant: "plain", cells: 3, label: "라벨", purpose: "목적2", materials: ["m2"], figures: [{ kind: "photo", desc: "현장", pos: "right", size: "M" }] }),
    ],
    materials: [
      { id: "m1", kind: "fact", text: "사실", when: "’25년", source: "카드", quote: "인용", found: true },
      { id: "m2", kind: "need", text: "필요 자료", when: "", source: "", quote: "", found: false },
    ],
  });
  const text = planPrompt(p, c, 1);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.equal((text.match(/높이 약 \d+mm/g) ?? []).length, c.blocks.length, "블록마다 높이");
  assert.equal((text.match(/글 한도 /g) ?? []).length, c.blocks.length, "블록마다 글 한도(칸마다 줄 수 · 한 줄 글자 수)");
  assert.match(text, /자료 필요/, "need 재료의 표시");
  assert.match(text, /원문 확인/, "found 재료의 표시");
});

test("planPrompt: by human이거나 memo가 있는 블록 뒤에 plan.human 줄(메모 글이 들어감), 아니면 없음", () => {
  const p = reportDraftPrompts().prompts;
  const c = baseComposition({
    blocks: [
      { ...planBlock({ kind: "bullets", label: "A" }), by: "human", memo: "담당자 메모 글" },
      planBlock({ kind: "cards", variant: "plain", label: "B" }), // by 없음·memo 없음
    ],
  });
  const text = planPrompt(p, c, 1);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.ok(text.includes("담당자 메모 글"), "메모 글이 들어감");
  const humanLines = text.split("\n").filter((l) => l.includes("담당자가 고른 블록"));
  assert.equal(humanLines.length, 1, "by human이거나 memo 있는 블록만 plan.human 줄");
});

// ---------------------------------------------------------------------------
// planAdherence — 집필 결과가 구성안 짜임을 지켰는지

test("planAdherence: 같은 순서(모양까지)면 same=true, 블록 하나 빠지면 matched = total-1", () => {
  const c = baseComposition({
    blocks: [planBlock({ kind: "bullets" }), planBlock({ kind: "cards", variant: "plain" }), planBlock({ kind: "steps", variant: "row" })],
  });
  const exact = planBlocks(c);
  const same = planAdherence(c, exact);
  assert.deepEqual(same, { matched: 3, total: 3, same: true });

  const missing = exact.slice(0, 2);
  const withOneMissing = planAdherence(c, missing);
  assert.equal(withOneMissing.matched, 2);
  assert.equal(withOneMissing.total, 3);
  assert.equal(withOneMissing.same, false);
});

test("planAdherence: 모양이 다르면(같은 종류라도) 안 맞은 것으로 셈", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "compare", variant: "table" })] });
  const different: Block[] = [canonicalBlock("compare", "panels", 2, "")];
  const r = planAdherence(c, different);
  assert.equal(r.matched, 0);
  assert.equal(r.same, false);
});

test("planMatch: 구성안 블록마다 초안 블록 순번(가장 긴 공통 부분열 — 종류·모양 순서), 짝이 없으면 null", () => {
  const c = baseComposition({
    blocks: [planBlock({ kind: "bullets" }), planBlock({ kind: "cards", variant: "plain" }), planBlock({ kind: "steps", variant: "row" }), planBlock({ kind: "chart" })],
  });
  const exact = planBlocks(c);
  assert.deepEqual(planMatch(c, exact), [0, 1, 2, 3], "같으면 차례대로");
  // 초안이 가운데 블록을 빼고 앞에 인용 상자를 더함 → 뒤 블록들은 순번이 밀림
  const draft: Block[] = [canonicalBlock("quotes", "", 1, ""), exact[0], exact[2], exact[3]];
  assert.deepEqual(planMatch(c, draft), [1, null, 2, 3]);
  // 모양이 다르면(칸 도식 plain ↔ plus) 짝 없음, 짝 수는 planAdherence의 matched와 같음
  const other: Block[] = [exact[0], canonicalBlock("cards", "plus", 3, ""), exact[2]];
  const m = planMatch(c, other);
  assert.deepEqual(m, [0, null, 2, null]);
  assert.equal(m.filter((x) => x !== null).length, planAdherence(c, other).matched);
  assert.deepEqual(planMatch(c, []), [null, null, null, null], "초안 블록이 없으면 모두 null");
});

// ---------------------------------------------------------------------------
// planLimitIssues — 집필 초안의 칸 수가 구성안보다 많으면 경고(칸을 늘리지 않음)

test("planLimitIssues: 전후 비교 행이 구성안보다 많으면 「칸 수:」 경고, 같거나 적으면 없음", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "compare", variant: "table", cells: 2, label: "라벨" })] });
  const mkCompare = (rows: number): Block => ({
    kind: "compare",
    label: "라벨",
    title: "",
    variant: "table",
    text: "",
    items: [],
    cells: [],
    rows: Array.from({ length: rows }, () => ({ key: "구분", before: ["가"], after: ["나"] })),
    series: [],
    badge: "",
  });
  const moreRows = planLimitIssues(c, [mkCompare(3)], 1);
  assert.ok(moreRows.some((x) => x.startsWith("칸 수:")), moreRows.join("\n"));
  const sameRows = planLimitIssues(c, [mkCompare(2)], 1);
  assert.ok(!sameRows.some((x) => x.startsWith("칸 수:")), sameRows.join("\n"));
  const fewerRows = planLimitIssues(c, [mkCompare(1)], 1);
  assert.ok(!fewerRows.some((x) => x.startsWith("칸 수:")), fewerRows.join("\n"));
});

test("planLimitIssues: 담당자가 고른(by human) 블록의 모양이 초안에 없으면 첫 항목이 「모양:」으로 시작", () => {
  const c = baseComposition({ blocks: [{ ...planBlock({ kind: "quotes", label: "A" }), by: "human" as const }] });
  const draftBlocks: Block[] = [canonicalBlock("bullets", "", 2, "")];
  const issues = planLimitIssues(c, draftBlocks, 1);
  assert.ok(issues[0].startsWith("모양:"), issues.join("\n"));
});

// ---------------------------------------------------------------------------
// planBlockCap

test("planBlockCap: 0.5쪽은 3, 1쪽은 6", () => {
  assert.equal(planBlockCap(0.5), 3);
  assert.equal(planBlockCap(1), 6);
});

// ---------------------------------------------------------------------------
// resultShape(추진성과 모양, 2026-09-27 표현 보강)

test("cleanComposition: resultShape은 목록 밖 값이면 bullets로", { skip: NO_SEED_CARDS }, () => {
  const { hayKey, known } = evidenceOf(card);
  const withKnown = cleanComposition(outBase({ resultShape: "chart" } as any), hayKey, known).composition;
  assert.equal(withKnown.resultShape, "chart");
  const withUnknown = cleanComposition(outBase({ resultShape: "없는모양" } as any), hayKey, known).composition;
  assert.equal(withUnknown.resultShape, "bullets");
  const withMissing = cleanComposition(outBase(), hayKey, known).composition;
  assert.equal(withMissing.resultShape, "bullets", "안 주면 기본 bullets");
});

test("applyCompositionEdit: resultShape은 목록 안 값만 바뀌고, 목록 밖·안 주면 그대로", () => {
  const c = baseComposition({ resultShape: "bullets" });
  const e = editOf(c);
  const toCards = applyCompositionEdit(c, { ...e, resultShape: "cards" }).composition;
  assert.equal(toCards.resultShape, "cards");
  const bad = applyCompositionEdit(c, { ...e, resultShape: "없는모양" }).composition;
  assert.equal(bad.resultShape, "bullets", "목록 밖 값은 그대로");
  const noShape = applyCompositionEdit(c, { ...e, resultShape: undefined }).composition;
  assert.equal(noShape.resultShape, "bullets", "안 주면 그대로");
});

test("compositionFit: 추진성과 모양(bullets·cards·chart)마다 total이 다를 수 있음(cards·chart는 bullets와 다른 셈)", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "bullets", cells: 2 })] });
  const bullets = compositionFit({ ...c, resultShape: "bullets" }, 1);
  const cards = compositionFit({ ...c, resultShape: "cards" }, 1);
  const chart = compositionFit({ ...c, resultShape: "chart" }, 1);
  assert.notEqual(cards.total, bullets.total, `cards ${cards.total} !== bullets ${bullets.total}`);
  assert.notEqual(chart.total, bullets.total, `chart ${chart.total} !== bullets ${bullets.total}`);
});

// ---------------------------------------------------------------------------
// 머리 모드 판면 예산(사업 단위 조판, 2026-09-27) — compositionFit·blockBudgets의 head 인자

test("compositionFit: head=sub는 머리(대상사업 상자·실행과제 띠)를 뺀 만큼 all보다 total이 작음", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "bullets", cells: 2 })] });
  const all = compositionFit(c, 1);
  const sub = compositionFit(c, 1, "sub");
  assert.ok(sub.total < all.total, `sub ${sub.total} < all ${all.total}`);
});

test("blockBudgets: head=sub는 머리를 뺀 만큼 블록 영역이 넓어 all보다 예산 합이 크거나 같음", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "bullets", cells: 2 }), planBlock({ kind: "cards", cells: 2 })] });
  const all = blockBudgets(c, 1);
  const sub = blockBudgets(c, 1, "sub");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  assert.ok(sum(sub) >= sum(all), `sub ${sum(sub)} >= all ${sum(all)}`);
});

test("planPrompt: 추진성과 모양 글이 들어가고 자리표시가 남지 않음", () => {
  const p = reportDraftPrompts().prompts;
  const c = baseComposition({ resultShape: "chart" });
  const text = planPrompt(p, c, 1);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.ok(text.length > 0);
});

// ---------------------------------------------------------------------------
// planLimitIssues — 수치 표(table): 행 수는 「칸 수:」, 값 칸 하나하나는 「글 한도:」

const mkTable = (rows: number, cols: number, cellText = "1건"): Block => ({
  kind: "table",
  label: "라벨",
  title: "",
  variant: "",
  text: "",
  items: ["구분", ...Array.from({ length: cols }, (_, i) => `’2${4 + i}년`)],
  cells: Array.from({ length: rows }, () => ({ head: "행", tag: "", bullets: Array.from({ length: cols }, () => cellText), note: "" })),
  rows: [],
  series: [],
  badge: "",
});

test("planLimitIssues: table은 행 수가 구성안보다 많으면(compare와 같은 규칙) 「칸 수:」", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "table", variant: "", cells: 2, label: "라벨" })] });
  const moreRows = planLimitIssues(c, [mkTable(4, 3)], 1);
  assert.ok(moreRows.some((x) => x.startsWith("칸 수:")), moreRows.join("\n"));
  const sameRows = planLimitIssues(c, [mkTable(2, 3)], 1);
  assert.ok(!sameRows.some((x) => x.startsWith("칸 수:")), sameRows.join("\n"));
});

test("planLimitIssues: table은 값 칸 하나하나가 한 칸이라, 한 값 칸의 글이 길면(다른 값 칸과 합치지 않고도) 「글 한도:」", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "table", variant: "", cells: 2, label: "라벨" })] });
  const long = planLimitIssues(c, [mkTable(2, 3, "가".repeat(200))], 1);
  assert.ok(long.some((x) => x.startsWith("글 한도:")), long.join("\n"));
  const short = planLimitIssues(c, [mkTable(2, 3)], 1);
  assert.ok(!short.some((x) => x.startsWith("글 한도:")), short.join("\n"));
});

test("compositionIssues: 고른 틀의 핵심 도식(이 과제만의 요소)이 구성안에 없으면 맨 앞에 「틀:」 경고(근거 부족 이유 포함), 있으면 없음", () => {
  // 1-나(2026-09-28): 현장 목소리형인데 시민 말 원문이 없어 현장 목소리(voices)가 빠짐
  const without = baseComposition({ story: "현장 목소리형", blocks: [planBlock({ kind: "banner" }), planBlock({ kind: "bullets", label: "현장 요구", materials: ["m1"] })], materials: [material({ id: "m1", kind: "fact", found: true })] as never });
  const issues = compositionIssues(without, 1);
  assert.ok(issues[0].startsWith("틀: 고른 「현장 목소리형」의 현장 목소리"), issues[0]);
  assert.match(issues[0], /원문 인용|현장의 말/);
  // 현장 목소리형의 핵심 도식 = 현장 목소리 + 막대(frameworks.ts FRAMEWORKS ④) — 둘 다 있으면 경고 없음
  const withVoices = baseComposition({ story: "현장 목소리형", blocks: [planBlock({ kind: "voices", cells: 2, materials: ["m1"] }), planBlock({ kind: "chart", cells: 2, materials: ["m1"] })], materials: [material({ id: "m1", kind: "quote", found: true })] as never });
  assert.ok(!compositionIssues(withVoices, 1).some((w) => w.startsWith("틀:")), "핵심 도식이 모두 있으면 경고 없음");
  assert.ok(!compositionIssues(baseComposition({ story: "섞음" }), 1).some((w) => w.startsWith("틀:")), "섞음은 틀 경고 없음");
});

test("extraBlocks·planLimitIssues: 구성안에 없는 블록을 더 넣으면 그 블록을 짚고 고치기 요청 맨 앞에 「짜임:」(1-나 2026-09-28 — 연도 흐름 하나를 더 넣음)", async () => {
  const { extraBlocks } = await import("./composition.ts");
  const c = baseComposition({ blocks: [planBlock({ kind: "banner", cells: 1 }), planBlock({ kind: "bullets", label: "현장 요구", cells: 2 })] });
  const blk = (kind: Block["kind"], label = "", variant = ""): Block => ({ kind, label, title: "", variant, text: "배너", items: kind === "bullets" ? ["가", "나"] : [], cells: kind === "timeline" ? [1, 2, 3].map(() => ({ head: "’25", tag: "", bullets: ["가"], note: "" })) : [], rows: [], series: [], badge: "" });
  const drafted = [blk("banner"), blk("bullets", "현장 요구"), blk("timeline", "추진 경과", "chevron")];
  assert.deepEqual(extraBlocks(c, drafted).map((b) => b.label), ["추진 경과"]);
  const issues = planLimitIssues(c, drafted, 1);
  assert.ok(issues[0].startsWith("짜임: 구성안에 없는 블록 1개([추진 경과] 연도 흐름)"), issues[0]);
  assert.deepEqual(extraBlocks(c, drafted.slice(0, 2)), [], "짜임 그대로면 없음");
});

test("outlineSiblingLayout: 초안 없이 구성안만 있는 형제도 짜임(주 틀·보조 틀·블록 서명)을 냄 — 같은 사업 카드들이 구성안 단계에서 서로의 틀을 보게(2026-10-10)", () => {
  const c = baseComposition({ story: "왜-어떻게형", subStory: "단계 전개형", blocks: [planBlock({ kind: "define" }), planBlock({ kind: "cards", variant: "arrow" }), planBlock({ kind: "steps", variant: "row" })] });
  assert.deepEqual(outlineSiblingLayout("2-1 다. 구성안", c), { label: "2-1 다. 구성안", story: "왜-어떻게형", subStory: "단계 전개형", signature: "define → cards:arrow → steps" }, "기본 모양(steps:row)은 이름만 — blockSignature와 같음");
  assert.equal(outlineSiblingLayout("x", { ...c, blocks: [] }), null, "블록 없는 구성안은 뺌");
  assert.equal(outlineSiblingLayout("x", { ...c, subStory: undefined })?.subStory, undefined);
});

// ---------------------------------------------------------------------------
// 성과 축(2026-10-14 — 과제 목표의 축마다 재료를 짝지어 집필에 넘김)

test("성과 축: 정리 — 빈 축·겹친 축(띄어쓰기 무시) 버림, 재료표에 없는 번호·겹친 번호 버림, 축 이름 12자, 앞 4개까지, 옛 구성안(필드 없음)은 그대로", () => {
  const mats = [material({ id: "m1", kind: "figure", text: "233건" }), material({ id: "m2", text: "평균 응답 25.5초" }), material({ id: "m3", kind: "need", text: "규정준수율" })];
  const out = outBase({
    materials: mats as any,
    axes: [
      { axis: "규정준수", materials: ["m1", "m9", "m1"] },
      { axis: "", materials: ["m2"] },
      { axis: "규정 준수", materials: ["m2"] },
      { axis: "업무효율", materials: [" m2 "] },
      { axis: "열두 자를 넘는 아주 긴 축 이름", materials: [] },
      { axis: "넷째", materials: ["m3"] },
      { axis: "다섯째", materials: ["m2"] },
    ],
  } as any);
  assert.ok(compositionOutSchema().safeParse(out).success, "축 이름은 문자열(enum 아님)");
  const { composition } = cleanComposition(out, "", new Set());
  assert.deepEqual(composition.axes, [
    { axis: "규정준수", materials: ["m1"] },
    { axis: "업무효율", materials: ["m2"] },
    { axis: "열두 자를 넘는 아주", materials: [] },
    { axis: "넷째", materials: ["m3"] },
  ]);
  assert.ok(composition.axes![2].axis.length <= 12, "12자에서 자르고 끝 공백 걷음");
  // 필드가 없거나 축이 모두 버려지면 필드 없음
  assert.ok(compositionOutSchema().safeParse(outBase()).success, "axes 없어도 파싱");
  assert.equal("axes" in cleanComposition(outBase(), "", new Set()).composition, false);
  assert.equal("axes" in cleanComposition(outBase({ axes: [{ axis: " ", materials: [] }] } as any), "", new Set()).composition, false);
  // 옛 구성안(필드 없음)도 읽히고 경고·집필 요청 글이 예전과 같음
  const old = readComposition(JSON.parse(JSON.stringify(baseComposition())))!;
  assert.ok(old);
  assert.ok(!compositionIssues(old, 1).some((w) => w.startsWith("성과 축:")));
  assert.doesNotMatch(planPrompt(reportDraftPrompts().prompts, old, 1), /성과 축:/);
});

test("성과 축: 근거 재료가 없는 축(재료 없음·자료 필요뿐)은 경고, 집필 요청 글에 「성과 축: 축 ← 재료」 줄", () => {
  const c = baseComposition({
    materials: [
      { id: "m1", kind: "figure", text: "233건", when: "", source: "첨부", quote: "233건", found: true },
      { id: "m3", kind: "need", text: "규정준수율", when: "", source: "", quote: "", found: false },
      { id: "m7", kind: "fact", text: "평균 응답 25.5초", when: "", source: "카드", quote: "25.5초", found: true },
    ],
    axes: [
      { axis: "규정준수", materials: ["m1", "m3"] },
      { axis: "업무효율", materials: [] },
      { axis: "만족도", materials: ["m3"] },
    ],
  });
  const issues = compositionIssues(c, 1).filter((w) => w.startsWith("성과 축:"));
  assert.deepEqual(issues, [
    "성과 축: 「업무효율」에 근거 재료가 없음 — 재료표에서 그 축을 보여 줄 실적·기준 대비 값을 찾거나 자료 필요로",
    "성과 축: 「만족도」에 근거 재료가 없음 — 재료표에서 그 축을 보여 줄 실적·기준 대비 값을 찾거나 자료 필요로",
  ]);
  const text = planPrompt(reportDraftPrompts().prompts, { ...c, axes: [{ axis: "업무효율", materials: ["m3", "m7"] }, { axis: "규정준수", materials: [] }] }, 1);
  assert.match(text, /\n- 성과 축: 업무효율 ← m3·m7\n/);
  assert.match(text, /\n- 성과 축: 규정준수 ← —\n/);
  assert.ok(text.indexOf("- 평가 논점:") < text.indexOf("- 성과 축:") && text.indexOf("- 성과 축:") < text.indexOf("- 이야기 틀:"), "논점과 이야기 틀 사이");
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  // 사람 편집 뒤에도 축은 남음
  assert.deepEqual(applyCompositionEdit(c, editOf(c)).composition.axes, c.axes);
});

test("글 한도(2026-10-15 후속 5): 나란한 칸(상자 도식 2칸 이상·전후 패널)은 「같은 줄 수로(가장 짧은 칸도 N−1줄 이상)」, 불릿·수치 띠·1칸 블록은 붙지 않음", () => {
  assert.equal(sideBySide({ kind: "cards", variant: "plain", cells: 3 }), true);
  assert.equal(sideBySide({ kind: "compare", variant: "panels", cells: 1 }), true, "전후 패널은 행이 하나여도 두 패널");
  assert.equal(sideBySide({ kind: "timeline", variant: "dots", cells: 3 }), false);
  assert.equal(sideBySide({ kind: "stats", variant: "", cells: 3 }), false);
  assert.equal(sideBySide({ kind: "steps", variant: "row", cells: 1 }), false);
  assert.equal(limitText({ lines: 3, perLine: 14, unit: "cell", side: true }), "칸마다 최대 3줄 · 한 줄 약 14자 · 나란한 칸은 같은 줄 수로(가장 짧은 칸도 2줄 이상)");
  assert.equal(limitText({ lines: 1, perLine: 14, unit: "cell", side: true }), "칸마다 최대 1줄 · 한 줄 약 14자", "1줄이면 아래 한도 없음");
  assert.equal(limitText({ lines: 3, perLine: 14, unit: "cell" }), "칸마다 최대 3줄 · 한 줄 약 14자");
  const c = baseComposition({ blocks: [planBlock({ kind: "bullets", cells: 2, label: "" }), planBlock({ kind: "cards", variant: "plain", cells: 3, label: "라벨" })] });
  const limits = blockLimits(c, 1);
  assert.equal(limits[0]?.side, undefined);
  assert.equal(limits[1]?.side, true);
  assert.ok(planPrompt(reportDraftPrompts().prompts, c, 1).includes(limitText(limits[1])));
});

// ---------------------------------------------------------------------------
// 핵심 수치 띠(2026-10-28 — 주요사업 새 구성안·초안에는 두지 않음, frameworks.ts BIZ_RETIRED_SHAPES)

test("cleanComposition(주요사업): AI가 넣은 핵심 수치 띠 블록은 빼고 「구성:」 경고, 다른 블록의 대안에서도 뺌", () => {
  const out = outBase({
    blocks: [
      { kind: "steps", variant: "row", label: "추진내용", purpose: "단계", cells: 3, materials: [], figures: [], alts: [{ kind: "stats", variant: "", why: "수치" }, { kind: "timeline", variant: "chevron", why: "시기" }] },
      { kind: "stats", variant: "", label: "", purpose: "수치", cells: 3, materials: [], figures: [] },
    ] as any,
  });
  const { composition, warnings } = cleanComposition(out, "", new Set());
  assert.deepEqual(composition.blocks.map((b) => b.kind), ["steps"]);
  assert.deepEqual(composition.blocks[0].alts?.map((a) => a.kind), ["timeline"]);
  assert.ok(warnings.some((w) => /^구성: 핵심 수치 띠 1개를 뺐습니다 — 주요사업 초안은 따로 떨어진 수치 띠를 쓰지 않습니다/.test(w)), warnings.join(" / "));
});

test("applyCompositionEdit·shapeChoices(주요사업): 핵심 수치 띠로 새로 바꾸거나 더할 수 없고(이유 notes), 원래 수치 띠 블록은 그대로 둘 수 있음 — 경영관리는 그대로 고름", () => {
  const c = baseComposition({ blocks: [planBlock({ kind: "steps", variant: "row", cells: 3 }), planBlock({ kind: "stats", cells: 3 })] });
  const e = editOf(c);
  const changed = applyCompositionEdit(c, { ...e, blocks: e.blocks.map((b, i) => (i === 0 ? { ...b, kind: "stats", variant: "" } : b)) });
  assert.deepEqual(changed.composition.blocks.map((b) => b.kind), ["steps", "stats"], "새로 바꾼 띠는 원래 모양으로, 원래 띠는 그대로");
  assert.ok(changed.notes.some((n) => /^핵심 수치 띠: 주요사업 초안은 따로 떨어진 수치 띠를 쓰지 않습니다/.test(n)), changed.notes.join(" / "));
  const added = applyCompositionEdit(c, { ...e, blocks: [...e.blocks, { from: null, kind: "stats", variant: "", label: "", purpose: "", cells: 3, materials: [], memo: "", figures: [] }] });
  assert.deepEqual(added.composition.blocks.map((b) => b.kind), ["steps", "stats", "bullets"], "새 블록은 불릿으로");
  const pick = (pos: number, mode: "change" | "add") => shapeChoices(c, e, { pos, mode }, 1).find((x) => x.code === "stats")!;
  assert.equal(pick(0, "add").ok, false);
  assert.match(pick(0, "add").why, /따로 떨어진 수치 띠를 쓰지 않습니다/);
  assert.equal(pick(0, "change").ok, false);
  assert.equal(pick(1, "change").ok, true, "원래 수치 띠 블록은 그 모양을 지킬 수 있음");
  const mg = baseComposition({ blocks: [planBlock({ kind: "steps", variant: "row", cells: 3 })], mg: { parts: [] } as any });
  const me = editOf(mg);
  assert.deepEqual(applyCompositionEdit(mg, { ...me, blocks: me.blocks.map((b) => ({ ...b, kind: "stats", variant: "" })) }).composition.blocks.map((b) => b.kind), ["stats"], "경영관리는 고를 수 있음");
});
