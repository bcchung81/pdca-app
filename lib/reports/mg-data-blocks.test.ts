// 경영관리 구성안 「데이터 블록 넣기」(lib/reports/mg-data-blocks.ts, 2026-10-29 스타일 규칙 S2 보장) 시험 — 지어낸 재료·블록만 씀.

import assert from "node:assert/strict";
import { test } from "node:test";
import { mgSpecHeight } from "./business-layout.ts";
import { type Composition, type Material, type PlanBlock, planBlocks } from "./composition.ts";
import { PAGE_MM } from "./fit.ts";
import { addMgDataBlocks } from "./mg-data-blocks.ts";
import { headOnly } from "./mg-draft.ts";
import { MG_LIMITS, mgBundleIssues, mgCompositionIssues } from "./mg-outline.ts";
import type { MgPart } from "./mg-types.ts";
import { warningLevel } from "./warning-levels.ts";

const part = (key: string, mark: string): MgPart => ({ key, evalNo: 1, evalTitle: "평가내용", themeNo: 2, themeTitle: "대주제", mark, title: `${mark} 절`, story: "", why: "" });
const P1 = part("1.2.가", "가");
const P2 = part("1.2.나", "나");
const mat = (id: string, text: string, quote = text): Material => ({ id, kind: "figure", text, when: "", source: "카드", quote, found: true });
const blk = (at: string, kind: PlanBlock["kind"], label: string, materials: string[], more: Partial<PlanBlock> = {}): PlanBlock => ({ kind, variant: "", label, purpose: "목적", cells: 2, materials, figures: [], at, ...more });
const plan = (blocks: PlanBlock[], materials: Material[]): Composition => ({ version: 1, message: "", points: [], story: "", storyWhy: "", alternative: "", blocks, results: "", resultShape: "bullets", materials, memo: "", mg: { indicator: "지표", parts: [P1, P2] } });

/** 한 줄에 같은 단위 값 셋(막대가 그려짐) */
const ROW = mat("m1", "만족도 평가 총점: 가 항목 85점, 나 항목 88점, 다 항목 82점");
/** 줄마다 값 하나(표 행 — 막대 견줄 값이 없음) */
const LIST = mat("m2", "지역별 응답 수", "가 지역 | 120건\n나 지역 | 135건\n다 지역 | 150건\n라 지역 | 170건");
const PLAIN = mat("m3", "체계 개편 추진");
const OUT = mat("m4", "운영 개선 완료");

test("넣음: 수치 묶음 재료를 쓰는 절에 데이터 블록이 없으면 닫는 「추진성과」 앞에 막대 든 수치 표 하나(라벨 「추진내용」·재료는 그 묶음), 참고 경고, 점검 경고는 사라짐", () => {
  const c = plan([blk(P1.key, "cards", "추진배경", ["m1", "m3"]), blk(P1.key, "stats", "추진성과", ["m4"]), blk(P2.key, "bullets", "추진내용", ["m3"]), blk(P2.key, "stats", "추진성과", ["m4"])], [ROW, PLAIN, OUT]);
  assert.equal(mgBundleIssues(c).length, 1);
  const r = addMgDataBlocks(c, 2);
  const bs = r.composition.blocks;
  assert.deepEqual(bs.map((b) => `${b.at} ${b.kind}${b.variant ? `:${b.variant}` : ""} ${b.label}`), ["1.2.가 cards 추진배경", "1.2.가 table:bars 추진내용", "1.2.가 stats 추진성과", "1.2.나 bullets 추진내용", "1.2.나 stats 추진성과"]);
  assert.deepEqual(bs[1].materials, ["m1"]);
  assert.equal(bs[1].cells, 3, "새로 넣는 표의 보통 칸 수(frameworks.ts defaultCells)");
  assert.equal(bs[1].purpose, "막대 든 수치 표: 수치 묶음 재료 m1(점 값 3개)를 근거 값 그대로 보임");
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /^데이터 블록: 평가내용 1 · 대주제 2 · 가\. 가 절에 수치 묶음 재료 m1\(점 값 3개\)로 막대 든 수치 표 블록\(라벨 「추진내용」\)을 닫는 「추진성과」 앞에 넣었습니다/);
  assert.equal(warningLevel(r.notes[0]), "info");
  assert.deepEqual(mgBundleIssues(r.composition), []);
  assert.ok(!mgCompositionIssues(r.composition).some((w) => w.startsWith("절:")), "닫기 판정 그대로");
  assert.equal(c.blocks.length, 4, "받은 구성안은 바꾸지 않음");
});

test("모양: 값이 줄마다 하나뿐인 묶음(표 행)은 막대가 안 그려져 수치 표 — 묶음이 둘이면 값이 많은 재료, 닫는 블록이 없으면 절 끝", () => {
  const c = plan([blk(P1.key, "cards", "추진배경", ["m1", "m2"]), blk(P1.key, "bullets", "향후계획", ["m3"])], [ROW, LIST, PLAIN]);
  const r = addMgDataBlocks(c, null);
  const added = r.composition.blocks.at(-1)!;
  assert.equal(added.kind, "table");
  assert.equal(added.variant, "", "LIST(값 4개)가 ROW(값 3개)보다 많음 → 줄마다 값 하나 → 수치 표");
  assert.deepEqual(added.materials, ["m2"]);
  assert.match(r.notes[0], /m2\(건 값 4개\)로 수치 표 블록\(라벨 「추진내용」\)을 절 끝에 넣었습니다/);
});

