// 경평 초안 숫자 대조의 계산값 인정(lib/reports/number-calc.ts, section.ts unknownNumbersIn) — 숫자는 모두 가짜입니다.

import assert from "node:assert/strict";
import { test } from "node:test";
import { type Block, blockNumberTexts, blockTexts } from "./blocks.ts";
import { unknownNumbersIn } from "./section.ts";

/** 근거 글에서 숫자 조각을 아는 숫자로(쉼표 없는 열쇠) */
const knownOf = (...keys: string[]) => {
  const set = new Set(keys);
  return (tok: string) => {
    const k = tok.replace(/,/g, "").replace(/\s+/g, "").replace(/퍼센트/, "%");
    return set.has(k) || set.has(k.replace(/(%|배)$/, ""));
  };
};

test("증감률: 「N% 확대(A건 → B건)」에서 A·B가 근거에 있으면 N%를 인정(표기 자릿수까지 반올림)", () => {
  const known = knownOf("100", "120");
  assert.deepEqual(unknownNumbersIn("신규 등록 20% 확대(’25년 100건 → ’26년 120건)", known), []);
  assert.deepEqual(unknownNumbersIn("신규 등록 20.4% 확대(’25년 100건 → ’26년 120건)", known), ["20.4%"], "소수 한 자리 표기는 ±0.05");
  assert.deepEqual(unknownNumbersIn("신규 등록 21% 확대(’25년 100건 → ’26년 120건)", known), ["21%"]);
  assert.deepEqual(unknownNumbersIn("건수 15% 감소(’25년 120건 → ’26년 100건)", known), ["15%"], "감소율은 크기로 보지만 17%가 아니면 불인정");
  assert.deepEqual(unknownNumbersIn("건수 17% 감소(’25년 120건 → ’26년 100건)", known), []);
});

test("합·차: 「A건 + B건 = C건」「누적 C건(A건 + B건)」", () => {
  const known = knownOf("70", "30");
  assert.deepEqual(unknownNumbersIn("70건 + 30건 = 100건", known), []);
  assert.deepEqual(unknownNumbersIn("누적 100건(70건 + 30건)", known), []);
  assert.deepEqual(unknownNumbersIn("차이 40건(70건 - 30건)", known), []);
  assert.deepEqual(unknownNumbersIn("누적 101건(70건 + 30건)", known), ["101"]);
});

test("달성률·배수·만 단위 환산", () => {
  assert.deepEqual(unknownNumbersIn("목표 50건 대비 실적 60건으로 120% 달성", knownOf("50", "60")), []);
  assert.deepEqual(unknownNumbersIn("’25년 40건 → ’26년 100건, 2.5배 상승", knownOf("40", "100")), []);
  assert.deepEqual(unknownNumbersIn("’25년 40건 → ’26년 100건, 4배 상승", knownOf("40", "100")), ["4배"]);
  assert.deepEqual(unknownNumbersIn("’25년 40건 → ’26년 100건, 2배", knownOf("40", "100")), []);
  // 1.4만 + 1.1만 = 2.5만, 만과 천 환산(1.1만 = 11,000건)
  assert.deepEqual(unknownNumbersIn("누적 2.5만 건(1.4만 건 + 1.1만 건)", knownOf("1.4", "1.1")), []);
  assert.deepEqual(unknownNumbersIn("누적 25,000건(1.4만 건 + 1.1만 건)", knownOf("1.4", "1.1")), []);
});

test("불인정: 원값 없는 퍼센트·원값이 다른 줄에 있음·단위가 다른 값끼리·원값이 근거에 없음", () => {
  assert.deepEqual(unknownNumbersIn("참여 기관 30% 증가", knownOf("100", "120")), ["30%"]);
  assert.deepEqual(unknownNumbersIn("’25년 100건\n’26년 120건\n20% 확대", knownOf("100", "120")), ["20%"], "다른 불릿에 있는 원값");
  assert.deepEqual(unknownNumbersIn("100건 + 20명 = 120건", knownOf("100", "20")), ["120"], "단위가 다른 값끼리의 합");
  assert.deepEqual(unknownNumbersIn("신규 20% 확대(100건 → 120건)", knownOf("100")), ["20%", "120"], "한쪽 원값이 근거에 없으면 계산 불가");
});

test("근거에 있는 숫자는 그대로 두고, 같은 모르는 숫자는 한 번만", () => {
  assert.deepEqual(unknownNumbersIn("77건\n77건", knownOf()), ["77"]);
});

test("수치 표: 한 행(행 머리 + 값 칸 전부)이 계산값 인정의 한 단위 — 같은 행의 차이·증감률은 인정, 다른 행 값끼리는 불인정", () => {
  const known = knownOf("71.4", "85", "40", "50");
  const table = (cells: Array<{ head: string; bullets: string[] }>) =>
    ({ kind: "table", variant: "", label: "", title: "", text: "", items: ["지표", "’25년 실적", "’26년 목표", "증감"], cells, rows: [], series: [], badge: "" }) as unknown as Block;
  const text = (b: Block) => blockNumberTexts(b).join("\n");
  const ok = table([{ head: "가 지표", bullets: ["71.4점", "85점", "+13.6점"] }, { head: "나 지표", bullets: ["40점", "50점", "+10점"] }]);
  assert.deepEqual(unknownNumbersIn(text(ok), known), [], "행 안의 차이(+13.6점)·(+10점)");
  const pct = table([{ head: "가 지표", bullets: ["40건", "50건", "25%"] }]);
  assert.deepEqual(unknownNumbersIn(text(pct), known), [], "행 안의 증감률");
  const cross = table([{ head: "가 지표", bullets: ["71.4점", "85점", "+13.6점"] }, { head: "나 지표", bullets: ["40점", "50점", "+49.8점"] }]);
  assert.deepEqual(unknownNumbersIn(text(cross), known), ["49.8"], "다른 행 값(85 - 35.2…)끼리는 인정하지 않음");
  assert.deepEqual(unknownNumbersIn(blockTexts(ok).join("\n"), known).length > 0, true, "줄 단위(예전)로는 칸마다 따로라 잡힘");
});
