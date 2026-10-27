import assert from "node:assert/strict";
import { test } from "node:test";
import { DEGENERATE_MESSAGE, DegenerateAnswerError, isDegenerateChat, isDegenerateWriter, isPlaceholderText, retryIfDegenerate } from "./degenerate.ts";
import type { WriterResult } from "./writer.ts";

const empty = (over: Partial<WriterResult> = {}): WriterResult => ({ headline: "placeholder", summary: "placeholder", citations: [], suggestions: [], monthly_row: null, need_input: null, followup: null, ...over });
const sugg = { kind: "replace" as const, target_path: "a", period: null, proposed: ["x"], reason: "r", source_keys: [] };

test("자리 글 판정: 대소문자·문장부호·공백 무시, 실제 글은 아님", () => {
  for (const s of ["", "  ", "placeholder", " Placeholder. ", "[PLACEHOLDER]", "TODO", "todo:", "lorem ipsum", "...", "-", "—", null, undefined]) assert.equal(isPlaceholderText(s), true, String(s));
  for (const s of ["실적을 보완하세요", "placeholder 값을 채움", "TODO 목록 정리", "2025"]) assert.equal(isPlaceholderText(s), false, s);
});

test("작성지원 빈 답: 실측 모양·빈 글·공백은 잡음", () => {
  assert.equal(isDegenerateWriter(empty()), true);
  assert.equal(isDegenerateWriter(empty({ headline: "", summary: "  ", followup: [] })), true);
  assert.equal(isDegenerateWriter(empty({ headline: "...", summary: "-", need_input: "placeholder" })), true);
});

test("작성지원: 내용이 하나라도 있으면 빈 답이 아님", () => {
  assert.equal(isDegenerateWriter(empty({ need_input: "어느 달 실적인가요?" })), false);
  assert.equal(isDegenerateWriter(empty({ suggestions: [sugg] })), false);
  assert.equal(isDegenerateWriter(empty({ headline: "짧음", summary: "", suggestions: [sugg] })), false);
  assert.equal(isDegenerateWriter(empty({ citations: [{ key: "k", quote: "q" }] })), false);
  assert.equal(isDegenerateWriter(empty({ monthly_row: { month: "1", activity: "a", quantitative: "", qualitative: "", progress: "", risk: "" } })), false);
  assert.equal(isDegenerateWriter(empty({ followup: [{ id: "axes.4", judgment: "반영됨" as never, card_quote: "", inspection_quote: "", remaining: "" }] })), false);
  assert.equal(isDegenerateWriter(empty({ headline: "정상 제목", summary: "정상 요약" })), false);
  assert.equal(isDegenerateWriter(empty({ headline: "placeholder", summary: "정상 요약" })), false);
});

test("질문 빈 답", () => {
  assert.equal(isDegenerateChat({ answer: "" }), true);
  assert.equal(isDegenerateChat({ answer: " Placeholder " }), true);
  assert.equal(isDegenerateChat({ answer: "네." }), false);
});

const u = (n: number) => ({ input: n, output: n, cacheRead: n, cacheWrite: n, cacheWrite1h: n });

test("재시도: 첫 빈 답 → 두 번째 정상이면 정상 반환, 사용량은 합산", async () => {
  let n = 0;
  const r = await retryIfDegenerate(
    async () => ({ answer: ++n === 1 ? "" : "답", usage: u(n) }),
    (c) => c.answer === "",
  );
  assert.equal(n, 2);
  assert.equal(r.answer, "답");
  assert.deepEqual(r.usage, u(3));
});

test("재시도: 정상이면 한 번만 부르고, 두 번 다 빈 답이면 오류", async () => {
  let n = 0;
  await retryIfDegenerate(async () => ({ usage: u(1), n: ++n }), () => false);
  assert.equal(n, 1);
  n = 0;
  await assert.rejects(
    retryIfDegenerate(async () => ({ usage: u(1), n: ++n }), () => true),
    (e) => e instanceof DegenerateAnswerError && e.message === DEGENERATE_MESSAGE,
  );
  assert.equal(n, 2);
});
