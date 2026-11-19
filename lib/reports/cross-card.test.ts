import assert from "node:assert/strict";
import { test } from "node:test";
import { crossCardDuplicates, datesOf, nameKey } from "./cross-card.ts";

const card = (id: string, taskNo: string, items: string[], quantitative: string[] = []) => ({
  id,
  taskNo,
  status: "active",
  data: { do: { monthly: [{ period: "7월", items }] }, outcome: { quantitative } },
});

test("datesOf: 월.일·월일 표기만 날짜로 읽고 월만 있는 줄은 뺌", () => {
  assert.deepEqual(datesOf("체험훈련 실시(7.12.)"), ["7.12"]);
  assert.deepEqual(datesOf("9월 3일 가족초청 행사"), ["9.3"]);
  assert.deepEqual(datesOf("7월 중 추진"), []);
});

test("nameKey: 날짜·괄호·흔한 낱말을 걷음", () => {
  assert.equal(nameKey("(7.12.) 직업 체험훈련 실시 (참가 30명)"), "직업체험훈련");
});

test("같은 날 같은 행사가 서로 다른 카드에 있으면 한 묶음으로 잡음(체험훈련 4-1·12-1·12-2)", () => {
  const cards = [
    card("a", "경영관리4/4-1", ["∙ 7.12. 청소년 직업 체험훈련 실시(30명)"]),
    card("b", "경영관리12/12-1", ["∙ 7.12. 청소년 직업체험훈련 운영"]),
    card("c", "경영관리12/12-2", ["7.12. 직업 체험훈련 진행"]),
  ];
  const r = crossCardDuplicates(cards);
  assert.equal(r.length, 1);
  assert.equal(r[0].date, "7.12");
  assert.deepEqual(r[0].lines.map((l) => l.taskNo), ["경영관리4/4-1", "경영관리12/12-1", "경영관리12/12-2"]);
  assert.ok(r[0].score >= 0.4);
});

test("정량 성과 줄과 월별 실적 줄도 서로 견줌(ISO 42001 인증 13-2·13-5)", () => {
  const cards = [card("a", "경영관리13/13-2", [], ["ISO 42001 인증 획득(9.10.)"]), card("b", "경영관리13/13-5", ["9.10. ISO 42001 인증심사 통과"])];
  assert.equal(crossCardDuplicates(cards).length, 1);
});

test("날짜만 같고 행사가 다르면 안 잡음", () => {
  const cards = [card("a", "경영관리7/7-3", ["7.12. 판촉 부스 현장 운영 지원"]), card("b", "경영관리9/9-4", ["7.12. 육아키트 전달식 가족초청"])];
  assert.deepEqual(crossCardDuplicates(cards), []);
});

test("흔한 낱말만 겹치면 안 잡음", () => {
  const cards = [card("a", "경영관리1/1-1", ["7.12. 교육 실시 및 추진 회의"]), card("b", "경영관리2/2-1", ["7.12. 교육 운영 회의 개최"])];
  assert.deepEqual(crossCardDuplicates(cards), []);
});

test("이름이 닮아도 날짜가 다르면 안 잡음", () => {
  const cards = [card("a", "경영관리3/3-1", ["7.12. 청년인턴 채용"]), card("b", "경영관리14/14-2", ["8.20. 청년인턴 채용"])];
  assert.deepEqual(crossCardDuplicates(cards), []);
});

test("한 카드 안의 같은 줄 반복은 대상이 아님", () => {
  const cards = [card("a", "경영관리3/3-1", ["7.12. 청년인턴 채용 확정", "7.12. 청년인턴 채용 확정(재게시)"])];
  assert.deepEqual(crossCardDuplicates(cards), []);
});

test("같은 입력이면 같은 출력 · 상한", () => {
  const cards = [card("a", "경영관리9/9-4", ["5.3. 육아키트 가족초청 행사"]), card("b", "경영관리11/11-3", ["5.3. 가족초청 육아키트 행사 개최"])];
  assert.deepEqual(crossCardDuplicates(cards), crossCardDuplicates([...cards].reverse()));
  assert.equal(crossCardDuplicates(cards, 0).length, 0);
});
