// 하이브리드 검색 순수 함수 시험 — RRF·재현율은 손계산 값과 대조, 질의 글은 합성 카드(실명 없음)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardQueryText, rankByCosine, recallAt, rrf, selectableCandidates } from "./hybrid.ts";
import { buildBundle } from "./bundle.ts";
import { SYN_BIZ_CARD, SYN_CHUNKS } from "./fixtures/bundle-synthetic.ts";
import { lensTopic } from "../reports/lens.ts";

test("rrf: 손계산 — k=60에서 a=1/61+1/62, b=1/62+1/61(동점 → 가장 좋은 순위 같음 → 처음 본 순), c=1/63+1/63", () => {
  // a: 1/61 + 1/62 = 0.032522, b: 1/62 + 1/61 = 0.032522, c: 1/63 + 1/63 = 0.031746, d: 1/63 = 0.015873
  assert.deepEqual(rrf([["a", "b", "c"], ["b", "a", "c", "d"]]), ["a", "b", "c", "d"]);
});

test("rrf: k=1 손계산 — 한 목록 1위보다 두 목록에 든 것이 앞섬", () => {
  // k=1: x = 1/2 = 0.5, y = 1/3 + 1/3 = 0.667, z = 1/4 + 1/2 = 0.75
  assert.deepEqual(rrf([["x", "y", "z"], ["z", "y"]], 1), ["z", "y", "x"]);
});

test("rrf: 동점은 처음 본 순, 두 목록 하위 합이 한 목록 1위보다 앞섬", () => {
  // 한 목록씩 같은 순위(동점) → 처음 본 순
  assert.deepEqual(rrf([["p"], ["q"]]), ["p", "q"]);
  // k=60 손계산: q = 1/62 + 1/64 = 0.031754 > p = 1/61 = 0.016393 = r(동점·처음 본 순) > s = 1/62 = 0.016129 > t = 1/63 = 0.015873
  assert.deepEqual(rrf([["p", "q"], ["r", "s", "t", "q"]]), ["q", "p", "r", "s", "t"]);
});

test("rrf: 빈 목록", () => {
  assert.deepEqual(rrf([]), []);
  assert.deepEqual(rrf([[], []]), []);
});

test("recallAt: 손계산", () => {
  const ranked = ["a", "b", "c", "d", "e"];
  assert.equal(recallAt(ranked, ["a", "d"], 2), 0.5);
  assert.equal(recallAt(ranked, ["a", "d"], 4), 1);
  assert.equal(recallAt(ranked, ["a", "z"], 5), 0.5); // 순위에 없는 정답은 못 찾은 것으로 셈
  assert.equal(recallAt(ranked, ["c", "d", "e"], 1), 0);
  assert.equal(recallAt(ranked, [], 3), null); // 정답 없음은 0이 아님
  assert.equal(recallAt(["a"], ["a", "a"], 10), 1); // 정답 중복은 한 번
});

test("rankByCosine: 내적 순, 동점은 들어온 순", () => {
  const docs = [
    { key: "x", vec: [0, 1] },
    { key: "y", vec: [1, 0] },
    { key: "z", vec: [0.6, 0.8] },
    { key: "w", vec: [0, 1] },
  ];
  assert.deepEqual(rankByCosine([1, 0], docs), ["y", "z", "x", "w"]);
});

test("selectableCandidates: 묶음 층의 사례류만(기준류·방법론·다른 사업·과제 행 제외)", () => {
  const b = buildBundle(SYN_CHUNKS, SYN_BIZ_CARD, [], null, "report");
  const keys = selectableCandidates(b).map((c) => c.key);
  assert.ok(keys.length > 0);
  assert.ok(keys.includes("plan-2607/eval25/BZ-1/e1/p01")); // critique
  assert.ok(keys.includes("att3-2604/qa/BZ-1/1")); // survey
  assert.ok(keys.includes("rpt25-biz/BZ-1/a")); // prior
  assert.ok(keys.includes("peer25-biz/b0-radio")); // case(B0)
  for (const k of ["plan-2607/narr/I/1", "plan-2607/handbook26/BZ-1/k1", "pool25-biz/BZ-1/1", "up-m/1", "att3-2604/qa/BZ-2/1", "plan/task/1-1", "peer25-biz/c"]) assert.ok(!keys.includes(k), k);
  const roles = new Set(selectableCandidates(b).map((c) => c.role));
  assert.deepEqual([...roles].sort(), ["case", "critique", "prior", "survey"]);
});

test("cardQueryText: lensTopic이 앞, 두 트랙 본문 칸, 상한에서 자름", () => {
  const biz = {
    title: "합성 안테나 판독 확산",
    executionTask: "판독 자동화",
    targetBusiness: "합성 대상사업",
    kpi: { rows: [{ name: "판독 건수" }] },
    act: { findings: ["판독 정확도 근거 부족"] },
    do: { lines: ["추진 내용 한 줄"], monthly: [{ items: ["3월 실적 줄"] }] },
    plan: { lines: ["계획 줄"] },
    outcome: { quantitative: ["정량 성과"], qualitative: [{ text: "정성 성과" }] },
  };
  const q = cardQueryText(biz, 10_000);
  assert.ok(q.startsWith(lensTopic(biz)));
  for (const s of ["합성 대상사업", "추진 내용 한 줄", "3월 실적 줄", "계획 줄", "정량 성과", "정성 성과"]) assert.ok(q.includes(s), s);
  assert.equal(cardQueryText(biz, 12).length, 12);

  const mg = {
    title: "합성 경영관리 과제",
    indicatorName: "합성 지표",
    findings: { rows: [{ finding: ["지적 한 줄"], plan: ["개선계획 줄"] }] },
    feedback: { rows: [{ plan: ["환류 계획"], self: ["자체 점검"] }] },
    do: { lines: ["경영관리 추진"] },
  };
  const m = cardQueryText(mg, 10_000);
  for (const s of ["합성 경영관리 과제", "지적 한 줄", "합성 지표", "개선계획 줄", "환류 계획", "자체 점검", "경영관리 추진"]) assert.ok(m.includes(s), s);
  assert.ok(!/\s{2}/.test(m));
  assert.equal(cardQueryText(null, 100), "");
});
