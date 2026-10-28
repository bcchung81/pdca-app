// 경평 초안 「짜임 사전」(lib/reports/frameworks.ts) 순수 로직 시험: 이야기 틀 목록·블록 순서(stories.md 대조), 도식 25가지 코드·이름·칸 범위,
// 근거 조건(shapeAvailability)·틀 준비도(frameworkReadiness).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { BLOCK_KINDS, STORIES, VARIANTS } from "./blocks.ts";
import { MG_FRAMEWORKS } from "./frameworks-mg.ts";
import {
  BIZ_RETIRED_SHAPES,
  FRAMEWORKS,
  SHAPES,
  SHAPE_NAMES,
  type EvidenceMaterial,
  type EvidenceSource,
  cellRange,
  clampCells,
  defaultCells,
  frameworkReadiness,
  shapeAvailability,
  shapeCode,
  shapeName,
} from "./frameworks.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const storiesMd = readFileSync(resolve(ROOT, "resources/prompts/report-draft/stories.md"), "utf8");
const storiesLines = storiesMd.split("\n");

// ---------------------------------------------------------------------------
// FRAMEWORKS — story 목록·블록 순서

test("FRAMEWORKS: story 목록 = STORIES(blocks.ts)와 같은 순서·같은 원소", () => {
  assert.deepEqual(
    FRAMEWORKS.map((f) => f.story),
    STORIES,
  );
});

test("FRAMEWORKS: 틀마다(섞음 제외) 블록 종류 순서가 stories.md의 그 틀 줄에 같은 순서로 나옴(bullets는 뺌)", () => {
  for (const fw of FRAMEWORKS) {
    if (fw.story === "섞음") continue;
    const line = storiesLines.find((l) => l.trimStart().startsWith(fw.no));
    assert.ok(line, `틀 「${fw.story}」(${fw.no}) 줄이 stories.md에 없음`);
    assert.ok(line!.includes(fw.story), `틀 「${fw.story}」 이름이 줄에 없음: ${line}`);
    const kinds = fw.blocks.map((b) => b.kind).filter((k) => k !== "bullets");
    let cursor = 0;
    for (const kind of kinds) {
      const idx = line!.indexOf(kind, cursor);
      assert.ok(idx >= 0, `틀 「${fw.story}」: 「${kind}」을(를) 줄에서 순서대로 못 찾음 — 줄: ${line}`);
      cursor = idx;
    }
  }
});

// ---------------------------------------------------------------------------
// SHAPES — 코드·이름

test("SHAPES: 코드 = BLOCK_KINDS × VARIANTS 모든 조합과 정확히 같음(빠짐·남음 없음), SHAPE_NAMES가 코드마다 있음", () => {
  const expected = new Set<string>();
  for (const kind of BLOCK_KINDS) {
    const vs = VARIANTS[kind];
    // 모양 목록의 빈 글(table 기본 — 2026-10-12)은 코드가 kind만
    if (vs) for (const v of vs) expected.add(v ? `${kind}:${v}` : kind);
    else expected.add(kind);
  }
  const actual = new Set(SHAPES.map((s) => s.code));
  assert.deepEqual([...actual].sort(), [...expected].sort());
  for (const s of SHAPES) assert.ok(SHAPE_NAMES[s.code], `SHAPE_NAMES에 ${s.code} 없음`);
});

test("shapeCode·shapeName", () => {
  assert.equal(shapeCode("cards", ""), "cards:plus", "모양이 없으면 그 종류의 첫째 모양");
  assert.equal(shapeCode("cards", "vs"), "cards:vs");
  assert.equal(shapeCode("stats", ""), "stats", "모양이 없는 종류는 kind만");
  assert.equal(shapeName("cards", "vs"), "대비 2칸(VS)");
  assert.equal(shapeName("모르는종류", ""), "모르는종류", "모르는 코드는 코드 그대로");
});

// ---------------------------------------------------------------------------
// 칸 수 범위

