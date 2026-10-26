import assert from "node:assert/strict";
import { test } from "node:test";
import { dice, matchTeam, normalizeName, teamLabel } from "./team-match.ts";
import type { TeamRef } from "./types.ts";

// 운영 팀 목록의 일부(이름이 비슷한 쌍·가운뎃점·영문 포함)
const T = (id: number, name: string, hq: string | null): TeamRef => ({ id, name, hq });
const TEAMS: TeamRef[] = [
  T(1, "검사관리팀", "전파기반본부"),
  T(2, "검사기획팀", "전파기반본부"),
  T(3, "전자파안전정보센터", "전파기반본부"),
  T(4, "위성·공공전파팀", "전파통신AX본부"),
  T(5, "AI특화망사업팀", "전파통신AX본부"),
  T(6, "전파혁신전략팀", "차세대전파혁신단"),
  T(7, "전파혁신추진팀", "차세대전파혁신단"),
  T(8, "기금기획팀", "ICT기금관리본부"),
  T(9, "기금정책팀", "ICT기금관리본부"),
  T(10, "AI미디어융합TF", "방송미디어본부"),
  T(11, "방송콘텐츠진흥팀", "방송미디어본부"),
  T(12, "미디어정책기획팀", "방송미디어본부"),
];
const exactId = (text: string) => {
  const m = matchTeam(text, TEAMS);
  return m.kind === "exact" ? m.teamId : null;
};
const suggestIds = (text: string) => {
  const m = matchTeam(text, TEAMS);
  return m.kind === "suggest" ? m.candidates.map((c) => c.teamId) : [];
};

test("normalizeName: 가운뎃점 변형·공백·괄호·대소문자를 같게 본다", () => {
  const base = normalizeName("위성·공공전파팀");
  for (const v of ["위성ㆍ공공전파팀", "위성.공공전파팀", "위성 공공 전파팀", "위성・공공전파팀", "위성공공전파팀"]) assert.equal(normalizeName(v), base, v);
  assert.equal(normalizeName(" AI 미디어융합 TF "), normalizeName("ai미디어융합tf"));
  assert.equal(normalizeName("(검사기획팀)"), "검사기획팀");
});

test("dice: 같으면 1, 전혀 다르면 0", () => {
  assert.equal(dice("검사기획팀", "검사기획팀"), 1);
  assert.equal(dice("가나다", "라마바"), 0);
  assert.ok(dice("검사기획", "검사기획팀") > 0.8);
});

test("자동 확정: 팀명이 정확히 같으면(표기 차이 포함) 그 팀", () => {
  assert.equal(exactId("검사기획팀"), 2);
  assert.equal(exactId(" 검사 기획팀 "), 2);
  assert.equal(exactId("ai미디어융합tf"), 10);
  assert.equal(exactId("AI 미디어융합 TF"), 10);
  for (const v of ["위성ㆍ공공전파팀", "위성.공공전파팀", "위성공공전파팀"]) assert.equal(exactId(v), 4, v);
});

test("자동 확정: 본부와 팀이 한 칸에 있는 표기(카드 양식의 「부서(팀)」 포함)", () => {
  for (const v of ["전파기반본부(검사기획팀)", "전파기반본부 검사기획팀", "전파기반본부/검사기획팀", "전파기반본부 - 검사기획팀", "전파기반본부검사기획팀"]) {
    const m = matchTeam(v, TEAMS);
    assert.equal(m.kind, "exact", v);
    if (m.kind === "exact") {
      assert.equal(m.teamId, 2, v);
      assert.equal(m.warn, undefined, v);
    }
  }
});

test("자동 확정은 하되 본부가 다르게 적히면 경고를 붙인다. 알 수 없는 옛 본부 표기는 경고 없이", () => {
  const m = matchTeam("전파통신AX본부 검사기획팀", TEAMS);
  assert.equal(m.kind, "exact");
  if (m.kind === "exact") {
    assert.equal(m.teamId, 2);
    assert.ok(m.warn?.includes("본부"));
  }
  assert.equal(exactId("방송미디어부(방송콘텐츠진흥팀)"), 11, "옛 표기 방송미디어부는 DB에 없는 본부 → 팀명만으로 확정");
});

test("끝말만 다르거나 일부만 적힌 것은 추천만 한다(자동 확정 안 함)", () => {
  assert.equal(exactId("검사기획"), null);
  const m = matchTeam("검사기획", TEAMS);
  assert.equal(m.kind, "suggest");
  if (m.kind === "suggest") assert.deepEqual([m.candidates[0].teamId, m.candidates[0].score], [2, 0.97]);
  assert.equal(suggestIds("검사기획팀신규")[0], 2, "구분 없이 이어 붙은 글에 팀명이 포함되면 첫째 후보");
  assert.equal(exactId("검사기획팀 신규"), 2, "나눈 조각 하나가 팀명과 같으면 나머지 말이 있어도 확정(팀명은 고유)");
  assert.equal(exactId("검사기획팀 → 검사관리팀 이동"), null, "팀명이 둘 적히면 확정하지 않음");
});

test("이름이 비슷한 팀은 자동 확정하지 않고 후보로 함께 보여 준다", () => {
  assert.equal(exactId("전파혁신팀"), null);
  const ids = suggestIds("전파혁신팀");
  assert.ok(ids.includes(6) && ids.includes(7), `전략·추진 둘 다 후보: ${ids}`);
  assert.equal(exactId("기금팀"), null);
  assert.equal(exactId("검사팀"), null);
});

test("오타는 가장 가까운 팀을 첫 후보로 추천한다", () => {
  assert.equal(exactId("검사기휙팀"), null);
  assert.equal(suggestIds("검사기휙팀")[0], 2);
});

test("본부만 적힌 경우 그 본부의 팀들을 후보로, 여러 팀이 적히면 그 팀들을 후보로", () => {
  assert.equal(exactId("전파기반본부"), null);
  assert.deepEqual(suggestIds("전파기반본부").sort(), [1, 2, 3]);
  assert.deepEqual(suggestIds("검사기획팀, 검사관리팀").sort(), [1, 2]);
});

test("빈 글·관련 없는 글은 후보가 없다", () => {
  assert.deepEqual(matchTeam("", TEAMS), { kind: "none" });
  assert.deepEqual(matchTeam("   ", TEAMS), { kind: "none" });
  assert.deepEqual(matchTeam("재무회계", TEAMS), { kind: "none" });
});

test("정규화하면 같은 이름이 둘이면 자동 확정하지 않는다", () => {
  const dup = [T(20, "A팀", "가본부"), T(21, "a 팀", "나본부")];
  assert.equal(matchTeam("A팀", dup).kind, "suggest");
});

test("teamLabel: 팀명 (본부)", () => {
  assert.equal(teamLabel(T(2, "검사기획팀", "전파기반본부")), "검사기획팀 (전파기반본부)");
  assert.equal(teamLabel(T(2, "검사기획팀", null)), "검사기획팀");
});
