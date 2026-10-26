import assert from "node:assert/strict";
import test from "node:test";
import { buildPacket, blindBreaks, checkJudge, chatMetrics, CHUNK_CHARS, chunkBlock, mentionedKeys, pairOrder, resolveJudge, summarize, summaryTable, writerMarkdown, writerMetrics, type JudgeAnswer, type PairOutcome, type WriterResult } from "./select-judge-core.ts";

const W: WriterResult = {
  headline: "요약",
  summary: "설명 mid25-biz/BZ-4/04 참고",
  citations: [
    { key: "mid25-biz/BZ-4/04", title: "제목", quote: "인용문", verified: true },
    { key: "corr25-2610/BZ-4/05", title: "제목2", quote: "인용2", verified: false },
  ],
  suggestions: [
    { kind: "text", targetPath: "plan.lines.0", period: null, current: "현재", proposed: ["새 글"], reason: "이유", sourceKeys: ["corr25-2610/BZ-4/05"], applicable: true },
    { kind: "monthly", targetPath: null, period: "2026-08", current: null, proposed: ["x"], reason: "r", sourceKeys: [], applicable: false },
  ],
};

const ans = (winner: "A" | "B" | "비슷"): JudgeAnswer => ({
  axes: { 근거: { A: 5, B: 2, note: "" }, 특화: { A: 4, B: 3, note: "" }, 유용: { A: 3, B: 3, note: "" }, 누락오류: { A: 4, B: 1, note: "" } },
  errors: { A: { cardDenied: 0, overwrite: 1, fabricated: 0, factError: 0 }, B: { cardDenied: 2, overwrite: 0, fabricated: 1, factError: 0 } },
  notes: [],
  winner,
  confidence: "높음",
  reason: "",
});

test("pairOrder: 씨앗 고정이고 두 방식이 한 번씩", () => {
  const a = pairOrder("writer", "u1");
  assert.deepEqual(a, pairOrder("writer", "u1"));
  assert.deepEqual([a.A, a.B].sort(), ["full", "sel"]);
  const firsts = new Set(Array.from({ length: 30 }, (_, i) => pairOrder("chat", `u${i}`).A));
  assert.equal(firsts.size, 2);
});

test("writerMarkdown: 칸 경로·바꿀 글·이유·인용 대조가 보이고 방식 단서는 없음", () => {
  const md = writerMarkdown(W);
  for (const s of ["plan.lines.0", "새 글", "이유", "원문 확인", "원문과 다름", "월별 실적 2026-08", "반영 불가"]) assert.ok(md.includes(s), s);
  assert.doesNotMatch(md, /\bfull\b|\bsel\b/);
});

test("mentionedKeys: writer는 인용·근거 조각·설명 속 key, chat은 답 속 key", () => {
  assert.deepEqual(mentionedKeys("writer", W).sort(), ["corr25-2610/BZ-4/05", "mid25-biz/BZ-4/04"]);
  assert.deepEqual(mentionedKeys("chat", { answer: "근거는 att3-2604/s1/Q03 이고 「자료 확인 필요: plan-2607/eval25/BZ-4/BZ-1/fit/p04」." }).sort(), ["att3-2604/s1/Q03", "plan-2607/eval25/BZ-4/BZ-1/fit/p04"]);
});

test("chunkBlock: 길면 앞 3,000자만 싣고 그 사실을 적음", () => {
  const b = chunkBlock({ key: "k/1", title: "t", text: "가".repeat(CHUNK_CHARS + 50) });
  assert.match(b, /앞 3000자만 실음/);
  assert.ok(!b.includes("가".repeat(CHUNK_CHARS + 1)));
  assert.doesNotMatch(chunkBlock({ key: "k/2", title: "t", text: "짧다" }), /실음/);
});

test("buildPacket: A·B·조각 원문이 있고 arm·토큰 단서는 없음", () => {
  const p = buildPacket({ feature: "chat", cardId: "주요사업1/7-가", cardText: "title | 과제", question: "질문?", answerA: "답A", answerB: "답B", chunks: [{ key: "k/1", title: "t", text: "원문" }] });
  for (const s of ["답A", "답B", "[k/1]", "원문", "질문: 질문?", "title | 과제"]) assert.ok(p.includes(s), s);
  assert.doesNotMatch(p, /\bfull\b|\bsel\b|토큰|fellBack/);
});

test("blindBreaks: 선별 방식 문구 감지", () => {
  assert.ok(blindBreaks("「자료 확인 필요: a/b」"));
  assert.ok(!blindBreaks("보통 답"));
});

test("checkJudge: 정상 통과, 점수 범위·승자 값 위반은 실패", () => {
  assert.ok(checkJudge(ans("A")).ok);
  const bad = structuredClone(ans("A"));
  bad.axes.근거.A = 6;
  assert.ok(!checkJudge(bad).ok);
  assert.ok(!checkJudge({ ...ans("A"), winner: "C" }).ok);
});

test("resolveJudge: A/B를 키로 방식에 풂", () => {
  const r = resolveJudge(ans("A"), { A: "sel", B: "full" });
  assert.equal(r.winner, "sel");
  assert.equal(r.sel.scores.근거, 5);
  assert.equal(r.full.scores.근거, 2);
  assert.equal(r.full.errors.cardDenied, 2);
  assert.equal(resolveJudge(ans("비슷"), { A: "full", B: "sel" }).winner, "비슷");
  assert.equal(resolveJudge(ans("A"), { A: "full", B: "sel" }).winner, "full");
});

test("결정론 지표", () => {
  assert.deepEqual(writerMetrics(W, ["a", "b"]), { suggestions: 2, applicable: 1, citations: 2, verified: 1, notVerified: 1, keys: 2 });
  assert.deepEqual(chatMetrics({ answer: "가나다 자료 확인 필요: x, 자료 확인 필요: y" }, ["x"]), { chars: 28, keys: 1, needMaterial: 2 });
});

test("summarize: 승·비슷·확신, 축 평균, 오류 합, 지표 합, 블라인드 누출", () => {
  const m = (n: number) => ({ chars: n, keys: 1, needMaterial: 0 });
  const pairs: PairOutcome[] = [
    { feature: "chat", uid: "1", resolved: resolveJudge(ans("A"), { A: "sel", B: "full" }), metrics: { full: m(10), sel: m(20) }, blindBreak: ["sel"] },
    { feature: "chat", uid: "2", resolved: resolveJudge(ans("비슷"), { A: "sel", B: "full" }), metrics: { full: m(30), sel: m(40) }, blindBreak: [] },
    { feature: "writer", uid: "3", metrics: { full: m(0), sel: m(0) }, blindBreak: [] },
  ];
  const s = summarize(pairs) as Record<string, Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(s.chat.verdict.sel.total, 1);
  assert.equal(s.chat.verdict.sel.높음, 1);
  assert.equal(s.chat.verdict.비슷.total, 1);
  assert.equal(s.chat.verdict.full.total, 0);
  assert.equal(s.chat.selNotWorse, true);
  assert.equal(s.chat.axes.근거.sel, 5);
  assert.equal(s.chat.axes.근거.full, 2);
  assert.equal(s.chat.errors.cardDenied.full, 4);
  assert.equal(s.chat.errors.cardDenied.sel, 0);
  assert.equal(s.chat.metricsSum.full.chars, 40);
  assert.deepEqual(s.chat.blindBreak, { full: 0, sel: 1 });
  assert.equal(s.writer.judged, 0);
  assert.equal(s.writer.selNotWorse, null);
  assert.match(summaryTable(s), /카드에 있는데 없다고 함 \| 4 \| 0/);
});
