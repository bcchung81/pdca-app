import assert from "node:assert/strict";
import { test } from "node:test";
import { compactKey, demoteBulletHeading, foldForSearch, joinBrokenLines, normalizeText, splitDepartments } from "./normalize.ts";
import { buildSearchQuery } from "./search-query.ts";
import { bigramDice, containment, dice } from "./similarity.ts";

test("가운뎃점 변종과 연도 따옴표를 통일한다(P17)", () => {
  assert.equal(normalizeText("친환경･탄소중립 친환경‧탄소중립 친환경․탄소중립"), "친환경·탄소중립 친환경·탄소중립 친환경·탄소중립");
  assert.equal(normalizeText("’25년 실적, ‘26. 5. 18."), "'25년 실적, '26. 5. 18.");
  assert.equal(normalizeText("(\\~’24년) 5\\*3"), "(~'24년) 5*3");
});

test("따옴표 인용은 표시용에서 유지하고 색인용에서만 접는다", () => {
  assert.equal(normalizeText("‘조기개선 국수’"), "‘조기개선 국수’");
  assert.equal(foldForSearch("‘조기개선 국수’  ICT"), "'조기개선 국수' ict");
  assert.equal(compactKey("전파 이용기회 확대 사업"), "전파이용기회확대사업");
});

test("PDF 한 줄 문단을 글머리 경계까지 잇는다(P1)", () => {
  const out = joinBrokenLines([
    "☑ 전파품질 조기 안정화 기여도 지표의 ‘조기개선 국수’는 이동통신 무선국",
    "검사 결과 불합격 판정을 받은 무선국의 수를 산정합니다.",
    "￭ 목표 개선기간은 전년도 통신사 기준",
    "일수를 반영하였습니다.",
    "<table>",
    "※ 참고",
  ]);
  assert.deepEqual(out, [
    "☑ 전파품질 조기 안정화 기여도 지표의 ‘조기개선 국수’는 이동통신 무선국 검사 결과 불합격 판정을 받은 무선국의 수를 산정합니다.",
    "￭ 목표 개선기간은 전년도 통신사 기준 일수를 반영하였습니다.",
    "<table>",
    "※ 참고",
  ]);
});

test("글머리가 제목으로 올라간 줄과 이중 글머리를 되돌린다(P8·P9)", () => {
  assert.equal(demoteBulletHeading("## ㅇ 기관장 평가 : 보통"), "ㅇ 기관장 평가 : 보통");
  assert.equal(demoteBulletHeading("- - 경영관리(8위)"), "- 경영관리(8위)");
  assert.equal(demoteBulletHeading("## 경영전략"), "## 경영전략");
});

test("부서 칸 <br>을 부서 접미사 기준으로 나눈다(P18)", () => {
  assert.deepEqual(splitDepartments("경영<br>기획팀"), ["경영기획팀"]);
  assert.deepEqual(splitDepartments("검사기획팀<br>검사관리팀"), ["검사기획팀", "검사관리팀"]);
  assert.deepEqual(splitDepartments("성과<br>관리팀"), ["성과관리팀"]);
  assert.deepEqual(splitDepartments(""), []);
});

test("n-gram 포함도와 Dice", () => {
  assert.equal(containment("가나다라", "가나다라마바"), 1);
  assert.equal(containment("", "가나다"), 0);
  assert.ok(dice("AI 기반 안테나 자동판독", "AI 기반 안테나 자동판독 전국 확산") > 0.7);
});

test("bigramDice: 같은 글 1·한 글자 이하 0·반복 글자쌍은 횟수까지 셈(layout-bind·team-match 공용)", () => {
  assert.equal(bigramDice("검사기획팀", "검사기획팀"), 1);
  assert.equal(bigramDice("", ""), 1); // 같은 글이면 빈 글도 1(팀 이름 쪽은 빈 글을 0으로 감쌈)
  assert.equal(bigramDice("가", "가나"), 0);
  assert.equal(bigramDice("가나다", "라마바"), 0);
  assert.equal(bigramDice("가가가", "가가"), (2 * 1) / (2 + 1)); // 가가 2개 대 1개 → 겹침 1
  assert.equal(dice("가가가", "가가"), 1); // 집합 Dice는 중복을 한 번만 셈(다른 계산)
});

test("검색 질의: 낱말마다 정규화하고 연산자는 대문자로 남긴다", () => {
  assert.equal(buildSearchQuery("자격검정 PCSI 자격검정"), '"자격검정" OR "pcsi"');
  assert.equal(buildSearchQuery("AI･XR 스튜디오", "all"), '"ai·xr" "스튜디오"');
  assert.equal(buildSearchQuery(`‘조기개선 국수’, "산정"`), '"조기개선" OR "국수" OR "산정"');
  assert.equal(buildSearchQuery("a\\b"), '"a\\\\b"');
  assert.equal(buildSearchQuery("  ,  "), "");
});