test("넣지 않음: 재료표에 묶음 재료가 없거나 그 절 블록이 쓰지 않으면, 이미 데이터 블록이 있으면(그대로), 절 다시 짜기(only)는 그 절만", () => {
  const none = plan([blk(P1.key, "cards", "추진배경", ["m3"]), blk(P1.key, "stats", "추진성과", ["m4"])], [PLAIN, OUT]);
  assert.deepEqual(addMgDataBlocks(none, 2), { composition: none, notes: [] }, "AI가 묶음을 재료로 안 뽑음 → 근거 없는 표를 만들지 않음");
  const unused = plan([blk(P1.key, "cards", "추진배경", ["m3"]), blk(P1.key, "stats", "추진성과", ["m4"])], [ROW, PLAIN, OUT]);
  assert.equal(addMgDataBlocks(unused, 2).notes.length, 0, "묶음 재료가 재료표에만 있고 어느 블록도 안 씀");
  for (const has of [blk(P1.key, "table", "현황", ["m1"]), blk(P1.key, "table", "현황", ["m1"], { variant: "result" }), blk(P1.key, "chart", "추진배경", ["m1"])]) {
    const c = plan([blk(P1.key, "cards", "추진배경", ["m1"]), has, blk(P1.key, "stats", "추진성과", ["m4"])], [ROW, OUT]);
    assert.deepEqual(addMgDataBlocks(c, 2), { composition: c, notes: [] }, `${has.kind}:${has.variant}`);
  }
  const two = plan([blk(P1.key, "cards", "추진배경", ["m1"]), blk(P1.key, "stats", "추진성과", ["m4"]), blk(P2.key, "cards", "추진배경", ["m2"]), blk(P2.key, "stats", "추진성과", ["m4"])], [ROW, LIST, OUT]);
  const only = addMgDataBlocks(two, 2, P2.key);
  assert.deepEqual(only.composition.blocks.filter((b) => b.kind === "table").map((b) => b.at), [P2.key]);
  assert.equal(addMgDataBlocks(two, 2).notes.length, 2, "only가 없으면 두 절 모두");
});

test("넣지 않음: 블록 수 상한(MG_LIMITS.blocks)이나 분량 어림(보통 모양 높이 > 배정 × 1.25)을 넘으면 — 경고 「데이터 블록」은 그대로", () => {
  const filler = Array.from({ length: MG_LIMITS.blocks - 2 }, () => blk(P2.key, "bullets", "추진내용", ["m3"]));
  const full = plan([blk(P1.key, "cards", "추진배경", ["m1"]), blk(P1.key, "stats", "추진성과", ["m4"]), ...filler], [ROW, PLAIN, OUT]);
  assert.equal(full.blocks.length, MG_LIMITS.blocks);
  assert.deepEqual(addMgDataBlocks(full, null), { composition: full, notes: [] });
  assert.equal(mgBundleIssues(full).length, 1);
  const c = plan([blk(P1.key, "cards", "추진배경", ["m1"]), blk(P1.key, "stats", "추진성과", ["m4"])], [ROW, OUT]);
  const h = mgSpecHeight({ ...headOnly(c.mg!.parts), blocks: planBlocks(c), mg: { indicator: "", parts: c.mg!.parts, at: c.blocks.map((b) => b.at!) } });
  const tight = h / 1.25 / PAGE_MM.height;
  assert.equal(addMgDataBlocks(c, tight).notes.length, 0, "지금 어림이 이미 배정 × 1.25 → 표를 더하면 넘음");
  assert.equal(addMgDataBlocks(c, tight * 2).notes.length, 1, "배정이 넉넉하면 넣음");
  assert.equal(addMgDataBlocks(c, null).notes.length, 1, "배정이 없으면 분량은 보지 않음");
});

test("자리: 절 끝에 이어진 「추진성과」 블록들 맨 앞(막대는 그 자체가 데이터 블록이라 넣지 않음), 가로 반씩 짝 가운데면 짝 앞으로", () => {
  const run = plan([blk(P1.key, "cards", "추진배경", ["m1"]), blk(P1.key, "bullets", "추진성과", ["m4"]), blk(P1.key, "stats", "추진성과", ["m4"])], [ROW, OUT]);
  assert.deepEqual(addMgDataBlocks(run, null).composition.blocks.map((b) => b.kind), ["cards", "table", "bullets", "stats"]);
  const withChart = plan([blk(P1.key, "cards", "추진배경", ["m1"]), blk(P1.key, "stats", "추진성과", ["m4"]), blk(P1.key, "chart", "추진성과", ["m4"])], [ROW, OUT]);
  assert.equal(addMgDataBlocks(withChart, null).notes.length, 0);
  // 전폭 가로 반씩 짝(라벨 무관): 앞 블록과 닫는 「추진성과」가 한 줄 — 그 사이에 넣지 않고 짝 앞으로
  const pair = { span: "half", layout: "full" } as const;
  const half = plan([blk(P1.key, "cards", "추진배경", ["m1"]), blk(P1.key, "cards", "", ["m3"], pair), blk(P1.key, "cards", "추진성과", ["m4"], pair)], [ROW, PLAIN, OUT]);
  const r = addMgDataBlocks(half, null).composition.blocks;
  assert.deepEqual(r.map((b) => `${b.kind} ${b.label}`), ["cards 추진배경", "table 추진내용", "cards ", "cards 추진성과"]);
  assert.deepEqual(r.slice(2).map((b) => b.span), ["half", "half"], "짝을 깨지 않음");
});
