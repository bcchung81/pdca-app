// 경평 초안 평가 논점 커버(lib/reports/lens-cover.ts) 순수 로직 시험 — 4단계 검증 보강. 판정이 아니라 낱말 신호만 봄.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { LENS_AXES, lensCover } from "./lens-cover.ts";
import type { ReportSectionSpec } from "./section.ts";

const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const spec = (items: string[], results: string[] = []): ReportSectionSpec => ({
  version: 3,
  card: { id: "1", taskNo: "1-가", title: "" },
  business: { no: 1, name: "" },
  task: { no: "1-1", title: "", bp: false },
  sub: { mark: "가", title: "", markers: [] },
  rows: [],
  blocks: [blk("bullets", { items })],
  results,
  caption: "",
  module: 1,
});

test("LENS_AXES: 화면 칩 순서(실행·효율·대응·전년대비·국민체감)", () => {
  assert.deepEqual([...LENS_AXES], ["실행", "효율", "대응", "전년대비", "국민체감"]);
});

test("lensCover: 축별 낱말 신호가 있으면 다룸, 없으면 빠짐 — count는 다룬 축 수", () => {
  const empty = lensCover(spec(["검토 결과를 정리함"]));
  assert.deepEqual(empty.checks, { 실행: false, 효율: false, 대응: false, 전년대비: false, 국민체감: false });
  assert.equal(empty.count, 0);

  const all = lensCover(spec(["단계별 추진 일정을 완료", "인력·예산을 절감해 시간 단축", "지적을 보완해 리스크 해소", "’24년 대비 ’25년 실적 향상", "국민 안전과 현장 체감 개선"]));
  assert.deepEqual(all.checks, { 실행: true, 효율: true, 대응: true, 전년대비: true, 국민체감: true });
  assert.equal(all.count, 5);
});

test("lensCover: 추진성과(results)도 봄", () => {
  const cover = lensCover(spec([], ["국민 체감 안전 확보"]));
  assert.equal(cover.checks.국민체감, true);
  assert.equal(cover.count, 1);
});
