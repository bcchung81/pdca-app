// 같은 수치 반복 경고(lib/reports/repeat-figures.ts, 2026-10-27) 시험 — 수치 열쇠 정규화, 주요사업 블록 3개 규칙, 경영관리 절 2개 규칙, 흔한 값 제외.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { figureKeys, figureRepeatWarning, repeatedFigures } from "./repeat-figures.ts";
import type { ReportSectionSpec } from "./section.ts";
import { warningLevel } from "./warning-levels.ts";

const blk = (items: string[], b: Partial<Block> = {}): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items, cells: [], rows: [], series: [], badge: "", ...b });
const spec = (over: Partial<ReportSectionSpec> = {}): ReportSectionSpec => ({
  version: 3,
  card: { id: "주요사업9/9-가", taskNo: "9-가", title: "t" },
  business: { no: 9, name: "사업" },
  task: { no: "9-1", title: "t", bp: false },
  sub: { mark: "가", title: "t", markers: [] },
  rows: [],
  results: [],
  caption: "",
  module: 1,
  ...over,
});

test("수치 열쇠: 쉼표·빈칸을 걷어 값+단위로, 날짜·시점·자리표시 안·단위 없는 숫자는 뺌, 화살표 앞 맨 숫자는 뒤 단위를 받음", () => {
  assert.deepEqual([...figureKeys("시설 1,922곳 관리, 1922 곳 재확인")], [["1922곳", "1,922곳"]]);
  assert.deepEqual([...figureKeys("협력회의(7.6.) ’26.8 기준 2026년 3단계 【확인: 450건】")].length, 0);
  assert.deepEqual([...figureKeys("포상 12 → 22명 확대")].map(([k]) => k), ["12명", "22명"]);
  assert.deepEqual([...figureKeys("예측 오차 0.7%･1.8%, ^{’25년}99.7%")].map(([k]) => k), ["0.7%", "1.8%", "99.7%"]);
  assert.deepEqual([...figureKeys("예산 42백만원(17%) 증액")].map(([k]) => k), ["42백만원", "17%"]);
});

test("흔한 값: 0·100%·한 자리 개수는 세지 않음(%·점·배·억은 한 자리도 셈)", () => {
  assert.deepEqual([...figureKeys("중대재해 0건, 준수율 100%, 3개 분야 7건, 5대 역할")], []);
  assert.deepEqual([...figureKeys("오차 2%, 만족도 4점, 3배")].map(([k]) => k), ["2%", "4점", "3배"]);
});

test("주요사업: 같은 수치가 서로 다른 블록 3개 이상(추진성과 상자도 한 블록)이면 참고 경고, 2개까지는 없음", () => {
  const three = spec({ blocks: [blk(["취약시설 **1,922곳** 관리"]), blk(["1,922곳 안전관리(’26.8월말)"])], results: ["우선 측정으로 1,922곳 관리"] });
  const w = figureRepeatWarning(three);
  assert.ok(w?.startsWith("반복 수치: 1,922곳(블록 3개)"), String(w));
  assert.equal(warningLevel(w!), "info");
  assert.equal(figureRepeatWarning(spec({ blocks: [blk(["1,922곳"]), blk(["1,922곳"])] })), null, "2개는 경고 없음");
  assert.equal(figureRepeatWarning(spec({ blocks: [blk(["1,922곳 · 1,922곳 · 1,922곳"])] })), null, "한 블록 안 여러 번은 1로 셈");
  assert.equal(figureRepeatWarning(spec({ blocks: [blk(["무재해 0건"]), blk(["0건 유지"]), blk(["사고 0건"])] })), null, "흔한 값");
});

test("경영관리: 블록 3개 이상이거나 서로 다른 절 2개 이상이면 경고, 한 절 안 블록 2개는 없음", () => {
  const mg = (at: string[], blocks: Block[]) => spec({ blocks, mg: { indicator: "지표", parts: [], at } });
  const cross = figureRepeatWarning(mg(["1.3.가", "1.3.나"], [blk(["포상 12명→22명 확대"]), blk(["포상 12 → 22명"])]));
  assert.ok(cross?.startsWith("반복 수치: 12명(블록 2개·절 2개)·22명(블록 2개·절 2개)"), String(cross));
  assert.equal(figureRepeatWarning(mg(["1.3.가", "1.3.가"], [blk(["87% → 89%"]), blk(["인식도 89%"])])), null);
  assert.ok(figureRepeatWarning(mg(["1.3.가", "1.3.가", "1.3.가"], [blk(["31명"]), blk(["31명"]), blk(["31명"])]))?.includes("31명(블록 3개·절 1개)"));
});

test("repeatedFigures: 블록 수 많은 순, 4개 넘으면 경고에 「외 N개」", () => {
  const units = [["10곳 20곳 30곳 40곳 50곳"], ["10곳 20곳 30곳 40곳 50곳"], ["10곳 20곳 30곳 40곳 50곳 10곳"], ["10곳"]].map((texts, i) => ({ group: `b${i}`, texts }));
  assert.deepEqual(repeatedFigures(units)[0], ["10곳", 4, 4]);
  assert.match(figureRepeatWarning(spec({ blocks: units.map((u) => blk(u.texts)) }))!, / 외 1개 — /);
});
