import assert from "node:assert/strict";
import { test } from "node:test";
import { BudgetError, INPUT_BUDGET, checkBudget, estimateTokens } from "./budget.ts";

test("토큰 어림: 1자 = 1토큰(0단계 측정 0.92~1.00을 올림 — 모자라게 세지 않음)", () => {
  assert.equal(estimateTokens(0), 0);
  assert.equal(estimateTokens(12_345), 12_345);
  assert.equal(INPUT_BUDGET, 500_000);
});

test("상한 안이면 그대로 통과", () => {
  assert.doesNotThrow(() => checkBudget("시".repeat(20_000), "요".repeat(INPUT_BUDGET - 20_000), []));
});

test("상한을 넘으면 자르지 않고 멈추고, 큰 자료부터 이름을 알림", () => {
  const files = [
    { name: "작은.hwp", text: "가".repeat(1_000) },
    { name: "큰.pdf", text: "나".repeat(300_000) },
    { name: "중간.xlsx", text: "다".repeat(90_000) },
    { name: "둘째.docx", text: "라".repeat(120_000) },
  ];
  const prompt = files.map((f) => f.text).join("\n");
  assert.throws(
    () => checkBudget("시".repeat(20_000), prompt, files),
    (e: Error) => {
      assert.ok(e instanceof BudgetError);
      assert.match(e.message, /50\.0만 토큰/);
      assert.match(e.message, /자르지 않고/);
      // 큰 순서 셋만
      assert.ok(e.message.indexOf("큰.pdf") < e.message.indexOf("둘째.docx") && e.message.indexOf("둘째.docx") < e.message.indexOf("중간.xlsx"));
      assert.doesNotMatch(e.message, /작은\.hwp/);
      return true;
    },
  );
});

test("첨부가 없어도 넘치면 멈춤(공통 지식이 커진 경우)", () => {
  assert.throws(() => checkBudget("", "가".repeat(INPUT_BUDGET + 1)), BudgetError);
});
