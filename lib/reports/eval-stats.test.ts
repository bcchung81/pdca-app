// 평가 라운드 묶음 요약(lib/reports/eval-stats.ts — scripts/eval/eval-report-score.ts가 씀) 시험: 도식 분포·엔트로피, 틀(주 + 보조) 분포, 첫 블록 분포.

import assert from "node:assert/strict";
import { test } from "node:test";
import { firstBlockStats, kindStats, storyStats } from "./eval-stats.ts";

test("kindStats: 종류별 횟수(많은 순)·상위 3 비중·엔트로피(비트), 빈 목록은 0", () => {
  const r = kindStats([["steps", "hub", "stats"], ["steps", "hub"], ["steps"]]);
  assert.deepEqual(r.frequency, { steps: 3, hub: 2, stats: 1 });
  assert.equal(r.top3Share, 1);
  assert.equal(r.entropyBits, 1.459);
  assert.deepEqual(kindStats([]), { frequency: {}, top3Share: 0, entropyBits: 0 });
});

test("storyStats: 주 틀·보조 틀 분포, 섞음 비율, 쓰인 주 틀 수(섞음 제외)", () => {
  const r = storyStats([{ story: "단계 전개형", subStory: "현장 목소리형" }, { story: "단계 전개형" }, { story: "섞음" }, { story: "원스톱 통합형", subStory: "" }, {}]);
  assert.deepEqual(r.main, { "단계 전개형": 2, 섞음: 1, "원스톱 통합형": 1 });
  assert.deepEqual(r.sub, { "현장 목소리형": 1 });
  assert.equal(r.mixShare, 0.25, "틀이 있는 4장 중 섞음 1장");
  assert.equal(r.distinctMain, 2);
  assert.equal(r.withSub, "1/4");
});

test("firstBlockStats: 첫 블록 분포(많은 순)와 불릿으로 연 비율", () => {
  const r = firstBlockStats(["bullets", "quotes", "bullets", "banner"]);
  assert.deepEqual(r.firstBlocks, { bullets: 2, quotes: 1, banner: 1 });
  assert.equal(r.bulletsShare, 0.5);
  assert.deepEqual(firstBlockStats([]), { firstBlocks: {}, bulletsShare: 0 });
});