test("cellRange·clampCells·defaultCells: 모든 모양에서 min ≤ def ≤ max, 특수 범위, 범위 밖 값은 잘림", () => {
  for (const s of SHAPES) {
    const { min, max } = cellRange(s.kind, s.variant);
    const def = defaultCells(s.kind, s.variant);
    assert.ok(min <= def && def <= max, `${s.code}: ${min} <= ${def} <= ${max}`);
  }
  assert.deepEqual(cellRange("cards", "vs"), { min: 2, max: 2 }, "cards:vs는 2·2");
  assert.deepEqual(cellRange("steps", "zigzag"), { min: 4, max: 4 }, "steps:zigzag는 4");
  assert.equal(clampCells("cards", "vs", 10), 2, "범위 밖 값은 잘림(위)");
  assert.equal(clampCells("bullets", "", 0), 1, "범위 밖 값은 잘림(아래)");
});

// ---------------------------------------------------------------------------
// shapeAvailability — 근거 조건

const mat = (over: Partial<EvidenceMaterial> = {}): EvidenceMaterial => ({ kind: "fact", text: "글", when: "", quote: "", found: true, ...over });
const src = (materials: EvidenceMaterial[] = [], blocks: EvidenceSource["blocks"] = []): EvidenceSource => ({ materials, blocks });
const OWN = ["quotes", "voices", "define", "case", "hub", "chart"] as const;
const BASE = ["cards", "compare", "steps", "timeline", "stats", "qa", "table", "bullets", "banner", "band", "subhead"] as const;

test("shapeAvailability: 재료 없으면 이 과제만의 요소는 ok false, 기본 도식·글·띠는 ok true", () => {
  const avail = shapeAvailability(src());
  for (const kind of OWN) assert.equal(avail[kind].ok, false, kind);
  for (const kind of BASE) assert.equal(avail[kind].ok, true, kind);
});

test("shapeAvailability: found quote 재료 1개면 quotes·voices ok", () => {
  const avail = shapeAvailability(src([mat({ kind: "quote", found: true })]));
  assert.equal(avail.quotes.ok, true);
  assert.equal(avail.voices.ok, true);
});

test("shapeAvailability: found=false인 재료는 셈에 넣지 않음", () => {
  const avail = shapeAvailability(src([mat({ kind: "quote", found: false })]));
  assert.equal(avail.quotes.ok, false);
});

test("shapeAvailability: figure 재료는 시점(when)이 있는 것 2개부터 chart ok", () => {
  const one = shapeAvailability(src([mat({ kind: "figure", when: "’25년", found: true })]));
  assert.equal(one.chart.ok, false, "1개는 부족");
  const noWhen = shapeAvailability(src([mat({ kind: "figure", when: "’25년", found: true }), mat({ kind: "figure", when: "", found: true })]));
  assert.equal(noWhen.chart.ok, false, "시점 없는 재료는 안 셈");
  const two = shapeAvailability(src([mat({ kind: "figure", when: "’25년", found: true }), mat({ kind: "figure", when: "’26년", found: true })]));
  assert.equal(two.chart.ok, true);
});

test("shapeAvailability: 재료 글에 기관 이름 2곳(orgNames 규칙에 맞는 끝말)이면 hub ok", () => {
  const one = shapeAvailability(src([mat({ text: "해양경찰청 협업", found: true })]));
  assert.equal(one.hub.ok, false, "1곳은 부족");
  const two = shapeAvailability(src([mat({ text: "해양경찰청 한국해양교통안전공단 협업", found: true })]));
  assert.equal(two.hub.ok, true);
});

test("shapeAvailability: blocks의 ai·alts에 있는 종류는 재료 없어도 ok(AI 이유) — 사람이 안 고친 블록의 kind도 AI 추천으로 셈, 사람이 고친(by human) 블록의 kind는 안 셈", () => {
  const notHuman = shapeAvailability(src([], [{ kind: "quotes" }]));
  assert.equal(notHuman.quotes.ok, true, "사람이 안 고친 블록의 kind는 AI 추천으로 셈");
  assert.match(notHuman.quotes.why, /AI/);

  const human = shapeAvailability(src([], [{ kind: "quotes", by: "human" }]));
  assert.equal(human.quotes.ok, false, "사람이 고친 블록의 kind는 AI 추천으로 안 셈(ai·alts가 없을 때)");

  const aiAlts = shapeAvailability(src([], [{ kind: "bullets", by: "human", ai: { kind: "quotes" }, alts: [{ kind: "case" }] }]));
  assert.equal(aiAlts.quotes.ok, true, "ai 필드는 사람이 고쳐도 남음");
  assert.equal(aiAlts.case.ok, true, "alts도 마찬가지");
});

