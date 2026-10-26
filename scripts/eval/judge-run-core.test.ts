import assert from "node:assert/strict";
import { test } from "node:test";
import { assignBlindKeys, cardTag, checkAnswer, judgeJsonSchema, judgeOrder, leakHits, mergeJudge, seededShuffle, type JudgeAnswer } from "./judge-run-core.ts";

const score = { 근거: 3, 논점: 3, 인과: 3, 성과: 3, 차별성: 3, 시각: 3, 문체: 3 };
const draft = (id: string, overall: number) => ({ id, scores: { ...score }, overall, best: "b", flaw: "f", fix: "x", fabrications: [] });
const answer = (ids: string[], ranking = ids): JudgeAnswer => ({ judge: "claude", card: "c", drafts: ids.map((id, i) => draft(id, 5 + i)), ranking, common_flaws: [], groups: [] });

test("cardTag: 슬래시를 밑줄로", () => assert.equal(cardTag("주요사업3/7-나"), "주요사업3_7-나"));

test("seededShuffle: 같은 씨앗이면 같고 원본은 그대로", () => {
  const a = ["a", "b", "c", "d", "e", "f"];
  assert.deepEqual(seededShuffle(a, "s"), seededShuffle(a, "s"));
  assert.deepEqual(a, ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual([...seededShuffle(a, "s")].sort(), a);
});

test("assignBlindKeys: 전역 고유·입력 순서 무관·카드 안 섞임", () => {
  const cards = [
    { card: "A", names: ["x__A__1", "y__A__1", "x__A__2"] },
    { card: "B", names: ["x__B__1", "y__B__1"] },
  ];
  const k = assignBlindKeys(cards);
  assert.deepEqual(Object.keys(k), ["D01", "D02", "D03", "D04", "D05"]);
  assert.equal(new Set(Object.values(k)).size, 5);
  assert.ok(Object.values(k).slice(0, 3).every((n) => n.includes("__A__")));
  assert.deepEqual(assignBlindKeys([{ card: "A", names: [...cards[0].names].reverse() }, cards[1]]), k);
});

test("judgeOrder: 심사자마다 다른 순서·같은 입력이면 같음", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `D${String(i + 1).padStart(2, "0")}`);
  assert.deepEqual(judgeOrder(ids, "claude", "c"), judgeOrder([...ids].reverse(), "claude", "c"));
  assert.notDeepEqual(judgeOrder(ids, "claude", "c"), judgeOrder(ids, "gpt", "c"));
});

test("leakHits: 모델 이름을 찾고 예외·영단어 속은 건너뜀", () => {
  assert.deepEqual(leakHits("이 글은 GPT와 Claude Code로"), ["GPT", "Claude Code"]);
  assert.deepEqual(leakHits("solution console Solar"), []);
  assert.deepEqual(leakHits("SOL 협의회", ["sol"]), []);
  assert.deepEqual(leakHits("한글 본문만"), []);
});

test("checkAnswer: 정상·빠짐·중복·점수 범위", () => {
  assert.equal(checkAnswer(answer(["D01", "D02"], ["D02", "D01"]), ["D01", "D02"]).ok, true);
  const miss = checkAnswer(answer(["D01"]), ["D01", "D02"]);
  assert.ok(!miss.ok && miss.errors.some((e) => e.includes("빠짐: D02")));
  const dup = checkAnswer(answer(["D01", "D01"], ["D01", "D01"]), ["D01"]);
  assert.ok(!dup.ok && dup.errors.some((e) => e.includes("중복")));
  const bad = answer(["D01"]);
  bad.drafts[0].scores.근거 = 6;
  assert.equal(checkAnswer(bad, ["D01"]).ok, false);
  bad.drafts[0].scores.근거 = 2.5;
  assert.equal(checkAnswer(bad, ["D01"]).ok, false);
  const hi = answer(["D01"]);
  hi.drafts[0].overall = 11;
  assert.equal(checkAnswer(hi, ["D01"]).ok, false);
  const rk = checkAnswer(answer(["D01", "D02"], ["D01"]), ["D01", "D02"]);
  assert.ok(!rk.ok && rk.errors.some((e) => e.startsWith("ranking 빠짐")));
});

test("judgeJsonSchema: 객체 스키마", () => {
  const s = judgeJsonSchema() as { type: string; required: string[] };
  assert.equal(s.type, "object");
  assert.ok(s.required.includes("ranking"));
});

test("mergeJudge: 카드 칸·종합 순 전체 ranking·카드별 ranking", () => {
  const a1 = answer(["D01", "D02"], ["D02", "D01"]); // 종합 5, 6
  const a2 = answer(["D03", "D04"], ["D04", "D03"]); // 종합 5, 6
  a2.drafts[1].overall = 9;
  a1.common_flaws = [{ flaw: "x", drafts: ["D01"], cause: "c" }];
  const m = mergeJudge("claude", [
    { card: "A", answer: a1 },
    { card: "B", answer: a2 },
  ]);
  assert.equal(m.drafts.length, 4);
  assert.equal(m.drafts[2].card, "B");
  assert.deepEqual(m.ranking, ["D04", "D02", "D01", "D03"]);
  assert.deepEqual(m.rankingByCard, { A: ["D02", "D01"], B: ["D04", "D03"] });
  assert.equal(m.common_flaws[0].card, "A");
});