// ---------------------------------------------------------------------------
// frameworkReadiness

test("frameworkReadiness: 틀의 이 과제만의 요소 중 고를 수 있는 것 수·모자란 이름", () => {
  const fw = FRAMEWORKS.find((f) => f.story === "단계 전개형")!; // 이 과제만의 요소: quotes·case
  const none = frameworkReadiness(fw, shapeAvailability(src()));
  assert.equal(none.total, 2);
  assert.equal(none.ready, 0);
  assert.deepEqual(none.missing.sort(), [shapeName("quotes", ""), shapeName("case", "")].sort());

  const some = frameworkReadiness(fw, shapeAvailability(src([mat({ kind: "quote", found: true })])));
  assert.equal(some.ready, 1);
  assert.deepEqual(some.missing, [shapeName("case", "")]);
});

// ---------------------------------------------------------------------------
// 여는 블록·주 틀 + 보조 틀(2026-10-09 — 평가 라운드 O에서 첫 블록 불릿 8/8, 섞음 5/8)

test("stories.md: 「여는 블록」 규칙이 있고 틀마다 여는 블록(블록 순서의 첫 블록)이 그 틀 줄의 첫 블록 종류", () => {
  assert.match(storiesMd, /## 여는 블록/);
  for (const fw of FRAMEWORKS) {
    if (!fw.blocks.length) continue;
    const line = storiesLines.find((l) => l.trimStart().startsWith(fw.no))!;
    const body = line.slice(line.indexOf(":") + 1);
    const firstKind = BLOCK_KINDS.filter((k) => body.includes(k)).sort((a, b) => body.indexOf(a) - body.indexOf(b))[0];
    assert.equal(firstKind, fw.blocks[0].kind, `${fw.story}: 줄의 첫 블록 ${firstKind} ≠ 틀의 첫 블록 ${fw.blocks[0].kind}`);
  }
});

test("stories.md: 섞음은 「주 틀 + 보조 틀」로 설명함(구성안 답에 섞음이 없음)", () => {
  assert.match(storiesMd, /주 틀[^\n]*보조 틀/);
  assert.doesNotMatch(storiesMd, /하나를 고르거나 섞습니다/);
});

test("stories.md 여는 블록: 여는 블록 재료가 없다고 틀을 바꾸지 않음(평가 라운드 Q — 인용·한계 근거가 없어 Q&A로 열 수 있는 왜-어떻게형으로 몰림 4/8)", () => {
  const sec = storiesMd.slice(storiesMd.indexOf("## 여는 블록"));
  assert.match(sec, /틀을 바꾸지 않습니다/);
  assert.match(sec, /왜-어떻게형/);
});

test("BIZ_RETIRED_SHAPES(2026-10-28): 주요사업 이야기 틀 12종에는 핵심 수치 띠가 없고, 경영관리 틀은 그대로 추진성과 행에 씀", () => {
  assert.deepEqual([...BIZ_RETIRED_SHAPES], ["stats"]);
  for (const fw of FRAMEWORKS) assert.ok(!fw.blocks.some((b) => BIZ_RETIRED_SHAPES.includes(shapeCode(b.kind, b.variant ?? ""))), fw.story);
  assert.ok(MG_FRAMEWORKS.some((fw) => fw.blocks.some((b) => b.kind === "stats")));
  assert.doesNotMatch(storiesMd.split("<!-- @stories -->")[1].split("\n").filter((l) => /^[①-⑫]/.test(l)).join("\n"), /stats/, "stories.md 틀 줄에도 없음");
});
